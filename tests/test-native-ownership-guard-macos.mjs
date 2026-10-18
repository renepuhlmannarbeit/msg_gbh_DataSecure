// Explicit REAL macOS gate. No emulated platform, sudo, account creation,
// GUI, package acceptance or mutation of the supplied cross-account fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin' || process.version !== 'v22.23.2' || process.geteuid() === 0)
  throw Error('Requires real macOS, bundled Node 22.23.2 and an ordinary account');
if (process.argv.length !== 5 || process.argv[3] !== '--foreign-root')
  throw Error('Pass build-manifest.json --foreign-root /private/tmp/ds-ownership-guard-crossuid-<nonce>/control');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const artifact = manifest.verified_artifact;
assert.equal(manifest.source_sha256, crypto.createHash('sha256').update(
  fs.readFileSync(path.join(repo, 'native/ownership-guard/ownership-guard.c'))).digest('hex'), 'build must cover current C source');
assert.equal(artifact.target, `macos-${process.arch}`);
const require = createRequire(import.meta.url);
const { createOwnershipGuard } = require('../plugins/data-secure/server/core/native-ownership-guard');
const foreignRoot = path.resolve(process.argv[4]), foreignParent = path.dirname(foreignRoot);
assert.match(foreignParent, /^\/private\/tmp\/ds-ownership-guard-crossuid-[A-Za-z0-9_-]{6,80}$/u);
assert.equal(path.basename(foreignRoot), 'control');
assert.equal(fs.realpathSync(foreignRoot), foreignRoot);
const foreign = fs.lstatSync(foreignParent), foreignLeaf = fs.lstatSync(foreignRoot);
assert.ok(foreign.isDirectory() && !foreign.isSymbolicLink() && foreign.uid !== 0 && foreign.uid !== process.geteuid());
assert.equal(foreign.mode & 0o022, 0, 'use a foreign-owned 0755 parent, not just a currently broad mode');
assert.ok(foreignLeaf.isDirectory() && !foreignLeaf.isSymbolicLink() && foreignLeaf.uid === process.geteuid());
assert.equal(foreignLeaf.mode & 0o777, 0o700);
assert.deepEqual(fs.readdirSync(foreignRoot), [], 'supplied fixture must be empty');

