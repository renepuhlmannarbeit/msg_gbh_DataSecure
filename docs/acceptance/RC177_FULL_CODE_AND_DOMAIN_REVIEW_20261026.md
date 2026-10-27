# RC177: vollständiges Code- und Fachreview

Stand: 26.10.2026 · beauftragt, in Durchführung. Dieses Review ändert den
veröffentlichten RC177-Tag oder seine Pakete nicht. Referenz für alle
Produktfeststellungen ist der tatsächlich ausgelieferte Appcommit
`fc39f820bd6e3c9528ffad911eada5aee20c56cb`, Produktfingerprint
`1df160c305aa7b2740e6261075ce7fa5a09ade3f3ee75f48debe65db3c82b5a4`.
Der spätere Branch-Commit `e95f033f637b57d164d7f49b4a74547224153c45`
enthält nur Abschlussdokumentation. Die menschlichen Windows- und Mac-Desktoptests
bleiben Nutzeraufgabe. Es ist keine neue Veröffentlichung beauftragt.

## Neubasierung 27.10.2026: veröffentlichtes RC177 und aktueller Quellstand

Der erneute Nutzerauftrag umfasst jetzt **zwei getrennte Prüfstände**: den
unveränderlichen, tatsächlich veröffentlichten RC177-Appcommit oben und den
aktuellen Standalone-/Cowork-Trennstand
`2ddffb40926439fa69e456409853103c4f176366` auf
`codex/standalone-export-usability`. Zwischen beiden liegen 106 geänderte
Dateien. Ein früheres Urteil bleibt nur für exakt dieselben geprüften
Quellbytes, denselben Vertrag und dieselbe Produktrolle gültig. Zeilennummern
allein sind keine dauerhafte Symbolidentität. Für aktuelle Urteile werden
Commit, Git-Blob, Symbol-/Blocktyp, qualifizierter Besitzer, AST-Position und
ein normalisierter Körperhash erfasst. Umbenennungen und Verschiebungen
erfordern eine explizite Zuordnung; geänderte Körper oder Verträge wechseln
zurück auf `PENDING`. Das alte Register und alle alten Befunde bleiben erhalten.

Die Durchführung erfolgt in begrenzten, abschließbaren Quellschnitten. Ein
maschinelles Register ist die **Arbeitsliste**, kein Review-PASS. Die
Abschlussquote zählt separat: eigene Produktfunktionen, Tests und Skripte,
Fehlerblöcke, native Symbole, dynamische/HTML-Handler und manuell geschlossene
Parserlücken. Jede manuelle Entscheidung enthält den geprüften Blob, jeden
Parameter samt Vertrauensherkunft und Grenzfall, Aufrufer, Seiteneffekte,
Fehler-/Cleanup-Pfade, Fachvertrag, Testorakel und gegebenenfalls Finding-ID.
Zusätzliche Reviewobjekte sind JavaScript-Top-Level-Code und Modulinitialisierung,
Rust-Makros und `Result`-Weitergabe, C-/C++-Ressourcenbesitz,
PowerShell-/Python-Buildhelfer, Tauri-Capabilities und Commands, CI-Workflows,
persistierte Schemas, generierte Codeherkunft und dynamische Modulauflösung.
Auch ein nicht erreichter oder vermeintlich toter Pfad wird begründet
klassifiziert; Duplikate werden nur mit belegtem Nutzen refaktoriert.

**Risikoreihenfolge und Gegenbelege:** Zuerst Produktgrenze Standalone↔Cowork,
private/öffentliche Daten, Identitäts- und Policybindung, Ergebnisveröffentlichung,
Guard/ACL und Fehlerbehandlung; danach OCR/Konverter samt ehrlicher
Teilverarbeitung, Worker/IPC/Abbruch/Neustart und UI; anschließend übrige
Quellen, Tests, Build und Abhängigkeiten. Pro Format und Plattform werden
positive, negative, beschädigte, große und zeitlich ungünstige Fälle sowie
Original↔Markdown-Inhalt, Auslassungen, Laufzeit und Peak-Speicher geprüft.
Ein Fehler wird nur dort abgefangen, wo ein begrenztes Teilresultat sicher
und fachlich ehrlich weiterverarbeitet werden kann. Sicherheits-,
Ressourcen- oder Bindungsfehler dürfen nicht durch eine allgemeine
`catch`-Fortsetzung in einen Erfolg umgedeutet werden.

