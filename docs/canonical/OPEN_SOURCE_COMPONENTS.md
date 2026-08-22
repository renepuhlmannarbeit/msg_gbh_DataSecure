# Open-Source-Wiederverwendungsregister

Stand: 22.08.2026 · Entscheidung: DS-038

Dieses Register ist ein Auswahlfilter, keine automatische Freigabe. `Pilot` bedeutet,
dass eine Komponente praktisch gegen synthetische Positiv-, Negativ-, Offline- und
Pakettests geprüft wird. `Benchmark` bedeutet Testorakel oder Vergleich, nicht
Produktabhängigkeit. `Beibehalten` bedeutet, dass die vorhandene DataSecure-Lösung
derzeit weniger Risiko oder bessere Coverage besitzt. Eine Produktübernahme benötigt
einen exakten Versions-/Integritäts-Lock, Lizenz-/NOTICE-/SBOM-Nachweis und die
Abnahme auf Windows, macOS und Linux.

## Gemeinsames Aufnahmegate

1. Gepflegte Primärquelle und nachvollziehbare Release-Herkunft.
2. Verteilbare Lizenz einschließlich transitiver und nativer Bestandteile.
3. Vollständig lokale Byte-Eingabe; kein URL-, CDN-, Telemetrie- oder Modell-Download.
4. Paketierbar für ZIP und Marketplace ohne manuelle Node-/Python-/Systeminstallation.
5. Feste Ressourcen-, Rekursions-, Zeit- und Ausgabegrenzen sowie isolierbarer Worker.
6. DataSecure-Coverage- und Angriffsfixtures bestehen; unbekannte Inhalte stoppen.
7. Keine Rohdaten, Pfade, Namen oder Mappingwerte in Logs, Fehlern oder Diagnose.

## Kandidaten nach Backlog-Epic

