# Claude-Code-Gesamtgegenreview RC86 – Abschlussbericht

Stand: 02.09.2026 · Ausgangsprodukt 3.2.0-rc86 · abgeleitet, nicht kanonisch ·
Auftrag: [`CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md`](CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md) ·
Ledger: [`CLAUDE-CODE-ARBEITSBACKLOG-RC86.md`](CLAUDE-CODE-ARBEITSBACKLOG-RC86.md)

## 1. Rahmen

| Punkt | Wert |
|---|---|
| Start-Commit | `487f1db` (`docs: prepare Claude Code comprehensive review`), `main`, Fast-Forward von `e7aa1d1`, Arbeitsbaum sauber |
| End-Commit | der abschließende Dokumentationscommit des Folgeauftrags, siehe Abschnitt 7 (18 Commits seit `487f1db`, alle lokal, **nicht gepusht**) |
| Produktversion | 3.2.0-rc86 in `package.json`, `plugin.json`, `VERSION`, `version.js`, `manifest.json`, `BUILD_INFO.json` |
| Host | Windows 11 Pro 10.0.26200, MSYS-Shell; Node v24.18.0; npm 11.16.0; Claude Code CLI 2.1.233 |
| Netz | offizielle Herstellerquellen am 02.09.2026 abgerufen; `node-v22.23.2-win-x64.zip` (SHA-256 `1177b413…99f97`, gegen Runtime-Vertrag geprüft) und `npm ci` nach ausdrücklicher Nutzerfreigabe |
| Nicht getan | kein Push, keine GitHub Actions, keine Branchwechsel, keine Force-/Reset-Operationen, keine produktiven Daten |

### Gelesene Quellen

Kanon in Registerreihenfolge (`CLAUDE.md`, `docs/canonical/README.md`,
`DOCUMENT_REGISTER.md`, `DECISIONS.md` DS-001–DS-069, `PRODUCT_VISION.md`,
`PRODUCT.md`, `TARGET_ARCHITECTURE.md`, `REFACTORING_PLAN.md`, `BACKLOG.md`,
`CURRENT_STATE.md`, `TRACEABILITY.md`, `BACKLOG_EVIDENCE_MATRIX.md`,
`TARGET_CAPABILITIES.json`, `HOST_MATRIX_V1.json`, `OPEN_SOURCE_COMPONENTS.md`),
alle 15 aktuellen Verträge unter `contracts/`, Root-`README.md`, `SECURITY.md`,
`docs/ANLEITUNG.md`, `ANWENDERREVIEW.md`, `IT-BETRIEBSHANDBUCH.md`,
`PLUGIN_SECURITY_MODEL.md`, `RELEASE.md`, `TESTING.md`,
`FORMAT_COVERAGE_MATRIX.md`, `REVIEW_CLAUDE_COWORK_2026-09-01.md`, das gesamte
`docs/acceptance/UAT_TEST_KIT`, beide Skills mit Referenzen, `package.json`,
`manifest.json`, `BUILD_INFO.json`, `plugin.json`, `.mcp.json`,
`marketplace.json`, Build-/ZIP-/SBOM-Skripte, `run-product-suite.js` sowie der
MCP-Server-Kern (`index.js`, Batch-Executor/-Worker/-Intake/-Lease/-Recovery,
Result-Export/-Config, Picker, Completion-Summary, Handoff, ZIP-/OOXML-Parser,
Privacy-Engine).

## 2. Subagenten

Die drei versionierten Rollen aus `.claude/agents/` wurden read-only ausgeführt.
Beobachtung: Beim Start waren sie in dieser Session **nicht als Subagententypen
registriert**; die Rollen wurden deshalb wörtlich (Systemtext der Agentdatei) über
`general-purpose`-Agenten mit striktem Read-only-Auftrag ausgeführt und die
Einhaltung per `git status` geprüft (keine Repo-Änderung durch Agenten). Beim
Gegencheck nach den Fixes standen die Typen `runtime-quality-reviewer` und
`privacy-threat-reviewer` zur Verfügung und wurden direkt verwendet.

| Rolle | Auftrag | Laufzeit | Ergebnis |
|---|---|---|---|
| cowork-plugin-reviewer | Prüfpaket A, Herstellerabgleich (11 Quellen), CLI-Validierung | ~8 min | A-01…A-11 (2× P2, 9× P3), 22 Herstellerbelege |
| privacy-threat-reviewer | Prüfpaket B, adversariale Fixtures (r1–r7) | ~16 min | B-01 (P1), B-02/B-03 (P2), B-04…B-07 (P3) |
| runtime-quality-reviewer | Prüfpakete C, D, E, Testprotokoll | ~14 min | C-01…C-09, D-01…D-05, E-01…E-05 |
| Gegencheck (runtime + privacy) | Read-only-Prüfung der 13 Fixcommits `61f2d0e`…`2f95f2e` | siehe Abschnitt 6 | siehe Abschnitt 6 |

Alle Findings wurden in der Hauptsession reproduziert oder gegen Code/Kanon
revalidiert; Dubletten wurden zusammengeführt (H-02 = C-01 = E-01; H-01 = C-04;
H-03 = D-03; B-03 = C-05; B-05 = E-02). Verworfene Vermutungen der Reviewer
(z. B. „Worker startet über `node` aus PATH“, „adaptive Parallelität aktiv“,
„Support-Tools im Normalmodus sichtbar“, „mehr als ein MCP-Aufruf im Normalweg“,
„Mapping-Zeilen verloren/dupliziert“) sind in den Agentenberichten begründet und
wurden nicht weiterverfolgt.

## 3. Herstellerabgleich (02.09.2026)

Wörtlich belegt (Quelle → Folge): Plugins reference (`name` einziges Pflichtfeld;
`${CLAUDE_PLUGIN_ROOT}` ändert sich bei Updates; Plugin-MCPs starten automatisch;
Cowork lädt Skills als `<name>@synced`) · Plugin marketplaces (Pflichtfelder,
256-MiB-Archivgrenze) · Skills (Kürzung bei 1.536 Zeichen) · Subagents (gültige
Frontmatter-Felder) · Permissions (`requiresUserInteraction` fragt weiterhin) ·
Use plugins in Claude (lokale MCP-Server in Plugins) · Manage plugins for your
organization („valid .zip under 50 MB“) · Cowork architecture overview („Local MCP
servers don't run in sessions in the cloud“, „Cowork sessions run in the cloud by
default“, Admin-Schalter, MDM `isLocalDevMcpEnabled`) · Get started with Cowork
(lokale MCP-Plugins nur über Desktop-App) · MCP-Spezifikation 2025-06-18
(Annotationen nicht vertrauenswürdig, Defaults destruktiv/open-world).
**Nicht belegt (erwartet):** ein Hostvertrag, der dem lokalen MCP den verbundenen
Cowork-Arbeitsordner mitteilt. Die Tabelle steht in
`docs/REVIEW_CLAUDE_COWORK_2026-09-01.md`.

## 4. Findings

Vollständige Tabelle mit Datei:Zeile, Reproduktion, Ist/Soll, Auswirkung und
BL/DS: Ledger, Abschnitt „Konsolidierte Findings“. Zusammenfassung:

### Behoben (13 Fixcommits vor dem Gegencheck, 2 danach; vollständige Liste in Abschnitt 7)

| ID | Prio | Thema | Commit |
|---|---|---|---|
| H-01 = C-04 | P2 | Export-Outbox: beschädigter Record/`.tmp` ließ Worker „angehalten“ melden | `61f2d0e` |
| H-02 = C-01/E-01 | P1 | „Worker-ACK“ war nur `send`-Callback → falscher Erfolg möglich | `8f5ffed` |
| B-01 | P1 | Unterredaktion: `mailto:`-Domain überlebte in general/contract/customer | `8c00a08` |
| B-02 | P2 | OPC-Case-Varianten umgingen DOCX-Coverage (stille Story-Auslassung) | `547b6ee` |
| C-02 | P2 | zwei lebende Executor auf zwei Stapeln möglich (DS-022) | `7b4bb55` |
| B-03 = C-05 | P2 | abgeschlossene Exporte wurden bei jedem Start/Zielwechsel neu ausgeführt | `87060d4` |
| A-02, A-06 | P2/P3 | `result_folder_required` ohne ehrlichen Grund; Wechselsperre ohne Ausweg | `b5140c0` |
| A-07, A-08 | P3 | „dokumentierte Claude-Limits“ ohne Beleg; toter `HOST_GATE_TEXT` | `29897d0` |
| A-05 | P3 | Dialoge nannten nicht existierende Schaltflächen | `a411826` |
| H-03 = D-03, H-04 | P1/P3 | 27 Produkttests nicht in `test:product`, 5 in keinem Skript; veralteter Vertragstest | `9a9ff5b` |
| B-05 = E-02 | P3 | Output-als-Quelle-Gate nur Ordnerpicker/Stringvergleich (8.3, ersetzter Ordner) | `27473b1` |
| B-06 | P3 | Ordnerwalk schrieb Personen-Ordnernamen ins dauerhafte Mapping (DS-058) | `e99a733` |
| D-02, A-01, A-03, A-04, A-09, A-10, D-04 | P1–P3 | Dokumentendrift (Marketplace ≠ ZIP, Cloud-Standard/MDM, Skillname, Sync-Hinweis, UAT-04, Supportmodus, Builddatum) | `2f95f2e` |

### Offen, dokumentiert (keine Produktentscheidung nötig, aber Design/E1)

