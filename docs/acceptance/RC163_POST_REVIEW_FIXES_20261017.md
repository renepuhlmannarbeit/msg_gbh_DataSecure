# RC163: lokale Korrekturen nach dem Tiefenreview

Stand: 17.10.2026. Ausgangscommit:
`ec7460741291707b0d0aab4cab3459154bb4bec9`.
Dieser Bericht beschreibt einen weiterentwickelten lokalen Quellenstand und
den getrennten neuen RC163-R3-Engineering-Kandidaten, nicht das unveränderte
frühere RC163-R2-ZIP und keine neue Veröffentlichung.

## Auftrag und Grenzen

Schwerpunkt sind Windows- und macOS-Standalone mit gemeinsamem Fach-Core
und kleinen OS-Adaptern. Keine getrennten fachlichen Implementierungen.
Keine Desktopbedienung; native Anwenderabnahme und M2-Probe erfolgen später.
Keine Änderung bestehender Releasearchive, keine kostenpflichtigen Runner,
kein Push und keine Veröffentlichung in dieser lokalen Runde.

Die separaten Cowork-Härtungen H01/H02 sind nach der Schwerpunktentscheidung
zurückgestellt. Das vom Anwender ausdrücklich gewählte bisherige
Hostvertrauen bleibt bestehen: Ein Modellparameter `confirmed=true` beweist
keine menschliche Zustimmung. Es wird dafür kein neuer lokaler Dialog
eingebaut. Diese Grenze betrifft nicht die Standalone-Dialoge oder die
automatische Erstfreigabe im bewusst gewählten Schnellweg.

## Umgesetzte Befunde

