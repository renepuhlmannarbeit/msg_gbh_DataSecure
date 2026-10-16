# Lokale Nachprüfung nach RC161: Verlauf und KI-Export-Recovery

Stand: 16.10.2026. Diese Änderungen liegen nur im lokalen Quellstand; RC161
und seine Downloads wurden nicht verändert.

## Entscheidung zur Startzeit

- Die dauerhafte Sicherung von Laufzusammenfassungen und Exportordner-Bindungen
  geschieht weiterhin vor der Datenpflege, jetzt ohne zweite vollständige
  Verlaufsprojektion.
- Der spätere Folgestand trennt die Verlaufsprojektion von der
  Ergebnisnachholung. Die 20 jüngsten Einträge werden erst beim Öffnen von
  „Verlauf“ geladen und danach nur solange die Ansicht offen ist aktualisiert.
  Das Anzeigen darf kompakte private Kurzbelege pflegen, löst aber keine
  Ergebnisdatei-Kopie aus.
- Nur „Bereitstellung erneut prüfen“ fordert für genau den gewählten Lauf
  eine Nachholung an. Während dieser exklusiven IPC-Aktion werden
  Hintergrundstatus, weitere Verlaufsabrufe und Doppelklicks nicht
  eingereiht. Eine Reduktion auf fünf Einträge hätte den unveränderten
  sicherheitsrelevanten Bootstrap nicht beschleunigt.
- Die Windows-/Mac-Zielhost-Laufzeit dieses Folgestands bleibt zu messen;
  ein Quell- oder Browsertest beweist keine Startzeitverbesserung.

## KI-Export vor Elternbindung

Ein Absturz nach gespeichertem Export-Intent, aber vor der dauerhaften
Elternbindung war bislang als `AI_EXPORT_UNCERTAIN` sichtbar und selbst durch
ausdrückliches Aufgeben nicht auflösbar. Die lokale Korrektur lässt genau
diese Operation unter dem privaten Lock aufgeben, nur wenn Anfrage und
Wurzelidentitäten übereinstimmen, kein Binding gespeichert ist und kein
öffentlicher Exportordner dieser Operation existiert. Der Marker ist
dauerhaft und idempotent; ein späterer Publish unter derselben Operations-ID
bleibt gesperrt. Eine bereits gespeicherte JS-Abschlussquittung sperrt die
Aufgabe ebenfalls. Orphans und Teilkopien bleiben unangetastet. Bei
widersprüchlichem oder nicht lesbarem Beleg bleibt `AI_EXPORT_UNCERTAIN`.

## Lokale Belege und Grenzen

Ein nachgelagerter Build-Review fand eine gesonderte Verpackungslücke:
`r3` und `r4` hatten trotz einer reinen `frontend/workspace.js`-Änderung
denselben ZIP-SHA-256
`e68accfaf14e926fcb7eeee08bcbcd700a7450aba3d50dc58ebea1d60c8dbbfb`.
Sie sind deshalb **keine** Belege für den neuesten UI-Stand und sollen nicht
als aktuelle Testpakete verwendet werden. Das Cargo-Buildskript überwacht
jetzt `../frontend` ausdrücklich. Gegenprobe: Ein Build hatte den Binary-SHA-256
`de3811c14fd741ed305f61ba592d44e10d08e3af0258de588f3c4c4f860a35b5`;
nach ausschließlich einer Frontend-Änderung baute Cargo erneut und erzeugte
`9ec7b6abcf9129ea241b417d0e14adc0947a90265417b7baaca35e227fd453a9`.
Damit ist das erneute Einbetten tatsächlich belegt. Die beiden älteren
Archive bleiben trotzdem ungeeignet.

- Rust `native_export_workspace`-Tests: Intent-/Journal-/Staging-Cuts,
  Idempotenz, geänderte Anfrage, öffentlicher Ordner und verlorenes Binding
  nach Publikation.
- Rust `native_export_broker`-Test: echter expliziter Abandon-Pfad nach
  ungebundenem Intent und später verweigerte Publikation.
- `test-standalone-native-export.js`: gekoppelte Node/Rust-Szenarien,
  insbesondere gespeicherter Abschluss trotz beschädigtem nativen Binding.
- `cargo test --locked` (127 bestanden, 3 bewusst ignoriert),
  `cargo clippy --locked --all-targets -- -D warnings` und
  `npm run test:standalone` (Exit 0) bestanden lokal. Der umfassende
  Quelltest selbst kennzeichnet sechs native Windows-Bedienfälle als
  `NOT_RUN`.
- Ein unveröffentlichter Windows-x64-Kandidat wurde aus diesem Quellstand
  gebaut: `dist/engineering-rc161-local-20261016-r1/DataSecure-Standalone-3.2.0-rc161-windows-x64.zip`,
  112.004.281 Byte, SHA-256
  `b3a06ec475b137884c2947d50e87cbabd2a9a2670e9b277d5325a0a106fe1786`.
  Die vollständige Paket-Inventarprüfung (1129 Einträge) bestand.
