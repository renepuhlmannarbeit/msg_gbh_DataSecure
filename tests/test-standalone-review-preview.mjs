// Development-server security evidence, not native/product workflow evidence.
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { startReviewPreview } from '../scripts/lib/standalone-review-preview.mjs';
await assert.rejects(startReviewPreview({ host: '0.0.0.0' }), /LOOPBACK_ONLY/u);
const preview = await startReviewPreview();
try {
  const response = await fetch(`${preview.url}/review.html?demo=ocr`), html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/u);
  assert.match(html, /ENTWICKLUNGSVORSCHAU/u);
  assert.match(html, /preview-ocr.js/u);
  for (const target of ['/CLAUDE.md', '/concept.html', '/server/core/engine.js', '/%2e%2e/CLAUDE.md', '/unknown']) {
    assert.equal((await fetch(`${preview.url}${target}`)).status, 404);
  }
  assert.equal((await fetch(`${preview.url}/review.js`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${preview.url}/review.js`, { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(`${preview.url}/review.js`, { headers: { Host: 'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  console.log('PREVIEW PASS: loopback-only, allowlist, no arbitrary files, no cross-origin or foreign host, no external connections; synthetic host only');
} finally { await preview.close(); }

const workspace = await startReviewPreview({ workspace: true });
try {
  const response = await fetch(`${workspace.url}/workspace.html`), html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /preview-workspace.js/u);
  assert.match(html, /simulierte Verarbeitung/u);
  const bridge = await fetch(`${workspace.url}/preview-workspace.js`);
  assert.equal(bridge.status, 200);
  const bridgeText = await bridge.text();
  assert.doesNotThrow(() => new vm.Script(bridgeText));
  // The visual adapter must expose the same completed-state availability
  // flag as the real app; otherwise the result/document actions disappear.
  for (const demo of ['documents', 'documents-raw']) {
    const window = { location: { search: `?demo=${demo}` }, addEventListener() {} };
    vm.runInNewContext(bridgeText, { window, URLSearchParams });
    const state = await window.__TAURI__.core.invoke('get_public_state');
    assert.equal(state.state, 'results_available');
    assert.equal(state.results_available, true);
    assert.equal(state.processing_mode, demo === 'documents-raw' ? 'markdown-only' : 'markdown-and-anonymize');
  }
  assert.match(response.headers.get('content-security-policy'), /font-src 'self'/u);
  assert.match(response.headers.get('content-security-policy'), /frame-src 'self'/u);
  const frame = await fetch(`${workspace.url}/review.html?embedded=1`);
  assert.equal(frame.status, 200);
  assert.match(frame.headers.get('content-security-policy'), /frame-ancestors 'self'/u);
  const font = await fetch(`${workspace.url}/fonts/InterVariable.woff2`);
  assert.equal(font.status, 200); assert.equal(font.headers.get('content-type'), 'font/woff2; charset=utf-8');
  assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0, 4).toString('ascii'), 'wOF2');
  for (const target of ['/fonts/LICENSE-Inter.txt', '/fonts/../workspace.html', '/ARBEITSAUFTRAG.md', '/server/standalone/application-service.js']) {
    // Fetch normalizes literal dot segments, so encode them when exercising the server guard.
    if (target.includes('../')) continue;
    assert.equal((await fetch(`${workspace.url}${target}`)).status, 404);
  }
  assert.equal((await fetch(`${workspace.url}/fonts/%2e%2e%2fworkspace.html`)).status, 404);
  console.log('WORKSPACE PREVIEW PASS: synthetic banner/bridge, local font, same-origin embedded frame, no document/code directory exposure');
} finally { await workspace.close(); }
