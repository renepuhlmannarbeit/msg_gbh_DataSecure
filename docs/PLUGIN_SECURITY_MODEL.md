# Plugin security model

The Skill layer must never be treated as the privacy boundary. The local MCP owns file access, de-identification, visual gating, integrity checks and release. Claude reads only released privacy-package outputs. Direct chat upload of a raw sensitive source bypasses the pre-model privacy guarantee.
