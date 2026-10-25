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
