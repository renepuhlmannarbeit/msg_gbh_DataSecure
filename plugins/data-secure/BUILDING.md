# Building the artefacts

`plugins/data-secure` is the canonical product tree. It holds the local MCP
runtime (`server/`), the Windows PowerShell helpers (`scripts/`) and the skills,
so a marketplace install straight from the repository resolves exactly the code
the tests cover. Nothing is substituted at build time.

```bash
npm test              # fixtures, manifests, parsers, privacy, images, MCP protocol
npm run build:plugin  # dist/DataSecure-Privacy-Preflight-v<version>.zip
npm run build:mcpb    # dist/EU-Privacy-Document-Gateway-Windows-v<version>.mcpb
npm run version:sync  # propagate package.json version to every manifest
```

Both builds use a ZIP writer based on `node:zlib`, so they run on Windows and on
Linux CI without an external `zip` binary. Archive entries carry a fixed
timestamp, which makes the resulting SHA-256 reproducible for the same source.

End users install a single artefact. They never run npm, Python or a build step.
