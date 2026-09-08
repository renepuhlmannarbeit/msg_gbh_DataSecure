# Release- und Distributionsvertrag

Stand: 08.09.2026 · 3.2.0-rc125

Der aktuelle Quellstand ist der RC125-Produktkandidat für das Cowork-Plugin.
Sein zielsystemspezifisches Plugin-ZIP wird ausschließlich mit dem unten
beschriebenen Produktbuild erzeugt und durch `SHA256SUMS`, SPDX-SBOM,
Plugin-ZIP-Tests und Claude-Validierung gebunden. Ein Standalone-Paket desselben
RC-Stands ist damit nicht behauptet: Die zuletzt commitgebundene Windows-Standalone-Evidenz
bleibt historische Engineering-Evidenz und ersetzt weder native UAT noch eine
INT-13-Bindung.

## Nutzerprodukt

Das Releaseprodukt ist ein selbstenthaltendes, zielsystemspezifisches Plugin-ZIP
für Windows x64 oder macOS Intel/ARM. Ein ZIP nur aus `plugins/data-secure` und
interne Engineering-Artefakte sind keine Nutzerprodukte oder Fallbacks.

Für einen GitHub-synchronisierten privaten Marketplace enthält das angeschlossene
private/interne Repository einen selbsttragenden Plugin-Ordner mit relativer
`source`. Das ist laut offizieller Anthropic-Dokumentation (erneut geprüft am
04.09.2026) der einfachste unterstützte Weg. `archive`, `npm` und `command` sind
für diesen Organisationskanal nicht unterstützt. Der aktuelle Quellordner mit
`command: node` ist deshalb ausschließlich Entwicklung und kein
Marketplace-Release. Ein Marketplace darf erst angeboten werden, wenn seine
selbsttragende Projektion auf Windows und beiden macOS-Architekturen abgenommen
ist.

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
Runtime. `build` erzeugt und prüft ZIP, SPDX-SBOM und `SHA256SUMS`. Die gebündelte
DataSecure-Runtime verarbeitet ohne eigenen Netzwerkzugriff und setzt keine
System-Node-/Python-Installation voraus. Claude Desktop und Cowork benötigen
für die Sitzung weiterhin eine Internetverbindung; das ändert nichts daran,
dass Originaldateien nur der lokalen DataSecure-Runtime zugeführt werden.
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

## Separates Standalone-Produkt

Standalone ist nicht Bestandteil des Plugin-ZIPs oder Marketplace-Artefakts.
Eine kompilierte und automatisch geprüfte Windows-x64-Hülle samt selbsttragendem
Engineering-Paket existiert. Sie ist noch kein Standalone-Release: Windows-UAT
und native macOS-Intel-/ARM-Pakete samt UAT fehlen. Der Zielbuild liefert
selbsttragende Pakete für Windows x64, macOS Intel, macOS Apple Silicon und
Linux x64 glibc; Anwender installieren
weder Rust noch Node noch Python separat. Für macOS gilt mindestens 13.5. Die
ersten internen Pakete dürfen unsigniert sein und verwenden ausschließlich die
enge Gatekeeper-Freigabe über „Datenschutz & Sicherheit“; globale oder
kommandozeilenbasierte Schutzabschaltungen sind kein Supportweg. Für eine breite,
reibungsarme Verteilung bleibt Signierung/Notarisierung eine spätere
Produktentscheidung.

Der kleine Windows-Pilot nutzt das auf Windows 10/11 vorhandene beziehungsweise
von der Organisation bereitgestellte Microsoft Edge WebView2-Systemruntime. Es
wird nicht von DataSecure heruntergeladen oder gebündelt. Fehlt es, stoppt die
UAT mit verständlichem Hinweis; Node, Rust und Python bleiben weiterhin keine
Anwender-Voraussetzungen.

## Freigabekriterien

- Versionsgleichheit in Paket, Pluginmanifest, Skill und Buildmetadaten.
- Exakt zwei sichtbare Skills; keine Hooks/Subagenten.
- Cowork: TXT/Markdown/CSV/DOCX direkt sowie XLSX/PPTX Markdown-first positiv;
  PDF/Scan-PDF/Bilder fail-closed. Standalone:
  breite Quellen werden lokal nach Markdown extrahiert und dieser Inhalt mit
  getrenntem Extraktions- und Anonymisierungsstatus verarbeitet.
- Kein auswählbarer Bildmodus; Pixel bleiben lokal.
- 0–14 Tage nur für temporäre Arbeits-/Reviewdaten.
- Quellen/Originale und fertige Exporte nie automatisch löschen.
- Fresh Install von ZIP und Marketplace auf Windows x64 und macOS Intel/ARM.
- Runtime-Evidence, Node-Lizenz, Zielarchitektur, Dateimodi, SBOM und SHA-256.
- Kernfall, Stopps, Resume, 200 Dateien/500 MiB, Update und Rollback.
- aktueller Claude-/Cowork-Hostvertrag und Berechtigungsdialoge.
- UAT, Accessibility, IT/Health-IT, Datenschutz, Security und Architektur.
- null offene P0/P1-Defects.

## Produktbezogene Formatfreigaben

- **Cowork-Plugin:** TXT, Markdown, CSV und streng direkt geprüftes DOCX;
  XLSX/PPTX werden lokal extrahiert und nur als Markdown anonymisiert. PDF,
  Scan-PDF und eigenständige Bilder werden mit unveränderter Quelle und ohne
  Teiloutput sicher gestoppt.
- **Standalone – Nur in Markdown umwandeln:** TXT, Markdown, CSV, DOCX, XLSX,
  PPTX, PDF/Scan-PDF sowie PNG/JPEG/BMP. Der Quellinhalt bleibt erhalten; eine
  unvollständige Extraktion wird ausdrücklich gekennzeichnet.
- **Standalone – In Markdown umwandeln und anonymisieren:** TXT, Markdown und
  CSV laufen direkt. DOCX und die breiten Formate werden genau einmal lokal
  nach Markdown extrahiert; ausschließlich dieser gültige, nichtleere
  Markdown-Inhalt wird anonymisiert. Quellenabdeckung und
  Anonymisierungsstatus sind getrennte Aussagen.

Unbekannte, beschädigte, verschlüsselte, aktive oder leere Quellen werden in
beiden Produkten fail-closed behandelt. Cowork lehnt einen nicht vollständig
freigegebenen Ordner atomar ab; Standalone weist betroffene unterstützte
Positionen einzeln aus und verarbeitet den sicheren Rest weiter.

## Rollback

Rollback darf Quellen, fertige Exporte, Mapping und unbekannte/verschlüsselte
Altbestände weder verändern noch löschen. Nach Rollback werden Picker, Kernfall,
Resume, Mapping und Version mit synthetischen Daten geprüft.

Artefakt-SHA-256 und Testergebnisse werden releaseextern veröffentlicht; keine
rekursiv selbstbezüglichen Prüfsummen im Produktarchiv.
