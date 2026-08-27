# Arbeitsauftrag an Claude Code: unabhängiges Gesamtreview von RC63

**Status:** zeitlich begrenzter, unabhängiger Review- und Evidenzauftrag  
**Ausgangsstand:** `main` auf Commit `26ce0fb`, Produktversion `3.2.0-rc63`  
**Verbindliche Grundlage:** `tasks/README.md`, `docs/canonical/BACKLOG.md`,
`docs/canonical/DECISIONS.md`, `docs/canonical/CURRENT_STATE.md`,
`docs/canonical/TRACEABILITY.md` und `docs/canonical/BACKLOG_EVIDENCE_MATRIX.md`  
**Betroffene Stories:** insbesondere BL-011.9, BL-041.*, BL-044.1, BL-049.1,
BL-050.3 und BL-051.*; ordne Findings der tatsächlich passenden vorhandenen Story zu.

Dieser Auftrag ersetzt weder das kanonische Backlog noch das Entscheidungsregister.
Er ist ein Gegenreview des vorgefundenen Stands, kein pauschaler Umbauauftrag.

## 1. Ziel

Prüfe den vollständigen aktuellen DataSecure-Stand unabhängig aus den Perspektiven
Security/Privacy, Architektur, Entwicklung, Performance, Claude-Plugin/Skill,
Claude Cowork, UX und UAT. Nutze zusätzlich die lokal verfügbare Claude-Code-CLI,
um den ausgelieferten Plugin-Vertrag zu prüfen. Unterscheide dabei strikt zwischen:

- **E0:** statische Analyse, Unit-/Integrations-/CLI- und synthetische Tests;
- **E1/E2/E3:** echte Cowork-, Plattform-, Bedien-, Accessibility-, Security- und
  betriebliche Abnahme durch Menschen auf Zielsystemen.

Liefere Findings zuerst. Behebe in diesem Auftrag keine Produktfehler. Für jedes
reproduzierbare P0/P1-Finding erstelle stattdessen einen engen Folgeauftrag unter
`tasks/`. So bleibt das Gegenreview unabhängig und die Ursache wird nicht durch
einen ungeprüften Fix verdeckt.

## 2. Schwerpunkt der Änderungskette RC60 bis RC63

Reviewe mindestens die vollständige Kette und ihre Wechselwirkungen:

| Commit | Schwerpunkt |
|---|---|
| `0c7b8ba` | kanonischer Vertrag für drei Dokument-Ergebnisgrade |
| `556ae9a` | dauerhafte Bindung der Grade an Pakete, Journal und Mapping |
| `feb27a0` | Bindung der Grade an Evidence und Audit-Receipt |
| `d66aae5` | erneute Paketprüfung und Projektion in Progress, Abschluss, Results und Cowork-Handoff |
| `26ce0fb` | RC63-UAT-Anleitung, Sollmatrix und inhaltsfreie Evidenzvorlage |

Prüfe nicht nur Diffs. Verfolge den aktuellen Datenfluss von der lokalen Quelle bis
zur Cowork-Antwort und von Recovery/Legacy-Daten bis zur Ergebnisprojektion.

## 3. Unveränderliche Sicherheits- und Produktregeln

1. Originaldateien, Rohbytes, Quellpfade, Originaldateinamen, Dokument-Hashes,
   Aktionstoken, Paket-IDs, Capabilities, Cursor und erkannte Rohwerte dürfen nicht
   an Claude, einen Grader oder einen Cloud-Dienst gelangen.
2. Nutze ausschließlich synthetische Testdaten. Keine echten Personal-, Kunden-,
   Bewerber-, Patienten- oder Vertragsdaten.
3. Basisoriginale und externe Quellen werden niemals verändert oder gelöscht.
   Bereinigung betrifft ausschließlich ausdrücklich DataSecure-eigene Artefakte.
4. Das Produkt de-identifiziert beziehungsweise pseudonymisiert. Keine Behauptung
   rechtssicherer Anonymisierung oder einer DSGVO-/EU-AI-Act-Zertifizierung.
5. Unter-Redaktion ist schwerwiegender als Über-Redaktion. Ein Komfort- oder
   Performancefix darf keinen echten Identifikator durchlassen.