| ID | Produktionsänderung | Nachweis und verbleibende Grenze |
| --- | --- | --- |
| F01/P1 | Tabellenumformung trägt OCR-Kontakte exakt über ursprüngliche Zeilenidentitäten und UTF-16-Positionen weiter. Keine Suche nach gleichem Wert, keine verworfenen Korridore. | Reale isolierte Windows-Konvertierung von DOCX/XLSX/PPTX mit Tabelle und zwei Kontaktbildern; manuelle/automatische Kontaktbehandlung. Nativer Mac-Lauf offen. |
| F02/P1 | Windows verwendet statische CRT; Buildguard und tatsächliche normale/verzögerte PE-Imports sichern die portable Strategie. CI lädt die Cargo-Konfiguration aus dem richtigen Verzeichnis. | Neu gebaute EXE und reale native Komponenten ohne Vendor-CRT-Imports gegengeprüft. Saubere Windows-VM ohne Entwicklerprerequisites und finale GUI-Abnahme bleiben offen. CRT-Sicherheitsupdates verlangen Neubau/Neuverteilung. |
| F03 | Nativer Diagnoseworker mit begrenzter nicht blockierender Queue; Status atomar ohne Datei-I/O. Verlust und ausstehende Einträge werden sichtbar. | Deterministisch blockierter Sink, Überlast und Fehlerabschaltung geprüft. Der JS-Core-Sink bleibt synchron; keine vollständige Core-I/O-Isolation behauptet. |
| F04 | Geschlossener Diagnoseexport akzeptiert die tatsächlich produzierten festen Ereignisse einschließlich frühem Sidecar-Ende und abgebrochener Auswahl. | Produzent-/Sanitizerverträge und Gegenproben mit fremden Feldern/Rohtext. |
| F05 | Native Core-Generationskennung ermöglicht begrenzte gezielte Suche nach aktuellen und kürzlich fehlgeschlagenen Core-Logsegmenten trotz überfüllter alter Inventur. | Mehr als 128 ältere Einträge plus aktuelles rotiertes Segment; keine Löschung oder unbeschränkte Suche. |
| F06 | Dauerhaft akzeptierter Kopiebeleg beendet die Mutation vor dem optionalen Dokument-Reload. Abschluss bleibt sichtbar; Navigation möglich, Mutationen bis frischer Bindung gesperrt. | Langsamer/fehlgeschlagener Reload, Schließen und späte Antwort, anderer offener Export und verlorenes ACK separat geprüft. |
| F07 | Diagnosepaket direkt im Exportdialog unabhängig vom Core speichern. | Headless Renderer prüft Besitz/keinen Zweitexport; native Speicherdialog-Abnahme bleibt offen. |
| F08 | Frische Journalprojektionen ersetzen nur im gleichen Aufruf doppelte gespeicherte Zusammenfassungen; Namespace einmal gebunden und abschließend nachgeprüft. | Echtes Dateisystem: bei 32 frischen Journalen null statt 32 doppelte Zusammenfassungsleser; Namespace einmal statt je Zeile. Globale Inventur bleibt O(N), keine dauerhaften Autoritätscaches. |
| F09 | Bestätigte KI-Kopie und erwartete OCR-Auslassungen erscheinen kumulativ; zusätzliche Prüfung ist nach bestätigter vollständiger Kopie sekundär. | Aktueller Exportbeleg plus OCR-aus-Hinweis, offene Exportabsicht und fehlende Prüfstände getrennt geprüft. |
| F10 | Windows-/Mac-Anleitungen beschreiben geführten Weg, Schnellweg, Dateinamenwahl, Diagnose und Abschluss; Paketidentität statt fester angeblich aktueller RC-Nummer. | Dokumentverträge; beide Anleitungen sind Teil des gemeinsamen Quellenfingerabdrucks. Historische RC162-Verweise sind ausdrücklich historisch. |
| F11/P2, nach T05 gefunden | Aufruflokaler gebundener Kontext für synchrone Listen-/Sammelfreigabedurchgänge unter Kontrollsperre. Auch die Journalvalidierung verwendet das früh gebundene Manifest; ursprüngliche Eltern und Manifest werden vor Commit/Rückgabe erneut geprüft. Dokumente, Revisionen und Artefakte bleiben frisch. | Bei acht Dokumenten Sammelfreigabe 35.986 → 4.869 lstatSync-Aufrufe; lokal 4,02 → 0,49 s. 16 Manipulations-/Content-Options-Fälle einschließlich des zweiten Gegenreview-Befunds bestanden. Capture/Export sind ausgenommen; keine Timeout-Erhöhung oder dauerhaften Caches. |
| F12/P2, A02-Gegenreview | Unsichere pfadbasierte Kopier-/chmod-/Unlink-Folge durch Build-only-Mac-Helfer ersetzt: drei feste Rollen, gehaltene Directory-FDs, openat/O_NOFOLLOW/O_EXCL, fchmod und unlinkat. Quellenbytes und App-Identität bleiben gebunden. | Hostunabhängige Quell-/Layoutmodelle grün; native Kompilierung und synchronisierte echte Mac-Pfadrace-Probe sind vorgeschaltete, hier nicht ausgeführte Mac-Build-Gates. Kein bewiesener ursprünglicher M2-Startfehler. |

## Revalidierung

Die begrenzten KI-Review-Aufträge ersetzen keine zertifizierten Fachpersonen
und keine unabhängige menschliche Abnahme. Produktionsquellcode wurde vor den
Tests geprüft. Ein separater Gegenreview von F01–F07/F09 fand im geprüften
Diff keinen weiteren belastbaren Fehler und führte 301 gezielte Fälle aus.
Das ist kein Beweis, dass jede Methode oder alle möglichen Eingaben korrekt
sind. Reale Converter-/Dateisystem-/Prozessketten ergänzen die DOM-/IPC-Modelle.

Gezielt ausgeführt: Dokument-Renderer 85/85, Workspace 136/136,
Workflow-Projektion 34/34, Dokumentationsvertrag 28/28, Windows-Rust
167 bestanden / 3 regulär ignoriert. Die ignorierten Testhelfer werden nicht
als getestete Benutzerfälle gezählt. F01-Prüfung: 18 Content-Privacy- und
29 reale Office-/OCR-Gruppen; mehrere getrennte Kontakt-/Privacy-Regressionsgates.
Der gestartete breite kanonische Headless-Lauf ist mit **239 Testdateien
bestanden** abgeschlossen. Während der Fixrunde neu registrierte Dateien und
überarbeitete kritische Quellen wurden zusätzlich gezielt erneut geprüft,
einschließlich Mac-Layout, F11-Kontext, Prozessabbruchkette und realem Office-OCR.
Der jetzige Runner enthält 242 disjunkte Dateien. Es wird kein einzelner
unverändert eingefrorener 242-Dateien-Gesamtlauf behauptet. Native Formulare,
WebView2 und Mac-Finder sind dadurch ausdrücklich nicht abgenommen.

