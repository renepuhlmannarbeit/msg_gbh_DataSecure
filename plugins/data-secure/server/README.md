# Local privacy runtime

This directory is the canonical local MCP runtime of the DataSecure plugin and
the only maintained product copy in the repository. The user-facing plugin ZIP
and marketplace both package this tree. Engineering builds may copy it into an
internal comparison artefact, but that artefact is not a product channel.

No npm or Python dependency is installed on the end user's machine. Product
release still requires a fresh-install proof that the packaged runtime starts
without a system Node installation on each target platform. The runtime uses
Node core modules, bundled native/PowerShell helpers and the checked-in offline
OCR dependency tree; it performs no runtime package download.
