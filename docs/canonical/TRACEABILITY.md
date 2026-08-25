# Entscheidungs-Traceability

Stand: 25.08.2026

Jede angenommene Entscheidung muss mindestens einer Backlogposition zugeordnet sein.
„Zielnachweis“ beschreibt die verlangte Evidenz, nicht den heutigen RC36-Status.
Konkrete Stories `BL-nnn.x` erben die Entscheidungszuordnung ihres Epics; erledigte
Stories erhalten zusätzlich unten einen überprüfbaren Umsetzungsnachweis.

| Entscheidung | Backlog | Zielnachweis |
|---|---|---|
| DS-001 | BL-042 | Aussagegrenzen in Skill, UI, Ergebnis und Tests |
| DS-002 | BL-010, BL-051 | ZIP- und Marketplace-Abnahme desselben Releases |
| DS-003 | BL-010, BL-041 | Capability-Test je Claude-Oberfläche |
| DS-004 | BL-010, BL-051 | Installation ohne manuelle Runtime auf drei OS |
| DS-005 | BL-041 | exakt zwei sichtbare validierte Skills |
| DS-006 | BL-041 | identischer Lauf per Sprache und Skillauswahl |
| DS-007 | BL-020 bis BL-024, BL-050 | positive Coverage je Zielformat |
| DS-008 | BL-020 bis BL-023, BL-040 | ein vollständiges Markdown je Quelle |
| DS-009 | BL-023, BL-024, BL-050 | kein Bildpixel für Claude, OCR-/Grafiktests |
| DS-010 | BL-011 | 100 Dateien/500 MiB je Stapel; TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes, DOCX 64 MiB/128 MiB entpackt; keine feste Seitenbegrenzung |
| DS-011 | BL-030 | gemischter Stapel ohne Nutzerprofilwahl |
| DS-012 | BL-030, BL-031, BL-050, BL-052 | Erkennungs- und Erhaltungsmetriken |
| DS-013 | BL-012, BL-031, BL-032, BL-052 | genau ein Abschlussdialog |
| DS-014 | BL-012, BL-032 | vertagte Datei bleibt gesperrt und fortsetzbar |
| DS-015 | BL-012, BL-020, BL-023 | unlesbare Datei ohne falsche Teilfreigabe |
| DS-016 | BL-012, BL-032 | Passwort nur lokal und im RAM |
| DS-017 | BL-020, BL-022, BL-050 | Rekursions-/Aktivinhalts-Adversarialtests |
| DS-018 | BL-023, BL-024 | Netzwerkblock und Offline-End-to-End-Test |
| DS-019 | BL-030 | konsistent im Stapel, inkonsistent zwischen Stapeln |
| DS-020 | BL-011 | Original unverändert, offene Kopien nach 14 Tagen weg |
| DS-021 | BL-011 | Crash-/Abbruchfortsetzung ohne Doppelverarbeitung |
| DS-022 | BL-011 | nur ein aktiver Job, pausierte Jobs getrennt |
| DS-023 | BL-040 | fester sicherer Standardordner, Export bleibt bestehen |
| DS-024 | BL-040 | UTF-8-CSV ohne Pfade und außerhalb MCP |
| DS-025 | BL-040 | JSON-Schema und Leckageprüfung |
| DS-026 | BL-042 | expliziter Diagnoseexport und Privacy-Schema |
| DS-027 | BL-032, BL-041, BL-052 | automatische Freigabe plus optionale Vorschau |
| DS-028 | BL-012, BL-024, BL-042, BL-052 | Tastatur-, Skalierungs- und Screenreader-Abnahme |
| DS-029 | BL-030, BL-031 | keine Regelkonfiguration im normalen UI |
| DS-030 | BL-010 | keine Signaturpflicht und keine Signaturbehauptung |
| DS-031 | BL-010, BL-051 | Versionsanstieg, Archiv und getestete Rückrolle |
| DS-032 | BL-041, BL-042 | konsistente Pseudonymisierungs-Klarstellung |
| DS-033 | BL-050, BL-052 | 1.000 Fälle, null Pflicht-Misses, ≥99 % Erhalt |
| DS-034 | BL-010, BL-051 | vollständige Drei-Plattform-Matrix |
| DS-035 | BL-002, BL-020 | migrationsfähige Verträge und grüne Regression |
| DS-036 | BL-011, BL-012 | Fortschritt, sicherer Abbruch und Fortsetzung |
| DS-037 | BL-024 | Deutsch-/Englisch-OCR und gemischtsprachige Tests |
| DS-038 | BL-001, BL-010 bis BL-052 | Komponentenregister, Prüfgate und begründete Restlücke vor Eigenentwicklung |
| DS-039 | BL-011, BL-041, BL-051 | vollständiger lokaler Batchabschluss getrennt von begrenzter, fortsetzbarer Claude-Inhaltsübergabe |
| DS-040 | BL-041, BL-043, BL-050 | lokaler Ein-Aufruf-Standard, explizite Claude-Folgeauswertung und kein Host-Polling als Produktvoraussetzung |
| DS-041 | BL-003, BL-041, BL-043 | Cowork-first-Ablauf mit lokaler Ausführung und ohne separate Normalweg-App |
| DS-042 | BL-042 | inhaltsfreie progressive MCP-App und vollständiger OS-/Textfallback |
| DS-043 | BL-011, BL-012, BL-041 | kurzer Start, durable Worker, Review ohne Entscheidungs-Timeout und pausierte Stapel ohne Startsperre |
| DS-044 | BL-044, BL-011 | Datei-/Ordnerumfang vollständig prüfen, keine Linkverfolgung und Quellen nur lesen |
| DS-045 | BL-049, BL-012 | drei eindeutige Ergebnisgrade ohne stille Teilfreigabe |
| DS-046 | BL-032, BL-049 | verschlüsselte Quellen weder kopieren noch entschlüsseln; Reststapel fortsetzen |
| DS-047 | BL-047, BL-050 | adaptive Ressourcensteuerung und 2-s-/10-s-/10%-Performancegates |
| DS-048 | BL-042, BL-043 | Readiness, genau ein Self-Heal und inhaltsfreie 14-Tage-Diagnose ohne Telemetrie |
| DS-049 | BL-020, BL-022, BL-023, BL-024, BL-049 | Signatur-/Strukturgate, vollständige Office-Coverage, lokale OCR und Residual-Gate |
| DS-050 | BL-011, BL-030, BL-040 | OS-benutzergebundene Verschlüsselung, sichere Eigenartefaktlöschung und dauerhafte Exporte |
| DS-051 | BL-041, BL-043 | local-only oder einmalige Batchübergabe und höchstens drei Abschlussaktionen |
| DS-052 | BL-010, BL-051 | erste Cowork-Freigabe Windows x64 und macOS x64/ARM64; weitere Plattformen gestuft |
| DS-053 | BL-010, BL-051 | selbsttragende ZIP-/Marketplace-Pakete und signierte native Sicherheitskomponenten vor Rollout |
| DS-054 | BL-010, BL-011, BL-051 | reversible Migration, Update und Rollback ohne Nutzerdatenverlust |
| DS-055 | BL-012, BL-042, BL-052 | Deutsch/Englisch, A11y und nicht abschwächbare Adminpolicy |
| DS-056 | BL-050, BL-051, BL-052 | gestufte Technik-, Cowork-, Fach-, Security- und Rollout-Evidenz ohne offene P0/P1 |
| DS-057 | BL-003 | Dokumentenrang, unveränderliche IDs und automatisches Driftgate |
| DS-058 | BL-040, BL-044 | neutrale Ergebnisse und minimales lokales Mapping mit bedingtem relativen Pfad |
| DS-059 | BL-011, BL-030 | verschlüsselter neustartfester Pseudonymkontext und terminale Löschung |
| DS-060 | BL-001, BL-010, BL-020, BL-024, BL-051 | gepinnte Offline-Lieferkette, Integrität, Lizenz, SBOM und keine Runtime-Downloads |

## Offene Review-Nachweise vom 23.08.2026

