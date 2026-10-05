import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export function packagedReviewFixtures() {
  const table = '| Begriff | Fall |\n| --- | --- |\n' +
    '| SYNTHETISCHER HÄRTETEST | firma |\n'.repeat(750) +
    '| TESTRUN VERIFIZIERER | person |\n'.repeat(750);
  return new Map([
    ...['01-pruefung.md', '02-pruefung.md', '03-pruefung.md', '04-folgepruefung.md'].map((name, index) =>
      [name, Buffer.from('Name: Max Mustermann\nE-Mail: max@example.org\n' + table +
        (index === 3 ? '| SYNTHETISCHER FOLGETEST | hinweis |\n' : ''))]),
    ['05-nicht-verarbeitet.csv', Buffer.from('Name,Wert\nBeispiel,"nicht abgeschlossen\n')]
  ]);
}

// Shared by the real sidecar scenario and the operator-driven native campaign.
// Validate the complete fixture body, not merely a surviving first marker:
// missing/reordered rows, changed Sachzellen, extra rows and inconsistent IDs
// must all fail even when no original personal value remains in the output.
export function assertPackagedReviewOutputs(texts) {
  assert.equal(texts.length, 4, 'REVIEW_RESULTS_INCOMPLETE');
  let identities;
  const bodies = texts.map(text => {
    assert.doesNotMatch(text, /Max Mustermann|max@example\.org|SYNTHETISCHER HÄRTETEST|TESTRUN VERIFIZIERER/u);
    const start = /^Name: (\[PERSON_\d+\])\nE-Mail: (\[EMAIL_(?:REDACTED|\d+)\])\n/mu.exec(text);
    assert.ok(start, 'REVIEW_HEADER_REDACTIONS_INCOMPLETE');
    const body = text.slice(start.index);
    const companies = [...body.matchAll(/^\| (\[UNTERNEHMEN_\d+\]) \| firma \|$/gmu)];
    const persons = [...body.matchAll(/^\| (\[PERSON_\d+\]) \| person \|$/gmu)];
    assert.equal(companies.length, 750, 'REVIEW_COMPANY_ROWS_INCOMPLETE');
    assert.equal(persons.length, 750, 'REVIEW_PERSON_ROWS_INCOMPLETE');
    const current = { name: start[1], email: start[2], company: companies[0][1], person: persons[0][1] };
    assert.notEqual(current.name, current.person, 'REVIEW_DISTINCT_PERSONS_COLLAPSED');
    assert.ok(companies.every(match => match[1] === current.company), 'REVIEW_COMPANY_IDS_INCONSISTENT');
    assert.ok(persons.every(match => match[1] === current.person), 'REVIEW_PERSON_IDS_INCONSISTENT');
    if (!identities) identities = current;
    else assert.deepEqual(current, identities, 'REVIEW_RUN_IDS_INCONSISTENT');
    return body;
  });
  const expected = [...packagedReviewFixtures()].filter(([name]) => name.endsWith('.md')).map(([, bytes]) =>
    bytes.toString('utf8').replaceAll('Max Mustermann', identities.name)
      .replaceAll('max@example.org', identities.email)
      .replaceAll('SYNTHETISCHER HÄRTETEST', identities.company)
      .replaceAll('TESTRUN VERIFIZIERER', identities.person));
  assert.deepEqual(bodies.sort(), expected.sort(), 'REVIEW_COMPLETE_BODY_CHANGED');
  return identities;
}

