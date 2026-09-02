# Release- und Distributionsvertrag

Stand: 02.09.2026 · 3.2.0-rc86

## Nutzerprodukt

Das Releaseprodukt ist ein selbstenthaltendes, zielsystemspezifisches Plugin-ZIP
für Windows x64 oder macOS Intel/ARM. Ein ZIP nur aus `plugins/data-secure` und
interne Engineering-Artefakte sind keine Nutzerprodukte oder Fallbacks.

Für einen GitHub-synchronisierten privaten Marketplace muss das angeschlossene
private/interne Repository einen self-contained Plugin-Ordner mit relativer
`source` enthalten. Externe HTTPS-Archive sind dafür kein unterstützter Ersatz.
Der aktuelle Quellordner mit `command: node` ist nur Entwicklung und noch kein
Marketplace-Release. Ein manuell hochgeladenes Plugin-ZIP ist laut Anthropic auf
50 MB begrenzt; DataSecure-Zielpakete bleiben unter 45 MiB. Ein universelles
Marketplace-Paket darf erst angeboten werden, wenn es self-contained, unter dem
geltenden Limit und auf Windows sowie beiden macOS-Architekturen abgenommen ist.

## Produktbuild

```text
npm ci
npm run test:docs
npm run test:ci
npm run runtime:target -- --target <Ziel> --archive <offizielles-Node-Archiv> --output dist/<Ziel>
npm run build:plugin
npm run test:plugin-zip
npm run build
```

`runtime:target` läuft auf dem jeweiligen Zielhost und prüft den fest
eingetragenen Downloadhash, Architektur, Lizenzdatei und den echten Start der
Runtime. `build` erzeugt und prüft ZIP, SPDX-SBOM und `SHA256SUMS`. Das Endprodukt
startet offline und setzt keine System-Node-/Python-Installation voraus.
Der manuelle, kostensparende Workflow `bundled-runtime-release.yml` baut bei
Bedarf die drei Ziel-ZIPs und prüft eine universelle Marketplace-Projektion; er
läuft niemals automatisch. Eine zu große oder unvollständige Projektion stoppt
und wird nicht als Release veröffentlicht.

## Engineeringbuild

```text
npm run build:engineering
npm run test:engineering-artifacts
```

Diese Befehle sind optional für interne Vergleichs- und Legacy-Gates. Ihr Erfolg
ist keine Produktfreigabe.

## Freigabekriterien

- Versionsgleichheit in Paket, Pluginmanifest, Skill und Buildmetadaten.
- Exakt zwei sichtbare Skills; keine Hooks/Subagenten.
- TXT/Markdown/CSV/DOCX positiv; XLSX/PPTX/PDF/Scan-PDF/Bilder fail-closed.
- Kein auswählbarer Bildmodus; Pixel bleiben lokal.
- 0–14 Tage nur für temporäre Arbeits-/Reviewdaten.
- Quellen/Originale und fertige Exporte nie automatisch löschen.
- Fresh Install von ZIP und Marketplace auf Windows x64 und macOS Intel/ARM.
- Runtime-Evidence, Node-Lizenz, Zielarchitektur, Dateimodi, SBOM und SHA-256.
- Kernfall, Stopps, Resume, 100 Dateien/500 MiB, Update und Rollback.
- aktueller Claude-/Cowork-Hostvertrag und Berechtigungsdialoge.
- UAT, Accessibility, IT/Health-IT, Datenschutz, Security und Architektur.
- null offene P0/P1-Defects.

## Formate im Erstrelease

Freigegeben sind TXT, Markdown, CSV und DOCX. Alle anderen sichtbaren Formate
werden mit unveränderter Quelle und ohne Teiloutput sicher gestoppt.

## Rollback

Rollback darf Quellen, fertige Exporte, Mapping und unbekannte/verschlüsselte
Altbestände weder verändern noch löschen. Nach Rollback werden Picker, Kernfall,
Resume, Mapping und Version mit synthetischen Daten geprüft.

Artefakt-SHA-256 und Testergebnisse werden releaseextern veröffentlicht; keine
rekursiv selbstbezüglichen Prüfsummen im Produktarchiv.
