# RC173 – Tabellenaufbereitung ohne layoutbedingten Anonymisierungsstopp

Aktueller technischer Abschluss: RC173 veröffentlicht23.10.2026 18:17:26UTC,
gemeinsamer App-/Tagcommit e253380e708de4c347e1aaad7ba836763aabec56. Frische
vier lokale Endgates und beide Macconsumer PASS, tatsächliche Paketbytes und
20Remoteassets vor/nach Publikation geprüft. Menschliche Desktopabnahme bleibt
USER_PENDING. Vollständiger Source03-Abschluss unten; alte Zwischenstände sind
historische unveränderte Belege, keine wieder geöffneten kumulativen Aufgaben.

## Auftrag und unveränderte Grenzen

23.10.2026 ausdrücklich beauftragt: gültige komplexe Word-, Excel- und
PowerPoint-Tabellen ohne pauschale Layoutverweigerung anonymisieren, Schutz-
prüfungen erhalten, unabhängig am echten Produktionscode revalidieren und
testen. RC173 Windows x64/macOS ARM64/Intel als Test-Pre-Release aus demselben
abschließenden Appcommit/Fingerprint, Windows zusätzlich lokal mit Testplan.
Desktoptests beim Nutzer/Kollegen; keine eigene UI-Bedienung oder Nutzerlauf-
änderung. Keine Mainintegration, Automation oder Änderung älterer Releases.

Start HEAD `0b30c5eab5de8f25d6323b8ef571ab026c9d67d6`, Branch
`codex/standalone-export-usability`, bestehender Release-Worktree. RC172-Tag/
Appcommit `2d4a5fe2ef67ffa10e4015e34827853e08dfa0da` bleibt unverändert.
Schwieriges, aber vollständig gebundenes Layout soll keinen Parser-Coverage-
Stopp auslösen. Das ist keine Erlaubnis für beschädigte/überlappende Strukturen,
entfernte Namensfelder, Rest-PII, externe Verknüpfungen, fehlende Prozessenden,
Quell-/I/O-/Rechte-/Guard-/Modell-/Protokollfehler oder Ressourcenüberschreitungen.

## Umsetzungsplan und Abnahme

1. Tatsächliches Zell-/Span-/Zeilen-/Header-/Nestedmodell unabhängig prüfen.
   Neutrale Spalten/Koordinaten sind Darstellung, keine erfundenen Originaldaten.
   Jedes originale Textvorkommen genau einmal, keine Positionen nach Wertsuche.
2. Gültige vertikale/ungleiche/verschachtelte Wordtabellen, große XLSX-
   Koordinatenprojektionen und tatsächlich erreichte PPTX-Layout-/Mastertabellen
   in eine begrenzte, nachvollziehbare Struktur überführen. Keine globale
   Vollrasterexpansion riesiger leerer Bereiche oder pauschale Personenmaskierung
   sämtlicher fachlicher Zellinhalte.
3. Echte sensible Feldbeziehungen erhalten. Mehrdeutige Bezüge konservativ
   schützen und gegebenenfalls zusätzliche Maskierung sichtbar erklären.
   Keine bloße Löschung des alten Sperrcodes: Nachbearbeitung, Beibehalten,
   batchweite Identitäten, OCRpositionen, Transformbelege und Restprüfung müssen
   dieselbe belegte Feldbindung verwenden. Neue Texte vor Privacy prüfen.
4. Nicht blockierender, verständlicher Layout-/Maskierungshinweis statt
   irreführendem technischen Fehler bei gültig normalisierten Tabellen.
   Echte Schutz-/Formatfehler bleiben dateibezogen konkret und hart.
5. Synthetische positive und adversariale Gegenfälle am echten Parser/Privacy-
   Pfad, tatsächliche Konverter-/Review-/Publikationskette, unabhängige finale
   Quellengegenreviews; Tests/Mocks widerlegen neue Codebefunde nicht.
6. Erst danach gemeinsamer neuer Commit/Fingerprint/Freeze, frische volle
   Headless-/Native-/Konverter-/Paketgates und beide normalen Macconsumer;
   echte Logs/Artefaktbytes, lokale create-only Übergabe und GitHub-Prerelease
   samt Inventar/Quelltag/Prüfsummen/Remotehashes prüfen. Keine alten FINALs
   oder GUI-Abnahmen übernehmen; USER_PENDING ausdrücklich.

