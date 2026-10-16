/* Pruebas de la base de datos del modo empresa (supabase/schema.sql) en
 * PostgreSQL real (PGlite): aislamiento entre empresas, permisos por rol en la
 * base, ventas atómicas e idempotentes, stock sin negativos, precios tomados de
 * la base, kardex y caja. Se simula el entorno de Supabase (auth.uid() y el rol
 * "authenticated"). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
const ARCA = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'arca.sql'), 'utf8');
const SUPABASE_STUB = `
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin; create role anon nologin; create role service_role nologin;
  grant usage on schema public to authenticated, anon; grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;`;

let db;
const U = { ana: crypto.randomUUID(), beto: crypto.randomUUID(), vale: crypto.randomUUID(), dani: crypto.randomUUID(), intruso: crypto.randomUUID() };
const E = {};
/** Ejecuta como un usuario con sesión iniciada (rol authenticated + auth.uid()). */
async function como(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const uno = async (uid, sql, params) => (await como(uid, sql, params)).rows[0];
const falla = async (uid, sql, params, re) => { await assert.rejects(() => como(uid, sql, params), (e) => (re ? re.test(e.message) : true)); };

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
  await db.exec(ARCA);
  // Empresa A (Ana admin, Vale vendedora, Dani depósito) y empresa B (Beto admin)
  E.a = (await uno(U.ana, `select crear_empresa('Almacén A', 'RI', 'Ana') as id`)).id;
  E.b = (await uno(U.beto, `select crear_empresa('Kiosco B', 'MONO', 'Beto') as id`)).id;
  await como(U.ana, `insert into miembros (empresa_id, user_id, rol, nombre) values ($1, $2, 'vendedor', 'Vale'), ($1, $3, 'deposito', 'Dani')`, [E.a, U.vale, U.dani]);
  E.prov = (await uno(U.ana, `insert into proveedores (empresa_id, nombre, plazo) values ($1, 'Distribuidora', 15) returning id`, [E.a])).id;
  E.yerba = (await uno(U.ana, `insert into productos (empresa_id, codigo, nombre, proveedor_id, costo, margen, iva, precio, stock_min) values ($1, '779001', 'Yerba 1 kg', $2, 1000, 50, 21, 1815, 5) returning id`, [E.a, E.prov])).id;
  E.papa = (await uno(U.ana, `insert into productos (empresa_id, codigo, nombre, unidad, costo, margen, iva, precio) values ($1, '200003', 'Papa x kg', 'kg', 500, 45, 10.5, 801.13) returning id`, [E.a])).id;
  E.bprod = (await uno(U.beto, `insert into productos (empresa_id, codigo, nombre, costo, margen, iva, precio) values ($1, 'B1', 'Alfajor', 300, 50, 21, 545) returning id`, [E.b])).id;
  await como(U.dani, `select recibir_compra($1, $2, $3::jsonb, 'Factura A', '0001-1', 'cc', null, true)`, [E.a, E.prov, JSON.stringify([{ producto_id: E.yerba, cant: 20, costo: 1 }, { producto_id: E.papa, cant: 10.5 }])]);
});

test('aislamiento: cada empresa ve solo sus datos', async () => {
  const a = await como(U.ana, 'select nombre from productos'); assert.deepEqual(a.rows.map((r) => r.nombre).sort(), ['Papa x kg', 'Yerba 1 kg']);
  const b = await como(U.beto, 'select nombre from productos'); assert.deepEqual(b.rows.map((r) => r.nombre), ['Alfajor']);
  assert.equal((await como(U.intruso, 'select * from productos')).rows.length, 0, 'alguien sin empresa no ve nada');
  assert.equal((await como(U.beto, 'select * from empresas')).rows.length, 1);
  // Beto no puede operar sobre la empresa A aunque conozca los ids
  await falla(U.beto, `select ajustar_stock($1, $2, 'conteo', 0, 'x')`, [E.a, E.yerba], /permiso/);
  await falla(U.beto, `insert into productos (empresa_id, codigo, nombre, precio) values ($1, 'X', 'X', 1)`, [E.a]);
  const upd = await como(U.beto, `update productos set precio = 1 where id = $1`, [E.yerba]); assert.equal(upd.affectedRows, 0);
});

