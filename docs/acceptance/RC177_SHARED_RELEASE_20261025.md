# RC177: Inhaltskorrekturen nach dem großen Nutzerlauf

Stand: 25.10.2026. Beauftragt sind Implementierung, unabhängige Fachreviews,
automatische Prüfungen und ein neuer gemeinsamer Test-Pre-Release für Windows
x64, macOS ARM64 und macOS Intel. Windows-ZIP zusätzlich lokal mit Testplan.
**In Arbeit; noch kein RC177-Kandidat oder Download veröffentlicht.** Desktoptests
übernimmt der Nutzer. Keine neue Automation, Main-Produktintegration,
Developer-ID, Notarisierung oder Änderung von OS-Schutzfunktionen.

## Umfang und Abnahme

Grundlage ist der [tatsächliche Laufvergleich](RC176_RUN_COMPARISON_AND_PERFORMANCE_BACKLOG_20261025.md)
mit 119 Eingaben. Originale, Eingabekopien, Ergebnisse und Diagnosen bleiben
unverändert und ausschließlich lokal; kein echtes Dokument in Git/CI/Release.
RC176-Pakete und ältere rote/grüne Nachweise werden nicht ersetzt.

| Arbeit | Erwarteter Nachweis |
| --- | --- |
| Excel-ST_Xstring | Typisierte, begrenzte sichtbare Projektion nicht druckbarer Escapes; Zellen/Indizes erhalten, rohe XML-Zeichen weiter streng. Beschädigte Feldbeschriftungen oder zerteilte sensible Werte schaffen keine neue Beibehalten-/Freigabeautorität. Zwei tatsächliche XLSX ergeben lesbaren Inhalt. |
| SmartArt | Tatsächliche Eltern-/Kindkanten einschließlich des Schemanormalfalls, geordnete Baumprojektion statt flacher Punktfolge. Allgemeine synthetische Graphgegenfälle und der unveränderte echte Graph. |
| SVG | Geschlossene lokale statische CSS-Teilmenge; begrenzte Selektoren, Kaskade und Vererbung. Keine Skripte, externen Ressourcen, allgemeine CSSausführung oder zusätzliche Systemrenderer. |
| PDF/OCR | Native Suchtexte behalten. Dopplungen nur mit exakter unabhängiger OCR und belegter gleicher Region entfernen. Regions-/Spaltenkontext und kleine Grafiktexte verbessern, ohne globale XYsortierung, Wörter aus Sollwissen oder pauschale Foto-/Zeichenfilter. Nutzen und Kosten gemeinsam messen. |
| Quellordnerlabels | Bereits eindeutige relative Labels bei gleichen Basenames und späterer Mehrfachauswahl erhalten; echte Kollisionen separat lösen. Windows-/Mac-/Normalisierungsgegenfälle. |
| Diagnose/Performance | Auslassung, Verkleinerung, unbekanntes/leeres/beschädigtes Medium und tatsächlich nachgewiesenen Schutz unterscheiden. Inhaltsfreie Unterzeiten statt unbelegter Beschleunigungszusage. |
| README | Verständlicher aktueller Einstieg, tatsächlich verfügbare Downloads, Umfang und Grenzen; RC177-Downloadlinks erst nach überprüfter Veröffentlichung. |

Die Inhaltskorrekturen gelten für die jeweilige Format-/Strukturklasse, nicht
für hart kodierte Kundendateinamen. Keine universelle Verarbeitungsgarantie.
Der getrennte Konverterprozess pro Quelle bleibt erhalten. Ein allgemeiner
persistenter Extraktionscache und paralleles `processBatchNext` sind nach der
Messung keine erste Maßnahme; BL-047.2/.5 bleiben gesonderte Folgearbeit.

## Freigabekette

Nach den begrenzten Implementierungen: Hauptagentenreview und unabhängige
Gegenreviews des tatsächlichen Produktionscodes; gezielte positive und negative
Regression einschließlich Anonymisierung/Nachbearbeitung. Danach gemeinsamer
Appcommit/Fingerprint und unveränderter Source-/Test-/Driverfreeze. Neue
create-only Belege für Gesamtregression, Windows-Native, Konverter und Paket;
beide tatsächlichen Mac-Consumer mit den bereits genehmigten statischen Cores.
Alte FINALs und Paketbytes sind kein Nachweis für den neuen Commit.

