# DataSecure Companion IPC v1

Status: privater IPC, MCP-Supervisor und TXT-/DOCX-Vertical-Slice mit nativer
Dateiauswahl sowie lokaler Redaktionsprüfung unter Windows implementiert;
plattformübergreifende Review-UI, Packaging und Codesignatur noch nicht implementiert.

## Sicherheitsgrenze

Der Companion öffnet keinen TCP-, HTTP- oder Loopback-Listener. Der Supervisor
startet ihn mit geerbten stdin/stdout-Pipes. Ein zufälliger 256-Bit-Session-Key wird
nicht über Argumente oder Umgebungsvariablen übergeben, sondern ausschließlich über
den zusätzlichen geerbten Dateideskriptor 3.

Bei Supervisor-Timeout oder Protokollfehler versucht der aktuelle Windows-Adapter,
den gesamten Companion-Prozessbaum zu beenden. Eine harte OS-Garantie folgt erst mit
dem geplanten Job-Object-Launcher. Jeder private Arbeitsordner besitzt eine
PID-/Nonce-Ownerdatei; ein späterer Start oder Lauf entfernt verwaiste
Arbeitskopien. Lebende Owner, unbekannte Ordner und Symlinks werden nicht gelöscht,
und ein Bereinigungsfehler blockiert die nächste Verarbeitung sichtbar.

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

`pick_sources` öffnet einen nativen Dialog außerhalb Claude. Unter Windows kann
der Anwender eine oder bis zu 25 TXT-/DOCX-Dateien gleichzeitig auswählen;
`pick_source` bleibt als interner Einzeldatei-Befehl kompatibel:

- Windows: `System.Windows.Forms.OpenFileDialog` über das gebündelte Windows
  PowerShell,
- macOS: `/usr/bin/osascript` mit `choose file`,
- Linux: `zenity`, mit lokalem `kdialog` als Fallback.

Jede Auswahl wird anschließend erneut gegen das Dateisystem geprüft: absoluter
Pfad, unterstützte Endung, reguläre Datei, kein Symlink und höchstens 100 MiB.
Doppelte Einträge und mehr als 25 Dateien werden abgewiesen. Pfade und Dateigrößen
bleiben im flüchtigen Companion-Speicher. Claude-Antworten und die append-only
Jobjournale enthalten weder Pfad noch Dateinamen oder Rohbytes.

## Lokale Aktionen

Nur ein authentifizierter IPC-Frame kann `cancel_job` oder `purge_jobs` auslösen.
Der Companion erzeugt dafür die kurzlebige `local_companion`-Action-ID selbst. Diese
Befehle sind nicht als MCP-Tools veröffentlicht und besitzen daher keine
modellseitige Aufruffläche.

