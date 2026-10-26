# RC177: vollständiges Code- und Fachreview

Stand: 26.10.2026 · beauftragt, in Durchführung. Dieses Review ändert den
veröffentlichten RC177-Tag oder seine Pakete nicht. Referenz für alle
Produktfeststellungen ist der tatsächlich ausgelieferte Appcommit
`fc39f820bd6e3c9528ffad911eada5aee20c56cb`, Produktfingerprint
`1df160c305aa7b2740e6261075ce7fa5a09ade3f3ee75f48debe65db3c82b5a4`.
Der spätere Branch-Commit `e95f033f637b57d164d7f49b4a74547224153c45`
enthält nur Abschlussdokumentation. Die menschlichen Windows- und Mac-Desktoptests
bleiben Nutzeraufgabe. Es ist keine neue Veröffentlichung beauftragt.

## Ziel und Urteilsgrenze

Jede **eigene oder lokal modifizierte** produktive Funktion, Methode, Klasse,
Closure, Callback, native Routine und jeder Fehlerbehandlungsblock erhält einen
nachvollziehbaren Reviewstatus. Zu jeder Ebene wird geprüft, ob der Code die
geltenden fachlichen Verträge tatsächlich umsetzt, sicher scheitert oder eine
Teilkonvertierung zutreffend ausweist, und ob Tests dieses Verhalten unabhängig
belegen. Auch Tests, Buildskripte und Workflows werden auf Integrität geprüft.
Unveränderter Drittanbietercode und generierte Dateien erhalten eine separate
Provenienz-, Versions-, Lizenz-, Integrations- und Schnittstellenprüfung; jede
lokale Abweichung davon fällt wieder unter das vollständige Einzelreview.

Die drei Urteilsklassen bleiben getrennt: Quellcodebefund, automatischer
Gegenbeleg und tatsächliche Zielhost-/Anwenderbeobachtung. Keine davon ersetzt
die andere. Eine vollständige Checkliste bedeutet keine Garantie für beliebige
Dokumente, Datenschutzrechtskonformität oder Fehlerfreiheit.

## Normative Grundlage zuerst revalidieren

1. `docs/canonical/README.md` und `DOCUMENT_REGISTER.md` bestimmen je Frage
   führende Dokumente; `DECISIONS.md`, `CURRENT_STATE.md`, `BACKLOG.md`,
   `STANDALONE_ARCHITECTURE.md`, `STANDALONE_SECURITY_MODEL.md`, aktive
   `contracts/*`, `docs/FORMAT_COVERAGE_MATRIX.md` und `docs/TESTING.md` werden
   auf Widerspruch zum veröffentlichten RC177-Code abgeglichen.
2. `CLAUDE.md` ist Projektregelquelle, aber historische Versions- und
   Produktbehauptungen darin sind gegen den aktuellen Kanon und tatsächliche
   Quellen zu prüfen. Explizite Nutzeranweisungen dieses Auftrags gehen vor.
3. Für JS/Node, Tauri/Rust, C/C++, Office/PDF/OCR, Windows und macOS werden
   die zu den gepinnten Versionen gehörenden offiziellen API- und
   Plattformquellen herangezogen. Eine allgemeine Stilregel ist kein
   Beweis gegen einen fachlichen oder Sicherheitsvertrag. Wo im Repo keine
   formale Formatter-/Linterkonfiguration existiert, wird vor der Bewertung
   ein explizites, projektbezogenes Reviewraster dokumentiert.

## Arbeitspakete und vollständige Abdeckung