Vor Übergabe konkrete Windows-/Mac-Archive, Logs, Quell-/Architektur-/Seal-/
Prüfsummenbindungen gegenlesen. Anschließend lokaler Testkandidat mit ehrlichem
USER_PENDING-Desktopstatus und GitHub-Test-Pre-Release; Inventar, Tagquelle,
PreReleaseflag und remote nachgeladene Assethashes tatsächlich nachlesen.
Finder/Gatekeeper/TCC/Excel/Numbers und die reale GUI bleiben Nutzerabnahmen.

## Laufendes Journal

- 26.10., aktueller enger Umlautfolgefix vor Freeze: ein offizieller zusätzlicher
  best-German-/Standard-SIMD-Versuch ist ausführbar, behebt aber0/7gleiche
  Problemvorkommen und verliert weitere zuvor richtige Akzente; nicht übernommen.
  Neues reines Glyph-Kandidatenmodul verlangt ganze gleicheUTF16-Zeile, nur
  aouAOU→äöüÄÖÜ, exakte Wort-/Symbol-/Zeilenbindung, originale nichtüberlappende
  Box und stabilen Körper+Zweipunktbeleg in Originalpixeln. Begrenzte Arbeit,
  keine Wörterbücher, Zahlen-/Kontakt-/sonstige Lexikänderung oder Scoreanhebung.
  Alle Aggregate Seite/Block/Absatz/Zeile/Wort/Symbol konsistent; Inputimmutable,
  frische Pixelkopien genullt, ursprüngliche Pass-/Pixel-/Prozessbudgets erhalten.
  ReadingDisagreement bleibt auch bei Annahme; Rauschpunkte können pixelidentisch
  sein, deshalb keine Wahrheits-/Anonymisierungs-/ACK-Autorität.41reine Fälle,
  26Refinerflussgruppen,34bestehende Refiner-,21Office- und92Timingfälle PASS.
  Tatsächliche gespeicherte32Antworten wiederholen genau7richtige Vorkommen,
  verweigern2falsche französische Akzente und behalten jeden übrigen Textindex,
  Geometrien/Scores gleich. Noch kein frischer nativer oder gemeinsamer Endlauf.
  Unabhängiger tatsächlicher Implementierungsreview läuft; keine Releasefreigabe.
- Anschließender tatsächlicher Implementierungsgegenreview71ac3afa…741f fand
  zweiP2: unrepräsentierte Textreste/gleiche Zusatzzeilen konnten den falschen
  Textindex binden; bekannte Glyphen anderer Zeilen konnten dieselben Pixel
  besitzen. Beide eng korrigiert, ohne Erkennung oder Schutz zu lockern:
  ganze geordnete Container einschließlich ASCII-Trennlücken und Rest prüfen,
  globalen Original-Glyphpool≤20000 mit validen Boxen vor Pixelübernahme binden.
  Überlapp verweigert, bloße Randberührung erlaubt.26Flussgruppen mit fünf
  ursprünglichen Kausalgegenfällen und Poolgrenzen PASS; frischer gespeicherter
 32Antworten-Replay wieder exakt7richtigeVorkommen/2falscheAkzenteverweigert,
  alle übrigen Textindizes/Geometrien/Scores gleich. Unabhängiger Fixgegenreview
  9deb0f8c…1423 vollständig von Main gelesen: byteidentische alte20Beobachtungen
  konform, fünf ursprüngliche rote Fälle korrekt verweigert,101Fokusgruppen PASS,
  tatsächlicher gespeicherter Replay mit44konsistenten Aggregaten/7richtigen/2
  verweigerten Akzenten unabhängig gegengeprüft. Kein weiterer bestätigter
  Deltablocker. Neue gemeinsame Endgates/Pakete noch erforderlich; aktueller
  Plan327+11/381Produktdateien/645Test-, Script- und Workflowinputs.
- 26.10., Mac-Coretransport: Originalproducer39167676290 bleibt SUCCESS, hat
  jedoch keine herunterladbare Actions-Hülle mehr. Vorhandene Original-TARs
  vollständig gegen vier Mitglieder, importierte Bytes, kanonische Provenienz
  und bestehende Approval verglichen. Separater Buildinput-PreRelease423996893,
  Tagbuild-inputs-macos-core-7d0ee31-39167676290 aufOriginalquelle7d0ee31,
  beide Original-TARs vor/nach Veröffentlichung nachgeladen und gehasht. Kein
  neuer Corebuild/-seal/-import/Approval oder App-Release. Neuer geschlossener
  Source-Lock/GET-Helfer,76Gegenfälle und echte beide CLI-Downloads PASS;
  Workflow weitercontents/actions:read, unveränderte Import-/Seal-/ACLrollen.
  Eigener zusätzlicher Transportreceipt an konkretem Consumer/Core/Provenienz
  gebunden; neuer äußerer Macartefaktumfang genau5Dateien. Unabhängig entdeckte
  Vier-/Fünfer-Inventar- und alterStepname-Helferfehler eng korrigiert;26Inventar-,
  44Receipt-,78Pinnegative und131Helferchecks PASS. Alle sieben Pins vor künftigem
  Freeze erneuert. Original-Macgrenzen und USER_PENDING bleiben unverändert.

