# Evidence-Matrix für aktive Arbeit

Stand: 12.09.2026 · 3.2.0-rc139

Nachprüfung `CWR-20260912-01`–`11`: BL-041.8/.10/.12/.13/.14 und BL-010.8
erhalten Code-/Regressionsevidence für Status, ACK, Abbruch, Übergabe, Picker
und MCP-Hüllen sowie das korrigierte native Paketgate. RC138 bindet Commit
`d70cb266df90bdc07b0efadbf81f0d81195b3920`; Lauf `34691170241` baute und
startete exakt die veröffentlichten Cowork-ZIPs auf Windows x64, macOS Intel
und macOS ARM64. Der lokale Windows-Doppelbau ist bytegleich. Standalone-
Evidence bleibt davon unberührt und weiterhin an RC137 gebunden. Sichtbare
Cowork-, Modell-, N3/N4- und Fresh-Install-Abnahmen bleiben offen. Einzelbefunde stehen im
[Herstellerreview](../REVIEW_CLAUDE_COWORK_2026-09-01.md). Das anschließende
unabhängige Astra-Gegenreview bestätigte zusätzlich `BL-041.15`–`.18`: eine
Handoff-Cancel/Neustart-Race, verlorene strukturierte Extraktionsabdeckung,
unvollständige Paketintegritätsgates, eine falsch gebundene RC138-UAT-Vorlage
sowie nicht geschlossene Promptnamen. Die Terra-Ausführung hat diese E0-Punkte
geschlossen; die folgenden RC138-Aussagen bleiben dennoch historische Evidence,
kein aktuelles GO, weil der neue Kandidat die strengeren Regeln erst belegen muss.

Der zweite Gegenreview (`ASTRA2-20260912-01`–`04`, bei BL-041.17) ergänzte vier
lokal korrigierte Release-/UAT-Lücken: externes Downloadstaging, vollständiges
finales Inventar, natives Snapshot-Receipt statt erneutem blindem Hashlesen und
geprüfte Live-UAT-Vorbedingungen. Der Offline-Paketintegrationstest baute und
startete beide Windows-Cowork-Pakete im isolierten Test-Checkout und prüfte die
UAT-/SPDX-/Prüfsummenbindung. Das belegt die Pipeline lokal, nicht einen neuen
veröffentlichten Kandidaten oder eine menschliche Modell-/N3/N4-Abnahme.

E0 = lokale Code-/Testevidenz, E1 = Zielsystem/Installation, E2 = beobachtete
Anwendung/Accessibility, E3 = Fach-, Datenschutz-, Security- oder
Architekturfreigabe. Nur das [Backlog](BACKLOG.md) steuert Arbeit.

RC137 / DS-100 / BL-010.35 bindet den sauberen Commit
`8979d4b2127741c2921cb6f0654fb83d82944845` an die vollständige technische
Paketmatrix. Windows-PKG-04/INT-13 belegen zwei bytegleiche Standalone-ZIPs,
alle Paket-, Worker-, History-/Sidecar- und nativen Smokes sowie SHA-256
`3dfdb381…47c6f0`. Lauf `34609450730` belegt zweimal deterministische native
Standalone-Pakete und App→IPC→Core-Starts auf macOS ARM64 (`8314572d…d4416`)
und Intel (`e8210902…b514`); Lauf `34609464020` belegt denselben Vertrag für
Linux x64 glibc (`f282d416…d282`). Lauf `34609438970` erzeugt und validiert die
Cowork-ZIPs für Windows sowie beide Mac-Architekturen. Die getrennte
Windows-Debug-Variante ist ebenfalls zweimal bytegleich. Release, SBOM,
Prüfsummen und leere 12×3-UAT-Vorlage sind veröffentlicht. Sichtbare N3/N4-,
Fresh-Install-, Finder-/Explorer-/Linux-Dateimanager-, Cowork-Modell- und
Accessibility-Evidence bleibt E1/E2 offen.

RC136 / DS-099 / BL-041.11–.13: E0 bindet 27 Registryeinträge bijektiv
an Werkzeuge und Handler, leitet 10 Normal-/17 Supportwerkzeuge sowie
Annotationen aus derselben Quelle ab und projiziert den additiven öffentlichen
Statusumschlag. Der verkleinerte Hauptskill, vier Intentreferenzen, 41
strukturierte Routingfälle und die 12×3-Candidate-Matrix sind automatisiert
prüfbar. Das ist keine Modell- oder sichtbare Cowork-Abnahme; dreifache frische
Sitzungen pro Modell und Zielhost bleiben E1/E2.

DS-095 ordnet die nächsten Stufen eindeutig zu: **N3** ist die technische
E1-Abnahme eines durch Commit und Paket-Hash festgeschriebenen Kandidaten;
**N4** ist dessen anschließende formale E2-/E3-Abnahme. Vorlagen und
maschinengeprüfter Zwei-Personen-Ablauf für Windows x64 und einen Mac sind E0
fertig. Die leeren `NOT_RUN`-Protokolle sind keine Evidence. Ein einzelner Mac
belegt nur seine tatsächliche Intel- oder ARM64-Architektur.

RC135 bindet den aktuellen Funktions- und Evidence-Stand an den sauberen,
veröffentlichten Commit `9c2e4f9061dbdc3cd1bf0280d95939528029c978`.
Windows-PKG-04/INT-13 belegen zwei bytegleiche Standalone-ZIPs zu 110.250.920
Byte mit SHA-256 `8a27494c…c3d1` sowie beide Paket-, Worker-, History-/Sidecar-
und nativen Smokes. Lauf `34499428661` belegt für Standalone den zweimal
bytegleichen nativen Build, Signatur-/Architekturcheck und App→IPC→Core-Start
auf macOS ARM64 (`e9f54b5b…9f8c6`) und Intel (`9061aae7…880e9`). Lauf
`34501324817` erzeugt und validiert die selbsttragenden Cowork-ZIPs für Windows
x64 (`62796e6f…d1cdb`), macOS ARM64 (`38301698…233fd`) und macOS Intel
(`1efd4cc4…e1395`) aus demselben Commit. Sichtbare N3/N4-, Fresh-Install-,
Finder-/Explorer-, Cowork- und Accessibility-Evidence bleibt offen.

