'use strict';

const crypto = require('crypto');

function createBatchResultAccess(deps) {
  const {
    SafeError,
    fs,
    tokenPattern,
    batchRoot,
    readState,
    readStateForMaintenance,
    publicProgress,
    liveLocalExecutor,
    regularPublishedPackage,
    issueReadCapability
  } = deps;

  function invalidCursor() {
    return new SafeError('Der Ergebnis-Cursor ist ungültig.');
  }

  function resultCursor(token, index) {
    const position = String(index);
    const signature = crypto.createHmac('sha256', token).update(position).digest('base64url').slice(0, 16);
    return Buffer.from(`${position}.${signature}`, 'utf8').toString('base64url');
  }

  function parseResultCursor(token, cursor) {
    if (cursor === undefined || cursor === null || cursor === '') return 0;
    if (typeof cursor !== 'string' || cursor.length > 96 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw invalidCursor();
    }
    let decoded;
    try {
      decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    } catch {
      throw invalidCursor();
    }
    const match = /^(0|[1-9][0-9]{0,2})\.([A-Za-z0-9_-]{16})$/.exec(decoded);
    if (!match) throw invalidCursor();
    const index = Number(match[1]);
    const expected = resultCursor(token, index);
    const left = Buffer.from(expected);
    const right = Buffer.from(cursor);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw invalidCursor();
    return index;
  }

  function listBatchResults(token, options = {}) {
    const limit = Number(options.limit ?? 10);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new SafeError('Ergebnislimit muss zwischen 1 und 20 liegen.');
    const state = readState(token);
    const start = parseResultCursor(token, options.cursor);
    if (start > state.items.length) throw invalidCursor();
    const results = [];
    let nextIndex = start;
    for (; nextIndex < state.items.length && results.length < limit; nextIndex++) {
      const item = state.items[nextIndex];
      if (item.status !== 'released' || item.analysis_acknowledged === true) continue;
      if (!regularPublishedPackage(item.package_id)) throw new SafeError('Ein freigegebenes Ergebnis konnte nicht sicher verifiziert werden.');
      const grant = issueReadCapability(item.package_id);
      results.push({
        package_id: item.package_id,
        read_capability: grant.read_capability,
        read_capability_expires_at: grant.read_capability_expires_at
      });
    }
    const available = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged !== true).length;
    const used = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged === true).length;
    const progress = publicProgress(state);
    return {
      ok: true,
      results,
      next_cursor: nextIndex < state.items.length ? resultCursor(token, nextIndex) : null,
      used,
      available,
      still_open: progress.remaining + progress.processing + progress.retryable + progress.deferred_review + progress.mapping_pending + progress.delivery_pending,
      safely_stopped: progress.stopped,
      batch_complete: progress.complete,
      raw_content_sent_to_claude: false
    };
  }

  // Internal discovery only: opaque checkpoint tokens must never cross MCP.
  function completedLocalOnlyCandidates() {
    let entries;
    try {
      entries = fs.readdirSync(batchRoot(), { withFileTypes: true });
    } catch {
      return [];
    }
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const token = entry.name.slice(0, -'.json'.length);
      if (!tokenPattern.test(token)) continue;
      try {
        const state = readStateForMaintenance(token);
        if (Date.now() > Date.parse(state.expires_at)) continue;
        const progress = publicProgress(state);
        if (liveLocalExecutor(state) || !progress.complete) continue;
        const releasedItems = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged !== true);
        if (releasedItems.length === 0 || !releasedItems.every((item) => regularPublishedPackage(item.package_id))) continue;
        candidates.push({ token, released: releasedItems.length, stopped: progress.stopped, completedAt: String(state.completed_at || state.updated_at || state.created_at || '') });
      } catch {
        // Malformed or expired local state is not a handoff candidate.
      }
    }
    const ordered = candidates.sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)) || left.token.localeCompare(right.token));
    if (ordered.length > 50) {
      throw new SafeError('Es liegen zu viele abgeschlossene lokale Stapel für eine sichere Auswahl vor. Bitte nicht benötigte lokale Ergebnisse nach Ihrer Aufbewahrungsregel bereinigen.');
    }
    return ordered;
  }

  return { resultCursor, parseResultCursor, listBatchResults, completedLocalOnlyCandidates };
}

module.exports = { createBatchResultAccess };