- Aktueller Qualitätsstand26.10.: private8Quellen-Vorprobe beendet8/8CONVERTED,
  352Original-/Kopie-/alteMDVektoren unverändert. Nach Probeende optionalen
  Metadaten-P2 eng behoben; unabhängiger Folgegegenreview729c0938…08cc bestätigt
  21Flow-/43Planer-/92Timingfälle plus6Originalpixel-/Wrappermodelle. Kein
  finaler gemeinsamer Freeze oder neuer Build. Tatsächlicher PPTX-Vergleich
  19a73693…3906 erhält alle45Nicht-OCR-Folienblöcke bytegleich, vier geprüfte
  Zahlen jetzt richtig, kleine Labels13/13und2/10. Weiter acht Labels fehlend.
  Gegenreviewad35585f…e843 bestätigt68/68Excelwerte und2097/2097nativePDFzeilen,
  meldet aber sieben verlorene zuvor richtige Umlaute im Bildscan durch
  entfallene Cropkorrekturen sowie weiterhin Dopplungs-/Spaltenrauschen.
  Diese neue Qualitätsabwägung bleibt vor Kandidatenfreigabe zu bearbeiten;
  kein pauschales Restore lexikalischer Ersetzungen oder Zeichenwhitelist.
  Vorprobe liegt vor dem späteren Metadatenfix, keine umetikettierte Endabnahme.

- 26.10.2026, Source03 in Umsetzung nach Ende aller Source02-Jobs.
  Source02/724b72e6: Native/8Konverter/5Paketgates und beide tatsächlichen
  Macs40247356580 inklusive read-only Byteverifikation PASS/stabil. Kanonische
  Gesamtregression ROT141/322; zusätzliche191Dateien-Restdiagnose mit genau
  einer weiteren veralteten Erwartung. Beschädigter ASCII-EMF-Dummy und
  No-Media-OCR-Fehlercode eng korrigiert, harte Leer-/Ownerguards bleiben.
  Kein Source02-Snapshot, Tag oder Release; alle alten Belege erhalten.
- Der private tatsächliche Acht-Quellen-Vergleich erhielt native Texte, bewies
  aber neue OCR-Zahl-/Rollenfehler. Kausal wirken Rasterwahl und eine schon
  zuvor lexikalisch überschreibende Zeilennachlese. Source03 behält Primärtext,
  Wortboxen und Scores; unterschiedliche Lesungen erhalten den geschlossenen
  Hinweis OCR_READING_DISAGREEMENT, keine Freigabe-/Exportautorität.
  Ein weiterer Office-Bitmapdurchlauf wird nur aus gemessener dichter
  Feinschrift, höchstens einmal2x und aus freiem120MP-Vollrasterbudget erlaubt.
  Grundanteile/Small2x bleiben reserviert, unbekannte Frameobergrenzen sperren
  Zusätze, Primär- plus Zusatzcanvas gemeinsam höchstens30MP. PSM6 ausdrücklich,
  keine bisherige Default3-Ursache behauptet. Gewöhnliche Office-Zeilencrops
  entfallen nach Textretention; gepaarte Kontaktcrops bleiben mit separaten
 32Pass-/200kCrop-/2MP-je-Aufruf-Caps.120MP sind keine Gesamtsumme aller Crops.
- Vorab Source03: Refiner34Fälle/93 gespeicherte Antworten replayt, Rasterplan43,
  Workerfunktionssequenz9synthetische Gruppen PASS. Enger unabhängiger
  Integrationsgegenreview60a363c7…7821 bestätigt beide Testkorrekturen und
 31Codeverträge/Reasonmaps, nimmt Child/Refiner/Raster nicht ab. Main-Fokus10/11
  grün; ein PDF-Parameterträger traf den ersten Officeparameter. Eng auf die
  echte PDFfunktion gebunden: unveränderte92Timing-/Cropfälle PASS, Rot bleibt.
  Weitere Produktionsgegenreviews, echter Originalvergleich und frische
  gemeinsame Endgates offen. Source03-Helfer create-only/124Quellenchecks und
  Vertragsnegative PASS; noch kein Freeze/Build/Download oder Desktop-PASS.

