# Arbeitsauftrag an Codex: Gegenreview RC37→RC41 und Backlog-Aktualisierung

**Status:** zeitlich begrenzter Review- und Dokumentationsauftrag
**Ausgangsstand:** `main` auf Commit `4e9caf9`, Version `3.2.0-rc41`
**Verbindliche Grundlage:** `docs/canonical/BACKLOG.md`, `docs/canonical/DECISIONS.md` und `tasks/README.md`
**Zugeordnete Stories (Startpunkt, siehe Teil B):** BL-031.1, BL-050.3; Entscheidung DS-012

Dieser Auftrag ersetzt weder das kanonische Backlog noch das Entscheidungsregister. Er darf erledigte Stories nicht ohne neue, reproduzierbare Evidenz wieder öffnen und darf E1-, E2- oder E3-Nachweise nicht durch reine Unit-/Regressionstests ersetzen.

## 0. Kontext, den du noch nicht kennst

Zwischen deinem letzten Stand und `4e9caf9` hat Claude Code den Auftrag `tasks/CLAUDE-CODE-AUFTRAG-RC37-CLI-EVAL.md` bearbeitet (Ausgangscommit `9f375b7`, Version `3.2.0-rc37`). Kurzfassung, damit du nicht bei null anfängst:

- **Kernbefund des Auftrags:** `claude plugin eval` ist auf dieser Organisation hinter einem Anthropic-Early-Access-Gate gesperrt (`` `plugin eval` is currently in early access ``). Das ist eine organisationsweite, von Anthropic verwaltete Sperre ohne lokales Opt-in. Abschnitt 5–7 des Auftrags (Eval-Harness bauen, With/Without-Ablation ausführen) konnten deshalb nicht durchgeführt werden. Das ist eine **menschliche** Aufgabe (Anthropic-Account-/Sales-Kontakt) und **nicht** Teil dieses Codex-Auftrags — fasse den Blocker nicht erneut an.
- **Ersatzweg:** Eine schemakonforme Fallspezifikation ohne erfundenes Dateiformat (`evals/plugin-eval/cases-draft.json`, `evals/plugin-eval/README.md`) sowie drei reale, kostenbegrenzte `claude -p --plugin-dir`-Smoke-Läufe. Ergebnis dokumentiert in `tasks/RC37-CLI-EVAL-BERICHT.md`.
- **Bei der Nacharbeit zum Auftrag wurden vier reale, reproduzierbare Fehler in der Erkennungs-/Durability-Logik gefunden, behoben, regressionsgetestet und einzeln committet und gepusht:**

  | Commit | Version | Thema |
  |---|---|---|
  | `068c0cc` | rc38 | Kunde/Arbeitgeber in Fließtext innerhalb eines Zertifizierungsabschnitts blieb unredigiert (Unter-Redaktion) |
  | `0ccf994` | rc39 | Diagnostische Batch-Checkpoints erzwingen `fsync`, obwohl `item.status` unverändert bleibt (Performance) |
  | `b7b7e02` | rc40 | Feminine Substantivform („Kundin“) und Verbphrasen („angestellt bei“) wurden von der Kunde/Arbeitgeber-Erkennung nicht erfasst (Unter-Redaktion) |
  | `4e9caf9` | rc41 | Ein domänenförmiger Zertifikatsaussteller vor dem Zertifikatstitel wurde fälschlich als URL vollständig anonymisiert (Über-Redaktion) |

- **Wichtige Lücke:** `tasks/RC37-CLI-EVAL-BERICHT.md` wurde nur **einmal** nachträglich ergänzt (Commit `1b97f95`, deckt ausschließlich `068c0cc` ab). Die drei späteren Commits (`0ccf994`, `b7b7e02`, `4e9caf9`) sind in diesem Bericht **nicht** dokumentiert, und das kanonische Backlog wurde seither nicht angefasst. Das ist der Hauptgrund für Teil B dieses Auftrags.
- Alle vier Commits sind bereits auf `origin/main` gepusht (ausdrücklich vom Product Owner freigegeben). Dein Auftrag ist eine **unabhängige Gegenreview danach**, kein Rework der Fixes selbst.

