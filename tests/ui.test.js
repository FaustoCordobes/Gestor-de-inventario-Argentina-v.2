/* Pruebas de la interfaz en un navegador simulado (jsdom + IndexedDB simulada):
 * arranque, todas las pantallas, venta con teclado y lectora, persistencia al
 * recargar, permisos por rol, caja, devoluciones, copias de seguridad y errores
 * de guardado. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
const SCRIPTS = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => fs.readFileSync(path.join(ROOT, m[1]), 'utf8'));
const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Abre la app. Pasar el mismo idb simula recargar la página. */
async function abrir(idb, opts = {}) {
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://mostrador.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.indexedDB = idb; w.IDBKeyRange = require('fake-indexeddb').IDBKeyRange;
  Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  w.structuredClone = globalThis.structuredClone; w.scrollTo = () => {}; w.print = () => { w.__impreso = (w.__impreso || 0) + 1; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.console.error = () => {};
  if (opts.antes) opts.antes(w);
  SCRIPTS.forEach((code) => w.eval(code));
  for (let i = 0; i < 200 && !(w.M.UI.APP.S && w.document.querySelector('#main h1')); i++) await espera(10);
  return w;
}
const $ = (w, s) => w.document.querySelector(s);
/** Espera a que termine de guardarse la operación en curso. */
const listo = async (w) => { await espera(15); for (let i = 0; i < 300 && w.M.UI.APP.busy; i++) await espera(10); await espera(5); };
const click = async (w, s) => { const el = typeof s === 'string' ? $(w, s) : s; if (!el) throw new Error('No existe ' + s); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await listo(w); };
const key = async (w, k, target, extra = {}) => { (target || w.document.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })); await espera(2); if (k.length > 1) await listo(w); };
const escribir = async (w, sel, val) => { const el = $(w, sel); el.value = val; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); await espera(10); };
const enviar = async (w, sel) => { $(w, sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await listo(w); };

test('arranque: crea la demostración y muestra todas las pantallas sin errores', async () => {
  const idb = new IDBFactory(); const w = await abrir(idb);
  const errores = []; w.addEventListener('error', (e) => errores.push(e.message));
  const { APP } = w.M.UI;
  assert.equal(APP.ws, 'demo'); assert.equal(APP.S.workspace.modo, 'demo');
  assert.ok($(w, '#demo-strip') && !$(w, '#demo-strip').hidden);
  for (const v of ['inicio', 'vender', 'mercaderia', 'caja', 'proveedores', 'clientes', 'informes', 'config']) { w.M.UI.go(v); await espera(5); assert.ok($(w, '#main h1'), v); }
  for (const [v, t] of [['mercaderia', 'llego'], ['mercaderia', 'pedidos'], ['mercaderia', 'falta'], ['mercaderia', 'movimientos'], ['caja', 'gastos'], ['caja', 'cierres'], ['informes', 'inventario'], ['informes', 'diferencias'], ['informes', 'pendientes'], ['informes', 'contador'], ['config', 'ventas'], ['config', 'usuarios'], ['config', 'datos'], ['config', 'nube'], ['config', 'auditoria']]) { w.M.UI.go(v, t); await espera(5); assert.ok($(w, '#main h1'), v + '/' + t); }
  for (const t of ['dia', 'semana', 'anio']) { w.M.UI.go('informes', 'historial'); await click(w, `[data-act="hptipo"][data-t="${t}"]`); assert.ok($(w, '.chart svg')); }
  assert.deepEqual(errores, []);
  assert.ok(!w.document.body.innerHTML.match(/CAE N°/), 'no aparece ningún CAE');
});

test('venta con teclado y lectora: se cobra, descuenta stock y persiste al recargar', async () => {
  const idb = new IDBFactory(); let w = await abrir(idb);
  const { APP } = w.M.UI; const D = w.M.D;
  w.M.UI.go('vender'); await espera(10);
  const yerba = APP.S.productos.find((p) => p.nombre.startsWith('Yerba')); const st0 = yerba.stock;
  // Lectora: teclas rápidas + Enter con el foco fuera del buscador
  w.document.body.focus();
  for (const ch of yerba.codigo) await key(w, ch, w.document.body);
  await key(w, 'Enter', w.document.body);
  assert.equal($(w, '#pos-cart').querySelectorAll('.cl').length, 1, 'la lectora agregó el producto');
  // Buscador + flechas + Enter
  await escribir(w, '#pos-q', 'fide'); await key(w, 'Enter', $(w, '#pos-q'));
  await enviar(w, '[data-form="scan"]');
  assert.equal($(w, '#pos-cart').querySelectorAll('.cl').length, 2);
  // + suma al último, F6 cambia forma de pago, F9 cobra
  await key(w, '+'); await key(w, 'F6'); assert.equal(APP.S && $(w, '[data-act="posmedio"][aria-pressed="true"]').dataset.m, 'Débito');
  const nVentas = APP.S.ventas.length;
  await key(w, 'F9'); await espera(80);
  assert.equal(APP.S.ventas.length, nVentas + 1);
  const v = APP.S.ventas.at(-1);
  assert.equal(v.pagos[0].medio, 'Débito'); assert.equal(v.items.length, 2);
  assert.equal(D.prod(APP.S, yerba.id).stock, st0 - 1);
  assert.equal(v.fiscal.estado, 'sin_autorizar'); assert.equal(v.cae, undefined);
  assert.ok($(w, '[data-act="nuevaventa"]'), 'se muestra la venta registrada');
  // Doble cobro: el mismo opId no se registra dos veces
  const op = v.opId; const r = w.M.D.tx(APP.S, (d) => { try { w.M.D.registrarVenta(d, APP.S.usuarios[0], { opId: op, items: [{ pid: yerba.id, cant: 1 }], pagos: [{ medio: 'Débito', monto: yerba.precio }] }); return 'ok'; } catch (e) { return e.code; } });
  assert.equal(r.result, 'duplicado');
  // Recargar la página: la venta sigue ahí
  w.close(); w = await abrir(idb);
  assert.equal(w.M.UI.APP.S.ventas.length, nVentas + 1);
  assert.equal(w.M.D.prod(w.M.UI.APP.S, yerba.id).stock, st0 - 1);
});

test('venta en efectivo con vuelto, pago dividido y balanza', async () => {
  const w = await abrir(new IDBFactory()); const { APP } = w.M.UI;
  w.M.UI.go('vender'); await espera(10);
  const queso = APP.S.productos.find((p) => p.plu === '00001');
  // Etiqueta de balanza: 20 + PLU 00001 + 00750 g
  const doce = '200000100750'; let t = 0; for (let i = 0; i < 12; i++) t += +doce[i] * (i % 2 ? 3 : 1); const ean = doce + ((10 - (t % 10)) % 10);
  await escribir(w, '#pos-q', ean); await enviar(w, '[data-form="scan"]');
  assert.ok($(w, '#pos-cart').textContent.includes(queso.nombre));
  assert.equal(+$(w, '#cant-0').value, 0.75);
  await click(w, '[data-act="pospaga"]:last-of-type');
  assert.ok($(w, '.vuelto'), 'muestra el vuelto');
  await click(w, '[data-act="cobrar"]'); await espera(60);
  const v = APP.S.ventas.at(-1); assert.ok(v.vuelto > 0); assert.equal(v.items[0].cant, 0.75);
  await click(w, '[data-act="nuevaventa"]');
  // Pago dividido
  const yerba = APP.S.productos.find((p) => p.nombre.startsWith('Yerba'));
  await click(w, `[data-act="posadd"][data-id="${yerba.id}"]`);
  await key(w, 'F7');
  await escribir(w, '#sp-v-0', '1000'); await click(w, '[data-act="spfill"]');
  await click(w, '[data-act="cobrar"]'); await espera(60);
  const v2 = APP.S.ventas.at(-1); assert.equal(v2.pagos.length, 2); assert.equal(v2.pagos[0].monto, 1000);
});

test('roles: el vendedor no ve informes ni edita productos; el depósito no vende', async () => {
  const w = await abrir(new IDBFactory()); const { APP } = w.M.UI;
  const ven = APP.S.usuarios.find((u) => u.rol === 'vendedor');
  await click(w, '[data-act="usuario"]'); await click(w, `[data-act="elegirusr"][data-id="${ven.id}"]`);
  assert.equal(APP.userId, ven.id);
  assert.ok(!$(w, '#nav [data-v="informes"]'), 'sin informes en el menú');
  w.M.UI.go('informes'); await espera(5); assert.equal(APP.view, 'inicio', 'no puede entrar a informes');
  w.M.UI.go('mercaderia'); await espera(5);
  assert.ok(!$(w, '[data-act="prodnew"]'));
  const p = APP.S.productos[0];
  const r = await w.M.UI.run((s, u) => w.M.D.editarProducto(s, u, p.id, { ...p, precio: 1 }));
  assert.equal(r, undefined); assert.notEqual(w.M.D.prod(APP.S, p.id).precio, 1, 'la regla de negocio lo bloquea aunque se llame directo');
  assert.ok(!$(w, '#toast').hidden && /permiso/.test($(w, '#toast').textContent));
  const dep = APP.S.usuarios.find((u) => u.rol === 'deposito');
  await click(w, '[data-act="usuario"]'); await click(w, `[data-act="elegirusr"][data-id="${dep.id}"]`);
  assert.ok(!$(w, '#nav [data-v="vender"]'));
  w.M.UI.go('mercaderia', 'llego'); await espera(5); assert.ok($(w, '[data-act="llprov"]'), 'depósito recibe mercadería');
});

test('caja: cierre con diferencia pide motivo; devolución desde últimas ventas', async () => {
  const w = await abrir(new IDBFactory()); const { APP } = w.M.UI; const D = w.M.D;
  w.M.UI.go('caja'); await espera(5);
  await click(w, '[data-act="cierre"]');
  const esp = D.cajaEsperado(APP.S, D.cajaAbierta(APP.S));
  await escribir(w, '#ci-c', String(esp - 500));
  assert.ok(!$(w, '#ci-mot-f').hidden, 'aparece el campo motivo');
  await enviar(w, '[data-form="cierre"]');
  assert.ok(D.cajaAbierta(APP.S), 'sin motivo no cierra');
  await escribir(w, '#ci-mot', 'Se dio mal un vuelto'); await enviar(w, '[data-form="cierre"]');
  assert.equal(D.cajaAbierta(APP.S), null);
  assert.equal(APP.S.cajas.at(-1).cierra.dif, -500);
  // Con la caja cerrada no se puede vender
  w.M.UI.go('vender'); await espera(5); assert.ok($(w, '.cajacerrada'));
  await click(w, '[data-act="abrircaja"]'); await enviar(w, '[data-form="abrircaja"]'); assert.ok(D.cajaAbierta(APP.S));
  // Devolución de una venta con débito
  const v = APP.S.ventas.slice().reverse().find((x) => x.pagos[0].medio === 'Débito' && x.estado === 'ok');
  await key(w, 'F10'); assert.ok($(w, '#ult-list'));
  w.M.UI.verComprobante(v.id); await espera(5);
  assert.ok($(w, '.cbte-wm'), 'el comprobante muestra que no es válido como factura');
  await click(w, `[data-act="devolver"][data-id="${v.id}"]`);
  await escribir(w, '#dv-0', '1'); await click(w, `[data-act="dvok"][data-id="${v.id}"]`);
  await click(w, '[data-act="_confirmOk"]'); await espera(60);
  assert.equal(APP.S.devoluciones.at(-1).ventaId, v.id);
  assert.ok(APP.S.ventas.find((x) => x.id === v.id), 'la venta no se borró');
});

test('copias de seguridad: descargar, restaurar con confirmación y error de guardado sin pérdida', async () => {
  const idb = new IDBFactory(); const w = await abrir(idb); const { APP } = w.M.UI; const ST = w.M.Storage;
  const b = await ST.crearBackup(APP.S, APP.S.workspace); assert.ok(b.sha256.length === 64);
  const nVentas = APP.S.ventas.length;
  // Restaurar una copia modificada (menos ventas) → se pide escribir RESTAURAR
  const mod = JSON.parse(JSON.stringify(b)); mod.estado.ventas = mod.estado.ventas.slice(0, 10); mod.sha256 = await ST.crearBackup(mod.estado, mod.estado.workspace).then((x) => x.sha256);
  w.M.UI.go('config', 'datos'); await espera(20);
  const r = await ST.leerBackup(JSON.stringify(mod)); assert.ok(r.ok);
  // simula elegir archivo
  const file = $(w, '#bk-file'); Object.defineProperty(file, 'files', { value: [new w.File([JSON.stringify(mod)], 'copia.json')] }); file.dispatchEvent(new w.Event('change', { bubbles: true })); await espera(80);
  await click(w, '[data-act="bkrest"]');
  await click(w, '[data-act="_confirmOk"]'); assert.equal(APP.S.ventas.length, nVentas, 'sin escribir RESTAURAR no hace nada');
  await escribir(w, '#cf-txt', 'restaurar'); await click(w, '[data-act="_confirmOk"]'); await espera(80);
  assert.equal(APP.S.ventas.length, 10);
  const snaps = await APP.store.snapList(APP.ws); assert.ok(snaps.some((s) => /Antes de restaurar/.test(s.motivo)));
  // Error al guardar: la operación no se registra y se avisa
  const orig = APP.store.save; APP.store.save = async () => { throw new ST.StorageError('Disco lleno (simulado)'); };
  const g0 = APP.S.gastos.length;
  const res = await w.M.UI.run((s, u) => w.M.D.registrarGasto(s, u, { monto: 100, detalle: 'Prueba', categoria: 'Otros', medio: 'Transferencia' }));
  assert.equal(res, undefined); assert.equal(APP.S.gastos.length, g0);
  assert.ok(/No se pudo guardar/.test($(w, '#modal-card').textContent));
  assert.ok(/falló/.test($(w, '#banners').textContent));
  APP.store.save = orig;
});

test('mi negocio: se crea vacío, separado de la demo, y pide PIN', async () => {
  const idb = new IDBFactory(); let w = await abrir(idb); const { APP } = w.M.UI;
  w.M.UI.go('config', 'datos'); await espera(20);
  await click(w, '[data-act="wsnuevo"]');
  await escribir(w, '#w-n', 'Kiosco Prueba'); await escribir(w, '#w-u', 'Fausto'); await escribir(w, '#w-p', '1234');
  await enviar(w, '[data-form="wsnuevo"]'); await espera(80);
  assert.equal(APP.ws, 'local'); assert.equal(APP.S.productos.length, 0); assert.equal(APP.S.config.nombre, 'Kiosco Prueba');
  assert.ok($(w, '.modechip.local'));
  // Al recargar en otra sesión pide el PIN
  w.close(); w = await abrir(idb, { antes: (win) => win.sessionStorage.clear() });
  assert.equal(w.M.UI.APP.ws, 'local');
  assert.ok(/¿Quién atiende\?/.test($(w, '#modal-card').textContent));
  const u = w.M.UI.APP.S.usuarios[0];
  await click(w, `[data-act="elegirusr"][data-id="${u.id}"]`);
  await escribir(w, '#pin-in', '0000'); await enviar(w, '[data-form="pin"]'); await espera(40);
  assert.equal(w.M.UI.APP.userId, null, 'PIN incorrecto no entra');
  await escribir(w, '#pin-in', '1234'); await enviar(w, '[data-form="pin"]'); await espera(40);
  assert.equal(w.M.UI.APP.userId, u.id);
  // La demo sigue intacta
  const demo = await w.M.UI.APP.store.load('demo'); assert.ok(demo.state.ventas.length > 1000);
});

test('ticket térmico: se arma en 58 y 80 mm sin CAE', async () => {
  const w = await abrir(new IDBFactory()); const { APP } = w.M.UI; const T = w.M.Ticket;
  const v = APP.S.ventas.at(-1);
  const h80 = T.ticketHTML(v, APP.S, 80), h58 = T.ticketHTML(v, APP.S, 58);
  assert.ok(/tk w80/.test(h80) && /tk w58/.test(h58));
  assert.ok(/No válido como factura/.test(h80));
  assert.ok(!/CAE \d/.test(h80));
  APP.puedeImprimir = true; T.imprimirVenta(v); await espera(80); assert.equal(w.__impreso, 1);
  assert.ok($(w, '#print-area .tk'));
});