| Story | Review-Befund | Erforderlicher Abschlussnachweis |
|---|---|---|
| BL-011.8 | `dataRoot()/batches` besitzt noch keinen vollständigen Reparse-/Junction-Vertrag | echte Junction-/Symlink- und Swap-Gegenproben vor Kopie, Recovery und Cleanup auf allen Ziel-OS |
| BL-011.9 | V8-Heap/Parent-Timeout ersetzen auf POSIX keine harte native Ressourcen- und Prozessbaumgrenze | gebündelter Supervisor plus reale CPU-/RAM-/Flood-/Child-/Timeout-Matrix auf macOS x64/ARM64 und Linux x64 |
| BL-012.8 | macOS-AppleScript referenziert bei vertagbarem Review einen nicht angebotenen Cancel-Button | validierter Aktionsbuilder, Unit-Invarianten und echter `osascript`-/Fresh-Install-E2E-Nachweis |
| BL-010.7 | Cowork-Dokumentation zu local MCP in Cloud-/Web-/Mobil-Sitzungen ist widersprüchlich | `HOST_MATRIX_V1.json`, kanonischer Host-Gate-Text und `test-host-matrix` umgesetzt; beobachtete versionsgebundene Hostabnahme bleibt offen |
| BL-010.8 | Plugin-ZIP startet weiterhin `node`; die MCPB-Runtimegarantie gilt nicht automatisch. Der unveröffentlichte SEA-Pilot bindet Node 22.23.2/postject, vier Herstellerarchive und einen festen Ein-Plugin-Dispatcher. Windows x64 bestand byteidentischen Doppelbuild sowie echten `initialize`-/`privacy_status`-Handshake bei leerem `PATH`; Produktumschaltung bleibt geschlossen. | manuelle echte macOS-x64-/ARM64- und Linux-x64-Zellen, universelles ZIP-/Marketplace-Assembly, frisches Konto/VM ohne System-Node, Update und Rollback |
| BL-041.4 | Direkte Prompts und Skill boten bei offenen Stapeln nicht dieselben Entscheidungen | kanonischer Drei-Wege-Vertrag und Contract-Tests umgesetzt; Modelltest und beobachtete Fresh-Install-Startparität bleiben offen |
| BL-041.5 | Maximalstapel konnte bis zu 26.700 Modell-Leseaufrufe erzeugen | abgekoppelter Worker, Crash 1/50/100, MCP-Prozesswechsel, getrennte lokale Freigabe und begrenzter namenfreier Leseplan umgesetzt; 500-MB-/Host-/Rechnerneustart-/Drei-OS-/Cowork-Gates offen |
| BL-042.2 | MCP-Tools besitzen keine vollständige destruktiv/read-only/idempotent Semantik | Strict-Validator, Policy-Test und echte Cowork-Manual-/Auto-/Skip-Abnahme |
| BL-051.5/BL-051.6 | Pakettests belegen weder Cowork-Lebenszyklus noch negative Hostklassen | Policy-/Evalmatrix für Web, Mobil, Cloud/Scheduled und getrennten Desktop umgesetzt; Fresh Install/Update/Rollback und beobachtete Realhost-Matrix bleiben offen |
| BL-051.7 | sieben Jobs pro normalem Push verursachten unnötige Runnerkosten | genau ein automatischer Ubuntu-Job; schwere Plattform-, Release-, Security-, OCR- und PDF-Evidenz nur manuell auswählbar; `test-workflow-budget.js` verhindert Kostendrift |

## Umsetzungsnachweise erledigter Stories

### RC44-Arbeitsnachweise aus Product-Vision-Review

| Story | Nachweis |
|---|---|
| BL-011.14 (Teilnachweis) | `gateway/retention.js` und `test-retention.js` schließen freigegebene Output-Pakete aus jeder automatischen Retention aus; nur `purge_local_data` mit ausdrücklicher Bestätigung darf sie löschen. Der normale Picker-/Batchpfad verarbeitet externe Quellen bereits über private Kopien; die technische Support-Inbox bleibt bis zu ihrer Ablösung ein verwalteter Importbereich. |
| BL-041.9 (E0-Teilnachweis) | `server/index.js`, Skill/Promptvertrag und Cowork-Dokumententest belegen, dass pausierte Stapel keine neue Auswahl blockieren. `review-timeouts.js`, `text-review.js` und `test-local-review-executor.js` entfernen im abgekoppelten Worker den menschlichen Entscheidungs-Timeout; der synchrone Supportpfad bleibt begrenzt. `completion-summary.js` und sein Test starten die rein inhaltsfreie terminale Meldung detachiert, sodass ihr Schließen keinen Worker- oder Cowork-Aufruf blockiert. Echte Cowork-/Windows-/macOS-UX-Evidenz bleibt E1/E2. |

