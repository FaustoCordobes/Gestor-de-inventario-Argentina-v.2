/* Mostrador · ui/vender.js
 * Punto de venta pensado para atender rápido:
 * - Lectora de código de barras (también etiquetas de balanza) con foco automático.
 * - Atajos: F2 buscar · F4 cliente/factura · F6 forma de pago · F7 dividir pago ·
 *   F8 descuento · F9 o Ctrl+Enter cobrar · F10 últimas ventas · Supr quitar último ·
 *   + / − cantidad del último · ↑ ↓ elegir resultado · Enter agregar · Esc limpiar.
 * - La venta en curso se guarda en la sesión: si se recarga la página no se pierde.
 * - Pago simple con cálculo de vuelto o pago dividido en varios medios.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI, T = M.Ticket;
  const { esc, f$, fn, r2 } = U;
  const { APP, ic, opt, mHead, head, $ } = UI;

  const nuevoPos = (cat) => ({ items: [], clienteId: 'c0', tipo: null, desc: 0, medio: 'Efectivo', split: null, recibido: 0, cat: cat || '', q: '', opts: false, sel: 0, opId: U.uid() });
  let pos = nuevoPos();
  const KEY = () => 'mostrador4:pos:' + APP.ws;
  function guardarBorrador() { try { root.sessionStorage.setItem(KEY(), JSON.stringify(pos)); } catch (e) { /* sin sesión: no pasa nada */ } }
  function cargarBorrador() { try { const r = root.sessionStorage.getItem(KEY()); if (r) { const p = JSON.parse(r); if (p && Array.isArray(p.items)) pos = Object.assign(nuevoPos(), p); } } catch (e) { pos = nuevoPos(); } }
  M.UI.posReset = () => { pos = nuevoPos(); cargarBorrador(); };

  const S = () => APP.S;
  const calc = () => D.calcVenta(S(), pos.items.map((i) => { const p = D.prod(S(), i.pid) || {}; return { ...i, precio: p.precio || 0, costo: p.costo || 0, iva: p.iva || 0 }; }), pos.desc);
  const MEDIOS_POS = D.MEDIOS;

  function view() {
    if (!UI.can('venta.crear')) return head('Vender', 'Tu usuario no tiene permiso para vender.');
    const cats = [...new Set(S().productos.filter((p) => p.activo !== false).map((p) => p.categoria))];
    return head('Vender', 'Escaneá el código o buscá el producto.', `<button class="btn" data-act="ultventas">${ic('list')}Últimas ventas <kbd>F10</kbd></button><button class="btn ghost" data-act="atajos">${ic('kbd')}Atajos</button>`, 'vender') +
      `<div class="kbdhint" aria-hidden="true"><span><kbd>F2</kbd> buscar</span><span><kbd>↑</kbd><kbd>↓</kbd> elegir</span><span><kbd>Enter</kbd> agregar</span><span><kbd>+</kbd><kbd>−</kbd> cantidad</span><span><kbd>F6</kbd> forma de pago</span><span><kbd>F9</kbd> cobrar</span></div>
      <div class="pos"><section style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <form class="scan" data-form="scan" autocomplete="off"><input id="pos-q" type="search" placeholder="Buscá un producto o escaneá el código" value="${esc(pos.q)}" aria-label="Buscar producto o escanear código" enterkeyhint="done"><button class="btn primary" type="submit">${ic('plus')}Agregar</button></form>
        <div class="chips"><button class="chip" data-act="poscat" data-c="" aria-pressed="${!pos.cat}">Todo</button>${cats.map((c) => `<button class="chip" data-act="poscat" data-c="${esc(c)}" aria-pressed="${pos.cat === c}">${esc(c)}</button>`).join('')}</div>
        <div class="pgrid" id="pos-grid" role="listbox" aria-label="Productos"></div>
      </section>
      <section class="card cart" id="pos-cart" aria-label="Venta actual"></section></div>`;
  }
  function after() { cargarBorrador(); renderGrid(); renderCart(); focoBuscar(); }
  function focoBuscar() { if (root.innerWidth > 860 && !UI.modalAbierto()) { const q = $('#pos-q'); if (q && root.document.activeElement !== q) q.focus(); } }

  function filtrados() {
    const q = pos.q.trim().toLowerCase();
    return S().productos.filter((p) => p.activo !== false && (!pos.cat || p.categoria === pos.cat) && (!q || p.nombre.toLowerCase().includes(q) || p.codigo.includes(q)));
  }
  const MAX_GRID = 60;
  function renderGrid() {
    const el = $('#pos-grid'); if (!el) return; const list = filtrados();
    if (pos.sel >= list.length) pos.sel = Math.max(0, list.length - 1);
    el.innerHTML = list.length ? list.slice(0, MAX_GRID).map((p, i) => `<button class="pbtn ${p.stock <= 0 ? 'out' : ''} ${i === pos.sel && pos.q ? 'sel' : ''}" role="option" aria-selected="${i === pos.sel && !!pos.q}" data-act="posadd" data-id="${p.id}"><span class="pn">${esc(p.nombre)}</span><span class="ps ${p.stock <= p.stockMin ? 'bad' : ''}">${p.stock <= 0 ? 'Sin stock' : 'Quedan ' + fn(p.stock) + (p.unidad === 'kg' ? ' kg' : '')}</span><span class="pp">${f$(p.precio)}${p.unidad === 'kg' ? '<small> /kg</small>' : ''}</span></button>`).join('') + (list.length > MAX_GRID ? `<div class="hint" style="grid-column:1/-1">Mostrando ${MAX_GRID} de ${list.length}. Seguí escribiendo para encontrar más rápido.</div>` : '')
      : '<div class="empty" style="grid-column:1/-1">No encontramos ese producto. Probá con otra palabra o revisá el código.</div>';
  }

  function agregar(id, cant) {
    const p = D.prod(S(), id); if (!p) return;
    if (p.activo === false) { UI.toast(`"${p.nombre}" está archivado.`, { error: true }); return; }
    const step = cant || (p.unidad === 'kg' ? 0.5 : 1);
    const it = pos.items.find((i) => i.pid === id);
    const total = U.r3((it ? it.cant : 0) + step);
    if (total > p.stock && !S().config.stockNegativo) { UI.toast(p.stock <= 0 ? `No queda stock de ${p.nombre}` : `Solo quedan ${fn(p.stock)} de ${p.nombre}`, { error: true }); if (!it && p.stock > 0) pos.items.push({ pid: id, cant: U.r3(p.stock) }); else if (it) it.cant = U.r3(p.stock); }
    else if (it) { it.cant = total; pos.items.splice(pos.items.indexOf(it), 1); pos.items.push(it); }
    else pos.items.push({ pid: id, cant: step });
    renderCart();
  }
  /** Procesa un código leído: exacto, por etiqueta de balanza o búsqueda. */
  function procesarCodigo(code) {
    const q = String(code || '').trim(); if (!q) return false;
    const ex = S().productos.find((p) => p.codigo === q && p.activo !== false);
    if (ex) { agregar(ex.id); return true; }
    const bz = D.leerBalanza(S(), q);
    if (bz) { agregar(bz.p.id, bz.cant); UI.toast(`${bz.p.nombre}: ${fn(bz.cant)} kg`); return true; }
    return false;
  }

  function renderCart() {
    guardarBorrador();
    const el = $('#pos-cart'); if (!el) return;
    const caja = D.cajaAbierta(S());
    if (!caja) {
      el.innerHTML = `<div class="card-b"><div class="cajacerrada"><b>${ic('lock')} La caja está cerrada</b><p>Para empezar a vender, abrí la caja contando el cambio con el que arrancás.</p>${UI.can('caja.abrir') ? '<button class="btn primary" data-act="abrircaja">Abrir la caja</button>' : '<p class="hint">Pedile a un encargado que la abra.</p>'}</div></div>`;
      return;
    }
    const perm = D.tiposPermitidos(S(), pos.clienteId); if (!pos.tipo || !perm.includes(pos.tipo)) pos.tipo = perm[0];
    const v = calc(); const c = D.cli(S(), pos.clienteId) || { nombre: 'Consumidor Final' };
    const vuelto = pos.recibido - v.total;
    const red = Math.ceil(v.total / 1000) * 1000;
    const opciones = [...new Set([v.total, red, ...[2000, 5000, 10000, 20000].filter((b) => b > red)])].slice(0, 4);
    const lineas = pos.items.map((i, ix) => {
      const p = D.prod(S(), i.pid) || { nombre: '?', precio: 0, unidad: 'u' }; const kg = p.unidad === 'kg';
      return `<div class="cl"><div style="min-width:0"><div class="nm">${esc(p.nombre)}</div><div class="pu">${f$(p.precio)} ${kg ? 'el kilo' : 'c/u'} · <b>${f$(p.precio * i.cant)}</b></div></div>
        <div class="qty"><button data-act="posqty" data-ix="${ix}" data-d="-1" aria-label="Uno menos de ${esc(p.nombre)}">${ic('minus')}</button><input type="number" id="cant-${ix}" aria-label="Cantidad de ${esc(p.nombre)}" min="0" step="${kg ? '0.05' : '1'}" value="${i.cant}" data-poscant="${ix}" inputmode="decimal"><button data-act="posqty" data-ix="${ix}" data-d="1" aria-label="Uno más de ${esc(p.nombre)}">${ic('plus')}</button></div>
        <button class="x" data-act="posdel" data-ix="${ix}" aria-label="Quitar ${esc(p.nombre)}">×</button></div>`;
    }).join('');
    let pago = '';
    if (pos.split) {
      const tot = r2(U.sum(pos.split, (x) => U.num(x.monto))); const falta = r2(v.total - tot);
      pago = `<div class="field"><span class="lb">Pago dividido</span>${pos.split.map((x, i) => `<div class="split"><select id="sp-m-${i}" aria-label="Medio ${i + 1}" data-split="medio" data-ix="${i}">${MEDIOS_POS.map((m) => opt(m, D.ML(m), x.medio)).join('')}</select><input id="sp-v-${i}" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Monto ${i + 1}" value="${x.monto}" data-split="monto" data-ix="${i}" style="width:120px"><button class="x" data-act="spdel" data-ix="${i}" aria-label="Quitar medio">×</button></div>`).join('')}
        <div class="toolbar"><button class="btn sm" data-act="spadd">${ic('plus')}Agregar medio</button>${Math.abs(falta) > 0.009 ? `<button class="btn sm" data-act="spfill">Completar ${f$(falta)}</button>` : ''}<button class="link" data-act="spoff">Volver a un solo medio</button></div>
        <div class="sumrow"><span>${Math.abs(falta) <= 0.009 ? 'Pago completo' : falta > 0 ? 'Falta pagar' : 'Sobra'}</span><b style="color:${Math.abs(falta) <= 0.009 ? 'var(--ok)' : 'var(--bad)'}">${f$(Math.abs(falta))}</b></div></div>`;
    } else {
      pago = `<div class="field"><span class="lb">¿Cómo paga? <kbd>F6</kbd></span><div class="choices">${MEDIOS_POS.map((m) => `<button class="choice" data-act="posmedio" data-m="${m}" aria-pressed="${pos.medio === m}">${D.ML(m)}</button>`).join('')}</div><button class="link" data-act="spon" style="margin-top:4px">Dividir el pago en varios medios <kbd>F7</kbd></button></div>
        ${pos.medio === 'Efectivo' && pos.items.length ? `<div class="field"><span class="lb">¿Con cuánto paga?</span><div class="chips">${opciones.map((b) => `<button class="chip" data-act="pospaga" data-v="${b}" aria-pressed="${pos.recibido === b}">${b === v.total ? 'Justo' : f$(b).replace(',00', '')}</button>`).join('')}<input type="number" id="pos-paga" min="0" step="100" placeholder="Otro monto" aria-label="Otro monto" inputmode="decimal" value="${pos.recibido && !opciones.includes(pos.recibido) ? pos.recibido : ''}" data-pos="recibido" style="width:130px"></div>
        ${pos.recibido > 0 ? `<div class="sumrow"><span>${vuelto >= 0 ? 'Vuelto' : 'Le falta pagar'}</span><span class="vuelto" style="color:${vuelto < 0 ? 'var(--bad)' : 'var(--ok)'}">${f$(Math.abs(vuelto))}</span></div>` : ''}</div>` : ''}
        ${pos.medio === 'Cuenta corriente' && pos.clienteId === 'c0' ? '<div class="note"><strong>Para fiar, elegí el cliente</strong> en "Cliente y factura".</div>' : ''}`;
    }
    el.innerHTML = `<div class="card-h"><h2>Venta actual</h2>${pos.items.length ? '<button class="btn ghost sm" data-act="posclear">Empezar de nuevo</button>' : ''}</div>
      <div class="cart-lines" style="margin-top:12px">${lineas || '<div class="empty">Todavía no agregaste productos.</div>'}</div>
      <div class="card-b" style="display:flex;flex-direction:column;gap:12px">
        <div class="tot big"><span>Total</span><span>${f$(v.total)}</span></div>
        ${pos.desc ? `<div class="tot small"><span>Incluye ${fn(pos.desc)}% de descuento (−${f$(v.bruto - v.total)})</span></div>` : ''}
        ${pago}
        <div class="sumrow"><span><span class="hint">Cliente y factura <kbd>F4</kbd></span><br><b>${esc(c.nombre)}</b> · ${D.TIPOS[pos.tipo].nombre}${pos.desc ? ' · ' + fn(pos.desc) + '% desc.' : ''}</span><button class="link" data-act="posopts">${pos.opts ? 'Listo' : 'Cambiar'}</button></div>
        ${pos.opts ? `<div class="form" style="grid-template-columns:1fr 1fr">
          <div class="field full"><label for="pos-cli">Cliente</label><select id="pos-cli" data-pos="clienteId">${S().clientes.map((x) => opt(x.id, x.nombre, pos.clienteId)).join('')}</select></div>
          <div class="field"><label for="pos-tipo">Comprobante</label><select id="pos-tipo" data-pos="tipo">${perm.map((t) => opt(t, D.TIPOS[t].nombre, pos.tipo)).join('')}</select></div>
          <div class="field"><label for="pos-desc">Descuento % <kbd>F8</kbd></label><input id="pos-desc" type="number" min="0" max="${UI.can('venta.descuento_libre') ? 100 : S().config.descMaxVendedor}" step="1" value="${pos.desc}" data-pos="desc" inputmode="decimal"></div>
          <p class="hint full">${S().config.condIva === 'MONO' ? 'Como sos monotributista, corresponde Factura C.' : 'Se elige sola: Factura A si el cliente es Responsable Inscripto, Factura B para el resto.'} ${UI.can('venta.descuento_libre') ? '' : `Como vendedor podés hacer hasta ${S().config.descMaxVendedor}% de descuento.`}</p></div>` : ''}
        <button class="btn primary big" data-act="cobrar" ${pos.items.length ? '' : 'disabled'}>${pos.items.length ? 'Cobrar ' + f$(v.total) : 'Cobrar'} <kbd style="margin-left:6px">F9</kbd></button>
        ${pos.tipo !== 'TK' ? '<p class="hint" style="margin:0">Sin conexión con ARCA configurada: se emite como comprobante interno, sin CAE.</p>' : ''}
      </div>`;
  }

  async function cobrar() {
    if (!pos.items.length) return;
    const v0 = calc();
    let pagos;
    if (pos.split) pagos = pos.split.map((x) => ({ medio: x.medio, monto: U.num(x.monto) }));
    else pagos = [{ medio: pos.medio, monto: v0.total }];
    if (!pos.split && pos.medio === 'Cuenta corriente' && pos.clienteId === 'c0') { pos.opts = true; renderCart(); UI.toast('Para fiar, elegí a qué cliente', { error: true }); return; }
    const params = { opId: pos.opId, items: pos.items.map((i) => ({ pid: i.pid, cant: i.cant })), clienteId: pos.clienteId, tipo: pos.tipo, desc: pos.desc, pagos, recibido: !pos.split && pos.medio === 'Efectivo' && pos.recibido > 0 ? pos.recibido : null };
    const btn = $('[data-act="cobrar"]'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    const v = await UI.run((d, u) => D.registrarVenta(d, u, params), { render: false });
    if (!v) { renderCart(); return; }
    pos = nuevoPos(pos.cat); guardarBorrador();
    UI.render();
    if (S().config.ticket && S().config.ticket.auto && APP.puedeImprimir) T.imprimirVenta(v);
    ventaLista(v);
  }
  function ventaLista(v) {
    UI.openModal(`<div class="mh"><h2>Venta registrada</h2><button class="x" data-act="close" aria-label="Cerrar">×</button></div><div class="mb"><div class="done-hero"><span class="ok">${ic('check')}</span><span class="amt">${f$(v.total)}</span><span class="muted">${esc(D.medioVenta(v))} · ${esc(D.TIPOS[v.tipo].nombre)} · N° ${esc(v.nro)}</span></div>
      ${v.vuelto > 0 ? `<div class="sumrow"><span>Dale de vuelto</span><span class="vuelto" style="color:var(--ok)">${f$(v.vuelto)}</span></div>` : ''}
      ${v.tipo !== 'TK' ? '<p class="hint" style="margin:0;text-align:center">Comprobante interno sin CAE: no es una factura válida hasta configurar ARCA.</p>' : ''}</div>
      <div class="mf"><button class="btn sp" data-act="vercbte" data-id="${v.id}">Ver comprobante</button>${APP.puedeImprimir ? `<button class="btn" data-act="printv" data-id="${v.id}">${ic('print')}Imprimir <kbd>P</kbd></button>` : ''}<button class="btn" data-act="copycbte" data-id="${v.id}">${ic('copy')}WhatsApp</button><button class="btn primary" data-act="nuevaventa">Nueva venta <kbd>Enter</kbd></button></div>`, false, () => focoBuscar());
  }

  /* ---------- Comprobante, últimas ventas y devoluciones ---------- */
  function verComprobante(id) {
    const v = S().ventas.find((x) => x.id === id); if (!v) return;
    const devs = S().devoluciones.filter((d) => d.ventaId === v.id);
    UI.openModal(mHead(`${esc(D.TIPOS[v.tipo].nombre)} N° ${esc(v.nro)}`, `${U.fDT(v.fecha)} · Atendió ${esc(D.uNombre(S(), v.usuario))} ${UI.estadoVenta(v)} ${UI.fiscalTag(v)}`) +
      `<div class="mb">${T.comprobanteHTML(v, S())}
        ${devs.length ? `<div class="card"><div class="card-h"><h2>Devoluciones</h2></div><div class="card-b"><div class="list">${devs.map((d) => `<div class="li"><div class="t"><b>N° ${esc(d.nro)} · ${U.fDT(d.fecha)}</b><span class="hint">${esc(d.motivo)} · ${d.items.map((l) => fn(l.cant) + ' x ' + esc(l.nombre)).join(', ')} · Reintegro: ${esc(D.ML(d.reintegro.medio))} · ${esc(D.uNombre(S(), d.usuario))}</span></div><b class="num">−${f$(d.total)}</b></div>`).join('')}</div></div></div>` : ''}
      </div>
      <div class="mf">${UI.can('venta.devolver') && v.estado !== 'anulada' ? `<button class="btn danger sp" data-act="devolver" data-id="${v.id}">${ic('back')}Devolver o anular</button>` : ''}${APP.puedeImprimir ? `<button class="btn" data-act="printv" data-id="${v.id}">${ic('print')}Imprimir ticket</button>` : ''}<a class="btn" href="${UI.waLink(T.textoVenta(v, S()))}" target="_blank" rel="noopener">${ic('wa')}Enviar por WhatsApp</a><button class="btn primary" data-act="close">Cerrar</button></div>`, true);
  }
  let ultQ = '';
  function ultimasVentas() {
    const q = ultQ.trim().toLowerCase();
    const list = S().ventas.slice().reverse().filter((v) => !q || v.nro.includes(q) || (D.cli(S(), v.clienteId) || {}).nombre.toLowerCase().includes(q)).slice(0, 40);
    UI.openModal(mHead('Últimas ventas', 'Buscá por número o cliente. Tocá una para ver, reimprimir o devolver.') + `<div class="mb"><input type="search" id="ult-q" placeholder="N° de comprobante o cliente" value="${esc(ultQ)}" data-ultq="1" autofocus aria-label="Buscar venta"><div class="list" id="ult-list">${list.map((v) => `<div class="li"><div class="t"><b>${UI.cbBadge(v.tipo)} ${esc(v.nro)} · ${U.fDT(v.fecha)} ${UI.estadoVenta(v)}</b><span class="hint">${esc((D.cli(S(), v.clienteId) || {}).nombre)} · ${esc(D.medioVenta(v))} · ${v.items.length} ${v.items.length === 1 ? 'producto' : 'productos'}</span></div><span class="num"><b>${f$(v.total)}</b> <button class="btn sm" data-act="vercbte" data-id="${v.id}">Ver</button></span></div>`).join('') || '<div class="empty">No hay ventas con esa búsqueda.</div>'}</div></div>`, true);
  }
  let devSel = null;
  function devolverForm(id) {
    const v = S().ventas.find((x) => x.id === id); if (!v) return;
    devSel = { id, cant: {}, motivo: 'Producto fallado' };
    const fiado = v.pagos.some((p) => p.medio === 'Cuenta corriente');
    UI.openModal(mHead('Devolver o anular', `Venta N° ${esc(v.nro)} · ${f$(v.total)}`) + `<div class="mb">
      <p class="muted" style="margin:0">La venta no se borra: se registra una devolución que vuelve a sumar el stock y devuelve la plata${fiado ? ' (o descuenta la deuda del fiado)' : ''}.</p>
      <div class="tw"><table><thead><tr><th>Producto</th><th class="n">Vendido</th><th class="n">Ya devuelto</th><th class="n">Devolver</th></tr></thead><tbody>${v.items.map((it, idx) => { const disp = U.r3(it.cant - (it.devuelto || 0)); return `<tr><td>${esc(it.nombre)}</td><td class="n">${fn(it.cant)}</td><td class="n">${fn(it.devuelto || 0)}</td><td class="n"><input type="number" min="0" max="${disp}" step="${Number.isInteger(it.cant) ? 1 : 0.05}" value="0" id="dv-${idx}" data-dv="${idx}" aria-label="Cantidad a devolver de ${esc(it.nombre)}" style="width:90px" ${disp <= 0 ? 'disabled' : ''}></td></tr>`; }).join('')}</tbody></table></div>
      <div class="toolbar"><button class="btn sm" data-act="dvtodo" data-id="${v.id}">Devolver todo (anular la venta)</button></div>
      <div class="field"><span class="lb">Motivo</span><div class="chips">${['Producto fallado', 'Vencido', 'Se arrepintió', 'Venta cargada por error', 'Otro'].map((m) => `<button type="button" class="chip" data-act="dvmot" data-v="${m}" aria-pressed="${devSel.motivo === m}">${m}</button>`).join('')}</div><input type="text" id="dv-det" placeholder="Detalle (opcional)" aria-label="Detalle del motivo"></div>
      <div class="field"><label for="dv-medio">¿Cómo se le devuelve?</label><select id="dv-medio">${D.MEDIOS.filter((m) => m !== 'Cuenta corriente' || v.clienteId !== 'c0').map((m) => opt(m, m === 'Cuenta corriente' ? 'Descontar del fiado' : D.ML(m), fiado ? 'Cuenta corriente' : v.pagos[0].medio)).join('')}</select><span class="hint">Si es en efectivo, sale de la caja abierta.</span></div>
      <div id="dv-tot" class="sumrow"><span>A devolver</span><b>${f$(0)}</b></div>
      </div><div class="mf"><button class="btn" data-act="close">Cancelar</button><button class="btn danger solid" data-act="dvok" data-id="${v.id}">Registrar devolución</button></div>`, true);
  }
  function dvTotal() {
    const v = S().ventas.find((x) => x.id === devSel.id); const f = 1 - (v.desc || 0) / 100;
    const t = v.items.reduce((a, it, idx) => a + it.precio * U.num(($('#dv-' + idx) || {}).value) * f, 0);
    const el = $('#dv-tot'); if (el) el.innerHTML = `<span>A devolver</span><b>${f$(t)}</b>`;
  }
  async function dvOk(id) {
    const v = S().ventas.find((x) => x.id === id);
    const items = v.items.map((it, idx) => ({ idx, cant: U.num(($('#dv-' + idx) || {}).value) })).filter((x) => x.cant > 0);
    const det = ($('#dv-det') || {}).value || '';
    const motivo = devSel.motivo + (det.trim() ? ': ' + det.trim() : '');
    const medio = ($('#dv-medio') || {}).value;
    const ok = await UI.confirmar({ titulo: 'Confirmar devolución', texto: `<p>Se va a registrar la devolución y no se puede deshacer (queda en el historial).</p>`, ok: 'Sí, registrar', peligro: true });
    if (!ok) { devolverForm(id); return; }
    const d = await UI.run((s, u) => D.devolverVenta(s, u, { ventaId: id, items, motivo, medio }), { ok: (r) => `Devolución N° ${r.nro} registrada: ${f$(r.total)}` });
    if (d) verComprobante(id);
  }

  /* ---------- Abrir caja (también desde la caja) ---------- */
  function abrirCajaForm() {
    const ult = S().cajas.filter((c) => c.cierra).slice(-1)[0];
    const sug = ult ? ult.cierra.contado : 0;
    UI.openModal(mHead('Abrir la caja', 'Contá el efectivo con el que arrancás (el cambio).') + `<form data-form="abrircaja"><div class="mb"><div class="field"><label for="ac-m">Efectivo en la caja al abrir</label><input id="ac-m" name="monto" type="number" step="0.01" min="0" required value="${sug}" autofocus style="font-size:22px;font-weight:700" inputmode="decimal">${ult ? `<span class="hint">La última caja cerró con ${f$(ult.cierra.contado)} contados.</span>` : ''}</div></div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Abrir la caja</button></div></form>`);
  }

  function atajos() {
    const filas = [['F2', 'Ir al buscador (también funciona la lectora en cualquier momento)'], ['↑ ↓', 'Elegir entre los resultados de la búsqueda'], ['Enter', 'Agregar el producto elegido o el código escaneado'], ['+ / −', 'Sumar o restar una unidad al último producto'], ['Supr', 'Quitar el último producto'], ['F4', 'Cliente, tipo de comprobante y descuento'], ['F6', 'Cambiar la forma de pago'], ['F7', 'Dividir el pago en varios medios'], ['F8', 'Descuento'], ['F9 o Ctrl+Enter', 'Cobrar'], ['F10', 'Últimas ventas (reimprimir, devolver)'], ['Esc', 'Limpiar la búsqueda o cerrar ventanas'], ['Alt + 1…8', 'Cambiar de sección'], ['?', 'Ver esta ayuda']];
    UI.openModal(mHead('Atajos de teclado', 'Para vender sin usar el mouse. F5 no se usa: recarga la página (la venta en curso no se pierde).') + `<div class="mb"><div class="tw"><table><tbody>${filas.map(([k, d]) => `<tr><td style="white-space:nowrap">${k.split(' o ').map((x) => `<kbd>${x}</kbd>`).join(' o ')}</td><td>${d}</td></tr>`).join('')}</tbody></table></div></div><div class="mf"><button class="btn primary" data-act="close">Entendido</button></div>`);
  }

  /* ---------- Teclado ---------- */
  const enCampo = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  function keys(e) {
    const t = e.target;
    if (e.key === 'F2') { e.preventDefault(); const q = $('#pos-q'); if (q) { q.focus(); q.select(); } return true; }
    if (e.key === 'F4') { e.preventDefault(); pos.opts = !pos.opts; renderCart(); if (pos.opts) { const c = $('#pos-cli'); if (c) c.focus(); } return true; }
    if (e.key === 'F6') { e.preventDefault(); if (pos.split) pos.split = null; const i = MEDIOS_POS.indexOf(pos.medio); pos.medio = MEDIOS_POS[(i + 1) % MEDIOS_POS.length]; pos.recibido = 0; if (pos.medio === 'Cuenta corriente' && pos.clienteId === 'c0') pos.opts = true; renderCart(); return true; }
    if (e.key === 'F7') { e.preventDefault(); UI.act.spon(); return true; }
    if (e.key === 'F8') { e.preventDefault(); pos.opts = true; renderCart(); const d = $('#pos-desc'); if (d) { d.focus(); d.select(); } return true; }
    if (e.key === 'F9' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); cobrar(); return true; }
    if (e.key === 'F10') { e.preventDefault(); ultimasVentas(); return true; }
    if (t && t.id === 'pos-q') {
      const list = filtrados();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = Math.min(list.length, MAX_GRID); if (!n) return true; pos.sel = (pos.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; renderGrid(); const sel = $('#pos-grid .pbtn.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' }); return true; }
      if (e.key === 'Escape') { if (pos.q) { e.preventDefault(); pos.q = ''; t.value = ''; pos.sel = 0; renderGrid(); return true; } }
      return false;
    }
    if (enCampo(t)) return false;
    if (e.key === 'Delete' && pos.items.length) { e.preventDefault(); pos.items.pop(); renderCart(); return true; }
    if ((e.key === '+' || e.key === '-') && pos.items.length) { e.preventDefault(); UI.act.posqty({ dataset: { ix: String(pos.items.length - 1), d: e.key === '+' ? '1' : '-1' } }); return true; }
    if (e.key === '?') { e.preventDefault(); atajos(); return true; }
    return false;
  }
  /** Lectora de códigos: llega como teclas muy rápidas + Enter, aunque el foco no esté en el buscador. */
  let buf = '', bufT = 0;
  function scanner(e) {
    if (APP.view !== 'vender' || UI.modalAbierto()) return false;
    const t = e.target; if (t && t.id === 'pos-q') return false;
    if (enCampo(t) && t.type !== 'button') return false;
    const now = Date.now();
    if (e.key === 'Enter' && buf.length >= 4 && now - bufT < 80) { e.preventDefault(); const code = buf; buf = ''; if (!procesarCodigo(code)) UI.toast(`No encontramos el código ${code}`, { error: true }); return true; }
    if (e.key.length === 1 && /[0-9A-Za-z\-.]/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) { buf = now - bufT < 60 ? buf + e.key : e.key; bufT = now; }
    return false;
  }

  /* ---------- Acciones ---------- */
  Object.assign(UI.act, {
    posadd: (b) => { agregar(b.dataset.id); focoBuscar(); },
    posdel: (b) => { pos.items.splice(+b.dataset.ix, 1); renderCart(); },
    posqty: (b) => { const it = pos.items[+b.dataset.ix]; if (!it) return; const p = D.prod(S(), it.pid); const step = p && p.unidad === 'kg' ? 0.25 : 1; const n = U.r3(it.cant + step * +b.dataset.d); if (n <= 0) pos.items.splice(+b.dataset.ix, 1); else if (p && n > p.stock && !S().config.stockNegativo) UI.toast('Solo quedan ' + fn(p.stock), { error: true }); else it.cant = n; renderCart(); },
    posclear: () => { pos = nuevoPos(pos.cat); renderCart(); focoBuscar(); },
    poscat: (b) => { pos.cat = b.dataset.c; pos.sel = 0; root.document.querySelectorAll('[data-act="poscat"]').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderGrid(); },
    posmedio: (b) => { pos.medio = b.dataset.m; pos.recibido = 0; if (pos.medio === 'Cuenta corriente' && pos.clienteId === 'c0') pos.opts = true; renderCart(); },
    pospaga: (b) => { pos.recibido = U.num(b.dataset.v); renderCart(); },
    posopts: () => { pos.opts = !pos.opts; renderCart(); },
    spon: () => { const tot = calc().total; pos.split = [{ medio: pos.medio === 'Cuenta corriente' ? 'Efectivo' : pos.medio, monto: tot }, { medio: 'Débito', monto: 0 }]; renderCart(); const x = $('#sp-v-0'); if (x) x.focus(); },
    spoff: () => { pos.split = null; renderCart(); },
    spadd: () => { pos.split.push({ medio: 'Efectivo', monto: 0 }); renderCart(); },
    spdel: (b) => { pos.split.splice(+b.dataset.ix, 1); if (pos.split.length < 1) pos.split = null; renderCart(); },
    spfill: () => { const tot = calc().total; const otros = U.sum(pos.split.slice(0, -1), (x) => U.num(x.monto)); pos.split[pos.split.length - 1].monto = r2(tot - otros); renderCart(); },
    cobrar: () => cobrar(),
    nuevaventa: () => { UI.closeModal(); if (APP.view !== 'vender') UI.go('vender'); else focoBuscar(); },
    vercbte: (b) => verComprobante(b.dataset.id),
    printv: (b) => { const v = S().ventas.find((x) => x.id === b.dataset.id); if (v) T.imprimirVenta(v); },
    copycbte: (b) => { const v = S().ventas.find((x) => x.id === b.dataset.id); if (v) UI.copyText(T.textoVenta(v, S())); },
    ultventas: () => { ultQ = ''; ultimasVentas(); },
    atajos: () => atajos(),
    devolver: (b) => devolverForm(b.dataset.id),
    dvtodo: (b) => { const v = S().ventas.find((x) => x.id === b.dataset.id); v.items.forEach((it, idx) => { const el = $('#dv-' + idx); if (el) el.value = U.r3(it.cant - (it.devuelto || 0)); }); devSel.motivo = 'Venta cargada por error'; root.document.querySelectorAll('[data-act="dvmot"]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === devSel.motivo)); dvTotal(); },
    dvmot: (b) => { devSel.motivo = b.dataset.v; b.parentNode.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); },
    dvok: (b) => dvOk(b.dataset.id),
    abrircaja: () => abrirCajaForm()
  });
  Object.assign(UI.form, {
    scan: (fm) => {
      const inp = $('#pos-q'); const q = inp.value.trim(); if (!q) return;
      if (procesarCodigo(q)) { pos.q = ''; inp.value = ''; pos.sel = 0; renderGrid(); inp.focus(); return; }
      const list = filtrados(); const hit = list[pos.sel] || list[0];
      if (hit) { agregar(hit.id); pos.q = ''; inp.value = ''; pos.sel = 0; renderGrid(); } else UI.toast(`No encontramos "${q}"`, { error: true });
      inp.focus();
    },
    abrircaja: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const r = await UI.run((s, u) => D.abrirCaja(s, u, { monto: U.toNum(d.monto) }), { ok: 'Caja abierta. ¡Buenas ventas!' }); if (r) UI.closeModal(); }
  });
  Object.assign(UI.input, {
    'pos-q': (t) => { pos.q = t.value; pos.sel = 0; renderGrid(); },
    ultq: (t) => { ultQ = t.value; const pos0 = t.selectionStart; ultimasVentas(); const n = $('#ult-q'); if (n) { n.focus(); n.setSelectionRange(pos0, pos0); } },
    dv: () => dvTotal(),
    split: (t) => { const x = pos.split[+t.dataset.ix]; if (t.dataset.split === 'monto') { x.monto = U.num(t.value); guardarBorrador(); } }
  });
  Object.assign(UI.change, {
    pos: (t) => { const k = t.dataset.pos; if (k === 'desc') pos.desc = Math.min(100, Math.max(0, U.num(t.value))); else if (k === 'recibido') pos.recibido = U.num(t.value); else pos[k] = t.value; if (k === 'clienteId') pos.tipo = null; renderCart(); },
    poscant: (t) => { const ix = +t.dataset.poscant; const it = pos.items[ix]; if (!it) return; const p = D.prod(S(), it.pid); let c = U.num(t.value); if (p && c > p.stock && !S().config.stockNegativo) { c = p.stock; UI.toast('Solo quedan ' + fn(p.stock), { error: true }); } if (c <= 0) pos.items.splice(ix, 1); else it.cant = p && p.unidad !== 'kg' ? Math.round(c) : U.r3(c); renderCart(); },
    split: (t) => { const x = pos.split[+t.dataset.ix]; if (t.dataset.split === 'medio') x.medio = t.value; else x.monto = U.num(t.value); renderCart(); }
  });

  UI.views.vender = { title: 'Vender', render: view, after, keys };
  UI.scanner = scanner;
  UI.procesarCodigo = procesarCodigo;
  UI.verComprobante = verComprobante;
  UI.abrirCajaForm = abrirCajaForm;
})(typeof window !== 'undefined' ? window : globalThis);
