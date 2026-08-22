# RC30-Ist-Abgleich zum kanonischen Backlog

Stand: 22.08.2026 · geprüfter Produktstand: `b622278` auf `main`

Dieser Nachweis verhindert Doppelarbeit. `erledigt` bedeutet vollständig gegen das
Ziel abgenommen, `teilweise` bedeutet wiederverwendbare Implementierung mit klarer
Restdifferenz, `offen` bedeutet ohne belastbare Produktimplementierung. Testdateien
sind Evidenz für Codeverhalten, nicht automatisch für installierte Claude-Oberflächen.

## BL-001 – Kanonisches Dokumentensystem

Status: **erledigt**

Vorhanden: `docs/canonical/*`, Entscheidungs-/Backlog-/Traceability-IDs und
`scripts/verify-canonical-docs.mjs`. Das Wiederverwendungsregister
`OPEN_SOURCE_COMPONENTS.md` ordnet jedem Epic Open-Source-Kandidaten oder eine
begründete Eigenimplementierungs-Restlücke zu; der Dokumententest blockiert fehlende
Epic-Zuordnungen. Rest: Kandidaten je Story praktisch evaluieren und das Register bei
jeder Auswahl oder Ablehnung pflegen.

## BL-002 – Ist- und Ziel-Fähigkeiten

Status: **erledigt**

Vorhanden: `BUILD_INFO.json`, `manifest.json`, `gateway/status.js` und Manifesttests
beschreiben RC30 fail-closed mit TXT/DOCX. Das getrennte
`TARGET_CAPABILITIES.json` erfasst alle DS-IDs, Zielformate, Plattformen und Grenzen
ausdrücklich als Nicht-Runtime-Vertrag. `test-capability-contract.js` blockiert Drift
zwischen Ist-Metadaten, Runtime, Skills, Marketplace und aktiven Handbüchern und
verhindert, dass der Zielvertrag als aktuelle Plugin-Fähigkeit ausgegeben wird.
Rest: nur laufende Vertragspflege bei jeder Capability-Änderung.

## BL-010 – Plattformpakete

Status: **teilweise**

Vorhanden: Plugin-ZIP und MCPB, bytegenaue Paketparität, Windows-x64-Launcher sowie
Dateiauswahladapter für Windows, macOS und Linux. Rest: automatische OS-Paketwahl,
installationsfreie Plugin-Runtime, produktionsfähige macOS-/Linux-Komponenten sowie
frische ZIP-/Marketplace-Installation und Rückrolle auf allen drei Plattformen.

## BL-011 – Fortsetzbarer Job Store

Status: **teilweise**

Vorhanden: persistente Batch-Snapshots, monotone Companion-Journale, atomare Claims,
Crash-Recovery, Retention und Einzelläufe ohne automatische Doppelverarbeitung;
abgedeckt durch `test-batch-session`, `test-companion-job-store`,
`test-companion-retention` und `test-gateway-e2e`. Rest: 100 statt 25 Dateien,
500-MB-Gesamtgrenze, genau ein aktiver Stapel systemweit sowie echte Fortsetzung
gestoppter/pausierter Dateien statt terminalem `stopped`.

Zielvertrag ergänzt: `contracts/BATCH_SNAPSHOT_V1.md` legt private atomare Kopien,
Originalunabhängigkeit, Journalzustände, Crashfenster und Löschregeln für BL-011.1
fest; `test-architecture-contracts.js` schützt die Mindestanforderungen.

## BL-012 – Fortschritts- und Abschlussfenster

Status: **teilweise**

Vorhanden: Windows-Textreview, lokale Bestätigung und Abschlusszähler; Abbruch und
Timeout stoppen sicher. Rest: ein stapelweiter Abschlussdialog nach vollständiger
Verarbeitung, „Später entscheiden“, Fortschrittsanzeige, Barrierefreiheit und
gleichwertige macOS-/Linux-UI.

## BL-020 – Content-Graph und Coverage

Status: **teilweise**

Vorhanden: gehärteter ZIP-Leser, OOXML-Partprüfung, Warnungen für externe oder
unbekannte inhaltstragende Parts, Attachment-Quellen und fail-closed Parserfehler.
Rest: ein formatübergreifender versionierter Content-Graph mit stabilen Locators für
Text, Tabellen, Bilder, Kommentare, Notizen, PDF-Objekte und rekursive Anhänge.

## BL-021 – TXT, Markdown und CSV

Status: **teilweise**

