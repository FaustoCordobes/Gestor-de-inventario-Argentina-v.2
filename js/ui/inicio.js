/* Mostrador · ui/inicio.js
 * Pantalla de inicio: accesos rápidos según el rol, números del día y avisos
 * con un botón para resolver cada uno.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI, R = M.R;
  const { esc, f$ } = U;
  const { APP, ic } = UI;
  const S = () => APP.S;

  function view() {
    const s = S(), t = U.today(), h = new Date().getHours(), u = UI.user();
    const saludo = h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    const vh = s.ventas.filter((v) => U.dkey(v.fecha) === t);
    const hoy = R.resultado(s, R.rango('dia', t));
    const mes = R.resultado(s, R.rango('mes', t));
    const caja = D.cajaAbierta(s);
    const low = D.lowStock(s), agot = low.filter((p) => p.stock <= 0);
    const pend = R.pendientes(s);
    const vencidas = pend.deudas.filter((d) => d.vencida);
    const alerts = [];
    if (!caja && UI.can('caja.abrir')) alerts.push(['bad', '<b>La caja está cerrada.</b> Abrila para empezar a vender.', 'Abrir la caja', 'abrircaja']);
    if (caja && U.dkey(caja.abre.fecha) !== t) alerts.push(['warn', `<b>La caja está abierta desde el ${U.fD(caja.abre.fecha)}.</b> Cerrala para controlar el efectivo de cada día.`, 'Cerrar la caja', 'cierre']);
    if (UI.can('producto.ver')) {
      if (agot.length) alerts.push(['bad', `<b>${agot.length === 1 ? esc(agot[0].nombre) + ' se quedó sin stock' : agot.length + ' productos se quedaron sin stock'}.</b>`, 'Ver qué falta', 'gofalta']);
      if (low.length > agot.length) { const n = low.length - agot.length; alerts.push(['warn', `<b>${n === 1 ? '1 producto se está' : n + ' productos se están'} por acabar.</b> Conviene ${n === 1 ? 'pedirlo' : 'pedirlos'}.`, 'Armar pedido', 'gofalta']); }
    }
    if (pend.pedidos.length && UI.can('compra.recibir')) alerts.push(['', `Tenés ${pend.pedidos.length === 1 ? 'un pedido' : pend.pedidos.length + ' pedidos'} a proveedores esperando llegar.`, 'Ver pedidos', 'gopedidos']);
    if (vencidas.length && UI.can('proveedor.pagar')) alerts.push(['bad', `<b>Tenés ${vencidas.length === 1 ? 'una factura vencida' : vencidas.length + ' facturas vencidas'}</b> con proveedores por ${f$(U.sum(vencidas, 'resta'))}.`, 'Ver deudas', 'gopendientes']);
    else if (pend.totalDeuda > 0 && UI.can('proveedor.ver')) alerts.push(['warn', `Le debés <b>${f$(pend.totalDeuda)}</b> a proveedores (ninguna factura vencida).`, 'Ver proveedores', 'goprov']);
    if (pend.fiados.length && UI.can('cliente.ver')) alerts.push(['warn', `${pend.fiados.length === 1 ? esc(pend.fiados[0].c.nombre) + ' te debe' : pend.fiados.length + ' clientes te deben'} <b>${f$(pend.totalFiado)}</b> de fiado.`, 'Ver fiados', 'gocli']);
    if (s.workspace.modo === 'local' && UI.can('backup.exportar')) {
      const ult = s.meta.ultimaCopia; const dias = ult ? Math.floor((Date.now() - new Date(ult)) / 864e5) : null;
      if (dias === null || dias >= 7) alerts.push(['warn', `<b>${dias === null ? 'Todavía no descargaste ninguna copia de seguridad.' : `Hace ${dias} días que no descargás una copia de seguridad.`}</b> Tus datos están solo en este dispositivo.`, 'Descargar copia', 'backupdl']);
    }
    if (!alerts.length) alerts.push(['ok', 'Todo en orden. No hay nada pendiente.', '', '']);
    const G = s.guia; const pasos = [['venta', 'Hacé una venta de prueba', 'go', 'vender'], ['compra', 'Cargá mercadería que llegó', 'gollego', ''], ['cierre', 'Cerrá la caja del día', 'cierre', '']];
    const tiles = [
      UI.can('venta.crear') && `<button class="tile main" data-act="go" data-v="vender"><span class="ti">${ic('vender')}</span><b>Vender</b><span>Cobrar y hacer el comprobante</span></button>`,
      UI.can('compra.recibir') && `<button class="tile" data-act="gollego"><span class="ti">${ic('mercaderia')}</span><b>Llegó mercadería</b><span>Sumar al stock lo que trajo el proveedor</span></button>`,
      UI.can('gasto.crear') && `<button class="tile" data-act="gastonew"><span class="ti">${ic('gasto')}</span><b>Anotar un gasto</b><span>Luz, alquiler, insumos, sueldos</span></button>`,
      UI.can('stock.ajustar') && !UI.can('venta.crear') && `<button class="tile" data-act="gomov"><span class="ti">${ic('list')}</span><b>Movimientos de stock</b><span>Entradas, salidas y conteos</span></button>`,
      UI.can('caja.cerrar') && (caja ? `<button class="tile" data-act="cierre"><span class="ti">${ic('lock')}</span><b>Cerrar la caja</b><span>Contar la plata al final del día</span></button>` : `<button class="tile" data-act="abrircaja"><span class="ti">${ic('unlock')}</span><b>Abrir la caja</b><span>Contar el cambio para empezar</span></button>`)
    ].filter(Boolean).join('');
    return `<div class="head"><div><h1>${saludo}${u ? ', ' + esc(u.nombre.split(' ')[0]) : ''}</h1><p>${esc(s.config.nombre)} · ${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><div class="toolbar"><button class="help" data-act="help" data-k="inicio">${ic('help')}¿Cómo se usa?</button></div></div>
      ${s.workspace.modo === 'demo' ? `<div class="note"><strong>Estás en la demostración.</strong> Los datos son de un almacén ficticio y podés tocar todo. Cuando quieras usarlo con tu negocio, entrá a <button class="link" data-act="go" data-v="config">Configuración → Datos</button>.</div>` : ''}
      ${!G.oculta ? `<div class="card"><div class="card-h"><h2>Primeros pasos</h2><button class="link" data-act="guiaoff">Ocultar</button></div><div class="card-b"><div class="steps">${pasos.map(([k, l, a, v], i) => `<div class="step ${G[k] ? 'done' : ''}"><span class="ck">${G[k] ? ic('check') : i + 1}</span><div><b>${l}</b><br>${G[k] ? '<span class="hint">¡Listo!</span>' : `<button class="link" data-act="${a}" data-v="${v}">Hacerlo ahora</button>`}</div></div>`).join('')}</div></div></div>` : ''}
      <div class="tiles">${tiles}</div>
      <div class="kpis">
        <div class="kpi"><span class="l">Vendiste hoy</span><span class="v">${f$(hoy.ventas)}</span><span class="s">${vh.length} ${vh.length === 1 ? 'venta' : 'ventas'}${hoy.devoluciones ? ' · ' + f$(hoy.devoluciones) + ' devuelto' : ''}</span></div>
        <div class="kpi"><span class="l">Efectivo que tiene que haber en la caja</span><span class="v">${caja ? f$(D.cajaEsperado(s, caja)) : '—'}</span><span class="s">${caja ? 'Caja abierta a las ' + U.fH(caja.abre.fecha) + ' con ' + f$(caja.abre.monto) : 'La caja está cerrada'}</span></div>
        ${UI.can('informes.ver') ? `<div class="kpi ${mes.ganancia >= 0 ? 'good' : 'alert'}"><span class="l">Ganancia estimada del mes (hasta hoy)</span><span class="v">${f$(mes.ganancia)}</span><span class="s">Ventas sin IVA − costo de lo vendido − gastos</span></div>` : ''}
      </div>
      <div class="grid ${UI.can('informes.ver') ? 'g-main' : ''}">
        <div class="card"><div class="card-h"><h2>Avisos</h2></div><div class="card-b"><div class="alerts">${alerts.map(([c, txt, btn, act]) => `<div class="alertrow"><span class="dot ${c}"></span><p>${txt}</p>${btn ? `<button class="btn sm" data-act="${act}">${btn}</button>` : ''}</div>`).join('')}</div></div></div>
        ${UI.can('informes.ver') ? `<div class="card"><div class="card-h"><h2>Ventas de las últimas 2 semanas</h2></div><div class="card-b chart">${chart14()}<p class="hint" style="margin:6px 0 0">La barra verde es hoy.</p></div></div>` : ''}
      </div>`;
  }
  function chart14() {
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(U.dkey(d)); }
    const vals = days.map((k) => R.resultado(S(), R.rango('dia', k)).ventas);
    return UI.chartBars(days.map((k) => String(+k.slice(8))), vals, 13, 'Ventas diarias de las últimas dos semanas');
  }
  Object.assign(UI.act, {
    guiaoff: () => UI.run((s) => { s.guia.oculta = true; }),
    gollego: () => UI.go('mercaderia', 'llego'),
    gofalta: () => UI.go('mercaderia', 'falta'),
    gopedidos: () => UI.go('mercaderia', 'pedidos'),
    gomov: () => UI.go('mercaderia', 'movimientos'),
    gopendientes: () => UI.go('informes', 'pendientes'),
    goprov: () => UI.go('proveedores'),
    gocli: () => UI.go('clientes')
  });
  UI.views.inicio = { title: 'Inicio', render: view };
})(typeof window !== 'undefined' ? window : globalThis);