## 1. Ziel

**Teil A:** Führe ein unabhängiges, adversariales Gegenreview der vier oben genannten Commits durch (`068c0cc`, `0ccf994`, `b7b7e02`, `4e9caf9`). Prüfe nicht nur, ob die neuen Tests grün sind, sondern ob sie tatsächlich beweisen, was sie behaupten, und ob die Fixes neue Lücken öffnen.

**Teil B:** Aktualisiere `tasks/RC37-CLI-EVAL-BERICHT.md` sowie die kanonischen Dokumente (`docs/canonical/BACKLOG.md`, `docs/canonical/CURRENT_STATE.md`, `docs/canonical/TRACEABILITY.md`, `docs/canonical/BACKLOG_EVIDENCE_MATRIX.md`) so, dass sie die durch die vier Commits tatsächlich neu entstandene E0-Evidenz korrekt widerspiegeln — nicht mehr und nicht weniger.

## 2. Unveränderliche Regeln

1. Nur synthetische Testdaten verwenden. Niemals echte Kunden-, Bewerber-, Mitarbeiter- oder Patientendaten.
2. **Unter-Redaktion ist immer der schwerere Fehler als Über-Redaktion.** Ein Finding, das eine neue Unter-Redaktion durch einen der vier Fixes zeigt, hat automatisch Priorität `P0`, unabhängig davon, wie unwahrscheinlich der auslösende Text wirkt.
3. Beruflich relevante Inhalte (Rollen, Zertifikate, Aussteller, Methoden, Branchen, fachliche Zeiträume) bleiben erhalten, sofern sie im konkreten Kontext nicht selbst identifizierend sind (DS-012).
4. Keine Behauptung einer rechtssicheren Anonymisierung oder DSGVO-/EU-AI-Act-Zertifizierung.
5. Basisoriginale und bereits archivierte Aufträge/Berichte dürfen nicht gelöscht oder umgeschrieben werden; Ergänzungen statt Überschreiben.
6. Aktualisiere kanonisches Backlog, Traceability, Evidenzmatrix und Bericht **nur** bei tatsächlich neu belegter Evidenz — keine Statushebung ohne einen konkret benannten, reproduzierbaren Beleg (Test, Befehl, Exitcode).
7. Erzeuge weder Commit noch Push, solange dies nicht im Auftrag der ausführenden Sitzung ausdrücklich freigegeben wurde.

## 3. Teil A — Gegenreview je Commit

### A1. `068c0cc` — Prose-Kunde/Arbeitgeber in Zertifizierungsabschnitt

Datei: `plugins/data-secure/server/privacy/credentials.js`, Regex `NON_ISSUER_LABEL_RE` (Zeile ~39), Funktion `inCredentialContext`.

- Deckt `NON_ISSUER_LABEL_RE` wirklich alle im selben Commit genannten Fließtext-Formen ab, oder nur die im Test geprüften Formulierungen? Suche gezielt nach Formulierungen, die die Regex NICHT trifft (andere Präpositionen, umgestellte Satzstellung, englische Mischformen).
- Kann die neue Fließtext-Erkennung einen **echten Zertifikatsaussteller** fälschlich als Kunde/Arbeitgeber einstufen und damit über-redigieren? Prüfe Fälle, in denen ein Aussteller-Name zufällig eines der Signalwörter (`kunde`, `firma`, `unternehmen` …) enthält oder direkt danach im Text steht.

### A2. `b7b7e02` — Feminine Form und Verbphrasen

Datei: `plugins/data-secure/server/privacy/credentials.js`, `NON_ISSUER_LABEL_RE`, `NON_ISSUER_PREFIX_RE` (Zeile ~197), `inCredentialContext`.

