'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { SCHEMA, PREFIX, STAGES, MAX_LINE_BYTES, MAX_STDERR_BYTES, MAX_DURATION_MS, MAX_COUNT,
  createConversionTimings, validateConversionTimings, serializeConversionTimings, createConversionTimingStream
} = require('../plugins/data-secure/server/standalone/conversion-timings');
const { sourceCropBlocks } = require('../plugins/data-secure/server/standalone/ocr-crop-geometry');
const { attachContactCrops } = require('../plugins/data-secure/server/standalone/ocr-contact-crops');
const { validateContactImage } = require('../plugins/data-secure/server/core/ocr-contact-image');
const { decodePng } = require('../plugins/data-secure/server/images/png');
const environmentKeys = ['LOCALAPPDATA', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_RESULT_ROOT'];
const previousEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-conversion-timings-')));
process.env.LOCALAPPDATA = path.join(base, 'local');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'data');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(base, 'results');
const { sanitizeWorkflowEvent, recordWorkflowEvent, _test } = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
let passed = 0;
async function test(name, run) { await run(); passed++; process.stdout.write(`PASS ${name}\n`); }
const fixture = () => ({ schema: SCHEMA, source_type: 'pdf', outcome: 'ok', worker_total_ms: 10,
  durations_ms: Object.fromEntries(STAGES.map(stage => [stage, 0])), counts: Object.fromEntries(STAGES.map(stage => [stage, 0])) });
const jsonLine = object => `${FRAME_PREFIX}${JSON.stringify(object)}\n`;
const parsed = (line, code = 0, type = 'pdf') => { const stream = createConversionTimingStream(type); stream.push(Buffer.from(line)); return stream.close(code); };
const { MAX_STREAM_BYTES, FRAME_PREFIX, FRAME_START } = require('../plugins/data-secure/server/core/conversion-timing-contract');

