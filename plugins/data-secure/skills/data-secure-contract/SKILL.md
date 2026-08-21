---
name: data-secure-contract
description: Use for contracts, agreements, addenda, statements of work, procurement documents, legal correspondence, or similar business documents that should be de-identified before Claude analyzes them.
version: 3.2.0-rc8
---

# Contract Privacy

For TXT/DOCX use `prepare_local_document` with `profile=contract`. For other
supported formats queued in `Input`, use `anonymize_next_document` with
`profile=contract`.

Preserve clauses, obligations, deadlines, amounts, remedies, deliverables and legal/business structure where possible. Pseudonymize parties and representatives and remove direct identifiers or account/contract identifiers according to the local privacy gate.

After processing, use only released privacy-package content and released visuals. Do not use another connector to recover source identities during the privacy workflow.

If a visual is held, explain that it stays local and unavailable to Claude. This
engineering build has no human visual-release path; the preview expires with
retention and inspection cannot approve it.

The plugin performs privacy preprocessing only; it does not certify legal anonymization or provide legal advice.
