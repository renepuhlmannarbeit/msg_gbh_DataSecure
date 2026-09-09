'use strict';

// Drives the MCP server over real stdio, the same way Claude Desktop does.
// These tests are the only ones that would have caught a server that starts but
// speaks a protocol the host cannot use.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createSuite } = require('./helpers');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');

const { testAsync, done, assert } = createSuite('MCP protocol');

const serverEntry = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'index.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-mcp-'));

// Sends a batch of messages, collects every line the server writes back and
// exits. Each case gets a fresh process so state cannot leak between them.
function talk(messages, { timeoutMs = 15000, supportMode = true, privacyRoot = root, localStartFixture = false, invalidStartFixture = false, waitingPickerFixture = false, handoffFixture = false, resultOpenFixture = null, statusAppPilot = false, inputGuardFixture = false, continuationFixture = null, continuationStartFixture = 'accepted', continuationCoreRace = false, ackErrorFixture = null } = {}) {
  return new Promise((resolve, reject) => {
    const resultRoot = path.join(privacyRoot, '..', 'cowork-results');
    const syntheticSource = path.join(privacyRoot, 'synthetic-private-source.txt');
    fs.mkdirSync(resultRoot, { recursive: true });
    fs.mkdirSync(path.dirname(syntheticSource), { recursive: true });
    fs.writeFileSync(syntheticSource, 'synthetic local fixture', 'utf8');
    // Test-only dependency substitution: exercise the real stdio dispatch and
    // response with a synthetic selection, without opening a native dialog or
    // starting a worker. Production exposes no bypass or fixture environment.
    const entryArgs = (localStartFixture || invalidStartFixture || handoffFixture || resultOpenFixture || inputGuardFixture || continuationFixture || continuationCoreRace) ? ['--eval', `
      const gateway = require(${JSON.stringify(path.join(path.dirname(serverEntry), 'gateway'))});
      const resultOpenFixture=${JSON.stringify(resultOpenFixture)};
      if (resultOpenFixture) {
        gateway.latestProductResultDirectory = (channel, options) => {
          if (channel !== 'plugin' || JSON.stringify(options) !== JSON.stringify({ensureExport:true,latestBatchOnly:true})) {
            throw new Error('RESULT_RESOLUTION_CONTRACT_INVALID');
          }
          process.stderr.write('EXACT_PLUGIN_RUN_RESOLVED');
          return resultOpenFixture === 'available' ? ${JSON.stringify(path.join(root, 'exact-plugin-run'))} : '';
        };
        gateway.openFolder = (target) => {
          if (target !== ${JSON.stringify(path.join(root, 'exact-plugin-run'))}) throw new Error('STALE_OR_PARENT_RESULT_OPENED');
          process.stderr.write('EXACT_PLUGIN_RUN_OPENED');
          return {ok:true,handoff_confirmed:true};
        };
      }
      gateway.genericStatus = () => ({engine_ready: true});
      const ackErrorFixture=${JSON.stringify(ackErrorFixture)};
      const ackError=()=>Object.assign(new Error(ackErrorFixture.message),
        Object.hasOwn(ackErrorFixture,'code')?{code:ackErrorFixture.code}:{});
      if (${inputGuardFixture}) {
        const handoff = require(${JSON.stringify(path.join(path.dirname(serverEntry), 'gateway/local-only-handoff'))});
        handoff.createLocalOnlyHandoff = () => ({
          start: async () => { process.stderr.write('GUARD_ACTION'); return {ok:true}; },
          nextAsync: async () => { process.stderr.write('GUARD_ACTION'); return {ok:true}; },
          cancel: () => { process.stderr.write('GUARD_ACTION'); return {ok:true}; }
        });
      }
      if (${JSON.stringify(continuationFixture)} || ${continuationCoreRace}) {
        gateway.continueMostRecentBatch = () => (${JSON.stringify(continuationFixture)});
        const { publicProgress } = require(${JSON.stringify(path.join(path.dirname(serverEntry), 'gateway/batch-progress'))}).createBatchProgress({
          deliveryPendingStatus:'delivery_pending', deferredReviewStatus:'deferred_review', mappingPendingStatus:'mapping_pending',
          liveLocalExecutor:()=>false, publishedPackageRecord:()=>null
        });
        if (${continuationCoreRace}) {
          let state={token:'a'.repeat(64),created_at:new Date().toISOString(),items:[{status:'retryable'}]};
          const continuation=require(${JSON.stringify(path.join(path.dirname(serverEntry), 'gateway/batch-continuation'))}).createBatchContinuation({
            SafeError:gateway.SafeError,active:new Set(),readState:()=>structuredClone(state),writeState:value=>{state=value;},
            recoverableBatchStates:()=>[structuredClone(state)],
            acquireActiveLock:()=>{state.items[0].status='stopped';},releaseActiveLock:()=>true,
            assertLocalExecutorAccess:()=>{},reconcilePublishedItems:()=>false,reconcilePendingMappings:()=>false,
            markInterruptedItemsRetryable:()=>0,publicProgress
          });
          gateway.continueMostRecentBatch=continuation.continueMostRecentBatch;
        }
        const start = (kind,token,options) => {
          process.stderr.write(kind==='batch'?'BATCH_SELECTED':'REVIEW_SELECTED');
          if(options.requireIpcAcknowledgement!==true)throw new Error('ACK_REQUIREMENT_MISSING');
          const mode=${JSON.stringify(continuationStartFixture)};
          const privateMetadata={batch_token:token,read_capability:'PRIVATE_RESPONSE_SENTINEL',source_path:'PRIVATE_RESPONSE_SENTINEL',
            message:'PRIVATE_RESPONSE_SENTINEL',user_status:'PRIVATE_RESPONSE_SENTINEL',diagnostic:{private:'PRIVATE_RESPONSE_SENTINEL'}};
          if(mode==='lease_refused') {
            const state={token,items:[{status:'stopped'}]};
            const lease=require(${JSON.stringify(path.join(path.dirname(serverEntry), 'gateway/batch-executor-lease'))}).createBatchExecutorLease({
              SafeError:gateway.SafeError,processAlive:()=>true,liveLocalExecutor:()=>false,acquireActiveLock:()=>{},releaseActiveLock:()=>true,
              readState:()=>state,writeState:()=>{},publicProgress,processInstanceIdentity:()=> 'synthetic-birth'
            });
            return {...lease.claimLocalBatchExecutor(token,42),...privateMetadata};
          }
          if(mode==='throw')throw new Error('PRIVATE_RESPONSE_SENTINEL');
          if(mode==='null_response')return null;
          const marker=kind==='batch'?'local_processing_started':'local_review_started';
          const started={ok:true,[marker]:true,...privateMetadata};
          if(mode==='missing_ok')delete started.ok;
          if(mode==='false_ok')started.ok=false;
          if(mode==='string_ok')started.ok='true';
          if(mode==='missing_marker')delete started[marker];
          if(mode==='wrong_marker')started[marker]=false;
          if(mode==='string_marker')started[marker]='true';
          if(mode==='missing_ack')return started;
          if(mode==='null_ack')return {...started,ipcAcknowledgement:null};
          if(mode==='false_ack')return {...started,ipcAcknowledgement:false};
          if(mode==='wrong_then')return {...started,ipcAcknowledgement:{then:'PRIVATE_RESPONSE_SENTINEL'}};
          const acknowledgement=ackErrorFixture?Promise.reject(ackError())
            :mode==='rejected_ack'?Promise.reject(new Error('PRIVATE_RESPONSE_SENTINEL'))
            :mode==='timeout_ack'?Promise.reject(Object.assign(new Error('cancel PRIVATE_RESPONSE_SENTINEL'),{code:'LOCAL_IPC_ACK_TIMEOUT'}))
            :mode==='cancelled_ack'?new Promise((resolve,reject)=>{
              const abort=()=>reject(Object.assign(new Error('timeout PRIVATE_RESPONSE_SENTINEL'),{code:'LOCAL_IPC_ACK_CANCELLED'}));
              if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
            }):mode==='delayed_ack'?new Promise(resolve=>setTimeout(resolve,50)):Promise.resolve();
          acknowledgement.catch(()=>{});
          return {...started,ipcAcknowledgement:acknowledgement};
        };
        gateway.startLocalBatchExecutor = (token,options) => start('batch',token,options);
        gateway.startLocalReviewExecutor = (token,options) => start('review',token,options);
      }
      gateway.startLocalIntakeExecutor = (queue) => {
        if (${waitingPickerFixture}) process.stderr.write('UNEXPECTED_INTAKE_STARTED');
        if (!Array.isArray(queue) || queue.length !== 1 || queue[0].full !== ${JSON.stringify(syntheticSource)} ||
            queue[0].name !== 'synthetic-private-source.txt' || !Number.isSafeInteger(queue[0].sourceBytes)) {
          throw new Error('REAL_QUEUE_SHAPE_NOT_USED');
        }
        const started = {ok: true, local_intake_pending: true, batch_token: 'a'.repeat(64)};
        if (${invalidStartFixture}) return started;
        const acknowledgement=ackErrorFixture?Promise.reject(ackError()):Promise.resolve();
        acknowledgement.catch(()=>{});
        Object.defineProperty(started, 'ipcAcknowledgement', {value: acknowledgement, enumerable: false});
        return started;
      };
      const picker = require(${JSON.stringify(path.join(path.dirname(serverEntry), 'companion', 'file-picker'))});
      const descriptor = {sourcePath: ${JSON.stringify(syntheticSource)}, sourceBytes: ${fs.statSync(syntheticSource).size}};
      picker.pickSourcesAsync = async () => [descriptor];
      if (${waitingPickerFixture}) {
        const waitForSelection = ({ signal } = {}) => new Promise((resolve) => {
          const timer = setTimeout(() => resolve([descriptor]), 100);
          signal?.addEventListener('abort', () => { clearTimeout(timer); resolve([descriptor]); }, { once: true });
        });
        picker.pickSourcesAsync = waitForSelection;
        const folder = require(${JSON.stringify(path.join(path.dirname(serverEntry), 'companion', 'source-folder'))});
        folder.pickSourceFolderAsync = async () => ${JSON.stringify(path.dirname(syntheticSource))};
        folder.enumerateSourceFolderAsync = async () => [descriptor];
      }
      if (${handoffFixture}) {
        gateway.completedLocalOnlyCandidates = () => [
          {token: 'a'.repeat(64), released: 1, stopped: 0},
          {token: 'b'.repeat(64), released: 1, stopped: 0}
        ];
        gateway.listBatchResults = () => { process.stderr.write('UNEXPECTED_HANDOFF_READ'); return {results: [], next_cursor: null}; };
        const completed = require(${JSON.stringify(path.join(path.dirname(serverEntry), 'companion', 'completed-batch-picker'))});
        completed.pickCompletedBatch = (_cards, {signal}) => new Promise(resolve => {
          const timer = setTimeout(() => resolve(1), 1000);
          signal.addEventListener('abort', () => { clearTimeout(timer); resolve(1); }, {once:true});
        });
      }
      require(${JSON.stringify(serverEntry)});
    `] : [serverEntry];
    const child = spawn(process.execPath, entryArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        EU_PRIVACY_ROOT: privacyRoot,
        EU_PRIVACY_RESULT_ROOT: resultRoot,
        EU_PRIVACY_DATA_ROOT: path.join(privacyRoot, 'localapp', 'SecureDataMsg'),
        LOCALAPPDATA: path.join(privacyRoot, 'localapp'),
        EU_PRIVACY_LANGUAGE: 'de',
        EU_PRIVACY_VISUAL_MODE: 'strict',
        EU_PRIVACY_RETENTION_DAYS: '7',
        EU_PRIVACY_SUPPORT_MODE: supportMode ? '1' : '0',
        EU_PRIVACY_STATUS_APP_PILOT: statusAppPilot ? '1' : '0'
      }
    });

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server did not exit within ${timeoutMs}ms; stderr: ${err}`));
    }, timeoutMs);

    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (err += b));
    child.once('error', reject);
    child.once('close', () => {
      clearTimeout(timer);
      const lines = out.split('\n').filter((l) => l.trim());
      try {
        resolve({ responses: lines.map((l) => JSON.parse(l)), stderr: err, raw: lines });
      } catch (e) {
        reject(new Error(`server emitted non JSON output: ${JSON.stringify(out.slice(0, 400))}`));
      }
    });

    let received = 0;
    const expected = messages.reduce((sum, msg) => sum + (typeof msg === 'string'
      ? msg.split('\n').filter((line) => line.trim()).length
      : (Object.hasOwn(msg, 'id') ? 1 : 0)), 0);
    child.stdout.on('data', () => {
      received = out.split('\n').filter((line) => line.trim()).length;
      // EOF is a host shutdown/cancellation, not a normal tool completion.
      // Keep stdio open until the asynchronous calls have returned.
      if (received >= expected) child.stdin.end();
    });
    for (const msg of messages) {
      child.stdin.write(typeof msg === 'string' ? `${msg}\n` : `${JSON.stringify(msg)}\n`);
    }
    if (!expected) child.stdin.end();
  });
}

const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
const { publicProgress: continuationProgress } = createBatchProgress({
  deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review', mappingPendingStatus: 'mapping_pending',
  liveLocalExecutor: () => false, publishedPackageRecord: () => null
});
function continuedFixture(otherStatus) {
  const items = ['deferred_review', 'released', 'released', 'stopped', ...(otherStatus ? [otherStatus] : [])]
    .map(status => ({ status }));
  return { ok: true, ...continuationProgress({ token: 'a'.repeat(64), items }, { skipResultProjection: true }) };
}
const continuationRequest = () => rpc(1, 'tools/call', {
  name: 'continue_most_recent_document_batch', arguments: { confirmed: true }
});
function assertPrivateContinuationFieldsAbsent(responses) {
  assert.doesNotMatch(JSON.stringify(responses), /batch_token|read_capability|source_path|PRIVATE_RESPONSE_SENTINEL|aaaaaaaa/u);
}

async function main() {
  for (const cancelTool of [false, true]) await testAsync(`MCP completed-batch picker stays responsive and honours ${cancelTool ? 'cancel tool' : 'host notification'}`, async () => {
    const { responses, stderr } = await talk([
      rpc(1, 'tools/call', { name: 'start_completed_local_results_handoff', arguments: {} }),
      rpc(2, 'ping'),
      rpc(3, 'tools/call', { name: 'start_completed_local_results_handoff', arguments: {} }),
      cancelTool ? rpc(4, 'tools/call', { name: 'cancel_local_results_handoff', arguments: {} })
        : { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }
    ], { handoffFixture: true, supportMode: false });
    assert.strictEqual(stderr, '', 'cancelled picker cannot reach result reads');
    assert.strictEqual(responses.length, cancelTool ? 4 : 3);
    assert.ok(responses.findIndex(r => r.id === 2) < responses.findIndex(r => r.id === 1), 'ping completes while picker is pending');
    const first = responses.find(r => r.id === 1).result;
    assert.strictEqual(first.isError, true);
    assert.match(first.structuredContent.message, /abgebrochen/);
    assert.strictEqual(first.structuredContent.raw_content_sent_to_claude, false);
    assert.strictEqual(responses.find(r => r.id === 3).result.structuredContent.error, 'local_handoff_active');
    assert.doesNotMatch(JSON.stringify(responses), /batch_token|read_capability|aaaaaaa|bbbbbbb/);
  });

  for (const source_kind of ['files', 'folder']) await testAsync(`MCP cancellation reaches the pending ${source_kind} picker and prevents intake`, async () => {
    const { responses, stderr } = await talk([
      rpc(1, 'tools/call', { name: 'start_document_batch_from_picker', arguments: { source_kind } }),
      rpc(2, 'ping'),
      rpc(3, 'tools/call', { name: 'start_document_batch_from_picker', arguments: { source_kind } }),
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }
    ], { localStartFixture: true, waitingPickerFixture: true, supportMode: false });
    assert.strictEqual(stderr, '');
    assert.strictEqual(responses.length, 3, 'the cancellation notification has no response');
    const first = responses.find((response) => response.id === 1).result.structuredContent;
    const duplicate = responses.find((response) => response.id === 3).result.structuredContent;
    assert.strictEqual(first.error, 'local_selection_cancelled');
    assert.strictEqual(first.local_processing_started, false);
    assert.strictEqual(first.next_action, 'no_action');
    assert.strictEqual(duplicate.error, 'batch_active');
    assert.strictEqual(duplicate.local_processing_started, false);
    assert.doesNotMatch(JSON.stringify(responses), /synthetic-private-source|batch_token/);
  });

  await testAsync('server startup removes an abandoned private working copy', async () => {
    const jobs = path.join(root, 'localapp', 'SecureDataMsg', 'jobs');
    const orphan = path.join(jobs, 'startup_12345678');
    fs.mkdirSync(orphan, { recursive: true });
    fs.writeFileSync(path.join(orphan, 'source.txt'), 'private source after crash');
    fs.writeFileSync(path.join(orphan, '.owner.json'), JSON.stringify({
      pid: 2147483647,
      created_at: new Date().toISOString(),
      nonce: 'd'.repeat(32)
    }));
    const { responses, stderr } = await talk([rpc(1, 'ping')]);
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(stderr, '');
    assert.strictEqual(fs.existsSync(orphan), false);
  });

  await testAsync('server startup preserves and exposes an abandoned historical claim before accepting requests', async () => {
    // A real upgrade starts without the RC55 completion marker. Keep this
    // fixture isolated from the preceding fresh-install startup.
    const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-mcp-legacy-'));
    const input = path.join(legacyRoot, 'Input');
    const jobs = path.join(legacyRoot, 'localapp', 'SecureDataMsg', 'jobs');
    const jobId = 'crashed_abcdef12';
    fs.mkdirSync(input, { recursive: true });
    const hidden = path.join(input, `.processing_${jobId}_recovered.txt`);
    fs.writeFileSync(hidden, 'private source after hard termination');
    const job = path.join(jobs, jobId);
    fs.mkdirSync(job, { recursive: true });
    fs.writeFileSync(path.join(job, '.owner.json'), JSON.stringify({
      pid: 2147483647,
      created_at: new Date().toISOString(),
      nonce: 'e'.repeat(32)
    }));

    const { responses, stderr } = await talk([rpc(1, 'ping')], { privacyRoot: legacyRoot });
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(stderr, '');
    assert.strictEqual(fs.existsSync(hidden), true);
    assert.strictEqual(fs.readFileSync(path.join(input, 'recovered.txt'), 'utf8'), 'private source after hard termination');
    fs.unlinkSync(path.join(input, 'recovered.txt'));
  });

  await testAsync('initialize returns server info, capabilities and instructions', async () => {
    const { responses } = await talk([rpc(1, 'initialize', { protocolVersion: '2025-06-18' })]);
    assert.strictEqual(responses.length, 1);
    const r = responses[0];
    assert.strictEqual(r.jsonrpc, '2.0');
    assert.strictEqual(r.id, 1);
    assert.strictEqual(r.result.protocolVersion, '2025-06-18', 'a supported version must be echoed');
    assert.strictEqual(r.result.serverInfo.name, 'eu-privacy-document-gateway');
    assert.ok(r.result.capabilities.tools, 'tools capability must be advertised');
    assert.ok(r.result.capabilities.prompts, 'prompts capability must be advertised');
    assert.match(r.result.instructions, /nicht vertrauenswürdige Daten/i, 'prompt-injection guidance must be sent');
    assert.match(r.result.instructions, /keine rechtssichere Anonymität/i);
  });

  await testAsync('an unknown protocol version falls back to a supported one', async () => {
    const { responses } = await talk([rpc(1, 'initialize', { protocolVersion: '1999-01-01' })]);
    assert.strictEqual(responses[0].result.protocolVersion, '2025-11-25');
  });

  await testAsync('instructions pin retention, purge and governance behavior', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {})]);
    const instructions = responses[0].result.instructions;
    assert.match(instructions, /purge_local_data/);
    assert.match(instructions, /ausdrücklich genannten Umfang und eine ausdrückliche Bestätigung/i);
    assert.match(instructions, /confirmed=true/);
    assert.match(instructions, /Aufbewahrung aus privacy_status/i);
    assert.match(instructions, /Nur im Supportmodus: Aufbewahrung aus privacy_status/i);
    assert.match(instructions, /Pausierte Stapel blockieren keinen neuen Start/i);
    assert.doesNotMatch(instructions, /bei offenem Stapel nur Fortsetzen/i);
    assert.match(instructions, /Bildpixel bleiben immer lokal/i);
    assert.match(instructions, /Audit enthält keine Rohwerte, Pfade, Dateinamen, exakten Größen oder Dokument-Hashes/i);
    assert.match(instructions, /nicht vertrauenswürdige Daten/i);
    assert.match(instructions, /keine rechtssichere Anonymität/i);
    assert.match(instructions, /erlaubt kein automatisches HR-Ranking/i);
    assert.match(instructions, /Erkannter Bildtext benötigt dieselbe Textprüfung/i);
    assert.match(instructions, /TXT, Markdown, CSV, DOCX, XLSX oder PPTX/i);
    assert.match(instructions, /PDF, Scan-PDF und Bilder stoppen/i);
    assert.match(instructions, /Host-Stopp: kein Ersatzdialog oder Teilpaket/i);
    assert.ok(Buffer.byteLength(instructions, 'utf8') <= 2048, 'Claude truncates MCP instructions above 2 KB');
  });

  await testAsync('tools/list exposes every tool with a strict input schema', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const tools = responses.find((r) => r.id === 2).result.tools;
    assert.strictEqual(tools.length, 27, `expected exactly 27 tools, got ${tools.length}`);
    assert.ok(!tools.some((tool) => tool.name === 'open_input_folder'));
    assert.ok(tools.some((tool) => tool.name === 'open_export_folder'));
    assert.ok(tools.some((tool) => tool.name === 'configure_privacy_folder'));
    assert.ok(tools.some((tool) => tool.name === 'configure_result_folder'));
    assert.ok(tools.some((tool) => tool.name === 'open_result_folder'));
    assert.ok(tools.some((tool) => tool.name === 'start_document_batch_from_picker'));
    assert.ok(tools.some((tool) => tool.name === 'continue_anonymized_batch_in_chat'));
    assert.ok(tools.some((tool) => tool.name === 'start_completed_local_results_handoff'));
    assert.ok(tools.some((tool) => tool.name === 'continue_local_results_handoff'));
    assert.ok(!tools.some((tool) => tool.name === 'prepare_local_document'));
    assert.ok(!tools.some((tool) => tool.name === 'anonymize_all_documents'));
    assert.ok(!tools.some((tool) => tool.name === 'anonymize_next_document'));
    assert.ok(!tools.some((tool) => tool.name === 'list_anonymized_packages'));
    assert.ok(!tools.some((tool) => tool.name === 'begin_document_batch'));
    assert.ok(!tools.some((tool) => tool.name === 'start_document_batch_processing'));
    assert.ok(tools.some((tool) => tool.name === 'document_batch_status'));
    assert.ok(tools.some((tool) => tool.name === 'list_document_batch_results'));
    assert.ok(tools.some((tool) => tool.name === 'acknowledge_batch_document'));
    assert.ok(tools.some((tool) => tool.name === 'acknowledge_batch_documents'));
    assert.ok(tools.some((tool) => tool.name === 'read_anonymized_documents'));
    assert.ok(tools.some((tool) => tool.name === 'review_deferred_document_batch'));
    assert.ok(tools.some((tool) => tool.name === 'continue_most_recent_document_batch'));
    assert.ok(tools.some((tool) => tool.name === 'discard_incomplete_document_batches'));
    assert.ok(tools.some((tool) => tool.name === 'purge_local_data'));
    assert.ok(tools.some((tool) => tool.name === 'export_diagnostic_package'));
    assert.ok(!tools.some((tool) => tool.name === 'approve_visual_asset'));
    for (const tool of tools) {
      assert.ok(tool.name, 'tool without a name');
      assert.ok(tool.description, `tool ${tool.name} has no description`);
      assert.strictEqual(tool.inputSchema.type, 'object', `tool ${tool.name} schema is not an object`);
      assert.strictEqual(
        tool.inputSchema.additionalProperties,
        false,
        `tool ${tool.name} accepts unknown arguments`
      );
      assert.ok(tool.annotations, `tool ${tool.name} has no annotations`);
      assert.strictEqual(typeof tool.title, 'string', `tool ${tool.name} has no title`);
      assert.ok(tool.title.length > 0, `tool ${tool.name} has an empty title`);
      for (const field of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
        assert.strictEqual(typeof tool.annotations[field], 'boolean', `tool ${tool.name} has no boolean ${field}`);
      }
      assert.strictEqual(tool.annotations.openWorldHint, false, `tool ${tool.name} must be closed world`);
    }
    const acknowledge = tools.find((tool) => tool.name === 'acknowledge_batch_document');
    assert.deepStrictEqual(acknowledge.inputSchema.required, ['batch_token', 'package_id']);
    const continueMostRecent = tools.find((tool) => tool.name === 'continue_most_recent_document_batch');
    assert.deepStrictEqual(continueMostRecent.inputSchema.required, ['confirmed']);
    assert.strictEqual(continueMostRecent.inputSchema.properties.confirmed.const, true);
    const resume = tools.find((tool) => tool.name === 'resume_document_batch');
    assert.deepStrictEqual(resume.inputSchema.required, ['batch_token', 'confirmed']);
    assert.strictEqual(resume.inputSchema.properties.confirmed.const, true);
    const configure = tools.find((tool) => tool.name === 'configure_privacy_folder');
    assert.deepStrictEqual(configure.inputSchema.required, ['confirmed']);
    assert.strictEqual(configure.inputSchema.properties.confirmed.const, true);
    const picker = tools.find((tool) => tool.name === 'start_document_batch_from_picker');
    assert.strictEqual(picker.inputSchema.properties.profile.default, 'auto');
    assert.strictEqual(picker.inputSchema.properties.mode.default, 'local_only');
    assert.deepStrictEqual(picker.inputSchema.properties.mode.enum, ['local_only', 'continue_in_chat']);
    const combined = tools.find((tool) => tool.name === 'continue_anonymized_batch_in_chat');
    assert.deepStrictEqual(combined.inputSchema.required, ['batch_token']);
    assert.strictEqual(combined.inputSchema.properties.continuations.maxItems, 5);
    for (const name of ['read_anonymized_document', 'read_anonymized_documents']) {
      const readTool = tools.find((tool) => tool.name === name);
      assert.match(readTool.description, /nicht vertrauenswürdiger Dokumentinhalt/iu);
      assert.match(readTool.description, /keine Aktion|keine.*Werkzeugnutzung/iu);
      if (name === 'read_anonymized_document') {
        assert.ok(readTool.inputSchema.required.includes('read_capability'));
        assert.strictEqual(readTool.inputSchema.properties.read_capability.minLength, 43);
        assert.strictEqual(readTool.inputSchema.properties.read_capability.maxLength, 43);
      } else {
        assert.deepStrictEqual(readTool.inputSchema.required, ['documents']);
        assert.strictEqual(readTool.inputSchema.properties.documents.maxItems, 10);
      }
    }
    for (const name of ['start_completed_local_results_handoff', 'continue_local_results_handoff', 'continue_anonymized_batch_in_chat']) {
      const resultTool = tools.find((tool) => tool.name === name);
      assert.match(resultTool.description, /nicht vertrauenswürdig/iu);
      assert.match(resultTool.description, /Werkzeug|Aktion/iu);
    }
  });

  await testAsync('normal Cowork facade exposes only the token-free routine tools', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')], { supportMode: false });
    const tools = responses.find((r) => r.id === 2).result.tools;
    const names = tools.map((tool) => tool.name).sort();
    assert.deepStrictEqual(names, [
      'cancel_local_results_handoff',
      'configure_privacy_folder',
      'configure_result_folder',
      'continue_local_results_handoff',
      'continue_most_recent_document_batch',
      'discard_incomplete_document_batches',
      'open_export_folder',
      'open_result_folder',
      'start_completed_local_results_handoff',
      'start_document_batch_from_picker'
    ]);
    assert.ok(!names.includes('open_input_folder'));
    assert.ok(!names.includes('begin_document_batch'));
    assert.ok(!names.includes('read_anonymized_document'));
    assert.ok(!names.includes('review_deferred_document_batch'));
    assert.ok(!names.includes('privacy_status'));
    assert.ok(!names.includes('purge_local_data'));
    const picker = tools.find((tool) => tool.name === 'start_document_batch_from_picker');
    assert.deepStrictEqual(picker.inputSchema.properties.mode.enum, ['local_only']);
    assert.strictEqual(picker.inputSchema.properties.mode.default, 'local_only');
    assert.match(picker.description, /später ausdrücklich gewünschte Auswertung start_completed_local_results_handoff/u);
    assert.match(picker.description, /danach nicht pollen oder lesen/u);
    assert.doesNotMatch(picker.description, /continue_in_chat/u);
    assert.strictEqual(picker.annotations.readOnlyHint, false);
    assert.strictEqual(picker.inputSchema.additionalProperties, false);
  });

  await testAsync('Cowork opens only the exact current completed result run', async () => {
    const { responses, stderr } = await talk([rpc(1, 'tools/call', {
      name: 'open_result_folder', arguments: {}
    })], { supportMode: false, resultOpenFixture: 'available' });
    assert.strictEqual(responses[0].result.isError, false);
    assert.deepStrictEqual(responses[0].result.structuredContent,
      { ok: true, handoff_confirmed: true });
    assert.strictEqual(stderr, 'EXACT_PLUGIN_RUN_RESOLVEDEXACT_PLUGIN_RUN_OPENED');
    assert.doesNotMatch(JSON.stringify(responses), /exact-plugin-run|eu-privacy-mcp/u,
      'the local result path never crosses the MCP boundary');
  });

  await testAsync('Cowork never falls back to stale results when the current run is unavailable', async () => {
    const { responses, stderr } = await talk([rpc(1, 'tools/call', {
      name: 'open_result_folder', arguments: {}
    })], { supportMode: false, resultOpenFixture: 'missing' });
    assert.strictEqual(responses[0].result.isError, true);
    assert.match(responses[0].result.structuredContent.message,
      /aktuellen Cowork-Lauf.*kein vollständig bereitgestellter Ergebnisordner/iu);
    assert.strictEqual(stderr, 'EXACT_PLUGIN_RUN_RESOLVED');
    assert.doesNotMatch(JSON.stringify(responses), /exact-plugin-run|eu-privacy-mcp/u);
  });

  await testAsync('a stale normal-mode continue_in_chat start is still token-free local_only over stdio', async () => {
    const { responses } = await talk([rpc(1, 'tools/call', {
      name: 'start_document_batch_from_picker', arguments: { mode: 'continue_in_chat' }
    })], { supportMode: false, localStartFixture: true });
    const result = responses[0].result;
    assert.notStrictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.mode, 'local_only');
    assert.strictEqual(result.structuredContent.local_processing_started, false);
    assert.strictEqual(result.structuredContent.next_action, 'local_intake_accepted_checkpoint_pending');
    assert.doesNotMatch(JSON.stringify(result), /batch_token|synthetic-private-source|continue_in_chat|aaaaaaaa/u);
  });

  await testAsync('explicit support mode preserves the legacy start response contract', async () => {
    const { responses } = await talk([rpc(1, 'tools/call', {
      name: 'start_document_batch_from_picker', arguments: { mode: 'continue_in_chat' }
    })], { supportMode: true, localStartFixture: true });
    const result = responses[0].result.structuredContent;
    assert.strictEqual(result.mode, 'continue_in_chat');
    assert.strictEqual(result.local_processing_started, true);
    assert.strictEqual(result.batch_token, 'a'.repeat(64));
    assert.strictEqual(result.next_action, 'wait_for_local_release_before_continue_in_chat');
    assert.doesNotMatch(JSON.stringify(result), /synthetic-private-source/u);
  });

  await testAsync('Cowork refuses a worker response without the private acknowledgement promise', async () => {
    const { responses } = await talk([rpc(1, 'tools/call', {
      name: 'start_document_batch_from_picker', arguments: { mode: 'local_only' }
    })], { supportMode: false, invalidStartFixture: true });
    const result = responses[0].result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.ok, false);
    assert.strictEqual(result.structuredContent.local_processing_started, false);
    assert.strictEqual(result.structuredContent.next_action, 'restart_only_on_explicit_request');
    assert.doesNotMatch(JSON.stringify(result), /batch_token|synthetic-private-source|aaaaaaaa/u);
  });

  await testAsync('normal Cowork rejects removed legacy and support-only tools', async () => {
    const { responses } = await talk([
      rpc(1, 'tools/call', { name: 'begin_document_batch', arguments: { expected_count: 1 } }),
      rpc(2, 'tools/call', { name: 'open_privacy_folder', arguments: {} }),
      rpc(3, 'tools/call', { name: 'privacy_status', arguments: {} })
    ], { supportMode: false });
    assert.strictEqual(responses.length, 3);
    for (const response of responses) {
      assert.strictEqual(response.result.isError, true);
      assert.match(response.result.structuredContent.message, /lokalen Supportmodus/u);
    }
  });

  await testAsync('every normal-mode error result carries a content-free diagnostic with a fixed cause', async () => {
    const { CAUSE_CODES, PHASES } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
    const { responses } = await talk([
      rpc(1, 'tools/call', { name: 'continue_most_recent_document_batch', arguments: { confirmed: true } })
    ], { supportMode: false });
    assert.strictEqual(responses.length, 1);
    const result = responses[0].result;
    assert.strictEqual(result.isError, true);
    const body = result.structuredContent;
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, 'no_incomplete_batch');
    const diagnostic = body.diagnostic;
    assert.ok(diagnostic, 'an error result must carry the diagnostic envelope');
    assert.strictEqual(diagnostic.cause, 'NO_INCOMPLETE_BATCH');
    assert.ok(CAUSE_CODES.includes(diagnostic.cause) && PHASES.includes(diagnostic.phase));
    assert.match(diagnostic.gateway_version, /^\d+\.\d+\.\d+/u);
    assert.ok(typeof diagnostic.hint === 'string' && diagnostic.hint.length > 10);
    assert.deepStrictEqual(Object.keys(diagnostic).sort(), ['at', 'cause', 'gateway_version', 'hint', 'phase', 'recorded']);
    assert.doesNotMatch(JSON.stringify(result), /[A-Za-z]:\\|\/Users\/|\.txt|\.docx|[a-f0-9]{64}/u, 'diagnostics stay free of paths, names, hashes and tokens');
  });

  await testAsync('error results of gateway modules without envelope knowledge are completed centrally', async () => {
    const { responses } = await talk([
      rpc(1, 'tools/call', { name: 'continue_local_results_handoff', arguments: {} }),
      rpc(2, 'tools/call', { name: 'start_completed_local_results_handoff', arguments: {} })
    ], { supportMode: false });
    assert.strictEqual(responses.length, 2);
    const byId = new Map(responses.map((r) => [r.id, r.result]));
    const next = byId.get(1).structuredContent;
    assert.strictEqual(byId.get(1).isError, true);
    assert.strictEqual(next.ok, false);
    assert.strictEqual(next.error, 'no_active_local_handoff');
    assert.strictEqual(next.diagnostic?.cause, 'NO_ACTIVE_LOCAL_HANDOFF');
    assert.strictEqual(next.diagnostic?.phase, 'handoff');
    const start = byId.get(2).structuredContent;
    assert.strictEqual(start.ok, false);
    assert.ok(start.diagnostic, 'a handoff start failure must carry the envelope');
    assert.strictEqual(start.diagnostic.cause, start.error === 'no_completed_local_batch' ? 'NO_COMPLETED_LOCAL_BATCH' : start.diagnostic.cause);
    assert.doesNotMatch(JSON.stringify(responses), /[A-Za-z]:\\|\/Users\/|\.txt|\.docx|[a-f0-9]{64}/u);
  });

  await testAsync('normal Cowork rejects all 17 support tools even with model-supplied support flags', async () => {
    const supportNames = [
      'privacy_status', 'diagnostic_status', 'export_diagnostic_package', 'open_privacy_folder',
      'continue_anonymized_batch_in_chat', 'document_batch_status', 'list_document_batch_results',
      'review_deferred_document_batch', 'acknowledge_batch_document', 'resume_document_batch',
      'read_anonymized_document', 'read_anonymized_documents', 'acknowledge_batch_documents',
      'list_visual_review_items', 'open_visual_review_folder', 'purge_local_data', 'open_output_folder'
    ];
    const { responses } = await talk(supportNames.map((name, index) => rpc(index + 1, 'tools/call', {
      name, arguments: { confirmed: true, supportMode: true, EU_PRIVACY_SUPPORT_MODE: '1' }
    })), { supportMode: false });
    assert.strictEqual(responses.length, supportNames.length);
    for (const response of responses) {
      assert.strictEqual(response.result.isError, true);
      assert.match(response.result.structuredContent.message, /lokalen Supportmodus/u);
      assert.strictEqual(response.result.structuredContent.raw_content_sent_to_claude, false);
    }
  });

  await testAsync('default and support mode never expose status-app resources even for a capable host', async () => {
    const uri = 'ui://data-secure/status-card-v1.html';
    const capabilities = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };
    for (const options of [{ supportMode: false }, { supportMode: true, statusAppPilot: true }]) {
      const { responses } = await talk([
        rpc(1, 'initialize', { capabilities }), rpc(2, 'tools/list'),
        rpc(3, 'resources/list'), rpc(4, 'resources/read', { uri })
      ], options);
      assert.strictEqual(responses.find((r) => r.id === 1).result.capabilities.resources, undefined);
      for (const tool of responses.find((r) => r.id === 2).result.tools) assert.strictEqual(tool._meta?.ui, undefined);
      assert.strictEqual(responses.find((r) => r.id === 3).error.code, -32601);
      assert.strictEqual(responses.find((r) => r.id === 4).error.code, -32601);
    }
  });

  await testAsync('discovery without initialize cannot activate the optional status app', async () => {
    const capabilities = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };
    const { responses } = await talk([
      rpc(1, 'server/discover', { capabilities }), rpc(2, 'tools/list'),
      rpc(3, 'resources/list'), rpc(4, 'resources/read', { uri: 'ui://data-secure/status-card-v1.html' })
    ], { supportMode: false, statusAppPilot: true });
    assert.strictEqual(responses.find((r) => r.id === 1).result.capabilities.resources, undefined);
    for (const tool of responses.find((r) => r.id === 2).result.tools) assert.strictEqual(tool._meta?.ui, undefined);
    assert.strictEqual(responses.find((r) => r.id === 3).error.code, -32601);
    assert.strictEqual(responses.find((r) => r.id === 4).error.code, -32601);
  });

  await testAsync('negotiated pilot exposes one passive resource and keeps picker text response unchanged', async () => {
    const uri = 'ui://data-secure/status-card-v1.html';
    const capabilities = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };
    const { responses } = await talk([
      rpc(1, 'initialize', { capabilities }), rpc(2, 'tools/list'), rpc(3, 'resources/list'),
      rpc(4, 'resources/read', { uri }), rpc(5, 'resources/read', { uri: `${uri}?path=../private` }),
      rpc(6, 'tools/call', { name: 'start_document_batch_from_picker', arguments: {} }),
      rpc(7, 'tools/call', { name: 'cancel_local_results_handoff', arguments: {} })
    ], { supportMode: false, statusAppPilot: true, localStartFixture: true });
    const byId = new Map(responses.map((response) => [response.id, response]));
    assert.deepStrictEqual(byId.get(1).result.capabilities.resources, { subscribe: false, listChanged: false });
    const tools = byId.get(2).result.tools;
    assert.strictEqual(tools.length, 10);
    for (const tool of tools) {
      assert.deepStrictEqual(tool._meta.ui.visibility, ['model']);
      assert.strictEqual(tool._meta.ui.resourceUri, tool.name === 'start_document_batch_from_picker' ? uri : undefined);
    }
    assert.strictEqual(byId.get(3).result.resources.length, 1);
    assert.strictEqual(byId.get(4).result.contents[0].uri, uri);
    assert.strictEqual(byId.get(4).result.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.deepStrictEqual(byId.get(4).result.contents[0]._meta.ui.csp, {
      connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: []
    });
    assert.strictEqual(byId.get(5).error.code, -32602);
    const normal = await talk([rpc(1, 'tools/call', { name: 'start_document_batch_from_picker', arguments: {} })], {
      supportMode: false, localStartFixture: true
    });
    const decorated = byId.get(6).result;
    assert.deepStrictEqual(decorated.content, normal.responses[0].result.content);
    assert.deepStrictEqual(decorated.structuredContent, normal.responses[0].result.structuredContent);
    assert.deepStrictEqual(decorated._meta['datasecure/status'], {
      schema: 'datasecure-status-card/v1', locale: 'de', state: 'local_intake_accepted', snapshot: true
    });
    assert.strictEqual(byId.get(7).result._meta?.['datasecure/status'], undefined);
  });

  await testAsync('read tools are annotated read only and write tools are not', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const byName = Object.fromEntries(responses.find((r) => r.id === 2).result.tools.map((t) => [t.name, t]));
    for (const name of ['privacy_status', 'diagnostic_status', 'document_batch_status', 'read_anonymized_document', 'read_anonymized_documents']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, true, `${name} must be read only`);
    }
    for (const name of ['start_completed_local_results_handoff', 'continue_local_results_handoff']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, false, `${name} starts or advances an intentional handoff`);
      assert.strictEqual(byName[name].annotations.idempotentHint, false, `${name} advances local handoff state`);
    }
    for (const name of ['list_document_batch_results', 'purge_local_data']) {
      assert.strictEqual(byName[name].annotations.readOnlyHint, false, `${name} must not claim to be read only`);
    }
    for (const name of ['review_deferred_document_batch', 'acknowledge_batch_document', 'acknowledge_batch_documents', 'discard_incomplete_document_batches', 'purge_local_data']) {
      assert.strictEqual(byName[name].annotations.destructiveHint, true, `${name} must disclose destructive local state changes`);
    }
    for (const name of ['privacy_status', 'diagnostic_status', 'document_batch_status', 'read_anonymized_document', 'read_anonymized_documents', 'list_visual_review_items']) {
      assert.strictEqual(byName[name].annotations.idempotentHint, true, `${name} must disclose idempotent reads`);
      assert.strictEqual(byName[name].annotations.destructiveHint, false, `${name} must be non-destructive`);
    }
    for (const name of ['open_privacy_folder', 'open_output_folder', 'open_export_folder', 'open_visual_review_folder', 'configure_privacy_folder']) {
      assert.strictEqual(byName[name].annotations.idempotentHint, false, `${name} opens a new local UI instance`);
      assert.strictEqual(byName[name].annotations.destructiveHint, false, `${name} only opens a local folder`);
    }
  });

  await testAsync('model-callable human approval is absent and purge remains explicit', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    const tools = responses.find((r) => r.id === 2).result.tools;
    assert.ok(!tools.some((tool) => tool.name === 'approve_visual_asset'));
    assert.ok(!tools.some((tool) => tool.name === 'read_anonymized_asset'));
    assert.ok(!tools.some((tool) => tool.name === 'list_anonymized_assets'));
    const purge = tools.find((t) => t.name === 'purge_local_data');
    assert.deepStrictEqual(purge.inputSchema.required, ['confirmed']);
    assert.strictEqual(purge.inputSchema.properties.confirmed.const, true);
    assert.deepStrictEqual(purge.inputSchema.properties.scope.enum, ['processed', 'output', 'review', 'all']);
  });

  await testAsync('invalid handoff arguments never invoke a stateful action over real stdio', async () => {
    const names = ['start_completed_local_results_handoff', 'continue_local_results_handoff', 'cancel_local_results_handoff'];
    for (const supportMode of [false, true]) {
      let id = 0;
      const messages = names.flatMap(name => [null, [], true, { unknown_private_value: 'private sentinel' }]
        .map(args => rpc(++id, 'tools/call', { name, arguments: args })));
      const { responses, stderr } = await talk(messages, { supportMode, inputGuardFixture: true });
      assert.strictEqual(responses.length, messages.length);
      assert.doesNotMatch(stderr, /GUARD_ACTION/u);
      for (const response of responses) {
        assert.strictEqual(response.result.isError, true);
        assert.strictEqual(response.result.structuredContent.error, 'invalid_tool_arguments');
        assert.strictEqual(response.result.structuredContent.diagnostic.cause, 'MCP_ARGUMENT_INVALID');
      }
      assert.doesNotMatch(JSON.stringify(responses), /private sentinel|unknown_private_value/u);
    }
    const valid = await talk([rpc(1, 'tools/call', { name: names[1] })], { supportMode: false, inputGuardFixture: true });
    assert.match(valid.stderr, /GUARD_ACTION/u); // Prove the dependency substitution really is connected.
    assert.strictEqual(valid.responses[0].result.structuredContent.ok, true);
    const malformed = await talk([rpc(1, 'tools/call', []), rpc(2, 'tools/call', { name: null })]);
    assert.ok(malformed.responses.every(r => r.error?.code === -32602));
  });

  for (const kind of ['intake', 'batch', 'review']) {
    await testAsync(`${kind} ACK diagnostics use typed codes or exact legacy text and never promise that processing did not start`, async () => {
      const cases = [
        [{ code: 'LOCAL_IPC_ACK_TIMEOUT', message: 'cancel PRIVATE_RESPONSE_SENTINEL' }, 'LOCAL_IPC_ACK_TIMEOUT'],
        [{ code: 'LOCAL_IPC_ACK_CANCELLED', message: 'timeout PRIVATE_RESPONSE_SENTINEL' }, 'LOCAL_IPC_ACK_CANCELLED'],
        [{ code: 'EPERM', message: 'bounded IPC acknowledgement timeout' }, 'LOCAL_WORKER_SPAWN_FAILED'],
        [{ message: 'bounded IPC acknowledgement timeout' }, 'LOCAL_IPC_ACK_TIMEOUT'],
        [{ message: 'IPC acknowledgement cancelled' }, 'LOCAL_IPC_ACK_CANCELLED'],
        [{ message: 'timeout cancel PRIVATE_RESPONSE_SENTINEL' }, 'LOCAL_WORKER_SPAWN_FAILED'],
        [{ code: 'LOCAL_QUEUE_SCHEMA_INVALID', message: 'PRIVATE_RESPONSE_SENTINEL' },
          kind === 'intake' ? 'LOCAL_QUEUE_SCHEMA_INVALID' : 'LOCAL_WORKER_SPAWN_FAILED']
      ];
      for (const supportMode of [false, true]) for (const [ackErrorFixture, expectedCause] of cases) {
        const request = kind === 'intake'
          ? { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'start_document_batch_from_picker', arguments: {} } }
          : continuationRequest();
        const { responses } = await talk([request], {
          supportMode, ackErrorFixture, localStartFixture: kind === 'intake',
          continuationFixture: kind === 'intake' ? null : continuedFixture(kind === 'batch' ? 'pending' : null)
        });
        assert.strictEqual(responses.length, 1);
        assert.strictEqual(responses[0].result.isError, true);
        const result = responses[0].result.structuredContent;
        assert.strictEqual(result.error, 'local_start_failed');
        assert.strictEqual(result.diagnostic.cause, expectedCause);
        assert.strictEqual(result[kind === 'review' ? 'local_review_started' : 'local_processing_started'], false);
        assert.strictEqual(result.next_action, 'restart_only_on_explicit_request');
        assert.match(result.message, /nicht bestätigt.*Status prüfen/u);
        assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RESPONSE_SENTINEL|kein Stapel (?:wurde )?gestartet|kein Paket|wurde nicht gestartet|bounded IPC|EPERM/u);
        assertPrivateContinuationFieldsAbsent(responses);
      }
    });
  }

  await testAsync('Cowork continues pending work before review using the shared progress contract', async () => {
    for (const otherStatus of ['pending', 'retryable', 'processing', 'delivery_pending', 'mapping_pending', null]) {
      const state = { ...continuedFixture(otherStatus), awaiting_local_review: true };
      const { responses, stderr } = await talk([continuationRequest()], { supportMode: false, continuationFixture: state });
      assert.strictEqual(responses[0].result.structuredContent.ok, true);
      assert.match(stderr, otherStatus ? /BATCH_SELECTED/u : /REVIEW_SELECTED/u);
      assert.doesNotMatch(stderr, otherStatus ? /REVIEW_SELECTED/u : /BATCH_SELECTED/u);
      assert.strictEqual(responses[0].result.structuredContent.batch_total, otherStatus ? 5 : 4);
      assertPrivateContinuationFieldsAbsent(responses);
    }
  });

  for (const kind of ['batch', 'review']) {
    await testAsync(`${kind} continuation rejects missing or false start markers and missing or malformed ACK promises`, async () => {
      for (const continuationStartFixture of ['missing_ok', 'false_ok', 'string_ok', 'missing_marker', 'wrong_marker', 'string_marker',
        'missing_ack', 'null_ack', 'false_ack', 'wrong_then', 'null_response', 'throw']) {
        const { responses, stderr } = await talk([continuationRequest()], {
          supportMode: false, continuationFixture: continuedFixture(kind === 'batch' ? 'pending' : null), continuationStartFixture
        });
        assert.strictEqual(stderr, kind === 'batch' ? 'BATCH_SELECTED' : 'REVIEW_SELECTED');
        assert.strictEqual(responses[0].result.isError, true, continuationStartFixture);
        const result = responses[0].result.structuredContent;
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.error, 'local_start_failed');
        assert.strictEqual(result[kind === 'batch' ? 'local_processing_started' : 'local_review_started'], false);
        assert.strictEqual(result.diagnostic.cause, 'LOCAL_WORKER_SPAWN_FAILED');
        assertPrivateContinuationFieldsAbsent(responses);
      }
    });

    await testAsync(`${kind} continuation rejects a lost, timed out or cancelled ACK in normal and support mode`, async () => {
      for (const supportMode of [false, true]) {
        for (const continuationStartFixture of ['rejected_ack', 'timeout_ack', 'cancelled_ack']) {
          const messages = [continuationRequest()];
          if (continuationStartFixture === 'cancelled_ack') messages.push({
            jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 }
          });
          const { responses } = await talk(messages, {
            supportMode, continuationFixture: continuedFixture(kind === 'batch' ? 'pending' : null), continuationStartFixture
          });
          assert.strictEqual(responses.length, 1);
          assert.strictEqual(responses[0].result.isError, true);
          const result = responses[0].result.structuredContent;
          assert.strictEqual(result.ok, false);
          assert.strictEqual(result.error, 'local_start_failed');
          assert.strictEqual(result.diagnostic.cause,
            continuationStartFixture === 'cancelled_ack' ? 'LOCAL_IPC_ACK_CANCELLED'
              : continuationStartFixture === 'timeout_ack' ? 'LOCAL_IPC_ACK_TIMEOUT' : 'LOCAL_WORKER_SPAWN_FAILED');
          assertPrivateContinuationFieldsAbsent(responses);
        }
      }
    });

    await testAsync(`${kind} continuation waits for ACK and projects only public fields in normal and support mode`, async () => {
      for (const supportMode of [false, true]) {
        const fixture = { ...continuedFixture(kind === 'batch' ? 'pending' : null),
          source_path: 'PRIVATE_RESPONSE_SENTINEL', read_capability: 'PRIVATE_RESPONSE_SENTINEL',
          user_status: 'PRIVATE_RESPONSE_SENTINEL', next_action: 'PRIVATE_RESPONSE_SENTINEL',
          result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: kind === 'batch' ? 5 : 4,
            extra: 'PRIVATE_RESPONSE_SENTINEL' } };
        const { responses } = await talk([continuationRequest(), rpc(2, 'ping')], {
          supportMode, continuationFixture: fixture, continuationStartFixture: 'delayed_ack'
        });
        assert.deepStrictEqual(responses.map(response => response.id), [2, 1]);
        const result = responses[1].result;
        assert.strictEqual(result.isError, false);
        assert.strictEqual(result.structuredContent.ok, true);
        assert.strictEqual(result.structuredContent[kind === 'batch' ? 'local_processing_started' : 'local_review_started'], true);
        assert.strictEqual(result.structuredContent.completed, 3);
        assert.strictEqual(result.structuredContent.stopped, 1);
        assertPrivateContinuationFieldsAbsent(responses);
      }
    });
  }

  await testAsync('an actual lease refusal after terminal state change is never a successful MCP continuation', async () => {
    for (const supportMode of [false, true]) {
      const { responses, stderr } = await talk([continuationRequest()], {
        supportMode, continuationFixture: { ok: true,
          ...continuationProgress({ token: 'a'.repeat(64), items: [{ status: 'pending' }] }) },
        continuationStartFixture: 'lease_refused'
      });
      assert.strictEqual(stderr, 'BATCH_SELECTED');
      assert.strictEqual(responses[0].result.isError, true);
      const result = responses[0].result.structuredContent;
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.local_processing_started, false);
      assert.strictEqual(result.diagnostic.cause, 'BATCH_NOT_RUNNABLE');
      assertPrivateContinuationFieldsAbsent(responses);
    }
  });

  await testAsync('an actual failed continuation after a terminal race returns no private token and starts nothing', async () => {
    for (const supportMode of [false, true]) {
      const { responses, stderr } = await talk([continuationRequest()], { supportMode, continuationCoreRace: true });
      assert.strictEqual(stderr, '');
      assert.strictEqual(responses[0].result.isError, true);
      const result = responses[0].result.structuredContent;
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error, 'no_retryable_documents');
      assert.strictEqual(result.completed, 1);
      assert.strictEqual(result.complete, true);
      assert.strictEqual(result.diagnostic.cause, 'BATCH_NOT_RUNNABLE');
      assertPrivateContinuationFieldsAbsent(responses);
    }
  });

  await testAsync('failed continuation projects only fixed errors and public progress in normal and support mode', async () => {
    for (const supportMode of [false, true]) {
      for (const error of ['no_incomplete_batch', 'batch_review_required', 'PRIVATE_RESPONSE_SENTINEL']) {
        const progress = error === 'no_incomplete_batch' ? {} : continuedFixture(null);
        const fixture = { ...progress, ok: false, error,
          source_path: 'PRIVATE_RESPONSE_SENTINEL', read_capability: 'PRIVATE_RESPONSE_SENTINEL',
          message: 'PRIVATE_RESPONSE_SENTINEL', user_status: 'PRIVATE_RESPONSE_SENTINEL',
          next_action: 'PRIVATE_RESPONSE_SENTINEL', diagnostic: { private: 'PRIVATE_RESPONSE_SENTINEL' },
          result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 4,
            extra: 'PRIVATE_RESPONSE_SENTINEL' } };
        const { responses, stderr } = await talk([continuationRequest()], { supportMode, continuationFixture: fixture });
        assert.strictEqual(stderr, '');
        assert.strictEqual(responses[0].result.isError, true);
        const result = responses[0].result.structuredContent;
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.error, error === 'PRIVATE_RESPONSE_SENTINEL' ? 'batch_not_runnable' : error);
        assert.strictEqual(result.diagnostic.cause, error === 'no_incomplete_batch' ? 'NO_INCOMPLETE_BATCH' : 'BATCH_NOT_RUNNABLE');
        assert.strictEqual(result.completed, error === 'no_incomplete_batch' ? undefined : 3);
        assert.strictEqual(result.stopped, error === 'no_incomplete_batch' ? undefined : 1);
        assertPrivateContinuationFieldsAbsent(responses);
      }
    }
  });

  await testAsync('diagnostic export rejects missing confirmation before creating a local support package', async () => {
    const { responses } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/call', {
      name: 'export_diagnostic_package', arguments: {}
    })]);
    const result = responses.find((response) => response.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.error, 'invalid_tool_arguments');
  });

  await testAsync('purge_local_data protects historical sources and deletes only disposable scopes', async () => {
    const processed = path.join(root, 'Processed');
    const output = path.join(root, 'Output');
    fs.mkdirSync(processed, { recursive: true });
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(processed, 'purge-me.pdf'), 'local original');
    fs.mkdirSync(path.join(output, 'keep-package'), { recursive: true });
    fs.writeFileSync(path.join(output, 'keep-package', 'manifest.json'), '{}');

    const refused = await talk([
      rpc(1, 'tools/call', { name: 'purge_local_data', arguments: { scope: 'processed' } })
    ]);
    assert.strictEqual(refused.responses[0].result.isError, true);
    assert.ok(fs.existsSync(path.join(processed, 'purge-me.pdf')));

    const accepted = await talk([
      rpc(1, 'tools/call', {
        name: 'purge_local_data',
        arguments: { scope: 'processed', confirmed: true }
      })
    ]);
    const protectedResult = accepted.responses[0].result;
    assert.strictEqual(protectedResult.isError, true);
    assert.match(protectedResult.content[0].text, /Historische Quelldateien/);
    assert.ok(fs.existsSync(path.join(processed, 'purge-me.pdf')));
    assert.ok(fs.existsSync(path.join(output, 'keep-package', 'manifest.json')));

    const outputPurge = await talk([rpc(1, 'tools/call', {
      name: 'purge_local_data', arguments: { scope: 'output', confirmed: true }
    })]);
    const result = outputPurge.responses[0].result;
    assert.ok(!result.isError);
    assert.strictEqual(result.structuredContent.audit_retained, true);
    assert.ok(!fs.existsSync(path.join(output, 'keep-package')));
    assert.ok(fs.existsSync(path.join(processed, 'purge-me.pdf')));
  });

  await testAsync('resume_document_batch rejects a missing or false confirmation before it can resume work', async () => {
    const token = 'a'.repeat(64);
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'resume_document_batch', arguments: { batch_token: token, confirmed: false } })
    ]);
    const result = responses.find((response) => response.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
  });

  await testAsync('continue_most_recent_document_batch rejects a missing confirmation before it can select a local batch', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'continue_most_recent_document_batch', arguments: {} })
    ]);
    const result = responses.find((response) => response.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
  });

  await testAsync('tools/call privacy_status returns structured content without raw document data', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'privacy_status', arguments: {} })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.ok(Array.isArray(result.content), 'content array is required');
    assert.strictEqual(result.content[0].type, 'text');
    assert.strictEqual(result.structuredContent.ok, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
    assert.strictEqual(result.structuredContent.runtime_mode, 'host_node');
    assert.strictEqual(result.structuredContent.runtime_target, null);
    assert.strictEqual(result.structuredContent.runtime_dependency_install, true);
    assert.strictEqual(result.structuredContent.host_node_required, true);
    assert.strictEqual(result.structuredContent.parser_resource_boundary,
      process.platform === 'win32' ? 'windows_job_object' : 'node_heap_and_parent_timeout');
    assert.strictEqual(result.structuredContent.parser_hard_process_limits, process.platform === 'win32');
    assert.strictEqual(result.structuredContent.audit_schema, 'data-secure-audit-receipt/4');
    assert.strictEqual(result.structuredContent.privacy_ruleset, 'de-business/2');
    assert.strictEqual(result.structuredContent.credential_context_policy, 'credential-context/2');
    assert.strictEqual(typeof result.structuredContent.audit_receipts_retained, 'number');
    assert.strictEqual(typeof result.structuredContent.legacy_audit_pending, 'number');
    assert.strictEqual(typeof result.structuredContent.audit_migration_errors, 'number');
    assert.strictEqual(typeof result.structuredContent.recoverable_batches, 'number');
    assert.strictEqual(typeof result.structuredContent.batches_awaiting_resume, 'number');
    assert.strictEqual(typeof result.structuredContent.batches_awaiting_delivery, 'number');
    assert.strictEqual(typeof result.structuredContent.batch_processing_active, 'boolean');
    assert.strictEqual(typeof result.structuredContent.private_work_copy_cleanup_pending, 'number');
    assert.strictEqual(typeof result.structuredContent.expired_batch_cleanup_pending, 'number');
    assert.strictEqual(typeof result.structuredContent.audit_write_errors, 'number');
    assert.strictEqual(result.structuredContent.companion_api_version, 'data-secure-companion/1');
    assert.strictEqual(result.structuredContent.companion_phase, 'txt_docx_vertical_slice_ready');
    assert.strictEqual(result.structuredContent.companion_local_ui, process.platform === 'win32'
      ? 'native_picker_redaction_and_ambiguity_review'
      : ['darwin', 'linux'].includes(process.platform)
        ? 'native_picker_confirm_or_fail_closed_on_ambiguity'
        : 'unavailable');
    assert.deepStrictEqual(result.structuredContent.companion_supported_vertical_slice_inputs, ['TXT', 'Markdown (.md)', 'CSV', 'DOCX']);
    assert.strictEqual(result.structuredContent.companion_private_ipc, 'inherited_stdio_authenticated');
    assert.strictEqual(result.structuredContent.companion_binary_signing, 'not_implemented');
    assert.strictEqual(result.structuredContent.companion_job_retention, 'integrated');
    assert.strictEqual(typeof result.structuredContent.companion_job_retention_days, 'number');
    assert.strictEqual(typeof result.structuredContent.companion_jobs_due, 'number');
    assert.strictEqual(typeof result.structuredContent.companion_job_inspection_errors, 'number');
    assert.strictEqual(result.structuredContent.companion_model_can_review, false);
    assert.strictEqual(result.structuredContent.companion_model_can_release, false);
    assert.deepStrictEqual(result.structuredContent.supported_inputs, [
      'Word (.docx)',
      'Excel (.xlsx) als extrahiertes Markdown',
      'PowerPoint (.pptx) als extrahiertes Markdown',
      'Markdown (.md)',
      'CSV',
      'TXT'
    ]);
    assert.ok(!result.structuredContent.supported_inputs.includes('PDF'));
    assert.deepStrictEqual(result.structuredContent.blocked_inputs, [
      { format: 'PDF', reason: 'PDF_COVERAGE_UNVERIFIED' },
      { format: 'Scan-PDF und Bilder', reason: 'FORMAT_COVERAGE_UNVERIFIED' }
    ]);
    assert.strictEqual(result.structuredContent.visual_boundary,
      process.platform === 'win32' ? 'windows_job_object' : 'unavailable');
    assert.ok(!result.isError);
  });

  await testAsync('tools/call diagnostic_status exposes only bounded metadata', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'diagnostic_status', arguments: { limit: 5 } })
    ]);
    const result = responses.find((response) => response.id === 2).result.structuredContent;
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.retention_days, 14);
    assert.ok(result.events.length <= 5);
    assert.strictEqual(result.raw_content_logged, false);
    assert.strictEqual(result.filenames_logged, false);
    assert.strictEqual(result.paths_logged, false);
    assert.strictEqual(result.hashes_logged, false);
    assert.strictEqual(result.support_trace.enabled, true);
    assert.ok(result.support_trace.events.length > 0);
    assert.strictEqual(result.support_trace.raw_json_rpc_logged, false);
    assert.strictEqual(result.support_trace.arguments_logged, false);
    assert.strictEqual(result.support_trace.results_logged, false);
    assert.strictEqual(result.support_trace.tokens_logged, false);
  });

  await testAsync('removed Input intake tools stay unavailable in support mode', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'begin_document_batch', arguments: { expected_count: 1, profile: 'customer' } })
    ]);
    const r = responses.find((x) => x.id === 2);
    assert.ok(r.error, 'unknown tool must produce a JSON-RPC error');
    assert.strictEqual(r.error.code, -32602);
    assert.match(r.error.message, /Unbekanntes Werkzeug/u);
  });

  await testAsync('a failing tool reports isError and never leaks raw content', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'read_anonymized_document', arguments: { package_id: 'ds_' + 'a'.repeat(32), read_capability: 'a'.repeat(43) } })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.raw_content_sent_to_claude, false);
    assert.match(result.structuredContent.message, /Leseberechtigung/i, 'a safe german message is expected');
  });

  await testAsync('a path traversal package id is refused', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'read_anonymized_document', arguments: { package_id: '../Processed', read_capability: 'x'.repeat(43) } })
    ]);
    const result = responses.find((r) => r.id === 2).result;
    assert.strictEqual(result.isError, true);
    assert.match(result.structuredContent.message, /Leseberechtigung/);
  });

  await testAsync('an unknown tool yields a JSON-RPC invalid params error', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'tools/call', { name: 'delete_everything', arguments: {} })
    ]);
    const r = responses.find((x) => x.id === 2);
    assert.strictEqual(r.error.code, -32602);
    assert.strictEqual(r.result, undefined);
  });

  await testAsync('an unknown method yields method not found', async () => {
    const { responses } = await talk([rpc(1, 'resources/list')]);
    assert.strictEqual(responses[0].error.code, -32601);
  });

  await testAsync('malformed JSON yields a parse error with a null id', async () => {
    const { responses } = await talk(['{not json at all']);
    assert.strictEqual(responses[0].error.code, -32700);
    assert.strictEqual(responses[0].id, null);
  });

  await testAsync('an oversized unterminated frame is bounded and the next request still works', async () => {
    const oversized = `{"jsonrpc":"2.0","id":1,"method":"${'x'.repeat(1024 * 1024)}"}`;
    const { responses } = await talk([oversized, rpc(2, 'ping')]);
    assert.strictEqual(responses.length, 2);
    assert.strictEqual(responses[0].error.code, -32600);
    assert.strictEqual(responses[0].id, null);
    assert.strictEqual(responses[1].id, 2);
  });

  await testAsync('a request without jsonrpc 2.0 is rejected as invalid', async () => {
    const { responses } = await talk([{ id: 9, method: 'tools/list' }]);
    assert.strictEqual(responses[0].error.code, -32600);
  });

  await testAsync('notifications never produce a response', async () => {
    const { responses } = await talk([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } },
      { jsonrpc: '2.0', method: 'some/unknown/notification' },
      rpc(1, 'ping')
    ]);
    assert.strictEqual(responses.length, 1, `expected only the ping reply, got ${JSON.stringify(responses)}`);
    assert.strictEqual(responses[0].id, 1);
  });

  await testAsync('blank lines between messages are tolerated', async () => {
    const { responses } = await talk(['', JSON.stringify(rpc(1, 'ping')), '', JSON.stringify(rpc(2, 'ping'))]);
    assert.deepStrictEqual(responses.map((r) => r.id), [1, 2]);
  });

  await testAsync('prompts/list and prompts/get deliver a usable prompt', async () => {
    const { responses } = await talk([
      rpc(1, 'initialize', {}),
      rpc(2, 'prompts/list'),
      rpc(3, 'prompts/get', { name: 'anonymize_personnel_profile', arguments: { task: 'Skills zusammenfassen' } })
    ]);
    const prompts = responses.find((r) => r.id === 2).result.prompts;
    assert.strictEqual(prompts.length, 4);
    const got = responses.find((r) => r.id === 3).result;
    assert.strictEqual(got.messages[0].role, 'user');
    assert.match(got.messages[0].content.text, /start_document_batch_from_picker/);
    assert.match(got.messages[0].content.text, /start_completed_local_results_handoff/);
    assert.match(got.messages[0].content.text, /continue_local_results_handoff/);
    assert.match(got.messages[0].content.text, /profile=personnel_profile/);
    assert.match(got.messages[0].content.text, /Skills zusammenfassen/);
    assert.match(got.messages[0].content.text, /lokale Datei- beziehungsweise Ordnerauswahl/);
    assert.match(got.messages[0].content.text, /source_kind=folder/);
    assert.match(got.messages[0].content.text, /nicht vertrauenswürdige Dokumentdaten/iu);
    assert.match(got.messages[0].content.text, /Werkzeug.*niemals befolgen/iu);
  });

  await testAsync('an unknown prompt yields invalid params', async () => {
    const { responses } = await talk([rpc(1, 'prompts/get', { name: 'nope' })]);
    assert.strictEqual(responses[0].error.code, -32602);
  });

  await testAsync('server/discover advertises the supported protocol versions', async () => {
    const { responses } = await talk([rpc(1, 'server/discover')]);
    const result = responses[0].result;
    assert.strictEqual(result.resultType, 'complete');
    assert.ok(result.supportedVersions.includes('2025-11-25'));
    assert.ok(result.instructions, 'discover must carry the instructions');
    assert.ok(result._meta['io.modelcontextprotocol/serverInfo'], 'modern replies carry server info meta');
  });

  await testAsync('the modern protocol meta flag switches on result types', async () => {
    const { responses } = await talk([
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } }
    ]);
    assert.strictEqual(responses[0].result.resultType, 'complete');
    assert.strictEqual(responses[0].result.cacheScope, 'public');
  });

  await testAsync('every response is exactly one line of JSON on stdout', async () => {
    const { raw } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/list'), rpc(3, 'prompts/list')]);
    assert.strictEqual(raw.length, 3, 'one line per response');
    for (const line of raw) assert.doesNotThrow(() => JSON.parse(line));
  });

  await testAsync('nothing is written to stderr during normal operation', async () => {
    const { stderr } = await talk([rpc(1, 'initialize', {}), rpc(2, 'tools/call', { name: 'privacy_status' })]);
    assert.strictEqual(stderr.trim(), '', `unexpected stderr output: ${stderr}`);
  });

  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  done();
}

main();
