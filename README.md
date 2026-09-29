# GBH DataSecure – Standalone macOS RC141 · Windows/Linux und Cowork RC140

Quellstand: 3.2.0-rc142

RC141 enthält die Mac-Nachreviewkorrekturen: Standalone für Intel und Apple
Silicon wurde nativ gebaut und mit Konvertierung, Anonymisierung, Zuordnung,
Verlauf und LaunchServices geprüft. Die unveränderten ZIPs samt Prüfsummen sind
im [dauerhaften RC141-Mac-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)
veröffentlicht, aus Quellcommit `1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542`.
[Bestandener Mac-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/35875613438)
und [Commitbindung mit exakten Pakethashes](docs/REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).
Standalone Windows/Linux und sämtliche Cowork-Pakete bleiben auf RC140.

Die Überschrift nennt zwei getrennte Produkte. Auch bei gleicher RC-Nummer
bleiben ihre Pakete und Abnahmen getrennt. Ein neuer Quellstand aktualisiert
bestehende Downloads nicht automatisch.

Der letzte gemeinsame Vorabrelease beider getrennten Produkte wurde als RC140 aus Quellcommit
`814bc50e3d754224cd95b6fa91f122dd45f48487` veröffentlicht. Standalone
bestand Windows-PKG-04/INT-13 sowie native Paketprüfungen auf macOS Intel,
Apple Silicon und Linux x64. Cowork bestand native Paketprüfungen auf Windows
x64, macOS Intel und Apple Silicon; Windows-Normal und -Debug sind an die
UAT-Vorlage gebunden. Menschliche N3/N4-, Mac-Fresh-Install- und Cowork-
Modellabnahmen bleiben offen. RC140 ist keine Produktionsfreigabe.

DataSecure de-identifiziert lokale Geschäftsdokumente, bevor Claude deren Inhalt
verwendet. Originale werden über einen Betriebssystemdialog gewählt, nur lesend
verarbeitet und niemals automatisch verändert oder gelöscht. Claude erhält nur
freigegebene Markdown-Ergebnisse.

## Standalone-App installieren (Windows, macOS und Linux)

Für die Standalone-App werden **weder Claude noch Cowork, Node.js, Python oder
Rust** benötigt. Das zur eigenen CPU passende Paket vollständig entpacken und
nicht direkt aus dem ZIP starten:

**[macOS: RC141-Pakete und Prüfsummen herunterladen](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)** ·
**[Windows/Linux und Cowork: RC140-Pakete und Prüfsummen](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140)**

**Mac-Kompatibilitätshinweis:** Der erneute Paketreview hat in den veröffentlichten
Standalone-RC140-ZIPs einen Helfer mit höherer Mindestversion gefunden: Intel
verlangt macOS 15, Apple Silicon macOS 14. Die bisherige Angabe 13.5 war für
diese ZIPs falsch. Für Mac die unten verlinkten RC141-ZIPs verwenden:
ihr Binärvertrag ist für macOS 13.5 geprüft; ein realer Lauf auf 13.5 bleibt offen.
Die RC140-Downloads werden nicht verändert. Die Mac-Pakete bleiben interne,
ad-hoc-signierte Piloten ohne bestätigte Finder-/Gatekeeper-Abnahme.

- **Windows 10/11 x64:**
  [DataSecure-Standalone-3.2.0-rc140-windows-x64.zip](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/DataSecure-Standalone-3.2.0-rc140-windows-x64.zip)
  herunterladen, vollständig entpacken und
  `DataSecure Standalone.exe` doppelklicken. Microsoft Edge WebView2 muss als
  Windows-Systemkomponente vorhanden sein. [Ausführliche Windows-Anleitung](apps/datasecure-standalone/START-WINDOWS.md)
- **Mac mit Intel-Prozessor:**
  [DataSecure-Standalone-3.2.0-rc141-macos-x64.zip](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc141/DataSecure-Standalone-3.2.0-rc141-macos-x64.zip)
  herunterladen, die separate `.zip.sha256` derselben Release-Seite prüfen,
  im Finder entpacken, den enthaltenen gleichnamigen Ordner öffnen und erst
  daraus `DataSecure Standalone.app` nach **Programme** ziehen.
