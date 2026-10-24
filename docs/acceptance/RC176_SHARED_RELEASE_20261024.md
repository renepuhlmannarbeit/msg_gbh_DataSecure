# RC176 – priorisierte Inhalts- und Grafikverbesserungen

## Auftrag / Grenzen

24.10.2026 ausdrücklich beauftragt: priorisierte Verbesserungen aus
GOAL_COVERAGE_REVIEW_20261024.md für Windows x64 und macOS ARM64/Intel umsetzen,
technische Schutzprüfungen erhalten, mit unabhängigen Fachreviews testen und
einen neuen RC176-Test-Pre-Release bereitstellen. Desktoptests beim Nutzer.
Keine Mainintegration; RC175 und alle älteren Archive, Profile, Nutzerläufe,
Originale und positiven/negativen Belege bleiben erhalten.

Ziel: mehr tatsächlich belegten, lesbaren Originalkontext übernehmen, sichere
Teilverarbeitung mit ehrlichen Auslassungen, offline und unveränderte Originale.
Quell-/OPC-/ZIP-/PII-/Feld-/Residual-/Trace-/Keep-/I/O-/Prozess-/Ressourcengates
gelten für jeden neuen Text genauso. Kein universeller Reader oder pauschales
Löschen gültiger Sprachen/Suchtexte. Kein Ausführen von Officefeldern, Makros,
Links, externen Workbooks, PDFaktionen oder Cloudaufrufen.

Zusatzauftrag24.10. im laufenden Review: Umsetzung auch gegen Coding-Standards
und Best Practices revalidieren, ausdrücklich keine Verschlimmbesserung.
Vor Freigabe unabhängiges tatsächliches Gegenlesen zu Zuständigkeiten,
Datenmodellen/Ownern, geschlossenen APIs, Fehlerklassifikation, Determinismus,
Ressourcen-/Komplexitätsgrenzen, Plattformneutralität, Provenienz und selektiven
Regressionstests. Relevante offizielle Format-/APIquellen heranziehen. Neue
bestätigte Befunde vor Freeze/Release kausal korrigieren und nachprüfen. Nutzer
hat ausdrücklich klargestellt: Auch Schutzprüfungen und Tests dürfen geändert
oder ersetzt werden, wenn es den Produktzielen dient. Veraltete, doppelte oder
unnötig blockierende Regeln fachlich bewerten; Nutzen, Auswirkungen auf
Sicherheit/Vollständigkeit und passende Gegenbelege dokumentieren. Unveränderte
Regeln sind kein Selbstzweck; bloße Grünfärbung ist kein fachlicher Nachweis.
Keine pauschale neue
Architektur-/Stilumbau- oder Zertifizierungsbehauptung; Desktoptests Nutzer.

## Geplante Umsetzungspakete

1. Optionale PDF-Strukturbaum-/MCID-/Seitenbindung für eindeutige vollständige
   Textreihenfolge und beweisbare Tabellenzellen. Taglose/inkonsistente Modelle
   bleiben im bisherigen Draworderpfad mit ehrlichen Hinweisen, keine globale
   XYsortierung. Native Suchtexte/Iteminstanzen nicht verlieren oder erfinden.
2. Häufige TIFF-Scanvarianten: streng begrenztes LZW und CCITT1D/Group3/Group4
   sowie Orientierungen2–8, echte Pixel-/Endian-/Strip-/Seitengegenfälle und
   unveränderte Gesamtbudgets. Kein FirstFrame-Erfolg und kein permissives
   Füllen beschädigter Streams. BigTIFF/weitere Sondermodelle separat ausweisen.
3. Word: gespeicherte Feldresultate ohne Codeausführung, explizite Revisionsansicht,
   echte Nummerierung/Start/Neustart/Stylebindung, eindeutige Kommentaranker/Autoren.
   Generierte Nummern sind keine erfundenen Originalfeld-/Identitätsbelege.
4. Excel: klassische Kommentarzelle/Autor, RichValue/Bild-in-Zelle aus tatsächlicher
   Metadaten-/Zell-/Medienkette, belegter Tabellen-/Pivotkontext ohne unselektierte
   oder ausgefilterte alte Cachewerte als neuen Quelltext auszugeben.
5. Officegrafiken: geschlossene EMF+-Teilmenge und tatsächlich gebundene
   Vorkommensgeometrie prüfen/ergänzen. Netzwerk-, Objekt-, Font- und Pixelgrenzen
   unverändert. Keine pauschale Freigabe permissiver Drittdecoder.
6. Größere LibTIFF-/PDFium-/LibreOffice-/Docling-/Markerpfade bleiben isolierte
   Vergleichskandidaten. Aufnahme nur mit tatsächlichem Nutzen-/Provenienz-/
   Lizenz-/Modell-/Isolationsnachweis auf allen drei Zielen; nicht bloß installieren
   oder fremde Bibliotheken in den gehärteten Core laden. Kein neues Applekonto,
   Developer-ID/Notarisierung, Gatekeeper-/HardenedRuntime-/LibraryValidationbypass.

## Arbeitsstand

AusgangsHEAD c81e9608b465d810a5da253af61599aa5edf347e, RC175-Tag/Appcommit
223a04f54bc4fcfb2a95f12807685ed764ec6f0c. Vor Start keine laufenden eigenen
Build-/Testprozesse im Releaseworktree; letzte Macjobs regulär beendet.
Zwei begrenzte Fachautoren arbeiten an getrennten PDF-/Wordmodulen; Main
integriert und bearbeitet Grafik/Excel. Dritter neuer Agent konnte wegen
Threadlimit nicht starten, kein erfundener unabhängiger Excel-PASS.

Noch kein RC176-Quellenfreeze, gemeinsamer Endcommit, Endnachweis, Paket oder
Release. Nach Implementierung unabhängige Produktionsquellengegenreviews,
frische Gesamt-/Native-/Konverter-/Paketgates, beide Macs am gleichen Freeze,
reale Logs/Archive prüfen, Windows lokal create-only mit Testplan, danach
Remoteinventar/Tagquelle/Hashes/PreReleaseflag vor und nach Veröffentlichung.

## TIFF-CCITT-Primärquelle und Anpassung