RC134 bindet DS-098 und den RC133-Funktionsstand an Commit
`583d71929a279fb57370a19c11776fc54aebc2d0`. Zwei saubere Windows-Paketbauten
sind als ZIP, Desktop- und Core-Binary bytegleich; beide Paket-, Worker- und
nativen Smokes bestanden. PKG-04 und INT-13 binden das 110.250.875 Byte große
Archiv mit SHA-256
`cdc2ec38c7346217a1de21ec9a5137895ded9fe4322dd5cb16f06a599dd6de0c`.
Automatisierte Produkt-, Dokumentations-, Engineering-, Conversion- und
Auditgates sind grün. N3/N4 sowie Cowork-/macOS-/Linux-Zielhostevidenz bleiben
offen.

RC133 bindet den RC132-Funktionsstand und die abschließende Fortsetzungshärtung
an Commit `2cd4150adfdff2e3aa6771c6cd81e2972ea0413a`. Zwei saubere Windows-
Paketbauten sind bytegleich; beide Paket-, Worker-, History-/Sidecar- und
nativen Smokes bestanden. PKG-04 und INT-13 binden das 110.249.642 Byte große
Archiv mit SHA-256 `fd3dcb1b0f99940a110857c085793b70930454571ffda3a7e5d8565a997ece66`.
N3/N4 sowie Cowork-/macOS-Zielhostevidenz bleiben offen.

RC132 / BL-010.12/BL-010.23/BL-021.1/BL-030.2/BL-041.1 besitzt lokale E0-
Evidence für: gemeinsame F7-Redaktion über mehrere Dokumente nach dynamischer
Pseudonymbindung; eine kanonische bytegebundene Policydateiliste mit
Einzelmutations- und Neu-Modul-Negativgate; Ruleset `de-business/3`; begrenzte
Präindex-Arbeit auch bei Cachetreffern; vollständigen serverseitigen Cowork-
`user_status` über MCP samt dauerhaftem einmaligem Netzwerk-/Sync-Hinweis;
ehrliche Standalone-Gruppierung nur zugelassener Quellen; sowie echte
paketierte PDF-Goldenobjekte. PKG-04/INT-13, Zielhost und N3/N4 sind für diesen
Kandidaten noch nicht erbracht.

RC131 / BL-010.13/BL-011.8/BL-021.1/BL-041.1 bindet den real beobachteten
DOCX-Fehler an drei voneinander unabhängige E0-Nachweise: fachliche
kontextgebundene Residual-Regression mit breitem Fachwortsatz und unverändert
scharfem Namens-Gegenfall, generalisierte und begrenzte Fehlerklassifikation in
Erstverarbeitung, Sammelreview und Recovery sowie ein Lauf des
von RC130 tatsächlich extrahierten Markdown-Artefakts durch den aktuellen
Privacy-/Publikationskern. `PROCESSING_INTERRUPTED` bleibt ausschließlich reale
Recoverysemantik; verifizierte Publikationen werden adoptiert, unsichere stoppen,
und wiederholte identische Transienten enden begrenzt. RC131-Paket- und
INT-13-Evidenz sind für Commit `d4d269b` neu erzeugt und im Vorabrelease
`v3.2.0-rc131` gebunden; nur die sichtbare N3/N4-UAT ist weiterhin offen.

RC125 revalidiert die Cloud-/Local-Cowork-Grenze gegen die aktuelle offizielle
Herstellerdokumentation und bindet den direkten Sechs-Format-Prompt sowie beide
asynchronen Konvertierungszweige an ausführbare Verträge. Vollständige
Produkt-, Standalone-, Dokumentations-, Skill-, SEA- und Paketgates bilden E0;
die bereits verzeichneten Zielhost- und Anwendernachweise bleiben E1/E2.

RC124 / DS-093 / BL-010.34 bindet XLSX/PPTX im Cowork-Plugin an den
ausgelieferten isolierten Office-Parser und danach an denselben Privacy-Core.
Reale synthetische Office-Bytes belegen Konvertierung, PII-Ersetzung,
Residual-Gate und die getrennten Zustände für Quellenabdeckung und
Markdown-Anonymisierung. Picker, IPC, Status, Skill, Paketprojektion und
Standalone-Gegenregression sind Teil der E0-Gates. PDF, Scan-PDF und Bilder
bleiben ohne gebündelte kompakte OCR-Runtime und Zielhostnachweis gesperrt.

RC124 / BL-020.3 präzisiert die Netzwerkgrenze: Parser, OCR und Review laden
den Netzwerk-Deny-Guard, während der MCP-Hauptprozess nur Metadaten, Zustand und
bereits verifizierte anonymisierte Exportbytes koordiniert. Der Einstiegspunkt
und die quellseitige sowie – sofern gebaut – ausgelieferte `.mcp.json` werden
gemeinsam geprüft. Native OS-Sandbox-Evidenz bleibt E1/E3.

RC124 / BL-021.1 trennt bei Personenfeldern die schreibweisenunabhängige
Labelerkennung von der großschreibungsgebundenen Wertgrammatik. Zeilen- und
Inline-Felder ziehen dadurch kein nachfolgendes kleingeschriebenes Prosawort in
die Identität; Punktsetzung ist für die Grenze nicht erforderlich. Die v1-/v2-
Registrytests belegen stabile Wiederverwendung des echten Namens, das Ausbleiben
eines falschen Prosa-Alias sowie den Bestandsschutz vollständig expliziter
kleingeschriebener Werte.

DS-096 / F7 / BL-021.1 bindet plausible unbeschriftete Prosanamen an eine enge
Satzsubjekt-/Tätigkeitsgrammatik und den bestehenden lokalen Sammelreview.
Positiv-, Fachphrasen-, Unicode-, Offset-, Einzeldatei-, Mehrdatei- und
Cross-Produktpfade belegen, dass eine bestätigte Person das stabile
Stapelpseudonym erhält, ein bereits gebundener vollständiger Name in
Folgedokumenten gleich ersetzt wird, derselbe offene normalisierte Name im
Sammelreview nicht widersprüchlich entschieden werden kann und keine Rohwerte in
Journal oder MCP gelangen. Fach-/UX-Abnahme bleibt E2/E3.

