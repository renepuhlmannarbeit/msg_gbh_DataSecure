'use strict';

// Actual Bash cleanup/trap bytes with harmless command doubles. Source-contract
// evidence only: no macOS application, converter, process termination or delete.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { bindDirectory, assertDirectory } = require('../../plugins/data-secure/server/core/bound-file-io');

// Run in a bounded Node test process so this synchronous caller cannot print a
// workflow PASS before Promise outcomes are observed. Only OS launch and clocks
// are doubled: the complete parent closure and checkpoint validators are real.
// The existing checkpoint suite registers/runs its cases on import, so importing
// its private harness here would introduce unawaited, unrelated suite effects.
async function conversionCloseCases(filename, expectedSha) {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const vm = require('node:vm');
  const { createRequire } = require('node:module');
  const { EventEmitter } = require('node:events');
  const source = fs.readFileSync(filename, 'utf8');
  const sha256 = crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(sha256, expectedSha, 'the child must evaluate the same production source read by its caller');
  const actualRequire = createRequire(filename);
  const { createMarkdownExtraction } = actualRequire('./markdown-contract');
  const options = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };
  const bytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
  const unit = (type = 'pdf', markdown = 'Sicherer Text äöüß', legacy = false) => createMarkdownExtraction({
    source_type: type, markdown, coverage: { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] },
    ...(legacy ? {} : { content_options: options })
  });
  const frame = markdown => ({ schema: 'datasecure-conversion-unit/1', sequence: 1, index: 0,
    result: unit('pdf', markdown) });
  const response = (result, legacy = false) => ({ schema: `datasecure-conversion-response/${legacy ? 1 : 2}`, ok: true, result });
  const idle = () => new Promise(resolve => setImmediate(resolve));
  const rows = [];
  async function check(name, run) { await run(); rows.push({ name, status: 'PASS' }); }
  function parent({ flush = true, type = 'pdf', legacy = false } = {}) {
    const child = new EventEmitter(), timers = new Map();
    let timerId = 0, kills = 0, spawns = 0, inputCallback, outcome = null;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdin.end = (input, callback) => {
      assert.equal(input.toString(), 'bound original bytes'); inputCallback = callback; if (flush) callback();
    };
    child.stdin.destroy = () => {};
    child.kill = signal => { assert.equal(signal, 'SIGTERM'); kills++; return true; };
    const module = { exports: {} };
    const localRequire = name => {
      if (name === 'node:child_process') return { spawn: () => { spawns++; return child; } };
      if (name === './conversion-runtime-resolver') return { resolveConversionRuntime: () => ({ node: 'bound-node', root: path.dirname(filename) }) };
      if (name === '../native-launcher') return { verifyNativeLauncherArtifact() {} };
      if (name === '../posix-supervisor') return { verifyPosixSupervisor: () => ({ available: true, executable: 'bound-supervisor' }) };
      return actualRequire(name);
    };
    const evaluate = new vm.Script(`(function(require,module,__dirname,setTimeout,clearTimeout) {\n${source}\n})`,
      { filename, lineOffset: -1 }).runInThisContext({ timeout: 1000 });
    evaluate(localRequire, module, path.dirname(filename), (callback, ms) => {
      const id = ++timerId; timers.set(id, { callback, ms }); return id;
    }, id => timers.delete(id));
    const controller = new AbortController();
    const promise = module.exports.convertBuffer(Buffer.from('bound original bytes'), `.${type}`,
      { timeoutMs: 1000, signal: controller.signal, ...(legacy ? {} : { contentOptions: options }) })
      .then(value => (outcome = { ok: true, value }), error => (outcome = { ok: false, error }));
    assert.equal(spawns, 1, 'the actual parent must call the isolated launch boundary exactly once');
    const tick = ms => {
      const entry = [...timers].find(([, timer]) => timer.ms === ms); assert.ok(entry);
      timers.delete(entry[0]); entry[1].callback();
    };
    return { promise, child, controller, timers, tick, kills: () => kills, outcome: () => outcome,
      send: value => child.stdout.emit('data', Buffer.isBuffer(value) ? value : bytes(value)),
      inputError: code => child.stdin.emit('error', Object.assign(new Error('synthetic input failure'), { code })),
      flush: () => inputCallback(), close: code => child.emit('close', code) };
  }
  async function pending(m) { await idle(); assert.equal(m.outcome(), null, 'no result before confirmed close or failing grace'); }
  async function rejected(m, code) {
    const result = await m.promise; assert.equal(result.ok, false); assert.equal(result.error.code, code);
    assert.equal(m.timers.size, 0, 'settlement must clear both timers');
  }
  async function recovered(m, reason) {
    const result = await m.promise; assert.equal(result.ok, true);
    assert.equal(result.value.markdown, 'Sicherer Text äöüß');
    assert.equal(result.value.coverage.status, 'incomplete');
    assert.ok(result.value.coverage.reason_codes.includes(reason)); assert.equal(m.timers.size, 0);
  }
  await check('ordinary Office/PDF/OCR responses wait for actual close and input flush', async () => {
    for (const type of ['docx', 'pdf', 'png']) {
      const m = parent({ type }), expected = unit(type); m.send(response(expected)); await pending(m);
      m.close(0); const result = await m.promise; assert.equal(result.ok, true); assert.deepEqual(result.value, expected);
      assert.equal(m.timers.size, 0); assert.equal(m.kills(), 0);
    }
  });
  await check('ordinary success cannot invent input flush', async () => {
    const m = parent({ flush: false }); m.send(response(unit())); await pending(m); m.close(0);
    await rejected(m, 'CONVERSION_INPUT_INCOMPLETE');
  });
  await check('a complete checkpoint waits for real resource close', async () => {
    const m = parent(); m.send(frame()); await pending(m); m.close(125);
    await recovered(m, 'CONVERSION_RESOURCE_LIMIT_PARTIAL'); assert.equal(m.kills(), 0);
  });
  await check('eligible timeout recovers only after actual close without a second grace', async () => {
    const m = parent(); m.send(frame()); m.tick(1000); await pending(m);
    assert.equal(m.kills(), 1); assert.deepEqual([...m.timers.values()].map(timer => timer.ms), [1500]);
    m.close(null); await recovered(m, 'CONVERSION_TIMEOUT_PARTIAL');
  });
  await check('unconfirmed grace rejects and a later close cannot turn failure into success', async () => {
    const m = parent(); m.send(frame()); m.tick(1000); await pending(m); m.tick(1500);
    await rejected(m, 'CONVERSION_TERMINATION_UNCONFIRMED'); m.close(125); await idle();
    assert.equal(m.outcome().ok, false); assert.equal(m.outcome().error.code, 'CONVERSION_TERMINATION_UNCONFIRMED');
    assert.equal(m.kills(), 1);
  });
  await check('checkpoint recovery never substitutes for unflushed input', async () => {
    const m = parent({ flush: false }); m.send(frame()); m.tick(1000); m.close(null);
    await rejected(m, 'CONVERSION_TIMEOUT');
  });
  await check('deliberate cancellation before or during timeout never recovers', async () => {
    for (const timeout of [false, true]) {
      const m = parent(); m.send(frame()); if (timeout) m.tick(1000); m.controller.abort();
      await pending(m); m.close(125); await rejected(m, 'REQUEST_CANCELLED'); assert.equal(m.kills(), 1);
    }
  });
  await check('invalid protocol before or during timeout poisons earlier checkpoints', async () => {
    for (const timeout of [false, true]) {
      const m = parent(); m.send(frame()); if (timeout) m.tick(1000); m.send(Buffer.from('{"bad":}\n'));
      assert.equal(m.kills(), 1); m.close(125); await rejected(m, 'CONVERSION_RESPONSE_INVALID');
    }
  });
  await check('isolation, executable, permission and architecture faults never recover', async () => {
    for (const [code, reason] of [[122, 'CONVERSION_ISOLATION_FAILED'], [127, 'CONVERSION_EXECUTABLE_MISSING'],
      [128, 'CONVERSION_EXECUTABLE_DENIED'], [129, 'CONVERSION_ARCHITECTURE_INVALID']]) {
      const m = parent(); m.send(frame()); m.close(code); await rejected(m, reason);
    }
  });
  await check('independent input faults before or after timeout stay hard failures', async () => {
    for (const timeout of [false, true]) {
      const m = parent(); m.send(frame()); if (timeout) m.tick(1000); m.inputError('EIO');
      assert.equal(m.kills(), 1); m.close(0); await rejected(m, 'CONVERSION_INPUT_INCOMPLETE');
    }
  });
  await check('own shutdown pipe closure preserves timeout but not fictitious input flush', async () => {
    for (const flush of [false, true]) {
      const m = parent({ flush }); m.send(frame()); m.tick(1000); m.inputError('EPIPE');
      assert.equal(m.kills(), 1); assert.deepEqual([...m.timers.values()].map(timer => timer.ms), [1500]); m.close(null);
      if (flush) await recovered(m, 'CONVERSION_TIMEOUT_PARTIAL'); else await rejected(m, 'CONVERSION_TIMEOUT');
    }
  });
  await check('late output overflow prevents recovery without extending the original grace', async () => {
    for (const close of [false, true]) {
      const m = parent(); m.send(frame()); m.tick(1000); m.child.stderr.emit('data', Buffer.alloc(64 * 1024 + 1));
      assert.equal(m.kills(), 1); assert.deepEqual([...m.timers.values()].map(timer => timer.ms), [1500]);
      if (close) { m.close(125); await rejected(m, 'CONVERSION_OUTPUT_LIMIT'); }
      else { m.tick(1500); await rejected(m, 'CONVERSION_TERMINATION_UNCONFIRMED'); }
    }
  });
  await check('local terminal extraction errors may recover; policy errors may not', async () => {
    for (const code of ['PDF_EXTRACTION_FAILED', 'CONVERSION_POLICY_FAILED']) {
      const m = parent(); m.send(frame()); m.send({ schema: 'datasecure-conversion-response/2', ok: false, error_code: code });
      await pending(m); m.close(2);
      if (code === 'PDF_EXTRACTION_FAILED') await recovered(m, 'DOCUMENT_PARTS_DAMAGED'); else await rejected(m, code);
    }
  });
  await check('an empty checkpoint cannot turn a resource stop into useful content', async () => {
    const m = parent(); m.send(frame('')); m.close(125); await rejected(m, 'CONVERSION_RESOURCE_LIMIT');
  });
  await check('legacy conversion keeps its full-response contract and refuses partial frames', async () => {
    const good = parent({ legacy: true }), expected = unit('pdf', 'Sicherer Text äöüß', true);
    good.send(response(expected, true)); await pending(good); good.close(0); assert.deepEqual((await good.promise).value, expected);
    const bad = parent({ legacy: true }); bad.send(frame()); bad.close(125); await rejected(bad, 'CONVERSION_RESOURCE_LIMIT');
  });
  return { classification: 'ACTUAL_PARENT_SOURCE_MODEL/NOT_NATIVE_ACCEPTANCE', worker_sha256: sha256,
    cases: rows.length, results: rows, actual_apps_workers_or_deletes: 0 };
}

