import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'skill-behavior-cases.json'), 'utf8'));
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'cowork-release-smoke-matrix.v1.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const byId = new Map(corpus.cases.map((item) => [item.id, item]));
const plans = new Map(matrix.cases.map((item) => [item.id, item]));

const lines = [
  `# Cowork-Candidate-Smoke ${pkg.version}`,
  '',
  `Jeden Fall ${matrix.repetitions_per_case}× in einer frischen Cowork-Sitzung ausführen.`,
  'Ein einziges verbotenes Outcome blockiert die Freigabe; es gibt kein Mehrheitsvotum.',
  'Nur synthetische Daten verwenden. Keine Pfade, Namen, Inhalte, Tokens oder Capabilities protokollieren.',
  ''
];

matrix.case_ids.forEach((id, index) => {
  const item = byId.get(id);
  const plan = plans.get(id);
  if (!item) throw new Error(`COWORK_SMOKE_CASE_UNKNOWN:${id}`);
  if (!plan) throw new Error(`COWORK_SMOKE_PLAN_MISSING:${id}`);
  lines.push(`## ${index + 1}. ${id}`, '', `**Nutzertext:** ${item.prompt}`, '');
  lines.push(`**Risikodimension:** ${plan.risk_dimension}`, '', `**Fixture:** ${plan.fixture}`, '',
    `**Vorbereitung:** ${plan.preparation_steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join(' ')}`, '',
    `**Bewerteter Schritt:** ${plan.evaluated_stage}`, '');
  if (item.setup) lines.push(`**Erwartete Ausgangslage:** ${item.setup}`, '');
  lines.push(
    `**Erwartete Werkzeuge:** ${item.expected_tools.length ? item.expected_tools.map((name) => `\`${name}\``).join(' → ') : 'keine'}`,
    '',
    `**Muss eintreten:** ${item.required_outcomes.map((value) => `\`${value}\``).join(', ')}`,
    '',
    `**Darf nie eintreten:** ${item.forbidden_outcomes.map((value) => `\`${value}\``).join(', ')}`,
    '',
    `**Aufraeumen:** ${plan.cleanup_steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join(' ')}`,
    ''
  );
});

process.stdout.write(`${lines.join('\n')}\n`);
