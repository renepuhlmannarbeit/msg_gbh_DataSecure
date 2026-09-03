# Codex: unabhängiges Read-only-Gegenreview von DataSecure 3.2.0-rc92

Stand: 03.09.2026 · Ausgangsstand `main` bei `4d932ad` (3.2.0-rc92) · nach
Abschluss archivieren

## 1. Auftrag und erwartetes Ergebnis

Prüfe GBH DataSecure unabhängig und ausschließlich lesend. Drei Review-Runden
vom 03.09.2026 wurden von Claude Code durchgeführt und umgesetzt (Ledger:
[`CLAUDE-CODE-GESAMTREVIEW-BERICHT-RC86.md`](CLAUDE-CODE-GESAMTREVIEW-BERICHT-RC86.md),
Abschnitte „Nachtrag rc90“ bis „Nachtrag rc92“, Findings U-01 bis U-30). Dein
Mehrwert ist der zweite, andere Blick: auf genau die heute geänderten Stellen und
auf die Punkte, die die Reviewer wegen Zeitlimits nicht abschließen konnten.

Ergebnis ist genau eine Datei `tasks/CODEX-REVIEW-BERICHT-RC92.md` mit
belastbaren Findings. Du änderst weder Code noch Tests noch Kanon. Fixes setzt
danach eine schreibende Hauptsession sequenziell um.

## 2. Verbindliche Grundlagen

Lies zuerst `CLAUDE.md`, `docs/canonical/README.md`,
`docs/canonical/DOCUMENT_REGISTER.md`, `docs/canonical/DECISIONS.md`
(insbesondere DS-026, DS-037, DS-048, DS-049, DS-066, DS-070, DS-071),
`docs/canonical/BACKLOG.md` und `docs/FORMAT_COVERAGE_MATRIX.md`. Bei
Widersprüchen gilt die Rangfolge des Dokumentenregisters.

Harte Grenzen, die auch für dein Review gelten:

- Originale werden nur lokal gelesen. Keine echten oder personenbezogenen
  Testdaten; ausschließlich synthetische Werte (`Max Mustermann`, `Erika
  Beispiel`, `example.invalid`, erfundene Nummern).
- Freigegeben sind nur TXT, Markdown, CSV und DOCX. Alles andere ist fail-closed
  und kein Mangel.
- Keine Pfade, Dateinamen, Hashes, Tokens oder Rohtexte in Diagnosen oder
  MCP-Antworten. Ein Vorschlag, der das aufweicht, ist kein Finding.
- Unter-Redaktion ist immer der schwerere Fehler als Über-Redaktion.
- Keine GitHub Actions, keine Pushes, keine History-Änderungen. Probeskripte nur
  unter dem Betriebssystem-Temp-Ordner.

## 3. Teil A: Gegenprüfung der heutigen Änderungen

Commits `4512edd` bis `4d932ad` (`git log --oneline 357f9d0..4d932ad` und
`git log --oneline 37184b5..357f9d0`).

### A1 Erkennungslogik (`plugins/data-secure/server/privacy/base.js`, `entities.js`, `structured.js`)

- `hasLabelBefore` mit `tableHeaderAt` (Spaltenkopf) und `previousLabelLine`
  (Label auf der Vorzeile): Suche Über-Redaktion, die dadurch neu entsteht
  (Mengen-, Datums- oder Nummernspalten unter harmlosen Köpfen; Prosa unter
  einer Überschrift, die zufällig ein Label ist). Suche verbleibende
  Unter-Redaktion in Tabellen ohne Trennzeile, mit zwei Kopfzeilen, mit
  zusammengeführten Zellen, mit Werten über Zellumbrüche.
- `HONORIFIC`, Partikel und `looksName`: Laufzeit auf langen Texten (kein
  exponentielles Backtracking; Vergleich mit `test-pii-regression` „linear
  time“), Namen mit Partikeln ohne Titel, Titel mitten im Satz, Firmennamen mit
  „von“/„de“.
- `PHONE_LABEL_RE`, `DATE_OF_BIRTH_RE`, `DATE_OF_BIRTH_LABEL_RE`: Fehlalarme
  durch Monatsnamen und Klammerzusätze, fehlende Sprachen, Datumsformen wie
  `1980-01-01`, `01 Jan 1980`, `1.1.80`.
- Residual-Gate (`engine.js` `scanResidual`): Zeige mindestens drei Formen, in
  denen ein Wert die Redaktion übersteht und das Gate ihn dennoch meldet, und
  prüfe, ob es Formen gibt, in denen beide gleich blind sind.

### A2 Start-Schutz (`plugins/data-secure/server/gateway/startup-guard.js`, `server/index.js`)

- Kann irgendein Startfehler weiterhin einen Stacktrace, Pfad oder Rohtext auf
  stderr bringen (auch Fehler innerhalb von `recordStartupRefusal` selbst,
  `require`-Fehler vor dem `try`, `process.exit` in Testharnessen)?
