/* Mostrador · ui/ticket.js
 * Comprobantes: ticket para impresora térmica (58 / 80 mm), vista del
 * comprobante en pantalla y texto para enviar por WhatsApp.
 *
 * IMPORTANTE: mientras la integración con ARCA no esté configurada, ningún
 * comprobante tiene CAE. Se muestran como "comprobante interno, no válido como
 * factura" y nunca se inventa un CAE ni un código QR fiscal.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  const U = M.U, D = M.D, UI = M.UI;
  const { esc, f$, fn } = U;

  const autorizado = (v) => v.fiscal && v.fiscal.estado === 'autorizado' && v.fiscal.cae;
  function leyendaFiscal(v, S) {
    if (v.tipo === 'TK') return 'Ticket interno · No válido como factura';
    if (autorizado(v)) return `${D.TIPOS[v.tipo].nombre} · CAE ${v.fiscal.cae}`;
    return S.workspace.modo === 'demo' ? 'Demostración · Sin CAE · No válido como factura' : `${D.TIPOS[v.tipo].nombre} pendiente de autorizar en ARCA · No válido como factura`;
  }

  /** HTML del ticket térmico. ancho: 58 u 80 (mm). */
  function ticketHTML(v, S, ancho) {
    const c = S.config; const cl = D.cli(S, v.clienteId) || { nombre: 'Consumidor Final', condIva: 'CF' };
    const f = 1 - (v.desc || 0) / 100;
    const lineas = v.items.map((i) => `<div class="it"><div>${esc(i.nombre)}</div><div class="row"><span>${fn(i.cant)} x ${f$(i.precio)}</span><span>${f$(i.precio * i.cant)}</span></div>${i.devuelto ? `<div class="row"><span>Devuelto ${fn(i.devuelto)}</span><span></span></div>` : ''}</div>`).join('');
    const pagos = v.pagos.map((p) => `<div class="row"><span>${esc(D.ML(p.medio))}</span><span>${f$(p.monto)}</span></div>`).join('');
    return `<div class="tk w${ancho === 58 ? 58 : 80}">
      <div class="c big">${esc(c.nombre)}</div>
      ${c.razon ? `<div class="c">${esc(c.razon)}</div>` : ''}${c.cuit ? `<div class="c">CUIT ${esc(c.cuit)}</div>` : ''}${c.domicilio ? `<div class="c">${esc(c.domicilio)}</div>` : ''}<div class="c">${esc(D.COND[v.condEmisor] || '')}</div>
      <hr><div class="aviso">${esc(leyendaFiscal(v, S))}</div>
      <div class="row"><span>N° ${esc(v.nro)}</span><span>${U.fD(v.fecha)} ${U.fH(v.fecha)}</span></div>
      <div>Cliente: ${esc(cl.nombre)}${cl.cuit ? ' · ' + esc(cl.cuit) : ''}</div>
      <div>Atendió: ${esc(D.uNombre(S, v.usuario))}</div><hr>
      ${lineas}<hr>
      ${v.desc ? `<div class="row"><span>Subtotal</span><span>${f$(v.bruto)}</span></div><div class="row"><span>Descuento ${fn(v.desc)}%</span><span>-${f$(v.bruto - v.total)}</span></div>` : ''}
      <div class="row big"><span>TOTAL</span><span>${f$(v.total)}</span></div>
      ${pagos}${v.vuelto != null ? `<div class="row"><span>Recibido</span><span>${f$(v.recibido)}</span></div><div class="row b"><span>Vuelto</span><span>${f$(v.vuelto)}</span></div>` : ''}
      ${v.tipo === 'FB' || (v.tipo === 'TK' && v.condEmisor === 'RI') ? `<hr><div>Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</div><div class="row"><span>IVA contenido</span><span>${f$(v.i21 + v.i105)}</span></div>` : ''}
      ${v.tipo === 'FA' ? `<hr><div class="row"><span>Neto gravado</span><span>${f$(v.n21 + v.n105)}</span></div><div class="row"><span>IVA 21%</span><span>${f$(v.i21)}</span></div>${v.i105 ? `<div class="row"><span>IVA 10,5%</span><span>${f$(v.i105)}</span></div>` : ''}` : ''}
      <hr><div class="c">${esc(c.ticket && c.ticket.pie ? c.ticket.pie : '')}</div>
    </div>`;
  }

  /** Imprime en la impresora térmica usando el diálogo del navegador. */
  function imprimir(html, ancho) {
    if (!UI.APP.puedeImprimir) { UI.toast('En esta vista no se puede imprimir. Abrí Mostrador desde su dirección web para imprimir tickets.', { error: true }); return; }
    const area = root.document.getElementById('print-area');
    area.innerHTML = html;
    root.document.body.classList.remove('print-58', 'print-80'); root.document.body.classList.add('print-' + (ancho === 58 ? 58 : 80));
    let st = root.document.getElementById('print-page'); if (!st) { st = root.document.createElement('style'); st.id = 'print-page'; root.document.head.appendChild(st); }
    st.textContent = `@media print{@page{size:${ancho === 58 ? 58 : 80}mm auto;margin:0}}`;
    setTimeout(() => { root.print(); }, 50);
  }
  const imprimirVenta = (v) => { const S = UI.APP.S; const a = (S.config.ticket || {}).ancho || 80; imprimir(ticketHTML(v, S, a), a); };

  /** Texto plano para WhatsApp o mail. */
  function textoVenta(v, S) {
    return `${S.config.nombre}\n${leyendaFiscal(v, S)}\nN° ${v.nro} · ${U.fD(v.fecha)} ${U.fH(v.fecha)}\n` + v.items.map((i) => `${fn(i.cant)} x ${i.nombre}: ${f$(i.precio * i.cant)}`).join('\n') + (v.desc ? `\nDescuento ${fn(v.desc)}%` : '') + `\nTOTAL: ${f$(v.total)}\nPago: ${v.pagos.map((p) => D.ML(p.medio) + ' ' + f$(p.monto)).join(' + ')}\n¡Gracias por tu compra!`;
  }

  /** Vista A4 del comprobante en pantalla (con la marca de no fiscal cuando corresponde). */
  function comprobanteHTML(v, S) {
    const T = D.TIPOS[v.tipo], c = D.cli(S, v.clienteId) || { nombre: 'Consumidor Final', condIva: 'CF' }, cfg = S.config;
    const discrimina = v.tipo === 'FA';
    const rows = v.items.map((i) => { const pu = discrimina ? i.precio / (1 + i.iva / 100) : i.precio; return `<tr><td>${esc(i.nombre)}${i.devuelto ? `<span class="sub">Devuelto: ${fn(i.devuelto)}</span>` : ''}</td><td class="n">${fn(i.cant)}</td><td class="n">${f$(pu)}</td>${discrimina ? `<td class="n">${String(i.iva).replace('.', ',')}%</td>` : ''}<td class="n">${f$(pu * i.cant)}</td></tr>`; }).join('');
    const marca = autorizado(v) ? '' : `<div class="cbte-wm">${S.workspace.modo === 'demo' ? 'DEMOSTRACIÓN<br>' : ''}NO VÁLIDO<br>COMO FACTURA</div>`;
    return `<div class="cbte">${marca}
      <div class="cbte-head">
        <div class="cbte-em"><strong>${esc(cfg.nombre)}</strong><br>${esc(cfg.razon)}<br>${esc(cfg.domicilio)}<br>${esc(D.COND[v.condEmisor || cfg.condIva])}</div>
        <div class="cbte-letra"><span>${T.letra}</span><small>COD. ${T.cod}</small></div>
        <div class="cbte-dt"><strong>${v.tipo === 'TK' ? 'TICKET INTERNO' : esc(T.nombre.toUpperCase())}</strong>N° interno: <span class="mono">${esc(v.nro)}</span><br>Fecha: ${U.fD(v.fecha)} ${U.fH(v.fecha)}<br>CUIT: ${esc(cfg.cuit || '—')}<br>Ingresos Brutos: ${esc(cfg.iibb || '—')}<br>Inicio de actividades: ${cfg.inicio ? U.fD(cfg.inicio + 'T12:00') : '—'}</div>
      </div>
      <div class="cbte-cli"><div><b>Cliente:</b> ${esc(c.nombre)}</div><div><b>${c.cuit ? 'CUIT' : 'Doc.'}:</b> ${esc(c.cuit || '—')}</div><div><b>Condición IVA:</b> ${esc(D.COND[c.condIva] || '')}</div><div><b>Pago:</b> ${esc(v.pagos.map((p) => D.ML(p.medio)).join(' + '))}</div></div>
      <div style="overflow-x:auto"><table><thead><tr><th>Producto</th><th class="n">Cant.</th><th class="n">${discrimina ? 'P. unit. neto' : 'P. unitario'}</th>${discrimina ? '<th class="n">Alíc. IVA</th>' : ''}<th class="n">Subtotal</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="cbte-tot"><div class="in">
        ${v.desc ? `<div class="tot"><span>Bonificación ${fn(v.desc)}%</span><span>− ${f$(v.bruto - v.total)}</span></div>` : ''}
        ${discrimina ? `<div class="tot"><span>Importe neto gravado</span><span>${f$(v.n21 + v.n105)}</span></div><div class="tot"><span>IVA 21%</span><span>${f$(v.i21)}</span></div><div class="tot"><span>IVA 10,5%</span><span>${f$(v.i105)}</span></div>` : ''}
        <div class="tot big"><span>Importe total</span><span>${f$(v.total)}</span></div>
      </div></div>
      ${v.tipo === 'FB' ? `<div class="cbte-ley">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) · IVA contenido: ${f$(v.i21 + v.i105)}</div>` : ''}
      <div class="cbte-ley"><b>${esc(leyendaFiscal(v, S))}.</b> ${autorizado(v) ? `Vto. CAE ${U.fD(v.fiscal.caeVto)}` : 'Este comprobante no tiene CAE. La autorización ante ARCA todavía no está configurada en esta instalación.'}</div>
    </div>`;
  }

  M.Ticket = { ticketHTML, imprimir, imprimirVenta, textoVenta, comprobanteHTML, leyendaFiscal };
})(typeof window !== 'undefined' ? window : globalThis);
