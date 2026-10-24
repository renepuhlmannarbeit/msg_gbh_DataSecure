import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
process.env.DISABLE_SYSTEM_FONTS_LOAD='1';
const canvasApi=require('../native/ocr/pilot/node_modules/@napi-rs/canvas');
const {decodePng}=require('../plugins/data-secure/server/images/png');
const {inspectOfficeVisual,decodeOfficeVisual}=require('../plugins/data-secure/server/standalone/office-visual-decoder');
const {createEmfPlusPreflight}=require('../plugins/data-secure/server/standalone/emfplus-preflight');
const emf=require('../native/graphics/pilot/node_modules/emf-converter/dist/browser.js');
const font=fs.readFileSync(new URL('../native/pdfjs/pilot/node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf',import.meta.url));
let loads=0,count=0;
const options={canvasApi,fontBuffers:[font],loadBundledModule(id){loads++;assert.equal(id,'emf-converter/dist/browser.js');return emf;}};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function test(name,fn){await fn();console.log(`PASS ${++count} ${name}`);}
const u32=(...values)=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeUInt32LE(v>>>0,i*4));return b;};
const floats=(...values)=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeFloatLE(v,i*4));return b;};
function plus(type,data=Buffer.alloc(0),flags=0){const b=Buffer.alloc(12+Math.ceil(data.length/4)*4);b.writeUInt16LE(type);b.writeUInt16LE(flags,2);b.writeUInt32LE(b.length,4);b.writeUInt32LE(b.length-12,8);data.copy(b,12);return b;}
const header=()=>plus(0x4001,u32(0xdbc01001,1,96,96));
const end=()=>plus(0x4002);
const rect=(x=2,y=2,w=20,h=15,color=0xffff0000)=>plus(0x400a,Buffer.concat([u32(color,1),floats(x,y,w,h)]),0x8000);
function record(type,data){const b=Buffer.alloc(8+data.length);b.writeUInt32LE(type);b.writeUInt32LE(b.length,4);data.copy(b,8);return b;}
function file(records,{width=100,height=50,chunks=false}={}){
  const comments=(chunks?records.map(r=>[r]):[records]).map(rows=>{const data=Buffer.concat(rows);return record(70,Buffer.concat([u32(4+data.length,0x2b464d45),data]));});
  const h=record(1,Buffer.alloc(80)),e=record(14,Buffer.alloc(12));h.writeInt32LE(width-1,16);h.writeInt32LE(height-1,20);
  h.writeUInt32LE(0x464d4520,40);h.writeUInt32LE(0x10000,44);h.writeUInt32LE(88+comments.reduce((s,b)=>s+b.length,0)+20,48);h.writeUInt32LE(comments.length+2,52);h.writeUInt16LE(1,56);
  return Buffer.concat([h,...comments,e]);
}
async function decode(bytes){const units=[];for await(const unit of decodeOfficeVisual(bytes,'emf',options))units.push(unit);assert.equal(units.length,1);return units[0];}
const pixel=(unit,x,y)=>[...decodePng(unit.png).rgba.subarray((y*unit.width+x)*4,(y*unit.width+x+1)*4)];
function fontObject(id=0){const family=Buffer.from('Liberation Sans','utf16le');return plus(0x4008,Buffer.concat([u32(0xdbc01001),floats(18),u32(2,0,0,family.length/2),family]),0x600|id);}
function text(value='ÄÖÜß Anna Berger'){return plus(0x401c,Buffer.concat([u32(0xff000000,0xffffffff,value.length),floats(2,2,96,40),Buffer.from(value,'utf16le')]),0x8000);}