const tmp = fs.lstatSync('/private/tmp');
assert.ok(tmp.isDirectory() && !tmp.isSymbolicLink() && tmp.uid === 0 && (tmp.mode & 0o1000) !== 0);
const scope = fs.realpathSync(fs.mkdtempSync('/private/tmp/ds-ownership-guard-macos-'));
const initial = fs.lstatSync(scope, { bigint: true }), directories = [], capabilities = [];
let checks = 0;
function chmod(argv) {
  cp.execFileSync('/bin/chmod', argv, { shell: false, timeout: 5_000, maxBuffer: 64 * 1024, stdio: 'pipe' });
}
function newTree(mode = 0o755, acl) {
  const parent = path.join(scope, `parent-${directories.length}`), root = path.join(parent, 'control');
  fs.mkdirSync(parent, { mode: 0o700 }); directories.push([parent, fs.lstatSync(parent, { bigint: true })]);
  fs.mkdirSync(root, { mode: 0o700 }); directories.push([root, fs.lstatSync(root, { bigint: true })]);
  fs.chmodSync(parent, mode); if (acl) chmod(['+a', acl, parent]);
  return { parent, root };
}
function factory(root) {
  const value = createOwnershipGuard({ root, verifiedArtifact: artifact }); capabilities.push(value); return value;
}
function accepted(root) {
  const owner = factory(root), held = owner.tryAcquire(); assert.ok(held); capabilities.push(held);
  assert.equal(held.assertHeld(), true); assert.equal(held.release(), true); assert.equal(owner.close(), true);
}
function refused(root) {
  assert.throws(() => factory(root), { code: 'OWNERSHIP_GUARD_UNSAFE' });
  assert.deepEqual(fs.readdirSync(root), [], 'rejection must precede permanent-anchor creation');
}
function test(name, run) {
  try { run(); checks++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
try {
  // Construct/modify only fresh, recorded fixtures. Production never repairs ACLs.
  chmod(['-N', scope]);
  test('root-owned sticky /private/tmp protects our own private child', () => accepted(scope));
  test('foreign-owned nonwritable ancestor is refused without touching it', () => refused(foreignRoot));
  test('private leaf under trusted 0755 parent', () => accepted(newTree().root));
  test('Home everyone deny delete is harmless on an ancestor', () => accepted(newTree(0o755, 'everyone deny delete').root));
  test('known readonly ALLOW on ancestor', () => accepted(newTree(0o755, 'everyone allow list,search,readattr,readextattr,readsecurity').root));
  test('group-writable ancestor cannot hide behind private leaf', () => refused(newTree(0o775).root));
  test('world-writable nonsticky ancestor cannot hide behind private leaf', () => refused(newTree(0o777).root));
  test('non-immediate writable ancestor is also refused', () => {
    const value = newTree(0o777), nested = path.join(value.root, 'nested');
    fs.mkdirSync(nested, { mode: 0o700 }); directories.push([nested, fs.lstatSync(nested, { bigint: true })]); refused(nested);
  });
  test('trusted sticky ancestor with owned child', () => accepted(newTree(0o1777).root));
  for (const right of ['add_file', 'add_subdirectory', 'delete_child', 'delete', 'writeattr', 'writeextattr', 'writesecurity', 'chown'])
    test(`ancestor mutation ALLOW ${right}`, () => refused(newTree(0o755, `everyone allow ${right}`).root));
  for (const right of ['delete_child', 'writesecurity'])
    test(`sticky is not an ACL bypass for ${right}`, () => refused(newTree(0o1777, `everyone allow ${right}`).root));
  test('leaf ACL contract is NOT relaxed to ancestor rules', () => {
    const value = newTree(); chmod(['+a', 'everyone deny delete', value.root]); refused(value.root);
  });
  test('permission drift before acquire is rejected before anchor creation', () => {
    const value = newTree(), owner = factory(value.root); fs.chmodSync(value.parent, 0o777);
    assert.throws(() => owner.tryAcquire(), { code: 'OWNERSHIP_GUARD_UNSAFE' });
    assert.deepEqual(fs.readdirSync(value.root), []);
  });
  test('permission drift with same inode is rejected while held', () => {
    const value = newTree(), owner = factory(value.root), held = owner.tryAcquire(); assert.ok(held); capabilities.push(held);
    const before = fs.lstatSync(value.parent, { bigint: true }); fs.chmodSync(value.parent, 0o777);
    assert.equal(fs.lstatSync(value.parent, { bigint: true }).ino, before.ino);
    assert.throws(() => held.assertHeld(), { code: 'OWNERSHIP_GUARD_UNSAFE' });
    assert.equal(held.release(), true);
  });
  test('ACL drift with same inode is rejected while held', () => {
    const value = newTree(), owner = factory(value.root), held = owner.tryAcquire(); assert.ok(held); capabilities.push(held);
    chmod(['+a', 'everyone allow delete_child', value.parent]);
    assert.throws(() => held.assertHeld(), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assert.equal(held.release(), true);
  });
} finally {
  for (const value of capabilities.slice().reverse()) {
    if (typeof value.release === 'function') value.release(); else value.close();
  }
  // Recorded exact identities only; no recursive delete and no symlink traversal.
  for (const [directory, before] of directories.slice().reverse()) {
    assert.ok(path.relative(scope, directory) && !path.relative(scope, directory).startsWith('..'));
    const current = fs.lstatSync(directory, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(current.dev, before.dev); assert.equal(current.ino, before.ino);
    chmod(['-N', directory]); fs.chmodSync(directory, 0o700);
    const entries = fs.readdirSync(directory);
    assert.ok(entries.length <= 1 && entries.every(name => name === 'ownership-control.lock'));
    for (const name of entries) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.geteuid()); fs.unlinkSync(file);
    }
    fs.rmdirSync(directory);
  }
  const current = fs.lstatSync(scope, { bigint: true });
  assert.equal(path.dirname(scope), '/private/tmp'); assert.match(path.basename(scope), /^ds-ownership-guard-macos-/u);
  assert.ok(current.isDirectory() && !current.isSymbolicLink()); assert.equal(current.dev, initial.dev); assert.equal(current.ino, initial.ino);
  const entries = fs.readdirSync(scope);
  assert.ok(entries.length <= 1 && entries.every(name => name === 'ownership-control.lock'));
  for (const name of entries) {
    const anchor = path.join(scope, name), stat = fs.lstatSync(anchor);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === process.geteuid()); fs.unlinkSync(anchor);
  }
  fs.rmdirSync(scope);
  assert.deepEqual(fs.readdirSync(foreignRoot), [], 'external cross-account fixture must remain untouched');
}
console.log(JSON.stringify({ schema: 'datasecure-native-ownership-guard-macos-test/1', checks,
  node: process.version, platform: process.platform, native_macos_execution: true,
  cross_account_fixture: true, package_acceptance: false, sha256: artifact.sha256 }));
