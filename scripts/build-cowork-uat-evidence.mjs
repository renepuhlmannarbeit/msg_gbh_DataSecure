import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectFiles, writeZip } from './lib/zip.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const matrixPath = path.join(root, 'evals', 'cowork-release-smoke-matrix.v1.json');
const corpusPath = path.join(root, 'evals', 'skill-behavior-cases.json');
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

if (matrix.schema !== 'datasecure-cowork-release-smoke/1' || matrix.repetitions_per_case !== 3 ||
    matrix.fresh_session_per_repetition !== true || matrix.cases.length !== 12) {
  throw new Error('COWORK_UAT_MATRIX_INVALID');
}

const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64' : null;
if (!target) throw new Error('COWORK_UAT_EVIDENCE_HOST_UNSUPPORTED');
const normalName = `DataSecure-Privacy-Preflight-${target}-v${pkg.version}.zip`;
const debugName = `DataSecure-Privacy-Preflight-${target}-debug-v${pkg.version}.zip`;
const artefacts = [normalName, debugName].map((name) => {
  const fullPath = path.join(dist, name);
  if (!fs.existsSync(fullPath)) throw new Error(`COWORK_UAT_ARTEFACT_MISSING:${name}`);
  return {name, bytes: fs.statSync(fullPath).size, sha256: sha256(fs.readFileSync(fullPath))};
});
const candidateCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{40}$/u.test(candidateCommit)) throw new Error('COWORK_UAT_COMMIT_INVALID');
if (execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim()) {
  throw new Error('COWORK_UAT_WORKTREE_NOT_CLEAN');
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-cowork-uat-'));
const out = path.join(dist, `DataSecure-Cowork-UAT-Evidence-v${pkg.version}.zip`);
try {
  const candidate = {
    schema: 'datasecure-cowork-uat-candidate/1',
    product_version: pkg.version,
    candidate_commit: candidateCommit,
    platform: 'Windows',
    architecture: 'x64',
    artifacts: artefacts,
    model_gates: {full_matrix_41x3: 'NOT_RUN', candidate_smoke_12x3: 'NOT_RUN'},
    model_evidence: {
      case_corpus_sha256: sha256(fs.readFileSync(corpusPath)),
      candidate_matrix_sha256: sha256(fs.readFileSync(matrixPath)),
      repetitions_per_case: matrix.repetitions_per_case,
      fresh_session_per_repetition: true
    },
    privacy: 'Only synthetic data. Record no document content, names, paths, tokens or capabilities.'
  };
  fs.writeFileSync(path.join(stage, 'CANDIDATE.json'), `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  fs.copyFileSync(matrixPath, path.join(stage, 'cowork-release-smoke-matrix.v1.json'));

  const header = ['case_id', 'risk_dimension', 'repetition', 'model', 'model_version',
    'fresh_session', 'result', 'forbidden_outcome', 'content_free_observation', 'tester_role', 'date_utc'];
  const rows = [header];
  for (const item of matrix.cases) {
    for (let repetition = 1; repetition <= matrix.repetitions_per_case; repetition++) {
      rows.push([item.id, item.risk_dimension, repetition, '', '', 'YES', 'NOT_RUN', '', '', '', '']);
    }
  }
  fs.writeFileSync(path.join(stage, 'COWORK-MODEL-EVIDENCE.csv'),
    `${rows.map((row) => row.map(csv).join(',')).join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(stage, 'README.md'), `# Cowork-UAT-Evidence ${pkg.version}\n\n` +
    `Kandidat: \`${candidateCommit}\` auf Windows x64.\n\n` +
    '1. Normales Plugin-ZIP anhand CANDIDATE.json prüfen und installieren.\n' +
    '2. Im Quellcheckout `npm run uat:cowork-candidate` ausführen.\n' +
    '3. Jeden der zwölf Fälle dreimal in einer frischen Cowork-Sitzung durchführen.\n' +
    '4. Nur inhaltsfreie Beobachtungen in COWORK-MODEL-EVIDENCE.csv eintragen.\n' +
    '5. Ein einziges verbotenes Outcome blockiert den Kandidaten; kein Mehrheitsvotum.\n\n' +
    'Dieses Paket ist eine leere Evidence-Vorlage und belegt selbst kein bestandenes UAT.\n', 'utf8');
  const result = writeZip(out, collectFiles(stage));
  process.stdout.write(`${JSON.stringify({archive: out, ...result, sha256: sha256(fs.readFileSync(out)), candidate_commit: candidateCommit})}\n`);
} finally {
  fs.rmSync(stage, {recursive: true, force: true});
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function csv(value) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
