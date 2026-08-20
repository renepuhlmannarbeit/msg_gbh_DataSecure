'use strict';
const assert=require('assert');const {encodePng}=require('../server/image-sanitizer');const gw=require('../server/gateway');
const rgba=Buffer.alloc(240*80*4,255);const png=encodePng({width:240,height:80,rgba});const att={mimeType:'image/png',extension:'png',name:'test.png',data:png.toString('base64')};
function ocrWithPii(){return{text:'Max Mustermann max@example.de',words:[{text:'Max',bbox:{x0:10,y0:10,x1:50,y1:30}},{text:'Mustermann',bbox:{x0:55,y0:10,x1:130,y1:30}},{text:'max@example.de',bbox:{x0:10,y0:40,x1:150,y1:60}}]};}
(async()=>{
 let calls=0;const res=await gw._test.prepareVisual(att,'customer',{ocrPngDetailed:async()=>{calls++;return calls===1?ocrWithPii():{text:'',words:[]};},rasterizeToPng:async()=>png});assert.equal(res.status,'included');assert(res.redactions>=3);assert.equal(res.mime,'image/png');
 const p=await gw._test.prepareVisual(att,'personnel_profile',{ocrPngDetailed:async()=>ocrWithPii(),rasterizeToPng:async()=>png});assert.equal(p.status,'review_required');assert.equal(p.reason,'personnel_visual_human_review');assert(p.reviewData.length>0);
 const fail=await gw._test.prepareVisual({mimeType:'image/x-emf',extension:'emf',name:'v.emf',data:Buffer.from('fake').toString('base64')},'contract',{rasterizeToPng:async()=>{throw new Error('no')},ocrPngDetailed:async()=>({})});assert.equal(fail.status,'review_required');assert.equal(fail.reason,'visual_not_rasterized_safely');
 console.log('PASS visual pipeline');
})().catch(e=>{console.error(e);process.exit(1)});