- **Mac mit Apple Silicon (M1 oder neuer):**
  [DataSecure-Standalone-3.2.0-rc141-macos-arm64.zip](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc141/DataSecure-Standalone-3.2.0-rc141-macos-arm64.zip)
  herunterladen und genauso installieren.
  Die Architektur zeigt **Apple-Menü → Über diesen Mac**. RC141 wurde auf
  macOS 15 (Intel) und macOS 14 (ARM) ausgeführt; macOS 13.5 ist die deklarierte,
  in allen nativen Komponenten geprüfte Mindestversion (siehe Hinweis oben).
  [Ausführliche macOS-Anleitung](apps/datasecure-standalone/MACOS-START.md)
- **Linux x64 mit glibc:**
  [DataSecure-Standalone-3.2.0-rc140-linux-x64-glibc.zip](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/DataSecure-Standalone-3.2.0-rc140-linux-x64-glibc.zip)
  vollständig entpacken, die enthaltene AppImage ausführbar machen und starten.
  Dieses Paket ist technisch nativ geprüft; die sichtbare Linux-UAT ist offen.

Die macOS-Pakete sind interne, nur ad-hoc-signierte Piloten: Der tatsächliche
Browser-/Finder-/Gatekeeper-Installationsweg auf Intel und Apple Silicon ist
noch nicht abgenommen. Sie sind nicht mit einer Apple Developer ID signiert
oder notariell beglaubigt. Falls macOS den ersten Start wegen fehlender Identifizierung oder
Notarisierung blockiert, danach unter **Systemeinstellungen → Datenschutz & Sicherheit**
bei DataSecure **Dennoch öffnen** wählen und die Rückfrage mit
**Öffnen** bestätigen. Bei „beschädigt“ oder Schadsoftwarewarnung nicht
umgehen; genaue Meldung und Prüfsumme kontrollieren. Gatekeeper nicht global
deaktivieren.
Für eine reibungsarme breite macOS-Verteilung sind Developer-ID-Signierung,
Notarisierung und ein Fresh-Install-Test des heruntergeladenen Pakets nötig.
Vor einem formalen Test immer Paketname und veröffentlichte SHA-256-Prüfsumme
mit dem Kandidatenmanifest vergleichen.

## Wofür DataSecure gedacht ist

DataSecure ist nicht nur ein Anweisungs-Skill oder ein einzelner PII-Detektor,
sondern ein lokales Privacy-Gateway für die gesamte Dokumentreise:

**lokal auswählen → Struktur prüfen → kontextbezogen de-identifizieren →
Restbefunde prüfen → lokal dokumentieren → Ergebnisse später kontrolliert an
Claude übergeben**

Das Plugin verbindet dabei Eigenschaften, die bei reinen Skills oder
Detektor-Bibliotheken erst zusätzlich gebaut werden müssten:

- Originalbytes, Pfade, Dateinamen und Bildpixel bleiben außerhalb von Claude.
- Unsichere Formate, Containerstrukturen oder Restbefunde stoppen fail-closed.
- Fachlich benötigte Rollen, Skills, Technologien und Zertifizierungen sollen
  erhalten bleiben, während direkte Identifikatoren ersetzt werden.
- Stapel sind fortsetzbar und verwenden innerhalb eines Stapels konsistente,
  nicht stapelübergreifend verknüpfte Pseudonyme.
- Claude liest Ergebnisse nicht automatisch, sondern erst nach einem späteren
  ausdrücklichen Auftrag als erneut verifiziertes Markdown.

Die Skills steuern diesen einfachen Ablauf und erklären seine Grenzen. Die
technische Datenschutzgrenze bildet der lokale Plugin-MCP, nicht der Skilltext.

Für einen konkreten Supportfall kann IT ein getrennt gekennzeichnetes Debug-ZIP
installieren. Es nutzt dieselbe Engine und ergänzt ausschließlich eine manuell
aufrufbare, inhaltsfreie JSON-Ablaufspur; Rohkommunikation, Dokumentdaten, Namen,
Pfade und Tokens werden nicht protokolliert. Das normale Plugin bleibt frei davon.