// Only actual private framed IPC is accepted here. The caller starts/restarts
// the runtime extracted from the exact archive; no source worker, parser,
// privacy callback or journal mock substitutes for the packaged chain.
// This is a packaged sidecar integration scenario, NOT a Tauri/WebView test.
export async function runPackagedReviewScenario({ request: initialRequest, restart, sourceDirectory,
  evidenceScope = 'packaged-sidecar' }) {
  assert.ok(['packaged-sidecar', 'source-runtime'].includes(evidenceScope), 'REVIEW_EVIDENCE_SCOPE_INVALID');
  let request = initialRequest;
  let sequence = 0x7000;
  const send = async (action, fields = {}) => {
    const answer = await request({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: (++sequence).toString(16).padStart(16, '0'), action, ...fields });
    assert.equal(answer.ok, true, `${action}: ${JSON.stringify(answer)}`);
    return answer.result;
  };
  async function until(check, description, timeout = 120000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await check(); if (value) return value;
      assert.ok(Date.now() < deadline, description);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  async function readDraft(session) {
    const parts = [];
    for (let index = 0; index < session.chunk_count; index++) {
      const value = await send('get_review_chunk', { review_id: session.review_id, chunk_index: index });
      parts.push(Buffer.from(value.data, 'base64'));
    }
    const draft = JSON.parse(Buffer.concat(parts).toString('utf8'));
    assert.equal(draft.schema, 'data-secure-text-review/3');
    return draft;
  }
  const fixtures = packagedReviewFixtures();
  const directory = path.join(sourceDirectory, 'Paketgebundene-Pruefung');
  fs.mkdirSync(directory, { recursive: true });
  const sources = [...fixtures].map(([name, bytes]) => {
    const file = path.join(directory, name); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file;
  });
  assert.equal((await send('admit_selected_sources', { source_kind: 'files', source_paths: sources })).selected_count, 5);
  await send('start_admitted_batch', { processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral' });
  const row = await until(async () => {
    const history = await send('get_run_history');
    const item = history.entries[0];
    if (item?.status !== 'review_required') return false;
    return (await send('get_public_state')).state === 'review_required' ? item : false;
  }, 'the packaged 1,500-findings-per-document run must reach a resumable real review');
  const failures = await send('get_run_failures', { batch_id: row.batch_id });
  assert.equal(failures.total, 1);
  assert.equal(failures.files.length, 1);
  assert.equal(failures.files[0].name, '05-nicht-verarbeitet.csv',
    'the exact failed filename AND extension must cross the actual packaged private IPC');
  assert.equal(failures.files[0].reason_code, 'PARSE_FAILED',
    'privacy parsing exposes a fixed safe reason, not a raw parser exception');
  await send('continue_history_batch', { batch_id: row.batch_id });
  let ready = await until(async () => { const value = await send('get_review_session'); return value.ready ? value : false; }, 'first actual group');
  let draft = await readDraft(ready);
  assert.equal(draft.ambiguities.length, 4500, 'three 1,500-finding documents form the first real group under the 5,000 cap');
  const originalAmbiguities = draft.ambiguities;
  await send('submit_review', { review_id: ready.review_id, answer: { action: 'deferred' } });
  await until(async () => (await send('get_review_session')).continuation_available, 'defer must finish the owning worker before restart');
  request = await restart();
  const historyAfterRestart = await send('get_run_history');
  const recovered = historyAfterRestart.entries.find(item => item.batch_id === row.batch_id);
  assert.equal(recovered.status, 'review_required');
  assert.equal(recovered.resumable, true, 'real process restart must retain the exact unresolved run');
  const unbound = await send('get_review_session');
  assert.equal(unbound.ready, false, 'a fresh process cannot claim the previous private renderer session');
  await send('continue_history_batch', { batch_id: row.batch_id });
  ready = await until(async () => { const value = await send('get_review_session'); return value.ready ? value : false; }, 'same first group after process restart');
  draft = await readDraft(ready);
  assert.deepEqual(draft.ambiguities, originalAmbiguities, 'defer/restart must not lose or substitute occurrence bindings');
  const decisions = draft.ambiguities.map(candidate => {
    const value = draft.original_text.slice(candidate.original_start, candidate.original_end);
    assert.ok(['SYNTHETISCHER HÄRTETEST', 'TESTRUN VERIFIZIERER'].includes(value), value);
    return { ambiguity_id: candidate.ambiguity_id,
      decision: value === 'SYNTHETISCHER HÄRTETEST' ? 'redact_organization' : 'redact' };
  });
  await send('submit_review', { review_id: ready.review_id, answer: { action: 'reviewed', redactions: [], decisions } });
  const following = await until(async () => {
    const value = await send('get_review_session');
    return value.ready && value.review_id !== ready.review_id ? value : false;
  }, 'the next group must appear automatically in the same bound review session, with no extra Continue call');
  const followingDraft = await readDraft(following);
  assert.equal(followingDraft.ambiguities.length, 1,
    'all 1,500 previously decided company/person occurrences in the following document must be reused');
  const candidate = followingDraft.ambiguities[0];
  assert.equal(followingDraft.original_text.slice(candidate.original_start, candidate.original_end), 'SYNTHETISCHER FOLGETEST');
  await send('submit_review', { review_id: following.review_id, answer: { action: 'reviewed', redactions: [],
    decisions: [{ ambiguity_id: candidate.ambiguity_id, decision: 'keep' }] } });
  await until(async () => (await send('get_review_session')).run_complete === true, 'both packaged review groups and export must complete');
  const complete = (await send('get_run_history')).entries.find(item => item.batch_id === row.batch_id);
  assert.equal(complete.result_count, 4); assert.equal(complete.failed_count, 1); assert.equal(complete.resumable, false);
  const output = await send('resolve_history_results', { batch_id: row.batch_id });
  const results = fs.readdirSync(output.local_path).filter(name => name.endsWith('.md'));
  assert.equal(results.length, 4);
  const texts = results.map(name => fs.readFileSync(path.join(output.local_path, name), 'utf8'));
  assertPackagedReviewOutputs(texts);
  for (const [index, source] of sources.entries()) assert.deepEqual(fs.readFileSync(source), [...fixtures.values()][index]);
  const finalFailures = await send('get_run_failures', { batch_id: row.batch_id });
  assert.deepEqual(finalFailures.files, failures.files, 'failure names survive processing, human review, and process restart');
  const label = evidenceScope === 'packaged-sidecar' ? 'PACKAGED' : 'SOURCE RUNTIME';
  process.stdout.write(`STANDALONE ${label} REVIEW IPC PASS (1,500 findings/file; 4,500-first-group; company/person; automatic follow-up; defer + restart; run-wide choices; exact CSV filename; no Tauri/WebView interaction claim)\n`);
}
