/* Mostrador · ui/contactos.js
 * Proveedores (deuda, pagos, devoluciones de mercadería) y clientes (fiado,
 * cobros, recordatorios).
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI, R = M.R;
  const { esc, f$, fn } = U;
  const { APP, ic, opt, mHead, head, $ } = UI;
  const S = () => APP.S;

  /* ---------- Proveedores ---------- */
  function vProv() {
    if (!UI.can('proveedor.ver')) return head('Proveedores', 'Tu usuario no tiene acceso a esta sección.');
    const deudas = R.deudaProveedores(S());
    return head('Proveedores', 'Cuánto le debés a cada uno, cuándo vence y cómo contactarlos.', UI.can('proveedor.editar') ? `<button class="btn primary" data-act="provnew">${ic('plus')}Agregar proveedor</button>` : '', 'proveedores') +
      `<div class="cards">${S().proveedores.map((p) => {
        const s = D.saldoProv(S(), p.id); const ds = deudas.filter((d) => d.pv.id === p.id); const venc = ds.filter((d) => d.vencida);
        return `<div class="pcard"><div class="top"><div><h3>${esc(p.nombre)}</h3><div class="meta">${esc(p.rubro)}${p.cuit ? ' · CUIT ' + esc(p.cuit) : ''}</div></div><span class="pill ${s > 0 ? (venc.length ? 'bad' : 'warn') : 'ok'}">${s > 0 ? 'Le debés ' + f$(s) : 'No le debés'}</span></div>
          <div class="meta">${esc(p.contacto)}${p.tel ? ' · ' + esc(p.tel) : ''}<br>${p.plazo ? 'Te da ' + p.plazo + ' días para pagar' : 'Se le paga al contado'} · entrega en ${p.entrega || 0} días${venc.length ? `<br><b style="color:var(--bad)">${venc.length} factura${venc.length > 1 ? 's' : ''} vencida${venc.length > 1 ? 's' : ''}: ${f$(U.sum(venc, 'resta'))}</b>` : ds.length ? `<br>Próximo vencimiento: ${U.fD(ds[0].vence)}` : ''}</div>
          <div class="acts">${s > 0 && UI.can('proveedor.pagar') ? `<button class="btn primary sm" data-act="pagoprov" data-id="${p.id}">Pagar</button>` : ''}<button class="btn sm" data-act="ctaprov" data-id="${p.id}">Ver cuenta</button>${UI.can('devprov.crear') ? `<button class="btn sm" data-act="devprov" data-id="${p.id}">${ic('back')}Devolver mercadería</button>` : ''}${UI.can('proveedor.editar') ? `<button class="btn sm ghost" data-act="provedit" data-id="${p.id}">Editar datos</button>` : ''}</div></div>`;
      }).join('') || '<div class="empty">Todavía no cargaste proveedores.</div>'}</div>`;
  }
  function provForm(p) {
    const isNew = !p; p = p || { id: '', nombre: '', cuit: '', rubro: '', contacto: '', tel: '', plazo: 15, entrega: 2 };
    UI.openModal(mHead(isNew ? 'Agregar proveedor' : 'Datos del proveedor') + `<form data-form="prov" data-id="${p.id}"><div class="mb"><div class="form">
      <div class="field full"><label for="v-n">Nombre o razón social</label><input id="v-n" name="nombre" type="text" required maxlength="120" value="${esc(p.nombre)}" autofocus></div>
      <div class="field"><label for="v-ct">Persona de contacto</label><input id="v-ct" name="contacto" type="text" maxlength="80" value="${esc(p.contacto)}"></div>
      <div class="field"><label for="v-t">Teléfono / WhatsApp</label><input id="v-t" name="tel" type="tel" maxlength="40" value="${esc(p.tel)}"></div>
      <div class="field"><label for="v-r">¿Qué te vende?</label><input id="v-r" name="rubro" type="text" maxlength="80" value="${esc(p.rubro)}" placeholder="Ej.: Bebidas"></div>
      <div class="field"><label for="v-p">Días para pagarle</label><input id="v-p" name="plazo" type="number" min="0" max="365" value="${p.plazo}" inputmode="numeric"></div>
      <div class="field"><label for="v-e">Días que tarda en entregar</label><input id="v-e" name="entrega" type="number" min="0" max="120" value="${p.entrega || 0}" inputmode="numeric"><span class="hint">Se usa para sugerir cuánto pedir</span></div>
      <div class="field"><label for="v-c">CUIT</label><input id="v-c" name="cuit" type="text" class="mono" placeholder="30-00000000-0" value="${esc(p.cuit)}" inputmode="numeric"></div>
      </div></div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
  }
  let dpDraft = null;
  function devProvForm(provId) {
    const pv = D.prov(S(), provId); dpDraft = { provId, modo: D.saldoProv(S(), provId) > 0 ? 'credito' : 'reintegro' };
    const prods = S().productos.filter((p) => p.provId === provId && p.activo !== false && p.stock > 0);
    UI.openModal(mHead('Devolver mercadería al proveedor', esc(pv.nombre)) + `<form data-form="devprov"><div class="mb">
      <p class="muted" style="margin:0">Se descuenta del stock y queda registrado. Elegí si el proveedor te lo descuenta de la deuda o te devuelve la plata.</p>
      <div class="tw"><table><thead><tr><th>Producto</th><th class="n">Tenés</th><th class="n">Devolvés</th></tr></thead><tbody>${prods.map((p) => `<tr><td>${esc(p.nombre)}<span class="sub">Costo ${f$(p.costo)} + IVA</span></td><td class="n">${fn(p.stock)}</td><td class="n"><input type="number" min="0" max="${p.stock}" step="${p.unidad === 'kg' ? '0.05' : '1'}" value="0" id="dp-${p.id}" data-dp="${p.id}" inputmode="decimal" aria-label="Cantidad a devolver de ${esc(p.nombre)}" style="width:90px"></td></tr>`).join('') || '<tr><td colspan="3" class="empty">No hay productos de este proveedor con stock.</td></tr>'}</tbody></table></div>
      <div class="field"><span class="lb">¿Cómo se compensa?</span><div class="choices" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><button type="button" class="choice" data-act="dpmodo" data-v="credito" aria-pressed="${dpDraft.modo === 'credito'}">Me lo descuenta de la deuda</button><button type="button" class="choice" data-act="dpmodo" data-v="reintegro" aria-pressed="${dpDraft.modo === 'reintegro'}">Me devuelve la plata</button></div></div>
      <div class="field" id="dp-medio-f" ${dpDraft.modo === 'reintegro' ? '' : 'hidden'}><label for="dp-medio">¿Cómo te la devuelve?</label><select id="dp-medio" name="medio">${D.MEDIOS_PAGO.map((m) => opt(m, m, 'Transferencia')).join('')}</select></div>
      <div class="field"><label for="dp-mot">Motivo</label><input id="dp-mot" name="motivo" type="text" required maxlength="160" list="dl-dpm" placeholder="Ej.: llegaron vencidos"><datalist id="dl-dpm"><option value="Llegaron vencidos"><option value="Llegaron rotos"><option value="No era lo pedido"><option value="Sobrante del pedido"></datalist></div>
      </div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Registrar devolución</button></div></form>`, true);
  }

  /* ---------- Clientes ---------- */
  function vCli() {
    if (!UI.can('cliente.ver')) return head('Clientes y fiado', 'Tu usuario no tiene acceso a esta sección.');
    const cs = S().clientes.filter((c) => !c.fijo);
    return head('Clientes y fiado', 'Clientes frecuentes, los que te piden Factura A y lo que te deben.', UI.can('cliente.editar') ? `<button class="btn primary" data-act="clinew">${ic('plus')}Agregar cliente</button>` : '', 'clientes') +
      `<div class="cards">${cs.map((c) => { const s = D.saldoCli(S(), c.id); return `<div class="pcard"><div class="top"><div><h3>${esc(c.nombre)}</h3><div class="meta">${esc(D.COND[c.condIva])}${c.cuit ? ' · CUIT ' + esc(c.cuit) : ''}</div></div><span class="pill ${s > 0 ? 'warn' : 'ok'}">${s > 0 ? 'Te debe ' + f$(s) : 'Al día'}</span></div>
        <div class="meta">${esc(c.tel || 'Sin teléfono')}</div>
        <div class="acts">${s > 0 && UI.can('cliente.cobrar') ? `<button class="btn primary sm" data-act="cobrocli" data-id="${c.id}">Cobrar</button><button class="btn sm" data-act="recordatorio" data-id="${c.id}">${ic('copy')}Recordarle</button>` : ''}<button class="btn sm" data-act="ctacli" data-id="${c.id}">Ver cuenta</button>${UI.can('cliente.editar') ? `<button class="btn sm ghost" data-act="cliedit" data-id="${c.id}">Editar datos</button>` : ''}</div></div>`; }).join('') || '<div class="empty">Todavía no agregaste clientes.</div>'}</div>
      <p class="hint" style="margin:0">A las ventas comunes no hace falta ponerles cliente: salen como Consumidor Final.</p>`;
  }
  function cliForm(c) {
    const isNew = !c; c = c || { id: '', nombre: '', condIva: 'CF', cuit: '', tel: '' };
    UI.openModal(mHead(isNew ? 'Agregar cliente' : 'Datos del cliente') + `<form data-form="cli" data-id="${c.id}"><div class="mb"><div class="form">
      <div class="field full"><label for="k-n">Nombre</label><input id="k-n" name="nombre" type="text" required maxlength="120" value="${esc(c.nombre)}" autofocus></div>
      <div class="field"><label for="k-t">Teléfono / WhatsApp</label><input id="k-t" name="tel" type="tel" maxlength="40" value="${esc(c.tel)}"></div>
      <div class="field"><label for="k-c">¿Qué es frente al IVA?</label><select id="k-c" name="condIva">${['CF', 'RI', 'MONO', 'EX'].map((k) => opt(k, D.COND[k], c.condIva)).join('')}</select></div>
      <div class="field"><label for="k-cu">CUIT o DNI</label><input id="k-cu" name="cuit" type="text" class="mono" value="${esc(c.cuit)}" inputmode="numeric"></div>
      <p class="hint full">Si te pide Factura A, elegí Responsable Inscripto y cargá su CUIT (se verifica el dígito verificador).</p>
      </div></div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
  }

  /* ---------- Cuenta corriente y pagos ---------- */
  function cuenta(kind, id) {
    const isP = kind === 'prov'; const ent = isP ? D.prov(S(), id) : D.cli(S(), id);
    const mov = isP
      ? [...S().compras.filter((c) => c.provId === id && c.cond === 'cc').map((c) => ({ f: c.fecha, t: `Mercadería (${c.items.length} productos) · ${c.tipo} ${c.nroComp}`, d: c.total, h: 0 })), ...S().pagos.filter((x) => x.provId === id).map((x) => ({ f: x.fecha, t: 'Pago con ' + x.medio + ' · ' + D.uNombre(S(), x.usuario), d: 0, h: x.monto })), ...S().devprov.filter((x) => x.provId === id && x.modo === 'credito').map((x) => ({ f: x.fecha, t: 'Devolución de mercadería · ' + x.motivo, d: 0, h: x.total }))]
      : [...S().ventas.filter((v) => v.clienteId === id).map((v) => ({ v, monto: U.sum(v.pagos.filter((p) => p.medio === 'Cuenta corriente'), 'monto') })).filter((x) => x.monto > 0).map(({ v, monto }) => ({ f: v.fecha, t: `Compra fiada · N° ${v.nro}`, d: monto, h: 0 })), ...S().cobros.filter((x) => x.cliId === id).map((x) => ({ f: x.fecha, t: 'Pagó con ' + x.medio, d: 0, h: x.monto })), ...S().devoluciones.filter((x) => x.clienteId === id && x.reintegro.medio === 'Cuenta corriente').map((x) => ({ f: x.fecha, t: 'Devolución N° ' + x.nro, d: 0, h: x.total }))];
    mov.sort((a, b) => (a.f < b.f ? -1 : 1)); let s = 0; const saldo = isP ? D.saldoProv(S(), id) : D.saldoCli(S(), id);
    UI.openModal(mHead(esc(ent.nombre), isP ? (saldo > 0 ? 'Le debés ' + f$(saldo) : 'No le debés nada') : saldo > 0 ? 'Te debe ' + f$(saldo) : 'No te debe nada') + `<div class="mb"><div class="tw"><table><thead><tr><th>Fecha</th><th>Qué pasó</th><th class="n">${isP ? 'Le debés' : 'Te debe'}</th></tr></thead><tbody>${mov.map((m) => { s += m.d - m.h; return `<tr><td>${U.fD(m.f)}</td><td>${esc(m.t)}<span class="sub">${m.d ? '+ ' + f$(m.d) : '− ' + f$(m.h)}</span></td><td class="n"><b>${f$(s)}</b></td></tr>`; }).join('') || '<tr><td colspan="3" class="empty">No hay movimientos.</td></tr>'}</tbody></table></div></div>
      <div class="mf">${!isP && saldo > 0 ? `<button class="btn sp" data-act="recordatorio" data-id="${id}">${ic('copy')}Recordarle</button>` : ''}${saldo > 0 && UI.can(isP ? 'proveedor.pagar' : 'cliente.cobrar') ? `<button class="btn primary" data-act="${isP ? 'pagoprov' : 'cobrocli'}" data-id="${id}">${isP ? 'Pagar' : 'Cobrar'}</button>` : '<button class="btn primary" data-act="close">Cerrar</button>'}</div>`, true);
  }
  function pagoForm(kind, id) {
    const isP = kind === 'prov'; const ent = isP ? D.prov(S(), id) : D.cli(S(), id); const s = isP ? D.saldoProv(S(), id) : D.saldoCli(S(), id);
    UI.openModal(mHead(isP ? 'Pagarle a ' + esc(ent.nombre) : 'Cobrarle a ' + esc(ent.nombre), isP ? 'Le debés ' + f$(s) : 'Te debe ' + f$(s)) + `<form data-form="pago" data-kind="${kind}" data-id="${id}"><div class="mb">
      <div class="field"><label for="pg-m">¿Cuánto ${isP ? 'le pagás' : 'te paga'}?</label><input id="pg-m" name="monto" type="number" step="0.01" min="0.01" max="${s}" required value="${s > 0 ? s : ''}" autofocus inputmode="decimal" style="font-size:22px;font-weight:700"><span class="hint">Si ${isP ? 'pagás' : 'te paga'} una parte, cambiá el número. No puede superar la deuda.</span></div>
      <div class="field"><label for="pg-md">¿Cómo?</label><select id="pg-md" name="medio">${D.MEDIOS_PAGO.map((m) => opt(m, m, 'Transferencia')).join('')}</select><span class="hint">En efectivo ${isP ? 'sale de' : 'entra a'} la caja abierta.</span></div>
      </div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">${isP ? 'Anotar pago' : 'Anotar cobro'}</button></div></form>`);
  }

  Object.assign(UI.act, {
    provnew: () => provForm(), provedit: (b) => provForm(D.prov(S(), b.dataset.id)),
    ctaprov: (b) => cuenta('prov', b.dataset.id), pagoprov: (b) => pagoForm('prov', b.dataset.id),
    devprov: (b) => devProvForm(b.dataset.id),
    dpmodo: (b) => { dpDraft.modo = b.dataset.v; b.parentNode.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#dp-medio-f').hidden = dpDraft.modo !== 'reintegro'; },
    clinew: () => cliForm(), cliedit: (b) => cliForm(D.cli(S(), b.dataset.id)),
    ctacli: (b) => cuenta('cli', b.dataset.id), cobrocli: (b) => pagoForm('cli', b.dataset.id),
    recordatorio: (b) => { const c = D.cli(S(), b.dataset.id); UI.copyText(`Hola ${c.nombre.split(' ')[0]}, ¿cómo estás? Te escribo de ${S().config.nombre} para recordarte que quedó un saldo de ${f$(D.saldoCli(S(), c.id))}. Cuando puedas, avisame. ¡Gracias!`); }
  });
  Object.assign(UI.form, {
    prov: async (fm) => { const d = Object.fromEntries(new FormData(fm)); d.id = fm.dataset.id; const r = await UI.run((s, u) => D.guardarProveedor(s, u, d), { ok: 'Proveedor guardado' }); if (r) UI.closeModal(); },
    cli: async (fm) => { const d = Object.fromEntries(new FormData(fm)); d.id = fm.dataset.id; const r = await UI.run((s, u) => D.guardarCliente(s, u, d), { ok: 'Cliente guardado' }); if (r) UI.closeModal(); },
    pago: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const isP = fm.dataset.kind === 'prov'; const id = fm.dataset.id; const r = await UI.run((s, u) => (isP ? D.pagarProveedor(s, u, { provId: id, monto: U.toNum(d.monto), medio: d.medio }) : D.cobrarCliente(s, u, { cliId: id, monto: U.toNum(d.monto), medio: d.medio })), { ok: isP ? 'Pago anotado' : 'Cobro anotado' }); if (r) UI.closeModal(); },
    devprov: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const items = [...fm.querySelectorAll('[data-dp]')].map((i) => ({ pid: i.dataset.dp, cant: U.num(i.value) })).filter((i) => i.cant > 0); const r = await UI.run((s, u) => D.devolucionProveedor(s, u, { provId: dpDraft.provId, items, modo: dpDraft.modo, medio: d.medio, motivo: d.motivo }), { ok: (x) => `Devolución registrada: ${f$(x.total)}` }); if (r) UI.closeModal(); }
  });
  UI.views.proveedores = { title: 'Proveedores', render: vProv };
  UI.views.clientes = { title: 'Clientes y fiado', render: vCli };
})(typeof window !== 'undefined' ? window : globalThis);
