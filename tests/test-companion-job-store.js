'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-companion-'));
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const {
  API_VERSION,
  JOB_SCHEMA,
  companionCapabilities,
  createJob,
  transitionJob,
  jobStatus,
  readEvents
} = require('../plugins/data-secure/server/companion/job-store');

const { test, done, assert } = createSuite('Companion job contract');
const at = (minute) => new Date(`2026-08-21T10:${String(minute).padStart(2, '0')}:00.000Z`);

function localAction() {
  return { action_id: crypto.randomUUID(), channel: 'local_companion' };
}

test('capabilities expose no model review or release authority', () => {
  const caps = companionCapabilities();
  assert.strictEqual(caps.api_version, API_VERSION);
  assert.strictEqual(caps.job_schema, JOB_SCHEMA);
  assert.strictEqual(caps.phase, 'txt_docx_vertical_slice_ready');
  assert.strictEqual(caps.local_ui, 'native_picker_and_skip_confirmation');
  assert.deepStrictEqual(caps.supported_vertical_slice_inputs, ['TXT', 'DOCX']);
  assert.strictEqual(caps.private_ipc, 'inherited_stdio_authenticated');
  assert.strictEqual(caps.binary_signing, 'not_implemented');
  assert.strictEqual(caps.job_retention, 'integrated');
  assert.strictEqual(caps.model_can_review, false);
  assert.strictEqual(caps.model_can_release, false);
  assert.strictEqual(caps.raw_content_available, false);
});

test('a complete reviewed job follows the monotone state machine', () => {
  let status = createJob({ profile: 'personnel_profile', source_type: 'docx', now: at(0) });
  const jobId = status.job_id;
  for (const [index, state] of ['Claimed', 'Extracted', 'Detected'].entries()) {
    status = transitionJob(jobId, state, {}, { now: at(index + 1) });
  }
  status = transitionJob(jobId, 'Reviewed', { human_action: localAction() }, { now: at(4) });
  status = transitionJob(
    jobId,
    'Verified',
    {
      verification: {
        claim: 'supported_checks_no_further_findings',
        verifier_mode: 'limited_claim'
      }
    },
    { now: at(5) }
  );
  status = transitionJob(jobId, 'Released', { output_sha256: 'a'.repeat(64) }, { now: at(6) });
  assert.strictEqual(status.state, 'Released');
  assert.strictEqual(status.sequence, 7);
  assert.strictEqual(status.model_can_release, false);
  assert.strictEqual(readEvents(jobId).length, 7);
  assert.deepStrictEqual(jobStatus(jobId), status);
});

test('review and skip require strict local human evidence', () => {
  const job = createJob({ profile: 'customer', source_type: 'pdf' });
  transitionJob(job.job_id, 'Claimed');
  transitionJob(job.job_id, 'Extracted');
  transitionJob(job.job_id, 'Detected');
  assert.throws(() => transitionJob(job.job_id, 'Reviewed'), /lokale Nutzeraktion/);
  assert.throws(
    () =>
      transitionJob(job.job_id, 'Skipped', {
        human_action: { action_id: crypto.randomUUID(), channel: 'model' }
      }),
    /lokale Nutzeraktion/
  );
  assert.throws(
    () =>
      transitionJob(job.job_id, 'Skipped', {
        human_action: { ...localAction(), confirmed: true }
      }),
    /lokale Nutzeraktion/
  );
});

test('release is impossible before review or skip and verification', () => {
  const job = createJob({ profile: 'contract', source_type: 'txt' });
  transitionJob(job.job_id, 'Claimed');
  transitionJob(job.job_id, 'Extracted');
  transitionJob(job.job_id, 'Detected');
  assert.throws(
    () => transitionJob(job.job_id, 'Released', { output_sha256: 'b'.repeat(64) }),
    /Unzulässiger Jobwechsel/
  );
  transitionJob(job.job_id, 'Skipped', { human_action: localAction() });
  assert.throws(() => transitionJob(job.job_id, 'Verified'), /Verifikationsnachweis/);
  transitionJob(job.job_id, 'Verified', {
    verification: {
      claim: 'supported_checks_no_further_findings',
      verifier_mode: 'heterogeneous'
    }
  });
  assert.throws(() => transitionJob(job.job_id, 'Released', { output_sha256: 'short' }), /Integritätshash/);
});

test('terminal jobs cannot be reopened', () => {
  const job = createJob({ profile: 'general', source_type: 'md' });
  transitionJob(job.job_id, 'Cancelled', { human_action: localAction() });
  assert.throws(() => transitionJob(job.job_id, 'Claimed'), /Unzulässiger Jobwechsel/);
});

test('journal tampering and path traversal fail closed', () => {
  const job = createJob({ profile: 'applicant', source_type: 'docx' });
  assert.throws(() => jobStatus('../outside'), /Ungültige Job-ID/);
  const journal = path.join(
    process.env.LOCALAPPDATA,
    'ClaudeEUPrivacyDocumentGatewayV32',
    'companion-jobs',
    job.job_id,
    '000001.json'
  );
  const event = JSON.parse(fs.readFileSync(journal, 'utf8'));
  fs.writeFileSync(journal, JSON.stringify({ ...event, original_path: 'C:\\Personal\\CV.docx' }));
  assert.throws(() => jobStatus(job.job_id), /nicht erlaubte Felder/);
});

test('public job inputs reject paths, values and unrelated evidence', () => {
  assert.throws(
    () =>
      createJob({
        profile: 'customer',
        source_type: 'pdf',
        original_path: 'C:\\Personal\\Kunde.pdf'
      }),
    /keine Rohdatenfelder/
  );
  const job = createJob({ profile: 'customer', source_type: 'pdf' });
  assert.throws(
    () => transitionJob(job.job_id, 'Claimed', { raw_value: 'Max Mustermann' }),
    /nicht erlaubte Evidenzfelder/
  );
});

test('the persisted journal contains no raw-data affordances', () => {
  const job = createJob({ profile: 'personnel_profile', source_type: 'pdf' });
  transitionJob(job.job_id, 'Claimed');
  const dir = path.join(
    process.env.LOCALAPPDATA,
    'ClaudeEUPrivacyDocumentGatewayV32',
    'companion-jobs',
    job.job_id
  );
  const encoded = fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n');
  assert.doesNotMatch(encoded, /filename|original_path|raw_value|document_text|mapping/i);
});

try {
  fs.rmSync(root, { recursive: true, force: true });
} catch {
  /* best effort */
}
done();
