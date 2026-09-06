# Kanonische Zielarchitektur

Stand: 06.09.2026 · abgeleitet aus `DECISIONS.md`, `PRODUCT_VISION.md` und DS-075 bis DS-086

## Architekturprinzip

DataSecure besitzt zwei Produkte mit gemeinsamem lokalem Core: das
**Cowork-Plugin** und **DataSecure Standalone**. Standalone benötigt keinen
Claude-Host. Im Claude-Produkt dürfen Originale nur in einer lokalen
Cowork-Sitzung eines bestehenden Desktop-Deployments oder in lokalem Claude
Code dem tatsächlich verbundenen lokalen Plugin-MCP über dessen
Betriebssystempicker zugeführt werden (DS-078). Cloud-Cowork, Web, Mobil,
geplante Cloud-Aufgaben, verbundene Ordner oder der Desktop-Dateibroker sind
im freigegebenen DataSecure-Hostvertrag kein Ersatzpfad; dort ist nur bereits
freigegebenes Markdown zulässig. Herstellerangebote für Desktop-Brücken
erweitern diese Produktfreigabe nicht automatisch; dafür wäre eigene
versions- und zielhostgebundene Evidenz nötig. Ein
sichtbarer Skill oder Plugin-Eintrag ist kein Nachweis einer lokalen Privacy-
Grenze.

DS-062/DS-063 schließen zusätzliche System-VMs und Windows-Benutzerkonten aus.
DS-065 entfernt die zusätzliche Verschlüsselung lokaler Arbeitsdaten: kein
Keyring, Ersatzkeyfile oder Passwort. Private Dateien sind lokal und für das
Benutzerkonto lesbar; sie sind deshalb noch nicht zur Modellverarbeitung
freigegeben. Der frühere native Keyring-Testunterbau ist wegen Scopewechsel
obsolet, nicht bestanden. Normale Stapel-/Recoverytests bleiben erforderlich.

```text
Cowork / Skill
  |  inhaltsfreier Start, Status, Abschluss
  v
lokaler Plugin-MCP ------------- optionales inhaltsfreies MCP-App-UI
  |
  +-- OS-Datei-/Ordnerpicker
  +-- lokaler Checkpoint- und Snapshotbereich ohne zusätzliche Verschlüsselung
  +-- begrenzter Hintergrundworker
  +-- lokale rohdatenhaltige Reviewoberfläche
  +-- lokaler Mapping-/Exportbereich
  |
  +-- genau eine bewusste Übergabe freigegebener Markdown-Ergebnisse
  v
Claude-Modell
```

## Aktuelle Fähigkeiten nach Produkt und Zweck

Diese Matrix beschreibt den implementierten Quellstand. Paket- und menschliche
Zielhostfreigaben bleiben getrennt; konkrete Extraktionsgrenzen stehen in der
[`FORMAT_COVERAGE_MATRIX.md`](../FORMAT_COVERAGE_MATRIX.md).

| Produkt / Zweck | Aktiver Eingang | Prüfung und Ausgabe | Modellübergabe |
|---|---|---|---|
| Cowork-Plugin / anonymisieren | lokaler OS-Picker; TXT, Markdown, CSV, DOCX | Parser, PII, Residual-Gate, erforderlichenfalls Sammelreview; neutrale MD in `DataSecure-Output`; Mapping privat | nur erneut verifiziertes anonymisiertes Markdown auf späteren ausdrücklichen Auswertungsauftrag |
| Standalone / Markdown und anonymisieren | native Picker oder Drop mit explizitem Start; TXT, Markdown, CSV, DOCX | dieselben Anonymisierungsgates; MD und laufbezogene `DataSecure-Zuordnung.csv` in `DataSecure-Output` | kein MCP oder automatischer Upload |
| Standalone / nur Markdown | native Picker oder Drop mit explizitem Start; TXT, Markdown, CSV, DOCX, XLSX, PPTX, PDF einschließlich Scans, PNG/JPEG/BMP | Offline-Extraktion ohne PII-Ersetzung und Anonymisierungsreview; ursprüngliche Inhalte und Coveragehinweise; MD und Zuordnung in `DataSecure-Markdown`, ausdrücklich nicht anonymisiert | keine Privacy-Lesecapability; vom Plugin-Handoff ausgeschlossen |

Die größere Formatmenge der reinen Konvertierung ist keine Erweiterung der
Anonymisierungsfreigabe. Beschädigte oder geschützte Quellen erzeugen kein
Konvertat; lesbare, begrenzt abgedeckte Extraktionen erhalten konkrete Hinweise.

## Normalablauf des Cowork-Plugins

