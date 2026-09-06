import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { collectProductFiles } from '../scripts/lib/product-files.mjs';
import { collectStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';

const require = createRequire(import.meta.url);
const { createSuite } = require('./helpers');
const { expected, canonicalizeBodies, profiles, formats, reviewProfiles, goldenFixture } = require('./lib/core-policy-golden');
const { test, assert, done } = createSuite('Shared core policy projection and semantic golden binding');
const root = path.resolve(import.meta.dirname, '..');
const serverRoot = path.join(root, 'plugins', 'data-secure', 'server');
const shared = Object.freeze([
  'privacy/base.js', 'privacy/credential-catalog.js', 'privacy/credential-catalog.json',
  'privacy/credentials.js', 'privacy/engine.js', 'privacy/entities.js', 'privacy/iban-boundary.js',
  'privacy/personnel.js', 'privacy/policy.js', 'privacy/spans.js', 'privacy/structured.js',
  'pii-engine.js', 'resource-limits.js', 'core/batch-next-action.js',
  'core/conversion-worker-contract.js', 'core/document-result-grade.js', 'core/processing-mode.js'
].sort());
const plugin = new Map(collectProductFiles(path.dirname(serverRoot))
  .filter(file => file.archivePath.startsWith('server/'))
  .map(file => [file.archivePath.slice(7), fs.readFileSync(file.fullPath)]));
const standalone = new Map(collectStandaloneRuntime(serverRoot, 'windows-x64')
  .map(file => [file.relative, file.bytes]));

function fingerprint(entries) {
  assert.deepEqual([...entries.keys()].filter(name => name.startsWith('privacy/')).sort(),
    shared.filter(name => name.startsWith('privacy/')),
    'a new privacy module must be explicitly included in the binding');
  const hash = crypto.createHash('sha256').update('datasecure-shared-policy-test/1\n');
  for (const name of shared) {
    const bytes = entries.get(name);
    assert.ok(Buffer.isBuffer(bytes), `missing shared module: ${name}`);
    hash.update(JSON.stringify([name, bytes.length]) + '\n').update(bytes);
  }
  return hash.digest('hex');
}

test('the actual product projections contain byte-identical selected shared code and policy data', () => {
  assert.equal(fingerprint(plugin), fingerprint(standalone));
  assert.equal(fingerprint(plugin), fingerprint(new Map([...plugin].reverse())));
  assert.equal(standalone.has('mcp-server.js'), false);
  assert.equal(plugin.has('standalone/desktop-sidecar.js'), false);
});

test('changed, missing and newly unbound policy modules cannot silently retain the fingerprint', () => {
  const changed = new Map(standalone);
  changed.set('privacy/credential-catalog.json', Buffer.concat([
    changed.get('privacy/credential-catalog.json'), Buffer.from('\n ')
  ]));
  assert.notEqual(fingerprint(plugin), fingerprint(changed));
  const missing = new Map(standalone);
  missing.delete('core/document-result-grade.js');
  assert.throws(() => fingerprint(missing), /missing shared module/u);
  const extra = new Map(standalone);
  extra.set('privacy/future-policy.js', Buffer.from('module.exports = {};'));
  assert.throws(() => fingerprint(extra), /explicitly included/u);
});

test('semantic canonicalization detects identity collapse, new identities, raw data and lost business text', () => {
  assert.deepEqual(canonicalizeBodies(['[KUNDE_ABCDEF] [KUNDE_GHIJKL]', '[KUNDE_ABCDEF]']),
    ['[COMPANY_1] [COMPANY_2]', '[COMPANY_1]']);
  assert.deepEqual(canonicalizeBodies(['[ARBEITGEBER_001]']), ['[ARBEITGEBER_001]'],
    'a legacy role-only marker must never masquerade as an entity identity');
  const bodies = expected.map(body => body.replaceAll('[PERSON_1]', '[PERSON_001]')
    .replaceAll('[PERSON_2]', '[PERSON_002]').replaceAll('[COMPANY_1]', '[UNTERNEHMEN_001]')
    .replaceAll('[COMPANY_2]', '[UNTERNEHMEN_002]'));
  assert.deepEqual(canonicalizeBodies(bodies), expected);
  const mutations = [
    [2, bodies[2].replace('[PERSON_002]', '[PERSON_001]')],
    [1, bodies[1].replace('[PERSON_001]', '[PERSON_003]')],
    [2, bodies[2].replace('[UNTERNEHMEN_002]', '[UNTERNEHMEN_001]')],
    [0, bodies[0].replace('[PERSON_001]', 'Erika Beispiel')],
    [0, bodies[0].replace('Product Owner', '[PERSON_003]')]
  ];
  for (const [index, body] of mutations) {
    const changed = [...bodies]; changed[index] = body;
    assert.notDeepEqual(canonicalizeBodies(changed), expected);
  }
});

test('four real source encodings bind five explicit profiles without normalizing away profile or format differences', () => {
  assert.deepEqual(formats, ['txt', 'md', 'csv', 'docx']);
  assert.deepEqual(profiles, ['general', 'contract', 'customer', 'applicant', 'personnel_profile']);
  const matrix = profiles.map(profile => formats.map(format => goldenFixture(format, profile)));
  for (const row of matrix) {
    assert.equal(new Set(row.map(fixture => crypto.createHash('sha256').update(fixture.bytes).digest('hex'))).size, 4);
    assert.equal(new Set(row.map(fixture => fixture.expected)).size, 4);
    assert.equal(row[3].bytes.readUInt32LE(0), 0x04034b50);
    assert.match(row[2].bytes.toString(), /^"Feld","Wert"\r\n/u);
  }
  for (let format = 0; format < formats.length; format++) {
    assert.equal(matrix[0][format].expected, matrix[1][format].expected);
    assert.notEqual(matrix[0][format].expected, matrix[2][format].expected, 'customer URL policy must be observable');
    assert.notEqual(matrix[2][format].expected, matrix[3][format].expected, 'applicant location policy must be observable');
    assert.equal(matrix[3][format].expected, matrix[4][format].expected);
  }
});

// Owned synthetic directories only. No source/installed product path is ever
// cleaned; copied product files are bytes, never links to real user data.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-core-policy-'));
const temporaryIdentity = fs.lstatSync(temporary, { bigint: true });
try {
  for (const profile of profiles) {
    test(`both projected products preserve TXT/MD/CSV/DOCX semantics across abort, restart and review (${profile})`, () => {
      const outputs = [];
      for (const [channel, entries] of [['plugin', plugin], ['standalone', standalone]]) {
        const directory = path.join(temporary, `golden-${channel}-${profile}`);
        fs.mkdirSync(directory);
        for (const [relative, bytes] of entries) {
          const target = path.join(directory, 'server', ...relative.split('/'));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o700 });
        }
        const worker = path.join(import.meta.dirname, 'lib', 'core-policy-product-worker.js');
        const stages = ['prepare', 'resume', ...(reviewProfiles.includes(profile) ? ['review'] : [])];
        const results = stages.map(stage => {
          const output = execFileSync(process.execPath, [worker, directory, channel, profile, stage], {
            cwd: directory, windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024,
            // Fresh module graphs prove durable continuation, not in-memory
            // alias reuse. Fixed phases diagnose bounded child failures only.
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NODE_OPTIONS: '', DATASECURE_PRODUCT_CHANNEL: channel }
          }).toString('utf8');
          const result = JSON.parse(output);
          assert.equal(result.stage, stage);
          return result;
        });
        outputs.push(results);
      }
      assert.deepEqual(outputs[0], outputs[1]);
    });
  }
} finally {
  const current = fs.lstatSync(temporary, { bigint: true });
  assert.ok(current.isDirectory() && !current.isSymbolicLink());
  assert.equal(current.dev, temporaryIdentity.dev);
  assert.equal(current.ino, temporaryIdentity.ino);
  const verifyTree = directory => {
    for (const entry of fs.readdirSync(directory)) {
      const full = path.join(directory, entry), stat = fs.lstatSync(full);
      assert.equal(stat.isSymbolicLink(), false, 'never traverse a cleanup link');
      if (stat.isDirectory()) verifyTree(full);
    }
  };
  verifyTree(temporary);
  fs.rmSync(temporary, { recursive: true });
}
await done();
