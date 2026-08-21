'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-companion-processor-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');

const { createJob, jobStatus, readEvents } = require('../plugins/data-secure/server/companion/job-store');
const { processCompanionJob } = require('../plugins/data-secure/server/companion/processor');
const { anonymizeSelectedSource } = require('../plugins/data-secure/server/gateway/orchestrator');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { readOutput } = require('../plugins/data-secure/server/gateway/package-store');
const { zipStore } = require('./lib/zip');
const { confirmationCommands, confirmAutomaticRelease } = require('../plugins/data-secure/server/companion/local-confirmation');

const { testAsync, done, assert } = createSuite('Companion selected-source processing');

function workspace(name) {
  const root = path.join(base, name);
  process.env.EU_PRIVACY_ROOT = root;
  return roots();
}

function source(name, body) {
  const file = path.join(base, name);
  fs.writeFileSync(file, body);
  return file;
}

async function main() {
  await testAsync('confirmed TXT processing releases a readable package and preserves the original', async () => {
    workspace('txt-release');
    const file = source('employee.txt', 'Kontakt: Max Mustermann, max.mustermann@example.de, +49 30 1234567\nRolle: Softwarearchitekt');
    const original = fs.readFileSync(file);
    const job = createJob({ profile: 'personnel_profile', source_type: 'txt' });
    const result = await processCompanionJob(job.job_id, file, job.profile, { confirmAutomaticRelease: () => true });
    assert.strictEqual(result.job.state, 'Released');
    assert.deepStrictEqual(fs.readFileSync(file), original);
    const released = readOutput(result.package_id, 0, 30000);
    assert.doesNotMatch(released.text, /Max Mustermann|max\.mustermann|1234567/i);
    assert.match(released.text, /Softwarearchitekt/);
    assert.strictEqual(readEvents(job.job_id).at(-1).output_sha256.length, 64);
  });

  await testAsync('declining the local skip leaves the job at Detected and publishes nothing', async () => {
    const r = workspace('decline');
    const file = source('decline.txt', 'Name: Erika Musterfrau\nE-Mail: erika@example.de');
    const job = createJob({ profile: 'customer', source_type: 'txt' });
    await assert.rejects(
      processCompanionJob(job.job_id, file, job.profile, { confirmAutomaticRelease: () => false }),
      /nicht übersprungen/
    );
    assert.strictEqual(jobStatus(job.job_id).state, 'Detected');
    assert.deepStrictEqual(fs.readdirSync(r.output), []);
    assert.ok(fs.existsSync(file));
  });

  await testAsync('text-only DOCX completes through the same confirmed companion path', async () => {
    workspace('docx-release');
    const file = path.join(base, 'text-only.docx');
    fs.writeFileSync(file, zipStore([
      ['word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Kontakt: Max Mustermann, max@example.de</w:t></w:r></w:p><w:p><w:r><w:t>Rolle: Architekt</w:t></w:r></w:p></w:body></w:document>']
    ]));
    const job = createJob({ profile: 'personnel_profile', source_type: 'docx' });
    const result = await processCompanionJob(job.job_id, file, job.profile, { confirmAutomaticRelease: () => true });
    assert.strictEqual(result.job.state, 'Released');
    assert.match(readOutput(result.package_id, 0, 30000).text, /Architekt/);
  });

  await testAsync('local confirmation exposes only a count and requires an explicit positive result', async () => {
    const commands = confirmationCommands(3, 'win32', { SystemRoot: 'C:\\Windows' });
    assert.doesNotMatch(JSON.stringify(commands), /Mustermann|source|filename|original/i);
    assert.strictEqual(confirmAutomaticRelease(3, {
      platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
      runner: () => ({ status: 0, stdout: 'CONFIRMED' })
    }), true);
    assert.strictEqual(confirmAutomaticRelease(3, {
      platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
      runner: () => ({ status: 0, stdout: '' })
    }), false);
  });

  await testAsync('DOCX with withheld visuals cannot be skipped by the text confirmation', async () => {
    const r = workspace('visual-block');
    const fixture = path.join(__dirname, 'fixtures', 'synthetic_profile.docx');
    const file = path.join(base, 'visual-profile.docx');
    fs.copyFileSync(fixture, file);
    const job = createJob({ profile: 'personnel_profile', source_type: 'docx' });
    let confirmationCalled = false;
    await assert.rejects(
      processCompanionJob(job.job_id, file, job.profile, {
        confirmAutomaticRelease: () => { confirmationCalled = true; return true; },
        gatewayDeps: {
          ocrPngDetailed: async () => ({ text: '', words: [] }),
          rasterizeToPng: async () => { throw new Error('not available'); }
        }
      }),
      /benötigt lokale Prüfung/
    );
    assert.strictEqual(confirmationCalled, false);
    assert.strictEqual(jobStatus(job.job_id).state, 'Detected');
    assert.deepStrictEqual(fs.readdirSync(r.output), []);
  });

  await testAsync('unsupported companion formats fail terminally without moving the source', async () => {
    workspace('unsupported');
    const file = source('unsupported.pdf', '%PDF synthetic');
    const job = createJob({ profile: 'customer', source_type: 'pdf' });
    await assert.rejects(
      processCompanionJob(job.job_id, file, job.profile, { confirmAutomaticRelease: () => true }),
      /ausschließlich TXT und DOCX/
    );
    assert.strictEqual(jobStatus(job.job_id).state, 'Failed');
    assert.ok(fs.existsSync(file));
  });

  await testAsync('a failed release journal update removes the published package', async () => {
    const r = workspace('release-rollback');
    const file = source('rollback.txt', 'Kontakt: Max Mustermann, max@example.de');
    await assert.rejects(
      anonymizeSelectedSource(file, 'customer', {
        companionJobId: '00000000-0000-4000-8000-000000000000',
        beforePublish: () => {},
        afterPublish: () => { throw new Error('simulated journal failure'); }
      }),
      /vollständiges Output-Paket/
    );
    assert.deepStrictEqual(fs.readdirSync(r.output), []);
    assert.ok(fs.existsSync(file));
  });

  await testAsync('selected-source processing never consumes an existing Input queue item', async () => {
    const r = workspace('queue-isolation');
    const queued = path.join(r.input, 'queued.txt');
    fs.writeFileSync(queued, 'do not consume');
    const file = source('selected.txt', 'Kontakt: Max Mustermann, max@example.de');
    const job = createJob({ profile: 'customer', source_type: 'txt' });
    await processCompanionJob(job.job_id, file, job.profile, { confirmAutomaticRelease: () => true });
    assert.strictEqual(fs.readFileSync(queued, 'utf8'), 'do not consume');
  });

  await testAsync('companion results, journals and audit receipts contain no selected path', async () => {
    const r = workspace('path-privacy');
    const file = source('secret-customer-name.txt', 'Kontakt: Max Mustermann, max@example.de');
    const job = createJob({ profile: 'customer', source_type: 'txt' });
    const result = await processCompanionJob(job.job_id, file, job.profile, { confirmAutomaticRelease: () => true });
    const encoded = [
      JSON.stringify(result),
      JSON.stringify(readEvents(job.job_id)),
      ...fs.readdirSync(r.audit).map((name) => fs.readFileSync(path.join(r.audit, name), 'utf8'))
    ].join('\n');
    assert.doesNotMatch(encoded, /secret-customer-name|companion-processor/i);
  });

  done();
}

main();