6. Rollen, Skills, Technologien, Methoden, Branchen und Zertifikate bleiben als
   fachlicher Inhalt erhalten, sofern sie nicht im konkreten Kontext identifizieren.
7. Im Pilot sind ausschließlich TXT, Markdown, CSV und DOCX freigegeben. XLSX,
   PPTX, PDF, Scan-PDF und eigenständige Rasterbilder bleiben fail-closed, bis ihre
   eigenen Coverage- und Sicherheitsgates erfüllt sind.
8. Pro Eingabe entsteht höchstens ein freigegebenes Markdown-Ergebnis. Der lokale
   Mapping-Export bleibt dauerhaft und gelangt nicht an Claude.
9. Höchstens ein aktiver Stapel, höchstens 100 Dateien und 500 MiB. Nach Abbruch
   wird fortgesetzt; bereits terminale Dateien werden nicht doppelt verarbeitet.
10. Genau zwei Skills bleiben sichtbar. Natürlicher Auftrag und direkte
    Skillauswahl führen in denselben Ablauf.
11. Der Cowork-Normalweg bleibt: eine kurze Startmeldung, ein lokaler
    Mehrfach-Dateidialog und danach lokale Verarbeitung. Keine unnötigen Polls,
    Profilfragen, Einzelbestätigungen oder Ergebnislesebestätigungen.
12. Bildpixel und nicht freigegebene visuelle Inhalte bleiben lokal.

## 4. Vorprüfung

1. Lies diesen Auftrag vollständig sowie `tasks/README.md` und alle unter
   „Verbindliche Grundlage“ genannten kanonischen Dokumente.
2. Prüfe Branch, Commit und `git status --short`. Bei fremden Änderungen nichts
   aufräumen, zurücksetzen oder überschreiben.
3. Prüfe Versionen und Laufzeiten mit `node --version`, `npm --version`,
   `claude --version`, `claude doctor`, `claude plugin validate --help` und
   `claude plugin eval --help`.
4. Prüfe, ob der tatsächliche Ausgangsstand noch `26ce0fb`/RC63 ist. Falls `main`
   neuer ist, dokumentiere die Abweichung und reviewe den vorgefundenen sauberen
   Stand; rate keine Versions- oder Hashwerte.
5. Keine globale Claude-/MCP-Konfiguration ändern. Kein Reset, Rebase, Force-Push,
   `--dangerously-skip-permissions` oder ungefragtes Installieren globaler Pakete.

## 5. Review A – Ergebnisgrade und Datenschutzgrenze

Prüfe adversarial:

- Die drei Grade sind exakt `complete`, `usable-with-omissions` und
  `not-processed`; laufende, beschädigte, Legacy- oder nicht beweisbare Zustände
  bleiben `unavailable` und werden nie hochgestuft.
- `usable-with-omissions` ist ausschließlich bei explizit entfernten oder lokal
  zurückgehaltenen visuellen Assets erlaubt. Parserunsicherheit, unentschiedene
  Visuals, defekte Container oder widersprüchliche Zähler müssen fail-closed sein.
- Ein positiver Grad wird unmittelbar vor Progress, Abschluss, Results und
  Cowork-Handoff erneut gegen das gebundene Paket verifiziert.
- Manipulierte Manifeste, Evidence, Receipts, Zähler, Statuswerte oder Capabilities
  können keinen positiven Grad, kein Teilresultat und keine fremde Seite erzeugen.
- Acknowledgements und Wiederholungen erzeugen weder einen zweiten Abschlussdialog
  noch eine zweite Veröffentlichung.
- Paging ist stapelgebunden, stabil, begrenzt und gibt die Stapelzusammenfassung
  nur einmal aus. Cursor und interne Kennungen erscheinen nicht in Modelltexten.
- Diagnose-, Journal-, Mapping- und Auditdaten enthalten keine Inhalte, Pfade,
  Dateinamen, Einzeldateihashes oder erkannten Rohwerte.

Suche gezielt nach Type-Coercion, fehlenden Bounds, Legacy-Fallbacks, Race
Conditions, TOCTOU, manipulierbaren Zählern und inkonsistenten Fehlerpfaden.

