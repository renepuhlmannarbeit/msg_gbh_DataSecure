'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const pluginRoot=path.join(root,'plugins','data-secure');
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));

const manifest=readJson(path.join(pluginRoot,'.claude-plugin','plugin.json'));
assert.strictEqual(manifest.name,'data-secure');
assert.ok(/^\d+\.\d+\.\d+/.test(manifest.version),'plugin version must be semver-like');

const marketplace=readJson(path.join(root,'.claude-plugin','marketplace.json'));
const entry=marketplace.plugins.find(p=>p.name==='data-secure');
assert.ok(entry,'data-secure marketplace entry missing');
assert.strictEqual(entry.source,'./plugins/data-secure');

const mcp=readJson(path.join(pluginRoot,'.mcp.json'));
assert.ok(mcp['data-secure-local'],'local MCP config missing');
assert.strictEqual(mcp['data-secure-local'].command,'node');
assert.deepStrictEqual(mcp['data-secure-local'].args,['${CLAUDE_PLUGIN_ROOT}/server/index.js']);

const requiredSkills=[
  'data-secure-preflight',
  'data-secure-personnel',
  'data-secure-applicant',
  'data-secure-customer',
  'data-secure-contract',
  'data-secure-compliance',
  'data-secure-general'
];
for(const skill of requiredSkills){
  const p=path.join(pluginRoot,'skills',skill,'SKILL.md');
  assert.ok(fs.existsSync(p),`missing skill ${skill}`);
  const text=fs.readFileSync(p,'utf8');
  // Tolerant of CRLF: a Windows checkout with core.autocrlf=true would
  // otherwise fail this assertion on the only supported platform.
  assert.ok(/^---\r?\n/.test(text),`${skill} missing frontmatter`);
}

const preflight=fs.readFileSync(path.join(pluginRoot,'skills','data-secure-preflight','SKILL.md'),'utf8');
assert.match(preflight,/do \*\*not\*\* ask the user to paste or upload the original document/i);
assert.match(preflight,/read_anonymized_document/);
assert.match(preflight,/read_anonymized_asset/);

console.log('PLUGIN STRUCTURE PASS');
