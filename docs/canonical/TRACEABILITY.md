# Entscheidungs-Traceability

Stand: 31.08.2026

## RC81: Gegenreview-Defects unter unverändertem DS-065

R80-01–05 → BL-031.1/BL-050 (Erkennung/Fachsprache); R80-06/10/11 → BL-041.7
(Aussagen/Anleitung); R80-07–09 → BL-041.1/BL-041.7/BL-011.3 (Auswahl/Handoff/
Abbruch); R80-12–14/17 → BL-011.13/BL-011.3 (Plain-Lifecycle/Legacy); R80-15–16
→ BL-041.9/BL-047.1/BL-050.3 (Reviewbudget/Journal-I/O).

Der [RC81-Defectbericht](../RC81_DEFECT_ABSCHLUSS_2026-08-31.md) bindet jeden Befund
an konkrete Regressionen. `test:rc81-review` läuft als zusätzliches Post-CI-Gate;
vollständige lokale CI und Paketbauprüfung PASS. Keine automatische menschliche
Freigabe, neue Dialogpflicht oder Lockerung der Originalschutzregel. E1/E2/E3 und
Runtime-/Formatfreigaben bleiben unabhängig offen. Historische RC80-Baseline folgt.

## RC80 / DS-065: Plain-Arbeitskopien statt Schlüsselverwaltung

BL-011.13: `gateway/private-work-store.js` ist die lokale Dateiablage ohne Keyring,
Schlüsseldatei oder Passwort. Batchschema `datasecure-batch/4` verwendet
`private_artifact_plain: true` (kein `private_artifact_encrypted`-Feld).
Reviewmetadaten verwenden `schema_version: 2`, `preview_storage: local-plain`
und `preview_encrypted: false`. Status nennt `private_work_storage: local-plain`
und `private_work_encryption: false`.

Geprüfte V2-Plain-Stapel können ohne erneutes Kopieren zu V4 übernommen werden;
V3-/`.dsart`-Altbestände und zugehörige Metadaten bleiben unverändert gesperrt.
Keine Entschlüsselung, Migration verschlüsselter Daten oder Keyringabfrage.
Originale werden erneut ausgewählt, nicht verändert. Siehe
`contracts/PRIVATE_WORK_STORAGE_V1.md` für den aktuellen Speichervertrag.

Nachweisstand: Store18/Retention24, Gateway-E2E40, MCP37, gemischte Fortsetzung,
vollständiges `npm run test:ci` (inklusive Pre-/Posttests) und `npm run build` PASS.
`test-keyring-artifacts.mjs` prüft die schlüsselfreie Produktprojektion; ZIP/MCPB
enthalten keine nativen Keyringmodule. `test-batch-performance-contract.js` verlangt
erfolgreiche Verarbeitung aller Benchmarkdateien, nicht bloß gemessene Stopps.
Ein echter Cowork-/Zielsystemnachweis bleibt offen. Native Keyring-Smoke-Tests
und zusätzlicher Engineering-Keyring-Unterbau sind wegen Scopewechsel obsolet,
nicht bestanden. Nachfolgende RC66–RC79-Einträge bleiben historische Nachweise.
Stapelweite persistente Pseudonyme (BL-030.2) werden dadurch nicht aktiviert.

## DS-063: Engineering-Testtrennung, BL-010.8/BL-011.13

`scripts/lib/engineering-keyring-session.mjs` ist ein nicht ausgelieferter Adapter
über den bestehenden `Entry`-Injektionspunkt: fester eigener Service, intern
zufälliger Account, kein impliziter Nativeimport, keine ENV-/Dateiumleitung oder
Löschung. `tests/test-engineering-keyring-session.mjs` belegt 24 Memoryfälle mit
produktiven AES-/Commit-/Read-Modulen, einschließlich terminaler Fehlerbindung
nach einem Security-Gegenreviewfund. `tests/test-engineering-keyring-boundary.mjs`
prüft Produkt-/Packaginggrenzen und eingeschleuste Gegenbeispiele (18 Quelltests,
zwei zusätzliche Archivprüfungen mit `--archives`). Beide liegen im P0-Testgate;
das normale Build prüft auch beide fertigen Archive. Der historische Verifier
bleibt trotz gültiger Konto-Bestätigung vor Assembly-I/O gesperrt (10 Verträge).
Kein neuer Runtime-Release, kein OS-Keyring-Nachweis. Private Session-/Scope-/
Buildbindung über alle Engineering-Prozesse sowie native Backendprobe bleiben E0.

## RC79: gehaltene Parent-/Worker-Endreihenfolge, BL-010.8

`native/sea/process-observer.cpp` ergänzt optional ein ebenfalls gehaltenes
Parenthandle mit denselben minimalen Rechten und Image-/Lebendprüfung. Die
native Wartefolge priorisiert ein bereits beendetes Workerobjekt und verlangt
nach Parentende einen noch lebenden Worker. Erst dann gilt `parent-exited`.
`sea-process-observer.mjs` verlangt dieses zusätzliche Ereignis ausdrücklich
im neuen Modus; Worker-only bleibt abwärtskompatibel. 47 Unit-/Negativprüfungen
und 17 native synthetische Szenarien. Kein Beweis der Prozessabstammung, kein
fertiger SEA-Produktstapel und keine Bereinigungsfreigabe.

Das Architekturreview trennte den nativen Sequenznachweis von noch offener
Engineering-Worker-Anbindung vor Netzwerkguard, Controllerbindung und neuem
Ergebnisprüfprozess. Letzterer muss unveränderte Originale/Finalpakete, Journal,
Mapping und vollständige Staginginventur prüfen. DS-062 wurde in Entscheidung,
Zielvertrag, Vision, Architektur, Backlog und Testplan konsistent aufgenommen;
der Kanonvalidator erzwingt den VM-Ausschluss im maschinellen Zielvertrag.

## RC78: nativer Prozessbeobachter, BL-010.8

- `native/sea/process-observer.cpp`: ausschließlich Beobachtung, ein gehaltenes
  Synchronisations-/Abfragehandle, lokale First-Instance-Pipe, Client-/Image-
  Prüfung, begrenzter Handshake und begrenztes Warten. Pending I/O bleibt bis zur
  bestätigten Completion am Leben; ohne Cancel-Drain kein Stack-Unwinding.
- `scripts/build-sea-process-observer.mjs`: expliziter Windows-x64-Build in neuem
  Engineering-Verzeichnis, gepinnte vorhandene Toolchain, Quell-/Binärnachweis.
- `scripts/lib/sea-process-observer.mjs`: geschlossener monotone Zustandsvertrag,
  uint32-Exitcodes nur nach `armed`, gelatchtes gemeinsames Ausgabebudget.
- `tests/test-sea-process-observer-contract.mjs`: 37 reine Tests im SEA-Testgate.
- `tests/manual/sea-process-observer-native.mjs` und eigene Fixture: 10 echte
  synthetische Szenarien, keine Produktimporte, keine OS-Credentials. Erwartete
  Fehlercodes/Eventfolgen werden exakt geprüft, kein beliebiger Fehler als PASS.

Architektur-/Security-Agenten revalidierten Rechte, Handle-/I/O-Lifetime und
False-PASS-Risiken. Beide Testbefunde korrigiert. Windows-Testworker bewusst
detached und mit kurzer eigener Exitfrist; ein Exit nach Parentende ist keine
Evidenz produktiver Fortsetzung, Datenpersistenz oder Prozessbaum-Cleanup.
Produktverifier/Assembly/Runtime unverändert, vollständiger Parent-Crash noch E0.

## RC77: Parent-Buildkonsistenz, BL-010.1/BL-010.8

`scripts/lib/sea-launcher-provenance.mjs` rekonstruiert Bootstrap, feste SEA-
Konfiguration, vollständige Plugin-Source-Evidenz und geschlossene Toolchain-
Dateiinventare (inklusive tatsächlich aufgelöstem Commander). Der Builder nutzt
diese Bytes und prüft vor Evidenzveröffentlichung erneut. Die offizielle Node-
Archivprüfung und das kopierte Nodeprogramm sind an denselben Eingangs-Hash gebunden.
`build-sea-plugin.mjs` sowie die drei Parent-Verifier erzwingen V2-Nachweise vor
Staging/Spawn; Staging bleibt an der ursprünglichen Quellenaufnahme gebunden.

`test-sea-launcher-provenance.mjs`, erweiterte Assembly-, Launcher- und Worker-
Vertragstests prüfen Quellen-/Toolchainmutation, Konfigurationsdrift, Typen und
geschlossene Schemas. Gegenreview schloss drei P2-Befunde: Quellen-Rebaselining,
fehlende Commanderbindung und implizite Hash-Typkonvertierung. Siehe
`contracts/SEA_ASSEMBLY_EVIDENCE_V2.md` und `docs/TESTING.md`.
Kein Produktions-Hotpath geändert; keine neue Runtime-/Hostfreigabe.

Offen bleibt die unveränderbare Laufzeitbindung externer Nebenrollenmodule:
Buildkonsistenz ist keine kryptografische Binärattestierung. Finale Rollenassembly,
Parent-Crash- und reale Zielsystem-/Cowork-Evidenz bleiben eigene Arbeitsanteile.

## RC76: Staging-Recovery, BL-010.8/BL-011.8/BL-011.11

