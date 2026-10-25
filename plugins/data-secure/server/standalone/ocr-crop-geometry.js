'use strict';

const { validBox } = require('./ocr-refinement');

// Recognition may use an exactly doubled raster, but review crops remain in
// the original raster's coordinates/pixels. This projects only line geometry;
// it neither changes transcript indices nor assigns new confidence values.
function sourceCropBlocks(blocks, ocrWidth, ocrHeight, sourceWidth, sourceHeight) {
  if (![ocrWidth, ocrHeight, sourceWidth, sourceHeight].every(Number.isSafeInteger) ||
      sourceWidth < 1 || sourceHeight < 1 || ocrWidth !== sourceWidth * 2 || ocrHeight !== sourceHeight * 2) return [];
  return (Array.isArray(blocks) ? blocks : []).map(block => ({ paragraphs:
    (Array.isArray(block?.paragraphs) ? block.paragraphs : []).map(paragraph => ({ lines:
      (Array.isArray(paragraph?.lines) ? paragraph.lines : []).map(line => {
        let bbox;
        if (validBox(line?.bbox, ocrWidth, ocrHeight)) {
          const box = line.bbox;
          const projected = { x0: Math.max(0, Math.floor(box.x0 / 2)), y0: Math.max(0, Math.floor(box.y0 / 2)),
            x1: Math.min(sourceWidth, Math.ceil(box.x1 / 2)), y1: Math.min(sourceHeight, Math.ceil(box.y1 / 2)) };
          if (validBox(projected, sourceWidth, sourceHeight)) bbox = projected;
        }
        return { text: line?.text, bbox };
      }) })) }));
}

module.exports = { sourceCropBlocks };
