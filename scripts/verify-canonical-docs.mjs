import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.join(root, 'docs', 'canonical');
const required = ['README.md', 'DECISIONS.md', 'PRODUCT.md', 'BACKLOG.md', 'CURRENT_STATE.md', 'TRACEABILITY.md', 'TARGET_CAPABILITIES.json'];

for (const file of required) {
  if (!fs.existsSync(path.join(canonical, file))) throw new Error(`missing canonical document: ${file}`);
}

const read = (file) => fs.readFileSync(path.join(canonical, file), 'utf8');
const decisionsText = read('DECISIONS.md');
const backlogText = read('BACKLOG.md');
const currentText = read('CURRENT_STATE.md');
const traceText = read('TRACEABILITY.md');
const indexText = read('README.md');
const productText = read('PRODUCT.md');
const target = JSON.parse(read('TARGET_CAPABILITIES.json'));

const collect = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1]);
const decisions = collect(decisionsText, /^## (DS-\d{3})\b/gm);
const backlog = collect(backlogText, /^### (BL-\d{3})\b/gm);
const stories = collect(backlogText, /^#### (BL-\d{3}\.\d+)\b/gm);
const traceDecisions = collect(traceText, /^\| (DS-\d{3}) \|/gm);
const currentBacklog = collect(currentText, /^## (BL-\d{3})\b/gm);

const unique = (values, label) => {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`duplicate ${label}: ${[...new Set(duplicates)].join(', ')}`);
};

unique(decisions, 'decision ids');
unique(backlog, 'backlog ids');
unique(stories, 'backlog story ids');
unique(traceDecisions, 'traceability decision ids');
unique(currentBacklog, 'current-state backlog ids');
if (!decisions.length || !backlog.length || !stories.length) {
  throw new Error('canonical decisions, epics, or stories are empty');
}

for (const id of stories) {
  const parent = id.slice(0, 6);
  if (!backlog.includes(parent)) throw new Error(`story references unknown parent epic: ${id}`);
  const escaped = id.replace('.', '\\.');
  const section = backlogText.match(new RegExp(`^#### ${escaped}\\b[\\s\\S]*?(?=^#### |^### |(?![\\s\\S]))`, 'm'))?.[0] ?? '';
  if (!/^Status: \*\*(erledigt|in Arbeit|offen|blockiert)\*\*/m.test(section)) {
    throw new Error(`story has no valid status: ${id}`);
  }
}

for (const id of decisions) {
  if (!traceDecisions.includes(id)) throw new Error(`decision missing from traceability: ${id}`);
  if (!backlogText.includes(id)) throw new Error(`decision missing from backlog: ${id}`);
}
if (target.contract !== 'target-only-not-runtime') throw new Error('target capability contract is not clearly target-only');
if (JSON.stringify(target.decision_ids) !== JSON.stringify(decisions)) {
  throw new Error('target capability contract does not cover the accepted decisions exactly');
}
for (const id of traceDecisions) {
  if (!decisions.includes(id)) throw new Error(`traceability references unknown decision: ${id}`);
}
for (const id of backlog) {
  if (!currentBacklog.includes(id)) throw new Error(`backlog item missing from current-state audit: ${id}`);
}
for (const id of currentBacklog) {
  if (!backlog.includes(id)) throw new Error(`current-state audit references unknown backlog item: ${id}`);
}
for (const id of collect(traceText, /\b(BL-\d{3})\b/g)) {
  if (!backlog.includes(id)) throw new Error(`traceability references unknown backlog item: ${id}`);
}
for (const file of required.slice(1)) {
  if (!indexText.includes(`(${file})`)) throw new Error(`canonical index does not link ${file}`);
}
for (const token of ['Ist-Zustand RC30', '100 Dateien', '500 MB', 'Windows', 'macOS', 'Linux']) {
  if (!productText.includes(token)) throw new Error(`canonical product is missing: ${token}`);
}

console.log(`Canonical documentation: PASS (${decisions.length} decisions, ${backlog.length} epics, ${stories.length} stories)`);
