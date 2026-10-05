import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build, stop } from 'esbuild';
import { createSuite } from './helpers.js';
import { collectProductFiles, verifyProductRelativeRequires } from '../scripts/lib/product-files.mjs';
import { collectStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';

const require = createRequire(import.meta.url);
const { test, testAsync, done, assert } = createSuite('Shared pure core contracts');
const server = path.resolve(import.meta.dirname, '../plugins/data-secure/server');
const contracts = [
  ['batch-next-action', 'gateway'],
  ['conversion-worker-contract', 'standalone'],
  ['document-result-grade', 'gateway']
];
const coreRoots = [...contracts.map(([name]) => name), 'batch-result-projection', 'batch-progress',
  'processing-mode', 'product-bootstrap', 'source-extraction-contract'];
const pureFiles = [...coreRoots.map((name) => `core/${name}.js`), 'resource-limits.js'];
const sources = new Map(pureFiles.map(name => [name, fs.readFileSync(path.join(server, name), 'utf8')]));

// Parse/bundle every reachable import, including imports in unexecuted branches.
// Both hooks are closed: neither resolution nor loading may fall back to the
// checkout, native modules or esbuild's default filesystem loader. The bundle
// is analysis-only, remains in memory and is never executed or written.
async function staticPureGraph(overrides = new Map()) {
  for (const name of overrides.keys()) assert.ok(sources.has(name), `CORE_IMPORT_FORBIDDEN:${name}`);
  const namespace = 'pure-core';
  const loaded = new Set();
  const result = await build({
    absWorkingDir: server,
    entryPoints: coreRoots.map((name) => `core/${name}.js`),
    outdir: 'core-contract-analysis-only', write: false, bundle: true,
    platform: 'neutral', format: 'cjs', target: 'esnext', treeShaking: false,
    metafile: true, logLevel: 'silent', tsconfigRaw: {},
    // Resolve-only imports are dependencies too. This parser-level lowering
    // makes variable/aliased require.resolve calls fail like dynamic require;
    // it cannot affect product code because no analysis output is executed.
    define: { 'require.resolve': 'require' },
    logOverride: {
      'unsupported-require-call': 'error', 'unsupported-dynamic-import': 'error',
      'indirect-require': 'error', 'ignored-dynamic-import': 'error',
      'empty-glob': 'error', 'require-resolve-not-external': 'error'
    },
    plugins: [{ name: 'closed-pure-core', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        let name = args.path;
        if (args.kind === 'entry-point') name = path.posix.normalize(name);
        else {
          if (args.namespace !== namespace || !sources.has(args.importer) ||
              !['require-call', 'import-statement'].includes(args.kind) ||
              !(name.startsWith('./') || name.startsWith('../'))) {
            throw new Error(`CORE_IMPORT_FORBIDDEN:${args.kind}:${name}`);
          }
          name = path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), name));
          if (!sources.has(name) && sources.has(`${name}.js`)) name += '.js';
        }
        if (!sources.has(name)) throw new Error(`CORE_IMPORT_FORBIDDEN:${name}`);
        return { path: name, namespace };
      });
      builder.onLoad({ filter: /.*/ }, args => {
        if (args.namespace !== namespace || !sources.has(args.path)) {
          throw new Error(`CORE_IMPORT_FORBIDDEN:${args.namespace}:${args.path}`);
        }
        loaded.add(args.path);
        return { contents: overrides.get(args.path) ?? sources.get(args.path), loader: 'js',
          // Glob candidates are rejected by the closed hooks; give their
          // resolver a narrow explicit base instead of the process cwd.
          resolveDir: path.join(server, 'core') };
      });
    } }]
  });
  assert.deepStrictEqual(result.warnings, []);
  assert.deepStrictEqual([...loaded].sort(), [...pureFiles].sort());
  const inputNames = new Set(Object.keys(result.metafile.inputs));
  assert.deepStrictEqual([...inputNames].sort(), pureFiles.map(name => `${namespace}:${name}`).sort());
  for (const input of Object.values(result.metafile.inputs)) {
    for (const dependency of input.imports) {
      assert.ok(!dependency.external && inputNames.has(dependency.path), 'CORE_IMPORT_UNRESOLVED');
    }
  }
  for (const output of Object.values(result.metafile.outputs)) {
    assert.deepStrictEqual(output.imports, [], 'CORE_IMPORT_UNRESOLVED');
  }
  return result.metafile;
}

