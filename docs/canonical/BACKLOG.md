# Aktives Entwicklungsbacklog

Stand: 03.09.2026 · Produktstand 3.2.0-rc92

Dies ist die **einzige aktive Arbeitsliste**. Historische RC-Schnitte, erledigte
Teilarbeiten und frühere Keyring-/MCPB-Pläne stehen im
[Archiv](../archive/README.md) und in den monatlichen Backlogarchiven.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Eine technisch fertige Story mit
offener Zielsystem- oder Anwenderabnahme bleibt hier als „menschliche Evidenz
offen“ sichtbar, wird aber nicht als weitere Entwicklungsarbeit dargestellt.

## Aktiver Umsetzungsblock – Gesamtgegenreview 01.09.2026

Das unabhängige Gegenreview aus Test/CI, Dokumentation/UAT sowie Architektur,
Security, Performance, UX und aktueller Claude-Cowork-Sicht ist bis zum Abschluss
dieses Blocks ein **NO-GO für einen breiten Rollout**. Grüne E0-Tests ersetzen die
folgenden Produkt- und Zielhostnachweise nicht.

| Reihenfolge | Zugehörige Storys | Verbindliche Lieferung | Status |
|---|---|---|---|
| 1 | BL-002, BL-051.2, BL-052.1 | Produkt-, Legacy- und Engineering-Tests sowie GitHub-Workflows trennen; aktuellen UAT-Generator wirklich ausführen; Batch-Maintenance in die Produktregression aufnehmen. | **E0 erledigt** |
| 2 | BL-001, BL-002, BL-003 | `SECURITY.md`, Third-Party-Notices, Companion-/Governance-Altverträge, Register, Archivlinks und dokumentgesteuerte Link-/Driftgates auf den aktuellen Produktvertrag bringen. | **erledigt** |
| 3 | BL-012.2, BL-041.7, BL-044.1 | Keine stille Ordnerteilmenge, ehrliche Startbestätigung erst nach dauerhaftem Checkpoint und ausdrücklicher Prompt-Injection-Vertrag für übergebenes Markdown. | **E0 erledigt** |
| 4 | BL-010.7, BL-010.1, BL-041.7 | Cowork-Hostmatrix auf lokale Desktop-Sitzung/Local-MCP begrenzen; Cloud-Cowork, Web/Mobil und geplante Sitzungen ohne Local-MCP als NO-GO für Originale ausweisen. | **E0 erledigt** |
| 5 | BL-010.8, BL-010.1, BL-010.2, BL-010.3 | Selbsttragende Plugin-Runtime ohne System-Node für Windows x64 und macOS Intel/ARM bauen, paketieren und automatisiert prüfen. | **E0 implementiert; Zielhostevidenz offen** |
| 6 | BL-051.1, BL-051.2, BL-051.3, BL-051.5, BL-052.1–BL-052.5 | Fresh Install, Marketplace-Lebenszyklus, sichtbarer Cowork-Ablauf, Accessibility, Fach-/Security-/Datenschutz- und Anwenderabnahme mit dem ausführbaren UAT-Kit. | **menschliche Evidenz nach 1–5** |

Review-Evidence: Der aktuelle Node-UAT-Generator erzeugt reproduzierbar 111
synthetische Dateien. Produkt-, Engineering- und Legacy-Pfade sind getrennt;
Dokumentation, Hostmatrix, Ordnerannahme, Startstatus und Prompt-Injection-Vertrag
sind automatisiert geprüft. Der gebündelte Runtimevertrag deckt Windows x64 sowie
macOS Intel/ARM ab. Ein reales Windows-x64-Artefakt startete mit leerem `PATH`,
bestand MCP-Handshake/Status-Smoke und blieb unter 45 MiB (Build 01.09.2026:
34.845.038 Byte; lokaler Build 02.09.2026 nach dem Gesamtgegenreview:
34.913.330 Byte, SHA-256 `c34211c0…3815c`).
Reale macOS-Ausführung, Cowork-Fresh-Install und Marketplace-Lebenszyklus bleiben
menschliche Freigabeevidenz; bis dahin bleibt der breite Rollout NO-GO.