`gateway/package-staging.js` besitzt den getrennten `.datasecure-staging`-Bereich
neben Output: gebundener Rootmarker, unveränderlicher/fsync-bestätigter Ownerrecord,
Capability vor dem ersten Schreiben in die Stage, Rename auf demselben Dateisystem. Keine
zusätzliche Laufzeitbibliothek: vorhandene Node-Datei-/Kryptoprimitiven und
`batch-journal-io.js` werden wiederverwendet. Der neue kleine Koordinator bindet
produktspezifische Paket-/Jobidentitäten; ein generischer Tempordner-Cleaner
besitzt diese Eigentumsinformation nicht. Keine
Rücknahme fertiger Pakete bei anschließendem Receiptfehler. `common.js` erweitert
private Baumreinigung um exakte Parent-/Zielidentität und vollständige Preflight-
Inventur vor der ersten Löschung; Links und Hardlinks führen zum sicheren Stopp.
`orchestrator.js` führt Recovery einmal im Vorbereitungskontext aus und nutzt
gebundene Publish-/Discard-Operationen. Lebende und unbekannte PIDs bleiben geschützt.

`test-package-staging.js`, `test-package-staging-integration.js`,
`test-safe-private-tree.js`, `test-source-folder.js` und `test:staging` prüfen
Besitzbindung, Manipulation, Abbruch und vorangegangene Ergebnisse. Integration
ohne `deps.packageId` deckt den im Gegenreview gefundenen Einzeldateinamenskonflikt
ab. Das normale Gateway bleibt kompatibel. `sea-batch-probe.js` erweitert die
vollständige Outputinventur um eine schreibfreie Staginginventur; kein Verstecken
von Resten durch die neue Ablage. Tests sind keine Cowork-/SEA-/Power-Loss-Abnahme.

Alte Output-Dotverzeichnisse und vor vollständiger Bindung entstandene leere
Initialisierungsreste werden weder übernommen noch automatisch gelöscht. Bei
unklaren aktuellen Stagingdaten: `STAGING_RECOVERY_BLOCKED`, lokale IT-Prüfung.
Keine Rohinhalte/Pfade/Ownerdaten in diesem Diagnoseereignis.

## RC75: Worker-Crash/Fortsetzung, BL-010.8/BL-011.11

`sea-batch-probe.js` beobachtet read-only das letzte `processing/extracted`-Item
nach Parser-`close`, erfasst zuvor freigegebene Paketdateien und beendet nur den
eigenen Worker. Anormaler Exit plus Disconnect, akzeptierte Killanforderung,
unveränderte Item-IDs und weiterhin nicht veröffentlichter letzter Eintrag sind
Voraussetzungen für `continueMostRecentBatch`. Token, Lease und
`start-local-batch` sind an dieselbe Fortsetzung gebunden; frühere Pakete werden
vor/nach Fortsetzung auf Bytes, Hashes und Identitäten geprüft.

`test-sea-batch-resume-contract.js` prüft echte private Predicates und die
Parser-`close`/`onExtracted`-Kopplung; Sparse-Array-Gegenreviewfund geschlossen.
`test-sea-batch-resume-lifecycle.js` ergänzt isolierte Ablauf-/Fehler-VM-Tests.
Keiner davon startet Produktworker oder lädt den Keyring. Verifier und Bootstrap
prüfen den erweiterten Ergebnisvertrag. Echte native Ausführung offen; kein
GUI-Starter-/Cowork-/Parent-Crash-/Power-Loss-Nachweis. Siehe `docs/TESTING.md`.

Neuer Quellbefund **BL-010.8/BL-011.8/BL-011.11**: `orchestrator.js` erstellt
Output-Staging-Verzeichnisse vor der Textanonymisierung und entfernt sie bei
Fehler nur im `catch`. Hard-Crash umgeht diesen; Resume/Retention bereinigen die
Dot-Verzeichnisse nicht. Native Reproduktion ausstehend, kein belegter Rohdatenleck.
Strikte Output-Inventur bleibt unverändert; Recovery mit sicherer Eigentümerschaft
und Negativtests wurden anschließend in RC76 ergänzt (siehe oben).

## RC74: native Stapelprobe, BL-010.1/BL-010.8

`scripts/verify-sea-batch.mjs` fordert ein ausdrückliches Testkonto-Opt-in vor
Artefaktzugriff/Spawn, bindet Parenthash und rekonstruierte Parserrolle, kopiert
den geprüften Quellbaum in einen frischen synthetischen Scope und startet zwei
Fälle seriell. Kein CI-Aufruf des nativen Harness, kein Credential-Override und
keine Löschung bei ungewissem Workerende. Dieser Teilvertrag attestiert nicht
die gesamte eingebettete Parent-/Nebenrollenimplementierung oder OS-Isolation.

Der feste Branch in `native/sea/bootstrap.cjs` und `sea-batch-probe.js` prüfen
SEA/Windows/IPC, geschlossenen Startframe, linkfreie Scopeidentität und beide
Dateiwurzeln vor Produktimport. Nach dem realen Workerabschluss werden Journal,
eindeutige Pakete, Manifestgrade, PII, Qualifikation, Mapping und unveränderte
Originalbytes geprüft. `sea-batch-probe-fixtures.js` enthält nur feste synthetische
TXT/CSV/DOCX-Daten. Der Security-Gegenreviewfund zur unvollständigen Namensprüfung
ist durch Bestandteil-/Formatierungsprüfungen und Negativtests geschlossen.

`test-sea-batch-probe-contract.js`, `test-sea-batch-result-contract.js`,
`test-sea-batch-verifier.mjs` und erweiterte Bootstraptests laufen in
`test:sea-gates`, ohne native Positivjobs oder Keyringzugriffe. Reale positive
Läufe sind nicht belegt. Worker-Resume wurde anschließend in RC75 ergänzt;
Parent-Crash bleibt offen. Keine V2-/SEA-Freigabe.

## RC73: Executor-/Anzeigen-Lifecycle, BL-010.8/BL-041.9/BL-012.6

`gateway/batch-executor.js` registriert Fehlerbehandlung vor der PID-Prüfung.
Spawn-/IPC-Fehler werden nur als feste Diagnosen ausgegeben; ein fehlendes
Exit-Ereignis darf nicht als beendeter gestarteter Worker gelten. Fehlerpfade
beenden nur das eigene Kind, behalten Pending/Lease bis zum Ende und schützen
Nachfolger vor verspäteten Callback-/Exit-Ereignissen. Keine Pollingschleifen,
zusätzlichen Benutzerabfragen oder teuren Journalaktionen im erfolgreichen Start.

`companion/completion-summary.js` entkoppelt auch Restzustands-/Fehlerhinweise vom
MCP-Prozess. Reale GUI-Erreichbarkeit/Fokus und Cowork-Permissions bleiben E1/E2;
die Vertragstests belegen den nicht blockierenden Programmaufruf. Nachweise und
Reviewgrenzen stehen in `docs/TESTING.md`.
`test-batch-executor-startup.js` prüft zusätzlich voreiliges/doppeltes Exit-Logging;
`workflow-diagnostics.js` und sein Test unterscheiden asynchronen Anzeigenstart
(`completion_notice_dispatched`) von einem abgeschlossenen synchronen Aufruf.

Der Testplan für positiven SEA-Stapel/Crash/Resume bleibt im Rollenvertrag.
Sein echter OS-Keyring ist nur in einer bereitgestellten isolierten Testumgebung
zu benutzen: temporäre Rootpfade allein genügen nicht. Keine neue Secretstore-
Umgebungsoption und keine Veränderung bestehender Produktcredentials.

## RC72: feste Nebenrollen und Companion-Lifecycle, BL-010.1/BL-010.8

`background-role-launcher.js` vereinheitlicht drei feste Rollen; Batch-Intake und
Fortsetzung teilen die Batchrolle. `native/sea/bootstrap.cjs` prüft Windows/SEA,
IPC, gebundene Parserrolle, linkfreie Einträge und den unveränderbaren Netzwerk-
Guard vor Rollenimport. Node-Aufrufe bleiben erhalten. SEA erlaubt keine
ausführungsändernden Testoptionen oder geerbten Node-Start-/IPC-Variablen.

42 Launcher-, 22 Bootstrap-, neun Companion-Start- und sechs Probe-Lifecyclegruppen
ergänzen den Vertrag.
`sea-background-probe.js` ergänzt den echten Parent-Verifier um private IPC- und
Negativfälle; keine vollständige positive Job-/Privacy-Freigabe. Ein hängender
Ready-Handshake endet technisch begrenzt; Schlüsselbereinigung und Ablehnung
offener Anfragen hängen nicht von einem späteren Exit ab. Beobachtete Exits und
bereits angeforderte Beendigungen verhindern erneutes Beenden einer alten PID.
Fachagenten-Gegenreview und konkrete Testergebnisse: `docs/TESTING.md`.

DS-004/DS-052/DS-053/DS-060 bleiben unverändert. Gesamte Nebenrollen-Quellbindung,
positiver Stapel-/Resume-Lifecycle, finale Assembly/V2 und reale POSIX-Nachweise
bleiben E0; echte Cowork-Installation und Bedienung E1/E2.

## RC71: echter gebundener Parent-/Parser-Dispatch, BL-010.1/BL-010.8

`sea-parser-role.js` validiert die unveränderbar in `native/sea/bootstrap.cjs`
eingebettete Rolle, feste Zielpfade, Binärformat/-hash und vollständige Parser-
Closure. Identitätscache, begrenztes FD-Lesen und erneute Pfadprüfung verhindern
unnötiges Wiederhashen und erkennen beobachtbare Änderungen. `runtime.js` nutzt
den Resolver nur bei echtem SEA, verbietet Start-Seams und schwachen POSIX-Fallback.
Getter-Negativtests sichern die einmalige Optionsauswertung ab.

