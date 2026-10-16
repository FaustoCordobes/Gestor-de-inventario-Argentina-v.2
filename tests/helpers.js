/* Utilidades compartidas por las pruebas. */
'use strict';
const path = require('path');
const fs = require('fs');

const JS = path.join(__dirname, '..', 'js');

/** Carga módulos de js/ en un M nuevo (cada archivo de prueba corre en su propio proceso). */
function cargar(...mods) {
  globalThis.M = {};
  for (const m of mods) {
    const f = require.resolve(path.join(JS, m));
    delete require.cache[f];
    require(f);
  }
  return globalThis.M;
}

/** Estado chico y controlado para probar reglas de negocio. */
function base(M) {
  const D = M.D, U = M.U;
  const S = D.emptyState('local');
  Object.assign(S.config, { nombre: 'Comercio de prueba', condIva: 'RI', cuit: '30-71234567-3' });
  const mk = (nombre, rol) => { const x = { id: U.uid(), nombre, rol, pinHash: null, salt: null, activo: true }; S.usuarios.push(x); return x; };
  const u = { admin: mk('Ana', 'admin'), enc: mk('Eli', 'encargado'), ven: mk('Vale', 'vendedor'), dep: mk('Dani', 'deposito') };
  const pv = D.guardarProveedor(S, u.admin, { nombre: 'Proveedor Uno', cuit: '', plazo: 15, entrega: 2 });
  const yerba = D.crearProducto(S, u.admin, { codigo: '7790000000011', nombre: 'Yerba 1 kg', categoria: 'Almacén', provId: pv.id, costo: 1000, margen: 50, iva: 21, stockMin: 5, stock: 20, unidad: 'u' });
  const queso = D.crearProducto(S, u.admin, { codigo: '2000001000014', plu: '00001', nombre: 'Queso x kg', categoria: 'Lácteos', provId: pv.id, costo: 5000, margen: 40, iva: 21, stockMin: 2, stock: 6, unidad: 'kg' });
  const papa = D.crearProducto(S, u.admin, { codigo: '2000001000038', nombre: 'Papa x kg', categoria: 'Verdulería', provId: pv.id, costo: 500, margen: 45, iva: 10.5, stockMin: 5, stock: 3, unidad: 'kg' });
  const ri = D.guardarCliente(S, u.admin, { nombre: 'Hotel SRL', condIva: 'RI', cuit: '30-71598742-0' === '' ? '' : validCuit(M) });
  const vecino = D.guardarCliente(S, u.admin, { nombre: 'Vecino', condIva: 'CF', cuit: '' });
  return { S, u, pv, p: { yerba, queso, papa }, c: { ri, vecino } };
}
function validCuit(M) { for (let i = 0; i < 50; i++) { const c = M.U.cuitConDV('30' + String(71598740 + i).padStart(8, '0')); if (c) return c; } }

/** Estado JSON para comparar igualdad profunda. */
const snap = (S) => JSON.stringify(S);

/** Genera datos de la versión anterior (v3) ejecutando legacy/index-v3.html en jsdom. */
function datosLegadoV3() {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(__dirname, '..', 'legacy', 'index-v3.html'), 'utf8').replace(/<script src=[^>]+><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://ejemplo.test/' });
  dom.window.scrollTo = () => {};
  const raw = dom.window.localStorage.getItem('mostrador-demo-v3');
  dom.window.close();
  return JSON.parse(raw);
}

module.exports = { cargar, base, snap, datosLegadoV3 };