## 6. Review B – Stapel, Recovery und Performance

Prüfe mindestens:

- gemischte TXT-/Markdown-/CSV-/DOCX-Stapel;
- sichere Einzelstopps gesperrter oder beschädigter Formate, während der Reststapel
  weiterläuft;
- Abbruch/Crash vor und nach Snapshot, Verarbeitung, Veröffentlichung, Mapping,
  Review und Evidence;
- Fortsetzung an Position 1, in der Mitte und am Ende ohne Doppelfreigabe;
- zwei zurückgestellte Reviewfälle bei bereits fertigen Dateien;
- Single-Flight und genau einen aktiven Stapel;
- Grenzfälle 0, 1, 100 und 101 Dateien sowie knapp unter/über 500 MiB;
- deterministische Zuordnung und Ergebnisreihenfolge trotz sicherer Parallelität;
- Ressourcenlimits, Backpressure, Timeout und kontrolliertes Ende einer nicht
  reagierenden lokalen Prüfoberfläche;
- unnötige Serialisierung, wiederholte Paketprüfung, überflüssige `fsync`s,
  wiederholtes Parsen oder N+1-Ergebnislesen.

Performanceoptimierungen dürfen niemals Datenschutz-, Durability-,
Originalschutz- oder Determinismusregeln abschwächen.

## 7. Review C – Plugin, Skills, Cowork und UX

Prüfe Quellstruktur und tatsächlich gebaute ZIP getrennt:

- genau zwei sichtbare Skills, deutsche Namen/Beschreibungen und eindeutige
  Trigger ohne funktionale Dopplung;
- ein natürlicher Auftrag wie `Dateien anonymisieren.` startet den vorgesehenen
  lokalen Ablauf;
- ein Chat-Upload wird nicht als sichere lokale Quelle behandelt;
- `local_only` beendet lokal ohne Ergebnislese-Prompts;
- nur eine ausdrücklich gewünschte Folgeauswertung aktiviert den begrenzten,
  gebündelten Cowork-Handoff;
- Tool-Anzahl, Tool-Namen, Annotationen und Berechtigungen sind minimal und
  wahrheitsgemäß;
- Antworten enthalten keine technischen Tokens oder verwirrende interne Details;
- Fortsetzungsfragen sind eindeutig. Eine Antwort `ja` auf eine binäre Frage darf
  nicht unnötig nochmals nach „fortsetzen oder verwerfen“ fragen;
- Fehler, verschlüsselte Dateien und gesperrte Formate erhalten kurze,
  handlungsorientierte, deutsche Meldungen;
- keine alte Picker-, Ordner-, Polling- oder Einzeldateilogik kann den normalen
  Cowork-Schnellpfad versehentlich übernehmen.

Vergleiche die Implementierung mit der aktuell installierten Claude-CLI-Hilfe und,
soweit lokal verfügbar, mit der aktuellen offiziellen Claude-Plugin-/Skill-Doku.
Keine inoffiziellen Blogposts als normative Quelle verwenden.

## 8. Review D – UAT-Paket

Prüfe vollständig:

- `docs/acceptance/RC63_UAT_TEST_KIT/README.md`
- `docs/acceptance/RC63_UAT_TEST_KIT/STEP-BY-STEP.md`
- `docs/acceptance/RC63_UAT_TEST_KIT/EXPECTED_RESULTS.csv`
- `docs/acceptance/RC63_UAT_TEST_KIT/EVIDENCE_LOG.csv`
- `docs/acceptance/RC30_HUMAN_TEST_KIT/tools/generate_synthetic_acceptance_data.py`

Führe den Generator in einem ausdrücklich angelegten temporären Verzeichnis aus
oder verwende die eingecheckten synthetischen Textfixtures. Erwartet werden
insgesamt 111 Eingänge: 4 positive Formate, 2 Reviewfälle, 5 sichere Negativfälle
und 100 kleine Batchdateien. Binäre Office-/PDF-Testdateien sind Build-/UAT-
Artefakte und müssen nicht in Git aufgenommen werden.

Prüfe:

