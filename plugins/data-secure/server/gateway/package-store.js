'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {isUtf8}=require('buffer');
const {SafeError}=require('../runtime');
const {roots,sha256Buffer,sha256File,listPackageDirs,PROFILES}=require('./common');
const {readEvents}=require('../companion/job-store');
const {validateManifestDocumentResult,DocumentResultError}=require('./document-result-grade');

// Read capabilities are deliberately process-local and never persisted. A
// package id identifies data on disk; it is not authorization to disclose that
// data to the model. Restarting the MCP server revokes every outstanding grant.
const DEFAULT_CAPABILITY_TTL_MS=15*60*1000;
// This cache is deliberately an in-process optimisation for already released
// Markdown only. It is never persisted, exported, diagnosed or made public.
const MAX_HANDOFF_SNAPSHOT_BYTES=4*1024*1024;
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
  if(!manifest||!['eu-privacy-package/2','eu-privacy-package/3'].includes(manifest.schema)||manifest.package_id!==id||!PROFILES.has(manifest.profile)||!Number.isFinite(Date.parse(manifest.created_at))||manifest.document!==`${id}.md`||!/^[a-f0-9]{64}$/iu.test(String(manifest.document_sha256||''))){
    throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  }
  if(!Array.isArray(manifest.assets))throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  for(const asset of manifest.assets){if(asset&&asset.status==='included')validateIncludedAsset(asset);}
  if(manifest.schema==='eu-privacy-package/3'){
    try{validateManifestDocumentResult(manifest);}catch(error){if(error instanceof DocumentResultError)throw new SafeError('Paketmanifest fehlt oder ist ungültig.');throw error;}
  }
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
function unicodeSliceEnd(text,start,maxChars){
  let end=Math.min(text.length,start+maxChars);
  // Offsets in the public read contract are JavaScript character offsets.
  // Keep surrogate pairs together so a page never contains an unpaired half.
  if(end>start&&end<text.length){
    const previous=text.charCodeAt(end-1), next=text.charCodeAt(end);
    if(previous>=0xd800&&previous<=0xdbff&&next>=0xdc00&&next<=0xdfff)end--;
  }
  return end===start?Math.min(text.length,start+2):end;
}
const UTF8_INDEX_INTERVAL=4096;
function utf8SequenceBytes(byte){
  if(byte<0x80)return 1;
  if(byte<0xe0)return 2;
  if(byte<0xf0)return 3;
  return 4;
}
function createUtf8CharacterIndex(data){
  if(!isUtf8(data))throw new SafeError('Anonymisierte Markdown-Datei ist nicht gültig UTF-8-kodiert.');
  const characterOffsets=[0],byteOffsets=[0];
  let byteOffset=0,characterOffset=0,lastIndexed=0;
  while(byteOffset<data.length){
    const width=utf8SequenceBytes(data[byteOffset]);
    byteOffset+=width;
    characterOffset+=width===4?2:1;
    if(characterOffset-lastIndexed>=UTF8_INDEX_INTERVAL&&byteOffset<data.length){
      characterOffsets.push(characterOffset);
      byteOffsets.push(byteOffset);
      lastIndexed=characterOffset;
    }
  }
  return{characterOffsets,byteOffsets,totalCharacters:characterOffset};
}
function locateUtf8Character(data,index,target){
  let low=0,high=index.characterOffsets.length-1;
  while(low<high){const middle=Math.ceil((low+high)/2);if(index.characterOffsets[middle]<=target)low=middle;else high=middle-1;}
  let characterOffset=index.characterOffsets[low],byteOffset=index.byteOffsets[low];
  while(byteOffset<data.length&&characterOffset<target){
    const width=utf8SequenceBytes(data[byteOffset]),units=width===4?2:1;
    if(characterOffset+units>target)return{byteOffset,trimStartUnits:target-characterOffset,insideSurrogate:true};
    byteOffset+=width;characterOffset+=units;
  }
  return{byteOffset,trimStartUnits:0,insideSurrogate:false};
}
function openVerifiedMarkdownSnapshot(packageId,readCapability,maxBytes=MAX_HANDOFF_SNAPSHOT_BYTES){
  requireReadCapability(packageId,readCapability);
  const {p,m}=safeResolvePackage(packageId),rel=m.document;
  const file=safeFile(p,rel);
  const size=fs.statSync(file).size;
  const limit=Math.min(MAX_HANDOFF_SNAPSHOT_BYTES,Math.max(1024,Number(maxBytes)||MAX_HANDOFF_SNAPSHOT_BYTES));
  // A too-large output stays on the existing per-page verified read path.
  if(size>limit)return null;
  const data=readVerifiedFile(p,rel);
  if(sha256Buffer(data)!==m.document_sha256)throw new SafeError('Anonymisierte Markdown-Datei wurde verändert.');
  const index=createUtf8CharacterIndex(data);
  let disposed=false;
  return Object.freeze({
    bytes:data.length,
    read(offset=0,maxChars=4800){
      if(disposed)throw new SafeError('Die lokale Ergebnisübergabe ist nicht mehr gültig.');
      const start=Math.max(0,Math.min(index.totalCharacters,Math.trunc(Number(offset)||0)));
      const boundedChars=Math.max(1000,Math.min(30000,Math.trunc(Number(maxChars)||4800)));
      let end=Math.min(index.totalCharacters,start+boundedChars);
      let endLocation=locateUtf8Character(data,index,end);
      // Match String#slice semantics used by the public paging contract while
      // never returning half of a surrogate pair at a generated page boundary.
      if(endLocation.insideSurrogate&&end>start){end--;endLocation=locateUtf8Character(data,index,end);}
      if(end===start&&end<index.totalCharacters){end=Math.min(index.totalCharacters,start+2);endLocation=locateUtf8Character(data,index,end);}
      const startLocation=locateUtf8Character(data,index,start);
      const decoded=data.toString('utf8',startLocation.byteOffset,endLocation.byteOffset);
      const text=startLocation.trimStartUnits?decoded.slice(startLocation.trimStartUnits):decoded;
      return {text,next_offset:end,has_more:end<index.totalCharacters};
    },
    dispose(){if(!disposed){data.fill(0);index.characterOffsets.fill(0);index.byteOffsets.fill(0);index.totalCharacters=0;disposed=true;}}
  });
}
function readOutputs(entries){
  if(!Array.isArray(entries)||entries.length<1||entries.length>10)throw new SafeError('Bitte zwischen 1 und 10 freigegebene Dokumente lesen.');
  const seen=new Set();
  const documents=entries.map((entry)=>{
    const packageId=String(entry?.package_id||'');
    if(!packageId||seen.has(packageId))throw new SafeError('Jedes freigegebene Dokument darf pro Leseaufruf nur einmal enthalten sein.');
    seen.add(packageId);
    // Six thousand characters per document keep a ten-document Cowork page
    // bounded while retaining the per-package capability boundary.
    return readOutput(packageId,entry?.read_capability,entry?.offset??0,Math.min(6000,Number(entry?.max_chars)||6000));
  });
  return{ok:true,documents,content_is_verified_anonymized_markdown:true};
}
function listAssets(packageId,readCapability){requireReadCapability(packageId,readCapability);const{m}=safeResolvePackage(packageId);return{ok:true,package_id:packageId,assets:(m.assets||[]).filter(a=>a.status==='included').map(a=>({asset_id:a.asset_id,file:a.file,mime_type:a.output_mime,bytes:a.bytes,redactions:a.redactions||0}))};}
function readAsset(packageId,readCapability,assetId){requireReadCapability(packageId,readCapability);const{p,m}=safeResolvePackage(packageId),a=(m.assets||[]).find(x=>x.status==='included'&&x.asset_id===assetId);if(!a)throw new SafeError('Sicheres Asset nicht gefunden.');validateIncludedAsset(a);const data=readVerifiedFile(p,a.file.split('/').join(path.sep));if(sha256Buffer(data)!==a.sha256)throw new SafeError('Asset wurde nach Freigabe verändert.');return{ok:true,package_id:packageId,asset_id:assetId,mime_type:a.output_mime,bytes:data.length,__image:{data:data.toString('base64'),mimeType:a.output_mime}};}

module.exports={readManifest,safeResolvePackage,safeFile,readVerifiedFile,listOutputs,issueReadCapability,requireReadCapability,readOutput,readOutputs,openVerifiedMarkdownSnapshot,listAssets,readAsset,MAX_HANDOFF_SNAPSHOT_BYTES};
