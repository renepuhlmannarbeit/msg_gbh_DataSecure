'use strict';
const fs=require('fs');const path=require('path');
const {rasterizeToPng,ocrPngDetailed}=require('../runtime');
const pii=require('../pii-engine');
const {decodePng,encodePng,decodeBmp,flattenWords,entityRects,redactEditable,normalizeMime}=require('../image-sanitizer');
const {LIMITS,roots,sha256Buffer,sha256File}=require('./common');
const {MAX_ASSET_BYTES}=LIMITS;

function normalizePng(buf,mime){if(mime==='image/png')return encodePng(decodePng(buf));if(mime==='image/bmp')return encodePng(decodeBmp(buf));return null;}
function languageTag(){const l=String(process.env.EU_PRIVACY_LANGUAGE||'de').toLowerCase();return l.startsWith('de')?'de-DE':'en-US';}
async function prepareVisual(att,profile,deps={}){
  const raster=deps.rasterizeToPng||rasterizeToPng,ocr=deps.ocrPngDetailed||ocrPngDetailed;
  const mime=normalizeMime(att),ext=String(att.extension||path.extname(att.name||'').slice(1)||'bin').toLowerCase();let raw;try{raw=Buffer.from(String(att.data||''),'base64');}catch{return{status:'review_required',reason:'invalid_visual_data',reviewData:null,reviewExt:ext,ocrText:''};}
  if(!raw.length||raw.length>MAX_ASSET_BYTES)return{status:'review_required',reason:raw.length?'visual_too_large':'empty_visual',reviewData:raw,reviewExt:ext,ocrText:''};
  let png=null;try{png=normalizePng(raw,mime);}catch{}
  if(!png){try{png=await raster(raw,ext);}catch{}}
  const reviewData=png||raw,reviewExt=png?'png':ext;
  let ocrData=null,ocrText='';if(png){try{ocrData=await ocr(png,languageTag());ocrText=flattenWords(ocrData).text||String(ocrData?.text||'').trim();}catch{}}
  if(profile==='applicant'||profile==='personnel_profile')return{status:'review_required',reason:profile==='applicant'?'applicant_visual_human_review':'personnel_visual_human_review',reviewData,reviewExt,ocrText,candidatePng:png};
  if(!png)return{status:'review_required',reason:'visual_not_rasterized_safely',reviewData,reviewExt,ocrText};
  if(!ocrData)return{status:'review_required',reason:'ocr_unavailable_fail_closed',reviewData:png,reviewExt:'png',ocrText:''};
  const flat=flattenWords(ocrData);const spans=pii.sensitiveSpans(ocrText,profile);
  if(!spans.length){if(String(process.env.EU_PRIVACY_VISUAL_MODE||'strict').toLowerCase()==='strict'&&ocrText.trim().length<8)return{status:'review_required',reason:'insufficient_ocr_for_automatic_release',reviewData:png,reviewExt:'png',ocrText};return{status:'included',reason:'ocr_clean_metadata_free',data:png,mime:'image/png',ocrText,redactions:0};}
  const rects=entityRects(spans,flat.words);if(!rects.length)return{status:'review_required',reason:'pii_bbox_mapping_failed',reviewData:png,reviewExt:'png',ocrText};
  let redacted;try{redacted=redactEditable(png,'image/png',rects);}catch{return{status:'review_required',reason:'visual_redaction_failed',reviewData:png,reviewExt:'png',ocrText};}
  try{const after=await ocr(redacted,languageTag());const afterText=flattenWords(after).text||String(after?.text||'');const residual=pii.sensitiveSpans(afterText,profile);if(residual.length)return{status:'review_required',reason:'residual_visual_pii',reviewData:redacted,reviewExt:'png',ocrText,redactions:rects.length};}catch{return{status:'review_required',reason:'post_redaction_ocr_failed',reviewData:redacted,reviewExt:'png',ocrText,redactions:rects.length};}
  return{status:'included',reason:'pii_redacted_and_verified',data:redacted,mime:'image/png',ocrText,redactions:rects.length};
}
function safeReviewFilename(id,ext){ext=String(ext||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase()||'bin';return`${id}.${ext}`;}
function writeReviewItem(packageId,assetId,res,packageDir){const r=roots(),dir=path.join(r.review,packageId);fs.mkdirSync(dir,{recursive:true});const reviewId=`${packageId}__${assetId}`;let file=null;if(res.reviewData){file=safeReviewFilename(assetId,res.reviewExt);fs.writeFileSync(path.join(dir,file),res.reviewData);}const meta={review_id:reviewId,package_id:packageId,asset_id:assetId,reason:res.reason,preview_file:file,preview_sha256:file?sha256File(path.join(dir,file)):null,created_at:new Date().toISOString(),approved:false,package_dir:path.basename(packageDir)};fs.writeFileSync(path.join(dir,`${assetId}.review.json`),JSON.stringify(meta,null,2),'utf8');return meta;}
async function processVisuals(attachments,profile,packageId,stagePackage,deps={}){const assetsDir=path.join(stagePackage,'assets');fs.mkdirSync(assetsDir,{recursive:true});const results=[],ocrExtras=[];let seq=0;for(const att of attachments||[]){seq++;const assetId=`asset-${String(seq).padStart(3,'0')}`;const res=await prepareVisual(att,profile,deps);if(res.ocrText)ocrExtras.push(`\n\n### Extrahierter Bildtext ${seq}\n\n${res.ocrText}`);const item={asset_id:assetId,status:res.status,reason:res.reason,original_mime:normalizeMime(att),redactions:res.redactions||0};if(res.status==='included'&&res.data){const file=`${assetId}.png`;fs.writeFileSync(path.join(assetsDir,file),res.data);Object.assign(item,{file:`assets/${file}`,output_mime:'image/png',bytes:res.data.length,sha256:sha256Buffer(res.data)});}else{const meta=writeReviewItem(packageId,assetId,res,stagePackage);item.review_id=meta.review_id;item.preview_available=!!meta.preview_file;}results.push(item);}return{results,ocrExtras:ocrExtras.join('')};}
function assetsMarkdown(results){if(!results.length)return'';const a=['','## Visuelle Anlagen',''];for(const x of results){if(x.status==='included')a.push(`![Sichere Grafik ${x.asset_id.replace('asset-','')}](./${x.file})`);else a.push(`> Grafik ${x.asset_id.replace('asset-','')} wurde nicht an Claude freigegeben. Lokale visuelle Prüfung erforderlich (${x.reason}).`);a.push('');}return a.join('\n');}

module.exports={prepareVisual,processVisuals,assetsMarkdown};
