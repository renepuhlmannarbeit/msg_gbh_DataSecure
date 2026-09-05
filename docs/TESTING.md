# Aktueller Testvertrag

Stand: 05.09.2026 · 3.2.0-rc107

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

### Gepackte Standalone-App unter Windows

Nach `npm run build:standalone:windows:portable` prüft der Paket-Smoke auch das
von Tauri verwendete Windows-Verbatim-Pfadformat (`\\?\C:\…`). Zusätzlich
startet der folgende lokale Zielhost-Test die wirklich gebaute Tauri-EXE
kurz sichtbar, wartet auf bestätigte Antworten des gepackten Sidecars und beendet
ausschließlich seinen eigenen Testprozess:

```text
npm run test:standalone:native-windows
```

Der Test extrahiert den angegebenen Kandidaten in einen frischen Pfad und
bindet vor dem ersten Produktzugriff ein eigenes Testprofil für AppData,
Dokumente, temporäre Dateien, Diagnosen und WebView. Ein fehlendes oder
unvollständiges Profil an einem reservierten Smoke-Pfad stoppt vor dem Start;
ältere Binaries ohne diesen Vertrag werden nicht gestartet. Die reale
Anwenderinstallation, deren Recovery und deren Aufbewahrungsdaten bleiben
außerhalb des Tests. Der Test
verlangt über eine pro Prozess eindeutige Diagnose-Session `sidecar_started`,
`service_initialized`, `page_loaded`, `frontend_ready` sowie bestätigte
`get_ui_context`- und `get_public_state`-Antworten. Er muss in einer echten
interaktiven Windows-Sitzung laufen; eine Dateisystem-Sandbox, die WebView2
nicht initialisiert, ist keine gültige Zielhost-Evidenz. Er ist ein Windows-E0-Gate,
aber kein Ersatz für den sichtbaren Anwenderlauf mit Dateiauswahl und Export.

`PKG-04` ist das reproduzierbare Windows-Paketgate. Es akzeptiert ausschließlich
einen sauberen `main`-Commit, leert den Cargo-Buildzustand vor jedem Lauf, baut
denselben Commit zweimal und verlangt bytegleiche ZIP-, Desktop-EXE- und
Core-EXE-Hashes. Beide getrennt aufbewahrten Kandidaten durchlaufen Paketprüfung,
echte Worker-Übergabe bis zum dauerhaften Endzustand und nativen Binary-Smoke:

```text
npm run test:standalone:pkg-04 -- -ExpectedCommit <vollständiger Commit>
```

Erst nach `PKG-04 PASS` schreibt der Runner eine separate
`INT-13-BINDING.json`. `INT-13` bindet damit genau einen Kandidaten an Commit,
ZIP-SHA-256 und den Hash des PKG-04-Receipts; `latest`, Versionsnamen oder der
überschriebene Stage-Ordner sind keine zulässige Bindung. Die Aussage ist auf
denselben Host und die im Receipt ausgewiesene Node-/npm-/Rust-/Cargo-Toolchain
begrenzt.

Der native Windows-Smoke startet die Tauri-Hülle bewusst kurz sichtbar. Ein
mit `WindowStyle Hidden` oder `Minimized` erzeugtes Top-Level-Fenster kann die
WebView2-Seiteninitialisierung auf einem realen Windows-Host aufschieben und
wäre deshalb kein gleichwertiger Nachweis des Endnutzerstarts. Nach bestätigtem
`page_loaded`, `frontend_ready`, Core-Start und den ersten beiden IPC-Antworten
beendet der Test ausschließlich seine eigene Prozessinstanz.

Der RC102-Vertrag ergänzt echte Worker-ACKs für Intake, Resume und Review,
zweiphasige Abschlusspräsentation, den automatischen Übergang in den lokalen
Sammelreview sowie den zeitbegrenzten Export-Replay außerhalb des MCP-Startpfads.
Die zugehörigen Direktgates sind `test-batch-executor-startup`,
`test-worker-terminal-presentation`, `test-automatic-local-review`,
`test-automatic-review-worker-flow` und `test-result-export-startup-replay`; sie
sind außerdem genau einmal in `test:product` einsortiert.

Der aktuelle Vertrag umfasst die spawn-bestätigten, unter Windows ausdrücklich sichtbaren
Öffnen-Aktionen, die exakte Markierung der laufbezogenen Zuordnungsdatei und den zweigeteilten Standalone-Ablauf
**Verarbeiten / Ergebnisse**. Die direkten Regressionen liegen in
`test-ui-process-policy`, `test-standalone`, `test-standalone-frontend` und
`test-standalone-desktop-contract`. `test-result-folder-export` prüft zusätzlich
atomare Zuordnungspublikation, RC103-Migration, Manipulationsstopp und die
harte Produktgrenze: Originalnamen erscheinen nie im Cowork-Ergebnisordner.

Die RC107-Gegenprüfung ergänzt timer- und generationsgebundene Frontendtests
im regulären Produktgate, zwei schnelle Folgestapel, unsichere Startbestätigung,
Firmenkurzformen mit kollidierenden Rechtsformen und eine eigene Standalone-
Laufübersicht auch bei ausschließlich gestoppten Dateien. Ausstehende
Abschlussmetadaten werden getrennt von Dokumentzählern geprüft; ein Replay darf
weder veröffentlichte Dateien überschreiben noch historische Pläne verändern.
`test-standalone-sidecar` prüft außerdem sieben echte Prozess-/Workerfälle für
EOF, wartende Aktionen, unvollständige/ungültige Frames, Shutdown und geschlossene
Ausgabepipes: der Steuerprozess endet, akzeptierte Arbeit wird autonom fertig.
Die Fixture verändert nur das Timing. Der reale Paket-Smoke verarbeitet nach
dem erfolgreichen Vierformatlauf einen vollständig fehlerhaften CSV-Stapel und
verlangt dessen eigene Zuordnung statt eines Rückfalls auf den Vorgängerlauf.

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
ohne System-Node. Der Paket-Smoke führt mit dem exakt extrahierten Core eine
reale Dateideskriptor-Normalisierung, Aufnahme, Ergebnisordnerwahl, bestätigte
Worker-Übergabe und Verarbeitung bis zu einem dauerhaften Endzustand aus. Er
prüft anschließend den exakten `Lauf-*`-Ordner, die dort atomar veröffentlichte
`DataSecure-Zuordnung.csv` und beide privaten Zielresolver, welche die nativen
Öffnen-Schaltflächen verwenden.
Queue-Schema und Worker-Acknowledge werden vor dem positiven
Handoff doppelt geprüft; Identitäts-Mocks dürfen diese Grenze nicht ersetzen.
Das ersetzt keine menschliche Windows-UAT und keinen nativen
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
