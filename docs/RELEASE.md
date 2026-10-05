# Release- und Distributionsvertrag

Stand: 05.10.2026 · 3.2.0-rc158

Der aktuelle Quellstand ist RC158-Entwicklungsstand und noch kein neu gebundener Paketkandidat.
Der bisher veröffentlichte Standalone-Vorabkandidat RC157 ist auf main
und für Windows, macOS Intel, macOS Apple Silicon und Linux veröffentlicht.
ZIP-Verifikation, isolierter Paket-Smoke und
nativer Start einschließlich geladener Prüfseite bestanden. „Jetzt prüfen“
öffnet die lokale Prüfung direkt aus der aktuellen Laufkarte; gezielte
Frontend-/Service-/IPC-Tests bestätigen die Bindung an diesen Lauf.
Der RC157-Windows-Anwenderlauf `3d6b69b7` samt lokaler Prüfung und
Stapelverarbeitung wurde am 30.09.2026 ausdrücklich als vollständig bestanden
bestätigt. Die nur lesende Nachkontrolle findet 140 Markdown-Ergebnisse,
140 Dateizuordnungen und die vertrauliche Identitäts-TXT mit 140/140 erfassten
Ergebnisdateien. Der frühere RC156-Lauf `ca4349c5` bestand ebenfalls.
Der abschließende Release-Review fand einen Einzeldokument-Randfall: Auch ein
einziger mehrdeutiger Inhalt wird nun ausdrücklich in den Standalone-App-Review
vertagt, statt während der Analyse den alten nativen Dialog zu öffnen.
Ein gezielter Drei-Plattform-Vertrag prüft dies; Coworks Einzelreview bleibt
unverändert. Der veröffentlichte Windows-Neubau wurde deshalb zusätzlich technisch
geprüft und wird nicht als bytegleich zum vorherigen Anwender-Test-ZIP behauptet.
Die bestätigte Windows-Funktionsabnahme ist bestanden; technische Paketprüfung
ersetzt keine noch fehlenden menschlichen Zielhost- oder Spezialabnahmen.

### RC158 – beauftragter Standalone-Vorabrelease in Vorbereitung

Der Anwender hat am 05.10.2026 Commit und Push auf main sowie neue
Windows- und macOS-Vorabpakete beauftragt. RC158 enthält die revalidierten
Korrekturen DS-106–109. Windows x64 wird aus einem sauberen Quellcommit
zweimal gebaut und paketgebunden geprüft; macOS Intel und Apple Silicon
werden im bestehenden nativen Zielplattformworkflow als ZIP und DMG gebaut.
Dieser ausdrücklich beauftragte Releasebau ist eine Ausnahme vom normalen
lokalen Arbeitsweg ohne manuelle Actions-Läufe. Alte Archive werden nicht
ersetzt. Cowork RC151 und Linux RC157 bleiben ihre getrennt veröffentlichten
Kandidaten; lokale Cowork-Buildgates sind keine Cowork-Neuveröffentlichung.

Commit-, Archiv- und Hashbindung werden erst nach erfolgreichem Paketbau
eingetragen. Automatisierte technische Nachweise ersetzen weder die erneute
Windows-Anwenderabnahme des exakten RC158-Pakets noch Mac-Finder-/Gatekeeper-,
Accessibility- oder formale N3/N4-Abnahme. Mac-Pakete bleiben ad-hoc-signiert,
nicht Developer-ID-signiert oder notarisiert.

### RC157 – Standalone auf allen Zielplattformen

Das [RC157-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc157)
bindet exakt Quellcommit `111737d28021b6989ffe8d563b58daa9cbae610f`.
Das getrennte Cowork-Plugin bleibt auf RC151; es wurde nicht neu veröffentlicht.

Die vollständige lokale Produktsuite und die
[Pflicht-CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770901121)
bestanden. Windows-PKG-04/INT-13 bestätigte zwei saubere, bytegleiche Builds
und native Paketprüfungen beider Archive einschließlich des integrierten
Prüffensters. Das Windows-ZIP umfasst 110.338.453 Byte.

