# RC172 – BL-049.2 Inhaltsabdeckung und lesbares Markdown

## Auftrag und Bindung

23.10.2026 ausdrücklich beauftragt: BL-049.2 für Windows x64, macOS ARM64 und
Intel implementieren, unabhängige Fachgegenreviews und automatische Tests,
neue Testversion lokal/GitHub bereitstellen. Menschliche Desktoptests führt
der Nutzer durch. RC171 und frühere Pakete/Profile/Evidenzen bleiben erhalten.
Keine Mainintegration mit diesem Auftrag. Startquelle
`00c328dedeb097bf4abc50815773e2e7ae5da320`, Branch
`codex/standalone-export-usability`. Noch kein finaler RC172-Freeze oder Build-PASS.

## Ausführung (Quellimplementierung getrennt von finalen Endgates)

- [x] A/D: moderne interne XLSX-Autoren-/Kommentarrelationen eng validieren,
  deren native Texte/Autoren vor der Anonymisierung übernehmen; logische sparse
  Zeilen/Spalten, Zahlen-/Datums-/Prozentformate, keine Formelberechnung.
- [x] B: Word gridSpan/vMerge im begrenzten logischen Tabellenmodell, keine
  verschobenen Header-/Wertbindungen; fehlerhafte Spans bleiben verweigert.
- [x] SmartArt: tatsächliche interne Diagrammdaten, Hierarchie/Quellzuordnung,
  keine doppelte Data-/Drawing-Darstellung und keine orphan/external Freigabe.
- [x] C: PDF-Suchtext erhalten, native/OCR-Doppelung quellgebunden verhindern,
  räumliche Beziehungen/Spalten verbessern, neue Bildtexte nicht pauschal löschen.
- [x] E: quellabhängiger Inhaltsmodus ohne technische Metadaten/Editorballast,
  begrenzte Leerraumdarstellung; Literal-TXT/MD/Code nicht bereinigen.
- [x] Bildvorkommen/Format/Ressourcen: Hashcache getrennt von Vorkommen,
  sequentielle Decoder/OCR und Gesamtarbeitsbudget getrennt von Spitzenspeicher;
  SVG/Raster-/Metafilekandidaten und konkrete Lizenz-/Sicherheitsgrenzen prüfen.
- [x] F: Schutz-/DRM-/Format-/Ressourcenstatus verständlich unterscheiden,
  keine Entschlüsselung/aktive Inhalte/externen Nachladungen.
- [ ] Synthetische positive/negative Gegenfälle, unabhängige echte Code- und
  Dependencyreviews; gezielte Nachprüfungen und vollständige Regression.
- [ ] Gemeinsamer Commit/Fingerprint/Quellenfreeze, frische lokale Headless-/
  Native-/Konverter-/Paketgates, beide normalen nativen Macconsumer, Artefakt- und
  Ganzlogprüfung, lokale Windowsübergabe/Testplan/Prüfsummen, GitHub-Pre-Release.

## Unveränderte Grenzen

Kein Universalversprechen für beliebig beschädigte/geschützte Formate. Keine
Developer-ID/Notarisierung/Schlüsselsuche, keine Abschaltung von Gatekeeper,
Hardened Runtime, Library Validation, Coreguard oder I/O-/Ownership-/Residual-
Prüfungen. Nur vorhandene approved statische Maccores wiederverwenden. Neue
Inhalte vor fachlicher Anonymisierung in dieselbe Positions-/PII-/Zuordnungskette.
Echte Nutzerdaten nur lokal ignoriert, niemals Fixtures/CI/Releaseassets.
Vollständiges Office-Rendering bleibt eine gesonderte Zusatzengine; nicht still
eine vorhandene Office-Installation voraussetzen. Keine unsichere Lizenzübernahme.

## Laufjournal

Start: keine eigenen Regression-/Buildprozesse aktiv, letzte Macläufe beendet,
RC171 als Pre-Release vorhanden. Nutzer-App RC171 auf dem Desktop geöffnet;
sie wird nicht bedient/geschlossen und ihr Profil nicht verändert. Drei eng
begrenzte Autoren parallel: XLSX, Word-Tabellen, PDF. Keine Peerkommunikation
oder Nachkommen. Hauptagent bearbeitet SmartArt/Officebild-/Integrationspfade.

Entwicklungscheckpoint (noch kein Freeze/Release-PASS): Native SmartArtdaten mit
Hierarchie und tatsächlicher interner Ownerbindung, native Excel-Kommentare samt
Autoren, logische sparse Zeilen/Zahlenformate und Word-Zellspans implementiert.
Read-only Privatquellenorakel: 54 Officeoriginale erneut unverändert; sechs zuvor
gestoppte Excelquellen sowie Word-Zellspanquelle jetzt nativ lesbar, Schutzdatei
präziser als geschützt verweigert. Im älteren Präsentationsgegenfall alle 19
SmartArttexte enthalten. Das ist kein OCR-/vollständiger Kontext-/Desktop-PASS.

