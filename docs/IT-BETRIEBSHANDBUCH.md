# DataSecure IT-Betriebshandbuch

Stand: 01.09.2026 · 3.2.0-rc84

## Produktkanäle

IT verteilt das Plugin-ZIP oder denselben Pluginbaum über einen privaten
Marketplace. Vor Rollout werden ZIP und Marketplace getrennt frisch installiert,
aktualisiert und zurückgerollt. Zusätzliche Engineering-Artefakte sind kein
Nutzer-, Fallback- oder Supportweg.

Der aktuelle Produktpfad verarbeitet TXT, Markdown, CSV und DOCX. XLSX, PPTX,
PDF/Scan-PDF, eigenständige Bilder, beschädigte und verschlüsselte Dateien bleiben
fail-closed gesperrt.

## Voraussetzungen und Hostgate

- unterstützte Claude-Desktop-/Cowork-Version;
- lokale Plugin-MCPs durch Organisations-/Geräterichtlinie erlaubt;
- lokaler, nicht synchronisierter Privacy-Ordner;
- genügend Speicher für höchstens 100 Dateien/500 MiB plus temporäre Kopien;
- alle Laufzeiten aus dem Paket, keine manuelle Node-/Python-Installation.

Eine Cloud-Session ohne aktive lokale Desktop-Brücke darf keinen Originalpicker
und keinen Originalzugriff erhalten.

## Installationstest

1. Plugin installieren, Claude vollständig beenden und neu starten.
2. Neue lokale Cowork-Aufgabe öffnen.
3. „Dateien anonymisieren“ schreiben.
4. Erwartet: genau ein lokaler Mehrfachpicker. Mit Abbrechen schließen.
5. Anschließend mit synthetischen Daten das
   [UAT-Kit](acceptance/UAT_TEST_KIT/README.md) durchführen.

Fehlt der Picker, keinen Chat-Upload, anderen Connector oder Engineeringweg als
Ersatz verwenden. Plugin-/Connectorstatus, Claude-Version und Richtlinien prüfen.

## Lokale Verzeichnisse und Löschung

| Bereich | Betrieb |
|---|---|
| Quelle/Original | nur lesen; nie verschieben, überschreiben oder automatisch löschen |
| temporäre Arbeits-/Reviewdaten | 0–14 Tage, danach nur eindeutig DataSecure-eigene Daten bereinigen |
| fertige Outputs/Export/Mapping | niemals automatisch löschen; nur ausdrückliche lokale Nutzeraktion |
| verschlüsselte Altartefakte | unangetastet lassen; kein Keyringversuch; Original neu wählen |

Der Privacy-Ordner darf nicht in OneDrive, iCloud, Dropbox, Google Drive,
Netzlaufwerken, Symlinks oder Junctions liegen. Ordnerwechsel nur ohne aktiven
Stapel und nach Neustart.

## Supportmodus und Logs

Der normale Anwenderweg besitzt keine Diagnoseabfrage. IT aktiviert den begrenzten
Supportmodus nur für einen konkreten Fall und deaktiviert ihn danach. Erlaubte
Supportdaten: Version, Plattform, Phase, Zähler, fester Fehlercode und Zeitpunkt.

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

## Eskalation

P0: Original verändert/gelöscht, Rohinhalt im Chat, gestoppte Datei mit Teiloutput,
oder falsches Ergebnis als vollständig. Verarbeitung sofort beenden, Evidence
inhaltfrei sichern, Datenschutz/Security einbeziehen. Andere Defects nach
Reproduktion mit synthetischen Daten ins kanonische Backlog aufnehmen.
