'use strict';

const crypto = require('crypto');
const {
  PROCESSING_MODE, SOURCE_TYPES, MAX_MARKDOWN_CHARS, MarkdownContractError,
  exactKeys, validateMarkdownText, validateMarkdownExtraction
} = require('./markdown-contract');

const ARTIFACT_SCHEMA = 'datasecure-markdown-artifact/1';
const ARTIFACT_ID_RE = /^dm_[a-f0-9]{32}$/u;
const SOURCE_VALUES = new Set(SOURCE_TYPES);
const MANIFEST_KEYS = [
  'schema', 'artifact_id', 'processing_mode', 'anonymized', 'source_type',
  'document', 'document_sha256', 'document_bytes', 'extraction_grade', 'reason_codes'
];

function invalidArtifact() { throw new MarkdownContractError('MARKDOWN_ARTIFACT_INVALID'); }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function validateMarkdownArtifact(manifest, markdown) {
  if (!exactKeys(manifest, MANIFEST_KEYS) || manifest.schema !== ARTIFACT_SCHEMA ||
      typeof manifest.artifact_id !== 'string' || !ARTIFACT_ID_RE.test(manifest.artifact_id) ||
      manifest.processing_mode !== PROCESSING_MODE || manifest.anonymized !== false ||
      !SOURCE_VALUES.has(manifest.source_type) || manifest.document !== `${manifest.artifact_id}.md` ||
      typeof manifest.document_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(manifest.document_sha256) ||
      !Number.isSafeInteger(manifest.document_bytes) || manifest.document_bytes < 0 ||
      manifest.document_bytes > MAX_MARKDOWN_CHARS * 4 || manifest.extraction_grade !== 'complete' ||
      !Array.isArray(manifest.reason_codes) || manifest.reason_codes.length !== 0) invalidArtifact();
  validateMarkdownText(markdown);
  const bytes = Buffer.from(markdown, 'utf8');
  if (bytes.length !== manifest.document_bytes || digest(bytes) !== manifest.document_sha256) invalidArtifact();
  return manifest;
}

// Pure in-memory construction only. Publication, journaling and local export
// belong to the shared batch lifecycle; this module cannot write or grant read
// capabilities. The caller supplies the deterministic, journal-bound identity.
function createMarkdownArtifact(extraction, artifactId) {
  validateMarkdownExtraction(extraction);
  if (typeof artifactId !== 'string' || !ARTIFACT_ID_RE.test(artifactId)) invalidArtifact();
  // Unknown coverage is not an implicitly authorised partial publication.
  if (extraction.coverage.status !== 'complete') {
    throw new MarkdownContractError('MARKDOWN_EXTRACTION_INCOMPLETE');
  }
  const markdown = extraction.markdown;
  const bytes = Buffer.from(markdown, 'utf8');
  const manifest = Object.freeze({
    schema: ARTIFACT_SCHEMA,
    artifact_id: artifactId,
    processing_mode: PROCESSING_MODE,
    anonymized: false,
    source_type: extraction.source_type,
    document: `${artifactId}.md`,
    document_sha256: digest(bytes),
    document_bytes: bytes.length,
    extraction_grade: 'complete',
    reason_codes: Object.freeze([])
  });
  return Object.freeze({ manifest, markdown });
}

module.exports = Object.freeze({
  ARTIFACT_SCHEMA, createMarkdownArtifact, validateMarkdownArtifact
});