- 26.10.2026, Source01-Endlauf: d967838a243630c13d7244651eba4c2419c4a6a5
  tatsächlich gepusht/23:37:52.836UTC eingefroren. ProduktFP
  `1e0a2c571f380b30eb66fc9d9a39b05dedafa05b3b90f95a1d614bd5b3641e52`/376,
  638Tests/Scripts/Workflows, Manifest
  `c3465e8de6f973ea4be69e2950a4f517afcfdc14b9b85bd27d464bdc76cc918f`.
  Alle lokalen Jobs regulär/stabil beendet: Headless ROT37/322+0/11 bei altem
  Office-Captionorakel; Native PASS23:41:46.228UTC mit300Rust/3ignoriert,
  Clippy/Node-Rust/Release; alle acht Konvertersuiten PASS23:43:41.947UTC.
  Kein Source01-Paket oder Snapshot. Beide Macjobs40245585007 beendet ROT
  (ARM121326353670/Intel121326353686) bei derselben Diagnose-Spool-Testprobe,
  noch vor tatsächlichem Paketlauf. Beide Original-Logs gebunden erhalten;
  kein Produkt-/Core-/Signaturfehler daraus bewiesen, keine Veröffentlichung.
- Nach Ende aller Source01-Jobs ausschließlich sechs Tests eng nachgeführt:
  ehrliche Bildcaption mit zusätzlichem Verbot der alten Vollständigkeits-
  behauptung; drei feste30erCodeverträge samt expliziten beiden neuen Codes;
  PDF-Quellfunktions-VM mit innerem Importslice und tatsächlichem frischem
  Timingobjekt; kanonischer eigener temporärer Diagnose-Testroot und vollständige
  Env-Isolation/-Restaurierung. Spoolguard und Erfolgspflicht bleiben unverändert.
  Ein Aliasroot reproduziert im tatsächlichen Quellenmodell die Verweigerung,
  kanonischer Root funktioniert und verlinktes Kind bleibt verweigert. Die
  alten Mac-Logs enthalten keine TMPDIR-/UID-/Modusfakten: konkrete native
  Aliasursache bleibt führende Diagnose, kein nachträglich bewiesener Mac-PASS.
  Gezielte fünf Tests3/6/17/22/24 und Timing92 PASS. Erster vollständiger
  Fünf-Hunk-Gegenreview8d6a469e…61eb9 bestätigt alle alten Schutzassertionen/
  ursprünglichen roten Belege. Timingfixture-Gegenreview0d682fd8…609bb ebenfalls
  abgeschlossen:92PASS und alle vier Envwerte tatsächlich restauriert,
  ursprüngliche Budget-/Close-/Cancel-/Cropassertionen bytegleich. Produktbytes/FP
  unverändert. Source02 vorbereitet, keine alten FINALs kopiert; frischer
  gemeinsamer Commit/Endgates/beideMacs und erst danach geeignete Übergabe nötig.

- 26.10.2026, vor gemeinsamem Freeze: Diagnose-Framingrand eng behoben.
  Genau ein explizites RS-Byte gehört zum unveränderten2048Byte-Framebudget;
  Vendorbudget65536 und Streamcap67584 bleiben. Originale fünf Gegenfälle,
  92Fokus-/15Corefälle und44zusätzliche unabhängige Manipulations-/Chunkproben
  PASS; Parent/Child unverändert, keine neue Ergebnis-/Ownership-/Zeitautorität.
  Main las den abschließenden Gegenreview206524f7…41ab20. Kein bestätigter
  verbleibender Deltablocker; neue native gemeinsame Endgates bleiben nötig.
  Aktueller Umfang376Produktinputs/638Test-, Script- und Workflowinputs;
  tatsächlicher kanonischer Plan322Headlessdateien plus11Zusatzgates.
  124Helferquellenchecks/geschlossene Vertragsnegative PASS. Einheitliches
  Inventar einschließlich.github in Freeze/Headless/Native/Paket/Übergabe.
  Frühere Docheader-/Altneuerungstexte eng korrigiert;30Dokumentverträge,
  Links und kanonische110Entscheidungen/24Epics/134Stories PASS.
  Gemeinsamer Appcommit, frische Endbelege und Pakete folgen; Desktop USER_PENDING.