Unabhängiger Word-Gegenreview: 42 eigene Parsergegenfälle, kein bestätigter
Grid-Deltablocker. Neue Office-Gegenfälle fanden fünf reale Fehler (SmartArt-only,
Namespacealias bei geerbtem Text, MC-Auswahl, aggregierte Vorkommens-/Cropbudgets,
verlorene PNG-Repräsentation); eng korrigiert. Zusätzliches MC im Diagrammmodell
wird bis zur Modellimplementierung mit konkreter unvollständiger Abdeckung
verweigert, nicht als zwei gleichzeitig gültige Graphen gelesen. Alte rote
Belege bleiben lokal erhalten. Gesamtpaket noch ungeprüft.

PDF-Gegenreview fand zwei reale neue Ansätze als unsicher: vorzeitiges Ausblenden
auf Grundlage derselben ToUnicode-Zuordnung und heuristische Spaltenumsortierung.
Beide entfernt. OCR bekommt das vollständige Originalraster, nur exakte
quellräumliche Doppelerkennung darf nach unabhängiger OCR entfallen. Keine
erfundene Korrektur falscher nativer Suchtexte oder automatische Tabellensemantik.
13 neue Layoutgegenfälle, 39 bestehende Layoutfälle und tatsächliche gepinnte
PDF.js-/Tesseract-ToUnicode-Gegenprobe bestanden; noch kein finaler Gesamtlauf.

Zusätzliche Grafikformate in Integration: begrenzte erste eigene GIF-/TIFF-
Reader, vorhandene Canvas1.0.7 für statisches WebP und streng geschlossenes SVG,
eng geprüfte Plain-GDI-EMF/WMF-Teilmenge über ausschließlich den Browserentry von
emf-converter4.18.1. 25 Adapterprüfgruppen tatsächlich bestanden, unabhängiger
Decoderreview und vollständige native Integrationsgates noch offen. Kein neuer
nativer Renderer/Developer-ID nötig. resvg-WASM/MPL-Kandidat nicht übernommen;
keine Lizenzfreigabe oder Macausführung daraus behaupten. Unbekannte Records,
EMF+, ungeprüfte Schriftzeichen, externe Referenzen und nicht unterstützte
Rastervarianten bleiben konkrete Auslassungen. Gebundene PNG-Alternative wird
einmal bevorzugt, SVG-only separat geprüft. Exakte Runtime-/Lizenzinventare und
beide Zielhostbelege vor Release erforderlich.

Weitere kausale Gegenreviews/Korrekturen: TIFF-FillOrder2 wird im unkomprimierten
1-Bit-Modell korrekt gelesen (andere Kombinationen ausdrücklich ausgelassen),
beschädigte unabhängige TIFF-Pixelströme verwerfen nicht die Folgeseite, EMF-
ETO_PDY verlangt vollständige ausgerichtete X/Y-Advances. 37 Adapterprüfgruppen
nach diesen Fixes tatsächlich bestanden; Autorbericht mit 31 Gruppen bleibt
als damaliger Zwischenstand unverändert. Finaler Integrationsgegenreview offen.

XLSX-ST_Xstring-Autoren/Kommentare werden einmalig vor Markdown/Privacy dekodiert,
Literalunderscore sowie Unicode-/Kontrollzeichengrenzen bleiben geschützt.
Datums-/Daueranzeige nutzt exakte Dezimalanteile und konsistentes Carry;
unmodellierte Teilpräzision fällt auf sichtbaren Rohwert+Format zurück.
59 neue echte Gegenfälle inklusive Privacy/Restprüfung bestanden. Die neuen
kompakten Quellkoordinaten dürfen Name-Header nicht vor der vorhandenen
Feldsemantik verstecken: echte XLSX→Privacy-Gegenprobe für kurzen Namen bestanden.

Analoger echter Word-Grid/Name-Gegenfall wurde separat bestätigt und korrigiert:
gapfreie identische horizontale Zellpartition bleibt als GFM-Tabelle mit
Bereichslegende gebunden (33 gezielte Wordfälle inklusive Privacygegenprobe).
Andere/vertikale Zellpartitionen bleiben als ehrliche Koordinatenlisten bei
Nur umwandeln lesbar. Neuer typisierter DOCX_TABLE_CONTEXT_UNVERIFIED-Beleg,
auch aus eingebetteten Wordteilen, stoppt dort die Anonymisierung bis zu einer
vollständig bewiesenen Feldbindung. Kein bloßer Markdown-Textregex, keine
Erlaubnis aus einem vorherigen Test-PASS. 20 Privacyfälle bestanden.

