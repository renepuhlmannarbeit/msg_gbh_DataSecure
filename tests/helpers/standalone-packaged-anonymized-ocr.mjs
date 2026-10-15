// Real packaged sidecar + worker against only synthetic raster and scan sources.
// This is an integration test, not a native Tauri/WebView interaction claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { image, pdf } from './conversion-fixtures.mjs';

const require = createRequire(import.meta.url);
const { decodePng } = require('../../plugins/data-secure/server/images/png');
const { encodeBmp } = require('../../plugins/data-secure/server/images/bmp');

export async function runPackagedAnonymizedOcrScenario({ request, sourceDirectory }) {
  let sequence = 0xe000;
  const send = async (action, fields = {}) => {
    const response = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action, ...fields });
    assert.equal(response.ok, true, `${action}: ${JSON.stringify(response)}`);
    return response.result;
  };
  const raster = image();
  const png = raster.toBuffer('image/png');
  const jpeg = raster.toBuffer('image/jpeg');
  const decoded = decodePng(png);
  const bmp = encodeBmp(decoded);
  decoded.rgba.fill(0); raster.width = 1; raster.height = 1;
  const fixtures = new Map([
    ['Bild.png', png], ['Bild.jpeg', jpeg], ['Bild.bmp', bmp], ['Scan.pdf', pdf([{ image: jpeg }])]
  ]);
  const directory = path.join(sourceDirectory, 'Paketgebundene-Anonymisierte-OCR-Formate');
  fs.mkdirSync(directory);
  const sources = [...fixtures].map(([name, bytes]) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    return file;
  });
  const selection = await send('admit_selected_sources', {
    source_kind: 'files', source_paths: sources, source_catalogue: true
  });
  assert.equal(selection.ui_context.source_catalogue.length, fixtures.size);
  const started = await send('start_admitted_batch', {
    processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral', document_review: true,
    content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1',
      scanOcr: true, imageOcr: true },
    source_ids: selection.ui_context.source_catalogue.map(item => item.source_id),
    catalogue_revision: selection.ui_context.catalogue_revision
  });
  const deadline = Date.now() + 180000;
  let row;
  for (;;) {
    row = (await send('get_run_history')).entries.find(item => item.batch_id === started.batch_id);
    if (row?.status === 'review_required' || (row && !['preparing', 'processing'].includes(row.status) &&
        row.result_count + row.failed_count === fixtures.size)) break;
    assert.ok(Date.now() < deadline, `PACKAGED_ANON_OCR_TIMEOUT:${JSON.stringify(row)}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (row.status === 'review_required') {
    assert.ok(row.result_count < fixtures.size, 'unreviewed OCR input must not be presented as completed');
    await send('continue_history_batch', { batch_id: started.batch_id });
    const handled = new Set();
    for (;;) {
      const session = await send('get_review_session');
      if (session.run_complete) break;
      assert.ok(Date.now() < deadline, 'PACKAGED_ANON_OCR_REVIEW_TIMEOUT');
      if (!session.ready || handled.has(session.review_id)) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      const parts = [];
      for (let index = 0; index < session.chunk_count; index++) {
        const part = await send('get_review_chunk', { review_id: session.review_id, chunk_index: index });
        parts.push(Buffer.from(part.data, 'base64'));
      }
      const draft = JSON.parse(Buffer.concat(parts).toString('utf8'));
      assert.equal(draft.schema, 'data-secure-text-review/3');
      const decisions = draft.ambiguities.map(candidate => {
        const value = draft.original_text.slice(candidate.original_start, candidate.original_end);
        const decision = /Mustermann/iu.test(value) ? 'redact' :
          /Nordstern/iu.test(value) ? 'redact_organization' : 'keep';
        return { ambiguity_id: candidate.ambiguity_id, decision };
      });
      handled.add(session.review_id);
      await send('submit_review', { review_id: session.review_id,
        answer: { action: 'reviewed', redactions: [], decisions } });
    }
    for (;;) {
      row = (await send('get_run_history')).entries.find(item => item.batch_id === started.batch_id);
      if (row && row.result_count + row.failed_count === fixtures.size && !row.resumable) break;
      assert.ok(Date.now() < deadline, `PACKAGED_ANON_OCR_EXPORT_TIMEOUT:${JSON.stringify(row)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  const failures = await send('get_run_failures', { batch_id: started.batch_id });
  assert.equal(row.failed_count, 0, JSON.stringify(failures.files));
  assert.equal(row.result_count, fixtures.size);
  assert.deepEqual(failures.files, [], 'all raster and scan sources must have a result, not a silent omission');
  assert.ok(!row.resumable, 'a fully converted OCR batch must not retain an unfinished entity review');
  let output;
  for (;;) {
    const response = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action: 'resolve_history_results',
      batch_id: started.batch_id });
    if (response.ok) { output = response.result; break; }
    assert.equal(response.error_code, 'STANDALONE_RESULTS_MISSING');
    assert.ok(Date.now() < deadline, `PACKAGED_ANON_OCR_VISIBLE_EXPORT_TIMEOUT:${JSON.stringify(row)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const names = fs.readdirSync(output.local_path).filter(name => name.endsWith('.md'));
  assert.equal(names.length, fixtures.size);
  assert.ok(names.every(name => !/Bild|Scan|Mustermann|Nordstern/iu.test(name)),
    'anonymized output names must not disclose source names');
  for (const name of names) {
    const value = fs.readFileSync(path.join(output.local_path, name), 'utf8');
    assert.doesNotMatch(value, /Max Mustermann|Nordstern GmbH|data:image|base64,|!\[/iu,
      'anonymized Markdown must not retain synthetic identities or embedded image artifacts');
    assert.match(value, /Projektmanager|Software Tester/iu,
      'a factual OCR line must survive the anonymization workflow');
  }
  const documents = await send('get_document_reviews', { batch_id: started.batch_id });
  assert.equal(documents.processing_mode, 'markdown-and-anonymize');
  assert.equal(documents.documents.length, fixtures.size);
  assert.ok(documents.documents.every(document => document.approved === false),
    'technical conversion cannot fabricate human anonymity approval');
  for (const [index, source] of sources.entries()) assert.deepEqual(fs.readFileSync(source), [...fixtures.values()][index]);
  process.stdout.write('PACKAGED CONTENT ANONYMIZATION OCR FORMATS PASS (PNG/JPEG/BMP/scan PDF; neutral names; no automatic approval)\n');
}
