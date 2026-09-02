# Claude-Code-Arbeitsledger RC86

Stand: 02.09.2026 · abgeleitet, nicht kanonisch

Dieses Ledger steuert ausschließlich den aktuellen Auftrag
[`CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md`](CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md).
Das verbindliche Produktbacklog bleibt ausschließlich
[`docs/canonical/BACKLOG.md`](../docs/canonical/BACKLOG.md). Claude Code trägt je
Item Status, Evidenz, Commit oder Blocker ein; neue Produktanforderungen gehören
nicht ungeprüft hierher.

Statuswerte: `OFFEN`, `IN_ARBEIT`, `ERLEDIGT`, `BLOCKIERT`, `VERWORFEN`.

| ID | Priorität | Prüfpaket / Lieferung | Kanonische Zuordnung | Startstatus | Evidence / Commit |
|---|---|---|---|---|---|
| CC-01 | P0 | Startzustand, sauberer `main`, Versionen und Dokumentenrangfolge belegen | BL-001, BL-002 | ERLEDIGT | 02.09.2026: `git pull --ff-only origin main` e7aa1d1→487f1db (fast-forward, Arbeitsbaum sauber); Produkt 3.2.0-rc86; Node v24.18.0; npm 11.16.0; Claude Code CLI 2.1.233; Windows 11 Pro 10.0.26200. Kanon in Registerreihenfolge vollständig gelesen (CLAUDE.md, README/Register, DS-001–069, Vision, Produkt, Zielarchitektur, Refactoring-Plan, Backlog, Iststand, Traceability, Evidence-Matrix, TARGET_CAPABILITIES, HOST_MATRIX, OSS-Register, 15 aktuelle Verträge, abgeleitete Dokumente, UAT-Kit, beide Skills, Manifeste, Build-/ZIP-Skripte). Baseline vor Änderungen: `npm run test:docs` PASS, `npm run test:skills` PASS, `git diff --check` sauber. |
| CC-02 | P0 | Aktuelle offizielle Claude-/Cowork-/Plugin-/MCP-Verträge revalidieren; Herstellerbeleg und Ableitung trennen | BL-002, BL-010.7, BL-041.7 | OFFEN | – |
| CC-03 | P0 | End-to-end Privacy-/Security-/Prompt-Injection-/Originalschutz-Review | BL-011, BL-020, BL-030, BL-040, BL-049 | OFFEN | – |
| CC-04 | P0 | Ergebnisordner, Exportidentität, Rootwechsel, Replay, Manipulation, TOCTOU und Output-als-Quelle challengen | BL-040.5, BL-044.1 | OFFEN | – |
| CC-05 | P0 | Worker-ACK, Timeout, Abbruch, Crash, Resume, Review, Mapping und genau-ein-Stapel prüfen | BL-011.8, BL-011.10, BL-012.9, BL-043.1 | OFFEN | – |
| CC-06 | P1 | UX ohne Bestätigungsorgie, klare Dateien, Sammelreview, Ergebnisauffindbarkeit und Supportweg prüfen | BL-012, BL-041, BL-043 | OFFEN | – |
| CC-07 | P1 | TXT/Markdown/CSV/DOCX-Detektion und Parser-/Containergrenzen adversarial prüfen | BL-020.1, BL-020.2, BL-021, BL-022.1, BL-031, BL-032 | OFFEN | – |
| CC-08 | P1 | Batchperformance, Eventloop, Speicher-/Zeitgrenzen und sichere serielle Standardverarbeitung prüfen | BL-011.12, BL-047.1, BL-050.3 | OFFEN | – |
| CC-09 | P1 | ZIP/Marketplace/Runtime/Manifest/SBOM/Prüfsummen/Offline-/Dateimodus-Parität prüfen | BL-010, BL-024.2, BL-051 | OFFEN | – |
| CC-10 | P1 | Status-App terminale Zustände, Fallback, A11y und CWD-/Build-Reproduzierbarkeit vervollständigen | BL-042.3 | OFFEN | – |
| CC-11 | P1 | DOCX-Realitätskorpus und AlternateContent-/Kommentar-/Header-/Footer-Policy vervollständigen | BL-022.1 | OFFEN | – |
| CC-12 | P1 | OCR-Engineeringbundle vollständig prüfen, ohne gesperrte Bild-/PDF-Produktfreigabe | BL-024.2, BL-023, BL-024.3 | OFFEN | – |
| CC-13 | P1 | Kanon, README, Anleitung, IT, Security, Release, Testing, UAT und Traceability gegen Code synchronisieren | BL-001, BL-002, BL-003 | OFFEN | – |
| CC-14 | P1 | Vollständige lokale Regression, Build, ZIP-Verifikation und Claude-CLI-Validierung | BL-002, BL-051.1 | OFFEN | – |
| CC-15 | P1 | Unabhängigen Gegencheck nach Fixes, Abschlussbericht und sauberen unpushed `main` liefern | BL-002 | OFFEN | – |