F17 / BL-030.2 ist durch eine lokale, nicht releasegebundene Präindex-Beobachtung
und reproduzierbare Arbeitsbudgettests geschlossen: Kleine v1-Altstapel behalten
exakte Aliasauflösung; mehr als 50.000 besuchte Fenster einschließlich
wiederholter Cachetreffer stoppen fail-closed, statt die Runtime unbeschränkt zu blockieren. Aktuelle attestierte Startindizes behalten
den vorhandenen linearen Probevertrag. Reale Upgrade-UAT bleibt E2.

RC120 / BL-010.13/BL-040.5/BL-002 trennt sichtbare Zuordnung und Fehlerbericht:
Nur bereits veröffentlichte Ergebnisse erhalten eine Mappingzeile. All-stopped
bleibt ohne Ergebnisordner/Zuordnung und ohne Öffnen-Aktionen; Mischstapel führen
nur ihre Erfolge. Export-, Replay-, History-, Status- und Pakettests prüfen dies
einschließlich Legacy-Bestandsschutz und verhindern einen Rückfall auf alte Läufe.

RC119 / BL-021.1/BL-030.2/BL-050.1 schließt die im realen Lauf
`Lauf-20260907-163522-142350c1` belegte Personenunterredaktion. E0 umfasst einen
expliziten `Person`-Tabellenanker, einen davon unabhängig formulierten
Release-Guard, die 128-fällige PII-Regression, alle vier echten DOCX aus dem
100-Dateien-Korpus und den deterministisch generierten 15-DOCX-Komplexkorpus.
Der alte Lauf bleibt negative
UAT-Evidenz und ist kein verwendbares anonymisiertes Ergebnis.

RC117 ergänzt für BL-022.1/BL-050.1 einen deterministisch generierten 15-DOCX-Korpus mit
kurzen, mittleren und langen realen Dokumentstrukturen. Preflight, Parser,
Anonymisierung, neutrale Erhaltung und stapelweit konsistente Personen-/
Unternehmenspseudonyme sind E0 geprüft. Die zwei Standalone-Abläufe mit diesem
Korpus sichtbar auszuführen bleibt BL-052.1/E2.

RC109-Gesamtreviewkorrekturen sind im
[archivierten Korrekturbericht](../../tasks/archiv/2026-09-06-rc109-review-korrekturen.md)
gesondert nachgeführt. Der aktuelle Standalone-Quellstand
`b543589f3250a6ab57ddd5bc3a144f03a24ee026` wurde zweimal bytegleich gebaut;
beide Paket-/Worker-/nativen Windows-Smokes bestanden und INT-13 ist an genau
diesen Commit gebunden. Code-/Protokoll-/Konverter-/Dokumenttests belegen E0;
ältere RC-Evidenz wird nicht als Nachweis dieses Stands umetikettiert.

Der anschließende E0-Restschuldblock umfasst BL-020.3 (Support-Review im
geschützten Worker), BL-041.1 (gemeinsame Diagnose/typisierte ACK-Fehler),
BL-021.1 (offsettreue Unicode-/URI-/IBAN-Grenzen), BL-011.8 (frühe Bereinigung
eindeutig verwaister Intakekopien) und BL-041.10 (39 Skillfälle einschließlich
DS-069), sieben reine gemeinsame Core-Verträge und die produktgleiche
Core-/Policy-Golden-Bindung des unterstützten Umfangs (BL-010.9/23). Einzelbelege und Gegenchecks stehen im
Korrekturbericht; E1/E2/E3 werden dadurch nicht geschlossen. Der vollständige
Produkttest besteht (57 Basis-/114 direkte Testdateien), ebenso 27 echte
Konvertertestgruppen und beide frischen Produktbauten. Architektur-, Browser-,
Dokument- und Rusttests bestehen zusätzlich den getrennten Gegenlauf. RC111
erweitert die reale Konvertersuite auf 30 Gruppen und ergänzt echte
TXT/XLSX-Mischstapel mit Neustart und stabilen Personen-/Unternehmenslabels.

RC109 / DS-086 / BL-010.29: Startseite ohne Modusvorbelegung, explizite
Navigation und privater Verlauf der letzten 20 Verarbeitungen sind umgesetzt.
Historytests verwenden echte Journale und Exportdateien, einschließlich Neustart,
Aufbewahrungsablauf, Zielwechsel und falscher Lauf-/Dateibindung. Frontendtests
prüfen drei Aktionen je Zeile, späte Antworten, Fokus und ausbleibende automatische
Navigation. Ein Edge-/axe-Test prüft Layout und Accessibility mit synthetischer
IPC; er ersetzt keinen nativen Dialog-/Explorer-/Finder-UAT (S20–S23).
Der erweiterte echte Windows-Paket-Smoke prüft beide Modi, Fehlerlauf, alle
laufgebundenen Ziele und einen frischen Sidecar nach Ergebniszielwechsel.
Die commitgebundene PKG-04-/INT-13-Bindung ist abgeschlossen; menschliche E1/E2 bleiben offen.

Aktueller Windows-Paketnachweis: RC111 aus `b543589f` besteht PKG-04 mit zwei
bytegleichen Builds, beiden echten Paket-/Worker-/nativen Smokes und neuer
INT-13-Bindung. Beide Modi, elf Konvertierungsergebnisse plus Fehlerposition,
Zuordnung und Supportspur sind geprüft. ZIP-SHA-256:
`6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f`.
Details und vollständige Hashes stehen
in [CURRENT_STATE](CURRENT_STATE.md). E1/E2/E3 sind dadurch nicht geschlossen.
Der RC111-Versuch aus `d45252f` und die Wiederholung nach Windows-Neustart aus
`c77ec592aa95f323bd5b1efe6301b111e7f2f225` bestehen Quellgates und Kandidat-A-
Paket-/Worker-/History-/Sidecar-Smokes, stoppen auf diesem Host jedoch vor
`webview_build_completed`. Die nachfolgende Gegenanalyse identifizierte dies als
Harnessfehler: ungeeigneter UDF-Ort, vollständig ersetzte Desktop-Umgebung und
zwei UDF-Autoritäten. Der korrigierte Arbeitsstand verwendet den automatischen
Tauri-Start mit genau einem privaten UDF unter `LocalAppData`; RC111-Arbeitsbau
und historisches RC109-Archiv erreichen damit Frontend, Core und IPC. RC109
stoppt anschließend nur in der fail-closed Bereinigung einer noch gesperrten
Cachedatei. Aus dem sauberen Korrekturcommit bestehen anschließend vollständige
Regression, zwei bytegleiche Builds und beide nativen Starts; Receipt und
INT-13-Bindung liegen unter `dist/pkg-04/b543589f3250a6ab57ddd5bc3a144f03a24ee026/`.

