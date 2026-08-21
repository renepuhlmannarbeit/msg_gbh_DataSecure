'use strict';

const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { anonymizeSelectedSource } = require('../gateway/orchestrator');
const { jobStatus, transitionJob } = require('./job-store');
const { buildReviewDraft, applyManualRedactions, reviewTextLocally } = require('./text-review');

function textSha256(text) { return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex'); }
function localAction(contentSha256) {
  return {
    action_id: crypto.randomUUID(),
    channel: 'local_companion',
    ...(contentSha256 ? { content_sha256: contentSha256 } : {})
  };
}
function reviewRequired(message) { const error = new SafeError(message); error.code = 'LOCAL_REVIEW_REQUIRED'; return error; }
function technicalReviewRequired(message) { const error = new SafeError(message); error.code = 'TECHNICAL_REVIEW_REQUIRED'; return error; }

async function processCompanionJob(jobId, sourcePath, profile, options = {}) {
  if (jobStatus(jobId).state !== 'Created') throw new SafeError('Companion-Job kann nicht erneut automatisch verarbeitet werden.');
  const review = options.reviewTextLocally || (options.confirmAutomaticRelease
    ? ({ anonymized_text, detected_identifiers }) => options.confirmAutomaticRelease(detected_identifiers)
      ? { action: 'skipped' }
      : { action: 'cancelled' }
    : (input) => reviewTextLocally(buildReviewDraft(input.original_text, input.anonymized_text, input.profile)));
  let detected = false;
  let approvedContentSha256 = null;
  let reviewDecision = null;
  try {
    const result = await (options.anonymizeSelectedSource || anonymizeSelectedSource)(sourcePath, profile, {
      ...(options.gatewayDeps || {}),
      companionJobId: jobId,
      onClaimed: () => transitionJob(jobId, 'Claimed'),
      onExtracted: () => transitionJob(jobId, 'Extracted'),
      onDetected: () => { detected = true; return transitionJob(jobId, 'Detected'); },
      reviewText: async (input) => {
        if (input.technical_review_required) throw technicalReviewRequired('Die Datei enthält visuelle oder technisch unsichere Inhalte und benötigt lokale Prüfung.');
        const decision = await review(input);
        if (decision?.action === 'reviewed') {
          if (!Array.isArray(decision.redactions)) {
            throw new SafeError('Die lokale Textprüfung lieferte keine gültigen Anonymisierungsaktionen.');
          }
          const text = applyManualRedactions(input.anonymized_text, decision.redactions);
          approvedContentSha256 = textSha256(text);
          reviewDecision = 'reviewed';
          transitionJob(jobId, 'Reviewed', { human_action: localAction(approvedContentSha256) });
          return { text };
        }
        if (decision?.action === 'skipped') {
          approvedContentSha256 = textSha256(input.anonymized_text);
          reviewDecision = 'skipped';
          transitionJob(jobId, 'Skipped', { human_action: localAction(approvedContentSha256) });
          return { text: input.anonymized_text };
        }
        if (decision?.action === 'cancelled') {
          transitionJob(jobId, 'Cancelled', { human_action: localAction() });
        }
        throw reviewRequired('Die lokale Textprüfung wurde abgebrochen.');
      },
      beforePublish: (release) => {
        if (!approvedContentSha256 || release.reviewed_content_sha256 !== approvedContentSha256) {
          throw new SafeError('Die lokale Freigabe stimmt nicht mit dem geprüften Inhalt überein.');
        }
        transitionJob(jobId, 'Verified', { verification: { claim: 'supported_checks_no_further_findings', verifier_mode: 'limited_claim' } });
      },
      afterPublish: (release) => transitionJob(jobId, 'Released', { output_sha256: release.document_sha256 })
    });
    return {
      ok: true, job: jobStatus(jobId), package_id: result.package_id,
      document_id: result.document_id, verification: result.verification,
      detected_identifiers: result.detected_identifiers, review_decision: reviewDecision,
      raw_content_sent_to_claude: false
    };
  } catch (error) {
    if (error?.code === 'LOCAL_REVIEW_REQUIRED' && detected) throw error;
    const status = jobStatus(jobId);
    if (!['Released', 'Failed', 'Cancelled'].includes(status.state)) {
      try {
        transitionJob(jobId, 'Failed', {
          error_code: error?.code === 'TECHNICAL_REVIEW_REQUIRED'
            ? 'technical_review_required'
            : 'companion_processing_failed'
        });
      } catch { /* keep original safe error */ }
    }
    if (error instanceof SafeError) throw error;
    throw new SafeError('Companion-Verarbeitung wurde sicher gestoppt.');
  }
}

module.exports = { processCompanionJob };