### In diesem Schnitt E0 abgeschlossen

| Story | Technischer Abschluss | Verbleibende Evidenz | Status |
|---|---|---|---|
| BL-011.8 | Journal, Intake-Intent, Arbeitsbaum und Cleanup sind größenbegrenzt sowie datei-/verzeichnisidentitätsgebunden; Austauschversuche und unsichere Strukturen stoppen fail-closed. | echtes Windows-/macOS-Dateisystem, Crash/Power-Loss und feindliche Race-Beobachtung über BL-011.11/BL-050.3 | **erledigt** |
| BL-020.1 | `data-secure-content-graph/v1` deckt TXT, Markdown, CSV und DOCX mit validierten Markdown-/Part-Locators ab; leere oder ungebundene Textknoten stoppen. | feinere Absatz-/Zelllocators sind erst für spätere Formatstories nötig | **erledigt** |
| BL-020.2 | Produktpreflight sperrt alle OOXML-Einbettungen; DOCX-Parser sperrt aktive Felder, Revisionen, Controls, externe/unklare Beziehungen und falsche Content Types fail-closed. | echter Office-Interoperabilitätskorpus und Security-Abnahme über BL-022.1/BL-049.1 | **erledigt** |
| BL-030.2 | zufälliger Stapelseed plus rohwertfreie HMAC-Alias-/Kollisionsbindungen werden dauerhaft gecheckpointet; Neustart, Alias, Manipulation und Fehlercleanup sind getestet – ohne Keyring oder Zusatzverschlüsselung. | echte Cowork-/OS-Neustart- und Crash-Fortsetzung über BL-011.3/BL-011.11 | **erledigt** |
| BL-011.10 | Eine atomare, prozessübergreifende Intake-Reservierung gilt vom Pickerstart bis zum dauerhaften Stapelcheckpoint. Die Reservierung kann sicher an den Worker delegiert werden; verwaiste Eigentümer werden fail-closed erkannt und zwei reale konkurrierende Prozesse lassen genau eine Aufnahme zu. | Mehrfachauswahl und Hintergrundstart in echter Cowork-Bedienung auf Windows/macOS messen | **erledigt** |
| BL-047.1 | Freigegebene Markdown-Snapshots werden asynchron und größenbegrenzt gelesen, gehasht und UTF-8-indiziert; ein 6-MiB-Regressionslauf belegt, dass der MCP-Ereignisloop währenddessen weiterläuft. | Referenzhardware messen und erst danach eine adaptive Parallelisierung bewerten; Produktstandard bleibt seriell | **erledigt** |
| BL-040.5 | Beim ersten Lauf wird der Cowork-Ergebnisordner erst nach erfolgreicher Anlage von `DataSecure-Output` dauerhaft gespeichert. Nur verifiziertes Markdown wird atomar mit neutralen Namen exportiert; die Zielidentität ist gebunden, nur ein fehlgeschlagener Export wird genau einmal nachgeholt, ein abgeschlossener Export ist endgültig (gelöschte oder bearbeitete sichtbare Ergebnisse werden nicht wiederhergestellt oder überschrieben, ein Zielwechsel spiegelt keine alten Läufe). Private Daten bleiben getrennt, der Abschluss bietet „Ergebnisse öffnen“, rekursive Quellen dürfen den sichtbaren Output nicht wieder aufnehmen und die MCP-Startantwort wartet begrenzt auf die ausdrückliche Empfangsbestätigung des Workers. | Fresh Install, Neustart, Ordnerwechsel und Abschlussaktion in echter Cowork-Bedienung auf Windows/macOS beobachten | **erledigt** |

### P0 – einfacher lokaler Sammelreview nach DS-068

Der verbindliche Detailvertrag ist
[`contracts/BATCH_REVIEW_V2.md`](contracts/BATCH_REVIEW_V2.md). Die drei vom
Product Owner bestätigten Lieferungen sind E0 umgesetzt; Zielsystem- und
Anwenderevidenz bleibt ausdrücklich getrennt.

