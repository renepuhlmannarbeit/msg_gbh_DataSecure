// An artifact download is transport, never Core approval. The existing
// macos-core-artifact verifier must accept committed policy before Prepare/Cargo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bound from '../plugins/data-secure/server/core/bound-file-io.js';
import { canonicalBytes, MAX_CORE_BYTES } from './lib/macos-core-artifact.mjs';
import { inspectMachO } from './lib/macos-native-contract.mjs';

const RULES = new Map([
  ['datasecure-core', { maximum: MAX_CORE_BYTES, minimum: 64, modes: [0o700, 0o755], outputMode: 0o700 }],
  ['FINAL-CORE.json', { maximum: 128 * 1024, minimum: 2, modes: [0o600, 0o644], outputMode: 0o600 }],
  ['BUILD-PROVENANCE.json', { maximum: 128 * 1024, minimum: 2, modes: [0o600, 0o644], outputMode: 0o600 }],
  ['LICENSE.node.txt', { maximum: 2 * 1024 * 1024, minimum: 1, modes: [0o600, 0o644], outputMode: 0o600 }]
]);
export const MAX_ARCHIVE_BYTES = [...RULES.values()].reduce((total, rule) => total + rule.maximum, 32 * 512);
const fail = () => { throw new Error('STANDALONE_MACOS_CORE_IMPORT_INVALID'); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const targetValid = target => ['macos-arm64', 'macos-x64'].includes(target);
const zeros = bytes => bytes.every(value => value === 0);
function textField(bytes) {
  const zero = bytes.indexOf(0), end = zero < 0 ? bytes.length : zero;
  if (zero >= 0 && !zeros(bytes.subarray(zero))) fail();
  const value = bytes.subarray(0, end);
  if (value.some(byte => byte < 32 || byte > 126)) fail();
  return value.toString('ascii');
}
function octal(bytes, empty = false) {
  if (bytes.some(byte => byte > 127)) fail();
  const value = bytes.toString('ascii');
  if (!/^[ ]*[0-7]+[\0 ]*$/u.test(value) && !(empty && /^[\0 ]*$/u.test(value))) fail();
  const digits = value.replace(/[\0 ]/gu, '');
  if (!digits.length && !empty) fail();
  const number = digits.length ? Number.parseInt(digits, 8) : 0;
  if (!Number.isSafeInteger(number) || number < 0) fail();
  return number;
}
function json(bytes) {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    return value;
  } catch { fail(); }
}

export function parseMacCoreCandidateTar(bytes, target) {
  if (!targetValid(target) || !Buffer.isBuffer(bytes) || bytes.length < 1024 ||
      bytes.length > MAX_ARCHIVE_BYTES || bytes.length % 512) fail();
  const files = new Map();
  let offset = 0, terminated = false;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (zeros(header)) {
      if (offset + 1024 > bytes.length || !zeros(bytes.subarray(offset))) fail();
      terminated = true; break;
    }
    if (files.size >= RULES.size || !header.subarray(257, 263).equals(Buffer.from('ustar\0', 'ascii')) ||
        !header.subarray(263, 265).equals(Buffer.from('00', 'ascii')) || !zeros(header.subarray(500)) ||
        ![0, 48].includes(header[156]) || textField(header.subarray(157, 257)) ||
        textField(header.subarray(345, 500))) fail();
    const checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (octal(header.subarray(148, 156)) !== checksum) fail();
    const name = textField(header.subarray(0, 100)), rule = RULES.get(name);
    if (!rule || files.has(name) || !rule.modes.includes(octal(header.subarray(100, 108)))) fail();
    // Reject base-256 numbers and extension records instead of delegating any
    // archive interpretation or namespace operation to a system tar extractor.
    for (const [start, end] of [[108, 116], [116, 124], [136, 148]]) octal(header.subarray(start, end));
    if (octal(header.subarray(329, 337), true) || octal(header.subarray(337, 345), true)) fail();
    textField(header.subarray(265, 297)); textField(header.subarray(297, 329));
    const size = octal(header.subarray(124, 136)), start = offset + 512;
    const end = start + size, next = start + Math.ceil(size / 512) * 512;
    if (size < rule.minimum || size > rule.maximum || next > bytes.length || !zeros(bytes.subarray(end, next))) fail();
    files.set(name, bytes.subarray(start, end)); offset = next;
  }
  if (!terminated || files.size !== RULES.size) fail();
  const artifact = json(files.get('FINAL-CORE.json')), provenance = json(files.get('BUILD-PROVENANCE.json'));
  const core = files.get('datasecure-core'), license = files.get('LICENSE.node.txt');
  if (artifact.schema !== 'datasecure-macos-static-core-artifact/1' || artifact.role !== 'mutating-core' || artifact.target !== target ||
      artifact.core?.file !== 'datasecure-core' || artifact.core.bytes !== core.length || artifact.core.sha256 !== sha(core) ||
      artifact.license?.file !== 'LICENSE.node.txt' || artifact.license.bytes !== license.length || artifact.license.sha256 !== sha(license) ||
      artifact.build?.provenance_file !== 'BUILD-PROVENANCE.json' || artifact.build.provenance_sha256 !== sha(canonicalBytes(provenance)) ||
      provenance.schema !== 'datasecure-macos-static-core-build-provenance/2' || provenance.target !== target) fail();
  const native = inspectMachO(core);
  if (!native || native.fileType !== 2 || native.architecture !== target.slice(6) || !native.signed || native.minimum > 0x0d0500 ||
      [...native.libraries, ...native.rpaths].some(value => path.posix.normalize(value) !== value ||
        !['/usr/lib/', '/System/Library/Frameworks/'].some(prefix => value.startsWith(prefix)))) fail();
  return files;
}

