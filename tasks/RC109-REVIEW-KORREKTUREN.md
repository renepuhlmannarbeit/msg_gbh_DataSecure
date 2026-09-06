# RC109 – Umsetzung und Gegenprüfung des Gesamtreviews

Stand: 06.09.2026 · lokaler Arbeitsbaum auf `main`, Basis `ca1a0ee`.
Die bereits vorhandenen RC109-Start-/Verlaufsänderungen wurden beibehalten.
Dieser Bericht ergänzt das [archivierte unabhängige Ausgangsreview](archiv/2026-09-06-rc109-gesamtreview.md);
er ersetzt dessen damalige Befunde nicht rückwirkend. Maßgebliches Arbeitsprogramm
bleibt das [kanonische Backlog](../docs/canonical/BACKLOG.md).

## Produkt- und Umsetzungsgrenze

Zwei Produkte bleiben erhalten: lokales Cowork-Plugin und eigenständige
Standalone-App. Standalone besitzt Anonymisierung **und** reine Markdown-
Konvertierung. Ein Format im Konverter erweitert keine Anonymisierungsfreigabe.
Keine neue Cloudkomponente, kein Keyring, keine VM, kein Zusatzkonto und keine
neuen Anwenderbestätigungen. Gemeinsame Zustandslogik wird im Core gebündelt;
MCP- und Desktopadapter behalten getrennte Daten- und Kommunikationsgrenzen.

## Befunde, Lösung und Gegenbelege

| Befund | Lösung / Prüfpfad | Bestehende Arbeit |
|---|---|---|
| F-01: Review vor verbleibender Arbeit | Gemeinsamer `batch-next-action`-Vertrag. Pending, Retry, Verarbeitung, Lieferung und Zuordnungsreparatur gehen vor dem Sammelreview. Standalone aktuelle/ältere Fortsetzung und MCP verwenden dieselbe Entscheidung. 22 integrierte Standalone-Fälle und echte MCP-stdio-Gegenproben. | BL-011.3/8, BL-010.29, BL-043 |
| F-02: verschobene XLSX-Zellen | Begrenzter struktureller XML-/XLSX-Reader statt Zellregex. Leere/self-closing Zellen, Sparse-Zeilen, beide Attributquotes, Namespace-Aliase und Shared Strings bleiben positionsgebunden. | BL-022, BL-010.28 |
| F-03: beschädigtes XLSX als Teilerfolg | XML-Abschluss, Verschachtelung, Attribute, Namespaces und Ressourcenlimits werden geprüft. `XLSX_STRUCTURE_UNSAFE` erzeugt kein Artefakt; nächstes intaktes Dokument wird verarbeitet. Kein vollständiger XSD-Validator behauptet. | BL-020, BL-022, BL-010.28 |
| F-04: BMP32 verschwindet bei OCR | Bei `BI_RGB` ist das hohe Byte unbenutzt, nicht Alpha. Opake Pixel; nicht unterstützte DIB-/Maskenvarianten stoppen. Unabhängig konstruierte BMPs laufen in beiden Zeilenrichtungen durch echte lokale OCR. | BL-024.2, BL-010.28 |
| F-05: Schemas nur angezeigt | Ajv-generierte, an den Toolkatalog gebundene Offline-Validatoren laufen vor jeder bekannten MCP-Aktion. Invalides `null`, Array, Typ, Zusatzfeld oder fehlende Pflichtangabe verändert keine Übergabe. Keine Eingabedetails in Fehlern/Logs. | BL-041, BL-002 |
| F-06: falsche Abschlusszähler | `completed` zählt bereitgestellte und endgültig gestoppte Dateien. Gestoppt mit offener Zuordnung bleibt offen. Recovery und Verlauf verwenden die gemeinsame Progressprojektion statt abweichender eigener Zählregeln. | BL-011.3, BL-010.29 |
| F-07: zu frühes grünes Testurteil | Fälle werden vor dem Callback registriert. Abschluss wartet auf Fälle und Bereinigung. Fehler setzen Nonzero-Exit, auch spät/reentrant. Neun echte Childprocess-Sentinels; falsche Sync-/Async-Testaufrufe werden bereinigt, Assertions nicht abgeschwächt. | BL-002, BL-050 |
| F-08: widersprüchliche Konzeption | Aktive Architektur, Security, UML, Refactoring, Produkt-, Test- und OSS-Doku ersetzt alte Einprodukt-/MarkItDown-/Navigationsaussagen. Zentrale Produkt-/Zweckmatrix; DS-085/086 im Dokumentindex. Negative Driftprüfungen und indexbasierte Linkprüfung. | BL-001/002/003 |
| F-09: Standalone-only Änderungen ohne CI | Beide Ereignisfilter umfassen `apps/datasecure-standalone/**`. Unverändert ein kostenbegrenzter Job; keine zusätzlichen automatischen Plattformbuilds. | BL-051.1, BL-002 |
| F-10: historischer Test als aktuelles MCP-E2E bezeichnet | Gatewaytest als interner Integritätstest mit historischen Fassaden und Mock-OCR eingeordnet. Nützliche Assertions bleiben; echte MCP-Evidenz wird getrennt benannt. | BL-002, BL-041 |

