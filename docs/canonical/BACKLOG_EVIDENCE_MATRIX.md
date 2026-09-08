# Evidence-Matrix für aktive Arbeit

Stand: 07.09.2026 · 3.2.0-rc123

E0 = lokale Code-/Testevidenz, E1 = Zielsystem/Installation, E2 = beobachtete
Anwendung/Accessibility, E3 = Fach-, Datenschutz-, Security- oder
Architekturfreigabe. Nur das [Backlog](BACKLOG.md) steuert Arbeit.

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
| BL-010.8 | gebündelter Runtimevertrag, drei Zielpaketprojektionen, Lizenz-/Hash-/Architekturgates, realer Windows-Smoke ohne System-Node und selbsttragende Git-Marketplace-Projektion mit relativer Quelle | Veröffentlichung der Projektion in einem privaten/internen Marketplace-Repository; E1 macOS Intel/ARM und E2 Cowork-Fresh-Install/Update |
| BL-010.9–27 | direkter Standalone-Coreadapter, eigener Datenroot, Tauri-Hülle, geschlossene private IPC, expliziter Start und konfiguriertes Ergebnisziel. Sieben reine Core-Verträge sowie produktgleiche Goldenläufe für TXT/Markdown/CSV/DOCX, fünf Profile, Review, Abbruch und frische Fortsetzung prüfen beide echten Produktprojektionen. RC109 erzeugt im realen Windows-Paket ein zielgebundenes Inventar für 259 erreichbare Nicht-Dev-Crates ohne `NOASSERTION` und bindet es an die SBOM. | verständlicher WebView2-Zielhostfehlfall sowie E1/E2 Windows/macOS und native macOS-Pakete. Linux-Konverterpaketierung bleibt späterer Umfang. Cowork bleibt auf vier Formate begrenzt; Standalone folgt DS-087/090 |
| BL-010.13/14, BL-040.6 | Standalone bindet Fortschritt und Aktionen an den aktiven oder ausdrücklich fortgesetzten eigenen Stapel; jede Verlaufszeile behält ihre exakte Laufkennung. Interner Abschluss und sichtbarer Export (`export_pending`) bleiben getrennt. Offene Exporte werden beim Start, beim UI-Kontext und nach Ordnerwahl nachgeholt, Exportprozesse serialisiert und Zielstamm/Exportzweig identitätsfest gebunden. Sidecar und Rust lösen ausschließlich den konkret gewählten vollständig sichtbaren Lauf und seine `DataSecure-Zuordnung.csv` auf; kein Fallback auf einen neueren Lauf. Die sichtbare RC115-Zuordnung besitzt ein UTF-8-BOM und wird im echten Paket-Smoke geprüft. Offene Mischstapel bleiben gemäß DS-079 unsichtbar, Navigation erfolgt gemäß DS-086 nur durch den Anwender | E1/E2 Windows/macOS: tatsächlich sichtbare Öffnen-Aktion, Abschluss, Exportfehler/-replay, Ordnerwechsel, Sidecar-Abbruch/-neustart und verständliche Wiederaufnahme |
| BL-011.8 | identitätsgebundene Journal-/Intent-/Workcopy-Lese-, Publikations- und Cleanupgates; frühe Wartungsbereinigung ausschließlich bei sicher totem Owner ohne Journal, unmittelbar erneute Bindungsprüfung. Unabhängig 143 Fälle einschließlich echter Worker, Link-/Swap-/Abbruch-/Owner-/Journalwechsel | E1 Windows/macOS-Dateisystem, Power-Loss und E3 Security |
| BL-020.1 | Content-Graph/Locator für TXT, Markdown, CSV und DOCX einschließlich Unicode-, Part-, Asset- und Leerabdeckung | spätere Container/feinere Locators in ihren Formatstories |
| BL-020.2 | Produktpreflight sperrt OOXML-Einbettungen; aktive/rekursive DOCX-Strukturen, falsche Content Types und Beziehungen fail-closed | E1 Office-Korpus und E3 Security |
| BL-030.2 | neustartfester rohwertfreier HMAC-Kontext; neue Standalone-v2-Stapel nutzen lesbare Nummern und einen gemeinsamen Unternehmensraum, v1 bleibt erhalten. RC107: exakte bekannte Aliase im freien Folgetext nach echtem Registry-/Journal-Neuaufbau, Klammern/Separatoren, Rollenwechsel und Rechtsformkonflikte. RC124: einwortige persistierte PERSON-Aliase benötigen an jeder Fundstelle aktuellen Personenkontext; v1/v2, Restore, Mischvorkommen, Tabelle, Link und Firmenüberlagerung sind getestet. Mehrwortige exakte Identitäten bleiben stabil. Optionaler bindingsgebundener HMAC-Index mit vollständigem Altjournal-Fallback und dokumentierter Altreader-Grenze | E1/E2 echter Neustart/Crash/Cowork; reale Personen-/Unternehmensvarianten im fachlichen UAT |
| BL-010.12/13, DS-084 | Native Tauri-Dragdrop-Aufnahme über denselben Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, Reset nach IPC-Fehler, Test für veraltete Statusantworten, echte Unicode-Pfade im Rust-Test; Pickeralternative bleibt | E1/E2 tatsächliches Ziehen aus Explorer/Finder, Fokus/Zoom/Screenreader und native Mac-Pakete |
| BL-040.6, BL-041.10 | Cowork-Presenter bindet Erstlauf/Fortsetzung/Review an exakt den eigenen sichtbaren Exportlauf. Fehlender Lauf/Zielwechsel ergibt keinen falschen Öffnen-Hinweis. Echte Plugin-Exportdateien und PowerShell-Handler mit simulierter OS-Grenze geprüft | E1/E2 tatsächliche Explorer-/Finder-Sichtbarkeit; PowerShell-Test und Prozessstart beweisen kein sichtbares Fenster |
| BL-010.28, DS-085/088 | zwei aktive Modi vom Frontend über Rust/IPC/Service, unveränderlicher Zweck bei Fortsetzung, v5-Journal und eigene Worker-Envelope-Typen; `dm_`-Artefakte mit Extraktionsgrad, Recovery/Delivery/Export in derselben Batchengine. `markdown-only` erhält Originalinhalte und exportiert nach `DataSecure-Markdown`; sichtbare Dateien behalten ihren Basisnamen, Kollisionen erhalten deterministische Nummern, eine Zuordnung entfällt. Keine Privacy-Capability oder PII-Review. Elf Eingabetypen einschließlich Scan-PDF als gesondertem PDF-Fall; reale Konverter-, Export-, Legacy-, Cross-Read- und RC112-ZIP-Smokes | E1/E2/E3: echte Zielhostbedienung und breiter fachlicher Korpus. Der Arbeitsbaum-Paket-Smoke ist grün; sauberer commitgebundener Kandidat und UAT bleiben offen. E0 ist keine UAT-Freigabe |
| BL-010.31, DS-088 | vorbereitete Auswahl lässt sich vor Start einzeln oder vollständig leeren; eindeutige lokale Quelllabels, indexgebundener privater IPC-Befehl, Rust-Guard und Renderer-Race-Schutz. Beide Modi nutzen denselben Admissionvertrag. Ergebnisordneraktion unter **Verarbeiten** bleibt ohne exakten vollständigen Lauf deaktiviert; Verlaufszuordnung ist bei `markdown-only` immer deaktiviert. RC115 bindet 200 Dateien zentral durch JS-Core, privaten IPC-Vertrag, Rust-Drop-/Entfernungsgrenze und Workerstatus | E1/E2 Windows/macOS: Tastatur, Screenreader, doppelte Basisnamen, 200 Dateien und Bedienung nach Neustart |
| BL-010.32 | deterministischer Generator und bytegleicher ZIP-Nachweis für genau 100 synthetische Eingabedateien; Manifest/README außerhalb des Auswahlroots; elf Kategorien, kurze/mittlere/große Größenklassen, produktive Signatur-/OPC-Prüfung, rekursive Aufnahme verschachtelter Unterordner und direkte Markdown-Extraktion für TXT/MD/CSV/DOCX/XLSX/PPTX. PDF- und Raster-Sichtprüfung sowie 500-MB-Grenze geprüft | E2: vollständigen Korpus in Standalone einmal als Markdown-Konvertierung und als einstufige Markdown-first-Anonymisierung bedienen |
| BL-010.33, DS-089/091 | Root-relative Quelllabels bleiben durch rekursive Aufnahme, Queue, Journal und Export erhalten. Unit-/Export-/Serviceverträge prüfen verschachtelte Quellen, beide wählbaren Namensvarianten, neutralen Standard, exakte CSV-Zeilen, Replay/Legacy und sichere Pfadsegmente. `datasecure-batch/6` bindet die Wahl downgrade-sicher; Worker und Wiederaufnahme lehnen eine Änderung ab. Cowork bleibt neutral/flach, reine Konvertierung quellbenannt ohne Zuordnung | Commitgebundene PKG-04-/INT-13-Evidence sowie E2 Windows/macOS: beide Varianten wählen, Ordnerbaum und Zuordnung sichtbar vergleichen; bei Originalnamen muss der Anwender sicherstellen, dass Datei-/Ordnernamen keine personenbezogenen Angaben enthalten |
| BL-010.30, DS-087/090 | neutraler Extraktionsvertrag und Standalone-only-Verkettung von DOCX und breiten Quellen vor dem bestehenden Privacy-Core; genau ein Konverteraufruf, keine rohe Veröffentlichung, Dateiendungs-/`source_type`-Bindung und unveränderte Cowork-Grenze. Gültiges nichtleeres Markdown wird anonymisiert; `privacy_scope`, `source_extraction_coverage` und `document_result` trennen Originalextraktion und Markdown-Anonymisierung. Leere OCR/Whitespace, unbekannte Coverage und unsichere Quellen stoppen. Echte TXT/XLSX-Mischstapel, Abbruch/Fortsetzung, Exact-once, stabile Personen-/Unternehmenslabels sowie eine synthetische DOCX mit Custom-XML-Lücke und Markdown-escapten E-Mail-Adressen sind geprüft. Der reale Paket-Sidecar verarbeitet XLSX und DOCX gemeinsam mit finalem Mapping. Der Cross-Produkt-Goldenlauf prüft zusätzlich, dass die Standalone-Kanalbindung bei Sammelreview und späterer Publikation erhalten bleibt | vollständige Originalcontainer-Coverage unter BL-022.2/3, BL-023.1–4 und BL-024.3; danach E1/E2/E3 und commitgebundener Paketnachweis. Bis dahin keine Vollständigkeitszusage für den Originalcontainer; Cowork bleibt bei vier Formaten und strengem DOCX-Parsergate |
| BL-022.1 | Grundparser, Struktur-/Differentialtests, namespacegebundene WordprocessingML-Auswertung, geschlossene XML-Entity-/Relationship-Namespace-Gates, referenzgebundene Kopf-/Fußzeilen, tatsächliche `Requires`-URI-Auflösung, gesperrte historische `pPrChange`-/`rPrChange`-Metadaten sowie referenz- und ID-konsistente Kommentare | realer Office-Korpus und realistische Kommentare; danach E1/E3 |
| BL-024.2 | Universal-Bundle bleibt separate Engineering-Evidence mit deaktivierter Pluginfreigabe. Standalone `markdown-only` verwendet eine eigene aktive gepinnte Tesseract-/Canvas-Projektion mit lokalen DE/EN-Modellen; reale PNG/JPEG/BMP-/Scan-PDF-Bytes, Timeout, Abbruch und unveränderte Inputhashes im Konvertergate | E1 Windows/macOS; OCR-/Bildanonymisierung und vollständige Erkennung sind dadurch nicht freigegeben |
| BL-042.3 | absichtlich einmalige inhaltsfreie Startprojektion mit sieben begrenzten Zuständen, beiden `batch_active`-Varianten, DE/EN, Textfallback, Server-/Artefaktgates und CWD-unabhängigem Build. Exakt gepinntes `playwright-core` prüft im vorhandenen Edge alle 14 Sprach-/Zustandskombinationen mit axe, Bridge-Allowlist und 320-px-/400%-Reflow | keine fachlich falsche Abschlussprojektion aus der Startantwort; nur noch echte Cowork-/Screenreader-/Hostabnahme E1/E2, falls der default-off Pilot aktiviert werden soll |
| BL-042.4 | separate manuelle Debug-ZIP-Variante mit derselben Engine; Fach-, Workflow- und Supportdiagnose als mehrprozesssichere unveränderliche Einzelereignisse mit physischer Alters-/Mengengrenze; MCP-/Picker-/Worker-/Review-/Exportgrenzen und Parallel-/Negativtests | E1 Installation und reproduzierter Cowork-Fehlerlauf; anschließend Rückkehr zum Normalpaket |
| BL-011.10 | atomare prozessübergreifende Intake-Reservierung von Pickerstart bis dauerhaftem Stapelcheckpoint, sichere Eltern-/Worker-Delegation, fail-closed Recovery und echter Zwei-Prozess-Kollisionstest | E1/E2 Mehrfachauswahl und Hintergrundstart in Cowork auf Windows/macOS |
| BL-047.1 | bounded Handoff-Seiten und 64-MiB-Sitzungsbudget; asynchrones größenbegrenztes Snapshot-Lesen, Hashen und UTF-8-Indizieren mit Event-Loop-Yield-Nachweis an 6 MiB. Identitätsgebundene private Root-Sessions vermeiden wiederholte vollständige Elternprüfungen; Same-Path-Ersatz stoppt, bestätigter Child-Purge lässt dieselben Root-Identitäten weiter nutzbar. Lokaler 100-Dateien-TXT/CSV/DOCX-Vorher-/Nachherlauf: 149,328/191,247 s auf 22,085/23,532 s kalt/warm, ohne weniger Durability-Fsyncs | E1-Referenzmessung auf den Zielhosts; adaptive Parallelisierung nur bei danach belegtem Zusatznutzen |
| BL-040.5/6 | ausdrückliche geräte-/produktlokale Zielwahl ohne Workspace-Erkennung; identitätsgebundene atomare Veröffentlichung, fehlgeschlagene Exporte nachholbar, abgeschlossene Exporte final. Anonymisierte Dateien unter `DataSecure-Output`, eigene nicht anonymisierte `dm_`-Konvertate nur Standalone unter `DataSecure-Markdown`; beide Bäume gegen erneute Aufnahme gesperrt. Standalone ergänzt nur für Anonymisierung die formelneutralisierte `DataSecure-Zuordnung.csv`; reine Konvertate sind durch ihren erhaltenen Basisnamen selbsterklärend, Cowork erhält keine Zuordnung. Öffnen bindet exakt den terminalen aktuellen Lauf, DS-079 verhindert sichtbare Teilprojektion, MCP erhält keine Quellpfade oder rohen Konvertate | E1/E2 Fresh Install, Ordnerwechsel, Neustart, Sync-Hinweis sowie beobachteter Windows-/macOS-Ablauf |
| BL-010.8/23, BL-040.5, BL-041.10, BL-044, DS-092 | Cowork öffnet ausschließlich den vollständig sichtbaren Ergebnisordner des aktuellsten Cowork-Stapels und nie einen älteren Lauf oder den Output-Stamm als Fallback. Rekursive Datei-/Größen-/Formatgrenzen verwenden gemeinsame `SOURCE_FOLDER_*`-Codes und erscheinen im MCP-Normalweg als korrigierbare Auswahlablehnung. Gemeinsame Core-Policy-/Golden-Gates und die vollständigen Standalone-Verträge laufen als Gegenregression | E1/E2 Claude Desktop/Cowork auf Windows und macOS: aktueller Erfolgs-/Fehler-/Aktivlauf, rekursive Grenzablehnung und tatsächliche native Öffnen-Aktion sichtbar beobachten |
| BL-010.1–3, BL-010.6–9, BL-011.3/6/7/9–13 | umfangreich vorbereitet; BL-010.1 Windows-E0 grün | E1 Windows/macOS; für Bedienung zusätzlich E2 |
| BL-012.2/3/5–8, BL-032.1 | Dialog-/Statusverträge automatisiert | E1 + E2, teilweise E3 |
| BL-012.9/10, BL-043.1 | Windows-Sammelreview und einzelner scrollbarer AppKit-Mac-Sammeladapter, anonyme Prüfgruppen, direkte Aktionen, inhaltsfreie Fortschrittszähler, Klarstapel ohne UI und Mischstapel-Schnellpfad; macOS-Abschluss verlangt sichtbares `SHOWN` | E1/E2 Windows/macOS sowie E3 IT-/Health-IT und Security; native Intel-/ARM-Ausführung bleibt offen |
| BL-021.1/2, BL-022.1 | Parser-/Differential-/Formatgates | E1 und Fachprüfung E3 |
| BL-022.2/3, BL-023.1–4, BL-024.3 | Cowork-NO-GO unverändert. Reine Standalone-Konvertierung und Markdown-first-Anonymisierung von XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP im isolierten Produktworker integriert; Originalwerte bleiben im Nur-Konvertieren-Modus, unvollständige Coverage/OCR wird in beiden Modi mit festen Gründen statt als vollständiger Originalcontainer ausgewiesen. RC111 validiert sämtliche PPTX-XML-/RELS-Teile, stoppt PDF-Annotationen/Outline/XMP und erhält standardisierte PDF-Metadaten sichtbar. Scan plus Seitenzahl, Privacy-Übergabe und gebündelte Offline-Decoder/Modelle sind regressionsgeprüft; bestätigtes Ende oder `CONVERSION_TERMINATION_UNCONFIRMED`; 60 frühe Windows-Kills prüfen atomare Jobzuweisung | E1/E3; vollständige Objekt-/Layout-/OCR-Coverage des Originalcontainers bleibt eigenständig offen |
| BL-031.1 | Kontext- und Regressionskorpus | IT-/Health-IT-Fachprüfung E3 |
| BL-041.1–9, BL-044.1, BL-049.1, BL-050.3 | Tool-, Picker-, Handoff-, Recovery- und Performanceverträge; stdio-JSON-RPC vor dem Parsen auf 1 MiB je Frame begrenzt und nach Überschreitung wieder synchronisiert | aktuelle Cowork-/OS-/UX-/Security-Evidenz E1/E2/E3 |
| BL-051.1–6 | ZIP-/Marketplace-/Paketgates lokal | Fresh Install, Update, Rollback, Hostmatrix und 100/500-Lauf E1 |
| BL-052.1–5 | synthetisches UAT-Kit und leere Evidenzvorlage | benannte Anwender-, Fach-, Datenschutz-, UX-, Architektur- und Securityrollen |

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
