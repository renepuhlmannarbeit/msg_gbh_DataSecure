// Development only. No worker, user-document directory or product listener.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { workspacePreviewBridge } from './standalone-workspace-preview.mjs';
const require = createRequire(import.meta.url);
const { readBoundFile } = require('../../plugins/data-secure/server/core/bound-file-io');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'apps/datasecure-standalone/frontend');

export function syntheticDraft(kind = 'ocr') {
  if (kind === 'entities') {
    const { buildBatchReviewDraft } = require('../../plugins/data-secure/server/companion/text-review');
    const texts = ['Erika Linden arbeitet bei Fennwerk GmbH.', 'Erika Linden betreut ein zweites Dokument.'];
    return buildBatchReviewDraft(texts.map(text => ({ original_text: text, anonymized_text: text,
      allowOrganizationReview: true, ambiguities: [{ ambiguity_id: 'person:v1:000001', type: 'person_prose_ambiguous',
        replacement_kind: 'PERSON', original_start: 0, original_end: 12, anonymized_start: 0, anonymized_end: 12 }] })),
    { allowDefer: true, privateSourceLabels: ['Demo-Eins.pdf', 'Demo-Zwei.docx'] }).draft;
  }
  const { buildContactBatch } = require('../../plugins/data-secure/server/gateway/ocr-contact-batch');
  const { encodePng } = require('../../plugins/data-secure/server/images/png');
  const png = encodePng({ width: 4, height: 3, rgba: Buffer.alloc(48, 240) }).toString('base64');
  return buildContactBatch(Array.from({ length: 32 }, (_, index) => {
    const email = `qa${String(index).padStart(2, '0')}@quality.example.invalid`, phone = `+49 30 555 10${String(index).padStart(2, '0')}`;
    const original_text = `SYNTHETISCHE VORSCHAU\nE-Mail: ${email}\nTelefon: ${phone}`;
    return { source_label: `Demo/quality-${String(index + 1).padStart(3, '0')}-scan.pdf`, input: {
      original_text, source_type: 'pdf', processing_mode: 'markdown-only', contacts: [
        { start: original_text.indexOf(email), end: original_text.indexOf(email) + email.length, line: 2, page: 1, kind: 'email' },
        { start: original_text.indexOf(phone), end: original_text.length, line: 3, page: 1, kind: 'phone' }
      ].map(contact => ({ ...contact, image: { schema: 'datasecure-ocr-contact-image/1', source_width: 4, source_height: 3,
        x: 0, y: 0, width: 4, height: 3, png_base64: png } })) } };
  })).draft;
}

function bridge(draft) {
  // External script: source text never becomes inline HTML/script markup.
  return `(() => { const draft = ${JSON.stringify(draft)};
    const bytes = new TextEncoder().encode(JSON.stringify(draft));
    const data = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    window.previewSubmissions = []; let ended = false, reviewed = false;
    window.__TAURI__ = { core: { invoke: async (command, args) => {
      if (command === 'get_review_session') return ended ? { ready: false, run_complete: true } : { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 };
      if (command === 'get_review_chunk') return { review_id: 'a'.repeat(32), index: 0, data };
      if (command === 'submit_review') { window.previewSubmissions.push(args.answer); ended = true; reviewed = args.answer?.action === 'reviewed'; return { accepted: true }; }
      if (command === 'close_review_window') { if (window.parent !== window) window.parent.dispatchEvent(new CustomEvent('preview-review-closed', { detail: { reviewed } })); return { ok: true }; }
      throw Error('Unsupported development-only command');
    } } };
  })();`;
}

export async function startReviewPreview({ port = 0, host = '127.0.0.1', draft, conceptPath, workspace = false } = {}) {
  if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 0 || port > 65535) throw Error('LOOPBACK_ONLY');
  const routes = new Map();
  for (const name of ['review.html', 'review.css', 'review.js', 'workflow-presentation.js', 'review-workspace.css', 'design-tokens.css',
    ...(workspace ? ['workspace.html', 'workspace.css', 'workspace.js', 'document-review.js'] : [])]) {
    routes.set(`/${name}`, { body: readBoundFile(path.join(frontend, name), { maximum: 20 * 1024 * 1024, checkCtime: true }), type: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
  }
  routes.set('/fonts/InterVariable.woff2', { body: readBoundFile(path.join(frontend, 'fonts/InterVariable.woff2'), { maximum: 20 * 1024 * 1024, checkCtime: true }), type: 'font/woff2' });
  if (workspace) {
    routes.set('/preview-workspace.js', { body: workspacePreviewBridge(), type: 'text/javascript' });
    const route = routes.get('/workspace.html');
    route.body = route.body.toString('utf8').replace('<script src="workspace.js" defer>', '<script src="preview-workspace.js"></script><script src="workspace.js" defer>')
      .replace('<main class="workspace">', '<main class="workspace"><p class="preview-banner" role="note">ENTWICKLUNGSVORSCHAU · erfundene Daten · simulierte Verarbeitung · keine Produktabnahme</p>');
  }
  const original = routes.get('/review.html').body.toString('utf8');
  for (const kind of ['ocr', 'entities']) {
    routes.set(`/preview-${kind}.js`, { body: bridge(draft || syntheticDraft(kind)), type: 'text/javascript' });
  }
  if (conceptPath) {
    const resolved = path.resolve(conceptPath);
    let body;
    try {
      if (path.extname(resolved).toLowerCase() !== '.html') throw Error('INVALID_CONCEPT_FILE');
      // Bind the held file and its ancestors. Never reopen a checked pathname;
      // links, replacement or in-place mutation fail before exposing bytes.
      body = readBoundFile(resolved, { maximum: 20 * 1024 * 1024, checkCtime: true });
    } catch { throw Error('INVALID_CONCEPT_FILE'); }
    routes.set('/concept.html', { body, type: 'text/html', concept: true });
  }
  const server = http.createServer((req, res) => {
    const address = server.address(), expectedHost = `127.0.0.1:${address.port}`;
    const end = (status, message) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(message); };
    if (req.headers.host !== expectedHost || (req.headers.origin && req.headers.origin !== `http://${expectedHost}`)) return end(403, 'Forbidden');
    if (!['GET', 'HEAD'].includes(req.method)) return end(405, 'Method not allowed');
    if (!req.url?.startsWith('/') || /(?:%2e|%2f|%5c|\\|\/\.\.?\/)/iu.test(req.url)) return end(404, 'Not found');
    const url = new URL(req.url, `http://${expectedHost}`);
    if (url.pathname === '/') { res.writeHead(302, { Location: '/review.html?demo=ocr', 'Cache-Control': 'no-store' }); return res.end(); }
    let route = routes.get(url.pathname);
    if (!route) return end(404, 'Not found');
    if (url.pathname === '/review.html') {
      const kind = url.searchParams.get('demo') === 'entities' ? 'entities' : 'ocr';
      const banner = '<p class="preview-banner" role="note">ENTWICKLUNGSVORSCHAU · erfundene Daten · simulierte Verarbeitung · Farbausschnitt ist kein OCR-Nachweis</p>';
      route = { ...route, body: original.replace('<script src="review.js" defer>', `<script src="preview-${kind}.js"></script><script src="review.js" defer>`).replace('<main>', `<main>${banner}`) };
    }
    const policy = route.concept
      ? "default-src 'none'; script-src 'self' blob: 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data: blob:; img-src data: blob:; connect-src 'none'; frame-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      : "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src data:; frame-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
    res.writeHead(200, { 'Content-Type': `${route.type}; charset=utf-8`, 'Content-Security-Policy': policy,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : route.body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }) };
}
