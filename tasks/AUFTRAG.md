# Aktueller Arbeitsauftrag — Nacharbeiten zum R4-Review

Review von `908600c` `feat(privacy): enforce local retention and purge` ist
abgeschlossen. Der Review-Auftrag liegt unter
`tasks/archiv/2026-08-21-r4-review-auftrag.md`.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm test        # 212 Fälle, müssen am Ende grün sein
npm run build
```

## Was am Commit richtig ist und nicht zurückgebaut wird

Unabhängig nachgemessen, nicht aus dem Commit-Text übernommen:

- **Löschgrenzen halten.** `assertInside()` prüft jeden Knoten, `removalPlan()`
  inspiziert den gesamten Baum vor dem ersten Byte, Symlinks und Junctions
  werden abgelehnt statt verfolgt. Kein Weg aus `Processed`, `Output` oder
  `Needs Visual Review` heraus gefunden.
- **Staging bleibt unangetastet.** `directEntries()` filtert `.`-Präfixe; ein
  `.Paket.tmp_*` überlebt auch `purge_local_data` mit `force`.
- **Audit ist unerreichbar.** `SCOPES` kennt nur `processed|output|review`,
  `r[scope]` kann das Audit-Verzeichnis nicht adressieren. `audit`, `jobs` und
  ein Array mit `audit` werden alle abgewiesen.
- **Bestätigung ist strikt.** `confirmed` akzeptiert nur das Boolean `true`;
  `"true"`, `1` und `{}` werfen. Im Schema `const: true`,
  `additionalProperties: false`, Scope als Enum.
- **12 Tools, Parität Manifest/Runtime `true`.** `retention_days` ist in
  `manifest.json` als `user_config` und in `.mcp.json` als
  `EU_PRIVACY_RETENTION_DAYS` verdrahtet.
- **Löschfehler bleiben Nebenfehler.** Ein injizierter `EBUSY` beim ersten
  Eintrag bricht nichts ab, der zweite Eintrag wird trotzdem entfernt, der
  gesperrte bleibt liegen.
- **Grenzwert und ungültige Werte deterministisch.** `mtime` exakt am Cutoff
  wird gelöscht; `"abc"`, `"-1"`, `"3.5"`, `""` fallen alle auf 7 zurück.
- **`retention_days=0` verhält sich wie zugesagt.** Das gerade erzeugte Paket
  ist in derselben Antwort lesbar, `Processed` ist leer. Der Nachcommit-Cleanup
  nimmt bewusst nur `['processed','review']`.
- **Status leckt keine Rohdaten.** Kein Dateiname, kein Dokumentinhalt.
- Der Gutfall der Preview-Löschung ist korrekt: Bild weg, `.review.json`
  erhalten, `preview_expired: true`, `preview_file: null`.

---

## P1 — Teil-Löschung im Review-Ordner hinterlässt einen veralteten Nachweis

**Ort:** `plugins/data-secure/server/gateway/retention.js`,
`removeReviewPreviews()`, Zeilen 128–147. Kern: `markReviewExpired()` wird erst
**nach** der vollständigen Schleife über alle Previews aufgerufen (Zeile 145).

Der Pfad für `processed` und `output` folgt der Disziplin „erst planen, dann
löschen" — `removalPlan()` inspiziert den ganzen Baum, bevor das erste Byte
fällt. Der Review-Pfad tut das nicht: er wechselt in derselben Schleife zwischen
`lstatSync` und `unlinkSync` und wirft mitten im Löschen.

**Reproduktion**

```
Needs Visual Review/<paket>/
  asset-001.png            (echtes Preview-Bild)
  asset-001.review.json    { preview_file: "asset-001.png", preview_sha256: "…" }
  blocker/                 (irgendein Eintrag, der keine reguläre Datei ist)