Der [native Mac-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770900387)
bestand auf Intel und Apple Silicon: Konverter, Architektur, Signatur,
eingebettete Mindestversion aller nativen Komponenten, App-/LaunchServices-Start
und geladene integrierte Prüfseite. Die ZIP-Archive wurden jeweils zweimal
bytegleich erzeugt; ZIP und zusätzliches DMG enthalten dieselbe App.
Das schreibgeschützt gemountete DMG samt Programme-Link und App-Start wurde
ebenfalls geprüft. Das
[Linux-x64-glibc-AppImage-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770904442)
bestand Konverter-, Paket- und native App-/Prüffenster-Smokes; auch sein
ZIP-Archiv wurde zweimal bytegleich erzeugt.

Alle zwölf veröffentlichten Assets – sechs Pakete und ihre eigenen
`.sha256`-Dateien – stimmen in Größe und SHA-256 mit dem lokalen Staging überein.
Die bestehenden RC151- und älteren Assets bleiben unverändert.

| RC157-Standalone-Paket | SHA-256 |
|---|---|
| Windows x64 ZIP | `16130005616a8a93a48d27f0714208d56042eda6e409160673904ec728a2e996` |
| macOS Intel ZIP | `c9ac0f1f6e25ec243d7f9c9bd67dd0774bd91ee39a2d2e5bc6978f640472fa59` |
| macOS Intel DMG | `1269581859cb478d0c653c578b22d319e4c2dad5838f025ae301afe08acd9b03` |
| macOS Apple Silicon ZIP | `f60ac9cadd0536950561e42a5c5b8bb7eac2eb1b0cda7d4917ea92bddbf0ad26` |
| macOS Apple Silicon DMG | `89bfbd99903a6fff55fc9d301da7c4a64581deb0d8fbcc3f29ea78ec9a40d6b0` |
| Linux x64 glibc ZIP | `81edb37ef19f2dca528b47a7c5ddd21a6eddcd4ddb5db9d6ec24666c978cda5f` |

macOS verlangt mindestens 13.5; die tatsächlichen nativen Runner liefen auf
14/15. Die Mac-App ist ad-hoc-signiert, nicht Developer-ID-signiert oder
notarisiert. Sichtbare Finder-/Gatekeeper-/VoiceOver- und tatsächliche
13.5-Abnahmen sowie Linux-Desktop-/Accessibility-Spezialfälle werden nicht aus
den automatisierten Starts abgeleitet. Linux wurde auf Ubuntu 22.04 mit
glibc 2.35 geprüft. Der bestätigte Windows-Anwenderlauf bleibt bestanden;
die Veröffentlichung als RC ist keine pauschale Produktionsfreigabe.

### RC151 – Standalone und Cowork auf allen Zielplattformen

Das [RC151-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc151)
bindet den sauberen Quellcommit `fdb8288c9bef2a64eeb10d584e1bf59a6cb864c3`.
Die [Pflicht-CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36615798739)
und die lokale vollständige Produktsuite bestanden. Windows-PKG-04/INT-13
bestätigt zwei saubere, bytegleiche ZIP-Bauten, Paket-/Worker-Prüfungen und
native Starts beider Archive. Das veröffentlichte ZIP umfasst 110.303.055 Byte
und hat SHA-256
`5108d3957c4987088519cf26ce2c5aba4df5611f9f993aa17c027ab1a82230c7`.
Die GitHub-Asset-Digests des ZIPs und seiner `.sha256`-Datei wurden mit den
lokalen Dateien abgeglichen.

Standalone-macOS Intel und Apple Silicon wurden aus demselben Quellcommit
als ZIP und zusätzlich DMG gebaut. Der [native Mac-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618883915)
prüfte je Architektur den Binär-/Signatur-/Mindestversionsvertrag, den
gebündelten Konverter, den App-Start und die identische App in ZIP und DMG.
Das Linux-x64-glibc-AppImage-ZIP bestand seinen
[nativen Paket- und App-Startlauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618884302).
Die heruntergeladenen Archive stimmen mit ihren eigenen `.sha256`-Dateien
überein. ZIP bleibt auf dem Mac erhalten; DMG ist ein zusätzlicher Installationsweg.

