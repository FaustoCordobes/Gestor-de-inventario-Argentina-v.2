/* Mostrador · reports.js
 * Cálculos de informes. Todo se deriva de los registros guardados.
 *
 * Definiciones (se muestran también en pantalla):
 * - Ventas: lo facturado (total con IVA) menos las devoluciones del período.
 * - Cobros / dinero que entró: pagos recibidos (sin contar lo fiado) + cobros de fiado − reintegros.
 * - Gastos: gastos del local no anulados (no incluye compras de mercadería).
 * - Costo de lo vendido: costo de compra registrado en cada venta, menos lo devuelto.
 * - Ganancia estimada: ventas sin IVA (si sos Responsable Inscripto) − costo de lo vendido − gastos.
 *   No incluye impuestos sobre la ganancia, Ingresos Brutos ni amortizaciones.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D;
  const { r2, sum } = U;

  const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const MESC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** Rango de fechas de un período (día, semana, mes o año) con sus sub-períodos para el gráfico. */
  function rango(tipo, ref) {
    const r = new Date(ref + 'T00:00'); let from, to, label; const sub = [];
    if (tipo === 'dia') {
      from = new Date(r); to = new Date(r); to.setDate(to.getDate() + 1);
      const ay = new Date(); ay.setDate(ay.getDate() - 1);
      label = ref === U.today() ? 'Hoy' : ref === U.dkey(ay) ? 'Ayer' : r.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      for (let h = 8; h <= 22; h++) { const f = new Date(r), t = new Date(r); f.setHours(h === 8 ? 0 : h); t.setHours(h === 22 ? 24 : h + 1); sub.push({ l: h + 'h', f, t }); }
    } else if (tipo === 'semana') {
      from = new Date(r); from.setDate(from.getDate() - ((r.getDay() + 6) % 7)); to = new Date(from); to.setDate(to.getDate() + 7);
      const fin = new Date(to); fin.setDate(fin.getDate() - 1);
      label = from.getMonth() === fin.getMonth() ? `Semana del ${from.getDate()} al ${fin.getDate()} de ${U.MESES[fin.getMonth()]}` : `Semana del ${from.getDate()} de ${U.MESES[from.getMonth()]} al ${fin.getDate()} de ${U.MESES[fin.getMonth()]}`;
      for (let i = 0; i < 7; i++) { const f = new Date(from); f.setDate(f.getDate() + i); const t = new Date(f); t.setDate(t.getDate() + 1); sub.push({ l: DIAS[i] + ' ' + f.getDate(), f, t, drill: ['dia', U.dkey(f)] }); }
    } else if (tipo === 'mes') {
      from = new Date(r.getFullYear(), r.getMonth(), 1); to = new Date(r.getFullYear(), r.getMonth() + 1, 1);
      label = U.MESES[from.getMonth()] + ' ' + from.getFullYear(); label = label[0].toUpperCase() + label.slice(1);
      for (let f = new Date(from); f < to; f.setDate(f.getDate() + 1)) { const ff = new Date(f), t = new Date(f); t.setDate(t.getDate() + 1); sub.push({ l: String(ff.getDate()), f: ff, t, drill: ['dia', U.dkey(ff)], nombre: DIAS[(ff.getDay() + 6) % 7] + ' ' + ff.getDate() }); }
    } else {
      from = new Date(r.getFullYear(), 0, 1); to = new Date(r.getFullYear() + 1, 0, 1); label = 'Año ' + from.getFullYear();
      for (let m = 0; m < 12; m++) { const f = new Date(from.getFullYear(), m, 1), t = new Date(from.getFullYear(), m + 1, 1); sub.push({ l: MESC[m], f, t, drill: ['mes', U.dkey(f)], nombre: U.MESES[m] }); }
    }
    return { tipo, from, to, label, sub };
  }
  function moverRef(tipo, ref, dir) { const d = new Date(ref + 'T12:00'); if (tipo === 'dia') d.setDate(d.getDate() + dir); else if (tipo === 'semana') d.setDate(d.getDate() + 7 * dir); else if (tipo === 'mes') { d.setDate(1); d.setMonth(d.getMonth() + dir); } else { d.setDate(1); d.setMonth(0); d.setFullYear(d.getFullYear() + dir); } return U.dkey(d); }
  const enR = (f, R) => { const t = new Date(f); return t >= R.from && t < R.to; };

  /** Resultado de un período con conceptos separados (ventas ≠ cobros ≠ ganancia). */
  function resultado(S, R) {
    const vs = S.ventas.filter((v) => enR(v.fecha, R));
    const ds = S.devoluciones.filter((d) => enR(d.fecha, R));
    const gs = S.gastos.filter((g) => enR(g.fecha, R) && !g.anulado);
    const venta = (id) => S.ventas.find((v) => v.id === id);
    const brutas = sum(vs, 'total'), devol = sum(ds, 'total');
    const netoV = sum(vs, 'neto') - sum(ds, (d) => { const v = venta(d.ventaId); return v && v.total ? d.total * (v.neto / v.total) : d.total; });
    const cmv = sum(vs, 'costo') - sum(ds, (d) => sum(d.items, (l) => { const v = venta(d.ventaId); return ((v && v.items[l.idx] && v.items[l.idx].costo) || 0) * l.cant; }));
    const fiado = sum(vs, (v) => sum(v.pagos.filter((p) => p.medio === 'Cuenta corriente'), 'monto'));
    const cobrosFiado = sum(S.cobros.filter((c) => enR(c.fecha, R)), 'monto');
    const reintegros = sum(ds.filter((d) => d.reintegro.medio !== 'Cuenta corriente'), 'total');
    const gastos = sum(gs, 'monto');
    const ventas = r2(brutas - devol);
    return {
      vs, ds, gs, n: vs.length, brutas: r2(brutas), devoluciones: r2(devol), ventas, fiado: r2(fiado),
      cobros: r2(brutas - fiado + cobrosFiado - reintegros), iva: r2(ventas - netoV), netoSinIva: r2(netoV), cmv: r2(cmv),
      bruto: r2(netoV - cmv), gastos: r2(gastos), ganancia: r2(netoV - cmv - gastos), ticket: vs.length ? r2(brutas / vs.length) : 0
    };
  }

  /** Unidades vendidas netas por producto en los últimos `dias` días (desde el kardex). */
  function vendidas(S, dias, ref) {
    const t1 = ref ? new Date(ref) : new Date(); const t0 = new Date(t1); t0.setDate(t0.getDate() - dias);
    const out = {};
    S.movimientos.forEach((m) => { if ((m.tipo === 'venta' || m.tipo === 'devolucion')) { const t = new Date(m.fecha); if (t >= t0 && t <= t1) out[m.pid] = (out[m.pid] || 0) - m.cant; } });
    return out;
  }
  /** Inventario: valorización, rotación, cobertura y margen por producto. */
  function inventario(S, dias = 30) {
    const v = vendidas(S, dias);
    const filas = S.productos.filter((p) => p.activo !== false).map((p) => {
      const und = U.r3(v[p.id] || 0); const diaria = und / dias;
      const precioSinIva = p.precio / (1 + p.iva / 100);
      const margen = precioSinIva > 0 ? r2(((precioSinIva - p.costo) / precioSinIva) * 100) : 0;
      return { p, vendidas: und, diaria, cobertura: diaria > 0 ? Math.round(p.stock / diaria) : null, valorCosto: r2(Math.max(0, p.stock) * p.costo), valorVenta: r2(Math.max(0, p.stock) * p.precio), margen, gananciaUnidad: r2(precioSinIva - p.costo) };
    });
    const porCat = {}; filas.forEach((f) => { const k = f.p.categoria || 'Varios'; porCat[k] = porCat[k] || { costo: 0, venta: 0, n: 0 }; porCat[k].costo += f.valorCosto; porCat[k].venta += f.valorVenta; porCat[k].n++; });
    return {
      filas, dias, porCat,
      totalCosto: r2(sum(filas, 'valorCosto')), totalVenta: r2(sum(filas, 'valorVenta')),
      masRotacion: filas.filter((f) => f.vendidas > 0).sort((a, b) => b.vendidas - a.vendidas).slice(0, 8),
      menosRotacion: filas.filter((f) => f.vendidas > 0).sort((a, b) => a.vendidas - b.vendidas).slice(0, 8),
      sinMovimiento: filas.filter((f) => f.vendidas <= 0 && f.p.stock > 0),
      margenBajo: filas.filter((f) => f.margen < 15).sort((a, b) => a.margen - b.margen)
    };
  }
  /** Diferencias de stock (conteos y pérdidas) valorizadas al costo actual, y diferencias de caja. */
  function diferencias(S, R) {
    const ms = S.movimientos.filter((m) => (m.tipo === 'conteo' || m.tipo === 'merma') && enR(m.fecha, R));
    const filas = ms.map((m) => { const p = D.prod(S, m.pid) || { nombre: '?', costo: 0 }; return { m, p, valor: r2(m.cant * p.costo) }; });
    const porMotivo = {}; filas.forEach((f) => { const k = f.m.motivo || 'Sin motivo'; porMotivo[k] = r2((porMotivo[k] || 0) + f.valor); });
    const cajas = S.cajas.filter((c) => c.cierra && enR(c.cierra.fecha, R) && Math.abs(c.cierra.dif) >= 1);
    return { filas: filas.sort((a, b) => (a.m.fecha < b.m.fecha ? 1 : -1)), porMotivo, total: r2(sum(filas, 'valor')), cajas, totalCaja: r2(sum(cajas, (c) => c.cierra.dif)) };
  }
  /** Deuda con proveedores por factura (los pagos y créditos se aplican a las más viejas primero). */
  function deudaProveedores(S) {
    const out = [];
    S.proveedores.forEach((pv) => {
      const comps = S.compras.filter((c) => c.provId === pv.id && c.cond === 'cc').sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      let credito = sum(S.pagos.filter((p) => p.provId === pv.id), 'monto') + sum(S.devprov.filter((d) => d.provId === pv.id && d.modo === 'credito'), 'total');
      comps.forEach((c) => {
        const aplicado = Math.min(credito, c.total); credito -= aplicado; const resta = r2(c.total - aplicado);
        if (resta > 0.009) { const vence = new Date(c.fecha); vence.setDate(vence.getDate() + (pv.plazo || 0)); out.push({ pv, c, resta, vence, vencida: vence < new Date() }); }
      });
    });
    return out.sort((a, b) => a.vence - b.vence);
  }
  function pendientes(S) {
    const pedidos = S.pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'parcial');
    const deudas = deudaProveedores(S);
    const fiados = S.clientes.filter((c) => !c.fijo).map((c) => ({ c, saldo: D.saldoCli(S, c.id) })).filter((x) => x.saldo > 0.009);
    return { pedidos, deudas, fiados, totalDeuda: r2(sum(deudas, 'resta')), totalFiado: r2(sum(fiados, 'saldo')) };
  }

  /* ---------- Libros de IVA (control interno) ---------- */
  function libroVentas(S, mes) { return S.ventas.filter((v) => v.tipo !== 'TK' && U.mkey(v.fecha) === mes).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)); }
  function libroCompras(S, mes) { return S.compras.filter((c) => c.tipo !== 'Remito' && U.mkey(c.fecha) === mes).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)); }
  function rowsIvaVentas(S, mes) {
    return libroVentas(S, mes).map((v) => {
      const c = D.cli(S, v.clienteId) || {}; const mono = v.tipo === 'FC'; const T = D.TIPOS[v.tipo];
      return { 'Fecha': U.fD(v.fecha), 'Tipo previsto': T.nombre, 'Cód.': T.cod, 'N° interno': v.nro, 'Estado ARCA': v.fiscal && v.fiscal.estado === 'autorizado' ? 'Autorizado' : 'Sin autorizar', 'CAE': v.fiscal && v.fiscal.cae ? v.fiscal.cae : '', 'Cliente': c.nombre, 'CUIT/Doc': c.cuit || '', 'Cond. IVA': c.condIva, 'Neto 21%': mono ? 0 : v.n21, 'IVA 21%': mono ? 0 : v.i21, 'Neto 10,5%': mono ? 0 : v.n105, 'IVA 10,5%': mono ? 0 : v.i105, 'Exento/No grav.': mono ? v.total : v.nEx, 'Total': v.total, 'Devuelto': D.totalDevuelto(S, v.id) };
    });
  }
  function rowsIvaCompras(S, mes) { return libroCompras(S, mes).map((c) => { const p = D.prov(S, c.provId) || {}; return { 'Fecha': U.fD(c.fecha), 'Comprobante': c.tipo, 'Número': c.nroComp, 'Proveedor': p.nombre, 'CUIT': p.cuit, 'Neto gravado': c.tipo === 'Factura A' ? c.neto : 0, 'IVA crédito fiscal': c.iva, 'No gravado / no discrimina': c.tipo === 'Factura A' ? 0 : c.total, 'Total': c.total }; }); }

  M.R = { DIAS, MESC, rango, moverRef, enR, resultado, vendidas, inventario, diferencias, deudaProveedores, pendientes, libroVentas, libroCompras, rowsIvaVentas, rowsIvaCompras };
})(typeof window !== 'undefined' ? window : globalThis);