Mac: vorhandene approved eigene statische Cores wiederverwenden; keine neuen
Coreproducer/Reimporte, dynamischen Fremdguards, Developer-ID, Zertifikats-/
Schlüsselsuche oder Notarisierung. Ad-hoc-Siegelung im bestehenden Vertrag;
Gatekeeper/Hardened Runtime/eigene Core-Library-Validation nicht abschalten.
Keine neuen nativen Renderer oder OS-Rechte allein für Tabellennormalisierung.

## Journal

Startinventar: keine eigenen einschlägigen Node/Cargo/Rust/GitHub-Prozesse.
Getrackter Arbeitsbaum anfangs sauber, neun alte untrackedRoottemps erhalten.
Drei begrenzte parallele
Read-only-Fachaufträge: Word/PPTX-Struktur, XLSX-/Privacy-Kette, unabhängiges
Security-/Positionsmodell. Keine Unteragenten/Peerkommunikation/GUI.

Internet-/GitHubrecherche zusätzlich beauftragt und durchgeführt, siehe
[RC173_TABLE_RESEARCH_20261023.md](RC173_TABLE_RESEARCH_20261023.md). Bekannte
GFM-Span-/Nestedgrenzen und tatsächlichen Docling-Verlustfehler als Gegenfälle
aufgenommen; kein Fremdcodeimport/neuer Runtime-/Rendererbedarf dafür.

Alle drei ersten tatsächlichen Entwurfsgegenreviews gelesen. Zentrale negative
Probe: bloßes Namepräfix schützt beliebige lange/getrennte/mehrzeilige Werte
nicht. Die Implementierung verwendet deshalb neben der quellbezogenen
Zellprojektion einen content-only vollständigen Feldwertschutz nach dem
üblichen Entityschritt. Unbekannte Reste erhalten FIELD_REDACTED statt einer
erfundenen Personenidentität; tatsächliche UTF16-Edits im bestehenden Trace,
unabhängige ganze GFM-Feldwert-Restprüfung auch nach Keep. Keine Wireauthority.
Erste 15/15 Main-Feldwertfälle inklusive echter Prepare/Review/Finalize-Kette
PASS, keine Endregression. Eine anfänglich falsche Testannahme (echter
Orgdetektor erfasste beide Testwerte global) eng auf zwei tatsächlich generische
Feldwerte korrigiert; kein behaupteter Produktfehler.

Quellversion mechanisch auf 3.2.0-rc173 synchronisiert. Weiterentwicklung in
Arbeit, kein Freeze/Build-/Paket-/Release-PASS. Neues begrenztes XLSX-Mergemodell
vom Autor mit 56 neuen und 144 bestehenden Fällen erfolgreich geprüft;
Mainintegration und unabhängige Revalidierung folgen. Main-DrawingML-Modell
12/12 frühe Fälle PASS; unabhängiger tatsächlicher Quellenreview läuft.

### Zwischenstand nach den Quellengegenfällen

Keine Builds/Tags/Release gestartet. Die unabhängigen tatsächlichen Reviews
fanden und reproduzierten vor Freigabe folgende neue Fehler; deren alte rote
Reports bleiben unter dist/rc173-* erhalten:

- Globaler Ersatz eines Wertes „Name“ konnte Feldheader ersetzen; Headerrollen
  werden jetzt ausschließlich an den echten geschlossenen GFM-Headerinstanzen
  erhalten, keine globale Namens-/Dictionaryausnahme. Einfache und mehrfach
  ordinal dekorierte Header hatten unterschiedliche Normalisierungstiefen;
  content-only Normalisierung nun idempotent und rückwärts linear, Legacy
  behält seinen alten einzelnen Suffix. Review04 a0a20ecd… ohne weiteren
  bestätigten Fehler im engen Feldschutzdelta (71 Main-/54 Reviewergruppen,
  tatsächliche Publikationsproofs), noch kein OOXML-/Releasegesamt-PASS.
- Escape-Parität des äußeren Pipe wurde zunächst falsch bestimmt; tatsächlicher
  Delimiterscanner statt Ein-Backslash-Endregex. Gegenfälle 0–4 Backslashes.