Zusätzliche Gegenchecks fanden einen reentranten Abschlussfehler im neuen
Testgerüst sowie eine abweichende Verlaufszählung; beide sind in F-07/F-06
mit behoben. Ein unabhängiger MCP-Gegencheck reproduzierte außerdem verweigerte
Fortsetzungsstarts ohne ACK und eine interne Stapelkennung in Fehlerantworten.
Diese Fälle sind an beiden Workerzweigen und der tokenfreien Projektion
abgesichert, nicht durch Umdeuten der Erfolgsmeldung.

Der Zustands-Gegencheck ergänzt F-01 um drei weitere Fälle: unbekannte
Positionen dürfen keine Reviewbereitschaft belegen; eine bereits vorbereitete
Auswahl bleibt bei allgemeiner Fortsetzung unberührt; ein zwischenzeitlich
abgeschlossener Lauf darf keinen neuen Worker starten. Der gemeinsame
Progressvertrag zählt deshalb jede Position, und beide Standalone-
Fortsetzungen behandeln den terminalen `none`-Fall ausdrücklich. Fachlich
unvollständige alte Review-Mocks werden vervollständigt statt Guards zu lockern.

F-11: Ein echter Pluginbau zeigte darüber hinaus einen fehlenden Paketimport
der neuen Verlaufspersistenz. `gateway/standalone-history-store.js` trennt nun
die kanalgebundene Core-Persistenz vom Standalone-Verlaufsadapter. Die
Paketausschlüsse bleiben unverändert. `test-runtime-release-path.mjs` prüft
die echte Produktprojektion und absichtlich entfernte transitive Module;
dieses Gate läuft künftig ausdrücklich in jedem Produktprofil.

Weitere Testschulden: Der MarkItDown-Differentialtest nutzte die synchrone API
für einen asynchronen Fall. Eine ENOENT-Probe initialisierte eine Test-Suite
ohne Abschluss. Beide wurden korrigiert, ohne Assertions oder den strengeren
Harness abzuschwächen. Ein alter Cowork-Oberflächentest verlangte wörtlich
`delete safe.batch_token`; die tokenfreie Allowlist und ACK-Reihenfolge werden
jetzt durch echte stdio-Gegenproben geprüft statt durch diese Code-Schreibweise.
Der späte Volltest fand außerdem einen isolierten Picker-Lifecycle-Test ohne
die neue `batchNextAction`-Abhängigkeit. Er nutzt nun den echten gemeinsamen
Progressvertrag und vollständige Start-/ACK-Testantworten; alle 27 Fälle
bestehen. Auch hier wurden keine Produktionsguards angepasst.

## Zusätzlicher Abbau der offenen technischen Schulden

Der zweite Durchgang arbeitet die bereits registrierten RC86-Restbefunde ab,
ohne einen zweiten Backlog oder zusätzliche Bestätigungsdialoge einzuführen:

