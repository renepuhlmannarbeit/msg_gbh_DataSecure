# Kanonisches Dokumentenregister

Stand: 01.09.2026

## Normativ aktuell

| Dokument | Zweck |
|---|---|
| `DECISIONS.md` | Entscheidungen mit aktuellem Status |
| `PRODUCT_VISION.md`, `PRODUCT.md` | Ziel und Produktvertrag |
| `TARGET_ARCHITECTURE.md`, `REFACTORING_PLAN.md` | Architektur und Lieferreihenfolge |
| `BACKLOG.md` | einzige aktive Arbeitsliste |
| `CURRENT_STATE.md` | aktueller belegter Iststand |
| `TRACEABILITY.md`, `BACKLOG_EVIDENCE_MATRIX.md` | aktuelle Zuordnung und Evidencegrenzen |
| `TARGET_CAPABILITIES.json`, `HOST_MATRIX_V1.json` | maschinenlesbare Ziel- und Hostverträge; Zielaussagen sind keine Istfreigabe |
| `OPEN_SOURCE_COMPONENTS.md` | verbindliches Wiederverwendungsregister |

### Vertragsstatus unter `contracts/`

Der Ordner ist ein Vertragsarchiv mit unterschiedlichen Geltungsständen, nicht
pauschal ein Satz aktuell erfüllter Produktverträge:

- **aktuelle Produkt- und Sicherheitsgrenzen:** `BATCH_EVIDENCE_V1.md`,
  `BATCH_PARALLELISM_V1.md`, `BATCH_REVIEW_V1.md`, `BATCH_SNAPSHOT_V1.md`,
  `CONTENT_GRAPH_V1.md`, `CSV_SOURCE_V1.md`, `DOCX_STORY_COVERAGE_V1.md`,
  `EMBEDDED_CONTENT_V1.md`, `NETWORK_BOUNDARY_V1.md`, `OUTPUT_CAPACITY_V1.md`,
  `POSIX_SUPERVISOR_PACKAGING_V1.md`, `PRIVATE_WORK_STORAGE_V1.md`,
  `RESULT_GRADES_V1.md`, `SOURCE_PREFLIGHT_V1.md` und `TEXT_SOURCE_V1.md`;
- **Ziel-/NO-GO-Verträge ohne aktuelle Produktfreigabe:**
  `OCR_BATCH_SESSION_V1.md`, `OCR_RESULT_V1.md`,
  `PDF_OCR_RISK_GATE_V1.md`, `SEA_ASSEMBLY_EVIDENCE_V2.md` und
  `SEA_PARSER_ROLE_V1.md`;
- **historisch oder superseded:** `BATCH_SECRET_STORE_V1.md` und
  `PRIVATE_ARTIFACT_ENCRYPTION_V1.md`. `BATCH_PSEUDONYM_V1.md` enthält noch den
  historischen Keyring-Entwurf; nur das ausdrücklich durch DS-065 korrigierte
  fachliche Ziel einer stapelweit stabilen, lokalen Zuordnung bleibt offen.

Der Statuskopf des einzelnen Vertrags und `CURRENT_STATE.md` entscheiden bei
Widersprüchen. Ein vorhandener Vertrag belegt weder Implementierung noch E1-/E2-
Abnahme.

## Abgeleitet aktuell

| Dokument | Zielgruppe |
|---|---|
| `README.md`, `docs/ANLEITUNG.md` | Interessierte und Anwender |
| `docs/ANWENDERREVIEW.md` | Product Owner, UX, UAT |
| `docs/IT-BETRIEBSHANDBUCH.md` | IT-Betrieb und Support |
| `docs/PILOT-ABNAHME.md`, `docs/acceptance/UAT_TEST_KIT/*` | Testverantwortliche |
| `docs/PLUGIN_SECURITY_MODEL.md`, `SECURITY.md` | Security, Datenschutz, Architektur |
| `docs/RELEASE.md`, `docs/TESTING.md`, `BUILD_INFO.json` | Entwicklung und Release Engineering |
| `docs/REVIEW_CLAUDE_COWORK_2026-09-01.md` | aktueller zeitgebundener Herstellerabgleich |
| Plugin-/Skill-READMEs und Skilltexte | Installation, Betrieb und Modellablauf |

## Historisch, nicht entscheidungsführend

- [`docs/archive`](../archive/README.md): frühere Architektur-, Review-, Release-,
  Test- und Kanonvollstände.
- `BACKLOG_ARCHIVE_2026-08.md` und `BACKLOG_ARCHIVE_2026-09.md`: erledigte Stories.
- `tasks/archiv`: abgeschlossene Claude-/Codex-Aufträge und Berichte.
- `docs/acceptance/RC30_HUMAN_TEST_KIT` und `RC63_UAT_TEST_KIT`: reproduzierbare
  historische Fixture-/UAT-Basen; der aktuelle Einstieg ist `UAT_TEST_KIT`.
- `ARCHITECTURE_DECISION.md`, `docs/PRODUCT_ARCHITECTURE_DECISION.md`,
  `docs/PLUGIN_TARGET_ARCHITECTURE.md` und `docs/PDF_*`: frühere Architektur- und
  Spike-Nachweise. Ihre historischen Pfade bleiben wegen Test-/Querverweisen
  erhalten; jeder Einstieg ist sichtbar als historisch markiert.
- `docs/*BENCHMARK*`, `docs/SKILL_EVALUATION.md`, `docs/COMPANION_*` und
  `docs/AI_ACT_AND_GDPR.md`: spezialisierte Evidenz bzw. Hintergrund, keine
  aktuelle Produktzusage und kein zweites Backlog.

Historische Dateien dürfen Keyring, verschlüsselte Arbeitskopien, MCPB als
Nutzerweg, auswählbare Bildmodi oder alte Retentionmodelle beschreiben. Diese
Aussagen gelten nicht für das aktuelle Produkt.

## Pflege

Jede aktuelle Datei braucht einen Zweck, einen eindeutigen Geltungsbereich und
Links zum Kanon. Ein RC-Bericht wird nach Übernahme seiner offenen Punkte
archiviert. Im Root von `tasks/` liegt höchstens ein aktueller Auftrag.
