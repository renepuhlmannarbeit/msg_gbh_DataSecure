# DataSecure Standalone starten (Windows x64)

1. ZIP vollständig in einen lokalen Ordner entpacken.
2. `DataSecure Standalone.exe` doppelklicken.
3. Auf **Start** die gewünschte Funktion wählen: **Nur in Markdown umwandeln**
   oder **In Markdown umwandeln und anonymisieren**. Danach Dateien oder einen
   Ordner auswählen (oder in das Fenster ziehen). Anfangs ist kein Modus vorbelegt.
4. Bei Bedarf **Ergebnisordner ändern** wählen, dann **Starten** drücken.
5. Nach Abschluss selbst **Verlauf** öffnen und beim gewünschten Lauf
   **Ergebnisse öffnen** wählen. Im zugehörigen Laufordner
   liegen die Markdown-Dateien und `DataSecure-Zuordnung.csv` mit der Zuordnung
   zur jeweiligen Quelldatei sowie Hinweisen zu übersprungenen Dateien.

**Verlauf** zeigt die letzten 20 Verarbeitungen. Jede Zeile bietet den eigenen
Ergebnisordner, die eigene Zuordnungsdatei und – nur bei einem fortsetzbaren
Stapel – **Fortsetzen**. Auch nach einem Neustart bleibt die Startseite sichtbar.
Ein Abschluss öffnet weder automatisch einen Ordner noch eine andere Ansicht.

Die reine Umwandlung unterstützt TXT, Markdown, CSV, DOCX, XLSX, PPTX, PDF,
Scan-PDF und PNG/JPEG/BMP. Sie anonymisiert **nicht**: Namen und andere Inhalte
bleiben erhalten. Bilder und Scan-Seiten werden mit der mitgelieferten lokalen
Deutsch-/Englisch-Texterkennung gelesen. OCR und komplexe Layouts können
unvollständig sein; Hinweise erscheinen beim Abschluss und in der
Zuordnungsdatei. Passwortgeschützte oder defekte Dateien werden einzeln
übersprungen. Die übrigen Dateien werden weiter verarbeitet.

Optional kann vor dem Start **In Markdown umwandeln und anonymisieren** für
TXT, Markdown, CSV und DOCX gewählt werden. Diese getrennte Betriebsart kann
bei unklaren personenbezogenen Angaben eine lokale Prüfung benötigen.

Node.js, Rust, Claude, Cowork und eine Internetverbindung werden nicht benötigt.
DataSecure schreibt private Arbeitsdaten ausschließlich in den lokalen
DataSecure-Bereich und Ergebnisse in den gewählten Ergebnisordner. Reine
Konvertierungen landen unter `DataSecure-Markdown/Lauf-…`, anonymisierte
Ergebnisse getrennt unter `DataSecure-Output/Lauf-…`.
Originaldateien werden nicht verändert oder gelöscht.

Voraussetzung ist Windows 10/11 x64 mit Microsoft Edge WebView2. Dieser
Systembestandteil ist auf regulär aktualisierten Windows-10/11-Systemen bereits
vorhanden. Fehlt er, startet die Oberfläche nicht; DataSecure lädt ihn nicht
automatisch aus dem Internet nach.

Dieses Paket ist noch ein interner Engineering-Pilot ohne Codesignatur. Windows
kann deshalb beim ersten Start einen Herkunftshinweis anzeigen.
