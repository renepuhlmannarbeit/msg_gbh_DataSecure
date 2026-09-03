'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'mcp-server.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const skill = fs.readFileSync(path.join(
  root, 'plugins', 'data-secure', 'skills', 'gbh-datasecure-dokument-anonymisieren', 'SKILL.md'
), 'utf8');

function namesIn(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notStrictEqual(end, -1, `unterminated ${startMarker}`);
  return [...source.slice(start, end).matchAll(/'([a-z][a-z0-9_]*)'/g)].map((match) => match[1]);
}

function declaredToolNames(source) {
  const start = source.indexOf('const TOOLS=[');
  assert.notStrictEqual(start, -1, 'missing const TOOLS=[');
  const end = source.indexOf('];', start);
  assert.notStrictEqual(end, -1, 'unterminated const TOOLS=[');
  return [...source.slice(start, end).matchAll(/\{name:'([a-z][a-z0-9_]*)',title:/g)].map((match) => match[1]);
}

const declaredTools = declaredToolNames(index);
const normalTools = namesIn(index, 'const NORMAL_TOOL_NAMES', ']));');
const expectedNormal = [
  'start_document_batch_from_picker',
  'start_completed_local_results_handoff',
  'continue_local_results_handoff',
  'cancel_local_results_handoff',
  'continue_most_recent_document_batch',
  'discard_incomplete_document_batches',
  'configure_privacy_folder',
  'configure_result_folder',
  'open_result_folder',
  'open_export_folder'
];

assert.strictEqual(declaredTools.length, 27, 'support surface must contain exactly 27 reviewed tools');
assert.deepStrictEqual(normalTools, expectedNormal, 'normal Cowork tool surface drifted');
assert.strictEqual(new Set(declaredTools).size, declaredTools.length, 'duplicate MCP tool name');
assert.ok(index.includes('const SUPPORT_TOOL_NAMES'), 'support-tool complement must be explicit');
assert.strictEqual(declaredTools.filter((name) => !normalTools.includes(name)).length, 17);
assert.deepStrictEqual(
  [...manifest.tools.map((tool) => tool.name)].sort(),
  [...declaredTools].sort(),
  'MCPB manifest and runtime tool inventory drifted'
);

for (const name of expectedNormal) {
  assert.match(skill, new RegExp(`\\b${name}\\b`), `normal tool ${name} has no skill guidance`);
}
assert.ok(!normalTools.includes('open_privacy_folder'), 'open_privacy_folder must remain support-only');
for (const removed of ['open_input_folder', 'begin_document_batch', 'start_document_batch_processing']) {
  assert.ok(!declaredTools.includes(removed), `${removed} must be absent from every callable surface`);
}

assert.match(index, /delete safe\.batch_token/u, 'normal continuation must remove the private batch token');
assert.match(index, /startLocalReviewExecutor\(token\)/u, 'normal continuation must launch review asynchronously');
console.log('COWORK TOOL SURFACE CONTRACT PASS (10 normal, 17 support-only)');
