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
  readOutput,
  listAssets,
  readAsset
} = require('../plugins/data-secure/server/gateway/package-store');

const { test, done, assert } = createSuite('Package read capabilities');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

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

makePackage('run-one', '# Freigegeben eins');
makePackage('run-two', '# Freigegeben zwei');
makePackage('run-long', Array.from({ length: 2500 }, (_, index) => `Zeile ${String(index).padStart(4, '0')}: freigegebene synthetische Fachinformation.`).join('\n'));

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

done();
