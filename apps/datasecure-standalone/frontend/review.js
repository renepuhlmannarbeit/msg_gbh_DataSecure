'use strict';

const embedded = /(?:\?|&)embedded=1(?:&|$)/u.test(window.location?.search || '');
const invoke = embedded && window.parent && window.parent !== window
  ? window.parent.__DATASECURE_REVIEW__?.invoke
  : window.__TAURI__?.core?.invoke;
if (embedded) { document.body.classList.add('embedded'); elAfterLoad(); }
function elAfterLoad() {
  document.getElementById('close-review').textContent = 'Zur Verarbeitung';
}
const el = (id) => document.getElementById(id);
const state = { draft: null, reviewId: null, cursor: 0, choices: new Map(), history: [],
  rows: [], rowById: new Map(), candidateIndex: new Map(), groups: new Map(), selected: new Set(), inputs: new Map(), page: 0,
  waiting: false, submitted: false, closed: false, disconnected: false, continuing: false, continuationAvailable: false,
  generation: 0, loadGeneration: null, pollTimer: null, pollFailures: 0, connectionReady: embedded,
  uncertainAnswer: null, continuationFailure: null, continuationSnapshot: null, lastSession: null };
const START_FAILURE_TEXT = Object.freeze({
  LOCAL_REVIEW_START_MISSING: 'Eine benötigte lokale Laufzeit oder Prüfkomponente wurde nicht gefunden.',
  LOCAL_REVIEW_START_DENIED: 'Das Betriebssystem hat den Start der lokalen Prüfkomponente verweigert. Prüfe Ausführungsrechte und Sicherheitsrichtlinien.',
  LOCAL_REVIEW_START_ARCHITECTURE: 'Die lokale Prüfkomponente passt nicht zur Architektur oder zum ausführbaren Format dieses Geräts.',
  LOCAL_REVIEW_START_FAILED: 'Die lokale Prüfkomponente konnte nicht gestartet werden.'
});
const REVIEW_FAILURE_TEXT = Object.freeze({
  CONTENT_OPTIONS_BINDING_INVALID: 'Die gespeicherten Inhalts- oder OCR-Einstellungen passen nicht mehr zu diesem Lauf. Wähle die Originaldateien für einen neuen Lauf aus; frühere Ergebnisse bleiben unverändert.',
  CONTENT_OPTIONS_BINDING_MISSING: 'Der unveränderliche Nachweis der Inhalts- und OCR-Auswahl fehlt. Dieser Lauf wird nicht fortgesetzt. Wähle die Originaldateien für einen neuen Lauf aus.',
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
  const advice = window.__DATASECURE_PRESENTATION__?.failureAdvice(session.error_code);
  if (advice) message += `\nNächster Schritt: ${advice}`;
  return message;
}

function setWaiting(message, working = false) {
  el('review').hidden = true;
  for (const id of ['exact-text', 'source-context', 'output-context', 'group-note', 'document-position', 'finding-position']) {
    el(id).textContent = '';
  }
  el('bulk-treatment').value = '';
  el('bulk-treatment').disabled = true;
  el('bulk-apply').disabled = true;
  el('select-filtered').disabled = true;
  el('matrix-empty').hidden = true;
  el('select-visible').checked = false;
  el('select-visible').indeterminate = false;
  el('contact-image').src = '';
  el('contact-original').hidden = true;
  el('contact-image-note').textContent = '';
  el('matrix-body').replaceChildren();
  el('occurrence').replaceChildren();
  el('matrix-search').value = '';
  el('matrix-document').value = 'all';
  el('matrix-count').textContent = '';
  el('matrix-progress').textContent = '';
  el('bulk-hint').textContent = 'Zuerst Werte auswählen. Häkchen allein bestätigen nichts.';
  el('release-hint').textContent = '3. Entscheidungen speichern: erst nach Behandlung aller Fundstellen.';
  el('matrix-page').textContent = '';
  el('matrix-message').textContent = '';
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
  if ((state.closed || state.disconnected) || state.draft) return;
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
  state.rows = []; state.rowById.clear(); state.candidateIndex.clear(); state.groups.clear();
  state.selected.clear(); state.inputs.clear(); state.documentPositions = new Map(); state.page = 0;
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
  return state.groups.get(candidate.ambiguity_id) || [candidate.ambiguity_id];
}

function context(text, start, end) {
  const from = Math.max(0, start - 180);
  const to = Math.min(text.length, end + 220);
  return `${from ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
}

function documentPositions(draft) {
  const result = new Map();
  const total = draft.contact_batch?.documents.length || draft.batch_review?.document_count || 1;
  if (total === 1) { for (const candidate of draft.ambiguities) result.set(candidate.ambiguity_id, 1); return result; }
  const documents = draft.contact_batch?.documents || draft.batch_review?.documents;
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

function contactImageUrl(image) {
  if (!image) return null;
  const keys = ['schema', 'source_width', 'source_height', 'x', 'y', 'width', 'height', 'png_base64'];
  if (Object.keys(image).length !== keys.length || !keys.every(key => Object.hasOwn(image, key)) ||
      image.schema !== 'datasecure-ocr-contact-image/1' ||
      !keys.slice(1, 7).every(key => Number.isSafeInteger(image[key])) ||
      image.x < 0 || image.y < 0 || image.width < 1 || image.height < 1 ||
      image.width > 4096 || image.height > 256 || image.width * image.height > 200000 ||
      image.source_width < 1 || image.source_height < 1 || image.source_width * image.source_height > 30000000 ||
      image.x + image.width > image.source_width || image.y + image.height > image.source_height ||
      typeof image.png_base64 !== 'string' || image.png_base64.length > 131072 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(image.png_base64)) return null;
  const bytes = atob(image.png_base64);
  if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes.charCodeAt(index) === value)) return null;
  const integer = offset => Array.from(bytes.slice(offset, offset + 4), char => char.charCodeAt(0))
    .reduce((number, byte) => number * 256 + byte, 0);
  if (integer(16) !== image.width || integer(20) !== image.height) return null;
  // The private broker already checked the closed PNG structure and CRCs.
  // Never let source content choose an image URL or MIME type in the renderer.
  return `data:image/png;base64,${image.png_base64}`;
}

const PAGE_SIZE = 50;
function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
}
function documentName(id) {
  const index = state.documentPositions.get(id);
  const documents = state.draft.contact_batch?.documents || state.draft.batch_review?.documents;
  return documents?.[index - 1]?.source_label || `Dokument ${index}`;
}
function contactRowContext(row) {
  const documentIndex = state.documentPositions.get(row.id);
  const documentCount = state.draft.contact_batch?.documents.length || state.draft.batch_review?.document_count || 1;
  return `${documentName(row.id)}, Dokument ${documentIndex} von ${documentCount}, ` +
    `Fundstelle ${state.candidateIndex.get(row.id) + 1} von ${state.draft.ambiguities.length}, ` +
    `Seite/Bild ${row.candidate.page}, Zeile ${row.candidate.line}`;
}
function prepareRows() {
  state.rows = []; state.groups.clear(); state.rowById.clear(); state.candidateIndex.clear();
  const candidates = new Map(state.draft.ambiguities.map((item, index) => {
    state.candidateIndex.set(item.ambiguity_id, index); return [item.ambiguity_id, item];
  }));
  for (const group of state.draft.decision_groups || []) {
    const ids = group.candidate_ids;
    if (!Array.isArray(ids) || !ids.length || !ids.every(id => candidates.has(id))) throw Error('invalid group');
    if (!ids.every(id => ['person_prose_ambiguous', 'person_residual_ambiguous'].includes(candidates.get(id).type))) continue;
    for (const id of ids) {
      if (state.groups.has(id)) throw Error('duplicate group');
      state.groups.set(id, ids);
    }
  }
  const seen = new Set();
  for (const candidate of candidates.values()) {
    if (seen.has(candidate.ambiguity_id)) continue;
    const ids = groupIds(candidate);
    for (const id of ids) seen.add(id);
    const exact = state.draft.original_text.slice(candidate.original_start, candidate.original_end);
    const names = [...new Set(ids.map(documentName))];
    const row = { id: candidate.ambiguity_id, ids, candidate, exact, names,
      search: `${exact}\n${names.join('\n')}`.toLocaleLowerCase('de-DE') };
    state.rows.push(row); state.rowById.set(row.id, row);
  }
}
function prepareDocumentFilter() {
  const filter = el('matrix-document');
  filter.replaceChildren();
  const all = document.createElement('option'); all.value = 'all'; all.textContent = 'Alle betroffenen Dokumente'; filter.append(all);
  const contact = state.draft?.ocr_contact_review === true;
  el('matrix-document-label').hidden = !contact;
  if (!contact) return;
  const count = state.draft.contact_batch?.documents.length || 1;
  const documents = state.draft.contact_batch?.documents || [];
  for (let index = 1; index <= count; index++) {
    const option = document.createElement('option'); option.value = String(index);
    const candidates = state.draft.ambiguities.filter(row => state.documentPositions.get(row.ambiguity_id) === index).length;
    option.textContent = `${documents[index - 1]?.source_label || `Dokument ${index}`} (${candidates} Werte)`;
    filter.append(option);
  }
  filter.value = 'all';
}
function filteredRows() {
  const query = el('matrix-search').value.trim().toLocaleLowerCase('de-DE');
  const filter = el('matrix-filter').value || 'all';
  const type = el('matrix-type').value || 'all';
  const documentIndex = el('matrix-document').value || 'all';
  return state.rows.filter(row => (!query || row.search.includes(query)) &&
    (documentIndex === 'all' || row.ids.some(id => state.documentPositions.get(id) === Number(documentIndex))) &&
    (type === 'all' || row.candidate.contact_kind === type) &&
    (filter === 'all' || (filter === 'done') === row.ids.every(id => state.choices.has(id))));
}
function visibleRows() { return filteredRows().slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE); }
function updateBulk() {
  const filtered = filteredRows(), filteredIds = new Set(filtered.map(row => row.id));
  for (const id of state.selected) if (!filteredIds.has(id)) state.selected.delete(id);
  const rows = [...state.selected].map(id => state.rowById.get(id)).filter(Boolean);
  const contact = state.draft?.ocr_contact_review === true;
  const actions = contact ? [['confirm_contact', 'Erkennung stimmt – unverändert vormerken'], ['correct_contact', 'Erkennung korrigieren – Eingabe vormerken']]
    : [['keep', 'Beibehalten'], ['redact', 'Als Person / sensible Angabe ersetzen'],
      ...(state.draft?.allow_organization_review === true ? [['redact_organization', 'Als Unternehmen anonymisieren']] : [])];
  actions.push(['reset', 'Wieder auf offen setzen']);
  const treatment = el('bulk-treatment'), previous = treatment.value;
  treatment.replaceChildren();
  for (const [value, label] of [['', 'Behandlung wählen …'], ...actions]) {
    const option = node('option', label); option.value = value;
    option.disabled = value === 'redact_organization' && rows.some(row => row.candidate.type === 'credential_issuer_ambiguous');
    treatment.append(option);
  }
  treatment.value = actions.some(([value]) => value === previous) ? previous : '';
  treatment.disabled = !rows.length;
  el('bulk-apply').textContent = `Auf ${rows.length} Zeile${rows.length === 1 ? '' : 'n'} anwenden`;
  el('bulk-apply').disabled = !rows.length || !treatment.value ||
    (treatment.value === 'redact_organization' && rows.some(row => row.candidate.type === 'credential_issuer_ambiguous'));
  el('clear-selection').disabled = !rows.length;
  const visible = visibleRows();
  el('select-visible').checked = visible.length > 0 && visible.every(row => state.selected.has(row.id));
  el('select-visible').indeterminate = visible.some(row => state.selected.has(row.id)) && !el('select-visible').checked;
  el('select-visible').disabled = !visible.length;
  el('select-visible').setAttribute('aria-label', `Nur diese Seite auswählen (${visible.length} Zeilen)`);
  el('select-filtered').textContent = `Alle ${filtered.length} gefilterten Zeilen auswählen (alle Seiten)`;
  el('select-filtered').disabled = !filtered.length || filtered.every(row => state.selected.has(row.id));
  el('matrix-count').textContent = `${filtered.length} von ${state.rows.length} Zeilen im Filter · ${rows.length} angehakt`;
  el('bulk-hint').textContent = !rows.length
    ? contact ? 'Werte zuerst mit dem Original vergleichen und auswählen. Häkchen allein bestätigen nichts.'
      : 'Zuerst Werte auswählen. Häkchen allein bestätigen nichts.'
    : !treatment.value
      ? contact ? `${rows.length} ausgewählt. Jetzt „Erkennung stimmt“ oder „Erkennung korrigieren“ wählen; die Auswahl allein bestätigt nichts.`
        : `${rows.length} ausgewählt. Jetzt eine Behandlung wählen; die Auswahl allein bestätigt nichts.`
      : `${rows.length} ausgewählt. „Anwenden“ merkt die Behandlung nur vor; gespeichert wird erst im letzten Schritt.`;
}
function renderTable() {
  const filtered = filteredRows();
  state.page = Math.max(0, Math.min(state.page, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const visible = visibleRows();
  const filteredIds = new Set(filtered.map(row => row.id));
  for (const id of state.selected) if (!filteredIds.has(id)) state.selected.delete(id);
  el('matrix-empty').hidden = filtered.length > 0;
  el('matrix-empty').textContent = state.choices.size === state.draft.ambiguities.length
    ? `Alle ${state.draft.ambiguities.length} Fundstellen sind vorgemerkt. Jetzt „${handoffLabel()}“ wählen. Unter „Vorgemerkt“ kannst du die Entscheidungen vorher ansehen und ändern.`
    : 'Keine Zeilen für diesen Filter. Es gibt noch offene Fundstellen in dieser Gruppe; Suche oder Filter ändern.';
  el('matrix-body').replaceChildren();
  for (const row of visible) {
    const tr = node('tr'); tr.dataset.row = row.id; tr.dataset.action = 'row';
    tr.dataset.active = String(row.ids.includes(state.draft.ambiguities[state.cursor].ambiguity_id));
    const contact = state.draft.ocr_contact_review === true;
    const contactContext = contact ? contactRowContext(row) : '';
    const selection = node('td'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = state.selected.has(row.id);
    checkbox.dataset.row = row.id; checkbox.dataset.action = 'select'; checkbox.setAttribute('aria-label', contact
      ? `${row.exact} auswählen: ${contactContext}` : `${row.exact} auswählen`);
    selection.append(checkbox);
    const value = node('td'), details = node('button', row.exact);
    details.dataset.row = row.id; details.dataset.action = 'details'; details.setAttribute('aria-label', contact
      ? `Original und Markdown vergleichen: ${row.exact}, ${contactContext}` : `Original und Markdown vergleichen: ${row.exact}`);
    const metadata = node('div'), source = node('small', `${row.ids.length} Fundstelle${row.ids.length === 1 ? '' : 'n'} · ${row.names.join(', ')}`);
    metadata.className = 'row-meta'; source.title = source.textContent;
    value.append(details, metadata); metadata.append(source);
    const choice = state.choices.get(row.id), action = node('td');
    action.hidden = !contact;
    if (contact) {
      const input = node('input'); input.type = 'text'; input.maxLength = 256; input.autocomplete = 'off'; input.spellcheck = false;
      input.value = state.inputs.get(row.id) ?? (choice?.decision === 'correct_contact' ? choice.replacement : '');
      input.placeholder = 'Nur bei Abweichung eingeben';
      input.dataset.row = row.id; input.dataset.action = 'correction'; input.setAttribute('aria-label', `Korrigierter Kontaktwert: ${row.exact}, ${contactContext}`);
      action.append(input);
      const matches = copyableContactRows(row);
      if (matches.length) {
        const copy = node('button', `Für ${matches.length} gleiche OCR-Lesart${matches.length === 1 ? '' : 'en'} vorschlagen`);
        copy.type = 'button'; copy.className = 'contact-copy-button';
        copy.dataset.row = row.id; copy.dataset.action = 'copy-correction';
        copy.hidden = !validContact(input.value, row.candidate);
        copy.setAttribute('aria-label', `Korrektur aus ${contactContext} für ${matches.length} weitere exakt gleiche OCR-Lesart${matches.length === 1 ? '' : 'en'} als Vorschlag einsetzen; andere Fundstellen bleiben offen`);
        action.append(copy);
      }
    }
    const done = row.ids.every(id => state.choices.has(id));
    const labels = { keep: 'Beibehalten', redact: 'Ersetzen', redact_organization: 'Unternehmen', confirm_contact: 'Unverändert', correct_contact: 'Korrigiert' };
    const status = node('span', done ? `Vorgemerkt: ${labels[choice?.decision || choice]}` : state.inputs.get(row.id) ? 'Eingabe – noch offen' : 'Offen');
    status.className = 'status-badge'; status.dataset.row = row.id; status.dataset.action = 'status'; status.dataset.done = String(done);
    metadata.append(status);
    tr.append(selection, value, action);
    el('matrix-body').append(tr);
  }
  el('matrix-count').textContent = `${filtered.length} von ${state.rows.length} Zeilen · ${state.selected.size} ausgewählt`;
  el('matrix-page').textContent = `Seite ${state.page + 1} von ${Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}`;
  el('matrix-prev').disabled = state.page === 0;
  el('matrix-next').disabled = (state.page + 1) * PAGE_SIZE >= filtered.length;
  updateBulk();
}
function validContact(value, candidate) {
  return Boolean(value && value === value.trim() && value.length <= 256 && !/[\p{Cc}\p{Cf}\p{Cs}\[\]`<>|]/u.test(value) &&
    (candidate.contact_kind !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) &&
    (candidate.contact_kind !== 'phone' || (/^\+?[\d ()./-]{6,}$/u.test(value) && /\d/u.test(value))));
}
function copyableContactRows(row) {
  if (state.draft?.ocr_contact_review !== true) return [];
  return state.rows.filter(other => other.id !== row.id && other.exact === row.exact &&
    other.candidate.contact_kind === row.candidate.contact_kind &&
    !state.inputs.has(other.id) && !other.ids.some(id => state.choices.has(id)));
}
function copyContactCorrection(id) {
  if (!state.draft || state.waiting || state.closed || state.disconnected) return;
  const row = state.rowById.get(id), replacement = state.inputs.get(id);
  if (!row || !validContact(replacement, row.candidate)) return;
  const targets = copyableContactRows(row);
  if (!targets.length) return;
  // Copy only the typed proposal. Identical OCR output is not evidence that
  // different source images contain the same value, so no decision is copied.
  state.history.push(targets.map(target => [target.id, state.choices.get(target.id),
    state.inputs.has(target.id), state.inputs.get(target.id)]));
  for (const target of targets) state.inputs.set(target.id, replacement);
  render();
  el('matrix-message').textContent = `Korrektur in ${targets.length} weitere${targets.length === 1 ? '' : 'n'} Zeile${targets.length === 1 ? '' : 'n'} mit exakt gleicher OCR-Lesart als Vorschlag eingetragen. Jede Fundstelle bleibt offen: Original einzeln vergleichen, dann bewusst vormerken. Noch nicht gespeichert.`;
  [...el('matrix-body').querySelectorAll('input[data-action="correction"]')]
    .find(input => input.dataset.row === id)?.focus();
}
function bulkDecision(value) {
  if (!state.draft || state.waiting || !state.selected.size) return;
  const filtered = new Set(filteredRows().map(row => row.id));
  const rows = [...state.selected].filter(id => filtered.has(id)).map(id => state.rowById.get(id));
  if (!rows.length) return;
  if (value === 'redact_organization' && (state.draft.allow_organization_review !== true || rows.some(row => row.candidate.type === 'credential_issuer_ambiguous'))) return;
  const contact = state.draft.ocr_contact_review === true;
  if (!(contact ? ['confirm_contact', 'correct_contact', 'reset'] : ['keep', 'redact', 'redact_organization', 'reset']).includes(value)) return;
  const changes = new Map();
  // Validate the complete selection before changing even one decision.
  for (const row of rows) {
    const replacement = state.inputs.get(row.id) || '';
    if (contact && value === 'confirm_contact' && replacement && replacement !== row.exact) {
      el('matrix-message').textContent = `Nichts angewendet: „${row.exact}“ in ${row.names.join(', ')} hat eine geänderte Eingabe. Wähle „Eingegebene Korrekturen übernehmen“ oder leere dieses Korrekturfeld.`;
      return;
    }
    if (contact && value === 'correct_contact' && !validContact(replacement, row.candidate)) {
      el('matrix-message').textContent = `Nichts angewendet: Bitte für „${row.exact}“ in ${row.names.join(', ')} einen gültigen Kontaktwert ohne Markdown oder Steuerzeichen eingeben (höchstens 256 Zeichen).`;
      return;
    }
    for (const id of row.ids) changes.set(id, value === 'reset' ? undefined : contact
      ? value === 'correct_contact' ? { decision: value, replacement } : { decision: value } : value);
  }
  state.history.push([...changes.keys()].map(id => [id, state.choices.get(id), state.inputs.has(id), state.inputs.get(id)]));
  for (const [id, choice] of changes) choice === undefined ? state.choices.delete(id) : state.choices.set(id, choice);
  el('bulk-treatment').value = '';
  state.selected.clear(); state.page = 0; render();
  const remaining = state.rows.filter(row => !row.ids.every(id => state.choices.has(id))).length;
  el('matrix-message').textContent = `${rows.length} Zeilen ${value === 'reset' ? 'wieder offen' : 'vorgemerkt'}. ${remaining} Prüfzeilen noch offen. Noch nicht gespeichert – erst „${handoffLabel()}“ sendet die Entscheidungen.`;
  (state.choices.size === state.draft.ambiguities.length ? el('release') : visibleRows().length ? el('exact-text') : el('matrix-filter')).focus();
}
function previewContext(candidate) {
  const text = state.draft.anonymized_text;
  const from = Math.max(0, candidate.anonymized_start - 180), to = Math.min(text.length, candidate.anonymized_end + 220);
  let value = text.slice(from, to);
  for (const item of [...state.draft.ambiguities].sort((left, right) => right.anonymized_start - left.anonymized_start)) {
    if (item.anonymized_start < from || item.anonymized_end > to) continue;
    const choice = state.choices.get(item.ambiguity_id);
    const replacement = state.draft.ocr_contact_review === true
      ? state.inputs.get(item.ambiguity_id) || (choice?.decision === 'correct_contact' ? choice.replacement : null)
      : choice === 'redact_organization' ? '[UNTERNEHMEN_…]' : choice === 'redact'
        ? item.type === 'credential_issuer_ambiguous' ? '[MANUAL_REDACTION]' : '[PERSON_…]' : null;
    if (replacement !== null) value = value.slice(0, item.anonymized_start - from) + replacement + value.slice(item.anonymized_end - from);
  }
  return `${from ? '…' : ''}${value}${to < text.length ? '…' : ''}`;
}
function handoffLabel() {
  const count = state.draft?.ambiguities.length || 0;
  return state.draft?.ocr_contact_review === true
    ? `${count} OCR-Entscheidung${count === 1 ? '' : 'en'} speichern und fortfahren`
    : `${count} Entscheidung${count === 1 ? '' : 'en'} speichern und fortfahren`;
}
function render(table = true) {
  const draft = state.draft;
  if (!draft) return;
  const items = draft.ambiguities;
  const filtered = filteredRows();
  state.page = Math.max(0, Math.min(state.page, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const visible = visibleRows();
  if (visible.length && !visible.some(row => row.ids.includes(items[state.cursor]?.ambiguity_id)))
    state.cursor = state.candidateIndex.get(visible[0].id);
  if (state.cursor >= items.length) state.cursor = items.length - 1;
  const candidate = items[state.cursor];
  const exact = draft.original_text.slice(candidate.original_start, candidate.original_end);
  const count = groupIds(candidate).length;
  const credential = candidate.type === 'credential_issuer_ambiguous';
  const contact = draft.ocr_contact_review === true && candidate.type === 'ocr_contact_ambiguous';
  const markdownContact = contact && draft.processing_mode === 'markdown-only';
  const organizationEnabled = !contact && !credential && draft.allow_organization_review === true;
  const affectedDocuments = draft.contact_batch?.documents.length || draft.batch_review?.document_count || 1;
  el('matrix-title').textContent = contact ? 'OCR-Kontaktwerte vor Abschluss prüfen' : 'Fundstellen gemeinsam bearbeiten';
  el('matrix-guide').textContent = contact
    ? `Hauptweg: Kontaktwert mit dem Original vergleichen → Werte auswählen → unverändert oder korrigiert vormerken → am Ende speichern. ${items.length} erkannte E-Mail-/Telefonwerte in ${affectedDocuments} Dokument${affectedDocuments === 1 ? '' : 'en'}: Prüfkandidaten, keine ${items.length} Konvertierungsfehler.`
    : 'Diese Fundstellen brauchen eine Entscheidung. Wähle Zeilen aus, wende eine Behandlung an und speichere dann die vollständige Gruppe.';
  el('matrix-explanation').textContent = contact
    ? 'Du hast diese zusätzliche Prüfung beim Start gewählt. Auch plausibel aussehende OCR-Werte zählen. Bestätige oder korrigiere sie nach dem Bildvergleich; andere OCR-Zeilen oder Markdown-Inhalte sind dadurch nicht geprüft. Eine eingegebene Korrektur kannst du für exakt gleiche OCR-Lesarten als Vorschlag in weitere offene Zeilen einsetzen. Dort musst du das Original dennoch einzeln vergleichen und die Entscheidung ausdrücklich vormerken. Anwenden merkt Entscheidungen nur vor. Erst der Abschlussknopf übergibt sie und setzt den Lauf fort.'
    : 'Vorgemerkte Zeilen verschwinden aus „Noch offen“ und können unter „Vorgemerkt“ erneut betrachtet werden. Anwenden speichert noch nichts. Erst der Abschlussknopf übergibt alle Entscheidungen dieser Prüfgruppe.';
  el('summary').textContent = contact
    ? `${state.choices.size} von ${items.length} OCR-Kontaktwerten vorgemerkt · ${items.length - state.choices.size} offen · ${affectedDocuments} Dokument${affectedDocuments === 1 ? '' : 'e'} betroffen. Beim Start freiwillig gewählt; zum Abschluss dieses Laufs jetzt erforderlich.`
    : `${state.choices.size} von ${items.length} Stellen vorgemerkt · ${items.length - state.choices.size} offen · ${state.rows.length} Prüfzeilen in dieser Gruppe. Noch nicht übergeben.`;
  el('matrix-progress').textContent = contact
    ? `${state.choices.size} von ${items.length} OCR-Kontaktwerten vorgemerkt · ${items.length - state.choices.size} offen · ${affectedDocuments} ${affectedDocuments === 1 ? 'betroffenes Dokument' : 'betroffene Dokumente'}`
    : `${state.choices.size} von ${items.length} Fundstellen vorgemerkt · ${items.length - state.choices.size} offen`;
  el('document-position').textContent = `${documentName(candidate.ambiguity_id)} · Dokument ${state.documentPositions.get(candidate.ambiguity_id)} von ${draft.contact_batch?.documents.length || draft.batch_review?.document_count || 1}`;
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
    'Vergleiche jedes Zeichen mit dem Original. ' + (markdownContact
      ? 'Nur OCR-Korrektur: Der Markdown-Export bleibt nicht anonymisiert und enthält Originalinhalte. Andere OCR-Zeilen sind damit nicht bestätigt.'
      : 'Diese Bestätigung betrifft nur die Texterkennung; danach durchläuft der bestätigte Text die normale Anonymisierung und Restprüfung. Hohe OCR-Sicherheit ersetzt diese Prüfung nicht.');
  const imageUrl = contact ? contactImageUrl(candidate.image) : null;
  el('contact-original').hidden = !contact;
  el('contact-image').hidden = !imageUrl;
  el('contact-image').src = imageUrl || '';
  el('contact-image-note').textContent = !contact ? '' : imageUrl
    ? 'Rasterausschnitt dieser Kontaktzeile; bei PDFs lokal aus der Seite gerendert. Nicht exportiert und nicht an KI übergeben.'
    : 'Kein eindeutig zugeordneter Bildausschnitt verfügbar (Geometrie oder Größenlimit). Bitte den Wert in der Originaldatei vergleichen; die OCR-Lesart ist kein Originalbild.';
  el('source-context').textContent = context(draft.original_text, candidate.original_start, candidate.original_end);
  el('output-context').textContent = previewContext(candidate);
  el('output-title').textContent = markdownContact ? 'Markdown-Texteingang (nicht anonymisiert)' : contact ? 'Bestätigter Texteingang (noch nicht anonymisiert)' : 'Vorgesehene Ausgabe';
  el('correction-col').hidden = !contact; el('correction-heading').hidden = !contact;
  el('matrix-type-label').hidden = !contact;
  const rowIndex = filtered.findIndex(row => row.ids.includes(candidate.ambiguity_id));
  el('finding-prev').disabled = rowIndex <= 0;
  el('finding-next').disabled = rowIndex < 0 || rowIndex === filtered.length - 1;
  el('release').disabled = state.choices.size !== items.length;
  el('release').textContent = handoffLabel();
  el('release-hint').textContent = state.choices.size === items.length
    ? `3. Abschließen: Alle ${items.length} Fundstellen vorgemerkt. Speichern setzt den Lauf fort.`
    : `3. Abschließen: Noch ${items.length - state.choices.size} Fundstellen offen. Erst alle behandeln, dann speichern.`;
  el('undo').disabled = state.history.length === 0;
  el('waiting').hidden = true;
  el('review').hidden = false;
  el('matrix-detail').hidden = !visible.length;
  if (!visible.length) {
    for (const id of ['exact-text', 'source-context', 'output-context', 'document-position', 'finding-position', 'group-note']) el(id).textContent = '';
    el('contact-image').src = ''; el('contact-original').hidden = true;
  }
  if (table) {
    el('occurrence').replaceChildren();
    for (const id of groupIds(candidate)) {
      const option = node('option', `${documentName(id)} · Fundstelle ${state.candidateIndex.get(id) + 1}`);
      option.value = id; el('occurrence').append(option);
    }
    el('occurrence').value = candidate.ambiguity_id;
    el('occurrence').hidden = count === 1; el('occurrence-label').hidden = count === 1;
    renderTable();
  }
}

function undo() {
  if (!state.draft || state.waiting || (state.closed || state.disconnected)) return;
  const previous = state.history.pop();
  if (!previous) return;
  for (const [id, value, hadInput, inputValue] of previous) {
    if (value === undefined) state.choices.delete(id);
    else state.choices.set(id, value);
    // An Undo must restore editor, preview AND the transmitted value together.
    // Never enable release while an unrelated pending edit masks that value.
    if (hadInput) state.inputs.set(id, inputValue); else state.inputs.delete(id);
  }
  const index = state.draft.ambiguities.findIndex((item) => item.ambiguity_id === previous[0][0]);
  if (index >= 0) state.cursor = index;
  const restoredIds = new Set(previous.map(([id]) => id));
  const restoredStates = new Set(state.rows.filter(row => row.ids.some(id => restoredIds.has(id)))
    .map(row => row.ids.every(id => state.choices.has(id))));
  // Undo of Reset restores staged decisions; an open-only filter would hide
  // precisely the rows the operator has just restored. Mixed states need All.
  el('matrix-filter').value = restoredStates.size === 1 ? restoredStates.has(true) ? 'done' : 'open' : 'all';
  el('matrix-search').value = ''; el('matrix-type').value = 'all';
  state.selected.clear();
  state.page = Math.max(0, Math.floor(filteredRows().findIndex(row => row.ids.includes(previous[0][0])) / PAGE_SIZE));
  render();
  el('matrix-message').textContent = `Letzte Aktion rückgängig gemacht. ${state.choices.size} Fundstellen vorgemerkt · ${state.draft.ambiguities.length - state.choices.size} offen. Noch nicht übergeben.`;
  (visibleRows().length ? el('exact-text') : el('matrix-filter')).focus();
}

async function sendAnswer(answer) {
  if (state.waiting || (state.closed || state.disconnected) || !state.reviewId) return;
  invalidateLoads();
  const generation = state.generation;
  const markdownContact = state.draft?.ocr_contact_review === true && state.draft.processing_mode === 'markdown-only';
  const pending = { reviewId: state.reviewId, action: answer.action,
    choices: new Map(state.choices), inputs: new Map(state.inputs), history: state.history.slice(), cursor: state.cursor };
  state.waiting = true;
  try {
    const result = await invoke('submit_review', { reviewId: state.reviewId, answer });
    if ((state.closed || state.disconnected) || generation !== state.generation) return;
    if (result?.accepted !== true) throw Error('review answer not confirmed');
    clearDraft();
    state.uncertainAnswer = null;
    state.submitted = answer.action === 'reviewed';
    state.waiting = false;
    setWaiting(answer.action === 'deferred'
      ? 'Prüfung vertagt. Der Lauf bleibt im Verlauf unter „Prüfung offen“ und kann dort fortgesetzt werden.'
      : markdownContact
        ? 'OCR-Kontaktentscheidungen gespeichert. DataSecure setzt die Markdown-Umwandlung fort. Weitere Kontaktgruppen erscheinen hier bei Bedarf. Eine Dokumentfreigabe zur Anonymisierung ist nicht erforderlich. Den Abschlussstatus siehst du beim Lauf im Hauptfenster.'
        : 'Entscheidungen gespeichert. Weitere Fundstellen werden geprüft. Bitte warten; die nächste Gruppe erscheint hier. Dokumentfreigabe und Export folgen gesondert.',
    answer.action === 'reviewed');
    if (answer.action === 'reviewed') schedulePoll();
  } catch {
    if ((state.closed || state.disconnected) || generation !== state.generation) return;
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
  if (!invoke || !state.connectionReady || state.draft || (state.closed || state.disconnected) || state.continuing || state.waiting || state.loadGeneration !== null) return;
  cancelPoll();
  const generation = state.generation;
  state.loadGeneration = generation;
  el('retry').disabled = true;
  const current = () => !(state.closed || state.disconnected) && generation === state.generation;
  try {
    const session = await invoke('get_review_session');
    if (!current()) return;
    state.lastSession = session;
    state.pollFailures = 0;
    if (!session.ready) {
      state.waiting = false;
      if (session.run_complete === true) {
        state.continuationAvailable = false;
        setWaiting('Prüfung dieses Laufs abgeschlossen. Das Prüffenster wird geschlossen. Der weitere Status steht beim zugehörigen Lauf im Hauptfenster.');
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
    state.selected.clear(); state.inputs.clear(); state.page = 0;
    el('matrix-filter').value = 'open';
    el('matrix-type').value = 'all';
    el('bulk-treatment').value = '';
    prepareRows();
    prepareDocumentFilter();
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
      state.inputs = new Map([...pending.inputs].filter(([id]) => ids.has(id)));
      state.history = pending.history;
      state.cursor = Math.min(pending.cursor, draft.ambiguities.length - 1);
    }
    render();
    if (pending?.reviewId === session.review_id) el('summary').textContent =
      'Die Entscheidung ist nicht bestätigt; dieser Prüfschritt ist weiterhin offen. Deine Eingaben sind erhalten. Bitte prüfen und bewusst erneut freigeben oder später entscheiden.';
    // New groups start at their shared controls, not the lower detail pane.
    // This also keeps the bulk actions visible in the stacked narrow layout.
    el('matrix-title').focus();
  } catch {
    if (!current()) return;
    clearDraft();
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
  if (!invoke || (state.closed || state.disconnected) || state.continuing || !state.continuationAvailable) return;
  invalidateLoads();
  const generation = state.generation;
  state.continuing = true;
  state.continuationSnapshot = state.lastSession;
  state.continuationAvailable = false;
  setWaiting('Der nächste Prüfschritt für denselben Lauf wird gestartet. Bitte warten …', true);
  try {
    const result = await invoke('continue_review_session');
    if ((state.closed || state.disconnected) || generation !== state.generation) return;
    if (result?.ok !== true) throw Error('review continuation not confirmed');
    setWaiting('Der nächste Prüfschritt läuft. Weitere Fundstellen erscheinen hier, sobald sie bereit sind.', true);
    state.continuationFailure = null;
  } catch (error) {
    if ((state.closed || state.disconnected) || generation !== state.generation) return;
    state.continuationFailure = safeFailureCode(error);
    setWaiting(reviewFailureMessage({ ...state.continuationSnapshot,
      error_code: state.continuationFailure, retry_available: false }));
  } finally {
    state.continuing = false;
    if (!(state.closed || state.disconnected) && generation === state.generation) {
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
  const closingMessage = state.draft ? 'Die Prüfung wird verlassen.' : el('waiting-text').textContent;
  clearDraft();
  setWaiting(closingMessage);
  state.uncertainAnswer = null;
  state.closed = true;
  try { await invoke('close_review_window'); }
  catch {
    state.closed = false;
    setWaiting(embedded ? 'Die Prüfung konnte nicht verlassen werden. Bitte erneut versuchen; der Lauf bleibt lokal gespeichert.' : 'Das Fenster konnte nicht automatisch geschlossen werden. Bitte über das X in der Titelleiste schließen. Der Lauf bleibt sicher gespeichert.');
    schedulePoll();
  }
}

function changeContact(id, value, selectionStart, selectionEnd) {
  if (!state.draft || state.waiting || state.draft.ocr_contact_review !== true || !state.rowById.has(id)) return;
  const reopenFiltered = el('matrix-filter').value === 'done';
  state.inputs.set(id, value); state.choices.delete(id);
  state.cursor = state.candidateIndex.get(id);
  if (reopenFiltered) {
    // Do not leave an edited, now-open row selected under the "Vorgemerkt"
    // filter, nor remove the input from beneath the user's typing cursor.
    el('matrix-filter').value = 'all'; state.selected.clear();
    state.page = Math.floor(filteredRows().findIndex(row => row.id === id) / PAGE_SIZE);
    render();
    const input = [...el('matrix-body').querySelectorAll('input[data-action="correction"]')].find(item => item.dataset.row === id);
    input?.focus();
    if (typeof input?.setSelectionRange === 'function' && Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
    el('matrix-message').textContent = 'Bearbeitete Zeile ist wieder offen. Ansicht auf „Alle“ gewechselt und Checkboxauswahl aufgehoben; Eingaben bleiben erhalten.';
    return;
  }
  render(false);
  for (const item of el('matrix-body').querySelectorAll('[data-row]')) {
    if (item.dataset.action === 'row') item.dataset.active = String(item.dataset.row === id);
    if (item.dataset.action === 'copy-correction') {
      const source = state.rowById.get(item.dataset.row);
      const matches = copyableContactRows(source).length;
      item.hidden = !matches || !validContact(state.inputs.get(source.id), source.candidate);
      item.textContent = `Für ${matches} gleiche OCR-Lesart${matches === 1 ? '' : 'en'} vorschlagen`;
      item.setAttribute('aria-label', `Korrektur aus ${contactRowContext(source)} für ${matches} weitere exakt gleiche OCR-Lesart${matches === 1 ? '' : 'en'} als Vorschlag einsetzen; andere Fundstellen bleiben offen`);
    }
    if (item.dataset.row === id && item.dataset.action === 'status') {
      item.textContent = value ? 'Eingabe – noch offen' : 'Offen'; item.dataset.done = 'false';
    }
  }
  updateBulk();
}
el('matrix-body').addEventListener('click', event => {
  const copy = event.target.closest('[data-action="copy-correction"]');
  if (copy) { copyContactCorrection(copy.dataset.row); return; }
  const target = event.target.closest('[data-action="details"]');
  const row = target && state.rowById.get(target.dataset.row);
  if (!row) return;
  state.cursor = state.candidateIndex.get(row.id); render(); el('exact-text').focus();
});
el('matrix-body').addEventListener('change', event => {
  const target = event.target, row = state.rowById.get(target.dataset.row);
  if (!row) return;
  if (target.dataset.action === 'select') {
    target.checked ? state.selected.add(row.id) : state.selected.delete(row.id);
    updateBulk();
  }
});
el('matrix-body').addEventListener('input', event => {
  if (event.target.dataset.action === 'correction') changeContact(event.target.dataset.row, event.target.value, event.target.selectionStart, event.target.selectionEnd);
});
el('occurrence').addEventListener('change', event => {
  const index = state.candidateIndex.get(event.target.value);
  if (index === undefined) return;
  state.cursor = index; render(); el('occurrence').focus();
});
for (const id of ['matrix-search', 'matrix-filter', 'matrix-type', 'matrix-document']) el(id).addEventListener(id === 'matrix-search' ? 'input' : 'change', () => {
  const selected = state.selected.size;
  state.selected.clear(); state.page = 0; render();
  el('matrix-message').textContent = selected ? 'Ansicht geändert; die Checkboxauswahl wurde aufgehoben. Eingaben und vorgemerkte Entscheidungen bleiben erhalten.' : '';
});
el('select-visible').addEventListener('change', event => {
  const rows = visibleRows();
  for (const row of rows) event.target.checked ? state.selected.add(row.id) : state.selected.delete(row.id);
  renderTable();
});
el('select-filtered').addEventListener('click', () => {
  if (!state.draft || state.waiting || state.closed || state.disconnected) return;
  state.selected = new Set(filteredRows().map(row => row.id)); renderTable();
  el('matrix-message').textContent = `${state.selected.size} Zeilen über alle Seiten dieses Filters ausgewählt. Noch nichts vorgemerkt oder übergeben; bitte Behandlung wählen und anwenden.`;
});
el('clear-selection').addEventListener('click', () => { state.selected.clear(); renderTable(); });
for (const [id, delta] of [['matrix-prev', -1], ['matrix-next', 1]]) el(id).addEventListener('click', () => {
  state.page += delta; render();
  el('matrix-message').textContent = `Seite gewechselt. ${state.selected.size} Zeilen bleiben über die Seiten hinweg angehakt. Eingaben und vorgemerkte Entscheidungen bleiben erhalten.`;
});
el('bulk-treatment').addEventListener('change', updateBulk);
el('bulk-apply').addEventListener('click', () => bulkDecision(el('bulk-treatment').value));
for (const [id, delta] of [['finding-prev', -1], ['finding-next', 1]]) el(id).addEventListener('click', () => {
  if (!state.draft) return;
  const rows = filteredRows(), index = rows.findIndex(row => row.ids.includes(state.draft.ambiguities[state.cursor].ambiguity_id));
  const next = Math.max(0, Math.min(rows.length - 1, index + delta));
  if (!rows[next]) return;
  state.cursor = state.candidateIndex.get(rows[next].id); state.page = Math.floor(next / PAGE_SIZE);
  render(); el(id).focus();
});
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
let unlistenConnection = null, pageDisposed = false;
function disconnectReview(message) {
  invalidateLoads(); clearDraft(); state.disconnected = true; state.connectionReady = false;
  state.waiting = false; state.continuing = false; state.continuationAvailable = false;
  state.uncertainAnswer = null; state.continuationFailure = null; state.continuationSnapshot = null; state.lastSession = null;
  setWaiting(message); el('retry').disabled = true;
}
window.addEventListener('beforeunload', () => {
  pageDisposed = true; state.closed = true; invalidateLoads(); clearDraft();
  unlistenConnection?.(); unlistenConnection = null;
});
async function startReview() {
  // The embedded surface is retired by its owning workspace on recovery. A
  // separate native window must establish its own receiver BEFORE reading PII.
  if (!embedded) {
    try {
      if (typeof window.__TAURI__?.event?.listen !== 'function') throw Error('listener unavailable');
      const unlisten = await window.__TAURI__.event.listen('datasecure-connection', event => {
        if (pageDisposed || state.closed || event.payload?.state !== 'recovering') return;
        disconnectReview('Die lokale Verbindung wurde unterbrochen. Nicht übergebene Entscheidungen wurden verworfen. Bitte dieses Prüffenster schließen und den Lauf in der Hauptansicht erneut öffnen.');
      });
      if (typeof unlisten !== 'function') throw Error('listener unavailable');
      if (pageDisposed) { unlisten(); return; }
      unlistenConnection = unlisten; state.connectionReady = !state.disconnected;
    } catch {
      if (!pageDisposed) disconnectReview('Die sichere Verbindungsüberwachung konnte nicht gestartet werden (LOCAL_REVIEW_EVENT_UNAVAILABLE). Bitte dieses Prüffenster schließen und die Prüfung in der Hauptansicht erneut öffnen.');
      return;
    }
  }
  await poll();
}
setWaiting('Die lokale Verarbeitung bereitet die Fundstellen vor. Bitte dieses Fenster offen lassen.', true);
startReview();
