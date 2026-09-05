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

### Implementierter erster Teilschnitt und exakte Restintegration

Nach dem PKG-04-Kandidaten `7b88a81` umgesetzt: Modusvertrag und Desktoptransport,
In-Memory-Extraktion, eigener Markdown-Artefaktvertrag sowie echte negative
Privacy-Lesetests. TXT/MD behalten Unicode und Zeilenenden, CSV seine Original-
Köpfe/-Zeilen, DOCX eng nachgewiesene Text-/Tabellenstrukturen. Komplexe DOCX,
XLSX/PPTX und PDF/OCR bleiben unvollständig bewertet. XLSX verliert nicht mehr
still Spalten ab 101 oder Zeilen ab 10.001; Übergrößen erzeugen einen expliziten
Fehler. PPTX-Textläufe und numerische Notizen werden im Erhaltungspfad bewahrt.

Die nächste Integration gehört in den vorhandenen Kern, nicht in einen zweiten
Batchrunner:

| Übergabe | Nächster konkreter Eingriff / Nachweis |
|---|---|
| `batch-intake-intent`, `batch-intake`, `batch-worker` | Verarbeitungszweck dauerhaft vor ACK binden; unbekannte Zwecke ablehnen; keine Pseudonymzustände für reine Konvertierung erzeugen. |
| `batch-journal-store` | Vollständiges v5-Schema statt bloßem Zusatzfeld in v4; eigene positive Konvertierungs-Itemgrade/`dm_`-Identität. v1/v2/v4 bleiben Anonymisierung, altes verschlüsseltes v3 bleibt zurückgewiesen. |
| `batch-item-processor`, `batch-reconciliation`, `batch-delivery` | Verarbeitung und Artefaktresolver zweckgebunden wählen; derzeit sind `anonymizeNext`, `ds_`, Privacy-Grade und Capability-Erteilung noch fest eingebunden. Crashfenster vor/nach Artefaktpublikation prüfen. |
| `result-export`, Mapping-Outbox und native Zielresolver | Atomarer `DataSecure-Markdown`-Lauf samt Zuordnung, separate Rootidentität, beide Outputbäume aus Quellen ausschließen, fehlgeschlagene Folgeausgabe ohne Altziel. |
| Frontend, Fähigkeitenmodell und Paket | Aktivierung erst mit kompletter Kette, festen Diagnosecodes und realem Vierformat-/Crash-/Offline-Paketnachweis; keine Übertragung der Engineering-Tests auf den alten PKG-04-Kandidaten. |

PDF.js verarbeitet ausschließlich lokale Bytes. Ein echter laufender Abbruch
konnte zuvor eine unbeantwortete Promise lassen; Cancel-Wartepunkte, einmalige
Zerstörung und begrenzter Cleanup schließen diesen Engineering-Lifecycle-Defect.
Scan-PDF rastert sequenziell pro Seite und verwendet ausschließlich OCR, nicht
zusätzlich einen vorhandenen Textlayer. OCR verwendet lokale DE/EN-Modelle ohne
PII-Normalisierung und bleibt grundsätzlich als nicht verifiziert gekennzeichnet.
Der Prozess-/Runtime-/Paketnachweis der späteren Produktanbindung bleibt offen.

Ein zweiter unabhängiger Lifecycle-Gegencheck fand und korrigierte die
Scan-PDF/OCR-Abbruchübergabe: Ein äußeres Cancel-Race durfte nicht antworten,
bevor der gestartete OCR-Prozess sein Ende bestätigt. Die Komposition wartet
jetzt auf dessen begrenzten Abschluss; `OCR_TERMINATION_UNCONFIRMED` bleibt
auch bei aktivem Abbruch erhalten. Reale Start-/Ready-Abbrüche, simuliert
verweigerte und werfende Kill-Aufrufe sowie das anschließende natürliche
Prozessende sind geprüft. Es gibt keinen automatischen stärkeren Kill-Retry.

