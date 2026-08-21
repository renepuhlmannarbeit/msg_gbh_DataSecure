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
| `test-parsers.js` | 21 | DOCX/XLSX/PPTX text, entities, embedded and vector media; ZIP hardening including false sizes, aggregate limits and header consistency; PDF text layer and escapes; CSV fence escaping; every failure path raises `SafeError` instead of returning empty text |
| `test-pii-regression.js` | 35 | golden personnel profile byte for byte, common German telephone/address formats, plus one case per defect listed below |
| `test-image-sanitizer.js` | 20 | PNG/BMP round trips, bounded PNG decompression and chunk lengths, metadata stripping, refusal of unsupported variants, OCR offset mapping, pixel-level redaction with padding and clamping |
| `test-visual.js` | 19 | every branch of the visual gate with injected OCR and rasteriser bridges |
| `test-gateway-e2e.js` | 15 | the four document types end to end, human approval, tamper detection, path traversal, source claiming and failure-injected publish/move rollback |
| `test-mcp-protocol.js` | 21 | the server driven over real stdio: handshake, schemas, annotations, error codes, notification handling, stdout framing |
| `test-adversarial.js` | 20 | hostile document content, Unicode that looks like text but is not, pathological sizes and regex behaviour, mutated containers, determinism, concurrency, the MCP argument surface |
| `exploratory-review-20.js` | 20 | alternative German phone/address/name forms, Unicode e-mail and IDN, IPv6, lower-case IBAN, labelled birth dates and vehicle plates, customer URLs, duplicate ZIP entries and PNG CRC integrity |

Total: 184 assertion-level cases plus the plugin structure check.

## The adversarial suite

The other files check that documented behaviour holds. This one attacks from
angles the design did not explicitly plan for, and each angle has found
something:

| Angle | What it asks |
|---|---|
| Hostile content | Does a document that instructs Claude, forges a placeholder or forges a compliance header change any behaviour? |
| Unicode | Do decomposed umlauts, soft hyphens, zero-width characters or non-Latin scripts get past the name patterns? |
| Sizes and regexes | Does any pattern backtrack catastrophically? Does a 90 kB document stay in budget? |
| Malformed containers | Do 40 byte-level mutations of a DOCX ever raise something other than `SafeError`? Can a ZIP entry escape? Can an IHDR claim 3.6 gigapixels? |
| Determinism | Is the same input byte-identical twice? Do pseudonyms leak between documents? |
| Concurrency and arguments | Can two parallel runs produce two packages from one source? Can a read argument reach another file, or a negative offset misbehave? |

Findings it produced, all fixed:

- decomposed umlauts (NFC vs NFD) were not matched at all, so a surname in a
  document exported from macOS passed through untouched
- a Word soft hyphen (`U+00AD`) inside a surname hid it from every name pattern;
  Word inserts these for justified text, so this is an ordinary document
- `POSTAL_ADDRESS_RE` used `\s+`, which matches a newline: "20457 Hamburg" ate
  the blank line and the first token of the next paragraph and produced
  `[LOCATION_REDACTED]-2026-0815`. `PHONE_RE` and `DE_SV_RE` had the same
  latitude. All structured detectors are line-local now, which is asserted
  generically rather than per pattern.

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
