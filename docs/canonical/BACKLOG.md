# Kanonisches Entwicklungsbacklog

Stand: 22.08.2026 · Ausgangsbasis: RC30

Dies ist die einzige priorisierte Arbeitsliste für das beschlossene Zielprodukt.
`P0` blockiert alle nachfolgenden Freigaben. Ein Eintrag gilt erst als erledigt, wenn
Code, Tests, Dokumentation und Traceability gemeinsam aktualisiert sind.

Pflegeregel: Jeder Entwicklungscommit aktualisiert die betroffene Story oder wird
unmittelbar von einem Dokumentationscommit begleitet. Das Backlog nennt dabei den
tatsächlich erreichten Nachweis und die verbleibende Restlücke; Piloten werden nicht
mit Produktfreigaben gleichgesetzt.

## Statusübersicht der Epics

| Epic | PO-Status | Wiederverwendbare Basis | Nächster echter Produktfortschritt |
|---|---|---|---|
| BL-001 | erledigt | kanonische Dokumente und Prüftest | laufend pflegen |
| BL-002 | erledigt | getrennte Ist-/Zielmanifeste und Drift-Test | laufend bei jeder Capability-Änderung prüfen |
| BL-010 | teilweise | ZIP/MCPB, Parität, Plattformadapter | installationsfreier Startvertrag |
| BL-011 | teilweise | Journale, Snapshot, Claims, Recovery | private Kopien und echte Wiederaufnahme |
| BL-012 | teilweise | Windows-Einzeldialoge und Abschlusszähler | ein stapelweiter Dialog auf drei OS |
| BL-020 | teilweise | ZIP-/OOXML-Härtung und Warnungen | gemeinsamer Content-Graph |
| BL-021 | teilweise | TXT freigegeben, MD/CSV-Parser vorhanden | MD-/CSV-Coverage freigeben |
| BL-022 | teilweise | DOCX freigegeben, XLSX/PPTX-Parser getestet | vollständige OOXML-Coverage |
| BL-023 | in Arbeit | PDFium-Spike und Drei-OS-Risikogate | Pflichtmatrix praktisch belegen |
| BL-024 | teilweise | Windows-OCR und Bildbausteine | gebündelte OCR auf drei OS |
| BL-030 | teilweise | Auto-Profil und Dokumentpseudonyme | stapelweiter fortsetzbarer Kontext |
| BL-031 | teilweise | fortgeschrittener Zertifikatskontext | Stapelentscheidungen und Corpus-Ausbau |
| BL-032 | teilweise | Windows-Mehrdeutigkeitsreview | Passwort, Vertagen und drei OS |
| BL-040 | offen | wiederverwendbarer Paket-/Audit-Store | Ziel-Exportvertrag implementieren |
| BL-041 | teilweise | zwei Skills und sicherer RC30-Teilweg | neuer Stapelweg und Aufgabenfortsetzung |
| BL-042 | teilweise | Aussagegrenzen und Diagnosejournal | exportierbares Diagnosepaket |
| BL-050 | teilweise | breite Regression und 150er-Matrix | 1.000 dokumentartige Fixtures |
| BL-051 | teilweise | Drei-OS-CI, Build, SBOM und Parität | echte Installations-/Rollback-Matrix |
| BL-052 | offen | Expertenreviews, aber keine Nutzerabnahme | beobachtete Drei-Parteien-Abnahme |

## Lieferreihenfolge

Die Epics bleiben für Entscheidungen und Traceability stabil. Die folgenden Stories
sind die tatsächlich planbaren Einheiten. Eine Parserexistenz oder ein Spike ist noch
keine Formatfreigabe.

### Meilenstein 0 – Wahrheit und riskante Verträge zuerst

#### BL-001.1 – Open-Source-Wiederverwendung verbindlich machen

Status: **erledigt** · Epic: BL-001 · Entscheidung: DS-038

Jedes Epic besitzt im kanonischen Komponentenregister Kandidaten, Prüfgates oder eine
begründete Restlücke. Eine Story darf Eigenentwicklung erst beginnen, wenn passende
Bausteine praktisch verglichen wurden; ein Bibliotheksname allein ist keine Abnahme.

#### BL-002.1 – RC30-Ist-Manifest vervollständigen

Status: **erledigt** · Epic: BL-002

`BUILD_INFO.json`, Runtime-Status und öffentliche Texte nennen nur tatsächlich
freigegebene Fähigkeiten; TXT/DOCX sind als exakte Allowlist getestet.

#### BL-002.2 – Maschinenlesbares Zielmanifest einführen

Status: **erledigt** · Epic: BL-002