## Cowork-Plugin: aktueller Umfang

Der aktuelle Cowork-Kandidat steht im
[RC140-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140)
bereit:

- [Windows x64 – normales Plugin](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc140.zip)
- [Windows x64 – getrenntes Debug-Plugin](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/DataSecure-Privacy-Preflight-windows-x64-debug-v3.2.0-rc140.zip)
- [macOS Intel](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/DataSecure-Privacy-Preflight-macos-x64-v3.2.0-rc140.zip)
- [macOS Apple Silicon](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/DataSecure-Privacy-Preflight-macos-arm64-v3.2.0-rc140.zip)
- [Windows-UAT-Vorlage – alle Modellgates `NOT_RUN`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/DataSecure-Cowork-UAT-Evidence-v3.2.0-rc140.zip)
- [SHA-256-Prüfsummen](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc140/SHA256SUMS)

RC138-/RC139-Archive und ihre damaligen UAT-Vorlagen bleiben historische Evidenz und
werden nicht neu gebunden. Für RC140 gelten die erneuerten Nachweise in der
[Release-Anleitung](docs/RELEASE.md); die Windows-UAT-Vorlage ersetzt keine Mac-Abnahme.

Das passende Paket vollständig herunterladen und als lokales
Claude-Desktop-Plugin installieren; es ist nicht für Cloud-Cowork oder Claude
im Browser bestimmt. Das Debug-Paket nur für einen ausdrücklichen Supportfall
installieren. Die UAT-Vorlage ist keine bestandene Abnahme.

| Funktion | Stand |
|---|---|
| Eingaben | TXT, Markdown, CSV, DOCX; XLSX und PPTX über lokale Markdown-Extraktion |
| sicher gesperrt | PDF, Scan-PDF und eigenständige Bilder |
| Stapel | bis 200 Dateien, zusammen höchstens 500 MiB |
| Bilder in DOCX | Pixel bleiben lokal; kein auswählbarer Bildmodus |
| Ausgabe | freigegebenes Markdown im einmalig gewählten lokalen Ergebnisordner; Mapping bleibt privat |
| Speicherung | lokale Arbeits-/Reviewkopien ohne Schlüsselbund oder Passwort |
| automatische Aufbewahrung | 0–14 Tage nur für temporäre Arbeits-/Reviewdaten |

Quellen/Originale und fertige Exporte werden niemals automatisch gelöscht.
Passwortgeschützte oder verschlüsselte Eingaben werden nicht entschlüsselt, sondern
sicher gestoppt und lokal gesondert gemeldet.

Die eigenständige Standalone-App besitzt einen bewusst weiteren lokalen Umfang:
Sie konvertiert TXT, Markdown, CSV, DOCX, XLSX, PPTX, PDF/Scan-PDF sowie
PNG/JPEG/BMP nach Markdown. Im Anonymisierungsmodus laufen TXT, Markdown und CSV
direkt; DOCX und die breiten Formate werden genau einmal lokal nach Markdown
extrahiert und anschließend mit demselben Privacy-Core anonymisiert.
DOCX-Kopf- und Fußzeilen werden weiterhin vollständig auf sichere Struktur
geprüft. Reine Markdown-Konvertierung erhält sie; Cowork- und
Standalone-Anonymisierung geben sie sowie ausschließlich dort referenzierte
Bilder nicht aus. PDF-/Scan-PDF-Seitenränder werden nicht unsicher geraten oder
automatisch abgeschnitten.

## Einfacher Cowork-Ablauf

1. Das zielsystemspezifische Plugin-ZIP installieren; Claude Desktop neu
   starten. Der private Marketplace wird dasselbe Produkt liefern; seine
   selbsttragende Projektion ist noch nicht freigegeben.
