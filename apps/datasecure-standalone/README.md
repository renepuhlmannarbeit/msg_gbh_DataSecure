# DataSecure Standalone Desktop

Dieses Verzeichnis enthält die reale Tauri-2-Desktop-Hülle und ihren
plattformneutralen, maschinenprüfbaren Vertrag. Die Rust-Hülle, der native
Datei-/Ordnerdialog und der private DataSecure-Sidecar-Kanal wurden auf Windows
x64 kompiliert, als laufender Engineering-Build geprüft und zusammen mit der
gepinnten Node-Runtime in einem selbsttragenden Windows-x64-Pilot-ZIP verifiziert.
Es ist noch **kein freigegebenes Endnutzerprodukt**.

Tauri ist ausschließlich für Fenster, native Auswahl, Sidecar-Lifecycle und
die feste UI-Projektion zuständig. Formatprüfung, Konvertierung, PII-Erkennung,
Anonymisierung, Review, Recovery, Mapping und Export verbleiben vollständig im
gemeinsamen DataSecure-Core. Der Renderer zeigt ausgewählte Dateinamen sowie
Quellen- und Ergebnisordner ausschließlich lokal als Text an (DS-082). Er erhält
keine Rohtexte, Mappinginhalte, Tokens, Kommandozeilen, freien Fehlertexte oder
direkten Dateisystemzugriff; die lokale Pfadanzeige wird nicht protokolliert.

Dateien oder ein Ordner lassen sich nativ in das Fenster ziehen. Die vorhandenen
Auswahlbuttons bleiben als Tastatur-/Klickalternative erhalten. Beide Wege
zeigen erst die aufgenommene Auswahl; nur **Starten** verarbeitet
sie. Neue Standalone-Stapel im Anonymisierungsmodus verwenden lesbare und bei Fortsetzung stabile
Kennungen wie `[PERSON_001]` und `[UNTERNEHMEN_001]`; vorhandene v1-Stapel bleiben
unverändert. Die Kennungen gelten nicht kundenübergreifend oder über neue Stapel.

DS-086: **Keine Verarbeitung ist vorausgewählt.** Auf der Startseite wählt der
Anwender ausdrücklich **Nur in Markdown umwandeln** oder die Anonymisierung.
Die reine Konvertierung (DS-085) folgt Auswahl oder Drag-and-drop, **Starten**
und bewusstem Öffnen der Ergebnisse. Unterstützt werden TXT, Markdown,
CSV, DOCX, XLSX, PPTX, Text-/Scan-PDF sowie PNG/JPEG/BMP. Konverter und lokale
DE/EN-OCR sind im Paket enthalten; keine zusätzliche Installation ist nötig.
Namen und Originalinhalte bleiben erhalten. `DataSecure-Markdown/Lauf-…` enthält
eine `.md` je erfolgreicher Quelle und `DataSecure-Zuordnung.csv` einschließlich
Hinweisen und Fehlern. Unvollständige Extraktion wird ohne Review gespeichert
und ausdrücklich gekennzeichnet; gesperrte/defekte Dateien werden übersprungen.
Die Anonymisierung bleibt eine gesonderte Betriebsart für TXT/MD/CSV/DOCX.

Der Endnutzerablauf besitzt drei Hauptansichten: **Start**, **Verarbeiten** für
Auswahl, Start und Fortschritt sowie **Verlauf** für die 20 neuesten
Verarbeitungen. Ergebnis-, Zuordnungs- und Fortsetzungsaktionen beziehen sich
jeweils auf genau den gewählten Lauf. Abschluss und Wiederherstellung wechseln
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

Der Build erzeugt die geschlossene Runtime-Projektion frisch aus dem aktuellen
Quellstand, bindet die herkunftsgeprüfte Node-Runtime und legt Manifest, SBOM,
Lizenzhinweise und SHA-256 bei. Anwender installieren weder Rust noch Node. Vor
einer Freigabe fehlen Windows-UAT sowie native Pakete und UATs auf macOS Intel
und Apple Silicon; der Windows-Nachweis ersetzt sie nicht. Windows verwendet
für den kleinen Pilot das vorhandene Microsoft Edge WebView2-Systemruntime und
lädt es nicht selbst nach.

Sieben transportneutrale Core-Verträge für Start, Zweck, nächste Aktion,
Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und Fortschritt sind
in beiden Produktprojektionen gebunden. Breitere Format-/Profil-/Recovery-
Goldenabdeckung bleibt ein Refactoringziel. Für Anonymisierung auf macOS ist
der einzelne AppKit-Sammelreviewadapter E0 implementiert; seine tatsächliche
Bedienung auf Intel und Apple Silicon ist noch Zielhostabnahme. Reine Markdown-Konvertierung
benötigt keinen PII-Sammelreview. Maßgeblich sind der
[aktuelle Stand](../../docs/canonical/CURRENT_STATE.md) und das
[kanonische Backlog](../../docs/canonical/BACKLOG.md).
