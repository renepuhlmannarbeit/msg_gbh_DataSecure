'use strict';
const {MAX_IMAGE_BYTES}=require('./common');
const {flattenWords,entityRects,minOcrCharsFor,normalizeMime,reencodeMetadataFree,redactEditable}=require('./ocr-map');
async function sanitizeImageAttachment(att, opts) {
  const profile=opts.profile||'general', mode=opts.visualMode||'strict';
  const mime=normalizeMime(att); const base={status:'excluded',reason:'unknown',original_mime:mime,output_mime:null,ocr_chars:0,redactions:0,data:null};
  if(!mime.startsWith('image/'))return {...base,reason:'not_an_image'};
  let buf;try{buf=Buffer.from(String(att?.data||''),'base64');}catch{return {...base,reason:'invalid_image_data'};}
  if(!buf.length)return {...base,reason:'empty_image'}; if(buf.length>MAX_IMAGE_BYTES)return {...base,reason:'image_too_large_for_safe_processing'};
  let ocr; try{ocr=await opts.ocrDetailed(buf,opts.language||'deu');}catch(e){return {...base,reason:'ocr_failed'};}
  const flat=flattenWords(ocr); const ocrText=flat.text || String(att?.ocrText||'').trim(); base.ocr_chars=ocrText.length;
  if(profile==='applicant')return {...base,reason:'applicant_visual_removed',ocr_text:ocrText};
  let entities=[]; try{entities=await opts.scanText(ocrText);}catch{return {...base,reason:'pii_scan_failed',ocr_text:ocrText};}
  const threshold=minOcrCharsFor(profile,mode); if(!entities.length && ocrText.trim().length<threshold) return {...base,reason:'insufficient_safe_text_for_visual',ocr_text:ocrText};
  if(!entities.length){ try{const safe=reencodeMetadataFree(buf,mime);return {...base,status:'included',reason:'ocr_clean_metadata_stripped',output_mime:mime,data:safe,ocr_text:ocrText};} catch{return {...base,reason:'unsupported_safe_reencode',ocr_text:ocrText};} }
  if(!['image/png','image/bmp'].includes(mime)) return {...base,reason:'pii_found_unredactable_format',ocr_text:ocrText};
  const rects=entityRects(entities,flat.words); if(!rects.length)return {...base,reason:'pii_bbox_mapping_failed',ocr_text:ocrText};
  let redacted; try{redacted=redactEditable(buf,mime,rects);}catch{return {...base,reason:'image_redaction_failed',ocr_text:ocrText};}
  try{ const after=await opts.ocrDetailed(redacted,opts.language||'deu'); const afterText=flattenWords(after).text; const remaining=await opts.scanText(afterText); if(remaining.length)return {...base,reason:'residual_pii_after_redaction',ocr_text:ocrText,redactions:rects.length}; }catch{return {...base,reason:'post_redaction_verification_failed',ocr_text:ocrText,redactions:rects.length};}
  return {...base,status:'included',reason:'pii_redacted_and_verified',output_mime:mime,data:redacted,ocr_text:ocrText,redactions:rects.length};
}
module.exports={sanitizeImageAttachment};
