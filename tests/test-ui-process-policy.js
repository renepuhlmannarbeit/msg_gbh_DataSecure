'use strict';

const childProcess = require('child_process');
const { createSuite } = require('./helpers');
const {
  UI_PROCESS_POLICIES,
  uiProcessEnvironment,
  uiProcessPolicy
} = require('../plugins/data-secure/server/companion/ui-process-policy');
const {
  PICKER_CANCELLED,
  pickerCommands,
  pickSource
} = require('../plugins/data-secure/server/companion/file-picker');
const {
  SOURCE_FOLDER_CANCELLED,
  sourceFolderPickerCommands,
  pickSourceFolder
} = require('../plugins/data-secure/server/companion/source-folder');
const {
  confirmationCommands,
  confirmAutomaticRelease
} = require('../plugins/data-secure/server/companion/local-confirmation');
const {
  completionSummaryCommand,
  showCompletionSummary
} = require('../plugins/data-secure/server/companion/completion-summary');
const { startConfirmationCommands } = require('../plugins/data-secure/server/companion/batch-start-confirmation');
const {
  REVIEW_SCHEMA,
  powershellReviewScript,
  darwinReviewScript,
  linuxViewerCommands,
  linuxChoiceCommand,
  reviewTextLocally
} = require('../plugins/data-secure/server/companion/text-review');
const { openFolder } = require('../plugins/data-secure/server/gateway/common');

const { test, done, assert } = createSuite('UI subprocess policy');

const HOSTILE_ENV = Object.freeze({
  SystemRoot: 'C:\\Windows',
  PATH: 'C:\\Windows\\System32',
  TEMP: 'C:\\Temp',
  HTTP_PROXY: 'http://proxy.invalid',
  HTTPS_PROXY: 'http://proxy.invalid',
  ALL_PROXY: 'socks://proxy.invalid',
  NO_PROXY: 'localhost',
  NODE_OPTIONS: '--inspect=0.0.0.0:9229',
  ELECTRON_RUN_AS_NODE: '1',
  AWS_SECRET_ACCESS_KEY: 'secret',
  AZURE_CLIENT_SECRET: 'secret',
  OPENAI_API_KEY: 'secret'
});

test('all native UI helpers have an explicit immutable data classification', () => {
  assert.deepStrictEqual(Object.keys(UI_PROCESS_POLICIES).sort(), [
    'batch_start_confirmation', 'completion_summary', 'count_confirmation', 'folder_opener', 'password_prompt', 'path_picker', 'text_review'
  ]);
  assert.strictEqual(uiProcessPolicy('path_picker').raw_content, false);
  assert.strictEqual(uiProcessPolicy('count_confirmation').raw_content, false);
  assert.strictEqual(uiProcessPolicy('batch_start_confirmation').raw_content, false);
  assert.strictEqual(uiProcessPolicy('completion_summary').raw_content, false);
  assert.strictEqual(uiProcessPolicy('folder_opener').raw_content, false);
  const password = uiProcessPolicy('password_prompt');
  assert.strictEqual(password.input_class, 'user_entered_secret');
  assert.strictEqual(password.output_class, 'ephemeral_secret_buffer');
  assert.strictEqual(password.raw_content, false);
  assert.strictEqual(password.os_network_sandbox_required, true);
  const review = uiProcessPolicy('text_review');
  assert.strictEqual(review.raw_content, true);
  assert.strictEqual(review.os_network_sandbox_required, true);
  assert.strictEqual(review.os_network_sandbox_verified, false);
  assert.throws(() => uiProcessPolicy('unknown'), /Unknown DataSecure UI process purpose/);
});

test('folder opening is cross-platform, shell-free and receives the sanitized environment', () => {
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args, options });
    return { unref() {} };
  };
  for (const [platform, command] of [['win32', 'explorer.exe'], ['darwin', '/usr/bin/open'], ['linux', 'xdg-open']]) {
    assert.deepStrictEqual(openFolder('C:\\DataSecure\\Input', { platform, env: HOSTILE_ENV, spawn: runner }), { ok: true, opened: true });
    assert.strictEqual(calls.at(-1).command, command);
  }
  for (const call of calls) {
    assert.strictEqual(call.options.shell, false);
    assert.strictEqual(call.options.env.HTTP_PROXY, undefined);
    assert.strictEqual(call.options.env.OPENAI_API_KEY, undefined);
    assert.strictEqual(call.args[0], 'C:\\DataSecure\\Input');
  }
  assert.deepStrictEqual(openFolder('C:\\DataSecure\\Input', { platform: 'freebsd', spawn: runner }), {
    ok: false, message: 'Für dieses Betriebssystem ist keine lokale Ordneröffnung verfügbar.'
  });
});

