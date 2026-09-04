# DataSecure IT-Betriebshandbuch

Stand: 03.09.2026 · 3.2.0-rc98

## Produktkanäle

IT verteilt heute das zielsystemspezifische Plugin-ZIP. Der private Marketplace
ist der gleichwertige Zielkanal, aber noch nicht freigegeben: Der aktuelle
Marketplace-Quellordner im Repository startet mit `command: node`, enthält den
gesperrten OCR-Engineering-Baum und keine gebündelte Runtime; er ist ein
Entwicklungskatalog (siehe RELEASE.md). Vor Rollout werden ZIP und – nach
Bereitstellung der selbsttragenden Projektion – Marketplace getrennt frisch
installiert, aktualisiert und zurückgerollt. Zusätzliche Engineering-Artefakte
sind kein Nutzer-, Fallback- oder Supportweg.

Der aktuelle Produktpfad verarbeitet TXT, Markdown, CSV und DOCX. XLSX, PPTX,
PDF/Scan-PDF, eigenständige Bilder, beschädigte und verschlüsselte Dateien bleiben
fail-closed gesperrt.

## Voraussetzungen und Hostgate

- unterstützte Claude-Desktop-/Cowork-Version mit laufender Desktop-App. Cowork
  darf die Sitzung standardmäßig in der Cloud ausführen; der lokale Plugin-MCP
  läuft nicht in der Cloud, sondern auf dem Rechner und wird über die aktive
  Desktop-Brücke erreicht. Der DataSecure-Prozess und seine Originalverarbeitung
  bleiben lokal.
- lokale Plugin-MCPs durch Organisations-/Geräterichtlinie erlaubt (MDM-Schlüssel
  `isLocalDevMcpEnabled` darf nicht auf `false` stehen);
- lokaler, nicht synchronisierter Privacy-Ordner;
- genügend Speicher für höchstens 100 Dateien/500 MiB plus temporäre Kopien;
- alle Laufzeiten aus dem Paket, keine manuelle Node-/Python-Installation.

Eine Sitzung ohne aktive lokale Desktop-Brücke darf keinen Originalpicker und
keinen Originalzugriff erhalten. Eine in Web oder Mobil gestartete oder geplante
Aufgabe ist deshalb kein Originaleingang. Eine auf Desktop gestartete
Cloud-Sitzung kann bei geöffneter Desktop-App von Web oder Mobil weiter begleitet
werden; die lokale Brücke muss für weitere lokale Zugriffe online bleiben.

## Installationstest

1. Plugin in Claude Desktop über Einstellungen → Anpassen → Plugins → „Aus Datei
   hochladen“ installieren, Claude vollständig beenden und neu starten. Der
   Bereich „Claude Code“ und die Kommandozeile nutzen einen anderen Speicher
   (`~/.claude/plugins`); Cowork startet daraus nichts.
2. In der geöffneten Claude-Desktop-App eine neue Cowork-Aufgabe öffnen.
3. „Dateien anonymisieren“ schreiben.
4. Beim ersten Lauf erwartet: zuerst einmalig die lokale Ergebnisordnerwahl. Einen
   dedizierten leeren, bereits mit Cowork verbundenen Test-Arbeitsordner wählen.
   Originale liegen außerhalb dieses Ordners. Danach öffnet
   sich genau ein lokaler Mehrfachpicker; diesen mit Abbrechen schließen.
5. Beim zweiten Start erwartet: nur der Mehrfachpicker, keine erneute Ergebnis-
   ordner-, Start-, Bild- oder Exportbestätigung.
6. Anschließend mit synthetischen Daten das
   [UAT-Kit](acceptance/UAT_TEST_KIT/README.md) durchführen.

Fehlt der Picker, keinen Chat-Upload, anderen Connector oder Engineeringweg als
Ersatz verwenden. Plugin-/Connectorstatus, Claude-Version und Richtlinien prüfen.
Der optionale Berechtigungsmodus **Auto** kann Host-Rückfragen verringern, sofern
die Organisation ihn zulässt. Organisationsrichtlinien können einzelne
Bestätigungen erzwingen. **Skip** ist für sensible Dokumente kein Betriebsstandard.

## Lokale Verzeichnisse und Löschung

| Bereich | Betrieb |
|---|---|
| Quelle/Original | nur lesen; nie verschieben, überschreiben oder automatisch löschen |
| temporäre Arbeits-/Reviewdaten | 0–14 Tage, danach nur eindeutig DataSecure-eigene Daten bereinigen |
| fertige Outputs/Export/Mapping | niemals automatisch löschen; nur ausdrückliche lokale Nutzeraktion |

