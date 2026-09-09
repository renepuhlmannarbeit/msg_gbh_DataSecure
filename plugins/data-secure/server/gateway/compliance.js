'use strict';

const { SafeError } = require('../runtime');
const pii = require('../pii-engine');
const { VERSION } = require('./common');
const { createAuditReceipt, writePackageAudit, retainAudit } = require('./audit');
const { validateCoverage } = require('../core/source-extraction-contract');

const MAX_PASSES = 3;

// The residual gate is handed the literals the redactor claims to have
// replaced. Without them the gate can only re-run the redactor's own
// detectors, which by construction cannot find what the redactor missed.
function anonymizeMarkdown(raw, profile, options = {}) {
  let candidate = String(raw || '');
  const dictionary = [];
  let entityCount = 0;
  let residual = [];
  let passes = 0;
  let strongPersonAnchor = false;
  // A batch-scoped registry is deliberately an internal dependency. The MCP
  // schema never accepts one and this function neither persists nor creates a
  // secret: the batch-owned pseudonym context supplies that binding. No
  // platform keyring or future secret-store gate is part of this code path.
  const anonymizeOptions = options.registry ? { registry: options.registry } : undefined;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const result = pii.anonymize(candidate, profile, anonymizeOptions);
    candidate = result.text;
    entityCount += result.findings.length;
    for (const value of result.dictionary || []) dictionary.push(value);
    strongPersonAnchor ||= result.strongPersonAnchor === true;
    passes = pass;
    residual = pii.scanResidual(candidate, profile, dictionary, { strongPersonAnchor });
    if (!residual.length) break;
  }

  if (residual.length) {
    const classes = [...new Set(residual.map((r) => r.type))].sort().join(', ');
    const error = new SafeError(
      `Finale Rest-PII-Prüfung hat nach ${passes} Durchläufen ${residual.length} mögliche ` +
        `direkte Identifikatoren gefunden (${classes}). Verarbeitung wurde fail-closed gestoppt.`
    );
    // A residual finding is deterministic for the same source and ruleset.
    // It must be a terminal, explainable result instead of masquerading as an
    // interrupted worker that the history UI offers to resume forever.
    error.code = 'RESIDUAL_PII';
    throw error;
  }

  return {
    text: candidate,
    entityCount,
    passes,
    dictionary,
    strongPersonAnchor,
    reidentificationRisk: profile === 'personnel_profile' ? 'high' : 'context_dependent'
  };
}

function aiActNote(profile) {
  if (profile === 'applicant') {
    return (
      'Bewerberanalyse/-filterung/-bewertung für Auswahlentscheidungen kann Annex III ' +
      'Beschäftigung betreffen. Kein automatisches Ranking oder Entscheiden ohne ' +
      'freigegebenen Governance-Prozess.'
    );
  }
  if (profile === 'personnel_profile') {
    return (
      'Bei Beschäftigten können insbesondere Bewertung, Beförderung, Kündigung, Überwachung ' +
      'oder bestimmte auf Verhalten/Persönlichkeitsmerkmalen basierende Aufgabenzuweisungen ' +
      'Annex III betreffen. Kompetenzbeschreibung allein ist nicht automatisch High-Risk; ' +
      'Zweck separat klassifizieren.'
    );
  }
  return (
    'Die AI-Act-Risikoklasse hängt vom nachgelagerten Verwendungszweck ab; ' +
    'Privacy-Verarbeitung ist keine Konformitätszertifizierung.'
  );
}

function complianceHeader(profile, meta) {
  let processingScope = '';
  if (meta.sourceExtractionCoverage !== undefined) {
    const coverage = validateCoverage(meta.sourceExtractionCoverage);
    const extractionStatus = coverage.status === 'complete'
      ? 'Markdown erzeugt; Quellvollständigkeit durch den lokalen Konverter bestätigt'
      : `Markdown erzeugt; Vollständigkeit des Originalcontainers nicht garantiert (${coverage.reason_codes.join(', ')})`;
    processingScope =
      `Extraktionsstatus: ${extractionStatus}\n` +
      'Anonymisierungsstatus: extrahierter Markdown-Inhalt vollständig geprüft\n';
  }
  return (
    '<!--\n' +
    `EU Privacy Document Gateway ${VERSION}\n` +
    `Profil: ${profile}\n` +
    `Quelle: ${meta.ext.slice(1).toUpperCase()}\n` +
    processingScope +
    'Unterstützte Restprüfung: keine weiteren Treffer\n' +
    `Datenschutz-Pässe: ${meta.passes}\n` +
    `Ersetzte/erfasste Identifikatoren: ${meta.entityCount}\n` +
    `Automatisch freigegebene visuelle Assets: ${meta.included}\n` +
    `Auf ausdrücklichen Wunsch entfernte visuelle Assets: ${meta.removed || 0}\n` +
    `Lokale visuelle Review-Items: ${meta.review}\n` +
    'Keine persistente Personen-Pseudonymtabelle; lokale Zuordnung von Originaldatei und Ergebnis vorhanden.\n' +
    `Re-Identifikationsrisiko: ${meta.reidentificationRisk}\n` +
    'Hinweis: De-Identifizierung garantiert keine rechtliche Anonymität.\n' +
    `Bildtext: OCR-Text zurückgehaltener Grafiken ist nach Textprüfung enthalten (${meta.review} Item(s)).\n` +
    `EU AI Act: ${aiActNote(profile)}\n` +
    '-->\n\n'
  );
}

function aiActMeta(profile) {
  if (profile === 'applicant') {
    return {
      employment_annex_iii_possible: true,
      prohibit_unapproved_ranking: true,
      human_oversight_governance_required_for_high_risk_use: true
    };
  }
  if (profile === 'personnel_profile') {
    return {
      employment_annex_iii_possible_for_evaluation_promotion_termination_monitoring_or_certain_task_allocation: true,
      descriptive_skill_profile_not_automatically_high_risk: true,
      downstream_purpose_classification_required: true
    };
  }
  return { downstream_purpose_classification_required: true };
}

module.exports = {
  MAX_PASSES,
  anonymizeMarkdown,
  aiActNote,
  complianceHeader,
  aiActMeta,
  auditRecord: createAuditReceipt,
  writePackageAudit,
  retainAudit
};
