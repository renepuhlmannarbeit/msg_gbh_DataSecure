'use strict';
// REAL Darwin fixture only. The supplied API is the candidate Core's linked
// binding; no addon, platform model, sudo or existing profile ACL is repaired.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function runNativeMacOwnershipAclCases(api) {
  assert.equal(process.platform, 'darwin');
  assert.equal(process.version, 'v22.23.2');
  assert.ok(['arm64', 'x64'].includes(process.arch) && process.geteuid() !== 0);
  assert.equal(api.abi, 1);
  for (const key of ['createRoot', 'tryAcquire', 'assertHeld', 'release', 'closeRoot'])
    assert.equal(typeof api[key], 'function');
  const parent = fs.realpathSync.native(os.tmpdir());
  const scope = fs.mkdtempSync(path.join(parent, 'datasecure-macos-acl-native-'));
  const directories = new Map(), anchors = new Map();
  const identity = stat => [stat.dev, stat.ino, stat.birthtimeNs];
  function register(directory) {
    const stat = fs.lstatSync(directory, { bigint: true });
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === BigInt(process.geteuid()));
    assert.equal(stat.mode & 0o777n, 0o700n);
    assert.equal(fs.realpathSync.native(directory), directory);
    directories.set(directory, identity(stat));
  }
  function unchanged(directory) {
    assert.ok(directories.has(directory), 'only exclusive directories created in this invocation');
    const stat = fs.lstatSync(directory, { bigint: true });
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === BigInt(process.geteuid()));
    assert.deepEqual(identity(stat), directories.get(directory));
    assert.equal(fs.realpathSync.native(directory), directory);
  }
  register(scope);
  function setAcl(directory, entries = []) {
    unchanged(directory);
    // A newline is deliberately nonempty stdin containing zero ACEs. Apple's
    // chmod -E parses this as acl_init() with no entries, NOT chmod -N removal.
    execFileSync('/bin/chmod', ['-E', directory], { input: entries.join('\n') + '\n',
      shell: false, timeout: 1000, maxBuffer: 16 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
    unchanged(directory);
  }
  setAcl(scope);
  let cases = 0;
  function tree(parentEntries = [], leafEntries = []) {
    const ancestor = path.join(scope, `case-${cases++}`), leaf = path.join(ancestor, 'control');
    unchanged(scope);
    fs.mkdirSync(ancestor, { mode: 0o700 }); register(ancestor);
    fs.mkdirSync(leaf, { mode: 0o700 }); register(leaf);
    // Both objects predate ACL setup: no inherited grant is mistaken for the
    // private-ACE counterexample, and all mutations target new owned fixtures.
    setAcl(leaf, leafEntries); setAcl(ancestor, parentEntries);
    unchanged(ancestor); fs.chmodSync(ancestor, 0o755); unchanged(ancestor);
    return leaf;
  }
  function accepted(leaf) {
    let root, guard;
    try {
      root = api.createRoot(leaf); guard = api.tryAcquire(root); assert.ok(guard);
      assert.equal(api.assertHeld(guard), true);
    } finally {
      try { if (guard) { const value = guard; guard = null; assert.equal(api.release(value), true); } }
      finally { if (root) { const value = root; root = null; assert.equal(api.closeRoot(value), true); } }
    }
    const anchor = path.join(leaf, 'ownership-control.lock'), stat = fs.lstatSync(anchor, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size === 0n &&
      stat.uid === BigInt(process.geteuid()) && (stat.mode & 0o077n) === 0n);
    anchors.set(anchor, identity(stat));
  }
  function refused(leaf) {
    assert.throws(() => api.createRoot(leaf), { code: 'OWNERSHIP_GUARD_UNSAFE' });
    assert.deepEqual(fs.readdirSync(leaf), [], 'no anchor before ACL refusal');
  }
  // These calls exercise the actual C loaded in this Core, not JS policy mocks.
  accepted(tree()); // explicitly present, empty private/ancestor ACLs
  accepted(tree(['everyone deny delete']));
  refused(tree(['everyone deny delete', 'everyone allow delete_child']));
  refused(tree(['everyone allow add_file']));
  refused(tree([], ['everyone allow list,search,readattr']));
  refused(tree([], ['everyone deny delete']));

  // Preflight EVERY known object before cleanup. No recursive traversal or
  // borrowed path; failures preserve the exclusive fixture for diagnosis.
  assert.equal(path.dirname(scope), parent);
  assert.match(path.basename(scope), /^datasecure-macos-acl-native-/u);
  for (const directory of directories.keys()) {
    unchanged(directory);
    const expected = [...directories.keys(), ...anchors.keys()]
      .filter(value => value !== scope && path.dirname(value) === directory).map(value => path.basename(value)).sort();
    assert.deepEqual(fs.readdirSync(directory).sort(), expected);
  }
  for (const [anchor, expected] of anchors) {
    const stat = fs.lstatSync(anchor, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size === 0n);
    assert.deepEqual(identity(stat), expected);
  }
  // Clear only ACLs this function installed on its own exclusive directories;
  // DENY DELETE fixtures otherwise intentionally prevent their own removal.
  for (const directory of directories.keys()) setAcl(directory);
  for (const [anchor, expected] of anchors) {
    unchanged(path.dirname(anchor));
    const stat = fs.lstatSync(anchor, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size === 0n);
    assert.deepEqual(identity(stat), expected); fs.unlinkSync(anchor);
  }
  for (const directory of [...directories.keys()].reverse()) {
    unchanged(directory); assert.deepEqual(fs.readdirSync(directory), []); fs.rmdirSync(directory);
  }
  return { cases, empty_private_acl: true, benign_home_ancestor: true,
    additional_mutation_grants_refused: true, private_aces_refused: true, fixture_cleanup_confirmed: true };
}
module.exports = { runNativeMacOwnershipAclCases };
// Producer invocation: FINAL signed candidate Core <this-file>. The converter
// cannot pass: it has no such linked binding. Consumer also invokes this exact
// fixture via its approved, source-bound packaged-Core participant.
if (require.main === module) {
  assert.equal(process.platform, 'darwin');
  console.log(JSON.stringify(runNativeMacOwnershipAclCases(process._linkedBinding('datasecure_ownership_guard'))));
}