- DrawingML: horizontale Fortsetzungsmodell-Unverträglichkeit, falsche 2D-
  Richtungsflags/Rowspannen und fremde Text-/Tableowner eng korrigiert und
  tatsächliche Gegenorakel erneut geprüft; Drawing-Review gelesen.
- Unmarkierter vermeintlicher Headerwechsel und erneuter sensibler Schlüssel
  durften frühere Namekorridore nicht freigeben. Quellgebundene sensitive
  Korridore forttragen; unbekannte Werte generisch, nicht als erfundene Person.
  Echter XLSX-Nichtankertext „Name“ darf seine Nachfolger nicht verlieren.
  Neuer aktueller Fortsetzungs-/Header-Unterfall wird noch eng geschlossen.
- Gesamtkopplung: erzeugtes „Geschützter Tabellenwert“ war vorübergehend selbst
  als Prosa-Person reserviert; echte Preparekette verweigerte danach sicher
  mit RESIDUAL_PII. Tatsächliche Feldheader/-werte werden nun zentral nicht als
  Prosa-Hypothesen reserviert. Kein Keeprecht: normale PII-/Feld-/Restprüfung
  weiterhin zwingend. Separate Gegenrevalidierung beauftragt.
- Bereits unterstützte uniforme Wordtabellen unnötig zu ändern verursachte
  Nutzwertregression. Deren bestehendes GFM bleibt; normale nested Grids werden
  eigenständig statt als escaped Parenttext serialisiert. Explizite innere
  Kopfrollen werden anerkannt, unbewiesene technische Wörter allein ersetzen
  keine Parent-Namebindung. Frühere vorläufige Fehlereinordnung im Review
  ausdrücklich korrigiert.

Aktuelle gezielte Mainfälle: 38 Zellprojektion, 71 Feldwert, 35 Wordgrid und
22 Kontextfälle grün, letztere inklusive sechs echter synthetischer OPC→
Extraktion→Prepare→automatische Prüfung→Finalize→Veröffentlichungsproof und
anschließender Keep-Verweigerung in general/personnel_profile. Das sind keine
Desktoptests, keine volle Regression und keine neuen Windows-/Mac-Pakete.

Breiter gezielter Quellenlauf unter dist/rc173-table-targeted01-20261023
(Session67199) beendet: FAIL, 21/24 Dateien PASS, inputs_unchanged=true;
kein finaler Freeze.
Drei bisher rote Punkte: alte genaue XLSX-Darstellungsassertion, neuer
28er-Reasonvertrag vs alter 27er-Test und eine synthetische Drawing-Tabelle
ohne die nun erforderliche Owner-URI; Originalbelege erhalten. Zusätzlicher
tatsächlich belegter Mergeowner-Fehler (inneres statt wirkliches rootWorksheet)
ist inzwischen am tatsächlichen Rootobjekt und identischen Namespaceprofil
korrigiert; 58 lokale Mergefälle PASS, unabhängige neue Revalidierung läuft.
Keine dieser neuen roten Proben durch frühere grüne
Belege als erledigt behaupten. Helperstart mit zwei falschen Testdateinamen
brach vor INPUTS/Kindprozessen ab; Namen nach rg korrigiert, keine Testdatei
oder Produktfunktion dafür geändert.

Zweiter create-only Quellenlauf targeted02, Session92445: abgeschlossen
15:46:45.456UTC, 24/24 Dateien PASS, inputs_unchanged=true. Neuer Fortsetzungs-
gegenfall: Nichtanker-Fachtext durfte eine sensible Headerbindung nicht
aufheben; Rollenwechsel jetzt nur echte Anker, 39 Projektionsfälle PASS.
Echte PPTX-Publikationsgegenprobe unabhängig erneut bestanden: Review03,
Originalquelle unverändert, acht tatsächliche Endkettenkontrollen auf Layout/
normaler Folie/MC-Alias plus sechs enge Owner-/Prompt-/Prosegegenproben.

