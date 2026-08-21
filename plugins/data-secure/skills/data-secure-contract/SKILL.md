---
name: data-secure-contract
description: Use for contracts, agreements, addenda, statements of work, procurement documents, legal correspondence, or similar business documents that should be de-identified before Claude analyzes them.
version: 3.2.0-rc8
---

# Contract Privacy

Use `anonymize_next_document` with `profile=contract`.

Preserve clauses, obligations, deadlines, amounts, remedies, deliverables and legal/business structure where possible. Pseudonymize parties and representatives and remove direct identifiers or account/contract identifiers according to the local privacy gate.

After processing, use only released privacy-package content and released visuals. Do not use another connector to recover source identities during the privacy workflow.

If a visual is held, its local review preview can expire before approval; ask the user to review it promptly.

The plugin performs privacy preprocessing only; it does not certify legal anonymization or provide legal advice.