- `NON_ISSUER_PREFIX_RE` prüft laut Kommentar/Herleitung den **eigenen** Text der erkannten Organisations-Fundstelle, weil `COMPANY_RE` das Rollensubstantiv in den Treffer hineinzieht. Verifiziere das an einer konkreten Fundstelle mit `console.log`/Debug-Ausgabe der tatsächlichen Match-Grenzen — nicht nur am Testergebnis. Stimmt die Annahme über die Match-Grenzen tatsächlich für alle Organisationsformen (z. B. mehrteilige Firmennamen mit Rechtsform-Suffix)?
- Sind weitere grammatische Formen (z. B. Plural, andere Sprachen im Korpus, Nominalisierungen) offensichtlich lückenhaft, obwohl sie mit vertretbarem Aufwand hätten erfasst werden können? Nenne konkrete Gegenbeispiele, keine allgemeine Vermutung.
- Prüfe eine Wechselwirkung mit A1: Kann ein Text gleichzeitig ein `NON_ISSUER_LABEL_RE`- und ein `NON_ISSUER_PREFIX_RE`-Signal in einer Weise enthalten, die den falschen (den Aussteller statt den Kunden) unterdrückt?

### A3. `4e9caf9` — Domänenförmiger Aussteller vor Credential-Titel

Datei: `plugins/data-secure/server/privacy/credentials.js`, Funktion `isCredentialIssuerDomain` (Zeile ~206), inklusive der neu ergänzten `before`-Prüfung.

- Die `before`-Prüfung schützt eine Domain nur, wenn ein Credential-Cue **vor** der Domain auf derselben Zeile steht. Was passiert, wenn der Cue in der **vorherigen** Zeile steht (mehrzeiliger Zertifikatsblock, häufig in DOCX-Tabellen und Listen)? Ist das ein reproduzierbarer Rückschritt zur alten Über-Redaktion, oder bewusst nicht abgedeckt?
- Kann die neue `before`-Prüfung umgekehrt eine **echte** Kunden-/Arbeitgeber-Domain (z. B. `kontakt@kunde-xyz.de` im selben Satz wie das Wort „Zertifikat“) fälschlich als Aussteller schützen und damit unter-redigieren? Das wäre `P0`.

### A4. `0ccf994` — Selektive Fsync-Reduktion

Dateien: `plugins/data-secure/server/gateway/batch.js` (Funktion `writeState`, Option `durable`; die `checkpoint(...)`-Aufrufe in `processBatchNext`; die beiden inline Checkpoint-Schreibvorgänge im Batch-Review-Publish-Pfad), `plugins/data-secure/server/gateway/orchestrator.js`, `tests/test-batch-performance-contract.js`.

Das ist der sicherheitskritischste der vier Fixes — prüfe ihn am strengsten:

- Verifiziere am **aktuellen** Code (nicht am Commit-Diff allein), dass `markInterruptedItemsRetryable` wirklich ausschließlich `item.status` prüft und `item.checkpoint` an keiner Stelle der Crash-Recovery-Entscheidung einfließt. Suche zusätzlich nach jeder anderen Stelle im Code, die `item.checkpoint` liest — entscheidet irgendeine davon über Sicherheits- oder Publikationslogik statt nur über Diagnose/Anzeige?
- Ist jede der Stellen, an denen `{ durable: false }` übergeben wird, wirklich nur ein Zwischenstand, bei dem `item.status` unverändert bleibt? Finde jede `writeState(state` bzw. `writeState(state,`-Aufrufstelle in `batch.js` und ordne sie einzeln als durable oder non-durable ein; markiere jede Fundstelle, an der eine `status`-Änderung mit `{ durable: false }` geschrieben werden könnte (auch über indirekte Codepfade, nicht nur den aktuell sichtbaren).
- Prüft der neue Test in `tests/test-batch-performance-contract.js` tatsächlich das Verhalten unter einem echten Absturz (z. B. Prozessabbruch zwischen zwei non-durable Writes), oder nur, dass `fsyncSync` nicht aufgerufen wird? Reicht das als Beleg? Wenn nicht: Was fehlt, um einen echten Crash-Injection-Fall abzudecken?
- `syncParentDirectory` ist unter Windows ein No-op (`native/`/`posix-supervisor.js`-Kontext beachten). Ändert das etwas an der Sicherheitsargumentation für Windows als Zielplattform, oder war das Verzeichnis-Fsync ohnehin nur für POSIX relevant?

