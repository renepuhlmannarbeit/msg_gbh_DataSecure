# Kanonische Zielarchitektur

Stand: 25.08.2026 · abgeleitet aus `DECISIONS.md` und `PRODUCT_VISION.md`

## Architekturprinzip

DataSecure ist **Cowork-gesteuert und lokal ausgeführt**. Eine lokale
Cowork-Desktop-Sitzung darf den Plugin-MCP starten. Cloud-, Web-, Mobil- und
Scheduled-Sitzungen erhalten niemals einen Ersatzpfad zu Originalen. Ein sichtbarer
Skill oder Plugin-Eintrag ist kein Nachweis einer aktiven lokalen Privacy-Grenze.

```text
Cowork / Skill
  |  inhaltsfreier Start, Status, Abschluss
  v
lokaler Plugin-MCP ------------- optionales inhaltsfreies MCP-App-UI
  |
  +-- OS-Datei-/Ordnerpicker
  +-- verschlüsselter Checkpoint- und Snapshotbereich
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
5. Quellen werden in unveränderliche, benutzergebunden verschlüsselte Snapshots
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

## Job-, Daten- und Recoverymodell

- Pro Benutzer höchstens ein verarbeitender Stapel, daneben mehrere pausierte oder
  zur Prüfung zurückgestellte Stapel. Ein pausierter Stapel blockiert keinen neuen.
- Checkpoints sind monoton, atomar und unabhängig von Claude-Lesevorgängen.
- Bereits veröffentlichte Dateien werden nach Crash oder Neustart nicht erneut
  verarbeitet. Ein ungewisser Commit blockiert fail-closed.
- Quellen können während der Verarbeitung geändert werden, ohne den Snapshot zu
  verändern. Eine Änderung während der Snapshot-Aufnahme führt zu genau einem
  erneuten Versuch, danach zum lokalen Pausieren dieser Datei.
- Private Roh-/Review-Daten liegen im lokalen OS-Anwendungsdatenbereich,
  verschlüsselt über einen durch DPAPI beziehungsweise Keychain geschützten
  Installationsschlüssel. Es gibt keinen Klartext- oder Passwortfallback.
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

- Marketplace liefert ein Produkt; manuelle ZIPs sind plattformspezifisch.
- Die Laufzeit ist installationsfrei gebündelt. Ein vorhandenes System-Node oder
  Python ist weder Voraussetzung noch Vertrauensanker.
- Plugin-Code und Nutzerdaten liegen getrennt. Update, Deinstallation oder Rollback
  löschen keine Originale, Exporte, Mappings oder offenen Stapel.
- Datenmigrationen sind versioniert, vorab gesichert und reversibel. Bei Fehlern
  bleibt der vorherige durable Zustand nutzbar.
- Eigene native Sicherheitskomponenten werden vor Unternehmensrollout signiert;
  Prüfsummen und SBOM bleiben zusätzliche Integritätsnachweise.

## Diagnose- und Netzgrenze

- Verarbeitung und UI besitzen keine eigene ausgehende Netzwerkkommunikation.
- Das Ereignisjournal akzeptiert nur feste Phasen, Dauern, Größenklassen, Zähler,
  zufällige Vorgangs-/Positions-IDs und feste Fehlercodes.
- Namen, Pfade, Inhalte, Rohwerte, Passwörter, Hashes und Zugriffstoken sind im
  Diagnoseschema nicht darstellbar.
- Aufbewahrung höchstens 14 Tage; Diagnoseexport nur lokal und ausdrücklich.
- Keine automatische Telemetrie oder Crashübermittlung.

