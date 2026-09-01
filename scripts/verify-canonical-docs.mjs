import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.join(root, 'docs', 'canonical');
const required = ['README.md', 'DECISIONS.md', 'PRODUCT_VISION.md', 'PRODUCT.md', 'TARGET_ARCHITECTURE.md', 'REFACTORING_PLAN.md', 'DOCUMENT_REGISTER.md', 'BACKLOG.md', 'BACKLOG_ARCHIVE_2026-08.md', 'BACKLOG_ARCHIVE_2026-09.md', 'CURRENT_STATE.md', 'TRACEABILITY.md', 'TARGET_CAPABILITIES.json', 'OPEN_SOURCE_COMPONENTS.md', 'BACKLOG_EVIDENCE_MATRIX.md'];

for (const file of required) {
  if (!fs.existsSync(path.join(canonical, file))) throw new Error(`missing canonical document: ${file}`);
}

const read = (file) => fs.readFileSync(path.join(canonical, file), 'utf8');
const decisionsText = read('DECISIONS.md');
const backlogText = read('BACKLOG.md');
const archiveText = `${read('BACKLOG_ARCHIVE_2026-08.md')}\n${read('BACKLOG_ARCHIVE_2026-09.md')}`;
const currentText = read('CURRENT_STATE.md');
const traceText = read('TRACEABILITY.md');
const indexText = read('README.md');
const productText = read('PRODUCT.md');
const openSourceText = read('OPEN_SOURCE_COMPONENTS.md');
const target = JSON.parse(read('TARGET_CAPABILITIES.json'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const collect = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1]);
const decisions = collect(decisionsText, /^## (DS-\d{3})\b/gm);
const backlog = collect(backlogText, /^### (BL-\d{3})\b/gm);
const stories = collect(backlogText, /^\| (BL-\d{3}\.\d+) \|/gm);
const archivedStories = collect(archiveText, /^\| (BL-\d{3}\.\d+) \|/gm);
const traceDecisions = collect(traceText, /^\| (DS-\d{3}) \|/gm);
const currentBacklog = collect(currentText, /^#{2,3} (BL-\d{3})\b/gm);

const unique = (values, label) => {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`duplicate ${label}: ${[...new Set(duplicates)].join(', ')}`);
};

unique(decisions, 'decision ids');
unique(backlog, 'backlog ids');
unique([...stories, ...archivedStories], 'backlog story ids');
unique(traceDecisions, 'traceability decision ids');
unique(currentBacklog, 'current-state backlog ids');
if (!decisions.length || !backlog.length || !stories.length) {
  throw new Error('canonical decisions, epics, or stories are empty');
}
if (!/\*\*ersetzt:\*\*[^\n]*DS-050[^\n]*DS-065/u.test(decisionsText) ||
    !decisionsText.includes('teilweise präzisiert')) {
  throw new Error('decision register does not distinguish active and superseded decisions');
}

for (const id of stories) {
  const parent = id.slice(0, 6);
  if (!backlog.includes(parent)) throw new Error(`story references unknown parent epic: ${id}`);
  const escaped = id.replace('.', '\\.');
  const row = backlogText.match(new RegExp(`^\\| ${escaped} \\|[^\\n]*\\| \\*\\*(erledigt|in Arbeit|offen|blockiert)\\*\\* \\|`, 'm'))?.[0] ?? '';
  if (!row) {
    throw new Error(`story has no valid status: ${id}`);
  }
}
for (const id of archivedStories) {
  const parent = id.slice(0, 6);
  if (!backlog.includes(parent)) throw new Error(`archived story references unknown parent epic: ${id}`);
}

for (const id of decisions) {
  if (!traceDecisions.includes(id)) throw new Error(`decision missing from traceability: ${id}`);
  if (!backlogText.includes(id)) throw new Error(`decision missing from backlog: ${id}`);
}
if (target.contract !== 'target-only-not-runtime') throw new Error('target capability contract is not clearly target-only');
if (target.baseline !== version) throw new Error(`target baseline is stale: ${target.baseline} != ${version}`);
if (target.additional_system_vm?.runtime !== false || target.additional_system_vm?.acceptance_tests !== false) {
  throw new Error('DS-062 excludes additional system VMs from runtime and acceptance tests');
}
if (target.additional_windows_account?.runtime !== false || target.additional_windows_account?.acceptance_tests !== false) {
  throw new Error('DS-063 excludes additional Windows accounts from runtime and acceptance tests');
}
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
for (const id of backlog) {
  if (!openSourceText.includes(id)) throw new Error(`open-source register missing backlog item: ${id}`);
}
for (const id of collect(traceText, /\b(BL-\d{3})\b/g)) {
  if (!backlog.includes(id)) throw new Error(`traceability references unknown backlog item: ${id}`);
}
for (const file of required.slice(1)) {
  if (!indexText.includes(`(${file})`)) throw new Error(`canonical index does not link ${file}`);
}
const currentLabel = /-rc(\d+)$/u.exec(version);
for (const token of [`Ist-Zustand ${currentLabel ? `RC${currentLabel[1]}` : version}`, '100 Dateien', '500 MiB', 'Windows', 'macOS', 'Linux']) {
  if (!productText.includes(token)) throw new Error(`canonical product is missing: ${token}`);
}
if (target.reuse_policy?.open_source_first !== true ||
    target.reuse_policy?.custom_code_requires_documented_gap !== true) {
  throw new Error('target capability contract is missing the open-source-first policy');
}
if (!backlogText.includes('Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und')) {
  throw new Error('definition of done does not require backlog progress maintenance');
}

console.log(`Canonical documentation: PASS (${decisions.length} decisions, ${backlog.length} epics, ${stories.length} stories)`);