| Priorität / Story | Detaillierte Lieferung | E0-Abnahmekriterium | Status / Rest |
|---|---|---|---|
| 1 · BL-012.9 | Den bestehenden lokalen Sammelreview als einzigen Reviewweg behalten. Nur `deferred_review`-Dateien werden lokal rekonstruiert; Reviewtext bleibt in `stdin`/Speicher, Journal, MCP und Diagnose bleiben inhaltsfrei. Abbruch, Vertagung, Timeout und Teilpublikation bewahren vorhandene Ergebnisse. | ein begrenzter Reviewer-Aufruf je Prüfgruppe; keine Rohdaten in Argumenten/Metadaten; Negativ- und Teilabbruchtests grün | **E0 erledigt** · E1/E2 Windows/macOS offen |
| 2 · BL-012.10 | PII-Shield-Interaktionen sicher übernehmen: rot/gelb, direkte fachliche Aktionen, automatisch/bereits/jetzt/danach-Zähler, Rückgängig, exakte Gruppenaktion, eine Schlussfreigabe und Windows-Kürzel `Alt+Z`, `Alt+O`, `Alt+R`, `Strg+Enter`, `Esc`. | UI-Vertrag für Windows/macOS/Linux, Fortschrittsmodell und inhaltsfreie Projektion getestet | **E0 erledigt** · Fokus/A11y/Verständlichkeit E2 offen |
| 3 · BL-043.1 | Klare Dateien automatisch lokal abschließen. Mischstapel veröffentlichen klare Positionen vor dem Review; vollständig klare Stapel öffnen keine Review-UI. Die Reviewgruppe enthält nur tatsächlich mehrdeutige Dateien. | vollständiger Klarstapel: null Reviewaufrufe und 100 Prozent abgeschlossen; Mischstapel: korrekte Zähler und nur eine offene Datei im Review | **E0 erledigt** · beobachteter Cowork-Lauf E2 offen |

| Aus PII-Shield bewertete Idee | Entscheidung | Backlogfolge |
|---|---|---|
| farbliche Treffer und direkte Keep/Redact-Aktionen | jetzt lokal übernommen | BL-012.10 |
| Fundstellenfortschritt, Rückgängig, Tastatur und eine Schlussfreigabe | jetzt lokal übernommen | BL-012.10, BL-012.5 |
| nur unklare Dateien vorlegen, klare Dateien automatisch abschließen | jetzt umgesetzt | BL-043.1 |
| gleiche Entscheidung auf nachweislich identische Kontexte anwenden | jetzt, aber nur bewusst und exakt | BL-012.10, BL-032.1 |
| zusätzliche übersehene Bereiche frei markieren | im Einzelreview vorhanden; im Sammelreview erst nach positionssicherer Dokumentabbildung | spätere eigenständige Story, kein aktueller P0 |
| lokale HTML-/App-Oberfläche für Rohdaten | nicht in die inhaltsfreie MCP-Status-App mischen; nur als späterer vollständig lokaler Architekturentscheid | BL-042.3 bleibt status-only |
| reversible Mappings, Rohdaten im Browser/MCP, Laufzeitdownloads, automatisches Raten | nicht übernehmen | dauerhaftes Sicherheits-Nichtziel |

Entscheidungsbasis: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016,
DS-017, DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025,
DS-026, DS-027, DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034,
DS-035, DS-036, DS-037, DS-038, DS-039, DS-040, DS-041, DS-042, DS-043,
DS-044, DS-045, DS-046, DS-047, DS-048, DS-049, DS-050, DS-051, DS-052,
DS-053, DS-054, DS-055, DS-056, DS-057, DS-058, DS-059, DS-060, DS-061,
DS-062, DS-063, DS-064, DS-065, DS-066, DS-067, DS-068, DS-069 und DS-070.

## A. Eigenständig lieferbare Entwicklung

