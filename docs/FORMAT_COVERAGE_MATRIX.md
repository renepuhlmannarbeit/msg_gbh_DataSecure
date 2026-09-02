# Aktuelle Format-Coverage

Stand: 01.09.2026 · Produktversion 3.2.0 RC85

Diese Matrix beschreibt den belegten Produktpfad. Zielwünsche aus älteren
Architekturpapieren sind keine Freigabe.

| Format | Aktueller Status | Freigegebener Inhalt | Verbindliches Verhalten |
|---|---|---|---|
| TXT | freigegeben | strikt validierter UTF-8-Text | vollständige Privacy- und Residual-Prüfung |
| Markdown (`.md`, `.markdown`) | freigegeben | normalisierter Text; Links/HTML bleiben inert | keine externen Inhalte laden |
| CSV | freigegeben | strikt validierte Tabelle als Markdown | defekte Struktur stoppt fail-closed |
| DOCX | freigegeben | belegte Dokument- und Tabellenbereiche | Bildpixel bleiben lokal; unbekannte inhaltsfähige Bereiche stoppen |
| XLSX | gesperrt | nichts | `SOURCE_FORMAT_NOT_RELEASED` oder gleichwertiger fail-closed Stopp |
| PPTX | gesperrt | nichts | `SOURCE_FORMAT_NOT_RELEASED` oder gleichwertiger fail-closed Stopp |
| PDF / Scan-PDF | gesperrt | nichts | kein Lite-Parser als Produktfallback |
| PNG, JPEG, BMP | gesperrt | nichts | OCR-/Bildpfad ist noch kein Produktpfad |
| unbekannt, beschädigt oder verschlüsselt | gesperrt | nichts | kein Teilresultat und keine Entschlüsselung |

## Gemeinsame Freigaberegel

Eine erlaubte Endung genügt nicht. Signatur, Container, Parsercoverage,
Entitätsprüfung und Residual-Gate müssen gemeinsam bestehen. Parserwarnungen oder
nicht belegte Inhaltsbereiche stoppen die betroffene Datei; der übrige Stapel darf
weiterlaufen. Originale werden nur gelesen und niemals automatisch verändert oder
gelöscht.

## Bilder in DOCX

Es gibt keinen auswählbaren Bildmodus. Bildpixel werden weder veröffentlicht noch
an Claude übergeben. Ein Dokument kann je nach belegtem Inhalt als verwendbar mit
klar benannter Auslassung enden oder bis zu einer lokalen Entscheidung gesperrt
bleiben. DataSecure löscht Bilder niemals aus der Originaldatei.

## Plattformstatus

Code- und Paketverträge sind plattformübergreifend ausgelegt. Eine reale
Produktfreigabe für Windows oder macOS folgt erst nach dem jeweiligen aktuellen
Cowork-/Desktop-UAT. Linux ist ein separates Claude-Code-Hostziel und keine Zusage
für Claude Desktop. Details stehen im
[aktuellen Zustand](canonical/CURRENT_STATE.md) und im
[UAT-Kit](acceptance/UAT_TEST_KIT/README.md).

## Spätere Freigaben

XLSX, PPTX, PDF/Scan-PDF und eigenständige Bilder bleiben im Backlog. Ein Format
wird erst freigegeben, wenn Extraktion, visuelle Grenze, Ressourcenlimits,
Negativtests, Paketierung und reale Zielsystemevidenz vollständig vorliegen.
