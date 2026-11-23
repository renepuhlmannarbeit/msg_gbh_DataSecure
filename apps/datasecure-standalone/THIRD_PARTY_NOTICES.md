# Drittanbieterhinweise – DataSecure Standalone

Das Paket enthält eine unveränderte offizielle Node.js-Laufzeit 22.23.2 für
die Konvertierung. Der vollständige Node.js-Lizenztext einschließlich der
Hinweise zu den von Node.js gebündelten Komponenten liegt als
`LICENSE.node.txt` bei. Das Windows-Paket verwendet dieselbe unveränderte
Laufzeit auch als Core. Die macOS-Pakete enthalten als Core zusätzlich eine
aus den offiziellen Node.js-22.23.2-Quellen statisch gebaute Laufzeit mit
eingebundenem DataSecure-Ownership-Guard; sie ist keine unveränderte
offizielle Binärdatei. Für sie gilt derselbe Node.js-Lizenztext, der im Paket
zusätzlich als `LICENSE.custom-node.txt` beiliegt.

Die Desktop-Hülle wird mit Tauri 2.11.5 gebaut. Tauri ist unter MIT oder
Apache-2.0 verfügbar. Die für das jeweilige Ziel tatsächlich aufgelösten
Rust-Komponenten und Versionen sind durch `Cargo.lock` gebunden. Der
Offline-Build erzeugt daraus `RUST-LICENSE-INVENTORY.json`; dieselben
komponentenweisen Cargo-Lizenzangaben stehen in der Paket-SBOM. Eine
Abhängigkeit ohne deklarierte Lizenz oder Lizenzdatei stoppt den Build.

Die reine Offline-Konvertierung enthält außerdem PDF.js 6.2.108
(Apache-2.0), Tesseract.js und Tesseract.js-core 7.0.0 (Apache-2.0),
@napi-rs/canvas 1.0.7 (MIT) mit zielgebundener nativer Bibliothek,
emf-converter 4.18.1 (Apache-2.0) für eingebettete EMF-/WMF-Grafiken sowie
Tessdata-fast-4.1.0-Modelle für Deutsch und Englisch (Apache-2.0).
Die vollständigen Lizenztexte bleiben bei den jeweiligen Komponenten unter
`server/standalone/conversion-runtime/`. Dessen `RUNTIME.json` bindet
Versionen und Dateihashes; `THIRD_PARTY_NOTICES.txt` führt auch transitive
JavaScript-Abhängigkeiten auf. Das Paket-SBOM inventarisiert diese Komponenten.
Im macOS-App-Bundle liegen Konverter-Node und Sandbox unter `Contents/MacOS/`,
die native Canvas-Bibliothek unter `Contents/Frameworks/`. JavaScript,
Paketmetadaten, Modelle und Lizenzdateien bleiben unter `Contents/Resources/`.
Das gemeinsame `RUNTIME.json` bindet die nativen Dateien über feste Rollen;
Dateipfade aus Benutzereingaben oder Umgebungsvariablen wählen sie nicht aus.
MarkItDown/Python wird für diesen Produktpfad nicht mitgeliefert oder benötigt.

DataSecure selbst ist proprietär; maßgeblich ist `LICENSE`.

Die Oberfläche enthält die unveränderte lokale Schrift Inter Variable 4.1 von
Rasmus Andersson und Mitwirkenden unter SIL Open Font License 1.1. Der vollständige
Text liegt als `LICENSE-Inter.txt` bei. Die Schrift wird ohne Internetzugriff aus
dem Desktop-Frontend geladen; Version und SHA-256 stehen in der Paket-SBOM.
