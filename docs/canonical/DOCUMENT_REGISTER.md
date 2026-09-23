# Kanonisches Dokumentenregister

Stand: 23.09.2026

## Normativ aktuell

Der RC109-Abgleich trennt aktive Produkt-/Zweckaussagen von damaligen
Reviewurteilen. Das frühere Open-Source-Auswahlregister ist unter
`docs/archive/2026-09/OPEN_SOURCE_COMPONENTS_BEFORE_RC109.md` vollständig
erhalten; aktuelle Komponenten und Verwendung stehen ausschließlich im aktiven
Register. `DOCUMENT_INDEX.json` führt diese Ablösung und DS-085/086 mit.

| Dokument | Zweck |
|---|---|
| `DECISIONS.md` | Entscheidungen mit aktuellem Status |
| `PRODUCT_VISION.md`, `PRODUCT.md` | Ziel und Produktvertrag |
| `STANDALONE_ARCHITECTURE.md`, `STANDALONE_SECURITY_MODEL.md` | Standalone-Nutzerfluss, Sicherheits- und Konvertergrenze, Lieferstufen und Diagnosevertrag |
| `TARGET_ARCHITECTURE.md`, `UML_ARCHITECTURE.md`, `REFACTORING_PLAN.md` | Architektur, codebasierte UML-Prüfsichten und Lieferreihenfolge |
| `BACKLOG.md` | einzige aktive Arbeitsliste |
| `ACCEPTANCE_LEVELS.md` | verbindliche Definition der technischen N3- und formalen N4-Abnahme |
| `CURRENT_STATE.md` | aktueller belegter Iststand |
| `TRACEABILITY.md`, `BACKLOG_EVIDENCE_MATRIX.md` | aktuelle Zuordnung und Evidencegrenzen |
| `TARGET_CAPABILITIES.json`, `HOST_MATRIX_V1.json`, `RUNTIME_START_MATRIX_V1.json` | maschinenlesbare Ziel-, Host- und Runtimeverträge; Zielaussagen sind keine Istfreigabe |
| `contracts/COWORK_INTERACTION_V1.md` | kanonische Cowork-Werkzeug-, Human-Gate-, Status- und Modell-Evidence-Semantik nach DS-099 |
| `HOST_MATRIX_V1.md`, `STATUS_APP_PILOT_V1.md` | menschenlesbare Hostregel und bewusst deaktivierter Statuskartenpilot |
| `OPEN_SOURCE_COMPONENTS.md` | verbindliches Wiederverwendungsregister |
| `DOCUMENT_INDEX.json` | maschinenlesbarer Status, Geltungsbereich, Eigentümer, Versionsregel und Ablösung aller führenden Dokumentklassen |
| `../archive/INDEX.md` | stabile `ARCH-*`-Kennungen und Fundstellen historischer Dokumentgruppen |
| `../acceptance/CLAUDE_CODE_PILOT/README.md`, `contract.json` | BL-041.20: eigener 14-Fälle-Hostplan und kostenfreier lokaler Vorcheck; keine Hostfreigabe |

### Vertragsstatus unter `contracts/`

Der Ordner ist ein Vertragsarchiv mit unterschiedlichen Geltungsständen, nicht
pauschal ein Satz aktuell erfüllter Produktverträge:

- **aktuelle Produkt- und Sicherheitsgrenzen:** `BATCH_EVIDENCE_V1.md`,
  `BATCH_PARALLELISM_V1.md`, `BATCH_REVIEW_V2.md`, `BATCH_SNAPSHOT_V1.md`,
  `CONTENT_GRAPH_V1.md`, `CSV_SOURCE_V1.md`, `DOCX_STORY_COVERAGE_V1.md`,
  `EMBEDDED_CONTENT_V1.md`, `NETWORK_BOUNDARY_V1.md`, `OUTPUT_CAPACITY_V1.md`,
  `POSIX_SUPERVISOR_PACKAGING_V1.md`, `PRIVATE_WORK_STORAGE_V1.md`,
  `RESULT_GRADES_V1.md`, `SOURCE_PREFLIGHT_V1.md`, `SUPPORT_TRACE_V1.md` und
  `TEXT_SOURCE_V1.md`;
- **Ziel-/NO-GO-Verträge ohne aktuelle Produktfreigabe:**
  `OCR_BATCH_SESSION_V1.md`, `OCR_RESULT_V1.md`,
  `PDF_OCR_RISK_GATE_V1.md`, `SEA_ASSEMBLY_EVIDENCE_V2.md` und
  `SEA_PARSER_ROLE_V1.md`;
- **historisch oder superseded:** `BATCH_REVIEW_V1.md`; die alten
  Schlüsselbund-/Verschlüsselungsverträge liegen als
  `BATCH_SECRET_STORE_V1_LEGACY.md` und
  `PRIVATE_ARTIFACT_ENCRYPTION_V1_LEGACY.md` ausschließlich unter
  `docs/archive/2026-09/retired-active-docs`. `BATCH_PSEUDONYM_V1.md` beschreibt
  den aktuellen rohwertfreien, stapelweit stabilen und neustartfesten
  Pseudonymkontext ohne Schlüsselbund (v1 für Plugin/Altstapel, lesbares v2 für
  neue Standalone-Stapel nach DS-084).

