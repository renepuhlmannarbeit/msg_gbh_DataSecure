'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { exactKeys } = require('../core/source-extraction-contract');
const { buildContactDraft, validateContactAnswer, applyContactAnswer } = require('../core/ocr-contact-review');
const SCHEMA = 'datasecure-ocr-contact-correction/1';
const fail = () => Object.assign(new Error('Die gespeicherte OCR-Kontaktentscheidung passt nicht zur unveränderten Quelle.'),
  { code: 'OCR_CONTACT_REVIEW_INVALID' });

function createContactStore({ privateWorkStore, workPath, io = fs }) {
  function binding(state, item, input) {
    if (state?.product_channel !== 'standalone' || !/^[a-f0-9]{64}$/u.test(String(state.token || '')) ||
        !/^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/u.test(String(item?.work_name || '')) ||
        !/^[a-f0-9]{64}$/u.test(String(item.sha256 || '')) ||
        !/^[A-Za-z0-9_-]{43}$/u.test(String(state.pseudonym_seed || ''))) throw fail();
    const target = path.join(workPath(state.token), `${item.work_name.replace(/\.[a-z0-9]+$/u, '')}.ocrreview`);
    const identity = { schema: SCHEMA, token: state.token, item: item.id, source_sha256: item.sha256,
      policy: state.core_policy_fingerprint, contract: state.pseudonym_contract_version, rules: state.pseudonym_ruleset_version,
      source_type: input.source_type, extraction_sha256: crypto.createHash('sha256').update(input.original_text, 'utf8').digest('hex'),
      contacts: input.contacts };
    const key = Buffer.from(state.pseudonym_seed, 'base64url');
    if (key.length !== 32 || key.toString('base64url') !== state.pseudonym_seed) { key.fill(0); throw fail(); }
    const authenticate = answer => crypto.createHmac('sha256', key).update(JSON.stringify(identity)).update('\0')
      .update(JSON.stringify(answer)).digest('hex');
    return { target, identity, authenticate, dispose: () => key.fill(0) };
  }

  function read(state, item, input) {
    const bound = binding(state, item, input);
    let bytes;
    try {
      try { io.lstatSync(bound.target); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      bytes = privateWorkStore.readFile(bound.target);
      if (bytes.length > 1024 * 1024) throw fail();
      const record = JSON.parse(bytes.toString('utf8'));
      if (!exactKeys(record, ['schema', 'binding', 'answer', 'authentication']) || record.schema !== SCHEMA ||
          JSON.stringify(record.binding) !== JSON.stringify(bound.identity) ||
          !/^[a-f0-9]{64}$/u.test(String(record.authentication || ''))) throw fail();
      const answer = validateContactAnswer(record.answer, buildContactDraft(input));
      const actual = Buffer.from(record.authentication, 'hex');
      const expected = Buffer.from(bound.authenticate(answer), 'hex');
      if (!crypto.timingSafeEqual(actual, expected)) throw fail();
      return applyContactAnswer(input, answer);
    } catch { throw fail(); }
    finally { if (bytes) bytes.fill(0); bound.dispose(); }
  }

  function write(state, item, input, supplied) {
    const answer = validateContactAnswer(supplied, buildContactDraft(input));
    if (answer.action !== 'reviewed') throw Object.assign(fail(), { code: 'LOCAL_REVIEW_DEFERRED' });
    const bound = binding(state, item, input);
    const bytes = Buffer.from(JSON.stringify({ schema: SCHEMA, binding: bound.identity, answer,
      authentication: bound.authenticate(answer) }), 'utf8');
    try {
      if (bytes.length > 1024 * 1024) throw fail();
      privateWorkStore.writeFile(bound.target, bytes);
      // A checkpoint is accepted only after the durable bytes can be read back
      // and authenticated against the same complete extraction and snapshot.
      return read(state, item, input);
    } finally { bytes.fill(0); bound.dispose(); }
  }
  return Object.freeze({ read, write });
}

module.exports = { SCHEMA, createContactStore };
