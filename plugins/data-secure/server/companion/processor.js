'use strict';

const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { anonymizeSelectedSource } = require('../gateway/orchestrator');
const { jobStatus, transitionJob } = require('./job-store');
const { confirmAutomaticRelease } = require('./local-confirmation');

function localAction() { return { action_id: crypto.randomUUID(), channel: 'local_companion' }; }
function reviewRequired(message) { const error = new SafeError(message); error.code = 'LOCAL_REVIEW_REQUIRED'; return error; }

async function processCompanionJob(jobId, sourcePath, profile, options = {}) {
  if (jobStatus(jobId).state !== 'Created') throw new SafeError('Companion-Job kann nicht erneut automatisch verarbeitet werden.');
  const confirm = options.confirmAutomaticRelease || confirmAutomaticRelease;
  let detected = false;
  try {
    const result = await (options.anonymizeSelectedSource || anonymizeSelectedSource)(sourcePath, profile, {
      ...(options.gatewayDeps || {}),
      companionJobId: jobId,
      onClaimed: () => transitionJob(jobId, 'Claimed'),
      onExtracted: () => transitionJob(jobId, 'Extracted'),
      onDetected: () => { detected = true; return transitionJob(jobId, 'Detected'); },
      beforePublish: (release) => {
        if (release.technical_review_required) throw reviewRequired('Die Datei enthält visuelle oder technisch unsichere Inhalte und benötigt lokale Prüfung.');
        if (!confirm(release.detected_identifiers)) throw reviewRequired('Die zusätzliche lokale Textprüfung wurde nicht übersprungen.');
        transitionJob(jobId, 'Skipped', { human_action: localAction() });
        transitionJob(jobId, 'Verified', { verification: { claim: 'supported_checks_no_further_findings', verifier_mode: 'limited_claim' } });
      },
      afterPublish: (release) => transitionJob(jobId, 'Released', { output_sha256: release.document_sha256 })
    });
    return {
      ok: true, job: jobStatus(jobId), package_id: result.package_id,
      document_id: result.document_id, verification: result.verification,
      detected_identifiers: result.detected_identifiers, raw_content_sent_to_claude: false
    };
  } catch (error) {
    if (error?.code === 'LOCAL_REVIEW_REQUIRED' && detected) throw error;
    const status = jobStatus(jobId);
    if (!['Released', 'Failed', 'Cancelled'].includes(status.state)) {
      try { transitionJob(jobId, 'Failed', { error_code: 'companion_processing_failed' }); } catch { /* keep original safe error */ }
    }
    if (error instanceof SafeError) throw error;
    throw new SafeError('Companion-Verarbeitung wurde sicher gestoppt.');
  }
}

module.exports = { processCompanionJob };