T05 ist inzwischen als vollständiger Lauf **62/62 bestanden**. Die stille
Phase lag unter anderem im maximalen 200-Dokument-Test, der echte Capture-,
Listen-, Commit- und Rekonstruktionsarbeit vor einer einzigen Testmeldung
ausführt. Das ist kein bewiesener Deadlock. Das isolierte Aufrufprofil belegt
aber F11; der enge Fix ist mit tatsächlichen Dateisystemzählungen geprüft.
Die erste Liste fällt bei acht Dokumenten von 36.682 auf 9.514 lstatSync,
die abschließende Liste von 35.350 auf 4.190. Zeitwerte sind lokale,
parallel beeinflusste Diagnosebeobachtungen, keine Windows-/Mac-SLA.
Der maximale Commit-Test enthält
keine vollständige moderne residuale Datenschutzanalyse; weitere tracierte
Content-Options-Fälle ergänzen ihn: Beide tatsächlich erzeugten Kandidaten
durchlaufen nachweislich weiterhin die echte Residualanalyse. Der Kontext
lebt ausschließlich innerhalb eines synchronen gesperrten Durchgangs,
niemals über NativeExport-`await` oder zwischen Anfragen hinweg.
Der unabhängige Gegenreview fand zunächst eine frühere Konsistenzlücke:
Journalvalidierung und nachfolgende Projektion konnten zwei Manifeststände
lesen. Beide Entry-Points binden das Manifest jetzt vor dem Journal und
reichen denselben Kontext hinein. Zwei echte Dateimanipulationsproben mit
bereits bestehendem Commit verwerfen den Austausch ohne neue Freigabe.
Das aktualisierte Aufrufprofil liegt unter
`dist/rc163-deep-review-20261017/F11-FS-PROFILE.json`.

T03: **8/8 echte Zwei-Prozess-Abbrüche** unter Windows bestanden. Für beide
Verarbeitungszwecke wurden Node-Store und Rust-Testpipe an vier Stellen
abrupt beendet: nach dauerhaftem Node-Intent, vor Veröffentlichung, nach
Veröffentlichung und nach nativem ACK vor Node-Rückmeldung. Frische Prozesse
rekonstruieren denselben Auftrag ohne automatische Zweitkopie; ein noch
unveröffentlichter Auftrag bleibt ohne ausdrückliches Fortsetzen unbestätigt.
Dies ist kein Tauri-/Paket-/M2-Nachweis.

T02 wurde gegen das unveränderte RC163-R2-Archiv und anschließend gegen das
neue integrierte R3-ZIP erfolgreich ausgeführt: drei echte
TXT-/MD-/CSV-Schnellweg-Dokumente, 15 fachliche
Prosa-Zeilen, zwei Tabellenzeilen mit sechs Spalten, Originalerhalt,
automatische Erstfreigabe, Core-Neustart, Export/ACK und Verlaufsabgleich.
Der unabhängige Inhaltsoracle weist elf gezielt verfälschte Gegenbeispiele
ab. Das neue integrierte Paket bestand dieselbe Probe mit seinem eigenen
Hash und Quellenfingerabdruck, nicht mit ersetzten Entwicklungsmodulen. Der
produktive Sidecar-Exportadapter wird ausgeführt, nicht die native
Rust-Publikationsbridge; diese Grenze wird nicht durch eine Mock-Bridge kaschiert.

