// Real bundled HTML/CSS/JS in the installed Microsoft Edge. The parent page is
// a synthetic local MCP Apps host and never reads documents or product state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const card = fs.readFileSync(path.join(root, 'plugins/data-secure/server/status-app/status-card.html'), 'utf8');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const states = [
  'local_intake_accepted', 'local_start_confirmed', 'selection_cancelled',
  'start_blocked', 'engine_unavailable', 'already_running', 'unavailable'
];

const harness = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic DataSecure status host</title><body><iframe title="Status card" id="card" src="/card"></iframe><script src="/fixture.js"></script></body></html>`;
const fixture = String.raw`
const frame = document.getElementById('card');
const query = new URLSearchParams(location.search);
const state = query.get('state'); const locale = query.get('locale');
window.bridgeCalls = [];
function send(message) { frame.contentWindow.postMessage({ jsonrpc: '2.0', ...message }, location.origin); }
addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
  const message = event.data;
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.method) window.bridgeCalls.push(message.method);
  if (message.method === 'ui/initialize') send({ id: message.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'Synthetic local test host', version: '1' }, hostCapabilities: {}, hostContext: { theme: 'light', displayMode: 'inline' } } });
  if (message.method === 'ui/notifications/initialized') send({ method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: 'NOT_FOR_RENDERING_CANARY' }], _meta: { 'datasecure/status': { schema: 'datasecure-status-card/v1', locale, state, snapshot: true } } } });
});`;

const routes = new Map([
  ['/', ['text/html', harness]],
  ['/card', ['text/html', card.replace('</head>', '<script src="/axe.js"></script></head>')]],
  ['/axe.js', ['text/javascript', axe]],
  ['/fixture.js', ['text/javascript', fixture]]
]);
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const entry = routes.get(pathname);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'");
  response.writeHead(entry ? 200 : 404, { 'Content-Type': entry ? `${entry[0]}; charset=utf-8` : 'text/plain' });
  response.end(entry ? entry[1] : 'Not found');
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const locale of ['de', 'en']) for (const state of states) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route(/^https?:/u, route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') route.continue();
      else route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/?state=${state}&locale=${locale}`);
    const frame = page.frameLocator('#card');
    await frame.locator('#status[data-received="true"]').waitFor();
    assert.equal(await frame.locator('html').getAttribute('lang'), locale);
    assert.equal((await frame.locator('#state').textContent()).includes('NOT_FOR_RENDERING_CANARY'), false);
    const audit = await frame.locator('body').evaluate(async () => window.axe.run(document, { runOnly: {
      type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
    assert.deepEqual(audit.violations.map(value => value.id), [], `${locale}/${state} accessibility`);
    assert.deepEqual(await page.evaluate(() => window.bridgeCalls), ['ui/initialize', 'ui/notifications/initialized']);
    assert.deepEqual(errors, []);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/?state=local_start_confirmed&locale=de`);
  const frame = page.frameLocator('#card');
  await frame.locator('#status[data-received="true"]').waitFor();
  await frame.locator('html').evaluate(element => { element.style.fontSize = '400%'; });
  assert.equal(await frame.locator('html').evaluate(element => element.scrollWidth <= innerWidth + 1), true,
    '320 px / 400% text must not create horizontal page overflow');
  await context.close();
  console.log('STATUS APP BROWSER PASS: 14 DE/EN state projections, axe, bridge allowlist and 400% reflow');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