- alle Inhalte sind eindeutig synthetisch;
- Sollwerte stimmen mit RC63 und den kanonischen Dokumenten überein;
- positive Fälle prüfen Entfernung direkter Identifikatoren und Erhalt von Rolle,
  Technologien, HL7 FHIR, ISTQB und Scrum.org;
- Reviewfälle erfordern eine lokale, nicht geratene Entscheidung;
- XLSX/PPTX/PDF/PNG und beschädigtes DOCX stoppen im aktuellen Pilot sicher;
- Anleitung verlangt niemals einen Original-Upload in den Chat;
- Evidenzvorlage sammelt keine Inhalte, Pfade, Dateinamen, Dokument-Hashes,
  Paket-IDs, Tokens, Capabilities oder Cursor;
- UAT-01 bis UAT-06 sind ohne widersprüchliche oder unmögliche Erwartungen
  ausführbar;
- Quelloriginale bleiben bytegleich und werden nie durch `purge_local_data`
  gelöscht.

Die echte Durchführung in Claude Cowork ist menschliche E1/E2-Evidenz. Simuliere
keinen bestandenen UI-Test.

## 9. Lokale Tests und Build

Führe mindestens aus und dokumentiere Befehl, Dauer und Exitcode:

```text
npm run test:ci
npm run test:source-preflight
npm run test:result-grades
node tests/test-batch-session.js
node tests/test-mixed-batch-recovery.js
node tests/test-batch-performance-contract.js
node tests/test-local-only-handoff.js
node tests/test-batch-results.js
node tests/test-completion-summary.js
node tests/test-package-read-capabilities.js
node tests/test-mcp-protocol.js
npm run build:plugin
npm run test:plugin-zip
claude plugin validate plugins/data-secure
git diff --check
```

Wenn die vollständige Suite auf der vorhandenen Maschine möglich ist, führe
zusätzlich `npm test` aus. Starte keine GitHub Actions; alle Prüfungen bleiben
lokal und kostenbewusst.

Erwartetes Plugin-Artefakt des Ausgangsstands:

- `dist/DataSecure-Privacy-Preflight-v3.2.0-rc63.zip`
- zuletzt lokal gemessener SHA-256:
  `4ACA812AFA50FFC2421C668EB8248BC17AB3A40C67A77DF3DFBEB6950DEBF886`

Baue frisch und prüfe, ob der Build reproduzierbar denselben Hash liefert. Eine
Abweichung ist zunächst ein Finding beziehungsweise zu erklärende Buildabweichung,
kein Anlass, den erwarteten Wert still zu ersetzen.

## 10. Claude-Code-CLI-Prüfung

1. Beginne mit `claude plugin validate` für den Quellordner.
2. Prüfe die tatsächlich gebaute ZIP zusätzlich mit der von der installierten CLI
   dokumentierten `--plugin-dir`- oder Installationssyntax.
3. Wenn `claude plugin eval` für die Organisation verfügbar ist, verwende zunächst
   einen kleinen Smoke-Lauf, anschließend eine kostenbegrenzte With/Without-
   Ablation für Skilltrigger, Upload-Ablehnung, Datenschutzbeschreibung,
   `local_only` und Folgeauswertung.
4. Wenn `plugin eval` weiterhin durch Anthropic Early Access blockiert ist,
   dokumentiere genau den Blocker. Er ist kein Produktfehler. Nutze dann höchstens
   vier begrenzte `claude -p --plugin-dir`-Smokes mit rein synthetischen Prompts.
5. Öffne beziehungsweise bestätige in automatischen CLI-Läufen keinen echten
   Dateidialog und übergib keine lokalen Originale oder Pfade an das Modell.
6. Kein `--dangerously-skip-permissions`, kein Publish, kein `ultrareview` und keine
   persistente globale Konfigurationsänderung.

Kostenlimit für alle optional kostenpflichtigen Claude-CLI-Prüfungen zusammen:
**höchstens 3,00 USD**. Bei Erreichen sofort stoppen. Ein fehlgeschlagener Fall darf
nach Ursachenklärung höchstens einmal wiederholt werden.

## 11. Finding-Regeln

Jedes Finding enthält:

