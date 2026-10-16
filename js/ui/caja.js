/* Mostrador · ui/caja.js
 * Caja: apertura y cierre (arqueo) con motivo de diferencias, movimientos de
 * dinero por forma de pago, retiros e ingresos de efectivo, gastos y el
 * historial de cierres.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI;
  const { esc, f$ } = U;
  const { APP, ic, opt, mHead, head, $ } = UI;
  const S = () => APP.S;
  let tab = 'hoy', gastoMes = null, verCaja = null;

  function view() {
    const t = [['hoy', 'Caja', 'caja'], UI.can('gasto.crear') && ['gastos', 'Gastos', 'gasto'], ['cierres', 'Cierres anteriores', 'list']];
    return head('Caja', 'Apertura, cierre y arqueo del efectivo, gastos y movimientos de dinero.', UI.can('gasto.crear') ? `<button class="btn primary" data-act="gastonew">${ic('gasto')}Anotar un gasto</button>` : '', 'caja') +
      UI.tabs(tab, t, 'ctab') + (tab === 'hoy' ? tCaja() : tab === 'gastos' ? tGastos() : tCierres());
  }
  function sesion() { return verCaja ? S().cajas.find((c) => c.id === verCaja) : D.cajaAbierta(S()) || S().cajas.slice(-1)[0] || null; }
  function tCaja() {
    const c = sesion(); const abierta = c && !c.cierra;
    if (!c) return `<div class="cajacerrada"><b>${ic('lock')} Todavía no abriste ninguna caja</b><p>Abrí la caja contando el cambio con el que arrancás.</p>${UI.can('caja.abrir') ? '<button class="btn primary" data-act="abrircaja">Abrir la caja</button>' : ''}</div>`;
    const mov = D.movimientosDinero(S(), c.abre.fecha, c.cierra ? c.cierra.fecha : null);
    const porMedio = {}; mov.forEach((m) => { porMedio[m.medio] = (porMedio[m.medio] || 0) + m.monto; });
    const ing = U.sum(mov.filter((m) => m.monto > 0), 'monto'), egr = -U.sum(mov.filter((m) => m.monto < 0), 'monto');
    const esp = D.cajaEsperado(S(), c);
    return `${!abierta && !verCaja ? `<div class="cajacerrada"><b>${ic('lock')} La caja está cerrada</b><p>Abajo ves la última caja. Para seguir vendiendo, abrí una nueva.</p>${UI.can('caja.abrir') ? '<button class="btn primary" data-act="abrircaja">Abrir la caja</button>' : ''}</div>` : ''}
      ${verCaja ? `<div class="toolbar"><button class="btn sm" data-act="cajaactual">${ic('back')}Volver a la caja actual</button></div>` : ''}
      <div class="card"><div class="card-b"><dl class="dl">
        <dt>Estado</dt><dd>${abierta ? '<span class="cajachip abierta">Abierta</span>' : '<span class="cajachip cerrada">Cerrada</span>'}</dd>
        <dt>Abrió</dt><dd>${U.fDT(c.abre.fecha)} · ${esc(D.uNombre(S(), c.abre.usuario))} · cambio inicial ${f$(c.abre.monto)}</dd>
        ${c.cierra ? `<dt>Cerró</dt><dd>${U.fDT(c.cierra.fecha)} · ${esc(D.uNombre(S(), c.cierra.usuario))}</dd><dt>Arqueo</dt><dd>Contó ${f$(c.cierra.contado)} · tenía que haber ${f$(c.cierra.esperado)} · ${Math.abs(c.cierra.dif) < 1 ? '<span class="tag ok">Cerró justa</span>' : `<span class="tag bad">${c.cierra.dif > 0 ? 'Sobrante' : 'Faltante'} ${f$(Math.abs(c.cierra.dif))}</span> ${esc(c.cierra.motivo)}`}</dd>` : ''}
      </dl></div></div>
      <div class="kpis">
        <div class="kpi"><span class="l">Entró</span><span class="v">${f$(ing)}</span><span class="s">Ventas, cobros de fiado e ingresos</span></div>
        <div class="kpi"><span class="l">Salió</span><span class="v">${f$(egr)}</span><span class="s">Gastos, pagos, devoluciones y retiros</span></div>
        <div class="kpi"><span class="l">Efectivo que tiene que haber</span><span class="v">${f$(esp)}</span><span class="s">Cambio inicial + efectivo que entró − efectivo que salió</span></div>
      </div>
      ${abierta && !verCaja ? `<div class="toolbar">${UI.can('caja.cerrar') ? `<button class="btn primary big" data-act="cierre" style="max-width:360px">${ic('lock')}Cerrar la caja</button>` : ''}${UI.can('caja.movimiento') ? `<button class="btn" data-act="cajamov" data-t="retiro">Retirar efectivo</button><button class="btn" data-act="cajamov" data-t="ingreso">Ingresar efectivo</button>` : ''}</div>` : ''}
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h2>Movimientos</h2><button class="link" data-act="expcaja">Descargar en Excel</button></div><div class="card-b"><div class="list">
          ${mov.slice().reverse().map((m) => `<div class="li"><div class="t"><b>${esc(m.tipo)}</b><span class="hint">${U.fH(m.fecha)} · ${esc(D.ML(m.medio))} · ${esc(m.detalle)}</span></div><b class="num" style="color:${m.monto < 0 ? 'var(--bad)' : 'var(--ok)'}">${m.monto > 0 ? '+' : ''}${f$(m.monto)}</b></div>`).join('') || '<div class="empty">Todavía no hubo movimientos.</div>'}
        </div></div></div>
        <div class="card"><div class="card-h"><h2>Según cómo pagaron</h2></div><div class="card-b"><div class="list">
          ${Object.keys(porMedio).length ? Object.entries(porMedio).map(([k, v]) => `<div class="li"><span>${esc(D.ML(k))}</span><b class="num" style="color:${v < 0 ? 'var(--bad)' : 'inherit'}">${f$(v)}</b></div>`).join('') : '<div class="empty">—</div>'}
          <div class="li"><span><b>Total</b></span><b class="num">${f$(ing - egr)}</b></div>
        </div><p class="hint">Solo el efectivo queda en la caja. Lo cobrado con tarjeta, Mercado Pago o transferencia entra a tu cuenta.</p></div></div>
      </div>`;
  }
  function tGastos() {
    gastoMes = gastoMes || U.today().slice(0, 7);
    const gm = S().gastos.filter((g) => U.mkey(g.fecha) === gastoMes).reverse();
    const act = gm.filter((g) => !g.anulado);
    const porCat = {}; act.forEach((g) => (porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto)); const maxC = Math.max(1, ...Object.values(porCat));
    return `<div class="toolbar"><label for="gasto-mes">Mes:</label><select id="gasto-mes" data-gmes="1">${U.lastMonths(12).map((k) => opt(k, U.mLabel(k), gastoMes)).join('')}</select></div>
      <div class="kpis"><div class="kpi"><span class="l">Gastaste en ${U.mLabel(gastoMes).split(' ')[0]}</span><span class="v">${f$(U.sum(act, 'monto'))}</span><span class="s">${act.length} gastos${gm.length > act.length ? ` · ${gm.length - act.length} anulados` : ''}</span></div></div>
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h2>Gastos</h2></div><div class="card-b"><div class="list">
          ${gm.map((g) => `<div class="li"><div class="t"><b style="${g.anulado ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(g.detalle)}</b><span class="hint">${U.fD(g.fecha)} · ${esc(g.categoria)} · ${esc(g.medio)} · ${esc(D.uNombre(S(), g.usuario))}${g.anulado ? ` · <span class="tag bad">Anulado: ${esc(g.anulado.motivo)}</span>` : ''}</span></div><span class="num"><b>${f$(g.monto)}</b> ${!g.anulado && UI.can('gasto.anular') ? `<button class="btn sm ghost" data-act="gastoanular" data-id="${g.id}">Anular</button>` : ''}</span></div>`).join('') || '<div class="empty">No anotaste gastos este mes.</div>'}
        </div></div></div>
        <div class="card"><div class="card-h"><h2>¿En qué se fue la plata?</h2></div><div class="card-b"><div class="bars">${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(v / maxC) * 100}%"></div></div><span class="num">${f$(v)}</span></div>`).join('') || '<div class="empty">—</div>'}</div></div></div>
      </div>`;
  }
  function tCierres() {
    const cs = S().cajas.filter((c) => c.cierra).slice().reverse().slice(0, 60);
    const dif = cs.filter((c) => Math.abs(c.cierra.dif) >= 1);
    return `<div class="kpis"><div class="kpi"><span class="l">Cierres con diferencia (últimos 60)</span><span class="v">${dif.length}</span><span class="s">Total ${f$(U.sum(dif, (c) => c.cierra.dif))}</span></div></div>
      <div class="tw"><table><thead><tr><th>Cerró</th><th>Usuario</th><th class="n">Tenía que haber</th><th class="n">Contó</th><th class="n">Diferencia</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${cs.map((c) => `<tr><td>${U.fDT(c.cierra.fecha)}</td><td>${esc(D.uNombre(S(), c.cierra.usuario))}</td><td class="n">${f$(c.cierra.esperado)}</td><td class="n">${f$(c.cierra.contado)}</td><td class="n" style="color:${Math.abs(c.cierra.dif) < 1 ? 'inherit' : 'var(--bad)'}">${f$(c.cierra.dif)}</td><td>${esc(c.cierra.motivo || '')}</td><td><button class="btn sm ghost" data-act="vercaja" data-id="${c.id}">Ver</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Todavía no hay cierres.</td></tr>'}
      </tbody></table></div>`;
  }

  let gDraft = null;
  function gastoForm() {
    gDraft = { categoria: 'Insumos del local', medio: 'Efectivo' }; const caja = D.cajaAbierta(S());
    UI.openModal(mHead('Anotar un gasto', 'Todo lo que pagás que no es mercadería para vender.') + `<form data-form="gasto"><div class="mb">
      <div class="field"><label for="g-m">¿Cuánto gastaste?</label><input id="g-m" name="monto" type="number" step="0.01" min="0.01" required autofocus inputmode="decimal" style="font-size:22px;font-weight:700"></div>
      <div class="field"><label for="g-d">¿En qué?</label><input id="g-d" name="detalle" type="text" required maxlength="120" placeholder="Ej.: rollos de papel para la tickeadora"></div>
      <div class="field"><span class="lb">Tipo de gasto</span><div class="chips">${D.GASTO_CATS.map((c) => `<button type="button" class="chip" data-act="gcat" data-v="${c}" aria-pressed="${gDraft.categoria === c}">${c}</button>`).join('')}</div></div>
      <div class="field"><span class="lb">¿Cómo lo pagaste?</span><div class="chips">${D.MEDIOS_PAGO.map((m) => `<button type="button" class="chip" data-act="gmed" data-v="${m}" aria-pressed="${gDraft.medio === m}">${m}</button>`).join('')}</div><span class="hint">${caja ? `Si lo pagaste en efectivo, sale de la caja (hay ${f$(D.cajaEsperado(S(), caja))}).` : 'La caja está cerrada: para pagar en efectivo, abrila primero.'}</span></div>
      </div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Anotar gasto</button></div></form>`);
  }
  function cierreForm() {
    const c = D.cajaAbierta(S()); if (!c) { UI.toast('La caja ya está cerrada.', { error: true }); return; }
    const ef = D.cajaEsperado(S(), c);
    UI.openModal(mHead('Cerrar la caja', `Abierta el ${U.fDT(c.abre.fecha)} por ${esc(D.uNombre(S(), c.abre.usuario))}`) + `<form data-form="cierre"><div class="mb">
      <div class="sumrow"><span>Tiene que haber en efectivo</span><b class="num" style="font-size:22px">${f$(ef)}</b></div>
      <div class="field"><label for="ci-c">¿Cuánto contaste en la caja?</label><input id="ci-c" name="contado" type="number" step="0.01" min="0" required autofocus data-cierre="${ef}" inputmode="decimal" style="font-size:22px;font-weight:700"><span class="hint">Contá billetes y monedas, incluido el cambio.</span></div>
      <div id="ci-dif"></div>
      <div class="field" id="ci-mot-f" hidden><label for="ci-mot">¿Por qué no cierra justa?</label><input id="ci-mot" name="motivo" type="text" list="dl-cimot" maxlength="200" placeholder="Ej.: se dio mal un vuelto"><datalist id="dl-cimot"><option value="Se dio mal un vuelto"><option value="Falta registrar un gasto"><option value="Cliente dejó el cambio"><option value="Error al cobrar"></datalist><span class="hint">Queda registrado. Si falta registrar un gasto o una venta, cerrá esta ventana y cargalo antes.</span></div>
      </div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Cerrar la caja</button></div></form>`);
  }
  function cajaMovForm(tipo) {
    UI.openModal(mHead(tipo === 'retiro' ? 'Retirar efectivo' : 'Ingresar efectivo', tipo === 'retiro' ? 'Por ejemplo, para depositar en el banco.' : 'Por ejemplo, cambio que traés de afuera.') + `<form data-form="cajamov" data-t="${tipo}"><div class="mb">
      <div class="field"><label for="cm-m">Monto</label><input id="cm-m" name="monto" type="number" step="0.01" min="0.01" required autofocus inputmode="decimal" style="font-size:22px;font-weight:700"></div>
      <div class="field"><label for="cm-d">Motivo</label><input id="cm-d" name="motivo" type="text" required maxlength="120" placeholder="${tipo === 'retiro' ? 'Depósito en el banco' : 'Cambio traído'}"></div>
      </div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Registrar</button></div></form>`);
  }

  Object.assign(UI.act, {
    ctab: (b) => { tab = b.dataset.t; verCaja = null; UI.render(); },
    gastonew: () => gastoForm(),
    gcat: (b) => { gDraft.categoria = b.dataset.v; b.parentNode.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); },
    gmed: (b) => { gDraft.medio = b.dataset.v; b.parentNode.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b)); },
    gastoanular: (b) => { const g = S().gastos.find((x) => x.id === b.dataset.id); UI.openModal(mHead('Anular gasto', `${esc(g.detalle)} · ${f$(g.monto)}`) + `<form data-form="gastoanular" data-id="${g.id}"><div class="mb"><p class="muted" style="margin:0">El gasto no se borra: queda tachado con el motivo.</p><div class="field"><label for="ga-m">Motivo</label><input id="ga-m" name="motivo" type="text" required autofocus maxlength="120" placeholder="Ej.: cargado dos veces"></div></div><div class="mf"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn danger solid" type="submit">Anular gasto</button></div></form>`); },
    cierre: () => cierreForm(),
    cajamov: (b) => cajaMovForm(b.dataset.t),
    vercaja: (b) => { verCaja = b.dataset.id; tab = 'hoy'; UI.render(); },
    cajaactual: () => { verCaja = null; UI.render(); },
    expcaja: () => { const c = sesion(); if (!c) return; const mov = D.movimientosDinero(S(), c.abre.fecha, c.cierra ? c.cierra.fecha : null); UI.exportXLSX(`caja-${U.dkey(c.abre.fecha)}.xlsx`, { 'Movimientos': mov.map((m) => ({ 'Hora': U.fDT(m.fecha), 'Qué': m.tipo, 'Detalle': m.detalle, 'Cómo': D.ML(m.medio), 'Importe': m.monto })), 'Cierres': S().cajas.filter((x) => x.cierra).map((x) => ({ 'Abrió': U.fDT(x.abre.fecha), 'Cambio inicial': x.abre.monto, 'Cerró': U.fDT(x.cierra.fecha), 'Tenía que haber': x.cierra.esperado, 'Contó': x.cierra.contado, 'Diferencia': x.cierra.dif, 'Motivo': x.cierra.motivo, 'Usuario': D.uNombre(S(), x.cierra.usuario) })) }); }
  });
  Object.assign(UI.form, {
    gasto: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const r = await UI.run((s, u) => D.registrarGasto(s, u, { monto: U.toNum(d.monto), detalle: d.detalle, categoria: gDraft.categoria, medio: gDraft.medio }), { ok: 'Gasto anotado' }); if (r) UI.closeModal(); },
    gastoanular: async (fm) => { const r = await UI.run((s, u) => D.anularGasto(s, u, { id: fm.dataset.id, motivo: new FormData(fm).get('motivo') }), { ok: 'Gasto anulado' }); if (r) UI.closeModal(); },
    cierre: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const c = await UI.run((s, u) => D.cerrarCaja(s, u, { contado: U.toNum(d.contado), motivo: d.motivo }), { ok: (r) => (Math.abs(r.cierra.dif) < 1 ? 'Caja cerrada. ¡Cerró justa!' : `Caja cerrada con ${r.cierra.dif > 0 ? 'sobrante' : 'faltante'} de ${f$(Math.abs(r.cierra.dif))}`) }); if (c) UI.closeModal(); },
    cajamov: async (fm) => { const d = Object.fromEntries(new FormData(fm)); const r = await UI.run((s, u) => D.movimientoCaja(s, u, { tipo: fm.dataset.t, monto: U.toNum(d.monto), motivo: d.motivo }), { ok: 'Movimiento registrado' }); if (r) UI.closeModal(); }
  });
  Object.assign(UI.input, {
    cierre: (t) => {
      const dif = U.num(t.value) - U.num(t.dataset.cierre); const box = $('#ci-dif'); const f = $('#ci-mot-f');
      if (t.value === '') { box.innerHTML = ''; f.hidden = true; return; }
      if (Math.abs(dif) < 1) { box.innerHTML = `<div class="okbox">${ic('check')}Cierra justa</div>`; f.hidden = true; }
      else { box.innerHTML = `<div class="note"><strong style="color:var(--bad)">${dif > 0 ? 'Sobran ' + f$(dif) : 'Faltan ' + f$(-dif)}</strong>. Volvé a contar. Si está bien, escribí el motivo.</div>`; f.hidden = false; }
    }
  });
  Object.assign(UI.change, { gmes: (t) => { gastoMes = t.value; UI.render(); } });
  UI.views.caja = { title: 'Caja', render: view, setTab: (t) => { tab = t; verCaja = null; } };
})(typeof window !== 'undefined' ? window : globalThis);
