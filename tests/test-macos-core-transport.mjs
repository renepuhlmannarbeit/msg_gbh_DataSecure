import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { canonicalBytes } from '../scripts/lib/macos-core-artifact.mjs';
import { MAX_ARCHIVE_BYTES } from '../scripts/import-macos-core-candidate.mjs';
import { CORE_TRANSPORT_REPOSITORY, CORE_TRANSPORT_TAG, CORE_ORIGINAL_PRODUCER_RUN,
  CORE_ORIGINAL_PRODUCER_SOURCE, validateMacCoreTransportLock, verifyMacCoreReleaseMetadata,
  verifyMacCoreAssetMetadata, verifyMacCoreTransportBytes, createGitHubCoreApiReader,
  downloadApprovedMacCore } from '../scripts/lib/macos-core-transport.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyFile = path.join(root, 'native/runtime/standalone-macos-core.json');
const actualPolicyBytes = fs.readFileSync(policyFile), originalPolicy = JSON.parse(actualPolicyBytes);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const prefix = `repos/${CORE_TRANSPORT_REPOSITORY}/`;
const temporaryParent = fs.realpathSync.native(os.tmpdir());
const temporary = fs.mkdtempSync(path.join(temporaryParent, 'datasecure-core-transport-test-'));
let passed = 0, serial = 0;
const invalid = error => /(?:MACOS_CORE_TRANSPORT_|STANDALONE_MACOS_|BOUND_FILE_|MACOS_NATIVE_)/u.test(error?.message || '');
function test(name, action) { action(); passed++; process.stdout.write(`PASS ${name}\n`); }