test('native start, picker and completion paths use keyboard-accessible OS dialogs on every target platform', () => {
  const summary = { selected_count: 2, total_bytes: 2048 };
  const result = { selected_count: 2, released_count: 1, failed_count: 1 };
  const windowsStart = startConfirmationCommands(summary, { platform: 'win32', env: HOSTILE_ENV })[0].args.at(-1);
  const windowsPicker = pickerCommands('win32', HOSTILE_ENV, ['txt'], true)[0].args.at(-1);
  const windowsFolderPicker = sourceFolderPickerCommands('win32', HOSTILE_ENV)[0].args.at(-1);
  const windowsFinish = completionSummaryCommand(result, { platform: 'win32', env: HOSTILE_ENV }).args.at(-1);
  assert.match(windowsStart, /MessageBox[\s\S]*YesNo/);
  assert.match(windowsPicker, /OpenFileDialog/);
  assert.match(windowsFolderPicker, /IFileOpenDialog[\s\S]*FOS_PICKFOLDERS[\s\S]*FolderPicker\]::Pick\(/);
  assert.match(windowsFolderPicker, /FolderBrowserDialog/);
  assert.match(windowsFinish, /AcceptButton.*CancelButton/);
  for (const platform of ['darwin', 'linux']) {
    const start = startConfirmationCommands(summary, { platform });
    const picker = pickerCommands(platform, HOSTILE_ENV, ['txt'], true);
    const folderPicker = sourceFolderPickerCommands(platform, HOSTILE_ENV);
    const finish = completionSummaryCommand(result, { platform });
    assert.ok(start.length >= 1 && picker.length >= 1 && folderPicker.length >= 1 && finish.command);
    assert.doesNotMatch(JSON.stringify({ start, picker, folderPicker, finish }), /cmd\.exe|\/bin\/sh|powershell.*-EncodedCommand/i);
  }
});

test('UI environment is allowlisted and strips proxy, cloud, Node and Electron controls', () => {
  const clean = uiProcessEnvironment(HOSTILE_ENV);
  assert.deepStrictEqual({ ...clean }, {
    SystemRoot: 'C:\\Windows',
    PATH: 'C:\\Windows\\System32',
    TEMP: 'C:\\Temp'
  });
  assert.strictEqual(Object.getPrototypeOf(clean), null);
});

test('every default UI runner uses shell false and the sanitized environment', () => {
  const calls = [];
  const original = childProcess.spawnSync;
  childProcess.spawnSync = (command, args, options) => {
    calls.push({ command, args, options });
    const script = String(args.at(-1) || '');
    if (script.includes('OpenFileDialog')) return { status: 0, stdout: PICKER_CANCELLED };
    if (script.includes('FolderBrowserDialog')) return { status: 0, stdout: SOURCE_FOLDER_CANCELLED };
    if (script.includes('ConvertFrom-Json')) return { status: 0, stdout: '{"action":"cancelled"}' };
    if (script.includes('MessageBox')) return { status: 0, stdout: 'CONFIRMED' };
    if (script.includes('Verarbeitung abgeschlossen')) return { status: 0, stdout: 'SHOWN' };
    return { status: 1, stdout: '' };
  };
  try {
    assert.throws(() => pickSource({ platform: 'win32', env: HOSTILE_ENV }), /abgebrochen/);
    assert.throws(() => pickSourceFolder({ platform: 'win32', env: HOSTILE_ENV }), /abgebrochen/);
    assert.strictEqual(confirmAutomaticRelease(2, { platform: 'win32', env: HOSTILE_ENV }), true);
    assert.strictEqual(showCompletionSummary({ selected_count: 1, released_count: 1, failed_count: 0 }, {
      platform: 'win32', env: HOSTILE_ENV
    }), true);
    assert.deepStrictEqual(reviewTextLocally({
      schema: REVIEW_SCHEMA,
      original_text: 'PERSON RAW SENTINEL',
      anonymized_text: '[PERSON_1]',
      locators: [],
      ambiguities: [],
      batch_index: 1,
      batch_total: 1
    }, { platform: 'win32', env: HOSTILE_ENV }), { action: 'cancelled' });
  } finally {
    childProcess.spawnSync = original;
  }
  assert.strictEqual(calls.length, 5);
  for (const call of calls) {
    assert.strictEqual(call.options.shell, false);
    assert.strictEqual(call.options.env.HTTP_PROXY, undefined);
    assert.strictEqual(call.options.env.NODE_OPTIONS, undefined);
    assert.strictEqual(call.options.env.OPENAI_API_KEY, undefined);
    assert.strictEqual(call.options.env.SystemRoot, 'C:\\Windows');
  }
});

