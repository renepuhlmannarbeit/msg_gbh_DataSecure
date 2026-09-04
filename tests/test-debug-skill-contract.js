'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = fs.readFileSync(path.join(root, 'support', 'skills',
  'gbh-datasecure-debug-anonymisieren', 'SKILL.md'), 'utf8');
assert.match(skill, /^---\r?\n[\s\S]*disable-model-invocation:\s*true[\s\S]*\r?\n---\r?\n/u,
  'debug skill must be manually invocable only');
assert.match(skill, /exakt dieselbe Engine/i);
assert.match(skill, /start_document_batch_from_picker/);
assert.match(skill, /diagnostic_status/);
assert.match(skill, /JSON-RPC über `stdio`; es handelt sich nicht um REST/i);
for (const forbidden of ['Dateiinhalte protokollieren', 'Rohes JSON-RPC speichern', 'automatisch aktiviert']) {
  assert.ok(!skill.includes(forbidden), `unsafe debug promise: ${forbidden}`);
}

const normalSkills = fs.readdirSync(path.join(root, 'plugins', 'data-secure', 'skills')).sort();
assert.deepStrictEqual(normalSkills, [
  'gbh-datasecure-datenschutz-erklaeren',
  'gbh-datasecure-dokument-anonymisieren'
], 'normal source plugin must remain free of the debug skill');

const builder = fs.readFileSync(path.join(root, 'scripts', 'build-runtime-plugin.mjs'), 'utf8');
assert.match(builder, /supportMode = false/);
assert.match(builder, /EU_PRIVACY_SUPPORT_MODE = '1'/);
assert.match(builder, /direct-upload-debug-target/);
assert.match(builder, /gbh-datasecure-debug-anonymisieren/);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.scripts['build:debug'], 'node scripts/build-plugin.mjs --support');
assert.strictEqual(packageJson.scripts['test:debug-zip'], 'node scripts/verify-debug-plugin-zip.mjs');

console.log('DEBUG SKILL CONTRACT PASS');
