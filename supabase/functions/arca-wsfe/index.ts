// Mostrador · función de servidor para pedir el CAE a ARCA (Supabase Edge Function, Deno).
//
// ESTADO: NO OPERATIVA hasta completar docs/ARCA.md (certificado, punto de venta
// para web services, prueba en homologación). No fue probada contra ARCA.
//
// POST /functions/v1/arca-wsfe   { "empresa_id": "...", "venta_id": "..." }
// Authorization: Bearer <token de sesión del usuario>
//
// Secretos (supabase secrets set ...), nunca en el código ni en el navegador:
//   ARCA_CERT  certificado PEM emitido por ARCA para el CUIT emisor
//   ARCA_KEY   clave privada PEM del certificado
//   ARCA_CUIT  CUIT emisor (debe coincidir con el de la empresa)
//   ARCA_ENV   "homologacion" (por defecto) o "produccion"
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import forge from 'npm:node-forge@1.3.1';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as A from './arca.js';

const AMBIENTE = (Deno.env.get('ARCA_ENV') ?? 'homologacion') === 'produccion' ? 'produccion' : 'homologacion';
const URLS = A.ENDPOINTS[AMBIENTE];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });

async function soap(url: string, action: string, body: string): Promise<string> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetch(url, { method: 'POST', body, signal: ctl.signal, headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: action } });
    return await r.text();
  } finally { clearTimeout(t); }
}