test('raw document text is stdin-only and reaches only the classified review helper', () => {
  const calls = [];
  const runner = (command, args, input, env) => {
    calls.push({ command, args, input, env });
    if (String(args.at(-1)).includes('OpenFileDialog')) return { status: 0, stdout: PICKER_CANCELLED };
    if (String(args.at(-1)).includes('FolderBrowserDialog')) return { status: 0, stdout: SOURCE_FOLDER_CANCELLED };
    if (String(args.at(-1)).includes('ConvertFrom-Json')) return { status: 0, stdout: '{"action":"cancelled"}' };
    if (String(args.at(-1)).includes('MessageBox')) return { status: 0, stdout: 'CONFIRMED' };
    if (String(args.at(-1)).includes('Verarbeitung abgeschlossen')) return { status: 0, stdout: 'SHOWN' };
    return { status: 1, stdout: '' };
  };
  assert.throws(() => pickSource({ platform: 'win32', env: HOSTILE_ENV, runner }), /abgebrochen/);
  assert.throws(() => pickSourceFolder({
    platform: 'win32', env: HOSTILE_ENV,
    runner: (command, args, env) => runner(command, args, undefined, env)
  }), /abgebrochen/);
  confirmAutomaticRelease(1, { platform: 'win32', env: HOSTILE_ENV, runner });
  showCompletionSummary({ selected_count: 1, released_count: 1, failed_count: 0 }, {
    platform: 'win32', env: HOSTILE_ENV, runner
  });
  reviewTextLocally({
    schema: REVIEW_SCHEMA,
    original_text: 'PERSON RAW SENTINEL',
    anonymized_text: '[PERSON_1]',
    locators: [], ambiguities: [], batch_index: 1, batch_total: 1
  }, { platform: 'win32', env: HOSTILE_ENV, runner });

  assert.strictEqual(calls.filter((call) => String(call.input || '').includes('PERSON RAW SENTINEL')).length, 1);
  assert.ok(String(calls[4].input).includes('PERSON RAW SENTINEL'));
  for (const call of calls) assert.doesNotMatch(JSON.stringify(call.args), /PERSON RAW SENTINEL/);
});

test('macOS credential review keeps raw document text off the command line', () => {
  let observed;
  const draft = {
    schema: REVIEW_SCHEMA,
    original_text: 'PERSON RAW SENTINEL', anonymized_text: '[PERSON_1]',
    locators: [],
    ambiguities: [{ ambiguity_id: 'credential:v2:000001', type: 'credential_issuer_ambiguous', original_start: 0, original_end: 6, anonymized_start: 0, anonymized_end: 6 }],
    batch_index: 1, batch_total: 1
  };
  reviewTextLocally(draft, {
    platform: 'darwin', env: HOSTILE_ENV,
    runner(command, args, input, env) {
      observed = { command, args, input, env };
      return { status: 0, stdout: JSON.stringify({ action: 'reviewed', redactions: [], decisions: [{ ambiguity_id: 'credential:v2:000001', decision: 'keep' }] }) };
    }
  });
  assert.strictEqual(observed.command, '/usr/bin/osascript');
  assert.match(observed.input, /PERSON RAW SENTINEL/);
  assert.doesNotMatch(JSON.stringify(observed.args), /PERSON RAW SENTINEL/);
  assert.strictEqual(observed.env.HTTP_PROXY, undefined);
  assert.doesNotMatch(darwinReviewScript(), /do shell script|curl|wget|http/iu);
});

test('Linux credential review keeps raw text off every argument vector', () => {
  const calls = [];
  const draft = {
    schema: REVIEW_SCHEMA, original_text: 'PERSON RAW SENTINEL', anonymized_text: '[PERSON_1]', locators: [],
    ambiguities: [{ ambiguity_id: 'credential:v2:000001', type: 'credential_issuer_ambiguous', original_start: 0, original_end: 6, anonymized_start: 0, anonymized_end: 6 }],
    batch_index: 1, batch_total: 1
  };
  reviewTextLocally(draft, {
    platform: 'linux', env: HOSTILE_ENV,
    runner(command, args, input, env) {
      calls.push({ command, args, input, env });
      if (args.includes('--text-info')) return { status: 0, stdout: '' };
      return args.includes('Geprüft freigeben') ? { status: 0, stdout: 'release' } : { status: 0, stdout: 'keep' };
    }
  });
  assert.strictEqual(calls.length, 3);
  assert.match(calls[0].input, /PERSON\].*RAW SENTINEL/u);
  for (const call of calls) {
    assert.doesNotMatch(JSON.stringify(call.args), /PERSON RAW SENTINEL/);
    assert.strictEqual(call.env.HTTP_PROXY, undefined);
    assert.strictEqual(call.env.OPENAI_API_KEY, undefined);
  }
  assert.deepStrictEqual(linuxViewerCommands()[1].args.slice(0, 2), ['--textbox', '/dev/stdin']);
  assert.match(linuxChoiceCommand('kdialog', 0, 1).args.join(' '), /Abbrechen/u);
});

test('fixed UI scripts contain no network-capable shell primitive', () => {
  const scripts = [
    ...pickerCommands('win32', HOSTILE_ENV, undefined, true).map((item) => item.args.join(' ')),
    ...sourceFolderPickerCommands('win32', HOSTILE_ENV).map((item) => item.args.join(' ')),
    ...confirmationCommands(3, 'win32', HOSTILE_ENV).map((item) => item.args.join(' ')),
    completionSummaryCommand({ selected_count: 1, released_count: 1, failed_count: 0 }, {
      platform: 'win32', env: HOSTILE_ENV
    }).args.join(' '),
    powershellReviewScript(),
    darwinReviewScript()
  ].join('\n');
  assert.doesNotMatch(scripts, /Invoke-WebRequest|Invoke-RestMethod|System\.Net|WebClient|HttpClient|TcpClient|UdpClient|Start-BitsTransfer|\bcurl\b|\bwget\b|\bssh\b/i);
});

done();