Neuer Kopplungsreview 6338a88a… bestätigt Reservierungsfix und zusätzliche
24 echte Privacy-/Publikationsproben. Zwei P2 vor endgültiger Freigabe offen:
neues field-value-coverage fehlt in CORE_POLICY_FILES; importiertes variables
Personenlabel kann unter einem starken Feld mit schwachem Keep passieren.
Nach targeted02 beide eng korrigiert. Neues Modul in Policy-Dateiliste; echte
Projektionen und Semantikgolden nun 9/9 PASS. Importierte variable Payloads
im starken Feld werden vor Veröffentlichung generisch maskiert, neu erzeugte
Pseudonyme/feste Masken bleiben möglich. 83 gezielte Feldfälle PASS.
Noch ein unabhängig bestätigter Restfall: HTML-/Markdown-escaped Quellmarker
kann nach echtem Nachbearbeitungs-Keep die raw-basierte Quellenmarker-Menge
umgehen. Nach Ende targeted03 wird exakt dieselbe kanonische Quellansicht
für den unabhängigen Feldscan gebunden und dieser Originalfall wiederholt.
Kein Release bei offenem bestätigtem Restfall.
Bestehende globale Policy-IDs bleiben für diesen begrenzten Bugfix; ein
Nummernsprung würde zusätzlich HMAC-Domänen/Altzustände ändern. Vollständige
neue Core-/Produkt-/Commitbindung und frische Endgates bleiben zwingend.

targeted03 (Session49765) beendet 15:55:37.964UTC, 25/25 Dateien PASS und
inputs_unchanged=true, einschließlich tatsächlicher Core-Bindung. Kein Produkt-/
Testedit während dieses Jobs. Der danach korrigierte kodierte SourceMarker-
Restfall bindet im unabhängigen Gate die echte kanonische Quellenansicht und
zusätzlich nur tatsächliche geschützte Quellzellen über denselben sichtbaren
GFM-Wertleser. Keine globale TXT-Unescape-Regel. Frische 107 Feldfälle PASS,
darunter 36 echte MD-Quellenketten mit literal/HTMLentity/Markdownescapes,
echtem Entity-Keep/gebundenem Keeptoken und verweigertem Publikationsproof.
Neue unabhängige Revalidierung der ursprünglichen zwei roten Quellen läuft.
Eigene neue Prüfannahme eng korrigiert: synchroner MD-Extractor verweigert
content-v1 absichtlich; der Test verwendet nun dessen echte notes-Basis plus
den tatsächlich gepinnten Contentparser, keine Produktlockerung.

Neue UI-/CSV-Notice beider Modi benennt die Aufbereitung,
behauptet für reine Konvertierung keine Anonymisierung; Workspace478 und
DocumentRenderer294 tatsächlich PASS. Noch keine Native-/Paket-/Mac-Endgates.

Unabhängiger Integrationsreview bbee9568…: 18 enge Vertragsproben, neue4Tests
je einmal im Runner/Macstep, drei Module tatsächlich in beiden allgemeinen/
Windows-Runtime-/Produktfingerprintprojektionen. Direkte Macprojektion auf
Windows wegen fehlenden nativen Supervisorassets nicht simuliert; echter
Workflow baut diese vor Prepare. Neues create-only Helferset
dist/rc173-table-layout-source01-20261023 vorbereitet, Main 832 Assertions und
Proofnegativtests tatsächlich PASS, keine Endbelege daraus. Desktop USER_PENDING.

Letzte enge Revalidierung 9347f0b3… tatsächlich gelesen: dieselben beiden
Original-REDquellen mit unveränderten Quell-/Keepbytes und echtem Publikations-
gate jetzt SENSITIVE_FIELD/verweigert; fünf positive vollständige Ketten und
Legacykontrolle weiter korrekt. Enginepin67bb959d… unverändert. Keine weitere
bestätigte offene Produktlücke aus den aktuellen begrenzten Quellenreviews.
Die alten roten Berichte bleiben historische Belege. Neuer Quellstand vor
Commit: Fingerprint8b1644e102d65f40985825300693dee901f0e21c08cb924a201d42b94c5479bc,
351 Produktdateien. Finaler Commit und tatsächliche neue Endbelege noch offen.

### Source01: erhaltene echte rote Endgates und enge Testkorrekturen

Gemeinsamer gepushter Appcommit b2088a194a521b3cdc3662bfb744d86dfc2bacdc,
FP8b1644e…/351; 592 Test-/Scriptinputs/Manifest7b0368c2…. Freeze16:02:38.911UTC,
Macconsumer39983295016. Keine Produkt-/Test-/Script-/HEAD-/Driveränderung während
der Jobs. Alle Jobs inzwischen regulär beendet; keine Duplikate oder Pakete.

