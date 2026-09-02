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
| H-02 | P1 | „Worker-IPC-ACK“ ist nur der `child.send`-Callback (Nachricht verlassen, nicht vom Worker verarbeitet): ein vor dem Lesen sterbender/hängender Worker liefert trotzdem `local_intake_handoff_confirmed` (`gateway/batch-executor.js:436–455`, `batch-worker.js`) | BL-040.5, BL-043.1, DS-043 | IN_ARBEIT | Repro: Worker ohne Message-Listener → ACK nach 1 ms aufgelöst. Soll: Worker sendet `local-intake-accepted`; Startantwort erst danach, weiter begrenzt auf 5 s. |
| H-03 | P1 | `test:product` lässt 27 produktrelevante Stapel-/Recovery-/Review-/Export-Tests aus; `test-batch-intake-reservation.js`, `test-batch-pseudonym-context.js`, `test-storage-capacity.js`, `test-image-sanitizer.js`, `test-zip-permissions.mjs` hängen in keinem npm-Skript (`tests/run-product-suite.js`) | BL-002, BL-051.1 | OFFEN | Alle verwaisten Produkttests einzeln grün (02.09.2026); Baseline `npm run test:fast-path` grün. Soll: Aufnahme in `fullOnly`/`ciFiles`. |
| H-04 | P3 | `tests/test-architecture-contracts.js` ist veraltet (erwartet `verifyPosixSupervisorArtifacts` in `build-plugin.mjs`), in keinem Skript, schlägt fehl | BL-002 | OFFEN | Reproduziert (`node tests/test-architecture-contracts.js` → ERR_ASSERTION). |
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
