# RC109 – Startseite und Verlauf: Umsetzung und Gegenreview

Stand: 06.09.2026 · DS-086 · BL-010.29

## Auftrag und Ergebnis

Nur die Standalone-Bedienung wird neu gegliedert: Start erklärt beide Funktionen,
Verarbeiten bereitet eine ausdrücklich gewählte Aufgabe vor, Verlauf zeigt die
20 neuesten Verarbeitungen. Kein Abschluss, wiederhergestellter Zustand oder
Picker wechselt automatisch auf Ergebnisse oder öffnet einen Ergebnisordner.
Die Betriebsart ist anfangs leer; die Funktionskarten wählen sie ausdrücklich.

Jede Verlaufszeile zeigt Datum, Modus, Zähler und Status sowie Ergebnisordner,
Zuordnung und Fortsetzen. Nicht verfügbare Aktionen sind mit Erklärung deaktiviert.
Die 20-Einträge-Grenze ist ausschließlich eine Anzeigegrenze, keine Löschregel.

## Geprüfte Verbindungen

- Native Oberfläche → vier einzeln berechtigte Tauri-Commands → begrenzte private
  IPC → Application Service. Aktionen tragen ausschließlich die genaue Lauf-ID,
  keine frei eingegebenen Pfade oder geänderte Betriebsart.
- Journal/Export → private dauerhafte Verlaufszusammenfassung → Tabelle. Fehlende
  Altjournale verhindern keine zuverlässig gebundene Ergebnisanzeige; eine
  Fortsetzung verlangt dagegen immer ein aktuelles fortsetzbares Journal.
- Ergebniszielwechsel/Neustart → alte identitätsgebundene Laufziele bleiben erhalten.
  Ein fehlendes oder ausgetauschtes Ziel wird nicht durch das neueste ersetzt.
- Fortsetzung → ursprünglicher Zweck und genau dieser Stapel → aktiver Status →
  terminale Anzeige/ACK. Die Ein-Stapel-Regel und vorbereitete Auswahl werden geprüft.
- Cowork erhält weder Verlauf noch lokale Originalnamen. Gemeinsame Journal- und
  Exporthooks greifen nur für Standalone; die optionale Laufbindung am Status-/
  ACK-Vertrag lässt bestehende Plugin-Aufrufe unverändert.

## Fachrollen und korrigierte Gegenreview-Befunde

Unabhängige Teilprüfungen: Frontend/UX, Backend/Persistenz und Integrationsreview.
Der Hauptreview prüfte zusätzlich Rust-/IPC-Grenzen, echte Paketläufe und Kanon.

1. Bei der Fortsetzung eines älteren Laufs zeigte der Status zunächst Zähler und
   Modus des neuesten. Korrigiert: aktive bzw. ausdrücklich beobachtete Lauf-ID
   bleibt bis zum Abschluss gebunden, einschließlich Ergebnisziel und Terminal-ACK.
2. Nach erneutem Abbruch konnte der allgemeine Fortsetzen-Aufruf einen anderen
   neueren Lauf wählen. Korrigiert: Backend delegiert eine bereits beobachtete ID
   exakt; der sichtbare allgemeine Knopf führt nur zum Verlauf und startet nichts.
3. Öffnungsrückmeldungen wären unter einer langen Tabelle leicht übersehen worden.
   Sie erscheinen zusätzlich direkt an der betätigten Zeile als Statusmeldung.
4. Browserprüfung fand zu niedrigen Kontrast im Hilfetext; korrigiert. Tests für
   Pfeiltasten/Home/End, manuelle Tabaktivierung und unveränderten Fokus ergänzt.
5. Das Produktmanifest enthielt noch einen voreingestellten Modus. Auf `null`
   angeglichen und mit Dokumentations-/Frontendvertrag gegen Drift abgesichert.
6. Version-Synchronisierung benannte historische RC108-Pakete fälschlich RC109.
   Historische Commitbindung wiederhergestellt und mit einem Guard abgesichert.