```

Dann `cleanupLocalData({ scope: ['review'] })` mit abgelaufener mtime.

**Ist** — gemessen, sowohl isoliert als auch über `anonymizeNext()` am echten
Gateway:

- `asset-001.png` ist gelöscht, `errors` steht auf 1
- `asset-001.review.json` behauptet weiterhin `preview_file: "asset-001.png"`
  und `preview_sha256`
- `listReviewItems()` meldet für dieses Item `preview_available: true`
- `approveReviewAsset(review_id, true)` scheitert mit `"Paketdatei fehlt."` —
  eine Meldung, die einen Paketschaden nahelegt statt einer abgelaufenen
  Preview
- `result.removed.review` bleibt 0, obwohl gelöscht wurde; `privacy_status`
  untertreibt damit die tatsächliche Löschung

**Soll:** Der Nachweis darf die Bytes nicht überleben. Jeden Eintrag einzeln
abschließen — Bytes weg, Nachweis sofort nachgezogen — statt am Ende der
Schleife gesammelt. Ein fehlerhafter Eintrag darf die bereits erledigten nicht
um ihre Markierung bringen. Und wenn Bytes gelöscht wurden, muss
`removed.review` das zählen, auch wenn danach ein Fehler auftritt.

Zusätzlich sollte `approveReviewAsset()` einen abgelaufenen Preview als solchen
melden statt als fehlende Paketdatei; nach dem Fix ist `preview_expired: true`
im Nachweis die verlässliche Grundlage dafür.

**Fehlende Absicherung:** Kein Test deckt einen Fehler *innerhalb* der
Review-Schleife ab. Die bestehenden Fälle prüfen nur den Gutfall und den Fall
„Verzeichnis komplett unlesbar". Der Test muss einen Teilerfolg erzwingen und
danach den Nachweis prüfen, nicht nur die Bilddatei.

---

## P3 — `errors` ist eine Gesamtzahl ohne Bereich und ohne Grund

**Ort:** `retention.js`, Zeilen 189–191: `catch { result.errors++ }`.

Der Fehler wird verworfen. `privacy_status` zeigt `errors: 1` — nicht in welchem
Bereich, nicht warum, nicht für welchen Eintrag. Der Review-Auftrag verlangte
ausdrücklich, dass partielles Löschen „im Status nachvollziehbar" ist. Sicher
ist es, nachvollziehbar kaum.

**Soll:** pro Bereich zählen und einen Grund je Fehler festhalten, ohne
Rohdaten — Bereich, Fehlercode (`EBUSY`, `EPERM`, `ENOTEMPTY`) und Anzahl
genügen. Kein Dateiname, kein Pfad, keine Dokumentbezeichnung.

---

## P3 — Leere Review-Verzeichnisse bleiben für immer liegen

**Ort:** `retention.js`, `removeReviewPreviews()` — entfernt Previews, nie das
Verzeichnis selbst.

Nach dem Ablauf bleibt `Needs Visual Review/<paket>/` mit nur noch
`.review.json` darin stehen, dauerhaft. Über Monate wächst der Ordner monoton
mit leeren Paketverzeichnissen. Gemessen über drei Aufräumläufe: das
Verzeichnis bleibt.

Keine Personendaten, aber es widerspricht dem Zweck des Features und macht den
Ordner für den Anwender unlesbar, der laut `docs/ANLEITUNG.md` dort selbst
nachsehen soll.

**Soll:** Ein Paketverzeichnis, das nur noch Nachweise enthält, kann in ein
Nachweisverzeichnis zusammengeführt oder nach einem längeren, eigenen Fenster
entfernt werden. Falls die Nachweise bleiben sollen — vertretbar — dann
dokumentieren, dass dieser Ordner Nachweisreste sammelt.

---

## P3 — `purge_local_data` verkleidet sich im Status als Aufbewahrungslauf

**Ort:** `retention.js`, `cleanupLocalData()` Zeile 195 (`lastCleanup = result`)
in Verbindung mit `purgeLocalData()` Zeile 231, das mit `force: true` aufruft.

Nach einem manuellen Purge zeigt `privacy_status.retention_last_cleanup` einen
Datensatz mit `retention_days: 7`, obwohl der Lauf jede Ablauffrist ignoriert
hat. Wer den Status liest, hält eine Zwangslöschung für einen normalen
Ablauflauf.

**Soll:** den Auslöser mitschreiben (`trigger: 'startup' | 'run' | 'purge'`) oder
den erzwungenen Lauf getrennt festhalten.

---

## P3 — `retention_days = 0` macht die Bildfreigabe dauerhaft unmöglich

**Ort:** `orchestrator.js` Zeilen 194–196 in Verbindung mit
`manifest.json` → `user_config.retention_days.description`.

Gemessen: mit `retention_days = 0` ist die Review-Preview direkt nach dem Commit
gelöscht. Bei `applicant` und `personnel_profile` werden Bilder
**grundsätzlich** zurückgehalten — dort bedeutet die Einstellung also, dass
niemals ein Bild freigegeben werden kann, weil zum Zeitpunkt der menschlichen
Prüfung nichts mehr da ist.

Das ist eine vertretbare Maximaleinstellung, aber die Beschreibung im Manifest
sagt nur „0 löscht nach erfolgreicher Verarbeitung so früh wie sicher möglich".
Das liest sich wie eine Feinjustierung, nicht wie das Abschalten eines
Arbeitsschritts.

**Soll:** In der Manifest-Beschreibung und in `docs/PLUGIN_SECURITY_MODEL.md`
ausdrücklich hinschreiben, dass `0` die visuelle Freigabe faktisch deaktiviert.
In `docs/ANLEITUNG.md` genügt eine Zeile bei Regel 2 für den Fall, dass die IT
diesen Wert setzt.

---

## P3 — Es gibt keinen „Verwerfen"-Pfad, nur Freigabe und Ablauf

Der archivierte R4-Auftrag verlangte die Preview-Löschung „nach Freigabe **oder
Verwerfen**". Umgesetzt sind Freigabe und Ablauf; ein Tool zum ausdrücklichen
Verwerfen existiert nicht. Der Code behauptet auch keines — insofern kein
Defekt, aber eine Lücke gegen den Auftrag.

**Soll:** entweder ein `reject_visual_asset` mit demselben
Bestätigungsmuster ergänzen, oder in `docs/PLUGIN_SECURITY_MODEL.md`
festhalten, dass Ablauf der einzige Weg der Ablehnung ist. Die zweite Variante
ist vertretbar und billiger; dann aber bitte hinschreiben, damit niemand ein
Tool sucht, das es nicht gibt.

---

## Nicht Teil dieses Auftrags

- Windows-Abnahme von OCR und EMF/WMF-Rasterisierung
- `LICENSE` — Platzhalter, wartet auf juristische Prüfung
- Verschlüsselung der lokalen Ordner
- neue PII-Detektoren, Änderungen am Golden-Output
- Versionsanhebung über `3.2.0-rc4` hinaus, sofern nur P3 abgearbeitet wird;
  P1 allein rechtfertigt `rc5`

## Abnahmekriterien

- [ ] `npm test` grün, Fallzahl ≥ 212 plus die neuen Fälle
- [ ] `tests/expected/synthetic-personnel-profile.expected.md` unverändert
- [ ] `npm run build` läuft durch, beide Artefakte entstehen
- [ ] Ein Review-Verzeichnis mit einem Blocker: gelöschte Previews sind im
      Nachweis als `preview_expired` markiert, `removed.review` zählt sie, und
      `errors` meldet den Blocker
- [ ] `listReviewItems()` meldet für eine gelöschte Preview nicht mehr
      `preview_available: true`
- [ ] `approveReviewAsset()` auf ein abgelaufenes Item nennt den Ablauf, nicht
      „Paketdatei fehlt"
- [ ] Wiederholtes Aufräumen bleibt bei einem dauerhaften Blocker stabil und
      löscht nichts Zusätzliches
- [ ] Kein Test wartet auf reale Zeit
- [ ] Die vier P3-Punkte sind entweder umgesetzt oder in
      `docs/PLUGIN_SECURITY_MODEL.md` als bewusste Entscheidung dokumentiert —
      stillschweigend offen lassen zählt nicht
- [ ] Commit-Body benennt jedes Finding, die Ursache und die Absicherung
