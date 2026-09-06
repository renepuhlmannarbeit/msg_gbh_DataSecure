# RC108: einfache lokale Markdown-Konvertierung

Stand: 06.09.2026. Aktueller Implementierungs- und Prüfbericht; die endgültige
Paketbindung wird erst nach erfolgreichem Zweifachbau ergänzt.

## Gelieferter Ablauf

1. Standalone öffnen. **Nur in Markdown umwandeln** ist vorausgewählt.
2. Dateien/Ordner auswählen oder in die Anwendung ziehen.
3. Auswahl und Ergebnisziel sehen, bei Bedarf Ziel ändern, **Starten** drücken.
4. Nach Abschluss **Ergebnisse öffnen**. Der konkrete Lauf unter
   `DataSecure-Markdown/Lauf-…` enthält die `.md`-Ergebnisse und
   `DataSecure-Zuordnung.csv` mit Quellen, Ergebnissen, Fehlern und Hinweisen.

Kein Claude, KI-Agent, eigener Server, PII-Review oder Laufzeit-Download ist
erforderlich. Die gebündelte lokale Konvertierung unterstützt TXT, Markdown,
CSV, DOCX, XLSX, PPTX, PDF, Scan-PDF sowie PNG/JPEG/BMP. Text aus Bildern wird
mit lokaler Deutsch-/Englisch-OCR extrahiert. Namen bleiben erhalten; reine
Konvertierung ist ausdrücklich **keine Anonymisierung**. Originaldateien
werden nicht verändert oder gelöscht. OCR und komplexe Layouts haben erkennbare
Extraktionsgrenzen; Warnungen werden ausgegeben, nicht als Vollständigkeit verkauft.

## Unabhängige fachliche und technische Gegenchecks

- **Produkt/Bedienung:** nur Auswahl und expliziter Start; Modus während aktiver
  oder fortsetzbarer Arbeit unveränderlich. Reine Konvertierung verlangt keine
  personenbezogene Fachprüfung. Öffnen-Aktionen bleiben an den konkreten Lauf
  und dessen Zuordnungsdatei gebunden.
- **Ablauf/Recovery:** v5-Journale tragen den Zweck dauerhaft. Snapshot,
  Workerübergabe, Publikation, Wiederaufnahme und Export verwenden denselben
  Vertrag. Veröffentlichte Arbeitsartefakte werden nach einem Journalabbruch
  übernommen; ein einziger Fortsetzen-Schritt liefert sie aus. Ein verwaister
  Verarbeitungsmarker ist kein Beleg für einen lebenden Prozess.
- **Konvertierung/Inhalt:** separate Worker ohne Netzwerk, gebündelte PDF-/OCR-
  Komponenten und keine ungeschützte Markdown-Zwischendatei im Cowork-Bereich.
  Hybride PDF-Seiten mit nativer Seitenzahl und gescanntem Haupttext werden
  zusätzlich OCR-gelesen; erkannte Dubletten zur Textebene werden vermieden.
- **Prozessgrenze:** Windows-Worker gehören bereits beim Prozessstart zum Job
  Object. Nicht bestätigte Beendigung hält den übrigen Stapel an und bleibt
  ausdrücklich als Fehler sichtbar; sie wird nicht als sicherer Abschluss
  dargestellt.
- **Produkte/Pakete:** Standalone führt beide Betriebsarten. Cowork bleibt bei
  der vierformatigen Anonymisierung; seine Paketprojektion enthält benötigte
  gemeinsame Module, nicht die große Standalone-Konverterruntime.
- **Dateisystem:** Ein im vollständigen Testlauf reproduzierter NTFS-Defect
  wurde behoben: große Dateikennungen werden in der Bereinigung als `BigInt`
  gelesen. Unterschiedliche Dateien dürfen weder durch Zahlenrundung als
  Hardlinks gelten noch bei einem Objektwechsel gleich erscheinen.
