'use strict';
const assert=require('node:assert/strict');
const {pdfOcrLayoutMode}=require('../plugins/data-secure/server/standalone/pdf-ocr-layout-mode');
let count=0;
for(const hasRawNativeText of [false,true])for(const hasPaintedImage of [false,true])for(const hasNonTextGraphicPaint of [false,true]){
 const facts={hasRawNativeText,hasPaintedImage,hasNonTextGraphicPaint};
 assert.equal(pdfOcrLayoutMode(facts),!hasRawNativeText&&hasPaintedImage&&!hasNonTextGraphicPaint?'3':'6');count++;
}
// PUA/undecodable native text is still raw text, never a claimed image-only
// scan. Large vector letters and mixed pages retain the existing path.
assert.equal(pdfOcrLayoutMode({hasRawNativeText:true,hasPaintedImage:true,hasNonTextGraphicPaint:false}),'6');
assert.equal(pdfOcrLayoutMode({hasRawNativeText:false,hasPaintedImage:false,hasNonTextGraphicPaint:true}),'6');
let reads=0;const getter={hasPaintedImage:true,hasNonTextGraphicPaint:false,get hasRawNativeText(){reads++;return false;}};
for(const invalid of [null,{},getter,{hasRawNativeText:0,hasPaintedImage:true,hasNonTextGraphicPaint:false},
 {hasRawNativeText:false,hasPaintedImage:true,hasNonTextGraphicPaint:false,guessedColumns:3}]){
 assert.throws(()=>pdfOcrLayoutMode(invalid),{code:'CONVERSION_INPUT_INVALID'});count++;
}
assert.equal(reads,0);console.log(`${count+2} PDF OCR layout-mode cases PASS`);
