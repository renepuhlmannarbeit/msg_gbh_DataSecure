import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import boundFileIo from '../plugins/data-secure/server/core/bound-file-io.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 25;

export function findSarifFiles(target) {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) throw new Error('SARIF-Ausgabe fehlt.');
  const stat = fs.statSync(resolved);
  if (stat.isFile()) return resolved.endsWith('.sarif') ? [resolved] : [];
  if (!stat.isDirectory()) throw new Error('SARIF-Ausgabe ist kein Verzeichnis.');

  const files = [];
  const pending = [resolved];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(child);
      else if (entry.isFile() && entry.name.endsWith('.sarif')) files.push(child);
      if (files.length > MAX_FILES) throw new Error('Zu viele SARIF-Dateien.');
    }
  }
  return files.sort();
}

export function summarizeSarif(target, options = {}) {
  const files = findSarifFiles(target);
  if (files.length === 0) throw new Error('Keine SARIF-Datei gefunden.');
  const rules = new Map();
  let results = 0;
  let reviewed = 0;
  const triage = options.triageFile ? JSON.parse(boundFileIo.readBoundFile(options.triageFile, { maximum: 1024 * 1024, minimum: 1 })) : null;
  if (triage && (triage.schema !== 'datasecure-codeql-triage/1' || !Array.isArray(triage.entries))) throw new Error('Ungültige SARIF-Triage.');
  const consumed = new Set();
  const hashes = new Map();
  function reviewedFinding(result) {
    if (!triage) return false;
    const location = result?.locations?.[0]?.physicalLocation;
    const uri = location?.artifactLocation?.uri;
    const fingerprint = result?.partialFingerprints;
    if (typeof uri !== 'string' || !/^[A-Za-z0-9_.\/-]+$/u.test(uri) || uri.split('/').some(part => !part || part === '.' || part === '..') ||
        !fingerprint?.primaryLocationLineHash || !fingerprint?.primaryLocationStartColumnFingerprint) return false;
    for (let index = 0; index < triage.entries.length; index++) {
      const entry = triage.entries[index];
      if (entry.rule !== result.ruleId || entry.path !== uri || typeof entry.reason !== 'string' || !entry.reason.trim() ||
          !/^[a-f0-9]{64}$/u.test(String(entry.source_sha256)) || !Array.isArray(entry.fingerprints)) continue;
      if (!hashes.has(uri)) {
        try { hashes.set(uri, crypto.createHash('sha256').update(boundFileIo.readBoundFile(path.join(options.sourceRoot || process.cwd(), ...uri.split('/')), { maximum: 4 * 1024 * 1024 }).toString('utf8').replace(/\r\n/gu, '\n')).digest('hex')); }
        catch { hashes.set(uri, null); }
      }
      if (hashes.get(uri) !== entry.source_sha256) continue;
      const item = entry.fingerprints.findIndex(value => value.line === fingerprint.primaryLocationLineHash &&
        value.column === fingerprint.primaryLocationStartColumnFingerprint);
      const key = `${index}:${item}`;
      // No same-rule/path blanket waiver and no duplicate finding waiver.
      if (item >= 0 && !consumed.has(key)) { consumed.add(key); return true; }
    }
    return false;
  }
  for (const file of files) {
    const raw = boundFileIo.readBoundFile(file, { maximum: MAX_FILE_BYTES }).toString('utf8');
    const sarif = JSON.parse(raw);
    if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
      throw new Error('Ungültiges SARIF-Format.');
    }
    for (const run of sarif.runs) {
      if (!Array.isArray(run.results) || run.invocations?.some(invocation => invocation.executionSuccessful === false)) {
        throw new Error('SARIF-Analyse ist unvollständig oder fehlgeschlagen.');
      }
      results += run.results.length;
      for (const result of run.results) {
        if (reviewedFinding(result)) reviewed++;
        const ruleId = typeof result?.ruleId === 'string' && result.ruleId.length <= 200
          ? result.ruleId : 'unknown-rule';
        rules.set(ruleId, (rules.get(ruleId) || 0) + 1);
      }
    }
  }
  return { files: files.length, results, rules: Object.fromEntries([...rules].sort()),
    ...(triage ? { reviewed, unreviewed: results - reviewed } : {}) };
}

function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Aufruf: node scripts/check-sarif.mjs <Datei|Verzeichnis>');
  if (process.argv.length > 3 && (process.argv.length !== 5 || process.argv[3] !== '--triage')) throw new Error('Ungültige SARIF-Argumente.');
  const summary = summarizeSarif(target, { triageFile: process.argv[4] });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if ((summary.unreviewed ?? summary.results) > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); }
  catch (error) {
    process.stderr.write(`SARIF-Prüfung fehlgeschlagen: ${error.message}\n`);
    process.exitCode = 2;
  }
}