Das getrennte Cowork-Plugin bestand mit den normalen Windows-x64-, macOS-Intel-
und macOS-ARM-ZIPs die [nativen Zielplattform-Smokes](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618886944).
Der [Release-Evidence-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36618887161)
baute zusätzlich das getrennte Windows-Debug-ZIP und band Normal/Debug an eine
leere Windows-UAT-Vorlage; der Windows-Normalbau ist in beiden Workflows
bytegleich. Die veröffentlichte Cowork-SBOM und `SHA256SUMS` wurden aus genau
diesen vier ZIPs und der UAT-Vorlage neu erzeugt. Alle Modellgates in der Vorlage
stehen auf `NOT_RUN`, nicht auf `PASS`.

| RC151-Standalone-Archiv | SHA-256 |
|---|---|
| macOS Intel ZIP | `db1dca19d24637ac545da58ec0655d88136fb433c8ae267af95812124b17b1c5` |
| macOS Intel DMG | `5f06d1cc1e3dd19e7361ceb49a5dfadaf1aa25d56af766f513ab9ba5661783c1` |
| macOS Apple Silicon ZIP | `7b606108cd4a61043b9f0b678af9f465bb5d2c631f418eaf9a1a43e56965a22a` |
| macOS Apple Silicon DMG | `81683ab53bbae1b4f0d67a4e65491b349a79e9835be70a161ff3d62246db98d1` |
| Linux x64 glibc ZIP | `5626a40bee98f9502d22a10a4174eaeb74f3887937c2f2f3706893a56c7f0342` |

Alle 19 RC151-GitHub-Assets, einschließlich Cowork-Paketen, SBOM und
Prüfsummendateien, stimmen in Größe und SHA-256 mit dem lokalen Staging überein.

RC151 bündelt die Standalone-Korrekturen für neue Läufe, Dateiauswahl,
Fehleranzeige und lokale Prüfentscheidungen sowie die ergänzten
Datenschutz-/Formatregressionen. Der erneute vollständige 140-Dateien-Lauf
auf dem Benutzer-Zielhost, menschliche N3/N4-Abnahme und Produktionsfreigabe
bleiben offen. Sicher gestoppte Dateien werden nicht automatisch freigegeben.
Mac-Finder-/Gatekeeper-, Linux-Desktop- und Cowork-Modellabnahmen sowie die
formale N3/N4-Freigabe bleiben ebenfalls offen. Ältere Assets werden nicht überschrieben.

### RC142 – Standalone Windows sowie macOS ZIP und zusätzlich DMG

Das [RC142-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc142)
bindet exakt Quellcommit `c0ddd11ecf366d32ff9962bfeffc6519b01a8c5d`.
Die [Pflicht-CI](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36562791648)
und die lokale vollständige Produktsuite sind grün. Windows-PKG-04/INT-13
bestätigt zwei saubere, bytegleiche Builds und native Smokes beider ZIPs.
Der Windows-ZIP-Hash ist
`4a358f4534f6b678265406a8aa1a7829ba241a97562cea30a997a2ee5c6e08f1`.
Der exakt gepackte Kandidat konvertierte zusätzlich die fünf im RC140-UAT
gescheiterten realen PDF-/PPTX-Dateien ohne Inhaltsprotokoll; jede Ausgabe
behielt den ehrlichen Grad `incomplete`. Die passive Ausnahme gilt nur für reine
Standalone-Konvertierung, nicht für Anonymisierung oder Cowork.

Der [native Mac-Lauf](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36562812021)
prüfte Intel und Apple Silicon separat: dieselbe ad-hoc-signierte App im
unverändert weiter angebotenen ZIP und im zusätzlichen DMG, Architekturen,
Signatur, Start, gemountetes DMG und `/Applications`-Link. Die lokal erneut
abgeglichenen Release-Digests sind:

