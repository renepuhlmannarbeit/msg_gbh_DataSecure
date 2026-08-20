# Testing

```bash
npm test                # the whole suite
npm run test:golden     # regenerate the golden expected output after an intended change
```

The suite has no npm dependencies. `tests/helpers.js` is a ~50 line runner; each
file prints one line per case and exits non-zero on the first failure.

## What runs

| File | Cases | Covers |
|---|---|---|
| `test-manifest.js` | 13 | version consistency across package.json, MCPB manifest, plugin.json, VERSION, BUILD_INFO and all skills; tool/prompt parity between manifest and server; marketplace target; that the plugin entry point resolves inside the plugin root; that every test the npm script names exists |
| `test-plugin-structure.js` | – | plugin directory layout, skill frontmatter, MCP config |
| `test-parsers.js` | 18 | DOCX/XLSX/PPTX text, entities, embedded and vector media; ZIP hardening; PDF text layer and escapes; CSV fence escaping; every failure path raises `SafeError` instead of returning empty text |
| `test-pii-regression.js` | 32 | golden personnel profile byte for byte, plus one case per defect listed below |
| `test-image-sanitizer.js` | 18 | PNG/BMP round trips, metadata stripping, refusal of unsupported variants, OCR offset mapping, pixel-level redaction with padding and clamping |
| `test-visual.js` | 19 | every branch of the visual gate with injected OCR and rasteriser bridges |
| `test-gateway-e2e.js` | 13 | the four document types end to end, human approval, tamper detection, path traversal, fail-closed rollback |
| `test-mcp-protocol.js` | 21 | the server driven over real stdio: handshake, schemas, annotations, error codes, notification handling, stdout framing |

Total: 134 assertions-level cases plus the plugin structure check.

## Fixtures

`npm run fixtures` generates the Office and PDF fixtures from
`tests/make-fixtures.js`. They are not committed: CI fails if any `.pdf`,
`.doc*`, `.xls*` or `.ppt*` file is tracked.

`tests/fixtures/synthetic-personnel-profile.md` is committed because it is plain
text. Every value in it is invented.

## The golden file

`tests/expected/synthetic-personnel-profile.expected.md` is generated, not
hand-written. When a change to the engine intentionally changes the output, run
`npm run test:golden` and review the diff before committing it. A hand-written
expectation is how the previous version ended up asserting behaviour the code
never had.

## Regression cases

Each of these corresponds to a defect found in 3.2.0-rc2:

- an upper-case German word (`SOFTWARE`, `UNTERNEHMEN`, `HOFFMANN`) was matched
  as a BIC and replaced before the person rule ran, leaking the given name
- an 11-digit order number or a German-formatted amount blocked the residual
  gate forever, because the gate reported identifier classes the redactor had no
  rule to remove
- `\b` is ASCII-only, so names and organisations with umlauts or `ß` were never
  matched
- a bare surname without an honorific was never replaced
- the same person received several pseudonyms via `Herr X` / `Frau X` / `X`
- the organisation allow list was unreachable, because it was compared against
  strings that always end in a legal form
- every title-case bigram in a personnel profile became a person, so `User
  Stories` and `Azure DevOps` were pseudonymised
- markdown heading prefixes were eaten by the customer/project line rule
- a labelled employee number was documented as removed but matched no detector

## Platform coverage

CI runs the suite on `ubuntu-latest` and `windows-latest`. Windows is the only
supported runtime, so a Linux-only pipeline would not prove much; the visual
bridge itself is stubbed in tests and still needs one manual acceptance run on a
target machine with Windows OCR available.

## Still requiring manual acceptance

- Windows OCR against a real scanned document
- EMF/WMF rasterisation through the PowerShell bridge
- plugin installation in the Claude pilot environment