Das Zielmanifest enthält DS-IDs, Zielformate, Plattformen und Grenzwerte, wird aber
niemals von der RC30-Runtime als aktuelle Fähigkeit ausgegeben.

#### BL-002.3 – Fähigkeits-Drift automatisch blockieren

Status: **erledigt** · Epic: BL-002 · Abhängigkeit: BL-002.2

Ein Test vergleicht Runtime, Ist-Manifest, Skills, Marketplace und aktive Handbücher;
Zieltexte werden ausdrücklich getrennt behandelt.

#### BL-011.1 – Privaten unveränderlichen Stapel-Snapshot spezifizieren

Status: **erledigt** · Epic: BL-011

Ausgewählte Originale bleiben unverändert; private Kopien und ihr atomarer Zustand
sind die alleinige Fortsetzungsbasis. Originaländerungen nach Start verändern den
Auftrag nicht.

#### BL-030.1 – Fortsetzbaren Pseudonymvertrag spezifizieren

Status: **erledigt** · Epic: BL-030 · Abhängigkeit: BL-011.1

Stapelweite Konsistenz über Neustarts wird ohne persistente Rohwert-Mappingtabelle
nachgewiesen. Seed-/Ableitungsverfahren, 14-Tage-Lebenszyklus und Löschung sind Teil
des Sicherheitsvertrags.

#### BL-023.1 – PDF-/OCR-Risikobeweis auf drei Plattformen

Status: **in Arbeit** · Epic: BL-023, BL-024

Vor Produktcode werden bestehende PDF-/OCR-Bausteine gegen einen Eigenbuild sowie
Engine, Offline-Verhalten, Paketgröße, Lizenzinventar,
Verschlüsselung, Scanpfad und sichere Prozessgrenze auf Windows/macOS/Linux belegt.

Fortschritt 22.08.2026:

- PDFium-Preflight `32593313169` und PDF.js-/Canvas-Pilot `32594467568` liefen auf
  Windows x64, macOS x64/ARM64 und Linux x64; alle Ergebnisse bleiben `no_go`.
- Tesseract.js-/Canvas-Pilot `32594838193` bestand lokale Deutsch-/Englisch-OCR und
  Netzwerkverbot auf denselben vier Zielen.
- Lauf `32595199861` ergänzte offizielle CycloneDX-1.5-SBOMs, Paketintegritäten,
  Lizenzallowlist sowie Commit-/Hashprüfung der Sprachmodelle und ihrer Lizenz.
- Lauf `32595454727` bestand getrennte OCR-Prozesse, Timeout-/Flood-Gegenproben,
  Heap-, Laufzeit- und Ausgabegrenzen; Windows zusätzlich mit Job-Object-RAM/CPU.

Restlücke: vollständige PDF-Coverage einschließlich Verschlüsselung und Scanpfad,
native harte RAM-/CPU-Grenzen auf macOS/Linux, Notices/Schwachstellenrichtlinie,
Angriffskorpus sowie ein frisches verteilbares Pluginpaket. Keine Pflichtmatrixzelle
ist allein durch die Piloten als Produktnachweis bestanden.

### Meilenstein 1 – Nutzbarer fortsetzbarer TXT-/DOCX-Stapelkern

#### BL-011.2 – Stapel auf 100 Dateien und 500 MB umstellen

Status: **offen** · Epic: BL-011 · Abhängigkeit: BL-011.1

Die bisherige 25-Dateien- und sichtbare 100-MB-Einzelgrenze wird durch 100 Dateien
und 500 MB Gesamtgröße ersetzt; Seitenzahlen bleiben unbegrenzt.

#### BL-011.3 – Einen aktiven und mehrere pausierte Stapel erzwingen

Status: **offen** · Epic: BL-011 · Abhängigkeit: BL-011.1

Pro Benutzer existiert genau ein verarbeitender Auftrag. Pausierte Aufträge besitzen
getrennte Arbeitskopien, Pseudonymkontexte und Exporte.

#### BL-011.4 – Checkpoints und echte Wiederaufnahme implementieren

Status: **offen** · Epic: BL-011 · Abhängigkeiten: BL-011.1, BL-030.1

Erfolge werden nicht wiederholt; offene/fehlgeschlagene Positionen können nach
Abbruch oder Neustart an der letzten sicheren Phase fortgesetzt werden.

#### BL-011.5 – Lebenszyklus offener Arbeitskopien umsetzen

Status: **offen** · Epic: BL-011 · Abhängigkeit: BL-011.1

Erfolgreiche Arbeitskopien verschwinden sofort, offene nach spätestens 14 Tagen;
Originale und dauerhafte Exporte bleiben unberührt.

#### BL-011.6 – Speicher-, Entpack- und Ressourcen-Vorprüfung

