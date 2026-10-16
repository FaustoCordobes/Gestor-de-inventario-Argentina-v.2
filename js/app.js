/* Mostrador · app.js
 * Arranque, navegación, barra de estado, selección de usuario, cambio entre
 * "Demostración" y "Mi negocio", despacho de eventos, atajos de teclado y PWA.
 */
(function (root) {
  'use strict';
  const M = root.M; const U = M.U, D = M.D, UI = M.UI, ST = M.Storage;
  const { esc } = U;
  const { APP, ic, mHead, $ } = UI;
  const doc = root.document;

  const NAV = [
    ['inicio', 'Inicio', 'día', null], ['vender', 'Vender', 'día', 'venta.crear'], ['mercaderia', 'Mercadería', 'día', 'producto.ver'], ['caja', 'Caja', 'día', 'caja.abrir'],
    ['proveedores', 'Proveedores', 'adm', 'proveedor.ver'], ['clientes', 'Clientes y fiado', 'adm', 'cliente.ver'], ['informes', 'Informes', 'adm', 'informes.ver'], ['config', 'Configuración', 'adm', null]
  ];
  const navVisible = () => NAV.filter((n) => !n[3] || UI.can(n[3]));

  const HELP = {
    inicio: ['La pantalla de inicio', ['Arriba están los botones para lo que hacés todos los días. Cada persona ve los que corresponden a su rol.', 'Los números muestran cuánto vendiste hoy y cuánto efectivo tiene que haber en la caja.', 'En "Avisos" aparece lo que necesita tu atención, con un botón para resolverlo.', 'Arriba a la derecha ves quién está usando la app y si la caja está abierta. Tocá tu nombre para cambiar de usuario.']],
    vender: ['Cómo vender', ['Abrí la caja al empezar el día (te lo pide la app).', 'Escaneá el código de barras con la lectora: funciona aunque el cursor no esté en el buscador. También lee etiquetas de balanza.', 'O escribí el nombre, elegí con ↑ ↓ y apretá Enter.', 'Elegí cómo paga. Si es en efectivo, tocá el billete con el que paga y te dice el vuelto. Para pagar con dos medios, usá "Dividir el pago".', 'Tocá Cobrar (o F9). El stock se descuenta solo y queda registrado quién vendió.', 'Para devolver o anular, abrí "Últimas ventas" (F10). Las ventas nunca se borran.']],
    mercaderia: ['Cómo manejar la mercadería', ['En "Productos" ves precios y stock. Solo el administrador cambia precios.', 'Cuando llega mercadería, entrá a "Llegó mercadería", elegí el proveedor y escribí cuánto recibiste. Se suma solo al stock.', '"Qué falta" sugiere cuánto pedir según tus ventas. Con "Crear pedido" queda registrado y cuando llega lo cargás con un toque.', 'Si contás y no coincide, usá "Corregir stock" en el producto. Cada cambio queda en "Movimientos de stock" con la cantidad anterior, la nueva, quién lo hizo y por qué.']],
    caja: ['Cómo manejar la caja', ['Al empezar el día, abrí la caja contando el cambio.', 'Las ventas, cobros y gastos en efectivo se suman y restan solos.', 'Si sacás plata para el banco, usá "Retirar efectivo".', 'Al cerrar, contá los billetes y escribí cuánto hay. Si no coincide, la app te pide el motivo y queda registrado.']],
    proveedores: ['Proveedores', ['Cada tarjeta muestra cuánto le debés y cuándo vence.', 'Tocá "Pagar" cuando le pagues. No se puede pagar más de lo que se debe.', 'Si devolvés mercadería (vencida, rota), usá "Devolver mercadería": baja el stock y la deuda.']],
    clientes: ['Clientes y fiado', ['Acá están los clientes frecuentes y lo que te deben.', 'Cuando un cliente te paga lo que debe, tocá "Cobrar".', '"Recordarle" copia un mensaje para mandar por WhatsApp.']],
    informes: ['Informes', ['"Historial": elegí día, semana, mes o año. Se compara contra el período anterior.', '"Inventario": cuánto vale tu mercadería, qué rota más y qué no se vende.', '"Diferencias": pérdidas de stock y diferencias de caja.', '"Pendientes": pedidos sin llegar, deudas con proveedores y fiados.', '"Para el contador": libros de IVA en Excel o PDF. Ojo: sin ARCA configurado son de control interno.']],
    config: ['Configuración', ['"Comercio": los datos que salen en los comprobantes.', '"Ventas y tickets": ancho del papel, impresión automática, balanza y descuentos.', '"Usuarios": quién usa la app y qué puede hacer cada rol.', '"Datos y copias": pasar de la demostración a tu negocio, descargar y restaurar copias de seguridad.']]
  };
  function showHelp(k) { const h = HELP[k]; if (!h) return; UI.openModal(mHead(h[0]) + `<div class="mb"><ol class="howto">${h[1].map((s) => `<li>${s}</li>`).join('')}</ol></div><div class="mf"><button class="btn primary" data-act="close">Entendido</button></div>`); }

  /* ---------- Render ---------- */
  function renderChrome() {
    const s = APP.S; if (!s) return; const u = UI.user(); const caja = D.cajaAbierta(s);
    const item = ([k, l]) => `<button data-act="go" data-v="${k}" ${k === APP.view ? 'aria-current="page"' : ''}>${ic(k)}<span>${l}</span>${k === 'mercaderia' && D.lowStock(s).length ? `<span class="count" title="Productos que se están por acabar">${D.lowStock(s).length}</span>` : ''}</button>`;
    const vis = navVisible();
    $('#nav').innerHTML = `<div class="grp">Todos los días</div>${vis.filter((n) => n[2] === 'día').map(item).join('')}<div class="grp">Administración</div>${vis.filter((n) => n[2] === 'adm').map(item).join('')}`;
    $('#side-biz').textContent = s.config.nombre; $('#top-biz').textContent = s.config.nombre;
    $('#side-foot').innerHTML = `<strong>${esc(s.config.razon || s.config.nombre)}</strong>${s.config.cuit ? 'CUIT ' + esc(s.config.cuit) + ' · ' : ''}${esc(D.COND[s.config.condIva])}<br><span style="opacity:.7">Mostrador v4</span>`;
    const dia = vis.filter((n) => n[2] === 'día'); const isMas = !dia.some((n) => n[0] === APP.view);
    $('#bnav').innerHTML = dia.map(([k, l]) => `<button data-act="go" data-v="${k}" ${k === APP.view ? 'aria-current="page"' : ''}>${ic(k)}<span>${l}</span></button>`).join('') + `<button data-act="mas" ${isMas ? 'aria-current="page"' : ''}>${ic('mas')}<span>Más</span></button>`;
    $('#bnav').style.gridTemplateColumns = `repeat(${dia.length + 1},1fr)`;
    doc.documentElement.classList.toggle('big', s.config.letra === 'grande');
    const modo = APP.store.volatil ? '<span class="modechip volatil">Sin guardar</span>' : s.workspace.modo === 'demo' ? '<span class="modechip demo">Demostración</span>' : '<span class="modechip local">Mi negocio</span>';
    $('#statusbar').innerHTML = `${modo}<span class="cajachip ${caja ? 'abierta' : 'cerrada'}">Caja ${caja ? 'abierta' : 'cerrada'}</span><span class="sp"></span><button class="userchip" data-act="usuario" aria-label="Cambiar de usuario">${ic('user')}${u ? esc(u.nombre) : 'Elegí usuario'} <small>${u ? esc(D.ROLES[u.rol]) : ''}</small></button>`;
    const banners = [];
    if (APP.store.volatil) banners.push(['bad', 'Este navegador no permite guardar datos (modo privado o almacenamiento bloqueado). Lo que hagas se pierde al cerrar la pestaña.', '']);
    if (APP.storageError) banners.push(['bad', 'El último guardado falló: ' + APP.storageError, '<button class="btn" data-act="backupdl">Descargar copia</button>']);
    if (APP.remoteChanged) banners.push(['warn', 'Hubo cambios en otra pestaña de este navegador.', '<button class="btn" data-act="recargar">Recargar datos</button>']);
    $('#banners').innerHTML = banners.map(([c, t, b]) => `<div class="banner ${c}" role="alert"><span>${esc(t)}</span>${b}</div>`).join('');
    $('#demo-strip').hidden = s.workspace.modo !== 'demo';
  }
  function render() {
    if (!APP.S) return;
    renderChrome();
    const v = UI.views[APP.view] || UI.views.inicio;
    $('#main').innerHTML = v.render();
    if (v.after) v.after();
    doc.title = (v.title ? v.title + ' · ' : '') + 'Mostrador';
  }
  function go(v, sub) {
    const nv = navVisible(); if (!nv.some((n) => n[0] === v)) v = 'inicio';
    APP.view = v; const view = UI.views[v]; if (sub && view && view.setTab) view.setTab(sub);
    UI.closeModal(); try { root.history.replaceState(null, '', '#' + v); } catch (e) { /* sin historial */ }
    render(); root.scrollTo(0, 0);
    const h = doc.querySelector('#main h1'); if (h) { h.setAttribute('tabindex', '-1'); if (v !== 'vender') h.focus({ preventScroll: true }); }
  }

  /* ---------- Usuarios ---------- */
  const userKey = () => 'mostrador4:usuario:' + APP.ws;
  function asegurarUsuario() {
    const s = APP.S; const activos = s.usuarios.filter((x) => x.activo !== false);
    let id = null; try { id = root.sessionStorage.getItem(userKey()); } catch (e) { id = null; }
    if (id && activos.some((x) => x.id === id)) { APP.userId = id; return true; }
    APP.userId = null;
    const sinPin = activos.filter((x) => !x.pinHash);
    if (!s.config.pedirUsuario && activos.length && !activos[0].pinHash) { setUser(activos[0].id); return true; }
    if (!s.config.pedirUsuario && sinPin.length === activos.length && activos.length) { setUser(activos[0].id); return true; }
    return false;
  }
  function setUser(id) { APP.userId = id; try { root.sessionStorage.setItem(userKey(), id); } catch (e) { /* sin sesión */ } }
  function elegirUsuario(obligatorio) {
    const us = APP.S.usuarios.filter((x) => x.activo !== false);
    UI.openModal((obligatorio ? `<div class="mh"><div><h2>¿Quién atiende?</h2><div class="hint">${esc(APP.S.config.nombre)}</div></div></div>` : mHead('Cambiar de usuario', 'Cada operación queda registrada con el nombre de quien la hace.')) + `<div class="mb"><div class="usuarios">${us.map((x) => `<button class="uopt" data-act="elegirusr" data-id="${x.id}"><b>${esc(x.nombre)}</b><span class="hint">${esc(D.ROLES[x.rol])}${x.pinHash ? ' · con PIN' : ''}</span></button>`).join('')}</div><div id="pin-box"></div></div>`, false, obligatorio ? () => { if (!UI.user()) setTimeout(() => elegirUsuario(true), 0); } : null);
  }
  async function confirmarPin(id, pin) {
    const x = D.usuario(APP.S, id); if (!x) return;
    if (x.pinHash) { const h = await D.hashPin(pin || '', x.salt || ''); if (h !== x.pinHash) { UI.toast('PIN incorrecto.', { error: true }); const p = $('#pin-in'); if (p) { p.value = ''; p.focus(); } return; } }
    setUser(id); UI.closeModal(); if (UI.posReset) UI.posReset(); go(APP.view); UI.toast('Hola, ' + x.nombre.split(' ')[0]);
  }

  /* ---------- Espacios de trabajo ---------- */
  const WS_KEY = 'mostrador4:activo';
  async function cambiarWorkspace(id, userId) {
    const r = await APP.store.load(id);
    if (!r) throw new ST.StorageError('No se encontró ese espacio de datos.');
    APP.ws = id; APP.S = r.state; APP.version = r.version; APP.remoteChanged = false; APP.storageError = null;
    try { root.localStorage.setItem(WS_KEY, id); } catch (e) { /* nada */ }
    APP.wsList = await APP.store.list().catch(() => []);
    if (UI.configReset) UI.configReset(); if (UI.posReset) UI.posReset();
    if (userId) setUser(userId);
    const ok = asegurarUsuario(); go('inicio'); if (!ok) elegirUsuario(true);
  }
  async function recargar() {
    try { const r = await APP.store.load(APP.ws); if (r) { APP.S = r.state; APP.version = r.version; } APP.remoteChanged = false; UI.closeModal(); asegurarUsuario(); render(); UI.toast('Datos actualizados'); } catch (e) { UI.manejarError(e); }
  }

  /* ---------- Error al leer: pantalla de recuperación (nunca reemplaza los datos) ---------- */
  function pantallaFatal(err, id) {
    $('#app').hidden = true; const f = $('#fatal'); f.hidden = false;
    f.innerHTML = `<h1>No se pudieron leer tus datos</h1><p>${esc(err.message)}</p><p><b>Tus datos no se borraron ni se reemplazaron.</b> Probá estas opciones:</p>
      <div class="toolbar"><button class="btn primary" data-act="fatalretry">Reintentar</button><button class="btn" data-act="fataldl" data-id="${esc(id)}">Descargar los datos tal como están</button><button class="btn" data-act="fatalsnaps" data-id="${esc(id)}">Ver copias automáticas</button><button class="btn ghost" data-act="fataldemo">Abrir la demostración</button></div><div id="fatal-snaps"></div>
      <p class="hint">Si el problema sigue, mandá el archivo descargado a soporte. No borres los datos del navegador.</p>`;
  }

  /* ---------- Arranque ---------- */
  async function boot() {
    APP.embebida = root.self !== root.top;
    APP.puedeImprimir = !APP.embebida && typeof root.print === 'function';
    let backend; try { backend = await ST.crearBackend(root); } catch (e) { backend = ST.memBackend(); }
    APP.store = ST.crearStore(backend, root);
    APP.store.onRemoteChange((msg) => { if (msg && msg.id === APP.ws && msg.version !== APP.version) { APP.remoteChanged = true; if (!APP.busy && !UI.modalAbierto()) recargar(); else renderChrome(); } });
    let list = []; try { list = await APP.store.list(); } catch (e) { pantallaFatal(e, ''); return; }
    APP.wsList = list;
    let activo = null; try { activo = root.localStorage.getItem(WS_KEY); } catch (e) { activo = null; }
    if (!activo || !list.some((w) => w.id === activo)) activo = list.some((w) => w.id === 'local') ? 'local' : list.some((w) => w.id === 'demo') ? 'demo' : null;
    if (!activo) {
      // Primera vez: se crea la demostración. Los datos de la versión anterior (si hay) no se tocan;
      // en Configuración → Datos se ofrece traerlos.
      const st = M.seed();
      try { await APP.store.save('demo', st, null); } catch (e) { UI.manejarError(e); }
      activo = 'demo'; APP.wsList = await APP.store.list().catch(() => [{ id: 'demo' }]);
      APP.primeraVez = true;
    }
    try {
      const r = await APP.store.load(activo);
      if (!r) throw new ST.StorageError('No se encontraron los datos.');
      APP.ws = activo; APP.S = r.state; APP.version = r.version;
    } catch (e) { pantallaFatal(e, activo); return; }
    $('#fatal').hidden = true; $('#app').hidden = false;
    const h = (root.location.hash || '').slice(1);
    const ok = asegurarUsuario();
    go(UI.views[h] ? h : 'inicio');
    if (!ok) elegirUsuario(true);
    else if (APP.primeraVez && ST.leerLegado(root.localStorage)) UI.toast('Encontramos datos de la versión anterior. Los podés traer desde Configuración → Datos y copias.');
    // Descargas dentro de Claude (si la vista lo permite)
    try { if (root.claude && root.claude.use) root.claude.use('downloads').then((d) => { APP.downloads = d; }).catch(() => {}); } catch (e) { /* fuera de Claude */ }
    registrarSW();
  }

  /* ---------- PWA ---------- */
  function registrarSW() {
    if (APP.embebida || !('serviceWorker' in root.navigator) || (root.location.protocol !== 'https:' && root.location.hostname !== 'localhost')) return;
    root.navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && root.navigator.serviceWorker.controller) { const b = $('#banners'); const d = doc.createElement('div'); d.className = 'banner warn'; d.innerHTML = '<span>Hay una versión nueva de Mostrador.</span><button class="btn" data-act="swupdate">Actualizar</button>'; b.appendChild(d); APP.swWaiting = w; } }); });
    }).catch(() => { /* sin modo sin conexión */ });
    let recargando = false; root.navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargando) return; recargando = true; root.location.reload(); });
  }

  /* ---------- Eventos ---------- */
  Object.assign(UI.act, {
    go: (b) => go(b.dataset.v),
    mas: () => UI.openModal(mHead('Más secciones') + `<div class="mb"><div class="tiles">${navVisible().filter((n) => n[2] === 'adm').map(([k, l]) => `<button class="tile" data-act="go" data-v="${k}"><span class="ti">${ic(k)}</span><b>${l}</b></button>`).join('')}</div></div>`),
    close: () => UI.closeModal(),
    toastclose: () => { $('#toast').hidden = true; },
    help: (b) => showHelp(b.dataset.k),
    usuario: () => elegirUsuario(false),
    elegirusr: (b) => { const x = D.usuario(APP.S, b.dataset.id); if (!x) return; if (!x.pinHash) { confirmarPin(x.id); return; } $('#pin-box').innerHTML = `<form data-form="pin" data-id="${x.id}" class="field" style="margin-top:12px"><label for="pin-in">PIN de ${esc(x.nombre)}</label><div class="scan"><input id="pin-in" name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" autofocus><button class="btn primary" type="submit">Entrar</button></div></form>`; $('#pin-in').focus(); },
    recargar: () => recargar(),
    swupdate: () => { if (APP.swWaiting) APP.swWaiting.postMessage('skipWaiting'); },
    fatalretry: () => root.location.reload(),
    fataldl: async (b) => { try { const rec = await APP.store.backend.get(b.dataset.id); UI.guardarArchivo('mostrador-datos-crudos.json', new Blob([JSON.stringify(rec)], { type: 'application/json' })); } catch (e) { UI.toast('No se pudieron leer ni siquiera los datos crudos: ' + e.message, { error: true }); } },
    fatalsnaps: async (b) => { const l = await APP.store.snapList(b.dataset.id).catch(() => []); $('#fatal-snaps').innerHTML = l.length ? `<div class="list">${l.map((x) => `<div class="li"><span>${U.fDT(x.fecha)} · ${esc(x.motivo)}</span><button class="btn sm" data-act="fatalsnapdl" data-id="${x.id}">Descargar</button></div>`).join('')}</div><p class="hint">Descargá la copia y restaurala desde Configuración → Datos y copias.</p>` : '<p>No hay copias automáticas.</p>'; },
    fatalsnapdl: async (b) => { const sn = await APP.store.snapGet(+b.dataset.id || b.dataset.id); const bk = await ST.crearBackup(sn.state, sn.state.workspace); UI.guardarArchivo(`mostrador-copia-${U.dkey(sn.fecha)}.json`, new Blob([JSON.stringify(bk)], { type: 'application/json' })); },
    fataldemo: async () => { try { const l = await APP.store.list(); if (!l.some((w) => w.id === 'demo')) await APP.store.save('demo', M.seed(), null); $('#fatal').hidden = true; $('#app').hidden = false; await cambiarWorkspace('demo'); } catch (e) { UI.toast(e.message, { error: true }); } }
  });
  UI.form.pin = (fm) => confirmarPin(fm.dataset.id, new FormData(fm).get('pin'));

  function dispatch(map, t, ev) {
    if (t.id && map[t.id]) return map[t.id](t, ev);
    for (const k in t.dataset) if (map[k]) return map[k](t, ev);
    return undefined;
  }
  doc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (UI.menuCerrar && !e.target.closest('.menu-wrap') && UI.menuCerrar()) { if (!b) render(); }
    if (!b) { if (e.target.id === 'modal') { const c = $('#modal-card'); if (!c.querySelector('.mh .x')) return; UI.closeModal(); } return; }
    if (b.tagName === 'A') return;
    const fn = UI.act[b.dataset.act]; if (fn) { e.preventDefault(); fn(b, e); }
  });
  doc.addEventListener('submit', (e) => { const fm = e.target; const k = fm.dataset.form; if (!k) return; e.preventDefault(); if (UI.form[k]) UI.form[k](fm, e); });
  doc.addEventListener('input', (e) => dispatch(UI.input, e.target, e));
  doc.addEventListener('change', (e) => dispatch(UI.change, e.target, e));
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (UI.modalAbierto()) { const c = $('#modal-card'); if (c.querySelector('.mh .x')) { e.preventDefault(); UI.closeModal(); } return; } if (UI.menuCerrar && UI.menuCerrar()) { render(); return; } }
    if (!APP.S || !UI.user()) return;
    if (UI.scanner && UI.scanner(e)) return;
    if (UI.modalAbierto()) {
      const nv = $('#modal-card [data-act="nuevaventa"]');
      if (nv && e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') { e.preventDefault(); nv.click(); return; }
      if (nv && (e.key === 'p' || e.key === 'P')) { const p = $('#modal-card [data-act="printv"]'); if (p) { e.preventDefault(); p.click(); } }
      return;
    }
    if (e.altKey && /^[1-8]$/.test(e.key)) { const n = navVisible()[+e.key - 1]; if (n) { e.preventDefault(); go(n[0]); } return; }
    const v = UI.views[APP.view]; if (v && v.keys && v.keys(e)) return;
    if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); UI.act.atajos && UI.act.atajos(); }
  });

  Object.assign(UI, { render, renderChrome, go, cambiarWorkspace, asegurarUsuario });
  M.App = { boot, NAV };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
