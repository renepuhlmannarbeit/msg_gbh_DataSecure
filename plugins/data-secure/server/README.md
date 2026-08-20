# Local privacy runtime

This directory is the canonical, self-contained local MCP runtime of the
DataSecure plugin. It is the only copy in the repository: the standalone MCPB
build copies this tree into the extension package, it is never maintained twice.

No npm or Python dependency is installed on the end user's machine; the runtime
uses Node core modules plus the bundled PowerShell helpers in `../scripts`.
