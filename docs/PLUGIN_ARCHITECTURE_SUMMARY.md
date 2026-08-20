# Plugin-first architecture summary

DataSecure is distributed primarily as a Claude plugin containing Skills and a local MCP configuration. Skills provide user-facing workflow and governance. The local MCP server is the privacy boundary and must process source files before Claude reads released package data. The standalone MCPB is a fallback artifact, not the primary UX.
