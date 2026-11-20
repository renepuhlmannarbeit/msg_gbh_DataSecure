'use strict';

// App-owned review has one transport budget on every target. Even 5,000
// decisions with the longest accepted ID/choice remain below the desktop's
// 1-MiB frame. Cowork's native-dialog budgets are intentionally independent.
const { MAX_STANDALONE_REVIEW_FINDINGS, MAX_BATCH_FILES } = require('../resource-limits').RESOURCE_LIMITS;
const REVIEW_DECISIONS = Object.freeze(['keep', 'redact', 'redact_organization']);

function standaloneReviewSizeError() {
  const error = new Error('Ein Dokument überschreitet die lokale Prüfgrenze von 5.000 Fundstellen oder die Textgrößengrenze. Teile dieses Dokument in kleinere Quelldateien und starte dafür einen neuen Lauf. Ungeprüfte Ergebnisse bleiben gesperrt; bereits geprüfte Ergebnisse bleiben erhalten.');
  error.code = 'LOCAL_REVIEW_TOO_LARGE';
  return error;
}

// A source name is an identity, not a display capability. Preserve safe spelling
// exactly; use the current UI document ordinal for an unsafe display label.
// Never write this presentation fallback back into the source entry or binding.
function standaloneReviewSourceLabel(value, documentIndex) {
  if (!Number.isSafeInteger(documentIndex) || documentIndex < 1 || documentIndex > MAX_BATCH_FILES)
    throw Object.assign(new Error('Die lokale Dokumentanzeige konnte nicht sicher zugeordnet werden.'), { code: 'LOCAL_REVIEW_FAILED' });
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 &&
    !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) ? value : `Dokument ${documentIndex}`;
}

module.exports = { MAX_STANDALONE_REVIEW_FINDINGS, REVIEW_DECISIONS, standaloneReviewSizeError, standaloneReviewSourceLabel };