| Bestehende Story | Umgesetzt und unabhängig gegengeprüft | Nachweisgrenze |
|---|---|---|
| BL-020.3 | Auch der Support-Review verwendet ausschließlich den vorhandenen geschützten Review-Worker. Der MCP-Prozess prüft nur Metadaten; Reparatur und Rekonstruktion erfolgen unter dem Worker-Lock. Rückgabe erst nach dessen Empfangsbestätigung, mit enger inhaltsfreier Projektion. Ein Gegencheck fand den falschen Statusschlüssel `local_intake_active`; die reale Reservierung heißt `local_intake_pending` und ist jetzt einschließlich Regression geschützt. | Fünf echte stdio-Testgruppen, Worker-/Netzwerk-/Reviewgates. Die OS-/Dialoggrenze wird gezielt substituiert; ACK beweist keine sichtbare Oberfläche. |
| BL-041.1 | Ein gemeinsamer Diagnosekatalog ersetzt abweichende Listen. IPC-Fehler tragen typisierte Codes; bekannte alte Meldungen werden nur bei ausdrücklicher Kompatibilitätsoption interpretiert. Unbekannte Codes werden nicht durch Fehlertext umgedeutet. Hinweise unterscheiden unbestätigte Übergabe von nicht erfolgter Verarbeitung. | 212 gezielte Fälle sowie Supportspur und Mehrprozessdiagnose; keine privaten Pfade oder Rohwerte im Katalog. |
| BL-021.1 | Begrenzte längengleiche Erkennungssicht für Fullwidth-Zeichen und Dot-Leader. Originalbytes, UTF-16-Fundstellen und Markdown-only bleiben unverändert. Numerische `tel`/`sms`-Ziele erfassen keine anschließende Prosa; benannte `callto`-Ziele bleiben vollständig geschützt. | 322 Fälle in zwölf Suites, einschließlich echter Plugin-/Standalone-Stapel, OCR-/Reviewoffsets und negativer Markdown-only-Kontrolle. Keine pauschale Confusable-Erkennung oder globale NFKC-Normalisierung. |
| BL-021.1, BL-002 | Ein separat reproduzierter alter IBAN-Überhang wird an eindeutig numerischen DE-/AT-/BE-Grenzen begrenzt. Nachfolgende E-Mail oder zweite IBAN bleibt eigenständig erkannt, auch nach zusätzlichen Zifferngruppen. Unklare numerische Fortsetzungen bleiben vollständig geschwärzt, auch über dem bisherigen 34-Zeichen-Match. | 20 Grenz-/Negativgruppen, 127 PII-Fälle und unabhängige Kombinationsproben. Keine Prüfziffernvalidierung als Freigabekriterium; unbekannte/alphanumerische Länderlayouts und uneindeutige Wortfolgen behalten konservative Überredaktion. |
| BL-011.8 | Eindeutig verwaiste private Intakekopien ohne Journal werden beim nächsten bestehenden Wartungslauf bereinigt, ohne zusätzliche TTL-Wartezeit. Strikt toter Owner, erneute Identitäts-/Journalprüfung und der vorhandene sichere Entferner sind Voraussetzung. | Unabhängig 143 Fälle in acht Suites einschließlich echter Worker. Lebende, wiederverwendete oder unklare PIDs, neue Journale und Austauschversuche bleiben geschützt. Keine Original-/Outputlöschung, kein neuer Timer und kein feindlicher OS-Race-/Power-Loss-Nachweis. |
| BL-041.10 | Skillkorpus umfasst nun 39 Fälle einschließlich DS-069-Erstziel, Wiederverwendung, Änderung, Reset, fehlendem Ziel und Sync-Hinweis; Bindung an die zehn normalen Werkzeuge. | 22 statische Korpus-/Vertragstests. Dies ist kein Modell-Eval und keine Cowork-Anwenderabnahme. |
| BL-010.9 | Sieben reine Verträge für Start, Zweck, nächste Stapelaktion, Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und Fortschritt liegen einmalig unter `server/core/`. Dateisystem-/Paketevidenz wird injiziert; alte Importpfade bleiben dünne Adapter oder Reexports. MCP und Standalone verwenden dieselben Bytes. | 13 direkte Core-Prüfgruppen einschließlich statischem esbuild-Importabschluss, VM-Ausführung und beiden echten Produktprojektionen. Format-/Profil-/Recovery-Goldenbreite bleibt BL-010.23. |
| BL-010.23 | SHA-256-Fingerprint bindet gemeinsame Core- und sämtliche Privacy-Module der beiden tatsächlichen Produktprojektionen. Semantische Goldenläufe verarbeiten TXT/Markdown/CSV/DOCX in allen fünf expliziten Profilen; personen-/unternehmensweite Identitätsbijektion bleibt über Dokumente und nach Abbruch/Fortsetzung in frischen Prozessen erhalten. | Neun Prüfgruppen decken Veröffentlichung, Reviewbereitschaft, Abbruch, Vertagung, ungültige Entscheidung und späteres Behalten/Schwärzen ab. Mutationstests erkennen Identitätskollaps, neue Identitäten, Rohwerte und verlorenen Fachtext. Zielhost-/Fachabnahme und ein persistierter Journalfingerprint bleiben getrennt. |

