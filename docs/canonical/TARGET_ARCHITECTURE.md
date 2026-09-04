# Kanonische Zielarchitektur

Stand: 04.09.2026 · abgeleitet aus `DECISIONS.md`, `PRODUCT_VISION.md` und DS-078

## Architekturprinzip

DataSecure ist **Cowork-gesteuert; die Originalvorverarbeitung läuft lokal**.
Originale dürfen nur in einer lokalen Cowork-Sitzung eines bestehenden Desktop-
Deployments oder in lokalem Claude Code dem tatsächlich verbundenen lokalen
Plugin-MCP über dessen Betriebssystempicker zugeführt werden. Lokale Plugin-MCPs
laufen laut Hersteller nicht in Cloud-Sitzungen. Cloud-Cowork, Web, Mobil,
geplante Cloud-Aufgaben, verbundene Ordner oder der Desktop-Dateibroker sind
kein Ersatzpfad; dort ist nur bereits freigegebenes Markdown zulässig. Ein
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

## Normalablauf

1. Ein natürlicher Auftrag oder die direkte Skillauswahl startet denselben Vertrag.
2. Der lokale Start prüft Engine, Benutzerbindung, Schreibrechte, Speicherreserve
   und Hostklasse. Ein DataSecure-eigener Prozess darf genau einmal neu gestartet
   werden; ein ausgefallener Claude-Host wird nicht kaschiert.
3. Ein nativer Datei- oder Ordnerpicker erteilt die einzige normale
   Originalzugriffsentscheidung.
4. Der vollständige Umfang wird vor dem Start gegen Format-, Struktur-, Link-,
   Datei- und Stapelgrenzen geprüft. Es gibt keine stille Teilmenge.
5. Quellen werden in identitäts- und hashgeprüfte lokale Plain-Snapshots
   übernommen. Ein kurzer MCP-Aufruf kehrt nach durablem Checkpoint zurück.
6. Der lokale Hintergrundworker verarbeitet mit adaptiver kleiner Parallelität.
7. Klare Ergebnisse werden veröffentlicht. Unsicherheiten bleiben lokal in einer
   persistenten Review-Queue ohne menschlichen Entscheidungs-Timeout.
8. Cowork zeigt eine inhaltsfreie Abschlussansicht. Nur die ausdrückliche Absicht
   `anonymisieren und auswerten` erlaubt eine Batch-Übergabe freigegebener Markdown-
   Ergebnisse.

## UI-Grenze

- Das optionale MCP-App-UI darf nur opake Vorgangskennungen, feste Statuswerte,
  Zähler, Prozentwerte und inhaltsfreie Aktionen erhalten.
- Dateinamen, Pfade, Rohtext, erkannte Werte, Bildpixel, Tokens und Mappings bleiben
  außerhalb der Cowork-UI.
- Datei-/Ordnerwahl und jede rohdatenhaltige Mehrdeutigkeitsprüfung erfolgen über
  lokale OS-Oberflächen.
- Ohne nachgewiesene MCP-App-Unterstützung bleibt der Text-/OS-Fallback gleichwertig.
- Eine separate native Companion-Anwendung ist kein Normalbestandteil.

## Eigenständiges zweites Produkt ohne Cowork

- DataSecure Standalone besitzt eine eigene Desktop-Hülle, Distribution,
  Konfiguration und einen eigenen Produktdatenroot. Es funktioniert ohne
  Claude, Cowork, Skills, MCP, Agenten und Internet.
- Desktop-Hülle und optionale Support-CLI rufen eine neutrale Application API
  unterhalb von MCP direkt auf. MCP-/JSON-RPC-Protokolle, Toolnamen,
  Handoff-Capabilities und Claude-Antwortfelder sind im Standalone-Produkt
  unzulässig.
- Standalone besitzt keine zweite Parser-, PII-, Review-, Journal-, Mapping-
  oder Freigabelogik. Beide Produkte binden denselben Core-/Policy-Fingerprint
  und bestehen denselben Golden-Korpus, dürfen ihre Journale, Reviewdaten und
  Exporte jedoch weder finden noch lesen.
- Microsoft MarkItDown ist ausschließlich ein isolierter Formatkonverter nach
  Admission und versiegeltem Snapshot. Er erhält Bytes statt Pfad oder URL und
  liefert noch nicht freigegebenes Markdown ausschließlich privat zurück.
- Der Konverter läuft offline mit expliziten Einzelkonvertern; Built-ins,
  Plugins, LLM-Clients und `markitdown-ocr` bleiben aus. Eine breite
  Konverterfähigkeit ist keine DataSecure-Coverage oder Formatfreigabe.
- Die verbindliche Lieferfolge und UX stehen in
  [`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).

## Job-, Daten- und Recoverymodell

- Pro Benutzer höchstens ein verarbeitender Stapel, daneben mehrere pausierte oder
  zur Prüfung zurückgestellte Stapel. Ein pausierter Stapel blockiert keinen neuen.
- Checkpoints sind monoton, atomar und unabhängig von Claude-Lesevorgängen.
- Bereits veröffentlichte Dateien werden nach Crash oder Neustart nicht erneut
  verarbeitet. Ein ungewisser Commit blockiert fail-closed.
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
- Mapping und anonymisierte Exporte sind lesbar, dauerhaft und technisch von der
  MCP-Lesegrenze getrennt.

## Inhalts- und Formatgrenze

- Dateiendung, Signatur und Containerstruktur müssen konsistent sein. Polyglotte,
  beschädigte und verschlüsselte Quellen stoppen einzeln und inhaltsfrei.
- Parser erzeugen einen vollständigen Content-Graph für sichtbare sowie fachlich
  relevante versteckte Bereiche. Nicht abgedeckte Inhalte werden nicht als
  vollständig ausgegeben.
- Aktive Inhalte werden nie ausgeführt; externe Beziehungen werden nicht geladen.
- Native Textschichten haben Vorrang. OCR läuft lokal nur für fehlende Bereiche.
  Unsichere OCR-Passagen werden nicht geraten, sondern transparent ausgelassen oder
  lokal geprüft.
- Ein Nulltreffer wird nur bei vollständigem Parser-/Graph-Nachweis und unabhängigem
  Residual-Gate freigegeben.

## Prozess- und Ressourcengrenze

- Parser und OCR laufen in begrenzten Unterprozessen ohne Netzwerkzugriff.
- Parallelität berücksichtigt CPU, freien Speicher, Formatklasse und OCR-Budget.
- Mapping, Reihenfolge und Paketveröffentlichung bleiben zentral und deterministisch.
- Speicherdruck reduziert Parallelität. Reicht die vorab berechnete Reserve nicht,
  pausiert der Stapel vor einer partiellen Veröffentlichung.

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
