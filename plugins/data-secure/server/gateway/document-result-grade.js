'use strict';

const { RESOURCE_LIMITS } = require('../resource-limits');

const { MAX_VISUAL_ASSETS } = RESOURCE_LIMITS;

const SCHEMA = 'datasecure-document-result/1';
const GRADES = Object.freeze({
  COMPLETE: 'complete',
  USABLE_WITH_OMISSIONS: 'usable-with-omissions',
  NOT_PROCESSED: 'not-processed'
});
const OMISSION_CODES = Object.freeze({
  IMAGES_REMOVED_BY_REQUEST: 'IMAGES_REMOVED_BY_REQUEST',
  VISUAL_ASSETS_WITHHELD_LOCALLY: 'VISUAL_ASSETS_WITHHELD_LOCALLY'
});
const GRADE_VALUES = new Set(Object.values(GRADES));
const OMISSION_VALUES = new Set(Object.values(OMISSION_CODES));
const RESULT_KEYS = ['grade', 'omissions', 'reason_code', 'schema'].sort();
const OMISSION_KEYS = ['code', 'count'].sort();
const SAFE_REASON = /^[A-Z][A-Z0-9_]{0,95}$/u;

class DocumentResultError extends Error {
  constructor(message = 'Ungültiger Dokumentergebnisgrad.') {
    super(message);
    this.name = 'DocumentResultError';
  }
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === expected.join(',');
}

function validateDocumentResult(value) {
  if (!exactKeys(value, RESULT_KEYS) || value.schema !== SCHEMA || !GRADE_VALUES.has(value.grade) ||
      !Array.isArray(value.omissions) || value.omissions.length > OMISSION_VALUES.size) {
    throw new DocumentResultError();
  }
  const seen = new Set();
  for (const omission of value.omissions) {
    if (!exactKeys(omission, OMISSION_KEYS) || !OMISSION_VALUES.has(omission.code) ||
        seen.has(omission.code) || !Number.isSafeInteger(omission.count) || omission.count < 1 ||
        omission.count > MAX_VISUAL_ASSETS) {
      throw new DocumentResultError();
    }
    seen.add(omission.code);
  }
  const ordered = [...seen].sort();
  if (ordered.join(',') !== value.omissions.map((entry) => entry.code).join(',')) throw new DocumentResultError();
  if (value.grade === GRADES.COMPLETE && (value.omissions.length !== 0 || value.reason_code !== null)) {
    throw new DocumentResultError();
  }
  if (value.grade === GRADES.USABLE_WITH_OMISSIONS &&
      (value.omissions.length === 0 || value.reason_code !== null)) {
    throw new DocumentResultError();
  }
  if (value.grade === GRADES.NOT_PROCESSED &&
      (value.omissions.length !== 0 || !SAFE_REASON.test(String(value.reason_code || '')))) {
    throw new DocumentResultError();
  }
  return value;
}

function immutableResult(grade, omissions, reasonCode = null) {
  const value = {
    schema: SCHEMA,
    grade,
    omissions: omissions.map((entry) => Object.freeze({ ...entry })).sort((left, right) => left.code.localeCompare(right.code)),
    reason_code: reasonCode
  };
  validateDocumentResult(value);
  Object.freeze(value.omissions);
  return Object.freeze(value);
}

function releasedDocumentResult(signals = {}) {
  const parserWarnings = signals.parserWarnings;
  const visualResults = signals.visualResults;
  const unreviewedVisualCount = Number(signals.unreviewedVisualCount || 0);
  const explicitlyRemoved = Number(signals.imagesRemovedByExplicitRequest || 0);
  if (!Array.isArray(parserWarnings) || parserWarnings.length !== 0 || !Array.isArray(visualResults) ||
      visualResults.length > MAX_VISUAL_ASSETS || !Number.isSafeInteger(unreviewedVisualCount) ||
      unreviewedVisualCount !== 0 || !Number.isSafeInteger(explicitlyRemoved) || explicitlyRemoved < 0 ||
      explicitlyRemoved > MAX_VISUAL_ASSETS) {
    throw new DocumentResultError('Das Dokument besitzt keine sicher klassifizierbare vollständige Abdeckung.');
  }
  const counts = { included: 0, removed: 0, review_required: 0 };
  for (const visual of visualResults) {
    const status = String(visual?.status || '');
    if (!Object.hasOwn(counts, status)) throw new DocumentResultError();
    counts[status]++;
  }
  const withheldAtRelease = signals.visualAssetsWithheldAtRelease === undefined
    ? counts.review_required
    : Number(signals.visualAssetsWithheldAtRelease);
  if (!Number.isSafeInteger(withheldAtRelease) || withheldAtRelease < counts.review_required ||
      withheldAtRelease < 0 || withheldAtRelease > visualResults.length) throw new DocumentResultError();
  if (counts.removed !== explicitlyRemoved) throw new DocumentResultError();
  const omissions = [];
  if (counts.removed > 0) omissions.push({ code: OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST, count: counts.removed });
  if (withheldAtRelease > 0) omissions.push({ code: OMISSION_CODES.VISUAL_ASSETS_WITHHELD_LOCALLY, count: withheldAtRelease });
  return immutableResult(omissions.length ? GRADES.USABLE_WITH_OMISSIONS : GRADES.COMPLETE, omissions);
}

function notProcessedDocumentResult(reasonCode) {
  return immutableResult(GRADES.NOT_PROCESSED, [], String(reasonCode || ''));
}

function sameDocumentResult(left, right) {
  try {
    validateDocumentResult(left);
    validateDocumentResult(right);
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function positiveDocumentResult(value) {
  validateDocumentResult(value);
  if (![GRADES.COMPLETE, GRADES.USABLE_WITH_OMISSIONS].includes(value.grade)) {
    throw new DocumentResultError();
  }
  return value;
}

function validateManifestDocumentResult(manifest) {
  if (!manifest || manifest.schema !== 'eu-privacy-package/3') throw new DocumentResultError();
  const expected = releasedDocumentResult({
    parserWarnings: manifest.parser_warnings,
    visualResults: manifest.assets,
    unreviewedVisualCount: manifest.pdf_unextractable_visual_objects,
    imagesRemovedByExplicitRequest: manifest.images_removed_by_explicit_request,
    visualAssetsWithheldAtRelease: manifest.visual_assets_withheld_at_release
  });
  validateDocumentResult(manifest.document_result);
  if (JSON.stringify(expected) !== JSON.stringify(manifest.document_result)) throw new DocumentResultError();
  return manifest.document_result;
}

module.exports = Object.freeze({
  SCHEMA,
  GRADES,
  OMISSION_CODES,
  DocumentResultError,
  validateDocumentResult,
  releasedDocumentResult,
  notProcessedDocumentResult,
  sameDocumentResult,
  positiveDocumentResult,
  validateManifestDocumentResult
});
