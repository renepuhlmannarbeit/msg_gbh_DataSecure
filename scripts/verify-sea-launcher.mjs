import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { prepareLauncherProvenance, assertLauncherBuildEvidence } from './lib/sea-launcher-provenance.mjs';
import { assertSeaDirectory, seaTreeInventory, readSeaFile, createSeaSourceEvidence, assertSeaSourceEvidence } from './lib/sea-source-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'native', 'sea', 'launcher-contract.json'), 'utf8'));
const contractFile = path.join(root, 'native', 'sea', 'launcher-contract.json');
const sourceRoot = path.join(root, 'plugins', 'data-secure');
const dispatcherSource = path.join(root, contract.posix_dispatcher);
const sourceEvidence = createSeaSourceEvidence(sourceRoot, contractFile, dispatcherSource);

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

const targetId = argument('--target');
const launcherSource = path.resolve(argument('--launcher'));
const target = contract.targets.find((item) => item.id === targetId);
if (!target) throw new Error('unknown target');
if (target.os !== process.platform || target.arch !== process.arch) {
  throw new Error(`target ${target.id} requires ${target.os}/${target.arch}`);
}
const launcherBytes = readSeaFile(launcherSource);
const launcherEvidence = JSON.parse(readSeaFile(`${launcherSource}.evidence.json`, 1024 * 1024));
const prepared = prepareLauncherProvenance(root, targetId, null);
assertLauncherBuildEvidence(launcherEvidence, launcherBytes, prepared);
assertSeaSourceEvidence(sourceEvidence, prepared.provenance.source_evidence);

const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-sea-mcp-'));
try {
  const pluginRoot = path.join(temporary, 'plugin');
  const privacyRoot = path.join(temporary, 'privacy');
  fs.cpSync(sourceRoot, pluginRoot, { recursive: true, dereference: false });
  assertSeaSourceEvidence(createSeaSourceEvidence(pluginRoot, contractFile, dispatcherSource), sourceEvidence);
  const binDir = path.join(pluginRoot, 'bin');
  const dispatcher = path.join(binDir, 'datasecure-mcp');
  const runtimeDir = path.join(pluginRoot, 'server', 'runtime', target.id);
  const launcher = target.os === 'win32'
    ? path.join(binDir, target.launcher)
    : path.join(runtimeDir, target.launcher);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(dispatcherSource, dispatcher);
  if (target.os !== 'win32') fs.chmodSync(dispatcher, 0o755);
  fs.writeFileSync(launcher, launcherBytes, { flag: 'wx' });
  if (target.os !== 'win32') fs.chmodSync(launcher, 0o755);

  const normalRequests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
  ];
  const supportRequests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'privacy_status', arguments: {} } }
  ];
  function probe(requests, support = false) {
    const input = `${requests.map((request) => JSON.stringify(request)).join('\n')}\n`;
    const result = childProcess.spawnSync(dispatcher, [], {
      cwd: pluginRoot,
      encoding: 'utf8',
      input,
      windowsHide: true,
      timeout: 30000,
      env: {
        PATH: '',
        NODE_OPTIONS: '--require=datasecure-must-not-be-loaded',
        EU_PRIVACY_ROOT: privacyRoot,
        EU_PRIVACY_LANGUAGE: 'de',
        EU_PRIVACY_VISUAL_MODE: 'strict',
        EU_PRIVACY_RETENTION_DAYS: '7',
        ...(support ? { EU_PRIVACY_SUPPORT_MODE: '1' } : {}),
        LOCALAPPDATA: path.join(temporary, 'localapp'),
        SystemRoot: process.env.SystemRoot || '',
        TEMP: temporary,
        TMP: temporary
      }
    });
    if (result.error || result.status !== 0) {
      const code = /\bcode: '([A-Z][A-Z0-9_]{2,80})'/.exec(result.stderr || '')?.[1] ||
        /\bError: ([A-Z][A-Z0-9_]{2,80})\b/.exec(result.stderr || '')?.[1] || 'UNCLASSIFIED';
      throw new Error(`SEA_MCP_PROCESS_FAILED:${result.status ?? 'spawn'}:${code}`);
    }
    if (result.stderr !== '') throw new Error('SEA_MCP_STDERR_NOT_EMPTY');
    return result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  }
  const normal = probe(normalRequests);
  const expectedTools = ['start_document_batch_from_picker', 'start_completed_local_results_handoff',
    'continue_local_results_handoff', 'cancel_local_results_handoff', 'continue_most_recent_document_batch',
    'discard_incomplete_document_batches', 'configure_privacy_folder', 'open_export_folder'].sort();
  const normalTools = normal.find(response => response.id === 2)?.result?.tools?.map(tool => tool.name).sort();
  // Startup in support mode alone cannot prove the user's normal surface.
  if (!normalTools || JSON.stringify(normalTools) !== JSON.stringify(expectedTools)) {
    throw new Error('SEA_MCP_NORMAL_SURFACE_MISMATCH');
  }
  const responses = probe(supportRequests, true);
  const initialize = responses.find((response) => response.id === 1);
  const status = responses.find((response) => response.id === 2)?.result?.structuredContent;
  if (initialize?.result?.serverInfo?.name !== 'eu-privacy-document-gateway') {
    throw new Error('SEA_MCP_INITIALIZE_MISMATCH');
  }
  if (!status?.ok || status.runtime_mode !== 'self_contained_node' ||
      status.runtime_target !== target.id || status.host_node_required !== false ||
      status.runtime_dependency_install !== false || status.raw_content_sent_to_claude !== false) {
    throw new Error('SEA_MCP_PRIVACY_STATUS_MISMATCH');
  }
  if (initialize.result.serverInfo.version !== sourceEvidence.plugin_version) throw new Error('SEA_MCP_VERSION_MISMATCH');

  // Exercise the actual packaged parser boundary, not host-Node fallback.
  // The current SEA bootstrap fails here: worker arguments start index.js.
  const require = createRequire(import.meta.url);
  const { convertDocument } = require(path.join(pluginRoot, 'server', 'runtime.js'));
  const { zipStore } = require('../tests/lib/zip');
  const { opcControlEntries } = require('../tests/lib/opc');
  const docx = zipStore([...opcControlEntries('docx'), ['word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>SEA_CORE_CANARY</w:t></w:r></w:p></w:body></w:document>']]);
  const parserFailures = [];
  for (const [extension, bytes] of [['txt', Buffer.from('SEA_CORE_CANARY')], ['docx', docx]]) {
    try {
      const parsed = await convertDocument('', { inputBuffer: bytes, sourceName: `synthetic.${extension}`,
        execPath: launcher, nodeVersion: contract.node_version, timeoutMs: 10000 });
      if (!parsed.markdown.includes('SEA_CORE_CANARY') || parsed.warnings.length) throw new Error('core_mismatch');
    } catch { parserFailures.push(extension); }
  }
  if (parserFailures.length) throw new Error(`SEA_PARSER_CORE_FAILED:${parserFailures.join(',')}`);
  // A future positive core run still does not prove the negative permission /
  // network matrix. Do not fabricate those booleans from startup success.
  throw new Error('SEA_PARSER_NEGATIVE_EVIDENCE_REQUIRED');
} finally {
  // Inspect the entire private staging tree before recursive cleanup; a link
  // or unexpected file type stops cleanup rather than following it.
  assertSeaDirectory(temporary);
  seaTreeInventory(temporary);
  fs.rmSync(temporary, { recursive: true, force: true });
}
