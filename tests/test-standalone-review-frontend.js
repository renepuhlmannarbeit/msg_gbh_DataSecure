'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { buildReviewDraft } = require('../plugins/data-secure/server/companion/text-review');

const { testAsync, done, assert } = createSuite('Standalone review frontend');
const source = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/review.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/review.html'), 'utf8');
const elementIds = new Set([...html.matchAll(/id="([^"]+)"/gu)].map(match => match[1]));

function selectAll(h) { h.callbacks.get('select-visible:change')({ target: { checked: true } }); }
function showStaged(h) { h.element('matrix-filter').value = 'done'; h.callbacks.get('matrix-filter:change')(); }
function applySelected(h, value) {
  h.element('bulk-treatment').value = value;
  h.callbacks.get('bulk-treatment:change')();
  h.callbacks.get('bulk-apply')();
}
function applyCurrent(h, value) {
  const row = h.element('matrix-body').children.find(row => row.dataset.active === 'true');
  if (!row) throw Error('Current row is not visible');
  h.callbacks.get('matrix-body:change')({ target: { dataset: { row: row.dataset.row, action: 'select' }, checked: true } });
  applySelected(h, h.draft.ocr_contact_review ? value === 'redact' ? 'correct_contact' : 'confirm_contact' : value);
}
function editContact(h, value, index = 0) {
  const id = h.draft.ambiguities[index].ambiguity_id;
  const input = h.element('matrix-body').querySelectorAll('input[data-action="correction"]').find(input => input.dataset.row === id);
  assert.ok(input, 'Only actual table correction inputs may be edited'); input.value = value;
  h.callbacks.get('matrix-body:input')({ target: input });
}
function correctionValue(h, index = 0) {
  return h.element('matrix-body').querySelectorAll('input[data-action="correction"]').find(input => input.dataset.row === h.draft.ambiguities[index].ambiguity_id)?.value;
}

function harness(sessions = null, allowOrganizationReview = false, singleFinding = false, options = {}) {
  const callbacks = new Map();
  const elements = new Map();
  const timers = [];
  const createElement = (tag, id = '') => ({
    tagName: tag, id, dataset: {}, children: [], value: '', hidden: false, disabled: false, textContent: '',
    focus() { this.focused = true; },
    append(...values) { this.children.push(...values); },
    replaceChildren(...values) { this.children = values; },
    setAttribute(name, value) { this[name] = value; },
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return descendants;
      if (selector === 'select') return descendants.filter(child => child.tagName === 'select');
      if (selector === '[data-row]') return descendants.filter(child => child.dataset.row !== undefined);
      if (selector === 'input[data-action="correction"]') return descendants.filter(child => child.tagName === 'input' && child.dataset.action === 'correction');
      throw Error(`Unsupported test selector: ${selector}`);
    },
    addEventListener(type, callback) { callbacks.set(type === 'click' ? id : `${id}:${type}`, callback); }
  });
  const element = (id) => {
    assert.ok(elementIds.has(id), `Unknown product element: ${id}`);
    if (!elements.has(id)) elements.set(id, createElement('div', id));
    return elements.get(id);
  };
  const original = 'Denise Koch und Denise Koch.';
  const draft = buildReviewDraft(original, original, 'general', [
    { ambiguity_id: 'person:v1:000001', type: 'person_prose_ambiguous', replacement_kind: 'PERSON',
      original_start: 0, original_end: 11, anonymized_start: 0, anonymized_end: 11 },
    { ambiguity_id: 'person:v1:000002', type: 'person_prose_ambiguous', replacement_kind: 'PERSON',
      original_start: 16, original_end: 27, anonymized_start: 16, anonymized_end: 27 }
  ].slice(0, singleFinding ? 1 : 2), { allowDefer: true, allowOrganizationReview });
  options.modifyDraft?.(draft);
  const data = Buffer.from(JSON.stringify(draft));
  const calls = [];
  let nextSession = 0;
  let currentReviewId = 'a'.repeat(32);
  const normalInvoke = async (command) => {
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
  const invoke = async (command, args) => {
    calls.push({ command, args });
    return options.invoke ? options.invoke(command, args, normalInvoke) : normalInvoke(command, args);
  };
  const listeners = new Map();
  const window = { __TAURI__: { core: { invoke }, event: { async listen(name, callback) { listeners.set(name, callback); return () => {}; } } },
    setTimeout(callback) { timers.push(callback); return callback; },
    clearTimeout(callback) { const index = timers.indexOf(callback); if (index >= 0) timers.splice(index, 1); } };
  const presentation = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/workflow-presentation.js'), 'utf8');
  vm.runInNewContext(presentation + '\n' + source, { window, document: { getElementById: element, createElement }, TextDecoder, atob },
    { filename: 'review.js' });
  return { element, callbacks, calls, draft, timers, listeners };
}

testAsync('contact corrections and confirmations use distinct actions, preserve literal spelling and clear private input after submission', async () => {
  const { buildContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
  const h = harness(null, false, true, { modifyDraft(draft) {
    const original_text = 'E-Mail: wrong@new.invalid';
    for (const key of Object.keys(draft)) delete draft[key];
    Object.assign(draft, buildContactDraft({ original_text, source_type: 'png',
      contacts: [{ start: 8, end: original_text.length, line: 1, page: 2, kind: 'email' }] }));
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('correction-heading').hidden, false);
  assert.equal(h.element('bulk-treatment').children.some(option => option.value === 'redact_organization'), false);
  assert.match(h.element('group-note').textContent, /Seite\/Bild 2.*Zeile 1/u);
  editContact(h, 'bad\n@new.invalid'); applyCurrent(h, 'redact');
  assert.equal(h.element('release').disabled, true);
  assert.ok(h.element('matrix-message').textContent);
  editContact(h, 'right@other.invalid'); applyCurrent(h, 'redact');
  assert.equal(h.element('release').disabled, false);
  showStaged(h);
  assert.match(h.element('output-context').textContent, /right@other.invalid/u);
  h.callbacks.get('undo')(); editContact(h, ''); applyCurrent(h, 'keep'); h.callbacks.get('release')();
  await new Promise(resolve => setImmediate(resolve));
  const submitted = h.calls.find(call => call.command === 'submit_review');
  assert.equal(submitted.args.answer.decisions[0].decision, 'confirm_contact');
  assert.ok(!Object.hasOwn(submitted.args.answer.decisions[0], 'replacement'));
  assert.equal(h.element('matrix-body').children.length, 0);
});

testAsync('the exact current finding is named and one person decision covers every identical occurrence', async () => {
  const h = harness();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.element('matrix-title').focused, true);
  assert.notStrictEqual(h.element('exact-text').focused, true);
  assert.match(html, /id="matrix-title" tabindex="-1"/u);
  assert.strictEqual(h.element('exact-text').textContent, 'Denise Koch');
  assert.match(h.element('group-note').textContent, /2 nachweislich gleiche Fundstellen/u);
  assert.strictEqual(h.element('release').disabled, true);
  applyCurrent(h, 'redact');
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

testAsync('private contact raster is displayed only for its current draft and cleared on close; Markdown mode is explicit', async () => {
  const { encodePng } = require('../plugins/data-secure/server/images/png');
  const { buildContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
  const png = encodePng({ width: 4, height: 3, rgba: Buffer.alloc(48, 255) });
  const h = harness(null, false, true, { modifyDraft(draft) {
    for (const key of Object.keys(draft)) delete draft[key];
    Object.assign(draft, buildContactDraft({ original_text: 'a@b.invalid', source_type: 'pdf', processing_mode: 'markdown-only',
      contacts: [{ start: 0, end: 11, line: 1, page: 1, kind: 'email', image: {
        schema: 'datasecure-ocr-contact-image/1', source_width: 10, source_height: 10,
        x: 2, y: 3, width: 4, height: 3, png_base64: png.toString('base64') } }] }));
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('contact-original').hidden, false);
  assert.equal(h.element('contact-image').src, `data:image/png;base64,${png.toString('base64')}`);
  assert.match(h.element('contact-image-note').textContent, /gerendert/u);
  assert.match(h.element('group-note').textContent, /nicht anonymisiert/u);
  await h.callbacks.get('close-review')();
  assert.equal(h.element('contact-image').src, '');
  assert.equal(h.element('matrix-body').children.length, 0);
  assert.equal(h.element('source-context').textContent, '');
});

testAsync('successive review groups stay in one window and only final completion closes it', async () => {
  const h = harness([
    { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 },
    { ready: true, review_id: 'b'.repeat(32), chunk_count: 1 },
    { ready: false, run_complete: true }
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  applyCurrent(h, 'redact');
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 0);
  await h.timers.shift()();
  assert.strictEqual(h.element('review').hidden, false);
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 0);
  applyCurrent(h, 'redact');
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  await h.timers.shift()();
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 1);
  assert.match(h.element('waiting-text').textContent, /Prüfung dieses Laufs abgeschlossen.*Hauptfenster/u);
  assert.doesNotMatch(h.element('waiting-text').textContent, /Freigabe und Export|Ergebnisprüfung.*geöffnet/u);
  assert.doesNotMatch(h.element('waiting-text').textContent, /Der Lauf ist abgeschlossen/u);
});

testAsync('a single finding explains run-wide reuse without a contradictory only-this-finding claim', async () => {
  const h = harness(null, true, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(h.element('group-note').textContent, /Aktuell angezeigt: eine Fundstelle/u);
  assert.match(h.element('group-note').textContent, /offenen und folgenden Prüfungen dieses Laufs/u);
  assert.ok(!h.element('group-note').textContent.includes('nur für die angezeigte'));
});

testAsync('an explicit company choice covers the group, shows its typed preview and can be undone', async () => {
  const h = harness(null, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.element('bulk-treatment').children.some(option => option.value === 'redact_organization'), true);
  assert.match(h.element('group-note').textContent, /offenen und folgenden Prüfungen/u);
  applyCurrent(h, 'redact_organization');
  showStaged(h);
  assert.match(h.element('output-context').textContent, /\[UNTERNEHMEN_…\]/u);
  assert.strictEqual(h.element('release').disabled, false);
  h.callbacks.get('undo')();
  assert.strictEqual(h.element('release').disabled, true);
  assert.ok(!h.element('output-context').textContent.includes('[UNTERNEHMEN_…]'));
  applyCurrent(h, 'redact_organization');
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  const answer = h.calls.find((call) => call.command === 'submit_review').args.answer;
  assert.deepStrictEqual(Array.from(answer.decisions, item => item.decision),
    ['redact_organization', 'redact_organization']);
});

testAsync('old drafts do not silently gain organization decisions', async () => {
  const h = harness();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.element('bulk-treatment').children.some(option => option.value === 'redact_organization'), false);
  applyCurrent(h, 'redact_organization');
  assert.strictEqual(h.element('release').disabled, true);
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
  applyCurrent(h, 'redact');
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
  applyCurrent(h, 'keep');
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

testAsync('failure before the first draft stops the working indicator and offers a run-bound retry only when ready', async () => {
  const h = harness([
    { ready: false, phase: 'failed', error_code: 'LOCAL_REVIEW_FAILED', continuation_available: false, retry_available: false },
    { ready: false, phase: 'failed', error_code: 'LOCAL_REVIEW_FAILED', continuation_available: true, retry_available: true },
    { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 }
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.element('work-indicator').hidden, true);
  assert.strictEqual(h.element('continue-review').hidden, true);
  assert.match(h.element('waiting-text').textContent, /fehlgeschlagen/u);
  await h.timers.shift()();
  assert.strictEqual(h.element('continue-review').hidden, false);
  assert.strictEqual(h.element('continue-review').textContent, 'Prüfung erneut starten');
  await h.callbacks.get('continue-review')();
  assert.strictEqual(h.calls.filter((call) => call.command === 'continue_review_session').length, 1);
  await h.timers.shift()();
  assert.strictEqual(h.element('review').hidden, false);
});

testAsync('an oversized document gives an actionable limit and never offers an endless identical retry', async () => {
  const h = harness([{ ready: false, phase: 'failed', error_code: 'LOCAL_REVIEW_TOO_LARGE',
    continuation_available: false, retry_available: false }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.element('work-indicator').hidden, true);
  assert.strictEqual(h.element('continue-review').hidden, true);
  assert.match(h.element('waiting-text').textContent, /5\.000/u);
  assert.match(h.element('waiting-text').textContent, /kleinere Quelldateien/u);
});

testAsync('native startup failure names affected files with extensions and a fixed reason without blaming antivirus', async () => {
  const h = harness([{ ready: false, phase: 'failed', error_code: 'LOCAL_REVIEW_START_DENIED',
    continuation_available: true, retry_available: true,
    affected_files: ['Folien.pdf', 'Unterordner/Tabelle.xlsx'] }]);
  await new Promise((resolve) => setImmediate(resolve));
  const message = h.element('waiting-text').textContent;
  assert.match(message, /Betriebssystem.*verweigert/u);
  assert.match(message, /LOCAL_REVIEW_START_DENIED/u);
  assert.match(message, /Folien\.pdf/u);
  assert.match(message, /Unterordner\/Tabelle\.xlsx/u);
  assert.doesNotMatch(message, /Antivirus/iu);
  assert.strictEqual(h.element('continue-review').textContent, 'Prüfung erneut starten');
  assert.strictEqual(h.element('work-indicator').hidden, true);
});

testAsync('an unbound window cannot continue or auto-close using another run', async () => {
  const h = harness([{ ready: false, phase: 'unbound', run_complete: false, continuation_available: false }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.element('work-indicator').hidden, true);
  assert.strictEqual(h.element('continue-review').hidden, true);
  assert.match(h.element('waiting-text').textContent, /passenden Lauf/u);
  assert.strictEqual(h.timers.length, 0);
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 0);
});

testAsync('export debt after worker exit is not shown as continuing background review work', async () => {
  const h = harness([{ ready: false, phase: 'export_pending', run_complete: false, continuation_available: false }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.element('work-indicator').hidden, true);
  assert.strictEqual(h.element('continue-review').hidden, true);
  assert.match(h.element('waiting-text').textContent, /Ergebnisexport/u);
  assert.strictEqual(h.calls.filter((call) => call.command === 'close_review_window').length, 0);
});

testAsync('overlapping status clicks cannot load a stale draft after an accepted answer', async () => {
  let finishChunk;
  const chunkWait = new Promise((resolve) => { finishChunk = resolve; });
  const h = harness([
    { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 },
    { ready: false, run_complete: true }
  ], false, false, { invoke: async (command, args, normal) => {
    if (command === 'get_review_chunk') await chunkWait;
    return normal(command, args);
  } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.element('retry').disabled, true);
  await Promise.all([h.callbacks.get('retry')(), h.callbacks.get('retry')()]);
  assert.equal(h.calls.filter((call) => call.command === 'get_review_chunk').length, 1);
  finishChunk();
  await new Promise((resolve) => setImmediate(resolve));
  applyCurrent(h, 'keep'); h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.element('exact-text').textContent, '');
  await h.timers.shift()();
  assert.equal(h.calls.filter((call) => call.command === 'get_review_chunk').length, 1);
  assert.equal(h.calls.filter((call) => call.command === 'close_review_window').length, 1);
});

testAsync('closing during chunk load invalidates the response and never renders its private text', async () => {
  let finishChunk;
  const chunkWait = new Promise((resolve) => { finishChunk = resolve; });
  const h = harness(null, false, false, { invoke: async (command, args, normal) => {
    if (command === 'get_review_chunk') await chunkWait;
    return normal(command, args);
  } });
  await new Promise((resolve) => setImmediate(resolve));
  await h.callbacks.get('close-review')();
  finishChunk();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.element('exact-text').textContent, '');
  assert.equal(h.element('source-context').textContent, '');
  assert.equal(h.element('review').hidden, true);
  assert.equal(h.timers.length, 0);
});

testAsync('failed continuation retains a fixed reason and filenames and re-arms polling', async () => {
  let failContinuation;
  const continuationWait = new Promise((_resolve, reject) => { failContinuation = reject; });
  const failed = { ready: false, phase: 'failed', error_code: 'LOCAL_REVIEW_START_DENIED',
    continuation_available: true, retry_available: true, affected_files: ['Unterordner/Folien.pdf'] };
  const h = harness([failed, failed], false, false, { invoke: async (command, args, normal) => {
    if (command === 'continue_review_session') return continuationWait;
    return normal(command, args);
  } });
  await new Promise((resolve) => setImmediate(resolve));
  const starting = h.callbacks.get('continue-review')();
  // The old timer is cancelled rather than silently consumed while busy.
  assert.equal(h.timers.length, 0);
  failContinuation('LOCAL_REVIEW_START_DENIED');
  await starting;
  assert.match(h.element('waiting-text').textContent, /LOCAL_REVIEW_START_DENIED/u);
  assert.match(h.element('waiting-text').textContent, /Unterordner\/Folien\.pdf/u);
  assert.equal(h.timers.length, 1);
  await h.timers.shift()();
  assert.equal(h.element('continue-review').hidden, false);
  assert.match(h.element('waiting-text').textContent, /Folien\.pdf/u);
});

testAsync('unconfirmed continuation preserves its target names while the next status is still preparing', async () => {
  const h = harness([
    { ready: false, phase: 'retry_available', continuation_available: true,
      affected_files: ['Unterordner/Folien.pdf'] },
    { ready: false, phase: 'preparing', worker_active: true, continuation_available: false }
  ], false, false, { invoke: async (command, args, normal) => {
    if (command === 'continue_review_session') throw 'LOCAL_REVIEW_START_DENIED';
    return normal(command, args);
  } });
  await new Promise((resolve) => setImmediate(resolve));
  await h.callbacks.get('continue-review')();
  await h.timers.shift()();
  assert.match(h.element('waiting-text').textContent, /LOCAL_REVIEW_START_DENIED/u);
  assert.match(h.element('waiting-text').textContent, /Unterordner\/Folien\.pdf/u);
  assert.match(h.element('waiting-text').textContent, /letzten Fortsetzungsversuch/u);
  assert.equal(h.timers.length, 1);
});

testAsync('a lost answer acknowledgement reconciles publication without claiming nothing was released', async () => {
  const h = harness([
    { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 },
    { ready: false, phase: 'publishing', run_complete: false, worker_active: true },
    { ready: false, phase: 'complete', run_complete: true }
  ], false, false, { invoke: async (command, args, normal) => {
    if (command === 'submit_review') throw Error('lost after worker accepted');
    return normal(command, args);
  } });
  await new Promise((resolve) => setImmediate(resolve));
  applyCurrent(h, 'keep'); h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(h.element('waiting-text').textContent, /Bestätigung.*unklar/u);
  assert.doesNotMatch(h.element('summary').textContent, /nichts freigegeben/u);
  assert.equal(h.element('review').hidden, true);
  assert.equal(h.calls.filter((call) => call.command === 'submit_review').length, 1);
  await h.timers.shift()();
  assert.equal(h.calls.filter((call) => call.command === 'close_review_window').length, 1);
  assert.equal(h.calls.filter((call) => call.command === 'submit_review').length, 1);
});

testAsync('an unaccepted answer returns to the same draft with choices but never automatic resubmission', async () => {
  const h = harness(null, false, false, { invoke: async (command, args, normal) => {
    if (command === 'submit_review') return { accepted: false };
    return normal(command, args);
  } });
  await new Promise((resolve) => setImmediate(resolve));
  applyCurrent(h, 'keep'); h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.element('review').hidden, false);
  assert.equal(h.element('release').disabled, false);
  assert.match(h.element('summary').textContent, /weiterhin offen/u);
  assert.doesNotMatch(h.element('summary').textContent, /nichts freigegeben/u);
  assert.equal(h.calls.filter((call) => call.command === 'submit_review').length, 1);
});

testAsync('a failed status lookup after uncertain submission retains uncertainty and retries with backoff', async () => {
  let sessions = 0;
  const h = harness(null, false, false, { invoke: async (command, args, normal) => {
    if (command === 'get_review_session' && ++sessions > 1) throw Error('private vendor details');
    if (command === 'submit_review') throw Error('lost acknowledgement');
    return normal(command, args);
  } });
  await new Promise((resolve) => setImmediate(resolve));
  applyCurrent(h, 'keep'); h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(h.element('waiting-text').textContent, /Bereits geprüfte Ergebnisse können verfügbar sein/u);
  assert.doesNotMatch(h.element('waiting-text').textContent, /private vendor|nichts freigegeben/u);
  assert.equal(h.timers.length, 1);
});

testAsync('document position uses opaque backend IDs, never separators present in source text', async () => {
  const h = harness(null, true, false, { modifyDraft(draft) {
    draft.original_text = '===== Dokument 99 von 99 =====\n' + draft.original_text;
    draft.batch_review = { document_count: 2, documents: [
      { document_index: 1, candidate_ids: draft.ambiguities.map(item => item.ambiguity_id) },
      { document_index: 2, candidate_ids: [] }
    ] };
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.element('document-position').textContent, /Dokument 1 von 2/u);
});
testAsync('missing duplicate or unknown document metadata rejects the draft before any decision', async () => {
  for (const kind of ['missing', 'duplicate', 'unknown']) {
    const h = harness(null, true, false, { modifyDraft(draft) {
      const ids = draft.ambiguities.map(item => item.ambiguity_id);
      draft.batch_review = { document_count: 2, documents: kind === 'missing' ? [] : [
        { document_index: 1, candidate_ids: ids },
        { document_index: 2, candidate_ids: kind === 'duplicate' ? [ids[0]] : ['unknown-id'] }
      ] };
    } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.element('review').hidden, true);
    assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
  }
});
testAsync('matrix groups proven entities, offers every occurrence context, and never preselects or decides a checkbox', async () => {
  const h = harness(null, true, false, { modifyDraft(draft) {
    draft.batch_review = { document_count: 2, documents: draft.ambiguities.map((item, index) => ({
      document_index: index + 1, source_label: `file-${index + 1}.pdf`, candidate_ids: [item.ambiguity_id] })) };
  } });
  await new Promise(resolve => setImmediate(resolve));
  const rows = h.element('matrix-body').children;
  assert.equal(rows.length, 1); assert.equal(rows[0].children[0].children[0].checked, false);
  assert.equal(h.element('occurrence').children.length, 2);
  h.element('occurrence').value = h.draft.ambiguities[1].ambiguity_id;
  h.callbacks.get('occurrence:change')({ target: h.element('occurrence') });
  assert.match(h.element('document-position').textContent, /file-2.pdf/u);
  selectAll(h);
  assert.equal(h.element('release').disabled, true);
  applySelected(h, 'redact_organization');
  assert.equal(h.element('release').disabled, false);
  showStaged(h);
  assert.match(h.element('output-context').textContent, /\[UNTERNEHMEN_…\].*\[UNTERNEHMEN_…\]/u);
  h.callbacks.get('undo')(); assert.equal(h.element('release').disabled, true);
});

testAsync('matrix keeps identical OCR readings separate with live individual corrections and requires re-confirmation after edits', async () => {
  const { buildContactBatch } = require('../plugins/data-secure/server/gateway/ocr-contact-batch');
  const h = harness(null, false, true, { modifyDraft(draft) {
    for (const key of Object.keys(draft)) delete draft[key];
    Object.assign(draft, buildContactBatch(['one.png', 'two.png'].map(source_label => ({ source_label,
      input: { original_text: 'same@wrong.invalid', source_type: 'png',
        contacts: [{ start: 0, end: 18, page: 1, line: 1, kind: 'email' }] } }))).draft);
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('matrix-body').children.length, 2);
  h.element('matrix-filter').value = 'all'; h.callbacks.get('matrix-filter:change')();
  for (const [index, replacement] of ['first@new.invalid', 'second@new.invalid'].entries()) {
    const id = h.draft.ambiguities[index].ambiguity_id;
    editContact(h, replacement, index);
    assert.ok(h.element('output-context').textContent.includes(replacement));
    h.callbacks.get('matrix-body:change')({ target: { dataset: { row: id, action: 'select' }, checked: true } });
  }
  assert.equal(h.element('release').disabled, true, 'Typing and selection alone cannot decide');
  applySelected(h, 'correct_contact');
  assert.equal(h.element('release').disabled, false);
  editContact(h, 'changed@new.invalid', 1);
  assert.equal(h.element('release').disabled, true);
  applyCurrent(h, 'redact'); h.callbacks.get('release')();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(h.calls.find(call => call.command === 'submit_review').args.answer.decisions, item => item.replacement),
    ['first@new.invalid', 'changed@new.invalid']);
  assert.equal(h.element('matrix-body').children.length, 0);
  assert.equal(h.element('occurrence').children.length, 0);
  assert.equal(h.element('matrix-search').value, '');
});

testAsync('Undo restores the same OCR value in editor, preview and submitted answer after an intervening edit', async () => {
  const { buildContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
  const h = harness(null, false, true, { modifyDraft(draft) {
    for (const key of Object.keys(draft)) delete draft[key];
    Object.assign(draft, buildContactDraft({ original_text: 'same@wrong.invalid', source_type: 'png',
      contacts: [{ start: 0, end: 18, page: 1, line: 1, kind: 'email' }] }));
  } });
  await new Promise(resolve => setImmediate(resolve));
  editContact(h, 'first@new.invalid'); applyCurrent(h, 'redact');
  showStaged(h);
  applySelected(h, 'reset'); // no selected rows: no action
  h.callbacks.get('matrix-body:change')({ target: { dataset: { row: h.draft.ambiguities[0].ambiguity_id, action: 'select' }, checked: true } });
  applySelected(h, 'reset');
  h.element('matrix-filter').value = 'open'; h.callbacks.get('matrix-filter:change')();
  editContact(h, 'second@new.invalid');
  h.callbacks.get('undo')();
  showStaged(h);
  assert.equal(correctionValue(h), 'first@new.invalid');
  assert.equal(h.element('output-context').textContent, 'first@new.invalid');
  assert.equal(h.element('release').disabled, false);
  h.callbacks.get('release')(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.find(call => call.command === 'submit_review').args.answer.decisions[0].replacement, 'first@new.invalid');
});

testAsync('individually correcting a selected OCR row cannot leave a hidden bulk-confirmation that overwrites it', async () => {
  const { buildContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
  const h = harness(null, false, true, { modifyDraft(draft) {
    for (const key of Object.keys(draft)) delete draft[key];
    Object.assign(draft, buildContactDraft({ original_text: 'same@wrong.invalid', source_type: 'png',
      contacts: [{ start: 0, end: 18, page: 1, line: 1, kind: 'email' }] }));
  } });
  await new Promise(resolve => setImmediate(resolve));
  selectAll(h);
  editContact(h, 'correct@new.invalid'); applyCurrent(h, 'redact');
  assert.equal(h.element('matrix-body').children.length, 0, 'Staged rows leave the open-first view without losing the decision');
  assert.equal(h.element('bulk-apply').disabled, true);
  applySelected(h, 'confirm_contact'); h.callbacks.get('release')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.find(call => call.command === 'submit_review').args.answer.decisions[0].replacement, 'correct@new.invalid');
});

testAsync('5,000 singleton findings render only 50 rows; paging preserves selection and filtering clears it', async () => {
  const h = harness(null, true, true, { modifyDraft(draft) {
    draft.original_text = draft.anonymized_text = 'Acme\n'.repeat(5000);
    draft.decision_groups = [];
    draft.ambiguities = Array.from({ length: 5000 }, (_, index) => ({ ambiguity_id: `credential:v2:${index}`,
      type: 'credential_issuer_ambiguous', original_start: index * 5, original_end: index * 5 + 4,
      anonymized_start: index * 5, anonymized_end: index * 5 + 4 }));
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('matrix-body').children.length, 50);
  selectAll(h); h.element('bulk-treatment').value = 'keep'; h.callbacks.get('bulk-treatment:change')();
  assert.equal(h.element('bulk-apply').disabled, false);
  assert.equal(h.element('bulk-treatment').children.find(option => option.value === 'redact_organization').disabled, true, 'issuer rows cannot silently become companies');
  h.callbacks.get('matrix-next')(); assert.equal(h.element('bulk-apply').disabled, false);
  assert.equal(h.element('select-visible').checked, false, 'Only the first page is selected');
  assert.equal(h.element('select-visible').indeterminate, false, 'Off-page selection is not a mixed checkbox on this page');
  assert.equal(h.element('matrix-body').children.length, 50);
  selectAll(h); h.element('matrix-search').value = 'not present';
  h.callbacks.get('matrix-search:input')(); assert.equal(h.element('bulk-apply').disabled, true);
  assert.equal(h.element('matrix-body').children.length, 0);
});

testAsync('checkboxes and treatment changes only prepare an action; Apply is the single decision entry point', async () => {
  const h = harness(null, true);
  await new Promise(resolve => setImmediate(resolve));
  selectAll(h);
  assert.equal(h.element('select-visible').checked, true);
  h.element('bulk-treatment').value = 'keep'; h.callbacks.get('bulk-treatment:change')();
  assert.equal(h.element('release').disabled, true);
  assert.match(h.element('summary').textContent, /^0 von/u);
  assert.match(h.element('matrix-progress').textContent, /^0 von .* offen$/u);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
  assert.equal(h.element('matrix-body').querySelectorAll('select').length, 0);
  const metadata = h.element('matrix-body').children[0].children[1].children[1];
  assert.equal(metadata.className, 'row-meta');
  assert.equal(metadata.children[0].title, metadata.children[0].textContent, 'Compact metadata retains its complete document label');
  assert.equal(metadata.children[1].textContent, 'Offen', 'The status stays beside the document, not in a repeated action column');
  for (const obsolete of ['redact', 'keep', 'contact-value', 'bulk-keep']) assert.ok(!elementIds.has(obsolete));
  h.callbacks.get('bulk-apply')();
  assert.equal(h.element('release').disabled, false);
  assert.equal(h.element('matrix-body').children.length, 0, 'Open-first view removes staged rows');
  assert.equal(h.element('matrix-detail').hidden, true, 'An empty open view cannot display stale original or output context');
  assert.equal(h.element('output-context').textContent, '');
  assert.match(h.element('summary').textContent, /vorgemerkt.*Noch nicht übergeben/u);
  assert.match(h.element('matrix-progress').textContent, /vorgemerkt · 0 offen$/u);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
});

function twoContactHarness() {
  const { buildContactBatch } = require('../plugins/data-secure/server/gateway/ocr-contact-batch');
  return harness(null, false, true, { modifyDraft(draft) {
    for (const key of Object.keys(draft)) delete draft[key];
    Object.assign(draft, buildContactBatch(['one.png', 'two.png'].map(source_label => ({ source_label,
      input: { original_text: 'same@wrong.invalid', source_type: 'png',
        contacts: [{ start: 0, end: 18, page: 1, line: 1, kind: 'email' }] } }))).draft);
  } });
}

function manyContactHarness() {
  const { buildContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
  return harness(null, false, true, { modifyDraft(draft) {
    const values = Array.from({ length: 64 }, (_, index) => `qa${String(index).padStart(2, '0')}@quality.example.invalid`);
    const original_text = values.join('\n');
    let offset = 0;
    const contacts = values.map((value, index) => {
      const result = { start: offset, end: offset + value.length, page: 1, line: index + 1, kind: 'email' };
      offset += value.length + 1; return result;
    });
    for (const key of Object.keys(draft)) delete draft[key];
    Object.assign(draft, buildContactDraft({ original_text, source_type: 'png', processing_mode: 'markdown-only', contacts }));
  } });
}

testAsync('OCR contact review filters by affected document without submitting or losing staged decisions', async () => {
  const h = twoContactHarness(); await new Promise(resolve => setImmediate(resolve));
  const filter = h.element('matrix-document');
  assert.equal(h.element('matrix-document-label').hidden, false);
  assert.equal(filter.children.length, 3);
  assert.match(filter.children[1].textContent, /one\.png \(1 Werte\)/u);
  assert.match(filter.children[2].textContent, /two\.png \(1 Werte\)/u);
  filter.value = '1'; h.callbacks.get('matrix-document:change')();
  assert.equal(h.element('matrix-body').children.length, 1);
  assert.match(h.element('matrix-count').textContent, /^1 von 2 Zeilen/u);
  selectAll(h); applySelected(h, 'confirm_contact');
  assert.match(h.element('summary').textContent, /^1 von 2 OCR-Kontaktwerten/u);
  filter.value = '2'; h.callbacks.get('matrix-document:change')();
  assert.equal(h.element('matrix-body').children.length, 1);
  assert.match(h.element('matrix-count').textContent, /0 angehakt/u);
  assert.equal(h.element('release').disabled, true);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
  selectAll(h); applySelected(h, 'confirm_contact');
  assert.equal(h.element('release').disabled, false);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
});

testAsync('open-first bulk review replaces 50 staged rows with the remaining 14 and explains the explicit final handoff', async () => {
  const h = manyContactHarness(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('matrix-title').textContent, 'OCR-Kontaktwerte vor Abschluss prüfen');
  assert.match(h.element('summary').textContent, /0 von 64 OCR-Kontaktwerten.*1 Dokument betroffen/u);
  assert.match(h.element('matrix-guide').textContent, /keine 64 Konvertierungsfehler/u);
  assert.match(h.element('matrix-explanation').textContent, /Anwenden merkt Entscheidungen nur vor/u);
  assert.equal(h.element('matrix-filter').value, 'open');
  assert.match(h.element('select-filtered').textContent, /64 gefilterten Zeilen.*alle Seiten/u);
  assert.match(h.element('select-visible')['aria-label'], /Nur diese Seite.*50 Zeilen/u);
  assert.match(h.element('bulk-hint').textContent, /Häkchen allein bestätigen nichts/u);
  assert.match(h.element('release-hint').textContent, /Noch 64 Fundstellen offen/u);
  selectAll(h); applySelected(h, 'confirm_contact');
  assert.equal(h.element('matrix-body').children.length, 14);
  assert.match(h.element('exact-text').textContent, /^qa50@/u, 'Comparison follows the first remaining open row');
  assert.match(h.element('matrix-message').textContent, /14 .*offen/u);
  assert.equal(h.element('release').disabled, true);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
  selectAll(h); applySelected(h, 'confirm_contact');
  assert.equal(h.element('matrix-body').children.length, 0);
  assert.match(h.element('matrix-empty').textContent, /Alle 64.*vorgemerkt.*64 OCR-Entscheidungen speichern und fortfahren/u);
  assert.equal(h.element('matrix-empty').hidden, false);
  assert.equal(h.element('release').disabled, false);
  assert.match(h.element('release-hint').textContent, /Alle 64 Fundstellen vorgemerkt/u);
  assert.equal(h.element('release').focused, true);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false, 'Completing the list never auto-submits');
  h.element('matrix-filter').value = 'done'; h.callbacks.get('matrix-filter:change')();
  assert.equal(h.element('matrix-body').children.length, 50, 'Staged decisions remain inspectable');
  h.callbacks.get('undo')();
  assert.equal(h.element('matrix-filter').value, 'open');
  assert.equal(h.element('matrix-body').children.length, 14);
  assert.equal(h.element('release').disabled, true);
});

testAsync('all filtered rows can be selected across pages without deciding; only Apply stages and explicit handoff submits all 64', async () => {
  const h = manyContactHarness(); await new Promise(resolve => setImmediate(resolve));
  h.callbacks.get('select-filtered')();
  assert.match(h.element('matrix-count').textContent, /64 angehakt/u);
  assert.match(h.element('bulk-hint').textContent, /Auswahl allein bestätigt nichts/u);
  assert.match(h.element('summary').textContent, /^0 von/u);
  h.callbacks.get('matrix-next')();
  assert.match(h.element('matrix-count').textContent, /64 angehakt/u);
  assert.equal(h.element('select-visible').checked, true);
  applySelected(h, 'confirm_contact');
  assert.equal(h.element('release').disabled, false);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
  h.callbacks.get('release')(); await new Promise(resolve => setImmediate(resolve));
  const answer = h.calls.find(call => call.command === 'submit_review').args.answer;
  assert.equal(answer.decisions.length, 64);
  assert.ok(answer.decisions.every(item => item.decision === 'confirm_contact'));
});

testAsync('Undo of Reset shows restored staged rows and comparison instead of hiding all 64 behind the open filter', async () => {
  const h = manyContactHarness(); await new Promise(resolve => setImmediate(resolve));
  h.callbacks.get('select-filtered')(); applySelected(h, 'confirm_contact');
  showStaged(h); h.callbacks.get('select-filtered')(); applySelected(h, 'reset');
  assert.match(h.element('summary').textContent, /^0 von 64/u);
  h.callbacks.get('undo')();
  assert.equal(h.element('matrix-filter').value, 'done');
  assert.equal(h.element('matrix-body').children.length, 50);
  assert.equal(h.element('matrix-detail').hidden, false);
  assert.match(h.element('exact-text').textContent, /^qa00@/u);
  assert.match(h.element('matrix-message').textContent, /rückgängig.*64.*vorgemerkt.*0 offen/u);
  assert.equal(h.element('release').disabled, false);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
});

testAsync('Undo of a mixed Reset keeps both restored staged and open rows visible without hidden selection', async () => {
  const h = manyContactHarness(); await new Promise(resolve => setImmediate(resolve));
  selectAll(h); applySelected(h, 'confirm_contact');
  h.element('matrix-filter').value = 'all'; h.callbacks.get('matrix-filter:change')();
  h.callbacks.get('select-filtered')(); applySelected(h, 'reset');
  h.callbacks.get('undo')();
  assert.equal(h.element('matrix-filter').value, 'all');
  assert.equal(h.element('matrix-body').children.length, 50);
  assert.match(h.element('summary').textContent, /^50 von 64/u);
  assert.match(h.element('matrix-count').textContent, /0 angehakt/u);
  assert.match(h.element('matrix-message').textContent, /rückgängig.*50.*vorgemerkt.*14 offen/u);
  assert.equal(h.element('release').disabled, true);
  h.callbacks.get('matrix-next')();
  assert.equal(h.element('matrix-body').children.length, 14);
  assert.match(h.element('exact-text').textContent, /^qa50@/u);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
});

testAsync('group-wide unchanged confirmation atomically rejects an edited off-page contact and filters never retain hidden selection', async () => {
  const h = manyContactHarness(); await new Promise(resolve => setImmediate(resolve));
  h.callbacks.get('matrix-next')(); editContact(h, 'correct@new.invalid', 63);
  h.callbacks.get('matrix-prev')(); h.callbacks.get('select-filtered')();
  applySelected(h, 'confirm_contact');
  assert.match(h.element('matrix-message').textContent, /Nichts angewendet.*qa63@/u);
  assert.match(h.element('summary').textContent, /^0 von/u);
  assert.equal(h.element('release').disabled, true);
  h.element('matrix-search').value = 'qa00@'; h.callbacks.get('matrix-search:input')();
  assert.match(h.element('matrix-count').textContent, /0 angehakt/u);
  h.callbacks.get('select-filtered')(); applySelected(h, 'confirm_contact');
  assert.match(h.element('summary').textContent, /^1 von 64/u);
  assert.match(h.element('matrix-empty').textContent, /Filter/u, 'No search matches is not a claim of complete review');
  assert.equal(h.element('release').disabled, true);
});

testAsync('bulk validation is atomic and unchanged confirmation never discards pending corrections', async () => {
  const h = twoContactHarness(); await new Promise(resolve => setImmediate(resolve));
  editContact(h, 'first@new.invalid', 0); editContact(h, 'not an email', 1);
  selectAll(h); applySelected(h, 'correct_contact');
  assert.match(h.element('matrix-message').textContent, /Nichts angewendet.*two.png/u);
  assert.match(h.element('summary').textContent, /^0 von/u);
  applySelected(h, 'confirm_contact');
  assert.match(h.element('matrix-message').textContent, /geänderte Eingabe/u);
  assert.equal(correctionValue(h), 'first@new.invalid');
  assert.equal(h.element('release').disabled, true);
  editContact(h, 'second@new.invalid', 1); applySelected(h, 'correct_contact');
  assert.equal(h.element('release').disabled, false);
  h.callbacks.get('release')(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(h.calls.find(call => call.command === 'submit_review').args.answer.decisions, item => item.replacement),
    ['first@new.invalid', 'second@new.invalid']);
});

testAsync('editing a staged-filter row reopens it without hidden selection or losing the editor', async () => {
  const h = twoContactHarness(); await new Promise(resolve => setImmediate(resolve));
  selectAll(h); applySelected(h, 'confirm_contact');
  h.element('matrix-filter').value = 'done'; h.callbacks.get('matrix-filter:change')();
  selectAll(h); editContact(h, 'correct@new.invalid');
  assert.equal(h.element('matrix-filter').value, 'all');
  assert.equal(h.element('matrix-body').children.length, 2);
  assert.equal(correctionValue(h), 'correct@new.invalid');
  assert.equal(h.element('bulk-apply').disabled, true);
  assert.equal(h.element('select-visible').checked, false);
  assert.equal(h.element('release').disabled, true);
  assert.match(h.element('matrix-message').textContent, /wieder offen.*aufgehoben/u);
});

testAsync('pending row edits survive navigation and filtering, Undo restores the whole pre-Apply state', async () => {
  const h = twoContactHarness(); await new Promise(resolve => setImmediate(resolve));
  editContact(h, 'first@new.invalid');
  h.callbacks.get('finding-next')(); h.callbacks.get('finding-prev')();
  assert.equal(correctionValue(h), 'first@new.invalid');
  const id = h.draft.ambiguities[0].ambiguity_id;
  h.callbacks.get('matrix-body:change')({ target: { dataset: { row: id, action: 'select' }, checked: true } });
  assert.equal(h.element('select-visible').indeterminate, true);
  h.element('matrix-search').value = 'one.png'; h.callbacks.get('matrix-search:input')();
  assert.equal(h.element('select-visible').checked, false);
  assert.match(h.element('matrix-message').textContent, /aufgehoben.*Eingaben/u);
  selectAll(h); applySelected(h, 'correct_contact');
  h.callbacks.get('undo')();
  assert.equal(correctionValue(h), 'first@new.invalid');
  assert.equal(h.element('release').disabled, true, 'Undo restores pending, not implicitly approved, correction');
  assert.match(h.element('summary').textContent, /^0 von/u);
});

testAsync('a disconnected review blocks decisions and polling but still closes its native window', async () => {
  const h = harness(); await new Promise(resolve => setImmediate(resolve));
  h.listeners.get('datasecure-connection')({payload: {state: 'recovering', epoch: 1}});
  h.callbacks.get('release')(); h.callbacks.get('retry')();
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
  h.callbacks.get('close-review')(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.filter(call => call.command === 'close_review_window').length, 1);
});

testAsync('the explicit handoff button counts actual occurrence decisions, not grouped rows', async () => {
  const h = harness(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('release').textContent, '2 Entscheidungen speichern und fortfahren');
  assert.equal(h.element('release').disabled, true);
  selectAll(h); applySelected(h, 'keep');
  assert.equal(h.element('release').disabled, false);
  assert.equal(h.calls.some(call => call.command === 'submit_review'), false);
});

done();
