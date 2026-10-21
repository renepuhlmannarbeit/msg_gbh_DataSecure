# RC170 – gemeinsamer Windows-/Mac-Test-Pre-Release

Nutzer erweitert am21.10.2026 den lokalen Windowsauftrag ausdrücklich auf
GitHub-Pre-Releases einschließlich macOS. Ziel: Windows x64, macOS ARM64 und
Intel aus demselben abschließenden Appcommit/Produktfingerprint, Windows-ZIP
zusätzlich lokal mit Testplan. Desktoptests ausschließlich Nutzer/Kollegen.
Status: am21.10.2026 um17:33:15UTC als gemeinsamer Test-Pre-Release veröffentlicht.
Technische Endgates und unabhängige KI-Artefaktgegenreviews bestanden;
menschliche Desktop-/Mac-/Officeabnahme bleibt USER_PENDING.

## Tatsächlicher gemeinsamer Abschluss

[GitHub-Pre-Release RC170](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc170),
Release419851964,Tagv3.2.0-rc170,Appcommit
`ab05612443ccf2914f4170b56d88f636c39c742f`/Build`ab056124`.
Produktfingerprint`94c392156dc1d21094d1bd0c6e1b7653756eefcd7cb94b745fc0e9cb603358db`,338Produktdateien.
574Test-/Scriptinputs,Manifest`79668b34383be6f49718768796714e079bc17061adf3dbcab67237003ad89829`.
Dokumentationsabschluss danach ist kein neuer Paketcommit und verschiebt den Tag nicht.

- Source03:285/285Headlessdateien plus11/11Zusatzgates bestanden17:19:00.161UTC;
  alle Inputs unverändert. Windows Prepare/Clippy/280Rusttests(3ignoriert)/echte
  Node-Rust-Ergebnisintegration/Release sowie5Paketgates bestanden.
- Tatsächlicher Windows-Konverterlauf:30Rendergegenfälle,67Konvertergruppen,
  31Office/OCR-Gruppen.100/100Markdownkorpus,0Fehler,Originaleunverändert.
- Nativer Macconsumer39636489410 auf exakt demselben Appcommit SUCCESS;
  ARMjob119348367682/Artefakt12365255885,Inteljob119348367609/Artefakt12366590037.
  Je65anwendbareKonvertergruppen bestanden,2Windows-spezifische Gruppen explizit
  übersprungen;31Office/OCR-Gruppen. Echte Core/Guard/Worker/forkIPC/ACL-/App-/
  ZIP-/DMG-Belege und tatsächliche Archivbytes unabhängig gegengelesen.
- Beide Macarchive enthalten233gemeinsameServer-Quelldateien bytegleich zur
  eingefrorenen Quelle, exakte PDF.js-Ableitung und unveränderte freigegebene
  Corebytes. Offizieller Converter bleibt getrennte offen hashgebundene Rolle.
- Alle20Releaseassets vor UND nach Veröffentlichung frisch heruntergeladen und
  gehasht; Inventar, Asset-IDs, PreReleaseflag und Tagquelle erneut bestätigt.
  Releasebody stimmt mit geprüften Notizen überein. Keine alten ZIPs umetikettiert.
- Lokale Windowsübergabe create-only unter
  `C:\Users\arkud\Documents\Software DataSecure\RC170`:19Dateien,ZIP,14Fall-Testplan,
  drei unveränderte synthetische Testarchive und Prüfsummen. Entpackpfadmaximum226
  Zeichen am angegebenen Ziel; kein Appstart/Desktoptest durch den Agenten.

| Archiv | SHA256 |
| --- | --- |
| Windows x64 ZIP | `ec81597dcf4bbcf729ab8139dab117893f46659fc4090bf8d1e5bad7911cebee` |
| macOS ARM64 ZIP | `e546114417f6710acdd426fa09b531b474ed0c939edaa2c6460bff6bae96d4f8` |
| macOS ARM64 DMG | `98346eaf4e7d5be4c39add9dde7cac2c4afcb057a87976a67bc6f24ee748711f` |
| macOS Intel ZIP | `4dbddf35f10d0925836d42fa9cbc50d34b4d342b5b82627c3f7922afea2dbb8a` |
| macOS Intel DMG | `6dfcb5033f22472aca00d0c338ed19cb1c6ce8bd096c75bfc20c7fbe94cd0395` |

Belege unter`dist/rc170-document-extraction-source03-20261021`,Windowsgegenreview
`dist/rc170-source03-windows-review-20261021`,beideMacgegenreviews
`dist/rc170-source03-{arm,intel}-review-20261021`.
Sourceoverlay938Dateien/8442133Bytes,
SHA`cb69abb03be63d753f6b52ca19db9b5447f3388253e119528e3202160da85868`;
kein eigenständiger Checkout oder menschlicher Abnahmenachweis.

