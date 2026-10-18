'use strict';

// Source-only contract regression: evaluate the exact artifact consumer with
// explicitly modelled file/native/converter boundaries. No fixture is approved
// outside this in-memory test, and no compiler, codesign or child is started.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readMacCoreBuildProcessLifecycle } from '../scripts/lib/macos-core-process-lifecycle.mjs';

function successfulProcess(step) {
  return { schema: 'datasecure-mac-producer-process/1', step, cause: 'success', spawned: true,
    exit_seen: true, exit_code: 0, exit_signal: null, close_seen: true, close_code: 0, close_signal: null,
    kill_attempted: false, kill_result: 'not_requested', kill_error: null,
    child_end_confirmed: true, group_end_confirmed: false,
    timer_cleanup_failed: false, listener_cleanup_failed: false, detach_failed: false,
    log_fsync_failed: false, log_close_failed: false };
}
const processPair = () => ({ configure: successfulProcess('configure'), make: successfulProcess('make') });
const booleanFields = ['spawned', 'exit_seen', 'close_seen', 'kill_attempted', 'child_end_confirmed',
  'group_end_confirmed', 'timer_cleanup_failed', 'listener_cleanup_failed', 'detach_failed', 'log_fsync_failed', 'log_close_failed'];


const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const invalid = error => error?.message === 'STANDALONE_MACOS_STATIC_CORE_INVALID';
const targets = { 'macos-arm64': 'aarch64-apple-darwin', 'macos-x64': 'x86_64-apple-darwin' };