2. In einer neuen Cowork-Aufgabe der **geöffneten Claude-Desktop-App**
   **„Dateien anonymisieren“**
   schreiben oder den Skill `gbh-datasecure-dokument-anonymisieren` wählen.
   Dafür ist eine **lokale Cowork-Sitzung** eines bestehenden Desktop-
   Deployments erforderlich. In einer Cowork-Sitzung in der Cloud laufen lokale
   MCP-Server nicht; auch eine geöffnete Desktop-App ändert das nicht.
3. Nur beim ersten Lauf einen **dedizierten lokalen Ergebnisordner** wählen, der
   ausschließlich für freigegebene Ergebnisse bestimmt ist. Originale bleiben
   außerhalb jedes mit Cowork verbundenen Ordners. Optional kann der dedizierte
   Ergebnisordner innerhalb des bereits verbundenen Cowork-Ordners liegen, wenn
   die Ergebnisse anschließend direkt ausgewertet werden sollen. DataSecure merkt sich die
   ausdrückliche Wahl auf diesem Gerät und legt dort `DataSecure-Output` an; ein
   späterer Cowork-Projektwechsel ändert das Ziel nicht heimlich.
4. Dateien im lokalen Mehrfachpicker wählen und einmal **„Öffnen“** klicken.
   Bei allen späteren Läufen beginnt der Ablauf direkt mit dieser Quellauswahl.
5. Klare Dateien werden ohne weiteren Dialog abgeschlossen. Nur bei echten
   Mehrdeutigkeiten erscheint ein lokaler Sammelreview mit den direkten Aktionen
   **„Zertifikatsanbieter behalten“** und **„Organisation anonymisieren“**.
6. Die lokale Abschlussmeldung mit **„Ergebnisse öffnen“** verwenden. Sie öffnet
   genau den Laufordner dieses neuesten Cowork-Stapels. Ist der aktuelle Lauf
   noch aktiv, fehlgeschlagen oder noch nicht vollständig exportiert, wird kein
   älterer Ergebnisordner ersatzweise geöffnet. Im
   Cowork-Ergebnisordner liegen ausschließlich neutrale freigegebene Markdown-
   Dateien; Originalnamen, Mapping, Review und Recovery bleiben privat. Die
   eigenständige Standalone-App ergänzt bei der **Anonymisierung** lokal im
   jeweiligen Laufordner `DataSecure-Zuordnung.csv`, damit Anwender Quelle und
   Ergebnis ohne einen versteckten AppData-Pfad zuordnen können. Standalone lässt
   dafür pro Stapel neutrale Dateinamen (Standard) oder den Quellbasisnamen mit
   `-anonymisiert` wählen. Jede
   Zeile verweist auf eine tatsächlich erzeugte Datei; gestoppte Quellen stehen
   in Abschluss und Diagnose, nicht in dieser Zuordnung.
7. Erst danach bei Bedarf ausdrücklich um die Auswertung der fertigen Ergebnisse
   bitten.

Bei einer Ordnerauswahl werden alle Unterordner sicher geprüft. Überschreitet der
Baum die Datei-/Größengrenze oder enthält er ein gesperrtes Format, meldet
DataSecure die Auswahl verständlich zurück und startet keinen Teilstapel.

Die eigentliche Verarbeitung läuft lokal und offline. Cowork ist der bequeme
Einstieg und kann die freigegebenen Markdown-Ergebnisse anschließend auswerten;
die Anonymisierungsengine ist davon fachlich getrennt. Die eigenständige
Desktop-Oberfläche ohne Claude/Cowork wird als Engineering-Pilot entwickelt und
verwendet dieselbe Engine und dieselben Prüfregeln. Das Mapping gilt nur für
Anonymisierung; reine Markdown-Konvertierung behält die Quellbasisnamen und
benötigt keine Zuordnungsdatei.

## Standalone ohne Claude – Entwicklungsstand

Standalone ist ein **eigenes, noch nicht freigegebenes Produkt** mit derselben
lokalen DataSecure-Engine. Ziel ist eine gewöhnliche Desktop-App: Dateien oder
Ordner wählen, einmal starten, nur bei echten Mehrdeutigkeiten gesammelt prüfen
und den Ergebnisordner öffnen. Tauri 2 ist ausschließlich die kleine native
Fenster- und Dialoghülle. Rust, Node und Python sind Buildwerkzeuge beziehungsweise
gebündelte Laufzeiten und werden nicht auf Anwenderrechnern installiert.

