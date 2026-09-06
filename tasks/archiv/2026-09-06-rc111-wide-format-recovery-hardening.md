# RC111 – breite Format- und Recovery-Härtung

Stand: 06.09.2026 · 3.2.0-rc111

## Auftrag

Vor der menschlichen UAT wurden die verbleibenden automatisierbaren Nachweise
für breite Standalone-Konvertierung und die noch gesperrte breite
Anonymisierung gemeinsam mit unabhängigen Format-, Recovery- und
Paketgegenprüfungen ausgeführt.

## Befunde und Umsetzung

- Der neutrale Extraktionsvertrag vertraute bislang einem korrekt geformten,
  aber nicht an die Dateiendung gebundenen `source_type`. RC111 stoppt jede
  Abweichung mit `FORMAT_COVERAGE_UNVERIFIED`; `.jpg` wird kanonisch als `jpeg`
  gebunden.
- PPTX prüfte nicht jedes XML-/RELS-Teil. Nun werden alle vorhandenen Teile vor
  der Extraktion gegen DTD/Entities und Strukturgrenzen validiert.
- PDF-Annotationen, Outline und XMP konnten außerhalb der sichtbaren
  Textextraktion liegen. Sie stoppen jetzt. Standardisierte Info-Metadaten werden
  für die reine Markdown-Konvertierung sichtbar und längenbegrenzt erhalten.
- Die reale Konvertersuite prüft alle breiten Formate zusätzlich gegen den
  Privacy-Publikationsrand. Da ihre Coverage weiterhin `incomplete` ist, müssen
  sie sicher stoppen und dürfen kein anonymisiertes Ergebnis behaupten.
- Ein echter TXT/XLSX-Mischstapel wird in beiden Reihenfolgen, über Abbruch und
  frischen Prozess hinweg geprüft. Personen und Unternehmen erhalten stapelweit
  stabile Labels, Publikation ist genau einmal, Originale bleiben unverändert.
  Ein gestopptes breites Item verbraucht keine Labels.
- Der native Launcher protokolliert zusätzliche inhaltsfreie Setup-/WebView-
  Checkpoints. Der Smoke unterscheidet dadurch einen WebView-Startup-Timeout von
  einem späteren IPC-Timeout.

## Automatisierte Evidence

- `test-wide-privacy-extraction`: 5/5
- `test-markdown-extractor`: 45/45
- `test:recovery`: einschließlich realem Mischstapel grün
- `test-standalone-desktop-contract`: 14/14
- `test:standalone:rust`: 16/16
- `test:standalone:conversion`: 30 reale Gruppen; 100 TXT sowie 60 frühe
  Windows-Beendigungen enthalten
- vollständige Produktsuite: 61 Basis-/114 direkte Testdateien grün
- `test:docs`, Rust 16/16, Cowork-Build/ZIP und Standalone-Portable-Build samt
  realem Paket-/Worker-/History-Smoke grün
- Arbeitsbaum-Build: Standalone-ZIP 110.216.131 Byte, SHA-256
  `911125e06a2b54ee692f1b3ace040fe9fbcbcdbd232aa20dc9167ac6e15bac40`;
  dieser Hash ist noch keine commitgebundene PKG-04-/INT-13-Evidence.
- PKG-04 wurde aus dem sauberen Commit
  `d45252f971e1f2f8737bf4af22d511c30ca3f430` gestartet. Kandidat A ist
  bytegenau zum Arbeitsbaum-Build, Paket-/Worker-/History-/Sidecar-Smokes sind
  grün. Der native Smoke erreicht `application_started`, `setup_started` und
  `webview_build_started`, aber nicht `webview_build_completed`; Urteil:
  `STANDALONE_NATIVE_WEBVIEW_STARTUP_TIMEOUT`. Kandidat B, Receipt und INT-13-
  Bindung wurden deshalb regelkonform nicht erzeugt. Auf dem Zielhost ist
  WebView2 152.0.4191.66 registriert, während zahlreiche seit Tagen laufende
  WebView2-Prozesse ältere 152.0.4191.53/.62-Binaries verwenden. Ein Windows-
  Neustart und danach derselbe PKG-04-Lauf sind der nächste Zielhostschritt.

## Bewusste Grenze

XLSX, PPTX, PDF/Scan-PDF und Bilder bleiben für die Anonymisierung gesperrt,
bis ihre vollständige Container-/Objekt-/Grafik-/OCR-Coverage belegt ist. Die
reine Markdown-Konvertierung bleibt aktiv und kennzeichnet unvollständige
Extraktion. Native Intel-/ARM-macOS-Abnahme sowie sichtbare Windows-/macOS-UAT
sind menschliche Zielhost-Evidence.

INT-13 darf nur an einen Kandidaten gebunden werden, dessen zwei saubere Builds
bytegleich sind und dessen beide Paket-, Worker- und nativen Smokes bestehen.
Bis dahin bleibt RC109 der letzte gebundene Kandidat.
