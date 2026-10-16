/* Pruebas del módulo de ARCA sin conexión: armado del TRA, firma CMS con un
 * certificado de prueba propio, mensajes SOAP, cálculo de IVA por alícuota,
 * lectura de respuestas (aprobadas, rechazadas, errores) y QR.
 * NO reemplazan la prueba contra el ambiente de homologación de ARCA. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const forge = require('node-forge');

let A;
test.before(async () => { A = await import(path.join(__dirname, '..', 'supabase', 'functions', 'arca-wsfe', 'arca.js')); });

function certPrueba() {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate(); cert.publicKey = keys.publicKey; cert.serialNumber = '01';
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 864e5);
  const attrs = [{ name: 'commonName', value: 'mostrador-prueba' }, { type: '2.5.4.5', value: 'CUIT 20123456786' }];
  cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(cert), key: forge.pki.privateKeyToPem(keys.privateKey) };
}

test('WSAA: TRA válido y firmado como CMS con el contenido incluido', () => {
  const ahora = new Date('2026-10-15T15:00:00Z');
  const tra = A.construirTRA('wsfe', ahora);
  assert.match(tra, /<service>wsfe<\/service>/);
  assert.match(tra, /<generationTime>2026-10-15T11:55:00-03:00<\/generationTime>/);
  assert.match(tra, /<expirationTime>2026-10-15T12:05:00-03:00<\/expirationTime>/);
  const { cert, key } = certPrueba();
  const cms = A.firmarTRA(forge, tra, cert, key);
  const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms)));
  const raw = p7.rawCapture;
  assert.equal(forge.util.decodeUtf8(raw.content.value[0].value), tra, 'el CMS contiene el TRA');
  assert.equal(p7.certificates.length, 1);
  // La firma es verificable con la clave pública del certificado
  const attrs = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, raw.authenticatedAttributes);
  const md = forge.md.sha256.create(); md.update(forge.asn1.toDer(attrs).getBytes());
  assert.ok(forge.pki.certificateFromPem(cert).publicKey.verify(md.digest().getBytes(), raw.signature), 'firma RSA válida');
  // y el digest firmado corresponde al TRA
  const dig = raw.authenticatedAttributes.find((a) => forge.asn1.derToOid(a.value[0].value) === forge.pki.oids.messageDigest).value[1].value[0].value;
  const h = forge.md.sha256.create(); h.update(tra, 'utf8');
  assert.equal(dig, h.digest().getBytes(), 'el digest corresponde al TRA');
  assert.match(A.soapLoginCms(cms), /<wsaa:loginCms><wsaa:in0>/);
});

test('WSAA: lectura del ticket y de los errores', () => {
  const ok = `<soapenv:Envelope><soapenv:Body><loginCmsResponse><loginCmsReturn>&lt;loginTicketResponse&gt;&lt;header&gt;&lt;expirationTime&gt;2026-10-16T03:00:00-03:00&lt;/expirationTime&gt;&lt;/header&gt;&lt;credentials&gt;&lt;token&gt;TOK&lt;/token&gt;&lt;sign&gt;SIG&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
  assert.deepEqual(A.leerLogin(ok), { token: 'TOK', sign: 'SIG', expira: '2026-10-16T03:00:00-03:00' });
  assert.throws(() => A.leerLogin('<soap:Fault><faultstring>El CEE ya posee un TA valido</faultstring></soap:Fault>'), /ya posee un TA/);
});

const auth = { token: 'T', sign: 'S', cuit: '30-71234567-3' };
test('WSFEv1: Factura B a consumidor final con IVA 21% y 10,5%', () => {
  const venta = { tipo: 'FB', fecha: '2026-10-15T15:00:00Z', total: 3315, descuento: 0, items: [{ precio: 1210, cant: 2, iva: 21 }, { precio: 895, cant: 1, iva: 10.5 }] };
  const d = A.armarComprobante(venta, { condIva: 'RI', ptoVta: 3 }, { condIva: 'CF' }, 125);
  assert.equal(d.CbteTipo, 6); assert.equal(d.DocTipo, 99); assert.equal(d.DocNro, '0'); assert.equal(d.CondicionIVAReceptorId, 5);
  assert.equal(d.CbteFch, '20261015'); assert.equal(d.ImpTotal, 3315);
  assert.equal(Math.round((d.ImpNeto + d.ImpIVA + d.ImpOpEx) * 100), Math.round(d.ImpTotal * 100), 'los importes cierran');
  assert.deepEqual(d.Iva.map((g) => g.Id).sort(), [4, 5]);
  assert.equal(d.Iva.find((g) => g.Id === 5).BaseImp, 2000);
  const x = A.soapCAESolicitar(auth, d);
  assert.match(x, /<ar:Cuit>30712345673<\/ar:Cuit>/);
  assert.match(x, /<ar:CondicionIVAReceptorId>5<\/ar:CondicionIVAReceptorId>/);
  assert.match(x, /<ar:AlicIva><ar:Id>5<\/ar:Id><ar:BaseImp>2000.00<\/ar:BaseImp><ar:Importe>420.00<\/ar:Importe><\/ar:AlicIva>/);
});

test('WSFEv1: Factura A exige CUIT; Factura C sin IVA discriminado; descuentos', () => {
  const v = { tipo: 'FA', fecha: '2026-10-15T15:00:00Z', total: 1089, descuento: 10, items: [{ precio: 1210, cant: 1, iva: 21 }] };
  assert.throws(() => A.armarComprobante(v, { condIva: 'RI', ptoVta: 1 }, { condIva: 'RI' }, 1), /CUIT/);
  const d = A.armarComprobante(v, { condIva: 'RI', ptoVta: 1 }, { condIva: 'RI', cuit: '30-71598742-0' }, 1);
  assert.equal(d.DocTipo, 80); assert.equal(d.CondicionIVAReceptorId, 1); assert.equal(d.ImpNeto, 900); assert.equal(d.ImpIVA, 189);
  const c = A.armarComprobante({ tipo: 'FC', fecha: '2026-10-15T15:00:00Z', total: 500, items: [{ precio: 250, cant: 2, iva: 21 }] }, { condIva: 'MONO', ptoVta: 2 }, { condIva: 'CF', dni: '30123456' }, 9);
  assert.equal(c.CbteTipo, 11); assert.equal(c.ImpNeto, 500); assert.equal(c.ImpIVA, 0); assert.equal(c.Iva.length, 0); assert.equal(c.DocTipo, 96);
  assert.throws(() => A.armarComprobante({ ...v, tipo: 'FB' }, { condIva: 'MONO', ptoVta: 1 }, { condIva: 'CF' }, 1), /Factura C/);
  assert.throws(() => A.armarComprobante({ ...v, total: 1 }, { condIva: 'RI', ptoVta: 1 }, { condIva: 'RI', cuit: '30-71598742-0' }, 1), /no coincide/);
});

test('WSFEv1: solo se acepta un CAE si ARCA aprueba', () => {
  const aprobado = `<FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>125</CbteDesde><Resultado>A</Resultado><CAE>76123456789012</CAE><CAEFchVto>20261025</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult>`;
  const r = A.leerCAE(aprobado);
  assert.deepEqual([r.aprobado, r.cae, r.vencimiento, r.numero], [true, '76123456789012', '2026-10-25', 125]);
  const rechazado = `<FECAESolicitarResult><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10242</Code><Msg>El campo Condicion Frente al IVA del receptor es obligatorio</Msg></Obs></Observaciones><CAE></CAE></FECAEDetResponse></FeDetResp></FECAESolicitarResult>`;
  const r2 = A.leerCAE(rechazado);
  assert.equal(r2.aprobado, false); assert.equal(r2.cae, null); assert.equal(r2.observaciones[0].code, '10242');
  const error = `<FECAESolicitarResult><Errors><Err><Code>10016</Code><Msg>El numero de comprobante no es el proximo a autorizar</Msg></Err></Errors></FECAESolicitarResult>`;
  const r3 = A.leerCAE(error); assert.equal(r3.aprobado, false); assert.equal(r3.errores[0].code, '10016');
  assert.equal(A.leerUltimoAutorizado('<FECompUltimoAutorizadoResult><PtoVta>3</PtoVta><CbteTipo>6</CbteTipo><CbteNro>124</CbteNro></FECompUltimoAutorizadoResult>'), 124);
  assert.throws(() => A.leerUltimoAutorizado(error), /10016/);
});

test('WSFEv1: consulta de un comprobante para reconciliar un envío incierto', () => {
  assert.match(A.soapConsultar(auth, 3, 6, 125), /<ar:FeCompConsReq><ar:CbteTipo>6<\/ar:CbteTipo><ar:CbteNro>125<\/ar:CbteNro><ar:PtoVta>3<\/ar:PtoVta>/);
  const r = A.leerConsulta('<FECompConsultarResult><ResultGet><DocNro>0</DocNro><CbteDesde>125</CbteDesde><ImpTotal>3315</ImpTotal><Resultado>A</Resultado><CodAutorizacion>76123456789012</CodAutorizacion><FchVto>20261025</FchVto></ResultGet></FECompConsultarResult>');
  assert.deepEqual([r.encontrado, r.cae, r.total, r.numero], [true, '76123456789012', 3315, 125]);
  const n = A.leerConsulta('<FECompConsultarResult><Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors></FECompConsultarResult>');
  assert.equal(n.encontrado, false); assert.equal(n.errores[0].code, '602');
});

test('QR: se arma solo con un CAE real y contiene los datos del comprobante', () => {
  assert.throws(() => A.urlQR({ cae: '' }), /CAE válido/);
  const url = A.urlQR({ fecha: '2026-10-15', cuit: '30-71234567-3', ptoVta: 3, tipoCmp: 6, nroCmp: 125, importe: 3315, tipoDocRec: 99, nroDocRec: 0, cae: '76123456789012' });
  assert.ok(url.startsWith('https://www.afip.gob.ar/fe/qr/?p='));
  const d = JSON.parse(Buffer.from(url.split('p=')[1], 'base64').toString());
  assert.deepEqual([d.ver, d.cuit, d.tipoCmp, d.nroCmp, d.tipoCodAut, d.codAut], [1, 30712345673, 6, 125, 'E', 76123456789012]);
});