Die Standalone-Auswahl ist auch per Drag-and-drop möglich; erst der Startknopf
beginnt die Verarbeitung. Vorher lassen sich einzelne Dateien entfernen oder
die gesamte Auswahl leeren. Neue Stapel erhalten lesbare, über alle Dokumente
gleichbleibende Kennungen wie `[PERSON_001]` und `[UNTERNEHMEN_001]`. Diese
Nummern gelten nur im jeweiligen Stapel; bestehende v1-Ausgaben und das
Claude-Plugin behalten ihr bisheriges Kennungsformat.

Standalone öffnet eine **Startseite** mit beiden Funktionen, ohne vorausgewählte
Betriebsart. **Nur in Markdown umwandeln** wählen, Dateien auswählen oder
hineinziehen, **Starten**. Der **Verlauf** zeigt die letzten 20 Verarbeitungen
mit jeweils eigenen Aktionen für Ergebnisse, Zuordnung und mögliche Fortsetzung.
Ein Abschluss wechselt die Ansicht nicht automatisch. Nach einem Neustart bleibt
die aktuelle Prozesskarte frei; alte fortsetzbare Läufe stehen ausschließlich
in ihrer Verlaufszeile. Als solche belegte Office-Besitzerdateien
`~$*.docx/xlsx/pptx` werden bei rekursiver Ordneraufnahme gezählt und
übersprungen; ein echtes OPC-Dokument wird nicht nur wegen seines Namens
verworfen. TXT, Markdown, CSV, DOCX,
XLSX, PPTX, Text-PDF, Scan-PDF und PNG/JPEG/BMP werden lokal verarbeitet.
Die App bringt Konverter und deutsche/englische OCR-Modelle mit. Ergebnisse
liegen in `DataSecure-Markdown/Lauf-…` unter dem gewählten Ziel. Bei einer
Ordnerauswahl bleibt die relative Unterordnerstruktur erhalten. Jede Datei
behält ihren ursprünglichen Basisnamen; nur die Endung wird `.md`. Bei gleichen
Basisnamen wird deterministisch ` (2)`, ` (3)` usw. ergänzt. Da dadurch keine
Zuordnung nötig ist, wird in diesem Modus keine `DataSecure-Zuordnung.csv`
erzeugt und die Verlaufsaktion **Zuordnung** bleibt deaktiviert. Namen und andere Originalinhalte bleiben erhalten: Diese Dateien
sind **nicht anonymisiert** und werden nicht automatisch hochgeladen.
OCR-/Extraktionshinweise und nicht verarbeitbare Dateien stehen in der Übersicht;
es gibt keinen PII-Review oder zusätzlichen Bestätigungsdialog. Markdown erhält
Text und Tabellen, nicht das vollständige grafische Originallayout. Der Stand
der technischen und menschlichen Abnahme steht unter
[BL-010.28 im kanonischen Backlog](docs/canonical/BACKLOG.md).

Im Modus **In Markdown umwandeln und anonymisieren** verarbeitet Standalone
TXT/Markdown/CSV direkt. DOCX, XLSX, PPTX, PDF/Scan-PDF und Bilder werden genau
einmal lokal nach Markdown extrahiert; anschließend wird dieser Markdown-Inhalt
automatisch anonymisiert. Das Ergebnis trennt zwei Aussagen: Die Anonymisierung
des extrahierten Markdown-Inhalts ist vollständig geprüft, während die
Vollständigkeit der Extraktion aus dem Originalcontainer je nach Format nicht
garantiert sein kann. Das Original bleibt unverändert und gilt nicht als
vollständig anonymisiert. Leere OCR, beschädigte, verschlüsselte oder unsichere
Quellen stoppen weiterhin ohne Ergebnis.

