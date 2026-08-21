# DataSecure Companion IPC v1

Status: privater IPC, MCP-Supervisor und TXT-/DOCX-Vertical-Slice mit nativer
Dateiauswahl und lokaler Skip-Bestätigung implementiert; Review-UI, Packaging und
Codesignatur noch nicht implementiert.

## Sicherheitsgrenze

Der Companion öffnet keinen TCP-, HTTP- oder Loopback-Listener. Der Supervisor
startet ihn mit geerbten stdin/stdout-Pipes. Ein zufälliger 256-Bit-Session-Key wird
nicht über Argumente oder Umgebungsvariablen übergeben, sondern ausschließlich über
den zusätzlichen geerbten Dateideskriptor 3.

Der Server veröffentlicht beim Start nur eine datensparsame Session-Beschreibung.
Jeder folgende Frame enthält:

- eine zufällige Session-ID,
- eine streng steigende Sequenznummer,
- einen bekannten Befehl mit strikt geprüften Parametern,
- einen HMAC-SHA-256 über den kanonischen Frame.

Falsche Signaturen, Replay, Lücken, fremde Sessions, unbekannte Befehle und
Zusatzfelder werden fail-closed abgewiesen. Der Schlüssel bleibt nur im Speicher des
lokalen Prozessverbunds.

## Lokale Dateiauswahl

`pick_source` öffnet einen nativen Dialog außerhalb Claude:

- Windows: `System.Windows.Forms.OpenFileDialog` über das gebündelte Windows
  PowerShell,
- macOS: `/usr/bin/osascript` mit `choose file`,
- Linux: `zenity`, mit lokalem `kdialog` als Fallback.

Die Auswahl wird anschließend erneut gegen das Dateisystem geprüft: absoluter Pfad,
unterstützte Endung, reguläre Datei, kein Symlink und höchstens 100 MiB. Pfad und
Dateigröße bleiben im flüchtigen Companion-Speicher. Claude-Antworten und das
append-only Jobjournal enthalten weder Pfad noch Dateinamen oder Rohbytes.

## Lokale Aktionen

Nur ein authentifizierter IPC-Frame kann `cancel_job` oder `purge_jobs` auslösen.
Der Companion erzeugt dafür die kurzlebige `local_companion`-Action-ID selbst. Diese
Befehle sind nicht als MCP-Tools veröffentlicht und besitzen daher keine
modellseitige Aufruffläche.

Der MCP-Einstieg `prepare_local_document` darf den privaten Companion starten und
damit den lokalen Dateidialog öffnen. Er erhält weder den gewählten Pfad noch
Originalbytes oder Action-Token. Für TXT und textuell vollständig auswertbare DOCX
läuft die Verarbeitung bis `Detected`. Vor `Skipped -> Verified -> Released` zeigt
der Companion einen zweiten Betriebssystemdialog mit der Trefferzahl. Nur dessen
lokale Bestätigung erzeugt die Action-ID. DOCX mit zurückgehaltenen Bildern oder
technischen Unsicherheiten kann über diesen Dialog nicht freigegeben werden.

Das Benutzeroriginal wird nicht verschoben. Eine private Arbeitskopie existiert nur
während der Verarbeitung und wird vor Veröffentlichung entfernt. Companion-Pakete
sind zusätzlich zum Paket-Hash an ein terminales `Released`-Journal mit demselben
Dokument-SHA-256 gebunden.

## Bewusste Nicht-Claims

- Der Slice ist noch kein signiertes natives Binary.
- Eine Gegenüberstellung von Original und bereinigter Fassung sowie manuelle
  Korrekturen sind noch nicht implementiert. Der aktuelle sichere Weg ist ausschließlich
  die bewusst bestätigte Option „ohne zusätzliche Textprüfung fortfahren“.
- PDF und weitere Formate verwenden weiterhin den bestehenden Input-Ordner-Pfad.
- Ein authentifizierter Prozesskanal allein ersetzt keine Codesignatur,
  Installationsherkunft oder echte UI-Akzeptanztests.

## Nächste Abnahme

1. Source-Locator-basierte lokale Gegenüberstellung und Korrekturen implementieren.
2. Text-PDF in den privaten Vertical-Slice aufnehmen.
3. Parser/OCR in ressourcenbegrenzte, netzlose Worker auslagern.
4. Codesignatur, Upgrade/Rollback und reale Plattformtests nachweisen.