Status: **offen** · Epic: BL-011, BL-020

500 MB Eingabe, ZIP-Bomben und große entpackte Inhalte werden vor Kapazitätsverlust
sicher behandelt; die Meldung bleibt verständlich und der Auftrag fortsetzbar.

#### BL-011.7 – Fortschrittsereignisse und sicheren Abbruch liefern

Status: **offen** · Epic: BL-011, BL-012 · Abhängigkeit: BL-011.4

Position, Phase, Zähler und belastbare Restzeit sind lokal verfügbar. Abbruch erzeugt
einen konsistenten Checkpoint und keine Teilfreigabe.

#### BL-030.2 – Stapelweites Auto-Profil und Pseudonyme implementieren

Status: **offen** · Epic: BL-030 · Abhängigkeiten: BL-011.4, BL-030.1

Gemischte Dateien werden einzeln klassifiziert; gleiche Entitäten erhalten im
gesamten Stapel konsistente, danach gelöschte Pseudonyme.

#### BL-040.1 – Exportordner, neutrale Namen und Kollisionsschutz

Status: **offen** · Epic: BL-040 · Abhängigkeit: BL-011.1

Der Standardordner wird einmal gewählt und pro Lauf änderbar angezeigt. Exporte
überschreiben niemals vorhandene Dateien.

#### BL-040.2 – MCP-unsichtbare UTF-8-Mapping-CSV

Status: **offen** · Epic: BL-040 · Abhängigkeit: BL-040.1

Originalname, neutraler Ergebnisname, Status und fester Hinweis werden ohne Pfad
exportiert. CSV-Formelinjektion ist verhindert; kein MCP-Lesetool erreicht die Datei.

#### BL-040.3 – Stapelweiten JSON-Nachweis exportieren

Status: **offen** · Epic: BL-040 · Abhängigkeit: BL-040.1

Versionen, Zeitpunkt, Zähler, Regelstand und feste Codes bestehen eine strikte
Leckageprüfung ohne Namen, Pfade, Inhalte oder Pseudonymzuordnung.

### Meilenstein 2 – Ein zusammenhängender lokaler Benutzerweg

#### BL-012.1 – Stapel ohne Zwischenfragen analysieren

Status: **offen** · Epic: BL-012 · Abhängigkeit: BL-011.4

Alle Dateien erreichen zuerst einen sicheren Ergebnis- oder Offenstatus; kein
per-Datei-Dialog unterbricht die Analysephase.

#### BL-012.2 – Einen gebündelten Abschlussdialog bauen

Status: **offen** · Epic: BL-012, BL-031 · Abhängigkeit: BL-012.1

Alle Mehrdeutigkeiten und fachlich nicht vollständig übertragbaren Bereiche werden
in genau einem lokalen Dialog fundstellenbezogen entschieden.

#### BL-012.3 – „Später entscheiden“ fortsetzbar machen

Status: **offen** · Epic: BL-012, BL-032 · Abhängigkeiten: BL-011.4, BL-012.2

Der Hinweis nennt die Nichtfreigabe; der spätere Lauf öffnet direkt die offenen
Entscheidungen.

#### BL-012.4 – Freiwillige Gesamtvorschau anbieten

Status: **offen** · Epic: BL-012 · Abhängigkeit: BL-012.2

Eindeutig geprüfte Dateien benötigen keine Pflichtlektüre; die lokale Vorschau ist
optional und besitzt keine Umgehungsfunktion.

#### BL-012.5 – Barrierefreiheit auf drei Plattformen abnehmen

Status: **offen** · Epic: BL-012 · Abhängigkeiten: BL-012.2, BL-010.2 bis BL-010.4

Tastatur, Screenreader, Skalierung, Fokusfolge und verständliche Meldungen werden
praktisch nachgewiesen.

#### BL-031.1 – Fundstellen gruppiert im Stapel entscheiden

Status: **offen** · Epic: BL-031 · Abhängigkeit: BL-012.2

Einzelentscheidung bleibt Standard; eine bewusste Gruppenaktion gilt nur für
nachgewiesen gleichartige Fundstellen desselben Stapels.

#### BL-032.1 – Plattformgleichen Mehrdeutigkeitsdialog liefern

Status: **offen** · Epic: BL-032 · Abhängigkeiten: BL-012.2, BL-010.2 bis BL-010.4

Behalten, anonymisieren, zurück/ändern und später entscheiden verhalten sich auf
Windows, macOS und Linux identisch.

#### BL-032.2 – Lokalen Passwortweg implementieren

Status: **offen** · Epic: BL-032

Passwörter bleiben im RAM, erscheinen in keinem Log und werden nach Neustart lokal
erneut abgefragt.