**Codequalitätsziel des Nutzers:** Die App soll logisch geschichtet, robust,
wenig fehleranfällig und gut wartbar sein. Deshalb wird je Quellschnitt auch
die Abhängigkeitsrichtung (UI/Adapter → Anwendung → neutraler Fachkern),
Verantwortung pro Modul, Kopplung und Kohäsion, expliziter Zustand,
Nebenwirkungsgrenze, Datenbesitz, verständliche Namen, Komplexität,
Duplikate, tote Pfade und Versionierung der IPC-/Dateiverträge beurteilt.
Eine gefundene Auffälligkeit führt erst nach konkretem Wirkungsbeleg zu
Produktänderung: Ist/Soll, kleinste sichere Alternative, Rückwärtswirkung,
Gegenfall und Kostenmessung. Bloße Stilgleichförmigkeit und das Zählen
grüner Tests sind keine Optimierungsziele. Die Reviewreihenfolge wird durch
Risiko bestimmt; vollständig heißt dennoch, dass auch risikoarme eigene
Symbole einzeln einen dokumentierten Status bekommen. Objektorientierung
wird nach ihrer Wirkung beurteilt: Zustandsobjekte müssen Invarianten,
Besitz, Initialisierung und Lebensdauer kapseln; fachlich reine
Transformationen dürfen einfache Funktionen bleiben. Globale Mutation,
Scheinklassen, tiefe Vererbung und Klassen mit mehreren unabhängigen
Verantwortungen sind Prüfkandidaten, keine automatischen Befunde. Rust-Structs,
Traits und Eigentumsgrenzen sowie JavaScript-Closures/Module werden nach
denselben fachlichen Zustandsverträgen geprüft, ohne Sprachparadigmen
mechanisch anzugleichen.