| Architektur | ZIP SHA-256 | DMG SHA-256 |
|---|---|---|
| macOS Intel | `d1751bc52b8d97a706529cea5968a91caaf032daca3a1339db280067e3b3f3b2` | `09abfcd226637f87e7eb1f8590083d9666c70d2c0181ef80e9d43caae76bff4d` |
| macOS Apple Silicon | `6727eaad725b3240d77633fa5ccf84c782e7f615790766db6a3d99e297789b66` | `2072ac1bdd8e9dabd649e9ad9f2b445e59a93c4d36f588c903fc9027ccb31aa8` |

ZIP und DMG sind Alternativen, keine unterschiedlichen Funktionen. Ein DMG
ersetzt weder Developer-ID-Signatur noch Apple-Notarisierung. Sichtbare
Finder-/Gatekeeper-/13.5- und menschliche N3/N4-Abnahme bleiben offen.
Die RC141- und RC140-Assets werden nicht überschrieben; RC142 enthält keine
neuen Linux- oder Cowork-Pakete.

RC141 ist als Standalone-macOS-Vorabkandidat aus Quellcommit
`1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542` veröffentlicht:
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141>.
Der Tag bindet exakt den Buildcommit, nicht den späteren Dokumentationsstand.
Die vier Release-Assets (Intel-/ARM-ZIP und jeweils `.zip.sha256`) sind in Größe
und SHA-256 mit den lokal geprüften Dateien abgeglichen. Die ZIPs wurden für
die dauerhafte Veröffentlichung weder neu gebaut noch verändert.

**Kompatibilitätsnachtrag MAC-20260923:** Der Standalone-Supervisor in den
unveränderten RC140-Assets verlangt Intel macOS 15.0 bzw. ARM macOS 14.0.
Die deklarierte Mindestversion 13.5 ist für diese Pakete nicht korrekt. Die
nachträglichen Deployment-/Signatur-/Plist-/Reviewkorrekturen sind in den neuen
Standalone-Mac-ZIPs RC141 enthalten. RC140-
Hashes, Tag und damalige Testläufe werden nicht nachträglich umgedeutet.

**RC141-Mac-Evidence:** Beide Standalone-Architekturen binden Commit
`1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542`, Pflicht-CI `35875614129` und den
bestandenen nativen Lauf `35875613438`. Je kompiliertem Bundle wurden zwei
bytegleiche ZIPs erzeugt; das belegt deterministische Archivierung, nicht zwei
unabhängige Compiler-Builds. Signaturen sämtlicher nativer Komponenten,
Architekturen, tatsächliche minOS-/Systembibliotheksverträge, direkte und
LaunchServices-Starts sowie echte Konvertierung/Anonymisierung, Zuordnung,
Fehler und Verlauf nach Neustart bestehen. Beide heruntergeladenen ZIPs wurden
lokal erneut geprüft. Die exakten Größen und Hashes stehen im
[RC141-Nachweis](REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).
Die Artefakte sind lokal gesichert und im oben verlinkten GitHub-Release dauerhaft
verfügbar; die eintägige Actions-Aufbewahrung betrifft nur die Buildkopien.
Standalone Windows, Linux und sämtliche Cowork-Pakete behalten
ihre veröffentlichten RC140-Pakete. macOS 13.5 ist nun der verifizierte
Binärvertrag, noch kein real ausgeführter Zielhosttest. Sichtbare Installation
und N3/N4 bleiben offen; die Pakete sind ad hoc signiert, nicht notarisiert.

### RC140 – früherer gemeinsamer Vorabrelease

