'use strict';

// Private parser output only: no disk spool, source path, remote fetch or user
// approval. A checkpoint is a complete validated text unit, never an XML/JSON
// prefix. Publication still passes the normal privacy and result contracts.
const { createMarkdownExtraction, validateMarkdownExtractionForOptions, exactKeys,
  MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { validateContentOptions } = require('../core/content-options');
const { MAX_TOTAL_IMAGE_BYTES, MAX_TOTAL_IMAGE_PIXELS } = require('../core/ocr-contact-image');
const ERROR_VALUES = new Set(require('../core/conversion-worker-contract').ERROR_CODES);
const SCHEMA = 'datasecure-conversion-unit/1';
const TYPES = new Set(['docx', 'xlsx', 'pptx', 'pdf']);
const MAX_UNITS = 10000;
const MAX_RESPONSE_BYTES = MAX_MARKDOWN_CHARS * 6 + Math.ceil(2 * 1024 * 1024 / 3) * 4 + 256 * 1024;
// Base units, one update per unit, then the terminal full result. Only the
// transport allowance grows; parser/OS/heap/source/text/crop limits do not.
const MAX_TRANSPORT_BYTES = MAX_RESPONSE_BYTES * 3 + 8 * 1024 * 1024;
const fail = () => { throw Object.assign(new Error('CONVERSION_RESPONSE_INVALID'), { code: 'CONVERSION_RESPONSE_INVALID' }); };
const resourceFailures = new Set(['CONVERSION_RESOURCE_LIMIT', 'CONVERSION_PIXEL_LIMIT', 'INPUT_FILE_LIMIT', 'INPUT_FORMAT_LIMIT']);
const extractionFailures = new Set(['CONVERSION_IMAGE_INVALID', 'CONVERSION_OCR_FAILED', 'CONVERSION_OCR_TEXT_EMPTY',
  'PDF_EXTRACTION_FAILED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY']);

function recoveryReason(code) {
  if (code === 'CONVERSION_TIMEOUT') return 'CONVERSION_TIMEOUT_PARTIAL';
  if (resourceFailures.has(code)) return 'CONVERSION_RESOURCE_LIMIT_PARTIAL';
  if (code === 'TEXT_TOO_LARGE') return 'TEXT_LIMIT_PARTIAL';
  if (extractionFailures.has(code)) return 'DOCUMENT_PARTS_DAMAGED';
  return null;
}

function meaningfulText(markdown, type) {
  // A PDF checkpoint may already include its page label. A failed/blank page
  // must not become a successful document merely because that label exists.
  const body = type === 'pdf' ? markdown.replace(/^## Seite [1-9][0-9]*[ \t]*$/gmu, '') : markdown;
  return Boolean(body.trim());
}

function interruptedRecord(text) {
  // Only a grammatically possible, unfinished emitted JSON record may be
  // discarded after the supervisor confirms interruption. In particular a
  // complete object plus garbage is not an interrupted checkpoint write.
  if (!text.startsWith('{"schema":"datasecure-conversion-')) return false;
  let index = 1;
  const stack = [{ kind: 'object', state: 'keyOrEnd' }];
  const string = () => {
    index++;
    while (index < text.length) {
      const ch = text[index++];
      if (ch === '"') return 1;
      if (ch.charCodeAt(0) < 32) return -1;
      if (ch !== '\\') continue;
      if (index === text.length) return 0;
      const escape = text[index++];
      if ('"\\/bfnrt'.includes(escape)) continue;
      if (escape !== 'u') return -1;
      for (let digit = 0; digit < 4; digit++) {
        if (index === text.length) return 0;
        if (!/[0-9a-f]/iu.test(text[index++])) return -1;
      }
    }
    return 0;
  };
  const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
  while (index < text.length) {
    while (/[ \t\r\n]/u.test(text[index] || '') && index < text.length) index++;
    if (index === text.length) return stack.length > 0;
    const current = stack[stack.length - 1], ch = text[index];
    if (!current) return false;
    if (current.state === 'keyOrEnd' || current.state === 'key') {
      if (ch === '}' && current.state === 'keyOrEnd') { index++; stack.pop(); continue; }
      if (ch !== '"') return false;
      const state = string(); if (state !== 1) return state === 0;
      current.state = 'colon'; continue;
    }
    if (current.state === 'colon') {
      if (ch !== ':') return false;
      index++; current.state = 'value'; continue;
    }
    if (current.state === 'commaOrEnd') {
      if (ch === (current.kind === 'array' ? ']' : '}')) { index++; stack.pop(); continue; }
      if (ch !== ',') return false;
      index++; current.state = current.kind === 'array' ? 'value' : 'key'; continue;
    }
    if (current.state === 'valueOrEnd' && ch === ']') { index++; stack.pop(); continue; }
    current.state = 'commaOrEnd';
    if (ch === '{' || ch === '[') {
      if (stack.length >= 128) return false;
      index++; stack.push({ kind: ch === '{' ? 'object' : 'array', state: ch === '{' ? 'keyOrEnd' : 'valueOrEnd' }); continue;
    }
    if (ch === '"') { const state = string(); if (state !== 1) return state === 0; continue; }
    const literal = ch === 't' ? 'true' : ch === 'f' ? 'false' : ch === 'n' ? 'null' : null;
    if (literal) {
      const remaining = text.slice(index, index + literal.length);
      if (!literal.startsWith(remaining)) return false;
      if (remaining.length < literal.length) return true;
      index += literal.length; continue;
    }
    const start = index;
    while (index < text.length && /[0-9eE+.-]/u.test(text[index])) index++;
    const token = text.slice(start, index);
    if (!token || !(number.test(token) || index === text.length && number.test(`${token}0`))) return false;
  }
  return stack.length > 0;
}

class UnitAccumulator {
  constructor(type, contentOptions) {
    if (!TYPES.has(type) || contentOptions === undefined) fail();
    this.type = type;
    this.options = validateContentOptions(contentOptions);
    this.units = []; this.versions = []; this.sequence = 0;
    this.chars = 0; this.nonempty = 0; this.contacts = 0; this.imageBytes = 0; this.imagePixels = 0;
  }

  accept(frame) {
    if (!exactKeys(frame, ['schema', 'sequence', 'index', 'result']) || frame.schema !== SCHEMA ||
        frame.sequence !== this.sequence + 1 || !Number.isSafeInteger(frame.index) || frame.index < 0 ||
        frame.index >= MAX_UNITS || frame.index > this.units.length ||
        (frame.index < this.units.length && (frame.index !== this.units.length - 1 || this.versions[frame.index] >= 2))) fail();
    validateMarkdownExtractionForOptions(frame.result, this.options);
    const result = frame.result;
    if (result.source_type !== this.type ||
        Object.hasOwn(result, 'private_document_metadata') && frame.index !== 0) fail();
    const prior = this.units[frame.index];
    // Metadata belongs to the first unit and cannot silently change on its OCR
    // update. It stays private through the ordinary extraction contract.
    if (prior && JSON.stringify(prior.private_document_metadata) !== JSON.stringify(result.private_document_metadata)) fail();
    const metrics = value => {
      const images = (value?.ocr_contacts || []).filter(contact => contact.image).map(contact => contact.image);
      return { chars: value?.markdown.length || 0, nonempty: value?.markdown ? 1 : 0,
        contacts: value?.ocr_contacts?.length || 0,
        imageBytes: images.reduce((sum, image) => sum + Buffer.byteLength(image.png_base64, 'base64'), 0),
        imagePixels: images.reduce((sum, image) => sum + image.width * image.height, 0) };
    };
    const before = metrics(prior), after = metrics(result), next = {};
    for (const key of ['chars', 'nonempty', 'contacts', 'imageBytes', 'imagePixels']) next[key] = this[key] - before[key] + after[key];
    if (next.chars + Math.max(0, next.nonempty - 1) * 2 > MAX_MARKDOWN_CHARS || next.contacts > 5000 ||
        next.imageBytes > MAX_TOTAL_IMAGE_BYTES || next.imagePixels > MAX_TOTAL_IMAGE_PIXELS) fail();
    Object.assign(this, next);
    this.units[frame.index] = result;
    this.versions[frame.index] = prior ? this.versions[frame.index] + 1 : 1;
    this.sequence++;
  }

  recover(code) {
    const reason = recoveryReason(code);
    if (!reason || !this.units.some(unit => meaningfulText(unit.markdown, this.type))) return null;
    const pieces = [], contacts = [], reasons = new Set([reason]);
    let offset = 0;
    for (const unit of this.units) {
      for (const code of unit.coverage.reason_codes) reasons.add(code);
      if (!unit.markdown) continue;
      if (pieces.length) offset += 2;
      contacts.push(...(unit.ocr_contacts || []).map(contact => ({ ...contact,
        start: contact.start + offset, end: contact.end + offset })));
      pieces.push(unit.markdown); offset += unit.markdown.length;
    }
    reasons.delete('OCR_TEXT_EMPTY');
    if (!contacts.length) reasons.delete('OCR_CONTACT_VALUES_UNVERIFIED');
    return createMarkdownExtraction({ source_type: this.type, content_options: this.options,
      markdown: pieces.join('\n\n'), coverage: { status: 'incomplete', reason_codes: [...reasons].sort() },
      ...(contacts.length ? { ocr_contacts: contacts } : {}),
      ...(this.units[0]?.private_document_metadata ? { private_document_metadata: this.units[0].private_document_metadata } : {}) });
  }
}

class CheckpointStream {
  constructor(type, contentOptions) {
    this.units = new UnitAccumulator(type, contentOptions);
    this.pending = []; this.tail = null; this.tailUsed = 0; this.pendingBytes = 0;
    this.total = 0; this.poisoned = false; this.terminal = null;
  }

  push(chunk) {
    if (this.poisoned) fail();
    try {
      if (!Buffer.isBuffer(chunk) || this.terminal !== null && chunk.length) fail();
      this.total += chunk.length;
      if (this.total > MAX_TRANSPORT_BYTES) throw Object.assign(new Error('CONVERSION_OUTPUT_LIMIT'), { code: 'CONVERSION_OUTPUT_LIMIT' });
      let from = 0, end;
      while ((end = chunk.indexOf(10, from)) !== -1) {
        this.append(chunk.subarray(from, end)); this.line(); from = end + 1;
        if (this.terminal !== null && from < chunk.length) fail();
      }
      if (from < chunk.length) this.append(chunk.subarray(from));
    } catch (error) { this.poisoned = true; throw error; }
  }

  append(bytes) {
    this.pendingBytes += bytes.length;
    if (this.pendingBytes > MAX_RESPONSE_BYTES + 1024) throw Object.assign(new Error('CONVERSION_OUTPUT_LIMIT'), { code: 'CONVERSION_OUTPUT_LIMIT' });
    // Pipe packetization is not a resource budget. Bound bookkeeping even if
    // a record arrives as millions of single-byte chunks; copy each byte once
    // into fixed blocks instead of retaining one Buffer object per fragment.
    let offset = 0;
    while (offset < bytes.length) {
      if (!this.tail) this.tail = Buffer.allocUnsafe(this.pending.length ? 65536 : 4096);
      const length = Math.min(bytes.length - offset, this.tail.length - this.tailUsed);
      bytes.copy(this.tail, this.tailUsed, offset, offset + length);
      this.tailUsed += length; offset += length;
      if (this.tailUsed === this.tail.length) { this.pending.push(this.tail); this.tail = null; this.tailUsed = 0; }
    }
  }

  take() {
    const chunks = this.tail ? [...this.pending, this.tail.subarray(0, this.tailUsed)] : this.pending;
    const bytes = Buffer.concat(chunks, this.pendingBytes);
    for (const chunk of chunks) chunk.fill(0);
    this.pending = []; this.tail = null; this.tailUsed = 0; this.pendingBytes = 0;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    finally { bytes.fill(0); }
  }

  line() {
    const value = JSON.parse(this.take());
    this.accept(value);
  }

  accept(value) {
    if (this.terminal !== null) fail();
    if (value?.schema === SCHEMA) { this.units.accept(value); return; }
    if (value?.schema !== 'datasecure-conversion-response/2' ||
        !(value.ok === true && exactKeys(value, ['schema', 'ok', 'result']) ||
          value.ok === false && exactKeys(value, ['schema', 'ok', 'error_code']))) fail();
    if (value.ok) {
      validateMarkdownExtractionForOptions(value.result, this.units.options);
      if (value.result.source_type !== this.units.type) fail();
    } else if (!ERROR_VALUES.has(value.error_code)) fail();
    this.terminal = value;
  }

  response() {
    if (this.poisoned) fail();
    try {
      if (this.pendingBytes) this.line();
      if (this.terminal === null) fail();
      return this.terminal;
    } catch (error) { this.poisoned = true; throw error; }
  }

  recover(code) {
    if (this.poisoned || !recoveryReason(code)) return null;
    try {
      if (this.pendingBytes) {
        const raw = this.take();
        let value;
        try { value = JSON.parse(raw); }
        catch {
          // Only an interrupted write after a confirmed resource/timeout end
          // may leave a JSON prefix. Complete malformed records remain fatal.
          if (!['CONVERSION_TIMEOUT', 'CONVERSION_RESOURCE_LIMIT'].includes(code) ||
              !interruptedRecord(raw)) fail();
        }
        if (value !== undefined) {
          this.accept(value);
        }
      }
      // A syntactically complete terminal response still has to be an exact
      // response, even if the supervisor subsequently reports a resource end.
      if (this.terminal !== null) {
        const value = this.terminal;
        if (!value.ok && !recoveryReason(value.error_code)) return null;
      }
      return this.units.recover(code);
    } catch { this.poisoned = true; return null; }
  }
}

function createCheckpointEmitter({ type, contentOptions, write } = {}) {
  const accumulator = new UnitAccumulator(type, contentOptions);
  const output = write || (chunk => new Promise((resolve, reject) => {
    process.stdout.write(chunk, failure => failure ? reject(failure) : resolve());
  }));
  let busy = false, failed = false, size = 0;
  return async (result, index) => {
    const policyFailure = () => Object.assign(new Error('CONVERSION_POLICY_FAILED'), { code: 'CONVERSION_POLICY_FAILED' });
    if (busy || failed) throw policyFailure();
    busy = true;
    try {
      const frame = { schema: SCHEMA, sequence: accumulator.sequence + 1, index, result };
      accumulator.accept(frame);
      const bytes = Buffer.from(`${JSON.stringify(frame)}\n`);
      size += bytes.length;
      if (bytes.length > MAX_RESPONSE_BYTES + 1024 || size > MAX_TRANSPORT_BYTES - MAX_RESPONSE_BYTES) fail();
      // Await flushing; no unbounded stdout queue while pages/OCR continue.
      if (await output(bytes) === false) fail();
    // Child error normalisation must not relabel a protocol/write failure as
    // recoverable generic extraction. Prior checkpoints cannot hide this fact.
    } catch { failed = true; throw policyFailure(); }
    finally { busy = false; }
  };
}

module.exports = Object.freeze({ SCHEMA, MAX_UNITS, MAX_RESPONSE_BYTES, MAX_TRANSPORT_BYTES,
  CheckpointStream, createCheckpointEmitter, recoveryReason, meaningfulText });
