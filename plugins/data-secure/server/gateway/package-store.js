'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {SafeError}=require('../runtime');
const {roots,sha256Buffer,sha256File,listPackageDirs,PROFILES}=require('./common');
const {readEvents}=require('../companion/job-store');

// Read capabilities are deliberately process-local and never persisted. A
// package id identifies data on disk; it is not authorization to disclose that
// data to the model. Restarting the MCP server revokes every outstanding grant.
const DEFAULT_CAPABILITY_TTL_MS=15*60*1000;
const readCapabilities=new Map();
function capabilityDigest(value){return crypto.createHash('sha256').update(String(value||''),'utf8').digest('hex');}
function pruneCapabilities(now=Date.now()){for(const[d,g]of readCapabilities){if(g.expiresAt<=now)readCapabilities.delete(d);}}
function issueReadCapability(packageId,ttlMs=DEFAULT_CAPABILITY_TTL_MS){
  const id=String(packageId||'');
  if(!id)throw new SafeError('Paket-ID für Leseberechtigung fehlt.');
  safeResolvePackage(id);
  const bounded=Math.min(DEFAULT_CAPABILITY_TTL_MS,Math.max(1000,Number(ttlMs)||DEFAULT_CAPABILITY_TTL_MS));
  const token=crypto.randomBytes(32).toString('base64url');
  const expiresAt=Date.now()+bounded;
  pruneCapabilities();
  readCapabilities.set(capabilityDigest(token),{packageId:id,expiresAt});
  return{read_capability:token,read_capability_expires_at:new Date(expiresAt).toISOString()};
}
function requireReadCapability(packageId,token,now=Date.now()){
  pruneCapabilities(now);
  const supplied=String(token||'');
  const grant=/^[A-Za-z0-9_-]{43}$/.test(supplied)?readCapabilities.get(capabilityDigest(supplied)):null;
  if(!grant||grant.packageId!==String(packageId||'')||grant.expiresAt<=now){
    throw new SafeError('Kurzlebige Leseberechtigung fehlt, ist abgelaufen oder gehört zu einem anderen Lauf.');
  }
}

