# DataSecure IT-Betriebshandbuch

Version 3.2.0 RC45 · Stand 22.08.2026

Dieses Handbuch richtet sich an IT-Administration, Pilotverantwortliche und
Support. RC45 ist ein Engineering-Build für synthetische Testdaten. Es ist weder
produktionsfreigegeben noch signiert und darf nicht mit echten Beschäftigten-,
Bewerber-, Kunden- oder Vertragsdokumenten pilotiert werden.

## 1. Betriebsmodell und Sicherheitsgrenze

DataSecure verarbeitet Originaldateien lokal und veröffentlicht ausschließlich
verifiziertes Markdown. Sämtliche Bildpixel bleiben im öffentlichen Pilot lokal.
Originalpfade, Originalbytes, Review-Texte und lokale Aktionsnachweise sind keine
MCP-Read-Daten. Das Markdown ist nur mit der kurzlebigen paketgebundenen
Leseberechtigung aus demselben Lauf abrufbar.

Es existieren zwei Auslieferungswege:

| Artefakt | Ziel | Status RC45 |
|---|---|---|
| `DataSecure-Privacy-Preflight-v3.2.0-rc48.zip` | Claude-Cowork-Plugin/Organisations-Marketplace | führender Anwenderweg; Skills, lokaler MCP und nativer x64-Launcher; Paket-Skill-Abnahme automatisiert, Runtime-Auflösung in der Zielumgebung noch abzunehmen |
| `DataSecure-Privacy-Gateway-v3.2.0-rc48.mcpb` | lokale Claude-Desktop-Extension | plattformneutraler Engineering-Fallback; frische Installation je Zielplattform noch abzunehmen |

Der lokale MCP öffnet keinen Netzwerklistener. Der private Companion verwendet
authentifizierte geerbte stdio-Kanäle. Das ersetzt keine Codesignatur oder
Installationsherkunft.

Plugin-Skills können in Chat und Cowork erscheinen. Der lokale Dateipfad funktioniert
nur in einem Claude-Desktop-Host oder in Claude Code und nur, wenn `privacy_status`
in der konkreten Unterhaltung verfügbar ist. Das wurde im Zielbuild auch in Cowork
Desktop beobachtet, ist aber vor jeder Freigabe versionsspezifisch zu testen. Web und
Mobil dürfen keine Originaldatei für diesen Preflight erhalten.

## 2. Voraussetzungen

- Unterstützter Engineering-Test: Windows 10/11 x64 mit aktueller Claude-Desktop-Version.
- Windows ARM64 bleibt gesperrt, bis ein separat gebauter und getesteter Launcher
  ausgeliefert wird. Es gibt keinen direkten Node-Fallback.
- Desktop Extensions und lokale MCP-Server dürfen nicht durch Enterprise-Richtlinien
  deaktiviert sein.
- Der angemeldete Nutzer benötigt Schreibzugriff auf den konfigurierten lokalen
  Privacy-Ordner.
- Keine Cloud-OCR-, Remote-MCP- oder Upload-Fallbacks für Originaldaten zulassen.
- Nur Artefakte aus demselben grünen `main`-Commit verwenden; SHA-256 vor der
  Installation mit der Release-Evidenz vergleichen.
- `privacy_status` muss für Parser und Bildverarbeitung `windows_job_object` melden.
  Andernfalls bleibt Textverarbeitung gesperrt beziehungsweise werden Grafiken sicher
  zurückgehalten; niemals PowerShell oder Node manuell als Ausweichweg starten.

Claude Desktop stellt für MCPB-Desktop-Extensions eine eingebaute Node.js-Runtime
bereit. Für Endanwender ist keine separate Node-/npm-Installation vorgesehen. Ob
der Plugin-ZIP seinen lokalen `node`-Start ebenfalls ohne Systemruntime auflöst,
muss der frische Plugin-Installationstest belegen; bis dahin keine entsprechende
Zusage machen.

## 3. MCPB auf einem Testrechner installieren

1. Aktuelle Claude-Desktop-Version installieren und anmelden.
2. `Settings → Extensions → Advanced settings` öffnen.
3. Im Extension-Developer-Bereich `Install Extension…` wählen.
4. Das geprüfte `.mcpb` auswählen, Berechtigungen und vier Konfigurationswerte
   kontrollieren:
   - Privacy-Ordner: leer für den lokalen DataSecure-App-Datenbereich;
   - Sprache: `de`;
   - Grafikmodus: `strict`;
   - Aufbewahrung: `7` Tage für den Engineering-Test.