Heute sind Application-Service, getrenntes Datenverzeichnis, UI-Zustandsvertrag,
privates gerahmtes IPC, Sidecar-Lifecycle und Zielpaketkatalog implementiert.
Getrennte selbsttragende Engineering-Pakete sind technisch für Windows x64,
macOS Intel, macOS Apple Silicon und Linux x64 glibc gebaut und nativ bis durch
App → private IPC → Core geprüft; Rust, Node und Python werden auf
Anwenderrechnern nicht benötigt. Es bleibt bewusst ein **Engineering-Pilot**,
bis die sichtbare menschliche UAT auf den jeweiligen Zielsystemen abgeschlossen
ist. Linux ARM64 und Windows ARM64 sind keine aktuellen Paketziele. Eine reine
Browser-Webanwendung ist nicht vorgesehen: Ohne lokale Komponente kann sie die
zugesagte lokale, offlinefähige Dateiverarbeitung und Betriebssystemdialoge nicht
zuverlässig bereitstellen. Cowork bleibt davon getrennt ein Claude-Desktop-Weg
für Windows und macOS; Linux wird nur durch Standalone unterstützt.

Keine sensiblen Originale als Chat-Anhang hochladen. Eine in Web oder Mobil
gestartete Aufgabe, eine geplante Aufgabe und eine geschlossene oder getrennte
Desktop-App können den lokalen Plugin-MCP nicht für den Originaleingang nutzen.
Cloud-Cowork, Web, Mobil und geplante Cloud-Aufgaben dürfen ausschließlich
bereits lokal freigegebenes Markdown verwenden. Erscheint in einer lokalen
Desktop-Sitzung kein DataSecure-Picker, ist meist der Connector nicht aktiv,
die Runtime nicht gestartet oder die Organisation hat lokale Plugin-MCPs
deaktiviert; siehe IT-Betriebshandbuch.

## Dokumentation

- [Anleitung](docs/ANLEITUNG.md)
- [aktueller Produkt-/Entwicklungsstand](docs/canonical/CURRENT_STATE.md)
- [aktives Backlog](docs/canonical/BACKLOG.md)
- [Testvertrag](docs/TESTING.md)
- [IT-Betriebshandbuch](docs/IT-BETRIEBSHANDBUCH.md)
- [Security-Modell](docs/PLUGIN_SECURITY_MODEL.md)
- [UAT-Testpaket](docs/acceptance/UAT_TEST_KIT/README.md)
- [formale N3/N4-Abnahme für Windows und macOS](docs/acceptance/FORMAL_UAT/README.md)
- [100-Dateien-Formatkorpus](docs/acceptance/STANDALONE_100_FORMAT_TEST_KIT/README.md)
- [komplexer DOCX-Testkorpus](docs/acceptance/STANDALONE_COMPLEX_DOCX_TEST_KIT/README.md)
- [adversarieller Golden-Härtetestkorpus](docs/acceptance/STANDALONE_ADVERSARIAL_GOLDEN_TEST_KIT/README.md)
- [Dokumentenarchiv und stabile Archiv-IDs](docs/archive/INDEX.md)

## Entwicklung

```text
npm ci
npm run test:docs
npm run test:ci
npm run test:standalone
npm run build:standalone:windows:portable
npm run runtime:target -- --target <Ziel> --archive <offizielles-Node-Archiv> --output dist/<Ziel>
npm run build:plugin
npm run test:plugin-zip
```

Der Produktbuild ergänzt eine geprüfte, zielsystemspezifische Node-Runtime; ein
reines Quell-ZIP ist kein Nutzerprodukt. Ein GitHub-synchronisierter privater
Marketplace verweist relativ auf einen self-contained Plugin-Ordner im selben
verbundenen Repository; ein externes HTTPS-Archiv ist dafür kein Ersatz.
Zusätzliche interne Engineering-Artefakte sind keine Nutzer- oder Releasewege. Der manuelle
Workflow `bundled-runtime-release.yml` baut die Windows-/macOS-Artefakte ohne
automatische, kostenverursachende Läufe.

DataSecure ist ein technischer Datenminimierungsbaustein, keine Rechtsberatung,
keine Garantie rechtlicher Anonymität und keine DSGVO-/EU-AI-Act-Zertifizierung.
