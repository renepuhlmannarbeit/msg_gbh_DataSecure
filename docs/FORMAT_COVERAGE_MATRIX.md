# Aktuelle Format-Coverage

Stand: 11.09.2026 · Produktversion 3.2.0 RC138

Diese Matrix trennt implementierte Verarbeitung, Extraktionsvollständigkeit und
Zielhost-Abnahme. Ein erfolgreicher Konvertierungstest ist keine Freigabe für
Anonymisierung, Cowork oder einen breiten Endnutzerrollout.

## Anonymisierung: Claude-Plugin und Standalone

Das Claude-Plugin verarbeitet im Modus `markdown-and-anonymize` TXT, Markdown,
CSV und DOCX direkt. XLSX und PPTX nutzen nach DS-093 denselben lokalen
Markdown-first-Grundsatz wie Standalone, aber den bereits ausgelieferten
isolierten Office-Parser. PDF, Scan-PDF und Bilder bleiben bis zum nachgewiesenen
Cowork-OCR-/PDF-Paket gesperrt. Standalone besitzt den DS-087/090-Pfad: DOCX und breite Quellen werden
genau einmal lokal zu einer neutralen Markdown-Extraktion verarbeitet und erst
danach vom unveränderten Privacy-Core anonymisiert. Der Pfad veröffentlicht
gültigen, nichtleeren Markdown-Inhalt auch dann, wenn die Vollständigkeit des
Originalcontainers nicht garantiert werden kann. Sein Ergebnis ist eine
anonymisierte Markdown-Textrepräsentation, keine anonymisierte Originaldatei.
Das Cowork-Plugin verarbeitet damit sechs Formate: vier direkt und zwei über
die lokale Markdown-first-Extraktion.

| Format | Gemeinsame Engine-Coverage | Claude-Plugin | Standalone-Pilot | Freigegebener Inhalt / Verhalten |
|---|---|---|---|---|
| TXT | belegt | freigegeben | E0 belegt, UAT offen | strikt validierter UTF-8-Text; vollständige Privacy- und Residual-Prüfung |
| Markdown (`.md`, `.markdown`) | belegt | freigegeben | E0 belegt, UAT offen | normalisierter Text; Links/HTML bleiben inert und werden nicht geladen |
| CSV | belegt | freigegeben | E0 belegt, UAT offen | strikt validierte Tabelle als Markdown; defekte Struktur stoppt fail-closed |
| DOCX | belegt für dokumentierte Bereiche | freigegeben; unbekannte inhaltsfähige Bereiche stoppen | Markdown-Extraktion wird anonymisiert | Custom-XML/Grafiken bleiben außerhalb des Markdown; Extraktionsstatus bleibt separat, der Markdown-Inhalt durchläuft alle Privacy-Gates |
| XLSX | neutraler Konverter angebunden, Vollständigkeit noch nicht belegt | Markdown-Extraktion wird anonymisiert | Markdown-Extraktion wird anonymisiert | Extraktionsstatus bleibt separat `incomplete`; keine Vollständigkeitszusage für die Arbeitsmappe |
| PPTX | neutraler Konverter angebunden, Vollständigkeit noch nicht belegt | Markdown-Extraktion wird anonymisiert | Markdown-Extraktion wird anonymisiert | Extraktionsstatus bleibt separat `incomplete`; keine Vollständigkeitszusage für die Präsentation |
| PDF / Scan-PDF | Text/OCR angebunden, Vollständigkeit noch nicht belegt | gesperrt | Markdown-Extraktion wird anonymisiert | leere OCR stoppt; sonst keine Vollständigkeitszusage für das PDF |
| PNG, JPEG, BMP | lokale OCR angebunden, OCR nicht fachlich verifiziert | gesperrt | OCR-Markdown wird anonymisiert | leere OCR stoppt; sonst keine Vollständigkeitszusage für den Bildinhalt |
| unbekannt, beschädigt oder verschlüsselt | nicht zulässig | gesperrt | gesperrt | kein Teilresultat und keine Entschlüsselung |

### Privacy-Freigaberegel

Eine erlaubte Endung genügt nicht. Signatur, Container, aktive Inhalte,
Entitätsprüfung und Residual-Gate müssen gemeinsam bestehen. Im Cowork-Pfad
stoppen Parserwarnungen weiterhin. Standalone darf bekannte Extraktionslücken
von DOCX und breiten Quellen nur als getrennten Coverage-Status weitergeben;
unbekannte Coverage, leeres Markdown oder unsichere Quellen stoppen. Der übrige
Stapel darf weiterlaufen. Originale werden nur gelesen und niemals automatisch
verändert oder gelöscht.

