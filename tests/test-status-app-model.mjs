import assert from 'node:assert/strict';
import fs from 'node:fs';
import model from '../plugins/data-secure/server/status-app/model.js';
import { mountStatusCard } from '../ui/status-card/view.mjs';

let tests = 0;
function test(name, action) { action(); tests++; console.log(`PASS ${name}`); }
const success = { ok: true, mode: 'local_only', local_intake_pending: true, local_processing_started: true, next_action: 'local_processing_running_without_claude', raw_content_sent_to_claude: false };
test('start is an exact four-field snapshot, no source data', () => {
  const value = model.projectStartResult({ ...success, file: 'PRIVATE_CANARY.docx', path: '/private/raw', message: 'SECRET', count: 100 });
  assert.deepEqual(value, model.snapshot('local_start_confirmed'));
  assert.equal(Object.isFrozen(value), true);
});
for (const [error, next_action, state, started = false] of [
  ['local_selection_cancelled', 'no_action', 'selection_cancelled'],
  ['local_start_failed', 'restart_only_on_explicit_request', 'start_blocked'],
  ['local_engine_unavailable', 'restart_only_on_explicit_request', 'engine_unavailable'],
  ['batch_active', 'wait_for_local_release_before_retry', 'already_running', true],
  ['batch_active', 'no_action', 'already_running', false],
]) test(error, () => assert.equal(model.projectStartResult({ ok: false, error, next_action, local_processing_started: started, raw_content_sent_to_claude: false }).state, state));
test('malformed/conflicting start data cannot confirm completion or start', () => {
  for (const result of [null, [], {}, { ...success, ok: 'true' }, { ...success, local_processing_started: false }, { ...success, raw_content_sent_to_claude: true }, { ...success, mode: 'continue_in_chat' }, { ...success, next_action: 'completed' }]) assert.equal(model.projectStartResult(result).state, 'unavailable');
});
test('snapshot rejects extra keys, arbitrary state, language and types', () => {
  for (const bad of [null, [], {}, { ...model.snapshot(), secret: 'CANARY' }, { ...model.snapshot(), state: '<img src=x>' }, { ...model.snapshot(), locale: 'fr' }, { ...model.snapshot(), snapshot: 'true' }]) assert.equal(model.validateSnapshot(bad), false);
  for (const state of model.STATES) for (const locale of ['de', 'en']) assert.equal(model.validateSnapshot(model.snapshot(state, locale)), true);
});

function dom() {
  const elements = new Map(['language', 'status', 'title', 'snapshot', 'details', 'help', 'language-label', 'state', 'explanation'].map(id => [id, { textContent: '', dataset: {}, handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } }]));
  return { documentElement: { lang: 'de' }, getElementById(id) { assert.ok(elements.has(id)); return elements.get(id); }, elements };
}
class FakeApp {
  constructor(info, capabilities, options) { this.info = info; this.capabilities = capabilities; this.options = options; this.connections = 0; }
  connect() { this.connections++; return Promise.resolve(); }
}
for (const locale of ['de', 'en']) for (const state of model.STATES) test(`render ${locale}/${state}`, () => {
  const document = dom(); const app = mountStatusCard(document, FakeApp);
  app.ontoolresult({ _meta: { 'datasecure/status': model.snapshot(state, locale) }, content: [{ type: 'text', text: 'RAW_CANARY' }], structuredContent: { path: 'RAW_CANARY' } });
  assert.equal(document.documentElement.lang, locale);
  assert.ok(document.getElementById('state').textContent.length > 10);
  assert.ok(!JSON.stringify([...document.elements.values()]).includes('RAW_CANARY'));
  assert.deepEqual(app.capabilities, {}); assert.deepEqual(app.options, { autoResize: false });
});
test('duplicate results and cancellation do not mutate an acknowledged snapshot', () => {
  const document = dom(); const app = mountStatusCard(document, FakeApp);
  app.ontoolresult({ _meta: { 'datasecure/status': model.snapshot('local_start_confirmed') } });
  const first = document.getElementById('state').textContent;
  app.ontoolresult({ _meta: { 'datasecure/status': model.snapshot('start_blocked') } }); app.ontoolcancelled();
  assert.equal(document.getElementById('state').textContent, first);
});
test('invalid/missing metadata stays unavailable, never renders content', () => {
  for (const value of [undefined, { ...model.snapshot(), secret: 'RAW_CANARY' }, { ...model.snapshot(), state: 'RAW_CANARY' }]) {
    const document = dom(); const app = mountStatusCard(document, FakeApp);
    app.ontoolresult({ _meta: { 'datasecure/status': value }, content: [{ type: 'text', text: 'RAW_CANARY' }] });
    assert.equal(document.getElementById('state').textContent, 'Status nicht verfügbar.');
    assert.ok(!JSON.stringify([...document.elements.values()]).includes('RAW_CANARY'));
  }
});
test('local language selection survives later tool result', () => {
  const document = dom(); const app = mountStatusCard(document, FakeApp);
  const select = document.getElementById('language'); select.value = 'en'; select.handlers.change();
  app.ontoolresult({ _meta: { 'datasecure/status': model.snapshot('local_start_confirmed', 'de') } });
  assert.equal(document.documentElement.lang, 'en');
});
test('production view has no network, action, timer or unsafe HTML calls', () => {
  const source = fs.readFileSync(new URL('../ui/status-card/view.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|setInterval|setTimeout|postMessage|callServerTool|sendMessage|openLink|updateModelContext|readResource)\s*\(/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
});
const failingDocument = dom();
const failingApp = mountStatusCard(failingDocument, class extends FakeApp { connect() { throw new Error('offline host'); } });
await new Promise(resolve => setImmediate(resolve));
test('SDK connection failure leaves fixed text fallback and no retry', () => {
  assert.equal(failingDocument.getElementById('state').textContent, 'Status nicht verfügbar.');
  assert.equal(failingApp.connections, 0);
});
console.log(`${tests} status projection/UI unit checks passed`);
