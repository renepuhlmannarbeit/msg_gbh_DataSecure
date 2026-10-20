# RC169 – TXT-gleiche Excel-Zuordnung und bearbeitbare Ergebnisse

Status: Windows x64, macOS ARM64 und Intel als gemeinsamer Test-Pre-Release
veröffentlicht. Technische Endgates und unabhängige tatsächliche Quellen-/Artefakt-
gegenreviews abgeschlossen; Desktop-/Office-/Zielhostabnahme beim Nutzer/Kollegen.
Keine Desktopautomation, neue geplante Aufgabe oder Main-Integration.
RC168 und sämtliche älteren Pakete, Profile, Nutzerläufe und Belege bleiben erhalten.

## Umgesetzter Vertrag

[Auftrag, konkrete Diagnose und Vorabgegenreviews](RC169_WORKBOOK_MAPPING_20261020.md).

Erstes XLSX-Blatt **Zuordnungen**: Pseudonym / Typ / Originalwert(e) / Vorkommen /
Datei. Genau eine Zeile je validiertem TXT-Eintrag und dessen numerische Häufigkeit,
nicht je Schreibvariante. Beide Ausgaben verwenden dieselbe strukturierte Quelle;
keine TXT-Neuparsing-/Identitätserfindung oder dokumentübergreifende Markerfusion.
Übersicht/Hinweise, bisherige Detailblätter und ggf. verlustfreie Langwerte folgen.
Keine Formeln/Makros/externen Beziehungen oder neue Produktlaufzeitabhängigkeit.
Die drei vertraulichen Begleitdateien gelten für Anonymisierung, nicht reine
Markdown-Konvertierung. Vertraulich enthält Originalangaben: nicht weitergeben.

Fertig bereitgestellte MD/CSV/TXT/XLSX sind bearbeitbare Arbeitskopien. Normales
Ordneröffnen prüft private Abschlussbelege und ursprüngliche Ordner-/Vorfahren-
bindung, keine öffentlichen Blatt-Hashes/ctime/Inventare. Manuelles Speichern,
Ersetzen, Extras, Office-Locks oder Löschen einzelner Dateien lösen dadurch keinen
erneuten Publikationskonflikt aus. Fehlender/ersetzter/unzugänglicher Ordner neutral
nicht verfügbar; keine Wiederanlage oder Ersatzadoption. Private Prüfstände,
Pending-Publish, erste Fertigstellung und ACK bleiben streng. Neue Appkorrekturen
entstehen ausschließlich aus privater Basis in einem neuen Ordner; externe Edits
werden weder importiert noch überschrieben. Belege beschreiben den App-Ausgangsstand.

Konkreter RC168-Lauf14c09da8 wurde nur gelesen: alle sieben Datei-SHA gleich,
Ordneridentität gleich, keine Extras; nur öffentliche TXT-/XLSX-ctime abweichend.
Kein geänderter Inhalt oder konkrete Office-/OS-Ursache behauptet, keine Reparatur.
Unabhängige Erstgegenreviews fanden drei enge Anschlusslücken (alter Markdown-
Namensraum und zwei unavailable-Rendererpfade), vor Freeze behoben/gegengelesen.
Spreadsheet-Skill beeinflusste isolierte Import-/Render-QA, nicht Produktabhängigkeiten.

## Gemeinsame finale Bindung und tatsächliche Endgates

App-/Tagcommit `8f21b55a41fb63ab62f92d198ec8f108ab8164ad`, Build `8f21b55a`.
Produktfingerprint `77937b239fd35cbc80b7c2037d5d597be007625997815b44e35876fc1d4bd11c`/336.
572Test-/Scriptinputs, Manifest
`6f83580adcdc7f99fec5b66981ea191ad081518fefd3ba997285899bf9f0fd92`.
Create-only Nachweise: `dist/rc169-workbook-mapping-source02-20261020`.
Alle tatsächlichen FINALs passed=true/inputs_unchanged=true; keine Quellen-/Test-/
Driver-/HEADänderung während der Endjobs:

- 285/285Headlessdateien plus11/11Zusatzgates, Abschluss17:28:32.995UTC.
- Windows Prepare/Clippy/280Rust(3ignoriert)/echte vollständige Node-Rust-
  Ergebnisintegration/Release, Abschluss16:56:24.400UTC.
- Fünf Paketgates, Abschluss17:07:16.712UTC: Neubau, Inventar, native Ownership-
  Ladung, Fast-Content-Sourceadapter,100Dateienkorpus/0Fehler/Originale unverändert.
- Source-Snapshot erst danach:933Dateien/8415792Bytes,
  SHA256 `5e7c26f40b8a59a805e4ef63b1937acf03b909370e2415661209f30eaaeca1c5`.
  Exakter Overlaynachweis, kein selbstständiger Checkout oder Desktop-PASS.

Macrun39461104366 vollständig erfolgreich, ARM118760541061 bis17:11:35UTC,
Intel118760540951 bis17:36:24UTC. Je89Generationen/20Companion/47Workbook/
15TXT/271Rust(3ignoriert) und echte Node→Rust-Arbeitskopien-/Private-Pending-
Gegenfälle. Core/Worker/IPC/Guard/Konverter/App/ZIP/DMG-Gates bestanden.
Frische Artefakte12282929522(ARM)/12285522513(Intel) heruntergeladen und jeweils
unabhängig am tatsächlichen Inhalt gegengelesen. Je1154Archiveinträge,
232gemeinsame Servermodule bytegleich, vollständige Require-Closure; keine Profile/
Nutzerläufe/Diagnosen im geschlossenen Paketinventar. Windows zusätzlich alle elf
eingebetteten Frontend-JS/CSS-Dateien unabhängig bytegleich geprüft.

