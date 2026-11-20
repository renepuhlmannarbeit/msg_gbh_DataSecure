import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Entire current sources, unchanged: the model replaces IO/runtime seams,
// not the driver's record/identity/finally/report algorithms or evaluator.
const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'scripts/benchmark-quality.mjs'), 'utf8');
const gateSource = fs.readFileSync(path.join(root, 'scripts/check-quality-gate.mjs'), 'utf8');
const require = createRequire(import.meta.url);
const evaluator = require('../../benchmarks/evaluate-quality');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readerFile = 'tests/lib/read-product-package.cjs';
assert.equal(typeof vm.SourceTextModule, 'function', '--experimental-vm-modules required');
let sequence = 0;

async function fixture(options = {}) {
  const files = new Map(), directories = new Set(), writes = [], reads = [], timers = [];
  const observations = { removes: 0, kills: 0, exports: 0, finalizes: 0, reader: 0, stdout: [] };
  const corpus = path.join(root, 'dist', `quality-driver-model-${++sequence}`);
  const reference = 'Status: 42 Prozent.';
  const scope = path.join(root, `.tmp-standalone-package-quality-model-${sequence}`);
  const marker = path.join(scope, 'server', 'MODEL-RUNTIME-EVIDENCE.txt');
  const entry = { id: 'synthetic-driver-fixture', file: 'model.txt', format: 'txt', ocr_variant: 'none',
    split: 'holdout', location: 'synthetic-line-1', reference, entities: [],
    preserve: [{ value: reference, start: 0, end: reference.length, category: 'factual' }],
    bytes: Buffer.byteLength(reference), sha256: sha(reference) };
  const manifest = { entries: [entry] };
  const original = path.join(corpus, 'EINGABEN', entry.file), referencePath = path.join(corpus, 'REFERENZ.json');
  const envBefore = { EU_PRIVACY_ROOT: 'before-private', EU_PRIVACY_RESULT_ROOT: 'before-visible',
    DATASECURE_PRODUCT_CHANNEL: 'before-channel', LOCALAPPDATA: 'before-local', KEEP_SENTINEL: 'unchanged' };
  const processModel = { platform: 'win32', arch: 'x64', env: { ...envBefore },
    argv: ['node', 'quality-driver-source-model-entry'], stdout: { write(value) { observations.stdout.push(value); } } };
  const ioError = code => Object.assign(new Error(code), { code });
  const ensureDirectory = value => {
    const parent = path.dirname(value);
    if (parent !== value && !directories.has(parent)) ensureDirectory(parent);
    directories.add(value);
  };
  const fakeFs = {
    readFileSync(value, encoding) {
      value = path.resolve(value); reads.push(value);
      let bytes = files.get(value);
      if (bytes === undefined) {
        const relative = path.relative(root, value).split(path.sep).join('/');
        // Only engineering source reads may reach the real readonly FS.
        // Corpus/runtime/report content always lives solely in the model.
        if (!(relative === 'package.json' || relative.startsWith('scripts/') ||
            relative.startsWith('benchmarks/') || relative.startsWith('tests/lib/'))) throw ioError('ENOENT');
        bytes = fs.readFileSync(value);
      }
      return encoding ? Buffer.from(bytes).toString(encoding) : Buffer.from(bytes);
    },
    existsSync(value) { value = path.resolve(value); return files.has(value) || directories.has(value); },
    mkdirSync(value, settings) {
      value = path.resolve(value);
      if (settings?.recursive) { ensureDirectory(value); return; }
      if (directories.has(value) || files.has(value)) throw ioError('EEXIST');
      if (!directories.has(path.dirname(value))) throw ioError('ENOENT');
      directories.add(value);
    },
    mkdtempSync(prefix) {
      assert.equal(prefix, path.join(root, '.tmp-standalone-package-quality-'));
      ensureDirectory(scope); return scope;
    },
    writeFileSync(value, bytes, settings) {
      value = path.resolve(value);
      if (options.reportFailure && path.basename(value) === 'QUALITAET.json') throw options.reportFailure;
      if (settings?.flag === 'wx' && fakeFs.existsSync(value)) throw ioError('EEXIST');
      if (!directories.has(path.dirname(value))) throw ioError('ENOENT');
      writes.push({ value, flag: settings?.flag, bytes: Buffer.from(bytes) });
      files.set(value, Buffer.from(bytes));
    },
    rmSync() { observations.removes++; throw ioError('UNEXPECTED_DIRECT_REMOVE'); },
    unlinkSync() { observations.removes++; throw ioError('UNEXPECTED_DIRECT_REMOVE'); },
    rmdirSync() { observations.removes++; throw ioError('UNEXPECTED_DIRECT_REMOVE'); }
  };
  // Old import is a real existing seam: Before can succeed or throw at this
  // exact call. After must not import/call it at all. No actual FS removal.
  const removeScope = (parent, value) => {
    assert.equal(parent, root); assert.equal(value, scope); observations.removes++;
    if (options.removalFailure) throw options.removalFailure;
    for (const name of files.keys()) if (name === scope || name.startsWith(scope + path.sep)) files.delete(name);
    for (const name of directories) if (name === scope || name.startsWith(scope + path.sep)) directories.delete(name);
  };
  let spawned = false, nextToken = 0;
  const children = [], states = new Map();
  const originalSpawn = (...args) => {
    assert.deepEqual(args, ['synthetic-child', []]);
    const child = new EventEmitter(); children.push(child);
    child.kill = signal => {
      assert.equal(signal, 'SIGTERM'); observations.kills++;
      if (options.killFailure) throw options.killFailure;
      if (!options.neverClose) child.emit('close', 0, null);
      return true;
    };
    return child;
  };
  const childProcessModel = { spawn: originalSpawn,
    execFileSync(command, args) { assert.equal(command, 'git'); assert.deepEqual(Array.from(args), ['rev-parse', 'HEAD']); return 'fixture-source-revision\n'; } };
  const batch = {
    beginBatch(input) {
      assert.equal(input.expectedCount, 1); assert.equal(input.queue[0].full, original);
      assert.equal(input.queue[0].sourceLabel, entry.file);
      assert.equal(input.queue[0].sourceBytes, entry.bytes);
      const token = `token-${++nextToken}`, conversion = input.processingMode === 'markdown-only';
      states.set(token, { conversion, items: [{ source_label: entry.file,
        ...(conversion ? { artifact_id: 'artifact-1' } : { package_id: 'package-1' }), status: 'completed' }] });
      return { batch_token: token };
    },
    async processBatchNext(token) {
      if (!spawned && options.child) {
        spawned = true;
        const child = childProcessModel.spawn('synthetic-child', []);
        if (!options.neverClose && !options.killFailure) child.emit('close', 0, null);
      }
      if (Object.hasOwn(options, 'runFailure')) throw options.runFailure;
      if (options.changeOriginal) files.set(original, Buffer.from(reference + ' changed'));
      if (options.changeReference) files.set(referencePath, Buffer.from('changed reference'));
      if (options.changeReader) files.set(path.join(root, readerFile), Buffer.from('changed reader source'));
      const state = states.get(token); assert.ok(state);
      return state.conversion ? { ok: true, artifact_id: 'artifact-1' } : { ok: true, package_id: 'package-1' };
    },
    readBatchProgress() { return { deferred_review: false }; },
    finalizePublishedPackageLocally(token, id) {
      const state = states.get(token); assert.ok(state);
      assert.equal(id, state.conversion ? 'artifact-1' : 'package-1'); observations.finalizes++;
    },
    exportCompletedBatchResults(token) { assert.ok(states.has(token)); observations.exports++; },
    _test: { readState(token) { const state = states.get(token); assert.ok(state); return state; } }
  };
  const engine = { sensitiveSpans(value) { assert.equal(value, reference); return []; },
    anonymize(value) { assert.equal(value, reference); return { text: reference }; } };
  const requireModel = name => {
    if (name === '../benchmarks/evaluate-quality') return { ...evaluator,
      evaluateQuality(...args) { if (options.evaluationFailure) throw options.evaluationFailure; return evaluator.evaluateQuality(...args); } };
    if (name === '../plugins/data-secure/server/core/standalone-policy-fingerprint') return {
      calculateStandalonePolicyFingerprint() { return 'synthetic-source-policy'; } };
    if (name === path.join(scope, 'server/gateway/batch')) return batch;
    if (name === path.join(scope, 'server/privacy/engine')) return engine;
    if (name === '../tests/lib/read-product-package.cjs') return { reader(server, channel) {
      assert.equal(server, path.join(scope, 'server')); assert.equal(channel, 'standalone');
      return (id, capability, offset, count) => {
        assert.equal(id, 'package-1'); assert.equal(capability, undefined); assert.equal(offset, 0); assert.equal(count, 30000);
        observations.reader++;
        return { text: reference, next_offset: reference.length, has_more: false };
      };
    } };
    if (name === path.join(scope, 'server/standalone/markdown-store')) return {
      readMarkdownArtifact(id) { assert.equal(id, 'artifact-1'); return { markdown: reference }; } };
    if (name === path.join(scope, 'server/gateway/result-folder-config')) return {
      saveConfiguredResultRoot(value) { assert.equal(value, path.join(scope, 'visible')); } };
    throw new Error(`UNEXPECTED_REQUIRE:${name}`);
  };
  const projection = {
    collectStandaloneRuntime() { return [{ relative: 'fixture.js', bytes: Buffer.from('synthetic-runtime-source') }]; },
    writeStandaloneRuntime(_source, destination, target) {
      assert.equal(destination, path.join(scope, 'server')); assert.equal(target, 'windows-x64');
      ensureDirectory(destination); files.set(marker, Buffer.from('keep this runtime evidence'));
    }
  };
  const conversion = {
    collectConversionRuntime() { return [{ relative: 'fixture-runtime', bytes: Buffer.from('synthetic-conversion-runtime') }]; },
    writeConversionRuntime(_source, destination, target) {
      assert.equal(destination, path.join(scope, 'server/standalone/conversion-runtime')); assert.equal(target, 'windows-x64');
      ensureDirectory(destination);
    }
  };
  const generator = { async generateQualityCorpus(destination) {
    assert.equal(destination, corpus); ensureDirectory(path.join(corpus, 'EINGABEN'));
    files.set(original, Buffer.from(reference)); files.set(referencePath, Buffer.from(JSON.stringify(manifest)));
    return manifest;
  } };
  const context = vm.createContext({ Buffer, console, process: processModel,
    setTimeout(callback, milliseconds) {
      assert.equal(milliseconds, 6000); const timer = { cleared: false }; timers.push(timer);
      if (options.neverClose || options.killFailure) queueMicrotask(() => { if (!timer.cleared) callback(); });
      return timer;
    }, clearTimeout(timer) { if (timer) timer.cleared = true; } });
  const modules = new Map();
  const synthetic = (name, exports) => {
    if (!modules.has(name)) modules.set(name, new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: name }));
    return modules.get(name);
  };
  const driverPath = path.join(root, 'scripts/benchmark-quality.mjs');
  const driver = new vm.SourceTextModule(source, { context, identifier: driverPath,
    initializeImportMeta(meta) { meta.url = pathToFileURL(driverPath).href; meta.dirname = path.dirname(driverPath); } });
  const linker = specifier => {
    if (specifier === 'node:fs') return synthetic(specifier, { default: fakeFs });
    if (specifier === 'node:path') return synthetic(specifier, { default: path });
    if (specifier === 'node:crypto') return synthetic(specifier, { default: crypto });
    if (specifier === 'node:child_process') return synthetic(specifier, { default: childProcessModel });
    if (specifier === 'node:module') return synthetic(specifier, { createRequire() { return requireModel; } });
    if (specifier === 'node:url') return synthetic(specifier, { pathToFileURL });
    if (specifier === './generate-quality-corpus.mjs') return synthetic(specifier, generator);
    if (specifier === './lib/standalone-runtime-projection.mjs') return synthetic(specifier, projection);
    if (specifier === './lib/standalone-conversion-runtime.mjs') return synthetic(specifier, conversion);
    if (specifier === '../tests/helpers/standalone-package-scope.mjs') return synthetic(specifier, { removePackageSmokeScope: removeScope });
    if (specifier === './benchmark-quality.mjs') return driver;
    throw new Error(`UNEXPECTED_IMPORT:${specifier}`);
  };
  await driver.link(linker); await driver.evaluate();
  const gatePath = path.join(root, 'scripts/check-quality-gate.mjs');
  const gate = new vm.SourceTextModule(gateSource, { context, identifier: gatePath,
    initializeImportMeta(meta) { meta.url = pathToFileURL(gatePath).href; meta.dirname = path.dirname(gatePath); } });
  await gate.link(linker); await gate.evaluate();
  return { driver: driver.namespace, gate: gate.namespace, corpus, scope, marker, files, directories, writes,
    observations, reference, entry, original, referencePath, reads, processModel, envBefore, timers,
    mutateReader() { files.set(path.join(root, readerFile), Buffer.from('changed reader source')); },
    restored() {
      assert.equal(childProcessModel.spawn, originalSpawn, 'original spawn restored');
      assert.deepEqual(processModel.env, envBefore, 'every scoped environment value restored');
      assert.ok(timers.every(timer => timer.cleared), 'deadline tokens cleared');
      assert.equal(observations.stdout.length, 0, 'no source/path-bearing CLI output in API model');
    },
    retained() {
      assert.equal(observations.removes, 0, 'no scope-removal operation on any exit');
      assert.ok(directories.has(scope), 'own runtime directory retained');
      assert.equal(files.get(marker)?.toString(), 'keep this runtime evidence');
    }
  };
}