- 26.10.2026: README-Startseite auf GitHub-main tatsächlich aktualisiert,
  ausschließlich README und Release-Metadaten. Commit
  `4170c683bded197201377ebd4985b7930aa5c973`, Main-CI40242216266 SUCCESS.
  Main-Produktcode bleibt RC165; veröffentlichte Downloads sind RC176,
  RC177 bleibt Entwicklung. Kein Produktmerge oder RC177-Publikationsnachweis.
- Excelprojektion einschließlich ganzem konservativem Spalten-/Mergefeldschutz
  integriert. Unabhängig47Tests sowie fünf tatsächliche Store-/Replay-/
  Publikationsketten gegengeprüft; vier verfügbare Keep-Wege atomar verweigert.
  Zwei echte XLSX liefern wieder28/28 und40/40 native Zellen. Originale unverändert.
- SmartArt-Datenbaum geordnet; zusätzliche Texte technischer Präsentations-/
  Übergangspunkte bleiben getrennt erhalten, ohne erfundene Elternzuordnung.
  Der zwischenzeitlich unabhängig bestätigte Zusatztextverlust ist eng behoben;
  64Hierarchie- und14Diagrammfälle plus drei ursprüngliche Gegenmodelle PASS.
  Tatsächlicher BITMARCK-Datenbaum unverändert19Zeilen in Gruppen3/3/3/3/2.
- SVG statische lokale CSS-Teilmenge integriert;41echte Grafiken pixelgleich
  zum unabhängigen Backendmodell. Zwei nachgewiesene Backend-Sonderfälle
  (Opacity-Vererbung, sichtbare Kinder unter verborgenem Container) werden
  ausdrücklich als ununterstützt ausgewiesen. Keine allgemeine Browser-CSS-
  oder komponierte Office-Seitenrenderingbehauptung.
- PDF-Wortregionen binden echte Paint-/Glyph-/Farbbelege des lokalen PDF.js-
  Zeichenkontexts. Exakte OCR-Dopplung derselben Region wird unterdrückt;
  native Suchtexte und abweichender OCRtext bleiben. Hookv3/Derivation
  `02565baa5be042c2dc14e18fcd17ef8bff6e80761f1dd13894553189e67118d7`.
  Unabhängige15Raster-/Kontextgegenproben und41Visibilityfälle PASS.
  Zwei echte PDF-Seiten separat verglichen: weniger native/OCR-Dopplungen,
  zusammenhängendere Scanabsätze; AUTO kann zugleich neue Randzeichen wie
  `nm` oder `}` erzeugen. Kein allgemeiner Qualitäts-/Geschwindigkeitsgewinn
  oder vollständiger neuer119Dateienvergleich behauptet.
- Medienplaner reserviert echte kleine Vektorkosten vor Fairshare und verwendet
  nur freien Rest für2×kleine Raster.120MPgesamt/30MPproAsset bleiben;
  Kontaktausschnitte stammen weiter aus den Originalpixeln. Verkleinerung und
  zusätzliche Font-/Quellunsicherheit werden unabhängig als Hinweise erhalten.
  Neue geschlossene Unterzeitdiagnose ohne Inhalte/Pfade eingeführt.
- Erste echte Windows-Konvertersuite im ungecommitteten Stand ist regulär
  beendet23:18:43.641UTC: PASS, Inputs unverändert. Das ist Vorabintegration,
  kein finaler Commit-/Paketnachweis. Der letzte Diagnosegegenreview bestätigt
  noch einen Randfehler:65536zulässige Vendorstderrbytes ohne LF plus eigener
  Metrikframe lösen fälschlich CONVERSION_OUTPUT_LIMIT aus. Enger Gegenfix/
  unabhängige Revalidierung vor gemeinsamem Freeze erforderlich. Frühere rote
  und grüne Belege bleiben erhalten; noch keine RC177-Archive veröffentlicht.

### Frühere Zwischenschritte

- Eindeutige Quellordnerlabels werden bei gleichen Basenames nicht mehr
  verkürzt. Echte Labelkollisionen beachten NFC/Großschreibung und bereits
  belegte andere Labels. Gezielter Direct-Picker-Test: 14/14 PASS mit gepinntem
  Node22.23.2; noch kein vollständiger Endnachweis.
- Drei unabhängige begrenzte Implementierungen für Excel, SmartArt und SVG
  laufen getrennt. Keine Desktopbedienung und keine neuen Gesamtbuilds.
- Ein neuer negativer Exceltest reproduziert vor Integration einen Restwert
  nach eingefügtem Steuerzeichen. Dieser Befund bleibt blockierend, bis der
  konservative ganze Quellfeldschutz integriert und gegengeprüft ist.
