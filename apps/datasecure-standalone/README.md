# DataSecure Standalone Desktop

Aktuelle Pakete: [RC157 für Windows, macOS Intel, macOS Apple Silicon und Linux](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc157).
Auf beiden Macs bleibt ZIP erhalten; DMG ist ein zusätzlicher Weg. Alle vier
nativen Paket-/App-Prüfungen einschließlich integrierter Prüfseite bestanden;
der Windows-Anwenderlauf mit 140 Ergebnissen wurde als bestanden bestätigt.

Lokaler Entwicklungsstand vom 05.10.2026 (noch nicht in RC157 veröffentlicht):
Die Prüfung bietet zusätzlich **Als Unternehmen anonymisieren** und
**Beibehalten**. Eine bestätigte Behandlung derselben vollständigen Schreibweise
gilt für offene und folgende Prüfungen dieses Laufs, auch nach Neustart. Neue
Läufe und bereits fertige Ergebnisse bleiben getrennt. Nicht verarbeitete
Dateien werden mit Namen einschließlich Endung, Fehlercode und nächstem Schritt
genannt; **Dateidetails erneut laden** lädt nur die Liste, nicht die Verarbeitung.
PDF-OCR über bereits vorhandenem nativem Text wird nur bei vollständiger
Geometrieabdeckung, exakter Wortgleichheit und sicherer Malreihenfolge
unterdrückt. Nicht lesbare Symbolruns und ausgelassene Grafiken erhalten einen
sachlichen Hinweis; unbekannte Bildtexte werden nicht blind entfernt und
Grafikbeschreibungen nicht erfunden. Siehe DS-106 / BL-010.46 im kanonischen Stand.

DS-107 / BL-010.48 härtet zusätzlich die echte Desktop-Verbindung und den
Prüfprozess: Unternehmensentscheidungen passieren die private IPC-Validierung;
Vorbereitung, Veröffentlichung, Fehler und nötige Exportreparatur werden
unterschieden. Fehlende Komponente, verweigerte Ausführung oder falsche
Architektur erhalten einen festen Fehlercode mit passendem nächsten Schritt.
Das laufgebundene Prüffenster kann die dafür vorgemerkten Dateinamen nennen,
auch wenn der Worker vor dem ersten Entwurf nicht startet. Eine Wiederholung
ist erst nach dessen tatsächlichem Ende möglich. Das Schließen der App wartet
nicht unbegrenzt auf einen blockierten Prüfkanal; ungeprüfte Dateien bleiben
gesperrt und fortsetzbar. Pro Prüfdialog sind auf allen Plattformen maximal
5.000 Fundstellen möglich. Größere einzelne Dokumente müssen aufgeteilt werden.
Diese Änderungen sind im lokalen Windows-Engineering-Bau geprüft, noch nicht
als neues Release oder native macOS-Bedienabnahme veröffentlicht.

DS-109 ergänzt lokal (noch unveröffentlicht) gebundene Gesprächsnamen,
konservative OCR-Wort-/Malreihenfolgenprüfung und ehrliche Identitätswarnungen.
Bekannte OS-Begleitdateien werden nur nach Strukturprüfung übersprungen und
namentlich angezeigt. Startet die Oberfläche nicht, kann die Anwendung mit
`--startup-diagnostics` den inhaltsfreien Diagnoseordner ohne WebView öffnen.
Ein komplett vom Betriebssystem blockiertes Programm kann selbst keinen Bericht
erstellen; hierfür benötigt die IT die Betriebssystemmeldung. Schutzfunktionen
nicht deaktivieren. Weitere technische Evidenz und offene Geräteprüfungen stehen
in DS-109 / BL-010.52 und der kanonischen Evidence-Matrix.

Dieses Verzeichnis enthält die reale Tauri-2-Desktop-Hülle und ihren
plattformneutralen, maschinenprüfbaren Vertrag. Die Rust-Hülle, der native
Datei-/Ordnerdialog und der private DataSecure-Sidecar-Kanal wurden in getrennten
Engineering-Paketen für Windows x64, macOS Intel, macOS Apple Silicon und Linux
x64 glibc gebaut. Alle vier Pakete enthalten ihre gepinnte Runtime; die drei
POSIX-Ziele sind nativ bis durch App → private IPC → Core gestartet. Es ist
noch **kein freigegebenes Endnutzerprodukt**.

### OCR-Kontakte prüfen (06.10.2026, unveröffentlichter Quellstand)

