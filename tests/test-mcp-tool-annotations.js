'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const privacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-annotations-'));
const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
].map((value) => JSON.stringify(value)).join('\n') + '\n';

try {
  const result = childProcess.spawnSync(process.execPath, [path.join(root, 'plugins', 'data-secure', 'server', 'index.js')], {
    cwd: root,
    env: {
      ...process.env,
      EU_PRIVACY_ROOT: privacyRoot,
      LOCALAPPDATA: privacyRoot,
      EU_PRIVACY_SUPPORT_MODE: '1'
    },
    input: requests,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true
  });
  assert.strictEqual(result.error, undefined, result.error?.message);
  assert.strictEqual(result.status, 0, result.stderr || `server exited ${result.status}`);
  assert.strictEqual(result.stderr, '', `unexpected stderr: ${result.stderr}`);
  const replies = result.stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
  const tools = replies.find((reply) => reply.id === 2)?.result?.tools;
  assert.strictEqual(tools?.length, 28, 'support tools/list must return the reviewed inventory');

  const destructive = new Set([
    'start_document_batch_processing', 'review_deferred_document_batch',
    'acknowledge_batch_document', 'acknowledge_batch_documents',
    'discard_incomplete_document_batches', 'purge_local_data'
  ]);
  const idempotent = new Set([
    'privacy_status', 'diagnostic_status', 'document_batch_status',
    'read_anonymized_document', 'read_anonymized_documents',
    'continue_anonymized_batch_in_chat', 'list_visual_review_items'
  ]);

  for (const tool of tools) {
    assert.deepStrictEqual(
      Object.keys(tool.annotations).sort(),
      ['destructiveHint', 'idempotentHint', 'openWorldHint', 'readOnlyHint'],
      `${tool.name} must explicitly emit all four MCP annotations`
    );
    for (const value of Object.values(tool.annotations)) {
      assert.strictEqual(typeof value, 'boolean', `${tool.name} annotation is not boolean`);
    }
    assert.strictEqual(tool.annotations.openWorldHint, false, `${tool.name} must stay closed-world`);
    assert.strictEqual(tool.annotations.destructiveHint, destructive.has(tool.name), `${tool.name} destructiveHint drift`);
    assert.strictEqual(tool.annotations.idempotentHint, idempotent.has(tool.name), `${tool.name} idempotentHint drift`);
    assert.ok(!(tool.annotations.readOnlyHint && tool.annotations.destructiveHint), `${tool.name} cannot be read-only and destructive`);
  }
  console.log('MCP TOOL ANNOTATIONS PASS (28 tools, four explicit hints each)');
} finally {
  fs.rmSync(privacyRoot, { recursive: true, force: true });
}