A02 ist jetzt quellenbasiert migriert: Konverter-Node und Sandbox liegen
unter `Contents/MacOS`, Canvas unter `Contents/Frameworks`. Ein geschlossener
Layoutadapter bindet Rollen statt freier Manifestpfade; Canvas erhält nur
seinen geprüften exakten Lesepfad. Neun hostunabhängige Layout-/Pfadrace-/
Manipulationsfälle sind grün. Die abschließende native Signierkette wurde
hier nicht ausgeführt. Der gepinnte Hersteller-Konverter behält seine
bisherigen sechs breiten Entitlements; die Pipeline inventarisiert sie
ausdrücklich. Engere Developer-ID-Policy, Notarisierung und reales Laden
auf dem M2 sind weiterhin separate offene Gates, keine bestandene Freigabe.
Der weitere unabhängige A02-Gegenreview fand F12 in der neuen
Paketierungs-Schreibgrenze. Diese ist nun auf native verzeichnisrelative
Mutation umgestellt. Die neun Layoutfälle allein beweisen keine rennfreie
Mutation auf einem Mac: Der echte Mac-Build muss zusätzlich den quellgebundenen
Helfer kompilieren und beide synchronisierten Elternaustausch-Proben bestehen.
Der Helfer wird ausdrücklich nicht mit App oder Plugin ausgeliefert. Eine
vertrauenswürdige isolierte Buildumgebung bleibt Voraussetzung; gehaltene
Dateideskriptoren machen einen Ordner nicht global unverrückbar.
Ein zweiter Gegenreview fand keine nach außen umleitbare Mutation mehr.
Quellen werden zusätzlich mit `O_NONBLOCK` geöffnet, damit ein eingeschobenes
FIFO schon vor dem Dateitypcheck nicht hängen kann; die native Probe enthält
dafür einen eigenen Negativfall. Die Blattgrenze ist ausdrücklich dokumentiert:
`fstatat` plus `unlinkat` ist kein atomares Compare-and-Unlink. Konkurrierende
Blattschreiber innerhalb des autorisierten Buildbaums müssen durch die
isolierte Buildumgebung ausgeschlossen sein. Es wird keine darüber
hinausgehende Löschgarantie oder native Mac-Abnahme behauptet.

## Noch getrennt nachzuweisen

- Native Windows-Bedienung einschließlich WebView2, Datei-/Ordnerwahl und
  Diagnosespeicherdialog; der Anwender testet ausdrücklich selbst. Zusätzlich
  bleibt der Start in einer sauberen Standardbenutzer-VM ohne Entwicklungs-
  prerequisites offen. PE-Imports allein ersetzen diese Abnahmen nicht.
- macOS-Codepositionen: Core und Shell liegen korrekt in `Contents/MacOS`,
  Konverter-Node/Sandbox/Canvas bisher teilweise unter Ressourcen. Der
  Layoutadapter ist im Quellcode umgestellt. Dieser Befund beweist den früheren
  Core-SIGTRAP nicht. Developer-ID, Notarisierung und M2-/Finder-Abnahme offen.
- Unveränderte Originale und die früheren RC163-R2-Paketbytes bewahren;
  spätere Windows- und Mac-Kandidaten aus demselben neuen Quellen-Freeze bauen.
- Organisationsrichtlinien, echte Datenschutzverantwortung und menschliche
  Verständlichkeitsabnahme bleiben externe Aufgaben. KI-Reviews ersetzen
  diese Rollen nicht. H01/H02 bleiben bewusst außerhalb dieser Standalone-Runde.

## Neuer lokaler Windows-Kandidat und gemeinsamer Mac-Freeze

Der native Release-Build und die Integritäts-/Abhängigkeitsprüfung des tatsächlich
neu erzeugten ZIPs sind bestanden. Es ist ein **lokales Engineering-Paket**, keine
neue Pre-Release-Veröffentlichung oder native Benutzerabnahme.

