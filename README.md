# GBH DataSecure – Standalone Windows/macOS RC177 · Linux RC159 · Cowork RC151

Quellstand: 3.2.0-rc165 (Codezweig `main`; Produktcode unverändert)

Die folgenden Windows-/Mac-Downloads gehören zum separat veröffentlichten
RC177-Tag. Der Produktcode auf main bleibt unverändert.

**Dokumente lokal in Markdown umwandeln – auf Wunsch anonymisiert.**
DataSecure arbeitet offline. Originaldateien bleiben unverändert; die Anwendung
lädt keine Dokumente hoch. Die Standalone-App benötigt weder Claude noch eine
KI-Anbindung. Fertige Markdown-Dateien lassen sich mit Menschen oder anderen
Werkzeugen verwenden.

**[Aktueller Windows-/Mac-Teststand: RC177 herunterladen](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc177)**

| Aufgabe | Was die Standalone-App macht |
| --- | --- |
| Nur umwandeln | Text und unterstützte Dokumentstrukturen als lesbares Markdown bereitstellen. Dieser Modus anonymisiert nicht. |
| Umwandeln und anonymisieren | Personen-, Unternehmens- und weitere sensible Angaben prüfen und ersetzen; selbst entscheiden oder automatisch maskieren. |
| OCR | Text aus ausgewählten Scans und Grafiken lokal erkennen. OCR kann Zeichenfehler und Auslassungen enthalten. |
| Nachbearbeiten | Original und Ergebnis vergleichen, zusätzliche Stellen exakt maskieren und einen neuen vollständigen Ergebnisstand speichern. |
| Ergebnisse verwenden | Nach den erforderlichen Prüfungen direkt den Ergebnisordner öffnen. Keine zweite Dateiauswahl, Dokumentfreigabe oder Exportbestätigung im normalen Ablauf. |

Unterstützte Eingaben sind **PDF, DOCX, XLSX, PPTX, TXT, Markdown, CSV sowie
PNG, JPEG und BMP**. In Office-Dateien werden zusätzlich unterstützte eingebettete
Raster- und Vektorgrafiken verarbeitet. Text, Tabellen, SmartArt, Diagramme,
gespeicherte Formelwerte, unterstützte Office-Formeln und passive PDFformularwerte
werden je nach vorhandenem Quellmodell übernommen. Formeln, Makros, PDFaktionen
und externe Verknüpfungen werden nicht ausgeführt oder nachgeladen.

**Grenzen sichtbar machen:** Ein nicht unterstütztes Bild soll den unabhängig
lesbaren übrigen Dokumentinhalt nicht verwerfen. Teilabdeckung wird mit einem
Hinweis kenntlich gemacht. Verschlüsselte, beschädigte oder nicht sicher
verarbeitbare Quellen können weiterhin dateibezogen ausfallen. Komplexe Layouts,
Spezialgrafiken und OCR werden nicht universell originalgetreu wiedergegeben.
Ergebnisse vor der Verwendung inhaltlich prüfen.

Anonymisierte Ergebnisse enthalten zusätzlich **Vertraulich/Dateizuordnung.csv**,
**Vertraulich/Pseudonym-Zuordnung.txt** und **Vertraulich/Pseudonym-Zuordnung.xlsx**.
Das erste Excelblatt enthält dieselben Zuordnungen und Vorkommen wie die TXT.
**Vertraulich enthält Originalangaben und gehört nicht zur Weitergabe.**
Fertige MD-/CSV-/TXT-/XLSX-Arbeitskopien dürfen manuell bearbeitet werden. Eine
spätere Appkorrektur erstellt einen neuen Ordner aus der privaten Basis und
überschreibt keine von Hand geänderten Ergebnisse.