| Bereich / Stories | E0 | Noch erforderlich |
|---|---|---|
| BL-010.8 | gebündelter Runtimevertrag, drei Zielpaketprojektionen, Lizenz-/Hash-/Architekturgates und realer Windows-Smoke ohne System-Node; Ziel-ZIPs sind der belegte UAT-Weg | Marketplace bleibt blockiert, weil einzelne offizielle macOS-Runtime-Dateien die normale 100-MiB-Git-Objektgrenze überschreiten; nötig sind eine kleinere Runtime oder offizielle Claude-Evidence für einen anderen Binärtransport. Danach E1/E2 Fresh-Install/Update. |
| BL-010.9–27 | direkter Standalone-Coreadapter, eigener Datenroot, Tauri-Hülle, geschlossene private IPC, expliziter Start und konfiguriertes Ergebnisziel. Sieben reine Core-Verträge sowie produktgleiche Goldenläufe für TXT/Markdown/CSV/DOCX, fünf Profile, Review, Abbruch und frische Fortsetzung prüfen beide echten Produktprojektionen. RC109 erzeugt im realen Windows-Paket ein zielgebundenes Inventar für 259 erreichbare Nicht-Dev-Crates ohne `NOASSERTION` und bindet es an die SBOM. Manuelle kostenbestätigte Actions-Gates prüfen native macOS-Intel-/ARM- und Linux-x64-Runtime, Supervisor, Konverter, Rust, Build und Architektur. Die macOS-App-Läufe `34321954381`/`34322534571` starten App→private IPC→Core. Die Distributionsläufe `34334520861`/`34335259239` auf Commit `06c2669d` belegen je Mac-Ziel zweimal bytegleiches ZIP, Manifest/SBOM/Lizenz/Hash/Modus, Signatur/Architektur nach Entpacken und erneuten App→IPC→Core-Start. Das Linux-Gate belegt denselben Paket- und Lifecycle-Vertrag mit AppImage-in-ZIP; Pakete werden höchstens einen Tag bereitgestellt. RC134-Windows ergänzt 30 Fresh-Profile-Starts (p50 1,012 s, p95 1,124 s), 3.549.184 Byte reine Tauri-Hüllengröße, zehn positiv kontrollierte, circa alle 100 ms vom Start bis zur Bereitschaft beobachtete OS-Läufe ohne TCP-Listener oder DataSecure-/Core-/Worker-UDP-Endpunkt sowie einen echten entpackten 100-Dateien-Konvertierungslauf mit 100 Ergebnissen und unveränderten Quellen. | verständlicher WebView2-Zielhostfehlfall sowie sichtbare E1/E2 Windows/macOS/Linux einschließlich Dateimanager/Gatekeeper. Cowork verarbeitet zusätzlich XLSX/PPTX Markdown-first gemäß DS-093; Standalone folgt DS-087/090/094 |
| BL-010.13/14, BL-040.6 | Standalone bindet Fortschritt und Aktionen an den aktiven oder ausdrücklich fortgesetzten eigenen Stapel; jede Verlaufszeile behält ihre exakte Laufkennung. Interner Abschluss und sichtbarer Export (`export_pending`) bleiben getrennt. Offene Exporte werden beim Start, beim UI-Kontext und nach Ordnerwahl nachgeholt, Exportprozesse serialisiert und Zielstamm/Exportzweig identitätsfest gebunden. Sidecar und Rust lösen ausschließlich den konkret gewählten vollständig sichtbaren Lauf und seine `DataSecure-Zuordnung.csv` auf; kein Fallback auf einen neueren Lauf. Die sichtbare RC115-Zuordnung besitzt ein UTF-8-BOM und wird im echten Paket-Smoke geprüft. Offene Mischstapel bleiben gemäß DS-079 unsichtbar, Navigation erfolgt gemäß DS-086 nur durch den Anwender | E1/E2 Windows/macOS: tatsächlich sichtbare Öffnen-Aktion, Abschluss, Exportfehler/-replay, Ordnerwechsel, Sidecar-Abbruch/-neustart und verständliche Wiederaufnahme |
| BL-011.8 | identitätsgebundene Journal-/Intent-/Workcopy-Lese-, Publikations- und Cleanupgates; frühe Wartungsbereinigung ausschließlich bei sicher totem Owner ohne Journal, unmittelbar erneute Bindungsprüfung. Unabhängig 143 Fälle einschließlich echter Worker, Link-/Swap-/Abbruch-/Owner-/Journalwechsel | E1 Windows/macOS-Dateisystem, Power-Loss und E3 Security |
| BL-020.1 | Content-Graph/Locator für TXT, Markdown, CSV und DOCX einschließlich Unicode-, Part-, Asset- und Leerabdeckung | spätere Container/feinere Locators in ihren Formatstories |
| BL-020.2 | Produktpreflight sperrt OOXML-Einbettungen; aktive/rekursive DOCX-Strukturen, falsche Content Types und Beziehungen fail-closed | E1 Office-Korpus und E3 Security |
| BL-030.2 | neustartfester rohwertfreier HMAC-Kontext; neue Standalone-v2-Stapel nutzen lesbare Nummern und einen gemeinsamen Unternehmensraum, v1 bleibt erhalten. RC107: exakte bekannte Aliase im freien Folgetext nach echtem Registry-/Journal-Neuaufbau, Klammern/Separatoren, Rollenwechsel und Rechtsformkonflikte. RC124: einwortige persistierte PERSON-Aliase benötigen an jeder Fundstelle aktuellen Personenkontext; v1/v2, Restore, Mischvorkommen, Tabelle, Link und Firmenüberlagerung sind getestet. Mehrwortige exakte Identitäten bleiben stabil. Optionaler bindingsgebundener HMAC-Index mit vollständigem Altjournal-Fallback und dokumentierter Altreader-Grenze | E1/E2 echter Neustart/Crash/Cowork; reale Personen-/Unternehmensvarianten im fachlichen UAT |
| BL-010.12/13, DS-084 | Native Tauri-Dragdrop-Aufnahme über denselben Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, Reset nach IPC-Fehler, Test für veraltete Statusantworten, echte Unicode-Pfade im Rust-Test; Pickeralternative bleibt | E1/E2 tatsächliches Ziehen aus Explorer/Finder, Fokus/Zoom/Screenreader und native Mac-Pakete |
| BL-040.6, BL-041.10 | Cowork-Presenter bindet Erstlauf/Fortsetzung/Review an exakt den eigenen sichtbaren Exportlauf. Fehlender Lauf/Zielwechsel ergibt keinen falschen Öffnen-Hinweis. Echte Plugin-Exportdateien und PowerShell-Handler mit simulierter OS-Grenze geprüft | E1/E2 tatsächliche Explorer-/Finder-Sichtbarkeit; PowerShell-Test und Prozessstart beweisen kein sichtbares Fenster |
| BL-010.28, DS-085/088 | zwei aktive Modi vom Frontend über Rust/IPC/Service, unveränderlicher Zweck bei Fortsetzung, v5-Journal und eigene Worker-Envelope-Typen; `dm_`-Artefakte mit Extraktionsgrad, Recovery/Delivery/Export in derselben Batchengine. `markdown-only` erhält Originalinhalte und exportiert nach `DataSecure-Markdown`; sichtbare Dateien behalten ihren Basisnamen, Kollisionen erhalten deterministische Nummern, eine Zuordnung entfällt. Ausschließlich bereits angelegte Legacy-Pläne mit Export-Schema `/3` beenden beim Replay ihre historisch zugesagte Zuordnung; dieser Pfad ist durch einen realen Replay-Test gebunden. Keine Privacy-Capability oder PII-Review. Elf Eingabetypen einschließlich Scan-PDF als gesondertem PDF-Fall; reale Konverter-, Export-, Legacy-, Cross-Read- und RC112-ZIP-Smokes | RC134-Windows-PKG-04/INT-13 ist commitgebunden abgeschlossen. E1/E2/E3 für echte Zielhostbedienung und breiten Fachkorpus bleiben offen; E0 ist keine UAT-Freigabe |
| BL-010.31, DS-088 | vorbereitete Auswahl lässt sich vor Start einzeln oder vollständig leeren; eindeutige lokale Quelllabels, indexgebundener privater IPC-Befehl, Rust-Guard und Renderer-Race-Schutz. Beide Modi nutzen denselben Admissionvertrag. Ergebnisordneraktion unter **Verarbeiten** bleibt ohne exakten vollständigen Lauf deaktiviert; Verlaufszuordnung ist bei `markdown-only` immer deaktiviert. RC115 bindet 200 Dateien zentral durch JS-Core, privaten IPC-Vertrag, Rust-Drop-/Entfernungsgrenze und Workerstatus | E1/E2 Windows/macOS: Tastatur, Screenreader, doppelte Basisnamen, 200 Dateien und Bedienung nach Neustart |
| BL-010.32 | deterministischer Generator und bytegleicher ZIP-Nachweis für genau 100 synthetische Eingabedateien; Manifest/README außerhalb des Auswahlroots; elf Kategorien, kurze/mittlere/große Größenklassen, produktive Signatur-/OPC-Prüfung, rekursive Aufnahme verschachtelter Unterordner und direkte Markdown-Extraktion für TXT/MD/CSV/DOCX/XLSX/PPTX. PDF- und Raster-Sichtprüfung sowie 500-MB-Grenze geprüft | E2: vollständigen Korpus in Standalone einmal als Markdown-Konvertierung und als einstufige Markdown-first-Anonymisierung bedienen |
| BL-010.33, DS-089/091 | Root-relative Quelllabels bleiben durch rekursive Aufnahme, Queue, Journal und Export erhalten. Unit-/Export-/Serviceverträge prüfen verschachtelte Quellen, beide wählbaren Namensvarianten, neutralen Standard, exakte CSV-Zeilen, Replay/Legacy und sichere Pfadsegmente. `datasecure-batch/6` bindet die Wahl downgrade-sicher; Worker und Wiederaufnahme lehnen eine Änderung ab. Cowork bleibt neutral/flach, reine Konvertierung quellbenannt ohne Zuordnung. Der letzte in derselben UI-Sitzung abgeschlossene Lauf bleibt auch während einer neuen Auswahl exakt erreichbar; Windows-Junctions sind für Eingabe und Ergebnisöffnung gesperrt. | RC134-Windows-PKG-04/INT-13 ist commitgebunden abgeschlossen. E2 Windows/macOS bleibt offen: beide Varianten wählen, Ordnerbaum, Zuordnung und Ergebnisöffnung während einer Folgeauswahl sichtbar vergleichen; bei Originalnamen muss der Anwender sicherstellen, dass Datei-/Ordnernamen keine personenbezogenen Angaben enthalten |
| BL-010.30, DS-087/090/098 | neutraler Extraktionsvertrag und Standalone-Verkettung von DOCX und breiten Quellen vor dem bestehenden Privacy-Core; genau ein Konverteraufruf, keine rohe Veröffentlichung und Dateiendungs-/`source_type`-Bindung. Gültiges nichtleeres Markdown wird anonymisiert; `privacy_scope`, `source_extraction_coverage` und `document_result` trennen Originalextraktion und Markdown-Anonymisierung. Bei DOCX bleiben Kopf-/Fußzeilen vollständig validiert, werden aber nur für Anonymisierung samt ausschließlich dort referenzierten Bildern nicht projiziert; reine Konvertierung erhält sie. Leere OCR/Whitespace, unbekannte Coverage und unsichere Quellen stoppen. Echte TXT/XLSX-Mischstapel, Abbruch/Fortsetzung, Exact-once, stabile Personen-/Unternehmenslabels sowie eine synthetische DOCX mit Custom-XML-Lücke und Markdown-escapten E-Mail-Adressen sind geprüft. Der reale Paket-Sidecar verarbeitet XLSX und DOCX gemeinsam mit finalem Mapping. Der Cross-Produkt-Goldenlauf prüft zusätzlich, dass die Standalone-Kanalbindung bei Sammelreview und späterer Publikation erhalten bleibt. RC123 prüft zudem, dass `CONVERSION_TERMINATION_UNCONFIRMED` aus Schema `/6` in die lokale Statusprojektion gelangt | RC134-Windows-Paketnachweis ist abgeschlossen. Vollständige Originalcontainer-Coverage unter BL-022.2/3, BL-023.1–4 und BL-024.3 sowie E1/E2/E3 bleiben offen. Bis dahin keine Vollständigkeitszusage für den Originalcontainer; Cowork-PDF/OCR bleibt gesperrt |
| BL-010.34, DS-093 | Cowork akzeptiert XLSX/PPTX über Datei- und rekursive Ordnerauswahl, extrahiert lokal im isolierten Office-Parser und anonymisiert ausschließlich das neutrale Markdown. Status, Prompt, Skill, Manifeste, Source-/OPC-Preflight und reale XLSX-/PPTX-Integrationsläufe stimmen überein; kein rohes Zwischenkonvertat und kein zusätzlicher Dialog | E1/E2 Windows/macOS-Cowork mit echten Office-Dateien; PDF/Scan-PDF/Bilder erst nach kompakter gebündelter Runtime, Offline-/Paketgates und Zielhostabnahme |
| BL-022.1 | Grundparser, Struktur-/Differentialtests, namespacegebundene WordprocessingML-Auswertung, geschlossene XML-Entity-/Relationship-Namespace-Gates, referenzgebundene und weiterhin vollständig validierte Kopf-/Fußzeilen mit zweckgebundener DS-098-Ausgabeprojektion, tatsächliche `Requires`-URI-Auflösung, gesperrte historische `pPrChange`-/`rPrChange`-Metadaten, referenz- und ID-konsistente Kommentare sowie deterministischer 15-DOCX-Realitätskorpus | ausschließlich LibreOffice-/Office-Interoperabilität, realistische Fremdkommentare und Fachabnahme E1/E3 |
| BL-024.2 | Universal-Bundle bleibt separate Engineering-Evidence mit deaktivierter Pluginfreigabe. Standalone verwendet eine eigene aktive gepinnte Tesseract-/Canvas-Projektion mit lokalen DE/EN-Modellen; reale PNG/JPEG/BMP-/Scan-PDF-Bytes, Timeout, Abbruch und unveränderte Inputhashes im Konvertergate. Standalone darf den erfolgreich extrahierten Markdown-Inhalt anschließend vollständig anonymisieren; das ist keine Pixelredaktion und keine Vollständigkeitszusage für den Originalcontainer | E1 Windows/macOS; vollständige OCR-/Bild-/Originalcontainer-Erkennung sowie Cowork-PDF/OCR bleiben dadurch nicht freigegeben |
| BL-042.3 | absichtlich einmalige inhaltsfreie Startprojektion mit sieben begrenzten Zuständen, beiden `batch_active`-Varianten, DE/EN, Textfallback, Server-/Artefaktgates und CWD-unabhängigem Build. Exakt gepinntes `playwright-core` prüft im vorhandenen Edge alle 14 Sprach-/Zustandskombinationen mit axe, Bridge-Allowlist und 320-px-/400%-Reflow | keine fachlich falsche Abschlussprojektion aus der Startantwort; nur noch echte Cowork-/Screenreader-/Hostabnahme E1/E2, falls der default-off Pilot aktiviert werden soll |
| BL-042.4 | separate manuelle Debug-ZIP-Variante mit derselben Engine; Fach-, Workflow- und Supportdiagnose als mehrprozesssichere unveränderliche Einzelereignisse mit physischer Alters-/Mengengrenze; MCP-/Picker-/Worker-/Review-/Exportgrenzen und Parallel-/Negativtests | E1 Installation und reproduzierter Cowork-Fehlerlauf; anschließend Rückkehr zum Normalpaket |
| BL-011.10 | atomare prozessübergreifende Intake-Reservierung von Pickerstart bis dauerhaftem Stapelcheckpoint, sichere Eltern-/Worker-Delegation, fail-closed Recovery und echter Zwei-Prozess-Kollisionstest | E1/E2 Mehrfachauswahl und Hintergrundstart in Cowork auf Windows/macOS |
| BL-047.1 | bounded Handoff-Seiten und 64-MiB-Sitzungsbudget; asynchrones größenbegrenztes Snapshot-Lesen, Hashen und UTF-8-Indizieren mit Event-Loop-Yield-Nachweis an 6 MiB. Identitätsgebundene private Root-Sessions vermeiden wiederholte vollständige Elternprüfungen; Same-Path-Ersatz stoppt, bestätigter Child-Purge lässt dieselben Root-Identitäten weiter nutzbar. Lokaler 100-Dateien-TXT/CSV/DOCX-Vorher-/Nachherlauf: 149,328/191,247 s auf 22,085/23,532 s kalt/warm, ohne weniger Durability-Fsyncs | E1-Referenzmessung auf den Zielhosts; adaptive Parallelisierung nur bei danach belegtem Zusatznutzen |
| BL-040.5/6, BL-002 | ausdrückliche geräte-/produktlokale Zielwahl ohne Workspace-Erkennung; identitätsgebundene atomare Veröffentlichung, fehlgeschlagene Exporte nachholbar, abgeschlossene Exporte final. Anonymisierte Dateien unter `DataSecure-Output`, eigene nicht anonymisierte `dm_`-Konvertate nur Standalone unter `DataSecure-Markdown`; beide Bäume gegen erneute Aufnahme gesperrt. Standalone ergänzt nur für Anonymisierung die formelneutralisierte `DataSecure-Zuordnung.csv`; reine Konvertate sind durch ihren erhaltenen Basisnamen selbsterklärend, Cowork erhält keine Zuordnung. Ein Netzlaufwerk bleibt zulässig, erzeugt aber in beiden Produkten einen einmaligen pfadfreien Hinweis; Standalone nennt dabei auch die Zuordnung. Öffnen bindet exakt den terminalen aktuellen Lauf, DS-079 verhindert sichtbare Teilprojektion, MCP erhält keine Quellpfade oder rohen Konvertate | E1/E2 Fresh Install, Ordnerwechsel, Neustart, Sync-/Netzlaufwerkhinweis sowie beobachteter Windows-/macOS-Ablauf |
| BL-010.8/23, BL-040.5, BL-041.10, BL-044, DS-092 | Cowork öffnet ausschließlich den vollständig sichtbaren Ergebnisordner des aktuellsten Cowork-Stapels und nie einen älteren Lauf oder den Output-Stamm als Fallback. Rekursive Datei-/Größen-/Formatgrenzen verwenden gemeinsame `SOURCE_FOLDER_*`-Codes und erscheinen im MCP-Normalweg als korrigierbare Auswahlablehnung. Gemeinsame Core-Policy-/Golden-Gates und die vollständigen Standalone-Verträge laufen als Gegenregression | E1/E2 Claude Desktop/Cowork auf Windows und macOS: aktueller Erfolgs-/Fehler-/Aktivlauf, rekursive Grenzablehnung und tatsächliche native Öffnen-Aktion sichtbar beobachten |
| BL-010.1–3, BL-010.6–9, BL-011.3/6/7/9–13 | umfangreich vorbereitet; BL-010.1 Windows-E0 grün | E1 Windows/macOS; für Bedienung zusätzlich E2 |
| BL-012.2/3/5–8, BL-032.1 | Dialog-/Statusverträge automatisiert | E1 + E2, teilweise E3 |
| BL-012.9/10, BL-043.1 | Windows-Sammelreview und einzelner scrollbarer AppKit-Mac-Sammeladapter, anonyme Prüfgruppen, direkte Aktionen, inhaltsfreie Fortschrittszähler, Klarstapel ohne UI und Mischstapel-Schnellpfad; macOS-Abschluss verlangt sichtbares `SHOWN` | E1/E2 Windows/macOS sowie E3 IT-/Health-IT und Security; automatisierte native Intel-/ARM-E0-Builds sind grün, sichtbare Reviewbedienung bleibt offen |
| BL-021.1/2, BL-022.1 | Parser-/Differential-/Formatgates | E1 und Fachprüfung E3 |
| BL-022.2/3, BL-023.1–4, BL-024.3 | Cowork-XLSX/PPTX ist gemäß DS-093 E0 aktiv; nur Cowork-PDF/Scan-PDF/Bilder bleibt NO-GO. Reine Standalone-Konvertierung und Markdown-first-Anonymisierung von XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP ist im isolierten Produktworker integriert; Originalwerte bleiben im Nur-Konvertieren-Modus, unvollständige Coverage/OCR wird in beiden Modi mit festen Gründen statt als vollständiger Originalcontainer ausgewiesen. RC111 validiert sämtliche PPTX-XML-/RELS-Teile, stoppt PDF-Annotationen/Outline/XMP und erhält standardisierte PDF-Metadaten sichtbar. Standardskonforme In-Memory-PDFs prüfen den echten paketierten Parser zusätzlich gegen AcroForm, Signaturfeld, EmbeddedFile/Name-Tree, JavaScript sowie leeres und nichtleeres Benutzerpasswort; die dabei aufgedeckte PDF.js-`Map`-Repräsentation von Anhängen ist im Produktgate geschlossen. Scan plus Seitenzahl, Privacy-Übergabe und gebündelte Offline-Decoder/Modelle sind regressionsgeprüft; `OCR_TEXT_EMPTY` bezeichnet nur eine insgesamt textleere Extraktion und stoppt nicht mehr vorhandenen nativen PDF-Text wegen einer einzelnen textlosen Bildfläche. Bestätigtes Ende oder `CONVERSION_TERMINATION_UNCONFIRMED`; 60 frühe Windows-Kills prüfen atomare Jobzuweisung | E1/E3; vollständige Objekt-/Layout-/OCR-Coverage des Originalcontainers bleibt eigenständig offen |
| BL-031.1 | Kontext- und Regressionskorpus | IT-/Health-IT-Fachprüfung E3 |
| BL-041.1–9, BL-044.1, BL-049.1, BL-050.3 | Tool-, Picker-, Handoff-, Recovery- und Performanceverträge; stdio-JSON-RPC vor dem Parsen auf 1 MiB je Frame begrenzt und nach Überschreitung wieder synchronisiert. BL-044.1 ist als direkte lokale Windows-Mikromessung mit 201 Kandidaten/20 Verzeichnissen quantifiziert (p95 77,142 ms; lokales Referenzbudget 250 ms). Ein dauerhafter Cache ist auf diesem Host nicht indiziert. | aktuelle Cowork-/OS-/UX-/Security-Evidenz E1/E2/E3; End-to-End-Admission sowie UNC-/Sync-Root-Gegenprobe |
| BL-041.15–.18, BL-051.1–6 | Standalone bleibt mit RC137/`8979d4b2` und INT-13 `3dfdb381…47c6f0` paketgebunden. Cowork RC138/`d70cb266` ist getrennt veröffentlicht: Windows x64 `bc005e23…97d251`, macOS Intel `a34443f8…8c5efb`, macOS ARM64 `829ba3f2…7463f2`; Lauf `34691170241` startete exakt alle drei Archive nativ und prüfte den MCP-Roundtrip. Die vier Astra-E0-Stories sind implementiert: Handoff-Generation/Coverage, gemeinsamer geschlossener Paketvalidator inklusive Lizenz/Quellcommit, explizite releasegebundene UAT-Matrix und geschlossene Promptnamen. Die RC138-Paket- und Workflowevidence bleibt historisch gültig, ist aber kein aktuelles Freigabe-GO. | Neuen sauberen Commit samt Normal-/Debug-Archiven und frisch erzeugter UAT-Evidence bauen und danach menschliche Fresh-Install-, Update-, Rollback-, Hostmatrix-, Cowork-Modell- und N3/N4-Abnahmen sowie versionsgebundener 200-Dateien-/500-MiB-Grenzlauf E1/E2 |
| BL-052.1–5 | synthetisches UAT-Kit und leere Evidenzvorlage | benannte Anwender-, Fach-, Datenschutz-, UX-, Architektur- und Securityrollen |

