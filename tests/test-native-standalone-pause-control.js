'use strict';
// Explicit native integration gate. An explicit local build manifest is test
// configuration, never a new environment override in the production loader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const { createPrivateFixture } = require('./helpers/native-ownership-epoch-release-fixture.cjs');
const { configureOwnershipControl, withOwnershipControl } = require('../plugins/data-secure/server/core/ownership-control');
const { createStandalonePause } = require('../plugins/data-secure/server/gateway/standalone-pause');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { withSynchronousDocumentControl, withDocumentControl } = require('../plugins/data-secure/server/gateway/standalone-document-control');
if (process.version !== 'v22.23.2' || !['win32', 'darwin'].includes(process.platform) || process.argv.length !== 3)
  throw Error('NATIVE_PAUSE_GATE_TARGET_MANIFEST_REQUIRED');
const manifestFile = path.resolve(process.argv[2]), manifestStat = fs.lstatSync(manifestFile);
assert.ok(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.size < 65536);
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.source_sha256, sha(fs.readFileSync(path.join(__dirname, '../native/ownership-guard/ownership-guard.c'))));
const artifact = manifest.verified_artifact;
assert.equal(artifact.sha256, sha(fs.readFileSync(artifact.path)));
configureOwnershipControl(artifact);
const keys = ['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'DATASECURE_NATIVE_EXPORT_CHANNEL'];
const previous = keys.map(key => process.env[key]);
const token = 'a'.repeat(64), state = () => ({ product_channel: 'standalone', token });
const loader = path.resolve(__dirname, '../plugins/data-secure/server/core/native-ownership-guard.js');
let fixture, probes = 0, blocked = 0, permitted = 0, released = 0, synchronousReleases = 0, documentReleases = 0,
  asyncBusy = 0, asyncActions = 0, asyncEpochReleased = false, cleaned = false, observing = false, observedReads = 0;
async function bounded(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('NATIVE_ASYNC_PROBE_TIMEOUT')),milliseconds);
  })]); } finally { clearTimeout(timer); }
}
function competitor(root, expected) {
  // A separate real Node process calls the actual JS loader and C guard while
  // the parent's synchronous transaction is stopped at its action/unlink.
  const source = "const {createOwnershipGuard}=require(" + JSON.stringify(loader) + ");" +
    "const f=createOwnershipGuard({verifiedArtifact:JSON.parse(process.argv[1]),root:process.argv[2]});" +
    "let g;try{g=f.tryAcquire();const acquired=!!g;if(g&&g.release()!==true)throw Error('RELEASE');" +
    "if(f.close()!==true)throw Error('CLOSE');process.stdout.write(JSON.stringify({acquired}));}" +
    "catch(e){process.exitCode=1;}";
  const child = spawnSync(process.execPath, ['-e', source, JSON.stringify(artifact), root], {
    env: { SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || '' },
    windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 8192
  });
  assert.equal(child.error, undefined); assert.equal(child.status, 0); assert.equal(child.signal, null);
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0 && child.pid !== process.pid);
  assert.equal(JSON.parse(child.stdout).acquired, expected); probes++;
  if (expected) permitted++; else blocked++;
}
(async () => {
  try {
    fixture = await createPrivateFixture();
    const root = fixture.root(), batches = path.join(root, 'batches'); fs.mkdirSync(batches);
    process.env.EU_PRIVACY_DATA_ROOT = root; process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
    process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
    const lock = path.join(batches, 'standalone-control.lock');
    const io = { ...fs, constants: fs.constants, lstatSync(file, ...args) {
      if (observing && file === path.join(batches, token + '.pause-0')) {
        assert.equal(fs.existsSync(lock), false); competitor(root, false); observedReads++;
      }
      return fs.lstatSync(file, ...args);
    }, unlinkSync(file) {
      if (file === lock) { competitor(root, false); released++; }
      return fs.unlinkSync(file);
    } };
    // No ownership-control mock is supplied here. Both outer and inner calls
    // use the production reentrant controller and the actual held C primitive.
    const pause = createStandalonePause({ root: () => batches, fs: io });
    assert.equal(pause.requested(state()), false); assert.equal(fs.existsSync(lock), false);
    observing = true;
    // Native exclusion must be the SAME data root and reentrant when called
    // after a delivery commit. This observation publishes no logical owner.
    withOwnershipControl(root, () => assert.equal(pause.observeRequested(state()), false));
    observing = false;
    assert.equal(observedReads, 1); assert.equal(fs.existsSync(lock), false);
    assert.equal(pause.claim(state(), () => {
      assert.ok(fs.existsSync(lock)); competitor(root, false);
      withOwnershipControl(root, guard => assert.equal(guard.assertHeld(), true));
    }), true);
    assert.equal(fs.existsSync(lock), false); competitor(root, true);
    assert.equal(pause.request(state()), true);
    const marker = path.join(batches, token + '.pause-0'), markerStat = fs.lstatSync(marker, { bigint: true });
    assert.equal(pause.requested(state()), true);
    const releasesBeforeObserve = released;
    observing = true;
    assert.equal(pause.observeRequested(state()), true);
    observing = false;
    assert.equal(released, releasesBeforeObserve, 'observation has no logical owner to release');
    let actions = 0; assert.equal(pause.claim(state(), () => { actions++; }), false); assert.equal(actions, 0);
    const resumed = state(); let persisted = 0;
    assert.equal(pause.resume(resumed, () => { competitor(root, false); persisted++; }), true);
    assert.equal(resumed.standalone_control_generation, 1); assert.equal(persisted, 1);
    assert.equal(pause.requested(resumed), false); assert.equal(fs.existsSync(lock), false); competitor(root, true);
    // The general lease/continuation helper must provide the same real kernel
    // exclusion, including the exact unlink boundary, not just a modelled gate.
    const activeFile = path.join(batches, 'active-processing.json');
    const active = createBatchActiveLock({ lockPath: () => activeFile,
      fs: { ...fs, constants: fs.constants, unlinkSync(file) {
        if (file === activeFile) { competitor(root, false); synchronousReleases++; }
        return fs.unlinkSync(file);
      } } });
    assert.equal(active.withSynchronousActiveLock(token, () => {
      assert.ok(fs.existsSync(activeFile)); competitor(root, false); return 42;
    }), 42);
    assert.equal(fs.existsSync(activeFile), false); competitor(root, true);
    const beforeDocument = synchronousReleases;
    assert.equal(withSynchronousDocumentControl(active, token, () => {
      assert.ok(fs.existsSync(activeFile)); competitor(root, false); return 'document committed';
    }), 'document committed');
    documentReleases = synchronousReleases - beforeDocument;
    assert.equal(documentReleases, 1);
    assert.equal(fs.existsSync(activeFile), false); competitor(root, true);
    // An asynchronous document operation retains its logical epoch but MUST
    // release the kernel guard while awaiting. The child acquires the actual
    // C guard and holds it until the parent's first real release reports Busy.
    // No timer guess or mocked Busy substitutes for native contention here.
    let finish, holder, holderReleased = false;
    const asyncGate = createBatchActiveLock({ lockPath: () => activeFile });
    const epochGate = { ...asyncGate, releaseOwnedEpoch(epoch) {
      try { return asyncGate.releaseOwnedEpoch(epoch); }
      catch (error) {
        if (error?.code === 'OWNERSHIP_GUARD_BUSY') {
          asyncBusy++; probes++; blocked++;
          if (!holderReleased) { holderReleased = true; holder.stdin.write('release\n'); }
        }
        throw error;
      }
    } };
    const pendingDocument = withDocumentControl(epochGate, token, () => {
      asyncActions++; return new Promise(resolve => { finish = resolve; });
    });
    // Attach immediately, so an early refusal cannot become an unhandled
    // rejection while the independent child is still being inspected.
    const documentResult = Promise.resolve(pendingDocument).then(value=>({value}),error=>({error}));
    const holderSource = 'const{createOwnershipGuard}=require('+JSON.stringify(loader)+');'+
      'const f=createOwnershipGuard({verifiedArtifact:JSON.parse(process.argv[1]),root:process.argv[2]});'+
      'const g=f.tryAcquire();if(!g)throw Error("NO_GUARD");process.stdout.write("held\\n");'+
      'process.stdin.once("data",()=>{if(g.release()!==true||f.close()!==true)throw Error("CLOSE");'+
      'process.stdout.write("released\\n",()=>process.exit(0));});';
    holder = spawn(process.execPath,['-e',holderSource,JSON.stringify(artifact),root],{
      env:{SystemRoot:process.env.SystemRoot||process.env.SYSTEMROOT||''},windowsHide:true,shell:false,
      stdio:['pipe','pipe','pipe'],timeout:10000,killSignal:'SIGKILL'
    });
    let holderOutput='', holderError='';
    holder.stdout.on('data',chunk=>{holderOutput+=chunk.toString('utf8');});
    holder.stderr.on('data',chunk=>{holderError+=chunk.toString('utf8');});
    holder.stdin.on('error',()=>{});
    const holderClose = new Promise((resolve,reject)=>{
      holder.once('error',reject);holder.once('close',(code,signal)=>resolve({code,signal}));
    });
    await bounded(new Promise((resolve,reject)=>{
      if(holderOutput==='held\n')return resolve();
      const observe=()=>{if(holderOutput.includes('held\n'))resolve();};
      holder.stdout.on('data',observe);holder.once('error',reject);
      holder.once('exit',()=>{if(!holderOutput.includes('held\n'))reject(Error('NATIVE_HOLDER_NOT_READY'));});
    }),5000);
    assert.equal(holderOutput,'held\n');probes++;permitted++;
    assert.ok(fs.existsSync(activeFile),'logical document owner remains across await');
    finish('one exact document operation');
    const asyncResult=await bounded(documentResult,5000);
    assert.equal(asyncResult.error,undefined);assert.equal(asyncResult.value,'one exact document operation');
    assert.equal(asyncActions,1);assert.ok(asyncBusy>=1);assert.equal(fs.existsSync(activeFile),false);
    assert.deepEqual(await bounded(holderClose,5000),{code:0,signal:null});
    assert.equal(holderError,'');assert.equal(holderOutput,'held\nreleased\n');
    asyncEpochReleased=true;competitor(root,true);
    // Exact own synthetic immutable marker only. Keep the existing fixture
    // helper's narrower cleanup grammar rather than expanding its authority.
    withOwnershipControl(root, guard => {
      const current = fs.lstatSync(marker, { bigint: true });
      assert.equal(current.dev, markerStat.dev); assert.equal(current.ino, markerStat.ino);
      assert.equal(current.birthtimeNs, markerStat.birthtimeNs); assert.equal(current.nlink, 1n);
      assert.ok(current.isFile() && !current.isSymbolicLink()); guard.assertHeld(); fs.unlinkSync(marker);
    });
    const unsafe = fixture.root(), unsafeBatches = path.join(unsafe, 'batches'); fs.mkdirSync(unsafeBatches);
    process.env.EU_PRIVACY_DATA_ROOT = unsafe; process.env.EU_PRIVACY_ROOT = path.join(unsafe, 'workspace');
    const hard = createStandalonePause({ root: () => unsafeBatches, retryDelay() { assert.fail('hard native refusal must not wait'); } });
    assert.equal(hard.requested(state()), false);
    fs.writeFileSync(path.join(unsafe, 'ownership-control.lock'), Buffer.from([1]), { flag: 'r+' });
    assert.throws(() => hard.requested(state()), error => error.code === 'OWNERSHIP_GUARD_UNSAFE');
    assert.throws(() => hard.observeRequested(state()), error => error.code === 'OWNERSHIP_GUARD_UNSAFE');
    assert.equal(fs.existsSync(path.join(unsafeBatches, 'standalone-control.lock')), false);
    assert.equal(released, 7); assert.equal(synchronousReleases, 2);
    assert.ok(observedReads >= 2);
    assert.equal(blocked, 13 + asyncBusy + observedReads); assert.equal(permitted, 6); assert.equal(probes, 19 + asyncBusy + observedReads);
    fixture.cleanup(); cleaned = true;
    console.log(JSON.stringify({ schema: 'datasecure-native-pause-control-gate/1', outcome: 'passed', node: process.version,
      platform: process.platform, native_source_sha256: manifest.source_sha256, addon_sha256: artifact.sha256,
      probes, blocked, permitted, confirmed_logical_releases: released,
      confirmed_synchronous_active_lock_releases: synchronousReleases,
      confirmed_synchronous_document_control_releases: documentReleases,
      async_native_busy_attempts:asyncBusy, async_actions:asyncActions, async_exact_epoch_released:asyncEpochReleased,
      observed_pause_reads_under_same_native_root: observedReads,
      hard_unsafe_refused: true, fixture_cleaned: cleaned }));
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    if (fixture && !cleaned) console.error('NATIVE_PAUSE_FIXTURE_RETAINED', fixture.path);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