// deno-lint-ignore no-explicit-any
async function credenciales(admin: any, cuit: string) {
  const { data } = await admin.from('arca_tokens').select('*').eq('cuit', cuit).eq('ambiente', AMBIENTE).eq('servicio', 'wsfe').maybeSingle();
  if (data && new Date(data.expira).getTime() > Date.now() + 5 * 60_000) return { token: data.token, sign: data.sign, cuit };
  const cms = A.firmarTRA(forge, A.construirTRA('wsfe'), Deno.env.get('ARCA_CERT')!, Deno.env.get('ARCA_KEY')!);
  const login = A.leerLogin(await soap(URLS.wsaa, '', A.soapLoginCms(cms)));
  await admin.from('arca_tokens').upsert({ cuit, ambiente: AMBIENTE, servicio: 'wsfe', token: login.token, sign: login.sign, expira: login.expira });
  return { token: login.token, sign: login.sign, cuit };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey' } });
  if (req.method !== 'POST') return json(405, { error: 'Usá POST.' });
  for (const k of ['ARCA_CERT', 'ARCA_KEY', 'ARCA_CUIT']) if (!Deno.env.get(k)) return json(503, { error: 'La factura electrónica todavía no está configurada (faltan el certificado o el CUIT). Ver docs/ARCA.md.' });

  const { empresa_id, venta_id } = await req.json().catch(() => ({}));
  if (!empresa_id || !venta_id) return json(400, { error: 'Faltan empresa_id y venta_id.' });

  // 1) Quién pide: se verifica con la sesión del usuario, no con datos del pedido
  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: puede, error: eRol } = await usuario.rpc('tengo_rol', { p_empresa: empresa_id, p_roles: ['admin', 'encargado', 'vendedor'] });
  if (eRol || !puede) return json(403, { error: 'No tenés permiso para facturar en esta empresa.' });

  // 2) Datos desde la base (con service_role, solo en el servidor)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: cfg } = await admin.from('arca_config').select('*').eq('empresa_id', empresa_id).maybeSingle();
  if (!cfg || !cfg.habilitado) return json(409, { error: 'La factura electrónica no está habilitada para esta empresa.' });
  if (cfg.ambiente !== AMBIENTE) return json(409, { error: `La empresa está configurada para ${cfg.ambiente} y el servidor para ${AMBIENTE}.` });
  const { data: emp } = await admin.from('empresas').select('id, cuit, cond_iva').eq('id', empresa_id).single();
  const cuit = Deno.env.get('ARCA_CUIT')!.replace(/\D/g, '');
  if (String(emp?.cuit ?? '').replace(/\D/g, '') !== cuit) return json(409, { error: 'El CUIT de la empresa no coincide con el del certificado.' });
  const { data: venta } = await admin.from('ventas').select('*, venta_items(*), clientes(cond_iva, cuit)').eq('id', venta_id).eq('empresa_id', empresa_id).single();
  if (!venta) return json(404, { error: 'No se encontró la venta.' });
  if (venta.tipo === 'TK') return json(409, { error: 'Es un comprobante interno: no se factura.' });
  if (venta.fiscal_estado === 'autorizado') return json(200, { estado: 'autorizado', cae: venta.cae, numero: venta.nro_fiscal });
  if (venta.estado === 'anulada') return json(409, { error: 'La venta fue devuelta por completo.' });

  const cbteTipo = A.CBTE_TIPO[venta.tipo as 'FA' | 'FB' | 'FC'];
  const turno = crypto.randomUUID();
  const { data: tengo } = await admin.rpc('arca_tomar_turno', { p_empresa: empresa_id, p_pto: cfg.punto_venta, p_tipo: cbteTipo, p_turno: turno });
  if (!tengo) return json(409, { error: 'Hay otro comprobante en curso. Probá de nuevo en unos segundos.' });

  let comp: number | null = null;
  try {
    const auth = await credenciales(admin, cuit);

    // 3) Si un envío anterior quedó incierto, primero se averigua si ARCA ya lo autorizó
    const { data: inc } = await admin.from('comprobantes_arca').select('*').eq('venta_id', venta_id).eq('ambiente', AMBIENTE).eq('estado', 'incierto').maybeSingle();
    if (inc) {
      const c = A.leerConsulta(await soap(URLS.wsfe, 'http://ar.gov.afip.dif.FEV1/FECompConsultar', A.soapConsultar(auth, cfg.punto_venta, cbteTipo, inc.numero)));
      if (c.encontrado && Math.abs(c.total - Number(venta.total)) < 0.01) {
        await admin.from('comprobantes_arca').update({ estado: 'aprobado', cae: c.cae, cae_vto: c.vencimiento, actualizado_en: new Date().toISOString() }).eq('id', inc.id);
        const { data: res } = await admin.rpc('arca_aplicar', { p_comprobante: inc.id });
        return json(200, { estado: res, cae: c.cae, numero: inc.numero, ambiente: AMBIENTE });
      }
      await admin.from('comprobantes_arca').update({ estado: 'error', errores: [{ code: 'RECONCILIADO', msg: 'ARCA no lo tenía autorizado' }], actualizado_en: new Date().toISOString() }).eq('id', inc.id);
    }

    // 4) Número siguiente y pedido de CAE
    const ultimo = A.leerUltimoAutorizado(await soap(URLS.wsfe, 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado', A.soapUltimoAutorizado(auth, cfg.punto_venta, cbteTipo)));
    const items = [...venta.venta_items].sort((a, b) => a.idx - b.idx).map((i) => ({ precio: Number(i.precio), cant: Number(i.cant), iva: Number(i.iva) }));
    const det = A.armarComprobante({ tipo: venta.tipo, fecha: venta.fecha, total: Number(venta.total), descuento: Number(venta.descuento), items }, { condIva: emp.cond_iva, ptoVta: cfg.punto_venta }, { condIva: venta.clientes?.cond_iva ?? 'CF', cuit: venta.clientes?.cuit }, ultimo + 1);
    const { data: fila, error: eIns } = await admin.from('comprobantes_arca').insert({ empresa_id, venta_id, ambiente: AMBIENTE, punto_venta: cfg.punto_venta, cbte_tipo: cbteTipo, numero: ultimo + 1, estado: 'enviando', pedido: det }).select('id').single();
    if (eIns) throw eIns;
    comp = fila.id;

    let xml: string;
    try { xml = await soap(URLS.wsfe, 'http://ar.gov.afip.dif.FEV1/FECAESolicitar', A.soapCAESolicitar(auth, det)); }
    catch (e) {
      // Se envió pero no hubo respuesta: no se sabe si ARCA lo autorizó. Se reconcilia en el próximo intento.
      await admin.from('comprobantes_arca').update({ estado: 'incierto', errores: [{ code: 'RED', msg: String(e) }], actualizado_en: new Date().toISOString() }).eq('id', comp);
      comp = null;
      return json(502, { estado: 'incierto', error: 'Se cortó la comunicación con ARCA. Volvé a intentar: primero se va a verificar si el comprobante quedó autorizado.' });
    }
    const r = A.leerCAE(xml);
    const estado = r.aprobado ? 'aprobado' : (r.resultado === 'R' ? 'rechazado' : 'error');
    await admin.from('comprobantes_arca').update({ estado, cae: r.cae, cae_vto: r.vencimiento, errores: r.errores, observaciones: r.observaciones, actualizado_en: new Date().toISOString() }).eq('id', comp);
    const { data: res } = await admin.rpc('arca_aplicar', { p_comprobante: comp });
    if (r.aprobado && AMBIENTE === 'homologacion') await admin.from('arca_config').update({ verificado_en: new Date().toISOString() }).eq('empresa_id', empresa_id);
    comp = null;
    return json(r.aprobado ? 200 : 422, { estado: res, ambiente: AMBIENTE, cae: r.cae, vencimiento: r.vencimiento, numero: det.CbteDesde, errores: r.errores, observaciones: r.observaciones });
  } catch (e) {
    if (comp) await admin.from('comprobantes_arca').update({ estado: 'error', errores: [{ code: 'SERVIDOR', msg: String((e as Error)?.message ?? e) }], actualizado_en: new Date().toISOString() }).eq('id', comp);
    return json(500, { error: String((e as Error)?.message ?? e) });
  } finally {
    await admin.rpc('arca_soltar_turno', { p_empresa: empresa_id, p_pto: cfg.punto_venta, p_tipo: cbteTipo, p_turno: turno });
  }
});
