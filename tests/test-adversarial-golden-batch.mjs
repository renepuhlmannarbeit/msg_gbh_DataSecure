import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';
import { generate, identities, reviewCandidates } from '../scripts/generate-adversarial-golden-corpus.mjs';
import { writeStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from '../scripts/lib/standalone-conversion-runtime.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
import { semanticText, comparable, assertNoIdentityLeak, assertTechnicalAnchors, assertCrossDocumentPseudonyms } from './lib/adversarial-golden-oracle.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(import.meta.dirname, '..');
const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
  : process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch) ? `macos-${process.arch}`
    : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64-glibc' : null;
assert.ok(target, 'ADVERSARIAL_GOLDEN_HOST_UNSUPPORTED');
const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-adversarial-'));
const server = path.join(scope, 'server');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const savedEnvironment = new Map();
// Synthetic human-review oracle, never a runtime allowlist. Competing all-caps
// titles require per-occurrence decisions. Every other residual hypothesis,
// including damaged OCR names, is explicitly redacted by this conservative
// synthetic reviewer. Independent technical anchors catch over-redaction.
const syntheticTitles = new Set(['SYNTHETISCHER HÄRTETEST', 'SYNTHETISCHER HAERTETEST']);
const originalSpawn = childProcess.spawn, children = [];
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args), entry = { child, closed: false };
  entry.done = new Promise(resolve => child.once('close', () => { entry.closed = true; resolve(); }));
  children.push(entry);
  return child;
};