Für Tabellen werden eindeutige Quellköpfe wie `Name`, `Zuständig`,
`Verantwortlich`, `Bearbeiter`, `Sachbearbeiter`, `Betreuer`, `Autor`,
`Verfasser`, `Empfänger`, `Absender`, `Unterzeichner`, `Gesprächspartner` und
`Kontakt` spaltengebunden redigiert. Bei Standalone gilt das auch dann, wenn der
neutrale Konverter davor einen technischen `Spalte N`-Kopf erzeugt hat; der
Quellkopf wird nur in der Privacy-Repräsentation wiederhergestellt. Unter einer
nicht katalogisierten Überschrift führt ein verbleibender namensförmiger
Zweiwortwert einschließlich sichtbarem Markdown-Linklabel zum fail-closed-Stopp.
Diese konservative Grenze kann auch neutrale Zweiwortwerte stoppen; sie ist
keine Zusage einer semantischen Klassifikation beliebiger Spalten. Eindeutig
bezeichnete Zertifizierungs-/Credentialspalten bleiben als professioneller
Inhalt erhalten und werden nicht durch die generische Namensform blockiert.
Das bezeichnet hier ausschließlich berufliche Qualifikationen. Davon getrennte
Zugangsdaten-Spalten und -Felder (`Benutzername`/Login, Passwort/Kennwort,
Passphrase, Secret/Token/API-Key, Zugangscode/PIN) werden immer durch
`[CREDENTIAL_REDACTED]` ersetzt und unabhängig restgeprüft; credential-gebundene
Vorkommen erscheinen weder als Werte noch als Hashes in Findings oder Diagnosen.
Ein fachlich eigenständiges Vorkommen desselben Texts als Person oder Organisation
wird weiterhin regulär pseudonymisiert. Ohne explizites Label wird
kein Geheimnis anhand seiner Zeichenform geraten.

IBANs werden kompakt sowie mit einfachem oder mehrfachem Leerraum, Punkt,
Schrägstrich und ASCII-/Unicode-Bindestrichen erkannt; Leerraum um genau ein
solches Satzzeichen ist zulässig. Für belegte feste Gesamtlängen von DE, AT, BE,
GB und NL bleiben nachfolgende Telefon-/BIC-/IBAN-Labels, durch unabhängige
Detektoren abgesicherte Formularlabels und Prosa außerhalb des Bankspans.
Numerische Fortsetzungen, unbekannte Formularlabels und unbekannte Länderlayouts
werden konservativ behandelt.

Der neutrale Extraktionsvertrag enthält weder Publikationskennung noch
Verarbeitungszweck. Es wird kein rohes Markdown-Zwischenergebnis exportiert.
Direkte und konvertierte Quellen laufen mit derselben stapelgebundenen Personen-
und Unternehmenszuordnung; die sichtbare Zuordnung zeigt direkt von der
Originalquelle auf das anonymisierte Markdown-Ergebnis.

Der Anwenderweg ist einstufig: Auswahl und **In Markdown umwandeln und
anonymisieren**. Intern bleiben Extraktion und Anonymisierung getrennte Phasen.
Ausgelassene Objekte, Grafiken oder nicht verifizierter OCR-Inhalt des
Originalcontainers werden nicht nachträglich erfasst; die App behauptet deshalb
keine vollständige Anonymisierung der ursprünglichen DOCX-, XLSX-, PPTX-, PDF-
oder Bilddatei. Sie bestätigt ausschließlich die vollständige Prüfung des tatsächlich
extrahierten Markdown-Inhalts.

### Bilder in DOCX

Es gibt keinen auswählbaren Bildmodus. Bildpixel werden weder veröffentlicht noch
an Claude übergeben. Ein Dokument kann je nach belegtem Inhalt als verwendbar mit
klar benannter Auslassung enden oder bis zu einer lokalen Entscheidung gesperrt
bleiben. DataSecure löscht Bilder niemals aus der Originaldatei.

## Reine Markdown-Konvertierung: nur Standalone

`markdown-only` ist als zweite Kernfunktion integriert (DS-085/DS-088/BL-010.28):
Auswahl → bei Bedarf einzelne Dateien entfernen → bewusster Start → Fortschritt
→ Ergebnisse. Der beim Start
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
| PPTX | vorab validierte OOXML-/RELS-Struktur; extrahierbare Folientexte, Tabellen und Notizen | stets `incomplete`; DTD/Entities und Strukturüberlauf stoppen, pixelgetreues Layout und vollständiger grafischer Inhalt sind nicht belegt |
| PDF mit Text | gebündeltes PDF.js, seitenweise Textauswertung; standardisierte Dokumentmetadaten werden sichtbar erhalten | stets `incomplete`; eine einzelne textlose Bildfläche neben vorhandenem Text erzeugt keinen `OCR_TEXT_EMPTY`-Gesamtstopp; Annotationen, Outline und XMP stoppen, weitere Objekt-/Layoutabdeckung ist nicht vollständig belegt |
| Scan-PDF | Seiten ohne Text sowie tatsächlich gemalte Bildinhalte werden lokal gerastert und mit DE/EN-OCR gelesen; auch bei zusätzlicher nativer Seitenzahl | stets `incomplete`, OCR nicht verifiziert; native Texte bleiben erhalten, bereits enthaltene OCR-Zeilen werden nicht erneut angehängt |
| PNG | lokaler Bilddecoder → lokale OCR | stets `incomplete`; Bildpixel werden nicht in Markdown eingebettet |
| JPEG (`.jpg`, `.jpeg`) | gebündelter Canvas-Decoder → lokale OCR | stets `incomplete`; keine Cloud-Bildbeschreibung |
| BMP | lokaler Bilddecoder → lokale OCR | stets `incomplete`; Leertext bleibt ausdrücklich als OCR-Leerbefund erkennbar |