RC177 für Windows und beide Macs ist veröffentlicht und gebunden
an Appcommit `fc39f820bd6e3c9528ffad911eada5aee20c56cb` (Build `fc39f820`),
Produktfingerprint `1df160c305aa7b2740e6261075ce7fa5a09ade3f3ee75f48debe65db3c82b5a4`.
Automatische 328/328 Hauptprüfungen plus 11/11 Zusatzprüfungen, Windows-Native-/
Konverter-/Paketgates und beide nativen Mac-Consumer sind anhand der tatsächlichen
Endbelege und veröffentlichten Downloads geprüft.
Die Desktopabnahme und echte Office-/Finder-/TCC-/VoiceOver-/Zielhosttests bleiben
**USER_PENDING**. Es ist ein **Beta-/Test-Pre-Release, keine Produktionsfreigabe**.
[Umfang und Nachweise](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/blob/v3.2.0-rc177/docs/acceptance/RC177_SHARED_RELEASE_20261025.md).

Neu in RC177:

- Excel-Zelltexte mit OOXML-Zeichenescapes werden quellbezogen gelesen; sensible Werte behalten ihre normalen Schutzprüfungen. Das erste Zuordnungsblatt bleibt mit der TXT verbunden.
- SmartArt übernimmt den belegten Datenbaum und seine Reihenfolge. Nicht eindeutig zuordenbare Zusatztexte werden getrennt gekennzeichnet; Beziehungen werden nicht geraten.
- Unterstützte SVG-Stile und Grafikabmessungen werden begrenzt lokal aufgelöst. Nicht unterstützte Darstellung erhält einen Hinweis statt stiller Vollständigkeitsbehauptung.
- OCR erhält vorhandene Lesungen bei widersprechender Nachlese und weist auf den Unterschied hin. Eine eng begrenzte Umlautkorrektur verlangt zusätzlich passende Original-Glyphpixel und eine sonst identische ganze Zeile. Das ist kein Wahrheitsbeweis und keine Anonymisierungsfreigabe.

Kleine Grafiktexte, komplexe Layouts und OCR können weiterhin fehlen oder falsch
gelesen sein. Keine automatische Bereinigung nach Wörterbuch, keine Garantie für
beliebige Schriften oder defekte Dateien. Vorhandene PDF-Suchtexte bleiben erhalten.

Linux bleibt beim getrennten [RC159-Paket](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc159)
(Quellcommit `7af2a9d0268864a01b954e0175cae9f5a3616fe8`). Das getrennte
[Cowork-Plugin bleibt auf RC151](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc151)
(Quellcommit `fdb8288c9bef2a64eeb10d584e1bf59a6cb864c3`). Deren Downloads und
Abnahmen werden durch einen neuen Windows-/Mac-Standalone-Release nicht ersetzt.

Historischer Windows-/Mac-Teststand: [RC176](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc176)
mit Appcommit `706c1fad6fbf26bf6745768c0d6a5bd4fc48040b` bleibt unverändert verfügbar.

## Standalone-App installieren (Windows, macOS und Linux)

Für die Standalone-App werden **weder Claude noch Cowork, Node.js, Python oder
Rust** benötigt. Das zur eigenen CPU passende ZIP vollständig entpacken und
nicht direkt aus dem ZIP starten; auf dem Mac gibt es alternativ ein DMG:

**[RC177: Windows-/Mac-ZIPs, Mac-DMGs, Testpläne und Prüfsummen](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc177)** ·
[Linux RC159](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc159)

