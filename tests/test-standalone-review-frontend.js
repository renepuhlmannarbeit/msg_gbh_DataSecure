'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { buildReviewDraft } = require('../plugins/data-secure/server/companion/text-review');

const { testAsync, done, assert } = createSuite('Standalone review frontend');
const source = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/review.js'), 'utf8');

function harness(sessions = null) {
  const callbacks = new Map();
  const elements = new Map();
  const timers = [];
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, disabled: false, textContent: '', focus() { this.focused = true; },
      addEventListener(_type, callback) { callbacks.set(id, callback); }
    });
    return elements.get(id);
  };
  const original = 'Denise Koch und Denise Koch.';
  const draft = buildReviewDraft(original, original, 'general', [
    { ambiguity_id: 'person:v1:000001', type: 'person_prose_ambiguous', replacement_kind: 'PERSON',
      original_start: 0, original_end: 11, anonymized_start: 0, anonymized_end: 11 },
    { ambiguity_id: 'person:v1:000002', type: 'person_prose_ambiguous', replacement_kind: 'PERSON',
      original_start: 16, original_end: 27, anonymized_start: 16, anonymized_end: 27 }
  ], { allowDefer: true });
  const data = Buffer.from(JSON.stringify(draft));
  const calls = [];
  let nextSession = 0;
  let currentReviewId = 'a'.repeat(32);
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === 'get_review_session') {
      const session = sessions?.[nextSession++] || { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 };
      if (session.ready) currentReviewId = session.review_id;
      return session;
    }
    if (command === 'get_review_chunk') return { review_id: currentReviewId, index: 0, data: data.toString('base64') };
    if (command === 'submit_review') return { accepted: true };
    if (command === 'continue_review_session') return { ok: true, event: 'batch_continued' };
    if (command === 'close_review_window') return { ok: true };
    throw Error('unexpected command');
  };
  const window = { __TAURI__: { core: { invoke } }, setTimeout(callback) { timers.push(callback); } };
  vm.runInNewContext(source, { window, document: { getElementById: element }, TextDecoder, atob },
    { filename: 'review.js' });
  return { element, callbacks, calls, draft, timers };
}

testAsync('the exact current finding is named and one person decision covers every identical occurrence', async () => {
  const h = harness();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.element('exact-text').textContent, 'Denise Koch');
  assert.match(h.element('group-note').textContent, /2 nachweislich gleiche Fundstellen/u);
  assert.strictEqual(h.element('release').disabled, true);
  h.callbacks.get('redact')();
  assert.strictEqual(h.element('release').disabled, false);
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  const answer = h.calls.find((call) => call.command === 'submit_review')?.args?.answer;
  assert.deepStrictEqual(Array.from(answer.decisions, (item) => [item.ambiguity_id, item.decision]), [
    ['person:v1:000001', 'redact'], ['person:v1:000002', 'redact']
  ]);
  assert.strictEqual(h.element('exact-text').textContent, '');
  assert.strictEqual(h.element('source-context').textContent, '');
  assert.strictEqual(h.element('output-context').textContent, '');
});

testAsync('successive review groups stay in one window and only final completion closes it', async () => {
  const h = harness([
    { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 },
    { ready: true, review_id: 'b'.repeat(32), chunk_count: 1 },
    { ready: false, run_complete: true }
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  h.callbacks.get('redact')();
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 0);
  await h.timers.shift()();
  assert.strictEqual(h.element('review').hidden, false);
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 0);
  h.callbacks.get('redact')();
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  await h.timers.shift()();
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 1);
  assert.match(h.element('waiting-text').textContent, /Lauf ist abgeschlossen/u);
});

testAsync('a later review wave can be started and decided inside the same open window', async () => {
  const h = harness([
    { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 },
    { ready: false, run_complete: false, continuation_available: false },
    { ready: false, run_complete: false, continuation_available: true },
    { ready: true, review_id: 'b'.repeat(32), chunk_count: 1 },
    { ready: false, run_complete: true, continuation_available: false }
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  h.callbacks.get('redact')();
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  await h.timers.shift()();
  assert.match(h.element('waiting-text').textContent, /Bitte dieses Fenster offen lassen/u);
  assert.strictEqual(h.element('work-indicator').hidden, false);
  assert.strictEqual(h.element('continue-review').hidden, true);
  await h.timers.shift()();
  assert.strictEqual(h.element('continue-review').hidden, false);
  assert.strictEqual(h.element('work-indicator').hidden, true,
    'the gear stops when the next human decision is ready');
  assert.match(h.element('waiting-text').textContent, /Weitere Fundstellen/u);
  await h.callbacks.get('continue-review')();
  assert.strictEqual(h.calls.filter((call) => call.command === 'continue_review_session').length, 1);
  assert.strictEqual(h.element('work-indicator').hidden, false);
  await h.timers.shift()();
  assert.strictEqual(h.element('review').hidden, false);
  assert.strictEqual(h.element('continue-review').hidden, true);
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 0);
  h.callbacks.get('keep')();
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  await h.timers.shift()();
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 1);
  assert.strictEqual(h.element('work-indicator').hidden, true);
});

testAsync('the working indicator is decorative and respects reduced motion', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/review.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/review.css'), 'utf8');
  assert.match(html, /id="work-indicator"[^>]*hidden/u);
  assert.match(html, /class="work-gear" aria-hidden="true"/u);
  assert.match(css, /\.work-indicator\[hidden\]\{display:none\}/u);
  assert.match(css, /prefers-reduced-motion:reduce/u);
});

testAsync('waiting view offers an explicit safe close action', async () => {
  const h = harness([{ ready: false, run_complete: false }]);
  await new Promise((resolve) => setImmediate(resolve));
  await h.callbacks.get('close-review')();
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 1);
});

done();