#### BL-041.1 – Beide Skillstarts auf denselben Jobvertrag führen

Status: **offen** · Epic: BL-041 · Abhängigkeit: BL-011.4

Natürliche Sprache und direkte Skillauswahl starten identische lokale Auswahl,
Fortsetzung und Fehlerbehandlung.

#### BL-041.2 – Ursprüngliche Claude-Aufgabe automatisch fortsetzen

Status: **offen** · Epic: BL-041 · Abhängigkeiten: BL-040.1 bis BL-040.3, BL-041.1

Claude verwendet ausschließlich freigegebenes Markdown und verarbeitet Teil- sowie
Gesamterfolg entsprechend der Ausgangsaufgabe.

#### BL-041.3 – Bereits hochgeladene Originale sicher behandeln

Status: **offen** · Epic: BL-041

Ein Chat-Anhang erzeugt eine klare Offenlegungswarnung und keinen irreführenden
„sicheren“ DataSecure-Lauf; Regression und Modellabnahme sind verpflichtend.

### Meilenstein 3 – Formate in positiven Coverage-Scheiben

#### BL-020.1 – Gemeinsamen Content-Graph und Locator-Vertrag implementieren

Status: **offen** · Epic: BL-020 · Abhängigkeit: BL-011.1

Alle Parser liefern dieselbe versionierte Struktur für Text, Tabellen, Bilder,
Metadaten und Quellenpositionen.

#### BL-020.2 – Rekursive Einbettungen und aktive Inhalte absichern

Status: **offen** · Epic: BL-020 · Abhängigkeit: BL-020.1

Unterstützte Einbettungen werden begrenzt rekursiv verarbeitet; Makros, Skripte,
Programme und externe Abrufe bleiben inert.

#### BL-020.3 – Netzwerkfreiheit als eigenes Gate nachweisen

Status: **offen** · Epic: BL-020, BL-010

Parser, OCR, Review und Exporte bestehen OS-spezifische Negativtests ohne DNS,
Internet, RFC1918 oder Loopback-Ausweichpfad.

#### BL-021.1 – TXT und Markdown vollständig freigeben

Status: **offen** · Epic: BL-021 · Abhängigkeit: BL-020.1

Encoding, Unicode, Struktur, große Dokumente und Injection-Fälle besitzen positive
Coverage; erst dann wird Markdown ins Ist-Manifest aufgenommen.

#### BL-021.2 – CSV vollständig freigeben

Status: **offen** · Epic: BL-021 · Abhängigkeit: BL-020.1

Dialekte, Trennzeichen, Quotes, Encodings, große Tabellen und Formula-Injection sind
abgedeckt.

#### BL-022.1 – DOCX-Vollcoverage abschließen

Status: **offen** · Epic: BL-022 · Abhängigkeiten: BL-020.1, BL-020.2

Alle relevanten Parts, Beziehungen, Kommentare, Kopf-/Fußbereiche, Textfelder und
Einbettungen besitzen positive und negative Coverage.

#### BL-022.2 – XLSX vollständig freigeben

Status: **offen** · Epic: BL-022 · Abhängigkeiten: BL-020.1, BL-020.2

Blätter, Zellen, Formeln, Kommentare, Charts, Beziehungen und Einbettungen werden
vollständig und sicher als Markdown abgebildet.

#### BL-022.3 – PPTX vollständig freigeben

Status: **offen** · Epic: BL-022 · Abhängigkeiten: BL-020.1, BL-020.2

Folien, Master, Notizen, Tabellen, Charts, Textfelder, Beziehungen und Einbettungen
sind abgedeckt.

#### BL-024.1 – Gemeinsamen OCR-Vertrag Deutsch/Englisch definieren

Status: **in Arbeit** · Epic: BL-024 · Abhängigkeit: BL-023.1

Wortpositionen, Konfidenz, gemischte Sprache, Ressourcenlimits und Fehlercodes sind
plattformneutral versioniert.

Fortschritt: Tesseract.js 7.0.0 liefert Deutsch/Englisch lokal auf allen vier
Zielarchitekturen. Prozess-, Netzwerk-, Heap-, Laufzeit- und Ausgabegrenzen sowie
feste Pilotfehler sind nachgewiesen. `contracts/OCR_RESULT_V1.md` und das strikte
`ocr-result-v1.schema.json` versionieren nun Text, Wort-/Zeilenindex, halb offene
Pixelpositionen, Deutsch/Englisch, Konfidenz- und Fail-closed-Regeln, gemeinsame
Grenzwerte sowie elf inhaltsfreie Fehlercodes. Der Tesseract.js-Adapter fordert
`blocks` ausdrücklich an und normalisiert die echte gemischtsprachige Probe; acht
Positiv-/Negativtests decken leere Ergebnisse, niedrige Konfidenz, fehlende
Positionen, ungültige Boxen und Pixelgrenzen ab. Offen vor Abschluss sind der
Vier-Plattform-Nachweis dieses Vertrags und native harte macOS/Linux-RAM-/CPU-Grenzen.

