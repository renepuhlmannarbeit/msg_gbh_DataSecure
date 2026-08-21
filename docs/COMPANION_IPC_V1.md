# DataSecure Companion IPC v1

Status: privater IPC- und nativer File-Picker-Slice implementiert; Packaging und
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

## Bewusste Nicht-Claims

- Der Slice ist noch kein signiertes natives Binary.
- Der MCP-Prozess startet den Companion noch nicht automatisch.
- Dateiauswahl erzeugt zunächst nur Job und flüchtige Source-Bindung; Extraktion und
  Review-UI werden im folgenden Vertical Slice integriert.
- Ein authentifizierter Prozesskanal allein ersetzt keine Codesignatur,
  Installationsherkunft oder echte UI-Akzeptanztests.

## Nächste Abnahme

1. Supervisor/Launcher an die MCP-Fassade anbinden, ohne den Session-Key offenzulegen.
2. DOCX-/Text-PDF-Worker aus der flüchtigen Source-Bindung starten.
3. Source-Locator-basierte lokale Gegenüberstellung implementieren.
4. UI-Klick für Review/Skip an Job-ID und Output-Hash binden.
5. Codesignatur, Upgrade/Rollback und reale Plattformtests nachweisen.
