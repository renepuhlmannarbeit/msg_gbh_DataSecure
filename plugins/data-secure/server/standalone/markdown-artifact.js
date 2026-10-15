'use strict';

const crypto = require('crypto');
const { types } = require('node:util');
const { validateContentOptions, serializeContentOptions } = require('../core/content-options');
const {
  PROCESSING_MODE, SOURCE_TYPES, MAX_MARKDOWN_CHARS, MarkdownContractError,
  exactKeys, validateMarkdownText, validateMarkdownExtractionForOptions, validateCoverage
} = require('./markdown-contract');

const ARTIFACT_SCHEMA = 'datasecure-markdown-artifact/1';
const CONTENT_ARTIFACT_SCHEMA = 'datasecure-markdown-artifact/2';
const ARTIFACT_ID_RE = /^dm_[a-f0-9]{32}$/u;
const SOURCE_VALUES = new Set(SOURCE_TYPES);
const MANIFEST_KEYS = [
  'schema', 'artifact_id', 'processing_mode', 'anonymized', 'source_type',
  'document', 'document_sha256', 'document_bytes', 'extraction_grade', 'reason_codes'
];

function invalidArtifact() { throw new MarkdownContractError('MARKDOWN_ARTIFACT_INVALID'); }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function validateMarkdownArtifact(manifest, markdown) {
  if (!manifest || typeof manifest !== 'object' || types.isProxy(manifest)) invalidArtifact();
  const descriptor = Object.getOwnPropertyDescriptor(manifest, 'schema');
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidArtifact();
  const contentBound = descriptor.value === CONTENT_ARTIFACT_SCHEMA;
  if (!exactKeys(manifest, contentBound ? [...MANIFEST_KEYS, 'content_options'] : MANIFEST_KEYS) ||
      ![ARTIFACT_SCHEMA, CONTENT_ARTIFACT_SCHEMA].includes(manifest.schema) ||
      typeof manifest.artifact_id !== 'string' || !ARTIFACT_ID_RE.test(manifest.artifact_id) ||
      manifest.processing_mode !== PROCESSING_MODE || manifest.anonymized !== false ||
      !SOURCE_VALUES.has(manifest.source_type) || manifest.document !== `${manifest.artifact_id}.md` ||
      typeof manifest.document_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(manifest.document_sha256) ||
      !Number.isSafeInteger(manifest.document_bytes) || manifest.document_bytes < 0 ||
      manifest.document_bytes > MAX_MARKDOWN_CHARS * 4) invalidArtifact();
  try { validateCoverage({ status: manifest.extraction_grade, reason_codes: manifest.reason_codes }); }
  catch { invalidArtifact(); }
  if (contentBound) { try { validateContentOptions(manifest.content_options); } catch { invalidArtifact(); } }
  validateMarkdownText(markdown);
  const bytes = Buffer.from(markdown, 'utf8');
  if (bytes.length !== manifest.document_bytes || digest(bytes) !== manifest.document_sha256) invalidArtifact();
  return manifest;
}

function validateMarkdownArtifactForOptions(manifest, markdown, expected) {
  validateMarkdownArtifact(manifest, markdown);
  try {
    if (types.isProxy(expected)) invalidArtifact();
    if (expected === undefined ? manifest.schema !== ARTIFACT_SCHEMA :
      manifest.schema !== CONTENT_ARTIFACT_SCHEMA || serializeContentOptions(expected) !== serializeContentOptions(manifest.content_options)) invalidArtifact();
  } catch { invalidArtifact(); }
  return manifest;
}

// Pure in-memory construction only. Publication, journaling and local export
// belong to the shared batch lifecycle; this module cannot write or grant read
// capabilities. The caller supplies the deterministic, journal-bound identity.
function createMarkdownArtifact(extraction, artifactId, expectedOptions) {
  if (types.isProxy(extraction) || types.isProxy(expectedOptions)) invalidArtifact();
  validateMarkdownExtractionForOptions(extraction, expectedOptions);
  if (typeof artifactId !== 'string' || !ARTIFACT_ID_RE.test(artifactId)) invalidArtifact();
  // Conversion is deliberately not a privacy release. Partial extraction is
  // retained with its explicit grade; consumers must display its fixed notices.
  const markdown = extraction.markdown;
  const bytes = Buffer.from(markdown, 'utf8');
  const manifest = Object.freeze({
    schema: expectedOptions === undefined ? ARTIFACT_SCHEMA : CONTENT_ARTIFACT_SCHEMA,
    ...(expectedOptions === undefined ? {} : { content_options: validateContentOptions(expectedOptions) }),
    artifact_id: artifactId,
    processing_mode: PROCESSING_MODE,
    anonymized: false,
    source_type: extraction.source_type,
    document: `${artifactId}.md`,
    document_sha256: digest(bytes),
    document_bytes: bytes.length,
    extraction_grade: extraction.coverage.status,
    reason_codes: Object.freeze([...extraction.coverage.reason_codes])
  });
  return Object.freeze({ manifest, markdown });
}

module.exports = Object.freeze({
  ARTIFACT_SCHEMA, CONTENT_ARTIFACT_SCHEMA, ARTIFACT_ID_RE, createMarkdownArtifact, validateMarkdownArtifact, validateMarkdownArtifactForOptions
});
