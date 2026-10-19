// Synthetic pixels and exact, independent expectations. This is never a
// production OCR dictionary or a substitute for operator-driven native UAT.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { image } from './conversion-fixtures.mjs';
const require = createRequire(import.meta.url);
const { decodePng } = require('../../plugins/data-secure/server/images/png');
const { validateContactImage } = require('../../plugins/data-secure/server/core/ocr-contact-image');
const MarkdownIt = require('markdown-it');
const markdownRenderer = new MarkdownIt('commonmark');
const renderedLine = line => markdownRenderer.parseInline(line, {})[0].children.map(token => token.content).join('');

function assertOriginalContactPixels(draft, bytes) {
  const original = decodePng(bytes);
  try {
    for (const item of draft.ambiguities) {
      assert.ok(item.image, 'PACKAGED_CONTACT_ORIGINAL_CROP_MISSING');
      validateContactImage(item.image);
      const { x, y, width, height, source_width, source_height } = item.image;
      assert.equal(source_width, original.width); assert.equal(source_height, original.height);
      const crop = decodePng(Buffer.from(item.image.png_base64, 'base64'));
      try {
        for (let row = 0; row < height; row++) assert.deepEqual(
          crop.rgba.subarray(row * width * 4, (row + 1) * width * 4),
          original.rgba.subarray(((y + row) * original.width + x) * 4, ((y + row) * original.width + x + width) * 4),
          'PACKAGED_CONTACT_CROP_MUST_RETAIN_EXACT_SOURCE_PIXELS');
      } finally { crop.rgba.fill(0); }
    }
  } finally { original.rgba.fill(0); }
}

export const contactReferences = Object.freeze([
  { name: '01-kontakte.png', email: 'alpha@native.example.invalid', corrected: 'alpha-corrected@native.example.invalid' },
  { name: '02-kontakte.png', email: 'beta@native.example.invalid', corrected: 'beta-corrected@native.example.invalid' }
]);
export const contactPhone = '+49 (040) 987654321';
export const correctedPhone = '+49 (040) 987654322';
export const correctionSentinel = 'SYNTHETISCHER KORREKTURTEST';

export function assertPackagedMarkdownOcrOutputs(texts, contentOnly = false) {
  assert.equal(texts.length, 2);
  const confirmation = '> OCR-Kontaktwerte wurden lokal bestätigt oder korrigiert. Übrige OCR-Inhalte bleiben ungeprüft. Nicht anonymisiert: enthält Originalinhalte.';
  const contactNotice = /^> Hinweis: Grafiken und ihre visuelle Anordnung sind nicht enthalten\. Text aus Bildern wurde übernommen; Lesefehler und Auslassungen sind möglich\. Erkannte Kontaktwerte bitte mit dem Original vergleichen\.(?: Die Nachprüfung lieferte abweichende Lesarten\.)?(?: Einige Wörter wurden unsicher erkannt\.)?(?: Die Erkennungssicherheit ist teilweise unbekannt\.)?(?: Nicht lesbare Symbolzeichen wurden ausgelassen\.)?$/u;
  const used = new Set();
  for (const expected of contactReferences) {
    const indexes = texts.flatMap((value, index) => value.split('\n').some(line =>
      renderedLine(line.trimEnd()) === `E-Mail: ${expected.corrected}`) ? [index] : []);
    assert.equal(indexes.length, 1, 'CORRECTED_MARKDOWN_CONTACT_DOCUMENT_MISSING');
    assert.ok(!used.has(indexes[0]), 'MARKDOWN_CONTACT_DOCUMENTS_MERGED'); used.add(indexes[0]);
    const lines = texts[indexes[0]].replaceAll('\r\n', '\n').split('\n').map(line => line.trimEnd()).filter(line => line.trim());
    assert.equal(lines.filter(line => line === confirmation).length, contentOnly ? 0 : 1);
    assert.equal(lines.filter(line => contactNotice.test(line)).length, contentOnly ? 0 : 1);
    const body = lines.filter(line => line !== confirmation && !contactNotice.test(line)).map(renderedLine).join('\n');
    assert.equal(body, `Name: Max Mustermann\nE-Mail: ${expected.corrected}\nTelefon: ${correctedPhone}\nJava bleibt.\n${correctionSentinel}`,
      'MARKDOWN_COMPLETE_DOCUMENT_BODY_CHANGED');
  }
  assert.equal(used.size, texts.length, 'MARKDOWN_CONTACT_DOCUMENT_NOT_VERIFIED');
}