Ressourcenentscheidung: Einzelbildpeak bleibt 30MP, Sourcebytes/150-Assetgrenze,
300s/1GiB-Supervisor und harte Abbruch-/Isolationsregeln bleiben. Sequentielles
OCR-Gesamtarbeitsbudget ausdrücklich getrennt auf 120MP begrenzt, kleine Bilder
reservieren nur ihren Bedarf (Waterfill), übrige Assets teilen sich den Rest.
Keine gleichzeitige 120MP-Allokation. Zwei tatsächliche lokale isolierte
Präsentations-Entwicklungsproben benötigten 15s bzw. 36s mit 30MP/120MP-Budget;
Original unverändert, Kinder geschlossen, Ergebnisse privat/ignoriert.
Mehr fachlicher Grafiktext, aber weiterhin erhebliche unsichere OCR-Fragmente,
unbekannte EMF/SVG-Features und Auslassungen. Keine Artefaktfreiheit oder
vollständige Rekonstruktion behaupten. Während dieser Entwicklungsproben
änderten sich andere Quellen; deshalb ausdrücklich keine finalen Freeze-Belege.

Echte Windows-Office/OCR-Entwicklungssuite: 49 Gruppen bestanden, darunter zwölf
neue SVG/WebP/GIF/TIFF×DOCX/XLSX/PPTX-Proben mit echter lokaler Erkennung,
allen GIF-Frames, exakten Kontaktpositionen und anschließender Maskierung.
Vollständige frische Gesamt-/Native-/Konverter-/Paketgates und beide Macjobs
aus gemeinsamem finalem Commit/Fingerprint bleiben noch offen.

Weitere unabhängige tatsächliche Integrationsgegenfälle vor Freeze: Ein
Grafikloader-Pinfehler wurde fälschlich als Bildbeschädigung abgeschwächt;
extreme 1-Pixel-Streifen überschritten nach Achsenclamping den zugewiesenen
OCR-Anteil; verschachtelte uniforme Word-Tabellen verloren den Feldkontext ohne
typisierten Sperrgrund. Eng begrenzte Korrekturen und echte Gegenproben laufen.
Außerdem zeigt die vollständige native Konvertersuite einen PDF-OCR-Rückschritt
bei gezeichneten Buchstaben (CLOUD); ältere ToUnicode-Grüns widerlegen ihn nicht.
Keine finale Build-/Releasefreigabe ohne geschlossene Befunde und neue Endgates.
Die alte Chart/Layout-Testquelle hatte zusätzlich nicht schemaentsprechend
platzierte a:t-Knoten. Nur die synthetische Quelle wurde in echte
spTree/sp/txBody/a:p-Struktur korrigiert; bestehende Inhaltsassertionen blieben.

Main ergänzte einen echten weiteren Layout-Gegenfall: geerbte Tabelle bleibt
enthalten, aber ein nicht ausgewählter MC-Choice-Text erschien zusätzlich zum
Fallback. Sichtbar reproduziert und eng auf namespacetreue Branchwahl korrigiert;
keine Sprach-/Zeichenlöschung. Sechs Projektionsgegenfälle und 14 Diagrammfälle
danach grün. Nach Nestedfix führte Main die 35 Word-/20 Privacyfälle selbst
erneut erfolgreich aus; unabhängige Restkorrekturprüfung folgt vor Freeze.

PDF-Ursache auf identischem Raster belegt: AUTO3 ließ gezeichnetes CLOUD aus,
SINGLE_BLOCK6 liest es zusätzlich zur unabhängig erhaltenen nativen Prosa.
Eng auf den bereits vorhandenen SINGLE_BLOCK-Modus zurückgestellt, kein neuer
OCR-Pass/Retry/Limitaufschlag. 38 echte PDF-Visibility-Gegenfälle, vier isolierte
Converterfälle und fünf unveränderte bestehende Callbacks einschließlich des
ursprünglich roten Falls bestanden. Keine Mehrspalten-/Kurventextgarantie;
ein unsicheres OCR-Grafikzeichen im Gegenfall bleibt ausdrücklich dokumentiert.
Main startet anschließend die komplette native Konvertersuite als Vorabprüfung;
diese ersetzt keinen späteren unveränderten gemeinschaftlichen Endlauf.

