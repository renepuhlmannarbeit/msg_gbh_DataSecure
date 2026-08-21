# Gegenreview-Bericht für Claude — R4 / rc5

**Derzeit kein offener Implementierungsauftrag.** Ich habe Commit `00fb758`
unabhängig geprüft, die bestätigten Randfälle behoben und den Gegenreview-Auftrag
unter `tasks/archiv/2026-08-21-r4-rc5-gegenreview.md` archiviert.

## Findings und Ergebnis

### P2 — Mehrere Nachweise für dieselbe Preview blieben inkonsistent

**Ort:** `plugins/data-secure/server/gateway/retention.js`, zuvor
`reviewMetaIndex()`.

Die `Map<string, metaPath>` überschrieb den ersten Nachweis, wenn zwei
`.review.json` dieselbe `preview_file` nannten. Löschung und Reconcile änderten
nur den letzten Nachweis; der andere behauptete dauerhaft, die gelöschten Bytes
seien verfügbar.

**Fix:** Der Index hält jetzt alle Nachweispfade pro Preview. Löschung und
Reconcile schließen jeden davon. Ein Regressionstest erzeugt zwei Nachweise für
eine Preview und prüft beide Dateien nach dem Cleanup.

### P2 — Prüfzugriffsfehler wurde als fehlende Preview interpretiert

**Ort:** `retention.js`, zuvor `reconcileMissingPreviews()`.

Jeder Fehler aus `lstatSync()` setzte intern `exists = false`. Damit konnte etwa
`EACCES` den Nachweis auf `preview_expired` setzen, obwohl die sensiblen Bytes
noch existierten.

**Fix:** Nur `ENOENT` beweist Abwesenheit. Andere Fehler werden als Fehlercode
gemeldet; Preview und Nachweis bleiben unangetastet. Symlinks und andere
unerlaubte Typen werden ebenfalls nicht als erfolgreich gelöscht dargestellt.

### P2 — Reconcile-Fehler waren unsichtbar und Heilung konnte sieben Tage warten

**Ort:** `retention.js`, `reconcileMissingPreviews()` und `cleanupLocalData()`.

Ein Schreibfehler nach erfolgreichem `unlinkSync()` wurde im Reconcile
verschluckt. Außerdem aktualisiert das Löschen die Verzeichnis-mtime, sodass ein
späterer Lauf den inkonsistenten Nachweis bis zum nächsten Ablauf übersprang.

**Fix:** Reconcile gibt seine Fehler an den Status zurück und läuft für
Review-Nachweise bei jedem Cleanup-Trigger, unabhängig von der mtime. Ein Test
injiziert einen dauerhaften Schreibfehler, prüft die sichtbare Störung und die
Heilung im unmittelbar folgenden Lauf.

### P2 — Beliebige Exception-Texte konnten Dokumentnamen im Status offenlegen

**Ort:** `retention.js`, zuvor `recordFailure()`.

Ohne `err.code` wurde `err.message` in `privacy_status.error_codes` übernommen.
Ein Fehlertext konnte damit einen Paket-, Pfad- oder Dokumentnamen bis zu 60
Zeichen offenlegen.

**Fix:** Der Status akzeptiert ausschließlich validierte Code-Tokens. Alles
andere wird als `UNKNOWN` gezählt. Der Test verwendet bewusst einen sensiblen
Paketnamen in der Exception und prüft dessen Abwesenheit im gesamten Ergebnis.

### P3 — Zähleinheit und initiale Statusform waren instabil

**Ort:** `retention.js`, `lastCleanup` und `cleanupLocalData()`.

`removed.review` wechselte von Review-Einträgen auf Preview-Dateien, während
`processed`, `output` und `due_entries.review` weiterhin Einträge zählen.
Außerdem fehlten `forced` und die neue Preview-Zahl vor dem ersten Cleanup.

**Fix:** `removed.review` zählt rückwärtskompatibel Review-Verzeichnisse;
`removed_review_previews` zählt separat die gelöschten Dateien. Initialwert,
normaler Lauf und Purge haben dieselbe Diagnoseform.

## Weitere geprüfte Punkte

- Ein manipuliertes `preview_file: "../outside.png"` wird fail-closed beendet,
  ohne den Außenpfad zu prüfen oder die dortige Datei zu löschen.
- `preview_expired: true` bei noch vorhandener Preview bleibt absichtlich
  fail-closed. Manipulation kann dadurch Nutzung verhindern, aber keine Grafik
  freigeben oder Daten offenlegen.
- `retention_days=0` deaktiviert die visuelle Freigabe tatsächlich. Der neue
  Gateway-Test prüft Preview-Ablauf, lesbares Paket und die eindeutige
  Aufbewahrungsfehlermeldung.
- Audit, Staging-Grenzen, Scope-Bestätigung und Tool-Parität blieben unverändert
  korrekt.

## Verifikation

- Version: `3.2.0-rc6`
- `npm test`: **221 Fälle plus Plugin-Strukturcheck**, grün
- Golden-File: unverändert
- `npm run build`: grün
- Plugin-ZIP SHA-256:
  `e9177657c4cfc4fe7e2e6794851b884902cf205e54c6b4824d7f9d080a0725df`
- MCPB SHA-256:
  `3b220b60bc8c73ba278f7191149b7f5353a5506e19e01807af9ca3dde9f76eee`

## Verbleibender Rückstand

- Windows-Abnahme von OCR und EMF/WMF-Rasterisierung
- `LICENSE`-Platzhalter, wartet auf juristische Prüfung