| Story | Nachweis |
|---|---|
| BL-002.1 | `BUILD_INFO.json`, `manifest.json`, `gateway/status.js`, `test-manifest.js` |
| BL-002.2 | `TARGET_CAPABILITIES.json` deckt DS-001 bis DS-060 sowie Formate, Plattformen, Grenzwerte und die getrennte Claude-Übergabe maschinenlesbar ab |
| BL-002.3 | `test-capability-contract.js` vergleicht Ist-/Zielvertrag, Runtime, Skills, Marketplace und aktive Handbücher; Bestandteil von `npm test` |
| BL-010.5 | `build-plugin.mjs`, `verify-plugin-zip.mjs`, `test-plugin-structure.js` und der reproduzierte RC30-Build binden ZIP und Marketplace an denselben kanonischen Pluginbaum; das ersetzt keine frische Marketplace-Installation (BL-051.2) |
| BL-051.7 | `ci.yml`, `release-evidence.yml`, `security.yml`, `test:ci` und `test-workflow-budget.js` belegen den kostenbegrenzten automatischen Pfad und erhalten schwere Evidenz als bewusste manuelle Auswahl |
| BL-011.1 | `contracts/BATCH_SNAPSHOT_V1.md` und `test-architecture-contracts.js` definieren und prüfen den unveränderlichen privaten Snapshot |
| BL-011.6 (Teilnachweis) | `zip-reader.js`, `gateway/batch.js`, `runtime.js`, `test-parsers.js`, `test-parser-isolation.js` und `test-batch-session.js` belegen eine reine lokale Verzeichnisprüfung echter ZIP-/CFB-Office-Container vor dem Snapshot, die Sperre ohne neue Arbeitskopie bei übergroßen, verschlüsselten oder unsicheren Containerdaten. Nicht-Container mit einer Office-Endung durchlaufen dagegen den bestehenden einzelnen Stopp-/Fortsetzungsweg. Feste aktive Parserbudgets: 384 MiB V8-Heap/50 s auf allen Plattformen; zusätzlich Windows Job Object: 768 MiB, 40 s CPU, 45 s Wallclock. |
| BL-011.8 (Teilnachweis) | `gateway/common.js`, `gateway/batch.js` und `test-batch-session.js` belegen zentrale literale Kindverzeichnisse, wiederholte Link-/Containment-/Geräte-/Inode-Prüfung, einen echten Windows-Junction-Stopp sowie reale Austauschproben direkt vor Snapshot und Recovery und einen verschachtelten Linkstopp vor Cleanup. Das Cleanup verwendet keine rekursive OS-Löschung mehr, sondern lstat-/inode-gebundene Einzelobjekt-Entfernung. Gerettete und externe Daten bleiben unverändert. Native sonstige Reparse-Attribute, echte POSIX-Matrix und vollständig handle-relative Löschprimitive bleiben offen. |
| BL-011.9 (Teilnachweis) | `native/ocr/pilot/posix-sandbox.c`, `server/posix-supervisor.js`, `runtime.js`, `scripts/lib/posix-supervisor-artifacts.mjs`, `scripts/build-plugin.mjs`, `scripts/build-mcpb.mjs`, `contracts/POSIX_SUPERVISOR_PACKAGING_V1.md`, `test-posix-supervisor.js` und `test-posix-supervisor-packaging.mjs` pinnen CPU-, Core-, Adressraum-, Daten-, Dateigrößen-, Dateideskriptor-, RSS- und Wallclockgrenzen, Prozessgruppe/Reaping und einen inhaltsfreien Vertragsmarker. Der allgemeine Parser nutzt einen vorhandenen POSIX-Supervisor nur nach fester Zielauflösung, no-link Binär-/Hash-/Format- und Contract-Prüfung; ein vorhandenes defektes Artefakt stoppt ohne Parser-Spawn. ZIP- und MCPB-Builds verweigern jede unvollständige, verlinkte, falsch formatierte oder falsch gehashte zukünftig vorhandene POSIX-Zielanlage und setzen nur deren Ausführmodus. Paketierte Zielbinärhashes sowie adversariale macOS-/Linux-Proben bleiben offen. |
| BL-010.8 (Windows-Teilnachweis, kein Release) | `launcher-contract.json`, `bootstrap.cjs`, `datasecure-mcp`, Build-/Verifikations-/Assemblyskripte, `test-sea-launcher-contract.js`, `test-sea-plugin-assembly.js` und der nur manuell startbare Vier-Ziel-Workflow belegen feste Quellen/Hashes, deterministischen Windows-Doppelbuild, echten installationsfreien MCP-Handshake und fail-closed Vier-Artefakt-Assembly. `RUNTIME_START_MATRIX_V1.json` hält die Produktumschaltung bis zu allen übrigen OS-/Lifecycle-Nachweisen geschlossen. |
| BL-011.5 | `gateway/batch.js`, `gateway/batch-maintenance.js`, `index.js`, `test-batch-session.js` und `test-batch-maintenance.js` belegen sofortige oder nachgelagerte, reguläre-Datei-gebundene Arbeitskopienbereinigung, eine globale Owner-Sperre für Startup-Recovery und periodische Ablaufbereinigung, begrenztes sechs-stündiges Scheduling, Fehlerisolation und das einmalige Stoppen beim Server-Shutdown; ein lebender Batch wird weder umklassifiziert noch bereinigt |
| BL-011.7 (Teilnachweis) | `gateway/batch.js`, `gateway/status.js`, der Dokument-Skill sowie Batch-/MCP-Tests belegen einen inhaltsfreien Aktiv-Wahrheitswert, der konkurrierende Auswahl- und Fortsetzungsdialoge verhindert |
| BL-012.6 (Teilnachweis) | `gateway/batch.js` und `test-batch-user-status.js` belegen für jede unterstützte Batchphase einen kurzen deutschen Anwenderstatus und genau eine sichere nächste Aktion. Status, Restzeit und unbekannte Persistenzphasen enthalten keine Namen, Pfade, Endungen oder Token; eine unbekannte Phase darf nie in eine weitere Verarbeitung fallen. Die native Fortschritts- und Zielplattformabnahme bleibt offen. |
| BL-012.1 | `gateway/batch.js`, `companion/text-review.js` und `test-batch-session.js` belegen, dass Mehrdatei-Stapel klare Positionen ohne Einzeldialog analysieren, Mehrdeutigkeiten als inhaltsfreies `deferred_review` sammeln und erst nach Ende der Analyse genau einen ausdrücklichen lokalen Sammelreview zulassen. Entwurfsdaten werden nicht journalisiert; Abbruch und technische/visuelle Unsicherheit bleiben terminal oder zurückgehalten. |
| BL-012.2 (Teilnachweis) | `contracts/BATCH_REVIEW_V1.md`, `gateway/batch.js`, `companion/text-review.js` und `test-batch-session.js` binden das in-memory Batch-Entwurfsmodell an versiegelte Arbeitskopien, anonyme Dokumentnummern, globale lokale Fundstellen-IDs und eine ohne Rohtext/Namen/Pfade rückführbare Entscheidung. `review_deferred_document_batch` ruft genau einen lokalen Reviewer auf und veröffentlicht erst danach atomare Einzelpakete; die Windows-Ansicht sperrt freie Bereichsredaktionen im Stapelmodus. Tatsächliche native Ein-Fenster-Parität und Drei-OS-Abnahme bleiben offen |
| BL-012.8 (Teilnachweis) | `companion/text-review.js` und `test-companion-processor.js` belegen den zentral validierten Drei-Button-Vertrag für Darwin-Fundstelle, Gruppenwahl und Finale, angebotene Default-/Cancel-Buttons sowie sichere Defer-/Cancel-Semantik für Escape/Schließen. Echter `osascript`-/Fresh-Install-Nachweis auf macOS bleibt offen. |
| BL-032.1 (Teilnachweis, macOS defekt) | `companion/text-review.js` und `test-companion-processor.js` belegen die modellierte Aktionssemantik. Das Review vom 23.08.2026 weist jedoch den nicht angebotenen AppleScript-Cancel-Button nach; macOS ist bis BL-012.8 kein Funktions-/Plattformnachweis. Windows-Codebasis und Linux-Adapter bleiben Teilnachweise; praktische native Drei-OS-/Barrierefreiheitsabnahme bleibt offen |
| BL-032.2 (Teilnachweis, keine Entschlüsselungsfreigabe) | `companion/local-password.js`, `ui-process-policy.js` und `test-local-password.js` belegen maskierte lokale Passwortdialoge, die Abwesenheit von Passwort-Argumenten/Umgebungswerten sowie die Nullung der lokalen Übergabebuffer nach Erfolg und Fehler. Der Vertrag ist nicht an einen Entschlüsseler gebunden; passwortgeschützte Dateien bleiben bis zu dessen geprüfter lokaler Drei-OS-Integration gesperrt. |
| BL-011.3 (Teilnachweis) | `gateway/batch.js`, `test-batch-session.js` und `test-mcp-protocol.js` belegen Ein-Stapel-Sperre, atomar gesperrte Startup-Recovery mit Dateiname-/Tokenbindung sowie Crash-zu-Retryable auch nach zuvor übersprungener Live-Recovery. Stapelweite persistente Pseudonymkontexte bleiben wegen der Keyring-Abnahme bewusst offen. |
| BL-011.4 | `gateway/batch.js` und `test-batch-session.js` belegen die atomaren inhaltsfreien Phasen `processing_started`, private Kopie, Extraktion, Textprüfung, Paketverifikation, Übergabe und Terminalzustand, explizite Fortsetzungsbestätigung einschließlich idempotenter Wiederholung ohne doppelte Einreihung sowie die verifizierte erneute Zustellung eines bereits veröffentlichten Pakets ohne Quellwiederholung. Die Checkpoints enthalten keinen Namen, Pfad, Rohwert oder Dokumentinhalt und werden nicht über MCP ausgegeben. |
| BL-040.1 | `gateway/common.js`, `gateway/mapping.js`, `gateway/batch-evidence.js`, `manifest.json`, `plugins/data-secure/.mcp.json`, `test-batch-session.js` und Manifesttests belegen den sicheren Default sowie den optionalen lokalen Privacy-Stamm; Cloud-Sync, Netzwerk und Links stoppen vor Ordneranlage, während Toolantworten, Audit und Diagnose den Pfad nicht enthalten. Atomare Ledger und kollisionssichere Ergebnis-Pakete bleiben daran gebunden. |
| BL-040.2 | `gateway/mapping.js`, `gateway/batch.js`, `test-batch-session.js` und `test-mapping.js` belegen atomare lokale Mapping-CSV, Formelschutz einschließlich führendem Unicode-Leerraum, Linkstopp vor Lesen oder Ersetzen, eine `0600`-geschützte fail-closed Commit-Sperre und das Ausbleiben von Dateinamen in MCP-Ergebnissen. |
| BL-040.4 | `gateway/package-store.js` und `test-package-read-capabilities.js` binden jede MCP-lesbare Markdown-Datei und Bildanlage an neutrale Paket-/Asset-Schemata sowie vollständige SHA-256-Prüfsummen, lesen sie über einen inode-gebundenen Dateideskriptor und verwerfen unkanonische öffentliche Paketmetadaten; manipulierte Manifeste können weder Originalnamen noch ungeprüfte Dokumente oder Anlagen freigeben |
| BL-040.3 | `contracts/BATCH_EVIDENCE_V1.md`, `gateway/batch-evidence.js`, `gateway/batch.js` und `test-batch-session.js` belegen den atomaren JSON-Nachweis mit geschlossenem Feldsatz, aggregierten Zählern sowie eine explizite Leckageprobe gegen Namen, Pfade, Inhalte, Hashes und Batch-/Paket-IDs |
| BL-042.1 | `gateway/diagnostics.js`, `index.js` und `test-diagnostics.js` belegen den bestätigungspflichtigen lokalen Diagnoseexport, Programmprüfsummen, die Abwesenheit von Namen, Pfaden, Rohinhalten und Dokumentidentifikatoren sowie den Stopp vor einem umgeleiteten Exportordner |
| BL-042.3 | `gateway/workflow-diagnostics.js`, `gateway/batch-executor.js`, `index.js`, `test-workflow-diagnostics.js` und `test-direct-picker-intake-worker.js` belegen eine getrennte 14-Tage-Ablaufspur mit ausschließlich festen Picker-/Worker-/IPC-/Checkpoint-/Terminal-/Abschlussereignissen, begrenzten Zählern und festen Codes; Freitext, Pfade, Namen, Inhalte, Tokens, PIDs und Dokument-Hashes sind ausgeschlossen |
| BL-042.2 (E0-Nachweis) | `server/index.js`, `test-mcp-tool-annotations.js` und `test-mcp-protocol.js` belegen für alle 28 Tools Titel und vollständige boolesche read-only/destruktiv/idempotent/open-world Annotationen einschließlich eigener Klassen für Verarbeitung, Review, Bestätigung, Verwerfen und Purge. Echte Cowork-Manual-/Auto-/Skip-Abnahme bleibt offen. |
| BL-041.6 (Teilnachweis) | `server/index.js`, `normal-path-response.js`, `test-normal-path-response.js`, der Dokument-Skill und `prompt-contract.js` trennen `local_only` von `continue_in_chat`: reine lokale Aufträge enden nach genau einem Startaufruf ohne Polling, Lesen oder Bestätigung. Erfolg, Auswahlabbruch und lokaler Startfehler verwenden jeweils feste inhaltsfreie Zustände und niemals Batch-Token, Pfad, Name oder Quelle; nur ausdrücklich gewünschte Folgeauswertung kann freigegebenes Markdown lesen. Echte Cowork-Toolfolge bleibt E1. |
| BL-030.1 | `contracts/BATCH_PSEUDONYM_V1.md` und `test-architecture-contracts.js` definieren restart-stabile stapelweite Pseudonyme ohne Rohwerttabelle |
| BL-030.2 (Pilot, kein Release) | `server/batch-secret-store.js` und `test-batch-secret-store.js` belegen einen dynamischen nativen Keyring-Adapter mit festem Servicenamen, opakem Batch-Account, 256-Bit-Secret und fail-closed Unverfügbarkeit ohne Datei-/Umgebungsvariablen-Fallback; Drei-OS-Bundle-Evidenz bleibt offen |
| BL-030.2 (Auto-Profil) | `gateway/orchestrator.js` und `test-batch-session.js` belegen in einem real veröffentlichten Vier-Datei-`auto`-Stapel die unabhängige Wahl von Vertrag, Mitarbeiterprofil, Bewerbung und Kundenvorgang sowie Identifikatorentfernung bei erhaltenem Fachinhalt |
| BL-030.2 (Integrationsvertrag) | `contracts/BATCH_SECRET_STORE_V1.md` und `test-architecture-contracts.js` pinnen Kandidat/API/Zielartefakte und die erforderlichen Offline- sowie Negativnachweise vor einer produktiven Aktivierung |
| BL-030.2 (Ableitungspilot, kein Release) | `server/batch-pseudonym-registry.js`, `gateway/compliance.js`, `gateway/orchestrator.js` und `test-batch-pseudonym-registry.js` belegen Unicode-stabile HMAC-/Base32-Pseudonyme, Typ-/Batchtrennung, Kollisionsverlängerung, die interne Übergabe durch den normalen Rest-PII-Gate und das Löschen des rein flüchtigen Registry-Kontexts; der MCP- und aktive Batchpfad erzeugt ihn nicht |
| BL-030.2 (Lifecycle-Pilot, kein Release) | `server/batch-pseudonym-context.js` und `test-batch-pseudonym-context.js` belegen Provisionierung mit Rollbackversuch, erneutes Laden über prozessähnlich getrennte Registry-Instanzen, sichere Kurzzeitspeicherbereinigung, terminales Löschen und `PSEUDONYM_SECRET_UNAVAILABLE` bei Verlust ohne Ersatzschlüssel; die produktive Begin/Resume/TTL/Discard-Einbindung wartet weiter auf die Drei-OS-Store-Matrix |
| BL-030.2 (Store-Matrix vorbereitet) | `native/keyring/pilot`, `test-keyring-pilot.js` und `keyring-pilot.yml` pinnen alle Zielartefakte und definieren einen inhaltsfreien nativen Set/Get/Delete-Nachweis; nur der lokale Windows-Smoke-Test liegt vor, die Drei-OS-Evidenz bleibt offen |
| BL-001.1 | `OPEN_SOURCE_COMPONENTS.md`, DS-038 und `verify-canonical-docs.mjs` erzwingen Open-Source-Prüfung für jedes Epic |
| BL-024.1 | `contracts/OCR_RESULT_V1.md`, Schema, Normalisierer und Lauf `32596426359` belegen Wortpositionen, Konfidenz, Sprachen, Fehler und Ressourcengrenzen auf vier Zielarchitekturen |
| BL-024.4 (E0-Sicherheitsnachweis) | `contracts/OCR_BATCH_SESSION_V1.md`, `ocr-session-harness.js`, `test-ocr-session-harness.js` und `test-architecture-contracts.js` verbieten einen globalen oder JavaScript-gepoolten OCR-Prozess und definieren die einzige zulässige spätere Optimierung: eine pro Stapel gebundene Single-Flight-Session mit geframter IPC, nativen Per-Frame-Grenzen, vollständigem Prozessbaum-Abbruch und unverändertem Cowork-Nutzerweg. Der nicht importierte Engineering-Harness belegt geschlossenes Header-/Antwortschema, Requestbindung, Replay-Schutz, Single-Flight, Pixel-/Byte-/Zeitbudgets, Abbruch und Fail-Closed-Verhalten; eine Produktaktivierung und Drei-Plattform-Evidenz bleiben bewusst offen. |
| BL-021.1 (Teilnachweis) | `document-parser.js`, `runtime.js`, `gateway/common.js`, `gateway/orchestrator.js`, Companion-IPC sowie Gateway-/Companion-End-to-End-Tests belegen `.md` und `.markdown` über denselben isolierten UTF-8-, Content-Graph-, PII- und Residual-Gate-Pfad wie TXT. Externe Markdown-Referenzen werden nicht geladen, sondern als Text geprüft; praktische Drei-OS-Abnahme bleibt offen. |
| BL-021.2 (Teilnachweis) | `contracts/CSV_SOURCE_V1.md`, `document-parser.js`, `runtime.js`, `gateway/common.js`, `gateway/orchestrator.js`, Companion-IPC sowie Gateway-/Companion-End-to-End-Tests belegen `.csv` über denselben isolierten UTF-8-, Content-Graph-, PII- und Residual-Gate-Pfad wie TXT. Der Parser veröffentlicht nur eine Markdown-Tabelle und führt Zellen nie aus; selbst Kontakt-URI-Formeln bleiben inert, während ihre sichtbaren Namen, Telefonnummern und auch URL-kodierte Mailadressen den normalen Gate durchlaufen. Praktische Drei-OS-Abnahme bleibt offen. |
| BL-022.1 (Teilnachweis) | `ooxml.js`, `contracts/DOCX_STORY_COVERAGE_V1.md` und `test-parsers.js` belegen die verpflichtende eindeutige interne Root-`officeDocument`-Beziehung mit vollständigem renderbarem `w:document`-/`w:body`-Pfad, die bildtypsichere interne `image`-Reachability und für alle zulässigen sekundären DOCX-Stories die sperrende, inhaltsfreie Behandlung verwaister, fehlender, abgeschnittener, traversierender, externer, doppelter und typfalscher Beziehungen oder Story-Wurzeln. `test-docx-differential.js` ergänzt 96 reguläre Hauptteil-/Tabellen-DOCX mit mehreren Absätzen und Zeilen gegen Mammoth 1.12.1 als exakt gelocktes, reines Dev-Orakel. Die praktische Interoperabilitätsabnahme mit realen Word-Generatoren und bewusst gesperrten Story-Typen bleibt offen. |
| BL-022.2 (Vorarbeit) | `ooxml.js`, `test-parsers.js` und `test-content-graph.js` belegen die eindeutige interne OPC-Wurzel auf `xl/workbook.xml`, dass XLSX-Blatttext nur über eine eindeutige interne `worksheet`-Relationship, Drawing-Text nur über ein erreichtes `drawing`, Chartdaten nur über dessen `chart` und `xl/media/` nur über interne `image`-Relationships gerendert wird; verwaiste, externe und typfalsche Ziele sowie Formelzellen mit oder ohne Cachewert bleiben inhaltsfrei gesperrt. XLSX ist weiterhin nicht freigegeben. |
| BL-022.3 (Vorarbeit) | `ooxml.js`, `test-parsers.js` und `test-content-graph.js` belegen die eindeutige interne OPC-Wurzel auf `ppt/presentation.xml`, dass PPTX-Folien nur über interne `slide`-Relationships aus `presentation.xml`, Notizen nur über interne `notesSlide`-Relationships der Folie, DrawingML-Tabellen als eigene escaped Markdown-Tabellen ohne doppelte Folienprosa, Chartdaten nur über deren `chart`, Layout-/Mastertexte nur über die vollständige Kette `slide` → `slideLayout` → `slideMaster` (einschließlich genau einer Masterreferenz aus `presentation.xml`) und `ppt/media/` nur über interne `image`-Relationships verarbeitet werden. Eine abgeschnittene Tabelle wird nicht als Folientext ausgegeben. Mehrfachnutzung regulärer Layouts/Master bleibt zulässig; verwaiste, doppelte und abgeschnittene Vorlagen bleiben inhaltsfrei gesperrt. PPTX ist weiterhin nicht freigegeben. |
| BL-050.2 | Zwei deterministische, vollständig synthetische 1.000er-Korpora in `benchmarks/contract-corpus.js` erfüllen die Mindestmenge mit versionierter Ground Truth in `benchmarks/CORPUS_CONTRACT_V1.json`. `test-corpus-contract.js` und `test-detector-benchmark.js` erzwingen Null direkte Misses, Null Zusatzredaktionen und mindestens 99 % Erhalt; `test-format-acceptance-matrix.js` ergänzt 100 reale Gateway-Läufe über TXT, Markdown, CSV und DOCX, und `exploratory-anonymization-2000.js` prüft 2.000 variierte Markdown-Eingaben einschließlich Idempotenz. Das ist ein lokaler Qualitätsnachweis, keine Freigabe gesperrter Formate oder allgemeiner Sprachabdeckung. |
| BL-050.1 | `benchmarks/CORPUS_CONTRACT_V1.json` und `test-corpus-contract.js` belegen ein versioniertes Ground-Truth-Schema, UTF-16-Positionen, exakte Format-/Sprach-/Typ-/Profilverteilungen und maschinenlesbare Gates von null direkten Misses, null Zusatzredaktionen und mindestens 99 Prozent Inhaltserhalt über 2.000 synthetische Samples |
| BL-050.3 (E0-Nachweis) | `gateway/performance.js`, die Batch-Phasenmarken in `gateway/batch.js`, `test-batch-performance-contract.js` sowie `benchmark-batch-phases.mjs` belegen eine feste, inhaltsfreie und begrenzte Dauerstruktur sowie echte TXT-/CSV-/DOCX-Kalt-/Warmläufe für 1/10/100 Dateien mit p50/p95, Gesamtzeit, CPU, Peak-RAM und nicht zugeordneter Laufzeit. Monotone Zeitbehandlung und relative, bewusst großzügige Regressionstore vermeiden sowohl Rückwärtsuhren als auch hardwareabhängige Scheinsicherheit. `docs/acceptance/RC30_HUMAN_TEST_KIT` ergänzt den E1-Plan; Plattform-Referenzwerte bleiben offen. |
| BL-050.3 (RC39-Gegenreview) | `0ccf994`, `gateway/batch.js`, `test-batch-performance-contract.js` und der vollständige 66-Fall-Batchlauf belegen, dass nur Zwischenmarker bei unverändertem `processing`-Status non-durable geschrieben werden und Prozessabbruch statusbasiert ohne Doppelveröffentlichung erholt wird. Der neue Fsync-Zähltest ist auf Windows grün, erwartet auf POSIX wegen des zusätzlichen Verzeichnis-Fsync jedoch fälschlich dieselbe Anzahl; echte Persistenz-/Power-Loss-Injection und Drei-OS-Referenzwerte bleiben offen. Die Evidenzstufe ändert sich dadurch nicht. |
| BL-050.3 (RC43-E0-Nachtrag) | `test-batch-performance-contract.js` leitet die erwartete Anzahl durable Flushes plattformneutral aus Datei-fsync plus portablem POSIX-Verzeichnis-fsync ab. Eine gezielte Fehlerinjektion am atomaren Rename eines non-durable Zwischenmarkers belegt, dass das vorherige durable Journal unverändert lesbar bleibt und `markInterruptedItemsRetryable()` ausschließlich anhand des Status sicher auf `PROCESSING_INTERRUPTED` überführt. Reale Power-Loss- und Drei-OS-Dateisystemevidenz bleiben E1. |
| BL-031.1 / DS-012 (RC38-RC41-Gegenreview) | `068c0cc` und `b7b7e02` redigieren die konkret getesteten Kunden-/Arbeitgeberformen im Zertifikatskontext; `4e9caf9` erhält den konkret getesteten domänenförmigen Aussteller. Das unabhängige Gegenreview reproduziert jedoch P0-Unter-Redaktion für eine beliebige Kunden-Domain hinter einem vorherigen Credential-Cue sowie für `Tätigkeit für` und `im Auftrag von`; mehrzeilige und signalworthaltige Aussteller zeigen zusätzlich Über-Redaktion. `tasks/archiv/2026-08-25-folgeauftrag-p0-credential-context-rc41.md` bindet den nächsten E0-Abschluss. Gruppierungs-/Fachabnahme bleibt E1/E3. |
| BL-031.1 / DS-012 (RC42-P0-Schließung) | Commit `32914da` bindet `isCredentialIssuerDomain()` an eine explizite Ausstellerphrase unmittelbar vor der Domain (auch über einen Zeilenumbruch hinweg für Zweizeilenblöcke) oder einen Zertifikatstitel unmittelbar danach, statt an einen beliebig weit entfernten Credential-Cue auf derselben Zeile. `NON_ISSUER_LABEL_RE` erfasst zusätzlich `Tätigkeit für` und `im Auftrag von`/`on behalf of`/`commissioned by`. `inCredentialContext()` lässt eine signalworthaltige Ausstellerorganisation (`Customer Institute GmbH`) nur bei unmittelbar folgendem Zertifikatstitel gelten; ein Komma oder Satzabbruch erzwingt weiterhin die normale Kundenredaktion. Zehn neue Fälle in `tests/test-credential-catalog.js` (24/24 grün) reproduzieren jede der fünf RC41-Lücken gegen den Vor-Fix-Stand und bestehen danach; `npm run test:ci`, `test-pii-regression.js` (79/79) und `test-detector-benchmark.js` (3/3) blieben vollständig grün. Gruppierungs-/Fachabnahme bleibt unverändert E1/E3. |
| BL-031.1 / DS-012 (RC43-Gegenreview-Nachtrag) | Das Gegenreview nach RC42 reproduzierte zusätzlich „Kunde TechCorp GmbH Certified …“ ohne Komma als Unter-Redaktion. `inCredentialContext()` behandelt deutsche Rollenpräfixe sowie gewöhnliche englische `Customer`-/`Client`-Namen nun auch vor einem unmittelbar folgenden Zertifikatstitel als Datenschutzsignal; nur eng institutionell geformte englische Eigennamen wie `Customer Institute GmbH` behalten den getesteten Ausstellerpfad. Komma-, Doppelpunkt-, deutsche und englische Varianten sind in `test-credential-catalog.js` gebunden; PII-, Detector-, 66-Fall-Batch- und vollständige CI-Regression bleiben grün. E1/E3-Fachabnahme bleibt unverändert offen. |
| BL-011.10 (Teilnachweis) | `gateway/batch-executor.js`, `gateway/batch-worker.js`, `gateway/status.js`, `companion/completion-summary.js`, der Direct-Picker in `server/index.js`, `test-direct-picker-batch.js` und `test-direct-picker-intake-worker.js` belegen, dass die ausgewählte Queue ausschließlich per privater IPC an einen isolierten Worker geht, dieser vor Verarbeitung seine Ausführungsberechtigung beansprucht und die Elternseite IPC nicht vor seinem Abschluss trennt. Ein öffentlicher, inhaltsfreier Intake-Marker verhindert währenddessen eine zweite Dateiauswahl. Vor/nach Checkpoint sind nur zwei feste lokale Fehlerhinweise möglich; sie enthalten keine Quellmetadaten und verändern keinen Batchzustand. Der MCP-Aufruf gibt im `local_only`-Weg keinen Batch-Token zurück; ein echter Child-Process-Test endet mit einem freigegebenen, inhaltsfreien Status. Reale Antwortzeit-, Crash- und Drei-OS-Evidenz bleiben offen. |
| BL-041.7 (E0-Nachweis) | `server/index.js`, `gateway/local-only-handoff.js`, `gateway/package-store.js` und `companion/completed-batch-picker.js` trennen 8 normale Cowork-Werkzeuge von 28 Supportwerkzeugen über `EU_PRIVACY_SUPPORT_MODE=1`. Der tokenbasierte synchrone Review ist jetzt Support; die normale Fortsetzung startet eine erforderliche Fachprüfung tokenfrei im lokalen Worker. `test-cowork-tool-surface-contract.js`, `test-cowork-documentation-contract.js` und der Manifesttest blockieren Drift. Der Handoff hält Auswahl, Kennungen, Cursor und kurzlebige Leseberechtigungen nur lokal, gibt höchstens fünf Ergebnisse je Schritt aus und dekodiert kleine verifizierte Dokumente einmalig; größere Ergebnisse nutzen ein begrenztes Indexfenster. Buffer/Index werden bei Bestätigung, Abbruch, Ablauf und Fehler best-effort überschrieben. Unicode-/Surrogatpaare bleiben vollständig; Seiten- und Bestätigungsfehler verwerfen fail-closed. Beobachtete Cowork-UI-Abnahme bleibt offen. |
| BL-012.2/BL-041.6 (RC37-E0) | `gateway/review-worker.js`, `companion/review-timeouts.js`, `gateway/batch-executor.js`, `gateway/batch.js`, `server/index.js`, `test-local-review-executor.js` und die Cowork-Vertragstests belegen, dass eine einmal bestätigte Fortsetzung die lokale Fachprüfung in einem abgekoppelten, netzgesperrten Worker startet, sofort eine inhaltsfreie MCP-Antwort ohne Batch-Token liefert und Rekonstruktion, UI, Veröffentlichung sowie Abschlussstatus getrennt protokolliert. Der synchrone Supportpfad bleibt auf fünf Minuten begrenzt, während der abgekoppelte UI-Worker 30 Minuten erhält. Ein echter Cowork-/Windows-UI-Lauf bleibt E1. |
| BL-012.2/BL-041.9 (RC44-E0-Nachtrag) | `companion/review-timeouts.js`, `companion/text-review.js`, `gateway/review-worker.js` und `test-local-review-executor.js` ersetzen den historischen 30-Minuten-Ablauf ausschließlich im abgekoppelten Review-Worker durch eine ausdrückliche menschliche Entscheidung ohne Prozesszeitlimit; der synchrone Supportpfad bleibt auf fünf Minuten begrenzt. `companion/completion-summary.js` und `test-completion-summary.js` belegen zusätzlich, dass die inhaltsfreie Terminalanzeige abgekoppelt startet und den Worker nicht auf ein geschlossenes Dialogfenster warten lässt. `server/index.js`, Prompt-/Skillvertrag und Cowork-Vertragstests erlauben neue Stapel trotz pausierter Altstapel, solange kein Stapel aktiv verarbeitet wird. Echte Cowork-/Drei-OS-UI-Evidenz bleibt E1. |
| BL-011.1/BL-011.8 (RC37-E0-Nachtrag) | `gateway/batch.js`, `gateway/retention.js`, `gateway/orchestrator.js`, `gateway/status.js`, `test-batch-retention-protection.js` und `test-retention.js` belegen vollständige Short-Write-Behandlung, Datei-fsync vor atomarem Rename, POSIX-Verzeichnis-fsync und fail-closed Output-Retention: offene `delivery_pending`-/`mapping_pending`-Pakete bleiben geschützt; ein einziges unlesbares oder ungültiges Journal setzt die gesamte automatische Output-Löschung aus und meldet nur einen festen Statusindikator. Bestätigte manuelle Löschung bleibt getrennt. Reale Crash-/Dateisystem-Gegenproben auf drei OS bleiben E1. |
| BL-011.11 (E0-Nachweis) | `gateway/orchestrator.js` erzeugt vor einem lokalen Batch einen prozesslokalen, nicht fälschbaren Vorbereitungskontext; `gateway/batch.js` reicht ihn erst nach erfolgreichem Claim weiter. Manifestdigest und Workerstream vermeiden zusätzliche Vollreads, während unabhängige Paketprüfung und Snapshot-/Swap-Gates erhalten bleiben. `gateway/performance.js` hält feste, gedeckelte, ausschließlich private I/O-/Phasenwerte. `gateway/package-store.js` dekodiert verifizierte kleine Ergebnisse einmalig, nutzt für größere Seiten einen begrenzten Index/Bytefenster-Pfad und überschreibt Buffer/Index beim Ende. `test-mixed-batch-recovery.js`, `test-batch-performance-contract.js`, `test-direct-picker-intake-worker.js`, `test-local-only-handoff.js` und `test-gateway-e2e.js` prüfen Exactly-once, Grenzen und reale Einzelworker-/Paketläufe. Weitere Optimierung wartet auf reale Dateisystemmessungen. |
| BL-011.6 (E0-Nachweis) | `resource-limits.js`, Picker, Runtime und Batchvorprüfung erzwingen zentral 100 Dateien/500 MiB sowie sichere Einzelgrenzen für TXT/Markdown (8.000.000 Bytes), CSV (1.500.000 Bytes), DOCX (64 MiB) und entpacktes OOXML (128 MiB), bevor der Hintergrundlauf materialisiert. `test-resource-limits.js`, Picker- und Capability-Tests blockieren Drift. `contracts/OUTPUT_CAPACITY_V1.md` und die Storage-/Audit-/Mappingtests legen zusätzlich volumenbezogene Vor-dem-Schreiben-Gates fest. Eine feste Seitenbegrenzung gibt es nicht; Drei-OS-Grenzevidenz bleibt offen. |
| BL-011.8 (Teilnachweis) | `gateway/common.js` stellt `safeRemovePrivateTree` für literal gebundene direkte private Kindelemente bereit; `companion/file-picker.js` und `gateway/batch.js` sperren außerdem Quellen hinter einem Eltern-Link/Reparse-Punkt vor der Vorprüfung und unmittelbar vor der Snapshot-Kopie. `gateway/batch.js` und `gateway/orchestrator.js` verwenden die sichere Bereinigung für Arbeits-, Stage-, Review-, Job- und Rollback-Bereinigung statt eines rekursiven `rm`. `test-safe-private-tree.js` und `test-direct-picker-batch.js` prüfen reguläre Bäume, Traversal, direkte und verschachtelte Links/Junctions, eine echte verlinkte Quellen-Elternkomponente, Quellenpfad-Sperren sowie einen Austausch während der Auflistung ohne Berührung eines externen Sentinels. Node bleibt ohne portable Directory-Handle-/Reparse-Tag-API; echte Windows/macOS/Linux-Gegenproben und native Adapter bleiben offen. |
| BL-011.12 (E0-Nachweis) | `contracts/BATCH_PARALLELISM_V1.md`, `parallel-preparation-harness.js`, `test-parallel-preparation-harness.js` und `test-architecture-contracts.js` pinnen Standardworkerzahl eins und prüfen eine nicht importierte Zwei-Worker-Vorbereitung mit geschlossenem IPC, zentraler Reihenfolge/Veröffentlichung, Crash-Retry, blockierendem ungewissen Commit, Slot- und Ressourcengrenzen. Lease-, Reservierungs- und Mapping-Commit-Stores bleiben fail-closed. Der Produktcode bleibt seriell, bis native Volume-/OCR-Gates und Drei-OS-Abnahme vorliegen. |