test('stock: solo cambia por las funciones y queda en el kardex', async () => {
  const p = await uno(U.ana, 'select stock, costo from productos where id = $1', [E.yerba]);
  assert.equal(+p.stock, 20); assert.equal(+p.costo, 1000, 'el depósito no cambia costos');
  await falla(U.ana, 'update productos set stock = 999 where id = $1', [E.yerba], /permission denied/);
  await falla(U.ana, 'insert into movimientos_stock (empresa_id, producto_id, tipo, cant, antes, despues) values ($1, $2, \'ajuste\', 1, 0, 1)', [E.a, E.yerba], /permission denied/);
  await falla(U.vale, `select ajustar_stock($1, $2, 'merma', 1, 'roto')`, [E.a, E.yerba], /permiso/);
  await falla(U.dani, `select ajustar_stock($1, $2, 'merma', 50, 'roto')`, [E.a, E.yerba], /stock suficiente/);
  await como(U.dani, `select ajustar_stock($1, $2, 'conteo', 19, 'Conteo mensual')`, [E.a, E.yerba]);
  const k = await como(U.ana, 'select tipo, cant, antes, despues, usuario from movimientos_stock where producto_id = $1 order by id', [E.yerba]);
  assert.deepEqual(k.rows.map((r) => [r.tipo, +r.cant, +r.antes, +r.despues]), [['compra', 20, 0, 20], ['conteo', -1, 20, 19]]);
  assert.equal(k.rows[1].usuario, U.dani);
});

test('ventas: atómicas, idempotentes, con precio de la base y sin stock negativo', async () => {
  await falla(U.vale, `select registrar_venta($1, $2, null, null, 0, '[{"producto_id":"${E.yerba}","cant":1}]', '[{"medio":"Efectivo","monto":1815}]')`, [E.a, crypto.randomUUID()], /caja/);
  await como(U.vale, 'select abrir_caja($1, 5000)', [E.a]);
  const op = crypto.randomUUID();
  const items = JSON.stringify([{ producto_id: E.yerba, cant: 2, precio: 1 }]);
  const id1 = (await uno(U.vale, `select registrar_venta($1, $2, null, null, 0, $3::jsonb, '[{"medio":"Efectivo","monto":3630}]') as id`, [E.a, op, items])).id;
  const v = await uno(U.ana, 'select total, tipo, nro, fiscal_estado, cae from ventas where id = $1', [id1]);
  assert.equal(+v.total, 3630, 'el precio enviado por el navegador se ignora'); assert.equal(v.tipo, 'FB'); assert.equal(v.fiscal_estado, 'sin_autorizar'); assert.equal(v.cae, null);
  // Reintento con el mismo op_id (doble clic o corte de conexión): misma venta, sin descontar de nuevo
  const id2 = (await uno(U.vale, `select registrar_venta($1, $2, null, null, 0, $3::jsonb, '[{"medio":"Efectivo","monto":3630}]') as id`, [E.a, op, items])).id;
  assert.equal(id2, id1);
  assert.equal(+(await uno(U.ana, 'select stock from productos where id = $1', [E.yerba])).stock, 17);
  // Falla a mitad (segundo producto sin stock): no queda nada registrado
  const antes = await uno(U.ana, 'select (select count(*) from ventas) v, (select count(*) from movimientos_stock) m, (select stock from productos where id = $1) s', [E.yerba]);
  await falla(U.vale, `select registrar_venta($1, $2, null, null, 0, $3::jsonb, '[{"medio":"Efectivo","monto":1}]')`, [E.a, crypto.randomUUID(), JSON.stringify([{ producto_id: E.yerba, cant: 1 }, { producto_id: E.papa, cant: 99 }])], /stock suficiente/);
  const despues = await uno(U.ana, 'select (select count(*) from ventas) v, (select count(*) from movimientos_stock) m, (select stock from productos where id = $1) s', [E.yerba]);
  assert.deepEqual(despues, antes, 'la venta fallida no dejó rastros');
  await falla(U.vale, `select registrar_venta($1, $2, null, null, 30, $3::jsonb, '[{"medio":"Efectivo","monto":1}]')`, [E.a, crypto.randomUUID(), items], /hasta 10/);
  await falla(U.vale, `select registrar_venta($1, $2, null, null, 0, $3::jsonb, '[{"medio":"Efectivo","monto":1}]')`, [E.a, crypto.randomUUID(), items], /no coinciden/);
  await falla(U.vale, `select registrar_venta($1, $2, null, null, 0, $3::jsonb, '[{"medio":"Efectivo","monto":2722.5}]')`, [E.a, crypto.randomUUID(), JSON.stringify([{ producto_id: E.yerba, cant: 1.5 }])], /por unidad/);
  await falla(U.dani, `select registrar_venta($1, $2, null, null, 0, $3::jsonb, '[{"medio":"Efectivo","monto":3630}]')`, [E.a, crypto.randomUUID(), items], /permiso/);
  // Los vendedores no pueden insertar ventas a mano
  await falla(U.vale, `insert into ventas (empresa_id, op_id, nro, usuario, tipo, total, neto, iva, costo) values ($1, gen_random_uuid(), 999, $2, 'TK', 1, 1, 0, 0)`, [E.a, U.vale], /permission denied/);
});

