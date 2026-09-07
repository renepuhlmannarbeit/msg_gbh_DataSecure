import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.join(root, 'docs', 'canonical');
const required = ['README.md', 'DECISIONS.md', 'PRODUCT_VISION.md', 'PRODUCT.md', 'TARGET_ARCHITECTURE.md', 'UML_ARCHITECTURE.md', 'STANDALONE_ARCHITECTURE.md', 'STANDALONE_SECURITY_MODEL.md', 'REFACTORING_PLAN.md', 'DOCUMENT_REGISTER.md', 'DOCUMENT_INDEX.json', 'BACKLOG.md', 'BACKLOG_ARCHIVE_2026-08.md', 'BACKLOG_ARCHIVE_2026-09.md', 'CURRENT_STATE.md', 'TRACEABILITY.md', 'TARGET_CAPABILITIES.json', 'HOST_MATRIX_V1.json', 'OPEN_SOURCE_COMPONENTS.md', 'BACKLOG_EVIDENCE_MATRIX.md'];

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
const documentIndex = JSON.parse(read('DOCUMENT_INDEX.json'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

if (documentIndex.schema !== 'datasecure-document-index/1' || !Array.isArray(documentIndex.documents)) {
  throw new Error('canonical document index is invalid');
}
const documentIds = new Set();
const documentPaths = new Set();
for (const entry of documentIndex.documents) {
  const fields = ['id', 'path', 'class', 'status', 'products', 'owner', 'version_policy', 'superseded_by', 'decisions', 'backlog_ids'];
  if (!entry || Object.keys(entry).sort().join('|') !== fields.sort().join('|') ||
      !/^[A-Z0-9-]+$/u.test(entry.id) || !['active', 'historical', 'superseded'].includes(entry.status) ||
      !Array.isArray(entry.products) || entry.products.length === 0 || !Array.isArray(entry.decisions) ||
      !Array.isArray(entry.backlog_ids)) throw new Error(`invalid document index entry: ${entry?.id || 'unknown'}`);
  if (documentIds.has(entry.id) || documentPaths.has(entry.path)) throw new Error(`duplicate document index entry: ${entry.id}`);
  documentIds.add(entry.id);
  documentPaths.add(entry.path);
  if (!fs.existsSync(path.join(root, entry.path))) throw new Error(`indexed document is missing: ${entry.path}`);
}
for (const file of required) {
  if (!documentPaths.has(`docs/canonical/${file}`)) throw new Error(`canonical document missing from machine index: ${file}`);
}

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
if (!/\*\*ersetzt:\*\*[\s\S]*?DS-050 durch DS-065/u.test(decisionsText) ||
    !decisionsText.includes('teilweise präzisiert')) {
  throw new Error('decision register does not distinguish active and superseded decisions');
}
for (const pair of [['DS-013', 'DS-043'], ['DS-015', 'DS-045'], ['DS-066', 'DS-078']]) {
  if (!decisionsText.includes(`${pair[0]} durch ${pair[1]}`)) {
    throw new Error(`decision register is missing supersession ${pair[0]} -> ${pair[1]}`);
  }
  const traceRow = traceText.match(new RegExp(`^\\| ${pair[0]} \\|[^\\n]+$`, 'm'))?.[0] ?? '';
  if (!traceRow.includes(`durch ${pair[1]} ersetzt`)) {
    throw new Error(`traceability is missing supersession ${pair[0]} -> ${pair[1]}`);
  }
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
for (const token of [`Ist-Zustand ${currentLabel ? `RC${currentLabel[1]}` : version}`, '200 Dateien', '500 MiB', 'Windows', 'macOS', 'Linux']) {
  if (!productText.includes(token)) throw new Error(`canonical product is missing: ${token}`);
}
if (target.reuse_policy?.open_source_first !== true ||
    target.reuse_policy?.custom_code_requires_documented_gap !== true) {
  throw new Error('target capability contract is missing the open-source-first policy');
}
if (!backlogText.includes('Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und')) {
  throw new Error('definition of done does not require backlog progress maintenance');
}

const registerText = read('DOCUMENT_REGISTER.md');
for (const evidenceDoc of ['docs/FORMAT_COVERAGE_MATRIX.md', 'docs/DETECTOR_BENCHMARK.md']) {
  if (!registerText.includes(evidenceDoc)) throw new Error(`document register is missing ${evidenceDoc}`);
}
if (!fs.readFileSync(path.join(root, 'docs', 'IT-BETRIEBSHANDBUCH.md'), 'utf8').includes('`events\\`')) {
  throw new Error('operations handbook does not describe the current immutable diagnostic spool');
}
const host = JSON.parse(read('HOST_MATRIX_V1.json'));
if (host.cloud_session_local_mcp_access !== 'not_available' ||
    host.hosts.find((entry) => entry.id === 'cloud_cowork_web_or_mobile')?.originals_allowed_after_gate !== false) {
  throw new Error('host matrix must deny originals to cloud sessions and local MCP access in cloud');
}

console.log(`Canonical documentation: PASS (${decisions.length} decisions, ${backlog.length} epics, ${stories.length} stories)`);
