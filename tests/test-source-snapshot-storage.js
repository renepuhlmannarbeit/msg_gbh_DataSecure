'use strict';

const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const storage = require('../plugins/data-secure/server/core/source-snapshot-storage');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { copySnapshotFile, exactPendingEntry } = require('../plugins/data-secure/server/gateway/batch-snapshot');
const { createBatchIntake } = require('../plugins/data-secure/server/gateway/batch-intake');
const { planBatchAdmission } = require('../plugins/data-secure/server/gateway/batch-source-admission');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { assertPlainWorkFile } = require('../plugins/data-secure/server/gateway/batch-private-store');
const { RESOURCE_LIMITS } = require('../plugins/data-secure/server/resource-limits');
const { test, assert, done } = createSuite('Versioned private source snapshot storage');
const temporary = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(temporary, 'datasecure-source-storage-'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
const clone = value => JSON.parse(JSON.stringify(value));
let number = 0;
function binding(payload, mode = 'markdown-only') {
  const item = { id: 'a'.repeat(32), name: 'source.txt', work_name: `001_${'b'.repeat(24)}.workcopy`,
    size: payload.length, sha256: sha(payload), private_artifact_plain: true };
  const state = { schema: storage.BATCH_SCHEMA, token: 'c'.repeat(64), product_channel: 'standalone',
    processing_mode: mode, standalone_document_review: true, content_options: contentOptions,
    ...(mode === 'markdown-and-anonymize' ? { output_naming_mode: 'neutral' } : {}) };
  return { state, item };
}
function framed(payload, mode) {
  const f = binding(payload, mode), result = storage.encodeSourceSnapshot(f.state, f.item, payload);
  f.item.source_snapshot_storage = result.descriptor;
  return { ...f, bytes: result.bytes };
}
function resign(f) { f.item.source_snapshot_storage = { schema: storage.SCHEMA, stored_bytes: f.bytes.length, stored_sha256: sha(f.bytes) }; }

test('payloads beginning with old or new magic unwrap exactly once; Unicode, BOM and binary bytes stay exact', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const payload of [
    Buffer.from('DSARTF01\nOrdinary synthetic text. ÄÖÜäöüß 😀\r\n'), Buffer.from('DSSRC01\nnot a recursive frame'),
    Buffer.from('\ufeffUnicode text'), Buffer.from([0xff,0xfe,0x41,0,0xe4,0]), Buffer.from([0,1,255,128]), Buffer.alloc(0)
  ]) {
    const before = Buffer.from(payload), f = framed(payload, mode);
    const result = storage.decodeSourceSnapshot(f.state, f.item, f.bytes);
    assert.deepEqual(result, before); assert.deepEqual(payload, before);
    f.bytes.fill(0); assert.deepEqual(result, before, 'consumer owns a separate payload buffer'); result.fill(0);
  }
});

test('physical header reserve does not lower the existing 64-MiB source bound', () => {
  const payload = Buffer.alloc(RESOURCE_LIMITS.MAX_DOCX_SOURCE_BYTES, 0x61), f = framed(payload);
  assert.ok(f.bytes.length > payload.length && f.bytes.length <= storage.MAX_STORED_BYTES);
  assert.equal(storage.MAX_STORED_BYTES, RESOURCE_LIMITS.MAX_DOCX_SOURCE_BYTES + storage.MAX_HEADER_BYTES + storage.PREFIX_BYTES);
  assert.equal(storage.verifySourceSnapshot(f.state, f.item, f.bytes) + payload.length, f.bytes.length);
  payload.fill(0); f.bytes.fill(0);
});

test('cross-run, item, work-name, purpose and options substitutions fail even with identical source bytes', () => {
  for (const change of [f => { f.state.token = 'd'.repeat(64); }, f => { f.item.id = 'd'.repeat(32); },
    f => { f.item.work_name = `002_${'d'.repeat(24)}.workcopy`; },
    f => { f.state.processing_mode = 'markdown-and-anonymize'; f.state.output_naming_mode = 'neutral'; },
    f => { f.state.content_options = { ...contentOptions, scanOcr: true }; }]) {
    const f = framed(Buffer.from('same synthetic bytes')); change(f);
    assert.throws(() => storage.decodeSourceSnapshot(f.state, f.item, f.bytes)); f.bytes.fill(0);
  }
});

