'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchReviewPublication } = require('../plugins/data-secure/server/gateway/batch-review-publication');
const { createSuite } = require('./helpers');

const { test, testAsync, done, assert } = createSuite('Batch review publication boundary');

const COMPLETE_DOCUMENT_RESULT = Object.freeze({
  schema: 'datasecure-document-result/1',
  grade: 'complete',
  omissions: Object.freeze([]),
  reason_code: null
});
const OMITTED_DOCUMENT_RESULT = Object.freeze({
  schema: 'datasecure-document-result/1',
  grade: 'usable-with-omissions',
  omissions: Object.freeze([{ code: 'VISUAL_ASSETS_WITHHELD_LOCALLY', count: 1 }]),
  reason_code: null
});

function reviewError(code, message) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

function draft(id, text) {
  return { anonymized_text: text, ambiguities: [{ ambiguity_id: id, anonymized_start: 0, anonymized_end: text.length }] };
}

function decision(id, value = 'keep') { return { ambiguity_id: id, decision: value }; }

function fixture(options = {}) {
  const events = [];
  const writes = [];
  const items = [
    { id: '1'.repeat(32), name: 'first', status: 'deferred_review' },
    { id: '2'.repeat(32), name: 'second', status: 'deferred_review' }
  ];
  const state = { profile: 'general', remove_images: false, items };
  const drafts = [draft('a-1', 'FIRST'), draft('a-2', 'SECOND')];
  let current = 0;
  const publication = createBatchReviewPublication({
    invalidDecisionError: reviewError,
    retryableCodes: new Set(['PARSER_TIMEOUT']),
    reviewedBatchText(input, decisions) {
      const expected = new Set((input.ambiguities || []).map((entry) => entry.ambiguity_id));
      if (!Array.isArray(decisions) || decisions.length !== expected.size ||
          new Set(decisions.map((entry) => entry.ambiguity_id)).size !== decisions.length ||
          decisions.some((entry) => !expected.has(entry.ambiguity_id) || !['keep', 'redact'].includes(entry.decision))) {
        throw reviewError('LOCAL_REVIEW_CANCELLED', 'invalid');
      }
      return { text: `${input.anonymized_text}:${decisions.map((entry) => entry.ambiguity_id).join(',')}` };
    },
    exactPendingEntry(_state, item) { events.push(`entry:${item.name}`); return { item: item.name }; },
    packageIdForItem(item) { return `ds_${item.id}`; },
    writeState(value, writeOptions) {
      writes.push({ snapshot: structuredClone(value), writeOptions });
      events.push(`write:${writes.length}`);
      if (options.writeFailureCall === writes.length) throw new Error('journal failed');
    },
    ensureMappingOutbox(name) {
      events.push(`outbox:${name}`);
      if (options.outboxFailure === name) throw new Error('outbox failed');
      return `outbox:${name}`;
    },
    markMappingPending(item, packageId) {
      events.push(`mapping-pending:${item.name}`);
      item.status = 'mapping_pending';
      item.package_id = packageId;
      item.document_result = COMPLETE_DOCUMENT_RESULT;
      item.error_code = 'LOCAL_MAPPING_EXPORT_PENDING';
      item.mapping_outbox_persisted = false;
    },
    cleanupTerminalWorkCopy(_state, item) {
      events.push(`cleanup:${item.name}`);
      if (options.cleanupFailure === item.name) throw new Error('cleanup failed');
    },
    commitPendingMapping(item) {
      events.push(`mapping-commit:${item.name}`);
      if (options.mappingFailure === item.name) throw new Error('mapping failed');
      delete item.error_code;
    },
    deliveryResult(_state, item) {
      if (options.deliveryFailure === item.name) throw new Error('delivery failed');
      return { package_id: item.package_id, item: item.name };
    },
    appendMapping(name) { events.push(`mapping-stopped:${name}`); },
    async anonymizeNext(_profile, callOptions) {
      const item = items[current++];
      events.push(`anonymize:${item.name}`);
      if (options.pipelineFailure === item.name) {
        const error = new Error('pipeline failed');
        if (options.uncodedPipelineFailure !== true) {
          error.code = options.pipelineFailureCode || 'PARSER_TIMEOUT';
        }
        throw error;
      }
      const reviewed = callOptions.reviewText(drafts[items.indexOf(item)]);
      events.push(`reviewed:${reviewed.text}`);
      const verifiedResult = options.missingBeforePublishResult === item.name ? undefined : COMPLETE_DOCUMENT_RESULT;
      const publishedResult = options.missingAfterPublishResult === item.name
        ? undefined
        : (options.mismatchedAfterPublishResult === item.name ? OMITTED_DOCUMENT_RESULT : COMPLETE_DOCUMENT_RESULT);
      const returnedResult = options.missingReturnResult === item.name
        ? undefined
        : (options.mismatchedReturnResult === item.name ? OMITTED_DOCUMENT_RESULT : COMPLETE_DOCUMENT_RESULT);
      await callOptions.beforePublish?.({ document_result: verifiedResult });
      if (options.skipAfterPublish !== true) await callOptions.afterPublish?.({ document_result: publishedResult });
      return {
        package_id: options.wrongPackageId === item.name ? 'ds_' + 'f'.repeat(32) : `ds_${item.id}`,
        document_result: returnedResult
      };
    }
  });
  return { publication, state, items, drafts, events, writes };
}

