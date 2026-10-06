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
    const graphics = '> Grafikhinweis: Die Grafik selbst ist nicht im Markdown enthalten. Lokal erkannter Bildtext ist übernommen, kann aber unvollständig sein. Bildinhalt und visuelle Anordnung werden nicht automatisch beschrieben.';
    const notice = /\n+> OCR-Hinweis \(Bild\): Kontaktwerte in OCR-Zeile\(n\) \d+(?:, \d+)* können Zeichenfehler enthalten\. Vor einer Nutzung mit den Originalen vergleichen\. Auch hohe OCR-Konfidenzen bestätigen keine exakte Erkennung\.(?: Mindestens eine dieser Zeilen enthält Wörter mit geringer Erkennungssicherheit\.)?(?: Für mindestens eine dieser Zeilen fehlen vergleichbare Wortkonfidenzen\.)?(?: Die geometrische Nachprüfung lieferte abweichende Lesarten in OCR-Zeile\(n\) \d+(?:, \d+)*; die exakten Kontaktzeichen sind nicht bestätigt\.)?\n?$/u.exec(body);
    assert.ok(notice, 'OCR_REVIEW_CONTACT_NOTICE_MISSING'); body = body.slice(0, notice.index).trimEnd();
    assert.ok(body.endsWith(graphics), 'OCR_REVIEW_GRAPHICS_NOTICE_MISSING'); body = body.slice(0, -graphics.length).trim();
    const name = /^Name: (\[PERSON_\d+\])/u.exec(body); assert.ok(name, 'OCR_REVIEW_PERSON_MISSING');
    if (person) assert.equal(name[1], person, 'OCR_REVIEW_PERSON_IDS_INCONSISTENT'); else person = name[1];
    assert.equal(body.split('\n').filter(line => line.trim()).join('\n'),
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

export async function runPackagedOcrScenario({ request: initialRequest, restart, sourceDirectory, markdownOnly = false }) {
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
  const directory = path.join(sourceDirectory, markdownOnly ? 'Paketgebundene-Markdown-OCR-Pruefung' : 'Paketgebundene-OCR-Pruefung');
  fs.mkdirSync(directory);
  const fixtures = packagedOcrFixtures();
  const sources = [...fixtures].map(([name, bytes]) => {
    const file = path.join(directory, name); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file;
  });
  assert.equal((await send('admit_selected_sources', { source_kind: 'files', source_paths: sources })).selected_count, 2);
  await send('start_admitted_batch', markdownOnly ? { processing_mode: 'markdown-only', ocr_contact_review: true } :
    { processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' });
  const row = await until(async () => {
    const item = (await send('get_run_history')).entries[0];
    return item?.status === 'review_required' && (await send('get_public_state')).state === 'review_required' ? item : false;
  }, 'actual packaged OCR must require contact decisions');
  assert.equal(row.result_count, 0, 'UNCONFIRMED_OCR_MUST_NOT_PUBLISH');
  await send('continue_history_batch', { batch_id: row.batch_id });
  let ready = await until(async () => { const value = await send('get_review_session'); return value.ready ? value : false; }, 'first OCR draft');
  const firstDraft = await draftFor(ready);
  assert.equal(firstDraft.ocr_contact_review, true); assert.equal(firstDraft.ambiguities.length, 2);
  await send('submit_review', { review_id: ready.review_id, answer: { action: 'deferred' } });
  await until(async () => (await send('get_review_session')).continuation_available, 'deferred OCR worker must settle before restart');
  request = await restart();
  const recovered = (await send('get_run_history')).entries.find(item => item.batch_id === row.batch_id);
  assert.equal(recovered.status, 'review_required'); assert.equal(recovered.result_count, 0);
  await send('continue_history_batch', { batch_id: row.batch_id });
  ready = await until(async () => { const value = await send('get_review_session'); return value.ready ? value : false; }, 'resumed OCR draft');
  assert.deepEqual(await draftFor(ready), firstDraft, 'RESTART_MUST_RETAIN_EXACT_OCR_OCCURRENCES');
  for (const [index, expected] of contactReferences.entries()) {
    const draft = await draftFor(ready);
    assert.equal(draft.ocr_contact_review, true); assert.equal(draft.ambiguities.length, 2);
    assert.equal(draft.processing_mode, markdownOnly ? 'markdown-only' : undefined);
    assert.ok(draft.original_text.includes(expected.email), 'OCR_REFERENCE_DOCUMENT_BINDING_INVALID');
    assertOriginalContactPixels(draft, fixtures.get(expected.name));
    // Explicit reference-bound test decisions only: never guessed replacements.
    // Deliberately DIFFERENT synthetic replacements prove application, not
    // merely that an action named "correct_contact" was accepted.
    const decisions = draft.ambiguities.map(item => {
      assert.ok(['email', 'phone'].includes(item.contact_kind));
      return { ambiguity_id: item.ambiguity_id, decision: 'correct_contact',
        replacement: item.contact_kind === 'email' ? expected.corrected : correctedPhone };
    });
    await send('submit_review', { review_id: ready.review_id, answer: { action: 'reviewed', redactions: [], decisions } });
    if (markdownOnly && index === contactReferences.length - 1) break;
    const previous = ready.review_id;
    ready = await until(async () => {
      const value = await send('get_review_session'); return value.ready && value.review_id !== previous ? value : false;
    }, index === 0 ? 'next OCR document in the same review workflow' : 'both corrected privacy inputs must reach entity review');
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
    assert.equal(texts.length, 2); assert.equal(complete.processing_mode, 'markdown-only');
    for (const expected of contactReferences) {
      const matching = texts.filter(value => value.includes(`E-Mail: ${expected.corrected}`));
      assert.equal(matching.length, 1, 'CORRECTED_MARKDOWN_CONTACT_DOCUMENT_MISSING');
      const output = matching[0];
      assert.match(output, /Name: Max Mustermann/u); assert.match(output, /Java bleibt\./u);
      assert.match(output, /SYNTHETISCHER KORREKTURTEST/u);
      assert.ok(output.includes(`Telefon: ${correctedPhone}`));
      assert.doesNotMatch(output, /\[PERSON_|\[EMAIL_|\[PHONE_|png_base64|data:image|Anonymisierungsstatus/u);
      assert.ok(!output.includes(expected.email) && !output.includes(contactPhone), 'OLD_MARKDOWN_CONTACT_REUSED');
    }
    assert.ok(!fs.readdirSync(output.local_path).some(name => /Identitaeten|Zuordnung/u.test(name)),
      'MARKDOWN_REVIEW_MUST_NOT_CREATE_PRIVACY_MAPPINGS');
  }
  for (const [index, source] of sources.entries()) assert.deepEqual(fs.readFileSync(source), [...fixtures.values()][index]);
  process.stdout.write(`STANDALONE PACKAGED ${markdownOnly ? 'MARKDOWN ' : ''}OCR CONTACT IPC PASS (exact original crop pixels; correction; defer/restart; next document; verified final outputs; no native UI claim)\n`);
}
