# Drittanbieterhinweise – DataSecure Standalone

Das Paket enthält eine unveränderte offizielle Node.js-Laufzeit 22.23.2. Der
vollständige Node.js-Lizenztext einschließlich der Hinweise zu den von Node.js
gebündelten Komponenten liegt als `LICENSE.node.txt` bei.

Die Desktop-Hülle wird mit Tauri 2.11.5 gebaut. Tauri ist unter MIT oder
Apache-2.0 verfügbar. Die konkret aufgelösten Rust-Komponenten und Versionen
sind durch `Cargo.lock` im zugehörigen Quellstand gebunden und im Paket-SBOM
inventarisiert. Das heutige Engineering-SBOM setzt deren Lizenzfelder bewusst
auf `NOASSERTION`; es ersetzt keine komponentenweise Lizenzprüfung. Diese
Prüfung ist vor einem Endnutzerrelease Pflicht.

DataSecure selbst ist proprietär; maßgeblich ist `LICENSE`.
