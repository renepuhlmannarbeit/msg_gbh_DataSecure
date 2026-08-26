'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchItemProcessor } = require('../plugins/data-secure/server/gateway/batch-item-processor');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('Batch single-item processing boundary');

function codedError(code, message = code) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

function fixture(options = {}) {
  const events = [];
  const writes = [];
  const entry = { sealed: true };
  const item = { id: '1'.repeat(32), name: 'private-source.txt', status: 'pending' };
  const state = {
    profile: 'general',
    remove_images: true,
    items: [item],
    io_summary: { final_gate_runs: 0, output_packages_committed: 0, audit_receipt_writes: 0 }
  };
  let clock = 100;
  const expectedPackageId = `ds_${item.id}`;
  const processor = createBatchItemProcessor({
    SafeError,
    nowMs: () => { clock += 10; return clock; },
    writeState(value, writeOptions) {
      writes.push({ snapshot: structuredClone(value), writeOptions });
      events.push(`write:${writes.length}:${writeOptions?.durable === false ? 'soft' : 'durable'}`);
      if (options.writeFailureCall === writes.length ||
          (Number.isInteger(options.writeFailureFromCall) && writes.length >= options.writeFailureFromCall)) {
        throw new Error(`write ${writes.length} failed`);
      }
    },
    packageIdForItem(value) { assert.strictEqual(value, item); return expectedPackageId; },
    createPhaseRecorder() {
      const phases = [];
      return {
        mark(phase) { phases.push(phase); events.push(`phase:${phase}`); },
        snapshot() { return Object.fromEntries(phases.map((phase, index) => [phase, index + 1])); }
      };
    },
    reviewSingleBatchTextLocally(input, valueState, valueItem, deps) {
      events.push('review');
      assert.strictEqual(input, options.reviewInput);
      assert.strictEqual(valueState, state);
      assert.strictEqual(valueItem, item);
      assert.strictEqual(deps.marker, 'caller');
      if (options.reviewError) throw options.reviewError;
      return { text: 'reviewed' };
    },
    incrementPrivateIoSummary(summary, field) { summary[field]++; events.push(`io:${field}`); },
    ensureMappingOutbox(name, packageId) {
      events.push('outbox');
      assert.strictEqual(name, item.name);
      assert.strictEqual(packageId, expectedPackageId);
      if (options.outboxFailure) throw new Error('outbox failed');
    },
    markMappingPending(value, packageId) {
      events.push('mapping-pending');
      if (options.markMappingFailure) throw new Error('mark mapping failed');
      value.status = 'mapping_pending';
      value.checkpoint = 'mapping_pending';
      value.package_id = packageId;
      value.error_code = 'LOCAL_MAPPING_EXPORT_PENDING';
    },
    cleanupTerminalWorkCopy(_state, value) {
      events.push('cleanup');
      assert.strictEqual(value, item);
      if (options.cleanupFailure) throw new Error('cleanup failed');
    },
    commitPendingMapping(value, packageId) {
      events.push('mapping-commit');
      assert.strictEqual(value, item);
      assert.strictEqual(packageId, expectedPackageId);
      if (options.mappingFailure) throw new Error('mapping failed');
      delete value.error_code;
    },
    appendMapping(name, packageId, status) {
      events.push('mapping-stopped');
      assert.strictEqual(name, item.name);
      assert.strictEqual(packageId, '');
      assert.strictEqual(status, 'sicher gestoppt');
      if (options.stopMappingFailure) throw new Error('stop mapping failed');
    },
    invalidateUnpublishedBatchCopies(_state, deps, exceptItem) {
      events.push('invalidate');
      assert.strictEqual(deps.marker, 'caller');
      assert.strictEqual(exceptItem, item);
    },
    publicProgress() { return { remaining: item.status === 'pending' ? 1 : 0, delivery_pending: item.status === 'delivery_pending' ? 1 : 0 }; },
    writeTerminalEvidence() { events.push('evidence'); return options.evidence !== false; },
    deliveryPendingStatus: 'delivery_pending',
    deferredReviewStatus: 'deferred_review',
    retryableCodes: new Set(['PARSER_TIMEOUT', 'PROCESSING_INTERRUPTED']),
    mappingStoppedStatus: 'sicher gestoppt',
    async anonymizeNext(profile, callOptions) {
      events.push('anonymize');
      assert.strictEqual(profile, state.profile);
      assert.deepStrictEqual(callOptions.inputQueue, [entry]);
      assert.strictEqual(callOptions.inputQueue[0], entry);
      assert.strictEqual(callOptions.copyClaim, true);
      assert.strictEqual(callOptions.removeImages, true);
      assert.strictEqual(callOptions.packageId, expectedPackageId);
      if (options.pipelineError) throw options.pipelineError;
      await callOptions.onClaimed();
      await callOptions.onExtracted({ private: true });
      await callOptions.onDetected({ private: true });
      callOptions.reviewText(options.reviewInput);
      await callOptions.beforePublish({ private: true });
      if (!options.skipAfterPublish) await callOptions.afterPublish();
      if (options.doubleAfterPublish) await callOptions.afterPublish();
      return {
        package_id: options.wrongPackageId ? `ds_${'f'.repeat(32)}` : expectedPackageId,
        audit_receipt_retained: options.auditReceipt === true
      };
    }
  });
  const deps = {
    marker: 'caller',
    inputQueue: ['attacker'],
    copyClaim: false,
    removeImages: false,
    packageId: 'attacker',
    reviewText: () => { throw new Error('attacker review'); },
    afterPublish: () => { throw new Error('attacker publish'); }
  };
  return { processor, state, item, entry, events, writes, deps, expectedPackageId };
}

