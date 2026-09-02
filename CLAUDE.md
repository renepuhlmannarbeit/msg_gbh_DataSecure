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

- Originale werden ausschließlich lokal über den Betriebssystempicker gelesen,
  niemals aus Chat-Uploads oder durch Claude-Werkzeuge.
- Freigegeben sind derzeit nur TXT, Markdown, CSV und DOCX. XLSX, PPTX, PDF,
  Scan-PDF und Bilder bleiben fail-closed, bis ihre kanonischen Stories erfüllt
  und menschlich abgenommen sind.
- Originale niemals verändern, verschieben oder automatisch löschen.
- Nur erneut verifiziertes, freigegebenes Markdown darf mit neutralem Namen nach
  `DataSecure-Output` gelangen. Mapping, Pfade, Originalnamen, Review-, Journal-
  und Recoverydaten bleiben im privaten lokalen Bereich.
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
