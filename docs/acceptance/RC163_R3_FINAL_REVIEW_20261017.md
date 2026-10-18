# RC163-R3: gezielter Abschlussreview

Stand: 17.10.2026. Schwerpunkt ausschließlich Windows-/macOS-Standalone.
Dies ist ein neuer Abschlussreview nach der vorigen Fixrunde, keine
nachträgliche Umdeutung ihrer eingefrorenen Nachweise.

## Feste Ausgangsbasis

- Gemeinsame Quellen: `c129d14f15071def661ae8dc21ff60012efd5fec5806f49ad58926fe4d610a18`.
- Unverändertes R3-Windows-ZIP:
  `dist/engineering-rc163-post-review-20261017-r3/DataSecure-Standalone-3.2.0-rc163-windows-x64.zip`.
- ZIP-SHA256: `5af70009b20b3350fbbe48865d50d87da9664720fef57953b78d0450ceb589b6`.
- Unverändertes R3-Quellenarchiv:
  `dist/rc163-post-review-validation-20261017/RC163-CURRENT-SOURCE.zip`.
- Quellenarchiv-SHA256: `33dfc63221105d9cc5a3fa5ce109a895271f96d6f4caa6fcbbebdc7680fda9bf`.

Die frische Ausgangsprüfung hat Quellenfingerabdruck, beide Archivhashes und
den Paket-/PE-Vertrag bestätigt. Der Build-ID-Präfix stimmt mit dem
Quellenfingerabdruck überein. Es wurden keine Archive überschrieben.

## Begrenzter Arbeitsplan

1. Drei unabhängige KI-Review-Aufträge: Windows/Rust/Abhängigkeiten,
   macOS/Bundle/Startkette und gemeinsame Architektur/Fachabläufe.
   Produktionsquellen vor Testannahmen; höchstens drei Agenten gleichzeitig,
   keine Unteragenten oder Kommunikation untereinander.
2. Hauptagent prüft Paket-/Quellenidentität und die komponentenübergreifenden
   Build-, Inventur- und Vertrauensgrenzen. Ein Testsieg allein ist kein
   Fehlerfreiheitsnachweis.
3. Nur konkrete neue Befunde mit Auswirkung und Gegenprobe übernehmen;
   bestehende externe Gates nicht erneut als neue Fehler zählen.
4. Bestätigte Defekte gezielt beheben, Regressionen ergänzen und betroffene
   Verträge erneut ausführen. Korrigierte Quellen separat vom unveränderten
   R3-Stand kennzeichnen und die Fixes gegenreviewen.
5. Abschluss trennt Implementierung, ausgeführten Nachweis und offene
   Zielhost-/Freigabearbeit. Keine Desktopbedienung, kein M2-Test, keine
   kostenpflichtigen Runner, kein Push oder Release.

Die Review-Agenten sind spezialisierte KI-Prüfaufträge, keine zertifizierten
Fachpersonen. Echte Windows-Bedienabnahme, saubere Standardbenutzer-VM,
Apple-Clang-/Mac-Paketlauf, Developer-ID/Notarisierung und M2-/Finder-Abnahme
bleiben getrennte Grenzen, soweit nicht ausdrücklich tatsächlich ausgeführt.

## Ergebnisse

| Prüfsicht | Belegtes Ergebnis | Grenze |
| --- | --- | --- |
| Windows/Rust/Paket | Kein neuer belastbarer OS-spezifischer P1/P2 im begrenzten Prüfbereich. Fünf echte PE-Dateien x64, keine Vendor-CRT-Imports, native Parser-/Jobgrenze und paketgebundener Inhaltsoracle bestanden; Prüftoken nicht erhöht. | Kein WebView-/Dialog-/Clean-VM-/Organisationsrichtliniennachweis; dynamische LoadLibrary-Aufrufe sind durch PE-Imports nicht vollständig erfasst. |
| macOS/Bundle/Startkette | Kein neuer belastbarer OS-spezifischer P1/P2. Relocation, feste Ladepfade, Byte-Inventur, Signierreihenfolge und frühe Core-Diagnose quellenbasiert gegengeprüft. Neun Host-Layoutmodelle bestanden. | Apple-Clang, echte Mac-Pfadraces, kryptografische Signatur-/Ladeprüfung, Finder und M2 weiterhin NOT_RUN. |
| Gemeinsame Architektur | Neuer P2/F13: Einzelentscheidungen können bei einem Manifestwechsel einen Commit schreiben, bevor die spätere Rekonstruktion den Fehler bemerkt. Sammelentscheidungen verwerfen denselben Wechsel bereits vor dem Commit. | Belegte gespeicherte Änderung trotz Fehlerantwort, keine nachgewiesene falsche Erfolgsantwort und kein Beweis für einen früheren realen Anwenderlauf. |