test('header, length, hash, descriptor, suffix and truncation tampering never falls back to raw', () => {
  for (const change of [f => { f.bytes[0] ^= 1; resign(f); }, f => { f.bytes.writeUInt32BE(0xffffffff, 8); resign(f); },
    f => { f.bytes[12] ^= 1; resign(f); }, f => { f.bytes[f.bytes.length - 1] ^= 1; resign(f); },
    f => { f.bytes = Buffer.concat([f.bytes, Buffer.from('tail')]); resign(f); },
    f => { f.bytes = f.bytes.subarray(0, f.bytes.length - 1); resign(f); },
    f => { f.item.source_snapshot_storage.stored_sha256 = '0'.repeat(64); },
    f => { f.item.source_snapshot_storage = { ...f.item.source_snapshot_storage, extra: true }; },
    f => { delete f.item.source_snapshot_storage; }]) {
    const f = framed(Buffer.from('source bytes')); f.item.source_snapshot_storage = clone(f.item.source_snapshot_storage); change(f);
    assert.throws(() => storage.decodeSourceSnapshot(f.state, f.item, f.bytes)); f.bytes.fill(0);
  }
  const f = framed(Buffer.from('x'));
  assert.throws(() => storage.validateStorageItem(f.state, { ...f.item, work_name: f.item.work_name + '.dsart' }));
  assert.throws(() => storage.encodeSourceSnapshot(f.state, f.item, Buffer.from('different')));
});

test('storage fields cannot adopt any legacy raw journal; absent fields keep the old raw reader contract', () => {
  for (const schema of ['datasecure-batch/2','datasecure-batch/4','datasecure-batch/5','datasecure-batch/6','datasecure-batch/7']) {
    const f = framed(Buffer.from('DSARTF01synthetic legacy envelope'));
    f.state.schema = schema; assert.throws(() => storage.validateStorageItem(f.state, f.item));
    delete f.item.source_snapshot_storage; assert.doesNotThrow(() => storage.validateStorageItem(f.state, f.item));
    f.bytes.fill(0);
  }
});

function intakeFixture(payload, extension, mode) {
  const data = path.join(root, String(++number)); fs.mkdirSync(data);
  const source = path.join(data, `example.${extension}`); fs.writeFileSync(source, payload, { flag:'wx', mode:0o600 });
  const store = createPrivateWorkStore({ privateRoot:data, maxBytes:storage.MAX_STORED_BYTES });
  const targetFor = token => path.join(data, `${token}.json`), workFor = token => path.join(data, `${token}.work`);
  const journal = (overrides = {}) => createBatchJournalStore({ batchPath:targetFor, workPath:workFor, documentReviewDataRoot:data, productChannel:'standalone', ...overrides });
  const review = createDocumentReviewStore({ dataRoot:data });
  let reserve = null;
  const intake = createBatchIntake({ SafeError, io:fs, path, crypto, profiles:new Set(['general']), limits:RESOURCE_LIMITS,
    validateBatchLimits:() => {}, storageStatus:() => ({ safe:true }), hasReparseComponent:() => false,
    planBatchAdmission, assertStagingCapacity:(_queue,_statfs,overhead) => { reserve=overhead; },
    tokenPattern:/^[a-f0-9]{64}$/u, batchPath:targetFor, workPath:workFor, copySnapshotFile, privateWorkStore:store,
    batchTtlMs:() => 60_000, createPrivateIoSummary:value => value,
    writeState:state => journal().writeState(state), readStateForMaintenance:token => journal().readStateForMaintenance(token),
    safeRemoveWorkDirectory:() => { throw Error('unexpected fixture cleanup authority'); },
    publicProgress:state => ({ total:state.items.length }), captureDocumentRun:state => review.captureRun(state), productChannel:'standalone' });
  const result = intake.beginBatch({ expectedCount:1, queue:[{ name:path.basename(source), full:source, sourceBytes:payload.length }],
    profile:'general', processingMode:mode, documentReview:true, contentOptions });
  assert.equal(result.ok,true);
  const names=fs.readdirSync(data).filter(name=>/^[a-f0-9]{64}\.json$/u.test(name)); assert.equal(names.length,1);
  const state=JSON.parse(fs.readFileSync(path.join(data,names[0])));
  return { data, source, store, journal, state, item:state.items[0], workFor, reserve };
}

