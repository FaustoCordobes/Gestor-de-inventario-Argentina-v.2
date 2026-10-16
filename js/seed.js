/* Mostrador · seed.js
 * Genera los datos de ejemplo del MODO DEMOSTRACIÓN: un almacén ficticio con un
 * año de actividad. Usa las mismas funciones de negocio que la app (ventas,
 * compras, caja, devoluciones), así el kardex y la caja quedan consistentes.
 * Todos los nombres, CUIT y montos son inventados.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D;

  function cuit(pref, mid) { for (let k = 0; k < 10; k++) { const base = pref + String(mid + k).padStart(8, '0'); const c = U.cuitConDV(base); if (c) return c; } return ''; }

  function seed(opts) {
    const R = U.rng((opts && opts.semilla) || 20261014);
    const S = D.emptyState('demo');
    const nowD = new Date();
    const at = (daysAgo, h, m) => { const d = new Date(nowD); d.setDate(d.getDate() - daysAgo); d.setHours(h, m || 0, 0, 0); return d.toISOString(); };
    const pick = (a) => a[Math.floor(R() * a.length)];
    const quiet = (fn) => { try { return fn(); } catch (e) { if (!(e instanceof D.DomainError)) throw e; return null; } };

    Object.assign(S.config, { nombre: 'Almacén La Vertiente', razon: 'La Vertiente S.R.L.', cuit: cuit('30', 71234560), iibb: '30-71234567', domicilio: 'Av. San Martín 1250', inicio: '2019-03-01', condIva: 'RI', pv: 3 });

    // Usuarios de ejemplo (sin PIN en la demo)
    const mk = (nombre, rol) => { const x = { id: U.uid(), nombre, rol, pinHash: null, salt: null, activo: true }; S.usuarios.push(x); return x; };
    const ADM = mk('Marta (dueña)', 'admin'), ENC = mk('Rosa', 'encargado'), VEN = mk('Lucas', 'vendedor'); mk('Nico', 'deposito');

    const PV = [
      ['Distribuidora del Valle S.A.', cuit('30', 70985210), 'Almacén seco', 'Martín Ferreyra', '2944 41-2233', 15, 3],
      ['Bebidas Patagónicas S.R.L.', cuit('30', 71458720), 'Bebidas', 'Carla Ibáñez', '2942 48-1190', 7, 2],
      ['Lácteos La Serena S.A.', cuit('30', 69874520), 'Lácteos y frescos', 'Diego Sosa', '299 455-7812', 10, 2],
      ['Limpieza Total S.R.L.', cuit('30', 71236980), 'Limpieza y perfumería', 'Romina Paz', '2944 43-0021', 30, 4],
      ['Frutihortícola Sur', cuit('20', 28456780), 'Verdulería', 'Hugo Ríos', '2972 42-5566', 0, 1]
    ].map(([nombre, c, rubro, contacto, tel, plazo, entrega]) => D.guardarProveedor(S, ADM, { nombre, cuit: c, rubro, contacto, tel, plazo, entrega }));

    const C1 = D.guardarCliente(S, ADM, { nombre: 'Hostería El Mirador S.R.L.', condIva: 'RI', cuit: cuit('30', 71598740), tel: '2972 41-8890' });
    const C2 = D.guardarCliente(S, ADM, { nombre: 'Laura Méndez', condIva: 'MONO', cuit: cuit('27', 32145690), tel: '2972 15-443322' });
    const C3 = D.guardarCliente(S, ADM, { nombre: 'Club Deportivo Andino', condIva: 'EX', cuit: cuit('30', 68741230), tel: '2972 42-1010' });

    // [código, nombre, categoría, proveedor, costo actual, margen, iva, stock mínimo, unidad, PLU]
    const P = [
      ['7790387000012', 'Yerba mate 1 kg', 'Almacén', 0, 3200, 35, 21, 15, 'u'], ['7790070411235', 'Fideos tallarín 500 g', 'Almacén', 0, 780, 40, 21, 20, 'u'],
      ['7790060023451', 'Arroz largo fino 1 kg', 'Almacén', 0, 1150, 38, 21, 15, 'u'], ['7790272001128', 'Aceite de girasol 1,5 L', 'Almacén', 0, 2600, 30, 21, 12, 'u'],
      ['7790150004410', 'Azúcar 1 kg', 'Almacén', 0, 950, 35, 21, 15, 'u'], ['7790080033127', 'Harina 000 1 kg', 'Almacén', 0, 620, 40, 21, 12, 'u'],
      ['7790036021548', 'Puré de tomate 520 g', 'Almacén', 0, 540, 45, 21, 20, 'u'], ['7790045812369', 'Galletitas dulces 300 g', 'Kiosco', 0, 820, 45, 21, 20, 'u'],
      ['7790895000997', 'Gaseosa cola 2,25 L', 'Bebidas', 1, 2100, 35, 21, 24, 'u'], ['7798062541120', 'Agua mineral 2 L', 'Bebidas', 1, 780, 50, 21, 24, 'u'],
      ['7792798007387', 'Cerveza lata 473 ml', 'Bebidas', 1, 1150, 40, 21, 36, 'u'], ['7790290000417', 'Jugo en polvo 18 g', 'Bebidas', 1, 240, 60, 21, 30, 'u'],
      ['7793940001234', 'Alfajor triple', 'Kiosco', 1, 620, 55, 21, 30, 'u'], ['7790742000512', 'Leche entera 1 L', 'Lácteos', 2, 1050, 30, 21, 24, 'u'],
      ['7790742110228', 'Yogur bebible 1 L', 'Lácteos', 2, 1500, 35, 21, 10, 'u'], ['2000001000014', 'Queso cremoso x kg', 'Lácteos', 2, 6800, 35, 21, 4, 'kg', '00001'],
      ['7790742330121', 'Manteca 200 g', 'Lácteos', 2, 1900, 35, 21, 8, 'u'], ['7790742440011', 'Huevos maple x 12', 'Almacén', 2, 2900, 25, 10.5, 10, 'u'],
      ['7793253000113', 'Lavandina 1 L', 'Limpieza', 3, 520, 50, 21, 12, 'u'], ['7791290012584', 'Detergente 750 ml', 'Limpieza', 3, 1350, 45, 21, 12, 'u'],
      ['7790250097321', 'Papel higiénico x 4', 'Limpieza', 3, 1650, 40, 21, 10, 'u'], ['7791293008741', 'Jabón de tocador 90 g', 'Perfumería', 3, 700, 50, 21, 10, 'u'],
      ['2000001000038', 'Papa x kg', 'Verdulería', 4, 650, 45, 10.5, 15, 'kg', '00003'], ['2000001000045', 'Manzana roja x kg', 'Verdulería', 4, 1400, 45, 10.5, 10, 'kg', '00004']
    ];
    const INFL = 0.025; // 2,5% mensual de ejemplo
    const f0 = Math.pow(1 + INFL, -12);
    const inicio = at(366, 8, 0);
    const prods = P.map((a) => D.crearProducto(S, ADM, { codigo: a[0], nombre: a[1], categoria: a[2], provId: PV[a[3]].id, costo: U.r2(a[4] * f0), margen: a[5], iva: a[6], stockMin: a[7], unidad: a[8], plu: a[9] || '', stock: a[8] === 'kg' ? a[7] * 4 : a[7] * 3 + 12 }, inicio));
    const byName = (n) => prods.find((p) => p.nombre.startsWith(n));
    // Productos que este mes no se repusieron (para mostrar alertas de stock en la demo)
    const sinReponer = ['Harina', 'Jugo en polvo', 'Manteca', 'Papel higiénico'].map((n) => byName(n).id);
    const target = (p) => (p.unidad === 'kg' ? p.stockMin * 9 : p.stockMin * 5 + 40);
    const deudas = []; // compras en cuenta corriente para pagar al vencimiento

    for (let d = 365; d >= 0; d--) {
      const fd = new Date(at(d, 12)); const mo = fd.getMonth(); const dom = fd.getDate();
      if (dom === 1 && d < 365) D.aumentoMasivo(S, ADM, { alcance: 'todos', pct: INFL * 100, redondeo: 10, fecha: at(d, 7, 30) });
      const ahora = new Date();
      const apertura = d === 0 ? new Date(Math.min(new Date(at(0, 8, 30)).getTime(), ahora.getTime() - 5 * 60000)).toISOString() : at(d, 8, 30);
      D.abrirCaja(S, d % 3 ? VEN : ENC, { monto: 20000, fecha: apertura });

      // Compras: cada proveedor tiene su día del mes
      PV.forEach((pv, ix) => {
        if (dom !== 3 + ix * 5) return;
        const items = prods.filter((p) => p.provId === pv.id && !(d < dom && sinReponer.includes(p.id))).map((p) => {
          let cant = target(p) - p.stock; if (cant <= 0) return null;
          cant = p.unidad === 'kg' ? Math.ceil(cant / 5) * 5 : Math.ceil(cant / 6) * 6;
          return { pid: p.id, cant, costo: p.costo };
        }).filter(Boolean);
        if (!items.length) return;
        const reciente = d <= 40;
        const efectivo = pv.nombre.startsWith('Frutihort');
        const c = D.recibirCompra(S, ENC, { provId: pv.id, tipo: efectivo ? 'Factura C' : 'Factura A', nroComp: String(1 + ix).padStart(5, '0') + '-' + String(Math.floor(R() * 99999)).padStart(8, '0'), cond: reciente && !efectivo ? 'cc' : 'contado', medio: 'Transferencia', items, actPrecio: true, fecha: at(d, 10, 30) }, { sinAudit: true });
        if (c.cond === 'cc') deudas.push({ provId: pv.id, total: c.total, vence: d - pv.plazo });
      });

      // Pago a proveedores al vencimiento (los más recientes quedan como deuda)
      deudas.filter((x) => !x.pagado && x.vence === d && d > 6).forEach((x) => { x.pagado = true; quiet(() => D.pagarProveedor(S, ENC, { provId: x.provId, monto: Math.min(x.total, D.saldoProv(S, x.provId)), medio: 'Transferencia', fecha: at(d, 11, 15) })); });

      // Gastos del mes
      const g = (cat, det, monto, medio) => D.registrarGasto(S, ENC, { categoria: cat, detalle: det, monto: U.r2(monto * Math.pow(1 + INFL, -d / 30)), medio, fecha: at(d, 9, 15) });
      if (dom === 5) g('Alquiler', 'Alquiler del local', 380000, 'Transferencia');
      if (dom === 10) g('Impuestos y tasas', 'Tasa municipal comercio', 21300, 'Transferencia');
      if (dom === 12) g('Luz, gas, internet', 'Electricidad', 62000 + R() * 15000, 'Transferencia');
      if (dom === 15 || dom === 28) g('Sueldos', 'Sueldo empleado (quincena)', 230000, 'Transferencia');
      if (dom === 18) g('Luz, gas, internet', 'Internet y teléfono', 24900, 'Débito');
      if (dom === 20) quiet(() => g('Insumos del local', 'Bolsas y rollos de ticket', 9000 + R() * 8000, 'Efectivo'));
      if (d === 7) g('Arreglos', 'Arreglo heladera exhibidora', 55000, 'Transferencia');

      // Ventas del día
      const temporada = mo === 0 || mo === 1 || mo === 6 || mo === 11 ? 3 : mo === 4 || mo === 5 ? -1 : 0;
      const n = Math.max(3, 7 + Math.floor(R() * 7) + temporada + (fd.getDay() === 6 ? 3 : 0));
      const horas = []; for (let i = 0; i < n; i++) horas.push([9 + Math.floor(R() * 12), Math.floor(R() * 60)]);
      horas.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [h, mi] of horas) {
        const fecha = at(d, h, mi); if (new Date(fecha) > ahora) continue;
        const r = R(); let cliId = 'c0', medio = (() => { const x = R(); return x < 0.4 ? 'Efectivo' : x < 0.65 ? 'Débito' : x < 0.75 ? 'Crédito' : x < 0.95 ? 'Mercado Pago' : 'Transferencia'; })();
        let mult = 1;
        if (r < 0.06) { cliId = C1.id; medio = R() < 0.6 ? 'Cuenta corriente' : 'Transferencia'; mult = 4; } else if (r < 0.1) cliId = C2.id; else if (r < 0.12) cliId = C3.id;
        const k = 2 + Math.floor(R() * 4); const used = new Set(); const items = [];
        for (let j = 0; j < k; j++) {
          const p = pick(prods); if (used.has(p.id)) continue; used.add(p.id);
          let cant = (p.unidad === 'kg' ? Math.round((0.5 + R() * 1.5) * 4) / 4 : 1 + Math.floor(R() * 4)) * mult;
          if (cant > p.stock) cant = p.unidad === 'kg' ? U.r3(p.stock) : Math.floor(p.stock);
          if (cant > 0) items.push({ pid: p.id, cant });
        }
        if (!items.length) continue;
        const tot = D.calcVenta(S, items.map((i) => { const p = D.prod(S, i.pid); return { ...i, precio: p.precio, costo: p.costo, iva: p.iva }; }), 0).total;
        const efectivo = medio === 'Efectivo';
        const recibido = efectivo ? Math.ceil(tot / 1000) * 1000 : null;
        quiet(() => D.registrarVenta(S, d % 4 === 0 ? ADM : VEN, { items, clienteId: cliId, pagos: [{ medio, monto: tot }], recibido, fecha }));
      }

      // Algunos movimientos especiales para que la demo muestre todo
      if (d === 9) quiet(() => D.ajustarStock(S, ENC, { pid: byName('Papel').id, tipo: 'merma', cant: 1, motivo: 'Roto o dañado' }));
      if (d === 4) quiet(() => D.ajustarStock(S, ENC, { pid: byName('Yogur').id, tipo: 'merma', cant: 2, motivo: 'Vencido' }));
      if (d === 6) { const p = byName('Galletitas'); quiet(() => D.ajustarStock(S, ENC, { pid: p.id, tipo: 'conteo', cant: Math.max(0, p.stock - 2), motivo: 'Diferencia en el conteo mensual' })); }
      if (d === 3) { const v = S.ventas.filter((x) => U.dkey(x.fecha) === U.dkey(at(3, 12)) && x.pagos[0].medio === 'Efectivo' && x.items[0].cant >= 1)[0]; if (v) quiet(() => D.devolverVenta(S, ENC, { ventaId: v.id, items: [{ idx: 0, cant: 1 }], motivo: 'Producto en mal estado', medio: 'Efectivo', fecha: at(3, 19, 10) })); }
      if (d === 11) { const v = S.ventas.filter((x) => U.dkey(x.fecha) === U.dkey(at(11, 12)) && x.pagos[0].medio === 'Débito')[0]; if (v) quiet(() => D.devolverVenta(S, ADM, { ventaId: v.id, items: v.items.map((it, idx) => ({ idx, cant: it.cant })), motivo: 'Venta cargada por error', medio: 'Débito', fecha: at(11, 18, 40) })); }
      if (d === 1) quiet(() => D.devolucionProveedor(S, ENC, { provId: PV[2].id, items: [{ pid: byName('Yogur').id, cant: 2 }], modo: 'credito', motivo: 'Llegaron vencidos', fecha: at(1, 12, 0) }));
      if (d % 20 === 10 && d > 0) { const s = D.saldoCli(S, C1.id); if (s > 0) quiet(() => D.cobrarCliente(S, ENC, { cliId: C1.id, monto: U.r2(s * 0.6), medio: 'Transferencia', fecha: at(d, 16, 0) })); }

      // Fin del día: retiro para el banco los sábados y cierre de caja
      if (d > 0) {
        const c = D.cajaAbierta(S);
        if (fd.getDay() === 6) { const disp = D.cajaEsperado(S, { abre: c.abre, cierra: { fecha: at(d, 21, 0) } }); if (disp > 60000) quiet(() => D.movimientoCaja(S, ENC, { tipo: 'retiro', monto: Math.floor((disp - 20000) / 1000) * 1000, motivo: 'Depósito en el banco', fecha: at(d, 21, 0) })); }
        const esp = D.cajaEsperado(S, { abre: c.abre, cierra: { fecha: at(d, 21, 45) } });
        let contado = esp, motivo = '';
        if (d === 2) { contado = esp - 1500; motivo = 'Se dio mal un vuelto'; } else if (d === 17) { contado = esp + 500; motivo = 'Cliente dejó el cambio'; }
        D.cerrarCaja(S, d % 3 ? VEN : ENC, { contado, motivo, fecha: at(d, 21, 45) });
      }
    }

    // Pedido pendiente a un proveedor (para mostrar el circuito de pedidos)
    const pend = D.sugerencias(S).filter((x) => x.p.provId === PV[3].id && x.cant > 0);
    if (pend.length) D.crearPedido(S, ENC, { provId: PV[3].id, items: pend.map((x) => ({ pid: x.p.id, cant: x.cant })), nota: 'Pedido por WhatsApp a Romina', fecha: new Date(Math.min(new Date(at(0, 9, 0)).getTime(), Date.now() - 60000)).toISOString() });

    S.guia = { venta: false, compra: false, cierre: false, oculta: false };
    return S;
  }

  M.seed = seed;
})(typeof window !== 'undefined' ? window : globalThis);
