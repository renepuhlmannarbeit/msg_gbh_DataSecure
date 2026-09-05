import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const zip = path.resolve(process.argv[2] || path.join(root, 'dist', `DataSecure-Standalone-${version}-windows-x64.zip`));
const extraction = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-'));
const install = path.join(extraction, 'Leerzeichen ünicode');
const data = path.join(extraction, 'Daten');
const sourceDirectory = path.join(extraction, 'Quellen');
const resultDirectory = path.join(extraction, 'Ergebnisse');

function safeRemove() {
  const resolved = path.resolve(extraction);
  if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith('.tmp-standalone-package-')) {
    throw new Error('STANDALONE_SMOKE_CLEANUP_UNSAFE');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function frame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

function childProcessPath(value) {
  if (process.platform !== 'win32') return value;
  if (value.startsWith('\\\\?\\UNC\\')) return `\\\\${value.slice(8)}`;
  if (value.startsWith('\\\\?\\')) return value.slice(4);
  return value;
}

function protocolClient(child, stderr) {
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const failAll = (error) => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  };
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (length < 2 || length > 1024 * 1024) return failAll(new Error('STANDALONE_SMOKE_FRAME_INVALID'));
      if (buffer.length < length + 4) return;
      let value;
      try { value = JSON.parse(buffer.subarray(4, 4 + length)); }
      catch { return failAll(new Error('STANDALONE_SMOKE_RESPONSE_INVALID')); }
      buffer = buffer.subarray(4 + length);
      const waiter = pending.get(value.request_id);
      if (!waiter) return failAll(new Error('STANDALONE_SMOKE_RESPONSE_UNEXPECTED'));
      pending.delete(value.request_id);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
  });
  child.once('error', () => failAll(new Error('STANDALONE_SMOKE_SPAWN_FAILED')));
  child.once('exit', (code) => failAll(new Error(`STANDALONE_SMOKE_EXIT:${code}`)));
  return {
    request(value) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(value.request_id);
          reject(new Error(`STANDALONE_SMOKE_TIMEOUT:${stderr.value.slice(0, 500)}`));
        }, 45000);
        pending.set(value.request_id, { resolve, reject, timer });
        child.stdin.write(frame(value));
      });
    }
  };
}

