'use strict';
const {clamp}=require('./common');
function redactRgba(img, rects, padding=4) {
  const {width,height,rgba}=img;
  for (const r of rects) {
    const x0=clamp(Math.floor(r.x0-padding),0,width), y0=clamp(Math.floor(r.y0-padding),0,height), x1=clamp(Math.ceil(r.x1+padding),0,width), y1=clamp(Math.ceil(r.y1+padding),0,height);
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){const i=(y*width+x)*4;rgba[i]=0;rgba[i+1]=0;rgba[i+2]=0;rgba[i+3]=255;}
  }
  return img;
}
module.exports={redactRgba};
