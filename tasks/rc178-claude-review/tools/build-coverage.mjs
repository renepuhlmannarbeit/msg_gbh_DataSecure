#!/usr/bin/env node
// Erzeugt tasks/rc178-claude-review/ABDECKUNG.tsv aus dem eingefrorenen Checkout.
//
// Grenzen (bewusst offengelegt):
// - Kein vollwertiger AST: Im Repository ist kein JavaScript-/Rust-Parser als
//   Abhängigkeit vorhanden, und für den Review wurde keiner nachgeladen. Die
//   Symbole werden zeilenbasiert per Muster erkannt; Funktionsenden per
//   Klammerzählung. Anonyme Callbacks und einzeilige Inline-Funktionen
//   erscheinen deshalb nur innerhalb ihrer umgebenden Einheit.
// - Aufrufer- und Testspalten sind mechanische Bezeichnertreffer und kein
//   Aufrufgraph. Das Urteil (Status, Befund) kommt aus coverage-status.json,
//   das beim Lesen gepflegt wurde.
//
// Aufruf: node tasks/rc178-claude-review/tools/build-coverage.mjs <commit>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const commit = process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
const statusFile = path.join(here, 'coverage-status.json');
const review = JSON.parse(fs.readFileSync(statusFile, 'utf8'));

const tracked = execFileSync('git', ['ls-files'], { cwd: root, maxBuffer: 64 << 20 })
  .toString().split('\n').filter(Boolean);

const { collectStandaloneRuntime } = await import(new URL('../../../scripts/lib/standalone-runtime-projection.mjs', import.meta.url));
const { SOURCE_INPUT_FILES } = await import(new URL('../../../scripts/lib/standalone-build-fingerprint.mjs', import.meta.url));
const serverRoot = path.join(root, 'plugins/data-secure/server');
const projected = new Set();
for (const file of collectStandaloneRuntime(serverRoot, 'windows-x64')) {
  if (!file.source) continue;
  projected.add(path.relative(root, file.source).split(path.sep).join('/'));
}

const unitFiles = new Set();
const groupRows = [];
const add = (file) => { if (tracked.includes(file)) unitFiles.add(file); };
for (const file of projected) if (/\.(?:c?js)$/u.test(file)) add(file);
for (const file of tracked) {
  if (/^apps\/datasecure-standalone\/(?:frontend|runtime-adapters)\/.*\.js$/u.test(file)) add(file);
  if (/^apps\/datasecure-standalone\/tauri-contract\/(?:src\/.*\.rs|build\.rs)$/u.test(file)) add(file);
}
for (const file of SOURCE_INPUT_FILES) if (/\.(?:m?js|c|cc|cpp|h)$/u.test(file)) add(file);