1. Ein natürlicher Auftrag oder die direkte Skillauswahl startet denselben Vertrag.
2. Der lokale Start prüft Engine, Benutzerbindung, Schreibrechte, Speicherreserve
   und Hostklasse. Ein DataSecure-eigener Prozess darf genau einmal neu gestartet
   werden; ein ausgefallener Claude-Host wird nicht kaschiert.
3. Ein nativer Datei- oder Ordnerpicker erteilt die einzige normale
   Originalzugriffsentscheidung.
4. Der vollständige Umfang wird gegen Format-, Struktur-, Link-, Datei- und
   Stapelgrenzen geprüft. Unvertrauenswürdige Auswahlidentität stoppt die Aufnahme;
   sicher festgestellte Dateifehler bleiben als gestoppte Positionen sichtbar.
5. Nach privater Übergabe bestätigt der Intake-Worker den Empfang. Der kurze
   MCP-Aufruf kann mit diesem ACK vor dem ersten dauerhaften Checkpoint
   zurückkehren. Erst danach belegen identitäts- und hashgeprüfte lokale
   Plain-Snapshots und Journale den wiederherstellbaren Stapel.
6. Der lokale Hintergrundworker verarbeitet die Positionen aktuell seriell.
7. Klare Ergebnisse werden intern veröffentlicht. Unsicherheiten bleiben lokal in einer
   persistenten Review-Queue ohne menschlichen Entscheidungs-Timeout.
8. Die lokale Abschlussoberfläche zeigt den terminalen Lauf beziehungsweise
   einen konkreten Fortsetzungsschritt. Cowork erhält eine inhaltsfreie Meldung.
   Erst ein späterer ausdrücklicher Auswertungsauftrag erlaubt die begrenzte
   Batch-Übergabe freigegebener Markdown-Ergebnisse.

## UI-Grenze des Cowork-Plugins

- Das optionale MCP-App-UI darf nur opake Vorgangskennungen, feste Statuswerte,
  Zähler, Prozentwerte und inhaltsfreie Aktionen erhalten.
- Dateinamen, Pfade, Rohtext, erkannte Werte, Bildpixel, Tokens und Mappings bleiben
  außerhalb der Cowork-UI.
- Datei-/Ordnerwahl und jede rohdatenhaltige Mehrdeutigkeitsprüfung erfolgen über
  lokale OS-Oberflächen.
- Ohne nachgewiesene MCP-App-Unterstützung bleibt der Text-/OS-Fallback gleichwertig.
- Eine zusätzlich installierte Companion-Anwendung ist kein Normalbestandteil;
  die lokalen Picker und Reviewadapter gehören zur gebündelten Runtime.

## Eigenständiges zweites Produkt ohne Cowork

- DataSecure Standalone besitzt eine eigene Desktop-Hülle, Distribution,
  Konfiguration und einen eigenen Produktdatenroot. Es funktioniert ohne
  Claude, Cowork, Skills, MCP, Agenten und Internet.
- Desktop-Hülle und optionale Support-CLI rufen eine neutrale Application API
  unterhalb von MCP direkt auf. MCP-/JSON-RPC-Protokolle, Toolnamen,
  Handoff-Capabilities und Claude-Antwortfelder sind im Standalone-Produkt
  unzulässig.
- Standalone besitzt keine zweite Anonymisierungslogik; beide Produkte verwenden
  gemeinsame Engine-Module und Policies. Neutrale Core-API und gemeinsame
  Core-/Policy-Fingerprint-/Golden-Bindung des unterstützten Anonymisierungsmodus
  sind eigene grüne E0-Gates (BL-010.9/BL-010.23). Der reine Konvertierungszweck wird
  gegen seinen Inhaltserhaltungsvertrag geprüft. Die Produkte dürfen ihre
  Journale, Reviewdaten und Exporte nicht gegenseitig finden oder lesen.
- RC109 besitzt sieben reine gemeinsame Verträge unter `server/core/`.
  Fingerprint und Goldenläufe prüfen beide echten Produktprojektionen über
  TXT/Markdown/CSV/DOCX, fünf Profile, Review, Abbruch und frische Fortsetzung.
- Der produktive Konverter verarbeitet Snapshot-Bytes mit den vorhandenen
  Node-/OOXML-Parsern, PDF.js, Canvas und lokaler Tesseract-DE/EN-OCR.
  MarkItDown/Python ist ausschließlich ein optionales Engineering-
  Differentialorakel, kein produktiver Worker und keine Anwender-Runtime.
  LLM-Clients und `markitdown-ocr` gehören nicht zum lokalen Produktweg.