## F13: Einzelentscheidungen an eine konsistente Laufgrundlage binden

Ausgangspfad: `standalone-document-review-store.js`, `decide()`.
Journal, aktuelles Dokument und laufweite Entitätsprojektion verwendeten
keinen gemeinsamen aufruflokalen Manifestkontext. Nach der dauerhaften
Commitdatei erfolgte eine frische Rekonstruktion, die den Konflikt zu spät
erkannte. Der Renderer nutzt diesen Pfad für einzelne Freigaben, Widerrufe
und Text-/Entitätsänderungen; beide Betriebssysteme sind betroffen.

Die isolierte Gegenprobe erfasst zwei echte tracierte Dokumente A/B und
genehmigt A. Unmittelbar nach dem ersten gehaltenen Manifestlesen bei B
wird A aus der Laufgrundlage entfernt. R3-Einzelentscheidung: Fehler,
aber Commitzahl 1 → 2 und B nach Wiederherstellung freigegeben.
Sammelentscheidung: Konflikt vor Commit, Zahl bleibt 1 und B unverändert.
Der Hauptagent hat den Produktionspfad direkt nachgelesen und bestätigt,
dass die Kontextweitergabe sowie die Prüfung vor Commit dort fehlen.

Die enge Korrektur ist umgesetzt: früher aufruflokaler Kontext, Weitergabe
an Journal, aktuelle Dokumente, Metadaten und laufweite Entitätsprojektionen;
Prüfung vor Commit sowie normaler, idempotenter oder blockierter Rückgabe.
Keine aufrufübergreifenden Caches, kein Kontext über `await`.

Der Vorher/Nachher-Vergleich wurde zusätzlich gegen den bytegeprüften Store
aus dem unveränderten R3-Quellenarchiv ausgeführt, in separatem Require-Kontext
ohne Rückschreiben in den Arbeitsbaum. R3: Fehler und Commitzahl 1 → 2;
Fix: Konflikt vor Commit, Zahl bleibt 1. Alter Store-SHA256:
`6d962b7504f829f441ae4031887c0c7890d4f5949423430d1cadd76db6364993`;
neuer Store-SHA256:
`4560aac9aa3c4cda1ea1b92ab9752da4130d3a57d1556cb629ac97220f76870a`.

**24/24** Kontext-/Manipulationsfälle bestanden, einschließlich sechs
Einzelaktionsklassen, invalidiertem idempotentem ACK und einem Wechsel erst
nach dauerhaftem Commit. Letzterer verweigert die Erfolgsantwort, löscht aber
keine bereits tatsächlich gespeicherte Entscheidung; ein frischer identischer
Wiederholungsaufruf rekonstruiert sie ohne Doppelcommit. Bestehende Backend- /
Exportregression **62/62**, laufweite Entitäten **11/11** und Kontrollbesitz
**10/10** sind grün. Der unabhängige Fix-Gegenreview bestätigt die erhaltenen
Revisions-, Hash-, Zweck- und Residualprüfungen und fand keinen weiteren
belastbaren Fehler im engen Delta.

Der eingefrorene R3-Stand und seine Archive bleiben unverändert; ein
korrigierter Arbeitsstand ist nicht rückwirkend R3.

## Ergänzende Quellen-/Paketprüfungen des Hauptagenten

Sieben Fingerprint-/nativer-Markertests, acht vollständige Paketinventur-
Gruppen und der Runtime-Releasepfad bestanden. Ein zusätzlicher Verdacht
zu verspäteten Frontend-Reload-Antworten beim erneuten Öffnen desselben
Laufs wurde unabhängig bestätigt und als F14 behoben.

## F14: Alte Export-Nachladeantwort darf eine neu geöffnete Ansicht nicht sperren

Der Exportdialog war nach dauerhaftem ACK korrekt abgeschlossen. Seine
optionale Nachladeanfrage konnte aber noch offen sein. Wurde der Dialog
geschlossen und derselbe Lauf erneut geöffnet, änderte `open()` bisher nicht
die Zuständigkeitsgeneration. Eine alte Nachladeablehnung konnte dadurch die
neue frische Ansicht auf `stateFresh=false` setzen; eine alte erfolgreiche,
inzwischen überholte Antwort konnte einen falschen Nachladehinweis anzeigen.
Das war eine Zustands-/Bedienlücke, keine automatische Zweitkopie oder
unberechtigte Freigabe.

