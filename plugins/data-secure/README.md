# DataSecure Privacy Preflight

Claude plugin for local privacy preflight of PDF, DOCX, XLSX, PPTX, text and standalone PNG/JPEG/BMP documents.

The plugin combines:

- Claude Skills for routing, purpose/profile selection and governance guidance.
- A local MCP server for the actual privacy boundary and file processing.
- A fail-closed output model: Claude reads only released Markdown and released PNG assets.

## User workflow

1. Ask Claude to open the privacy folder.
2. Copy the source document into `Input`.
3. Ask Claude to anonymize/de-identify the next document.
4. Claude uses only the released privacy package.
5. Visuals that cannot be released automatically stay under `Needs Visual Review` until explicitly reviewed.

Do not upload or paste a raw sensitive source document directly into Claude if the goal is to prevent Claude from seeing the original content before privacy processing.

This plugin does not provide legal advice, a guarantee of legal anonymization, GDPR certification, or EU AI Act certification.
