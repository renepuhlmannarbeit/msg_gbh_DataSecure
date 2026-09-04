# DataSecure Standalone starten (Windows x64)

1. ZIP vollständig in einen lokalen Ordner entpacken.
2. `DataSecure Standalone.exe` doppelklicken.
3. Dateien oder einen Ordner auswählen, die Zusammenfassung prüfen und
   **Anonymisieren** wählen.
4. Nach Abschluss **Ergebnisse öffnen** wählen.

Node.js, Rust, Claude, Cowork und eine Internetverbindung werden nicht benötigt.
DataSecure schreibt private Arbeitsdaten ausschließlich in den lokalen
DataSecure-Bereich und freigegebene Ergebnisse in den gewählten Ergebnisordner.
Originaldateien werden nicht verändert oder gelöscht.

Voraussetzung ist Windows 10/11 x64 mit Microsoft Edge WebView2. Dieser
Systembestandteil ist auf regulär aktualisierten Windows-10/11-Systemen bereits
vorhanden. Fehlt er, startet die Oberfläche nicht; DataSecure lädt ihn nicht
automatisch aus dem Internet nach.

Dieses Paket ist noch ein interner Engineering-Pilot ohne Codesignatur. Windows
kann deshalb beim ersten Start einen Herkunftshinweis anzeigen.