Für die 19 Abschlusstests, neue PDF-/TIFF-/Office-/Feldschutzproben und beibehaltene chartEx-/FachprobenA–F/Diagramm-/Formel-/PDF-/Tabellenproben gibt es [synthetische RC164-Testdaten](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-3.2.0-rc164-Abnahmetests.zip),
einen [Windows-Testplan](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/WINDOWS-TESTPLAN.txt)
und [Mac-Testhinweise](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/MAC-TEST-HINWEISE.txt).
Pro Fall nur dessen EINGABEN wählen. Zusätzlich steht das unveränderte
[100-Dateien-Testpaket aus RC160](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-Standalone-3.2.0-rc160-Testdatenpaket.zip)
und die separate [36-Dateien-Large-Beilage](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-3.2.0-rc166-Large-Testdaten.zip)
bereit. Die historischen Anleitungen in diesen unveränderten Archiven gelten
nicht für den neuen Direktablauf; die zwei aktuellen Testpläne sind maßgeblich.
In der App für den 100-Dateien-Bestand nur den enthaltenen Eingabeordner
`DataSecure-RC160-Testdaten-100` wählen; Anleitung und Manifest sind keine
Eingabedateien.

**Mac-Kompatibilitätshinweis:** Der erneute Paketreview hat in den veröffentlichten
Standalone-RC140-ZIPs einen Helfer mit höherer Mindestversion gefunden: Intel
verlangt macOS 15, Apple Silicon macOS 14. Die bisherige Angabe 13.5 war für
diese ZIPs falsch. Für Mac die unten verlinkten RC177-ZIPs oder DMGs verwenden:
ihr Binärvertrag ist für macOS 13.5 geprüft; ein realer Lauf auf 13.5 bleibt offen.
Die RC140-Downloads werden nicht verändert. Die Mac-Pakete bleiben interne,
ad-hoc-signierte Piloten ohne bestätigte Finder-/Gatekeeper-Abnahme auf dem
betroffenen verwalteten M2.

- **Windows 10/11 x64:**
  [DataSecure-Standalone-3.2.0-rc177-windows-x64.zip](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-Standalone-3.2.0-rc177-windows-x64.zip)
  herunterladen, vollständig entpacken und
  `DataSecure Standalone.exe` doppelklicken. Microsoft Edge WebView2 muss als
  Windows-Systemkomponente vorhanden sein. [Ausführliche Windows-Anleitung](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/blob/v3.2.0-rc177/apps/datasecure-standalone/START-WINDOWS.md)
- **Mac mit Intel-Prozessor:**
  [ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-Standalone-3.2.0-rc177-macos-x64.zip)
  oder [DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-Standalone-3.2.0-rc177-macos-x64.dmg)
  herunterladen, die jeweils passende `.sha256` derselben Release-Seite prüfen
  und die enthaltene `DataSecure Standalone.app` nach **Programme** ziehen.
- **Mac mit Apple Silicon (M1 oder neuer):**
  [ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-Standalone-3.2.0-rc177-macos-arm64.zip)
  oder [DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc177/DataSecure-Standalone-3.2.0-rc177-macos-arm64.dmg)
  herunterladen und genauso installieren.
  Die Architektur zeigt **Apple-Menü → Über diesen Mac**. RC177 wurde auf
  macOS 15 (Intel) und macOS 14 (ARM) automatisch ausgeführt; macOS 13.5 ist die deklarierte,
  in allen nativen Komponenten geprüfte Mindestversion (siehe Hinweis oben).
  [Ausführliche macOS-Anleitung](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/blob/v3.2.0-rc177/apps/datasecure-standalone/MACOS-START.md)
- **Linux x64 mit glibc:**
  [DataSecure-Standalone-3.2.0-rc159-linux-x64-glibc.zip](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc159/DataSecure-Standalone-3.2.0-rc159-linux-x64-glibc.zip)
  vollständig entpacken, die enthaltene AppImage ausführbar machen und starten.
  Dieses Paket ist technisch nativ geprüft; die sichtbare Linux-UAT ist offen.