Der byte-only Decoder wird aus Mozilla PDF.js v5.4.449 src/core/ccitt.js
abgeleitet: Commitf44e5f0e63237a7cfb3b591b0b011d2abe27b036,
Gitblob8a57a5dbe46ed54e7569ce24fc2eac0a02c58cce, Apache-2.0,
Copyright Mozilla Foundation/Glyph & Cog. Kein PDF.js-Downgrade: das Produkt
behält PDF.js6.2.108 unverändert für PDF, nur dieser geschlossene reine
JavaScript-Stripdecoder ist eine separat ausgewiesene strikte Ableitung.
Warn-/Recoverypfade, erfundene EOF-Runs und unbestätigte Bitüberläufe werden
verweigert, Operationen/Zeilen/Ausgabebytes begrenzt. Ganze aktuelle Lizenz
und Herkunft müssen im Paket mitgeführt werden. Quellenmodell/Fixtures sind
kein nativer Windows-/Mac- oder menschlicher Desktop-PASS.

Primärquellen: [TIFF6](https://download.osgeo.org/libtiff/doc/TIFF6.pdf),
[LibTIFF-Kompressionsabdeckung](https://libtiff.gitlab.io/libtiff/specification/coverage.html),
[gepinnter Decoder](https://github.com/mozilla/pdf.js/blob/f44e5f0e63237a7cfb3b591b0b011d2abe27b036/src/core/ccitt.js).

## Vorprüfungen / ehrliche Grenzen

TIFF: unabhängige Pillow12.3.0/LibTIFF4.7.1-Pixelorakel für LZW, CCITT1D,
G3/G4, G3mixed/FillBits sowie beide Endianmodelle/FillOrder und alle acht
Orientierungen grün. Eigene erste Schwarz-Weiß-Zuordnung war invertiert und
wurde kausal korrigiert; unveränderte unabhängige Pixelhashes danach passend.
16 gezielte neue TIFFgruppen und unveränderte43Grafikgruppen PASS. Noch kein
Endlauf-/Paket-/Macnachweis. Operationbudget bleibt harter Ressourcenfehler.

PDF-Projektionsvorprobe war nach4Gruppen ROT: eigene neue Assertion erwartete
faktisches HTTP/2 in einer Tabelle ohne echte Headerautorität unverändert nach
Anonymisierung. Bestehende gemeinsame Tabellenpolicy schützt dort korrekt die
unsichere Name-Spalte konservativ. Keine Schutzlockerung: Assertion beschreibt
nun dieses tatsächlich begrenzte Modell; bei echter THead-Bindung bleibt der
Fachwert unverändert. Rohtext wird in beiden Modellen vollständig übernommen.

Unabhängiger tatsächlicher TIFF-/EMF+-Review fand drei P2 und eine P3 in der
neuen Vorimplementierung. Unveränderte rote Belege unter
dist/rc176-tiff-emf-independent-review-20261024 erhalten. Main hat TIFF2/T6-
EOL-Recovery gesperrt und echte T4-FillBits-Byteausrichtung hinzugefügt; die
konkreten Fehlbytes werden jetzt verweigert, gültige Kontrollbytes bleiben grün.
DrawString wird vor dem Backend explizit ausgelassen, weil der gepinnte Renderer
LayoutRect-Breite/Höhe ignoriert. Keine erfundene EMF+-Textunterstützung; plain-
GDI-Text bleibt separat geprüft. Kurzer EMF+-Record heißt beschädigt statt
Ressourcenlimit. Unabhängigen tatsächlichen Fixgegenreview vollständig gelesen:
20 unveränderte kausale Gegenorakel PASS, fünf Produktpins währenddessen stabil;
FIX-RECHECK.md SHA f4e2b5f3ca60f8a690cab28b9494818f182d502b2843dd8b3b3b2f8572417452.
Keine universelle EMF-/TIFF-/Native-Paketfreigabe daraus ableiten.

Office-Vorkommensgeometrie wird quellgebunden als beschreibender Kontext
übernommen: Ausschnitt, Rotation/Spiegelung und Gruppierungs-/Kompositionslücken.
Kein vollständiger neuer Office-Seitenrenderer. OCR liest weiterhin die ganze
Quellgrafik und benennt diesen Unterschied ausdrücklich; native Suchtexte
werden deshalb weder gelöscht noch als visuell falsch erklärt.

PowerPoint-Kommentarvorprobe: neuer XMLreader akzeptierte zunächst eine
numerische NUL-Referenz; derselbe negative Gegenfall ist nach zentraler
XML1-Zeichenvalidierung auf dekodierten Werten grün. Spätere eigene Assertion
erwartete fälschlich Backslash-Ampersand statt des bestehenden Literal-Renderers
&amp;-Escape; nur neue Assertion angepasst. Zehn eigene echte OPC-/Beziehungs-/
MIME-/Autoren-/Antwort-/Unicode-/SourcePrivacy-/Trace-/Publikationsgruppen PASS.

Ein unabhängiger Produktionsgegenreview fand danach P1 bei schwachen expliziten
Name-Feldern in Kommentaren und P2 bei traversierten fremden/MC-Wrappern. Die
Original-REDs bleiben unverändert. Echte Absatz-/Titelbesitzer werden jetzt in
normale Quellinhaltszellen projiziert; Reader traversiert nur tatsächliches
txBody→a:p→r/fld→t/br. Fremde/MC-/verschachtelte Absätze werden nicht gemeinsam
als ausgewählte Quelle ausgegeben. Frischer unabhängiger Gegenreview mit dem
originalen ZIP und sieben echten Ketten schließt diese beiden Befunde:
PPT-FIX-RECHECK.md SHA33511b79…ccaf42. Ausdrücklich KEIN Faktenerhaltungs-PASS:
steht nach `Name:` im selben Absatz über a:br noch `FHIR REST 123`, maskiert der
unveränderte Whole-cell-Schutz konservativ auch diesen Nachsatz. Eigenständige
echte Absätze bleiben getrennt; keine Residual-/Keep-Lockerung zur Kosmetik.

Der gleiche Gegenreview belegt einen weiteren P2 im tatsächlichen Worker:
getStructTree vor dem neutralen nativen Checkpoint kann bei einem gewöhnlichen
Lookupfehler schon gelesenen Seitentext verlieren. Funktions-VM und gepinnte
PDF.js-Transportquelle belegen den Pfad, kein erfundener nativer BadPDF-Repro.
Enger Checkpointfix vom Main vollständig quellen-/testseitig gelesen: neutraler
validierter BASE vor optionalem Lookup, höchstens ein abschließendes UPDATE;
gewöhnliche optionale Transportfehler behalten den neutralen Text als beschädigt
und unvollständig, echte Ressourcen-/Abbruch-/Policyfehler bleiben Producerfehler.
23 neue Produktionsfunktions-VM-Gruppen bei Autor und Main PASS, keine Änderung an
Checkpoint-/Supervisor-/Item-/OCR-/Paintgrenzen. Native Endgates bleiben offen.

Excel: neuer eigentlicher content-v1-Consumer übernimmt die tatsächlichen
Kommentarzellen/Autoren, TablePart-/Pivot-Quellkontexte sowie lokale RichValue-
Zellbilder aus geschlossener vm-/Metadaten-/Index-/Owner-/MIME-Kette. Keine
Formelberechnung, Netzwerk-/IMAGE()-Auflösung oder alten Pivot-Cachewerte.
ConsumedParts wird nicht als Coverage-Freigabe verwendet. Echte Bildquelle und
Zelle bleiben für OCR getrennt vom Alttext; Alttext ist kein OCR-Nachweis.
Unabhängiger tatsächlicher XLSX-Gegenreview fand P1: sichtbare Kopfzeile0, reale
TablePart-Spalte7/Name, WerteQzx/Qzy blieben als neutrale Blattwerte ungeschützt.
P2: CalcOrigin10 lag außerhalb des offiziellen0..9-Modells. Originale ZIPs und
rote Publikationsbelege erhalten. Begrenzung9 und echte Range-/Spalten-/Zell-
Feldkopplung schließen diese Originale, der erste unabhängige Recheck fand aber
einen weiteren P1: defekter optionaler Kommentarautor entfernte die noch gültige
TablePart-Feldbindung. Kein altes Grün widerlegt diesen tatsächlichen Reopen.

Zweite enge Fixrunde trennt TablePart-Feldbindung durch parserinternen Tables-
only-Pfad von optionalen Kommentaren/Pivot/RichValues. Deren späterer Schaden
widerruft keine bewiesene Feldrolle. Bei unbewiesener TablePart-Bindung bleiben
Quellwerte unter konservativ generischer Schutzrolle, keine neue Identitäts-
behauptung oder Erlaubnis zur Veröffentlichung unbekannter Rohwerte. Das kann
bei kaputten Kontexten mehr maskieren, ist kein uneingeschränkter Faktenerhalt.
Originaltext bleibt in normaler Konvertierung einmal lesbar. 16 eigene aktuelle
Integrationsgruppen mit exakt ursprünglichen roten ZIPs, beiden Privacyprofilen,
Trace/Publikation/Keep sowie64Helper-/39OriginalTablegruppen PASS. Frischer
unabhängiger zweiter Fixgegenreview vollständig gelesen:17Gruppen PASS, sechs
echte Source→Privacy→Trace→Publication-/Keep-Ketten über general,
personnel_profile und applicant. Originale drei rote ZIPs unverändert erneut
geprüft, reale Name-Spalten geschützt, Preiswerte100/200 erhalten. Tatsächlich
defekte TablePart-Bindung bleibt für Anonymisierung im bestehenden Sourcegate
blockiert; nur normale Konvertierung erhält solche Rohwerte einmal. Kein
generischer Maskierungsfallback autorisiert unbewiesene Publikation.
FIX2-RECHECK.md SHAb344a344fa2eacf686bf43f1398fa0d9ec20891edde5381536f457f24a12d046.
Neue3Plattform-Endgates bleiben offen.
Frühe eigene Testsetupfehler sind unter rc176-xlsx-production-integration-
20261024/DEVELOPMENT-01.md getrennt, keine Produkt- oder Schutzänderung dafür.

Native Tests sauber getrennt: acht explizite Konvertersuiten einschließlich
realem PDF.js-Strukturbaum, TIFF/EMF+-Canvaspixeln; kein Import dieser nativen
Testressourcen in die kostenbegrenzte automatische Source-CI. Eigene erste
Registrierung hatte dies übersehen, vor CIstart korrigiert. Registrierung18/18
Main PASS, kein nativer Endlauf. Neue create-only Helfervorlagen unter
dist/rc176-content-context-source01-20261024; KEINE alten FINALs/Snapshots/
CHECKPOINTs kopiert. Acht Konverter-/inzwischen17semantische Belegfamilien sowie exakte
gelieferte CCITT-Quell-/Lizenzbindung implementiert und unabhängig gegengelesen:
16Syntax-/147Helperchecks und111zusätzliche Gegenproben PASS. Zielabhängige
komplette Noticehashes bleiben getrennt, gleicher Derivat-/Lizenzinhalt wird
architekturübergreifend verlangt. Veraltete Copyangaben vor Freeze korrigiert;
sieben echte Driverpins erst nach abschließender Vorbereitung berechnen.
REVIEW.md SHAced86409589a331f2875185b2290525fa28a388a995a5a76f63a1e3ebca63ec6.

Word-Autorenhandoff v6:188gezielte Fälle/3Syntaxprüfungen PASS/stabil. Echte
OPC-/Feld-/Kommentar-/Revisions-/Nummerierungsmodelle samt Source→Privacy→Trace→
Publication/Keep auf zwei Profilen integriert. Main las endgültige Änderungen;
zusätzlicher unabhängiger Produktionsgegenreview fand danach zwei echte P1
(siehe unten); kein Freeze oder alter Grünbeleg widerlegt diese. PUA-generierte
Fontlistenpräfixe ohne Glyphbindung und unbewiesene Textboxzählfolge werden
nicht erfunden, tatsächlicher Absatztext/echte Unicodebullets bleiben erhalten.
Kein Feldcode wird ausgeführt und gespeicherte Ergebnisse nicht neu berechnet.
Originale Kommentar-/Mathregressionen und eigene Harnessfehler bleiben rot
dokumentiert. Noch kein gemeinsamer Endlauf-/Paket-/DesktopPASS.

## Neue echte Word-Blocker und native Vorproben

Unabhängiger tatsächlicher Word-Gegenreview auf exakt den v6-Pins:
REVIEW.md SHA5cab831071b63605eff0d2f9b9d93590e96da6ccaaae9ad12505ee01dad27d80.
P1-A: ein realer Name-Wert über mehrere gespeicherte Felder im selben Absatz
wird durch zu kleine Feldresultat-Projektionsgrenzen getrennt; Qdy veröffentlicht
sich roh in acht tatsächlich erfolgreichen Privacy-/Trace-/Publikationsketten.
P1-B: gemischter Kommentarabsatz mit verschachteltem Textfeld umgeht den
String-only-Wrapper; Qdx/Qdy bleiben in zwei erfolgreichen Publikationen roh.
Originale ZIPs, Prüfprogramme und rote Endergebnisse erhalten. Wordautor behebt
nur echte Eltern-/Wertbesitzer im Parser/Renderer, keine Privacy-/Residual-/
Keep-Ausnahme oder stilles Weglassen. Frische unabhängige Fixprüfung erforderlich.

Main-Windowsworker-Vorproben create-only v1–v4 jeweils regulär beendet/stabil,
noch kein Endlauf. Drei falsche neue Harnessannahmen wurden eng korrigiert:
imageOcr=false nutzt native Text- statt Medienentrance und den tatsächlichen
SOURCE_COVERAGE_UNVERIFIED-Vertrag; PDF.js liefert einen echten hasEOL-Marker
in der Kopfzelle; direkte anonymizeMarkdown-API erwartet contentOptions oben,
nicht im fremden consumerOptions-Wrapper. Produkt/Schutzgates dafür unverändert.
Originale REDs/Diagnosen unter rc176-worker-preflight[-v2/-v3]-20261024 erhalten.

Zusätzlicher unabhängiger Native-Testgegenreview fand drei Orakellücken:
escaped gelöschter Word-Sentinel, PDFindexOf(-1) und identische XLSX-Testbilder.
Neue Tests verlangen jetzt auch fehlenden escaped Alttext, genau ein Vorkommen
beider Spaltentexte sowie verschiedene Bildhashes und eindeutige ALPHA-/BRAVO-
OCRtexte in ihrer eigenen C2-/D2-Sektion, jeweils ohne den Gegenwert.
REVIEW.md SHA9f7b86ae…d6242, keine Behauptung nativer Ausführung durch diesen
RAM-Gegenreview. Neuer frischer echter Workerendlauf bleibt erforderlich.

V4 erreicht alle drei neuen nativen Word-/PPT-/XLSX-/PDFproben, danach echtes
Bestands-RED: content-v1/xlsx im saved-/7-Sourcecapture mit
PARSER_COVERAGE_UNVERIFIED. Unveränderte alte Minimalfixture hat keine
Worksheet-MIMEoverride und auch keine TablePart/-beziehung; neuer strikter
Tables-only-Aufruf setzt dennoch OFFICE_TABLE_CONTEXT_UNVERIFIED. Main und
unabhängiger Gegenreview untersuchen die engste sichere Korrektur; keine
pauschale MIME-/Sourcegate-Lockerung und kein Freeze vor Auflösung.

Abschließender unabhängiger Ursachenreview empfiehlt ausschließlich die
fehlende exakte Worksheet-MIMEoverride in der alten synthetischen Fixture
zu ergänzen: FINAL-RECOMMENDATION.md
SHA9462b8f884dbe066b412ac537c1943192d39c27e519b3c1a818c08ac7d50f17a.
Main übernimmt diesen engen Testfix. Originaler1810Byte-ZIP/SHA201a02b8…49b und
V4FAIL bleiben erhalten; einzig CT-Override ändert die neue Testfixture,
Worksheet-/Relationshipbytes identisch. Kein tatsächlicher gültiger
Produktionsfall als Regression nachgewiesen. Der erwogene Produkt-NoTablefastpath
wird NICHT implementiert; strikte TablePart-/MIME-/Owner-/Sourcegates unverändert.

## Zusätzliche Best-Practice-Gegenbefunde / Stand vor Freeze

Word-P1-A/B Autorenfix abgeschlossen: echte Eltern-Wertpflicht über Feld-,
Math- und Textfeldgrenzen bis tatsächliches Absatzende; unabhängige innere/
folgende Absätze bleiben getrennt. Enger neutraler Math-Absatzmarker schließt
zusätzlich echten sicheren RESIDUAL_PII-Stop durch zwei unbeabsichtigt zusammen-
kompaktierte GFM-Tabellen.222Autorenfälle/4Syntaxprüfungen PASS/stabil,
FIX-AND-RECHECK.md SHA448f8dd0…887f71. Main las tatsächliche Änderungen und
prüfte22echte Source→Privacy→Trace→Publication-/Keep-Ketten plus2Kontrollen
create-only eigenständig; sieben originale ZIPs byteidentisch, keine Qdx/Qdy-
Offenlegung, unabhängige echte Faktenabsätze passend. Beleg rc176-word-main-
extended2-revalidation-20261024. Kanonischer Runner und beide Macjobs umfassen
neuen test-word-parent-scope.js; neue semantische Pflichtbelegfamilie hinzugefügt.

Neue Main-Breitenprobe zeigt echten RangeError unterhalb der vorgesehenen
Wordbudgets:140001Absätze in einer echten Tabellenzelle,841091Byte,
SHA5838dcea6721508d4ee79b93bcb89ba05fdde55b457546e47be876375431408e.
Vier Baumsuchen verwendeten Callargument-Spread über breite Kindlisten.
Iteratives Push erhält exakt LIFO-Reihenfolge statt unerwartetem VMargumentlimit;
gleiches Original liefert nun49MDzeichen und genau einen Quellsentinel.
Ursprüngliches200kStrukturnodelimit bleibt getypt. Zwei dauerhafte Gegenproben
ergänzt:36WordParentgruppen Main PASS, noch kein Gesamt-/Macnachweis.
Originaler RangeError unter rc176-word-width-diagnosis-20261024 erhalten.

V5 tatsächliche native Windowsworker-Vorprobe vollständig74/74PASS,
inputs_unchanged=true, Ende24.10.16:21:41.138UTC, Session59714 geschlossen und
Prozessinventar leer. Das gilt ausschließlich für deren Vorbytes vor weiteren
Korrekturen, nicht als finales RC176-/PDF-P1-/Paket-/Mac-/DesktopPASS.

Neuer unabhängiger PDF-P1 aus tatsächlicher gepinnter PDF.js-Quelle:
Tagprojektion trennt native Inlinekette `Name: Anna` + ` Berger` trotz unverändert
benachbarterMCIDs durch neue Absätze; Berger veröffentlicht sich bei erfolgreicher
Trace-/Publicationprüfung. Vier echte Kombinationen beider Profile/Modi sowie
RAMgegenfälle. OriginalPDF1259Byte/SHA593f53cf…401ef erhalten. REVIEW.md
SHA79fbccf745e3f1b6bfc02de75403c02f08b361188ae9e1e0104fdf89d2025fea.
Enger Quellgrenzen-/Fallbackfix durch Fachautor in Arbeit, keine Wortallowlist
oder Privacy-Ausnahme; frischer unabhängiger Fixreview erforderlich.

Zusätzlicher unabhängiger Coding-/Standardreview der fremden Office-/Grafikdeltas
findet zweiP2: optional kaputter PPTkommentar löscht gültige Folie aus Ownergraph
und verliert deren echtes OCRbild; XLSX liest Relationshipgraph proBlatt zweimal
quadratisch2*S*(S+1), tatsächlich bis80Blätter gemessen, kein erfundenerTimeout.
REVIEW.md SHA139c81b3…74f399. Getrennte Kommentarquarantäne und private proParse-
Sitzung/Ownerindex in Arbeit; keine globale staleMap, tatsächliche Quarantäne-
Mutationen invalidieren Cache, große ASTs nicht unbegrenzt festhalten.
Keine weiteren bestätigten TIFF-/CCITT-/EMF+-Blocker im begrenzten Gegenreview,
keine universelle Freigabe. Noch keine neuen Builds/Macjobs/Commits/Release.

PDF-P1 Autorenfix abgeschlossen und Main vollständig gelesen: tatsächliche
Projektionsowner pro Originalitem verhindern neue P-/Zellgrenzen durch native
Inlineketten; unbewiesene Aufteilung fällt ohne Textverlust auf den vorhandenen
Nativepfad zurück. Bestehende Label/Wert-Korridore außerhalb echter Tabellen
behalten denselben Besitzer. Keine Namenheuristik oder Privacy-Ausnahme.
OriginalPDF unverändert in beiden Modi/Profilen mit echter gepinnter PDF.js,
Source-/Trace-/Publication-/Keep-Kette nachgeprüft.102Autorenfälle/2Syntaxchecks
PASS/stabil, Struktur33/Projektion6/Checkpoint24/NativeText39. Bericht
FIX-AND-RECHECK.md SHAd590168d…da1cbf; frischer unabhängiger Fixreview bleibt
erforderlich. Keine Gleichsetzung mit Gesamt-/Paket-/Mac-/Desktopabnahme.

Zusätzliche Officegegenprobe findet bestehende Prosa-Feldlücke, nicht ein neues
Ownerdelta: tatsächlicher frühererHEAD-Parser und aktueller Parser veröffentlichen
`Name: Qvx / Qvy` in16Kombinationen beider Modi/Profile/OCRwahl unverändert.
Unabhängige zweite Minimal-TXT-Probe mit den tatsächlichen HEAD-Engine-/Feldpins
bestätigt4/4; Anna-Berger-Kontrollen werden dagegen erkannt. Originale roten
Source-/Trace-/Publicationbelege unter rc176-office-context-fixes-20261024 und
rc176-office-p2-independent-review-20261024 erhalten, keine stillen Namenswechsel.

Main ergänzt deshalb ausdrücklich den zentralen CONTENT-Prosa-Feldschutz:
nur echte abgeschlossene Zeilenpräfixe aus dem bestehenden Labelkatalog und
unterstützte Markdowncontainer, keine beliebige freie Satz-Inlinefundstelle.
Normale Entitäten zuerst, verbleibender ganzer echter Zeilenwert konservativ
FIELD_REDACTED ohne erfundene Identität. Echte Präfixpositionen bleiben geschützt;
unabhängiger Whole-value-Residual-/Keepcheck parst vollständige Werte statt der
Redaktor-Spans/Dictionary-/Reviewfreigaben. Ursprünglich importierte variable
Marker sind keine hier erzeugten Pseudonyme. GFMzellen/Legacy/echte nächste
Fachzeile bleiben getrennt; derselbe sensible Zeilenwert kann mehr maskieren.
28neue gezielte Gruppen inklusive12echter Source-/Trace-/Publication-/Keepketten
sowie unveränderte131bestehende Feldgruppen PASS/stabil, noch unabhängiger
Fixgegenreview erforderlich. Zwei anfängliche eigene neue Testannahmen ROT
behalten: Legacy hatte Unternehmen bereits separat erkannt; Tracekoordinaten
beziehen sich auf den normalen canonical/NFC-Quellstand, nicht dessen Vorbytes.
Keine Produktänderung für diese beiden falschen Harnessannahmen. Belege
rc176-prose-field-fix[-v2]-20261024. Keine globale Quellenfreigabe daraus.

Office-P2 Autorenpaket vollständig vom Main gelesen: PPT hält gültigen Slide-/
Bildowner bei reinem Kommentar-Modellfehler; echte Container/MIME/Encoding-/
Cancel-/Policy-/unbekannte Fehler bleiben separat. XLSX besitzt genau eine
synchrone private Session pro Parse, getrennte Table/Full-Ownerindizes und
Invalidierung nach Quarantänemutation sowie vor nachfolgenden Chart/Medienpässen.
Nur Kontrollbäume werden geteilt; große Blatt-/Kommentar-/Pivot-/RichValue-ASTs
bleiben transient. Nodebudget zählt gemeinsame Kontroll- plus aktuelle Payload-
Nodes. Originale80Blätter nun81 statt12960Relationshiplesungen, kein unbedingtes
Linearitätsversprechen bei wiederholten Schäden.119Autorenfälle PASS/stabil;
FIX-AND-RECHECK.md SHA3321d0ae…9596dd. Ursprüngliche16PPT-/OCR-Prosa-RED-Ketten
auf stabilen Main-Fixpins frisch16sicher maskierte Publikationen und16Keep-
Verweigerungen, keine optische OCR-/Nativebehauptung. Originale/alteREDs erhalten.
Neue22er-Session-/Isolationsprobe ist im kanonischen318erPlan und beiden Macjobs;
Pflichtbelege enthalten nun17semantische Familien. Unabhängige fremde Fixreviews
für Office, PDF, Word und Main-Prosa laufen vor gemeinsamem Freeze. Keine
RC176-Pakete oder Macjobs vorgezogen.

Konkrete bestehende Notesgrenze separat nachgewiesen: derselbe originale XLSX-
ZIP962031bc…7431 wird in notes-v1 ohne verborgene TablePart.Name-Feldrolle
ausgegeben; Qzx/Qzy publizieren sich bei alter und neuer Parserquelle in beiden
Profilen. Der aktuelle content-v1-Pfad schützt sie. Keine neue Sessionregression,
aber ausdrücklich kein pauschaler Notes-Privacy-PASS. Main prüfte tatsächlichen
Frontendstart workspace.js:841: normale Desktopstarts wählen fest content-v1;
neue Word-/Excelmodelle sind ausdrücklich nur dafür aufgenommen. Technischer
Legacy-/Notesvertrag bleibt getrennte Restabdeckung/Folgepunkt BL-049.7, Beleg
NOTES-BOUNDARY-RESULT.json unter rc176-office-p2-independent-review-20261024.
Nicht als behoben oder durch alte Grünzahlen widerlegt ausgeben.

Main las finalen unabhängigen Office-/Prosa-Gegenbericht vollständig:
REVIEW.md SHA990844beaa6ab57b7413388deb7fc02b01d72ef5db88aae1d1db49ea34e5f0a8.
26eigene Cache-/Owner-/Catchgruppen und10echte Privacyketten sowie39separate
Prosa-Beobachtungen ohne neuen Deltablocker; die vier unsicheren alten/neuen
Notesketten werden ausdrücklich nicht als PASS gezählt. Main zusätzlich
unveränderte50AutomaticPrivacy-/133chartEx-/36WordParentfälle Exit0 nach neuem
Prosa-Fix, Session95900 regulär beendet. Noch kein gemeinsamer Endlauf.
Erst stagedWhitespacecheck erfasste drei zusätzliche leere EOFzeilen in neuen
Dateien; je genau diese eine Leerzeile entfernt (CCITT und zwei eingebettete
XLSX-Testfixturemodule). Keine Tokens/Base64/ZIPbytes geändert, alter Derivathash
nicht als final ausgeben; neue Bytes werden im echten Freeze erneut gebunden.

Letzter unabhängiger Fremd-Fixbericht vollständig vom Main gelesen:
REVIEW.md SHA2e905f83968931d77eea8e9c0fc3f77be70d97a8e97952cfe62db2c1ab7b78f8.
Kein weiterer bestätigter Blocker der drei beauftragten Fixdeltas. OriginalPDF
in12echten PDF.js-/Source-/Publikationsketten, achtKeepverweigerungen; originale
WordZIPs in14Ketten plus2Kontrollen;32separateProsa-Kontrollen einschließlich
kausaler ausgeschalteter-Redaktor-/aktiverResidual-Gegenprobe. Frische252gezielte
Regressionen PASS/stabil, Wordbreitenkontrollen behalten das getypte Limit.
Die bestehende Notesgrenze oben bleibt offen und wird nicht zur produktweiten
Freigabe umgedeutet. Alle Autoren-/Reviewprozesse beendet. Umsetzung ist nun
für den gemeinsamen Appfreeze vorbereitet; neue318+11Headless-, Windows-
Native-/8Konverter-/Paketgates und beide Macjobs müssen diesen Stand erst noch
unverändert belegen. Keine Desktop-/Releasefreigabe aus Vorproben ableiten.

## Erster gemeinsamer Source01-Endlauf / enge Testkorrekturen

Appcommit452270b5c6f7ed8dd7644f2b99b99aaf2dad6faf gepusht; Produkt-FP
fea58e5d49a0f3def1e13e142662ec2d431c2ca35f0bb4cedcbd734c3c5b878e/368,
621Test-/Scriptinputs/Manifest7f2f5705…b1a87c. Alle drei lokalen Endjobs und
beide Macjobs inzwischen beendet. Originale FINALs haben unveränderte Inputs,
bleiben ROT und werden nicht umgeschrieben:

- Headless29/318+0/11, Ende17:06:40.516UTC: alte positive XLSX-Imagefixture
  deklariert Workbook, aber nicht die reale Worksheet-MIME. Exakter Typguard
  verweigert XLSX_STRUCTURE_UNSAFE. Konverterkampagne74Worker grün, danach
  gleiche Fixture ROT17:09:19.796UTC; spätere Suiten nicht erreicht.
- Native Prepare/Clippy/300Rust+3ignored grün; Node-Rust-Exportintegration477
  erwartet simulierten LostReceipt-Timeout, bekommt vorher AI_EXPORT_CONFLICT;
  Ende17:07:42.497UTC, Releasebuild nicht erreicht. Originalroot0oWeIk erhalten.
  Body/Hash passen, keine operationseigenen nativen Intent-/Stage-/Complete-
  Belege: kein erfolgreicher Publish, also nicht der künstliche Timeoutpfad.
  Einzelner nativer I/O-/Konfliktauslöser aus Originaldiagnose nicht beweisbar.
  Ein neuer enger unveränderter Prefixgegenlauf in frischem Root besteht beide
  LostReceiptketten; fehlende Reproduktion ist keine rückwirkende Ursache oder
  Reparatur. Inhaltsfreie eng begrenzte Testdiagnosen werden ergänzt.
- Mac40114508384 ARM120932939003/Intel120932939013 beide ROT: alter
  PDF-Funktions-VM-Test hat kein getStructTree-Testdouble. Beide echten Logs
  getrennt gelesen und gesichert; in-memory Ursachendiagnose zeigt genau diesen
  TypeError hinter PDF_EXTRACTION_FAILED. Kein nativer PDF-Corecrash daraus.

Erst nach tatsächlichem Job-/Prozessende enge Teständerungen: sechs Dateien/
sieben positive XLSX-Factorys deklarieren jeweils tatsächliche Worksheets,
dynamische Budgets alle Blätter. Fehlende/falsche MIME bleibt exakt negativ.
Zwei alte DOCX/PPTX-Doppel-ID-Orakel erwarten nun die echte getypte Control-
Owner-Verweigerung; Legacy bleibt1Anhang, XLSXstrict0Anhänge, actualPartial
alle3verweigert weiterhin denselben ambigen Container. Keine Union/Guardlockerung
oder Änderung negativer Originalbytes. Frisch184Gruppen+6Syntax PASS/stabil;
Bericht366752c3…60c8. Main las Bericht und tatsächlichen Diff vollständig.

Main korrigierte nur das PDF-VM: aktuelle getStructTree-Schnittstelle, echte
Layout-/Projektionsabhängigkeiten, nur plain Argumentcarrier realmübergreifend
rekonstruiert. Neue Tagorder-/untagged-/missingAPI-Gegenfälle, alte Budget-/
Policy-/Scope-/Unicodegegenfälle erhalten.19Teilgruppen+24Checkpointgruppen
MainPASS. Unabhängige Fixgegenreviews und frischer gemeinsamer Source02 sind
noch erforderlich; kein Produktdelta oder Endlauf-/Mac-/PaketPASS aus Vorproben.

PDF-VM-Fix unabhängig tatsächlich gegengelesen: f5df8d62…b7a69, Main las den
ganzen Bericht. Eigene19Gruppen PASS plus drei gezielte RAM-Mutationen korrekt
ROT (API fehlt, falscher Realmcarrier, No-op-Projektor). Tatsächliche gepinnte
PDF.js-API quellenbestätigt, keine Produkt- oder Native-Ausführung daraus.
Native-Test erhielt ausschließlich einen passiven geschlossenen256Eventring:
Aktion/Command/Modus/Status/Code/Sequenz und LostReceipt-Hookbools, keine Bodies,
Pfade/Bindungen/Identitäten/vendorErrortexte. Assertions/Runtime/Rust/180sBudget/
Retry unverändert. Genau ein frischer vollständiger Native-Exporttest auf
Testpin75714e4f…c650 PASS/ChildExit0/Closebestätigt, Root8ceGOm, alle großen
Kontakt-/Body-/Bindinggegenfälle erreicht.4von4Hooks nach erfolgreichem Publish;
alte Originalbelege8von8bytegleich. Main las ganzen Log/Diagnoserecord;10eigene
und6unabhängige Closedform-/NoLeak-/Ringgegenproben bestanden. Originaler
Source01-I/O-Auslöser bleibt ausdrücklich unbewiesen, kein behaupteter Fix.

Neue create-only Source02-Helfer vorbereitet, nur17Quellvorlagen übernommen,
keine FINALs/Prüfverdicts/Snapshots kopiert. Präfixe und7Pins frisch angepasst;
16Syntax-/155Helperbindungen und selektive Proofgegenfälle MainPASS. Produkt-
FP bleibt fea58e5d…b878e/368 unverändert,621Testinputs nun Manifest
da07a492b29ea8b7006bb04039c056c24d05c86bfde1d37cd30177d3ee2977cb.
Frischer gemeinsamer Commit/Source02-Endlauf bleibt für alle drei Ziele nötig;
Mac-Coreproducer/Approval nicht neu erzeugen, keine Mainintegration/GUI.

## Source02-Endstand und neue Standardskorrektur vor Source03

Gepushter gemeinsamer Source02 d39497abd61bbc07489e2bac9b5592f05b81183e,
Produkt-FP fea58e5d…b878e/368 und621Testinputs/Manifestda07a492…977cb.
Native300Rust+3ignored/Clippy/Node-Rust/ReleasePASS17:33:54.552UTC,
8KonvertersuitenPASS17:37:31.346UTC,5Paketgates/100MD0FehlerPASS17:39:19.844UTC,
alle Inputs unverändert. WindowsZIP113514113Bytes/SHA01f5181a87bf3c9a7569c926fc338bc3f16a6b201626b07c8f5bd598da0b18de,
EXE1ad2d1d739ea2629832dfaa1b2f04752c84f02cbd6e9a461f2bbd0e5d6a28bce.
Unabhängiger tatsächlicher Windowsarchivgegenreview vollständig gelesen,
REVIEW.md SHA2910a3e…12f8. Kein aktueller Source03- oder Desktopnachweis.

Headless endet18:08:35.157UTC116/318+0/11ROT, Inputs unverändert. Test117
Paket-Fingerprint-Builderfixture kopiert tatsächlichen Runtimecollector ohne
dessen neue statische TIFF-/CCITT-Abhängigkeiten. Importfehler vor echter
Markerprüfung, kein akzeptierter fremder Binärmarker. Original-Log/FINAL bleiben
ROT. Erst nach allen lokalen Jobenden und gezielt beendetem Macrun zwei echte
Source-copy-list-Einträge ergänzt; Assertions/Produkt/Budgets unverändert.
Unabhängiger Ursachen-/Diffbericht e165b684…4d68 vollständig gelesen; Main
ganze7Gruppen einschließlich6echter Windows-/Mac-Builder-VerweigerungenPASS.
Unabhängiger Restplan-Closureaudit f74e00a8…bc12 ohne zweiten bestätigten
TIFF-Importkopierfehler; das ist kein vorweggenommener Ausführungs-PASS.

Mac40116281775 ARM120938146426SUCCESS17:51:16UTC; unabhängiger ganzer
8113Zeilen-Loggegenreview ae61bbe8…971a gelesen. Verbleibender Inteljob
120938146414 auf exaktd39497a gezielt cancelled18:10:26UTC, da ein neuer
gemeinsamer Commit nötig ist; aktueller runstatuscompleted/cancelled. Originale
827301Byte-Intellog SHA8d25bb02a064cb54a5bc2367ec25bd35689c6560d2de9205b78055ded84375c0
separat erhalten. Kein alter Macartifact-Import, keine umgeschriebenen FINALs,
kein Source02Snapshot/Übergabe/Tag/Release.

Zwei zusätzliche diagnostische Restläufe, ausdrücklich keine Gesamtfreigabe:
117..216PASS, dann test-parsers90PASS1FAIL;218..318PASS+Extra1(DOCXlexical80/
10Protokollnegativen/33echtePermissionchildren)PASS, Extra2characterWorker
scheitert am selben freistehenden WordinstrText. Jeweils unveränderte Inputs,
Originale Ergebnis-/Log-/Driverdateien erhalten; spätere Extras nicht erreicht.

Unabhängige tatsächliche7Container-/112Token-/Entrancematrix plus32Kontrollen
vollständig gelesen: c34fe1b1…eba5. Kommentare-Positivfixture ist semantisch
unvollständig (w:p direkt unter w:comments). Ein zweiter Fall ist dagegen
eine echte neue Supportlücke: instrText außerhalb eines komplexen Feldcode-
Bereichs soll normaler Text sein, nicht pauschaler Strukturfehler. Main las
[FieldCode](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.fieldcode?view=openxml-3.0.1),
[FieldChar](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.fieldchar?view=openxml-3.0.1)
und [Comments](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.comments?view=openxml-3.0.1)
direkt. Den Literaltext nur aus der Testfixture zu entfernen würde diese Lücke
verdecken. Enger Wordfix nach abgeschlossenem Restlauf beauftragt: tatsächliche
Run-/Absatz-/Feldphase/UTF16- und Textleafbindung, normaler Source-/Privacy-/
Trace-/Keepweg, keine Ausführung oder neue Limits. Äußere Codephase darf durch
inneres Resultat nicht sichtbar werden; deleted-code/Legacy nicht pauschal
öffnen. Vollständig gelesener Fachplan bc650e26…a1bd7, Umsetzung/Tests noch offen.

Neue17Source03-Helferquellen create-only vorbereitet, keine alten Verdicts/
Snapshots übernommen. Ein geerbter Source01-Logtext korrigiert, Source02RED
ehrlich im Notesentwurf. Unabhängiger mechanischer Gegenreview377348de…651d
gelesen; sieben aktuelle Pins passen. Dessen Präzisierung zur Negativliste
umgesetzt: alte gleicheRC-Source01/02-Präfixe nun zusätzlich verweigert,
183HelperchecksPASS. Kein Produkt-/Testendnachweis daraus. Source03-Produkt-FP
wird durch den echten Wordfix neu gebunden; noch kein finaler Freeze/Commit.

## Source03 – tatsächliche Word-/Tabellenkorrektur vor gemeinsamem Endlauf

Die gezielte Wordkorrektur ist implementiert: authentisches instrText außerhalb
aller komplexen Codephasen ist normaler Quelltext; echte äußere Codephasen,
Revision-/Metadatenansicht und CT_Text-Blatt-/Runbindung bleiben getrennt.
Main las den vollständigen tatsächlichen Produkt-/Testdiff sowie den
Autorenbericht d90a4f5c…ac355. Dessen stabile Vorproben54Wordcontext/26Integration/
36ParentScope/91Parser und516Characterchecks mit21Protokollnegativen und166echten
Permissionchildren sind gezielte Belege, keine neue Gesamtfreigabe. Main hat
die ursprüngliche kombinierte Wordquelle anschließend wieder aufgenommen.

Dabei wurde ein zusätzlicher echter unnötiger Stopp kausal belegt: historische
SourcePrivacy-Zeilenverdichtung entfernte echte GFM-Leerzeilen zwischen einer
Math-/Feldtabelle und einer unabhängigen Wordtabelle. Ergebnis war eine
inkonsistente Pipe-Tabellenregion, die prepare mit RESIDUAL_PII hart verweigerte.
Kein tatsächlicher Normalpfad-Publication-Leak bestätigt; frühere direkte
Engineausgaben sind kein entsprechender Beweis. Originale und alle roten
Diagnosen bleiben erhalten. Microsoft tblHeader ist Zeilenwiederholung, nicht
die einzige Autorität für ein reales Namefeld; GFM beendet Tabellen an Leerzeilen.

Enger Adapterfix erhält deshalb nur bei explizitem content-v1 die echten
Blockgrenzen. Bestehende Quellheaderpromotion und zeilenidentitätsgebundene
UTF16-Kontaktabbildung bleiben; notes-v1/direct behalten ihre historische
Normalisierung. Keine neue PII-/Residual-/Keepausnahme oder erfundene Quellzeile.
Main las offizielle [FieldCode](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.fieldcode?view=openxml-3.0.1)-
und [GFM-Tabellenregeln](https://github.github.com/gfm/#tables-extension-) direkt.

Unabhängiger tatsächlicher finaler Produktionsreview vollständig gelesen:
dist/rc176-source03-word-adapter-counterreview-20261024/REPORT.md,
SHAde6ff254ab38fa32adafe8997de3e386f8fb0b4bee665aaabc663d969e2b6b7c.
16volle Source-/manuelle+automatische Review-/Trace-/Publicationketten,
140tatsächliche Keepverweigerungen,22Feld-/Revision-/MC-/CT_Text-Gegenfälle,
9Kontaktgruppen/27ungültige Karten; drei Produktpins vor/nach identisch.
Kein bestätigter Deltablocker; kein Native-/Desktop-/ReleasePASS daraus.

Separater tatsächlicher Testmodell-Gegenreview vollständig gelesen:
SHA b293fbb4b54d0172eb2c4a1fc4e37e25b91cdabe1703d01ca5c725e65e2b7921.
Main verlangt nun die exakten drei historischen kombinierten ZIP-SHAs in
beiden Profilen/manuellen+automatischen Endketten statt bequemere Quellen oder
eine dauerhafte Fehlererwartung. Inhaltstests unterscheiden echte zusammen-
hängende content-v1-Zeilen von historischen notes-Zeilengaps; Positions-/
Bild-/Kontaktselektivität und harte ungültige Karten bleiben konkret geprüft.
Gezielte Mainproben22Content/54Context/38Integration/36ParentScope/91Parser/
7Fingerprintgruppen bisherPASS. Echter isolierter Windowskonvertervorlauf
noch aktiv, Zusatz-/gemeinsame Endgates ausstehend; kein Source03-Freeze.

Neuer tatsächlicher Entwicklungs-FP4a6d63c9ef0c77368a4d75d33013db4de5a2f09b008732bfa4249094404a0ecf/368,
621Testinputs/Manifest11e84207dfe4d5bff2da1fab0bbf5291281f27dc06072f6afe731e6f92abb209.
Diese Bindung ist noch kein neuer Git-/Paket-/Macnachweis. Frühere gegenteilige
unveränderter-FP-Aussagen gelten nur vor diesen drei Produktänderungen.

Main-Vorlauf19:09:30.296UTC vollständig7/7PASS/Inputs unverändert, einschließlich
75echter isolierter Windowskonvertergruppen/0SKIPs. Die11Zusatzproben wurden
danach diagnostisch ausgeführt: erste7ChildExit0; eigener neuer Vorlaufhelper
scheitert vor Fall8 nur an einer doppelten Basename-Logdatei (zwei legitime
Runnerrollen). Originalhelper/Logs/Fehler bleiben, keine ursprüngliche FINAL
erfunden. Separater ordinalbenannter Suffix führt genau die restlichen4 aus,
PASS/Inputs unverändert.516Characterchecks/166echteChildren, echte Guard-/
Epoch-/Pause-/Lease-/Admissionproben und3synthetische Browserproben erreicht.
Keine Produkt-/Test-/Enddriverkorrektur dafür. Der frische gemeinsame Endlauf
muss trotzdem alle318+11 selbst vollständig ausführen.16Helfersyntaxchecks,
183Bindungs- und geschlossene Proofnegativen MainPASS. Jetzt gemeinsamer
Source03-Commit/Freeze und neue lokale4Endgates/Macconsumer nötig.
