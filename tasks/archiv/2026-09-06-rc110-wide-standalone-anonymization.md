# RC110 – Breite Standalone-Anonymisierung

Stand: 06.09.2026 · Produktversion 3.2.0-rc110 · Implementierung E0 abgeschlossen,
Zielhost-UAT und vollständige breite Format-Coverage offen.

Diese Abschlussnotiz dokumentiert die Umsetzung von DS-087 / BL-010.30. Der
kanonische Status bleibt ausschließlich in `docs/canonical/BACKLOG.md` und
`docs/canonical/BACKLOG_EVIDENCE_MATRIX.md`.

## Entscheidung und Produktgrenze

Standalone darf XLSX, PPTX, PDF/Scan-PDF, PNG/JPEG/BMP genau einmal mit dem
bereits ausgelieferten Offline-Konverter in eine neutrale Markdown-Extraktion
überführen und diese anschließend durch den vorhandenen Privacy-Core leiten.
Es entsteht kein sichtbares oder dauerhaftes rohes `dm_`-Zwischenartefakt.
Direkte und konvertierte Quellen verwenden dieselbe stapelweite Personen- und
Unternehmensregistry. Das Claude-Cowork-Plugin bleibt unverändert auf
TXT/Markdown/CSV/DOCX begrenzt.

Die beiden Vertrauensfragen bleiben getrennt:

- Der Privacy-Core prüft und de-identifiziert genau den extrahierten Text.
- Der Coverage-Vertrag bewertet, ob die Quelle vollständig genug extrahiert
  wurde. Nur `complete` darf veröffentlicht werden. Aktuelle reale breite
  Konverter melden weiterhin `incomplete`; deshalb werden diese Quellen heute
  einzeln gestoppt und nicht fälschlich als vollständig anonymisiert ausgegeben.

## Umsetzung

- Neutraler, zweckfreier Vertrag `datasecure-source-extraction/1` mit exakten
  Schlüsseln, Quelltypen, Coverage-Gründen, Unicode- und Größenprüfung.
- Standalone-only-Adapter zwischen Konvertierungsworker und Privacy-Core.
- Format-Admission für breite Quellen ausschließlich bei
  `product_channel=standalone` und `markdown-and-anonymize`.
- Weitergabe des dauerhaften Produktkanals durch den Batch-Item-Prozessor.
- Kein Konverteraufruf im Cowork-/Plugin-Kanal.
- Ein unbestätigtes Konverterende stoppt vor dem Start weiterer Items auch im
  v4-Anonymisierungsstapel. Timeout, Startfehler und fehlende Isolation bleiben
  ausdrücklich wiederaufnehmbar.
- Produktprojektion enthält nur die kleine Adapterdatei; Kindworker, OCR-Baum,
  Desktop-Service und reine Konvertierungsartefakte bleiben aus dem Cowork-ZIP
  ausgeschlossen.
- UI, Manifest, Architektur, UML, Produktvision, Formatmatrix, Traceability und
  Backlog nennen die Einschränkung ausdrücklich.

## Maschinelle Nachweise

- Vollständige Produktsuite: `60 base + 114 direct test files`, grün.
- Reale gebündelte Konvertierungsruntime: 28 Gruppen, grün; elf Eingabetypen,
  PDF/OCR, Abbruch, Timeout, verweigertes Ende und 100-Dateien-Serie.
- Standalone-JavaScript, Rust/Tauri (16 Tests), Dokumentkanon und
  Produktisolation: grün.
- Cowork-ZIP RC110 gebaut und verifiziert:
  `DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc110.zip`,
  SHA-256 `a66691e70dbde22f1786e9c33ea9b9bdaaf792431788fb3d2c0b5dcb9239de9b`.
- Standalone-ZIP RC110 gebaut und isoliert gesmokt:
  `DataSecure-Standalone-3.2.0-rc110-windows-x64.zip`,
  SHA-256 `d5217676dc072ba1cbe023d26d9e78b513488847192f6939fbeeffc4901d6c34`.

Die beiden ZIPs wurden aus dem geprüften Arbeitsbaum vor dessen Commit gebaut.
Sie sind Engineering-Nachweise, noch keine commitgebundene PKG-04-/INT-13-
Release-Evidence.

## Bewusst offen

- Vollständige, formatbezogene Coverage-Beweise für XLSX/PPTX/PDF/OCR/Bilder.
- Reale positive breite Anonymisierung erst nach dieser Coverage-Freigabe.
- Native Windows-UAT des neuen Modus sowie Intel-/ARM-macOS-Build und UAT.
- Ein späterer Cowork-Ausbau benötigt eine eigenständige Produkt-, Paket- und
  Hostentscheidung; er wird aus dieser Standalone-Umsetzung nicht abgeleitet.
