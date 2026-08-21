'use strict';
const zlib=require('zlib');
const {ImageSafetyError,MAX_PIXELS}=require('./common');
const PNG_SIG = Buffer.from([137,80,78,71,13,10,26,10]);
let crcTable = null;
function makeCrcTable() { const table = new Uint32Array(256); for (let n=0;n<256;n++) { let c=n; for (let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); table[n]=c>>>0; } return table; }
function crc32(buf) { if (!crcTable) crcTable=makeCrcTable(); let c=0xffffffff; for (const b of buf) c=crcTable[(c^b)&0xff]^(c>>>8); return (c^0xffffffff)>>>0; }
function pngChunk(type, data) { const t=Buffer.from(type,'ascii'); const out=Buffer.alloc(12+data.length); out.writeUInt32BE(data.length,0); t.copy(out,4); data.copy(out,8); out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length); return out; }
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePng(buf) {
  if (buf.length<33 || !buf.subarray(0,8).equals(PNG_SIG)) throw new ImageSafetyError('PNG-Signatur ungültig.');
  let off=8, width=0,height=0,bitDepth=0,colorType=-1,interlace=0,sawHeader=false,sawEnd=false; const idat=[];
  while (off+12<=buf.length) { const len=buf.readUInt32BE(off); const type=buf.toString('ascii',off+4,off+8); if(len>buf.length-off-12)throw new ImageSafetyError('PNG-Chunk ist abgeschnitten.');const data=buf.subarray(off+8,off+8+len);const expectedCrc=buf.readUInt32BE(off+8+len),actualCrc=crc32(buf.subarray(off+4,off+8+len));if(expectedCrc!==actualCrc)throw new ImageSafetyError('PNG-Chunk-Prüfsumme stimmt nicht.'); off+=12+len; if (type==='IHDR') { if(sawHeader||len!==13)throw new ImageSafetyError('PNG-Header ist ungültig.');sawHeader=true;width=data.readUInt32BE(0); height=data.readUInt32BE(4); bitDepth=data[8]; colorType=data[9]; interlace=data[12]; } else if (type==='IDAT') idat.push(data); else if (type==='IEND') {sawEnd=true;break;} }
  if(!sawHeader||!sawEnd||!idat.length)throw new ImageSafetyError('PNG-Struktur ist unvollständig.');
  if (!width||!height||bitDepth!==8||interlace!==0) throw new ImageSafetyError('PNG-Variante nicht sicher bearbeitbar (nur 8-bit, nicht interlaced).');
  if (width*height>MAX_PIXELS) throw new ImageSafetyError('PNG ist für die sichere lokale Bildverarbeitung zu groß.');
  const channels={0:1,2:3,4:2,6:4}[colorType]; if (!channels) throw new ImageSafetyError(`PNG-Farbtyp ${colorType} nicht unterstützt.`);
  const rowBytes=width*channels; const expected=(rowBytes+1)*height; let raw;try{raw=zlib.inflateSync(Buffer.concat(idat),{maxOutputLength:expected});}catch{throw new ImageSafetyError('PNG-Dekompression ist beschädigt oder zu groß.');}if (raw.length!==expected) throw new ImageSafetyError('PNG-Datenlänge stimmt nicht mit den Bildmaßen überein.');
  const recon=Buffer.alloc(rowBytes*height); let rp=0,op=0;
  for (let y=0;y<height;y++) { const filter=raw[rp++]; for (let x=0;x<rowBytes;x++) { const val=raw[rp++], a=x>=channels?recon[op+x-channels]:0, b=y>0?recon[op-rowBytes+x]:0, c=(y>0&&x>=channels)?recon[op-rowBytes+x-channels]:0; let out; if(filter===0) out=val; else if(filter===1) out=(val+a)&255; else if(filter===2) out=(val+b)&255; else if(filter===3) out=(val+Math.floor((a+b)/2))&255; else if(filter===4) out=(val+paeth(a,b,c))&255; else throw new ImageSafetyError(`PNG-Filter ${filter} nicht unterstützt.`); recon[op+x]=out; } op+=rowBytes; }
  const rgba=Buffer.alloc(width*height*4); let si=0,di=0;
  for(let i=0;i<width*height;i++){ if(colorType===6){rgba[di++]=recon[si++];rgba[di++]=recon[si++];rgba[di++]=recon[si++];rgba[di++]=recon[si++];} else if(colorType===2){rgba[di++]=recon[si++];rgba[di++]=recon[si++];rgba[di++]=recon[si++];rgba[di++]=255;} else if(colorType===0){const g=recon[si++];rgba[di++]=g;rgba[di++]=g;rgba[di++]=g;rgba[di++]=255;} else {const g=recon[si++],a=recon[si++];rgba[di++]=g;rgba[di++]=g;rgba[di++]=g;rgba[di++]=a;} }
  return {width,height,rgba};
}
function encodePng({width,height,rgba}) { const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0; const raw=Buffer.alloc((width*4+1)*height); let rp=0,sp=0; for(let y=0;y<height;y++){raw[rp++]=0;rgba.copy(raw,rp,sp,sp+width*4);rp+=width*4;sp+=width*4;} return Buffer.concat([PNG_SIG,pngChunk('IHDR',ihdr),pngChunk('IDAT',zlib.deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]); }
module.exports={decodePng,encodePng};