await test('actual bounded EMF+ inline-solid rectangle renders exact pixels through the pinned SVG role',async()=>{
  const source=file([header(),rect(),end()]),before=sha(source),unit=await decode(source);
  assert.deepEqual(pixel(unit,10,10),[255,0,0,255]);assert.deepEqual(pixel(unit,80,40),[255,255,255,255]);assert.equal(sha(source),before);
});
await test('EMF+ records may cross separate bound comment containers with one ordered header and EOF',async()=>{
  const unit=await decode(file([header(),rect(),end()],{chunks:true}));assert.deepEqual(pixel(unit,10,10),[255,0,0,255]);
});
await test('world translation, save/restore and explicit clipping preserve the actual field of view',async()=>{
  const unit=await decode(file([header(),plus(0x4025,u32(7)),plus(0x402d,floats(30,0)),rect(),plus(0x4026,u32(7)),
    plus(0x4032,floats(2,25,10,10)),rect(0,20,30,20,0xff0000ff),end()]));
  assert.deepEqual(pixel(unit,40,10),[255,0,0,255]);assert.deepEqual(pixel(unit,10,10),[255,255,255,255]);
  assert.deepEqual(pixel(unit,5,30),[0,0,255,255]);assert.deepEqual(pixel(unit,20,30),[255,255,255,255]);
});
await test('EMF+ DrawString refuses before replay because the pinned renderer ignores LayoutRect',async()=>{
  for(const [width,height]of [[15,20],[145,60]]){
    const value=text();value.writeFloatLE(width,32);value.writeFloatLE(height,36);const before=loads;
    await assert.rejects(decode(file([header(),fontObject(),value,end()])),{code:'VISUAL_EMF_PLUS_UNSUPPORTED'});assert.equal(loads,before);
  }
});
await test('solid brush object is bound by exact kind and explicit object id',async()=>{
  const brush=plus(0x4008,u32(0xdbc01001,0,0xff00ff00),0x100|3),fill=plus(0x400a,Buffer.concat([u32(3,1),floats(2,2,20,15)]));
  const unit=await decode(file([header(),brush,fill,end()]));assert.deepEqual(pixel(unit,10,10),[0,255,0,255]);
  await assert.rejects(decode(file([header(),fill,end()])),{code:'VISUAL_EMF_PLUS_UNSUPPORTED'});
});
await test('unknown effect/image/texture/continuation/GetDC records refuse before bundled renderer import',async()=>{
  for(const r of [plus(0x4004),plus(0x4038,u32(0)),plus(0x401a,Buffer.alloc(32)),plus(0x4008,u32(0xdbc01001,2,0),0x100),plus(0x4008,u32(4),0x8100)]){
    const before=loads;await assert.rejects(decode(file([header(),r,end()])),{code:'VISUAL_EMF_PLUS_UNSUPPORTED'});assert.equal(loads,before);
  }
});
await test('record data sizes, truncation, missing EOF, repeated header and unbound restore never become a partial image',async()=>{
  const malformed=rect();malformed.writeUInt32LE(4,8);
  for(const rows of [[header(),malformed,end()],[header(),rect()],[header(),header(),end()],[header(),plus(0x4026,u32(91)),end()]]){
    const before=loads;await assert.rejects(decode(file(rows)),e=>e.code?.startsWith('VISUAL_'));assert.equal(loads,before);
  }
});
await test('invalid matrices, unsupported clipping combinations and nonpixel unit assumptions are rejected',async()=>{
  for(const r of [plus(0x402a,floats(Infinity,0,0,1,0,0)),plus(0x402a,floats(0,0,0,0,0,0)),plus(0x4032,floats(0,0,10,10),0x200),plus(0x4030,floats(1),3)])
    await assert.rejects(decode(file([header(),r,rect(),end()])),{code:'VISUAL_EMF_PLUS_UNSUPPORTED'});
});
await test('Unicode surrogate and nondefault string-layout models remain unadmitted, never approximated',async()=>{
  const invalid=text('\ud800');await assert.rejects(decode(file([header(),fontObject(),invalid,end()])),{code:'VISUAL_EMF_PLUS_UNSUPPORTED'});
  const format=text();format.writeUInt32LE(2,16);await assert.rejects(decode(file([header(),fontObject(),format,end()])),{code:'VISUAL_EMF_PLUS_UNSUPPORTED'});
});
await test('one finite record budget covers nested EMF+ operations before rendering',()=>{
  const state=createEmfPlusPreflight(2);assert.throws(()=>state.accept(Buffer.concat([header(),rect(),end()])),{code:'VISUAL_PROCESSING_LIMIT'});
  assert.throws(()=>inspectOfficeVisual(file([header(),rect(),end()],{width:32768,height:32768}),'emf'),{code:'VISUAL_PROCESSING_LIMIT'});
  assert.throws(()=>createEmfPlusPreflight(10000).accept(Buffer.from([1])),{code:'VISUAL_CONTENT_DAMAGED'});
});
console.log(`passed ${count} closed EMF+ groups; actual SVG/Canvas pixels, no desktop/target-host UAT claim`);
