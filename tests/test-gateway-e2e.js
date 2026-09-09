'use strict';

// Internal gateway integrity integration, including explicitly historical
// Input-queue and visual-approval facades. OCR is adapted for source-only CI.
// This is NOT the public MCP/host E2E contract: test-mcp-protocol.js checks
// the actual tool surface, which cannot approve or read original image pixels.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('node:child_process');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');

const runtimeDir = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-v32-e2e-'));
process.env.EU_PRIVACY_ROOT = root;
process.env.LOCALAPPDATA = path.join(root, 'localapp');
// Bind the cross-platform test explicitly. LOCALAPPDATA is authoritative only
// on Windows; without this root Linux would retain audit fixtures below the
// real user data directory and contaminate later count assertions.
process.env.EU_PRIVACY_DATA_ROOT = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg');

const { encodePng } = require(path.join(runtimeDir, 'image-sanitizer.js'));
const gateway = require(path.join(runtimeDir, 'gateway.js'));
const orchestrator = require(path.join(runtimeDir, 'gateway', 'orchestrator.js'));
const pii = require(path.join(runtimeDir, 'pii-engine.js'));
const { splitReviewId, approveReviewAsset } = require(path.join(runtimeDir, 'gateway', 'review.js'));
const { migrateLegacyInputV1 } = require(path.join(runtimeDir, 'gateway', 'legacy-input-migration.js'));

const suite = createSuite('Gateway internal integrity (including legacy facades)');
const { done, assert } = suite;

function clearInput() {
  const input = path.join(root, 'Input');
  if (!fs.existsSync(input)) return;
  for (const name of fs.readdirSync(input)) {
    fs.rmSync(path.join(input, name), { recursive: true, force: true });
  }
}

function test(name, fn) {
  suite.test(name, () => {
    try { return fn(); } finally { clearInput(); }
  });
}

function testAsync(name, fn) {
  return suite.testAsync(name, async () => {
    try { return await fn(); } finally { clearInput(); }
  });
}

const fixtures = path.join(__dirname, 'fixtures');
const blankPng = encodePng({ width: 300, height: 120, rgba: Buffer.alloc(300 * 120 * 4, 255) });

function isolatedMarkerDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-migration-marker-'));
}

// `pii` alternates between a page with PII and a clean page so that the
// redaction path and its verification pass are both exercised.
function depsFor(mode) {
  let count = 0;
  return {
    rasterizeToPng: async () => blankPng,
    ocrPngDetailed: async () => {
      if (mode !== 'pii') return { text: '', words: [] };
      count++;
      if (count % 2 === 0) return { text: '', words: [] };
      return {
        text: 'Kunde: Max Mustermann max@example.de',
        words: [
          { text: 'Kunde:', bbox: { x0: 10, y0: 10, x1: 50, y1: 30 } },
          { text: 'Max', bbox: { x0: 55, y0: 10, x1: 90, y1: 30 } },
          { text: 'Mustermann', bbox: { x0: 95, y0: 10, x1: 170, y1: 30 } },
          { text: 'max@example.de', bbox: { x0: 10, y0: 40, x1: 160, y1: 60 } }
        ]
      };
    }
  };
}

function queue(src, name) {
  fs.mkdirSync(path.join(root, 'Input'), { recursive: true });
  const dest = path.join(root, 'Input', name || path.basename(src));
  fs.copyFileSync(src, dest);
  return dest;
}

function queueBuffer(name, data) {
  fs.mkdirSync(path.join(root, 'Input'), { recursive: true });
  const dest = path.join(root, 'Input', name);
  fs.writeFileSync(dest, data);
  return dest;
}

function currentQueue() {
  const input = path.join(root, 'Input');
  if (!fs.existsSync(input)) return [];
  return fs.readdirSync(input, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => {
      const full = path.join(input, entry.name);
      return { name: entry.name, full, stat: fs.lstatSync(full) };
    })
    .sort((left, right) => left.stat.mtimeMs - right.stat.mtimeMs);
}

const gw = {
  ...gateway,
  approveReviewAsset(reviewId, confirmed) {
    return approveReviewAsset(reviewId, confirmed);
  },
  anonymizeNext(profile, deps = {}) {
    return orchestrator.anonymizeNext(profile, { inputQueue: currentQueue(), ...deps });
  },
  async anonymizeAll(profile, deps = {}) {
    const queue = currentQueue();
    const results = [];
    for (let index = 0; index < queue.length; index++) {
      try {
        const result = await orchestrator.anonymizeNext(profile, { ...deps, inputQueue: [queue[index]] });
        results.push({ index: index + 1, status: 'released', package_id: result.package_id });
      } catch (error) {
        results.push({ index: index + 1, status: 'stopped', message: error.message });
      }
    }
    const released = results.filter((result) => result.status === 'released').length;
    return { ok: released > 0, input_documents_seen: queue.length, batch_total: queue.length,
      attempted: queue.length, automatic_retries: 0, released, stopped: queue.length - released,
      remaining: 0, results, raw_content_sent_to_claude: false };
  }
};

function sourceIdentity(file) {
  const stat = fs.lstatSync(file);
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  };
}

function assertSourceUnchanged(file, before, message) {
  assert.deepStrictEqual(sourceIdentity(file), before, message);
}

function readPackage(result) {
  const dir = path.join(root, 'Output', result.package_id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return { dir, manifest, markdown: fs.readFileSync(path.join(dir, manifest.document), 'utf8') };
}

function retainedAuditCount() {
  const dir = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'audit');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')).length : 0;
}

