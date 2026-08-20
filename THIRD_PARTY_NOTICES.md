# Third-party / design references

v3.2.0 RC1 hat keine zur Laufzeit nachinstallierten npm-Abhängigkeiten. Die Implementierung ist eigenständig und nutzt Node.js-Core sowie lokale Windows-APIs über gebündelte PowerShell-Bridges.

Design- und Testreferenzen, die bei der Architektur berücksichtigt wurden:

- Model Context Protocol / MCPB manifest specification
- PII Shield (MIT) – Architekturreferenz für lokale PII-Verarbeitung und fail-closed Verifikation
- officeParser (MIT) – Referenz für Office-Dokumentstruktur und Markdown-Konvertierung
- Tesseract.js (Apache-2.0) – Referenz für OCR-Boxmodell; v3.2 nutzt nicht Tesseract.js zur Laufzeit
- Microsoft Presidio – Referenz für OCR → PII → Bounding-Box-Redaction

Es wird kein Code aus diesen Projekten als Runtime-Paket nachinstalliert.
