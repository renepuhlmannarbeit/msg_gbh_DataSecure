# Anschließender Funktionsausbau: Konvertierung und breite Formate

Stand: 06.09.2026 · 3.2.0-rc108 · Implementierung mit ausstehender neuer Paket-/UAT-Bindung.
Dies ist der technische Ausführungsplan, keine zweite Arbeitsliste. Status und
Priorität werden ausschließlich im [kanonischen Backlog](../docs/canonical/BACKLOG.md)
geführt: BL-010.15–19/28, BL-022.2/3, BL-023.1–4 und BL-024.2/3.

## Expertenergebnis und Produktentscheidung

Zwei eigenständige Produkte bleiben bestehen. DS-085 bindet zwei gleichwertige
Kernfunktionen im Standalone-Produkt mit den
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

## 1. Implementierter Ablauf: reine Konvertierung

1. Ein zentraler Modusvertrag validiert die beiden Werte und die Produktgrenze.
   `markdown-only` ist aus dem Plugin abzulehnen.
2. Frontend, Rust-Kommandos, private IPC und Application-Service transportieren
   den gewählten Modus. Während eines aktiven oder fortsetzbaren Stapels bestimmt
   das Backend den unveränderlichen Modus, nicht der aktuelle Dropdown-Default.
3. Intake-Envelope, Worker und Journal speichern den Modus vor dem Checkpoint.
   Konvertierungsjournale verwenden `datasecure-batch/5` und eigene Worker-
   Envelope-Typen; alte Leser dürfen sie nicht als Anonymisierung fortsetzen.
   Altjournale bleiben ausdrücklich Anonymisierungsstapel.
4. Ein eigener Konvertierungseinstieg nutzt sichere Snapshots und den bestehenden
   inhaltserhaltenden Parser und den vorhandenen Supervisor, aber niemals
   PII-Ersetzung, Pseudonymseed, Residual-Gate,
   PII-Review oder `complianceHeader`.
5. `markdown-extractor.js` nutzt ausschließlich den Erhaltungspfad: TXT/Markdown
   behalten Unicode und Zeilenenden; CSV behandelt auch doppelte/leere Köpfe als
   Daten, ohne sie umzubenennen. OOXML läuft mit `preserveText: true`.
   Unbekannte Dokumentbereiche bleiben als unvollständig gekennzeichnet.
6. Die vorhandene Stapelsteuerung wird wiederverwendet: Sperren, Identität,
   endgültige/retryable Fehler, Checkpoints und Mapping-Outbox. Dafür erhält sie
   eine enge modusgebundene Verarbeitungsauswahl, keine zweite Batch-Engine.
7. Konvertate erhalten einen eigenen `dm_`-Artefakttyp mit Digest, Modus und
   Extraktionsgrad (`complete` oder `incomplete` mit festen `reason_codes`).
   Keine Privacy-Paketmerkmale und keine Lesecapabilities. Warnende Extraktionen
   werden ohne PII-Review gespeichert, nicht als vollständig ausgegeben.
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

### Implementierte Schnittstellen und verbleibende Nachweise

Nach dem PKG-04-Kandidaten `7b88a81` umgesetzt: Modusvertrag und Desktoptransport,
In-Memory-Extraktion, eigener Markdown-Artefaktvertrag sowie echte negative
Privacy-Lesetests. TXT/MD behalten Unicode und Zeilenenden, CSV seine Original-
Köpfe/-Zeilen, DOCX eng nachgewiesene Text-/Tabellenstrukturen. Komplexe DOCX,
XLSX/PPTX und PDF/OCR bleiben unvollständig bewertet. XLSX verliert nicht mehr
still Spalten ab 101 oder Zeilen ab 10.001; Übergrößen erzeugen einen expliziten
Fehler. PPTX-Textläufe und numerische Notizen werden im Erhaltungspfad bewahrt.

Die anschließende RC108-Integration verwendet den vorhandenen Kern, keinen
zweiten Batchrunner:

