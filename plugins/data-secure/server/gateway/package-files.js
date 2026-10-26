'use strict';
const { readHeldBytes } = require('../core/bound-file-io');
const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { roots, PROFILES } = require('./common');
const { validateManifestDocumentResult, DocumentResultError } = require('./document-result-grade');
const { RESOURCE_LIMITS } = require('../resource-limits');
const MAX_MANIFEST_BYTES = 1024 * 1024;
let externalReleaseVerifier = null;
function installExternalReleaseVerifier(verifier) {
  if (process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone') throw new TypeError('EXTERNAL_RELEASE_VERIFIER_UNAVAILABLE_IN_STANDALONE');
  if (typeof verifier !== 'function' || externalReleaseVerifier && externalReleaseVerifier !== verifier) throw new TypeError('EXTERNAL_RELEASE_VERIFIER_INVALID');
  externalReleaseVerifier = verifier;
}
function readManifest(dir) {
  try {
    const manifest = JSON.parse(readVerifiedFile(dir, 'manifest.json', MAX_MANIFEST_BYTES).toString('utf8'));
    if (manifest?.companion_job_id) {
      if (process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone' || !externalReleaseVerifier) throw new SafeError('Companion-Freigabenachweis fehlt oder ist ungültig.');
      externalReleaseVerifier(manifest);
    }
    return manifest;
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError('Paketmanifest fehlt oder ist ungültig.');
  }
}
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
  // New Standalone binding fields cannot be adopted by changing only the
  // schema. Historical producers never emitted these reserved fields.
  if(!manifest||['content_options','product_channel','processing_mode','anonymized','publication_binding'].some(key=>Object.hasOwn(manifest,key))||!['eu-privacy-package/2','eu-privacy-package/3'].includes(manifest.schema)||manifest.package_id!==id||!PROFILES.has(manifest.profile)||!Number.isFinite(Date.parse(manifest.created_at))||manifest.document!==`${id}.md`||!/^[a-f0-9]{64}$/iu.test(String(manifest.document_sha256||''))){
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
    descriptor=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0) | (fs.constants.O_NONBLOCK || 0));
    const before=fs.fstatSync(descriptor),named=fs.lstatSync(file);
    if(!before.isFile()||!named.isFile()||named.isSymbolicLink()||before.dev!==named.dev||before.ino!==named.ino)throw new SafeError('Paketdatei ist nicht freigegeben.');
    if(!Number.isSafeInteger(before.size)||before.size<0||before.size>maxBytes)throw new SafeError('Paketdatei überschreitet die sichere Größenbegrenzung.');
    if(Number.isFinite(maxBytes)){
      data=Buffer.alloc(before.size);let read=0;
      while(read<data.length){const count=fs.readSync(descriptor,data,read,data.length-read,read);if(count<=0)break;read+=count;}
      if(read!==data.length)throw new SafeError('Paketdatei wurde während des Lesens verändert.');
    }else data=readHeldBytes(descriptor, before.size, fs);
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
    descriptor=await fs.promises.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0) | (fs.constants.O_NONBLOCK || 0));
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
module.exports = { readManifest, safeResolvePackage, safeFile, readVerifiedFile, readVerifiedFileAsync, validateIncludedAsset, installExternalReleaseVerifier };
