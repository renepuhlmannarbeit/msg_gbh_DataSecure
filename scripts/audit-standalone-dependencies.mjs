#!/usr/bin/env node
// Manual supply-chain check for the JavaScript packages that are shipped in a
// Standalone package (RC178 review R-023). The four pilot lockfiles define the
// packaged conversion runtime; the root lockfile holds development and test
// dependencies only and is reported separately without failing the check.
//
// The command queries the npm advisory service with the lockfiles as they are
// and installs nothing. It needs network access and is therefore not part of
// the offline product suite. Rust crates and the pinned Node.js runtime are
// outside its scope.
import childProcess from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shipped = ['native/markdown/pilot', 'native/ocr/pilot', 'native/pdfjs/pilot', 'native/graphics/pilot'];

function audit(relative) {
  const result = childProcess.spawnSync('npm', ['audit', '--package-lock-only', '--json'], {
    cwd: path.join(root, relative), encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true,
    maxBuffer: 32 * 1024 * 1024, timeout: 120_000
  });
  let report;
  try { report = JSON.parse(result.stdout); } catch { return { relative, error: 'AUDIT_OUTPUT_INVALID' }; }
  if (report.error) return { relative, error: String(report.error.code || 'AUDIT_FAILED') };
  const counts = report.metadata?.vulnerabilities;
  if (!counts || !Number.isSafeInteger(counts.total)) return { relative, error: 'AUDIT_OUTPUT_INVALID' };
  return { relative, total: counts.total, critical: counts.critical, high: counts.high, moderate: counts.moderate, low: counts.low,
    packages: Object.keys(report.vulnerabilities || {}).sort() };
}

const results = shipped.map(audit);
const development = audit('.');
for (const result of [...results, { ...development, relative: '. (Entwicklung, Tests und Cowork-Statusansicht; nicht im Standalone-Paket)' }]) {
  console.log(result.error ? `${result.relative}: ${result.error}`
    : `${result.relative}: ${result.total} Befunde (kritisch ${result.critical}, hoch ${result.high}, mittel ${result.moderate}, niedrig ${result.low})` +
      (result.packages.length ? ` – ${result.packages.join(', ')}` : ''));
}
const failed = results.some((result) => result.error || result.total > 0);
console.log(failed ? 'STANDALONE DEPENDENCY AUDIT: FAIL' : 'STANDALONE DEPENDENCY AUDIT: PASS (paketierte JavaScript-Abhängigkeiten ohne bekannten Befund)');
process.exit(failed ? 1 : 0);