- Headless16:03:30.007UTC ROT:30/302+0/11/stabletrue. Testoffice-image-relevance
  erwartete native Prosa, deren Namespace er selbst absichtlich fremd setzte.
  Neue strikte echte Namespaceprojektion übernimmt diese nicht. Kein Beleg,
  dass tatsächlich gültige Originalprosa verloren ging.
- Native16:06:03.889UTC PASS/stabletrue: Prepare/Clippy/300Rust+3ignored/
  Node-Rust-Integration/Release. Kein neuer Paket-/Desktop-PASS.
- Konverter16:06:44.378UTC ROT/stabletrue: PDF38 und Worker67 bestanden,
  Office32 Positivgruppen dann PPTX_STRUCTURE_UNSAFE an positivem Tabellen-
  fixture ohne erforderliche Tabellen-URI. Rohe Logs/rotes FINAL und neues
  eigenes .tmp-standalone-package-office-ocr-0H5fE1 erhalten, Grafiklauf nicht
  mehr erreicht. Kein neuer Konvertergesamt-PASS aus Teilgrün.
- Beide Macjobs ROT vor späteren App-/Paketstufen: tatsächliche ARM-/Intellogs
  unabhängig vollständig gelesen, Hashes ae58aaad…/cf958aa5…. Beide stoppen
  an tests/test-partial-conversion.js:33,28!==27. Frühe Core-/Preparestufen
  bestanden; spätere Native-/App-/ZIP-/DMG-/Uploadgates nicht erreicht.

Nach sämtlichen Jobenden ausschließlich fünf Tests eng korrigiert:
Partial-/Markdownartifact-Reasoncount28 samt explizitem neuen Code; valide
PPTX-Kontrollprosa in eigenem kanonischem Namespace, negativer Bildnamespace
bleibt fremd und zusätzliche echte Fremdprosa wird weiterhin ausgeschlossen;
korrekte Tabellen-URI im nativen OCR-Positivfixture und einem zusätzlichen,
statisch bestätigten Parser-/CDATA-Positivfixture. Keine Produkt-, Policy-,
Timeout-, Ressourcen- oder Schutzänderung. Statischer unabhängiger302er-Scan
begrenzt ähnliche aktuelle Fixtureannahmen, alte reine Legacytests unverändert.

Frischer enger4Dateilauf16:10:09.943–16:11:05.504UTC PASS/inputs_unchangedtrue:
13 Partial-,17 Markdownartifact-,33 Relevanz- und49 tatsächliche native
Office/OCRgruppen. Zusätzlich91 Parserfälle nach dessen einem URI-Testfix
PASS. Produktfingerprint unverändert8b1644e…/351. Neuer gemeinsamer Source02-
Commit, frische lokale Endgates und beide neue Macconsumer folgen; Source01-
FINALs/Reports nicht umetikettieren. Source02-Helfer create-only vorbereitet.

### Source02: Dokumentationskopf statt Produktfehler

Appcommit a66c5e46fe9614dfae92d43dd9ddc3d6dd5b3b72 gepusht, Produktfingerprint
unverändert8b1644e…/351;592Testinputs/4701bf40…. Native16:22:00.313UTC PASS
(300Rust/3ignored/Clippy/Node-Rust/Release), Konverter16:22:54.919UTC PASS
(38PDF/67Worker/49Office/41Grafik), Paket16:25:36.622UTC PASS(5Gates,
100/100MD/0Fehler/Originale unverändert), sämtliche Inputs unverändert.
ZIP1358e449d2bc314f04dc683e7fd6e414327171c97050a5290dff4305c022d3df,
113404382Bytes;EXEdfb0c11a…4c5cb8. Neuer voller Commit im Binary bestätigt;
unabhängiger wirklicher Archivbytegegenreviewa494cb4b… ohne Bindungsblocker.

Headless16:48:03.658UTC ROT171/302+0/11/inputs_unchangedtrue, allein
test-current-documentation-contract.js:94. Formatmatrix enthielt die richtige
Version erst nach neuer Einleitung, außerhalb der vorgeschriebenen ersten8
Zeilen;29Dokumentationsgruppen PASS/1FAIL. Keine Runtime-/Policyänderung daraus.
Nach tatsächlichem Ende aller Jobs nur aktuellen Versionskopf ergänzt und
veralteten Stand15.10 ausdrücklich als historischen Paketstand markiert;
Prüfung nicht gelockert. Neuer kompletter Source03-Endstand folgt.

