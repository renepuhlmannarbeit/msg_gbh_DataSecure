import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'native', 'pdfium', 'pdf-ocr-risk.lock.json');

function invariant(value, message) {
  if (!value) throw new Error(message);
}

export function readRiskLock() {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  invariant(lock.schema_version === 1, 'unsupported PDF/OCR risk lock');
  invariant(lock.purpose === 'bl-023.1-risk-proof-only', 'risk lock purpose drift');
  invariant(lock.release_enabled === false, 'risk proof must never release PDF');
  invariant(lock.pdf?.engine === 'pdfium' && /^[a-f0-9]{40}$/.test(lock.pdf.commit), 'PDFium pin missing');
  invariant(lock.pdf.repository === 'https://pdfium.googlesource.com/pdfium', 'PDFium must use the official source');
  invariant(lock.pdf.build?.pdf_enable_v8 === false && lock.pdf.build?.pdf_enable_xfa === false,
    'PDFium active content must be disabled');
  invariant(lock.ocr_candidate?.engine === 'tesseract' && lock.ocr_candidate?.tag === '5.5.2',
    'OCR candidate drift');
  invariant(lock.ocr_candidate?.license === 'Apache-2.0', 'OCR license inventory drift');
  invariant(/^[a-f0-9]{40}$/.test(lock.ocr_candidate?.commit || ''), 'Tesseract commit pin missing');
  invariant(/^[a-f0-9]{40}$/.test(lock.ocr_candidate?.models?.commit || ''), 'OCR model commit pin missing');
  invariant(JSON.stringify(lock.ocr_candidate.models.languages) === JSON.stringify(['deu', 'eng']),
    'OCR languages must remain German and English');
  invariant(new Set(lock.required_gates).size === lock.required_gates.length && lock.required_gates.length >= 10,
    'risk gate inventory is incomplete or duplicated');
  for (const platform of lock.platforms) {
    invariant(/^(windows|macos|linux)-(x64|arm64)$/.test(platform.id), `invalid platform ${platform.id}`);
  }
  return lock;
}

export function platformPreflight() {
  const lock = readRiskLock();
  const platform = lock.platforms.find((candidate) => candidate.os === process.platform && candidate.arch === process.arch);
  return {
    schema_version: 1,
    story: 'BL-023.1',
    evidence_kind: 'platform-preflight-not-product-proof',
    platform: platform?.id || `${process.platform}-${process.arch}`,
    os_release: os.release(),
    node: process.version,
    pins_valid: true,
    product_pdf_gate: 'PDF_COVERAGE_UNVERIFIED',
    release_decision: 'no_go',
    passed_gates: [],
    open_gates: lock.required_gates
  };
}

const mode = process.argv[2] || '--verify-lock';
if (mode === '--verify-lock') {
  const lock = readRiskLock();
  console.log(JSON.stringify({
    schema_version: lock.schema_version,
    purpose: lock.purpose,
    release_enabled: lock.release_enabled,
    pdfium_commit: lock.pdf.commit,
    tesseract_commit: lock.ocr_candidate.commit,
    platform_count: lock.platforms.length,
    required_gate_count: lock.required_gates.length
  }, null, 2));
} else if (mode === '--platform-preflight') {
  console.log(JSON.stringify(platformPreflight(), null, 2));
} else {
  throw new Error('use --verify-lock or --platform-preflight');
}