Die [Node-Fehlerdokumentation](https://nodejs.org/api/errors.html) verlangt
eine zum API-Stil passende Fehlerweitergabe und unterscheidet stabile
Fehlercodes von veränderlichen Meldungstexten. Das
[Rust-Result-Modell](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html)
trennt behandelte von propagierten Fehlern. Die
[Tauri-Capability-Dokumentation](https://v2.tauri.app/security/capabilities/)
weist ausdrücklich darauf hin, dass Fenster-Capabilities zusammenwirken und
registrierte Rust-Commands ohne zusätzliche Einschränkung breit erreichbar
sein können. Diese offiziellen Quellen dienen als Prüffragen, nicht als
pauschale Behauptung eines konkreten Produktfehlers.

**Abschlussregel:** `R9` bleibt offen, solange ein eigener produktiver Eintrag,
ein Fehlerblock, ein Parserloch oder ein gebundener Plattformvertrag ungeprüft
ist. Automatische Tests belegen nur ihren konkreten Fall. Ein produktiver Fix
erzeugt einen neuen Prüfstand mit frischen passenden Gates; der veröffentlichte
RC177-Stand wird nicht umetikettiert. Native Desktopbedienung ist nach
aktuellem Nutzerwunsch nicht freigegeben und bleibt Nutzerabnahme.

### Aktueller Arbeitsschnitt 27.10.2026 (unveröffentlicht)

Das neue Register unter `dist/rc177-current-code-review-v2-20261027`
klassifiziert 1719 Gitdateien und indexiert 43821 JavaScript-AST-Objekte sowie
4350 Rust-AST-Objekte aus 21 Dateien, jeweils ohne Parsefehler. Es erfasst
13246 produktive JavaScript-Prüfobjekte, daneben 28227 in Tests. Die
gezählten Symbole haben **keinen** automatischen Reviewstatus. Native
C/C++-Makros, HTML-Handler, PowerShell/Python, Workflows, dynamische
Aufrufpfade und die einzelnen Parameter-/Fehlerurteile bleiben R1–R3.
Das begrenzte aktuelle Urteil steht in `CURRENT-SLICE-DECISIONS.md`; die
26 älteren manuellen Urteile beziehen sich auf seit RC177 geänderte Dateien
und wurden nicht pauschal übernommen.

Zwei eng belegte Produktbefunde sind lokal korrigiert, noch ohne neues Paket:
Ein paketierter Standalone-Policybeleg akzeptierte zuvor einen frei ersetzten
Aggregatfingerprint trotz richtiger Einzeldateihashes (Finding 010); die
Prüfung berechnet den Aggregathash nun aus denselben gerade gelesenen Bytes.
Ein Office-OCR-Teilcheckpoint nummerierte Grafiken wieder ab eins und konnte
damit Kontakt-/Bild-Locator falsch binden (Finding 011); er übernimmt jetzt
die bereits vergebene laufweite Ordnungszahl. Beide Gegenfälle waren vor dem
Fix rot und danach grün; angrenzende gezielte Suites bestanden. Ein dritter
P2-Befund im optionalen POSIX-OCR-Pilot: Linux erwartete sieben Limits,
obwohl das native Contract-JSON auf Linux und macOS fünf ausweist. Die
Workflow-Assertion prüft jetzt exakt diese fünf Namen. Details stehen in den
create-only Finding-010/011/012-Belegen im aktuellen `dist`-Ordner.

Der erste vollständige Headlesslauf nach den beiden Produktkorrekturen war
**rot**: vier Paket-Staging-Fälle in
`test-content-anonymization-operation.js` meldeten
`PACKAGE_STAGING_CREATE_FAILED`. Die Ursprungsursache ist nicht belegt.
Die Datei bestand danach isoliert zweimal, auch mit eng begrenzter
Diagnoseaufladung, und im zweiten **unveränderten** Gesamtlauf 37/37.
Dieser zweite Gesamtlauf bestand 328/328 Testdateien, Exit0; Originallog
`dist/rc177-current-code-review-v2-20261027/headless-postfix-repeat-20261027.log`,
SHA-256 `8d315aa6585909ed23101f3bdb874a886769608d151734e175bfadb576ed3d30`.
Das erste rote Log bleibt erhalten und wird nicht als erledigte Ursache
umgedeutet. `cargo test --locked` bestand 300 Tests mit drei ignorierten
Fällen, Clippy mit `-D warnings` bestand; `npm run test:docs` und
`git diff --check` bestanden. Die Rust-Quellen haben vorbestehende breite
`cargo fmt --check`-Abweichungen in 20 Dateien (29185 Diffzeilen). Eine
pauschale Formatierung in diesem sicherheitsrelevanten Fixschnitt würde
die Reviewbindung erschweren und wurde nicht ausgeführt.

Die separate unveränderte `test:standalone:conversion`-Kette bestand
anschließend, Exit0 und `inputs_unchanged:true` in ihrem PDF-Gate;
Originallog `dist/rc177-current-code-review-v2-20261027/conversion-suite-postfix.log`,
SHA-256 `a51801336b0a2dc2963ff3227d6aa6e9501204f79946ae8a9480c351837f76ac`.
Die enthaltene 100-TXT-Probe maß 27269 ms und null wiederholte schwere
Runtime-Lesevorgänge. Der zuvor vermutete Resolver-Mehraufwand rechtfertigt
deshalb ohne weitere vergleichbare Lastmessung keinen Cache-Refactor.
Die drei Korrekturthemen sind getrennt lokal committed: `7e006ff5`
(Policybeleg), `2da6179a` (Office-OCR) und `38605c95` (Pilot-Workflow).
Sie wurden weder auf `main` übertragen noch als neuer Kandidat veröffentlicht.
Der zusätzliche statische Modulgraph (`ARCHITECTURE-GRAPH-REVIEW.md`) fand
zwei verzögerte Kopplungsbereiche, aber keinen Zyklus unter 1068
Initialisierungsbezügen. Die 23 Gatewaymodule im größeren Bereich und die
große Dokumentprüfungs-Factory sind Wartbarkeits-Prüfspuren; daraus folgt
ohne Vertrags-/Zustandsreview noch kein sicherer Refactor.

Auch nach diesen Gates bleiben R0–R9 als Gesamtauftrag offen: Das Inventar
ist erst Arbeitsliste, nicht Einzelmethodenreview; der erste Stagingfehler
ist nicht kausal erklärt; native Paket-/Windows-/Mac-Zielhostgates und
Original↔Markdown-Fachvergleiche am neuen Branchstand sind nicht abgeschlossen.
Der veröffentlichte RC177-Tag und seine Downloads bleiben unverändert.

**Nutzerpriorität 26.10.:** Das vollständige Review richtet sich zuerst auf
die eigenständige Standalone-App für Windows und macOS, einschließlich
Frontend, Tauri/Rust, Sidecar, lokalem Core, Konvertern und Dateien. Der
Cowork-Adapter wird dort vertieft, wo er denselben Core oder eine gemeinsame
Vertrauensgrenze verwendet; reine Cowork-Funktionen sind nachgeordnet.
`CLAUDE.md` enthält Regeln für **beide** Produkte. Seine allgemeine
Main-Checkout-Anweisung ersetzt weder den beauftragten Review-Branch noch
den unveränderlichen veröffentlichten RC177-Referenzcommit.

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
  gesonderte Eingabe-/Wirkungsprüfung. Der damalige Registerstand hatte
  15 manuelle Entscheidungen bei 43716 JS-Inventareinträgen. Nach Befund
  008 enthält `REVIEW-DECISIONS.json` 23 begründete Entscheidungen
  einschließlich der drei betroffenen `try`-/`catch`-Paare;
  43693 Einträge stehen weiterhin auf `PENDING`.
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
- 26.10., R3/R5-Befund 005: `plainDataFields` im nativen DTO-Kern nahm einen
  einzigen Schlüssel `object,volume` als zwei erwartete Felder an. Der
  generische Vertrag war damit falsch, obwohl die bislang geprüften Aufrufer
  Werte zusätzlich validieren; kein nativer Rechte-/Ordnerbypass belegt.
  Vorher 9/10 gezielt rot, nach Einzelvergleich 10/10 grün; initiale
  Ergebnisordner-/Receipt-Suite 83/83 grün. Proxy-/Getter-/Prototypschutz
  blieb bestehen. P2 Validierungsintegrität; `FINDING-005.md`.
- 26.10., R3-Befund 006: Der exportierte Renderer der vertraulichen
  Zuordnungsübersicht akzeptierte einen kombinierten Exklusions-Schlüssel
  anstelle zweier Einzelzähler. Der normale Builder schreibt die vier Felder
  getrennt; kein betroffener Nutzerlauf belegt. Synthetischer Test aus echter
  Builderprojektion vor Fix 15/16 rot, nach engem Einzelkeyvergleich 16/16
  grün; angrenzende Excel-/TXT-Suite 47/47 grün. P2 Anzeigeintegrität;
  `FINDING-006.md`.
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
- R3-Hypothese vor Befund 007: `batch-recovery.js:310-340` gab bei
  unlesbarem privatem Journalroot für rein lesende Cleanup-Zähler null
  zurück. Diese erste Quellenbeobachtung war noch kein bestätigter Befund;
  Status- und Verbraucherprüfung erfolgten danach.
- 26.10., R3/R5-Befund 007 nach Status-/Verbraucherprüfung: Die beiden
  Cleanup-Zähler wurden über `genericStatus` auch dann als unqualifizierte
  Null veröffentlicht, wenn ein aktiver Besitzer den Scan bewusst ausließ,
  `readdirSync` scheiterte oder ein einzelnes Journal nicht lesbar war.
  Die Referenzdokumentation beschrieb Null als Zähler, aber keinen
  unbekannten Zustand. Ein neuer inhaltsfreier Boolean
  `local_cleanup_counts_complete` trennt vollständige Zählung von
  bestätigten Untergrenzen; die Zahlen und `engine_ready` bleiben erhalten,
  keine automatische Löschung. Der gezielte Test war zunächst 29 PASS/
  3 FAIL und nach Fix 32/32 PASS. Angrenzend `test-mcp-protocol.js` 66/66
  und `test-batch-session.js` 72/72, `test-status-app-server.js` 13/13,
  `test-gateway-e2e.js` 50/50 PASS. `FINDING-007.md`; Gesamt- und
  Plattformgates bleiben offen. Kein realer
  Nutzerfehler oder unbereinigter Bestand wurde daraus behauptet.
- 26.10., R3/R5-Befund 008: `batch-intake-intent.js` ließ durch denselben
  nicht injektiven Feldnamenvergleich eine `work_identity` mit kombiniertem
  `birthtimeNs,dev`-Schlüssel passieren. Der echte lokale Intent-Fixture
  belegt 29 PASS/1 FAIL vor und 30/30 PASS nach dem engen Feldnamensfix.
  Nachgelagerter Identitäts- und Löschguard blieb separat streng; kein
  unbefugtes Löschen belegt. Angrenzende Batch- und Gateway-Suiten
  72/72 und 50/50 PASS. `FINDING-008.md`. Weitere Intake-/Recovery-
  Varianten und Zielhostgates offen.
- R3-Triage ohne weitere Entwarnung: Fünf `Object.keys`-Vergleiche in
  `standalone-history-store.js` quellenbasiert mit ihren tatsächlichen
  Einzelwertprüfungen verfolgt. Für die konkrete Kommaschlüssel-Kollision
  kein weiterer Annahmepfad bestätigt; vollständige Funktions-/I/O-/
  Race-Prüfung und Tests weiterhin `PENDING`. Enger Beleg:
  `KEYSET-TRIAGE-HISTORY.md`. Der neue Befund 008 zeigt ausdrücklich,
  warum sich diese Einschätzung nicht auf alle 101 Produktstellen übertragen
  lässt.
- 26.10., R3/R5-Befund 009: `text-review.js` verglich die sortierten IDs
  lokaler Mehrdeutigkeitsentscheidungen als kommaseparierte Zeichenkette.
  Eine einzige künstlich kombinierte `keep`-ID konnte zwei Credential-
  Fundstellen ersetzen; im Cowork-Einzeldokumentpfad greift für reine
  Credential-Fundstellen keine zweite Personenkandidatenprüfung. Der
  gezielte Validatorgegenfall war vor Fix 37/38 rot, danach 38/38 grün;
  tatsächlicher Policy-Gegenfall 9/9 und angrenzende Privacy-Suite 11/11
  PASS. Eine fehlerhafte normale UI-Antwort oder ein echter Nutzerlauf ist
  nicht belegt. Enger ID-Arrayvergleich, keine fachliche Lockerung;
  `FINDING-009.md`. Gesamt- und Plattformgates bleiben offen.
- 26.10., R8-Zwischenprüfung auf Review-Commit
  `54e6bb610eb2999e04ce08f577aa57a2e0d8318e`: vollständiger
  `headless`-Produktlauf mit gepinntem Node22.23.2 **328/328
  Testdateien, Exit0**, danach getrackter Arbeitsbaum sauber. Originallog
  882772Bytes/SHA-256 `2b91ac80bcfcab8fe28da14a119ce114f6b9341c11b9935de5617429a3def121`,
  lokaler Beleg `HEADLESS-54E6BB61.json`. Native Windows-Forms,
  Standalone-GUI/Paketabnahme und Mac-Zielhost wurden dadurch **nicht**
  ausgeführt. Der Lauf gilt nur für diesen Review-Commit und ersetzt keine
  frischen Gates nach späteren Produktänderungen.
- 26.10., `CLAUDE.md`-Abgleich für den Standalone-Schwerpunkt begonnen:
  direkte Quellformate aus `application-service.js:20` passen zu TXT/MD/CSV,
  DOCX/XLSX/PPTX/PDF und PNG/JPEG/BMP; das Fünferfenster ist durch
  `standalone-history-window.js:15,43`, die vertraulichen CSV/TXT/XLSX-
  Beilagen durch `result-companions.js:7-11` gebunden. Das sind
  einzelne Quellkonstanten, kein Nachweis für sämtliche Laufzeit- und
  Plattformbehauptungen in `CLAUDE.md`. Deren weitere Prüfung bleibt offen.
- 26.10., Prüfregel in `CLAUDE.md` an den tatsächlichen Runner angepasst:
  `test:product` fordert auf Windows explizite native UI-Freigabe und ist bei
  vom Nutzer selbst übernommenen Desktoptests kein stiller Standardlauf.
  `test:product:headless` ist das passende Quellen-Baselinegate; Cowork-Plugin-
  ZIP/Build beweisen kein Standalone-Paket. Getrennter direkter
  Standalone-Broker-Gegenfall für Befund009: kombinierte ID bleibt vor dem
  Worker-Send abgewiesen, die vollständige Zweierantwort danach angenommen;
  `test-standalone-review-broker.js` 11/11 PASS. Version-/Kanon-/Docs-/UAT-
  Einzelgates und `test-claude-code-pilot.mjs` mit gepinntem Node PASS.
  Der 328er-Gesamtlauf liegt **vor** diesem neuen Testinput; kein neuer
  kompletter Gesamt- oder nativer Paketnachweis wird daraus abgeleitet.
- 26.10., erster frischer Headlesslauf nach dem Standalone-Brokergegenfall:
  gepinnter Node22.23.2, 328/328 Testdateien, Exit0; Log
  `headless-current-standalone-focused.log` SHA-256
  `c8251c3daeec12077da9ad087ca4c66a28645af04301420915df90f2864420e3`.
  `HEADLESS-STANDALONE-FOCUSED-PREFIX.json` bindet die damaligen Inputs.
  Dieser Lauf liegt **vor** der nachfolgenden Frontend-Korrektur und ist kein
  Nachweis für sie. Native UI-/Paket-/Mac-Gates waren nicht Teil davon.
- 26.10., R3/R5-Befund 010: Die Standalone-Prüfansicht behauptete nach dem
  bloßen lokalen Worker-Handoff dauerhaft gespeicherte Entscheidungen und
  Vertagung. `accepted:true` belegt das spätere Worker-Checkpoint nicht.
  VM-Gegenfall `accepted:true` und weiter aktivem Worker vor Fix 67/68 rot;
  nach enger Status-/Textkorrektur 68/68 und Brokervertrag 11/11 PASS.
  Keine Änderung an privatem Journal, Freigabe, Export, Timeout oder Retry;
  kein realer Datenverlust belegt. `FINDING-010.md`; frische Gesamtregression
  und native Plattformgates für einen neuen Kandidaten noch offen.

## Standalone-/Cowork-Quellgrenze (26.10., in Prüfung)

Der Nutzer verlangt, dass die eigenständigen Windows- und Mac-Pakete keine
Cowork-Laufzeitbestandteile enthalten. Die geprüfte Architekturentscheidung
ist **ein** neutraler Kern mit getrennten Produktadaptern und einer geschlossenen
Standalone-Dateiprojektion. Eine vollständige Kopie des Sicherheitskerns würde
Korrekturen und Policyidentitäten auseinanderlaufen lassen. Die Trennung folgt
dem Abhängigkeitsprinzip: Domänenregeln hängen nicht von Dialogen, MCP oder
Cowork-Jobs ab; Produktadapter hängen vom Kern ab. Diese Entscheidung ist
eine Architekturinferenz aus dem aktuellen Code und den Microsoft-Grundsätzen
zu [Separation of Concerns](https://learn.microsoft.com/en-gb/dotnet/architecture/modern-web-apps-azure/architectural-principles)
und [Clean Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures).

Im **unveröffentlichten Arbeitsbaum** sind native Dateiauswahl/Ordnerfunktionen
unter `server/local-ui`, reine Reviewmodelle unter `server/core` und
Cowork-Dialoge, Jobstore und MCP-Einstieg unter `server/companion` getrennt.
Die Standalone-Projektion verbietet `companion/` vollständig und erzeugt eine
beim Start gegen alle beigelegten neutralen Policydateien geprüfte
Fingerprint-Quittung. Der neutrale verifizierte Paketdateileser liegt nun in
`gateway/package-files.js`; der Cowork-eigene Modell-Lesegrant, Seitenvertrag
und Snapshotcache verbleiben in `gateway/package-store.js` und werden nicht
in Standalone installiert. Das gemischte Testharness prüft synthetische
Standalone-Pakete direkt anhand von Manifest, Bytehash und UTF-8, ohne dafür
einen Cowork-Grant zu erfinden. Der neue Standalone-Fingerprint bindet nur die
neutralen Policydateien; Cowork behält die historische vollständige
Quellenliste und den Berechnungsvertrag, nicht zwingend denselben Hashwert
nach geänderten Quellen. Cowork-exklusive Policy-Quellbytes fließen weder in den neuen
Standalone-Fingerprint noch als ausführbare Dateien ins Paket. Die projizierte
Windows-Liste enthält aktuell 269 Dateien,
null `companion/`-Module und weder MCP-Einstieg noch Cowork-Paketstore oder
Cowork-Reviewmodul. Gemeinsam genutzte Gateway-Dateien enthalten noch
produktspezifische Zweige: Das Manifest beweist die Modulgrenze, nicht die
vollständige Entflechtung jeder Quellzeile. Der gemeinsame Kern und die
unterschiedlichen Produktrollen bleiben weiter byte- und semantisch zu prüfen.
Dies ist **kein** neues ZIP-/Mac-Artefakt und keine native Zielhostabnahme.

Der Policyfingerprint ändert sich bei dieser Quelltrennung absichtlich.
Bereits abgeschlossene Ergebnisdateien und Historien werden nicht umgeschrieben.
Ein unter einem anderen Policyfingerprint angefangener Anonymisierungszustand
darf ohne bewiesene Migration nicht unter der neuen Policy fortgesetzt werden;
ein pauschaler Fingerprint-Alias wäre eine Schutzlockerung. Diese
Bestandszustandsfrage wurde im unveröffentlichten Arbeitsbaum konkret geprüft:
Ein unvollständiger alter Anonymisierungslauf mit anderem gebundenen Hash
bleibt lesbar, erscheint als nicht fortsetzbar und verlangt einen neuen Lauf
aus den unveränderten Originaldateien. History-Projektion und direkter
Fortsetzungsversuch an einem gespeicherten Journal bestätigten den spezifischen
Fehler `BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE` und bytegleiches Journal vor/nach
beiden Aktionen. Bereits erstellte Ergebnisse und Entscheidungen werden nicht
umgeschrieben. Das ist keine Migration und kein Nachweis für jede historische
Journalvariante; vor einem neuen Paket bleibt die Plattformdarstellung offen.
Die Quittung verwendet das neue Standalone-Schema `/2`. Ein gezielter Gegenfall
ändert die beiden Cowork-exklusiven Quelldateien: Coworks historischer
Fingerprint ändert sich, Standalones neuer Fingerprint bleibt bytegleich.
Der neue Standalone-Zustand verweigert den alten gemischten Hash; dessen
eventuelle Migration bleibt vor Paketfreigabe offen und wird nicht durch einen
Alias vorweggenommen.
Gezielte Projektion 10/10, Produktisolation 4/4, Pseudonymzustand 26/26,
Companion-IPC 29/29, Cowork-Prozessor 38/38, Paket-Leserechte 27/27,
Paket-Snapshots 2/2, Gateway-E2E 50/50, gemischte Wide-Privacy-Fälle 11/11,
Corepolicy-Goldenbindung 9/9 und echte Standalone-Sidecar-Lebensdauer PASS.
Der erste zusätzliche 16-Dateien-Härtetest war **rot**: Nach expliziten synthetischen
OCR-Kontakt- und Textentscheidungen verweigert der automatische erste lange
Anonymisierungslauf wegen `RESIDUAL_PII`; 15 weitere Positionen erreichen
ihre Reviewphase. Diesen historischen Sicherheitsstopp weder als anonymisierte Ausgabe
noch als Architekturregression umdeuten. Der kanonische frische 328-Dateien-
Headlesslauf mit gepinntem Node22.23.2 war **PASS, Exit0** vor der anschließenden
Trennung des Standalone-Fingerprints. Originallog:
`dist/rc177-full-code-review-20261026/headless-after-cowork-boundary-20261026.log`,
SHA-256 `be8cef177b3a408c1c9b57a5e0575f97880b86c88217790365bcddcf19c32055f`.
Es liefen keine sechs nativen Windows-Formfälle und keine Standalone-GUI-/Paket-
oder Mac-Zielhostabnahme. Frühere rote Zwischenläufe mit veralteten Testannahmen
bleiben separat erhalten. Nach der neuen Fingerprintänderung bestanden
`test-batch-pseudonym-state.js` 26/26 und
`test-standalone-build-fingerprint.mjs` 10/10 sowie die semantische
Corepolicy-Goldenbindung 9/9. Der danach unverändert gestartete zweite
vollständige Headlesslauf ist **328/328, Exit0**; Log
`dist/rc177-full-code-review-20261026/headless-after-standalone-policy-v2-20261026.log`,
SHA-256 `34c767a417828aaf6186ab0446dfd304b3f685a9b25ef44b2afa25d8857448fc`.
`npm run test:docs` bestand mit dem gepinnten Node22.23.2, Originallog
`dist/rc177-full-code-review-20261026/docs-after-policy-v2-20261026.log`,
SHA-256 `9f77c5475bf4d3c9823577cb92a986e94806bd9875b36b44b93227db9b47aee6`.
`git diff --check` meldet keinen Whitespacefehler (nur eine CRLF-Normalisierungswarnung).
Diese Quellgates ersetzen weder ein neues Windows-/Mac-Paket noch native UI-
und Zielhostprüfungen. Der veröffentlichte RC177 ist davon unberührt.

**Neuer gebundener Gegenbeleg 26.10. nach der Bestandszustandskorrektur:**
Der erste lange Härtetest reservierte 21 Vorkommen von „Max Mustermann“ und
21 von „María-José Núñez“ trotz eigenständig belegtem Personenkontext. Die
Anonymisierung entfernte die übrigen Vorkommen, die Reservierungen setzten
jedoch Klartext wieder ein; das finale Restdatengate stoppte zu Recht. Der
enge Standalone-Fix überspringt die Reservierung für exakt kontextbelegte
gemischtschreibende Namen. Unbelegte Prosa und rein großgeschriebene Titel
bleiben in der lokalen Entscheidung. `test-privacy-text-operation.js` 12/12
PASS einschließlich der neuen Abgrenzung. Der **neue** echte 16-Dateien-Lauf
lieferte 16/16 Konvertierungen und 16/16 anonymisierte Veröffentlichungen
nach expliziten synthetischen lokalen Entscheidungen; technische Anker,
Identitätsfreiheit und dokumentübergreifende Pseudonyme wurden geprüft.
Originales neues Log `dist/rc177-full-code-review-20261026/adversarial-after-anchor-fix.log`,
14141 Bytes/SHA-256 `a8a5b1d2eedaee5edd47b33e5ff72d2994279265a35d8b08f5d1ebc6f18006e0`.
Das ältere rote Log bleibt als ursprünglicher Gegenbefund erhalten.

Danach lief der **unveränderte** aktuelle Test-/Produktstand mit gepinntem
Node22.23.2 durch `tests/run-product-suite.js headless`: 328/328
Testdateien, Exit0; Originallog
`dist/rc177-full-code-review-20261026/headless-after-old-policy-and-anchor-20261026.log`,
883751 Bytes/SHA-256 `13defec1249f32bd65cc0908655f81c86ff50e2b63205c36f85a794702e4ef2e`.
Die gezielte History-Suite und die Batch-Fortsetzung waren ebenfalls PASS.
Nach der Dokumentaktualisierung bestand `npm run test:docs` mit vorn in
`PATH` gepinntem Node22.23.2, Exit0; neues Originallog
`dist/rc177-full-code-review-20261026/docs-after-old-policy-and-anchor-20261026.log`,
5061 Bytes/SHA-256 `9f77c5475bf4d3c9823577cb92a986e94806bd9875b36b44b93227db9b47aee6`.
Sechs native Windows-Formfälle, echte Desktop-GUI, neues Windows-Paket und
native Mac-Zielhostgates blieben **NOT_RUN**; einzelne Symlink-Gegenfälle der
Quellsuite waren mangels OS-Berechtigung ebenfalls ausdrücklich NOT_RUN.
Dieser Abschluss ist ein Quell- und Testzwischenstand, kein vollständiges
R0–R9-Review und kein neuer Release.
