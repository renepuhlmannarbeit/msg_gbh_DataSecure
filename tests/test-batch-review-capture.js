'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchReviewCapture } = require('../plugins/data-secure/server/gateway/batch-review-capture');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('Batch review capture boundary');

function reviewError(code, message) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

function fixture(options = {}) {
  const events = [];
  const entry = Object.hasOwn(options, 'entry') ? options.entry : { opaque_entry: true };
  const state = { schema: 'datasecure-batch/4', profile: 'personnel_profile', remove_images: true,
    product_channel: options.productChannel || 'standalone', untouched: 'state' };
  const item = { id: 'item', untouched: 'item' };
  const stateBefore = structuredClone(state);
  const itemBefore = structuredClone(item);
  let capturedOptions;
  let externalReviewCalls = 0;
  const capture = createBatchReviewCapture({
    exactPendingEntry(valueState, valueItem) {
      events.push('entry');
      assert.strictEqual(valueState, state);
      assert.strictEqual(valueItem, item);
      if (Object.hasOwn(options, 'entryError')) throw options.entryError;
      return entry;
    },
    packageIdForItem(valueItem) {
      events.push('package-id');
      assert.strictEqual(valueItem, item);
      if (Object.hasOwn(options, 'packageError')) throw options.packageError;
      return 'deterministic-package';
    },
    localReviewError: reviewError,
    withBatchPseudonymRegistry: options.withBatchPseudonymRegistry,
    captureStandaloneReview: options.captureStandaloneReview,
    contactStore: options.contactStore,
    async anonymizeNext(profile, callOptions) {
      events.push('anonymize');
      capturedOptions = callOptions;
      assert.strictEqual(profile, state.profile);
      if (Object.hasOwn(options, 'pipelineError')) throw options.pipelineError;
      if (Object.hasOwn(options, 'ocrInput')) {
        await callOptions.prepareOcrContacts(options.ocrInput);
        throw new Error('UNREACHABLE_AFTER_OCR_CAPTURE');
      }
      if (options.skipCallback) {
        if (options.spoofSentinel) throw reviewError('BATCH_REVIEW_CAPTURED', 'spoof');
        return { should_not_publish: true };
      }
      if (options.swallowSentinel) {
        try { callOptions.reviewText(options.draft); } catch { return { unsafe_normal_return: true }; }
      } else {
        callOptions.reviewText(options.draft);
      }
      throw new Error('UNREACHABLE_AFTER_SENTINEL');
    }
  });
  const deps = {
    marker: 'kept',
    inputQueue: [{ attacker: true }],
    copyClaim: false,
    removeImages: false,
    packageId: 'attacker-package',
    suppressDiagnostic: false,
    reviewText() { externalReviewCalls++; }
  };
  return {
    state,
    item,
    entry,
    events,
    deps,
    stateBefore,
    itemBefore,
    run: () => capture.captureDeferredReviewInput(state, item, deps),
    callOptions: () => capturedOptions,
    externalReviewCalls: () => externalReviewCalls
  };
}

