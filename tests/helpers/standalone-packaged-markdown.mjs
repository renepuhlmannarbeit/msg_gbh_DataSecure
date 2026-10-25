// Exact packaged sidecar/worker workflow, not native Tauri interaction.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { office, image, pdf, text } from './conversion-fixtures.mjs';
const require = createRequire(import.meta.url);
const { decodePng } = require('../../plugins/data-secure/server/images/png');
const { encodeBmp } = require('../../plugins/data-secure/server/images/bmp');
const MarkdownIt = require('markdown-it');
const renderer = new MarkdownIt();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const options = enabled => ({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: enabled, imageOcr: enabled });

export async function waitForPackagedMarkdownFeedback({ send, batchId, selectedCount, deadline, enabled,
  now = Date.now, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  let row, targeted = false;
  const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 200 ? value : null;
  const diagnostic = () => ({ targeted_reader: targeted, batch_matches: row?.batch_id === batchId,
    status: ['preparing', 'processing', 'paused', 'review_required', 'stopped', 'results_available',
      'export_pending', 'export_abandoned', 'completed_without_results', 'failed'].includes(row?.status) ? row.status : null,
    processing_mode: ['markdown-only', 'markdown-and-anonymize'].includes(row?.processing_mode) ? row.processing_mode : null,
    selected_count: count(row?.selected_count), result_count: count(row?.result_count), failed_count: count(row?.failed_count),
    feedback_present: Boolean(row && Object.hasOwn(row, 'conversion_feedback')),
    feedback_schema_valid: row?.conversion_feedback?.schema === 'datasecure-conversion-feedback/1',
    feedback_complete: row?.conversion_feedback?.complete === true });
  const timeout = () => new assert.AssertionError({ message: `MD_OPTIONS_WORKFLOW_TIMEOUT:${JSON.stringify(diagnostic())}` });
  const withinBudget = async operation => {
    const remaining = deadline - now();
    if (remaining <= 0) throw timeout();
    let timer;
    try {
      const result = await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeout()), remaining);
      })]);
      if (now() >= deadline) throw timeout();
      return result;
    } finally { clearTimeout(timer); }
  };
  for (;;) {
    // A compact terminal summary can outlive (or temporarily lack) the current
    // journal. After observing it, use the existing exact batch reader on the
    // next ordinary poll; no recovery or extra post-deadline RPC is allowed.
    row = (await withinBudget(() => send('get_run_history', targeted ? { batch_id: batchId } : {})))
      .entries.find(item => item.batch_id === batchId);
    if (row) {
      assert.equal(row.processing_mode, 'markdown-only');
      assert.equal(row.selected_count, selectedCount);
      const feedback = row.conversion_feedback;
      if (Object.hasOwn(row, 'conversion_feedback')) {
        assert.equal(feedback?.schema, 'datasecure-conversion-feedback/1');
        assert.equal(feedback.ocr_enabled, enabled);
        assert.equal(feedback.selected_count, selectedCount);
        for (const key of ['result_count', 'not_converted_count', 'ocr_omitted_count', 'error_count',
          'content_notice_count', 'pending_count']) assert.notEqual(count(feedback[key]), null, key);
        assert.equal(typeof feedback.complete, 'boolean');
        assert.equal(feedback.result_count + feedback.not_converted_count + feedback.pending_count, selectedCount);
        assert.equal(feedback.ocr_omitted_count + feedback.error_count, feedback.not_converted_count);
        assert.ok(feedback.content_notice_count <= feedback.result_count);
        if (feedback.complete) assert.equal(feedback.pending_count, 0);
      }
      if (!['preparing', 'processing'].includes(row.status) && row.result_count + row.failed_count === selectedCount) {
        if (feedback?.complete === true && feedback.pending_count === 0) {
          assert.equal(feedback.result_count, row.result_count);
          assert.equal(feedback.not_converted_count, row.failed_count);
          return row;
        }
        targeted = true;
      }
    }
    if (now() >= deadline) throw timeout();
    await sleep(Math.min(150, deadline - now()));
  }
}