5. Claude Desktop vollständig beenden und neu starten.
6. Im Chat „Prüfe bitte den Status von DataSecure“ ausführen.
7. Extension-Status und Logs unter `Settings → Extensions` prüfen, falls die Tools
   fehlen.

Offizielle Referenz, vor jedem Rollout erneut prüfen:
<https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop>.

## 4. Plugin-ZIP bereitstellen

Für einen Einzeltest wird das benutzerdefinierte Plugin unter `Customize → Plugins`
hochgeladen. Für Team/Enterprise soll die Organisation einen manuellen oder
GitHub-synchronisierten Marketplace verwalten. Das Repository muss für die
GitHub-Synchronisierung private oder internal bleiben.

Vor einer Organisationsverteilung:

1. ZIP-Größe und Manifest prüfen.
2. Lokalen MCP-Start in genau der vorgesehenen Claude-Oberfläche belegen.
3. Installationseinstellung zunächst `Available for install`, nicht `Required`.
4. Nur einer kleinen Pilotgruppe zuweisen.
5. Update und Rücknahme mit einer synthetischen Testversion proben.

Aktuelle offizielle Referenzen:

- <https://support.claude.com/en/articles/13837440-use-plugins-in-claude>
- <https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization>

## 5. Technische Startprüfung

Ein grüner Startnachweis umfasst mindestens:

- `privacy_status` antwortet mit Version, Retention und formatbezogenen Fähigkeiten;
- `privacy_status` meldet auf Windows x64 `parser_boundary: windows_job_object` und
  auf macOS/Linux `parser_boundary: node_permission_process`; `unavailable` ist ein
  harter Stopp und darf nicht durch eine manuelle Laufzeitkonfiguration umgangen werden;
- der lokale Privacy-Ordner lässt sich öffnen;
- `privacy_status` meldet `storage_safe: true`; bekannte Cloud-Sync- und
  Netzwerkpfade führen zu einem sicheren Stopp;
- `Output`, `Needs Visual Review` und `DataSecure-Export` existieren; ein alter
  `Input`-/`Processed`-Bestand ist nur Migrationsevidenz und kein Eingang;
- 1–100 bestätigte TXT-/Markdown-/CSV-/DOCX-Dateien mit zusammen höchstens 500 MiB werden vor der Verarbeitung an einen
  serverseitigen Snapshot gebunden; ein Aufruf verarbeitet genau eine noch nicht
  versuchte Position, ein Stopp wird nicht automatisch wiederholt und Änderungen am
  Bestand invalidieren den Stapel;
- Einzeldateien werden vor dem Snapshot formatspezifisch begrenzt: TXT/Markdown
  8.000.000 Bytes, CSV 1.500.000 Bytes, DOCX 64 MiB komprimiert und 128 MiB
  entpackt. Es gibt keine feste Seitenbegrenzung; die Ressourcenlimits sind das Gate;
- der ausgewählte Pfad und der Originaltext erscheinen weder im MCP-Ergebnis noch im
  Jobjournal oder Audit;
- das gepackte MCP beantwortet `initialize`;
- `visual_bridge: unavailable` wird als degradierter, fail-closed Modus behandelt:
  Text darf weiterlaufen, alle Grafiken bleiben zurückgehalten.

Die vollständige Abnahme steht in [PILOT-ABNAHME.md](PILOT-ABNAHME.md).

## 6. Datenablage und Aufbewahrung

| Bereich | Inhalt | Standardverhalten |
|---|---|---|
| Private Batchdaten | versiegelte Arbeitskopien und Checkpoints | nach Erfolg sofort, sonst spätestens nach 14 Tagen; künftig OS-benutzergebunden verschlüsselt |
| `Output` | freigegebene Markdown-Pakete | dauerhaft; nur ausdrücklich bestätigt löschbar; Lesen nur mit kurzlebiger Berechtigung |
| `Needs Visual Review` | lokal zurückgehaltene Vorschauen | keine Freigabe über Claude; Preview verfällt |
| `DataSecure-Export` | dauerhaftes Mapping und inhaltsfreier Batchnachweis | keine automatische Löschung |
| Audit | datensparsame Zähler/Status | keine Rohwerte, Namen, Pfade oder Inhalts-Hashes |

Im Pilot werden ausschließlich TXT, Markdown (`.md`), CSV und DOCX über den lokalen
Mehrfachpicker verarbeitet. CSV-Zellen werden nur als Text in eine Markdown-Tabelle
übertragen und nie ausgeführt. PDF und alle weiteren Formate stoppen fail-closed.
Einen ausführbaren Input-Ordner- oder Inbox-Fallback gibt es nicht. Löschfehler werden gemeldet und beim nächsten
Cleanup erneut versucht. Unbekannte Verzeichnisse, Symlinks und Junctions werden
nicht aggressiv entfernt.

