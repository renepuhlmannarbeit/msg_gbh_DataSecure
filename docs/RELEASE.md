# Release- und Distributionsvertrag

Stand: 03.09.2026 · 3.2.0-rc88

## Nutzerprodukt

Das Releaseprodukt ist ein selbstenthaltendes, zielsystemspezifisches Plugin-ZIP
für Windows x64 oder macOS Intel/ARM. Ein ZIP nur aus `plugins/data-secure` und
interne Engineering-Artefakte sind keine Nutzerprodukte oder Fallbacks.

Für einen GitHub-synchronisierten privaten Marketplace kann das angeschlossene
private/interne Repository entweder einen self-contained Plugin-Ordner mit
relativer `source` enthalten oder laut Plugin-Marketplace-Referenz (Stand
03.09.2026) je Plugin eine `archive`-Quelle mit HTTPS-URL und SHA-256 des
gebauten ZIPs nennen; letztere hält die gebündelte Runtime aus der Git-Historie.
Der aktuelle Quellordner mit `command: node` ist nur Entwicklung und noch kein
Marketplace-Release. Der Build erzeugt dafür `dist/marketplace.release.json`
mit der Prüfsumme des Zielpakets; die Ablage-URL setzt IT beim Bereitstellen
(`DATASECURE_ARCHIVE_BASE_URL`). Die offiziell genannten Grenzen liegen bei
200 MB entpackt je Plugin und 512 MB je Marketplace-Archiv; die 45-MiB-Grenze für
Zielpakete und 50 MiB für Archive ist die eigene, konservativere Produktgrenze
aus dem Runtime-Vertrag. Ein universelles Marketplace-Paket darf erst angeboten
werden, wenn es self-contained, unter dem geltenden Limit und auf Windows sowie
beiden macOS-Architekturen abgenommen ist.

Zusätzlich erzeugt `node scripts/build-marketplace-repo.mjs [--plugin-name <kennung>]`
aus dem verifizierten Zielpaket eine vollständige Git-Marketplace-Projektion
(`dist/marketplace-repo/`: `.claude-plugin/marketplace.json` mit relativer
Quelle und Version, `plugins/<kennung>/` als byteidentischer ZIP-Inhalt). Sie
wird in ein eigenes privates Repository gelegt und in Claude Desktop als
Marketplace aus Git-URL hinzugefügt; Updates laufen über den „Update“-Knopf des
Marketplace. Eine abweichende Kennung (z. B. `data-secure-uat`) ist nur für
Test-/UAT-Installationen gedacht, etwa wenn ein blockierter Kontoeintrag den
Produktnamen belegt, und wird im Evidence-Log vermerkt.

Für den reinen ZIP-Weg erzeugt `node scripts/rename-plugin-zip.mjs --plugin-name
<kennung>` aus dem verifizierten Zielpaket eine Upload-Variante, deren Manifest
eine andere Plugin-Kennung trägt (Inhalt und Archivmodi bleiben byteidentisch).
Sie wird gebraucht, wenn ein vorhandener, nicht entfernbarer Kontoeintrag den
Produktnamen `data-secure` belegt: Ein Upload gleichen Namens ersetzt diesen
Eintrag nicht, ein neuer Name wird als neuer Eintrag angelegt. Die Kennung
(z. B. `data-secure-rc87`) gehört ins Evidence-Log; Werkzeuge erscheinen dann
mit dem Präfix `plugin_<kennung>`.

Der persönliche Datei-Upload in Cowork („My Uploads“) besitzt laut offizieller
Dokumentation keinen Update-Mechanismus; ein erneuter Upload derselben
Plugin-Kennung ersetzte am 03.09.2026 die gecachte Kopie nicht (offene Meldungen
anthropics/claude-code #69020, #65426 als „not planned“). Der Upload bleibt der
Pilotweg mit dem im IT-Handbuch beschriebenen Entfernen-Neustart-Upload-Ablauf;
der versionierte Marketplace ist der Zielkanal.

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
