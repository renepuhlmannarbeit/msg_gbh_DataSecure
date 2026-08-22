# Unterstützte Formate

Die lokale Vorverarbeitung unterstützt derzeit DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPEG und BMP in den jeweils in der Coverage-Matrix beschriebenen Grenzen. PDF bleibt in RC27 vollständig gesperrt und erzeugt mit `PDF_COVERAGE_UNVERIFIED` kein Paket, bis der native Page-/Font-/Unicode-/Visual-Coverage-Pfad belegt ist. Reine Bilddateien benötigen ein ausdrücklich gewähltes Datenschutzprofil, weil die automatische Erkennung sie vor der lokalen OCR nicht sicher einordnen kann.

Nur automatisch verifizierte Grafiken dürfen freigegeben werden. Alle anderen bleiben lokal unter `Needs Visual Review`; dieser Engineering-Build bietet bewusst keinen menschlichen Freigabeweg über Claude oder MCP.

Bis zu 25 Dateien werden gemeinsam über den lokalen `Input`-Ordner bereitgestellt und nacheinander verarbeitet; ein Fehler bei einer Datei blockiert die übrigen nicht. Die Trennung zwischen Ordneröffnung und Verarbeitung verhindert lang laufende Dateidialog-Aufrufe. Unter Windows steht die vollständigere Textprüfung zur Verfügung. macOS/Linux unterstützen zunächst den TXT-/DOCX-Textpfad und stoppen bei notwendigen Mehrdeutigkeitsentscheidungen sicher. Eine Vorab-Klassifizierung jeder Datei ist nicht nötig. Nur eigenständige Bilder brauchen vor der OCR eine eindeutige Zweckangabe. PDF darf weder per Input noch per Chat-Upload umgangen werden.
