'use strict';

// Cowork may remove its temporary plugin projection as soon as an MCP turn
// ends. Local intake deliberately outlives that turn, so every executable
// file needed by detached workers is projected into a small, versioned cache
// during server startup. No source document, journal or result is copied here.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dataRoot } = require('./runtime');
const { runtimeInfo } = require('./runtime-info');
const { VERSION } = require('./version');

const SCHEMA = 'data-secure-durable-runtime/1';
const MAX_FILES = 1000;
const MAX_TOTAL_BYTES = 192 * 1024 * 1024;
const MAX_FILE_BYTES = 128 * 1024 * 1024;
function fail() { throw Object.assign(new Error('DURABLE_RUNTIME_FAILED'), { code: 'DURABLE_RUNTIME_FAILED' }); }
function included(relative) {
  const value = relative.replaceAll('\\', '/').toLowerCase();
  return value !== 'server/vendor/keyring' && !value.startsWith('server/vendor/keyring/') &&
    value !== 'server/ocr-runtime' &&
    !value.startsWith('server/ocr-runtime/') && value !== 'server/ocr-runtime.provenance.json';
}
function regularFile(file, io = fs) {
  const stat = io.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_FILE_BYTES) fail();
  return stat;
}
function inventory(pluginRoot, executable, io = fs, platform = process.platform) {
  const files = [];
  let total = 0;
  function add(full, relative, mode) {
    const stat = regularFile(full, io);
    total += stat.size;
    if (files.length >= MAX_FILES || total > MAX_TOTAL_BYTES) fail();
    const bytes = io.readFileSync(full);
    if (bytes.length !== stat.size) fail();
    files.push({ full, relative, bytes, mode, size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  function walk(directory, relativeBase) {
    const stat = io.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    for (const entry of io.readdirSync(directory, { withFileTypes: true })) {
      const relative = `${relativeBase}/${entry.name}`;
      if (!included(relative)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail();
      if (entry.isDirectory()) walk(full, relative);
      else if (entry.isFile()) add(full, relative, 0o600);
      else fail();
    }
  }
  walk(path.join(pluginRoot, 'server'), 'server');
  add(path.join(pluginRoot, 'RUNTIME-EVIDENCE.json'), 'RUNTIME-EVIDENCE.json', 0o600);
  const runtimeName = platform === 'win32' ? 'datasecure-node.exe' : 'datasecure-node';
  add(executable, `runtime/${runtimeName}`, platform === 'win32' ? 0o600 : 0o700);
  files.sort((left, right) => left.relative.localeCompare(right.relative));
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(files.map(({ relative, size, sha256 }) =>
    ({ relative, size, sha256 })))).digest('hex');
  return { files, fingerprint, runtimeName };
}
function manifestFor(version, target, source) {
  return { schema: SCHEMA, product_version: version, runtime_target: target,
    fingerprint: source.fingerprint,
    files: source.files.map(({ relative, size, sha256, mode }) => ({ relative, size, sha256, mode })) };
}
function validateCache(root, expected, io = fs) {
  let actual;
  try {
    const rootStat = io.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return false;
    actual = JSON.parse(io.readFileSync(path.join(root, 'DURABLE-RUNTIME.json'), 'utf8'));
  } catch { return false; }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
  try {
    for (const file of expected.files) {
      const full = path.join(root, ...file.relative.split('/'));
      const stat = regularFile(full, io);
      if (stat.size !== file.size) return false;
      if (crypto.createHash('sha256').update(io.readFileSync(full)).digest('hex') !== file.sha256) return false;
    }
  } catch { return false; }
  return true;
}
function ensureDurableRuntime(options = {}) {
  const info = options.runtimeInfo || runtimeInfo();
  if (info.runtime_mode !== 'self_contained_node' || !info.runtime_target) {
    delete process.env.DATASECURE_DURABLE_RUNTIME_ROOT;
    return { active: false, reason: 'host_node' };
  }
  const io = options.fs || fs;
  const version = options.version || VERSION;
  const pluginRoot = path.resolve(options.pluginRoot || path.join(__dirname, '..'));
  const executable = path.resolve(options.executable || process.execPath);
  const base = path.resolve(options.dataRoot || dataRoot(), 'runtime-cache');
  const source = inventory(pluginRoot, executable, io, options.platform || process.platform);
  const target = path.join(base, `${version}-${info.runtime_target}-${source.fingerprint.slice(0, 16)}`);
  const expected = manifestFor(version, info.runtime_target, source);
  io.mkdirSync(base, { recursive: true, mode: 0o700 });
  if (!validateCache(target, expected, io)) {
    if (io.existsSync(target)) fail();
    const stage = io.mkdtempSync(path.join(base, '.stage-'));
    try {
      for (const file of source.files) {
        const destination = path.join(stage, ...file.relative.split('/'));
        io.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
        io.writeFileSync(destination, file.bytes, { flag: 'wx', mode: file.mode });
      }
      io.writeFileSync(path.join(stage, 'DURABLE-RUNTIME.json'), `${JSON.stringify(expected)}\n`,
        { flag: 'wx', mode: 0o600 });
      if (!validateCache(stage, expected, io)) fail();
      try { io.renameSync(stage, target); }
      catch (error) {
        if (!validateCache(target, expected, io)) throw error;
        io.rmSync(stage, { recursive: true });
      }
    } catch (error) {
      try { if (io.existsSync(stage)) io.rmSync(stage, { recursive: true }); } catch {}
      if (error?.code === 'DURABLE_RUNTIME_FAILED') throw error;
      fail();
    }
  }
  process.env.DATASECURE_DURABLE_RUNTIME_ROOT = target;
  return { active: true, root: target, target: info.runtime_target, fingerprint: source.fingerprint };
}
function resolveDurableRuntimeRoot(environment = process.env, options = {}) {
  const candidate = String(environment.DATASECURE_DURABLE_RUNTIME_ROOT || '');
  if (!candidate || !path.isAbsolute(candidate)) return null;
  const base = path.resolve(options.dataRoot || dataRoot(), 'runtime-cache');
  const root = path.resolve(candidate);
  const relative = path.relative(base, root);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  try {
    const manifest = JSON.parse((options.fs || fs).readFileSync(path.join(root, 'DURABLE-RUNTIME.json'), 'utf8'));
    if (manifest?.schema !== SCHEMA || manifest.product_version !== VERSION ||
        !/^[a-f0-9]{64}$/u.test(String(manifest.fingerprint || ''))) return null;
    const executable = path.join(root, 'runtime', process.platform === 'win32' ? 'datasecure-node.exe' : 'datasecure-node');
    regularFile(executable, options.fs || fs);
    return { root, executable };
  } catch { return null; }
}

module.exports = { ensureDurableRuntime, resolveDurableRuntimeRoot, _test: { included, inventory, validateCache } };
