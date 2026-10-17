'use strict';

// Display-only extraction provenance. Read small immutable publication metadata,
// never document bodies, approval events or a caller-selected artifact path.
// A complete privacy result says nothing about OCR accuracy/source coverage.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot } = require('../runtime');
const { readBoundFile, bindDirectory, assertDirectory } = require('../core/bound-file-io');
const { exactKeys, validateCoverage } = require('../core/source-extraction-contract');
const { validateContentOptions, serializeContentOptions, contentOptionsForBatch } = require('../core/content-options');
const { validateReviewPolicy, reviewPolicyForBatch } = require('../core/standalone-review-policy');
const { validateExpectation } = require('./anonymized-artifact');
const ID = /^[a-f0-9]{32}$/u, TOKEN = /^[a-f0-9]{64}$/u;
// Same closed intake-rejection vocabulary as the immutable run-membership
// store; arbitrary processing errors cannot become a preflight source record.
const PREFLIGHT_REASONS = new Set(['SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_TYPE_MISMATCH', 'SOURCE_ENCRYPTED_UNSUPPORTED',
  'SOURCE_POLYGLOT_UNSUPPORTED', 'SOURCE_CONTAINER_CORRUPT', 'SOURCE_CONTAINER_LIMIT',
  'SOURCE_ACTIVE_CONTENT_UNSUPPORTED', 'SOURCE_TEXT_INVALID', 'SOURCE_COMPOUND_BINARY_UNSUPPORTED', 'SOURCE_FORMAT_NOT_RELEASED']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const invalid = () => { throw Error('STANDALONE_CONTENT_NOTICE_UNAVAILABLE'); };
const safeLabel = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
  !path.win32.isAbsolute(value) && !path.posix.isAbsolute(value) && !/[:\\\p{Cc}]/u.test(value) &&
  value.split('/').every(part => part && part !== '.' && part !== '..');
const unknown = () => ({ content_notice_count: 0, content_notice_breakdown_complete: false, content_notices: [] });

function anonymizationContentNotices(batchId, { state, expectedCount, privateRoot = dataRoot() } = {}) {
  const result = unknown();
  try {
    if (!TOKEN.test(batchId || '') || !Number.isSafeInteger(expectedCount) || expectedCount < 0 || expectedCount > 200) invalid();
    const root = path.join(privateRoot, 'document-reviews', batchId), directory = bindDirectory(root);
    const read = (name, maximum = 16384) => json(readBoundFile(path.join(root, name), { directory, maximum, minimum: 1 }));
    const manifest = read('manifest.json', 384 * 1024), automatic = manifest.schema === 'datasecure-document-run/4';
    if (!exactKeys(manifest, ['schema', 'batch_id', 'product_channel', 'processing_mode', 'documents',
      'preflight_rejections', 'content_options', ...(automatic ? ['review_policy'] : [])]) ||
        !['datasecure-document-run/3', 'datasecure-document-run/4'].includes(manifest.schema) ||
        manifest.batch_id !== batchId || manifest.product_channel !== 'standalone' ||
        manifest.processing_mode !== 'markdown-and-anonymize' || !Array.isArray(manifest.documents) || manifest.documents.length > 200 ||
        manifest.documents.some(row => !exactKeys(row, ['document_id', 'source_sha256', 'name']) ||
          !ID.test(row.document_id) || !TOKEN.test(row.source_sha256) || !safeLabel(row.name)) ||
        !Array.isArray(manifest.preflight_rejections) || manifest.preflight_rejections.length > 200 ||
        manifest.preflight_rejections.some(row => !exactKeys(row, ['document_id', 'name', 'reason_code']) ||
          !ID.test(row.document_id) || !safeLabel(row.name) || !PREFLIGHT_REASONS.has(row.reason_code)) ||
        manifest.documents.length + manifest.preflight_rejections.length < 1 ||
        manifest.documents.length + manifest.preflight_rejections.length > 200 ||
        new Set([...manifest.documents, ...manifest.preflight_rejections].map(row => row.document_id)).size !==
          manifest.documents.length + manifest.preflight_rejections.length) invalid();
    validateContentOptions(manifest.content_options);
    if (automatic) validateReviewPolicy(manifest.review_policy, { productChannel: 'standalone',
      processingMode: manifest.processing_mode, documentReview: true, contentOptions: manifest.content_options });
    let expected;
    if (state) {
      if (state.token !== batchId || state.product_channel !== 'standalone' || state.processing_mode !== manifest.processing_mode ||
          serializeContentOptions(contentOptionsForBatch(state)) !== serializeContentOptions(manifest.content_options) ||
          reviewPolicyForBatch(state) !== manifest.review_policy || !Array.isArray(state.items)) invalid();
      expected = state.items.filter(item => item.status === 'released').map(item => {
        const member = manifest.documents.find(row => row.document_id === item.id);
        if (!member || member.source_sha256 !== item.sha256 || member.name !== (item.source_label || item.name) ||
            item.package_id !== `ds_${item.id}`) invalid();
        return member;
      });
    } else {
      expected = fs.readdirSync(root).filter(name => /^published-[a-f0-9]{32}\.json$/u.test(name)).map(name => {
        const id = name.slice(10, -5), member = manifest.documents.find(row => row.document_id === id);
        if (!member) invalid();
        return member;
      });
    }
    if (expected.length !== expectedCount || new Set(expected.map(row => row.document_id)).size !== expected.length) invalid();
    let verified = 0;
    for (const member of expected) {
      try {
        const membership = read(`published-${member.document_id}.json`);
        if (!exactKeys(membership, ['schema', 'batch_id', 'document_id', 'package_id', 'processing_mode', 'source_sha256', 'output_sha256', 'name']) ||
            membership.schema !== 'datasecure-document-membership/1' || membership.batch_id !== batchId ||
            membership.document_id !== member.document_id || membership.package_id !== `ds_${member.document_id}` ||
            membership.processing_mode !== manifest.processing_mode || membership.source_sha256 !== member.source_sha256 ||
            membership.name !== member.name || !TOKEN.test(membership.output_sha256)) invalid();
        const publicationDirectory = bindDirectory(path.join(root, member.document_id));
        const publication = json(readBoundFile(path.join(publicationDirectory.path, 'published.json'),
          { directory: publicationDirectory, maximum: 16384, minimum: 1 }));
        if (!exactKeys(publication, ['schema', 'package_id', 'output_sha256', 'publication_binding']) ||
            publication.schema !== 'datasecure-document-publication/2' || publication.package_id !== membership.package_id ||
            publication.output_sha256 !== membership.output_sha256) invalid();
        const binding = validateExpectation(publication.publication_binding);
        const extension = path.posix.extname(member.name).slice(1).toLowerCase();
        const sourceType = extension === 'jpg' ? 'jpeg' : extension === 'markdown' ? 'md' : extension;
        if (binding.package_id !== membership.package_id || binding.document_sha256 !== membership.output_sha256 ||
            (state && state.profile !== 'auto' && binding.profile !== state.profile) ||
            binding.source_type !== sourceType || serializeContentOptions(binding.content_options) !== serializeContentOptions(manifest.content_options)) invalid();
        const folder = path.join(privateRoot, 'standalone-anonymized-artifacts', 'Output', binding.package_id), artifactDirectory = bindDirectory(folder);
        const bytes = readBoundFile(path.join(folder, 'manifest.json'), { directory: artifactDirectory, maximum: 16384, minimum: 1 });
        if (hash(bytes) !== binding.manifest_sha256) invalid();
        const artifact = json(bytes);
        if (artifact.schema !== 'eu-privacy-package/4' || artifact.package_id !== binding.package_id ||
            artifact.product_channel !== 'standalone' || artifact.processing_mode !== manifest.processing_mode ||
            artifact.source_type !== binding.source_type || artifact.document_sha256 !== binding.document_sha256 ||
            artifact.profile !== binding.profile || serializeContentOptions(artifact.content_options) !== serializeContentOptions(binding.content_options)) invalid();
        validateCoverage(artifact.source_extraction_coverage);
        assertDirectory(artifactDirectory); assertDirectory(publicationDirectory); assertDirectory(directory);
        verified++;
        if (artifact.source_extraction_coverage.status === 'incomplete') result.content_notices.push({ name: member.name,
          reason_codes: [...artifact.source_extraction_coverage.reason_codes] });
      } catch { /* Missing or changed provenance is unknown, never proof of zero notices. */ }
    }
    result.content_notice_count = result.content_notices.length;
    result.content_notice_breakdown_complete = verified === expectedCount;
    return result;
  } catch { return result; }
}

module.exports = Object.freeze({ anonymizationContentNotices });