| Paket | Prüfobjekt und kritische Fragen | Abschlussbeleg |
| --- | --- | --- |
| R0 Quellfreeze | Git-Tag, Appcommit, Produktfingerprint, Dateiliste, Blobhashes, Plattform-/Modusrollen; historische und generierte Quellen trennen. | Unveränderliches Quellmanifest, Scope- und Ausschlussliste. |
| R1 Symbolinventar | Alle eigenen JS-/Rust-/C-/C++-Symbole einschließlich verschachtelter Funktionen, Pfeilfunktionen, Methoden, Konstruktoren, Callback-/Eventhandler; alle `try/catch/finally`, Promise-Rejections, Rust-`Result`/`?`, Fehler-Codes und Cleanup-Pfade. Dynamische Imports/Exports und HTML-Handler manuell ergänzen. | Maschinelles Inventar plus manuell geschlossene Parserlücken; jedes Symbol genau einmal mit Owner/Status. |
| R2 Vertrags- und Datenfluss | Start, Intake, Quellsnapshot, Formatprüfung, Worker/Renderer, OCR, Markdown, Anonymisierung, Prüfung, Zuordnung, Ergebnisveröffentlichung, Nachbearbeitung, Verlauf, Recovery und Diagnose über UI → Rust → IPC → Sidecar → Core → Dateien. Cowork-Adapter des geteilten Cores gesondert. | Sequenz-/Trust-Boundary-Matrix je Produktmodus und Format; jeder Übergang mit Produzent, Konsument und Gegenfall. |
| R3 Einzelreview | Für jede Funktion/Methode/Klasse/Fehlerbehandlung das unten stehende Raster; auch nicht aufgerufene, redundante, implizite oder doppelt verantwortete Pfade. | Abdeckungsregister mit Datei/Zeile/Symbol, Reviewer, Datum, Urteil, Beleg und Finding-ID. |
| R4 Fachvergleich | Synthetische und lokal bewahrte schwierige Originale: DOCX/XLSX/PPTX/PDF/Bild/TXT/CSV; Nur-Markdown und Anonymisierung; Inhalt, Reihenfolge, Tabellen, Diagramme, Formeln, OCR, Auslassungen, Pseudonyme, Mapping und Nachbearbeitung. | Original↔MD-Vergleich mit konkreten Text-/Strukturbelegen, ohne echte Quellen hochzuladen. |
| R5 Sicherheits- und Plattformreview | Offline-/Netzwerkgrenze, private/öffentliche Daten, Pfad- und Objektbindung, ACL/Guard, Atomizität, symlink/rename/race, Neustart, Generation/ACK, Prozess-/Worker-Lebensdauer, Ressourcenlimits und Mac-Ad-hoc-Grenzen. | Angreifer-/Fehlerfallmatrix; Windows-/ARM-/Intel-Belege und ehrliche Zielhostlücken. |
| R6 Test- und Buildintegrität | Testoracle gegen Implementierung, fehlende negative Fälle, Fixture-Tracking, Testpfadtrennung, Mock-vs-Native, CI, Dependency-/Lizenz-/Lockfiles, Paketmanifest, SBOM, Quellfingerprint und Releasebelege. | Test↔Symbol↔Anforderung-Matrix; reproduzierbare Build-/CI-Bindungen. |
| R7 unabhängige Gegensichten | Fachsicht Dokumentinhalt/OCR; Datenschutz/Sicherheit; native Windows/Mac-Lebensdauer. Jeweils echter Code und offizielle API-Quellen, keine gegenseitige Beeinflussung. | Befunde mit Gegenargumenten, finaler Main-Entscheid und verbleibender Unsicherheit. |
| R8 Befundkorrektur | P0/P1 zuerst, P2 nach Wirkung; jeweils enger reproduzierbarer Gegenfall, Einzeländerung, passende Regression und unveränderte übrige Schutzverträge. | Neue Commit-/Testbelege; alte rote und grüne Nachweise bleiben historisch. |
| R9 Abschluss | Inventar ohne unklassifizierte eigene Symbole, offene Befunde und Grenzen sichtbar; Nutzer-UAT separat. | Abschlussbericht mit Abdeckungszahlen, Findings, nicht ausführbaren Gates und nächstem Produktentscheid. |

## Raster für jedes einzelne Symbol

Für jedes Reviewobjekt werden mindestens diese Fragen beantwortet:

- **Funktion und Vertrag:** Warum existiert es, wer ruft es auf, welcher Zweck,
  welche Vor-/Nachbedingungen, welche Seiteneffekte und persistierten Werte?
- **Jeder Parameter:** Typ/Form, `null`/fehlend/default, Herkunft/Vertrauen,
  Maßeinheit, Wertebereich, Größen-/Zeitgrenze, Normalisierung, Mutation,
  Eigentümer, Formatversion und Übergabe über Prozess-/Sprachgrenzen.