Der Hauptagent hat zwei registrierte Gegenproben im bestehenden tatsächlichen
Renderer-Harness ergänzt: alte Antwort erfolgreich oder fehlerhaft, jeweils
erst nach erfolgreichem Wiederöffnen desselben Laufs. Vor dem Fix:
85 bestanden / 2 fehlgeschlagen. Danach: **87/87 bestanden**, Status und
Freigabebindungen der neuen Ansicht bleiben erhalten; genau zwei ursprüngliche
Exportaufrufe (Kopie und ACK), keine Wiederholung.

Enge Korrektur: Jedes akzeptierte `open()` erhöht die bestehende
`busyGeneration`, auch bei gleicher Batch-ID. Abgewiesene Öffnungswünsche
während Mutation oder ungespeichertem Entwurf ändern keine Zuständigkeit.
Workspace **136/136** und Workflowprojektion **34/34** sind ebenfalls grün.
Der unabhängige Gegenreview des engen Fixes und die erneuten **87/87** Fälle
sind abgeschlossen: kein weiterer Befund, bestehende Freigabe-, Freshness-
und ausdrückliche Exportgrenzen unverändert. Keine native Bedienung behauptet.

Eine ergänzende direkte Quellenprüfung hat dieselbe veraltete Fehleranzeige
auch am äußeren `open()`-Catch nachgewiesen: Zwei initiale Öffnungen desselben
Laufs, die jüngere erfolgreich und die ältere erst danach fehlerhaft. Der
interne Ticketcheck bewahrte frische Bindungen, der äußere Catch zeigte dennoch
den alten Fehler. Unabhängig mit dem tatsächlichen Renderer-Harness bestätigt;
neue registrierte Gegenproben für beide Zwecke scheiterten vor dem Nachzug
mit **87 bestanden / 2 fehlgeschlagen**. `open()` hält jetzt die nach `canOpen()`
erzeugte Besitzgeneration auch für seinen Catch. Danach und im unabhängigen
Gegenreview: **89/89 bestanden**. Die neuen Proben prüfen ausdrücklich, dass
Fehler der aktuellen Anfrage weiterhin sichtbar bleiben und Änderungen sperren;
keine Entscheidung, Kopie oder automatische Wiederholung wird ausgelöst.

## Integrierter Abschluss

Der korrigierte gemeinsame Quellenfingerabdruck ist
`95113c1e8d31a193186d0f47a1008f536f99be4c94dd453c8823afb806bacd6a`.
Windows-Rust: **167 bestanden / 3 regulär ignorierte Testhelfer**; Clippy
ohne Warnungen. Zusätzliche tatsächliche Headless-Renderer-Probe mit
synthetischem IPC, Dialog/Fokus, axe und Reflow bei 390/720/1280 Pixeln
bestanden; dies ist kein nativer WebView-/Dialognachweis.
Beide Gates wurden nach dem letzten F14-Catch-Fix erneut ausgeführt.

Der vollständige **242-Dateien-Headless-Lauf am endgültig korrigierten Stand
ist bestanden**. Produktquellen und registrierte Testdateien wurden davor/danach
bytegeprüft; der Abschlusswrapper bestätigt ausdrücklich unveränderte Bytes.
Digest der 242 registrierten Testdateien:
`2a51f3835c29349364b89748a55c9492003a82fe731d4e7ca821fe05c1596236`.
Der vorher begonnene Gesamtlauf wurde wegen des zusätzlichen F14-Catch-Fixes
bewusst ersetzt und wird nicht als vollständig bestanden gezählt.
Ein neues lokales Windows-R4-Final-Paket wurde separat gebaut und geprüft, ohne
R3 oder das Vorabpaket zu überschreiben. Das Vorabpaket unter `...-r4/` hat
die isolierten Sidecar-Funktionsproben bestanden, enthält aber noch nicht
den letzten Catch-Fix und ist nicht der finale Testkandidat.

