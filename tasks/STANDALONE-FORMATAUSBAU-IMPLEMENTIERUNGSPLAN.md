# Anschließender Funktionsausbau: Konvertierung und breite Formate

Stand: 06.09.2026 · ausdrücklich beauftragt nach RC107-Korrektur/Paketnachweis.
Dies ist der technische Ausführungsplan, keine zweite Arbeitsliste. Status und
Priorität werden ausschließlich im [kanonischen Backlog](../docs/canonical/BACKLOG.md)
geführt: BL-010.15–19/28, BL-022.2/3, BL-023.1–4 und BL-024.2/3.

## Expertenergebnis und Produktentscheidung

Zwei eigenständige Produkte bleiben bestehen. Standalone erhält zwei gleichwertige
Modi: `markdown-and-anonymize` und `markdown-only`. Beide verwenden dieselbe
Quellenaufnahme, unveränderte Originale, bewusstes Starten, Fortschritt,
Fortsetzung und Zuordnung. Nur Standalone darf bewusst nicht anonymisierte
Konvertate erzeugen. Der MCP-Parameter `mode: local_only` ist kein solcher
Verarbeitungsmodus und wird nicht umgedeutet. Keine Cloud, LLM-Bildbeschreibung,
zusätzliche VM oder vom Anwender installierte Runtime.

Markdown bildet extrahierbaren Text und Struktur ab, nicht beliebige grafische
Inhalte oder das pixelgenaue Originallayout. OCR ist keine Garantie vollständiger
Erkennung. Auslassungen dürfen weder unbemerkt noch als vollständige Verarbeitung
gemeldet werden. Passwortgeschützte Eingaben bleiben unverändert und erscheinen
als zurückgestellte Positionen in der lokalen Abschlussübersicht.

## 1. Vollständiger erster Schnitt: reine Konvertierung direkter Formate

1. Ein zentraler Modusvertrag validiert die beiden Werte und die Produktgrenze.
   `markdown-only` ist aus dem Plugin abzulehnen.
2. Frontend, Rust-Kommandos, private IPC und Application-Service transportieren
   den gewählten Modus. Während eines aktiven oder fortsetzbaren Stapels bestimmt
   das Backend den unveränderlichen Modus, nicht der aktuelle Dropdown-Default.
3. Intake-Envelope, Worker und Journal speichern den Modus vor dem Checkpoint.
   Konvertierungsjournale erhalten einen unterscheidbaren Versionsvertrag:
   heutige Altleser ignorieren sonst unbekannte Top-Level-Felder. Altjournale
   bleiben ausdrücklich Anonymisierungsstapel.
4. Ein eigener Konvertierungseinstieg nutzt sichere Snapshots und den bestehenden
   Parser/Supervisor, aber niemals PII-Ersetzung, Pseudonymseed, Residual-Gate,
   PII-Review oder `complianceHeader`.
5. Der Parser braucht eine inhaltstreue Extraktionsoption: `document-parser.js`
   verwendet derzeit Privacy-Normalisierung; CSV benennt doppelte/leere Köpfe um.
   TXT/Markdown müssen Zeichen und Inhalt erhalten; CSV-Werte, leere Zellen,
   Kopfwerte und Reihenfolge dürfen nicht umgedeutet werden. DOCX-Coverage und
   unbekannte eingebettete Inhalte bleiben gesondert nachzuweisen.
6. Die vorhandene Stapelsteuerung wird wiederverwendet: Sperren, Identität,
   endgültige/retryable Fehler, Checkpoints und Mapping-Outbox. Dafür erhält sie
   eine enge modusgebundene Verarbeitungsauswahl, keine zweite Batch-Engine.
7. Konvertate erhalten einen eigenen Artefakttyp mit Digest, Modus und
   Extraktionsgrad. Keine Privacy-Paketmerkmale und keine Lesecapabilities.
8. Atomarer Export nach `DataSecure-Markdown/Lauf-…`: eine `.md` je erfolgreicher
   Quelle, `DataSecure-Zuordnung.csv`, exakter Öffnen-Resolver. Bereits exportierte
   Ergebnisse bleiben final; Fehlerfolgeläufe bekommen keine Vorgängerzuordnung.
   Beide sichtbaren Outputbäume werden von erneuter Quellenauswahl ausgeschlossen.
9. Öffentliche Paketlisten, Capability-Erteilung, Handoff und alle MCP-Lesegates
   lehnen Konvertate ausdrücklich ab. Die getrennten Datenroots allein ersetzen
   diese Cross-Read-Tests nicht.
10. UI und Diagnose sind modusgebunden: „Markdown-Dateien erstellt“ und dauerhaft
    „Nicht anonymisiert – enthält Originalinhalte“. Keine Bestätigungsserie.
    Logs enthalten Modus, Phase, Mengen, Dauer und feste Codes, niemals Inhalte.

Pflichtnachweise: dieselben vier echten Quellen in beiden Modi; erhaltene Namen,
Firmen, IBAN und Tabellenwerte im Konvertat; entfernte Identifikatoren im anderen
Modus; Neustart mit geändertem UI-Default; Crash/Resume; ungültiger Modus;
Plugin-Cross-Read; unbekannte Coverage; Zielwechsel; Kollisions-/Exportfehler;
keine veränderten Originalhashes; echter ausgelieferter Sidecar ohne Systemruntime.

