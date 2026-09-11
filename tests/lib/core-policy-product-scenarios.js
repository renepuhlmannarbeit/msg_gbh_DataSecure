'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { formats, reviewProfiles, goldenFixture, reviewFixture, canonicalizeBodies } = require('./core-policy-golden');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Only the local human answer, a deterministic AbortSignal and the Standalone
// converter process boundary are adapted. The latter calls the projected,
// in-memory Markdown extractor: the separate package smoke proves the real
// sandboxed worker/runtime, while this semantic test stays small enough to run
// every profile across fresh processes. Intake, extraction semantics, PII,
// journal/recovery, review reconstruction, publication and capability reads all
// use the actual projected product.
async function runProductScenarios({ directory, channel, profile, stage, server, batch, readOutput, pii, phase }) {
  const { roots } = require(path.join(server, 'gateway', 'common'));
  const { issueReadCapability } = require(path.join(server, 'gateway', 'package-store'));
  const { batchNextAction } = require(path.join(server, 'core', 'batch-next-action'));
  let uiCalls = 0;
  const noUi = () => { uiCalls++; throw new Error('GOLDEN_UNEXPECTED_LOCAL_REVIEW'); };
  const save = (name, value) => fs.writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(value), { flag: 'wx' });
  const load = name => JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8'));
  const facts = token => {
    const progress = batch.readBatchProgress(token);
    const keys = ['batch_total', 'released', 'completed', 'completion_percent', 'remaining', 'retryable',
      'deferred_review', 'delivery_pending', 'mapping_pending', 'processing', 'stopped', 'complete', 'batch_phase'];
    return { ...Object.fromEntries(keys.map(key => [key, progress[key]])), next_action: batchNextAction(progress) };
  };
  const checkFacts = (token, expected) => {
    const actual = facts(token);
    for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, key);
    return actual;
  };
  const sourceIdentity = full => {
    const stat = fs.lstatSync(full, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    return { name: path.basename(full), ino: String(stat.ino), dev: String(stat.dev), sha256: digest(fs.readFileSync(full)) };
  };
  const checkSources = sources => {
    for (const source of sources) assert.deepEqual(sourceIdentity(path.join(directory, source.name)), source);
  };
  const queueFor = (prefix, fixtures) => fixtures.map((fixture, index) => {
    const name = `${prefix}-${index}.${fixture.format}`, full = path.join(directory, name);
    fs.writeFileSync(full, fixture.bytes, { flag: 'wx' });
    const stat = fs.lstatSync(full);
    return { name, full, stat, sourceBytes: stat.size };
  });
  const begin = queue => {
    const result = batch.beginBatch({ expectedCount: queue.length, profile, queue });
    const journal = batch._test.readState(result.batch_token);
    assert.equal(journal.product_channel, channel);
    assert.equal(journal.profile, profile);
    return result.batch_token;
  };
  const packageText = entry => readOutput(entry.package_id, entry.read_capability, 0, 30000).text;
  const convertBuffer = channel === 'standalone'
    ? (bytes, extension, options) => Promise.resolve(
      require(path.join(server, 'standalone', 'markdown-extractor')).extractMarkdownBuffer(bytes, extension,
        options?.omitDocxHeaderFooter === true ? { omitDocxHeaderFooter: true } : {}))
    : undefined;
  const packageBody = entry => {
    const text = packageText(entry), divider = text.indexOf('-->\n\n');
    assert.ok(divider >= 0);
    const body = text.slice(divider + 5).trimEnd();
    assert.deepEqual(pii.scanResidual(body, profile), []);
    return body;
  };
  const docxScopeNotice = '> **DataSecure-Hinweis:** Anonymisiert wurde ausschließlich der lokal in Markdown umgewandelte Inhalt. ' +
    'Die DOCX-Struktur wurde vollständig geprüft; der freigegebene Dokumentumfang enthält bewusst keine Kopf- und Fußzeilen.\n\n';
  const semanticBodies = entries => canonicalizeBodies(entries.map((entry) => {
    const body = packageBody(entry);
    if (entry.format !== 'docx') return body;
    assert.ok(body.startsWith(docxScopeNotice), 'DOCX privacy output must disclose its Markdown-only policy scope');
    // The conversion boundary makes Office text inert Markdown. Remove only
    // that known presentation escaping for the cross-product semantic oracle;
    // the package-level tests retain byte-exact coverage of the visible form.
    return body.slice(docxScopeNotice.length)
      .replace(/\\([\\`*_[\]{}()#+.!|])/gu, '$1')
      .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  }));
  const packageIdentity = entry => {
    const full = path.join(roots().output, entry.package_id, `${entry.package_id}.md`);
    const stat = fs.lstatSync(full, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    return { sha256: digest(packageText(entry)), ino: String(stat.ino), dev: String(stat.dev) };
  };
  const checkPackages = entries => {
    for (const entry of entries) assert.deepEqual(packageIdentity(entry), entry.identity,
      'previously published packages must never be rewritten during resume/review');
  };
  const savedPackages = entries => entries.map(({ read_capability, ...entry }) => entry);
  const renewPackages = (token, entries) => {
    const journal = batch._test.readState(token);
    // Capabilities are intentionally process-local, not restart credentials.
    // Rebind only the exact previously released journal packages. The common
    // internal grant and real read verifier stay intact for both product roots;
    // the Plugin-only public result listing must not expose Standalone batches.
    for (const entry of entries) {
      assert.equal(entry.read_capability, undefined);
      assert.ok(journal.items.some(item => item.status === 'released' && item.package_id === entry.package_id));
      entry.read_capability = issueReadCapability(entry.package_id).read_capability;
    }
  };
  const recordPackage = (token, result) => {
    const entry = { package_id: result.package_id, read_capability: result.read_capability };
    const item = batch._test.readState(token).items.find(item => item.package_id === entry.package_id);
    assert.ok(item, 'published result must be bound to its journal item');
    assert.equal(item.document_result.grade, 'complete');
    return { ...entry, identity: packageIdentity(entry), grade: item.document_result,
      format: path.extname(item.name).slice(1).toLowerCase() };
  };
  const processClear = async token => {
    let publications = 0, extracted = 0;
    const result = await batch.processBatchNext(token, { reviewTextLocally: noUi, convertBuffer,
      onExtracted() { extracted++; }, beforePublish(release) {
        assert.match(release.reviewed_content_sha256, /^[a-f0-9]{64}$/u); publications++;
      } });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(publications, 1);
    assert.equal(extracted, 1, 'must execute the real format parser exactly once');
    assert.equal(uiCalls, 0);
    const entry = recordPackage(token, result);
    batch.acknowledgeDeliveredPackage(token, entry.package_id);
    return entry;
  };
  const abortAfterExtraction = async token => {
    const controller = new AbortController();
    let extracted = 0, publications = 0;
    const result = await batch.processBatchNext(token, { abortSignal: controller.signal, reviewTextLocally: noUi,
      convertBuffer,
      onExtracted() { extracted++; controller.abort(); }, beforePublish() { publications++; } });
    assert.equal(extracted, 1);
    assert.equal(publications, 0);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'REQUEST_CANCELLED');
    assert.equal(result.package_id, undefined);
    assert.equal(result.read_capability, undefined);
    assert.equal(uiCalls, 0);
  };
  const continueProduct = token => {
    const result = channel === 'standalone'
      ? batch.continueStandaloneBatch(token) : batch.continueMostRecentBatch();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.batch_token, token);
    return result;
  };
  const fixtures = formats.map(format => goldenFixture(format, profile));
  const expectedGolden = [...fixtures, ...fixtures].map(fixture => fixture.expected);

  if (stage === 'prepare') {
    const queue = queueFor('golden', [...fixtures, ...fixtures]);
    const sources = queue.map(entry => sourceIdentity(entry.full));
    const token = begin(queue), packages = [];
    for (const format of formats) { phase(`golden_release_${format}`); packages.push(await processClear(token)); }
    assert.deepEqual(semanticBodies(packages), fixtures.map(fixture => fixture.expected));
    for (const format of formats) { phase(`golden_abort_${format}`); await abortAfterExtraction(token); }
    checkPackages(packages);
    const progress = checkFacts(token, { batch_total: 8, released: 4, completed: 4, completion_percent: 50,
      remaining: 0, retryable: 4, deferred_review: 0, delivery_pending: 0, complete: false, next_action: 'batch' });
    checkSources(sources);
    save('prepared', { token, packages: savedPackages(packages), sources });
    return { stage, progress, formats, grades: packages.map(entry => entry.grade) };
  }

  if (stage === 'resume') {
    const prepared = load('prepared'), { token } = prepared;
    renewPackages(token, prepared.packages);
    checkSources(prepared.sources); checkPackages(prepared.packages);
    checkFacts(token, { released: 4, retryable: 4 });
    continueProduct(token);
    checkFacts(token, { released: 4, retryable: 0, remaining: 4 });
    // Repeating the adapter request must not enqueue duplicate work.
    continueProduct(token);
    checkFacts(token, { released: 4, retryable: 0, remaining: 4 });
    const packages = [...prepared.packages];
    for (const format of formats) { phase(`golden_resume_${format}`); packages.push(await processClear(token)); }
    checkPackages(prepared.packages); checkSources(prepared.sources);
    const canonical = semanticBodies(packages);
    assert.deepEqual(canonical, expectedGolden);
    const progress = checkFacts(token, { released: 8, completed: 8, completion_percent: 100,
      remaining: 0, retryable: 0, complete: true, next_action: 'none' });
    const summary = { stage, canonical, progress, grades: packages.map(entry => entry.grade) };
    if (!reviewProfiles.includes(profile)) return summary;

    // A clear result, four deferred formats and interrupted automatic work
    // exercise the real common readiness gate before any local draft/UI exists.
    const reviewFixtures = [fixtures[0], ...formats.map(format => reviewFixture(format)), fixtures[1]];
    const queue = queueFor('review', reviewFixtures);
    const sources = queue.map(entry => sourceIdentity(entry.full));
    const reviewToken = begin(queue);
    const clear = [await processClear(reviewToken)];
    let publicationCalls = 0;
    for (const format of formats) {
      phase(`review_defer_${format}`);
      const deferred = await batch.processBatchNext(reviewToken, { reviewTextLocally: noUi, convertBuffer,
        beforePublish() { publicationCalls++; } });
      assert.equal(deferred.error, 'LOCAL_REVIEW_DEFERRED');
      assert.equal(deferred.package_id, undefined);
      assert.equal(deferred.read_capability, undefined);
    }
    const reviewNotReady = async () => {
      const result = await batch.reviewDeferredBatch(reviewToken, { convertBuffer, reviewTextLocally: noUi });
      assert.equal(result.error, 'batch_review_not_ready');
      assert.equal(uiCalls, 0);
    };
    await reviewNotReady();
    await abortAfterExtraction(reviewToken);
    await reviewNotReady();
    checkFacts(reviewToken, { released: 1, deferred_review: 4, retryable: 1, remaining: 0, next_action: 'batch' });
    continueProduct(reviewToken);
    clear.push(await processClear(reviewToken));
    const ready = checkFacts(reviewToken, { released: 2, deferred_review: 4, retryable: 0,
      remaining: 0, next_action: 'review' });
    assert.equal(publicationCalls, 0); assert.equal(uiCalls, 0);
    const cancellations = [];
    for (const action of ['cancelled', 'deferred', 'invalid', 'aborted']) {
      phase(`review_${action}`);
      let calls = 0;
      const controller = new AbortController();
      if (action === 'aborted') controller.abort();
      const result = await batch.reviewDeferredBatch(reviewToken, { convertBuffer, abortSignal: controller.signal,
        reviewTextLocally(draft) {
          calls++;
          assert.equal(draft.batch_review.document_count, 4);
          assert.equal(draft.ambiguities.length, 4);
          return action === 'invalid' ? { action: 'reviewed', redactions: [], decisions: [] } : { action };
        }, beforePublish() { publicationCalls++; } });
      assert.equal(result.ok, false);
      assert.equal(result.error, action === 'deferred' ? 'LOCAL_REVIEW_DEFERRED' :
        action === 'invalid' ? 'LOCAL_REVIEW_FAILED' : 'LOCAL_REVIEW_CANCELLED');
      assert.equal(calls, action === 'aborted' ? 0 : 1);
      assert.deepEqual(result.packages, []);
      assert.deepEqual(facts(reviewToken), ready);
      assert.equal(publicationCalls, 0);
      checkPackages(clear);
      cancellations.push(result.error);
    }
    checkSources(sources);
    assert.doesNotMatch(JSON.stringify(batch._test.readState(reviewToken)), /Microsoft|Azure|Erika|Cloud Engineer/u);
    save('review-prepared', { token: reviewToken, sources, clear: savedPackages(clear), cancellations });
    return { ...summary, review: { progress: ready, cancellations } };
  }

  assert.ok(reviewProfiles.includes(profile));
  const prepared = load('review-prepared'), { token } = prepared;
  renewPackages(token, prepared.clear);
  checkSources(prepared.sources); checkPackages(prepared.clear);
  continueProduct(token);
  checkFacts(token, { released: 2, deferred_review: 4, next_action: 'review' });
  let calls = 0, publications = 0;
  const reviewed = await batch.reviewDeferredBatch(token, { convertBuffer, reviewTextLocally(draft) {
    calls++;
    assert.equal(draft.batch_review.document_count, 4);
    assert.equal(draft.batch_review.automatically_completed_count, 2);
    assert.equal(draft.ambiguities.length, 4);
    return { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item, index) => {
      assert.equal(draft.original_text.slice(item.original_start, item.original_end), 'Microsoft');
      return { ambiguity_id: item.ambiguity_id, decision: index % 2 ? 'redact' : 'keep' };
    }) };
  }, beforePublish(release) { assert.match(release.reviewed_content_sha256, /^[a-f0-9]{64}$/u); publications++; } });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  assert.equal(calls, 1); assert.equal(publications, 4);
  assert.equal(reviewed.reviewed_documents, 4); assert.equal(reviewed.failed_documents, 0);
  assert.equal(reviewed.packages.length, 4);
  const packages = reviewed.packages.map(entry => recordPackage(token, entry));
  checkFacts(token, { released: 2, deferred_review: 0, delivery_pending: 4, next_action: 'batch' });
  const repeated = await batch.reviewDeferredBatch(token, { convertBuffer, reviewTextLocally: noUi });
  assert.equal(repeated.error, 'batch_review_not_ready'); assert.equal(uiCalls, 0);
  checkPackages(prepared.clear); checkSources(prepared.sources);
  const canonical = semanticBodies([...prepared.clear, ...packages]);
  assert.deepEqual(canonical, [fixtures[0].expected, fixtures[1].expected,
    ...formats.map((format, index) => reviewFixture(format, index % 2 ? 'redact' : 'keep').expected)]);
  for (const entry of packages) batch.acknowledgeDeliveredPackage(token, entry.package_id);
  const progress = checkFacts(token, { released: 6, completed: 6, completion_percent: 100,
    deferred_review: 0, delivery_pending: 0, remaining: 0, complete: true, next_action: 'none' });
  return { stage, canonical, progress, grades: packages.map(entry => entry.grade) };
}

module.exports = { runProductScenarios };