// Complement the static closure with execution in an isolated context without
// process, filesystem, timers or native modules. This is not branch coverage.
function pureLoader(overrides = new Map()) {
  const loaded = new Map();
  function load(name) {
    if (!sources.has(name)) throw new Error(`CORE_IMPORT_FORBIDDEN:${name}`);
    if (loaded.has(name)) return loaded.get(name).exports;
    const module = { exports: {} };
    loaded.set(name, module);
    const context = vm.createContext({ module, exports: module.exports, require(request) {
      if (typeof request !== 'string' || !request.startsWith('.')) throw new Error(`CORE_IMPORT_FORBIDDEN:${request}`);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), request));
      return load(resolved.endsWith('.js') ? resolved : `${resolved}.js`);
    } }, { codeGeneration: { strings: false, wasm: false } });
    vm.runInContext(overrides.get(name) ?? sources.get(name), context, { filename: name, timeout: 1000 });
    return module.exports;
  }
  return { load, loaded };
}

for (const [name, legacy] of contracts) test(`${legacy}/${name} re-exports the identical core object without a second implementation`, () => {
  const direct = require(path.join(server, 'core', name));
  assert.strictEqual(require(path.join(server, legacy, name)), direct);
  const source = fs.readFileSync(path.join(server, legacy, `${name}.js`), 'utf8').replaceAll('\r\n', '\n');
  assert.strictEqual(source, `'use strict';\n\n// Compatibility path; the shared core owns this contract.\nmodule.exports = require('../core/${name}');\n`);
});

