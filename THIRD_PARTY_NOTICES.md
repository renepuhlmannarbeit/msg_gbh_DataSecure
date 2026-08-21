# Third-party / design references

v3.2.0 RC18 hat keine zur Laufzeit nachinstallierten npm-, Python- oder sonstigen
Paketabhängigkeiten. Die Implementierung nutzt Node.js-Core, gebündelte PowerShell-
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
