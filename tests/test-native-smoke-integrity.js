'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const { reviewReady, mainReady, actionReady } = require('./helpers/native-review-readiness');
const { createPlatformCases } = require('./helpers/platform-case');
const { test, testAsync, done, assert } = createSuite('Native smoke evidence integrity');
const page = { event: 'review_page_loaded' };
const requestA = 'a'.repeat(35);
const requestB = 'b'.repeat(35);
const rpc = (event, action, request_id = requestA) => ({ event, action, request_id });
const request = rpc('ipc_request_started', 'get_review_session');
const failed = rpc('ipc_response_error', 'get_review_session');
const success = rpc('ipc_response_ok', 'get_review_session');

test('page load, request start, unrelated success and refused review IPC cannot pass macOS readiness', () => {
  for (const records of [[page], [page, request], [page, request, failed],
    [page, request, { event: 'ipc_response_ok', action: 'get_public_state' }],
    [page, request, success, failed]]) assert.equal(reviewReady(records), false);
  assert.equal(reviewReady([page, request, failed, success]), true);
  for (const event of ['ipc_response_invalid', 'ipc_request_failed', 'sidecar_exited_before_response',
    'ipc_request_started', 'ipc_request_sent']) {
    assert.equal(reviewReady([page, request, success, rpc(event, 'get_review_session')]), false);
  }
});

test('the macOS native launcher uses the tested successful-response predicate', () => {
  const source = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-macos-launch.sh'), 'utf8');
  assert.match(source, /&& node "\$script_directory\/\.\.\/helpers\/native-review-readiness\.js" "\$desktop_log"/u);
  assert.doesNotMatch(source, /&& grep -q '"action":"get_review_session"' "\$sidecar_log"/u);
  assert.match(source, /no review decisions/u);
  assert.match(source, /&& node "\$script_directory\/\.\.\/helpers\/native-review-readiness\.js" "\$desktop_log" --main/u);
  assert.doesNotMatch(source, /grep -q '"action":"get_(?:public_state|ui_context)"'/u);
});

test('both main-window actions require their newest successful response, never just a request or an old success', () => {
  const events = [{ event: 'page_loaded' }, { event: 'frontend_ready' }];
  for (const action of ['get_public_state', 'get_ui_context']) events.push(
    rpc('ipc_request_started', action), rpc('ipc_response_ok', action));
  assert.equal(mainReady(events), true);
  for (const action of ['get_public_state', 'get_ui_context']) {
    assert.equal(mainReady(events.filter(event => event.action !== action)), false);
    for (const event of ['ipc_response_error', 'ipc_response_invalid', 'ipc_request_started',
      'ipc_request_sent', 'ipc_request_failed', 'sidecar_exited_before_response']) {
      assert.equal(mainReady([...events, rpc(event, action)]), false, `${action}:${event}`);
    }
  }
  // Exact prior macOS false-PASS: review IPC worked; both main-window requests
  // were present, but both failed. It must fail despite a fully loaded page.
  assert.equal(mainReady(events.map(event => event.event === 'ipc_response_ok'
    ? { ...event, event: 'ipc_response_error' } : event).concat([page, request, success])), false);
});

