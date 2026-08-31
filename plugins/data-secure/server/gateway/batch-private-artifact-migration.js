'use strict';

const { SafeError } = require('../runtime');
const { SCHEMA, V2_SCHEMA } = require('./batch-journal-store');
const { exactPendingEntry } = require('./batch-snapshot');

function unsupported() {
  const error = new SafeError('Eine alte verschlüsselte oder unbekannte Stapelversion bleibt unverändert erhalten. Bitte die Originaldateien neu auswählen.');
  error.code = 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED';
  return error;
}

// Upgrade only verified plaintext v2 journals. Never decrypt, rename or delete
// legacy snapshots. Released originals stay independent of private work copies.
function migrateLegacyBatchState(state, deps = {}) {
  if (![SCHEMA, V2_SCHEMA].includes(state?.schema) || !Array.isArray(state.items)) throw unsupported();
  for (const item of state.items) {
    if (Object.hasOwn(item, 'private_artifact_encrypted') || Object.hasOwn(item, 'legacy_work_name') ||
        /\.dsart$/iu.test(String(item.work_name || ''))) throw unsupported();
  }
  if (state.schema === SCHEMA) return state;
  if (typeof deps.writeState !== 'function') throw unsupported();
  const next = JSON.parse(JSON.stringify(state));
  for (const item of next.items) {
    if (!item.work_name) continue;
    // Released work is already removed by the normal lifecycle.
    if (!['released', 'stopped'].includes(item.status)) {
      const checked = exactPendingEntry(state, item, deps);
      checked.private_bytes.fill(0);
    }
    item.private_artifact_plain = true;
  }
  next.schema = SCHEMA;
  deps.writeState(next);
  // Callers already hold an item reference when selecting its private input.
  // Preserve those references so subsequent checkpoints update this journal.
  for (let index = 0; index < state.items.length; index++) Object.assign(state.items[index], next.items[index]);
  state.schema = next.schema;
  return state;
}

module.exports = Object.freeze({ migrateLegacyBatchState });
