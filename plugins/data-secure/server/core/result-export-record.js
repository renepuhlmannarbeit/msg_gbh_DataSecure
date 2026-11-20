'use strict';

// Compact private plan JSON, not document bodies, IPC frames or ownership
// records. 200 pairs of <=1024 UTF-16-unit paths can exceed 1 MiB in UTF-8.
// Even conservative six-byte JSON escaping plus the bounded item metadata
// fits below this fixed cap. Readers and writers share the same protocol.
const MAX_RESULT_EXPORT_RECORD_BYTES = 4 * 1024 * 1024;

function serializeResultExportRecord(record) {
  const payload = JSON.stringify(record);
  let remainingProgress = 0;
  if (record.complete !== true) {
    // Reserve future progress without granting it: the actual payload keeps
    // its original destination/flags. complete:false -> true only shrinks.
    remainingProgress = Math.max(0, 64 - String(record.destination_id || '').length);
    for (const item of record.items) if (item.exported !== true) remainingProgress += 16; // ,"exported":true
  }
  if (Buffer.byteLength(payload, 'utf8') + remainingProgress > MAX_RESULT_EXPORT_RECORD_BYTES)
    throw Object.assign(new Error('RESULT_EXPORT_STATE_UNSAFE'), { code: 'RESULT_EXPORT_STATE_UNSAFE' });
  return payload;
}

module.exports = { MAX_RESULT_EXPORT_RECORD_BYTES, serializeResultExportRecord };
