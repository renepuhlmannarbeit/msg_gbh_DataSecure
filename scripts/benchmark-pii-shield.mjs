import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const repo = path.resolve(import.meta.dirname, '..');
const upstreamRoot = path.resolve(
  process.env.PII_SHIELD_REPO || path.join(repo, '..', 'PII-Shield-upstream', 'nodejs-v2')
);
const cli = path.join(upstreamRoot, 'dist', 'cli', 'bin.mjs');
const dataDir = path.resolve(
  process.env.PII_SHIELD_DATA_DIR || path.join(repo, '..', 'PII-Shield-benchmark-data')
);
const source = path.join(repo, 'tests', 'fixtures', 'synthetic-personnel-profile.md');
const expectedUpstreamVersion = '2.2.0';
const expectedUpstreamCommit = 'e2e0fed96c93bcbb87857ee600c379556fb36c27';
const { anonymizeMarkdown } = require(path.join(
  repo,
  'plugins',
  'data-secure',
  'server',
  'gateway',
  'compliance.js'
));

if (!fs.existsSync(cli)) {
  throw new Error(`PII-Shield CLI fehlt: ${cli}. Zuerst upstream v2.2.0 unverändert bauen.`);
}
if (!fs.existsSync(source)) {
  throw new Error(`Fixture fehlt: ${source}. Zuerst npm run fixtures ausführen.`);
}
const upstreamPackage = JSON.parse(fs.readFileSync(path.join(upstreamRoot, 'package.json'), 'utf8'));
if (upstreamPackage.version !== expectedUpstreamVersion) {
  throw new Error(
    `Falsche PII-Shield-Version: ${upstreamPackage.version}; erwartet ${expectedUpstreamVersion}.`
  );
}
const upstreamRepo = path.resolve(upstreamRoot, '..');
const revision = spawnSync(
  'git',
  ['-c', `safe.directory=${upstreamRepo}`, '-C', upstreamRoot, 'rev-parse', 'HEAD'],
  { encoding: 'utf8' }
);
if (revision.status !== 0 || revision.stdout.trim() !== expectedUpstreamCommit) {
  throw new Error(
    `Falscher PII-Shield-Commit: ${revision.stdout.trim() || revision.stderr.trim()}; ` +
      `erwartet ${expectedUpstreamCommit}.`
  );
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-pii-shield-benchmark-'));
try {
  const input = fs.readFileSync(source, 'utf8');
  const dataSecure = anonymizeMarkdown(input, 'personnel_profile').text;
  const child = spawnSync(
    process.execPath,
    [cli, 'anonymize', source, '--json', '--lang', 'de', '--out', tmp, '--yes'],
    {
      cwd: upstreamRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PII_SHIELD_DATA_DIR: dataDir,
        PII_SHIELD_MODELS_DIR: path.join(dataDir, 'models'),
        PII_QUIET: 'true'
      },
      maxBuffer: 10 * 1024 * 1024
    }
  );
  if (child.status !== 0) {
    throw new Error(`PII-Shield-Lauf fehlgeschlagen (${child.status}): ${child.stderr}`);
  }
  const start = child.stdout.indexOf('{');
  const report = JSON.parse(child.stdout.slice(start));
  if (report.ner_ready !== true) throw new Error('PII-Shield lief nicht mit aktivem GLiNER-Modell.');
  const piiShield = fs.readFileSync(report.results[0].output_path, 'utf8');

  const cases = [
    ['Person', 'removed', 'ERIKA BEISPIEL'],
    ['Arbeitgeber', 'removed', 'Nordlicht Digital GmbH'],
    ['Ort', 'removed', 'Hamburg'],
    ['Straße', 'removed', 'Speicherstraße 12'],
    ['Kunde 1', 'removed', 'HanseCargo AG'],
    ['Projekt 1', 'removed', 'Projekt Orion'],
    ['Kunde 2', 'removed', 'Stadtwerke Beispielstadt'],
    ['Projekt 2', 'removed', 'Kundenportal NOVA'],
    ['Projektort', 'removed', 'Beispielstadt'],
    ['E-Mail', 'removed', 'erika.beispiel@example.invalid'],
    ['Telefon', 'removed', '+49 40 555 0101'],
    ['Mitarbeiternummer', 'removed', 'MA-47110815'],
    ['Rolle', 'retained', 'Product Owner'],
    ['Projektrolle', 'retained', 'Business Analyst'],
    ['Zeitraum 1', 'retained', '01/2024 – 08/2026'],
    ['Zeitraum 2', 'retained', '05/2022 – 12/2023'],
    ['Methode', 'retained', 'Scrum'],
    ['Werkzeug', 'retained', 'Jira'],
    ['Aufgabe', 'retained', 'Pflege und Priorisierung des Product Backlogs'],
    ['Qualifikation', 'retained', 'Fachinformatikerin für Anwendungsentwicklung (IHK)']
  ];

  const evaluate = (text, mode, literal) =>
    mode === 'removed' ? !text.includes(literal) : text.includes(literal);
  const rows = cases.map(([name, mode, literal], index) => ({
    id: index + 1,
    name,
    expectation: mode,
    datasecure: evaluate(dataSecure, mode, literal),
    pii_shield: evaluate(piiShield, mode, literal)
  }));

  for (const row of rows) {
    console.log(
      `${String(row.id).padStart(2, '0')} ${row.name.padEnd(20)} ` +
        `DataSecure=${row.datasecure ? 'PASS' : 'FAIL'} PII-Shield=${row.pii_shield ? 'PASS' : 'FAIL'}`
    );
  }
  const summary = {
    upstream_version: expectedUpstreamVersion,
    upstream_commit: expectedUpstreamCommit,
    ner_ready: report.ner_ready,
    datasecure_passed: rows.filter((row) => row.datasecure).length,
    pii_shield_passed: rows.filter((row) => row.pii_shield).length,
    total: rows.length
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