| Epic | Entscheidung | Kandidaten und Einsatz | Derzeitige Bewertung |
|---|---|---|---|
| BL-001 | Beibehalten | Kanonische Markdown-/JSON-Verträge und eigene Driftprüfung | Kleine sicherheitskritische Logik; externe Planungstools wären keine Runtime-Hilfe. |
| BL-002 | Pilot | Ajv (MIT) für maschinenlesbare Manifest-/Vertragsschemas | Ergänzung möglich; bestehende semantische Drift-Tests bleiben nötig. |
| BL-010 | Pilot | esbuild (MIT) für reproduzierbare JS-Bundles; native Artefakte separat | Kann Abhängigkeiten in ein Plugin bündeln, ersetzt keine Drei-OS-Abnahme. |
| BL-011 | Beibehalten | write-file-atomic/proper-lockfile nur als Differentialvergleich | Bestehende Journal-, Claim- und Recovery-Semantik ist produktspezifisch und bereits getestet. |
| BL-012 | Benchmark | Playwright (Apache-2.0) für UI-Flows; axe-core (MPL-2.0) für Barrierefreiheit | Testwerkzeuge, keine zusätzliche Anwender-Runtime. |
| BL-020 | Benchmark | fflate (MIT) als ZIP-/Dekompressionsorakel | Eigene gehärtete Limits und Content-Graph-Locators bleiben erforderlich. |
| BL-021 | Pilot | markdown-it (MIT), Papa Parse (MIT) | Gegen vorhandene MD-/CSV-Parser testen; nur bei besserer Coverage übernehmen. |
| BL-022 | Pilot | Mammoth (BSD-2-Clause) für DOCX-Differentialtests; SheetJS Community Edition (Apache-2.0) für XLSX | DOCX/XLSX ergänzen, aber unbekannte OOXML-Parts und PPTX weiter fail-closed behandeln. |
| BL-023 | Pilot | Mozilla `pdfjs-dist` 6.2.108 (Apache-2.0) plus `@napi-rs/canvas` 1.0.7 (MIT); PDFium bleibt Fallback | Lockfile und Vier-Plattform-Lauf `32594467568` für Byte-Input, Text, Rendering, Action-Erkennung und null Netzwerkversuche bestanden. Coverage-, Isolations- und Produktpaketgates bleiben offen. |
| BL-024 | Pilot | Tesseract.js 7.0.0 und tesseract.js-core 7.0.0 (Apache-2.0) mit `@napi-rs/canvas` 1.0.7 (MIT), offiziellen `tessdata_fast`-4.1.0-Modellen `deu`/`eng` und dem offiziellen `npm sbom` | Abhängigkeiten, tatsächlicher Modell-Commit, Größen und SHA-256 sind gelockt. Lauf `32595199861` bestand OCR, Prozess-Netzwerksperre und CycloneDX-1.5-Lieferkettenprüfung auf Windows x64, macOS x64/ARM64 und Linux x64. Notice-, Paket-, Isolations- und Coverage-Gates bleiben offen. |
| BL-030 | Benchmark | Microsoft Presidio (MIT) als synthetisches Erkennungsorakel | Python-/Modellruntime und deutsche Fachdomäne sprechen vorerst gegen Produktintegration. |
| BL-031 | Beibehalten | Offizielle Herstellerkataloge und bestehende Kontextregeln | Externe NER entscheidet nicht allein über Zertifikats-/Organisationskontext. |
| BL-032 | Beibehalten | Betriebssystemeigene Secret-/Dialogfunktionen, keine Cloud-Komponente | Passwort und Entscheidungen müssen lokal, RAM-only und UI-gebunden bleiben. |
| BL-040 | Pilot | Ajv (MIT) für Nachweisschema; csv-stringify (MIT) für robustes CSV | Mapping bleibt technisch außerhalb aller MCP-Lesewerkzeuge. |
| BL-041 | Beibehalten | Claude-Plugin-/Skill-Verträge und MCP-SDK nur aus dem geprüften Release | Ablauf und Datenschutzgrenze sind produktspezifisch; zusätzliche Agent-Frameworks erhöhen Komplexität. |
| BL-042 | Pilot | Ajv (MIT) für Diagnoseformat; pino (MIT) höchstens für strukturierte interne Events | Whitelist und Inhaltsfreiheit bleiben eigene Sicherheitslogik. |
| BL-050 | Pilot | fast-check (MIT) für Property-/Fuzz-Generierung; bestehende Corpus-Runner bleiben | Erweitert synthetische Variation, ersetzt keine markierten 1.000 Dokumente. |
| BL-051 | Pilot | esbuild (MIT), CycloneDX-Generatoren und GitHub Actions | Supply-Chain-Pins, Paketparität, frische Installation und Rückrolle bleiben eigene Gates. |
| BL-052 | Pilot | Playwright (Apache-2.0) und axe-core (MPL-2.0) für technische UI-Abnahme | Menschliche Nutzungs-, Fach- und Datenschutzabnahme bleibt unverzichtbar. |

## Vorläufige Ausschlüsse

- Poppler, Ghostscript und MuPDF werden wegen Copyleft-/kommerzieller
  Lizenzfolgen nicht in das normale Plugin aufgenommen.
- Unoffizielle PDFium-Fremdbinaries bleiben Engineering-Evidenz, nicht
  Produktabhängigkeit.
- LibreOffice-/Office-Automation ist wegen großer externer Installation,
  Versionsdrift und aktiver Dokumentfunktionen kein Normalweg.
- Cloud-OCR, externe Konverter und CDN-Nachladen widersprechen DS-018.

## Primärquellen der ersten Piloten

- PDF.js: https://github.com/mozilla/pdf.js
- Tesseract.js: https://github.com/naptha/tesseract.js
- Canvas: https://github.com/Brooooooklyn/canvas
- Mammoth: https://github.com/mwilliamson/mammoth.js
- SheetJS: https://github.com/SheetJS/sheetjs
- Microsoft Presidio: https://github.com/microsoft/presidio
- fflate: https://github.com/101arrowz/fflate
- fast-check: https://github.com/dubzzz/fast-check
- Ajv: https://github.com/ajv-validator/ajv
