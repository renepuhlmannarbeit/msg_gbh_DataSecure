# Release- und Distributionsvertrag

Stand: 11.09.2026 · 3.2.0-rc136

Der aktuelle Quellstand ist RC136. Sein Windows-x64-Cowork-Kandidat ist an den
sauberen, auf `main` veröffentlichten Quellcommit
`71ecafddde891d9d1b4e4bd9cd67833b46d03b08` gebunden. RC135 bleibt getrennt
der letzte plattformübergreifend paketgebundene Stand für Standalone sowie
Cowork auf Windows und beiden Mac-Architekturen.

RC136 wurde zweimal aus genau diesem Commit gebaut. Beide normalen Archive
waren bytegleich mit jeweils 35.048.298 Byte und SHA-256
`212646f6a27d610ed502bad724441f6c8d30872d55d387d6f59c9fe006ec1cbf`;
beide Paket-, Runtime-, Worker- und Skill-Smokes bestanden. Die getrennte
Debug-Variante war ebenfalls zweimal bytegleich mit jeweils 35.049.821 Byte
und SHA-256
`2b8e660e44ea95566bdebbda22ff67e6dfe3bc6da23b00dd78cf6b60de587c70`.
SBOM, Prüfsummen und eine commitgebundene, vollständig auf `NOT_RUN` stehende
12×3-UAT-Evidence-Vorlage gehören zum Release. RC136 ist als technischer
Windows-Cowork-Vorabkandidat unter
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc136>
veröffentlicht. Das ist keine Standalone-, macOS-, Modell-, N3/N4- oder
Produktionsfreigabe.

Für RC135 erzeugte der Windows-PKG-04-Lauf zwei bytegleiche Archive mit jeweils
110.250.920 Byte. Beide Paket-, Worker-, History-/Sidecar- und nativen Smokes
bestanden; INT-13 bindet SHA-256
`8a27494c19c1713ccd5104d1ec3dda8abd2e773ceedb47d250befccbe174c3d1`.
Der kostenbestätigte Lauf `34499428661` baute, prüfte und startete die
Standalone-Archive zweimal deterministisch auf macOS ARM64 (115.159.211 Byte,
SHA-256 `e9f54b5b…9f8c6`) und Intel (118.191.466 Byte, SHA-256
`9061aae7…880e9`). Lauf `34501324817` erzeugte und validierte die drei
selbsttragenden Cowork-Plugin-ZIPs für Windows x64 und beide Mac-Architekturen.
Das ist technische E0-Paketevidence, aber noch keine N3/N4- oder weitere Zielhostfreigabe
und insbesondere keine sichtbare Fresh-Install- oder
Anwenderabnahme.

RC135 ist als plattformübergreifender technischer Vorabkandidat unter
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc135>
veröffentlicht. Tag, sechs Zielpakete, Prüfsummen und SBOM binden unverändert
den Quellcommit `9c2e4f9061dbdc3cd1bf0280d95939528029c978`; der spätere reine
Dokumentationscommit verändert diese Binärartefakte nicht. Diese
Veröffentlichung ersetzt weder die noch offene sichtbare N3/N4-UAT noch eine
Produktionsfreigabe. Die Veröffentlichung des neueren Windows-Cowork-RC136
verändert oder ersetzt diese sechs RC135-Zielpakete nicht.

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

## Prüf- und Veröffentlichungskadenz

Ein normaler Push erzeugt niemals automatisch native macOS-/Windows-Builds,
OCR-Pakete oder Releaseartefakte. Der eine automatische Ubuntu-Check startet
für jeden Push und Pull Request, damit eine neue oder umbenannte Datei den
stabilen Pflichtcheck nicht umgehen kann. Er führt bei reinen Dokumentänderungen
nur `test:docs` aus; bei Produktcode
`test:product:ci`; bei gemischten oder nicht sicher klassifizierbaren Änderungen
beide. Die vollständige lokale Produktsuite bleibt Abschlussgate für einen
inhaltlichen Entwicklungsblock.

Zielplattformbuilds werden nur ausgeführt, wenn ein neues Paket für UAT oder
Release tatsächlich benötigt wird. Der manuelle Cowork-Workflow startet daher
standardmäßig nur `windows-x64`; alle drei Plattformen sind eine ausdrückliche
Releaseauswahl. PKG-04/INT-13, beide macOS-Architekturen, Security, SBOM und
Prüfsummen bleiben verpflichtend, sobald genau dieser Commit als neuer
veröffentlichter Kandidat angeboten wird. Ein nachfolgender reiner
Dokumentationscommit erfordert keinen Neubau unveränderter Binärartefakte.

## Verbindliche Versions- und Releasewahrheit

