# RC177: Inhaltskorrekturen nach dem großen Nutzerlauf

Stand: 26.10.2026. RC177 ist als Test-Pre-Release für Windows x64, macOS ARM64
und macOS Intel veröffentlicht; das Windows-ZIP liegt zusätzlich lokal mit
Testplan bereit. Die automatisierten Endprüfungen und unabhängigen Reviews sind
abgeschlossen. Desktoptests übernimmt der Nutzer. Keine neue Automation,
Main-Produktintegration, Developer-ID, Notarisierung oder Änderung von
OS-Schutzfunktionen. Die älteren Journalabschnitte unten dokumentieren
Zwischenstände und sind keine offenen Endgates.

## Abschluss und verbleibende Abnahme

- Gemeinsamer Appcommit `fc39f820bd6e3c9528ffad911eada5aee20c56cb`,
  Produktfingerprint `1df160c305aa7b2740e6261075ce7fa5a09ade3f3ee75f48debe65db3c82b5a4`
  (382 Produktdateien). Vier lokale Endgates PASS und unveränderte Inputs:
  328/328 Headless plus 11/11 Zusatzfälle, Windows Native mit 300 Rusttests
  (3 ignoriert), acht Konvertersuiten sowie fünf Paketgates/100 Markdownfälle.
- Beide Mac-Consumer im GitHub-Run `40317861812` erfolgreich. Beide Archive
  wurden aus demselben Appcommit gesammelt, bytegebunden verifiziert und
  unabhängig anhand der tatsächlichen Logs und Artefakte gegengelesen.
- [GitHub-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc177):
  ID `424250166`, 20 Assets, `prerelease=true`, `draft=false`; Tagquelle,
  Inventar und alle nach Veröffentlichung frisch geladenen Assethashes PASS.
  Lokale Übergabe: `C:\Users\arkud\Documents\Software DataSecure\RC177`
  mit ZIP, `WINDOWS-TESTPLAN.txt`, Prüfsummen und drei synthetischen Datenpaketen.
  Belege: `dist/rc177-content-context-source05-20261026`.
- README und `docs/RELEASE.md` wurden auf `main` ausschließlich als
  Dokumentationscommit `76d0626777a2b3cc34754e69114d628a09203d8c`
  aktualisiert. Main-Produktcode bleibt RC165. CI `40327933564` SUCCESS.
- Offen: tatsächliche Windows-/Mac-Desktopabnahme durch den Nutzer,
  einschließlich realer Finder-/TCC-/Gatekeeper- und Dokumentqualitätspfade.
  Die Macs sind ad hoc versiegelt, nicht mit Developer-ID signiert oder
  notarisiert. Spezialformate und OCR bleiben begrenzt; keine universelle
  Umwandlungs- oder Anonymitätsgarantie.

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

- Source05-Vorprüfung26.10.: ausschließlich2Zeilen in
  tests/test-office-visual-decoder.mjs ergänzt: tatsächliche Produktionsfactory
  createOfficeOcrWorkLedger importiert/mit bestehendem structuredClone-DTO-
  Übergang an VM gebunden. Keine Produkt-/Budget-/Policyänderung, sämtliche
  ursprünglichen Assertions unverändert. Vollständiger nativer58Gruppentest
  PASS11:45:46.185UTC/10Inputs stabil, Testhash0c30e1fd…36fe0. Tatsächlicher
  Bericht be48dd05…fc55c/Originaltest gesichert, Main prüfte Bericht und2Zeilen-
  Diff gegen echten Worker/Factory. Getrennter Quellaudit8d8e0308…3b53 fand in
  sieben anderen Konverterharnesses keinen weiteren bestätigten Closuremangel.
  Main führte zusätzlich16TIFF-/10EMF+-,33PDF-Struktur-/21passivePDFgruppen
  erfolgreich aus, letzter echter Childclose/4Inputs stabil. Nur Fokusbelege,
  kein kumulierter Endgate-PASS. Source05 braucht neuen gemeinsamen Commit/
  Freeze/alle frischen Endgates. Produktfingerprint1df160c3…82b5a4/382 gleich.

- Source04/4a94e521b27b119355800d9f717ce6b8e7baf7f5 eingefroren11:33:21UTC.
  Native300Rust/3ignoriert/Clippy/Node-Rust/Release PASS11:37:32.634UTC; Paket5/
  100MD0Fehler PASS11:41:59.261UTC. Quellen/646Inputs/7Driver unverändert.
  ZIP72ed040d…f9a01/EXEb5bbab10…46c50 bleibt unveröffentlicht. Konverter:
  PDF-Sichtbarkeit,76reale Workergruppen einschließlich der fünf ursprünglich
  roten Bildgegenfälle und Office-Bildsuite PASS. Vierter Test nach52Gruppen
  ROT: VM-extrahiertes officeImageMarkdown erwartet Runtime-Policyfehler,
  erhält aber ReferenceError:createOfficeOcrWorkLedgerundefined. Enger
  Testclosurefix wird gegen tatsächliche Produktionsfactory geprüft; keine
  Schutzassertion lockern/Produktursache erfinden. Main beendet eigene Jobs vor
  Quelländerung: Native41530/Converter40336/Package83610geschlossen, Headless
  95204gezielt nach Start75/328 gestoppt/keinFINAL. Mac40315874344beideJobs
  completedcancelled, tatsächlicheLogs/Run/Jobs/Stopdiagnose unter
  dist/rc177-source04-final-gate-failure-20261026, Inputs weiterhin unverändert.
  Source05 nur neue Helferquellen vorbereitet, keine alten FINALs übernommen.

