'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-companion-processor-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');

const { createJob, jobStatus, readEvents } = require('../plugins/data-secure/server/companion/job-store');
const { processCompanionJob } = require('../plugins/data-secure/server/companion/processor');
const {
  anonymizeSelectedSource,
  cleanupAbandonedWorkingJobs
} = require('../plugins/data-secure/server/gateway/orchestrator');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { readOutput } = require('../plugins/data-secure/server/gateway/package-store');
const { zipStore } = require('./lib/zip');
const { confirmationCommands, confirmAutomaticRelease } = require('../plugins/data-secure/server/companion/local-confirmation');
const {
  REVIEW_SCHEMA,
  buildReviewDraft,
  powershellUtf8Preamble,
  powershellReviewScript,
  applyManualRedactions,
  reviewTextLocally
} = require('../plugins/data-secure/server/companion/text-review');

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

  await testAsync('cancelling the local review records a terminal local action and publishes nothing', async () => {
    const r = workspace('decline');
    const file = source('decline.txt', 'Name: Erika Musterfrau\nE-Mail: erika@example.de');
    const job = createJob({ profile: 'customer', source_type: 'txt' });
    await assert.rejects(
      processCompanionJob(job.job_id, file, job.profile, { confirmAutomaticRelease: () => false }),
      /abgebrochen/
    );
    assert.strictEqual(jobStatus(job.job_id).state, 'Cancelled');
    assert.strictEqual(readEvents(job.job_id).at(-1).human_action.channel, 'local_companion');
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

  await testAsync('a locally reviewed additional alias redaction preserves professional content', async () => {
    workspace('reviewed-release');
    const file = source('reviewed.txt', 'Kontakt: Max Mustermann, max@example.de\nKundenalias intern: Blauwal\nRolle: Architekt');
    const job = createJob({ profile: 'personnel_profile', source_type: 'txt' });
    const result = await processCompanionJob(job.job_id, file, job.profile, {
      reviewTextLocally: (input) => ({
        action: 'reviewed',
        redactions: [{ start: input.anonymized_text.indexOf('Blauwal'), end: input.anonymized_text.indexOf('Blauwal') + 7 }]
      })
    });
    assert.strictEqual(result.job.state, 'Released');
    assert.deepStrictEqual(readEvents(job.job_id).map((event) => event.state), [
      'Created', 'Claimed', 'Extracted', 'Detected', 'Reviewed', 'Verified', 'Released'
    ]);
    const released = readOutput(result.package_id, 0, 30000).text;
    assert.match(released, /Kundenalias intern: \[MANUAL_REDACTION\]/);
    assert.match(released, /Rolle: Architekt/);
    assert.strictEqual(result.review_decision, 'reviewed');
    assert.match(readEvents(job.job_id).find((event) => event.state === 'Reviewed').human_action.content_sha256, /^[a-f0-9]{64}$/);
  });

  await testAsync('an invalid manual redaction range fails closed and publishes nothing', async () => {
    const r = workspace('reviewed-residual-block');
    const file = source('residual.txt', 'Kontakt: Max Mustermann, max@example.de\nRolle: Architekt');
    const job = createJob({ profile: 'personnel_profile', source_type: 'txt' });
    await assert.rejects(
      processCompanionJob(job.job_id, file, job.profile, {
        reviewTextLocally: (input) => ({ action: 'reviewed', text: `${input.anonymized_text}\nMax Mustermann` })
      }),
      /Anonymisierungsaktionen/
    );
    assert.strictEqual(jobStatus(job.job_id).state, 'Failed');
    assert.deepStrictEqual(fs.readdirSync(r.output), []);
    assert.ok(fs.existsSync(file));
  });

  await testAsync('review locators identify spans without embedding their sensitive values', async () => {
    const original = 'Kontakt: Max Mustermann, max@example.de';
    const draft = buildReviewDraft(original, 'Kontakt: [PERSON_001], [EMAIL_REDACTED]', 'customer');
    assert.strictEqual(draft.schema, REVIEW_SCHEMA);
    assert.ok(draft.locators.length >= 2);
    assert.ok(draft.locators.every((locator) => !Object.hasOwn(locator, 'text')));
    assert.doesNotMatch(JSON.stringify(draft.locators), /Mustermann|example\.de/);
    assert.doesNotMatch(powershellReviewScript(), /Mustermann|example\.de/);
  });

  await testAsync('review locator offsets use the displayed normalized Unicode text', async () => {
    const draft = buildReviewDraft('Name: Max Mu\u0308l\u00ADler, mu\u200Beller@example.de', 'bereinigt', 'customer');
    assert.strictEqual(draft.original_text, 'Name: Max Müller, mueller@example.de');
    for (const locator of draft.locators) {
      assert.ok(locator.start >= 0 && locator.end <= draft.original_text.length && locator.end > locator.start);
    }
    assert.ok(draft.locators.some((locator) => draft.original_text.slice(locator.start, locator.end).includes('Max Müller')));
    assert.ok(draft.locators.some((locator) => draft.original_text.slice(locator.start, locator.end).includes('@')));
  });

  await testAsync('the Windows reviewer receives content only on stdin and returns redaction ranges', async () => {
    const draft = buildReviewDraft('Kontakt: Max Mustermann', 'Kontakt: [PERSON_001]', 'customer');
    let observed;
    const decision = reviewTextLocally(draft, {
      platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
      runner: (command, args, input) => {
        observed = { command, args, input };
        return { status: 0, stdout: JSON.stringify({ action: 'reviewed', redactions: [{ start: 0, end: 7 }] }) };
      }
    });
    assert.deepStrictEqual(decision.redactions, [{ start: 0, end: 7 }]);
    assert.doesNotMatch(JSON.stringify(observed.args), /Max Mustermann/);
    assert.match(observed.input, /Max Mustermann/);
    assert.match(JSON.stringify(observed.args), /InputEncoding/);
    assert.match(JSON.stringify(observed.args), /OutputEncoding/);
    assert.match(JSON.stringify(observed.args), /Update-Preview/);
    assert.match(JSON.stringify(observed.args), /MANUAL_REDACTION/);
  });

  await testAsync('the real Windows PowerShell pipe round-trips Unicode as UTF-8', async () => {
    if (process.platform !== 'win32') return;
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const value = 'ÄÖÜ äöü ß Mu\u0308ller 日本語';
    const result = childProcess.spawnSync(
      powershell,
      ['-NoProfile', '-NonInteractive', '-Command', `${powershellUtf8Preamble()}; $value = [Console]::In.ReadToEnd(); [Console]::Out.Write($value)`],
      { input: value, encoding: 'utf8', windowsHide: true, shell: false }
    );
    assert.strictEqual(result.status, 0, String(result.stderr || ''));
    assert.strictEqual(result.stdout, value);
  });

  await testAsync('the real Windows review form initializes and returns its selected redaction', async () => {
    if (process.platform !== 'win32') return;
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const anonymized = 'Kontakt: [PERSON_001]\nInterner Alias: Blauwal\nRolle: Lösungsarchitektin';
    const alias = 'Blauwal';
    const aliasStart = anonymized.indexOf(alias);
    const draft = buildReviewDraft('Kontakt: Erika Musterfrau\nInterner Alias: Blauwal\nRolle: Lösungsarchitektin', anonymized, 'customer');
    const nonInteractiveScript = powershellReviewScript().replace(
      '[void]$form.ShowDialog()',
      `$form.Add_Shown({ $right.Select(${aliasStart}, ${alias.length}); $redact.PerformClick(); $approve.PerformClick() }); [void]$form.ShowDialog()`
    );
    const result = childProcess.spawnSync(
      powershell,
      ['-NoProfile', '-NonInteractive', '-Sta', '-Command', nonInteractiveScript],
      { input: JSON.stringify(draft), encoding: 'utf8', windowsHide: true, shell: false }
    );
    assert.strictEqual(result.status, 0, String(result.stderr || ''));
    const answer = JSON.parse(result.stdout);
    assert.strictEqual(answer.action, 'reviewed');
    assert.deepStrictEqual(answer.redactions, [{ end: aliasStart + alias.length, start: aliasStart }]);
    assert.match(applyManualRedactions(anonymized, answer.redactions), /Interner Alias: \[MANUAL_REDACTION\]/);
    assert.match(applyManualRedactions(anonymized, answer.redactions), /Rolle: Lösungsarchitektin/);
  });

  await testAsync('manual review actions can only remove selected spans', async () => {
    assert.strictEqual(
      applyManualRedactions('Rolle: Architekt; Ort: [LOCATION_REDACTED]', [{ start: 7, end: 16 }]),
      'Rolle: [MANUAL_REDACTION]; Ort: [LOCATION_REDACTED]'
    );
    assert.throws(() => applyManualRedactions('abc', [{ start: 0, end: 4 }]), /außerhalb/);
    assert.throws(() => applyManualRedactions('abcdef', [{ start: 1, end: 4 }, { start: 3, end: 5 }]), /außerhalb/);
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
    assert.strictEqual(jobStatus(job.job_id).state, 'Failed');
    assert.strictEqual(readEvents(job.job_id).at(-1).error_code, 'technical_review_required');
    assert.deepStrictEqual(fs.readdirSync(r.output), []);
  });

  await testAsync('DOCX visuals can be explicitly removed for a text-only Markdown package', async () => {
    const r = workspace('visual-remove');
    const fixture = path.join(__dirname, 'fixtures', 'synthetic_profile.docx');
    const file = path.join(base, 'visual-profile-text-only.docx');
    fs.copyFileSync(fixture, file);
    const job = createJob({ profile: 'personnel_profile', source_type: 'docx' });
    const result = await processCompanionJob(job.job_id, file, job.profile, {
      removeImages: true,
      confirmAutomaticRelease: () => true,
      gatewayDeps: {
        ocrPngDetailed: async () => { throw new Error('OCR must not run in text-only mode'); },
        rasterizeToPng: async () => { throw new Error('rasterization must not run in text-only mode'); }
      }
    });
    assert.strictEqual(result.job.state, 'Released');
    assert.strictEqual(result.visual_assets.removed, 1);
    assert.strictEqual(result.visual_assets.review_required, 0);
    assert.strictEqual(fs.existsSync(file), true, 'the selected original must remain untouched');
    assert.deepStrictEqual(fs.readdirSync(r.review), []);
    const released = readOutput(result.package_id, 0, 30000);
    assert.match(released.text, /Grafik 001 wurde auf ausdrücklichen Wunsch entfernt/);
    assert.match(released.text, /Java|Architekt|Projekt/i, 'professional text must remain usable');
  });

  await testAsync('DOCX with an unsupported content part is blocked before local text review', async () => {
    const r = workspace('unsupported-docx-part');
    const file = path.join(base, 'embedded.docx');
    fs.writeFileSync(file, zipStore([
      ['word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Kontakt: Max Mustermann</w:t></w:r></w:p></w:body></w:document>'],
      ['word/embeddings/oleObject1.bin', Buffer.from('embedded private content')]
    ]));
    const job = createJob({ profile: 'customer', source_type: 'docx' });
    let reviewCalled = false;
    await assert.rejects(
      processCompanionJob(job.job_id, file, job.profile, {
        reviewTextLocally: () => { reviewCalled = true; return { action: 'skipped' }; }
      }),
      /technisch unsichere Inhalte/
    );
    assert.strictEqual(reviewCalled, false);
    assert.strictEqual(jobStatus(job.job_id).state, 'Failed');
    assert.deepStrictEqual(fs.readdirSync(r.output), []);
    assert.ok(fs.existsSync(file));
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

  await testAsync('abandoned private working copies are removed while live and unknown entries stay untouched', async () => {
    const r = workspace('abandoned-working-copy');
    const abandoned = path.join(r.jobs, 'abc_12345678');
    const active = path.join(r.jobs, 'def_12345678');
    const stalePid = path.join(r.jobs, 'ghi_12345678');
    const unknown = path.join(r.jobs, 'do-not-touch');
    for (const dir of [abandoned, active, stalePid, unknown]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(abandoned, 'source.txt'), 'private source');
    fs.writeFileSync(path.join(active, 'source.txt'), 'active private source');
    fs.writeFileSync(path.join(stalePid, 'source.txt'), 'stale pid source');
    fs.writeFileSync(path.join(abandoned, '.owner.json'), JSON.stringify({ pid: 111, created_at: new Date().toISOString(), nonce: 'a'.repeat(32) }));
    fs.writeFileSync(path.join(active, '.owner.json'), JSON.stringify({ pid: 222, created_at: new Date().toISOString(), nonce: 'b'.repeat(32) }));
    fs.writeFileSync(path.join(stalePid, '.owner.json'), JSON.stringify({ pid: 333, created_at: '2000-01-01T00:00:00.000Z', nonce: 'c'.repeat(32) }));
    const result = cleanupAbandonedWorkingJobs({ isProcessAlive: (pid) => pid === 222 || pid === 333 });
    assert.deepStrictEqual(result, { removed: 2, active: 1, ignored: 1, failures: 0 });
    assert.strictEqual(fs.existsSync(abandoned), false);
    assert.strictEqual(fs.existsSync(active), true);
    assert.strictEqual(fs.existsSync(stalePid), false);
    assert.strictEqual(fs.existsSync(unknown), true);

    const unsafeRoot = path.join(base, 'jobs-root-is-file');
    fs.writeFileSync(unsafeRoot, 'not a directory');
    assert.throws(() => cleanupAbandonedWorkingJobs({ root: unsafeRoot }), /kein sicherer lokaler Ordner/);
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
