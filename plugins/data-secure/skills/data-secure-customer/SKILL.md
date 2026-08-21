---
name: data-secure-customer
description: Use for customer records, CRM exports, support cases, account documents, customer correspondence, or other client-related material that should be privacy-processed before Claude analyzes it.
version: 3.2.0-rc4
---

# Customer Document Privacy

Use `anonymize_next_document` with `profile=customer`.

Keep business-relevant facts, issue descriptions, dates, amounts, products, actions and process context where possible. Remove direct identifiers and pseudonymize identifying customer/organization context according to the local privacy gate.

After processing, use only `read_anonymized_document` and released visual assets. Never fall back to the original source through another connector in the same privacy workflow.

If a visual is held for review, keep it local until the user explicitly confirms a privacy review.
