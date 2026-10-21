# RC170 – gemeinsamer Windows-/Mac-Test-Pre-Release

Nutzer erweitert am21.10.2026 den lokalen Windowsauftrag ausdrücklich auf
GitHub-Pre-Releases einschließlich macOS. Ziel: Windows x64, macOS ARM64 und
Intel aus demselben abschließenden Appcommit/Produktfingerprint, Windows-ZIP
zusätzlich lokal mit Testplan. Desktoptests ausschließlich Nutzer/Kollegen.
Status: gemeinsamer finaler Freeze wird vorbereitet; noch kein Release-PASS.

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
