'use strict';

// Tesseract AUTO can segment columns on an image-only scanned page. It can
// also discard large vector-outline letters as graphics, so it is NOT a
// replacement for the existing SINGLE_BLOCK on native/mixed/vector pages.
// These are actual parsed paint facts, never file names, language guesses,
// confidence thresholds or a new assertion of table/semantic ownership.
function pdfOcrLayoutMode(facts) {
  const keys=['hasRawNativeText','hasPaintedImage','hasNonTextGraphicPaint'];
  const fail=()=>{throw Object.assign(new Error('CONVERSION_INPUT_INVALID'),{code:'CONVERSION_INPUT_INVALID'});};
  if(!facts||typeof facts!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(facts)))fail();
  const descriptors=Object.getOwnPropertyDescriptors(facts),actual=Reflect.ownKeys(descriptors);
  if(actual.length!==keys.length||actual.some(key=>!keys.includes(key)||!descriptors[key].enumerable||
    !Object.hasOwn(descriptors[key],'value')||typeof descriptors[key].value!=='boolean'))fail();
  return !descriptors.hasRawNativeText.value&&descriptors.hasPaintedImage.value&&
    !descriptors.hasNonTextGraphicPaint.value?'3':'6';
}
module.exports=Object.freeze({pdfOcrLayoutMode});