RC140 ist als gemeinsamer, aber produktgetrennter Vorabkandidat aus dem sauberen
Quellcommit `814bc50e3d754224cd95b6fa91f122dd45f48487` veröffentlicht:
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140>.
Alle 15 Release-Assets stimmen in Größe und SHA-256 mit dem lokalen Staging
überein; `SHA256SUMS` deckt die 14 weiteren Dateien ab. Standalone-Windows
bestand PKG-04/INT-13: zwei saubere, bytegleiche ZIP-Bauten zu je 110.290.089
Bytes, SHA-256 `deb0eaab98b3981f2ca979cfe7a941e1942bc00a83ba934a7a23dd2de79796f1`,
beide Paket-, Worker-, Verlaufs- und nativen Smokes. Die nativen Mac-Intel-/ARM-
Läufe `35864636481` bauten die ZIPs jeweils zweimal bytegleich, prüften
App, Sidecar, Node und Supervisor einzeln auf Signatur/Architektur und starteten
den entpackten Paketinhalt mit echten Office-/PDF-/OCR-Konvertierungen. Linux
bestand `35864697349`. Cowork bestand seine drei nativen Zielpakete in
`35864685584`; Windows-Normal ist bytegleich zum unabhängigen Release-Lauf
`35864624729`, der Normal, Debug, UAT und SPDX bindet. Pflicht-CI
`35864600808` ist grün. Der native Windows-Helfer wurde mit der gepinnten
MSVC-Toolchain auf dem Buildhost quell-/binärgleich reproduziert; das rollende
VS-2026-GitHub-Image prüft nur die Integrität des getrackten Helfers und wird
nicht fälschlich als identischer Compiler ausgegeben.

Die macOS-ZIPs bleiben ad-hoc-signierte **interne Piloten**. Browser-Download,
Finder-Entpackung, Kopie nach Programme, Gatekeeper/LaunchServices, macOS 13.5
und sichtbare Intel-/ARM-UAT sind nicht durch Runner-Smokes bewiesen.
Menschliche N3/N4-, Cowork-Modell- und Produktionsfreigaben bleiben offen.

### RC139 – historischer Cowork-Kandidat

Der Windows-x64-Cowork-Kandidat RC139 sowie beide Mac-Kandidaten binden den sauberen Quellcommit
`46c6fec4722c879989f5c8e3059367241c117c3a`. Der Release
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc139>
enthält drei normale Ziel-ZIPs, Windows-Debug, Windows-UAT-Vorlage, SPDX und
die finale Prüfsummenliste. Alle sieben hochgeladenen Dateien wurden über die
GitHub-Asset-Digests mit den lokalen Dateien abgeglichen.

Die vollständige lokale Produktsuite bestand mit 65 Basis- und 117 direkten
Testdateien (182 insgesamt); Versions-, Dokumentations- und echte UAT-Fixture-
Prüfungen sind grün. Pflichtlauf `34701892871` ist erfolgreich. Der gezielte
Paketlauf `34701897963` baute die drei normalen ZIPs und startete exakt diese
Archive anschließend auf Windows x64, macOS Intel und macOS ARM64 nativ.
Manifest, Architektur, MCP-Roundtrip und dauerhafter lokaler Zustand bestanden.

| RC139-Artefakt | Byte | SHA-256 |
|---|---:|---|
| Windows x64 Normal | 35.051.787 | `032cb8a7f1603c607c3d223096d9d8a1f2ab577d6d17baee0ed72982e45d6a71` |
| Windows x64 Debug | 35.053.309 | `77a049dfb4ad3d90cfff44b083979fcf5d17b4bcd106c9fde55251a76793a6a8` |
| macOS Intel Normal | 39.791.473 | `816925c53432f628c21ecd1174ebe9bd4243f62bccec38be6384504e71cef5d7` |
| macOS ARM64 Normal | 38.807.221 | `5993ad7bb93768314d793a759ca8850c7a40c98e9d1d13b5f7037226d10cd541` |
| Windows-UAT-Vorlage | 5.540 | `0e909dceb4b1920ac97b229492558bf2162a398fa12a5b75ee31d7904fd3a50f` |
| SPDX | 20.950 | `5a8c07893faef607c5e18786822fa30fc3e90483673fa42a0bb30b5acaf6059d` |

