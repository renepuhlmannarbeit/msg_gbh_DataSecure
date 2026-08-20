'use strict';
const {ImageSafetyError,MAX_PIXELS}=require('./common');
function decodeBmp(buf) {
  if (buf.length<54 || buf.toString('ascii',0,2)!=='BM') throw new ImageSafetyError('BMP-Signatur ungültig.');
  const pixelOffset=buf.readUInt32LE(10), dib=buf.readUInt32LE(14); if(dib<40) throw new ImageSafetyError('BMP-DIB nicht unterstützt.');
  const width=buf.readInt32LE(18), hSigned=buf.readInt32LE(22), bpp=buf.readUInt16LE(28), compression=buf.readUInt32LE(30);
  if(width<=0||hSigned===0||![24,32].includes(bpp)||compression!==0) throw new ImageSafetyError('BMP-Variante nicht sicher bearbeitbar.');
  if (width*Math.abs(hSigned)>MAX_PIXELS) throw new ImageSafetyError('BMP ist für die sichere lokale Bildverarbeitung zu groß.');
  const height=Math.abs(hSigned), topDown=hSigned<0, rowSize=Math.floor((bpp*width+31)/32)*4; const rgba=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++){
    const sy=topDown?y:(height-1-y), base=pixelOffset+sy*rowSize;
    if(base+rowSize>buf.length) throw new ImageSafetyError('BMP-Daten unvollständig.');
    for(let x=0;x<width;x++){const s=base+x*(bpp/8), d=(y*width+x)*4; rgba[d]=buf[s+2];rgba[d+1]=buf[s+1];rgba[d+2]=buf[s];rgba[d+3]=bpp===32?buf[s+3]:255;}
  }
  return {width,height,rgba};
}
function encodeBmp({width,height,rgba}) {
  const rowSize=Math.floor((24*width+31)/32)*4, header=54, imageSize=rowSize*height, out=Buffer.alloc(header+imageSize);
  out.write('BM',0);out.writeUInt32LE(out.length,2);out.writeUInt32LE(header,10);out.writeUInt32LE(40,14);out.writeInt32LE(width,18);out.writeInt32LE(-height,22);out.writeUInt16LE(1,26);out.writeUInt16LE(24,28);out.writeUInt32LE(0,30);out.writeUInt32LE(imageSize,34);out.writeInt32LE(2835,38);out.writeInt32LE(2835,42);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){const s=(y*width+x)*4,d=header+y*rowSize+x*3;out[d]=rgba[s+2];out[d+1]=rgba[s+1];out[d+2]=rgba[s];}
  return out;
}
module.exports={decodeBmp,encodeBmp};