const claimed = new Set();
function group(id, pattern, dimension, status, remark) {
  const files = tracked.filter((file) => pattern.test(file) && !unitFiles.has(file) && !claimed.has(file));
  for (const file of files) claimed.add(file);
  if (files.length) groupRows.push({ id, files, dimension, status, remark });
}
group('G-FRONTEND-STATIC', /^apps\/datasecure-standalone\/frontend\/.*\.(?:html|css|woff2|txt)$/u, 'Oberfläche, UX und Accessibility', null, 'HTML/CSS/Schrift; je Datei im Frontend-Review gelesen');
group('G-TAURI-CONFIG', /^apps\/datasecure-standalone\/tauri-contract\/(?!src\/|gen\/|build\.rs)/u, 'Architektur und Plattform', null, 'Konfiguration, Capabilities, Permissions, Icons, Lockfile');
group('G-TAURI-GEN', /^apps\/datasecure-standalone\/tauri-contract\/gen\//u, 'Abhängigkeiten, CI und Lieferkette', 'AUSGENOMMEN', 'Von Tauri generierte Schemas; unverändert, Integration über capabilities geprüft');
group('G-PROJECTED-DATA', new RegExp(`^(?:${[...projected].filter((f) => !/\.(?:c?js)$/u.test(f)).map((f) => f.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|') || '$^'})$`, 'u'), 'Abhängigkeiten, CI und Lieferkette', null, 'Projizierte Datendateien und native Sandbox-Binärdateien');
group('G-WORKFLOWS', /^\.github\/workflows\//u, 'Abhängigkeiten, CI und Lieferkette', null, 'Workflows; im Lieferketten-Review gelesen');
group('G-NATIVE-PILOTS', /^native\//u, 'Abhängigkeiten, CI und Lieferkette', null, 'Native Quellen, Laufzeitverträge und Pilot-Lockfiles außerhalb der Einzelerfassung');
group('G-SCRIPTS-OTHER', /^scripts\//u, 'Abhängigkeiten, CI und Lieferkette', null, 'Übrige Build-/Hilfsskripte außerhalb des Standalone-Fingerprints');
group('G-TESTS', /^tests\/(?!legacy\/)/u, 'Tests und Orakel', null, 'Testdateien; Stichprobe im Testorakel-Review');
group('G-TESTS-LEGACY', /^tests\/legacy\//u, 'Tests und Orakel', 'AUSGENOMMEN', 'Als Legacy abgelegt; nicht Teil der Produktsuite');
group('G-COWORK-SERVER', /^plugins\/data-secure\/server\/(?!ocr-runtime\/)/u, 'Architektur und Plattform', 'AUSGENOMMEN', 'Servermodule außerhalb der Standalone-Projektion (Cowork-Host, Companion, MCP, SEA-Proben); Grenze über FORBIDDEN-Muster der Projektion geprüft');
group('G-OCR-RUNTIME-VENDORED', /^plugins\/data-secure\/server\/ocr-runtime\//u, 'Abhängigkeiten, CI und Lieferkette', 'AUSGENOMMEN', 'Vendorte OCR-Laufzeit des Plugins; von der Standalone-Projektion ausgeschlossen');
group('G-PLUGIN-OTHER', /^plugins\//u, 'Architektur und Plattform', 'AUSGENOMMEN', 'Plugin-Skills, Assets und Skripte; Cowork-Lieferumfang unverändert');
group('G-DOCS', /^(?:docs\/|README\.md|CLAUDE\.md|SECURITY\.md|THIRD_PARTY_NOTICES\.md|apps\/datasecure-standalone\/.*\.md)/u, 'Dokumentation und Nachvollziehbarkeit', null, 'Dokumente; aktive Kanon- und Anwenderdokumente im Doku-Review gelesen, Archiv nur als Historie');
group('G-REST', /./u, 'Dokumentation und Nachvollziehbarkeit', 'AUSGENOMMEN', 'Übrige Dateien (Aufträge, Benchmarks, Evals, UI-Statuskarte, Root-Metadaten)');

function dimensionOf(file) {
  if (/tauri-contract\//u.test(file)) return 'Architektur und Plattform';
  if (/frontend\//u.test(file)) return 'Oberfläche, UX und Accessibility';
  if (/server\/privacy\/|pseudonym|identity-ledger|confidential|anonymiz|mapping|review|person/u.test(file)) return 'Anonymisierung und Zuordnungen';
  if (/ooxml|xlsx|word-|office-|pdf-|ocr|markdown|content-graph|xml-reader|zip-reader|document-parser|tiff|ccitt|png-|emfplus|drawing|presentation|csv|text-source/u.test(file)) return 'Fachlichkeit und Formatqualität';
  if (/batch|journal|lock|lease|executor|worker|orchestrator|recovery|checkpoint|sidecar|ipc|history|retention/u.test(file)) return 'Nebenläufigkeit, Zustandsmodell und Betrieb';
  if (/bound-file|private|sandbox|network-deny|ownership|diagnos|validator|preflight|resource-limits|safe-/u.test(file)) return 'Datenschutz und Sicherheitsgrenzen';
  if (/^scripts\/|^native\//u.test(file)) return 'Abhängigkeiten, CI und Lieferkette';
  return 'Implementierung und Wartbarkeit';
}
function platformOf(file) {
  if (/macos|darwin/iu.test(file)) return 'macOS arm64/x64';
  if (/windows|win32/iu.test(file)) return 'Windows x64';
  if (/posix|linux/iu.test(file)) return 'POSIX (macOS/Linux)';
  return 'alle Standalone-Ziele';
}

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'try', 'typeof', 'new', 'await', 'with', 'sizeof', 'defined']);
const jsPatterns = [
  [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/u, 'function'],
  [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/u, 'arrow'],
  [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/u, 'function'],
  [/^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/u, 'class'],
  [/^\s+(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?(#?[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/u, 'method']
];
const rustPatterns = [
  [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/u, 'fn'],
  [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/u, 'type'],
  [/^\s*impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?([A-Za-z_]\w*)/u, 'impl']
];
const cPatterns = [
  [/^(?:static\s+|extern\s+|inline\s+)*[A-Za-z_][\w\s\*:<>,&]*?\b([A-Za-z_]\w*)\s*\([^;{]*\)\s*(?:const\s*)?\{?\s*$/u, 'function']
];

function extentOf(lines, start) {
  let depth = 0; let opened = false;
  for (let index = start; index < Math.min(lines.length, start + 1500); index += 1) {
    for (const char of lines[index]) {
      if (char === '{') { depth += 1; opened = true; }
      else if (char === '}') depth -= 1;
    }
    if (opened && depth <= 0) return index;
    if (!opened && index > start + 6) return start;
  }
  return start;
}

const units = [];
const tokensByFile = new Map();
function tokens(file) {
  if (!tokensByFile.has(file)) {
    let text = '';
    try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch { /* binary or missing */ }
    tokensByFile.set(file, new Set(text.match(/[A-Za-z_$][\w$]*/gu) || []));
  }
  return tokensByFile.get(file);
}

for (const file of [...unitFiles].sort()) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const lines = text.split('\n');
  const patterns = /\.rs$/u.test(file) ? rustPatterns : /\.(?:c|cc|cpp|h)$/u.test(file) ? cPatterns : jsPatterns;
  let inTests = false;
  let found = 0;
  lines.forEach((line, index) => {
    if (/\.rs$/u.test(file) && /^\s*mod\s+tests\b|#\[cfg\(test\)\]/u.test(line)) inTests = true;
    for (const [pattern, kind] of patterns) {
      const match = pattern.exec(line);
      if (!match || KEYWORDS.has(match[1])) continue;
      const end = extentOf(lines, index);
      const body = lines.slice(index, end + 1).join('\n');
      units.push({
        file, line: index + 1, symbol: match[1], kind: inTests ? `${kind} (Rust-Testmodul)` : kind, lines: end - index + 1,
        hasCatch: /\bcatch\b|\.catch\(|\bErr\(|\?;|map_err/u.test(body), hasFinally: /\bfinally\b|impl Drop|\bdrop\(/u.test(body),
        io: /\bfs\.|child_process|spawn|std::fs|File::|OpenOptions|Command::|net\.|process\.(?:exit|kill|send)|worker_threads/u.test(body)
      });
      found += 1;
      break;
    }
  });
  if (!found) units.push({ file, line: 1, symbol: '(Moduldatei ohne erkannte benannte Einheit)', kind: 'module', lines: lines.length, hasCatch: /\bcatch\b/u.test(text), hasFinally: /\bfinally\b/u.test(text), io: false });
}

const scopeFiles = [...unitFiles];
const testFiles = tracked.filter((file) => /^tests\/(?!legacy\/).*\.(?:c?m?js)$/u.test(file));
const definedIn = new Map();
for (const unit of units) {
  if (!definedIn.has(unit.symbol)) definedIn.set(unit.symbol, new Set());
  definedIn.get(unit.symbol).add(unit.file);
}
function referencing(files, symbol, except) {
  const hits = [];
  const name = symbol.replace(/^#/u, '');
  for (const file of files) if (file !== except && tokens(file).has(name)) hits.push(file);
  return hits;
}

const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/gu, ' ').trim() || '-';
const header = ['id', 'commit', 'pfad', 'zeile', 'symbol_oder_grenze', 'dimension', 'plattform_zweck', 'zweck_aufrufer', 'eingaben_vertrauen', 'zustand_nebenwirkungen', 'fehler_cleanup', 'invariante', 'test_oder_evidenz', 'befund_ids', 'status', 'bemerkung'];
const rows = [header.join('\t')];
const counts = {};
const byDimension = {};
const seenIds = new Map();
const short = (file) => file.replace(/^plugins\/data-secure\/server\//u, 'srv/').replace(/^apps\/datasecure-standalone\//u, 'app/');

for (const unit of units) {
  const fileReview = review.files[unit.file] || {};
  const symbolReview = (review.symbols[unit.file] || {})[unit.symbol] || {};
  // Rust test modules were not read by any review, whatever the file status.
  const rustTest = unit.kind.includes('Rust-Testmodul') && !symbolReview.status;
  const status = rustTest ? 'OFFEN' : symbolReview.status || fileReview.symbolStatus || 'OFFEN';
  const callers = referencing(scopeFiles, unit.symbol, unit.file);
  const tests = referencing(testFiles, unit.symbol, null);
  const sameFile = (fs.readFileSync(path.join(root, unit.file), 'utf8').match(new RegExp(`(?<![\\w$])${unit.symbol.replace(/[#$]/gu, '\\$&')}(?![\\w$])`, 'gu')) || []).length - 1;
  let id = `${short(unit.file)}#${unit.symbol}`;
  const seen = seenIds.get(id) || 0; seenIds.set(id, seen + 1);
  if (seen) id = `${id}@${unit.line}`;
  const dimension = symbolReview.dimension || fileReview.dimension || dimensionOf(unit.file);
  rows.push([
    id, commit, unit.file, unit.line, `${unit.kind} ${unit.symbol} (${unit.lines} Z.)`, dimension, platformOf(unit.file),
    symbolReview.purpose || `mechanisch: ${sameFile} weitere Treffer in der Datei; ${callers.length} andere Dateien im Standalone-Umfang${callers.length ? ` (z. B. ${callers.slice(0, 3).map(short).join(', ')})` : ''}`,
    symbolReview.trust || fileReview.trust || 'nicht einzeln beurteilt',
    symbolReview.effects || (unit.io ? 'mechanisch: Datei-/Prozess-/IPC-Zugriff im Körper erkannt' : 'mechanisch: kein Datei-/Prozesszugriff im Körper erkannt'),
    symbolReview.errors || `mechanisch: Fehlerpfad ${unit.hasCatch ? 'vorhanden' : 'nicht erkannt'}; Cleanup ${unit.hasFinally ? 'vorhanden' : 'nicht erkannt'}`,
    symbolReview.invariant || fileReview.invariant || '',
    symbolReview.evidence || (tests.length ? `mechanisch: Bezeichner in ${tests.length} Testdatei(en), z. B. ${tests.slice(0, 3).join(', ')}` : 'mechanisch: kein Bezeichnertreffer in tests/'),
    (rustTest ? [] : symbolReview.findings || fileReview.findings || []).join(','), status,
    rustTest ? 'Rust-Testmodul; im Review nicht gelesen' : symbolReview.remark || fileReview.remark || ''
  ].map(clean).join('\t'));
  counts[status] = (counts[status] || 0) + 1;
  byDimension[dimension] ||= {};
  byDimension[dimension][status] = (byDimension[dimension][status] || 0) + 1;
}
for (const row of groupRows) {
  const groupReview = review.groups[row.id] || {};
  const status = groupReview.status || row.status || 'OFFEN';
  rows.push([
    row.id, commit, `${row.files.length} Dateien, z. B. ${row.files.slice(0, 3).join(', ')}`, '', `Gruppe ${row.id}`, row.dimension, 'siehe Bemerkung',
    groupReview.purpose || '', groupReview.trust || '', groupReview.effects || '', groupReview.errors || '', groupReview.invariant || '',
    groupReview.evidence || '', (groupReview.findings || []).join(','), status, groupReview.remark || row.remark
  ].map(clean).join('\t'));
  counts[status] = (counts[status] || 0) + 1;
  byDimension[row.dimension] ||= {};
  byDimension[row.dimension][status] = (byDimension[row.dimension][status] || 0) + 1;
}
fs.writeFileSync(path.join(here, '..', 'ABDECKUNG.tsv'), `${rows.join('\n')}\n`);
const unknownFiles = Object.keys(review.files).filter((file) => !unitFiles.has(file));
console.log(JSON.stringify({ commit, unitFiles: unitFiles.size, units: units.length, groups: groupRows.length, counts, byDimension, unknownFiles }, null, 2));
