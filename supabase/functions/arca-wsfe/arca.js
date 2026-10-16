/* Mostrador · integración con ARCA (factura electrónica WSFEv1)
 *
 * Funciones puras (sin red) para:
 *  - armar y firmar el pedido de acceso (TRA) al WSAA,
 *  - armar los mensajes SOAP de WSFEv1 (último autorizado, pedido de CAE),
 *  - leer las respuestas y detectar rechazos/observaciones,
 *  - armar la URL del código QR (RG 4892) SOLO con un CAE real devuelto por ARCA.
 *
 * Este archivo se usa desde la función de servidor (index.ts). Nunca debe
 * cargarse en el navegador: la firma necesita la clave privada del certificado.
 *
 * ESTADO: probado con pruebas unitarias (formato de mensajes, firma CMS con un
 * certificado de prueba propio, lectura de respuestas de ejemplo). NO probado
 * contra los servidores de ARCA: falta un certificado de homologación.
 * Verificar contra el "Manual para el desarrollador WSFEv1" vigente antes de usar.
 */

export const ENDPOINTS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
  }
};

/** Códigos de ARCA usados por Mostrador. */
export const CBTE_TIPO = { FA: 1, FB: 6, FC: 11, NCA: 3, NCB: 8, NCC: 13 };
export const ALICUOTA_ID = { 0: 3, 10.5: 4, 21: 5, 27: 6 };
export const DOC_TIPO = { CUIT: 80, DNI: 96, SIN_IDENTIFICAR: 99 };
/**
 * Condición frente al IVA del receptor (campo CondicionIVAReceptorId, RG 5616).
 * ARCA informa que es obligatorio desde el 1/12/2026. Validar los valores con
 * FEParamGetCondicionIvaReceptor antes de pasar a producción.
 */
export const COND_IVA_RECEPTOR = { RI: 1, EX: 4, CF: 5, MONO: 6 };

const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const yyyymmdd = (d) => { const x = new Date(d); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}`; };
/** Fecha ISO con zona horaria de Argentina (-03:00), como la espera el WSAA. */
function isoAR(d) {
  const t = new Date(d.getTime() - 3 * 3600e3); const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}-03:00`;
}

/* ---------- WSAA ---------- */
/** Ticket de Requerimiento de Acceso (TRA). Válido 10 minutos. */
export function construirTRA(servicio = 'wsfe', ahora = new Date()) {
  const desde = new Date(ahora.getTime() - 5 * 60e3), hasta = new Date(ahora.getTime() + 5 * 60e3);
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId><generationTime>${isoAR(desde)}</generationTime><expirationTime>${isoAR(hasta)}</expirationTime></header><service>${esc(servicio)}</service></loginTicketRequest>`;
}
/** Firma el TRA como CMS (PKCS#7 SignedData con el contenido incluido) y devuelve base64. */
export function firmarTRA(forge, tra, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  const cert = forge.pki.certificateFromPem(certPem);
  p7.addCertificate(cert);
  p7.addSigner({ key: forge.pki.privateKeyFromPem(keyPem), certificate: cert, digestAlgorithm: forge.pki.oids.sha256, authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
export const soapLoginCms = (cmsB64) => `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cmsB64}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;

