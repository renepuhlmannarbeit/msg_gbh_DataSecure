import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'native', 'sea', 'launcher-contract.json'), 'utf8'));

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
if (!fs.lstatSync(launcherSource).isFile()) throw new Error('launcher is not a regular file');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-sea-mcp-'));
try {
  const pluginRoot = path.join(temporary, 'plugin');
  const privacyRoot = path.join(temporary, 'privacy');
  fs.cpSync(path.join(root, 'plugins', 'data-secure'), pluginRoot, { recursive: true, dereference: false });
  const binDir = path.join(pluginRoot, 'bin');
  const dispatcher = path.join(binDir, 'datasecure-mcp');
  const runtimeDir = path.join(pluginRoot, 'server', 'runtime', target.id);
  const launcher = target.os === 'win32'
    ? path.join(binDir, target.launcher)
    : path.join(runtimeDir, target.launcher);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(path.join(root, contract.posix_dispatcher), dispatcher);
  if (target.os !== 'win32') fs.chmodSync(dispatcher, 0o755);
  fs.copyFileSync(launcherSource, launcher);
  if (target.os !== 'win32') fs.chmodSync(launcher, 0o755);

  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'privacy_status', arguments: {} } }
  ];
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
      LOCALAPPDATA: path.join(temporary, 'localapp'),
      SystemRoot: process.env.SystemRoot || '',
      TEMP: temporary,
      TMP: temporary
    }
  });
  if (result.error || result.status !== 0) {
    throw new Error(`SEA_MCP_PROCESS_FAILED:${result.status ?? 'spawn'}:${String(result.stderr).slice(0, 200)}`);
  }
  if (result.stderr !== '') throw new Error('SEA_MCP_STDERR_NOT_EMPTY');
  const responses = result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
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
  const launcherSha256 = crypto.createHash('sha256').update(fs.readFileSync(launcherSource)).digest('hex');
  const evidence = {
    schema: 'datasecure-sea-mcp-evidence/v1',
    release_enabled: false,
    target: target.id,
    launcher_sha256: launcherSha256,
    server: initialize.result.serverInfo.name,
    runtime_mode: status.runtime_mode,
    runtime_target: status.runtime_target,
    plugin_command: contract.plugin_command,
    dispatch_layout: target.os === 'win32' ? 'extensionless-command-to-pe' : 'fixed-posix-dispatcher',
    host_node_required: status.host_node_required,
    path_empty: true,
    node_options_ignored: true,
    raw_content_sent_to_claude: status.raw_content_sent_to_claude
  };
  fs.writeFileSync(`${launcherSource}.mcp-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
