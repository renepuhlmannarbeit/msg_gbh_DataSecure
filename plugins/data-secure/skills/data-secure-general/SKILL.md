---
name: data-secure-general
description: Use for local business documents that need privacy preflight before Claude analysis when no customer, applicant, personnel, or contract profile clearly applies.
version: 3.2.0-rc8
---

# General Document Privacy

For TXT/DOCX use `prepare_local_document` with `profile=general`, or
`profile=auto` when document type classification should be delegated to the local
privacy engine. For other supported formats queued in `Input`, use
`anonymize_next_document` with the same profile choice.

Keep useful non-identifying business content where possible while removing recognized direct identifiers. Use only released Markdown and released visual assets after processing.

If an asset cannot be verified automatically, it stays local and unavailable to
Claude until its preview expires. This engineering build has no human visual-release
path. Do not bypass the privacy gate by reading the raw source through another
connector.