| ID | Prio | Thema | Begründung |
|---|---|---|---|
| C-03 | P2 | PID-Wiederverwendung macht tote Leases „lebendig“ | Prozess-Startzeit braucht plattformspezifische Helfer (Win32/`/proc`/`ps`); Design + reale Crash-Evidenz (BL-011.11) nötig; kein kleiner risikoarmer Fix |
| B-04 | P3 | Unicode-Kompatibilitätsvarianten (Fullwidth `＠`/Ziffern, `․`) umgehen Detektoren | NFKC-Faltung verändert Fachinhalt; Residual-Gate-Erweiterung braucht eigenes Design + Korpus |
| C-06 | P3 | synchrones SHA-256 im Listing-Pfad neben asynchronem Snapshot-Hash | Umbau der Listing-Verifikation, BL-047.1 mit Referenzmessung |
| C-07 | P3 | Resume-/Review-Start ohne IPC-Bestätigung | synchrone API; Folgearbeit zu H-02 |
| C-08 | P3 | Kill nach ACK-Timeout hinterlässt Arbeitskopien bis Intent-Ablauf | innerhalb DS-067; Cleanup-Design |
| C-09 | P3 | macOS ohne harte Prozesslimits | menschliche Evidenz BL-011.9/BL-011.6 |
| B-07 | P3 | Support-Review im MCP-Hauptprozess ohne `network-deny` | nur Supportmodus; BL-020.3 |
| A-11 | P3 | Evals/MCPB ohne DS-069-Abdeckung | Engineering-Korpus |
| E-04 | P3 | 6-MiB-Yield-Test prüft nur `turns > 0` | Messkriterium fehlt (E1) |

### Offener Restumfang des Auftrags (nicht geliefert)

Die eigenständig lieferbaren Backloganteile aus Abschnitt 8 des Auftrags wurden
nur teilweise bearbeitet. Ehrlich offen bleiben:

| Ledger | Story | Nicht geliefert |
|---|---|---|
| CC-10 | BL-042.3 | bounded Abschlussprojektion der Status-App, vollständige Textfallback-Matrix, automatisierter Browser-/A11y-/DE-EN-DOM-Lauf (nur `test:status-app` geprüft) |
| CC-11 | BL-022.1 | realer Word-/LibreOffice-/`python-docx`-Korpus, realistische Kommentare, konsistente AlternateContent-Policy (nur Case-Härtung B-02 geliefert) |
| CC-12 | BL-024.2 | kohärente Aufnahme des OCR-Bundles in freizugebende Produktziele, nicht allein per Manifest aktivierbares Produktgate, Paket-zu-Adapter-zu-OCR-End-to-End-Test; `test:engineering` nicht ausgeführt |

Diese Punkte stehen unverändert im kanonischen Backlog (Abschnitt A „in Arbeit“).
Alle offenen technischen Findings dieses Reviews sind zusätzlich unter ihren
bestehenden BL-IDs im Backlog verankert („Offene Restbefunde aus dem
Gesamtgegenreview 02.09.2026“); es wurden keine neuen BL-Storys angelegt.

### DECISION_REQUIRED

| Thema | Optionen | Empfehlung |
|---|---|---|
| Marketplace-`source` zeigt auf den Entwicklungsordner (`command: node`, OCR-Baum) | (a) generierte selbsttragende Projektion pro Ziel im verbundenen Repo bereitstellen und `source` umstellen; (b) Marketplace bis dahin aus README/Anleitung als Installationsweg streichen (jetzt umgesetzt: als „Zielkanal, nicht freigegeben“); (c) universelles Paket unter 50 MiB prüfen | (a) als BL-010.8-Lieferung; bis dahin (b) |
| PID-Startzeit als Owner-Identität (C-03) | (a) plattformspezifische Startzeit-Helfer; (b) offener exklusiver Lock-Handle je Executor; (c) Status quo mit dokumentierter Restgrenze | (b) prüfen; kein Anwenderdialog |

## 5. Lokale Gates

| Gate | Ergebnis |
|---|---|
| `npm run test:product` (Baseline vor Änderungen) | PASS, 12m17s |
| `npm run test:fast-path` (Baseline, inkl. Pretest-Kette) | PASS |
| `npm run test:product` (nach Erweiterung um 29 Tests, Zwischenstand) | PASS, 14m14s (111 direkte Testdateien + 23 Basisdateien) |
| `npm run test:product` (Baum `705bcaa`, zweiter Checkpoint) | PASS, 17m24s (parallel zu Build und Gegenchecks) |
| `npm run test:product` (finaler Codestand `7ea3b68`) | siehe Abschnitt 7 |
| `npm run test:product` (Folgeauftrag, Runner ohne Doppelläufe, `91465e0` + Doku) | PASS, 16m05s, „23 base + 108 direct test files“ (sechs zuvor doppelt gelaufene Dateien laufen je Profil genau einmal) |
| `npm run test:docs` | PASS |
| `npm run test:status-app` | PASS (nach `npm ci`; vorher `ERR_MODULE_NOT_FOUND esbuild`) |
| `npm run test:skills` | PASS (13 + 150) |
| `npm run test:source-preflight` | PASS |
| `npm run test:parser-contract` | PASS |
| `npm run test:executor-lifecycle` | PASS (27 + 18 + 6 + Export) |
| `npm run test:recovery` | PASS |
| `npm run test:delivery` | PASS |
| `npm run runtime:target -- --target windows-x64 …` | PASS: Node 22.23.2, Archiv-SHA-256 geprüft, Probe `win32/x64` |
| `npm run build` (finaler Baum `7ea3b68`) | PASS: `DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc86.zip`, 165 Einträge, **34.913.330 Byte**, SHA-256 `c34211c0218c5c1540f4922b2c2664a9df8942235264dfeaa36221da17a3815c`; SPDX-2.3-SBOM (6 Packages, 9 Files, created 2026-09-02, SHA-256 `c3452308…7d33e`); `SHA256SUMS`; ein früherer Build vor dem letzten Exportfix ergab 34.912.733 Byte |
| `npm run test:plugin-zip` | PASS (Teil von `build`) |
| `claude plugin validate plugins/data-secure --strict` | Validation passed |
| `claude plugin validate . --strict` | Validation passed |
| `git diff --check` | sauber |

Umgebungsblocker zu Beginn (D-01): kein Node-22.23.2-Archiv und nur teilweise
installierte devDependencies; beides nach Nutzerfreigabe behoben. macOS-Zielpakete
können auf diesem Host nicht gebaut werden (Vertrag: Zielhost).

## 6. Unabhängiger Gegencheck nach den Fixes

### runtime-quality-reviewer (read-only, Commits `8f5ffed`…`2f95f2e`)

Der Agent stoppte einmal am `maxTurns`-Limit (40) seiner Definition und wurde mit
kompaktem Abschlussauftrag fortgesetzt; er hat keine Repo-Datei geändert.

- **Bestätigt korrekt:** ACK-Semantik (verspätete/duplizierte Hüllen inert, Exit
  vor Bestätigung → sofortige Ablehnung, Timeout → Kill + idempotente
  Reservierungsfreigabe; Resume-/Review-Start bewusst unverändert, C-07);
  Export-Idempotenz nach Crash zwischen Dateiexport und Record-Abschluss
  (Hash-Vergleich in `exportOne`), `pending`/`released`-Invariante beidseitig;
  `otherLiveExecutor` blockiert weder toten noch lebenden eigenen Executor falsch,
  Scan ist rein lesend (kein Deadlock); Orphan-Guard ohne Falschpositive;
  `comparablePath` ohne Crashpfad bei fehlendem Ergebnisordner; Suffix-
  Disambiguierung liefert die kürzeste unterscheidende Form.
- **F1 (P2, Testlücke):** der `batch_active`-Guard in
  `continue_most_recent_document_batch` war von keinem Test angesteuert →
  **behoben** in Commit `test(batch): cover the batch_active guard …`
  (`tests/test-native-picker-lifecycle.js`, 25/25 grün).
- **F2 (Info):** `test:product` (Profil `full`) startet über
  `test-native-picker-lifecycle.js` reale, fensterlose PowerShell-Prozesse
  (nur Windows, timeout-begrenzt); `test:ci` ist nicht betroffen. Akzeptiert.
- **F3 (Info):** `visibleResultTreeOverlaps` ohne Cache: O(Dateien × Wurzeln)
  Realpath-Zugriffe (typisch < 100 ms auf SSD); Quantifizierung auf realem Host
  = menschliche Evidenz. Akzeptiert, im Ledger notiert.

### privacy-threat-reviewer (read-only, Commits `8c00a08`, `547b6ee`, `87060d4`, `27473b1`, `e99a733`, `b5140c0`)

Auch dieser Agent stoppte einmal am `maxTurns`-Limit (35) und wurde mit
kompaktem Abschlussauftrag fortgesetzt; keine Repo-Änderung.

- **Bestätigt korrekt:** `mailto:`/`tel:`/`sip:`/`xmpp:`-Fälle vollständig
  redigiert, Residual leer, `?email=`-Query über `EMAIL_RE` gedeckt; OPC-Gate
  lässt kanonische Word-/LibreOffice-DOCX unverändert durch (Baseline,
  Fixtures, Differential 96+24+16 Dokumente, Acceptance-Matrix 101/101) und
  stoppt Case-Varianten; Export final/Replay nur `complete:false` für Ein-Item-
  und Voll-Erfolgsfälle; Overlap-Gate blockiert 8.3-Alias, Junction, Case,
  Trailing-Slash und Elternordner (gewollt), lässt Geschwisterordner zu;
  Labels ohne Ordnernamen; `result_folder_required` ohne Pfadleck (per Code +
  vorhandenem Negativtest).
