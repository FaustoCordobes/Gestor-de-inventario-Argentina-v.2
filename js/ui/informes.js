/* Mostrador · ui/informes.js
 * Historial por día/semana/mes/año, inventario (valorización, rotación, márgenes),
 * diferencias de stock y de caja, pendientes (pedidos, deudas, fiados) y libros
 * de IVA para el contador. Exportación a Excel y PDF.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI, R = M.R;
  const { esc, f$, fn } = U;
  const { APP, ic, opt, head } = UI;
  const S = () => APP.S;
  let tab = 'historial', rMes = null; const hp = { tipo: 'mes', ref: null }; let invDias = 30;
  const PER = { dia: 'Día', semana: 'Semana', mes: 'Mes', anio: 'Año' };

  function view() {
    if (!UI.can('informes.ver')) return head('Informes', 'Tu usuario no tiene acceso a los informes.');
    return head('Informes', 'Cómo le va al negocio, el inventario, lo pendiente y lo que necesita tu contador.', '', 'informes') +
      UI.tabs(tab, [['historial', 'Historial', 'informes'], ['inventario', 'Inventario', 'mercaderia'], ['diferencias', 'Diferencias', 'falta'], ['pendientes', 'Pendientes', 'list'], ['contador', 'Para el contador', 'down']], 'itab') +
      ({ historial: tHistorial, inventario: tInventario, diferencias: tDiferencias, pendientes: tPendientes, contador: tContador }[tab])();
  }
  const definiciones = `<details class="more"><summary>¿Cómo se calculan estos números?</summary><div><ul class="hint" style="margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
    <li><b>Vendiste:</b> total facturado con IVA menos las devoluciones del período.</li>
    <li><b>Entró de plata:</b> lo cobrado en el momento (sin lo fiado) + lo que pagaron de fiado − lo devuelto a clientes.</li>
    <li><b>Costo de lo vendido:</b> precio de compra que tenía cada producto al momento de venderlo.</li>
    <li><b>Ganancia estimada:</b> ventas sin IVA (solo si sos Responsable Inscripto) − costo de lo vendido − gastos del local. No incluye impuestos a las ganancias, Ingresos Brutos ni compras de mercadería que todavía no vendiste.</li></ul></div></details>`;

  function tHistorial() {
    hp.ref = hp.ref || U.today();
    const Rg = R.rango(hp.tipo, hp.ref), P = R.rango(hp.tipo, R.moverRef(hp.tipo, hp.ref, -1));
    const now = new Date(); const hayMas = Rg.to <= now; const parcial = now >= Rg.from && now < Rg.to;
    const st = R.resultado(S(), Rg); const sp = R.resultado(S(), parcial ? { from: P.from, to: new Date(P.from.getTime() + (now - Rg.from)) } : P);
    const primera = S().ventas.length ? S().ventas[0].fecha : null; const completo = primera && new Date(primera) <= P.from;
    const pct = completo && sp.ventas > 0 ? ((st.ventas - sp.ventas) / sp.ventas) * 100 : null;
    const antes = { dia: 'el día anterior', semana: 'la semana anterior', mes: 'el mes anterior', anio: 'el año anterior' }[hp.tipo];
    const porSub = Rg.sub.map((b) => { const r = R.resultado(S(), { from: b.f, to: b.t }); return { ...b, r }; });
    const hi = porSub.findIndex((b) => now >= b.f && now < b.t);
    const top = {}; st.vs.forEach((v) => v.items.forEach((i) => { const t = (top[i.pid] = top[i.pid] || { nombre: i.nombre, cant: 0, total: 0 }); t.cant += i.cant - (i.devuelto || 0); t.total += i.precio * (i.cant - (i.devuelto || 0)) * (1 - (v.desc || 0) / 100); }));
    const topL = Object.values(top).sort((a, b) => b.total - a.total).slice(0, 8);
    const porMed = {}; st.vs.forEach((v) => v.pagos.forEach((p) => (porMed[D.ML(p.medio)] = (porMed[D.ML(p.medio)] || 0) + p.monto))); const mx = Math.max(1, ...Object.values(porMed));
    const sublabel = { dia: 'Ventas por hora', semana: 'Ventas por día', mes: 'Ventas por día', anio: 'Ventas por mes' }[hp.tipo];
    let detalle;
    if (hp.tipo === 'dia') {
      const vs = st.vs.slice().reverse();
      detalle = `<div class="card"><div class="card-h"><h2>Ventas del día</h2><span class="hint">${vs.length} ventas</span></div><div class="card-b"><div class="list">${vs.slice(0, 120).map((v) => `<div class="li"><div class="t"><b>${U.fH(v.fecha)} · ${esc((D.cli(S(), v.clienteId) || {}).nombre)} ${UI.estadoVenta(v)}</b><span class="hint">${UI.cbBadge(v.tipo)} ${esc(v.nro)} · ${esc(D.medioVenta(v))} · ${v.items.length} ${v.items.length === 1 ? 'producto' : 'productos'} · ${esc(D.uNombre(S(), v.usuario))}</span></div><span class="num"><b>${f$(v.total)}</b> <button class="btn sm ghost" data-act="vercbte" data-id="${v.id}">Ver</button></span></div>`).join('') || '<div class="empty">No hubo ventas este día.</div>'}</div></div></div>`;
    } else {
      const filas = porSub.filter((b) => b.f <= now);
      detalle = `<div class="card"><div class="card-h"><h2>${hp.tipo === 'anio' ? 'Mes por mes' : 'Día por día'}</h2><span class="hint">Tocá una fila para ver el detalle</span></div><div class="card-b"><div class="tw"><table><thead><tr><th>${hp.tipo === 'anio' ? 'Mes' : 'Día'}</th><th class="n">Ventas</th><th class="n">Vendiste</th><th class="n">Ganancia bruta</th><th></th></tr></thead><tbody>
        ${filas.slice().reverse().map((b) => `<tr><td><b>${esc(b.nombre || b.l)}</b></td><td class="n">${b.r.n}</td><td class="n"><b>${f$(b.r.ventas)}</b></td><td class="n">${f$(b.r.bruto)}</td><td style="text-align:right"><button class="btn sm" data-act="hpdrill" data-t="${b.drill[0]}" data-r="${b.drill[1]}">Ver ${b.drill[0] === 'dia' ? 'día' : 'mes'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin datos.</td></tr>'}
        </tbody><tfoot><tr><td>Total</td><td class="n">${st.n}</td><td class="n">${f$(st.ventas)}</td><td class="n">${f$(st.bruto)}</td><td></td></tr></tfoot></table></div></div></div>`;
    }
    return `<div class="toolbar" style="justify-content:space-between">
      <div class="chips" role="group" aria-label="Período">${Object.entries(PER).map(([k, l]) => `<button class="chip" data-act="hptipo" data-t="${k}" aria-pressed="${hp.tipo === k}">${l}</button>`).join('')}</div>
      <div class="toolbar"><button class="btn sm" data-act="hpmov" data-d="-1" aria-label="Período anterior">‹ Anterior</button><b style="min-width:12ch;text-align:center">${esc(Rg.label)}</b><button class="btn sm" data-act="hpmov" data-d="1" ${hayMas ? '' : 'disabled'} aria-label="Período siguiente">Siguiente ›</button>${hp.ref !== U.today() ? '<button class="link" data-act="hphoy">Ir a hoy</button>' : ''}</div></div>
      <div class="kpis">
        <div class="kpi"><span class="l">Vendiste</span><span class="v">${f$(st.ventas)}</span><span class="s">${pct == null ? 'No hay datos completos ' + antes.replace(/^el /, 'del ').replace(/^la /, 'de la ') : `<b style="color:${pct >= 0 ? 'var(--ok)' : 'var(--bad)'}">${pct >= 0 ? '▲' : '▼'} ${fn(Math.abs(Math.round(pct)))}%</b> contra ${antes}${parcial ? ' a esta altura' : ''}`}</span></div>
        <div class="kpi"><span class="l">Entró de plata</span><span class="v">${f$(st.cobros)}</span><span class="s">${st.fiado ? f$(st.fiado) + ' quedó fiado' : 'Nada quedó fiado'}</span></div>
        <div class="kpi"><span class="l">Cantidad de ventas</span><span class="v">${st.n}</span><span class="s">Ticket promedio ${f$(st.ticket)}</span></div>
        <div class="kpi ${st.ganancia >= 0 ? 'good' : 'alert'}"><span class="l">${st.ganancia >= 0 ? 'Ganancia estimada' : 'Pérdida estimada'}</span><span class="v">${f$(Math.abs(st.ganancia))}</span><span class="s">Gastos del período: ${f$(st.gastos)}</span></div>
      </div>
      <div class="card"><div class="card-h"><h2>${sublabel}</h2>${hi >= 0 ? '<span class="hint">La barra verde es el momento actual</span>' : ''}</div><div class="card-b chart">${UI.chartBars(porSub.map((b) => b.l), porSub.map((b) => b.r.ventas), hi, sublabel + ' · ' + Rg.label)}</div></div>
      ${detalle}
      <div class="grid g2">
        <div class="card"><div class="card-h"><h2>Las cuentas</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:8px">
          <div class="tot"><span>Vendiste</span><b>${f$(st.brutas)}</b></div>
          ${st.devoluciones ? `<div class="tot"><span>Menos devoluciones</span><span>− ${f$(st.devoluciones)}</span></div>` : ''}
          ${st.iva > 0.5 ? `<div class="tot"><span>Menos el IVA (es de ARCA)</span><span>− ${f$(st.iva)}</span></div>` : ''}
          <div class="tot"><span>Menos lo que te costó la mercadería</span><span>− ${f$(st.cmv)}</span></div>
          <div class="tot"><span>Menos los gastos del local</span><span>− ${f$(st.gastos)}</span></div>
          <div class="sumrow" style="margin-top:6px"><span><b>${st.ganancia >= 0 ? 'Ganancia estimada' : 'Pérdida estimada'}</b></span><span class="vuelto" style="color:${st.ganancia < 0 ? 'var(--bad)' : 'var(--ok)'}">${f$(Math.abs(st.ganancia))}</span></div>
          ${definiciones}
        </div></div>
        <div class="card"><div class="card-h"><h2>Lo que más se vendió</h2></div><div class="card-b"><div class="list">${topL.map((t, i) => `<div class="li"><div class="t"><b>${i + 1}. ${esc(t.nombre)}</b><span class="hint">${fn(t.cant)} vendidos</span></div><span class="num">${f$(t.total)}</span></div>`).join('') || '<div class="empty">No hubo ventas.</div>'}</div></div></div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h2>Cómo te pagaron</h2></div><div class="card-b"><div class="bars">${Object.entries(porMed).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(v / mx) * 100}%"></div></div><span class="num">${f$(v)}</span></div>`).join('') || '<div class="empty">—</div>'}</div></div></div>
        <div class="card"><div class="card-h"><h2>Gastos del período</h2></div><div class="card-b"><div class="list">${(() => { const pc = {}; st.gs.forEach((g) => (pc[g.categoria] = (pc[g.categoria] || 0) + g.monto)); return Object.entries(pc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="li"><span>${esc(k)}</span><b class="num">${f$(v)}</b></div>`).join('') || '<div class="empty">No hubo gastos.</div>'; })()}</div></div></div>
      </div>
      <div class="toolbar"><button class="btn" data-act="exphist">${ic('down')}Excel de este período</button><button class="btn" data-act="pdfhist">${ic('down')}PDF de este período</button>${UI.can('backup.exportar') ? '<button class="btn ghost" data-act="expall">Descargar todos los datos en Excel</button>' : ''}</div>`;
  }

  function tInventario() {
    const inv = R.inventario(S(), invDias);
    const fila = (f) => `<tr><td>${esc(f.p.nombre)}<span class="sub">${esc(f.p.categoria)}</span></td><td class="n">${fn(f.vendidas)}</td><td class="n">${fn(f.p.stock)}</td><td class="n">${f.cobertura == null ? '—' : f.cobertura + ' días'}</td><td class="n">${fn(f.margen)}%</td></tr>`;
    const tabla = (titulo, rows, vacio) => `<div class="card"><div class="card-h"><h2>${titulo}</h2></div><div class="card-b"><div class="tw"><table><thead><tr><th>Producto</th><th class="n">Vendidos</th><th class="n">Stock</th><th class="n">Alcanza para</th><th class="n">Margen</th></tr></thead><tbody>${rows.map(fila).join('') || `<tr><td colspan="5" class="empty">${vacio}</td></tr>`}</tbody></table></div></div></div>`;
    return `<div class="toolbar"><label for="inv-d">Ventas de los últimos</label><select id="inv-d" data-invd="1">${[7, 30, 90, 365].map((d) => opt(d, d + ' días', invDias)).join('')}</select><span class="sp"></span><button class="btn" data-act="expinv">${ic('down')}Excel</button><button class="btn" data-act="pdfinv">${ic('down')}PDF</button></div>
      <div class="kpis">
        <div class="kpi"><span class="l">Tu mercadería vale (a costo)</span><span class="v">${f$(inv.totalCosto)}</span><span class="s">Stock × precio de compra registrado</span></div>
        <div class="kpi"><span class="l">A precio de venta</span><span class="v">${f$(inv.totalVenta)}</span><span class="s">Si vendieras todo lo que tenés</span></div>
        <div class="kpi ${inv.sinMovimiento.length ? 'alert' : ''}"><span class="l">Sin ventas en ${invDias} días</span><span class="v">${inv.sinMovimiento.length}</span><span class="s">Valen ${f$(U.sum(inv.sinMovimiento, 'valorCosto'))} a costo</span></div>
      </div>
      <div class="card"><div class="card-h"><h2>Valor por categoría</h2></div><div class="card-b"><div class="tw"><table><thead><tr><th>Categoría</th><th class="n">Productos</th><th class="n">A costo</th><th class="n">A precio de venta</th></tr></thead><tbody>${Object.entries(inv.porCat).sort((a, b) => b[1].costo - a[1].costo).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.n}</td><td class="n">${f$(v.costo)}</td><td class="n">${f$(v.venta)}</td></tr>`).join('')}</tbody></table></div></div></div>
      <div class="grid g2">${tabla('Los que más rotan', inv.masRotacion, 'Sin ventas')}${tabla('Los que menos rotan', inv.menosRotacion, 'Sin ventas')}</div>
      <div class="grid g2">${tabla('Sin ventas en el período', inv.sinMovimiento.slice(0, 12), 'Todos tuvieron ventas')}${tabla('Margen bajo (menos de 15%)', inv.margenBajo.slice(0, 12), 'Ningún producto con margen bajo')}</div>
      <p class="hint">Margen = (precio sin IVA − precio de compra) ÷ precio sin IVA. "Alcanza para" usa el promedio de ventas del período.</p>`;
  }

  function tDiferencias() {
    hp.ref = hp.ref || U.today(); const Rg = R.rango(hp.tipo === 'dia' ? 'mes' : hp.tipo, hp.ref); const df = R.diferencias(S(), Rg);
    return `<div class="toolbar"><b>${esc(Rg.label)}</b><span class="hint">(período elegido en Historial)</span></div>
      <div class="kpis">
        <div class="kpi ${df.total < 0 ? 'alert' : ''}"><span class="l">Diferencias de stock (a costo)</span><span class="v">${f$(df.total)}</span><span class="s">Conteos y pérdidas registrados</span></div>
        <div class="kpi ${df.totalCaja < 0 ? 'alert' : ''}"><span class="l">Diferencias de caja</span><span class="v">${f$(df.totalCaja)}</span><span class="s">${df.cajas.length} cierres con diferencia</span></div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h2>Por motivo</h2></div><div class="card-b"><div class="list">${Object.entries(df.porMotivo).sort((a, b) => a[1] - b[1]).map(([k, v]) => `<div class="li"><span>${esc(k)}</span><b class="num" style="color:${v < 0 ? 'var(--bad)' : 'inherit'}">${f$(v)}</b></div>`).join('') || '<div class="empty">Sin diferencias de stock.</div>'}</div></div></div>
        <div class="card"><div class="card-h"><h2>Cierres de caja con diferencia</h2></div><div class="card-b"><div class="list">${df.cajas.map((c) => `<div class="li"><div class="t"><b>${U.fDT(c.cierra.fecha)} · ${esc(D.uNombre(S(), c.cierra.usuario))}</b><span class="hint">${esc(c.cierra.motivo)}</span></div><b class="num" style="color:var(--bad)">${f$(c.cierra.dif)}</b></div>`).join('') || '<div class="empty">Todas las cajas cerraron justas.</div>'}</div></div></div>
      </div>
      <div class="card"><div class="card-h"><h2>Detalle de ajustes de stock</h2></div><div class="card-b"><div class="tw"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="n">Cantidad</th><th class="n">Valor a costo</th><th>Usuario</th></tr></thead><tbody>${df.filas.map((f) => `<tr><td>${U.fDT(f.m.fecha)}</td><td>${esc(f.p.nombre)}</td><td>${esc(D.MOV_TIPOS[f.m.tipo])}<span class="sub">${esc(f.m.motivo)}</span></td><td class="n">${fn(f.m.cant)}</td><td class="n">${f$(f.valor)}</td><td>${esc(D.uNombre(S(), f.m.usuario))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin ajustes en el período.</td></tr>'}</tbody></table></div></div></div>`;
  }

  function tPendientes() {
    const p = R.pendientes(S());
    return `<div class="kpis">
        <div class="kpi"><span class="l">Pedidos esperando</span><span class="v">${p.pedidos.length}</span><span class="s">Mercadería pedida que no llegó</span></div>
        <div class="kpi ${p.deudas.some((d) => d.vencida) ? 'alert' : ''}"><span class="l">Le debés a proveedores</span><span class="v">${f$(p.totalDeuda)}</span><span class="s">${p.deudas.filter((d) => d.vencida).length} facturas vencidas</span></div>
        <div class="kpi"><span class="l">Te deben de fiado</span><span class="v">${f$(p.totalFiado)}</span><span class="s">${p.fiados.length} clientes</span></div>
      </div>
      <div class="card"><div class="card-h"><h2>Pagos pendientes a proveedores</h2><button class="link" data-act="pdfpend">PDF</button></div><div class="card-b"><div class="tw"><table><thead><tr><th>Proveedor</th><th>Factura</th><th>Vence</th><th class="n">Falta pagar</th></tr></thead><tbody>${p.deudas.map((d) => `<tr><td>${esc(d.pv.nombre)}</td><td>${esc(d.c.tipo)} ${esc(d.c.nroComp)}<span class="sub">${U.fD(d.c.fecha)}</span></td><td>${U.fD(d.vence)} ${d.vencida ? '<span class="tag bad">Vencida</span>' : ''}</td><td class="n"><b>${f$(d.resta)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No le debés nada a nadie.</td></tr>'}</tbody></table></div><p class="hint">Los pagos se aplican a las facturas más viejas primero.</p></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h2>Pedidos sin recibir</h2></div><div class="card-b"><div class="list">${p.pedidos.map((x) => `<div class="li"><div class="t"><b>N° ${esc(x.nro)} · ${esc((D.prov(S(), x.provId) || {}).nombre)}</b><span class="hint">${U.fD(x.fecha)} · ${x.items.length} productos${x.estado === 'parcial' ? ' · llegó una parte' : ''}</span></div><button class="btn sm" data-act="gopedidos">Ver</button></div>`).join('') || '<div class="empty">No hay pedidos esperando.</div>'}</div></div></div>
        <div class="card"><div class="card-h"><h2>Fiados</h2></div><div class="card-b"><div class="list">${p.fiados.map((x) => `<div class="li"><span>${esc(x.c.nombre)}</span><b class="num">${f$(x.saldo)}</b></div>`).join('') || '<div class="empty">Nadie te debe.</div>'}</div></div></div>
      </div>`;
  }

  function tContador() {
    rMes = rMes || U.today().slice(0, 7);
    const lv = R.libroVentas(S(), rMes), lc = R.libroCompras(S(), rMes); const ri = S().config.condIva === 'RI';
    const deb = U.sum(lv.filter((v) => v.tipo !== 'FC'), (v) => v.i21 + v.i105), cred = U.sum(lc, 'iva'), pos = deb - cred;
    const autorizados = lv.filter((v) => v.fiscal && v.fiscal.estado === 'autorizado').length;
    const d12 = new Date(); d12.setMonth(d12.getMonth() - 12); const fact12 = U.sum(S().ventas.filter((v) => v.tipo !== 'TK' && new Date(v.fecha) >= d12), 'total');
    return `<div class="fiscal-warn"><strong>Importante:</strong> ${autorizados ? `${autorizados} de ${lv.length} comprobantes del mes están autorizados por ARCA.` : 'ninguno de estos comprobantes está autorizado por ARCA (no tienen CAE).'} La conexión con ARCA todavía no está configurada, así que este libro sirve para control interno y para que tu contador revise, pero no reemplaza lo que figura en ARCA.</div>
      <div class="toolbar"><label for="r-mes">Mes:</label><select id="r-mes" data-rmes="1">${U.lastMonths(12).map((k) => opt(k, U.mLabel(k), rMes)).join('')}</select></div>
      <div class="card"><div class="card-b" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between">
        <div style="max-width:60ch"><h2 style="font-size:18px">Todo lo de ${U.mLabel(rMes)} en un archivo</h2><p class="muted" style="margin:4px 0 0">Libros de IVA Ventas y Compras para mandarle a tu contador.</p></div>
        <div class="toolbar"><button class="btn primary" data-act="expiva">${ic('down')}Excel para el contador</button><button class="btn" data-act="pdfiva">${ic('down')}PDF</button></div></div></div>
      <div class="kpis">
        ${ri ? `<div class="kpi"><span class="l">IVA de tus ventas</span><span class="v">${f$(deb)}</span><span class="s">Débito fiscal</span></div>
        <div class="kpi"><span class="l">IVA de tus compras</span><span class="v">${f$(cred)}</span><span class="s">Crédito fiscal (facturas A)</span></div>
        <div class="kpi ${pos > 0 ? 'alert' : 'good'}"><span class="l">${pos > 0 ? 'IVA a pagar (aprox.)' : 'IVA a favor (aprox.)'}</span><span class="v">${f$(Math.abs(pos))}</span><span class="s">Lo confirma tu contador</span></div>`
        : `<div class="kpi"><span class="l">Facturaste este mes</span><span class="v">${f$(U.sum(lv, 'total'))}</span><span class="s">${lv.length} comprobantes</span></div>
        <div class="kpi"><span class="l">Facturaste en los últimos 12 meses</span><span class="v">${f$(fact12)}</span><span class="s">Sirve para la recategorización del monotributo</span></div>`}
      </div>
      <div class="card"><div class="card-h"><h2>Comprobantes del mes</h2></div><div class="card-b"><div class="tw"><table><thead><tr><th>Fecha</th><th>Comprobante</th><th>Cliente</th><th>Estado</th><th class="n">Total</th><th></th></tr></thead><tbody>
        ${lv.slice().reverse().slice(0, 40).map((v) => `<tr><td>${U.fD(v.fecha)}</td><td>${UI.cbBadge(v.tipo)} <span class="mono">${esc(v.nro)}</span></td><td>${esc((D.cli(S(), v.clienteId) || {}).nombre)}</td><td>${UI.fiscalTag(v)} ${UI.estadoVenta(v)}</td><td class="n"><b>${f$(v.total)}</b></td><td><button class="btn sm ghost" data-act="vercbte" data-id="${v.id}">Ver</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No hay comprobantes este mes.</td></tr>'}
      </tbody></table></div>${lv.length > 40 ? `<p class="hint">Se muestran los últimos 40. El Excel tiene todos (${lv.length}).</p>` : ''}</div></div>`;
  }

  /* ---------- Exportaciones ---------- */
  function exportHist(pdf) {
    const Rg = R.rango(hp.tipo, hp.ref || U.today()); const st = R.resultado(S(), Rg);
    const resumen = Rg.sub.filter((x) => x.f <= new Date()).map((x) => { const r = R.resultado(S(), { from: x.f, to: x.t }); return { 'Período': x.nombre || x.l, 'Ventas': r.n, 'Vendiste': r.ventas, 'Entró de plata': r.cobros, 'Costo de lo vendido': r.cmv, 'Gastos': r.gastos, 'Ganancia estimada': r.ganancia }; });
    if (!pdf) return UI.exportXLSX(`historial-${U.slug(Rg.label)}.xlsx`, { 'Resumen': resumen, 'Ventas': st.vs.map((v) => ({ 'Fecha': U.fDT(v.fecha), 'Comprobante': D.TIPOS[v.tipo].nombre, 'N° interno': v.nro, 'Estado': v.estado, 'Cliente': (D.cli(S(), v.clienteId) || {}).nombre, 'Cómo pagó': D.medioVenta(v), 'Total': v.total, 'Atendió': D.uNombre(S(), v.usuario) })), 'Devoluciones': st.ds.map((d) => ({ 'Fecha': U.fDT(d.fecha), 'N°': d.nro, 'Motivo': d.motivo, 'Total': d.total, 'Reintegro': D.ML(d.reintegro.medio) })), 'Gastos': st.gs.map((g) => ({ 'Fecha': U.fD(g.fecha), 'Tipo': g.categoria, 'Detalle': g.detalle, 'Monto': g.monto })) });
    return UI.exportPDF(`historial-${U.slug(Rg.label)}.pdf`, 'Historial de ventas', Rg.label, [
      { titulo: 'Resultado del período', head: ['Concepto', 'Importe'], body: [['Vendiste (con IVA)', f$(st.brutas)], ['Devoluciones', f$(-st.devoluciones)], ['IVA', f$(-st.iva)], ['Costo de lo vendido', f$(-st.cmv)], ['Gastos del local', f$(-st.gastos)], ['Ganancia estimada', f$(st.ganancia)], ['Entró de plata', f$(st.cobros)], ['Quedó fiado', f$(st.fiado)]], nota: 'Ganancia estimada = ventas sin IVA − costo de lo vendido − gastos. No incluye impuestos a las ganancias ni Ingresos Brutos.' },
      { titulo: Rg.tipo === 'anio' ? 'Mes por mes' : Rg.tipo === 'dia' ? 'Por hora' : 'Día por día', head: ['Período', 'Ventas', 'Vendiste', 'Ganancia est.'], body: resumen.map((r) => [r['Período'], r['Ventas'], f$(r['Vendiste']), f$(r['Ganancia estimada'])]) }
    ]);
  }
  function exportInv(pdf) {
    const inv = R.inventario(S(), invDias);
    const rows = inv.filas.map((f) => ({ 'Producto': f.p.nombre, 'Categoría': f.p.categoria, 'Stock': f.p.stock, 'Precio de compra': f.p.costo, 'Precio de venta': f.p.precio, 'Valor a costo': f.valorCosto, 'Valor a precio de venta': f.valorVenta, ['Vendidos ' + invDias + ' días']: f.vendidas, 'Alcanza para (días)': f.cobertura, 'Margen %': f.margen }));
    if (!pdf) return UI.exportXLSX(`inventario-${U.today()}.xlsx`, { 'Inventario': rows });
    return UI.exportPDF(`inventario-${U.today()}.pdf`, 'Inventario valorizado', `Ventas de los últimos ${invDias} días`, [
      { titulo: 'Totales', head: ['Concepto', 'Importe'], body: [['Valor a costo', f$(inv.totalCosto)], ['Valor a precio de venta', f$(inv.totalVenta)], ['Productos sin ventas', String(inv.sinMovimiento.length)]] },
      { titulo: 'Detalle por producto', head: ['Producto', 'Stock', 'Costo', 'Valor costo', 'Vendidos', 'Margen'], body: inv.filas.map((f) => [f.p.nombre, fn(f.p.stock), f$(f.p.costo), f$(f.valorCosto), fn(f.vendidas), fn(f.margen) + '%']), nota: 'Valor a costo = stock × precio de compra registrado. Margen = (precio sin IVA − costo) ÷ precio sin IVA.' }
    ]);
  }
  Object.assign(UI.act, {
    itab: (b) => { tab = b.dataset.t; UI.render(); },
    hptipo: (b) => { hp.tipo = b.dataset.t; UI.render(); },
    hpmov: (b) => { hp.ref = R.moverRef(hp.tipo, hp.ref || U.today(), +b.dataset.d); if (new Date(hp.ref + 'T00:00') > new Date()) hp.ref = U.today(); UI.render(); },
    hphoy: () => { hp.ref = U.today(); UI.render(); },
    hpdrill: (b) => { hp.tipo = b.dataset.t; hp.ref = b.dataset.r; UI.render(); root.scrollTo(0, 0); },
    exphist: () => exportHist(false), pdfhist: () => exportHist(true),
    expinv: () => exportInv(false), pdfinv: () => exportInv(true),
    pdfpend: () => { const p = R.pendientes(S()); UI.exportPDF(`pendientes-${U.today()}.pdf`, 'Pagos y cobros pendientes', U.fD(new Date()), [{ titulo: 'Le debés a proveedores', head: ['Proveedor', 'Factura', 'Vence', 'Falta pagar'], body: p.deudas.map((d) => [d.pv.nombre, d.c.tipo + ' ' + d.c.nroComp, U.fD(d.vence) + (d.vencida ? ' (vencida)' : ''), f$(d.resta)]) }, { titulo: 'Te deben de fiado', head: ['Cliente', 'Saldo'], body: p.fiados.map((x) => [x.c.nombre, f$(x.saldo)]) }]); },
    expiva: () => { rMes = rMes || U.today().slice(0, 7); UI.exportXLSX(`para-el-contador-${rMes}.xlsx`, { 'IVA Ventas (control)': R.rowsIvaVentas(S(), rMes), 'IVA Compras': R.rowsIvaCompras(S(), rMes), 'Aclaración': [{ 'Aclaración': 'Comprobantes emitidos desde Mostrador sin CAE: son de control interno y no reemplazan lo autorizado en ARCA.' }] }); },
    pdfiva: () => { rMes = rMes || U.today().slice(0, 7); const v = R.rowsIvaVentas(S(), rMes), c = R.rowsIvaCompras(S(), rMes); UI.exportPDF(`libros-iva-${rMes}.pdf`, 'Libros de IVA (control interno)', U.mLabel(rMes), [{ titulo: 'IVA Ventas', head: ['Fecha', 'Tipo', 'N° interno', 'Cliente', 'Neto 21%', 'IVA 21%', 'Total', 'ARCA'], body: v.map((r) => [r['Fecha'], r['Tipo previsto'], r['N° interno'], r['Cliente'], f$(r['Neto 21%']), f$(r['IVA 21%']), f$(r['Total']), r['Estado ARCA']]), nota: 'Comprobantes sin CAE: control interno, no reemplazan lo autorizado en ARCA.' }, { titulo: 'IVA Compras', head: ['Fecha', 'Comprobante', 'Número', 'Proveedor', 'Neto', 'IVA', 'Total'], body: c.map((r) => [r['Fecha'], r['Comprobante'], r['Número'], r['Proveedor'], f$(r['Neto gravado']), f$(r['IVA crédito fiscal']), f$(r['Total'])]) }]); },
    expall: () => {
      const s = S(); rMes = rMes || U.today().slice(0, 7);
      UI.exportXLSX(`${U.slug(s.config.nombre)}-${U.today()}.xlsx`, {
        'Productos': s.productos.map((p) => ({ 'Código': p.codigo, 'Producto': p.nombre, 'Categoría': p.categoria, 'Proveedor': (D.prov(s, p.provId) || {}).nombre || '', 'Precio de compra': p.costo, 'Ganancia %': p.margen, 'IVA %': p.iva, 'Precio de venta': p.precio, 'Stock': p.stock, 'Estado': p.activo === false ? 'Archivado' : 'Activo' })),
        'Ventas': s.ventas.map((v) => ({ 'Fecha': U.fDT(v.fecha), 'Comprobante': D.TIPOS[v.tipo].nombre, 'N° interno': v.nro, 'Estado': v.estado, 'Cliente': (D.cli(s, v.clienteId) || {}).nombre, 'Cómo pagó': D.medioVenta(v), 'Neto': v.neto, 'IVA': U.r2(v.i21 + v.i105), 'Total': v.total, 'Costo mercadería': v.costo, 'Atendió': D.uNombre(s, v.usuario) })),
        'Detalle de ventas': s.ventas.flatMap((v) => v.items.map((i) => ({ 'Fecha': U.fDT(v.fecha), 'N° interno': v.nro, 'Producto': i.nombre, 'Cantidad': i.cant, 'Devuelto': i.devuelto || 0, 'Precio': i.precio }))),
        'Devoluciones': s.devoluciones.map((d) => ({ 'Fecha': U.fDT(d.fecha), 'N°': d.nro, 'Venta': (s.ventas.find((v) => v.id === d.ventaId) || {}).nro, 'Motivo': d.motivo, 'Total': d.total, 'Reintegro': D.ML(d.reintegro.medio) })),
        'Movimientos de stock': s.movimientos.map((m) => ({ 'Fecha': U.fDT(m.fecha), 'Producto': (D.prod(s, m.pid) || {}).nombre, 'Tipo': D.MOV_TIPOS[m.tipo] || m.tipo, 'Cantidad': m.cant, 'Antes': m.antes, 'Después': m.despues, 'Usuario': D.uNombre(s, m.usuario), 'Motivo': m.motivo })),
        'Compras': s.compras.map((c) => ({ 'Fecha': U.fD(c.fecha), 'Proveedor': (D.prov(s, c.provId) || {}).nombre, 'Comprobante': c.tipo, 'Número': c.nroComp, 'Total': c.total, 'Pago': c.cond === 'cc' ? 'Cuenta corriente' : 'Contado ' + c.medio })),
        'Gastos': s.gastos.map((g) => ({ 'Fecha': U.fD(g.fecha), 'Tipo': g.categoria, 'Detalle': g.detalle, 'Monto': g.monto, 'Anulado': g.anulado ? g.anulado.motivo : '' })),
        'Cajas': s.cajas.map((c) => ({ 'Abrió': U.fDT(c.abre.fecha), 'Cambio inicial': c.abre.monto, 'Cerró': c.cierra ? U.fDT(c.cierra.fecha) : 'Abierta', 'Esperado': c.cierra ? c.cierra.esperado : '', 'Contado': c.cierra ? c.cierra.contado : '', 'Diferencia': c.cierra ? c.cierra.dif : '', 'Motivo': c.cierra ? c.cierra.motivo : '' }))
      });
    }
  });
  Object.assign(UI.change, { rmes: (t) => { rMes = t.value; UI.render(); }, invd: (t) => { invDias = +t.value; UI.render(); } });
  UI.views.informes = { title: 'Informes', render: view, setTab: (t) => { tab = t; } };
})(typeof window !== 'undefined' ? window : globalThis);