Die macOS-ZIPs und -DMGs sind interne, nur ad-hoc-signierte Piloten: Der tatsächliche
Browser-/Finder-/Gatekeeper-Installationsweg auf Intel und Apple Silicon ist
noch nicht abgenommen. Sie sind nicht mit einer Apple Developer ID signiert
oder notariell beglaubigt. Falls macOS den ersten Start wegen fehlender Identifizierung oder
Notarisierung blockiert, danach unter **Systemeinstellungen → Datenschutz & Sicherheit**
bei DataSecure **Dennoch öffnen** wählen und die Rückfrage mit
**Öffnen** bestätigen. Bei „beschädigt“ oder Schadsoftwarewarnung nicht
umgehen; genaue Meldung und Prüfsumme kontrollieren. Gatekeeper nicht global
deaktivieren.
Diese Testverteilung verwendet bewusst keine Developer ID oder Notarisierung.
Der praktische Erstinstallationstest des heruntergeladenen Pakets bleibt nötig;
lokale oder organisatorische Startsperren sind durch CI nicht ausgeschlossen.
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
[RC151-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc151)
bereit:

- [Windows x64 – normales Plugin](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc151/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc151.zip)
- [Windows x64 – getrenntes Debug-Plugin](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc151/DataSecure-Privacy-Preflight-windows-x64-debug-v3.2.0-rc151.zip)
- [macOS Intel](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc151/DataSecure-Privacy-Preflight-macos-x64-v3.2.0-rc151.zip)
- [macOS Apple Silicon](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc151/DataSecure-Privacy-Preflight-macos-arm64-v3.2.0-rc151.zip)
- [Windows-UAT-Vorlage – alle Modellgates `NOT_RUN`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc151/DataSecure-Cowork-UAT-Evidence-v3.2.0-rc151.zip)
- [SHA-256-Prüfsummen](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc151/SHA256SUMS)

RC138-/RC139-/RC140-Archive und ihre damaligen UAT-Vorlagen bleiben historische Evidenz und
werden nicht neu gebunden. Für RC151 gelten die erneuerten Nachweise in der
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
Im normalen Standalone-Inhaltsmodus werden unterstützte sichtbare Wordinhalte
einschließlich Kopf-/Fußzeilen quellbezogen gelesen und durch die normalen
Anonymisierungsprüfungen geführt. Cowork und der technische Legacy-/Notes-Pfad
haben einen getrennten Formatvertrag. PDF-/Scan-PDF-Seitenränder werden nicht
unsicher geraten oder automatisch abgeschnitten.

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
   Dateien; Originalnamen, Mapping, Review und Recovery bleiben privat.
   Der getrennte Standalone-Teststand liefert seine lokalen Zuordnungen im
   Unterordner **Vertraulich**; dessen Dateien enthalten Originalangaben und
   gehören nicht zur Weitergabe.
7. Erst danach bei Bedarf ausdrücklich um die Auswertung der fertigen Ergebnisse
   bitten.

Bei einer Ordnerauswahl werden alle Unterordner sicher geprüft. Überschreitet der
Baum die Datei-/Größengrenze oder enthält er ein gesperrtes Format, meldet
DataSecure die Auswahl verständlich zurück und startet keinen Teilstapel.
Die 500-MiB-Grenze gilt für den gesamten Stapel; zusätzlich gelten kleinere
Einzeldateigrenzen: Office-Dateien 64 MiB, PDF und Bilder 25 MiB, TXT/Markdown
8 MB und CSV 1,5 MB. Auch eine zu große Datei in einem Unterordner lehnt die
gesamte Ordnerauswahl ab; der Grund bleibt in der Oberfläche sichtbar.

Die eigentliche Verarbeitung läuft lokal und offline. Cowork ist der bequeme
Einstieg und kann die freigegebenen Markdown-Ergebnisse anschließend auswerten;
die Anonymisierungsengine ist davon fachlich getrennt. Die eigenständige
Desktop-Oberfläche ohne Claude/Cowork ist als eigener Beta-Teststand verfügbar
und verwendet dieselbe Engine mit ihrem getrennten Inhalts-/Ablaufvertrag.
Das Mapping gilt nur für Anonymisierung; reine Markdown-Konvertierung behält
die Quellbasisnamen und benötigt keine Zuordnungsdatei.

