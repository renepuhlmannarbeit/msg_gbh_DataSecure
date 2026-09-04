'use strict';

// The detached batch worker already owns the user's one confirmed local run.
// When automatic analysis ends in `awaiting_local_review`, keep that same
// local flow alive and reuse the existing batch-review orchestrator. Nothing
// is sent back through MCP: the token and reconstructed review text stay
// inside the detached, network-denied worker.
async function continueIntoLocalReview(token, progress, options = {}) {
  const deferred = Number(progress?.deferred_review || 0);
  if (progress?.batch_phase !== 'awaiting_local_review' || deferred < 1) {
    return { attempted: false, progress };
  }

  const pid = Number(options.executorPid ?? process.pid);
  const claim = options.claimLocalBatchExecutor;
  const release = options.releaseLocalBatchExecutor;
  const review = options.reviewDeferredBatch;
  const read = options.readBatchProgress;
  const lifecycle = typeof options.onReviewLifecycle === 'function'
    ? options.onReviewLifecycle : () => {};
  if (!Number.isSafeInteger(pid) || pid <= 0 || typeof claim !== 'function' ||
      typeof release !== 'function' || typeof review !== 'function' || typeof read !== 'function') {
    throw new TypeError('automatic local review dependencies are incomplete');
  }

  let claimed = false;
  let result = progress;
  try {
    const ownership = claim(token, pid);
    if (ownership?.ok !== true) {
      lifecycle({ event: 'automatic_review_claim_failed', outcome: 'stopped',
        item_count: Number(progress.batch_total || 0), error_code: 'LOCAL_REVIEW_BUSY' });
      return { attempted: true, started: false, progress };
    }
    claimed = true;
    lifecycle({ event: 'automatic_review_started', outcome: 'progress',
      item_count: Number(progress.batch_total || 0) });
    result = await review(token, {
      executorPid: pid,
      localFinalize: true,
      onReviewLifecycle: lifecycle,
      reviewOptions: { timeoutMs: null }
    });
    lifecycle({ event: 'automatic_review_finished',
      outcome: result?.complete === true ? 'ok' : 'stopped',
      item_count: Number(result?.batch_total || progress.batch_total || 0),
      released_count: Number(result?.released || 0),
      stopped_count: Number(result?.stopped || 0),
      error_code: result?.ok === true ? 'NONE' :
        (['LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED'].includes(result?.error)
          ? result.error : 'LOCAL_REVIEW_FAILED') });
  } catch {
    lifecycle({ event: 'automatic_review_failed', outcome: 'stopped',
      item_count: Number(progress.batch_total || 0), error_code: 'LOCAL_REVIEW_FAILED' });
    result = null;
  } finally {
    if (claimed) {
      try {
        if (release(token, pid) !== true) {
          lifecycle({ event: 'automatic_review_release_failed', outcome: 'stopped',
            item_count: Number(progress.batch_total || 0), error_code: 'LOCAL_REVIEW_RELEASE_FAILED' });
        }
      } catch {
        lifecycle({ event: 'automatic_review_release_failed', outcome: 'stopped',
          item_count: Number(progress.batch_total || 0), error_code: 'LOCAL_REVIEW_RELEASE_FAILED' });
      }
    }
  }

  if (!result) {
    try { result = read(token); }
    catch { result = progress; }
  }
  return { attempted: true, started: claimed, progress: result };
}

module.exports = { continueIntoLocalReview };
