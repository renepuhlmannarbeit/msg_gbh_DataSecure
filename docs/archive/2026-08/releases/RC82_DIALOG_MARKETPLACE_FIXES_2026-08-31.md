# RC82: Dialogfehler und Marketplace-Kanalabgleich

Stand: 31.08.2026 · Basis `1cbefa0` (RC81) · lokale Implementierung

## Korrekturen

1. Die lokale Auswahl fertiger Stapel blockiert nicht mehr den MCP-Server.
   `execFile` statt `spawnSync`, Abbruchsignal vom Host bis zum eigenen Prozess,
   Schutz vor zweitem Dialog, keine Ergebnisübernahme nach Abbruch. Bei nur einem
   fertigen Stapel weiterhin kein Dialog. Keine neue Bestätigung oder Pollingpflicht.
2. Nicht erfolgreiche Prozesse/Timeouts dürfen auch mit numerischer Teilausgabe
   keinen Stapel auswählen. Nur erfolgreiche, vollständig gültige Ordinalausgaben
   werden verwendet. Cancel, technische Fehler und Timeout werden unterschieden.
3. 30 historische Keyring-Dateien einschließlich fünf nativer Module wurden
   verlustfrei aus dem Produktbaum nach `tests/legacy/keyring` ausgelagert.
   Vendorintegrität geprüft, Testimports angepasst. Kein Benutzer-Schlüsselbund
   angefasst, keine Originaldatei gelöscht, keine neue Schlüsselverwaltung.
   Marketplace-Quellbaum und ZIP/MCPB-Produktprojektion sind identisch; erneutes
   Einbringen der Altmodule scheitert am gemeinsamen Packaging-Gate.

## Prüfungen

- Handoff: 16/16 PASS, darunter Hostabbruch/Cancel mit verspäteter Rückgabe,
  Doppelstart, Neustart, keine Lesezugriffe vor erfolgreicher Wahl.
- Native Picker: 18/18 PASS auf Windows, darunter realer synthetischer Child-Abbruch
  bei weiterlaufendem Eventloop und PowerShell-Ausgabetests ohne sichtbaren Dialog.
  Windows/macOS/Linux-Fehlermatrix mit Test-Runnern, kein Gerätefreigabenachweis.
- MCP: 41/41 PASS über echte stdio-Prozesse. Ping während laufender Stapelauswahl,
  doppelte Anfrage und beide Abbruchwege getestet, ohne Paketlesezugriff.
- Produkt-/Keyring-Artefaktgrenze: 15/15 PASS, einschließlich tatsächlichem
  Marketplace-Quellpfad, Archivprojektion und ausgelagerten Fixture-Hashes.
- Fachagent für Kanalbereinigung: 116 zielgerichtete Regressionen PASS.
- Unabhängiger Fachagent für Handoff-Gegenreview: keine weiteren Findings;
  Handoff16/Picker18 selbst nachgeprüft. Keine zusätzlichen Nutzerschritte.
- Vollständige lokale `npm run test:ci` einschließlich Pre-/Posttests PASS
  (`dist/rc82-test-ci.log`). Der erste Versuch stoppte am noch ungültigen
  Backlog-Statusformat; korrigiert und vollständig wiederholt, nicht übersprungen.
- Offizielle Claude CLI 2.1.233: Plugin und Marketplace strukturell PASS.
- Vollständiger `npm run build` PASS (`dist/rc82-build.log`): ZIP/MCPB-
  Quellparität, 150 Vertragsvarianten gegen den gepackten Code, Status-App-
  Offline-/Hash-/Lizenzprüfungen, SBOM und Engineering-Abgrenzung bestanden.
  Ein erster Sandbox-Build scheiterte an den bekannten Esbuild-Verzeichnisrechten;
  der komplette Wiederholungslauf außerhalb der Dateisandbox besteht.
  Der eigenständige MCPB-Build prüft den rohen Produktbaum schon vor dem Staging,
  statt historische Module weiterhin nur aus einer Kopie herauszufiltern.

Testpakete unter `dist/DataSecure-Privacy-Preflight-v3.2.0-rc82.zip` und
`dist/DataSecure-Privacy-Gateway-v3.2.0-rc82.mcpb`; Prüfsummen in `dist/SHA256SUMS`.

## Backlog und Grenzen

BL-041.1/BL-041.7/BL-011.3: Dialogdefects E0 korrigiert.
BL-010.5/BL-051.2: Quellbaumparität E0 korrigiert.
Echte Cowork-Auswahl/Fokus/Abbruch sowie Marketplace-Installation, macOS-/Linux-
Gerätetests, Runtime-Abnahme und weitere Formate bleiben separat offen.
Kein Nachweis universeller Anonymisierung oder allgemeiner Laufzeitbeschleunigung;
behoben ist die blockierte Wartezeit der Ergebniswahl.

Keine GitHub Actions gestartet. Kein Commit/Push in diesem Implementierungsschritt.
