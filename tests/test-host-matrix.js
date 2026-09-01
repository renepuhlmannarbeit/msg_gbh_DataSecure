'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('DataSecure host matrix');
const matrix = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'canonical', 'HOST_MATRIX_V1.json'),
  'utf8'
));

test('matrix is acceptance policy, not a support-only runtime or host attestation', () => {
  assert.strictEqual(matrix.schema, 'datasecure-host-matrix/v1');
  assert.match(matrix.checked_at, /^\d{4}-\d{2}-\d{2}$/u);
  assert.strictEqual(matrix.contract_scope, 'acceptance-policy-not-runtime-host-attestation');
  assert.strictEqual(matrix.original_processing_gate, 'local_desktop_session_and_local_plugin_mcp_and_picker');
  assert.strictEqual(matrix.normal_readiness_probe, 'start_document_batch_from_picker_then_cancel_without_selection');
  assert.strictEqual(matrix.support_status_is_host_attestation, false);
  assert.strictEqual(matrix.desktop_surface_proves_local_execution, false);
  assert.deepStrictEqual(matrix.host_evidence_required, [
    'claude_version_and_execution_mode', 'installed_artifact_and_local_runtime', 'raw_data_boundary_observed'
  ]);
});

test('all unsafe fallback paths are forbidden', () => {
  assert.deepStrictEqual(new Set(matrix.fallbacks_forbidden), new Set([
    'chat_upload', 'computer_use', 'general_filesystem', 'other_connector'
  ]));
});

test('only genuinely local MCP execution paths can become conditional', () => {
  const positive = matrix.hosts.filter((host) => host.originals_allowed_after_gate);
  assert.deepStrictEqual(positive.map((host) => host.id).sort(), [
    'claude_code_local_mcp', 'cowork_desktop_local_session'
  ]);
  assert.ok(positive.every((host) => host.pilot_status === 'conditional'));
  assert.ok(positive.every((host) => host.local_mcp_available === 'runtime_probe_required'));
});

test('cloud Cowork, web/mobile, scheduled and disconnected local desktop stay NO-GO for originals', () => {
  const ids = new Set([
    'cowork_desktop_cloud_session', 'desktop_local_mcp_missing_or_disabled',
    'standalone_web_or_mobile_session', 'scheduled_or_other_cloud_session'
  ]);
  const negative = matrix.hosts.filter((host) => ids.has(host.id));
  assert.strictEqual(negative.length, ids.size);
  assert.ok(negative.every((host) => host.pilot_status === 'no_go_for_originals'));
  assert.ok(negative.every((host) => host.originals_allowed_after_gate === false));
  assert.ok(negative.every((host) => host.clean_markdown_allowed === true));
});

test('source claims remain attributable without changing the conservative gate', () => {
  assert.ok(matrix.sources.length >= 4);
  assert.ok(matrix.sources.every((source) => source.startsWith('https://support.claude.com/') || source.startsWith('https://code.claude.com/')));
});

test('human matrix does not claim an implicit host attestation', () => {
  const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'canonical', 'HOST_MATRIX_V1.md'), 'utf8');
  assert.match(guide, /Erreichbarkeit ist keine Host-Attestierung/u);
  assert.match(guide, /lokale Plugin-MCPs nur in \*\*lokalen\*\* Desktop-Sitzungen/u);
  assert.match(guide, /Cloud-Sitzungen[\s\S]{0,300}kein\s+zulässiger Ersatz/u);
  assert.doesNotMatch(guide, /prüft Engine und (?:lokale )?Hostbindung implizit/u);
});

done();
