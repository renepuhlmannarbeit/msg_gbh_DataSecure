# Dokumentextraktion – Quellkorrektur vom 21.10.2026

Einordnung: Die folgenden ursprünglichen DOC-TEXT-01-Nachweise sind historisch;
deren gemeinsame Release-Endgates wurden später für RC170 abgeschlossen. Der
neue Nutzerauftrag PARTIAL-EXTRACTION-01 nach RC170 steht im Nachtrag am Ende.
Alte Bindungen und Belege werden dadurch nicht rückwirkend umgeschrieben.

Status: implementiert und gezielt technisch revalidiert; kein Release-PASS.
Basis-HEAD ddc3998ef12b9201427a0fa155164ba662a483d1, Branch
codex/standalone-export-usability. Lokale Quelländerungen, kein neuer Commit,
Push, Versionswechsel oder Release. RC169 und bestehende Ergebnisdateien bleiben
unverändert. Desktoptests ausschließlich durch Nutzer/Kollegen. Keine Automation.

## Abschließende Nutzerentscheidung

**„Suchtexte erhalten (empfohlen)“** wurde ausdrücklich bestätigt. Sämtliche
vorhandenen PDF-TextItems bleiben deshalb Grundlage der Ausgabe, auch unsichtbare
Such-/Barrierefreiheitstexte, unabhängig von Bildüberlappungen oder Rasterbefunden.
Renderklassifikation allein berechtigt nicht zur Entfernung nativer Texte.
Es gibt keinen neuen Nur-sichtbar-Modus. Mehrdeutige Stellen können weiterhin im
Markdown stehen: vollständige semantische Artefaktfreiheit ist nicht behauptet.

## Umgesetzter Vertrag

1. Exakt bestimmte interne moderne PowerPoint-Folienkommentare werden als passive
   Metadaten zugelassen, nicht ausgeführt und nicht als ausgelesen behauptet.
   Beziehungstyp, Folienbesitzer, interner Zielpfad und Content-Type müssen passen.
   Makros/externe Ziele/unbekannte Rollen, ZIP-/CRC-/Pfad-/Größenkontrollen bleiben
   streng. Die gemessene PPTX-Länge ist kein Grund zum Anheben einer Grenze.
2. PDF-Rastergegenproben liefern ausschließlich zusätzliche exakte, positions-
   gebundene OCR-Dopplungsbelege. Der Produktionscaller konsumiert wordRegions,
   nicht die vom Analysator angebotenen gefilterten TextItems/hiddenIndices.
   Wortboxen beruhen auf tatsächlichen Glyphenpositionen und Pixelunterschieden,
   nicht proportional aufgeteilten Zeilenboxen. Native TextItem-Tokens müssen
   exakt passen. Unklare Schrift, TJ-Abstände, kleine/weiße Schrift, komplexe
   Renderfälle, Wiederholungen und verbrauchte Budgets schaffen kein Löschrecht.
3. Proben nur innerhalb einer bereits ausgewählten OCR-Verarbeitung, niemals
   beim normalen PDF-Textlesen ohne OCR. OCR bekommt die unveränderte finale
   Seitenrasterung. Gemeinsames Budget: 32Mpixel/128Render; auch Basis- und
   Reproduktionsrender werden vorab gebucht. Bestehende Worker-, CPU-, Speicher-
   und Netzwerkgrenzen unverändert. Kein globales Wörterset oder Fuzzymatching.
4. Nichttextuelle C0/C1-Steuerzeichen ohne TAB/CR/LF/NEL und Unicode-Nichtzeichen
   in PDF/OCR durch Wortgrenzen ersetzen. Ganze unlesbare Fontsymbolzeilen wie
   bisher auslassen. Gemischte private/Replacement-Glyphen nicht in erfundene
   Schreibweisen umdeuten. Umlaute/ß, internationale Buchstaben, kombinierende
   Zeichen, Währungs-/Mathematiksymbole, Emoji und Formatzeichen erhalten.
   Kein Sprachzeichenfilter und keine Bereinigung von Literal-TXT/Markdown/Code.
5. Bereinigung vor Kontaktpositionen und privaten unveränderlichen Markdown-
   Ständen/Hashes. Keine Reparatur vorhandener Benutzerergebnisse, kein Neu-
   Hashen alter Belege, keine geratenen OCR-Bildausschnitte.
6. PDF.js-Ableitung pdf.datasecure.mjs separat benannt und inventarisiert;
   Upstream-pdf.mjs/Lizenz unverändert. Exakter PDF.js6.2.108-Quellpin und
   Transformationsvertrag, kein stilles Patchen installierter Dependencies.
   Keine zusätzliche native Bibliothek, OS-Rechte-/Signierungsänderung,
   Entwickler-ID, Notarisierung oder Apple-Einreichung.