Windows-Normal und -Debug wurden zusätzlich aus derselben Workflow-Runtime
jeweils zweimal bytegleich gebaut; beide Bauten bestanden jeweils das native
ZIP-Gate. Das lokale normale Windows-ZIP ist bytegleich zum Workflow- und
Release-ZIP. Die UAT-Vorlage bindet genau diese Normal-/Debug-Bytes und denselben
Commit; ihre 12×3- und 41×3-Modellgates bleiben `NOT_RUN`. Die separate native
Mac-Evidence ist keine Windows-UAT- oder menschliche Abnahme. Sichtbare
Claude-/Cowork-, N3/N4- und Produktionsfreigaben bleiben offen. Standalone bleibt
funktional und in seinen veröffentlichten Paketen auf RC137; RC139 ist Cowork-only.

### Historische Kandidaten und behobene Nachweislücken

Der frühere Windows-x64-Cowork-Kandidat RC138 und die
beiden macOS-Cowork-Kandidaten sind an den sauberen Quellcommit
`d70cb266df90bdc07b0efadbf81f0d81195b3920` gebunden. Der Release
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc138>
enthält die drei nativ geprüften Normalpakete, eine getrennte Windows-Debug-
Variante, SBOM, Prüfsummen und die vollständig auf `NOT_RUN` stehende Cowork-
UAT-Vorlage.

Der manuelle Lauf `34691170241` erzeugte die drei normalen Plugin-ZIPs und
startete **genau diese Archive** anschließend auf Windows x64, macOS Intel und
macOS ARM64. Manifest, Architektur, vollständiger MCP-Roundtrip und dauerhafter
lokaler Zustand bestanden auf allen drei Zielhosts. Die Releaseartefakte sind:

- Windows x64: 35.051.336 Byte, SHA-256
  `bc005e23060c5334b8466525e91deb9d9f712e5c64bf4de1b420e8c04797d251`;
- macOS Intel: 39.791.021 Byte, SHA-256
  `a34443f8147034b8e63f61f1129790a043c89b3cc5d84a99d6641325848c5efb`;
- macOS ARM64: 38.806.770 Byte, SHA-256
  `829ba3f25c263ad1477d42540068439da7d4e9340b866bd5689376b39f7463f2`.

Der lokale Windows-Doppelbau aus demselben Commit war bytegleich: normales
Paket 35.051.388 Byte mit SHA-256
`934c8cb6df4e1843149b5733d316b0c77aae0def2d276e3a83520b899f3ff08a`,
Debug-Paket 35.052.910 Byte mit SHA-256
`1f7a343853971bf296f9c2fad154bf73cb9540a64ca4764682fc85ab299eccf7`.
Das commitgebundene UAT-Evidence-ZIP hat 3.375 Byte und SHA-256
`8777115f3143a58f90ab8adee1b1323416661fbfc8db7cf667a97a019f242a5a`.
Die abweichenden Hashes des lokalen und des Workflow-Windows-ZIPs beruhen auf
unterschiedlichen LF-/CRLF-Zeilenenden der gebündelten Node-Lizenz und deren
Evidence-Feldern, nicht abweichenden Produktquellen; veröffentlicht wird ausschließlich das
im Workflow nativ gestartete Archiv.

Standalone wurde funktional nicht geändert und nicht als RC138 neu gebaut.
Sein aktueller technischer UAT-Kandidat bleibt RC137, gebunden an Quellcommit
`8979d4b2127741c2921cb6f0654fb83d82944845`. RC135 bleibt getrennt als letzter
plattformübergreifend paketgebundener Stand vor RC139 vollständig
nachvollziehbar; RC136 bleibt der dazwischenliegende Windows-Cowork-Kandidat.
RC138 ist trotz der grünen E0-Gates keine menschliche Cowork-Modell-, N3/N4-
oder Produktionsfreigabe. Die nachträglich geschlossenen BL-041.15–.18 verlangen
für den nächsten Kandidaten einen sauberen Commit sowie zwei explizit angegebene,
vor der Evidenzaufnahme verifizierte Archive. RC138 und seine UAT-Vorlage bleiben
damit historische Evidence und dürfen nicht erneut als N3/N4-Kandidat gebunden
werden.