Offener Nachweis: `contracts/PDF_OCR_RISK_GATE_V1.md` ist das Prüfprotokoll für
BL-023.1. Es ist ausdrücklich kein Erledigungsnachweis, solange Pflichtzellen offen
sind. `pdf-ocr-risk.lock.json`, `pdf-ocr-risk.mjs` und der manuelle
`pdf-ocr-risk.yml`-Workflow liefern reproduzierbare Pins und Drei-Plattform-
Preflights, aber bewusst noch keine Produktfreigabe. GitHub-Actions-Lauf
`32593313169` auf Commit `fdd2a02` belegt die erfolgreiche Ausführung auf Windows
x64, macOS x64, macOS ARM64 und Linux x64 sowie das erwartete NO-GO der
Windows-Community-Probe. Die Artefakte weisen ausdrücklich `passed_gates: []`, alle
elf offenen Gates, `PDF_COVERAGE_UNVERIFIED` und `release_decision: no_go` aus.

Der alternative Open-Source-Pilot ist ebenfalls noch kein Erledigungsnachweis:
GitHub-Actions-Lauf `32594467568` auf Commit `b622278` belegt PDF.js 6.2.108 und
Canvas 1.0.7 auf Windows x64, macOS x64, macOS ARM64 und Linux x64. Lokale
Byte-Eingabe, Text, Rendering und Action-Erkennung bestanden ohne beobachteten
Netzwerkversuch; alle Artefakte melden weiterhin `passed_gates: []`,
`PDF_COVERAGE_UNVERIFIED` und `release_decision: no_go`.