- **Rückgabe und Zustand:** Typ/Fehlerkanal, Erfolgsvoraussetzung,
  deterministische Wiederholung, Idempotenz, Race-/Reentrancyverhalten,
  Generation/Lease, atomare Veröffentlichung und Aufräumen.
- **Jeder `try/catch/finally` und äquivalente Fehlerpfad:** exakte gefangene
  Fehlerklassen; unverfälschte Ursache; keine stillen Erfolge; keine
  vertraulichen Inhalte/Dateipfade im Log; Cleanup auch bei Timeout,
  Abbruch, Kill und Doppel-Fehler; sichere Teilresultate mit ehrlicher
  Auslassung oder notwendiger hart begrenzter Stopp.
- **Fachwirkung und Tests:** Originaltreue, Text-/Layout-/OCRunsicherheit,
  Anonymitätsgrenze, positive/negative und adversariale Testfälle; Tests
  müssen das Soll unabhängig herleiten und dürfen fehlerhaftes Ist nicht
  bloß spiegeln. Test- und Mock-Grenzen werden gekennzeichnet.
- **Pflegequalität:** eindeutige Verantwortung, Komplexität, Duplikate,
  Dead Code, sprechende Namen, Kohäsion, Versions-/Kompatibilitätsannahmen,
  Dokumentation und beobachtete Laufzeit/Kosten. Refactoring nur bei
  belegtem Nutzen und mit gleichwertigen Schutz- und Fachorakeln.

Status pro Symbol: `PENDING`, `REVIEWED_OK`, `FINDING`, `NEEDS_EVIDENCE` oder
`NOT_APPLICABLE` mit Begründung. Ein Parserfehler ist `PENDING`, kein PASS.
Jedes Finding enthält Datei/Zeile, Ist/Soll, auslösende Eingabe/Zustand,
Auswirkung, Priorität P0–P3, Vertrags-/Backlogbezug, Reproduktion, Test,
Gegenreview und Entscheidung. Nochmaliges Durchlesen ohne neuen Beleg
ändert den Status nicht.

## Prüfregeln und Reihenfolge

Zuerst R0–R2 und ein vollständiges maschinelles Inventar, dann R3 in
Risikoordnung: (1) private Daten, Zuordnungen, Freigabe/Export, native Guard-
und Dateigrenzen; (2) Konverter-/OCR-/Formatparser und Teilresultate;
(3) Worker-/IPC-/Recovery-/UI-Lebensdauer; (4) übrige Produkt- und
Integrationsquellen; (5) Tests, Skripte und CI. Nach jedem Bereich R4–R6
mit konkreten Gegenfällen. R7 prüft die wichtigsten Risiken unabhängig.
P0/P1 werden vor einem positiven Gesamturteil behoben oder ausdrücklich als
Releaseblocker ausgewiesen. P2/P3 bleiben mit begründeter Priorität sichtbar.

Vor neuen automatisierten Prüfungen laufende eigene Prozesse/CI prüfen.
Keine echten Nutzerdateien in Git, CI oder Release, keine Änderung alter
Evidenzen/Archive, keine automatische Desktopübernahme. Ein Fix an produktiven
Bytes schafft einen **neuen** Kandidaten und benötigt frische, gebundene
Windows- und beide Mac-Gates; RC177 selbst bleibt unverändert.

## Fortschrittsjournal

- 26.10.: Auftrag übernommen. RC177-Tag auf `fc39f820…` und Branchstand
  `e95f033f…` verifiziert; alte untracked Testordner unberührt. Kanon,
  Sicherheitsmodell, Testvertrag, Paket-/Rustkonfiguration und Quellbereiche
  zuerst gelesen. Die Funktion-für-Funktion-Prüfung steht noch aus; R0/R1
  beginnen mit einem versionierten Quellen- und Symbolinventar.
- 26.10., R0-Teilschritt: `git ls-tree` des Appcommits enthält
  1702 Dateien; 1336 als eigene, 109 als generierte und 257 als Vendor-/
  Drittanbieterpfade vorläufig klassifiziert. 361 eigene Produktcode-, 492 Testcode-, 113 Build-/Benchmark- und
  2 Repository-Code-Dateien. Alle untersuchten Arbeitsbaum-Codeblobs stimmen
  mit dem Tag überein. `FILE-INVENTORY.json` SHA-256
  `5c72f08770101cd09b912573bf25d98610b0c495c37ad00ca8123cf7857620f0`.
  Vendor-Provenienz und die vorläufige Pfadklassifikation müssen vor R0-PASS
  unabhängig vom Namen geprüft werden.
