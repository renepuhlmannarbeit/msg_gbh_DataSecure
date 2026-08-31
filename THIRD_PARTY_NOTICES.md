# Third-party / design references

v3.2.0 RC68 installiert zur Laufzeit keine npm-, Python- oder sonstigen Pakete
nach. Die Implementierung nutzt Node.js-Core, gebündelte PowerShell-
Bridges und einen Windows-x64-Launcher mit statisch gelinkter MSVC-Laufzeit. Der
zugehörige C++-Quelltext und die Buildanweisung liegen im Git-Repository desselben
Release-Commits; die Distributionsarchive enthalten das Binary, aber nicht den
Quelltext. Der Launcher verwendet ausschließlich Windows-SDK-APIs.

Design- und Testreferenzen, die bei der Architektur berücksichtigt wurden:

- Model Context Protocol / MCPB manifest specification
- PII Shield (MIT) – Architekturreferenz für lokale PII-Verarbeitung und fail-closed Verifikation
- officeParser (MIT) – Referenz für Office-Dokumentstruktur und Markdown-Konvertierung
- Tesseract.js (Apache-2.0) – Referenz für OCR-Boxmodell; v3.2 nutzt nicht Tesseract.js zur Laufzeit
- Microsoft Presidio – Referenz für OCR → PII → Bounding-Box-Redaction

Es wird kein Code aus diesen Projekten als Runtime-Paket nachinstalliert.

Eingebettete Runtime-Komponente:

- Deaktivierte passive MCP-App-Startkarte: `@modelcontextprotocol/ext-apps` 1.7.5,
  `@modelcontextprotocol/sdk` 1.30.0, `zod` 4.5.4 und `zod-to-json-schema` 3.25.2
  werden als geschlossenes Offline-JavaScript-Bundle ausgeliefert. Die vollständigen
  Original-Lizenztexte (einschließlich ext-apps Apache-2.0/MIT-Übergangsregel) stehen
  in `plugins/data-secure/server/status-app/THIRD_PARTY_NOTICES.md`, im MCPB unter
  `server/status-app/`. Exakte Versionen, Lock-Integritäten und Lizenzhashes stehen
  daneben in `bundled-dependencies.json`. esbuild und axe-core sind reine Build-/
  Testwerkzeuge, werden nicht mit der Karte nachinstalliert oder ausgeliefert.

- `@napi-rs/keyring` 1.3.0 und seine exakt gelockten nativen Zielpakete (MIT) –
  historisches Engineering-Experiment im Repository. Seit RC80/DS-065 nicht mehr
  Bestandteil der Produkt-ZIP-/MCPB-Pakete und keine Laufzeitvoraussetzung.
  Der Build prüft stattdessen die Abwesenheit des nativen Keyring-Pakets und
  seiner Einstiegsmodule. Vorhandene Lizenzdateien im Repository bleiben erhalten.
