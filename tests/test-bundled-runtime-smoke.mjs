import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readCentralModes } from '../scripts/lib/zip.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const archive = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.statSync(archive).isFile()) throw new Error('BUNDLED_RUNTIME_SMOKE_ARCHIVE_REQUIRED');
const bytes = fs.readFileSync(archive), entries = readZip(bytes), modes = readCentralModes(bytes);
const evidence = JSON.parse(entries.get('RUNTIME-EVIDENCE.json'));
const target = ({ 'win32/x64': 'windows-x64', 'darwin/x64': 'macos-x64',
  'darwin/arm64': 'macos-arm64' })[`${process.platform}/${process.arch}`];
assert.ok(target, 'unsupported smoke host');
assert.ok(evidence.targets.some((item) => item.target === target), 'archive has no runtime for this host');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-bundled-smoke-'));
try {
  for (const [name, value] of entries) {
    const destination = path.resolve(temporary, ...name.split('/'));
    assert.ok(destination.startsWith(`${temporary}${path.sep}`));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, value, { flag: 'wx' });
    if (modes.get(name) === 0o100755) fs.chmodSync(destination, 0o755);
  }
  const command = path.join(temporary, 'runtime', 'datasecure-node');
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'bundled-runtime-smoke', version: '1' }
    } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'privacy_status', arguments: {} } }
  ];
  const result = spawnSync(command, [path.join(temporary, 'server', 'index.js')], {
    input: `${requests.map((value) => JSON.stringify(value)).join('\n')}\n`, encoding: 'utf8',
    windowsHide: true, shell: false, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: '', LOCALAPPDATA: path.join(temporary, 'localapp'), EU_PRIVACY_ROOT: path.join(temporary, 'privacy'),
      SystemRoot: process.env.SystemRoot || '', TEMP: temporary, TMP: temporary,
      EU_PRIVACY_SUPPORT_MODE: '1', EU_PRIVACY_VISUAL_MODE: 'strict', EU_PRIVACY_RETENTION_DAYS: '7' }
  });
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stderr, '');
  const responses = result.stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
  assert.equal(responses.find((item) => item.id === 1)?.result?.serverInfo?.name, 'eu-privacy-document-gateway');
  assert.ok(responses.find((item) => item.id === 2)?.result?.tools?.length >= 8);
  const status = responses.find((item) => item.id === 3)?.result?.structuredContent;
  assert.equal(status?.runtime_mode, 'self_contained_node');
  assert.equal(status?.runtime_target, target);
  assert.equal(status?.runtime_dependency_install, false);
  assert.equal(status?.host_node_required, false);
  assert.equal(status?.raw_content_sent_to_claude, false);
  console.log(`Bundled runtime real smoke: PASS (${target}, ${entries.size} entries)`);
} finally {
  fs.rmSync(temporary, { recursive: true });
}
