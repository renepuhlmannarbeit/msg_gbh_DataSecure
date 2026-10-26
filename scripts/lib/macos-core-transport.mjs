// Build-only transport. It cannot mint approval, import, execute or re-sign a Core.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import bound from '../../plugins/data-secure/server/core/bound-file-io.js';
import { parseMacCoreCandidateTar, MAX_ARCHIVE_BYTES } from '../import-macos-core-candidate.mjs';
import { canonicalBytes, validateMacCoreArtifact } from './macos-core-artifact.mjs';

export const CORE_TRANSPORT_REPOSITORY = 'renepuhlmannarbeit/msg_gbh_DataSecure';
export const CORE_TRANSPORT_TAG = 'build-inputs-macos-core-7d0ee31-39167676290';
export const CORE_ORIGINAL_PRODUCER_RUN = '39167676290';
export const CORE_ORIGINAL_PRODUCER_SOURCE = '7d0ee31dc65ce31ce54f1b4a1a0cefa348ef7071';
const TARGETS = ['macos-arm64', 'macos-x64'];
const MAX_JSON_BYTES = 128 * 1024;
const PREFIX = `repos/${CORE_TRANSPORT_REPOSITORY}/`;
const fail = (code = 'MACOS_CORE_TRANSPORT_INVALID') => { throw Object.assign(new Error(code), { code }); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const decimal = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/u.test(value);

function object(value, keys) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (keys && (names.length !== keys.length || names.some(name => !keys.includes(name)))) fail();
  if (names.some(name => typeof name !== 'string' || !descriptors[name].enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail();
  return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
function array(value, length) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  const size = descriptors.length?.value;
  if (!Number.isSafeInteger(size) || size < 0 || size > 100 || (length !== undefined && size !== length) ||
      keys.length !== size + 1 || keys.some(key => key !== 'length' &&
        (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= size ||
         !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')))) fail();
  return Array.from({ length: size }, (_, index) => descriptors[String(index)].value);
}
function id(value) {
  if (Number.isSafeInteger(value) && value > 0) value = String(value);
  if (!decimal(value)) fail();
  return value;
}
function json(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_JSON_BYTES) fail();
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(); }
}
function selected(lock, target) {
  if (!TARGETS.includes(target)) fail();
  const row = lock.targets.find(value => value.target === target);
  if (!row) fail();
  return row;
}

export function validateMacCoreTransportLock(value) {
  const lock = object(value, ['schema', 'repository', 'release', 'original_producer', 'targets']);
  const release = object(lock.release, ['id', 'tag']);
  const producer = object(lock.original_producer, ['run_id', 'source_sha']);
  if (lock.schema !== 'datasecure-macos-core-transport-lock/1' || lock.repository !== CORE_TRANSPORT_REPOSITORY ||
      !decimal(release.id) || release.tag !== CORE_TRANSPORT_TAG ||
      producer.run_id !== CORE_ORIGINAL_PRODUCER_RUN || producer.source_sha !== CORE_ORIGINAL_PRODUCER_SOURCE) fail();
  const rows = array(lock.targets, 2).map(value => {
    const row = object(value, ['target', 'asset_id', 'name', 'bytes', 'sha256', 'approved_artifact_sha256']);
    if (!TARGETS.includes(row.target) || !decimal(row.asset_id) || row.name !== `${row.target}-core.tar` ||
        !Number.isSafeInteger(row.bytes) || row.bytes < 1024 || row.bytes > MAX_ARCHIVE_BYTES || row.bytes % 512 ||
        !hash(row.sha256) || !hash(row.approved_artifact_sha256)) fail();
    return Object.freeze(row);
  });
  if (new Set(rows.map(row => row.target)).size !== 2 || new Set(rows.map(row => row.asset_id)).size !== 2) fail();
  return Object.freeze({ schema: lock.schema, repository: lock.repository, release: Object.freeze(release),
    original_producer: Object.freeze(producer), targets: Object.freeze(rows) });
}

export function verifyMacCoreAssetMetadata(value, target, metadata) {
  const lock = validateMacCoreTransportLock(value), row = selected(lock, target), asset = object(metadata);
  if (id(asset.id) !== row.asset_id || asset.name !== row.name || asset.state !== 'uploaded' ||
      asset.size !== row.bytes || asset.digest !== `sha256:${row.sha256}`) fail();
  return row;
}
export function verifyMacCoreReleaseMetadata(value, target, metadata) {
  const lock = validateMacCoreTransportLock(value), row = selected(lock, target), release = object(metadata);
  if (id(release.id) !== lock.release.id || release.tag_name !== lock.release.tag || release.draft !== false ||
      release.prerelease !== true || release.target_commitish !== lock.original_producer.source_sha) fail();
  const matches = array(release.assets).filter(asset => id(object(asset).id) === row.asset_id);
  if (matches.length !== 1) fail();
  verifyMacCoreAssetMetadata(lock, target, matches[0]);
  return lock;
}

export function verifyMacCoreTransportBytes(value, target, bytes, policy) {
  const lock = validateMacCoreTransportLock(value), row = selected(lock, target);
  if (!Buffer.isBuffer(bytes) || bytes.length !== row.bytes || bytes.length > MAX_ARCHIVE_BYTES || digest(bytes) !== row.sha256) fail();
  const files = parseMacCoreCandidateTar(bytes, target);
  const artifact = json(files.get('FINAL-CORE.json')), provenance = json(files.get('BUILD-PROVENANCE.json'));
  const approved = validateMacCoreArtifact(artifact, policy, target);
  if (approved !== row.approved_artifact_sha256) fail();
  // The approved FINAL binds canonical provenance; a transport is not a new build.
  return Object.freeze({ target, bytes: bytes.length, sha256: row.sha256, approved_artifact_sha256: approved,
    core_sha256: artifact.core.sha256, provenance_sha256: digest(canonicalBytes(provenance)) });
}

// The adapter receives fixed repository-relative ID endpoints, never a URL.
// Injection is available to module tests; the CLI supplies no adapter/URL state.
export function createGitHubCoreApiReader(run = spawnSync) {
  if (typeof run !== 'function') fail();
  return (endpoint, { binary = false, maximum = MAX_JSON_BYTES } = {}) => {
    const relative = typeof endpoint === 'string' && endpoint.startsWith(PREFIX) ? endpoint.slice(PREFIX.length) : '';
    if (!( /^releases\/(?:assets\/)?[1-9][0-9]{0,19}$/u.test(relative) ||
        relative === `git/ref/tags/${CORE_TRANSPORT_TAG}` || /^git\/tags\/[a-f0-9]{40}$/u.test(relative)) ||
        typeof binary !== 'boolean' || !Number.isSafeInteger(maximum) || maximum < 1 ||
        maximum > (binary ? MAX_ARCHIVE_BYTES : MAX_JSON_BYTES) ||
        (binary && !/^releases\/assets\/[1-9][0-9]{0,19}$/u.test(relative))) fail();
    const env = { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1' };
    delete env.GH_DEBUG;
    let result;
    try {
      result = run('gh', ['api', '--hostname', 'github.com', '--method', 'GET',
        '--header', `Accept: ${binary ? 'application/octet-stream' : 'application/vnd.github+json'}`,
        '--header', 'X-GitHub-Api-Version: 2022-11-28', endpoint],
      { encoding: null, maxBuffer: maximum, timeout: binary ? 180_000 : 60_000,
        shell: false, windowsHide: true, env });
    } catch { fail('MACOS_CORE_TRANSPORT_DOWNLOAD_FAILED'); }
    if (result?.error || result?.status !== 0 || !Buffer.isBuffer(result?.stdout) ||
        !result.stdout.length || result.stdout.length > maximum) fail('MACOS_CORE_TRANSPORT_DOWNLOAD_FAILED');
    return result.stdout;
  };
}

function readApi(api, endpoint, binary = false, maximum = MAX_JSON_BYTES) {
  let bytes;
  try { bytes = api(endpoint, { binary, maximum }); }
  catch { fail('MACOS_CORE_TRANSPORT_DOWNLOAD_FAILED'); }
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maximum) fail('MACOS_CORE_TRANSPORT_DOWNLOAD_FAILED');
  return binary ? bytes : json(bytes);
}
function verifyTag(lock, api) {
  const reference = object(readApi(api, PREFIX + `git/ref/tags/${lock.release.tag}`));
  if (reference.ref !== `refs/tags/${lock.release.tag}`) fail();
  let current = object(reference.object);
  const seen = new Set();
  for (let depth = 0; depth < 4; depth++) {
    if (!/^[a-f0-9]{40}$/u.test(current.sha || '')) fail();
    if (current.type === 'commit') {
      if (current.sha !== lock.original_producer.source_sha) fail();
      return;
    }
    if (current.type !== 'tag' || seen.has(current.sha)) fail();
    seen.add(current.sha);
    const tag = object(readApi(api, PREFIX + `git/tags/${current.sha}`));
    if (tag.sha !== current.sha) fail();
    current = object(tag.object);
  }
  fail();
}

function writeFresh(directory, name, bytes) {
  bound.assertDirectory(directory);
  const file = path.join(directory.path, name);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW || 0), 0o600);
  try {
    const created = fs.fstatSync(fd, { bigint: true });
    if (!created.isFile() || created.nlink !== 1n || created.size !== 0n) fail();
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) fail();
      offset += count;
    }
    fs.fchmodSync(fd, 0o600); fs.fsyncSync(fd);
    const held = fs.fstatSync(fd, { bigint: true });
    if (!held.isFile() || held.nlink !== 1n || held.dev !== created.dev || held.ino !== created.ino ||
        held.size !== BigInt(bytes.length) || !bound.sameFile(fs.lstatSync(file, { bigint: true }), bound.fileIdentity(held, true))) fail();
    bound.assertDirectory(directory);
  } finally { fs.closeSync(fd); }
  if (!bound.readBoundFile(file, { directory, maximum: bytes.length, minimum: bytes.length, checkCtime: true }).equals(bytes)) fail();
}