Vorhanden: Parser für UTF-8-TXT/MD sowie CSV-Fence-Härtung; TXT ist im Pilot aktiv.
Rest: MD/CSV aus dem Release-Gate nehmen, Encoding-/Dialekt-/Tabellen-Coverage
vollständig nachweisen und sicheren Markdown-Export abnehmen.

## BL-022 – DOCX, XLSX und PPTX

Status: **teilweise**

Vorhanden: OOXML-Parser und Tests für DOCX, XLSX, PPTX, Tabellen, Shared Strings,
Textfelder, Folientext, Notizen, Bilder, Beziehungen und Coverage-Warnungen; DOCX ist
im Pilot aktiv. Rest: XLSX/PPTX produktiv freigeben und Kommentare, Kopf-/Fußbereiche,
Formeln, Charts, alle relevanten Beziehungen und eingebettete Dokumente positiv
abdecken.

## BL-023 – PDF und Scan-PDF

Status: **in Arbeit**

Vorhanden: PDF-Signaturerkennung, adversariale Legacy-Tests, gesperrter PDF-Pfad und
ein reproduzierbar gelockter PDFium-Engineering-Spike. Unter DS-038 wurde zusätzlich
ein gelockter PDF.js-6.2.108-/Canvas-1.0.7-Pilot begonnen. GitHub-Actions-Lauf
`32594467568` belegt auf Windows x64, macOS x64/ARM64 und Linux x64 Byte-Eingabe,
Textextraktion, Seitenrendering, JavaScript-Action-Erkennung und null beobachtete
Netzwerkversuche. Alle vier Artefakte bleiben ausdrücklich `no_go`. Rest:
produktiver isolierter PDF-Worker, vollständige
Text-/Font-/Formular-/Annotation-/Anhang-/Visual-Coverage,
Verschlüsselung und Scan-OCR; bis dahin bleibt `PDF_COVERAGE_UNVERIFIED` aktiv.

Das neue `contracts/PDF_OCR_RISK_GATE_V1.md` definiert dafür eine einheitliche
Pflichtmatrix für Windows, macOS und Linux. Alle Zellen stehen weiterhin auf `offen`;
deshalb bleibt BL-023.1 in Arbeit und PDF produktseitig gesperrt.
`pdf-ocr-risk.lock.json` pinnt den offiziellen PDFium-Stand sowie Tesseract 5.5.2
und die deutschen/englischen `tessdata_fast`-Modelle als Prüfkandidaten. Der manuelle
Workflow `pdf-ocr-risk.yml` erzeugt getrennte NO-GO-Preflights für Windows x64,
macOS x64/ARM64 und Linux x64. GitHub-Actions-Lauf `32593313169` auf `fdd2a02`
bestand am 22.08.2026 alle vier Preflights (`windows-latest`, `macos-15-intel`,
`macos-14`, `ubuntu-latest`). Alle meldeten gültige Pins, den geschlossenen
Produktpfad `PDF_COVERAGE_UNVERIFIED`, keine bestandene Pflichtzelle und
`release_decision: no_go`. Auch das Windows-Community-Negativ-Gate bestand, weil
die Probe erwartungsgemäß weiterhin `no_go` meldete. Ein offizieller Eigenbuild und
die übrigen Pflichtzellen bleiben offen.

## BL-024 – Offline-OCR und Bilder

Status: **teilweise**

Vorhanden: PNG/BMP-Decoder, JPEG-Metadatenentfernung, OCR-Offset-Mapping,
Pixelredaktion, Visual-Gates und ein real getesteter Windows-OCR-Pfad. Rest:
gebündelte Deutsch-/Englisch-OCR auf macOS/Linux, gemischtsprachige Abnahme,
eigenständige Bildfreigabe als Markdown sowie sichere fachliche Grafikprüfung.

Unter DS-038 ist zusätzlich ein exakt gelockter portabler Pilot vorhanden:
Tesseract.js 7.0.0, tesseract.js-core 7.0.0 und `@napi-rs/canvas` 1.0.7 verwenden
ausschließlich lokale, hashgeprüfte `deu`-/`eng`-Modelle aus dem tatsächlichen
`tessdata_fast`-Commit `65727574dfcd264acbb0c3e07860e4e9e9b22185`. Der lokale
Windows-x64-Lauf bestand eine synthetische gemischtsprachige Probe bei vorgeladener
Prozess-Netzwerksperre mit 95 Prozent mittlerer OCR-Konfidenz. GitHub-Actions-Lauf
`32594838193` auf `b6ce3ad` bestätigte dasselbe Ergebnis auf Windows x64, macOS
x64/ARM64 und Linux x64. Alle vier Artefakte melden lokale Modelle,
`mixed_language_ocr: true`, Prozess-Netzwerksperre und 95 Prozent Konfidenz. Das ist nur
Engineering-Evidenz: Produktintegration, Modell-Lizenzdateien, isolierter Worker,
Ressourcengrenzen, Scan-PDF, Pixelredaktion, Angriffskorpus und frisches Pluginpaket
bleiben offen; der Pilot meldet deshalb `OCR_COVERAGE_UNVERIFIED` und `no_go`.

