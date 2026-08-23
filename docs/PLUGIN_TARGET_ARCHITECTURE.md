# Zielarchitektur: Claude Plugin + lokaler Privacy MCP

> **Historische Zielarchitektur:** Für aktuelle Produktentscheidungen, Grenzen und
> Prioritäten gelten [canonical/PRODUCT.md](canonical/PRODUCT.md) und
> [canonical/BACKLOG.md](canonical/BACKLOG.md).

## Entscheidung

Für den vorgesehenen Einsatz wird das Produkt als **Claude Plugin** gedacht, nicht nur als nackte Desktop Extension.

Das Plugin bündelt:

1. einen kleinen Skill für den anwenderfreundlichen Privacy-Preflight,
2. einen lokalen MCP-Server als technische Sicherheitsgrenze,
3. optionale Compliance-/AI-Act-Hinweise für den nachgelagerten Zweck.

## Warum kein Skill allein?

Ein Skill ist eine Verfahrensanweisung für Claude. Er ist nicht die technische Grenze, die garantiert, dass Rohdaten vor der Modellverarbeitung lokal bereinigt werden. Deshalb darf der Skill niemals der einzige Datenschutzmechanismus sein.

## Ziel-UX

Der Anwender installiert genau ein Plugin und verwendet danach z. B.:

`/datasafe`

oder schreibt:

`Prüfe und anonymisiere das nächste Dokument.`

Der Skill orchestriert dann ausschließlich lokale MCP-Tools.

## Sicherheitsfluss

```text
Originaldatei
    |
    v
lokaler Privacy MCP
    |
    +-- Dokumenttyp bestimmen
    +-- Text / Tabellen / Bilder extrahieren
    +-- direkte Identifikatoren entfernen
    +-- Quasi-Identifikatoren pseudonymisieren / generalisieren
    +-- visuelle Assets lokal prüfen
    +-- Residual-PII-Gate
    +-- Audit + Manifest erzeugen
    |
    v
Privacy-Paket
    |
    +-- anonymisiert.md
    +-- assets/ (im öffentlichen Pilot keine Bildpixel; nur künftige lokal freigegebene Assets)
    +-- manifest.json
    +-- audit.json
    |
    v
Claude darf nur diesen Output lesen
```

## Skills

Das ausgelieferte Plugin hält die Oberfläche bewusst klein:

- `gbh-datasecure-dokument-anonymisieren`: ein gemeinsamer, automatisch routender Dokumentablauf
- `gbh-datasecure-datenschutz-erklaeren`: Grenzen, Datenschutz und AI-Act-Governance

Die Skills enthalten keine Rohdatenverarbeitung. Sie wählen Profile, erklären Ergebnisse und rufen lokale Tools auf.

## Lokaler MCP

Der lokale MCP übernimmt ausschließlich deterministische bzw. lokal kontrollierte Verarbeitung. Er darf Rohdaten lesen, aber nur bereinigte Outputs an Claude zurückgeben.

Empfohlene Tool-Oberfläche:

- `privacy_status`
- `open_privacy_folder`
- `open_input_folder`
- `begin_document_batch`
- `anonymize_next_document`
- `acknowledge_batch_document`
- `continue_most_recent_document_batch`
- `read_anonymized_document`
- `list_visual_review_items`

Der Server bindet eine bestätigte Menge von 1–100 Dateien mit zusammen höchstens 500 MB an einen unveränderlichen
lokalen Snapshot. Lesezugriff auf ein Ergebnis erfordert neben der Paket-ID eine
kurzlebige, nur im Arbeitsspeicher gehaltene Berechtigung desselben Laufs. Eine
globale Paketliste ist absichtlich nicht Teil der öffentlichen Tool-Oberfläche.

Visual release is intentionally not an MCP tool. It belongs to the future signed
local companion and requires non-model-controlled human-presence evidence.

## AI-Act-Grenze

Das Plugin ist eine Privacy-/Preflight-Schicht. Es erklärt ausdrücklich nicht automatisch einen nachgelagerten HR-, Recruiting-, Scoring-, Ranking- oder Beschäftigungsworkflow für zulässig oder compliant. Der konkrete Zweck muss separat bewertet werden.

## Release-Modell

Quellcode bleibt modular und reviewbar im Git-Repository. CI erzeugt synthetische Testdokumente, führt Regressionstests aus und baut anschließend das installierbare Plugin-/MCP-Artefakt. Reale Mitarbeiter-, Kunden- oder Vertragsdokumente gehören nicht ins Repository.