ARM120523834799 in39985588418 tatsächlich SUCCESS16:40:41UTC, vollständigen
unabhängigen Ganzlogreviewb89824e2… gelesen(Logf6390ca6…). Neue Tabellenfamilien
39/107/58/17,38PDF/65Worker+2Windows-Skips/49Office/41Grafik/283Rust+3ignored;
Core/Guard/App/ZIP/DMG-Belege ohne bestätigten Logblocker. Kein lokaler Macbyte-
oder physischer UAT-PASS daraus. Intel120523834599 gezielt wegen des bereits
bestätigten gemeinsamen Dokumentationsgates abgebrochen; tatsächliches
Run-/Jobende cancelled geprüft, ARM-SUCCESS erhalten. Kein Intelproduktfehler
oder ganzer erfolgreicher Macrun behauptet. Keine Snapshot-/Release-/lokale
RC173-Übergabe; alle Source02-Rots/ZIPs/Logs/Profile/Temps unverändert bewahrt.

Zusätzlicher unabhängiger echter, begrenzter Anwenderquellencheck72c32a9e…
nur lokal: sechs autorisierte Originale,775 gemessene Text-Einheiten in
Quellreihenfolge, nichtleere Spans/Mergeanker korrekt beschriftet; früherer
Wordstopp jetzt normalisiert. Keine reale Nested-/vMerge-Wordprobe in dieser
Auswahl, keine vollständige Privacy-/Publikations-/visuelle Abnahme daraus.
Alle sechs Originale erneut hashgleich; alte Ergebnisse wurden nicht verändert,
in dieser Zusatzprobe aber nicht erneut gehasht. Private Quellen und Detailbericht
nicht in Git, CI oder Release übernommen. Source03 benötigt frische komplette
Belege am neuen gemeinsamen Commit, kein Übernehmen alter FINALs.

Nach tatsächlichem Ende/cancelled aller Source02-Jobs nur zwei Dokumente
korrigiert; unabhängigen engen Docgegenreviewfd2521e1… gelesen. Unveränderter
Dokumentationsvertrag30/30PASS. Zusätzlich zuvor unerreichten kanonischen Rest
ab Datei173 plus alle11Zusatzgates am unveränderten Produkt-/Teststand geprüft:
16:54:35–17:08:43UTC,141/141PASS/inputs_unchangedtrue, eigene Session71536
regulär beendet. Dieser zusätzliche Bericht ist ausdrücklich Diagnostik,
kein Ersatz des roten Source02-Gesamt-FINAL oder neuer Source03-Endnachweis.
Source03-Helfer922statische/VMAssertions+ProofnegativenMainPASS, unabhängigen
reinen Rollendiff-/Pingegenreviewfa6281ea… vollständig gelesen. Keine
Produkt-/Test-/Script-/Ressourcen-/Policyänderung aus dem Dokufix; neue Quellen-
bindung und sämtliche frischen Endgates werden jetzt hergestellt.

### Source03: tatsächlicher gemeinsamer Endstand und Veröffentlichung

App-/Tagcommit `e253380e708de4c347e1aaad7ba836763aabec56`, gepusht und remote
bestätigt. Produktfingerprint
`8b1644e102d65f40985825300693dee901f0e21c08cb924a201d42b94c5479bc`/351,
592Test-/Scriptinputs/Manifest
`4701bf403488855bb8be12a7609f88a27a377ad1f17ec216486e4a8742e06506`.
Source03 gegenüber Source02 nur zwei Dokumentationskorrekturen, keine Produkt-,
Test-, Script-, Timeout-, Ressourcen- oder Schutzänderung. Sieben Driver und
alle Produkt-/Testinputs während sämtlicher Jobs unverändert.

- Headless302/302+11/11 tatsächlich PASS/inputs_unchangedtrue,
  17:10:20.466–18:05:56.683UTC, Session31867 regulärExit0.
- Native Prepare/Clippy/300Rust+3ignored/echteNode-Rust-Integration/Release
  PASS/stabil, Ende17:13:47.334UTC, Session99803 geschlossen.