test('the macOS log-check CLI returns nonzero for unsuccessful IPC and zero only after success', () => {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  for (const [events, expected] of [
    [[page, request], 1], [[page, request, failed], 1],
    [[page, request, success, failed], 1], [[page, request, failed, success], 0]
  ]) {
    const result = spawnSync(process.execPath, [helper, '-'], {
      input: events.map(event => JSON.stringify(event)).join('\n') + '\n',
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, expected, result.stderr);
  }
});

test('the actual main-window log CLI rejects successful review plus failed main IPC and rejects stale success', () => {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  const events = [{ event: 'page_loaded' }, { event: 'frontend_ready' }];
  for (const action of ['get_public_state', 'get_ui_context']) events.push(
    rpc('ipc_request_started', action), rpc('ipc_response_ok', action));
  for (const [records, expected] of [
    [events, 0],
    [events.map(event => event.event === 'ipc_response_ok' ? { ...event, event: 'ipc_response_error' } : event)
      .concat([page, request, success]), 1],
    [[...events, rpc('ipc_request_started', 'get_ui_context')], 1],
    [[...events, rpc('ipc_request_started', 'get_ui_context', requestB), rpc('ipc_response_ok', 'get_ui_context')], 1],
    [[...events, rpc('ipc_request_started', 'get_ui_context', requestB), rpc('ipc_response_ok', 'get_ui_context'),
      rpc('ipc_response_ok', 'get_ui_context', requestB)], 0]
  ]) {
    const result = spawnSync(process.execPath, [helper, '-', '--main'], {
      input: records.map(event => JSON.stringify(event)).join('\n') + '\n',
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, expected, result.stderr);
  }
});

test('overlapping starts correlate only the latest opaque request ID, never a delayed old response', () => {
  for (const action of ['get_review_session', 'get_public_state', 'get_ui_context']) {
    const startA = rpc('ipc_request_started', action, requestA);
    const startB = rpc('ipc_request_started', action, requestB);
    const okA = rpc('ipc_response_ok', action, requestA);
    const okB = rpc('ipc_response_ok', action, requestB);
    const failedA = rpc('ipc_response_error', action, requestA);
    const failedB = rpc('ipc_response_error', action, requestB);
    for (const [records, expected] of [
      [[startA, startB, okA], false], [[startA, okA, startB, okA], false],
      [[startA, startB, failedB, okA], false], [[startA, startB, okA, failedB], false],
      [[startA, startB, okA, okB], true], [[startA, startB, okB, failedA], true],
      [[startA, okA, startB, okB], true], [[okB, startB], false]
    ]) assert.equal(actionReady(records, action), expected, `${action}:${JSON.stringify(records)}`);
    for (const id of [undefined, '', 'x'.repeat(35), 'a'.repeat(15), 'a'.repeat(65), 1234567890123456]) {
      assert.equal(actionReady([{ event: 'ipc_request_started', action, request_id: id },
        { event: 'ipc_response_ok', action, request_id: id }], action), false);
      assert.equal(actionReady([startA, { event: 'ipc_response_ok', action, request_id: id }], action), false);
    }
    assert.equal(actionReady([startA, { event: 'ipc_response_ok', action }], action), false);
    for (const size of [16, 35, 64]) {
      const id = 'c'.repeat(size);
      assert.equal(actionReady([rpc('ipc_request_started', action, id), rpc('ipc_response_ok', action, id)], action), true);
    }
  }
});

test('readiness is restricted to the newest application session even when another session reuses the same request ID', () => {
  const sessionA = '1'.repeat(32);
  const sessionB = '2'.repeat(32);
  const inSession = (records, session_id) => records.map(record => ({ ...record, session_id }));
  const first = inSession([{ event: 'application_started' }, page, request, success], sessionA);
  const second = inSession([{ event: 'application_started' }, page, request], sessionB);
  assert.equal(reviewReady([...first, ...second, { ...success, session_id: sessionA }]), false);
  assert.equal(reviewReady([...first, ...second, { ...success, session_id: sessionB }]), true);
  assert.equal(reviewReady([...first, ...second, { ...success, session_id: sessionB },
    { ...failed, session_id: sessionA }]), true);
  assert.equal(reviewReady([...first, ...inSession([{ event: 'application_started' }, request, success], sessionB)]), false);
  assert.equal(reviewReady([...first, { event: 'application_started' }, page, request, success]), false);
  assert.equal(reviewReady([...inSession([page, request], sessionB), { ...success, session_id: sessionA }]), false,
    'a mixed-session fragment without an explicit boundary cannot prove readiness');

  const mainEvents = [{ event: 'application_started' }, { event: 'page_loaded' }, { event: 'frontend_ready' }];
  for (const action of ['get_public_state', 'get_ui_context']) mainEvents.push(
    rpc('ipc_request_started', action), rpc('ipc_response_ok', action));
  const oldMain = inSession(mainEvents, sessionA);
  assert.equal(mainReady([...oldMain, ...inSession(mainEvents.filter(record => record.event !== 'ipc_response_ok'), sessionB),
    ...inSession(mainEvents.filter(record => record.event === 'ipc_response_ok'), sessionA)]), false);
  assert.equal(mainReady([...oldMain, ...inSession(mainEvents, sessionB)]), true);
});

test('the actual log CLI rejects overlapping stale responses and missing correlation IDs', () => {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  const startB = rpc('ipc_request_started', 'get_review_session', requestB);
  const okB = rpc('ipc_response_ok', 'get_review_session', requestB);
  for (const [records, expected] of [
    [[page, request, startB, success], 1], [[page, request, startB, success, okB], 0],
    [[page, request, { event: 'ipc_response_ok', action: 'get_review_session' }], 1],
    [[page, { event: 'ipc_request_started', action: 'get_review_session' }, success], 1]
  ]) {
    const result = spawnSync(process.execPath, [helper, '-'], {
      input: records.map(record => JSON.stringify(record)).join('\n') + '\n',
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, expected, result.stderr);
  }
});

test('the native campaign never substitutes Node decisions for Tauri/WebView interaction', () => {
  const script = path.join(__dirname, 'manual/standalone-native-review-campaign.mjs');
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /writeReceipt\(scope, metadata, 'NOT_RUN'\)/u);
  assert.match(source, /CAMPAIGN_NATIVE_INTERACTION_NOT_ATTESTED/u);
  assert.match(source, /CAMPAIGN_RESTART_NOT_OBSERVED/u);
  assert.match(source, /CAMPAIGN_MAIN_IPC_NOT_SUCCESSFUL/u);
  assert.match(source, /CAMPAIGN_REVIEW_IPC_NOT_SUCCESSFUL/u);
  assert.match(source, /CAMPAIGN_DEFER_AND_BOTH_REVIEW_GROUPS_NOT_OBSERVED/u);
  assert.doesNotMatch(source, /runPackagedReviewScenario\(|desktop-sidecar\.js|request\(\{.*submit_review/u);
  if (!['win32', 'darwin'].includes(process.platform)) {
    const result = spawnSync(process.execPath, [script, '--check', 'not-a-native-scope'], {
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, 77); assert.match(result.stderr, /NOT_RUN/u);
    return;
  }
  // Actual CLI counterexample: even an untouched archive binding cannot turn
  // preparation into a native PASS without human interaction attestation.
  const parent = fs.realpathSync.native(os.tmpdir());
  const scope = path.join(parent, `.tmp-standalone-native-${crypto.randomUUID().replaceAll('-', '')}`);
  fs.mkdirSync(scope);
  const archive = path.join(scope, 'synthetic.zip');
  const bytes = Buffer.from('synthetic binding, not a runnable package');
  const files = [archive, path.join(scope, 'NATIVE-REVIEW-CAMPAIGN.json'), path.join(scope, 'NATIVE-REVIEW-RECEIPT.json')];
  try {
    fs.writeFileSync(archive, bytes);
    fs.writeFileSync(files[1], JSON.stringify({ archive,
      archive_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      target: process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`,
      version: 'synthetic', operator_attestation: false }));
    fs.writeFileSync(files[2], JSON.stringify({ status: 'NOT_RUN' }));
    const result = spawnSync(process.execPath, [script, '--check', scope], {
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /CAMPAIGN_NATIVE_INTERACTION_NOT_ATTESTED/u);
    assert.equal(JSON.parse(fs.readFileSync(files[2], 'utf8')).status, 'NOT_RUN');
  } finally {
    assert.equal(path.dirname(scope), parent);
    assert.equal(fs.realpathSync.native(scope), scope);
    assert.deepEqual(fs.readdirSync(scope).sort(), files.map(file => path.basename(file)).sort());
    for (const file of files) {
      assert.equal(path.dirname(file), scope);
      const stat = fs.lstatSync(file); assert.ok(stat.isFile() && !stat.isSymbolicLink());
    }
    for (const file of files) fs.unlinkSync(file);
    fs.rmdirSync(scope);
  }
});

testAsync('complete shared review assertions reject lost rows, changed Sachzellen and inconsistent IDs', async () => {
  const { packagedReviewFixtures, assertPackagedReviewOutputs } = await import('./helpers/standalone-packaged-review.mjs');
  const texts = [...packagedReviewFixtures()].filter(([name]) => name.endsWith('.md')).map(([, bytes]) =>
    'Synthetic compliance prefix\n' + bytes.toString('utf8')
      .replaceAll('Max Mustermann', '[PERSON_001]').replaceAll('max@example.org', '[EMAIL_001]')
      .replaceAll('SYNTHETISCHER HÄRTETEST', '[UNTERNEHMEN_001]').replaceAll('TESTRUN VERIFIZIERER', '[PERSON_002]'));
  assertPackagedReviewOutputs(texts);
  const mutations = [
    values => values[0] = values[0].replace('| [UNTERNEHMEN_001] | firma |\n', ''),
    values => values[0] = values[0].replace('| [PERSON_002] | person |\n', ''),
    values => values[0] = values[0].replace('| firma |', '| verändert |'),
    values => values[0] = values[0].replace('[UNTERNEHMEN_001]', '[UNTERNEHMEN_009]'),
    values => values[0] = values[0].replace('[PERSON_002]', '[PERSON_009]'),
    values => values[0] = values[0].replaceAll('[PERSON_002]', '[PERSON_009]'),
    values => values[0] = values[0].replace('Begriff | Fall', 'Geänderter Begriff | Fall'),
    values => values[0] += '| zusätzliche Sachzelle | 12 |\n',
    values => values[3] = values[3].replace('| SYNTHETISCHER FOLGETEST | hinweis |\n', ''),
    values => values[3] = values[3].replace('| hinweis |', '| person |'),
    values => values[0] += '| SYNTHETISCHER FOLGETEST | hinweis |\n'
  ];
  for (const mutate of mutations) { const values = [...texts]; mutate(values); assert.throws(() => assertPackagedReviewOutputs(values)); }
  const minimal = 'Name: [PERSON_001]\nE-Mail: [EMAIL_001]\n| [UNTERNEHMEN_001] | firma |\n| [PERSON_002] | person |\n';
  assert.throws(() => assertPackagedReviewOutputs([minimal, minimal, minimal, minimal +
    '| SYNTHETISCHER FOLGETEST | hinweis |\n']), /REVIEW_COMPANY_ROWS_INCOMPLETE/u);
});

testAsync('the actual extracted execution tree rejects edited, missing, additional and redirected files', async () => {
  const { verifyExtractedCandidate } = await import('./helpers/standalone-candidate-integrity.mjs');
  const { removePackageSmokeScope } = await import('./helpers/standalone-package-scope.mjs');
  const parent = path.resolve(__dirname, '..');
  const scope = fs.mkdtempSync(path.join(parent, '.tmp-standalone-package-'));
  const candidate = path.join(scope, 'candidate');
  const entries = new Map([['bundle/app', Buffer.from('actual executable')],
    ['bundle/runtime/module.js', Buffer.from('actual runtime')]]);
  const modulePath = path.join(candidate, 'bundle/runtime/module.js');
  const extra = path.join(candidate, 'bundle/extra.js'), link = path.join(candidate, 'redirected');
  try {
    for (const [name, bytes] of entries) {
      const destination = path.join(candidate, ...name.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
    }
    verifyExtractedCandidate(candidate, entries);
    fs.writeFileSync(modulePath, 'edited runtime');
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_FILE_CHANGED/u);
    fs.writeFileSync(modulePath, entries.get('bundle/runtime/module.js'));
    fs.unlinkSync(modulePath);
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_FILES_INCOMPLETE/u);
    fs.writeFileSync(modulePath, entries.get('bundle/runtime/module.js'), { flag: 'wx' });
    fs.writeFileSync(extra, 'unlisted module', { flag: 'wx' });
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_FILE_UNEXPECTED/u);
    fs.unlinkSync(extra);
    fs.mkdirSync(path.join(candidate, 'extra-empty-directory'));
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_DIRECTORY_UNEXPECTED/u);
    fs.rmdirSync(path.join(candidate, 'extra-empty-directory'));
    const outside = path.join(scope, 'outside'); fs.mkdirSync(outside);
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_LINK_FORBIDDEN/u);
    assert.ok(fs.lstatSync(link).isSymbolicLink()); fs.unlinkSync(link);
    const hardlink = path.join(scope, 'outside-hardlink');
    fs.linkSync(modulePath, hardlink);
    try { assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_HARDLINK_FORBIDDEN/u); }
    finally { assert.ok(fs.lstatSync(hardlink).isFile() && !fs.lstatSync(hardlink).isSymbolicLink()); fs.unlinkSync(hardlink); }
    assert.throws(() => verifyExtractedCandidate(candidate, entries,
      new Map([['bundle/runtime/module.js', 0o120644]])), /CANDIDATE_ARCHIVE_FILE_TYPE_INVALID/u);
    if (process.platform !== 'win32') {
      fs.chmodSync(modulePath, 0o644);
      verifyExtractedCandidate(candidate, entries, new Map([['bundle/runtime/module.js', 0o100644]]));
      fs.chmodSync(modulePath, 0o755);
      assert.throws(() => verifyExtractedCandidate(candidate, entries,
        new Map([['bundle/runtime/module.js', 0o100644]])), /CANDIDATE_MODE_CHANGED/u);
    }
    verifyExtractedCandidate(candidate, entries);
  } finally {
    if (fs.existsSync(link)) { assert.ok(fs.lstatSync(link).isSymbolicLink()); fs.unlinkSync(link); }
    removePackageSmokeScope(parent, scope);
  }
});

testAsync('native campaign rejects a changed extracted runtime before either launch or a PASS receipt', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-review-campaign.mjs'), 'utf8');
  assert.match(source, /for \(const phase of \[1, 2\]\) \{\s+verifyCandidate\(scope, metadata\);/u);
  assert.match(source, /assertPackagedReviewOutputs\(outputs\)/u);
  if (!['win32', 'darwin'].includes(process.platform)) return;
  const { zipStore } = require('./lib/zip.js');
  const { removePackageSmokeScope } = await import('./helpers/standalone-package-scope.mjs');
  const parent = fs.realpathSync.native(os.tmpdir());
  const scope = path.join(parent, `.tmp-standalone-native-${crypto.randomUUID().replaceAll('-', '')}`);
  const archiveScope = fs.mkdtempSync(path.join(path.resolve(__dirname, '..'), '.tmp-standalone-package-'));
  const target = process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`, version = 'synthetic';
  const prefix = `DataSecure-Standalone-${version}-${target}/`;
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const entries = new Map([['server/module.js', Buffer.from('verified runtime')]]);
  const manifest = { files: [...entries].map(([name, bytes]) => ({ path: name, bytes: bytes.length,
    sha256: digest(bytes), executable: false })) };
  entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
  entries.set('SHA256SUMS', Buffer.from([...entries].map(([name, bytes]) => `${digest(bytes)}  ${name}`).join('\n') + '\n'));
  const archive = path.join(archiveScope, 'synthetic.zip'), bytes = zipStore([...entries].map(([name, value]) => [prefix + name, value]));
  fs.mkdirSync(scope);
  try {
    fs.writeFileSync(archive, bytes);
    const metadata = { archive, archive_sha256: digest(bytes), target, version, operator_attestation: true };
    const info = path.join(scope, 'NATIVE-REVIEW-CAMPAIGN.json'), receipt = path.join(scope, 'NATIVE-REVIEW-RECEIPT.json');
    fs.writeFileSync(info, JSON.stringify(metadata)); fs.writeFileSync(receipt, JSON.stringify({ status: 'NOT_RUN' }));
    for (const [name, value] of entries) {
      const destination = path.join(scope, 'candidate', ...`${prefix}${name}`.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, value, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(scope, 'candidate', ...`${prefix}server/module.js`.split('/')), 'edited after verified extraction');
    for (const mode of ['--check', '--launch']) {
      fs.writeFileSync(info, JSON.stringify(metadata));
      const result = spawnSync(process.execPath, [path.join(__dirname, 'manual/standalone-native-review-campaign.mjs'), mode, scope],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      assert.notEqual(result.status, 0); assert.match(result.stderr, /CANDIDATE_FILE_CHANGED/u);
      assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).status, 'NOT_RUN');
    }
  } finally {
    // Reuse the checked per-entry cleanup implementation by moving only this
    // inspected, ordinary synthetic campaign tree into its owned smoke scope.
    assert.equal(path.dirname(scope), parent); assert.equal(fs.realpathSync.native(scope), scope);
    assert.ok(fs.lstatSync(scope).isDirectory() && !fs.lstatSync(scope).isSymbolicLink());
    const destination = path.join(archiveScope, 'campaign'); fs.renameSync(scope, destination);
    removePackageSmokeScope(path.resolve(__dirname, '..'), archiveScope);
  }
});

test('the Windows launcher is bound to the successful-response predicate and has a bounded contract mode', () => {
  const script = path.join(__dirname, 'manual/standalone-native-windows-launch.ps1');
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /\$reviewReady = Test-NativeReviewReadiness \$desktopSession/u);
  assert.match(source, /-not \$AssertReviewWindow -or \$reviewReady/u);
  assert.match(source, /review_session_response_ok = \$reviewReady/u);
  assert.match(source, /if \(\$ValidateReadinessOnly\)/u);
});

if (process.platform === 'win32') test('actual PowerShell readiness rejects failed or merely started review IPC', () => {
  const script = path.join(__dirname, 'manual/standalone-native-windows-launch.ps1');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', script, '-ValidateReadinessOnly'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /READINESS CONTRACT PASS \([0-9]+ groups; no native app launch\)/u);
});
else process.stdout.write('SKIP actual PowerShell readiness contract (Windows host required; not counted passed)\n');

testAsync('a nonmatching target is explicitly skipped and cannot increase passed count', async () => {
  let assertionsReached = false;
  let output = '';
  const cases = createPlatformCases({ platform: 'darwin', write: value => { output += value; } });
  await cases.test('Windows native stress', () => { assertionsReached = true; }, { platform: 'win32' });
  await cases.test('Mac actual assertion', () => { assert.equal(1 + 1, 2); }, { platform: 'darwin' });
  assert.equal(assertionsReached, false);
  assert.deepEqual(cases.snapshot(), { total: 2, passed: 1, skipped: 1, failed: 0 });
  assert.match(output, /skip 1 .*# SKIP requires win32; host darwin/u);
  assert.doesNotMatch(output, /ok 1/u);
  assert.match(output, /ok 2/u);
  await assert.rejects(cases.test('real failure', () => { throw new Error('sentinel'); }), /sentinel/u);
  assert.deepEqual(cases.snapshot(), { total: 3, passed: 1, skipped: 1, failed: 1 });
});

test('real converter suite declares platform applicability before callback execution', () => {
  const source = fs.readFileSync(path.join(__dirname, 'test-standalone-conversion-worker.mjs'), 'utf8');
  const windowsCase = source.slice(source.indexOf("await test('native Windows assignment"),
    source.indexOf("await test('truncated real stdin"));
  assert.match(windowsCase, /\{ platform: 'win32' \}/u);
  assert.doesNotMatch(windowsCase, /process\.platform[^\n]*return/u);
  assert.match(source, /counts\.passed.*counts\.skipped/u);
});

test('a native launcher on the wrong host cannot return a successful exit status', () => {
  for (const [file, marker] of [
    ['standalone-native-windows-launch.ps1', 'if ($env:OS'],
    ['standalone-native-macos-launch.sh', 'if [[ "$(uname -s)"']
  ]) {
    const source = fs.readFileSync(path.join(__dirname, 'manual', file), 'utf8');
    const guard = source.slice(source.indexOf(marker), source.indexOf(marker) + 300);
    assert.match(guard, /exit 77/u);
    assert.doesNotMatch(guard, /exit 0/u);
  }
});

test('UI-only browser fixtures follow the current version without claiming native evidence', () => {
  const source = fs.readFileSync(path.join(__dirname, 'manual/standalone-ui-browser.mjs'), 'utf8');
  assert.match(source, /require\(path\.join\(root, 'package\.json'\)\)\.version/u);
  assert.equal(source.match(/product_version: productVersion/gu)?.length, 2);
  assert.doesNotMatch(source, /product_version: '3\.2\.0-rc\d+'/u);
  assert.match(source, /UI fixture only/u);
});

test('Standalone/platform gates contain the actual review and integrity regressions without duplicate entries', () => {
  const root = path.resolve(__dirname, '..');
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const files = [...scripts['test:standalone'].matchAll(/node (tests\/[^ ]+)/gu)].map(match => match[1]);
  assert.equal(new Set(files).size, files.length);
  for (const file of ['test-standalone-review-choices.js', 'test-standalone-review-ipc.js', 'test-native-smoke-integrity.js',
    'test-standalone-pdf-text-layout.js', 'test-residual-person-review.js', 'test-standalone-package-integrity.mjs']) {
    assert.ok(files.includes(`tests/${file}`), file);
  }
  for (const platform of ['macos', 'linux']) {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', `standalone-${platform}-sandbox.yml`), 'utf8');
    assert.match(workflow, /npm run test:standalone/u);
  }
  const gate = fs.readFileSync(path.join(root, 'scripts/run-pkg-04.ps1'), 'utf8');
  assert.match(gate, /packaged_review_ipc = 'passed'/u);
  assert.match(gate, /native_review_decisions = 'not_run'/u,
    'actual Node/private IPC decisions must not be relabelled as native UI acceptance');
});

done();
