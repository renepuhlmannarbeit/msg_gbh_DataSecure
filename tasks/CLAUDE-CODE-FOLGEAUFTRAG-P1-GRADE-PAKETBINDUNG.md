# Folgeauftrag P1: Positiver Ergebnisgrad ohne erneute Paketbindung in Progress, Abschluss und Cowork-Handoff

**Herkunft:** Finding **P1-3** aus `tasks/RC63-CLAUDE-CODE-GESAMTREVIEW-BERICHT.md`
**Story:** BL-049.1 (RC63-Ergebnisprojektion); angrenzend BL-050.3
**Entscheidungen:** DS-045; kanonischer Vertrag
`docs/canonical/contracts/RESULT_GRADES_V1.md`, Abschnitt „Progress-, Results-,
Abschluss- und Cowork-Projektion"; DS-057 (Rang der Maschinenverträge)
**Ausgangsstand:** `main` auf `6e95d81`, Produktversion `3.2.0-rc63`

## 0. Entscheidung: **Zielbild (A) ist gewählt**

**Getroffen am 27.08.2026, delegiert vom Product Owner. Umzusetzen ist
ausschließlich Zielbild (A). Zielbild (B) ist verworfen.**

Begründung, in der Reihenfolge ihres Gewichts:

1. **(A) ist keine neue Entscheidung, (B) wäre eine.** `RESULT_GRADES_V1.md`
   verlangt die erneute Bindung bereits; (A) stellt nur den vertragsgemäßen
   Zustand her. (B) verlangt eine neue, ausdrücklich ersetzende DS-ID in
   `DECISIONS.md`, also einen Eingriff in das Entscheidungsregister nach DS-057.
   Ein solcher Eingriff ist die teuerste verfügbare Option für den geringsten
   Gewinn.
2. **Der Cowork-Handoff verhält sich unter (A) messbar besser.**
   `batch-results.js:121-124` filtert einen Stapel mit `grades_verified !== true`
   aus der Kandidatenliste. Unter (A) wird ein Stapel mit verlorenem Export gar
   nicht zur Auswertung angeboten. Unter (B) wird er angeboten und scheitert erst
   danach hart in `listBatchResults` mit „Ein freigegebenes Ergebnis konnte nicht
   sicher verifiziert werden." (A) ersetzt einen Fehlschlag durch eine
   Nichtauswahl.