Die festen Auslassungsgründe sind `SOURCE_COVERAGE_UNVERIFIED`,
`VISUAL_CONTENT_NOT_EXTRACTED`, `OCR_NOT_VERIFIED` und `OCR_TEXT_EMPTY`.
Eine erfolgreiche, aber unvollständige Extraktion darf mit diesen Hinweisen
gespeichert werden; sie ist weder anonymisiert noch als vollständig bestätigt.
`OCR_TEXT_EMPTY` gilt ausschließlich, wenn die gesamte Datei keinen verwertbaren
Text liefert; textlose Bildflächen neben vorhandenem nativen PDF-Text bleiben
als `OCR_NOT_VERIFIED`/`VISUAL_CONTENT_NOT_EXTRACTED` ausgewiesen.
Beschädigte, verschlüsselte, übergroße oder nicht sicher auswertbare Eingaben
erhalten dagegen kein Konvertat und werden mit festem Fehlercode in der lokalen
Diagnose nachvollziehbar. Es gibt keine Entschlüsselung und keine feste Seitenanzahlgrenze;
Byte-, Text-, Pixel-, Speicher- und Zeitbudgets gelten weiterhin.

Konvertate besitzen den eigenen `dm_`-Artefakttyp und erscheinen nach terminalem
Gesamtstapel unter `DataSecure-Markdown/Lauf-…`. Ihr Quellbasisname bleibt
erhalten; nur die Endung wird `.md`, bei Kollisionen folgt eine deterministische
Nummer. Eine Zuordnungsdatei wird nicht erzeugt. Anonymisierte Dateien bleiben unter
`DataSecure-Output/Lauf-…`; ihr Name ist pro Stapel neutral (Standard) oder
behält auf ausdrückliche Wahl die Quellbasis mit `-anonymisiert`. Die
Zuordnungsdatei nennt jeweils das tatsächlich erzeugte Ziel. Beide Outputbäume
sind als erneute Quelle gesperrt.
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
[Cowork-UAT-Kit](acceptance/UAT_TEST_KIT/README.md) sowie im
[Standalone-UAT-Kit](acceptance/STANDALONE_UAT_TEST_KIT/README.md).

Der lokale E0-Konverterlauf umfasst 30 Testgruppen einschließlich echter
Office-/PDF-/Bildbytes, Fehler, Abbruch und Ressourcenbindung. Eine Serie mit
100 TXT-Dateien dauerte in den aktuellen Gegenläufen ungefähr 15–16 Sekunden; die große
Runtime wurde dabei nicht je Dokument erneut vollständig gelesen/gehasht.
60 frühe Beendigungen prüfen die atomare Windows-Jobbindung. Diese Messungen
sind keine allgemeine Geschwindigkeitszusage und kein sichtbarer Anwender-UAT.

Der vollständige aktuelle Paket-/Sidecar-E2E-Lauf ist bestanden: zwei bytegleiche
RC111-Builds aus `b543589f3250a6ab57ddd5bc3a144f03a24ee026`, beide Smokes,
PKG-04-Receipt und INT-13-Bindung. Beide Modi sowie elf Konvertierungen plus
Fehlerposition und genaue Laufzuordnung sind geprüft. ZIP-SHA-256:
`6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f`.
Historische Evidence bleibt versionsgebunden: RC109-Builds aus
`6bf7d05747e151ba8f846849229495e9fca4c041`, RC108-Builds aus
`a742333e8ef80b445729d4bede6a91a2b8f13207` und der frühere RC107-Kandidat
aus `7b88a81` belegen nicht den RC111-Stand.
Native macOS-ARM64-E0-Ausführung ist durch Lauf `34285518668` auf Commit
`487bfe1` belegt; native macOS-Intel-E0-Ausführung durch Lauf `34318293471` auf
Commit `1cf2d53`. Die erweiterten Läufe `34321954381` und `34322534571` auf
Commit `5243799` belegen zusätzlich das echte ad-hoc signierte App-Bundle,
Bundlearchitektur, private IPC, Core-Initialisierung und geordnetes Beenden auf
beiden Architekturen. Distributionsarchive sowie sichtbarer und fachlicher UAT
bleiben offen. Die
DS-087-Verkettung für die **Anonymisierung** ist angebunden und fail-closed
getestet. RC111 bindet `source_type` an die Dateiendung und prüft echte
TXT/XLSX-Mischstapel in beiden Reihenfolgen, Abbruch/Fortsetzung, Exact-once und
stabile Personen-/Unternehmenslabels. Vollständige Container-/Grafik-/OCR-
Coverage für die breiten Formate bleibt eigene Backlogarbeit; deshalb erzeugen
aktuelle reale breite Quellen ein anonymisiertes Markdown-Ergebnis mit separat
ausgewiesener, häufig unvollständiger Quellenextraktionsabdeckung.