export async function verifyMacCoreProvenanceSource(source) {
  assert.equal(typeof vm.SourceTextModule, 'function', 'run Node with --experimental-vm-modules');
  let passed = 0;
  const results = [];
  async function scenario(name, target, mutate = () => {}, expected = 'accept') {
    const directory = path.resolve('synthetic-macos-core-provenance-root');
    const files = new Map(), reads = [];
    let preparedCalls = 0, machoCalls = 0, converterCalls = 0;
    const core = Buffer.alloc(96, target === 'macos-arm64' ? 65 : 66);
    const converter = Buffer.alloc(80, 67), license = Buffer.from('Synthetic Node license fixture\n');
    const sourceFiles = {
      guard_c_sha256: ['native/ownership-guard/ownership-guard.c', Buffer.from('synthetic guard source')],
      adapter_cc_sha256: ['native/ownership-guard/macos-static-link.cc', Buffer.from('synthetic adapter cc')],
      adapter_h_sha256: ['native/ownership-guard/macos-static-link.h', Buffer.from('synthetic adapter header')],
      transform_sha256: ['native/runtime/macos-core-source.mjs', Buffer.from('synthetic transform')]
    };
    const prepared = Object.fromEntries([
      'src/api/environment.cc', 'node.gyp', 'src/datasecure/ownership-guard.c',
      'src/datasecure/ownership-guard-link.cc', 'src/datasecure/ownership-guard-link.h'
    ].map(key => [key, digest('synthetic prepared ' + key)]));
    const inputs = Object.fromEntries(Object.entries(sourceFiles).map(([key, [, bytes]]) => [key, digest(bytes)]));
    const upstream = { archive: 'node-v22.23.2.tar.xz',
      sha256: 'bbe768df8d5815d7fa76124052985332452e0a4742d39f32027550d1aab8f6fb' };
    const binding = { name: 'datasecure_ownership_guard', abi: 1, napi: 8 };
    const provenance = { schema: 'datasecure-macos-static-core-build-provenance/2',
      target, node_version: '22.23.2', inputs: { ...inputs },
      configure_args: ['--dest-cpu=' + target.slice(6), '--dest-os=mac', '--no-cross-compiling',
        '--use_clang', '--with-intl=full-icu', '--download=none', '-C'],
      make_args: [target === 'macos-arm64' ? '-j1' : '-j4', 'V=1', 'node'],
      toolchain: { xcode: 'Xcode 16.2', sdk: '15.2', python: 'Python 3.12.8', clang: 'Apple clang 16.0.0',
        python_sha256: digest('python fixture'), clang_sha256: digest('clang fixture') },
      logs: { configure_sha256: digest('configure fixture'), make_sha256: digest('make fixture'),
        compile_commands_sha256: digest('compile commands fixture') },
      process_lifecycle: processPair(), prepared_source_sha256: { ...prepared } };
    const evidence = { archive_sha256: digest('official converter archive fixture') };
    const artifact = { schema: 'datasecure-macos-static-core-artifact/1', role: 'mutating-core',
      target, rust_target: targets[target], node_version: '22.23.2', upstream, static_binding: binding, inputs,
      build: { provenance_file: 'BUILD-PROVENANCE.json', provenance_sha256: '' },
      core: { file: 'datasecure-core', bytes: core.length, sha256: digest(core), unsigned_sha256: digest('unsigned fixture') },
      converter: { archive_sha256: evidence.archive_sha256, bytes: converter.length, sha256: digest(converter),
        license_sha256: digest(license) },
      license: { file: 'LICENSE.node.txt', bytes: license.length, sha256: digest(license) },
      signing: { identity: '-', hardened_runtime: true, entitlements: { 'com.apple.security.cs.allow-jit': true } } };
    const policy = { schema: 'datasecure-macos-static-core-policy/1', node_version: '22.23.2',
      maximum_core_bytes: 128 * 1024 * 1024, upstream, guard_source_sha256: inputs.guard_c_sha256,
      static_binding: binding, approved_artifacts: [] };
    const mockedFs = { lstatSync(file, options) {
      assert.equal(options.bigint, true);
      return { dev: 1n, ino: file.endsWith('datasecure-core') ? 10n : 11n };
    } };
    const boundedReader = { readBoundFile(file, options) {
      reads.push(file);
      assert.ok(files.has(file), 'only enumerated synthetic fixture files may be read');
      const bytes = files.get(file);
      assert.ok(bytes.length >= options.minimum && bytes.length <= options.maximum);
      assert.equal(options.checkCtime, true);
      return Buffer.from(bytes);
    } };
    const dependency = new Map([
      ['node:fs', { default: mockedFs }], ['node:path', { default: path }],
      ['node:url', { fileURLToPath }], ['node:crypto', { default: crypto }],
      ['node:child_process', { spawnSync() { assert.fail('native commands are outside this source model'); } }],
      ['../../plugins/data-secure/server/core/bound-file-io.js', { default: boundedReader }],
      ['./macos-core-process-lifecycle.mjs', { readMacCoreBuildProcessLifecycle }],
      ['./macos-native-contract.mjs', { inspectMachO(bytes) {
        machoCalls++; assert.ok(bytes.equals(core));
        return { fileType: 2, architecture: target.slice(6), signed: true, minimum: 0x0d0500, libraries: [], rpaths: [] };
      } }],
      ['../../native/runtime/macos-core-source.mjs', { expectedPreparedPins(guard, templates) {
        preparedCalls++;
        assert.ok(guard.equals(sourceFiles.guard_c_sha256[1]));
        assert.ok(templates.cc.equals(sourceFiles.adapter_cc_sha256[1]));
        assert.ok(templates.h.equals(sourceFiles.adapter_h_sha256[1]));
        return prepared;
      } }],
      ['./bundled-runtime.mjs', {
        readStandaloneRuntimeContract(root) {
          assert.equal(root, directory); return { targets: [{ id: target }] };
        },
        verifyTargetEvidence(value, bytes, licenseBytes, selected, contract) {
          converterCalls++;
          assert.deepEqual(JSON.parse(JSON.stringify(value)), evidence); assert.ok(bytes.equals(converter));
          assert.ok(licenseBytes.equals(license)); assert.equal(selected.id, target);
          assert.equal(contract.targets.length, 1);
        }
      }]
    ]);
    const context = vm.createContext({ Buffer, process: { argv: [], platform: 'darwin' } });
    const module = new vm.SourceTextModule(source, { context, identifier: 'macos-core-artifact-provenance-model.mjs' });
    await module.link(specifier => {
      assert.ok(dependency.has(specifier), 'unexpected dependency: ' + specifier);
      const exports = dependency.get(specifier), names = Object.keys(exports);
      return new vm.SyntheticModule(names, function () {
        for (const key of names) this.setExport(key, exports[key]);
      }, { context });
    });
    await module.evaluate({ timeout: 1000 });
    const { canonicalBytes, loadMacStaticCore } = module.namespace;
    mutate({ artifact, provenance, policy });
    artifact.build.provenance_sha256 = digest(canonicalBytes(provenance));
    if (expected === 'digest-mismatch') artifact.build.provenance_sha256 = '0'.repeat(64);
    policy.approved_artifacts = [{ target, artifact_sha256: digest(canonicalBytes(artifact)) }];
    const put = (relative, bytes) => files.set(path.join(directory, relative), Buffer.from(bytes));
    put('native/runtime/standalone-macos-core.json', canonicalBytes(policy));
    const prefix = 'dist/macos-static-core/' + target + '/';
    put(prefix + 'FINAL-CORE.json', canonicalBytes(artifact));
    put(prefix + 'BUILD-PROVENANCE.json', canonicalBytes(provenance));
    put(prefix + 'datasecure-core', core); put(prefix + 'LICENSE.node.txt', license);
    for (const [, [relative, bytes]] of Object.entries(sourceFiles)) put(relative, bytes);
    put('dist/' + target + '/node', converter); put('dist/' + target + '/LICENSE.node.txt', license);
    put('dist/' + target + '/runtime-evidence.json', canonicalBytes(evidence));
    put('apps/datasecure-standalone/tauri-contract/binaries/datasecure-core-' + targets[target], core);
    if (expected === 'accept') {
      const result = loadMacStaticCore(directory, target, { staged: true });
      assert.deepEqual(JSON.parse(JSON.stringify(result.provenance)), provenance);
      assert.ok(result.provenanceBytes.equals(canonicalBytes(provenance)));
      assert.equal(result.artifactSha256, policy.approved_artifacts[0].artifact_sha256);
      assert.equal(preparedCalls, 1); assert.equal(machoCalls, 1); assert.equal(converterCalls, 1);
      assert.ok(reads.at(-1).endsWith('datasecure-core-' + targets[target]), 'all post-provenance gates were reached');
    } else {
      assert.throws(() => loadMacStaticCore(directory, target, { staged: true }), invalid, name);
      assert.equal(preparedCalls, 1); assert.equal(machoCalls, 0); assert.equal(converterCalls, 0);
      assert.ok(reads.at(-1).endsWith('BUILD-PROVENANCE.json'), 'reject before reading Core/converter');
    }
    passed++; results.push(name);
  }
  await scenario('valid arm64 provenance reaches every subsequent loader gate', 'macos-arm64');
  await scenario('valid x64 provenance reaches every subsequent loader gate', 'macos-x64');
  for (const key of ['configure_sha256', 'make_sha256', 'compile_commands_sha256']) {
    await scenario('non-hash ' + key + ' is refused with the fixed product error', 'macos-arm64',
      ({ provenance }) => { provenance.logs[key] = 'PRIVATE/not-a-hash'; }, 'reject');
    await scenario('missing ' + key + ' is refused', 'macos-x64',
      ({ provenance }) => { delete provenance.logs[key]; }, 'reject');
  }
  await scenario('unexpected log field is refused', 'macos-arm64',
    ({ provenance }) => { provenance.logs.private_path = 'PRIVATE'; }, 'reject');
  await scenario('uppercase hash is refused', 'macos-x64',
    ({ provenance }) => { provenance.logs.make_sha256 = 'A'.repeat(64); }, 'reject');
  await scenario('empty log hash is refused', 'macos-arm64',
    ({ provenance }) => { provenance.logs.compile_commands_sha256 = ''; }, 'reject');
  await scenario('self-consistent log hashes do not bypass the provenance digest', 'macos-x64',
    () => {}, 'digest-mismatch');
  await scenario('prepared source pin mismatch is refused', 'macos-arm64',
    ({ provenance }) => { provenance.prepared_source_sha256['node.gyp'] = '0'.repeat(64); }, 'reject');
  await scenario('legacy provenance without bound lifecycle is refused, not auto-upgraded', 'macos-arm64',
    ({ provenance }) => { provenance.schema = 'datasecure-macos-static-core-build-provenance/1'; delete provenance.process_lifecycle; }, 'reject');
  await scenario('missing lifecycle on version two is refused', 'macos-x64', ({ provenance }) => { delete provenance.process_lifecycle; }, 'reject');
  await scenario('extra lifecycle step is refused', 'macos-arm64', ({ provenance }) => { provenance.process_lifecycle.other = successfulProcess('make'); }, 'reject');
  for (const step of ['configure', 'make']) {
    for (const field of booleanFields) for (const value of ['false', 0])
      await scenario('real boolean required for ' + step + '.' + field + ' instead of ' + JSON.stringify(value), 'macos-arm64',
        ({ provenance }) => { provenance.process_lifecycle[step][field] = value; }, 'reject');
    for (const [field, value] of Object.entries({ schema: 'other', step: step === 'make' ? 'configure' : 'make', cause: 'deadline',
      spawned: false, exit_seen: false, exit_code: 1, exit_signal: 'SIGKILL', close_seen: false, close_code: 1,
      close_signal: 'SIGKILL', kill_attempted: true, kill_result: 'sent', kill_error: 'denied', child_end_confirmed: false,
      timer_cleanup_failed: true, listener_cleanup_failed: true, detach_failed: true, log_fsync_failed: true, log_close_failed: true, extra: true }))
      await scenario('unconfirmed or failed ' + step + '.' + field + ' refuses before Core read', 'macos-x64',
        ({ provenance }) => { provenance.process_lifecycle[step][field] = value; }, 'reject');
    await scenario('missing ' + step + ' record is refused', 'macos-arm64', ({ provenance }) => { delete provenance.process_lifecycle[step]; }, 'reject');
  }
  await scenario('false group observations are retained, not treated as failed child completion', 'macos-x64');
  await scenario('a group observation changes the bound digest, not the role or downstream gates', 'macos-arm64',
    ({ provenance }) => { provenance.process_lifecycle.configure.group_end_confirmed = true; });
  await scenario('lifecycle mutation cannot bypass the provenance digest', 'macos-x64',
    ({ provenance }) => { provenance.process_lifecycle.make.group_end_confirmed = true; }, 'digest-mismatch');
  return { passed, failed: 0, boundary: 'exact consumer source with explicit RAM dependency models', results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = fs.readFileSync(new URL('../scripts/lib/macos-core-artifact.mjs', import.meta.url), 'utf8');
  console.log(JSON.stringify(await verifyMacCoreProvenanceSource(source), null, 2));
}
