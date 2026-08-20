---
name: data-secure-general
description: Use for local business documents that need privacy preflight before Claude analysis when no customer, applicant, personnel, or contract profile clearly applies.
version: 3.2.0-rc2
---

# General Document Privacy

Use `anonymize_next_document` with `profile=general`, or `profile=auto` when document type classification should be delegated to the local privacy engine.

Keep useful non-identifying business content where possible while removing recognized direct identifiers. Use only released Markdown and released visual assets after processing.

If an asset cannot be verified automatically, keep it local for human review. Do not bypass the privacy gate by reading the raw source through another connector.
