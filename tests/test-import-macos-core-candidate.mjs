import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseMacCoreCandidateTar, importMacCoreCandidate, MAX_ARCHIVE_BYTES } from '../scripts/import-macos-core-candidate.mjs';
import { canonicalBytes, validateMacCoreArtifact } from '../scripts/lib/macos-core-artifact.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyFile = path.join(repository, 'native/runtime/standalone-macos-core.json');
const policyBytes = fs.readFileSync(policyFile), policy = JSON.parse(policyBytes);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const temporaryParent = fs.realpathSync.native(os.tmpdir());
const temporary = fs.mkdtempSync(path.join(temporaryParent, 'datasecure-core-import-'));
const invalid = error => /(?:STANDALONE_MACOS_CORE_IMPORT_INVALID|BOUND_FILE_|MACOS_NATIVE_)/u.test(error?.message || '');
let passed = 0;
function test(name, action) { action(); passed++; }

function fixture(target = 'macos-arm64') {
  const core = Buffer.alloc(96);
  core.writeUInt32LE(0xfeedfacf, 0); core.writeUInt32LE(target.endsWith('arm64') ? 0x0100000c : 0x01000007, 4);
  core.writeUInt32LE(2, 12); core.writeUInt32LE(2, 16); core.writeUInt32LE(40, 20);
  core.writeUInt32LE(0x32, 32); core.writeUInt32LE(24, 36); core.writeUInt32LE(1, 40);
  core.writeUInt32LE(0x0d0500, 44); core.writeUInt32LE(0x0d0500, 48);
  core.writeUInt32LE(0x1d, 56); core.writeUInt32LE(16, 60); core.writeUInt32LE(72, 64); core.writeUInt32LE(24, 68);
  const license = Buffer.from('Synthetic Node license for import regression\n');
  const provenance = { schema: 'datasecure-macos-static-core-build-provenance/2', target };
  const artifact = { schema: 'datasecure-macos-static-core-artifact/1', role: 'mutating-core', target,
    rust_target: target.endsWith('arm64') ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin', node_version: '22.23.2',
    upstream: policy.upstream, static_binding: policy.static_binding,
    inputs: { guard_c_sha256: policy.guard_source_sha256, adapter_cc_sha256: digest('cc'),
      adapter_h_sha256: digest('h'), transform_sha256: digest('transform') },
    build: { provenance_file: 'BUILD-PROVENANCE.json', provenance_sha256: digest(canonicalBytes(provenance)) },
    core: { file: 'datasecure-core', bytes: core.length, sha256: digest(core), unsigned_sha256: digest('unsigned fixture') },
    converter: { archive_sha256: digest('official archive fixture'), bytes: 80, sha256: digest('official converter fixture'),
      license_sha256: digest(license) },
    license: { file: 'LICENSE.node.txt', bytes: license.length, sha256: digest(license) },
    signing: { identity: '-', hardened_runtime: true, entitlements: { 'com.apple.security.cs.allow-jit': true } } };
  const rows = [
    { name: 'datasecure-core', bytes: core, mode: 0o700 },
    { name: 'FINAL-CORE.json', bytes: canonicalBytes(artifact), mode: 0o600 },
    { name: 'BUILD-PROVENANCE.json', bytes: canonicalBytes(provenance), mode: 0o600 },
    { name: 'LICENSE.node.txt', bytes: license, mode: 0o600 }
  ];
  return { target, rows, artifact, provenance };
}
function number(header, offset, length, value) {
  header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}