### A5. Cross-Cutting

- Führe die vollständige adversariale und Regressionsprüfung aus (siehe Abschnitt 5). Bestehen alle vier Fixes zusammen weiterhin ohne neue Unter-Redaktion?
- Stimmen Version (`3.2.0-rc41`), ZIP-Pfad (`dist/DataSecure-Privacy-Preflight-v3.2.0-rc41.zip`) und SHA-256 (`1c6c2438b0431c1bd8f5220177e8bb890c805c5c341008b8bb2ad808a3c76bd3`) nach einem eigenen `npm run build:plugin` überein?

## 4. Teil B — Backlog- und Berichtsaktualisierung

Nur durchführen, soweit Teil A keine `P0`-Findings ergibt, die die Fixes selbst in Frage stellen. Bei `P0`-Findings: Dokumentiere sie zuerst; die Backlog-Aktualisierung muss den tatsächlichen (ggf. weiterhin unvollständigen) Stand widerspiegeln, nicht den beabsichtigten.

1. Ergänze `tasks/RC37-CLI-EVAL-BERICHT.md` um die drei bisher fehlenden Commits (`0ccf994`, `b7b7e02`, `4e9caf9`) nach demselben Muster wie der bestehende Nachtrag zu `068c0cc`: Fundstelle, Ist/Soll, Ursache, Regressionstest, Versions-/Hash-Stand. Verändere den bestehenden Text zu `068c0cc` nicht inhaltlich, nur falls dein Gegenreview dort einen Fehler findet.
2. Prüfe, ob `BL-031.1` („Fundstellen gruppiert und lokal im Stapel entscheiden“) und `BL-050.3` (Performance-/Qualitätsmetriken) die zutreffenden Story-IDs für diese vier Fixes sind, oder ob eine passendere existierende Story in `docs/canonical/BACKLOG.md` dafür vorgesehen ist. Falls keine Story die Erkennungspräzision (Über-/Unter-Redaktion im Zertifikats-/Kundenkontext) auf Implementierungsebene abdeckt: Lege dafür **keine neue P0/P1-Story mit Fach-Anspruch** an, sondern vermerke die vier Fixes als abgeschlossene E0-Regressionsarbeit an der bestehenden, zutreffendsten Story — ohne deren Status auf mehr als E0 zu heben.
3. Aktualisiere `docs/canonical/CURRENT_STATE.md` und `docs/canonical/TRACEABILITY.md` nur an den Stellen, die diese vier Commits konkret betreffen. Keine Neustrukturierung, keine unrelated Aufräumarbeit.
4. Prüfe `docs/canonical/BACKLOG_EVIDENCE_MATRIX.md`: Ändert sich für eine der betroffenen Stories die erforderliche Evidenzstufe oder deren Beschreibung durch diese Fixes? Falls nein, ausdrücklich „keine Änderung nötig, Begründung: …“ vermerken statt die Datei unangetastet zu lassen, damit nachvollziehbar bleibt, dass sie geprüft wurde.
5. Keine doppelte Backlogführung. Kein Verschieben bereits geschlossener Punkte ohne neuen Beleg.

## 5. Verifikation

```bash
npm run test:ci
node tests/test-credential-catalog.js
node tests/test-batch-performance-contract.js
node tests/test-pii-regression.js
node tests/test-detector-benchmark.js
npm run build:plugin
npm run test:plugin-zip
claude plugin validate plugins/data-secure
git diff --check
```

Ergänze bei Bedarf eigene, temporäre Reproduktionsfälle für die in Teil A geprüften Hypothesen, aber ändere in diesem Auftrag keine Produktivlogik in `privacy/credentials.js`, `privacy/base.js` oder `gateway/batch.js`. Findest du dabei einen echten, reproduzierbaren neuen Fehler: dokumentiere ihn als Finding und schlage einen eigenen, engen Folgeauftrag vor — implementiere den Fix nicht selbst in diesem Auftrag.