async function main() {
  await testAsync('happy path preserves identity, safety options, order, counters and facade', async () => {
    const value = fixture({ auditReceipt: true });
    const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
    assert.strictEqual(result.ok, undefined);
    assert.strictEqual(result.package_id, value.expectedPackageId);
    assert.strictEqual(result.raw_content_sent_to_claude, false);
    assert.strictEqual(value.item.status, 'delivery_pending');
    assert.strictEqual(value.item.checkpoint, 'delivery_pending');
    assert.deepStrictEqual(value.state.io_summary, {
      final_gate_runs: 1, output_packages_committed: 1, audit_receipt_writes: 1
    });
    assert.ok(value.events.indexOf('mapping-pending') > value.events.indexOf('phase:publication'));
    assert.ok(value.events.indexOf('mapping-commit') > value.events.indexOf('cleanup'));
    assert.strictEqual(value.writes.filter((entry) => entry.writeOptions?.durable === false).length, 5);
    assert.deepStrictEqual(value.events.filter((event) => /^(phase|review|outbox|mapping-pending|cleanup|mapping-commit|io:)/u.test(event)), [
      'phase:intake_and_preparation',
      'phase:conversion_and_visual_scan',
      'phase:text_privacy_check',
      'review',
      'io:final_gate_runs',
      'phase:verification',
      'outbox',
      'phase:publication',
      'phase:publication',
      'mapping-pending',
      'outbox',
      'cleanup',
      'mapping-commit',
      'io:output_packages_committed',
      'io:audit_receipt_writes'
    ]);
    assert.strictEqual(typeof batchFacade.processBatchNext, 'function');
  });

  await testAsync('all pre-publication journal boundaries remain fail-closed', async () => {
    const initial = fixture({ writeFailureCall: 1 });
    await assert.rejects(
      initial.processor.processSingleBatchItem(initial.state, initial.item, initial.entry, initial.deps),
      /write 1 failed/u
    );
    assert.strictEqual(initial.item.status, 'processing');
    assert.ok(!initial.events.includes('anonymize'));

    for (const writeFailureCall of [2, 3, 4, 5]) {
      const value = fixture({ writeFailureCall });
      const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
      assert.strictEqual(result.error, 'PROCESSING_INTERRUPTED', `write ${writeFailureCall}`);
      assert.strictEqual(value.item.status, 'retryable', `write ${writeFailureCall}`);
      assert.ok(!value.events.includes('mapping-stopped'), `write ${writeFailureCall}`);
      assert.ok(!value.events.includes('outbox'), `write ${writeFailureCall}`);
    }
  });

  await testAsync('deferred, retryable and stopped failures retain exact pre-publication semantics', async () => {
    for (const [error, status, checkpoint] of [
      [codedError('LOCAL_REVIEW_DEFERRED'), 'deferred_review', 'awaiting_local_review'],
      [codedError('PARSER_TIMEOUT'), 'retryable', 'retryable'],
      [codedError('PARSER_INVALID'), 'stopped', 'stopped']
    ]) {
      const value = fixture({ pipelineError: error });
      const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
      assert.strictEqual(result.error, error.code);
      assert.strictEqual(value.item.status, status);
      assert.strictEqual(value.item.checkpoint, checkpoint);
      assert.strictEqual(value.events.includes('mapping-stopped'), status === 'stopped');
      assert.strictEqual(value.events.includes('cleanup'), status === 'stopped');
      assert.ok(value.events.includes('evidence'));
    }
  });

  await testAsync('snapshot change invalidates only unpublished copies', async () => {
    const value = fixture({ pipelineError: codedError('BATCH_SNAPSHOT_CHANGED') });
    const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
    assert.strictEqual(result.error, 'BATCH_SNAPSHOT_CHANGED');
    assert.ok(value.events.includes('invalidate'));
    assert.ok(!value.events.includes('outbox'));
  });

  await testAsync('missing, duplicate or mismatched publication proof fails before mapping and delivery', async () => {
    for (const [options, expectedCheckpoint] of [
      [{ skipAfterPublish: true }, 'publication_unconfirmed'],
      [{ doubleAfterPublish: true }, 'package_published'],
      [{ wrongPackageId: true }, 'package_published']
    ]) {
      const value = fixture(options);
      const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
      assert.strictEqual(result.error, 'BATCH_PUBLICATION_UNCONFIRMED');
      assert.strictEqual(value.item.status, 'processing');
      assert.strictEqual(value.item.checkpoint, expectedCheckpoint);
      assert.ok(!value.events.includes('mapping-pending'));
      assert.ok(!value.events.includes('mapping-stopped'));
      assert.ok(!value.events.includes('cleanup'));
    }
  });

  await testAsync('every post-publication journal failure remains recoverable and never becomes stopped', async () => {
    for (const writeFailureCall of [6, 7, 8, 9, 10]) {
      const value = fixture({ writeFailureCall });
      const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
      assert.strictEqual(result.ok, false, `write ${writeFailureCall}`);
      assert.strictEqual(value.item.status, 'processing', `write ${writeFailureCall}`);
      assert.strictEqual(value.item.checkpoint, 'package_published', `write ${writeFailureCall}`);
      assert.strictEqual(value.item.error_code, 'PROCESSING_INTERRUPTED', `write ${writeFailureCall}`);
      assert.strictEqual(value.item.package_id, value.expectedPackageId, `write ${writeFailureCall}`);
      assert.ok(!value.events.includes('mapping-stopped'), `write ${writeFailureCall}`);
      assert.strictEqual(value.events.filter((event) => event === 'anonymize').length, 1, `write ${writeFailureCall}`);
    }
  });

  await testAsync('persistent journal failure propagates without downgrading the published in-memory state', async () => {
    const value = fixture({ writeFailureFromCall: 6 });
    await assert.rejects(
      value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps),
      /write 7 failed/u
    );
    assert.strictEqual(value.item.status, 'processing');
    assert.strictEqual(value.item.checkpoint, 'package_published');
    assert.strictEqual(value.item.package_id, value.expectedPackageId);
    assert.strictEqual(value.item.error_code, 'PROCESSING_INTERRUPTED');
    assert.ok(!value.events.includes('mapping-stopped'));
    assert.ok(!value.events.includes('cleanup'));
  });

  await testAsync('post-publication logic failures preserve the deterministic package without stop cleanup', async () => {
    for (const options of [{ markMappingFailure: true }, { mappingFailure: true }]) {
      const value = fixture(options);
      const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
      if (options.mappingFailure) {
        assert.strictEqual(result.error, 'LOCAL_MAPPING_EXPORT_PENDING');
        assert.strictEqual(value.item.status, 'mapping_pending');
      } else {
        assert.strictEqual(result.error, 'PROCESSING_INTERRUPTED');
        assert.strictEqual(value.item.status, 'processing');
      }
      assert.ok(!value.events.includes('mapping-stopped'));
    }
  });

  await testAsync('mapping outbox failure keeps the work copy while mapping commit failure never delivers', async () => {
    const outbox = fixture({ outboxFailure: true });
    const outboxResult = await outbox.processor.processSingleBatchItem(outbox.state, outbox.item, outbox.entry, outbox.deps);
    assert.strictEqual(outboxResult.error, 'LOCAL_MAPPING_EXPORT_PENDING');
    assert.strictEqual(outbox.item.status, 'mapping_pending');
    assert.ok(!outbox.events.includes('cleanup'));

    const mapping = fixture({ mappingFailure: true });
    const mappingResult = await mapping.processor.processSingleBatchItem(mapping.state, mapping.item, mapping.entry, mapping.deps);
    assert.strictEqual(mappingResult.error, 'LOCAL_MAPPING_EXPORT_PENDING');
    assert.strictEqual(mapping.item.status, 'mapping_pending');
    assert.ok(!mapping.events.includes('io:output_packages_committed'));
  });

  await testAsync('cleanup failure remains delivery-safe and durable', async () => {
    const value = fixture({ cleanupFailure: true });
    const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
    assert.strictEqual(result.package_id, value.expectedPackageId);
    assert.strictEqual(value.item.status, 'delivery_pending');
    assert.strictEqual(value.item.work_copy_cleanup_pending, true);
    assert.ok(value.writes.some((write) => write.snapshot.items[0].work_copy_cleanup_pending === true));
  });

  await testAsync('stop-side mapping and cleanup failures cannot mask the primary safe stop', async () => {
    const value = fixture({
      pipelineError: codedError('PARSER_INVALID', 'PII-SENTINEL'),
      stopMappingFailure: true,
      cleanupFailure: true,
      evidence: false
    });
    const result = await value.processor.processSingleBatchItem(value.state, value.item, value.entry, value.deps);
    assert.strictEqual(result.error, 'PARSER_INVALID');
    assert.strictEqual(result.local_mapping_exported, false);
    assert.strictEqual(result.local_evidence_exported, false);
    assert.strictEqual(value.item.work_copy_cleanup_pending, true);
    assert.ok(!JSON.stringify(result).includes('private-source.txt'));
    assert.ok(!JSON.stringify(result).includes('PII-SENTINEL'));
    assert.ok(!JSON.stringify(value.writes).includes('PII-SENTINEL'));
    assert.ok(!JSON.stringify(value.state).includes('PII-SENTINEL'));
  });

  done();
}

main();