let child;
let childClosed = false;
try {
  fs.mkdirSync(install, { recursive: true });
  const entries = readZip(fs.readFileSync(zip), { maxEntries: 500, maxUncompressed: 256 * 1024 * 1024 });
  const prefix = `DataSecure-Standalone-${version}-windows-x64/`;
  for (const [name, bytes] of entries) {
    assert.ok(name.startsWith(prefix));
    const relative = name.slice(prefix.length);
    assert.ok(relative && !relative.split('/').includes('..') && !path.isAbsolute(relative));
    const destination = path.join(install, ...relative.split('/'));
    assert.equal(path.relative(install, destination).startsWith('..'), false);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(resultDirectory, { recursive: true });
  // Exercise the shipped parser/worker chain, not a replacement worker or one
  // synthetic TXT path. All four fixtures describe the same synthetic parties.
  const fixtureRoot = path.join(root, 'docs', 'acceptance', 'UAT_TEST_KIT', 'inputs', '01-positive');
  const sourceNames = ['personnel-profile.txt', 'personnel-profile.md', 'personnel-profile.csv', 'personnel-profile.docx'];
  const originals = sourceNames.map((name) => fs.readFileSync(path.join(fixtureRoot, name)));
  const sourceFiles = sourceNames.map((name, index) => {
    const destination = path.join(sourceDirectory, name);
    fs.writeFileSync(destination, originals[index], { flag: 'wx' });
    return destination;
  });
  const launchRoot = process.platform === 'win32' ? `\\\\?\\${install}` : install;
  const runtime = path.join(launchRoot, 'datasecure-core-x86_64-pc-windows-msvc.exe');
  const sidecar = path.join(launchRoot, 'server', 'standalone', 'desktop-sidecar.js');
  const deny = path.join(install, 'server', 'network-deny.cjs');
  assert.equal(fs.statSync(deny).isFile(), true);
  child = childProcess.spawn(childProcessPath(runtime), ['--require=../network-deny.cjs', path.basename(sidecar)], {
    cwd: childProcessPath(path.dirname(sidecar)), windowsHide: true, shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
      USERPROFILE: data, LOCALAPPDATA: path.join(data, 'Local'), PATH: '' }
  });
  const stderr = { value: '' };
  child.stderr.on('data', (chunk) => { stderr.value += chunk.toString('utf8'); });
  const { request } = protocolClient(child, stderr);
  const status = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), action: 'get_public_state' });
  assert.equal(status.schema, 'datasecure-standalone-private-response/1');
  assert.equal(status.request_id, 'a'.repeat(16));
  assert.equal(status.ok, true);
  assert.equal(status.result.product_channel, 'standalone');
  const admitted = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b'.repeat(16),
    action: 'admit_selected_sources', source_kind: 'files', source_paths: sourceFiles });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.result.selected_count, 4);
  assert.deepEqual([...admitted.result.ui_context.selected_files].sort(), [...sourceNames].sort());
  assert.deepEqual(admitted.result.ui_context.source_folders, [sourceDirectory]);
  const configured = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'c'.repeat(16),
    action: 'configure_results', source_paths: [resultDirectory] });
  assert.equal(configured.ok, true);
  assert.equal(configured.result.result_folder, resultDirectory);
  const context = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'd'.repeat(16), action: 'get_ui_context' });
  assert.equal(context.ok, true);
  assert.equal(context.result.result_folder, resultDirectory);
  assert.deepEqual([...context.result.selected_files].sort(), [...sourceNames].sort());
  const started = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'e'.repeat(16), action: 'start_admitted_batch' });
  assert.equal(started.ok, true);
  assert.equal(started.result.event, 'batch_accepted');
  let terminal;
  const terminalStates = new Set(['review_required', 'stopped', 'export_pending', 'results_available', 'completed_without_results']);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const requestId = attempt.toString(16).padStart(16, '0');
    const polled = await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: requestId, action: 'get_public_state' });
    assert.equal(polled.ok, true);
    if (terminalStates.has(polled.result.state)) { terminal = polled.result; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(terminal, 'the real packaged worker handoff must reach a durable terminal state');
  assert.equal(terminal.state, 'results_available');
  assert.equal(terminal.result_count, 4);
  const completedContext = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '1'.repeat(16), action: 'get_ui_context' });
  assert.equal(completedContext.ok, true);
  const exactRun = completedContext.result.latest_result_folder;
  assert.equal(typeof exactRun, 'string');
  assert.equal(path.dirname(exactRun), path.join(resultDirectory, 'DataSecure-Output'));
  assert.match(path.basename(exactRun), /^Lauf-\d{8}-\d{6}-[a-f0-9]{8}$/u);
  assert.equal(fs.statSync(exactRun).isDirectory(), true);
  const mapping = path.join(exactRun, 'DataSecure-Zuordnung.csv');
  assert.equal(fs.statSync(mapping).isFile(), true,
    'a completed standalone run must publish its human-readable mapping in the exact run directory');
  const mappingText = fs.readFileSync(mapping, 'utf8');
  for (const name of sourceNames) assert.ok(mappingText.includes(name), 'every source must have a mapping row');
  const outputs = fs.readdirSync(exactRun).filter((name) => name.endsWith('.md')).sort();
  assert.equal(outputs.length, 4, 'the actual mixed-format run must export all four results');
  let expectedAliases;
  for (const name of outputs) {
    const markdown = fs.readFileSync(path.join(exactRun, name), 'utf8');
    assert.doesNotMatch(markdown, /Lina|Testfeld|Nordstern|Falken|lina\.testfeld/iu);
    const persons = [...new Set(markdown.match(/\[PERSON_\d{3,}\]/gu))].sort();
    const companies = [...new Set(markdown.match(/\[UNTERNEHMEN_\d{3,}\]/gu))].sort();
    assert.equal(persons.length, 1, 'every result needs one readable person identity');
    assert.equal(companies.length, 2, 'employer and customer remain distinct company identities');
    const aliases = { persons, companies };
    if (expectedAliases) assert.deepEqual(aliases, expectedAliases, 'the same parties keep their labels across TXT/MD/CSV/DOCX');
    else expectedAliases = aliases;
    assert.ok(mappingText.includes(name), 'every output must be identifiable through the local mapping');
  }
  sourceFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), originals[index], 'source bytes stay unchanged'));
  const resolvedRun = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '2'.repeat(16), action: 'resolve_current_results' });
  assert.deepEqual(resolvedRun.result, {
    ok: true, target_kind: 'directory', local_path: exactRun, external_disclosure: false
  });
  const resolvedMapping = await request({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: '3'.repeat(16), action: 'resolve_local_ledger' });
  assert.deepEqual(resolvedMapping.result, {
    ok: true, target_kind: 'file', local_path: mapping, external_disclosure: false
  });
  await request({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'f'.repeat(16), action: 'shutdown' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('STANDALONE_SMOKE_SHUTDOWN_TIMEOUT')); }, 10000);
    child.once('close', (code) => {
      childClosed = true;
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`STANDALONE_SMOKE_SHUTDOWN:${code}`));
    });
  });
  process.stdout.write('STANDALONE PACKAGE ISOLATED SIDECAR SMOKE PASS\n');
} finally {
  if (child && !childClosed && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('close', () => { childClosed = true; resolve(); }));
  }
  if (process.env.DATASECURE_SMOKE_KEEP === '1') process.stderr.write(`STANDALONE_SMOKE_KEPT:${extraction}\n`);
  else safeRemove();
}