Die Linux-x64-E0-Zelle ist durch Lauf
[`34356576842`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/34356576842)
auf Commit `84fd616c` konkret gebunden. AppImage-SHA-256 ist
`bd25febd…8853`, Distributions-ZIP-SHA-256 `177b9763…eaee`; zwei native
Lifecycle-Smokes und der bytegleiche Doppelbau sind grün. Die in der Matrix
genannte sichtbare Linux-E1/E2 bleibt davon unberührt offen.

## Historische RC108-Integration vor ihrer Paketbindung

Der Codeweg ist aktiv, nicht lediglich ein freigeschaltetes Modusflag:
`core/processing-mode` → Desktop/IPC/Service → Intake/v5-Journal →
`conversion-worker` → `markdown-store` → Recovery/Export. Rohes Markdown
erhält weder Privacy-Status noch Capability und wird nicht automatisch an KI
übertragen. Warnende Extraktionen erscheinen ausdrücklich als unvollständig.

E0: 22 echte Konvertertestgruppen und 100 TXT-Dateien in lokal 15,264 Sekunden,
ohne die etwa 188-MB-Runtime je Datei erneut vollständig zu lesen. 60 frühe
Beendigungen prüfen den atomar an `CreateProcess` gebundenen Windows-Job;
7 native Launcher- und 19 Parser-Isolationstests grün. Die native Korrektur
schließt auch im gemeinsamen Cowork-Parser das Start-/Jobzuweisungsfenster.
Diese Messung ist keine allgemeine Performancegarantie.

