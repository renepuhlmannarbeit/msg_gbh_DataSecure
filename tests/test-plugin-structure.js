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
assert.strictEqual(mcp['data-secure-local'].env.EU_PRIVACY_ROOT,'',
  'plugin customization must expose an optional privacy-root field');

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
assert.match(preflight,/Originale nie per Chat-Upload, Einfügen/i);
assert.match(preflight,/start_completed_local_results_handoff/);
assert.match(preflight,/continue_local_results_handoff/);
assert.match(preflight,/cancel_local_results_handoff/);
assert.match(preflight,/niemals Originalbytes, Dateinamen, Pfade, Bildpixel/i);
assert.match(preflight,/höchstens fünf freigegebene Markdown-Ergebnisse/i);
assert.match(preflight,/start_document_batch_from_picker/i);
assert.match(preflight,/Mit \*\*„Öffnen“\*\* bestätigt/i);
assert.match(preflight,/Token, Paket-\/Dateikennungen, Cursor und Leseberechtigungen bleiben vollständig im lokalen Server/i);
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
assert.strictEqual(toolNames.length,28,'unexpected tool count');
assert.ok(toolNames.includes('start_document_batch_from_picker'),'direct picker tool missing');
assert.ok(toolNames.includes('configure_privacy_folder'),'local privacy-root tool missing');
assert.ok(!toolNames.includes('anonymize_all_documents'),'a complete multi-file run must not occupy one MCP call');
assert.ok(!toolNames.includes('anonymize_next_document'),'Claude must not drive the local queue one document at a time');
assert.ok(!toolNames.includes('approve_visual_asset'),'Claude must not receive a model-callable human approval tool');

const instructionsStart=indexSource.indexOf('const INSTRUCTIONS=');
assert.notStrictEqual(instructionsStart,-1,'INSTRUCTIONS missing');
const instructionSource=indexSource.slice(instructionsStart,toolsStart);
const agentGuidance=[instructionSource,...skillTexts,...referenceTexts].join('\n');
const toolInstructionExceptions={
  continue_anonymized_batch_in_chat:'Support- und Kompatibilitätswerkzeug; der normale Cowork-Folgeweg nutzt die tokenfreie lokale Ergebnisübergabe.',
  document_batch_status:'Support- und Kompatibilitätswerkzeug; der normale Cowork-Folgeweg bündelt Status und Lesen.',
  list_document_batch_results:'Support- und Kompatibilitätswerkzeug; der normale Cowork-Folgeweg wählt Ergebnisse intern begrenzt aus.',
  read_anonymized_documents:'Support- und Kompatibilitätswerkzeug; der normale Cowork-Folgeweg liest höchstens fünf Ergebnisse gebündelt.',
  acknowledge_batch_documents:'Support- und Kompatibilitätswerkzeug; lokale Verarbeitung und der normale Folgeweg benötigen keine Bestätigung.',
  resume_document_batch:'Support- und Kompatibilitätswerkzeug; der normale Fortsetzen-Aufruf übernimmt die technische Wiederaufnahme selbst.'
};
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