export async function runPackagedMarkdownScenario({ request: initialRequest, restart, sourceDirectory }) {
  let request = initialRequest, sequence = 0xb000;
  const send = async (action, fields = {}) => {
    const value = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action, ...fields });
    assert.equal(value.ok, true, `${action}: ${JSON.stringify(value)}`);
    return value.result;
  };
  const raster = image(), png = raster.toBuffer('image/png'), jpeg = raster.toBuffer('image/jpeg');
  const decoded = decodePng(png);
  const bmp = encodeBmp(decoded); decoded.rgba.fill(0); raster.width = 1; raster.height = 1;
  const files = new Map([
    ['Original Max.txt', Buffer.from(text)],
    ['Original Max.md', Buffer.from(`${text}\n\n| Begriff | Wert |\n| --- | --- |\n| Preis | 42 € |\n`)],
    ['Original Max.csv', Buffer.from('Name,Betrag,Zeichen\r\nMax Mustermann,00123,"Ä § € ± →"\r\n')],
    ...['docx', 'xlsx', 'pptx'].map(type => [`Original Max.${type}`, office(type)]),
    ['Text.pdf', pdf([{ text }], '', { info: true })],
    ['Bild.png', png], ['Bild.jpeg', jpeg], ['Bild.bmp', bmp],
    ['Scan.pdf', pdf([{ image: jpeg }])],
    ['Gemischt.pdf', pdf([{ image: jpeg, text: 'NATIVER KOPF' }])]
  ]);
  const directory = path.join(sourceDirectory, 'Gebundener-Markdownweg'); fs.mkdirSync(directory);
  const sources = [...files].map(([name, bytes]) => {
    const file = path.join(directory, name); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file;
  });
  for (const enabled of [false, true]) {
    const selection = await send('admit_selected_sources', { source_kind: 'files', source_paths: sources, source_catalogue: true });
    const started = await send('start_admitted_batch', { processing_mode: 'markdown-only', document_review: true,
      content_options: options(enabled), source_ids: selection.ui_context.source_catalogue.map(item => item.source_id),
      catalogue_revision: selection.ui_context.catalogue_revision });
    const batchId = started.batch_id, deadline = Date.now() + 180000;
    const row = await waitForPackagedMarkdownFeedback({ send, batchId, selectedCount: files.size, deadline, enabled });
    const expectedFailures = enabled ? 0 : 4; // standalone rasters + pure scan
    assert.equal(row.processing_mode, 'markdown-only');
    const failures = await send('get_run_failures', { batch_id: batchId });
    assert.equal(row.failed_count, expectedFailures, JSON.stringify(failures.files.map(item => ({ name: item.name, code: item.reason_code }))));
    assert.equal(row.result_count, files.size - expectedFailures);
    assert.equal(row.conversion_feedback?.schema, 'datasecure-conversion-feedback/1');
    assert.equal(row.conversion_feedback.ocr_omitted_count, expectedFailures);
    assert.equal(row.conversion_feedback.error_count, 0);
    assert.deepEqual(failures.files.map(item => path.basename(item.name)).sort(), enabled ? [] : ['Bild.bmp', 'Bild.jpeg', 'Bild.png', 'Scan.pdf']);
    if (!enabled) for (const item of failures.files) assert.ok(['IMAGE_OCR_REQUIRED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY'].includes(item.reason_code));
    if (!enabled) for (const item of failures.files) assert.equal(item.classification, 'ocr_omission');
    assert.ok(Array.isArray(failures.content_notices));
    // Technical completion may precede the worker's result-directory copy.
    // Observe readiness; never infer that counts alone prove an exported folder.
    let target;
    const exportDeadline = Date.now() + 20000;
    for (;;) {
      const response = await request({ schema: 'datasecure-standalone-private-ipc/1',
        request_id: (++sequence).toString(16).padStart(16, '0'), action: 'resolve_history_results', batch_id: batchId });
      if (response.ok) { target = response.result; break; }
      assert.ok(['STANDALONE_RESULTS_MISSING', 'RESULT_PUBLICATION_PENDING'].includes(response.error_code),
        `initial readiness never retries a conflict: ${JSON.stringify(response)}`);
      if (Date.now() >= exportDeadline) {
        const status = await send('get_public_state'), context = await send('get_ui_context');
        throw Error(`MD_EXPORT_NOT_READY:${JSON.stringify({ row, status, context })}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const names = fs.readdirSync(target.local_path).filter(name => name.endsWith('.md')).sort();
    assert.equal(names.length, files.size - expectedFailures);
    assert.ok(names.includes('Original Max.md'), 'real original basename is retained');
    assert.ok(!names.some(name => /anonymisiert|Dokument-\d/u.test(name)));
    assert.ok(!fs.readdirSync(target.local_path).some(name => /Zuordnung|Identitaeten/u.test(name)));
    const documents = await send('get_document_reviews', { batch_id: batchId });
    assert.equal(documents.processing_mode, 'markdown-only'); assert.equal(documents.documents.length, names.length);
    assert.equal(documents.conversion_feedback.ocr_enabled, enabled);
    assert.equal(documents.conversion_feedback.ocr_omitted_count, expectedFailures);
    assert.equal(documents.conversion_feedback.error_count, 0);
    assert.equal((documents.not_processed_documents || []).filter(row => row.classification === 'ocr_omission').length, expectedFailures);
    for (const doc of documents.documents) {
      const chunk = await send('get_document_review_chunk', { batch_id: batchId, document_id: doc.document_id,
        revision: doc.revision, chunk_index: 0 });
      assert.equal(chunk.chunks, 1, 'tiny independent fixtures have one full review chunk');
      const value = chunk.markdown;
      assert.equal(sha(Buffer.from(value)), doc.output_sha256);
      assert.doesNotMatch(value, /Zusätzlicher Bildtext|OCR-Kontaktwerte wurden|data:image|!\[|<img|Private title/u);
      assert.doesNotMatch(value, /\[(?:PERSON|EMAIL|UNTERNEHMEN)_/u);
      if (path.basename(doc.name) === 'Gemischt.pdf') assert.match(value, /NATIVER KOPF/u);
      else assert.match(renderer.render(value), /Max Mustermann/u);
      if (doc.name.endsWith('.csv')) {
        const rendered = renderer.render(value);
        for (const literal of ['00123', 'Ä § € ± →', 'Name', 'Betrag']) assert.ok(rendered.includes(literal));
      }
      assert.equal(doc.approved, false, 'conversion is not a forged human approval');
      assert.equal(doc.text_modified, false, 'no generated Markdown file is labelled as manually corrected');
    }
    const original = documents.documents.find(doc => path.basename(doc.name) === 'Original Max.txt');
    const raw = await send('get_document_review_chunk', { batch_id: batchId, document_id: original.document_id,
      revision: original.revision, chunk_index: 0 });
    const edited = `${raw.markdown}\n\nManuell korrigiert: 007 – Ä § €`;
    const corrected = await send('decide_document_review', { batch_id: batchId, document_id: original.document_id,
      decision: { action: 'correct', operation_id: crypto.randomBytes(16).toString('hex'), output_sha256: original.output_sha256,
        revision: original.revision, ranges: [{ start: 0, end: raw.markdown.length, replacement: edited }] } });
    assert.equal(corrected.approved, false); assert.equal(corrected.output_sha256, sha(Buffer.from(edited)));
    assert.equal(corrected.text_modified, true, 'the correction is visible as a saved private text change');
    assert.equal(fs.readFileSync(path.join(target.local_path, 'Original Max.md'), 'utf8'), raw.markdown,
      'saving a correction never silently rewrites the generated result');
    const previewOperation = crypto.randomBytes(16).toString('hex');
    const copyPreview = await send('preview_document_export', { batch_id: batchId, operation_id: previewOperation,
      selection: [{ document_id: original.document_id, output_sha256: corrected.output_sha256, revision: corrected.revision }] });
    assert.deepEqual(copyPreview.files, [{ name: 'Original Max.md', sha256: corrected.output_sha256 }]);
    const afterPreview = await send('get_document_reviews', { batch_id: batchId });
    assert.equal(afterPreview.documents.find(doc => doc.document_id === original.document_id).approved, false);
    assert.equal((afterPreview.pending_exports || []).some(row => row.operation_id === previewOperation), false);
    const rejectedCopy = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action: 'export_approved_documents', batch_id: batchId,
      operation_id: previewOperation, selection: [{ document_id: original.document_id,
        output_sha256: corrected.output_sha256, revision: corrected.revision }] });
    assert.equal(rejectedCopy.ok, false); assert.equal(rejectedCopy.error_code, 'DOCUMENT_REVIEW_UNAPPROVED');
    const approved = await send('decide_document_review', { batch_id: batchId, document_id: original.document_id,
      decision: { action: 'approve', operation_id: crypto.randomBytes(16).toString('hex'), output_sha256: corrected.output_sha256,
        revision: corrected.revision, ranges: [] } });
    assert.equal(approved.approved, true);
    assert.equal(approved.text_modified, true, 'copy consent does not erase the saved-correction state');
    const operationId = crypto.randomBytes(16).toString('hex');
    const preview = await send('preview_document_export', { batch_id: batchId, operation_id: operationId,
      selection: [{ document_id: original.document_id, output_sha256: approved.output_sha256, revision: approved.revision }] });
    assert.ok(JSON.stringify(preview).includes('Original Max.md'), 'manual correction export retains original basename');
    const exportSelection = [{ document_id: original.document_id, output_sha256: approved.output_sha256, revision: approved.revision }];
    const exported = await send('export_approved_documents', { batch_id: batchId, operation_id: operationId,
      selection: exportSelection });
    assert.equal(exported.processing_mode, 'markdown-only'); assert.equal(exported.anonymized, false);
    assert.equal(exported.exported_count, 1);
    const opened = await send('resolve_document_export', { batch_id: batchId, operation_id: operationId });
    assert.deepEqual(fs.readdirSync(opened.local_path), ['Original Max.md']);
    assert.equal(fs.readFileSync(path.join(opened.local_path, 'Original Max.md'), 'utf8'), edited,
      'exported file is exactly the human-corrected and approved revision, not reformatted afterwards');
    request = await restart();
    const resumed = await send('get_document_review_chunk', { batch_id: batchId, document_id: original.document_id,
      revision: approved.revision, chunk_index: 0 });
    assert.equal(resumed.markdown, edited, 'fresh process reopens exactly the human-corrected Markdown');
    const reopened = await send('get_document_reviews', { batch_id: batchId });
    assert.equal(reopened.documents.find(doc => doc.document_id === original.document_id).text_modified, true,
      'saved-correction label survives a fresh sidecar process');
    for (const [index, source] of sources.entries()) assert.deepEqual(fs.readFileSync(source), [...files.values()][index]);
    process.stdout.write(`PACKAGED CONTENT MARKDOWN PASS: OCR=${enabled}; ${names.length} real results; ${expectedFailures} named stops; original names; correction+approval+exact export; fresh-process exact bytes\n`);
  }
  return request;
}