Der abschließende Hauptlauf besteht mit 43 Basis-/111 direkten Produktdateien
und 14 Rust-Tests. Das separate Engineering-Gate für PDF, OCR und Scan-PDF
ist vollständig grün; die erweiterten Scan-PDF-Fälle laufen zusätzlich mit
gebündeltem Node 22. Alle Nachweise sind lokal und aktivieren weder die
Produkt-Runtime noch den noch fehlenden reinen Konvertierungsworkflow.

Prüfung: `npm run test:conversion:engineering` verlangt bereits installierte
gepinnten Pilotabhängigkeiten in `native/pdfjs/pilot` und `native/ocr/pilot`
sowie die gehashten lokalen Modelle. Der Test lädt nichts herunter und erzeugt
seine Quellen im Speicher. Ein fehlender Pilot ist kein Produktfehler und darf
nicht durch automatischen Download im Anwenderprogramm ersetzt werden.

### Noch zu verbindender Produktvertrag

Verfügbarkeit wird nach **Produkt × Modus × Format × Zielruntime** entschieden.
Daraus werden Picker, Drag-and-drop, Aufnahme, Workerwahl, Größenlimits, UI und
Paketprüfung abgeleitet. Eine erfolgreiche Extraktion im Konvertierungsmodus
aktiviert niemals automatisch die Anonymisierung oder den Cowork-Handoff.
Manifestflags allein schalten keine fehlende Runtime frei.

## 3. Wiederverwendung und konkrete Lücken

| Format/Baustein | Vorhanden | Vor Aktivierung erforderlich |
|---|---|---|
| XLSX | `ooxml.js`, OPC, Shared Strings, Kommentare, Zeichnungen, Inhaltsgraph; Kürzung durch explizites Budget ersetzt, Literalformel plus Cachewert im Erhaltungspfad | Zelltypen, führende Nullen, Datum, leere/ausgeblendete Blätter und vollständige Namespace-/Objekt-Coverage prüfen. Formelcache nicht mit berechnetem/aktuellem Excel-Wert verwechseln. |
| PPTX | Folienreihenfolge, Tabellen, numerische Notizen und verbundene Textläufe regressionsgeprüft; Master/Layout, Diagramme/Bilder teilweise | Objekt-/Namespace-Coverage, realistische Office-Dateien und Reihenfolge; keine still ignorierten Textobjekte. |
| MarkItDown | Gepinnter 0.1.7-DOCX-Differentialadapter | Portable gepinnte CPython-Patchversion, Hash-Wheellock je OS/Architektur, gebündelte Runtime, gerahmter isolierter Worker. Kein `[all]`, Azure oder LLM-Plugin. |
| Text-PDF | PDF.js-Engineering-Extraktor mit `stopAtErrors`, unveränderten lokalen Bytes, Literaltext, 101-Seiten- und laufendem 1.000-Seiten-Abbruchtest; PDFium bleibt Vergleich | Vollständiger Objekt-/Aktionsumfang, Layout-/Textabdeckung, Prozess-/Ressourcen-Supervisor und Runtimeproduktentscheidung. Bisher grundsätzlich `incomplete`. |
| Scan-PDF | Reale seitenweise PDF.js-Rasterung → lokale OCR, letzte Seite, Sourcehash, Pixelbudget und kein doppelter Textlayer getestet | Produktworker, kohärente Runtime und vollständige Paketkette; OCR bleibt potenziell unvollständig. Keine fixe Seitenanzahlgrenze. |
| Bilder/OCR | Tesseract.js 7, lokale hashgeprüfte DE/EN-Modelle; PNG/BMP→Markdown ohne PII-Normalisierung, eigener begrenzter Prozess, 12 Testgruppen inkl. Cancel/Timeout | JPEG-Decoder, produktiver Supervisor, Paket→OCR-Nachweis auf Windows/macOS. Alle OCR-Ausgaben bleiben `incomplete`; keine automatische Vollständigkeitsfreigabe. |

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