Der zweite unabhängige Identifier-Gegencheck fand zwei zusätzliche IBAN-
Kollisionen (Ziffern vor Folge-E-Mail beziehungsweise zweiter IBAN) und eine
echte Unterredaktion bei `tel:03012345678.anna@example.de`: In URL-redigierenden
Profilen konnte der E-Mail-Namensteil trotz leerem Residualbefund veröffentlicht
werden. Der Kontaktspan umfasst jetzt das Ende einer bereits erkannten,
teilweise überlappten E-Mail. Keine Änderung der globalen Trefferprioritäten,
keine Lockerung des Release-Gates. ASCII-/Fullwidth-, Offset-/Hash- und reale
Publikationsregressionen bestehen; 194 Fälle in PII-/IBAN-/Gateway-Suites.

Der erste Golden-Harness-Versuch lief in ein Timeout, weil eine einzelne
mehrdeutige Datei bestimmungsgemäß eine sofortige lokale Prüfung auslöst.
Der korrigierte Test verwendet einen echten Zweier-Stapel für die zugesagte
automatische Vertagung. Ein unerwarteter Reviewer-Aufruf lässt ihn scheitern;
keine fachliche Entscheidung oder Veröffentlichung wird simuliert. Die
Fehlversuche zählen nicht als grüne Evidenz.

Ein letzter unabhängiger Gegencheck reproduzierte eine Lücke nur im Pure-Core-
Test: Ein verzögerter Import nach einem nicht ausgeführten Zweig blieb beim
VM-Test unsichtbar. Die zusätzliche statische Analyse mit dem bereits gepinnten
esbuild schließt die Leaf-Map vor Ausführung; verzögerte, dynamische, indirekte,
fehlende und Glob-Imports besitzen Negativproben. 13/13 Fälle bestehen, ohne
Produktcode, Laufzeitabhängigkeit oder veröffentlichte Artefakte zu verändern.
Der Goldenvergleich ist semantisch (einschließlich erlaubtem abschließendem
Whitespace), kein bytegleicher Vergleich unterschiedlicher Pseudonymformate.

Die bereits vorhandenen Debug-/Supportwege bleiben getrennt vom normalen
Anwenderweg. Veraltete In-Process-Timeoutkommentare wurden berichtigt; die
Reviewmeldung verlangt keine KI-Lesebestätigung mehr für eine rein lokale
Bereitstellungsreparatur. Produktvision, UML, Traceability und Evidence-Matrix
unterscheiden weiterhin Anonymisierung und reine Konvertierung.
Der abschließende Kanon-Gegencheck bereinigt zusätzlich die Standalone-README
(kein Default, drei Ansichten, 20 Läufe), die Runtime-README (keine historische
OCR-Runtime im Cowork-Produkt) und den Anwenderreview (Mac-Codeblocker vor UAT).
Die drei abgeleiteten Dokumente stehen jetzt im maschinenlesbaren Dokumentindex;
zusätzliche Driftassertions schützen diese konkreten Widersprüche.

## Gegenreview und Evidenzstand

- Unabhängige Expertenarbeit für Fortsetzung/Zustände, Konvertierung und
  Dokumentkonsolidierung; anschließende getrennte Harness-/MCP-Gegenchecks.
- Ajv-Generator: 684 unabhängige Gegenproben zu 27 Schemas sowie Ausführung
  ohne `require`/Netzwerk/Dateisystem in einem isolierten Node-`vm`-Testkontext
  (keine Betriebssystem-VM). Die Schemaausführung belegt
  keine fachliche Vollständigkeit aller Schemas.
- Echte Konvertierung erneut: 27 Gruppen, einschließlich XML-Fehler ohne Artefakt,
  Folgedatei/Export/Zuordnung und BMP32-OCR. 100 TXT: 24.619 ms bei paralleler
  Reviewarbeit; keine wiederholten schweren Runtime-Lesevorgänge. Das ist eine
  lokale Einzelmessung, kein p95- oder plattformübergreifender Benchmark.
- Detektorbaseline nach den letzten Codekorrekturen: 150 synthetische Fälle,
  1.950 erwartete Treffer, keine False Positives/Negatives in diesem Korpus,
  alle 900 Fachtextkontrollen erhalten; 382,7 ms lokale Einzelmessung.
- Rust: 16 Tests bestanden. Dokumentationsgate: 86 Entscheidungen, 24 Epics,
  89 aktive Storydefinitionen; 24 Tests bestanden.
- Rust-Lizenzaufbereitung: vier Generator-/Negativtests; reales zielgebundenes
  Cargo-Inventar mit 259 erreichbaren Nicht-Dev-Crates, kein `NOASSERTION`.