function tar(rows, options = {}) {
  const blocks = [];
  for (const row of rows) {
    const header = Buffer.alloc(512);
    header.write(row.name, 0, 100, 'ascii');
    number(header, 100, 8, row.mode); number(header, 108, 8, 0); number(header, 116, 8, 0);
    number(header, 124, 12, row.declaredSize ?? row.bytes.length); number(header, 136, 12, 0);
    header[156] = row.type === undefined ? 48 : row.type.charCodeAt(0);
    if (row.link) header.write(row.link, 157, 100, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
    if (row.prefix) header.write(row.prefix, 345, 155, 'ascii');
    row.mutateHeader?.(header);
    header.fill(32, 148, 156);
    const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(options.oneEndBlock ? 512 : 1024));
  return Buffer.concat(blocks);
}
function rejects(change) {
  const model = fixture(); change(model);
  assert.throws(() => parseMacCoreCandidateTar(tar(model.rows), model.target), invalid);
}
function scenario(name) {
  const root = path.join(temporary, name), input = path.join(root, 'input'), checkout = path.join(root, 'repository');
  fs.mkdirSync(input, { recursive: true }); fs.mkdirSync(checkout);
  const model = fixture(), archive = path.join(input, `${model.target}-core.tar`);
  fs.writeFileSync(archive, tar(model.rows));
  return { root, input, checkout, model, archive,
    import() { return importMacCoreCandidate({ repository: checkout, inputDirectory: input, target: model.target }); } };
}

try {
  for (const target of ['macos-arm64', 'macos-x64']) test(`four bounded regular files: ${target}`, () => {
    const model = fixture(target), bytes = tar(model.rows), files = parseMacCoreCandidateTar(bytes, target);
    assert.equal(files.size, 4); assert.ok(bytes.length < MAX_ARCHIVE_BYTES);
    for (const row of model.rows) assert.ok(files.get(row.name).equals(row.bytes));
  });
  test('ordinary read-only shared modes are normalized on import', () => {
    const model = fixture(); model.rows[0].mode = 0o755;
    for (const row of model.rows.slice(1)) row.mode = 0o644;
    assert.equal(parseMacCoreCandidateTar(tar(model.rows), model.target).size, 4);
  });
  for (const type of ['1', '2', '3', '4', '5', '6', 'x', 'g', 'L', 'K', 'S'])
    test(`refuse nonregular/extension type ${type}`, () => rejects(model => { model.rows[0].type = type; }));
  for (const name of ['../datasecure-core', '/datasecure-core', './datasecure-core', 'sub/datasecure-core',
    'datasecure-core/..', 'C:\\datasecure-core', 'unexpected', 'DATASECURE-CORE'])
    test(`refuse a non-exact name ${name}`, () => rejects(model => { model.rows[0].name = name; }));
  test('refuse name prefix traversal', () => rejects(model => { model.rows[0].prefix = '../'; }));
  test('refuse a linkname even on a regular entry', () => rejects(model => { model.rows[0].link = 'other'; }));
  test('refuse duplicate entries', () => rejects(model => { model.rows[3] = model.rows[0]; }));
  test('refuse fifth entries', () => rejects(model => { model.rows.push({ name: 'extra', bytes: Buffer.from('x'), mode: 0o600 }); }));
  test('refuse missing entries', () => rejects(model => { model.rows.pop(); }));
  for (const mode of [0o4755, 0o2755, 0o1777, 0o777, 0o600])
    test(`refuse Core mode ${mode.toString(8)}`, () => rejects(model => { model.rows[0].mode = mode; }));
  test('refuse writable metadata', () => rejects(model => { model.rows[1].mode = 0o666; }));
  test('refuse base-256 numeric fields', () => rejects(model => { model.rows[0].mutateHeader = header => { header[124] |= 0x80; }; }));
  test('refuse high-bit aliases of the USTAR magic', () => rejects(model => { model.rows[0].mutateHeader = header => { header[257] |= 0x80; }; }));
  test('refuse unsafe declared size without allocating it', () => rejects(model => { model.rows[0].declaredSize = MAX_ARCHIVE_BYTES; }));
  test('refuse checksum corruption', () => {
    const model = fixture(), bytes = tar(model.rows); bytes[148] ^= 1;
    assert.throws(() => parseMacCoreCandidateTar(bytes, model.target), invalid);
  });
  test('require two final zero blocks', () => {
    const model = fixture(); assert.throws(() => parseMacCoreCandidateTar(tar(model.rows, { oneEndBlock: true }), model.target), invalid);
  });
  test('refuse data after archive terminator', () => {
    const model = fixture(), bytes = tar(model.rows); bytes[bytes.length - 1] = 1;
    assert.throws(() => parseMacCoreCandidateTar(bytes, model.target), invalid);
  });
  for (const mutate of [
    model => { model.rows[0].bytes[90] ^= 1; },
    model => { model.rows[1].bytes = Buffer.from('{}'); },
    model => { model.rows[1].bytes = Buffer.from('{broken'); },
    model => { model.rows[2].bytes = Buffer.from('{}'); },
    model => { model.rows[3].bytes = Buffer.from('different license'); },
    model => { model.target = 'macos-x64'; },
    model => { model.target = 'linux-x64'; }
  ]) test('refuse mismatching candidate content or target', () => rejects(mutate));
  test('new destination contains four independent regular files; no approval is minted', () => {
    const item = scenario('new-target');
    assert.deepEqual(item.import(), { ok: true, target: item.model.target, files: 4, artifact_approved: false });
    const destination = path.join(item.checkout, 'dist/macos-static-core', item.model.target);
    assert.deepEqual(fs.readdirSync(destination).sort(), item.model.rows.map(row => row.name).sort());
    for (const row of item.model.rows) {
      const file = path.join(destination, row.name), stat = fs.lstatSync(file);
      assert.ok(stat.isFile()); assert.ok(!stat.isSymbolicLink()); assert.equal(stat.nlink, 1);
      assert.ok(fs.readFileSync(file).equals(row.bytes));
      if (process.platform !== 'win32') assert.equal(stat.mode & 0o7777, row.name === 'datasecure-core' ? 0o700 : 0o600);
    }
    assert.throws(() => item.import(), error => error.code === 'EEXIST');
    // Consistent transport bytes are still insufficient: only the independent
    // verifier and committed approved_artifacts can authorize a real Core.
    assert.throws(() => validateMacCoreArtifact(item.model.artifact, { ...policy, approved_artifacts: [] }, item.model.target),
      /STANDALONE_MACOS_STATIC_CORE_INVALID/u);
    assert.ok(fs.readFileSync(policyFile).equals(policyBytes));
  });
  test('independent-review records are never imported or read as Core inputs', () => {
    const item = scenario('extra-download'); fs.writeFileSync(path.join(item.input, 'other.txt'), 'extra');
    assert.equal(item.import().files, 4);
    assert.equal(fs.existsSync(path.join(item.checkout, 'dist/macos-static-core', item.model.target, 'other.txt')), false);
    assert.equal(fs.readFileSync(path.join(item.input, 'other.txt'), 'utf8'), 'extra');
  });
  test('a wrong archive basename is never discovered through a scan', () => {
    const item = scenario('wrong-download'); fs.renameSync(item.archive, path.join(item.input, 'other-core.tar'));
    assert.throws(() => item.import(), error => error.code === 'ENOENT');
    assert.equal(fs.existsSync(path.join(item.checkout, 'dist')), false);
  });
  test('refuse hardlinked input archives', () => {
    const item = scenario('linked-download'); fs.linkSync(item.archive, path.join(item.root, 'outside.tar'));
    assert.throws(() => item.import(), invalid); assert.equal(fs.existsSync(path.join(item.checkout, 'dist')), false);
  });
  test('refuse replacement namespaces through a link or junction', () => {
    const item = scenario('linked-output'), outside = path.join(item.root, 'outside'); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(item.checkout, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => item.import(), invalid); assert.deepEqual(fs.readdirSync(outside), []);
  });
  test('malformed archives create no output namespace', () => {
    const item = scenario('malformed'); fs.writeFileSync(item.archive, Buffer.from('bad tar'));
    assert.throws(() => item.import(), invalid); assert.equal(fs.existsSync(path.join(item.checkout, 'dist')), false);
  });
  process.stdout.write(`PASS: ${passed} Core candidate import and refusal scenarios; no artifact approval or native execution\n`);
} finally {
  assert.equal(path.dirname(temporary), temporaryParent);
  assert.ok(path.basename(temporary).startsWith('datasecure-core-import-'));
  fs.rmSync(temporary, { recursive: true });
}
