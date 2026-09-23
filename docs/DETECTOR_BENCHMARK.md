# Detector benchmark

This benchmark compares detector candidates without adding them to the released plugin.
Every adapter receives the same version-controlled, synthetic ground truth and must return
only spans plus anonymized output. No real document, network request or model download is
part of the benchmark.

## Current synthetic-corpus baseline (3.2.0-rc140)

Command:

```bash
npm run benchmark:detectors
```

The deterministic contract corpus contains 150 cases, 107,139 characters, 1,950 sensitive
entities and 900 explicit preservation controls. It combines 30 public company-name tokens,
30 invented people, ten invented addresses and six layouts. The current DataSecure baseline
detects all 1,950 entities with no extra span and retains all 900 business and certification
controls: precision 1.0, recall 1.0, F1 1.0 and preservation rate 1.0.

This is a regression baseline for this synthetic corpus, not evidence of universal accuracy.
Runtime is reported for comparison but is machine-dependent. Real pilot documents remain a
separate, local, human-reviewed acceptance step.

RC111 additionally tests a length-preserving compatibility view for structured
identifiers (selected fullwidth characters and dot leaders) and scheme-specific
contact-URI boundaries. Those regressions are separate from these 150 corpus
cases. They do not claim arbitrary Unicode-confusable coverage. The original
text and UTF-16/OCR/review positions remain authoritative; pure Markdown
conversion never applies this privacy-only detection view.

## Metrics and adapter contract

`benchmarks/contract-corpus.js` owns the neutral cases and exact expected spans.
`benchmarks/evaluate-detector.js` reports aggregate and per-entity precision, recall and F1,
severity-weighted false negatives, retained professional content, runtime and throughput.
Invalid spans and duplicate or unrelated predictions cannot improve the score.

An adapter receives `{ source, profile }` and returns:

```js
{ spans: [{ type, start, end }], output: 'anonymized text' }
```

Benchmark output contains aggregates only. It must never contain source text, names, file
names, paths, mappings or document hashes.

## External evaluation order

1. Evaluate DocCloak.Core's regex-only path in an isolated, pinned test environment. This is
   the lowest-complexity candidate and requires no model in the product.
2. Evaluate Microsoft Presidio as an external Python benchmark, not as a plugin dependency.
3. Evaluate GLiNER/ONNX only with pinned offline artifacts, recorded license and hashes, and
   a security and package-size review.
4. Consider product integration only when a candidate reduces severity-weighted false
   negatives without lowering preservation, weakening fail-closed gates or changing the two
   user-facing skills.

The MCP Apps review UI is a separate experiment. A better interface cannot compensate for a
worse detector, and it receives no release authority.
