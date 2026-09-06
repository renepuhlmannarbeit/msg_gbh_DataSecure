# Passiver MCP-Apps-Startstatus · V1

Stand: 31.08.2026 · RC68 · BL-042.3 · E0-Teilschnitt, Produktaktivierung AUS

## Expertenentscheidung und Zweck

Architektur-/Security-Gegenprüfung und UX-Gegenprüfung bestätigen diesen engen
Schnitt: Eine Startkarte darf den lokalen Start verständlicher machen, aber keinen
Abschluss suggerieren. Ein synchroner Status mit Timer, zusätzliche Tools oder
ein Rohdaten-iframe würden den schlanken, lokalen Ablauf verschlechtern.

Die Karte ist **eine Momentaufnahme beim Startversuch**, kein Fortschritts- oder
Abschlussbildschirm. Start, Verarbeitung, lokale Abschlussanzeige und spätere
ausdrückliche Ergebnisübergabe funktionieren ohne sie unverändert. Sie ist kein
Sicherheitsgate, kein Hostnachweis und kein Ersatz für die native lokale Prüfung.

## Aktivierung ausschließlich für Engineering

- Standard: aus, keine Ressourcen und kein Lesen des UI-Artefakts.
- Nur lokales `EU_PRIVACY_STATUS_APP_PILOT=1`, kein Supportmodus und eine explizite
  `initialize`-Client-Capability
  `extensions['io.modelcontextprotocol/ui'].mimeTypes` mit
  `text/html;profile=mcp-app` erlauben die Aushandlung.
- `server/discover`, `clientInfo`, Toolargumente oder spätere Reinitialisierung
  können den Pilot nicht aktivieren. Das ist keine neue Hostfreigabe.
- Das ausgelieferte Manifest bleibt `release_enabled: false`. Keine Änderung der
  normalen Connector-/Skill-Konfiguration; Anwender müssen nichts umstellen.
- Fehlende, defekte, ausgetauschte, verlinkte oder zu große Artefakte deaktivieren
  ausschließlich die Karte. Fehler werden nicht als Startfehler ausgegeben.

## Protokoll und Informationsgrenze

Genau eine Ressource: `ui://data-secure/status-card-v1.html`, MIME
`text/html;profile=mcp-app`. Nur `start_document_batch_from_picker` verweist über
`_meta.ui.resourceUri` darauf. Bestehender `content` und `structuredContent`
bleiben unverändert; zusätzlich liegt ausschließlich diese Projektion in
`_meta['datasecure/status']`:

```json
{"schema":"datasecure-status-card/v1","locale":"de","state":"local_start_confirmed","snapshot":true}
```

Vier Felder, keine weiteren Schlüssel. `locale`: `de` oder `en`; `state`:
`local_start_confirmed`, `selection_cancelled`, `start_blocked`,
`engine_unavailable`, `already_running` oder `unavailable`. Keine Namen, Pfade,
IDs, Tokens, Zähler, Rohwerte, freien Texte, Zeiten oder Dokumentinhalte. Die
Projektion stammt nur aus der öffentlichen Startantwort, nie aus Worker/Journal.
Ungültige UI-Metadaten werden als fester unbekannter Zustand angezeigt.

Alle Tools tragen im Pilot `visibility: ['model']`; Hostdurchsetzung muss E1
belegen. Die App besitzt keine Werkzeug-, Nachrichten-, Link-, Download- oder
Kontextaktionen. Kein Polling, keine Timer, keine Hintergrundverarbeitung.
Nur SDK-Handshake/Initialisierungsnachricht sind vorgesehen; SDK-interne
Transport-Timeouts sind keine Anwendungspolls. Doppelte Ergebnisse verändern
die erste Momentaufnahme nicht. Sprachwahl und native Details sind rein lokal.

Ressourcen-CSP: leere `connectDomains`, `resourceDomains`, `frameDomains`,
`baseUriDomains`; `permissions: {}`. Kein CDN, Telemetrie oder Nachladen. Der
Host ist für die iframe-Sandbox und CSP-Durchsetzung verantwortlich. Auch ohne
JavaScript bleibt ein fester Hinweis auf Textantwort und lokalen Abschluss.

## OSS, Build und Performance

- Offizielles MCP-Apps-SDK **1.7.5**, exakt im Lockfile; keine selbst erfundene
  Produktions-`postMessage`-Bridge, keine Migration des gesamten MCP-Servers.