Bei der Anonymisierung von Scan-PDFs und Bildern kann die vorhandene lokale
Prüfung zuerst fragen: **Wurde dieser Kontaktwert richtig erkannt?** Seite und
OCR-Zeile nennen die Position. Ein eindeutig zugeordneter Original-Rasterausschnitt
steht direkt daneben; bei PDF aus der lokal gerenderten Seite. Wenn Geometrie
oder Größenlimit keinen sicheren Ausschnitt erlauben, bittet die Oberfläche
ausdrücklich um Vergleich mit der Originaldatei. Sie können den Wert bestätigen oder die richtige
E-Mail-/Telefonschreibweise eingeben. Die Aktionen heißen **OCR-Wert unverändert
bestätigen**, **Kontaktwert korrigieren** und **Kontaktwerte bestätigen und weiter**.
Danach folgt im selben Fenster die normale
Anonymisierung beziehungsweise Personen-/Unternehmensprüfung. Kontakt bestätigen
bedeutet **nicht**, ihn unverändert im anonymisierten Ergebnis zu behalten.

**Später entscheiden** hält die Datei gesperrt; die Prüfung ist beim selben Lauf
fortsetzbar. Gespeicherte Kontaktentscheidungen werden nur auf genau dieselbe
Quelle und Extraktion dieses Laufs angewendet. Hat sich diese Bindung geändert,
nennt die App die betroffenen Dateien und verlangt einen neuen Lauf. Identische
OCR-Fehlschreibweisen werden nicht automatisch als derselbe echte Kontakt
behandelt. Mehr als 400 Kontaktstellen in einem einzelnen Dokument erfordern
Aufteilung; Korrekturen sind auf 256 Zeichen beschränkt. Originale bleiben
unverändert. **Nur in Markdown umwandeln** benötigt standardmäßig keine
Kontaktfreigabe und enthält den ursprünglichen OCR-Text mit Qualitätshinweisen.
Vor **Starten** kann zusätzlich **OCR-Kontaktwerte vor dem Markdown-Export lokal prüfen**
aktiviert werden. Dann lassen sich Kontaktstellen auch ohne Anonymisierung
korrigieren, verschieben und nach Neustart fortsetzen. Namen und andere
Originalinhalte bleiben erhalten; andere OCR-Zeilen werden dadurch nicht geprüft.
Die Bildausschnitte werden nicht mit exportiert und nicht an KI übergeben.

Diese Funktion ist lokal implementiert und technisch geprüft, noch nicht in
einem neuen Windows-/Mac-Releasepaket abgenommen. OCR kann auch unerkannte Fehler
enthalten; die Prüfung garantiert weder vollständige Erkennung noch rechtliche
Anonymität. Der [Reviewvertrag](../../docs/canonical/contracts/BATCH_REVIEW_V2.md)
trennt Standalone ausdrücklich von Coworks eigenem Reviewweg.

Tauri ist ausschließlich für Fenster, native Auswahl, Sidecar-Lifecycle und
die feste UI-Projektion zuständig. Formatprüfung, Konvertierung, PII-Erkennung,
Anonymisierung, Review, Recovery, Mapping und Export verbleiben vollständig im
gemeinsamen DataSecure-Core. Der Renderer zeigt ausgewählte Dateinamen sowie
Quellen- und Ergebnisordner ausschließlich lokal als Text an (DS-082). Er erhält
keine Rohtexte, Mappinginhalte, Tokens, Kommandozeilen, freien Fehlertexte oder
direkten Dateisystemzugriff; die lokale Pfadanzeige wird nicht protokolliert.

Dateien oder ein Ordner lassen sich nativ in das Fenster ziehen. Die vorhandenen
Auswahlbuttons bleiben als Tastatur-/Klickalternative erhalten. Beide Wege
zeigen erst die aufgenommene Auswahl. Einzelne Dateien können entfernt und die
gesamte Auswahl kann geleert werden; nur **Starten** verarbeitet sie. Neue Standalone-Stapel im Anonymisierungsmodus verwenden lesbare und bei Fortsetzung stabile
Kennungen wie `[PERSON_001]` und `[UNTERNEHMEN_001]`; vorhandene v1-Stapel bleiben
unverändert. Die Kennungen gelten nicht kundenübergreifend oder über neue Stapel.