## Exakter geprüfter Quellstand

- Produktfingerprint:
  1a09bf04d7cc198e004437847df90cf157ecddd7f7890331f6e5ccfe4a6e7be6
- 338 Produktdateien; 571 Test-/Scriptinputs.
- Testmanifest:
  6cb0a11d603cad0b0ca7d3c70b5011bd2f50097ce2515f893f3027938833f936
- Gepinnter Node22.23.2; keine Quell-/Test-/Scriptänderung während der gebundenen
  Konverter- und Originaldateiläufe.

## Tatsächliche Nachweise

- Frische isolierte Windows-Konverterregression: **67/67 Gruppen, 0 übersprungen**,
  Office-/Markdown-Bild-OCR **31/31**. FINAL.json PASS, inputs_unchanged=true.
  21.10.15:30:37.941–15:34:06.355UTC. Beleg:
  dist/document-extraction-fix-20261021-01/native-regression-BeOzfg/FINAL.json.
- Gezielte Quell-/Vertragstests: OPC22/22, Extraktor46/46, PDF/Lesetext39/39,
  Renderklassifikation30, Inhaltsvertrag12/12, Extraktionsvertrag6/6,
  Buildfingerprint7/7, Standalone-Paket15/15, Mac-Bundle-Quellmodell63/63,
  Paketintegrität8/8 und Testpfadtrennung18/18 bestanden. Das Quellmodell und
  Paketverträge sind kein neu gebautes Gesamtpaket oder nativer Mac-Nachweis.
- Original-PPTX im echten isolierten Worker: PASS, 3.820s, 61.310 Zeichen;
  Kontrollen/Beziehungen/CRC im Produktionsinspektor ebenfalls passend. Quellen-
  und Bildabdeckung weiterhin ausdrücklich unvollständig. Keine Makroausführung.
- Original-PDF ohne OCR: PASS, 1.727s, 44Seiten/39.200Zeichen. SHA256
  fca5eecc2f2ab71e54653400f4f0ecbb01b84712b90f4008b1db90d16cc58c3d
  identisch zum vorhandenen Nutzerergebnis; Suchtexte bewusst erhalten.
- Original-PDF mit OCR: PASS, 82.888s, 44Seiten/78.050Zeichen. SHA256
  eb48d0d20daebdb064c9ebc943b6267e4b1916e94b48b1ab201861e5b91268db.
  Keine Markdown-Bildsyntax in beiden Ausgaben. OCR-/Quellenabdeckung weiterhin
  unbestätigt/unvollständig, keine menschliche Inhaltsabnahme daraus.
- Auf Seite5 bleiben die mehrdeutigen Suchtexte Scrum Master und R/U/N entsprechend
  der Nutzerentscheidung in beiden PDF-Ergebnissen erhalten. Technisches Verdict
  PASS, artifact_removal_verdict ausdrücklich PARTIAL, nicht vollständige
  Artefaktentfernung. Vollständiger selbstgeprüfter Seitenabschnittsleser.
- Zwei Quelldateien und beide bisherigen Nutzer-Markdown-Ergebnisse bytegleich
  vorher/nachher; Produktfingerprint unverändert. Private Inhalte nur im lokalen
  ignorierten Belegbereich, niemals in Git übernommen. Beleg:
  dist/document-extraction-fix-20261021-01/private-final-worker-Zpv6dH/RESULT.json.
- Mehrere unabhängige tatsächliche Quellengegenreviews: Tiny-Font-Datenverlust,
  TJ-Tokenverwechslung und ungebuchte Basisrender wurden als echte Gegenfälle
  gefunden, eng korrigiert und erneut geprüft. Abschließender Gegenreview der
  aktuellen Suchtexterhaltung, OCR-Autorität, Unicode-/Kontakt-/Crop-Grenzen
  ohne bestätigten Deltablocker. Kein erfundenes Zielhost-/GUI-PASS.

## Historische Versuche – nicht der abschließende Nachweis

Alle ursprünglichen roten und früheren grünen Belege bleiben erhalten.

- private-worker-uKeL9L: alter 512Mpixel-Proberahmen erreichte einen unveränderten
  CONVERSION_RESOURCE_LIMIT-Stopp. Ob Speicher oder summierte CPU ausschlaggebend
  war, ist nicht bewiesen. Der V1-Seitenleser verwendete außerdem einen falschen
  Multiline-$-Abschnitt; null ist kein Artefakt-PASS.
- native-regression-EUgnql: rot bei früherer Textfilterung. Die native Suchtexte
  löschende Politik ist nicht der jetzige Produktionsvertrag.
- native-regression-vifgjg/c05ca958 und native-regression-Iik5ub/85d13968:
  jeweils 66+31 grün; vor abschließender Erhaltung aller Suchtext-Items.