Offen ausschließlich die vereinbarte menschliche14Fall-Abnahme einschließlich
echter Finder-/TCC-/M2-/Enterprise-/VoiceOver-/Office-/macOS26-Prüfung.
macOS26-Gate explizit skipped; adversariale ACL-Matrix PARTIAL,
Coreepoch/pause/lease/gui NOT_RUN im gesonderten Coregate. Gepackte Sidecarprobe
bewahrt ihre Fixture bei unbestätigter Writerquieszenz,kein erfundener Cleanup-PASS.
Suchtexte ausdrücklich erhalten,keine vollständige semantische Artefaktfreiheit,
keine Developer-ID/Notarisierung oder OS-Schutzabschaltung. Nutzerdateien,
Profile,Läufe,Ergebnisse,RC169 und ältere Evidenzen bleiben unverändert.

## Unveränderte Funktionsgrenzen

[Dokumentextraktionskorrekturen](DOCUMENT_EXTRACTION_ARTIFACTS_20261021.md):
passive moderne PPTX-Kommentare eng zulassen, sichere PDF-/OCR-Zeichenhygiene,
exakt positionsgebundene OCR-Dopplungen. Sämtliche vorhandenen PDF-Suchtexte
bleiben ausdrücklich erhalten. Keine vollständige semantische Artefaktfreiheit.
Umlaute/ß/andere Sprachen/Symbole erhalten; kein Sprachzeichen-Whitelistfilter.
Bestehende Dateien/Profile/Läufe/RC169 nicht ändern oder reparieren.

Keine Developer-ID, Zertifikat-/Schlüsselsuche, Apple-Einreichung/Notarisierung,
Storeverteilung, OS-Rechteänderung oder Abschaltung von Gatekeeper/HardenedRuntime.
Lokales Ad-hoc-Sealing wie bisher; vorhandener freigegebener statischer Core im
mutierenden Prozess, offizieller Converter getrennte ehrlich hashgebundene Rolle.
Kein neuer Coreproducer erforderlich: Run39167676290/Quelle7d0ee31dc65ce31ce54f1b4a1a0cefa348ef7071,
beide Artefakte am21.10. tatsächlich verfügbar/nicht abgelaufen bestätigt.

## Gemeinsamer Prüf- und Übergabeplan

1. Die reinen Dokumentationskopfkorrekturen in den abschließenden gemeinsamen
   Gitstand aufnehmen, Push auf vorhandenen Arbeitsbranch, keine Mainintegration.
2. Vor Dispatch laufende GitHubjobs prüfen. Genau ein Macconsumer target=both,
   confirm_private_runner_minutes=true,upload_package=true,produce_static_core=false,
   core_candidate_run_id=39167676290 und exakte oben genannte Corequelle.
3. Frische gebundene Headless285+11, Windows Prepare/Clippy/Rust/Node-Rust/Release,
   neues ZIP und fünf Paketgates, PDF-/Office-Konvertergegenfälle. Keine Quellen-,
   Test-, Script-, Driver- oder HEADänderungen während der jeweiligen Freezejobs.
4. Beide echten Mac-Consumerresultate/Logs/ZIP/DMG/Runtime-/Core-/Seal-/IPC-/
   Guard-/Konverterbelege prüfen und unabhängige tatsächliche Artefaktgegenreviews.
   CI/LaunchServices ist keine physische Finder/TCC/M2/Enterprise-/VoiceOverabnahme.
5. Windows lokal create-only RC170 mit Testplan, synthetischen Testdaten und
   Prüfsummen. Kein erfundener GUI-FINAL, USER_PENDING für menschliche Tests.
6. GitHub-Pre-Release mit fünf Apparchiven, synthetischen Testdaten, Plänen und
   Belegen. Assetinventar/Remotehashes/Tagquelle/Prereleaseflag vor und nach
   Publikation tatsächlich nachlesen. Keine alten ZIPs umetikettieren.

## Vorläufige ältere RC170-Belege

Source01/440209bfcf4538c0e335205933f80058656e3a37,FP94c392156dc1d21094d1bd0c6e1b7653756eefcd7cb94b745fc0e9cb603358db:
Native280Rust(3ignoriert),Node-Rust/Clippy/Release,5Paketgates,100Dateien und
67+31Konvertergruppen bestanden; unabhängiger ZIP-/Übergabegegenreview bestanden.
ZIPced0491f1caadf1c5feeb89870d320e4f3e9ff5049992a39ace755b8253dac6c
bleibt unveröffentlichter alter Kandidat, kein gemeinsamer finaler Stand.

Erster Headless rot bei154/285 wegen fehlender Ist-Zustand-Kennung im nach
RC169-Publikation geänderten Dokumentkopf. Nur PRODUCT/CURRENT_STATE/BACKLOG-
Köpfe korrigiert und7Dokumentationsprüfungen bestanden; Appfingerprint unverändert.
Source02-Headless vor absichtlichem gemeinsamen Commitwechsel gezielt gestoppt:
eigener Root42924/Kind63776 an echten Commandlines geprüft, nur dieser eigene
Prozessbaum beendet, danach beide abwesend. Teilbelege erhalten, kein FINAL-PASS.
Keine alten Teilnachweise als neue abschließende Belege ausgeben.
