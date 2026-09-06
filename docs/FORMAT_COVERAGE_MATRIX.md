# Aktuelle Format-Coverage

Stand: 06.09.2026 · Produktversion 3.2.0 RC110

Diese Matrix trennt implementierte Verarbeitung, Extraktionsvollständigkeit und
Zielhost-Abnahme. Ein erfolgreicher Konvertierungstest ist keine Freigabe für
Anonymisierung, Cowork oder einen breiten Endnutzerrollout.

## Anonymisierung: Claude-Plugin und Standalone

Das Claude-Plugin bleibt im Modus `markdown-and-anonymize` auf vier Formate
begrenzt. Standalone besitzt zusätzlich den DS-087-Pfad: breite Quellen werden
genau einmal lokal zu einer neutralen Markdown-Extraktion verarbeitet und erst
danach vom unveränderten Privacy-Core anonymisiert. Dieser Pfad veröffentlicht
nur eine belegbar vollständige Extraktion. Sein Ergebnis ist eine anonymisierte
Markdown-Textrepräsentation, keine anonymisierte Originaldatei.

| Format | Gemeinsame Engine-Coverage | Claude-Plugin | Standalone-Pilot | Freigegebener Inhalt / Verhalten |
|---|---|---|---|---|
| TXT | belegt | freigegeben | E0 belegt, UAT offen | strikt validierter UTF-8-Text; vollständige Privacy- und Residual-Prüfung |
| Markdown (`.md`, `.markdown`) | belegt | freigegeben | E0 belegt, UAT offen | normalisierter Text; Links/HTML bleiben inert und werden nicht geladen |
| CSV | belegt | freigegeben | E0 belegt, UAT offen | strikt validierte Tabelle als Markdown; defekte Struktur stoppt fail-closed |
| DOCX | belegt für dokumentierte Bereiche | freigegeben | E0 belegt, UAT offen | Bildpixel bleiben lokal; unbekannte inhaltsfähige Bereiche stoppen |
| XLSX | neutraler Konverter angebunden, Vollständigkeit noch nicht belegt | gesperrt | sicherer Einzelstopp | erst bei `complete`; aktuelle Extraktion bleibt `incomplete` |
| PPTX | neutraler Konverter angebunden, Vollständigkeit noch nicht belegt | gesperrt | sicherer Einzelstopp | erst bei `complete`; aktuelle Extraktion bleibt `incomplete` |
| PDF / Scan-PDF | Text/OCR angebunden, Vollständigkeit noch nicht belegt | gesperrt | sicherer Einzelstopp | erst bei `complete`; aktuelle Extraktion bleibt `incomplete` |
| PNG, JPEG, BMP | lokale OCR angebunden, OCR nicht fachlich verifiziert | gesperrt | sicherer Einzelstopp | erst bei `complete`; aktuelle Extraktion bleibt `incomplete` |
| unbekannt, beschädigt oder verschlüsselt | nicht zulässig | gesperrt | gesperrt | kein Teilresultat und keine Entschlüsselung |

### Privacy-Freigaberegel

Eine erlaubte Endung genügt nicht. Signatur, Container, Parsercoverage,
Entitätsprüfung und Residual-Gate müssen gemeinsam bestehen. Parserwarnungen oder
nicht belegte Inhaltsbereiche stoppen die betroffene Datei; der übrige Stapel darf
weiterlaufen. Originale werden nur gelesen und niemals automatisch verändert oder
gelöscht.

Der neutrale Extraktionsvertrag enthält weder Publikationskennung noch
Verarbeitungszweck. Es wird kein rohes Markdown-Zwischenergebnis exportiert.
Direkte und konvertierte Quellen laufen mit derselben stapelgebundenen Personen-
und Unternehmenszuordnung; die sichtbare Zuordnung zeigt direkt von der
Originalquelle auf das anonymisierte Markdown-Ergebnis.

### Bilder in DOCX

