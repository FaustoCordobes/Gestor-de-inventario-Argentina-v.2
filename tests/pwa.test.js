/* PWA: el service worker guarda todos los archivos que la página necesita
 * (si falta uno, la app no abre sin conexión) y el manifiesto es válido. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

const sw = leer('sw.js');
const shell = JSON.parse(sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
const libs = JSON.parse(sw.match(/const LIBS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));

test('el service worker guarda todos los archivos propios que usa la página', () => {
  for (const f of shell.filter((f) => f !== './')) assert.ok(fs.existsSync(path.join(raiz, f)), `existe ${f}`);
  const html = leer('index.html');
  const locales = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const u of locales) assert.ok(shell.includes(u), `${u} está en APP_SHELL de sw.js`);
  const js = fs.readdirSync(path.join(raiz, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)
    .concat(fs.readdirSync(path.join(raiz, 'js', 'ui')).map((f) => 'js/ui/' + f));
  for (const f of js) assert.ok(shell.includes(f), `${f} está en APP_SHELL`);
});

test('las bibliotecas externas tienen versión fija y coinciden con las que usa la app', () => {
  const codigo = leer('index.html') + leer('js/ui/base.js') + leer('js/ui/informes.js');
  const usadas = [...new Set([...codigo.matchAll(/https:\/\/(?:cdnjs|cdn\.jsdelivr)[^'"\s)]+\.js/g)].map((m) => m[0]))];
  for (const u of usadas) assert.ok(libs.includes(u), `${u} está en LIBS`);
  for (const u of libs) assert.match(u, /@?\d+\.\d+\.\d+/, 'versión fija');
});

test('manifiesto e íconos', () => {
  const m = JSON.parse(leer('manifest.webmanifest'));
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, './');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(raiz, i.src)), i.src);
  assert.ok(m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.sizes === '192x192'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});
