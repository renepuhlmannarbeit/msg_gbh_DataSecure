# DataSecure Privacy Preflight v3.2.0 RC2

Primary distribution is now a Claude plugin ZIP that bundles Skills plus the local privacy MCP runtime. The standalone MCPB remains available as a fallback.

## Added

- Plugin marketplace metadata
- Skill set for preflight, customer, personnel, applicant, contract, general and compliance workflows
- Local MCP configuration via `${CLAUDE_PLUGIN_ROOT}`
- Node-only plugin ZIP build
- Plugin structure validation
- Synthetic personnel-profile fixture, expected output and demo test report

## Release-gate notes

- No real Office/PDF documents are allowed in the public repository.
- Plugin ZIP must contain no source-document identifiers.
- Packaged local MCP must pass initialize/tool-list smoke tests.
- Windows OCR/EMF/WMF behavior remains a target-machine acceptance test.
