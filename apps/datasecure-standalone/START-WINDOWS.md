# DataSecure Standalone starten (Windows x64)

Anleitung für **3.2.0-rc159** und die neue Oberfläche. Das passende
[RC159-ZIP und seine Prüfsumme](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc159)
vollständig entpacken. Dies ist ein Test-Prerelease, keine abgeschlossene
menschliche Plattform-, Bedien- oder Barrierefreiheitsfreigabe.

## Verarbeitung und Prüfung

1. `DataSecure Standalone.exe` doppelklicken. Voraussetzung: Windows 10/11 x64
   mit vorhandenem Microsoft Edge WebView2. DataSecure lädt keine Runtime nach.
2. Unter **Neue Verarbeitung** die Aufgabe **Nur umwandeln** (Zweck:
   **Nur in Markdown umwandeln**) oder **Umwandeln und anonymisieren** wählen.
   Anfangs ist keine Aufgabe vorbelegt; Auswahl allein verarbeitet nichts.
3. Dateien oder einen Ordner hinzufügen, gewünschte Dateien anhaken und das
   Ergebnisziel kontrollieren. Unterordner werden berücksichtigt. Der Katalog
   kann mehr Dateien enthalten; pro Verarbeitung höchstens 200 Dateien / 500 MB
   auswählen. Weitere Dateien lassen sich vor dem Start ergänzen.
4. **Verarbeitung starten** wählen (in früheren Versionen **Starten**).
   Die Laufkarte zeigt Fortschritt, laufende Arbeit und Dateiprobleme.
   **Pausieren** stellt die aktuelle Datei einschließlich Bereitstellung fertig;
   danach beginnt keine weitere Datei. **Verarbeitung fortsetzen** setzt diesen
   Lauf fort. Neue Eingaben gehören in eine **Neue Verarbeitung**.
5. Bei **Jetzt prüfen** die Fundstellenprüfung direkt am Lauf öffnen.
   Checkboxen wählen nur aus. Eine gemeinsame Behandlung merkt Entscheidungen
   zunächst vor; erst **Gruppe übergeben und weiter** speichert die vollständig
   bearbeitete Gruppe. Offen-Filter, weitere Seiten und Folgegruppen beachten.
   Der Original-/Markdown-Vergleich gehört jeweils zum angezeigten Punkt.
   OCR-Kontaktwerte mit den Originalbildpixeln vergleichen. **Als Person**,
   **Als Unternehmen** und **Beibehalten** sind unterschiedliche Entscheidungen;
   nachweislich gleiche vollständige Werte gelten für den betreffenden Lauf.
6. Nach Abschluss aller Fundstellengruppen öffnet sich bei Anonymisierung die
   Dokumentprüfung **desselben Laufs**. Das ist noch kein KI-Export:
   Originaltext und geplantes Markdown vergleichen, gewünschte Dokumente
   auswählen und **Auswahl freigeben** wählen. Änderungen heben betroffene
   Freigaben auf. Über **Ergebnisse prüfen und freigeben** im Verlauf lässt
   sich die Dokumentprüfung später wieder öffnen.
7. **Auswahl für KI exportieren** wählen und den angezeigten Auftrag
   ausdrücklich bestätigen. Nur freigegebene aktuelle Markdown-Stände werden
   in einen **normalen separaten Ordner** kopiert. Originale, Identitäts- und
   Dateizuordnung, private Prüfstände und technische Begleitdateien sind nicht
   enthalten. Der technische Laufordner ist nicht dieser KI-Exportordner.

**Später entscheiden** verschiebt die Prüfung des konkreten Laufs. Noch nicht
übergebene Eingaben sind nicht gespeichert. Der **Verlauf** enthält höchstens
20 Verarbeitungen mit jeweils eigenen Aktionen; Fortsetzen oder Prüfen wählt
keinen anderen Lauf. Nach Verbindungsverlust werden Starts, Entscheidungen und
Exportbestätigungen nicht blind wiederholt. Den gespeicherten Stand bewusst
neu laden und die angezeigte Wiederherstellung abwarten.

Bei reiner Umwandlung bleiben Originalinhalte erhalten: **Markdown nachkorrigieren**
bietet die nachträgliche Korrektur. Ein Markdown-Export ist ausdrücklich
**nicht anonymisiert**. Fundstellenbestätigung, Dokumentfreigabe und Export
bleiben getrennt; eine technische Erfolgsmeldung ersetzt keine Inhaltsprüfung.

## Ergebnisse, Formate und Fehler

TXT, Markdown, CSV, DOCX, XLSX, PPTX, PDF, Scan-PDF und PNG/JPEG/BMP werden
lokal verarbeitet. Breite Formate werden zuerst extrahiert; anonymisiert wird
der extrahierte Markdown-Inhalt, nicht der ursprüngliche Container. OCR und
komplexe Layouts können Lesefehler oder Auslassungen verursachen. Im synthetischen
Qualitätskorpus bleiben neun rohe OCR-E-Mail-Abweichungen als bekannte Warnung.

Technische Ergebnisse liegen unter `DataSecure-Markdown/Lauf-…` beziehungsweise
`DataSecure-Output/Lauf-…`. Anonymisierung nutzt neutrale Ergebnisnamen.
Die lokale `DataSecure-Zuordnung.csv` und
`VERTRAULICH-NICHT-HOCHLADEN` enthalten Originalangaben. **Nie den gesamten
Laufordner an eine KI geben.** Stattdessen den getrennten freigegebenen
KI-Export verwenden. Die Identitätszuordnung wird nicht automatisch gelöscht.
Reine Markdown-Konvertierung erzeugt keine Dateizuordnung.

Nicht unterstützte Eingaben und verarbeitungsbezogene Probleme werden lokal
mit Dateinamen einschließlich Endung, festem Fehlercode und nächstem Schritt
angezeigt. Passwortgeschützte Dateien müssen außerhalb der App entschlüsselt
werden; es gibt kein Quellenpasswortfeld. Sichere Ergebnisse anderer Dateien
dürfen nicht mit einem vollständigen Laufabschluss verwechselt werden.
Fehlen private Laufdetails später, können einzelne Dateinamen nicht mehr
rekonstruiert werden; Diagnoseprotokolle enthalten bewusst keine Namen,
Quellpfade oder Dokumentinhalte.

## Startprobleme und Testgrenzen

Node.js, Rust, Claude, Cowork und Internetzugang sind nicht erforderlich.
Originaldateien werden niemals verändert oder automatisch gelöscht.

Wenn die Oberfläche nicht startet, versucht DataSecure einen inhaltsfreien
Startbericht anzulegen. In `cmd` im entpackten App-Ordner
`"DataSecure Standalone.exe" --startup-diagnostics` ausführen. Wenn Windows
bereits den Prozessstart blockiert, kann die App keinen Bericht schreiben.
Betriebssystemmeldung und Prüfsumme mit der IT prüfen; Schutzfunktionen nicht
pauschal deaktivieren. Das Testpaket besitzt keine Windows-Codesignatur.

Native technische Runner-Prüfungen ersetzen nicht die Bedienung auf deinem
Gerät. Für formale Nachweise den
[N3/N4-Testplan](../../docs/acceptance/FORMAL_UAT/README.md) verwenden.
Der frühere bestätigte RC157-Anwenderlauf bleibt historische Evidenz seines
damaligen Pakets und ist keine neue RC159-Abnahme.
