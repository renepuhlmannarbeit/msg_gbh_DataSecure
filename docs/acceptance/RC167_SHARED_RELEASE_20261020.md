# RC167 – vertrauliche Zuordnungen im Ergebnisordner

Status: beauftragter gemeinsamer Windows-x64-/macOS-ARM64-/Intel-Teststand;
noch kein Paket-/Releaseabschluss. RC166 bleibt unverändert. Nutzer bedient
den Desktop selbst; keine Desktopautomation und keine geplante Aufgabe.

## Umfang und Sollvertrag

Neue Anonymisierungsergebnisse enthalten zwingend:

- `Vertraulich/Dateizuordnung.csv`: originale Pfade und tatsächliche Ergebnisnamen.
- `Vertraulich/Personen-Pseudonym-Zuordnung.txt`: ursprüngliche Identitäten und
  ihre belegten Pseudonyme aus dem semantischen Transformationsnachweis.

Nach erforderlichen OCR-/Fundstellenprüfungen reicht Ergebnisordner öffnen.
Keine zusätzliche Dokumentfreigabe, Exportauswahl oder Bestätigung. Optionale
Nachbearbeitung erzeugt einen vollständigen neuen Stand mit beiden zu genau
diesen Revisionen und Namen passenden Zuordnungen. Alte `/1`-Ergebnisordner und
alle früheren Stände bleiben unverändert; keine Reparatur oder Adoption beim
Lesen. Reine Markdown-Konvertierung bleibt unverändert.

**Nur gewünschte Markdown-Dateien weitergeben. Vertraulich enthält Originalnamen
und Reidentifikationsdaten und ist nicht zur allgemeinen Weitergabe bestimmt.**

Technische Objekt-/Eltern-/Hash-/Revisions-/Budget-/Guardprüfungen bleiben
erhalten. Keine Developer-ID/Notarisierung, keine Abschaltung von Gatekeeper,
Hardened Runtime oder Core-Library-Validation. Bestehende geprüfte eigene
statische Mac-Cores unverändert; kein neuer Coreproducer nötig.

## Bereits gezielt nachgewiesen

[Quellfix und ehrliche Primär-/Gegenbelege](RC166_RESULT_COMPANIONS_FIX_20261019.md):
16Companion-,65Generationen-,65Async-Assertions; Windows265Rusttests bestanden,
3ignoriert/Clippy sowie echter Produktions-Node→Rust-Pfad beider Betriebsarten.
Unabhängige Erstwriter-/Store-/Rust-/Async-/Testorakel-Gegenreviews abgeschlossen.
Diese Nachweise stammen vor dem neuen Versionsfreeze; keine alte Evidenz wird
auf den neuen Appcommit oder neue Paketbytes umetikettiert.

## Neue Endgates vor Veröffentlichung

1. Gemeinsamer RC167-Appcommit und Produktfingerprint, Version-/Dokumentencheck.
2. Neue unveränderte vollständige Headless- plus Zusatzregression.
3. Neues Windows Prepare/Clippy/Rust/Release und fünf echte Paketgates samt
   unverändertem synthetischem100Dateien-Korpus und Archiv-/EXE-Bindung.
4. Beide echte Mac-Consumer auf genau demselben Appcommit: Source-/Native-/Rust-,
   Guard-/Worker-/IPC-/App-/Konverter-/ZIP-/DMG-Gates einschließlich neuer
   Companion-/Generationen- und nativer Zwei-Dateien-Transaktionen.
5. Tatsächliche Artefakte und Logs unabhängig gegengeprüft; lokales Windows-ZIP,
   aktuelle Testpläne und synthetische Testdaten. Neuer GitHub-Test-Pre-Release;
   Tagquelle, Inventar, Pre-Releaseflag und frisch heruntergeladene Hashes prüfen.

Windows-Desktopfälle führt der Nutzer aus. Physischer M2-/Finder-/TCC-/Enterprise-/
VoiceOver-/macOS26-Test bleibt getrennt; CI und Quellenmodelle ersetzen ihn nicht.
Kein 100-Prozent-Lauffähigkeits- oder Produktionsfreigabeversprechen.

Neue create-only Belege: `dist/rc167-result-companions-source01-20261020`.
Kein Kopieren früherer FINALs, GUI-Proofs oder alter ZIPs als neuen Nachweis.
