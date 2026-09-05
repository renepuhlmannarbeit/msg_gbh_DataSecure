#!/usr/bin/env node
'use strict';

const { StandaloneApplicationService } = require('./application-service');

function usage() {
  return [
    'DataSecure lokal',
    '  datasecure anonymisieren [--ordner]',
    '  datasecure status',
    '  datasecure ergebnisordner-festlegen',
    '  datasecure ergebnisse-oeffnen'
  ].join('\n');
}

function parse(argv) {
  const args = [...argv];
  const command = args.shift() || 'anonymisieren';
  let sourceKind = 'files';
  while (args.length) {
    const current = args.shift();
    if (current === '--ordner') sourceKind = 'folder';
    else if (current === '--hilfe' || current === '-h') return { command: 'hilfe' };
    else throw Object.assign(new Error('Unbekannte Option.'), { code: 'STANDALONE_ARGUMENT_INVALID' });
  }
  return { command, sourceKind, profile: 'auto' };
}

async function run(argv = process.argv.slice(2), options = {}) {
  const output = options.output || process.stdout;
  const errorOutput = options.errorOutput || process.stderr;
  const service = options.service || new StandaloneApplicationService(options);
  try {
    const parsed = parse(argv);
    if (parsed.command === 'hilfe') { output.write(`${usage()}\n`); return 0; }
    if (parsed.command === 'status') {
      const status = service.status();
      const messages = {
        blocked: 'DataSecure ist nicht bereit.',
        processing: 'Die Dateien werden lokal verarbeitet.',
        review_required: 'Eine lokale Prüfung ist erforderlich.',
        stopped: 'Ein unterbrochener Stapel kann fortgesetzt werden.',
        export_pending: status.completion_pending === true
          ? 'Die lokale Abschlussübersicht wird bereitgestellt.'
          : 'Anonymisierte Ergebnisse werden lokal bereitgestellt.',
        results_available: `${status.result_count} anonymisierte Ergebnisse sind verfügbar.`,
        completed_without_results: `${status.failed_count} Datei${status.failed_count === 1 ? ' wurde' : 'en wurden'} sicher gestoppt; es ist kein anonymisiertes Ergebnis verfügbar.`,
        ready: 'DataSecure ist bereit.'
      };
      output.write(`${messages[status.state] || messages.blocked}\n`);
      return status.ok ? 0 : 1;
    }
    if (parsed.command === 'anonymisieren') {
      await service.anonymize(parsed);
      output.write('Die Dateien werden vollständig lokal anonymisiert. Nach Abschluss zeigt DataSecure den Ergebnisordner an.\n');
      return 0;
    }
    if (parsed.command === 'ergebnisordner-festlegen') {
      await service.configureResults();
      output.write('Der Ergebnisordner wurde lokal festgelegt.\n');
      return 0;
    }
    if (parsed.command === 'ergebnisse-oeffnen') {
      await service.openResults();
      output.write('Der lokale Ergebnisordner wurde geöffnet.\n');
      return 0;
    }
    errorOutput.write(`${usage()}\n`);
    return 64;
  } catch (error) {
    const code = String(error?.code || '');
    errorOutput.write(code === 'STANDALONE_ARGUMENT_INVALID'
      ? `Eingabe nicht erkannt.\n${usage()}\n`
      : 'DataSecure hat den lokalen Vorgang sicher gestoppt. Details stehen ausschließlich im lokalen Supportprotokoll.\n');
    return code === 'STANDALONE_ARGUMENT_INVALID' ? 64 : 1;
  }
}

if (require.main === module) run().then((exitCode) => { process.exitCode = exitCode; });

module.exports = { run, parse, usage };
