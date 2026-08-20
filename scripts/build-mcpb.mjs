import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const out=path.join(dist,`EU-Privacy-Document-Gateway-Windows-v${manifest.version}.mcpb`);
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'eu-privacy-mcpb-'));
const include=['manifest.json','README.md','SECURITY.md','ARCHITECTURE_DECISION.md','TEST_REPORT.md','THIRD_PARTY_NOTICES.md','assets','docs','server','scripts/rasterize-image.ps1','scripts/windows-ocr.ps1'];
for(const rel of include){const src=path.join(root,rel),dst=path.join(stage,rel);if(!fs.existsSync(src))continue;fs.cpSync(src,dst,{recursive:true});}
try{fs.rmSync(out,{force:true});execFileSync('zip',['-q','-r',out,'.'],{cwd:stage,stdio:'inherit'});}finally{fs.rmSync(stage,{recursive:true,force:true});}
const hash=crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
console.log(`${out}\nsha256=${hash}`);
