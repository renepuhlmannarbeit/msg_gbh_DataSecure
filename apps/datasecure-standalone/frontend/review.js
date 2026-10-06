'use strict';

const invoke = window.__TAURI__?.core?.invoke;
const el = (id) => document.getElementById(id);
const state = { draft: null, reviewId: null, cursor: 0, choices: new Map(), history: [],
  waiting: false, submitted: false, closed: false, continuing: false, continuationAvailable: false,
  generation: 0, loadGeneration: null, pollTimer: null, pollFailures: 0,
  uncertainAnswer: null, continuationFailure: null, continuationSnapshot: null, lastSession: null };
const START_FAILURE_TEXT = Object.freeze({
  LOCAL_REVIEW_START_MISSING: 'Eine benötigte lokale Laufzeit oder Prüfkomponente wurde nicht gefunden.',
  LOCAL_REVIEW_START_DENIED: 'Das Betriebssystem hat den Start der lokalen Prüfkomponente verweigert. Prüfe Ausführungsrechte und Sicherheitsrichtlinien.',
  LOCAL_REVIEW_START_ARCHITECTURE: 'Die lokale Prüfkomponente passt nicht zur Architektur oder zum ausführbaren Format dieses Geräts.',
  LOCAL_REVIEW_START_FAILED: 'Die lokale Prüfkomponente konnte nicht gestartet werden.'
});
const REVIEW_FAILURE_TEXT = Object.freeze({
  OCR_CONTACT_REVIEW_INVALID: 'Die gespeicherte OCR-Kontaktentscheidung passt nicht mehr zur unveränderten Quelle oder konnte nicht sicher gelesen werden. Wähle die Originaldateien für einen neuen Lauf aus; eine alte Entscheidung wird nicht automatisch übernommen.',
  LOCAL_REVIEW_FAILED: 'Die Vorbereitung oder Verarbeitung der lokalen Prüfung ist fehlgeschlagen.',
  LOCAL_REVIEW_TIMEOUT: 'Die lokale Prüfung konnte nicht innerhalb der vorgesehenen Vorbereitungszeit bereitgestellt werden.',
  LOCAL_REVIEW_CANCELLED: 'Die lokale Prüfung wurde abgebrochen.',
  LOCAL_REVIEW_WORKER_EXITED: 'Die lokale Prüfkomponente wurde beendet, bevor der Prüfschritt sicher abgeschlossen war.',
  BATCH_REVIEW_RECONSTRUCTION_FAILED: 'Die offenen Fundstellen konnten aus den gespeicherten lokalen Daten nicht sicher wiederhergestellt werden.'
});

function reviewFailureMessage(session) {
  let message;
  if (Object.hasOwn(START_FAILURE_TEXT, session.error_code)) {
    message = `${START_FAILURE_TEXT[session.error_code]} (${session.error_code})`;
  } else if (session.error_code === 'LOCAL_REVIEW_TOO_LARGE') {
    message = 'Dieses Dokument überschreitet die lokale Prüfgrenze von 5.000 Entitätsfundstellen, 400 OCR-Kontaktwerten oder die Textgrößengrenze (LOCAL_REVIEW_TOO_LARGE). Teile es in kleinere Quelldateien und beginne dafür einen neuen Lauf.';
  } else {
    const code = Object.hasOwn(REVIEW_FAILURE_TEXT, session.error_code) ? session.error_code : 'LOCAL_REVIEW_FAILED';
    message = `${REVIEW_FAILURE_TEXT[code]} (${code})`;
  }
  message += ' Ungeprüfte Ergebnisse bleiben gesperrt.';
  if (session.retry_available === true) message += ' Du kannst den Prüfschritt für denselben Lauf nach der Behebung erneut starten.';
  else if (session.worker_active === true) message += ' DataSecure beendet den Prüfschritt sicher; warte bis die Fortsetzung bereit ist.';
  const names = Array.isArray(session.affected_files)
    ? session.affected_files.slice(0, 200).filter((name) => typeof name === 'string' && name.length > 0) : [];
  if (names.length) message += `\nFür diese Prüfung vorgemerkte Dateien:\n${names.map((name) => `• ${name}`).join('\n')}`;
  return message;
}