- **Finding 1 (P2, reproduziert):** Pro-Item-Finalität fehlte – in einem
  Mehr-Dokument-Lauf mit einem dauerhaft fehlschlagenden Item blieb der Record
  `complete:false`, und bereits geschriebene, vom Anwender gelöschte
  Geschwisterdateien wurden bei jedem Replay wiederhergestellt (DS-023). →
  **behoben** in Commit `fix(export): make every written result final on its
  own`: jedes geschriebene Item wird sofort im Record als `exported` persistiert
  und nie erneut geprüft oder erzeugt; nur offene Items werden nachgeholt.
  Negativtest in `tests/test-result-folder-export.js`.
- **Finding 2 (P4, informativ):** `CONTACT_URI_RE` frisst ohne Trennzeichen
  unmittelbar angrenzenden (auch CJK-)Text mit (Überredaktion ohne PII-Verlust;
  vorbestehend für ASCII). Akzeptiert und im Ledger notiert (Unterredaktion wiegt
  schwerer als Überredaktion, `tasks/README.md`).
- **Nicht selbst ausgeführt (ehrlich):** Kollisionsfall der Label-Disambiguierung
  (nur Code + vorhandener Test), `test-native-picker-lifecycle.js` (nur gelesen),
  Nebenläufigkeit zweier Exportprozesse. Die Hauptsession hat beide Testdateien
  ausgeführt (grün).

## 7. Abschluss

### Commits (lokal auf `main`, nicht gepusht)

| Hash | Thema |
|---|---|
| `61f2d0e` | fix(export): failing visible export stays pending (H-01) |
| `8f5ffed` | fix(intake): handoff confirmed only on worker acceptance (H-02) |
| `8c00a08` | fix(privacy): complete address behind mailto/contact URIs (B-01) |
| `547b6ee` | fix(docx): non-canonical OPC case stops instead of omitting (B-02) |
| `7b4bb55` | fix(batch): exactly one live executor across journals (C-02) |
| `87060d4` | fix(export): completed export final, replay only failed (B-03/C-05) |
| `b5140c0` | fix(result-folder): honest path-free reason (A-02/A-06) |
| `29897d0` | chore(contract): drop dead HOST_GATE_TEXT, label conventions (A-07/A-08) |
| `a411826` | fix(ux): one continuation phrase (A-05) |
| `9a9ff5b` | test(product): every product batch gate in the suite (H-03/H-04; Commit-Text nennt „126“, korrekt: 111 direkte + 23 Basisdateien) |
| `27473b1` | fix(sources): output tree shielded by real path in both pickers (B-05/E-02) |
| `e99a733` | fix(mapping): folder sub-paths only on name collisions (B-06) |
| `2f95f2e` | docs: canon, guides, UAT kit, skill aligned with vendor state (D-02, A-01, A-03, A-04, A-09, A-10, D-04) |
| `705bcaa` | test(batch): batch_active continuation guard covered (Gegencheck G-R1) |
| `7ea3b68` | fix(export): every written result final on its own (Gegencheck G-P1) |
| `590fe08` | docs: Bericht, Ledger, Register, Backlog-Evidenz |
| `91465e0` | test(product): jede Testdatei läuft je Profil genau einmal (Dedupe + Guard) |
| (Folgeauftrag, dieser Commit) | docs: D-01/D-05 erledigt, Commitzahlen berichtigt, offene Findings im Backlog, CC-10–CC-12 als Restumfang |

Insgesamt 18 Commits seit `487f1db`: 13 Fixcommits vor dem Gegencheck, 2 nach dem
Gegencheck, 3 Dokumentations-/Testinfrastrukturcommits.

### Finaler Suitelauf

`npm run test:product` auf dem finalen Codestand `7ea3b68`: **PASS**, Exit 0,
16m14s; Runner-Ausgabe „Product full suite passed (111 direct test files)“
zuzüglich der 23 Basisdateien und Skripte des Runners, 120 Suitenzeilen mit
„0 failed“. Die in der Commit-Nachricht von `9a9ff5b` genannte Zahl „126“ war
eine Schätzung; maßgeblich ist die Runner-Ausgabe.

### Zustand

Arbeitsbaum nach dem letzten Commit sauber (`git status --short` leer),
`git diff --check` sauber, nichts gepusht, keine GitHub Actions gestartet. Der
Auftrag und dieser Bericht bleiben gemäß `tasks/README.md` bis zur Annahme im
Root von `tasks/`.

## 8. Verbleibende menschliche Evidenz

Unverändert offen und nicht simuliert: Fresh Install ZIP auf Windows x64 und
macOS Intel/ARM, echter Cowork-Ablauf (Picker, Ordnerwahl, Abbruch, Fortsetzung,
Sammelreview, Abschlussdialog, Berechtigungsanzeigen), Marketplace-Lebenszyklus
(nach selbsttragender Projektion), 100 Dateien/500 MiB, Accessibility, IT/
Health-IT-, Datenschutz-, Security- und Architekturfreigabe (BL-010.x, BL-011.x,
BL-012.x, BL-041.x, BL-051.x, BL-052.x).

## 9. Urteil

**Technisch grün, UAT-offen.** Alle P0-Punkte des Auftrags sind geprüft; zwei
P1-Defekte (falscher Handoff-Erfolg, `mailto:`-Unterredaktion) sowie die
P1-Testlücke und die P1-Dokumentendrift zum Marketplace sind behoben. Kein
Release: Zielhost-, Cowork- und Fachevidenz fehlen weiterhin; der breite Rollout
bleibt NO-GO gemäß Backlog.

## 10. Nachtrag 03.09.2026 – UAT-Beobachtung auf Windows/Cowork

Anlass: Erster nativer UAT-Versuch (UAT-01) auf Windows 11 mit Claude Desktop
1.40609.1/Cowork. Fünf Läufe liefen unbemerkt mit rc85 aus dem Cowork-Cache
(„My Uploads“), obwohl rc86 über die Desktop-Oberfläche installiert war; die
Installation landete im Claude-Code-Speicher `~/.claude/plugins/marketplaces/
local-desktop-app-uploads`, nicht in „My Uploads“. Nachgestellt mit dem echten
gebündelten Runtime: rc86 fragt den Ergebnisordner vor dem Quellpicker ab und
exportiert nach `DataSecure-Output`; rc85 kennt beides nicht.

Drei Read-only-Reviewer (cowork-plugin-, runtime-quality-, privacy-threat-
reviewer) wurden angesetzt; ihre Ergebnisse sind unten konsolidiert.

### Findings

