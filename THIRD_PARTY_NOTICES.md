# Drittanbieter- und Designhinweise

Stand: aktueller Produktbaum; die Paketversion aus `package.json` und
`BUILD_INFO.json` ist im Build maßgeblich.

DataSecure installiert auf dem Endgerät keine npm-, Python- oder sonstigen
Pakete nach und lädt keine OCR-Modelle zur Laufzeit aus dem Netz. Das
Endnutzer-Plugin-ZIP und die künftige Marketplace-Projektion müssen denselben
Produktdateisatz verwenden; der heutige Marketplace-Quellordner ist ein
Entwicklungskatalog, der den OCR-Engineering-Baum noch enthält (siehe RELEASE.md).
Der Plugin-Produktbuild muss Engineering-Spikes, insbesondere den unten
inventarisierten Universal-OCR-Baum, ausschließen. Die Standalone-Konvertierung
besitzt davon getrennt eine gezielt zusammengestellte lokale Konverter-Runtime.
Zielabhängig gebündelte Laufzeiten und native Helfer
müssen im jeweiligen Distributionsartefakt und seiner SBOM ausgewiesen sein;
eine Quellbaum- oder Engineering-Inventur allein belegt keine Produktfreigabe.

Der Windows-x64-Sandbox-Launcher verwendet eine statisch gelinkte MSVC-Laufzeit.
Sein C++-Quelltext und die Buildanweisung liegen im Git-Repository desselben
Release-Commits; das Distributionsarchiv enthält das Binary, nicht den Quelltext.

Design- und Testreferenzen, die bei der Architektur berücksichtigt wurden:

- Model Context Protocol / MCPB manifest specification
- PII Shield (MIT) – Architekturreferenz für lokale PII-Verarbeitung und fail-closed Verifikation
- officeParser (MIT) – Referenz für Office-Dokumentstruktur und Markdown-Konvertierung
- Tesseract.js (Apache-2.0) – Bestandteil der getrennten Standalone-Konvertierungs-
  Runtime sowie des lokalen Engineering-OCR-Baums, nicht des Endnutzer-Plugins
- Microsoft Presidio – Referenz für OCR → PII → Bounding-Box-Redaction
- Microsoft MarkItDown 0.1.7 (MIT) – optionales, gepinntes und standardmäßig
  deaktiviertes DOCX-Differentialorakel; weder MarkItDown noch Python ist eine
  Voraussetzung für die aktive Standalone-Konvertierung oder Teil ihres Bundles
- Tauri 2 (MIT oder Apache-2.0) – Desktop-Hülle des getrennten Standalone-
  Engineering-Piloten. Auf Windows x64 kompiliert und selbsttragend paketiert,
  aber noch nicht als Endnutzerprodukt freigegeben. Rust/Tauri werden nur auf
  Buildsystemen benötigt; Anwender installieren keine Toolchain.

Es wird kein Code aus diesen Projekten als Runtime-Paket nachinstalliert.

## Produktiv ausgelieferte Komponenten

- Deaktivierte passive MCP-App-Startkarte: `@modelcontextprotocol/ext-apps` 1.7.5,
  `@modelcontextprotocol/sdk` 1.30.0, `zod` 4.5.4 und `zod-to-json-schema` 3.25.2
  werden als geschlossenes Offline-JavaScript-Bundle ausgeliefert. Die vollständigen
  Original-Lizenztexte (einschließlich ext-apps Apache-2.0/MIT-Übergangsregel) stehen
  in `plugins/data-secure/server/status-app/THIRD_PARTY_NOTICES.md` und im
  Produktarchiv unter `server/status-app/`. Exakte Versionen, Lock-Integritäten und Lizenzhashes stehen
  daneben in `bundled-dependencies.json`. esbuild und axe-core sind reine Build-/
  Testwerkzeuge, werden nicht mit der Karte nachinstalliert oder ausgeliefert.

Die zielabhängig gebündelte Node.js-Laufzeit und native Sandbox-Helfer werden
durch das jeweilige Produktartefakt, die Buildmetadaten und die SPDX-SBOM
inventarisiert. Ein Produkt-ZIP darf keine Komponente allein deshalb übernehmen,
weil sie im Engineering-Quellbaum vorhanden ist.
Die Runtime wird aus dem in `native/runtime/runtime-contract.json` fest gepinnten
offiziellen Node.js-22.23.2-Archiv extrahiert. Das Produktarchiv enthält den
zugehörigen Original-Lizenztext als `runtime/LICENSE.node.txt`; Hash, Plattform
und Architektur sind im Runtime-Evidenzdatensatz gebunden.

### Standalone: lokale reine Markdown-Konvertierung

Nur die Standalone-Projektion ergänzt unter
`server/standalone/conversion-runtime/` die benötigten Komponenten:

- `pdfjs-dist` 6.2.108 (Apache-2.0), einschließlich lokaler CMaps, Standardfonts,
  ICC- und WASM-Ressourcen mit ihren mitgelieferten Lizenzhinweisen;
- `@napi-rs/canvas` 1.0.7 (MIT) und genau das native Zielpaket
  `@napi-rs/canvas-win32-x64-msvc`, `@napi-rs/canvas-darwin-x64` oder
  `@napi-rs/canvas-darwin-arm64`, jeweils 1.0.7;