//73: source ownership is acquired only when exactPendingEntry returns.
// A Buffer from that private read is distinct from user original bytes and
// from strings/images still needed by the pending review.
function privateEntry73() {
  const original = Buffer.from('synthetic original Anna Berger / ÄÖÜß', 'utf8');
  const acquired = Buffer.from(original), unrelated = Buffer.from('unrelated synthetic bytes');
  return { original, acquired, unrelated,
    entry: { opaque_entry: true, private_artifact_plain: true, private_bytes: acquired } };
}
function primaries73() {
  return [reviewError('MODEL_EARLY_CAPTURE_FAILURE', 'synthetic early capture failure'), undefined, null, false, 0, ''];
}
async function preservesPrimary73(action, expected) {
  let failed = false, caught;
  try { await action(); } catch (error) { failed = true; caught = error; }
  assert.equal(failed, true, 'the intended failure must actually be thrown');
  assert.strictEqual(caught, expected);
}
function zeroed73(bytes) {
  assert.ok(Buffer.isBuffer(bytes)); assert.ok(bytes.length > 0);
  assert.deepEqual(bytes, Buffer.alloc(bytes.length), 'the acquired private read copy is explicitly zeroed');
}
async function main() {
  await testAsync('the direct privacy-capture entry rejects both raw schemas before source access', async () => {
    for (const schema of ['datasecure-batch/5', 'datasecure-batch/7']) {
      const value = fixture({ draft: { ambiguities: [{}] } }); Object.assign(value.state, { schema, processing_mode: 'markdown-only', remove_images: false,
        ...(schema === 'datasecure-batch/7' ? { standalone_document_review: true, content_options: {
          schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false } } : {}) });
      await assert.rejects(value.run(), error => error.code === 'PROCESSING_MODE_FORBIDDEN');
      assert.deepEqual(value.events, []);
    }
  });
  await testAsync('a valid draft is captured in memory with the exact pipeline contract', async () => {
    const draft = { ambiguities: [{ kind: 'issuer' }], raw: 'local-only' };
    const value = fixture({ draft });
    const result = await value.run();
    assert.strictEqual(result, draft);
    assert.deepStrictEqual(value.events, ['entry', 'package-id', 'anonymize']);
    assert.deepStrictEqual(value.callOptions().inputQueue, [value.entry]);
    assert.strictEqual(value.callOptions().copyClaim, true);
    assert.strictEqual(value.callOptions().removeImages, true);
    assert.strictEqual(value.callOptions().productChannel, 'standalone');
    assert.strictEqual(value.callOptions().packageId, 'deterministic-package');
    assert.strictEqual(value.callOptions().suppressDiagnostic, true);
  });

  await testAsync('caller dependencies cannot replace capture security controls', async () => {
    const value = fixture({ draft: { ambiguities: [{}] } });
    await value.run();
    assert.strictEqual(value.callOptions().marker, 'kept');
    assert.notStrictEqual(value.callOptions().reviewText, value.deps.reviewText);
    assert.strictEqual(value.externalReviewCalls(), 0);
    assert.deepStrictEqual(value.callOptions().inputQueue, [value.entry]);
    assert.strictEqual(value.callOptions().copyClaim, true);
    assert.strictEqual(value.callOptions().suppressDiagnostic, true);
  });

  await testAsync('snapshot binding failures stop before the pipeline without mutation', async () => {
    const error = reviewError('BATCH_SNAPSHOT_CHANGED', 'snapshot changed');
    const value = fixture({ entryError: error });
    await assert.rejects(value.run(), (caught) => caught === error);
    assert.deepStrictEqual(value.events, ['entry']);
    assert.deepStrictEqual(value.state, value.stateBefore);
    assert.deepStrictEqual(value.item, value.itemBefore);
  });

  await testAsync('every non-sentinel pipeline error is propagated unchanged', async () => {
    for (const error of [new Error('PIPELINE_FAILED'), reviewError('PARSER_START_FAILED', 'parser failed')]) {
      const value = fixture({ pipelineError: error });
      await assert.rejects(value.run(), (caught) => caught === error);
      assert.strictEqual(value.events.filter((event) => event === 'anonymize').length, 1);
    }
  });

  await testAsync('sentinel spoofing and incomplete drafts fail closed without raw details', async () => {
    const cases = [
      { skipCallback: true, spoofSentinel: true },
      { draft: undefined },
      { draft: {} },
      { draft: { ambiguities: null } },
      { draft: { ambiguities: [] } },
      { draft: { ambiguities: [{}] }, swallowSentinel: true }
    ];
    for (const options of cases) {
      const value = fixture(options);
      await assert.rejects(value.run(), (error) => {
        assert.strictEqual(error.code, 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
        assert.doesNotMatch(error.message, /local-only|attacker|deterministic-package/u);
        return true;
      });
    }
  });

  await testAsync('Standalone accepts an exact reconstructed draft already resolved by its run registry', async () => {
    const draft = { original_text: 'Erika Beispiel', anonymized_text: '[PERSON_001]', ambiguities: [] };
    const value = fixture({ draft });
    assert.strictEqual(await value.run(), draft);
    assert.deepStrictEqual(value.events, ['entry', 'package-id', 'anonymize']);
    await assert.rejects(fixture({ draft, productChannel: 'plugin' }).run(),
      (error) => error.code === 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
  });

  await testAsync('capture preserves object identity, inputs and the batch test facade', async () => {
    const draft = { ambiguities: [{ value: 'secret' }], nested: { unchanged: true } };
    const value = fixture({ draft });
    assert.strictEqual(await value.run(), draft);
    assert.deepStrictEqual(value.state, value.stateBefore);
    assert.deepStrictEqual(value.item, value.itemBefore);
    assert.deepStrictEqual(value.entry, { opaque_entry: true });
    assert.strictEqual(typeof batchFacade._test.captureDeferredReviewInput, 'function');
  });
  await testAsync('internal quality capture binds the exact privacy source without changing the draft or public journal', async () => {
    const draft = { original_text: 'SYNTHETISCHE QUELLE', anonymized_text: '[PERSON_001]', ambiguities: [{}] };
    const value = fixture({ draft }); value.item.source_label = 'synthetic.csv';
    let observed;
    value.deps.onReviewSourceCaptured = event => { observed = event; assert.ok(Object.isFrozen(event)); };
    assert.strictEqual(await value.run(), draft);
    assert.deepEqual(observed, { sourceLabel: 'synthetic.csv', originalText: draft.original_text });
    assert.deepEqual(value.state, value.stateBefore);
    assert.equal(Object.hasOwn(value.item, 'originalText'), false);
  });

  await testAsync('73 privacy sentinel returns the same draft but clears only its acquired source Buffer', async () => {
    const e = privateEntry73(), beforeOriginal = Buffer.from(e.original), beforeUnrelated = Buffer.from(e.unrelated);
    const draft = { original_text: 'synthetic Anna Berger ÄÖÜß', anonymized_text: '[PERSON_001]',
      ambiguities: [{ ambiguity_id: 'synthetic-person-1' }] };
    const beforeDraft = structuredClone(draft), f = fixture({ entry: e.entry, draft });
    assert.strictEqual(await f.run(), draft);
    zeroed73(e.acquired); assert.strictEqual(f.entry.private_bytes, e.acquired);
    assert.deepEqual(e.original, beforeOriginal); assert.deepEqual(e.unrelated, beforeUnrelated);
    assert.deepEqual(draft, beforeDraft);
    assert.deepEqual(f.state, f.stateBefore); assert.deepEqual(f.item, f.itemBefore);
    assert.strictEqual(f.callOptions().inputQueue[0], e.entry);
    assert.equal(f.callOptions().copyClaim, true);
  });
  await testAsync('73 resolved empty-ambiguity Standalone capture retains its exact text and clears its read copy', async () => {
    const e = privateEntry73(), draft = { original_text: 'synthetic Anna Berger', anonymized_text: '[PERSON_001]', ambiguities: [] };
    const before = structuredClone(draft), f = fixture({ entry: e.entry, draft });
    assert.strictEqual(await f.run(), draft); zeroed73(e.acquired); assert.deepEqual(draft, before);
  });
  await testAsync('73 OCR sentinel preserves the pending OCR input and never claims a reviewed answer', async () => {
    const e = privateEntry73(), input = { original_text: 'synthetic OCR contact', source_type: 'png', contacts: [] };
    const beforeInput = structuredClone(input); let reads = 0, writes = 0;
    const f = fixture({ entry: e.entry, ocrInput: input, contactStore: {
      read(state, item, value) {
        reads++; assert.strictEqual(state, f.state); assert.strictEqual(item, f.item);
        assert.strictEqual(value, input); return null;
      },
      write() { writes++; assert.fail('capture alone is not a reviewed contact answer'); }
    } });
    f.deps.captureOcrInput = true;
    const captured = await f.run();
    assert.strictEqual(captured.ocr_contact_input, input); zeroed73(e.acquired);
    assert.deepEqual(input, beforeInput); assert.equal(reads, 1); assert.equal(writes, 0);
    assert.equal(f.externalReviewCalls(), 0);
  });
  await testAsync('73 registry refusal before action clears the acquired source and preserves every primary including falsy', async () => {
    for (const primary of primaries73()) {
      const e = privateEntry73(); let entered = 0;
      const f = fixture({ entry: e.entry, withBatchPseudonymRegistry: async (state, action) => {
        assert.strictEqual(state, f.state); assert.equal(typeof action, 'function');
        assert.deepEqual(e.acquired, e.original, 'the bytes were obtained before this modeled registry refusal');
        entered++; throw primary;
      } });
      await preservesPrimary73(f.run, primary); zeroed73(e.acquired);
      assert.equal(entered, 1); assert.deepEqual(f.events, ['entry']);
      assert.deepEqual(f.state, f.stateBefore); assert.deepEqual(f.item, f.itemBefore);
    }
  });
  await testAsync('73 argument construction failure before pipeline entry clears acquired bytes without a fake claim', async () => {
    for (const primary of primaries73()) {
      const e = privateEntry73(), f = fixture({ entry: e.entry, packageError: primary });
      await preservesPrimary73(f.run, primary); zeroed73(e.acquired);
      assert.deepEqual(f.events, ['entry', 'package-id']);
      assert.equal(f.callOptions(), undefined); assert.equal(f.externalReviewCalls(), 0);
    }
  });
  await testAsync('73 pipeline failure before any pipeline cleanup clears the read copy and preserves falsy errors', async () => {
    for (const primary of primaries73()) {
      const e = privateEntry73(), f = fixture({ entry: e.entry, pipelineError: primary });
      await preservesPrimary73(f.run, primary); zeroed73(e.acquired);
      assert.deepEqual(f.events, ['entry', 'package-id', 'anonymize']);
      assert.strictEqual(f.callOptions().inputQueue[0], e.entry);
      assert.equal(f.externalReviewCalls(), 0);
    }
  });
  await testAsync('73 observer failure after a real capture sentinel still clears the acquired Buffer and preserves its primary', async () => {
    for (const primary of primaries73()) {
      const e = privateEntry73(), draft = { original_text: 'synthetic source', anonymized_text: '[PERSON_001]', ambiguities: [{}] };
      const f = fixture({ entry: e.entry, draft }); let observed = 0;
      f.deps.onReviewSourceCaptured = value => {
        observed++; assert.ok(Object.isFrozen(value)); assert.equal(value.originalText, draft.original_text); throw primary;
      };
      await preservesPrimary73(f.run, primary); zeroed73(e.acquired);
      assert.equal(observed, 1); assert.equal(draft.original_text, 'synthetic source');
    }
  });
  await testAsync('73 swallowed or spoofed sentinels and malformed drafts never return success and still clear private bytes', async () => {
    for (const options of [
      { skipCallback: true }, { skipCallback: true, spoofSentinel: true },
      { swallowSentinel: true, draft: { ambiguities: [{}] } },
      { draft: undefined }, { draft: {} }, { draft: { ambiguities: null } }, { draft: { ambiguities: [] } }
    ]) {
      const e = privateEntry73(), f = fixture({ ...options, entry: e.entry });
      await assert.rejects(f.run(), error => error.code === 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
      zeroed73(e.acquired); assert.equal(f.externalReviewCalls(), 0);
    }
  });
  await testAsync('73 cleanup retains the acquired Buffer identity instead of clearing a later replacement reference', async () => {
    const e = privateEntry73(), untouched = Buffer.from(e.unrelated);
    const draft = { original_text: 'synthetic source', anonymized_text: '[PERSON_001]', ambiguities: [{}] };
    const f = fixture({ entry: e.entry, draft });
    f.deps.onReviewSourceCaptured = () => { e.entry.private_bytes = e.unrelated; };
    assert.strictEqual(await f.run(), draft); zeroed73(e.acquired);
    assert.strictEqual(e.entry.private_bytes, e.unrelated); assert.deepEqual(e.unrelated, untouched);
  });
  await testAsync('73 acquisition refusal has no ownership over bytes never returned to capture', async () => {
    for (const primary of primaries73()) {
      const e = privateEntry73(), before = Buffer.from(e.acquired), f = fixture({ entry: e.entry, entryError: primary });
      await preservesPrimary73(f.run, primary);
      assert.deepEqual(e.acquired, before); assert.deepEqual(f.events, ['entry']);
    }
  });
  await testAsync('73 modern persisted capture never enters or cleans a legacy source acquisition', async () => {
    for (const schema of ['datasecure-batch/7', 'datasecure-batch/8']) {
      const e = privateEntry73(), before = Buffer.from(e.acquired), registry = { synthetic_registry: true };
      const draft = { original_text: 'synthetic content source', anonymized_text: '[PERSON_001]', ambiguities: [] };
      let calls = 0;
      const f = fixture({ entry: e.entry, withBatchPseudonymRegistry: async (_state, action) => action(registry),
        captureStandaloneReview: async (token, id, hooks) => {
          calls++; assert.equal(token, f.state.token); assert.equal(id, f.item.id);
          assert.strictEqual(hooks.pseudonymRegistry, registry);
          assert.equal(Object.hasOwn(hooks, 'inputQueue'), false);
          return { kind: 'privacy', draft };
        } });
      Object.assign(f.state, { schema, token: 'a'.repeat(64), processing_mode: 'markdown-and-anonymize',
        standalone_document_review: true, content_options: {
          schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } });
      const stateBefore = structuredClone(f.state);
      assert.strictEqual(await f.run(), draft); assert.equal(calls, 1); assert.deepEqual(f.events, []);
      assert.deepEqual(e.acquired, before); assert.deepEqual(f.state, stateBefore);
      // The bridge here is a unit seam, not a claimed native content-operation PASS.
    }
  });

  done();
}

main();
