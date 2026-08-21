# DataSecure Privacy Preflight

Claude plugin for local privacy preflight of PDF, DOCX, XLSX, PPTX, text and standalone PNG/JPEG/BMP documents.

The plugin combines:

- Claude Skills for routing, purpose/profile selection and governance guidance.
- A local MCP server for the actual privacy boundary and file processing.
- A fail-closed output model: Claude reads only released Markdown and released PNG assets.

## User workflow

1. For TXT or DOCX, ask Claude to prepare a local document. DataSecure opens a
   local file picker; on Windows it then offers a local, redaction-only review.
2. For PDF, XLSX, PPTX, MD, CSV or images, ask Claude to open the privacy folder
   and copy the source into `Input`.
3. Ask Claude to anonymize/de-identify the document.
4. Claude uses only the released Markdown and released PNG assets.
5. Visuals that cannot be verified automatically stay local under
   `Needs Visual Review`. This engineering build has no human visual-release
   path, so opening the folder does not make those assets readable by Claude.

The Windows text review may add `[MANUAL_REDACTION]` replacements but cannot
freely edit professional content. Skipping the optional review does not bypass
technical coverage, residual-PII or visual gates.

Do not upload or paste a raw sensitive source document directly into Claude if the goal is to prevent Claude from seeing the original content before privacy processing.

This plugin does not provide legal advice, a guarantee of legal anonymization, GDPR certification, or EU AI Act certification.