export function packagedOcrFixtures() {
  return new Map(contactReferences.map(({ name, email }) => {
    const canvas = image(true), context = canvas.getContext('2d');
    context.font = '40px Arial';
    ['Name: Max Mustermann', `E-Mail: ${email}`, `Telefon: ${contactPhone}`, 'Java bleibt.', correctionSentinel]
      .forEach((line, index) => context.fillText(line, 60, 80 + index * 100));
    try { return [name, canvas.toBuffer('image/png')]; }
    finally { canvas.width = 1; canvas.height = 1; }
  }));
}

export async function runPackagedOcrSkipScenario({ request, sourceDirectory }) {
  let sequence = 0xb000;
  const send = async (action, fields = {}) => {
    const response = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action, ...fields });
    assert.equal(response.ok, true, `${action}: ${JSON.stringify(response)}`);
    return response.result;
  };
  const directory = path.join(sourceDirectory, 'Paketgebundene-Markdown-OCR-Ohne-Kontaktpruefung');
  fs.mkdirSync(directory);
  const fixtures = packagedOcrFixtures();
  const sources = [...fixtures].map(([name, bytes]) => {
    const file = path.join(directory, name); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file;
  });
  const admitted = await send('admit_selected_sources', { source_kind: 'files', source_paths: sources });
  assert.equal(admitted.selected_count, 2);
  const started = await send('start_admitted_batch', { processing_mode: 'markdown-only', ocr_contact_review: true });
  assert.match(started.batch_id, /^[a-f0-9]{64}$/u);
  const deadline = Date.now() + 120000;
  let row;
  for (;;) {
    row = (await send('get_run_history')).entries.find(item => item.batch_id === started.batch_id);
    if (row?.status === 'review_required') break;
    assert.ok(Date.now() < deadline, 'PACKAGED_SKIP_CONTACT_REVIEW_NOT_REACHED');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(row.result_count, 0);
  await send('continue_history_batch', { batch_id: row.batch_id });
  for (;;) {
    if ((await send('get_review_session')).ready === true) break;
    assert.ok(Date.now() < deadline, 'PACKAGED_SKIP_ACTIVE_REVIEW_NOT_READY');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const skipped = await send('skip_ocr_contact_review', { batch_id: row.batch_id });
  assert.equal(skipped.skip_requested, true, 'ACTIVE_SKIP_MUST_NOT_FABRICATE_A_CONTACT_ANSWER');
  let complete;
  for (;;) {
    complete = (await send('get_run_history')).entries.find(item => item.batch_id === row.batch_id);
    if (complete?.result_count === 2 && complete.resumable === false) break;
    assert.ok(Date.now() < deadline, 'PACKAGED_SKIP_MARKDOWN_NOT_COMPLETED');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // Terminal item counts can precede the owning worker's visible publication.
  // Keep the original scenario deadline and resolve only this exact batch.
  let output;
  for (;;) {
    assert.ok(Date.now() < deadline, 'PACKAGED_SKIP_VISIBLE_EXPORT_TIMEOUT');
    const response = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action: 'resolve_history_results',
      batch_id: row.batch_id });
    assert.ok(Date.now() < deadline, 'PACKAGED_SKIP_VISIBLE_EXPORT_TIMEOUT');
    if (response.ok === true) { output = response.result; break; }
    assert.equal(response.ok, false);
    assert.ok(['STANDALONE_RESULTS_MISSING', 'RESULT_PUBLICATION_PENDING'].includes(response.error_code),
      `initial readiness never retries a conflict: ${JSON.stringify(response)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const texts = fs.readdirSync(output.local_path).filter(name => name.endsWith('.md'))
    .map(name => fs.readFileSync(path.join(output.local_path, name), 'utf8'));
  assert.equal(texts.length, 2);
  for (const value of texts) {
    assert.doesNotMatch(value, /OCR-Kontaktwerte wurden lokal bestätigt oder korrigiert/u,
      'SKIPPED_CONTACTS_MUST_NOT_BE_LABELED_AS_HUMAN_VERIFIED');
    assert.doesNotMatch(value, /\[PERSON_|\[EMAIL_|\[PHONE_/u,
      'RAW_SKIP_MUST_NOT_ANONYMIZE_MARKDOWN');
  }
  for (const [index, source] of sources.entries()) assert.deepEqual(fs.readFileSync(source), [...fixtures.values()][index]);
  process.stdout.write('STANDALONE PACKAGED RAW OCR SKIP IPC PASS (active review; no fabricated confirmation; original files unchanged)\n');
}

export function assertPackagedOcrOutputs(texts) {
  assert.equal(texts.length, 2, 'OCR_REVIEW_RESULTS_INCOMPLETE');
  let person;
  for (const text of texts) {
    assert.match(text, /Java bleibt\./u, 'OCR_REVIEW_FACTUAL_CONTENT_CHANGED');
    assert.match(text, /\[PERSON_\d+\]/u, 'OCR_REVIEW_PERSON_MISSING');
    assert.match(text, /\[EMAIL_(?:REDACTED|\d+)\]/u, 'OCR_REVIEW_EMAIL_MISSING');
    assert.match(text, /\[PHONE_(?:REDACTED|\d+)\]/u, 'OCR_REVIEW_PHONE_MISSING');
    assert.doesNotMatch(text, /Mustermann|native\.example|987654321|alpha@|beta@/iu,
      'OCR_REVIEW_SOURCE_CONTACT_REMAINS');
    assert.doesNotMatch(text, /@|\+\d[\d ()]{5,}/u, 'OCR_REVIEW_UNEXPECTED_CONTACT_REMAINS');
    // Only the defined product framing is excluded. Compare ALL remaining
    // nonblank lines; never accept a matching substring with arbitrary extras.
    const normalized = text.replaceAll('\r\n', '\n');
    const header = /^<!--\nEU Privacy Document Gateway [^\n]+\n[^]*?\n-->\n\n/u.exec(normalized);
    assert.ok(header, 'OCR_REVIEW_PRODUCT_HEADER_MISSING');
    let body = normalized.slice(header[0].length);
    const scopeNotice = '> **DataSecure-Hinweis:** Anonymisiert wurde ausschließlich der lokal in Markdown umgewandelte Inhalt. Die Vollständigkeit der Extraktion aus der Originaldatei ist nicht garantiert; nicht extrahierte Inhalte sind in diesem Ergebnis nicht enthalten.\n\n';
    assert.ok(body.startsWith(scopeNotice), 'OCR_REVIEW_SCOPE_NOTICE_MISSING'); body = body.slice(scopeNotice.length);
    const notice = /\n+> Hinweis: Grafiken und ihre visuelle Anordnung sind nicht enthalten\. Text aus Bildern wurde übernommen; Lesefehler und Auslassungen sind möglich\. Erkannte Kontaktwerte bitte mit dem Original vergleichen\.(?: Die Nachprüfung lieferte abweichende Lesarten\.)?(?: Einige Wörter wurden unsicher erkannt\.)?(?: Die Erkennungssicherheit ist teilweise unbekannt\.)?(?: Nicht lesbare Symbolzeichen wurden ausgelassen\.)?\n?$/u.exec(body);
    assert.ok(notice, 'OCR_REVIEW_CONTACT_NOTICE_MISSING'); body = body.slice(0, notice.index).trimEnd();
    const name = /^Name: (\[PERSON_\d+\])/u.exec(body); assert.ok(name, 'OCR_REVIEW_PERSON_MISSING');
    if (person) assert.equal(name[1], person, 'OCR_REVIEW_PERSON_IDS_INCONSISTENT'); else person = name[1];
    assert.equal(body.split('\n').map(line => line.trimEnd()).filter(line => line.trim()).join('\n'),
      `Name: ${person}\nE-Mail: [EMAIL_REDACTED]\nTelefon: [PHONE_REDACTED]\nJava bleibt.\n${correctionSentinel}`,
      'OCR_REVIEW_COMPLETE_BODY_CHANGED');
  }
}

export function assertAppliedOcrCorrection(draft, expected) {
  assert.notEqual(expected.corrected, expected.email);
  assert.ok(draft.original_text.includes(`E-Mail: ${expected.corrected}`), 'OCR_CORRECTION_NOT_APPLIED_TO_PRIVACY');
  assert.ok(draft.original_text.includes(`Telefon: ${correctedPhone}`), 'OCR_PHONE_CORRECTION_NOT_APPLIED_TO_PRIVACY');
  assert.ok(!draft.original_text.includes(expected.email) && !draft.original_text.includes(contactPhone), 'OCR_OLD_CONTACT_REUSED');
}

export async function runPackagedOcrScenario({ request: initialRequest, restart, sourceDirectory, markdownOnly = false, contentOnly = false }) {
  assert.ok(!contentOnly || markdownOnly);
  let request = initialRequest, sequence = markdownOnly ? 0xa000 : 0x9000;
  const send = async (action, fields = {}) => {
    const response = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action, ...fields });
    assert.equal(response.ok, true, `${action}: ${JSON.stringify(response)}`);
    return response.result;
  };
  async function until(probe, reason) {
    const deadline = Date.now() + 120000;
    for (;;) {
      const value = await probe(); if (value) return value;
      assert.ok(Date.now() < deadline, reason);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  async function draftFor(session) {
    const pieces = [];
    for (let index = 0; index < session.chunk_count; index++) {
      const chunk = await send('get_review_chunk', { review_id: session.review_id, chunk_index: index });
      pieces.push(Buffer.from(chunk.data, 'base64'));
    }
    const draft = JSON.parse(Buffer.concat(pieces).toString('utf8'));
    return draft;
  }
  const directory = path.join(sourceDirectory, contentOnly ? 'Paketgebundene-Inhalts-OCR-Pruefung' : markdownOnly ? 'Paketgebundene-Markdown-OCR-Pruefung' : 'Paketgebundene-OCR-Pruefung');
  fs.mkdirSync(directory);
  const fixtures = packagedOcrFixtures();
  const sources = [...fixtures].map(([name, bytes]) => {
    const file = path.join(directory, name); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file;
  });
  const admitted = await send('admit_selected_sources', { source_kind: 'files', source_paths: sources, ...(contentOnly ? { source_catalogue: true } : {}) });
  if (contentOnly) assert.equal(admitted.ui_context.source_catalogue.length, 2);
  else assert.equal(admitted.selected_count, 2);
  await send('start_admitted_batch', contentOnly ? { processing_mode: 'markdown-only', ocr_contact_review: true, document_review: true,
    content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true },
    source_ids: admitted.ui_context.source_catalogue.map(item => item.source_id), catalogue_revision: admitted.ui_context.catalogue_revision } : markdownOnly ? { processing_mode: 'markdown-only', ocr_contact_review: true } :
    { processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' });
  const row = await until(async () => {
    const item = (await send('get_run_history')).entries[0];
    return item?.status === 'review_required' && (await send('get_public_state')).state === 'review_required' ? item : false;
  }, 'actual packaged OCR must require contact decisions');
  assert.equal(row.result_count, 0, 'UNCONFIRMED_OCR_MUST_NOT_PUBLISH');
  await send('continue_history_batch', { batch_id: row.batch_id });
  let ready = await until(async () => { const value = await send('get_review_session'); return value.ready ? value : false; }, 'first OCR draft');
  const firstDraft = await draftFor(ready);
  assert.equal(firstDraft.ocr_contact_review, true); assert.equal(firstDraft.ambiguities.length, 4);
  assert.equal(firstDraft.contact_batch.documents.length, 2);
  await send('submit_review', { review_id: ready.review_id, answer: { action: 'deferred' } });
  await until(async () => (await send('get_review_session')).continuation_available, 'deferred OCR worker must settle before restart');
  request = await restart();
  const recovered = (await send('get_run_history')).entries.find(item => item.batch_id === row.batch_id);
  assert.equal(recovered.status, 'review_required'); assert.equal(recovered.result_count, 0);
  await send('continue_history_batch', { batch_id: row.batch_id });
  ready = await until(async () => { const value = await send('get_review_session'); return value.ready ? value : false; }, 'resumed OCR draft');
  assert.deepEqual(await draftFor(ready), firstDraft, 'RESTART_MUST_RETAIN_EXACT_OCR_OCCURRENCES');
  {
    const draft = await draftFor(ready);
    assert.equal(draft.ocr_contact_review, true); assert.equal(draft.ambiguities.length, 4);
    assert.equal(draft.processing_mode, markdownOnly ? 'markdown-only' : undefined);
    const references = new Map();
    for (const expected of contactReferences) {
    assert.ok(draft.original_text.includes(expected.email), 'OCR_REFERENCE_DOCUMENT_BINDING_INVALID');
    const document = draft.contact_batch.documents.find(item => item.source_label === expected.name);
    assert.ok(document, 'CONTACT_DOCUMENT_FILENAME_MISSING');
    const candidates = draft.ambiguities.filter(item => document.candidate_ids.includes(item.ambiguity_id));
    assert.equal(candidates.length, 2);
    assertOriginalContactPixels({ ambiguities: candidates }, fixtures.get(expected.name));
    candidates.forEach(item => references.set(item.ambiguity_id, expected));
    }
    // Explicit reference-bound test decisions only: never guessed replacements.
    // Deliberately DIFFERENT synthetic replacements prove application, not
    // merely that an action named "correct_contact" was accepted.
    const decisions = draft.ambiguities.map(item => {
      assert.ok(['email', 'phone'].includes(item.contact_kind));
      return { ambiguity_id: item.ambiguity_id, decision: 'correct_contact',
        replacement: item.contact_kind === 'email' ? references.get(item.ambiguity_id).corrected : correctedPhone };
    });
    await send('submit_review', { review_id: ready.review_id, answer: { action: 'reviewed', redactions: [], decisions } });
    if (!markdownOnly) {
    const previous = ready.review_id;
    ready = await until(async () => {
      const value = await send('get_review_session'); return value.ready && value.review_id !== previous ? value : false;
    }, 'both corrected privacy inputs must reach entity review after ONE contact-table answer');
    }
  }
  // The contact phase covers ALL documents before ordinary entity review.
  // Prove both distinct replacements reached the actual privacy input, then
  // restart AFTER durable correction. Old raw contacts must not be replayed.
  if (!markdownOnly) {
  const entityDraft = await draftFor(ready); assert.equal(entityDraft.ocr_contact_review, undefined);
  for (const expected of contactReferences) assertAppliedOcrCorrection(entityDraft, expected);
  await send('submit_review', { review_id: ready.review_id, answer: { action: 'deferred' } });
  await until(async () => (await send('get_review_session')).continuation_available, 'corrected entity worker must settle');
  request = await restart(); await send('continue_history_batch', { batch_id: row.batch_id });
  ready = await until(async () => { const value = await send('get_review_session'); return value.ready ? value : false; }, 'corrected entity draft after restart');
  const resumed = await draftFor(ready); assert.deepEqual(resumed, entityDraft);
  for (const expected of contactReferences) assertAppliedOcrCorrection(resumed, expected);
  const entityChoices = resumed.ambiguities.map(item => {
    assert.equal(resumed.original_text.slice(item.original_start, item.original_end), correctionSentinel);
    return { ambiguity_id: item.ambiguity_id, decision: 'keep' };
  });
  assert.ok(entityChoices.length);
  await send('submit_review', { review_id: ready.review_id, answer: { action: 'reviewed', redactions: [], decisions: entityChoices } });
  }
  await until(async () => (await send('get_review_session')).run_complete, 'corrected contacts must pass ordinary anonymization and publication');
  const complete = (await send('get_run_history')).entries.find(item => item.batch_id === row.batch_id);
  assert.equal(complete.result_count, 2); assert.equal(complete.failed_count, 0); assert.equal(complete.resumable, false);
  const output = await send('resolve_history_results', { batch_id: row.batch_id });
  const texts = fs.readdirSync(output.local_path).filter(name => name.endsWith('.md'))
    .map(name => fs.readFileSync(path.join(output.local_path, name), 'utf8'));
  if (!markdownOnly) assertPackagedOcrOutputs(texts);
  else {
    assert.equal(complete.processing_mode, 'markdown-only');
    assertPackagedMarkdownOcrOutputs(texts, contentOnly);
    assert.throws(() => assertPackagedMarkdownOcrOutputs([texts.join('\n'), ''], contentOnly),
      'one merged document plus one empty document must never pass');
    assert.ok(!fs.readdirSync(output.local_path).some(name => /Identitaeten|Zuordnung/u.test(name)),
      'MARKDOWN_REVIEW_MUST_NOT_CREATE_PRIVACY_MAPPINGS');
  }
  for (const [index, source] of sources.entries()) assert.deepEqual(fs.readFileSync(source), [...fixtures.values()][index]);
  process.stdout.write(`STANDALONE PACKAGED ${markdownOnly ? 'MARKDOWN ' : ''}OCR CONTACT IPC PASS (exact original crop pixels; correction; defer/restart; next document; verified final outputs; no native UI claim)\n`);
}
