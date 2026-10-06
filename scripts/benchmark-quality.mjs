import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { generateQualityCorpus } from './generate-quality-corpus.mjs';
import { writeStandaloneRuntime, collectStandaloneRuntime } from './lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime, collectConversionRuntime } from './lib/standalone-conversion-runtime.mjs';
import { removePackageSmokeScope } from '../tests/helpers/standalone-package-scope.mjs';
const require = createRequire(import.meta.url);
const { evaluateQuality, summarizeQuality, bindReference, renderedText, tokens, qualityHasFindings } = require('../benchmarks/evaluate-quality');
const repo = path.resolve(import.meta.dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const semanticWords = value => tokens(value).words.map(word => word.value).join(' ');
const evaluationFiles = ['benchmarks/quality-reference.js', 'benchmarks/evaluate-quality.js',
  'scripts/generate-quality-corpus.mjs', 'scripts/benchmark-quality.mjs',
  'scripts/lib/standalone-runtime-projection.mjs', 'scripts/lib/standalone-conversion-runtime.mjs', 'package.json'];
export function qualitySourceIdentity(target) {
  const digest = crypto.createHash('sha256');
  for (const { relative, bytes } of collectStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), target)) {
    digest.update(relative).update('\0').update(bytes).update('\0');
  }
  const conversion = crypto.createHash('sha256');
  // Bind the actual pinned Node, OCR models/addon and PDF.js bytes as well as
  // the JS source. A report from different OCR weights must never stay current.
  for (const { relative, bytes } of collectConversionRuntime(repo, target)) {
    conversion.update(relative).update('\0').update(bytes).update('\0');
  }
  return { runtime_sha256: digest.digest('hex'), conversion_runtime_sha256: conversion.digest('hex'),
    evaluation_sha256: Object.fromEntries(evaluationFiles
    .map(file => [file, hash(fs.readFileSync(path.join(repo, ...file.split('/'))))])) };
}
const csvCell = value => {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
const md = value => String(value ?? '').replace(/[|<>`\r\n]/gu, ' ').replaceAll('*', '\\*');

export function writeQualityReport(directory, report) {
  if (fs.existsSync(directory)) throw new Error('QUALITY_REPORT_DESTINATION_EXISTS');
  fs.mkdirSync(directory);
  const rows = report.results.flatMap(result => result.findings);
  const header = ['Datei', 'Stufe', 'Code', 'Fundstelle', 'Start', 'Ende', 'Erwartet', 'Verblieben', 'Beobachtet', 'Grund', 'Anzahl'];
  fs.writeFileSync(path.join(directory, 'QUALITAET.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'BEFUNDE.csv'), '\ufeff' + [header,
    ...rows.map(item => [item.file, item.stage, item.code, item.location, item.start, item.end,
      item.expected, item.remaining, item.observed, item.reason, item.count])].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n', { flag: 'wx' });
  const summary = report.summary;
  fs.writeFileSync(path.join(directory, 'QUALITAET.md'), [
    '# Lokaler Qualitätsbericht', '',
    'Vertraulicher Engineering-Bericht mit synthetischen Quellwerten. Kein Supportlog, keine allgemeine Anonymitätsfreigabe.', '',
    `Produktversion: ${md(report.version)} · Ziel: ${md(report.target)} · Referenz-SHA-256: ${report.reference_sha256}`, '',
    `Dokumentvarianten: ${summary.documents}; logische Fälle: ${summary.logical_documents}. Menschliche Referenz-Doppelprüfung: **NOT_RUN**.`,
    'Nachprüfung: synthetische, referenzgebundene Entscheidungen je Fundstelle; keine menschliche E1/E2/E3-Evidenz oder Messung tatsächlicher UI-Klicks.',
    `OCR-Kontaktprüfung: ${report.synthetic_review?.contact_confirmations || 0} unveränderte Bestätigungen und ${report.synthetic_review?.contact_corrections || 0} explizite Referenzkorrekturen vor der Anonymisierung. Diese Korrekturen stammen ausschließlich aus der synthetischen Referenz, nicht aus dem Produktdetektor.`,
    `Rohe Extraktion: ${summary.extraction_changed_entities} geänderte Entitätswerte; tatsächlicher roher Privacy-Eingang: ${summary.raw_privacy_extraction?.changed_entities || 0}; Privacy-Eingang nach lokaler Kontaktentscheidung: ${summary.privacy_extraction?.changed_entities || 0}. Rohfehler bleiben Befunde und halten das unveränderte Qualitätsgate rot.`,
    'Automatikwerte sind getrennt ausgewiesene Einpass-Core-Entwürfe, NICHT immer vom Produkt freigegebene Ausgaben. Tatsächliche automatische Veröffentlichungen stehen je Datei in automatic_publication.',
    'Detektorspannen sind eine zusätzliche Probe, nicht der Nachweis einer tatsächlichen Veröffentlichung.', '',
    '| Stufe | Bewertete Dokumente | Nicht bewertbar | Dokumente mit bekannten Restangaben | Verlorene Fachanker | Geänderte/verlorene Fachwörter |',
    '|---|---:|---:|---:|---:|---:|',
    ...['automatic', 'final'].map(stage => { const value = summary.stages[stage]; return `| ${stage} | ${value.evaluated_documents} | ${value.unevaluated_documents} | ${value.documents_with_known_leaks} | ${value.lost_preservation_controls} | ${value.lost_factual_words} |`; }), '',
    `Gezielte Pflichtentfernung nach DS-012: ${summary.stages.final.required_privacy_words_removed} Anredenwörter entfernt; ` +
      `${summary.stages.final.retained_privacy_context_occurrences} unzulässig erhaltene Anreden und ` +
      `${summary.stages.final.unassessed_privacy_context_occurrences} nicht bewertbare Anreden. ` +
      'Diese fundstellengebundenen Datenschutzentfernungen sind getrennt vom Sachwortverlust; akademische Titel und sonstige Anredenwörter bleiben Sachinhalt.', '',
    'OCR-Metriken: CER/WER auf der präsentationsnormalisierten Wortfolge, nicht auf Originalpixeln. Unsichere Referenzausrichtung verlangt Sichtprüfung. Fehlende/gestoppte/vertagte Ausgaben werden niemals als fehlerfrei gezählt.', '',
    'Die lokalen Gegenprüfungsdateien unter GEGENPRUEFUNG enthalten Extraktion, unveröffentlichten Core-Entwurf und tatsächlich freigegebene Ausgabe, sofern vorhanden. Zuordnung je Datei: QUALITAET.json.', '',
    '## Konkrete Befunde', '',
    '| Datei mit Endung | Stufe | Code | Fundstelle | Erwartet / verblieben / Grund |',
    '|---|---|---|---|---|',
    ...rows.map(item => `| ${md(item.file)} | ${md(item.stage)} | ${md(item.code)} | ${md(item.location)} ${item.start ?? ''}:${item.end ?? ''} | ${md(item.expected || '')} / ${md(item.remaining || item.observed || item.reason || item.count || '')} |`), '',
    'Alle Befunde und Strata nach Format, OCR-Variante, Entwicklungs-/Abnahmeteil und Entitätsart: QUALITAET.json. CSV: BEFUNDE.csv.', '',
    'Die Referenz ist vor der Ausführung erzeugt/gehasht und stammt nicht aus der Erkennung. Der reservierte Teil ist kein nachgewiesen verblindeter menschlicher Praxistest.'
  ].join('\n') + '\n', { flag: 'wx' });
}

export function reviewChoice(sample, draft, item) {
  if (!Number.isInteger(item.original_start) || !Number.isInteger(item.original_end) || item.original_start < 0 ||
      item.original_end <= item.original_start || item.original_end > draft.original_text.length) return null;
  const bound = bindReference(sample, draft.original_text);
  if (!bound.aligned) return null;
  const start = renderedText(draft.original_text.slice(0, item.original_start)).length;
  const end = renderedText(draft.original_text.slice(0, item.original_end)).length;
  const contains = range => range.exact && range.actual_start <= start && range.actual_end >= end;
  const expected = bound.entities.filter(contains);
  const preserved = bound.preserve.some(contains);
  if (expected.length && preserved) return null; // conflicting local semantics need a real human
  if (expected.length && expected.every(entity => entity.type === 'ORGANIZATION')) return 'redact_organization';
  if (expected.length && expected.every(entity => entity.type === 'PERSON')) return 'redact';
  if (preserved) return 'keep';
  return null; // Never blanket-keep or blanket-redact an unannotated hypothesis.
}

export function contactReviewChoice(sample, draft, item) {
  const bound = bindReference(sample, draft.original_text);
  if (!bound.aligned || !Number.isInteger(item.original_start) || !Number.isInteger(item.original_end)) return null;
  const start = renderedText(draft.original_text.slice(0, item.original_start)).length;
  const end = renderedText(draft.original_text.slice(0, item.original_end)).length;
  const matches = bound.entities.filter(entity => entity.complete && ['EMAIL', 'PHONE'].includes(entity.type) &&
    entity.actual_start === start && entity.actual_end === end &&
    (entity.type === 'EMAIL' ? item.contact_kind === 'email' : item.contact_kind === 'phone'));
  if (matches.length !== 1) return null;
  const entity = matches[0];
  return draft.original_text.slice(item.original_start, item.original_end) === entity.value
    ? { ambiguity_id: item.ambiguity_id, decision: 'confirm_contact' }
    : { ambiguity_id: item.ambiguity_id, decision: 'correct_contact', replacement: entity.value };
}

export function boundReviewChoice(entries, records, draft, item) {
  const documents = draft.batch_review?.documents;
  let start = 0, end = draft.original_text.length;
  if (documents?.length > 1) {
    const labels = [...draft.original_text.matchAll(/\n\n===== Dokument (\d+) von (\d+) =====\n\n/gu)];
    const document = documents.find(document => document.candidate_ids.includes(item.ambiguity_id));
    if (labels.length !== documents.length || !document) return null;
    const label = labels[document.document_index - 1];
    if (!label || Number(label[1]) !== document.document_index || Number(label[2]) !== documents.length) return null;
    start = label.index + label[0].length;
    end = labels[document.document_index]?.index ?? end;
  }
  if (item.original_start < start || item.original_end > end) return null;
  const text = draft.original_text.slice(start, end), fingerprint = semanticWords(text);
  const matched = entries.map((sample, index) => ({ sample, record: records[index] }))
    .filter(({ record }) => typeof (record.privacy_extracted || record.extracted) === 'string' &&
      semanticWords(record.privacy_extracted || record.extracted) === fingerprint);
  if (!matched.length) return null;
  const choices = matched.map(({ sample }) => reviewChoice(sample, { original_text: text },
    { ...item, original_start: item.original_start - start, original_end: item.original_end - start }));
  // A null/conflicting choice cannot be removed to create a false consensus.
  return choices.every(choice => choice && choice === choices[0]) ? choices[0] : null;
}

export function selectQualityEntries(manifest, options = {}) {
  const available = options.nativeOnly === true ? manifest.entries.filter(entry =>
    !['png', 'jpg', 'jpeg', 'bmp'].includes(entry.format) && entry.ocr_variant !== 'scan') : manifest.entries;
  const limit = options.maxFiles ?? available.length;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > available.length) throw new Error('QUALITY_FILE_LIMIT_INVALID');
  return available.slice(0, limit);
}

export async function runQualityBenchmark(output, options = {}) {
  const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
    : process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch) ? `macos-${process.arch}`
      : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64-glibc' : null;
  if (!target) throw new Error('QUALITY_HOST_UNSUPPORTED');
  const sourceIdentity = qualitySourceIdentity(target);
  const sourceRevision = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true }).trim();
  const sourceVersion = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
  const coreFingerprint = require('../plugins/data-secure/server/core-policy-fingerprint').calculateCorePolicyFingerprint();
  const corpusRoot = path.resolve(output);
  const manifest = await generateQualityCorpus(corpusRoot);
  const referenceBytes = fs.readFileSync(path.join(corpusRoot, 'REFERENZ.json'));
  const referenceHash = hash(referenceBytes);
  const entries = selectQualityEntries(manifest, options);
  const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-quality-'));
  const server = path.join(scope, 'server');
  const originalSpawn = childProcess.spawn, children = [], environment = new Map();
  childProcess.spawn = (...args) => {
    const child = originalSpawn(...args), entry = { child, closed: false };
    entry.done = new Promise(resolve => child.once('close', () => { entry.closed = true; resolve(); }));
    children.push(entry); return child;
  };
  const records = entries.map(entry => ({ file: entry.file, format: entry.format, ocr_variant: entry.ocr_variant,
    automatic_status: 'not_evaluated', final_status: 'not_evaluated', review: { synthetic: true, decisions: 0, unannotated: 0 } }));
  let fatal = null, activeFile = null, cleanupConfirmed = false;
  try {
    for (const [key, value] of Object.entries({ DATASECURE_PRODUCT_CHANNEL: 'standalone',
      EU_PRIVACY_DATA_ROOT: path.join(scope, 'data'), EU_PRIVACY_ROOT: path.join(scope, 'private'),
      EU_PRIVACY_RESULT_ROOT: path.join(scope, 'visible'), LOCALAPPDATA: path.join(scope, 'localapp') })) {
      environment.set(key, process.env[key]); process.env[key] = value;
    }
    fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
    writeStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), server, target);
    writeConversionRuntime(repo, path.join(server, 'standalone/conversion-runtime'), target);
    const batch = require(path.join(server, 'gateway/batch'));
    const engine = require(path.join(server, 'privacy/engine'));
    const { readOutput } = require(path.join(server, 'gateway/package-store'));
    const { readMarkdownArtifact } = require(path.join(server, 'standalone/markdown-store'));
    const { saveConfiguredResultRoot } = require(path.join(server, 'gateway/result-folder-config'));
    saveConfiguredResultRoot(process.env.EU_PRIVACY_RESULT_ROOT);
    const queue = entries.map(entry => ({ full: path.join(corpusRoot, 'EINGABEN', ...entry.file.split('/')),
      name: path.basename(entry.file), sourceLabel: entry.file, sourceBytes: entry.bytes }));
    const indexFor = item => entries.findIndex(entry => entry.file === item.source_label);
    const readPublished = result => {
      let text = '', offset = 0;
      for (let page = 0; page < 100; page++) {
        const response = readOutput(result.package_id, result.read_capability, offset, 30000);
        if (response.content_is_verified_anonymized_markdown !== true) throw new Error('QUALITY_UNVERIFIED_PUBLICATION');
        text += response.text;
        if (!response.has_more) return text;
        if (!(response.next_offset > offset)) throw new Error('QUALITY_PUBLICATION_PAGING_INVALID');
        offset = response.next_offset;
      }
      throw new Error('QUALITY_PUBLICATION_PAGING_LIMIT');
    };
    for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
      const token = batch.beginBatch({ expectedCount: queue.length, profile: 'personnel_profile', processingMode: mode, queue }).batch_token;
      const capture = result => {
        const item = batch._test.readState(token).items.find(item => result.artifact_id ? item.artifact_id === result.artifact_id : item.package_id === result.package_id);
        const index = item ? indexFor(item) : -1;
        if (index < 0) throw new Error('QUALITY_PUBLICATION_SOURCE_BINDING_INVALID');
        if (mode === 'markdown-only') records[index].extracted = readMarkdownArtifact(result.artifact_id).markdown;
        else { records[index].final = readPublished(result); records[index].final_status = 'published'; }
        batch.finalizePublishedPackageLocally(token, result.artifact_id || result.package_id);
      };
      for (let index = 0; index < queue.length; index++) {
        activeFile = entries[index].file;
        const result = await batch.processBatchNext(token, { reviewTextLocally() { throw new Error('QUALITY_UNEXPECTED_AUTOMATIC_REVIEW'); } });
        if (result.ok && (result.artifact_id || result.package_id)) {
          capture(result);
          if (mode === 'markdown-and-anonymize') records[index].automatic_publication = 'published';
        } else if (mode === 'markdown-only') records[index].extraction_error = result.error || 'QUALITY_NO_CONVERSION_RESULT';
        else records[index].automatic_publication = result.error || 'not_published';
        if (mode === 'markdown-and-anonymize' && records[index].extracted) {
          records[index].spans = engine.sensitiveSpans(renderedText(records[index].extracted), 'personnel_profile');
          // A detector measurement must remain separate from the real batch's
          // residual gate and later review. This probe never publishes.
          try { records[index].automatic = engine.anonymize(records[index].extracted, 'personnel_profile').text;
            records[index].automatic_status = 'unreleased_single_pass_core_probe'; }
          catch (error) { records[index].automatic_status = error.code || 'QUALITY_AUTOMATIC_PROBE_FAILED'; }
        }
        options.progress?.({ mode, completed: index + 1, total: queue.length });
      }
      activeFile = null;
      if (mode === 'markdown-and-anonymize' && batch.readBatchProgress(token).deferred_review) {
        const result = await batch.reviewDeferredBatch(token, {
          onOcrSourceCaptured({ sourceLabel, originalText }) {
            const index = entries.findIndex(entry => entry.file === sourceLabel);
            if (index < 0 || typeof originalText !== 'string') throw new Error('QUALITY_REVIEW_SOURCE_BINDING_INVALID');
            records[index].privacy_raw_extracted = originalText;
          },
          onReviewSourceCaptured({ sourceLabel, originalText }) {
            const index = entries.findIndex(entry => entry.file === sourceLabel);
            if (index < 0 || typeof originalText !== 'string') throw new Error('QUALITY_REVIEW_SOURCE_BINDING_INVALID');
            records[index].privacy_extracted = originalText;
          }, reviewTextLocally(draft) {
          if (draft.ocr_contact_review === true) {
            const matched = entries.map((sample, index) => ({ sample, record: records[index] })).filter(({ record }) =>
              record.privacy_raw_extracted === draft.original_text);
            const decisions = draft.ambiguities.map(item => {
              const votes = matched.map(({ sample }) => contactReviewChoice(sample, draft, item));
              return votes.length && votes.every(choice => choice && JSON.stringify(choice) === JSON.stringify(votes[0])) ? votes[0] : null;
            });
            records[0].review.contact_confirmations = (records[0].review.contact_confirmations || 0) + decisions.filter(item => item?.decision === 'confirm_contact').length;
            records[0].review.contact_corrections = (records[0].review.contact_corrections || 0) + decisions.filter(item => item?.decision === 'correct_contact').length;
            records[0].review.unannotated += decisions.filter(item => !item).length;
            if (decisions.some(item => !item)) return { action: 'deferred' };
            return { action: 'reviewed', redactions: [], decisions };
          }
          const decisions = draft.ambiguities.map(item => {
            return { ambiguity_id: item.ambiguity_id, decision: boundReviewChoice(entries, records, draft, item) };
          });
          // Optional local engineering observer. Never log source-bearing
          // drafts by default or turn an unknown choice into a guessed one.
          options.observeReview?.(draft, decisions);
          // Count bound occurrence decisions, not human effort: the native UI
          // can resolve several equal occurrences with one grouped click.
          records[0].review.decisions += decisions.filter(item => item.decision).length;
          records[0].review.unannotated += decisions.filter(item => !item.decision).length;
          if (decisions.some(item => !item.decision)) return { action: 'deferred' };
          return { action: 'reviewed', redactions: [], decisions };
        } });
        for (const publication of result.packages || []) capture(publication);
      }
      const journal = batch._test.readState(token);
      for (const item of journal.items) {
        const index = indexFor(item);
        if (index < 0) throw new Error('QUALITY_JOURNAL_SOURCE_BINDING_INVALID');
        if (mode === 'markdown-and-anonymize' && !records[index].final) records[index].final_status =
          item.error_code || item.error || item.stop_reason || item.status || 'not_evaluated';
      }
      batch.exportCompletedBatchResults(token);
    }
  } catch (error) {
    const code = error.code || error.message;
    fatal = /^[A-Z][A-Z0-9_]{2,100}$/u.test(code || '') ? code : 'QUALITY_RUN_FAILED';
  } finally {
    childProcess.spawn = originalSpawn;
    for (const entry of children) if (!entry.closed) entry.child.kill('SIGTERM');
    let timer;
    try { await Promise.race([Promise.all(children.map(entry => entry.done)), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('QUALITY_WORKER_CLEANUP_UNCONFIRMED')), 6000);
    })]); cleanupConfirmed = true; }
    catch { fatal ||= 'QUALITY_WORKER_CLEANUP_UNCONFIRMED'; }
    finally {
      clearTimeout(timer);
      for (const [key, value] of environment) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
    // Do not remove an owned runtime while a worker may still hold it.
    if (cleanupConfirmed) removePackageSmokeScope(repo, scope);
  }
  for (const entry of manifest.entries) if (hash(fs.readFileSync(path.join(corpusRoot, 'EINGABEN', ...entry.file.split('/')))) !== entry.sha256) {
    throw new Error('QUALITY_SOURCE_CHANGED');
  }
  if (hash(fs.readFileSync(path.join(corpusRoot, 'REFERENZ.json'))) !== referenceHash) throw new Error('QUALITY_REFERENCE_CHANGED');
  if (JSON.stringify(qualitySourceIdentity(target)) !== JSON.stringify(sourceIdentity)) fatal ||= 'QUALITY_EVALUATION_SOURCE_CHANGED';
  const results = entries.map((entry, index) => evaluateQuality(entry, records[index]));
  const artifacts = path.join(corpusRoot, 'GEGENPRUEFUNG'); fs.mkdirSync(artifacts);
  for (const [index, result] of results.entries()) {
    result.automatic_publication = records[index].automatic_publication || 'not_evaluated';
    result.countercheck_files = {};
    for (const stage of ['extracted', 'privacy_raw_extracted', 'privacy_extracted', 'automatic', 'final']) if (typeof records[index][stage] === 'string') {
      const file = `${String(index + 1).padStart(3, '0')}-${stage}.md`;
      fs.writeFileSync(path.join(artifacts, file), records[index][stage], { flag: 'wx' });
      result.countercheck_files[stage] = `GEGENPRUEFUNG/${file}`;
    }
  }
  const report = { schema: 'datasecure-quality-report/1', version: sourceVersion,
    target, reference_sha256: referenceHash, synthetic_only: true, human_reference_review: 'NOT_RUN',
    review_decisions: 'synthetic-reference-bound', exact_release_package: false, fatal_error: fatal,
    fatal_file: activeFile, runtime_cleanup: cleanupConfirmed ? 'confirmed' : 'unconfirmed',
    source_revision: sourceRevision, core_policy_fingerprint: coreFingerprint, ...sourceIdentity,
    corpus_selection: options.nativeOnly === true ? 'native-text-only' : 'all-formats',
    full_corpus_executed: entries.length === manifest.entries.length, summary: summarizeQuality(results), results };
  report.synthetic_review = { invoked: records.some(record => record.review.decisions || record.review.unannotated ||
      record.review.contact_confirmations || record.review.contact_corrections),
    contact_confirmations: records.reduce((sum, record) => sum + (record.review.contact_confirmations || 0), 0),
    contact_corrections: records.reduce((sum, record) => sum + (record.review.contact_corrections || 0), 0),
    decisions: records.reduce((sum, record) => sum + record.review.decisions, 0),
    unannotated: records.reduce((sum, record) => sum + record.review.unannotated, 0), count_scope: 'bound-occurrence-decisions-not-human-prompts' };
  writeQualityReport(path.join(corpusRoot, 'BERICHTE'), report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let output = path.join(repo, 'dist', `DataSecure-Qualitaet-${new Date().toISOString().replace(/[:.]/gu, '-')}`), maxFiles, nativeOnly = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--output' && args[index + 1]) output = args[++index];
    else if (args[index] === '--max-files' && args[index + 1]) maxFiles = Number(args[++index]);
    else if (args[index] === '--native-only') nativeOnly = true;
    else throw new Error('Usage: benchmark-quality.mjs [--output new-directory] [--max-files 1..72] [--native-only]');
  }
  const report = await runQualityBenchmark(output, { maxFiles, nativeOnly, progress({ mode, completed, total }) {
    process.stdout.write(`quality ${mode}: ${completed}/${total}\n`);
  } });
  // Aggregate-only stdout: source-bearing findings are confined to local files.
  process.stdout.write(`${JSON.stringify({ schema: report.schema, summary: report.summary,
    fatal_error: report.fatal_error, human_reference_review: report.human_reference_review })}\n`);
  if (qualityHasFindings(report)) process.exitCode = 1;
}