GitHub-Actions-Lauf `32595199861` auf `fcb55ed` ergänzte auf denselben vier
Plattformzielen ein mit dem offiziellen `npm sbom` erzeugtes CycloneDX-1.5-SBOM.
Je Plattform wurden 25 gelockte Paketkomponenten mit vollständigen SHA-512-
Integritätswerten und ausschließlich Apache-2.0, MIT oder BSD-2-Clause nachgewiesen.
Die Apache-2.0-Lizenzdatei der Sprachmodelle ist zusätzlich an denselben Quell-Commit,
ihre Größe und SHA-256 gebunden. Das erfüllt noch nicht die Pflichtmatrix: vollständige
Notice-Texte, Schwachstellenrichtlinie, verteilbares Runtime-Bundle und frische
Pluginpakete bleiben offen.

GitHub-Actions-Lauf `32595454727` auf `fa34c91` führte OCR anschließend auf allen
vier Plattformzielen in einem separaten Prozess mit vererbtem Netzwerkverbot,
512-MiB-Node-Heap, 50-Sekunden-Wächter und 64-KiB-Ausgabegrenze aus. Timeout- und
Ausgabeflut-Gegenproben wurden überall sicher beendet. Windows verwendete zusätzlich
das verifizierte Job Object mit 768 MiB RAM, 40 Sekunden CPU und 45 Sekunden
Job-Laufzeit. macOS und Linux verwenden das Node-Permission-Modell; native harte
RAM-/CPU-Grenzen sind dort noch offen. Die Produkt-Runtime nutzt diesen Pilotpfad
noch nicht und bleibt unverändert fail-closed.

BL-024.1 besitzt jetzt zusätzlich den plattformneutralen Vertrag
`contracts/OCR_RESULT_V1.md` mit strengem JSON-Schema. Der Pilot fordert die seit
Tesseract.js 6 standardmäßig deaktivierte Blockausgabe ausdrücklich an und reduziert
Backenddaten auf NFKC-Text, Zeilen-/Wortindizes, halb offene Pixelboxen und
Konfidenzen. Niedrige Konfidenz verwirft kein Wort; leere oder selbst perfekte OCR
belegt keine Datenschutzfreigabe, und `requires_visual_review` bleibt in V1 immer
aktiv. Die Grenzen stimmen mit den kleineren bestehenden Runtimegrenzen überein:
25 MiB Eingabe, 30 Millionen Pixel, 5 Millionen Zeichen und 100.000 Wörter. Acht
lokale Vertrags- und Negativtests bestehen. GitHub-Actions-Lauf `32596087930` auf
`f53f5df` bestätigt Vertrag, echte gemischtsprachige OCR und Negativtests auf Windows
x64, macOS x64/ARM64 und Linux x64. Native harte macOS/Linux-Ressourcengrenzen stehen
noch aus; BL-024.1 bleibt daher in Arbeit und der Produktpfad geschlossen.

Als nächster BL-024.1-Schritt ist ein abhängigkeitloser POSIX-C-Supervisor im
Engineering-Pilot implementiert. Er startet Node ohne Shell in einer eigenen
Prozessgruppe, setzt `RLIMIT_CPU` und kein Core-Dump, überwacht den physischen
Speicher nativ über Linux `/proc/<pid>/statm` beziehungsweise Apples
`proc_pid_rusage` im 10-ms-Takt und beendet die ganze Gruppe bei Grenzverletzung.
Der Workflow baut den Quelltext auf beiden macOS-Architekturen und Linux und prüft
zusätzlich echte Speicher- und CPU-Überschreitungen. Lauf `32596426359` auf
`4c9f0ec` bestand diese Grenzen zusammen mit Vertrag, Offline-OCR und übrigen
Negativproben auf Windows x64, macOS x64/ARM64 und Linux x64. BL-024.1 ist damit
abgeschlossen. BL-024.2 ist jetzt in Arbeit; Runtime, Modelle und native Launcher
sind installationsfrei pro Zielarchitektur gebündelt, aber noch nicht in den
ausgelieferten Pluginpfad integriert, der unverändert geschlossen bleibt.

