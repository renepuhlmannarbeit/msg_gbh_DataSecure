# Folgeauftrag P1: Crash-Worker-Testhilfe fehlt im Repository – Pflichttest rot

**Herkunft:** Finding **P1-2** aus `tasks/RC63-CLAUDE-CODE-GESAMTREVIEW-BERICHT.md`
**Story:** BL-011.7 (sicherer Abbruch und explizites Resume sind regressionsgetestet);
angrenzend BL-011.11, BL-050.3
**Entscheidungen:** DS-021, DS-043; `docs/canonical/BACKLOG.md` „Definition of Done"
**Ausgangsstand:** `main` auf `6e95d81`, Produktversion `3.2.0-rc63`

## 1. Befund

`tests/test-batch-session.js:85` startet einen detachierten Crash-Worker:

```js
const child = fork(path.join(__dirname, 'fixtures', 'crash-batch-worker.js'), [], { … });
```

Die Datei `tests/fixtures/crash-batch-worker.js` existiert nicht:

- sie liegt nicht im Arbeitsbaum eines frischen Clones,
- sie wurde in der gesamten Historie nie committet
  (`git log --all --oneline -- tests/fixtures/crash-batch-worker.js` ist leer),
- sie wird von `tests/make-fixtures.js` nicht erzeugt (dieses Skript erzeugt nur
  `synthetic_scan.png`, `synthetic_profile.docx`, `synthetic_customer.xlsx`,
  `synthetic_contract.pptx`, `synthetic_customer.pdf`, `synthetic_scan.pdf`),
- `tests/fixtures/` ist als Ganzes in `.gitignore:32` (`/tests/fixtures/`)
  ausgeschlossen.

`fork()` auf eine fehlende Datei beendet das Kind mit Exitcode 1; der Test
erwartet den Sentinel-Exitcode 17.

**Ist:**

```
FAIL real worker crashes at positions 1, 50 and 100 recover without duplicate release
     worker must crash at global item 1
     1 !== 17
Server-bound batch session: 66 passed, 1 failed
```

`node tests/test-batch-session.js` → Exitcode 1 (196 s).
`npm test` → Exitcode 1 (304 s), identische einzelne Zusicherung.

**Soll:** Beide Befehle laufen auf einem frischen Clone mit Exitcode 0 durch, und
der Crashfall belegt reproduzierbar Recovery ohne Doppelfreigabe.

**Auswirkung.** Zwei Pflichtbefehle aus dem Reviewauftrag §9 sind rot, und die
für BL-011.7/BL-011.11 beanspruchte E0-Evidenz „sicherer Abbruch und explizites
Resume sind regressionsgetestet" ist aus dem Repository nicht reproduzierbar. Der
Produktcode ist dadurch **nicht widerlegt** – er ist an dieser Stelle unbelegt.

## 2. Reproduktion

```bash
git clone https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure.git ds-fresh
cd ds-fresh
npm ci
node tests/test-batch-session.js; echo "exit=$?"
```

Belege für die Ursache:

```bash
ls tests/fixtures/crash-batch-worker.js                              # No such file
git ls-files tests/fixtures                                          # nur synthetic-personnel-profile.md
git log --all --oneline -- tests/fixtures/crash-batch-worker.js      # leer
grep -n "crash-batch-worker" -r . --exclude-dir=.git --exclude-dir=node_modules
grep -n "/tests/fixtures/" .gitignore
```

## 3. Umfang

**Dazu gehört:**

1. Den Crash-Worker als **getrackten Testquellcode** bereitstellen. Empfohlen:
   nach `tests/lib/crash-batch-worker.js` verschieben und
   `tests/test-batch-session.js:85` entsprechend anpassen – `tests/lib/` ist nicht
   gitignored und trennt Testquellcode klar von generierten Fixtures. Alternative:
   die Datei unter `tests/fixtures/` erzwungen hinzufügen und `.gitignore` mit
   einer Ausnahme versehen; das ist die schwächere Variante, weil die
   Pauschalregel dann weiter Fallen stellt.
2. Der Worker muss den vom Test erwarteten Vertrag erfüllen:
   - Start über `fork()` mit `stdio: ['ignore','ignore','ignore','ipc']`;
   - er empfängt seinen Batch-Token **ausschließlich** über die private
     IPC-Nachricht `{ type: 'run-crash-test', batch_token }` – niemals über
     `argv` oder Umgebungsvariablen;
   - `DATASECURE_TEST_CRASH_AT` bestimmt, nach dem wievielten lokal verarbeiteten
     Item er abbricht;
   - der Abbruch erfolgt mit **Exitcode 17**, ohne den durablen Zustand
     aufzuräumen, sodass genau ein Item in `processing` verbleibt;
   - er verarbeitet keine anderen Items und veröffentlicht nichts über den
     Crashpunkt hinaus.
   Die im Test erwartete Zustandsfolge steht in
   `tests/test-batch-session.js:1607-1638` und ist verbindlich: nach dem Crash
   `processing === 1`, `local_processing_active === false`, unverändertes
   `released`/`stopped`; nach `recoverBatches()` `processing === 0`,
   `retryable === 1`; danach genau ein `resumeBatch`.
3. Einen Vertragstest ergänzen, der verhindert, dass derselbe Fehler erneut
   entsteht: er sammelt alle in `tests/**` per `fork(`/`spawn(` referenzierten
   projekteigenen Hilfsdateien und prüft für jede, dass sie im Arbeitsbaum
   existiert **und** von Git getrackt ist (`git ls-files --error-unmatch`).
   Sinnvoller Ort: `tests/test-architecture-contracts.js`.
4. `.gitignore` um einen erklärenden Kommentar ergänzen, dass unter
   `tests/fixtures/` ausschließlich generierte Artefakte liegen dürfen und
   Testquellcode nach `tests/lib/` gehört.
5. `docs/canonical/CURRENT_STATE.md` und `docs/canonical/TRACEABILITY.md` für
   BL-011.7 nachziehen, sobald der Nachweis wieder reproduzierbar ist.

**Dazu gehört ausdrücklich nicht:**

- Änderungen am Produktcode. Wenn der wiederhergestellte Test einen **echten**
  Produktfehler aufdeckt, ist dieser als eigenes Finding zu melden und **nicht**
  in diesem Vorgang zu beheben.
- Abschwächen oder Umschreiben der Zusicherungen in
  `tests/test-batch-session.js`, damit der Test grün wird.
- Behebung von P1-1, P1-3 oder P2-1.

## 4. Abnahmekriterien

1. Auf einem **frischen Clone** gilt nach `npm ci`:
   `node tests/test-batch-session.js` → Exitcode 0, und der Fall „real worker
   crashes at positions 1, 50 and 100 recover without duplicate release" ist
   grün (67 von 67 bestanden).
2. `npm test` → Exitcode 0.
3. `npm run test:ci`, `npm run test:recovery` und `npm run test:fast-path` sind
   grün.
4. `git ls-files` weist die Worker-Datei als getrackt aus.
5. Der neue Vertragstest wird rot, wenn die Worker-Datei entfernt oder untracked
   gemacht wird.
6. Der Crash-Worker enthält keine echten Daten, keine Pfade außerhalb der
   Testumgebung und keinen Batch-Token in `argv` oder Umgebung.
7. `git diff --check` ist sauber.
8. Kein Commit und kein Push ohne ausdrückliche Freigabe.
