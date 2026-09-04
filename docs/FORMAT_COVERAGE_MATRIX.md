# Aktuelle Format-Coverage

Stand: 01.09.2026 · Produktversion 3.2.0 RC99

Diese Matrix beschreibt den belegten Produktpfad. Zielwünsche aus älteren
Architekturpapieren sind keine Freigabe.

„Engine“ bezeichnet die gemeinsame Format-Coverage. Das Claude-Plugin und
Standalone besitzen trotzdem getrennte Release-Evidence.

| Format | Gemeinsame Engine-Coverage | Claude-Plugin | Standalone-Pilot | Freigegebener Inhalt / Verhalten |
|---|---|---|---|---|
| TXT | belegt | freigegeben | E0 belegt, UAT offen | strikt validierter UTF-8-Text; vollständige Privacy- und Residual-Prüfung |
| Markdown (`.md`, `.markdown`) | belegt | freigegeben | E0 belegt, UAT offen | normalisierter Text; Links/HTML bleiben inert und werden nicht geladen |
| CSV | belegt | freigegeben | E0 belegt, UAT offen | strikt validierte Tabelle als Markdown; defekte Struktur stoppt fail-closed |
| DOCX | belegt für dokumentierte Bereiche | freigegeben | E0 belegt, UAT offen | Bildpixel bleiben lokal; unbekannte inhaltsfähige Bereiche stoppen |
| XLSX | nicht belegt | gesperrt | gesperrt | nichts; `SOURCE_FORMAT_NOT_RELEASED` oder gleichwertiger Stopp |
| PPTX | nicht belegt | gesperrt | gesperrt | nichts; `SOURCE_FORMAT_NOT_RELEASED` oder gleichwertiger Stopp |
| PDF / Scan-PDF | nicht belegt | gesperrt | gesperrt | nichts; kein Lite-Parser als Produktfallback |
| PNG, JPEG, BMP | nicht belegt | gesperrt | gesperrt | nichts; OCR-/Bildpfad ist noch kein Produktpfad |
| unbekannt, beschädigt oder verschlüsselt | nicht zulässig | gesperrt | gesperrt | kein Teilresultat und keine Entschlüsselung |

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
Cowork-/Desktop-UAT. Das Windows-x64-Standalone-ZIP ist ein automatisch
verifizierter Engineering-Pilot, noch kein Endnutzerrelease. Linux ist beim
Plugin ein separates Claude-Code-Hostziel und beim Standalone-Produkt ein
eigenes späteres Desktopziel. Details stehen im
[aktuellen Zustand](canonical/CURRENT_STATE.md) und im
[UAT-Kit](acceptance/UAT_TEST_KIT/README.md).

## Spätere Freigaben

XLSX, PPTX, PDF/Scan-PDF und eigenständige Bilder bleiben im Backlog. Ein Format
wird erst freigegeben, wenn Extraktion, visuelle Grenze, Ressourcenlimits,
Negativtests, Paketierung und reale Zielsystemevidenz vollständig vorliegen.