- Native Konverterkampagne native-regression-ss9aQx PASS/stabil,
  17:10:22.324–17:14:50.840UTC:38PDF/67Worker+0Skip/49Office/41Grafik.
- Paket5/100MD0Fehler/Originale unverändert, Ende17:18:01.074UTC,
  Session69837 regulärExit0, PACKAGE-FINALPASS/stabil. Exakter Vollcommit im
  wirklichen Windowsbinary und PDF.js-Derivation/Grafikclosure separat geprüft.

Neue Tabellenfamilien39/107/58/17 und tatsächliche kodierte Quellen-/Keep-
Gegenorakel grün. Nicht disjunkte Unterfamilien nicht zu einer künstlichen
Gesamtzahl addiert. Kein Desktop-PASS aus VM/Headless abgeleitet.

Beide neuen Macconsumer39992799112 exakt aufe253380e… SUCCESS:
ARM120548621637 Ende17:32:33UTC, Intel120548621595 Ende18:02:38UTC.
Je283Rust+3ignored/38PDF/65Worker+2Windows-SKIPs/49Office/41Grafik plus
tatsächliche Core-/Ownership-/App-/ZIP-/DMG-/Native-Seal-Gates. Neue separate
Ganzlogreviews gelesen: ARMef6d62ca…(Log5a558c0d…/7122Zeilen),
Intel3f4051cf…(Logef2879cc…/7182nichtleereZeilen), ohne neuen bestätigten
Primär-/Bindungsblocker. Erwartete Negativdiagnosen/Windows-SKIPs nicht zu
Fehlern oder PASS umetikettiert. Temporäre PDF-Testloader-Canvaswarnung mit
tatsächlich explizitem Canvas-/Pixellauf eingeordnet, nicht still beseitigt.

Beide tatsächlichen Transportartefakte create-only gesammelt, unveränderte
VERIFYsoktrue/Exit0. Zusätzlich unabhängigen Windowsbytegegenreviewf78cb0d0…
und separaten Macbytegegenrevieweb7f63c4… vollständig gelesen:351Quell-Gitblobs,
243gemeinsameRuntimequellen,Inventare,47Policyinputs,Core/Converter,
PDF-Derivation,Grafik-/Font-/Lizenz-/SBOMpins tatsächlich passend. Macprüfung
rechnete63247ARM-/65898Intel-CodeDirectory-Seitenhashes nach. Kein lokaler
nativer codesign-/DMGmount-/Appletrust-/UAT-PASS daraus; diese nativen Rollen
sind getrennt durch die exakten CI-Logs belegt. Keine Macbytes aufWindows ausgeführt.

| Tatsächliches Apparchiv | Bytes | SHA256 |
| --- | ---: | --- |
| Windows x64 ZIP | 113404384 | 0fe15225011281e659b3f07f8b37c42e1f1e50635008223b9902036b6a2966c2 |
| macOS ARM64 ZIP | 118751741 | 696377512bca66c096e91d5ba5a4114fdb864c27d4d9088dc1ef2253e4c428b2 |
| macOS ARM64 DMG | 131955539 | 5a60f9d0a40cbbb5533e20692cfc7ad7336f9d62b1d94adb8402391eb82b4137 |
| macOS Intel ZIP | 122007160 | d317625e26d4b855c2e5f44e9880fe24c5efbe28a5ab6945b116a95807a08837 |
| macOS Intel DMG | 135181731 | 02b359a66337a4a3e18dba698e91d8a2d472baac8ccfe2626d1e7bae53035e46 |

WindowsEXE07a3768dd909eae11f77d1d08876a01720a19850f049902454a237a3f35fc6c7.
SourceSnapshot18:07:39.515UTC,977Dateien/8784104Bytes,
SHAa3eaba19a207ca63d0a147aa4a9b6a4d065067b301ad40fcd539c6c7020f38eb,
exakte Archivbytes geprüft. Getrennter lokaler Quellenoverlay, kein alter
Snapshot umetikettiert oder als eigenständiger vollständiger Checkout beworben.
Keine privaten Nutzerdokumente/-Diagnosen/-Läufe/-Zuordnungen/Realprobe in Git,
CI oder öffentliche Assets übernommen.