25 Resolver- und acht Dispatchgruppen ergänzen den Vertrag. Die echte Probe
`verify-sea-parent-parser.mjs` prüft fünf Textformate wiederholt im SEA-Parent,
MCP-Start und feste Manipulationsfehler ohne Host-Node im Childpfad. Kein E1-,
Privacy-Release- oder kombinierter V2-Nachweis; Quellbindung ist keine Attestierung
der ganzen Parent-Implementierung. Weitere Rollen/Assembly/POSIX bleiben E0.
[Rollenvertrag](contracts/SEA_PARSER_ROLE_V1.md), DS-004/DS-052/DS-053/DS-060.

## RC70: feste Parserrolle und vorgezogene Workergrenze, BL-010.1/BL-010.8

`parser-worker.js` prüft Rechte/Guard vor Import. `network-deny.cjs` schützt nun
auch `dns.promises.Resolver`; beide Korrekturen real unter Node 22/24 getestet.
`native/sea/parser-bootstrap.cjs` bettet den Parser mit fester Startkonfiguration
ein. Builder/Verifier rekonstruieren die komplette Closure und prüfen Config,
Toolchain, Quell- und Binärhash; 13 Provenance-, fünf Rollen- und acht
Workergrenz-Prüfgruppen ergänzen `test:sea-gates`. Die echte Windows-Probe bleibt
getrennt von den noch fehlenden MCP-Parent-/Nebenrollen-/POSIX-Nachweisen.
[Rollenvertrag](contracts/SEA_PARSER_ROLE_V1.md), DS-004/DS-052/DS-053/DS-060;
keine Änderung an Formatfreigabe, Anwenderablauf oder öffentlichem Node-Start.

## RC69: SEA-Engineering-Gates, BL-010.1/BL-010.8

`sea-source-evidence.mjs` bindet Version, Pluginbaum, Launcher-Vertrag und
Dispatcher. `build-sea-plugin.mjs` prüft V2-Nachweise, linkfreie begrenzte Eingaben,
exklusive Ausgabe und POSIX-Modi. `test-sea-source-evidence.mjs`,
`test-sea-plugin-assembly.js`, `test-sea-worker-boundary.js` sowie
`test-sea-launcher-contract.js` bilden `test:sea-gates`.
Echter frischer Windows-Start PASS, Parserkern TXT/DOCX FAIL; Vier-Ziel-Worker-
Dispatch und Rechte-/Netzwerk-Negativmatrix bleiben E0-offen. Die historischen
Start-only-Nachweise unten sind **keine aktuelle positive Parser-/V2-Evidenz**.
[Paketvertrag](contracts/SEA_ASSEMBLY_EVIDENCE_V2.md); DS-004/DS-052/DS-053/DS-060
und die produktive `node`-Konfiguration bleiben unverändert.

## RC68: BL-042.3, DS-042/DS-043/DS-051/DS-055/DS-056

Passive Start-Momentaufnahme statt zusätzlichem Steuerpfad. `status-app/model.js`
projiziert ausschließlich feste öffentliche Startzustände; `server.js` verknüpft
nur den Picker und liefert genau eine hashgeprüfte Offline-Ressource nach lokaler
Pilotfreigabe und UI-Aushandlung. Alle Tools bleiben für die App unsichtbar/nicht
aufrufbar (`visibility: ['model']`); der Host muss diese Sichtbarkeit durchsetzen.
`ui/status-card/` verwendet das offizielle SDK ohne Anwendungsaktionen/Netzwerk.
Nachweis: `test-status-app-model.mjs`, `test-status-app-server.js`, erweiterte
`test-mcp-protocol.js`, `build-status-app.mjs --check` und synthetischer Browser-
Host mit axe. [Pilotvertrag](STATUS_APP_PILOT_V1.md). Keine Cowork- oder
Barrierefreiheitsfreigabe; DS-056-Gates und Rest-E0 bleiben offen.

RV-06 / BL-011.13: `test-gateway-e2e.js` injiziert auch im visuellen Timeoutfall
`reviewCrypto`, hält die strenge Resteprüfung bei und fordert zwei OCR-Aufrufe.
DS-020/DS-050-Schutz bleibt unverändert; Produktions-Keyring-Metadaten werden nicht
als Teil eines Dokument-Cleanups gelöscht. Diagnose per synthetischem In-Memory-
Keyring bestätigt; keine neue Runtimefunktion.

## RC67-Korrekturscheibe: bestehende Entscheidungen, kein neuer Scope

RV-01 bis RV-05 aus dem [offiziellen Claude-Abgleich](../REVIEW_CLAUDE_BEST_PRACTICES_2026-08-31.md)
sind bestehenden Stories zugeordnet: BL-012.2/BL-012.6/BL-052.1 (Fehlerhilfe/UAT),
BL-041.7/BL-042.2 (Normal-/Supportvertrag), BL-041.2/BL-041.4 (Skill/Eval),
BL-010.8/BL-051.1 (lokaler Validator), BL-010.7/BL-051.6 (Hostevidenz).
Nachweise: `test-mcp-protocol.js`, `test-completion-summary.js`,
`test-rc63-uat-kit-contract.js`, `test-skill-eval-corpus.js`,
`test-claude-local-validation.mjs`, `test-host-matrix.js` und lokale
`claude plugin validate`-Aufrufe. Diese E0-Korrekturen ersetzen keine E1/E2/E3-
Nachweise; bestehende DS-Entscheidungen und Releasegrenzen bleiben unverändert.

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
| DS-061 | BL-003, BL-011 | verbindliche Refactoring-/Migrationsreihenfolge, getrennte Struktur-/Verhaltensänderungen, Pflichtgates und Rollback |
| DS-062 | BL-010, BL-011, BL-050, BL-051 | keine zusätzliche System-VM für Produkt oder Abnahme; echte lokale Zielsysteme, OS-Testkonto nur nach Abstimmung, keine produktiven Credentials für Tests verwenden |
| DS-063 | BL-010, BL-011, BL-050, BL-051 | ersetzt Kontooption aus DS-062: kein zusätzliches Windows-Konto; sichere Testtrennung im vorhandenen Konto ist E0, keine Nutzer-Infrastrukturaufgabe oder Freigabe für produktive Credentials |
| DS-064 | BL-010, BL-011, BL-041, BL-050, BL-051 | vorhandene Memorytests plus kleiner nativer Schlüsselbund-Smoke-Test; zusätzlicher Engineering-Session-Unterbau und vollständige Keyring-/Crash-Matrix zurückgestellt; normaler Cowork-Ablauf hat Vorrang, Produktschutz unverändert |
| DS-065 | BL-010, BL-011, BL-030, BL-040, BL-041, BL-050, BL-051 | ersetzt Verschlüsselungs-/Keyring-Pflichten aus DS-050/DS-059/DS-061/DS-063/DS-064: lokale Plain-Arbeitskopien ohne Keyring, Keyfile oder Passwort; Original-/Releasegrenze und Aufbewahrung neuer Kopien bleiben; verschlüsselte Altbestände unverändert bewahren, Original neu auswählen; native Keyring-Testaufgaben obsolet, nicht bestanden |

## Offene Review-Nachweise vom 23.08.2026

| Story | Review-Befund | Erforderlicher Abschlussnachweis |
|---|---|---|
| BL-011.8 | `dataRoot()/batches` besitzt noch keinen vollständigen Reparse-/Junction-Vertrag | echte Junction-/Symlink- und Swap-Gegenproben vor Kopie, Recovery und Cleanup auf allen Ziel-OS |
| BL-011.9 | V8-Heap/Parent-Timeout ersetzen auf POSIX keine harte native Ressourcen- und Prozessbaumgrenze | gebündelter Supervisor plus reale CPU-/RAM-/Flood-/Child-/Timeout-Matrix auf macOS x64/ARM64 und Linux x64 |
| BL-012.8 | macOS-AppleScript referenziert bei vertagbarem Review einen nicht angebotenen Cancel-Button | validierter Aktionsbuilder, Unit-Invarianten und echter `osascript`-/Fresh-Install-E2E-Nachweis |
| BL-010.7 | Cowork-Dokumentation zu local MCP in Cloud-/Web-/Mobil-Sitzungen ist widersprüchlich | `HOST_MATRIX_V1.json`, kanonischer Host-Gate-Text und `test-host-matrix` umgesetzt; beobachtete versionsgebundene Hostabnahme bleibt offen |
| BL-010.8 | Plugin-ZIP bleibt bei `node`. RC71 bindet den separaten Parser, RC72 feste Nebenrollen an den Windows-Parent; Rechte, Parserclosure, Dispatch und IPC geprüft. Native POSIX-Pflicht simuliert; V2-Assembly/Dateimodetests implementiert, keine positive kombinierte V2-Hostevidenz. | zuerst E0: positiver SEA-Stapel-/Resume-Lifecycle, ganze Nebenrollenbindung, reale POSIX-Integration, finale Rollenassembly und kombinierte Rechte-/Netzwerkmatrix; danach echte Vier-Ziel-Kernläufe, ZIP-/Marketplace-Fresh-Install, Update und Rollback |
| BL-041.4 | Direkte Prompts und Skill boten bei offenen Stapeln nicht dieselben Entscheidungen | kanonischer Drei-Wege-Vertrag und Contract-Tests umgesetzt; Modelltest und beobachtete Fresh-Install-Startparität bleiben offen |
| BL-041.5 | Maximalstapel konnte bis zu 26.700 Modell-Leseaufrufe erzeugen | abgekoppelter Worker, Crash 1/50/100, MCP-Prozesswechsel, getrennte lokale Freigabe und begrenzter namenfreier Leseplan umgesetzt; 500-MB-/Host-/Rechnerneustart-/Drei-OS-/Cowork-Gates offen |
| BL-042.2 | MCP-Tools besitzen keine vollständige destruktiv/read-only/idempotent Semantik | Strict-Validator, Policy-Test und echte Cowork-Manual-/Auto-/Skip-Abnahme |
| BL-051.5/BL-051.6 | Pakettests belegen weder Cowork-Lebenszyklus noch negative Hostklassen | Policy-/Evalmatrix für Web, Mobil, Cloud/Scheduled und getrennten Desktop umgesetzt; Fresh Install/Update/Rollback und beobachtete Realhost-Matrix bleiben offen |
| BL-051.7 | sieben Jobs pro normalem Push verursachten unnötige Runnerkosten | genau ein automatischer Ubuntu-Job; schwere Plattform-, Release-, Security-, OCR- und PDF-Evidenz nur manuell auswählbar; `test-workflow-budget.js` verhindert Kostendrift |