## Testevidence

- `test:standalone`: Bootstrap, Service (41), History, Frontend (24), echte
  Sidecar-/Worker-Lifecyclefälle, Desktopvertrag (14), Paketvertrag,
  Konverter-/Diagnosevertrag und Rust (16) bestanden. Nach den letzten Änderungen
  Service, History, Frontend und Desktopvertrag erneut bestanden.
- `test:executor-lifecycle`, `test:recovery`, `test:journal`, explizite
  Batch-Continuation und `test:source-preflight` bestanden.
- Reale History-Fixtures: mehr als 20 Journale, unterschiedliche Zwecke, gestoppte
  und abgeschlossene Läufe, alte Exporte, Retention, Zielwechsel, fehlende/ersetzte
  Ziele, Prozessneustart, vorbereitete Auswahl und gezielte ältere Fortsetzung.
  Zweiter Fortsetzungsversuch mit zwei recoverables als Regression ergänzt.
- Edge/axe mit realem HTML/CSS/JS: Start, 20 Tabellenzeilen, exakte Buttonbindung,
  Desktop und 390-Pixel-Fenster bestanden. IPC dort ausdrücklich synthetisch;
  das ist keine native Explorer-/Finder-Evidence.
- Das neu gebaute Windows-ZIP besteht den echten isolierten Sidecar-/Workerlauf:
  vier anonymisierte Formate, separater Fehlerlauf, elf Markdown-Ergebnisse plus
  eine fehlerhafte CSV. Exakte Verlaufsziele aller drei Läufe bleiben nach Zielwechsel
  und frischem Sidecar korrekt. Keine Originalnamen/-pfade/-inhalte in Diagnoselogs.
- Dokumentations-, Link-, UAT- und Testpfadgates bestanden. Keine vollständige
  erneute Produktsuite oder native macOS-Abnahme in diesem Änderungslauf behauptet.
- Nativer Windows-Start außerhalb der Tool-Sandbox bestanden: `page_loaded`,
  `frontend_ready`, beide Status-/Kontextantworten, Sidecar-Start und Service-
  Initialisierung bestätigt. Im eingeschränkten Testprozess blieben zuvor zwei
  Versuche schon vor `page_loaded` stehen; nicht als Produktpass gezählt.
  Der Test gibt bei Timeout nun die fehlenden Checkpoints und begrenzte feste
  Ereignisfelder aus. Eigene Testprofile wurden nach Prozessende bereinigt.

## Kandidat und Grenzen

Engineering-ZIP: `dist/DataSecure-Standalone-3.2.0-rc109-windows-x64.zip`

- Größe: 110.186.675 Byte
- SHA-256: `d69ababeb2a579e3cb972202cfc51298fbfeaf360cee3cd6881d41e2ad3f71ad`
- Aus dem lokalen Arbeitsstand gebaut, nicht als sauberer Commit-PKG-04 gebunden.
  Kein Commit, Push, Cloud-Lauf oder GitHub-Action durch diesen Auftrag.
- RC108-Receipt und INT-13 bleiben unverändert. Neue commitgebundene
  Reproduzierbarkeits-/Releasebindung ist nicht aus den RC108-Nachweisen ableitbar.
- Menschlicher UI-/Explorer-/Finder-UAT: insbesondere S20–S23 in
  [Standalone-Testkit](../docs/acceptance/STANDALONE_UAT_TEST_KIT/README.md).
  Native Mac-Pakete und macOS Intel/ARM bleiben gesonderte Zielhostarbeit.

## UX-Grundlagen

- [GOV.UK: Tabellen](https://design-system.service.gov.uk/components/table/):
  vergleichbare Läufe in beschrifteten Tabellen mit korrekten Überschriften.
- [W3C: Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):
  manuelle Tabaktivierung und definierte Tastaturnavigation.
- [NN/g: User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom/):
  bewusst gewählte Navigation, kein unaufgeforderter Kontextwechsel.