try {
  for (const [key, value] of Object.entries({ DATASECURE_PRODUCT_CHANNEL: 'standalone',
    EU_PRIVACY_DATA_ROOT: path.join(scope, 'data'), EU_PRIVACY_ROOT: path.join(scope, 'private'),
    EU_PRIVACY_RESULT_ROOT: path.join(scope, 'visible'), LOCALAPPDATA: path.join(scope, 'localapp') })) {
    savedEnvironment.set(key, process.env[key]); process.env[key] = value;
  }
  fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
  writeStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), server, target);
  writeConversionRuntime(repo, path.join(server, 'standalone/conversion-runtime'), target);
  const kit = path.join(scope, 'kit'); generate(kit);
  const expected = JSON.parse(fs.readFileSync(path.join(kit, 'ERWARTUNGEN.json'), 'utf8'));
  assert.equal(expected.files.length, 16);
  const batch = require(path.join(server, 'gateway/batch'));
  const pii = require(path.join(server, 'pii-engine'));
  const diagnostics = process.argv.includes('--diagnostics');
  const realScanResidual = pii.scanResidual;
  let observedResidual = [];
  pii.scanResidual = (...args) => {
    const residual = realScanResidual(...args); observedResidual = residual; return residual;
  };
  const { enumerateSourceFolderAsync } = require(path.join(server, 'companion/source-folder'));
  const { readOutput } = require(path.join(server, 'gateway/package-store'));
  const { readMarkdownArtifact } = require(path.join(server, 'standalone/markdown-store'));
  const { visibleExportDirectory } = require(path.join(server, 'gateway/result-export'));
  const { saveConfiguredResultRoot } = require(path.join(server, 'gateway/result-folder-config'));
  saveConfiguredResultRoot(process.env.EU_PRIVACY_RESULT_ROOT);
  const input = path.join(kit, 'EINGABEN');
  const admitted = await enumerateSourceFolderAsync(input, {
    allowedTypes: ['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp']
  });
  assert.equal(admitted.length, 16);
  const queue = admitted.map(entry => ({ full: entry.sourcePath, name: path.basename(entry.sourcePath),
    sourceLabel: entry.sourceLabel, sourceBytes: entry.sourceBytes }));
  const numberFor = item => Number(item.name.slice(0, 2));
  const noReview = () => { throw new Error('Unexpected interactive review during automatic batch'); };
  const converted = new Map(), anonymized = new Map();
  let reviewedDisclaimers = 0, reviewedTitles = 0;
  const problems = [];
  const check = operation => { try { operation(); } catch (error) { problems.push(error.message); } };
  function readEntirePackage(result) {
    let offset = 0, text = '';
    for (let page = 0; page < 100; page++) {
      const response = readOutput(result.package_id, result.read_capability, offset, 30000);
      assert.equal(response.content_is_verified_anonymized_markdown, true);
      text += response.text;
      if (!response.has_more) { assert.equal(text.length, response.total_chars); return text; }
      assert.ok(response.next_offset > offset); offset = response.next_offset;
    }
    throw new Error('GOLDEN_PACKAGE_PAGING_UNBOUNDED');
  }
  for (const processingMode of ['markdown-only', 'markdown-and-anonymize']) {
    const started = batch.beginBatch({ expectedCount: queue.length, profile: 'personnel_profile', processingMode, queue });
    const token = started.batch_token;
    const outputs = processingMode === 'markdown-only' ? converted : anonymized;
    const capture = result => {
      const journal = batch._test.readState(token);
      const item = journal.items.find(item => result.artifact_id ? item.artifact_id === result.artifact_id : item.package_id === result.package_id);
      assert.ok(item, 'publication must belong to a persisted batch item');
      const text = processingMode === 'markdown-only' ? readMarkdownArtifact(result.artifact_id).markdown : readEntirePackage(result);
      outputs.set(numberFor(item), text);
      if (diagnostics && processingMode === 'markdown-and-anonymize') {
        process.stdout.write(`golden publication ${numberFor(item)}: title=${semanticText(text).includes('SYNTHETISCHER HÄRTETEST')}\n`);
      }
      batch.finalizePublishedPackageLocally(token, result.artifact_id || result.package_id);
    };
    for (let index = 0; index < 16; index++) {
      observedResidual = [];
      const result = await batch.processBatchNext(token, { reviewTextLocally: noReview });
      if (result.ok && (result.artifact_id || result.package_id)) capture(result);
      else assert.equal(result.package_id, undefined, 'failed/deferred positions cannot publish');
      process.stdout.write(`golden ${processingMode} ${index + 1}/16: ${result.ok ? 'published' : result.error}\n`);
      if (diagnostics && result.error === 'RESIDUAL_PII') {
        process.stdout.write(`golden diagnostic actual residual fixture ${index + 1}: ${JSON.stringify(observedResidual)}\n`);
      }
    }
    if (batch.readBatchProgress(token).deferred_review) {
      assert.equal(processingMode, 'markdown-and-anonymize');
      const reviewed = await batch.reviewDeferredBatch(token, { reviewTextLocally(draft) {
        return { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map(item => {
          const value = semanticText(draft.original_text.slice(item.original_start, item.original_end));
          if (diagnostics) process.stdout.write(`golden review candidate ${item.type}: ${JSON.stringify(value)}\n`);
          if (item.type === 'person_residual_ambiguous') {
            if (syntheticTitles.has(value)) reviewedTitles++;
            else if (value === 'KEINE REALDATEN') reviewedDisclaimers++;
            else return { ambiguity_id: item.ambiguity_id, decision: 'redact' };
            return { ambiguity_id: item.ambiguity_id, decision: 'keep' };
          }
          const knownPerson = [...identities.map(identity => identity.shortPerson), ...reviewCandidates].includes(value);
          assert.ok(knownPerson, `golden review requires an independently specified decision: ${value}`);
          return { ambiguity_id: item.ambiguity_id, decision: 'redact' };
        }) };
      } });
      for (const result of reviewed.packages || []) capture(result);
      assert.ok(reviewed.ok, `${processingMode}: local review failed ${JSON.stringify(reviewed)}`);
    }
    const journal = batch._test.readState(token);
    for (const item of journal.items) {
      const fixture = numberFor(item);
      if (item.status !== 'released') {
        problems.push(`${processingMode} fixture ${fixture}: ${item.status}/${item.error_code || item.error || item.stop_reason || 'no result'}`);
      }
    }
    batch.exportCompletedBatchResults(token);
    const visible = visibleExportDirectory(token);
    assert.ok(visible, `${processingMode}: terminal publication must have an exact visible folder`);
    const visibleFiles = fs.readdirSync(visible, { recursive: true }).filter(file => file.endsWith('.md'));
    assert.equal(visibleFiles.length, outputs.size, 'visible projection must have exactly the released artifacts');
    for (const file of visibleFiles) {
      const text = fs.readFileSync(path.join(visible, file), 'utf8');
      assert.ok([...outputs.values()].includes(text), 'visible output must equal a verified artifact');
      if (processingMode === 'markdown-and-anonymize') check(() => assertNoIdentityLeak(text, `visible ${file}`));
    }
    for (const [number, text] of outputs) {
      check(() => assertTechnicalAnchors(text, number, `${processingMode} fixture ${number}`));
      if (processingMode === 'markdown-and-anonymize') check(() => assertNoIdentityLeak(text, `fixture ${number}`));
      if ([4, 5, 6].includes(number)) {
        if (processingMode === 'markdown-only') {
          assert.match(text, /VERTRAULICH/u); assert.match(text, /Seite TEST/u);
        } else {
          assert.doesNotMatch(text, /VERTRAULICH \||Seite TEST/u);
          assert.ok(semanticText(text).includes('KEINE REALDATEN'), 'intact technical notice must survive');
        }
      }
      if (diagnostics && processingMode === 'markdown-and-anonymize') {
        const content = semanticText(text).split('-->\n\n').at(-1);
        const street = content.indexOf('Rue Exemple');
        if (street >= 0) process.stdout.write(`golden diagnostic fixture ${number} address: ${content.slice(Math.max(0, street - 75), street + 90)}\n`);
        if (number >= 12) process.stdout.write(`golden diagnostic fixture ${number} published body: ${content.slice(0, 1400)}\n`);
        process.stdout.write(`golden diagnostic fixture ${number} primary markers: ${JSON.stringify(content.match(/\[(?:PERSON|UNTERNEHMEN)_\d+\]/gu)?.slice(0, 5))}\n`);
      }
    }
  }
  for (const source of expected.files) assert.equal(hash(fs.readFileSync(path.join(input, source.file))), source.sha256, 'source bytes must remain unchanged');
  // The conversion contract is deliberately the opposite of anonymization.
  const primary = [0, 1, 2, 0, 2, 1, 0, 2, 1, 2, 1, 1, 1, 0, 1, 2];
  for (const [number, text] of converted) {
    const identity = identities[primary[number - 1]];
    const anchors = number === 11 ? [identity.shortPerson, identity.company, identity.email]
      : [identity.shortPerson, identity.company, identity.email, identity.phone, identity.iban];
    for (const anchor of anchors) check(() => assert.ok(comparable(text).includes(comparable(anchor)),
      `fixture ${number}: conversion must retain ${anchor} (allowing OCR diacritics/spacing)`));
  }
  if (diagnostics) process.stdout.write(`golden diagnostic fixture 16 raw OCR: ${converted.get(16)}\n`);
  check(() => assertCrossDocumentPseudonyms(anonymized));
  assert.ok(children.length >= 16, 'real packaged conversion/parser workers must execute');
  assert.ok(children.every(entry => entry.closed), 'every real worker must have terminated');
  assert.deepEqual(problems, [], 'every corpus position must satisfy its exact publication oracle');
  assert.equal(reviewedDisclaimers, 0, 'without a poisoned title alias, intact DOCX disclaimers need no extra decision');
  assert.ok(reviewedTitles > 0, 'a competing all-caps title requires review before retaining it');
  assert.equal(converted.size, 16); assert.equal(anonymized.size, 16);
  process.stdout.write('Adversarial full batch: 16 real conversions, 16 anonymized publications after explicit local title/person review; no spurious DOCX disclaimer reviews; publication boundaries, identity/technical anchors and cross-document pseudonyms verified\n');
} finally {
  childProcess.spawn = originalSpawn;
  for (const entry of children) if (!entry.closed) entry.child.kill('SIGTERM');
  let timer;
  try { await Promise.race([Promise.all(children.map(entry => entry.done)), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('GOLDEN_WORKER_CLEANUP_UNCONFIRMED')), 6000);
  })]); } finally { clearTimeout(timer); }
  for (const [key, value] of savedEnvironment) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  removePackageSmokeScope(repo, scope);
}
