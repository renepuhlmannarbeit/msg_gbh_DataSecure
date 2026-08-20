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