- Temporärer Bildüberlappungsschutz samt 13 Tests wurde nach der Nutzerwahl
  entfernt, weil eine Bildrechteckheuristik keinen sicheren semantischen
  Textbeleg liefert. Kein Bestandteil der abschließenden Implementierung.
- memory-diagnostic-20261021-9d8c43fa: instrumentierter A/B-Lauf unter gleichen
  1GiB/300sCPU-Grenzen erfolgreich; nur Diagnose, kein Produktgate. Begrenzte
  RSS-/CPU-Stichproben bis Seite24 beweisen weder Gesamtpeak noch alte Ursache.
- private-final-worker-XJq6wg prüfte 85d13968, nicht den abschließenden Stand.
  Frühere FINALs nicht umgeschrieben oder dem neuen Fingerprint zugeschrieben.

## Verbleibend vor einem neuen Release

Kein neuer RC-/Build-/Veröffentlichungsauftrag in diesem Nachtrag. Neue gemeinsame
Gesamtregression, native Mac-Builds/Tests, Windows-Apppaket, Zielhost- und
menschliche Desktopabnahme dieser neuen Bytes sind noch nicht erfolgt. Bestehende
RC169-Pakete enthalten diese lokalen Quellkorrekturen noch nicht.

## Primärquellen

- [Microsoft: Modern Comment Part](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/b85a9293-bdca-4c6b-a554-8f3918db9791)
- [Unicode: Private-use/Noncharacters](https://www.unicode.org/faq/private_use.html)
- [Unicode: Unsupported Characters](https://www.unicode.org/faq/unsup_char.html)
- [PDF.js6.2.108 API](https://github.com/mozilla/pdf.js/blob/v6.2.108/src/display/api.js)
- [PDF.js6.2.108 Canvas](https://github.com/mozilla/pdf.js/blob/v6.2.108/src/display/canvas.js)

## Neuer Auftrag nach RC170 – PARTIAL-EXTRACTION-01

Nutzerauftrag: Word/DOCX, Excel/XLSX, PowerPoint/PPTX und PDF unter Windows und
macOS bestmöglich lesen; einzelne nicht unterstützte Bilder, beschädigte
unabhängige Teile und Ressourcenfehler dürfen vollständig sicher gewonnene
Textabschnitte nicht pauschal verwerfen. Keine Universalreparaturgarantie für
beliebige Altformate, kaputte Hauptteile oder unklare Container. Desktoptests
bleiben beim Nutzer. RC170, Originaldateien und bisherige Ergebnisse unverändert.
Basis-HEAD1e40c2b8684d9b20b7f0ade4d446c42f0d6c1139; lokale, noch nicht
veröffentlichte Quelländerungen, kein Versionswechsel oder neuer Paketbuild.

### Implementierte Reihenfolge und Sicherheitsgrenzen

1. Gemeinsame geschlossene Auslassungsgründe in Extraktionsvertrag, Oberfläche
   und vertraulicher Statusausgabe. EMF/WMF/SVG/GIF/TIFF/WebP/sonstige unbekannte
   Office-Bilder werden formatbezogen gemeldet, nicht ausgeführt oder in ein
   erfundenes OCR-Ergebnis umgedeutet. Kein neuer nativer Fremdrenderer.
2. Office-Raster einzeln unter vorhandenen Byte-/Pixel-/Anzahlgrenzen prüfen.
   Defekte und zu große Bilder auslassen, später passende Bilder weiter lesen;
   ursprüngliche Bildordinale sowie exakte Kontaktpositionen beibehalten.
3. PDF: vollständige native Suchtexte vor nachfolgender Bild-/OCR-Verarbeitung
   sichern. Unabhängige Seitenfehler lokal kennzeichnen, nächste Seiten weiter
   lesen. Keine neue Heuristik zum Entfernen möglicherweise gültiger Suchtexte.
4. Expliziter Standalone-/2-Partialmodus für unabhängige Office-Parts. ZIP-
   Verzeichnis, Pfade, Offsets, Kontrollteile, Hauptteilbindung, Quellidentität
   und Ressourcenbudgets bleiben hart. Nur ganze CRC-/XML-/formatgeprüfte Teile;
   keine Ausgabe von ungeprüften XML-Präfixen. Externe Beziehungen werden
   abgesondert, nie geladen, ausgeführt oder als Roh-URL in Hinweise übernommen.
5. Private begrenzte Worker-Checkpoints für vollständige Einheiten. Verwertung
   ausschließlich nach tatsächlichem Workerende und bestätigter Eingabeübergabe.
   Abbruch, ungültiges Protokoll, Eingabe-/Isolations-/Modell-/Policyfehler und
   unbestätigte Beendigung erlauben keine Teilübernahme. Timeout plus späterer
   harter Transportfehler bleibt Fehler. Bestehende Zeit-/OS-/Textgrenzen bleiben.
6. Office-Gesamtbudget bereits beim Aufbau ganzer Abschnitte, einschließlich
   tatsächlicher Ausgabeprojektion und Separatoren, auf unverändert8M begrenzt.
   Überlange Abschnitte ganz auslassen; spätere kleine können noch passen.
   Generierte Überschriften/Bildhinweise dürfen keinen leeren Erfolg erzeugen.
   Ohne brauchbaren Text bleibt eine konkrete Fehlermeldung. Teiltexte durchlaufen
   danach unverändert Anonymisierung, Kontaktprüfung und Veröffentlichungsbindung.

Keine Developer-ID, Notarisierung, Zertifikatssuche, Apple-Einreichung oder
Änderung an Gatekeeper/Library-Validation. Gemeinsamer JavaScript-Code und
bestehende gepinnte Konverter; kein nativer Mac-Paket-/Zielhostnachweis dieser
neuen Änderungen aus Windows- oder Quellenmodellen abgeleitet.

### Gezielte Gegenreviews und erhaltene Zwischenstände

Mehrere unabhängige tatsächliche Produktionsquellenreviews: Transport/
Workerlebensdauer, Office-/ZIP-/OPC-Zulassung, Bild-/PDF-Verhalten und UI-
Hinweisverträge. Gefundene Gegenfälle eng korrigiert: später harter Stderrfehler
nach Timeout, nicht kanonische TargetMode-Schreibweisen, fehlende /2-Zulassung,
PDF-Seitenüberschrift an der Textgrenze, Office-Gesamtbudget und generierter
Notes-Hinweis ohne Quelltext sowie leerer No-Media-Workerzweig. Abschließende
gezielte Gegenreviews ohne bestätigten verbleibenden Deltablocker.

Source01/Source02-Headless/Source03 wurden vor neuen Quellkorrekturen bewusst
beendet; keine vollständigen grünen Endnachweise. Alte Logs/rote Gegenversuche
bleiben erhalten. Source02-Windows-Native30+67+34 und Original-PPTX waren auf
FP3c5096df… technisch grün; nicht dem späteren Stand zugeschrieben.
Source02-Nativprobe bestätigt Rasterbudget-Teilübernahme und echten Worker-
Kill/Close nach kontrolliert ausgelöstem Deadlinecallback. Keine gemessene
Produktions-Wartezeit behauptet. Ungültiger Flate-Teststream löste im echten
PDF.js keinen Seitenfehler aus: FIXTURE_NOT_CAUSAL, kein nativer Seitenfehler-PASS.

### Aktueller eingefrorener Quellenendlauf

Source04 unter dist/partial-extraction-source04-20261021:
FPdf5dd5a67e74650b7608c42350bc9a60c4224b49cb43898e4081fad37f844bdf,
339 Produktdateien;543 JS/MJS/CJS/JSON/PS1/YAML-Test-/Scriptinputs,
Manifestff5f2e38a3fdbef12730d887fab183bb01e3e5f154a5f4c85d312a841f31f1fe.
Gebundene Headless-/Windows-Native-Endläufe gestartet; vollständige FINALs und
inputs_unchanged noch zu lesen. Original-PPTX-Endprobe anschließend offen.
Gezielt zuletzt63 Extractor- und13 Partial- sowie38 Transportfälle bestanden.
Keine neue Versionsnummer, kein Apppaket, kein Push-/Main-/Release-Schritt.

### Menschlicher Testplan für später neu gebundene Pakete

- Originale BITMARCK-PPTX mit/ohne OCR: nutzbares Markdown; EMF-Auslassung und
  weitere tatsächliche Einschränkungen sichtbar, kein Bild-/Base64artefakt.
- DOCX/XLSX/PPTX mit gemischten Raster-/Vektorbildern: übriger Text und lesbare
  Bildtexte bleiben; Hinweise nicht mit technischer Gesamtfehlermeldung verwechseln.
- PDF mit Suchtext und unlesbarem Bild: Suchtext und unabhängige Folgeseiten
  erhalten, kein stiller Vollständigkeitsanspruch.
- Geführte und automatische Anonymisierung derselben Teilquellen: kein
  ungeprüfter Rohtext als anonymisiert; Kontakt-/Nachbearbeitung weiter verfügbar.
- Leere/unbrauchbare oder global unsichere Quelle: konkrete Erklärung statt
  leerer erfolgreicher Ergebnisdatei; weitere Dateien des Laufs unabhängig.

Windows-/Mac-Desktop-, Finder-/TCC-/Organisationsprofil-/Officeabnahme bleibt
Nutzeraufgabe an späteren neuen Paketen; RC170 enthält diesen Nachtrag noch nicht.