#### BL-024.2 – OCR-Backends für Windows, macOS und Linux liefern

Status: **offen** · Epic: BL-024 · Abhängigkeiten: BL-024.1, BL-010.1

Alle Backends laufen gebündelt, offline und mit demselben Vertrag.

Vorarbeit: Der portable Tesseract.js-WASM-Pilot läuft offline auf Windows x64,
macOS x64/ARM64 und Linux x64. Die Story bleibt offen, bis BL-024.1 abgeschlossen,
Runtime und Modelle installationsfrei gebündelt und im echten Pluginpfad integriert
sind.

#### BL-024.3 – PNG, JPEG und BMP freigeben

Status: **offen** · Epic: BL-024 · Abhängigkeiten: BL-020.1, BL-024.2

Metadaten, OCR, Textprüfung und nichttextuelle Bedeutung sind vollständig behandelt;
das Ergebnis bleibt Markdown ohne Bildpixel.

#### BL-023.2 – Textbasierte PDFs freigeben

Status: **offen** · Epic: BL-023 · Abhängigkeiten: BL-020.1, BL-023.1

Fonts, Textpositionen, Seitenreihenfolge und beschädigte Strukturen bestehen den
Coverage-Vertrag.

#### BL-023.3 – PDF-Formulare, Annotationen, Anhänge und Verschlüsselung

Status: **offen** · Epic: BL-023 · Abhängigkeiten: BL-020.2, BL-023.2, BL-032.2

Alle statischen Inhalte und unterstützten Anhänge werden geprüft; Passwörter bleiben
lokal und aktive Inhalte inert.

#### BL-023.4 – Scan-PDF und visuelle Coverage freigeben

Status: **offen** · Epic: BL-023 · Abhängigkeiten: BL-023.2, BL-024.2

Jede Seite wird visuell abgedeckt, OCR-geprüft und bei fachlich nicht textuell
übertragbaren Inhalten in den Abschlussdialog übernommen.

### Meilenstein 4 – Plattformpakete und Supportfähigkeit

#### BL-010.1 – Betriebssystemneutralen Plugin-Startvertrag beweisen

Status: **offen** · Epic: BL-010

Vor Paketbau wird mit aktueller Claude-Dokumentation und einem Installationsspike
belegt, wie genau ein sichtbares Plugin die passende lokale Komponente startet.

#### BL-010.2 – Windows-Paket liefern

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.1, Meilenstein 2

Frische ZIP-/Marketplace-Installation ohne manuelle Runtime und vollständiger
lokaler Zielablauf sind nachgewiesen.

#### BL-010.3 – macOS-Paket liefern

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.1, Meilenstein 2

Frische ZIP-/Marketplace-Installation ohne manuelle Runtime und vollständiger
lokaler Zielablauf sind nachgewiesen.

#### BL-010.4 – Linux-Paket liefern

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.1, Meilenstein 2

Frische ZIP-/Marketplace-Installation ohne manuelle Runtime und vollständiger
lokaler Zielablauf sind nachgewiesen.

#### BL-010.5 – ZIP-/Marketplace-Gleichheit belegen

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.2 bis BL-010.4

Beide Vertriebswege liefern pro Plattform identische Fähigkeiten, Regeln und Tests.

#### BL-010.6 – Versionsarchiv und Rückrolle testen

Status: **offen** · Epic: BL-010 · Abhängigkeit: BL-010.5

Eine fehlerhafte Version kann ohne Verlust dauerhafter Exporte durch die letzte
freigegebene Version ersetzt werden.

#### BL-042.1 – Diagnosepaket lokal exportieren

Status: **offen** · Epic: BL-042

Schema, explizite Nutzeraktion, Programmbinär-Prüfsummen und Leckageprüfung sind
abgenommen; es erfolgt kein automatischer Versand.

### Meilenstein 5 – Qualitäts- und Freigabenachweis

#### BL-050.1 – Corpus-Schema und Metriken festschreiben

Status: **offen** · Epic: BL-050

Ground Truth, Null-Miss-Gate für direkte Identifikatoren, mindestens 99 Prozent
markierter Inhaltserhalt und Format-/Sprachverteilung sind maschinenlesbar.

#### BL-050.2 – Mindestens 1.000 dokumentartige Fixtures liefern

Status: **offen** · Epic: BL-050 · Abhängigkeit: BL-050.1, Meilenstein 3