Dieser Abschnitt beschreibt den damaligen Vorbindungsstand von RC108. RC108
wurde später separat gebunden; der aktuelle RC109-Nachweis steht am Anfang
dieser Matrix. Windows-Engineering-Evidence ersetzt weiterhin weder sichtbaren
UAT noch Intel-/ARM-macOS.

## Historischer RC107-/DS-067-Nachweis

Der RC107-Korrekturschnitt ergänzt unter den vorhandenen Storys Regressionen
für verlorene Frontend-Polltimer, veraltete Folgelaufanzeigen, aktuelle
damalige Standalone-Zuordnung auch bei gestoppten Dateien (durch RC120 ersetzt), ausstehende
Abschlussmetadaten ohne verfälschte Dokumentzähler und typstabile
Unternehmenskurzformen sowie den expliziten Sidecar-Abschluss bei EOF und
defektem IPC ohne Abbruch dauerhaft übergebener Worker. Produktsuite (40 Basis-
und 111 direkte Dateien) und abschließendes Standalone-/Rust-Gate sind grün.
Der native Windows-Test besitzt jetzt eine vor dem
Bootstrap validierte private Umgebung einschließlich WebView und Dokumenten.
Neue Paket-Evidence muss aus dem neuen Commit erstellt werden; der
historische RC106-Receipt beweist weder diese Korrekturen noch die neue
Testdatenisolation. Sichtbare Explorer-/Finder-Bedienung und macOS bleiben E1/E2.

