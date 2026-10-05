'use strict';

// Test-host log predicate only. A loaded review page or an IPC request alone
// cannot demonstrate a functioning session. This does not prove decisions or
// publication; those need the separate full review integration scenario.
const fs = require('node:fs');
const OPAQUE_ID_RE = /^[a-f0-9]{16,64}$/u;
function opaqueId(value) { return typeof value === 'string' && OPAQUE_ID_RE.test(value); }

function currentSession(events) {
  if (!Array.isArray(events)) return [];
  const start = events.findLastIndex(record => record?.event === 'application_started');
  if (start >= 0) {
    const id = events[start].session_id;
    if (!opaqueId(id)) return [];
    return events.slice(start).filter(record => record?.session_id === id);
  }
  // Unit/CLI fragments may omit a session boundary, but may never combine
  // tagged sessions or borrow an untagged page/response from another launch.
  const tagged = events.filter(record => record && Object.hasOwn(record, 'session_id'));
  if (tagged.length === 0) return events;
  const ids = new Set(tagged.map(record => record.session_id));
  if (ids.size !== 1 || !opaqueId(tagged[0].session_id)) return [];
  return events.filter(record => record?.session_id === tagged[0].session_id);
}

function actionReady(events, action) {
  const scoped = currentSession(events);
  const start = scoped.findLastIndex(record => record?.event === 'ipc_request_started' && record.action === action);
  if (start < 0) return false;
  const id = scoped[start].request_id;
  if (!opaqueId(id)) return false;
  const following = scoped.slice(start + 1).filter(record => record?.action === action);
  if (following.some(record => !opaqueId(record.request_id))) return false;
  // A late response to A cannot satisfy or invalidate the newer request B.
  // Only B's newest event after its start can prove successful IPC.
  const response = following.filter(record => record.request_id === id).at(-1);
  return response?.event === 'ipc_response_ok';
}

function reviewReady(events) {
  const scoped = currentSession(events);
  return scoped.some(record => record.event === 'review_page_loaded') && actionReady(scoped, 'get_review_session');
}

function mainReady(events) {
  const scoped = currentSession(events);
  return scoped.some(record => record.event === 'page_loaded') &&
    scoped.some(record => record.event === 'frontend_ready') &&
    actionReady(scoped, 'get_public_state') && actionReady(scoped, 'get_ui_context');
}

module.exports = { reviewReady, mainReady, actionReady };
if (require.main === module) {
  try {
    const input = process.argv[2] === '-' ? 0 : process.argv[2];
    const records = fs.readFileSync(input, 'utf8').split(/\r?\n/u).flatMap(line => {
      try { const value = JSON.parse(line); return value && typeof value === 'object' ? [value] : []; }
      catch { return []; }
    });
    const check = process.argv[3] === '--main' ? mainReady : reviewReady;
    process.exitCode = check(records) ? 0 : 1;
  } catch { process.exitCode = 1; }
}
