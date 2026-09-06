# Local privacy runtime

This directory contains the shared DataSecure engine plus separate MCP and
Standalone adapters. The user-facing plugin ZIP and generated self-contained
marketplace projection select their files from this tree; they do not ship it
wholesale. The Standalone product has its own runtime projection and data root.
Shared code has one maintained implementation. Engineering comparison artefacts
are not additional product channels.

No npm or Python dependency is installed on the end user's machine. Product
release still requires a fresh-install proof that the packaged runtime starts
without a system Node installation on each target platform. The runtime uses
Node core modules and bundled native/PowerShell helpers; it performs no runtime
package download. The historical `server/ocr-runtime` tree is excluded from the
plugin product. Product OCR is supplied only by the separate Standalone
Markdown-conversion runtime (`server/standalone/conversion-runtime`), not by
the plugin or its anonymization mode.

Pure shared contracts live under `core/`; old contract import paths are thin
compatibility re-exports. Remaining batch I/O and transport composition are
tracked refactoring work, not a claim of complete application-layer separation.
Both product projections and their transitive dependencies have separate gates.