- `verifyBundledRuntime`: Verhalten bei Symlink auf die Programmdatei, bei
  fehlender `RUNTIME-EVIDENCE.json` im Quellcheckout mit Host-Node, bei
  macOS-Zielen (`runtime/targets/<ziel>/node`), bei Größenabweichung ohne
  Hash-Abweichung. Dauer der Prüfung auf langsamen Datenträgern und die Folge
  für den Cowork-Start (Zeitbudget des Hosts).
- Markerdatei `startup-refused.json`: Race bei parallelem Start zweier
  Serverinstanzen, Symlink-Angriff auf den Diagnoseordner.

### A3 Laufkennung (`gateway/workflow-diagnostics.js`, `gateway/batch-executor.js`)

- Ist `run_id` wirklich aus nichts abgeleitet und erscheint sie nirgends in
  MCP-Antworten, Skill-Texten oder Exportdateien?
- Übernimmt der Worker sie in allen drei Rollen (Intake, Batch, Review) und
  bleibt sie bei Fortsetzung eines Stapels stabil oder wechselt sie? Beides ist
  vertretbar; die Dokumentation muss es benennen.

## 4. Teil B: offene Punkte aus den Nachträgen rc91 und rc92

- **B1** Pfadtraversal und Symlinks in `gateway/result-export.js`,
  `gateway/package-staging.js`, `gateway/result-folder-config.js` und dem
  Löschpfad von `purge_local_data` (Supportmodus): Kann ein manipulierter
  Ergebnisordner oder ein Reparse-Point Dateien außerhalb des Zielbaums
  schreiben oder löschen? Beleg mit synthetischem Aufbau unter Temp.
- **B2** Vertagte Dokumente: Zeige End-to-End über `batch-review-state.js`,
  `document-result-grade.js`, `batch-results.js` und `local-only-handoff.js`,
  dass ein Item mit vertagtem Review nie nach `DataSecure-Output` exportiert
  oder über den Handoff gelesen wird. Wenn möglich mit einem Harness-Lauf wie in
  `tests/test-batch-session.js`.
- **B3** Skill-Behauptungen gegen Engine: alle konkreten Aussagen in
  `plugins/data-secure/skills/**` zu `PERSON_`/`ORG_`-Token,
  Beziehungserhalt, `complete`/`usable-with-omissions`, Auslassungsanzeige und
  Bildern gegen den Code prüfen.
- **B4** DOCX-Hyperlinks: `ooxml.js:842` blockiert jedes Dokument mit externer
  Beziehung. Bewerte die zwei Optionen (Linkziel verwerfen und Anzeigetext
  prüfen; oder Einschränkung in der Coverage-Matrix dokumentieren) mit Blick auf
  DS-007, DS-017 und DS-049 und gib eine Empfehlung mit Begründung. Keine
  Umsetzung.
- **B5** Zweizeilige Tabellenköpfe (`buildTableIndex`) und die Ortsredaktion von
  „Im Januar 1980“ (`[LOCATION_REDACTED]`): Ursache mit Datei und Zeile.

## 5. Ausdrücklich nicht Teil des Auftrags

- Keine Änderungen an Code, Tests, Skills, Kanon oder Ledger.
- Keine Bewertung des Cowork-Kontocaches (U-05, U-09, U-18): bekannter Hostfehler,
  außerhalb des Repositories.
- Keine menschliche E1/E2/E3-Evidenz simulieren; native Abnahmen bleiben offen.
- Keine Eval-Suite anlegen; `claude plugin eval` ist für die Organisation nicht
  freigeschaltet.
- Keine Vorschläge, die Keyring, Zusatzkonto, VM oder Cloud-Zwang wieder
  einführen oder die Inhaltsfreiheit der Diagnosen aufweichen.

## 6. Form der Findings

Jedes Finding enthält: Kennung (`C-01` …), Schwere (P1 bis P3, P1 nur bei
Unter-Redaktion, Datenabfluss oder stillem Teilergebnis), Datei und Zeile,
Reproduktion mit synthetischer Eingabe und tatsächlicher Ausgabe, Ist/Soll,
Auswirkung, Zuordnung zu bestehenden Kennungen (mindestens eine aus DS-049,
DS-048, DS-071, BL-021.1, BL-020.3, BL-041.10, BL-042 oder eine andere
bestehende Kennung; sonst ausdrücklich „keine bestehende Kennung“).
Bestätigte Korrektheit wird als eigener Abschnitt genannt, damit sie nicht
erneut geprüft werden muss. Nicht erreichte Punkte werden als „nicht geprüft“
aufgeführt, nie als „ohne Befund“.

## 7. Abnahmekriterien

- Der Bericht liegt als `tasks/CODEX-REVIEW-BERICHT-RC92.md` vor und enthält
  für jeden Punkt aus Teil A und Teil B ein Finding, eine Bestätigung oder den
  Vermerk „nicht geprüft“.
- Jede Reproduktion ist mit den im Bericht genannten Befehlen auf `main` bei
  `4d932ad` nachvollziehbar und verwendet nur synthetische Daten.
- `git status` zeigt außer dem Bericht keine Änderung; kein Commit, kein Push.
- Der Bericht nennt keine Pfade eines realen Benutzerprofils, keine Hashes
  realer Dokumente und keine Tokens.
