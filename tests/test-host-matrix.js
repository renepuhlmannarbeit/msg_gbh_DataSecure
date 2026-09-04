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
  assert.strictEqual(matrix.product_id, 'datasecure-cowork-plugin');
  assert.deepStrictEqual(matrix.applies_to, ['cowork-plugin']);
  assert.deepStrictEqual(matrix.excluded_products, ['standalone']);
  assert.match(matrix.checked_at, /^\d{4}-\d{2}-\d{2}$/u);
  assert.strictEqual(matrix.contract_scope, 'acceptance-policy-not-runtime-host-attestation');
  assert.strictEqual(matrix.original_processing_gate, 'local_session_and_local_plugin_mcp_and_picker');
  assert.strictEqual(matrix.cowork_execution, 'cloud_by_default_or_local_for_existing_desktop_deployments');
  assert.strictEqual(matrix.local_plugin_mcp_execution, 'member_device_only');
  assert.strictEqual(matrix.cloud_session_local_mcp_access, 'not_available');
  assert.strictEqual(matrix.normal_readiness_probe, 'start_document_batch_from_picker_then_cancel_without_selection');
  assert.strictEqual(matrix.support_status_is_host_attestation, false);
  assert.strictEqual(matrix.desktop_surface_proves_local_execution, false);
  assert.deepStrictEqual(matrix.host_evidence_required, [
    'claude_version_and_local_session', 'installed_artifact_and_local_runtime', 'raw_data_boundary_observed'
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
    'claude_code_local_mcp', 'cowork_local_session'
  ]);
  assert.ok(positive.every((host) => host.pilot_status === 'conditional'));
  assert.ok(positive.every((host) => host.local_mcp_available === 'runtime_probe_required'));
});

test('local Cowork is the only Cowork path that can execute the local MCP', () => {
  const cowork = matrix.hosts.find((host) => host.id === 'cowork_local_session');
  assert.strictEqual(cowork.session_origin, 'desktop_local');
  assert.strictEqual(cowork.session_execution, 'local_existing_deployment');
  assert.strictEqual(cowork.local_mcp_execution, 'member_device');
  assert.strictEqual(cowork.desktop_bridge_required, false);
});

test('cloud Cowork, scheduled and disconnected desktop stay NO-GO for originals', () => {
  const ids = new Set([
    'desktop_local_mcp_missing_or_disabled', 'cloud_cowork_web_or_mobile',
    'scheduled_or_other_cloud_session', 'claude_desktop_chat_unknown'
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
  assert.match(guide, /lokale Plugin-MCPs nur in lokalen Sitzungen/u);
  assert.match(guide, /Cloud-Sitzungen[\s\S]{0,180}Anthropic-Infrastruktur/u);
  assert.match(guide, /Cloud-Cowork[\s\S]{0,120}bereits[\s\S]{0,100}freigegebenes Markdown/u);
  assert.doesNotMatch(guide, /prüft Engine und (?:lokale )?Hostbindung implizit/u);
});

done();
