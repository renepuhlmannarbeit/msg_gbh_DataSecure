# GBH DataSecure – Claude-Code-Projektregeln

## Einstieg und Kanon

- Arbeite vom Repository-Root auf einem sauberen `main` und beginne mit
  `git pull --ff-only origin main`.
- Lies zuerst `docs/canonical/README.md` und
  `docs/canonical/DOCUMENT_REGISTER.md`. Bei Widersprüchen gilt die dort
  definierte Rangfolge.
- `docs/canonical/BACKLOG.md` ist die einzige Produktarbeitsliste. Dateien unter
  `docs/archive/**`, `tasks/archiv/**` und RC-spezifische alte UAT-Kits sind nur
  Historie und keine Anforderungen.
- Der jeweils aktuelle einmalige Arbeitsauftrag steht in
  `tasks/CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md`.

## Harte Produktgrenzen

- Zwei Produkte teilen den Core: Cowork-Plugin und eigenständiges Standalone.
  Originale werden lokal über Betriebssystempicker beziehungsweise native
  Standalone-Drops aufgenommen, niemals aus Chat-Uploads oder durch
  Claude-Werkzeuge. Die Claude-Hostgrenze bleibt DS-078; eine Hersteller-
  Desktop-Brücke erweitert die DataSecure-Freigabe nicht automatisch.
- Anonymisierung unterstützt TXT, Markdown, CSV und DOCX. Standalone besitzt
  zusätzlich den ausführbaren Zweck **Nur in Markdown umwandeln** für diese
  Formate sowie XLSX, PPTX, PDF/Scan-PDF und PNG/JPEG/BMP (DS-085).
  Die [Formatmatrix](docs/FORMAT_COVERAGE_MATRIX.md) trennt Coverage und
  Zweckfreigabe; Quellimplementierung ersetzt keine menschliche Zielhostabnahme.
- Originale niemals verändern, verschieben oder automatisch löschen.
- Nur verifiziertes anonymisiertes Markdown gelangt nach `DataSecure-Output`.
  Reine Konvertate bleiben **nicht anonymisiert** in `DataSecure-Markdown` und
  außerhalb des Plugin-Handoffs. Standalone ergänzt je Lauf eine lokale
  `DataSecure-Zuordnung.csv` (DS-083); das globale Mapping bleibt privat.
  Cowork-Outputs enthalten keine Zuordnung oder Originalnamen.
- Standalone zeigt gewählte Quellenordner, Dateinamen und Ergebnisziele lokal
  als Text (DS-082), ohne freie Datei-/Netzwerkrechte. Diese Anzeige gehört
  nicht in Diagnose, Supportspur oder Claude-Rückgaben.
- Standalone startet auf **Start** ohne vorbelegten Zweck; Picker/Drop allein
  starten keine Verarbeitung. Verlauf zeigt höchstens 20 Läufe mit an den
  konkreten Lauf gebundenen Aktionen. Keine automatische Ergebnisnavigation;
  neue Standardziele ändern keine früheren Öffnungsziele (DS-086).
- Empfangs-ACK, dauerhafter Checkpoint und sichtbarer Abschluss sind getrennt.
  Beide Produktadapter verwenden die gemeinsame Reviewbereitschaft: offene
  automatische Arbeit einschließlich Delivery/Mapping zuerst abschließen.
  Fortschritt zählt erfolgreiche plus terminal gestoppte Positionen.
- Produktiv arbeiten Node-/OOXML-/PDF-/OCR-Komponenten; MarkItDown/Python ist
  nur ein optionales Engineering-Differentialorakel. Der Batchrunner arbeitet
  aktuell seriell; adaptive Parallelität bleibt ein gesondertes Zukunftsziel.
- Bilder bleiben lokal. Es gibt keinen auswählbaren Bildmodus und keinen Weg,
  Originalpixel an Claude freizugeben.
- Private Arbeitskopien sind normale lokale Dateien. Keinen Keyring-, Passwort-,
  Zusatzkonto-, VM- oder Cloud-Zwang wieder einführen.
- Das Produkt reduziert personenbezogene Daten, garantiert aber weder rechtliche
  Anonymität noch DSGVO-/EU-AI-Act-Konformität.

## Arbeitsweise

- Nutze Subagenten nur für unabhängige Read-only-Reviews. Eine Hauptsession
  konsolidiert Findings und führt alle Änderungen sequenziell aus.
- Keine menschliche E1/E2/E3-Evidenz simulieren. Native Cowork-, Windows- und
  macOS-Abnahmen bleiben im Backlog offen, bis sie wirklich beobachtet wurden.
- Findings benötigen Datei/Zeile, Reproduktion, Ist/Soll, Auswirkung und eine
  bestehende BL-/DS-Zuordnung. Keine kosmetischen Nebenänderungen.
- Ein Thema pro Commit. Keine Force-Pushes, Resets oder History-Rewrites.
- Keine GitHub Actions starten; lokale Tests verwenden.
- Keine produktiven oder personenbezogenen Testdaten verwenden.

## Verifikation

- Gezielt testen, danach mindestens `npm run test:product`, `npm run test:docs`,
  `npm run build`, `npm run test:plugin-zip` und `git diff --check`.
- Pluginstruktur zusätzlich mit der installierten Claude CLI streng prüfen.
- Paket, Manifest, SBOM, Prüfsummen, Runtime, Skills und Dokumentation müssen
  dieselbe Version und denselben Produktvertrag abbilden.
- Commit und Push erst bei grünem, sauber dokumentiertem Stand. Der aktuelle
  Arbeitsauftrag bestimmt, ob ein Push zulässig ist.
