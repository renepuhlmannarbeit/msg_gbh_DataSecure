# Unterstützte Formate

Die lokale Vorverarbeitung unterstützt PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPEG und BMP. Gescannte PDFs werden unterstützt, wenn ihre JPEG-Seitenbilder sicher extrahiert werden können; andernfalls bricht die Verarbeitung sicher ab. Reine Bilddateien und Scan-PDFs ohne Textschicht benötigen ein ausdrücklich gewähltes Datenschutzprofil, weil die automatische Erkennung sie vor der lokalen OCR nicht sicher einordnen kann.

Nur automatisch verifizierte Grafiken dürfen freigegeben werden. Alle anderen bleiben lokal unter `Needs Visual Review`; dieser Engineering-Build bietet bewusst keinen menschlichen Freigabeweg über Claude oder MCP.

Bis zu 25 TXT- oder inhaltlich vollständige DOCX-Dateien können gemeinsam über den privaten lokalen Dateidialog ausgewählt werden. Sie werden nacheinander verarbeitet; ein Fehler bei einer Datei blockiert die übrigen nicht. Unter Windows steht je Datei die auf Schwärzungen begrenzte Textprüfung zur Verfügung. PDF, andere Formate oder formatgemischte Stapel verwenden derzeit gemeinsam den `Input`-Ordner. Eine Vorab-Klassifizierung jeder Datei ist nicht nötig. Nur eigenständige Bilder und Scan-PDFs ohne Textschicht brauchen vor der OCR eine eindeutige Zweckangabe.
