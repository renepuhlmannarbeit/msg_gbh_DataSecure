# DataSecure IT-Betriebshandbuch

Stand: 03.09.2026 · 3.2.0-rc90

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

- unterstützte Claude-Desktop-/Cowork-Version mit verfügbarer **lokaler**
  Cowork-Ausführung: Cowork-Sitzungen laufen laut Hersteller standardmäßig in
  der Cloud; die Organisation kann Cloud-Sitzungen ab- und lokale Sitzungen
  anlassen. Nur eine lokale Sitzung startet den Plugin-MCP.
- lokale Plugin-MCPs durch Organisations-/Geräterichtlinie erlaubt (MDM-Schlüssel
  `isLocalDevMcpEnabled` darf nicht auf `false` stehen);
- lokaler, nicht synchronisierter Privacy-Ordner;
- genügend Speicher für höchstens 100 Dateien/500 MiB plus temporäre Kopien;
- alle Laufzeiten aus dem Paket, keine manuelle Node-/Python-Installation.

Eine Cloud-Session ohne aktive lokale Desktop-Brücke darf keinen Originalpicker
und keinen Originalzugriff erhalten.

## Installationstest

1. Plugin in Claude Desktop über Einstellungen → Anpassen → Plugins → „Aus Datei
   hochladen“ installieren, Claude vollständig beenden und neu starten. Der
   Bereich „Claude Code“ und die Kommandozeile nutzen einen anderen Speicher
   (`~/.claude/plugins`); Cowork startet daraus nichts.
2. Neue lokale Cowork-Aufgabe öffnen.
3. „Dateien anonymisieren“ schreiben.
4. Beim ersten Lauf erwartet: zuerst einmalig die lokale Ergebnisordnerwahl. Einen
   leeren, bereits mit Cowork verbundenen Test-Arbeitsordner wählen. Danach öffnet
   sich genau ein lokaler Mehrfachpicker; diesen mit Abbrechen schließen.
5. Beim zweiten Start erwartet: nur der Mehrfachpicker, keine erneute Ergebnis-
   ordner-, Start-, Bild- oder Exportbestätigung.
6. Anschließend mit synthetischen Daten das
   [UAT-Kit](acceptance/UAT_TEST_KIT/README.md) durchführen.

Fehlt der Picker, keinen Chat-Upload, anderen Connector oder Engineeringweg als
Ersatz verwenden. Plugin-/Connectorstatus, Claude-Version und Richtlinien prüfen.

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

Der normale Anwenderweg besitzt keine Diagnoseabfrage. IT aktiviert den begrenzten
Supportmodus nur für einen konkreten Fall und deaktiviert ihn danach. Der einzige
Schalter ist die Umgebungsvariable `EU_PRIVACY_SUPPORT_MODE=1` im
`data-secure-local`-Eintrag der Plugin-`.mcp.json`. Sie wird nur in einer
gesondert bereitgestellten Supportkopie des Plugins gesetzt, nie im
Anwenderprodukt: Ein Edit im installierten Plugin ist laut Hersteller nicht
update-fest und kein Anwenderweg. Erlaubte Supportdaten: Version, Plattform,
Phase, Zähler, fester Fehlercode und Zeitpunkt.

Verboten: Inhalte, erkannte Rohwerte, Dateinamen, Pfade, Dokumenthashes,
Paketkennungen, Tokens oder Capabilities. Die inhaltsfreie Ereignisspur ist auf
14 Tage und 200 Einträge begrenzt.

## Fehlercodes – immer mit Klartext

| IT-Code | Klartext für Anwender | Aktion |
|---|---|---|
| `SOURCE_FORMAT_NOT_RELEASED` | Dieses Dateiformat ist noch nicht freigegeben. | Quelle unverändert lassen; kein Upload |
| `SOURCE_TYPE_MISMATCH` | Endung und tatsächlicher Dateityp passen nicht sicher zusammen. | Datei lokal prüfen/neu erzeugen |
| `AMBIGUITY_REVIEW_REQUIRED` | Eine Organisation kann nicht sicher eingeordnet werden. | lokalen Sammelreview starten oder vertagen |
| `PARSER_ISOLATION_FAILED` | Die lokale Sicherheitsgrenze ist nicht bereit. | Plugin reparieren/neu installieren, nicht umgehen |
| `PARSER_RESOURCE_LIMIT` | Die Datei überschreitet ein lokales Sicherheitsbudget. | nicht automatisch wiederholen |
| `UNSAFE_STORAGE_LOCATION` | Der Privacy-Ordner ist kein sicherer lokaler Ort. | anderen lokalen Ordner wählen |

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
`%LOCALAPPDATA%\SecureDataMsg\diagnostics\workflow-events.jsonl`. Weicht sie vom
bereitgestellten Build ab, ist kein Abnahmelauf gültig.

## Eskalation

P0: Original verändert/gelöscht, Rohinhalt im Chat, gestoppte Datei mit Teiloutput,
oder falsches Ergebnis als vollständig. Verarbeitung sofort beenden, Evidence
inhaltfrei sichern, Datenschutz/Security einbeziehen. Andere Defects nach
Reproduktion mit synthetischen Daten ins kanonische Backlog aufnehmen.
