'use strict';
const { createSuite } = require('./helpers');
const { createLocalOnlyHandoff } = require('../plugins/data-secure/server/gateway/local-only-handoff');
const { test, done, assert } = createSuite('Local-only handoff');

test('token-free handoff reads a verified page without exposing local identifiers', () => {
  const acknowledgements = [];
  const result = { grade: 'complete', label: 'Vollständig verarbeitet', omissions: [] };
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{
      token: 'a'.repeat(64), released: 1, stopped: 0,
      grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
      omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      grades_verified: true
    }],
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43), document_result: result }], next_cursor: null }),
    readOutputs: () => ({ documents: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', text: '# Bereinigt', has_more: false, next_offset: 12 }] }),
    acknowledgeDeliveredPackages: (token, packageIds) => acknowledgements.push({ token, packageIds })
  });
  const first = handoff.start();
  assert.deepStrictEqual(first.documents, [{ text: '# Bereinigt', has_more: false, content_is_verified_anonymized_markdown: true, document_result: result }]);
  assert.deepStrictEqual(first.batch_result_summary.grade_counts, { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 });
  assert.strictEqual(first.batch_result_summary.grades_verified, true);
  assert.strictEqual(JSON.stringify(first).includes('package_id'), false);
  assert.strictEqual(JSON.stringify(first).includes('read_capability'), false);
  assert.strictEqual(JSON.stringify(first).includes('a'.repeat(64)), false);
  const done = handoff.next();
  assert.strictEqual(done.more, false);
  assert.deepStrictEqual(acknowledgements, [{ token: 'a'.repeat(64), packageIds: ['ds_1234567890abcdef1234567890abcdef'] }]);
});

test('multiple local batches are selected locally and cancellation does not reveal candidates', () => {
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 1, stopped: 0 }, { token: 'b'.repeat(64), released: 2, stopped: 1 }],
    pickCompletedBatch: (cards) => { assert.deepStrictEqual(cards, [{ ordinal: 1, released: 1, stopped: 0 }, { ordinal: 2, released: 2, stopped: 1 }]); return 2; },
    listBatchResults: (token) => { assert.strictEqual(token, 'b'.repeat(64)); return { results: [], next_cursor: null }; },
    readOutputs: () => { throw new Error('not called'); },
    acknowledgeDeliveredPackages: () => { throw new Error('not called'); }
  });
  const result = handoff.start();
  assert.deepStrictEqual(result.documents, []);
  assert.strictEqual(JSON.stringify(result).includes('released'), false);
});

test('expired handoff fails closed without reading another page', () => {
  let clock = 0;
  let reads = 0;
  const handoff = createLocalOnlyHandoff({
    now: () => clock,
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 1, stopped: 0 }],
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: null }),
    readOutputs: () => { reads++; return { documents: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', text: 'x', has_more: true, next_offset: 1 }] }; },
    acknowledgeDeliveredPackages: () => {}
  });
  handoff.start();
  clock = 16 * 60 * 1000;
  const result = handoff.next();
  assert.strictEqual(result.error, 'local_handoff_expired');
  assert.strictEqual(reads, 1);
});

test('malformed paging output clears the local handoff instead of allowing a retry', () => {
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 1, stopped: 0 }],
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: null }),
    readOutputs: () => ({ documents: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', text: 'x', has_more: true, next_offset: 0 }] }),
    acknowledgeDeliveredPackages: () => {}
  });
  assert.throws(() => handoff.start(), (error) => error.code === 'LOCAL_HANDOFF_VERIFICATION_FAILED');
  assert.strictEqual(handoff._test.session(), null);
  assert.strictEqual(handoff.next().error, 'no_active_local_handoff');
});