- Standalone besitzt nach DS-085 zusätzlich reine Markdown-Konvertierung als
  gleichwertige Kernfunktion. Sie verwendet Aufnahme, Parser, Journal,
  Recovery und Mapping gemeinsam, aber keine PII-Ersetzung und keinen
  Anonymisierungsreview. Der dauerhafte Modus entscheidet über den getrennten
  Export nach `DataSecure-Markdown`; diese Dateien sind nicht anonymisiert und
  können niemals aus dem Plugin-Handoff gelesen werden. Dieser Modus ist im
  Quellstand ausführbar; seine Endnutzer- und Zielhostabnahme bleibt gesondert.
- Nach DS-082 zeigt die lokale UI gewählte Quellenordner, Dateinamen und
  Ergebnisziele als Text über die private IPC. Sie erhält dadurch keine freien
  Datei-, Shell- oder Netzwerkrechte. Die Anzeige gehört weder in Diagnose noch
  in den Claude-Produktkanal.
- Nach DS-086 öffnet die App **Start** ohne vorausgewählten Zweck. Picker und
  Drop bereiten vor; Verarbeitung beginnt erst mit dem expliziten Start.
  Abschluss und Wiederherstellung lösen keine automatische Ergebnisnavigation
  aus. **Verlauf** zeigt die letzten 20 Läufe mit laufgebundenen Aktionen;
  diese Anzeigegrenze löscht keine Daten und ein neues Standardziel verändert
  keine Öffnungsziele früherer Läufe.