test('real intake, exclusive writer, fresh journal and fresh process preserve both purposes with old-magic TXT/MD', () => {
  for (const mode of ['markdown-only','markdown-and-anonymize']) for (const extension of ['txt','md']) {
    const payload=Buffer.from('DSARTF01\nSynthetic content with Umlaut äöüß.\n'), f=intakeFixture(payload,extension,mode);
    assert.equal(f.state.schema,storage.BATCH_SCHEMA); assert.ok(f.item.source_snapshot_storage);
    assert.equal(f.reserve,storage.MAX_HEADER_BYTES+storage.PREFIX_BYTES);
    const restored=f.journal().readState(f.state.token);
    const result=exactPendingEntry(restored,restored.items[0],{ workPath:f.workFor, privateWorkStore:f.store });
    assert.deepEqual(result.private_bytes,payload); result.private_bytes.fill(0);
    const filename=path.join(f.workFor(f.state.token),f.item.work_name), before=fs.readFileSync(filename);
    assertPlainWorkFile(filename,fs,{ state:restored,item:restored.items[0] });
    const program = `const fs=require('node:fs');const {createPrivateWorkStore}=require(process.argv[1]);const {exactPendingEntry}=require(process.argv[2]);const s=JSON.parse(fs.readFileSync(process.argv[3]));const r=exactPendingEntry(s,s.items[0],{workPath:()=>process.argv[4],privateWorkStore:createPrivateWorkStore({privateRoot:process.argv[5]})});process.stdout.write(r.private_bytes.toString('base64'));r.private_bytes.fill(0);`;
    const child=spawnSync(process.execPath,['-e',program,require.resolve('../plugins/data-secure/server/gateway/private-work-store'),
      require.resolve('../plugins/data-secure/server/gateway/batch-snapshot'),path.join(f.data,`${f.state.token}.json`),f.workFor(f.state.token),f.data],
      { encoding:'utf8',windowsHide:true,timeout:15_000 });
    assert.equal(child.status,0,child.stderr); assert.equal(child.stdout,payload.toString('base64'));
    assert.deepEqual(fs.readFileSync(filename),before); assert.deepEqual(fs.readFileSync(f.source),payload);
  }
});

test('typed maintenance guard preserves malformed wrappers and raw renamed legacy bytes without deletion', () => {
  const f=intakeFixture(Buffer.from('DSARTF01\nSynthetic body.'),'txt','markdown-only');
  const filename=path.join(f.workFor(f.state.token),f.item.work_name);
  const bytes=fs.readFileSync(filename); bytes[12]^=1; fs.writeFileSync(filename,bytes);
  assert.throws(()=>f.journal().readStateForMaintenance(f.state.token));
  assert.throws(()=>assertPlainWorkFile(filename,fs,{state:f.state,item:f.item}));
  assert.deepEqual(fs.readFileSync(filename),bytes);
  fs.writeFileSync(filename,'DSARTF01synthetic-legacy-envelope');
  assert.throws(()=>assertPlainWorkFile(filename,fs,{state:f.state,item:f.item}),error=>error.code==='PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED');
  assert.equal(fs.readFileSync(filename,'utf8'),'DSARTF01synthetic-legacy-envelope');
});

