import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument, version as pdfjsVersion } from 'pdfjs-dist/legacy/build/pdf.mjs';

function makePdf({ content, catalogExtra = '', extraObjects = [] }) {
  const stream = Buffer.from(content, 'ascii');
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${catalogExtra} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 200] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...extraObjects
  ];
  let body = '%PDF-1.7\n%DS00\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'ascii'));
}

async function openLocal(bytes) {
  const standardFonts = `${path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    'node_modules', 'pdfjs-dist', 'standard_fonts').replaceAll('\\', '/')}/`;
  const loadingTask = getDocument({
    data: bytes,
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
    useWorkerFetch: false,
    stopAtErrors: true,
    standardFontDataUrl: standardFonts
  });
  return { loadingTask, doc: await loadingTask.promise };
}

async function runPilot() {
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = async () => {
    networkAttempts++;
    throw new Error('NETWORK_BLOCKED_BY_PILOT');
  };
  try {
    const textPdf = makePdf({
      content: 'BT /F1 16 Tf 30 120 Td (Alice Example at Example GmbH) Tj ET'
    });
    const { loadingTask, doc } = await openLocal(textPdf);
    assert.equal(doc.numPages, 1);
    const page = await doc.getPage(1);
    const text = (await page.getTextContent()).items.map((item) => item.str).join(' ');
    assert.match(text, /Alice Example/u);

    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const rendered = canvas.toBuffer('image/png');
    assert.ok(rendered.length > 100);
    await loadingTask.destroy();

    const actionPdf = makePdf({
      content: 'BT /F1 12 Tf 30 120 Td (Static content) Tj ET',
      catalogExtra: '/OpenAction 6 0 R',
      extraObjects: ['<< /S /JavaScript /JS (app.alert\\(secret\\)) >>']
    });
    const { loadingTask: actionTask, doc: actionDoc } = await openLocal(actionPdf);
    const actions = typeof actionDoc.getJSActions === 'function'
      ? await actionDoc.getJSActions()
      : await actionDoc.getDocJSActions();
    assert.ok(actions && Object.keys(actions).length > 0);
    await actionTask.destroy();

    assert.equal(networkAttempts, 0);
    return {
      schema_version: 1,
      story: 'BL-023.1',
      evidence_kind: 'open-source-stack-pilot-not-product-proof',
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      pdfjs_version: pdfjsVersion,
      canvas_package: '@napi-rs/canvas',
      local_byte_input: true,
      text_extraction: true,
      page_rendering: true,
      javascript_action_detection: true,
      network_attempts: networkAttempts,
      rendered_png_sha256: crypto.createHash('sha256').update(rendered).digest('hex'),
      release_decision: 'no_go',
      product_pdf_gate: 'PDF_COVERAGE_UNVERIFIED',
      passed_gates: [],
      open_work: [
        'attachments-forms-annotations-encryption',
        'resource-and-process-isolation',
        'three-platform-package',
        'scan-pdf-offline-ocr',
        'adversarial-and-fuzz-corpus',
        'licenses-notices-sbom'
      ]
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

process.stdout.write(`${JSON.stringify(await runPilot(), null, 2)}\n`);