export function downloadApprovedMacCore(options) {
  const args = object(options, ['repository', 'target', 'outputDirectory', 'originalProducerRunId', 'originalProducerSourceSha', 'api']);
  if (typeof args.repository !== 'string' || !path.isAbsolute(args.repository) ||
      typeof args.outputDirectory !== 'string' || !path.isAbsolute(args.outputDirectory) ||
      !TARGETS.includes(args.target) || typeof args.api !== 'function') fail();
  const repository = bound.bindDirectory(args.repository), parent = bound.bindDirectory(path.dirname(args.outputDirectory));
  const output = path.resolve(args.outputDirectory);
  try { fs.lstatSync(output); fail('MACOS_CORE_TRANSPORT_DESTINATION_EXISTS'); }
  catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
  const lockFile = path.join(repository.path, 'native/runtime/macos-core-transport-lock.json');
  const policyFile = path.join(repository.path, 'native/runtime/standalone-macos-core.json');
  const read = file => bound.readBoundFile(file, { maximum: MAX_JSON_BYTES, minimum: 2, checkCtime: true });
  const lockBytes = read(lockFile), policyBytes = read(policyFile);
  const lock = validateMacCoreTransportLock(json(lockBytes)), row = selected(lock, args.target);
  if (args.originalProducerRunId !== lock.original_producer.run_id ||
      args.originalProducerSourceSha !== lock.original_producer.source_sha) fail();
  verifyMacCoreReleaseMetadata(lock, args.target, readApi(args.api, PREFIX + `releases/${lock.release.id}`));
  verifyTag(lock, args.api);
  verifyMacCoreAssetMetadata(lock, args.target, readApi(args.api, PREFIX + `releases/assets/${row.asset_id}`));
  const bytes = readApi(args.api, PREFIX + `releases/assets/${row.asset_id}`, true, row.bytes);
  const proof = verifyMacCoreTransportBytes(lock, args.target, bytes, json(policyBytes));
  // No namespace mutation before complete byte, TAR, approval and source checks.
  if (!read(lockFile).equals(lockBytes) || !read(policyFile).equals(policyBytes)) fail();
  bound.assertDirectory(repository); bound.assertDirectory(parent);
  fs.mkdirSync(output, { mode: 0o700 });
  const directory = bound.bindDirectory(output);
  writeFresh(directory, row.name, bytes);
  const receipt = { schema: 'datasecure-macos-core-transport-receipt/1',
    transport: { kind: 'github-release-asset', repository: lock.repository,
      release_id: lock.release.id, release_tag: lock.release.tag, asset_id: row.asset_id, asset_name: row.name },
    original_producer: lock.original_producer, ...proof,
    source_lock_sha256: digest(lockBytes), source_policy_sha256: digest(policyBytes),
    artifact_approved: false, existing_artifact_policy_verified: true };
  writeFresh(directory, 'MACOS-CORE-TRANSPORT.json', Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
  bound.assertDirectory(repository); bound.assertDirectory(parent); bound.assertDirectory(directory);
  if (fs.readdirSync(directory.path).sort().join(',') !== ['MACOS-CORE-TRANSPORT.json', row.name].sort().join(',')) fail();
  return Object.freeze({ ok: true, target: args.target, archive: path.join(output, row.name),
    receipt: path.join(output, 'MACOS-CORE-TRANSPORT.json'), artifact_approved: false });
}