Für BL-024.2 existiert nun ein erster reproduzierbarer Runtime-Bundle-Builder. Er
kopiert nur die gelockte Tesseract-Laufzeitabhängigkeitsmenge, lokale Modelle,
OCR-V1, Netzsperre und den zielabhängigen nativen Supervisor, erstellt für jede Datei
Größe und SHA-256 und setzt `release_enabled: false`. Canvas bleibt als reines
Testwerkzeug außerhalb des Anwenderbundles. Das lokale Windows-x64-Bundle hat rund
57,5 MB und bestand Inventar-, Lizenzindex-, echten Offline-OCR- und inhaltsfreien
Fehlerpfadtest. GitHub-Actions-Lauf `32597030060` auf `7427b3c` baut, prüft und testet dieselben
Bündel auf Windows x64, macOS x64/ARM64 und Linux x64 und sichert sie als
14-Tage-Artefakte. Nur `tr46@0.0.3` liefert weder im npm-Tarball noch im zugehörigen
Upstream-Tag eine eigene Lizenzdatei. Der Builder ergänzt deshalb ausschließlich für
diese exakte Version den vollständigen, laut Paketmetadaten geltenden MIT-Text samt
Autor- und Herkunftshinweis; jeder andere fehlende Lizenztext stoppt den Build.
Produktintegration und frische Pluginpakete bleiben offen.

Der erste Produktadapter `server/portable-ocr.js` ist nun im Pluginpfad vorhanden.
Er ordnet ausschließlich die vier vereinbarten OS-/Architekturziele zu, lehnt Links,
Zusatzdateien, fehlende oder hashabweichende Dateien ab, verlangt den OCR-V1-Vertrag
und `release_enabled: true` und startet den Worker über den gebündelten nativen
Supervisor mit RAM-, CPU-, Zeit-, Ausgabe- und Netzwerkgrenze. Das aktuelle Plugin
liefert noch kein freigegebenes Bundle aus; auf Windows bleibt daher der bestehende
Bridge-Pfad aktiv, auf macOS/Linux bleiben visuelle Inhalte unverändert lokal
zurückgehalten. Sieben Adaptertests belegen Plattformauswahl, gesperrtes Gate,
Manipulations-/Zusatzdateistopp, positiven Vertragspfad und inhaltsfreie
Ressourcenfehler und das feste OCR-V1-Fehlervokabular.

Beim ersten Zusammenführen der vier Laufartefakte wurde eine reale Lieferkettenlücke
sichtbar: `upload-artifact` hatte versteckte npm-Dateien trotz Manifest ausgelassen.
Der Assembler verweigerte deshalb die Quelle. Der Workflow ist auf vollständigen
Hidden-File-Upload umgestellt. Lauf `32597783210` auf `df1c85f` bestätigt den
vollständigen Download und schließt diesen Defekt.

Der Universal-Assembler und sein V2-Vertrag sind implementiert. Er dedupliziert die
auf allen vier Plattformen nachweislich bytegleichen 239 Runtime-/Modell-/Notice-
Dateien und ergänzt nur vier zielgebundene Supervisoren; das erwartete Bündel bleibt
damit unter 65 MiB statt vier Runtime-Kopien zu tragen. Acht synthetische
Assemblerchecks und die Adaptertests bestehen. Lauf `32597783210` bestätigt den
vollständigen Cloud-Download, die Assembly und einen echten Linux-Smoke-Test. Das
erneut lokal heruntergeladene Ergebnis besitzt 244 inventarisierte Dateien,
57.592.942 Bytes und bleibt mit `release_enabled: false` gesperrt. Offen ist seine
Einbettung in die echten ZIP-/Marketplace-Pakete mit erhaltenem POSIX-Ausführungsbit.

Ein separater Engineering-Builder bettet das gesperrte Universal-Bundle inzwischen
in einen echten Plugin-ZIP ein, ohne den kanonischen Marketplace-Quellbaum zu
verändern. Der lokale Build besitzt 319 Einträge, 22.033.239 Bytes und bestand
Quellparität, vollständige Runtime-Hashprüfung und Modusprüfung. Der deterministische
ZIP-Writer normalisiert reguläre Dateien auf `0644` und setzt nur die drei POSIX-
Launcher auf `0755`. Cloud-Reproduzierbarkeit und echte Linux-Extraktion sind im
nächsten Lauf zu bestätigen; Marketplace-Parität bleibt danach noch offen.

## BL-030 – Stapelweite Entitätsauflösung

Status: **teilweise**

