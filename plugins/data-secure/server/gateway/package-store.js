'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {isUtf8}=require('buffer');
const {SafeError}=require('../runtime');
const {roots,sha256Buffer,sha256File,listPackageDirs,PROFILES}=require('./common');
const {readEvents}=require('../companion/job-store');
const {validateManifestDocumentResult,DocumentResultError}=require('./document-result-grade');
const {publicPositiveDocumentResult}=require('./batch-result-projection');
const {RESOURCE_LIMITS}=require('../resource-limits');

// Read capabilities are deliberately process-local and never persisted. A
// package id identifies data on disk; it is not authorization to disclose that
// data to the model. Restarting the MCP server revokes every outstanding grant.
const DEFAULT_CAPABILITY_TTL_MS=15*60*1000;
// This cache is deliberately an in-process optimisation for already released
// Markdown only. It is never persisted, exported, diagnosed or made public.
const MAX_HANDOFF_SNAPSHOT_BYTES=32*1024*1024;
const MAX_RELEASED_MARKDOWN_BYTES=32*1024*1024;
const MAX_MANIFEST_BYTES=1024*1024;
const MAX_ACTIVE_CAPABILITIES=256;
const readCapabilities=new Map();
const capabilityByPackage=new Map();
function capabilityDigest(value){return crypto.createHash('sha256').update(String(value||''),'utf8').digest('hex');}
function removeGrant(digest){const grant=readCapabilities.get(digest);if(grant&&capabilityByPackage.get(grant.packageId)===digest)capabilityByPackage.delete(grant.packageId);readCapabilities.delete(digest);}
function pruneCapabilities(now=Date.now()){for(const[d,g]of readCapabilities){if(g.expiresAt<=now)removeGrant(d);}}
function issueReadCapability(packageId,ttlMs=DEFAULT_CAPABILITY_TTL_MS){
  const id=String(packageId||'');
  if(!id)throw new SafeError('Paket-ID für Leseberechtigung fehlt.');
  const resolved=safeResolvePackage(id);
  const bounded=Math.min(DEFAULT_CAPABILITY_TTL_MS,Math.max(1000,Number(ttlMs)||DEFAULT_CAPABILITY_TTL_MS));
  const now=Date.now();
  const binding=packageBinding(resolved.p,resolved.m);
  pruneCapabilities(now);
  const previous=capabilityByPackage.get(id);
  const existing=previous&&readCapabilities.get(previous);
  if(existing&&existing.binding===binding&&existing.expiresAt>now){
    return{read_capability:existing.token,read_capability_expires_at:new Date(existing.expiresAt).toISOString()};
  }
  if(previous)removeGrant(previous);
  while(readCapabilities.size>=MAX_ACTIVE_CAPABILITIES)removeGrant(readCapabilities.keys().next().value);
  const token=crypto.randomBytes(32).toString('base64url');
  const expiresAt=now+bounded;
  const digest=capabilityDigest(token);
  readCapabilities.set(digest,{packageId:id,expiresAt,binding,token});
  capabilityByPackage.set(id,digest);
  return{read_capability:token,read_capability_expires_at:new Date(expiresAt).toISOString()};
}
function requireReadCapability(packageId,token,now=Date.now()){
  pruneCapabilities(now);
  const supplied=String(token||'');
  const grant=/^[A-Za-z0-9_-]{43}$/.test(supplied)?readCapabilities.get(capabilityDigest(supplied)):null;
  if(!grant||grant.packageId!==String(packageId||'')||grant.expiresAt<=now){
    throw new SafeError('Kurzlebige Leseberechtigung fehlt, ist abgelaufen oder gehört zu einem anderen Lauf.');
  }
  return grant;
}

