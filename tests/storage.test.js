/* Pruebas de persistencia: guardar y volver a leer (como al recargar la página),
 * conflictos entre pestañas, datos dañados, falta de espacio, copias de seguridad
 * y migración desde la versión anterior. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const { cargar, base, snap, datosLegadoV3 } = require('./helpers');
const M = cargar('util.js', 'domain.js', 'seed.js', 'storage.js');
const { D, U, Storage } = M;

const nuevoIDB = () => new IDBFactory();
const store = (idb) => Storage.crearStore(Storage.idbBackend(idb), {});

test('persistencia: lo guardado se recupera igual al recargar', async () => {
  const idb = nuevoIDB();
  const { S } = base(M);
  const s1 = store(idb);
  const v = await s1.save('local', S, null);
  assert.equal(v, 1);
  const s2 = store(idb); // "recarga": nueva instancia sobre la misma base
  const r = await s2.load('local');
  assert.equal(r.version, 1);
  assert.equal(snap(r.state), snap(S));
  assert.equal(await s2.load('otro'), null, 'un espacio inexistente devuelve null (no datos de ejemplo)');
});

test('conflicto entre pestañas: no se pisan los datos', async () => {
  const idb = nuevoIDB();
  const { S, u, p } = base(M);
  await store(idb).save('local', S, null);
  const a = store(idb), b = store(idb);
  const ra = await a.load('local'), rb = await b.load('local');
  const A = D.tx(ra.state, (d) => D.ajustarStock(d, u.admin, { pid: p.yerba.id, tipo: 'conteo', cant: 11, motivo: 'pestaña A' })).state;
  const B = D.tx(rb.state, (d) => D.ajustarStock(d, u.admin, { pid: p.yerba.id, tipo: 'conteo', cant: 99, motivo: 'pestaña B' })).state;
  assert.equal(await a.save('local', A, ra.version), 2);
  await assert.rejects(() => b.save('local', B, rb.version), (e) => e instanceof Storage.ConflictError);
  const r = await store(idb).load('local');
  assert.equal(r.state.productos.find((x) => x.id === p.yerba.id).stock, 11, 'quedó el cambio de A');
});

test('datos dañados: se informa el error y no se reemplazan', async () => {
  const idb = nuevoIDB();
  const s = store(idb);
  const { S } = base(M);
  const roto = U.clone(S); roto.ventas = 'no es una lista';
  await s.save('local', roto, null);
  await assert.rejects(() => s.load('local'), (e) => e instanceof Storage.StorageError && /dañados/.test(e.message));
  const rec = await Storage.idbBackend(idb).get('local');
  assert.equal(rec.state.ventas, 'no es una lista', 'el registro original sigue ahí para recuperarlo');
});

test('sin espacio: el error se muestra y lo anterior queda intacto', async () => {
  const mem = new Map(); let lleno = false;
  const ls = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i], getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { if (lleno) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) };
  const s = Storage.crearStore(Storage.lsBackend(ls), {});
  const { S, u, p } = base(M);
  await s.save('local', S, null);
  lleno = true;
  const S2 = D.tx(S, (d) => D.ajustarStock(d, u.admin, { pid: p.yerba.id, tipo: 'conteo', cant: 1, motivo: 'x' })).state;
  await assert.rejects(() => s.save('local', S2, 1), (e) => e instanceof Storage.StorageError && /espacio/.test(e.message));
  const r = await s.load('local');
  assert.equal(r.state.productos.find((x) => x.id === p.yerba.id).stock, 20);
});

test('copias automáticas: una por día y antes de operaciones delicadas', async () => {
  const idb = nuevoIDB(); const s = store(idb);
  const { S } = base(M);
  await s.save('local', S, null);
  await s.save('local', S, 1);
  let list = await s.snapList('local');
  assert.equal(list.length, 1, 'una copia automática por día');
  for (let i = 0; i < 10; i++) await s.snapshot('local', S, 'Antes de restaurar');
  list = await s.snapList('local');
  assert.ok(list.length <= 7, 'se conservan las últimas 7');
  const full = await s.snapGet(list[0].id);
  assert.equal(snap(full.state), snap(S));
});

test('copia de seguridad: se verifica con SHA-256 y detecta alteraciones', async () => {
  const { S } = base(M);
  const b = await Storage.crearBackup(S, S.workspace);
  const ok = await Storage.leerBackup(JSON.stringify(b));
  assert.ok(ok.ok); assert.equal(snap(ok.estado), snap(S));
  const t = JSON.parse(JSON.stringify(b)); t.estado.productos[0].precio = 1;
  const mal = await Storage.leerBackup(JSON.stringify(t));
  assert.ok(!mal.ok && /alterada/.test(mal.errores[0]));
  assert.ok(!(await Storage.leerBackup('{no es json')).ok);
  assert.ok(!(await Storage.leerBackup(JSON.stringify({ hola: 1 }))).ok);
});

test('migración: datos de la versión anterior sin pérdidas ni CAE inventados', () => {
  const old = datosLegadoV3();
  assert.equal(old.v, 3);
  const S = Storage.migrarLegado(old);
  assert.deepEqual(Storage.validarEstado(S), []);
  assert.equal(S.ventas.length, old.ventas.length);
  assert.equal(S.productos.length, old.productos.length);
  assert.equal(S.compras.length, old.compras.length);
  assert.equal(S.gastos.length, old.gastos.length);
  assert.ok(S.ventas.every((v) => !v.cae && Math.abs(U.sum(v.pagos, 'monto') - v.total) < 0.011));
  assert.ok(S.ventas.some((v) => v.fiscal.legado && v.fiscal.legado.caeSimulado), 'el CAE simulado queda solo como referencia');
  // Kardex reconstruido: cierra con el stock actual de cada producto
  for (const p of S.productos) { const ms = S.movimientos.filter((m) => m.pid === p.id); if (ms.length) assert.equal(ms.at(-1).despues, U.r3(p.stock)); }
  // El saldo de clientes y proveedores se conserva
  const oldSaldoProv = (id) => U.r2(U.sum(old.compras.filter((c) => c.provId === id && c.cond === 'cc'), 'total') - U.sum(old.pagos.filter((p) => p.provId === id), 'monto'));
  old.proveedores.forEach((p) => assert.equal(D.saldoProv(S, p.id), oldSaldoProv(p.id)));
  // También se puede restaurar un archivo crudo de la versión anterior
  return Storage.leerBackup(JSON.stringify(old)).then((r) => assert.ok(r.ok && r.origen === 'version-anterior'));
});
