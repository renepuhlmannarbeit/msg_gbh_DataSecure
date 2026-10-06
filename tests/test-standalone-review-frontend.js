'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { buildReviewDraft } = require('../plugins/data-secure/server/companion/text-review');

const { testAsync, done, assert } = createSuite('Standalone review frontend');
const source = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/review.js'), 'utf8');

function harness(sessions = null, allowOrganizationReview = false, singleFinding = false, options = {}) {
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
  const window = { __TAURI__: { core: { invoke } },
    setTimeout(callback) { timers.push(callback); return callback; },
    clearTimeout(callback) { const index = timers.indexOf(callback); if (index >= 0) timers.splice(index, 1); } };
  vm.runInNewContext(source, { window, document: { getElementById: element }, TextDecoder, atob },
    { filename: 'review.js' });
  return { element, callbacks, calls, draft, timers };
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
  assert.equal(h.element('contact-correction').hidden, false);
  assert.equal(h.element('redact-organization').hidden, true);
  assert.match(h.element('group-note').textContent, /Seite\/Bild 2.*Zeile 1/u);
  h.element('contact-value').value = 'bad\n@new.invalid'; h.callbacks.get('redact')();
  assert.equal(h.element('release').disabled, true);
  assert.ok(h.element('contact-error').textContent);
  h.element('contact-value').value = 'right@other.invalid'; h.callbacks.get('redact')();
  assert.equal(h.element('release').disabled, false);
  assert.match(h.element('output-context').textContent, /right@other.invalid/u);
  h.callbacks.get('undo')(); h.callbacks.get('keep')(); h.callbacks.get('release')();
  await new Promise(resolve => setImmediate(resolve));
  const submitted = h.calls.find(call => call.command === 'submit_review');
  assert.equal(submitted.args.answer.decisions[0].decision, 'confirm_contact');
  assert.ok(!Object.hasOwn(submitted.args.answer.decisions[0], 'replacement'));
  assert.equal(h.element('contact-value').value, '');
});

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
  assert.equal(h.element('contact-value').value, '');
  assert.equal(h.element('source-context').textContent, '');
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
  assert.strictEqual(h.element('redact-organization').hidden, false);
  assert.strictEqual(h.element('keep').textContent, 'Beibehalten');
  assert.match(h.element('group-note').textContent, /offenen und folgenden Prüfungen/u);
  h.callbacks.get('redact-organization')();
  assert.match(h.element('output-context').textContent, /\[UNTERNEHMEN_…\]/u);
  assert.strictEqual(h.element('release').disabled, false);
  h.callbacks.get('undo')();
  assert.strictEqual(h.element('release').disabled, true);
  assert.ok(!h.element('output-context').textContent.includes('[UNTERNEHMEN_…]'));
  h.callbacks.get('redact-organization')();
  h.callbacks.get('release')();
  await new Promise((resolve) => setImmediate(resolve));
  const answer = h.calls.find((call) => call.command === 'submit_review').args.answer;
  assert.deepStrictEqual(Array.from(answer.decisions, item => item.decision),
    ['redact_organization', 'redact_organization']);
});

testAsync('old drafts do not silently gain organization decisions', async () => {
  const h = harness();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(h.element('redact-organization').hidden, true);
  h.callbacks.get('redact-organization')();
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
  h.callbacks.get('keep')(); h.callbacks.get('release')();
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
  h.callbacks.get('keep')(); h.callbacks.get('release')();
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
  h.callbacks.get('keep')(); h.callbacks.get('release')();
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
  h.callbacks.get('keep')(); h.callbacks.get('release')();
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
  assert.equal(h.element('document-position').textContent, 'Dokument 1 von 2');
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
done();