## 6. Nicht Teil dieses Auftrags

- Der `claude plugin eval`-Early-Access-Blocker (menschliche/organisatorische Aufgabe).
- Der Marketplace-Rollout-Weg (bewusst nicht gewählt; ZIP-Weg bleibt verbindlich).
- Neue PII-Detektoren, neue Formate oder Architektur-Änderungen.
- Versionsanhebung über `3.2.0-rc41` hinaus — außer du findest in Teil A einen eigenen neuen, reproduzierbaren Fehler und behebst ihn in einem gesondert benannten Folgeauftrag; dann gilt Abschnitt 9 der `CLAUDE-CODE-AUFTRAG-RC37-CLI-EVAL.md`-Konvention (nächste freie RC-Nummer, Versionssynchronisation, ZIP-Neubau).
- Implementierung von Fixes für in Teil A gefundene Probleme.
- Alle unter Abschnitt 8 des ursprünglichen RC37-Auftrags genannten menschlichen E1-/E2-/E3-Nachweise (echte Cowork-UI, Berechtigungsdialoge, Installations-/Marketplace-Nachweise usw.).
- Push nach `origin/main` ohne gesonderte ausdrückliche Freigabe in der ausführenden Sitzung.

## 7. Abnahmekriterien

1. Alle vier Commits sind einzeln nach dem Muster in Abschnitt 3 gegenreviewt; jedes Finding nennt Datei, Funktion und eine konkrete Reproduktion mit Ist-/Soll-Verhalten.
2. Kein Finding wird als `P0` eingestuft, das tatsächlich nur ein Stilhinweis ohne messbare Auswirkung ist, und umgekehrt wird keine reale neue Unter-Redaktion niedriger als `P0` eingestuft.
3. `tasks/RC37-CLI-EVAL-BERICHT.md` deckt nach der Aktualisierung alle vier Commits vollständig ab.
4. Jede Änderung an `docs/canonical/BACKLOG.md`, `CURRENT_STATE.md`, `TRACEABILITY.md` oder `BACKLOG_EVIDENCE_MATRIX.md` ist durch einen in diesem Auftrag tatsächlich ausgeführten, benannten Beleg gedeckt.
5. Alle Befehle aus Abschnitt 5 sind ausgeführt und ihre Exitcodes sind im Abschlussbericht genannt.
6. Kein Commit und kein Push ohne gesonderte ausdrückliche Freigabe.

## 8. Git-Regeln

Arbeite auf dem vorgefundenen Stand (`4e9caf9`) und bewahre fremde Änderungen. Kein Reset, kein Force-Push, kein Überschreiben bestehender Arbeit. Erzeuge weder Commit noch Push, solange dies nicht im Auftrag der ausführenden Sitzung ausdrücklich freigegeben wurde. Bei Freigabe: wenige thematisch zusammenhängende Commits (Gegenreview-Ergebnis getrennt von reiner Backlog-/Berichtsaktualisierung), keine Kleinstcommits pro Finding.

## 9. Ergebnisformat

1. Findings zuerst, nach `P0` bis `P3` sortiert; bei keinen Findings ausdrücklich „keine Findings“ schreiben und verbleibende Restrisiken getrennt nennen.
2. Jedes Finding nennt Datei, Funktion/Zeile, konkrete Reproduktion, Ist-Verhalten, Soll-Verhalten und Fehlerrichtung (Über- oder Unter-Redaktion).
3. Danach der Teil-B-Abgleich: welche Dokumente wie geändert wurden und mit welchem konkreten Beleg, beziehungsweise warum keine Änderung nötig war.
4. Exakte Befehle mit Exitcodes aus Abschnitt 5.
5. Bei `P0`/`P1`-Findings: lege einen präzisen, engen Folgeauftrag ab (neue Datei unter `tasks/`) statt den Fix selbst umzusetzen, und benenne ihn im Abschlussbericht.
6. Git-Status sowie ggf. Commit-ID; Push nur bei ausdrücklicher Freigabe.
