'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('DataSecure host matrix');
const matrix = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'canonical', 'HOST_MATRIX_V1.json'),
  'utf8'
));

test('matrix has a versioned schema and one runtime gate', () => {
  assert.strictEqual(matrix.schema, 'datasecure-host-matrix/v1');
  assert.match(matrix.checked_at, /^\d{4}-\d{2}-\d{2}$/u);
  assert.strictEqual(matrix.original_processing_gate, 'successful_privacy_status_in_current_session');
});

test('all unsafe fallback paths are forbidden', () => {
  assert.deepStrictEqual(new Set(matrix.fallbacks_forbidden), new Set([
    'chat_upload', 'computer_use', 'general_filesystem', 'other_connector'
  ]));
});

test('only local desktop or Claude Code classes can become conditional', () => {
  const positive = matrix.hosts.filter((host) => host.originals_allowed_after_gate);
  assert.deepStrictEqual(positive.map((host) => host.id).sort(), [
    'claude_code_local_mcp', 'cowork_desktop_local_mcp'
  ]);
  assert.ok(positive.every((host) => host.pilot_status === 'conditional'));
  assert.ok(positive.every((host) => host.local_mcp_available === 'runtime_probe_required'));
});

test('web, mobile, cloud/scheduled and disconnected desktop stay NO-GO for originals', () => {
  const ids = new Set([
    'desktop_missing_or_disconnected_mcp', 'claude_web', 'claude_mobile', 'cloud_or_scheduled_session'
  ]);
  const negative = matrix.hosts.filter((host) => ids.has(host.id));
  assert.strictEqual(negative.length, ids.size);
  assert.ok(negative.every((host) => host.pilot_status === 'no_go_for_originals'));
  assert.ok(negative.every((host) => host.originals_allowed_after_gate === false));
  assert.ok(negative.every((host) => host.clean_markdown_allowed === true));
});

test('source claims remain attributable without changing the conservative gate', () => {
  assert.ok(matrix.sources.length >= 4);
  assert.ok(matrix.sources.every((source) => source.startsWith('https://support.claude.com/')));
});

done();
