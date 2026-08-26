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
function talk(messages, { timeoutMs = 15000, supportMode = true, privacyRoot = root } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverEntry], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        EU_PRIVACY_ROOT: privacyRoot,
        LOCALAPPDATA: path.join(privacyRoot, 'localapp'),
        EU_PRIVACY_LANGUAGE: 'de',
        EU_PRIVACY_VISUAL_MODE: 'strict',
        EU_PRIVACY_RETENTION_DAYS: '7',
        EU_PRIVACY_SUPPORT_MODE: supportMode ? '1' : '0'
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
  await testAsync('server startup removes an abandoned private working copy', async () => {
    const jobs = path.join(root, 'localapp', 'SecureDataMsg', 'jobs');
    const orphan = path.join(jobs, 'startup_12345678');
    fs.mkdirSync(orphan, { recursive: true });
    fs.writeFileSync(path.join(orphan, 'source.txt'), 'private source after crash');
    fs.writeFileSync(path.join(orphan, '.owner.json'), JSON.stringify({
      pid: 2147483647,
      created_at: new Date().toISOString(),
      nonce: 'd'.repeat(32)
    }));
    const { responses, stderr } = await talk([rpc(1, 'ping')]);
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(stderr, '');
    assert.strictEqual(fs.existsSync(orphan), false);
  });

  await testAsync('server startup preserves and exposes an abandoned historical claim before accepting requests', async () => {
    // A real upgrade starts without the RC55 completion marker. Keep this
    // fixture isolated from the preceding fresh-install startup.
    const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-mcp-legacy-'));
    const input = path.join(legacyRoot, 'Input');
    const jobs = path.join(legacyRoot, 'localapp', 'SecureDataMsg', 'jobs');
    const jobId = 'crashed_abcdef12';
    fs.mkdirSync(input, { recursive: true });
    const hidden = path.join(input, `.processing_${jobId}_recovered.txt`);
    fs.writeFileSync(hidden, 'private source after hard termination');
    const job = path.join(jobs, jobId);
    fs.mkdirSync(job, { recursive: true });
    fs.writeFileSync(path.join(job, '.owner.json'), JSON.stringify({
      pid: 2147483647,
      created_at: new Date().toISOString(),
      nonce: 'e'.repeat(32)
    }));

    const { responses, stderr } = await talk([rpc(1, 'ping')], { privacyRoot: legacyRoot });
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(stderr, '');
    assert.strictEqual(fs.existsSync(hidden), true);
    assert.strictEqual(fs.readFileSync(path.join(input, 'recovered.txt'), 'utf8'), 'private source after hard termination');
    fs.unlinkSync(path.join(input, 'recovered.txt'));
  });

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
    assert.match(r.result.instructions, /nicht vertrauenswürdige Daten/i, 'prompt-injection guidance must be sent');
    assert.match(r.result.instructions, /keine rechtssichere Anonymität/i);
  });

  await testAsync('an unknown protocol version falls back to a supported one', async () => {
    const { responses } = await talk([rpc(1, 'initialize', { protocolVersion: '1999-01-01' })]);
    assert.strictEqual(responses[0].result.protocolVersion, '2025-11-25');
  });

  await testAsync('instructions pin retention, purge and governance behavior', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {})]);
    const instructions = responses[0].result.instructions;
    assert.match(instructions, /purge_local_data/);
    assert.match(instructions, /ausdrücklich genannten Umfang und eine ausdrückliche Bestätigung/i);
    assert.match(instructions, /confirmed=true/);
    assert.match(instructions, /Aufbewahrung aus privacy_status/i);
    assert.match(instructions, /Bildpixel bleiben immer lokal/i);
    assert.match(instructions, /Audit enthält keine Rohwerte, Pfade, Dateinamen, exakten Größen oder Dokument-Hashes/i);
    assert.match(instructions, /nicht vertrauenswürdige Daten/i);
    assert.match(instructions, /keine rechtssichere Anonymität/i);
    assert.match(instructions, /erlaubt kein automatisches HR-Ranking/i);
    assert.match(instructions, /Erkannter Bildtext benötigt dieselbe Textprüfung/i);
    assert.match(instructions, /Nutze nur TXT, Markdown, CSV oder DOCX/i);
    assert.match(instructions, /Host-Stopp: kein Ersatzdialog oder Teilpaket/i);
    assert.ok(Buffer.byteLength(instructions, 'utf8') <= 2048, 'Claude truncates MCP instructions above 2 KB');
  });

  await testAsync('tools/list exposes every tool with a strict input schema', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const tools = responses.find((r) => r.id === 2).result.tools;
    assert.strictEqual(tools.length, 25, `expected exactly 25 tools, got ${tools.length}`);
    assert.ok(!tools.some((tool) => tool.name === 'open_input_folder'));
    assert.ok(tools.some((tool) => tool.name === 'open_export_folder'));
    assert.ok(tools.some((tool) => tool.name === 'configure_privacy_folder'));
    assert.ok(tools.some((tool) => tool.name === 'start_document_batch_from_picker'));
    assert.ok(tools.some((tool) => tool.name === 'continue_anonymized_batch_in_chat'));
    assert.ok(tools.some((tool) => tool.name === 'start_completed_local_results_handoff'));
    assert.ok(tools.some((tool) => tool.name === 'continue_local_results_handoff'));
    assert.ok(!tools.some((tool) => tool.name === 'prepare_local_document'));
    assert.ok(!tools.some((tool) => tool.name === 'anonymize_all_documents'));
    assert.ok(!tools.some((tool) => tool.name === 'anonymize_next_document'));
    assert.ok(!tools.some((tool) => tool.name === 'list_anonymized_packages'));
    assert.ok(!tools.some((tool) => tool.name === 'begin_document_batch'));
    assert.ok(!tools.some((tool) => tool.name === 'start_document_batch_processing'));
    assert.ok(tools.some((tool) => tool.name === 'document_batch_status'));
    assert.ok(tools.some((tool) => tool.name === 'list_document_batch_results'));
    assert.ok(tools.some((tool) => tool.name === 'acknowledge_batch_document'));
    assert.ok(tools.some((tool) => tool.name === 'acknowledge_batch_documents'));
    assert.ok(tools.some((tool) => tool.name === 'read_anonymized_documents'));
    assert.ok(tools.some((tool) => tool.name === 'review_deferred_document_batch'));
    assert.ok(tools.some((tool) => tool.name === 'continue_most_recent_document_batch'));
    assert.ok(tools.some((tool) => tool.name === 'discard_incomplete_document_batches'));
    assert.ok(tools.some((tool) => tool.name === 'purge_local_data'));
    assert.ok(tools.some((tool) => tool.name === 'export_diagnostic_package'));
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
      assert.strictEqual(typeof tool.title, 'string', `tool ${tool.name} has no title`);
      assert.ok(tool.title.length > 0, `tool ${tool.name} has an empty title`);
      for (const field of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
        assert.strictEqual(typeof tool.annotations[field], 'boolean', `tool ${tool.name} has no boolean ${field}`);
      }
      assert.strictEqual(tool.annotations.openWorldHint, false, `tool ${tool.name} must be closed world`);
    }
    const acknowledge = tools.find((tool) => tool.name === 'acknowledge_batch_document');
    assert.deepStrictEqual(acknowledge.inputSchema.required, ['batch_token', 'package_id']);
    const continueMostRecent = tools.find((tool) => tool.name === 'continue_most_recent_document_batch');
    assert.deepStrictEqual(continueMostRecent.inputSchema.required, ['confirmed']);
    assert.strictEqual(continueMostRecent.inputSchema.properties.confirmed.const, true);
    const resume = tools.find((tool) => tool.name === 'resume_document_batch');
    assert.deepStrictEqual(resume.inputSchema.required, ['batch_token', 'confirmed']);
    assert.strictEqual(resume.inputSchema.properties.confirmed.const, true);
    const configure = tools.find((tool) => tool.name === 'configure_privacy_folder');
    assert.deepStrictEqual(configure.inputSchema.required, ['confirmed']);
    assert.strictEqual(configure.inputSchema.properties.confirmed.const, true);
    const picker = tools.find((tool) => tool.name === 'start_document_batch_from_picker');
    assert.strictEqual(picker.inputSchema.properties.profile.default, 'auto');
    assert.strictEqual(picker.inputSchema.properties.mode.default, 'local_only');
    assert.deepStrictEqual(picker.inputSchema.properties.mode.enum, ['local_only', 'continue_in_chat']);
    const combined = tools.find((tool) => tool.name === 'continue_anonymized_batch_in_chat');
    assert.deepStrictEqual(combined.inputSchema.required, ['batch_token']);
    assert.strictEqual(combined.inputSchema.properties.continuations.maxItems, 5);
    for (const name of ['read_anonymized_document', 'read_anonymized_documents']) {
      const readTool = tools.find((tool) => tool.name === name);
      if (name === 'read_anonymized_document') {
        assert.ok(readTool.inputSchema.required.includes('read_capability'));
        assert.strictEqual(readTool.inputSchema.properties.read_capability.minLength, 43);
        assert.strictEqual(readTool.inputSchema.properties.read_capability.maxLength, 43);
      } else {
        assert.deepStrictEqual(readTool.inputSchema.required, ['documents']);
        assert.strictEqual(readTool.inputSchema.properties.documents.maxItems, 10);
      }
    }
  });

  await testAsync('normal Cowork facade exposes only the token-free routine tools', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')], { supportMode: false });
    const names = responses.find((r) => r.id === 2).result.tools.map((tool) => tool.name).sort();
    assert.deepStrictEqual(names, [
      'cancel_local_results_handoff',
      'configure_privacy_folder',
      'continue_local_results_handoff',
      'continue_most_recent_document_batch',
      'discard_incomplete_document_batches',
      'open_export_folder',
      'start_completed_local_results_handoff',
      'start_document_batch_from_picker'
    ]);
    assert.ok(!names.includes('open_input_folder'));
    assert.ok(!names.includes('begin_document_batch'));
    assert.ok(!names.includes('read_anonymized_document'));
    assert.ok(!names.includes('review_deferred_document_batch'));
    assert.ok(!names.includes('privacy_status'));
    assert.ok(!names.includes('purge_local_data'));
  });

  await testAsync('normal Cowork rejects removed legacy and support-only tools', async () => {
    const { responses } = await talk([
      rpc(1, 'tools/call', { name: 'begin_document_batch', arguments: { expected_count: 1 } }),
      rpc(2, 'tools/call', { name: 'open_privacy_folder', arguments: {} }),
      rpc(3, 'tools/call', { name: 'privacy_status', arguments: {} })
    ], { supportMode: false });
    assert.strictEqual(responses.length, 3);
    for (const response of responses) {
      assert.strictEqual(response.result.isError, true);
      assert.match(response.result.structuredContent.message, /lokalen Supportmodus/u);
    }
  });

  await testAsync('read tools are annotated read only and write tools are not', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const byName = Object.fromEntries(responses.find((r) => r.id === 2).result.tools.map((t) => [t.name, t]));
    for (const name of ['privacy_status', 'diagnostic_status', 'document_batch_status', 'read_anonymized_document', 'read_anonymized_documents']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, true, `${name} must be read only`);
    }
    for (const name of ['start_completed_local_results_handoff', 'continue_local_results_handoff']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, false, `${name} starts or advances an intentional handoff`);
      assert.strictEqual(byName[name].annotations.idempotentHint, false, `${name} advances local handoff state`);
    }
    for (const name of ['list_document_batch_results', 'purge_local_data']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, false, `${name} must not claim to be read only`);
    }
    for (const name of ['review_deferred_document_batch', 'acknowledge_batch_document', 'acknowledge_batch_documents', 'discard_incomplete_document_batches', 'purge_local_data']) {
      assert.strictEqual(byName[name].annotations.destructiveHint, true, `${name} must disclose destructive local state changes`);
    }
    for (const name of ['privacy_status', 'diagnostic_status', 'document_batch_status', 'read_anonymized_document', 'read_anonymized_documents', 'list_visual_review_items']) {
      assert.strictEqual(byName[name].annotations.idempotentHint, true, `${name} must disclose idempotent reads`);
      assert.strictEqual(byName[name].annotations.destructiveHint, false, `${name} must be non-destructive`);
    }
    for (const name of ['open_privacy_folder', 'open_output_folder', 'open_export_folder', 'open_visual_review_folder', 'configure_privacy_folder']) {
      assert.strictEqual(byName[name].annotations.idempotentHint, false, `${name} opens a new local UI instance`);
      assert.strictEqual(byName[name].annotations.destructiveHint, false, `${name} only opens a local folder`);
    }
  });

  await testAsync('model-callable human approval is absent and purge remains explicit', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const tools = responses.find((r) => r.id === 2).result.tools;
    assert.ok(!tools.some((tool) => tool.name === 'approve_visual_asset'));
    assert.ok(!tools.some((tool) => tool.name === 'read_anonymized_asset'));
    assert.ok(!tools.some((tool) => tool.name === 'list_anonymized_assets'));
    const purge = tools.find((t) => t.name === 'purge_local_data');
    assert.deepStrictEqual(purge.inputSchema.required, ['confirmed']);
    assert.strictEqual(purge.inputSchema.properties.confirmed.const, true);
    assert.deepStrictEqual(purge.inputSchema.properties.scope.enum, ['processed', 'output', 'review', 'all']);
  });

  await testAsync('diagnostic export rejects missing confirmation before creating a local support package', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/call', {
      name: 'export_diagnostic_package', arguments: {}
    })]);
    const result = responses.find((response) => response.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /ausdrückliche Bestätigung/);
  });

  await testAsync('purge_local_data protects historical sources and deletes only disposable scopes', async () => {
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
    const protectedResult = accepted.responses[0].result;
    assert.strictEqual(protectedResult.isError, true);
    assert.match(protectedResult.content[0].text, /Historische Quelldateien/);
    assert.ok(fs.existsSync(path.join(processed, 'purge-me.pdf')));
    assert.ok(fs.existsSync(path.join(output, 'keep-package', 'manifest.json')));

    const outputPurge = await talk([rpc(1, 'tools/call', {
      name: 'purge_local_data', arguments: { scope: 'output', confirmed: true }
    })]);
    const result = outputPurge.responses[0].result;
    assert.ok(!result.isError);
    assert.strictEqual(result.structuredContent.audit_retained, true);
    assert.ok(!fs.existsSync(path.join(output, 'keep-package')));
    assert.ok(fs.existsSync(path.join(processed, 'purge-me.pdf')));
  });

  await testAsync('resume_document_batch rejects a missing or false confirmation before it can resume work', async () => {
    const token = 'a'.repeat(64);
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'resume_document_batch', arguments: { batch_token: token, confirmed: false } })
    ]);
    const result = responses.find((response) => response.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
  });

  await testAsync('continue_most_recent_document_batch rejects a missing confirmation before it can select a local batch', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'continue_most_recent_document_batch', arguments: {} })
    ]);
    const result = responses.find((response) => response.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
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
    assert.strictEqual(result.structuredContent.runtime_mode, 'host_node');
    assert.strictEqual(result.structuredContent.runtime_target, null);
    assert.strictEqual(result.structuredContent.runtime_dependency_install, true);
    assert.strictEqual(result.structuredContent.host_node_required, true);
    assert.strictEqual(result.structuredContent.parser_resource_boundary,
      process.platform === 'win32' ? 'windows_job_object' : 'node_heap_and_parent_timeout');
    assert.strictEqual(result.structuredContent.parser_hard_process_limits, process.platform === 'win32');
    assert.strictEqual(result.structuredContent.audit_schema, 'data-secure-audit-receipt/3');
    assert.strictEqual(result.structuredContent.privacy_ruleset, 'de-business/2');
    assert.strictEqual(result.structuredContent.credential_context_policy, 'credential-context/2');
    assert.strictEqual(typeof result.structuredContent.audit_receipts_retained, 'number');
    assert.strictEqual(typeof result.structuredContent.legacy_audit_pending, 'number');
    assert.strictEqual(typeof result.structuredContent.audit_migration_errors, 'number');
    assert.strictEqual(typeof result.structuredContent.recoverable_batches, 'number');
    assert.strictEqual(typeof result.structuredContent.batches_awaiting_resume, 'number');
    assert.strictEqual(typeof result.structuredContent.batches_awaiting_delivery, 'number');
    assert.strictEqual(typeof result.structuredContent.batch_processing_active, 'boolean');
    assert.strictEqual(typeof result.structuredContent.private_work_copy_cleanup_pending, 'number');
    assert.strictEqual(typeof result.structuredContent.expired_batch_cleanup_pending, 'number');
    assert.strictEqual(typeof result.structuredContent.audit_write_errors, 'number');
    assert.strictEqual(result.structuredContent.companion_api_version, 'data-secure-companion/1');
    assert.strictEqual(result.structuredContent.companion_phase, 'txt_docx_vertical_slice_ready');
    assert.strictEqual(result.structuredContent.companion_local_ui, process.platform === 'win32'
      ? 'native_picker_redaction_and_ambiguity_review'
      : ['darwin', 'linux'].includes(process.platform)
        ? 'native_picker_confirm_or_fail_closed_on_ambiguity'
        : 'unavailable');
    assert.deepStrictEqual(result.structuredContent.companion_supported_vertical_slice_inputs, ['TXT', 'Markdown (.md)', 'CSV', 'DOCX']);
    assert.strictEqual(result.structuredContent.companion_private_ipc, 'inherited_stdio_authenticated');
    assert.strictEqual(result.structuredContent.companion_binary_signing, 'not_implemented');
    assert.strictEqual(result.structuredContent.companion_job_retention, 'integrated');
    assert.strictEqual(typeof result.structuredContent.companion_job_retention_days, 'number');
    assert.strictEqual(typeof result.structuredContent.companion_jobs_due, 'number');
    assert.strictEqual(typeof result.structuredContent.companion_job_inspection_errors, 'number');
    assert.strictEqual(result.structuredContent.companion_model_can_review, false);
    assert.strictEqual(result.structuredContent.companion_model_can_release, false);
    assert.deepStrictEqual(result.structuredContent.supported_inputs, ['Word (.docx)', 'Markdown (.md)', 'CSV', 'TXT']);
    assert.ok(!result.structuredContent.supported_inputs.includes('PDF'));
    assert.deepStrictEqual(result.structuredContent.blocked_inputs, [
      { format: 'PDF', reason: 'PDF_COVERAGE_UNVERIFIED' },
      { format: 'XLSX, PPTX und Bilder', reason: 'FORMAT_COVERAGE_UNVERIFIED' }
    ]);
    assert.strictEqual(result.structuredContent.visual_boundary,
      process.platform === 'win32' ? 'windows_job_object' : 'unavailable');
    assert.ok(!result.isError);
  });

  await testAsync('tools/call diagnostic_status exposes only bounded metadata', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'diagnostic_status', arguments: { limit: 5 } })
    ]);
    const result = responses.find((response) => response.id === 2).result.structuredContent;
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.retention_days, 14);
    assert.ok(result.events.length <= 5);
    assert.strictEqual(result.raw_content_logged, false);
    assert.strictEqual(result.filenames_logged, false);
    assert.strictEqual(result.paths_logged, false);
    assert.strictEqual(result.hashes_logged, false);
  });

  await testAsync('removed Input intake tools stay unavailable in support mode', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'begin_document_batch', arguments: { expected_count: 1, profile: 'customer' } })
    ]);
    const r = responses.find((x) => x.id === 2);
    assert.ok(r.error, 'unknown tool must produce a JSON-RPC error');
    assert.strictEqual(r.error.code, -32602);
    assert.match(r.error.message, /Unbekanntes Werkzeug/u);
  });

  await testAsync('a failing tool reports isError and never leaks raw content', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'read_anonymized_document', arguments: { package_id: 'does-not-exist' } })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
    assert.match(result.structuredContent.message, /Leseberechtigung/i, 'a safe german message is expected');
  });

  await testAsync('a path traversal package id is refused', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'read_anonymized_document', arguments: { package_id: '../Processed', read_capability: 'x'.repeat(43) } })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.match(result.structuredContent.message, /Leseberechtigung/);
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
    assert.match(got.messages[0].content.text, /start_document_batch_from_picker/);
    assert.match(got.messages[0].content.text, /start_completed_local_results_handoff/);
    assert.match(got.messages[0].content.text, /continue_local_results_handoff/);
    assert.match(got.messages[0].content.text, /profile=personnel_profile/);
    assert.match(got.messages[0].content.text, /Skills zusammenfassen/);
    assert.match(got.messages[0].content.text, /lokale Mehrfach-Dateidialog/);
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