function setWaiting(message, working = false) {
  el('review').hidden = true;
  for (const id of ['exact-text', 'source-context', 'output-context', 'group-note']) {
    el(id).textContent = '';
  }
  el('contact-value').value = '';
  el('contact-correction').hidden = true;
  el('contact-error').textContent = '';
  el('waiting').hidden = false;
  el('work-indicator').hidden = !working;
  if (el('waiting-text').textContent !== message) el('waiting-text').textContent = message;
  const summary = working ? 'DataSecure arbeitet im Hintergrund …' : message;
  if (el('summary').textContent !== summary) el('summary').textContent = summary;
  el('continue-review').hidden = !state.continuationAvailable;
  el('continue-review').disabled = state.continuing;
}

function cancelPoll() {
  if (state.pollTimer !== null) window.clearTimeout(state.pollTimer);
  state.pollTimer = null;
}

function schedulePoll(delay = 1200) {
  cancelPoll();
  if (state.closed || state.draft) return;
  state.pollTimer = window.setTimeout(() => {
    state.pollTimer = null;
    return poll();
  }, delay);
}

function invalidateLoads() {
  state.generation += 1;
  state.loadGeneration = null;
  cancelPoll();
}

function clearDraft() {
  state.draft = null;
  state.reviewId = null;
  state.choices.clear();
  state.history = [];
}