| Story | Lieferung | Status |
|---|---|---|
| BL-022.1 | WordprocessingML wird namespacegebunden ausgewertet. Unbekannte XML-Entities, fremde Relationship-Namespaces und fremde direkte Textknoten stoppen fail-closed; Kopf-/Fußzeilen werden nur über die tatsächlichen Dokumentreferenzen in kanonischer Reihenfolge gelesen und fehlende Referenzen blockieren. Offen bleiben echte Word-/LibreOffice-/`python-docx`-Pakete, realistische Kommentare und eine konsistente AlternateContent-Policy. | **in Arbeit** |
| BL-024.2 | Der Engineering-Portable-Build übernimmt das verifizierte Universal-OCR-Bundle vollständig. Geschlossene Manifest-/Inventar-/Modus-/Hashgates, Installationspfade mit Leerzeichen, Adapter-Timeout und laufender Abbruch sind regressionsgetestet; der SEA-Engineering-Build behält das belegte OCR-Testbundle. Offen bleiben die kohärente Aufnahme in freizugebende Produktziele, ein nicht allein per Manifest aktivierbares Produktgate und ein echter Paket-zu-Adapter-zu-OCR-End-to-End-Test. PNG/JPEG/BMP-Freigabe bleibt getrennt BL-024.3. | **in Arbeit** |
| BL-042.3 | Inhaltsfreie Status-App um terminale bounded Zustände, vollständige Textfallback-Matrix und automatisierte Browser-/A11y-/DE-EN-DOM-Gates ergänzen. Der Windows-/CWD-unabhängige reproduzierbare Build sowie beide zulässigen Varianten für „Stapel läuft bereits“ sind korrigiert und regressionsgetestet. | **in Arbeit** |

### Offene Restbefunde aus dem Gesamtgegenreview 02.09.2026

Belegte, nicht behobene Befunde des Claude-Code-Gesamtgegenreviews (Bericht
`tasks/CLAUDE-CODE-GESAMTREVIEW-BERICHT-RC86.md`). Sie sind ihren bestehenden
Storys zugeordnet und keine neuen Storys; Unterredaktion wiegt schwerer als
Komfort.

| Befund | Story | Prio | Rest |
|---|---|---|---|
| Liveness nur über `kill(pid, 0)`: eine wiederverwendete PID lässt eine tote Executor-Lease oder einen toten Lock „lebendig“ wirken; die gespeicherte Startzeit wird nie geprüft. | BL-011.11 | P2 | Design (Startzeit-Helfer oder exklusiver Lock-Handle je Executor) und reale Crash-Evidenz |
| Unicode-Kompatibilitätsvarianten (Fullwidth `＠`/Ziffern, Dot-Leader) umgehen E-Mail-/IBAN-/Telefon-Detektoren und Residual-Gate; `CONTACT_URI_RE` frisst ohne Trennzeichen angrenzenden Text (Überredaktion). | BL-021.1 | P3 | NFKC-/Confusable-Regel für Erkennung und Residual-Gate ohne Fachinhaltsverlust |
| Support-Review `review_deferred_document_batch` rekonstruiert Rohtext im MCP-Hauptprozess ohne `network-deny`. | BL-020.3 | P3 | Supportweg über den detached Review-Worker leiten oder als Ausnahme im Netzwerkvertrag dokumentieren |
| Resume-/Review-Start melden Erfolg ohne die für den Pickerstart eingeführte Worker-Empfangsbestätigung. | BL-043 | P3 | dieselbe begrenzte Bestätigung für `startLocalBatchExecutor`/`startLocalReviewExecutor` |
| Ein nach ACK-Timeout gestoppter Intake lässt bereits kopierte Arbeitskopien bis zum Intent-Ablauf liegen. | BL-011.8 | P3 | toten Intake-Owner ohne Journal sofort bereinigen |
| Synchrones SHA-256 im Listing-Pfad neben dem asynchronen Snapshot-Hash; der 6-MiB-Yield-Test prüft nur `turns > 0`. | BL-047.1 | P3 | Listing-Verifikation an den asynchronen Hash koppeln; Maximal-Stall messen |
| `visibleResultTreeOverlaps` ohne Cache (Realpath je Datei und Wurzel). | BL-044.1 | P3 | Quantifizierung auf Referenzhardware; Cache nur bei belegtem Bedarf |
| Skill-Evals und MCPB-Manifest ohne DS-069-Fälle (Ordnerwechsel, Reset, `result_folder_required`, Sync-Hinweis). | BL-041.10 | P3 | Eval-Fälle ergänzen; MCPB bleibt Engineering-only |
| `test:product` (Profil `full`) startet über den Picker-Lifecycle-Test reale, fensterlose PowerShell-Prozesse (nur Windows, zeitbegrenzt). | BL-002 | P3 | akzeptiert; bei Bedarf in ein Windows-Only-Gate auslagern |
| Die Abschlussfenster-Übernahme (`terminal_notice`) wird dauerhaft geschrieben, bevor das Fenster tatsächlich erscheint; stirbt der Elternprozess oder scheitert die Präsentation dazwischen, zeigt auch der Worker kein Fenster mehr (Review rc90). Seit rc91 ist der Fehlschlag inhaltsfrei protokolliert. Seit rc92 tragen alle Ablaufereignisse eine Laufkennung `run_id`, und ein verweigerter Start hinterlässt `startup_refused`, Markerdatei und eine pfadfreie Fehlerzeile (DS-071). | BL-041.10 | P3 | zweiphasige Übernahme (vorläufig → nach Präsentation bestätigt) entwerfen; Zeitfenster nur nativ auf dem Cowork-Host belegbar |
| Zwei parallel gepflegte Allowlists (`diagnostic-causes.js` `CAUSES` und `workflow-diagnostics.js` `ERROR_CODES`); IPC-Ack-Klassifikation über festen Fehlertext statt `.code` (Review rc90, kein Abfluss). | BL-041.1 | P3 | eine gemeinsame Codeliste; `.code` an den beiden festen IPC-Fehlern |

