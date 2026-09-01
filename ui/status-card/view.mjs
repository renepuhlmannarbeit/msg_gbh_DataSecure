import model from '../../plugins/data-secure/server/status-app/model.js';

const copy = Object.freeze({
  de: {
    title: 'DataSecure · Lokaler Start', language: 'Sprache / Language',
    snapshot: 'Momentaufnahme beim Startversuch; keine Live-Anzeige.',
    details: 'Was passiert danach?', help: 'Die Abschlussmeldung erscheint lokal. Eine Auswertung in Claude erfordert danach einen neuen ausdrücklichen Auftrag. Diese Karte startet keine Aktionen.',
    local_intake_accepted: ['Lokale Auswahl übernommen.', 'Die Dateien werden lokal vorbereitet. Ein dauerhafter Verarbeitungsstart ist damit noch nicht bestätigt.'],
    local_start_confirmed: ['Lokaler Start bestätigt.', 'Die lokale Verarbeitung wurde gestartet. Ihr Abschluss ist damit noch nicht bestätigt.'],
    selection_cancelled: ['Auswahl abgebrochen.', 'Durch diese Auswahl wurde kein Stapel gestartet.'],
    start_blocked: ['Lokaler Start nicht bestätigt.', 'Der Start konnte nicht sicher bestätigt werden. Kein automatischer neuer Versuch.'],
    engine_unavailable: ['Lokale Verarbeitung nicht bereit.', 'Es wurde keine Dateiauswahl geöffnet. Wende dich bei Bedarf an die IT.'],
    already_running: ['Vorhandener Stapel beim Startversuch aktiv.', 'Es wurde kein neuer Stapel gestartet und keine weitere Dateiauswahl geöffnet.'],
    unavailable: ['Status nicht verfügbar.', 'Der lokale Zustand ist hier nicht bestätigt. Daraus folgt weder Abschluss noch Abbruch.'],
  },
  en: {
    title: 'DataSecure · Local start', language: 'Language / Sprache',
    snapshot: 'Snapshot of the start attempt; not a live status.',
    details: 'What happens next?', help: 'The completion notice appears locally. Analysis in Claude then requires a new explicit request. This card does not start any actions.',
    local_intake_accepted: ['Local selection accepted.', 'The files are being prepared locally. A durable processing start is not yet confirmed.'],
    local_start_confirmed: ['Local start acknowledged.', 'Local processing was started. This does not confirm completion.'],
    selection_cancelled: ['Selection cancelled.', 'This selection did not start a batch.'],
    start_blocked: ['Local start not confirmed.', 'The start could not be safely confirmed. No automatic retry.'],
    engine_unavailable: ['Local processing unavailable.', 'No file picker was opened. Contact IT if needed.'],
    already_running: ['Existing batch active at the start attempt.', 'No new batch was started and no additional file picker was opened.'],
    unavailable: ['Status unavailable.', 'The local state is not confirmed here. This does not establish completion or cancellation.'],
  },
});

export function mountStatusCard(document, AppClass) {
  let current = model.snapshot();
  let received = false;
  let chosenLanguage = false;
  const language = document.getElementById('language');
  const status = document.getElementById('status');
  function render() {
    const text = copy[current.locale];
    document.documentElement.lang = current.locale;
    language.value = current.locale;
    for (const id of ['title', 'snapshot', 'details', 'help']) document.getElementById(id).textContent = text[id];
    document.getElementById('language-label').textContent = text.language;
    document.getElementById('state').textContent = text[current.state][0];
    document.getElementById('explanation').textContent = text[current.state][1];
  }
  language.addEventListener('change', () => {
    chosenLanguage = true;
    current = model.snapshot(current.state, language.value);
    render();
  });
  const app = new AppClass({ name: 'GBH DataSecure Start Status', version: '1.0.0' }, {}, { autoResize: false });
  // One immutable start snapshot only. Duplicate results cannot become a live feed.
  app.ontoolresult = result => {
    if (received) return;
    received = true;
    const value = result?._meta?.['datasecure/status'];
    current = model.validateSnapshot(value) ? model.snapshot(value.state, chosenLanguage ? current.locale : value.locale) : model.snapshot('unavailable', current.locale);
    render();
    status.dataset.received = 'true';
  };
  app.ontoolcancelled = () => {
    if (received) return;
    received = true;
    current = model.snapshot('unavailable', current.locale);
    render();
  };
  // Transport failure must not pretend the independent local worker was cancelled.
  app.onerror = () => {};
  render();
  Promise.resolve().then(() => app.connect()).catch(() => {});
  return app;
}