test('devoluciones y caja: reversión auditable y arqueo con motivo', async () => {
  const v = await uno(U.ana, 'select id from ventas order by nro limit 1');
  await falla(U.vale, `select devolver_venta($1, $2, '[{"idx":0,"cant":1}]', 'x', 'Efectivo')`, [E.a, v.id], /permiso/);
  await falla(U.ana, `select devolver_venta($1, $2, '[{"idx":0,"cant":5}]', 'x', 'Efectivo')`, [E.a, v.id], /como máximo 2/);
  await como(U.ana, `select devolver_venta($1, $2, '[{"idx":0,"cant":1}]', 'Vencido', 'Efectivo')`, [E.a, v.id]);
  const r = await uno(U.ana, 'select estado, (select stock from productos where id = $2) stock from ventas where id = $1', [v.id, E.yerba]);
  assert.equal(r.estado, 'devuelta_parcial'); assert.equal(+r.stock, 18);
  const caja = await uno(U.ana, 'select id from cajas where cierra_fecha is null');
  const esp = +(await uno(U.ana, 'select caja_esperado($1) e', [caja.id])).e;
  assert.equal(esp, 5000 + 3630 - 1815);
  await falla(U.vale, 'select cerrar_caja($1, $2, null)', [E.a, esp - 100], /motivo/);
  const dif = +(await uno(U.vale, `select cerrar_caja($1, $2, 'Vuelto mal dado') d`, [E.a, esp - 100])).d;
  assert.equal(dif, -100);
  assert.equal((await como(U.vale, 'select * from auditoria')).rows.length, 0, 'el vendedor no ve la auditoría');
  assert.ok((await como(U.ana, `select * from auditoria where accion = 'caja.diferencia'`)).rows.length === 1);
  await falla(U.ana, 'delete from ventas where id = $1', [v.id], /permission denied/);
});

test('proveedores y gastos: no se paga de más y los gastos se anulan, no se borran', async () => {
  const saldo = +(await uno(U.ana, 'select saldo_proveedor($1, $2) s', [E.a, E.prov])).s;
  assert.ok(saldo > 0);
  await falla(U.ana, 'select pagar_proveedor($1, $2, $3, \'Transferencia\')', [E.a, E.prov, saldo + 100], /más de lo que le debés/);
  await falla(U.vale, 'select pagar_proveedor($1, $2, 1, \'Transferencia\')', [E.a, E.prov], /permiso/);
  await como(U.ana, 'select pagar_proveedor($1, $2, $3, \'Transferencia\')', [E.a, E.prov, saldo]);
  const g = (await uno(U.ana, `select registrar_gasto($1, 'Otros', 'Bolsas', 500, 'Transferencia') id`, [E.a])).id;
  await como(U.ana, `select anular_gasto($1, $2, 'Cargado dos veces')`, [E.a, g]);
  await falla(U.ana, `select anular_gasto($1, $2, 'otra vez')`, [E.a, g], /ya estaba anulado/);
  assert.equal((await como(U.ana, 'select * from gastos')).rows.length, 1);
});

test('precios: solo el administrador los cambia y queda auditado', async () => {
  const r = await como(U.vale, 'update productos set precio = 1 where id = $1', [E.yerba]); assert.equal(r.affectedRows, 0);
  await como(U.ana, 'update productos set precio = 2000 where id = $1', [E.yerba]);
  const a = await como(U.ana, `select detalle from auditoria where accion = 'producto.precio'`);
  assert.ok(a.rows.some((x) => /1815/.test(x.detalle) && /2000/.test(x.detalle)));
  await falla(U.ana, 'update productos set precio = -5 where id = $1', [E.yerba], /check/);
});

