'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
if (process.version !== 'v22.23.2' || !['win32', 'darwin'].includes(process.platform)) throw Error('Use packaged Node 22.23.2 on Windows/macOS');
if (process.argv.length !== 3) throw Error('Pass the explicit test build-manifest.json');
const artifact = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8')).verified_artifact;
const helper = path.join(__dirname, 'helpers', 'native-ownership-integration-child.cjs');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-ownership-integration-'));
const initial = fs.lstatSync(base, { bigint: true });
if (process.platform === 'win32') {
  const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const account = cp.execFileSync(path.join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = account.match(/"(S-1-[0-9-]+)"/u)?.[1]; if (!sid) throw Error('Test account SID unavailable');
  cp.execFileSync(path.join(system, 'icacls.exe'), [base, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { windowsHide: true, stdio: 'pipe' });
}
let sequence = 0, checks = 0, rootSequence = 0;
const children = [];
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
function fixture() { const root = path.join(base, `root-${++rootSequence}`); fs.mkdirSync(root, { mode: 0o700 }); return root; }
function child() {
  const process = cp.fork(helper, [], { execPath: global.process.execPath, execArgv: [], windowsHide: true,
    env: { SystemRoot: global.process.env.SystemRoot || '', NODE_OPTIONS: '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const pending = new Map(); let ended = false, eventWaiter;
  const completed = new Promise(resolve => process.once('close', (code, signal) => {
    ended = true; for (const entry of pending.values()) { clearTimeout(entry.timer); entry.resolve({ exited: true, code, signal }); }
    pending.clear(); resolve({ code, signal });
  }));
  process.stderr.on('data', () => {});
  process.on('message', message => {
    if (message.event && eventWaiter) { const resolve = eventWaiter; eventWaiter = undefined; resolve(message.event); }
    const entry = pending.get(message.id); if (entry) { clearTimeout(entry.timer); pending.delete(message.id); entry.resolve(message); }
  });
  process.on('error', error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); });
  const participant = { pid: process.pid,
    event() { return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { eventWaiter = undefined; reject(Error('test event deadline')); }, 10000);
      eventWaiter = value => { clearTimeout(timer); resolve(value); };
    }); },
    request(command, fields = {}) { return new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('child deadline')); }, 10000);
      pending.set(id, { resolve, reject, timer }); process.send({ id, command, ...fields }, error => { if (error) { clearTimeout(timer); pending.delete(id); reject(error); } });
    }); },
    async stop() { if (!ended) process.kill('SIGKILL'); return completed; }, completed };
  children.push(participant); return participant;
}
async function initialize(participant, root, kind, fault, configured = true) {
  const result = await participant.request('initialize', { root, kind, fault, artifact: configured ? artifact : null });
  check(result.ok, true); check(result.value.node, 'v22.23.2');
}
function finalPath(root, kind) {
  if (kind === 'active') return path.join(root, 'batches', 'active-processing.json');
  if (kind === 'intake') return path.join(root, 'batches', 'intake-reservation.json');
  const crypto = require('node:crypto');
  return path.join(root, 'result-export-state', `re_${crypto.createHash('sha256').update('e'.repeat(64)).digest('hex').slice(0, 32)}.json.claim`);
}
// Strict fixture-only cleanup: never follow reparse points, validate the root
// object and absolute ancestry before enumerating/removing each exact entry.
function clean(directory) {
  const absolute = path.resolve(directory);
  if (absolute !== base && !absolute.startsWith(`${base}${path.sep}`)) throw Error('cleanup escaped fixture');
  const stat = fs.lstatSync(absolute); if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('unexpected cleanup directory');
  for (const item of fs.readdirSync(absolute, { withFileTypes: true })) {
    const target = path.join(absolute, item.name), current = fs.lstatSync(target);
    if (current.isSymbolicLink()) throw Error('unexpected fixture reparse point');
    if (current.isDirectory()) clean(target); else if (current.isFile()) fs.unlinkSync(target); else throw Error('unexpected fixture object');
  }
  fs.rmdirSync(absolute);
}
(async () => {
  try {
    for (const kind of ['active', 'intake', 'export']) {
      const root = fixture(), p = child(), q = child();
      await initialize(p, root, kind); await initialize(q, root, kind);
      const race = await Promise.all([p.request('acquire'), q.request('acquire')]);
      const won = race.map(result => result.ok && Boolean(result.value));
      check(won.filter(Boolean).length, 1);
      const winner = won[0] ? p : q, loser = won[0] ? q : p;
      check((await winner.request('foreign-release')).value, false);
      check(fs.lstatSync(finalPath(root, kind)).size > 0, true);
      await winner.stop();
      const recovery = await loser.request('acquire'); check(recovery.ok && Boolean(recovery.value), true);
      const probe = child(); await initialize(probe, root, kind);
      const entered = loser.event(), releasing = loser.request('release-pause');
      check(await entered, 'guarded-unlink');
      // Deterministically inside the final check→unlink window of the actual
      // caller, another process must hit the held native kernel primitive.
      check((await probe.request('acquire')).code, 'OWNERSHIP_GUARD_BUSY');
      check((await releasing).value, true); await loser.stop(); await probe.stop();
      check(fs.existsSync(finalPath(root, kind)), false);

      for (const fault of ['partial-write', 'published-before-ack']) {
        const crashRoot = fixture(), crashed = child(); await initialize(crashed, crashRoot, kind, fault);
        const crash = await crashed.request('acquire'); check(crash.exited, true); check(crash.code, fault === 'partial-write' ? 71 : 72);
        const target = finalPath(crashRoot, kind), parent = path.dirname(target);
        check(fs.existsSync(target), fault !== 'partial-write');
        if (fault !== 'partial-write') { check(fs.lstatSync(target).nlink, 2); check(JSON.parse(fs.readFileSync(target)).pid, crashed.pid); }
        const retained = fs.readdirSync(parent).filter(name => name.includes('.prepared-')); check(retained.length, 1);
        const next = child(); await initialize(next, crashRoot, kind);
        const acquired = await next.request('acquire'); check(acquired.ok && Boolean(acquired.value), true);
        check((await next.request('release')).value, true); await next.stop();
        check(fs.existsSync(path.join(parent, retained[0])), true);
      }

      const noPinRoot = fixture(), noPin = child(); await initialize(noPin, noPinRoot, kind, undefined, false);
      check((await noPin.request('acquire')).code, 'OWNERSHIP_GUARD_UNAVAILABLE');
      check(fs.existsSync(finalPath(noPinRoot, kind)), false); await noPin.stop();

      const malformedRoot = fixture(), malformed = child(); await initialize(malformed, malformedRoot, kind);
      const malformedTarget = finalPath(malformedRoot, kind); fs.mkdirSync(path.dirname(malformedTarget), { recursive: true });
      fs.writeFileSync(malformedTarget, '{'); const before = fs.lstatSync(malformedTarget);
      check(Boolean((await malformed.request('acquire')).value), false);
      check(fs.readFileSync(malformedTarget, 'utf8'), '{'); check(fs.lstatSync(malformedTarget).ino, before.ino); await malformed.stop();

      const oldRoot = fixture(), old = child(); await initialize(old, oldRoot, kind);
      const oldTarget = finalPath(oldRoot, kind); fs.mkdirSync(path.dirname(oldTarget), { recursive: true });
      const legacy = { schema: kind === 'active' ? 'datasecure-active-batch/1' : kind === 'intake' ?
        'datasecure-intake-reservation/1' : 'datasecure-result-export-claim/1', pid: 2147483647, created_at: new Date().toISOString() };
      if (kind === 'active') Object.assign(legacy, { token: 'e'.repeat(64), lock_id: 'a'.repeat(32) });
      if (kind === 'intake') legacy.reservation_id = 'a'.repeat(64);
      if (kind === 'export') legacy.claim_id = 'a'.repeat(32);
      const oldBytes = JSON.stringify(legacy); fs.writeFileSync(oldTarget, oldBytes);
      check(Boolean((await old.request('acquire')).value), false);
      check(fs.readFileSync(oldTarget, 'utf8'), oldBytes); await old.stop();
    }

    const root = fixture(), parent = child(), worker = child();
    await initialize(parent, root, 'intake'); await initialize(worker, root, 'intake');
    const acquired = await parent.request('acquire'), id = acquired.value.reservation_id;
    check((await parent.request('delegate', { pid: worker.pid })).value, true);
    check((await parent.request('release')).value, false); // dropped worker ACK
    await parent.stop();
    const contender = child(); await initialize(contender, root, 'intake'); check((await contender.request('acquire')).ok, false);
    check((await worker.request('release', { idValue: id })).value, true); await worker.stop();
    check((await contender.request('acquire')).ok, true); check((await contender.request('release')).value, true); await contender.stop();

    const lostRoot = fixture(), lost = child(), delegate = child();
    await initialize(lost, lostRoot, 'intake', 'delegate-before-ack'); await initialize(delegate, lostRoot, 'intake');
    const reservation = await lost.request('acquire');
    check((await lost.request('delegate', { pid: delegate.pid })).code, 73);
    const blocked = child(); await initialize(blocked, lostRoot, 'intake'); check((await blocked.request('acquire')).ok, false);
    check((await delegate.request('release', { idValue: reservation.value.reservation_id })).value, true); await delegate.stop(); await blocked.stop();

    for (const kind of ['active', 'intake', 'export']) {
      const ackRoot = fixture(), publisher = child(); await initialize(publisher, ackRoot, kind, 'metadata-once-link');
      const published = await publisher.request('acquire'); check(published.ok && Boolean(published.value), true);
      check((await publisher.request('publication-stats')).value, { links: 1, renames: 0, faults: 1 });
      const value = JSON.parse(fs.readFileSync(finalPath(ackRoot, kind)));
      const prepared = `${finalPath(ackRoot, kind)}.prepared-${value.prepared_nonce}.tmp`;
      check(fs.existsSync(prepared), true); check(value.pid, publisher.pid);
      check((await publisher.request('release')).value, true); check(fs.existsSync(prepared), true);
      check((await publisher.request('acquire')).ok, true); check((await publisher.request('release')).value, true); await publisher.stop();

      const failureRoot = fixture(), uncertain = child(), contender = child();
      await initialize(uncertain, failureRoot, kind, 'metadata-persistent-link'); await initialize(contender, failureRoot, kind);
      check((await uncertain.request('acquire')).ok, false);
      check(JSON.parse(fs.readFileSync(finalPath(failureRoot, kind))).pid, uncertain.pid);
      const refused = await contender.request('acquire'); check(refused.ok && Boolean(refused.value), false);
      await uncertain.stop(); // no positive commit ACK and no unsafe live-owner recovery
      const recovered = await contender.request('acquire'); check(recovered.ok && Boolean(recovered.value), true);
      check((await contender.request('release')).value, true); await contender.stop();
    }
    const renameRoot = fixture(), renameParent = child(), renameWorker = child();
    await initialize(renameParent, renameRoot, 'intake', 'metadata-once-rename'); await initialize(renameWorker, renameRoot, 'intake');
    const renameCap = await renameParent.request('acquire');
    check((await renameParent.request('delegate', { pid: renameWorker.pid })).value, true);
    check((await renameParent.request('publication-stats')).value, { links: 1, renames: 1, faults: 1 });
    check((await renameParent.request('release')).value, false);
    check((await renameWorker.request('release', { idValue: renameCap.value.reservation_id })).value, true);
    await renameParent.stop(); await renameWorker.stop();
    console.log(`NATIVE OWNERSHIP INTEGRATION PASS ${checks} assertions; ${rootSequence} private fixtures; ${process.version}; ${process.platform}`);
  } finally {
    await Promise.all(children.map(participant => participant.stop()));
    const current = fs.lstatSync(base, { bigint: true });
    if (current.dev !== initial.dev || current.ino !== initial.ino) throw Error('fixture root identity changed');
    clean(base);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
