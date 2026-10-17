// Production framed IPC, independent worker, real OCR and immutable review store.
// Synthetic inputs only; this does not exercise Tauri or native file pickers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { packagedOcrFixtures } from './standalone-packaged-ocr-review.mjs';

export async function runPackagedFastReviewScenario({ request: initialRequest, restart, sourceDirectory }) {
  let request = initialRequest, sequence = 0xf000;
  const send = async (action, fields = {}) => {
    const response = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action, ...fields });
    assert.equal(response.ok, true, `${action}: ${JSON.stringify(response)}`);
    return response.result;
  };
  const directory = path.join(sourceDirectory, 'Schnellweg'); fs.mkdirSync(directory);
  const inputs = new Map([...packagedOcrFixtures(),
    ['mehrdeutig.md', Buffer.from('CAPGEMINI INVENT\nName: Max Mustermann\nE-Mail: max@example.invalid\nTechnologie: Java\n')],
    ['defekt.csv', Buffer.from('Name,Wert\nBeispiel,"nicht abgeschlossen\n')]]);
  const sources = [...inputs].map(([name, bytes]) => { const file = path.join(directory, name); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file; });
  const admission = await send('admit_selected_sources', { source_kind: 'files', source_paths: sources, source_catalogue: true });
  const started = await send('start_admitted_batch', { processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral',
    document_review: true, review_policy: 'automatic-conservative', content_options: {
      schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true },
    source_ids: admission.ui_context.source_catalogue.map(row => row.source_id), catalogue_revision: admission.ui_context.catalogue_revision });
  const batchId = started.batch_id, deadline = Date.now() + 180000;
  let entry;
  for (;;) {
    entry = (await send('get_run_history')).entries.find(row => row.batch_id === batchId);
    assert.notEqual(entry?.status, 'review_required', 'Fastweg must not defer into a human review');
    // Terminal item counters can precede the worker's final mapping/export
    // and lease release. Wait for the actual product completion state.
    if (entry && entry.result_count + entry.failed_count === inputs.size && !entry.resumable &&
        ['results_available', 'completed_without_results'].includes(entry.status)) {
      const current = await send('get_public_state');
      if (current.batch_id === batchId && ['results_available', 'completed_without_results'].includes(current.state)) break;
    }
    assert.ok(Date.now() < deadline, `FAST_REVIEW_TIMEOUT:${JSON.stringify(entry)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const failures = await send('get_run_failures', { batch_id: batchId });
  assert.equal(entry.result_count, 3, JSON.stringify(failures)); assert.equal(entry.failed_count, 1);
  assert.equal(entry.review_policy, 'automatic-conservative');
  assert.equal(entry.content_notice_count, 2, 'successful OCR retains source hints in completed history');
  assert.equal(entry.content_notice_breakdown_complete, true);
  const status = await send('get_public_state');
  assert.equal(status.batch_id, batchId); assert.equal(status.review_policy, 'automatic-conservative');
  assert.equal(status.content_notice_count, 2); assert.equal(status.content_notice_breakdown_complete, true);
  assert.equal(status.warning_count, 2);
  assert.equal(failures.content_notice_count, 2); assert.equal(failures.content_notice_breakdown_complete, true);
  assert.ok(failures.content_notices.every(row => row.reason_codes.includes('OCR_NOT_VERIFIED')));
  assert.equal(failures.files[0].name, 'defekt.csv'); assert.equal(failures.files[0].reason_code, 'CSV_QUOTE_INVALID');
  let listed = await send('get_document_reviews', { batch_id: batchId });
  assert.equal(listed.review_policy, 'automatic-conservative'); assert.equal(listed.documents.length, 3);
  assert.equal(listed.content_notice_count, 2); assert.equal(listed.content_notice_breakdown_complete, true);
  assert.ok(listed.documents.every(row => row.approved && row.revision === 0 && row.approval_basis === 'automatic'));
  assert.deepEqual(listed.export_receipts, [], 'automatic document approval never creates a KI-copy');
  for (const row of listed.documents) {
    let text = '', original = '';
    for (let index = 0; index < row.chunks; index++) {
      const chunk = await send('get_document_review_chunk', { batch_id: batchId, document_id: row.document_id, revision: 0, chunk_index: index });
      text += chunk.markdown; original += chunk.original_text;
    }
    assert.doesNotMatch(text, /Mustermann|CAPGEMINI INVENT|@|987654321/iu);
    assert.match(original, /Mustermann/u, 'comparison retains actual source, not an already redacted substitute');
    if (row.name.endsWith('.png')) assert.match(text, /\[(?:EMAIL|PHONE)_REDACTED\]/u, 'real OCR contact corridor is masked');
  }
  request = await restart();
  const recovered = await send('get_document_reviews', { batch_id: batchId });
  assert.deepEqual(recovered.documents, listed.documents, 'fresh process reconstructs exact automatic basis');
  assert.equal(recovered.content_notice_count, 2, 'source hints survive a fresh Core independently of approval');
  const row = recovered.documents[0];
  await send('decide_document_review', { batch_id: batchId, document_id: row.document_id, decision: {
    action: 'revoke', operation_id: crypto.randomBytes(16).toString('hex'), revision: 0, output_sha256: row.output_sha256, ranges: [] } });
  request = await restart();
  listed = await send('get_document_reviews', { batch_id: batchId });
  const revoked = listed.documents.find(value => value.document_id === row.document_id);
  assert.equal(revoked.approved, false); assert.equal(revoked.revision, 1); assert.equal(revoked.approval_basis, null);
  const summary = await send('get_document_review_history_summary', { batch_id: batchId });
  assert.equal(summary.automatically_approved_count, 2); assert.equal(summary.recorded_export_count, 0);
  const approved = listed.documents.find(value => value.approved), operation = crypto.randomBytes(16).toString('hex');
  const selection = [{ document_id: approved.document_id, revision: approved.revision, output_sha256: approved.output_sha256 }];
  const preview = await send('preview_document_export', { batch_id: batchId, operation_id: operation, selection });
  assert.equal(preview.files.length, 1); assert.match(preview.files[0].name, /^Dokument_[0-9]+\.md$/u);
  assert.equal((await send('get_document_review_history_summary', { batch_id: batchId })).recorded_export_count, 0,
    'preview never creates a copy');
  const copied = await send('export_approved_documents', { batch_id: batchId, operation_id: operation, selection });
  assert.equal(copied.exported_count, 1);
  const acknowledged = await send('export_approved_documents', { batch_id: batchId, operation_id: operation, selection, acknowledge: true });
  assert.equal(acknowledged.exported_count, 1);
  const target = await send('resolve_document_export', { batch_id: batchId, operation_id: operation });
  const names = fs.readdirSync(target.local_path); assert.deepEqual(names, [preview.files[0].name]);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(target.local_path, names[0]))).digest('hex'), approved.output_sha256);
  assert.equal((await send('get_document_reviews', { batch_id: batchId })).documents.find(value => value.document_id === revoked.document_id).approved, false);
  for (const source of sources) assert.deepEqual(fs.readFileSync(source), inputs.get(path.basename(source)));
  process.stdout.write('FAST REVIEW IPC PASS (real OCR + ambiguity + failed CSV; automatic provenance; restart; revoke; KI copy only after explicit preview/export/ACK)\n');
  return request;
}
