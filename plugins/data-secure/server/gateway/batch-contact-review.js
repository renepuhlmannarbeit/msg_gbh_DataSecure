'use strict';

const { buildContactBatch, resolveContactBatch } = require('./ocr-contact-batch');
const { buildContactDraft } = require('../core/ocr-contact-review');

function createBatchContactReview({ captureDeferredReviewInput, convertNext, exactPendingEntry, contactStore,
  claimStandaloneDocument = (_state, action) => { action(); return true; } }) {
  return async function reviewContacts(state, items, deps) {
    let entries = [];
    const checkAbort = () => {
      if (deps.abortSignal?.aborted) throw Object.assign(new Error('LOCAL_REVIEW_CANCELLED'), { code: 'LOCAL_REVIEW_CANCELLED' });
    };
    const flush = async () => {
      if (!entries.length) return true;
      checkAbort();
      if (!claimStandaloneDocument(state, () => {})) return false;
      const bundle = buildContactBatch(entries);
      if (typeof deps.reviewTextLocally !== 'function') throw Object.assign(new Error('LOCAL_REVIEW_DEFERRED'), { code: 'LOCAL_REVIEW_DEFERRED' });
      const outcome = resolveContactBatch(bundle, await deps.reviewTextLocally(bundle.draft));
      checkAbort();
      if (outcome.action !== 'reviewed') throw Object.assign(new Error('LOCAL_REVIEW_DEFERRED'), {
        code: outcome.action === 'cancelled' ? 'LOCAL_REVIEW_CANCELLED' : 'LOCAL_REVIEW_DEFERRED' });
      // A failed write leaves only complete, source-bound document answers.
      // A retry skips them; no unchecked output is released by this phase.
      entries.forEach((entry, index) => contactStore.write(state, entry.item, entry.input, outcome.answers[index]));
      entries = [];
      return claimStandaloneDocument(state, () => {});
    };
    for (const item of items) {
      checkAbort();
      if (!claimStandaloneDocument(state, () => {})) return { pauseBlocked: true };
      let input;
      if (state.processing_mode === 'markdown-only') {
        input = await convertNext(state.profile, { ...deps, inputQueue: [exactPendingEntry(state, item)],
          captureOcrInput: value => value });
        if (input && contactStore.read(state, item, input) !== null) input = null;
      } else {
        input = (await captureDeferredReviewInput(state, item, { ...deps, captureOcrInput: true })).ocr_contact_input;
      }
      if (!input) continue;
      buildContactDraft(input); // single-document bounds must also hold
      const entry = { item, input, source_label: item.source_label };
      try { buildContactBatch([...entries, entry]); }
      catch (error) {
        // Any single-document failure is still a failure. Splitting can only
        // resolve a combined contact/text/image budget, never invalid input.
        buildContactBatch([entry]);
        if (!entries.length) throw error;
        if (!await flush()) return { pauseBlocked: true };
      }
      entries.push(entry);
    }
    return { pauseBlocked: !await flush() };
  };
}

module.exports = { createBatchContactReview };
