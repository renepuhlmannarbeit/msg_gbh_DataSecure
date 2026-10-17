'use strict';

const { SafeError } = require('../runtime');
const { storageStatus, detectProfileFromMarkdown } = require('./common');
const { checkedContentHooks, extractBoundContentInput } = require('./bound-content-input');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('./privacy-text-operation');
const { verifyAnonymizedPublication, createAnonymizedArtifact } = require('../standalone/anonymized-artifact');
const { readAnonymizedArtifact, publishAnonymizedArtifact } = require('../standalone/anonymized-store');
const { sanitizeReceipt, retainAudit } = require('./audit');
const { renameWithTransientRetry } = require('./batch-journal-io');
const path = require('node:path');
const unconfirmed = () => Object.assign(new SafeError('Das veröffentlichte Ergebnis bleibt erhalten; seine Bestätigung wird lokal abgeglichen.'), { code: 'BATCH_PUBLICATION_UNCONFIRMED' });

async function publishPersistedContent(context, suppliedHooks) {
  require('./content-operation-authority').assertContentOperationContext(context, 'publication');
  const hooks = checkedContentHooks(suppliedHooks, 'publication');
  context.assertPseudonymRegistry(hooks.pseudonymRegistry);
  if (!storageStatus().safe) throw Object.assign(new SafeError('Der lokale Datenschutzordner ist kein zulässiger Speicherort.'), { code: 'UNSAFE_STORAGE_LOCATION' });
  const check = () => { context.revalidate(); hooks.checkAbort(); };
  let prepared, committed = false, barrierError;
  let phase = 'content_prepare';
  const started = Date.now();
  const details = () => Object.freeze({ package_id: context.package_id, profile: prepared.artifact.manifest.profile,
    document_sha256: prepared.artifact.expectation.document_sha256, document_result: prepared.artifact.manifest.document_result,
    publication_binding: prepared.artifact.expectation });
  function retainCommittedAudit() {
    context.assertOwnedEpoch();
    readAnonymizedArtifact(context.package_id, prepared.artifact.expectation);
    return retainAudit(prepared.audit_receipt);
  }
  try {
    prepared = context.preparedReplay();
    // Existing committed bytes are discovered before cancellation can demote
    // them to a parser stop. A saved prepared state is never re-extracted.
    const record = context.publicationRecord();
    if (record.state === 'unsafe') throw Object.assign(Error('STANDALONE_PUBLICATION_INVALID'), { code: 'STANDALONE_PUBLICATION_INVALID' });
    if (record.state === 'verified') {
      phase = 'content_ack';
      committed = true;
      if (!prepared || JSON.stringify(record.publication_binding) !== JSON.stringify(prepared.artifact.expectation)) throw unconfirmed();
      if (hooks.beforePublish) { await hooks.beforePublish(details()); context.assertOwnedEpoch(); }
      if (hooks.afterPublish) { await hooks.afterPublish(details()); context.assertOwnedEpoch(); }
    } else {
      check();
      if (!prepared) {
        phase = 'content_extract';
        const source = await extractBoundContentInput(context, hooks); check();
        phase = 'content_privacy';
        const profile = context.profile === 'auto' ? detectProfileFromMarkdown(source.extraction.markdown) : context.profile;
        const operation = prepareTextPrivacyReview({ text: source.extraction.markdown, profile, productChannel: 'standalone',
          consumerOptions: { productChannel: 'standalone', contentOptions: context.content_options }, registry: hooks.pseudonymRegistry,
          captureTrace: true, technicalReviewRequired: source.extraction.coverage.status !== 'complete',
          ocrLineReview: source.extraction.coverage.reason_codes.includes('OCR_NOT_VERIFIED'),
          sourceRedaction: source.source_redaction || null });
        if (hooks.onDetected) { await hooks.onDetected({ profile, detected_identifiers: operation.entityCount }); check(); }
        const reviewed = await resolveTextPrivacyReview(operation, hooks.reviewText,
          { checkAbort: check, reviewPolicy: context.review_policy || 'manual' }); check();
        // Both converters already render their selected content/notes profile.
        // No Legacy compliance claim, image reference or raw OCR notice follows.
        const final = finalizeTextPrivacyReview(operation, reviewed, { prefix: '', suffix: '' });
        phase = 'content_verify';
        const proof = verifyAnonymizedPublication({ markdown: final.markdown, profile, content_options: context.content_options,
          source_extraction: source.extraction, dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor,
          reviewed_person_candidates: final.reviewed_person_candidates });
        const artifact = createAnonymizedArtifact({ package_id: context.package_id, content_options: context.content_options,
          source_type: context.source_type, profile, operation_id: context.operation_id, created_at: context.created_at,
          coverage: source.extraction.coverage, markdown: final.markdown, verification_proof: proof });
        const receipt = sanitizeReceipt({ operation_id: context.operation_id, timestamp: context.created_at,
          gateway_version: artifact.manifest.gateway_version, privacy_ruleset: artifact.manifest.privacy_ruleset,
          credential_context_policy: artifact.manifest.credential_context_policy, profile, source_extension: path.extname(context.source_name).toLowerCase(),
          source_bytes: context.source_bytes, result: 'released', document_result: artifact.manifest.document_result,
          text_entity_count: operation.entityCount, privacy_passes: operation.passes, residual_pii_verification: 'passed',
          reidentification_risk: operation.reidentificationRisk });
        if (hooks.persistStandaloneIdentitySnapshot) {
          const entries = ['PERSON', 'ORG', 'PROJECT'].flatMap(kind => hooks.pseudonymRegistry.entriesForKind(kind)
            .filter(row => final.markdown.includes(row.placeholder) && /^\[(?:PERSON|UNTERNEHMEN|PROJEKT)_\d{3,5}\]$/u.test(row.placeholder))
            .map(row => ({ pseudonym: row.placeholder, original: row.value })));
          const captured = new Set(entries.map(row => row.pseudonym));
          const unmapped_labels = [...new Set(final.markdown.match(/\[(?:PERSON|UNTERNEHMEN|PROJEKT)_\d{3,5}\]/gu) || [])].filter(label => !captured.has(label));
          // This optional local human aid cannot weaken or replace verification.
          try { await hooks.persistStandaloneIdentitySnapshot({ package_id: context.package_id, entries, unmapped_labels }); }
          catch { /* absent/incomplete private reference remains separately visible */ }
          check();
        }
        phase = 'content_prepare';
        const witness = context.commitPreparedRegistry(hooks.pseudonymRegistry, artifact.expectation.manifest_sha256);
        check();
        phase = 'content_prepare';
        context.capturePrepared({ package_id: context.package_id, content_options: context.content_options, source_type: context.source_type,
          original_text: final.original_text, markdown: final.markdown, transform_trace: final.transform_trace,
          verification_context: final.verification_context, publication_binding: artifact.expectation,
          ...(source.private_document_metadata ? { private_document_metadata: source.private_document_metadata } : {}) },
        { manifest_json: JSON.stringify(artifact.manifest), audit_receipt: receipt, registry_commit: witness });
        prepared = context.preparedReplay(); if (!prepared) throw unconfirmed();
      }
      check();
      phase = 'content_publish';
      await publishAnonymizedArtifact(prepared.publication_input, {
        beforePublish: async value => { check(); if (hooks.beforePublish) await hooks.beforePublish(value); check(); },
        publishPackage(from, to) {
          try { check(); } catch (error) { barrierError = error; throw error; }
          renameWithTransientRetry(from, to);
        },
        afterPublish: async value => {
          committed = true; context.assertOwnedEpoch();
          if (hooks.afterPublish) await hooks.afterPublish(value);
          context.assertOwnedEpoch();
        }
      });
      committed = true;
    }
    phase = 'content_ack';
    const retained = retainCommittedAudit();
    return Object.freeze({ ok: true, ...details(), audit_receipt_retained: retained, raw_content_sent_to_claude: false });
  } catch (error) {
    // Unknown faults still have a useful fixed boundary. Never log the raw
    // exception, source, path, identities or payload, even during testing.
    try { require('./workflow-diagnostics').recordWorkflowEvent({ event: 'content_operation_failed', phase,
      outcome: 'stopped', error_code: error?.code || 'INTERNAL_FAILURE', duration_ms: Date.now() - started }); }
    catch { /* A failed diagnostic sink cannot change publication/recovery. */ }
    if (committed || error?.code === 'BATCH_PUBLICATION_UNCONFIRMED') {
      if (prepared) { try { retainCommittedAudit(); } catch { /* recover exact receipt, never retract committed bytes */ } }
      throw unconfirmed();
    }
    if (barrierError) throw barrierError;
    throw error;
  }
}
module.exports = Object.freeze({ publishPersistedContent });