Der zweite Astra-Korrekturblock `ASTRA2-20260912-01`–`04` ist seit RC139
veröffentlicht; die RC138-Archive bleiben unverändert. Der manuelle Windows-Releaseweg
lädt Node außerhalb des Quellbaums nach `RUNNER_TEMP`, baut Normal und Debug,
erzeugt die UAT-Vorlage und inventarisiert **danach** mit `generate-sbom.mjs
--archive <normal> --archive <debug> --cowork-uat <uat>` den finalen Satz.
Upload und `SHA256SUMS` umfassen beide Produkt-ZIPs, UAT-ZIP und SPDX. Die
UAT-Bindungen müssen den tatsächlichen Archivbytes und Quellcommits entsprechen.
Beim plattformübergreifenden Release enthält derselbe finale Inventarlauf
zusätzlich die normalen Mac-Intel-/ARM-ZIPs aus demselben Commit. Ihre nativen
Smokes bleiben getrennte Zielhostnachweise; die Windows-UAT-Vorlage behauptet
keinen Mac-Test. Unbekannte, doppelte oder fremdcommitgebundene Zusatzpakete
werden nicht akzeptiert.
Der wiederholbare Offline-Test ist `node tests/manual/cowork-release-offline.mjs`
(Windows x64, bereits attestierte Runtime unter `dist/windows-x64`); er ist
kein Ersatz für commitgebundenen Releasebau oder menschliche Abnahme.

`node tests/manual/cowork-uat-fixtures.js` prüft die synthetischen UAT-Eingaben
mit dem echten nativen Parser/OCR, Batchjournal und verifizierten Handoff:
terminales DOCX ohne Retry, vollständiges Ergebnis plus zurückgehaltene Grafik
plus Stopp, eingebettete Instruktion als untrusted data und sechs Ergebnisse mit
`more=true`. Keine Parser-/OCR-/Ergebnis-Mocks, kein Claude-Modelltest. Der Lauf
benötigt die native Parserumgebung und erzeugt nur isolierte Testdaten.

Windows-PKG-04 erzeugte zwei bytegleiche Standalone-Archive zu jeweils
110.253.680 Byte. Paket-, Worker-, History-/Sidecar- und native Smokes
bestanden; INT-13 bindet SHA-256
`3dfdb38107cf7fd9deae0f26091b7b44a8054a954a192817b69d3f749a47c6f0`.
Der kostenbestätigte Lauf `34609450730` baute, prüfte und startete Standalone
zweimal deterministisch auf macOS ARM64 (115.162.051 Byte, SHA-256
`8314572d…d4416`) und Intel (118.194.215 Byte, SHA-256 `e8210902…b514`).
Lauf `34609464020` tat dasselbe für Linux x64 glibc samt AppImage
(194.347.824 Byte, SHA-256 `f282d416…d282`).

Der Cowork-Lauf `34609438970` erzeugte und validierte die drei
selbsttragenden normalen Plugin-ZIPs: Windows x64 (35.050.312 Byte,
SHA-256 `b97afba9…e467`), macOS ARM64 (38.805.746 Byte, SHA-256
`17d2b6ef…d7f`) und macOS Intel (39.789.997 Byte, SHA-256
`68bdaf9a…839b`). Die getrennte Windows-Debug-Variante wurde lokal aus
derselben Workflow-Runtime zweimal bytegleich gebaut (35.051.835 Byte,
SHA-256 `30a19dc3…6c3c`) und vollständig validiert. Der Vorabrelease
<https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc137>
enthält alle Zielpakete, Sidecar-Prüfsummen, SBOM und eine commitgebundene,
vollständig auf `NOT_RUN` stehende 12×3-UAT-Vorlage. Diese E0-Evidence ist
keine menschliche N3/N4-, sichtbare Zielhost-, Cowork-Modell- oder
Produktionsfreigabe.

