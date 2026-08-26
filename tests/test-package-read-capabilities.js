'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-read-capability-'));
process.env.EU_PRIVACY_ROOT = root;
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const {
  issueReadCapability,
  requireReadCapability,
  safeResolvePackage,
  listOutputs,
  readOutput,
  readOutputs,
  openVerifiedMarkdownSnapshot,
  listAssets,
  readAsset
} = require('../plugins/data-secure/server/gateway/package-store');

const { test, done, assert } = createSuite('Package read capabilities');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const { releasedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');

function makePackage(id, body) {
  const dir = path.join(root, 'Output', id);
  const assetDir = path.join(dir, 'assets');
  const document = `${id}.md`;
  const image = Buffer.from('verified-png-placeholder');
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(dir, document), body, 'utf8');
  fs.writeFileSync(path.join(assetDir, 'asset-001.png'), image);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/2',
    package_id: id,
    created_at: new Date().toISOString(),
    profile: 'general',
    document,
    document_sha256: sha256(Buffer.from(body, 'utf8')),
    assets: [{
      asset_id: 'asset-001',
      status: 'included',
      file: 'assets/asset-001.png',
      output_mime: 'image/png',
      bytes: image.length,
      sha256: sha256(image)
    }]
  }));
}

function promotePackageToV3(id, assets = []) {
  const manifestPath = path.join(root, 'Output', id, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.schema = 'eu-privacy-package/3';
  manifest.assets = assets;
  manifest.parser_warnings = [];
  manifest.pdf_unextractable_visual_objects = 0;
  manifest.images_removed_by_explicit_request = assets.filter((asset) => asset.status === 'removed').length;
  manifest.visual_assets_withheld_at_release = assets.filter((asset) => asset.status === 'review_required').length;
  manifest.document_result = releasedDocumentResult({
    parserWarnings: manifest.parser_warnings,
    visualResults: manifest.assets,
    unreviewedVisualCount: manifest.pdf_unextractable_visual_objects,
    imagesRemovedByExplicitRequest: manifest.images_removed_by_explicit_request
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  return manifestPath;
}

makePackage('run-one', '# Freigegeben eins');
makePackage('run-two', '# Freigegeben zwei');
makePackage('run-long', Array.from({ length: 2500 }, (_, index) => `Zeile ${String(index).padStart(4, '0')}: freigegebene synthetische Fachinformation.`).join('\n'));
makePackage('run-unicode', `${'a'.repeat(4799)}🚀Ä Ende`);
makePackage('run-unicode-many', 'A🚀Ä漢e\u0301|'.repeat(3000));

test('a package id alone is never sufficient', () => {
  assert.throws(() => readOutput('run-one'), /Leseberechtigung/);
  assert.throws(() => listAssets('run-one'), /Leseberechtigung/);
  assert.throws(() => readAsset('run-one', undefined, 'asset-001'), /Leseberechtigung/);
});

test('one run capability reads only its own verified document and asset', () => {
  const grant = issueReadCapability('run-one');
  assert.match(grant.read_capability, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(Date.parse(grant.read_capability_expires_at) > Date.now());
  assert.match(readOutput('run-one', grant.read_capability).text, /eins/);
  assert.strictEqual(listAssets('run-one', grant.read_capability).assets.length, 1);
  assert.ok(readAsset('run-one', grant.read_capability, 'asset-001').__image.data.length > 0);
  assert.throws(() => readOutput('run-two', grant.read_capability), /Leseberechtigung/);
});

test('v3 packages require a grade consistent with their exact omission signals', () => {
  const id = 'run-v3-grade';
  makePackage(id, '# Verifiziertes Ergebnis');
  const manifestPath = promotePackageToV3(id);
  const grant = issueReadCapability(id);
  assert.match(readOutput(id, grant.read_capability).text, /Verifiziertes/);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.document_result.grade = 'usable-with-omissions';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  assert.throws(() => issueReadCapability(id), /Paketmanifest/);
});

test('a bounded document page reads several independently authorized outputs together', () => {
  const first = issueReadCapability('run-one');
  const second = issueReadCapability('run-two');
  const page = readOutputs([
    { package_id: 'run-one', read_capability: first.read_capability },
    { package_id: 'run-two', read_capability: second.read_capability }
  ]);
  assert.strictEqual(page.documents.length, 2);
  assert.match(page.documents[0].text, /eins/);
  assert.match(page.documents[1].text, /zwei/);
  assert.throws(() => readOutputs([
    { package_id: 'run-one', read_capability: first.read_capability },
    { package_id: 'run-one', read_capability: first.read_capability }
  ]), /nur einmal/);
  assert.throws(() => readOutputs([{ package_id: 'run-two', read_capability: first.read_capability }]), /Leseberechtigung/);
});

test('expired and fabricated capabilities fail closed', () => {
  const grant = issueReadCapability('run-two');
  assert.throws(() => requireReadCapability(
    'run-two',
    grant.read_capability,
    Date.parse(grant.read_capability_expires_at) + 1
  ), /Leseberechtigung/);
  assert.throws(() => readOutput('run-two', 'x'.repeat(43)), /Leseberechtigung/);
});

test('capabilities cannot be minted for absent or unsafe package ids', () => {
  assert.throws(() => issueReadCapability('missing'), /Paket nicht gefunden/);
  assert.throws(() => issueReadCapability('../Processed'), /Ungültige Paket-ID/);
});

test('a manipulated manifest cannot bind an original-looking document id into the read path', () => {
  const id = 'run-manifest-unsafe';
  makePackage(id, '# Freigegeben');
  const dir = path.join(root, 'Output', id);
  const originalLookingName = 'Alice-Mustermann-Original.md';
  const originalLookingContent = '# Ungeprüft';
  fs.writeFileSync(path.join(dir, originalLookingName), originalLookingContent, 'utf8');
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.document = originalLookingName;
  manifest.document_sha256 = sha256(Buffer.from(originalLookingContent, 'utf8'));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

  assert.throws(() => safeResolvePackage(id), (error) => {
    assert.match(error.message, /Paketmanifest/);
    assert.doesNotMatch(error.message, /Alice|Mustermann/);
    return true;
  });
  assert.throws(() => issueReadCapability(id), /Paketmanifest/);
});

test('a manipulated included asset cannot expose a personal-looking id or filename', () => {
  const id = 'run-asset-unsafe';
  makePackage(id, '# Freigegeben');
  const dir = path.join(root, 'Output', id);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.assets[0].asset_id = 'Alice-Mustermann-Foto';
  manifest.assets[0].file = 'assets/Alice-Mustermann-Foto.png';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

  assert.throws(() => safeResolvePackage(id), (error) => {
    assert.match(error.message, /Paketmanifest/);
    assert.doesNotMatch(error.message, /Alice|Mustermann/);
    return true;
  });
});

test('package enumeration omits a manifest that tries to place personal data in public metadata', () => {
  const id = 'run-enumeration-unsafe';
  makePackage(id, '# Freigegeben');
  const manifestPath = path.join(root, 'Output', id, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.profile = 'Alice Mustermann';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

  const serialized = JSON.stringify(listOutputs());
  assert.doesNotMatch(serialized, /Alice|Mustermann/);
  assert.ok(!listOutputs().packages.some((entry) => entry.package_id === id));
});

test('a verified document is read through one bound descriptor rather than a second pathname read', () => {
  const id = 'run-descriptor-bound';
  const body = '# Freigegebene Fachinformation';
  makePackage(id, body);
  const documentPath = path.join(root, 'Output', id, `${id}.md`);
  const grant = issueReadCapability(id);
  const originalRead = fs.readFileSync;
  let attemptedPathSwap = false;
  fs.readFileSync = function patchedRead(target, ...args) {
    if (target === documentPath) {
      attemptedPathSwap = true;
      fs.writeFileSync(documentPath, '# Alice Mustermann Rohinhalt', 'utf8');
    }
    return originalRead.call(this, target, ...args);
  };
  try {
    const output = readOutput(id, grant.read_capability);
    assert.strictEqual(attemptedPathSwap, false);
    assert.strictEqual(output.text, body);
  } finally {
    fs.readFileSync = originalRead;
  }
});

test('bounded character pages cover a long document completely without overlap or omission', () => {
  const grant = issueReadCapability('run-long');
  const pages = [];
  let offset = 0;
  let total;
  do {
    const page = readOutput('run-long', grant.read_capability, offset, 7000);
    pages.push(page.text);
    total = page.total_chars;
    assert.strictEqual(page.offset, offset);
    assert.strictEqual(page.next_offset, offset + page.text.length);
    assert.ok(page.text.length <= 7000);
    offset = page.next_offset;
    if (!page.has_more) break;
  } while (pages.length < 100);
  const combined = pages.join('');
  assert.strictEqual(combined.length, total);
  assert.strictEqual(offset, total);
  assert.match(combined, /^Zeile 0000:/u);
  assert.match(combined, /Zeile 2499:/u);

  const minimum = readOutput('run-long', grant.read_capability, 0, 1);
  const maximum = readOutput('run-long', grant.read_capability, 0, 1000000);
  assert.strictEqual(minimum.text.length, 1000);
  assert.strictEqual(maximum.text.length, 30000);
});

test('a small verified handoff snapshot pages from RAM and is wiped on disposal', () => {
  const grant = issueReadCapability('run-long');
  const snapshot = openVerifiedMarkdownSnapshot('run-long', grant.read_capability);
  assert.ok(snapshot);
  const pages = [];
  let offset = 0;
  do {
    const page = snapshot.read(offset, 4800);
    pages.push(page.text);
    offset = page.next_offset;
    if (!page.has_more) break;
  } while (pages.length < 100);
  assert.match(pages.join(''), /^Zeile 0000:/u);
  snapshot.dispose();
  assert.throws(() => snapshot.read(0, 4800), /nicht mehr gültig/);
  assert.strictEqual(openVerifiedMarkdownSnapshot('run-long', grant.read_capability, 1024), null);
});

test('verified snapshot paging decodes bounded UTF-8 windows instead of the complete buffer per page', () => {
  const grant = issueReadCapability('run-long');
  const snapshot = openVerifiedMarkdownSnapshot('run-long', grant.read_capability);
  const originalToString = Buffer.prototype.toString;
  let unboundedLargeDecodes = 0;
  let boundedDecodes = 0;
  Buffer.prototype.toString = function observedToString(encoding, start, end) {
    if (this.length > 10000 && encoding === 'utf8') {
      if (start === undefined && end === undefined) unboundedLargeDecodes++;
      else boundedDecodes++;
    }
    return originalToString.call(this, encoding, start, end);
  };
  try {
    let offset = 0;
    for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
      const page = snapshot.read(offset, 4800);
      offset = page.next_offset;
    }
  } finally {
    Buffer.prototype.toString = originalToString;
    snapshot.dispose();
  }
  assert.strictEqual(unboundedLargeDecodes, 0);
  assert.strictEqual(boundedDecodes, 4);
});

test('verified handoff snapshot preserves Unicode at a page boundary', () => {
  const grant = issueReadCapability('run-unicode');
  const snapshot = openVerifiedMarkdownSnapshot('run-unicode', grant.read_capability);
  const first = snapshot.read(0, 4800);
  const second = snapshot.read(first.next_offset, 4800);
  assert.strictEqual(`${first.text}${second.text}`, `${'a'.repeat(4799)}🚀Ä Ende`);
  assert.doesNotMatch(`${first.text}${second.text}`, /\uFFFD/u);
  snapshot.dispose();
});

test('indexed snapshot reassembles many multibyte pages without replacement or omission', () => {
  const expected = 'A🚀Ä漢e\u0301|'.repeat(3000);
  const grant = issueReadCapability('run-unicode-many');
  const snapshot = openVerifiedMarkdownSnapshot('run-unicode-many', grant.read_capability);
  const pages = [];
  let offset = 0;
  do {
    const page = snapshot.read(offset, 1000);
    pages.push(page.text);
    offset = page.next_offset;
    if (!page.has_more) break;
  } while (pages.length < 100);
  assert.strictEqual(pages.join(''), expected);
  assert.doesNotMatch(pages.join(''), /\uFFFD/u);
  snapshot.dispose();
});

done();
