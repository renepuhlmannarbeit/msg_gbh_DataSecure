'use strict';

// Actual Bash cleanup/trap bytes with harmless command doubles. Source-contract
// evidence only: no macOS application, converter, process termination or delete.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { bindDirectory, assertDirectory } = require('../../plugins/data-secure/server/core/bound-file-io');

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
  const worker = fs.readFileSync(path.join(root, 'plugins/data-secure/server/standalone/conversion-worker.js'), 'utf8');
  const close = worker.indexOf("child.once('close', code => {");
  const success = worker.indexOf('finish(null, createMarkdownExtraction(', close);
  assert.ok(close > 0 && success > close);
  assert.match(worker.slice(close, success), /closed = true;/u);
  assert.match(worker.slice(close, success), /if \(stopped\) \{ finish\(stopped\); return; \}/u);
  assert.equal((worker.match(/finish\(null, createMarkdownExtraction\(/gu) || []).length, 1);

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
    cases: results.length, results, sources: { native_sha256: crypto.createHash('sha256').update(native).digest('hex'),
      workflow_sha256: crypto.createHash('sha256').update(workflow).digest('hex') }
  }, null, 2), { flag: 'wx' });
  process.stdout.write(`Mac cleanup actual-source cases: ${results.length} PASS (models only; evidence ${evidence})\n`);
};