test('fresh status projections never read source bodies or grant maintenance success for a damaged header', () => {
  const f=intakeFixture(Buffer.from('DSARTF01\nSynthetic status body.'),'txt','markdown-only');
  const filename=path.join(f.workFor(f.state.token),f.item.work_name), bytes=fs.readFileSync(filename);
  bytes[12]^=1; fs.writeFileSync(filename,bytes);
  const object=fs.lstatSync(filename,{bigint:true}); let bodyReads=0, maintenanceCalls=0;
  const io=Object.create(fs); io.readSync=(fd,...args)=>{const stat=fs.fstatSync(fd,{bigint:true});
    if(stat.dev===object.dev&&stat.ino===object.ino)bodyReads++; return fs.readSync(fd,...args);};
  const journal=f.journal({io});
  const status=journal.readStateForStatus(f.state.token); assert.equal(bodyReads,0);
  status.items[0].name='changed local projection';
  assert.equal(journal.readStateForStatus(f.state.token).items[0].name,f.item.name);
  const recovery=createBatchRecovery({batchRoot:()=>f.data,batchPath:token=>path.join(f.data,`${token}.json`),
    readStateForStatus:token=>journal.readStateForStatus(token),readStateForMaintenance:token=>{maintenanceCalls++;return journal.readStateForMaintenance(token);},
    readActiveLock:()=>null,processAlive:()=>false,liveLocalExecutor:()=>false,
    publicProgress:()=>({total:1,pending:1,processing:0,released:0,stopped:0,retryable:0,deferred_review:0,
      mapping_pending:0,delivery_pending:0,complete:false,awaiting_resume:true})});
  const snapshot=recovery.productStatusSnapshot('standalone',{localUiSelection:true,selectedBatchId:f.state.token});
  assert.equal(snapshot.observed_batch_id,f.state.token); assert.equal(snapshot.latest.complete,false);
  assert.equal(bodyReads,0); assert.equal(maintenanceCalls,0);
  assert.throws(()=>journal.readStateForMaintenance(f.state.token)); assert.ok(bodyReads>0);
  assert.deepEqual(fs.readFileSync(filename),bytes);
});

test('a durable framed journal cannot silently downgrade its bound storage family', () => {
  for(const mode of ['markdown-only','markdown-and-anonymize']){
    const f=intakeFixture(Buffer.from('DSARTF01\nSynthetic storage-family binding.'),'txt',mode), journal=f.journal();
    const target=path.join(f.data,`${f.state.token}.json`),filename=path.join(f.workFor(f.state.token),f.item.work_name);
    const beforeJournal=fs.readFileSync(target),beforeSource=fs.readFileSync(filename),state=journal.readState(f.state.token);
    state.schema='datasecure-batch/7';delete state.items[0].source_snapshot_storage;
    assert.throws(()=>journal.writeState(state),error=>error.code==='BATCH_PROCESSING_MODE_CHANGED');
    assert.deepEqual(fs.readFileSync(target),beforeJournal);assert.deepEqual(fs.readFileSync(filename),beforeSource);
  }
});

test('maintenance classifies only a bounded header; mutated payload is refused before content use', () => {
  const payload=Buffer.alloc(256*1024,0x61), f=intakeFixture(payload,'txt','markdown-only');
  const filename=path.join(f.workFor(f.state.token),f.item.work_name), bytes=fs.readFileSync(filename);
  const prefixLength=storage.sourceSnapshotHeaderLength(f.state,f.item); bytes[bytes.length-1]^=1; fs.writeFileSync(filename,bytes);
  const object=fs.lstatSync(filename,{bigint:true}); let sourceReads=0,bodyReads=0,totalRead=0;
  const io=Object.create(fs);io.readSync=(fd,buffer,offset,length,position)=>{const stat=fs.fstatSync(fd,{bigint:true});
    if(stat.dev===object.dev&&stat.ino===object.ino){sourceReads++;totalRead+=length;if(position+length>prefixLength)bodyReads++;}
    return fs.readSync(fd,buffer,offset,length,position);};
  const journal=f.journal({io}); assert.doesNotThrow(()=>journal.readStateForMaintenance(f.state.token));
  assert.ok(sourceReads>0);assert.equal(bodyReads,0);assert.ok(totalRead<=prefixLength+8,'legacy prefix may be sampled again, never source body');
  assert.throws(()=>exactPendingEntry(f.state,f.item,{workPath:f.workFor,privateWorkStore:f.store}));
  assert.deepEqual(fs.readFileSync(filename),bytes);assert.deepEqual(fs.readFileSync(f.source),payload);
});

try { done(); }
finally {
  assert.equal(path.dirname(path.resolve(root)),temporary);
  assert.ok(path.basename(root).startsWith('datasecure-source-storage-'));
  fs.rmSync(root,{recursive:true,force:true});
}
