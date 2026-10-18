// Preparation contract only: this never opens or accepts the native desktop.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareCampaign, FIXTURES, CASES } from '../scripts/prepare-standalone-desktop-acceptance.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-desktop-kit-'));
const source = path.join(root, 'source'); fs.mkdirSync(source);
const campaignName = 'RC164-Desktop-Test-20261018-7b8d41ac';
const before = fs.readdirSync(root).sort();
assert.throws(() => prepareCampaign({ sourceRoot: source, parent: root, name: '../escaped' }), /ARGUMENT_INVALID/u);
assert.deepEqual(fs.readdirSync(root).sort(), before);
for (const row of FIXTURES) fs.writeFileSync(path.join(source, row.name), Buffer.alloc(row.bytes, 0x78), { flag: 'wx' });
assert.throws(() => prepareCampaign({ sourceRoot: source, parent: root, name: campaignName }), /SOURCE_MISMATCH/u);
assert.equal(fs.existsSync(path.join(root, campaignName)), false, 'mismatched golden bytes cannot create a partially valid-looking campaign');
assert.equal(new Set(CASES.map(row => row.id)).size, CASES.length);
assert.equal(CASES.length, 10);
assert.equal(CASES.find(row => row.id.startsWith('05')).requires_observed_review, true);
assert.equal(CASES.find(row => row.id.startsWith('05')).idle_minutes, 5);
assert.equal(CASES.find(row => row.id.startsWith('06')).reuse, '03-Gefuehrte-Anonymisierung');
assert.equal(CASES.find(row => row.id.startsWith('07')).maximum_history_rows, 5);
assert.equal(CASES.find(row => row.id.startsWith('07')).repeat_runs, 6);
assert.ok(CASES.every(row => row.inputs.every(index => Number.isSafeInteger(index) && index >= 0 && index < FIXTURES.length)));
const script = fs.readFileSync(new URL('../scripts/prepare-standalone-desktop-acceptance.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(script, /\b(?:spawn|spawnSync|execFile|execFileSync|chmod|chown|rmSync|unlinkSync)\s*\(/u,
  'the fixture preparer cannot launch apps, mutate permissions or delete existing data');
assert.match(script, /candidate_binding: 'PENDING_EXACT_ARCHIVE_AND_EXE_HASH'/u);
assert.match(script, /acceptance: 'NOT_RUN'/u);
// Preserve the newly generated tiny negative fixture as evidence, not a broad cleanup.
console.log(JSON.stringify({ schema: 'datasecure-desktop-kit-test/1', passed: true, native_gui: 'NOT_RUN',
  checks: 'invalid-target-before-write; corrupted-golden-before-create; bounded-case-contract; no-start-delete-permission-changes',
  retained_synthetic_fixture: root }));
