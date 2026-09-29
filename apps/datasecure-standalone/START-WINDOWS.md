# DataSecure Standalone starten (Windows x64)

Aktuelles Windows-Testpaket: [RC151-ZIP mit Prüfsumme](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc151).
Es ist ein technischer Vorabkandidat; sichtbare Vollkorpus- und N3/N4-Abnahme
stehen noch aus.

1. ZIP vollständig in einen lokalen Ordner entpacken.
2. `DataSecure Standalone.exe` doppelklicken.
3. Auf **Start** die gewünschte Funktion wählen: **Nur in Markdown umwandeln**
   oder **In Markdown umwandeln und anonymisieren**. Danach Dateien oder einen
   Ordner auswählen (oder in das Fenster ziehen). Anfangs ist kein Modus vorbelegt.
   Bei Anonymisierung zusätzlich **Neutrale Dateinamen (empfohlen)** oder
   **Originalname mit „-anonymisiert“** wählen. Die zweite Variante nur nutzen,
   wenn Datei- und Ordnernamen keine personenbezogenen Angaben enthalten.
   Vor dem Start können weitere Dateien oder Ordner ergänzt, einzelne Dateien
   entfernt oder die ganze Auswahl geleert werden. Bereits gewählte Dateien
   werden dabei nicht doppelt aufgenommen. Nach **Starten** ist der Stapel fest;
   weitere Quellen gehören in einen neuen Lauf.
4. Bei Bedarf **Ergebnisordner ändern** wählen, dann **Starten** drücken.
5. Nach Abschluss selbst **Verlauf** öffnen und beim gewünschten Lauf
   **Ergebnisordner** wählen. Im zugehörigen Laufordner
   liegen die Markdown-Dateien. Bei Anonymisierung liegt zusätzlich
   `DataSecure-Zuordnung.csv` mit der Zuordnung jeder erfolgreich erzeugten
   Datei zur jeweiligen Quelldatei dort. Gestoppte Dateien stehen nur im
   Abschluss und in der Diagnose. Wenn alle Dateien stoppen, entstehen weder
   Ergebnisordner noch Zuordnungsdatei.
   Die Ansicht **Verarbeiten** zeigt zunächst den Abschluss dieses Laufs.
   Mit **Neuen Lauf vorbereiten** beginnst du bewusst eine leere Auswahl und
   wählst die Aufgabe erneut; der vorige Lauf bleibt im **Verlauf**. Ein
   fehlgeschlagener Lauf ohne Ergebnis ist kein erfolgreicher Abschluss.

**Verlauf** zeigt die letzten 20 Verarbeitungen. Jede Zeile bietet den eigenen
Ergebnisordner und – nur bei einem fortsetzbaren Stapel – **Fortsetzen**. Die
Zuordnungsaktion ist nur für Anonymisierung aktiv. Auch nach einem Neustart bleibt die Startseite sichtbar.
Ein Abschluss öffnet weder automatisch einen Ordner noch eine andere Ansicht.
Wird eine Ordnerauswahl wegen unbekannter Dateiformate abgelehnt, zeigt die
lokale Oberfläche die betroffenen relativen Dateinamen; es wird weiterhin
nichts aus diesem Ordner übernommen. Nach einem Lauf stehen gestoppte
Dateinamen und feste Fehlercodes im Abschluss sowie auf Abruf in der
jeweiligen Verlaufszeile. Ist das private Laufjournal später nicht mehr
vorhanden, bleibt im Verlauf nur die Anzahl sichtbar. Dateinamen werden nicht
in Diagnoseprotokolle geschrieben.

Die reine Umwandlung unterstützt TXT, Markdown, CSV, DOCX, XLSX, PPTX, PDF,
Scan-PDF und PNG/JPEG/BMP. Sie anonymisiert **nicht**: Namen und andere Inhalte
bleiben erhalten. Bilder und Scan-Seiten werden mit der mitgelieferten lokalen
Deutsch-/Englisch-Texterkennung gelesen. OCR und komplexe Layouts können
unvollständig sein; Hinweise erscheinen beim Abschluss. Die Ausgaben behalten
den Basisnamen der Quelle und wechseln nur auf `.md`; gleiche Basisnamen erhalten
` (2)`, ` (3)` usw. Es wird keine Zuordnungsdatei erstellt. Passwortgeschützte oder defekte Dateien werden einzeln
übersprungen. Die übrigen Dateien werden weiter verarbeitet.

Optional kann vor dem Start **In Markdown umwandeln und anonymisieren** gewählt
werden. TXT, Markdown und CSV laufen direkt durch den Privacy-Core. DOCX und
breite Quellen werden einmal lokal extrahiert; gültiger, nichtleerer Markdown-Inhalt
wird anschließend vollständig anonymisiert. Ein Hinweis `incomplete` bezieht
sich ausschließlich auf die Abdeckung des ursprünglichen Containers und bleibt
im Ergebnis sichtbar; er behauptet nicht, dass die Markdown-Anonymisierung
unvollständig war. Leere OCR, beschädigte oder unsichere Quellen werden als
einzelne Datei gestoppt. Die übrigen Dateien des Stapels laufen weiter. Bei
unklaren personenbezogenen Angaben kann eine lokale Prüfung nötig sein.

Bei einer Ordnerauswahl bleibt unterhalb von `Lauf-…` die komplette relative
Unterordnerstruktur erhalten. Aus `bereich/quelle.xlsx` wird im
Anonymisierungsmodus je nach Auswahl
`bereich/Dokument-001-anonymisiert.md` oder
`bereich/quelle-anonymisiert.md`; die `DataSecure-Zuordnung.csv` nennt genau
den Quellpfad und den tatsächlich erzeugten relativen Ergebnispfad. Im Modus
**Nur in Markdown umwandeln** entsteht `bereich/quelle.md` und keine
Zuordnungsdatei. Datei- und Ordnernamen werden nicht anonymisiert, bleiben aber
vollständig lokal und erscheinen nicht in Diagnoseprotokollen.

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

Für eine formale Freigabe anschließend nicht frei protokollieren, sondern die
Windows-Spur im [N3/N4-Testplan](../../docs/acceptance/FORMAL_UAT/README.md)
verwenden. Dort werden Commit, Paket-SHA-256, N3-Technik und N4-Anwendung
einheitlich mit dem Mac-Lauf zusammengeführt.
