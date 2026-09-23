# Mehrdimensionenreview: zwei Produkte und Claude-Hosts

Stand: 23.09.2026 · Kennungsfamilie `PH-20260923` · Reviewbasis
`140f24260ed1bf27a1ac7fad7d73c7f5a08e05a7` (RC139-Quellstand).

Dieser Bericht ist eine datierte Befundaufnahme, kein neuer Produktvertrag und
keine Freigabe. Die einzige Arbeitsliste bleibt [BACKLOG](canonical/BACKLOG.md).
Cowork ist als RC139 aus `46c6fec4722c879989f5c8e3059367241c117c3a` veröffentlicht;
Standalone bleibt RC137 aus `8979d4b2127741c2921cb6f0654fb83d82944845`.
Dokumentkorrekturen und die anschließend beauftragten Quellkorrekturen ändern
keine bereits ausgelieferten ZIPs. Die folgenden PH-Befunde beschreiben die
Ausgangsaufnahme; der [Umsetzungsnachtrag](#umsetzungsnachtrag-23092026) führt
ihren aktuellen Bearbeitungsstand. Historische Aussagen „offen“ oder „kein Fix“
in der Ausgangsaufnahme sind damit kein aktueller Abschlussstatus.
Für die spätere Titel-/Provenienzkorrektur gilt der
[Abschlussnachtrag](#abschlussnachtrag-titel-provenienz-und-referenzübernahme).

## Auftrag und Prüfumfang

Revalidiert wurden Produkt-/Zweckgrenzen, aktive Architektur- und UML-Sichten,
Skill-/MCP-Verträge, Ordnerkonfiguration, Handoff und Recovery, Testaussagen,
Release-/CI-Verknüpfungen und die Eignung von lokalem Claude Code. Zwei
unabhängige Read-only-Teilreviews deckten Produktkanon/Architektur sowie
Plugin-Schnittstellen ab; der Hauptreview prüfte deren konkrete Belege,
aktuelle Herstellerquellen und ausführbare Regressionen.

Das ist **keine vollständige Zeile-für-Zeile-Sicherheitsprüfung jeder Datei**.
Keine echte Claude-Modellsitzung, kein neuer Paketbau, kein neuer macOS-Test
und keine menschliche N3/N4-Abnahme wurden durchgeführt. Synthetische Tests
berühren keine privaten Anwenderdokumente. Die erste Reviewphase änderte weder
Erkennung, Runtime, UI noch ausgelieferte Produktpakete; die danach vom Anwender
beauftragte Implementierung ist im Nachtrag separat dokumentiert.

## Ergebnis und Empfehlung

Die Grundarchitektur ist weiterhin sinnvoll: zwei eigenständige Produkte,
gemeinsamer Verarbeitungskern, getrennte Adapter, Datenräume und Releasezyklen.
Keine permanente Windows-/Mac-Codeaufspaltung und keine zweite Privacy-Engine
für Claude Code. Ein neues Hostprofil ist keine neue Fachimplementierung.

**Zuerst PH-01 beheben, dann Claude Code als begrenzten zusätzlichen lokalen
Hostpilot des bestehenden Plugins qualifizieren.** Cowork nicht ungeprüft
ersetzen. Standalone bleibt der einfache Weg ohne Claude und bietet zusätzlich
reine Markdown-Konvertierung. Ein Wechsel des Claude-Hosts erweitert weder die
Formatfreigabe noch die Datenschutzgarantie.

## Bestätigter Implementierungsdefekt

### PH-20260923-01 · P1 · Private und sichtbare Ordner können kollidieren

Belege: `plugins/data-secure/server/mcp-server.js`, Funktionen
`chooseAndSaveResultFolder` (Basis Zeile 137) und `configurePrivacyFolder`
(Basis Zeilen 196–202); `gateway/common.js`, `storageStatus` und `roots`;
`gateway/privacy-config.js`, `saveConfiguredPrivacyRoot`.

Die Ergebniswahl prüft gegen die aktuelle Privacy-Wurzel. Die spätere
Privacy-Wahl prüft dagegen nur lokale Speichereigenschaften und speichert ohne
Gegenprüfung zum Ergebnisbereich. Beispiel: erst einen lokalen Ergebnisstamm
wählen, danach dessen `DataSecure-Output` als Privacy-Ordner. Dort entstehen
anschließend private Unterordner wie `DataSecure-Export` und
`Needs Visual Review`. Mapping enthält Originalnamen; zurückgehaltene Bilder
gehören ebenfalls nicht in einen mit Claude verbundenen Ergebnisbaum.

Der Teilreview reproduzierte die Handlerannahme mit kontrolliertem Picker und
Persistenzstub. Der Hauptreview prüfte unabhängig die echten read-only
Prädikate: dieselbe synthetische Auswahl liefert `storage_safe:true` und
`visible_result_overlap:true`. Die Schutzfunktion existiert also bereits für
andere Zwecke, wird in dieser Konfiguration aber nicht angewandt. Die
nachgelagerte Rootanlage und Konfigurationspersistenz schließen die Lücke nicht.
Kein echter Anwenderordner wurde umkonfiguriert oder offengelegt.

Abhilfe in **BL-041.19**: eine gemeinsame kanonische Trennungsprüfung für
Privacy-, interne Daten-/Journal- und Ergebniswurzeln; beide Auswahlrichtungen,
Reset und bestehende Konfigurationen beim Auflösen prüfen. Gleichheit,
Vorfahren/Nachfahren, Windows-Großschreibung, alternative Pfadschreibweisen und
Links prüfen. Vor Speicherung und vor privater Anlage fail-closed stoppen,
ohne bestehende Daten zu verschieben oder zu löschen. Reale temporäre
Dateisystemtests plus MCP- und Standalone-Gegenregression verlangen.

**Status: offen, kein Fix in diesem Review.** Bis dahin private Wurzeln und
Ergebniswurzeln strikt getrennt halten; keine breitere Claude-Code-Freigabe.
Der nachgewiesene UI-Einstieg betrifft Cowork. Eine identische Standalone-
Ausnutzbarkeit ist nicht bewiesen: `application-service.js:configureResults`
prüft dort bereits gegen den separaten Datenroot. Eine gemeinsame Korrektur
muss diesen funktionierenden Pfad ausdrücklich erhalten.

## Weitere Befunde und Entscheidungen

### PH-20260923-02 · P1 vor Hostfreigabe · Claude Code braucht eigene Grenzen

`HOST_MATRIX_V1.json` erlaubt lokales Claude Code nur konditional;
`RUNTIME_START_MATRIX_V1.json` verlangt Host-/Pfadauflösung. Der MCP-Server
verwendet stdio und native Picker, keine Cowork-spezifische Transporttechnik.
Skill und Manifest sind grundsätzlich anschlussfähig. Das ist noch kein
benutzerfertiger oder formal abgenommener Code-Hostweg.

Claude Codes Datei-/Shell-/IDE-Werkzeuge sind ein zusätzlicher Zugriffspfad.
Laut [Berechtigungsdokumentation](https://code.claude.com/docs/en/permissions)
sind pfadbasierte Lesesperren keine vollständige Sperre beliebiger indirekter
Shellzugriffe. Die [Bash-Sandbox](https://code.claude.com/docs/en/sandboxing)
ersetzt nicht die Grenzen anderer Werkzeuge und ist auf nativem Windows nicht
verfügbar. Diese Herstellergrenze wird nicht durch DataSecure-Prompts aufgehoben.

**BL-041.20:** dedizierten lokalen Sitzungs-/Berechtigungsvertrag, verbotene
Originalzugriffswege, beobachtete Negativfälle und native GUI-Voraussetzungen
festlegen. Weder `bypassPermissions` noch WSL als pauschale Lösung empfehlen:
die veröffentlichten Plugin-Runtimes unterstützen Windows x64 und macOS
x64/ARM64; `native/runtime/datasecure-node` verweigert Linux. SSH, Container,
WSL und Code im Web sind kein implizit freigegebener Ersatzhost.

### PH-20260923-03 · P2 · Installation und Synchronisierung unterscheiden

Neu geprüft: Anthropic dokumentiert Konto→lokales-Claude-Code-Plugin-Sync ab
2.1.273 mit Claude-Kontoanmeldung. Eine CLI-Installation synchronisiert nicht
zurück. API-Key-Anmeldung gehört nicht zu diesem Sync-Weg.
[Herstellerquelle](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)

Auf diesem Rechner meldet `claude --version` **2.1.267**. Plugin und Marketplace
bestehen hier `claude plugin validate --strict`; das belegt Syntax, nicht Sync,
native Dateiauswahl oder Modellverhalten. Kein Update oder Login wurde ausgelöst.

Die [Plugin-Referenz](https://code.claude.com/docs/en/plugins-reference)
beschreibt gleichnamige lokale Kopien, die eine synchronisierte Kopie
übersteuern können. Mit unseren architekturspezifischen ZIPs entstehen damit
zusätzliche Rollout-Prüffälle: richtige Version, tatsächliche Ladequelle,
richtige OS-/CPU-Runtime sowie mögliche alte lokale Kopie. Das ist ein
Qualifikationsrisiko, kein hier nachgewiesener Sync-Defekt. **BL-041.20** führt
Fresh Install, Update/Rollback, Doppelinstallation und Zielwechsel.

### PH-20260923-04 · P2 · Ergebnisübergabe ist keine Dokumentbibliothek

`gateway/batch-results.js` filtert `analysis_acknowledged`; der lokale Handoff
quittiert vorherige Seiten, und `test-local-handoff-resume.js` erwartet nach
vollständiger Auslieferung keine weiteren Kandidaten. Das ist eine bewusst
implementierte Warteschlange ungelesener Ergebnisse, nicht beliebiges erneutes
Lesen in einer neuen Claude-Aufgabe. Lokal sichtbare Dateien bleiben erhalten.

**BL-041.21 / Produktfrage:** Soll derselbe Stapel in mehreren unabhängigen
Claude-Aufgaben erneut auswählbar sein? Empfehlung: ein ausdrücklich gestarteter,
erneut verifizierter Replay-Weg ohne erneute Anonymisierung; kein automatisches
Lesen und keine Umdeutung von Zustellquittierung in fachliche Kenntnisnahme.
Diese Änderung wird vor Umsetzung mit dem Product Owner entschieden.

### PH-20260923-05 · P2 · Golden-Nachweise gezielt verstärken

`tests/test-adversarial-golden-corpus.mjs` prüft 16 Aufnahmen, verarbeitet in
seiner Privacy-Schleife aber nur zehn direkte Text-/Office-Dateien. PDF/Bilder
werden dort übersprungen. Der separate echte Worker-Test ergänzt insbesondere
Text-PDF, Scan-PDF und JPEG; breite Formate sind also **nicht ungetestet**.

Zwei Assertions des direkten Tests sind zu schwach: Gleichheit von
`registry.lookup` mit demselben Lookup beweist keine Konsistenz über verschiedene
Dokumente. Bei gefundenen Klartextankern genügt außerdem irgendeine
`personProseAmbiguities`-Fundstelle; das ordnet nicht jeden verbliebenen
Identifikator einer tatsächlich blockierten Ausgabe zu. Der Test allein kann
dadurch einen zusätzlichen Leak neben einer korrekten Mehrdeutigkeit übersehen.
Ein aktueller Produkt-Leak ist damit nicht nachgewiesen.

**BL-050.4:** pro Quelldatei Erwartungsanker, Erhaltungsanker und erlaubten
Terminalzustand prüfen; reale Batchveröffentlichung/Reviewgrenze statt nur
Einzelfunktionen; Pseudonyme aus mehreren echten Ergebnissen vergleichen;
beide Zwecke und alle 16 Dateien im paketierten Pfad abdecken. Kontrollierte
Fehler-/Zeitgrenzen dürfen weiterhin gestubbt werden, Parser/OCR und die zu
beweisende Veröffentlichung nicht.

### PH-20260923-06 · P2 · Aktiver Produktvertrag widersprach dem Ist

`PRODUCT.md` begrenzte Cowork in einem späteren Absatz noch auf vier Formate,
obwohl XLSX/PPTX nach DS-093 aktiv sind. Derselbe Abschnitt versprach
Standalone-Teilaufnahme bei unbekannten Formaten, obwohl der gemeinsame
Enumerator atomar ablehnt (DS-100). **Dokumente korrigiert**, Verhalten nicht
geändert: unbekanntes Format bei Aufnahme und Fehler einer schon aufgenommenen
Datei bei Verarbeitung sind verschiedene Phasen.

### PH-20260923-07 · P3 · Release- und Architekturwahrheit

Die pauschale Architekturformulierung „alle Zielpakete aus demselben Commit“
war produktübergreifend missverständlich. Commitgleichheit gilt je
Produktkampagne; RC139-Cowork erzwingt keinen RC139-Standalone-Bau.
README nennt jetzt ausdrücklich beide veröffentlichten Kandidaten und einen
separaten Quellstand. Der Versionssynchronisierer ändert nur den Quellstand,
nicht die Downloadtitel. Bestehender Dokumentationsvertrag prüft die Bindung.
**Korrigiert; kein Versionswechsel und kein neuer Build.**

### PH-20260923-08 · P3 · Bereits erledigte Evidence nicht erneut bestellen

Die aktive Matrixzeile BL-041.15–.18 verlangte einen bereits erfolgten
RC139-Neubau; BL-041.14 sprach noch von laufenden RC138-Gates. Beides wurde
gegen die gebundenen RC139-Nachweise berichtigt. BL-012.8 nennt für den
Sammelreview jetzt AppKit, nicht den weiterhin für Picker eingesetzten
`osascript`-Pfad. Historische Berichte behalten ihre damaligen Aussagen.

### PH-20260923-09 · P2/UX · Neutraler Dateiname schützt nicht den ganzen Baum

Standalone erhält auf Nutzerwunsch Unterordnernamen und legt bei Anonymisierung
die Zuordnungsdatei neben die Ergebnisse. Auch bei neutralen Basisnamen kann
dieser Baum personenbezogene Informationen enthalten. Das ist die bestehende
Produktentscheidung, kein neuer Parserfehler. Nicht den gesamten Laufordner
pauschal als sicheren KI-Upload bezeichnen. Ergebniswarnung und N4 müssen
Dateiinhalte, Ordnernamen und lokale Zuordnung getrennt betrachten.
Weiterführung über **BL-052.1–5**; kein stilles Entfernen der gewünschten Struktur.

### PH-20260923-10 · P2/Evidence · Modelltests und Lieferkette bleiben eigene Gates

Das frühere Eval-Dokument hielt eine Early-Access-Beobachtung vom 01.09. fest.
Die aktuelle [Eval-Dokumentation](https://code.claude.com/docs/en/plugin-evals)
nennt ab 2.1.269 einen veröffentlichten Fall-/Gradervertrag. Unsere lokale
2.1.267 ist darunter. Hilfe ist vorhanden, aber ein echter Lauf wurde nicht
gestartet. Dokumentation aktualisiert; Ausführung bleibt in **BL-041.20**.
Für einen späteren kleinen Pilot: synthetische Fälle, explizites Budget,
`--no-publish`, für echte MCP-Nachweise `--mocks off`, enge Werkzeugfreigaben
und getrennte Modell-/Native-UI-Evidence. Kein pauschaler KI-gestützter Richter
anstelle überprüfbarer Tool-/Statusassertions.

Die vorhandenen 41×3-/12×3-Matrizen bleiben `NOT_RUN`; Paketstart und grüne
Vertragstests ersetzen das nicht. Ebenso bedeutet ein leeres
`npm audit --omit=dev` hier keinen vollständigen Sicherheitsnachweis: der
Root-Lock enthält nur einen Produktionseintrag, während weitere gebündelte
Runtime-/OCR-/Native-Komponenten separat inventarisiert sind. Manuelle
Security-Workflows wurden gelesen, nicht neu ausgeführt. Releasebezogene
Komponenten-/Security-Evidence und deren Aktualität bleiben erforderlich;
kein Anlass für teure Vollscans bei jeder README-Änderung.

## Claude-Hostentscheidung: vorgeschlagene Abnahmereihenfolge

1. PH-01 schließen und mit echten lokalen Dateisystemgrenzen regressieren.
2. Exaktes bestehendes Plugin-ZIP zunächst in **lokalem** Claude Code auf
   Windows und je verfügbarer Mac-Architektur qualifizieren. Kein Source-Node-
   Ersatzpaket, keine neue Engine; explizite Ladequelle und SHA dokumentieren.
3. Eigene Hostfälle: Picker abbrechen, erster Ergebnisordner, kleiner echter
   Stapel, Review, Abschluss, späterer Handoff, Paging/Abbruch, Neustart,
   Terminalfehler ohne Endlosschleife, Direktzugriff-/Upload-Negativfälle.
4. Sync, Versionswechsel, gleichnamige alte Installation und falsche Ziel-CPU
   separat prüfen. Das ist kein Gratis-Nachweis durch einen Manifestvalidator.
5. Erst nach sichtbarer Host-/Modellabnahme entscheiden, ob Code bevorzugter
   technischer Workflow wird. Cowork bleibt für seine Anwender erhalten;
   Standalone wird weder abhängig gemacht noch neu paketiert.

Cloud-Cowork ist laut [aktueller Architektur](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)
der Standard; lokale Sitzungen bestehender Desktop-Deployments bleiben ein
anderer Ausführungsweg. Lokale MCPs laufen nicht in Cloud-Sitzungen. Das bestätigt
DS-078 und ist kein Widerspruch zur lokalen DataSecure-Originalgrenze.

## Tatsächlich ausgeführte Prüfung auf Windows

- Ausgangsstand: sauberes `main`, nach Fetch identisch mit `origin/main`.
- `claude plugin validate` und `--strict` für Plugin und Marketplace: PASS.
- `npm run test:docs:fast`: vor und nach den Änderungen alle 39 Prüffälle
  plus Kanon-/Versionsprüfung PASS; zuletzt 100 Entscheidungen, 24 Epics und
  107 Stories. Ein veralteter fest codierter Kanon-Prüftag wurde durch eine
  Kalenderdatumsprüfung ersetzt; README-Kandidaten werden gegen ihre Bindung geprüft.
- `test-manifest.js`: abschließend 24 PASS; `git diff --check`: PASS.
- `test-mcp-protocol.js`: 66 PASS, echte stdio-Anfragen.
- `test-local-only-handoff.js`: 33 PASS; `test-local-handoff-resume.js`: 20 PASS.
- `tests/manual/cowork-uat-fixtures.js`: vier reale synthetische Dokument-/
  Batch-/Handoff-Gruppen PASS; native Benutzerentscheidung bewusst nicht simuliert.
- `test-product-bootstrap.js`: 3 PASS; `test-standalone-frontend.js`: 28 PASS;
  `test-standalone-history.js`: PASS. Frontend verwendet kontrollierte Hostgrenzen,
  deshalb kein Ersatz für einen echten WebView-/Desktop-Klicktest.
- `test-adversarial-golden-corpus.mjs`: 16 Aufnahmen, neun saubere direkte
  Freigaben und ein sicherer Stopp/Review; Grenzen siehe PH-05.
- `test-standalone-conversion-worker.mjs`: 35 Gruppen PASS mit realem lokal
  paketiertem Konverter, OCR und Privacy-Gate; 100 TXT rund 15,6 Sekunden,
  kein wiederholtes Lesen der großen Runtime. Lokale Messung, kein SLA.
- Unabhängiger Schnittstellenreview zusätzlich: MCP-Inputvalidierung (3),
  Interaktionsvertrag (27 Bindungen), Tooloberfläche (10 normal/17 Support): PASS.
- `npm audit --omit=dev --json`: null gemeldete Einträge; begrenzter Scope wie oben.

Offen bleiben der dokumentierte P1-Fix, echte Claude-Code-/Cowork-Modellläufe,
die vollständige neue Golden-Batch-Abdeckung sowie menschliche Zielhost-/N3/N4-
und Fachabnahmen. Keine Aussage „keine Bugs mehr“ oder Produktionsfreigabe.

## Umsetzungsnachtrag 23.09.2026

Der Product Owner hat die Empfehlung zur ausdrücklichen Wiederverwendung
angenommen und die Korrekturen beauftragt. Drei begrenzte Fachreviews betreffen
Root-/Speichersicherheit, Claude-Übergabe sowie unabhängige Golden-Orakel und
reale Veröffentlichungen. Der Hauptagent integriert die Änderungen und prüft
Produktgrenzen, Kanon, Hostplan und Gegenregressionen. Keine neue Engine,
keine OS-Branches, kein automatischer Wechsel von Cowork zu Claude Code.

| Ausgangsbefund | Quelländerung / Ergebnis |
|---|---|
| PH-01 | Gemeinsame kanonische Roottrennung in beiden Konfigurationsrichtungen, Bootstrap vor privaten Writes und Standalone vor Historienzugriff. Konfigurationsfehler erzeugen feste Ursachen, keine Pfadlogs in unsicheren Verzeichnissen. Alte externe Host-Freigaben sind nicht rekonstruierbar. |
| PH-02/-03/-10 | Eigener 14-Fälle-Claude-Code-Pilot samt maschinenlesbarem Vertrag und read-only CLI-Vorcheck. Struktur PASS; installierte CLI 2.1.267 liegt unter dem Pilotminimum 2.1.273. Kein Update, Login oder kostenpflichtiger Modellaufruf. |
| PH-04 | DS-101: optionales `scope: reuse_completed`, ausdrücklicher Auftrag und verpflichtender nativer Picker auch bei einem Stapel. Erneute Integritäts-/Generationsprüfung, unveränderte ACKs, keine Originalzugriffe oder Wiederanonymisierung. |
| PH-05 | Unabhängiges Golden-Orakel und vollständiger 16-Dateien-Batch für beide Zwecke bis zum sichtbaren Export. Selbst-Lookup und bloßes Ambiguitätslabel gelten nicht mehr als Publikationsnachweis. |
| PH-06/-07/-08 | Produkt-/Format-/Aufnahmeverträge, produktweise Releasebindung, README-/Versionssynchronisation und Evidence-Widersprüche korrigiert; historische Berichte bleiben historisch. |
| PH-09 | Standalone warnt auch bei neutralen Dateinamen vor unveränderten Unterordnernamen und originalhaltiger Zuordnung. Warnung in Verlauf und N4 ergänzt; gewünschte Struktur bleibt erhalten. |

### Zusätzlich durch die schärferen Tests gefundene Defects

- **PH-20260923-11:** Französische Nummer-vor-Straße-Adressen blieben erhalten.
  Geschlossene Straßenformen erkennen jetzt Nummer, expliziten Straßentyp und
  Namen; Tests prüfen mehrere Schreibweisen, angrenzende Prosa, Tabellen,
  Zeilengrenzen und technische Nicht-Adressen. Keine Korpus-Sonderbehandlung.
- **PH-20260923-12:** Entfernen eines führenden Pseudonymmarkers erzeugte im
  Residualscan künstlichen Markdown-Listenkontext und stoppte drei DOCX-Dateien
  fälschlich. Der erste Reparaturansatz ausschließlich auf der intakten
  Markeransicht war ebenfalls fehlerhaft: Er übersah angrenzende Namen und
  Namen nach vielen bereits ersetzten Zeilen. Unabhängige Gegenrepros verlangen
  deshalb beide Sichten und End-to-End-Sicherheitskontrollen, nicht bloß einen
  erfolgreichen Seed- oder Korpusvergleich. Der konservative Stopp des
  namensförmigen Hinweises `KEINE REALDATEN` bleibt bewusst bestehen; die
  riskante Freigabeausnahme wurde verworfen. Das ist eine dokumentierte
  Erkennungs-/Usability-Grenze, kein behobener False Positive. Die technische
  Korrektur wird separat als offene Story **BL-021.3** geführt.
- **PH-20260923-13:** OCR-Dashlisten mit technischem Akronym, Produkt und Standard
  wurden als Kunde/Projekt gebunden und beeinflussten später weitere Dateien.
  Eine enge aus bestehenden Katalogen abgeleitete Formenprüfung verhindert
  dies; explizite Firmenrollen, Rechtsformen und Projektabschnitte bleiben
  geschützt. Gegenfälle prüfen Folgeausgaben mit demselben Pseudonymregister.
- **PH-20260923-14:** Im Gegenreview der neuen Wiederverwendung fehlten
  Diagnoseereignisse vor Sessionanlage; Verifikationsfehler wurden als
  Generationstausch beschriftet. Pickerabbruch/-fehler werden jetzt ohne
  Pfadinhalte protokolliert und feste Ursachen bleiben unterscheidbar.
- **PH-20260923-15:** Der unabhängige Handoff-Gegenreview reproduzierte eine
  Weitergabe aus RAM-Snapshots nach Ablauf einer noch aus der ersten Sitzung
  stammenden Leseberechtigung. Eine neu gestartete Sitzung darf deren Frist
  nicht verlängern; Start, Folgeseiten und asynchron vorbereitete Snapshots
  stoppen jetzt spätestens an der tatsächlichen frühesten Berechtigungsfrist.
  Fehlende/ungültige Fristen werden verweigert; nach Ablauf entstehen keine ACKs.
- **PH-20260923-16:** Die Autoren-Gegenprobe zu PH-12 fand zwei weitere echte
  Namensfreigaben: eine zu breite Negationsausnahme (`KEINE` vor einem Namen)
  und einen Namen in einer verschachtelten Blockquote-Liste. Auch diese Fälle
  gehören als End-to-End-Negativkontrollen zum Fix; ein grüner 16-Dateien-Korpus
  allein gilt ausdrücklich nicht als ausreichender Nachweis. Neue unsichere
  Struktur-/Negationskandidaten gehen ausschließlich ins unabhängige Restgate,
  nicht in eine automatische Personenersetzung. Mehrdeutigkeit stoppt sicher;
  technische Texte werden nicht zur Erlangung eines grünen Tests umbenannt.

Das Vollgate fand außerdem einen veralteten Testaufbau: Der echte MCP-
Annotationstest setzte Privacy- und Ergebniswurzel auf denselben Ordner.
Er verwendet jetzt getrennte temporäre Geschwisterverzeichnisse; die produktive
Trennungsprüfung bleibt aktiv und wurde nicht für diesen Test umgangen.

**PH-20260923-17:** Der anschließende Fehler-Injektionstest deckte eine echte
Lücke im neuen Reservierungsreader auf: Ein natives `close`-Problem im
`finally` konnte die sichere Fehlerübersetzung umgehen. Alle I/O-Ränder der
Rootreservierungen liefern jetzt dieselbe feste inhaltsfreie Storage-Ursache,
auch bei Fehlern im Abschluss-/Aufräumpfad. Die Regression unterscheidet
Fehler am Reservierungs- und am Paketdescriptor: 40 Rootfälle einschließlich
19 gezielter I/O-Fehlerfälle und 26 Paketberechtigungsfälle bestehen.

Zwei Picker-Lifecycle-Tests verwendeten außerdem veraltete Leseberechtigungen
ohne Ablaufzeit. Ihre synthetische Antwort erfüllt jetzt den gehärteten Vertrag;
fehlende Fristen bleiben produktiv abgewiesen. Alle 30 Lifecycle-Fälle bestehen.

### Vorherige Evidenz und Grenzen – vor BL-021.3-Folgefix

Der abschließende zusammenhängende Lauf `npm run test:product` besteht mit
**185 Testdateien (67 Basis + 118 direkte Tests)**, einschließlich beider
Produktprojektionen, Parser-/Privacy-, MCP-, Recovery-, Handoff-, Export- und
nativen Windows-Prozessgrenzen. Die vorherigen Fehlversuche deckten die oben
beschriebenen Testvertrags- und I/O-Defekte auf; erst der letzte vollständige
Lauf ist grün. Zusätzlich besteht `npm run test:docs:fast` mit 101 Entscheidungen,
24 Epics und 108 Stories einschließlich der ausdrücklich offenen BL-021.3.
`git diff --check` ist sauber. Diese Nachweise gelten für den lokalen,
uncommitteten Arbeitsstand, nicht für bereits veröffentlichte Archive.

`test-adversarial-golden-batch.mjs` verlangt **16 Konvertate, 13 anonymisierte
Veröffentlichungen und drei exakt definierte sichere Stopps**, mit echtem
projiziertem Konverter/OCR, Privacy-Gates, Journalen und Exporten. Die DOCX-
Positionen 04–06 stoppen wegen `PERSON_CANDIDATE: KEINE REALDATEN` mit
`RESIDUAL_PII`; der Test akzeptiert weder einen beliebigen anderen Fehler noch
einen zusätzlichen Klartextbefund oder ein dennoch veröffentlichtes Artefakt.
In allen freigegebenen Ergebnissen fehlen die erwarteten Identitätsanker;
Fachanker bleiben; Pseudonyme aus unabhängigen Dokumentstellen passen zusammen;
Quellhashes bleiben unverändert. Nur die konkrete menschliche Entscheidung im
synthetischen Sammelreview wird eingespeist, nicht Parser oder Freigabegrenze.
154 PII-Regressionen bestehen; Pseudonym- und Credential-Gegenprüfungen ergänzen
diesen Korpus. Die eigene End-to-End-Gegenprobe des Hauptreviews prüft zusätzlich
60 Marker-/Negations-/verschachtelte Listenvarianten: alle stoppen mit
`RESIDUAL_PII`, keine davon veröffentlicht einen verbliebenen Originalnamen.
Replay besitzt 30 reale Datei-/Journal-/Pakettests, darunter entfernte Originale,
asynchroner Austausch, Ablauf und unveränderte dauerhafte Quittierungen.

BMP-OCR kann Diakritik/Schreibweise verändern. Normalisierung im Test zum
Inhaltserhalt beweist keine allgemeine OCR-Identitätsauflösung; der betreffende
Fall wird nicht als Nachweis identischer Pseudonyme für unterschiedliche
erkannte Schreibweisen verwendet. Native Dialog-/Modellbedienung und neue
Releasearchiv-/N3-/N4-Evidence sind nicht durch diese E0-Prüfungen erledigt.
Cowork RC139 und Standalone RC137 bleiben die bisherigen veröffentlichten
Kandidaten. Dieser Nachtrag ist keine Behauptung vollständiger Fehlerfreiheit.

## Folgearbeit: Claude-Code-Vorcheck und Kostenentscheidung

Die oben genannten CLI-Versionsblocker beschreiben die erste Bestandsaufnahme.
Anschließend aktualisierte der offizielle `claude update` die lokale CLI von
2.1.267 auf 2.1.280. Versions-, Hilfe-, Plugin- und Marketplace-Vorcheck bestehen.
`claude plugin eval --help` ist erreichbar; es wurde **kein Modelllauf** gestartet.
Der separate Authentifizierungsstatus meldet `loggedIn: false`, `authMethod: none`.
Dies ist keine Aussage über die Anmeldung in Claude Desktop. Geheimnisse oder
Kontodetails wurden nicht in Evidence übernommen.

Der Nutzer legt fest: ausschließlich bereits enthaltene Claude-Abonutzung,
keine API-Tokenkosten oder kostenpflichtige Zusatznutzung. Der lokale Code-Reiter
in Claude Desktop wird ausdrücklich in den Pilot einbezogen, getrennt von
Cowork und CLI. Sein tatsächlich geladenes Plugin, Berechtigungen, Versionen und
Abrechnungsweg sind noch zu beobachten. Die aktualisierte CLI allein beweist
keinen dieser Desktop-Nachweise. Bei unklarer Abrechnung oder erreichtem Limit
bleiben Modelltests gestoppt; keine Kontowechsel oder Credit-Käufe.

Quellen: [Claude Code Desktop](https://code.claude.com/docs/en/desktop),
[Abo und API-Abrechnung](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan),
[Plugin-Evals](https://code.claude.com/docs/en/plugin-evals).

## Folgearbeit: BL-021.3 – fundstellengebundener Restkandidatenreview

Implementierungs- und unabhängiger Datenschutzgegenreview stimmen überein:
eine automatische Hinweis-/Negationsausnahme ist unzulässig. Der neue lokale
Typ `person_residual_ambiguous` verwendet den bestehenden Personenreview,
aber ohne Übernahme einer Entscheidung für gleich geschriebene Stellen.
Nur heuristische, exakt lokalisierbare Restbefunde gelangen dorthin.

`privacy/residual-person-review.js` bindet über einen nicht serialisierbaren
In-Memory-Token die konkrete Fassung, ursprüngliche Fundstelle, ausgeführte
Redaktionen und verschobene finale Bereiche einschließlich Ausgabepräfix.
Ein unverändert zurückgegebener Text allein genügt nicht als Zustimmung.
Mehrdeutige erhaltene Originalfragmente werden nicht dem ersten ähnlichen
Vorkommen zugeordnet. Die finalen Bytes durchlaufen weiterhin die unabhängigen
Prüfungen für direkte Identifier, Personenfelder, Tabellen und bekannte Werte.
Kein Kandidatenwort und keine Freigabeliste wird über MCP ausgegeben oder
dauerhaft gespeichert. Der gemeinsame Recovery-Fingerprint bindet das neue
Modul; beide Produkte verwenden dieselbe Regel, Markdown-only bleibt unberührt.

Gezielte Belege: 154 bestehende PII-Regressionen, 19 neue Residualreview-Fälle,
5 Review-Policy-, 12 Reviewmodell-, 39 Companion- und 50 Gateway-Prüfungen.
Die neuen Fälle enthalten echte Publikation in beiden Produkten, tatsächliche
Companion-Verarbeitung und eine gestartete Windows-Reviewform mit synthetisch
ausgelösten unterschiedlichen Entscheidungen für gleichlautende Kandidaten.
Das ist keine menschliche Sichtbarkeits-/UX-Abnahme. Linux-Adapterlogik wurde
mit eingespeisten menschlichen Antworten geprüft; macOS nur als Vertrag/Script.

Der reale 16-Dateien-Härtetest besteht nun mit **16 Konvertaten und 16
anonymisierten Veröffentlichungen nach lokalem Review**, darunter genau drei
ausdrücklich beibehaltene DOCX-Hinweise. Vor diesen Entscheidungen werden keine
Publikationshandles ausgegeben. Konverter/OCR, Journal, Privacy-Gates und Export
sind real; ausschließlich die menschliche Entscheidung ist synthetisch.
Die erwarteten Identitäts-/Fachanker und Quellenunverändertheit sind geprüft.

Der unabhängige Gegenreview fand in den geprüften Bindungs-/Adapterpfaden keinen
neuen reproduzierbaren Securitydefect. Negative Gegenproben umfassen geänderte
Fassungen, erfundene Bestätigung, neue gleichlautende Fundstellen, fremde
Originalfassung, Headeroffsets, direkte E-Mail und bekannte Originalwerte.
Das ist ein begrenzter Nachweis, keine Garantie vollständiger Fehlerfreiheit.

**PH-20260923-18 / BL-021.4 bleibt offen:** Eine Zweiwort-Versalienüberschrift
wie `SYNTHETISCHER HÄRTETEST` wird vor einem expliziten Personenfeld bereits
in der vorgelagerten Erkennung zu einem Personenmarker. Direkt mit dem echten
Redaktor in `general` und `personnel_profile` bestätigt. Die neue Entscheidung
für den nachfolgenden Disclaimer kann diese frühere Überredaktion nicht
rückgängig machen. Keine Korpuswort-Ausnahme; getrennte kontextbezogene
Überarbeitung mit Namens-/Fachwort-/Folgedokument-Gegenfällen erforderlich.

**Zusätzliche Testbeobachtung:** Der erste vollständige Folgeprüflauf stoppte
im Vier-Prozess-Rootreservierungstest mit Kindprozess-Exit 1; dessen stderr war
noch verworfen. Der Test leitet stderr nun zur Diagnose weiter. Einzelwiederholung
und unabhängige begrenzte Gegenprüfung (6 vollständige Rootgates plus 12 gezielte
Race-Läufe, insgesamt 72 Worker) bestanden. Ursache nicht reproduziert; ein
Inode-Wechsel bei konkurrierender Reservierung ist nur eine Hypothese, kein
behobener Runtimefehler. Die Privacy-Gates wurden nicht gelockert. Den nächsten
vollständigen Lauf und einen erneuten Kandidaten-Smoke separat beurteilen.

### Lokale Folgeprüfung vor BL-021.4 (historischer Zwischenstand)

Der folgende PASS liegt vor der anschließenden Titel-/Provenienzkorrektur.
Den aktuellen Nachweis führt der spätere Abschlussnachtrag; dieser Abschnitt
bleibt als zeitlich eingeordnete Evidence erhalten.

Der erneute vollständige Lauf `npm run test:product` besteht mit **186
Testdateien (67 Basis + 119 direkte Tests)**. Damit ist auch die neue
Residualreview-Erweiterung im zusammenhängenden Produktgate geprüft, nicht
nur in Einzeltests. Der separate echte 16+16-Goldenlauf besteht erneut;
`npm run test:docs:fast` meldet PASS mit 101 Entscheidungen, 24 Epics und
109 Stories. `git diff --check` ist sauber. CLI-Vorcheck und Pilotvertrag
starteten weiterhin keine Modellanfrage und verursachten keine API-Tokenkosten.

Die nicht reproduzierte Root-Race-Beobachtung ist durch diesen PASS nicht als
behoben erklärt. BL-021.4, Desktop-Abrechnungs-/Werkzeugnachweis, menschliche
N3/N4 sowie neue commitgebundene Paket-/Zielhostabnahmen bleiben offen.
Alle Folgeänderungen sind lokal, uncommittet und unveröffentlicht; veröffentlichte
Cowork-RC139- und Standalone-RC137-Archive wurden nicht verändert.

## Folgeauftrag: gezielte Ursachenfixes und einfacher Claude-Ablauf

Die Nutzerpriorität ist ausdrücklich die kleinste tragfähige Lösung, nicht
mehr Regeln, Dialoge oder Testmatrizen. Der aktuelle Hauptskill hat einen
vollständigen direkten Normalstart und lädt Sonderreferenzen nur bei passender
Absicht. Dafür ist kein erneuter Skillumbau nötig. Die Fehlerkorrekturen bleiben
im gemeinsamen Kern; bestehende Tests werden um konkrete Gegenfälle ergänzt.
Eine veraltete Einleitung in TRACEABILITY bezeichnete BL-021.3 noch als offen
und ist auf den bereits nachgewiesenen lokalen Reviewstand korrigiert.

Der erneute Herstellerabgleich stützt knappe Anweisungen, bedarfsgeladene
Referenzen und wenige repräsentative Fehlerprüfungen vor zusätzlicher
Dokumentation. Die Originalzugriffsgrenze bleibt trotzdem erforderlich:
ein lokaler Claude-Host oder manuelle Freigaben garantieren sie nicht allein.
Der lokale CLI-/Pluginvorcheck besteht erneut mit 2.1.280 und null Modellaufrufen.
Desktop-Abrechnung, tatsächliches Werkzeuginventar und native Mac-Bedienung
sind dadurch weiterhin nicht abgenommen.

Quellen: [Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
[Claude Code Best Practices](https://code.claude.com/docs/en/best-practices),
[Cowork sicher verwenden](https://support.claude.com/en/articles/13364135-use-claude-cowork-safely).

### Rootreservierung: belegter Austausch zwischen Prüfung und Öffnen

Der Fachreview hat den zuvor nur vermuteten Ablauf jetzt deterministisch mit
echten Dateien und einem synchronisierten Kindprozess reproduziert: nach
`lstat`, vor `open` ersetzt ein Publisher einen identischen Datensatz atomar.
Die andere Inode führte trotz gültigen Inhalts zur sicheren, aber unnötigen
Ablehnung. Bei abweichender Identität prüft der Reader einmal die aktuellen
Pfadmetadaten gegen den geöffneten Descriptor; keine Retrieschleife oder
neue Sperre. Gewöhnliche Datei, einzelne Verlinkung, Größe, Descriptoridentität
und Hashbindung des Inhalts an Rolle/Dateinamen bleiben vorgeschrieben.

Drei Gegenfälle im vorhandenen Rootgate prüfen identischen Austausch, fremden
Root und Hardlink. Alle 43 Fälle bestehen im Entwicklerlauf und in der
unabhängigen Hauptagentenprüfung; Private-Root-Session, Stable-Data-Root und
Result-Folder-Export bestehen ebenfalls. Der frühere Einzelfehler ohne stderr
ist damit nicht rückwirkend eindeutig erklärt. Der konkrete reproduzierte
Race-Defect ist behoben; instabile oder manipulierte Zustände bleiben gesperrt.

## Referenzreview VECTRA-20260923: anonym

**Auftrag:** reine Bewertung einer externen Ideenquelle für beide Produkte,
keine Freigabe zum Einbau einer weiteren Engine oder neuer Eingabeformate.
Gelesener Stand: `vectranetworks/anonym`, Commit
`bc4646477bfa826cc3e41b42c84322e7bc30734a` (Commitdatum 20.09.2023).
Alle 44 versionierten Dateien wurden vollständig gelesen: README, Lizenz,
Abhängigkeiten, `.gitignore`, kompletter Python-Code, Shell-Testskript sowie
sämtliche Eingaben und Sollausgaben. Ein unabhängiger technischer Gegenreview
bestätigt die nachfolgenden Befunde. Fremde Skripte wurden nicht ausgeführt,
keine Abhängigkeiten installiert und keine Änderungen ins Referenzrepo geschrieben.

### Eignung und sinnvolle Ideen

Das Programm ersetzt ausdrücklich ausgewählte CSV-/JSON-Felder, auch JSON
innerhalb einer CSV-Zelle. Es ist weder ein allgemeiner PII-Detektor noch ein
Office-/PDF-Konverter oder Claude-Adapter. Daher **Ideen übernehmen, nicht die
Produktionsimplementierung integrieren**.

| Idee | Gemeinsamer Kern | Cowork-Plugin | Standalone |
|---|---|---|---|
| Typisierte CSV-Spalten und verschachtelte JSON-Pfade | Denkbarer begrenzter Strukturadapter mit validiertem Importprofil; bestehende Restprüfung bleibt verpflichtend | Wenn tatsächlich benötigt, Profil im lokalen Worker; keine freie Python-/JSONPath-Steuerung durch Claude | Wenn tatsächlich benötigt, einfache optionale Spaltenvorschau; normaler Dateiauswahlablauf unverändert |
| Identische Entität in mehreren Dateien konsistent ersetzen | Bereits vorhandene typisierte, stapelgebundene Registry weiterverwenden, keine zweite Zuordnung | Keine neue Bedienaktion nötig | Keine neue Bedienaktion nötig; reine Konvertierung bleibt unverändert |
| Kleine reale Eingabe-/Erwartungspaare | Gute Vorlage für wenige zusätzliche unabhängige Gegenfälle: gleicher Wert mit anderem Typ, eingebettetes JSON, IP-Schreibweisen | Gemeinsame Testfälle an lokaler Verarbeitungsgrenze, nicht über bezahlte Modelltests | Derselbe Kernnachweis; keine doppelte Testmatrix |

Faker wäre allenfalls ein fest versioniertes Entwicklungswerkzeug zur Erzeugung
fiktiver Testdaten. Es ist keine zusätzliche Produktionsruntime nötig. Ein fester
Testseed darf nicht zum produktiven Schlüssel für personenbezogene Ersetzungen
werden. Für lesbare Ergebnisse bleiben eindeutige Marker wie `PERSON_001`
geeigneter als scheinbar echte Ersatzpersonen. Domänen-/Netzbeziehungen zu erhalten
wäre eine eigene fachliche Entscheidung, nicht automatisch bessere Anonymisierung.

### Konkrete Grenzen und Gegenbeispiele

1. **Typen vermischen sich.** `Field.cache` ist klassenweit gemeinsam und nutzt
   nur den Rohwert als Schlüssel. In der eingecheckten CSV-JSON-Sollausgabe wird
   die konfigurierte ID `z` zu `web-48`: Der Wert war zuvor als Hostname behandelt
   worden. Der Golden-Test konserviert damit einen fachlichen Fehler. Unser
   `batch-pseudonym-registry.js` trennt Typen bereits in Map/HMAC; der vorhandene
   Test `different secrets unlink batches while entity kinds remain separated`
   deckt diese zentrale Invariante ab. Für lesbare Marker bedeutet Trennung die
   getrennte Identitätsbindung, nicht notwendigerweise andere sichtbare Zähler
   in verschiedenen Stapeln.
2. **Fehler lassen Rohdaten bestehen.** Ungültige IPs/Koordinaten werden
   unverändert zurückgegeben, ungültiges eingebettetes JSON bleibt im Ergebnis,
   fehlende CSV-Spalten erzeugen lediglich Warnungen. Diese enthalten teilweise
   die Originalwerte oder ganze JSON-Zellen. Für unsere Freigabe und inhaltsfreie
   Diagnose ungeeignet, besonders an der Claude-Grenze.
3. **Ausgabe ist nicht sicher veröffentlicht.** Ziel ist nur `basename(input)`;
   Öffnen mit `w` kann gleichnamige Ausgaben überschreiben oder bei identischem
   Ein-/Ausgabepfad das Original vor dem Lesen kürzen. Es fehlen atomare
   Publikation und ein verlässlicher Fehlerabschluss; `quit()` ohne Fehlercode
   und abgefangenes `SystemExit` sind kein Integrationsvertrag.
4. **Schwächere Schutzreichweite.** Der IP-Hostanteil bleibt im Code original;
   Koordinaten werden nur um ungefähr ein halbes Grad verändert. Das ist eine
   gezielte Datenverfremdung mit erhaltenen Beziehungen, keine für unsere
   Dokumentfreigabe übernehmbare Schutzgarantie. Faker-Ersatzwerte werden nicht
   auf Kollision oder Gleichheit zum Original geprüft.
5. **Testharness nicht übernehmen.** `tests.sh` vergleicht Dateien, aggregiert
   aber frühere Fehler nicht und prüft Prozesscodes nicht zuverlässig. Negative
   Fälle vergleichen meist nur Konsolentext; `check_not_exists` wird nicht
   aufgerufen. Abhängigkeiten sind ungepinnt, ein Golden enthält lokale
   Traceback-Pfade. Deshalb fachliche Invarianten unabhängig festlegen, nicht
   automatisch neue Ist-Ausgaben zu Soll-Ausgaben erklären.

**Prioritätsempfehlung:** bestehende Regressionen und Produktabnahmen abschließen.
Danach nur bei echtem CSV-/JSON-Bedarf einen kleinen Strukturadapter planen.
Aus diesem Review entstehen weder ein sofortiger Enginewechsel noch zusätzliche
Pflichtdialoge, getrennte Betriebssystem-Codezweige oder eine automatische
Formatfreigabe. Dies ist eine Empfehlung, kein als erledigt verbuchtes Feature.

Quellen am geprüften Commit:
[Quellcode](https://github.com/vectranetworks/anonym/blob/bc4646477bfa826cc3e41b42c84322e7bc30734a/anonym.py),
[Testharness](https://github.com/vectranetworks/anonym/blob/bc4646477bfa826cc3e41b42c84322e7bc30734a/test/tests.sh),
[fehlerhafte Typzuordnung im Golden](https://github.com/vectranetworks/anonym/blob/bc4646477bfa826cc3e41b42c84322e7bc30734a/test/master/csv-json.csv),
[Abhängigkeiten](https://github.com/vectranetworks/anonym/blob/bc4646477bfa826cc3e41b42c84322e7bc30734a/requirements.txt),
[MIT-Lizenztext](https://github.com/vectranetworks/anonym/blob/bc4646477bfa826cc3e41b42c84322e7bc30734a/LICENSE).
Kein fremder Produktionscode wurde kopiert oder eingebaut.

### Revalidierung und enger Umsetzungsumfang

Der anschließende Nutzerauftrag erlaubt sinnvolle Übernahmen ohne zusätzlichen
Produkt-/Bedienoverhead. Der Hersteller-/Sicherheitsabgleich bestätigt die
Begrenzung: Anthropic empfiehlt knappe Skills, bedarfsgeladene Referenzen und
repräsentative Evaluationen; OWASP empfiehlt, sensible Daten nicht roh zu
protokollieren; Faker garantiert reproduzierbare Seeds nur für dieselbe
Generatorversion und warnt ausdrücklich vor Wertkollisionen.

Umsetzung deshalb ausschließlich über bestehende Kernprüfungen und konkrete
Fehlerkorrekturen. Die bereits vorhandenen 40 Registrytests bestehen erneut;
Typtrennung wird nicht durch einen redundanten zweiten Testbau ersetzt. Ein
kleiner CSV-Integrationsgegenfall in `tests/test-csv-source.js` prüft eingebettete
skalare JSON-Inhalte durch den wirklichen Konverter und das Privacy-Gate,
einschließlich des gegenteiligen Markdown-only-Vertrags. E-Mail und IPv4/IPv6
werden ersetzt; Schlüssel, skalare Typen und Fachbegriffe bleiben exakt erhalten.
Alle zwölf CSV-Fälle bestehen. Dies ist keine Freigabe für einen neuen
JSON-Importer. Kein Faker-Paket, keine zusätzliche Runtime, keine JSONPath-
Oberfläche, kein neuer Skillbefehl und kein kostenpflichtiger Modelltest.

Quellen: [Anthropic Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
[OWASP: Data to exclude](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude),
[Faker: Seeding the Generator](https://faker.readthedocs.io/en/master/#seeding-the-generator).

## Abschlussnachtrag: Titel, Provenienz und Referenzübernahme

Dieser Nachtrag ersetzt die vorstehenden Zwischenstände zu BL-021.4 und den
vermeintlich obligatorischen drei DOCX-Hinweisreviews. Er betrifft weiterhin
den lokalen, unveröffentlichten Quellstand, nicht die alten Releasearchive.

### Ursachen und kleinste Korrektur

- **Titel statt Personenidentität:** Eine rein typografische konkurrierende
  Versalienhypothese wird vor Aliasbindung lokal entschieden. Explizite
  Personenfelder, starke bekannte Namen und Folge-Dokumente bleiben geschützt.
  Schwache Dashlisten dürfen unentschiedene Titel auch nicht als Kunde/Projekt
  festschreiben. Kein Hinweiswort oder Korpustitel steht in einer Runtime-Freigabeliste.
- **Erfundener Absatzkontext:** Nach Maskierung eines bereits anonymisierten
  Namens konnte „arbeitet bei“ aus dem folgenden Absatz den vorherigen Hinweis
  zu einem neuen Personenkandidaten machen. Der Beschäftigungskontext darf
  jetzt keine Absatzgrenze überschreiten. Echte Softwraps vor und innerhalb
  des Prädikats bleiben unterstützt (LF/CRLF); ein einzelner mehrdeutiger
  Umbruch bleibt konservativ reviewpflichtig. Der Hauptgegenreview hat eine
  zunächst zu strenge Zeilengrenze vor Abschluss verworfen und korrigieren lassen.
- **XLSX-Herkunftszuordnung:** Die Vorschau enthielt noch `<br>` aus einer
  Formelzelle, während die Engine schon die kanonische Textdarstellung nutzte.
  Reservierung, Vorschau und Engine verwenden jetzt dieselbe Darstellung.
  Unsichere Zuordnung wird nicht durch gelockerte Herkunftsprüfung übergangen.
- **Wiederholte Normalisierung:** Die Gegenprüfung fand dabei einen zusätzlichen
  Defect: entitycodierte sichtbare HTML-Beispiele wurden beim nächsten Durchlauf
  als echte Tags gelöscht. Solche Beispiele bleiben nun escaped und inert;
  echte Tags/Kommentare werden weiterhin entfernt und entitycodierte
  Identifikatoren weiter geprüft. Kein wiederholtes Normalisieren bis zum
  Inhaltsverlust und kein Überspringen eines Privacy-Gates.
- **Exakte Fundstellen:** Tabellenoffsets berücksichtigen CRLF und gemischte
  Zeilenenden. Gleichlautende Stellen erhalten keine Gruppenfreigabe.
  Wiederholte Quellfragmente werden nur bei vollständigen, geordneten,
  disjunkten Kopien gleicher Anzahl zugeordnet; fehlende/zusätzliche Fragmente
  bleiben gesperrt. Formel-Escapes außerhalb einer exakt bestimmbaren Zelle
  verhindern ihren Review nicht mehr; mehrdeutige Pipes bleiben geschützt.

Zwei unabhängige technische Teilreviews und die Hauptgegenprüfung haben die
Ursachen sowie ihre Sicherheitsgegenfälle revalidiert. Die Normalformkorrektur
ist im bestehenden Baustein, die strukturierte CSV-Ergänzung im bestehenden
Test umgesetzt. Keine zusätzliche Engine, kein Importdialog, keine neue
Abhängigkeit, kein Claude-Werkzeug und keine Änderung am Markdown-only-Zweck.

### Ausführbare Nachweise und verbleibende Grenzen

- **16 reale Konvertierungen + 16 anonymisierte Publikationen bestanden**
  (`dist/ph-20260923-heading-golden-final6.log`). Beide XLSX-Positionen sind
  enthalten. Ausgewählte Identitäts-/Fachanker, erhaltene technische Titel,
  dokumentübergreifende Pseudonymkonsistenz innerhalb desselben Stapels,
  Quellenunverändertheit und exakter sichtbarer Export sind geprüft.
  Konkurrierende Titel/Personen werden im Test ausdrücklich entschieden;
  die drei durch Absatzmaskierung erfundenen DOCX-Hinweisreviews entfallen.
- **155 PII-, 25 lokale Review-, 43 Root-, 12 CSV- und 40 Registryfälle**
  bestanden. Die Reviewtests erreichen echte Paketfreigabe beider Produkte;
  die menschlichen Antworten sind synthetisch, keine behauptete native UAT.
- **Abschließende vollständige Produktsuite bestanden: 186 Testdateien**
  (67 Basis + 119 direkte Tests; `dist/ph-20260923-product-final.log`). Dieser
  Lauf wurde erst nach den letzten Absatz-/Kanonisierungskorrekturen gestartet
  und gilt damit für den gesamten beschriebenen Quellblock.
- **Docs-/Versions-/N3-/N4-Vertragsprüfung bestanden.** Kanon, Backlog,
  Evidence-Matrix, Traceability und die menschliche Checkliste sind auf die
  neuen Quellverträge abgestimmt; alte Evidence bleibt historisch gebunden.

Die inhaltsgleichen wiederholten Fragmente und technische Fachanker beweisen
keine vollständige Semantik oder OCR-Genauigkeit. Neues commitgebundenes Paket,
native macOS-/Desktopbedienung, Claude-Modellrouting und menschliche N3/N4-
Abnahme bleiben offen. Kein Modellaufruf und keine API-Tokenkosten entstanden.
Alle Änderungen bleiben lokal/uncommittet; kein Releasearchiv wurde verändert.

## RC140-Vorabreview vor Commit und Paketbau

Der vorstehende Abschlussnachtrag dokumentiert seinen damaligen lokalen Stand.
Ein zweiter unabhängiger Read-only-Review fand vor dem RC140-Versionsschnitt
einen weiteren Vertragsfehler: `reuse_completed` bot auch noch nie oder nur
teilweise an Claude übergebene Stapel an. DS-101 meint ausschließlich
**vollständig zugestellte und quittierte** Cowork-Stapel. Discovery,
Generationsprüfung und Ergebnisliste erzwingen diese Bedingung nun gemeinsam;
eine nachträgliche Änderung der Zustellquittung entwertet die gewählte
Generation. Unzugestellte Ergebnisse bleiben im Standardpfad. Der echte
Journal-/Paket-/Picker-Gegentest prüft beide Nicht-Replay-Fälle, unveränderte
Quittungen und den Seitenwechsel (30 Fälle). Zielarchitektur und Dokumentindex
sind entsprechend nachgezogen.

Das unabhängige Privacy-Gegenreview fand keine weitere reproduzierbare Lücke
in Residualprüfung, Deferred-Review, Produkttennung oder Paketprojektion.
Seine Releasehinweise wurden als Gates behandelt: die drei neuen produktiv
importierten Module und alle neuen Tests sind für den Commit vorgesehen; der
ressourcenintensive 16+16-Golden-Batch-Test wurde auf RC140 ausdrücklich erneut
grün ausgeführt. Die vollständige Produktsuite bestand anschließend auf dem
endgültigen RC140-Quellstand mit 67 Basis- und 119 direkten Testdateien;
Version, Kanon, N3/N4-Verträge und `git diff --check` bestanden ebenfalls.
Diese Quelltests sind keine neue native Zielhost-, Claude-Modell- oder
menschliche Freigabe. Erst commitgebundene, verifizierte ZIPs dürfen als RC140-
Kandidaten bezeichnet werden.

## RC140-Paketgate: verworfener erster Commit

Der erste gepushte RC140-Commit `0d226c7b97430956b104efad9199bca991fab417`
ist **kein Paketkandidat**. Das Windows-Releasegate fand im Root-Test eine
lexikalische Temp-Pfad-Aliasannahme: Der produktive Root-Check verweigerte den
nicht kanonisierten Testpfad zu Recht. Der Fixture-Root wird nun vor der
Prüfung über `realpathSync.native` kanonisiert. Der lokale Root-Test bestand
danach auch unter der paketierten Node-22-Laufzeit.

Die erste lokale PKG-04-Vorprüfung fand eine zweite veraltete Testannahme:
Ein mehrdeutiger Personenname im Konvertertest wurde nach F7 korrekt als
`PERSON_CANDIDATE` in den lokalen Review geleitet, während der Test noch eine
direkte Freigabe erwartete. Der Test prüft nun ausdrücklich den nicht
veröffentlichten Review-Entwurf und seine Residualdiagnose; der separate
16+16-Golden-Batch-Test belegt den echten Publikationsweg nach Entscheidung.
Die Konvertergruppe (35 Fälle) bestand danach. Die vier bereits gestarteten
Remote-Workflows des ersten Commits wurden abgebrochen; ihre Ergebnisse sind
keine RC140-Evidence. Ein neuer Quellcommit und alle commitgebundenen Gates
sind erforderlich, bevor ein RC140-Archiv veröffentlicht wird.

## macOS-Installationsreview vor RC140

Ein zusätzlicher unabhängiger Review des Intel-/ARM-Paketpfads fand keinen
statisch reproduzierbaren Bundle-Defekt: der Workflow prüft Signatur und
Architektur vor und nach dem ZIP sowie den nativen IPC-Start. Er prüft jedoch
**nicht** den Browser-Download mit Finder-Quarantäne und Gatekeeper. Die
macOS-Anleitung und README benennen jetzt den ZIP-Unterordner, die getrennte
äußere `.zip.sha256`, den erst nach Blockierung sichtbaren „Dennoch öffnen“-Weg
und nicht zu umgehende Schadsoftware-/Beschädigt-Warnungen. Die sichtbare
Installation auf einem echten Intel- und ARM-Mac bleibt ausdrücklich UAT; für
eine konkrete Fehlersuche ist die genaue Meldung des betroffenen Macs nötig.

## Zweites Windows-Releasegate: sichtbarer Export im Fortsetzungstest

Der Windows-Releaseworkflow aus `787ae4ed1a64e382176df632cd858f5ac92784c3`
stoppte vor dem Paketbau: 14 gemischte Fortsetzungsfälle meldeten nach dem
Review-Ereignis null sichtbare Ergebnisse. Ein unabhängiger Code-Gegenreview
führte dies auf eine zweite, nicht kanonisierte `os.tmpdir()`-Fixture zurück.
Die produktive Ergebniswurzel lehnt den Alias sicher ab; das synthetische
„export“-Ereignis allein hatte die fehlende sichtbare Publikation im Test
verdeckt. Der Test verwendet nun den physischen Pfad und prüft zusätzlich
die konfigurierte Ergebniswurzel sowie den tatsächlichen `visibleExportStatus`.
Die 22 Fortsetzungsfälle und die schnellen Dokumentationsverträge bestanden
lokal erneut. Auch dieser Zwischencommit bleibt **nicht veröffentlichbar**;
Windows-Releasegate und alle Pakete müssen aus dem folgenden endgültigen SHA
neu laufen.

## Drittes Windows-Releasegate: Fixture-Aliasfamilie

Das Releasegate aus `8002aa6247cb0d72de7fd158df8b0f1a7c0d143a`
bestätigte die Fortsetzungskorrektur mit 22/22 Fällen, stoppte aber als
nächstes im Standalone-Historientest: Die Fixture erzeugte ihren Ergebnisordner
noch über die nicht-native Temp-Pfadschreibweise. Ein unabhängiger Audit der
release-erreichbaren Tests identifizierte dieselbe Konstruktion in weiteren
Ergebnisordner-/Markdown-/Sidecar-Fixtures. Nur diese synthetischen Wurzeln
werden nun über `realpathSync.native` kanonisiert; die produktive
Pfad-/Reparse-Sperre bleibt unverändert. Der Historientest prüft zusätzlich
die tatsächlich akzeptierte Ergebniswurzel. Alle betroffenen Testgruppen
bestanden lokal; der Windows-Runner muss sie aus einem neuen Commit erneut
bestätigen. Die parallel gestarteten Pakete des vorherigen SHA sind nicht als
Release-Evidence verwendbar und wurden, soweit noch aktiv, abgebrochen.

## Viertes Windows-Releasegate: Prozess-Startidentität

Der Runner aus `cd47a60a297bebeb67d05f0247b58bf58635c645` passierte die
Wurzel- und Fortsetzungstests, stoppte aber später beim echten
`claimLocalBatchExecutor(process.pid)` im Historientest. Der unabhängige
Gegenreview lokalisierte die Abhängigkeit von einem frischen Windows-PowerShell-
Prozess zur Startzeitabfrage: zwei Sekunden Timeout und 256 Byte Puffer waren
auf einem belasteten Zielhost zu knapp. Die Anfrage bleibt streng begrenzt,
erhält aber acht Sekunden und 4096 Byte; das gelesene Ergebnis bleibt ein
exakter numerischer Startzeitwert. Unbekannte Identität und PID-Wiederverwendung
bleiben **fail-closed**. Ein echter Selbstprozess-Test läuft auf Windows mit
System- und paketierter Node-22-Laufzeit grün, ebenso die Historie. Der neue
Windows-Runner muss diese Verfügbarkeitskorrektur bestätigen, bevor erneut
Pakete gebunden werden.