Vorhanden: Profil `auto`, mehrere Fachprofile, kontextbezogene PII-Engine und
deterministische Pseudonyme innerhalb eines einzelnen Dokuments. Rest: automatische
Profilentscheidung pro Datei im gemischten Stapel und ein flüchtiger gemeinsamer
Pseudonymkontext über alle Stapeldokumente.

Zielvertrag ergänzt: `contracts/BATCH_PSEUDONYM_V1.md` definiert eine über den
OS-Benutzerschutz gesicherte HMAC-Ableitung ohne persistente Rohwert-Mappingtabelle,
Versionierung, Ablauf und Neustartverhalten für BL-030.1.

## BL-031 – Organisationen und Zertifizierungen

Status: **teilweise**

Vorhanden: versionierter lokaler Zertifikatskatalog, fundstellenbezogene
Kontextregeln, Ambiguitäten und umfangreiche Regressionen für IT-/Health-IT-Begriffe,
Aussteller, Arbeitgeber, Kunden und Vertragsparteien. Rest: Abschlussdialog über den
gesamten Stapel, Gruppenentscheidungen und Ausbau anhand des 1.000-Dokument-Korpus.

## BL-032 – Passwörter und lokale Entscheidungen

Status: **teilweise**

Vorhanden: Windows-Review mit lokalen Redaktionen, fundstellenbezogenen
Ambiguitätsentscheidungen, Zurück/Ändern und technisch gebundenem Skip; Claude kann
weder reviewen noch freigeben. Rest: lokaler Passwortdialog, RAM-only-Secretvertrag,
„Später entscheiden“ und gleichwertige macOS-/Linux-Review-UI.

## BL-040 – Dauerhafter Export

Status: **offen**

Vorhanden: pro Quelle ein geprüftes Markdown-Paket, Manifest, datensparsames Audit,
atomare Veröffentlichung und paketgebundene Leseberechtigung. Rest: wählbarer
dauerhafter Exportordner, neutrale Dateinamen, UTF-8-Mapping-CSV, stapelweites JSON,
Kollisionsschutz und technische Trennung des Mappings von allen MCP-Lesetools.

## BL-041 – Claude-Aufgabe fortsetzen

Status: **teilweise**

Vorhanden: zwei validierte Skills, natürliche Aktivierung, Capability-Stopp,
Upload-Stopp, fortsetzbare Einzelschritte und capability-gebundenes Markdown-Lesen.
Rest: neuer lokale-Auswahl-/Jobweg, Ziel-Formatumfang und installierte Modell-/UI-
Abnahme für natürliche Sprache sowie direkte Skillauswahl auf allen Zieloberflächen.

## BL-042 – Kommunikation und Diagnose

Status: **teilweise**

Vorhanden: datensparsames Diagnosejournal mit fester Whitelist, Statuswerkzeug,
Retention, Rechts-/Zertifizierungsgrenzen und technische Fehlercodes hinter Details.
Rest: explizit exportierbares plattformübergreifendes Diagnosepaket und abschließende
Alltagssprach-/Barrierefreiheitsprüfung.

## BL-050 – 1.000-Dokument-Korpus

Status: **teilweise**

Vorhanden: 150-Fall-Vertragsmatrix, 76 PII-Regressionen, 24 Skill-Szenarien,
20 Explorationsfälle, Parser-/Visual-/Security-Tests und ein messender
Detektorbenchmark. Rest: mindestens 1.000 dokumentartige Fixtures über alle
Zielformate, Layouts, Sprachen und Angriffe sowie die verbindliche Null-Miss-/99-%-
Erhaltungsmetrik.

## BL-051 – Plattform- und Distributionsmatrix

Status: **teilweise**

Vorhanden: Windows-, macOS- und Linux-CI, Windows-Native-Tests, ZIP-/MCPB-Build,
SBOM, Prüfsummen und Quellparität. Rest: echte frische ZIP- und Marketplace-
Installationen, kompletter End-to-End-Weg und Rückrolle auf Windows/macOS/Linux;
CI nutzt derzeit auf macOS/Linux noch eine ausdrücklich eingerichtete Node-Runtime.

## BL-052 – Menschliche Abnahme

Status: **offen**

Vorhanden: dokumentierte UX-, Datenschutz-, Security-, Architektur- und
Claude-Dokumentationsreviews sowie automatisierte native Windows-Formtests. Rest:
beobachtete Abnahme mit normalen Anwendern und Fach-/Datenschutzvertretung auf allen
drei Plattformen. Echtdaten bleiben bis zu einer separaten Pilotentscheidung NO-GO.
