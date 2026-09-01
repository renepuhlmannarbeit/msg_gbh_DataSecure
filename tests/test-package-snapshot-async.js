'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-async-snapshot-'));
process.env.EU_PRIVACY_ROOT = root;
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const {
  issueReadCapability,
  openVerifiedMarkdownSnapshotAsync
} = require('../plugins/data-secure/server/gateway/package-store');
const { testAsync, done, assert } = createSuite('Asynchronous package snapshot');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  await testAsync('large verified Markdown yields to the event loop while reading, hashing and indexing', async () => {
    const id = 'run-async-snapshot';
    const dir = path.join(root, 'Output', id);
    const document = `${id}.md`;
    const body = Buffer.from(`${'a'.repeat(6 * 1024 * 1024)}🚀 Ende`, 'utf8');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, document), body);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      schema: 'eu-privacy-package/2',
      package_id: id,
      created_at: new Date().toISOString(),
      profile: 'general',
      document,
      document_sha256: sha256(body),
      assets: []
    }));

    const grant = issueReadCapability(id);
    let turns = 0;
    const timer = setInterval(() => { turns++; }, 0);
    const snapshot = await openVerifiedMarkdownSnapshotAsync(id, grant.read_capability);
    clearInterval(timer);
    assert.ok(snapshot);
    assert.ok(turns > 0, 'snapshot preparation must not monopolize the event loop');
    const tail = snapshot.read(6 * 1024 * 1024, 1000);
    assert.strictEqual(tail.text, '🚀 Ende');
    assert.strictEqual(tail.has_more, false);
    snapshot.dispose();
    assert.throws(() => snapshot.read(0, 1000), /nicht mehr gültig/iu);
  });
  await testAsync('invalid UTF-8 remains fail-closed in the chunked asynchronous index', async () => {
    const id = 'run-async-invalid-utf8';
    const dir = path.join(root, 'Output', id);
    const document = `${id}.md`;
    const body = Buffer.from([0x41, 0xc0, 0xaf, 0x42]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, document), body);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      schema: 'eu-privacy-package/2',
      package_id: id,
      created_at: new Date().toISOString(),
      profile: 'general',
      document,
      document_sha256: sha256(body),
      assets: []
    }));

    const grant = issueReadCapability(id);
    await assert.rejects(
      openVerifiedMarkdownSnapshotAsync(id, grant.read_capability),
      /nicht gültig UTF-8-kodiert/iu
    );
  });
  fs.rmSync(root, { recursive: true, force: true });
  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