function number(header, offset, length, value) { header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii'); }
function tar(rows) {
  const blocks = [];
  for (const row of rows) {
    const header = Buffer.alloc(512);
    header.write(row.name, 0, 100, 'ascii'); number(header, 100, 8, row.mode);
    number(header, 108, 8, 0); number(header, 116, 8, 0); number(header, 124, 12, row.bytes.length); number(header, 136, 12, 0);
    header[156] = 48; header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
    header.fill(32, 148, 156); header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024)); return Buffer.concat(blocks);
}
function fixture() {
  const policy = clone(originalPolicy), buffers = {}, records = [], artifacts = {};
  for (const [index, target] of ['macos-arm64', 'macos-x64'].entries()) {
    const core = Buffer.alloc(96);
    core.writeUInt32LE(0xfeedfacf, 0); core.writeUInt32LE(index ? 0x01000007 : 0x0100000c, 4);
    core.writeUInt32LE(2, 12); core.writeUInt32LE(2, 16); core.writeUInt32LE(40, 20);
    core.writeUInt32LE(0x32, 32); core.writeUInt32LE(24, 36); core.writeUInt32LE(1, 40);
    core.writeUInt32LE(0x0d0500, 44); core.writeUInt32LE(0x0d0500, 48);
    core.writeUInt32LE(0x1d, 56); core.writeUInt32LE(16, 60); core.writeUInt32LE(72, 64); core.writeUInt32LE(24, 68);
    const license = Buffer.from('Synthetic licence: not a runnable or approved production Core\n');
    const provenance = { schema: 'datasecure-macos-static-core-build-provenance/2', target };
    const artifact = { schema: 'datasecure-macos-static-core-artifact/1', role: 'mutating-core', target,
      rust_target: index ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin', node_version: '22.23.2',
      upstream: policy.upstream, static_binding: policy.static_binding,
      inputs: { guard_c_sha256: policy.guard_source_sha256, adapter_cc_sha256: sha('cc'), adapter_h_sha256: sha('h'), transform_sha256: sha('transform') },
      build: { provenance_file: 'BUILD-PROVENANCE.json', provenance_sha256: sha(canonicalBytes(provenance)) },
      core: { file: 'datasecure-core', bytes: core.length, sha256: sha(core), unsigned_sha256: sha('unsigned') },
      converter: { archive_sha256: sha('official'), bytes: 80, sha256: sha('official converter'), license_sha256: sha(license) },
      license: { file: 'LICENSE.node.txt', bytes: license.length, sha256: sha(license) },
      signing: { identity: '-', hardened_runtime: true, entitlements: { 'com.apple.security.cs.allow-jit': true } } };
    const rows = [{ name: 'datasecure-core', mode: 0o700, bytes: core },
      { name: 'FINAL-CORE.json', mode: 0o600, bytes: Buffer.from(JSON.stringify(artifact, null, 2)) },
      { name: 'BUILD-PROVENANCE.json', mode: 0o600, bytes: Buffer.from(JSON.stringify(provenance, null, 2)) },
      { name: 'LICENSE.node.txt', mode: 0o600, bytes: license }];
    buffers[target] = tar(rows); artifacts[target] = artifact;
    records.push({ target, asset_id: String(101 + index), name: `${target}-core.tar`, bytes: buffers[target].length,
      sha256: sha(buffers[target]), approved_artifact_sha256: sha(canonicalBytes(artifact)) });
  }
  policy.approved_artifacts = records.map(row => ({ target: row.target, artifact_sha256: row.approved_artifact_sha256 }));
  const lock = { schema: 'datasecure-macos-core-transport-lock/1', repository: CORE_TRANSPORT_REPOSITORY,
    release: { id: '9001', tag: CORE_TRANSPORT_TAG },
    original_producer: { run_id: CORE_ORIGINAL_PRODUCER_RUN, source_sha: CORE_ORIGINAL_PRODUCER_SOURCE }, targets: records };
  const assets = records.map(row => ({ id: Number(row.asset_id), name: row.name, state: 'uploaded', size: row.bytes, digest: `sha256:${row.sha256}` }));
  const release = { id: 9001, tag_name: lock.release.tag, target_commitish: CORE_ORIGINAL_PRODUCER_SOURCE,
    draft: false, prerelease: true, assets };
  return { lock, policy, buffers, artifacts, assets, release };
}
function scenario() {
  const base = path.join(temporary, String(++serial)), repository = path.join(base, 'repository'), outputDirectory = path.join(base, 'download');
  fs.mkdirSync(path.join(repository, 'native/runtime'), { recursive: true });
  const model = fixture();
  const lockFile = path.join(repository, 'native/runtime/macos-core-transport-lock.json');
  const localPolicy = path.join(repository, 'native/runtime/standalone-macos-core.json');
  fs.writeFileSync(lockFile, JSON.stringify(model.lock)); fs.writeFileSync(localPolicy, JSON.stringify(model.policy));
  const calls = [];
  const api = (endpoint, options) => {
    assert.equal(fs.existsSync(outputDirectory), false, 'no target namespace before all metadata/bytes verify');
    calls.push({ endpoint, ...options });
    if (endpoint === prefix + 'releases/9001') return Buffer.from(JSON.stringify(model.release));
    if (endpoint === prefix + `git/ref/tags/${CORE_TRANSPORT_TAG}`) return Buffer.from(JSON.stringify({ ref: `refs/tags/${CORE_TRANSPORT_TAG}`,
      object: { type: 'commit', sha: CORE_ORIGINAL_PRODUCER_SOURCE } }));
    const row = model.lock.targets.find(value => endpoint === prefix + `releases/assets/${value.asset_id}`);
    if (!row) throw Error('unexpected test endpoint');
    return options.binary ? model.buffers[row.target] : Buffer.from(JSON.stringify(model.assets.find(value => String(value.id) === row.asset_id)));
  };
  const args = { repository, target: 'macos-arm64', outputDirectory, originalProducerRunId: CORE_ORIGINAL_PRODUCER_RUN,
    originalProducerSourceSha: CORE_ORIGINAL_PRODUCER_SOURCE, api };
  return { ...model, base, repository, outputDirectory, lockFile, localPolicy, calls, args, api,
    run() { return downloadApprovedMacCore(args); }, sync() { fs.writeFileSync(lockFile, JSON.stringify(model.lock)); } };
}
function absentAfterFailure(item) { assert.throws(() => item.run(), invalid); assert.equal(fs.existsSync(item.outputDirectory), false); }