## B. Technisch vorbereitet – menschliche Evidenz offen

| Story | Noch erforderlicher Nachweis | Status |
|---|---|---|
| BL-010.8 | Selbsttragende Runtime und drei Zielpaketprojektionen sind E0 fertig; reale macOS-Intel-/ARM-Ausführung und Cowork-Fresh-Install fehlen. Die selbsttragende Marketplace-Projektion (ohne `command: node`, ohne OCR-Engineering-Baum, unter 50 MiB) ist noch nicht gebaut; der Marketplace-Quellordner ist ein Entwicklungskatalog. | **blockiert** |
| BL-010.7 | Lokale Cowork-Sitzung mit Plugin-MCP positiv sowie Desktop-Cloud/Web/Mobil ohne Local-MCP negativ prüfen. | **blockiert** |
| BL-010.1 | Portablen Pluginstart auf jedem freizugebenden Zielsystem ohne vorinstallierte Runtime nachweisen; Windows-E0 ist grün, macOS und echter Cowork-Host fehlen. | **blockiert** |
| BL-010.2 | Windows-x64 Fresh Install, Kernlauf, Update und Entfernen. | **offen** |
| BL-010.3 | macOS Intel/ARM Fresh Install, Kernlauf, Quarantäne und Entfernen. | **offen** |
| BL-010.6 | Upgrade und Rollback mit unveränderten Quellen und synthetischen Daten. | **offen** |
| BL-011.3 | Mehrere pausierte Stapel und stabilen Pseudonymkontext real prüfen; kein Keyring. | **blockiert** |
| BL-011.6 | Größen- und Ressourcenstopps auf Windows und macOS beobachten. | **blockiert** |
| BL-011.7 | Abbruch, Fortsetzung und Zähler in echter Cowork-Bedienung verstehen lassen. | **blockiert** |
| BL-011.9 | POSIX-Supervisor auf realen macOS-Zielen unter Last und Abbruch nachweisen. | **blockiert** |
| BL-011.11 | Crash-/Dateisystemverhalten auf realen Zielsystemen prüfen. | **blockiert** |
| BL-011.12 | Adaptive Mehrprozessvorbereitung erst nach Windows-/macOS-Ressourcennachweis aktivieren. | **blockiert** |
| BL-011.13 | Plain-Arbeitskopien, Review und Fortsetzung auf Zielsystemen abnehmen; kein Schlüsselbundtest. | **blockiert** |
| BL-012.2 | Abschluss-, Review-, Resume- und Stopmeldungen beobachtet abnehmen. | **blockiert** |
| BL-012.3 | Vertagten Review nach Neustart ohne neue Dateiauswahl fortsetzen. | **blockiert** |
| BL-012.5 | Tastatur, Zoom, Screenreader und Fokus auf Windows/macOS prüfen. | **blockiert** |
| BL-012.6 | Alltagssprache und genau eine nächste Aktion mit fachfremden Personen prüfen. | **blockiert** |
| BL-012.7 | Kernaufgabe ohne technische Hilfe in höchstens drei bewussten Aktionen abschließen. | **blockiert** |
| BL-012.8 | macOS-Reviewdialog mit echtem `osascript` und Fresh Install prüfen. | **blockiert** |
| BL-012.9/10, BL-043.1 | Vereinfachten Sammelreview und automatischen Klar-Datei-Pfad in echter lokaler Cowork-Sitzung auf Windows/macOS beobachten; prüfen, dass klare Dateien keinen Dialog öffnen und die inhaltsfreien Zähler verstanden werden. | **blockiert** |
| BL-021.1 | TXT/Markdown auf Windows und macOS im installierten Produkt abnehmen. | **blockiert** |
| BL-021.2 | CSV-Dialekte und fachlichen Inhalt auf Windows/macOS abnehmen. | **blockiert** |
| BL-031.1 | Zertifikats-/Organisationskontext durch IT-/Health-IT-Fachvertretung prüfen. | **blockiert** |
| BL-032.1 | Mehrdeutigkeitsdialog auf Windows/macOS verständlich und konsistent abnehmen. | **blockiert** |
| BL-041.1 | Beide Skills in echter Claude-UI gegen denselben Jobvertrag prüfen. | **blockiert** |
| BL-041.2 | Ursprüngliche Aufgabe nach Abbruch begrenzt und verständlich fortsetzen. | **blockiert** |
| BL-041.3 | Chat-Upload eines synthetischen Originals muss sicher zum lokalen Picker umleiten. | **blockiert** |
| BL-041.4 | Spracheingabe und direkte Skillauswahl müssen denselben Ablauf starten. | **blockiert** |
| BL-041.5 | 100 Dateien/500 MiB, Neustart und Fortsetzung in Cowork abnehmen. | **blockiert** |
| BL-041.6 | Reine Anonymisierung endet lokal ohne Polling oder automatisches Ergebnislesen. | **blockiert** |
| BL-041.7 | Werkzeugberechtigungen, Pickerabbruch und Ergebnisübergabe in aktueller Cowork-Version prüfen. | **blockiert** |
| BL-041.8 | MCP-Tasks/Benachrichtigungen versionsgebunden prüfen; ohne Nachweis kein Produktpfad. | **blockiert** |
| BL-041.9 | Nicht blockierenden Sammelreview und Abschluss auf Windows/macOS beobachten. | **blockiert** |
| BL-041.10 | Die gelieferte einmalige Ergebnisordnerwahl, Wiederverwendung ohne neue Abfrage, Ordnerwechsel, Exportwiederholung und „Ergebnisse öffnen“ in echter lokaler Cowork-Bedienung auf Windows/macOS abnehmen. Beobachtung 03.09.2026 (Windows, rc85): Cowork beendet den MCP-Elternprozess kurz nach der Tool-Antwort; die Abschlussmeldung erschien in 4 von 5 Läufen nicht. Seit dem Worker-seitigen Abschlussdialog (E0) ist nativ zu belegen, dass genau ein Fenster erscheint. | **blockiert** |
| BL-044.1 | Rekursive Ordnerquelle mit Link-/Race-Gegenproben auf Zielsystemen prüfen. | **blockiert** |
| BL-049.1 | Format-/Strukturgates und Ergebnisgrade durch Security auf Zielsystemen abnehmen. | **blockiert** |
| BL-050.3 | Referenzwerte und reales Dateisystem-/Power-Loss-Verhalten erfassen. | **blockiert** |
| BL-051.1 | Plugin-ZIP auf Windows x64 und macOS Intel/ARM frisch installieren. | **offen** |
| BL-051.2 | Erst nach Bereitstellung der selbsttragenden Marketplace-Projektion: privaten Marketplace auf Windows/macOS installieren, aktualisieren und entfernen. | **offen** |
| BL-051.3 | Versionneuen UAT-Serienlauf mit 100 Dateien und bis zu 500 MiB durchführen. | **offen** |
| BL-051.4 | Produktrollback auf Windows/macOS abnehmen. | **offen** |
| BL-051.5 | ZIP-/Marketplace-Lebenszyklus in Cowork real abnehmen. | **offen** |
| BL-051.6 | Desktop-Cloud-/Web-/Mobil-/Scheduled- und Desktop-Local-ohne-MCP negativ auf Originalzugriff prüfen. | **blockiert** |
| BL-052.1 | Beobachtete Anwenderabnahme mit dem aktuellen UAT-Kit durchführen. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit fachfremden Nutzenden abnehmen. | **offen** |
| BL-052.5 | Architektur und lokale Sicherheitsgrenze vor breitem Rollout freigeben. | **offen** |

