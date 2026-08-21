'use strict';

const zlib = require('zlib');
const MAX_EXPANDED_CONTENT_BYTES = 20 * 1024 * 1024;

function pdfUnescape(s='') {
  let out='';
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c!=='\\'){out+=c;continue;}
    const n=s[++i]; if(n===undefined)break;
    if(n==='n')out+='\n'; else if(n==='r')out+='\r'; else if(n==='t')out+='\t'; else if(n==='b')out+='\b'; else if(n==='f')out+='\f'; else if(n==='('||n===')'||n==='\\')out+=n;
    else if(/[0-7]/.test(n)){let oct=n;for(let k=0;k<2&&/[0-7]/.test(s[i+1]||'');k++)oct+=s[++i];out+=String.fromCharCode(parseInt(oct,8));}
    else if(n==='\r' && s[i+1]==='\n')i++; else if(n==='\n'||n==='\r'){} else out+=n;
  }
  return out;
}
function decodeHexPdf(hex='') {
  const clean=hex.replace(/\s+/g,''); if(clean.length<2)return''; const b=Buffer.from(clean.length%2?clean+'0':clean,'hex');
  if(b.length>=2&&b[0]===0xfe&&b[1]===0xff){let s='';for(let i=2;i+1<b.length;i+=2)s+=String.fromCharCode(b.readUInt16BE(i));return s;}
  return b.toString('latin1');
}
function extractStrings(content) {
  const out=[];
  let m; const arrayRe=/\[((?:[^\[\]]|\([^)]*\)|<[^>]*>)*)\]\s*TJ/gms;
  while((m=arrayRe.exec(content))){const body=m[1];let q;const re=/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/gms;let s='';while((q=re.exec(body)))s+=q[1]!==undefined?pdfUnescape(q[1]):decodeHexPdf(q[2]);if(s.trim())out.push(s);}
  const tjRe=/\(((?:\\.|[^\\)])*)\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj/gms;
  while((m=tjRe.exec(content)))out.push(m[1]!==undefined?pdfUnescape(m[1]):decodeHexPdf(m[2]));
  const quoteRe=/\(((?:\\.|[^\\)])*)\)\s*['"]/gms;while((m=quoteRe.exec(content)))out.push(pdfUnescape(m[1]));
  return out;
}
function maybeInflate(dict, stream) {
  if(/\/Filter\s*\/FlateDecode\b/.test(dict)){
    try{return zlib.inflateSync(stream,{maxOutputLength:MAX_EXPANDED_CONTENT_BYTES});}
    catch{throw new Error('PDF-Flate-Stream ist beschädigt oder überschreitet das Dekompressionslimit.');}
  }
  return stream;
}
function parsePdf(buffer) {
  if(!Buffer.isBuffer(buffer))buffer=Buffer.from(buffer);
  if(buffer.length<5||buffer.toString('latin1',0,5)!=='%PDF-')throw new Error('PDF-Signatur ungültig.');
  const bin=buffer.toString('latin1'); const textParts=[]; const attachments=[]; let imageCount=0,expandedBytes=0;
  const objRe=/(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/gm; let m;
  while((m=objRe.exec(bin))){const body=m[3];const si=body.indexOf('stream');if(si<0){continue;}let start=si+6;if(body[start]==='\r'&&body[start+1]==='\n')start+=2;else if(body[start]==='\n'||body[start]==='\r')start+=1;const ei=body.lastIndexOf('endstream');if(ei<start)continue;const dict=body.slice(0,si);const streamLatin=body.slice(start,ei);const stream=Buffer.from(streamLatin,'latin1');
    if(/\/Subtype\s*\/Image\b/.test(dict)){imageCount++;if(/\/Filter\s*\/DCTDecode\b/.test(dict)){attachments.push({type:'image',mimeType:'image/jpeg',data:stream.toString('base64'),name:`pdf_image_${imageCount}.jpg`,extension:'jpg',source_part:`pdf-object-${m[1]}`});}continue;}
    const data=maybeInflate(dict,stream);expandedBytes+=data.length;if(expandedBytes>MAX_EXPANDED_CONTENT_BYTES)throw new Error('PDF-Inhaltsstreams überschreiten das Dekompressionslimit.');const content=data.toString('latin1');if(/\bBT\b/.test(content)){const strings=extractStrings(content);if(strings.length)textParts.push(strings.join(' '));}
  }
  if(!textParts.length){const strings=extractStrings(bin);if(strings.length)textParts.push(strings.join(' '));}
  const text=textParts.join('\n\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]+/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  if(!text)throw new Error('PDF hat keinen sicher extrahierbaren Textlayer. Scan-/komplexe PDFs werden fail-closed gestoppt.');
  const warnings=[]; if(imageCount>attachments.length)warnings.push(`PDF enthält ${imageCount-attachments.length} visuelle Bildobjekte, die nicht als JPEG sicher extrahiert werden konnten.`);
  return {markdown:`# PDF-Inhalt\n\n${text}`,attachments,warnings,unreviewedVisualCount:Math.max(0,imageCount-attachments.length)};
}
module.exports={parsePdf,pdfUnescape,extractStrings};
