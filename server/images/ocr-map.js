'use strict';
const {ImageSafetyError}=require('./common');
const {decodePng,encodePng}=require('./png');
const {decodeBmp,encodeBmp}=require('./bmp');
const {redactRgba}=require('./redact');
const {stripJpegMetadata}=require('./jpeg');
function flattenWords(ocr) {
  const words=[]; const blocks=ocr?.blocks || ocr?.data?.blocks || [];
  for(const b of blocks||[]) for(const p of b?.paragraphs||[]) for(const l of p?.lines||[]) for(const w of l?.words||[]) { const text=String(w?.text||'').trim(); const box=w?.bbox; if(text&&box&&Number.isFinite(box.x0)) words.push({text,bbox:{x0:box.x0,y0:box.y0,x1:box.x1,y1:box.y1}}); }
  if(!words.length && Array.isArray(ocr?.words)) for(const w of ocr.words){const text=String(w?.text||'').trim(),box=w?.bbox;if(text&&box)words.push({text,bbox:box});}
  let text=''; for(const w of words){if(text)text+=' ';w.start=text.length;text+=w.text;w.end=text.length;} return {text,words};
}
function entityRects(entities, words) { const rects=[]; for(const e of entities||[]){const s=Number(e.start),t=Number(e.end);if(!Number.isFinite(s)||!Number.isFinite(t))continue;for(const w of words)if(w.end>s&&w.start<t)rects.push(w.bbox);} const seen=new Set(); return rects.filter(r=>{const k=`${r.x0},${r.y0},${r.x1},${r.y1}`;if(seen.has(k))return false;seen.add(k);return true;}); }
function minOcrCharsFor(profile, mode) { if(mode==='balanced') return 0; if(profile==='contract') return 20; if(profile==='customer') return 12; if(profile==='general') return 12; return Number.POSITIVE_INFINITY; }
function normalizeMime(att) { let m=String(att?.mimeType||'').toLowerCase(); if(m==='image/jpg')m='image/jpeg'; if(!m.startsWith('image/')){ const e=String(att?.extension||'').toLowerCase(); m={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',bmp:'image/bmp',gif:'image/gif',webp:'image/webp',tif:'image/tiff',tiff:'image/tiff'}[e]||m; } return m; }
function extForMime(m){return {'image/png':'png','image/jpeg':'jpg','image/bmp':'bmp','image/gif':'gif','image/webp':'webp','image/tiff':'tiff'}[m]||'bin';}
function reencodeMetadataFree(buf,mime){if(mime==='image/png')return encodePng(decodePng(buf));if(mime==='image/bmp')return encodeBmp(decodeBmp(buf));if(mime==='image/jpeg')return stripJpegMetadata(buf);throw new ImageSafetyError('Bildformat kann nicht metadata-frei geschrieben werden.');}
function redactEditable(buf,mime,rects){if(mime==='image/png')return encodePng(redactRgba(decodePng(buf),rects));if(mime==='image/bmp')return encodeBmp(redactRgba(decodeBmp(buf),rects));throw new ImageSafetyError('Bildformat kann nicht lokal geschwärzt werden.');}
module.exports={flattenWords,entityRects,minOcrCharsFor,normalizeMime,extForMime,reencodeMetadataFree,redactEditable};
