'use strict';

// Shared inert diagnostic data contract. No IO, native modules, process clock,
// paths or product capabilities are needed by either product projection.
const SCHEMA = 'datasecure-conversion-timing/1';
const PREFIX = 'DATASECURE_CONVERSION_TIMING_V1 ';
// A single explicit record separator starts the frame even when vendor stderr
// left its last line unterminated. It belongs to the same fixed frame budget.
const FRAME_START = 30;
const FRAME_PREFIX = String.fromCharCode(FRAME_START) + PREFIX;
const MAX_LINE_BYTES = 2048;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_STREAM_BYTES = MAX_STDERR_BYTES + MAX_LINE_BYTES;
const MAX_DURATION_MS = 3_600_000;
const MAX_COUNT = 1_000_000;
const STAGES = Object.freeze(['runtime_init', 'model_check', 'ocr_init', 'native_extract', 'structure_ops',
  'pdf_raster', 'paint_probe', 'image_decode', 'ocr', 'refinement']);
const SOURCE_TYPES = Object.freeze(['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp']);

function ownValues(value, keys) {
  try {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
    if (names.length !== keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key) ||
        !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) return null;
    return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  } catch { return null; }
}

function validateConversionTimings(value, expectedType) {
  const data = ownValues(value, ['schema', 'source_type', 'outcome', 'worker_total_ms', 'durations_ms', 'counts']);
  if (!data || data.schema !== SCHEMA || !SOURCE_TYPES.includes(data.source_type) ||
      (expectedType !== undefined && data.source_type !== expectedType) || !['ok', 'error'].includes(data.outcome) ||
      !Number.isSafeInteger(data.worker_total_ms) || data.worker_total_ms < 0 || data.worker_total_ms > MAX_DURATION_MS) return null;
  const durations = ownValues(data.durations_ms, STAGES), counts = ownValues(data.counts, STAGES);
  if (!durations || !counts || STAGES.some(stage => !Number.isSafeInteger(durations[stage]) || durations[stage] < 0 ||
      durations[stage] > data.worker_total_ms || !Number.isSafeInteger(counts[stage]) || counts[stage] < 0 ||
      counts[stage] > MAX_COUNT || (counts[stage] === 0 && durations[stage] !== 0))) return null;
  return Object.freeze({ schema: SCHEMA, source_type: data.source_type, outcome: data.outcome,
    worker_total_ms: data.worker_total_ms, durations_ms: Object.freeze(durations), counts: Object.freeze(counts) });
}

// Stderr bytes are opaque, except for one final canonical ASCII metric line.
// This parser grants no conversion/ownership authority and returns data only
// when its caller supplies an actual matching child close (0 or 2).
function createConversionTimingStream(expectedType) {
  let candidate = '', discarded = false, candidates = 0, accepted = null, invalid = false, closed = false, completed = false, totalBytes = 0;
  let frameBytes = 0, closedFrameBytes = 0;
  // Until close, only one still-possible bounded ASCII frame may borrow the
  // fixed reserve. Invalid/duplicate/trailing data loses that allowance. At
  // close, source/outcome/canonical validation must confirm the exact frame.
  const allowance = () => {
    if (closed) return closedFrameBytes;
    if (invalid) return 0;
    if (completed) return frameBytes;
    return discarded ? 0 : candidate.length;
  };
  const exceededBudget = () => totalBytes > MAX_STREAM_BYTES || totalBytes - allowance() > MAX_STDERR_BYTES;
  function endLine() {
    if (!discarded && candidate.length >= FRAME_PREFIX.length) {
      try {
        const text = candidate.slice(FRAME_PREFIX.length);
        accepted = validateConversionTimings(JSON.parse(text), expectedType);
        // Canonical form rejects duplicate keys and alternate numeric lexemes.
        if (!accepted || JSON.stringify(accepted) !== text) invalid = true;
        else frameBytes = candidate.length + 1; // every admitted code point is ASCII; include LF
      } catch { invalid = true; }
      completed = true;
    }
    candidate = ''; discarded = false;
  }
  return Object.freeze({
    push(bytes) {
      if (closed) return;
      try {
        if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1 || !Number.isSafeInteger(bytes.length)) { invalid = true; return; }
        totalBytes += bytes.length;
        if (totalBytes > MAX_STREAM_BYTES) { invalid = true; return; }
        for (const byte of bytes) {
          if (completed) invalid = true;
          if (byte === FRAME_START) {
            candidate = String.fromCharCode(FRAME_START); discarded = false;
            continue;
          }
          if (byte === 10) { endLine(); continue; }
          if (discarded) continue;
          const position = candidate.length;
          if (position >= MAX_LINE_BYTES - 1 || byte < 32 || byte > 126 ||
              (position < FRAME_PREFIX.length && byte !== FRAME_PREFIX.charCodeAt(position))) { discarded = true; continue; }
          candidate += String.fromCharCode(byte);
          if (candidate.length === FRAME_PREFIX.length && ++candidates !== 1) invalid = true;
        }
      } catch { invalid = true; }
    },
    close(exitCode) {
      if (closed) return null; closed = true;
      const pending = Boolean(candidate.length || discarded); candidate = '';
      if (pending || invalid || !completed || candidates !== 1 || !accepted ||
          ![0, 2].includes(exitCode) || accepted.outcome !== (exitCode === 0 ? 'ok' : 'error')) return null;
      closedFrameBytes = frameBytes;
      if (exceededBudget()) return null;
      return accepted;
    },
    exceededBudget
  });
}

module.exports = Object.freeze({ SCHEMA, PREFIX, FRAME_START, FRAME_PREFIX, STAGES, SOURCE_TYPES, MAX_LINE_BYTES, MAX_STDERR_BYTES, MAX_STREAM_BYTES, MAX_DURATION_MS, MAX_COUNT,
  validateConversionTimings, createConversionTimingStream });