| Übergabe | Aktueller Vertrag / gezielter Nachweis |
|---|---|
| `core/processing-mode`, Frontend, Rust, `desktop-ipc`, `application-service` | Genau zwei Modi; Auswahlmodus nur für neuen Start, Fortsetzung aus Backendzustand. Plugin lehnt `markdown-only` ab. Keine Anonymisierungszusage im Konvertierungsmodus. |
| `batch-intake-intent`, `batch-queue-envelope`, `batch-intake`, `batch-worker` | Zweck vor Checkpoint gebunden; explizite Markdown-Envelope-Typen, unbekannte Kombinationen abgewiesen; keine Pseudonymzustände für reine Konvertierung. |
| `batch-journal-store` | Geschlossenes v5-Schema, `artifact_id`/Digest/Bytezahl/Extraktionsgrad/Gründe statt Privacy-Paketfeldern. v1/v2/v4 bleiben Anonymisierung, altes verschlüsseltes v3 bleibt zurückgewiesen. |
| `batch-item-processor`, `batch-reconciliation`, `batch-delivery`, `standalone/markdown-store` | `convertNext` und typgebundener Artefaktresolver statt `anonymizeNext`; eigene Recoveryprüfung vor/nach Publikation, keine Read-Capability für Konvertate. |
| `result-export`, Mapping-Outbox und native Zielresolver | Atomarer `DataSecure-Markdown`-Lauf samt Zuordnung und festen Gründen, separate Zielidentität, beide Outputbäume aus Quellen ausgeschlossen, fehlgeschlagene Folgeausgabe ohne Altziel. |
| `conversion-worker`, `conversion-runtime-resolver`, Paketprojektion | Gebündeltes normales Node statt SEA-Reexec, geprüfte lokale Ressourcen, ein begrenzter isolierter Prozess pro Datei. Echter Paket-/Sidecar-E2E und anschließend neuer PKG-04-/INT-13-Nachweis bleiben separat zu liefern. |

PDF.js verarbeitet ausschließlich lokale Bytes. Ein echter laufender Abbruch
konnte zuvor eine unbeantwortete Promise lassen; Cancel-Wartepunkte, einmalige
Zerstörung und begrenzter Cleanup schließen diesen Engineering-Lifecycle-Defect.
Scan-PDF rastert sequenziell pro Seite und verwendet ausschließlich OCR, nicht
zusätzlich einen vorhandenen Textlayer. OCR verwendet lokale DE/EN-Modelle ohne
PII-Normalisierung und bleibt grundsätzlich als nicht verifiziert gekennzeichnet.
Diese Pilotadapter bleiben Vergleichs- und Engineering-Evidence. Der aktive
Produktworker komponiert PDF/OCR innerhalb eines begrenzten eigenen Prozesses;
PDF-Seiten behalten ihren nativen Text. Textlose Seiten und tatsächlich gemalte
Bildinhalte werden zusätzlich per OCR gelesen: Eine native Seitenzahl darf den
gescannten Haupttext nicht unterdrücken. Bereits im Textlayer vorhandene
OCR-Zeilen werden nicht nochmals angehängt; zusätzliche Bildtexte sind
gekennzeichnet. Reine Textseiten und ungenutzte Bildressourcen starten keine OCR.

Ein zweiter unabhängiger Lifecycle-Gegencheck fand und korrigierte die
Scan-PDF/OCR-Abbruchübergabe: Ein äußeres Cancel-Race durfte nicht antworten,
bevor der gestartete OCR-Prozess sein Ende bestätigt. Die Komposition wartet
jetzt auf dessen begrenzten Abschluss; `OCR_TERMINATION_UNCONFIRMED` bleibt
auch bei aktivem Abbruch erhalten. Reale Start-/Ready-Abbrüche, simuliert
verweigerte und werfende Kill-Aufrufe sowie das anschließende natürliche
Prozessende sind geprüft. Es gibt keinen automatischen stärkeren Kill-Retry.

