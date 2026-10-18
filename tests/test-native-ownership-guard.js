'use strict';
// Narrow native regression, run explicitly with bundled Node 22.23.2 and the
// manifest of a locally built test artifact. Not installed product trust input.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { createOwnershipGuard } = require('../plugins/data-secure/server/core/native-ownership-guard');
if (process.version !== 'v22.23.2' || !['win32', 'darwin'].includes(process.platform)) throw Error('Use bundled Node 22.23.2 on Windows/macOS');
if (process.argv.length !== 3) throw Error('Pass the explicit local test build-manifest.json');
const manifest = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const artifact = manifest.verified_artifact;
const helper = path.join(__dirname, 'helpers', 'native-ownership-guard-child.cjs');
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-ownership-guard-test-'));
const initial = fs.lstatSync(testRoot, { bigint: true });
// Test-owned namespace only. This host's TEMP deliberately grants write access
// to sandbox accounts; production must reject that ACL, not weaken its check.
if (process.platform === 'win32') {
  const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const account = cp.execFileSync(path.join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = account.match(/"(S-1-[0-9-]+)"/u)?.[1]; if (!sid) throw Error('Test account SID unavailable');
  cp.execFileSync(path.join(system, 'icacls.exe'), [testRoot, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`],
    { windowsHide: true, stdio: 'pipe' });
}
const participants = [], factories = [], guards = [], fixtures = [], links = [];
let sequence = 0, assertions = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
function fixture() {
  const dir = path.join(testRoot, `root-${fixtures.length}`); fs.mkdirSync(dir, { mode: 0o700 }); fixtures.push(dir); return dir;
}
function factory(root) { const value = createOwnershipGuard({ verifiedArtifact: artifact, root }); factories.push(value); return value; }
function take(value) { const guard = value.tryAcquire(); assert.ok(guard); guards.push(guard); return guard; }
function participant(thread = false) {
  const native = thread ? new Worker(helper) : cp.fork(helper, [], {
    execPath: process.execPath, execArgv: ['--expose-gc'], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: {}
  });
  const waiting = new Map(); let ended = false;
  const completed = new Promise(resolve => native.once(thread ? 'exit' : 'close', () => {
    ended = true; for (const { reject, timer } of waiting.values()) { clearTimeout(timer); reject(Error('participant exited')); }
    waiting.clear(); resolve();
  }));
  native.on('error', error => { for (const { reject, timer } of waiting.values()) { clearTimeout(timer); reject(error); } waiting.clear(); });
  native.on('message', message => {
    const pending = waiting.get(message.id); if (!pending) return;
    waiting.delete(message.id); clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.value); else pending.reject(Object.assign(Error(message.code), { code: message.code }));
  });
  if (!thread) native.stderr.on('data', () => {});
  const value = {
    request(command, fields = {}) {
      if (ended) return Promise.reject(Error('participant ended'));
      return new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { waiting.delete(id); reject(Error('participant deadline')); }, 10_000);
        waiting.set(id, { resolve, reject, timer });
        const message = { id, command, ...fields };
        if (thread) native.postMessage(message);
        else native.send(message, error => { if (error) { waiting.delete(id); clearTimeout(timer); reject(error); } });
      });
    },
    async stop() { if (!ended) { if (thread) await native.terminate(); else native.kill('SIGKILL'); } await completed; }
  };
  participants.push(value); return value;
}
async function initialize(participant, root) { check(await participant.request('initialize', { artifact, root }), { node: 'v22.23.2' }); }

(async () => {
  try {
    assert.throws(() => createOwnershipGuard(), { code: 'OWNERSHIP_GUARD_INVALID' }); assertions++;
    assert.throws(() => createOwnershipGuard({ root: testRoot, verifiedArtifact: { ...artifact, sha256: '0'.repeat(64) } }),
      { code: 'OWNERSHIP_GUARD_INTEGRITY_FAILED' }); assertions++;
    assert.throws(() => createOwnershipGuard({ root: testRoot, verifiedArtifact: { ...artifact, abi: 2 } }),
      { code: 'OWNERSHIP_GUARD_INVALID' }); assertions++;
    assert.throws(() => createOwnershipGuard({ root: testRoot, verifiedArtifact: { ...artifact, path: `${artifact.path}.missing.node` } }),
      { code: 'OWNERSHIP_GUARD_UNAVAILABLE' }); assertions++;

    const root = fixture(), first = factory(root), second = factory(root);
    const a = take(first); check(a.assertHeld(), true); check(second.tryAcquire(), null);
    if (process.platform === 'win32') {
      assert.throws(() => fs.unlinkSync(path.join(root, 'ownership-control.lock'))); assertions++;
      assert.throws(() => fs.renameSync(path.join(root, 'ownership-control.lock'), path.join(root, 'must-not-appear'))); assertions++;
    }
    assert.throws(() => first.close(), { code: 'OWNERSHIP_GUARD_BUSY' }); assertions++;
    const p = participant(), q = participant(); await initialize(p, root); await initialize(q, root);
    check(await p.request('acquire'), { acquired: false });
    check(await q.request('acquire'), { acquired: false });
    check(a.release(), true); check(a.release(), false);
    assert.throws(() => a.assertHeld(), { code: 'OWNERSHIP_GUARD_CLOSED' }); assertions++;

    // Two independent Node processes race for the same permanent anchor.
    const race = await Promise.all([p.request('acquire'), q.request('acquire')]);
    check(race.filter(result => result.acquired).length, 1);
    const winner = race[0].acquired ? p : q, loser = race[0].acquired ? q : p;
    check(await winner.request('assert'), true);
    check(await loser.request('acquire'), { acquired: false });
    check(first.tryAcquire(), null);
    await winner.stop(); // real Windows process death with an acquired handle
    check(await loser.request('acquire'), { acquired: true });
    check(await loser.request('release'), true);
    const anchor = path.join(root, 'ownership-control.lock'), before = fs.lstatSync(anchor, { bigint: true });
    check(before.size, 0n); check(fs.existsSync(anchor), true);

    // An environment finalizer must not leak the lock or share JS capabilities.
    const thread = participant(true); await initialize(thread, root);
    check(await thread.request('acquire'), { acquired: true }); check(second.tryAcquire(), null);
    await thread.stop();
    const afterThread = take(second); check(afterThread.assertHeld(), true); check(afterThread.release(), true);
    const after = fs.lstatSync(anchor, { bigint: true });
    check([after.dev, after.ino, after.birthtimeNs], [before.dev, before.ino, before.birthtimeNs]);
    await loser.request('close'); await loser.stop();

    const finalizer = participant(); await initialize(finalizer, root);
    check(await finalizer.request('acquire'), { acquired: true });
    check(await finalizer.request('drop-factory'), true); // C root outlives its collected JS owner
    check(first.tryAcquire(), null);
    check(await finalizer.request('drop-guard'), true);
    const afterGc = take(first); check(afterGc.assertHeld(), true); afterGc.release(); await finalizer.stop();

    // Opaque tags reject forged DTOs before native pointer dereference.
    const module = { exports: {} }; process.dlopen(module, artifact.path);
    for (const method of ['tryAcquire', 'assertHeld', 'release', 'closeRoot']) {
      assert.throws(() => module.exports[method]({}), { code: 'OWNERSHIP_GUARD_INVALID' }); assertions++;
      assert.throws(() => module.exports[method](new Proxy({}, {})), { code: 'OWNERSHIP_GUARD_INVALID' }); assertions++;
    }
    assert.throws(() => module.exports.createRoot(root, 'ignored'), { code: 'OWNERSHIP_GUARD_INVALID' }); assertions++;
    if (process.platform === 'win32') {
      const broad = fixture();
      cp.execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe'),
        [broad, '/grant', '*S-1-1-0:(OI)(CI)M'], { windowsHide: true, stdio: 'pipe' });
      assert.throws(() => module.exports.createRoot(broad), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assertions++;
      check(fs.readdirSync(broad), []);

      const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
      const aclOptions = { windowsHide: true, stdio: 'pipe', timeout: 10_000, maxBuffer: 64 * 1024 };
      function ownedAclTarget(target) {
        assert.ok(fixtures.some(dir => target === dir || target === path.join(dir, 'ownership-control.lock')));
        const stat = fs.lstatSync(target);
        assert.ok(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile() && stat.nlink === 1));
        return target;
      }
      function grantFixture(target, sid, rights) {
        if (rights === '(OI)(CI)(IO)(GA)') {
          // FileSystemRights has no GenericAll enum member; preserve this
          // exact inherit-only native mask through the Windows ACL utility.
          cp.execFileSync(path.join(system, 'icacls.exe'), [ownedAclTarget(target), '/grant', '*' + sid + ':' + rights], aclOptions);
          return;
        }
        // icacls resolves some structurally valid synthetic SIDs as names and
        // rejects them. Use a raw SID rule, without account/domain lookups.
        const masks = { '(OI)(CI)F': 0x1f01ff, '(OI)(CI)(IO)(GA)': 0x10000000,
          '(OI)(CI)RX': 0x1200a9, '(WDAC)': 0x40000, '(DE)': 0x10000, '(WD)': 2, F: 0x1f01ff };
        assert.ok(Object.hasOwn(masks, rights)); assert.match(sid, /^S-1-[0-9-]+$/u);
        const inheritance = rights.startsWith('(OI)(CI)') ? 3 : 0;
        const propagation = rights.includes('(IO)') ? 2 : 0;
        const script = "$ErrorActionPreference='Stop';$target=$env:DATASECURE_OWNERSHIP_TEST_ACL_TARGET;" +
          "$directory=[System.IO.Directory]::Exists($target);" +
          "$acl=if($directory){[System.IO.Directory]::GetAccessControl($target)}else{[System.IO.File]::GetAccessControl($target)};" +
          "$sid=[System.Security.Principal.SecurityIdentifier]::new($env:DATASECURE_OWNERSHIP_TEST_ACL_SID);" +
          "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid," +
          "[System.Security.AccessControl.FileSystemRights][long]$env:DATASECURE_OWNERSHIP_TEST_ACL_MASK," +
          "[System.Security.AccessControl.InheritanceFlags][int]$env:DATASECURE_OWNERSHIP_TEST_ACL_INHERIT," +
          "[System.Security.AccessControl.PropagationFlags][int]$env:DATASECURE_OWNERSHIP_TEST_ACL_PROPAGATE," +
          "[System.Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule);" +
          "if($directory){[System.IO.Directory]::SetAccessControl($target,$acl)}else{[System.IO.File]::SetAccessControl($target,$acl)}";
        cp.execFileSync(path.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { ...aclOptions, env: { ...process.env,
            DATASECURE_OWNERSHIP_TEST_ACL_TARGET: ownedAclTarget(target), DATASECURE_OWNERSHIP_TEST_ACL_SID: sid,
            DATASECURE_OWNERSHIP_TEST_ACL_MASK: String(masks[rights]), DATASECURE_OWNERSHIP_TEST_ACL_INHERIT: String(inheritance),
            DATASECURE_OWNERSHIP_TEST_ACL_PROPAGATE: String(propagation) } });
      }
      function fixtureAcl(target) {
        // Independent native ACL observation, not localized icacls name parsing.
        // The only path is an already checked test-owned root or its anchor.
        const script = "$ErrorActionPreference='Stop';" +
          "$target=$env:DATASECURE_OWNERSHIP_TEST_ACL_TARGET;" +
          "$acl=if([System.IO.Directory]::Exists($target)){[System.IO.Directory]::GetAccessControl($target)}else{[System.IO.File]::GetAccessControl($target)};" +
          "$rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])|ForEach-Object{" +
          "[pscustomobject]@{sid=$_.IdentityReference.Value;mask=[long]$_.FileSystemRights;" +
          "inherited=$_.IsInherited;type=[int]$_.AccessControlType;propagation=[int]$_.PropagationFlags}});" +
          "ConvertTo-Json -InputObject $rules -Compress -Depth 3";
        const result = cp.execFileSync(path.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
          { ...aclOptions, encoding: 'utf8', env: { ...process.env, DATASECURE_OWNERSHIP_TEST_ACL_TARGET: ownedAclTarget(target) } });
        const rules = JSON.parse(result.replace(/^\uFEFF/u, '')); assert.ok(Array.isArray(rules)); return rules;
      }
      const fullControl = row => row.type === 0 &&
        ((row.mask & 0x1f01ff) === 0x1f01ff || (row.mask & 0x10000000) !== 0);
      // Several valid members of the capability namespace, not a named SID list
      // in production. The longer identifiers are deliberately synthetic.
      for (const sid of ['S-1-15-3-1', 'S-1-15-3-1024-1-2-3-4-5-6-7-8',
        'S-1-15-3-65536-8-7-6-5-4-3-2-1']) {
        const capRoot = fixture();
        grantFixture(capRoot, sid, '(OI)(CI)F');
        grantFixture(capRoot, sid, '(OI)(CI)(IO)(GA)');
        grantFixture(capRoot, 'S-1-1-0', '(OI)(CI)RX');
        const rootAcl = fixtureAcl(capRoot);
        check(rootAcl.some(row => row.sid === sid && !row.inherited && fullControl(row)), true);
        check(rootAcl.some(row => row.sid === sid && !row.inherited && (row.propagation & 2) !== 0 && fullControl(row)), true);
        const capFactory = factory(capRoot), capGuard = take(capFactory);
        const capAnchor = path.join(capRoot, 'ownership-control.lock');
        const anchorAcl = fixtureAcl(capAnchor);
        check(anchorAcl.some(row => row.sid === sid && row.inherited && fullControl(row)), true);
        check(capGuard.assertHeld(), true); check(capGuard.release(), true);
        // Admission/revalidation must not repair either ACL.
        check(fixtureAcl(capRoot), rootAcl); check(fixtureAcl(capAnchor), anchorAcl);
        const reacquired = take(capFactory); check(reacquired.assertHeld(), true); check(reacquired.release(), true);
      }
      const ordinaryMutations = [
        ['S-1-1-0', '(WDAC)'], ['S-1-1-0', '(DE)'], ['S-1-1-0', '(WD)'],
        // Similar shape is not enough: wrong authority, package base 2, other
        // base, an unknown ordinary account, and an incomplete capability SID.
        ['S-1-5-3-1', 'F'], ['S-1-15-2-1', 'F'], ['S-1-15-4-1', 'F'],
        ['S-1-5-21-1111111111-2222222222-3333333333-4444', 'F'], ['S-1-15-3', 'F']
      ];
      for (const [sid, rights] of ordinaryMutations) {
        const deniedRoot = fixture();
        grantFixture(deniedRoot, sid, rights);
        assert.throws(() => module.exports.createRoot(deniedRoot), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assertions++;
        check(fs.readdirSync(deniedRoot), []);

        const deniedAnchorRoot = fixture(), deniedAnchor = path.join(deniedAnchorRoot, 'ownership-control.lock');
        fs.writeFileSync(deniedAnchor, '', { flag: 'wx' });
        grantFixture(deniedAnchor, sid, rights);
        const anchorFactory = factory(deniedAnchorRoot);
        assert.throws(() => anchorFactory.tryAcquire(), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assertions++;
        check(fs.readFileSync(deniedAnchor).length, 0);
      }
    }

    const malformedRoot = fixture(), malformed = path.join(malformedRoot, 'ownership-control.lock');
    fs.writeFileSync(malformed, 'foreign malformed anchor', { flag: 'wx' });
    const rejected = factory(malformedRoot);
    assert.throws(() => rejected.tryAcquire(), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assertions++;
    check(fs.readFileSync(malformed, 'utf8'), 'foreign malformed anchor');

    // Replacement between leases poisons this bound root, never adopts/deletes it.
    const replaceRoot = fixture(), replace = factory(replaceRoot), original = take(replace); original.release();
    const replaced = path.join(replaceRoot, 'ownership-control.lock'); fs.unlinkSync(replaced);
    fs.writeFileSync(replaced, '', { flag: 'wx' });
    assert.throws(() => replace.tryAcquire(), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assertions++;
    check(fs.existsSync(replaced), true);

    const hardRoot = fixture(), hard = factory(hardRoot), hardGuard = take(hard); hardGuard.release();
    const hardAnchor = path.join(hardRoot, 'ownership-control.lock'), hardLink = path.join(hardRoot, 'hard-link');
    fs.linkSync(hardAnchor, hardLink);
    assert.throws(() => hard.tryAcquire(), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assertions++;
    check(fs.lstatSync(hardAnchor).nlink, 2); fs.unlinkSync(hardLink);

    const linked = path.join(testRoot, 'root-link');
    fs.symlinkSync(root, linked, process.platform === 'win32' ? 'junction' : 'dir'); links.push(linked);
    assert.throws(() => factory(linked)); assertions++;
    assert.throws(() => module.exports.createRoot(linked), { code: 'OWNERSHIP_GUARD_UNSAFE' }); assertions++;

    console.log(JSON.stringify({ schema: 'datasecure-native-ownership-guard-test/1', node: process.version,
      platform: process.platform, assertions, two_process_exclusion: true, process_crash_release: true,
      worker_environment_cleanup: true, permanent_anchor_identity: true, unsafe_namespace_refused: true,
      sha256: artifact.sha256 }));
  } finally {
    await Promise.all(participants.map(value => value.stop()));
    for (const guard of guards) try { guard.release(); } catch {}
    for (const factory of factories) factory.close();
    // Exact, bounded test-owned fixture cleanup. No traversal of junctions.
    for (const link of links) {
      assert.ok(fs.lstatSync(link).isSymbolicLink());
      if (process.platform === 'win32') fs.rmdirSync(link); else fs.unlinkSync(link);
    }
    for (const dir of fixtures) {
      assert.equal(path.dirname(dir), testRoot); const stat = fs.lstatSync(dir);
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
      const names = fs.readdirSync(dir); assert.ok(names.length <= 1 && names.every(name => name === 'ownership-control.lock'));
      for (const name of names) { const file = path.join(dir, name); assert.ok(fs.lstatSync(file).isFile()); fs.unlinkSync(file); }
      fs.rmdirSync(dir);
    }
    const current = fs.lstatSync(testRoot, { bigint: true });
    assert.equal(path.dirname(testRoot), path.resolve(os.tmpdir())); assert.match(path.basename(testRoot), /^ds-ownership-guard-test-/u);
    assert.ok(!current.isSymbolicLink() && current.isDirectory()); check([current.dev, current.ino], [initial.dev, initial.ino]);
    assert.equal(fs.readdirSync(testRoot).length, 0); fs.rmdirSync(testRoot);
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
