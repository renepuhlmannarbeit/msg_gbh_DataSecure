# Aktueller Testvertrag

Stand: 02.09.2026 · 3.2.0-rc89

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

## Engineering-only

```text
npm run build:engineering
npm run test:engineering-artifacts
```

Diese expliziten Befehle dürfen zusätzliche interne Vergleichsartefakte und
Legacy-Preservation-Gates prüfen. Ihr Erfolg ist keine Nutzer-, ZIP-, Marketplace-
oder Cowork-Freigabe. Historische Keyring-/Crypto-Fixtures liegen unter
`tests/legacy` und werden nicht als aktueller Produktpfad importiert.

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
