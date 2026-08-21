---
name: data-secure-compliance
description: Use when explaining DataSecure privacy safeguards, GDPR/DSGVO limitations, EU AI Act implications, audit behavior, human review, or whether a processed document is safe to use with Claude.
version: 3.2.0-rc6
---

# DataSecure Privacy and AI Governance

Explain the architecture accurately:

- The local MCP server is the technical privacy boundary.
- Skills orchestrate the workflow but are not themselves a privacy boundary.
- Raw source content should enter through the local `Input` folder, not by direct chat upload, when pre-model privacy processing is required.
- Claude should receive only released Markdown and released PNG assets from the privacy package.
- Visuals that cannot be verified automatically remain local until human review.
- Audit data must not contain raw source values.

Use precise terminology. Pseudonymization/de-identification is not automatically legal anonymization. Residual re-identification risk can remain through context and quasi-identifiers.

For employment use, distinguish privacy preprocessing from the downstream AI purpose. Recruiting, worker evaluation, promotion/termination, monitoring, or materially significant task allocation can have separate EU AI Act and employment-law consequences. Do not state that this plugin makes such a use compliant.

Do not present the plugin as certified under GDPR/DSGVO or the EU AI Act, and do not provide a legal guarantee.
