#!/usr/bin/env node
// Manual supply-chain check for the dependencies that are shipped in a
// Standalone package (RC178 review R-023). The four pilot lockfiles define the
// packaged conversion runtime; the root lockfile holds development and test
// dependencies only and is reported separately without failing the check.
// The locked Rust crates of the shell are checked with cargo-audit against
// the RustSec advisory database.
//
// The command queries the npm advisory service with the lockfiles as they are
// and lets cargo-audit fetch the advisory database; it installs nothing. It
// needs network access and is therefore not part of the offline product
// suite. Without an installed cargo-audit the crates count as not checked
// and the check fails, unless --skip-rust says so on purpose. The pinned
// Node.js runtime is outside its scope.
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

// Advisories fail the check. Unmaintained and unsound crates are listed: they
// have no fixed release to move to, or concern APIs of one platform.
function auditRust() {
  const lock = 'apps/datasecure-standalone/tauri-contract/Cargo.lock';
  const result = childProcess.spawnSync('cargo', ['audit', '--json', '--file', lock], {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true,
    maxBuffer: 32 * 1024 * 1024, timeout: 300_000
  });
  let report;
  try { report = JSON.parse(result.stdout); } catch {
    return { error: /no such (?:sub)?command/u.test(String(result.stderr)) || result.error ? 'RUST_AUDIT_TOOL_MISSING' : 'AUDIT_OUTPUT_INVALID' };
  }
  const found = report.vulnerabilities?.list;
  if (!Array.isArray(found) || !Number.isSafeInteger(report.lockfile?.['dependency-count'])) return { error: 'AUDIT_OUTPUT_INVALID' };
  const crate = (entry) => `${entry.package?.name} ${entry.package?.version} (${entry.advisory?.id})`;
  return { crates: report.lockfile['dependency-count'], advisories: found.map(crate).sort(),
    warnings: Object.values(report.warnings || {}).flat().map(crate).sort() };
}

const skipRust = process.argv.includes('--skip-rust');
const results = shipped.map(audit);
const development = audit('.');
for (const result of [...results, { ...development, relative: '. (Entwicklung, Tests und Cowork-Statusansicht; nicht im Standalone-Paket)' }]) {
  console.log(result.error ? `${result.relative}: ${result.error}`
    : `${result.relative}: ${result.total} Befunde (kritisch ${result.critical}, hoch ${result.high}, mittel ${result.moderate}, niedrig ${result.low})` +
      (result.packages.length ? ` – ${result.packages.join(', ')}` : ''));
}
const rust = skipRust ? null : auditRust();
if (skipRust) console.log('Rust-Crates der Hülle: NICHT GEPRÜFT (--skip-rust)');
else if (rust.error) console.log(`Rust-Crates der Hülle: ${rust.error}${rust.error === 'RUST_AUDIT_TOOL_MISSING' ? ' – cargo-audit ist nicht installiert; die Crates sind nicht geprüft' : ''}`);
else {
  console.log(`Rust-Crates der Hülle: ${rust.crates} Crates, ${rust.advisories.length} Befunde${rust.advisories.length ? ` – ${rust.advisories.join(', ')}` : ''}`);
  if (rust.warnings.length) console.log(`Rust-Crates der Hülle: ${rust.warnings.length} Hinweise, keine gemeldete Schwachstelle (nicht gepflegt oder unsound) – ${rust.warnings.join(', ')}`);
}
const failed = results.some((result) => result.error || result.total > 0) || Boolean(rust && (rust.error || rust.advisories.length));
console.log(failed ? 'STANDALONE DEPENDENCY AUDIT: FAIL'
  : `STANDALONE DEPENDENCY AUDIT: PASS (paketierte JavaScript-Abhängigkeiten${skipRust ? '' : ' und Rust-Crates'} ohne bekannten Befund${skipRust ? '; Rust-Crates nicht geprüft' : ''})`);
process.exit(failed ? 1 : 0);