3. **Die Aussage lädt zu einer Handlung ein und muss deshalb aktuell sein.**
   Der Abschluss meldet „Stapel abgeschlossen: N vollständig verarbeitet" und
   setzt `next_action: 'open_local_overview'`. Wer auf eine nicht mehr vorhandene
   Übersicht geschickt wird, erhält eine falsche Zusage. Der Fallbacktext bei
   `grades_verified: false` („Ergebnisse bereitgestellt … Ergebnisgrade sind
   nicht verfügbar.") ist zudem selbst nützlich: er zeigt an, dass sich am
   lokalen Export etwas geändert hat.
4. **Verteidigung in der Tiefe.** Ein manipulierter Checkpoint kann heute über
   den Marker positive Gradzähler erzeugen. Die eigentliche Absicherung ist
   BL-011.13, aber (A) verengt den Weg schon vorher.
5. **Der Performanceeinwand entfällt.** Die Identitätsbindung kostet zwei
   `lstat` je freigegebenem Paket, ausschließlich auf dem terminalen Pfad. Bei
   100 Paketen sind das 200 `lstat` gegenüber den 2-s-/10-s-Budgets aus DS-047 —
   und ausdrücklich **kein** erneutes Voll-Hashing. Damit ist auch der
   Performance-Geruch „wiederholte Paketprüfung" aus dem Reviewauftrag §6
   gewahrt.

Der ursprüngliche Zielkonflikt, der zu dieser Entscheidung geführt hat:

- `RESULT_GRADES_V1.md` verlangt: „Terminale V2-Stapel werden **vor der
  öffentlichen Zählung** erneut gegen jedes veröffentlichte V3-Paket gebunden."
- Der Reviewauftrag §5 verlangt dasselbe für Progress, Abschluss, Results und
  Cowork-Handoff.
- Der Reviewauftrag §6 zählt „wiederholte Paketprüfung" gleichzeitig als
  Performance-Geruch auf, und die Implementierung begründet den heutigen Zustand
  ausdrücklich damit
  (`batch-progress.js:113`, `batch-terminal-evidence.js:53`).

Die beiden Zielbilder im Wortlaut, wie sie zur Entscheidung standen:

- `RESULT_GRADES_V1.md` verlangt: „Terminale V2-Stapel werden **vor der
  öffentlichen Zählung** erneut gegen jedes veröffentlichte V3-Paket gebunden."
- Der Reviewauftrag §5 verlangt dasselbe für Progress, Abschluss, Results und
  Cowork-Handoff.
- Der Reviewauftrag §6 zählt „wiederholte Paketprüfung" gleichzeitig als
  Performance-Geruch auf, und die Implementierung begründet den heutigen Zustand
  ausdrücklich damit
  (`batch-progress.js:113`, `batch-terminal-evidence.js:53`).

**Zu entscheiden ist genau eines von zwei Zielbildern:**

**(A) Vertrag hat Vorrang.** Vor jeder öffentlichen Zählung wird jedes
veröffentlichte Paket erneut gebunden. Um die Kosten zu begrenzen, genügt eine
**Identitätsbindung** statt eines erneuten Voll-Hashes: `dev`, `ino`, `size` und
`mtimeMs` von `manifest.json` und `<package_id>.md` gegen die zum
Receipt-Zeitpunkt festgehaltenen Werte. Abweichung oder Fehlen ⇒ `unavailable`
und `grades_verified: false`. Das ist O(n) `lstat` statt O(Bytes) Hashing und
erfüllt den Vertragszweck.

**(B) Receipt ist die Autorität.** Der Vertrag wird per **neuer, ausdrücklich
ersetzender DS-ID** dahin geändert, dass der durable Receipt die abgeschlossene
Zählung autoritativ trägt, und die Anwendermeldung wird ehrlich gemacht (sie sagt
dann, dass sich die Aussage auf den Abschlusszeitpunkt bezieht, nicht auf den
heutigen Bestand der Exporte).

Zielbild (B) bleibt hier nur als verworfene Alternative dokumentiert. Der
Abschnitt 3 „bei Zielbild (B)" ist damit **nicht** auszuführen.

## 1. Befund

**Fundstelle:** `plugins/data-secure/server/gateway/batch-progress.js:122` und
`:134`, Funktion `publicProgress`. Mitverursachend:
`batch-result-projection.js:39` (`positivePackageMatches`) und
`batch-terminal-evidence.js:63` (`exportedMarkerMatchesState`).

Sobald `state.terminal_evidence.status === 'exported'` ist:

```js
const stateProjection = gradeCounts ? projectBatchResults(state) : null;   // :122  ohne verifyPositive
…
const projected = complete && options.skipResultProjection !== true
  ? (durableProjection || projectBatchResults(state, { verifyPositive: … }))  // :134  kurzgeschlossen
  : …;
```

`positivePackageMatches` gibt ohne übergebenen Verifizierer bedingungslos `true`
zurück (`batch-result-projection.js:39`). Der paketverifizierende Zweig in Zeile
134 wird durch `durableProjection ||` nie erreicht. Es findet **kein einziger
Paketzugriff** statt.

**Ist:** `grades_verified: true`, `complete: 1`, 0 Paketzugriffe, obwohl das
gebundene Paket fehlt.
**Soll:** `grades_verified: false`, `unavailable: 1`, `complete: 0`.

**Betroffene Flächen** – alle übernehmen den Wert unverändert aus
`publicProgress`:

| Fläche | Fundstelle |
|---|---|
| lokale Abschlussanzeige | `plugins/data-secure/server/companion/completion-summary.js:88,259` |
| Cowork-Statusantwort | `plugins/data-secure/server/index.js:152` |
| Cowork-Handoff-Kandidatenliste | `gateway/batch-results.js:121-131` → `gateway/local-only-handoff.js:52-68` |

**Nicht betroffen und weiterhin korrekt:** die Results-Fassade
(`gateway/batch-results.js:22`, `verifiedResultPackage`) und der Lesepfad
(`gateway/package-store.js:79`, `readOutput`) prüfen jedes Paket einzeln und
werfen bei Abweichung. Es gibt **keinen Rohdatenabfluss und keine falsche
Inhaltsfreigabe.** Der Schaden ist eine falsche Vollständigkeitsaussage.

**Realistischer Auslöser** ist keine Manipulation, sondern der Normalfall: DS-023
erlaubt dem Anwender ausdrücklich, Exporte selbst zu löschen oder zu verschieben.
Danach meldet der Fortschritt weiter „N vollständig verarbeitet".

## 2. Reproduktion

```bash
node -e '
const {createBatchProgress}=require("./plugins/data-secure/server/gateway/batch-progress");
const {evidenceRecord}=require("./plugins/data-secure/server/gateway/batch-evidence");
const {releasedDocumentResult}=require("./plugins/data-secure/server/gateway/document-result-grade");
const dr=releasedDocumentResult({parserWarnings:[],visualResults:[],unreviewedVisualCount:0,imagesRemovedByExplicitRequest:0});
const state={schema:"datasecure-batch/2",token:"9".repeat(64),created_at:"2026-08-27T08:00:00.000Z",profile:"general",remove_images:false,
  items:[{status:"released",package_id:"ds_"+"8".repeat(32),document_result:dr}]};
const id="7".repeat(32);
const record=evidenceRecord(state,"2026-08-27T08:01:00.000Z",id,{publishedPackageRecord:()=>({state:"verified",document_result:dr})});
state.terminal_evidence={schema:"datasecure-batch-terminal-evidence/2",status:"exported",receipt_id:id,record};
let lookups=0;
const f=createBatchProgress({deliveryPendingStatus:"delivery_pending",deferredReviewStatus:"deferred_review",
  mappingPendingStatus:"mapping_pending",liveLocalExecutor:()=>false,
  publishedPackageRecord:()=>{lookups++;return{state:"missing",document_result:null};}});
const p=f.publicProgress(state);
console.log("Paketzugriffe         :",lookups);
console.log("result_grades_verified:",p.result_grades_verified);
console.log("result_grade_counts   :",JSON.stringify(p.result_grade_counts));
console.log("user_status           :",p.user_status);'
```

Beobachtetes Ist:

```
Paketzugriffe         : 0
result_grades_verified: true
result_grade_counts   : {"complete":1,"usable_with_omissions":0,"not_processed":0,"unavailable":0}
user_status           : Stapel abgeschlossen: 1 vollständig verarbeitet, 0 mit Auslassungen verwendbar, 0 sicher nicht verarbeitet.
```

## 3. Umfang

**Dazu gehört – bei Zielbild (A):**

1. `batch-result-projection.js:39` fail-closed machen: ein fehlender oder kein
   Funktionswert für `verifyPositive` darf **nicht** `true` bedeuten. Ein
   Aufrufer ohne Verifizierer muss `unavailable` erhalten.
1a. **Zwingend: die Identitätsbindung darf nicht auf einem Number-Vergleich von
   `ino` beruhen.** Node liefert den 64-Bit-Dateiindex als JS-Number; oberhalb
   von 2^53 beträgt der Double-Abstand 2, sodass zwei verschiedene Dateien gleich
   vergleichen. Auf der Prüfmaschine lagen 30 von 400 frisch erzeugten Dateien
   darüber (`Number.MAX_SAFE_INTEGER` = 9007199254740991, beobachtete NTFS-`ino`
   = 9007199256521856, `ino + 1 === ino`). Verwende exakte Werte über
   `lstat`/`fstat` mit `{ bigint: true }` oder trage die Bindung nicht auf `ino`
   allein. Andernfalls entsteht eine neue Sicherheitsprüfung, die genau dort
   fail-open ist, wo sie greifen soll. Dieser Punkt ist unabhängig vom
   bestehenden, getrennt zu behandelnden Befund in
   `tests/test-source-format-inspector.js:206`; die 48 vorhandenen
   Number-Vergleiche von `ino` im Produktcode werden hier **nicht** mit
   umgestellt.
2. `batch-progress.js` so umbauen, dass auch der Weg über den durablen Marker
   jedes veröffentlichte Paket erneut bindet. Die Identitätswerte
   (`dev`, `ino`, `size`, `mtimeMs` von `manifest.json` und `<package_id>.md`)
   zum Zeitpunkt der Receipt-Erzeugung durabel festhalten, damit die Gegenprobe
   ohne erneutes Voll-Hashing auskommt. Der Nachweis selbst darf dadurch **keine**
   Paket-IDs, Pfade, Dateinamen oder Dokument-Hashes gewinnen – die Werte gehören
   in den privaten Checkpoint, nicht in `DataSecure-Batch-Nachweis.json`.
3. `batch-terminal-evidence.js:63` (`exportedMarkerMatchesState`) auf dieselbe
   Bindung umstellen.
4. Denselben verifizierten Wert an die Abschlussanzeige, die Cowork-Antwort und
   die Handoff-Kandidatenliste durchreichen; keine der drei Flächen darf eine
   eigene, schwächere Prüfung behalten.
5. Regressionstests:
   - `publicProgress` mit exportiertem Marker **und** einem
     `publishedPackageRecord`, der `missing` liefert ⇒ `grades_verified: false`,
     `unavailable === items.length`;
   - dasselbe für `unsafe` und für `verified` mit abweichendem
     `document_result`;
   - `projectBatchResults(state)` **ohne** `verifyPositive` ⇒ `unavailable`;
   - Positivfall: bei unverändertem Paket bleibt `grades_verified: true`, und die
     Anzahl der Paketzugriffe bleibt nachweisbar O(n) ohne Voll-Hashing.
6. **Bestehenden Test ersetzen:** `tests/test-batch-user-status.js:74`
   („durable terminal grades avoid package reopens but a changed state fails
   closed") zementiert mit `assert.strictEqual(packageReads, 0)` genau das
   Verhalten, das hier geändert wird. Der Test wird durch die neue Erwartung
   ersetzt, nicht gelöscht: die Absicht „kein Voll-Hashing im Fortschritt" bleibt
   prüfbar, nur nicht mehr als „kein Paketzugriff".
7. `docs/canonical/contracts/RESULT_GRADES_V1.md` präzisieren, welche Bindung
   „erneut gebunden" konkret bedeutet (Identität statt Voll-Hash), sowie
   `CURRENT_STATE.md` und `TRACEABILITY.md` für BL-049.1 nachziehen.

**Dazu gehört – bei Zielbild (B) stattdessen:**

1. Neue, ausdrücklich ersetzende DS-ID in `docs/canonical/DECISIONS.md`, die den
   durablen Receipt als Autorität der abgeschlossenen Zählung festlegt.
2. `RESULT_GRADES_V1.md` entsprechend ändern.
3. Die Anwendermeldung in `batch-progress.js:batchUserStatus` und in der
   Abschlussanzeige ehrlich machen: sie muss erkennbar den Abschlusszeitpunkt
   benennen und darf keine Aussage über den heutigen Bestand der Exporte
   suggerieren.
4. `batch-result-projection.js:39` trotzdem fail-closed machen – ein fehlender
   Verifizierer darf in keinem Zielbild `true` bedeuten.
5. Regressionstest, der belegt, dass die Meldung nach Verlust des Exports nicht
   mehr als Aussage über den Istbestand lesbar ist.

**Dazu gehört ausdrücklich nicht:**

- Änderungen an `document-result-grade.js`, am Journal-, Mapping-, Evidence- oder
  Receipt-Schema
- Änderungen an der Results-Fassade oder am Lesepfad – beide sind korrekt
- Änderungen an der Formatgrenze oder am Source-Preflight
- Behebung von P1-1, P1-2 oder P2-1

## 4. Abnahmekriterien

1. Die dokumentierte Product-Owner-Entscheidung (A) oder (B) liegt vor und ist
   im Commit benannt.
2. Die Reproduktion aus Abschnitt 2 liefert das dem gewählten Zielbild
   entsprechende Ergebnis; bei (A) `grades_verified: false` und
   `unavailable: 1`.
3. `projectBatchResults` ohne `verifyPositive` ergibt in **jedem** Zielbild
   `unavailable`.
4. Alle vier Flächen – Progress, Abschlussanzeige, Results und
   Cowork-Handoff-Kandidatenliste – melden nachweislich denselben Wert.
5. `tests/test-batch-user-status.js`, `tests/test-batch-result-projection.js`,
   `tests/test-batch-terminal-evidence.js`, `tests/test-completion-summary.js`,
   `tests/test-local-only-handoff.js`, `tests/test-batch-results.js` sind grün
   und decken den neuen Vertrag ab.
6. `npm run test:ci` und `npm run test:result-grades` sind grün.
7. Der lokale Nachweis, die Diagnose und das Mapping enthalten weiterhin keine
   Paket-IDs, Pfade, Dateinamen, Dokument-Hashes, Tokens oder Capabilities
   (`tests/test-audit-privacy.js`, `tests/test-diagnostics.js` grün).
8. Bei einem terminalen Stapel mit 100 freigegebenen Paketen wird im Fortschritt
   **kein** Dokument erneut vollständig gehasht; das ist messbar belegt.
9. `git diff --check` ist sauber.
10. Kein Commit und kein Push ohne ausdrückliche Freigabe.
