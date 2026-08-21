'use strict';

// Drives the MCP server over real stdio, the same way Claude Desktop does.
// These tests are the only ones that would have caught a server that starts but
// speaks a protocol the host cannot use.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('MCP protocol');

const serverEntry = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'index.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-mcp-'));

// Sends a batch of messages, collects every line the server writes back and
// exits. Each case gets a fresh process so state cannot leak between them.
function talk(messages, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverEntry], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        EU_PRIVACY_ROOT: root,
        LOCALAPPDATA: path.join(root, 'localapp'),
        EU_PRIVACY_LANGUAGE: 'de',
        EU_PRIVACY_VISUAL_MODE: 'strict',
        EU_PRIVACY_RETENTION_DAYS: '7'
      }
    });

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server did not exit within ${timeoutMs}ms; stderr: ${err}`));
    }, timeoutMs);

    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (err += b));
    child.once('error', reject);
    child.once('close', () => {
      clearTimeout(timer);
      const lines = out.split('\n').filter((l) => l.trim());
      try {
        resolve({ responses: lines.map((l) => JSON.parse(l)), stderr: err, raw: lines });
      } catch (e) {
        reject(new Error(`server emitted non JSON output: ${JSON.stringify(out.slice(0, 400))}`));
      }
    });

    for (const msg of messages) {
      child.stdin.write(typeof msg === 'string' ? `${msg}\n` : `${JSON.stringify(msg)}\n`);
    }
    child.stdin.end();
  });
}

const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

async function main() {
  await testAsync('initialize returns server info, capabilities and instructions', async () => {
    const { responses } = await talk([rpc(1, 'initialize', { protocolVersion: '2025-06-18' })]);
    assert.strictEqual(responses.length, 1);
    const r = responses[0];
    assert.strictEqual(r.jsonrpc, '2.0');
    assert.strictEqual(r.id, 1);
    assert.strictEqual(r.result.protocolVersion, '2025-06-18', 'a supported version must be echoed');
    assert.strictEqual(r.result.serverInfo.name, 'eu-privacy-document-gateway');
    assert.ok(r.result.capabilities.tools, 'tools capability must be advertised');
    assert.ok(r.result.capabilities.prompts, 'prompts capability must be advertised');
    assert.match(r.result.instructions, /untrusted data/i, 'prompt-injection guidance must be sent');
    assert.match(r.result.instructions, /Do not claim legal anonymity/i);
  });

  await testAsync('an unknown protocol version falls back to a supported one', async () => {
    const { responses } = await talk([rpc(1, 'initialize', { protocolVersion: '1999-01-01' })]);
    assert.strictEqual(responses[0].result.protocolVersion, '2025-11-25');
  });

  await testAsync('instructions pin retention, purge and governance behavior', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {})]);
    const instructions = responses[0].result.instructions;
    assert.match(instructions, /purge_local_data/);
    assert.match(instructions, /explicit scope and confirmation/i);
    assert.match(instructions, /confirmed=true/);
    assert.match(instructions, /Processed originals/);
    assert.match(instructions, /retention_days=0/);
    assert.match(instructions, /exposes no visual approval tool/i);
    assert.match(instructions, /model-controlled boolean is not human-presence evidence/i);
    assert.match(instructions, /metadata-only audit receipt is intentionally retained/i);
    assert.match(instructions, /without document hashes, exact file sizes, paths, filenames or raw values/i);
    assert.match(instructions, /untrusted data/i);
    assert.match(instructions, /Do not claim legal anonymity/i);
    assert.match(instructions, /does not authorize automated ranking/i);
    assert.match(instructions, /recognised image text may appear/i);
    assert.match(instructions, /explicit profile/i);
    assert.match(instructions, /image-only content before local OCR/i);
  });

  await testAsync('tools/list exposes every tool with a strict input schema', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const tools = responses.find((r) => r.id === 2).result.tools;
    assert.strictEqual(tools.length, 11, `expected exactly 11 tools, got ${tools.length}`);
    assert.ok(tools.some((tool) => tool.name === 'purge_local_data'));
    assert.ok(!tools.some((tool) => tool.name === 'approve_visual_asset'));
    for (const tool of tools) {
      assert.ok(tool.name, 'tool without a name');
      assert.ok(tool.description, `tool ${tool.name} has no description`);
      assert.strictEqual(tool.inputSchema.type, 'object', `tool ${tool.name} schema is not an object`);
      assert.strictEqual(
        tool.inputSchema.additionalProperties,
        false,
        `tool ${tool.name} accepts unknown arguments`
      );
      assert.ok(tool.annotations, `tool ${tool.name} has no annotations`);
      assert.strictEqual(tool.annotations.openWorldHint, false, `tool ${tool.name} must be closed world`);
    }
  });

  await testAsync('read tools are annotated read only and write tools are not', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const byName = Object.fromEntries(responses.find((r) => r.id === 2).result.tools.map((t) => [t.name, t]));
    for (const name of ['privacy_status', 'read_anonymized_document', 'read_anonymized_asset', 'list_anonymized_packages']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, true, `${name} must be read only`);
    }
    for (const name of ['anonymize_next_document', 'purge_local_data']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, false, `${name} must not claim to be read only`);
    }
  });

  await testAsync('model-callable human approval is absent and purge remains explicit', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const tools = responses.find((r) => r.id === 2).result.tools;
    assert.ok(!tools.some((tool) => tool.name === 'approve_visual_asset'));
    const purge = tools.find((t) => t.name === 'purge_local_data');
    assert.deepStrictEqual(purge.inputSchema.required, ['confirmed']);
    assert.strictEqual(purge.inputSchema.properties.confirmed.const, true);
    assert.deepStrictEqual(purge.inputSchema.properties.scope.enum, ['processed', 'output', 'review', 'all']);
  });

  await testAsync('purge_local_data refuses omission and deletes only the confirmed scope', async () => {
    const processed = path.join(root, 'Processed');
    const output = path.join(root, 'Output');
    fs.mkdirSync(processed, { recursive: true });
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(processed, 'purge-me.pdf'), 'local original');
    fs.mkdirSync(path.join(output, 'keep-package'), { recursive: true });
    fs.writeFileSync(path.join(output, 'keep-package', 'manifest.json'), '{}');

    const refused = await talk([
      rpc(1, 'tools/call', { name: 'purge_local_data', arguments: { scope: 'processed' } })
    ]);
    assert.strictEqual(refused.responses[0].result.isError, true);
    assert.ok(fs.existsSync(path.join(processed, 'purge-me.pdf')));

    const accepted = await talk([
      rpc(1, 'tools/call', {
        name: 'purge_local_data',
        arguments: { scope: 'processed', confirmed: true }
      })
    ]);
    const result = accepted.responses[0].result;
    assert.ok(!result.isError);
    assert.strictEqual(result.structuredContent.audit_retained, true);
    assert.ok(!fs.existsSync(path.join(processed, 'purge-me.pdf')));
    assert.ok(fs.existsSync(path.join(output, 'keep-package', 'manifest.json')));
  });

  await testAsync('tools/call privacy_status returns structured content without raw document data', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'privacy_status', arguments: {} })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.ok(Array.isArray(result.content), 'content array is required');
    assert.strictEqual(result.content[0].type, 'text');
    assert.strictEqual(result.structuredContent.ok, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
    assert.strictEqual(result.structuredContent.runtime_dependency_install, false);
    assert.strictEqual(result.structuredContent.audit_schema, 'data-secure-audit-receipt/2');
    assert.strictEqual(typeof result.structuredContent.audit_receipts_retained, 'number');
    assert.strictEqual(typeof result.structuredContent.legacy_audit_pending, 'number');
    assert.strictEqual(typeof result.structuredContent.audit_migration_errors, 'number');
    assert.strictEqual(typeof result.structuredContent.audit_write_errors, 'number');
    assert.strictEqual(result.structuredContent.companion_api_version, 'data-secure-companion/1');
    assert.strictEqual(result.structuredContent.companion_phase, 'private_ipc_ready');
    assert.strictEqual(result.structuredContent.companion_local_ui, 'native_file_picker_ready');
    assert.strictEqual(result.structuredContent.companion_private_ipc, 'inherited_stdio_authenticated');
    assert.strictEqual(result.structuredContent.companion_binary_signing, 'not_implemented');
    assert.strictEqual(result.structuredContent.companion_job_retention, 'integrated');
    assert.strictEqual(typeof result.structuredContent.companion_job_retention_days, 'number');
    assert.strictEqual(typeof result.structuredContent.companion_jobs_due, 'number');
    assert.strictEqual(typeof result.structuredContent.companion_job_inspection_errors, 'number');
    assert.strictEqual(result.structuredContent.companion_model_can_review, false);
    assert.strictEqual(result.structuredContent.companion_model_can_release, false);
    assert.ok(result.structuredContent.supported_inputs.includes('PNG'));
    assert.ok(result.structuredContent.supported_inputs.includes('JPEG'));
    assert.ok(result.structuredContent.supported_inputs.includes('BMP'));
    assert.ok(!result.isError);
  });

  await testAsync('an empty input folder is reported as a result, not as a transport error', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'anonymize_next_document', arguments: { profile: 'customer' } })
    ]);
    const r = responses.find((x) => x.id === 2);
    assert.ok(r.result, 'an empty queue must not produce a JSON-RPC error');
    assert.strictEqual(r.result.structuredContent.error, 'input_empty');
    assert.ok(!r.result.isError, 'an empty queue is not a tool error');
  });

  await testAsync('a failing tool reports isError and never leaks raw content', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'read_anonymized_document', arguments: { package_id: 'does-not-exist' } })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
    assert.match(result.structuredContent.message, /Paket/i, 'a safe german message is expected');
  });

  await testAsync('a path traversal package id is refused', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'read_anonymized_document', arguments: { package_id: '../Processed' } })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.match(result.structuredContent.message, /Ungültige Paket-ID/);
  });

  await testAsync('an unknown tool yields a JSON-RPC invalid params error', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'delete_everything', arguments: {} })
    ]);
    const r = responses.find((x) => x.id === 2);
    assert.strictEqual(r.error.code, -32602);
    assert.strictEqual(r.result, undefined);
  });

  await testAsync('an unknown method yields method not found', async () => {
    const { responses } = await talk([rpc(1, 'resources/list')]);
    assert.strictEqual(responses[0].error.code, -32601);
  });

  await testAsync('malformed JSON yields a parse error with a null id', async () => {
    const { responses } = await talk(['{not json at all']);
    assert.strictEqual(responses[0].error.code, -32700);
    assert.strictEqual(responses[0].id, null);
  });

  await testAsync('a request without jsonrpc 2.0 is rejected as invalid', async () => {
    const { responses } = await talk([{ id: 9, method: 'tools/list' }]);
    assert.strictEqual(responses[0].error.code, -32600);
  });

  await testAsync('notifications never produce a response', async () => {
    const { responses } = await talk([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } },
      { jsonrpc: '2.0', method: 'some/unknown/notification' },
      rpc(1, 'ping')
    ]);
    assert.strictEqual(responses.length, 1, `expected only the ping reply, got ${JSON.stringify(responses)}`);
    assert.strictEqual(responses[0].id, 1);
  });

  await testAsync('blank lines between messages are tolerated', async () => {
    const { responses } = await talk(['', JSON.stringify(rpc(1, 'ping')), '', JSON.stringify(rpc(2, 'ping'))]);
    assert.deepStrictEqual(responses.map((r) => r.id), [1, 2]);
  });

  await testAsync('prompts/list and prompts/get deliver a usable prompt', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'prompts/list'),
      rpc(3, 'prompts/get', { name: 'anonymize_personnel_profile', arguments: { task: 'Skills zusammenfassen' } })
    ]);
    const prompts = responses.find((r) => r.id === 2).result.prompts;
    assert.strictEqual(prompts.length, 4);
    const got = responses.find((r) => r.id === 3).result;
    assert.strictEqual(got.messages[0].role, 'user');
    assert.match(got.messages[0].content.text, /anonymize_next_document/);
    assert.match(got.messages[0].content.text, /profile=personnel_profile/);
    assert.match(got.messages[0].content.text, /Skills zusammenfassen/);
    assert.match(got.messages[0].content.text, /Aufbewahrungsfrist/);
  });

  await testAsync('an unknown prompt yields invalid params', async () => {
    const { responses } = await talk([rpc(1, 'prompts/get', { name: 'nope' })]);
    assert.strictEqual(responses[0].error.code, -32602);
  });

  await testAsync('server/discover advertises the supported protocol versions', async () => {
    const { responses } = await talk([rpc(1, 'server/discover')]);
    const result = responses[0].result;
    assert.strictEqual(result.resultType, 'complete');
    assert.ok(result.supportedVersions.includes('2025-11-25'));
    assert.ok(result.instructions, 'discover must carry the instructions');
    assert.ok(result._meta['io.modelcontextprotocol/serverInfo'], 'modern replies carry server info meta');
  });

  await testAsync('the modern protocol meta flag switches on result types', async () => {
    const { responses } = await talk([
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } }
    ]);
    assert.strictEqual(responses[0].result.resultType, 'complete');
    assert.strictEqual(responses[0].result.cacheScope, 'public');
  });

  await testAsync('every response is exactly one line of JSON on stdout', async () => {
    const { raw } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list'), rpc(3, 'prompts/list')]);
    assert.strictEqual(raw.length, 3, 'one line per response');
    for (const line of raw) assert.doesNotThrow(() => JSON.parse(line));
  });

  await testAsync('nothing is written to stderr during normal operation', async () => {
    const { stderr } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/call', { name: 'privacy_status' })]);
    assert.strictEqual(stderr.trim(), '', `unexpected stderr output: ${stderr}`);
  });

  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  done();
}

main();