- Der isolierte native Windows-App-Start aus genau diesem ZIP bestand mit
  sichtbarer Oberfläche, Workspace-Seite und erfolgreichen Core-IPC-Antworten
  für `get_public_state` und `get_ui_context` (1.169,693 ms auf dem
  Testrechner). Der native Launcher schloss nur seinen eigenen Testprozess
  und bereinigte nach dessen Ende 1510 eigene isolierte Einträge. Er traf
  keine Review-Entscheidung und prüfte keine manuelle Dateiauswahl.
- Der synthetische Sidecar-/Paket-Smoke aus genau diesem ZIP bestand für
  gemischte Konvertierung, PDF/PPTX/XLSX, OCR-Kontaktprüfung mit
  Vertagen/Neustart, Markdown mit/ohne OCR, Anonymisierung von
  PNG/JPEG/BMP/Scan-PDF, Dokumentprüfung, exakte Exporte und Verlauf nach
  Neustart/Zielordnerwechsel. Das ist keine Tauri-Bedienevidenz.
- Der erneuerte, unveröffentlichte Windows-x64-Kandidat `r5` nach der
  Frontend-Build-Korrektur liegt unter
  `dist/engineering-rc161-local-20261016-r5/DataSecure-Standalone-3.2.0-rc161-windows-x64.zip`
  (112.010.404 Byte, SHA-256
  `ab4a341fe56545a4eb70e631e4b1d8448a0431161c940b65aab557c0f91f66db`).
  Die Inventarprüfung der 1129 Paketeinträge und der isolierte native
  Windows-Start mit Workspace, Reviewfenster und Core-/IPC-Antwort bestanden;
  1544 eigene Testeinträge wurden anschließend bereinigt. Der vollständige
  isolierte Paket-Smoke dieses exakten r5-Archivs bestand ebenfalls:
  Markdown mit/ohne OCR, OCR-Kontaktkorrektur mit Vertagen/Neustart,
  Anonymisierung aus PNG/JPEG/BMP/Scan-PDF, Freigabe-/Exportpfad und
  Verlauf nach Neustart/Zielordnerwechsel. Er behauptet keine native
  GUI-Bedienung der langen Kopie.

Dies beweist weder die Ursache des früheren M2-Starts noch den gesamten
Abbruch während einer bereits sichtbaren Teilkopie. Der M2-Test läuft mit
seiner vorgesehenen Version unabhängig; keine macOS-Bedienevidenz wird aus
Windows- oder CI-Tests abgeleitet. Keine Originaldaten wurden für diese
Tests verändert oder als synthetisch ausgegeben.

## Weitere lokale Rückmelde- und Diagnosekorrektur (nach `r5`)

Die ausdrückliche Bereitstellungsprüfung liefert nun ein festes, laufgebundenes
Ergebnis (`available`, `pending`, `not_attempted`, `failed`). `available` wird
nur mit erneut geprüftem gebundenem Ergebnisordner behauptet. Passive
Verlaufslesungen haben weder diesen Rückgabewert noch eine Exportwirkung.
Das Frontend prüft die Batch-ID und die Ergebnismenge vor der Meldung und
zeigt bei jedem Zustand eine andere Handlungsanweisung. Aufgeklappte
Verlaufsbelege werden nach einem geänderten Listensnapshot erneut geladen;
ein längerer Export zeigt ausschließlich verstrichene Wartezeit und stoppt
dieses Signal bei Verbindungsabbruch. Neue Mac-Startdiagnosen unterscheiden
fehlenden Core, fehlendes Sidecar-Skript und fehlendes Netzwerk-Sperrmodul
mittels fester pfadfreier Codes. Gleiche OCR-Werte erhalten je Fundstelle
einen zugänglichen Dokument-/Positionsnamen; ein getippter Vorschlag ist
weiterhin keine Entscheidung für die andere Fundstelle.

Gezielte Node-Renderer-/History-Tests, Browser-/Reflow-Prüfungen und der
fokussierte Rust-Test sind bestanden. Die vollständige lokale
`npm run test:standalone`-Suite endete Exit 0 (Rust: 128 bestanden,
3 bewusst ignoriert; sechs native Windows-Bedienfälle `NOT_RUN`).
Das frische unveröffentlichte `r6`-Archiv
`dist/engineering-rc161-local-20261016-r6/DataSecure-Standalone-3.2.0-rc161-windows-x64.zip`
enthält 1129 geprüfte Einträge, 112.011.988 Byte und SHA-256
`7f2cde39b132a772737b029fc621ab81db4317483094b6aff19c67aae9916f57`.
Der isolierte Sidecar-Paket-Smoke bestand mit beiden Markdown-OCR-Varianten,
OCR-Kontaktkorrektur samt Neustart, Anonymisierung aus PNG/JPEG/BMP/Scan-PDF,
Freigabe, Export und Verlauf. Der native Windows-Start desselben Archivhashs
bestätigte Workspace, Reviewfenster und Core-/IPC-Bereitschaft; er traf keine
Dokumententscheidung und bereinigte 1543 eigene isolierte Testeinträge.
Weder `r5` noch das veröffentlichte RC161 enthält diese spätere Runde.
Ein bedienter 115-Dateien-Langexport und der M2-Zielhosttest bleiben offen;
die Tests beweisen keinen solchen Abschluss auf macOS.
