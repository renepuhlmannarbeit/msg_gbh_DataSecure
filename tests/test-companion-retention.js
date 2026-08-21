'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const {
  cleanupCompanionJobs,
  companionRetentionStatus,
  purgeCompanionJobs
} = require('../plugins/data-secure/server/companion/retention');

const { test, done, assert } = createSuite('Companion job retention');
const NOW = new Date('2026-08-21T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function sandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `data-secure-job-retention-${name}-`));
}

function job(root, ageDays = 0, file = '000001.json') {
  const dir = path.join(root, crypto.randomUUID());
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, file), '{}');
  const at = new Date(NOW.valueOf() - ageDays * DAY);
  fs.utimesSync(dir, at, at);
  return dir;
}

function action(extra = {}) {
  return { action_id: crypto.randomUUID(), channel: 'local_companion', ...extra };
}

test('fresh jobs remain while expired jobs are removed', () => {
  const root = sandbox('expiry');
  const fresh = job(root, 1);
  const stale = job(root, 8);
  const result = cleanupCompanionJobs({ root, now: NOW, retentionDays: 7 });
  assert.strictEqual(result.removed, 1);
  assert.ok(fs.existsSync(fresh));
  assert.ok(!fs.existsSync(stale));
});

test('zero-day retention removes a job on the next cleanup trigger', () => {
  const root = sandbox('zero');
  const target = job(root, 0);
  const result = cleanupCompanionJobs({ root, now: NOW, retentionDays: 0 });
  assert.strictEqual(result.removed, 1);
  assert.ok(!fs.existsSync(target));
});

test('unsafe entries are neither traversed nor deleted', () => {
  const root = sandbox('unsafe');
  const unsafe = job(root, 9, 'payload.txt');
  fs.writeFileSync(path.join(root, 'operator-note.txt'), 'keep');
  const result = cleanupCompanionJobs({ root, now: NOW, retentionDays: 7 });
  assert.strictEqual(result.removed, 0);
  assert.strictEqual(result.errors, 2);
  assert.ok(fs.existsSync(unsafe));
  assert.ok(fs.existsSync(path.join(root, 'operator-note.txt')));
});

test('due status is metadata-only and has a stable shape', () => {
  const root = sandbox('status');
  job(root, 8);
  const status = companionRetentionStatus({ root, now: NOW, retentionDays: 7 });
  assert.strictEqual(status.due_jobs, 1);
  assert.strictEqual(status.inspection_errors, 0);
  assert.doesNotMatch(JSON.stringify(status), /[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  assert.ok(Object.hasOwn(status.last_cleanup, 'error_codes'));
});

test('local purge requires exact local human evidence', () => {
  const root = sandbox('evidence');
  job(root, 0);
  assert.throws(() => purgeCompanionJobs({ action_id: crypto.randomUUID(), channel: 'model' }, { root }));
  assert.throws(() => purgeCompanionJobs(action({ confirmed: true }), { root }));
  assert.strictEqual(fs.readdirSync(root).length, 1);
});

test('local purge removes valid jobs without returning identifiers or paths', () => {
  const root = sandbox('purge');
  job(root, 0);
  job(root, 0);
  const result = purgeCompanionJobs(action(), { root, now: NOW });
  assert.deepStrictEqual(result, { ok: true, removed: 2, errors: 0 });
  assert.deepStrictEqual(fs.readdirSync(root), []);
});

done();