## Umsetzungsnachweise erledigter Stories

### RC44-Arbeitsnachweise aus Product-Vision-Review

| Story | Nachweis |
|---|---|
| BL-011.14 (R3a-Teilnachweis RC53) | `gateway/read-only-source-snapshot.js` öffnet jede Neuquelle ausschließlich `O_RDONLY`/`O_NOFOLLOW`, bindet Dateiidentität, Größe und mtime, versiegelt ungebundene Quellen lokal per SHA-256, prüft den Kopierstrom gegen diese Bindung und schreibt nur exklusiv `0600` in den privaten Jobbaum. Zero-/Partial-Writes, Descriptor-Close und Cleanupfehler besitzen feste fail-closed Grenzen. `gateway/orchestrator.js` besitzt keinen Move-/Restore-/Unlink-Pfad für Nutzerquellen mehr und meldet stets `original_moved_to_processed: false`. Zwölf direkte Snapshot-Tests und 40 Gateway-End-to-End-Szenarien belegen Originalerhalt. Der damalige offene Legacy-Input-Rest ist durch RC55 superseded. |
| BL-011.14 (R3b-Schutzteilnachweis RC54) | `gateway/retention.js` klassifiziert jeden historischen `Processed`-Eintrag als mögliches Original. Automatische Retention, Null-Tage-Regel und Purge entfernen dort nichts; 21 direkte Retentiontests belegen den Schutz. Der damalige offene Legacy-Input-Rest ist durch RC55 superseded. |
| BL-011.14 (R3b-Abschluss RC55) | `roots()` erzeugt keinen `Input`; `listInput`, Batch-/Orchestrator-Fallbacks und öffentliche Direkt-/Sammelverarbeitung sind entfernt. `legacy-input-migration.js` ist schema-versioniert, privat gesperrt und vollständig vorprüfend: sichtbare Altbestände bleiben unverändert, gültige verwaiste Claims werden per kollisionsfreiem Hardlink sichtbar gesichert und als historisches Quellobjekt beibehalten; aktive, ungültige, verlinkte oder unklare Bestände stoppen fail-closed. 15 direkte Migrationsfälle, 20 Architekturverträge, Gateway- und MCP-Neustarttests belegen Fresh Install, Kollision, Idempotenz, Marker-/Lockfehler, aktive Owner sowie ausgetauschte Locks und Metadatenfreiheit. |
| BL-011.13 (R4b-E0 RC66) | `private-artifact-crypto.js`, `private-artifact-runtime.js` und `installation-secret-store.js` verdrahten create-once AES-256-GCM produktiv mit dem gelockten nativen OS-Keyring, persistenter Schlüssel-/Commitbindung und geschlossenem Schlüsselverlust. `batch-snapshot.js`, `batch-private-artifact-migration.js`, `review.js`, `orchestrator.js` und `runtime.js` sichern Batch-/Reviewbytes, migrieren V2/Altpreview absturzsicher, vermeiden direkte Klartext-Jobdateien und bestätigen vollständigen Parser-stdin. `keyring-artifacts.mjs` bindet Version, Lockfile, Lizenz, Zielmatrix, Hash, Größe und Binärformat in ZIP/MCPB-Build und -Verifikation. Direkte Crypto-/Store-/Migrations-/Snapshot-/Review-/Parser-/Gatewaytests belegen die E0-Grenze; reale Zielsystem- und Security-Evidenz bleibt E1/E3. |
| BL-044.1 (E0 RC66) | `companion/source-folder.js` liefert native Windows-/macOS-/Linux-Ordnerauswahl und validiert den vollständigen Baum deterministisch vor Aufnahme gegen Links/Reparse Points, Sonderobjekte, Tiefe, Einträge, Dateizahl, Einzel- und Gesamtgröße. `source_label` bewahrt nur lokal die relative Zuordnung kollidierender Basenames. `test-source-folder.js` sowie Intake-/Journal-/MCP-Vertragstests belegen den synthetischen Pfad. |
| BL-047.1 (E0 RC66) | `gateway/adaptive-resource-policy.js` berechnet die geschlossene 25%-/2-GiB-/Zwei-Slot-Policy und hält OCR single-flight. `parallel-preparation-harness.js` nutzt ein begrenztes Gleitfenster, zentrale Quellreihenfolge, seriellen Commit und Stage-Bereinigung. Sechs Scheduler-/Speicher-/Abbruchtests, der reale TXT-/CSV-/DOCX-Benchmark und der produktionsgleiche seitenweise 100-Dateien-Handoff belegen E0; der Produktpfad bleibt bis E1 seriell. |
| BL-011.15 (Planvertrag) | DS-061 und `REFACTORING_PLAN.md` verlangen die verhaltensneutrale Zerlegung des Stapelkerns hinter der bestehenden Exportfassade. Intake/Snapshot, Journal/Recovery, Verarbeitung/Commit, Review, Veröffentlichung/Mapping und Wartung werden einzeln charakterisiert, extrahiert, regressionsgeprüft und rückrollbar committed. |
| BL-011.15 (R2-Teilnachweis) | `gateway/batch-results.js` kapselt Ergebnisübergabe, `gateway/batch-progress.js` Status/Fortschritt, `gateway/batch-review-policy.js` Keep/Redact/Deferral, `gateway/batch-journal-io.js` Short-Write/Fsync, `gateway/batch-journal-store.js` atomare Veröffentlichung und getrennte Normal-/Maintenance-Reads, `gateway/batch-reconciliation.js` Paketverifikation/Mapping/Interrupted-Transition, `gateway/batch-recovery.js` read-only Status sowie gesperrte Recovery/Ablaufbereinigung, `gateway/batch-private-store.js` private Pfade/Cleanup, `gateway/batch-snapshot.js` Kapazität/OOXML/TOCTOU-Kopie, `gateway/batch-active-lock.js` globale Prozesssperre, `gateway/process-liveness.js` gemeinsame PID-Liveness und `gateway/batch-executor-lease.js` Claim/Access/Release. `test-batch-journal-store.js` belegt positive Partial- und Zero-Writes über die echte Store-Grenze, jede Publikationsfehlerphase, Temp-Cleanup, Symlink-/Dateityp-/Inode-Austausch, mutationsfreie Maintenance-Reads und konsistente Expiry-Validierung. `test-batch-reconciliation.js` belegt deterministische IDs, Manifest-/Hash-/Symlink-Gates, Adoption vor Retry, die Reihenfolge Outbox/CSV/Intent-Cleanup, alle Mapping-Crashgrenzen und Idempotenz. `test-batch-recovery.js` belegt Live-Owner-/Executor-Yield, gemischte defekte Journale, feste Recovery-Reihenfolge, genau einen finalen Commit, idempotente Wiederholung, Workdir-vor-Journal-Cleanup, isolierte Teil- und Lockfehler sowie die unveränderte Fassade. `test-batch-snapshot.js` belegt Partial-/Zero-Write, Short-Read und `ctime`-Mutation; `test-batch-active-lock.js` austauschsicheres Release/Reclaim und blockierendes `EPERM`; `test-batch-executor-lease.js` ungültige, tote, doppelte und fremde PIDs, Lock-/Journalfehler und die unveränderte Fassade; `test-batch-session.js`, `test-mixed-batch-recovery.js`, `test-mapping-outbox.js`, `test-local-only-handoff.js`, `test-batch-user-status.js`, `test-batch-review-policy.js`, `test-batch-retention-protection.js`, `test-gateway-e2e.js` und `test-mcp-protocol.js` belegen die unveränderte Export- und Verhaltensfassade. |
| BL-011.15 (R2-Retention-/Delivery-Nachweis) | `gateway/batch-retention-protection.js` kapselt den konservativen read-only Schutzscan für offene Delivery-/Mapping-Pakete; `test-batch-retention-protection.js` belegt dynamische Root-Auflösung, Gesamtabbruch bei einem defekten Journal und den Erhalt bereits gefundener Schutz-IDs. `gateway/batch-delivery.js` kapselt Capability-Ausgabe, Einzel-/Seitenbestätigung, lokalen Abschluss und terminales Einzeldatei-Cleanup. `test-batch-delivery.js` belegt vollständige Seitenvalidierung vor Mutation, Paketverifikation, Lock-/Journalfehler, symlink-sicheres Cleanup, sichere Wiederholung nach gelöschter Arbeitskopie und idempotente Bestätigung ohne zweiten Journal- oder Evidenzschreibvorgang. |
| BL-011.15 (R2-Mapping-/Intake-Nachweis) | `gateway/batch-mapping-maintenance.js` kapselt den verifizierten Mapping-Outbox-Replay; `test-batch-mapping-maintenance.js` belegt Mapping-vor-Intent-Reihenfolge, wiederholbare Einzel- und Cleanup-Fehler, konservative `unsafe`-/`missing`-Behandlung, gemischte Einträge und inhaltsfreie Zähler. `gateway/batch-intake.js` kapselt Picker-Quellbindung, vollständige Envelope-Prüfung vor Source-Metadatenzugriff, Snapshot-Aufbau und Intake-Commit. `test-batch-intake.js` belegt Dateinamenbindung, doppelte Pfade, Originalschutz, exaktes Work-Cleanup vor Journalveröffentlichung und gemeinsames Fail-closed-Erhalten von Journal plus Work nach Rename-/Fsync-Unsicherheit. `test-direct-picker-batch.js`, `test-mapping-outbox.js` und `test-batch-session.js` sichern die bestehende Fassade und Integration. |
| BL-011.15 (R2-Snapshot-Read-Nachweis) | `gateway/batch-snapshot.js` kapselt zusätzlich `exactPendingEntry` als Read-side-Gegenstück zur versiegelnden Kopie. `test-batch-snapshot.js` belegt geschlossene Work-Namen, Pfadbindung, reguläre-Datei-Fehlerweitergabe, exakte Größe und unveränderte Übergabe des erwarteten Streaming-Hashes ohne Hashing oder Inhaltslesen in dieser Grenze. Review-, Gateway- und Batch-Verträge bleiben unverändert. |
| BL-011.15 (R2-Terminal-Evidence-Nachweis) | `gateway/batch-terminal-evidence.js` kapselt den terminalen Pending-/Exported-Vertrag und den retention-unabhängigen Outbox-Replay; `gateway/batch-evidence.js` liefert den atomaren idempotenten v2-Store mit opaker 128-Bit-Receipt-ID und unverändert erhaltenen v1-Records. `test-batch-terminal-evidence.js` belegt Nichtterminal-No-op, Append-/Marker-Crashfenster, Neustart-Deduplikation, Journal-unabhängigen Replay und Metadatenfreiheit. `test-batch-evidence.js` belegt ID-Konflikt, v1-Erhalt, Zero-Write, Rename-Fehler, beschädigte Altdaten und exaktes Outbox-Cleanup. Delivery und Recovery reparieren denselben Nachweis ohne Paketstatus, Arbeitskopie oder Anonymisierung erneut zu verändern. |
| BL-011.15 (R2-Discard-Nachweis) | `gateway/batch-discard.js` kapselt das bestätigte Verwerfen unvollständiger Stapel unter der globalen Maintenance-Sperre und hält Originale, veröffentlichte Outputs, Mapping und terminale Nachweise außerhalb seiner Löschgrenze. `test-batch-discard.js` belegt vollständiges Yield bei aktivem Executor, Workcopy-vor-Journal-Reihenfolge, Lock-/Scan-/Cleanup-/Unlink-Fehler, sicheren Retry, den bestehenden partiellen Mehrstapelvertrag und die unveränderte öffentliche Fassade. `test-batch-session.js`, `test-direct-picker-batch.js` und `test-mcp-protocol.js` sichern Symlink-/Junction-Schutz, Original-/Output-Erhalt und die weiterhin erforderliche ausdrückliche Bestätigung. |
| BL-011.15 (R2-Continuation-Nachweis) | `gateway/batch-continuation.js` kapselt explizites Resume und tokenlose Auswahl des jüngsten offenen Stapels gemeinsam. `test-batch-continuation.js` belegt Single-Flight, Lock-/Release-Cleanup, Executor- und Invalidierungsgrenzen, Paketadoption vor Mapping vor Interrupted-Recovery vor Resume, genau einen Journal-Commit, idempotente Wiederholung, Fehlerpriorität, Auswahl nach `created_at` und inhaltsfreie Antworten. `test-batch-session.js` belegt zusätzlich reale 100-Dateien-Unterbrechungen an Position 1, 50 und 100 ohne Doppelfreigabe; `test-mixed-batch-recovery.js` und `test-mcp-protocol.js` sichern gemischte Formate und die bestätigte öffentliche Fassade. |
| BL-011.15 (R2-Snapshot-Invalidation-Nachweis) | `gateway/batch-snapshot-invalidation.js` kapselt die statusbegrenzte Invalidierung ausschließlich unveröffentlichter privater Kopien ohne eigenen Journalzugriff. `test-batch-snapshot-invalidation.js` belegt vollständige Statusmatrix, strikte Objektidentität des ausgenommenen aktuellen Items, unabhängige Mapping-/Cleanup-Teilfehler, Eventreihenfolge und idempotente Wiederholung. `test-batch-session.js` sichert Größen-, Digest-, Inode- und pausierte Snapshot-Manipulation sowie den Erhalt bereits veröffentlichter Ergebnisse; Mapping- und Delivery-Tests bestätigen die unveränderten Folgeverträge. |
| BL-011.15 (R2-Executor-Runner-Nachweis) | `gateway/batch-executor-runner.js` kapselt ausschließlich den seriellen lokalen Executor-Lauf hinter injizierten State-, Progress-, Processing-, Delivery- und Lease-Grenzen. `test-batch-executor-runner.js` belegt Claim-Prüfung ohne Fremd-Release, numerische PID-Bindung, einmalige Vorbereitung/Maintenance, Delivery-vor-Mapping-vor-Processing, beide No-progress-Gates, unmittelbare Paketfinalisierung, das harte Item-Schrittbudget, genau einen Releaseversuch an jeder Post-Claim-Fehlergrenze und eine ausschließlich aus frischem Endstatus gebildete inhaltsfreie Antwort. `test-batch-session.js` und `test-direct-picker-intake-worker.js` sichern reale Mehrdatei-, 100-Dateien-, Crash-/Resume- und Child-Worker-Fassaden unverändert. |
| BL-011.15 (R2-Executor-Hardening-Nachweis) | `gateway/batch-journal-store.js` verwirft in normalen und mutationsfreien Maintenance-Reads Zustände außerhalb 1 bis `MAX_BATCH_FILES`; `gateway/batch-executor-runner.js` wiederholt die Obergrenze an der Ausführungsgrenze und akzeptiert nur `releaseLocalBatchExecutor(...) === true` als sicheren Abschluss. `test-batch-journal-store.js` injiziert leere und 101-Positionen-Journale in beide Lesepfade; `test-batch-executor-runner.js` belegt begrenzte Schritte, Release nach übergroßem bestätigtem Claim und den fail-closed Stopp bei `release=false`. `test-batch-session.js` bestätigt weiterhin reale 100-Dateien-Verarbeitung und Crash-Recovery. |
| BL-011.15 (R2-Review-Capture-Nachweis) | `gateway/batch-review-capture.js` kapselt ausschließlich die Rekonstruktion eines vertagten lokalen Review-Entwurfs aus einer exakt gebundenen versiegelten Arbeitskopie. `test-batch-review-capture.js` belegt nicht überschreibbare Entry-/Copy-/Image-/Package-/Diagnostic-/Callback-Optionen, den ausschließlich abgefangenen und nachweislich nach außen gelangten internen Sentinel, unveränderte Pipelinefehler, Fail-closed bei Sentinel-Spoof, intern verschlucktem Sentinel oder fehlenden Ambiguitäten, Objektidentität und Mutationsfreiheit. `test-batch-session.js` sichert gemeinsamen Review, Cancel/Defer, Partial Publish und Lifecycle ohne Rohdaten unverändert. |
| BL-011.15 (R2-Review-State-Nachweis) | `gateway/batch-review-state.js` kapselt die reine Deferred-Markierung, Item-Auswahl und bestehende Bereitschafts-/Meldungspriorität. `test-batch-review-state.js` belegt Mutation nur expliziter Objektinstanzen, Idempotenz, die exakte Ready-Wahrheitstabelle, Analyse-vor-Delivery-vor-Retry-Meldungspriorität, inhaltsfreie feste Texte, Referenzreihenfolge und Mutationsfreiheit des Plans. Capture-, Review-Policy/-Model-, Companion-, Batch- und MCP-Tests sichern die unveränderten Folgeverträge. |
| BL-011.15 (R2-Active-Lock-/Windows-Durability-Nachweis) | `gateway/batch-active-lock.js` versieht neue Sperren mit einer kryptografisch zufälligen 128-Bit-`lock_id` und bindet Release/Reclaim an Payload, `dev`/`ino`, Größe und diese unveränderliche ID; ältere Sperren bleiben lesbar, volatile `mtime`/`ctime` sind kein falsches Release-Gate mehr. Ausschließlich transiente Windows-`EPERM`-/`EACCES`-/`EBUSY`-Fehler beim identitätsgebundenen Lock-Unlink und atomaren Journal-Rename werden höchstens viermal wiederholt; vor jedem Retry bleibt dieselbe Zielidentität Pflicht. Lease-Claim und -Release melden ohne sichere Lock-Freigabe keinen Erfolg. Beim Verlust der letzten Worker-IPC rekonstruiert `batch-executor.js` nur einen bereits durable gespeicherten, inhaltsfreien Terminal-/Ruhezustand und erzeugt sonst weiterhin einen festen recoverbaren Hinweis. Direkte Journal-, Active-Lock-, Lease- und Picker-Negativtests decken dauerhafte Blockade, Replacement und verlorenes IPC ab; 50 serielle echte Windows-Workerläufe bestanden ohne falschen `after_checkpoint`-Stopp. Der garantierte fachliche TXT-Release bleibt separat durch `test-gateway-e2e.js` abgedeckt. |
| BL-011.15 (R2-Review-Publication-Nachweis) | `gateway/batch-review-publication.js` validiert vor der ersten Mutation die vollständige Bijektion von lokaler Review-Antwort zu Dokumentindizes und Ambiguitäts-IDs und führt erst danach die vorhandene je Dokument atomare Veröffentlichung aus. Mapping und Delivery verlangen den positiv aufgerufenen Publish-Callback und die exakte deterministische Paket-ID. Nach dem Output-Commit führen Journal-, Mapping- und Deliveryfehler ausschließlich zu einem reconcilebaren `processing/package_published`-Marker; STOPPED-Mapping und Quellbereinigung sind ausgeschlossen. `test-batch-review-publication.js` belegt Fail-closed ohne Journal- oder Pipelineaufruf für fehlende, zusätzliche, doppelte, außerhalb liegende, typfalsche und fachlich ungültige Bindungen, fehlenden Callback und falsche Paket-ID; außerdem sichere Umsortierung, Partial Publish, alle fünf Post-Publish-Journalschreibgrenzen, Deliveryfehler, lokalen Abschluss, Parser-Retry, Mapping-Outbox/-Commit und Cleanup-Fortsetzung. `test-batch-session.js`, Review-Model/-Policy-, Companion- und MCP-Tests sichern den äußeren Vertrag. |
| BL-011.15 (R2-Review-Orchestrator-Nachweis) | `gateway/batch-review-orchestrator.js` kapselt die äußere gemeinsame Reviewfolge und erhält über das injizierte identische `active`-Set die gegenseitige Ausschließung mit `processBatchNext`. Reconciliation läuft vor Readiness, alle Drafts bleiben bis zum vollständigen Capture im Speicher, genau ein lokaler UI-Aufruf entscheidet, nur der feste Bindingfehler wird übersetzt und terminale Evidenz folgt erst auf Local Finalize. `test-batch-review-orchestrator.js` belegt Not-ready ohne Capture/UI/Publication, Captureteilfehler, Defer/Cancel/Timeout, Referenztreue, Remote-/Local-Finalize-Antwort, selektive Fehlerweitergabe sowie Guard-/Acquire-/Release-Cleanup. Batch-Session-, Review-, Companion- und MCP-Tests sichern die öffentliche Fassade. |
| BL-011.15 (R2-Single-Item-Nachweis) | `gateway/batch-item-processor.js` kapselt den normalen Zustandsautomaten ab durablem Processing-Claim. Sicherheitsoptionen werden nach Caller-Optionen fest gebunden; Publish gilt nur nach genau einem Callback und exakter deterministischer Paket-ID. Post-Commit-Fehler bleiben `processing/package_published` und führen nie zu STOPPED-Mapping oder Catch-Cleanup. `test-batch-item-processor.js` belegt Happy Path, exakte Phasenfolge, Objektidentität, unveränderliche Sicherheitsoptionen, Deferred-/Retry-/Stop-Klassen, Snapshotinvalidierung, fehlenden/doppelten Callback, falsche ID, sämtliche Vor- und Post-Publish-Journalschreibgrenzen, persistenten Journalfehler, Mapping-Outbox/-Commit, Cleanup, Evidenz, Sentinel-Unterdrückung und inhaltsfreie Fassade. `test-batch-post-publish-recovery.js` injiziert zusätzlich einen realen Journalfehler direkt nach Output-Commit und belegt Adoption, genau ein Mapping/Output und keine zweite Konvertierung über denselben bei allen Folgeaufrufen aktiven Pipeline-Nachweis. 66 reale Batch-Sitzungsszenarien sowie Reconciliation-, Delivery-, Mapping-, Performance- und MCP-Gates sichern die Integration. |
| BL-011.15 (R2-Processing-Lock-Nachweis) | `gateway/batch-processing-orchestrator.js` verwendet beim delegierten Single-Item-Prozessor ein ausdrückliches `return await`, damit sein `finally` das gemeinsame `active`-Gate und den globalen Dateisystem-Lock erst nach Resolve oder Reject freigibt. `test-batch-processing-lock.js` blockiert die echte Pipeline am Publish-Gate und belegt in getrennten Resolve-/Reject-Fällen beide weiterhin gehaltenen Sperren, die Ablehnung eines konkurrierenden `processBatchNext`, genau einen Pipeline-Lauf, die Freigabe erst nach Settlement und die Unterdrückung des privaten Pipelinefehlers. |
| BL-011.15 (R2-Next-Maintenance-Nachweis) | `gateway/batch-next-maintenance.js` kapselt den Wartungsvorlauf vor Delivery- und Pending-Auswahl. Verifizierte Paketadoption wird vor jeder weiteren Phase durable festgeschrieben und verschiebt durch den erhaltenen OR-Kurzschluss die Mapping-Reparatur bewusst auf den nächsten Aufruf; Interrupted-Recovery und privates Released-Workcopy-Cleanup folgen mit je eigener Write-Grenze. `test-batch-next-maintenance.js` belegt acht No-op-, Reihenfolge-, Zweiaufruf-, Fehler-, Durability- und Fassadenfälle. `test-batch-reconciliation.js`, `test-batch-post-publish-recovery.js`, `test-mixed-batch-recovery.js` und `test-batch-session.js` sichern Exactly-once und den äußeren Vertrag. |
| BL-011.15 (R2-Processing-Orchestrator-/Abschlussnachweis) | `gateway/batch-processing-orchestrator.js` kapselt den vollständigen äußeren `processBatchNext`-Ablauf; `gateway/batch.js` ist nur noch Composition Root und Exportfassade. `test-batch-processing-orchestrator.js` belegt in elf direkten Async-Grenztests Active-Guard, Lock-/Release-Cleanup, Lease-/Read-/Maintenance-/Delivery-/Pending-/Snapshot-Reihenfolge, inhaltsfreie Antworten, Fail-closed-Invalidierung aller unveröffentlichten Kopien, Fehlerpriorität, Referenzidentität und bis Resolve/Reject gehaltene Ownership. `test-batch-processing-lock.js`, Reconciliation-, Recovery-, Batch-Session-, Gateway- und MCP-Gates sichern den unveränderten Gesamtvertrag. Damit ist R2 vollständig abgeschlossen; R3 ist die nächste Strukturphase. |
| BL-041.9 (E0-Teilnachweis) | `server/index.js`, Skill/Promptvertrag und Cowork-Dokumententest belegen, dass pausierte Stapel keine neue Auswahl blockieren. `review-timeouts.js`, `text-review.js` und `test-local-review-executor.js` entfernen im abgekoppelten Worker den menschlichen Entscheidungs-Timeout; der synchrone Supportpfad bleibt begrenzt. `completion-summary.js` und sein Test starten die rein inhaltsfreie terminale Meldung detachiert, sodass ihr Schließen keinen Worker- oder Cowork-Aufruf blockiert. Echte Cowork-/Windows-/macOS-UX-Evidenz bleibt E1/E2. |

