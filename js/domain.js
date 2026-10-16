/* Mostrador · domain.js
 * Reglas del negocio. No toca la pantalla ni el almacenamiento.
 *
 * Todas las operaciones reciben el estado (S), el usuario que la ejecuta (u)
 * y los parámetros; validan, modifican S y devuelven el registro creado.
 * La app las ejecuta dentro de M.D.tx(): trabaja sobre una copia y solo la
 * confirma si la operación termina sin errores Y se guarda bien. Así una venta
 * nunca queda registrada sin su movimiento de stock (atomicidad).
 *
 * Los permisos se verifican acá (no solo ocultando botones). En el modo local
 * es una protección de uso diario, no de seguridad: quien controla el navegador
 * controla los datos. La seguridad real está en supabase/ (RLS + funciones).
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U;
  const { r2, r3, uid, sum, pad } = U;

  const SCHEMA = 4;

  /** Error con mensaje para mostrar al usuario. */
  class DomainError extends Error { constructor(msg, code) { super(msg); this.name = 'DomainError'; this.code = code || 'invalido'; } }
  const fail = (msg, code) => { throw new DomainError(msg, code); };

  /* ---------- Catálogos ---------- */
  const TIPOS = {
    FA: { letra: 'A', cod: '001', nombre: 'Factura A' },
    FB: { letra: 'B', cod: '006', nombre: 'Factura B' },
    FC: { letra: 'C', cod: '011', nombre: 'Factura C' },
    TK: { letra: 'X', cod: '—', nombre: 'Ticket interno' }
  };
  const MEDIOS = ['Efectivo', 'Débito', 'Crédito', 'Mercado Pago', 'Transferencia', 'Cuenta corriente'];
  const MEDIOS_PAGO = ['Efectivo', 'Transferencia', 'Débito', 'Mercado Pago', 'Cheque'];
  const ML = (m) => (m === 'Cuenta corriente' ? 'Fiado' : m);
  const COND = { RI: 'Responsable Inscripto', MONO: 'Monotributo', CF: 'Consumidor Final', EX: 'IVA Exento' };
  const GASTO_CATS = ['Alquiler', 'Luz, gas, internet', 'Sueldos', 'Insumos del local', 'Impuestos y tasas', 'Arreglos', 'Fletes', 'Otros'];
  const CBTE_COMPRA = ['Factura A', 'Factura B', 'Factura C', 'Remito'];
  const MOV_TIPOS = {
    inicial: 'Stock inicial', venta: 'Venta', devolucion: 'Devolución de cliente', compra: 'Llegó mercadería',
    devprov: 'Devolución a proveedor', conteo: 'Conteo físico', merma: 'Pérdida', ajuste: 'Ingreso manual'
  };
  const MOTIVOS_MERMA = ['Vencido', 'Roto o dañado', 'Robo o faltante', 'Consumo del local', 'Otro'];

  /* ---------- Roles y permisos ---------- */
  const ROLES = { admin: 'Administrador', encargado: 'Encargado', vendedor: 'Vendedor', deposito: 'Depósito' };
  const T = ['admin', 'encargado', 'vendedor', 'deposito'];
  const PERMS = {
    'venta.crear': ['admin', 'encargado', 'vendedor'],
    'venta.descuento_libre': ['admin', 'encargado'],
    'venta.devolver': ['admin', 'encargado'],
    'caja.abrir': ['admin', 'encargado', 'vendedor'],
    'caja.cerrar': ['admin', 'encargado', 'vendedor'],
    'caja.movimiento': ['admin', 'encargado'],
    'gasto.crear': ['admin', 'encargado'],
    'gasto.anular': ['admin', 'encargado'],
    'producto.ver': T,
    'producto.costos': ['admin', 'encargado', 'deposito'],
    'producto.editar': ['admin'],
    'precio.masivo': ['admin'],
    'stock.ajustar': ['admin', 'encargado', 'deposito'],
    'compra.recibir': ['admin', 'encargado', 'deposito'],
    'compra.costos': ['admin', 'encargado'],
    'pedido.crear': ['admin', 'encargado', 'deposito'],
    'proveedor.ver': ['admin', 'encargado', 'deposito'],
    'proveedor.editar': ['admin', 'encargado'],
    'proveedor.pagar': ['admin', 'encargado'],
    'devprov.crear': ['admin', 'encargado'],
    'cliente.ver': ['admin', 'encargado', 'vendedor'],
    'cliente.editar': ['admin', 'encargado', 'vendedor'],
    'cliente.cobrar': ['admin', 'encargado', 'vendedor'],
    'informes.ver': ['admin', 'encargado'],
    'config.editar': ['admin'],
    'usuarios.editar': ['admin'],
    'backup.exportar': ['admin', 'encargado'],
    'backup.restaurar': ['admin']
  };
  const can = (u, p) => !!(u && u.activo !== false && PERMS[p] && PERMS[p].includes(u.rol));
  const need = (u, p) => { if (!can(u, p)) fail(`Tu usuario (${u ? ROLES[u.rol] : 'sin usuario'}) no tiene permiso para esta acción. Pedile a un administrador o encargado.`, 'permiso'); };

  /* ---------- Búsquedas ---------- */
  const prod = (S, id) => S.productos.find((p) => p.id === id);
  const prov = (S, id) => S.proveedores.find((p) => p.id === id);
  const cli = (S, id) => S.clientes.find((c) => c.id === id);
  const usuario = (S, id) => S.usuarios.find((x) => x.id === id);
  const uNombre = (S, id) => (usuario(S, id) || {}).nombre || '—';

  /* ---------- Estado vacío ---------- */
  function emptyState(modo) {
    return {
      schema: SCHEMA,
      workspace: { id: uid(), modo: modo || 'local', creado: new Date().toISOString() },
      config: {
        nombre: '', razon: '', cuit: '', iibb: '', domicilio: '', inicio: U.today(), condIva: 'MONO', pv: 1, letra: 'normal',
        stockNegativo: false, descMaxVendedor: 10, diasCobertura: 14, pedirUsuario: false,
        ticket: { ancho: 80, auto: false, pie: '¡Gracias por su compra!' },
        balanza: { activa: true, prefijo: '20', digitosPlu: 5, tipo: 'peso' }
      },
      seq: { interno: 1, devolucion: 1, pedido: 1 },
      usuarios: [], productos: [], proveedores: [],
      clientes: [{ id: 'c0', nombre: 'Consumidor Final', condIva: 'CF', cuit: '', tel: '', fijo: true }],
      ventas: [], devoluciones: [], compras: [], pedidos: [], devprov: [], pagos: [], cobros: [], gastos: [],
      cajas: [], cajaMovs: [], movimientos: [], auditoria: [],
      guia: { venta: false, compra: false, cierre: false, oculta: false },
      meta: { ultimaCopia: null }
    };
  }

  /* ---------- Transacción ---------- */
  /**
   * Ejecuta fn sobre una copia del estado. Si fn falla, el estado original queda intacto.
   * Para que sea rápido, las colecciones grandes (ventas, kardex, etc.) se copian como
   * listas nuevas pero comparten sus registros: esos registros se tratan como inmutables.
   * Si una operación necesita cambiar uno (p. ej. marcar una venta como devuelta), primero
   * lo reemplaza por una copia con cow(). Todo lo demás se copia completo.
   */
  const APPEND_ONLY = ['ventas', 'movimientos', 'auditoria', 'compras', 'devoluciones', 'cobros', 'pagos', 'cajaMovs', 'devprov'];
  function tx(S, fn) {
    const draft = {};
    Object.keys(S).forEach((k) => { draft[k] = APPEND_ONLY.includes(k) ? S[k].slice() : U.clone(S[k]); });
    const result = fn(draft);
    return { state: draft, result };
  }
  /** Copy-on-write: reemplaza el registro idx de una colección grande por una copia editable. */
  function cow(arr, idx) { arr[idx] = U.clone(arr[idx]); return arr[idx]; }
  const now = (f) => (f ? new Date(f).toISOString() : new Date().toISOString());
  function audit(S, u, accion, detalle, fecha) { S.auditoria.push({ id: uid(), fecha: now(fecha), usuario: u ? u.id : null, accion, detalle }); }

  /* ---------- Validaciones ---------- */
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
  function vMonto(n, campo, { min = 0, permiteCero = false } = {}) {
    if (!isNum(n)) fail(`Revisá ${campo}: tiene que ser un número.`);
    if (permiteCero ? n < min : n <= min) fail(permiteCero ? `Revisá ${campo}: no puede ser negativo.` : `Revisá ${campo}: tiene que ser mayor a ${min === 0 ? 'cero' : U.fn(min)}.`);
    if (n > 1e12) fail(`Revisá ${campo}: el número es demasiado grande.`);
  }
  function vCant(p, n) {
    if (!isNum(n) || n <= 0) fail(`La cantidad de "${p.nombre}" tiene que ser mayor a cero.`);
    if (p.unidad !== 'kg' && Math.abs(n - Math.round(n)) > 1e-9) fail(`"${p.nombre}" se vende por unidad: la cantidad tiene que ser un número entero.`);
  }
  const texto = (s, max = 200) => String(s == null ? '' : s).trim().slice(0, max);

  /* ---------- Precios ---------- */
  const calcPrecio = (p) => r2(U.num(p.costo) * (1 + U.num(p.margen) / 100) * (1 + U.num(p.iva) / 100));
  const margenDesde = (p, precio) => { const base = U.num(p.costo) * (1 + U.num(p.iva) / 100); return base > 0 ? r2((precio / base - 1) * 100) : 0; };

  /* ---------- Stock y kardex ---------- */
  /** Único punto donde cambia el stock. Registra cantidad anterior, resultante, usuario, motivo y referencia. */
  function moverStock(S, u, { pid, cant, tipo, motivo, ref, fecha, permitirNegativo }) {
    const p = prod(S, pid); if (!p) fail('El producto no existe.');
    if (!isNum(cant) || cant === 0) fail('La cantidad del movimiento no es válida.');
    const antes = r3(p.stock), despues = r3(p.stock + cant);
    if (despues < 0 && !permitirNegativo && !S.config.stockNegativo) fail(`No hay stock suficiente de "${p.nombre}": quedan ${U.fn(antes)}.`, 'stock');
    p.stock = despues;
    const m = { id: uid(), fecha: now(fecha), usuario: u ? u.id : null, pid, tipo, cant: r3(cant), antes, despues, motivo: motivo || '', ref: ref || null };
    S.movimientos.push(m);
    return m;
  }
  const stockState = (p) => (p.stock <= 0 ? 'bad' : p.stock <= p.stockMin ? 'warn' : 'ok');
  const lowStock = (S) => S.productos.filter((p) => p.activo !== false && p.stock <= p.stockMin);

  /* ---------- Productos ---------- */
  function datosProducto(S, d, id) {
    const nombre = texto(d.nombre, 120); if (!nombre) fail('Escribí el nombre del producto.');
    const costo = U.toNum(d.costo); vMonto(costo, 'el precio de compra', { permiteCero: true });
    const margen = U.toNum(d.margen); if (!isNum(margen) || margen < -99 || margen > 10000) fail('Revisá el porcentaje de ganancia.');
    const iva = U.toNum(d.iva); if (![0, 10.5, 21, 27].includes(iva)) fail('La alícuota de IVA no es válida.');
    let precio = U.toNum(d.precio); if (!isNum(precio)) precio = calcPrecio({ costo, margen, iva });
    vMonto(precio, 'el precio de venta');
    const stockMin = U.toNum(d.stockMin); if (!isNum(stockMin) || stockMin < 0) fail('El aviso de stock mínimo no puede ser negativo.');
    let codigo = texto(d.codigo, 32).replace(/\s/g, '');
    if (codigo && !/^[0-9A-Za-z\-._]+$/.test(codigo)) fail('El código solo puede tener números, letras, guiones y puntos.');
    if (!codigo) codigo = '200' + pad(Date.now() % 1e10, 10);
    const dup = S.productos.find((p) => p.codigo === codigo && p.id !== id);
    if (dup) fail(`Ese código ya lo usa "${dup.nombre}".`);
    const unidad = d.unidad === 'kg' ? 'kg' : 'u';
    const plu = texto(d.plu, 6).replace(/\D/g, '');
    return { codigo, plu, nombre, categoria: texto(d.categoria, 60) || 'Varios', provId: d.provId || '', unidad, costo: r2(costo), margen: r2(margen), iva, precio: r2(precio), stockMin: r3(stockMin) };
  }
  function crearProducto(S, u, d, fecha) {
    need(u, 'producto.editar');
    const base = datosProducto(S, d, null);
    const stock = U.toNum(d.stock || 0); if (!isNum(stock) || stock < 0) fail('El stock inicial no puede ser negativo.');
    const p = { id: uid(), ...base, stock: 0, activo: true, creado: now(fecha) };
    S.productos.push(p);
    if (stock > 0) moverStock(S, u, { pid: p.id, cant: stock, tipo: 'inicial', motivo: 'Alta del producto', fecha });
    audit(S, u, 'producto.alta', `${p.nombre} · ${U.f$(p.precio)}`, fecha);
    return p;
  }
  function editarProducto(S, u, id, d) {
    need(u, 'producto.editar');
    const p = prod(S, id); if (!p) fail('El producto no existe.');
    const base = datosProducto(S, d, id);
    if (base.precio !== p.precio || base.costo !== p.costo) audit(S, u, 'producto.precio', `${p.nombre}: costo ${U.f$(p.costo)} → ${U.f$(base.costo)}, precio ${U.f$(p.precio)} → ${U.f$(base.precio)}`);
    Object.assign(p, base, { actualizado: now() });
    return p;
  }
  function archivarProducto(S, u, id, activo) {
    need(u, 'producto.editar');
    const p = prod(S, id); if (!p) fail('El producto no existe.');
    p.activo = !!activo;
    audit(S, u, activo ? 'producto.reactivar' : 'producto.archivar', p.nombre);
    return p;
  }
  /** Conteo físico: fija la cantidad real. Pérdida: descuenta. Ingreso: suma. Siempre con motivo. */
  function ajustarStock(S, u, { pid, tipo, cant, motivo }) {
    need(u, 'stock.ajustar');
    const p = prod(S, pid); if (!p) fail('El producto no existe.');
    const m = texto(motivo, 120); if (!m) fail('Indicá el motivo del ajuste.');
    const n = U.toNum(cant);
    if (tipo === 'conteo') {
      if (!isNum(n) || n < 0) fail('La cantidad contada no puede ser negativa.');
      if (p.unidad !== 'kg' && Math.abs(n - Math.round(n)) > 1e-9) fail('Este producto se cuenta por unidad: usá un número entero.');
      const delta = r3(n - p.stock);
      if (delta === 0) return null;
      return moverStock(S, u, { pid, cant: delta, tipo: 'conteo', motivo: m, permitirNegativo: true });
    }
    vCant(p, n);
    if (tipo === 'merma') return moverStock(S, u, { pid, cant: -n, tipo: 'merma', motivo: m });
    if (tipo === 'ajuste') return moverStock(S, u, { pid, cant: n, tipo: 'ajuste', motivo: m });
    fail('Tipo de ajuste desconocido.');
  }
  function aumentoMasivo(S, u, { alcance, pct, redondeo, fecha }) {
    need(u, 'precio.masivo');
    const p100 = U.toNum(pct); if (!isNum(p100) || p100 <= -90 || p100 > 500) fail('El porcentaje tiene que estar entre -90% y 500%.');
    const red = U.num(redondeo);
    const list = S.productos.filter((p) => p.activo !== false && (alcance === 'todos' || (alcance.startsWith('cat:') && p.categoria === alcance.slice(4)) || (alcance.startsWith('prov:') && p.provId === alcance.slice(5))));
    if (!list.length) fail('No hay productos para actualizar con ese criterio.');
    list.forEach((p) => { p.costo = r2(p.costo * (1 + p100 / 100)); let pr = calcPrecio(p); if (red > 0) pr = Math.ceil(pr / red) * red; p.precio = r2(pr); p.margen = margenDesde(p, p.precio); });
    audit(S, u, 'precio.masivo', `${list.length} productos ${p100 >= 0 ? '+' : ''}${U.fn(p100)}% (${alcance})`, fecha);
    return list.length;
  }

  /* ---------- Caja ---------- */
  const cajaAbierta = (S) => S.cajas.find((c) => !c.cierra) || null;
  function abrirCaja(S, u, { monto, fecha }) {
    need(u, 'caja.abrir');
    if (cajaAbierta(S)) fail('Ya hay una caja abierta. Cerrala antes de abrir otra.');
    const m = U.toNum(monto); vMonto(m, 'el cambio inicial', { permiteCero: true });
    const c = { id: uid(), abre: { fecha: now(fecha), usuario: u.id, monto: r2(m) }, cierra: null };
    S.cajas.push(c);
    return c;
  }
  /** Movimientos de dinero entre dos fechas (todas las formas de pago). Positivo = entra. */
  function movimientosDinero(S, from, to) {
    const t0 = new Date(from).getTime(), t1 = to ? new Date(to).getTime() : Infinity;
    const enR = (f) => { const t = new Date(f).getTime(); return t >= t0 && t <= t1; };
    const m = [];
    S.ventas.forEach((v) => { if (!enR(v.fecha)) return; v.pagos.forEach((pg) => { if (pg.medio !== 'Cuenta corriente') m.push({ fecha: v.fecha, tipo: 'Venta', detalle: `${TIPOS[v.tipo].nombre} N° ${v.nro}`, medio: pg.medio, monto: pg.monto, ref: { tipo: 'venta', id: v.id } }); }); });
    S.devoluciones.forEach((d) => { if (enR(d.fecha) && d.reintegro.medio !== 'Cuenta corriente') m.push({ fecha: d.fecha, tipo: 'Devolución a cliente', detalle: `N° ${d.nro} · ${d.motivo}`, medio: d.reintegro.medio, monto: -d.total, ref: { tipo: 'devolucion', id: d.id } }); });
    S.cobros.forEach((c) => { if (enR(c.fecha)) m.push({ fecha: c.fecha, tipo: 'Cobro de fiado', detalle: (cli(S, c.cliId) || {}).nombre || '', medio: c.medio, monto: c.monto }); });
    S.gastos.forEach((g) => { if (enR(g.fecha) && !g.anulado) m.push({ fecha: g.fecha, tipo: 'Gasto', detalle: `${g.categoria} · ${g.detalle}`, medio: g.medio, monto: -g.monto }); });
    S.pagos.forEach((p) => { if (enR(p.fecha)) m.push({ fecha: p.fecha, tipo: 'Pago a proveedor', detalle: (prov(S, p.provId) || {}).nombre || '', medio: p.medio, monto: -p.monto }); });
    S.compras.forEach((c) => { if (enR(c.fecha) && c.cond === 'contado') m.push({ fecha: c.fecha, tipo: 'Mercadería pagada', detalle: (prov(S, c.provId) || {}).nombre || '', medio: c.medio, monto: -c.total }); });
    S.devprov.forEach((d) => { if (enR(d.fecha) && d.modo === 'reintegro') m.push({ fecha: d.fecha, tipo: 'Reintegro de proveedor', detalle: (prov(S, d.provId) || {}).nombre || '', medio: d.medio, monto: d.total }); });
    S.cajaMovs.forEach((c) => { if (enR(c.fecha)) m.push({ fecha: c.fecha, tipo: c.tipo === 'retiro' ? 'Retiro de efectivo' : 'Ingreso de efectivo', detalle: c.motivo, medio: 'Efectivo', monto: c.tipo === 'retiro' ? -c.monto : c.monto }); });
    return m.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  }
  /** Efectivo que tiene que haber en una sesión de caja: cambio inicial + entradas − salidas en efectivo. */
  function cajaEsperado(S, c) {
    const movs = movimientosDinero(S, c.abre.fecha, c.cierra ? c.cierra.fecha : null).filter((m) => m.medio === 'Efectivo');
    return r2(c.abre.monto + sum(movs, 'monto'));
  }
  function cerrarCaja(S, u, { contado, motivo, fecha }) {
    need(u, 'caja.cerrar');
    const c = cajaAbierta(S); if (!c) fail('No hay ninguna caja abierta.');
    const n = U.toNum(contado); vMonto(n, 'el efectivo contado', { permiteCero: true });
    const f = now(fecha);
    const esperado = cajaEsperado(S, { abre: c.abre, cierra: { fecha: f } });
    const dif = r2(n - esperado);
    const mot = texto(motivo, 200);
    if (Math.abs(dif) >= 1 && !mot) fail('La caja no cierra justa: escribí el motivo de la diferencia.', 'motivo');
    c.cierra = { fecha: f, usuario: u.id, contado: r2(n), esperado, dif, motivo: mot };
    if (Math.abs(dif) >= 1) audit(S, u, 'caja.diferencia', `${dif > 0 ? 'Sobrante' : 'Faltante'} de ${U.f$(Math.abs(dif))}: ${mot}`, fecha);
    if (S.guia) S.guia.cierre = true;
    return c;
  }
  /** Para movimientos en efectivo: la caja tiene que estar abierta y, si sale plata, tiene que alcanzar. */
  function requiereCajaEfectivo(S, medios, opts, salida, fecha) {
    if (opts && opts.sinCaja) return;
    if (!medios.includes('Efectivo')) return;
    const c = cajaAbierta(S);
    if (!c) fail('La caja está cerrada. Abrila para registrar movimientos en efectivo.', 'caja');
    if (salida > 0) {
      const disp = cajaEsperado(S, { abre: c.abre, cierra: { fecha: now(fecha) } });
      if (salida > disp + 0.01) fail(`En la caja hay ${U.f$(disp)} en efectivo y no alcanza para pagar ${U.f$(salida)}. Elegí otro medio de pago.`, 'caja');
    }
  }
  function movimientoCaja(S, u, { tipo, monto, motivo, fecha }) {
    need(u, 'caja.movimiento');
    if (!cajaAbierta(S)) fail('La caja está cerrada.', 'caja');
    if (!['retiro', 'ingreso'].includes(tipo)) fail('Tipo de movimiento inválido.');
    const m = U.toNum(monto); vMonto(m, 'el monto');
    const mot = texto(motivo, 120); if (!mot) fail('Indicá el motivo.');
    if (tipo === 'retiro') { const c = cajaAbierta(S); const disp = cajaEsperado(S, { abre: c.abre, cierra: { fecha: now(fecha) } }); if (m > disp + 0.01) fail(`No podés retirar más de lo que hay en la caja (${U.f$(disp)}).`); }
    const r = { id: uid(), fecha: now(fecha), usuario: u.id, tipo, monto: r2(m), motivo: mot };
    S.cajaMovs.push(r);
    return r;
  }

  /* ---------- Ventas ---------- */
  function tiposPermitidos(S, cliId) { if (S.config.condIva === 'MONO') return ['FC', 'TK']; const c = cli(S, cliId); return c && c.condIva === 'RI' ? ['FA', 'TK'] : ['FB', 'TK']; }
  const autoTipo = (S, cliId) => tiposPermitidos(S, cliId)[0];
  /** Calcula totales con el precio del catálogo. Precio final incluye IVA. */
  function calcVenta(S, items, desc) {
    const f = 1 - U.num(desc) / 100; let total = 0, n21 = 0, n105 = 0, nEx = 0, i21 = 0, i105 = 0, costo = 0, bruto = 0;
    items.forEach((it) => {
      const sub = it.precio * it.cant * f; bruto += it.precio * it.cant; total += sub; costo += it.costo * it.cant;
      if (it.iva === 21) { const n = sub / 1.21; n21 += n; i21 += sub - n; } else if (it.iva === 10.5) { const n = sub / 1.105; n105 += n; i105 += sub - n; } else if (it.iva === 27) { const n = sub / 1.27; n21 += n; i21 += sub - n; } else nEx += sub;
    });
    const neto = S.config.condIva === 'RI' ? total - (i21 + i105) : total;
    return { total: r2(total), bruto: r2(bruto), n21: r2(n21), n105: r2(n105), nEx: r2(nEx), i21: r2(i21), i105: r2(i105), neto: r2(neto), costo: r2(costo) };
  }
  /**
   * Registra una venta. Los precios salen del catálogo (no del navegador del cliente).
   * params: { opId, items:[{pid,cant}], clienteId, tipo, desc, pagos:[{medio,monto}], recibido, fecha }
   */
  function registrarVenta(S, u, params, opts) {
    need(u, 'venta.crear');
    const { opId, clienteId = 'c0' } = params;
    if (opId && S.ventas.some((v) => v.opId === opId)) fail('Esta venta ya se registró (se evitó un cobro duplicado).', 'duplicado');
    if (!(opts && opts.sinCaja) && !cajaAbierta(S)) fail('La caja está cerrada. Abrila para empezar a vender.', 'caja');
    if (!Array.isArray(params.items) || !params.items.length) fail('La venta no tiene productos.');
    const c = cli(S, clienteId); if (!c) fail('El cliente no existe.');
    const desc = U.num(params.desc);
    if (!(desc >= 0 && desc <= 100)) fail('El descuento tiene que estar entre 0% y 100%.');
    if (desc > S.config.descMaxVendedor && !can(u, 'venta.descuento_libre')) fail(`Como vendedor podés hacer hasta ${S.config.descMaxVendedor}% de descuento.`, 'permiso');
    // Agrupa líneas del mismo producto para validar el stock total
    const agrup = new Map();
    params.items.forEach((it) => agrup.set(it.pid, r3((agrup.get(it.pid) || 0) + U.num(it.cant))));
    const items = [];
    agrup.forEach((cant, pid) => {
      const p = prod(S, pid); if (!p) fail('Uno de los productos ya no existe.');
      if (p.activo === false) fail(`"${p.nombre}" está archivado y no se puede vender.`);
      vCant(p, cant);
      if (cant > p.stock + 1e-9 && !S.config.stockNegativo) fail(`No hay stock suficiente de "${p.nombre}": quedan ${U.fn(p.stock)}.`, 'stock');
      items.push({ pid, nombre: p.nombre, cant, precio: p.precio, costo: p.costo, iva: p.iva, devuelto: 0 });
    });
    const perm = tiposPermitidos(S, clienteId);
    const tipo = params.tipo || perm[0];
    if (!perm.includes(tipo)) fail(`Para este cliente corresponde ${perm.map((t) => TIPOS[t].nombre).join(' o ')}.`);
    if (tipo === 'FA' && !U.cuitValido(c.cuit)) fail('Para Factura A el cliente tiene que tener un CUIT válido.');
    const tot = calcVenta(S, items, desc);
    // Pagos
    const pagos = (params.pagos || []).map((p) => ({ medio: p.medio, monto: r2(U.num(p.monto)) })).filter((p) => p.monto !== 0);
    if (!pagos.length) fail('Indicá cómo paga el cliente.');
    pagos.forEach((p) => { if (!MEDIOS.includes(p.medio)) fail('Medio de pago desconocido.'); if (p.monto < 0) fail('Los montos de pago no pueden ser negativos.'); });
    const pagado = r2(sum(pagos, 'monto'));
    if (Math.abs(pagado - tot.total) > 0.01) fail(pagado < tot.total ? `Faltan ${U.f$(tot.total - pagado)} para completar el pago.` : `Los pagos superan el total por ${U.f$(pagado - tot.total)}.`);
    if (pagos.some((p) => p.medio === 'Cuenta corriente') && clienteId === 'c0') fail('Para vender fiado elegí a qué cliente.');
    const ef = sum(pagos.filter((p) => p.medio === 'Efectivo'), 'monto');
    let recibido = null;
    if (params.recibido != null && params.recibido !== '' && ef > 0) { recibido = r2(U.num(params.recibido)); if (recibido < ef - 0.009) fail(`El cliente entregó ${U.f$(recibido)} y el efectivo a cobrar es ${U.f$(ef)}.`); }
    const v = {
      id: uid(), opId: opId || uid(), nro: pad(S.config.pv, 5) + '-' + pad(S.seq.interno++, 8), fecha: now(params.fecha), usuario: u.id,
      clienteId, tipo, items, desc, pagos, recibido, vuelto: recibido != null ? r2(recibido - ef) : null, ...tot,
      condEmisor: S.config.condIva, estado: 'ok',
      fiscal: { estado: tipo === 'TK' ? 'no_fiscal' : 'sin_autorizar' }
    };
    S.ventas.push(v);
    v.items.forEach((it) => moverStock(S, u, { pid: it.pid, cant: -it.cant, tipo: 'venta', motivo: `Venta N° ${v.nro}`, ref: { tipo: 'venta', id: v.id }, fecha: v.fecha }));
    if (S.guia) S.guia.venta = true;
    return v;
  }
  const medioVenta = (v) => (v.pagos.length > 1 ? 'Mixto' : ML(v.pagos[0].medio));
  /** Devolución total o parcial. Nunca borra la venta: registra una nota de devolución que revierte stock y dinero. */
  function devolverVenta(S, u, { ventaId, items, motivo, medio, fecha }) {
    need(u, 'venta.devolver');
    const vi = S.ventas.findIndex((x) => x.id === ventaId); if (vi < 0) fail('La venta no existe.');
    const v = cow(S.ventas, vi);
    const mot = texto(motivo, 160); if (!mot) fail('Indicá el motivo de la devolución.');
    const sel = (items || []).map((x) => ({ idx: x.idx, cant: r3(U.num(x.cant)) })).filter((x) => x.cant > 0);
    if (!sel.length) fail('Elegí qué productos se devuelven.');
    const f = 1 - (v.desc || 0) / 100; let total = 0; const lineas = [];
    sel.forEach(({ idx, cant }) => {
      const it = v.items[idx]; if (!it) fail('Producto inválido en la devolución.');
      const disp = r3(it.cant - (it.devuelto || 0));
      if (cant > disp + 1e-9) fail(`De "${it.nombre}" se pueden devolver como máximo ${U.fn(disp)}.`);
      const p = prod(S, it.pid); if (p) vCant(p, cant);
      const sub = r2(it.precio * cant * f); total += sub;
      lineas.push({ idx, pid: it.pid, nombre: it.nombre, cant, precio: it.precio, subtotal: sub });
    });
    total = r2(total);
    // Si la venta fue (total o parcialmente) fiada, primero se descuenta de la deuda.
    const fiado = sum(v.pagos.filter((p) => p.medio === 'Cuenta corriente'), 'monto');
    const yaDevFiado = sum(S.devoluciones.filter((d) => d.ventaId === v.id && d.reintegro.medio === 'Cuenta corriente'), 'total');
    let reMedio = medio || (fiado - yaDevFiado > 0.009 ? 'Cuenta corriente' : v.pagos[0].medio);
    if (reMedio === 'Cuenta corriente' && v.clienteId === 'c0') reMedio = 'Efectivo';
    if (!MEDIOS.includes(reMedio)) fail('Medio de reintegro inválido.');
    requiereCajaEfectivo(S, [reMedio], null, total, fecha);
    const d = { id: uid(), nro: pad(S.config.pv, 5) + '-' + pad(S.seq.devolucion++, 8), fecha: now(fecha), usuario: u.id, ventaId: v.id, clienteId: v.clienteId, items: lineas, total, motivo: mot, reintegro: { medio: reMedio, monto: total } };
    S.devoluciones.push(d);
    lineas.forEach((l) => { v.items[l.idx].devuelto = r3((v.items[l.idx].devuelto || 0) + l.cant); if (prod(S, l.pid)) moverStock(S, u, { pid: l.pid, cant: l.cant, tipo: 'devolucion', motivo: `Devolución N° ${d.nro} · ${mot}`, ref: { tipo: 'devolucion', id: d.id }, fecha: d.fecha }); });
    const todo = v.items.every((it) => (it.devuelto || 0) >= it.cant - 1e-9);
    v.estado = todo ? 'anulada' : 'devuelta_parcial';
    audit(S, u, 'venta.devolucion', `Venta ${v.nro}: ${U.f$(total)} · ${mot}`, fecha);
    return d;
  }
  const totalDevuelto = (S, ventaId) => r2(sum(S.devoluciones.filter((d) => d.ventaId === ventaId), 'total'));

  /* ---------- Clientes y proveedores ---------- */
  const saldoProv = (S, id) => r2(sum(S.compras.filter((c) => c.provId === id && c.cond === 'cc'), 'total') - sum(S.pagos.filter((p) => p.provId === id), 'monto') - sum(S.devprov.filter((d) => d.provId === id && d.modo === 'credito'), 'total'));
  const saldoCli = (S, id) => r2(sum(S.ventas.filter((v) => v.clienteId === id), (v) => sum(v.pagos.filter((p) => p.medio === 'Cuenta corriente'), 'monto')) - sum(S.cobros.filter((c) => c.cliId === id), 'monto') - sum(S.devoluciones.filter((d) => d.clienteId === id && d.reintegro.medio === 'Cuenta corriente'), 'total'));
  function guardarCliente(S, u, d) {
    need(u, 'cliente.editar');
    const nombre = texto(d.nombre, 120); if (!nombre) fail('Escribí el nombre del cliente.');
    const condIva = ['CF', 'RI', 'MONO', 'EX'].includes(d.condIva) ? d.condIva : 'CF';
    const doc = texto(d.cuit, 20);
    if (condIva === 'RI' && !U.cuitValido(doc)) fail('Para un Responsable Inscripto cargá un CUIT válido (11 números).');
    if (doc && /^\d{2}-?\d{8}-?\d$/.test(doc) && !U.cuitValido(doc)) fail('El CUIT no es válido: revisá los números.');
    const base = { nombre, condIva, cuit: U.cuitValido(doc) ? U.fmtCuit(doc) : doc, tel: texto(d.tel, 40) };
    if (d.id) { const c = cli(S, d.id); if (!c || c.fijo) fail('No se puede editar este cliente.'); Object.assign(c, base); return c; }
    const c = { id: uid(), ...base }; S.clientes.push(c); return c;
  }
  function guardarProveedor(S, u, d) {
    need(u, 'proveedor.editar');
    const nombre = texto(d.nombre, 120); if (!nombre) fail('Escribí el nombre del proveedor.');
    const cuit = texto(d.cuit, 20); if (cuit && !U.cuitValido(cuit)) fail('El CUIT no es válido: revisá los números.');
    const plazo = U.toNum(d.plazo || 0); if (!isNum(plazo) || plazo < 0 || plazo > 365) fail('Los días para pagar tienen que estar entre 0 y 365.');
    const entrega = U.toNum(d.entrega || 0); if (!isNum(entrega) || entrega < 0 || entrega > 120) fail('Los días de entrega tienen que estar entre 0 y 120.');
    const base = { nombre, cuit: cuit ? U.fmtCuit(cuit) : '', rubro: texto(d.rubro, 80), contacto: texto(d.contacto, 80), tel: texto(d.tel, 40), plazo: Math.round(plazo), entrega: Math.round(entrega) };
    if (d.id) { const p = prov(S, d.id); if (!p) fail('El proveedor no existe.'); Object.assign(p, base); return p; }
    const p = { id: uid(), ...base }; S.proveedores.push(p); return p;
  }
  function pagarProveedor(S, u, { provId, monto, medio, fecha }, opts) {
    need(u, 'proveedor.pagar');
    if (!prov(S, provId)) fail('El proveedor no existe.');
    const m = U.toNum(monto); vMonto(m, 'el monto');
    if (!MEDIOS_PAGO.includes(medio)) fail('Medio de pago inválido.');
    const s = saldoProv(S, provId); if (m > s + 0.01) fail(`No podés pagar más de lo que le debés (${U.f$(Math.max(0, s))}).`);
    requiereCajaEfectivo(S, [medio], opts, m, fecha);
    const r = { id: uid(), fecha: now(fecha), usuario: u.id, provId, monto: r2(m), medio };
    S.pagos.push(r); return r;
  }
  function cobrarCliente(S, u, { cliId, monto, medio, fecha }, opts) {
    need(u, 'cliente.cobrar');
    if (!cli(S, cliId)) fail('El cliente no existe.');
    const m = U.toNum(monto); vMonto(m, 'el monto');
    if (!MEDIOS_PAGO.includes(medio)) fail('Medio de pago inválido.');
    const s = saldoCli(S, cliId); if (m > s + 0.01) fail(`No podés cobrar más de lo que debe (${U.f$(Math.max(0, s))}).`);
    requiereCajaEfectivo(S, [medio], opts);
    const r = { id: uid(), fecha: now(fecha), usuario: u.id, cliId, monto: r2(m), medio };
    S.cobros.push(r); return r;
  }

  /* ---------- Gastos ---------- */
  function registrarGasto(S, u, { monto, detalle, categoria, medio, fecha }, opts) {
    need(u, 'gasto.crear');
    const m = U.toNum(monto); vMonto(m, 'el monto');
    const det = texto(detalle, 120); if (!det) fail('Escribí en qué fue el gasto.');
    if (!GASTO_CATS.includes(categoria)) fail('Elegí el tipo de gasto.');
    if (!MEDIOS_PAGO.includes(medio)) fail('Elegí cómo lo pagaste.');
    requiereCajaEfectivo(S, [medio], opts, m, fecha);
    const g = { id: uid(), fecha: now(fecha), usuario: u.id, categoria, detalle: det, monto: r2(m), medio, anulado: null };
    S.gastos.push(g); return g;
  }
  /** No se borra: se anula con motivo y queda en el historial. */
  function anularGasto(S, u, { id, motivo }) {
    need(u, 'gasto.anular');
    const g = S.gastos.find((x) => x.id === id); if (!g) fail('El gasto no existe.');
    if (g.anulado) fail('Ese gasto ya estaba anulado.');
    const mot = texto(motivo, 120); if (!mot) fail('Indicá por qué se anula.');
    g.anulado = { fecha: now(), usuario: u.id, motivo: mot };
    audit(S, u, 'gasto.anular', `${g.detalle} ${U.f$(g.monto)} · ${mot}`);
    return g;
  }

  /* ---------- Compras, pedidos y devoluciones a proveedor ---------- */
  function crearPedido(S, u, { provId, items, nota, fecha }) {
    need(u, 'pedido.crear');
    if (!prov(S, provId)) fail('Elegí el proveedor.');
    const its = (items || []).map((it) => ({ pid: it.pid, cant: r3(U.num(it.cant)), recibido: 0 })).filter((it) => it.cant > 0);
    if (!its.length) fail('El pedido no tiene productos.');
    its.forEach((it) => { const p = prod(S, it.pid); if (!p) fail('Uno de los productos no existe.'); vCant(p, it.cant); });
    const p = { id: uid(), nro: pad(S.seq.pedido++, 6), fecha: now(fecha), usuario: u.id, provId, estado: 'pendiente', items: its, nota: texto(nota, 200) };
    S.pedidos.push(p); return p;
  }
  function cancelarPedido(S, u, { id, motivo }) {
    need(u, 'pedido.crear');
    const p = S.pedidos.find((x) => x.id === id); if (!p) fail('El pedido no existe.');
    if (p.estado === 'recibido' || p.estado === 'cancelado') fail('Ese pedido ya está cerrado.');
    p.estado = 'cancelado'; p.cancelado = { fecha: now(), usuario: u.id, motivo: texto(motivo, 160) };
    return p;
  }
  const pendientePedido = (S, pid) => sum(S.pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'parcial'), (p) => sum(p.items.filter((i) => i.pid === pid), (i) => Math.max(0, i.cant - i.recibido)));
  function buildCompra(S, { provId, tipo, nroComp, cond, medio, items, fecha }) {
    let neto = 0, iva = 0; items.forEach((i) => { const n = i.costo * i.cant; neto += n; if (tipo === 'Factura A') iva += (n * i.iva) / 100; });
    return { id: uid(), fecha: now(fecha), provId, tipo, nroComp: nroComp || 's/n', cond, medio: cond === 'contado' ? medio : '', items: items.map((i) => ({ ...i })), neto: r2(neto), iva: r2(iva), total: r2(neto + iva) };
  }
  /** Recepción de mercadería: suma stock, registra la compra y (si corresponde) actualiza costos y precios. */
  function recibirCompra(S, u, params, opts) {
    need(u, 'compra.recibir');
    const { provId, pedidoId, tipo = 'Remito', nroComp, cond, medio = 'Efectivo', actPrecio = true, fecha } = params;
    if (!prov(S, provId)) fail('Elegí el proveedor.');
    if (!CBTE_COMPRA.includes(tipo)) fail('Tipo de comprobante inválido.');
    if (!['cc', 'contado'].includes(cond)) fail('Contanos si la mercadería ya se pagó.');
    if (cond === 'contado' && !MEDIOS_PAGO.includes(medio)) fail('Elegí con qué pagaste.');
    const puedeCostos = can(u, 'compra.costos');
    const items = (params.items || []).filter((i) => U.num(i.cant) > 0).map((i) => {
      const p = prod(S, i.pid); if (!p) fail('Uno de los productos no existe.');
      const cant = r3(U.num(i.cant)); vCant(p, cant);
      let costo = U.toNum(i.costo); if (!puedeCostos || !isNum(costo)) costo = p.costo;
      if (costo < 0) fail(`El precio de compra de "${p.nombre}" no puede ser negativo.`);
      return { pid: p.id, nombre: p.nombre, cant, costo: r2(costo), iva: p.iva };
    });
    if (!items.length) fail('Escribí cuánto llegó de al menos un producto.');
    const c = buildCompra(S, { provId, tipo, nroComp: texto(nroComp, 30), cond, medio, items, fecha });
    if (cond === 'contado') requiereCajaEfectivo(S, [medio], opts, c.total, fecha);
    c.usuario = u.id; c.pedidoId = pedidoId || null;
    S.compras.push(c);
    items.forEach((i) => {
      const p = prod(S, i.pid);
      moverStock(S, u, { pid: i.pid, cant: i.cant, tipo: 'compra', motivo: `${(prov(S, provId) || {}).nombre} · ${tipo} ${c.nroComp}`, ref: { tipo: 'compra', id: c.id }, fecha: c.fecha });
      if (puedeCostos && i.costo > 0 && i.costo !== p.costo) {
        const antes = { costo: p.costo, precio: p.precio };
        p.costo = i.costo; if (actPrecio) p.precio = calcPrecio(p); else p.margen = margenDesde(p, p.precio);
        if (!(opts && opts.sinAudit)) audit(S, u, 'producto.costo', `${p.nombre}: costo ${U.f$(antes.costo)} → ${U.f$(p.costo)}${actPrecio ? `, precio ${U.f$(antes.precio)} → ${U.f$(p.precio)}` : ''}`, fecha);
      }
    });
    if (pedidoId) {
      const ped = S.pedidos.find((x) => x.id === pedidoId);
      if (ped) {
        items.forEach((i) => { const pi = ped.items.find((x) => x.pid === i.pid); if (pi) pi.recibido = r3(pi.recibido + i.cant); });
        ped.estado = ped.items.every((x) => x.recibido >= x.cant - 1e-9) ? 'recibido' : 'parcial';
        ped.compras = (ped.compras || []).concat(c.id);
      }
    }
    if (S.guia) S.guia.compra = true;
    return c;
  }
  function devolucionProveedor(S, u, { provId, items, modo, medio, motivo, fecha }) {
    need(u, 'devprov.crear');
    if (!prov(S, provId)) fail('Elegí el proveedor.');
    const mot = texto(motivo, 160); if (!mot) fail('Indicá el motivo de la devolución.');
    if (!['credito', 'reintegro'].includes(modo)) fail('Indicá si te descuentan de la deuda o te devuelven la plata.');
    if (modo === 'reintegro' && !MEDIOS_PAGO.includes(medio)) fail('Indicá cómo te devuelven la plata.');
    const its = (items || []).filter((i) => U.num(i.cant) > 0).map((i) => { const p = prod(S, i.pid); if (!p) fail('Producto inexistente.'); const cant = r3(U.num(i.cant)); vCant(p, cant); return { pid: p.id, nombre: p.nombre, cant, costo: p.costo, iva: p.iva }; });
    if (!its.length) fail('Elegí qué productos devolvés.');
    const total = r2(sum(its, (i) => i.costo * i.cant * (1 + i.iva / 100)));
    if (modo === 'credito' && total > saldoProv(S, provId) + 0.01) fail(`La devolución (${U.f$(total)}) supera lo que le debés al proveedor. Elegí "me devuelven la plata".`);
    if (modo === 'reintegro') requiereCajaEfectivo(S, [medio], null);
    const d = { id: uid(), fecha: now(fecha), usuario: u.id, provId, items: its, total, modo, medio: modo === 'reintegro' ? medio : '', motivo: mot };
    S.devprov.push(d);
    its.forEach((i) => moverStock(S, u, { pid: i.pid, cant: -i.cant, tipo: 'devprov', motivo: `${(prov(S, provId) || {}).nombre} · ${mot}`, ref: { tipo: 'devprov', id: d.id }, fecha: d.fecha }));
    audit(S, u, 'proveedor.devolucion', `${(prov(S, provId) || {}).nombre}: ${U.f$(total)} · ${mot}`, fecha);
    return d;
  }

  /* ---------- Reposición sugerida ---------- */
  /** Sugerencia calculada (no ejecuta nada): según stock mínimo, ventas de los últimos 30 días y lo ya pedido. */
  function sugerencias(S, ref) {
    const t1 = ref ? new Date(ref) : new Date(); const t0 = new Date(t1); t0.setDate(t0.getDate() - 30);
    const vend = {}; S.movimientos.forEach((m) => { if (m.tipo === 'venta') { const t = new Date(m.fecha); if (t >= t0 && t <= t1) vend[m.pid] = (vend[m.pid] || 0) - m.cant; } });
    S.movimientos.forEach((m) => { if (m.tipo === 'devolucion') { const t = new Date(m.fecha); if (t >= t0 && t <= t1) vend[m.pid] = (vend[m.pid] || 0) - m.cant; } });
    const out = [];
    S.productos.filter((p) => p.activo !== false).forEach((p) => {
      const pv = prov(S, p.provId) || { entrega: 2 };
      const diaria = Math.max(0, (vend[p.id] || 0) / 30);
      const pedido = pendientePedido(S, p.id);
      const disponible = p.stock + pedido;
      const objetivo = Math.max(p.stockMin * 2, diaria * ((pv.entrega || 2) + (S.config.diasCobertura || 14)));
      const diasCobertura = diaria > 0 ? p.stock / diaria : Infinity;
      const necesita = p.stock <= p.stockMin || diasCobertura < (pv.entrega || 2) + 3;
      if (!necesita) return;
      let cant = objetivo - disponible; if (cant <= 0) { if (pedido > 0) out.push({ p, cant: 0, diaria, pedido, diasCobertura, ya: true }); return; }
      cant = p.unidad === 'kg' ? Math.ceil(cant) : Math.ceil(cant);
      out.push({ p, cant, diaria, pedido, diasCobertura, ya: false });
    });
    return out;
  }

  /* ---------- Usuarios ---------- */
  async function hashPin(pin, salt) { return U.sha256(salt + ':' + pin); }
  function guardarUsuario(S, u, d, pinHash, salt) {
    need(u, 'usuarios.editar');
    const nombre = texto(d.nombre, 60); if (!nombre) fail('Escribí el nombre.');
    if (!ROLES[d.rol]) fail('Elegí un rol.');
    if (d.id) {
      const x = usuario(S, d.id); if (!x) fail('El usuario no existe.');
      if (x.rol === 'admin' && d.rol !== 'admin' && S.usuarios.filter((y) => y.rol === 'admin' && y.activo !== false).length <= 1) fail('Tiene que quedar al menos un administrador.');
      Object.assign(x, { nombre, rol: d.rol }); if (pinHash !== undefined) { x.pinHash = pinHash; x.salt = salt; }
      audit(S, u, 'usuario.editar', `${nombre} (${ROLES[d.rol]})`); return x;
    }
    const x = { id: uid(), nombre, rol: d.rol, pinHash: pinHash || null, salt: salt || null, activo: true };
    S.usuarios.push(x); audit(S, u, 'usuario.alta', `${nombre} (${ROLES[d.rol]})`); return x;
  }
  function desactivarUsuario(S, u, id, activo) {
    need(u, 'usuarios.editar');
    const x = usuario(S, id); if (!x) fail('El usuario no existe.');
    if (x.id === u.id && !activo) fail('No podés desactivar tu propio usuario.');
    if (!activo && x.rol === 'admin' && S.usuarios.filter((y) => y.rol === 'admin' && y.activo !== false).length <= 1) fail('Tiene que quedar al menos un administrador.');
    x.activo = !!activo; audit(S, u, activo ? 'usuario.activar' : 'usuario.desactivar', x.nombre); return x;
  }
  function guardarConfig(S, u, d) {
    need(u, 'config.editar');
    const c = S.config;
    const nombre = texto(d.nombre, 80); if (!nombre) fail('Escribí el nombre del comercio.');
    const cuit = texto(d.cuit, 20); if (cuit && !U.cuitValido(cuit)) fail('El CUIT del comercio no es válido.');
    const pv = Math.round(U.num(d.pv)); if (pv < 1 || pv > 99998) fail('El punto de venta tiene que estar entre 1 y 99998.');
    const desc = U.toNum(d.descMaxVendedor); if (!isNum(desc) || desc < 0 || desc > 100) fail('El descuento máximo tiene que estar entre 0 y 100.');
    const ancho = +d.ticketAncho === 58 ? 58 : 80;
    Object.assign(c, {
      nombre, razon: texto(d.razon, 120), cuit: cuit ? U.fmtCuit(cuit) : '', iibb: texto(d.iibb, 30), domicilio: texto(d.domicilio, 120),
      inicio: d.inicio || c.inicio, condIva: d.condIva === 'RI' ? 'RI' : 'MONO', pv, letra: d.letra === 'grande' ? 'grande' : 'normal',
      stockNegativo: !!d.stockNegativo, descMaxVendedor: desc, pedirUsuario: !!d.pedirUsuario,
      ticket: { ancho, auto: !!d.ticketAuto, pie: texto(d.ticketPie, 120) },
      balanza: { activa: !!d.balanzaActiva, prefijo: /^\d{1,2}$/.test(d.balanzaPrefijo || '') ? d.balanzaPrefijo : '20', digitosPlu: [4, 5, 6].includes(+d.balanzaPlu) ? +d.balanzaPlu : 5, tipo: d.balanzaTipo === 'precio' ? 'precio' : 'peso' }
    });
    audit(S, u, 'config.editar', 'Datos del comercio y preferencias');
    return c;
  }

  /* ---------- Código de barras de balanza ---------- */
  /** Verifica el dígito de control de un EAN-13. */
  function ean13Valido(s) {
    if (!/^\d{13}$/.test(s)) return false;
    let t = 0; for (let i = 0; i < 12; i++) t += +s[i] * (i % 2 ? 3 : 1);
    return (10 - (t % 10)) % 10 === +s[12];
  }
  /**
   * Etiquetas de balanza (Kretz, Systel, etc.): EAN-13 que empieza con el prefijo configurado,
   * seguido del PLU, el peso en gramos (o el importe en centavos) y el dígito verificador.
   * Ej. con prefijo 20 y PLU de 5 dígitos: 20 00014 01250 C → PLU 00014, 1,250 kg.
   */
  function leerBalanza(S, code) {
    const b = S.config.balanza || {}; if (!b.activa) return null;
    const s = String(code || '').trim(); if (!ean13Valido(s) || !s.startsWith(b.prefijo)) return null;
    const pl = b.digitosPlu || 5; const plu = s.slice(b.prefijo.length, b.prefijo.length + pl);
    const valor = s.slice(b.prefijo.length + pl, 12);
    const p = S.productos.find((x) => x.activo !== false && x.plu && x.plu.padStart(pl, '0') === plu);
    if (!p) return null;
    let cant;
    if (b.tipo === 'precio') { const importe = +valor / 100; cant = p.precio > 0 ? r3(importe / p.precio) : 0; }
    else cant = r3(+valor / 1000);
    if (!(cant > 0)) return null;
    return { p, cant };
  }

  M.D = {
    SCHEMA, DomainError, fail, TIPOS, MEDIOS, MEDIOS_PAGO, ML, COND, GASTO_CATS, CBTE_COMPRA, MOV_TIPOS, MOTIVOS_MERMA, ROLES, PERMS, can, need,
    prod, prov, cli, usuario, uNombre, emptyState, tx, audit, calcPrecio, margenDesde, moverStock, stockState, lowStock,
    crearProducto, editarProducto, archivarProducto, ajustarStock, aumentoMasivo,
    cajaAbierta, abrirCaja, cerrarCaja, cajaEsperado, movimientosDinero, movimientoCaja,
    tiposPermitidos, autoTipo, calcVenta, registrarVenta, medioVenta, devolverVenta, totalDevuelto,
    saldoProv, saldoCli, guardarCliente, guardarProveedor, pagarProveedor, cobrarCliente,
    registrarGasto, anularGasto, crearPedido, cancelarPedido, pendientePedido, recibirCompra, devolucionProveedor, buildCompra,
    sugerencias, hashPin, guardarUsuario, desactivarUsuario, guardarConfig, leerBalanza, ean13Valido
  };
})(typeof window !== 'undefined' ? window : globalThis);
