'use strict';

// Native persisted-reader boundary. A journal or callback is not a publication
// receipt: derive context from the independent run anchor and immutable basis,
// then read the exact private artifact. No public Output fallback or stat cache.
const fs = require('node:fs');
const path = require('node:path');
const { bindDirectory, assertDirectory } = require('../core/bound-file-io');
const { contentOptionsForBatch, serializeContentOptions } = require('../core/content-options');
const { assertAnonymizationBatch } = require('../core/processing-mode');
const { createDocumentReviewStore } = require('./standalone-document-review-store');
const { anonymizedArtifactRoots, readAnonymizedArtifact } = require('../standalone/anonymized-store');
const invalid = () => Object.assign(Error('STANDALONE_PUBLICATION_INVALID'), { code: 'STANDALONE_PUBLICATION_INVALID' });

function isBoundAnonymization(state) {
  const options = contentOptionsForBatch(state);
  if (!options) return false;
  assertAnonymizationBatch(state);
  return true;
}
function expectedPublication(state, item) {
  if (!isBoundAnonymization(state)) throw invalid();
  const review = createDocumentReviewStore();
  const member = review.assertDocumentBinding(state, item);
  const expected = review.publicationExpectation(state.token, item.id);
  const extension = path.extname(member.name).slice(1).toLowerCase();
  const sourceType = extension === 'jpg' ? 'jpeg' : extension === 'markdown' ? 'md' : extension;
  if (expected.package_id !== `ds_${member.document_id}` || expected.source_type !== sourceType ||
      serializeContentOptions(expected.content_options) !== serializeContentOptions(state.content_options) ||
      (state.profile !== 'auto' && expected.profile !== state.profile)) throw invalid();
  return expected;
}
function privatePublicationRecord(packageId, state, item) {
  const record = status => ({ state: status, document_result: null });
  try {
    if (!isBoundAnonymization(state) || typeof packageId !== 'string' || packageId !== `ds_${item?.id}`) throw invalid();
    // Missing basis is normal only when the actual target is securely absent.
    // Missing run membership is never permission to process from the journal.
    createDocumentReviewStore().assertDocumentBinding(state, item);
    const output = anonymizedArtifactRoots().output, directory = bindDirectory(output);
    const target = path.join(output, packageId);
    try { fs.lstatSync(target); }
    catch (error) {
      if (error?.code !== 'ENOENT') return record('unsafe');
      assertDirectory(directory);
      if (['mapping_pending', 'delivery_pending', 'released'].includes(item.status) || item.checkpoint === 'package_published' ||
          createDocumentReviewStore().hasPublicationEvidence(state, item)) return record('unsafe');
      return record('missing');
    }
    const expectation = expectedPublication(state, item);
    const value = readAnonymizedArtifact(packageId, expectation);
    assertDirectory(directory);
    return { state: 'verified', document_result: value.manifest.document_result, publication_binding: expectation };
  } catch { return record('unsafe'); }
}
function confirmPublication(state, item) {
  const record = privatePublicationRecord(`ds_${item.id}`, state, item);
  if (record.state !== 'verified') throw invalid();
  createDocumentReviewStore().recordPublication(state.token, item.id);
  return record;
}
module.exports = Object.freeze({ isBoundAnonymization, expectedPublication, privatePublicationRecord, confirmPublication });