Der Standardarbeitsbereich liegt nicht unter `Dokumente`, sondern im lokalen
App-Datenbereich des Betriebssystems. Bekannte OneDrive-, iCloud-Drive-, Dropbox-,
Google-Drive- und Windows-Netzwerkpfade werden blockiert. Das ersetzt keine
administrative Prüfung unbekannter Synchronisationssoftware. Ein alter Ordner
`Dokumente\Claude Privacy` wird beim Upgrade absichtlich weder automatisch kopiert
noch gelöscht; die IT bereinigt oder migriert ihn kontrolliert, ohne sensible Daten
in eine Synchronisation zu verschieben.

### Optionaler IT-verwalteter Stammordner

Im MCPB ist der optionale Konfigurationswert **„Privacy-Ordner (optional)“** bereits
an `EU_PRIVACY_ROOT` gebunden. In der Plugin-ZIP wird derselbe Wert ausschließlich
über `configure_privacy_folder` gesetzt: Der lokale Ordnerdialog speichert den
Stamm ohne Pfadrückgabe an Claude. Der Wert ist ein lokaler Stammordner, etwa
`D:\DataSecure`; ein leerer Wert verwendet den per-Benutzer-App-Datenbereich
`SecureDataMsg\workspace`. Nach jeder Änderung Claude
vollständig neu starten. Der frühere Stamm `ClaudeEUPrivacyDocumentGatewayV32` wird
nicht automatisch migriert oder gelöscht; vor einer kontrollierten Bereinigung sind
lokale Originale und offene Stapel auszuschließen.

Der konfigurierte Pfad wird nie in Toolantworten, Audit oder Diagnose übernommen.
Vor dem Anlegen verwalteter Arbeitsbereiche, `Output`, `Needs Visual Review` und
`DataSecure-Export` validiert der Server den Pfad sowie vorhandene Komponenten. Bei
Cloud-Sync, Netzpfad, Symlink/Junction oder nicht verifizierbarem Stamm ist
`storage_safe: false` beziehungsweise `UNSAFE_STORAGE_LOCATION` der erwartete
Stopp. Einen aktiven oder wiederaufnehmbaren Stapel vorher abschließen oder bewusst
verwerfen; das Umstellen migriert keine Daten.

Nach einem Update stellt eine Übergangsmigration gegebenenfalls verwaiste versteckte
Claims aus dem früheren Input-Fallback wieder her, ohne Dateien zu überschreiben oder
Links zu verfolgen. Sie nimmt keine neue Arbeit aus diesen Ordnern an. Eine bereits
begonnene Picker-Batch-Position wird als gestoppt markiert und nicht automatisch
erneut ausgeführt.

`purge_local_data` löscht nur nach ausdrücklicher Bestätigung und nur den gewählten
Scope. Vor einem Purge sicherstellen, dass die synthetischen Ergebnisse nicht mehr
für die Abnahme benötigt werden.

## 7. Update und Rollback

RC45 besitzt noch keinen vollständig belegten Upgrade-/Rollback-Prozess. Bis DS-007
abgeschlossen ist:

1. Konfiguration und Artefaktversion protokollieren, niemals Dokumentinhalte.
2. Alle synthetischen Jobs abschließen oder bewusst abbrechen.
3. Neues Artefakt mit höherer Version installieren beziehungsweise im Marketplace
   als neue Version hochladen.
4. Startprüfung und Kernfälle aus `PILOT-ABNAHME.md` wiederholen.
5. Bei Fehlern die neue Version deaktivieren/entfernen und die zuvor geprüfte Version
   erneut installieren.
6. Keine Arbeitsdaten zwischen Versionen manuell kopieren oder Jobjournale verändern.

Ein Produktionsrollout benötigt versionierte und vollständig getestete Artefakte,
SBOM, nachvollziehbare Prüfsummen und einen praktisch bestandenen Rollback. Eine
Codesignatur ist keine Voraussetzung und darf nicht behauptet werden.

## 8. Support und Diagnose

Das read-only Werkzeug `diagnostic_status` liefert die letzten maximal 50 Einträge
aus einem lokal auf 14 Tage und 200 Ereignisse begrenzten Journal. Es enthält nur
Verarbeitungsphase, Formatklasse, Profil, Zähler und feste Fehlercodes. Dateiname,
Pfad, Inhalt, erkannte Werte, technische Fehlermeldung und Dokument-Hash werden
nicht geschrieben. Ein Fehler beim Schreiben des Diagnosejournals darf die
Dokumentenverarbeitung nicht blockieren und bleibt als `write_errors` sichtbar.

