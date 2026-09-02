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
