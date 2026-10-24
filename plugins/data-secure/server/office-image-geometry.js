'use strict';

// Passive occurrence description only, not a renderer/crop or read capability.
// Never drop native or image text on the strength of these metadata values.
const DRAW=new Set(['http://schemas.openxmlformats.org/drawingml/2006/main','http://purl.oclc.org/ooxml/drawingml/main']);
const PICTURE=new Set(['http://schemas.openxmlformats.org/drawingml/2006/picture','http://purl.oclc.org/ooxml/drawingml/picture',
 'http://schemas.openxmlformats.org/presentationml/2006/main','http://purl.oclc.org/ooxml/presentationml/main',
 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing','http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing']);
const attr=(n,k)=>n.attributes.get('{}'+k);
function createOfficeImageGeometry(){const shapes=new WeakMap(),ownerFor=new WeakMap(),blipOwner=new WeakMap();
 function start(node){let owner=ownerFor.get(node.parent);
  if(PICTURE.has(node.namespaceURI)&&node.localName==='pic'){owner={node,crops:[],transforms:[],grouped:false,unmodeled:false};shapes.set(node,owner);
   for(let p=node.parent;p;p=p.parent)if(PICTURE.has(p.namespaceURI)&&['grpSp','graphicFrame'].includes(p.localName))owner.grouped=true;}
  if(owner)ownerFor.set(node,owner);if(!owner)return;
  if(DRAW.has(node.namespaceURI)&&node.localName==='blip')blipOwner.set(node,owner);
  if(DRAW.has(node.namespaceURI)&&node.localName==='srcRect'){
   if(![...DRAW,...PICTURE].includes(node.parent?.namespaceURI)||node.parent.localName!=='blipFill'||node.parent.parent!==owner.node)owner.unmodeled=true;
   owner.crops.push(node);
  }
  if(DRAW.has(node.namespaceURI)&&node.localName==='xfrm'){
   if(node.parent?.localName!=='spPr'||node.parent.parent!==owner.node)owner.unmodeled=true;owner.transforms.push(node);
  }
  if(DRAW.has(node.namespaceURI)&&['effectLst','effectDag','custGeom','prstGeom','tile','fillRect'].includes(node.localName)){
   // A rectangular preset is conventional. Other shape/mask/fill composition
   // remains explicit and cannot claim the OCR saw the composed slide region.
   if(node.localName==='fillRect'&&node.attributes.size===0)return;
   if(node.localName!=='prstGeom'||attr(node,'prst')!=='rect')owner.unmodeled=true;
  }
 }
 function forBlip(node){const owner=blipOwner.get(node);if(!owner)return Object.freeze({scope:'asset',compositionUnmodeled:true});
  let bad=owner.unmodeled||owner.crops.length>1||owner.transforms.length>1,crop=null,rotation=0,flipH=false,flipV=false;
  const number=(raw,defaultValue,min,max)=>{if(raw===undefined)return defaultValue;if(!/^[+-]?\d{1,12}$/u.test(raw)) {bad=true;return defaultValue;}
   const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max){bad=true;return defaultValue;}return n;};
  if(owner.crops.length===1){const n=owner.crops[0];crop={left:number(attr(n,'l'),0,-100000,100000),top:number(attr(n,'t'),0,-100000,100000),right:number(attr(n,'r'),0,-100000,100000),bottom:number(attr(n,'b'),0,-100000,100000)};
   if(crop.left+crop.right>=100000||crop.top+crop.bottom>=100000)bad=true;crop=Object.freeze(crop);}
  if(owner.transforms.length===1){const n=owner.transforms[0];rotation=number(attr(n,'rot'),0,0,21600000)/60000;
   const bool=raw=>{if(raw===undefined)return false;if(!['true','false','1','0'].includes(raw)){bad=true;return false;}return raw==='true'||raw==='1';};flipH=bool(attr(n,'flipH'));flipV=bool(attr(n,'flipV'));}
  return Object.freeze({scope:'asset',crop,rotation,flipH,flipV,grouped:owner.grouped,compositionUnmodeled:bad});
 }
 return Object.freeze({start,forBlip});}
module.exports=Object.freeze({createOfficeImageGeometry});