- 26.10., R1 begonnen: Gepinnter Node22.23.2-Acorn parste ersteigene JS-
  Codequellen ohne Fehler und registrierte 43716 AST-Einträge (Funktionen,
  Klassen, Closures, `try/catch`, `throw`; Tests eingeschlossen). `syn`2.0.119
  offline parste21 Rustdateien ohne Fehler und registrierte4350 Einträge,
  einschließlich `?`, `match` und Fehler-Methoden. Diese Mengen sind **keine**
  fachlich geprüften Funktionen. Makrokörper, C/C++, HTML/CSS, Python,
  PowerShell, dynamische Pfade und die manuelle Schließung bleiben offen.
  Belege: `dist/rc177-full-code-review-20261026`.
- Dokumentendrift eng korrigiert: `CLAUDE.md` beschrieb 20 sichtbare
  Verlaufsläufe, während `standalone-history-window.js:14` fünf begrenzt;
  die Standalone-Beschreibung erwähnte nur die erste lokale CSV, nicht die
  drei neueren vertraulichen Zuordnungsbeilagen. Die Projektregel nennt
  jetzt beide Rollen und das Fünferfenster. Keine Produktcodeursache oder
  Laufstörung daraus behauptet. Ein erster Dokumentvertragstest scheiterte
  an der geänderten Großschreibung von `reine Markdown-Konvertierung`;
  enger Textfix, danach unveränderter
  `test-current-documentation-contract.js` 30/30 PASS.
- 26.10., R3/R5-Befund 001: Die `closed`-Prüfung in
  `standalone/result-companions.js:19-20` akzeptierte einen einzigen
  kommahaltigen JSON-Schlüssel als zwei erlaubte vertrauliche Rollen. Ein
  synthetischer Gegenfall scheiterte vor der Korrektur reproduzierbar im
  bestehenden Testprozess (19 PASS, 1 FAIL); nach Vergleich der einzelnen
  Schlüsselnamen 20 PASS, 0 FAIL. Der nachgelagerte Gatewaycode und das
  Rust-DTO erwarten getrennte Rollen; ein Vertraulichkeitsbypass ist nicht
  belegt. P2 Schema-/Fehlerpfadkonsistenz, begrenzter Fix **nur lokal**,
  keine RC177-Paketänderung. Beleg und Wirkungsgrenze:
  `dist/rc177-full-code-review-20261026/FINDING-001.md`. Andere Stellen
  mit `Object.keys(...).sort().join(',')` bleiben einzeln zu triagieren;
  dies ist kein Gesamt-PASS für R3/R5/R8.
- Angrenzender echter Worker-Gatewaytest nach Fix: Exit 0 mit 66 Checks,
  325 Einträgen und 44 Wartevorgängen. Eine zunächst einzeilige Quellsuche
  identifizierte 104 Treffer in 51 Produktdateien. Der nachgeschobene
  parsergestützte Scan der **unveränderten RC177-Gitblobs** erfasste genauer
  121 Kandidaten in 64 eigenen Dateien, davon 101 Produktstellen; 921
  JS-Dateien wurden ohne Parsefehler gelesen. `KEYSET-AST-CANDIDATES.json`
  SHA-256 `bec5c1313ac1c1185b4c21f2ec0a342f8811674e9d36f71596771d7523777035`
  ist Triage, kein Befund/PASS je Stelle. Jeder mögliche Fehlerpfad benötigt
  gesonderte Eingabe-/Wirkungsprüfung. Von 43716
  JS-Inventareinträgen haben erst 13 eine begründete manuelle Entscheidung
  (`REVIEW-DECISIONS.json`); 43703 stehen weiterhin auf `PENDING`.
- R2-Teilfluss der vertraulichen Zuordnungen vom privaten Prepare über
  erneutes Read/Generation/IPC bis zum Rust-Inventar und Abschluss-ACK in
  `FLOW-CONFIDENTIAL-COMPANIONS.md` beschrieben. Dies schließt andere
  Ergebnis-/Legacyflüsse und Fehlerzustände ausdrücklich nicht ab.
