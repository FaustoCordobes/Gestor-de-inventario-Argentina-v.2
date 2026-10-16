/* Mostrador · storage.js
 * Guardado de datos en el navegador.
 *
 * - Usa IndexedDB (sin el límite de ~5 MB de localStorage). Si no está disponible,
 *   usa localStorage. Si tampoco, trabaja en memoria y la app lo avisa en pantalla.
 * - Nunca reemplaza datos existentes con datos de ejemplo: si no puede leer, falla
 *   con un error que la app muestra con opciones (reintentar, descargar, restaurar).
 * - Control de versión: cada guardado verifica que nadie (otra pestaña) haya guardado
 *   antes; si pasó, rechaza el guardado en vez de pisar datos (ConflictError).
 * - Copias automáticas (snapshots) diarias y antes de operaciones delicadas.
 * - Copias de seguridad en archivo JSON con verificación SHA-256.
 * - Migración de los datos de la versión anterior (localStorage "mostrador-demo-v1/2/3").
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D;

  class StorageError extends Error { constructor(msg, cause) { super(msg); this.name = 'StorageError'; this.cause = cause; } }
  class ConflictError extends StorageError { constructor() { super('Los datos se modificaron en otra pestaña o ventana. Recargá para ver la versión más nueva antes de seguir.'); this.name = 'ConflictError'; } }

  const DB_NAME = 'mostrador';
  const DB_VERSION = 1;
  const SNAP_MAX = 7;
  const LEGACY_KEYS = ['mostrador-demo-v3', 'mostrador-demo-v2', 'mostrador-demo-v1'];

  /* ---------- Backend IndexedDB ---------- */
  const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const txDone = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onabort = () => rej(t.error || new Error('Transacción cancelada')); t.onerror = () => rej(t.error); });

  function idbBackend(idb) {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = idb.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('snapshots')) { const s = db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true }); s.createIndex('ws', 'wsId'); }
      };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); res(db); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('La base de datos está bloqueada por otra pestaña.'));
    }));
    return {
      tipo: 'IndexedDB',
      async list() { const db = await open(); const t = db.transaction('workspaces', 'readonly'); const all = await reqP(t.objectStore('workspaces').getAll()); return all.map((w) => ({ id: w.id, modo: w.modo, nombre: w.nombre, version: w.version, savedAt: w.savedAt })); },
      async get(id) { const db = await open(); const t = db.transaction('workspaces', 'readonly'); return (await reqP(t.objectStore('workspaces').get(id))) || null; },
      async put(rec, baseVersion) {
        const db = await open(); const t = db.transaction('workspaces', 'readwrite'); const st = t.objectStore('workspaces');
        const cur = await reqP(st.get(rec.id));
        const curV = cur ? cur.version : 0;
        if (baseVersion !== null && curV !== baseVersion) { t.abort(); throw new ConflictError(); }
        rec.version = curV + 1; st.put(rec); await txDone(t); return rec.version;
      },
      async del(id) { const db = await open(); const t = db.transaction(['workspaces', 'snapshots'], 'readwrite'); t.objectStore('workspaces').delete(id); const ix = t.objectStore('snapshots').index('ws'); const keys = await reqP(ix.getAllKeys(id)); keys.forEach((k) => t.objectStore('snapshots').delete(k)); await txDone(t); },
      async snapAdd(s) {
        const db = await open(); const t = db.transaction('snapshots', 'readwrite'); const st = t.objectStore('snapshots');
        st.add(s); const keys = await reqP(st.index('ws').getAllKeys(s.wsId));
        if (keys.length >= SNAP_MAX) keys.sort((a, b) => a - b).slice(0, keys.length - SNAP_MAX + 1).forEach((k) => st.delete(k));
        await txDone(t);
      },
      async snapList(wsId) { const db = await open(); const t = db.transaction('snapshots', 'readonly'); const all = await reqP(t.objectStore('snapshots').index('ws').getAll(wsId)); return all.map((s) => ({ id: s.id, fecha: s.fecha, motivo: s.motivo, resumen: s.resumen })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)); },
      async snapGet(id) { const db = await open(); const t = db.transaction('snapshots', 'readonly'); return reqP(t.objectStore('snapshots').get(id)); }
    };
  }

  /* ---------- Backend localStorage (respaldo) ---------- */
  function lsBackend(ls) {
    const K = 'mostrador4:ws:', KS = 'mostrador4:snap:';
    const parse = (raw, key) => { try { return JSON.parse(raw); } catch (e) { throw new StorageError(`Los datos guardados (${key}) están dañados y no se pueden leer.`, e); } };
    return {
      tipo: 'localStorage',
      async list() { const out = []; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(K)) { const w = parse(ls.getItem(k), k); out.push({ id: w.id, modo: w.modo, nombre: w.nombre, version: w.version, savedAt: w.savedAt }); } } return out; },
      async get(id) { const raw = ls.getItem(K + id); return raw ? parse(raw, K + id) : null; },
      async put(rec, baseVersion) {
        const raw = ls.getItem(K + rec.id); const curV = raw ? parse(raw, K + rec.id).version : 0;
        if (baseVersion !== null && curV !== baseVersion) throw new ConflictError();
        rec.version = curV + 1;
        try { ls.setItem(K + rec.id, JSON.stringify(rec)); } catch (e) { throw new StorageError('El navegador no tiene más espacio para guardar. Descargá una copia de seguridad y liberá espacio.', e); }
        return rec.version;
      },
      async del(id) { ls.removeItem(K + id); ls.removeItem(KS + id); },
      async snapAdd(s) { const list = this._snaps(s.wsId); s.id = Date.now(); list.push(s); while (list.length > 3) list.shift(); try { ls.setItem(KS + s.wsId, JSON.stringify(list)); } catch (e) { /* sin espacio para copias automáticas: se informa al guardar */ } },
      _snaps(wsId) { const raw = ls.getItem(KS + wsId); if (!raw) return []; try { return JSON.parse(raw); } catch (e) { return []; } },
      async snapList(wsId) { return this._snaps(wsId).map((s) => ({ id: s.id, fecha: s.fecha, motivo: s.motivo, resumen: s.resumen })).reverse(); },
      async snapGet(id) { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(KS)) { const f = this._snaps(k.slice(KS.length)).find((s) => s.id === id); if (f) return f; } } return null; }
    };
  }

  /* ---------- Backend en memoria (último recurso) ---------- */
  function memBackend() {
    const ws = new Map(); const snaps = []; let n = 1;
    return {
      tipo: 'memoria', volatil: true,
      async list() { return [...ws.values()].map((w) => ({ id: w.id, modo: w.modo, nombre: w.nombre, version: w.version, savedAt: w.savedAt })); },
      async get(id) { return ws.has(id) ? U.clone(ws.get(id)) : null; },
      async put(rec, baseVersion) { const curV = ws.has(rec.id) ? ws.get(rec.id).version : 0; if (baseVersion !== null && curV !== baseVersion) throw new ConflictError(); rec.version = curV + 1; ws.set(rec.id, U.clone(rec)); return rec.version; },
      async del(id) { ws.delete(id); },
      async snapAdd(s) { s.id = n++; snaps.push(U.clone(s)); },
      async snapList(wsId) { return snaps.filter((s) => s.wsId === wsId).map((s) => ({ id: s.id, fecha: s.fecha, motivo: s.motivo, resumen: s.resumen })).reverse(); },
      async snapGet(id) { return U.clone(snaps.find((s) => s.id === id)); }
    };
  }

  /** Elige el mejor almacenamiento disponible y prueba que funcione. */
  async function crearBackend(env) {
    const e = env || root;
    if (e.indexedDB) {
      try { const b = idbBackend(e.indexedDB); await b.list(); return b; } catch (err) { /* sigue con localStorage */ }
    }
    try { const ls = e.localStorage; const k = 'mostrador4:test'; ls.setItem(k, '1'); ls.removeItem(k); return lsBackend(ls); } catch (err) { /* sigue */ }
    return memBackend();
  }

  /* ---------- Resumen y validación de estado ---------- */
  function resumen(S) {
    const ult = S.ventas.length ? S.ventas.reduce((m, v) => (v.fecha > m ? v.fecha : m), '') : null;
    return { comercio: S.config && S.config.nombre, productos: S.productos.length, ventas: S.ventas.length, compras: S.compras.length, clientes: S.clientes.length - 1, proveedores: S.proveedores.length, movimientos: S.movimientos.length, ultimaVenta: ult };
  }
  /** Revisa que el estado tenga la forma esperada. Devuelve la lista de problemas (vacía si está bien). */
  function validarEstado(S) {
    const errs = [];
    if (!S || typeof S !== 'object') return ['El contenido no es un estado de Mostrador.'];
    if (S.schema !== D.SCHEMA) errs.push(`Versión de datos ${S.schema} (se esperaba ${D.SCHEMA}).`);
    const arrays = ['usuarios', 'productos', 'proveedores', 'clientes', 'ventas', 'devoluciones', 'compras', 'pedidos', 'devprov', 'pagos', 'cobros', 'gastos', 'cajas', 'cajaMovs', 'movimientos', 'auditoria'];
    arrays.forEach((k) => { if (!Array.isArray(S[k])) errs.push(`Falta la lista "${k}".`); });
    if (!S.config || typeof S.config !== 'object') errs.push('Faltan los datos del comercio.');
    if (errs.length) return errs;
    const isN = (n) => typeof n === 'number' && Number.isFinite(n);
    S.productos.forEach((p, i) => { if (!p.id || !p.nombre) errs.push(`Producto ${i + 1} sin identificador o nombre.`); if (!isN(p.stock) || !isN(p.precio) || !isN(p.costo)) errs.push(`Producto "${p.nombre || i + 1}" con números inválidos.`); });
    S.ventas.forEach((v, i) => { if (!v.id || !Array.isArray(v.items) || !Array.isArray(v.pagos) || !isN(v.total)) errs.push(`Venta ${i + 1} incompleta.`); });
    if (!S.clientes.some((c) => c.id === 'c0')) errs.push('Falta el cliente "Consumidor Final".');
    return errs.slice(0, 20);
  }

  /* ---------- Migración de la versión anterior ---------- */
  function leerLegado(ls) {
    for (const key of LEGACY_KEYS) {
      let raw = null; try { raw = ls && ls.getItem(key); } catch (e) { return null; }
      if (!raw) continue;
      try { const s = JSON.parse(raw); if (s && Array.isArray(s.ventas) && Array.isArray(s.productos)) return { key, state: s }; } catch (e) { return { key, error: 'Los datos de la versión anterior están dañados.' }; }
    }
    return null;
  }
  /**
   * Convierte datos de Mostrador v1–v3 al formato actual sin perder registros:
   * - Las ventas pasan a tener lista de pagos. Los CAE simulados se descartan
   *   (se guardan aparte como "legado" para referencia) porque no eran reales.
   * - El kardex se reconstruye hacia atrás desde el stock actual, usando ventas,
   *   compras y ajustes; lo que no se explica queda como "Stock inicial".
   * - Los cierres de caja se conservan como sesiones cerradas.
   */
  function migrarLegado(old) {
    const S = D.emptyState('local');
    const oc = old.config || {};
    Object.assign(S.config, { nombre: oc.nombre || 'Mi comercio', razon: oc.razon || '', cuit: oc.cuit || '', iibb: oc.iibb || '', domicilio: oc.domicilio || '', inicio: oc.inicio || S.config.inicio, condIva: oc.condIva === 'RI' ? 'RI' : 'MONO', pv: oc.pv || 1, letra: oc.letra === 'grande' ? 'grande' : 'normal' });
    const admin = { id: U.uid(), nombre: 'Administrador', rol: 'admin', pinHash: null, salt: null, activo: true };
    S.usuarios.push(admin);
    S.proveedores = (old.proveedores || []).map((p) => ({ id: p.id, nombre: p.nombre, cuit: p.cuit || '', rubro: p.rubro || '', contacto: p.contacto || '', tel: p.tel || '', plazo: p.plazo || 0, entrega: 2 }));
    S.clientes = (old.clientes || []).map((c) => ({ id: c.id, nombre: c.nombre, condIva: c.condIva || 'CF', cuit: c.cuit || '', tel: c.tel || '', fijo: !!c.fijo }));
    if (!S.clientes.some((c) => c.id === 'c0')) S.clientes.unshift({ id: 'c0', nombre: 'Consumidor Final', condIva: 'CF', cuit: '', tel: '', fijo: true });
    S.productos = (old.productos || []).map((p) => ({ id: p.id, codigo: String(p.codigo || ''), plu: '', nombre: p.nombre, categoria: p.categoria || 'Varios', provId: p.provId || '', unidad: p.unidad === 'kg' ? 'kg' : 'u', costo: U.num(p.costo), margen: U.num(p.margen), iva: U.num(p.iva), precio: U.num(p.precio), stock: U.r3(U.num(p.stock)), stockMin: U.num(p.stockMin), activo: true }));
    let maxSeq = 0;
    S.ventas = (old.ventas || []).map((v) => {
      const n = +String(v.nro || '').split('-')[1] || 0; if (n > maxSeq) maxSeq = n;
      return { id: v.id, opId: v.id, nro: v.nro || '', fecha: v.fecha, usuario: null, clienteId: v.clienteId || 'c0', tipo: TIPO_OK(v.tipo), items: (v.items || []).map((i) => ({ pid: i.pid, nombre: i.nombre, cant: U.num(i.cant), precio: U.num(i.precio), costo: U.num(i.costo), iva: U.num(i.iva), devuelto: 0 })), desc: U.num(v.desc), pagos: [{ medio: v.medio || 'Efectivo', monto: U.num(v.total) }], recibido: null, vuelto: null, total: U.num(v.total), bruto: U.num(v.total), n21: U.num(v.n21), n105: U.num(v.n105), nEx: U.num(v.nEx), i21: U.num(v.i21), i105: U.num(v.i105), neto: U.num(v.neto), costo: U.num(v.costo), condEmisor: v.condEmisor || S.config.condIva, estado: 'ok', fiscal: { estado: v.tipo === 'TK' ? 'no_fiscal' : 'sin_autorizar', legado: v.cae ? { caeSimulado: v.cae, nota: 'CAE generado por la demo anterior: no es válido.' } : undefined } };
    });
    S.seq.interno = maxSeq + 1;
    S.compras = (old.compras || []).map((c) => ({ id: c.id, fecha: c.fecha, usuario: null, provId: c.provId, tipo: c.tipo || 'Remito', nroComp: c.nroComp || 's/n', cond: c.cond === 'contado' ? 'contado' : 'cc', medio: c.medio || '', items: (c.items || []).map((i) => ({ pid: i.pid, nombre: i.nombre, cant: U.num(i.cant), costo: U.num(i.costo), iva: U.num(i.iva) })), neto: U.num(c.neto), iva: U.num(c.iva), total: U.num(c.total), pedidoId: null }));
    S.pagos = (old.pagos || []).map((p) => ({ id: p.id, fecha: p.fecha, usuario: null, provId: p.provId, monto: U.num(p.monto), medio: p.medio || 'Efectivo' }));
    S.cobros = (old.cobros || []).map((c) => ({ id: c.id, fecha: c.fecha, usuario: null, cliId: c.cliId, monto: U.num(c.monto), medio: c.medio || 'Efectivo' }));
    S.gastos = (old.gastos || []).map((g) => ({ id: g.id, fecha: g.fecha, usuario: null, categoria: g.categoria || 'Otros', detalle: g.detalle || '', monto: U.num(g.monto), medio: g.medio || 'Efectivo', anulado: null }));
    const fondo = U.num(oc.fondo);
    S.cajas = (old.cierres || []).map((c) => ({ id: U.uid(), abre: { fecha: new Date(c.fecha + 'T00:00').toISOString(), usuario: null, monto: fondo }, cierra: { fecha: new Date(c.fecha + 'T23:59').toISOString(), usuario: null, contado: U.num(c.contado), esperado: U.num(c.esperado), dif: U.num(c.dif), motivo: '(cierre de la versión anterior)' } }));
    // Kardex reconstruido hacia atrás desde el stock actual
    const ev = [];
    S.ventas.forEach((v) => v.items.forEach((i) => ev.push({ fecha: v.fecha, pid: i.pid, cant: -i.cant, tipo: 'venta', ref: { tipo: 'venta', id: v.id }, motivo: `Venta N° ${v.nro}` })));
    S.compras.forEach((c) => c.items.forEach((i) => ev.push({ fecha: c.fecha, pid: i.pid, cant: i.cant, tipo: 'compra', ref: { tipo: 'compra', id: c.id }, motivo: `${c.tipo} ${c.nroComp}` })));
    (old.ajustes || []).forEach((a) => ev.push({ fecha: a.fecha, pid: a.pid, cant: U.num(a.delta), tipo: a.delta < 0 ? 'merma' : 'ajuste', motivo: a.motivo || 'Ajuste', ref: null }));
    S.productos.forEach((p) => {
      const evs = ev.filter((e) => e.pid === p.id).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      let st = p.stock; const ms = [];
      for (let i = evs.length - 1; i >= 0; i--) { const e = evs[i]; const despues = U.r3(st); const antes = U.r3(st - e.cant); ms.unshift({ id: U.uid(), fecha: e.fecha, usuario: null, pid: p.id, tipo: e.tipo, cant: U.r3(e.cant), antes, despues, motivo: e.motivo, ref: e.ref }); st = antes; }
      const ini = U.r3(st);
      const f0 = evs.length ? new Date(new Date(evs[0].fecha).getTime() - 60000).toISOString() : new Date().toISOString();
      if (ini !== 0) ms.unshift({ id: U.uid(), fecha: f0, usuario: null, pid: p.id, tipo: 'inicial', cant: ini, antes: 0, despues: ini, motivo: 'Stock al migrar desde la versión anterior', ref: null });
      S.movimientos.push(...ms);
    });
    S.movimientos.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    S.auditoria.push({ id: U.uid(), fecha: new Date().toISOString(), usuario: admin.id, accion: 'migracion', detalle: `Datos traídos de la versión anterior (${S.ventas.length} ventas, ${S.productos.length} productos)` });
    return S;
  }
  const TIPO_OK = (t) => (['FA', 'FB', 'FC', 'TK'].includes(t) ? t : 'TK');

  /* ---------- Copias de seguridad ---------- */
  async function crearBackup(S, ws) {
    const json = JSON.stringify(S);
    return { formato: 'mostrador-backup', schema: D.SCHEMA, app: 'Mostrador', creado: new Date().toISOString(), workspace: { modo: ws.modo, nombre: S.config.nombre }, resumen: resumen(S), sha256: await U.sha256(json), estado: S };
  }
  /** Lee y verifica una copia. Acepta también los datos crudos de la versión anterior. */
  async function leerBackup(texto) {
    let o; try { o = JSON.parse(texto); } catch (e) { return { ok: false, errores: ['El archivo no es una copia de Mostrador (no es JSON válido).'] }; }
    if (o && o.formato === 'mostrador-backup') {
      if (o.schema > D.SCHEMA) return { ok: false, errores: ['La copia es de una versión más nueva de Mostrador. Actualizá la app antes de restaurarla.'] };
      const sha = await U.sha256(JSON.stringify(o.estado));
      if (sha && o.sha256 && sha !== o.sha256) return { ok: false, errores: ['La copia está alterada o incompleta (no coincide la verificación SHA-256).'] };
      const errs = validarEstado(o.estado);
      if (errs.length) return { ok: false, errores: errs };
      return { ok: true, estado: o.estado, resumen: resumen(o.estado), creado: o.creado, origen: 'copia' };
    }
    if (o && (o.v === 1 || o.v === 2 || o.v === 3) && Array.isArray(o.ventas)) { const st = migrarLegado(o); return { ok: true, estado: st, resumen: resumen(st), creado: null, origen: 'version-anterior' }; }
    return { ok: false, errores: ['El archivo no es una copia de seguridad de Mostrador.'] };
  }

  /* ---------- Fachada ---------- */
  function crearStore(backend, env) {
    const e = env || root;
    let canal = null; try { canal = e.BroadcastChannel ? new e.BroadcastChannel('mostrador') : null; } catch (err) { canal = null; }
    const oyentes = [];
    if (canal) canal.onmessage = (ev) => oyentes.forEach((f) => f(ev.data));
    const ultimoSnap = {};
    return {
      backend,
      tipo: backend.tipo,
      volatil: !!backend.volatil,
      onRemoteChange(f) { oyentes.push(f); },
      list: () => backend.list(),
      /** Lee un espacio de trabajo. Lanza StorageError si no se puede leer o está dañado. */
      async load(id) {
        let rec;
        try { rec = await backend.get(id); } catch (err) { throw err instanceof StorageError ? err : new StorageError('No se pudieron leer los datos guardados.', err); }
        if (!rec) return null;
        const errs = validarEstado(rec.state);
        if (errs.length) throw new StorageError('Los datos guardados están incompletos o dañados: ' + errs.slice(0, 3).join(' '));
        return { state: rec.state, version: rec.version, savedAt: rec.savedAt };
      },
      /** Guarda. baseVersion = versión leída; null para crear. Devuelve la nueva versión. */
      async save(id, state, baseVersion) {
        let v;
        const rec = { id, modo: state.workspace.modo, nombre: state.config.nombre, savedAt: new Date().toISOString(), state };
        try { v = await backend.put(rec, baseVersion); } catch (err) { if (err instanceof StorageError) throw err; throw new StorageError(err && err.name === 'QuotaExceededError' ? 'El navegador no tiene más espacio para guardar. Descargá una copia de seguridad.' : 'No se pudo guardar: ' + ((err && err.message) || 'error desconocido'), err); }
        if (canal) try { canal.postMessage({ id, version: v }); } catch (err) { /* sin aviso entre pestañas */ }
        // Copia automática una vez por día
        const hoy = U.today();
        if (ultimoSnap[id] !== hoy) { ultimoSnap[id] = hoy; const list = await backend.snapList(id).catch(() => []); if (!list.some((s) => U.dkey(s.fecha) === hoy)) await this.snapshot(id, state, 'Copia automática del día').catch(() => {}); }
        return v;
      },
      async snapshot(id, state, motivo) { await backend.snapAdd({ wsId: id, fecha: new Date().toISOString(), motivo, resumen: resumen(state), state: U.clone(state) }); },
      snapList: (id) => backend.snapList(id),
      async snapGet(sid) { const s = await backend.snapGet(sid); if (!s) throw new StorageError('No se encontró esa copia automática.'); return s; },
      remove: (id) => backend.del(id)
    };
  }

  M.Storage = { StorageError, ConflictError, crearBackend, crearStore, idbBackend, lsBackend, memBackend, validarEstado, resumen, leerLegado, migrarLegado, crearBackup, leerBackup, LEGACY_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