Auch der OCR-Pilot ist noch kein Erledigungsnachweis: GitHub-Actions-Lauf
`32594838193` auf Commit `b6ce3ad` belegt Tesseract.js/tesseract.js-core 7.0.0,
Canvas 1.0.7 sowie hashgeprüfte lokale Deutsch-/Englischmodelle auf Windows x64,
macOS x64, macOS ARM64 und Linux x64. Die gemischtsprachige synthetische Probe
bestand unter Prozess-Netzwerksperre mit 95 Prozent mittlerer Konfidenz; alle
Artefakte melden weiterhin `passed_gates: []`, `OCR_COVERAGE_UNVERIFIED` und
`release_decision: no_go`.

GitHub-Actions-Lauf `32595199861` auf Commit `fcb55ed` ergänzt für den OCR-Piloten
auf allen vier Plattformen offizielle CycloneDX-1.5-SBOMs. Die Evidenz bestätigt je
Plattform 25 gelockte Paketkomponenten, vollständige Paketintegritäten, ausschließlich
Apache-2.0/MIT/BSD-2-Clause sowie Commit-/Größen-/Hashprüfung der Modelle und ihrer
Apache-2.0-Lizenz. Die Lizenz-/SBOM-Pflichtzelle bleibt wegen fehlender vollständiger
Notices, Schwachstellenrichtlinie und echtem Auslieferungspaket weiterhin offen.

