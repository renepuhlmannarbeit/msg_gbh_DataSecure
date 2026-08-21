# PII-Shield comparison — 2026-08-21

## Reproducible baseline

- PII-Shield: unmodified `v2.2.0`, commit
  `e2e0fed96c93bcbb87857ee600c379556fb36c27`
- GLiNER model loaded successfully (`ner_ready: true`)
- corpus: `tests/fixtures/synthetic-personnel-profile.md`; all values invented
- command: `npm run benchmark:pii-shield`
- acceptance rule: identifiers must disappear; substantive content must remain
  byte-for-byte as a literal within the converted text

## Twenty corpus checks

DataSecure passed **20/20**. PII-Shield passed **14/20**.

PII-Shield missed these six required de-identifications even with GLiNER ready:

1. `ERIKA BEISPIEL`
2. `Speicherstraße 12`
3. `Projekt Orion`
4. `Stadtwerke Beispielstadt`
5. `Kundenportal NOVA`
6. `Beispielstadt` in the second project location

Both systems preserved all eight checked business-content literals: roles,
exact month/year project periods, method, tool, task and qualification.

## Executed format matrix

| Input | DataSecure | PII-Shield 2.2.0 |
|---|---:|---:|
| TXT / MD / CSV | yes | yes |
| DOCX | yes | yes |
| text-layer PDF | yes | yes |
| XLSX | yes | no — CLI rejects `.xlsx` |
| PPTX including notes | yes | no — CLI rejects `.pptx` |
| standalone PNG/JPEG/BMP | yes, explicit profile + local OCR/visual gate | no — CLI rejects image extensions |
| scanned PDF with extractable JPEG page image | yes, explicit profile + local OCR/visual gate | no — tested scan was rejected by the PDF extractor |

The DataSecure PNG route additionally passed a real Windows OCR, pixel
redaction and second-OCR verification run via `npm run test:windows-visual`.

## Operational findings

- PII-Shield's CLI model installer honours `PII_SHIELD_DATA_DIR`, but its model
  discovery does not include that location. Without also setting
  `PII_SHIELD_MODELS_DIR`, the CLI exited successfully while reporting
  `ner_ready: false` and used patterns only.
- The CLI validates file paths and extensions before writing a batch. If a
  later parser/processing step fails, its source explicitly preserves already
  written partial results and the partial mapping. It is therefore not an
  atomic all-or-nothing batch.
- Identity mappings are persisted for deanonymisation. This conflicts with the
  selected ephemeral mapping lifecycle.
- PII-Shield provides a mature local text review UI with add/remove overrides;
  review can be skipped. DataSecure now has a Windows text-review vertical slice
  with marked text hints, selection-only additional redactions and post-edit verification,
  but not yet equivalent cross-platform UX or per-finding controls.
- `npm ci` for the unmodified upstream lockfile reported 20 dependency
  vulnerabilities: 1 low, 6 moderate, 12 high and 1 critical. Exploitability
  in this local workflow was not assessed by this functional benchmark.

## Decision

PII-Shield is not sufficient unchanged for the required workflow. Its GLiNER
detector and text-review UX remain useful reference implementations. DataSecure
has the broader and safer file boundary plus a first fail-closed local text-review
path, but still needs cross-platform review parity and a consciously started
cross-document batch with an ephemeral shared placeholder map before it satisfies
every agreed requirement.
