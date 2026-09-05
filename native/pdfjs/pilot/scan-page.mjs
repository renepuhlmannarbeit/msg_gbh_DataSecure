// Engineering composition only; no bundled product activation or download.
import { createCanvas } from '@napi-rs/canvas';
import { extractImageMarkdown } from '../../ocr/pilot/markdown.mjs';

const MAX_PIXELS = 30_000_000;

export async function extractRenderedPage(page, { signal } = {}) {
  if (signal?.aborted) throw Object.assign(new Error('REQUEST_CANCELLED'), { code: 'REQUEST_CANCELLED' });
  const viewport = page.getViewport({ scale: 2 });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
    throw Object.assign(new Error('PDF_PIXEL_LIMIT'), { code: 'PDF_PIXEL_LIMIT' });
  }
  const canvas = createCanvas(width, height);
  const render = page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' });
  let rejectCancellation;
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
  const abort = () => {
    // PDF.js teardown can leave a pending render promise. Race only this
    // in-process phase, never the OCR phase with its owned child lifecycle.
    try { render.cancel(); } catch { /* fixed cancellation below remains authoritative */ }
    rejectCancellation(Object.assign(new Error('REQUEST_CANCELLED'), { code: 'REQUEST_CANCELLED' }));
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    await (signal ? Promise.race([render.promise, cancellation]) : render.promise);
    signal?.removeEventListener('abort', abort);
    if (signal?.aborted) throw Object.assign(new Error('REQUEST_CANCELLED'), { code: 'REQUEST_CANCELLED' });
    return await extractImageMarkdown(canvas.toBuffer('image/png'), 'png', { signal });
  } finally {
    signal?.removeEventListener('abort', abort);
    // Release each raster before the next page; never accumulate a whole
    // scanned document as images in memory.
    canvas.width = 1;
    canvas.height = 1;
  }
}
