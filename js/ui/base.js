/* Mostrador · ui/base.js
 * Infraestructura de la interfaz: estado de la app, ejecución de operaciones
 * (transacción + guardado + mensajes), modales, avisos, íconos, gráficos y
 * exportación de archivos. Las pantallas se registran en M.UI.views y sus
 * acciones en M.UI.act / form / input / change (ver app.js).
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D;
  const { esc } = U;
  const $ = (s) => root.document.querySelector(s);

  /** Estado de la aplicación (no se guarda: lo persistente está en APP.S). */
  const APP = {
    S: null, ws: null, version: null, store: null, userId: null, view: 'inicio', busy: false,
    remoteChanged: false, storageError: null, embebida: false, puedeImprimir: false, downloads: null
  };
  const UI = { APP, views: {}, act: {}, form: {}, input: {}, change: {}, after: {}, keys: {} };

  /* ---------- Usuario y permisos ---------- */
  const user = () => (APP.S ? APP.S.usuarios.find((x) => x.id === APP.userId && x.activo !== false) : null) || null;
  const can = (p) => D.can(user(), p);

  /* ---------- Íconos ---------- */
  const IC = {
    inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    vender: '<path d="M3 4h2l2.4 11h11l2-8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    mercaderia: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    caja: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
    proveedores: '<path d="M2 6h11v10H2z"/><path d="M13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.6 4 6"/>',
    informes: '<path d="M4 20V11M10 20V5M16 20v-7M2 20h20"/>',
    config: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    mas: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.6"/><path d="M12 17v.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    gasto: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    falta: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    down: '<path d="M12 4v12M6 11l6 6 6-6M5 20h14"/>', up: '<path d="M12 20V8M6 13l6-6 6 6M5 4h14"/>',
    pct: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    kbd: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    wa: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c.5 2 2 3.5 4 4l1.2-1.2 2 1-.5 1.7c-3.5.3-7.2-3.4-6.9-6.9l1.7-.5 1 2z"/>'
  };
  const ic = (k) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[k] || ''}</svg>`;

  /* ---------- Fragmentos HTML ---------- */
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`;
  const mHead = (t, sub) => `<div class="mh"><div><h2>${t}</h2>${sub ? `<div class="hint">${sub}</div>` : ''}</div><button class="x" data-act="close" aria-label="Cerrar">×</button></div>`;
  const head = (t, p, tools, helpKey) => `<div class="head"><div><h1>${t}</h1>${p ? `<p>${p}</p>` : ''}</div><div class="toolbar">${helpKey ? `<button class="help" data-act="help" data-k="${helpKey}">${ic('help')}¿Cómo se usa?</button>` : ''}${tools || ''}</div></div>`;
  const tabs = (cur, items, act) => `<div class="tabs" role="tablist">${items.filter(Boolean).map(([k, l, i]) => `<button role="tab" aria-selected="${cur === k}" data-act="${act}" data-t="${k}">${i ? ic(i) : ''}${l}</button>`).join('')}</div>`;
  const cbBadge = (t) => `<span class="cb">${D.TIPOS[t].letra === 'X' ? 'TK' : 'F' + D.TIPOS[t].letra}</span>`;
  const uLabel = (p) => (p.unidad === 'kg' ? 'kg' : p.stock === 1 ? 'unidad' : 'unidades');
  const stockPill = (p) => { const s = D.stockState(p); return `<span class="pill ${s}">${s === 'bad' ? 'Sin stock' : U.fn(p.stock) + ' ' + uLabel(p) + (s === 'warn' ? ' · Queda poco' : '')}</span>`; };
  const estadoVenta = (v) => (v.estado === 'anulada' ? '<span class="tag bad">Anulada</span>' : v.estado === 'devuelta_parcial' ? '<span class="tag warn">Devolución parcial</span>' : '');
  const fiscalTag = (v) => (v.tipo === 'TK' ? '<span class="tag">No fiscal</span>' : v.fiscal && v.fiscal.estado === 'autorizado' ? '<span class="tag ok">Autorizada ARCA</span>' : '<span class="tag warn">Sin autorizar en ARCA</span>');

  /* ---------- Avisos y modales ---------- */
  let toastT;
  function toast(msg, opts) {
    const t = $('#toast'); const err = opts && opts.error;
    t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', err ? 'alert' : 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${err ? '<button class="x" data-act="toastclose" aria-label="Cerrar aviso">×</button>' : ''}`;
    t.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, err ? 8000 : 3200);
  }
  let modalCb = null, lastFocus = null;
  function openModal(html, wide, onClose) {
    const c = $('#modal-card'); c.className = 'modal-card' + (wide ? ' wide' : ''); c.innerHTML = html;
    if (!lastFocus) lastFocus = root.document.activeElement;
    $('#modal').hidden = false; modalCb = onClose || null;
    const f = c.querySelector('[autofocus]') || c.querySelector('button.primary') || c.querySelector('button');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true; $('#modal-card').innerHTML = '';
    const cb = modalCb; modalCb = null; if (cb) cb();
    if (lastFocus && lastFocus.focus && root.document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* nada */ } }
    lastFocus = null;
  }
  const modalAbierto = () => !$('#modal').hidden;
  /**
   * Confirmación propia (los diálogos del navegador no sirven en todas las vistas).
   * escribir: texto que hay que tipear para habilitar el botón (operaciones peligrosas).
   */
  function confirmar({ titulo, texto, ok = 'Confirmar', peligro = false, escribir = null }) {
    return new Promise((resolve) => {
      let resuelto = false; const fin = (v) => { if (!resuelto) { resuelto = true; resolve(v); } };
      UI.act._confirmOk = () => { const inp = $('#cf-txt'); if (escribir && (!inp || inp.value.trim().toUpperCase() !== escribir)) { toast(`Escribí ${escribir} para confirmar`, { error: true }); return; } fin(true); closeModal(); };
      openModal(mHead(titulo) + `<div class="mb"><div>${texto}</div>${escribir ? `<div class="field"><label for="cf-txt">Para confirmar, escribí <b>${esc(escribir)}</b></label><input id="cf-txt" type="text" autocomplete="off" autofocus></div>` : ''}</div><div class="mf"><button class="btn" data-act="close">Cancelar</button><button class="btn ${peligro ? 'danger solid' : 'primary'}" data-act="_confirmOk">${esc(ok)}</button></div>`, false, () => fin(false));
    });
  }

  /* ---------- Ejecución de operaciones ---------- */
  /**
   * Ejecuta una operación de negocio de forma atómica:
   * 1) la aplica sobre una copia del estado, 2) la guarda, 3) recién ahí la confirma.
   * Si falla la validación o el guardado, el estado anterior queda intacto y se avisa.
   * Bloquea operaciones simultáneas (evita cobros duplicados por doble clic).
   */
  async function run(fn, opts = {}) {
    if (APP.busy) { toast('Esperá: se está guardando la operación anterior.'); return undefined; }
    if (APP.remoteChanged) { avisoCambioRemoto(); return undefined; }
    const u = user(); if (!u) { toast('Elegí quién está usando la app.', { error: true }); return undefined; }
    APP.busy = true; root.document.body.classList.add('busy');
    try {
      const { state, result } = D.tx(APP.S, (d) => fn(d, u));
      if (opts.snapshot) await APP.store.snapshot(APP.ws, APP.S, opts.snapshot);
      APP.version = await APP.store.save(APP.ws, state, APP.version);
      APP.S = state; APP.storageError = null;
      if (opts.render !== false) UI.render();
      if (opts.ok) toast(typeof opts.ok === 'function' ? opts.ok(result) : opts.ok);
      return result === undefined ? true : result;
    } catch (e) {
      manejarError(e);
      return undefined;
    } finally {
      APP.busy = false; root.document.body.classList.remove('busy');
    }
  }
  function manejarError(e) {
    const S_ = M.Storage;
    if (e instanceof D.DomainError) { toast(e.message, { error: true }); return; }
    if (S_ && e instanceof S_.ConflictError) { APP.remoteChanged = true; UI.renderChrome(); avisoCambioRemoto(); return; }
    if (S_ && e instanceof S_.StorageError) {
      APP.storageError = e.message; UI.renderChrome();
      openModal(mHead('No se pudo guardar') + `<div class="mb"><p><b>La operación no se registró.</b> ${esc(e.message)}</p><p class="muted">Tus datos anteriores siguen como estaban. Te recomendamos descargar una copia de seguridad ahora.</p></div><div class="mf"><button class="btn" data-act="close">Cerrar</button><button class="btn primary" data-act="backupdl">${ic('down')}Descargar copia de seguridad</button></div>`);
      return;
    }
    console.error(e);
    openModal(mHead('Ocurrió un error inesperado') + `<div class="mb"><p><b>La operación no se registró.</b> Tus datos no se modificaron.</p><p class="hint mono">${esc(e && e.message ? e.message : String(e))}</p></div><div class="mf"><button class="btn primary" data-act="close">Entendido</button></div>`);
  }
  function avisoCambioRemoto() {
    openModal(mHead('Hay cambios en otra pestaña') + `<div class="mb"><p>Los datos se modificaron en otra pestaña o ventana de este navegador. Para no pisar esos cambios, recargá antes de seguir.</p></div><div class="mf"><button class="btn primary" data-act="recargar">Recargar datos</button></div>`);
  }

  /* ---------- Gráfico de barras ---------- */
  function chartBars(labels, vals, hi, aria) {
    const n = vals.length, max = Math.max(...vals, 1); const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step / 2) * step * 2 || 1;
    const W = 660, H = 230, L = 60, B = 28, T = 10, cw = (W - L - 8) / n, bw = Math.max(cw * 0.64, 2); const every = n > 16 ? Math.ceil(n / 12) : 1;
    let g = ''; for (let i = 0; i <= 4; i++) { const v = (top * i) / 4, y = T + (H - T - B) * (1 - i / 4); g += `<line class="grid-l" x1="${L}" x2="${W - 4}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">$${U.fc(v)}</text>`; }
    const bars = vals.map((v, i) => { const h = ((H - T - B) * Math.max(0, v)) / top, x = L + i * cw + (cw - bw) / 2, y = H - B - h; return `<rect class="b ${i === hi ? 'today' : ''}" x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 0)}" rx="2"><title>${esc(labels[i])}: ${U.f$(v)}</title></rect>${i % every === 0 ? `<text x="${x + bw / 2}" y="${H - 9}" text-anchor="middle">${esc(labels[i])}</text>` : ''}`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}${bars}</svg>`;
  }

  /* ---------- Archivos: descargar, Excel y PDF ---------- */
  async function guardarArchivo(filename, blob) {
    if (APP.downloads) {
      try { await APP.downloads.save({ filename, data: blob }); toast('Archivo listo: ' + filename); return true; }
      catch (e) { if (e && e.code === 'declined') return false; if (e && e.code === 'rate_limited') { toast('Ya hay una descarga esperando tu confirmación.'); return false; } }
    }
    try {
      const url = URL.createObjectURL(blob); const a = root.document.createElement('a');
      a.href = url; a.download = filename; root.document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Archivo descargado: ' + filename); return true;
    } catch (e) { toast('No se pudo descargar el archivo en este navegador.', { error: true }); return false; }
  }
  function autoCols(rows) { if (!rows.length) return []; return Object.keys(rows[0]).map((k) => ({ wch: Math.min(48, Math.max(k.length, ...rows.slice(0, 200).map((r) => String(r[k] == null ? '' : r[k]).length)) + 2) })); }
  async function exportXLSX(filename, sheets) {
    if (typeof root.XLSX === 'undefined') { toast('No se pudo cargar el generador de Excel. Revisá la conexión e intentá de nuevo.', { error: true }); return; }
    const X = root.XLSX; const wb = X.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      const safe = rows.map((r) => { const o = {}; for (const k in r) o[k] = U.safeCell(r[k]); return o; });
      const ws = X.utils.json_to_sheet(safe.length ? safe : [{ 'Sin datos': '' }]); ws['!cols'] = autoCols(safe);
      X.utils.book_append_sheet(wb, ws, name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    }
    const buf = X.write(wb, { bookType: 'xlsx', type: 'array' });
    await guardarArchivo(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  /** Carga un script externo una sola vez (jsPDF se carga recién cuando se usa). */
  const scripts = {};
  function cargarScript(src) {
    if (scripts[src]) return scripts[src];
    scripts[src] = new Promise((res, rej) => { const s = root.document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => { delete scripts[src]; rej(new Error('No se pudo cargar ' + src)); }; root.document.head.appendChild(s); });
    return scripts[src];
  }
  const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  const AUTOTABLE = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';
  /**
   * Exporta un informe a PDF. secciones: [{ titulo, head:[...], body:[[...]], nota }]
   */
  async function exportPDF(filename, titulo, subtitulo, secciones) {
    try { await cargarScript(JSPDF); await cargarScript(AUTOTABLE); } catch (e) { toast('No se pudo cargar el generador de PDF. Revisá la conexión.', { error: true }); return; }
    const { jsPDF } = root.jspdf; const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const S = APP.S; let y = 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(titulo, 40, y); y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90);
    doc.text(`${S.config.nombre}${S.config.cuit ? ' · CUIT ' + S.config.cuit : ''} · ${subtitulo} · Generado ${U.fDT(new Date())}`, 40, y); y += 10;
    if (S.workspace.modo === 'demo') { doc.setTextColor(170, 90, 0); doc.text('DATOS DE DEMOSTRACIÓN (ficticios)', 40, y + 10); y += 12; }
    doc.setTextColor(0);
    secciones.forEach((s) => {
      y += 18; if (y > 760) { doc.addPage(); y = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.text(s.titulo, 40, y);
      doc.autoTable({ startY: y + 6, head: [s.head], body: s.body, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [28, 93, 132] }, margin: { left: 40, right: 40 } });
      y = doc.lastAutoTable.finalY;
      if (s.nota) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(90); const lines = doc.splitTextToSize(s.nota, 515); doc.text(lines, 40, y + 12); y += 12 + lines.length * 10; doc.setTextColor(0); }
    });
    await guardarArchivo(filename, doc.output('blob'));
  }

  /* ---------- Copiar texto ---------- */
  function copyText(txt, okMsg) {
    const done = () => toast(okMsg || 'Copiado. Ya lo podés pegar en WhatsApp');
    const fallback = () => { openModal(mHead('Copiá este texto') + `<div class="mb"><textarea id="cp-out" rows="10" readonly>${esc(txt)}</textarea></div>`); const el = $('#cp-out'); el.focus(); el.select(); toast('Seleccioná el texto y copialo (Ctrl+C)'); };
    try { root.navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
  }
  const waLink = (txt) => 'https://wa.me/?text=' + encodeURIComponent(txt);

  Object.assign(UI, { $, user, can, IC, ic, opt, mHead, head, tabs, cbBadge, uLabel, stockPill, estadoVenta, fiscalTag, toast, openModal, closeModal, modalAbierto, confirmar, run, manejarError, chartBars, guardarArchivo, exportXLSX, exportPDF, cargarScript, copyText, waLink });
  M.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