- R0-Herkunft teilrevalidiert: 231 OCR-Runtime-`node_modules`-Pfade und 26
  historische Keyring-Testvendorpfade identifiziert. OCR-Bundle/Manifest und
  referenzierter erfolgreicher Workflow-Run stimmen; Keyring-MachO/Windows-
  Binärinventar (fünf Dateien) entspricht Bytezahl/SHA-256 des lokalen
  Manifests, Package-Lock hat 13/13 Integritätswerte. 105 historische
  Testkitdaten und vier Tauri-Schemas sind als vorläufig generiert benannt.
  Externe Tarball-Provenienz/Generatorherkunft und Lizenzvollständigkeit
  bleiben offen; `SCOPE-PROVENANCE.md` nennt die Grenzen.
- 26.10., R3/R5-Befund 002: `batch-evidence.js` akzeptierte bei ansonsten
  gültigem lokalen Nachweis einen einzigen Schlüssel
  `images_removed_by_request,visual_assets_withheld_locally` als beide
  Auslassungszähler. Synthetische Vorher-/Nachherprobe `true`/`false`;
  enger Fix und tatsächlicher Receipt-Gegenfall im unveränderten
  `test-batch-session.js` 72/72 PASS. P2 Integrität des Nachweisschemas,
  keine Verarbeitung-/Offenlegungswirkung belegt. `FINDING-002.md`.
- 26.10., R3-Fachbefund 003: `completion-summary.js` akzeptierte bei einem
  verifizierten DTO denselben zusammengefassten Auslassungs-Key und ließ
  danach den Auslassungshinweis in der lokalen Abschlussanzeige weg.
  Vorherprobe `accepted:true,hasOmission:false`; enger Einzelkeyvergleich,
  tatsächliche Abschlusssuite 19/19 PASS. Ein echter Nutzerlauf mit
  solcher korrupten Zusammenfassung ist nicht nachgewiesen. P2 wegen
  irreführender Anzeige; `FINDING-003.md`.
- 26.10., R3/R5-Befund 004: Der interne Cowork-Handoff akzeptierte einen
  einzelnen zusammengefassten Schlüssel als zwei `omission_counts`-Felder.
  Der tatsächliche Produzent leitet seine Zähler aus der validierten
  Projektion ab; ein betroffener Nutzerlauf ist nicht belegt. Der gezielte
  Gegenfall in `test-local-only-handoff.js` war vor Fix 34/35 rot und danach
  35/35 grün; angrenzend `test-local-handoff-resume.js` 20/20 und
  `test-local-handoff-reuse.js` 30/30 grün. P2 Schema-Verifikation;
  `FINDING-004.md`. Diese Tests ersetzen keine Plattform- oder Gesamtgates.
- R1/R3-Fehlerpfadinventar: Parsergestützt aus den originalen RC177-Gitblobs
  1168 produktive JavaScript-`catch`-Klauseln erfasst. 230 haben einen leeren
  Rumpf, 650 enthalten lokal weder `throw` noch eines der groben
  Beobachtungs-Schlüsselwörter, 219 enthalten ein `return` ohne lokales
  `throw`. Diese Heuristiken beweisen **weder** ein verschlucktes Problem
  noch einen gültigen Cleanup. `CATCH-AST-CANDIDATES.json` SHA-256
  `ff52dd10b583b1880c17f65bf33318857637afd3ac00e8da41036af8d75962cd`
  hält jeden Catch mit Owner/Zeile/Statement-Typ/Excerpt als `PENDING`.
  Erstes manuelles Gegenlesen in `result-export.js` fand mehrere bewusst
  nachrangige Cleanup-Catches; der vollständige Primär-/Sekundärfehlerpfad
  muss weiterhin je Aufrufer belegt werden.
- R3-Offenpunkt ohne bestätigten Befund: `batch-recovery.js:310-340`
  gibt bei unlesbarem privaten Journalroot für die rein lesenden
  Cleanup-Zähler null zurück. Ob dies in `genericStatus` eine fachlich
  irreführende Null oder ein vereinbarter unbekannter Zustand ist, benötigt
  noch eine Status-/UI-Vertragsprüfung. Keine Sicherheits-/Cleanup-Autorität
  wurde aus diesem ersten Quellenblick abgeleitet.
