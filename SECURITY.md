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
Markdown and explicitly released visual assets. It is a technical privacy
control, not a legal certification of anonymity, GDPR compliance, or EU AI Act
compliance.

See [docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md) for where the
boundary sits, what reaches Claude, and every fail-closed point.

## Build provenance

Every CI build publishes the plugin ZIP and MCPB together with an SPDX 2.3 SBOM
and `SHA256SUMS`. The SBOM records that the shipped Node.js implementation and
statically linked native Windows launcher have no third-party runtime package
dependencies and cryptographically binds the two archives to the release metadata.
Separate CodeQL jobs analyze JavaScript and the C++ launcher on pull requests and
pushes to `main`.

GitHub CodeQL supports uploading results for public repositories and private
organisation repositories with GitHub Code Security enabled. This private repo
does not depend on that paid upload/UI feature: CI runs the analysis locally,
fails when the generated SARIF contains a finding, and archives the SARIF as a
14-day workflow artefact. A missing or malformed report also fails closed. If
GitHub Code Security is enabled later, SARIF upload can be added without changing
the release gate. All workflow Actions are pinned to immutable commit SHAs.