GitHub-Actions-Lauf `32595454727` auf Commit `fa34c91` belegt die isolierte
OCR-Technikprobe auf Windows x64, macOS x64/ARM64 und Linux x64. Prozessgrenze,
Netzwerkverbot, Node-Heap, Wächter und Ausgabegrenze bestanden einschließlich
Timeout-/Flood-Gegenproben; Windows besitzt darüber hinaus Job-Object-RAM-/CPU-
Grenzen. Native harte macOS/Linux-Ressourcengrenzen, Runtime-Integration,
Angriffskorpus und frisches Pluginpaket bleiben offen, deshalb ist dies kein
Erledigungs- oder Freigabenachweis.

Der normalisierte OCR-Vertrag ist in `contracts/OCR_RESULT_V1.md`,
`contracts/ocr-result-v1.schema.json` und `native/ocr/pilot/ocr-contract.mjs`
nachvollziehbar. `test-ocr-result-contract.mjs` prüft acht Positiv- und Negativfälle;
`test-architecture-contracts.js` verhindert das Entfernen von Blockanforderung,
Schema, Konfidenz-/Reviewregeln und Workflowtest. Der echte lokale Windows-Pilot
lieferte 14 positionierte Wörter, 95 Prozent mittlere Konfidenz und weiterhin
`OCR_COVERAGE_UNVERIFIED`/`no_go`. GitHub-Actions-Lauf `32596087930` auf Commit
`f53f5df` bestätigt Vertrag, echte OCR und Negativtests auf Windows x64, macOS
x64/ARM64 und Linux x64. Native harte macOS/Linux-RAM-/CPU-Grenzen fehlen noch,
deshalb ist BL-024.1 nicht erledigt.

