import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pluginSrc=path.join(root,'plugins','data-secure');
const dist=path.join(root,'dist');
fs.mkdirSync(dist,{recursive:true});

const plugin=JSON.parse(fs.readFileSync(path.join(pluginSrc,'.claude-plugin','plugin.json'),'utf8'));
const out=path.join(dist,`DataSecure-Privacy-Preflight-v${plugin.version}.zip`);
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'data-secure-plugin-'));

try {
  fs.cpSync(pluginSrc,stage,{recursive:true});

  // Replace development placeholders with the canonical, tested local runtime.
  fs.rmSync(path.join(stage,'server'),{recursive:true,force:true});
  fs.cpSync(path.join(root,'server'),path.join(stage,'server'),{recursive:true});

  fs.rmSync(path.join(stage,'scripts'),{recursive:true,force:true});
  fs.mkdirSync(path.join(stage,'scripts'),{recursive:true});
  for(const name of ['windows-ocr.ps1','rasterize-image.ps1']){
    const src=path.join(root,'scripts',name);
    if(fs.existsSync(src))fs.copyFileSync(src,path.join(stage,'scripts',name));
  }

  if(fs.existsSync(path.join(root,'assets'))){
    fs.rmSync(path.join(stage,'assets'),{recursive:true,force:true});
    fs.cpSync(path.join(root,'assets'),path.join(stage,'assets'),{recursive:true});
  }

  // Development-only markers must never ship.
  for(const rel of ['.runtime-tree-placeholder','.runtime-sync-note'])fs.rmSync(path.join(stage,rel),{force:true});
  fs.rmSync(path.join(stage,'server','runtime-sync.todo'),{force:true});

  const mcp=JSON.parse(fs.readFileSync(path.join(stage,'.mcp.json'),'utf8'));
  const arg=mcp?.['data-secure-local']?.args?.[0];
  if(arg!=='${CLAUDE_PLUGIN_ROOT}/server/index.js')throw new Error('Unexpected MCP entry point');
  if(!fs.existsSync(path.join(stage,'server','index.js')))throw new Error('Bundled MCP entry point missing');

  fs.rmSync(out,{force:true});
  execFileSync('zip',['-q','-r',out,'.'],{cwd:stage,stdio:'inherit'});
} finally {
  fs.rmSync(stage,{recursive:true,force:true});
}

const hash=crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
console.log(`${out}\nsha256=${hash}`);
