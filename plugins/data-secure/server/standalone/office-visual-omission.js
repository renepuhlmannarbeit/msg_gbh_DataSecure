'use strict';

// Closed diagnostics shared by metadata preflight and the actual decoder.
// Unknown/policy failures never become an omitted source picture.
function officeVisualOmission(code, type) {
  if (code === 'VISUAL_DECODER_POLICY') throw Object.assign(new Error('CONVERSION_POLICY_FAILED'), { code:'CONVERSION_POLICY_FAILED' });
  if (code === 'VISUAL_CONTENT_DAMAGED') return 'IMAGE_CONTENT_DAMAGED';
  if (code === 'VISUAL_PROCESSING_LIMIT') return 'IMAGE_PROCESSING_LIMIT';
  if (['VISUAL_FEATURE_UNSUPPORTED','VISUAL_EXTERNAL_REFERENCE','VISUAL_ANIMATION_UNSUPPORTED',
    'VISUAL_FONT_UNAVAILABLE','VISUAL_EMF_PLUS_UNSUPPORTED','VISUAL_METAFILE_RECORD_UNSUPPORTED'].includes(code)) {
    const format={svg:'SVG',gif:'GIF',tif:'TIFF',tiff:'TIFF',webp:'WEBP',emf:'EMF',wmf:'WMF'}[type];
    if (format) return `OFFICE_IMAGE_FORMAT_${format}_UNSUPPORTED`;
  }
  return null;
}
module.exports=Object.freeze({officeVisualOmission});
