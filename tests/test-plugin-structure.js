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
  'gbh-datasecure-dokument-anonymisieren',
  'gbh-datasecure-datenschutz-erklaeren'
];
assert.deepStrictEqual(
  fs.readdirSync(path.join(pluginRoot,'skills')).sort(),
  [...requiredSkills].sort(),
  'plugin must expose exactly the consolidated GBH DataSecure skills'
);
const skillTexts=[];
const referenceTexts=[];
for(const skill of requiredSkills){
  const p=path.join(pluginRoot,'skills',skill,'SKILL.md');
  assert.ok(fs.existsSync(p),`missing skill ${skill}`);
  const text=fs.readFileSync(p,'utf8');
  skillTexts.push(text);
  // Tolerant of CRLF: a Windows checkout with core.autocrlf=true would
  // otherwise fail this assertion on the only supported platform.
  assert.ok(/^---\r?\n/.test(text),`${skill} missing frontmatter`);
  const references=path.join(pluginRoot,'skills',skill,'references');
  if(fs.existsSync(references)){
    for(const file of fs.readdirSync(references).filter(name=>name.endsWith('.md')).sort()){
      referenceTexts.push(fs.readFileSync(path.join(references,file),'utf8'));
    }
  }
}

const preflight=fs.readFileSync(path.join(pluginRoot,'skills','gbh-datasecure-dokument-anonymisieren','SKILL.md'),'utf8');
assert.match(preflight,/Fordere sensible Originale \*\*nicht\*\*[^\n]*(?:Chat-Upload|Einfügen)/i);
assert.match(preflight,/read_anonymized_document/);
assert.match(preflight,/read_anonymized_asset/);
assert.match(preflight,/ausschließlich die in diesem Aufruf als freigegeben gemeldeten `package_id`/i);
assert.match(preflight,/ursprüngliche Nutzeraufgabe automatisch und ausschließlich/i);
for(const profile of ['customer','applicant','personnel_profile','contract','general']){
  assert.match(preflight,new RegExp(`\\b${profile}\\b`),`missing profile guidance for ${profile}`);
}

// Agent/runtime coupling: a tool may not ship unless Claude is told how to use
// it, or this test contains an explicit, reviewed reason why no instruction is
// appropriate. Keep the source slices narrow so names in TOOLS do not satisfy
// their own coverage check.
const indexSource=fs.readFileSync(path.join(pluginRoot,'server','index.js'),'utf8');
const toolsStart=indexSource.indexOf('const TOOLS=[');
const toolsEnd=indexSource.indexOf('];',toolsStart);
assert.notStrictEqual(toolsStart,-1,'TOOLS table missing');
assert.notStrictEqual(toolsEnd,-1,'TOOLS table is unterminated');
const toolNames=[...indexSource.slice(toolsStart,toolsEnd).matchAll(/\{name:'([a-z_]+)',title:/g)].map(m=>m[1]);
assert.strictEqual(toolNames.length,13,'unexpected tool count');
assert.ok(!toolNames.includes('anonymize_all_documents'),'a complete multi-file run must not occupy one MCP call');
assert.ok(!toolNames.includes('approve_visual_asset'),'Claude must not receive a model-callable human approval tool');

const instructionsStart=indexSource.indexOf('const INSTRUCTIONS=');
assert.notStrictEqual(instructionsStart,-1,'INSTRUCTIONS missing');
const instructionSource=indexSource.slice(instructionsStart,toolsStart);
const agentGuidance=[instructionSource,...skillTexts,...referenceTexts].join('\n');
const toolInstructionExceptions={};
for(const [name,reason] of Object.entries(toolInstructionExceptions)){
  assert.ok(reason.trim().length>=20,`${name} exception needs a concrete reason`);
}
for(const name of toolNames){
  const instructed=new RegExp(`\\b${name}\\b`).test(agentGuidance);
  assert.ok(instructed||toolInstructionExceptions[name],`${name} has no agent-layer instruction or justified exception`);
}

assert.match(agentGuidance,/purge_local_data[\s\S]{0,400}(?:ausdrücklich|explicit)[^\n]*(?:Bestätigung|confirm)/i);
assert.match(agentGuidance,/retention_days=0[\s\S]{0,240}(?:nicht verfügbar|deaktiviert|disable|unavailable)/i);
assert.match(agentGuidance,/(?:metadatenbasierter Audit-Nachweis|metadata-only audit receipt)[\s\S]{0,260}(?:außerhalb|bestehen|bleibt|retained)/i);

console.log('PLUGIN STRUCTURE PASS');
