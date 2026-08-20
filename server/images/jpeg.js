'use strict';
const {ImageSafetyError}=require('./common');
function stripJpegMetadata(buf) {
  if (buf.length<4 || buf[0]!==0xff || buf[1]!==0xd8) throw new ImageSafetyError('JPEG-Signatur ungültig.');
  const parts=[buf.subarray(0,2)]; let p=2;
  while (p<buf.length) {
    if (buf[p]!==0xff) { parts.push(buf.subarray(p)); break; }
    let q=p; while(q<buf.length&&buf[q]===0xff) q++; if(q>=buf.length) break;
    const marker=buf[q];
    if(marker===0xda){parts.push(buf.subarray(p));break;}
    if(marker===0xd9){parts.push(buf.subarray(p,q+1));break;}
    if((marker>=0xd0&&marker<=0xd7)||marker===0x01){parts.push(buf.subarray(p,q+1));p=q+1;continue;}
    if(q+2>=buf.length) throw new ImageSafetyError('JPEG-Segment unvollständig.');
    const len=buf.readUInt16BE(q+1); const end=q+1+len; if(len<2||end>buf.length) throw new ImageSafetyError('JPEG-Segment ungültig.');
    const isMeta=(marker>=0xe0&&marker<=0xef)||marker===0xfe;
    if(!isMeta) parts.push(buf.subarray(p,end));
    p=end;
  }
  return Buffer.concat(parts);
}
module.exports={stripJpegMetadata};
