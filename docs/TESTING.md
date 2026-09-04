# Aktueller Testvertrag

Stand: 04.09.2026 · 3.2.0-rc98

Das vollständige chronologische Testjournal bis RC84 liegt unverändert im
[Archiv](archive/2026-09/testing/TESTING_HISTORY_THROUGH_RC84.md). Diese Datei
enthält nur die heute gültigen Testklassen und Releasebefehle.

## Schnelle Dokumenten- und Vertragsprüfung

```text
npm run test:docs
node tests/test-manifest.js
node tests/test-retention.js
node tests/test-cowork-documentation-contract.js
node tests/test-capability-contract.js
npm run test:status-app
```

Sie prüft unter anderem:

- einen aktiven Dokumentenkanon und gültige DS-/BL-Referenzen;
- aktuelle Versionen und verständliche UAT-Namen/Links;
- ZIP/Marketplace als Nutzerkanäle;
- keinen auswählbaren Bildmodus;
- 0–14 Tage nur für temporäre Arbeits-/Reviewdaten;
- niemals automatische Löschung von Quellen/Originalen oder fertigen Exporten;
- Formatallowlist TXT/Markdown/CSV/DOCX und sichere Sperre aller anderen Formate.
- inhaltsfreie Statusprojektion, unveränderten Textfallback und einen
  reproduzierbaren Offline-Build aus Repo- und fremdem Arbeitsordner.
- deaktivierte Supportspur im Normalprodukt, geschlossene Fehler-/Operationswerte
  und den ausschließlich manuellen Debug-Skill.

## Produktregression

```text
npm run test:ci
npm run runtime:target -- --target <Ziel> --archive <offizielles-Node-Archiv> --output dist/<Ziel>
npm run build:plugin
npm run test:plugin-zip
git diff --check
```

`test:ci` umfasst Parser-, Source-Preflight-, Inhaltserhalt-, PII-, Credential-,
Picker-, Handoff-, Batch-, Review-, Recovery-, Mapping-, Retention-, MCP- und
adversariale Verträge. `build:plugin` verweigert einen Quell-ZIP-Build ohne
vorher attestierte, zielsystemspezifische Runtime. Der ZIP-Gate prüft
Runtime-Evidence, Binärhash, Node-Lizenz, Dateimodi, Größenbudget und den
umgeschriebenen Startbefehl. `npm run build` ergänzt SPDX-SBOM und SHA-256.
MCPB, SEA und deaktivierte OCR-Artefakte erfüllen diese Produktgates nicht.

Der RC98-Vertrag ergänzt echte Worker-ACKs für Intake, Resume und Review,
zweiphasige Abschlusspräsentation, den automatischen Übergang in den lokalen
Sammelreview sowie den zeitbegrenzten Export-Replay außerhalb des MCP-Startpfads.
Die zugehörigen Direktgates sind `test-batch-executor-startup`,
`test-worker-terminal-presentation`, `test-automatic-local-review`,
`test-automatic-review-worker-flow` und `test-result-export-startup-replay`; sie
sind außerdem genau einmal in `test:product` einsortiert.

Zusätzlich reproduziert `test-durable-runtime-cache` die im Windows-UAT
beobachtete Cowork-Lebenszyklusgrenze: Nach der lokalen Laufzeitprojektion wird
der ursprüngliche Pluginbaum vollständig entfernt; erst danach muss ein echter
Hintergrundprozess aus dem Cache starten und per IPC antworten.
`test-stable-data-root` belegt, dass ausschließlich eine erkennbare
Claude-Temporärumleitung von Windows-`LOCALAPPDATA` auf das bestehende reguläre
Benutzerprofil zurückgebunden wird. Das reale ZIP-Gate startet dieselbe
Konstellation mit der gebündelten Runtime.

Für einen ausdrücklich angeforderten Supportbuild:

```text
npm run build:debug
npm run test:debug-zip
node tests/test-debug-skill-contract.js
node tests/test-support-trace.js
node tests/test-mcp-protocol.js
```

Das Debug-ZIP ist kein Rolloutartefakt. Nach einem echten Cowork-Fehlerlauf wird
es wieder durch das Normalpaket ersetzt. Die Tests verlangen dieselbe Engine,
manuelle Skillaktivierung, keine Spur im Normalmodus und ein geschlossenes
inhaltsfreies JSON-Schema.

## Engineering-only

```text
npm run build:engineering
npm run test:engineering-artifacts
```

Diese expliziten Befehle dürfen zusätzliche interne Vergleichsartefakte und
Legacy-Preservation-Gates prüfen. Ihr Erfolg ist keine Nutzer-, ZIP-, Marketplace-
oder Cowork-Freigabe. Historische Keyring-/Crypto-Fixtures liegen unter
`tests/legacy` und werden nicht als aktueller Produktpfad importiert.

### Standalone-Vertrag

```text
npm run test:standalone
```

Der Test prüft den getrennten Produktnamespace, die direkte Core-Nutzung ohne
MCP/JSON-RPC, strenge öffentliche Zustände, den begrenzten gerahmten IPC-Kanal,
Tauri-CSP und Capabilities sowie Windows-/macOS-/Linux-Zielbezeichnungen. Der
Desktop-Vertrag läuft zusätzlich im zentralen Produkttest.
`npm run build:standalone:windows:portable` baut und prüft darüber hinaus die
kompilierte Windows-x64-Hülle, eine frisch erzeugte geschlossene
Runtimeprojektion, das selbsttragende Paket und einen isolierten Sidecar-Start
ohne System-Node. Das ersetzt keine menschliche Windows-UAT und keinen nativen
Intel-/ARM-macOS-Nachweis.

## UAT

```text
npm run uat:fixtures
```

Danach folgt die menschliche Durchführung im
[UAT-Testpaket](acceptance/UAT_TEST_KIT/README.md). Automatisierte Tests können
Fresh Install, echte Berechtigungsanzeigen, Fokus/Screenreader, OS-Dateisystem,
100-Dateien-/500-MiB-Lauf und Fach-/Datenschutzfreigabe nicht ersetzen.

## Umgang mit Fehlern

Ein unvollständiger Lauf ist kein PASS und kein Performancewert. Sandbox-, Host-
oder Toolzugriffsfehler werden getrennt von Produktfehlern dokumentiert. Testlogs
enthalten keine Originalinhalte, Dateinamen, Pfade, Tokens oder Dokumenthashes.
