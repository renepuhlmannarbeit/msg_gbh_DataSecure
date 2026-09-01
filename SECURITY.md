# Security Policy

## Sensitive data

This repository is private. That reduces exposure, but it does not make it a
lawful place for personal data: a repository has no retention control, no
deletion path once something is committed, and every clone replicates the full
history. Do not put real employee, applicant, customer, contract, authentication
or other confidential data into issues, commits, pull requests, test fixtures or
build artefacts. Use synthetic examples only.

CI enforces the mechanical part of this: a tracked `.pdf`, `.doc*`, `.xls*` or
`.ppt*` file fails the build. The rule itself is broader than what CI can check.
Gitleaks additionally scans the complete Git history on every pull request and
push to `main`. Findings are redacted in CI output. A clean scan is evidence
that the configured detectors found no known secret pattern; it is not evidence
that the repository contains no personal or confidential information.

If something confidential was committed, treat rewriting the history and
rotating any exposed secret as the fix. Removing it in a later commit is not
enough — it stays in the history and in every existing clone.

Report a security issue that could expose personal or confidential data privately
to the repository owner rather than posting exploitable details.

## Design boundary

The gateway processes originals locally and exposes to Claude only verified
Markdown. Image pixels remain local and there is no user- or model-controlled
visual-release path in the current product. It is a technical privacy control,
not a legal certification of anonymity, GDPR compliance, or EU AI Act
compliance.

See [docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md) for where the
boundary sits, what reaches Claude, and every fail-closed point.

## Build provenance

The user-facing product build creates the plugin ZIP together with an SPDX 2.3
SBOM and `SHA256SUMS`. The private Marketplace uses the same plugin source. MCPB
is an internal engineering artefact and is neither a user channel nor part of
the normal product build. The SBOM cryptographically binds the product archive,
the native Windows launcher and the disabled status-card inventory to the build
metadata. It is not an exhaustive component-level inventory of the bundled OCR
tree; that tree carries its own manifest and licence notices inside the archive.

The cost-capped default CI runs the product regression gates. Manual evidence
workflows cover the more expensive platform, native, CodeQL and release checks;
therefore a local build or an arbitrary CI run must not be described as a
three-platform release approval.

GitHub CodeQL supports uploading results for public repositories and private
organisation repositories with GitHub Code Security enabled. This private repo
does not depend on that paid upload/UI feature: the dedicated manual workflow
runs the analysis locally, fails when the generated SARIF contains a finding,
and archives the SARIF as a time-limited workflow artefact. A missing or
malformed report also fails closed. If GitHub Code Security is enabled later,
SARIF upload can be added without changing that gate. Workflow Actions are
pinned to immutable commit SHAs.
