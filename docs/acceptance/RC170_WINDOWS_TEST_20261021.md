# RC170 – lokale Windows-Testversion

Auftrag vom21.10.2026: neue Windowsversion zum eigenen Desktoptest bereitstellen.
Status: Vorbereitung; noch kein Paket-/Übergabe-PASS.

Die [Dokumentextraktionskorrekturen](DOCUMENT_EXTRACTION_ARTIFACTS_20261021.md)
werden neu als3.2.0-rc170 gebaut. RC169, Profile und alle alten Dateien bleiben
erhalten. Kein GitHubrelease, Push, Main-Integration oder Macrunner-Auftrag.
Gemeinsamer Windows-/Mac-Quellcode; hier nur echte lokale Windowsgates.

## Technischer Prüfplan

- Neue lokale Quellbindung nach Versionierung; keine nachträgliche Veränderung
  von Produkt-, Test-, Script-, Driver- oder HEADinputs während der Prüfjobs.
- Kanonische Headlessregression samt bisherigen11Zusatzgates.
- Prepare, Clippy, Rusttests, echte Node-Rust-Ergebnisintegration, Release-Build.
- Neues create-only Windows-ZIP, vollständiges Paketinventar, echter Guardloader,
  Fast-Content-Adapter und100Dateienkorpus. Neuer Hook und Quellfingerprint müssen
  in der tatsächlichen ZIP vollständig enthalten sein.
- Fokussierte neue PDF-/Office-Konvertertests an diesem Quellstand.
- Lokale Übergabe unter einem neuen RC170-Ordner, ZIP-/EXE-Prüfsummen,
  menschenlesbarer Testplan und ehrliche USER_PENDING-Desktopabnahme.

Keine vollständige Artefaktfreiheit zusichern: vorhandene PDF-Suchtexte bleiben
ausdrücklich erhalten; nur sichere technische Zeichenbereinigung und exakt
belegte OCR-Dopplungsentfernung. Keine Reparatur früherer Ergebnisdateien.
Keine OS-Rechte-/Schutz-/Signierungsänderungen und keine Desktopautomation.