„Blockiert“ bedeutet hier: Die Implementierung oder E0-Vorbereitung ist vorhanden,
aber eine reale Zielplattform, Claude-Version oder benannte Fachperson ist für den
Abschluss erforderlich. Es ist kein verdeckter Entwicklungsauftrag.

## C. Spätere Format- und Plattformausbaustufen

| Story | Lieferung | Status |
|---|---|---|
| BL-010.4 | Linux-Paket nach dem Windows-/macOS-Erstrelease mit eigener Hostevidenz liefern. | **offen** |
| BL-022.2 | XLSX erst nach vollständiger Formel-, Kommentar-, Chart- und Relationship-Coverage freigeben. | **offen** |
| BL-022.3 | PPTX erst nach vollständiger Folien-, Master-, Notiz-, Chart- und Objekt-Coverage freigeben. | **offen** |
| BL-023.1 | PDF-/OCR-Risikogate bis zur vollständigen Pflichtmatrix als NO-GO erhalten. | **in Arbeit** |
| BL-023.2 | Text-PDF nur nach vollständiger Parser-/Render-/Security-Coverage freigeben. | **offen** |
| BL-023.3 | PDF-Formulare, Annotationen, Anhänge, Signaturen und Verschlüsselung absichern. | **offen** |
| BL-023.4 | Scan-PDF und visuelle Coverage vollständig absichern. | **offen** |
| BL-024.3 | PNG, JPEG und BMP erst nach Decoder-, OCR-, Metadaten- und Pixelredaktionsnachweis freigeben. | **offen** |