let passed = 0, failed = 0;
async function test(name, operation) {
  try { await operation(); passed++; console.log(`ok - ${name}`); }
  catch (error) { failed++; console.error(`not ok - ${name}\n${error?.stack || String(error)}`); }
}
function expected(model, report) {
  return { ...model.driver.qualitySourceIdentity('windows-x64'), version: report.version,
    target: report.target, variants: 1, files: [model.entry.file], reference_sha256: report.reference_sha256 };
}
function assertEvidence(report, model) {
  model.retained(); model.restored();
  assert.deepEqual(JSON.parse(JSON.stringify(report.runtime_evidence)), {
    directory: model.scope, retained: true, deletion: 'not_attempted',
    observed_close_scope: 'captured-direct-spawn-children-only', writer_quiescence: 'unconfirmed'
  });
}
await test('valid full-source baseline traverses both modes, evaluator, counterfiles and actual gate', async () => {
  const model = await fixture({ child: true });
  const report = await model.driver.runQualityBenchmark(model.corpus);
  assert.equal(report.assessment.status, 'pass'); assert.equal(report.fatal_error, null);
  assert.equal(report.results.length, 1); assert.equal(report.results[0].final.status, 'published');
  assert.equal(report.runtime_cleanup, 'confirmed'); assert.equal(report.exact_release_package, false);
  assert.deepEqual(Array.from(model.gate.qualityGateFailures(report, expected(model, report))), []);
  assert.equal(model.observations.reader, 1); assert.equal(model.observations.exports, 2); assert.equal(model.observations.finalizes, 2);
  assert.deepEqual(Object.keys(report.results[0].countercheck_files).sort(), ['automatic', 'extracted', 'final']);
  for (const file of Object.values(report.results[0].countercheck_files)) {
    const target = path.join(model.corpus, file);
    assert.equal(model.files.get(target).toString(), model.reference);
    assert.equal(model.writes.find(write => write.value === target)?.flag, 'wx');
  }
  for (const file of ['QUALITAET.json', 'BEFUNDE.csv', 'QUALITAET.md']) assert.ok(model.files.has(path.join(model.corpus, 'BERICHTE', file)));
  assert.equal(sha(model.files.get(model.original)), model.entry.sha256);
  assert.ok(model.reads.includes(model.original));
  assert.ok(model.reads.filter(file => file === model.referencePath).length >= 2);
  model.restored();
});
await test('only a changed direct reader source invalidates the actual driver identity and gate', async () => {
  const model = await fixture(); const report = await model.driver.runQualityBenchmark(model.corpus);
  const before = expected(model, report);
  assert.deepEqual(Array.from(model.gate.qualityGateFailures(report, before)), []);
  model.mutateReader(); const after = expected(model, report);
  assert.equal(before.runtime_sha256, after.runtime_sha256); assert.equal(before.conversion_runtime_sha256, after.conversion_runtime_sha256);
  assert.equal(before.core_policy_fingerprint, after.core_policy_fingerprint);
  assert.equal(after.evaluation_sha256[readerFile], sha('changed reader source'));
  assert.notEqual(before.evaluation_sha256[readerFile], after.evaluation_sha256[readerFile]);
  assert.deepEqual(Array.from(model.gate.qualityGateFailures(report, after)), ['QUALITY_REPORT_STALE']);
});
await test('successful run retains runtime evidence despite observed direct-child closure', async () => {
  const model = await fixture({ child: true }); const report = await model.driver.runQualityBenchmark(model.corpus);
  assert.equal(report.assessment.status, 'pass'); assert.equal(report.runtime_cleanup, 'confirmed'); assertEvidence(report, model);
});
await test('first run error survives an old cleanup seam that would itself throw', async () => {
  const primary = Object.assign(new Error('first run error'), { code: 'QUALITY_TEST_PRIMARY' });
  const secondary = new Error('scope remover must not run');
  const model = await fixture({ runFailure: primary, removalFailure: secondary });
  const report = await model.driver.runQualityBenchmark(model.corpus);
  assert.equal(report.fatal_error, primary.code); assert.equal(report.fatal_file, 'model.txt');
  assert.equal(report.assessment.status, 'blocked'); assertEvidence(report, model);
});
await test('report write failure keeps its exact primary error and the runtime scope', async () => {
  const failure = Object.assign(new Error('synthetic report ENOSPC'), { code: 'ENOSPC' });
  const model = await fixture({ reportFailure: failure });
  await assert.rejects(model.driver.runQualityBenchmark(model.corpus), error => error === failure);
  model.retained(); model.restored();
  assert.ok(model.files.has(path.join(model.corpus, 'GEGENPRUEFUNG', '001-final.md')));
});
await test('evaluation failure retains exact error and runtime evidence', async () => {
  const failure = new Error('synthetic evaluation failure'); const model = await fixture({ evaluationFailure: failure });
  await assert.rejects(model.driver.runQualityBenchmark(model.corpus), error => error === failure);
  model.retained(); model.restored();
});
await test('unconfirmed direct-child closure stays blocked, scoped and retained without a writer-join claim', async () => {
  const model = await fixture({ child: true, neverClose: true }); const report = await model.driver.runQualityBenchmark(model.corpus);
  assert.equal(report.fatal_error, 'QUALITY_WORKER_CLEANUP_UNCONFIRMED'); assert.equal(report.runtime_cleanup, 'unconfirmed');
  assert.equal(report.assessment.status, 'blocked'); assert.equal(model.observations.kills, 1); assertEvidence(report, model);
});
await test('kill errors cannot bypass environment restoration or replace an earlier run failure, including falsy throws', async () => {
  for (const primary of [Object.assign(new Error('first'), { code: 'QUALITY_TEST_PRIMARY' }), null, false, 0, '']) {
    const model = await fixture({ child: true, neverClose: true, killFailure: new Error('synthetic kill refusal'), runFailure: primary });
    const report = await model.driver.runQualityBenchmark(model.corpus);
    assert.equal(report.fatal_error, primary?.code || 'QUALITY_RUN_FAILED');
    assert.equal(report.runtime_cleanup, 'unconfirmed'); assert.equal(report.assessment.status, 'blocked');
    assert.equal(model.observations.kills, 1); assertEvidence(report, model);
  }
  const model = await fixture({ child: true, neverClose: true, killFailure: new Error('synthetic kill refusal') });
  const report = await model.driver.runQualityBenchmark(model.corpus);
  assert.equal(report.fatal_error, 'QUALITY_WORKER_CLEANUP_UNCONFIRMED'); assert.equal(report.runtime_cleanup, 'unconfirmed');
  assert.equal(report.assessment.status, 'blocked'); assertEvidence(report, model);
});
await test('unchanged postchecks still refuse original/reference drift and retain the runtime', async () => {
  for (const [option, code] of [['changeOriginal', 'QUALITY_SOURCE_CHANGED'], ['changeReference', 'QUALITY_REFERENCE_CHANGED']]) {
    const model = await fixture({ [option]: true });
    await assert.rejects(model.driver.runQualityBenchmark(model.corpus), error => error?.message === code);
    model.retained(); model.restored();
  }
});
await test('reader drift during the run is a source-change fatal while all output evidence remains available', async () => {
  const model = await fixture({ changeReader: true }); const report = await model.driver.runQualityBenchmark(model.corpus);
  assert.equal(report.fatal_error, 'QUALITY_EVALUATION_SOURCE_CHANGED'); assert.equal(report.assessment.status, 'blocked');
  assertEvidence(report, model); assert.ok(model.files.has(path.join(model.corpus, 'BERICHTE', 'QUALITAET.json')));
});
console.log(`Quality driver source model: ${passed} passed, ${failed} failed; no app/native execution or real FS mutation`);
if (failed) process.exitCode = 1;