| Story | Nachweis |
|---|---|
| BL-002.1 | `BUILD_INFO.json`, `manifest.json`, `gateway/status.js`, `test-manifest.js` |
| BL-002.2 | `TARGET_CAPABILITIES.json` deckt DS-001 bis DS-061 sowie Formate, Plattformen, Grenzwerte und die getrennte Claude-Übergabe maschinenlesbar ab |
| BL-003.8 | `REFACTORING_PLAN.md`, `DOCUMENT_REGISTER.md`, `BACKLOG.md` und das kanonische Driftgate verankern DS-061 als verbindliche Phasen-, Migrations-, Gate- und Rollback-Reihenfolge. |
| BL-002.3 | `test-capability-contract.js` vergleicht Ist-/Zielvertrag, Runtime, Skills, Marketplace und aktive Handbücher; Bestandteil von `npm test` |
| BL-010.5 | `build-plugin.mjs`, `verify-plugin-zip.mjs`, `test-plugin-structure.js` und der reproduzierte RC30-Build binden ZIP und Marketplace an denselben kanonischen Pluginbaum; das ersetzt keine frische Marketplace-Installation (BL-051.2) |
| BL-051.7 | `ci.yml`, `release-evidence.yml`, `security.yml`, `test:ci` und `test-workflow-budget.js` belegen den kostenbegrenzten automatischen Pfad und erhalten schwere Evidenz als bewusste manuelle Auswahl |
| BL-011.1 | `contracts/BATCH_SNAPSHOT_V1.md` und `test-architecture-contracts.js` definieren und prüfen den unveränderlichen privaten Snapshot |
| BL-011.6 (Teilnachweis) | `zip-reader.js`, `gateway/batch.js`, `runtime.js`, `test-parsers.js`, `test-parser-isolation.js` und `test-batch-session.js` belegen eine reine lokale Verzeichnisprüfung echter ZIP-/CFB-Office-Container vor dem Snapshot, die Sperre ohne neue Arbeitskopie bei übergroßen, verschlüsselten oder unsicheren Containerdaten. Nicht-Container mit einer Office-Endung durchlaufen dagegen den bestehenden einzelnen Stopp-/Fortsetzungsweg. Feste aktive Parserbudgets: 384 MiB V8-Heap/50 s auf allen Plattformen; zusätzlich Windows Job Object: 768 MiB, 40 s CPU, 45 s Wallclock. |
| BL-049.1a (E0-Teilnachweis RC57) | `gateway/source-format-inspector.js`, `gateway/batch-snapshot.js`, `zip-reader.js`, `contracts/SOURCE_PREFLIGHT_V1.md` und 16 direkte Fälle in `test-source-format-inspector.js` belegen den descriptor-/identitätsgebundenen Classifier mit vollständiger UTF-8-/Control-Prüfung, bekannten Signaturen und minimalen OOXML-Partnamen. Produktiv ist nur die bestehende OOXML-Grenze importiert; sie bindet vor jeder privaten Kopie zusätzlich lokale ZIP-Header, Namen, Flags, Methode und Datenbereiche und liefert feste Ablehnungen für Mismatch, Korruption, Polyglot/aktive Inhalte, verschlüsselte ZIP-Einträge und CFB/OLE. Der positive Grad `candidate` ist keine DS-045-Freigabe; gesperrte Formate behalten vorerst den Einzelstopp nach dem Snapshot. Echte OPC-Steuerteile/Relationships/CRC, stapelweite Textaktivierung, neue Formatfreigaben, kopierfreie per-Datei-Reststapel-Fortsetzung und genau drei DS-045-Ergebnisgrade sind nicht nachgewiesen und bleiben offen. |
| BL-049.1a Inode-Testpräzision (E0-Nachtrag RC64) | `test-source-format-inspector.js` injiziert Identitätswechsel mit garantiert verschiedenen, exakt darstellbaren `ino`-/`mtimeMs`-Werten. Damit hängt die Regression nicht von der Double-Auflösung großer NTFS-Dateiindizes ab. Die synthetische 400-Dateien-Gegenprobe meldet `noThrow: 0`, 20 direkte Wiederholungsläufe sowie Source-Preflight und lokales CI bestanden. Produktcode und ausgelieferte Artefakte blieben unverändert. |
| BL-049.1b1 (E0-Teilnachweis RC58) | `gateway/batch-source-admission.js`, Intake-, Journal-, Mapping-, Recovery-, Fortsetzungs- und Fortschrittsmodule sowie direkte Unit-/Negativtests und 67 Batch-Ende-zu-Ende-Fälle belegen mutationsfreie Gesamtplanung, kopierfreie Einzelstopps, Reststapel-Fortsetzung, idempotentes lokales Mapping und Recovery. 100-Datei- und Crashläufe an Position 1/50/100 schließen doppelte Freigabe aus. Keine neue Formatfreigabe; OPC/CRC, drei DS-045-Grade und reale E1/E3-Evidenz bleiben offen. |
| BL-049.1b2 Integrität (E0-Teilnachweis RC59) | `zip-reader.js`, `gateway/opc-source-validator.js`, `gateway/source-format-inspector.js`, `gateway/batch-source-admission.js`, `gateway/batch-snapshot.js` und die direkten OPC-/CRC-/Digesttests prüfen vor jeder Kopie sämtliche ZIP-Einträge, echte Content Types und Relationships unter festen Budgets. SHA-256 bindet die positive Admission-Entscheidung an die exakten Snapshot-Bytes; Abweichung entfernt die Teilkopie. XLSX/PPTX bleiben trotz struktureller Prüfung gesperrt. Drei DS-045-Grade sowie reale E1/E3-Evidenz bleiben offen. |
| BL-049.1b2 Grade-Policy/Manifest (E0-Teilnachweis RC60) | `contracts/RESULT_GRADES_V1.md`, `gateway/document-result-grade.js`, Paketmanifest V3 sowie direkte Policy-, Tamper-, Paket-, Reconciliation- und Gatewaytests belegen: freigegebene Pakete erhalten ausschließlich `complete` oder `usable-with-omissions`; nur ausdrücklich entfernte oder bei Freigabe lokal zurückgehaltene Bilder sind erlaubte gezählte Auslassungen. Parserwarnungen, unbekannte Coverage und widersprüchliche Signale stoppen. Der Freigabezeitpunkt bleibt trotz späterer lokaler Bildfreigabe unverändert, V2 bleibt ohne unterstellten Grad lesekompatibel. Dauerhafte Journal-/Mapping-/Evidenz-/Cowork-Projektion aller drei Grade einschließlich `not-processed` sowie E1/E3 bleiben offen. |
| BL-049.1b2 Journal/Mapping (E0-Teilnachweis RC61) | `gateway/document-result-grade.js`, `batch-journal-store.js`, `batch-reconciliation.js`, `batch-mapping-maintenance.js`, `mapping.js` und die direkten Journal-, Intake-, Verarbeitung-, Review-, Mapping-, Outbox-, Recovery- und Manipulationstests belegen `datasecure-batch/2` sowie Mapping CSV/Outbox V2. Positive Grade sind write-once an ein erneut verifiziertes V3-Paket gebunden; `not-processed` trägt exakt den terminalen Grundcode. Crashs zwischen Paket, Journal, Outbox, CSV und Terminalzustand bleiben idempotent reparierbar. Historische V1-Journale, V2-Pakete und V1-Mappings bleiben ohne erfundenen Grad lesbar. Evidence/Receipt, Stapelabschluss, Results/Progress, Cowork sowie E1/E3 bleiben offen. |
| BL-049.1b2 Evidence/Receipt (E0-Teilnachweis RC62) | `gateway/document-result-grade.js`, `batch-evidence.js`, `batch-terminal-evidence.js`, `audit.js`, `orchestrator.js` und die direkten Reason-Code-, Evidence-, Marker-, Audit-, Recovery-, Gateway-, Batch- und MCP-Tests belegen: `datasecure-batch-evidence/3` aggregiert ausschließlich erneut paketverifizierte Grade und zwei erlaubte Auslassungsarten; `data-secure-audit-receipt/4` trägt exakt den positiven V3-Manifestgrad. Pending-Marker werden bei Wiederanlauf frisch abgeleitet, unbekannte Codes zu `INTERNAL_FAILURE` vergröbert und Legacy nie nachklassifiziert. Stapelabschluss, Results/Progress, Cowork sowie E1/E3 bleiben offen. |
| BL-049.1b2 Ergebnisprojektion (E0-Teilnachweis RC63) | `gateway/batch-result-projection.js`, `batch-progress.js`, `batch-results.js`, `batch-worker.js`, `batch-executor.js`, `package-store.js`, `local-only-handoff.js` und `companion/completion-summary.js` belegen eine einzige fail-closed Projektion. Terminaler V2-Progress und Results prüfen positive Grade erneut gegen das V3-Paket; Legacy und offene Zustände bleiben `unavailable`. Der vorhandene lokale Abschlussdialog zeigt drei Grade und zwei visuelle Auslassungszähler genau einmal. Der normale Cowork-Handoff entfernt weiterhin IDs, Fähigkeiten und Cursor, trägt pro Markdownfragment den verifizierten positiven Grad und die Stapelaggregate nur auf der ersten Seite. Direkte Projektions-, Tamper-, IPC-, UI-, Results-, Paging- und Capabilitytests belegen die Grenzen; E1/E3 bleiben offen. |
| BL-049.1b2 Paketidentitätsbindung (E0-Teilnachweis RC65) | `gateway/package-identity.js`, `batch-terminal-evidence.js`, `batch-progress.js`, `batch-reconciliation.js` und die Projektionsgrenze speichern ausschließlich im privaten Checkpoint exakte BigInt-Identitäten von Manifest und Markdown nach einer stabilen Vorher-/Nachher-Erfassung um die vollständige terminale Paketprüfung. Spätere öffentliche Zählungen prüfen genau zwei Metadatensätze je Paket statt Inhalte erneut zu hashen; Fehlen, Linkstatus und Abweichung ergeben fail-closed `unavailable`. Abschluss und Cowork-Handoff übernehmen denselben Progresswert, Results und Lesepfad behalten die vollständige Paketverifikation. Direkte Missing-/Unsafe-/Mismatch-/BigInt-/100-Pakete-Tests sowie Privacy-, Diagnose- und Integrationsgates belegen O(n), kein Voll-Hashing und keine Offenlegung der privaten Identitäten; E1/E3 bleiben offen. |
| BL-049.1b2 OPC-Interoperabilität (E0-Teilnachweis RC64) | `gateway/opc-source-validator.js`, realistischere `tests/lib/opc.js`-Fixtures und 12 direkte OPC-Tests belegen die vollständige Beziehungstypklassifikation ohne Namensraum-Teiltreffer. Standard-Paketmetadaten, Signaturursprung, sichere relative interne Ziele und enthaltene interne Hyperlinks bleiben Kandidaten; externe Ziele, Root-Escapes, OLE/Package, VBA, Attached Templates, External Links, Custom UI und ActiveX stoppen. Die Admission-Gegenprobe umfasst alle 111 synthetischen UAT-Eingänge; XLSX und PPTX bleiben gesperrt. E1/E3 bleiben offen. |
| BL-051.3/BL-052.1/BL-052.3 RC63-UAT-Vorbereitung (E0) | `generate_synthetic_acceptance_data.py`, `fixture-layout.json`, `requirements.txt`, `RC63_UAT_TEST_KIT/README.md`, `STEP-BY-STEP.md`, `EXPECTED_RESULTS.csv`, `EVIDENCE_LOG.csv` und `test-rc63-uat-kit-contract.js` liefern einen einzigen reproduzierbaren Weg zu exakt 111 synthetischen Eingängen (4 positiv, 2 Review, 5 gesperrt, 100 Batch). Pfade, Gruppenzähler und tatsächliche Preflight-Codes sind maschinengeprüft; Build- und Produktversion bleiben für die prüfende Person leer. Menschliche E1/E2/E3-Abnahme bleibt ausdrücklich offen. |
| BL-011.8 (Teilnachweis) | `gateway/common.js`, `gateway/batch.js` und `test-batch-session.js` belegen zentrale literale Kindverzeichnisse, wiederholte Link-/Containment-/Geräte-/Inode-Prüfung, einen echten Windows-Junction-Stopp sowie reale Austauschproben direkt vor Snapshot und Recovery und einen verschachtelten Linkstopp vor Cleanup. Das Cleanup verwendet keine rekursive OS-Löschung mehr, sondern lstat-/inode-gebundene Einzelobjekt-Entfernung. Gerettete und externe Daten bleiben unverändert. Native sonstige Reparse-Attribute, echte POSIX-Matrix und vollständig handle-relative Löschprimitive bleiben offen. |
| BL-011.9 (Teilnachweis) | `native/ocr/pilot/posix-sandbox.c`, `server/posix-supervisor.js`, `runtime.js`, `scripts/lib/posix-supervisor-artifacts.mjs`, `scripts/build-plugin.mjs`, `scripts/build-mcpb.mjs`, `contracts/POSIX_SUPERVISOR_PACKAGING_V1.md`, `test-posix-supervisor.js` und `test-posix-supervisor-packaging.mjs` pinnen CPU-, Core-, Adressraum-, Daten-, Dateigrößen-, Dateideskriptor-, RSS- und Wallclockgrenzen, Prozessgruppe/Reaping und einen inhaltsfreien Vertragsmarker. Der allgemeine Parser nutzt einen vorhandenen POSIX-Supervisor nur nach fester Zielauflösung, no-link Binär-/Hash-/Format- und Contract-Prüfung; ein vorhandenes defektes Artefakt stoppt ohne Parser-Spawn. ZIP- und MCPB-Builds verweigern jede unvollständige, verlinkte, falsch formatierte oder falsch gehashte zukünftig vorhandene POSIX-Zielanlage und setzen nur deren Ausführmodus. Paketierte Zielbinärhashes sowie adversariale macOS-/Linux-Proben bleiben offen. |
| BL-010.8 (Teilnachweise, kein Release) | Gepinnter Launcher-Vertrag, historischer Windows-Doppelbuild und erneuter MCP-Start PASS. RC69 ergänzt begrenzte source-gebundene V2-Assembly, sichere Ausgabe und Modetests; echte TXT-/DOCX-Verarbeitung per SEA FAIL. `test:sea-gates` belegt den NO-GO-Status, keine erfolgreiche Workerisolation. Produktumschaltung bleibt bis zu technischem Workerfix UND Zielsystem-/Lifecycle-Nachweisen geschlossen. |
| BL-011.5 | `gateway/batch.js`, `gateway/batch-maintenance.js`, `index.js`, `test-batch-session.js` und `test-batch-maintenance.js` belegen sofortige oder nachgelagerte, reguläre-Datei-gebundene Arbeitskopienbereinigung, eine globale Owner-Sperre für Startup-Recovery und periodische Ablaufbereinigung, begrenztes sechs-stündiges Scheduling, Fehlerisolation und das einmalige Stoppen beim Server-Shutdown; ein lebender Batch wird weder umklassifiziert noch bereinigt |
| BL-011.7 (Teilnachweis) | `gateway/batch.js`, `gateway/status.js`, der Dokument-Skill sowie Batch-/MCP-Tests belegen einen inhaltsfreien Aktiv-Wahrheitswert, der konkurrierende Auswahl- und Fortsetzungsdialoge verhindert. Seit RC64 ist die Crash-Recovery-Evidenz aus dem Repository reproduzierbar: `tests/lib/crash-batch-worker.js` ist getrackte Testquelle statt einer unversionierten Datei unter dem pauschal ignorierten `tests/fixtures/`, und `test-batch-session.js` läuft mit 67 von 67 Fällen einschließlich Absturz und Fortsetzung an Position 1, 50 und 100 ohne Doppelfreigabe. `test-architecture-contracts.js` prüft, dass jedes von einem Test über einen literalen Pfad adressierte Projektskript existiert und getrackt ist, damit dieselbe Lücke nicht erneut entsteht. Beobachtete Gebrauchstauglichkeit auf den Zielsystemen bleibt E1/E2. |
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
| BL-042.2 (E0-Nachweis) | `server/index.js`, `test-mcp-tool-annotations.js` und `test-mcp-protocol.js` belegen für alle 25 Tools Titel und vollständige boolesche read-only/destruktiv/idempotent/open-world Annotationen einschließlich eigener Klassen für Verarbeitung, Review, Bestätigung, Verwerfen und Purge. Echte Cowork-Manual-/Auto-/Skip-Abnahme bleibt offen. |
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
| BL-011.10 (Teilnachweis) | `gateway/batch-executor.js`, `gateway/batch-worker.js`, `gateway/status.js`, `companion/completion-summary.js`, der Direct-Picker in `server/index.js`, `test-direct-picker-batch.js` und `test-direct-picker-intake-worker.js` belegen, dass die ausgewählte Queue ausschließlich per privater IPC an einen isolierten Worker geht, dieser vor Verarbeitung seine Ausführungsberechtigung beansprucht und die Elternseite IPC nicht vor seinem Abschluss trennt. Ein öffentlicher, inhaltsfreier Intake-Marker verhindert währenddessen eine zweite Dateiauswahl. Vor/nach Checkpoint sind nur zwei feste lokale Fehlerhinweise möglich; sie enthalten keine Quellmetadaten und verändern keinen Batchzustand. Der Exit-vor-Terminal-IPC-Race ist als deterministischer Test nachgestellt; ein kurzes Präsentations-Drain-Fenster unterdrückt den falschen Fehlerhinweis. Der MCP-Aufruf gibt im `local_only`-Weg keinen Batch-Token zurück; ein echter Child-Process-Test endet mit einem freigegebenen, inhaltsfreien Status. Reale Antwortzeit-, Crash- und Drei-OS-Evidenz bleiben offen. |
| BL-041.7 (E0-Nachweis) | `server/index.js`, `gateway/local-only-handoff.js`, `gateway/package-store.js` und `companion/completed-batch-picker.js` trennen 8 normale Cowork-Werkzeuge von 17 zusätzlichen Supportwerkzeugen über `EU_PRIVACY_SUPPORT_MODE=1`; insgesamt bleiben 25. `open_input_folder`, `begin_document_batch` und `start_document_batch_processing` sind vollständig aus der aufrufbaren Oberfläche entfernt. Der tokenbasierte synchrone Review ist Support; die normale Fortsetzung startet eine erforderliche Fachprüfung tokenfrei im lokalen Worker. `test-cowork-tool-surface-contract.js`, `test-cowork-documentation-contract.js` und der Manifesttest blockieren Drift. Der Handoff hält Auswahl, Kennungen, Cursor und kurzlebige Leseberechtigungen nur lokal, gibt höchstens fünf Ergebnisse je Schritt aus und dekodiert kleine verifizierte Dokumente einmalig; größere Ergebnisse nutzen ein begrenztes Indexfenster. Buffer/Index werden bei Bestätigung, Abbruch, Ablauf und Fehler best-effort überschrieben. Unicode-/Surrogatpaare bleiben vollständig; Seiten- und Bestätigungsfehler verwerfen fail-closed. Beobachtete Cowork-UI-Abnahme bleibt offen. |
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
Damit ist ein syntaktisch valider Graph mit Lücken im erzeugten Markdown kein
akzeptierter Coverage-Nachweis. Dies beweist allein nicht, dass der Parser alle
Inhalte des Originaldokuments extrahiert hat.

