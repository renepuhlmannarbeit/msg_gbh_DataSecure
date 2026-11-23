# Auftrag an Claude Code · DataSecure Standalone RC178

Stand 23.11.2026 · Erst analysieren, dann gezielt verbessern und an Codex übergeben.

## Ziel und erwartetes Ergebnis

DataSecure Standalone bereitet Dokumente lokal auf. Die App erzeugt verständliches
Markdown und kann auf Wunsch personenbezogene Angaben in diesem Markdown
maskieren oder pseudonymisieren. Originaldateien bleiben unverändert. Der
Anwender wählt Dateien und Ziel bewusst, kann OCR- und Fundstellenentscheidungen
prüfen und erhält lokal nachvollziehbare Ergebnisse. Wenn der Inhalt einer Quelle
nur teilweise erfasst werden kann, braucht der Anwender einen konkreten Hinweis
und ein brauchbares Ergebnis für die sicher extrahierten Teile.

Verbessere die Anwendung auf Basis eines eigenen, vollständigen Reviews des
relevanten Quellcodes. Prüfe fachliche Richtigkeit, Datenschutz, Architektur,
Codequalität, Tests, Bedienbarkeit und Auslieferung gemeinsam. Belege jeden
umgesetzten Befund am realen Produktpfad. Priorisiere die Verbesserungen nach
Auswirkung und überprüfe deine Annahmen aus mehreren Perspektiven. Liefere einen
prüfbaren Diff, reproduzierbare Ergebnisse und einen Abschlussbericht, aus denen
Codex ohne Kenntnis deiner Sitzung ein unabhängiges Review durchführen kann.

Zugeordnete bestehende Arbeit sind BL-050.6 (Standalone-Quell- und Fachreview),
BL-049.2 (Konvertierungsqualität) und für belegte Leistungsbefunde BL-047.5
(Konvertervorbereitung). Prüfe die genaue Zuordnung einzelner Befunde gegen das
[kanonische Backlog](../docs/canonical/BACKLOG.md). Die Vorlagen in diesem Auftrag
erfassen die Ausführung und begründen keine zusätzlichen Produktanforderungen.

## 1. Einstieg und verbindlicher Stand

| Gegenstand | Bindung |
| --- | --- |
| Repository | `renepuhlmannarbeit/msg_gbh_DataSecure` |
| Einstieg | `origin/codex/rc178-claude-review-handoff` |
| Arbeits- und Übergabebranch | `claude/rc178-standalone-review` |
| Veröffentlichter Produktstand | `v3.2.0-rc178`, Commit `13ed39ff979a5f5d9bb076d35021164de380b9dd` |
| Produktfingerprint | `b18ce3565265ad0a7d5fff7cb6112ea050cb853c3c62f5a9b6512ca01c824655` |
| Ausgelieferte RC178-Ziele | Windows x64, macOS Apple Silicon und macOS Intel |

1. Starte in einem frischen, sauberen Checkout des Einstiegsbranches. Prüfe
   Repository, Arbeitsbaum, Tag-Commit und Baseline-Diff. Der Einstiegsbranch
   enthält RC178 plus Dokumentations- und Auftragscommits. `main` führt bei
   Auftragserstellung einen älteren Produktquellstand. Der Review beginnt daher
   am angegebenen Branch. Gibt es den Arbeitsbranch bereits, überprüfe seine
   Abstammung und Arbeit anderer, bevor du ihn weiterverwendest.
2. Lege `claude/rc178-standalone-review` vom verifizierten Einstiegscommit an.
   Halte Tag-Commit, Einstiegscommit, Produktfingerprint, Umgebung, tatsächlich
   verwendetes Claude-Modell und verfügbare Zielplattformen im Bericht fest.
   Den Fingerprint kannst du mit `standaloneBuildFingerprint` aus
   [dem Buildmodul](../scripts/lib/standalone-build-fingerprint.mjs) ermitteln.