Die noch unbelegte POSIX-Grenze ist als Quelltext
`native/ocr/pilot/posix-sandbox.c` und als Adapteränderung in `isolated-run.mjs`
prüfbar. Der Workflow kompiliert mit `cc -std=c11 -O2 -Wall -Wextra -Werror` und
fordert auf macOS x64/ARM64 sowie Linux x64 positive OCR-, Speicher-, CPU-, Zeit- und
Ausgabeproben. Bis ein erfolgreicher Lauf vorliegt, ist das nur Implementierung und
kein Plattformnachweis.

Der erste Buildlauf `32596337378` ist ein bewahrter Negativnachweis: Windows und
Linux bestanden, macOS x64/ARM64 scheiterten sicher vor OCR, weil `_POSIX_C_SOURCE`
die für `libproc.h` erforderlichen Darwin-Typen ausblendete. Die Korrektur verwendet
auf Apple `_DARWIN_C_SOURCE`; danach wurde vollständig neu geprüft.

Die Korrektur ist durch Lauf `32596426359` auf Commit `4c9f0ec` belegt. Windows x64,
macOS x64/ARM64 und Linux x64 bestanden Build, echten gemischtsprachigen OCR-Lauf,
V1-Vertrag, Offline-Grenze sowie RAM-, CPU-, Zeit- und Ausgabeflut-Gegenproben.
Damit ist BL-024.1 erledigt. Die Artefakte melden weiterhin
`OCR_COVERAGE_UNVERIFIED` und `no_go`, weil Bündelung und Produktintegration zu
BL-024.2 gehören.

Die BL-024.2-Vorarbeit ist über `scripts/build-ocr-runtime.mjs`,
`native/ocr/pilot/runtime-worker.mjs`, `test-ocr-runtime-bundle.mjs` und
`test-ocr-runtime-smoke.mjs` nachvollziehbar. Das lokale Windows-x64-Artefakt besitzt
241 inventarisierte Dateien, 13 Runtime-Komponenten, rund 57,5 MB, beide Modelle und
einen geprüften nativen Launcher; echter Offline-OCR- und leerer inhaltsfreier
Fehlerlauf bestehen. GitHub-Actions-Lauf `32597030060` auf `7427b3c` belegt Bundle-Build,
Hash-/Lizenzinventarprüfung und echten Offline-OCR-Smoke-Test zusätzlich auf macOS
x64/ARM64 und Linux x64. Der vollständige MIT-Fallback für exakt `tr46@0.0.3` ist
lokal ergänzt; unbekannte fehlende Lizenztexte brechen den Build ab. Das Manifest
bleibt `release_enabled: false`; frische Installationen sind offen.

Der gesperrte Produktadapter ist über `plugins/data-secure/server/portable-ocr.js`
und `tests/test-portable-ocr-adapter.js` nachvollziehbar. Er akzeptiert nur ein
vollständig inventarisiertes und gehashtes Zielbundle mit expliziter Freigabe,
verwirft zusätzliche Dateien und Links und bestätigt die Worker-Beendigung vor einer
Timeout-/Ausgabegrenzen-Antwort. Der aktuelle Pluginbaum enthält das Bundle nur mit
deaktiviertem Freigabegate; die veröffentlichte Capability-Matrix bleibt deshalb
unverändert.

Der Download von Lauf `32597030060` deckte fehlende versteckte npm-Dateien in den
hochgeladenen Artefakten auf. `assemble-ocr-runtime.mjs` stoppte beim ersten fehlenden
Manifesteintrag. Der Workflow verlangt nun `include-hidden-files: true`; Lauf
`32597783210` auf `df1c85f` belegt die erneut heruntergeladenen Artefakte und den
Universal-Assembler.

`scripts/assemble-ocr-runtime.mjs`, `test-ocr-universal-assembler.mjs` und
`test-ocr-universal-bundle.mjs` definieren den universellen V2-Nachweis. Der
synthetische Test belegt exakte Zielmenge, einfache Modellkopie, vier Launcher,
Adapterkompatibilität und den Stopp bei plattformspezifisch abweichendem gemeinsamen
Kern. Der nachgelagerte Download-/Assembly-/Offline-OCR-Job in Lauf `32597783210`
ist grün. Ein erneuter lokaler Artefaktdownload bestand die Hashprüfung mit 244
Dateien und 57.592.942 Bytes; das Freigabeflag bleibt aus.

`build-portable-plugin.mjs`, `verify-portable-plugin-zip.mjs` und
`test-zip-permissions.mjs` bilden die nächste Paketgrenze. Lokal wurden 319 ZIP-
Einträge und 22.033.239 Bytes vollständig gegen Pluginquelle und V2-Manifest geprüft.
Die drei POSIX-Launcher tragen `0755`, alle anderen Einträge deterministisch `0644`.
Der kanonische Pluginbaum enthält nun dasselbe gesperrte V2-Bundle. Die Datei
`ocr-runtime.provenance.json` bindet es an Lauf `32597783210`, Commit
`df1c85fee38ce5f94488ee267c38f410614081a2` und Manifest-SHA
`4497c0db499493429d12b9af7aaa2bb2b437878c8877eb3cf325947d2d341098`.
`build-plugin.mjs`, `verify-plugin-zip.mjs`, der Capability-Vertrag und der neue
obligatorische Universal-Bundle-Test prüfen diese Bindung sowie alle 244 Dateien.
Der lokale Paketierungs-Checkpoint `75da6c5` ergab 320 Einträge, 22.033.607 Bytes und SHA-256
`6d3883745cfb01f444fecfcfffe77e7515eac0cf84c81e009420a4c07f2b5cf3`.
Der Cloud-Nachweis für Doppelbuild und echte Extraktion ist noch offen: Lauf
`32598196806` wurde vor dem ersten Schritt durch das GitHub-Abrechnungs-/Ausgabenlimit
verhindert und ist daher kein Code- oder Testfehler.