Alle Zielformate, Dokumenttypen, Sprachen, Layouts, Einbettungen und Angriffsvarianten
sind vertreten; jeder Defekt bleibt Regression.

#### BL-051.1 – Frische ZIP-Installation auf drei OS abnehmen

Status: **offen** · Epic: BL-051 · Abhängigkeit: BL-010.5, Meilenstein 3

Installieren, starten, verarbeiten, fortsetzen und exportieren funktionieren ohne
Entwicklerwerkzeuge.

#### BL-051.2 – Marketplace-Installation auf drei OS abnehmen

Status: **offen** · Epic: BL-051 · Abhängigkeit: BL-010.5, Meilenstein 3

Der Organisationsweg besitzt denselben End-to-End-Nachweis wie der ZIP-Weg.

#### BL-051.3 – 100-Dateien-/500-MB-End-to-End-Abnahme

Status: **offen** · Epic: BL-051 · Abhängigkeiten: BL-011.2 bis BL-011.7, Meilenstein 3

Gemischter Maximalstapel, Fehler, Abbruch und Neustart-Fortsetzung bestehen auf allen
drei Plattformen.

#### BL-051.4 – Rückrolle auf drei OS abnehmen

Status: **offen** · Epic: BL-051 · Abhängigkeit: BL-010.6

Vorgängerversion startet sicher; offene Jobs werden kompatibel übernommen oder klar
und verlustfrei migriert beziehungsweise pausiert.

#### BL-052.1 – Beobachtete Anwenderabnahme

Status: **offen** · Epic: BL-052 · Abhängigkeit: Meilenstein 4

Normale Anwender bewältigen Auswahl, Fortschritt, Entscheidungen, Fortsetzung und
Export mit synthetischen Daten ohne Entwicklerhilfe.

#### BL-052.2 – IT-/Health-IT-Fachabnahme

Status: **offen** · Epic: BL-052 · Abhängigkeiten: BL-050.2, BL-052.1

Fachinhalte, Zertifikate, Tabellen, Ausschreibungen und medizinische IT-Terminologie
bleiben im vereinbarten Umfang erhalten.

#### BL-052.3 – Datenschutzabnahme mit synthetischen Daten

Status: **offen** · Epic: BL-052 · Abhängigkeiten: BL-050.2, BL-052.1

Datenflüsse, lokale Grenzen, Aufbewahrung, Mapping, Diagnose und Aussagegrenzen sind
dokumentiert geprüft. Ein Echtdatenpilot bleibt eine getrennte Entscheidung.

## Definition of Ready

Eine Story ist erst bereit, wenn sie Nutzerergebnis und Plattformumfang nennt,
DS-/Epic-IDs sowie wiederzuverwendende Module und Tests referenziert, Abhängigkeiten
und Datenschutzgrenze festhält, positive/negative/Abbruch-Akzeptanzfälle besitzt,
synthetische Fixtures beschreibt, den Eintrag in `OPEN_SOURCE_COMPONENTS.md` bewertet
und keine offene Architekturentscheidung verbirgt.

## Definition of Done

Eine Story ist erst erledigt, wenn Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
Traceability aktualisiert sind; Security-, Privacy- und Recovery-Negativtests bestehen; jeder
Defekt einen Regressionstest erhält; keine Rohwerte, Pfade oder Mappingdaten über MCP
oder Diagnose austreten; Artefaktparität besteht; Ist-Fähigkeiten erst nach positiver
Abnahme erweitert werden; betroffene Zielplattformen praktisch getestet sind; und
bei UI-Arbeit Barrierefreiheit sowie verständliche Fehler nachgewiesen sind.

## Epic-Abnahmekriterien: Steuerung und Ist-/Zielstand

### BL-001 – Kanonisches Dokumentensystem etablieren

