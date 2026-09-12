import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { collectFiles, writeZip } from './lib/zip.mjs';
import { bindVerifiedArchive } from './lib/cowork-candidate.mjs';

const require = createRequire(import.meta.url);
const { validateSmokePlan } = require('./lib/cowork-smoke-plan.cjs');
const { expectedFiles } = require('../docs/acceptance/UAT_TEST_KIT/tools/generate-synthetic-uat-fixtures.js');
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const matrixPath = path.join(root, 'evals', 'cowork-release-smoke-matrix.v1.json');
const corpusPath = path.join(root, 'evals', 'skill-behavior-cases.json');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function csv(value) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function requiredOption(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1] || argv[index + 1].startsWith('--')) {
    throw new Error(`COWORK_UAT_${name.slice(2).replaceAll('-', '_').toUpperCase()}_REQUIRED`);
  }
  return argv[index + 1];
}

export function parseCandidateArguments(argv) {
  return Object.freeze({
    normalZip: requiredOption(argv, '--normal-zip'),
    debugZip: requiredOption(argv, '--debug-zip'),
    candidateCommit: requiredOption(argv, '--candidate-commit')
  });
}

function currentWindowsTarget() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('COWORK_UAT_EVIDENCE_HOST_UNSUPPORTED');
  return 'windows-x64';
}

function exactCandidateArchive(rawPath, expectedName) {
  const file = path.resolve(rawPath);
  if (path.dirname(file) !== dist || path.basename(file) !== expectedName) {
    throw new Error('COWORK_UAT_ARTEFACT_PATH_INVALID');
  }
  let stat;
  try { stat = fs.lstatSync(file); }
  catch { throw new Error(`COWORK_UAT_ARTEFACT_MISSING:${expectedName}`); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1024) throw new Error('COWORK_UAT_ARTEFACT_INVALID');
  return file;
}

function currentCandidateCommit(value) {
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error('COWORK_UAT_COMMIT_INVALID');
  const resolved = execFileSync('git', ['rev-parse', `${value}^{commit}`], {cwd: root, encoding: 'utf8'}).trim();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  if (resolved !== value || head !== value) throw new Error('COWORK_UAT_COMMIT_NOT_CURRENT');
  if (execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim()) {
    throw new Error('COWORK_UAT_WORKTREE_NOT_CLEAN');
  }
  return value;
}

