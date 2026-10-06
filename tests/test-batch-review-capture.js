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
  const entry = { opaque_entry: true };
  const state = { profile: 'personnel_profile', remove_images: true,
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
      if (options.entryError) throw options.entryError;
      return entry;
    },
    packageIdForItem(valueItem) {
      events.push('package-id');
      assert.strictEqual(valueItem, item);
      return 'deterministic-package';
    },
    localReviewError: reviewError,
    async anonymizeNext(profile, callOptions) {
      events.push('anonymize');
      capturedOptions = callOptions;
      assert.strictEqual(profile, state.profile);
      if (options.pipelineError) throw options.pipelineError;
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

async function main() {
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

  done();
}

main();