Der historische Vorintegrationslauf bestand mit 43 Basis-/111 direkten Produktdateien
und 14 Rust-Tests. Das separate Engineering-Gate für PDF, OCR und Scan-PDF
war vollständig grün; die erweiterten Scan-PDF-Fälle liefen zusätzlich mit
gebündeltem Node 22. Diese älteren Nachweise ersetzen weder die anschließenden
Integrationstests noch den neuen commitgebundenen Paketnachweis.

Prüfung: `npm run test:conversion:engineering` verlangt bereits installierte
gepinnten Pilotabhängigkeiten in `native/pdfjs/pilot` und `native/ocr/pilot`
sowie die gehashten lokalen Modelle. Der Test lädt nichts herunter und erzeugt
seine Quellen im Speicher. Ein fehlender Pilot ist kein Produktfehler und darf
nicht durch automatischen Download im Anwenderprogramm ersetzt werden.

### Produktgrenze und aktivierte Fähigkeiten

Verfügbarkeit wird nach **Produkt × Modus × Format × Zielruntime** entschieden.
Daraus werden Picker, Drag-and-drop, Aufnahme, Workerwahl, Größenlimits, UI und
Paketprüfung abgeleitet. Eine erfolgreiche Extraktion im Konvertierungsmodus
aktiviert niemals automatisch die Anonymisierung oder den Cowork-Handoff.
Manifestflags allein schalten keine fehlende Runtime frei.

Aktiv sind elf Eingabetypen im reinen Standalone-Modus: TXT, Markdown, CSV, DOCX,
XLSX, PPTX, PDF, Scan-PDF, PNG, JPEG und BMP. Scan-PDF ist ein PDF-Verarbeitungsfall,
keine eigene Endung. Anonymisierung und Cowork bleiben auf TXT, Markdown, CSV und
DOCX begrenzt. Reine Konvertierung bewahrt Originalinhalte und überträgt nichts
automatisch an KI-Dienste. Die fachlichen Auslassungsgrenzen stehen in der
[Formatmatrix](../docs/FORMAT_COVERAGE_MATRIX.md).

## 3. Wiederverwendung und konkrete Lücken

| Format/Baustein | Implementiert | Offener Umfang / Abnahme |
|---|---|---|
| XLSX | `ooxml.js`, OPC, Shared Strings, Kommentare, Zeichnungen, Inhaltsgraph; Kürzung durch explizites Budget ersetzt, Literalformel plus Cachewert im Erhaltungspfad | Zelltypen, führende Nullen, Datum, leere/ausgeblendete Blätter und vollständige Namespace-/Objekt-Coverage prüfen. Formelcache nicht mit berechnetem/aktuellem Excel-Wert verwechseln. |
| PPTX | Folienreihenfolge, Tabellen, numerische Notizen und verbundene Textläufe regressionsgeprüft; Master/Layout, Diagramme/Bilder teilweise | Objekt-/Namespace-Coverage, realistische Office-Dateien und Reihenfolge; keine still ignorierten Textobjekte. |
| MarkItDown | Optionaler gepinnter 0.1.7-DOCX-Differentialadapter | Kein benötigtes Python-/Wheel-Bundle, keine Voraussetzung für den aktiven Produktweg. Kein `[all]`, Azure oder LLM-Plugin. |
| Text-PDF | Gebündeltes PDF.js 6.2.108, lokale Ressourcen, `stopAtErrors`, bytegebundene Eingabe und isolierter Produktworker; ältere Pilotfälle mit 101 Seiten / laufendem 1.000-Seiten-Abbruch bleiben zusätzliche Evidence | Vollständiger Objekt-/Layoutumfang und Zielhost-UAT. PDF bleibt grundsätzlich `incomplete`. |
| Scan-PDF | Seitenweise Text-oder-OCR-Auswahl im Produktworker, eine lokale OCR-Sitzung pro PDF, Quellenhash und Vermeidung doppelter Inhalte geprüft | Aktueller Paket-/Sidecar-E2E, Windows-/macOS-UAT; OCR bleibt potenziell unvollständig. Keine fixe Seitenanzahlgrenze. |
| Bilder/OCR | PNG/BMP-Decoder und JPEG via gebündeltem Canvas 1.0.7; Tesseract.js 7 mit lokalen hashgeprüften DE/EN-Modellen, kein Modelldownload/Cachewrite. Echter Worker mit Timeout und bestätigtem Prozessende | Aktueller Paket→OCR-Nachweis und Windows-/macOS-UAT. Alle OCR-Ausgaben bleiben `incomplete`; keine automatische Vollständigkeitsfreigabe. |