export function readVerifiedArchive(file, expectedMode, target) {
  // Require native evidence and match the verifier's original snapshot hash.
  // Replacing a same-named archive before this second read must fail closed.
  const verified = execFileSync(process.execPath,
    [path.join(root, 'scripts', 'verify-plugin-zip.mjs'), '--archive', file, '--require-native', '--report-json'],
    {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  const bytes = fs.readFileSync(file);
  let report;
  try { report = JSON.parse(verified.trim().split(/\r?\n/u).at(-1)); }
  catch { throw new Error('COWORK_UAT_VERIFIER_REPORT_INVALID'); }
  return bindVerifiedArchive(bytes, report, {name: path.basename(file), version: pkg.version, mode: expectedMode, target});
}

function readMatrix() {
  const matrixBytes = fs.readFileSync(matrixPath);
  const corpusBytes = fs.readFileSync(corpusPath);
  const matrix = JSON.parse(matrixBytes);
  if (matrix.schema !== 'datasecure-cowork-release-smoke/1' || matrix.repetitions_per_case !== 3 ||
      matrix.fresh_session_per_repetition !== true || !Array.isArray(matrix.cases) || matrix.cases.length !== 12) {
    throw new Error('COWORK_UAT_MATRIX_INVALID');
  }
  validateSmokePlan(matrix, JSON.parse(corpusBytes), {root, uatFiles: expectedFiles()});
  return {matrix, matrixBytes, corpusBytes};
}

export function buildCoworkUatEvidence(options = {}) {
  const args = options.arguments || parseCandidateArguments(options.argv || process.argv.slice(2));
  const target = currentWindowsTarget();
  const {matrix, matrixBytes, corpusBytes} = readMatrix();
  const normalName = `DataSecure-Privacy-Preflight-${target}-v${pkg.version}.zip`;
  const debugName = `DataSecure-Privacy-Preflight-${target}-debug-v${pkg.version}.zip`;
  const normalZip = exactCandidateArchive(args.normalZip, normalName);
  const debugZip = exactCandidateArchive(args.debugZip, debugName);
  const commit = currentCandidateCommit(args.candidateCommit);
  const artifacts = [
    readVerifiedArchive(normalZip, 'direct-upload-target', target),
    readVerifiedArchive(debugZip, 'direct-upload-debug-target', target)
  ];
  if (artifacts.some((artifact) => artifact.source_commit !== commit)) throw new Error('COWORK_UAT_ARTEFACT_COMMIT_MISMATCH');
  // Native smokes may take time; reject edits or a checkout switch during them.
  currentCandidateCommit(commit);

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-cowork-uat-'));
  const out = path.join(dist, `DataSecure-Cowork-UAT-Evidence-v${pkg.version}.zip`);
  try {
    const candidate = {
      schema: 'datasecure-cowork-uat-candidate/2',
      product_version: pkg.version,
      candidate_commit: commit,
      platform: 'Windows',
      architecture: 'x64',
      artifacts,
      artifact_binding: 'Explicit filenames; native Cowork ZIP verifier snapshot hashes match the UAT archive bytes. No Standalone PKG-04 claim.',
      model_gates: {full_matrix_41x3: 'NOT_RUN', candidate_smoke_12x3: 'NOT_RUN'},
      model_evidence: {
        case_corpus_sha256: sha256(corpusBytes),
        candidate_matrix_sha256: sha256(matrixBytes),
        repetitions_per_case: matrix.repetitions_per_case,
        fresh_session_per_repetition: true
      },
      privacy: 'Only synthetic data. Record no document content, names, paths, tokens or capabilities.'
    };
    fs.writeFileSync(path.join(stage, 'CANDIDATE.json'), `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(stage, 'cowork-release-smoke-matrix.v1.json'), matrixBytes);
    const header = ['case_id', 'risk_dimension', 'repetition', 'model', 'model_version',
      'fresh_session', 'precondition_result', 'result', 'forbidden_outcome', 'content_free_observation', 'tester_role', 'date_utc'];
    const rows = [header];
    for (const item of matrix.cases) {
      for (let repetition = 1; repetition <= matrix.repetitions_per_case; repetition++) {
        rows.push([item.id, item.risk_dimension, repetition, '', '', 'YES', 'NOT_RUN', 'NOT_RUN', '', '', '', '']);
      }
    }
    fs.writeFileSync(path.join(stage, 'COWORK-MODEL-EVIDENCE.csv'),
      `${rows.map((row) => row.map(csv).join(',')).join('\n')}\n`, 'utf8');
    fs.writeFileSync(path.join(stage, 'README.md'), `# Cowork-UAT-Evidence ${pkg.version}\n\n` +
      `Kandidat: \`${commit}\` auf Windows x64.\n\n` +
      '1. Beide Plugin-ZIPs anhand CANDIDATE.json prüfen und jeweils in einer frischen Claude-Desktop-Installation installieren.\n' +
      '2. Im exakt gebundenen Quellcheckout `npm run uat:cowork-candidate` ausführen.\n' +
      '3. Jeden der zwölf Fälle dreimal in einer frischen Cowork-Sitzung durchführen. Vorbedingung real beobachten: precondition_result=OBSERVED; andernfalls beide Ergebnisfelder BLOCKED, niemals PASS.\n' +
      '4. Nur inhaltsfreie Beobachtungen in COWORK-MODEL-EVIDENCE.csv eintragen.\n' +
      '5. Ein einziges verbotenes Outcome blockiert den Kandidaten; kein Mehrheitsvotum.\n\n' +
      'Dieses Paket ist eine leere Evidence-Vorlage und belegt selbst kein bestandenes UAT.\n', 'utf8');
    const result = writeZip(out, collectFiles(stage));
    return {archive: out, ...result, sha256: sha256(fs.readFileSync(out)), candidate_commit: commit};
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.stdout.write(`${JSON.stringify(buildCoworkUatEvidence())}\n`);
}