function validateCompanionRelease(manifest){if(!manifest.companion_job_id)return manifest;let events;try{events=readEvents(manifest.companion_job_id);}catch{throw new SafeError('Companion-Freigabenachweis fehlt oder ist ungültig.');}const released=events[events.length-1];if(released.state!=='Released'||released.output_sha256!==manifest.document_sha256)throw new SafeError('Companion-Paket ist nicht atomar freigegeben.');return manifest;}
function readManifest(dir){try{return validateCompanionRelease(JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')));}catch(e){if(e instanceof SafeError)throw e;throw new SafeError('Paketmanifest fehlt oder ist ungültig.');}}
function validateIncludedAsset(asset){
  const assetId=String(asset&&asset.asset_id||'');
  const expectedFile=`assets/${assetId}.png`;
  const reviewedFile=`assets/${assetId}_reviewed.png`;
  if(!/^asset-\d{3,}$/u.test(assetId)||!asset||asset.output_mime!=='image/png'||(asset.file!==expectedFile&&asset.file!==reviewedFile)||!/^[a-f0-9]{64}$/iu.test(String(asset.sha256||''))||!Number.isInteger(asset.bytes)||asset.bytes<0){
    throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  }
  return asset;
}
function validatePublicManifest(manifest,id){
  if(!manifest||manifest.schema!=='eu-privacy-package/2'||manifest.package_id!==id||!PROFILES.has(manifest.profile)||!Number.isFinite(Date.parse(manifest.created_at))||manifest.document!==`${id}.md`||!/^[a-f0-9]{64}$/iu.test(String(manifest.document_sha256||''))){
    throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  }
  if(!Array.isArray(manifest.assets))throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  for(const asset of manifest.assets){if(asset&&asset.status==='included')validateIncludedAsset(asset);}
  return manifest;
}
function safeResolvePackage(id){const r=roots(),name=path.basename(String(id||''));if(!name||name!==String(id||'')||name.startsWith('.'))throw new SafeError('Ungültige Paket-ID.');const p=path.join(r.output,name);if(!fs.existsSync(p))throw new SafeError('Paket nicht gefunden.');const st=fs.lstatSync(p);if(st.isSymbolicLink()||!st.isDirectory())throw new SafeError('Paketpfad ist nicht freigegeben.');const real=fs.realpathSync(p),base=fs.realpathSync(r.output)+path.sep;if(!real.startsWith(base))throw new SafeError('Paket außerhalb des Output-Bereichs.');const m=validatePublicManifest(readManifest(p),name);return{p,m};}
function safeFile(base,rel){const f=path.join(base,rel);if(!fs.existsSync(f))throw new SafeError('Paketdatei fehlt.');const st=fs.lstatSync(f);if(st.isSymbolicLink()||!st.isFile())throw new SafeError('Paketdatei ist nicht freigegeben.');const rp=fs.realpathSync(f),br=fs.realpathSync(base)+path.sep;if(!rp.startsWith(br))throw new SafeError('Paketdatei außerhalb des Pakets.');return f;}
function readVerifiedFile(base,rel){
  const file=safeFile(base,rel);let descriptor;
  try{
    descriptor=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    const before=fs.fstatSync(descriptor),named=fs.lstatSync(file);
    if(!before.isFile()||!named.isFile()||named.isSymbolicLink()||before.dev!==named.dev||before.ino!==named.ino)throw new SafeError('Paketdatei ist nicht freigegeben.');
    const data=fs.readFileSync(descriptor);
    const after=fs.fstatSync(descriptor),namedAfter=fs.lstatSync(file);
    if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||!namedAfter.isFile()||namedAfter.isSymbolicLink()||namedAfter.dev!==before.dev||namedAfter.ino!==before.ino||data.length!==before.size){
      throw new SafeError('Paketdatei wurde während des Lesens verändert.');
    }
    return data;
  }catch(error){if(error instanceof SafeError)throw error;throw new SafeError('Paketdatei ist nicht freigegeben.');}finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
}
function listOutputs(){const items=[];for(const x of listPackageDirs()){try{const{m}=safeResolvePackage(x.id);items.push({package_id:x.id,profile:m.profile,created_at:m.created_at,reidentification_risk:m.reidentification_risk==='high'?'high':'context_dependent',assets_included:m.assets.filter(a=>a.status==='included').length,assets_review_required:m.assets.filter(a=>a.status!=='included').length});}catch{}}return{ok:true,packages:items.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,50)};}
function readOutput(packageId,readCapability,offset=0,maxChars=16000){requireReadCapability(packageId,readCapability);const{p,m}=safeResolvePackage(packageId),rel=m.document;const data=readVerifiedFile(p,rel);if(sha256Buffer(data)!==m.document_sha256)throw new SafeError('Anonymisierte Markdown-Datei wurde verändert.');const text=data.toString('utf8');offset=Math.max(0,Number(offset)||0);maxChars=Math.min(30000,Math.max(1000,Number(maxChars)||16000));return{ok:true,package_id:packageId,document_id:rel,offset,text:text.slice(offset,offset+maxChars),next_offset:Math.min(text.length,offset+maxChars),has_more:offset+maxChars<text.length,total_chars:text.length,content_is_verified_anonymized_markdown:true};}
function listAssets(packageId,readCapability){requireReadCapability(packageId,readCapability);const{m}=safeResolvePackage(packageId);return{ok:true,package_id:packageId,assets:(m.assets||[]).filter(a=>a.status==='included').map(a=>({asset_id:a.asset_id,file:a.file,mime_type:a.output_mime,bytes:a.bytes,redactions:a.redactions||0}))};}
function readAsset(packageId,readCapability,assetId){requireReadCapability(packageId,readCapability);const{p,m}=safeResolvePackage(packageId),a=(m.assets||[]).find(x=>x.status==='included'&&x.asset_id===assetId);if(!a)throw new SafeError('Sicheres Asset nicht gefunden.');validateIncludedAsset(a);const data=readVerifiedFile(p,a.file.split('/').join(path.sep));if(sha256Buffer(data)!==a.sha256)throw new SafeError('Asset wurde nach Freigabe verändert.');return{ok:true,package_id:packageId,asset_id:assetId,mime_type:a.output_mime,bytes:data.length,__image:{data:data.toString('base64'),mimeType:a.output_mime}};}

module.exports={readManifest,safeResolvePackage,safeFile,readVerifiedFile,listOutputs,issueReadCapability,requireReadCapability,readOutput,listAssets,readAsset};
