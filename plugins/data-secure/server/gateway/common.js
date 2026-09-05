'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');const {spawn}=require('child_process');
const {dataRoot}=require('../runtime');
const {readConfiguredPrivacyRoot}=require('./privacy-config');
const {VERSION}=require('../version');
const {uiProcessEnvironment}=require('../companion/ui-process-policy');
const {RESOURCE_LIMITS,assertSourceSize}=require('../resource-limits');
const SUPPORTED=new Set(['.pdf','.docx','.xlsx','.pptx','.txt','.md','.markdown','.csv','.png','.jpg','.jpeg','.bmp']);
// Release allowlist for the supervised pilot. Other formats remain visible to
// the queue so the user receives an explicit fail-closed result instead of the
// file being silently ignored.
// Markdown goes through the identical fatal UTF-8, normalization, content-graph
// and privacy-gate path as TXT. It is intentionally a text-only release format:
// links, HTML and image references remain inert source text and are never fetched.
const PILOT_SUPPORTED=new Set(['.docx','.txt','.md','.markdown','.csv']);
const PROFILES=new Set(['auto','customer','applicant','personnel_profile','contract','general']);
const LIMITS=RESOURCE_LIMITS;

function configuredPrivacyRoot(){return String(process.env.EU_PRIVACY_ROOT||'').trim()||readConfiguredPrivacyRoot();}
function privacyRoot(){return path.resolve(configuredPrivacyRoot()||path.join(dataRoot(),'workspace'));}
function resolvedSafetyPath(target){
  const requested=path.resolve(String(target)); let probe=requested; const suffix=[];
  while(!fs.existsSync(probe)){const parent=path.dirname(probe);if(parent===probe)return null;suffix.unshift(path.basename(probe));probe=parent;}
  let resolved;try{resolved=fs.realpathSync.native(probe);}catch{return null;}
  return path.join(resolved,...suffix);
}
function hasReparseComponent(target){
  let probe=path.resolve(String(target));
  while(true){if(fs.existsSync(probe)){try{if(fs.lstatSync(probe).isSymbolicLink())return true;}catch{return true;}}
    const parent=path.dirname(probe);if(parent===probe)return false;probe=parent;}
}
async function hasReparseComponentAsync(target,fsApi=fs){
  let probe=path.resolve(String(target));
  const io=fsApi.promises||fs.promises;
  while(true){
    try{if((await io.lstat(probe)).isSymbolicLink())return true;}
    catch(error){if(error?.code!=='ENOENT')return true;}
    const parent=path.dirname(probe);if(parent===probe)return false;probe=parent;
  }
}
function isManagedStagingPath(target){
  const relative=path.relative(path.join(privacyRoot(),'.datasecure-staging'),path.resolve(String(target)));
  return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith(`..${path.sep}`));
}
function storageStatus(root=privacyRoot()){
  const requested=path.resolve(String(root)); const resolved=resolvedSafetyPath(requested);
  const normalized=String(resolved||requested).replace(/\\/g,'/');
  const cloud=/(?:^|\/)(?:OneDrive(?:\s*-\s*[^/]*)?|Dropbox|Google Drive|iCloud Drive)(?:\/|$)/iu.test(normalized);
  const network=(process.platform==='win32'&&(/^\/\//.test(normalized)||/^\\\\/.test(requested)))||/^\/\/[^/]/.test(normalized);
  const reparse=hasReparseComponent(requested);
  const configured=Boolean(configuredPrivacyRoot());
  const safe=Boolean(resolved)&&!cloud&&!network&&!reparse;
  return{safe,mode:cloud?'cloud_synced_path':network?'network_path':reparse?'reparse_path':!resolved?'unverifiable_path':configured?'configured_local_path':'local_app_data',configured};
}
function assertPrivateDirectory(target,parent){
  const requested=path.resolve(String(target));const parentPath=path.resolve(String(parent));
  if(!storageStatus(requested).safe||!storageStatus(parentPath).safe)throw new Error('PRIVACY_STORAGE_UNSAFE');
  let named,resolved,parentResolved,parentStat,targetStat;
  try{
    named=fs.lstatSync(requested);resolved=fs.realpathSync.native(requested);parentResolved=fs.realpathSync.native(parentPath);
    parentStat=fs.statSync(parentPath);targetStat=fs.statSync(requested);
  }catch{throw new Error('PRIVACY_STORAGE_UNSAFE');}
  const relative=path.relative(parentResolved,resolved);
  if(!named.isDirectory()||named.isSymbolicLink()||!targetStat.isDirectory()||
    named.dev!==targetStat.dev||named.ino!==targetStat.ino||parentStat.dev!==targetStat.dev||
    relative===''||relative.startsWith(`..${path.sep}`)||relative==='..'||path.isAbsolute(relative)){
    throw new Error('PRIVACY_STORAGE_UNSAFE');
  }
  return requested;
}
function ensurePrivateDirectory(parent,literalChild){
  const child=String(literalChild||'');
  if(!child||child==='.'||child==='..'||child.includes('/')||child.includes('\\')||child.includes('\0'))throw new Error('PRIVACY_STORAGE_UNSAFE');
  const parentPath=path.resolve(String(parent));
  if(!storageStatus(parentPath).safe)throw new Error('PRIVACY_STORAGE_UNSAFE');
  fs.mkdirSync(parentPath,{recursive:true,mode:0o700});
  if(!storageStatus(parentPath).safe)throw new Error('PRIVACY_STORAGE_UNSAFE');
  const parentNamed=fs.lstatSync(parentPath);
  if(!parentNamed.isDirectory()||parentNamed.isSymbolicLink())throw new Error('PRIVACY_STORAGE_UNSAFE');
  const target=path.join(parentPath,child);
  if(fs.existsSync(target))assertPrivateDirectory(target,parentPath);
  else fs.mkdirSync(target,{recursive:false,mode:0o700});
  return assertPrivateDirectory(target,parentPath);
}
// Removes only one previously known, literal child of a verified private
// directory.  It deliberately does not call recursive rm(): every entry is
// checked with lstat immediately before unlink/rmdir, and a directory identity
// is checked again before its entries are acted on.  Node has no portable
// dirfd/openat equivalent, so this narrows (but does not claim to eliminate)
// pathname races; any doubt leaves the tree untouched.
function safeRemovePrivateTree(parent,literalChild,options={}){
  const child=String(literalChild||'');
  if(!child||child==='.'||child==='..'||child.includes('/')||child.includes('\\')||child.includes('\0'))throw new Error('PRIVACY_STORAGE_UNSAFE');
  const parentPath=path.resolve(String(parent));
  assertPrivateDirectory(parentPath,path.dirname(parentPath));
  const parentReal=fs.realpathSync.native(parentPath);
  const parentStat=fs.statSync(parentPath);
  const target=path.join(parentPath,child);
  if(path.relative(parentPath,target)!==child||path.dirname(target)!==parentPath)throw new Error('PRIVACY_STORAGE_UNSAFE');
  const bound=options.expectedIdentity!==undefined;
  const identityOf=(stat)=>({dev:String(stat.dev),ino:String(stat.ino),birthtimeNs:String(stat.birthtimeNs)});
  const matches=(stat,expected)=>expected&&Object.keys(expected).sort().join(',')==='birthtimeNs,dev,ino'&&
    Object.values(expected).every(value=>typeof value==='string'&&/^(?:0|[1-9][0-9]*)$/.test(value))&&
    Object.keys(expected).every(key=>identityOf(stat)[key]===expected[key]);
  if(bound&&(!matches(fs.lstatSync(parentPath,{bigint:true}),options.expectedParentIdentity)))throw new Error('PRIVACY_STORAGE_UNSAFE');
  if(!fs.existsSync(target))return false;
  // Ownership-sensitive staging cleanup: preflight the ENTIRE bounded tree
  // before deleting its first byte. Remember every ancestor and file identity,
  // not just whatever happens to occupy the pathname when deletion begins.
  const plan=new Map();
  if(bound){
    const pending=[{full:target,depth:0}];
    while(pending.length){
      const {full,depth}=pending.pop();
      if(plan.size>=10000||depth>32)throw new Error('PRIVACY_STORAGE_UNSAFE');
      const stat=fs.lstatSync(full,{bigint:true});
      if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||
        (stat.isFile()&&stat.nlink!==1n)||
        (full===target&&!matches(stat,options.expectedIdentity)))throw new Error('PRIVACY_STORAGE_UNSAFE');
      plan.set(full,{identity:identityOf(stat),directory:stat.isDirectory(),size:stat.size,mtimeNs:stat.mtimeNs});
      if(stat.isDirectory())for(const name of fs.readdirSync(full)){
        if(!name||name==='.'||name==='..'||/[\\/\0]/.test(name))throw new Error('PRIVACY_STORAGE_UNSAFE');
        pending.push({full:path.join(full,name),depth:depth+1});
      }
    }
  }
  const verifyBound=(current)=>{
    if(!bound)return;
    if(!matches(fs.lstatSync(parentPath,{bigint:true}),options.expectedParentIdentity))throw new Error('PRIVACY_STORAGE_UNSAFE');
    for(let probe=current;probe!==parentPath;probe=path.dirname(probe)){
      const saved=plan.get(probe),stat=fs.lstatSync(probe,{bigint:true});
      if(!saved||stat.isSymbolicLink()||!matches(stat,saved.identity)||stat.isDirectory()!==saved.directory||
        (!saved.directory&&(!stat.isFile()||stat.nlink!==1n||stat.size!==saved.size||stat.mtimeNs!==saved.mtimeNs)))throw new Error('PRIVACY_STORAGE_UNSAFE');
    }
  };
  const comparable=(value)=>process.platform==='win32'?value.toLowerCase():value;
  const verifyParent=()=>{
    const named=fs.lstatSync(parentPath),opened=fs.statSync(parentPath),real=fs.realpathSync.native(parentPath);
    if(!named.isDirectory()||named.isSymbolicLink()||!opened.isDirectory()||named.dev!==opened.dev||named.ino!==opened.ino||
      opened.dev!==parentStat.dev||opened.ino!==parentStat.ino||comparable(real)!==comparable(parentReal))throw new Error('PRIVACY_STORAGE_UNSAFE');
  };
  const removeEntry=(current)=>{
    verifyParent();
    verifyBound(current);
    const relative=path.relative(parentPath,current);
    if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('PRIVACY_STORAGE_UNSAFE');
    const before=fs.lstatSync(current);
    if(before.isSymbolicLink())throw new Error('PRIVACY_STORAGE_UNSAFE');
    if(before.isFile()){
      const again=fs.lstatSync(current);
      if(!again.isFile()||again.isSymbolicLink()||again.dev!==before.dev||again.ino!==before.ino)throw new Error('PRIVACY_STORAGE_UNSAFE');
      verifyBound(current);
      fs.unlinkSync(current);
      return;
    }
    if(!before.isDirectory())throw new Error('PRIVACY_STORAGE_UNSAFE');
    // Recheck the named object before and immediately after listing.  A
    // replacement can at worst make the operation stop; no listed child is
    // touched until the original directory identity is seen again.
    const listed=fs.readdirSync(current);
    const listedIdentity=fs.lstatSync(current);
    if(!listedIdentity.isDirectory()||listedIdentity.isSymbolicLink()||listedIdentity.dev!==before.dev||listedIdentity.ino!==before.ino)throw new Error('PRIVACY_STORAGE_UNSAFE');
    for(const name of listed){
      if(!name||name==='.'||name==='..'||name.includes('/')||name.includes('\\')||name.includes('\0'))throw new Error('PRIVACY_STORAGE_UNSAFE');
      removeEntry(path.join(current,name));
    }
    const after=fs.lstatSync(current);
    if(!after.isDirectory()||after.isSymbolicLink()||after.dev!==before.dev||after.ino!==before.ino)throw new Error('PRIVACY_STORAGE_UNSAFE');
    verifyBound(current);
    fs.rmdirSync(current);
  };
  removeEntry(target);
  return true;
}
function roots(){const root=privacyRoot();const before=storageStatus(root);if(!before.safe)throw new Error('PRIVACY_STORAGE_UNSAFE');fs.mkdirSync(root,{recursive:true,mode:0o700});const after=storageStatus(root);if(!after.safe)throw new Error('PRIVACY_STORAGE_UNSAFE');const gatewayRoot=ensurePrivateDirectory(path.dirname(dataRoot()),path.basename(dataRoot()));const r={root,output:ensurePrivateDirectory(root,'Output'),processed:ensurePrivateDirectory(root,'Processed'),review:ensurePrivateDirectory(root,'Needs Visual Review'),exports:ensurePrivateDirectory(root,'DataSecure-Export'),audit:ensurePrivateDirectory(gatewayRoot,'audit'),jobs:ensurePrivateDirectory(gatewayRoot,'jobs'),migrations:ensurePrivateDirectory(gatewayRoot,'migrations')};return r;}
function sha256Buffer(b){return crypto.createHash('sha256').update(b).digest('hex');}
function sha256File(p){
  const descriptor=fs.openSync(p,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  const hash=crypto.createHash('sha256');
  const buffer=Buffer.allocUnsafe(1024*1024);
  try{
    for(;;){
      const read=fs.readSync(descriptor,buffer,0,buffer.length,null);
      if(read===0)break;
      hash.update(buffer.subarray(0,read));
    }
    return hash.digest('hex');
  }finally{fs.closeSync(descriptor);}
}
function timestamp(){const d=new Date();return d.getFullYear().toString()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');}
function safePackageId(profile){const prefix={customer:'Kundendokument',applicant:'Bewerbung',personnel_profile:'Mitarbeiterprofil',contract:'Vertrag',general:'Dokument'}[profile]||'Dokument';return `${prefix}_${timestamp()}_anonymisiert`;}
function uniqueDir(dir,base){let p=path.join(dir,base),i=2;while(fs.existsSync(p))p=path.join(dir,`${base}_${i++}`);return p;}
function uniquePath(dir,file){const e=path.extname(file),b=path.basename(file,e);let p=path.join(dir,file),i=2;while(fs.existsSync(p))p=path.join(dir,`${b}_${i++}${e}`);return p;}
function validateBatchLimits(queue){
  if(!Array.isArray(queue)||queue.length>LIMITS.MAX_BATCH_FILES)throw new Error('BATCH_FILE_LIMIT');
  let total=0;for(const entry of queue){const size=Number(entry?.stat?.size);assertSourceSize(path.extname(String(entry?.name||entry?.full||'')),size);total+=size;if(total>LIMITS.MAX_BATCH_TOTAL_BYTES)throw new Error('BATCH_TOTAL_LIMIT');}
  return total;
}
function listPackageDirs(){const r=roots();return fs.readdirSync(r.output,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('.')).map(x=>({id:x.name,full:path.join(r.output,x.name)}));}
function environmentValue(environment,name){
  const wanted=String(name).toUpperCase();
  for(const [key,value] of Object.entries(environment||{}))if(key.toUpperCase()===wanted&&typeof value==='string')return value;
  return'';
}
function localOpenCommand(target,options={}){
  const platform=options.platform||process.platform;
  const environment=options.env||process.env;
  const revealFile=options.revealFile===true;
  if(platform==='win32'){
    const systemRoot=environmentValue(environment,'SYSTEMROOT')||environmentValue(environment,'WINDIR');
    if(!systemRoot)return null;
    return{command:path.win32.join(systemRoot,'explorer.exe'),args:revealFile?['/select,',target]:[target]};
  }
  if(platform==='darwin')return{command:'/usr/bin/open',args:revealFile?['-R',target]:[target]};
  if(platform==='linux')return{command:'/usr/bin/xdg-open',args:[revealFile?path.dirname(target):target]};
  return null;
}
async function openLocalPath(target,options={}){
  const invocation=localOpenCommand(target,options);
  if(!invocation)return{ok:false,message:'Für dieses Betriebssystem ist keine lokale Ordneröffnung verfügbar.'};
  const timeoutMs=Number.isInteger(options.confirmTimeoutMs)&&options.confirmTimeoutMs>0?options.confirmTimeoutMs:2000;
  return new Promise((resolve)=>{
    let child;let settled=false;let timer;
    const finish=(result)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);resolve(result);};
    try{
      timer=setTimeout(()=>finish({ok:false,message:'Der lokale Öffnungsvorgang wurde nicht bestätigt.'}),timeoutMs);
      child=(options.spawn||spawn)(invocation.command,invocation.args,{
        // This process *is* the requested UI. Hiding it on Windows can make a
        // successfully spawned explorer.exe invisible while the application
        // incorrectly reports that the handoff worked.
        detached:true,stdio:'ignore',windowsHide:false,shell:false,
        env:uiProcessEnvironment(options.env||process.env)
      });
      if(!child||typeof child.once!=='function'||typeof child.unref!=='function')throw new Error('local opener did not start');
      // child_process.spawn() reports ENOENT asynchronously. Waiting for the
      // spawn event prevents a false success and keeps a late error handled.
      child.once('error',()=>finish({ok:false,message:'Der lokale Pfad konnte nicht geöffnet werden.'}));
      child.once('spawn',()=>{child.unref();finish({ok:true,handoff_confirmed:true});});
    }catch{finish({ok:false,message:'Der lokale Pfad konnte nicht geöffnet werden.'});}
  });
}
function openFolder(dir,options={}){return openLocalPath(dir,{...options,revealFile:false});}
function revealFile(file,options={}){return openLocalPath(file,{...options,revealFile:true});}

function detectProfileFromMarkdown(md){const t=String(md||'').toLowerCase();const score={
  // Three independently useful profile signals are sufficient for the
  // conservative automatic route; a title plus two labels is the usual prose
  // case. CSV/DOCX often render labels as table headers, so requiring only
  // colon-form labels incorrectly sent otherwise obvious employee profiles
  // through the weaker general profile.
  personnel_profile:['mitarbeiterprofil','beraterprofil','kompetenzprofil','consultant profile','employee profile','professional profile','profil consultant','perfil profesional','consultantprofiel','projekterfahrung','berufserfahrung','work experience','expérience professionnelle','experiencia profesional','werkervaring','skillset','zertifizierungen','certifications','certification','certificación','certificaciones','certificering','unternehmen:','company:','entreprise:','empresa:','bedrijf:','ausbildung:','education:','rolle im projekt','rolle:','role:','rôle:','rol:','funktion:','| rolle |','| role |','| rôle |','| rol |','| unternehmen |','| company |','| entreprise |','| empresa |','| bedrijf |','| certifications |','| certification |','| certificación |','| certificaciones |','| certificering |'].reduce((n,k)=>n+(t.includes(k)?1:0),0),
  applicant:['bewerbung','anschreiben','lebenslauf','curriculum vitae','bewerber','motivation','arbeitszeugnis'].reduce((n,k)=>n+(t.includes(k)?1:0),0),
  contract:['vertrag','vertragspartei','kündigung','haftung','vertragslaufzeit','präambel','zahlungspflicht','vereinbarung','§'].reduce((n,k)=>n+(t.includes(k)?1:0),0),
  customer:['kundennummer','kunde:','rechnung','bestellung','ticket','support','crm','lieferadresse','auftragsnummer','reklamation'].reduce((n,k)=>n+(t.includes(k)?1:0),0)
};
  if(score.personnel_profile>=3)return'personnel_profile';const ranked=Object.entries(score).filter(([k])=>k!=='personnel_profile').sort((a,b)=>b[1]-a[1]);return ranked[0][1]>=2?ranked[0][0]:'general';}

module.exports={VERSION,SUPPORTED,PILOT_SUPPORTED,PROFILES,LIMITS,configuredPrivacyRoot,privacyRoot,resolvedSafetyPath,hasReparseComponent,hasReparseComponentAsync,isManagedStagingPath,storageStatus,assertPrivateDirectory,ensurePrivateDirectory,safeRemovePrivateTree,roots,sha256Buffer,sha256File,timestamp,safePackageId,uniqueDir,uniquePath,listPackageDirs,validateBatchLimits,openLocalPath,openFolder,revealFile,detectProfileFromMarkdown};
