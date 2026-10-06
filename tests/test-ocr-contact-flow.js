'use strict';

// Real intake, source snapshot, private journal/correction, privacy engine,
// broker, serialized desktop answer and final publication. Only the converter
// transcript is controlled here; native OCR/pixel coverage runs separately.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const temporary = fs.realpathSync.native(os.tmpdir());
const scope = fs.realpathSync.native(fs.mkdtempSync(path.join(temporary, 'datasecure-contact-flow-')));
const environment = new Map(['EU_PRIVACY_ROOT', 'EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_RESULT_ROOT', 'DATASECURE_PRODUCT_CHANNEL'].map(key => [key, process.env[key]]));
process.env.EU_PRIVACY_ROOT = path.join(scope, 'private');
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'data');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'results');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { contactQuality } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { contactSpans } = require('../plugins/data-secure/server/core/ocr-contact-review');
const { createReviewBroker } = require('../plugins/data-secure/server/standalone/review-broker');
const { encodeFrame, FrameDecoder } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { readOutput } = require('../plugins/data-secure/server/gateway/package-store');
const { workPath } = require('../plugins/data-secure/server/gateway/batch-private-store');
let sequence = 0;
function serializedAnswer(broker, reviewId, answer) {
  const message = new FrameDecoder().push(encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: (++sequence).toString(16).padStart(16, '0'), action: 'submit_review', review_id: reviewId, answer }))[0];
  return broker.submit(message.review_id, message.answer);
}
function cleanup() {
  const targets = [];
  function inspect(directory) {
    for (const name of fs.readdirSync(directory)) {
      const full = path.join(directory, name), info = fs.lstatSync(full);
      assert.ok(!info.isSymbolicLink() && (info.isFile() || info.isDirectory()));
      assert.ok(fs.realpathSync.native(full).startsWith(scope + path.sep));
      if (info.isDirectory()) inspect(full);
      targets.push({ full, directory: info.isDirectory() });
    }
  }
  assert.equal(path.dirname(scope), temporary); assert.match(path.basename(scope), /^datasecure-contact-flow-/u);
  inspect(scope);
  for (const item of targets) item.directory ? fs.rmdirSync(item.full) : fs.unlinkSync(item.full);
  fs.rmdirSync(scope);
}

(async () => {
  const files = [1, 2].map(index => {
    const full = path.join(scope, `contact-${index}.png`);
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(full, bytes); return { full, name: path.basename(full), sourceBytes: bytes.length, bytes };
  });
  let batch = require('../plugins/data-secure/server/gateway/batch');
  const token = batch.beginBatch({ expectedCount: 2, profile: 'personnel_profile', productChannel: 'standalone',
    processingMode: 'markdown-and-anonymize', queue: files }).batch_token;
  const original = 'Name: Zora Eibenhang\nE-Mail: wrong@new.invalid\nTelefon: +49 (040) 987654321\nSYNTHETISCHER HÄRTETEST\nJava bleibt.';
  const convertBuffer = async () => createMarkdownExtraction({ source_type: 'png', markdown: original,
    coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'] },
    ocr_contacts: contactSpans(original, contactQuality({}, original)) });
  for (const file of files) {
    const result = await batch.processBatchNext(token, { convertBuffer });
    assert.ok(!result.package_id, 'unconfirmed OCR must never auto-publish');
    assert.ok(batch._test.readState(token).items.some(item => item.status === 'deferred_review'), JSON.stringify(batch._test.readState(token).items));
  }
  assert.equal(batch._test.readState(token).items.filter(item => item.status === 'deferred_review').length, 2);
  let contacts = 0, entities = 0, deferred = false;
  const broker = createReviewBroker();
  async function reviewTextLocally(draft) {
    const reviewId = (++sequence).toString(16).padStart(32, '0');
    let response;
    const child = { send(message) { response = message.answer; } };
    broker.receive(child, { type: 'standalone-review-draft', batch_token: token, review_id: reviewId, draft });
    assert.equal(broker.session().ready, true);
    const session = broker.session(), pieces = [];
    for (let index = 0; index < session.chunk_count; index++) pieces.push(Buffer.from(broker.chunk(reviewId, index).data, 'base64'));
    const transported = JSON.parse(Buffer.concat(pieces).toString('utf8'));
    assert.equal(transported.original_text, draft.original_text);
    let answer;
    if (draft.ocr_contact_review) {
      contacts++;
      if (contacts === 2 && !deferred) { deferred = true; answer = { action: 'deferred' }; }
      else answer = { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map(item => ({
        ambiguity_id: item.ambiguity_id, decision: item.contact_kind === 'email' ? 'correct_contact' : 'confirm_contact',
        ...(item.contact_kind === 'email' ? { replacement: 'zora@other.invalid' } : {}) })) };
    } else {
      entities++;
      assert.ok(draft.original_text.includes('zora@other.invalid'));
      assert.ok(!draft.original_text.includes('wrong@new.invalid'));
      answer = { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map(item => {
        assert.equal(draft.original_text.slice(item.original_start, item.original_end), 'SYNTHETISCHER HÄRTETEST');
        return { ambiguity_id: item.ambiguity_id, decision: 'keep' };
      }) };
    }
    assert.equal(serializedAnswer(broker, reviewId, answer).accepted, true);
    assert.ok(!JSON.stringify(broker.session()).includes('other.invalid'));
    broker.release(child); return response;
  }
  const first = await batch.reviewDeferredBatch(token, { convertBuffer, reviewTextLocally });
  assert.equal(first.ok, false); assert.equal(first.error, 'LOCAL_REVIEW_DEFERRED', JSON.stringify(first));
  assert.equal(contacts, 2); assert.equal(entities, 0);
  assert.equal(fs.readdirSync(workPath(token)).filter(name => name.endsWith('.ocrreview')).length, 1);
  const journalBefore = JSON.stringify(batch._test.readState(token));
  assert.doesNotMatch(journalBefore, /wrong@|zora@|987654321|Zora Eibenhang/u);
  // Restore the real module and store after deferring midway across documents.
  delete require.cache[require.resolve('../plugins/data-secure/server/gateway/batch')];
  batch = require('../plugins/data-secure/server/gateway/batch');
  const resumed = await batch.reviewDeferredBatch(token, { convertBuffer, reviewTextLocally });
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(contacts, 3, 'first document uses its persisted bound confirmation instead of asking again');
  assert.equal(entities, 1);
  assert.equal(resumed.packages.length, 2);
  for (const result of resumed.packages) {
    const released = readOutput(result.package_id, result.read_capability, 0, 30000).text;
    assert.doesNotMatch(released, /wrong@|zora@|987654321|Zora Eibenhang/u);
    assert.match(released, /\[EMAIL_REDACTED\]/u); assert.match(released, /\[PHONE_REDACTED\]/u);
    assert.match(released, /SYNTHETISCHER HÄRTETEST/u); assert.match(released, /Java bleibt/u);
  }
  for (const file of files) assert.deepEqual(fs.readFileSync(file.full), file.bytes);
  process.stdout.write('✓ contact → serialized private IPC/broker → durable decision → defer/reload across documents → entity review → actual publication; controlled converter transcript, not native GUI evidence\n');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [key, value] of environment) value === undefined ? delete process.env[key] : process.env[key] = value;
  cleanup();
});