- DOCX-Interoperabilität: 37 Struktur- und 77 Parserfälle grün. Bekannte
  Word-2010-Textfeld-Choices werden über ihre Namespace-URI gewählt; unbekannte
  Choices verwenden genau einen Fallback oder stoppen ohne Teilresultat.
- macOS-E0: ein einzelner scrollbarer AppKit-Sammelreview; AppKit-
  Abschlussmeldung verlangt sichtbares `SHOWN`. Companion 39, Completion 20,
  Confirmed-Presentation 4 und UI-Subprocess 12 Tests grün. Native Intel-/ARM-
  Ausführung bleibt offen.
- Gezielter Zustands-/Fortsetzungsgegencheck: 318 Tests in 13 Suites bestanden,
  zusätzlich der Verlaufstest; darunter MCP 56, Startup 51 und Batch-Session 69.
- Zwischenbau des ersten Korrekturblocks `dist/Review-RC109-Final-windows-x64.zip`:
  188 Einträge, 34.997.296 Byte, SHA-256
  `6fa776de9595fd820a2762f24e68386c1235554cce656b04ed52967b84865582`.
  `verify-plugin-zip` besteht mit exaktem Quellabgleich, Modul-/Modusprüfung,
  echtem Start der mitgelieferten Runtime und dauerhaftem Cache-Start im
  isolierten Testprofil sowie 163 Vertragsfällen. Dieser Zwischenbau enthält
  den nachfolgenden Restschuldblock noch nicht und ist kein aktueller Kandidat.
- Frischer Standalone-Paketbau nach allen RC109-Korrekturen:
  `dist/DataSecure-Standalone-3.2.0-rc109-windows-x64.zip`, 574 Einträge,
  110.211.662 Byte, SHA-256
  `807940d1a48846c5de9e898691e45027d934fb84e5b3d64ef7f8031f79d271e1`.
  Die Tauri-Hülle wurde unmittelbar zuvor mit `cargo build --release --locked`
  neu kompiliert; es wurde kein vorhandenes Release-Binary ungeprüft übernommen.
  Manifest-/SBOM-/Lizenzprüfung sowie echter gemischter Konverter-, Verlaufs-
  und isolierter Sidecar-Smoke bestanden.
- Erster vollständiger Korrekturlauf: 53 Basis- und 111 direkte Testdateien
  bestanden, Dauer 982.343 ms. Abschließender vollständiger Lauf des korrigierten
  Produktionscodes: **55 Basis- und 113 direkte Testdateien bestanden**,
  Dauer **1.307.503 ms (21 min 47,5 s)**. Darin 2.000 explorative
  Anonymisierungsfälle, reale 100-Dateien-/Crash-/Fortsetzungsproben und beide
  Golden-Projektionen. Der danach verstärkte Architekturtest (13/13), erneute
  Golden-Test (5/5), die Testzuordnung (10/10) und abschließende Dokumentation
  sind zusätzlich separat grün, nicht rückwirkend als bereits im früheren
  Gesamtaufruf enthalten ausgegeben.
- Finaler Gesamtlauf nach Experten-, Performance-, Status-App-, Core-, macOS-,
  Office- und Lizenzarbeit: **57 Basis- und 114 direkte Testdateien bestanden**.
  Darin sind die sieben
  produktgleichen Core-Verträge, das zielgebundene Rust-Lizenzinventar, die
  DOCX-AlternateContent-Negativfälle, der 2.000er Sweep sowie reale
  100-Dateien-/Crash-/Fortsetzungsproben enthalten. `cargo test --locked`
  besteht zusätzlich 16/16 native Tauri-/Rust-Fälle.
- Frischer Cowork-Reviewbau nach Code- und Runtime-README-Korrekturen:
  `dist/Review-RC109-Consolidation-windows-x64.zip`, **192 Einträge,
  35.003.649 Byte**, SHA-256
  `e43a84d61d9bdf750ed86e029aeeb6dce49abcf5b2284b60e29af8f54402951c`.
  Exakter Quellabgleich, Import-/Modusprüfung, echte gebündelte Runtime und
  isolierter dauerhafter Cache-Start sowie 163 Vertragsfälle bestehen.
  Andere `Review-RC109-*`-ZIPs dieses Durchgangs sind Zwischenstände.
