# Drittanbieterhinweise – DataSecure Standalone

Das Paket enthält eine unveränderte offizielle Node.js-Laufzeit 22.23.2. Der
vollständige Node.js-Lizenztext einschließlich der Hinweise zu den von Node.js
gebündelten Komponenten liegt als `LICENSE.node.txt` bei.

Die Desktop-Hülle wird mit Tauri 2.11.5 gebaut. Tauri ist unter MIT oder
Apache-2.0 verfügbar. Die für das jeweilige Ziel tatsächlich aufgelösten
Rust-Komponenten und Versionen sind durch `Cargo.lock` gebunden. Der
Offline-Build erzeugt daraus `RUST-LICENSE-INVENTORY.json`; dieselben
komponentenweisen Cargo-Lizenzangaben stehen in der Paket-SBOM. Eine
Abhängigkeit ohne deklarierte Lizenz oder Lizenzdatei stoppt den Build.

Die reine Offline-Konvertierung enthält außerdem PDF.js 6.2.108
(Apache-2.0), Tesseract.js und Tesseract.js-core 7.0.0 (Apache-2.0),
@napi-rs/canvas 1.0.7 (MIT) mit zielgebundener nativer Bibliothek sowie
Tessdata-fast-4.1.0-Modelle für Deutsch und Englisch (Apache-2.0).
Die vollständigen Lizenztexte bleiben bei den jeweiligen Komponenten unter
`server/standalone/conversion-runtime/`. Dessen `RUNTIME.json` bindet
Versionen und Dateihashes; `THIRD_PARTY_NOTICES.txt` führt auch transitive
JavaScript-Abhängigkeiten auf. Das Paket-SBOM inventarisiert diese Komponenten.
MarkItDown/Python wird für diesen Produktpfad nicht mitgeliefert oder benötigt.

DataSecure selbst ist proprietär; maßgeblich ist `LICENSE`.
