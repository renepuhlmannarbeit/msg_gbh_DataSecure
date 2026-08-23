'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { roots } = require('./common');

const HEADER = 'Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis\r\n';
const FIXED_NOTE = 'Lokale Zuordnung; nicht an Claude übertragen.';
const RELEASED = 'freigegeben';
const STOPPED = 'sicher gestoppt';

function csvField(value) {
  let text = String(value ?? '');
  // Spreadsheet programs must not interpret a filename or a package id as a
  // formula when the user opens the local mapping.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function mappingPath() { return path.join(roots().exports, 'DataSecure-Mapping.csv'); }

function appendMapping(originalName, packageId, status = RELEASED) {
  const name = String(originalName);
  const result = String(packageId ?? '');
  const state = String(status);
  const validReleased = state === RELEASED && /^[A-Za-z0-9_-]+$/.test(result);
  // A terminally stopped source deliberately has no output package. Recording
  // that fact in the private user-facing ledger prevents an ambiguous missing
  // row without inventing a result identifier.
  const validStopped = state === STOPPED && result === '';
  if (path.basename(name) !== name || !(validReleased || validStopped)) {
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
  }
  const target = mappingPath();
  let previous = '';
  try { previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''; }
  catch { throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher gelesen werden.'); }
  if (previous && !previous.startsWith(HEADER)) {
    throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
  }
  const row = [name, result, state, FIXED_NOTE].map(csvField).join(';') + '\r\n';
  // A process can disappear after atomically replacing the CSV but before it
  // records that fact in its private batch snapshot. Retrying that exact local
  // commit must be safe: duplicate rows would make the user-facing mapping
  // ambiguous and could cause a recovered package to look like a second run.
  if (previous.includes(row)) return false;
  const next = (previous || HEADER) + row;
  const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temporary, next, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, target);
    return true;
  } catch {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* no broader cleanup */ }
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
  }
}

module.exports = { appendMapping, mappingPath, csvField, HEADER, FIXED_NOTE, RELEASED, STOPPED };