- Priorität P0 bis P3;
- betroffene Story und Entscheidung;
- Datei, Funktion und möglichst enge Zeile;
- reproduzierbaren Befehl beziehungsweise synthetisches Fixture;
- Ist- und Sollverhalten;
- Datenschutz-, Sicherheits-, Performance- oder UX-Auswirkung;
- vermutete Ursache, klar als Analyse gekennzeichnet;
- fehlenden oder vorgeschlagenen Regressionstest.

Priorisierung:

- **P0:** Rohdatenabfluss, Unter-Redaktion, Originalverlust/-mutation, fremder
  Stapelzugriff, unzulässige positive Freigabe oder Sicherheitsgrenze umgehbar.
- **P1:** reproduzierbarer Durability-/Recoveryfehler, blockierender Normalweg,
  falscher Ergebnisgrad, wiederholte Veröffentlichung oder erheblicher
  Berechtigungs-/Performancefehler.
- **P2:** begrenzter Funktions-/UX-/Performancefehler ohne unmittelbaren
  Datenschutzbruch.
- **P3:** Wartbarkeit, Klarheit oder Dokumentationsabweichung ohne falsches
  Produktverhalten.

Bei P0/P1: Lege einen separaten engen Folgeauftrag unter `tasks/` an. Implementiere
den Fix nicht in diesem Review. Bei keinen Findings schreibe ausdrücklich
`Keine Findings` und nenne verbleibende Restrisiken getrennt.

## 12. Ergebnisdatei

Lege den bereinigten Bericht an als:

`tasks/RC63-CLAUDE-CODE-GESAMTREVIEW-BERICHT.md`

Reihenfolge:

1. Ergebnis und erreichte Evidenzstufe.
2. Findings P0 bis P3.
3. Review der fünf Schwerpunktcommits.
4. Security-/Privacy- und Originalschutzprüfung.
5. Architektur-, Recovery- und Performanceprüfung.
6. Plugin-/Skill-/Cowork-/UX-Prüfung.
7. UAT-Kit-Prüfung.
8. Exakte Tests, Dauern und Exitcodes.
9. Claude-CLI-Version, Befehle, Resultate und Kosten.
10. Plugin-ZIP-Pfad, Größe und SHA-256.
11. Menschlich verbleibende E1/E2/E3-Prüfungen einzeln.
12. Git-Status und gegebenenfalls angelegte Folgeaufträge.

Rohlogs, temporäre CLI-Sitzungen und generierte Binärfixtures bleiben in einem
ignorierten lokalen Verzeichnis. In Git gehören nur der bereinigte Bericht und
gegebenenfalls enge Folgeaufträge.

## 13. Abnahmekriterien

Der Auftrag ist abgeschlossen, wenn:

1. alle fünf Schwerpunktcommits und der aktuelle End-to-End-Datenfluss geprüft sind;
2. Quellplugin und frisch gebaute ZIP getrennt validiert wurden;
3. alle Pflichtbefehle mit Exitcodes dokumentiert sind;
4. UAT-Sollwerte gegen den tatsächlichen RC63-Vertrag geprüft wurden;
5. keine Rohdaten, Pfade, Tokens oder internen Kennungen in Bericht oder Git-Diff
   enthalten sind;
6. jedes Finding reproduzierbar und einer Story zugeordnet ist;
7. P0/P1 nur als separater Folgeauftrag festgehalten, nicht im Review vermischt
   behoben wurden;
8. menschliche Cowork-/Plattform-/Accessibility-/Marketplace-Nachweise nicht als
   durch CLI-Tests ersetzt dargestellt werden;
9. keine kostenpflichtige GitHub Action ausgelöst und das CLI-Kostenlimit
   eingehalten wurde;
10. `git diff --check` sauber ist.

## 14. Git-Regeln

Kein Reset, kein Force-Push, kein Überschreiben fremder Arbeit und keine
kostenpflichtige GitHub Action. Erzeuge weder Commit noch Push, solange dies in der
ausführenden Sitzung nicht ausdrücklich freigegeben wurde. Bei Freigabe: Bericht
und eventuelle Folgeaufträge in höchstens einem thematischen Commit; keine
Produktfixes in denselben Commit aufnehmen.
