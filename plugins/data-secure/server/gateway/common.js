'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');const {spawn}=require('child_process');
const {dataRoot}=require('../runtime');
const {VERSION}=require('../version');
const SUPPORTED=new Set(['.pdf','.docx','.xlsx','.pptx','.txt','.md','.csv','.png','.jpg','.jpeg','.bmp']);
// Release allowlist for the supervised pilot. Other formats remain visible to
// the queue so the user receives an explicit fail-closed result instead of the
// file being silently ignored.
const PILOT_SUPPORTED=new Set(['.docx','.txt']);
const PROFILES=new Set(['auto','customer','applicant','personnel_profile','contract','general']);
const LIMITS={MAX_INPUT_BYTES:100*1024*1024,MAX_TEXT_CHARS:20_000_000,MAX_VISUAL_ASSETS:150,MAX_ASSET_BYTES:30*1024*1024};

function privacyRoot(){const configured=String(process.env.EU_PRIVACY_ROOT||'').trim();return path.resolve(configured||path.join(dataRoot(),'workspace'));}
function storageStatus(root=privacyRoot()){
  const normalized=String(root).replace(/\\/g,'/');
  const cloud=/(?:^|\/)(?:OneDrive(?:\s*-\s*[^/]*)?|Dropbox|Google Drive|iCloud Drive)(?:\/|$)/iu.test(normalized);
  const network=process.platform==='win32'&&/^\/\//.test(normalized);
  const configured=Boolean(String(process.env.EU_PRIVACY_ROOT||'').trim());
  return{safe:!cloud&&!network,mode:cloud?'cloud_synced_path':network?'network_path':configured?'configured_local_path':'local_app_data',configured};
}
function roots(){const root=privacyRoot();const r={root,input:path.join(root,'Input'),output:path.join(root,'Output'),processed:path.join(root,'Processed'),review:path.join(root,'Needs Visual Review'),audit:path.join(dataRoot(),'audit'),jobs:path.join(dataRoot(),'jobs')};for(const p of Object.values(r))fs.mkdirSync(p,{recursive:true,mode:0o700});return r;}
function sha256Buffer(b){return crypto.createHash('sha256').update(b).digest('hex');}function sha256File(p){return sha256Buffer(fs.readFileSync(p));}
function timestamp(){const d=new Date();return d.getFullYear().toString()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');}
function safePackageId(profile){const prefix={customer:'Kundendokument',applicant:'Bewerbung',personnel_profile:'Mitarbeiterprofil',contract:'Vertrag',general:'Dokument'}[profile]||'Dokument';return `${prefix}_${timestamp()}_anonymisiert`;}
function uniqueDir(dir,base){let p=path.join(dir,base),i=2;while(fs.existsSync(p))p=path.join(dir,`${base}_${i++}`);return p;}
function uniquePath(dir,file){const e=path.extname(file),b=path.basename(file,e);let p=path.join(dir,file),i=2;while(fs.existsSync(p))p=path.join(dir,`${b}_${i++}${e}`);return p;}
function listInput(){const r=roots();return fs.readdirSync(r.input,{withFileTypes:true}).filter(x=>x.isFile()&&!x.name.startsWith('.')).map(x=>({name:x.name,full:path.join(r.input,x.name),stat:fs.statSync(path.join(r.input,x.name))})).sort((a,b)=>a.stat.mtimeMs-b.stat.mtimeMs);}
function listPackageDirs(){const r=roots();return fs.readdirSync(r.output,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('.')).map(x=>({id:x.name,full:path.join(r.output,x.name)}));}
function openFolder(dir){let command,args;if(process.platform==='win32'){command='explorer.exe';args=[dir];}else if(process.platform==='darwin'){command='/usr/bin/open';args=[dir];}else if(process.platform==='linux'){command='xdg-open';args=[dir];}else{return{ok:false,message:'Für dieses Betriebssystem ist keine lokale Ordneröffnung verfügbar.'};}try{const c=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true,shell:false});c.unref();return{ok:true,opened:true};}catch{return{ok:false,message:'Der lokale Ordner konnte nicht geöffnet werden.'};}}

function detectProfileFromMarkdown(md){const t=String(md||'').toLowerCase();const score={
  personnel_profile:['projekterfahrung','berufserfahrung','skillset','zertifizierungen','unternehmen:','ausbildung:','rolle im projekt','funktion:'].reduce((n,k)=>n+(t.includes(k)?1:0),0),
  applicant:['bewerbung','anschreiben','lebenslauf','curriculum vitae','bewerber','motivation','arbeitszeugnis'].reduce((n,k)=>n+(t.includes(k)?1:0),0),
  contract:['vertrag','vertragspartei','kündigung','haftung','vertragslaufzeit','präambel','zahlungspflicht','vereinbarung','§'].reduce((n,k)=>n+(t.includes(k)?1:0),0),
  customer:['kundennummer','kunde:','rechnung','bestellung','ticket','support','crm','lieferadresse','auftragsnummer','reklamation'].reduce((n,k)=>n+(t.includes(k)?1:0),0)
};
  if(score.personnel_profile>=4)return'personnel_profile';const ranked=Object.entries(score).filter(([k])=>k!=='personnel_profile').sort((a,b)=>b[1]-a[1]);return ranked[0][1]>=2?ranked[0][0]:'general';}

module.exports={VERSION,SUPPORTED,PILOT_SUPPORTED,PROFILES,LIMITS,privacyRoot,storageStatus,roots,sha256Buffer,sha256File,timestamp,safePackageId,uniqueDir,uniquePath,listInput,listPackageDirs,openFolder,detectProfileFromMarkdown};
