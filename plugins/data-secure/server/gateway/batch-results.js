'use strict';

const crypto = require('crypto');
const { publicPositiveDocumentResult, projectBatchResults, emptyGradeCounts, emptyOmissionCounts } = require('./batch-result-projection');

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
    publishedPackageRecord,
    publishedPackageIdentityRecord,
    sameDocumentResult,
    issueReadCapability
  } = deps;

  function verifiedResultPackage(state, item) {
    // Modern terminal journals already bind manifest and Markdown identities.
    // Reuse that durable O(1) binding for the metadata-only listing. The handoff
    // snapshot still performs the full asynchronous SHA-256 verification before
    // returning any document byte. Legacy journals without a binding retain the
    // full synchronous verifier.
    const published = state.schema !== 'datasecure-batch/1' && item?.package_identity && publishedPackageIdentityRecord
      ? publishedPackageIdentityRecord(item)
      : publishedPackageRecord(item.package_id);
    if (published?.state !== 'verified') return null;
    const hasJournalResult = Object.hasOwn(item, 'document_result');
    const hasPackageResult = published.document_result !== null && published.document_result !== undefined;
    if (state.schema === 'datasecure-batch/1') {
      return !hasJournalResult && !hasPackageResult ? published : null;
    }
    return hasJournalResult && hasPackageResult && sameDocumentResult(item.document_result, published.document_result)
      ? published
      : null;
  }

  function pluginHandoffState(state) {
    if (state?.schema === 'datasecure-batch/5' || state?.processing_mode === 'markdown-only') return false;
    if (state?.product_channel === 'plugin') return true;
    // Journals written before product_channel was introduced belong to the
    // plugin namespace. Standalone always writes an explicit channel and uses
    // a physically separate root, so preserving v1-v4 compatibility does not
    // make a Standalone batch discoverable here.
    return !Object.hasOwn(state || {}, 'product_channel') &&
      ['datasecure-batch/1', 'datasecure-batch/2', 'datasecure-batch/3', 'datasecure-batch/4'].includes(state?.schema);
  }

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
    if (!pluginHandoffState(state)) {
      throw new SafeError('Dieser lokale Stapel gehört nicht zum Claude-Plugin.');
    }
    const start = parseResultCursor(token, options.cursor);
    if (start > state.items.length) throw invalidCursor();
    const results = [];
    let nextIndex = start;
    for (; nextIndex < state.items.length && results.length < limit; nextIndex++) {
      const item = state.items[nextIndex];
      if (item.status !== 'released' || item.analysis_acknowledged === true) continue;
      const verified = verifiedResultPackage(state, item);
      if (!verified) throw new SafeError('Ein freigegebenes Ergebnis konnte nicht sicher verifiziert werden.');
      const grant = issueReadCapability(item.package_id);
      results.push({
        package_id: item.package_id,
        read_capability: grant.read_capability,
        read_capability_expires_at: grant.read_capability_expires_at,
        document_result: verified.document_result ? publicPositiveDocumentResult(verified.document_result) : null
      });
    }
    const available = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged !== true).length;
    const used = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged === true).length;
    const progress = publicProgress(state);
    const nextResultIndex = state.items.findIndex((item, index) =>
      index >= nextIndex && item.status === 'released' && item.analysis_acknowledged !== true
    );
    return {
      ok: true,
      results,
      // Stopped and already acknowledged journal items are not result pages.
      // Point directly at the next unread result instead of making Cowork call
      // the tool once more only to receive an empty page.
      next_cursor: nextResultIndex >= 0 ? resultCursor(token, nextResultIndex) : null,
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
        if (!pluginHandoffState(state)) continue;
        if (Date.now() > Date.parse(state.expires_at)) continue;
        const progress = publicProgress(state);
        if (liveLocalExecutor(state) || !progress.complete) continue;
        const releasedItems = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged !== true);
        const verified = state.schema === 'datasecure-batch/2'
          ? progress.result_grades_verified === true
          : releasedItems.every((item) => verifiedResultPackage(state, item));
        if (releasedItems.length === 0 || !verified) continue;
        // Durable evidence and publicProgress describe the whole batch. The
        // handoff describes only unread results (plus stopped documents). Derive
        // that subset only AFTER the full projection has verified its bindings;
        // never compare a filtered checkpoint to full-batch terminal evidence.
        // Reuse those verified in-memory results, without another package hash
        // pass. Legacy/failed full projections remain explicitly unavailable.
        const projection = progress.result_grades_verified === true
          ? projectBatchResults({
              schema: state.schema,
              items: state.items.filter((item) => item.status !== 'released' || item.analysis_acknowledged !== true)
            }, { verifyPositive: (item) => ({ state: 'verified', document_result: item.document_result }) })
          : {
              grade_counts: emptyGradeCounts(releasedItems.length + progress.stopped),
              omission_counts: emptyOmissionCounts(),
              grades_verified: false
            };
        candidates.push({
          token,
          released: releasedItems.length,
          stopped: progress.stopped,
          grade_counts: projection.grade_counts,
          omission_counts: projection.omission_counts,
          grades_verified: projection.grades_verified,
          completedAt: String(state.completed_at || state.updated_at || state.created_at || '')
        });
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
