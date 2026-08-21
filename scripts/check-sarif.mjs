import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function summarizeSarif(target) {
  const files = findSarifFiles(target);
  if (files.length === 0) throw new Error('Keine SARIF-Datei gefunden.');
  const rules = new Map();
  let results = 0;
  for (const file of files) {
    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE_BYTES) throw new Error('SARIF-Datei ist zu groß.');
    const sarif = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs)) {
      throw new Error('Ungültiges SARIF-Format.');
    }
    for (const run of sarif.runs) {
      if (!Array.isArray(run.results)) continue;
      results += run.results.length;
      for (const result of run.results) {
        const ruleId = typeof result?.ruleId === 'string' && result.ruleId.length <= 200
          ? result.ruleId : 'unknown-rule';
        rules.set(ruleId, (rules.get(ruleId) || 0) + 1);
      }
    }
  }
  return { files: files.length, results, rules: Object.fromEntries([...rules].sort()) };
}

function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Aufruf: node scripts/check-sarif.mjs <Datei|Verzeichnis>');
  const summary = summarizeSarif(target);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.results > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); }
  catch (error) {
    process.stderr.write(`SARIF-Prüfung fehlgeschlagen: ${error.message}\n`);
    process.exitCode = 2;
  }
}
