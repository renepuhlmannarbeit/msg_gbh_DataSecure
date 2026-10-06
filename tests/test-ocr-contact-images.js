'use strict';
const assert = require('node:assert/strict');
const { encodePng } = require('../plugins/data-secure/server/images/png');
const { validateContactImage, contactImageDigest } = require('../plugins/data-secure/server/core/ocr-contact-image');
const { attachContactCrops } = require('../plugins/data-secure/server/standalone/ocr-contact-crops');
const { buildContactDraft, validateContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
const png = encodePng({ width: 4, height: 3, rgba: Buffer.alloc(48, 255) });
const image = { schema: 'datasecure-ocr-contact-image/1', source_width: 10, source_height: 10,
  x: 2, y: 3, width: 4, height: 3, png_base64: png.toString('base64') };
assert.equal(validateContactImage(image), png.length);
assert.match(contactImageDigest(image), /^[a-f0-9]{64}$/u);
const badCrc = Buffer.from(png); badCrc[29] ^= 1;
assert.throws(() => validateContactImage({ ...image, png_base64: badCrc.toString('base64') }),
  { code: 'OCR_CONTACT_REVIEW_INVALID' });
for (const change of [{ url: 'https://example.invalid' }, { x: 9 }, { width: 4097 },
  { png_base64: '<svg/>' }, { png_base64: Buffer.concat([png, Buffer.from('trailing')]).toString('base64') },
  { width: 5 }, { height: 100000 }]) assert.throws(() => validateContactImage({ ...image, ...change }));
const input = { original_text: 'a@b.invalid', source_type: 'png',
  contacts: [{ start: 0, end: 11, page: 1, line: 1, kind: 'email', image }] };
const draft = buildContactDraft(input);
assert.equal(validateContactDraft(JSON.parse(JSON.stringify(draft))).ambiguities[0].image.png_base64, image.png_base64);
const line = { text: input.original_text, bbox: { x0: 20, y0: 20, x1: 100, y1: 40 } };
let requested;
const canvas = { width: 200, height: 100, getContext() { return { getImageData(x, y, width, height) {
  requested = { x, y, width, height }; return { data: new Uint8ClampedArray(width * height * 4).fill(255) };
} }; } };
const blocks = [{ paragraphs: [{ lines: [line] }] }];
const [crop] = attachContactCrops(input.contacts.map(({ image: _image, ...contact }) => contact), input.original_text, blocks, canvas,
  { bytes: 0 }, input.original_text);
assert.deepEqual(requested, { x: 8, y: 8, width: 104, height: 44 });
validateContactImage(crop.image);
assert.equal(attachContactCrops([crop], input.original_text, [{ paragraphs: [{ lines: [line, line] }] }], canvas,
  { bytes: 0 }, input.original_text)[0].image, crop.image,
  'ambiguous geometry must not create or replace a crop');
const [missing] = attachContactCrops(input.contacts.map(({ image: _image, ...contact }) => contact), input.original_text,
  [{ paragraphs: [{ lines: [line, line] }] }], canvas, { bytes: 0 }, input.original_text);
assert.equal(missing.image, undefined);
const filtered = attachContactCrops([{ start: 0, end: 11, line: 1, page: 1, kind: 'email' }], 'a@b.invalid',
  [{ paragraphs: [{ lines: [{ ...line, text: 'Kontakt a@b.invalid' }, line] }] }], canvas,
  { bytes: 0 }, 'Kontakt a@b.invalid\na@b.invalid');
assert.equal(filtered[0].image, undefined, 'a rewritten Hybrid-PDF line must never borrow another occurrence’s crop');
assert.equal(attachContactCrops(input.contacts.map(({ image: _image, ...contact }) => contact), input.original_text, blocks, canvas,
  { bytes: 2 * 1024 * 1024 }, input.original_text)[0].image, undefined);
assert.equal(attachContactCrops(input.contacts.map(({ image: _image, ...contact }) => contact), input.original_text, blocks, canvas,
  { bytes: 0, pixels: 2 * 1000 * 1000 }, input.original_text)[0].image, undefined);
const { createContactStore } = require('../plugins/data-secure/server/gateway/ocr-contact-store');
const state = { schema: 'datasecure-batch/5', processing_mode: 'markdown-only', product_channel: 'standalone',
  token: 'a'.repeat(64), ocr_contact_review: true, ocr_review_seed: Buffer.alloc(32, 1).toString('base64url') };
const item = { id: 'b'.repeat(32), work_name: `001_${'b'.repeat(24)}.png`, sha256: 'c'.repeat(64) };
let persisted;
const store = createContactStore({ workPath: () => require('node:path').resolve('private'), io: { lstatSync() {} },
  privateWorkStore: { writeFile(_target, bytes) { persisted = Buffer.from(bytes); }, readFile() { return Buffer.from(persisted); } } });
const mdInput = { ...input, processing_mode: 'markdown-only' };
const answer = { action: 'reviewed', redactions: [], decisions: [{ ambiguity_id: draft.ambiguities[0].ambiguity_id,
  decision: 'correct_contact', replacement: 'right@other.invalid' }] };
assert.equal(store.write(state, item, mdInput, answer), 'right@other.invalid');
assert.doesNotMatch(persisted.toString('utf8'), /png_base64|iVBORw0KGgo/u);
assert.throws(() => store.read(state, item, { ...mdInput, contacts: [{ ...mdInput.contacts[0], image: { ...image, x: 3 } }] }),
  { code: 'OCR_CONTACT_REVIEW_INVALID' });
assert.throws(() => store.read(state, { ...item, sha256: 'd'.repeat(64) }, mdInput), { code: 'OCR_CONTACT_REVIEW_INVALID' });
assert.throws(() => store.read({ ...state, ocr_review_seed: Buffer.alloc(32, 2).toString('base64url') }, item, mdInput),
  { code: 'OCR_CONTACT_REVIEW_INVALID' });
// Independently construct an actual historical v1 record, not a v2 record
// accepted because the test calls the new writer itself.
const legacyState = { schema: 'datasecure-batch/4', processing_mode: 'markdown-and-anonymize', product_channel: 'standalone',
  token: state.token, pseudonym_seed: Buffer.alloc(32, 7).toString('base64url'),
  core_policy_fingerprint: 'e'.repeat(64), pseudonym_contract_version: 'batch-pseudonym/v2', pseudonym_ruleset_version: 2 };
const legacyContacts = input.contacts.map(({ image: _image, ...contact }) => contact);
const legacyIdentity = { schema: 'datasecure-ocr-contact-correction/1', token: legacyState.token, item: item.id,
  source_sha256: item.sha256, policy: legacyState.core_policy_fingerprint, contract: legacyState.pseudonym_contract_version,
  rules: legacyState.pseudonym_ruleset_version, source_type: input.source_type,
  extraction_sha256: require('node:crypto').createHash('sha256').update(input.original_text, 'utf8').digest('hex'), contacts: legacyContacts };
const authentication = require('node:crypto').createHmac('sha256', Buffer.from(legacyState.pseudonym_seed, 'base64url'))
  .update(JSON.stringify(legacyIdentity)).update('\0').update(JSON.stringify(answer)).digest('hex');
persisted = Buffer.from(JSON.stringify({ schema: 'datasecure-ocr-contact-correction/1', binding: legacyIdentity, answer, authentication }));
assert.equal(store.read(legacyState, item, input), 'right@other.invalid', 'old authenticated decisions remain usable with a new optional crop');
assert.throws(() => store.read(state, item, mdInput), { code: 'OCR_CONTACT_REVIEW_INVALID' },
  'legacy anonymization records cannot authorize the new Markdown purpose');
persisted = Buffer.from(JSON.stringify({ schema: 'datasecure-ocr-contact-correction/1', binding: legacyIdentity, answer,
  authentication: 'f'.repeat(64) }));
assert.throws(() => store.read(legacyState, item, input), { code: 'OCR_CONTACT_REVIEW_INVALID' });
console.log('✓ private OCR crops: exact raster coordinates, bounded PNG/CRC, no URL/trailing payload, ambiguous/missing geometry fallback');
