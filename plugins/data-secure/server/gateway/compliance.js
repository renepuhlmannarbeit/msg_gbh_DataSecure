'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const pii = require('../pii-engine');
const { VERSION, roots, uniquePath } = require('./common');
const { createAuditReceipt, writePackageAudit, retainAudit } = require('./audit');

const MAX_PASSES = 3;

// The residual gate is handed the literals the redactor claims to have
// replaced. Without them the gate can only re-run the redactor's own
// detectors, which by construction cannot find what the redactor missed.
function anonymizeMarkdown(raw, profile) {
  let candidate = String(raw || '');
  const dictionary = [];
  let entityCount = 0;
  let residual = [];
  let passes = 0;
  let strongPersonAnchor = false;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const result = pii.anonymize(candidate, profile);
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
    throw new SafeError(
      `Finale Rest-PII-Prüfung hat nach ${passes} Durchläufen ${residual.length} mögliche ` +
        `direkte Identifikatoren gefunden (${classes}). Verarbeitung wurde fail-closed gestoppt.`
    );
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
  return (
    '<!--\n' +
    `EU Privacy Document Gateway ${VERSION}\n` +
    `Profil: ${profile}\n` +
    `Quelle: ${meta.ext.slice(1).toUpperCase()}\n` +
    'Unterstützte Restprüfung: keine weiteren Treffer\n' +
    `Datenschutz-Pässe: ${meta.passes}\n` +
    `Ersetzte/erfasste Identifikatoren: ${meta.entityCount}\n` +
    `Automatisch freigegebene visuelle Assets: ${meta.included}\n` +
    `Lokale visuelle Review-Items: ${meta.review}\n` +
    'Persistente Rückzuordnung: nein\n' +
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

function moveProcessed(source, originalName = path.basename(source)) {
  const r = roots();
  const dest = uniquePath(r.processed, path.basename(originalName));
  moveExact(source, dest);
  return dest;
}

function moveExact(source, dest) {
  try {
    fs.renameSync(source, dest);
  } catch (renameError) {
    fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
    try {
      fs.unlinkSync(source);
    } catch (unlinkError) {
      try {
        fs.unlinkSync(dest);
      } catch {
        throw new SafeError('Dateiverschiebung ist inkonsistent fehlgeschlagen; manuelle Prüfung erforderlich.');
      }
      throw unlinkError;
    }
  }
  return dest;
}

function restoreProcessed(processed, source) {
  if (fs.existsSync(source)) throw new SafeError('Quelldatei kann nicht sicher wiederhergestellt werden.');
  return moveExact(processed, source);
}

module.exports = {
  MAX_PASSES,
  anonymizeMarkdown,
  aiActNote,
  complianceHeader,
  aiActMeta,
  auditRecord: createAuditReceipt,
  writePackageAudit,
  retainAudit,
  moveProcessed,
  restoreProcessed
};