Sichtbare Ergebnisse werden getrennt unter
`<gewählter Cowork-Arbeitsordner>/DataSecure-Output/Lauf-…/` abgelegt. Dort dürfen
nur neutrale `Dokument-NNN-anonymisiert.md`-Dateien liegen. Mapping, Originale,
Audit, Review und Recovery bleiben im privaten Bereich. Mit der Chat-Bitte
**„Ändere den DataSecure-Ergebnisordner“** (Werkzeug „Ergebnisordner festlegen“)
kann der Zielordner später bewusst neu gewählt werden; solange ein Stapel offen,
pausiert oder vertagt ist, bleibt er unverändert (zuerst fortsetzen, abschließen
oder verwerfen). Nur ein fehlgeschlagener Export wird nachgeholt; abgeschlossene
Exporte sind endgültig, gelöschte oder bearbeitete Ergebnisdateien werden nicht
wiederhergestellt, und ein Zielwechsel spiegelt keine alten Läufe. Ein
Cloud-Sync-Ziel kann die freigegebenen Ergebnisse synchronisieren und ist daher
eine bewusste Betriebsentscheidung, kein lokaler Privacy-Speicher.
| verschlüsselte Altartefakte | unangetastet lassen; kein Keyringversuch; Original neu wählen |

Der Privacy-Ordner darf nicht in OneDrive, iCloud, Dropbox, Google Drive,
Netzlaufwerken, Symlinks oder Junctions liegen. Ordnerwechsel nur ohne aktiven
Stapel und nach Neustart.

## Supportmodus und Logs

Der normale Anwenderweg besitzt keine Diagnoseabfrage. Für einen konkreten Fall
installiert IT vorübergehend das separat gebaute, sichtbar als **Debug**
gekennzeichnete ZIP. Es setzt intern `EU_PRIVACY_SUPPORT_MODE=1` und ergänzt den
nur manuell aufrufbaren Skill `gbh-datasecure-debug-anonymisieren`. Installierte
Dateien werden nicht bearbeitet. Debug- und Normalpaket werden nicht parallel
betrieben; nach der Untersuchung wird das Debugpaket entfernt und das normale
ZIP wieder installiert. Beide verwenden exakt dieselbe Anonymisierungsengine.
Erlaubte Supportdaten: Version, Phase, Dauer, fester Fehlercode und zufällige
technische Laufkennung.

