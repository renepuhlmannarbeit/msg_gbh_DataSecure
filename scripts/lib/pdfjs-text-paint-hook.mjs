import crypto from 'node:crypto';

// This is a DataSecure derivative of one precisely pinned PDF.js module, not
// an upstream API. Keep its upstream licence and original source unchanged.
export const PDFJS_TEXT_PAINT_HOOK = Object.freeze({
  version: 3, upstreamVersion: '6.2.108',
  upstreamSha256: '842284e0d1d439e60701e3355c2128cd3016ebebf14220e27f512467682aad66'
});

export function derivePdfjsTextPaintModule(bytes) {
  if (!Buffer.isBuffer(bytes) || crypto.createHash('sha256').update(bytes).digest('hex') !== PDFJS_TEXT_PAINT_HOOK.upstreamSha256) {
    throw new Error('PDFJS_TEXT_PAINT_SOURCE_MISMATCH');
  }
  let source = bytes.toString('utf8');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const replaceOnce = (before, after) => {
    before = before.replaceAll('\n', eol); after = after.replaceAll('\n', eol);
    if (source.split(before).length !== 2) throw new Error('PDFJS_TEXT_PAINT_PATCH_MISMATCH');
    source = source.replace(before, after);
  };
  replaceOnce('class CanvasGraphics {', [
    '// DataSecure first-party text paint observer, derivative API v3.',
    'let dataSecureTextPaintObserver = null;',
    'export function setDataSecureTextPaintObserver(observer) {',
    '  if (observer !== null && typeof observer !== "function") throw new TypeError("PDF_TEXT_OBSERVER_INVALID");',
    '  dataSecureTextPaintObserver = observer;',
    '}',
    'class CanvasGraphics {'
  ].join('\n'));
  replaceOnce('    let x = 0,\n      i;\n    for (i = 0; i < glyphsLength; ++i) {', [
    '    let dataSecureSuppressPaint = false;',
    '    let dataSecureGlyphMask = null, dataSecureEvent = null, dataSecurePaintBefore = null, dataSecureCollectGeometry = false;',
    '    if (dataSecureTextPaintObserver !== null) {',
    '      const matrix = ctx.getTransform();',
    '      const dataSecureFillStyle = ctx.fillStyle;',
    '      const event = dataSecureEvent = Object.freeze({',
    '        text: glyphs.filter(glyph => typeof glyph !== "number").map(glyph => glyph.unicode).join(""),',
    '        baseline: Object.freeze([matrix.e, matrix.f]),',
    '        fontName: font.loadedName,',
    '        renderMode: current.textRenderingMode, fillAlpha: current.fillAlpha, strokeAlpha: current.strokeAlpha,',
    '        solidFillColor: !current.patternFill && typeof dataSecureFillStyle === "string" &&',
    '          /^#[0-9a-f]{6}$/i.test(dataSecureFillStyle) ? dataSecureFillStyle.toLowerCase() : null,',
    '        contentVisible: this.contentVisible, fontSize: current.fontSize,',
    '        glyphs: [], paintEvidence: { sampled: false, changed: false },',
    '        glyphCount: glyphs.reduce((count, glyph) => count + (typeof glyph !== "number" ? 1 : 0), 0),',
    '        geometryEligible: !vertical && !current.patternFill && !current.patternStroke &&',
    '          current.textRenderingMode === 0 && Math.abs(matrix.b) < 0.000001 &&',
    '          Math.abs(matrix.c) < 0.000001 && matrix.a > 0 && matrix.d > 0 &&',
    '          Number.isFinite(font.ascent) && Number.isFinite(font.descent) &&',
    '          font.ascent >= 0.5 && font.ascent <= 1.5 && font.descent <= 0 && font.descent >= -0.5,',
    '        eligible: !vertical && !current.patternFill && !current.patternStroke &&',
    '          current.textRenderingMode >= 0 && current.textRenderingMode <= 3',
    '      });',
    '      const decision = dataSecureTextPaintObserver(event);',
    '      dataSecureCollectGeometry = decision?.collectGeometry === true && event.geometryEligible && glyphs.length <= 4096;',
    '      dataSecureSuppressPaint = (decision === true || decision?.suppressPaint === true) && event.eligible;',
    '      if (event.geometryEligible && Array.isArray(decision?.suppressGlyphs) &&',
    '          decision.suppressGlyphs.length <= 4096 && decision.suppressGlyphs.every(Number.isInteger)) {',
    '        dataSecureGlyphMask = new Set(decision.suppressGlyphs);',
    '      }',
    '      if (decision?.capturePaint === true && ctx.canvas.width * ctx.canvas.height <= 2000000) {',
    '        try { dataSecurePaintBefore = Uint8ClampedArray.from(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data); } catch {}',
    '      }',
    '    }',
    '    let x = 0,',
    '      i;',
    '    for (i = 0; i < glyphsLength; ++i) {'
  ].join('\n'));
  replaceOnce('      if (this.contentVisible && (glyph.isInFont || font.missingFile)) {', [
    '      if (dataSecureCollectGeometry && dataSecureEvent.glyphs.length < 4096) {',
    '        const matrix = ctx.getTransform();',
    '        const advance = width * widthAdvanceScale / fontSizeScale;',
    '        dataSecureEvent.glyphs.push(Object.freeze({ index: i, text: glyph.unicode, space: glyph.isSpace,',
    '          supported: !accent && !vertical && typeof glyph.unicode === "string",',
    '          x0: matrix.a * scaledX + matrix.c * scaledY + matrix.e,',
    '          x1: matrix.a * (scaledX + advance) + matrix.c * scaledY + matrix.e,',
    '          baseline: matrix.b * scaledX + matrix.d * scaledY + matrix.f,',
    '          height: Math.abs(matrix.d * fontSize / fontSizeScale)',
    '        }));',
    '      }',
    '      if (!dataSecureSuppressPaint && !dataSecureGlyphMask?.has(i) && this.contentVisible && (glyph.isInFont || font.missingFile)) {'
  ].join('\n'));
  replaceOnce('    if (vertical) {\n      current.y -= x;\n    } else {\n      current.x += x * textHScale;', [
    '    if (dataSecureEvent !== null) {',
    '      Object.freeze(dataSecureEvent.glyphs);',
    '      if (dataSecurePaintBefore !== null) {',
    '        try {',
    '          const after = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;',
    '          if (after.length === dataSecurePaintBefore.length) {',
    '            dataSecureEvent.paintEvidence.sampled = true;',
    '            for (let p = 0; p < after.length; p++) {',
    '              if (after[p] !== dataSecurePaintBefore[p]) { dataSecureEvent.paintEvidence.changed = true; break; }',
    '            }',
    '          }',
    '        } catch {}',
    '      }',
    '      Object.freeze(dataSecureEvent.paintEvidence);',
    '    }',
    '    if (vertical) {',
    '      current.y -= x;',
    '    } else {',
    '      current.x += x * textHScale;'
  ].join('\n'));
  return Buffer.from(source, 'utf8');
}