/** Extrae el texto de una etiqueta (ignora prefijos de namespace). */
export function tag(xml, nombre) { const m = String(xml).match(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`)); return m ? m[1].trim() : null; }
export function tags(xml, nombre) { const re = new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, 'g'); const out = []; let m; while ((m = re.exec(String(xml)))) out.push(m[1]); return out; }
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Lee la respuesta de loginCms: devuelve { token, sign, expira } o lanza el error de ARCA. */
export function leerLogin(xml) {
  const fault = tag(xml, 'faultstring'); if (fault) throw new Error('WSAA rechazó el acceso: ' + unesc(fault));
  const ret = tag(xml, 'loginCmsReturn'); if (!ret) throw new Error('Respuesta inesperada del WSAA.');
  const ticket = unesc(ret);
  const token = tag(ticket, 'token'), sign = tag(ticket, 'sign'), expira = tag(ticket, 'expirationTime');
  if (!token || !sign) throw new Error('El WSAA no devolvió token y firma.');
  return { token, sign, expira };
}

/* ---------- WSFEv1 ---------- */
const authXml = (a) => `<ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${String(a.cuit).replace(/\D/g, '')}</ar:Cuit></ar:Auth>`;
const env = (body) => `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
export const soapUltimoAutorizado = (auth, ptoVta, cbteTipo) => env(`<ar:FECompUltimoAutorizado>${authXml(auth)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FECompUltimoAutorizado>`);
export function leerUltimoAutorizado(xml) {
  const errs = leerErrores(xml); if (errs.length) throw new Error('ARCA: ' + errs.map((e) => `${e.code} ${e.msg}`).join(' · '));
  const n = tag(xml, 'CbteNro'); if (n == null) throw new Error('Respuesta inesperada de FECompUltimoAutorizado.');
  return +n;
}

/**
 * Arma el detalle del comprobante a partir de una venta de Mostrador.
 * venta: { tipo:'FA'|'FB'|'FC', fecha, total, items:[{precio, cant, iva}], descuento }
 * emisor: { condIva:'RI'|'MONO', ptoVta }
 * receptor: { condIva:'CF'|'RI'|'MONO'|'EX', cuit, dni }
 */
export function armarComprobante(venta, emisor, receptor, numero) {
  const cbteTipo = CBTE_TIPO[venta.tipo]; if (!cbteTipo) throw new Error('Tipo de comprobante no fiscal: ' + venta.tipo);
  if (emisor.condIva === 'MONO' && venta.tipo !== 'FC') throw new Error('Un monotributista emite Factura C.');
  if (emisor.condIva === 'RI' && venta.tipo === 'FC') throw new Error('Un Responsable Inscripto no emite Factura C.');
  const cuit = String(receptor.cuit || '').replace(/\D/g, ''), dni = String(receptor.dni || '').replace(/\D/g, '');
  let docTipo, docNro;
  if (cuit.length === 11) { docTipo = DOC_TIPO.CUIT; docNro = cuit; } else if (dni) { docTipo = DOC_TIPO.DNI; docNro = dni; } else { docTipo = DOC_TIPO.SIN_IDENTIFICAR; docNro = '0'; }
  if (venta.tipo === 'FA' && docTipo !== DOC_TIPO.CUIT) throw new Error('La Factura A requiere el CUIT del receptor.');
  const condRec = COND_IVA_RECEPTOR[receptor.condIva || 'CF']; if (!condRec) throw new Error('Condición frente al IVA del receptor desconocida.');
  const f = 1 - (Number(venta.descuento) || 0) / 100;
  const total = r2(venta.items.reduce((a, i) => a + r2(i.precio * i.cant * f), 0));
  if (Math.abs(total - r2(venta.total)) > 0.011) throw new Error(`El total de la venta (${venta.total}) no coincide con sus ítems (${total}).`);
  const det = { CbteTipo: cbteTipo, PtoVta: emisor.ptoVta, Concepto: 1, DocTipo: docTipo, DocNro: docNro, CbteDesde: numero, CbteHasta: numero, CbteFch: yyyymmdd(venta.fecha), ImpTotal: total, ImpTotConc: 0, ImpNeto: 0, ImpOpEx: 0, ImpTrib: 0, ImpIVA: 0, MonId: 'PES', MonCotiz: 1, CondicionIVAReceptorId: condRec, Iva: [] };
  if (venta.tipo === 'FC') { det.ImpNeto = total; return det; }
  // A y B: el precio incluye IVA; se separa base imponible e IVA por alícuota
  const grupos = {};
  venta.items.forEach((i) => { const sub = r2(i.precio * i.cant * f); const al = Number(i.iva); if (al === 0) { det.ImpOpEx = r2(det.ImpOpEx + sub); return; } const base = r2(sub / (1 + al / 100)); const g = (grupos[al] = grupos[al] || { Id: ALICUOTA_ID[al], BaseImp: 0, Importe: 0 }); g.BaseImp = r2(g.BaseImp + base); g.Importe = r2(g.Importe + (sub - base)); });
  det.Iva = Object.values(grupos);
  det.ImpNeto = r2(det.Iva.reduce((a, g) => a + g.BaseImp, 0));
  det.ImpIVA = r2(det.Iva.reduce((a, g) => a + g.Importe, 0));
  // Ajuste de centavos para que ImpTotal = ImpNeto + ImpIVA + ImpOpEx (lo exige ARCA)
  const dif = r2(det.ImpTotal - det.ImpNeto - det.ImpIVA - det.ImpOpEx);
  if (dif !== 0 && det.Iva.length) { det.Iva[0].Importe = r2(det.Iva[0].Importe + dif); det.ImpIVA = r2(det.ImpIVA + dif); }
  return det;
}
export function soapCAESolicitar(auth, det) {
  const iva = det.Iva.length ? `<ar:Iva>${det.Iva.map((g) => `<ar:AlicIva><ar:Id>${g.Id}</ar:Id><ar:BaseImp>${g.BaseImp.toFixed(2)}</ar:BaseImp><ar:Importe>${g.Importe.toFixed(2)}</ar:Importe></ar:AlicIva>`).join('')}</ar:Iva>` : '';
  const n = (v) => Number(v).toFixed(2);
  return env(`<ar:FECAESolicitar>${authXml(auth)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${det.PtoVta}</ar:PtoVta><ar:CbteTipo>${det.CbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest><ar:Concepto>${det.Concepto}</ar:Concepto><ar:DocTipo>${det.DocTipo}</ar:DocTipo><ar:DocNro>${det.DocNro}</ar:DocNro><ar:CbteDesde>${det.CbteDesde}</ar:CbteDesde><ar:CbteHasta>${det.CbteHasta}</ar:CbteHasta><ar:CbteFch>${det.CbteFch}</ar:CbteFch><ar:ImpTotal>${n(det.ImpTotal)}</ar:ImpTotal><ar:ImpTotConc>${n(det.ImpTotConc)}</ar:ImpTotConc><ar:ImpNeto>${n(det.ImpNeto)}</ar:ImpNeto><ar:ImpOpEx>${n(det.ImpOpEx)}</ar:ImpOpEx><ar:ImpTrib>${n(det.ImpTrib)}</ar:ImpTrib><ar:ImpIVA>${n(det.ImpIVA)}</ar:ImpIVA><ar:MonId>${det.MonId}</ar:MonId><ar:MonCotiz>${det.MonCotiz}</ar:MonCotiz><ar:CondicionIVAReceptorId>${det.CondicionIVAReceptorId}</ar:CondicionIVAReceptorId>${iva}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar>`);
}
export function leerErrores(xml) {
  const errs = tags(tag(xml, 'Errors') || '', 'Err').map((e) => ({ code: tag(e, 'Code'), msg: unesc(tag(e, 'Msg') || '') }));
  const fault = tag(xml, 'faultstring'); if (fault) errs.push({ code: 'SOAP', msg: unesc(fault) });
  return errs;
}
/**
 * Lee la respuesta de FECAESolicitar. Solo devuelve aprobado:true si ARCA
 * respondió Resultado "A" y un CAE de 14 dígitos. Nunca inventa un CAE.
 */
export function leerCAE(xml) {
  const errores = leerErrores(xml);
  const det = tag(xml, 'FECAEDetResponse') || '';
  const resultado = tag(det, 'Resultado') || tag(xml, 'Resultado');
  const obs = tags(tag(det, 'Observaciones') || '', 'Obs').map((o) => ({ code: tag(o, 'Code'), msg: unesc(tag(o, 'Msg') || '') }));
  const cae = tag(det, 'CAE'); const vto = tag(det, 'CAEFchVto'); const nro = tag(det, 'CbteDesde');
  const aprobado = resultado === 'A' && /^\d{14}$/.test(cae || '');
  return { aprobado, resultado, cae: aprobado ? cae : null, vencimiento: aprobado && vto ? `${vto.slice(0, 4)}-${vto.slice(4, 6)}-${vto.slice(6, 8)}` : null, numero: nro ? +nro : null, errores, observaciones: obs };
}

/**
 * Consulta un comprobante ya emitido (FECompConsultar). Se usa cuando un pedido
 * quedó "incierto" (se cortó la conexión después de enviarlo): antes de volver a
 * pedir un CAE hay que saber si ARCA ya lo autorizó, para no duplicarlo.
 */
export const soapConsultar = (auth, ptoVta, cbteTipo, nro) => env(`<ar:FECompConsultar>${authXml(auth)}<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${nro}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq></ar:FECompConsultar>`);
export function leerConsulta(xml) {
  const r = tag(xml, 'ResultGet');
  const errores = leerErrores(xml);
  if (!r) return { encontrado: false, errores };
  const cae = tag(r, 'CodAutorizacion'), vto = tag(r, 'FchVto');
  return { encontrado: tag(r, 'Resultado') === 'A' && /^\d{14}$/.test(cae || ''), cae, vencimiento: vto ? `${vto.slice(0, 4)}-${vto.slice(4, 6)}-${vto.slice(6, 8)}` : null, total: Number(tag(r, 'ImpTotal')), docNro: tag(r, 'DocNro'), numero: Number(tag(r, 'CbteDesde')), errores };
}

/* ---------- Código QR (RG 4892) ---------- */
/** URL del QR del comprobante. Requiere un CAE devuelto por ARCA. */
export function urlQR({ fecha, cuit, ptoVta, tipoCmp, nroCmp, importe, tipoDocRec, nroDocRec, cae }, b64 = (s) => Buffer.from(s, 'utf8').toString('base64')) {
  if (!/^\d{14}$/.test(String(cae || ''))) throw new Error('No se puede generar el QR sin un CAE válido de ARCA.');
  const datos = { ver: 1, fecha, cuit: Number(String(cuit).replace(/\D/g, '')), ptoVta, tipoCmp, nroCmp, importe: r2(importe), moneda: 'PES', ctz: 1, tipoDocRec, nroDocRec: Number(nroDocRec), tipoCodAut: 'E', codAut: Number(cae) };
  return 'https://www.afip.gob.ar/fe/qr/?p=' + b64(JSON.stringify(datos));
}
