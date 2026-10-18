# RC164 – gemeinsamer Windows-/macOS-Teststand

Nutzerauftrag vom 18.10.2026: neuesten implementierten Featurestand als dieselbe
Version für Windows x64, macOS Apple Silicon und Intel bereitstellen. Die
frühere ungefähre Nummer139/140 wird nicht rückwärts übernommen: Quellversion
ist 3.2.0-rc164. Beide nativen Mac-Build-/Testjobs und deren private Runner-Minuten
sind ausdrücklich freigegeben. Keine Desktopbedienung, M2-Anwendertest später.
Timer bleibt PAUSED; keine Developer-ID, Apple-Einreichung oder Storeverteilung.

## Gemeinsamer Funktionsstand

Ausgangspunkt ist exakt der R8-Produktinputhash
a08125d25e89aa224559a2e0b4adf3710ea5c53a7202b1492f58f56e374dd62c
mit328 Dateien, vor Versionsschnitt und neuer Mac-Buildverkabelung. Enthalten
sind insbesondere das echte Fünfer-Verlaufsfenster, gezieltes Detail-Laden,
frühe Filterung ausgeblendeter/fehlender Einträge, verständlichere Abschluss-
und Exportnavigation, neuer leerer Dateientwurf nach konsumiertem Lauf,
Schnellweg und die mehrfach gegengeprüften Robustheits-/Datenschutzkorrekturen.
Historische R5–R8-Pakete/Evidenzen werden nicht verändert oder umbenannt.

## Mac-Quellenreview und tatsächliche Buildlücke

Der statische Guard gehört in denselben mutierenden Core-Prozess, nicht in
einen externen Lockkeeper. App/Core bleiben gehärtet; Core hat ausschließlich
allow-jit und benötigt kein dynamisch geladenes fremdsigniertes Guardmodul.
Der getrennte offizielle Node-Konverter bleibt ein anderer, hashgepinnter
Artefaktrollentyp mit seinen unveränderten Upstream-Entitlements. Dessen
disable-library-validation darf nicht als aktivierte Core-Library-Validation
ausgegeben werden. Keine Benutzer-Schutzrichtlinie wird abgeschaltet.

Bestätigter Verpackungsblocker vor dieser Runde: leere approved_artifacts-
Liste, kein nativer FINAL-CORE und keine Producer→Consumer-Übergabe. Ein
grüner Windows-/Quellenmodelltest kann diesen Mac-Nachweis nicht ersetzen.

Neue zweistufige Kette:

1. Manueller, kostenbestätigter nativer Producer auf macOS15 ARM64 und Intel;
   exakt gebundener Gitcommit, Node22.23.2-Sourcearchiv/Originalinterpreter,
   Python3.13, Apple-Xcode-Toolchain. Neuer privater Buildordner unter /opt,
   keine Änderung vorhandener ACLs, Rechte oder Sicherheitseinstellungen.
2. Statische Quelltransformation, Configure-/Compilevertrag, Corekompilierung,
   lokale ad-hoc-Härtung und explizite Core-/Konverterproben. Vier abgeschlossene
   Consumerdateien in geschlossenem USTAR, getrennte tatsächliche Buildlogs.
   Das Erzeugen eines Kandidaten ist ausdrücklich noch keine Freigabe.
3. Unabhängige Sichtung tatsächlicher Compiler-/Linkbefehle und Provenienz;
   erst danach explizite kanonische FINAL-CORE-Hashfreigabe je Architektur im
   Quellcode. Keine Approval aus selbst gemeldeter adjacent evidence.
4. Consumer lädt nur den exakten Run/Commit/Target und importiert genau vier
   reguläre Dateien. Bestehender Verifier bindet Sourcepins, Corebytes,
   Provenienz, separates offizielles Konverterartefakt und Entitlements vor
   Cargo. Core nach diesem Schritt nicht neu signieren oder verändern.
5. Full-native Static-Core-Gate mit CLI/--require, fork/IPC, Worker, Guard und
   Fehlerfällen, danach App-/ZIP-/DMG-/Konvertierungs-/Startgates. Windows wird
   ebenfalls vom abschließenden gemeinsamen Quellcommit neu gebaut.

Der Producer behauptet derzeit bewusst kein bestätigtes Ende jeder Compiler-
Prozessgruppe. Diese Provenienz bleibt false; Exit+Close des direkten Kindes
ist kein vollständiger Prozessbaumbeweis. Kein Mock wird als native Abnahme
oder als grüne Finder-/Gatekeeper-/M2-Anwenderprüfung ausgegeben.

## Noch zu binden

Producer-Run-IDs, tatsächliche Architekturergebnisse, geprüfte Approvalhashes,
finaler gemeinsamer Gitcommit/Produktfingerprint, Windows-/Mac-Pakethashes,
native Gateergebnisse und Pre-Release-URL werden nach tatsächlichem Abschluss
ergänzt. Bis dahin ist RC164 Entwicklung, kein abgenommener Download.

Primärquellen für den Review: [Node22.23.2 BUILDING](https://github.com/nodejs/node/blob/v22.23.2/BUILDING.md),
[GitHub Runnerimages](https://github.com/actions/runner-images),
[Apple Library Validation](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation).
Ad-hoc-Sealing ist keine externe Apple-Signierung; Erstöffnungswarnungen und
Unternehmensrichtlinien bleiben ohne Developer-ID mögliche Zielhostgrenzen.
