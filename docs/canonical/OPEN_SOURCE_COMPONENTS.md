# Open-Source-Wiederverwendungsregister

Stand: 23.08.2026 · Entscheidung: DS-038

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
| BL-010 | Pilot | esbuild (MIT) für reproduzierbare JS-Bundles; offizielle Node Single Executable Applications (SEA) beziehungsweise gebündelte Node-Runtime als selbststartender per-OS-Serverkandidat; native Artefakte separat | esbuild kann Abhängigkeiten bündeln, löst aber keine Hostruntime. Der Plugin-ZIP darf die dokumentierte MCPB-Node-Garantie nicht übernehmen. Erst ein Fresh-Install-Test ohne System-Node entscheidet, ob der Host genügt; bei FAIL wird SEA/gebündelte Runtime als hashgebundenes internes OS-Artefakt geprüft. Kein manueller Runtime- oder stiller MCPB-Fallback. |
| BL-011 | Beibehalten + Wiederverwenden | write-file-atomic/proper-lockfile nur als Differentialvergleich; vorhandener POSIX-C-Supervisor aus BL-024 für harte Parsergrenzen | Journal-, Claim-, Recovery- und Root-Pinning-Semantik ist produktspezifisch. Für macOS/Linux-Ressourcen wird der bereits auf CPU/RAM/Wallclock/Prozessgruppe geprüfte lokale Supervisor erweitert, statt Shell-`ulimit`, Docker, cgroup- oder Adminvoraussetzungen einzuführen. Ein kleiner Win32-Reparse-Attributhelper bleibt für echte Junction-Erkennung erforderlich. |
| BL-012 | Benchmark | Playwright (Apache-2.0) für UI-Flows; axe-core (MPL-2.0) für Barrierefreiheit | Testwerkzeuge, keine zusätzliche Anwender-Runtime. |
| BL-020 | Referenz + OS-Piloten | W3C Web Annotation `TextPositionSelector`/`FragmentSelector`; JSON Schema Draft 2020-12; Microsoft OPC/OOXML Core Properties; Node.js Permission Model und `--require`; fflate (MIT) als ZIP-/Dekompressionsorakel; Windows AppContainer/SandboxSecurityTools, Linux Bubblewrap (MIT), Apple App Sandbox; Microsoft MXC (MIT) nur beobachten | V1 übernimmt die offizielle halb offene Positions- und Fragmentsemantik, ein maschinenlesbares striktes Schema sowie die standardisierten `docProps`-Paketorte ohne JSON-LD- oder zusätzliche XML-/Office-Runtime. Reihenfolge, lückenlose Nicht-Leerraum-Abdeckung, gehärtete Limits, Asset-Bindung und Laufzeitvalidierung bleiben produktspezifisch. Weil unterstützte Node-22/24-Versionen keine einheitliche Netzwerkerlaubnis besitzen, ergänzt ein früh geladener eigener Netzwerk-Guard das Berechtigungsmodell. AppContainer ist Kandidat für den rohen Windows-Reviewprozess; `CreateProcessInSandbox`/MXC sind noch experimentell. Apple App Sandbox verlangt ein signiertes App-Bundle und passt nicht zum unsigned ZIP-Normalweg. Bubblewrap benötigt einen Linux-Pilot und darf nicht als vorinstalliert gelten; Firejail wird wegen Installations-/SUID-Abhängigkeit abgelehnt. Apache Tika wurde wegen Java-/Server-Laufzeit und unnötiger Plugin-Komplexität nicht eingebettet. |
| BL-021 | Referenz + Pilot | Node/WHATWG `TextDecoder`; markdown-it (MIT) als Markdown-Differentialreferenz; Papa Parse 5.5.3 (MIT) als CSV-Testorakel | Der Produktparser verwendet bereits den eingebauten fatalen UTF-8-Decoder und erhält Markdown literal, weil Rendering/Tokenisierung keinen Sicherheitsgewinn bringt und den fachlichen Quelltext verändern kann. Acht Vertragsfälle decken die erste MD-Scheibe ab; End-to-End-/Drei-OS-Gates bleiben offen. Papa Parse ist fest gelockt und vergleicht 180 eindeutige Dialekt-/Quote-Fälle, bleibt aber explizit außerhalb von Runtime und Pluginpaket. |
| BL-022 | Pilot | Mammoth 1.12.1 (BSD-2-Clause) als exakt gelocktes, reines DOCX-Testorakel; SheetJS Community Edition (Apache-2.0) für XLSX | DOCX/XLSX ergänzen, aber unbekannte OOXML-Parts und PPTX weiter fail-closed behandeln. Mammoth bleibt wegen eigener Warnungen zu externem Dateizugriff und pathologischer Ressourcenlast ein Orakel, nicht die Sicherheitsgrenze; unterstützte eingebettete OOXML-Pakete nutzen rekursiv den bereits isolierten DataSecure-Parser. |
| BL-023 | Pilot | Mozilla `pdfjs-dist` 6.2.108 (Apache-2.0) plus `@napi-rs/canvas` 1.0.7 (MIT); PDFium bleibt Fallback | Lockfile und Vier-Plattform-Lauf `32594467568` für Byte-Input, Text, Rendering, Action-Erkennung und null Netzwerkversuche bestanden. Coverage-, Isolations- und Produktpaketgates bleiben offen. |
| BL-024 | Eingebettet, gesperrt | Tesseract.js 7.0.0 und tesseract.js-core 7.0.0 (Apache-2.0), offizielle `tessdata_fast`-4.1.0-Modelle `deu`/`eng`; `@napi-rs/canvas` 1.0.7 (MIT) nur als Testwerkzeug | Abhängigkeiten, Modellquellen und Lieferkette sind gelockt. Läufe `32595454727`, `32596087930` und `32596426359` belegen auf Windows x64, macOS x64/ARM64 und Linux x64 getrennten Prozess, Netzwerkverbot, OCR-V1 sowie RAM-/CPU-/Zeit-/Ausgabegrenzen. Für POSIX reichen Betriebssystem-APIs (`setrlimit`, `/proc`, `proc_pid_rusage`). Lauf `32597030060` auf `7427b3c` belegt pro Zielarchitektur das installationsfreie Bundle aus 13 Runtime-Komponenten ohne Canvas, lokalen Modellen, Dateihashes, Notices und echtem Offline-OCR. Nur `tr46@0.0.3` benötigt einen exakt versionsgebundenen vollständigen MIT-Fallback; unbekannte fehlende Lizenztexte stoppen den Build. Produktadapter und deduplizierender Universal-V2-Assembler sind integriert; Lauf `32597783210` belegt vollständigen Re-Download, Assembly und realen Offline-OCR. Dieses exakte Universal-Bundle ist mit Provenienz im kanonischen ZIP-/Marketplace-Quellbaum eingebettet, bleibt aber mit `release_enabled: false` geschlossen. BL-024.1 ist erledigt; frische Installations- und Coverage-Gates von BL-024.2 ff. bleiben offen. |
| BL-030 | Benchmark + Pilot | Microsoft Presidio (MIT) als synthetisches Erkennungsorakel; `@napi-rs/keyring` 1.3.0 (MIT) als möglicher OS-Secret-Store | Presidio: Python-/Modellruntime und deutsche Fachdomäne sprechen vorerst gegen Produktintegration. Keyring: bindet laut Primärquelle Windows Credential Manager, macOS Keychain und Linux Secret Service über N-API; ein Pilot muss jede tatsächlich gelieferte Architektur, den gesperrten Offline-Start und Set/Get/Delete praktisch belegen. Dynamisches Laden ist Pflicht; fehlender Keyring oder gesperrter Linux-Secret-Service stoppt die Batch-Pseudonymisierung vor dem Snapshot. Kein Datei-, verschlüsselter Datei-, CLI- oder Klartext-Fallback ist zulässig. |
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
- Node.js TextDecoder: https://nodejs.org/api/util.html#class-utiltextdecoder
- markdown-it: https://github.com/markdown-it/markdown-it
- CommonMark: https://spec.commonmark.org/
- Microsoft AppContainer: https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation
- Microsoft SandboxSecurityTools: https://github.com/microsoft/SandboxSecurityTools
- Microsoft MXC: https://github.com/microsoft/mxc
- Apple App Sandbox: https://developer.apple.com/documentation/security/app-sandbox
- Bubblewrap: https://github.com/containers/bubblewrap
- @napi-rs/keyring: https://github.com/Brooooooklyn/keyring-node
- Node Single Executable Applications: https://nodejs.org/api/single-executable-applications.html
