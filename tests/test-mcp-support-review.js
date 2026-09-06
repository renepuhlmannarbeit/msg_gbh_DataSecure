'use strict';

// Real JSON-RPC/stdio dispatch. Only the native worker adapter and its private
// status are substituted; a direct reconstruction in the MCP parent is fatal.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createSuite } = require('./helpers');
const { publicProgress } = require('../plugins/data-secure/server/gateway/batch-progress').createBatchProgress({
  deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
  mappingPendingStatus: 'mapping_pending', liveLocalExecutor: () => false
});
const { testAsync, assert, done } = createSuite('MCP support review process boundary');
const server = path.resolve(__dirname, '../plugins/data-secure/server/index.js');
const gateway = path.join(path.dirname(server), 'gateway');
const token = 'a'.repeat(64);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-support-review-'));
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });

function talk({ items = [{ status: 'deferred_review' }], active = false, intakePending = false,
  mode = 'accepted', support = true, suppliedToken = token } = {}) {
  const root = fs.mkdtempSync(path.join(temporary, 'case-'));
  const progress = publicProgress({ token, items });
  const script = `
    const gateway = require(${JSON.stringify(gateway)});
    gateway.genericStatus = () => ({ engine_ready:true, batch_processing_active:${active}, local_intake_pending:${intakePending} });
    gateway.readBatchProgress = received => {
      if(received!==${JSON.stringify(token)})throw new Error('WRONG_TOKEN');
      process.stderr.write('STATUS_READ\\n');
      return ${JSON.stringify(progress)};
    };
    gateway.reviewDeferredBatch = () => {
      process.stderr.write('RAW_REVIEW_IN_PARENT\\n');
      throw new Error('PRIVATE_PARENT_RECONSTRUCTION');
    };
    let accepted=false;
    const write=process.stdout.write.bind(process.stdout);
    process.stdout.write=(chunk,...rest)=>{
      if(${JSON.stringify(mode)}==='delayed_ack' && String(chunk).includes('"id":2') && !accepted)
        process.stderr.write('RESPONSE_BEFORE_ACK\\n');
      return write(chunk,...rest);
    };
    gateway.startLocalReviewExecutor = (received,options) => {
      if(received!==${JSON.stringify(token)}||options.requireIpcAcknowledgement!==true)
        throw new Error('INVALID_WORKER_CONTRACT');
      process.stderr.write('REVIEW_SELECTED\\n');
      const mode=${JSON.stringify(mode)};
      const result={ok:true,local_review_started:true,batch_token:received,
        source_path:'PRIVATE_WORKER_SENTINEL',read_capability:'PRIVATE_WORKER_SENTINEL'};
      if(mode==='missing_ack')return result;
      if(mode==='false_ok')result.ok=false;
      if(mode==='false_marker')result.local_review_started=false;
      const error=Object.assign(new Error('PRIVATE_WORKER_SENTINEL'),{code:'LOCAL_IPC_ACK_TIMEOUT'});
      result.ipcAcknowledgement=mode==='timeout'?Promise.reject(error):mode==='cancel'
        ?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(
          Object.assign(new Error('PRIVATE_WORKER_SENTINEL'),{code:'LOCAL_IPC_ACK_CANCELLED'})),{once:true}))
        :mode==='delayed_ack'?new Promise(resolve=>setTimeout(()=>{accepted=true;resolve();},50))
        :Promise.resolve();
      result.ipcAcknowledgement.catch(()=>{});
      return result;
    };
    require(${JSON.stringify(server)});
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--eval', script], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, EU_PRIVACY_ROOT: path.join(root, 'workspace'),
        EU_PRIVACY_DATA_ROOT: path.join(root, 'data'), LOCALAPPDATA: path.join(root, 'localapp'),
        EU_PRIVACY_RESULT_ROOT: path.join(root, 'results'), EU_PRIVACY_SUPPORT_MODE: support ? '1' : '0' }
    });
    let stdout = '', stderr = '', requested = false, cancelled = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('SUPPORT_REVIEW_TEST_TIMEOUT')); }, 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stderr.on('data', bytes => {
      stderr += bytes;
      if (mode === 'cancel' && !cancelled && stderr.includes('REVIEW_SELECTED')) {
        cancelled = true;
        child.stdin.write(JSON.stringify({ jsonrpc:'2.0', method:'notifications/cancelled', params:{requestId:2} })+'\n');
      }
    });
    child.stdout.on('data', bytes => {
      stdout += bytes;
      if (!requested && stdout.includes('"id":1')) {
        requested = true;
        child.stdin.write(JSON.stringify(rpc(2, 'tools/call', {
          name: 'review_deferred_document_batch', arguments: { batch_token: suppliedToken }
        })) + '\n');
      }
      if (stdout.includes('"id":2')) child.stdin.end();
    });
    child.once('close', code => {
      clearTimeout(timer);
      try {
        assert.strictEqual(code, 0, stderr);
        const response = stdout.trim().split('\n').map(JSON.parse).find(row => row.id === 2);
        assert.ok(response, 'the support call has a correlated response');
        resolve({ response, body: response.result?.structuredContent, stdout, stderr });
      } catch (error) { reject(error); }
    });
    child.stdin.write(JSON.stringify(rpc(1, 'initialize', {})) + '\n');
  });
}

function removeOwnedTree(directory) {
  // This fixture never creates links; refuse any unexpected replacement.
  assert.ok(directory === temporary || directory.startsWith(temporary + path.sep));
  const stat = fs.lstatSync(directory);
  assert.ok(!stat.isSymbolicLink());
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(directory)) removeOwnedTree(path.join(directory, entry));
    fs.rmdirSync(directory);
  } else { assert.ok(stat.isFile()); fs.unlinkSync(directory); }
}

async function main() {
  await testAsync('normal mode and malformed support arguments never read a review or launch a worker', async () => {
    for (const options of [{ support: false }, { suppliedToken: 'invalid' }]) {
      const result = await talk(options);
      assert.ok(result.response.error || result.response.result?.isError);
      assert.doesNotMatch(result.stderr, /STATUS_READ|REVIEW_SELECTED|RAW_REVIEW_IN_PARENT/);
    }
  });
  await testAsync('the support route waits only for acknowledged guarded-worker handoff and returns no private fields', async () => {
    const result = await talk({ mode: 'delayed_ack' });
    assert.strictEqual(result.body?.ok, true);
    assert.strictEqual(result.body.local_review_started, true);
    assert.strictEqual(result.body.next_action, 'local_review_handoff_confirmed');
    assert.strictEqual(result.body.raw_content_sent_to_claude, false);
    assert.match(result.stderr, /REVIEW_SELECTED/);
    assert.doesNotMatch(result.stderr, /RAW_REVIEW_IN_PARENT|RESPONSE_BEFORE_ACK/);
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_|batch_token|read_capability|source_path/);
  });
  await testAsync('active, pending, invalid or completed batches never start a premature review', async () => {
    for (const options of [{ active: true }, { intakePending: true }, { items: [{status:'deferred_review'},{status:'pending'}] },
      { items: [{status:'deferred_review'},{status:'unknown'}] }, { items: [{status:'stopped'}] }]) {
      const result = await talk(options);
      assert.strictEqual(result.body?.ok, false);
      assert.strictEqual(result.body.local_review_started, false);
      assert.doesNotMatch(result.stderr, /REVIEW_SELECTED|RAW_REVIEW_IN_PARENT/);
    }
  });
  await testAsync('repairable published and mapping positions are delegated to the worker, never reconstructed by the parent', async () => {
    for (const status of ['mapping_pending', 'preflight_mapping_pending', 'delivery_pending', 'processing']) {
      const result = await talk({ items: [{status:'deferred_review'}, {status}] });
      assert.strictEqual(result.body?.ok, true, status);
      assert.strictEqual(result.body.next_action, 'local_review_handoff_confirmed');
      assert.doesNotMatch(result.stderr, /RAW_REVIEW_IN_PARENT/);
    }
  });
  await testAsync('missing start proof and failed ACKs stop honestly without raw reconstruction or retry', async () => {
    for (const mode of ['missing_ack', 'false_ok', 'false_marker', 'timeout', 'cancel']) {
      const result = await talk({ mode });
      assert.strictEqual(result.body?.ok, false);
      assert.strictEqual(result.body.local_review_started, false);
      assert.strictEqual((result.stderr.match(/REVIEW_SELECTED/g) || []).length, 1);
      assert.doesNotMatch(result.stderr, /RAW_REVIEW_IN_PARENT/);
      assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_|batch_token|read_capability|source_path/);
      if (['timeout','cancel'].includes(mode)) assert.strictEqual(result.body.diagnostic.cause,
        mode === 'timeout' ? 'LOCAL_IPC_ACK_TIMEOUT' : 'LOCAL_IPC_ACK_CANCELLED');
    }
  });
  await done(() => removeOwnedTree(temporary));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
