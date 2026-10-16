/* Mostrador · ui/config.js
 * Configuración: datos del comercio, ventas y tickets, usuarios y permisos,
 * datos y copias de seguridad (modo demostración / mi negocio), estado de la
 * conexión con la nube y ARCA, y registro de auditoría.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI, ST = M.Storage;
  const { esc, f$, fn } = U;
  const { APP, ic, opt, mHead, head, $ } = UI;
  const S = () => APP.S;
  let tab = 'comercio';

  function view() {
    const t = [UI.can('config.editar') && ['comercio', 'Comercio', 'config'], UI.can('config.editar') && ['ventas', 'Ventas y tickets', 'vender'], ['usuarios', 'Usuarios', 'user'], ['datos', 'Datos y copias', 'down'], ['nube', 'Nube y ARCA', 'shield'], UI.can('config.editar') && ['auditoria', 'Auditoría', 'list']];
    if (!t.some((x) => x && x[0] === tab)) tab = UI.can('config.editar') ? 'comercio' : 'datos';
    return head('Configuración', 'Datos del comercio, usuarios, copias de seguridad y conexiones.', '', 'config') + UI.tabs(tab, t, 'cfgtab') +
      ({ comercio: tComercio, ventas: tVentas, usuarios: tUsuarios, datos: tDatos, nube: tNube, auditoria: tAuditoria }[tab])();
  }
  const chk = (n, v, l, h) => `<label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" name="${n}" ${v ? 'checked' : ''} style="margin-top:3px"><span><b>${l}</b>${h ? `<br><span class="hint">${h}</span>` : ''}</span></label>`;
  const hidden = (c) => `<input type="hidden" name="nombre" value="${esc(c.nombre)}">`;

  function tComercio() {
    const c = S().config;
    return `<form class="card" data-form="config"><div class="card-b"><div class="form">
      <div class="field"><label for="s-n">Nombre del comercio</label><input id="s-n" name="nombre" type="text" required maxlength="80" value="${esc(c.nombre)}"></div>
      <div class="field"><label for="s-r">Razón social</label><input id="s-r" name="razon" type="text" maxlength="120" value="${esc(c.razon)}"></div>
      <div class="field"><label for="s-d">Dirección</label><input id="s-d" name="domicilio" type="text" maxlength="120" value="${esc(c.domicilio)}"></div>
      <div class="field"><label for="s-iva">¿Qué sos frente al IVA?</label><select id="s-iva" name="condIva">${opt('RI', D.COND.RI, c.condIva)}${opt('MONO', D.COND.MONO, c.condIva)}</select><span class="hint">Monotributo hace Facturas C. Responsable Inscripto hace A y B.</span></div>
      <div class="field"><label for="s-l">Tamaño de letra</label><select id="s-l" name="letra">${opt('normal', 'Normal', c.letra)}${opt('grande', 'Grande', c.letra)}</select></div>
      </div>
      <details class="more" style="margin-top:14px" open><summary>Datos fiscales</summary><div><div class="form">
        <div class="field"><label for="s-c">CUIT</label><input id="s-c" name="cuit" type="text" class="mono" value="${esc(c.cuit)}" inputmode="numeric"><span class="hint">Se verifica el dígito verificador</span></div>
        <div class="field"><label for="s-ib">Ingresos Brutos</label><input id="s-ib" name="iibb" type="text" class="mono" maxlength="30" value="${esc(c.iibb)}"></div>
        <div class="field"><label for="s-i">Inicio de actividades</label><input id="s-i" name="inicio" type="date" value="${esc(c.inicio)}"></div>
        <div class="field"><label for="s-pv">Punto de venta</label><input id="s-pv" name="pv" type="number" min="1" max="99998" value="${c.pv}" inputmode="numeric"></div>
      </div></div></details>
      ${ocultosVentas(c)}
      </div><div class="mf"><button class="btn primary" type="submit">Guardar cambios</button></div></form>`;
  }
  const ocultosVentas = (c) => `<input type="hidden" name="ticketAncho" value="${c.ticket.ancho}"><input type="hidden" name="ticketPie" value="${esc(c.ticket.pie)}"><input type="hidden" name="descMaxVendedor" value="${c.descMaxVendedor}"><input type="hidden" name="balanzaPrefijo" value="${esc(c.balanza.prefijo)}"><input type="hidden" name="balanzaPlu" value="${c.balanza.digitosPlu}"><input type="hidden" name="balanzaTipo" value="${c.balanza.tipo}">${c.ticket.auto ? '<input type="hidden" name="ticketAuto" value="on">' : ''}${c.balanza.activa ? '<input type="hidden" name="balanzaActiva" value="on">' : ''}${c.stockNegativo ? '<input type="hidden" name="stockNegativo" value="on">' : ''}${c.pedirUsuario ? '<input type="hidden" name="pedirUsuario" value="on">' : ''}`;
  const ocultosComercio = (c) => `${hidden(c)}<input type="hidden" name="razon" value="${esc(c.razon)}"><input type="hidden" name="domicilio" value="${esc(c.domicilio)}"><input type="hidden" name="condIva" value="${c.condIva}"><input type="hidden" name="letra" value="${c.letra}"><input type="hidden" name="cuit" value="${esc(c.cuit)}"><input type="hidden" name="iibb" value="${esc(c.iibb)}"><input type="hidden" name="inicio" value="${esc(c.inicio)}"><input type="hidden" name="pv" value="${c.pv}">`;
  function tVentas() {
    const c = S().config;
    return `<form class="card" data-form="config"><div class="card-b" style="display:flex;flex-direction:column;gap:16px">${ocultosComercio(c)}
      <h2 style="font-size:17px">Tickets</h2>
      <div class="form">
        <div class="field"><label for="t-a">Ancho del papel</label><select id="t-a" name="ticketAncho">${opt(80, '80 mm', c.ticket.ancho)}${opt(58, '58 mm', c.ticket.ancho)}</select></div>
        <div class="field"><label for="t-p">Texto al pie</label><input id="t-p" name="ticketPie" type="text" maxlength="120" value="${esc(c.ticket.pie)}"></div>
      </div>
      ${chk('ticketAuto', c.ticket.auto, 'Imprimir el ticket automáticamente al cobrar', APP.puedeImprimir ? 'Usa la impresora predeterminada del navegador. En Chrome podés imprimir sin diálogo abriéndolo con --kiosk-printing.' : 'En esta vista no se puede imprimir; funciona al abrir Mostrador desde su dirección web.')}
      ${APP.puedeImprimir ? `<div><button type="button" class="btn" data-act="tkprueba">${ic('print')}Imprimir ticket de prueba</button></div>` : ''}
      <h2 style="font-size:17px">Ventas</h2>
      <div class="form"><div class="field"><label for="v-dm">Descuento máximo para vendedores (%)</label><input id="v-dm" name="descMaxVendedor" type="number" min="0" max="100" value="${c.descMaxVendedor}" inputmode="numeric"></div></div>
      ${chk('stockNegativo', c.stockNegativo, 'Permitir vender sin stock registrado', 'No recomendado: el stock queda negativo hasta que cargues la mercadería.')}
      ${chk('pedirUsuario', c.pedirUsuario, 'Preguntar quién atiende al abrir la app', 'Útil si varias personas usan la misma computadora. Cada venta queda con el nombre de quien la hizo.')}
      <h2 style="font-size:17px">Balanza</h2>
      ${chk('balanzaActiva', c.balanza.activa, 'Leer etiquetas de balanza con peso o importe', 'Formato EAN-13: prefijo + PLU + peso (o importe) + dígito verificador. Cargá el PLU en cada producto.')}
      <div class="form">
        <div class="field"><label for="b-p">Prefijo</label><input id="b-p" name="balanzaPrefijo" type="text" inputmode="numeric" maxlength="2" value="${esc(c.balanza.prefijo)}"></div>
        <div class="field"><label for="b-d">Dígitos del PLU</label><select id="b-d" name="balanzaPlu">${[4, 5, 6].map((n) => opt(n, n, c.balanza.digitosPlu)).join('')}</select></div>
        <div class="field"><label for="b-t">La etiqueta trae</label><select id="b-t" name="balanzaTipo">${opt('peso', 'Peso en gramos', c.balanza.tipo)}${opt('precio', 'Importe en centavos', c.balanza.tipo)}</select></div>
      </div>
      </div><div class="mf"><button class="btn primary" type="submit">Guardar cambios</button></div></form>`;
  }

  /* ---------- Usuarios ---------- */
  function tUsuarios() {
    const us = S().usuarios; const admin = UI.can('usuarios.editar');
    const filas = Object.keys(D.PERMS).filter((p) => !p.endsWith('.ver') || p === 'informes.ver');
    const nombres = { 'venta.crear': 'Vender', 'venta.descuento_libre': 'Descuentos sin límite', 'venta.devolver': 'Devolver o anular ventas', 'caja.abrir': 'Abrir la caja', 'caja.cerrar': 'Cerrar la caja (arqueo)', 'caja.movimiento': 'Retirar o ingresar efectivo', 'gasto.crear': 'Anotar gastos', 'gasto.anular': 'Anular gastos', 'producto.costos': 'Ver precios de compra', 'producto.editar': 'Crear y editar productos y precios', 'precio.masivo': 'Subir o bajar precios en masa', 'stock.ajustar': 'Corregir stock (conteos y pérdidas)', 'compra.recibir': 'Cargar mercadería que llegó', 'compra.costos': 'Cambiar precios de compra al recibir', 'pedido.crear': 'Hacer pedidos a proveedores', 'proveedor.editar': 'Editar proveedores', 'proveedor.pagar': 'Pagar a proveedores', 'devprov.crear': 'Devolver mercadería a proveedores', 'cliente.editar': 'Agregar y editar clientes', 'cliente.cobrar': 'Cobrar fiados', 'informes.ver': 'Ver informes', 'config.editar': 'Cambiar la configuración', 'usuarios.editar': 'Administrar usuarios', 'backup.exportar': 'Descargar copias de seguridad', 'backup.restaurar': 'Restaurar copias de seguridad' };
    return `<div class="note"><strong>Cómo funcionan los usuarios en este dispositivo.</strong> Sirven para saber quién hizo cada operación y para que cada persona vea solo lo que necesita. El PIN evita que alguien use otro usuario por error. Como los datos se guardan en este navegador, no es una protección contra alguien que tenga acceso técnico a la computadora: para eso está el modo en la nube (ver "Nube y ARCA").</div>
      <div class="toolbar">${admin ? `<button class="btn primary" data-act="usrnew">${ic('plus')}Agregar usuario</button>` : ''}</div>
      <div class="cards">${us.map((x) => `<div class="pcard"><div class="top"><div><h3>${esc(x.nombre)}</h3><div class="meta">${esc(D.ROLES[x.rol])}${x.pinHash ? ' · con PIN' : ' · sin PIN'}</div></div>${x.activo === false ? '<span class="pill bad">Desactivado</span>' : x.id === APP.userId ? '<span class="pill ok">Sos vos</span>' : ''}</div>${admin ? `<div class="acts"><button class="btn sm" data-act="usredit" data-id="${x.id}">Editar</button>${x.id !== APP.userId ? `<button class="btn sm ghost" data-act="usract" data-id="${x.id}">${x.activo === false ? 'Activar' : 'Desactivar'}</button>` : ''}</div>` : ''}</div>`).join('')}</div>
      <div class="card"><div class="card-h"><h2>Qué puede hacer cada rol</h2></div><div class="card-b"><div class="tw"><table><thead><tr><th>Permiso</th>${Object.values(D.ROLES).map((r) => `<th style="text-align:center">${r}</th>`).join('')}</tr></thead><tbody>${filas.map((p) => `<tr><td>${esc(nombres[p] || p)}</td>${Object.keys(D.ROLES).map((r) => `<td style="text-align:center">${D.PERMS[p].includes(r) ? '✓' : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div>`;
  }
  function usrForm(x) {
    const isNew = !x; x = x || { id: '', nombre: '', rol: 'vendedor' };
    UI.openModal(mHead(isNew ? 'Agregar usuario' : 'Editar usuario') + `<form data-form="usr" data-id="${x.id}"><div class="mb"><div class="form">
      <div class="field full"><label for="u-n">Nombre</label><input id="u-n" name="nombre" type="text" required maxlength="60" value="${esc(x.nombre)}" autofocus></div>
      <div class="field"><label for="u-r">Rol</label><select id="u-r" name="rol">${Object.entries(D.ROLES).map(([k, l]) => opt(k, l, x.rol)).join('')}</select></div>
      <div class="field"><label for="u-p">${isNew ? 'PIN (opcional)' : 'Nuevo PIN (dejalo vacío para no cambiarlo)'}</label><input id="u-p" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="new-password" placeholder="4 a 8 números"></div>
      ${!isNew && x.pinHash ? '<label style="display:flex;gap:8px;align-items:center" class="full"><input type="checkbox" name="sinpin"> Quitar el PIN</label>' : ''}
      </div></div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
  }

  /* ---------- Datos y copias ---------- */
  let snaps = null, legado = null, restaurando = null;
  function tDatos() {
    const s = S(); const r = ST.resumen(s); const ws = s.workspace;
    if (snaps === null) cargarSnaps();
    const ult = s.meta.ultimaCopia;
    return `<div class="card"><div class="card-h"><h2>Qué datos estás usando</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:12px">
        <dl class="dl"><dt>Modo</dt><dd>${ws.modo === 'demo' ? '<span class="modechip demo">Demostración (datos ficticios)</span>' : '<span class="modechip local">Mi negocio · guardado en este dispositivo</span>'}</dd>
        <dt>Comercio</dt><dd>${esc(s.config.nombre)}</dd><dt>Registros</dt><dd>${fn(r.productos)} productos · ${fn(r.ventas)} ventas · ${fn(r.movimientos)} movimientos de stock</dd>
        <dt>Dónde se guarda</dt><dd>${APP.store.volatil ? '<span class="tag bad">En memoria: se pierde al cerrar</span>' : esc(APP.store.tipo) + ' de este navegador'}</dd>
        <dt>Última copia descargada</dt><dd>${ult ? U.fDT(ult) : 'Nunca'}</dd></dl>
        <div class="toolbar">${ws.modo === 'demo' ? (APP.wsList && APP.wsList.some((w) => w.id === 'local') ? '<button class="btn primary" data-act="wsswitch" data-ws="local">Ir a mi negocio</button>' : '<button class="btn primary" data-act="wsnuevo">Empezar con mi negocio</button>') : '<button class="btn" data-act="wsswitch" data-ws="demo">Ver la demostración</button>'}</div>
        ${ws.modo === 'local' ? '<p class="hint" style="margin:0">Tus datos están solo en este navegador. Si se borra el historial del navegador o se rompe la computadora, se pierden: descargá copias de seguridad seguido y guardalas en otro lugar (pendrive, Google Drive, mail).</p>' : ''}
      </div></div>
      ${legadoCard()}
      <div class="card"><div class="card-h"><h2>Copia de seguridad</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:12px">
        <p class="muted" style="margin:0">Un archivo con <b>todos</b> los datos, verificado con una huella SHA-256 para detectar si se dañó o se modificó.</p>
        <div class="toolbar">${UI.can('backup.exportar') ? `<button class="btn primary" data-act="backupdl">${ic('down')}Descargar copia de seguridad</button>` : ''}${UI.can('backup.restaurar') ? `<label class="btn" for="bk-file">${ic('up')}Restaurar desde un archivo</label><input id="bk-file" type="file" accept=".json,application/json" data-bkfile="1" hidden>` : ''}</div>
        ${restaurando ? restaurarCard() : ''}
      </div></div>
      <div class="card"><div class="card-h"><h2>Copias automáticas</h2></div><div class="card-b"><p class="muted" style="margin:0 0 8px">Se guarda una por día y antes de operaciones delicadas (restaurar, cambios masivos de precios, cargar desde Excel). Se conservan las últimas 7.</p><div class="list" id="snaps">${snaps ? snaps.map((x) => `<div class="li"><div class="t"><b>${U.fDT(x.fecha)} · ${esc(x.motivo)}</b><span class="hint">${x.resumen ? `${fn(x.resumen.productos)} productos · ${fn(x.resumen.ventas)} ventas` : ''}</span></div>${UI.can('backup.restaurar') ? `<button class="btn sm" data-act="snaprest" data-id="${x.id}">Volver a esta copia</button>` : ''}</div>`).join('') || '<div class="empty">Todavía no hay copias automáticas.</div>' : '<div class="empty">Cargando…</div>'}</div></div></div>
      <div class="card danger-zone"><div class="card-h"><h2>Zona delicada</h2></div><div class="card-b"><div class="toolbar">
        ${ws.modo === 'demo' ? '<button class="btn" data-act="demoreset">Volver a los datos de ejemplo</button>' : UI.can('backup.restaurar') ? '<button class="btn danger" data-act="wsborrar">Borrar los datos de mi negocio de este dispositivo</button>' : ''}
      </div></div></div>`;
  }
  function legadoCard() {
    if (legado === null) { legado = ST.leerLegado(safeLS()) || false; }
    if (!legado) return '';
    if (legado.error) return `<div class="fiscal-warn"><strong>Encontramos datos de la versión anterior, pero están dañados.</strong> No se tocaron.</div>`;
    const o = legado.state; const r = { ventas: o.ventas.length, productos: o.productos.length };
    const hayLocal = APP.wsList && APP.wsList.some((w) => w.id === 'local');
    return `<div class="card"><div class="card-h"><h2>Datos de la versión anterior de Mostrador</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
      <p style="margin:0">Encontramos datos guardados por la versión anterior: <b>${esc((o.config || {}).nombre || '')}</b>, ${fn(r.productos)} productos y ${fn(r.ventas)} ventas. No se tocaron.</p>
      <p class="hint" style="margin:0">Si eran datos de prueba de la demo anterior, no hace falta traerlos. Si cargaste datos reales, traelos como "Mi negocio": se convierten al formato nuevo sin perder ventas, compras ni saldos (los CAE simulados de la versión anterior se descartan porque no eran reales).</p>
      <div class="toolbar">${!hayLocal && UI.can('backup.restaurar') ? '<button class="btn primary" data-act="legtraer">Traer como mi negocio</button>' : ''}<button class="btn" data-act="legdl">${ic('down')}Descargar esos datos</button>${UI.can('backup.restaurar') ? '<button class="btn ghost danger" data-act="legborrar">Ya no los necesito</button>' : ''}</div>
      ${hayLocal ? '<p class="hint" style="margin:0">Ya tenés "Mi negocio" creado en este dispositivo. Para reemplazarlo con estos datos, descargalos y restauralos desde el archivo.</p>' : ''}
    </div></div>`;
  }
  const safeLS = () => { try { return root.localStorage; } catch (e) { return null; } };
  function restaurarCard() {
    const r = restaurando;
    if (!r.ok) return `<div class="note"><strong>No se puede restaurar ese archivo.</strong><br>${r.errores.map(esc).join('<br>')}</div>`;
    return `<div class="fiscal-warn"><strong>Vas a reemplazar los datos actuales por los del archivo.</strong><br>${r.origen === 'version-anterior' ? 'Archivo de la versión anterior (se convierte al formato nuevo).' : `Copia del ${r.creado ? U.fDT(r.creado) : '?'}`}: ${esc(r.resumen.comercio || '')} · ${fn(r.resumen.productos)} productos · ${fn(r.resumen.ventas)} ventas.<br>Antes se guarda una copia automática de los datos actuales.</div>
      <div class="toolbar"><button class="btn danger solid" data-act="bkrest">Restaurar</button><button class="btn" data-act="bkcancel">Cancelar</button></div>`;
  }
  async function cargarSnaps() { try { snaps = await APP.store.snapList(APP.ws); } catch (e) { snaps = []; } if (tab === 'datos' && APP.view === 'config') UI.render(); }

  async function descargarBackup() {
    const b = await ST.crearBackup(S(), S().workspace);
    const ok = await UI.guardarArchivo(`mostrador-copia-${U.slug(S().config.nombre)}-${U.today()}.json`, new Blob([JSON.stringify(b)], { type: 'application/json' }));
    if (ok) await UI.run((s) => { s.meta.ultimaCopia = new Date().toISOString(); }, { render: true });
  }
  async function reemplazarEstado(nuevo, motivo, okMsg) {
    nuevo.workspace = { ...S().workspace };
    try {
      await APP.store.snapshot(APP.ws, S(), motivo);
      APP.version = await APP.store.save(APP.ws, nuevo, APP.version);
      APP.S = nuevo; UI.asegurarUsuario(); snaps = null; restaurando = null; UI.render(); UI.toast(okMsg);
    } catch (e) { UI.manejarError(e); }
  }

  /* ---------- Nube y ARCA ---------- */
  function tNube() {
    const cfg = root.MOSTRADOR_CONFIG || {};
    const nubeConf = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
    return `<div class="card"><div class="card-h"><h2>Modo empresa en la nube (Supabase)</h2><span class="tag ${nubeConf ? 'warn' : 'bad'}">${nubeConf ? 'Configurado, sin activar' : 'No disponible todavía'}</span></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
        <p style="margin:0">Permitiría que varios dispositivos compartan el mismo inventario, con usuarios que inician sesión y permisos verificados por la base de datos.</p>
        <p style="margin:0"><b>Qué está listo:</b> la base de datos (tablas, permisos por empresa y por rol con RLS, y operaciones atómicas de venta, recepción y ajustes) en la carpeta <span class="mono">supabase/</span> del proyecto, probada con PostgreSQL.</p>
        <p style="margin:0"><b>Qué falta:</b> crear el proyecto en Supabase, cargar la base, y conectar esta pantalla al servidor (inicio de sesión y sincronización). Hasta que eso esté hecho y probado, la app sigue guardando en este dispositivo.</p>
        <p class="hint" style="margin:0">Guía paso a paso: <span class="mono">docs/SUPABASE.md</span>.</p>
      </div></div>
      <div class="card"><div class="card-h"><h2>Facturación electrónica ARCA</h2><span class="tag bad">No configurada</span></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
        <p style="margin:0">Los comprobantes que emite Mostrador hoy son <b>internos, sin CAE</b>, y lo dicen en el ticket y en el comprobante. La app no inventa CAE ni códigos QR fiscales.</p>
        <p style="margin:0"><b>Qué está preparado:</b> un módulo separado (<span class="mono">supabase/functions/arca-wsfe</span>) que, desde un servidor, se autentica con el certificado digital del comercio (WSAA), consulta el último número autorizado y pide el CAE de cada comprobante (WSFEv1), validando la respuesta de ARCA.</p>
        <p style="margin:0"><b>Qué falta:</b> generar el certificado en ARCA, habilitar un punto de venta para web services, cargar el certificado como secreto del servidor y probar en el ambiente de homologación antes de pasar a producción. Requiere el modo en la nube: el certificado nunca puede estar en el navegador.</p>
        <p class="hint" style="margin:0">Guía: <span class="mono">docs/ARCA.md</span>.</p>
      </div></div>`;
  }
  function tAuditoria() {
    const a = S().auditoria.slice().reverse().slice(0, 200);
    return `<p class="muted" style="margin:0">Registro de cambios importantes: precios, productos archivados, devoluciones, diferencias de caja, usuarios, configuración y restauraciones. No se puede editar desde la app.</p>
      <div class="tw"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${a.map((x) => `<tr><td>${U.fDT(x.fecha)}</td><td>${esc(D.uNombre(S(), x.usuario))}</td><td><span class="tag">${esc(x.accion)}</span></td><td class="logline">${esc(x.detalle)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin registros.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- Empezar con mi negocio ---------- */
  function wsNuevoForm() {
    UI.openModal(mHead('Empezar con mi negocio', 'Se crea un espacio nuevo y vacío. La demostración queda guardada aparte.') + `<form data-form="wsnuevo"><div class="mb"><div class="form">
      <div class="field full"><label for="w-n">Nombre del comercio</label><input id="w-n" name="nombre" type="text" required maxlength="80" autofocus placeholder="Ej.: Almacén Don Pedro"></div>
      <div class="field"><label for="w-iva">¿Qué sos frente al IVA?</label><select id="w-iva" name="condIva">${opt('MONO', 'Monotributo')}${opt('RI', 'Responsable Inscripto')}</select></div>
      <div class="field"><label for="w-c">CUIT (opcional)</label><input id="w-c" name="cuit" type="text" class="mono" inputmode="numeric"></div>
      <div class="field"><label for="w-u">Tu nombre</label><input id="w-u" name="usuario" type="text" required maxlength="60" placeholder="Vas a ser el administrador"></div>
      <div class="field"><label for="w-p">PIN (opcional)</label><input id="w-p" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="new-password" placeholder="4 a 8 números"></div>
      </div><p class="hint" style="margin:0">Los datos se guardan en este navegador. Te vamos a recordar descargar copias de seguridad.</p></div>
      <div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Crear mi negocio</button></div></form>`);
  }
  async function crearWorkspaceLocal(st, userName, pin) {
    try {
      const list = await APP.store.list(); if (list.some((w) => w.id === 'local')) throw new D.DomainError('Ya existe "Mi negocio" en este dispositivo.');
      if (userName) { const salt = U.uid(); const x = { id: U.uid(), nombre: String(userName).trim().slice(0, 60) || 'Administrador', rol: 'admin', pinHash: pin ? await D.hashPin(pin, salt) : null, salt: pin ? salt : null, activo: true }; st.usuarios.unshift(x); }
      st.workspace.modo = 'local';
      await APP.store.save('local', st, null);
      await UI.cambiarWorkspace('local', st.usuarios[0].id);
      UI.closeModal(); UI.toast('¡Listo! Ya estás usando Mostrador con tu negocio.');
    } catch (e) { UI.manejarError(e); }
  }

  /* ---------- Acciones ---------- */
  Object.assign(UI.act, {
    cfgtab: (b) => { tab = b.dataset.t; UI.render(); },
    tkprueba: () => { const v = { id: 'x', nro: '00000-00000000', fecha: new Date().toISOString(), usuario: APP.userId, clienteId: 'c0', tipo: 'TK', items: [{ pid: '', nombre: 'Producto de prueba', cant: 2, precio: 1500, devuelto: 0 }], desc: 0, pagos: [{ medio: 'Efectivo', monto: 3000 }], recibido: 5000, vuelto: 2000, total: 3000, bruto: 3000, i21: 520.66, i105: 0, n21: 2479.34, n105: 0, condEmisor: S().config.condIva, fiscal: { estado: 'no_fiscal' } }; M.Ticket.imprimir(M.Ticket.ticketHTML(v, S(), S().config.ticket.ancho), S().config.ticket.ancho); },
    usrnew: () => usrForm(), usredit: (b) => usrForm(D.usuario(S(), b.dataset.id)),
    usract: async (b) => { const x = D.usuario(S(), b.dataset.id); UI.run((s, u) => D.desactivarUsuario(s, u, x.id, x.activo === false), { ok: x.activo === false ? 'Usuario activado' : 'Usuario desactivado' }); },
    backupdl: () => descargarBackup(),
    bkrest: async () => { const r = restaurando; const ok = await UI.confirmar({ titulo: 'Restaurar copia', texto: '<p>Los datos actuales se reemplazan por los del archivo. Antes se guarda una copia automática por si necesitás volver atrás.</p>', ok: 'Restaurar', peligro: true, escribir: 'RESTAURAR' }); if (ok) reemplazarEstado(r.estado, 'Antes de restaurar una copia', 'Copia restaurada'); },
    bkcancel: () => { restaurando = null; UI.render(); },
    snaprest: async (b) => { const ok = await UI.confirmar({ titulo: 'Volver a una copia automática', texto: '<p>Los datos actuales se reemplazan por los de esa copia. Antes se guarda otra copia de los actuales.</p>', ok: 'Volver a esa copia', peligro: true, escribir: 'RESTAURAR' }); if (!ok) return; try { const sn = await APP.store.snapGet(+b.dataset.id || b.dataset.id); const errs = ST.validarEstado(sn.state); if (errs.length) { UI.toast('Esa copia está dañada: ' + errs[0], { error: true }); return; } reemplazarEstado(sn.state, 'Antes de volver a una copia automática', 'Listo: volviste a la copia del ' + U.fDT(sn.fecha)); } catch (e) { UI.manejarError(e); } },
    demoreset: async () => { const ok = await UI.confirmar({ titulo: 'Volver a los datos de ejemplo', texto: '<p>Se pierde lo que cargaste en la demostración. Tu negocio (si lo creaste) no se toca.</p>', ok: 'Volver al ejemplo', peligro: true }); if (ok) { const st = M.seed(); st.workspace = { ...S().workspace }; reemplazarEstado(st, 'Antes de reiniciar la demostración', 'Volviste a los datos de ejemplo'); } },
    wsnuevo: () => wsNuevoForm(),
    wsswitch: (b) => UI.cambiarWorkspace(b.dataset.ws),
    wsborrar: async () => {
      const ok = await UI.confirmar({ titulo: 'Borrar los datos de mi negocio', texto: '<p>Se borran <b>todos</b> los datos de tu negocio de este navegador. Primero se descarga una copia de seguridad automáticamente.</p><p>Esta acción no se puede deshacer.</p>', ok: 'Descargar copia y borrar', peligro: true, escribir: 'BORRAR' });
      if (!ok) return; const b = await ST.crearBackup(S(), S().workspace);
      const desc = await UI.guardarArchivo(`mostrador-copia-antes-de-borrar-${U.today()}.json`, new Blob([JSON.stringify(b)], { type: 'application/json' }));
      if (!desc) { UI.toast('No se borró nada porque no se pudo descargar la copia.', { error: true }); return; }
      try { await APP.store.remove('local'); await UI.cambiarWorkspace('demo'); UI.toast('Se borraron los datos de tu negocio de este dispositivo.'); } catch (e) { UI.manejarError(e); }
    },
    legtraer: async () => { if (!legado || !legado.state) return; const st = ST.migrarLegado(legado.state); await crearWorkspaceLocal(st, null, null); },
    legdl: () => UI.guardarArchivo(`mostrador-version-anterior-${U.today()}.json`, new Blob([JSON.stringify(legado.state)], { type: 'application/json' })),
    legborrar: async () => { const ok = await UI.confirmar({ titulo: 'Borrar datos de la versión anterior', texto: '<p>Se borran del navegador los datos de la versión anterior. Si tenían algo importante, descargalos primero.</p>', ok: 'Borrar', peligro: true, escribir: 'BORRAR' }); if (!ok) return; ST.LEGACY_KEYS.forEach((k) => { try { root.localStorage.removeItem(k); } catch (e) { /* nada */ } }); legado = false; UI.render(); UI.toast('Listo, se borraron.'); }
  });
  Object.assign(UI.form, {
    config: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const r = await UI.run((s, u) => D.guardarConfig(s, u, d), { ok: 'Cambios guardados' }); if (r) UI.posReset && UI.posReset(); },
    usr: async (fm) => {
      const d = Object.fromEntries(new FormData(fm)); const id = fm.dataset.id;
      if (d.pin && !/^\d{4,8}$/.test(d.pin)) { UI.toast('El PIN tiene que tener entre 4 y 8 números.', { error: true }); return; }
      let pinHash, salt; if (d.pin) { salt = U.uid(); pinHash = await D.hashPin(d.pin, salt); } else if (d.sinpin) { pinHash = null; salt = null; }
      const r = await UI.run((s, u) => D.guardarUsuario(s, u, { id, nombre: d.nombre, rol: d.rol }, pinHash, salt), { ok: 'Usuario guardado' }); if (r) UI.closeModal();
    },
    wsnuevo: async (fm) => {
      const d = Object.fromEntries(new FormData(fm));
      if (d.pin && !/^\d{4,8}$/.test(d.pin)) { UI.toast('El PIN tiene que tener entre 4 y 8 números.', { error: true }); return; }
      if (d.cuit && !U.cuitValido(d.cuit)) { UI.toast('El CUIT no es válido: revisá los números.', { error: true }); return; }
      const st = D.emptyState('local'); Object.assign(st.config, { nombre: String(d.nombre).trim().slice(0, 80), condIva: d.condIva === 'RI' ? 'RI' : 'MONO', cuit: d.cuit ? U.fmtCuit(d.cuit) : '' });
      await crearWorkspaceLocal(st, d.usuario, d.pin);
    }
  });
  Object.assign(UI.change, {
    bkfile: (t) => { const f = t.files && t.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { restaurando = await ST.leerBackup(String(r.result)); UI.render(); }; r.readAsText(f); t.value = ''; }
  });
  UI.views.config = { title: 'Configuración', render: view, setTab: (t) => { tab = t; } };
  UI.configReset = () => { snaps = null; legado = null; restaurando = null; };
  UI.wsNuevoForm = wsNuevoForm;
})(typeof window !== 'undefined' ? window : globalThis);