Verboten: Inhalte, erkannte Rohwerte, Dateinamen, Pfade, Dokumenthashes,
Paketkennungen, Tokens oder Capabilities. Es gibt zwei inhaltsfreie Spuren unter
`%LOCALAPPDATA%\SecureDataMsg\diagnostics\`: `events.jsonl` mit einem Ergebnis je
Dokument (14 Tage, 200 Einträge) und `workflow-events\` mit unveränderlichen
JSON-Einzelereignissen je Lauf (14 Tage, 300 Einträge, etwa elf Ereignisse je
Lauf). Dadurch gehen parallele Eltern-/Worker-Ereignisse nicht verloren. Eine
vor dem Upgrade vorhandene `workflow-events.jsonl` wird weiterhin gelesen, aber
nicht mehr beschrieben. Zwei große Stapel am selben Tag können in `events.jsonl` die ältesten
Dokumentergebnisse verdrängen; `diagnostic_status` nennt die tatsächlich
vorgehaltene Anzahl.

Nur im Debugpaket entsteht zusätzlich
`%LOCALAPPDATA%\SecureDataMsg\diagnostics\support-events\`. Jede JSON-Datei ist
ein unveränderliches technisches Ereignis. Dadurch können MCP-Elternprozess,
Intake- und Reviewworker einander keine Diagnosezeilen überschreiben. Höchstens
2.000 Ereignisse und 14 Tage werden berücksichtigt. Rohes JSON-RPC, Argumente,
Ergebnisse und freie Fehlermeldungen werden gerade **nicht** gespeichert. Für
macOS und Linux liegt dasselbe relative Verzeichnis unter dem jeweiligen
Produktdatenstamm. Der Anwender muss diese Ordner nicht vorher anlegen.

Windows benötigt ausschließlich den regulären lokalen Produktdatenstamm unter
`%LOCALAPPDATA%\SecureDataMsg`. `%APPDATA%\SecureDataMsg` und
`%USERPROFILE%\.local\share\SecureDataMsg` sind keine Windows-Produktpfade und
müssen weder existieren noch beschreibbar sein; `.local/share` ist nur der
Linux/POSIX-Fallback.

## Fehlercodes – immer mit Klartext

| IT-Code | Klartext für Anwender | Aktion |
|---|---|---|
| `SOURCE_FORMAT_NOT_RELEASED` | Dieses Dateiformat ist noch nicht freigegeben. | Quelle unverändert lassen; kein Upload |
| `SOURCE_TYPE_MISMATCH` | Endung und tatsächlicher Dateityp passen nicht sicher zusammen. | Datei lokal prüfen/neu erzeugen |
| `AMBIGUITY_REVIEW_REQUIRED` | Eine Organisation kann nicht sicher eingeordnet werden. | lokalen Sammelreview starten oder vertagen |
| `PARSER_ISOLATION_FAILED` | Die lokale Sicherheitsgrenze ist nicht bereit. | Plugin reparieren/neu installieren, nicht umgehen |
| `PARSER_RESOURCE_LIMIT` | Die Datei überschreitet ein lokales Sicherheitsbudget. | nicht automatisch wiederholen |
| `UNSAFE_STORAGE_LOCATION` | Der Privacy-Ordner ist kein sicherer lokaler Ort. | anderen lokalen Ordner wählen |
| `STARTUP_RECOVERY_FAILED`, `STARTUP_OUTBOX_RECOVERY_FAILED`, `STARTUP_MIGRATION_FAILED`, `STARTUP_CLEANUP_FAILED` | Der lokale Dienst hat den Start sicher verweigert, weil ein Wiederherstellungsschritt nicht abgeschlossen werden konnte. | `%LOCALAPPDATA%\SecureDataMsg` auf Rechte, Sperren und Restbestände prüfen; nichts löschen, IT einbeziehen |
| `RUNTIME_INTEGRITY_FAILED` | Die gebündelte Laufzeit stimmt nicht mit dem Paketnachweis überein. | Plugin aus dem verifizierten ZIP neu installieren; Prüfsumme gegen `SHA256SUMS` vergleichen |

## Verweigerter Start

Verweigert der Dienst den Start (fail-closed), erscheint in Cowork nur ein
fehlender Connector. Der Grund steht lokal an drei Stellen: als Ereignis
`startup_refused` mit festem Code unter `workflow-events\`, in der Datei
`%LOCALAPPDATA%\SecureDataMsg\diagnostics\startup-refused.json` (Zeitpunkt,
Version, Code) und als eine Zeile auf dem Fehlerkanal des Prozesses, die kein
Pfad und keine Rohdaten enthält. Beim Start im gebündelten Paket wird die
laufende Programmdatei zusätzlich gegen `RUNTIME-EVIDENCE.json` geprüft; eine
beschädigte oder ausgetauschte Laufzeit stoppt mit `RUNTIME_INTEGRITY_FAILED`.
Jedes Ablaufereignis trägt eine zufällige Laufkennung `run_id` (8 Hexzeichen,
aus nichts abgeleitet), mit der die Ereignisse eines Laufs aus Elternprozess und
Worker zusammengehören. Diese Kennung bleibt aus Skills, Normalablauf,
Ergebnisdateien und Mapping heraus. Sie ist nur nach ausdrücklichem Supportaufruf
in `diagnostic_status` sowie im ausdrücklich bestätigten, rein lokalen
Diagnoseexport sichtbar; beides enthält weiterhin weder Rohwerte noch Namen,
Pfade, Tokens oder Dokument-Hashes.

## Upgrade und Rollback

Vorher Version, Artefakt-SHA-256 und inhaltsfreie Konfiguration sichern. Quellen
und fertige Exporte bleiben unangetastet. Verschlüsselte historische Altbestände
werden weder migriert noch gelöscht. Nach Upgrade/Rollback: Picker-Abbruchtest,
synthetischer Kernfall, Resume und Mapping prüfen.

Cowork hält hochgeladene Plugins in einem eigenen, sitzungsgebundenen Cache
(„My Uploads“, unter `%APPDATA%\Claude\local-agent-mode-sessions\…\rpm\`). Ein
erneuter Upload derselben Plugin-Kennung und ein Neustart der App ersetzen die
gecachte Kopie nach Beobachtung vom 03.09.2026 nicht zuverlässig; Cowork
verarbeitete weiter mit der alten Version, ohne dass die Oberfläche das anzeigte.
Das ist ein beim Hersteller offen gemeldeter Hostfehler (anthropics/claude-code
#69020 offen, #65426 „not planned“); der folgende Ablauf ist ein Workaround, keine
Behebung. Der versionierte Marketplace (RELEASE.md) mit Prüfsummen-Pinning ist
der Zielkanal; der Build legt dafür `dist/marketplace.release.json` ab.
Verlässlicher Ablauf für Upgrade wie Rollback: Plugin auf der Plugin-Seite
entfernen, Claude Desktop vollständig beenden und neu starten, gewünschtes ZIP
hochladen, auf der Plugin-Seite Version, Dateiansicht und Aktualisierungszeit
prüfen, danach eine neue Cowork-Aufgabe starten. Die tatsächlich laufende Version
steht in der Startantwort („DataSecure-Version: …“), in der letzten Zeile jedes
lokalen DataSecure-Fensters und für den Support als `gateway_version` in
`%LOCALAPPDATA%\SecureDataMsg\diagnostics\workflow-events\`. Weicht sie vom
bereitgestellten Build ab, ist kein Abnahmelauf gültig.

## Eskalation

P0: Original verändert/gelöscht, Rohinhalt im Chat, gestoppte Datei mit Teiloutput,
oder falsches Ergebnis als vollständig. Verarbeitung sofort beenden, Evidence
inhaltfrei sichern, Datenschutz/Security einbeziehen. Andere Defects nach
Reproduktion mit synthetischen Daten ins kanonische Backlog aufnehmen.