(async () => {
  await test('the closed diagnostic source vocabulary matches the actual converter contract', () => {
    const shared = require('../plugins/data-secure/server/core/conversion-timing-contract');
    const actual = require('../plugins/data-secure/server/core/conversion-worker-contract');
    assert.deepEqual([...shared.SOURCE_TYPES].sort(), [...new Set(Object.values(actual.SOURCE_TYPES))].sort());
  });
  await test('a monotonic clock aggregates submillisecond stages before rounding', () => {
    let tick = 0n; const c = createConversionTimings(() => tick);
    const one = c.begin('ocr'); tick += 600000n; one(); one();
    const two = c.begin('ocr'); tick += 600000n; two();
    tick += 8800000n; const record = c.finish('pdf', 'ok');
    assert.equal(record.worker_total_ms, 10); assert.equal(record.durations_ms.ocr, 1); assert.equal(record.counts.ocr, 2);
    assert.equal(c.finish('pdf', 'ok'), null);
  });
  await test('fixed-stage calls preserve values and do not invent other counters', async () => {
    let tick = 0n; const c = createConversionTimings(() => tick);
    assert.equal(c.measure('native_extract', () => { tick += 5000000n; return 42; }), 42);
    assert.equal(await c.measureAsync('image_decode', async () => { tick += 3000000n; return 17; }), 17);
    c.begin('customer-private-path')();
    const result = c.finish('png', 'ok'); assert.equal(result.worker_total_ms, 8);
    assert.equal(result.counts.native_extract, 1); assert.equal(result.counts.image_decode, 1);
    assert.equal(Reflect.ownKeys(result.counts).length, STAGES.length); assert.ok(Object.isFrozen(result.counts));
  });
  for (const thrown of [undefined, null, false, 0, new Error('PRIVATE CONTENT')]) await test(`sync and async failures retain their exact identity (${String(thrown?.name || typeof thrown)})`, async () => {
    let time = 0n; const c = createConversionTimings(() => ++time);
    let didThrow = false;
    try { c.measure('ocr', () => { throw thrown; }); } catch (actual) { didThrow = true; assert.equal(actual, thrown); }
    assert.ok(didThrow); didThrow = false;
    try { await c.measureAsync('refinement', async () => { throw thrown; }); } catch (actual) { didThrow = true; assert.equal(actual, thrown); }
    assert.ok(didThrow); const result = c.finish('pdf', 'error'); assert.equal(result.counts.ocr, 1); assert.equal(result.counts.refinement, 1);
  });
  for (const badClock of [() => { throw Error('PRIVATE'); }, () => 10, () => -1n, (() => { let tick = 10n; return () => tick--; })()]) {
    await test('a failed or regressing clock removes diagnostics without changing operations', async () => {
      const c = createConversionTimings(badClock);
      assert.equal(c.measure('ocr', () => 11), 11); assert.equal(await c.measureAsync('ocr', async () => 12), 12);
      assert.equal(c.finish('pdf', 'ok'), null);
    });
  }
  await test('a measurement above the diagnostic ceiling is omitted rather than clamped into false precision', () => {
    let tick = 0n; const c = createConversionTimings(() => tick); tick = BigInt(MAX_DURATION_MS + 1) * 1000000n;
    assert.equal(c.finish('pdf', 'ok'), null);
  });
  await test('a canonical closed record roundtrips without free source text', () => {
    const record = fixture(), line = serializeConversionTimings(record);
    assert.equal(line.charCodeAt(0),FRAME_START);assert.equal(FRAME_START,30);
    assert.ok(Buffer.byteLength(line) <= MAX_LINE_BYTES); assert.deepEqual(parsed(line), record);
    assert.doesNotMatch(line, /customer|private|filename|path|hash|exception/u);
  });
  const malformed = [
    ['extra root field', x => { x.filename = 'PRIVATE.docx'; }],
    ['extra nested field', x => { x.counts.customer = 4; }],
    ['missing nested stage', x => { delete x.durations_ms.ocr; }],
    ['missing root field', x => { delete x.outcome; }],
    ['unknown schema', x => { x.schema = 'future/9'; }],
    ['unknown type', x => { x.source_type = 'secret-name'; }],
    ['unknown outcome', x => { x.outcome = 'done'; }],
    ['negative total', x => { x.worker_total_ms = -1; }],
    ['fractional total', x => { x.worker_total_ms = 0.5; }],
    ['too large total', x => { x.worker_total_ms = MAX_DURATION_MS + 1; }],
    ['numeric string', x => { x.worker_total_ms = '10'; }],
    ['negative count', x => { x.counts.ocr = -1; }],
    ['fractional count', x => { x.counts.ocr = 0.5; }],
    ['too large count', x => { x.counts.ocr = MAX_COUNT + 1; }],
    ['string count', x => { x.counts.ocr = '1'; }],
    ['NaN count', x => { x.counts.ocr = NaN; }],
    ['infinite duration', x => { x.durations_ms.ocr = Infinity; }],
    ['duration without operation', x => { x.durations_ms.ocr = 1; }],
    ['stage exceeds total', x => { x.durations_ms.ocr = 11; x.counts.ocr = 1; }],
    ['array counts', x => { x.counts = []; }],
    ['null durations', x => { x.durations_ms = null; }]
  ];
  for (const [name, mutate] of malformed) await test(`rejects ${name}`, () => {
    const record = fixture(); mutate(record); assert.equal(validateConversionTimings(record), null); assert.equal(parsed(jsonLine(record)), null);
  });
  await test('accessors, proxies, symbols and inherited records cannot inject diagnostic values', () => {
    let reads = 0; const accessor = fixture(); Object.defineProperty(accessor, 'worker_total_ms', { enumerable: true, get() { reads++; return 10; } });
    assert.equal(validateConversionTimings(accessor), null); assert.equal(reads, 0);
    assert.equal(validateConversionTimings(new Proxy(fixture(), { get() { throw Error('PRIVATE'); } })), null);
    const symbol = fixture(); symbol[Symbol('secret')] = 1; assert.equal(validateConversionTimings(symbol), null);
    assert.equal(validateConversionTimings(Object.create(fixture())), null);
  });
  await test('all byte chunk boundaries retain the one final line only after close', () => {
    const record = fixture(), line = Buffer.from(`VENDOR PRIVATE\nCONVERSION_OCR_READY\n${serializeConversionTimings(record)}`);
    for (let split = 0; split <= line.length; split++) {
      const stream = createConversionTimingStream('pdf'); stream.push(line.subarray(0, split)); stream.push(line.subarray(split));
      assert.deepEqual(stream.close(0), record); assert.equal(stream.close(0), null);
    }
    const stream = createConversionTimingStream('pdf'); for (const byte of line) stream.push(Uint8Array.of(byte)); assert.deepEqual(stream.close(0), record);
  });
  const line = serializeConversionTimings(fixture());
  for (const [name, input] of [
    ['missing', 'PRIVATE VENDOR\n'], ['truncated', line.slice(0, -1)], ['duplicate', line + line],
    ['vendor tail', line + 'PRIVATE AFTER\n'], ['blank tail', line + '\n'], ['bad JSON', FRAME_PREFIX + '{PRIVATE}\n'],
    ['wrong source', line.replace('"pdf"', '"docx"')], ['unicode field', line.replace('"ok"', '"é"')],
    ['extra whitespace', line.replace(PREFIX, PREFIX + ' ')], ['duplicate JSON key', line.replace('"outcome":"ok"', '"outcome":"error","outcome":"ok"')],
    ['control', line.replace('"ok"', '"o\rk"')], ['overlong metric', FRAME_PREFIX + '0'.repeat(MAX_LINE_BYTES) + '\n']
  ]) await test(`stream discards ${name} without an exception or raw line reflection`, () => assert.equal(parsed(input), null));
  await test('a missing metric, mismatched close or wrong outcome never becomes a success fact', () => {
    assert.equal(parsed(line, 2), null); assert.equal(parsed(line, null), null); assert.equal(parsed(line, 125), null);
    const error = fixture(); error.outcome = 'error'; assert.deepEqual(parsed(serializeConversionTimings(error), 2), error);
  });
  await test('vendor overflow retains the existing 64KiB diagnostic bound', () => {
    assert.equal(parsed('v'.repeat(MAX_STDERR_BYTES) + '\n' + line), null);
  });
  await test('one canonical final metric has a separate fixed reserve above exactly 64KiB opaque stderr', () => {
    const vendor=Buffer.alloc(MAX_STDERR_BYTES,118);vendor[vendor.length-1]=10;
    const stream=createConversionTimingStream('pdf');stream.push(vendor);assert.equal(stream.exceededBudget(),false);
    const frame=Buffer.from(line);
    for(const byte of frame){stream.push(Uint8Array.of(byte));assert.equal(stream.exceededBudget(),false);}
    assert.deepEqual(stream.close(0),fixture());assert.equal(stream.exceededBudget(),false);
    assert.equal(MAX_STREAM_BYTES,MAX_STDERR_BYTES+MAX_LINE_BYTES);
  });
  await test('explicit framing handles exactly 64KiB unterminated or LF-terminated vendor data at every boundary',()=>{
    const frame=Buffer.from(line);
    for(const lf of [false,true]){
      const vendor=Buffer.alloc(MAX_STDERR_BYTES,118);if(lf)vendor[vendor.length-1]=10;
      const joined=Buffer.concat([vendor,frame]);
      for(const split of [0,1,MAX_STDERR_BYTES-1,MAX_STDERR_BYTES,MAX_STDERR_BYTES+1,joined.length-1,joined.length]){
        const stream=createConversionTimingStream('pdf');stream.push(joined.subarray(0,split));assert.equal(stream.exceededBudget(),false);
        stream.push(joined.subarray(split));assert.equal(stream.exceededBudget(),false);
        assert.deepEqual(stream.close(0),fixture());assert.equal(stream.exceededBudget(),false);
      }
      const stream=createConversionTimingStream('pdf');stream.push(vendor);
      for(const byte of frame){stream.push(Uint8Array.of(byte));assert.equal(stream.exceededBudget(),false);}
      assert.deepEqual(stream.close(0),fixture());
    }
  });
  for(const [name,tail,code]of [
    ['wrong source',line.replace('"pdf"','"docx"'),0],['wrong outcome',line,2],['truncated',line.slice(0,-1),0],
    ['duplicate',line+line,0],['trailing bytes',line+'x',0],['trailing blank',line+'\n',0],
    ['extra source field',jsonLine({...fixture(),filename:'PRIVATE'}),0],['malformed',FRAME_PREFIX+'{PRIVATE}\n',0],
    ['noncanonical',line.replace('"worker_total_ms":10','"worker_total_ms":1e1'),0],
    ['old unframed prefix',PREFIX+JSON.stringify(fixture())+'\n',0],
    ['bare record separator',String.fromCharCode(FRAME_START),0]
  ])await test(`the protocol reserve never exempts ${name} bytes at confirmed close`,()=>{
    const vendor=Buffer.alloc(MAX_STDERR_BYTES,118);vendor[vendor.length-1]=10;
    const stream=createConversionTimingStream('pdf');stream.push(vendor);stream.push(Buffer.from(tail));
    assert.equal(stream.close(code),null);assert.equal(stream.exceededBudget(),true);
  });
  await test('a huge chunk and opaque-only overflow are bounded before close; no diagnostic allowance rescues vendor excess',()=>{
    const huge=createConversionTimingStream('pdf');huge.push(Buffer.alloc(MAX_STREAM_BYTES+1,32));assert.equal(huge.exceededBudget(),true);assert.equal(huge.close(0),null);
    const vendor=Buffer.alloc(MAX_STDERR_BYTES+1,118);vendor[vendor.length-1]=10;
    const stream=createConversionTimingStream('pdf');stream.push(vendor);assert.equal(stream.exceededBudget(),true);
    stream.push(Buffer.from(line));assert.equal(stream.close(0),null);assert.equal(stream.exceededBudget(),true);
  });
  await test('workflow metrics are accepted only for the fixed conversion event and stripped otherwise', () => {
    const record = fixture(); assert.deepEqual(sanitizeWorkflowEvent({ event: 'conversion_worker_closed', metrics: record }).metrics, record);
    assert.equal(sanitizeWorkflowEvent({ event: 'picker_requested', metrics: record }).metrics, undefined);
    record.private_text = 'PRIVATE'; assert.equal(sanitizeWorkflowEvent({ event: 'conversion_worker_closed', metrics: record }).metrics, undefined);
  });
  await test('the private diagnostic spool retains only closed fields once per submitted source event', () => {
    assert.equal(fs.realpathSync.native(base), base);
    let writeError;
    const record = fixture(), written = recordWorkflowEvent({ event: 'conversion_worker_closed', item_count: 1,
      outcome: 'ok', metrics: record, private_path: 'PRIVATE' }, { dataRoot: base, onError(cause) { writeError = cause; } });
    const errorFact = writeError?.code || writeError?.message;
    assert.equal(written, true, `Synthetic spool refusal: ${typeof errorFact === 'string' && /^[A-Z0-9_]{1,80}$/u.test(errorFact) ? errorFact : 'UNCLASSIFIED'}`);
    const events = _test.readWorkflowEvents({ dataRoot: base }); assert.equal(events.length, 1);
    assert.deepEqual(events[0].metrics, record); assert.equal(events[0].item_count, 1); assert.doesNotMatch(JSON.stringify(events), /PRIVATE/u);
  });
  function parentHarness(persist = () => {}, { flush = true } = {}) {
    const file = path.resolve(__dirname, '../plugins/data-secure/server/standalone/conversion-worker.js');
    const nativeRequire = createRequire(file), module = { exports: {} }, children = [];
    const customRequire = id => {
      if (id === 'node:child_process') return { spawn() {
        const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
        child.stdin.end = (_input, callback) => { if(flush)callback(); }; child.stdin.destroy = () => {};
        child.kill = () => {child.killCalls=(child.killCalls||0)+1;return true;};
        children.push(child); return child;
      } };
      if (id === './conversion-runtime-resolver') return { resolveConversionRuntime: () => ({ root: base, node: process.execPath }) };
      if (id === '../native-launcher') return { verifyNativeLauncherArtifact() {} };
      if (id === '../posix-supervisor') return { verifyPosixSupervisor: () => ({ available: true, executable: 'fixed-test-supervisor' }) };
      if (id === '../gateway/workflow-diagnostics') return { recordWorkflowEvent: persist };
      return nativeRequire(id);
    };
    vm.runInThisContext(`(function(require,module,exports,__dirname){${fs.readFileSync(file,'utf8')}\n})`, { filename: file })(customRequire,module,module.exports,path.dirname(file));
    const result = require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({ source_type:'txt', markdown:'Synthetic output',
      coverage:{status:'complete',reason_codes:[]} });
    return { convert: module.exports.convertBuffer, children, response: JSON.stringify({schema:'datasecure-conversion-response/1',ok:true,result}) };
  }
  await test('the actual child emitter writes one explicit frame; parent accepts both vendor endings and chunk arrangements',async()=>{
    const source=fs.readFileSync(path.resolve(__dirname,'../plugins/data-secure/server/standalone/conversion-worker-child.js'),'utf8');
    const start=source.indexOf('function exitWithTimings('),end=source.indexOf('\nmain().then',start);assert.ok(start>=0&&end>start);
    const writes=[],exits=[];
    vm.runInNewContext(`${source.slice(start,end)};exitWithTimings(0);`,{
      serializeConversionTimings,conversionTimings:{finish(type,outcome){return{...fixture(),source_type:type,outcome};}},
      process:{argv:['node','child','txt'],stderr:{write(value,callback){writes.push(value);callback();}},exit(code){exits.push(code);}}
    });
    assert.equal(writes.length,1);assert.deepEqual(exits,[0]);const frame=Buffer.from(writes[0]);assert.equal(frame[0],FRAME_START);assert.ok(frame.length<=MAX_LINE_BYTES);
    for(const vendorBytes of [MAX_STDERR_BYTES,MAX_STDERR_BYTES+1])for(const lf of [false,true])for(const combined of [false,true]){
      const events=[],h=parentHarness(event=>events.push(event)),promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children[0];
      child.stdout.emit('data',Buffer.from(h.response));const vendor=Buffer.alloc(vendorBytes,118);if(lf)vendor[vendor.length-1]=10;
      if(combined)child.stderr.emit('data',Buffer.concat([vendor,frame]));else{child.stderr.emit('data',vendor);child.stderr.emit('data',frame);}
      child.emit('close',0);
      if(vendorBytes===MAX_STDERR_BYTES){assert.equal((await promise).markdown,'Synthetic output');assert.equal(child.killCalls,undefined);assert.equal(events.length,1);}
      else{await assert.rejects(promise,{code:'CONVERSION_OUTPUT_LIMIT'});assert.equal(child.killCalls,1);assert.equal(events.length,0);}
    }
  });
  await test('actual parent closure emits no metric on exit or before confirmed close and publishes exactly once after close', async () => {
    const events=[], h=parentHarness(event=>events.push(event)), promise=h.convert(Buffer.from('Synthetic input'),'.txt');
    const child=h.children[0], metric={...fixture(),source_type:'txt'};
    child.stdout.emit('data',Buffer.from(h.response)); child.stderr.emit('data',Buffer.from(serializeConversionTimings(metric)));
    child.emit('exit',0); await Promise.resolve(); assert.equal(events.length,0);
    child.emit('close',0); const result=await promise;assert.equal(result.markdown,'Synthetic output');assert.equal(events.length,1);
    assert.deepEqual(events[0].metrics,metric); assert.equal(events[0].event,'conversion_worker_closed');assert.equal(events[0].item_count,1);
    child.emit('close',0);assert.equal(events.length,1);
  });
  for (const metricLine of ['',FRAME_PREFIX+'{bad}\n',serializeConversionTimings({...fixture(),source_type:'pdf'})]) {
    await test('actual parent ignores missing/malformed/wrong-source metrics without changing a successful result', async () => {
      const events=[],h=parentHarness(event=>events.push(event)),promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children[0];
      child.stdout.emit('data',Buffer.from(h.response));if(metricLine)child.stderr.emit('data',Buffer.from(metricLine));child.emit('close',0);
      assert.equal((await promise).markdown,'Synthetic output');assert.equal(events.length,0);
    });
  }
  await test('a diagnostic write failure cannot change the actual parent result', async () => {
    const h=parentHarness(()=>{throw Error('PRIVATE DIAGNOSTIC FAILURE');}),promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children[0];
    child.stdout.emit('data',Buffer.from(h.response));child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'})));
    child.emit('close',0);assert.equal((await promise).markdown,'Synthetic output');
  });
  await test('a valid metric cannot rescue an invalid response or change the parent stderr ceiling', async () => {
    const h=parentHarness(),bad=h.convert(Buffer.from('Synthetic input'),'.txt'),first=h.children[0];
    first.stdout.emit('data',Buffer.from('{}'));first.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'})));first.emit('close',0);
    await assert.rejects(bad,{code:'CONVERSION_RESPONSE_INVALID'});
    const overflow=h.convert(Buffer.from('Synthetic input'),'.txt'),second=h.children[1];
    second.stdout.emit('data',Buffer.from(h.response));second.stderr.emit('data',Buffer.alloc(MAX_STDERR_BYTES+1,32));second.emit('close',0);
    await assert.rejects(overflow,{code:'CONVERSION_OUTPUT_LIMIT'});
  });
  for(const [name,invalid,flush,expected]of [
    ['invalid stdout',true,true,'CONVERSION_RESPONSE_INVALID'],['unflushed input',false,false,'CONVERSION_INPUT_INCOMPLETE']
  ])await test(`actual settled diagnosis reports stopped for ${name} while retaining the worker exit fact`,async()=>{
    const events=[],h=parentHarness(event=>events.push(event),{flush}),promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children[0];
    child.stdout.emit('data',Buffer.from(invalid?'{}':h.response));child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'})));
    child.emit('close',0);await assert.rejects(promise,{code:expected});assert.equal(events.length,1);
    assert.equal(events[0].outcome,'stopped');assert.equal(events[0].metrics.outcome,'ok');
  });
  await test('actual parent accepts 64KiB vendor plus only the valid final metric and rejects 65537 vendor bytes',async()=>{
    const events=[],h=parentHarness(event=>events.push(event));
    for(const vendorBytes of [MAX_STDERR_BYTES,MAX_STDERR_BYTES+1]){
      const promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children.at(-1);
      child.stdout.emit('data',Buffer.from(h.response));const vendor=Buffer.alloc(vendorBytes,118);vendor[vendor.length-1]=10;
      child.stderr.emit('data',vendor);child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'})));child.emit('close',0);
      if(vendorBytes===MAX_STDERR_BYTES){assert.equal((await promise).markdown,'Synthetic output');assert.equal(child.killCalls,undefined);}
      else{await assert.rejects(promise,{code:'CONVERSION_OUTPUT_LIMIT'});assert.equal(child.killCalls,1);}
    }
    assert.equal(events.length,1);assert.equal(events[0].outcome,'ok');
  });
  await test('actual parent cannot use a wrong-outcome final frame to hide vendor bytes after close',async()=>{
    const events=[],h=parentHarness(event=>events.push(event)),promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children[0];
    const vendor=Buffer.alloc(MAX_STDERR_BYTES,118);vendor[vendor.length-1]=10;child.stderr.emit('data',vendor);
    child.stdout.emit('data',Buffer.from(JSON.stringify({schema:'datasecure-conversion-response/1',ok:false,error_code:'TEXT_CONTROL_INVALID'})));
    child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'})));child.emit('close',2);
    await assert.rejects(promise,{code:'CONVERSION_OUTPUT_LIMIT'});assert.equal(events.length,0);
  });
  await test('actual parent keeps a genuine error at the vendor boundary and rejects source/field/duplicate frame forgeries',async()=>{
    for(const frame of [
      serializeConversionTimings({...fixture(),source_type:'txt',outcome:'error'}),
      serializeConversionTimings({...fixture(),source_type:'pdf',outcome:'error'}),
      jsonLine({...fixture(),source_type:'txt',outcome:'error',filename:'PRIVATE'}),
      serializeConversionTimings({...fixture(),source_type:'txt',outcome:'error'}).repeat(2)
    ]){
      const events=[],h=parentHarness(event=>events.push(event)),promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children[0];
      child.stdout.emit('data',Buffer.from(JSON.stringify({schema:'datasecure-conversion-response/1',ok:false,error_code:'TEXT_CONTROL_INVALID'})));
      const vendor=Buffer.alloc(MAX_STDERR_BYTES,118);vendor[vendor.length-1]=10;child.stderr.emit('data',vendor);child.stderr.emit('data',Buffer.from(frame));child.emit('close',2);
      if(frame===serializeConversionTimings({...fixture(),source_type:'txt',outcome:'error'})){
        await assert.rejects(promise,{code:'TEXT_CONTROL_INVALID'});assert.equal(events.length,1);assert.equal(events[0].outcome,'stopped');assert.equal(events[0].metrics.outcome,'error');
      }else{await assert.rejects(promise,{code:'CONVERSION_OUTPUT_LIMIT'});assert.equal(events.length,0);}
    }
  });
  await test('timeout grace remains source-close-bound and a truncated frame cannot authorize timeout recovery',async()=>{
    const events=[],h=parentHarness(event=>events.push(event)),promise=h.convert(Buffer.from('Synthetic input'),'.txt',{timeoutMs:1}),child=h.children[0];
    // A possible final frame may borrow the reserve only until actual close.
    const vendor=Buffer.alloc(MAX_STDERR_BYTES,118);vendor[vendor.length-1]=10;child.stderr.emit('data',vendor);
    child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'}).slice(0,-1)));
    let settled=false;promise.then(()=>{settled=true;},()=>{settled=true;});
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(child.killCalls,1);assert.equal(settled,false);assert.equal(events.length,0);
    child.emit('close',0);await assert.rejects(promise,{code:'CONVERSION_OUTPUT_LIMIT'});assert.equal(child.killCalls,1);assert.equal(events.length,0);
  });
  await test('cancellation keeps priority over a pending timeout and invalid diagnostic frame',async()=>{
    const controller=new AbortController(),events=[],h=parentHarness(event=>events.push(event));
    const promise=h.convert(Buffer.from('Synthetic input'),'.txt',{timeoutMs:1,signal:controller.signal}),child=h.children[0];
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(child.killCalls,1);controller.abort();
    const vendor=Buffer.alloc(MAX_STDERR_BYTES,118);vendor[vendor.length-1]=10;child.stderr.emit('data',vendor);
    child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'}).slice(0,-1)));child.emit('close',0);
    await assert.rejects(promise,{code:'REQUEST_CANCELLED'});assert.equal(child.killCalls,1);assert.equal(events.length,0);
  });
  await test('even a complete valid timing frame never proves source termination during the unchanged grace period',async()=>{
    const events=[],h=parentHarness(event=>events.push(event)),promise=h.convert(Buffer.from('Synthetic input'),'.txt',{timeoutMs:1}),child=h.children[0];
    child.stdout.emit('data',Buffer.from(h.response));child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt'})));
    child.emit('exit',0);await assert.rejects(promise,{code:'CONVERSION_TERMINATION_UNCONFIRMED'});
    assert.equal(child.killCalls,1);assert.equal(events.length,0);
  });
  await test('actual parent preserves the child failure code while accepting diagnostic-only error timings', async () => {
    const events=[],h=parentHarness(event=>events.push(event)),promise=h.convert(Buffer.from('Synthetic input'),'.txt'),child=h.children[0];
    child.stdout.emit('data',Buffer.from(JSON.stringify({schema:'datasecure-conversion-response/1',ok:false,error_code:'TEXT_CONTROL_INVALID'})));
    child.stderr.emit('data',Buffer.from(serializeConversionTimings({...fixture(),source_type:'txt',outcome:'error'})));child.emit('close',2);
    await assert.rejects(promise,{code:'TEXT_CONTROL_INVALID'});assert.equal(events.length,1);assert.equal(events[0].outcome,'stopped');
  });
  await test('the actual PDF parameter expression grants AUTO only to the content-v1 pure raster plan', async () => {
    const source=fs.readFileSync(path.resolve(__dirname,'../plugins/data-secure/server/standalone/conversion-worker-child.js'),'utf8');
    const statement=source.match(/await ocr\.setParameters\(\{ tessedit_pageseg_mode: [\s\S]*? \}\);/u)?.[0];assert.ok(statement);
    const apply=new Function('ocr','pdfOcrLayoutMode','markdownOutput','hasRawNativeText','hasPaintedImage','hasNonTextGraphicPaint',`return ${statement.slice('await '.length)}`);
    const {pdfOcrLayoutMode}=require('../plugins/data-secure/server/standalone/pdf-ocr-layout-mode');
    for(const [mode,native,image,graphic,expected] of [
      ['content-v1',false,true,false,'3'],['content-v1',true,true,false,'6'],['content-v1',false,false,true,'6'],
      ['content-v1',false,true,true,'6'],['notes-v1',false,true,false,'6'],[undefined,false,true,false,'6']]){
      const received=[];await apply({setParameters:value=>received.push(value)},pdfOcrLayoutMode,mode,native,image,graphic);
      assert.deepEqual(received,[{tessedit_pageseg_mode:expected}]);
    }
    assert.match(source,/finally \{ await ocr\.setParameters\(\{ tessedit_pageseg_mode: '6' \}\); \}/u);
  });
  await test('the actual raw native-text fact includes undecodable PUA text rather than treating it as an image-only scan', () => {
    const source=fs.readFileSync(path.resolve(__dirname,'../plugins/data-secure/server/standalone/conversion-worker-child.js'),'utf8');
    const statement=source.match(/const hasRawNativeText = [^\r\n]+;/u)?.[0];assert.ok(statement);
    const read=new Function('content',`${statement}return hasRawNativeText;`);
    assert.equal(read({items:[{str:'\ue000'}]}),true);assert.equal(read({items:[{str:'Real text'}]}),true);
    assert.equal(read({items:[{type:'beginMarkedContent'},{str:' \n\t'}]}),false);
  });
  const blocks = [{ paragraphs: [{ lines: [{ text: 'E-Mail: qa@example.invalid', confidence: 99,
    bbox: { x0: 1, y0: 3, x1: 2999, y1: 899 }, words: [{ text: 'ignored' }] }] }] }];
  await test('exact 2x geometry uses floor/ceil original bounds without transcript or confidence invention', () => {
    const before = JSON.stringify(blocks), projected = sourceCropBlocks(blocks, 3000, 900, 1500, 450);
    assert.deepEqual(projected[0].paragraphs[0].lines[0], { text: 'E-Mail: qa@example.invalid', bbox: { x0: 0, y0: 1, x1: 1500, y1: 450 } });
    assert.equal(JSON.stringify(blocks), before); assert.equal(projected[0].paragraphs[0].lines[0].confidence, undefined);
  });
  for (const geometry of [[2999,900,1500,450],[3000,901,1500,450],[3000,900,0,450],[Infinity,900,1500,450]]) {
    await test('an unproven scale has no review crop authority', () => assert.deepEqual(sourceCropBlocks(blocks, ...geometry), []));
  }
  await test('malformed or outside OCR boxes retain the text but cannot mint a crop', () => {
    for (const bbox of [{ x0:-1,y0:0,x1:20,y1:20 },{ x0:0,y0:0,x1:3001,y1:20 },{ x0:0.5,y0:0,x1:20,y1:20 },{ x0:4,y0:4,x1:4,y1:5 }]) {
      const projected = sourceCropBlocks([{ paragraphs: [{ lines: [{ text: 'same', bbox }] }] }], 3000,900,1500,450);
      assert.equal(projected[0].paragraphs[0].lines[0].text, 'same'); assert.equal(projected[0].paragraphs[0].lines[0].bbox, undefined);
    }
  });
  await test('actual crop pixels come from the original raster and the existing contact-image contract passes', () => {
    const transcript='E-Mail: qa@example.invalid', linebox={x0:11,y0:15,x1:81,y1:41};
    const projected=sourceCropBlocks([{paragraphs:[{lines:[{text:transcript,bbox:linebox}]}]}],200,100,100,50);
    let request;
    const canvas={width:100,height:50,getContext:()=>({getImageData(x,y,width,height){request={x,y,width,height};return{data:new Uint8ClampedArray(width*height*4).fill(123)};}})};
    const contacts=attachContactCrops([{line:1,kind:'email',start:0,end:transcript.length}],transcript,projected,canvas,{bytes:0,pixels:0},transcript);
    const image=contacts[0].image;assert.ok(image);assert.deepEqual([image.source_width,image.source_height],[100,50]);
    assert.deepEqual(request,{x:0,y:0,width:53,height:33});validateContactImage(image);
    const decoded=decodePng(Buffer.from(image.png_base64,'base64'));assert.ok(decoded.rgba.every(value=>value===123));decoded.rgba.fill(0);
  });
  process.stdout.write(`${passed} conversion timing and native-crop cases PASS\n`);
})().catch(cause => { process.stderr.write(`Conversion timing test failed: ${cause?.stack || 'UNKNOWN'}\n`); process.exitCode=1; })
  .finally(() => { for (const key of environmentKeys) {
    if (previousEnvironment[key] === undefined) delete process.env[key]; else process.env[key] = previousEnvironment[key];
  } });