function safeFailureCode(error) {
  let code = typeof error === 'string' ? error : error?.code;
  if (typeof code === 'string' && code.startsWith('{')) {
    try { code = JSON.parse(code).error_code; } catch { code = null; }
  }
  return Object.hasOwn(START_FAILURE_TEXT, code) || Object.hasOwn(REVIEW_FAILURE_TEXT, code) ||
    code === 'LOCAL_REVIEW_TOO_LARGE' ? code : 'LOCAL_REVIEW_FAILED';
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

function documentPositions(draft) {
  const result = new Map();
  const total = draft.batch_review?.document_count || 1;
  if (total === 1) { for (const candidate of draft.ambiguities) result.set(candidate.ambiguity_id, 1); return result; }
  const documents = draft.batch_review?.documents;
  if (!Number.isSafeInteger(total) || total < 1 || total > 200 || !Array.isArray(documents) || documents.length !== total) throw Error('invalid document metadata');
  const ids = new Set(draft.ambiguities.map(candidate => candidate.ambiguity_id));
  documents.forEach((document, index) => {
    if (document?.document_index !== index + 1 || !Array.isArray(document.candidate_ids)) throw Error('invalid document metadata');
    for (const id of document.candidate_ids) {
      if (!ids.has(id) || result.has(id)) throw Error('invalid document metadata');
      result.set(id, document.document_index);
    }
  });
  if (result.size !== ids.size) throw Error('invalid document metadata');
  return result;
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
  const contact = draft.ocr_contact_review === true && candidate.type === 'ocr_contact_ambiguous';
  const organizationEnabled = !contact && !credential && draft.allow_organization_review === true;
  el('summary').textContent = `${state.choices.size} von ${items.length} Stellen entschieden. Nur die aktive Fundstelle ist unten zu beurteilen.`;
  el('document-position').textContent = `Dokument ${state.documentPositions.get(candidate.ambiguity_id)} von ${draft.batch_review?.document_count || 1}`;
  el('finding-position').textContent = `Fundstelle ${state.cursor + 1} von ${items.length}`;
  el('finding-title').textContent = contact ? 'Wurde dieser Kontaktwert richtig erkannt?' : credential ? 'Muss diese Angabe ersetzt werden?' : 'Wie soll diese Fundstelle behandelt werden?';
  el('exact-text').textContent = exact;
  el('group-note').textContent = count > 1
    ? `Diese Entscheidung gilt für ${count} nachweislich gleiche Fundstellen in diesem Stapel.`
    : organizationEnabled ? 'Aktuell angezeigt: eine Fundstelle dieser vollständigen Schreibweise.'
      : 'Diese Entscheidung gilt nur für die angezeigte Fundstelle.';
  if (organizationEnabled) el('group-note').textContent +=
    ' Die gewählte Behandlung gilt für dieselbe vollständige Schreibweise in offenen und folgenden Prüfungen dieses Laufs – auch in anderen Dokumenten. Bereits fertige Ergebnisse werden nicht nachträglich geändert.';
  if (contact) el('group-note').textContent = `OCR: Seite/Bild ${candidate.page}, Zeile ${candidate.line}. ` +
    'Vergleiche jedes Zeichen mit dem Original. Diese Bestätigung betrifft nur die Texterkennung; danach durchläuft der bestätigte Text die normale Anonymisierung und Restprüfung. Hohe OCR-Sicherheit ersetzt diese Prüfung nicht.';
  el('source-context').textContent = context(draft.original_text, candidate.original_start, candidate.original_end);
  const choice = state.choices.get(candidate.ambiguity_id);
  const marker = choice === 'redact_organization' ? '[UNTERNEHMEN_…]' : choice === 'redact' ?
    credential ? '[MANUAL_REDACTION]' : '[PERSON_…]' : null;
  const contactValue = contact && choice?.decision === 'correct_contact' ? choice.replacement : null;
  const replacement = contactValue || marker;
  const preview = replacement ? draft.anonymized_text.slice(0, candidate.anonymized_start) + replacement +
    draft.anonymized_text.slice(candidate.anonymized_end) : draft.anonymized_text;
  el('output-context').textContent = context(preview, candidate.anonymized_start,
    replacement ? candidate.anonymized_start + replacement.length : candidate.anonymized_end);
  el('output-title').textContent = contact ? 'Bestätigter Texteingang (noch nicht anonymisiert)' : 'Vorgesehene Ausgabe';
  el('contact-correction').hidden = !contact;
  el('contact-value').value = contactValue || exact;
  el('contact-error').textContent = '';
  el('redact').textContent = contact ? 'Kontaktwert korrigieren' : credential ? 'Angabe ersetzen' : 'Als Person anonymisieren';
  el('redact-organization').hidden = !organizationEnabled;
  el('keep').textContent = contact ? 'OCR-Wert unverändert bestätigen' : credential ? 'Angabe beibehalten' : 'Beibehalten';
  el('release').textContent = contact ? 'Kontaktwerte bestätigen und weiter' : 'Geprüft freigeben';
  el('release').disabled = state.choices.size !== items.length;
  el('undo').disabled = state.history.length === 0;
  el('waiting').hidden = true;
  el('review').hidden = false;
}

function decide(value) {
  if (!state.draft || state.waiting || (value === 'redact_organization' &&
      (state.draft.allow_organization_review !== true ||
        state.draft.ambiguities[state.cursor].type === 'credential_issuer_ambiguous'))) return;
  const candidate = state.draft.ambiguities[state.cursor];
  if (state.draft.ocr_contact_review === true) {
    if (value === 'redact') {
      const replacement = el('contact-value').value;
      if (!replacement || replacement !== replacement.trim() || replacement.length > 256 || /[\p{Cc}\p{Cf}\p{Cs}\[\]`<>|]/u.test(replacement) ||
          (candidate.contact_kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(replacement)) ||
          (candidate.contact_kind === 'phone' && (!/^\+?[\d ()./-]{6,}$/u.test(replacement) || !/\d/u.test(replacement)))) {
        el('contact-error').textContent = 'Bitte einen gültigen Kontaktwert ohne Zeilenumbrüche, Steuerzeichen oder Markdown eingeben (höchstens 256 Zeichen).';
        return;
      }
      value = { decision: 'correct_contact', replacement };
    } else if (value === 'keep') value = { decision: 'confirm_contact' };
    else return;
  }
  const ids = groupIds(candidate);
  state.history.push(ids.map((id) => [id, state.choices.get(id)]));
  for (const id of ids) state.choices.set(id, value);
  const next = state.draft.ambiguities.findIndex((item) => !state.choices.has(item.ambiguity_id));
  if (next >= 0) state.cursor = next;
  render();
  if (next >= 0) el('exact-text').focus();
}

function undo() {
  if (!state.draft || state.waiting || state.closed) return;
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
  if (state.waiting || state.closed || !state.reviewId) return;
  invalidateLoads();
  const generation = state.generation;
  const pending = { reviewId: state.reviewId, action: answer.action,
    choices: new Map(state.choices), history: state.history.slice(), cursor: state.cursor };
  state.waiting = true;
  try {
    const result = await invoke('submit_review', { reviewId: state.reviewId, answer });
    if (state.closed || generation !== state.generation) return;
    if (result?.accepted !== true) throw Error('review answer not confirmed');
    clearDraft();
    state.uncertainAnswer = null;
    state.submitted = answer.action === 'reviewed';
    state.waiting = false;
    setWaiting(answer.action === 'deferred'
      ? 'Prüfung vertagt. Der Lauf bleibt im Verlauf unter „Prüfung offen“ und kann dort fortgesetzt werden.'
      : 'Prüfentscheidung übernommen. Weitere Fundstellen erscheinen, falls nötig, in diesem Fenster.',
    answer.action === 'reviewed');
    if (answer.action === 'reviewed') schedulePoll();
  } catch {
    if (state.closed || generation !== state.generation) return;
    // The worker may already have accepted/published the reviewed decision.
    // Never replay it automatically or claim that nothing was released.
    clearDraft();
    state.uncertainAnswer = pending;
    state.waiting = false;
    state.continuationAvailable = false;
    setWaiting('Die Bestätigung deiner Entscheidung ist unklar. Sie kann bereits übernommen worden sein. DataSecure prüft den zugehörigen Lauf; bitte nicht erneut starten.', true);
    await poll();
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
  if (!invoke || state.draft || state.closed || state.continuing || state.waiting || state.loadGeneration !== null) return;
  cancelPoll();
  const generation = state.generation;
  state.loadGeneration = generation;
  el('retry').disabled = true;
  const current = () => !state.closed && generation === state.generation;
  try {
    const session = await invoke('get_review_session');
    if (!current()) return;
    state.lastSession = session;
    state.pollFailures = 0;
    if (!session.ready) {
      state.waiting = false;
      if (session.run_complete === true) {
        state.continuationAvailable = false;
        setWaiting('Der Lauf ist abgeschlossen. Das Prüffenster wird geschlossen.');
        state.uncertainAnswer = null;
        await closeReviewWindow();
        return;
      }
      state.continuationAvailable = session.continuation_available === true;
      el('continue-review').textContent = session.retry_available === true ? 'Prüfung erneut starten' : 'Prüfung fortsetzen';
      if (session.phase === 'failed') {
        state.continuationFailure = null;
        setWaiting(reviewFailureMessage(session), false);
      } else if (session.phase === 'export_pending') {
        setWaiting('Die Prüfung ist gespeichert, aber der Ergebnisexport ist noch nicht abgeschlossen. Prüfe den Exporthinweis beim zugehörigen Lauf im Hauptfenster. Es ist keine weitere Prüfentscheidung erforderlich.', false);
      } else if (session.phase === 'unbound') {
        state.uncertainAnswer = null;
        state.continuationFailure = null;
        setWaiting('Dieses Prüffenster ist nicht mehr mit dem ausgewählten Lauf verbunden. Schließe es und öffne die Prüfung beim passenden Lauf erneut.', false);
        return;
      } else setWaiting(state.uncertainAnswer
        ? 'Die Bestätigung deiner Entscheidung ist unklar. DataSecure prüft den zugehörigen Lauf. Bereits geprüfte Ergebnisse können verfügbar sein; die Entscheidung wird nicht automatisch erneut gesendet.'
        : state.continuationFailure
          ? `${reviewFailureMessage({ ...state.continuationSnapshot, error_code: state.continuationFailure, retry_available: false })}\nBeim letzten Fortsetzungsversuch wurde dieser Fehler gemeldet. DataSecure prüft den aktuellen Laufstatus; bitte nicht erneut starten.`
        : state.continuationAvailable
        ? 'Weitere Fundstellen in diesem Lauf benötigen eine Entscheidung. Du kannst die Prüfung hier fortsetzen.'
        : state.submitted
          ? 'Deine Entscheidung ist gespeichert. DataSecure verarbeitet sie und prüft, ob weitere Fundstellen folgen. Bitte dieses Fenster offen lassen.'
          : 'Die lokale Verarbeitung bereitet die Fundstellen vor. Bitte dieses Fenster offen lassen.',
      !state.continuationAvailable);
      schedulePoll();
      return;
    }
    if (!/^[a-f0-9]{32}$/u.test(session.review_id) ||
        !Number.isInteger(session.chunk_count) || session.chunk_count < 1 || session.chunk_count > 320) throw Error('invalid session');
    const parts = [];
    for (let index = 0; index < session.chunk_count; index++) {
      const chunk = await invoke('get_review_chunk', { reviewId: session.review_id, chunkIndex: index });
      if (!current()) return;
      if (chunk.review_id !== session.review_id || chunk.index !== index || typeof chunk.data !== 'string') throw Error('invalid chunk');
      parts.push(chunk.data);
    }
    const draft = JSON.parse(decodeChunks(parts));
    if (draft.schema !== 'data-secure-text-review/3' || !Array.isArray(draft.ambiguities) || !draft.ambiguities.length) throw Error('invalid draft');
    state.documentPositions = documentPositions(draft);
    state.reviewId = session.review_id;
    state.draft = draft;
    state.cursor = 0;
    state.submitted = false;
    state.continuationAvailable = false;
    state.waiting = false;
    state.continuationFailure = null;
    const pending = state.uncertainAnswer;
    state.uncertainAnswer = null;
    if (pending?.reviewId === session.review_id) {
      const ids = new Set(draft.ambiguities.map((item) => item.ambiguity_id));
      state.choices = new Map([...pending.choices].filter(([id]) => ids.has(id)));
      state.history = pending.history;
      state.cursor = Math.min(pending.cursor, draft.ambiguities.length - 1);
    }
    render();
    if (pending?.reviewId === session.review_id) el('summary').textContent =
      'Die Entscheidung ist nicht bestätigt; dieser Prüfschritt ist weiterhin offen. Deine Eingaben sind erhalten. Bitte prüfen und bewusst erneut freigeben oder später entscheiden.';
    el('exact-text').focus();
  } catch {
    if (!current()) return;
    state.waiting = false;
    state.continuationAvailable = false;
    state.pollFailures += 1;
    setWaiting(state.uncertainAnswer
      ? 'Die Bestätigung deiner Entscheidung und der Laufstatus konnten noch nicht sicher ermittelt werden. Bereits geprüfte Ergebnisse können verfügbar sein. DataSecure fragt den Status erneut ab; die Entscheidung wird nicht automatisch wiederholt.'
      : state.continuationFailure
        ? `${reviewFailureMessage({ ...state.continuationSnapshot, error_code: state.continuationFailure, retry_available: false })}\nDer aktuelle Laufstatus wird erneut abgefragt.`
        : 'Die lokale Prüfung konnte nicht sicher geladen werden. DataSecure fragt den Status erneut ab. Du kannst den Status im Hauptfenster prüfen oder hier erneut versuchen.');
    schedulePoll(Math.min(10000, 1200 * (2 ** Math.min(state.pollFailures, 4))));
  } finally {
    if (state.loadGeneration === generation) {
      state.loadGeneration = null;
      el('retry').disabled = false;
    }
  }
}

async function continueReview() {
  if (!invoke || state.closed || state.continuing || !state.continuationAvailable) return;
  invalidateLoads();
  const generation = state.generation;
  state.continuing = true;
  state.continuationSnapshot = state.lastSession;
  state.continuationAvailable = false;
  setWaiting('Der nächste Prüfschritt für denselben Lauf wird gestartet. Bitte warten …', true);
  try {
    const result = await invoke('continue_review_session');
    if (state.closed || generation !== state.generation) return;
    if (result?.ok !== true) throw Error('review continuation not confirmed');
    setWaiting('Der nächste Prüfschritt läuft. Weitere Fundstellen erscheinen hier, sobald sie bereit sind.', true);
    state.continuationFailure = null;
  } catch (error) {
    if (state.closed || generation !== state.generation) return;
    state.continuationFailure = safeFailureCode(error);
    setWaiting(reviewFailureMessage({ ...state.continuationSnapshot,
      error_code: state.continuationFailure, retry_available: false }));
  } finally {
    state.continuing = false;
    if (!state.closed && generation === state.generation) {
      el('continue-review').disabled = false;
      // A previous timer may have fired while the continuation was in flight.
      // Always replace it, including after an unconfirmed/failed start.
      schedulePoll();
    }
  }
}

async function closeReviewWindow() {
  if (state.closed) return;
  invalidateLoads();
  state.closed = true;
  try { await invoke('close_review_window'); }
  catch {
    state.closed = false;
    setWaiting('Das Fenster konnte nicht automatisch geschlossen werden. Bitte über das X in der Titelleiste schließen. Der Lauf bleibt sicher gespeichert.');
    schedulePoll();
  }
}

el('redact').addEventListener('click', () => decide('redact'));
el('redact-organization').addEventListener('click', () => decide('redact_organization'));
el('keep').addEventListener('click', () => decide('keep'));
el('undo').addEventListener('click', undo);
el('defer').addEventListener('click', () => sendAnswer({ action: 'deferred' }));
el('release').addEventListener('click', () => {
  if (!state.draft || state.choices.size !== state.draft.ambiguities.length) return;
  sendAnswer({ action: 'reviewed', redactions: [],
    decisions: state.draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id,
      ...(state.draft.ocr_contact_review === true ? state.choices.get(item.ambiguity_id)
        : { decision: state.choices.get(item.ambiguity_id) }) })) });
});
el('retry').addEventListener('click', poll);
el('continue-review').addEventListener('click', continueReview);
el('close-review').addEventListener('click', closeReviewWindow);
setWaiting('Die lokale Verarbeitung bereitet die Fundstellen vor. Bitte dieses Fenster offen lassen.', true);
poll();