- Abschließender Cowork-Produktbau nach allen RC109-Korrekturen:
  `dist/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc109.zip`,
  **194 Einträge, 35.007.546 Byte**, SHA-256
  `2bee8c0ab025447ba7dc6d10d9c9bd458f6253e2db6b4026b6f57eae8d5e0946`.
  Quellabgleich, selbsttragende Runtime, 163 Vertragsfälle, SBOM,
  Marketplace-Projektion und Statusartefaktprüfung sind grün.

## Grenzen und nachfolgende Lieferung

Dieser Korrekturlauf ist keine PKG-04-/INT-13-Freigabe. Beide frischen RC109-ZIPs
enthalten den aktuellen lokalen Arbeitsstand und bestehen ihre Paket-Smokes,
sind aber noch nicht an einen sauberen Quellcommit oder zwei bytegleiche Builds
gebunden. RC108-Bindungen bleiben ausschließlich historischer Nachweis für ihren
exakten Commit. Keine installierte Anwenderanwendung wurde verändert, kein
Commit/Push und keine GitHub Action ausgelöst.

Echte macOS-Intel-/ARM-Ausführung, native Cowork-/Desktopbedienung, breiter
realer Office-Korpus und fachliche Extraktions-/OCR-Abnahme bleiben offen.
Der native Mac-Sammelreview und Sichtbarkeitsadapter, die neutrale Start-/Zweck-/
Fortschritts-/Ergebnis-Core-Komposition, der Office-AlternateContent-Vertrag
sowie das komponentenweise Rust-Lizenz-/SBOM-Inventar sind E0 nachgezogen.
Die vollständige produktübergreifende Golden-Bindung für die freigegebenen
Formate TXT/Markdown/CSV/DOCX, alle fünf expliziten Profile, Review und
frische Abbruchfortsetzung ist E0 abgeschlossen. Offen bleiben reale Office-/
Kommentarfixtures und die genannten Zielhost-Nachweise. Die Abschlussprojektion
der deaktivierten Status-App wurde als
fachlich falsches Ziel verworfen: Sie bleibt eine Start-Momentaufnahme. Alle
sieben Zustände laufen in DE/EN automatisiert im lokalen Edge mit axe,
Bridge-Allowlist und 400%-Reflow; echte Cowork-/Screenreader-Abnahme bleibt
offen. Private Root-Sessions reduzieren den realen lokalen 100-Dateien-Lauf von
149,328/191,247 s auf 22,085/23,532 s (kalt/warm), ohne weniger Durability-
Fsyncs; Same-Path-Ersatz stoppt weiterhin fail-closed. Ein zusätzlicher
Purge-/Wiederanlauftest belegt, dass bestätigte Bereinigung ausschließlich
verwaltete Kinder entfernt und die gebundenen Root-Identitäten im laufenden
Prozess nicht vergiftet oder neu erzeugt.

Der abschließende unabhängige Fachblock ergänzt außerdem den vollständigen
unterstützten Goldenumfang für TXT/Markdown/CSV/DOCX, fünf Profile, Review und
frische Abbruchfortsetzung in beiden Produktprojektionen. Fremde Journale werden
kanalgebunden vor Quellen-/Artefaktzugriff verworfen; je Produkt bestehen elf
native Offline-Canaries. DOCX sperrt historische Absatz-/Run-Änderungen, bindet
Kommentare an eindeutige Referenz-IDs und löst AlternateContent ausschließlich
über echte Namespaces auf. Cache und adaptive Parallelisierung werden nur bei
weiterem gemessenem Nutzen erweitert. Der aktuelle
Restschuldblock beseitigt somit konkrete Schulden, aber nicht sämtliche noch
geplanten Produktlieferungen.
Vollständige Bugfreiheit oder Beseitigung jeder denkbaren technischen Schuld
wird nicht aus diesen Prüfungen abgeleitet. Historische Vendor-/Archivzeilen
wurden nicht als aktiver Produktcode vollständig neu auditiert.

## Primärquellen der Validierungsentscheidung

- [MCP Tools: serverseitige Eingabevalidierung](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [Ajv: vorab erzeugte Standalone-Validatoren](https://ajv.js.org/standalone.html)
- [Bundesbank: deutsche IBAN-Struktur mit 22 Stellen](https://www.bundesbank.de/en/tasks/payment-systems/services/iban-rules)
- [SWIFT: IBAN Registry, Release 102, numerische DE-/AT-/BE-Layouts](https://www.swift.com/swift-resource/9606/download)

Der MCP-Abgleich begründet die Validierung, keinen Protokollwechsel. Die
vorhandene Hostaushandlung und Normal-/Supportkompatibilität bleiben erhalten.