async function main() {
  test('complete binding rejects malformed document and decision sets', () => {
    const { publication, items, drafts } = fixture();
    const first = { document_index: 1, decisions: [decision('a-1')] };
    const second = { document_index: 2, decisions: [decision('a-2')] };
    const invalid = [
      null, {}, [], [first], [null, second], [first], [first, first],
      [first, { document_index: 1, decisions: [decision('a-2')] }],
      [{ document_index: 0, decisions: [decision('a-1')] }, second],
      [{ document_index: 3, decisions: [decision('a-1')] }, second],
      [{ document_index: 1.5, decisions: [decision('a-1')] }, second],
      [{ document_index: '1', decisions: [decision('a-1')] }, second],
      [{ document_index: 1, decisions: [] }, second],
      [{ document_index: 1, decisions: [decision('unknown')] }, second],
      [{ document_index: 1, decisions: [decision('a-1', 'invalid')] }, second],
      [{ document_index: 1, decisions: [{ ...decision('a-1'), raw: 'PII-SENTINEL' }] }, second],
      [{ ...first, raw: 'PII-SENTINEL' }, second],
      [{ document_index: 1, decisions: [decision('a-1'), decision('a-1')] }, second],
      [{ document_index: 1, decisions: null }, second]
    ];
    for (const documents of invalid) {
      assert.throws(() => publication.bindReviewedDocuments(items, drafts, documents),
        (error) => error.code === 'BATCH_REVIEW_DECISION_BINDING_INVALID' && !error.message.includes('PII-SENTINEL'));
    }
    const duplicateDraft = structuredClone(drafts);
    duplicateDraft[0].ambiguities.push(structuredClone(duplicateDraft[0].ambiguities[0]));
    assert.throws(() => publication.bindReviewedDocuments(items, duplicateDraft, [first, second]),
      (error) => error.code === 'BATCH_REVIEW_DECISION_BINDING_INVALID');
  });

  await testAsync('invalid binding fails before journal mutation or anonymization', async () => {
    const value = fixture();
    const before = structuredClone(value.state);
    await assert.rejects(value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 1, decisions: [decision('a-2')] }
    ]), (error) => error.code === 'BATCH_REVIEW_DECISION_BINDING_INVALID');
    assert.deepStrictEqual(value.state, before);
    assert.deepStrictEqual(value.events, []);
    assert.deepStrictEqual(value.writes, []);
  });

  await testAsync('valid reordered decisions bind by document index and publish sequentially', async () => {
    const value = fixture();
    const result = await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
      { document_index: 2, decisions: [decision('a-2')] },
      { document_index: 1, decisions: [decision('a-1')] }
    ]);
    assert.deepStrictEqual(result.packages.map((entry) => entry.item), ['first', 'second']);
    assert.strictEqual(result.failed, 0);
    assert.ok(value.events.includes('reviewed:FIRST:a-1'));
    assert.ok(value.events.includes('reviewed:SECOND:a-2'));
    assert.deepStrictEqual(value.items.map((item) => item.status), ['delivery_pending', 'delivery_pending']);
    const verifiedWrites = value.writes.filter(({ snapshot }) =>
      snapshot.items.some((item) => item.checkpoint === 'package_verified'));
    assert.ok(verifiedWrites.length >= 2, 'each reviewed document is durably checkpointed before publication');
    assert.ok(verifiedWrites.every(({ writeOptions }) => writeOptions === undefined),
      'pre-publication pseudonym state must never use the non-durable journal shortcut');
  });

  await testAsync('later parser failure preserves the first publication and remains retryable', async () => {
    const value = fixture({ pipelineFailure: 'second' });
    const result = await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ]);
    assert.deepStrictEqual(result.packages.map((entry) => entry.item), ['first']);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(value.items[0].status, 'delivery_pending');
    assert.strictEqual(value.items[1].status, 'retryable');
    assert.strictEqual(value.items[1].error_code, 'PARSER_TIMEOUT');
  });

  await testAsync('an uncoded review-pipeline exception stops and is never offered as resumable', async () => {
    const value = fixture({ pipelineFailure: 'first', uncodedPipelineFailure: true });
    const result = await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ]);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(value.items[0].status, 'stopped');
    assert.strictEqual(value.items[0].checkpoint, 'stopped');
    assert.strictEqual(value.items[0].error_code, 'INTERNAL_FAILURE');
    assert.strictEqual(value.items[0].document_result.reason_code, 'INTERNAL_FAILURE');
    assert.strictEqual(value.items[1].status, 'delivery_pending');
  });

  await testAsync('mapping and cleanup failures retain recoverable state and continue', async () => {
    const value = fixture({ mappingFailure: 'first', cleanupFailure: 'second' });
    const result = await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ]);
    assert.strictEqual(value.items[0].status, 'mapping_pending');
    assert.strictEqual(value.items[0].error_code, 'LOCAL_MAPPING_EXPORT_PENDING');
    assert.strictEqual(value.items[1].status, 'delivery_pending');
    assert.strictEqual(value.items[1].work_copy_cleanup_pending, true);
    assert.deepStrictEqual(result.packages.map((entry) => entry.item), ['second']);

    const outbox = fixture({ outboxFailure: 'first' });
    const outboxResult = await outbox.publication.publishReviewedBatch(outbox.state, outbox.items, outbox.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ]);
    assert.strictEqual(outbox.items[0].status, 'mapping_pending');
    assert.strictEqual(outbox.items[0].mapping_outbox_persisted, false);
    assert.strictEqual(outbox.items[1].status, 'delivery_pending');
    assert.deepStrictEqual(outboxResult.packages.map((entry) => entry.item), ['second']);
  });

  await testAsync('every journal failure after publication stays recoverable and never records a stop', async () => {
    for (const writeFailureCall of [3, 4, 5, 6, 7]) {
      const value = fixture({ writeFailureCall });
      const result = await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
        { document_index: 1, decisions: [decision('a-1')] },
        { document_index: 2, decisions: [decision('a-2')] }
      ]);
      assert.strictEqual(value.items[0].status, 'processing', `write ${writeFailureCall}`);
      assert.strictEqual(value.items[0].checkpoint, 'package_published', `write ${writeFailureCall}`);
      assert.strictEqual(value.items[0].error_code, 'PROCESSING_INTERRUPTED', `write ${writeFailureCall}`);
      assert.strictEqual(value.items[0].work_copy_cleanup_pending, true, `write ${writeFailureCall}`);
      assert.strictEqual(value.events.filter((event) => event === 'anonymize:first').length, 1, `write ${writeFailureCall}`);
      assert.ok(!value.events.includes('mapping-stopped:first'), `write ${writeFailureCall}`);
      assert.ok(result.packages.some((entry) => entry.item === 'second'), `write ${writeFailureCall}`);
    }
  });

  await testAsync('delivery construction and local-finalize journal failure cannot downgrade a published package', async () => {
    const delivery = fixture({ deliveryFailure: 'first' });
    const deliveryResult = await delivery.publication.publishReviewedBatch(delivery.state, delivery.items, delivery.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ]);
    assert.strictEqual(delivery.items[0].status, 'processing');
    assert.strictEqual(delivery.items[0].checkpoint, 'package_published');
    assert.ok(!delivery.events.includes('mapping-stopped:first'));
    assert.deepStrictEqual(deliveryResult.packages.map((entry) => entry.item), ['second']);

    const local = fixture({ writeFailureCall: 7 });
    const localResult = await local.publication.publishReviewedBatch(local.state, local.items, local.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ], { localFinalize: true });
    assert.strictEqual(local.items[0].status, 'processing');
    assert.strictEqual(local.items[0].checkpoint, 'package_published');
    assert.strictEqual(localResult.locallyReleased, 1);
    assert.ok(!local.events.includes('mapping-stopped:first'));
  });

  await testAsync('missing publish callback or mismatched package id stops the whole boundary before mapping', async () => {
    for (const options of [
      { skipAfterPublish: true },
      { wrongPackageId: 'first' },
      { missingReturnResult: 'first' },
      { mismatchedReturnResult: 'first' }
    ]) {
      const value = fixture(options);
      await assert.rejects(value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
        { document_index: 1, decisions: [decision('a-1')] },
        { document_index: 2, decisions: [decision('a-2')] }
      ]), (error) => error.code === 'BATCH_REVIEW_PUBLICATION_UNCONFIRMED');
      assert.strictEqual(value.items[0].status, 'processing');
      assert.strictEqual(value.items[0].error_code, 'PROCESSING_INTERRUPTED');
      assert.strictEqual(value.events.filter((event) => event.startsWith('anonymize:')).length, 1);
      assert.ok(!value.events.some((event) => event.startsWith('mapping-pending:')));
      assert.ok(!value.events.some((event) => event.startsWith('mapping-commit:')));
      assert.ok(!value.events.some((event) => event.startsWith('mapping-stopped:')));
    }
  });

  await testAsync('missing or mismatched post-publish grade remains recoverable without mapping or downgrade', async () => {
    for (const options of [
      { missingAfterPublishResult: 'first' },
      { mismatchedAfterPublishResult: 'first' }
    ]) {
      const value = fixture(options);
      const result = await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
        { document_index: 1, decisions: [decision('a-1')] },
        { document_index: 2, decisions: [decision('a-2')] }
      ]);
      assert.strictEqual(value.items[0].status, 'processing');
      assert.strictEqual(value.items[0].checkpoint, 'package_published');
      assert.strictEqual(value.items[0].error_code, 'PROCESSING_INTERRUPTED');
      assert.ok(!value.events.includes('mapping-pending:first'));
      assert.ok(!value.events.includes('mapping-stopped:first'));
      assert.deepStrictEqual(result.packages.map((entry) => entry.item), ['second']);
    }
  });

  await testAsync('missing pre-publication result grade stops safely before any package is committed', async () => {
    const value = fixture({ missingBeforePublishResult: 'first' });
    const result = await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ]);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(value.items[0].status, 'stopped');
    assert.strictEqual(value.items[0].document_result.grade, 'not-processed');
    assert.ok(!value.events.includes('mapping-pending:first'));
    assert.strictEqual(value.items[1].status, 'delivery_pending');
  });

  await testAsync('review stop commits decision before mapping and mapping marker before cleanup', async () => {
    const value = fixture({ pipelineFailure: 'first', pipelineFailureCode: 'ALICE_MUSTERMANN' });
    await value.publication.publishReviewedBatch(value.state, value.items, value.drafts, [
      { document_index: 1, decisions: [decision('a-1')] },
      { document_index: 2, decisions: [decision('a-2')] }
    ]);
    const decisionWrite = value.writes.findIndex((write) =>
      write.snapshot.items[0].document_result?.grade === 'not-processed' &&
      write.snapshot.items[0].local_mapping_exported === false);
    const mappingEvent = value.events.indexOf('mapping-stopped:first');
    const mappingWrite = value.writes.findIndex((write) => write.snapshot.items[0].local_mapping_exported === true);
    const cleanupEvent = value.events.indexOf('cleanup:first');
    assert.ok(decisionWrite >= 0);
    assert.strictEqual(value.items[0].error_code, 'INTERNAL_FAILURE');
    assert.strictEqual(value.items[0].document_result.reason_code, 'INTERNAL_FAILURE');
    assert.ok(value.events.indexOf(`write:${decisionWrite + 1}`) < mappingEvent);
    assert.ok(mappingWrite > decisionWrite);
    assert.ok(value.events.indexOf(`write:${mappingWrite + 1}`) < cleanupEvent);
  });

  done();
}

main();
