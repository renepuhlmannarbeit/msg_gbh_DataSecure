import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { summarizeSarif } from '../scripts/check-sarif.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-sarif-'));
const write = (name, results) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, JSON.stringify({ version: '2.1.0', runs: [{ results }] }));
  return file;
};

try {
  write('clean.sarif', []);
  assert.deepEqual(summarizeSarif(root), { files: 1, results: 0, rules: {} });
  fs.rmSync(path.join(root, 'clean.sarif'));

  const finding = write('finding.sarif', [
    { ruleId: 'js/example', message: { text: 'must not be printed' }, locations: [] }
  ]);
  assert.deepEqual(summarizeSarif(finding), {
    files: 1, results: 1, rules: { 'js/example': 1 }
  });
  const run = spawnSync(process.execPath, ['scripts/check-sarif.mjs', finding], {
    cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8'
  });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /"js\/example":1/);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /must not be printed/);

  assert.throws(() => summarizeSarif(path.join(root, 'missing')), /fehlt/);
  for (const runs of [[], [{}], [{ results: [], invocations: [{ executionSuccessful: false }] }]]) {
    const invalid = path.join(root, 'incomplete.sarif');
    fs.writeFileSync(invalid, JSON.stringify({ version: '2.1.0', runs }));
    assert.throws(() => summarizeSarif(invalid), /SARIF-/u);
  }
  const source = path.join(root, 'fixture.js');
  fs.writeFileSync(source, 'const fixture = true;\n');
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const exact = { ruleId: 'js/example', locations: [{ physicalLocation: {
    artifactLocation: { uri: 'fixture.js' }, region: { startLine: 1 } } }],
    partialFingerprints: { primaryLocationLineHash: 'approved-line:1', primaryLocationStartColumnFingerprint: '2' } };
  const triageFile = path.join(root, 'triage.json');
  fs.writeFileSync(triageFile, JSON.stringify({ schema: 'datasecure-codeql-triage/1', entries: [{
    rule: exact.ruleId, path: 'fixture.js', source_sha256: sourceHash,
    reason: 'Synthetic scoped counterexample, not shipped.', fingerprints: [{ line: 'approved-line:1', column: '2' }]
  }] }));
  const options = { triageFile, sourceRoot: root };
  const reviewed = write('reviewed.sarif', [exact]);
  assert.equal(summarizeSarif(reviewed, options).unreviewed, 0);
  const changedLocation = structuredClone(exact);
  changedLocation.partialFingerprints.primaryLocationStartColumnFingerprint = '3';
  assert.equal(summarizeSarif(write('new-location.sarif', [changedLocation]), options).unreviewed, 1);
  assert.equal(summarizeSarif(write('duplicate.sarif', [exact, exact]), options).unreviewed, 1);
  const changedRule = { ...exact, ruleId: 'js/new-danger' };
  assert.equal(summarizeSarif(write('new-rule.sarif', [changedRule]), options).unreviewed, 1);
  fs.writeFileSync(source, 'const fixture = false;\n');
  assert.equal(summarizeSarif(reviewed, options).unreviewed, 1, 'source edits invalidate the whole-file-bound waiver');
  fs.writeFileSync(source, 'const fixture = true;\r\n');
  assert.equal(summarizeSarif(reviewed, options).unreviewed, 0, 'Git LF/CRLF checkout does not invalidate identical source');
  process.stdout.write('SARIF release gate: 10 strict checks passed\n');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
