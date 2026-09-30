'use strict';

const invoke = window.__TAURI__?.core?.invoke;
const el = (id) => document.getElementById(id);
const state = { draft: null, reviewId: null, cursor: 0, choices: new Map(), history: [],
  waiting: false, submitted: false, closed: false, continuing: false, continuationAvailable: false };

function setWaiting(message, working = false) {
  el('review').hidden = true;
  for (const id of ['exact-text', 'source-context', 'output-context', 'group-note']) {
    el(id).textContent = '';
  }
  el('waiting').hidden = false;
  el('work-indicator').hidden = !working;
  if (el('waiting-text').textContent !== message) el('waiting-text').textContent = message;
  const summary = working ? 'DataSecure arbeitet im Hintergrund …' : message;
  if (el('summary').textContent !== summary) el('summary').textContent = summary;
  el('continue-review').hidden = !state.continuationAvailable;
}

function groupIds(candidate) {
  const group = state.draft.decision_groups?.find((item) => item.candidate_ids?.includes(candidate.ambiguity_id));
  if (!group) return [candidate.ambiguity_id];
  return ['person_prose_ambiguous', 'person_residual_ambiguous'].includes(candidate.type)
    ? group.candidate_ids : [candidate.ambiguity_id];
}

function context(text, start, end) {
  const from = Math.max(0, start - 180);
  const to = Math.min(text.length, end + 220);
  return `${from ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
}

function documentPosition(start) {
  const prefix = state.draft.original_text.slice(0, start);
  const matches = prefix.match(/===== Dokument \d+ von \d+ =====/gu);
  return matches?.length || 1;
}

function render() {
  const draft = state.draft;
  if (!draft) return;
  const items = draft.ambiguities;
  if (state.cursor >= items.length) state.cursor = items.length - 1;
  const candidate = items[state.cursor];
  const exact = draft.original_text.slice(candidate.original_start, candidate.original_end);
  const count = groupIds(candidate).length;
  const credential = candidate.type === 'credential_issuer_ambiguous';
  el('summary').textContent = `${state.choices.size} von ${items.length} Stellen entschieden. Nur die aktive Fundstelle ist unten zu beurteilen.`;
  el('document-position').textContent = `Dokument ${documentPosition(candidate.original_start)} von ${draft.batch_review?.document_count || 1}`;
  el('finding-position').textContent = `Fundstelle ${state.cursor + 1} von ${items.length}`;
  el('finding-title').textContent = credential ? 'Muss diese Angabe ersetzt werden?' : 'Ist dies ein Personenname?';
  el('exact-text').textContent = exact;
  el('group-note').textContent = count > 1
    ? `Diese Entscheidung gilt für ${count} nachweislich gleiche Fundstellen in diesem Stapel.`
    : 'Diese Entscheidung gilt nur für die angezeigte Fundstelle.';
  el('source-context').textContent = context(draft.original_text, candidate.original_start, candidate.original_end);
  el('output-context').textContent = context(draft.anonymized_text, candidate.anonymized_start, candidate.anonymized_end);
  el('redact').textContent = credential ? 'Angabe ersetzen' : 'Als Person anonymisieren';
  el('keep').textContent = credential ? 'Angabe beibehalten' : 'Kein Personenname – beibehalten';
  el('release').disabled = state.choices.size !== items.length;
  el('undo').disabled = state.history.length === 0;
  el('waiting').hidden = true;
  el('review').hidden = false;
}

function decide(value) {
  const ids = groupIds(state.draft.ambiguities[state.cursor]);
  state.history.push(ids.map((id) => [id, state.choices.get(id)]));
  for (const id of ids) state.choices.set(id, value);
  const next = state.draft.ambiguities.findIndex((item) => !state.choices.has(item.ambiguity_id));
  if (next >= 0) state.cursor = next;
  render();
  if (next >= 0) el('exact-text').focus();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  for (const [id, value] of previous) {
    if (value === undefined) state.choices.delete(id);
    else state.choices.set(id, value);
  }
  const index = state.draft.ambiguities.findIndex((item) => item.ambiguity_id === previous[0][0]);
  if (index >= 0) state.cursor = index;
  render();
  el('exact-text').focus();
}

async function sendAnswer(answer) {
  if (state.waiting || !state.reviewId) return;
  state.waiting = true;
  try {
    await invoke('submit_review', { reviewId: state.reviewId, answer });
    state.draft = null;
    state.reviewId = null;
    state.choices.clear();
    state.history = [];
    state.submitted = answer.action === 'reviewed';
    setWaiting(answer.action === 'deferred'
      ? 'Prüfung vertagt. Der Lauf bleibt im Verlauf unter „Prüfung offen“ und kann dort fortgesetzt werden.'
      : 'Prüfentscheidung übernommen. Weitere Fundstellen erscheinen, falls nötig, in diesem Fenster.',
    answer.action === 'reviewed');
    if (answer.action === 'reviewed') window.setTimeout(poll, 1200);
  } catch {
    state.waiting = false;
    el('summary').textContent = 'Die Entscheidung konnte nicht sicher bestätigt werden. Es wurde nichts freigegeben.';
  }
}

function decodeChunks(parts) {
  const bytes = parts.map((part) => Uint8Array.from(atob(part), (char) => char.charCodeAt(0)));
  const total = bytes.reduce((size, part) => size + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of bytes) { joined.set(part, offset); offset += part.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined);
}

async function poll() {
  if (!invoke || state.draft || state.closed || state.continuing) return;
  try {
    const session = await invoke('get_review_session');
    if (!session.ready) {
      state.waiting = false;
      if (state.submitted && session.run_complete === true) {
        state.continuationAvailable = false;
        setWaiting('Der Lauf ist abgeschlossen. Das Prüffenster wird geschlossen.');
        await closeReviewWindow();
        return;
      }
      state.continuationAvailable = session.continuation_available === true;
      setWaiting(state.continuationAvailable
        ? 'Weitere Fundstellen in diesem Lauf benötigen eine Entscheidung. Du kannst die Prüfung hier fortsetzen.'
        : state.submitted
          ? 'Deine Entscheidung ist gespeichert. DataSecure verarbeitet sie und prüft, ob weitere Fundstellen folgen. Bitte dieses Fenster offen lassen.'
          : 'Die lokale Verarbeitung bereitet die Fundstellen vor. Bitte dieses Fenster offen lassen.',
      !state.continuationAvailable);
      window.setTimeout(poll, 1200);
      return;
    }
    if (!/^[a-f0-9]{32}$/u.test(session.review_id) ||
        !Number.isInteger(session.chunk_count) || session.chunk_count < 1 || session.chunk_count > 320) throw Error('invalid session');
    const parts = [];
    for (let index = 0; index < session.chunk_count; index++) {
      const chunk = await invoke('get_review_chunk', { reviewId: session.review_id, chunkIndex: index });
      if (chunk.review_id !== session.review_id || chunk.index !== index || typeof chunk.data !== 'string') throw Error('invalid chunk');
      parts.push(chunk.data);
    }
    const draft = JSON.parse(decodeChunks(parts));
    if (draft.schema !== 'data-secure-text-review/3' || !Array.isArray(draft.ambiguities) || !draft.ambiguities.length) throw Error('invalid draft');
    state.reviewId = session.review_id;
    state.draft = draft;
    state.cursor = 0;
    state.submitted = false;
    state.continuationAvailable = false;
    state.waiting = false;
    render();
    el('exact-text').focus();
  } catch {
    state.waiting = false;
    setWaiting('Die lokale Prüfung konnte nicht sicher geladen werden. Bitte den Status im Hauptfenster prüfen und hier erneut versuchen.');
  }
}

async function continueReview() {
  if (!invoke || state.closed || state.continuing || !state.continuationAvailable) return;
  state.continuing = true;
  state.continuationAvailable = false;
  setWaiting('Der nächste Prüfschritt für denselben Lauf wird gestartet. Bitte warten …', true);
  try {
    const result = await invoke('continue_review_session');
    if (result?.ok !== true) throw Error('review continuation not confirmed');
    setWaiting('Der nächste Prüfschritt läuft. Weitere Fundstellen erscheinen hier, sobald sie bereit sind.', true);
    window.setTimeout(poll, 1200);
  } catch {
    setWaiting('Die Fortsetzung wurde nicht bestätigt. Bitte den Status erneut prüfen; ungeprüfte Ergebnisse bleiben gesperrt.');
  } finally {
    state.continuing = false;
  }
}

async function closeReviewWindow() {
  if (state.closed) return;
  state.closed = true;
  try { await invoke('close_review_window'); }
  catch {
    state.closed = false;
    setWaiting('Das Fenster konnte nicht automatisch geschlossen werden. Bitte über das X in der Titelleiste schließen. Der Lauf bleibt sicher gespeichert.');
  }
}

el('redact').addEventListener('click', () => decide('redact'));
el('keep').addEventListener('click', () => decide('keep'));
el('undo').addEventListener('click', undo);
el('defer').addEventListener('click', () => sendAnswer({ action: 'deferred' }));
el('release').addEventListener('click', () => {
  if (!state.draft || state.choices.size !== state.draft.ambiguities.length) return;
  sendAnswer({ action: 'reviewed', redactions: [],
    decisions: state.draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id,
      decision: state.choices.get(item.ambiguity_id) })) });
});
el('retry').addEventListener('click', poll);
el('continue-review').addEventListener('click', continueReview);
el('close-review').addEventListener('click', closeReviewWindow);
poll();