function validateCompanionRelease(manifest){if(!manifest.companion_job_id)return manifest;let events;try{events=readEvents(manifest.companion_job_id);}catch{throw new SafeError('Companion-Freigabenachweis fehlt oder ist ungültig.');}const released=events[events.length-1];if(released.state!=='Released'||released.output_sha256!==manifest.document_sha256)throw new SafeError('Companion-Paket ist nicht atomar freigegeben.');return manifest;}
function readManifest(dir){try{return validateCompanionRelease(JSON.parse(readVerifiedFile(dir,'manifest.json',MAX_MANIFEST_BYTES).toString('utf8')));}catch(e){if(e instanceof SafeError)throw e;throw new SafeError('Paketmanifest fehlt oder ist ungültig.');}}
function validateIncludedAsset(asset){
  const assetId=String(asset&&asset.asset_id||'');
  const expectedFile=`assets/${assetId}.png`;
  const reviewedFile=`assets/${assetId}_reviewed.png`;
  if(!/^asset-\d{3,}$/u.test(assetId)||!asset||asset.output_mime!=='image/png'||(asset.file!==expectedFile&&asset.file!==reviewedFile)||!/^[a-f0-9]{64}$/iu.test(String(asset.sha256||''))||!Number.isInteger(asset.bytes)||asset.bytes<1||asset.bytes>RESOURCE_LIMITS.MAX_ASSET_BYTES){
    throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  }
  return asset;
}
function validatePublicManifest(manifest,id){
  if(!manifest||!['eu-privacy-package/2','eu-privacy-package/3'].includes(manifest.schema)||manifest.package_id!==id||!PROFILES.has(manifest.profile)||!Number.isFinite(Date.parse(manifest.created_at))||manifest.document!==`${id}.md`||!/^[a-f0-9]{64}$/iu.test(String(manifest.document_sha256||''))){
    throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  }
  if(!Array.isArray(manifest.assets)||manifest.assets.length>RESOURCE_LIMITS.MAX_VISUAL_ASSETS)throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  const assetIds=new Set(),assetFiles=new Set();
  for(const asset of manifest.assets){if(asset&&asset.status==='included'){
    validateIncludedAsset(asset);
    if(assetIds.has(asset.asset_id)||assetFiles.has(asset.file))throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
    assetIds.add(asset.asset_id);assetFiles.add(asset.file);
  }}
  if(manifest.schema==='eu-privacy-package/3'){
    try{validateManifestDocumentResult(manifest);}catch(error){if(error instanceof DocumentResultError)throw new SafeError('Paketmanifest fehlt oder ist ungültig.');throw error;}
  }
  return manifest;
}
function packageBinding(base,manifest){
  try{
    const stat=fs.lstatSync(base);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw new SafeError('Paketpfad ist nicht freigegeben.');
    return crypto.createHash('sha256').update(JSON.stringify({
      device:String(stat.dev),inode:String(stat.ino),manifest
    }),'utf8').digest('hex');
  }catch(error){if(error instanceof SafeError)throw error;throw new SafeError('Paketpfad ist nicht freigegeben.');}
}
function resolveAuthorizedPackage(packageId,token){
  const grant=requireReadCapability(packageId,token);
  const resolved=safeResolvePackage(packageId);
  const current=packageBinding(resolved.p,resolved.m);
  if(grant.binding!==current)throw new SafeError('Das freigegebene Paket hat sich seit Erteilung der Leseberechtigung verändert.');
  return resolved;
}
function safeResolvePackage(id){
  const r=roots(),name=path.basename(String(id||''));
  if(!name||name!==String(id||'')||name.startsWith('.'))throw new SafeError('Ungültige Paket-ID.');
  try{
    const p=path.join(r.output,name);
    if(!fs.existsSync(p))throw new SafeError('Paket nicht gefunden.');
    const st=fs.lstatSync(p);
    if(st.isSymbolicLink()||!st.isDirectory())throw new SafeError('Paketpfad ist nicht freigegeben.');
    const real=fs.realpathSync(p),base=fs.realpathSync(r.output)+path.sep;
    if(!real.startsWith(base))throw new SafeError('Paket außerhalb des Output-Bereichs.');
    const m=validatePublicManifest(readManifest(p),name);
    for(const asset of m.assets.filter((item)=>item?.status==='included')){
      const file=safeFile(p,asset.file.split('/').join(path.sep));
      const stat=fs.lstatSync(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==asset.bytes||stat.size>RESOURCE_LIMITS.MAX_ASSET_BYTES){
        throw new SafeError('Assetgröße stimmt nicht mit dem freigegebenen Manifest überein.');
      }
    }
    return{p,m};
  }catch(error){if(error instanceof SafeError)throw error;throw new SafeError('Paketpfad ist nicht freigegeben.');}
}
function safeFile(base,rel){
  try{
    const f=path.join(base,rel);
    if(!fs.existsSync(f))throw new SafeError('Paketdatei fehlt.');
    const st=fs.lstatSync(f);
    if(st.isSymbolicLink()||!st.isFile())throw new SafeError('Paketdatei ist nicht freigegeben.');
    const rp=fs.realpathSync(f),br=fs.realpathSync(base)+path.sep;
    if(!rp.startsWith(br))throw new SafeError('Paketdatei außerhalb des Pakets.');
    return f;
  }catch(error){if(error instanceof SafeError)throw error;throw new SafeError('Paketdatei ist nicht freigegeben.');}
}
function readVerifiedFile(base,rel,maxBytes=Number.POSITIVE_INFINITY){
  const file=safeFile(base,rel);let descriptor,data,failure;
  try{
    descriptor=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    const before=fs.fstatSync(descriptor),named=fs.lstatSync(file);
    if(!before.isFile()||!named.isFile()||named.isSymbolicLink()||before.dev!==named.dev||before.ino!==named.ino)throw new SafeError('Paketdatei ist nicht freigegeben.');
    if(!Number.isSafeInteger(before.size)||before.size<0||before.size>maxBytes)throw new SafeError('Paketdatei überschreitet die sichere Größenbegrenzung.');
    if(Number.isFinite(maxBytes)){
      data=Buffer.alloc(before.size);let read=0;
      while(read<data.length){const count=fs.readSync(descriptor,data,read,data.length-read,read);if(count<=0)break;read+=count;}
      if(read!==data.length)throw new SafeError('Paketdatei wurde während des Lesens verändert.');
    }else data=fs.readFileSync(descriptor);
    const after=fs.fstatSync(descriptor),namedAfter=fs.lstatSync(file);
    if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||!namedAfter.isFile()||namedAfter.isSymbolicLink()||namedAfter.dev!==before.dev||namedAfter.ino!==before.ino||data.length!==before.size){
      throw new SafeError('Paketdatei wurde während des Lesens verändert.');
    }
  }catch(error){failure=error instanceof SafeError?error:new SafeError('Paketdatei ist nicht freigegeben.');}
  finally{
    if(descriptor!==undefined){
      try{fs.closeSync(descriptor);}catch{if(!failure)failure=new SafeError('Paketdatei ist nicht freigegeben.');}
    }
  }
  if(failure){if(Buffer.isBuffer(data))data.fill(0);throw failure;}
  return data;
}
async function readVerifiedFileAsync(base,rel,maxBytes=Number.POSITIVE_INFINITY){
  const file=safeFile(base,rel);let descriptor,data,failure;
  try{
    descriptor=await fs.promises.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    const before=await descriptor.stat(),named=await fs.promises.lstat(file);
    if(!before.isFile()||!named.isFile()||named.isSymbolicLink()||before.dev!==named.dev||before.ino!==named.ino)throw new SafeError('Paketdatei ist nicht freigegeben.');
    if(!Number.isSafeInteger(before.size)||before.size<0||before.size>maxBytes)throw new SafeError('Paketdatei überschreitet die sichere Größenbegrenzung.');
    data=Buffer.alloc(before.size);let read=0;
    while(read<data.length){
      const result=await descriptor.read(data,read,Math.min(1024*1024,data.length-read),read);
      if(result.bytesRead<=0)break;
      read+=result.bytesRead;
    }
    if(read!==data.length)throw new SafeError('Paketdatei wurde während des Lesens verändert.');
    const after=await descriptor.stat(),namedAfter=await fs.promises.lstat(file);
    if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||!namedAfter.isFile()||namedAfter.isSymbolicLink()||namedAfter.dev!==before.dev||namedAfter.ino!==before.ino||data.length!==before.size){
      throw new SafeError('Paketdatei wurde während des Lesens verändert.');
    }
  }catch(error){failure=error instanceof SafeError?error:new SafeError('Paketdatei ist nicht freigegeben.');}
  finally{
    if(descriptor){
      try{await descriptor.close();}catch{if(!failure)failure=new SafeError('Paketdatei ist nicht freigegeben.');}
    }
  }
  if(failure){if(Buffer.isBuffer(data))data.fill(0);throw failure;}
  return data;
}
function listOutputs(){const items=[];for(const x of listPackageDirs()){try{const{m}=safeResolvePackage(x.id);items.push({package_id:x.id,profile:m.profile,created_at:m.created_at,reidentification_risk:m.reidentification_risk==='high'?'high':'context_dependent',assets_included:m.assets.filter(a=>a.status==='included').length,assets_review_required:m.assets.filter(a=>a.status!=='included').length});}catch{}}return{ok:true,packages:items.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,50)};}
function readOutput(packageId,readCapability,offset=0,maxChars=16000){const{p,m}=resolveAuthorizedPackage(packageId,readCapability),rel=m.document;const data=readVerifiedFile(p,rel,MAX_RELEASED_MARKDOWN_BYTES);if(sha256Buffer(data)!==m.document_sha256)throw new SafeError('Anonymisierte Markdown-Datei wurde verändert.');if(!isUtf8(data))throw new SafeError('Anonymisierte Markdown-Datei ist nicht gültig UTF-8-kodiert.');const text=data.toString('utf8');offset=Math.max(0,Math.min(text.length,Math.trunc(Number(offset)||0)));assertUnicodeSliceStart(text,offset);maxChars=Math.min(30000,Math.max(1000,Math.trunc(Number(maxChars)||16000)));const end=unicodeSliceEnd(text,offset,maxChars);return{ok:true,package_id:packageId,document_id:rel,offset,text:text.slice(offset,end),next_offset:end,has_more:end<text.length,total_chars:text.length,document_result:m.schema==='eu-privacy-package/3'?publicPositiveDocumentResult(m.document_result):null,content_is_verified_anonymized_markdown:true,content_trust:'untrusted_document_data',embedded_instructions_authorized:false};}
function assertUnicodeSliceStart(text,start){
  if(start>0&&start<text.length){
    const previous=text.charCodeAt(start-1),current=text.charCodeAt(start);
    if(previous>=0xd800&&previous<=0xdbff&&current>=0xdc00&&current<=0xdfff){
      throw new SafeError('Ergebnisoffset liegt innerhalb eines Unicode-Zeichens.');
    }
  }
}
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
function validatedUtf8SequenceBytes(data,offset){
  const first=data[offset];
  if(first<=0x7f)return 1;
  const second=data[offset+1];
  if(first>=0xc2&&first<=0xdf&&second>=0x80&&second<=0xbf)return 2;
  const third=data[offset+2];
  if(first===0xe0&&second>=0xa0&&second<=0xbf&&third>=0x80&&third<=0xbf)return 3;
  if(((first>=0xe1&&first<=0xec)||(first>=0xee&&first<=0xef))&&
      second>=0x80&&second<=0xbf&&third>=0x80&&third<=0xbf)return 3;
  if(first===0xed&&second>=0x80&&second<=0x9f&&third>=0x80&&third<=0xbf)return 3;
  const fourth=data[offset+3];
  if(first===0xf0&&second>=0x90&&second<=0xbf&&third>=0x80&&third<=0xbf&&fourth>=0x80&&fourth<=0xbf)return 4;
  if(first>=0xf1&&first<=0xf3&&second>=0x80&&second<=0xbf&&third>=0x80&&third<=0xbf&&fourth>=0x80&&fourth<=0xbf)return 4;
  if(first===0xf4&&second>=0x80&&second<=0x8f&&third>=0x80&&third<=0xbf&&fourth>=0x80&&fourth<=0xbf)return 4;
  throw new SafeError('Anonymisierte Markdown-Datei ist nicht gültig UTF-8-kodiert.');
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
async function sha256BufferAsync(data){
  const hash=crypto.createHash('sha256');
  for(let offset=0;offset<data.length;offset+=1024*1024){
    hash.update(data.subarray(offset,Math.min(data.length,offset+1024*1024)));
    await new Promise(resolve=>setImmediate(resolve));
  }
  return hash.digest('hex');
}
async function createUtf8CharacterIndexAsync(data){
  const characterOffsets=[0],byteOffsets=[0];
  let byteOffset=0,characterOffset=0,lastIndexed=0,nextYield=1024*1024;
  while(byteOffset<data.length){
    const width=validatedUtf8SequenceBytes(data,byteOffset);
    byteOffset+=width;
    characterOffset+=width===4?2:1;
    if(characterOffset-lastIndexed>=UTF8_INDEX_INTERVAL&&byteOffset<data.length){
      characterOffsets.push(characterOffset);
      byteOffsets.push(byteOffset);
      lastIndexed=characterOffset;
    }
    if(byteOffset>=nextYield){
      nextYield=byteOffset+1024*1024;
      await new Promise(resolve=>setImmediate(resolve));
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
  const {p,m}=resolveAuthorizedPackage(packageId,readCapability),rel=m.document;
  const file=safeFile(p,rel);
  let size;
  try{size=fs.statSync(file).size;}catch{return null;}
  const limit=Math.min(MAX_HANDOFF_SNAPSHOT_BYTES,Math.max(1024,Number(maxBytes)||MAX_HANDOFF_SNAPSHOT_BYTES));
  // A too-large output stays on the existing per-page verified read path.
  if(size>limit)return null;
  const data=readVerifiedFile(p,rel,MAX_RELEASED_MARKDOWN_BYTES);
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
      if(startLocation.insideSurrogate)throw new SafeError('Ergebnisoffset liegt innerhalb eines Unicode-Zeichens.');
      const decoded=data.toString('utf8',startLocation.byteOffset,endLocation.byteOffset);
      const text=startLocation.trimStartUnits?decoded.slice(startLocation.trimStartUnits):decoded;
      return {text,next_offset:end,has_more:end<index.totalCharacters};
    },
    dispose(){if(!disposed){data.fill(0);index.characterOffsets.fill(0);index.byteOffsets.fill(0);index.totalCharacters=0;disposed=true;}}
  });
}
async function openVerifiedMarkdownSnapshotAsync(packageId,readCapability,maxBytes=MAX_HANDOFF_SNAPSHOT_BYTES){
  const {p,m}=resolveAuthorizedPackage(packageId,readCapability),rel=m.document;
  const file=safeFile(p,rel);
  let size;
  try{size=(await fs.promises.stat(file)).size;}catch{return null;}
  const limit=Math.min(MAX_HANDOFF_SNAPSHOT_BYTES,Math.max(1024,Number(maxBytes)||MAX_HANDOFF_SNAPSHOT_BYTES));
  if(size>limit)return null;
  const data=await readVerifiedFileAsync(p,rel,MAX_RELEASED_MARKDOWN_BYTES);
  try{
    if(await sha256BufferAsync(data)!==m.document_sha256)throw new SafeError('Anonymisierte Markdown-Datei wurde verändert.');
    const index=await createUtf8CharacterIndexAsync(data);
    let disposed=false;
    return Object.freeze({
      bytes:data.length,
      read(offset=0,maxChars=4800){
        if(disposed)throw new SafeError('Die lokale Ergebnisübergabe ist nicht mehr gültig.');
        const start=Math.max(0,Math.min(index.totalCharacters,Math.trunc(Number(offset)||0)));
        const boundedChars=Math.max(1000,Math.min(30000,Math.trunc(Number(maxChars)||4800)));
        let end=Math.min(index.totalCharacters,start+boundedChars);
        let endLocation=locateUtf8Character(data,index,end);
        if(endLocation.insideSurrogate&&end>start){end--;endLocation=locateUtf8Character(data,index,end);}
        if(end===start&&end<index.totalCharacters){end=Math.min(index.totalCharacters,start+2);endLocation=locateUtf8Character(data,index,end);}
        const startLocation=locateUtf8Character(data,index,start);
        if(startLocation.insideSurrogate)throw new SafeError('Ergebnisoffset liegt innerhalb eines Unicode-Zeichens.');
        const decoded=data.toString('utf8',startLocation.byteOffset,endLocation.byteOffset);
        const text=startLocation.trimStartUnits?decoded.slice(startLocation.trimStartUnits):decoded;
        return{text,next_offset:end,has_more:end<index.totalCharacters};
      },
      dispose(){if(!disposed){data.fill(0);index.characterOffsets.fill(0);index.byteOffsets.fill(0);index.totalCharacters=0;disposed=true;}}
    });
  }catch(error){data.fill(0);throw error;}
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
  return{ok:true,documents,content_is_verified_anonymized_markdown:true,content_trust:'untrusted_document_data',embedded_instructions_authorized:false};
}
function listAssets(packageId,readCapability){const{m}=resolveAuthorizedPackage(packageId,readCapability);return{ok:true,package_id:packageId,assets:(m.assets||[]).filter(a=>a.status==='included').map(a=>({asset_id:a.asset_id,file:a.file,mime_type:a.output_mime,bytes:a.bytes,redactions:a.redactions||0}))};}
function readAsset(packageId,readCapability,assetId){const{p,m}=resolveAuthorizedPackage(packageId,readCapability),a=(m.assets||[]).find(x=>x.status==='included'&&x.asset_id===assetId);if(!a)throw new SafeError('Sicheres Asset nicht gefunden.');validateIncludedAsset(a);const data=readVerifiedFile(p,a.file.split('/').join(path.sep),RESOURCE_LIMITS.MAX_ASSET_BYTES);if(data.length!==a.bytes||sha256Buffer(data)!==a.sha256)throw new SafeError('Asset wurde nach Freigabe verändert.');return{ok:true,package_id:packageId,asset_id:assetId,mime_type:a.output_mime,bytes:data.length,__image:{data:data.toString('base64'),mimeType:a.output_mime}};}

module.exports={readManifest,safeResolvePackage,safeFile,readVerifiedFile,readVerifiedFileAsync,listOutputs,issueReadCapability,requireReadCapability,readOutput,readOutputs,openVerifiedMarkdownSnapshot,openVerifiedMarkdownSnapshotAsync,listAssets,readAsset,MAX_HANDOFF_SNAPSHOT_BYTES,MAX_RELEASED_MARKDOWN_BYTES,MAX_ACTIVE_CAPABILITIES};
