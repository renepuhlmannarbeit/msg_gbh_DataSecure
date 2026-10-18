'use strict';

// The POSIX boundary is intentionally a bundled, target-specific executable.
// It is never searched on PATH and never selected from an environment value.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { bundleContext, roleFile } = require('./standalone/macos-bundle-layout');
const { readBoundFileRecord, assertDirectory, sameFile } = require('./core/bound-file-io');

const CONTRACT = '{"schema":"datasecure-posix-sandbox/v1","limits":["cpu","file_size","open_files","rss","wallclock"],"process_group_reap":true}';
const DARWIN_CONTRACT = '{"schema":"datasecure-posix-sandbox/v1","limits":["cpu","file_size","open_files","rss","wallclock"],"process_group_reap":true}';
const TARGETS = Object.freeze({ darwin: new Map([['x64', 'macos-x64'], ['arm64', 'macos-arm64']]), linux: new Map([['x64', 'linux-x64']]) });
const MAX_SUPERVISOR_BYTES = 64 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 128;
const MAX_CONTRACT_CACHE_ENTRIES = 8;
const cache = new Map();

function targetFor(platform = process.platform, arch = process.arch) { return TARGETS[platform]?.get(arch) || null; }
function artifactPath(platform, arch, base = path.join(__dirname, 'native')) {
  const target = targetFor(platform, arch);
  const bundle = bundleContext(path.dirname(base), platform, arch);
  if (bundle) return roleFile(bundle, 'sandbox');
  return target ? path.join(base, target, 'datasecure-sandbox') : null;
}
function inspectBinary(bytes, platform, arch) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64) throw new Error('format');
  if (platform === 'linux') {
    if (bytes.subarray(0, 4).toString('binary') !== '\x7fELF' || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== 62) throw new Error('format');
    return;
  }
  if (platform === 'darwin') {
    if (bytes.readUInt32LE(0) !== 0xfeedfacf) throw new Error('format');
    const cpu = bytes.readInt32LE(4);
    if ((arch === 'x64' && cpu !== 0x01000007) || (arch === 'arm64' && cpu !== 0x0100000c)) throw new Error('format');
    return;
  }
  throw new Error('format');
}
function verifiedRead(target, minimum, maximum) {
  try { return readBoundFileRecord(target, { minimum, maximum, checkCtime: true }); }
  catch { return null; }
}
function assertBinding(record) {
  assertDirectory(record.directory);
  if (!sameFile(fs.lstatSync(record.path, { bigint: true }), record.identity)) throw new Error('changed');
}
function contractBinding(record) {
  return { identity: record.identity, mode: String(record.stat.mode), real: record.directory.real,
    parents: record.directory.chain.map(entry => [entry.path, entry.identity, entry.alias]) };
}
function verifyPosixSupervisor(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (!targetFor(platform, arch)) return { available: false, reason: 'unsupported_target' };
  const executable = options.executable || artifactPath(platform, arch, options.base);
  if (!executable) return { available: false, reason: 'unsupported_target' };
  const bundle = bundleContext(__dirname, platform, arch);
  const checksum = bundle && executable === roleFile(bundle, 'sandbox')
    ? path.join(bundle.server, ...bundle.roles.sandbox.checksum.split('/')) : `${executable}.sha256`;
  const key = JSON.stringify([platform, arch, path.resolve(executable), path.resolve(checksum)]);
  const refuse = reason => { cache.delete(key); return { available: false, reason }; };
  try {
    // Integrity is never cached: read bounded held descriptors on every call,
    // including cache hits. The shared reader rejects raced FIFOs without a
    // blocking open and binds both relocated and ordinary parent chains.
    const execFile = verifiedRead(executable, 64, MAX_SUPERVISOR_BYTES);
    const checksumFile = execFile && verifiedRead(checksum, 64, MAX_CHECKSUM_BYTES);
    if (!execFile || !checksumFile) return refuse('missing_or_unsafe');
    inspectBinary(execFile.bytes, platform, arch);
    const expected = checksumFile.bytes.toString('utf8').trim();
    const actual = crypto.createHash('sha256').update(execFile.bytes).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual) return refuse('integrity_failed');
    // Node has no portable dirfd/openat-by-fd exec, so the verified bytes
    // cannot be run directly; this re-check right before the path-based spawn
    // narrows (but, like elsewhere in this codebase, cannot fully close) the
    // remaining swap window between verification and execution.
    assertBinding(execFile);
    assertBinding(checksumFile);
    const signature = JSON.stringify([actual, contractBinding(execFile), contractBinding(checksumFile)]);
    const cached = cache.get(key);
    if (cached?.signature === signature) return Object.freeze({ ...cached.result, executable });
    // A changed artifact must not resurrect an earlier successful probe if
    // the new probe fails. Only the tiny truthful contract result is cached.
    cache.delete(key);
    const probe = (options.spawnSync || childProcess.spawnSync)(executable, ['--sandbox-contract'], { encoding: 'utf8', windowsHide: true, shell: false, env: {}, timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 4096, stdio: ['ignore', 'pipe', 'ignore'] });
    if (['EACCES', 'EPERM'].includes(probe.error?.code)) return refuse('executable_denied');
    if (['ENOENT', 'ENOTDIR'].includes(probe.error?.code)) {
      try {
        const named = fs.lstatSync(executable, { bigint: true });
        return refuse(sameFile(named, execFile.identity) ? 'dependency_missing' : 'verification_failed');
      } catch (error) { return refuse(['ENOENT', 'ENOTDIR'].includes(error.code) ? 'executable_missing' : 'verification_failed'); }
    }
    if (['ENOEXEC', 'EFTYPE', 'EBADARCH'].includes(probe.error?.code)) return refuse('executable_format');
    const expectedContract = platform === 'darwin' ? DARWIN_CONTRACT : CONTRACT;
    if (probe.error || probe.status !== 0 || String(probe.stdout || '').trim() !== expectedContract) return refuse('contract_failed');
    assertBinding(execFile);
    assertBinding(checksumFile);
    const result = Object.freeze({ available: true, reason: 'ok', executable });
    if (cache.size >= MAX_CONTRACT_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { signature, result });
    return result;
  } catch { return refuse('verification_failed'); }
}
function clearPosixSupervisorCache() { cache.clear(); }
module.exports = { CONTRACT, DARWIN_CONTRACT, MAX_SUPERVISOR_BYTES, MAX_CHECKSUM_BYTES,
  targetFor, artifactPath, inspectBinary, verifyPosixSupervisor, clearPosixSupervisorCache };
