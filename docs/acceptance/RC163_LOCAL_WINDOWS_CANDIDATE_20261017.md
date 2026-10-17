# RC163 – lokaler Windows-Kandidat und gemeinsamer M2-Quellstand

Stand: 17.10.2026 · 3.2.0-rc163 · lokaler Engineering-Kandidat in Vorbereitung,
keine Veröffentlichung und keine N3/N4-Produktionsfreigabe.

## Auftrag und Grenzen

Das Windows-ZIP soll die seit RC162 integrierten Funktions-, Bedienungs-,
Diagnose- und Durchsatzänderungen gemeinsam enthalten. Die spätere ARM-Mac-
Version wird aus demselben festgehaltenen Quellstand und denselben gemeinsamen
Abhängigkeiten gebaut. Windows- und macOS-Binärdateien sind nicht identisch;
ihre Fachlogik und der Feature-Stack müssen es sein. Der M2-Test bleibt offen.
Bestehende Releasearchive und fremde temporäre Arbeitsverzeichnisse werden
nicht gelöscht oder überschrieben. Kein Push und kein GitHub-Release.

## Unabhängige Quellenreviews

| Prüfsicht | Ergebnis und Grenze |
| --- | --- |
| Rust, IPC, Windows/macOS-Prozess- und Dateibesitz | Drei vorhandene Clippy-Befunde ohne Lint-Unterdrückung bereinigt. Ein `PublicationWorker` besitzt Guard und ursprüngliche Deadline gemeinsam; nach Timeout wird kein zweiter Schreiber autorisiert. Startoptionen und Fastweg-Policy stammen aus demselben geschlossen validierten Invoke-Body. Windows-Clippy grün; Rust 163 bestanden, 0 fehlgeschlagen, 3 regulär ignorierte Unterprozess-Einstiegspunkte. Kein nativer Mac-Nachweis. |
| Fachablauf, Benutzerführung und Status | Kein konkreter neuer Abnahmeblocker im untersuchten Source gefunden. Manueller Weg und ausdrücklicher Schnellweg bleiben getrennt. Automatik maskiert bekannte Unsicherheiten und kennzeichnet die technisch geprüfte Erstfreigabe ehrlich; Änderung/Widerruf hebt sie auf. OCR-Korrekturen werden für exakt gleiche Lesarten nur vorgeschlagen, nicht als menschliche Prüfung übernommen. Technischer Abschluss, Hinweise, Freigabe und KI-Kopie bleiben getrennte Tatsachen. Quellenreview ersetzt keine native Bedienprobe. |
| Build, Paketierung und Gleichstand Windows/ARM-Mac | Konkreter Befund behoben: Die bisherigen Builder konnten eine ältere Desktopdatei mit einer frisch erzeugten JS-Projektion und aktuellem Paketnamen kombinieren. Beide Builder vergleichen jetzt den eingebetteten nativen Marker mit den frischen gemeinsamen Quellbytes; macOS prüft zusätzlich die übernommenen Runtime-Dateien. Sieben reale Dateisystem-/Build-Gegenproben bestanden. Ein zweiter unabhängiger Rust-/OS-Quellenreview fand keinen Blocker; Signaturen und native Zielhost-Abnahme sind davon getrennt. |

Die bisherigen tieferen Revalidierungen und realen Race-/Exportgegenproben
stehen im [Post-RC162-Prüfbericht](POST_RC162_BATCH_IPC_FOLDER_REVIEW_20261017.md).

Die integrierte Regression fand anschließend einen veralteten exakten
Testvertrag in `test-standalone-pause.js`: Der Test erwartete bei alten
Anonymisierungsläufen keine Hinweisprojektion. Die reale Antwort behält
Dateiname und Fehlergrund und kennzeichnet die alte Extraktionsbasis korrekt
als unbekannt. Eine instrumentierte echte Gateway-Reproduktion und ein
unabhängiger Quellenreview bestätigten das. Die exakte Erwartung enthält
jetzt zusätzlich die drei Hinweisfelder; der Namens-/Grundvergleich bleibt
unverändert streng. Dafür wurde kein Produktionscode gelockert.

Die erste kanonische Suite wird mit ihrem ursprünglichen Fehlerprotokoll
aufbewahrt. Die korrigierte Datei und alle nachfolgenden kanonischen Dateien
laufen erneut; die zusätzliche neue Fingerprint-Datei wird separat geprüft.
Der Abschlussnachweis nennt diese segmentierte Abdeckung, nicht einen
angeblich fehlerfreien ursprünglichen Gesamtlauf. Die verbleibenden nativen
Bedienungstests übernimmt der Anwender ausdrücklich selbst; weitere
Desktopautomation ist nach seinem Stopp nicht autorisiert.