DS-086: **Keine Verarbeitung ist vorausgewählt.** Auf der Startseite wählt der
Anwender ausdrücklich **Nur in Markdown umwandeln** oder die Anonymisierung.
Die reine Konvertierung (DS-085) folgt Auswahl oder Drag-and-drop, **Starten**
und bewusstem Öffnen der Ergebnisse. Unterstützt werden TXT, Markdown,
CSV, DOCX, XLSX, PPTX, Text-/Scan-PDF sowie PNG/JPEG/BMP. Konverter und lokale
DE/EN-OCR sind im Paket enthalten; keine zusätzliche Installation ist nötig.
Namen und Originalinhalte bleiben erhalten. `DataSecure-Markdown/Lauf-…` enthält
eine `.md` je erfolgreicher Quelle. Eine gewählte Unterordnerstruktur bleibt
im Ergebnis erhalten. Der ursprüngliche Basisname bleibt erhalten;
nur die Endung wird `.md`, bei Kollisionen folgt ` (2)`, ` (3)` usw. Eine
Zuordnungsdatei wird für reine Konvertierung nicht erzeugt. Unvollständige Extraktion wird ohne Review gespeichert
und ausdrücklich gekennzeichnet; gesperrte/defekte Dateien werden übersprungen.
Die Anonymisierung verarbeitet TXT/MD/CSV direkt. DOCX, XLSX/PPTX/PDF/Scan-PDF
und Bilder durchlaufen denselben lokalen Konverter genau einmal; jeder nichtleere,
vertraglich gültige Markdown-Inhalt wird anschließend an den Privacy-Core
weitergegeben. Bei DOCX bleibt die vollständige Strukturprüfung erhalten, aber
Kopf- und Fußzeilen sowie ausschließlich dort referenzierte Bilder werden nur
im Anonymisierungsmodus nicht ausgegeben. Die reine Konvertierung erhält sie.
PDF-/Scan-PDF-Seitenränder und PPTX-Mastertexte werden nicht heuristisch entfernt.
Ergebnis und Manifest weisen Extraktionsabdeckung und
Anonymisierungsstatus getrennt aus: `incomplete` bedeutet keine Zusage über den
gesamten Originalcontainer, nicht eine unvollständige Anonymisierung des
extrahierten Markdown-Inhalts. Leere OCR sowie beschädigte, verschlüsselte oder
aktive Quellen stoppen. Ein manueller Zweischritt ist dafür nicht erforderlich.
Bei Anonymisierung wählt der Anwender pro Stapel zwischen neutralen Dateinamen
(datensparender Standard, `Dokument-NNN-anonymisiert.md`) und dem ursprünglichen
Basisnamen mit `-anonymisiert.md`. Die Zuordnung nennt in beiden Fällen die
tatsächlich erzeugten relativen Pfade. Namen und Pfade bleiben lokal und werden
nicht diagnostisch protokolliert. Die Wahl wird vor Start gebunden und bleibt
bei Fortsetzung unverändert.

Für Menschen entsteht außerdem eine vertrauliche Identitäts-TXT im Unterordner
`VERTRAULICH-NICHT-HOCHLADEN` des jeweiligen Anonymisierungslaufs. Sie enthält
erkannte Originalwerte; private Einzelsnapshots bleiben im App-Datenbereich.
DataSecure löscht beides nicht automatisch und bietet keinen Löschbutton.
**Niemals den gesamten Laufordner an eine KI übergeben** – nur einzeln geprüfte
anonymisierte Markdown-Dateien.

Der Endnutzerablauf besitzt drei Hauptansichten: **Start**, **Verarbeiten** für
Auswahl, Start und Fortschritt sowie **Verlauf** für die 20 neuesten
Verarbeitungen. Ergebnis- und Fortsetzungsaktionen beziehen sich jeweils auf
genau den gewählten Lauf. **Zuordnung** ist nur bei anonymisierten Läufen aktiv.
Abschluss und Wiederherstellung wechseln
weder die Ansicht noch öffnen sie automatisch einen Ordner. Die Anzeigegrenze
löscht keine älteren Ergebnisse. Lokale Öffnen-Aktionen bestätigen nur die Übergabe an den
Dateimanager des Betriebssystems; diese Bestätigung erscheint getrennt vom
fachlichen Laufstatus. Die Zuordnungsaktion markiert unter Windows und macOS
die konkrete CSV-Datei, unter Linux öffnet sie deren Ordner.

Nach einem App-Neustart bleibt die aktuelle Prozesskarte bewusst leer und die
neue Auswahl sofort verfügbar. Fortsetzbare ältere Läufe werden nicht erneut
als aktueller Lauf geladen; sie stehen mit **Fortsetzen** in ihrer exakten
Verlaufszeile. Die lokale Startprüfung läuft dennoch kurz fail-closed, um
verwaiste Sperren oder unvollständige Exporte zu bereinigen. Nur ein tatsächlich
noch lebender Worker blockiert eine parallele zweite Verarbeitung.

