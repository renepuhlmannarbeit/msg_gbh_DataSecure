'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-supervisor-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const { companionEnvironment, launchCompanion } = require('../plugins/data-secure/server/companion/supervisor');
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

  await testAsync('supervisor launches the real child with authenticated inherited stdio', async () => {
    const companion = launchCompanion();
    try {
      const ready = await companion.ready;
      assert.strictEqual(ready.transport, 'inherited_stdio');
      assert.strictEqual(ready.network_listener, false);
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
      await assert.rejects(companion.request('cancel_job', { job_id: '../outside' }), /Ungültige Job-ID/);
      const capabilities = await companion.request('capabilities', {});
      assert.strictEqual(capabilities.authenticated_frames, true);
    } finally {
      companion.close();
    }
  });

  await testAsync('manager runs picker before processing and returns only released metadata', async () => {
    const calls = [];
    let closed = false;
    const fake = {
      ready: Promise.resolve({}),
      async request(command, params) {
        calls.push({ command, params });
        if (command === 'pick_source') return { ok: true, job: { job_id: 'job-opaque' } };
        return {
          ok: true,
          job: { job_id: 'job-opaque', state: 'Released' },
          package_id: 'package-opaque',
          document_id: 'document-opaque.md',
          raw_content_sent_to_claude: false
        };
      },
      close() { closed = true; }
    };
    const result = await prepareLocalDocument('personnel_profile', { launchCompanion: () => fake });
    assert.deepStrictEqual(calls, [
      { command: 'pick_source', params: { profile: 'personnel_profile' } },
      { command: 'process_source', params: { job_id: 'job-opaque' } }
    ]);
    assert.strictEqual(result.human_skip_confirmed_locally, true);
    assert.strictEqual(result.raw_content_sent_to_claude, false);
    assert.strictEqual(closed, true);
    assert.doesNotMatch(JSON.stringify(result), /source|filename|original_path/i);
  });

  await testAsync('manager always closes the companion when local selection is cancelled', async () => {
    let closed = false;
    const fake = {
      ready: Promise.resolve({}),
      request: async () => { throw new Error('cancelled'); },
      close() { closed = true; }
    };
    await assert.rejects(prepareLocalDocument('customer', { launchCompanion: () => fake }), /cancelled/);
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

  done();
}

main();