module.exports = function macosCleanupSourceCases(root) {
  const native = fs.readFileSync(path.join(root, 'tests/manual/standalone-native-macos-launch.sh'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/standalone-macos-sandbox.yml'), 'utf8');
  const step = workflow.match(/      - name: Build, verify and launch the deterministic distribution archive\n([\s\S]*?)(?=\n      - name:)/u)?.[1];
  assert.ok(step);
  const shell = step.slice(step.indexOf('        run: |\n') + '        run: |\n'.length)
    .split('\n').map(line => line.replace(/^          /u, '')).join('\n');
  const nativePrefix = native.slice(native.indexOf('\napp_pid=""') + 1, native.indexOf('\nproduct='));
  const workflowPrefix = shell.slice(shell.indexOf('\nconverter_close_confirmed=false') + 1, shell.indexOf('\nditto -x -k'));
  const conversionTail = shell.slice(shell.indexOf('\nnode tests/manual/standalone-macos-packaged-conversion.mjs') + 1).trim();
  for (const prefix of [nativePrefix, workflowPrefix]) {
    assert.match(prefix, /^cleanup\(\) \{/mu);
    assert.match(prefix, /trap 'cleanup "\$\?"' EXIT/u);
    assert.match(prefix, /local exit_status="\$1"/u);
    assert.doesNotMatch(prefix, /^\s*(?:wait|sleep|\/usr\/bin\/swift)\b/mu);
  }
  assert.doesNotMatch(native, /kill\s+-(?:TERM|KILL)\b/u);
  assert.match(native, /app_end_confirmed=false\nsidecar_end_confirmed=false/u);
  const quit = native.indexOf('\n/usr/bin/swift "$script_directory/../helpers/macos-launch-services.swift" --terminate "$candidate" "$app_pid"');
  const appEnd = native.indexOf('\napp_end_confirmed=true', quit);
  const sidecarEnd = native.indexOf('\nsidecar_end_confirmed=true', appEnd);
  assert.ok(quit > 0 && appEnd > quit && sidecarEnd > appEnd);
  assert.match(native.slice(quit, appEnd), /wait "\$app_pid" \|\| status=\$\?[\s\S]*?\[\[ "\$status" == 0 \]\]/u);
  assert.match(native.slice(appEnd, sidecarEnd), /if kill -0 "\$sidecar_pid" 2>\/dev\/null \|\| \[\[ -n "\$remaining_command" \]\]; then[\s\S]*?exit 1\nfi/u);
  assert.equal((native.match(/^app_end_confirmed=true$/gmu) || []).length, 1);
  assert.equal((native.match(/^sidecar_end_confirmed=true$/gmu) || []).length, 1);
  assert.ok(shell.indexOf("trap 'cleanup \"$?\"' EXIT") < shell.indexOf('ditto -x -k'));
  assert.match(conversionTail, /^node tests\/manual\/standalone-macos-packaged-conversion\.mjs "\$packaged_app"\n/u);
  assert.match(conversionTail, /converter_close_confirmed=true\nnode tests\/test-standalone-package-smoke\.mjs "\$archive"\nextraction_step_completed=true$/u);
  assert.equal((shell.match(/^converter_close_confirmed=true$/gmu) || []).length, 1);
  assert.equal((shell.match(/^extraction_step_completed=true$/gmu) || []).length, 1);
  // Bind the workflow command's success to the real helper's three awaited calls
  // and the product success path's actual Supervisor close callback.
  const conversion = fs.readFileSync(path.join(root, 'tests/manual/standalone-macos-packaged-conversion.mjs'), 'utf8');
  assert.match(conversion, /for \(const \[label, bytes, extension\] of \[/u);
  for (const label of ['office', 'pdf', 'ocr']) assert.ok(conversion.includes(`['${label}',`));
  assert.match(conversion, /const result = await convertBuffer\(bytes, extension, \{ timeoutMs: 90_000 \}\);/u);
  const workerFile = path.join(root, 'plugins/data-secure/server/standalone/conversion-worker.js');
  const worker = fs.readFileSync(workerFile, 'utf8');
  const close = worker.indexOf("child.once('close', code => {");
  const success = worker.indexOf('finish(null, createMarkdownExtraction(', close);
  assert.ok(close > 0 && success > close);
  assert.match(worker.slice(close, success), /closed = true;/u);
  assert.equal((worker.match(/finish\(null, createMarkdownExtraction\(/gu) || []).length, 1);
  const workerSha = crypto.createHash('sha256').update(worker).digest('hex');
  const conversionCases = spawnSync(process.execPath, ['-e',
    `(${conversionCloseCases.toString()})(process.argv[1], process.argv[2]).then(result => process.stdout.write(JSON.stringify(result)), failure => { console.error(failure); process.exitCode = 1; });`,
    workerFile, workerSha], { encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  assert.ifError(conversionCases.error); assert.equal(conversionCases.status, 0, conversionCases.stderr);
  const conversionParent = JSON.parse(conversionCases.stdout);
  assert.equal(conversionParent.worker_sha256, workerSha);
  assert.equal(conversionParent.cases, 15);
  assert.equal(conversionParent.results.length, conversionParent.cases);
  assert.ok(conversionParent.results.every(row => row.status === 'PASS'));

  const dist = bindDirectory(path.join(root, 'dist'));
  const evidence = fs.mkdtempSync(path.join(dist.path, 'macos-cleanup-source-cases-'));
  assertDirectory(dist);
  const evidenceBinding = bindDirectory(evidence);
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : '/bin/bash';
  for (const script of [native, shell.replace(/\$\{\{ matrix\.(?:target|rust_arch) \}\}/gu, 'source-syntax-placeholder')]) {
    const syntax = spawnSync(bash, ['--noprofile', '--norc', '-n'], {
      input: script, encoding: 'utf8', windowsHide: true, timeout: 5000, env: { ...process.env, BASH_ENV: '', ENV: '' }
    });
    assert.ifError(syntax.error); assert.equal(syntax.status, 0, syntax.stderr);
  }
  const quote = value => `'${String(value).replace(/'/gu, `'"'"'`)}'`;
  const results = [];
  function run(name, kind, { status = 0, app = true, sidecar = true, live = '', removeStatus = 0,
    converterStatus = 0, smokeStatus = 0, tail = true, invalidName = false } = {}) {
    assertDirectory(evidenceBinding);
    const parent = fs.mkdtempSync(path.join(evidence, 'case-'));
    const leaf = invalidName ? 'wrong-cleanup-root' : kind === 'native'
      ? `.tmp-standalone-native-${crypto.randomBytes(16).toString('hex')}`
      : `datasecure-macos-package.${crypto.randomBytes(8).toString('hex')}`;
    fs.mkdirSync(path.join(parent, leaf));
    const script = `set -euo pipefail
tmp_parent="$(cd ${quote(parent)} && pwd -P)"
RUNNER_TEMP="$tmp_parent"
test_root="$tmp_parent/${leaf}"
extraction="$test_root"
packaged_app="synthetic app"
archive="synthetic archive"
target="macos-arm64"
launch_services=false
kill() {
  if [[ "$1" != -0 ]]; then echo PROBE_FORBIDDEN_KILL; return 2; fi
  echo "PROBE_LIVENESS:$2"
  [[ "$2" == ${quote(live)} ]]
}
wait() { echo PROBE_FORBIDDEN_WAIT; return 0; }
rm() { printf 'PROBE_REMOVE|%s|%s|%s\\n' "$1" "$2" "$3"; return ${removeStatus}; }
node() {
  case "$1" in
    tests/manual/standalone-macos-packaged-conversion.mjs) echo PROBE_CONVERTER; return ${converterStatus} ;;
    tests/test-standalone-package-smoke.mjs) echo PROBE_SMOKE; return ${smokeStatus} ;;
    *) echo PROBE_UNEXPECTED_COMMAND; return 99 ;;
  esac
}
${kind === 'native' ? nativePrefix : workflowPrefix}
${kind === 'native' ? `app_pid=12345\nsidecar_pid=23456\napp_end_confirmed=${app}\nsidecar_end_confirmed=${sidecar}` : tail ? conversionTail : ''}
exit ${status}
`;
    const result = spawnSync(bash, ['--noprofile', '--norc', '-c', script], {
      encoding: 'utf8', windowsHide: true, timeout: 5000,
      env: { ...process.env, BASH_ENV: '', ENV: '', MSYS_NO_PATHCONV: '1' }
    });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout, /PROBE_FORBIDDEN|PROBE_UNEXPECTED/u);
    const removeCount = (result.stdout.match(/^PROBE_REMOVE\|/gmu) || []).length;
    const row = { name, status: result.status, remove_count: removeCount, stdout: result.stdout, stderr: result.stderr };
    results.push(row);
    assert.equal(fs.existsSync(path.join(parent, leaf)), true, 'all deletes are harmless doubles; synthetic evidence stays');
    return row;
  }
  function expect(row, status, removes, retained) {
    assert.equal(row.status, status, `${row.name}: ${row.stderr}`); assert.equal(row.remove_count, removes, row.name);
    if (retained) assert.match(row.stderr, /(?:ROOT|EXTRACTION)_PRESERVED:/u, row.name);
    if (status !== 0) assert.doesNotMatch(row.stdout, /STANDALONE NATIVE MACOS APP BUNDLE LAUNCH PASS/u, row.name);
  }
  expect(run('native primary failure remains 37 even with confirmed ends', 'native', { status: 37, removeStatus: 13 }), 37, 0, true);
  expect(run('native primary failure without end proof', 'native', { status: 65, app: false, sidecar: false }), 65, 0, true);
  expect(run('native missing both end proofs refuses status-zero removal', 'native', { app: false, sidecar: false }), 1, 0, true);
  expect(run('native app-only end proof cannot remove', 'native', { sidecar: false }), 1, 0, true);
  expect(run('native sidecar-only end proof cannot remove', 'native', { app: false }), 1, 0, true);
  expect(run('native live app refuses removal without sending TERM', 'native', { live: '12345' }), 1, 0, true);
  expect(run('native live sidecar refuses removal without sending TERM', 'native', { live: '23456' }), 1, 0, true);
  expect(run('native successful ended case removes once', 'native'), 0, 1, false);
  expect(run('native failed removal is not retried', 'native', { removeStatus: 17 }), 1, 1, false);
  expect(run('native invalid target is never removed', 'native', { invalidName: true }), 1, 0, false);
  expect(run('workflow early zero exit without converter proof refuses removal', 'workflow', { tail: false }), 1, 0, true);
  const converterFailure = run('workflow converter failure retains and never runs smoke', 'workflow', { converterStatus: 23 });
  expect(converterFailure, 23, 0, true); assert.doesNotMatch(converterFailure.stdout, /PROBE_SMOKE/u);
  expect(run('workflow unconfirmed termination nonzero retains', 'workflow', { converterStatus: 70 }), 70, 0, true);
  expect(run('workflow smoke failure after converter close retains', 'workflow', { smokeStatus: 19 }), 19, 0, true);
  expect(run('workflow later failure keeps original status after both commands', 'workflow', { status: 41 }), 41, 0, true);
  expect(run('workflow all commands and step success remove once', 'workflow'), 0, 1, false);
  expect(run('workflow removal failure has no retry', 'workflow', { removeStatus: 17 }), 1, 1, false);
  expect(run('workflow invalid extraction target is never removed', 'workflow', { invalidName: true }), 74, 0, false);
  assertDirectory(evidenceBinding);
  fs.writeFileSync(path.join(evidence, 'RESULT.json'), JSON.stringify({
    classification: 'SOURCE_MODEL/NOT_NATIVE_ACCEPTANCE', actual_apps_workers_or_deletes: 0,
    cases: results.length, results, conversion_parent: conversionParent,
    sources: { worker_sha256: workerSha, native_sha256: crypto.createHash('sha256').update(native).digest('hex'),
      workflow_sha256: crypto.createHash('sha256').update(workflow).digest('hex') }
  }, null, 2), { flag: 'wx' });
  process.stdout.write(`Mac cleanup actual-source cases: ${results.length} PASS (models only; evidence ${evidence})\n`);
  process.stdout.write(`Mac conversion-close actual-source cases: ${conversionParent.cases} PASS (models only; real parent and checkpoint code, no native OS claim)\n`);
};