Ist ein Office-Dokument noch in Word, Excel oder PowerPoint geöffnet, kann im
Quellordner eine `~$`-Besitzerdatei liegen. Die rekursive Aufnahme überspringt
sie nur, wenn Größe, fehlende OPC-Signatur und die passende größere
OPC-Quelldatei das Artefakt gemeinsam belegen, und zeigt nur deren Anzahl. Ein
echtes Office-Dokument wird nie allein wegen seines Namens verworfen; die
eigentliche Datei bleibt im Stapel. Eine direkte Auswahl einer belegten
Besitzerdatei wird verständlich abgewiesen.

Entwickler bauen und prüfen die Hülle mit:

```powershell
npm run test:standalone
npm run build:standalone:windows:portable
```

Die zusätzliche native OCR-Bedienkampagne wird mit
`node tests/manual/standalone-native-review-campaign.mjs --prepare-ocr <exaktes-ZIP>`
vorbereitet. Sie bleibt bis zu echter Bedienung `NOT_RUN`: Kontaktprüfung
vertagen, nach Neustart ausdrücklich andere synthetische Kontakte korrigieren,
im folgenden Entitätsreview erneut vertagen und nach drittem Start deren
Übernahme prüfen. Finale Körper-/Quellen-/Paketkontrollen sind Pflicht. Der
automatische Paket-Smoke prüft dieselbe tatsächliche OCR-/Privacy-Kette über
private IPC, ist aber keine Tauri-/WebView-Klickabnahme.

Für native POSIX-Engineeringnachweise existieren die manuellen GitHub-Workflows
**Manual Standalone macOS sandbox evidence** und **Manual Standalone Linux
sandbox evidence**. Sie laufen niemals bei Push oder Pull Request, sondern nur
nach ausdrücklicher Bestätigung möglicher Runner-Minuten. Die macOS-Zellen bauen
getrennt auf Intel und Apple Silicon; Linux x64 baut auf Ubuntu 22.04 mit glibc
2.35. Beide Gates prüfen Zielarchitektur, Runtime, POSIX-Supervisor,
Produkt-/Konverterverträge, Rust/Clippy, native Hülle und App→private IPC→Core.
Die Distributionspfade bauen ihr ZIP zweimal bytegleich und starten es nach dem
Entpacken erneut. Ein optionaler Paketupload gilt höchstens einen Tag. Diese
E0-Läufe ersetzen keine Finder-/Gatekeeper-/Linux-Dateimanager-, sichtbare
Picker-/Drop-, Screenreader- oder Anwender-UAT.

Der Build erzeugt die geschlossene Runtime-Projektion frisch aus dem aktuellen
Quellstand, bindet die herkunftsgeprüfte Node-Runtime und legt Manifest, SBOM,
Lizenzhinweise und SHA-256 bei. Anwender installieren weder Rust noch Node. Vor
einer Freigabe fehlt die sichtbare menschliche UAT auf Windows, macOS Intel,
macOS Apple Silicon und Linux x64; technische E0-Pakete ersetzen sie nicht.
Windows verwendet für den kleinen Pilot das vorhandene Microsoft Edge
WebView2-Systemruntime und lädt es nicht selbst nach.

Die erste formale N3/N4-Kampagne ist für eine Windows-x64-Person und eine
Mac-Person vorbereitet. Der gemeinsame Ablauf, die Kandidatenbindung und die
getrennten Evidence-Dateien stehen im
[`FORMAL_UAT`-Kit](../../docs/acceptance/FORMAL_UAT/README.md). Ein einzelner Mac
belegt nur seine tatsächliche Intel- oder ARM64-Architektur.

Sieben transportneutrale Core-Verträge für Start, Zweck, nächste Aktion,
Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und Fortschritt sind
in beiden Produktprojektionen gebunden. Breitere Format-/Profil-/Recovery-
Goldenabdeckung bleibt ein Refactoringziel. Standalone verwendet auf Windows,
macOS und Linux dieselbe integrierte Tauri-Prüfseite mit privater IPC, nicht
Coworks externen AppKit-/PowerShell-Adapter. Die vollständige sichtbare
Bedienabnahme auf beiden Mac-Architekturen bleibt getrennte Zielhostevidenz. Reine Markdown-Konvertierung
benötigt keinen PII-Sammelreview. Maßgeblich sind der
[aktuelle Stand](../../docs/canonical/CURRENT_STATE.md) und das
[kanonische Backlog](../../docs/canonical/BACKLOG.md).
