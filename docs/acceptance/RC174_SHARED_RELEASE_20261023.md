# RC174 – Diagrammmodelle, Office-Formeln und passive PDFwerte

## Auftrag und Grenzen

23.10.2026 ausdrücklich beauftragt: offene Diagrammmodelle einschließlich
Chartsheets, OfficeMath und gespeicherte passive PDFformularwerte für Windows
x64, macOS ARM64 und Intel ergänzen; tatsächliche Produktionsquellen durch
unabhängige Fachreviews revalidieren und frisch testen. Danach neue gemeinsame
RC174-Testpakete als GitHub-Pre-Release; Windows zusätzlich lokal mit Testplan.
Desktoptests führt der Nutzer durch (USER_PENDING), kein erfundener GUI-PASS.
Keine Mainintegration; RC173 und ältere Archive/Belege/Profile bleiben erhalten.

Gemeinsame semantische JavaScriptmodelle benötigen keine neue native
Officeinstallation, Developer-ID oder Notarisierung. Tatsächliche native
Macconsumer und Artefaktprüfungen sind trotzdem Pflicht. Kein Applekonto,
Schlüssel-/Zertifikatssuchen oder OS-/Rechte-/Schutzänderungen. Bereits geprüfte
statische Maccores aus Producer39167676290/7d0ee31 bleiben unverändert.

## Umsetzung und Prüfplan

1. Vorhandenes unveröffentlichtes Robustheitsdelta 4b57119398b1a28a88994ef9d2415baecf8c753d
   erhalten: hMerge, UTF16-BOM, ST_Xstring, echte PPTXnamespaces, optionale
   PDFmetadaten, statische PNGvarianten und tatsächliche Zellfeld-Privacyfixes.
2. Diagramme: reale Ownerbeziehung/Serien/Kategorien/Punktindizes, sparse und
   XY/Bubble ohne erfundene Paarung; Chartsheets nur exakt gebundene Rollen.
   Keine externen Workbookloads, Formelberechnung oder aktiven Objekte.
3. OMML: strukturierte lesbare Brüche/Indizes/Wurzeln/Grenzen/Matrizen im
   tatsächlichen Absatz-/Tabellenkontext. Reale Namespace-/MCauswahl; keine
   TeXausführung oder Codeblockverstecke vor der Privacyprüfung.
4. PDF: tatsächliche kanonische Felder und Seitenwidgets/Anmerkungen über IDs
   und Seiten zuordnen; gespeicherte Werte und abweichende Erscheinung ehrlich
   unterscheiden. Keine Aktionen/JS/XFA/Passwort-/Signaturinhalte aktivieren.
5. Echte neue Gegenfälle im normalen OPC/PDF→MD→Privacy/Residual/Tracepfad;
   Quellen-/Autorenprüfung und unabhängige Gegenreviews, bevor eingefroren wird.
6. RC174-Version und gemeinsame Quelle committen/pushen. Neue create-only
   Helfer und Evidenzen mit deterministischem Git-Testinputmanifest (nicht
   schwankender rg-Ignoreliste). Während Freeze keinerlei Quelländerungen.
7. Frische Gesamt-/Rust-/Native-/Konverter-/Paketgates; beide Macconsumer auf
   demselben Appcommit, echte Logs und ZIP/DMG/Seal/Rollen/Hashbindungen lesen.
8. Erst geeignete neue Belege erlauben lokale Übergabe und GitHub-Testrelease;
   Tagquelle, PreReleaseflag, Remoteinventar und Assethashes erneut nachlesen.

## Ehrliche Abdeckung

Kein Versprechen für jede beschädigte Datei oder jeden proprietären Renderer.
Unbekannte sichere Modelle werden mit Teilabdeckung ausgewiesen, reale Texte
nicht stillschweigend als vollständig erklärt. Ressourcen-/Identitäts-/I/O-
und Anonymisierungsschutz bleiben erhalten. Formeln werden dargestellt, nicht
ausgeführt. CI ersetzt keinen Finder/TCC/M2/Enterprise/VoiceOvertest.

## Journal

- Beginn: Worktree/Branch/HEAD4b57119 geprüft; keine eigenen laufenden
  Buildprozesse und keine aktiven GitHubjobs. Drei begrenzte voneinander
  unabhängige Autorenaufträge (Chart, OMML, PDF), keine Peer-/Desktopsteuerung.
- Noch keine RC174-Endgates, Pakete, Tag, lokale Übergabe oder Veröffentlichung.
- 24.10.: Reale OMML-Gegenfälle fanden zwei neue Projektionsrisiken vor Freigabe:
  Rollenklammerung verdeckte explizites Namefeld; spätere GFM-Zellfaltung
  verdeckte dieselben Argumentgrenzen erneut. Reader behält echte Absatzgrenzen;
  generische Formelzellen werden als quellkoordinatierte Prosa-Teilsegmente
  ausgegeben. Tatsächlich sensitive Tabellenheader bleiben gebundenes GFMfeld.
  Unveränderte echte Word-/PPTX-Privacygegenfälle danach grün; noch kein Endgate.
