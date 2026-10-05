'use strict';

// App-owned review has one transport budget on every target. Even 5,000
// decisions with the longest accepted ID/choice remain below the desktop's
// 1-MiB frame. Cowork's native-dialog budgets are intentionally independent.
const { MAX_STANDALONE_REVIEW_FINDINGS } = require('../resource-limits').RESOURCE_LIMITS;
const REVIEW_DECISIONS = Object.freeze(['keep', 'redact', 'redact_organization']);

function standaloneReviewSizeError() {
  const error = new Error('Ein Dokument überschreitet die lokale Prüfgrenze von 5.000 Fundstellen oder die Textgrößengrenze. Teile dieses Dokument in kleinere Quelldateien und starte dafür einen neuen Lauf. Ungeprüfte Ergebnisse bleiben gesperrt; bereits geprüfte Ergebnisse bleiben erhalten.');
  error.code = 'LOCAL_REVIEW_TOO_LARGE';
  return error;
}

module.exports = { MAX_STANDALONE_REVIEW_FINDINGS, REVIEW_DECISIONS, standaloneReviewSizeError };
