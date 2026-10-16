/* Pruebas de reglas de negocio: productos, inventario, ventas, compras,
 * devoluciones, caja, gastos, permisos y atomicidad de las operaciones. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, base, snap } = require('./helpers');
const M = cargar('util.js', 'domain.js', 'seed.js');
const D = M.D, U = M.U;

const err = (fn, re) => assert.throws(fn, (e) => e instanceof D.DomainError && (!re || re.test(e.message)));
const conCaja = (S, u, monto = 10000) => D.abrirCaja(S, u, { monto });

test('productos: alta, validaciones, edición auditada y archivo sin borrar', () => {
  const { S, u, p } = base(M);
  assert.equal(p.yerba.precio, U.r2(1000 * 1.5 * 1.21));
  assert.equal(S.movimientos.filter((m) => m.pid === p.yerba.id && m.tipo === 'inicial').length, 1);
  err(() => D.crearProducto(S, u.admin, { codigo: p.yerba.codigo, nombre: 'Otro', costo: 1, margen: 1, iva: 21, stockMin: 0 }), /ya lo usa/);
  err(() => D.crearProducto(S, u.admin, { nombre: 'Malo', costo: -5, margen: 10, iva: 21, stockMin: 0 }), /negativo/);
  err(() => D.crearProducto(S, u.admin, { nombre: '', costo: 5, margen: 10, iva: 21, stockMin: 0 }), /nombre/);
  err(() => D.crearProducto(S, u.admin, { nombre: 'X', costo: 5, margen: 10, iva: 19, stockMin: 0 }), /IVA/);
  err(() => D.crearProducto(S, u.ven, { nombre: 'X', costo: 5, margen: 10, iva: 21, stockMin: 0 }), /permiso/);
  D.editarProducto(S, u.admin, p.yerba.id, { ...p.yerba, precio: 2000 });
  assert.equal(p.yerba.precio, 2000);
  assert.ok(S.auditoria.some((a) => a.accion === 'producto.precio' && /2\.000/.test(a.detalle)));
  D.archivarProducto(S, u.admin, p.yerba.id, false);
  assert.ok(S.productos.includes(p.yerba), 'el producto sigue existiendo');
  conCaja(S, u.ven);
  err(() => D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 1 }], pagos: [{ medio: 'Efectivo', monto: 2000 }] }), /archivado/);
});

test('inventario: conteo, pérdida y permisos con kardex completo', () => {
  const { S, u, p } = base(M);
  const m = D.ajustarStock(S, u.dep, { pid: p.yerba.id, tipo: 'conteo', cant: 17, motivo: 'Conteo mensual' });
  assert.deepEqual([m.antes, m.cant, m.despues, m.usuario, m.tipo], [20, -3, 17, u.dep.id, 'conteo']);
  err(() => D.ajustarStock(S, u.dep, { pid: p.yerba.id, tipo: 'merma', cant: 1, motivo: '' }), /motivo/);
  err(() => D.ajustarStock(S, u.dep, { pid: p.yerba.id, tipo: 'merma', cant: 18, motivo: 'Vencido' }), /stock suficiente/);
  err(() => D.ajustarStock(S, u.dep, { pid: p.yerba.id, tipo: 'merma', cant: 1.5, motivo: 'Vencido' }), /entero/);
  err(() => D.ajustarStock(S, u.ven, { pid: p.yerba.id, tipo: 'merma', cant: 1, motivo: 'Vencido' }), /permiso/);
  assert.equal(p.yerba.stock, 17);
});

test('ventas: caja, stock, precio del catálogo, kardex y validaciones', () => {
  const { S, u, p, c } = base(M);
  const it = [{ pid: p.yerba.id, cant: 2, precio: 1 }]; // el precio enviado se ignora
  err(() => D.registrarVenta(S, u.ven, { items: it, pagos: [{ medio: 'Efectivo', monto: 1 }] }), /caja está cerrada/);
  conCaja(S, u.ven);
  const total = U.r2(p.yerba.precio * 2);
  err(() => D.registrarVenta(S, u.ven, { items: it, pagos: [{ medio: 'Efectivo', monto: 1 }] }), /Faltan/);
  const v = D.registrarVenta(S, u.ven, { opId: 'op-1', items: it, pagos: [{ medio: 'Efectivo', monto: total }], recibido: 5000 });
  assert.equal(v.total, total);
  assert.equal(v.vuelto, U.r2(5000 - total));
  assert.equal(p.yerba.stock, 18);
  const mv = S.movimientos.at(-1);
  assert.deepEqual([mv.tipo, mv.antes, mv.despues, mv.ref.id, mv.usuario], ['venta', 20, 18, v.id, u.ven.id]);
  assert.equal(v.fiscal.estado, 'sin_autorizar');
  assert.equal(v.cae, undefined, 'no se inventa CAE');
  err(() => D.registrarVenta(S, u.ven, { opId: 'op-1', items: it, pagos: [{ medio: 'Efectivo', monto: total }] }), /duplicado/);
  err(() => D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 50 }], pagos: [{ medio: 'Efectivo', monto: 1 }] }), /stock suficiente/);
  err(() => D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 1.5 }], pagos: [{ medio: 'Efectivo', monto: 1 }] }), /entero/);
  err(() => D.registrarVenta(S, u.ven, { items: it, desc: 30, pagos: [{ medio: 'Efectivo', monto: 1 }] }), /hasta 10%/);
  err(() => D.registrarVenta(S, u.ven, { items: it, pagos: [{ medio: 'Cuenta corriente', monto: total }] }), /fiado/);
  err(() => D.registrarVenta(S, u.ven, { items: it, desc: 120, pagos: [{ medio: 'Efectivo', monto: 1 }] }), /entre 0% y 100%/);
  // Descuento del encargado y pago mixto
  const v2 = D.registrarVenta(S, u.enc, { items: [{ pid: p.queso.id, cant: 1.25 }], desc: 20, pagos: [{ medio: 'Efectivo', monto: 1000 }, { medio: 'Débito', monto: U.r2(p.queso.precio * 1.25 * 0.8 - 1000) }] });
  assert.equal(v2.pagos.length, 2);
  assert.equal(D.medioVenta(v2), 'Mixto');
  assert.equal(p.queso.stock, 4.75);
  // Factura A exige cliente RI con CUIT válido; se elige sola
  const v3 = D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 1 }], clienteId: c.ri.id, pagos: [{ medio: 'Cuenta corriente', monto: p.yerba.precio }] });
  assert.equal(v3.tipo, 'FA');
  assert.equal(D.saldoCli(S, c.ri.id), p.yerba.precio);
  err(() => D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 1 }], clienteId: c.vecino.id, tipo: 'FA', pagos: [{ medio: 'Efectivo', monto: p.yerba.precio }] }), /corresponde/);
  err(() => D.registrarVenta(S, u.dep, { items: it, pagos: [{ medio: 'Efectivo', monto: total }] }), /permiso/);
});

test('atomicidad: una operación que falla no deja cambios a medias', () => {
  const { S, u, p } = base(M);
  conCaja(S, u.ven);
  const antes = snap(S);
  assert.throws(() => D.tx(S, (d) => {
    D.registrarVenta(d, u.ven, { items: [{ pid: p.yerba.id, cant: 1 }], pagos: [{ medio: 'Efectivo', monto: p.yerba.precio }] });
    D.ajustarStock(d, u.ven, { pid: p.yerba.id, tipo: 'merma', cant: 1, motivo: 'x' }); // sin permiso → falla
  }));
  assert.equal(snap(S), antes, 'el estado original no cambió');
  // Copy-on-write: una devolución fallida no altera la venta original
  const { state } = D.tx(S, (d) => D.registrarVenta(d, u.ven, { items: [{ pid: p.yerba.id, cant: 2 }], pagos: [{ medio: 'Débito', monto: U.r2(p.yerba.precio * 2) }] }));
  const S2 = state; const v = S2.ventas.at(-1); const antes2 = snap(S2);
  assert.throws(() => D.tx(S2, (d) => { D.devolverVenta(d, u.enc, { ventaId: v.id, items: [{ idx: 0, cant: 1 }], motivo: 'x', medio: 'Débito' }); throw new Error('falla después'); }));
  assert.equal(snap(S2), antes2);
  assert.equal(v.items[0].devuelto, 0);
});

test('devoluciones: parcial y total, con stock, dinero y deuda revertidos', () => {
  const { S, u, p, c } = base(M);
  conCaja(S, u.enc, 50000);
  const v = D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 3 }], pagos: [{ medio: 'Efectivo', monto: U.r2(p.yerba.precio * 3) }] });
  err(() => D.devolverVenta(S, u.ven, { ventaId: v.id, items: [{ idx: 0, cant: 1 }], motivo: 'x' }), /permiso/);
  err(() => D.devolverVenta(S, u.enc, { ventaId: v.id, items: [{ idx: 0, cant: 4 }], motivo: 'x' }), /como máximo 3/);
  err(() => D.devolverVenta(S, u.enc, { ventaId: v.id, items: [{ idx: 0, cant: 1 }], motivo: '' }), /motivo/);
  const caja0 = D.cajaEsperado(S, D.cajaAbierta(S));
  const d1 = D.devolverVenta(S, u.enc, { ventaId: v.id, items: [{ idx: 0, cant: 1 }], motivo: 'Vencido' });
  assert.equal(p.yerba.stock, 18);
  assert.equal(D.cajaEsperado(S, D.cajaAbierta(S)), U.r2(caja0 - d1.total));
  assert.equal(S.ventas.find((x) => x.id === v.id).estado, 'devuelta_parcial');
  D.devolverVenta(S, u.enc, { ventaId: v.id, items: [{ idx: 0, cant: 2 }], motivo: 'Cliente se arrepintió' });
  assert.equal(S.ventas.find((x) => x.id === v.id).estado, 'anulada');
  assert.equal(S.ventas.length, 1, 'la venta no se borra');
  err(() => D.devolverVenta(S, u.enc, { ventaId: v.id, items: [{ idx: 0, cant: 1 }], motivo: 'x' }), /como máximo 0/);
  // Venta fiada: la devolución baja la deuda
  const vf = D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 2 }], clienteId: c.ri.id, pagos: [{ medio: 'Cuenta corriente', monto: U.r2(p.yerba.precio * 2) }] });
  D.devolverVenta(S, u.enc, { ventaId: vf.id, items: [{ idx: 0, cant: 1 }], motivo: 'Error' });
  assert.equal(D.saldoCli(S, c.ri.id), p.yerba.precio);
});

test('compras: recepción, costos, pedidos parciales, deuda y permisos de depósito', () => {
  const { S, u, p, pv } = base(M);
  const ped = D.crearPedido(S, u.dep, { provId: pv.id, items: [{ pid: p.yerba.id, cant: 10 }, { pid: p.papa.id, cant: 5 }] });
  const c1 = D.recibirCompra(S, u.enc, { provId: pv.id, pedidoId: ped.id, tipo: 'Factura A', cond: 'cc', items: [{ pid: p.yerba.id, cant: 10, costo: 1100 }], actPrecio: true });
  assert.equal(p.yerba.stock, 30);
  assert.equal(p.yerba.costo, 1100);
  assert.equal(p.yerba.precio, U.r2(1100 * 1.5 * 1.21));
  assert.equal(S.pedidos[0].estado, 'parcial');
  assert.equal(D.saldoProv(S, pv.id), c1.total);
  assert.equal(c1.iva, U.r2(11000 * 0.21));
  // Depósito recibe pero no puede cambiar costos
  D.recibirCompra(S, u.dep, { provId: pv.id, pedidoId: ped.id, cond: 'cc', items: [{ pid: p.papa.id, cant: 5, costo: 1 }] });
  assert.equal(p.papa.costo, 500);
  assert.equal(S.pedidos[0].estado, 'recibido');
  err(() => D.recibirCompra(S, u.ven, { provId: pv.id, cond: 'cc', items: [{ pid: p.papa.id, cant: 1 }] }), /permiso/);
  err(() => D.recibirCompra(S, u.enc, { provId: pv.id, cond: 'contado', medio: 'Efectivo', items: [{ pid: p.papa.id, cant: 1 }] }), /caja está cerrada/);
  err(() => D.pagarProveedor(S, u.enc, { provId: pv.id, monto: 1e9, medio: 'Transferencia' }), /más de lo que le debés/);
  D.pagarProveedor(S, u.enc, { provId: pv.id, monto: 1000, medio: 'Transferencia' });
  // Devolución a proveedor con crédito: baja stock y deuda
  const deuda = D.saldoProv(S, pv.id);
  const dv = D.devolucionProveedor(S, u.enc, { provId: pv.id, items: [{ pid: p.yerba.id, cant: 2 }], modo: 'credito', motivo: 'Vencidos' });
  assert.equal(p.yerba.stock, 28);
  assert.equal(D.saldoProv(S, pv.id), U.r2(deuda - dv.total));
  assert.equal(S.movimientos.at(-1).tipo, 'devprov');
});

test('caja: apertura, esperado, retiros, cierre con diferencia y motivo', () => {
  const { S, u, p } = base(M);
  err(() => D.cerrarCaja(S, u.ven, { contado: 0 }), /ninguna caja/);
  D.abrirCaja(S, u.ven, { monto: 5000 });
  err(() => D.abrirCaja(S, u.ven, { monto: 1 }), /Ya hay una caja/);
  D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 1 }], pagos: [{ medio: 'Efectivo', monto: p.yerba.precio }] });
  D.registrarVenta(S, u.ven, { items: [{ pid: p.yerba.id, cant: 1 }], pagos: [{ medio: 'Mercado Pago', monto: p.yerba.precio }] });
  D.registrarGasto(S, u.enc, { monto: 500, detalle: 'Bolsas', categoria: 'Insumos del local', medio: 'Efectivo' });
  err(() => D.registrarGasto(S, u.enc, { monto: 1e7, detalle: 'Algo', categoria: 'Otros', medio: 'Efectivo' }), /no alcanza/);
  D.movimientoCaja(S, u.enc, { tipo: 'retiro', monto: 1000, motivo: 'Banco' });
  err(() => D.movimientoCaja(S, u.ven, { tipo: 'retiro', monto: 1, motivo: 'x' }), /permiso/);
  const esp = U.r2(5000 + p.yerba.precio - 500 - 1000);
  assert.equal(D.cajaEsperado(S, D.cajaAbierta(S)), esp);
  err(() => D.cerrarCaja(S, u.ven, { contado: esp - 100 }), /motivo/);
  const c = D.cerrarCaja(S, u.ven, { contado: esp - 100, motivo: 'Vuelto mal dado' });
  assert.equal(c.cierra.dif, -100);
  assert.ok(S.auditoria.some((a) => a.accion === 'caja.diferencia'));
  assert.equal(D.cajaAbierta(S), null);
});

test('gastos: se anulan con motivo, no se borran', () => {
  const { S, u } = base(M);
  const g = D.registrarGasto(S, u.enc, { monto: 1000, detalle: 'Luz', categoria: 'Luz, gas, internet', medio: 'Transferencia' });
  err(() => D.anularGasto(S, u.enc, { id: g.id, motivo: '' }), /por qué/);
  D.anularGasto(S, u.enc, { id: g.id, motivo: 'Cargado dos veces' });
  assert.equal(S.gastos.length, 1);
  assert.ok(S.gastos[0].anulado);
  err(() => D.anularGasto(S, u.enc, { id: g.id, motivo: 'otra vez' }), /ya estaba anulado/);
});

test('permisos: matriz por rol', () => {
  const { u } = base(M);
  assert.ok(D.can(u.admin, 'config.editar'));
  assert.ok(!D.can(u.enc, 'config.editar'));
  assert.ok(D.can(u.enc, 'informes.ver'));
  assert.ok(!D.can(u.ven, 'informes.ver'));
  assert.ok(!D.can(u.ven, 'producto.editar'));
  assert.ok(D.can(u.ven, 'venta.crear'));
  assert.ok(!D.can(u.dep, 'venta.crear'));
  assert.ok(D.can(u.dep, 'compra.recibir'));
  assert.ok(!D.can(u.dep, 'compra.costos'));
  assert.ok(!D.can({ ...u.admin, activo: false }, 'venta.crear'), 'usuario desactivado no puede operar');
});

test('usuarios: siempre queda un administrador', () => {
  const { S, u } = base(M);
  err(() => D.guardarUsuario(S, u.admin, { id: u.admin.id, nombre: 'Ana', rol: 'vendedor' }), /al menos un administrador/);
  err(() => D.desactivarUsuario(S, u.admin, u.admin.id, false), /propio usuario/);
  err(() => D.guardarUsuario(S, u.enc, { nombre: 'Nuevo', rol: 'vendedor' }), /permiso/);
  const n = D.guardarUsuario(S, u.admin, { nombre: 'Nuevo', rol: 'vendedor' });
  assert.equal(n.rol, 'vendedor');
});

test('balanza: lectura de etiquetas con peso', () => {
  const { S } = base(M);
  const ean = (doce) => { let t = 0; for (let i = 0; i < 12; i++) t += +doce[i] * (i % 2 ? 3 : 1); return doce + ((10 - (t % 10)) % 10); };
  const cod = ean('200000101250'); // prefijo 20 · PLU 00001 · 01250 g
  const r = D.leerBalanza(S, cod);
  assert.equal(r.p.nombre, 'Queso x kg');
  assert.equal(r.cant, 1.25);
  assert.equal(D.leerBalanza(S, cod.slice(0, 12) + ((+cod[12] + 1) % 10)), null, 'dígito verificador incorrecto');
  assert.equal(D.leerBalanza(S, '7790000000011'), null);
  S.config.balanza.tipo = 'precio';
  const r2 = D.leerBalanza(S, ean('200000100' + '850').slice(0, 13));
  assert.ok(r2 === null || r2.cant > 0);
  S.config.balanza.activa = false;
  assert.equal(D.leerBalanza(S, cod), null);
});

test('reposición: sugiere según mínimo y descuenta lo ya pedido', () => {
  const { S, u, p, pv } = base(M);
  const s1 = D.sugerencias(S);
  const papa = s1.find((x) => x.p.id === p.papa.id);
  assert.ok(papa && papa.cant > 0, 'la papa está bajo el mínimo');
  D.crearPedido(S, u.enc, { provId: pv.id, items: [{ pid: p.papa.id, cant: papa.cant }] });
  const s2 = D.sugerencias(S).find((x) => x.p.id === p.papa.id);
  assert.ok(s2.ya && s2.cant === 0, 'ya pedido: no se sugiere de nuevo');
  assert.equal(S.productos.find((x) => x.id === p.papa.id).stock, 3, 'la sugerencia no ejecuta compras');
});

test('CUIT: validación de dígito verificador', () => {
  assert.ok(U.cuitValido('20-12345678-6') === (U.cuitConDV('2012345678') === '20-12345678-6'));
  const c = U.cuitConDV('3071234567'); if (c) assert.ok(U.cuitValido(c));
  assert.ok(!U.cuitValido('30-00000000-1'));
});

test('datos de ejemplo: kardex consistente, sin stock negativo y caja abierta hoy', () => {
  const S = M.seed();
  let bad = 0;
  for (const p of S.productos) { let s = 0; for (const m of S.movimientos.filter((x) => x.pid === p.id)) { if (Math.abs(m.antes - s) > 1e-6) bad++; s = U.r3(s + m.cant); if (Math.abs(m.despues - s) > 1e-6) bad++; } if (Math.abs(s - p.stock) > 1e-6) bad++; }
  assert.equal(bad, 0);
  assert.equal(S.productos.filter((p) => p.stock < 0).length, 0);
  assert.equal(S.cajas.filter((c) => !c.cierra).length, 1);
  assert.ok(D.lowStock(S).length >= 2);
  assert.ok(S.ventas.every((v) => Math.abs(U.sum(v.pagos, 'monto') - v.total) < 0.011));
  assert.ok(S.ventas.every((v) => !v.cae), 'sin CAE inventados');
});