- Die verbindliche Lieferfolge und UX stehen in
  [`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).

## Job-, Daten- und Recoverymodell

- Pro Produktdatenbereich höchstens ein verarbeitender Stapel, daneben mehrere pausierte oder
  zur Prüfung zurückgestellte Stapel. Ein pausierter Stapel blockiert keinen neuen.
- Checkpoints sind monoton, atomar und unabhängig von Claude-Lesevorgängen.
- Bereits veröffentlichte Dateien werden nach Crash oder Neustart nicht erneut
  verarbeitet. Ein ungewisser Commit blockiert fail-closed.
- Beide Produktadapter, Fortschrittsprojektion und Reviewplanung verwenden
  dieselbe Readiness aus `gateway/batch-next-action.js`: Review erst bei offenen
  Reviewpositionen und ohne `pending`, `processing`, `retryable`, Delivery- oder
  Mappingarbeit. Fortsetzung eines Mischstapels erledigt zunächst automatische
  Arbeit und geht danach in den vorhandenen Sammelreview über. Fehlende
  Fortschrittszähler belegen keine Reviewbereitschaft.
- Abgeschlossen zählt freigegebene plus terminal gestoppte Positionen;
  Ergebnis-, Fehler- und Reviewzahlen bleiben getrennt. Ein Stopp mit noch
  offener Zuordnung ist noch nicht terminal.
- Quellen können während der Verarbeitung geändert werden, ohne den Snapshot zu
  verändern. Eine Änderung während der Snapshot-Aufnahme führt zu genau einem
  erneuten Versuch, danach zum lokalen Pausieren dieser Datei.
- Neue private Roh-/Review-Daten liegen unverschlüsselt im lokalen
  OS-Anwendungsdatenbereich. Kein Installationsschlüssel, Keyring oder Passwort.
  Dateirechte und Original-/Freigabegrenzen bleiben bestehen; ein SHA-256-Abgleich
  prüft unveränderte Bytes, bietet aber keine Verschlüsselung.
- Verschlüsselte V3-/`.dsart`-Altbestände und ihre Metadaten bleiben unangetastet;
  kein Lesen über den Keyring, keine automatische Migration oder Löschung. Eine
  erneute Originalauswahl erzeugt einen neuen Plain-Stapel. Neue Plain-Stapel
  besitzen einen eindeutigen versionierten Vertrag und bleiben fortsetzbar.
- Mapping und fertige Exporte sind lesbar und dauerhaft. Das globale Mapping
  bleibt privat; Standalone veröffentlicht nach DS-083 zusätzlich die Zuordnung
  im zugehörigen Lauf. Beide Standalone-Zwecke binden Ziel und Modus dauerhaft.
  Ein sichtbarer Lauf ist erst mit allen Ergebnissen und seiner Zuordnung fertig.

## Inhalts- und Formatgrenze

- Dateiendung, Signatur und Containerstruktur müssen konsistent sein. Polyglotte,
  beschädigte und verschlüsselte Quellen stoppen einzeln und inhaltsfrei.
- Parser müssen ihren belegten Extraktionsumfang ausweisen. Ein vollständiger
  Content-Graph bleibt die Freigabeanforderung für entsprechende
  Anonymisierungsaussagen; nicht abgedeckte Inhalte gelten nicht als vollständig.
- Aktive Inhalte werden nie ausgeführt; externe Beziehungen werden nicht geladen.
- Native Textschichten haben Vorrang. OCR läuft lokal nur für fehlende Bereiche.
  Unsichere OCR-Passagen werden nicht geraten, sondern transparent ausgelassen oder
  lokal geprüft.
- Im Anonymisierungspfad wird ein Nulltreffer nur bei vollständigem
  Parser-/Graph-Nachweis und unabhängigem Residual-Gate freigegeben. Reine
  Konvertierung erzeugt keine Anonymitätsaussage und verwendet diese PII-Gates nicht.

## Prozess- und Ressourcengrenze

- Parser und OCR laufen in begrenzten Unterprozessen ohne Netzwerkzugriff.
- Der aktuelle Batchrunner verarbeitet Positionen seriell mit begrenzten
  Parser-/OCR-Prozessen. Interne OCR-Threads sind keine parallelen Stapelpositionen.
- Adaptive Vorbereitung anhand CPU, freiem Speicher, Formatklasse und OCR-Budget
  ist ein noch nicht aktiviertes Performanceziel nach eigenem Nachweis.
- Mapping, Reihenfolge und Paketveröffentlichung bleiben zentral und deterministisch.
- Für dieses Ziel soll Speicherdruck die Parallelität reduzieren. Schon heute
  gelten feste Ressourcenbudgets; ein ausgeschöpftes Budget wird als Fehler oder
  fortsetzbare Unterbrechung sichtbar und nicht als vollständiger Lauf ausgegeben.

## Distribution und Lifecycle

- Marketplace und manuelles Plugin-ZIP liefern dasselbe Produkt. MCPB bleibt ein
  internes Engineering-Artefakt und ist kein Desktop- oder Fehler-Fallback.
- Das Quellplugin bleibt mit `command: node` entwickelbar. Der Produktbuild ersetzt
  diesen Wert deterministisch durch `${CLAUDE_PLUGIN_ROOT}/runtime/datasecure-node`
  und bündelt die hashgebundene Node-Runtime für Windows x64 oder macOS Intel/ARM.
  Ein reales Windows-E0 ohne System-Node ist grün; macOS- und Cowork-Fresh-Install
  bleiben Releaseblocker und sind kein Nutzer-Setupschritt.
- Plugin-Code und Nutzerdaten liegen getrennt. Update, Deinstallation oder Rollback
  löschen keine Originale, Exporte, Mappings oder offenen Stapel.
- Datenmigrationen sind versioniert, vorab gesichert und reversibel. Bei Fehlern
  bleibt der vorherige durable Zustand nutzbar.
- Eine Produktsignatur ist nach DS-067 keine Lieferpflicht. Zielgebundene Hashes,
  reproduzierbare Paketverifikation und SBOM bleiben Integritätsnachweise; reale
  macOS-Quarantäne-/Installationsbeobachtung ist trotzdem erforderlich.

## Diagnose- und Netzgrenze

- Verarbeitung und UI besitzen keine eigene ausgehende Netzwerkkommunikation.
- Das Ereignisjournal akzeptiert nur feste Phasen, Dauern, Größenklassen, Zähler,
  zufällige Vorgangs-/Positions-IDs und feste Fehlercodes.
- Namen, Pfade, Inhalte, Rohwerte, Passwörter, Hashes und Zugriffstoken sind im
  Diagnoseschema nicht darstellbar.
- Temporäre Arbeits- und Reviewdaten: konfigurierbar 0–14 Tage. Quellen,
  Originale und fertige Exporte sind kein Ziel automatischer Aufbewahrungs-
  oder Löschläufe. Diagnoseexport nur lokal und ausdrücklich.
- Kein auswählbarer Bildmodus: Bildpixel bleiben lokal zurückgehalten; der
  Normalweg kann sie weder an Claude freigeben noch aus Originalen löschen.
- Keine automatische Telemetrie oder Crashübermittlung.
- Ein gesondertes Debug-ZIP darf für einen konkreten Supportfall dieselbe Engine
  mit einem ausschließlich manuell aufrufbaren Skill starten. Es speichert je
  Prozess unveränderliche JSON-Einzelereignisse aus geschlossenen Katalogen;
  Roh-JSON-RPC, Argumente, Ergebnisse und nutzer- oder dokumentbezogene Werte
  bleiben strukturell ausgeschlossen. Danach wird wieder das Normalpaket genutzt.
- Cowork selbst kann eine Internetverbindung und cloudbasierte Modellverarbeitung
  benötigen; daraus folgt keine Netzwerkfreigabe für den lokalen DataSecure-Prozess.