Der reale Folgestapel im ersten RC107-Paket (`ebffe87`) deckte zusätzlich die
fehlende terminale Klassifikation einer bestätigten Parserablehnung auf. Dieser
Build wurde nicht an INT-13 gebunden. `PARSE_FAILED` gegenüber Timeout/Crash wird
im gemeinsamen Runtimevertrag korrigiert und separat regressionsgeprüft; erst
ein neuer Quellcommit mit beiden erfolgreichen Paketläufen liefert neue Evidence.

`aaecf59` bestand anschließend die lokale CI-Produktsuite (40 Basis- und 48
direkte Dateien), den gepackten Vierformat-/Fehlerfolgelauf und den isolierten
nativen Windows-Start. Die sichere Testbereinigung verweigerte eine vom
Betriebssystem erzeugte Cache-Junction vor jeder Löschung; der Testrest bleibt
erhalten. Daher weiterhin kein vollständiger RC107-PKG-04-Receipt und keine
INT-13-Bindung aus diesem Versuch. Eine spätere erfolgreiche Bindung muss den
neuen Harness-Commit nennen, nicht rückwirkend diesen Versuch freigeben.

Abschluss 06.09.2026: `7b88a81ff577aaa270f1354d75365b2df4a4666e` besitzt nun
einen vollständigen PKG-04-Receipt und INT-13-Bindung. Beide unabhängig sauber
gebauten ZIPs/Desktop/Core-Binaries bytegleich, beide realen Paket-/Worker- und
nativen Windows-Smokes bestanden. Archivhash
`01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`,
36.071.549 Byte. Vollsuite 40 Basis-/111 Direktdateien und Rust 12/12 grün.
Die beiden alten verweigerten Testprofile bleiben unverändert. Dies ist E0,
keine sichtbare Bedienungs- oder macOS-E1/E2-Abnahme.