Es gibt keinen auswählbaren Bildmodus. Bildpixel werden weder veröffentlicht noch
an Claude übergeben. Ein Dokument kann je nach belegtem Inhalt als verwendbar mit
klar benannter Auslassung enden oder bis zu einer lokalen Entscheidung gesperrt
bleiben. DataSecure löscht Bilder niemals aus der Originaldatei.

## Reine Markdown-Konvertierung: nur Standalone

`markdown-only` ist als zweite Kernfunktion integriert (DS-085/BL-010.28):
Auswahl → bewusster Start → Fortschritt → Ergebnisse/Zuordnung. Der beim Start
gebundene Modus bleibt bei Abbruch/Fortsetzung unverändert. Es gibt keinen
zusätzlichen PII-Review und keine Bestätigungsserie für warnende Extraktionen.
Die Oberfläche kennzeichnet die Ausgabe dauerhaft als **nicht anonymisiert**.
Namen, Firmen, IBAN und andere Originalinhalte werden nicht entfernt.

Elf Eingabetypen sind aktiv; Scan-PDF ist ein gesonderter Verarbeitungsfall des
PDF-Formats, keine eigene Dateiendung:

| Eingabetyp | Lokaler Konvertierungsweg | Vollständigkeit / sichtbare Grenze |
|---|---|---|
| TXT | strikt validiertes UTF-8, ohne Privacy-Normalisierung | vollständiger decodierter Text; UTF-8-BOM ist Kodierungsmetadatum |
| Markdown (`.md`, `.markdown`) | Textübernahme mit erhaltenen Unicode-Zeichen und Zeilenenden | kein Abruf eingebetteter Links oder Bilder, keine HTML-Ausführung |
| CSV | alle Originalzeilen als Markdown-Tabelle, Literalwerte statt erratener Kopfsemantik | leere/doppelte Kopfwerte, führende Nullen und formelartige Werte bleiben Daten; defekte Struktur stoppt |
| DOCX | vorhandener OOXML-Parser im inhaltserhaltenden Text-/Tabellenpfad | einfache belegte Bereiche vollständig; unbekannte Bereiche oder visuelle Auslassungen als `incomplete` gekennzeichnet; unsichere Struktur stoppt |
| XLSX | Text-/Zellen-/Formel- und vorhandene Cachewerte aus OOXML | stets `incomplete`; keine Excel-Neuberechnung, Layout-/Objektvollständigkeit nicht zugesagt |
| PPTX | extrahierbare Folientexte, Tabellen und Notizen | stets `incomplete`; kein pixelgetreues Layout oder vollständiger grafischer Inhalt |
| PDF mit Text | gebündeltes PDF.js, seitenweise Textauswertung | stets `incomplete`; unbekannte Objekt-/Layoutabdeckung wird nicht als vollständig dargestellt |
| Scan-PDF | Seiten ohne Text sowie tatsächlich gemalte Bildinhalte werden lokal gerastert und mit DE/EN-OCR gelesen; auch bei zusätzlicher nativer Seitenzahl | stets `incomplete`, OCR nicht verifiziert; native Texte bleiben erhalten, bereits enthaltene OCR-Zeilen werden nicht erneut angehängt |
| PNG | lokaler Bilddecoder → lokale OCR | stets `incomplete`; Bildpixel werden nicht in Markdown eingebettet |
| JPEG (`.jpg`, `.jpeg`) | gebündelter Canvas-Decoder → lokale OCR | stets `incomplete`; keine Cloud-Bildbeschreibung |
| BMP | lokaler Bilddecoder → lokale OCR | stets `incomplete`; Leertext bleibt ausdrücklich als OCR-Leerbefund erkennbar |