3. Lies zuerst [CLAUDE.md](../CLAUDE.md), den [Kanon](../docs/canonical/README.md)
   und das [Dokumentenregister](../docs/canonical/DOCUMENT_REGISTER.md). Ordne
   frühere Reviews, Releases und Abnahmen nach Commit und Prüfumfang ein. Nutze
   sie als Hinweise und Gegenbelege. Prüfe offene Altbefunde auf RC178, bevor du
   sie als aktuelle Arbeitsaufträge einordnest.
4. Lies den [RC178-Prüfnachweis](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc178/RELEASE-EVIDENCE.json)
   und die [Release-Seite](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc178).
   RC178 übernimmt die Anwendungslogik der November-Ausgabe von RC177 und wurde
   mit neuer Versionskennung für dieselben drei Zielpakete gebaut. Vorhanden sind
   Windows-Paket-, Laufzeit- und Quelltests, ein lokaler Windows-Start- und
   Versionscheck sowie macOS-Runner-Paket- und Startnachweise für beide
   Architekturen. Die formale Abnahme auf realen Mac-Zielgeräten steht aus.
5. Verwende Fable, wenn es in deinem Claude-Code-Konto verfügbar ist. Starte
   interaktiv mit `claude --model fable` oder prüfe die Auswahl mit `/model`.
   Ein nicht verfügbares Modell blockiert den Auftrag nicht. Notiere das
   tatsächlich genutzte Modell. Die Modellauswahl ist eine Einstellung der
   Review-Sitzung. DataSecure erhält dadurch keine Claude-Abhängigkeit.
   [Claude-Code-Modellkonfiguration](https://code.claude.com/docs/en/model-config#work-with-fable).

Vorab zu lesen sind [Produkt und Zweck](../docs/canonical/PRODUCT.md),
[Standalone-Architektur](../docs/canonical/STANDALONE_ARCHITECTURE.md),
[Sicherheitsmodell](../docs/canonical/STANDALONE_SECURITY_MODEL.md),
[Formatmatrix](../docs/FORMAT_COVERAGE_MATRIX.md), [Projektentscheidungen](../docs/canonical/DECISIONS.md),
[Tests](../docs/TESTING.md), [Release-Vertrag](../docs/RELEASE.md) und
[bisheriges Code- und Fachreview](../docs/acceptance/RC177_FULL_CODE_AND_DOMAIN_REVIEW_20261026.md).
Lies die konkreten Verträge unter [contracts](../docs/canonical/contracts) an den
jeweiligen Kontrollgrenzen. Beispiel für eine zu überprüfende Abweichung zwischen
Dokumentation und Produkt ist die pauschale Aussage zum seriellen Batchrunner in
CLAUDE.md. Verfolge die reale Standalone-Konvertervorbereitung und die
Veröffentlichungsreihenfolge im Code. Übernimm weder Dokumentation noch Tests
ungeprüft als Beschreibung aller Laufzeitpfade.

## 2. Produktgrenzen und Hindernisse

- **Standalone ist der Lieferumfang.** Priorität haben der bestehende Mac-Client
  auf Apple Silicon und Intel sowie die technische Perspektive für iOS.
  Windows x64 bleibt eine Regressionsplattform für gemeinsam genutzten
  Standalone-Code. Auf Linux und beim Cowork-Plugin gilt der bisherige Lieferumfang.
  Prüfe gemeinsam genutzte Module und die Paketprojektion dort, wo Änderungen
  Standalone oder die Trennung der Produkte betreffen.
- **iOS ist eine Machbarkeitsfrage.** Der geprüfte Desktop-Zielvertrag enthält
  kein iOS-Paket. Bestätige den Befund im tatsächlichen Repository. Das Team
  kann für dieses Projekt keinen Apple-Developer-Account einrichten und verfügt
  über keine nutzbare Mitgliedschaft im Apple Developer Program. Plane deshalb
  weder einen App-Store-/TestFlight-Release noch Provisionierung auf iPhones ein.
  Unterscheide öffentliche technische Dokumentation, einen möglichen lokalen
  Simulatorversuch mit vorhandener zulässiger Toolchain, einen Geräteversuch
  und die spätere Distribution. Die iOS-Machbarkeitsanalyse ist Teil des
  Auftrags. Ein neues iOS-Produktziel braucht eine gesonderte Produktentscheidung.
  [Apple zu Konten und Mitgliedschaften](https://developer.apple.com/help/account/basics/about-your-developer-account).
- **macOS bleibt bei den bestehenden Testpaketen.** Lokale Ad-hoc-Versiegelung,
  eigener statischer Core und getrennt gebundener offizieller Konverter sind
  Projektbestandteil. Developer-ID, Apple-Notarisierung und Apple-Einreichung
  liegen außerhalb dieses Auftrags. Gatekeeper, Hardened Runtime,
  Library Validation und TCC bleiben wirksam. Keine Anmeldung, Kontoanlage,
  Zertifikats- oder Schlüsselsuche und keine Änderung von Schutzmechanismen auf
  dem Host. Eine native CI-Prüfung belegt ihren Runner und ihren tatsächlichen
  Testumfang. Finder, Gatekeeper, WebView und externe Ordnerrechte auf echten
  Zielgeräten werden jeweils separat nachgewiesen.
  [Apple zu Developer ID](https://developer.apple.com/developer-id/).
- **Lokale Datenverarbeitung ist ein Produktziel.** Originale bleiben am Ort
  und bytegleich. Reine Konvertierung ist inhaltserhaltend. Bei Anonymisierung
  wird der extrahierte Text bearbeitet, und Extraktionsqualität und
  Datenschutzstatus werden getrennt ausgewiesen. Zuordnungen mit Originalwerten
  bleiben lokal im vertraulichen Bereich. Normale Ergebnisdateien bleiben
  editierbare Arbeitskopien, private Prüfstände gebunden. Behalte die wirksamen
  Schutzprüfungen, Offline-Grenzen, bewusste Auswahl und die Trennung zwischen
  Anzeige, Diagnose und Freigabe bei. Bewerte sachlich, ob einzelne Prüfungen
  vereinfacht werden können, und belege gleich wirksame Schutzwirkung und
  eine bessere Fehlerbehandlung mit Gegenfällen.
- **Reviewdaten und Umgebung.** Benutze den öffentlichen Quellstand und frei
  verwendbare oder synthetische Fixtures. Reale Nutzerprofile,
  Kundendokumente, Diagnoserohdaten, Tokens, Schlüssel und
  Zugangsdaten gehören weder in die Sitzung noch ins öffentliche Repository.
  Änderungen an Workflows sind bei belegtem Nutzen erlaubt. Verwende für
  die Verifikation vorhandene lokale Checks und lesbare CI-Belege. Halte dich
  für Workflow-Dispatches, neue Runner-Ausgaben, Desktopübernahme und
  signierte Auslieferung an die bestehende Freigabegrenze des Projekts.

## 3. Phase A · Eigenständige Analyse vor Produktänderungen

1. **Rekonstruiere das Produkt aus Sicht des Anwenders.** Beschreibe den
   tatsächlich beobachtbaren Ablauf für reine Markdown-Konvertierung,
   geführte Anonymisierung und automatische Maskierung. Verfolge Eingabe,
   OCR, Entscheidung, Fortschritt, Ergebnis, Zuordnungen und Wiederaufnahme
   innerhalb desselben Release-Stands. Nenne fachliche Erwartungen pro
   Modus und die Stellen, an denen der Code sie erfüllt oder verfehlt.
2. **Erfasse die Quellabdeckung.** Inventarisiere alle produktbezogenen eigenen
   Dateien, Skripte, Tests und Workflows sowie die benutzten generierten
   Artefakte und Fremdkomponenten im eingefrorenen Checkout. Verfolge
   den vollständigen Standalone-Aufruf- und Paketgraphen, einschließlich
   Plattformzweigen, dynamischer Imports, Fehlerpfaden und kurzer Adapter.
   Gemeinsame Module bis zur relevanten Produktgrenze lesen. Ordne Legacy,
   vendorte Quellen, unveränderte generierte Dateien und sonstige Ausnahmen
   nachvollziehbar zu. Bei Fremdcode prüfe die Integration, Versionen,
   Patches, Lizenzen und wirksamen Grenzen.
3. **Prüfe jede erfasste Funktion, Methode, Klasse und wesentliche Zustands-
   oder Fehlerbehandlung.** Erkläre Zweck, echte Aufrufer, Eingaben,
   Vertrauensniveau, Seiteneffekte, Invarianten und Tests. Beziehe Parameter,
   Zustandsobjekte, Callbacks, Abbruch, Cleanup, `catch`, `finally`,
   Rust-`Result`, native Ressourcen und mögliche Teilfehler ein. Markiere
   Abdeckungslücken. Ein AST-Inventar ist die Zählgrundlage, das Urteil
   entsteht beim Lesen der Implementierung und der Aufrufkette.
4. **Mach den Baseline-Zustand beobachtbar.** Führe geeignete unveränderte
   Basistests aus, ordne vorhandene Artefakte je Commit und Plattform zu
   und halte bestätigte Fehler oder Umgebungsgrenzen fest. Verwende
   [Vorlagen](rc178-claude-review/VORLAGEN.md) für Abdeckung, Befunde,
   Annahmen und Testnachweise. Halte vor der ersten Produktänderung eine
   priorisierte Befundliste und den Umsetzungsplan im Arbeitsbranch fest.

### Verbindliche Prüfdimensionen

| Dimension | Auftrag an die Prüfung |
| --- | --- |
| Fachlichkeit und Formatqualität | Vergleiche repräsentative synthetische Originale mit Markdown und fachlichen Sollwerten. Prüfe TXT/MD/CSV, DOCX, XLSX, PPTX, PDF/Scan-PDF und die veröffentlichten Bildpfade. Wähle nach Formatmatrix auch Grenzfälle für OCR, Layout, Tabellen, Diagramme, SmartArt, Formeln und Formulare. Prüfe Sprache, Unicode, Umlaute, sichtbaren Inhalt, Reihenfolge, wiederholten Text, Teilresultate und Erläuterungen zu Auslassungen. |
| Anonymisierung und Zuordnungen | Prüfe Personen, Unternehmen, Kontaktdaten, Fachwörter, uneindeutige Vorkommen und laufweite Konsistenz. Vergleiche geführte Entscheidungen mit automatischer Maskierung. Prüfe Korrekturen, private Prüfstände, Dateizuordnung und übereinstimmende Pseudonym-Zuordnungen einschließlich Vorkommen in TXT/XLSX. Beurteile übrig gebliebene personenbezogene Werte und zu starke Redaktion getrennt. |
| Oberfläche, UX und Accessibility | Verfolge Start, Auswahl, OCR-Hinweise, Prüfung, Zwischenspeicherung, knappe Fehlermeldungen, Fortschritt, Ergebnispfad und Verlauf. Prüfe Tastatur, Fokus, Screenreader-Semantik, Zoom, deutsche Texte und verständliche Dateihinweise. Belege jedes Urteil am richtigen UI-Pfad. Kennzeichne reine Quell- und Modellbelege. |
| Architektur und Plattform | Zeichne die tatsächliche Kette von Oberfläche über Tauri/Rust und IPC zu Core, Worker, Konverter und Dateiausgabe. Verfolge Rückmeldungen, Besitz und Prozesslebensdauer. Prüfe Grenzen zwischen neutraler Quellbibliothek, Standalone-Adaptern, Cowork-Host und Projektion ins Paket. Beurteile einfache Zuständigkeiten, vernünftige Modulgrenzen, Kopplung, aufrufbare Schnittstellen und Portierbarkeit. |
| Implementierung und Wartbarkeit | Prüfe jede relevante eigene Methode nach Zweck, Namen, Verträgen, Typen, Parametern, Zuständen, Standardwerten und Fehlerbehandlung. Prüfe unnötige Abstraktionen, Duplikate, alte Zweige, Zyklen und widersprüchliche Zuständigkeiten. Beurteile Objektorientierung dort, wo Objektidentität, Lebensdauer und gekapselter Zustand tatsächlich helfen. Für reine Transformationen sind kleine Funktionen und klare Datentypen eine normale Wahl. |
| Datenschutz und Sicherheitsgrenzen | Prüfe defensive Eingabevalidierung, Abhängigkeiten, Datenflüsse und Fehlerpfade, unter anderem Dateibindung, temporäre Pfade, Dateiauswahl, lokale Diagnose, kontrollierte Ausgabe, Ressourcenlimits und Offline-Verhalten. Verwende harmlose synthetische Negativfälle. Empfindliche Findings mit minimiertem Inhalt und nachweisbaren defensiven Korrekturen beschreiben. |
| Nebenläufigkeit, Zustandsmodell und Betrieb | Prüfe Zustandsübergänge, Sperren, geordnete Veröffentlichung, Pseudonym-Stabilität, Commit-/ACK-Vertrag, parallele Vorbereitung, Wiederholung, Pause/Fortsetzen innerhalb derselben Version und sauber beobachtetes Ende. Prüfe Verhalten bei Fehlern einzelner Worker, knappen Ressourcen, nicht zugänglichem Ziel und abgebrochener Ausgabe. |
| Leistung und Ressourcen | Miss Summe und relevante Phasen separat, zum Beispiel Extraktion, OCR, Konverterstart, IPC, Prüfung, Ergebnis und Zuordnungen. Vergleiche gleichen synthetischen Korpus und gleiche Umgebung, mit Ausgabeäquivalenz, Laufzeit und verfügbarem Speicher. Prüfe seriellen Fallback und belegten Mehrwert einer Optimierung. |
| Tests und Orakel | Untersuche Tests auf reale Aufrufpfade, sinnvolle Positive und Negative, unabhängige Sollwerte, Determinismus, Plattformabhängigkeit, echte Fehlerindikatoren und aussagekräftige Berichte. Trenne Simulation, Pakettest, CI-Zielrunner, tatsächliche UI und menschliche Abnahme. Ein Mock kann einen Gegenfall zeigen und ersetzt keine plattformspezifische Probe. |
| Abhängigkeiten, CI und Lieferkette | Prüfe Lockfiles, vendorte und gepatchte Laufzeiten, Action-Pins, Rechte, Workflow-Trigger, Runner-Labels, Protokollredaktion, alte Tests und Artefaktbindung. Begründe Aktualisierungen anhand offizieller Quellen und beobachtbarer Risiken. Prüfe reproduzierbare Paketierung, Plattform/Architektur, native Core-/Konverterrollen, Signaturen, Prüfsummen, SBOM, Lizenzen und die Übereinstimmung von Quellstand und Paket. |
| Dokumentation und Nachvollziehbarkeit | Vergleiche Kanon, Benutzeranleitung, Plattformmatrix, Tests, Paketinhalt und Release-Status. Halte aktuelle Regeln und datierte historische Nachweise auseinander. Führe bei Produktänderungen Backlog, Current State und Traceability gemeinsam mit Code und Tests fort. |

### Separater iOS-Entscheidungsnachweis

Ermittle zuerst, welche fachlichen Teile portierbar sind und welche an
Desktop-Tauri, Node-Nebenprozesse, das lokale Dateisystem, native Guards,
Dateipicker oder betriebssystemspezifische Rechte gebunden sind. Vergleiche
mindestens einen Ansatz mit nativer iOS-Dateiaufnahme und wiederverwendbarem
Fachkern und einen Ansatz, der geeignete bestehende UI-Bestandteile weiter
nutzt. Prüfe Offline-OCR, unterstützbare Eingabeformate, App-Lebenszyklus,
Speicher, zugriffsgebundene Datei-URLs und browsbare lokale Ergebnisse.
Unterscheide eine kleine, tatsächlich prüfbare Voruntersuchung und eine
produktionsreife App. Gib eine Empfehlung mit Voraussetzungen, Risiken,
kleinstem prüfbaren Schritt und Abbruchkriterien ab. Begründe technische
Aussagen mit Quellstellen, gegebenenfalls einem tatsächlich ausgeführten
Simulatorversuch, und primären Plattformquellen.
[Apple zu Dateipickern und gebundenem Verzeichniszugriff](https://developer.apple.com/documentation/uikit/providing-access-to-directories).

## 4. Phase B · Annahmen und Befunde gegenprüfen

Führe pro substanzieller Änderung mindestens einen nachvollziehbaren
Gegencheck aus voneinander verschiedenen Perspektiven durch. Wähle je nach
Risiko fachliche Datentreue, Datenschutz, OS-/Prozesslebensdauer,
Wartbarkeit, Testgültigkeit oder Auslieferung. Suche ausdrücklich den
stärksten Gegenbeleg zu deiner ersten Annahme. Lies dafür den tatsächlichen
Aufrufer und die zuständige API-/Plattformdokumentation. Prüfe mindestens
einen normalen Ablauf und einen aussagekräftigen Fehler- oder Grenzfall.
Bei unabhängigen Reviewern oder Fachagenten gib jeweils einen klaren
Read-only-Auftrag und protokolliere deren konkretes Urteil. Gib andernfalls
den zweiten eigenen Lesegang als solchen an.

Jeder Befund hat eine ID, Priorität, betroffene Plattform/Zweck,
Datei/Zeile und Aufrufkette, Ist/Soll, Risiko, beobachtete Evidenz und
konkrete Abnahmekriterien. Trenne bestätigte Fehler, plausible Hypothesen,
Dokumentationsdrift und Verbesserungen. Prüfe bei widersprüchlichen
Ergebnissen zuerst, ob Fixture, Beobachter oder Produkt ursächlich ist.
Behandle frühere grüne Tests als Nachweise ihres Umfangs.

## 5. Phase C · Bewiesene Verbesserungen umsetzen

1. Setze bestätigte Datenschutz-, Datenverlust- und Zuordnungsprobleme zuerst
   um. Danach kommen nachgewiesene Robustheits-, Fach-, Performance- und
   Wartbarkeitsverbesserungen. Entferne Ballast, wenn dessen Aufrufer und
   Produktwirkung geprüft sind. Bevorzuge die kleinste fachlich vollständige
   Änderung pro Thema. Ein Architekturwechsel braucht einen belegten Nutzen.
2. Erhalte bestehende Verträge, wo sie für unterstützte Eingaben und
   Aufrufer relevant sind. Prüfe normale und fehlerhafte Teilschritte,
   Wiederholung, paralleles Arbeiten und Cleanup. Die Wiederaufnahme
   innerhalb derselben Version hat Vorrang. Eine versionsübergreifende
   Migration für halbfertige Vorgänge wird erst bei einem belegten und
   unterstützten Nutzerablauf zum Umsetzungsthema.
3. Korrigiere betroffene Tests und Workflows, wenn ihr aktueller Vertrag
   den realen Produktpfad falsch erfasst. Belege Änderungen an Abhängigkeiten
   und CI mit Pin, Änderungsempfehlung des Maintainers, Begründung und
   Gegenprüfung. Nutze die vorhandene Infrastruktur und vermeide
   Routine-Upgrades ohne überprüfbaren Nutzen.
4. Lege überprüfbare, thematisch getrennte Commits an. Aktualisiere bei
   Änderungen die passenden kanonischen Dokumente und verknüpfe Code,
   Anforderungen und Tests. Markiere im Abschlussbericht, welche
   Erkenntnisse umgesetzt, verworfen, offen oder durch fehlende
   Umgebung blockiert sind.

## 6. Phase D · Verifikation des Diffs

- Starte mit fokussierten Fällen am echten Aufrufpfad. Wenn möglich, zeige
  den unterscheidenden Gegenfall am Ausgangsstand und nach der Änderung.
  Miss bei Performanceänderungen unter vergleichbaren Bedingungen und
  prüfe gleichzeitig Fachresultate und Grenzen.
- Führe `git diff --check`, `npm run test:docs` und
  `npm run test:product:headless` aus. Je nach betroffenen Pfaden ergänze
  `npm run test:standalone:conversion`, native Rust-Tests und Clippy,
  den echten isolierten Core-/Paket-Smoke und native Paketprüfungen. Verwende
  die dokumentierte Toolchain und die vorhandenen Produktbefehle, einschließlich
  ihrer Voraussetzungen. Notiere exakte Befehle, Host/Architektur, Commits,
  Befehls-Exitcodes und Ergebnisse.
- Halte lokale, Runner- und echte Zielhostbefunde auseinander. Nutze für die
  Release-Grenze die [formale Abnahmeanleitung](../docs/acceptance/FORMAL_UAT/README.md).
  Wenn etwa ein Mac, eine iOS-Simulatorumgebung oder eine Freigabe fehlt, lege
  den betroffenen Prüfschritt und seine Auswirkung offen. Benenne den
  kleinsten unter diesen Voraussetzungen aussagekräftigen Ersatztest.
- Verfolge jeden geänderten Pfad erneut aus Sicht des betroffenen Anwenders
  oder Aufrufers. Vergewissere dich, dass Architektur-, Format- und
  Datenschutzbehauptungen im Abschlussbericht ihrem tatsächlichen Nachweis
  entsprechen und keine Altbefunde automatisch auf den neuen Commit
  übertragen werden.

## 7. Phase E · Push und Übergabe an Codex

1. Fülle die Unterlagen aus den [Vorlagen](rc178-claude-review/VORLAGEN.md):
   `tasks/rc178-claude-review/ERGEBNIS.md`,
   `tasks/rc178-claude-review/BEFUNDE.md` und
   `tasks/rc178-claude-review/ABDECKUNG.tsv`. Halte bei längeren Arbeiten
   Entscheidung, Umfang und Nachweise im Arbeitsbranch fest. Verwende
   repositoryrelative Pfade und verlinke für veröffentlichbare Nachweise
   genaue GitHub-Commits oder Runs. Übliche lokale Logs bleiben lokal.
2. Pushe den dokumentierten Stand mit
   `git push -u origin HEAD:refs/heads/claude/rc178-standalone-review`.
   Vergleiche danach die Remote-Spitze mit deinem lokalen HEAD. Der eigene
   Arbeitsbranch ist der Übergabepunkt. Die Veröffentlichung als Release,
   eine Änderung am RC178-Tag oder ein Merge nach `main` gehören zur
   späteren Freigabeentscheidung. Ein blockierter Test ist im Bericht
   als solcher zu benennen. Liefere auch bei einem Umgebungsblocker den
   tatsächlich erreichten, geprüften und nachvollziehbar dokumentierten Stand.
3. Gib dem Anwender Branch-Link, Einstiegscommit, geprüften Produkt-/Codecommit,
   veröffentlichten Berichtcommit und den Link zu `ERGEBNIS.md`. Füge hinzu,
   welche Änderungen und Entscheidungen Codex zuerst überprüfen soll. Der
   Anwender reicht diese Angaben an Codex weiter. Codex überprüft danach die
   Remote-Diffs und Gegenfälle selbst und liefert ein unabhängiges Urteil.
   Eine automatische Übergabe oder ein vorweggenommenes Codex-Go ist kein
   Nachweis.

### Abschlusskriterien

- Der Bericht bindet RC178-Baseline, geprüften Änderungsstand und Remote-HEAD.
- Jede Prüfdimension enthält Befunde oder ein begründetes Urteil und eine
  ehrliche Abdeckungsgrenze. Offene Bereiche sind im Register sichtbar.
- Jede umgesetzte Änderung ist einer überprüften Annahme, einem Befund und
  einem passenden Test oder einer ausdrücklich benannten Restprüfung zugeordnet.
- Der Mac-Status trennt Apple Silicon, Intel, Runner und reale Geräte. Die
  iOS-Empfehlung trennt Simulator, physisches Gerät und Distribution.
- Der Übergabebranch ist öffentlich lesbar, auf den tatsächlichen Diff begrenzt
  und frei von privaten Nutzerdaten. Codex kann mit Bericht, Commits und
  ausgeführten Befehlen direkt in die Revalidierung einsteigen.