- `tesseract.js` 7.0.0 und `tesseract.js-core` 7.0.0 (Apache-2.0), ihre unten
  benannten transitiven Laufzeitabhängigkeiten und lokale Tessdata-fast-4.1.0-
  Modelle `deu.traineddata`/`eng.traineddata` (Apache-2.0);
- eine Kopie der verifizierten normalen Node.js-22.23.2-Runtime samt
  `LICENSE.node.txt`. Der Konverter verwendet nicht das SEA-Core-Binary als Node.

`scripts/lib/standalone-conversion-runtime.mjs` prüft Paketversionen gegen die
gepinnten OCR-/PDF.js-Lockdateien und nimmt keine bloß zufällig vorhandene
Abhängigkeit auf. `RUNTIME.json` inventarisiert Ziel, Versionen, Integritäten,
Dateihashes und Ausführbarkeitsmerkmale; `THIRD_PARTY_NOTICES.txt`, die erhaltenen
Lizenzdateien neben den Paketen und `models/LICENSE` ergänzen die SPDX-SBOM des
Standalone-Archivs. Der Paketverifizierer prüft diesen getrennten Ressourcenbaum.
Fehlende Zielruntime oder natives Canvas-Paket stoppt den Build; kein Download
und keine Anwenderinstallation dienen als Fallback.

Diese Zusammenstellung aktiviert nur `markdown-only` im Standalone-Produkt.
PDF-/Bild-/Office-Extraktionen mit nicht belegter Vollständigkeit bleiben
ausdrücklich `incomplete`. Sie geben weder den Anonymisierungs- noch den
Cowork-Pfad für zusätzliche Formate frei. Ein inventarisiertes Windows-
Engineering-Paket ersetzt keine macOS-Ausführung, finale PKG-04-Bindung oder UAT.

## Nur Engineering, nicht im Endnutzer-Plugin

- Microsoft MarkItDown 0.1.7 (MIT) und seine Python-Abhängigkeiten: Der
  Quellbaum enthält Vertrag und netzgesperrte Byte-Stream-Bridge für das optionale
  Differentialorakel. Die temporäre Entwicklungsinstallation ist kein
  Repository- oder Paketbestandteil. Ein Python-/Wheel-Bundle ist für den
  jetzigen Produktweg nicht erforderlich; eine spätere andere Lieferentscheidung
  benötigte eigene Lizenz-/Hash-/SBOM-Nachweise. Plugins, LLM-Clients und
  `markitdown-ocr` sind ausgeschlossen.

- Offline-OCR-Baum: `tesseract.js` 7.0.0, `tesseract.js-core` 7.0.0,
  `bmp-js` 0.1.0, `idb-keyval` 6.3.0, `is-url` 1.2.4, `node-fetch` 2.7.0,
  `opencollective-postinstall` 2.0.3, `regenerator-runtime` 0.13.11,
  `wasm-feature-detect` 1.9.0, `zlibjs` 0.3.1, `whatwg-url` 5.0.0,
  `tr46` 0.0.3 und `webidl-conversions` 3.0.1 sowie die lokalen Modelle
  `deu` und `eng`. Exakte Zielprogramme, Dateihashes, Versionen und Lizenzen
  stehen in `plugins/data-secure/server/ocr-runtime/bundle-manifest.json` und
  `plugins/data-secure/server/ocr-runtime/THIRD_PARTY_NOTICES.md`. Der Manifestwert
  `release_enabled: false` ist bindend. Der Plugin-Produktbuild schließt den Baum
  aus; PDF, Scan-PDF und eigenständige Bilder bleiben im Anonymisierungs-/Cowork-
  Pfad gesperrt. Dieser alte Universal-Baum ist nicht mit der oben beschriebenen
  Standalone-Konverterprojektion gleichzusetzen; gemeinsame Bibliotheken werden
  dort separat für den richtigen Zielhost inventarisiert und gebündelt.

- `@napi-rs/keyring` 1.3.0 und seine exakt gelockten nativen Zielpakete (MIT) –
  historisches Engineering-Experiment im Repository. Seit RC80/DS-065 nicht mehr
  Bestandteil des Produkt-ZIPs oder Marketplace-Quellbaums und keine
  Laufzeitvoraussetzung.
  Seit RC82 auch aus dem Marketplace-Produktbaum ausgelagert; historische
  Testfixtures einschließlich Lizenzen liegen unter `tests/legacy/keyring`.
  Der Build prüft stattdessen die Abwesenheit des nativen Keyring-Pakets und
  seiner Einstiegsmodule. Vorhandene Lizenzdateien im Repository bleiben erhalten.

Das produktive SPDX-Dokument muss jedes ausgelieferte Archiv und seine produktiven
Laufzeitkomponenten binden. Das Engineering-OCR-Manifest und seine vollständigen
Lizenzhinweise sind eine separate Inventur und dürfen nicht als Nachweis einer
Auslieferung oder Formatfreigabe gelesen werden. Für die Standalone-Konvertierung
sind ihr eigenes Runtimeinventar und die zugehörige Paket-SBOM maßgeblich.