Die festen Auslassungsgründe sind `SOURCE_COVERAGE_UNVERIFIED`,
`VISUAL_CONTENT_NOT_EXTRACTED`, `OCR_NOT_VERIFIED` und `OCR_TEXT_EMPTY`.
Eine erfolgreiche, aber unvollständige Extraktion darf mit diesen Hinweisen
gespeichert werden; sie ist weder anonymisiert noch als vollständig bestätigt.
Beschädigte, verschlüsselte, übergroße oder nicht sicher auswertbare Eingaben
erhalten dagegen kein Konvertat und bleiben in der lokalen Zuordnung als Fehler
nachvollziehbar. Es gibt keine Entschlüsselung und keine feste Seitenanzahlgrenze;
Byte-, Text-, Pixel-, Speicher- und Zeitbudgets gelten weiterhin.

Konvertate besitzen den eigenen `dm_`-Artefakttyp und erscheinen nach terminalem
Gesamtstapel unter `DataSecure-Markdown/Lauf-…` einschließlich
`DataSecure-Zuordnung.csv`. Anonymisierte Dateien bleiben unter
`DataSecure-Output/Lauf-…`. Beide Outputbäume sind als erneute Quelle gesperrt.
Rohe Konvertate erhalten keine Privacy-Lesecapability und sind aus öffentlichen
Paketlisten, MCP-Handoff und Cowork-Lesezugriff ausgeschlossen. Es erfolgt kein
automatischer Upload an KI-Dienste.

Der Konverter nutzt mitgeliefertes Node.js, PDF.js, Canvas und lokale
Tesseract-DE/EN-Modelle. **MarkItDown/Python ist nur ein optionales
Differentialorakel, keine benötigte Anwender-Runtime und kein benötigtes Bundle.**

## Plattform- und Nachweisstatus

Code- und Paketverträge sind plattformübergreifend ausgelegt. Eine reale
Produktfreigabe für Windows oder macOS folgt erst nach dem jeweiligen aktuellen
Cowork-/Desktop-UAT. Das Windows-x64-Standalone-ZIP ist ein automatisch
verifizierter Engineering-Pilot, noch kein Endnutzerrelease. Linux ist beim
Plugin ein separates Claude-Code-Hostziel und beim Standalone-Produkt ein
eigenes späteres Desktopziel. Details stehen im
[aktuellen Zustand](canonical/CURRENT_STATE.md) und im
[UAT-Kit](acceptance/UAT_TEST_KIT/README.md).

Der lokale E0-Konverterlauf umfasst 28 Testgruppen einschließlich echter
Office-/PDF-/Bildbytes, Fehler, Abbruch und Ressourcenbindung. Eine Serie mit
100 TXT-Dateien dauerte auf dem Entwicklungsrechner 15,264 Sekunden; die große
Runtime wurde dabei nicht je Dokument erneut vollständig gelesen/gehasht.
60 frühe Beendigungen prüfen die atomare Windows-Jobbindung. Diese Messungen
sind keine allgemeine Geschwindigkeitszusage und kein sichtbarer Anwender-UAT.

Der vollständige aktuelle Paket-/Sidecar-E2E-Lauf ist bestanden: zwei bytegleiche
RC109-Builds aus `6bf7d05747e151ba8f846849229495e9fca4c041`, beide Smokes,
PKG-04-Receipt und neue INT-13-Bindung. Beide Modi sowie elf Konvertierungen plus
Fehlerposition und genaue Laufzuordnung sind geprüft. ZIP-SHA-256:
`807940d1a48846c5de9e898691e45027d934fb84e5b3d64ef7f8031f79d271e1`.
Historische Evidence bleibt versionsgebunden: RC108-Builds aus `a742333e8ef80b445729d4bede6a91a2b8f13207`
und der frühere RC107-Kandidat
aus `7b88a81` belegen nicht den RC109-Stand.
Native macOS-Intel-/ARM-Ausführung und fachlicher UAT bleiben offen. Die
DS-087-Verkettung für die **Anonymisierung** ist angebunden und fail-closed
getestet. Vollständige Container-/Grafik-/OCR-Coverage für die breiten Formate
bleibt eigene Backlogarbeit; deshalb erzeugen aktuelle reale breite Quellen noch
kein freigegebenes anonymisiertes Ergebnis.
