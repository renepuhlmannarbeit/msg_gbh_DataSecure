'use strict';

const path = require('path');
const crypto = require('crypto');
const { publishMarkdownArtifact } = require('./markdown-store');
const { validateMarkdownExtraction, createMarkdownExtraction } = require('./markdown-contract');
const supportTrace = require('../gateway/support-trace');
const { ERROR_CODES, LIFECYCLE_ERROR_CODES } = require('../core/conversion-worker-contract');
const TRACE_ERRORS = new Set([...ERROR_CODES, ...LIFECYCLE_ERROR_CODES, 'REQUEST_CANCELLED', 'NONE']);

function conversionTrace() {
  const startedAt = Date.now();
  let traceId;
  return (event, outcome, cause) => {
    // Logging (including enablement, correlation and error-code access) must
    // neither fail a conversion nor replace its original exception. Never pass
    // a source-derived string or free-form exception to the trace sink.
    try {
      if (!supportTrace.enabled()) return;
      traceId ||= supportTrace.newTraceId();
      const candidate = cause === undefined ? 'NONE' : cause?.code;
      supportTrace.recordSupportTrace({ trace_id: traceId, product_channel: 'standalone',
        event, method: 'unknown', operation: 'standalone_batch', outcome,
        duration_ms: Date.now() - startedAt,
        error_code: TRACE_ERRORS.has(candidate) ? candidate : 'INTERNAL_FAILURE' });
    } catch { /* Optional support diagnostics never change product execution. */ }
  };
}

// Shared batch intake owns the immutable private bytes. Never re-open the
// original selection, or accept an arbitrary path passed by the caller.
async function convertNext(_profile, deps = {}) {
  const trace = conversionTrace();
  trace('converter_started', 'progress');
  const entry = deps.inputQueue?.length === 1 ? deps.inputQueue[0] : null;
  const bytes = entry?.private_bytes;
  if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/u.test(String(entry.expected_sha256 || '')) ||
      crypto.createHash('sha256').update(bytes).digest('hex') !== entry.expected_sha256) {
    const error = new Error('BATCH_SNAPSHOT_CHANGED'); error.code = 'BATCH_SNAPSHOT_CHANGED';
    trace('converter_stopped', 'stopped', error);
    throw error;
  }
  try {
    const convert = deps.convertBuffer || require('./conversion-worker').convertBuffer;
    if (deps.onClaimed) await deps.onClaimed();
    let extraction = await convert(bytes, path.extname(String(entry.name || '')).toLowerCase(), {
      signal: deps.signal, timeoutMs: deps.timeoutMs,
      ...(['.pdf', '.pptx'].includes(path.extname(String(entry.name || '')).toLowerCase())
        ? { passiveObjects: true } : {})
    });
    validateMarkdownExtraction(extraction);
    // "ok" confirms the closed coverage contract, not complete extraction.
    // The existing trace schema carries no quality fields: exact grades and
    // reason codes remain in the artifact, journal and local run overview.
    trace('coverage_checked', 'ok');
    if (deps.onExtracted) await deps.onExtracted({ source_type: extraction.source_type });
    if (deps.ocrContactReview === true && extraction.ocr_contacts?.length) {
      if (typeof deps.prepareOcrContacts !== 'function') throw Object.assign(new Error('LOCAL_REVIEW_DEFERRED'), { code: 'LOCAL_REVIEW_DEFERRED' });
      const markdown = await deps.prepareOcrContacts({ original_text: extraction.markdown, contacts: extraction.ocr_contacts,
        source_type: extraction.source_type, processing_mode: 'markdown-only' });
      extraction = createMarkdownExtraction({ source_type: extraction.source_type,
        markdown: `${markdown}\n\n> OCR-Kontaktwerte wurden lokal bestätigt oder korrigiert. Übrige OCR-Inhalte bleiben ungeprüft. Nicht anonymisiert: enthält Originalinhalte.`,
        coverage: { status: extraction.coverage.status,
          reason_codes: extraction.coverage.reason_codes.filter(code => code !== 'OCR_CONTACT_VALUES_UNVERIFIED') } });
    }
    if (deps.signal?.aborted) { const error = new Error('REQUEST_CANCELLED'); error.code = 'REQUEST_CANCELLED'; throw error; }
    const result = await publishMarkdownArtifact(extraction, deps.artifactId, deps);
    trace('converter_completed', 'ok');
    return { ok: true, ...result, processing_mode: 'markdown-only', anonymized: false };
  } catch (cause) {
    trace('converter_stopped', 'stopped', cause);
    throw cause;
  } finally { bytes.fill(0); }
}

module.exports = { convertNext };