- PDF.js-Quellenabgleich: enableXfa:false allein verhindert keinen internen
  XFA-Dataset-Fallback in getFieldObjects. Deshalb benötigt die neue passive
  Formularlesung zuvor ein ausdrückliches IsXFAPresent=false; sonst nur
  unabhängige Seiteninhalte und ein ehrlicher Auslassungshinweis, keine XFAwerte.
- Unabhängige tatsächliche Gegenreviews fanden danach weitere kausale Deltas,
  keine durch ältere grüne Tests widerlegten Altbefunde: mehrteilige Namewerte
  in qualifizierten PDFfeldern und in unterstützten/unbekannten Formelargumenten
  konnten die vollständige Feldwertpflicht verlieren. Ursprüngliche roten
  OPC/PDF→Privacy→Residual→Tracebelege bleiben getrennt erhalten. Vor Freeze
  werden nur authentische Quellrollen und Operand-/Absatzgrenzen projiziert;
  keine Engine-Regexlockerung oder künstliche Personenheader für Faktwerte.
- PDF-Feldfix: tatsächliche geschlossene Endfeldrolle vor Markdownescaping,
  Originalvollname und Wert jeweils einmal in eigenen echten Zellen. Autor
  21/21 reale PDFgruppen/Windowsworker/Childende/stabile Inputs; unabhängige
  abschließende Fixnachprüfung und Gesamtgates noch offen.
- Separater Main-PDFbudgetfix erhält unabhängig lesbaren Body vor optionalen
  Omission-/XFA-/Restfeldhinweisen als ganze Einheit. 17/17 gezielte echte
  Funktions-/Checkpointfälle, kein erhöhtes Limit oder Timeout. Original-RED
  bleibt erhalten; keine behauptete vollständige 8M-Glyph-Nativeabnahme.
- Word-vMerge mit Formel verursachte TypeError am neuen Blockdiscriminator;
  eng korrigiert. PowerPoint CT_TextMath jetzt exakt ein direktes oMath unter
  a14:m, kein wiederholter Wrapper/oMathPara. Tatsächliches a:rPr wird eng
  behandelt. Vorläufige Mainintegration 19/19; neue Formelquellgruppierung noch
  in Entwicklung, ausdrücklich noch kein gemeinsamer Freeze-/Releasebeleg.
- Hauptagent las beide ursprünglichen unabhängigen Reviews und den PDFfix
  vollständig. Unveränderte reale PDF-Gegenrepros danach erneut: qualifizierte
  CR-/Slash-/Quellmarkerwerte in beiden Profilen geschützt, echte Keeps
  verweigert, Preis erhalten; tatsächlicher Trace/Proof. Optionaler Link am
  7.999.900-Zeichenrand erhält denselben vollständigen Bodyhash wie ohne Link.
  Neue Mainbelege dist/rc174-main-pdf-recheck-20261024, Inputs unverändert.
- Helfergegenreview bestätigte zwei Übergabedefekte vor Freeze: echter neuer
  PDF-Erfolgstext hatte einen zusätzlichen Stabilitätssuffix, den die alte
  Receiptregex verweigerte; ein mehrzeiliger alter Testplanabschnitt nannte
  hMerge noch unsupported. Beide eng korrigiert, neue Formelquell-Suite/Receipt
  aufgenommen und Ausgabemodi explizit (Chart/PDF beide, OMML content-v1).
  31 Helfernegative plus neue semantische Negative und 98 Quellenchecks grün;
  noch kein Helfer-Endseal und keine Applikationsabnahme daraus.
- Diagrammgegenreview fand einen echten neuen P1: tatsächlicher Scatter-
  Wertachsenname wurde nicht als Feldrolle an X/Ywerte gebunden. Reale
  DOCX/PPTX/Chartsheet-Publikationsketten konnten mehrteilige Namewerte
  behalten. Autorenfix samt gesonderter Gegenprüfung vor Freeze erforderlich;
  keine Freigabe durch vorherige 61 Chartfälle oder ältere Releasegrüns.
- Erneute Gesamt-Revalidierung ausdrücklich vom Nutzer verlangt; Ziele:
  möglichst vollständiges menschenlesbares MD für DOCX/XLSX/PPTX/PDF, sicher
  nutzbare Teilinhalte trotz unabhängiger Auslassungen, gleiche Privacy-/Trace-/
  Residualpflicht für neue Inhalte, unveränderte Originale und Offlinebetrieb,
  gemeinsamer Windows/ARM64/Intel-Quellstand ohne Applekonto/Schutzänderungen,
  neue geprüfte RC174-Testpakete und ehrlicher Desktopstatus USER_PENDING.
