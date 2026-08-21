# Aktueller Arbeitsauftrag für Codex — Review meines R4-Fixes

Die Rollen sind getauscht: Ich habe die Findings aus meinem eigenen R4-Review
umgesetzt. Damit hat sie niemand unabhängig geprüft — genau das soll dieser
Auftrag nachholen.

## Ausgangspunkt

Reviewe den Commit, der auf `109933d` folgt (`fix(retention): …`). Mein
Review-Bericht liegt unter `tasks/archiv/2026-08-21-r4-nacharbeiten.md`, der
ursprüngliche Review-Auftrag unter
`tasks/archiv/2026-08-21-r4-review-auftrag.md`.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm test        # 215 Fälle, grün
npm run build   # rc5, beide Artefakte
```

Stand: Version `3.2.0-rc5`, Golden-File unverändert, CI grün.

## Was ich geändert habe

**P1 — `retention.js`, `removeReviewPreviews()`.** Die Löschung wird jetzt pro
Eintrag abgeschlossen: Bytes weg, Nachweis unmittelbar danach aktualisiert. Neu
sind `reviewMetaIndex()`, `markPreviewExpired()` und
`reconcileMissingPreviews()`. Letztere heilt Nachweise, deren `preview_file` auf
eine nicht mehr existierende Datei zeigt — ohne diesen Schritt hinge die
Invariante an einem fehlerfreien Einzeldurchlauf, weil eine gelöschte Datei in
`previewFiles()` nie wieder auftaucht. Die Funktion gibt jetzt
`{ removed, failures }` zurück, sodass gelöschte Bytes auch dann gezählt werden,
wenn ein späterer Eintrag scheitert.

**P1-Folge — `review.js`, `approveReviewAsset()`.** Ein abgelaufenes Item wird
über `preview_expired` erkannt und mit einer Meldung abgewiesen, die die Frist
nennt, statt mit „Paketdatei fehlt".

**P3 — Fehlerberichte.** `errors` bleibt als Gesamtzahl erhalten
(rückwärtskompatibel), dazu kommen `errors_by_scope` und `error_codes`. In den
Codes stehen nur Fehlercodes oder gekürzte Meldungen, keine Pfade und keine
Dateinamen; ein Test prüft, dass kein Eintragsname in den Statusdatensatz
gelangt.

**P3 — Auslöser sichtbar.** `cleanupLocalData` schreibt `trigger`
(`startup` | `run` | `purge`) und `forced` mit. Verdrahtet in `index.js`,
`orchestrator.js` und `purgeLocalData`.

**P3 — Dokumentation statt Code**, jeweils bewusst:

- `retention_days = 0` deaktiviert die Bildfreigabe. Steht jetzt in der
  Manifest-Beschreibung, in `docs/PLUGIN_SECURITY_MODEL.md` und als eigener
  Absatz bei Regel 2 in `docs/ANLEITUNG.md`.
- Review-Verzeichnisse, die nur noch Nachweise enthalten, bleiben liegen. Als
  bewusste Entscheidung dokumentiert: die `.review.json` sind der Beleg, was
  zurückgehalten wurde und wann die Bytes abliefen.
- Es gibt keinen ausdrücklichen Verwerfen-Pfad; Zurückhalten plus Ablauf **ist**
  die Ablehnung. Ebenfalls dokumentiert, damit niemand ein Tool sucht, das es
  nicht gibt.

**Neue Tests** in `tests/test-retention.js` (6 → 9). Gegen den alten Code
geprüft: alle drei sind ohne den Fix rot, mit dem Fix grün.

## Auftrag

Prüfe unabhängig, ob der Fix hält, und suche gezielt nach dem, was ich beim
Beheben meines eigenen Findings übersehen haben könnte.

### 1. Ist die Invariante wirklich geschlossen?

Die Zusage lautet: **ein Nachweis überlebt die Bytes nie.** Suche einen Weg, das
zu brechen.

- Was passiert, wenn `markPreviewExpired()` scheitert, nachdem `unlinkSync()`
  erfolgreich war — etwa bei einer schreibgeschützten `.review.json`? Der
  Reconcile-Schritt läuft danach im selben Aufruf; greift er, oder wird der
  Fehler nur gezählt und der Nachweis bleibt veraltet?
- Zwei Nachweise, die dieselbe `preview_file` nennen: `reviewMetaIndex()` ist
  eine `Map`, der zweite überschreibt den ersten. Bleibt einer unmarkiert?
- Ein Nachweis mit `preview_file`, das kein Basename ist (`../x.png`) — was tut
  `reconcileMissingPreviews()` damit? `assertInside` wird dort **nicht**
  aufgerufen; `markPreviewExpired` schreibt nur die Metadatei, aber die
  Existenzprüfung erfolgt über `path.join`. Ist das harmlos oder eine Lücke?
- Ist `removed.review` jetzt eine Preview-Zahl statt einer Verzeichniszahl? Ich
  habe die Semantik geändert (vorher: `++` je Verzeichnis, jetzt: `+=` je
  Preview). Prüfe, ob irgendein Konsument oder Test die alte Bedeutung annimmt.

### 2. Rückwärtskompatibilität der Statusform

`errors` ist absichtlich eine Zahl geblieben. Prüfe, ob `errors_by_scope` und
`error_codes` überall dort mitgeführt werden, wo `lastCleanup` entsteht — auch im
Initialwert und nach einem Purge. Ein Statusfeld, das je nach Zeitpunkt fehlt,
ist schlechter als keins.

### 3. Fehlerrichtung der neuen Meldung

`approveReviewAsset()` unterscheidet jetzt drei Fälle: bereits freigegeben,
abgelaufen, nie vorhanden. Kann ein manipulierter Nachweis mit
`preview_expired: true` **und** vorhandener Bilddatei dazu führen, dass eine
tatsächlich freigebbare Grafik dauerhaft abgewiesen wird? Fehlerrichtung wäre
Nutzenverlust, nicht Datenschutz — trotzdem melden.

### 4. Sind meine Tests ehrlich?

- Prüfen sie den Mechanismus oder nur das Symptom?
- `a purge is recorded as a purge` prüft `trigger` und `forced`. Prüft es auch,
  dass ein normaler Ablauflauf **nicht** `purge` schreibt?
- Fehlt ein Fall für `reconcileMissingPreviews()` bei mehreren Nachweisen?

### 5. Vollständigkeit gegen meinen eigenen Bericht

Ich habe fünf P3 gemeldet und zwei davon per Code, drei per Dokumentation
geschlossen. Prüfe, ob die drei Dokumentationsentscheidungen inhaltlich
zutreffen — insbesondere, ob `retention_days = 0` die Bildfreigabe tatsächlich
vollständig deaktiviert, oder ob es einen Pfad gibt, über den doch noch eine
Freigabe möglich ist. Wenn ja, ist meine Dokumentation falsch.

## Ergebnisformat

Wie in meinem Review: Findings zuerst, `P0` bis `P3`, jedes mit Datei und enger
Zeilenstelle, Reproduktion, Ist, Soll und fehlender Absicherung. Keine
Stilhinweise ohne messbare Auswirkung.

Bei Findings: Fixe sie direkt — du hast den Kontext, und ich habe hier die
Gegenprüfung. Danach diese Datei durch einen Bericht für mich ersetzen und den
Auftrag datiert nach `tasks/archiv/` legen. Ohne Findings: `tasks/AUFTRAG.md`
auf „Derzeit kein offener Auftrag" setzen, mit dem verbleibenden Rückstand
(Windows-Abnahme, `LICENSE`).

## Nicht Teil dieses Auftrags

- Windows-Abnahme von OCR und EMF/WMF-Rasterisierung
- `LICENSE` — Platzhalter, wartet auf juristische Prüfung
- Verschlüsselung der lokalen Ordner
- neue PII-Detektoren, Änderungen am Golden-Output
- Versionsanhebung über `3.2.0-rc5` hinaus, sofern nur P3 anfällt