Jeder neue RC beginnt mit `npm run version:sync -- <version>`. Der Befehl setzt
alle aktiven Versionsköpfe und Manifeste gemeinsam fort, kennzeichnet nur einen
tatsächlich neuen RC als Entwicklungsstand und verändert keine historische
Commit-/Paket-Evidence. Vor Commit, Paketbau und Dokumentationsabschluss muss
`npm run test:version-truth` grün sein; derselbe Check ist Bestandteil von
`test:docs` und damit des automatischen Pflichtgates. Nach bestandenem PKG-04
wird ausschließlich der exakt gebundene RC in diesem Vertrag als Kandidat mit
Commit, Archivgröße und SHA-256 dokumentiert. Ein älterer RC darf nie als
aktueller Quellstand stehen bleiben.

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
Bedarf genau ein Ziel-ZIP oder alle drei getrennten Ziel-ZIPs; er läuft niemals
automatisch und wählt ohne ausdrückliche Änderung nur Windows x64. Jedes dieser
ZIPs bleibt unter der von Anthropic vorgegebenen
50-MB-Grenze. Ein Universal-ZIP wird nicht erzeugt, weil die drei gebündelten
Laufzeiten diese Grenze zusammen zwangsläufig überschreiten würden.

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
Engineering-Paket existiert. Echte ad-hoc signierte macOS-App-Bundles sind auf
Intel und Apple Silicon gebaut, geprüft und bis durch ihre private IPC-/Core-
Grenze gestartet. Sie sind als technisches Vorabrelease verfügbar, aber noch
keine Produktionsfreigabe: Die sichtbare Windows-/macOS-/Linux-UAT fehlt. Für macOS Intel und Apple
Silicon existieren inzwischen reproduzierbare, manifest-/hash-/modusgeprüfte
Engineering-ZIPs, die nach dem Entpacken nochmals nativ gestartet wurden. Der
aktuelle Zielbuild liefert selbsttragende Pakete für Windows x64, macOS Intel
und Apple Silicon sowie Linux x64 glibc; Anwender installieren
weder Rust noch Node noch Python separat. Für macOS gilt mindestens 13.5. Die
ersten internen Pakete dürfen unsigniert sein und verwenden ausschließlich die
enge Gatekeeper-Freigabe über „Datenschutz & Sicherheit“; globale oder
kommandozeilenbasierte Schutzabschaltungen sind kein Supportweg. Für eine breite,
reibungsarme Verteilung bleibt Signierung/Notarisierung eine spätere
Produktentscheidung.

Linux x64 glibc wird als AppImage in einem manifest-, hash-, lizenz- und
modusgeprüften ZIP geliefert. Das Paket enthält Core, Node, Office-/PDF-/OCR-
Konverter und POSIX-Supervisor; separate Runtime-Installationen sind nicht
erforderlich. Der native GitHub-Zielhostlauf baut und startet AppImage sowie
entpacktes Distributionspaket über App → private IPC → Core. Das ist technische
E0-Paketevidenz, aber noch keine menschliche Linux-Desktop-/Dateidialog-/
Accessibility-UAT und daher keine Endnutzerfreigabe.
Der Referenzlauf `34356576842` bindet diese Evidence an Commit
`84fd616c65665f3c7a31426bd722206c7145b6a6`; ZIP-SHA-256 ist
`177b976399785b010937ba17fde738b14f3eed94b4d78f94ea4491736f93eaee`.

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

## Formale N3/N4-Kandidatenbindung

Für die geplante Zwei-Personen-Abnahme wird erst nach Abschluss aller E0-Gates
eine Kampagnendatei aus
[`CAMPAIGN.template.json`](acceptance/FORMAL_UAT/CAMPAIGN.template.json)
angelegt. Sie bindet denselben vollständigen Git-Commit an vier getrennte
Pakete/Hashes: Standalone und Cowork-Plugin jeweils für Windows x64 und die
tatsächliche Architektur des Test-Macs. Pakete eines älteren Commits dürfen
nicht als aktueller Kandidat umetikettiert werden.

N3 muss auf jeder als freizugebend markierten Zielhost-/Produktkombination
vollständig `PASS` sein, bevor N4 beginnt. Die Windows- und Mac-Person führen
getrennte Evidence-Dateien auf getrennten UAT-Branches. Erst die gegengeprüfte
[Freigabeentscheidung](acceptance/FORMAL_UAT/FREIGABEENTSCHEIDUNG.md) darf ein
GO aussprechen. Die nicht vorhandene zweite Mac-Architektur bleibt ausdrücklich
offen und wird nicht durch Rosetta oder den anderen Mac-Typ ersetzt.

Für einen Cowork-Kandidaten gehören außerdem die vollständige 41×3-Modellmatrix
und der risikobasierte 12×3-Kandidatensmoke zum formalen Gate. Beide müssen im
Kampagnenmanifest mit Korpus-Hashes gebunden und `PASS` sein; ein einziges
verbotenes Outcome blockiert die Freigabe. `npm run uat:cowork-candidate`
erzeugt die versionsgebundene Durchführung mit Fixture, Vorbereitung,
bewertetem Schritt und Aufräumen.

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