Auch die vollständige paketgebundene isolierte Sidecar-Probe ist bestanden:
beide Verarbeitungszwecke, tatsächliche Formatkonvertierung, große Prüfgruppen,
Vertagen/Neustart, OCR mit Originalbildausschnitt und Korrektur, bewusste
ungeprüfte OCR-Fortsetzung ohne erfundene Bestätigung, Markdown mit/ohne OCR,
anonymisierte Bild-/Scanformate, Schnellweg einschließlich Widerruf sowie
Verlauf, exakte Zielordner, Neustart und geänderter Ergebnisordner. Testprofile
waren frisch und isoliert; weder Desktop noch echtes Benutzerprofil wurden
gesteuert. Native Rust-Veröffentlichung und abrupter Zwei-Prozess-Abbruch sind
separat nachgewiesen, nicht stillschweigend von diesem Sidecar-Test abgeleitet.

- ZIP: `dist/engineering-rc163-post-review-20261017-r3/DataSecure-Standalone-3.2.0-rc163-windows-x64.zip`
- Größe: 112.212.581 Bytes; 1.134 Einträge.
- ZIP-SHA256: `5af70009b20b3350fbbe48865d50d87da9664720fef57953b78d0450ceb589b6`.
- Gemeinsamer Quellenfingerabdruck: `c129d14f15071def661ae8dc21ff60012efd5fec5806f49ad58926fe4d610a18`.
- Native Desktop-SHA256: `256005591643537970d3554d095f27ef86adcfc11027d920c61afec0e2d9ea70`.
- Engineering-Buildkennung: die ersten 40 Zeichen des Quellenfingerabdrucks,
  ausdrücklich **kein Git-Commit**. Ausgangscommit bleibt `ec7460741291707b0d0aab4cab3459154bb4bec9`;
  die weiterentwickelten Arbeitsbaumdateien sind noch nicht committed.

Das lokale Quellenarchiv und sein vollständiger Nachweis werden unter
`dist/rc163-post-review-validation-20261017/RC163-SOURCE-FREEZE.json`
festgehalten. Der spätere Mac-Build muss das dortige aktuelle Quellenarchiv,
die unveränderten Locks und denselben gemeinsamen Fingerabdruck verwenden.
Ein Checkout allein des Ausgangscommits würde die neuen Fixes verlieren.
Die nativen Mac-Gates bleiben vor dem nächsten M2-Paket erforderlich.

Das ältere R2-ZIP wurde nochmals bytegenau geprüft:
`92b782a6ad6fe3a96ec7a2976c78cadbaac6cec7df19ef60195a93603b977a72`.
Es enthält diese Fixrunde nicht und wurde nicht überschrieben.
Der aktuelle maschinenlesbare Status liegt zusätzlich unter
`dist/rc163-post-review-validation-20261017/FIX-RESULTS.json`.
Das ältere `dist/rc163-deep-review-20261017/FIX-BACKLOG.json` bleibt als
ursprünglicher Befundsnapshot unverändert; seine damaligen OPEN-Einträge
sind nicht der aktuelle Umsetzungsstatus.

## Primärquellen zur technischen Abwägung

- [Rust: statische/dynamische C-Laufzeiten](https://doc.rust-lang.org/reference/linkage.html#static-and-dynamic-c-runtimes): Flags allein sind kein Beweis; tatsächliche Binärdatei prüfen.
- [Microsoft: Visual-C++-Verteilung](https://learn.microsoft.com/en-us/cpp/windows/deployment-in-visual-cpp?view=msvc-170): portable statische Laufzeit braucht eigene Sicherheitswartung.
- [OWASP: Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): Fehler/Überlast der Diagnose dürfen Produktarbeit nicht stoppen; sensible Daten ausschließen.
- [Apple: Bundle-Inhalte](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle) und [Code Signing in Depth](https://developer.apple.com/library/archive/technotes/tn2206/_index.html): Codepositionen und Signierreihenfolge getrennt von bloßer Startfähigkeit prüfen.
- [Apple: sichere Dateioperationen und Rennen](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/Articles/RaceConditions.html): eine spätere Verweigerung macht vorheriges umgeleitetes Schreiben nicht ungeschehen.
- [WAI: modale Dialoge](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): wichtige laufbezogene Aktionen müssen innerhalb eines aktiven Modals erreichbar bleiben.