BL-020.1 beginnt mit `docs/canonical/contracts/CONTENT_GRAPH_V1.md`, dem strikten
JSON-Schema, `server/content-graph.js` und `test-content-graph.js`. Die produktive
Parsergrenze erzeugt und validiert den Graph zwingend; Legacy-Ergebnisse ohne Graph,
ungebundene Assets oder Abschnitte ohne Quellort, doppelte IDs, zusätzliche
Rohtextfelder, Traversal-Fragmente, Windows-Pfade oder URI-Schemata und Positionen
außerhalb des normalisierten Markdown
werden abgelehnt. Neun Tests
belegen Text-, Tabellen- und Bildknoten, die fail-closed Isolationsgrenze und
containerinterne Abschnitts-Locators für DOCX-Hauptteil/Kopfzeile/Kommentare,
XLSX-Arbeitsblatt/Diagramm/Zeichnung sowie PPTX-Folie/Notizen/Diagramm. Sie belegen
außerdem, dass die internen Abschnittstexte nicht zusätzlich über die Parsergrenze
ausgegeben werden. Der Parser-Test `OOXML personal and custom metadata is extracted
for the privacy gate` belegt zusätzlich die Ausgabe von Autor, letztem Bearbeiter,
Manager, Unternehmen und benutzerdefinierten Eigenschaften ohne falsche DOCX-
Coverage-Warnung. `OOXML complex custom metadata fails closed instead of being
flattened silently` belegt, dass komplexe Eigenschaftstypen weder als vollständig
ausgegeben noch freigegeben werden. `DOCX secondary stories retain structured text
before the privacy gate` belegt Kopf-/Fußzeile, Kommentar, Fuß- und Endnoten mit
Tabs/Umbrüchen sowie die nachfolgende Anonymisierung; der Vertrag
`DOCX_STORY_COVERAGE_V1.md` hält die noch gesperrten Story-Typen fest. Grundlage für
die Paketorte und Kernfelder ist die offizielle
Microsoft-Dokumentation zum [Core-Properties-Part](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/opc/finding-the-core-properties-part);
eine zusätzliche XML- oder Office-Runtime wurde dafür nicht eingeführt. Als
externe Semantikreferenz dienen ausschließlich die offiziellen W3C-Definitionen für
halb offene [Text Position Selectors](https://www.w3.org/TR/annotation-model/#text-position-selector)
und [Fragment Selectors](https://www.w3.org/TR/annotation-model/#fragment-selector);
es wurde keine zusätzliche Runtime übernommen. Die Formatfreigabe bleibt
unverändert.

Der zehnte Content-Graph-Vertragstest `validation rejects hidden text gaps,
overlapping nodes, reordered ids and text after images` schließt die Validatorlücke:
fortlaufende IDs, geordnete nicht überlappende Textbereiche, vollständige Abdeckung
aller Nicht-Leerraumzeichen und die Reihenfolge Text vor Assets sind jetzt zwingend.
Damit ist ein syntaktisch valider, aber inhaltlich lückenhafter Parsergraph kein
akzeptierter Coverage-Nachweis.

Der elfte Test `embedded OOXML locators retain the complete container chain` belegt,
dass auch rekursive Einbettungen bis zum inneren OOXML-Part eindeutig lokalisierbar
bleiben.

BL-020.2 startet mit `contracts/EMBEDDED_CONTENT_V1.md` und den Parserfällen
`supported embedded OOXML packages are parsed recursively with prefixed locators`,
`embedded OOXML recursion stops at the shared depth limit`, `embedded OOXML count
and byte budgets are fixed and fail closed`, `the twenty-first reachable embedded
OOXML package is not rendered`, `corrupt supported embeddings and
active XLSX content remain blocked`, `XLSX and PPTX external or unsupported embedded
content fail closed without leaking targets` sowie `supported embedded extensions do
not override active OOXML relationships` und `orphaned or ambiguous OOXML embeddings
are never parsed by filename alone`. Sie belegen die gemeinsame Grenze von 3 Ebenen,
20 Dokumenten, 50 MiB Archiv- und 100 MiB entpackten Bytes, inhaltsfreie Fehler und
die Blockade aktiver Inhalte; das Entpackbudget greift vor der Dekompression und nur
eindeutige interne Paketbeziehungen machen eine Einbettung verarbeitbar. Der reale
21-Paket-Gegenlauf zeigt zusätzlich, dass das erste überzählige Paket weder gerendert
noch in einer Warnung offenbart wird.
`embedded OOXML locators retain the complete container chain` belegt die Quellenkette
im Content-Graph. Als Referenzen dienen der offizielle
Microsoft-[EmbeddedPackagePart](https://learn.microsoft.com/en-us/previous-versions/office/office-12/bb497741(v=office.12))-Vertrag
und die dokumentierten Sicherheitsgrenzen von
[Mammoth](https://github.com/mwilliamson/mammoth.js/). Mammoth bleibt
Differentialorakel: Seine eigene Dokumentation warnt vor externem Dateizugriff und
pathologischer Ressourcenlast, weshalb es die isolierte Produktgrenze nicht ersetzt.

BL-020.3 beginnt mit `contracts/NETWORK_BOUNDARY_V1.md`, dem vor Parser und Companion
geladenen `server/network-deny.cjs` und `test-network-boundary.js`. Der Test versucht
DNS, HTTP(S), TCP/TLS, UDP, HTTP/2, Fetch, WebSocket und Listener tatsächlich und
verlangt vor Socket-Erzeugung ausschließlich `DATASECURE_NETWORK_DENIED`. Ein zweiter
Fall kombiniert denselben Guard mit dem produktiven Node-Berechtigungsmodus; der
dritte pinnt die Startargumente beider Rohdatenprozesse. Ein
Sieben Verträge in `test-ui-process-policy.js` binden jeden nativen Dialog an eine
explizite Datenklasse und ein bereinigtes Environment. Sie belegen, dass Windows-
und macOS-Textreview Rohtext ausschließlich per `stdin` erhalten und Linux-Zenity
beziehungsweise KDialog Fundstellenkontext nur per `stdin` beziehungsweise
`/dev/stdin`; alle anderen UI-Helfer bleiben inhaltsfrei, sämtliche Starts erfolgen
ohne Shell und feste Skripte enthalten keine Netzwerkprimitive.
`text_review.os_network_sandbox_verified` bleibt
absichtlich `false`; Export erfolgt im bereits geschützten Companion und erzeugt
keine zweite Rohinhaltsgrenze. Die lokale Windows-x64-Zelle ist belegt. Die bewusst
manuell gestartete `release-evidence.yml` führt dasselbe vollständige `npm test` auf
macOS und Linux aus, sodass keine getrennten Testimplementierungen nötig sind; deren
frische Läufe und das native OS-Netzwerkgate für die rohen Textprüfungen bleiben aber
ausdrücklich offen.
Grundlage sind das offizielle [Node-Berechtigungsmodell](https://nodejs.org/download/release/v22.17.0/docs/api/permissions.html)
und die dokumentierte frühe CommonJS-Vorladung über
[`--require`](https://nodejs.org/api/cli.html).

BL-021.1 beginnt mit `contracts/TEXT_SOURCE_V1.md`, dem fatalen UTF-8-Decoder in
`server/document-parser.js` und acht Fällen in `test-text-source.js`. Sie belegen
BOM-/NFC-/LF-Normalisierung, die Ablehnung ungültiger Bytes und unsichtbarer
Steuerzeichen, quelltreue CommonMark-/GFM-Struktur, inertes Raw HTML, Frontmatter,
Links und Bildsyntax, PII-Prüfung innerhalb von Markup, vollständige Graphpositionen
sowie eine große deterministische Quelle. Die Prüfung von
[markdown-it](https://github.com/markdown-it/markdown-it) ist im OSS-Register
dokumentiert; der Renderer wird nicht zum Produktpfad. Da End-to-End-, Paket-,
Skill- und Drei-OS-Gates noch fehlen, bleibt Markdown im Ist-Manifest gesperrt.

BL-021.2 beginnt mit `contracts/CSV_SOURCE_V1.md`, dem strikten lokalen
RFC-4180-Parser in `server/document-parser.js` und neun Fällen in
`test-csv-source.js`. Diese prüfen Quote-/Zeilenumbruchtreue, drei Dialekte,
Mehrdeutigkeit, Breiten- und Syntaxstopps, Header-Normalisierung, inerte
Formelwerte, PII in Kopfzeilen-/Datentabellen, UTF-8/Graph und deterministische große
Tabellen. Die horizontale Tabellenstruktur ist außerdem als expliziter Person-/Org-
Kontext in `privacy/entities.js` erfasst. [Papa Parse](https://github.com/mholt/PapaParse)
5.5.3 ist als exakte, MIT-lizenzierte Entwicklungsabhängigkeit gelockt, nicht als
Plugin-Runtime. `test-csv-differential.js` vergleicht 180 eindeutige Dialekt-/Quote-
Fälle mit dem lokalen Parser; die absichtlich fail-closed behandelte
Trennzeichenmehrdeutigkeit ist nicht als Produktakzeptanz umdefiniert. Die praktische
Drei-OS-Evidenz bleibt offen.
