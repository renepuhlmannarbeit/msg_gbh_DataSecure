# DataSecure Standalone Desktop

Dieses Verzeichnis enthält die reale Tauri-2-Desktop-Hülle und ihren
plattformneutralen, maschinenprüfbaren Vertrag. Die Rust-Hülle, der native
Datei-/Ordnerdialog und der private DataSecure-Sidecar-Kanal wurden in getrennten
Engineering-Paketen für Windows x64, macOS Intel, macOS Apple Silicon und Linux
x64 glibc gebaut. Alle vier Pakete enthalten ihre gepinnte Runtime; die drei
POSIX-Ziele sind nativ bis durch App → private IPC → Core gestartet. Es ist
noch **kein freigegebenes Endnutzerprodukt**.

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
weitergegeben. Ergebnis und Manifest weisen Extraktionsabdeckung und
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

Entwickler bauen und prüfen die Hülle mit:

```powershell
npm run test:standalone
npm run build:standalone:windows:portable
```

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

Sieben transportneutrale Core-Verträge für Start, Zweck, nächste Aktion,
Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und Fortschritt sind
in beiden Produktprojektionen gebunden. Breitere Format-/Profil-/Recovery-
Goldenabdeckung bleibt ein Refactoringziel. Für Anonymisierung auf macOS ist
der einzelne AppKit-Sammelreviewadapter E0 implementiert; seine tatsächliche
Bedienung auf Intel und Apple Silicon ist noch Zielhostabnahme. Reine Markdown-Konvertierung
benötigt keinen PII-Sammelreview. Maßgeblich sind der
[aktuelle Stand](../../docs/canonical/CURRENT_STATE.md) und das
[kanonische Backlog](../../docs/canonical/BACKLOG.md).