Nach Jobende nur Übergabe-Copy präzisiert: unterstützte Modelle statt beliebiger
gültiger Tabellen, explizit altes Word-w:hMerge unmodelliert; ganzer Wertschutz
für quellgebundene sensible Felder statt universeller sensibler Felderkennung.
Unabhängige Statement-/Copyreviews8d5779af…/d76c1ba8… gelesen, keine ausführbare
Kontrollflussänderung. Alle sieben Driverpins unverändert. Eigener späterer
Aufruf des reinen Vorbereitungstests scheiterte an dessen Forderung
nach noch nicht vorhandenem CHECKPOINT.json; nicht als Produktfehler gewertet,
keine Prüfung/FINALdatei gelockert oder entfernt. Unveränderte synthetische
Proofnegativen erneut PASS, echte Übergabe-check-only-Gates anschließend PASS.

Windowslokal create-only `C:\Users\arkud\Documents\Software DataSecure\RC173`,
19Dateien vollständig hashgleich kopiert:ZIP,50723ByteTestplan,3unveränderte
synthetische Archive,README,Prüfsummen,Quellen-/Paket-/Testbelege und
USER-ACCEPTANCE.json/PENDING. Alte Ordner/Ergebnisse/Profile unberührt.
Stage exakt20Assets:5Apparchive+3Testarchive+8SingleSHA+2Pläne+Evidence+SHA256SUMS.
Die19Aggregateinträge schließen SHA256SUMS selbst aus. Native-/Mac-/GUI-
Evidence wird nicht aus alten Versionen übernommen; GUI0PASS/19NOT_RUN.

Neuer Tagv3.2.0-rc173 exakt aufe253380e… remote nachgelesen. Release422165357
veröffentlicht23.10.2026 18:17:26UTC, PreRelease=true/Draft=false,
[GitHub-Test-Pre-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc173).
Alle20Assets im Draft und erneut nach Veröffentlichung vollständig frisch
heruntergeladen/gehasht:625600867Bytes je Modus. Exaktes Inventar/dieselbenIDs/
Tagcommit/Quellcommit/PreReleaseflag bestätigt. Remote-Draftproof18:17:13.087UTC,
Publishedproof18:18:34.767UTC, beide regulärExit0. Tatsächlichen Notesbody in
beiden Modi separat CRLF-normalisiert/TrimEnd mit lokalerDatei verglichen:gleich;
NotesSHA5f5ad9d970bb473f758e35d2cd89e3a0a9434c36f7afefb158f57dd7f4530b50.

Desktop-/Office-/Excel/Numbers-/Finder/TCC/M2/Enterprise/VoiceOver/macOS26-
Abnahme bleibt USER_PENDING. macOS26-CIgateSkipped, nativeEpoch/Pause/Lease/
GUINOT_RUN,ACLadversarialPARTIAL,LaunchServicesexitcodeunbekannt,
Smoke-WriterquieszenzUNCONFIRMED/Extraktionerhalten/deletionNOT_ATTEMPTED.
Keine Vollprozessbaum-/Universalformat-/Artefaktfreiheits-/Anonymitätszusage.
Eigene MacApp/Core nur ad hoc, keine Developer-ID/Notarisierung/Zertifikatssuche/
Appleeinreichung oder OS-Schutzänderung. Keine Mainintegration. Nachfolgender
reiner Dokumentationscommit verändert App-/Paket-/Tagbindung nicht.

Nach Veröffentlichung aktuelle Versions-/Canonical-/Dokumentationsvertrag30/30-,
Link3/3- und UATkit6/6-Prüfungen grün. Zusätzliche formale UAT-Dokprüfung deckte
einen veralteten aktuellen RC168-Verweis im FORMAL_UAT/README auf, nachdem der
Releasevertrag nun RC173 bindet. Nur diesen Dokumentationsverweis eng ergänzt,
RC168 als historischen Kandidaten bewahrt; kein App-/Test-/Paketedelta oder
Abnahmestatus geändert. Keine neue Runtimeursache aus diesem Dokufehlversuch.
Danach unveränderte Formal-UAT-Prüfung5/5 und Fixturegenerierung3/3 PASS,
Dokumentationsvertrag30/30,Links3/3 und Canonical erneut PASS. Fingerprint
weiter exakt8b1644e…/351. Abschließender Nachtrag nur sieben Dokumente,
keine Änderung der getesteten Produkt-/Test-/Paketbytes oder Releaseassets.