test('the complete core leaf graph loads and runs without gateway, standalone or I/O dependencies', () => {
  const isolated = pureLoader();
  for (const name of coreRoots) {
    assert.deepStrictEqual(Object.keys(isolated.load(`core/${name}.js`)), Object.keys(require(path.join(server, 'core', name))));
  }
  const decision = isolated.load('core/batch-next-action.js');
  assert.strictEqual(decision.batchNextAction({ complete: true }), 'none');
  const result = isolated.load('core/document-result-grade.js');
  const complete = result.releasedDocumentResult({ parserWarnings: [], visualResults: [] });
  assert.strictEqual(result.validateDocumentResult(complete), complete);
  assert.strictEqual(result.positiveDocumentResult(complete), complete);
  assert.strictEqual(result.sameDocumentResult(complete, complete), true);
  const conversion = isolated.load('core/conversion-worker-contract.js');
  for (const code of [...conversion.ERROR_CODES, ...conversion.LIFECYCLE_ERROR_CODES]) {
    assert.strictEqual(result.notProcessedDocumentResult(code).reason_code, code);
    assert.strictEqual(result.isDocumentResultReasonCode(code), true);
    assert.strictEqual(result.normalizeDocumentResultReasonCode(code), code);
  }
  const projection = isolated.load('core/batch-result-projection.js');
  const projected = projection.projectBatchResults({ schema: 'datasecure-batch/2', items: [
    { status: 'released', document_result: complete }
  ] }, { verifyPositive: (item) => ({ state: 'verified', document_result: item.document_result }) });
  assert.strictEqual(projected.grades_verified, true);
  assert.strictEqual(projected.grade_counts.complete, 1);
  const progress = isolated.load('core/batch-progress.js');
  const facts = progress.progressFacts({ schema: 'datasecure-batch/2', token: 'opaque', items: [
    { status: 'released' }
  ] }, { deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review', mappingPendingStatus: 'mapping_pending' });
  assert.strictEqual(facts.complete, true);
  assert.strictEqual(progress.finalizeProgress(facts, projected).next_action, 'open_local_overview');
  const modes = isolated.load('core/processing-mode.js');
  assert.strictEqual(modes.processingModeForBatch({ schema: 'datasecure-batch/5',
    product_channel: 'standalone', processing_mode: 'markdown-only' }), 'markdown-only');
  assert.throws(() => modes.validateProcessingMode('markdown-only', 'plugin'), /PROCESSING_MODE_FORBIDDEN/u);
  const calls = [];
  const bootstrap = isolated.load('core/product-bootstrap.js');
  const initialized = bootstrap.initializeProduct({
    assertRootSeparation: () => calls.push('storage'),
    verifyBundledRuntime: () => calls.push('runtime'), ensureDurableRuntime: () => calls.push('durable'),
    migrateLegacyAuditReceipts: () => calls.push('audit'),
    openBatchPackageProtection: () => ({ ids: ['opaque'], complete: true }),
    cleanupLocalData: () => calls.push('retention'), cleanupUiJobs: () => calls.push('ui'),
    recoverBatches: () => ({ failures: 0 }), replayMappingOutbox: () => ({ failures: 0 }),
    startBatchMaintenance: () => ({ stop() {} }), cleanupExpiredBatchSnapshots: () => {},
    migrateLegacyInput: () => ({ failures: 0, active: false }),
    cleanupAbandonedWorkingJobs: () => ({ failures: 0 }), refuseStartup: () => calls.push('refused')
  });
  assert.deepStrictEqual(calls, ['storage', 'runtime', 'durable', 'audit', 'retention', 'ui']);
  assert.ok(initialized.batchMaintenance && Object.isFrozen(initialized));
  assert.deepStrictEqual([...isolated.loaded.keys()].sort(), [...pureFiles].sort());
});

test('the pure-leaf guard rejects native I/O and both product composition imports', () => {
  for (const dependency of ['node:fs', '../gateway/common', '../standalone/markdown-store']) {
    const isolated = pureLoader(new Map([['core/batch-next-action.js', `require(${JSON.stringify(dependency)});`]]));
    assert.throws(() => isolated.load('core/batch-next-action.js'), /CORE_IMPORT_FORBIDDEN/u);
  }
});

await testAsync('the static parser closes the actual transitive core import graph', async () => {
  await staticPureGraph();
});

const decisionSource = sources.get('core/batch-next-action.js');
const terminalReturn = "if (progress?.complete === true) return 'none';";
function afterTerminal(statement) {
  assert.ok(decisionSource.includes(terminalReturn), 'mutation must target the unexecuted nonterminal branch');
  return new Map([['core/batch-next-action.js', decisionSource.replace(terminalReturn, `${terminalReturn}\n  ${statement}`)]]);
}

await testAsync('the static guard finds allowed deferred imports behind an unexecuted branch', async () => {
  const overrides = afterTerminal("require('../resource-limits');");
  assert.strictEqual(pureLoader(overrides).load('core/batch-next-action.js').batchNextAction({ complete: true }), 'none');
  const graph = await staticPureGraph(overrides);
  assert.ok(graph.inputs['pure-core:core/batch-next-action.js'].imports.some(
    dependency => dependency.path === 'pure-core:resource-limits.js'));
});

await testAsync('the static guard rejects deferred native, product, missing and caught imports', async () => {
  for (const statement of [
    "require('node:fs');", "require('../gateway/common');",
    "require('../standalone/conversion-worker-contract');", "require('./missing-core-leaf');",
    "try { require('../gateway/common'); } catch {}",
    "import('../standalone/conversion-worker-contract').catch(() => {});"
  ]) {
    const overrides = afterTerminal(statement);
    // Reproduce the old blind spot explicitly: the terminal VM path succeeds.
    assert.strictEqual(pureLoader(overrides).load('core/batch-next-action.js').batchNextAction({ complete: true }), 'none');
    await assert.rejects(() => staticPureGraph(overrides), /CORE_IMPORT_FORBIDDEN/u, statement);
  }
});

await testAsync('dynamic, indirect, resolve-only and glob imports cannot bypass the closed graph', async () => {
  const rejectedDiagnostics = new Set(['unsupported-require-call', 'unsupported-dynamic-import',
    'indirect-require', 'ignored-dynamic-import', 'empty-glob', 'require-resolve-not-external']);
  for (const statement of [
    'require(progress.module);', 'import(progress.module);',
    'const load = require; load(progress.module);', 'module.require(progress.module);',
    'require.resolve(progress.module);', "require['resolve'](progress.module);",
    'const resolve = require.resolve; resolve(progress.module);',
    "require('./' + progress.module + '.js');", "import('./' + progress.module + '.js');"
  ]) {
    await assert.rejects(() => staticPureGraph(afterTerminal(statement)), error =>
      Array.isArray(error.errors) && error.errors.some(diagnostic =>
        rejectedDiagnostics.has(diagnostic.id) || diagnostic.text.includes('CORE_IMPORT_FORBIDDEN') ||
        // A glob in the virtual namespace may fail before plugin resolution.
        // This checks an esbuild diagnostic, not JavaScript with a regex.
        /Could not resolve (?:require|import)\(/u.test(diagnostic.text)), statement);
  }
});

test('batch decisions preserve terminal, review, preparation and mixed-debt semantics', () => {
  const { batchNextAction, batchReviewReady, batchReviewCanPrepare } = require(path.join(server, 'core/batch-next-action'));
  const ready = { batch_total: 2, completed: 1, deferred_review: 1, remaining: 0, retryable: 0,
    delivery_pending: 0, mapping_pending: 0, processing: 0 };
  assert.strictEqual(batchNextAction({ complete: true }), 'none');
  assert.strictEqual(batchNextAction(ready), 'review');
  assert.strictEqual(batchReviewCanPrepare(ready), true);
  for (const debt of ['remaining', 'retryable', 'delivery_pending', 'mapping_pending', 'processing']) {
    const mixed = { ...ready, completed: 0, [debt]: 1 };
    assert.strictEqual(batchReviewReady(mixed), false);
    assert.strictEqual(batchNextAction(mixed), 'batch');
    assert.strictEqual(batchReviewCanPrepare(mixed), !['remaining', 'retryable'].includes(debt));
    const missing = { ...ready };
    delete missing[debt];
    assert.strictEqual(batchReviewReady(missing), false);
    assert.strictEqual(batchReviewCanPrepare(missing), false);
  }
  assert.strictEqual(batchReviewCanPrepare({ ...ready, local_processing_active: true }), false);
  assert.strictEqual(batchReviewCanPrepare({ ...ready, batch_phase: 'invalid_local_state' }), false);
  assert.strictEqual(batchNextAction({}), 'batch');
});

test('conversion metadata preserves the exact frozen source, limit and error contract', () => {
  const contract = require(path.join(server, 'core/conversion-worker-contract'));
  assert.strictEqual(contract.MAX_INPUT_BYTES, 64 * 1024 * 1024);
  assert.deepStrictEqual(Object.keys(contract), ['LIFECYCLE_ERROR_CODES', 'MAX_INPUT_BYTES', 'SOURCE_TYPES', 'ERROR_CODES']);
  assert.deepStrictEqual(contract.SOURCE_TYPES, { '.txt': 'txt', '.md': 'md', '.markdown': 'md', '.csv': 'csv', '.docx': 'docx',
    '.xlsx': 'xlsx', '.pptx': 'pptx', '.pdf': 'pdf', '.png': 'png', '.bmp': 'bmp', '.jpg': 'jpeg', '.jpeg': 'jpeg' });
  assert.deepStrictEqual(contract.LIFECYCLE_ERROR_CODES, ['CONVERSION_RUNTIME_UNAVAILABLE', 'CONVERSION_ISOLATION_UNAVAILABLE',
    'CONVERSION_START_FAILED', 'CONVERSION_EXECUTABLE_MISSING', 'CONVERSION_EXECUTABLE_DENIED',
    'CONVERSION_ARCHITECTURE_INVALID', 'CONVERSION_DEPENDENCY_MISSING', 'CONVERSION_LIMIT_SETUP_FAILED',
    'CONVERSION_TERMINATION_UNCONFIRMED', 'CONVERSION_TIMEOUT', 'CONVERSION_OUTPUT_LIMIT',
    'CONVERSION_RESOURCE_LIMIT', 'CONVERSION_ISOLATION_FAILED', 'CONVERSION_RESPONSE_INVALID', 'MARKDOWN_ARTIFACT_INVALID']);
  assert.deepStrictEqual(contract.ERROR_CODES, ['CONVERSION_INPUT_INVALID', 'CONVERSION_INPUT_INCOMPLETE', 'CONVERSION_POLICY_FAILED',
    'CONVERSION_EXTRACTION_FAILED', 'CONVERSION_IMAGE_INVALID', 'CONVERSION_PIXEL_LIMIT', 'CONVERSION_MODEL_INVALID', 'CONVERSION_OCR_FAILED',
    'PDF_EXTRACTION_FAILED', 'PDF_OBJECT_COVERAGE_UNVERIFIED', 'SOURCE_ENCRYPTED_UNSUPPORTED', 'TEXT_TOO_LARGE',
    'MARKDOWN_EXTRACTION_FAILED', 'MARKDOWN_FORMAT_UNSUPPORTED', 'INPUT_FILE_LIMIT', 'INPUT_FORMAT_LIMIT', 'TEXT_ENCODING_INVALID',
    'TEXT_CONTROL_INVALID', 'CSV_EMPTY', 'CSV_QUOTE_INVALID', 'CSV_DELIMITER_AMBIGUOUS', 'CSV_ROW_WIDTH_INVALID', 'DOCX_STRUCTURE_UNSAFE',
    'DOCX_STRUCTURE_LIMIT', 'OOXML_XML_CHARACTER_INVALID', 'OOXML_ENCODING_INVALID', 'XLSX_STRUCTURE_UNSAFE', 'XLSX_STRUCTURE_LIMIT',
    'XLSX_SHARED_STRING_INVALID', 'PPTX_STRUCTURE_UNSAFE', 'PPTX_STRUCTURE_LIMIT']);
  for (const value of [contract, contract.SOURCE_TYPES, contract.ERROR_CODES, contract.LIFECYCLE_ERROR_CODES]) assert.ok(Object.isFrozen(value));
});

test('document grades retain their export surface, visual limit and fail-closed reasons', () => {
  const grade = require(path.join(server, 'core/document-result-grade'));
  assert.deepStrictEqual(Object.keys(grade), ['SCHEMA', 'GRADES', 'OMISSION_CODES', 'REASON_CODES', 'DocumentResultError',
    'validateDocumentResult', 'releasedDocumentResult', 'notProcessedDocumentResult', 'normalizeDocumentResultReasonCode',
    'isDocumentResultReasonCode', 'sameDocumentResult', 'positiveDocumentResult', 'validateManifestDocumentResult']);
  const visuals = Array.from({ length: 150 }, () => ({ status: 'included' }));
  assert.strictEqual(grade.releasedDocumentResult({ parserWarnings: [], visualResults: visuals }).grade, 'complete');
  assert.throws(() => grade.releasedDocumentResult({ parserWarnings: [], visualResults: [...visuals, { status: 'included' }] }), grade.DocumentResultError);
  assert.throws(() => grade.notProcessedDocumentResult('UNKNOWN_PRIVATE_CAUSE'), grade.DocumentResultError);
  assert.strictEqual(grade.normalizeDocumentResultReasonCode('UNKNOWN_PRIVATE_CAUSE'), 'INTERNAL_FAILURE');
  assert.ok(Object.isFrozen(grade));
});

test('both actual product projections contain the same core implementations and remain closed', () => {
  const plugin = new Map(collectProductFiles(path.dirname(server)).map(file => [file.archivePath, fs.readFileSync(file.fullPath)]));
  const standalone = new Map(collectStandaloneRuntime(server, 'windows-x64').map(file => [`server/${file.relative}`, file.bytes]));
  assert.deepStrictEqual(verifyProductRelativeRequires(plugin), { ok: true });
  assert.deepStrictEqual(verifyProductRelativeRequires(standalone), { ok: true });
  assert.ok(!plugin.has('server/standalone/application-service.js'));
  assert.ok(!standalone.has('server/mcp-server.js') && !standalone.has('server/index.js'));
  for (const name of coreRoots) {
    const core = `server/core/${name}.js`;
    for (const [channel, entries] of [['plugin', plugin], ['standalone', standalone]]) {
      assert.ok(entries.get(core)?.equals(Buffer.from(sources.get(`core/${name}.js`))),
        `${channel}: actual ${core} bytes shipped`);
      const missing = new Map(entries);
      missing.delete(core);
      assert.throws(() => verifyProductRelativeRequires(missing), /PRODUCT_MODULE_DEPENDENCY_MISSING/u,
        `${channel}: missing ${core} must never fall back to a checkout or legacy implementation`);
    }
  }
  for (const [name, legacy] of contracts) {
    const core = `server/core/${name}.js`;
    for (const [channel, entries] of [['plugin', plugin], ['standalone', standalone]]) {
      assert.ok(entries.has(`server/${legacy}/${name}.js`), `${channel}: compatibility path retained`);
    }
  }
});

await done(() => stop());