`sourceLimitForExtension` bindet jetzt auch XLSX/PPTX, PDF und Bilder an eigene
Dateibudgets; das 500-MiB-/100-Dateien-Stapelbudget ist keine Einzeldokumentzusage.
TXT/MD: 8.000.000 Byte, CSV: 1.500.000 Byte, OOXML: 64 MiB, PDF/Bilder: 25 MiB.
Hinzu kommen höchstens 8.000.000 Markdown-Zeichen, 30 Millionen Bildpixel sowie
Speicher-/CPU-/Wandzeitbudgets. Überschreitungen stoppen statt Inhalte still zu
kürzen. Fehlende Runtime, Isolation oder unbestätigtes Prozessende sind feste
Lifecyclefehler, keine erfolgreichen oder freigegebenen Konvertate.

## 4. Offline-Paketierung und Lieferung

Das Plugin schließt den alten Universal-OCR-Engineeringbaum weiterhin aus.
Standalone bündelt ausschließlich seine gesonderte Konverterprojektion unter
`server/standalone/conversion-runtime/`: normales Node.js 22.23.2, PDF.js,
zielgebundenes Canvas, Tesseract.js und lokale Modelle samt Lizenzen. Hashinventar,
SPDX-SBOM, NOTICE und Paketverifizierer binden diese Ressourcen; fehlende native
Zielabhängigkeiten stoppen den Build. MarkItDown/Python bleibt ein optionales
Differentialorakel, nicht benötigter Bundlebestandteil. Keine Downloads beim
Anwender. Linux-Konverterpaketierung ist noch kein unterstützter Zielpfad.

Die etwa 188-MB-Runtime wird je langlebigem Executor einmal vollständig geprüft;
folgende Dateien prüfen Identitäten und hashen geänderte Dateien neu. Der reale
100-TXT-Lauf dauerte lokal 15,264 Sekunden ohne erneutes vollständiges Runtime-
Lesen je Datei. 22 E0-Konvertertestgruppen decken echte Formate, Namenerhaltung,
Inputhashes, Leerbild, fehlerhafte Bytes, private Umgebung, laufenden Abbruch,
Timeout und unbestätigtes Ende ab. Das sind keine Endnutzer-Performancegarantien.

60 frühzeitige Prozessbeendigungen decken einen realen Windows-Lifecycledefect:
Der native Supervisor bindet das Kind jetzt atomar über `JOB_LIST` während
`CreateProcess` an seinen Job. Die frühere Lücke zwischen Erstellen und separater
Jobzuweisung entfällt auch für den gemeinsamen Cowork-Parser. Native Builds sind
reproduzierbar geprüft; 7 Launcher- und 19 Parser-Isolationstests sind grün.

Vor Lieferung: vollständiger aktueller Sidecar-/Paket-E2E mit beiden Modi,
Negativfolgelauf und allen elf Konvertierungstypen; dann sauberer Quellcommit,
zwei bytegleiche PKG-04-Builds, beide Smokes und erst danach neue INT-13-Bindung.
Der alte Kandidat `7b88a81` deckt diese Änderungen nicht ab. Keine endgültige
PKG-04-/UAT-Erfolgsaussage für RC108 in diesem Plan. Windows-E0 ersetzt keine
Intel-/ARM-macOS-Ausführung. Beide Produkte bleiben gepflegt; rohe Konvertate
sind ausschließlich eine Standalone-Funktion.

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