Zusätzlich enthält `diagnostic_status.workflow` höchstens 50 zurückgegebene feste
Ablaufereignisse aus einer getrennten, auf 14 Tage und 300 Einträge begrenzten
lokalen Spur. Sie unterscheidet Picker-Anforderung und -Bestätigung, Workerstart,
privates IPC, Checkpoint, Verarbeitungsstart, Review-Rekonstruktion, Start und Ende
der lokalen Prüfoberfläche, Terminalzustand, Workerende und lokale Abschlussanzeige.
Zulässig sind nur begrenzte Zähler, Dauer, Exit-/Fehlercode und
der feste Ereignisname; Batch-Token, PID, Pfad, Dateiname, Inhalt und Hash fehlen.
Liegt zuletzt `completion_notice_started`, aber kein `completion_notice_finished`
vor, blockiert die lokale Abschlussanzeige. Fehlt bereits `intake_worker_spawned`,
liegt der Fehler vor dem Workerstart.

Für eine zurückgestellte Fachprüfung startet die bestätigte Cowork-Fortsetzung einen
abgekoppelten lokalen Review-Worker und kehrt sofort zurück. Der Batch-Token wird nur
über privates IPC übertragen. `review_worker_spawned` und `review_ipc_dispatched`
belegen den Start; `review_reconstruction_*` grenzt die lokale Rekonstruktion ein,
`review_ui_*` die native Oberfläche. `LOCAL_REVIEW_TIMEOUT` bedeutet einen lokalen
UI-Zeitablauf, nicht den Verlust bereits fertiggestellter Dateien. Der synchrone
tokenbasierte Reviewaufruf ist ausschließlich ein Supportweg und darf im normalen
Cowork-Ablauf nicht verwendet werden.

Der normale abgekoppelte Review-Worker besitzt keinen menschlichen
Entscheidungs-Timeout; Abbrechen und Vertagen sind ausdrückliche lokale Aktionen.
Der synchrone tokenbasierte Supportweg bleibt auf fünf Minuten begrenzt. Freigegebene
Output-Pakete und Mapping-Exporte unterliegen keiner automatischen Retention und
werden nur nach ausdrücklicher Bestätigung gelöscht. Der Status
`retention_output_protection_complete` bleibt für die historische
Journalprüfung sichtbar, ist aber keine Aufforderung, Ergebnisse manuell zu löschen.

Erlaubte Diagnoseangaben:

- DataSecure-, Claude-Desktop- und Windows-Version;
- Artefakttyp und nicht sensitiver SHA-256;
- Fehlercode, Formatklasse, Jobzustand, Zähler und Zeitpunkt;
- Angabe, ob `visual_bridge` verfügbar ist.
- Angabe, ob `parser_boundary` als `windows_job_object` einsatzbereit ist. Die Codes
  `PARSER_ISOLATION_FAILED` und `PARSER_RESOURCE_LIMIT` enthalten keine Quelldetails.
- `storage_safe`, `storage_mode`, Batch-Zähler und feste Wiederherstellungscodes;
  niemals Batch-Token oder Leseberechtigungen in ein Ticket kopieren.

Nie an Tickets, Chats oder Repositories anhängen:

- Originaldokumente oder Privacy-Outputs;
- Screenshots mit Dokumentinhalt;
- Pfade oder Dateinamen mit Personen-/Kundendaten;
- andere Jobjournale oder lokale Arbeitsordner ohne vorherige Datenschutzprüfung;
- Zugangsdaten, API-Schlüssel oder Identitätsmappings.

Bei einem vermuteten Klartextdurchlass: Verarbeitung stoppen, Ergebnis nicht an Claude
weiterverwenden, betroffene lokale Daten nach interner Incident-Vorgabe sichern oder
löschen und Datenschutz/Security mit ausschließlich datensparsamen Metadaten
informieren.

## 9. Go/No-Go

Ein Pilot ist **No-Go**, solange mindestens einer dieser Punkte offen ist:

- frische Installation, Upgrade und Rollback nicht bestanden;
- Artefaktversion oder Prüfsumme stimmt nicht mit der freigegebenen Ablage überein;
- visuelle, Parser- oder OCR-Unsicherheit kann durch Nutzer/Modell umgangen werden;
- Echtdaten wären für Installation oder Abnahme nötig;
- nur der normale Claude-Dateiupload statt des lokalen DataSecure-Wegs funktioniert;
- menschliche Bedienbarkeit wurde nicht mit synthetischen Daten bestätigt.