- Manifest/Runtime begrenzen temporäre Aufbewahrung auf 0–14 Tage.
- Retentiontests bewahren Quellen, `Processed`, fertige `Output`-Pakete und
  `DataSecure-Export` vor automatischer Löschung.
- Manifest besitzt keinen auswählbaren Bildmodus; Runtime startet fest im
  sicheren Bildschutz.
- Anwenderdokumente nennen nur ZIP/Marketplace. MCPB wird ausschließlich über
  explizite Engineering-Skripte gebaut und geprüft.
- Manifest-, Retention-, Dokumenten-, Capability-, ZIP- und Marketplace-
  Vertragstests sichern diese Grenzen.
- Das versionneutrale UAT-Kit nennt UAT-01 bis UAT-06 stets mit Klartextnamen und
  direkten Anleitungslinks. Aktive lokale Dokumentlinks werden automatisiert
  aufgelöst; historische RC-Kits und Aufträge sind sichtbar als nicht aktuell
  klassifiziert.

## Bedeutung von „blockiert“

Ein Backlogpunkt ist blockiert, wenn kein weiterer lokaler Codeabschluss behauptet
werden darf, bevor eine reale Claude-Version, Zielplattform oder benannte Fachrolle
die Evidenz liefert. Das ist keine implizite Aufforderung, VM, Zusatzkonto,
Schlüsselbund oder Clouddienst einzuführen.

Die vor der Konsolidierung geführte Einzelstory-Matrix bleibt als historischer
Nachweis im
[Archiv](../archive/2026-09/canonical-history/BACKLOG_EVIDENCE_MATRIX_HISTORY_THROUGH_RC84.md).
