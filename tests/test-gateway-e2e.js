'use strict';

// End to end tests through the gateway API that the MCP tools call. The OCR
// bridge is stubbed so the whole pipeline runs on Linux CI as well.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');

const runtimeDir = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-v32-e2e-'));
process.env.EU_PRIVACY_ROOT = root;
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const { encodePng } = require(path.join(runtimeDir, 'image-sanitizer.js'));
const gw = require(path.join(runtimeDir, 'gateway.js'));
const pii = require(path.join(runtimeDir, 'pii-engine.js'));
const { splitReviewId } = require(path.join(runtimeDir, 'gateway', 'review.js'));

const { testAsync, test, done, assert } = createSuite('Gateway end to end');

const fixtures = path.join(__dirname, 'fixtures');
const blankPng = encodePng({ width: 300, height: 120, rgba: Buffer.alloc(300 * 120 * 4, 255) });

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

function readPackage(result) {
  const dir = path.join(root, 'Output', result.package_id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return { dir, manifest, markdown: fs.readFileSync(path.join(dir, manifest.document), 'utf8') };
}

async function main() {
  await testAsync('an XLSX customer sheet becomes a verified package with a released visual', async () => {
    queue(path.join(fixtures, 'synthetic_customer.xlsx'));
    const result = await gw.anonymizeNext('customer', depsFor('pii'));
    assert.ok(result.ok);
    assert.strictEqual(result.visual_assets.included, 1);

    const { manifest, markdown } = readPackage(result);
    assert.strictEqual(manifest.verification.runtime_dependency_install, false);
    assert.strictEqual(manifest.verification.text_residual_pii, 'passed');
    assert.strictEqual(manifest.verification.residual_gate_checked_dictionary_literals, true);
    assertAbsent(markdown, 'Max Mustermann', 'customer name');
    assertAbsent(markdown, 'max@example.de', 'mail address');
    assertPresent(markdown, '[PERSON_001]', 'person pseudonym');

    const read = gw.readOutput(result.package_id);
    assert.strictEqual(read.content_is_verified_anonymized_markdown, true);

    const assets = gw.listAssets(result.package_id);
    assert.strictEqual(assets.assets.length, 1);
    const image = gw.readAsset(result.package_id, assets.assets[0].asset_id);
    assert.ok(image.__image.data.length > 20, 'image payload must be returned');
    assert.strictEqual(image.mime_type, 'image/png');
  });

  await testAsync('a PPTX contract is de-identified including its speaker notes', async () => {
    queue(path.join(fixtures, 'synthetic_contract.pptx'));
    const result = await gw.anonymizeNext('contract', depsFor('pii'));
    assert.ok(result.ok);
    const { markdown } = readPackage(result);
    assertAbsent(markdown, 'Max Mustermann', 'counterparty');
    assertAbsent(markdown, 'Alpha GmbH', 'organisation');
    assertAbsent(markdown, 'max@example.de', 'mail address in notes');
    assertPresent(markdown, 'Haftung und Kündigung', 'contract content must survive');
  });

  await testAsync('a PDF customer record is de-identified without OCR', async () => {
    queue(path.join(fixtures, 'synthetic_customer.pdf'));
    const result = await gw.anonymizeNext('customer', depsFor('none'));
    assert.ok(result.ok);
    const { markdown } = readPackage(result);
    assertAbsent(markdown, 'Max Mustermann', 'customer name');
    assertAbsent(markdown, 'max@example.de', 'mail address');
  });

  await testAsync('a standalone PNG is OCR-redacted and packaged without exposing raw pixels', async () => {
    queueBuffer('synthetic-scan.png', blankPng);
    const result = await gw.anonymizeNext('customer', depsFor('pii'));
    assert.ok(result.ok);
    assert.strictEqual(result.visual_assets.included, 1);
    assert.ok(result.visual_assets.redactions > 0);
    const { markdown } = readPackage(result);
    assertAbsent(markdown, 'Max Mustermann', 'OCR name');
    assertAbsent(markdown, 'max@example.de', 'OCR email');
    assertPresent(markdown, '[PERSON_001]', 'OCR person placeholder');
  });

  await testAsync('an image-only input requires an explicit profile instead of guessing before OCR', async () => {
    const src = queueBuffer('auto-profile-scan.png', blankPng);
    await assert.rejects(
      () => gw.anonymizeNext('auto', depsFor('pii')),
      /Datenschutzprofil ausdrücklich gewählt/
    );
    assert.ok(fs.existsSync(src), 'the image must be restored to Input after the fail-closed stop');
    fs.unlinkSync(src);
  });

  await testAsync('a scanned PDF with an embedded JPEG uses the same OCR privacy gate', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const scan = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n' +
        `2 0 obj << /Subtype /Image /Filter /DCTDecode /Length ${jpeg.length} >> stream\n` +
        jpeg.toString('latin1') +
        '\nendstream endobj\n%%EOF\n',
      'latin1'
    );
    queueBuffer('synthetic-scan.pdf', scan);
    const result = await gw.anonymizeNext('customer', depsFor('pii'));
    assert.ok(result.ok);
    assert.strictEqual(result.visual_assets.included, 1);
    const { markdown } = readPackage(result);
    assertAbsent(markdown, 'Max Mustermann', 'scanned PDF OCR name');
    assertPresent(markdown, '[PERSON_001]', 'scanned PDF OCR placeholder');
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

    const { markdown } = readPackage(result);
    for (const value of ['MAX MUSTERMANN', 'Beispiel Consulting GmbH', 'Kunde Alpha GmbH', 'Köln']) {
      assertAbsent(markdown, value, 'identifier');
    }
    assertPresent(markdown, 'Product Owner', 'role must survive');
    assertPresent(markdown, 'Business Analyst', 'role must survive');

    globalThis.__profilePackage = result.package_id;
  });

  await testAsync('a withheld visual is released only after explicit human confirmation', async () => {
    const packageId = globalThis.__profilePackage;
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
    assert.ok(!fs.existsSync(preview), 'the redundant review preview must be deleted');
    assert.ok(fs.existsSync(reviewMeta), 'the review evidence must remain');
    const after = JSON.parse(fs.readFileSync(reviewMeta, 'utf8'));
    assert.strictEqual(after.approved, true);
    assert.ok(after.approved_at);
    assert.strictEqual(after.preview_file, null);

    const released = gw.listAssets(packageId);
    assert.strictEqual(released.assets.length, 1);
    assert.ok(gw.readAsset(packageId, released.assets[0].asset_id).__image.data.length > 20);
    globalThis.__profileAsset = released.assets[0];
  });

  await testAsync('a released asset that was modified afterwards is refused', async () => {
    const packageId = globalThis.__profilePackage;
    const asset = globalThis.__profileAsset;
    const assetPath = path.join(root, 'Output', packageId, asset.file);
    fs.appendFileSync(assetPath, Buffer.from([0]));
    assert.throws(() => gw.readAsset(packageId, asset.asset_id), /verändert/);
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

  await testAsync('a failing residual gate releases nothing and keeps the source file', async () => {
    const before = gw.listOutputs().packages.length;
    const src = queue(path.join(fixtures, 'synthetic_customer.pdf'), 'synthetic-failure.pdf');

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
    const src = queue(path.join(fixtures, 'synthetic_customer.pdf'), 'publish-failure.pdf');
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
    assert.ok(fs.existsSync(src), 'the source must be restored to Input');
    const retry = await gw.anonymizeNext('customer', depsFor('none'));
    assert.ok(retry.ok, 'the restored source must be processable exactly once on retry');
    assert.ok(!fs.existsSync(src), 'successful retry must move the source out of Input');
  });

  await testAsync('a failed source move restores the claimed input and releases nothing', async () => {
    const before = gw.listOutputs().packages.length;
    const src = queue(path.join(fixtures, 'synthetic_customer.pdf'), 'move-failure.pdf');
    await assert.rejects(
      () => gw.anonymizeNext('customer', {
        ...depsFor('none'),
        moveProcessed: () => {
          throw new Error('injected move failure');
        }
      }),
      /sicher gestoppt/
    );
    assert.strictEqual(gw.listOutputs().packages.length, before, 'failed move must expose no package');
    assert.ok(fs.existsSync(src), 'the claimed source must be restored to its original Input name');
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

  test('a package id may not escape the Output directory', () => {
    assert.throws(() => gw.readOutput('../Processed', 0, 1000), /Ungültige Paket-ID/);
    assert.throws(() => gw.readOutput('..', 0, 1000), /Ungültige Paket-ID/);
    assert.throws(() => gw.readOutput('.hidden', 0, 1000), /Ungültige Paket-ID/);
    assert.throws(() => gw.readOutput('sub/dir', 0, 1000), /Ungültige Paket-ID/);
  });

  test('a Markdown file that was modified after release is refused', () => {
    const packageId = gw.listOutputs().packages[0].package_id;
    const { document } = JSON.parse(
      fs.readFileSync(path.join(root, 'Output', packageId, 'manifest.json'), 'utf8')
    );
    fs.appendFileSync(path.join(root, 'Output', packageId, document), '\nTAMPER');
    assert.throws(() => gw.readOutput(packageId), /verändert/);
  });

  test('review ids are parsed from the end so package names may contain separators', () => {
    assert.deepStrictEqual(splitReviewId('Paket__mit__trenner__asset-001'), {
      pkg: 'Paket__mit__trenner',
      asset: 'asset-001'
    });
    assert.throws(() => splitReviewId('kaputt'), /Ungültige Review-ID/);
    assert.throws(() => splitReviewId('paket__asset-x'), /Ungültige Review-ID/);
  });

  await testAsync('a simulated retention deletion failure never aborts anonymization', async () => {
    const locked = path.join(root, 'Processed', 'locked-old.pdf');
    fs.writeFileSync(locked, 'locked');
    queue(path.join(fixtures, 'synthetic_customer.pdf'), 'cleanup-failure.pdf');
    const result = await gw.anonymizeNext('customer', {
      ...depsFor('none'),
      retentionDays: 0,
      removeRetentionEntry() {
        throw new Error('simulated Windows file lock');
      }
    });
    assert.ok(result.ok, 'cleanup is secondary work and processing must succeed');
    assert.ok(fs.existsSync(locked), 'the simulated locked entry remains for a later retry');
    assert.ok(gw.genericStatus({ retentionDays: 0 }).retention_last_cleanup.errors > 0);
  });

  await testAsync('zero-day retention removes the processed original but leaves the new package readable', async () => {
    queue(path.join(fixtures, 'synthetic_customer.pdf'), 'zero-day.pdf');
    const result = await gw.anonymizeNext('customer', { ...depsFor('none'), retentionDays: 0 });
    assert.ok(result.ok);
    assert.strictEqual(gw.readOutput(result.package_id).package_id, result.package_id);
    assert.ok(
      !fs.readdirSync(path.join(root, 'Processed')).includes('zero-day.pdf'),
      'the processed original must be removed immediately'
    );
  });

  await testAsync('zero-day retention disables visual approval with an explicit expiry reason', async () => {
    queue(path.join(fixtures, 'synthetic_profile.docx'), 'zero-day-profile.docx');
    const result = await gw.anonymizeNext('personnel_profile', {
      ...depsFor('none'),
      retentionDays: 0
    });
    assert.ok(result.ok);
    assert.strictEqual(result.visual_assets.review_required, 1);
    assert.strictEqual(gw.readOutput(result.package_id).package_id, result.package_id);

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
    assert.ok(['available', 'unavailable'].includes(status.visual_bridge));
    assert.strictEqual(status.retention_days, 7);
    assert.strictEqual(typeof status.retention_due_entries.total, 'number');
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