- **Rückmeldung/Diagnose:** Der Abschluss verweist nur bei bestätigter
  Verfügbarkeit auf die Zuordnungsdatei. Die zusätzliche, ausdrücklich
  aktivierte Supportspur protokolliert Start, Coverageprüfung, Erfolg und Stopp
  der echten Konvertierung. Ihr Aktivierungssignal wird exakt als `1` über
  Desktop, Sidecar und Stapelworker weitergegeben; normale Interaktionslogs
  bleiben davon unabhängig. Freie Fehlertexte und Dokumentinhalte werden nicht
  übernommen; ein Diagnosefehler verändert keine Verarbeitung.

## Nachweise und deren Grenzen

Abschließender Quellstand: `test:product` besteht als vollständiges Profil mit
48 Basis- und 111 direkten Testdateien, einschließlich der 2.000 Eingabevarianten
und echter 100-Dateien-/Crash-/Fortsetzungstests. Rust 15/15, Frontend 18/18,
Dokumentationsgates und kompletter Cowork-Build sind grün. Der RC108-Probe-ZIP
besteht die echte gemischte Konvertierung mit elf Ergebnissen und einer defekten
CSV, beide Betriebsarten, exakte Laufzuordnung und die optionale Supportspur.
Die definitive PKG-04-Bindung folgt aus dem anschließend sauberen Quellcommit.

| Ebene | Prüfung | Was sie nicht belegt |
| --- | --- | --- |
| Oberfläche und Rust-Vertrag | Frontend-Zustandswechsel, Modussperre, private IPC, native Befehlsparameter | Sichtbare Bedienung durch einen Menschen |
| Echter Konverter | Reale Office/PDF/OCR-Eingaben, hybride PDF, Negativ- und Abbruchfälle, 100-Dateien-Serie | Beliebige Layouts und fehlerfreie OCR |
| Wiederaufnahme | Persistierte v4/v5-Zustände, Publikationsabbruch, Fortsetzen bis echtem Export | Jeder mögliche Betriebssystemabsturz |
| Vollständige Produktsuite | Bestehende Cowork-/Anonymisierungsregressionen plus neue Konvertierungsverträge | Native OCR-Runtime auf Ubuntu-CI |
| Paket-Smoke | Tatsächlich verpackter Sidecar/Worker, 11 Konvertierungsergebnisse plus fehlerhafte CSV, beide Betriebsarten, konkrete Zuordnung | Native macOS-Ausführung |
| PKG-04 / INT-13 | Zwei saubere Builds aus demselben Commit, identische ZIP/Desktop/Core-Hashes, beide nativen Windows-Starts | Reproduzierbarkeit auf anderen Toolchains oder Mac-UAT |

Der echte Konvertertest ist ein eigenes verpflichtendes PKG-04-Gate
(`test:standalone:conversion`), kein durch fehlende Binärressourcen ausgelassener
CI-Test. Die normale Produktsuite bleibt plattformneutral und kostenbewusst.
Der alte Review-Worker-Test wurde an den realen Modusvertrag angepasst und
zutreffend als Orchestrierungsvertrag statt als End-to-End-Test bezeichnet.

## Verbleibende menschliche Abnahme

- Windows: tatsächliche Dateiauswahl, Drag-and-drop, Start, Ergebnisordner und
  Zuordnungsdatei öffnen; eigenes Dokument mit dem Ergebnis vergleichen.
- macOS Intel und Apple Silicon: echte native Pakete, Start, Dateidialoge,
  OCR, Fortsetzung und Finder-Aktionen nachweisen. Windows ist kein Ersatz.
- Fachlich: kritische OCR-Ergebnisse prüfen; die Anwendung garantiert keine
  verlustfreie Abbildung aller visuellen Dokumenteigenschaften in Markdown.

Kanonische Planung bleibt in [BACKLOG](../../docs/canonical/BACKLOG.md),
[DS-085](../../docs/canonical/DECISIONS.md) und
[Implementierungsplan](../STANDALONE-FORMATAUSBAU-IMPLEMENTIERUNGSPLAN.md).
Dieser Bericht ist kein zweites Backlog.
