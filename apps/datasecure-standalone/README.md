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
gemeinsamen DataSecure-Core. Der Renderer erhält keine Quellpfade, Rohtexte,
Mappings, Tokens, Kommandozeilen oder freien Fehlertexte.

Der Endnutzerablauf besitzt zwei Hauptansichten: **Verarbeiten** für Auswahl,
Start und Fortschritt sowie **Ergebnisse** für den letzten vollständig
sichtbaren Lauf. Lokale Öffnen-Aktionen bestätigen nur die Übergabe an den
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
