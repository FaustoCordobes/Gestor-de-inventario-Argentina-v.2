/* Mostrador · ui/mercaderia.js
 * Productos, recepción de mercadería, pedidos a proveedores, reposición sugerida
 * y movimientos de stock (kardex).
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI;
  const { esc, f$, fn } = U;
  const { APP, ic, opt, mHead, head, $ } = UI;
  const S = () => APP.S;

  let tab = 'productos', menuOpen = false;
  const pf = { q: '', cat: '', falta: false, archivados: false, orden: 'nombre', dir: 1, max: 100 };
  const kx = { q: '', tipo: '', dias: 30, max: 100 };
  UI.setMercaderiaTab = (t) => { tab = t; };

  function view() {
    const low = D.lowStock(S()).length; const ped = S().pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'parcial').length;
    const t = [['productos', 'Productos', 'mercaderia'], UI.can('compra.recibir') && ['llego', 'Llegó mercadería', 'proveedores'], UI.can('pedido.crear') && ['pedidos', `Pedidos${ped ? ' (' + ped + ')' : ''}`, 'list'], UI.can('pedido.crear') && ['falta', `Qué falta${low ? ' (' + low + ')' : ''}`, 'falta'], UI.can('stock.ajustar') && ['movimientos', 'Movimientos de stock', 'list']];
    if (!t.some((x) => x && x[0] === tab)) tab = 'productos';
    return head('Mercadería', 'Tus productos, lo que llega de los proveedores, los pedidos y cada movimiento de stock.', '', 'mercaderia') + UI.tabs(tab, t, 'mtab') +
      (tab === 'productos' ? tProductos() : tab === 'llego' ? tLlego() : tab === 'pedidos' ? tPedidos() : tab === 'falta' ? tFalta() : tMovimientos());
  }
  function after() { if (tab === 'productos') renderTabla(); if (tab === 'llego') llTotals(); if (tab === 'movimientos') renderKardex(); }

  /* ---------- Productos ---------- */
  function tProductos() {
    const cats = [...new Set(S().productos.map((p) => p.categoria))].sort();
    const admin = UI.can('producto.editar');
    return `<div class="toolbar">${admin ? `<button class="btn primary" data-act="prodnew">${ic('plus')}Agregar producto</button>` : ''}
      <div class="menu-wrap"><button class="btn" data-act="menu" aria-expanded="${menuOpen}" aria-haspopup="menu">Más opciones ▾</button>${menuOpen ? `<div class="menu" role="menu">
        ${UI.can('precio.masivo') ? `<button role="menuitem" data-act="aumento">${ic('pct')}Subir o bajar precios</button>` : ''}
        ${admin ? `<button role="menuitem" data-act="import">${ic('up')}Cargar productos desde Excel</button>` : ''}
        <button role="menuitem" data-act="expprod">${ic('down')}Descargar lista en Excel</button></div>` : ''}</div></div>
      <div class="toolbar"><input type="search" id="pf-q" placeholder="Buscar producto o código" value="${esc(pf.q)}" style="flex:1;min-width:200px" data-pf="q" aria-label="Buscar producto">
        <select id="pf-cat" data-pf="cat" aria-label="Categoría">${opt('', 'Todas las categorías', pf.cat)}${cats.map((c) => opt(c, c, pf.cat)).join('')}</select>
        <button class="chip" data-act="pffalta" aria-pressed="${pf.falta}">Solo lo que se está acabando</button>
        <button class="chip" data-act="pfarch" aria-pressed="${pf.archivados}">Ver archivados</button></div>
      <div id="prod-table"></div>`;
  }
  function renderTabla() {
    const el = $('#prod-table'); if (!el) return; const q = pf.q.trim().toLowerCase();
    const verCostos = UI.can('producto.costos');
    let list = S().productos.filter((p) => (pf.archivados ? p.activo === false : p.activo !== false) && (!q || p.nombre.toLowerCase().includes(q) || p.codigo.includes(q)) && (!pf.cat || p.categoria === pf.cat) && (!pf.falta || p.stock <= p.stockMin));
    const key = { nombre: (p) => p.nombre.toLowerCase(), precio: (p) => p.precio, stock: (p) => p.stock, margen: (p) => D.margenDesde(p, p.precio) }[pf.orden];
    list.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * pf.dir);
    const th = (k, l, cls) => `<th class="sort ${cls || ''}" data-act="pfsort" data-k="${k}" aria-sort="${pf.orden === k ? (pf.dir > 0 ? 'ascending' : 'descending') : 'none'}" tabindex="0">${l}</th>`;
    const vista = list.slice(0, pf.max);
    el.innerHTML = `<div class="tw"><table><thead><tr>${th('nombre', 'Producto')}${verCostos ? '<th class="n">Costo</th>' + th('margen', 'Ganancia', 'n') : ''}${th('precio', 'Precio de venta', 'n')}${th('stock', 'Te quedan')}<th></th></tr></thead><tbody>
      ${vista.map((p) => `<tr><td><b>${esc(p.nombre)}</b><span class="sub">${esc(p.categoria)} · <span class="mono">${esc(p.codigo)}</span>${p.plu ? ' · PLU ' + esc(p.plu) : ''}</span></td>${verCostos ? `<td class="n">${f$(p.costo)}</td><td class="n">${fn(p.margen)}%</td>` : ''}<td class="n"><b>${f$(p.precio)}</b>${p.unidad === 'kg' ? '<span class="sub">el kilo</span>' : ''}</td><td>${UI.stockPill(p)}</td><td style="text-align:right"><button class="btn sm" data-act="prodedit" data-id="${p.id}">${UI.can('producto.editar') ? 'Ver / editar' : 'Ver'}</button></td></tr>`).join('') || `<tr><td colspan="6" class="empty">No hay productos con esa búsqueda.</td></tr>`}
      </tbody></table></div>${list.length > pf.max ? `<div class="toolbar"><button class="btn" data-act="pfmas">Mostrar más (${list.length - pf.max} restantes)</button></div>` : ''}
      <p class="hint">${list.length} productos${verCostos ? ` · Valor a costo: ${f$(U.sum(list, (p) => Math.max(0, p.stock) * p.costo))}` : ''} · A precio de venta: ${f$(U.sum(list, (p) => Math.max(0, p.stock) * p.precio))}</p>`;
  }
  function prodForm(p) {
    const isNew = !p; const edit = UI.can('producto.editar');
    p = p || { id: '', codigo: '', plu: '', nombre: '', categoria: '', provId: (S().proveedores[0] || {}).id || '', costo: '', margen: 40, iva: 21, stock: 0, stockMin: 5, unidad: 'u', precio: 0 };
    const cats = [...new Set(S().productos.map((x) => x.categoria))]; const dis = edit ? '' : 'disabled';
    const verCostos = UI.can('producto.costos');
    UI.openModal(mHead(isNew ? 'Agregar producto' : esc(p.nombre), isNew ? 'Completá lo básico. El precio de venta se calcula solo.' : `Te quedan ${fn(p.stock)} ${UI.uLabel(p)}${p.activo === false ? ' · <b>Archivado</b>' : ''}`) + `<form data-form="prod" data-id="${p.id}"><div class="mb">
      ${!edit ? '<p class="note" style="margin:0">Solo un administrador puede cambiar productos y precios.</p>' : ''}
      <div class="form">
        <div class="field full"><label for="f-nombre">Nombre del producto</label><input id="f-nombre" name="nombre" type="text" required maxlength="120" value="${esc(p.nombre)}" placeholder="Ej.: Yerba mate 1 kg" ${isNew ? 'autofocus' : ''} ${dis}></div>
        ${verCostos ? `<div class="field"><label for="f-costo">¿A cuánto lo comprás?</label><input id="f-costo" name="costo" type="number" step="0.01" min="0" required value="${p.costo}" data-calc="1" inputmode="decimal" ${dis}><span class="hint">Precio del proveedor, sin IVA</span></div>
        <div class="field"><label for="f-margen">¿Cuánto le querés ganar?</label><input id="f-margen" name="margen" type="number" step="0.1" value="${p.margen}" data-calc="1" inputmode="decimal" ${dis}><span class="hint">En porcentaje (%)</span></div>` : `<input type="hidden" name="costo" value="${p.costo}"><input type="hidden" name="margen" value="${p.margen}">`}
        <div class="field full"><label for="f-precio">Precio de venta al público</label><input id="f-precio" name="precio" type="number" step="0.01" min="0" value="${p.precio || D.calcPrecio(p)}" data-calc="precio" inputmode="decimal" style="font-size:22px;font-weight:700;font-family:var(--f-display)" ${dis}><span class="hint">Ya incluye IVA. Si lo cambiás a mano, se ajusta la ganancia.</span></div>
        ${isNew ? `<div class="field"><label for="f-stock">¿Cuántos tenés ahora?</label><input id="f-stock" name="stock" type="number" step="0.01" min="0" value="${p.stock}" inputmode="decimal"></div>` : ''}
        <div class="field"><label for="f-min">Avisarme cuando queden menos de</label><input id="f-min" name="stockMin" type="number" step="0.01" min="0" value="${p.stockMin}" inputmode="decimal" ${dis}></div>
      </div>
      <details class="more"><summary>Más datos (código, proveedor, IVA, balanza)</summary><div><div class="form">
        <div class="field"><label for="f-codigo">Código de barras</label><input id="f-codigo" name="codigo" type="text" value="${esc(p.codigo)}" class="mono" inputmode="numeric" placeholder="Escanealo acá" ${dis}><span class="hint">Si lo dejás vacío, se crea uno</span></div>
        <div class="field"><label for="f-cat">Categoría</label><input id="f-cat" name="categoria" type="text" list="dl-cats" value="${esc(p.categoria)}" placeholder="Ej.: Almacén" ${dis}><datalist id="dl-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label for="f-prov">Proveedor</label><select id="f-prov" name="provId" ${dis}>${opt('', 'Sin proveedor', p.provId)}${S().proveedores.map((x) => opt(x.id, x.nombre, p.provId)).join('')}</select></div>
        <div class="field"><label for="f-uni">Se vende por</label><select id="f-uni" name="unidad" ${dis}>${opt('u', 'Unidad', p.unidad)}${opt('kg', 'Kilo', p.unidad)}</select></div>
        <div class="field"><label for="f-iva">IVA</label><select id="f-iva" name="iva" data-calc="1" ${dis}>${opt(21, '21% (la mayoría)', p.iva)}${opt(10.5, '10,5% (frutas, verduras, huevos, carne)', p.iva)}${opt(27, '27%', p.iva)}${opt(0, 'Exento', p.iva)}</select></div>
        <div class="field"><label for="f-plu">PLU de balanza</label><input id="f-plu" name="plu" type="text" inputmode="numeric" maxlength="6" value="${esc(p.plu || '')}" placeholder="Ej.: 00014" ${dis}><span class="hint">Para leer etiquetas de balanza con peso</span></div>
      </div></div></details>
    </div><div class="mf">${!isNew ? `${UI.can('stock.ajustar') ? `<button type="button" class="btn sp" data-act="ajuste" data-id="${p.id}">Corregir stock</button>` : ''}<button type="button" class="btn ghost" data-act="kardex" data-id="${p.id}">Historial</button>${edit ? `<button type="button" class="btn ghost danger" data-act="prodarch" data-id="${p.id}">${p.activo === false ? 'Reactivar' : 'Archivar'}</button>` : ''}` : '<button type="button" class="btn" data-act="close">Cancelar</button>'}${edit ? '<button class="btn primary" type="submit">Guardar</button>' : '<button type="button" class="btn primary" data-act="close">Cerrar</button>'}</div></form>`);
  }
  function onCalc(t) {
    const fm = t.closest('form'); const F = (n) => fm.querySelector('[name="' + n + '"]');
    const c = U.num(F('costo').value), iva = U.num(F('iva').value);
    if (t.dataset.calc === 'precio') F('margen').value = D.margenDesde({ costo: c, iva }, U.num(F('precio').value));
    else F('precio').value = D.calcPrecio({ costo: c, iva, margen: U.num(F('margen').value) });
  }
  let ajTipo = 'conteo';
  function ajusteForm(id) {
    const p = D.prod(S(), id);
    const tipos = [['conteo', 'Conté y hay otra cantidad'], ['merma', 'Se perdió, venció o rompió'], ['ajuste', 'Ingresó sin factura']];
    UI.openModal(mHead('Corregir stock', `${esc(p.nombre)} · la app tiene ${fn(p.stock)} ${UI.uLabel(p)}`) + `<form data-form="ajuste" data-id="${id}"><div class="mb">
      <div class="field"><span class="lb">¿Qué pasó?</span><div class="choices" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">${tipos.map(([k, l]) => `<button type="button" class="choice" data-act="ajtipo" data-v="${k}" aria-pressed="${ajTipo === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><label for="a-cant" id="a-cant-l">${ajTipo === 'conteo' ? '¿Cuántos hay realmente?' : '¿Cuántos?'}</label><input id="a-cant" name="cant" type="number" step="${p.unidad === 'kg' ? '0.001' : '1'}" min="0" required value="${ajTipo === 'conteo' ? p.stock : ''}" autofocus inputmode="decimal" style="font-size:22px;font-weight:700"></div>
      <div class="field"><label for="a-mot">Motivo</label><input id="a-mot" name="motivo" type="text" list="dl-mot" required maxlength="120" placeholder="${ajTipo === 'merma' ? 'Ej.: Vencido' : ajTipo === 'conteo' ? 'Ej.: Conteo mensual' : 'Ej.: Muestra del proveedor'}"><datalist id="dl-mot">${D.MOTIVOS_MERMA.concat(['Conteo mensual', 'Me equivoqué al cargar']).map((m) => `<option value="${esc(m)}">`).join('')}</datalist><span class="hint">Queda registrado con tu usuario, la fecha y la cantidad anterior.</span></div>
      </div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
  }
  function kardex(id) {
    const p = D.prod(S(), id); const mov = S().movimientos.filter((m) => m.pid === id).slice().reverse();
    UI.openModal(mHead('Historial de stock', `${esc(p.nombre)} · te quedan ${fn(p.stock)}`) + `<div class="mb"><div class="tw"><table><thead><tr><th>Fecha</th><th>Qué pasó</th><th class="n">Cantidad</th><th class="n">Antes → Después</th><th>Usuario</th></tr></thead><tbody>
      ${mov.slice(0, 80).map((m) => kRow(m, false)).join('') || '<tr><td colspan="5" class="empty">Todavía no hay movimientos.</td></tr>'}</tbody></table></div>${mov.length > 80 ? `<p class="hint">Se muestran los últimos 80 de ${mov.length}. Todos están en Mercadería → Movimientos de stock.</p>` : ''}</div>`, true);
  }
  const kRow = (m, conProd) => { const p = D.prod(S(), m.pid) || { nombre: '?' }; return `<tr><td>${U.fDT(m.fecha)}</td>${conProd ? `<td>${esc(p.nombre)}</td>` : ''}<td>${esc(D.MOV_TIPOS[m.tipo] || m.tipo)}<span class="sub">${esc(m.motivo || '')}${m.ref && m.ref.tipo === 'venta' ? ` · <button class="link" data-act="vercbte" data-id="${m.ref.id}">ver venta</button>` : ''}</span></td><td class="n" style="color:${m.cant < 0 ? 'var(--bad)' : 'var(--ok)'}">${m.cant > 0 ? '+' : ''}${fn(m.cant)}</td><td class="n">${fn(m.antes)} → <b>${fn(m.despues)}</b></td><td>${esc(D.uNombre(S(), m.usuario))}</td></tr>`; };
  function aumentoForm() {
    menuOpen = false; const cats = [...new Set(S().productos.map((p) => p.categoria))];
    UI.openModal(mHead('Subir o bajar precios', 'Por ejemplo, cuando un proveedor te manda la lista nueva.') + `<form data-form="aumento"><div class="mb"><div class="form">
      <div class="field full"><label for="au-alc">¿A qué productos?</label><select id="au-alc" name="alcance">${opt('todos', 'A todos')}${S().proveedores.map((p) => opt('prov:' + p.id, 'Los de ' + p.nombre)).join('')}${cats.map((c) => opt('cat:' + c, 'Categoría ' + c)).join('')}</select></div>
      <div class="field"><label for="au-pct">¿Cuánto? (%)</label><input id="au-pct" name="pct" type="number" step="0.1" required value="8" autofocus inputmode="decimal"><span class="hint">Para bajar, poné un número negativo</span></div>
      <div class="field"><label for="au-red">Redondear el precio</label><select id="au-red" name="red">${opt(0, 'No')}${opt(10, 'A los $10', 10)}${opt(50, 'A los $50')}${opt(100, 'A los $100')}</select></div>
      </div><p class="hint" style="margin:0">Se aplica sobre el precio de compra y se mantiene tu porcentaje de ganancia. Queda registrado en la auditoría.</p></div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Cambiar precios</button></div></form>`);
  }

  /* Importación desde Excel */
  let importRows = null;
  function importForm() {
    menuOpen = false; importRows = null;
    UI.openModal(mHead('Cargar productos desde Excel', 'Si el código ya existe, se actualiza. Si no, se crea.') + `<div class="mb">
      <ol class="howto"><li>Descargá la planilla de ejemplo y completala. <button class="link" data-act="plantilla">Descargar planilla</button></li><li>Elegí el archivo, o copiá las filas en Excel y pegalas abajo.</li><li>Revisá la vista previa y tocá "Cargar".</li></ol>
      <div class="field"><label for="imp-file">Archivo de Excel</label><input id="imp-file" type="file" accept=".xlsx,.xls,.csv" data-imp="file"></div>
      <div class="field"><label for="imp-txt">O pegá acá las filas (con el encabezado)</label><textarea id="imp-txt" rows="4" data-imp="txt" placeholder="codigo	nombre	categoria	proveedor	costo	margen	iva	stock	stock_min"></textarea></div>
      <div id="imp-prev"></div></div>
      <div class="mf"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="doimport" id="imp-go" disabled>Cargar</button></div>`, true);
  }
  function parseImport(rows) {
    const norm = (k) => String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z_]/g, '');
    const errores = [];
    const out = rows.map((r) => { const o = {}; for (const k in r) o[norm(k)] = r[k]; return o; }).filter((o) => o.codigo && o.nombre).map((o, i) => {
      const pv = S().proveedores.find((p) => p.nombre.toLowerCase() === String(o.proveedor || '').toLowerCase());
      const r = { codigo: String(o.codigo).trim(), nombre: String(o.nombre).trim().slice(0, 120), categoria: String(o.categoria || 'Varios').trim(), provId: pv ? pv.id : '', costo: U.toNum(o.costo), margen: o.margen === '' || o.margen == null ? 40 : U.toNum(o.margen), iva: o.iva === '' || o.iva == null ? 21 : U.toNum(o.iva), stock: o.stock === '' || o.stock == null ? 0 : U.toNum(o.stock), stockMin: o.stock_min === '' || o.stock_min == null ? 5 : U.toNum(o.stock_min), unidad: 'u' };
      if (!Number.isFinite(r.costo) || r.costo < 0 || !Number.isFinite(r.margen) || ![0, 10.5, 21, 27].includes(r.iva) || !Number.isFinite(r.stock) || r.stock < 0) errores.push(`Fila ${i + 2} (${r.nombre}): revisá costo, margen, IVA o stock.`);
      return r;
    });
    importRows = errores.length ? null : out;
    const nuevos = out.filter((r) => !S().productos.some((p) => p.codigo === r.codigo)).length;
    $('#imp-prev').innerHTML = errores.length ? `<div class="note"><strong>Hay filas con datos inválidos. No se cargó nada.</strong><br>${errores.slice(0, 8).map(esc).join('<br>')}</div>` : out.length ? `<div class="okbox">${ic('check')}${out.length} productos listos: ${nuevos} nuevos y ${out.length - nuevos} para actualizar</div><div class="tw"><table><thead><tr><th>Producto</th><th class="n">Lo comprás a</th><th class="n">Se vende a</th></tr></thead><tbody>${out.slice(0, 6).map((r) => `<tr><td>${esc(r.nombre)}</td><td class="n">${f$(r.costo)}</td><td class="n">${f$(D.calcPrecio(r))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note">No encontramos filas con código y nombre. Fijate que la primera fila tenga los títulos de la planilla de ejemplo.</div>';
    $('#imp-go').disabled = !importRows || !importRows.length;
  }
  function readImport(src, isText) {
    if (typeof root.XLSX === 'undefined') { UI.toast('No se pudo abrir el lector de planillas', { error: true }); return; }
    try { const wb = isText ? root.XLSX.read(src, { type: 'string' }) : root.XLSX.read(src, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; parseImport(root.XLSX.utils.sheet_to_json(ws, { defval: '' })); }
    catch (e) { $('#imp-prev').innerHTML = '<div class="note">No pudimos leer el archivo. Probá guardarlo como .xlsx.</div>'; }
  }
  async function doImport() {
    if (!importRows) return; const rows = importRows;
    const r = await UI.run((s, u) => { let n = 0, a = 0; rows.forEach((x) => { const ex = s.productos.find((p) => p.codigo === x.codigo); if (ex) { D.editarProducto(s, u, ex.id, { ...ex, ...x, precio: undefined, provId: x.provId || ex.provId }); a++; } else { D.crearProducto(s, u, { ...x, provId: x.provId || (s.proveedores[0] || {}).id || '' }); n++; } }); return { n, a }; }, { snapshot: 'Antes de cargar productos desde Excel', ok: (x) => `Listo: ${x.n} productos nuevos y ${x.a} actualizados` });
    if (r) UI.closeModal();
  }

  /* ---------- Llegó mercadería ---------- */
  let ll = null, llMsg = '';
  const newLL = (provId, pre) => ({ provId: provId || null, pedidoId: (pre && pre.pedidoId) || null, cant: (pre && pre.cant) || {}, costo: {}, extra: (pre && pre.extra) || [], pagado: null, medio: 'Transferencia', tipo: 'Factura A', nro: '', act: true });
  function tLlego() {
    if (!ll) ll = newLL();
    const ult = S().compras.slice().reverse().slice(0, 6);
    const ultHTML = `<div class="card"><div class="card-h"><h2>Últimas mercaderías recibidas</h2><button class="link" data-act="expcompras">Descargar en Excel</button></div><div class="card-b"><div class="list">${ult.map((c) => `<div class="li"><div class="t"><b>${esc((D.prov(S(), c.provId) || {}).nombre || '')}</b><span class="hint">${U.fD(c.fecha)} · ${c.items.length} productos · ${c.cond === 'cc' ? 'Quedó debiendo' : 'Pagado con ' + esc(c.medio)} · Recibió ${esc(D.uNombre(S(), c.usuario))}</span></div><span class="num"><b>${f$(c.total)}</b> <button class="btn sm ghost" data-act="vercompra" data-id="${c.id}">Ver</button></span></div>`).join('') || '<div class="empty">Todavía no cargaste mercadería.</div>'}</div></div></div>`;
    if (!ll.provId) {
      return `${llMsg ? `<div class="okbox">${ic('check')}${esc(llMsg)}</div>` : ''}<div class="card"><div class="card-h"><h2>1. ¿Quién te trajo la mercadería?</h2></div><div class="card-b"><div class="provcards">
        ${S().proveedores.map((p) => { const ped = S().pedidos.filter((x) => x.provId === p.id && (x.estado === 'pendiente' || x.estado === 'parcial')).length; return `<button class="pc" data-act="llprov" data-id="${p.id}"><b>${esc(p.nombre)}</b><span class="hint">${esc(p.rubro)} · ${S().productos.filter((x) => x.provId === p.id && x.activo !== false).length} productos${ped ? ` · <b>${ped} pedido${ped > 1 ? 's' : ''} pendiente${ped > 1 ? 's' : ''}</b>` : ''}</span></button>`; }).join('') || '<div class="empty">Todavía no cargaste proveedores.</div>'}
      </div><p class="hint" style="margin:12px 0 0">¿Es un proveedor nuevo? Agregalo primero en <button class="link" data-act="go" data-v="proveedores">Proveedores</button>.</p></div></div>${ultHTML}`;
    }
    const pv = D.prov(S(), ll.provId); const costos = UI.can('compra.costos');
    const ped = ll.pedidoId ? S().pedidos.find((x) => x.id === ll.pedidoId) : null;
    const ids = [...S().productos.filter((p) => p.provId === ll.provId && p.activo !== false).map((p) => p.id), ...ll.extra.filter((id) => { const p = D.prod(S(), id); return p && p.provId !== ll.provId; })];
    const otros = S().productos.filter((p) => !ids.includes(p.id) && p.activo !== false);
    llMsg = '';
    return `<div class="card"><div class="card-h"><h2>2. ¿Cuánto llegó de cada producto?</h2><button class="link" data-act="llreset">Cambiar proveedor</button></div>
      <div class="card-b" style="display:flex;flex-direction:column;gap:14px">
        <p style="margin:0">Proveedor: <b>${esc(pv.nombre)}</b>${ped ? ` · Pedido N° ${esc(ped.nro)} (se completó con lo que faltaba recibir)` : ''}. Escribí la cantidad solo en lo que llegó.</p>
        <div class="tw"><table class="recv"><thead><tr><th>Producto</th><th class="n">Tenés</th><th class="n">Llegaron</th>${costos ? '<th class="n">Precio de compra c/u (sin IVA)</th>' : ''}</tr></thead><tbody>
        ${ids.map((id) => { const p = D.prod(S(), id); const c = ll.cant[id] || ''; const k = ll.costo[id] != null ? ll.costo[id] : p.costo; return `<tr><td><b>${esc(p.nombre)}</b>${p.stock <= p.stockMin ? '<span class="sub" style="color:var(--bad)">Se está acabando</span>' : ''}</td><td class="n">${fn(p.stock)}</td>
          <td class="n"><input type="number" min="0" step="${p.unidad === 'kg' ? '0.05' : '1'}" placeholder="0" value="${c}" data-llc="${id}" id="llc-${id}" inputmode="decimal" aria-label="Cantidad recibida de ${esc(p.nombre)}"></td>
          ${costos ? `<td class="n"><input type="number" min="0" step="0.01" value="${k}" data-llk="${id}" id="llk-${id}" inputmode="decimal" aria-label="Precio de compra de ${esc(p.nombre)}" style="width:120px"></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="4" class="empty">Este proveedor todavía no tiene productos. Agregá uno abajo.</td></tr>'}
        </tbody></table></div>
        ${otros.length ? `<div class="field" style="max-width:420px"><label for="ll-add">¿Llegó algo que no está en la lista?</label><select id="ll-add" data-lladd="1"><option value="">Elegí el producto…</option>${otros.map((p) => opt(p.id, p.nombre)).join('')}</select></div>` : ''}
        ${!costos ? '<p class="hint" style="margin:0">Los precios de compra los actualiza un encargado o administrador.</p>' : ''}
      </div></div>
      <div class="card"><div class="card-h"><h2>3. ¿Ya la pagaste?</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:12px">
        <div class="choices" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><button class="choice" data-act="llpag" data-v="1" aria-pressed="${ll.pagado === true}">Sí, la pagué ahora</button><button class="choice" data-act="llpag" data-v="0" aria-pressed="${ll.pagado === false}">No, se la debo al proveedor</button></div>
        ${ll.pagado === true ? `<div class="field"><span class="lb">¿Con qué pagaste?</span><div class="chips">${D.MEDIOS_PAGO.map((m) => `<button class="chip" data-act="llmedio" data-m="${m}" aria-pressed="${ll.medio === m}">${m}</button>`).join('')}</div>${ll.medio === 'Efectivo' ? '<span class="hint">Sale de la caja abierta.</span>' : ''}</div>` : ''}
        <details class="more"><summary>Datos de la factura del proveedor (para el contador)</summary><div><div class="form">
          <div class="field"><label for="ll-tipo">Tipo</label><select id="ll-tipo" data-llf="tipo">${D.CBTE_COMPRA.map((t) => opt(t, t, ll.tipo)).join('')}</select></div>
          <div class="field"><label for="ll-nro">Número</label><input id="ll-nro" type="text" class="mono" placeholder="00002-00004512" value="${esc(ll.nro)}" data-llf="nro"></div>
        </div></div></details>
        ${costos ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ll-act" data-llf="act" ${ll.act ? 'checked' : ''}> Si cambió el precio de compra, actualizar mis precios de venta</label>` : ''}
        <div id="ll-tot"></div>
        <button class="btn primary big" data-act="llsave">Guardar y sumar al stock</button>
      </div></div>`;
  }
  function llItems() { return Object.entries(ll.cant).filter(([id, c]) => U.num(c) > 0 && D.prod(S(), id)).map(([id, c]) => { const p = D.prod(S(), id); return { pid: id, cant: U.num(c), costo: ll.costo[id] != null && ll.costo[id] !== '' ? U.num(ll.costo[id]) : p.costo, iva: p.iva }; }); }
  function llTotals() {
    const el = $('#ll-tot'); if (!el || !ll || !ll.provId) return; const items = llItems();
    const c = D.buildCompra(S(), { provId: ll.provId, tipo: ll.tipo, items, cond: 'cc', medio: '' });
    el.innerHTML = items.length ? `<div class="sumrow"><span>${items.length} ${items.length === 1 ? 'producto' : 'productos'}, ${fn(U.sum(items, 'cant'))} en total${c.iva ? ' · incluye IVA ' + f$(c.iva) : ''}</span><b class="num" style="font-size:20px">${f$(c.total)}</b></div>` : '<p class="hint" style="margin:0">Escribí en la columna "Llegaron" cuánto recibiste.</p>';
  }
  async function llSave() {
    const items = llItems(); if (!items.length) { UI.toast('Escribí cuánto llegó de al menos un producto', { error: true }); return; }
    if (ll.pagado === null) { UI.toast('Contanos si ya la pagaste (paso 3)', { error: true }); return; }
    const params = { provId: ll.provId, pedidoId: ll.pedidoId, tipo: ll.tipo, nroComp: ll.nro, cond: ll.pagado ? 'contado' : 'cc', medio: ll.medio, items, actPrecio: ll.act };
    const nombre = (D.prov(S(), ll.provId) || {}).nombre; const pag = ll.pagado;
    const c = await UI.run((s, u) => D.recibirCompra(s, u, params), { render: false });
    if (!c) return;
    llMsg = `Listo: se ${items.length === 1 ? 'sumó 1 producto' : 'sumaron ' + items.length + ' productos'} al stock${pag ? '' : ' y se anotó lo que le debés a ' + nombre}.`;
    ll = newLL(); UI.render(); root.scrollTo(0, 0);
  }
  function verCompra(id) {
    const c = S().compras.find((x) => x.id === id);
    UI.openModal(mHead(esc((D.prov(S(), c.provId) || {}).nombre), `${U.fDT(c.fecha)} · ${esc(c.tipo)} ${esc(c.nroComp)} · Recibió ${esc(D.uNombre(S(), c.usuario))}`) + `<div class="mb"><div class="tw"><table><thead><tr><th>Producto</th><th class="n">Cantidad</th><th class="n">Precio c/u</th><th class="n">Subtotal</th></tr></thead><tbody>${c.items.map((i) => `<tr><td>${esc(i.nombre)}</td><td class="n">${fn(i.cant)}</td><td class="n">${f$(i.costo)}</td><td class="n">${f$(i.costo * i.cant)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">${c.iva ? 'Neto ' + f$(c.neto) + ' · IVA ' + f$(c.iva) : 'Total'}</td><td class="n">${f$(c.total)}</td></tr></tfoot></table></div></div>`, true);
  }

  /* ---------- Pedidos ---------- */
  function tPedidos() {
    const abiertos = S().pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'parcial').reverse();
    const cerrados = S().pedidos.filter((p) => p.estado === 'recibido' || p.estado === 'cancelado').reverse().slice(0, 10);
    const card = (p) => { const pv = D.prov(S(), p.provId) || { nombre: '?' }; return `<div class="pcard"><div class="top"><div><h3>Pedido N° ${esc(p.nro)}</h3><div class="meta">${esc(pv.nombre)} · ${U.fD(p.fecha)} · ${esc(D.uNombre(S(), p.usuario))}${p.nota ? ' · ' + esc(p.nota) : ''}</div></div><span class="pill ${p.estado === 'parcial' ? 'warn' : p.estado === 'recibido' ? 'ok' : p.estado === 'cancelado' ? '' : 'warn'}">${{ pendiente: 'Esperando', parcial: 'Llegó una parte', recibido: 'Recibido', cancelado: 'Cancelado' }[p.estado]}</span></div>
      <div class="list">${p.items.map((i) => { const pr = D.prod(S(), i.pid) || { nombre: '?' }; return `<div class="li"><span>${esc(pr.nombre)}</span><span class="num">${i.recibido ? `<span class="hint">llegaron ${fn(i.recibido)} de </span>` : ''}<b>${fn(i.cant)}</b></span></div>`; }).join('')}</div>
      ${p.estado === 'pendiente' || p.estado === 'parcial' ? `<div class="acts">${UI.can('compra.recibir') ? `<button class="btn primary sm" data-act="pedrecibir" data-id="${p.id}">Llegó: cargarlo</button>` : ''}<button class="btn sm" data-act="pedcopy" data-id="${p.id}">${ic('copy')}Copiar pedido</button><button class="btn sm ghost danger" data-act="pedcancel" data-id="${p.id}">Cancelar</button></div>` : p.cancelado ? `<div class="hint">Cancelado: ${esc(p.cancelado.motivo || '')}</div>` : ''}</div>`; };
    return `<p class="muted" style="margin:0">Los pedidos no cambian el stock: se suma recién cuando llega la mercadería. Creá pedidos desde <button class="link" data-act="mtab" data-t="falta">Qué falta</button>.</p>
      <div class="cards">${abiertos.map(card).join('') || '<div class="empty">No hay pedidos esperando.</div>'}</div>
      ${cerrados.length ? `<details class="more"><summary>Pedidos anteriores</summary><div><div class="cards">${cerrados.map(card).join('')}</div></div></details>` : ''}`;
  }
  const pedidoTxt = (prov, items) => `Hola${prov.contacto ? ' ' + prov.contacto.split(' ')[0] : ''}, te paso el pedido de ${S().config.nombre}:\n` + items.map((i) => `- ${fn(i.cant)} x ${(D.prod(S(), i.pid) || {}).nombre}`).join('\n') + '\n¡Gracias!';

  /* ---------- Qué falta ---------- */
  function tFalta() {
    const sug = D.sugerencias(S()); const by = {}; sug.forEach((x) => (by[x.p.provId] = by[x.p.provId] || []).push(x));
    if (!sug.length) return `<div class="okbox">${ic('check')}No falta nada. Todos los productos tienen stock suficiente.</div>`;
    return `<p class="muted" style="margin:0">Es una sugerencia calculada con el stock mínimo y lo que vendiste en los últimos 30 días (cubre ${S().config.diasCobertura} días más el tiempo de entrega del proveedor). No se compra nada hasta que lo confirmes.</p>
      <div class="cards">${Object.entries(by).map(([pid, xs]) => { const pv = D.prov(S(), pid) || { nombre: 'Sin proveedor', contacto: '', tel: '' }; const aPedir = xs.filter((x) => x.cant > 0);
        return `<div class="pcard"><div class="top"><div><h3>${esc(pv.nombre)}</h3><div class="meta">${pv.contacto ? esc(pv.contacto) + ' · ' + esc(pv.tel) : ''}${pv.entrega != null ? ` · entrega en ${pv.entrega} días` : ''}</div></div><span class="pill warn">${xs.length} ${xs.length === 1 ? 'producto' : 'productos'}</span></div>
        <div class="list">${xs.map((x) => `<div class="li"><div class="t"><b>${esc(x.p.nombre)}</b><span class="hint">${x.p.stock <= 0 ? 'Sin stock' : 'Quedan ' + fn(x.p.stock)} · se venden ~${fn(Math.round(x.diaria * 7 * 10) / 10)} por semana${x.pedido ? ` · ya pedidos ${fn(x.pedido)}` : ''}</span></div><span>${x.ya ? '<span class="tag ok">Ya pedido</span>' : `Pedir <b>${fn(x.cant)}</b>`}</span></div>`).join('')}</div>
        ${aPedir.length ? `<div class="acts"><button class="btn primary sm" data-act="pednew" data-p="${pid}">Crear pedido</button><button class="btn sm" data-act="sugcopy" data-p="${pid}">${ic('copy')}Copiar pedido</button></div>` : ''}</div>`; }).join('')}</div>`;
  }
  let pedDraft = null;
  function pedidoForm(provId) {
    const xs = D.sugerencias(S()).filter((x) => x.p.provId === provId && x.cant > 0);
    pedDraft = { provId, items: xs.map((x) => ({ pid: x.p.id, cant: x.cant })) };
    const pv = D.prov(S(), provId);
    UI.openModal(mHead('Crear pedido', esc(pv.nombre)) + `<form data-form="pedido"><div class="mb"><div class="tw"><table><thead><tr><th>Producto</th><th class="n">Cantidad</th></tr></thead><tbody>${pedDraft.items.map((i, ix) => `<tr><td>${esc(D.prod(S(), i.pid).nombre)}</td><td class="n"><input type="number" min="0" step="1" value="${i.cant}" id="pd-${ix}" data-pd="${ix}" inputmode="decimal" aria-label="Cantidad" style="width:100px"></td></tr>`).join('')}</tbody></table></div>
      <div class="field"><label for="pd-nota">Nota (opcional)</label><input id="pd-nota" name="nota" type="text" maxlength="200" placeholder="Ej.: pedido por WhatsApp"></div></div>
      <div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar pedido</button></div></form>`);
  }

  /* ---------- Movimientos (kardex) ---------- */
  function tMovimientos() {
    return `<div class="toolbar"><input type="search" id="kx-q" placeholder="Buscar producto" value="${esc(kx.q)}" data-kx="q" style="flex:1;min-width:180px" aria-label="Buscar producto">
      <select id="kx-tipo" data-kx="tipo" aria-label="Tipo de movimiento">${opt('', 'Todos los movimientos', kx.tipo)}${Object.entries(D.MOV_TIPOS).map(([k, l]) => opt(k, l, kx.tipo)).join('')}</select>
      <select id="kx-dias" data-kx="dias" aria-label="Período">${[[1, 'Hoy'], [7, 'Últimos 7 días'], [30, 'Últimos 30 días'], [90, 'Últimos 90 días'], [365, 'Último año']].map(([d, l]) => opt(d, l, kx.dias)).join('')}</select>
      <button class="btn" data-act="expkardex">${ic('down')}Excel</button></div><div id="kx-table"></div>`;
  }
  function kFiltrados() {
    const q = kx.q.trim().toLowerCase(); const t0 = new Date(); if (+kx.dias === 1) t0.setHours(0, 0, 0, 0); else t0.setDate(t0.getDate() - kx.dias);
    const ids = q ? new Set(S().productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.includes(q)).map((p) => p.id)) : null;
    return S().movimientos.filter((m) => new Date(m.fecha) >= t0 && (!kx.tipo || m.tipo === kx.tipo) && (!ids || ids.has(m.pid))).reverse();
  }
  function renderKardex() {
    const el = $('#kx-table'); if (!el) return; const list = kFiltrados();
    el.innerHTML = `<div class="tw"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Qué pasó</th><th class="n">Cantidad</th><th class="n">Antes → Después</th><th>Usuario</th></tr></thead><tbody>${list.slice(0, kx.max).map((m) => kRow(m, true)).join('') || '<tr><td colspan="6" class="empty">No hay movimientos con esos filtros.</td></tr>'}</tbody></table></div>${list.length > kx.max ? `<div class="toolbar"><button class="btn" data-act="kxmas">Mostrar más (${list.length - kx.max} restantes)</button></div>` : ''}<p class="hint">${list.length} movimientos. Nada se borra: las correcciones quedan como nuevos movimientos.</p>`;
  }

  /* ---------- Acciones ---------- */
  Object.assign(UI.act, {
    mtab: (b) => { tab = b.dataset.t; menuOpen = false; UI.render(); },
    menu: () => { menuOpen = !menuOpen; UI.render(); },
    prodnew: () => prodForm(),
    prodedit: (b) => prodForm(D.prod(S(), b.dataset.id)),
    prodarch: async (b) => { const p = D.prod(S(), b.dataset.id); const activar = p.activo === false; const ok = await UI.confirmar({ titulo: activar ? 'Reactivar producto' : 'Archivar producto', texto: activar ? `<p>"${esc(p.nombre)}" vuelve a aparecer para vender.</p>` : `<p>"${esc(p.nombre)}" deja de aparecer para vender. <b>No se borra:</b> su historial de ventas y movimientos se conserva y lo podés reactivar cuando quieras.</p>${p.stock > 0 ? `<p>Todavía tiene ${fn(p.stock)} en stock.</p>` : ''}`, ok: activar ? 'Reactivar' : 'Archivar', peligro: !activar }); if (ok) UI.run((s, u) => D.archivarProducto(s, u, p.id, activar), { ok: activar ? 'Producto reactivado' : 'Producto archivado' }); },
    pffalta: (b) => { pf.falta = !pf.falta; b.setAttribute('aria-pressed', pf.falta); renderTabla(); },
    pfarch: (b) => { pf.archivados = !pf.archivados; b.setAttribute('aria-pressed', pf.archivados); renderTabla(); },
    pfsort: (b) => { const k = b.dataset.k; if (pf.orden === k) pf.dir *= -1; else { pf.orden = k; pf.dir = 1; } renderTabla(); },
    pfmas: () => { pf.max += 200; renderTabla(); },
    ajuste: (b) => { ajTipo = 'conteo'; ajusteForm(b.dataset.id); },
    ajtipo: (b) => { ajTipo = b.dataset.v; const id = b.closest('form').dataset.id; ajusteForm(id); },
    kardex: (b) => kardex(b.dataset.id),
    aumento: () => aumentoForm(),
    import: () => importForm(),
    doimport: () => doImport(),
    plantilla: () => UI.exportXLSX('planilla-productos.xlsx', { Productos: [{ codigo: '7790000000017', nombre: 'Ejemplo producto 500 g', categoria: 'Almacén', proveedor: (S().proveedores[0] || {}).nombre || '', costo: 1000, margen: 40, iva: 21, stock: 10, stock_min: 5 }] }),
    expprod: () => { menuOpen = false; UI.render(); const vc = UI.can('producto.costos'); UI.exportXLSX(`productos-${U.today()}.xlsx`, { Productos: S().productos.map((p) => Object.assign({ 'Código': p.codigo, 'Producto': p.nombre, 'Categoría': p.categoria, 'Proveedor': (D.prov(S(), p.provId) || {}).nombre || '', 'Unidad': p.unidad, 'Estado': p.activo === false ? 'Archivado' : 'Activo' }, vc ? { 'Precio de compra (sin IVA)': p.costo, 'Ganancia %': p.margen } : {}, { 'IVA %': p.iva, 'Precio de venta': p.precio, 'Stock': p.stock, 'Avisar con menos de': p.stockMin })) }); },
    llprov: (b) => { const pend = S().pedidos.filter((x) => x.provId === b.dataset.id && (x.estado === 'pendiente' || x.estado === 'parcial')); if (pend.length === 1) { prefillPedido(pend[0]); return; } ll = newLL(b.dataset.id); UI.render(); },
    llreset: () => { ll = newLL(); UI.render(); },
    llpag: (b) => { ll.pagado = b.dataset.v === '1'; UI.render(); },
    llmedio: (b) => { ll.medio = b.dataset.m; UI.render(); },
    llsave: () => llSave(),
    vercompra: (b) => verCompra(b.dataset.id),
    expcompras: () => UI.exportXLSX(`mercaderia-recibida-${U.today()}.xlsx`, { 'Compras': S().compras.map((c) => ({ 'Fecha': U.fD(c.fecha), 'Proveedor': (D.prov(S(), c.provId) || {}).nombre, 'Comprobante': c.tipo, 'Número': c.nroComp, 'Neto': c.neto, 'IVA': c.iva, 'Total': c.total, 'Pago': c.cond === 'cc' ? 'Quedó debiendo' : 'Pagado con ' + c.medio, 'Recibió': D.uNombre(S(), c.usuario) })), 'Detalle': S().compras.flatMap((c) => c.items.map((i) => ({ 'Fecha': U.fD(c.fecha), 'Proveedor': (D.prov(S(), c.provId) || {}).nombre, 'Producto': i.nombre, 'Cantidad': i.cant, 'Precio c/u': i.costo }))) }),
    pedrecibir: (b) => prefillPedido(S().pedidos.find((x) => x.id === b.dataset.id)),
    pedcopy: (b) => { const p = S().pedidos.find((x) => x.id === b.dataset.id); UI.copyText(pedidoTxt(D.prov(S(), p.provId) || {}, p.items.map((i) => ({ pid: i.pid, cant: U.r3(i.cant - i.recibido) })).filter((i) => i.cant > 0))); },
    pedcancel: async (b) => { const ok = await UI.confirmar({ titulo: 'Cancelar pedido', texto: '<p>El pedido queda en el historial como cancelado.</p>', ok: 'Cancelar pedido', peligro: true }); if (ok) UI.run((s, u) => D.cancelarPedido(s, u, { id: b.dataset.id, motivo: 'Cancelado por el usuario' }), { ok: 'Pedido cancelado' }); },
    pednew: (b) => pedidoForm(b.dataset.p),
    sugcopy: (b) => { const xs = D.sugerencias(S()).filter((x) => x.p.provId === b.dataset.p && x.cant > 0); UI.copyText(pedidoTxt(D.prov(S(), b.dataset.p) || {}, xs.map((x) => ({ pid: x.p.id, cant: x.cant })))); },
    kxmas: () => { kx.max += 200; renderKardex(); },
    expkardex: () => UI.exportXLSX(`movimientos-stock-${U.today()}.xlsx`, { 'Movimientos': kFiltrados().map((m) => ({ 'Fecha': U.fDT(m.fecha), 'Producto': (D.prod(S(), m.pid) || {}).nombre, 'Tipo': D.MOV_TIPOS[m.tipo] || m.tipo, 'Cantidad': m.cant, 'Antes': m.antes, 'Después': m.despues, 'Usuario': D.uNombre(S(), m.usuario), 'Motivo / referencia': m.motivo })) })
  });
  function prefillPedido(p) {
    const cant = {}; const extra = [];
    p.items.forEach((i) => { const r = U.r3(i.cant - i.recibido); if (r > 0) { cant[i.pid] = r; const pr = D.prod(S(), i.pid); if (pr && pr.provId !== p.provId) extra.push(i.pid); } });
    ll = newLL(p.provId, { pedidoId: p.id, cant, extra }); tab = 'llego'; UI.go('mercaderia', 'llego'); UI.toast('Revisá las cantidades que llegaron y guardá');
  }
  Object.assign(UI.form, {
    prod: async (fm) => { const id = fm.dataset.id; const d = Object.fromEntries(new FormData(fm)); const r = await UI.run((s, u) => (id ? D.editarProducto(s, u, id, d) : D.crearProducto(s, u, d)), { ok: id ? 'Producto guardado' : 'Producto agregado' }); if (r) UI.closeModal(); },
    ajuste: async (fm) => {
      const p = D.prod(S(), fm.dataset.id); const d = Object.fromEntries(new FormData(fm)); const n = U.toNum(d.cant);
      const delta = ajTipo === 'conteo' ? n - p.stock : ajTipo === 'merma' ? -n : n;
      if (Math.abs(delta) >= Math.max(10, p.stock * 0.3)) { const ok = await UI.confirmar({ titulo: 'Ajuste grande', texto: `<p>El stock de <b>${esc(p.nombre)}</b> va a pasar de ${fn(p.stock)} a <b>${fn(U.r3(p.stock + delta))}</b>. ¿Es correcto?</p>`, ok: 'Sí, guardar' }); if (!ok) { ajusteForm(p.id); return; } }
      const r = await UI.run((s, u) => D.ajustarStock(s, u, { pid: p.id, tipo: ajTipo, cant: d.cant, motivo: d.motivo }), { ok: () => `${p.nombre}: stock actualizado` });
      if (r !== undefined) UI.closeModal();
    },
    aumento: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const ok = await UI.confirmar({ titulo: 'Confirmar cambio de precios', texto: `<p>Vas a ${U.toNum(d.pct) >= 0 ? 'subir' : 'bajar'} un <b>${fn(Math.abs(U.toNum(d.pct)))}%</b> los precios. Antes se guarda una copia automática por si necesitás volver atrás.</p>`, ok: 'Cambiar precios' }); if (!ok) { aumentoForm(); return; } UI.run((s, u) => D.aumentoMasivo(s, u, { alcance: d.alcance, pct: d.pct, redondeo: d.red }), { snapshot: 'Antes del cambio masivo de precios', ok: (n) => `Listo: cambiaron ${n} precios` }); },
    pedido: async (fm) => { const nota = new FormData(fm).get('nota'); const items = pedDraft.items.map((i, ix) => ({ pid: i.pid, cant: U.num(($('#pd-' + ix) || {}).value) })); const r = await UI.run((s, u) => D.crearPedido(s, u, { provId: pedDraft.provId, items, nota }), { ok: (p) => `Pedido N° ${p.nro} guardado` }); if (r) { UI.closeModal(); tab = 'pedidos'; UI.render(); } }
  });
  Object.assign(UI.input, {
    pf: (t) => { pf[t.dataset.pf] = t.value; pf.max = 100; renderTabla(); },
    calc: (t) => onCalc(t),
    llc: (t) => { ll.cant[t.dataset.llc] = t.value; llTotals(); },
    llk: (t) => { ll.costo[t.dataset.llk] = t.value; llTotals(); },
    llf: (t) => { if (t.dataset.llf === 'nro') ll.nro = t.value; },
    kx: (t) => { if (t.dataset.kx === 'q') { kx.q = t.value; kx.max = 100; renderKardex(); } },
    imp: (t) => { if (t.dataset.imp === 'txt' && t.value.trim()) readImport(t.value, true); }
  });
  Object.assign(UI.change, {
    pf: (t) => { pf[t.dataset.pf] = t.value; pf.max = 100; renderTabla(); },
    lladd: (t) => { if (t.value) { ll.extra.push(t.value); ll.cant[t.value] = ll.cant[t.value] || 1; UI.render(); } },
    llf: (t) => { if (t.dataset.llf === 'tipo') { ll.tipo = t.value; llTotals(); } if (t.dataset.llf === 'act') ll.act = t.checked; },
    kx: (t) => { if (t.dataset.kx !== 'q') { kx[t.dataset.kx] = t.dataset.kx === 'dias' ? +t.value : t.value; kx.max = 100; renderKardex(); } },
    imp: (t) => { if (t.dataset.imp === 'file') { const f = t.files && t.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => readImport(new Uint8Array(r.result), false); r.readAsArrayBuffer(f); } }
  });
  UI.views.mercaderia = { title: 'Mercadería', render: view, after, setTab: (t) => { tab = t; if (t === 'llego' && !ll) ll = newLL(); } };
  UI.menuCerrar = () => { if (menuOpen) { menuOpen = false; return true; } return false; };
})(typeof window !== 'undefined' ? window : globalThis);