RC69 (BL-020.1/BL-020.2/BL-022.1): Die Parsergrenze bindet das Graphformat an die
vertrauenswürdige Eingabeextension und Bildlocators exakt an Attachment-Quellteile.
MIME-Typen werden unabhängig typgeprüft; Schema und Runtime sperren Steuerzeichen,
Unicode-Zeilentrenner und nichtkanonische `!/`-Ketten. 17 Graph-Testgruppen enthalten
1.200 Fälle gegen einen unabhängigen Segmentvergleich; 17 Isolationstests prüfen
auch Format-Substitution über drei injizierte Plattformverträge. Der Fake-Worker
lässt vor seinem Abschluss reale Stream-Flush-Callbacks laufen; EPIPE und
unvollständige Übertragung bleiben gesperrt. Das 1.000-Knotenlimit greift vor Aufbau.
DOCX-Story-/Differentialtests ergänzen den getrennten Original-Inhaltserhaltnachweis
für verschachtelte Tabellen und Text neben Textfeldern. Keine neue Formatfreigabe.

`test-docx-structure.js` ergänzt 30 Prüfgruppen mit Body, Header, Footer,
Kommentaren, Fuß- und Endnoten, 48 missgebildeten Story-Kombinationen, 5.000
flachen Zeilen sowie Tiefen-/Ausgabebudgets. Namen und Kontakte in zuvor
verlorenen Positionen werden nach Extraktion de-identifiziert; Scrum.org-PSPO-I
und Health-IT-Fachtext bleiben erhalten. Das Mammoth-Orakel umfasst jetzt
96 reguläre und 24 verschachtelte Tabellendokumente sowie 16 Textfelddokumente.
Mammoth ignoriert moderne `wps`-Textfelder: nur äußere Läufe werden damit
verglichen, innere Texte haben separate feste Sollwerte. Kein Vollrenderer-
oder realer Word-Generator-Nachweis. `npm run test:parser-contract` ist als
Posttest in `test:ci` integriert; `npm test` enthält die Strukturtests ebenfalls.

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