- Formel-Fix unabhängig abschließend gegengeprüft: ursprüngliche 30 echte
  OPCketten inklusive aller 16 falschen Publikations-PASSs jetzt geschützt,
  tatsächliche Keeps verweigert; zusätzlich 20 echte neue OPCketten in beiden
  Profilen, Wordlisten/-zellen sowie erreichte PPTnotizen/Layout/Master.
  Reader97962371/Projectionb9a80805/OOXMLc4e09928/Drawingd38bcd58;
  ursprünglicher vMerge-Absturz geschlossen. Grenzen im getrennten Review.
- Chartautorfix 2a47ad04: tatsächliche XY-Achsenrollen, generische Behandlung
  unklarer sensibler Rollen, echte Nichttabellen-Grenze vor Datenmatrix und
  explizite Struktur-ID. Zusätzlich bestätigter sparse Fehler (generierte
  fehlender-Punkt-Phrase wurde Personenmapping) beseitigt: leere Zelle und
  Koordinatenhinweis außerhalb Datenmatrix, keine erfundenen Quelldaten.
  113 Chart-/73 Extractorfälle Autoren-PASS, unabhängige Nachprüfung läuft.
- Weiterer unabhängiger PDFgegenfall Name (1)/Full Name (1) (2)/Company (1):
  fehlende vorhandene effektive Labelnormalisierung am echten qualifizierten
  Leaf bestätigte sechs falsche Publikations-PASSs. Main ergänzt nur dieselbe
  bestehende geschlossene Labelpolicy im Produzenten sowie echte Parent/Kids-
  Native-/Privacygegenfälle; keine Engineänderung. Neue Gegenprüfung läuft.
- Main gleicht PDF-Operatorplanung bei ausgelassenem/ungeklärtem XFA an bereits
  DISABLE-gebundene Rasterpfade an. Sourcefunktions-VM zeigt ursprüngliches
  undefined statt DISABLE; danach 18/18 Quellenfälle grün. Das beweist kein
  vollständiges No-Parse/Native-XFA-Pixelverhalten; keine solche Zusage.
- Versionssync 3.2.0-rc174 durchgeführt und --check grün. Noch keine neue
  Quelle committed/gepusht, kein Freeze/Build/Release. Breiter neuer Main-
  Vorabcheck in dist/rc174-main-final-preflight-20261024 läuft, ohne Änderungen
  an Produkt-/Testinputs; dieser ersetzt nicht die finalen gemeinsamen Gates.
- Vorabcheck01 war ROT/stabil: nichtmathematischer Engineering-Layouttext
  ohne literalMarkup wurde über den neuen rendered-Pfad unerwartet escaped.
  Ursprünglicher 6er-Gegenfall unverändert erhalten. Enger Mainfix trennt
  internes Slide-Proseescaping vom bisherigen Layout-Engineeringformat;
  echte operative Literal-/Mathprojektion unverändert. Neues OOXML4193ed22.
- Main-Vorabcheck02: alle17 angeforderten Suiten Exit0, Produkt-/599 Testinputs
  unverändert; Fingerprint58beb34710af223ef81e6b56fdf39711d2c2d95704434fe38b4fadbf2bc0246e/357,
  Testmanifest87e15b0b56be4b909a85f8a31764a518897aea4d836089a050c4e3c778f9fe9c.
  Enthält Chart113, Math58+55+20, Extractor73, Xlsx196+69, echte PDF21gruppen
  (zusätzliche echte ordinale Parent/Kids-Varianten in allen vier Profilen),
  Source18 und unveränderte Nachbargates. Kein Ersatz für gemeinsame Endgates.
- Unabhängige abschließende Nachprüfungen vollständig vom Main gelesen:
  Chart30 ursprüngliche +24 neue echte Quellenketten, PDF16 ursprüngliche echte
  Gegenketten nach Leaf-Suffixfix, Math30 ursprüngliche +20 neue echte Ketten.
  Keine bestätigten Restblocker in diesen begrenzten Deltas, tatsächliche
  Keeps/Residual/Trace und Originalbytes gegengeprüft. Keine Universal- oder
  Eigenbasisfreigabe daraus. Alle drei begrenzten Reviewerprozesse beendet.
- Sieben neue Helferpins unabhängig exakt gegen Freezerliteral geprüft;
  echte drei Target-Terminalpositive/33 Negative, 16 Syntaxchecks und
  vorhandene31+11Semantiknegative/98 Quellenchecks PASS. Keine FINALs erfunden.
  Noch keine Desktop-/Mac-/Endgateabnahme: nun gemeinsamer Commit/Freeze und
  tatsächlich frische lokale sowie doppelte native Mac-Prüfung erforderlich.