Die zusätzliche Paketierungsprüfung berücksichtigt die dokumentierte
[Cargo-Änderungserkennung](https://doc.rust-lang.org/cargo/reference/build-scripts.html#change-detection):
`rerun-if-changed` verwendet Dateizeitstempel, während `rustc-env` Metadaten
zur Kompilierzeit einbetten kann. Deshalb ist ein frischer Byte-Fingerprint
beim Verpacken erforderlich; eine gleiche Versionsnummer oder ein erhaltenes
mtime genügt nicht. Tauri bettet lokale Dateien aus
[`frontendDist`](https://v2.tauri.app/reference/config/#frontenddist) in das
Programm ein. Die gesperrten gemeinsamen JS-Abhängigkeiten bleiben durch die
Lockdateien bestimmt; [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
ist für einen späteren frischen Checkout vorgesehen, nicht ein implizites
Aktualisieren der Abhängigkeiten.

Erneute Headless-Oberflächenprobe: tatsächliche Workspace-/Dokumentseiten
mit synthetischem IPC, beide Zwecke, Abschluss-/Exportdialoge, Fokus,
WCAG-axe-Prüfung und Reflow bei 390, 720 und 1280 Pixeln bestanden. Die
Screenshots und der Lauftext liegen unter der lokalen RC163-Validierung.
Dies ist ausdrücklich keine native WebView-/Dateidialog-Abnahme.

## Gemeinsamer Quellstand-Freeze

Der abgeschlossene Kandidat wird durch einen lokalen Checkpoint-Commit samt
Git-Tree festgehalten. Alle vorgesehenen neuen Quellen und Tests gehören dazu;
temporäre Testausgaben und `dist/` nicht. Ein zusätzlicher lokaler
`RC163-SOURCE-FREEZE.json` verbindet diesen Stand mit den Hashes der Lockdateien,
Runtime-/Modellverträge, Toolchain sowie des tatsächlich geprüften Windows-ZIP,
Desktops und Paket-/Runtime-Manifests. Der genaue Pfad und die festgestellten
Werte werden nach erfolgreichem Build im lokalen Abschlussnachweis genannt.

Der Quellcheckpoint wird vor dem finalen Desktop-Build erstellt. Die bei
diesem Checkpoint noch laufenden beziehungsweise nachgelagerten Prüfungen
werden deshalb nicht nachträglich als Quellcode umetikettiert: maßgeblich
für den tatsächlichen Abschluss ist die lokale Datei
`dist/rc163-local-validation-20261017-r1/RC163-SOURCE-FREEZE.json` mit den
Gate-Ergebnissen und dem Hash des übergebenen ZIPs. Diese Datei ist kein
Produktions-GO. Ein fehlgeschlagenes Gate erfordert Korrektur und neuen
Checkpoint, bevor ein Kandidat als erfolgreich geprüft übergeben wird.

Der spätere ARM-Build muss denselben Commit/Tree und dieselben gemeinsamen
Locks verwenden. Wenn Windows-Tests eine fachliche Korrektur erfordern, gilt
diese nicht rückwirkend für den bereits eingefrorenen Kandidaten: neuer
gemeinsamer Stand und betroffene Windows-Gegenprobe sind dann erforderlich.
M2-Build, Finder-/ZIP-/DMG-Start, Dateidialoge und Organisationsrichtlinien
werden später auf diesem gemeinsamen Stand separat geprüft.

## Prüfablauf für diesen Kandidaten

1. Vollständige kanonische Headless-Produktregression und erneut warning-freies
   Rust prüfen; die Headless-Suite behauptet keine native Bedienung.
2. Neue Paket-/Quellstandbindung einschließlich fehlendem, fremdem und nach
   Quelländerung veraltetem Desktop prüfen.
3. Runtime und Windows-Desktop frisch bauen, in eigenes Engineering-ZIP
   verpacken, Inventar/Prüfsumme und tatsächlich entpackte Prozessketten prüfen.
4. Native Bereitschaft und isolierte Windows-Bedienung prüfen: Datei-/Ordnerwahl,
   Ergebnisordner und Diagnose ohne Eingriff in bestehende Nutzerdaten.
5. Windows-ZIP, Prüfsumme, Quellstand-Freeze und die tatsächlich erreichten
   Gate-Ergebnisse lokal übergeben. Nicht ausgeführte Fälle bleiben offen.

## Anschließende bediente Windows-Funktionstests

- Geführte Anonymisierung: Fundstellen prüfen, speichern, Dokumente freigeben,
  ausdrücklich exportieren; keine zweite Kopie als vermeintlichen Pflichtschritt.
- Schnellweg mit OCR und Mehrdeutigkeiten: automatische Herkunft sichtbar,
  konservative Maskierung und kein automatischer KI-Export.
- Markdown ohne OCR, mit OCR sowie mit Kontaktprüfung; gleiche Lesarten als
  Korrekturvorschlag, andere Fundstellen weiterhin offen.
- Mehrminütige Unterbrechung während der Prüfung, Vertagen und Neustart.
- Automatisch freigegebenes Dokument ändern oder widerrufen; nach Neustart
  keine automatische Wiederfreigabe.
- Abschluss mit OCR-Auslassungen, Datenschutzstopp, technischen Dateifehlern
  und unbekannten Alt-Hinweisen: Gründe getrennt und keine falsche Vollständigkeit.
- Größerer Export: sichtbare Phasen, schließbarer Abschluss, danach leere Auswahl;
  verlorene Antwort und Neustart gleichen denselben Auftrag ohne Doppelkopie ab.
- Erstinstallation ohne Ergebnisordner, verlorener oder verweigerter Ordner,
  vorhandene Historie und ein Diagnosepaket bei ausgefallenem Core.
