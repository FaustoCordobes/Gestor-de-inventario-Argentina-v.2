/* Mostrador · util.js
 * Funciones auxiliares sin dependencias: formato de moneda y fechas (es-AR),
 * escape de HTML, redondeo, identificadores y validación de CUIT.
 * Se carga primero; expone todo en M.U.
 */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});

  const NF$ = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NFn = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
  const NFc = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const pad = (n, l) => String(n).padStart(l, '0');
  /** Redondeo a centavos que evita errores de coma flotante (1.005 → 1.01). */
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
  /** Convierte texto a número aceptando coma decimal; devuelve NaN si no es válido. */
  const toNum = (v) => {
    if (typeof v === 'number') return v;
    const s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (!s) return NaN;
    // "1.234,56" → 1234.56 ; "1234,5" → 1234.5 ; "1234.5" → 1234.5
    const norm = /,\d{1,3}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    const n = Number(norm);
    return Number.isFinite(n) ? n : NaN;
  };
  const num = (v) => { const n = toNum(v); return Number.isFinite(n) ? n : 0; };
  const sum = (arr, f) => arr.reduce((a, x) => a + (typeof f === 'function' ? f(x) : x[f] || 0), 0);

  /** Identificador corto aleatorio (72 bits). */
  const uid = () => {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let b;
    try { b = root.crypto.getRandomValues(new Uint8Array(12)); } catch (e) { b = Array.from({ length: 12 }, () => Math.floor(Math.random() * 256)); }
    let s = ''; for (let i = 0; i < 12; i++) s += A[b[i] & 63];
    return s;
  };

  /** Escapa texto para insertarlo en HTML. Todo dato ingresado por usuarios pasa por acá. */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const dkey = (d) => { const x = new Date(d); return x.getFullYear() + '-' + pad(x.getMonth() + 1, 2) + '-' + pad(x.getDate(), 2); };
  const mkey = (d) => dkey(d).slice(0, 7);
  const today = () => dkey(new Date());
  const f$ = (n) => NF$.format(n || 0);
  const fn = (n) => NFn.format(n || 0);
  const fc = (n) => NFc.format(n || 0);
  const fD = (d) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fDT = (d) => new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fH = (d) => new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const mLabel = (k) => { const [y, m] = k.split('-'); return MESES[+m - 1] + ' ' + y; };
  const lastMonths = (n) => { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + pad(d.getMonth() + 1, 2)); d.setMonth(d.getMonth() - 1); } return out; };
  const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /** Valida un CUIT/CUIL argentino (11 dígitos con dígito verificador). */
  function cuitValido(c) {
    const s = String(c || '').replace(/\D/g, '');
    if (s.length !== 11) return false;
    const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let t = 0; for (let i = 0; i < 10; i++) t += +s[i] * w[i];
    let dv = 11 - (t % 11); if (dv === 11) dv = 0; if (dv === 10) return false;
    return dv === +s[10];
  }
  /** Calcula el dígito verificador (usado para generar CUIT válidos en los datos de ejemplo). */
  function cuitConDV(base10) {
    const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let t = 0; for (let i = 0; i < 10; i++) t += +base10[i] * w[i];
    let dv = 11 - (t % 11); if (dv === 11) dv = 0;
    if (dv === 10) return null;
    return base10.slice(0, 2) + '-' + base10.slice(2) + '-' + dv;
  }
  const fmtCuit = (c) => { const s = String(c || '').replace(/\D/g, ''); return s.length === 11 ? s.slice(0, 2) + '-' + s.slice(2, 10) + '-' + s.slice(10) : String(c || ''); };

  /** Generador pseudoaleatorio con semilla (datos de ejemplo reproducibles). */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /** Copia profunda (para transacciones). */
  const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

  /** Evita que un texto exportado a Excel/CSV se interprete como fórmula. */
  const safeCell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);

  async function sha256(text) {
    const c = root.crypto && root.crypto.subtle;
    if (!c) return '';
    const buf = await c.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  M.U = { pad, r2, r3, toNum, num, sum, uid, esc, dkey, mkey, today, f$, fn, fc, fD, fDT, fH, MESES, mLabel, lastMonths, slug, cuitValido, cuitConDV, fmtCuit, rng, clone, safeCell, sha256 };
})(typeof window !== 'undefined' ? window : globalThis);