- 26.10., Source04-Vorprüfung abgeschlossen: neuer reiner Wortpixel-Fallback
  5d3a0329…6e56 und Caller d5ca6b23…e68 behalten ursprüngliche Daten/Geometrien,
  gemeinsame32768Pixel, Kontakte und Literal-/Besitzerprüfungen.32 kontinuierliche
  Intensitätswerte (Spanne31) ersetzen bewusst drei phasenabhängige16er-Samples;
  alle geeigneten Fenster müssen gemeinsame Separatoren haben. Körper-/Zwei-
  Punkte-Prädikat bytegleich; weiterhin unsicher/reading_disagreement, keine ACK.
  Merge-/Split-Kompensation und pixelgleiches Rauschen bleiben ehrliche Grenzen.
  Tatsächlicher unabhängiger Review a1f7f1aa…1063:239 eigene Gegenproben sowie
  68Wort-/41Pixel-/32Flow-/34Refinerfälle PASS. Hauptagent las tatsächlichen Code
  und beide Berichte. Frische native fünf ursprüngliche Bildfälle5/5PASS/stabil
  unter dist/rc177-weak-image-source04-prevalidation-v3-20261026; Erwartungen
  Härtetest und beträgt42Prozent unverändert. Gespeicherter vollständiger Scan61-
  Refinerreplayv4 bestätigt7korrekte Umlaute/2falsche französische Änderungen
  verweigert, keine anderen Zeichen-/Metadatenänderungen/keine neue OCR.
  Frischer privater Achtlauf11:24:58.675–11:29:03.439UTC:8/8CONVERTED, alle acht
  MDs bytegleich zum vorher tatsächlich gegengeprüften Source03-Achtlauf;
  352Original-/Kopie-/AltMD-Bindungen und Quellinputs unverändert. WIP-ProduktFP
  1df160c3…82b5a4/382, kanonisch328+11,646Test-/Scriptinputs. Noch kein Source04-
  gemeinsamer Commit/Freeze/Endgate/Paket/Release. Keine privaten Dokumente in
  Git/CI/Release; nächste Schritte frische gemeinsame Endgates und beide Macs.

- Neuer verbindlicher Endstand26.10.: gemeinsamer Source03-Appcommit96391e3425c41f8797ef2cee238e79dd2896c01c,
  FP897af9b1…5940a/381 und645Test-/Scriptinputs, Manifest06dbe7d9…af7c76,
  ist NICHT freigabefähig. Native300Rust/3ignoriert/Clippy/Node-Rust/Release
  PASS/stabil09:59:43.222UTC. Paket5/100MD0Fehler PASS/stabil10:04:39.484UTC;
  ZIP8abe5246…fe9f7, EXEaeee8a5f…2bc57 unveröffentlicht erhalten. Konverterkampagne
  native-regression-4hCLIQ ROT nach43Gruppen im zweiten Testfile: quality009clean
  JPG verliert ä in Härtetest, unveränderte positive Erwartung bleibt bestehen.
  ARM121505983138 im frischen40303228659 reproduziert denselben Fehler10:06:17UTC;
  Intel121505983107 gezielt danach cancelled. Beide echten Joblogs/Metadaten
  gesichert, keine späteren App-/ZIP-/DMG-PASSbehauptungen. Headless nach Start79/
 327 gezielt beendet; ABORTED-HEADLESS diagnostisch, kein FINAL/kein Gesamt-PASS.
  Keine Inputs während Jobs verändert; alle Freezejobs beendet, keine Duplikate.
- Gesonderte frische8Quellenprobe auf genauSource03 endete10:00:11.176UTC mit
  8/8CONVERTED/stabilenInputs/352unverändertenOriginal-Kopie-AltMD-Bindungen.
  Gegenreview7dd252d9…5090 von Main gelesen: sieben bekannte Scan61-Akzente und
  sechs zusätzliche PDF119-Akzente originalkorrekt; zwei falsche französische Ö
  verweigert, echtes Ô weiterhin fehlend.2097/2097nativePDFlinien auf93Seiten,
  68Excelwerte und45PPTX-Blöcke/vier Zahlenkontrollen über exakte Quellen-/MD-
  Identität erhalten. Kein vollständiger119Dateien-/Anonymisierungs-/Desktop-
  oder allgemeiner Artefaktfreiheitsnachweis, widerlegt JPEG-Regression nicht.
- Begrenzte tatsächliche JPEG-Ursachendiagnose8da9f7c8…85bb: eine Primärlesung+
  sechs bestehende Crops, aktueller Primär-a-Bereich221..232 überlappt H/r und
  verpasst den zweiten Punkt. Korrekte Crop-Lesung vorhanden, aber zusätzlicher
  einzelner Crop-Metadatenversuch7c8d3373…a0ee1 liefert ebenfalls falsch
  überlappende ä-Box218..232. Wort-/Zeilenflächen dagegen exakt gebunden.
  Reine Oberkantenänderung oder direkte Cropglyphübernahme sind keine Lösungen.
  Noch kein neuer Produktfix; vollständige bounded Wortpixel-Aufteilung als
  nächster Machbarkeitskandidat. Source04 enthält nur17create-onlyHelferquellen,
  131Helferchecks/Vertragsnegative PASS, keine alten FINALs kopiert, kein Freeze.

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
