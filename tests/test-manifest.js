'use strict';
const assert=require('assert');const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(m.manifest_version,'0.4');assert.equal(m.version,'3.2.0-rc1');assert.equal(m.server.type,'node');assert.equal(m.server.entry_point,'server/index.js');assert(fs.existsSync(path.join(root,m.server.entry_point)));assert(m.compatibility.platforms.includes('win32'));assert(m.compatibility.runtimes.node.includes('22'));
const names=m.tools.map(x=>x.name);assert.equal(new Set(names).size,names.length);for(const x of ['anonymize_next_document','read_anonymized_document','read_anonymized_asset','approve_visual_asset'])assert(names.includes(x));
const promptNames=m.prompts.map(x=>x.name);assert(promptNames.includes('anonymize_personnel_profile'));
const allowed=new Set(['string','number','boolean','directory','file']);for(const c of Object.values(m.user_config||{}))assert(allowed.has(c.type));
const all=fs.readdirSync(path.join(root,'server')).filter(x=>x.endsWith('.js')).map(x=>fs.readFileSync(path.join(root,'server',x),'utf8')).join('\n');assert(!/npm\s+install|npm\.cmd|child_process[^\n]*npm/i.test(all),'runtime must not install npm dependencies');
for(const f of ['rasterize-image.ps1','windows-ocr.ps1']){const s=fs.readFileSync(path.join(root,'scripts',f),'utf8');assert(!/Invoke-WebRequest|WebClient|Start-BitsTransfer|curl|wget/i.test(s),'Windows bridge must not download from network');}
console.log('PASS manifest/offline checks');