| ID | Prio | Datei:Zeile | Befund | BL/DS |
|---|---|---|---|---|
| U-01 | P1 | `gateway/batch-worker.js:71-84`, `gateway/batch-executor.js` (Nachrichten-/Exit-Pfade) | Abschlussmeldung und Terminal-Diagnose hingen allein am MCP-Elternprozess; Cowork beendet ihn kurz nach der Tool-Antwort. In 4 von 5 Läufen fehlten `intake_terminal_state`, `completion_notice_*`, `intake_worker_exited`; der Worker lief durch, kein Fenster erschien. Repro: `child.disconnect()` nach `local-intake-processing-started` (neuer Test). | BL-041.6, BL-041.9, BL-041.10 |
| U-02 | P2 | `index.js:67-101`, `companion/completion-summary.js`, Skill | Aktive Plugin-Version ist in Cowork für Anwender unsichtbar (`privacy_status` ist Support-only, Abschlussfenster ohne Version); Versionsdrift blieb einen Vormittag unbemerkt. | BL-041.7, BL-051.5 |
| U-03 | P3 | `gateway/batch-executor.js:25-29` vs. `gateway/result-folder-config.js:56-68` | `EU_PRIVACY_RESULT_ROOT` wird nicht an den Worker weitergegeben; Worker-Export bleibt bei Env-Konfiguration `pending` bis zum nächsten Serverstart. | BL-040.5 |
| U-04 | P3 | `index.js:29` vs. `skills/…/SKILL.md:23`, `STEP-BY-STEP.md:23` | Pflichtantwort nach Übergabe in Serverinstruktion und Skill wortverschieden. | BL-041.1 |
| U-05 | Host | Claude Desktop/Cowork | Persönlicher ZIP-Upload in „My Uploads“ übernimmt neue Versionen nicht zuverlässig (offizielle Doku ohne Update-Mechanik für Uploads; GitHub #69020, #65426, knowledge-work-plugins #158). Kein Repo-Defekt; Anleitung/UAT-Kit brauchen den Prüfweg. | BL-051.5, BL-010.7 |
| U-08 | P2 → behoben | `server/index.js` (startPickerBatch, catch der Quellauswahl) | Eine bewusst abgelehnte Auswahl (Ordner mit nicht freigegebenen Formaten, Output-Baum, Link, zu viele Dateien) wurde als generisches `local_start_failed` „konnte nicht sicher vorbereitet werden“ gemeldet; der feste, pfadfreie Grund aus `companion/source-folder.js` ging verloren. Claude deutete das im UAT (16:03, rc85) als defekten Connector. Jetzt `local_selection_rejected` mit Grund, `next_action: choose_other_selection`, Diagnosecode `LOCAL_SELECTION_REJECTED`; Skill, Prompt-Vertrag, Anleitung erweitert; Negativtest im Picker-Lifecycle. | BL-044.1, BL-041.1 |
| U-09 | Host | Claude Desktop „My Uploads“ | Auch ein Upload unter neuer Kennung (`data-secure-rc87`, 03.09. 15:21) landete nur im Claude-Code-Speicher; Cowork materialisiert weiter den rc85-Kontoeintrag. Die Organisation blockiert damit derzeit sowohl Entfernen als auch Neuanlage persönlicher Uploads. Ohne Admin ist kein ZIP-Weg nach Cowork möglich (Git-Marketplace-Projektion `msg_gbh_secureData` liegt als Alternative bereit, vom Nutzer nicht gewünscht). Zusätzlich ist die Legacy-Erweiterung „EU Privacy Gateway“ (MCPB) in Desktop aktiv und verwirrt den Ablauf. | BL-051.5, BL-010.7 |
| U-11 | P2 → behoben | `server/index.js` (alle `ok:false`-Rückgaben, `tools/call`-Handler), `gateway/diagnostic-causes.js` (neu) | Fehlerantworten trugen nur einen deutschen Satz; Version, Phase und Ursache waren in Cowork nicht sichtbar, Claude deutete Ablehnungen und Host-Stopps als Connector-Defekt. Jetzt inhaltsfreies `diagnostic` (`gateway_version`, `phase`, fester `cause`, fester `hint`, `at`, `recorded`, Zähler bei abgelehnten Ordnern) in jeder Fehlerantwort; Picker-Infrastrukturfehler mit eigenen Codes (`LOCAL_PICKER_UNAVAILABLE/TIMEOUT/FAILED`), IPC-Ack-Timeout/-Abbruch getrennt vom Prozessstart. Read-only-Review (cowork-plugin-reviewer) fand die Lücke, dass Ergebnisübergabe, Ordneröffnung und Support-Werkzeuge ohne Hülle blieben; behoben durch zentrale Vervollständigung `completeDiagnostic` im `tools/call`-Handler (Abbildung fester `error`-Schlüssel auf Phase/Ursache). Privacy-Review (privacy-threat-reviewer): keine Abflusspfade, Allowlist hält auch pfadartige `error.code`; zwei Info-Hinweise (parallele Allowlists `CAUSES`/`ERROR_CODES`; IPC-Klassifikation per festem Fehlertext statt `.code`) offen als Wartungsnotiz. | BL-041.1, BL-044.1 |
| U-12 | P3 → behoben | `tests/helpers.js:39` | `done(cleanup)` ignorierte den Callback; `test-uat-fixture-generation` und `test-source-opc-preflight` ließen ihre Temp-Bäume stehen, ein Restbaum plus Defender-Echtzeitscan ließ die Fixture-Generierung im Kettenlauf (Lauf 10, parallel zu `test:docs`) einmal mit `rm`-Fehler scheitern. Jetzt läuft der Callback vor dem Urteil mit begrenztem Retry bei `EPERM/EBUSY/ENOTEMPTY`; ein endgültiger Fehlschlag ist Warnung, nie geändertes Urteil. | BL-050.3 |
| U-13 | **P1 → behoben** | `server/privacy/base.js` (`hasLabelBefore`), `privacy/structured.js` (Detektoren), `document-parser.js` (`csvToMarkdown`) | Label-gebundene Kennungen (Steuer-ID, Geburtsdatum, Telefon ohne `+`, Kfz-Kennzeichen, Referenz-/Personalnummern) wurden nur akzeptiert, wenn das Label auf derselben Zeile unmittelbar vor dem Wert stand. In spaltenorientierten Markdown-Tabellen (Standardform jeder CSV, typisch für DOCX-Tabellen) steht das Label in der Kopfzeile zwei Zeilen darüber: Reproduktion mit synthetischer CSV → alle genannten Werte blieben unredigiert neben `[PERSON_001]`, Residual-Gate meldete `[]` (gleiche Detektortabelle, gleicher blinder Fleck; Widerspruch zu DS-049). Jetzt gilt zusätzlich das Kopfzellen-Label der Spalte (`tableHeaderAt`; Escape-Pipes, `(1)`-Suffixe und ausgerichtete Trennzeilen berücksichtigt); nackte Kennungszellen unter Referenz-Labels werden `[ID_REDACTED]`; Mengenspalten ohne PII-Label bleiben unangetastet. Negativtest in `test-pii-regression` (CSV-Weg, Gate sieht die Tabellenform, handgeschriebene Tabelle). | DS-049, BL-021.1, BL-022.x |
| U-14 | P2 → behoben | Skill `SKILL.md` Schritt 7/8, `prompt-contract.js`, `manifest.json` | Vier Fehlerzustände der Ergebnisübergabe (`no_completed_local_batch`, `local_handoff_active`, `no_active_local_handoff`, `local_handoff_expired`) hatten feste Servermeldung und Diagnose, aber keine angewiesene Antwort; Claude hätte Ursachen improvisiert oder erneut gestartet. Jetzt je Zustand feste Antwort und erlaubte Folgeaktion. | DS-043, DS-051, BL-012.x |
| U-15 | P2 → behoben | `gateway/batch-executor.js` (`showNoticeOnce`, `finalizeExit`) | Auf dem Fortsetzungspfad (`continue_most_recent_document_batch`) wurde ein nicht darstellbares Abschlussfenster still verschluckt, ohne `completion_notice_*`-Ereignis, obwohl die `terminal_notice`-Übernahme bereits dauerhaft geschrieben war; ein fehlendes Fenster nach einer Fortsetzung war undiagnostizierbar (Intake-Pfad protokollierte korrekt). Jetzt symmetrisch `started/dispatched/failed` mit `LOCAL_NOTICE_FAILED`; zwei Negativtests. Offen bleibt das Design „Übernahme vor Präsentation“ (Worker kann nach Elternsterben dazwischen nicht mehr einspringen), als Backlog-Zeile unter BL-041.10 festgehalten; Zeitfenster nur nativ belegbar. | BL-041.10 |
| U-16 | P3 → behoben | `gateway/batch-intake.js:130`, `tests/test-batch-session.js:473` | `next_action: restart_only_on_request` neben dem überall sonst genutzten `restart_only_on_explicit_request` (toter Zweig im aktuellen Worker, aber über `companion/ipc-session.js` erreichbar). Vereinheitlicht. | BL-002 |
| U-17 | P3 → dokumentiert | `server/index.js` Startsequenz | `RESULT_EXPORT_RECOVERY.failures` war als einziger Recovery-Schritt nicht fail-closed und unkommentiert. Absicht (sichtbarer Export ist Projektion bereits verifizierter Pakete, bleibt `pending`, Wiederholung beim nächsten Start) jetzt am Aufruf dokumentiert; Verhalten unverändert. | BL-002 |
| U-18 | Host | Claude Desktop/Cowork | Die in dieser Session live eingespielten MCP-Serverinstruktionen entsprechen dem Wortlaut eines älteren RC (kein Versionszusatz, keine Ergebnisordnerwahl, alter Schlüssel `local_intake_accepted_checkpoint_pending`), während `index.js` rc90/rc91 trägt: erneuter Beleg für den Kontocache aus U-05/U-09; kein Repo-Defekt. | BL-051.5, BL-010.7 |
| U-19 | **P1 → behoben** | `privacy/base.js` (`hasLabelBefore`, `previousLabelLine`) | Label allein auf der Zeile über dem Wert („Geburtsdatum\n01.01.1980“, Definitionslisten „: 269…“, Listenpunkte) wurde nie erkannt: der Labelblick endete an der aktuellen Zeile. Steuer-ID, Geburtsdatum, Telefon und Kennzeichen blieben im Klartext, Residual-Gate `[]`. Jetzt zählt bei einem Wert am Zeilenanfang die nächste kurze nicht leere Zeile darüber. | DS-049, DS-033 |
| U-20 | **P1 → behoben** | `privacy/entities.js` (`HONORIFIC`, `collectPersonAnchors`), `privacy/base.js` (`looksName`, `HONORIFICS`) | Gradzusätze hinter Titeln („Dr. med.“, „Dr. h. c.“, „Dr. rer. nat.“) brachen den Titelanker; „Dr. med. Anna Beispiel“ blieb komplett im Klartext, Gate einig. Zusätzlich griff der Anker über Zeilenumbrüche („Anna Beispiel\nRolle“ als Dreitoken-Name verworfen) und kannte keine Adelspartikel („von der Heide“ blieb hinter dem Pseudonym stehen). Jetzt flache Titel-/Zusatzkette (linear, kein Backtracking; ein erster verschachtelter Entwurf ließ `test-batch-session` >9 min hängen und wurde durch einen Zeitgrenzen-Test abgesichert), Partikel im Anker und in `looksName`, Zusätze in der Stoppliste. | DS-049, DS-012, DS-033 |
| U-21 | **P1 → behoben** | `privacy/base.js` (`PHONE_LABEL_RE`) | Das Telefon-Label musste das letzte Wort sein: „Telefonnummer“ (häufigstes deutsches Label), „Telefon (privat)“, „Mobil (dienstlich)“, „Telefoonnummer“ schalteten die Erkennung vollständig ab, inline und als Spaltenkopf. Jetzt optionales Nummer-Suffix und Klammerzusatz. | DS-049, DS-033 |
| U-22 | **P1 → behoben** | `privacy/base.js` (`DATE_OF_BIRTH_RE`, `DATE_OF_BIRTH_LABEL_RE`) | Nur vier deutsche/englische Literale; „Date de naissance“, „Fecha de nacimiento“, „Geboortedatum“, „Data di nascita“ ließen Geburtsdaten stehen, ebenso jedes ausgeschriebene Datum („1. Januar 1980“) trotz korrektem Label. Jetzt FR/ES/NL/IT-Labels, „geboren am“, Wortdaten in fünf Sprachen; ohne Label bleibt Monatsprosa unangetastet. | DS-037, DS-049 |
| U-23 | **P1 → behoben** | `server/index.js` (Startsequenz), `gateway/startup-guard.js` (neu) | Fail-closed-Start (z. B. Datei statt Ordner unter `SecureDataMsg\batches`, Reproduktion des Reviewers) endete als roher Node-Stacktrace mit absoluten Pfaden und Benutzernamen auf stderr, das der Host verschluckt; kein Journalereignis, keine Markerdatei, `diagnostic_status` leer. Jetzt `startup_refused` mit festem Code, `startup-refused.json`, eine pfadfreie stderr-Zeile, Exit 1; Integrationstest startet den echten Server gegen einen defekten Datenordner. | DS-048, DS-071, BL-042 |
| U-24 | P2 → behoben | `gateway/startup-guard.js` (`verifyBundledRuntime`), `.mcp.json` | Die gebündelte Node-Laufzeit (die den gesamten Produktcode ausführt) wurde nur beim Build gehasht; der schmalere Sandbox-Launcher dagegen bei jedem Spawn. Jetzt prüft der Start im selbsttragenden Paket Größe und SHA-256 von `process.execPath` gegen `RUNTIME-EVIDENCE.json` (≈3 s für 87 MB, gemessen im Smoke); manipulierte Laufzeit → `RUNTIME_INTEGRITY_FAILED` (nativ verifiziert). Grenze: erkennt Beschädigung/Austausch nach dem Build, ersetzt nicht die Paketprüfsumme vor Installation. Laufzeit 22.23.2 ist der aktuelle 22.x-Patch (endoflife.date, 03.09.2026), Wartung bis 30.04.2027. | DS-066, DS-071 |
| U-25 | P2 → behoben | `gateway/workflow-diagnostics.js`, `gateway/batch-executor.js` | Kein Ereignis ließ sich einem Lauf zuordnen; zwei kurz aufeinander folgende Läufe waren im Journal nur über Zeitnähe trennbar. Jetzt zufällige `run_id` (8 Hex, aus nichts abgeleitet) pro Start, an den Worker über `DATASECURE_RUN_ID` weitergegeben, in jedem Ereignis; DS-071 präzisiert DS-026. | DS-026, DS-071, BL-042 |
| U-26 | P3 → behoben | `docs/IT-BETRIEBSHANDBUCH.md` | Handbuch nannte eine Spur mit „200 Einträgen“; tatsächlich zwei Journale (`events.jsonl` 200, `workflow-events.jsonl` 300) mit unterschiedlicher Semantik. Rechnung: ein 100-Dateien-Stapel schreibt ≈11 Ablaufereignisse, aber ≈100 Dokumentergebnisse; zwei große Stapel am Tag verdrängen die ältesten. Jetzt beide Spuren, Grenzen und die neuen Startcodes dokumentiert. | BL-042 |
| U-27 | P3 → behoben | Skill `datenschutz-erklaeren/SKILL.md:3`, `references/beispiele.md:43` | Beschreibung der Erklär-Skill ohne Gegen-Abgrenzung zur Anonymisier-Skill (nur einseitig vorhanden); Beispieltext behauptete einen Bildtext-Pfad, den der Pilot nicht hat (FORMAT_COVERAGE_MATRIX: OCR kein Produktpfad). Beides korrigiert; Beschreibung unter der 200-Zeichen-Konvention. | DS-005, DS-009 |
| U-28 | P3 offen | `privacy/base.js` (`buildTableIndex`), Engine | Zweizeilige Tabellenköpfe („Personal“/„nummer“): Kopfzelle „Personal“ wird als Person pseudonymisiert (Überredaktion), die Kennungsspalte nicht label-gebunden. Außerdem „Im Januar 1980 …“ → `[LOCATION_REDACTED]` (bestehende Überredaktion, im Regressionstest umschifft). | DS-008, BL-021.1 |
| U-29 | P3 offen (Design) | Skill-Texte, `prompt-contract.js`, `index.js` INSTRUCTIONS, Tool-Beschreibungen | Dieselben Schutzsätze werden an bis zu neun Stellen parallel gepflegt (Quantifizierung im Review); SKILL.md erfüllt die 500-Zeilen-Empfehlung nur durch sehr lange Zeilen (58 Zeilen, 1.562 Wörter). Kein Regelverstoß; Konsolidierung mit progressiver Offenlegung als eigene Story. `claude plugin eval` ist für die Organisation noch nicht freigeschaltet; Eval-Fälle liegen nur als Entwurf unter `evals/`. Kein `outputSchema` an den Tools (Kandidat, MCP-Spezifikation nicht abschließend geprüft). | BL-041.1, BL-041.10 |
| U-30 | P3 offen (Verfügbarkeit) | `server/ooxml.js:842` | Jede externe Beziehung (`TargetMode="External"`, also jeder normale Hyperlink) blockiert das ganze DOCX fail-closed. Sicher, aber im Widerspruch zur Freigabe „DOCX“ ohne diese Einschränkung in der Coverage-Matrix. Entscheidung offen: Linkziel verwerfen und Anzeigetext prüfen, oder Einschränkung dokumentieren. | DS-007, DS-049 |
| U-07 | P2 → behoben (DS-070) | `gateway/batch-snapshot.js:146-152` (`copySnapshotFile`) | Die Quellidentität wird auch über `ctimeMs` gebunden. Unter aktivem Defender-Echtzeitscan ändert sich die NTFS-Änderungszeit frisch geschriebener Dateien sporadisch, worauf die Übernahme fail-closed mit „Datei während der Übernahme verändert“ stoppt (`test-mixed-batch-recovery` in 3 von 7 Kettenläufen, isoliert stets grün). Sicher, aber ein grundloser Stopp im Realbetrieb ist möglich. **DECISION_REQUIRED**: `ctime` aus der Identitätsbindung nehmen (Metadaten-Änderungen ohne Inhaltsänderung tolerieren, Inhalt bleibt über Größe/mtime/inode/SHA-256 gebunden) oder bewusst beibehalten und im IT-Handbuch als bekannten Windows-Effekt dokumentieren. Empfehlung: Option 1 mit Negativtest. | BL-050.3, BL-011.x |
| U-06 | P2 | atomare Schreibpfade (`gateway/workflow-diagnostics.js:136-139`, `gateway/batch-journal-io.js`/`batch-journal-store.js publishJournal`, `gateway/result-export.js writeRecord/exportOne`, Package-Staging) | Unter aktivem Windows-Defender-Echtzeitscan schlägt `fs.renameSync(tmp → ziel)` sporadisch mit `EPERM` fehl (Messung 03.09.2026: 27 von 1.515 Journal-Schreibvorgängen). Die Produktpfade sind fail-closed (Export bleibt `pending`, Diagnose zählt `write_errors`, Publikation stoppt sicher), aber ein Dokument kann dadurch grundlos als „sicher gestoppt“ enden. Nicht behoben: ein kurzer, begrenzter Rename-Retry bei `EPERM`/`EBUSY` wäre ein kleiner, risikoarmer Fix, betrifft aber mehrere Kernpfade und braucht einen eigenen Negativtest je Pfad. | BL-050.3, BL-002 |

Datenschutz-Review zu U-01: unbedenklich mit Auflage „dauerhafter Einmal-Marker
statt Prozessflag“ (umgesetzt: `terminal_notice` im Journal unter Active-Lock).
Reservierungen und Leases bleiben PID-gebunden und heilen sich nach Worker-Ende
selbst; Originale und Mapping sind vom Elternprozess-Ende unberührt (geprüft).

### Fixes (lokal, nicht gepusht)

| Commit | Thema | Dateien | Gezielte Tests |
|---|---|---|---|
| `165b281` | fix(worker): Worker zeigt den Abschlussdialog selbst, wenn der MCP-Elternprozess fehlt (U-01) | `gateway/batch.js` (`claimTerminalNotice`), `gateway/worker-terminal-presentation.js` (neu), `gateway/batch-worker.js`, `gateway/batch-executor.js`, `tests/lib/detached-batch-worker.js`, `tests/test-worker-terminal-presentation.js` (neu, 11), `tests/test-direct-picker-intake-worker.js` (+1 Negativtest: Eltern trennt IPC nach Start), `tests/test-batch-executor-startup.js` (+6), `tests/run-product-suite.js`, `package.json` | `test:executor-lifecycle`, `test:journal`, `test:locks`, `test:delivery`, `test-direct-picker-intake-worker` grün |
| `69a2be1` | test(manifest): Lifecycle-Skript inkl. neuem Präsentationstest festschreiben | `tests/test-manifest.js` | `test-manifest` grün |
| `df34a74` | feat(release): Git-Marketplace-Projektion des verifizierten ZIPs (`scripts/build-marketplace-repo.mjs`) | Skript, `docs/RELEASE.md` | Skriptlauf, `claude plugin validate` (Marketplace und Plugin), MCP-Smoke grün |
| `b9b081d` | feat(release): Upload-Variante mit anderer Plugin-Kennung (`scripts/rename-plugin-zip.mjs`) | Skript, `docs/RELEASE.md` | Skriptlauf, Byteidentität außer Manifest, `claude plugin validate`, MCP-Smoke grün |
| `41af36d` | fix(picker): bewusst abgelehnte Auswahl meldet ihren pfadfreien Grund (U-08) | `server/index.js`, `gateway/workflow-diagnostics.js`, Skill, `prompt-contract.js`, `manifest.json`, `docs/ANLEITUNG.md`, `tests/test-native-picker-lifecycle.js` (+1) | `test-native-picker-lifecycle`, `test-workflow-diagnostics`, `test-mcp-protocol`, `test-manifest`, `test-capability-contract`, `test-cowork-tool-surface-contract`, `test:skills`, `test:docs:fast` grün |
| `430854f`, `9a2fadf` | feat(picker): Explorer-Ordnerdialog (COM `IFileOpenDialog`, `FOS_PICKFOLDERS`) für Quell- und Ergebnisordner mit Legacy-Rückfall (U-10) | `server/companion/windows-folder-dialog.js` (neu), `source-folder.js`, `folder-picker.js`, `tests/test-source-folder.js`, `tests/test-ui-process-policy.js` | Skripte headless mit Stub durchlaufen (Pfad zurück), `test-source-folder`, `test-ui-process-policy`, `test-native-picker-lifecycle` (echte PowerShell-Präambel inkl. Interop-Kompilierung), `test-result-folder-export`, `test-mcp-protocol` grün |
| `20aefea` | chore(release): 3.2.0-rc89 | Versionsstellen, Kanon-Baseline, Dokumentlabels | `verify-canonical-docs`, `test-manifest` grün |
| `b4b007d` | chore(release): 3.2.0-rc88 | Versionsstellen, Kanon-Baseline, Dokumentlabels | `verify-canonical-docs`, `test-manifest`, `test:docs:fast` grün |
| `89fcf91` | feat(diagnostics): inhaltsfreie Diagnose-Hülle in jeder Fehlerantwort (U-11) | `gateway/diagnostic-causes.js` (neu), `server/index.js`, `companion/source-folder.js`, `folder-picker.js`, `file-picker.js`, `gateway/workflow-diagnostics.js`, Skill (`SKILL.md`, `references/fehler-und-datenhaltung.md`), `prompt-contract.js`, `manifest.json`; `tests/test-diagnostic-causes.js` (neu, 4), `test-native-picker-lifecycle.js` (+Diagnose-Asserts, Timeout-Fall), `test-mcp-protocol.js` (+2: Fortsetzung ohne Stapel, zentrale Vervollständigung bei Ergebnisübergabe), `run-product-suite.js`, `test-manifest.js`, `package.json` | Produktsuite 120/120 grün (Lauf 11), `test:docs`, `test:skills`, `claude plugin validate --strict` (Plugin, Marketplace-Root) grün |
| `368917f` | test(helpers): Suite-Cleanup-Callback mit begrenztem Retry (U-12) | `tests/helpers.js` | `test-uat-fixture-generation` 3× in Folge ohne Temp-Rest, `test-source-opc-preflight`, `test-batch-snapshot` grün |
| `4512edd` | fix(privacy): label-gebundene Kennungen in Tabellenspalten werden redigiert (U-13) | `privacy/base.js`, `privacy/structured.js`, `tests/test-pii-regression.js` (+1) | `test-pii-regression` (108), `test-adversarial`, `test-format-acceptance-matrix`, `test:skills` (150er-Matrix), Goldfixtures unverändert grün |
| `23e599a` | fix(intake): kanonischer `next_action` (U-16) | `gateway/batch-intake.js`, `tests/test-batch-session.js` | `test-batch-session` grün |
| `65d6fb0` | docs(startup): Export-Recovery bewusst nicht fail-closed (U-17) | `server/index.js` (Kommentar) | Serverstart, `test-mcp-protocol` grün |
| `cb5ff2b` | fix(executor): Abschlussfenster-Ergebnis auf dem Fortsetzungspfad protokolliert (U-15) | `gateway/batch-executor.js`, `tests/test-batch-executor-startup.js` (+2) | `test-batch-executor-startup` (35), `test-direct-picker-intake-worker`, `test-worker-terminal-presentation` grün |
| `73feb74` | docs(skill): feste Antworten für die vier Handoff-Fehlerzustände (U-14) | `SKILL.md`, `prompt-contract.js`, `manifest.json` (sync) | `test-manifest`, `test-cowork-tool-surface-contract`, `test-mcp-protocol`, `test-capability-contract`, `test:skills` grün |
| `c7bba3b` | fix(privacy): Label über dem Wert, Titelzusätze, Telefon-/Geburtsdatum-Labelvarianten (U-19 bis U-22) | `privacy/base.js`, `privacy/entities.js`, `tests/test-pii-regression.js` (+1 Sammeltest, 30 Formen) | `test-pii-regression` (109), `test-adversarial`, `test-format-acceptance-matrix`, `test-gateway-e2e`, `test:skills` grün |
| `1ba633c` | docs(skill): Erklär-Skill grenzt sich ab (U-27) | `datenschutz-erklaeren/SKILL.md` | `test-manifest` grün |
| `8f08c0e` | feat(diagnostics): nachvollziehbarer Startabbruch, Laufzeit-Selbstprüfung, Laufkennung (U-23 bis U-26, DS-071) | `gateway/startup-guard.js` (neu), `server/index.js`, `gateway/workflow-diagnostics.js`, `gateway/batch-executor.js`; `tests/test-startup-guard.js` (neu, 6), `test-batch-executor-startup.js`; Kanon `DECISIONS.md` (DS-071), `TRACEABILITY.md`, `TARGET_CAPABILITIES.json`, `BACKLOG.md`; `docs/IT-BETRIEBSHANDBUCH.md` | `test-startup-guard`, `test-workflow-diagnostics`, `test-batch-executor-startup` (35), `test-mcp-protocol`, `test-batch-session` (68, 3:41 min), `test:docs:fast` grün |
| `13c79d7` | test(privacy): lange Titelketten bleiben linear | `tests/test-pii-regression.js` (+1) | `test-pii-regression` (110) grün |
| `c86f1fc` | chore(release): 3.2.0-rc92 | Versionsstellen, Kanon-Baseline, Dokumentlabels | `test:docs:fast`, `test-manifest` grün |
| `4e04cf8` | chore(scripts): Trennzeichen in der Lifecycle-Kette | `package.json`, `tests/test-manifest.js` | `test-manifest` grün |
| `415857f` | docs(skill): Bildtext-Pfad als Zielverhalten gekennzeichnet (U-27) | `references/beispiele.md` | `test:skills`, `test:docs:fast` grün |
| `2448d8f` | chore(release): 3.2.0-rc91 | Versionsstellen, Kanon-Baseline, Dokumentlabels | `test:docs:fast`, `test-manifest` grün |
| `e17be48` | chore(release): 3.2.0-rc90 | Versionsstellen, Kanon-Baseline, Dokumentlabels | `test:docs:fast`, `test-manifest` grün |
| `b4ff2f5` | fix(identity): Dateiidentität ohne ctime, Preflight-SHA-256 verpflichtend (U-07, DS-070) | `gateway/batch-snapshot.js`, `batch-source-admission.js`, `source-format-inspector.js`, `private-work-store.js`, `retention.js`, `batch-journal-store.js`, `bound-private-file.js`; Kanon `DECISIONS.md` (DS-070), `TRACEABILITY.md`, `BACKLOG.md`, `TARGET_CAPABILITIES.json`, `contracts/BATCH_SNAPSHOT_V1.md`, `contracts/SOURCE_PREFLIGHT_V1.md`; Tests `test-batch-snapshot.js` (+3 Negativtests: ctime-Drift toleriert, Inhaltsaustausch bei gleicher Größe/mtime stoppt über Hash, fehlender Hash stoppt), `test-batch-source-admission.js`, `test-source-format-inspector.js` | `test-batch-snapshot`, `-source-admission`, `-source-format-inspector`, `-batch-intake`, `-read-only-source-snapshot`, `-private-work-store`, `-retention`, `-batch-journal-store`, `-mixed-batch-recovery`, `verify-canonical-docs`, `test:docs:fast` grün |
| `1f10773` | docs(release): Cowork-Upload als offener Hostfehler eingeordnet, Marketplace-`archive`-Quelle als Zielkanal, Release-Marketplace-Manifest im Build (U-05) | `docs/RELEASE.md`, `docs/IT-BETRIEBSHANDBUCH.md`, `scripts/build-release-marketplace.mjs` (neu), `package.json` (`build`) | Skriptlauf mit Platzhalter-, gültiger und ungültiger URL; `test-manifest`, `test-capability-contract`, `test-plugin-structure`, `test:docs:fast` grün |
| `b49b850` | fix(io): begrenzter Retry für transiente Umbenennfehler bei jeder Temp-Datei-Publikation (U-06) | `gateway/batch-journal-io.js` (`renameWithTransientRetry`), `audit.js`, `batch-evidence.js`, `diagnostics.js`, `legacy-input-migration.js`, `mapping.js`, `review.js`, `storage-reservation-store.js`, `privacy-config.js`, `result-folder-config.js`, `workflow-diagnostics.js`, `result-export.js`, `package-staging.js`, `orchestrator.js`; `tests/test-transient-rename-retry.js` (neu, 5), `tests/run-product-suite.js`, `package.json` (`test:journal`) | 30 betroffene Suiten einzeln grün (u. a. `test-gateway-e2e`, `test-package-staging*`, `test-mapping*`, `test-audit-privacy`, `test-workflow-diagnostics`, `test-result-folder-export`, `test-batch-evidence`, `test-legacy-input-migration`, `test-retention`, `test-storage-capacity`) |
| `cd2aa10` | chore(release): 3.2.0-rc87, Builddatum 03.09.2026, Kanon-Baseline und Dokumentlabels | `package.json`, `package-lock.json`, `manifest.json`, `plugin.json`, `BUILD_INFO.json`, `VERSION`, `server/version.js`, Kanon (`PRODUCT.md`, `CURRENT_STATE.md`, `TRACEABILITY.md`, `TARGET_CAPABILITIES.json`), aktuelle Dokumente, Skill-Beispiel, `tests/test-current-documentation-contract.js` | `test-manifest`, `test:docs:fast`, `test-capability-contract` grün |
| `6ac069f` | fix(export): `EU_PRIVACY_RESULT_ROOT` an den Worker weitergeben (U-03) | `server/gateway/batch-executor.js`, `tests/test-result-folder-export.js` | `test-result-folder-export`, `test-batch-executor-startup`, `test-direct-picker-intake-worker` grün |
| `379808e` | docs(cowork): verlässlicher Update-/Rollback-Pfad für Cowork-Uploads in IT-Handbuch und UAT-Kit (U-05) | `docs/IT-BETRIEBSHANDBUCH.md`, `docs/acceptance/UAT_TEST_KIT/README.md`, `docs/acceptance/UAT_TEST_KIT/STEP-BY-STEP.md` | `test:docs` grün |
| `943596d` | feat(version): laufende Version in Startantwort, Pflichtantwort und jedem lokalen Fenster (U-02, U-04) | `server/normal-path-response.js`, `server/companion/completion-summary.js`, `server/index.js` (Instruktion vereinheitlicht), `server/prompt-contract.js`, `manifest.json` (sync), Skill `SKILL.md`/`references/beispiele.md`, `docs/ANLEITUNG.md`, `docs/acceptance/UAT_TEST_KIT/STEP-BY-STEP.md`, `tests/test-normal-path-response.js` | `test-normal-path-response`, `test-completion-summary`, `test-manifest`, `test-mcp-protocol`, `test-capability-contract`, `test-cowork-tool-surface-contract`, `test-status-app-server`, `test-native-picker-lifecycle`, `test:skills`, `test:docs` grün |

Beobachteter Flake (nicht behoben, vorbestehend): `npm run test:recovery` lässt
`test-mixed-batch-recovery.js` nach `test-batch-recovery.js` mit „Datei während
der Übernahme verändert“ scheitern; isoliert und ohne diese Änderung in der
Reihenfolge gleich; alleinstehend dreimal grün. Zuordnung BL-002.
Zweiter Flake gleicher Art: `npm run test:docs:fast` lässt am 03.09.2026 in 3 von
5 Läufen `test-uat-fixture-generation.js` mit `SOURCE_IDENTITY_CHANGED` scheitern
(Identitätsvergleich lstat/fstat unmittelbar nach dem Schreiben der 111
Fixtures); alleinstehend und in jeder manuellen Zweiersequenz grün. Generator und
Format-Inspector sind von diesem Nachtrag unberührt. Zuordnung BL-002.
Gemeinsame Wurzel (nachgemessen): Unter aktivem Defender-Echtzeitscan liefert
`fs.renameSync` auf frisch geschriebene temporäre Dateien sporadisch `EPERM`
(1,8 % der Journal-Schreibvorgänge in einer 1.515er-Messreihe); dadurch fielen
nacheinander `test-mixed-batch-recovery`, `test-uat-fixture-generation`,
`test-format-acceptance-matrix` (`PACKAGE_STAGING_PUBLISH_FAILED`) und
`test-workflow-diagnostics` (299 statt 300 Ereignisse) jeweils einmal, jeder Test
alleinstehend mehrfach grün. Siehe U-06.

### Gates und Artefakt des Nachtrags (Stand `cd2aa10`)

| Gate | Ergebnis |
|---|---|
| `npm run test:docs` (fast) | grün; `test-uat-fixture-generation` in der npm-Kette intermittierend `SOURCE_IDENTITY_CHANGED` (siehe Flakes), letzter Lauf grün |
| `npm run test:status-app`, `test:skills`, `test:source-preflight`, `test:parser-contract`, `test:executor-lifecycle`, `test:journal`, `test:locks`, `test:delivery` | grün |
| `npm run test:recovery` | `test-mixed-batch-recovery` in der Kette rot (vorbestehender Flake, siehe oben), isoliert grün |
| `npm run build` | Erstbuild bei `cd2aa10`: SHA-256 `c8d844cc…42fbd`. Zweiter Build bei `f49ee33`: SHA-256 `2145a5cf…eb446`. Endgültiger Build bei `1f10773`: `dist/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc87.zip`, 166 Einträge, 34.918.223 Bytes, SHA-256 `f0b698cecc00aa2e8d45a95ad73fcb9ac7b7019ff9bab4a34f09138a33e96b6e`; SBOM `DataSecure-Privacy-Preflight-v3.2.0-rc87.spdx.json` (`99a68ab5…82505`); `dist/marketplace.release.json` (Platzhalter-URL); `test:plugin-zip` PASS; `claude plugin validate` beide grün |
| `claude plugin validate plugins/data-secure --strict`, `claude plugin validate . --strict` (CLI 2.1.229) | Validation passed |
| `git diff --check` | sauber |
| `npm run test:product` | Läufe 1–5 brachen jeweils an einem anderen, isoliert grünen Test ab (Formatmatrix `PACKAGE_STAGING_PUBLISH_FAILED`; zweimal Workflow-Journal 299/300 vor U-06; `test-direct-picker-batch` nach U-01, Testerwartung in `f49ee33` angepasst; `test-mixed-batch-recovery`, siehe U-07). Lauf 6 auf `f49ee33`: **PASS**, Exit 0, 1.189 s. Lauf 7 auf `1f10773` (mit DS-070): **PASS**, Exit 0, 428 s, „Product full suite passed (25 base + 108 direct test files)“, 119 Suitenzeilen mit „0 failed“ |

Host: Windows 11 Enterprise 10.0.26200, Node v24.19.0 (Build/Tests), gebündeltes
Runtime Node v22.23.2, npm 11.17.0, Claude Desktop 1.40609.1 (laufend) /
1.44121.4 (installiert), Claude Code CLI 2.1.229. Nichts gepusht.

### Abschluss des Nachtrags

End-Commit des Nachtrags: `1f10773` plus der abschließende Ledger-Commit; zwölf lokale Commits seit `124efc9`, nichts gepusht, keine GitHub Actions. `test-batch-session` (68 Fälle) benötigte auf diesem Host 872 s; ein Vergleichswert ohne U-06 wurde nicht erhoben.

### Revalidierung U-05 und U-07 (03.09.2026, nachmittags)

Auf Wunsch des Nutzers erneut drei Read-only-Reviews: privacy-threat-reviewer
(ctime), runtime-quality-reviewer (ctime, Reproduktion), cowork-plugin-reviewer
(Cowork-Update-Wege). Ergebnisse: (1) Die Bindung an die Änderungszeit trägt nichts
zur Inhaltsintegrität bei, weil der SHA-256 der Kopie gegen den Preflight-Hash
geprüft wird; sie erzeugt aber unter Windows-Echtzeitscan Fehlstopps (lokal
reproduziert: 38 von 200 Dateien ändern ctime bei reinen Attributschreibvorgängen,
mtime nie). Uneinigkeit zwischen den Reviewern (nur Kopie vs. alle Quellstellen)
wurde zugunsten aller Stellen entschieden, weil der frühere Fixture-Fehler
nachweislich aus dem Preflight-Pfad kam; die Auflage des Datenschutz-Reviews,
den Hash verpflichtend zu machen, ist umgesetzt. Beschluss als DS-070 im Kanon.
(2) Der Cowork-Upload-Cache ist ein beim Hersteller offener Fehler (#69020,
#65426); technisch umsetzbar ist repo-seitig nur der versionierte Marketplace mit
`archive`-Quelle und SHA-256-Pinning (offiziell dokumentiert), dessen
Manifestprojektion der Build jetzt erzeugt. Die Ablage-URL und die
Marketplace-Freigabe bleiben IT-Aufgaben (BL-051.2); die Wirksamkeit gegen den
Cache-Fehler ist nicht extern belegt. Der 50-MB-Wert in RELEASE.md war fälschlich
Anthropic zugeschrieben und ist korrigiert (offiziell 200 MB/512 MB; 45/50 MiB
sind die eigene Produktgrenze).

### Nachtrag rc88 (03.09.2026, 16:30)

Zweiter UAT-Versuch des Nutzers (15:54–16:04): Cowork lief weiterhin mit rc85
(`gateway_version` in allen Events, Antwortwert `local_intake_accepted_checkpoint_pending`).
Zwei Ordnerauswahlen endeten als `picker_failed`/`local_start_failed`; Ursache
U-08 (bewusste Ablehnung eines gemischten Ordners ohne Grundangabe). Zusätzlich
tauchte die Legacy-Erweiterung „EU Privacy Gateway“ (MCPB) im Chat auf. Der
Upload unter neuer Kennung `data-secure-rc87` landete ebenfalls nur im
Claude-Code-Speicher (U-09).

Build rc88 bei `b4b007d`: `dist/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc88.zip`,
166 Einträge, 34.918.705 Bytes, SHA-256
`2cfa3043335086753280f699424f8e6e7d0564c6a098b634e8746c4ebc45c1b8`; SBOM
`ee1cda6a…da70d`; Upload-Variante `…-rc88-data-secure-rc88.zip`, SHA-256
`0a9caa9a7431d2fd7192ecc2cbb18d4fc27daa1414c1b567bf30749e7e553318`; beide
`claude plugin validate` grün, MCP-Smoke meldet rc88. Volle Produktsuite: siehe
letzte Zeile.

### Nachtrag rc90 (03.09.2026, 17:10)

Auftrag: Fehlerursachen direkt in Cowork sichtbar machen (U-11), vollständiger
Anwendungs-Check inkl. Claude CLI gegen die offiziellen Anthropic-Unterlagen.
Ergebnis des Konformitäts-Reviews (Read-only, MCP-Spezifikation Tools 2025-06-18,
code.claude.com Plugin-Referenz): `toolResult` liefert `content` + `structuredContent`
+ `isError` spezifikationskonform; kein `outputSchema` deklariert, daher ist das
zusätzliche Feld `diagnostic` zulässig; Plugin-Struktur (`plugin.json`, flaches
`.mcp.json` mit `${CLAUDE_PLUGIN_ROOT}`, Skill-Frontmatter) ohne Abweichung.
Gefundene Lücke (Werkzeuge ohne Hülle) behoben, siehe U-11.

Build rc90 bei `e17be48`: `dist/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc90.zip`,
168 Einträge, 34.925.669 Bytes, SHA-256
`4b2dd2410d8173f234a2b7b9b870bede0a89669212585f6074a5160b6625d0f4`; SBOM
`d49941ac…1c281`; Upload-Variante `…-rc90-data-secure-rc90.zip`, SHA-256
`95699cae6d566f2dabd397a8f528c1d10c36e8f060514a1c71cfe5a685b71394`. Beide
entpackt mit `claude plugin validate --strict` grün; MCP-Smoke über die
gebündelte Runtime: `serverInfo.version` rc90, `continue_local_results_handoff`
ohne aktive Übergabe liefert `isError: true`, `error: no_active_local_handoff`,
`diagnostic.cause: NO_ACTIVE_LOCAL_HANDOFF`, `gateway_version` rc90, kein stderr.
`npm run test:plugin-zip` grün. Volle Produktsuite Lauf 11 (nach zentraler
Vervollständigung): 120 Suiten, 0 Fehlschläge.

Offen (Host, keine Repo-Aufgabe): Cowork-Kontocache hält rc85; persönliche
Uploads werden durch die Organisation weder entfernt noch neu angelegt (U-05,
U-09). Die Legacy-Erweiterung „EU Privacy Gateway“ (MCPB) sollte in Claude
Desktop deaktiviert werden. Menschliche E1/E2/E3-Abnahmen bleiben offen.

### Nachtrag rc91 (03.09.2026, 18:05) – zweite Review-Runde

Auftrag: erneute logische, fachlich-inhaltliche und prozesstechnische
Fehlersuche. Drei unabhängige Read-only-Reviews (privacy-threat-reviewer:
Anonymisierungslogik; runtime-quality-reviewer: Prozessablauf Picker → Worker →
Export → Übergabe; cowork-plugin-reviewer: Skill/Prompt/Doku/CLI-Konformität),
Findings U-13 bis U-18, Umsetzung sequenziell in der Hauptsession.

Fachlich zentral ist U-13 (P1): Der Tabellenfall war in keiner Fixture abgedeckt,
obwohl `csvToMarkdown` genau diese Form für jede CSV erzeugt. Der Fix wirkt auf
Redaktion und Residual-Gate gemeinsam, weil beide dieselbe Detektortabelle nutzen.
Als korrekt bestätigt: OCR-Text läuft durch dieselbe Textprüfung, Bilder bleiben
stets `review_required`; DOCX-Kommentare, Änderungsverfolgung, Fuß-/Endnoten und
`mc:AlternateContent` stoppen fail-closed statt still zu verschwinden; IBAN/E-Mail
sind formbasiert und vom Tabellenproblem nicht betroffen. Prozessseitig bestätigt:
atomare Reservierung/Lock mit Tot-PID-Erkennung, Journal-Publikation mit
Identitätsprüfung und Retry, begrenzte IPC-Bestätigung, TOCTOU-gehärtete
Ordnerläufe ohne stilles Teilpaket, Export als nicht-terminale Projektion.
Konformität: `claude plugin validate --strict` (Plugin, Marketplace-Root, beide
entpackten ZIPs) grün; Skill-Frontmatter unter dem offiziellen Limit (1.536 Zeichen
Beschreibung, offizielle Skills-Referenz abgerufen 03.09.2026); Zustandsmatrix
aller Normalweg-Werkzeuge jetzt vollständig mit Antwortregel belegt.

Nicht abgeschlossene Prüfpunkte der Reviewer (Turn-Limit): Review-/Ambiguitätsfluss
auf verzögerte Freigabe (Item 4 Fachreview) und Skill-Behauptungen vs. Engine
(Item 6) wurden nicht bis zum Ende geprüft; offene Testlücken laut Fachreview:
Sozialversicherungsnummer/IBAN in umbrochenen Tabellenzellen, Adelspartikel/Titel
in Spaltenkontext. Als Folgearbeit vermerkt, nicht als behoben.

Build rc91 bei `2448d8f`: `dist/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc91.zip`,
168 Einträge, 34.927.667 Bytes, SHA-256
`3c1063e04b9f21c5b5e6f6b3adcc0d8f0efd9ae7849900ccd00366cda5b98005`; SBOM
`559e14c2…d07d7`; Upload-Variante `…-rc91-data-secure-rc91.zip`, 34.927.674 Bytes,
SHA-256 `61b977c920481fb0e38cf2f2f79eca15be544f1c42b14fcf33bd7438260e84c3`.
`npm run test:plugin-zip` grün; MCP-Smoke über die gebündelte Runtime meldet
rc91 und liefert für `start_completed_local_results_handoff` ohne Stapel
`error: no_completed_local_batch`, `diagnostic.cause: NO_COMPLETED_LOCAL_BATCH`.
Volle Produktsuite Lauf 12 (rc91): 120 Suiten, 0 Fehlschläge.

### Nachtrag rc92 (03.09.2026, 18:45) – dritte Review-Runde

Auftrag: technische Perspektiven (Logging und Fehlerfindung, Technologiebasis,
Anthropic-Standards) plus die offenen Punkte der zweiten Runde. Fünf
Hintergrundläufe: Fehlerinjektion/Nachvollziehbarkeit (runtime-quality-reviewer),
Skill-Qualität gegen die offizielle Skills-Dokumentation (cowork-plugin-reviewer),
Laufzeit/Lieferkette/Prozessgrenzen (privacy-threat-reviewer), Engine-Fuzzing mit
26 Layoutformen plus DOCX-Randteile (privacy-threat-reviewer), offizielle
Eval-Werkzeuge (claude-code-guide). Findings U-19 bis U-30, Umsetzung sequenziell.

Fachlich schwer wiegen U-19 bis U-22: vier unabhängige Erkennungslücken, bei denen
das Residual-Gate jeweils „sauber“ meldete, weil Redaktion und Gate dieselben
Detektoren teilen. Alle 26 Fuzz-Formen des Reviewers laufen jetzt in einem
Sammeltest; als korrekt bestätigt wurden IBAN und Sozialversicherungsnummer ohne
Labelbindung, Adressen über Zellen, Tabellen ohne Außenpipes, verdeckter Text
(`w:vanish`), Textfelder und Hyperlink-Anzeigetexte in DOCX (alle geprüft), Feldcodes
und Alt-Texte fail-closed. Prozessseitig bestätigt: kein `console.*` im Produkt,
Worker-Abstürze mit Exit-Code protokolliert, `network-deny` in jedem Rohinhalts-Worker
(einzige bekannte Ausnahme BL-020.3), PowerShell ohne `-ExecutionPolicy Bypass`,
Argumente als Single-Quote-Literale, COM-Interop mit Legacy-Rückfall unter
Constrained Language Mode, Umgebungs-Allowlist für alle UI-Prozesse, SBOM mit
Lizenzen für alle Fremdkomponenten, OCR-/node_modules-Bäume nicht im ZIP
(Build-Gate). Konformität: Plugin-Struktur, Skill-Frontmatter (197/197 Zeichen),
MCP-Tool-Annotationen (`readOnlyHint` u. a.) und strenge Eingabeschemata entsprechen
der Dokumentation; `claude plugin validate --strict` überall grün.

Nicht erreicht (Turn-Limits der Reviewer): Pfadtraversal/Symlinks in Export und
`purge_local_data` (Item 6 Sicherheitsreview), End-to-End-Nachweis, dass vertagte
Items nie in den Export gelangen (Code-Lesung ohne Befund, kein Harness-Lauf),
vollständiger Abgleich der Skill-Behauptungen zu Token-Semantik und
`usable-with-omissions`, Cowork-Supportartikel zu Upload-Limits. Als Folgearbeit
vermerkt, nicht als behoben.

Build rc92 bei `c86f1fc`: `dist/DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc92.zip`,
169 Einträge, 34.933.101 Bytes, SHA-256
`1ab9f50c56cbc346fdeeeb5ba4a383a8066af1eb7b09af772fcd660dedbec241`; SBOM
`702e3632…4be7`; Upload-Variante `…-rc92-data-secure-rc92.zip`, 34.933.108 Bytes,
SHA-256 `055f77eeeab2e4e966f6237babd33fc4238add7e814606a704f44dbf0ccb5253`. Beide
entpackt `claude plugin validate --strict` grün; MCP-Smoke über die gebündelte
Runtime mit aktiver Laufzeit-Selbstprüfung: Start in 3,4 s, `serverInfo.version`
rc92, Fehlerantwort mit `NO_ACTIVE_LOCAL_HANDOFF`; manipulierte Laufzeit (ein
angehängtes Byte) → Exit 1, genau eine stderr-Zeile
`RUNTIME_INTEGRITY_FAILED`, Markerdatei mit `journal_recorded: true`.
`npm run test:plugin-zip` grün. Volle Produktsuite Lauf 13 (rc92-Arbeitsstand):
121 Suiten, 0 Fehlschläge.