Der Statuskopf des einzelnen Vertrags und `CURRENT_STATE.md` entscheiden bei
Widersprüchen. Ein vorhandener Vertrag belegt weder Implementierung noch E1-/E2-
Abnahme.

## Abgeleitet aktuell

| Dokument | Zielgruppe |
|---|---|
| `README.md`, `docs/ANLEITUNG.md` | Interessierte und Anwender |
| `docs/ANWENDERREVIEW.md` | Product Owner, UX, UAT |
| `docs/IT-BETRIEBSHANDBUCH.md` | IT-Betrieb und Support |
| `docs/PILOT-ABNAHME.md`, `docs/acceptance/UAT_TEST_KIT/*`, `docs/acceptance/STANDALONE_UAT_TEST_KIT/*`, `docs/acceptance/FORMAL_UAT/*` | Testverantwortliche; Produktfälle plus gemeinsame N3/N4-Kampagnensteuerung |
| `docs/PLUGIN_SECURITY_MODEL.md`, `SECURITY.md` | Security, Datenschutz, Architektur |
| `docs/RELEASE.md`, `docs/TESTING.md`, `BUILD_INFO.json` | Entwicklung und Release Engineering |
| `docs/FORMAT_COVERAGE_MATRIX.md` | belegter und geplanter Formatumfang; keine Freigabe ohne zugehörige Evidence |
| `docs/DETECTOR_BENCHMARK.md` | synthetische, reproduzierbare Detektorbaseline; keine Aussage universeller Genauigkeit |
| `docs/REVIEW_CLAUDE_COWORK_2026-09-01.md` | zeitgebundene Herstelleraufnahme; aktuelle Produktgrenze steht in DS-078 und der Hostmatrix |
| `docs/REVIEW_PRODUCT_HOSTS_2026-09-23.md` | zeitgebundener Mehrdimensionenreview beider Produkte und Claude-Code-Hostoption; Befunde PH-20260923, offene Arbeit ausschließlich im Backlog |
| Plugin-/Skill-READMEs und Skilltexte | Installation, Betrieb und Modellablauf |
| `CLAUDE.md`, `.claude/agents/*` | knapper Claude-Code-Projektkontext und versionierte Read-only-Prüfrollen; kein Produktvertrag |

## Historisch, nicht entscheidungsführend

- `ARCH-DOC-REVIEW-BOTH-RC99` unter
  `docs/archive/2026-09/reviews/REVIEW_BEIDE_PRODUKTE_2026-09-04.md`:
  zeitgebundener Gesamtbericht zum
  RC99-Stand beider Produkte. Sein damaliges Urteil bleibt als Evidence
  erhalten; aktuelle Aussagen und Nachweisgrenzen führt `CURRENT_STATE.md`.
  Dies entspricht `historical` und `superseded_by: CANON-CURRENT` im
  maschinenlesbaren Dokumentindex.
- `ARCH-DOC-COWORK-BID-REVIEW-2026-09-11` unter
  `docs/archive/2026-09/reviews/REVIEW_COWORK_BID_STRUKTURMUSTER_2026-09-11.md`:
  read-only Herkunftsnachweis der übernommenen allgemeinen Cowork-Muster. Die
  aktive Produktsemantik steht ausschließlich in DS-099 und
  `COWORK_INTERACTION_V1.md`.
- [`docs/archive`](../archive/README.md) mit
  [stabilem Archivindex](../archive/INDEX.md): frühere Architektur-, Review-,
  Release-, Test- und Kanonvollstände.
- `BACKLOG_ARCHIVE_2026-08.md` und `BACKLOG_ARCHIVE_2026-09.md`: erledigte Stories.
- `tasks/archiv`: abgeschlossene Claude-/Codex-Aufträge und Berichte.
- `docs/acceptance/RC30_HUMAN_TEST_KIT` und `RC63_UAT_TEST_KIT`: reproduzierbare
  historische Fixture-/UAT-Basen; der aktuelle Einstieg ist `UAT_TEST_KIT`.
- `docs/archive/2026-09/retired-active-docs`: frühere Architektur-, Companion-,
  Rechts-, PDF- und PII-Shield-Unterlagen, die wegen überholter Aussagen zu
  MCPB, Signierung, VM, Keyring, Mapping oder Recovery nicht mehr im aktiven
  Dokumentbaum liegen.
- `docs/*BENCHMARK*` und `docs/SKILL_EVALUATION.md`: verbleibende spezialisierte
  Evidenz bzw. Hintergrund, keine aktuelle Produktzusage und kein zweites Backlog.

Historische Dateien dürfen Keyring, verschlüsselte Arbeitskopien, MCPB als
Nutzerweg, auswählbare Bildmodi oder alte Retentionmodelle beschreiben. Diese
Aussagen gelten nicht für das aktuelle Produkt.

## Pflege

Jede aktuelle Datei braucht einen Zweck, einen eindeutigen Geltungsbereich und
Links zum Kanon. Ein RC-Bericht wird nach Übernahme seiner offenen Punkte
archiviert. Im Root von `tasks/` liegt höchstens ein aktueller schreibender
Auftrag; daneben darf genau ein zeitgebundener Read-only-Reviewauftrag liegen.