test('verified in-memory snapshot is opened once, paged locally and wiped after acknowledgement', () => {
  let opens = 0;
  let disposed = 0;
  const source = Buffer.from(`Erste freigegebene Seite. ${'Zweite freigegebene Seite. '.repeat(240)}`, 'utf8');
  const snapshot = {
    bytes: source.length,
    read(offset, maxChars) {
      const end = Math.min(source.length, offset + maxChars);
      return { text: source.toString('utf8', offset, end), next_offset: end, has_more: end < source.length };
    },
    dispose() { disposed++; source.fill(0); }
  };
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 1, stopped: 0 }],
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: null }),
    readOutputs: () => { throw new Error('snapshot should serve this document'); },
    openVerifiedMarkdownSnapshot: () => { opens++; return snapshot; },
    acknowledgeDeliveredPackages: () => {}
  });
  const first = handoff.start();
  assert.strictEqual(first.documents[0].has_more, true);
  const second = handoff.next();
  assert.strictEqual(second.documents[0].has_more, false);
  handoff.next();
  assert.strictEqual(opens, 1);
  assert.strictEqual(disposed, 1);
  assert.strictEqual(source.every((byte) => byte === 0), true);
});

test('Unicode at the handoff page boundary is complete, ordered and never replaced', () => {
  const source = `${'a'.repeat(4799)}🚀Ä Ende`;
  let disposed = 0;
  const snapshot = {
    bytes: Buffer.byteLength(source, 'utf8'),
    read(offset, maxChars) {
      let end = Math.min(source.length, offset + maxChars);
      if (end > offset && end < source.length && /[\uD800-\uDBFF]/u.test(source[end - 1]) && /[\uDC00-\uDFFF]/u.test(source[end])) end--;
      return { text: source.slice(offset, end), next_offset: end, has_more: end < source.length };
    },
    dispose() { disposed++; }
  };
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 1, stopped: 0 }],
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: null }),
    readOutputs: () => { throw new Error('snapshot expected'); },
    openVerifiedMarkdownSnapshot: () => snapshot,
    acknowledgeDeliveredPackages: () => {}
  });
  const fragments = [handoff.start().documents[0].text, handoff.next().documents[0].text];
  assert.strictEqual(fragments.join(''), source);
  assert.doesNotMatch(fragments.join(''), /\uFFFD/u);
  handoff.next();
  assert.strictEqual(disposed, 1);
});

test('multiple result-list pages acknowledge once before loading the next local page', () => {
  const ids = Array.from({ length: 6 }, (_, index) => `ds_${String(index + 1).padStart(32, '0')}`);
  const acknowledgements = [];
  let listed = 0;
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 6, stopped: 0 }],
    listBatchResults: (_token, options) => {
      listed++;
      if (listed === 1) {
        assert.strictEqual(options.cursor, null);
        return { results: ids.slice(0, 5).map((package_id) => ({ package_id, read_capability: 'c'.repeat(43) })), next_cursor: 'next-page' };
      }
      assert.strictEqual(options.cursor, 'next-page');
      return { results: [{ package_id: ids[5], read_capability: 'c'.repeat(43) }], next_cursor: null };
    },
    readOutputs: (entries) => ({ documents: entries.map((entry) => ({ package_id: entry.package_id, text: 'Freigegeben', has_more: false, next_offset: 12 })) }),
    acknowledgeDeliveredPackages: (_token, packageIds) => acknowledgements.push(packageIds)
  });
  const first = handoff.start();
  const second = handoff.next();
  const done = handoff.next();
  assert.deepStrictEqual(acknowledgements, [ids.slice(0, 5), [ids[5]]]);
  assert.strictEqual(listed, 2);
  assert.strictEqual(first.documents.length, 5);
  assert.strictEqual(second.documents.length, 1);
  assert.strictEqual(done.more, false);
  assert.doesNotMatch(JSON.stringify([first, second, done]), /package_id|read_capability|next-page/u);
});