test('ARCA: nadie puede autorizar una venta desde la app; un CAE de prueba no la vuelve fiscal', async () => {
  const v = (await db.query(`select id from ventas where empresa_id = $1 and tipo <> 'TK' order by nro limit 1`, [E.a])).rows[0];
  await como(U.ana, `insert into arca_config (empresa_id, punto_venta) values ($1, 3)`, [E.a]);
  assert.equal((await como(U.vale, `update arca_config set habilitado = true where empresa_id = $1`, [E.a])).affectedRows, 0, 'solo el administrador la cambia');
  assert.equal((await como(U.vale, 'select * from arca_config')).rows.length, 0, 'el vendedor no ve la configuración');
  await falla(U.ana, 'select * from arca_tokens', [], /permission denied/);
  await falla(U.ana, `update ventas set fiscal_estado = 'autorizado', cae = '12345678901234' where id = $1`, [v.id], /permission denied/);
  await falla(U.ana, `insert into comprobantes_arca (empresa_id, venta_id, ambiente, punto_venta, cbte_tipo, estado) values ($1, $2, 'produccion', 3, 6, 'enviando')`, [E.a, v.id], /permission denied/);
  await falla(U.ana, 'select arca_aplicar(1)', [], /permission denied/);
  await falla(U.ana, `select arca_tomar_turno($1, 3, 6, gen_random_uuid())`, [E.a], /permission denied/);
  // El servidor (service_role) toma el turno de numeración de a uno
  const t1 = crypto.randomUUID(), t2 = crypto.randomUUID();
  const turno = async (fn, t) => { await db.exec('set role service_role'); try { return (await db.query(`select ${fn}($1, 3, 6, $2) r`, [E.a, t])).rows[0].r; } finally { await db.exec('reset role'); } };
  assert.equal(await turno('arca_tomar_turno', t1), true);
  assert.equal(await turno('arca_tomar_turno', t2), false, 'otro pedido espera');
  await turno('arca_soltar_turno', t1);
  assert.equal(await turno('arca_tomar_turno', t2), true);
  // Un CAE inventado o un "aprobado" sin CAE se rechazan en la base
  const ins = (amb, est, cae) => db.query(`insert into comprobantes_arca (empresa_id, venta_id, ambiente, punto_venta, cbte_tipo, numero, estado, cae, cae_vto) values ($1, $2, $3, 3, 6, 1, $4, $5, '2026-10-25') returning id`, [E.a, v.id, amb, est, cae]);
  await assert.rejects(() => ins('produccion', 'aprobado', null), /check/);
  await assert.rejects(() => ins('produccion', 'aprobado', 'CAE-DEMO'), /check/);
  const aplicar = async (id) => { await db.exec('set role service_role'); try { return (await db.query('select arca_aplicar($1) r', [id])).rows[0].r; } finally { await db.exec('reset role'); } };
  // Homologación: queda registrado como prueba, la venta sigue sin autorizar
  const h = (await ins('homologacion', 'aprobado', '76123456789012')).rows[0].id;
  assert.equal(await aplicar(h), 'prueba');
  assert.equal((await uno(U.ana, 'select fiscal_estado from ventas where id = $1', [v.id])).fiscal_estado, 'sin_autorizar');
  // Producción: la venta pasa a autorizada con el CAE devuelto y queda auditado
  const p = (await ins('produccion', 'aprobado', '76123456789013')).rows[0].id;
  assert.equal(await aplicar(p), 'autorizado');
  const r = await uno(U.ana, 'select fiscal_estado, cae, nro_fiscal from ventas where id = $1', [v.id]);
  assert.deepEqual([r.fiscal_estado, r.cae, +r.nro_fiscal], ['autorizado', '76123456789013', 1]);
  await assert.rejects(() => ins('produccion', 'aprobado', '76123456789014'), /duplicate|unique/, 'una venta no se autoriza dos veces');
  assert.equal((await como(U.vale, 'select * from comprobantes_arca')).rows.length, 2, 'la vendedora ve los comprobantes de su empresa');
  assert.equal((await como(U.beto, 'select * from comprobantes_arca')).rows.length, 0, 'otra empresa no los ve');
});