Der MCP-Einstieg `prepare_local_document` darf den privaten Companion starten und
damit den lokalen Mehrfachdialog öffnen. Er erhält weder die gewählten Pfade noch
Originalbytes oder Action-Token. Aus jeder Auswahl entsteht ein eigener privater
Job; die Verarbeitung läuft sequenziell und ein Fehler stoppt nur die betroffene
Datei. Die datensparsame Zusammenfassung nennt Anzahl ausgewählter, freigegebener
und gestoppter Dateien sowie die Paket-IDs erfolgreicher Ergebnisse. Für TXT und
textuell vollständig auswertbare DOCX läuft die Verarbeitung bis `Detected`.
Nach Abschluss einer Mehrfachauswahl zeigt der MCP-Supervisor lokal genau einmal eine
rein informative Ansicht mit den drei Zählern „Ausgewählt“, „Erfolgreich vorbereitet“
und „Sicher gestoppt“. Sie enthält keine Dateinamen, Pfade, Inhalte, Job-/Paket-IDs
oder technischen Fehler. Ihr einziger Button „Schließen“ beendet nur die Ansicht;
sie ist weder Teil des authentifizierten Zustandsautomaten noch eine Freigabeinstanz.
Ein Darstellungsfehler darf bereits gültig veröffentlichte Pakete nicht zurückrollen.
Bei einer einzelnen Datei entfällt diese zusätzliche Ansicht.
Unter Windows zeigt der Companion danach
normalisierten extrahierten Quelltext und bereinigte Fassung ausschließlich lokal
nebeneinander. Heuristisch erkannte Originalspannen sind als flüchtige
`text:v1:*`-Hinweise markiert. In der schreibgeschützten bereinigten Fassung können
zusätzliche sensible Spannen ausschließlich zur Ersetzung durch
`[MANUAL_REDACTION]` ausgewählt werden; freie fachliche Textänderungen sind nicht
möglich. Eine zweite schreibgeschützte Ansicht zeigt vor der Freigabe die exakt aus
diesen Auswahlen entstehende Fassung. Fachlich mehrdeutige Zertifikatsanbieter
werden nacheinander mit genau einer Frage und den Antworten „Ja, beibehalten“ oder
„Nein, Namen ersetzen“ geklärt; eine vorherige Entscheidung kann lokal geändert
werden. Solange eine solche Entscheidung offen ist, ist Überspringen nicht sichtbar.
„Geprüft freigeben“ erzeugt `Reviewed`, „Prüfung überspringen“ erzeugt `Skipped`.
Beide Aktionen erhalten erst nach einem erneuten
Residual-Gate über die exakte Ausgabe den Zustand `Verified`. DOCX mit
zurückgehaltenen Bildern oder technischen Unsicherheiten kann über diesen Dialog
nicht freigegeben werden.
Unbekannte inhaltsfähige DOCX-Parts, beispielsweise Embeddings oder nicht
unterstützte SmartArt-/Diagramm-Parts, gelten ebenfalls als technische Unsicherheit.

Der feste PowerShell-Programmtext enthält keine Dokumentdaten. Der Review-Entwurf
wird nur über stdin an den lokalen UI-Unterprozess übergeben; stdout enthält nur die
Aktion und bei `Reviewed` wertfreie Offset-Bereiche für zusätzliche Ersetzungen.
Weder Entwurf noch Markierungshinweise
werden über den authentifizierten MCP-/Supervisor-Kanal zurückgegeben oder im
Jobjournal persistiert.

Das Benutzeroriginal wird nicht verschoben. Im Normalfall existiert eine private
Arbeitskopie nur während der Verarbeitung und wird vor Veröffentlichung entfernt;
nach einem harten Prozessabbruch entfernt sie die beschriebene Orphan-Bereinigung.
Companion-Pakete
sind zusätzlich zum Paket-Hash an ein terminales `Released`-Journal mit demselben
Dokument-SHA-256 gebunden.

## Bewusste Nicht-Claims

- Der Slice ist noch kein signiertes natives Binary.
- Die lokale Redaktions-Gegenüberstellung ist im Pilot nur unter Windows implementiert;
  macOS und Linux stoppen an dieser Stelle fail-closed.
- Die aktuellen Markierungen sind normalisierte Textoffset-Hinweise aus einem
  separaten Detektorlauf, kein vollständiger Provenienz-Trace der Transformation.
  Strukturbezogene OOXML-Locatoren und tatsächliche Replacement-Provenienz sind noch
  nicht implementiert.
- PDF und weitere Formate verwenden weiterhin den bestehenden Input-Ordner-Pfad.
- Ein authentifizierter Prozesskanal allein ersetzt keine Codesignatur,
  Installationsherkunft oder menschliche Usability-Abnahme. Der echte Windows-
  Formularpfad wird automatisiert mit einer synthetischen Auswahl, Vorschau und
  Freigabe geprüft; macOS/Linux und die Bedienbarkeit durch Pilotanwender bleiben offen.

## Nächste Abnahme

1. Menschliche Windows-Usability-Abnahme durchführen und lokale Review-UI für
   macOS und Linux produktionsfähig umsetzen.
2. Text-PDF in den privaten Vertical-Slice aufnehmen.
3. Parser/OCR in ressourcenbegrenzte, netzlose Worker auslagern.
4. Codesignatur, Upgrade/Rollback und reale Plattformtests nachweisen.