| Archiv | Bytes | SHA256 |
|---|---:|---|
| Windows x64 ZIP |112399102|`9b5cb80ce3f4507d857566853e380b567deaa59f0342712640b4fcaad2e3a775`|
| ARM64 ZIP |117750154|`3b90cfc9cd7b158eabfd7567f3f74a50c4a891ebb2001f76d274c984890b5c3a`|
| ARM64 DMG |131589868|`02533a08ab23304098e952bbe1264070e3b213eb8933529b2d37595e53eaf42a`|
| Intel ZIP |121006154|`1d98d8b313c331162b401cc0f6791b2e6345023c1afdd8dcd388516bdcac71e1`|
| Intel DMG |137359388|`f765165ae57486edc7d87b90ceb3e72d1f8411b1f555da567c6b86776cf3a468`|

Windows-EXE `d26fa583367d9fc5ccbd3572785b9105b238a4edb3b47d5393caf195d3cbf4a7`.
Eigene statische Mac-Cores unverändert aus freigegebenem Producer39167676290/
7d0ee31dc65ce31ce54f1b4a1a0cefa348ef7071, Guard im mutierenden Prozess.
Eigene App/Core lokal ad-hoc/runtime, Core ausschließlich allow-jit, UI ohne
Entitlementfreigaben. Offizieller Converter separat hashgebunden mit ursprünglichen
breiteren Vendor-Entitlements. Keine Developer-ID/Notarisierung/Apple-Einreichung,
Schlüssel-/Zertifikatssuche oder Abschaltung von Gatekeeper/OS-Schutzfunktionen.

## Übergabe, Veröffentlichung und ehrliche Grenzen

Windows create-only unter `C:\Users\arkud\Documents\Software DataSecure\RC169`:
18Dateien einschließlich ZIP, Testplan, Prüfsummen, tatsächlicher technischer
Belege, zehn USER_PENDING-Fällen und drei unveränderten synthetischen Testdaten-ZIPs
(RC160/RC164/RC166Large). Kein GUI-FINAL oder erfundener Desktop-PASS.
Unabhängiger finaler Gegenreview rehashte alle18lokalen/20Release-Dateien und
beide originalen Mac-Belegsätze. Eine unqualifizierte Begleitdateien-Formulierung
in den erzeugten Release-Notizen vor Veröffentlichung auf Anonymisierung begrenzt;
keine Quellen-/Helper-/FINAL-/Paket-/Assetänderung dafür.

[RC169-Release418691555](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc169)
veröffentlicht20.10.2026,19:50:11MESZ(17:50:11UTC), PreRelease=true/Draft=false.
Exakt20Assets: fünf Apparchive, drei Testdaten, acht Einzelprüfsummen, zwei
Testpläne, RELEASE-EVIDENCE und SHA256SUMS. Alle20im Entwurf und nach Publikation
frisch heruntergeladen/gehasht, gleiche AssetIDs und Tagquelle bestätigt.
REMOTE-PUBLISHED-VERIFIED17:51:02.244UTC; annotierter Tag
`c3d05f837ffa50303bcfa531ce3468479b87c1c0` löst exakt auf8f21b55a… auf.
Veröffentlichter Beschreibungstext entspricht dem tatsächlich geprüften Text.

Source01/e2b9e665 bleibt historisch: lokale Gates und ARM grün, Intel nachweislich
vom45Minuten-CI-Jobwächter abgebrochen. Keine Produkt-/Corecrashursache behauptet.
Nur umschließenden Consumerrahmen auf75Minuten erhöht; innere Test-/IPC-/Produkt-
deadlines und separater Coreproducer330Minuten unverändert. Neues Source02 mit
neuen Paketen/Gates ersetzt diese Bindung, kein altes ZIP umetikettiert.

Offen beim Nutzer/Kollegen: Windows-/Mac-Desktopfälle, echte Excel-/Numbers-
Anzeige/Zählung, physische ARM64/Intel/M2-/Finder-/TCC-/Gatekeeper-/Enterprise-/
VoiceOver-/macOS13.5/26-Abnahme. CI-Start/LaunchServices belegt Load+IPC, keine
menschliche Bedienung. macOS26Gate übersprungen; epoch/pause/leaseNOT_RUN,
adversariale ACL-MatrixPARTIAL. Smoke-Fixture bei unbestätigter Writerquieszenz
bewahrt. Keine Ausführung heruntergeladener Macbytes oder eigene native
Codesign-/DMG-Mount-Prüfung unter Windows behauptet. Isolierte Workbookreader zeigten
Xstring-/Langziffern-Anzeigegrenzen, keinen universellen Office-Gleichheits-PASS.
Historische RC166-Default-/Manifest-/Intel-Schedulingursachen bleiben unbewiesen.

Technische Gates sind keine Produktionsfreigabe, vollständige Anonymitätsgarantie
oder Zusage für jeden Zielhost. Nachfolgende reine Dokumentation ändert weder
App-/Tagcommit noch Produktfingerprint/Paketbytes oder ursprüngliche FINALs.
