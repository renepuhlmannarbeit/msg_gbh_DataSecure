'use strict';

// The POSIX boundary is intentionally a bundled, target-specific executable.
// It is never searched on PATH and never selected from an environment value.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const CONTRACT = '{"schema":"datasecure-posix-sandbox/v1","limits":["cpu","address_space","data","file_size","open_files","rss","wallclock"],"process_group_reap":true}';
const TARGETS = Object.freeze({ darwin: new Map([['x64', 'macos-x64'], ['arm64', 'macos-arm64']]), linux: new Map([['x64', 'linux-x64']]) });
const cache = new Map();

function targetFor(platform = process.platform, arch = process.arch) { return TARGETS[platform]?.get(arch) || null; }
function artifactPath(platform, arch, base = path.join(__dirname, 'native')) {
  const target = targetFor(platform, arch);
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
function identity(file) { const stat = fs.statSync(file); return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`; }
function verifyPosixSupervisor(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const executable = options.executable || artifactPath(platform, arch, options.base);
  if (!executable) return { available: false, reason: 'unsupported_target' };
  const checksum = `${executable}.sha256`;
  try {
    const named = fs.lstatSync(executable);
    if (!named.isFile() || named.isSymbolicLink() || !fs.existsSync(checksum)) return { available: false, reason: 'missing_or_unsafe' };
    const key = `${executable}:${identity(executable)}:${fs.statSync(checksum).mtimeMs}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const bytes = fs.readFileSync(executable);
    inspectBinary(bytes, platform, arch);
    const expected = fs.readFileSync(checksum, 'utf8').trim();
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual) return { available: false, reason: 'integrity_failed' };
    const probe = (options.spawnSync || childProcess.spawnSync)(executable, ['--sandbox-contract'], { encoding: 'utf8', windowsHide: true, shell: false, env: {}, timeout: 5000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'ignore'] });
    if (probe.status !== 0 || String(probe.stdout || '').trim() !== CONTRACT) return { available: false, reason: 'contract_failed' };
    const result = { available: true, reason: 'ok', executable };
    cache.set(key, result);
    return result;
  } catch { return { available: false, reason: 'verification_failed' }; }
}
function clearPosixSupervisorCache() { cache.clear(); }
module.exports = { CONTRACT, targetFor, artifactPath, inspectBinary, verifyPosixSupervisor, clearPosixSupervisorCache };
