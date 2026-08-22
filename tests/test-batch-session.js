'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-batch-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
const { roots, privacyRoot, storageStatus } = require('../plugins/data-secure/server/gateway/common');
const { beginBatch, processBatchNext, recoverBatches, _test } = require('../plugins/data-secure/server/gateway/batch');

const { testAsync, done, assert } = createSuite('Server-bound batch session');

function resetInput() {
  const input = roots().input;
  for (const entry of fs.readdirSync(input)) fs.rmSync(path.join(input, entry), { recursive: true, force: true });
  return input;
}

function add(name, text) {
  const target = path.join(roots().input, name);
  fs.writeFileSync(target, text, 'utf8');
  return target;
}

function ordered(name, text, index) {
  const target = add(name, text);
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
  fs.utimesSync(target, timestamp, timestamp);
  return target;
}

const deps = {
  convertDocument: async (source) => ({
    markdown: fs.readFileSync(source, 'utf8'),
    attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false
  })
};

async function main() {
  await testAsync('count mismatch cannot create a batch token', async () => {
    resetInput(); add('one.txt', 'Kunde: Max Mustermann');
    const result = beginBatch({ expectedCount: 2, profile: 'customer' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'input_count_changed');
    assert.ok(!result.batch_token);
  });

  await testAsync('default storage uses local application data and known sync roots are refused', async () => {
    const configured = process.env.EU_PRIVACY_ROOT;
    delete process.env.EU_PRIVACY_ROOT;
    assert.ok(privacyRoot().startsWith(path.resolve(process.env.LOCALAPPDATA)));
    assert.strictEqual(storageStatus().mode, 'local_app_data');
    process.env.EU_PRIVACY_ROOT = path.join(base, 'OneDrive - Example', 'Privacy');
    assert.strictEqual(storageStatus().safe, false);
    assert.throws(() => beginBatch({ expectedCount: 1 }), /nicht freigegeben/i);
    process.env.EU_PRIVACY_ROOT = configured;
  });

  await testAsync('the server owns progress and never retries a stopped item', async () => {
    resetInput();
    add('blocked.csv', 'Name,Mail\nMax Mustermann,max@example.de');
    add('first.txt', 'Kunde: Max Mustermann\nE-Mail: max@example.de\nTicket: Eins');
    add('second.txt', 'Kunde: Erika Musterfrau\nE-Mail: erika@example.de\nTicket: Zwei');
    const begun = beginBatch({ expectedCount: 3, profile: 'customer' });
    const stopped = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(stopped.ok, false);
    assert.strictEqual(stopped.stopped, 1);
    assert.strictEqual(stopped.remaining, 2);
    const first = await processBatchNext(begun.batch_token, deps);
    const second = await processBatchNext(begun.batch_token, deps);
    assert.ok(first.ok && second.ok);
    assert.strictEqual(second.complete, true);
    assert.strictEqual(second.released, 2);
    assert.strictEqual(second.stopped, 1);
    assert.match(first.read_capability, /^[A-Za-z0-9_-]{43}$/);
    assert.deepStrictEqual(fs.readdirSync(roots().input), ['blocked.csv']);
  });

  await testAsync('same-count replacement invalidates the whole confirmed snapshot', async () => {
    resetInput();
    const original = add('confirmed.txt', 'Kunde: Max Mustermann');
    add('other.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    fs.writeFileSync(original, 'ausgetauschter Inhalt', 'utf8');
    const result = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'batch_snapshot_changed');
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.stopped, 2);
    await assert.rejects(() => processBatchNext(begun.batch_token, deps), /verändert|nicht mehr verwendbar/i);
  });

  await testAsync('an added file invalidates the batch before any further release', async () => {
    resetInput();
    add('confirmed.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    add('added.txt', 'Kunde: Erika Musterfrau');
    const result = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'batch_snapshot_changed');
    assert.strictEqual(result.released, 0);
    assert.strictEqual(result.complete, true);
  });

  await testAsync('startup recovery marks an interrupted item stopped instead of retrying it', async () => {
    resetInput(); add('resume.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const file = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.items[0].status = 'processing';
    fs.writeFileSync(file, JSON.stringify(state));
    const recovered = recoverBatches();
    assert.strictEqual(recovered.recovered, 1);
    const result = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.stopped, 1);
    assert.strictEqual(fs.existsSync(path.join(roots().input, 'resume.txt')), true);
  });

  await testAsync('a real 25-file session handles stops at positions 1, 13 and 25 exactly once', async () => {
    resetInput();
    for (let index = 1; index <= 25; index++) {
      const blocked = [1, 13, 25].includes(index);
      ordered(
        `${String(index).padStart(2, '0')}-${blocked ? 'blocked.csv' : 'safe.txt'}`,
        blocked ? 'Name,Mail\nMax Mustermann,max@example.de' : `Kunde: Person ${index}\nTicket: Test ${index}`,
        index
      );
    }
    const begun = beginBatch({ expectedCount: 25, profile: 'customer' });
    const results = [];
    for (let index = 0; index < 25; index++) results.push(await processBatchNext(begun.batch_token, deps));
    assert.strictEqual(results.filter((result) => result.ok).length, 22);
    assert.strictEqual(results.filter((result) => !result.ok).length, 3);
    const final = results.at(-1);
    assert.strictEqual(final.complete, true);
    assert.strictEqual(final.released, 22);
    assert.strictEqual(final.stopped, 3);
    assert.strictEqual(fs.readdirSync(roots().input).length, 3);
  });

  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