async function main() {
  test('versioned migration preserves an abandoned hidden claim without overwriting a newer file', () => {
    const input = path.join(root, 'Input');
    const jobs = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'jobs');
    fs.mkdirSync(input, { recursive: true });
    fs.mkdirSync(jobs, { recursive: true });
    const jobId = 'recover_12345678';
    const hidden = path.join(input, `.processing_${jobId}_collision.txt`);
    fs.writeFileSync(hidden, 'abandoned-private-source');
    fs.writeFileSync(path.join(input, 'collision.txt'), 'newer-user-source');
    const jobDir = path.join(jobs, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, '.owner.json'), JSON.stringify({
      pid: 2147483647,
      created_at: new Date().toISOString(),
      nonce: 'a'.repeat(32)
    }));

    const marker = path.join(isolatedMarkerDir(), 'legacy-input-v1.json');
    const result = migrateLegacyInputV1({ input, jobs, marker, isProcessAlive: () => false });
    assert.strictEqual(result.state, 'complete');
    assert.strictEqual(result.claims_preserved, 1);
    assert.strictEqual(result.active, 0);
    assert.strictEqual(result.failures, 0);
    assert.strictEqual(fs.readFileSync(path.join(input, 'collision.txt'), 'utf8'), 'newer-user-source');
    assert.strictEqual(
      fs.readFileSync(path.join(input, 'collision_wiederhergestellt_2.txt'), 'utf8'),
      'abandoned-private-source'
    );
    assert.strictEqual(fs.existsSync(hidden), true, 'the historical source object remains preserved');
    fs.unlinkSync(path.join(input, 'collision.txt'));
    fs.unlinkSync(path.join(input, 'collision_wiederhergestellt_2.txt'));
    fs.rmSync(jobDir, { recursive: true, force: true });
  });

  test('versioned migration never follows a hidden symlink or steals an active claim', () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-recovery-'));
    const input = path.join(isolated, 'Input');
    const jobs = path.join(isolated, 'jobs');
    fs.mkdirSync(input);
    fs.mkdirSync(jobs);
    const activeId = 'active_12345678';
    const activeClaim = path.join(input, `.processing_${activeId}_active.txt`);
    fs.writeFileSync(activeClaim, 'active-private-source');
    const activeJob = path.join(jobs, activeId);
    fs.mkdirSync(activeJob);
    fs.writeFileSync(path.join(activeJob, '.owner.json'), JSON.stringify({
      pid: process.pid,
      created_at: new Date().toISOString(),
      nonce: 'b'.repeat(32)
    }));
    const outside = path.join(isolated, 'outside.txt');
    fs.writeFileSync(outside, 'outside-private-source');
    const symlink = path.join(input, '.processing_link_12345678_link.txt');
    let symlinkCreated = false;
    try { fs.symlinkSync(outside, symlink, 'file'); symlinkCreated = true; } catch { /* restricted host */ }

    const markerDir = path.join(isolated, 'migrations');
    fs.mkdirSync(markerDir);
    const result = migrateLegacyInputV1({ input, jobs, marker: path.join(markerDir, 'legacy-input-v1.json'), isProcessAlive: () => true });
    assert.strictEqual(result.active, 1);
    assert.strictEqual(result.claims_preserved, 0);
    assert.strictEqual(fs.existsSync(activeClaim), true);
    assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'outside-private-source');
    if (symlinkCreated) {
      assert.strictEqual(result.failures, 1);
      assert.strictEqual(fs.lstatSync(symlink).isSymbolicLink(), true);
    }
    fs.rmSync(isolated, { recursive: true, force: true });
  });

  await testAsync('a mixed batch continues after one file fails and returns no filenames', async () => {
    const blocked = queueBuffer('01-scan.png', blankPng);
    queueBuffer('02-customer.txt', 'Kunde: Max Mustermann\nE-Mail: max@example.de\nTicket: Zugang gesperrt');
    const result = await gw.anonymizeAll('auto', depsFor('clean'));
    assert.strictEqual(result.input_documents_seen, 2);
    assert.strictEqual(result.attempted, 2);
    assert.strictEqual(result.automatic_retries, 0);
    assert.strictEqual(result.released, 1);
    assert.strictEqual(result.stopped, 1);
    assert.strictEqual(result.results.length, 2);
    assert.ok(result.results.some((item) => item.status === 'released'));
    assert.ok(result.results.some((item) => item.status === 'stopped'));
    assert.doesNotMatch(JSON.stringify(result), /01-scan|02-customer|Max Mustermann|max@example/i);
    const diagnostic = gw.diagnosticStatus();
    assert.ok(diagnostic.events.some((event) => event.error_code === 'FORMAT_COVERAGE_UNVERIFIED'));
    assert.doesNotMatch(JSON.stringify(diagnostic), /01-scan|02-customer|Max Mustermann|max@example/i);
    assert.strictEqual(fs.existsSync(blocked), true, 'the failed source must remain in Input');
    fs.unlinkSync(blocked);
  });

  await testAsync('a batch stops an ambiguous personnel file without UI and continues with the next file', async () => {
    const blocked = queueBuffer('01-ambiguous.txt', 'Microsoft Azure Administrator Associate');
    queueBuffer('02-safe.txt', 'Rolle: Softwarearchitekt\nSkills: Java, SQL');
    const result = await gw.anonymizeAll('personnel_profile', depsFor('clean'));
    assert.strictEqual(result.released, 1);
    assert.strictEqual(result.stopped, 1);
    assert.match(result.results.find((item) => item.status === 'stopped').message, /lokale Entscheidung/);
    assert.doesNotMatch(JSON.stringify(result), /Microsoft|01-ambiguous|02-safe/);
    assert.ok(fs.existsSync(blocked));
    fs.unlinkSync(blocked);
  });

  await testAsync('resumable single-file calls skip earlier stops without retrying them', async () => {
    const blocked = queueBuffer('01-scan.png', blankPng);
    queueBuffer('02-first.txt', 'Kunde: Max Mustermann\nE-Mail: max@example.de\nTicket: Erster Fall');
    queueBuffer('03-second.txt', 'Kunde: Erika Musterfrau\nE-Mail: erika@example.de\nTicket: Zweiter Fall');

    await assert.rejects(
      () => gw.anonymizeNext('auto', { ...depsFor('clean'), queueIndex: 0 }),
      (error) => error.code === 'FORMAT_COVERAGE_UNVERIFIED'
    );
    const first = await gw.anonymizeNext('auto', { ...depsFor('clean'), queueIndex: 1 });
    const second = await gw.anonymizeNext('auto', { ...depsFor('clean'), queueIndex: 2 });

    assert.ok(first.ok && second.ok);
    assert.strictEqual(fs.existsSync(blocked), true, 'the stopped source remains available for an explicit retry');
    assert.deepStrictEqual(
      fs.readdirSync(path.join(root, 'Input')).filter((name) => !name.startsWith('.')),
      ['01-scan.png', '02-first.txt', '03-second.txt'],
      'every source remains available while explicit queue positions prevent retries'
    );
    fs.unlinkSync(blocked);
  });

  await testAsync('a document-wide visual timeout restores the source and publishes no partial package', async () => {
    const source = queueBuffer('visual-timeout.txt', 'safe professional content');
    const outputDir = path.join(root, 'Output');
    const reviewDir = path.join(root, 'Needs Visual Review');
    const outputsBefore = fs.existsSync(outputDir) ? fs.readdirSync(outputDir).length : 0;
    const reviewsBefore = fs.existsSync(reviewDir) ? fs.readdirSync(reviewDir).length : 0;
    let ocrCalls = 0;
    await assert.rejects(gw.anonymizeNext('customer', {
      totalTimeoutMs: 1000,
      convertDocument: async () => ({
        markdown: '# Fachinhalt\n\nRolle: Product Owner', warnings: [],
        attachments: [1, 2].map((n) => ({
          type: 'image', mimeType: 'image/png', extension: 'png', name: `image${n}.png`,
          data: blankPng.toString('base64')
        }))
      }),
      ocrPngDetailed: async () => {
        ocrCalls++;
        if (ocrCalls === 1) return depsFor('clean').ocrPngDetailed();
        return new Promise(() => {});
      }
    }), /kein vollständiges Output-Paket/);
    assert.strictEqual(ocrCalls, 2, 'the timeout must exercise the second visual, not expire during setup');
    assert.strictEqual(fs.existsSync(source), true, 'source must be restored to Input');
    assert.strictEqual(fs.readdirSync(outputDir).length, outputsBefore, 'no partial package may remain');
    assert.strictEqual(fs.readdirSync(reviewDir).length, reviewsBefore, 'no partial review item may remain');
    fs.unlinkSync(source);
  });

  await testAsync('a cooperative cancellation after claiming restores the source and leaves no hidden claim', async () => {
    const source = queueBuffer('cancelled.txt', 'Kunde: Max Mustermann\nTicket: Abbruchtest');
    const selected = { name: path.basename(source), full: source, stat: fs.statSync(source) };
    const controller = new AbortController();
    await assert.rejects(
      () => gw.anonymizeNext('customer', {
        ...depsFor('none'),
        inputQueue: [selected],
        abortSignal: controller.signal,
        onClaimed: async () => controller.abort()
      }),
      (error) => error.code === 'REQUEST_CANCELLED'
    );
    assert.strictEqual(fs.existsSync(source), true);
    assert.deepStrictEqual(
      fs.readdirSync(path.join(root, 'Input')).filter((name) => name.startsWith('.processing_')),
      []
    );
    fs.unlinkSync(source);
  });

  await testAsync('a TXT customer record becomes a verified text-only package', async () => {
    queueBuffer('synthetic-customer.txt', 'Kunde: Max Mustermann\nE-Mail: max@example.de\nTicket: Zugang gesperrt');
    const result = await gw.anonymizeNext('customer', {
      ...depsFor('pii'),
      recordDiagnostic() { throw new Error('diagnostic storage unavailable'); }
    });
    assert.ok(result.ok);
    assert.strictEqual(result.visual_assets.included, 0);

    const { manifest, markdown } = readPackage(result);
    assert.strictEqual(manifest.schema, 'eu-privacy-package/3');
    assert.deepStrictEqual(manifest.document_result, {
      schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null
    });
    assert.deepStrictEqual(result.document_result, manifest.document_result);
    assert.match(result.read_capability, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(Date.parse(result.read_capability_expires_at) > Date.now());
    assert.doesNotMatch(JSON.stringify(manifest), /read_capability/i, 'read grants must never be persisted');
    assert.strictEqual(manifest.verification.runtime_mode, 'host_node');
    assert.strictEqual(manifest.verification.runtime_target, null);
    assert.strictEqual(manifest.verification.runtime_dependency_install, true);
    assert.strictEqual(manifest.verification.host_node_required, true);
    assert.strictEqual(manifest.verification.text_residual_pii, 'passed');
    assert.strictEqual(manifest.verification.residual_gate_checked_dictionary_literals, true);
    assertAbsent(markdown, 'Max Mustermann', 'customer name');
    assertAbsent(markdown, 'max@example.de', 'mail address');
    assertPresent(markdown, '[PERSON_001]', 'person pseudonym');

    const packageAudit = JSON.parse(
      fs.readFileSync(path.join(root, 'Output', result.package_id, 'audit.json'), 'utf8')
    );
    assert.match(packageAudit.operation_id, /^[0-9a-f-]{36}$/i, 'audit needs a random receipt id');
    assert.strictEqual(packageAudit.schema, 'data-secure-audit-receipt/4');
    assert.strictEqual(packageAudit.result, 'released');
    assert.deepStrictEqual(packageAudit.document_result, manifest.document_result);
    assert.strictEqual(result.operation_id, packageAudit.operation_id);
    assert.strictEqual(manifest.operation_id, packageAudit.operation_id);
    assert.strictEqual(result.audit_receipt_retained, true);
    assert.match(packageAudit.source_size_class, /^(tiny|small|medium|large)$/);
    assert.strictEqual(packageAudit.source_bytes, undefined, 'exact input size must not persist');
    assert.strictEqual(packageAudit.source_sha256, undefined, 'source fingerprint must not persist');
    assert.strictEqual(packageAudit.output_sha256, undefined, 'output hash belongs only in the package manifest');
    assert.doesNotMatch(
      JSON.stringify(packageAudit),
      /value_hash|source_sha|output_sha/i,
      'audit receipt must contain no content-derived fingerprints'
    );

    const auditDir = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'audit');
    const retainedReceipt = fs
      .readdirSync(auditDir)
      .map((name) => JSON.parse(fs.readFileSync(path.join(auditDir, name), 'utf8')))
      .find((receipt) => receipt.operation_id === packageAudit.operation_id);
    assert.deepStrictEqual(retainedReceipt, packageAudit, 'retained audit must use the same metadata-only receipt');

    const read = gw.readOutput(result.package_id, result.read_capability);
    assert.strictEqual(read.content_is_verified_anonymized_markdown, true);

    const assets = gw.listAssets(result.package_id, result.read_capability);
    assert.strictEqual(assets.assets.length, 0);
  });

  await testAsync('TXT, Markdown, CSV and DOCX sources remain byte- and identity-stable after release', async () => {
    const cases = [
      ['readonly-success.txt', Buffer.from('Kunde: Max Mustermann\nRolle: Product Owner', 'utf8'), 'customer'],
      ['readonly-success.md', Buffer.from('# Profil\n\nName: Erika Beispiel\n\nRolle: Scrum Master', 'utf8'), 'personnel_profile'],
      ['readonly-success.csv', Buffer.from('Name;Rolle\nJana Beispiel;Testmanagerin', 'utf8'), 'personnel_profile'],
      ['readonly-success.docx', fs.readFileSync(path.join(fixtures, 'synthetic_profile.docx')), 'personnel_profile']
    ];
    for (const [name, bytes, profile] of cases) {
      const source = queueBuffer(name, bytes);
      const before = sourceIdentity(source);
      const selected = { name, full: source, stat: fs.lstatSync(source) };
      const result = await gw.anonymizeNext(profile, {
        ...depsFor('none'),
        inputQueue: [selected]
      });
      assert.strictEqual(result.ok, true, name);
      assert.strictEqual(result.original_moved_to_processed, false, name);
      assertSourceUnchanged(source, before, `${name} source mutation`);
    }
  });

  await testAsync('abort and pipeline failures remove only private copies and never mutate the source', async () => {
    const phases = [
      ['abort', (source, selected) => {
        const controller = new AbortController();
        return gw.anonymizeNext('customer', {
          ...depsFor('none'), inputQueue: [selected], abortSignal: controller.signal,
          onClaimed: async () => controller.abort()
        });
      }],
      ['convert', (_source, selected) => gw.anonymizeNext('customer', {
        ...depsFor('none'), inputQueue: [selected],
        convertDocument: async () => { throw new Error('injected convert failure'); }
      })],
      ['before-publish', (_source, selected) => gw.anonymizeNext('customer', {
        ...depsFor('none'), inputQueue: [selected],
        beforePublish: async () => { throw new Error('injected pre-publish failure'); }
      })],
      ['publish', (_source, selected) => gw.anonymizeNext('customer', {
        ...depsFor('none'), inputQueue: [selected],
        publishPackage: () => { throw new Error('injected publish failure'); }
      })],
      ['after-publish', (_source, selected) => gw.anonymizeNext('customer', {
        ...depsFor('none'), inputQueue: [selected],
        afterPublish: async () => { throw new Error('injected post-publish failure'); }
      })]
    ];
    for (const [phase, run] of phases) {
      const source = queueBuffer(`readonly-${phase}.txt`, `Kunde: Max Mustermann\nPhase: ${phase}`);
      const before = sourceIdentity(source);
      const selected = { name: path.basename(source), full: source, stat: fs.lstatSync(source) };
      await assert.rejects(() => run(source, selected), /sicher|abgebrochen|veröffentlicht/u, phase);
      assertSourceUnchanged(source, before, `${phase} source mutation`);
    }
  });

  await testAsync('a batch publication commit survives a later callback failure for deterministic adoption', async () => {
    const source = queueBuffer('durable-batch-publication.txt', 'Kunde: Max Mustermann');
    const selected = { name: path.basename(source), full: source, stat: fs.lstatSync(source) };
    const packageId = `ds_${'9'.repeat(32)}`;
    await assert.rejects(() => gw.anonymizeNext('customer', {
      ...depsFor('none'),
      inputQueue: [selected],
      packageId,
      retainPublishedOnAfterPublishFailure: true,
      afterPublish: async () => { throw new Error('synthetic journal callback failure'); }
    }), /sicher|gestoppt/u);
    const published = path.join(root, 'Output', packageId);
    assert.ok(fs.existsSync(path.join(published, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(published, `${packageId}.md`)));
  });

  for (const [name, fixture] of [['XLSX', 'synthetic_customer.xlsx'], ['PPTX', 'synthetic_contract.pptx']]) {
    await testAsync(`${name} uses the Cowork Markdown-first path even for legacy callers without a channel field`, async () => {
      const source = queue(path.join(fixtures, fixture));
      const before = sourceIdentity(source);
      const result = await gw.anonymizeNext('contract', depsFor('pii'));
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.privacy_scope, 'extracted-markdown-only');
      assert.strictEqual(result.source_extraction_coverage.status, 'incomplete');
      assert.ok(result.source_extraction_coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
      assert.ok(fs.existsSync(source));
      assertSourceUnchanged(source, before, `${name} source mutation`);
    });
  }

  await testAsync('any parser warning stops a DOCX before release', async () => {
    const source = queue(path.join(fixtures, 'synthetic_profile.docx'), 'warning.docx');
    const before = gw.listOutputs().packages.length;
    await assert.rejects(
      () => gw.anonymizeNext('personnel_profile', {
        convertDocument: async () => ({ markdown: 'Name: Max Mustermann', attachments: [], warnings: ['unknown OOXML part'] })
      }),
      (error) => error.code === 'PARSER_COVERAGE_UNVERIFIED'
    );
    assert.strictEqual(gw.listOutputs().packages.length, before);
    assert.ok(fs.existsSync(source));
    fs.unlinkSync(source);
  });

  await testAsync('real DOCX revision, missing-comment and branch-spoof inputs stop across the isolated parser before publication', async () => {
    const fixtures = require('./lib/docx-review-fixtures');
    const cases = [
      ['revision', fixtures.reviewDocx(fixtures.propertyRevisions()[0][1]), 'PARSER_COVERAGE_UNVERIFIED'],
      ['comment', fixtures.reviewDocx(fixtures.annotatedParagraph()), 'PARSER_COVERAGE_UNVERIFIED'],
      ['branch', fixtures.invalidAlternateDocx(), 'PARSE_FAILED']
    ];
    const beforePackages = gw.listOutputs().packages.length;
    let publications = 0;
    for (const [name, bytes, code] of cases) {
      const source = queueBuffer(`docx-structure-${name}.docx`, bytes);
      const before = sourceIdentity(source);
      const selected = { name: path.basename(source), full: source, stat: fs.lstatSync(source) };
      await assert.rejects(() => orchestrator.anonymizeNext('general', {
        inputQueue: [selected], beforePublish() { publications++; }
      }), error => error.code === code && !/Erika|Beispiel|BODY_|WRONG_SELECTED/u.test(error.message));
      assertSourceUnchanged(source, before, `${name}: the selected DOCX original remains untouched`);
    }
    assert.strictEqual(publications, 0);
    assert.strictEqual(gw.listOutputs().packages.length, beforePackages);
  });

  await testAsync('a PDF is stopped before release while coverage remains unverified', async () => {
    const source = queue(path.join(fixtures, 'synthetic_customer.pdf'));
    const before = gw.listOutputs().packages.length;
    await assert.rejects(
      () => gw.anonymizeNext('customer', depsFor('none')),
      (error) => error.code === 'PDF_COVERAGE_UNVERIFIED'
    );
    assert.strictEqual(gw.listOutputs().packages.length, before, 'PDF must not publish a package');
    assert.ok(fs.existsSync(source), 'the stopped PDF must be restored to Input');
    fs.unlinkSync(source);
  });

  await testAsync('a standalone image remains blocked in the pilot', async () => {
    const src = queueBuffer('auto-profile-scan.png', blankPng);
    await assert.rejects(
      () => gw.anonymizeNext('auto', depsFor('pii')),
      (error) => error.code === 'FORMAT_COVERAGE_UNVERIFIED'
    );
    assert.ok(fs.existsSync(src), 'the image must be restored to Input after the fail-closed stop');
    fs.unlinkSync(src);
  });

  await testAsync('a Markdown source takes the same isolated privacy path as TXT without fetching references', async () => {
    const source = queueBuffer(
      'released-markdown.md',
      Buffer.from('# Interne Notiz\n\nKontakt: Max Mustermann\n\n![extern](https://example.invalid/image.png)\n', 'utf8')
    );
    const result = await gw.anonymizeNext('auto', depsFor('none'));
    assert.strictEqual(result.ok, true);
    const { markdown } = readPackage(result);
    assertAbsent(markdown, 'Max Mustermann', 'Markdown contact');
    assertPresent(markdown, '[PERSON_001]', 'Markdown pseudonym');
    assertPresent(markdown, 'https://example.invalid/image.png', 'inert Markdown reference');
    assert.strictEqual(fs.existsSync(source), true, 'released Markdown must remain unchanged at its source path');
  });

  await testAsync('the long .markdown extension uses the same isolated privacy path as .md', async () => {
    const source = queueBuffer(
      'released-markdown-long.markdown',
      Buffer.from('# Interne Notiz\n\nKontakt: Erika Beispiel\n\nRolle: Business Analystin\n', 'utf8')
    );
    const result = await gw.anonymizeNext('auto', depsFor('none'));
    assert.strictEqual(result.ok, true);
    const { markdown } = readPackage(result);
    assertAbsent(markdown, 'Erika Beispiel', 'long Markdown contact');
    assertPresent(markdown, '[PERSON_001]', 'long Markdown pseudonym');
    assertPresent(markdown, 'Business Analystin', 'long Markdown role');
    assert.strictEqual(fs.existsSync(source), true, 'the long Markdown source must remain available after release');
  });

  await testAsync('a CSV source is converted locally into anonymized Markdown without evaluating cells', async () => {
    const source = queueBuffer(
      'released-table.csv',
      Buffer.from('Name;Rolle;Projekt\nMax Mustermann;Product Owner;Klinikportal\nErika Beispiel;Testmanagerin;Telematik\n', 'utf8')
    );
    const result = await gw.anonymizeNext('auto', depsFor('none'));
    assert.strictEqual(result.ok, true);
    const { markdown } = readPackage(result);
    assertAbsent(markdown, 'Max Mustermann', 'CSV contact');
    assertAbsent(markdown, 'Erika Beispiel', 'CSV contact');
    assertPresent(markdown, '[PERSON_001]', 'CSV pseudonym');
    assertPresent(markdown, 'Product Owner', 'CSV professional role');
    assertPresent(markdown, 'Klinikportal', 'CSV professional content');
    assert.strictEqual(fs.existsSync(source), true, 'the released CSV source must never be moved or deleted');
  });

  await testAsync('contact URI formulas in a CSV remain inert while their visible PII is anonymized end to end', async () => {
    const source = queueBuffer(
      'released-contact-formulas.csv',
      Buffer.from([
        'Kontakt',
        '"=HYPERLINK(""mailto:max.mustermann@example.de"",""Max Mustermann"")"',
        '"=HYPERLINK(""mailto:erika%2Ebeispiel%40example%2Ede"",""Erika Beispiel"")"',
        '"=HYPERLINK(""tel:+49 170 1234567"",""Erika Beispiel"")"',
        '"=HYPERLINK(""sip:jana.beispiel%40example%2Ede"",""Jana Beispiel"")"'
      ].join('\n'), 'utf8')
    );
    const result = await gw.anonymizeNext('personnel_profile', depsFor('none'));
    assert.strictEqual(result.ok, true);
    const { markdown } = readPackage(result);
    for (const value of ['Max Mustermann', 'max.mustermann@example.de', 'erika%2Ebeispiel%40example%2Ede', 'Erika Beispiel', '+49 170 1234567', 'Jana Beispiel', 'jana.beispiel%40example%2Ede']) {
      assertAbsent(markdown, value, 'CSV formula contact PII');
    }
    assertPresent(markdown, '=HYPERLINK(', 'inert CSV formula source');
    assert.strictEqual(fs.existsSync(source), true, 'privacy verification must not mutate the CSV source');
  });

  await testAsync('every recognised but unreleased image format stops before any claim or package', async () => {
    const outputDir = path.join(root, 'Output');
    const processedDir = path.join(root, 'Processed');
    const reviewDir = path.join(root, 'Needs Visual Review');
    const count = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    const before = {
      output: count(outputDir), processed: count(processedDir), review: count(reviewDir)
    };
    const samples = [
      ['unreleased-image.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
      ['unreleased-image.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
      ['unreleased-image.bmp', Buffer.from('BM', 'ascii')]
    ];
    for (const [name, bytes] of samples) {
      const source = queueBuffer(name, bytes);
      await assert.rejects(
        () => gw.anonymizeNext('auto', depsFor('none')),
        (error) => error.code === 'FORMAT_COVERAGE_UNVERIFIED'
      );
      assert.strictEqual(fs.existsSync(source), true, `${path.extname(name)} stays untouched in Input`);
      fs.unlinkSync(source);
    }
    assert.strictEqual(count(outputDir), before.output, 'unreleased formats create no output package');
    assert.strictEqual(count(processedDir), before.processed, 'unreleased formats never move to Processed');
    assert.strictEqual(count(reviewDir), before.review, 'unreleased formats create no visual review copy');
  });

  await testAsync('a scanned PDF cannot bypass the PDF coverage gate through an embedded JPEG', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const scan = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n' +
        `2 0 obj << /Subtype /Image /Filter /DCTDecode /Length ${jpeg.length} >> stream\n` +
        jpeg.toString('latin1') +
        '\nendstream endobj\n%%EOF\n',
      'latin1'
    );
    const source = queueBuffer('synthetic-scan.pdf', scan);
    const before = gw.listOutputs().packages.length;
    await assert.rejects(
      () => gw.anonymizeNext('customer', depsFor('pii')),
      (error) => error.code === 'PDF_COVERAGE_UNVERIFIED'
    );
    assert.strictEqual(gw.listOutputs().packages.length, before);
    assert.ok(fs.existsSync(source), 'the scanned PDF must be restored to Input');
    fs.unlinkSync(source);
  });

  await testAsync('a PDF renamed as TXT is restored byte-identically and publishes nothing', async () => {
    const bytes = fs.readFileSync(path.join(fixtures, 'synthetic_customer.pdf'));
    const source = queueBuffer('renamed-pdf.txt', bytes);
    const before = {
      output: fs.readdirSync(path.join(root, 'Output')).length,
      processed: fs.readdirSync(path.join(root, 'Processed')).length,
      review: fs.readdirSync(path.join(root, 'Needs Visual Review')).length
    };
    await assert.rejects(
      () => gw.anonymizeNext('customer', depsFor('none')),
      (error) => error.code === 'PDF_COVERAGE_UNVERIFIED'
    );
    assert.deepStrictEqual(fs.readFileSync(source), bytes);
    assert.strictEqual(fs.readdirSync(path.join(root, 'Output')).length, before.output);
    assert.strictEqual(fs.readdirSync(path.join(root, 'Processed')).length, before.processed);
    assert.strictEqual(fs.readdirSync(path.join(root, 'Needs Visual Review')).length, before.review);
    fs.unlinkSync(source);
  });

  await testAsync('a DOCX profile is auto-detected and its visual is withheld', async () => {
    queue(path.join(fixtures, 'synthetic_profile.docx'));
    const result = await gw.anonymizeNext('auto', depsFor('none'));
    assert.ok(result.ok);
    assert.strictEqual(result.profile, 'personnel_profile');
    assert.strictEqual(result.profile_detection, 'local-auto');
    assert.strictEqual(result.visual_assets.total, 1);
    assert.strictEqual(result.visual_assets.included, 0);
    assert.strictEqual(result.visual_assets.review_required, 1);

    const { manifest } = readPackage(result);
    assert.strictEqual(manifest.document_result.grade, 'usable-with-omissions');
    assert.deepStrictEqual(manifest.document_result.omissions, [{
      code: 'VISUAL_ASSETS_WITHHELD_LOCALLY', count: 1
    }]);
    assert.deepStrictEqual(result.document_result, manifest.document_result);

    const { markdown } = readPackage(result);
    for (const value of ['MAX MUSTERMANN', 'Beispiel Consulting GmbH', 'Kunde Alpha GmbH', 'Köln']) {
      assertAbsent(markdown, value, 'identifier');
    }
    assertPresent(markdown, 'Product Owner', 'role must survive');
    assertPresent(markdown, 'Business Analyst', 'role must survive');

    globalThis.__profilePackage = result.package_id;
    globalThis.__profileCapability = result.read_capability;
  });

  await testAsync('a withheld visual is released only after explicit human confirmation', async () => {
    const packageId = globalThis.__profilePackage;
    const readCapability = globalThis.__profileCapability;
    const mine = gw.listReviewItems().items.filter((x) => x.package_id === packageId);
    assert.strictEqual(mine.length, 1);

    assert.throws(() => gw.approveReviewAsset(mine[0].review_id, false), /ausdrücklicher/);
    assert.throws(() => gw.approveReviewAsset(mine[0].review_id, 'yes'), /ausdrücklicher/);

    const reviewDir = path.join(root, 'Needs Visual Review', mine[0].package_id);
    const reviewMeta = path.join(reviewDir, `${mine[0].asset_id}.review.json`);
    const before = JSON.parse(fs.readFileSync(reviewMeta, 'utf8'));
    const preview = path.join(reviewDir, before.preview_file);
    assert.ok(fs.existsSync(preview), 'the local preview must exist before the decision');

    const approval = gw.approveReviewAsset(mine[0].review_id, true);
    assert.ok(approval.ok);
    assert.strictEqual(approval.preview_removed, true);
    assert.match(approval.read_capability, /^[A-Za-z0-9_-]{43}$/u);
    assert.throws(() => gw.listAssets(packageId, readCapability), /verändert|Leseberechtigung/u, 'the pre-approval grant is revoked');
    assert.ok(!fs.existsSync(preview), 'the redundant review preview must be deleted');
    assert.ok(fs.existsSync(reviewMeta), 'the review evidence must remain');
    const after = JSON.parse(fs.readFileSync(reviewMeta, 'utf8'));
    assert.strictEqual(after.approved, false, 'review evidence remains immutable');
    assert.strictEqual(after.preview_file, before.preview_file, 'manifest is the approval source');

    globalThis.__profileCapability = approval.read_capability;
    const released = gw.listAssets(packageId, approval.read_capability);
    assert.strictEqual(released.assets.length, 1);
    assert.ok(gw.readAsset(packageId, approval.read_capability, released.assets[0].asset_id).__image.data.length > 20);
    const retry = gw.approveReviewAsset(mine[0].review_id, true);
    assert.strictEqual(retry.already_approved, true);
    assert.match(retry.read_capability, /^[A-Za-z0-9_-]{43}$/u);
    assert.strictEqual(gw.listAssets(packageId, retry.read_capability).assets.length, 1);
    globalThis.__profileCapability = retry.read_capability;
    globalThis.__profileAsset = released.assets[0];
  });

  await testAsync('a released asset that was modified afterwards is refused', async () => {
    const packageId = globalThis.__profilePackage;
    const readCapability = globalThis.__profileCapability;
    const asset = globalThis.__profileAsset;
    const assetPath = path.join(root, 'Output', packageId, asset.file);
    const original = fs.readFileSync(assetPath);
    try {
      fs.appendFileSync(assetPath, Buffer.from([0]));
      assert.throws(() => gw.readAsset(packageId, readCapability, asset.asset_id), /verändert|Assetgröße/u);
    } finally {
      fs.writeFileSync(assetPath, original);
      original.fill(0);
    }
  });

  await testAsync('approval refuses to re-bless a Markdown file that was tampered with', async () => {
    queue(path.join(fixtures, 'synthetic_profile.docx'), 'tamper-check.docx');
    const result = await gw.anonymizeNext('personnel_profile', depsFor('none'));
    const { dir, manifest } = readPackage(result);

    fs.appendFileSync(path.join(dir, manifest.document), '\nEingeschmuggelter Text');
    const item = gw.listReviewItems().items.find((x) => x.package_id === result.package_id);
    assert.ok(item, 'the profile visual must be in review');
    assert.throws(
      () => gw.approveReviewAsset(item.review_id, true),
      /Markdown-Datei wurde verändert/,
      'approval must not launder a tampered document by rewriting its hash'
    );
  });

  await testAsync('both real product intake channels preserve professional bytes and bind compatibility redaction at publication', async () => {
    for (const channel of ['plugin', 'standalone']) {
      const directory = path.join(root, `identifier-${channel}`);
      fs.mkdirSync(directory);
      const output = execFileSync(process.execPath, [path.join(__dirname, 'lib', 'identifier-product-worker.js'), directory, channel],
        { encoding: 'utf8', windowsHide: true, timeout: 60000 });
      assert.strictEqual(output, `IDENTIFIER PRODUCT ${channel}: PASS\n`);
    }
  });

  for (const profile of ['general', 'customer']) await testAsync(`${profile}: actual package publication cannot retain a telephone URI's overlapping email local part`, async () => {
    const { fullwidth, professionalText } = require('./lib/identifier-compatibility');
    for (const [index, value] of ['tel:03012345678.anna@example.de', fullwidth('tel:03012345678.anna@example.de')].entries()) {
      const source = queueBuffer(`uri-email-${profile}-${index}.txt`, `${professionalText}\n${value}`);
      const original = sourceIdentity(source);
      const expected = `${professionalText}\n[CONTACT_REDACTED]`;
      let published = 0;
      const result = await orchestrator.anonymizeSelectedSource(source, profile, { beforePublish(release) {
        assert.strictEqual(release.reviewed_content_sha256,
          crypto.createHash('sha256').update(expected).digest('hex'));
        published++;
      } });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(published, 1);
      const { manifest, markdown } = readPackage(result);
      assert.strictEqual(manifest.verification.text_residual_pii, 'passed');
      assert.match(markdown, /Datenschutz-Pässe: 1/u);
      const readable = gw.readOutput(result.package_id, result.read_capability, 0, 30000).text;
      assert.strictEqual(readable.slice(readable.indexOf('-->\n\n') + 5).trimEnd(), expected);
      assert.deepStrictEqual(pii.scanResidual(readable, profile), []);
      assertSourceUnchanged(source, original);
    }
  });

  await testAsync('the exact post-review release gate rejects compatibility identifiers reintroduced after anonymization', async () => {
    const { professionalText, identifierCases } = require('./lib/identifier-compatibility');
    const before = gw.listOutputs().packages.length;
    for (const [index, { label, value }] of identifierCases.entries()) {
      const src = queueBuffer(`compatibility-review-${index}.txt`, professionalText);
      const original = sourceIdentity(src);
      let reviewed = 0, published = 0;
      await assert.rejects(() => gw.anonymizeNext('general', {
        inputQueue: [{ name: path.basename(src), full: src, stat: fs.lstatSync(src) }],
        reviewText(input) {
          assert.strictEqual(input.anonymized_text, professionalText);
          reviewed++;
          return { text: `${input.anonymized_text}\n${label}${value}` };
        },
        beforePublish() { published++; }
      }), /Residual-Gate/u);
      assert.strictEqual(reviewed, 1);
      assert.strictEqual(published, 0, 'post-review PII never reaches publication');
      assert.strictEqual(gw.listOutputs().packages.length, before);
      assertSourceUnchanged(src, original, 'failed review preserves the selected original');
    }
  });

  await testAsync('F7 never silently publishes a prose name and binds a reviewed PERSON pseudonym', async () => {
    const { reviewedBatchText } = require('../plugins/data-secure/server/gateway/batch-review-policy');
    const text = 'Anna Berger koordinierte die Einführung.';
    const blocked = queueBuffer('f7-blocked.txt', text);
    await assert.rejects(() => orchestrator.anonymizeSelectedSource(blocked, 'personnel_profile'),
      (error) => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
    fs.unlinkSync(blocked);

    const reviewed = queueBuffer('f7-reviewed.txt', text);
    let reviewCount = 0;
    const result = await orchestrator.anonymizeSelectedSource(reviewed, 'personnel_profile', {
      reviewText(input) {
        reviewCount++;
        assert.strictEqual(input.ambiguous_person_count, undefined);
        assert.strictEqual(input.ambiguities.length, 1);
        assert.strictEqual(input.ambiguities[0].type, 'person_prose_ambiguous');
        return reviewedBatchText(input, input.ambiguities.map((candidate) => ({
          ambiguity_id: candidate.ambiguity_id,
          decision: 'redact'
        })));
      }
    });
    assert.strictEqual(reviewCount, 1);
    const released = gw.readOutput(result.package_id, result.read_capability, 0, 30000).text;
    assert.doesNotMatch(released, /Anna Berger/u);
    assert.match(released, /\[PERSON_001\] koordinierte die Einführung/u);
  });

  await testAsync('a failing residual gate releases nothing and keeps the source file', async () => {
    const before = gw.listOutputs().packages.length;
    const src = queueBuffer('synthetic-failure.txt', 'Kunde: Max Mustermann');

    const original = pii.scanResidual;
    pii.scanResidual = () => [{ type: 'TEST_LEAK' }];
    let error = null;
    try {
      await gw.anonymizeNext('customer', depsFor('none'));
    } catch (e) {
      error = e;
    } finally {
      pii.scanResidual = original;
    }

    assert.ok(error, 'the gate must throw');
    assert.strictEqual(gw.listOutputs().packages.length, before, 'no package may be released');
    assert.ok(fs.existsSync(src), 'the source must stay in Input for a retry');
    const stray = fs.readdirSync(path.join(root, 'Output')).filter((n) => n.startsWith('.'));
    assert.deepStrictEqual(stray, [], 'no staging directory may be left behind');
    fs.unlinkSync(src);
  });

  await testAsync('a failed package publish restores the source and releases nothing', async () => {
    const before = gw.listOutputs().packages.length;
    const auditBefore = retainedAuditCount();
    const src = queueBuffer('publish-failure.txt', 'Kunde: Max Mustermann');
    await assert.rejects(
      () => gw.anonymizeNext('customer', {
        ...depsFor('none'),
        publishPackage: () => {
          throw new Error('injected publish failure');
        }
      }),
      /sicher gestoppt|veröffentlicht/
    );
    assert.strictEqual(gw.listOutputs().packages.length, before, 'failed publish must expose no package');
    assert.strictEqual(retainedAuditCount(), auditBefore, 'failed publish must retain no success receipt');
    assert.ok(fs.existsSync(src), 'the source must be restored to Input');
    const retry = await gw.anonymizeNext('customer', depsFor('none'));
    assert.ok(retry.ok, 'the unchanged source must remain processable on an explicit retry');
    assert.ok(fs.existsSync(src), 'successful retry must leave the source at its original path');
  });

  await testAsync('source-move hooks are unreachable because only private copies are processed', async () => {
    const before = gw.listOutputs().packages.length;
    const auditBefore = retainedAuditCount();
    const src = queueBuffer('move-failure.txt', 'Kunde: Max Mustermann');
    let moveCalls = 0;
    const result = await gw.anonymizeNext('customer', {
      ...depsFor('none'),
      moveProcessed: () => {
        moveCalls++;
        throw new Error('unreachable move hook');
      }
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(moveCalls, 0, 'the normal orchestrator must never call a source-move hook');
    assert.strictEqual(gw.listOutputs().packages.length, before + 1);
    assert.strictEqual(retainedAuditCount(), auditBefore + 1);
    assert.ok(fs.existsSync(src), 'the source must remain at its original Input name');
    assert.deepStrictEqual(
      fs.readdirSync(path.join(root, 'Input')).filter((name) => name.startsWith('.processing_')),
      [],
      'no hidden claimed input may remain'
    );
    fs.unlinkSync(src);
  });

  await testAsync('an empty Input folder is reported rather than treated as an error', async () => {
    for (const f of fs.readdirSync(path.join(root, 'Input'))) {
      fs.unlinkSync(path.join(root, 'Input', f));
    }
    const result = await gw.anonymizeNext('customer', depsFor('none'));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'input_empty');
    assert.strictEqual(result.raw_content_sent_to_claude, false);
  });

  await testAsync('an unresolved legacy audit blocks new processing', async () => {
    await assert.rejects(
      () =>
        gw.anonymizeNext('customer', {
          migrateLegacyAuditReceipts: () => ({ legacy_pending: 1, migration_errors: 1 })
        }),
      /Alte Audit-Nachweise/
    );
  });

  test('a package id may not escape the Output directory', () => {
    for (const id of ['../Processed', '..', '.hidden', 'sub/dir']) {
      assert.throws(() => gw.readOutput(id, 'x'.repeat(43), 0, 1000), /Leseberechtigung/);
      assert.throws(() => gw.issueReadCapability(id), /Paket|Ungültige Paket-ID/);
    }
  });

  test('package ids alone and capabilities from another run cannot disclose a package', () => {
    const packages = gw.listOutputs().packages;
    assert.ok(packages.length >= 2, 'the suite must have at least two released packages');
    const first = globalThis.__profilePackage;
    const second = packages.find((item) => item.package_id !== first).package_id;
    const grant = gw.issueReadCapability(first);
    assert.throws(() => gw.readOutput(first), /Leseberechtigung/);
    assert.throws(() => gw.readOutput(second, grant.read_capability), /Leseberechtigung/);
    assert.strictEqual(gw.readOutput(first, grant.read_capability).package_id, first);
  });

  test('an expired read capability is rejected without consulting package contents', () => {
    const packageId = gw.listOutputs().packages[0].package_id;
    const grant = gw.issueReadCapability(packageId);
    const afterExpiry = Date.parse(grant.read_capability_expires_at) + 1;
    assert.throws(
      () => gw.requireReadCapability(packageId, grant.read_capability, afterExpiry),
      /Leseberechtigung/
    );
  });

  test('a Markdown file that was modified after release is refused', () => {
    const packageId = gw.listOutputs().packages[0].package_id;
    const { document } = JSON.parse(
      fs.readFileSync(path.join(root, 'Output', packageId, 'manifest.json'), 'utf8')
    );
    fs.appendFileSync(path.join(root, 'Output', packageId, document), '\nTAMPER');
    const grant = gw.issueReadCapability(packageId);
    assert.throws(() => gw.readOutput(packageId, grant.read_capability), /verändert/);
  });

  test('review ids are parsed from the end so package names may contain separators', () => {
    assert.deepStrictEqual(splitReviewId('Paket__mit__trenner__asset-001'), {
      pkg: 'Paket__mit__trenner',
      asset: 'asset-001'
    });
    assert.throws(() => splitReviewId('kaputt'), /Ungültige Review-ID/);
    assert.throws(() => splitReviewId('paket__asset-x'), /Ungültige Review-ID/);
  });

  await testAsync('a simulated review-retention failure never aborts anonymization', async () => {
    const locked = path.join(root, 'Processed', 'locked-old.pdf');
    fs.writeFileSync(locked, 'locked');
    const blockedReview = path.join(root, 'Needs Visual Review', 'blocked-review');
    fs.mkdirSync(path.join(blockedReview, 'locked-entry'), { recursive: true });
    fs.utimesSync(blockedReview, new Date(0), new Date(0));
    queueBuffer('cleanup-failure.txt', 'Kunde: Max Mustermann');
    const result = await gw.anonymizeNext('customer', {
      ...depsFor('none'),
      retentionDays: 0
    });
    assert.ok(result.ok, 'cleanup is secondary work and processing must succeed');
    assert.ok(fs.existsSync(locked), 'historical Processed entries are protected permanently');
    assert.ok(fs.existsSync(path.join(blockedReview, 'locked-entry')));
    assert.ok(gw.genericStatus({ retentionDays: 0 }).retention_last_cleanup.errors > 0);
  });

  await testAsync('zero-day batch retention spans intake and the full worker, then preserves results and originals', async () => {
    const batch = require(path.join(runtimeDir, 'gateway', 'batch.js'));
    const { RETENTION_ENV } = require(path.join(runtimeDir, 'gateway', 'retention.js'));
    const { parseDocumentBuffer } = require(path.join(runtimeDir, 'document-parser.js'));
    const previous = process.env[RETENTION_ENV];
    process.env[RETENTION_ENV] = '0';
    try {
      const sources = [queueBuffer('zero-batch-one.txt', 'E-Mail: synthetic.one@example.test\nFachtext bleibt.'),
        queueBuffer('zero-batch-two.txt', 'E-Mail: synthetic.two@example.test\nZweiter Fachtext.')];
      const before = sources.map(sourceIdentity);
      const begun = batch.beginBatch({ expectedCount: sources.length, profile: 'general', queue: sources.map((full) => ({
        name: path.basename(full), full, sourceBytes: fs.statSync(full).size
      })) });
      const token = begun.batch_token;
      const afterIntake = batch._test.readState(token);
      assert.strictEqual(afterIntake.zero_day_work, true);
      assert.ok(Date.parse(afterIntake.expires_at) > Date.parse(afterIntake.created_at));
      assert.strictEqual(batch.claimLocalBatchExecutor(token, process.pid).ok, true);
      const result = await batch.runLocalBatchExecutor(token, {
        executorPid: process.pid,
        convertDocument: async (_source, options) => parseDocumentBuffer(options.inputBuffer, '.txt')
      });
      assert.strictEqual(result.complete, true, JSON.stringify(result));
      assert.strictEqual(result.released, 2, JSON.stringify(result));
      assert.strictEqual(fs.existsSync(batch._test.workPath(token)), false);
      assert.strictEqual(batch._test.readState(token).zero_day_work_cleaned, true);
      assert.ok(batch.completedLocalOnlyCandidates().some((candidate) => candidate.token === token));
      const results = batch.listBatchResults(token);
      assert.strictEqual(results.results.length, 2);
      for (let index = 0; index < sources.length; index++) assertSourceUnchanged(sources[index], before[index]);
    } finally {
      if (previous === undefined) delete process.env[RETENTION_ENV]; else process.env[RETENTION_ENV] = previous;
    }
  });

  await testAsync('zero-day paused batches discard source copies at the worker boundary and cannot silently resume', async () => {
    const batch = require(path.join(runtimeDir, 'gateway', 'batch.js'));
    const { RETENTION_ENV } = require(path.join(runtimeDir, 'gateway', 'retention.js'));
    const previous = process.env[RETENTION_ENV];
    process.env[RETENTION_ENV] = '0';
    try {
      const source = queueBuffer('zero-batch-pause.txt', 'E-Mail: paused.synthetic@example.test');
      const before = sourceIdentity(source);
      const begun = batch.beginBatch({ expectedCount: 1, profile: 'general', queue: [{
        name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size
      }] });
      const token = begun.batch_token;
      assert.strictEqual(batch.claimLocalBatchExecutor(token, process.pid).ok, true);
      const result = await batch.runLocalBatchExecutor(token, {
        executorPid: process.pid,
        convertDocument: async () => { throw Object.assign(new Error('synthetic pause'), { code: 'REQUEST_CANCELLED' }); }
      });
      assert.strictEqual(result.stopped, 1, JSON.stringify(result));
      assert.strictEqual(result.retryable, 0);
      assert.strictEqual(fs.existsSync(batch._test.workPath(token)), false);
      assert.strictEqual(batch._test.readState(token).items[0].checkpoint, 'work_retention_expired');
      assert.strictEqual(batch.resumeBatch(token).ok, false);
      assertSourceUnchanged(source, before);
    } finally {
      if (previous === undefined) delete process.env[RETENTION_ENV]; else process.env[RETENTION_ENV] = previous;
    }
  });

  await testAsync('abandoned zero-day checkpoints are read-only unavailable until locked recovery cleans their own copies', async () => {
    const batch = require(path.join(runtimeDir, 'gateway', 'batch.js'));
    const { RETENTION_ENV } = require(path.join(runtimeDir, 'gateway', 'retention.js'));
    const previous = process.env[RETENTION_ENV];
    process.env[RETENTION_ENV] = '0';
    try {
      const source = queueBuffer('zero-batch-abandoned.txt', 'E-Mail: abandoned.synthetic@example.test');
      const before = sourceIdentity(source);
      const begun = batch.beginBatch({ expectedCount: 1, profile: 'general', queue: [{
        name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size
      }] });
      const token = begun.batch_token;
      const state = batch._test.readStateForMaintenance(token);
      delete state.intake_owner_pid; // synthetic process-loss boundary, no live worker
      batch._test.writeState(state);
      assert.throws(() => batch._test.readState(token), /Originaldateien neu auswählen/u);
      assert.strictEqual(fs.existsSync(batch._test.workPath(token)), true, 'reader must not delete outside the maintenance lock');
      assert.ok(batch.localCleanupStatus().expired_batch_cleanup_pending >= 1);
      assert.ok(!batch._test.recoverableBatchStates().some((candidate) => candidate.token === token));
      batch.recoverBatches();
      assert.strictEqual(fs.existsSync(batch._test.workPath(token)), false);
      assert.strictEqual(batch._test.readState(token).zero_day_work_cleaned, true);
      assert.strictEqual(batch.resumeBatch(token).ok, false);
      assertSourceUnchanged(source, before);
    } finally {
      if (previous === undefined) delete process.env[RETENTION_ENV]; else process.env[RETENTION_ENV] = previous;
    }
  });

  await testAsync('zero-day retention preserves the original and leaves the new package readable', async () => {
    const source = queueBuffer('zero-day.txt', 'Kunde: Max Mustermann');
    const result = await gw.anonymizeNext('customer', { ...depsFor('none'), retentionDays: 0 });
    assert.ok(result.ok);
    assert.strictEqual(gw.readOutput(result.package_id, result.read_capability).package_id, result.package_id);
    assert.ok(fs.existsSync(source), 'zero-day retention must never remove the selected source');
  });

  await testAsync('zero-day retention disables visual approval with an explicit expiry reason', async () => {
    queue(path.join(fixtures, 'synthetic_profile.docx'), 'zero-day-profile.docx');
    const result = await gw.anonymizeNext('personnel_profile', {
      ...depsFor('none'),
      retentionDays: 0
    });
    assert.ok(result.ok);
    assert.strictEqual(result.visual_assets.review_required, 1);
    assert.strictEqual(gw.readOutput(result.package_id, result.read_capability).package_id, result.package_id);

    const item = gw.listReviewItems().items.find((entry) => entry.package_id === result.package_id);
    assert.ok(item, 'the retained evidence must remain discoverable');
    assert.strictEqual(item.preview_available, false);
    assert.throws(
      () => gw.approveReviewAsset(item.review_id, true),
      /Aufbewahrungsfrist/,
      'an expired preview must not be reported as a missing package file'
    );
  });

  test('privacy_status reports the visual bridge honestly', () => {
    const status = gw.genericStatus({ retentionDays: 7 });
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.raw_content_sent_to_claude, false);
    assert.strictEqual(status.text_engine, 'ready');
    const portable = ['darwin', 'linux'].includes(process.platform);
    assert.strictEqual(status.parser_boundary, process.platform === 'win32'
      ? 'windows_job_object'
      : portable ? 'node_permission_process' : 'unavailable');
    assert.strictEqual(status.parser_boundary_reason, portable || process.platform === 'win32' ? 'ok' : 'unsupported_platform');
    assert.ok(['available', 'unavailable'].includes(status.visual_bridge));
    assert.strictEqual(status.visual_boundary,
      process.platform === 'win32' ? 'windows_job_object' : 'unavailable');
    assert.ok(!status.supported_inputs.includes('PDF'));
    assert.deepStrictEqual(status.blocked_inputs, [
      { format: 'PDF', reason: 'PDF_COVERAGE_UNVERIFIED' },
      { format: 'Scan-PDF und Bilder', reason: 'FORMAT_COVERAGE_UNVERIFIED' }
    ]);
    assert.strictEqual(status.retention_days, 7);
    assert.strictEqual(typeof status.retention_due_entries.total, 'number');
    assert.strictEqual(status.retention_due_entries.processed, 0);
    assert.strictEqual(status.retention_processed_cleanup_skipped, true);
    assert.strictEqual(status.retention_processed_protection_complete, true);
    assert.strictEqual(typeof status.retention_protected_processed_entries, 'number');
    assert.ok(status.retention_last_cleanup.ran_at, 'the most recent cleanup result must be visible');
    if (process.platform !== 'win32') {
      assert.strictEqual(status.visual_bridge, 'unavailable', 'the bridge is Windows only');
      assert.strictEqual(status.engine_phase, 'ready_text_only');
    }
  });

  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  done();
}

main();