## Konsolidierte Findings (Hauptsession, revalidiert)

Quellen: `A-*` cowork-plugin-reviewer, `B-*` privacy-threat-reviewer, `C/D/E-*`
runtime-quality-reviewer, `H-*` Hauptsession. Nur reproduzierte Findings; verworfene
Vermutungen stehen im Bericht. Statuswerte wie oben.

| ID | Prio | Befund (Datei) | Kanon | Status | Fix / Evidence |
|---|---|---|---|---|---|
| H-01 | P2 | Beschädigter/konfligierender Export-Record oder liegengebliebene `.tmp` lässt `exportCompletedState` werfen bzw. Replay-Fehler zählen; Worker präsentiert abgeschlossenen Stapel als „angehalten“ (`gateway/result-export.js`, `batch-worker.js`, `review-worker.js`) | BL-040.5, DS-069 | ERLEDIGT | Repro: eigenes Skript (Record `{"schema":"garbage"}` → `RESULT_EXPORT_STATE_UNSAFE`; Journalkonflikt → `RESULT_EXPORT_STATE_CONFLICT`; stale `.tmp` → `failures: 2`). Fix: fail-closed `pending`, `terminalVisibleExport`. Tests: `test-result-folder-export.js` erweitert; `test:executor-lifecycle`, Intake-Worker, Review-Executor, Launcher grün. |
| H-02 = C-01/E-01 | P1 | „Worker-IPC-ACK“ ist nur der `child.send`-Callback (Nachricht verlassen, nicht vom Worker verarbeitet): ein vor dem Lesen sterbender/hängender Worker liefert trotzdem `local_intake_handoff_confirmed` (`gateway/batch-executor.js:436–455`, `batch-worker.js`) | BL-040.5, BL-043.1, DS-043 | ERLEDIGT | Repro Hauptsession (Worker ohne Listener → ACK nach 1 ms) und Reviewer (Callback 6 ms vs. Empfang 3038 ms). Fix: Worker sendet `local-intake-accepted`; nur diese Hülle bestätigt, 5 s Grenze, Exit vor Bestätigung lehnt sofort ab. Tests: `test-batch-executor-startup.js` 27/27 (3 neue Fälle), realer Worker, Picker-Lifecycle, `test:recovery`, `test:delivery`, MCP-Protokoll grün. CURRENT_STATE/TRACEABILITY angepasst. |
| H-03 | P1 | `test:product` lässt 27 produktrelevante Stapel-/Recovery-/Review-/Export-Tests aus; `test-batch-intake-reservation.js`, `test-batch-pseudonym-context.js`, `test-storage-capacity.js`, `test-image-sanitizer.js`, `test-zip-permissions.mjs` hängen in keinem npm-Skript (`tests/run-product-suite.js`) | BL-002, BL-051.1 | OFFEN | Alle verwaisten Produkttests einzeln grün (02.09.2026); Baseline `npm run test:fast-path` grün. Soll: Aufnahme in `fullOnly`/`ciFiles`. |
| H-04 | P3 | `tests/test-architecture-contracts.js` ist veraltet (erwartet `verifyPosixSupervisorArtifacts` in `build-plugin.mjs`), in keinem Skript, schlägt fehl | BL-002 | OFFEN | Reproduziert (`node tests/test-architecture-contracts.js` → ERR_ASSERTION). |
| B-01 | P1 | Unterredaktion: `CONTACT_URI_RE` ohne `@`; Span gewinnt gegen EMAIL, Verlierer wird verworfen → bei `mailto:` bleibt die (persönliche) Domain in `general`/`contract`/`customer` stehen, Residual-Gate blind (`privacy/base.js:52`, `structured.js:43`, `spans.js:36`) | BL-021.1, DS-045, DS-049 | ERLEDIGT | Repro Reviewer-Skript: 8 überlebende Domains → nach Fix 0. Fix: Zeichenklasse um `@`/Unicode erweitert; Negativtest über alle fünf Profile in `test-pii-regression.js` (107/107). PII-, Text-, CSV-, Adversarial-, Credential-, Korpus-, Skill-Matrix- und 2000er-Sweep grün. |
| B-02 | P2 | OPC-Partnamen in anderer Groß-/Kleinschreibung (`word/Comments.xml`, `Word/Document.xml`) umgehen den DOCX-Coverage-Gate: Story wird weder gerendert noch gemeldet, Grad `complete` (`ooxml.js:772,844,897`, `opc-source-validator.js:279`, `zip-reader.js:261`) | BL-022.1, DS-045, DS-049 | ERLEDIGT | Reviewer-Fixtures nach Fix: `Comments.xml`/`FOOTNOTES.xml` → Coverage-Warnung, kein Rendering; `Word/Document.xml` → `SOURCE_CONTAINER_CORRUPT`. Fix: kanonische Schreibweise Pflicht (`ooxml.js`), case-insensitive Duplikatsperre (`zip-reader.js`); Negativtests in `test-docx-structure.js`. |
| B-03 = C-05 | P2 | Abgeschlossene Export-Records werden bei jedem Start/Zielwechsel erneut ausgeführt: gelöschte sichtbare Ergebnisse werden wiederhergestellt, komplette Historie wird in jeden neuen Zielordner gespiegelt, Startup re-hasht alle je exportierten Dateien synchron (`result-export.js` `replayPendingResultExports`) | BL-040.5, DS-069, DS-023 | OFFEN | Reviewer B/C unabhängig; widerspricht DS-023 („bis der Anwender sie selbst löscht“) und DS-069 (Wiederholung nur für fehlgeschlagene Exporte) |
| B-04 | P3 | Unicode-Kompatibilitätsvarianten (Fullwidth `＠`, `․`, Fullwidth-Ziffern) umgehen E-Mail-/IBAN-/Telefon-Detektoren und Residual-Gate (`privacy/base.js:271`) | BL-021.1, DS-049 | OFFEN | 5 Varianten reproduziert; NFKC-Faltung verändert Fachinhalt → Design nötig |
| B-05 = E-02 | P3 | Output-als-Quelle-Gate unvollständig: nur Ordnerpicker; Dateipicker akzeptiert `DataSecure-Output/Lauf-*/`-Dateien; 8.3-Alias; ungültiger Konfigrecord schaltet Schutz ab (`source-folder.js:98`, `file-picker.js`, `result-folder-config.js:44`) | BL-044.1, BL-040.5, DS-069 | OFFEN | reproduziert (Reviewer B a/c) |
| B-06 | P3 | Ordnerauswahl schreibt immer den relativen Quellpfad (oft Personennamen als Ordner) ins dauerhafte Mapping, auch bei eindeutigen Basenamen (`source-folder.js:90`) | DS-058, BL-044 | OFFEN | reproduziert |
| B-07 | P3 | Supportweg `review_deferred_document_batch` rekonstruiert Rohtext im MCP-Hauptprozess ohne `network-deny` (`index.js:307`) | BL-020.3 | OFFEN | nur Supportmodus |
| C-02 | P2 | Zwei lebende Executor auf zwei Stapeln möglich: `continue_most_recent_document_batch` prüft weder `batch_processing_active` noch Intake-Reservierung; `claimLocalBatchExecutor` prüft nur dasselbe Journal; zweiter Worker stoppt am Item-Lock mit irreführender „gestoppt“-Notiz (`batch-executor-lease.js:37`, `index.js:283`) | BL-011, BL-011.3, DS-022 | ERLEDIGT | Codepfad revalidiert (Lease prüft nur eigenes Journal; Fortsetzung ohne Aktivitätsprüfung). Fix: `batch_active`-Guard in `continue_most_recent_document_batch`, `otherLiveExecutor`-Gate im Claim. Tests: Lease 10/10 (neuer Fall), Active-Lock, Runner, Continuation, MCP-Protokoll, Gateway-E2E, `test:recovery` grün. |
| C-03 | P2 | PID-Wiederverwendung: Liveness nur `kill(pid,0)`; gespeicherte Startzeit wird nie geprüft; toter Lock kann durch Fremdprozess „lebendig“ wirken (`process-liveness.js`, `batch-executor-lease.js:51`) | BL-011.11, DS-022 | OFFEN | kein portabler Prozess-Startzeit-API ohne neue Plattformhelfer; Design + E1 nötig |
| C-06 | P3 | Synchrones SHA-256 im MCP-Listing-Pfad (`batch-results.js:76` → `common.js:177`) neben asynchronem Snapshot-Hash | BL-047.1 | OFFEN | |
| C-07 | P3 | Resume-/Review-Start melden Erfolg ohne IPC-Bestätigung (`batch-executor.js:276,526`) | BL-043, BL-012.3 | OFFEN | synchrone API; Folgearbeit zu H-02 |
| C-08 | P3 | Kill nach ACK-Timeout mitten im Kopieren lässt bis 500 MiB Arbeitskopien bis Intent-Ablauf liegen (`batch-intake-intent.js:87`) | BL-011.8, DS-020 | OFFEN | innerhalb DS-067 |
| C-09 | P3 | macOS ohne harte Prozesslimits (kein `native/macos-*`) | BL-011.9, BL-011.6 | OFFEN | menschliche Evidenz |
| D-01 | P1 | Build auf diesem Host nicht ausführbar: devDependencies teilinstalliert (esbuild, axe-core, ext-apps fehlten), kein Node-22.23.2-Archiv | BL-010.8, BL-051, DS-060 | IN_ARBEIT | Nutzerfreigabe: Archiv (SHA-256 geprüft) → `runtime:target` grün; `npm ci` Exit 0. Build/ZIP-Gate folgt. |
| D-02 | P1 | Marketplace-Quellordner ≠ Produkt-ZIP: `command: node`, 57,6 MiB OCR-Baum (> 50-MiB-Limit), kein Runtime; CURRENT_STATE/README/ANLEITUNG/THIRD_PARTY_NOTICES nennen Marketplace als belegten Nutzerkanal (RELEASE.md: „nur Entwicklung“) | BL-010.8, BL-051.2, DS-002, DS-053, DS-067 | OFFEN | Fix: Doku ehrlich (Marketplace = Zielkanal, Release blockiert bis self-contained Projektion) + Vertragstest |
| D-03 = H-03 | – | siehe H-03 | | | |
| D-04 | P3 | `BUILD_INFO.build_date` 2026-09-01 vs. Kanonstand 02.09.2026 | BL-002 | OFFEN | |
| D-05 | P3 | Dateimodi/SBOM/Prüfsummen nur skriptseitig belegt; kein rc86-ZIP | BL-010 | OFFEN | wird durch Build-Gate erledigt |
| E-03 | P3 | „34.845.038 Byte“ nicht lokal verifizierbar | BL-010.8 | OFFEN | durch Build messen |
| E-04 | P3 | 6-MiB-Yield-Test prüft nur `turns > 0` | BL-047.1 | OFFEN | dokumentieren |
| A-01 | P2 | Cloud-Sync-Hinweis existiert nur als MCP-Flag `sync_folder_notice`; weder lokaler Dialog noch Skill nennen ihn (`index.js`, `normal-path-response.js`, `SKILL.md:23,42`) | DS-069, BL-041.10 | OFFEN | vom Reviewer belegt; Revalidierung Hauptsession folgt |
| A-02 | P2 | `result_folder_required` verschluckt Ursache („kein Ordner gewählt“ obwohl gewählt) und fehlt im Skill (`index.js:198–203`, `SKILL.md:20`) | DS-069, BL-041.10, BL-012.6 | OFFEN | vom Reviewer belegt |
| A-03 | P2 | Anwender-/IT-Doku nennt weder Cloud-Standard von Cowork noch `isLocalDevMcpEnabled`/Org-Schalter; „Kein Picker“-Hinweis ohne Sitzungsmodus | DS-066, BL-010.7, BL-051.6 | OFFEN | Herstellerbeleg 02.09.2026 |
| A-04 | P3 | „gleichnamiger Skill“ existiert nicht; Trigger-Phrase fehlt in `description` | BL-041.4, BL-012.6 | OFFEN | |
| A-05 | P3 | Anleitung/IT nennen nicht existierende Bedienelemente; Fortsetzungsphrasen uneinheitlich (Dialog vs. Anleitung) | BL-012.2, BL-012.6 | OFFEN | |
| A-06 | P3 | `configure_result_folder` durch vertagte Stapel blockiert, Meldung ohne Ausweg (`index.js:144`) | DS-043, DS-069 | OFFEN | |
| A-07 | P3 | Tests bezeichnen 200-Zeichen-/2-KB-Grenzen als „documented“, offiziell nicht belegt (`test-manifest.js:70–82`) | BL-002 | OFFEN | |
| A-08 | P3 | Toter Vertragstext `HOST_GATE_TEXT` widerspricht „ohne Vorabwerkzeug“ (`prompt-contract.js:12`) | DS-040, BL-002 | OFFEN | |
| A-09 | P3 | UAT-04 „nicht auswählbar“ auf Windows nicht belastbar (getippter Dateiname passiert Filter, Stopp erst serverseitig) | BL-052.1, BL-049.1 | OFFEN | |
| A-10 | P3 | Supportmodus-Aktivierung (`EU_PRIVACY_SUPPORT_MODE`) im Produktpaket nicht dokumentiert/updatefest | BL-042, DS-048 | OFFEN | |
| A-11 | P3 | Evals/MCPB-Manifest ohne DS-069-Abdeckung | BL-041.10 | OFFEN | |

## Vorbekannte Prüfhinweise, keine ungeprüften Findings

- Ein ungültiger Ergebnisordner darf erst nach erfolgreicher Anlage/Prüfung von
  `DataSecure-Output` gespeichert werden.
- Ein Zielwechsel oder gelöschtes/manipuliertes sichtbares Ergebnis muss zu
  ehrlichem Replay beziehungsweise Stopp führen, nicht zu `available:true`.
- Rekursive Auswahl eines Cowork-Roots darf `DataSecure-Output` nicht erneut als
  Quelle aufnehmen.
- Worker-IPC-ACK muss begrenzt sein; verspätete Callbacks und Abbruch dürfen einen
  neuen Lauf nicht beeinflussen.
- Die Rest-TOCTOU-Grenze des sichtbaren Exportpfads ist adversarial zu prüfen.
- Menschliche Windows-/macOS-/Cowork-Evidenz ist keine Aufgabe dieses Ledgers und
  darf nicht als bestanden markiert werden.