try {
  test('closed lock is copied/frozen and both real roles remain distinct', () => {
    const model = fixture(), lock = validateMacCoreTransportLock(model.lock);
    assert.ok(Object.isFrozen(lock) && Object.isFrozen(lock.targets) && Object.isFrozen(lock.targets[0]));
    model.lock.targets[0].name = 'changed'; assert.equal(lock.targets[0].name, 'macos-arm64-core.tar');
    assert.notEqual(lock.release.id, lock.original_producer.run_id);
  });
  const lockMutations = [
    x => { x.schema = 'other'; }, x => { x.repository = 'evil/repo'; }, x => { x.release.id = '0'; },
    x => { x.release.id = 9001; }, x => { x.release.id = '01'; }, x => { x.release.tag = 'latest'; },
    x => { x.original_producer.run_id = '9001'; }, x => { x.original_producer.source_sha = 'a'.repeat(40); },
    x => { x.targets.pop(); }, x => { x.targets.push(clone(x.targets[0])); }, x => { x.targets[1].target = x.targets[0].target; },
    x => { x.targets[1].asset_id = x.targets[0].asset_id; }, x => { x.targets[0].asset_id = '1/../../x'; },
    x => { x.targets[0].name = '../macos-arm64-core.tar'; }, x => { x.targets[0].bytes = MAX_ARCHIVE_BYTES + 512; },
    x => { x.targets[0].bytes = 0; }, x => { x.targets[0].bytes++; }, x => { x.targets[0].bytes = Infinity; },
    x => { x.targets[0].sha256 = 'F'.repeat(64); }, x => { x.targets[0].approved_artifact_sha256 = 'bad'; },
    x => { x.url = 'https://evil/'; }, x => { x.targets[0].url = 'https://evil/'; },
    x => { x.targets.extra = true; }, x => { delete x.targets[0]; },
    x => { Object.setPrototypeOf(x.release, { other: true }); }, x => { x[Symbol('extra')] = true; }
  ];
  lockMutations.forEach((mutate, index) => test(`closed lock refuses mutation ${index + 1}`, () => {
    const model = fixture(); mutate(model.lock); assert.throws(() => validateMacCoreTransportLock(model.lock), invalid);
  }));
  test('lock and metadata getters are rejected without evaluation', () => {
    const model = fixture(); let invoked = 0;
    Object.defineProperty(model.lock.release, 'id', { enumerable: true, get() { invoked++; return '9001'; } });
    assert.throws(() => validateMacCoreTransportLock(model.lock), invalid);
    const other = fixture(); Object.defineProperty(other.assets[0], 'size', { enumerable: true, get() { invoked++; return 1; } });
    assert.throws(() => verifyMacCoreAssetMetadata(other.lock, 'macos-arm64', other.assets[0]), invalid);
    assert.equal(invoked, 0);
  });
  for (const target of ['macos-arm64', 'macos-x64']) test(`published release/asset/TAR canonical approval: ${target}`, () => {
    const model = fixture(), index = target === 'macos-arm64' ? 0 : 1;
    verifyMacCoreReleaseMetadata(model.lock, target, model.release);
    verifyMacCoreAssetMetadata(model.lock, target, model.assets[index]);
    const proof = verifyMacCoreTransportBytes(model.lock, target, model.buffers[target], model.policy);
    assert.equal(proof.approved_artifact_sha256, model.lock.targets[index].approved_artifact_sha256);
    assert.equal(proof.provenance_sha256, model.artifacts[target].build.provenance_sha256);
  });
  for (const [key, value] of [['id', 9002], ['tag_name', 'latest'], ['draft', true], ['prerelease', false],
    ['target_commitish', 'main'], ['target_commitish', 'a'.repeat(40)], ['assets', []]]) test(`release refuses ${key}:${String(value)}`, () => {
    const model = fixture(); model.release[key] = value;
    assert.throws(() => verifyMacCoreReleaseMetadata(model.lock, 'macos-arm64', model.release), invalid);
  });
  test('release refuses duplicate selected asset', () => {
    const model = fixture(); model.release.assets.push(clone(model.assets[0]));
    assert.throws(() => verifyMacCoreReleaseMetadata(model.lock, 'macos-arm64', model.release), invalid);
  });
  for (const [key, value] of [['id', 999], ['name', 'macos-x64-core.tar'], ['state', 'new'], ['size', 1024],
    ['digest', null], ['digest', 'sha256:' + '0'.repeat(64)]]) test(`asset refuses ${key} mismatch`, () => {
    const model = fixture(); model.assets[0][key] = value;
    assert.throws(() => verifyMacCoreAssetMetadata(model.lock, 'macos-arm64', model.assets[0]), invalid);
  });
  test('metadata refuses unsafe numeric IDs and unknown targets', () => {
    const model = fixture(); model.assets[0].id = Number.MAX_SAFE_INTEGER + 1;
    assert.throws(() => verifyMacCoreAssetMetadata(model.lock, 'macos-arm64', model.assets[0]), invalid);
    assert.throws(() => verifyMacCoreAssetMetadata(model.lock, 'linux-x64', model.assets[1]), invalid);
  });
  for (const mutate of [bytes => bytes.subarray(0, -1), bytes => Buffer.concat([bytes, Buffer.from('x')]),
    bytes => { const copy = Buffer.from(bytes); copy[0] ^= 1; return copy; },
    () => Buffer.from('{"message":"Not Found"}'), () => Buffer.from('<html>login</html>')]) test('incomplete/error/changed binary cannot reach TAR approval', () => {
    const model = fixture(); assert.throws(() => verifyMacCoreTransportBytes(model.lock, 'macos-arm64', mutate(model.buffers['macos-arm64']), model.policy), invalid);
  });
  test('a matching transport hash cannot approve corrupt TAR or unapproved metadata', () => {
    const model = fixture(); model.buffers['macos-arm64'][0] ^= 1;
    model.lock.targets[0].sha256 = sha(model.buffers['macos-arm64']);
    assert.throws(() => verifyMacCoreTransportBytes(model.lock, 'macos-arm64', model.buffers['macos-arm64'], model.policy), invalid);
    const other = fixture(); other.policy.approved_artifacts = [];
    assert.throws(() => verifyMacCoreTransportBytes(other.lock, 'macos-arm64', other.buffers['macos-arm64'], other.policy), invalid);
  });
  test('canonical approved metadata cannot be replaced by an arbitrary lock hash', () => {
    const model = fixture(); model.lock.targets[0].approved_artifact_sha256 = '1'.repeat(64);
    assert.throws(() => verifyMacCoreTransportBytes(model.lock, 'macos-arm64', model.buffers['macos-arm64'], model.policy), invalid);
  });
  for (const target of ['macos-arm64', 'macos-x64']) test(`fresh directory is created only after complete successful verification: ${target}`, () => {
    const item = scenario(); item.args.target = target;
    const result = item.run(); assert.equal(result.artifact_approved, false);
    assert.ok(fs.readFileSync(result.archive).equals(item.buffers[target]));
    const receipt = JSON.parse(fs.readFileSync(result.receipt));
    assert.equal(receipt.original_producer.run_id, CORE_ORIGINAL_PRODUCER_RUN);
    assert.equal(receipt.transport.release_id, '9001'); assert.equal(receipt.existing_artifact_policy_verified, true);
    assert.equal(receipt.artifact_approved, false); assert.equal(receipt.core_sha256, item.artifacts[target].core.sha256);
    assert.equal(fs.existsSync(path.join(item.repository, 'dist')), false, 'download does not import');
    assert.equal(item.calls.length, 4); assert.equal(item.calls[3].maximum, item.lock.targets.find(x => x.target === target).bytes);
  });
  for (const key of ['originalProducerRunId', 'originalProducerSourceSha']) test(`original dispatch binding required before network: ${key}`, () => {
    const item = scenario(); item.args[key] = undefined; absentAfterFailure(item); assert.equal(item.calls.length, 0);
  });
  test('unknown invocation options and relative output are refused', () => {
    const item = scenario(); item.args.url = 'https://evil/'; absentAfterFailure(item); assert.equal(item.calls.length, 0);
    delete item.args.url; item.args.outputDirectory = 'relative'; assert.throws(() => item.run(), invalid);
  });
  for (const kind of ['empty', 'truncated', 'hash', 'api-error', 'promise']) test(`download failure ${kind} creates no output directory`, () => {
    const item = scenario(), api = item.api;
    item.args.api = (endpoint, options) => {
      if (!options.binary) return api(endpoint, options);
      if (kind === 'empty') return Buffer.alloc(0);
      if (kind === 'truncated') return item.buffers['macos-arm64'].subarray(0, -1);
      if (kind === 'hash') { const bytes=Buffer.from(item.buffers['macos-arm64']); bytes[0]^=1; return bytes; }
      if (kind === 'promise') return Promise.resolve(Buffer.from('bad'));
      throw Error('TOKEN_OR_SERVER_BODY_MUST_NOT_LEAK');
    };
    absentAfterFailure(item);
  });
  for (const type of ['wrong-ref', 'wrong-commit', 'blob', 'tag-cycle', 'wrong-tag-object']) test(`tag source binding refuses ${type}`, () => {
    const item = scenario(), api = item.api, tagSha = 'a'.repeat(40);
    item.args.api = (endpoint, options) => {
      if (endpoint.includes('/git/ref/')) return Buffer.from(JSON.stringify({ ref: type === 'wrong-ref' ? 'refs/tags/latest' : `refs/tags/${CORE_TRANSPORT_TAG}`,
        object: { type: type.startsWith('tag') || type === 'wrong-tag-object' ? 'tag' : type === 'blob' ? 'blob' : 'commit',
          sha: type.startsWith('tag') || type === 'wrong-tag-object' ? tagSha : 'b'.repeat(40) } }));
      if (endpoint.includes('/git/tags/')) return Buffer.from(JSON.stringify({ sha: type === 'wrong-tag-object' ? 'c'.repeat(40) : tagSha,
        object: { type: 'tag', sha: tagSha } }));
      return api(endpoint, options);
    }; absentAfterFailure(item);
  });
  test('bounded annotated tag can resolve to the exact original source', () => {
    const item = scenario(), api = item.api, tagSha = 'a'.repeat(40);
    item.args.api = (endpoint, options) => {
      if (endpoint.includes('/git/ref/')) return Buffer.from(JSON.stringify({ ref:`refs/tags/${CORE_TRANSPORT_TAG}`,object:{type:'tag',sha:tagSha} }));
      if (endpoint.includes('/git/tags/')) return Buffer.from(JSON.stringify({ sha:tagSha, object:{type:'commit',sha:CORE_ORIGINAL_PRODUCER_SOURCE} }));
      return api(endpoint, options);
    }; assert.equal(item.run().ok, true);
  });
  test('existing empty or populated destination is never adopted or overwritten', () => {
    for (const populated of [false, true]) {
      const item = scenario(); fs.mkdirSync(item.outputDirectory);
      if (populated) fs.writeFileSync(path.join(item.outputDirectory, 'KEEP'), 'original');
      assert.throws(() => item.run(), invalid); assert.equal(item.calls.length, 0);
      if (populated) assert.equal(fs.readFileSync(path.join(item.outputDirectory, 'KEEP'), 'utf8'), 'original');
    }
  });
  for (const file of ['lockFile', 'localPolicy']) test(`source ${file} changed during HTTP is refused before directory creation`, () => {
    const item = scenario(), api = item.api;
    item.args.api = (endpoint, options) => { const value = api(endpoint, options); if (options.binary) fs.appendFileSync(item[file], '\n'); return value; };
    absentAfterFailure(item);
  });
  test('hardlinked source lock is refused before HTTP or namespace mutation', () => {
    const item = scenario(); fs.linkSync(item.lockFile, path.join(item.base, 'lock-link.json'));
    absentAfterFailure(item); assert.equal(item.calls.length, 0);
  });
  test('redirected output namespace through a junction/symlink is refused', () => {
    const item = scenario(), outside = path.join(item.base, 'outside'), link = path.join(item.base, 'linked');
    fs.mkdirSync(outside); fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    item.args.outputDirectory = path.join(link, 'download'); assert.throws(() => item.run(), invalid); assert.deepEqual(fs.readdirSync(outside), []);
  });
  test('gh adapter uses only GET/fixed host/closed endpoint and bounded binary buffers', () => {
    const calls = [];
    const reader = createGitHubCoreApiReader((command, args, options) => { calls.push({command,args,options}); return {status:0,stdout:Buffer.from('ok')}; });
    assert.equal(reader(prefix + 'releases/assets/101', {binary:true,maximum:1024}).toString(), 'ok');
    assert.equal(calls[0].command, 'gh'); assert.ok(calls[0].args.includes('GET')); assert.ok(calls[0].args.includes('github.com'));
    assert.equal(calls[0].options.shell, false); assert.equal(calls[0].options.windowsHide, true); assert.equal(calls[0].options.maxBuffer, 1024);
    assert.equal(calls[0].options.env.GH_DEBUG, undefined);
    for (const endpoint of ['https://evil/', 'repos/evil/repo/releases/1', prefix+'releases/latest', prefix+'releases/assets/1?x=y', prefix+'releases/assets/../1'])
      assert.throws(() => reader(endpoint), invalid);
    assert.throws(() => reader(prefix+'releases/1', {binary:true}), invalid);
    assert.throws(() => reader(prefix+'releases/assets/1', {binary:true,maximum:MAX_ARCHIVE_BYTES+1}), invalid);
    assert.equal(calls.length, 1);
  });
  test('gh errors/overflow expose no raw vendor text or credentials', () => {
    for (const result of [{status:1,stdout:Buffer.from('secret'),stderr:Buffer.from('TOKEN')},
      {status:0,stdout:Buffer.alloc(1025)}, {status:0,stdout:Buffer.alloc(0)}, {status:0,error:Error('TOKEN')}]) {
      const reader = createGitHubCoreApiReader(() => result);
      assert.throws(() => reader(prefix+'releases/assets/101',{binary:true,maximum:1024}), error => error.message === 'MACOS_CORE_TRANSPORT_DOWNLOAD_FAILED' && error.cause === undefined);
    }
  });
  test('CLI refuses URL overrides and missing original-producer bindings without network', () => {
    const cli = path.join(root, 'scripts/download-approved-macos-core.mjs');
    for (const args of [['--url','https://evil/'], ['--target','macos-arm64','--output',path.join(temporary,'cli-output')]]) {
      const env = {...process.env,CORE_CANDIDATE_RUN_ID:'0',CORE_CANDIDATE_SOURCE_SHA:CORE_ORIGINAL_PRODUCER_SOURCE};
      const result = spawnSync(process.execPath, [cli,...args], {encoding:'utf8',env,windowsHide:true,timeout:5000,maxBuffer:8192});
      assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'MACOS_CORE_TRANSPORT_FAILED\n');
      assert.equal(fs.existsSync(path.join(temporary,'cli-output')), false);
    }
  });
  assert.ok(fs.readFileSync(policyFile).equals(actualPolicyBytes));
  process.stdout.write(`PASS: ${passed} Mac Core transport scenarios; no network, import, native execution, reseal or approval\n`);
} finally {
  assert.equal(path.dirname(temporary), temporaryParent);
  assert.ok(path.basename(temporary).startsWith('datasecure-core-transport-test-'));
  fs.rmSync(temporary, {recursive:true});
}
