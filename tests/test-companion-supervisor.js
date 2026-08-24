'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { SafeError } = require('../plugins/data-secure/server/runtime');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-supervisor-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const {
  companionEnvironment,
  terminateProcessTree,
  launchCompanion
} = require('../plugins/data-secure/server/companion/supervisor');
const { prepareLocalDocument } = require('../plugins/data-secure/server/companion/manager');
const { testAsync, done, assert } = createSuite('Companion supervisor and MCP boundary');

async function main() {
  await testAsync('supervisor strips unrelated API and cloud secrets from the child environment', async () => {
    const filtered = companionEnvironment({
      SystemRoot: 'C:\\Windows',
      EU_PRIVACY_RETENTION_DAYS: '7',
      OPENAI_API_KEY: 'must-not-pass',
      AWS_SECRET_ACCESS_KEY: 'must-not-pass',
      CUSTOM_TOKEN: 'must-not-pass'
    });
    assert.deepStrictEqual(filtered, { SystemRoot: 'C:\\Windows', EU_PRIVACY_RETENTION_DAYS: '7' });
  });

  await testAsync('Windows timeout termination targets the complete companion process tree', async () => {
    let invocation;
    let directKills = 0;
    terminateProcessTree({ pid: 4321, kill: () => { directKills++; } }, {
      platform: 'win32', systemRoot: 'C:\\Windows',
      killTreeRunner: (command, args, options) => {
        invocation = { command, args, options };
        return { status: 0 };
      }
    });
    assert.match(invocation.command, /taskkill\.exe$/i);
    assert.deepStrictEqual(invocation.args, ['/pid', '4321', '/t', '/f']);
    assert.strictEqual(invocation.options.shell, false);
    assert.strictEqual(directKills, 0);
  });

  await testAsync('supervisor launches the real child with authenticated inherited stdio', async () => {
    let invocation;
    const companion = launchCompanion({
      spawn(command, args, options) {
        invocation = { command, args, options };
        return require('child_process').spawn(command, args, options);
      }
    });
    try {
      const ready = await companion.ready;
      assert.strictEqual(ready.transport, 'inherited_stdio');
      assert.strictEqual(ready.network_listener, false);
      assert.strictEqual(invocation.options.shell, false);
      assert.strictEqual(invocation.options.windowsHide, true);
      assert.deepStrictEqual(invocation.options.stdio, ['pipe', 'pipe', 'ignore', 'pipe']);
      const capabilities = await companion.request('capabilities', {});
      assert.strictEqual(capabilities.session_id, ready.session_id);
      assert.strictEqual(capabilities.model_authority, false);
    } finally {
      companion.close();
    }
  });

  await testAsync('a rejected authenticated request does not break the next sequence', async () => {
    const companion = launchCompanion();
    try {
      await companion.ready;
      await assert.rejects(companion.request('cancel_job', { job_id: '../outside' }), (error) => {
        assert.strictEqual(error.code, 'REQUEST_REJECTED');
        assert.match(error.message, /lokale Companion-Anfrage wurde sicher abgewiesen/u);
        assert.doesNotMatch(error.message, /Job-ID|outside/u);
        return true;
      });
      const capabilities = await companion.request('capabilities', {});
      assert.strictEqual(capabilities.authenticated_frames, true);
    } finally {
      companion.close();
    }
  });

  await testAsync('manager runs picker before processing and returns only released metadata', async () => {
    const calls = [];
    let closed = false;
    let summaryCalls = 0;
    const fake = {
      ready: Promise.resolve({}),
      async request(command, params) {
        calls.push({ command, params });
        if (command === 'pick_sources') return { ok: true, jobs: [{ job_id: 'job-opaque' }], selected_count: 1 };
        return {
          ok: true,
          job: { job_id: 'job-opaque', state: 'Released' },
          review_decision: 'reviewed',
          package_id: 'package-opaque',
          document_id: 'document-opaque.md',
          raw_content_sent_to_claude: false
        };
      },
      close() { closed = true; }
    };
    const result = await prepareLocalDocument('personnel_profile', {
      platform: 'win32', removeImages: true, launchCompanion: () => fake,
      showCompletionSummary() { summaryCalls++; return true; }
    });
    assert.deepStrictEqual(calls, [
      { command: 'pick_sources', params: { profile: 'personnel_profile', remove_images: true } },
      { command: 'process_source', params: { job_id: 'job-opaque' } }
    ]);
    assert.strictEqual(result.review_decision, 'reviewed');
    assert.strictEqual(result.human_skip_confirmed_locally, false);
    assert.strictEqual(result.raw_content_sent_to_claude, false);
    assert.strictEqual(result.selected_count, 1);
    assert.strictEqual(result.released_count, 1);
    assert.strictEqual(result.completion_summary_shown, false);
    assert.strictEqual(summaryCalls, 0, 'single-file flow needs no duplicate completion window');
    assert.strictEqual(closed, true);
    assert.doesNotMatch(JSON.stringify(result), /source|filename|original_path/i);
  });

  await testAsync('manager processes multiple selections independently and keeps successful packages', async () => {
    const requests = [];
    const fake = {
      ready: Promise.resolve({}),
      async request(command, params) {
        requests.push({ command, params });
        if (command === 'pick_sources') return {
          ok: true, selected_count: 3,
          jobs: [{ job_id: 'one' }, { job_id: 'two' }, { job_id: 'three' }]
        };
        if (params.job_id === 'two') throw new SafeError('Datei 2 wurde sicher gestoppt.');
        return {
          ok: true, job: { job_id: params.job_id, state: 'Released' },
          package_id: `package-${params.job_id}`, review_decision: 'reviewed',
          raw_content_sent_to_claude: false
        };
      },
      close() {}
    };
    const result = await prepareLocalDocument('auto', {
      platform: 'win32', launchCompanion: () => fake,
      showCompletionSummary: () => true
    });
    assert.strictEqual(result.workflow, 'local_companion_txt_docx_batch');
    assert.strictEqual(result.selected_count, 3);
    assert.strictEqual(result.released_count, 2);
    assert.strictEqual(result.failed_count, 1);
    assert.strictEqual(result.completion_summary_shown, true);
    assert.deepStrictEqual(result.results.map((item) => item.ok), [true, false, true]);
    assert.strictEqual(requests.filter((item) => item.command === 'process_source').length, 3);
    assert.doesNotMatch(JSON.stringify(result), /sourcePath|filename|original_path/i);
  });

  await testAsync('an unavailable batch completion window never invalidates released packages', async () => {
    const fake = {
      ready: Promise.resolve({}),
      async request(command) {
        if (command === 'pick_sources') return { ok: true, jobs: [{ job_id: 'one' }, { job_id: 'two' }] };
        return { ok: true, job: { job_id: command, state: 'Released' }, package_id: 'package-one' };
      },
      close() {}
    };
    const result = await prepareLocalDocument('general', {
      platform: 'win32', launchCompanion: () => fake,
      showCompletionSummary() { throw new Error('desktop unavailable'); }
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.released_count, 2);
    assert.strictEqual(result.completion_summary_shown, false);
  });

  await testAsync('manager returns an explicit terminal no-selection result and never retries the picker', async () => {
    let closed = false;
    let calls = 0;
    const fake = {
      ready: Promise.resolve({}),
      request: async () => {
        calls++;
        const error = new Error('cancelled');
        error.code = 'LOCAL_SELECTION_CANCELLED';
        throw error;
      },
      close() { closed = true; }
    };
    const result = await prepareLocalDocument('customer', { platform: 'win32', launchCompanion: () => fake });
    assert.deepStrictEqual(result, {
      ok: false, error: 'local_selection_cancelled',
      message: 'Die lokale Dateiauswahl wurde abgebrochen. Es wurde kein Stapel gestartet.',
      workflow: 'local_companion_txt_docx', selected_count: 0, released_count: 0,
      failed_count: 0, raw_content_sent_to_claude: false
    });
    assert.strictEqual(calls, 1);
    assert.strictEqual(closed, true);
  });

  await testAsync('manager rejects unknown profiles before starting any child', async () => {
    let launched = false;
    await assert.rejects(
      prepareLocalDocument('executive_scoring', { launchCompanion: () => { launched = true; } }),
      /Unbekanntes Datenschutzprofil/
    );
    assert.strictEqual(launched, false);
  });

  await testAsync('manager refuses an unavailable review platform before opening the picker', async () => {
    let launched = false;
    await assert.rejects(
      prepareLocalDocument('customer', { platform: 'freebsd', launchCompanion: () => { launched = true; } }),
      /keine Datei ausgewählt/
    );
    assert.strictEqual(launched, false);
  });

  await testAsync('manager permits the macOS companion adapter', async () => {
    let closed = false;
    const fake = {
      ready: Promise.resolve({}),
      async request(command) {
        if (command === 'pick_sources') return { ok: true, jobs: [{ job_id: 'mac-job' }] };
        return { ok: true, job: { job_id: 'mac-job', state: 'Released' }, package_id: 'mac-package' };
      },
      close() { closed = true; }
    };
    const result = await prepareLocalDocument('general', { platform: 'darwin', launchCompanion: () => fake });
    assert.strictEqual(result.released_count, 1);
    assert.strictEqual(closed, true);
  });

  done();
}

main();