## Standalone ohne Claude – RC177 testen

1. Unter **Neue Verarbeitung** den Zweck wählen: **Nur umwandeln** oder
   **Umwandeln und anonymisieren**. Beim Anonymisieren zwischen **Selbst
   entscheiden** und **Automatisch maskieren** wählen; OCR bleibt eine eigene
   Option. Dateien oder Ordner auswählen beziehungsweise hineinziehen.
2. Ergebnisziel kontrollieren und die Verarbeitung einmal starten. Lesbare
   unabhängige Inhalte bleiben auch bei einzelnen nicht unterstützten Grafiken
   erhalten; konkrete Auslassungen und Fehler stehen beim jeweiligen Lauf.
3. Im geführten Anonymisierungsablauf nötige OCR-/Text- und Fundstellenprüfungen
   durchführen und Änderungen bewusst speichern. Der automatische Weg kann
   konservativ maskieren; automatisch behandelt bedeutet nicht manuell geprüft.
4. Danach **Ergebnisordner öffnen** verwenden. Die aktuellen Markdown-Dateien
   stehen direkt bereit; keine weitere Dateiauswahl, Dokumentfreigabe oder
   Exportbestätigung im normalen Ablauf. **Nur umwandeln** anonymisiert nicht.
5. Bei Anonymisierung den Ordner **Vertraulich** getrennt aufbewahren:
   Dateizuordnung sowie TXT-/Excel-Pseudonymzuordnung enthalten Originalangaben.
   Nur die gewünschten Markdown-Dateien weitergeben.
6. Falls nötig, über **Nachbearbeitung öffnen (optional)** Original und Ergebnis
   vergleichen, zusätzliche Stellen maskieren und speichern. Eine Appkorrektur
   erzeugt einen neuen vollständigen Ergebnisordner; vorhandene oder manuell
   bearbeitete fertige Arbeitskopien bleiben unverändert. Erneutes Bereitstellen
   erfolgt weiterhin erst nach den technischen Schutzprüfungen.

Der Verlauf zeigt das begrenzte Fenster der letzten fünf Läufe. Ausblenden
löscht keine Dateien und lässt keinen älteren Lauf nachrücken. Neue Läufe
verwenden laufintern konsistente Pseudonyme wie `[PERSON_001]` und
`[UNTERNEHMEN_001]`; daraus entsteht keine globale laufübergreifende Zuordnungsdatenbank.
Ordnerstruktur und Dateinamen richten sich nach Zweck und gewählter Benennung;
die Dateizuordnung erklärt die tatsächlich erzeugten anonymisierten Dateien.

Text, Tabellen, Diagramme, SmartArt, Formeln und OCR sind nur in den jeweils
unterstützten Modellen abgedeckt. Quellenabdeckung und Anonymisierungsprüfung
bleiben verschiedene Aussagen: Das Originaldokument wird nicht anonymisiert,
und ein Hinweis auf Teilabdeckung darf nicht als vollständige Inhaltsübernahme
verstanden werden. Verschlüsselte, global beschädigte oder nicht sicher
gebundene Quellen können weiterhin ohne Ergebnis ausfallen. Ein Abbruch oder
Schutzfehler ist keine erfolgreiche Verarbeitung.

Windows ARM64 und Linux ARM64 sind keine aktuellen Pakete. Linux bleibt auf
RC159 mit eigenem Funktions-/Teststand. Die Desktoptests der drei RC177-Zielpakete
für Windows, Mac Intel und Apple Silicon bleiben Sache der Testenden; insbesondere sind
Finder, TCC, verwaltete Geräte, VoiceOver und das deklarierte MindestmacOS nicht
durch CI vollständig abgenommen. Die aktuellen RC177-Downloads sind oben verlinkt;
die menschliche Desktopabnahme bleibt offen.

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