## 2. Gemeinsamer Fähigkeitenvertrag

Verfügbarkeit wird nach **Produkt × Modus × Format × Zielruntime** entschieden.
Daraus werden Picker, Drag-and-drop, Aufnahme, Workerwahl, Größenlimits, UI und
Paketprüfung abgeleitet. Eine erfolgreiche Extraktion im Konvertierungsmodus
aktiviert niemals automatisch die Anonymisierung oder den Cowork-Handoff.
Manifestflags allein schalten keine fehlende Runtime frei.

## 3. Wiederverwendung und konkrete Lücken

| Format/Baustein | Vorhanden | Vor Aktivierung erforderlich |
|---|---|---|
| XLSX | `ooxml.js`, OPC, Shared Strings, Kommentare, Zeichnungen, Inhaltsgraph | Stille Kürzung bei 100 Spalten/10.000 Zeilen entfernen; Zelltypen, führende Nullen, Datum, Formeln, leere/ausgeblendete Blätter und Coverage prüfen. Formelwerte nicht als vollständige Formelerhaltung ausgeben. |
| PPTX | Folienreihenfolge, Tabellen, Notizen, Master/Layout, Diagramme/Bilder | Objekt-/Namespace-Coverage, realistische Office-Dateien und Reihenfolge; keine still ignorierten Textobjekte. |
| MarkItDown | Gepinnter 0.1.7-DOCX-Differentialadapter | Portable gepinnte CPython-Patchversion, Hash-Wheellock je OS/Architektur, gebündelte Runtime, gerahmter isolierter Worker. Kein `[all]`, Azure oder LLM-Plugin. |
| Text-PDF | PDF.js-Pilot und separater PDFium-Spike | Genau einen Produktbackend wählen; Vorschlag PDF.js für Text und Rendern, PDFium bleibt Vergleich. Pilotoption `stopEventLoop` durch belegtes `stopAtErrors` korrigieren. Formulare, Annotationen, Anhänge, aktive Inhalte, Verschlüsselung und Ressourcen prüfen. |
| Scan-PDF | PDF-Renderer plus OCR-Pilot | Seitenweise lokale Rasterung/OCR, kein fixes Seitenlimit, keine doppelte Textlayer-/OCR-Ausgabe, keine ausgelassene letzte Seite. |
| Bilder/OCR | Tesseract.js 7, WASM, DE/EN-Modelle, portabler Adapter | Plattformgleicher Decoder inkl. JPEG, Pixelbudgets, Paket→OCR-Nachweis. Platzhaltertext ist kein konvertierter Bildinhalt. Session-Wiederverwendung erst nach Fehler-/Abbruch-/Speichertests. |

`sourceLimitForExtension` kennt bislang nur die vier direkten Formate; andere
fallen auf das 500-MiB-Stapelbudget zurück. Vor neuer Aufnahme brauchen sie
passende Dateigrößen-/Arbeits-/Pixelgrenzen und seitenweise Verarbeitung ohne
stille inhaltliche Kürzung. Das ist eine Implementierungslücke, kein Grund,
unverarbeitete Inhalte als erfolgreich auszugeben.

## 4. Offline-Paketierung und Lieferung

Der aktuelle Produktbuild schließt OCR und MarkItDown aus. Das OCR-Inventar
umfasst bereits 243 Dateien/57.594.844 unkomprimierte Byte. Gebündelte Python-
und PDF-Runtimes benötigen gemessene neue Paketbudgets, SBOM, NOTICE und
zielgebundene Hashinventare. Keine Downloads beim Anwender. PDF.js benötigt
lokale Canvas-Binaries sowie Fonts/CMaps/ICC/WASM-Ressourcen; Tesseract lokale
Modelle ohne automatischen Modell-Download.

Lieferreihenfolge: direkte Konvertierung → XLSX/PPTX → Text-PDF → Bilder/OCR und
Scan-PDF. Jede Stufe enthält echte Positiv-/Negativ-/Differential-/Pakettests.
Windows-E0 ersetzt keine Intel-/ARM-macOS-Ausführung. Beide Produkte bleiben
gepflegt; rohe Konvertate sind ausschließlich eine Standalone-Funktion.

## Primärquellen des Gegenchecks

- [MarkItDown](https://github.com/microsoft/markitdown): Offline-Konverter,
  explizite Extras und enges `convert_stream`; das zusätzliche `markitdown-ocr`
  verwendet LLM-Vision und gehört nicht in dieses Produkt.
- [Gepinnte Abhängigkeiten 0.1.7](https://raw.githubusercontent.com/microsoft/markitdown/v0.1.7/packages/markitdown/pyproject.toml)
  und [XLSX-Konverter](https://raw.githubusercontent.com/microsoft/markitdown/v0.1.7/packages/markitdown/src/markitdown/converters/_xlsx_converter.py):
  Typ-/Werttreue unabhängig von pandas-Konvertierung nachweisen.
- [PDF.js-Parameter](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
- [Tesseract.js](https://github.com/naptha/tesseract.js) verarbeitet keine PDF-
  Dateien direkt; [lokale Installation](https://raw.githubusercontent.com/naptha/tesseract.js/master/docs/local-installation.md)
  bindet Runtime und Modelle.
