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

  function handoffScope(options) {
    const scope = options.scope ?? 'unread';
    if (!['unread', 'reuse_completed'].includes(scope)) throw new SafeError('Der Umfang der Ergebnisübergabe ist ungültig.');
    return scope;
  }

  // Internal immutable generation, never a public batch identifier. A replay
  // requires every released item to have been delivered and acknowledged.
  // Include that state so a later journal change invalidates the selection.
  function fullyDelivered(state) {
    return state.items.some(item => item.status === 'released') &&
      state.items.every(item => item.status !== 'released' || item.analysis_acknowledged === true);
  }
  function completedGeneration(state) {
    return crypto.createHash('sha256').update(JSON.stringify({
      schema: state.schema, token: state.token, product_channel: state.product_channel,
      processing_mode: state.processing_mode, expires_at: state.expires_at,
      terminal_evidence: state.terminal_evidence,
      items: state.items.map(item => ({
        id: item.id, status: item.status, analysis_acknowledged: item.analysis_acknowledged,
        package_id: item.package_id,
        package_identity: item.package_identity, document_result: item.document_result,
        error_code: item.error_code
      }))
    })).digest('hex');
  }

  function changedGeneration() {
    const error = new SafeError('Die lokalen Ergebnisse haben sich seit der Auswahl geändert. Bitte die Auswertung erneut starten.');
    error.code = 'LOCAL_HANDOFF_CHANGED';
    return error;
  }

  function verifyCompletedLocalOnlyGeneration(token, generation) {
    const state = readStateForMaintenance(token);
    if (!pluginHandoffState(state) || typeof generation !== 'string' || !/^[a-f0-9]{64}$/u.test(generation) ||
        !Number.isFinite(Date.parse(state.expires_at)) || Date.now() >= Date.parse(state.expires_at) ||
        completedGeneration(state) !== generation || !fullyDelivered(state) ||
        liveLocalExecutor(state) || !publicProgress(state).complete) {
      throw changedGeneration();
    }
    return true;
  }

  function resultCursor(token, index, binding = '') {
    const position = String(index);
    const signature = crypto.createHmac('sha256', token).update(binding ? `${binding}:${position}` : position).digest('base64url').slice(0, 16);
    return Buffer.from(`${position}.${signature}`, 'utf8').toString('base64url');
  }

  function parseResultCursor(token, cursor, binding = '') {
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
    const expected = resultCursor(token, index, binding);
    const left = Buffer.from(expected);
    const right = Buffer.from(cursor);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw invalidCursor();
    return index;
  }

  function listBatchResults(token, options = {}) {
    const scope = handoffScope(options);
    const replay = scope === 'reuse_completed';
    const limit = Number(options.limit ?? 10);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new SafeError('Ergebnislimit muss zwischen 1 und 20 liegen.');
    const state = readState(token);
    if (!pluginHandoffState(state)) {
      throw new SafeError('Dieser lokale Stapel gehört nicht zum Claude-Plugin.');
    }
    const progress = publicProgress(state);
    if (replay && (typeof options.generation !== 'string' || !/^[a-f0-9]{64}$/u.test(options.generation) ||
        completedGeneration(state) !== options.generation || !fullyDelivered(state) ||
        !progress.complete || liveLocalExecutor(state) ||
        !Number.isFinite(Date.parse(state.expires_at)) || Date.now() >= Date.parse(state.expires_at))) {
      throw changedGeneration();
    }
    const binding = replay ? `reuse_completed:${options.generation}` : '';
    const eligible = item => item.status === 'released' && (replay || item.analysis_acknowledged !== true);
    const start = parseResultCursor(token, options.cursor, binding);
    if (start > state.items.length) throw invalidCursor();
    const results = [];
    let nextIndex = start;
    for (; nextIndex < state.items.length && results.length < limit; nextIndex++) {
      const item = state.items[nextIndex];
      if (!eligible(item)) continue;
      const verified = verifiedResultPackage(state, item);
      if (!verified) throw new SafeError('Ein freigegebenes Ergebnis konnte nicht sicher verifiziert werden.');
      const grant = issueReadCapability(item.package_id);
      results.push({
        package_id: item.package_id,
        read_capability: grant.read_capability,
        read_capability_expires_at: grant.read_capability_expires_at,
        document_result: verified.document_result ? publicPositiveDocumentResult(verified.document_result) : null,
        ...(grant.privacy_scope ? {
          privacy_scope: grant.privacy_scope,
          source_extraction_coverage: grant.source_extraction_coverage
        } : {})
      });
    }
    const available = state.items.filter(eligible).length;
    const used = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged === true).length;
    const nextResultIndex = state.items.findIndex((item, index) =>
      index >= nextIndex && eligible(item)
    );
    return {
      ok: true,
      results,
      // Stopped entries are never result pages. In normal scope acknowledged
      // entries are skipped too; explicit replay includes them without mutation.
      // Point directly at the next eligible result, never an empty trailing page.
      next_cursor: nextResultIndex >= 0 ? resultCursor(token, nextResultIndex, binding) : null,
      used,
      available,
      still_open: progress.remaining + progress.processing + progress.retryable + progress.deferred_review + progress.mapping_pending + progress.delivery_pending,
      safely_stopped: progress.stopped,
      batch_complete: progress.complete,
      raw_content_sent_to_claude: false
    };
  }

  // Internal discovery only: opaque checkpoint tokens must never cross MCP.
  function completedLocalOnlyCandidates(options = {}) {
    const replay = handoffScope(options) === 'reuse_completed';
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
        if (!Number.isFinite(Date.parse(state.expires_at)) || Date.now() >= Date.parse(state.expires_at)) continue;
        const progress = publicProgress(state);
        if (liveLocalExecutor(state) || !progress.complete || (replay && !fullyDelivered(state))) continue;
        const releasedItems = state.items.filter((item) => item.status === 'released' && (replay || item.analysis_acknowledged !== true));
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
              items: state.items.filter((item) => replay || item.status !== 'released' || item.analysis_acknowledged !== true)
            }, { verifyPositive: (item) => ({ state: 'verified', document_result: item.document_result }) })
          : {
              grade_counts: emptyGradeCounts(releasedItems.length + progress.stopped),
              omission_counts: emptyOmissionCounts(),
              grades_verified: false
            };
        candidates.push({
          token,
          ...(replay ? { generation: completedGeneration(state) } : {}),
          expiresAt: state.expires_at,
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

  return { resultCursor, parseResultCursor, listBatchResults, completedLocalOnlyCandidates, verifyCompletedLocalOnlyGeneration };
}

module.exports = { createBatchResultAccess };