RC136 wurde zweimal aus Commit
`71ecafddde891d9d1b4e4bd9cd67833b46d03b08` gebaut. Beide normalen Archive
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

Seit der Nachprüfung vom 12.09.2026 wählt der Standardaufruf ausschließlich das
ZIP der aktuellen Hostarchitektur. Ein anderes Archiv muss ausdrücklich über
`--zip dist/<archiv>.zip` angegeben werden. Gleiche Version genügt nicht:
Vor Ersetzen der generierten Ausgabe müssen die Produktquellen bytegleich mit
dem aktuellen Checkout sein. `PROJECTION-EVIDENCE.json` nennt Quell-ZIP,
SHA-256, Ziel und ausführbare Dateien; die Projektion ist kein nativer Smoke.
`npm run build` prüft den erzeugten Marketplace zusätzlich gegen das echte ZIP.
macOS-Projektionen werden auf POSIX erstellt, nicht auf Windows, und behalten
die Archivmodi. Vor Git-Veröffentlichung müssen alle in der Evidence genannten
ausführbaren Dateien im Git-Index Modus `100755` haben; ein Checkout-Smoke des
Zielhosts bleibt erforderlich. Bereits veröffentlichte RC137-Pakete werden
durch diese lokalen Korrekturen nicht nachträglich neu gebunden.

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

Seit der Nachprüfung vom 12.09.2026 gilt zusätzlich: Der Ubuntu-Job des
Cowork-Workflows belegt nur statische ZIP-Eigenschaften. Der nachgelagerte
`native-package-smoke` muss **genau diese ZIPs** auf jedem gewählten nativen
Host mit `node scripts/verify-plugin-zip.mjs --require-native` starten.
Manifestkommando, vollständiger MCP-Roundtrip und dauerhafter isolierter Cache
werden geprüft. Fremdplattformen dürfen kein natives PASS liefern. Die neue
Für RC138 wurde diese Prüfung im Lauf `34691170241` auf Windows x64, macOS
Intel und macOS ARM64 erfolgreich ausgeführt. Frühere Cowork-Mac-Archive werden
dadurch nicht rückwirkend als nativ gestartet ausgewiesen. Standalone-
Paketnachweise bleiben separat gültig.

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
`test-release-version.mjs` deckt auch den Versionsschnitt aus der einfachen
veröffentlichten Form „RC…“ ab: Der neue RC wird Entwicklungsstand, während
historische Paketnamen, Commitwerte und Hashes unverändert bleiben.

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
angelegt. Die Produkte erhalten getrennte Kampagnen: Innerhalb eines Produkts
bindet derselbe vollständige Git-Commit die Windows- und Mac-Pakete mit jeweils
eigenem Hash. Ein Cowork-only-Release erzwingt keinen Standalone-Neubau.
Pakete eines älteren Commits dürfen
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

Die zugehörige leere Evidence-Vorlage wird nur aus einem sauberen Checkout mit
expliziter Kandidatenbindung erzeugt: `npm run build:cowork-uat-evidence --
--candidate-commit <Commit> --normal-zip <dist/normal.zip> --debug-zip
<dist/debug.zip>`. Beide ZIPs müssen aus genau diesem Commit stammen und vor
der Hash-Aufnahme den nativen Cowork-ZIP-Verifizierer bestehen; dessen
maschinenlesbares Receipt muss Größe und SHA-256 genau der für UAT gelesenen
Bytes bestätigen. PKG-04/INT-13 gehören zur Standalone-Kampagne. Eine bloße Dateisuche in
`dist` ist kein zulässiger Bindungsnachweis. Der Produktbau schreibt den
Quellcommit in jedes `RUNTIME-EVIDENCE.json`; die Evidence-Erzeugung verweigert
jede Abweichung zum explizit angegebenen Kandidatencommit.
Die UAT-Anleitung verlangt echte beobachtete Vorbedingungen. Fehlen diese,
bleibt der Fall `BLOCKED`; simulierte Toolantworten sind kein Live-UAT-Nachweis.

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