Status: **erledigt** · Entscheidungen: DS-001 bis DS-038 · Ist: [BL-001](CURRENT_STATE.md#bl-001--kanonisches-dokumentensystem)

Abnahme: Kanonische Quellen, Entscheidungsregister, Backlog und Traceability sind
vorhanden; ein automatischer Test erkennt fehlende oder verwaiste IDs; alte
Planungsdokumente verweisen sichtbar auf diesen Ordner.

### BL-002 – RC30-Fähigkeitsmanifest vom Zielmanifest trennen

Status: **erledigt** · Entscheidungen: DS-007, DS-010, DS-034, DS-035 · Ist: [BL-002](CURRENT_STATE.md#bl-002--ist--und-ziel-fähigkeiten)

Abnahme: Maschinenlesbare Ist-Fähigkeiten nennen nur tatsächlich freigegebene
Plattformen/Formate/Grenzen; das Zielmanifest wird nie zur Runtime-Werbung verwendet.

## Epic-Abnahmekriterien: Installation und Auftragsbasis

### BL-010 – Ein Plugin, betriebssystemspezifische Laufzeitpakete

Status: **teilweise** · Entscheidungen: DS-002, DS-003, DS-004, DS-030, DS-031, DS-034 · Ist: [BL-010](CURRENT_STATE.md#bl-010--plattformpakete)

Abnahme: ZIP und Marketplace installieren auf Windows, macOS und Linux ohne manuelle
Runtime; Plattformauswahl ist automatisch; Rollback auf das Vorgängerartefakt ist
dokumentiert und getestet.

### BL-011 – Persistenter, fortsetzbarer Job Store

Status: **teilweise** · Entscheidungen: DS-010, DS-020, DS-021, DS-022, DS-036 · Ist: [BL-011](CURRENT_STATE.md#bl-011--fortsetzbarer-job-store)

Abnahme: 100 Dateien/500 MB, ein aktiver Auftrag, sichere Pause/Abbruch/Neustart-
Fortsetzung, keine feste Seitenbegrenzung und 14-Tage-Bereinigung offener Kopien.

### BL-012 – Gemeinsames lokales Fortschritts- und Abschlussfenster

Status: **teilweise** · Entscheidungen: DS-013, DS-014, DS-015, DS-016, DS-028, DS-036 · Ist: [BL-012](CURRENT_STATE.md#bl-012--fortschritts--und-abschlussfenster)

Abnahme: keine Zwischenfragen während des Stapels; ein tastatur- und
screenreaderbedienbarer Abschlussdialog; „Später entscheiden“ warnt und hält die
Datei zuverlässig zurück.

## Epic-Abnahmekriterien: Extraktion und Offline-OCR

### BL-020 – Versionierter Content-Graph und Coverage-Vertrag

Status: **teilweise** · Entscheidungen: DS-007, DS-008, DS-015, DS-017, DS-035 · Ist: [BL-020](CURRENT_STATE.md#bl-020--content-graph-und-coverage)

Abnahme: Jeder extrahierte Text-/Bildbereich besitzt einen stabilen Locator; nicht
abgedeckte Inhalte können nicht still verschwinden; eingebettete Dokumente unterliegen
Rekursions- und Ressourcengrenzen; aktive Inhalte bleiben inert.

### BL-021 – Text-, Markdown- und CSV-Pfad

Status: **teilweise** · Entscheidungen: DS-007, DS-008, DS-012 · Ist: [BL-021](CURRENT_STATE.md#bl-021--txt-markdown-und-csv)

Abnahme: TXT, MD und CSV einschließlich Unicode, Tabellen, Formelfeldern und
Injection-Zeichen werden vollständig als sicheres Markdown dargestellt.

### BL-022 – OOXML-Pfade DOCX, XLSX und PPTX

Status: **teilweise** · Entscheidungen: DS-007, DS-008, DS-017 · Ist: [BL-022](CURRENT_STATE.md#bl-022--docx-xlsx-und-pptx)

Abnahme: Hauptinhalt, Tabellen, Kopf-/Fußbereiche, Textfelder, Kommentare, Notizen,
Beziehungen und eingebettete unterstützte Dateien sind abgedeckt; unbekannte
inhaltstragende Parts werden sichtbar offen gehalten.

### BL-023 – PDF einschließlich Scan-PDF

Status: **offen** · Entscheidungen: DS-007, DS-008, DS-009, DS-015, DS-018 · Ist: [BL-023](CURRENT_STATE.md#bl-023--pdf-und-scan-pdf)

Abnahme: lokale PDF-Engine deckt Text, Fonts, Formulare, Annotationen, Anhänge und
Seitenbilder ab; Scan-PDF läuft durch Offline-OCR; der bestehende PDF-No-Go-Gate wird
erst nach positivem Coverage-Nachweis entfernt.

### BL-024 – Plattformneutrale Offline-OCR und Bildpfade

Status: **teilweise** · Entscheidungen: DS-009, DS-018, DS-028, DS-037 · Ist: [BL-024](CURRENT_STATE.md#bl-024--offline-ocr-und-bilder)

Abnahme: Deutsch/Englisch einschließlich gemischter Dokumente, PNG/JPEG/BMP und visuelle Office-/PDF-Bestandteile laufen
offline auf allen Zielplattformen; Bildpixel bleiben außerhalb von Claude;
fachlich nicht textuell übertragbare Grafiken werden lokal angezeigt.

## Epic-Abnahmekriterien: Erkennung und Entscheidungen

### BL-030 – Stapelweite Entitätsauflösung

Status: **teilweise** · Entscheidungen: DS-011, DS-012, DS-019, DS-029 · Ist: [BL-030](CURRENT_STATE.md#bl-030--stapelweite-entitätsauflösung)

Abnahme: automatische Profilwahl je Datei, gemischte Stapel, konsistente flüchtige
Pseudonyme und keine persistente Mapping-Tabelle.

### BL-031 – Kontextmodell für Organisationen und Zertifizierungen

Status: **teilweise** · Entscheidungen: DS-012, DS-013, DS-029 · Ist: [BL-031](CURRENT_STATE.md#bl-031--organisationen-und-zertifizierungen)

Abnahme: dieselbe Zeichenfolge wird fundstellenbezogen korrekt behandelt;
Zertifikatskontexte bleiben erhalten, Arbeitgeber/Kunden/Parteien verschwinden;
Kataloge sind nur Evidenz und unbekannte Zertifizierungen bleiben prüfbar.

### BL-032 – Lokale Passwort- und Mehrdeutigkeitsentscheidungen

Status: **teilweise** · Entscheidungen: DS-013, DS-014, DS-016, DS-027 · Ist: [BL-032](CURRENT_STATE.md#bl-032--passwörter-und-lokale-entscheidungen)

Abnahme: Passwörter bleiben im RAM; Entscheidungen können einzeln, gleichartig oder
später erfolgen; eindeutig geprüfte Dateien benötigen keine Pflichtvorschau.

## Epic-Abnahmekriterien: Export und Claude-Integration

### BL-040 – Dauerhafter Exportvertrag

Status: **offen** · Entscheidungen: DS-008, DS-023, DS-024, DS-025 · Ist: [BL-040](CURRENT_STATE.md#bl-040--dauerhafter-export)

Abnahme: pro Quelle neutrales Markdown, pro Stapel UTF-8-CSV und inhaltsfreier
JSON-Nachweis; kein Überschreiben; Mapping ist technisch außerhalb aller MCP-Lesetools.

### BL-041 – Fortsetzung der ursprünglichen Claude-Aufgabe

Status: **teilweise** · Entscheidungen: DS-003, DS-005, DS-006, DS-027, DS-032 · Ist: [BL-041](CURRENT_STATE.md#bl-041--claude-aufgabe-fortsetzen)

Abnahme: natürliche Sprache und Skillauswahl verhalten sich gleich; Claude liest nur
freigegebenes Markdown und setzt die Ausgangsaufgabe automatisch fort; Uploads und
unverfügbare lokale Tools stoppen verständlich.

### BL-042 – Datenschutz- und Diagnosekommunikation

Status: **teilweise** · Entscheidungen: DS-001, DS-026, DS-028, DS-032 · Ist: [BL-042](CURRENT_STATE.md#bl-042--kommunikation-und-diagnose)

Abnahme: Alltagssprache im Normalweg, optionale technische Details, keine
Rechtsgarantie und ein lokal erzeugbares, inhaltsfreies Diagnosepaket.

## Epic-Abnahmekriterien: Qualität und Freigabe

### BL-050 – 1.000-Dokument-Abnahmekorpus

Status: **teilweise** · Entscheidungen: DS-007, DS-009, DS-012, DS-017, DS-033 · Ist: [BL-050](CURRENT_STATE.md#bl-050--1000-dokument-korpus)

Abnahme: mindestens 1.000 synthetische Dokumente über alle Formate, Dokumenttypen,
Schriften und Angriffsvarianten; null bekannte direkte Identifikator-Misses in der
Pflichtsuite; mindestens 99 Prozent markierter fachlicher Inhalt bleibt erhalten.

### BL-051 – Plattform- und Distributionsmatrix

Status: **teilweise** · Entscheidungen: DS-002, DS-004, DS-031, DS-034 · Ist: [BL-051](CURRENT_STATE.md#bl-051--plattform--und-distributionsmatrix)

Abnahme: frische ZIP- und Marketplace-Installation, kompletter Benutzerweg,
Fortsetzung und Export auf Windows, macOS und Linux; Belege pro Version archiviert.

### BL-052 – Menschliche UX-/Fach-/Datenschutzabnahme

Status: **offen** · Entscheidungen: DS-012, DS-013, DS-027, DS-028, DS-033 · Ist: [BL-052](CURRENT_STATE.md#bl-052--menschliche-abnahme)

Abnahme: normale Anwender, IT-/Health-IT-Fachvertretung und Datenschutz prüfen
ausschließlich synthetische Szenarien; jeder Defekt wird Regressionstest und
Backlogposition. Echtdaten bleiben bis zur ausdrücklichen Pilotentscheidung NO-GO.
