'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'mcp-server.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const interactionContract = JSON.parse(fs.readFileSync(path.join(
  root, 'plugins', 'data-secure', 'server', 'contracts', 'cowork-interactions.v1.json'
), 'utf8'));
let skill = fs.readFileSync(path.join(
  root, 'plugins', 'data-secure', 'skills', 'gbh-datasecure-dokument-anonymisieren', 'SKILL.md'
), 'utf8');
const references = path.join(root, 'plugins', 'data-secure', 'skills', 'gbh-datasecure-dokument-anonymisieren', 'references');
for (const name of fs.readdirSync(references).filter((name) => name.endsWith('.md')).sort()) {
  skill += '\n' + fs.readFileSync(path.join(references, name), 'utf8');
}

function declaredToolNames(source) {
  const start = source.indexOf('const TOOLS=[');
  assert.notStrictEqual(start, -1, 'missing const TOOLS=[');
  const end = source.indexOf('];', start);
  assert.notStrictEqual(end, -1, 'unterminated const TOOLS=[');
  return [...source.slice(start, end).matchAll(/\{name:'([a-z][a-z0-9_]*)',title:/g)].map((match) => match[1]);
}

const declaredTools = declaredToolNames(index);
const normalTools = Object.entries(interactionContract.interactions)
  .filter(([, interaction]) => interaction.surface === 'normal')
  .map(([name]) => name);
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
assert.deepStrictEqual([...normalTools].sort(), [...expectedNormal].sort(), 'normal Cowork tool surface drifted');
assert.strictEqual(new Set(declaredTools).size, declaredTools.length, 'duplicate MCP tool name');
assert.strictEqual(interactionContract.closed_world, true, 'interaction registry must be closed-world');
assert.ok(index.includes("namesForSurface('support')"), 'support surface must derive from the registry');
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

// This gate owns the declared tool/skill surface, not implementation spelling.
// test-mcp-protocol.js exercises both continuation branches over real stdio:
// token-free success/failure projection, rejected starts, absent/invalid ACKs,
// timeout/cancellation and acknowledgement before an honest success response.
// An explicit allowlist is safer than the former spread/delete implementation;
// requiring the literal `delete safe.batch_token` would reject that improvement.
console.log('COWORK TOOL SURFACE CONTRACT PASS (10 normal, 17 support-only)');
