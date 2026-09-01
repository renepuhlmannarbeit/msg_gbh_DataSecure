# Drittanbieter- und Designhinweise

Stand: aktueller Produktbaum; die Paketversion aus `package.json` und
`BUILD_INFO.json` ist im Build maßgeblich.

DataSecure installiert auf dem Endgerät keine npm-, Python- oder sonstigen
Pakete nach und lädt keine OCR-Modelle zur Laufzeit aus dem Netz. Das
Endnutzer-Plugin und der Marketplace verwenden denselben Produktdateisatz. Der
Produktbuild muss Engineering-Spikes, insbesondere den unten inventarisierten
OCR-Baum, ausschließen. Zielabhängig gebündelte Laufzeiten und native Helfer
müssen im jeweiligen Distributionsartefakt und seiner SBOM ausgewiesen sein;
eine Quellbaum- oder Engineering-Inventur allein belegt keine Produktfreigabe.

Der Windows-x64-Sandbox-Launcher verwendet eine statisch gelinkte MSVC-Laufzeit.
Sein C++-Quelltext und die Buildanweisung liegen im Git-Repository desselben
Release-Commits; das Distributionsarchiv enthält das Binary, nicht den Quelltext.

Design- und Testreferenzen, die bei der Architektur berücksichtigt wurden:

- Model Context Protocol / MCPB manifest specification
- PII Shield (MIT) – Architekturreferenz für lokale PII-Verarbeitung und fail-closed Verifikation
- officeParser (MIT) – Referenz für Office-Dokumentstruktur und Markdown-Konvertierung
- Tesseract.js (Apache-2.0) – Architekturgrundlage und Bestandteil des lokalen
  Engineering-OCR-Baums, nicht des Endnutzer-Plugins
- Microsoft Presidio – Referenz für OCR → PII → Bounding-Box-Redaction

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

## Nur Engineering, nicht im Endnutzer-Plugin

- Offline-OCR-Baum: `tesseract.js` 7.0.0, `tesseract.js-core` 7.0.0,
  `bmp-js` 0.1.0, `idb-keyval` 6.3.0, `is-url` 1.2.4, `node-fetch` 2.7.0,
  `opencollective-postinstall` 2.0.3, `regenerator-runtime` 0.13.11,
  `wasm-feature-detect` 1.9.0, `zlibjs` 0.3.1, `whatwg-url` 5.0.0,
  `tr46` 0.0.3 und `webidl-conversions` 3.0.1 sowie die lokalen Modelle
  `deu` und `eng`. Exakte Zielprogramme, Dateihashes, Versionen und Lizenzen
  stehen in `plugins/data-secure/server/ocr-runtime/bundle-manifest.json` und
  `plugins/data-secure/server/ocr-runtime/THIRD_PARTY_NOTICES.md`. Der Manifestwert
  `release_enabled: false` ist bindend. Der Produktbuild schließt den Baum aus;
  PDF, Scan-PDF und eigenständige Bilder bleiben gesperrt.

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
Lizenzhinweise sind dessen separate Inventur und dürfen nicht als Nachweis einer
Auslieferung oder Formatfreigabe gelesen werden.
