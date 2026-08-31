'use strict';

// Visual gate tests. This is the part of the product with the strongest promise
// attached to it: no image reaches Claude automatically. OCR text may enter the
// text privacy gate, while pixels always remain local for review. The OCR and rasteriser bridges are injected, so these tests
// run on Linux CI as well even though the real bridges are Windows only.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const runtime = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-visual-'));
process.env.EU_PRIVACY_ROOT = root;
process.env.LOCALAPPDATA = path.join(root, 'localapp');
process.env.EU_PRIVACY_VISUAL_MODE = 'strict';

const { encodePng } = require(path.join(runtime, 'image-sanitizer.js'));
const { prepareVisual, processVisuals, assetsMarkdown, safeReviewFilename } = require(
  path.join(runtime, 'gateway', 'visuals.js')
);
const { VisualBudgetError } = require(path.join(runtime, 'windows-visual.js'));

const { testAsync, test, done, assert } = createSuite('Visual gate');

function png(width = 300, height = 120) {
  return encodePng({ width, height, rgba: Buffer.alloc(width * height * 4, 255) });
}

const CLEAN_PNG = png();

function attachment(overrides = {}) {
  return {
    type: 'image',
    mimeType: 'image/png',
    extension: 'png',
    name: 'image1.png',
    data: CLEAN_PNG.toString('base64'),
    ...overrides
  };
}

// A word list long enough to clear the strict minimum OCR length.
const HARMLESS_WORDS = ['Quartalsumsatz', 'nach', 'Region', 'in', 'Prozent', 'gerundet'];

function ocrWords(words) {
  let x = 10;
  return {
    words: words.map((text) => {
      const bbox = { x0: x, y0: 10, x1: x + text.length * 7, y1: 30 };
      x = bbox.x1 + 5;
      return { text, bbox };
    })
  };
}

function stubOcr(sequence) {
  let call = 0;
  return async () => {
    const value = sequence[Math.min(call, sequence.length - 1)];
    call++;
    if (value instanceof Error) throw value;
    return value;
  };
}

const rasterOk = async () => CLEAN_PNG;
const rasterFails = async () => {
  throw new Error('powershell bridge unavailable');
};