function ensureChild(parent, name) {
  bound.assertDirectory(parent);
  const directory = path.join(parent.path, name);
  try { fs.mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const binding = bound.bindDirectory(directory);
  bound.assertDirectory(parent); return binding;
}
function writeFresh(directory, name, bytes, mode) {
  bound.assertDirectory(directory);
  const target = path.join(directory.path, name);
  const descriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW || 0), mode);
  try {
    const created = fs.fstatSync(descriptor, { bigint: true });
    if (!created.isFile() || created.nlink !== 1n || created.size !== 0n) fail();
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (!Number.isInteger(count) || count < 1 || count > bytes.length - offset) fail();
      offset += count;
    }
    fs.fchmodSync(descriptor, mode); fs.fsyncSync(descriptor);
    const written = fs.fstatSync(descriptor, { bigint: true }), named = fs.lstatSync(target, { bigint: true });
    if (!written.isFile() || written.nlink !== 1n || written.dev !== created.dev || written.ino !== created.ino ||
        written.size !== BigInt(bytes.length) || !bound.sameFile(named, bound.fileIdentity(written, true))) fail();
    bound.assertDirectory(directory);
  } finally { fs.closeSync(descriptor); }
  if (!bound.readBoundFile(target, { directory, maximum: bytes.length, minimum: bytes.length, checkCtime: true }).equals(bytes)) fail();
}

export function importMacCoreCandidate({ repository, inputDirectory, target }) {
  if (!targetValid(target) || typeof repository !== 'string' || !path.isAbsolute(repository) ||
      typeof inputDirectory !== 'string' || !path.isAbsolute(inputDirectory)) fail();
  const repositoryBinding = bound.bindDirectory(repository), input = bound.bindDirectory(inputDirectory);
  // The artifact may also carry independent-review logs. Only this exact tar
  // is opened; no other downloaded file is executed, extracted or imported.
  const archiveName = `${target}-core.tar`;
  const archive = bound.readBoundFile(path.join(input.path, archiveName),
    { directory: input, maximum: MAX_ARCHIVE_BYTES, minimum: 1024, checkCtime: true });
  const files = parseMacCoreCandidateTar(archive, target);
  bound.assertDirectory(input); bound.assertDirectory(repositoryBinding);
  const dist = ensureChild(repositoryBinding, 'dist'), parent = ensureChild(dist, 'macos-static-core');
  const destination = path.join(parent.path, target);
  // An existing target, including an empty directory or link, is never adopted.
  bound.assertDirectory(parent); fs.mkdirSync(destination, { mode: 0o700 });
  const directory = bound.bindDirectory(destination);
  for (const [name, rule] of RULES) writeFresh(directory, name, files.get(name), rule.outputMode);
  bound.assertDirectory(parent); bound.assertDirectory(repositoryBinding); bound.assertDirectory(directory);
  if (fs.readdirSync(directory.path).sort().join(',') !== [...RULES.keys()].sort().join(',')) fail();
  if (process.platform !== 'win32') {
    const descriptor = fs.openSync(directory.path, fs.constants.O_RDONLY);
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  }
  bound.assertDirectory(directory);
  return { ok: true, target, files: files.size, artifact_approved: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--target' || args[2] !== '--input') fail();
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.stdout.write(JSON.stringify(importMacCoreCandidate({ repository, target: args[1], inputDirectory: args[3] })) + '\n');
}