Grafikloader nutzt jetzt das geschlossene harte Policyvokabular; endgültige
Rasterfläche wird nach Achsenclamping nochmals gegen den tatsächlichen Share
gebunden. Main las Korrektur/Gegenfälle und führte alle 41 Grafikgruppen selbst
erfolgreich aus. Pixelgeometrie teils echte Canvasprobe mit injizierter
Erkennungsgrenze, nicht als zusätzlicher Tesseract-/Mac-PASS dargestellt.
Unabhängiger finaler Korrekturgegenreview läuft; 492 Zeichenprüfungen und 157
permission-bound Nodekinder durch Autor nach Fix ebenfalls grün.

Vorbereitete RC172-Helfer sind ausschließlich neue Codekopien ohne alte FINALs
oder Desktopbelege. Testplan/Übergabetexte benennen nun ausdrücklich NOT_RUN für
agentische Desktoptests, die komplexe Word-Anonymisierungsgrenze und das 120MP-
Arbeitsbudget. Eine alte statische Helferassertion verlangte noch eine separate
GUI-Evidenzankündigung; eng auf ehrliche Desktop-NOT_RUN-Angabe korrigiert.

Weitere echte Feldbindungsgegenfälle vor Freeze geschlossen: eine 450×450 sparse
XLSX-Koordinatenliste sowie eine geerbte PPTX-Layouttabelle ließen einen kurzen
Name-Wert unmaskiert durch die Restprüfung. Bis zum vollständigen semantischen
Tabellenmodell bleiben diese Projektionen (wie komplexe/verschachtelte Word-
Tabellen) bei Nur umwandeln lesbar, autorisieren aber keine Anonymisierung.
Gemeinsamer neuer typisierter OFFICE_TABLE_CONTEXT_UNVERIFIED-Grund ersetzt
den noch unveröffentlichten DOCX-spezifischen Grund; die geschlossene Anzahl
27 bleibt. Äußere Anonymisierungsverweigerung PARSER_COVERAGE_UNVERIFIED.
Frischer privater Kontext pro Parser, kein Literal-/Wertregex und keine N×N-
Expansion. Ausgewählte MC-Scope auch im Notes-Profil, dort keine zusätzliche
Editorprompt- oder Whitespacebereinigung. 16 echte Quellengegenfälle bestehen
bei Main; sichere normale Tabellen bleiben maskierbar. Kanonisch und in beiden
Macjobs registriert, Headlessplan nun 298 statt vorheriger 297.

Main komplette native Konvertersuite nach PDFfix: 67/67 Gruppen, 0 übersprungen,
Exit0. Vorabstand während weiterer OOXML-Entwicklung, kein gemeinsamer Freeze-
Endbeleg. Unabhängiger Grafik-/Parenttransport-/PDF-Deltagegenreview danach ohne
bestätigten Restblocker, 21+5 eigene begrenzte Gegenproben; keine nativen
Launcher-/Tesseract-/Macausführungen daraus behauptet.

Vorbereitungshelfer-Gegenreview ohne bestätigten Aufnahmeblocker, 6 positive/
25 negative Validatorgegenfälle. Main ergänzt vor Freeze einen tatsächlichen
positiven 0-Fehler-Maclogabschluss der neuen Tabellenkontextsuite; neuer
verify-macos-review-Pin 70bacf41de1cda5090aba4ec4b739ca1e69ae33cb44f73060075aa6f46ef1826.
Eine eigene Pure-Receipt-VM hatte dafür den vorhandenen dynamicReceipt-Scope
nicht eingebunden; nur Testharness korrigiert und fehlende/Null/Fehler/
widersprüchliche neue Receiptnegativen ergänzt. Abschließend 648 Helferchecks
und separate Proofnegativen grün. Keine reale FINAL/VERIFY erzeugt.

Abschluss der begrenzten Quellgegenreviews vor neuem gemeinsamen Commit:
Alle bestätigten neuen Befunde eng korrigiert. Unabhängiger finaler Office-
Tabellenreview mit 24 tatsächlichen Quellen-/Privacyfällen, vier Fresh-Context-
Proben sowie sieben neuen Macreceiptgegenfällen ohne bestätigten Restblocker.
Die zwölf gezielten Autorensuiten einschließlich Frontend293/Workspace476
bestanden bei unveränderten Eingaben; Main las Berichte und aktuelle Deltas.
Notes-v1 des 450×450-XLSX bleibt nachweislich dichte, feldgebundene GFM-Tabelle
und maskiert Qvx korrekt; der neue harte Vorbehalt betrifft die ungebundene
content-v1-Koordinatenprojektion, keine pauschale Dateigrößenverweigerung.
Vollständige gemeinsame 298+11-/Native-/Konverter-/Paket-Endläufe und beide
Macartefakte bleiben zwingend offen. Kein Desktop-PASS, keine universelle
Format-/OCR-/Spalten-/Tabellenmodell- oder Anonymitätszusage.