Das endgültige lokale ZIP liegt unter
`dist/engineering-rc163-post-review-20261017-r4-final/DataSecure-Standalone-3.2.0-rc163-windows-x64.zip`:
**112.212.589 Bytes / 1.134 Einträge**, SHA256
`77edb1dd9c59b2c0f41be2ff6ad20facf0ebc71990c81f2d8d38f11ac73f9134`.
Release-Build und vollständiger Paket-/PE-Importvertrag bestanden.
Der unabhängige semantische Inhaltsoracle wurde an genau diesem extrahierten
ZIP ausgeführt: drei Dokumente, 15 Faktensätze, Tabellenzeilen und -spalten,
Verneinungen, Zahlen/Einheiten/Vorzeichen und unterscheidbare konsistente
Personentokens; Originalbytes unverändert, automatische Erstfreigabe,
Neustart sowie Export/ACK/History bestanden. Dieser Oracle nutzt den
Produktions-Sidecar-Exportadapter, nicht den nativen Rust-Publikationskanal;
er belegt weder OCR-Genauigkeit noch native Bedienung oder Mac-Lauffähigkeit.

Die vollständige isolierte Sidecar-Paketprobe am endgültigen ZIP ist ebenfalls
bestanden: beide Zwecke und real fehlgeschlagene CSV, passive PDF/PPTX,
4.500 Fundstellen im ersten Prüfblock, OCR-Kontaktkorrektur einschließlich
exakter Originalausschnitte und Neustart, freiwillige Markdown-Prüfung
ausdrücklich überspringen, Bildinhalte mit/ohne OCR, geführte Anonymisierung
mit PNG/JPEG/BMP/Scan-PDF, Schnellweg, Widerruf, Export/ACK sowie History
nach Neustart und geändertem Ergebnisordner. Auch diese Probe bedient
keine native Tauri-Oberfläche; die echte Node→Rust-Kette ist ein eigenes Gate.

Auch dieses eigene Gate ist im finalen Gesamtlauf bestanden: tatsächliche
Node→Rust-Kopie für beide Zwecke, verlorene Rückmeldung, späterer Widerruf,
ACK, Zielauflösung und Manipulationsabwehr. Acht echte Zwei-Prozess-Abbrüche
(beide Zwecke × Node-Intent / vor Rename / nach Rename / nach ACK) stellten
genau dieselbe Auswahl wieder her und erzeugten jeweils nur eine exakte Kopie.
Der 10.001-Kontakt-Test durchlief tatsächlichen Core, Personen-/Firmenänderung,
Freigabe, native Kopie und erneutes Lesen der vertraulichen Zuordnung.
Keine native Oberfläche wurde dafür bedient.

## Übergabe und offene Zielhost-Gates

Die zwei neuen P2-Befunde F13/F14 sind lokal behoben und gegengeprüft.
Das R4-Final-ZIP ist ein **lokaler Windows-Testkandidat**, keine veröffentlichte
Version und keine Bedienabnahme. Das unveränderte R3 bleibt historische Basis.
Keine Desktopbedienung, kein Push, Release, CI-/Mac-Runner oder M2-Aufruf.

Der gemeinsame Quellenstand einschließlich Lockdateien und Tests wird separat
unter `dist/rc163-r3-final-review-20261017/RC163-R4-SOURCE.zip` mit
`RC163-R4-SOURCE-FREEZE.json` und `R4-COMMON-SOURCE-INVENTORY.json` festgehalten.
Der Freeze prüft jede archivierte Git-Arbeitsbaumdatei erneut gegen ihre Bytes,
den nativen Windows-Marker gegen den gemeinsamen Fingerabdruck und beide
R3-Archive gegen ihre unveränderten Hashes. Der Basis-Git-Commit allein enthält
die lokalen Fixes nicht; die Build-ID ist ein Quellenfingerabdruck-Präfix,
kein erfundener Commit. Die spätere Mac-Version muss denselben Freeze verwenden.

Offen bleiben die echte Windows-Bedienabnahme und eine saubere Standardbenutzer-
VM, die native Apple-Clang-/Pfadrace-Probe, Mac-Signier-/Ladeprüfung und
Developer-ID/Notarisierung sowie Finder-/Dialog-/M2- und Organisationsrichtlinien-
Abnahme. Diese externen Nachweise wurden nicht durch Quellreview oder grüne
Windows-Tests ersetzt. Ein begrenzter Abschlussreview beweist nicht, dass
beliebige Eingaben oder jede mögliche Zielumgebung fehlerfrei funktionieren.

## Primärquellen

- [Apple CommonDigest.h](https://raw.githubusercontent.com/apple-oss-distributions/CommonCrypto/main/include/CommonDigest.h): Die verwendeten SHA256-APIs sind verfügbar; kein nachgewiesener Deprecation-/Werror-Fehler.
- [Apple Bundle-Struktur](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle) und [Code Signing in Depth](https://developer.apple.com/library/archive/technotes/tn2206/_index.html): Quellenplausibilität ersetzt keine native Signier-/Ladeprüfung.