## Epics

### BL-010 – Plattform und Distribution
### BL-003 – Product Vision und Dokumentenkanon
### BL-001 – Dokumentensystem und Wiederverwendung
### BL-002 – Ist-/Zielvertrag und Drift
### BL-011 – Sicherer fortsetzbarer Stapelkern
### BL-012 – Nutzerreise und lokaler Review
### BL-020 – Gemeinsame Inhaltsgrenze
### BL-021 – Text und CSV
### BL-022 – OOXML-Formate
### BL-023 – PDF-Risikogate
### BL-024 – OCR und Rasterbilder
### BL-030 – Profil und Pseudonyme
### BL-031 – Zertifikats- und Fundstellenkontext
### BL-032 – Mehrdeutigkeit
### BL-040 – Lokaler Export und Nachweis
### BL-041 – Claude-Übergabe
### BL-043 – Cowork-Fast-Path
### BL-044 – Sichere Datei- und Ordnerquellen
### BL-047 – Performance und Ressourcensteuerung
### BL-049 – Inhalts- und Formatgrenze
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme

Erledigte Arbeiten zu BL-001/002/003/040/043 sowie abgeschlossene E0-Scheiben
stehen ausschließlich in `BACKLOG_ARCHIVE_2026-08.md` und
`BACKLOG_ARCHIVE_2026-09.md`.