- esbuild **0.28.2** nur Entwicklung/Build; axe-core **4.11.1** nur Test.
- `npm run build:status-app` erzeugt HTML, Hash-/Größenmanifest, vollständige
  Lizenztexte und Bundle-Inventar unter `server/status-app/`. Die tatsächlichen
  vier Bundle-Komponenten besitzen exakte Versionen und Lock-Integritäten.
  ext-apps enthält eine Apache-2.0/MIT-Lizenztransition: vollständiger Originaltext
  wird mitgeliefert, keine pauschale MIT-Annahme.
- `npm run test:status-app` prüft Modell/View, Server und deterministische
  Quell-/Artefaktparität. ZIP-/MCPB-Builds prüfen diese Parität vor Paketierung.
- HTML-Budget höchstens 768 KiB, kein sourcemap/CDN. Im deaktivierten Normalpfad
  wird kein HTML gelesen; nach Pilotinitialisierung erfolgen Ressourcenlesevorgänge
  aus einem geprüften In-Memory-Snapshot, nicht erneut vom Dateisystem.
- Das ist keine Beschleunigung des Anonymisierers und kein installierter
  Latenznachweis. Die Erweiterung darf bestehende Workergrenzen nicht verändern.

## Reproduzierbare E0-Nachweise

`test-status-app-model.mjs`: 27 Checks zu allen sieben Zuständen in DE/EN,
fehlerhaften Metadaten, Rohtext-Canaries, Duplikaten, Sprachwahl und SDK-Fehlern.
`test-status-app-server.js`: 11 Gates für Default/Support/Capability,
Ressourcen-URI, Größen-/Hash-/Schemafehler, Links, Austausch, Truncation,
Nanosekunden-Zeitstempel und unveränderten Textfallback. `test-mcp-protocol.js`:
37 echte stdio-Tests einschließlich drei UI-Protokollfälle.

Das verpflichtende Gate `tests/test-status-app-browser.mjs` startet denselben
synthetischen Host automatisch im bereits installierten Microsoft Edge. Es prüft
alle 14 Sprach-/Zustandskombinationen mit axe, die Bridge-Allowlist und Reflow bei
320 px und 400 % Text. `playwright-core` ist exakt gepinnt; kein Browser wird
heruntergeladen oder an Endnutzer ausgeliefert.

Der zusätzliche manuelle Browserhost `node tests/manual/status-app-browser-server.mjs`
Er bindet nur `127.0.0.1` an einen freien Port, liest das gebaute HTML und die lokale
axe-Testbibliothek, niemals Nutzerdokumente. Im Browser ausgeführte Fixture-JS
simuliert den Host-Handshake; dies ist keine produktive Bridge. „Run checks“ prüft
axe, Reflow, Rohtext-Canary und ausgehende Bridge-Methoden. „English“ und
„400% text / narrow“ testen Sprache und die bewusst strenge Kombination 320 px +
vierfache Schrift. Diese Kombination ist kein vollständiger Browserzoom-Test.
Mit Strg+C beenden. Ergebnisse des aktuellen Laufs stehen in `docs/TESTING.md`.

## Noch offen – keine verdeckte Freigabe

- **E0-Entscheidung:** Eine terminale Projektion wird nicht aus der einmaligen
  Startantwort erfunden. Der automatisierte Browser-/A11y-/DE-EN-/Reflow-Vertrag
  ist abgeschlossen; zusätzliche Hostfälle werden nur aus einem reproduzierten
  Defekt oder einer späteren Pilotaktivierung abgeleitet.
- **E1:** echte aktuelle Cowork-Desktop-Versionen auf Windows/macOS x64/ARM64,
  iframe-Rendering, CSP/Visibility, fehlende UI-Unterstützung, Organisationspolicy,
  SDK-/Hostabbruch und unveränderter Text-/OS-Fallback.
- **E2:** Tastatur/Fokus/Screenreader, 200/400%-Browserzoom, Dark/Forced Colors,
  Start versus Abschluss eindeutig verstehen, keine zusätzlichen Freigaben.
- Vollständige BL-042.3-Abnahme bleibt offen; bestehende Format-/Hostgates gelten.

## Offizielle Grundlagen

- [MCP Apps Übersicht](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP Apps Build-Anleitung](https://modelcontextprotocol.io/extensions/apps/build)
- [Versionierte Spezifikation 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Claude interaktive Konnektoren](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)
- [WAI Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [WCAG Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