test('an acknowledgement failure wipes every retained snapshot and stops the handoff', () => {
  let disposed = 0;
  const snapshot = { bytes: 1, read: () => ({ text: 'x', next_offset: 1, has_more: false }), dispose: () => { disposed++; } };
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 1, stopped: 0 }],
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: null }),
    readOutputs: () => { throw new Error('snapshot expected'); },
    openVerifiedMarkdownSnapshot: () => snapshot,
    acknowledgeDeliveredPackages: () => { throw new Error('acknowledgement failed'); }
  });
  handoff.start();
  assert.throws(() => handoff.next(), /acknowledgement failed/);
  assert.strictEqual(disposed, 1);
  assert.strictEqual(handoff.next().error, 'no_active_local_handoff');
});

test('a terminal page can be followed immediately by a new explicit start', () => {
  let acknowledgements = 0;
  let disposed = 0;
  let candidateCalls = 0;
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => {
      candidateCalls++;
      if (candidateCalls > 1) {
        assert.strictEqual(acknowledgements, candidateCalls - 1, 'finish the delivered page before enumerating new candidates');
        return candidateCalls === 2 ? [{ token: 'b'.repeat(64), released: 1, stopped: 0 }] : [];
      }
      return [{ token: 'a'.repeat(64), released: 1, stopped: 0 }];
    },
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: null }),
    openVerifiedMarkdownSnapshot: () => ({ bytes: 1, read: () => ({ text: 'x', next_offset: 1, has_more: false }), dispose: () => { disposed++; } }),
    acknowledgeDeliveredPackages: () => { acknowledgements++; }
  });
  assert.strictEqual(handoff.start().more, false);
  assert.strictEqual(acknowledgements, 0, 'never acknowledge before a response has been returned');
  const second = handoff.start();
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.more, false);
  assert.strictEqual(handoff._test.session().token, 'b'.repeat(64));
  assert.strictEqual(acknowledgements, 1);
  assert.strictEqual(disposed, 1);
  assert.strictEqual(handoff.start().error, 'no_completed_local_batch');
  assert.strictEqual(acknowledgements, 2);
  assert.strictEqual(disposed, 2);
  assert.strictEqual(handoff._test.session(), null);
});

for (const pagedDocument of [true, false]) test(`a new start preserves an unfinished ${pagedDocument ? 'document' : 'result-list'} page`, () => {
  let reads = 0;
  let acknowledgements = 0;
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => [{ token: 'a'.repeat(64), released: 2, stopped: 0 }],
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: pagedDocument ? null : 'next' }),
    readOutputs: () => { reads++; return { documents: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', text: 'x', has_more: pagedDocument, next_offset: 1 }] }; },
    acknowledgeDeliveredPackages: () => { acknowledgements++; }
  });
  assert.strictEqual(handoff.start().more, true);
  const session = handoff._test.session();
  assert.strictEqual(handoff.start().error, 'local_handoff_active');
  assert.strictEqual(handoff._test.session(), session);
  assert.strictEqual(reads, 1);
  assert.strictEqual(acknowledgements, 0);
  handoff.cancel();
});

test('failure acknowledging a terminal session on a new start wipes it without loading new results', () => {
  let candidates = 0;
  let disposed = 0;
  const handoff = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: () => { candidates++; return [{ token: 'a'.repeat(64), released: 1, stopped: 0 }]; },
    listBatchResults: () => ({ results: [{ package_id: 'ds_1234567890abcdef1234567890abcdef', read_capability: 'c'.repeat(43) }], next_cursor: null }),
    openVerifiedMarkdownSnapshot: () => ({ bytes: 1, read: () => ({ text: 'x', next_offset: 1, has_more: false }), dispose: () => { disposed++; } }),
    acknowledgeDeliveredPackages: () => { throw new Error('acknowledgement failed'); }
  });
  assert.strictEqual(handoff.start().more, false);
  assert.throws(() => handoff.start(), /acknowledgement failed/);
  assert.strictEqual(candidates, 1);
  assert.strictEqual(disposed, 1);
  assert.strictEqual(handoff._test.session(), null);
});

done();