async function main() {
  await testAsync('a clean image with enough recognised text is still withheld', async () => {
    const res = await prepareVisual(attachment(), 'customer', {
      ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
  });

  await testAsync('a clean image with too little recognised text is withheld in strict mode', async () => {
    const res = await prepareVisual(attachment(), 'customer', {
      ocrPngDetailed: stubOcr([ocrWords(['ok'])])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
  });

  await testAsync('contract visuals need more recognised text than customer visuals', async () => {
    const words = ocrWords(['Anlage', 'zwei']); // 11 characters
    const customer = await prepareVisual(attachment(), 'customer', { ocrPngDetailed: stubOcr([words]) });
    const contract = await prepareVisual(attachment(), 'contract', { ocrPngDetailed: stubOcr([words]) });
    assert.strictEqual(customer.reason, 'visual_local_review_required');
    assert.strictEqual(contract.reason, 'visual_local_review_required');

    const longer = ocrWords(['Anlage', 'zwei', 'zur', 'Vereinbarung']);
    const okCustomer = await prepareVisual(attachment(), 'customer', { ocrPngDetailed: stubOcr([longer]) });
    assert.strictEqual(okCustomer.status, 'review_required');
  });

  await testAsync('balanced mode cannot override local-only visual handling', async () => {
    process.env.EU_PRIVACY_VISUAL_MODE = 'balanced';
    try {
      const res = await prepareVisual(attachment(), 'customer', {
        ocrPngDetailed: stubOcr([ocrWords(['ok'])])
      });
      assert.strictEqual(res.status, 'review_required');
      assert.strictEqual(res.reason, 'visual_local_review_required');
    } finally {
      process.env.EU_PRIVACY_VISUAL_MODE = 'strict';
    }
  });

  await testAsync('an image with PII remains local even when OCR detects it', async () => {
    const before = ocrWords(['Kunde:', 'Max', 'Mustermann', 'Quartalsbericht', 'Region', 'Nord']);
    const after = ocrWords(['Kunde:', 'Quartalsbericht', 'Region', 'Nord']);
    const res = await prepareVisual(attachment(), 'customer', {
      ocrPngDetailed: stubOcr([before, after])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
    assert.match(res.ocrText, /Max Mustermann/);
  });

  await testAsync('an image whose redaction did not remove the PII is withheld', async () => {
    const stillLeaking = ocrWords(['Kunde:', 'Max', 'Mustermann', 'Quartalsbericht', 'Region']);
    const res = await prepareVisual(attachment(), 'customer', {
      ocrPngDetailed: stubOcr([stillLeaking, stillLeaking])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
  });

  await testAsync('a failing verification OCR pass withholds the image', async () => {
    const before = ocrWords(['Kunde:', 'Max', 'Mustermann', 'Quartalsbericht']);
    const res = await prepareVisual(attachment(), 'customer', {
      ocrPngDetailed: stubOcr([before, new Error('ocr crashed')])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
  });

  await testAsync('an unavailable OCR bridge withholds the image', async () => {
    const res = await prepareVisual(attachment(), 'customer', {
      ocrPngDetailed: stubOcr([new Error('windows ocr missing')])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
    assert.strictEqual(res.ocrText, '', 'no OCR text may be reported when OCR failed');
  });

  await testAsync('a vector graphic that cannot be rasterised is withheld', async () => {
    const res = await prepareVisual(
      attachment({ mimeType: 'image/x-emf', extension: 'emf', data: Buffer.from([1, 2, 3]).toString('base64') }),
      'customer',
      { rasterizeToPng: rasterFails, ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)]) }
    );
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
  });

  await testAsync('a rasterisable vector graphic remains local', async () => {
    const res = await prepareVisual(
      attachment({ mimeType: 'image/x-emf', extension: 'emf', data: Buffer.from([1, 2, 3]).toString('base64') }),
      'customer',
      { rasterizeToPng: rasterOk, ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)]) }
    );
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_local_review_required');
  });

  await testAsync('an empty attachment is withheld', async () => {
    const res = await prepareVisual(attachment({ data: '' }), 'customer', {
      ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'empty_visual');
  });

  await testAsync('an oversized attachment is withheld without decoding', async () => {
    const huge = Buffer.alloc(31 * 1024 * 1024, 1).toString('base64');
    const res = await prepareVisual(attachment({ data: huge }), 'customer', {
      ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)])
    });
    assert.strictEqual(res.status, 'review_required');
    assert.strictEqual(res.reason, 'visual_too_large');
  });

  for (const profile of ['applicant', 'personnel_profile']) {
    await testAsync(`${profile} visuals are always withheld, even when OCR is clean`, async () => {
      const res = await prepareVisual(attachment(), profile, {
        ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)])
      });
      assert.strictEqual(res.status, 'review_required');
      assert.strictEqual(res.reason, 'visual_local_review_required');
      assert.ok(res.candidatePng, 'a metadata free preview candidate must exist for human review');
    });
  }

  await testAsync('a withheld visual writes a review item and no package asset', async () => {
    const stage = fs.mkdtempSync(path.join(root, 'stage-'));
    const out = await processVisuals([attachment()], 'personnel_profile', 'Paket_Test_1', stage, {
      ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)])
    });
    assert.strictEqual(out.results.length, 1);
    assert.strictEqual(out.results[0].status, 'review_required');
    assert.ok(out.results[0].review_id, 'a review id must be issued');
    assert.strictEqual(fs.readdirSync(path.join(stage, 'assets')).length, 0, 'no asset may be staged');

    const reviewDir = path.join(root, 'Needs Visual Review', 'Paket_Test_1');
    const files = fs.readdirSync(reviewDir);
    assert.ok(files.includes('asset-001.review.json'), 'review metadata must be written');
    assert.ok(files.includes('asset-001.png'), 'a local plaintext preview candidate must be written');
    assert.ok(!files.includes('asset-001.dsart'), 'no encrypted preview is created');
    const meta = JSON.parse(fs.readFileSync(path.join(reviewDir, 'asset-001.review.json'), 'utf8'));
    assert.strictEqual(meta.schema_version, 2);
    assert.strictEqual(meta.preview_storage, 'local-plain');
    assert.strictEqual(meta.preview_encrypted, false);
    assert.deepStrictEqual(fs.readFileSync(path.join(reviewDir, meta.preview_file)), CLEAN_PNG);
  });

  await testAsync('a customer visual is never staged as a package asset', async () => {
    const stage = fs.mkdtempSync(path.join(root, 'stage-'));
    const out = await processVisuals([attachment()], 'customer', 'Paket_Test_2', stage, {
      ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)])
    });
    assert.strictEqual(out.results[0].status, 'review_required');
    assert.strictEqual(out.results[0].reason, 'visual_local_review_required');
    assert.strictEqual(fs.readdirSync(path.join(stage, 'assets')).length, 0);
  });

  await testAsync('a repeated package id cannot overwrite existing encrypted review metadata or bytes', async () => {
    const packageId = 'Paket_Legacy_Review';
    const stage = fs.mkdtempSync(path.join(root, 'stage-'));
    const dir = path.join(root, 'Needs Visual Review', packageId);
    fs.mkdirSync(dir, { recursive: true });
    const metaPath = path.join(dir, 'asset-001.review.json');
    const encryptedPath = path.join(dir, 'asset-001.dsart');
    const oldMeta = JSON.stringify({ preview_file: 'asset-001.dsart', preview_encrypted: true });
    const encrypted = Buffer.from('DSARTF01synthetic-existing-preview');
    fs.writeFileSync(metaPath, oldMeta);
    fs.writeFileSync(encryptedPath, encrypted);
    await assert.rejects(processVisuals([attachment()], 'customer', packageId, stage, {
      ocrPngDetailed: stubOcr([ocrWords(HARMLESS_WORDS)])
    }), /nicht überschrieben/u);
    assert.strictEqual(fs.readFileSync(metaPath, 'utf8'), oldMeta);
    assert.deepStrictEqual(fs.readFileSync(encryptedPath), encrypted);
    assert.strictEqual(fs.existsSync(path.join(dir, 'asset-001.png')), false);
  });

  await testAsync('explicit text-only mode removes visuals without OCR or review bytes', async () => {
    const stage = fs.mkdtempSync(path.join(root, 'stage-'));
    let ocrCalled = false;
    const out = await processVisuals([attachment()], 'personnel_profile', 'Paket_Text_Only', stage, {
      removeImages: true,
      ocrPngDetailed: async () => { ocrCalled = true; throw new Error('must not run'); }
    });
    assert.strictEqual(ocrCalled, false);
    assert.strictEqual(out.ocrExtras, '');
    assert.deepStrictEqual(out.results, [{
      asset_id: 'asset-001',
      status: 'removed',
      reason: 'removed_by_explicit_text_only_request',
      original_mime: 'image/png',
      redactions: 0
    }]);
    assert.strictEqual(fs.existsSync(path.join(stage, 'assets')), false);
    assert.strictEqual(fs.existsSync(path.join(root, 'Needs Visual Review', 'Paket_Text_Only')), false);
    assert.match(assetsMarkdown(out.results), /ausdrücklichen Wunsch entfernt/);
  });

  await testAsync('OCR text of a withheld visual is carried over for the text gate', async () => {
    const stage = fs.mkdtempSync(path.join(root, 'stage-'));
    const out = await processVisuals([attachment()], 'personnel_profile', 'Paket_Test_3', stage, {
      ocrPngDetailed: stubOcr([ocrWords(['Kunde', 'Max', 'Mustermann'])])
    });
    assert.ok(out.ocrExtras.includes('Extrahierter Bildtext 1'), 'image text section must be added');
    assert.ok(out.ocrExtras.includes('Max Mustermann'), 'raw OCR text enters the text pipeline');
    assert.strictEqual(out.results[0].status, 'review_required', 'the image itself stays local');
  });

  await testAsync('the document-wide visual deadline aborts instead of releasing a partial package', async () => {
    const stage = fs.mkdtempSync(path.join(root, 'stage-'));
    await assert.rejects(processVisuals([attachment()], 'customer', 'Paket_Timeout', stage, {
      totalTimeoutMs: 5,
      ocrPngDetailed: async () => new Promise(() => {})
    }), VisualBudgetError);
    assert.strictEqual(fs.readdirSync(path.join(stage, 'assets')).length, 0);
  });

  test('the assets section marks withheld graphics explicitly', () => {
    const md = assetsMarkdown([
      { asset_id: 'asset-001', status: 'included', file: 'assets/asset-001.png' },
      { asset_id: 'asset-002', status: 'review_required', reason: 'ocr_unavailable_fail_closed' }
    ]);
    assert.ok(md.includes('![Sichere Grafik 001](./assets/asset-001.png)'));
    assert.ok(md.includes('Grafik 002 wurde nicht an Claude freigegeben'));
    assert.ok(md.includes('ocr_unavailable_fail_closed'), 'the reason must be visible to the reader');
  });

  test('review preview filenames cannot escape the review directory', () => {
    assert.strictEqual(safeReviewFilename('asset-001', '../../etc/passwd'), 'asset-001.etcpasswd');
    assert.strictEqual(safeReviewFilename('asset-001', ''), 'asset-001.bin');
    assert.strictEqual(safeReviewFilename('asset-001', 'PNG'), 'asset-001.png');
  });

  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  done();
}

main();
