# Netzwerkgrenze für lokale Rohinhalte V1

Status: **Engineering-Vertrag, Node-Grenze unter Windows lokal belegt** · Story: BL-020.3

Rohinhalte dürfen in Parser, OCR und Review keine ausgehende oder eingehende
Netzwerkfähigkeit erhalten. Das gilt gleichermaßen für Internet, Loopback,
RFC1918-/ULA-Privatnetze und DNS. Ein lokaler HTTP-Server ist kein zulässiger
Ersatz für geerbtes `stdio`.

Der MCP-Hauptprozess ist Metadaten-, Zustands- und Exportkoordinator. Sein
sichtbarer Export verarbeitet ausschließlich bereits verifizierte,
anonymisierte Paketbytes und niemals Original- oder Review-Rohtext. Er lädt den
Subprozess-Guard deshalb nicht: native Dialoge und lokale Dateihandoffs bleiben
im Hauptprozess verfügbar. Der Export-Replay-Worker ist ein `worker_threads`-
Worker desselben Prozesses und keine eigene Sicherheitsgrenze. Dass beide
`.mcp.json`-Projektionen exakt den kleinen Einstiegspunkt `server/index.js`
starten, wird als eigener Vertrag geprüft.

## Zweistufige Grenze

1. Parser laufen mit dem stabilen Node-Berechtigungsmodell ohne `--allow-net`,
   ohne Child-/Addon-/Inspector-Recht und mit begrenztem Dateileserecht. Aktuelle
   Node-Versionen können damit Netzwerkzugriff selbst sperren; ältere unterstützte
   Node-22/24-Versionen dürfen diese Eigenschaft jedoch nicht voraussetzen.
2. Deshalb laden Parser und Companion vor privatem Produktcode zwingend
   `network-deny.cjs`. Die Sperre ersetzt HTTP(S), TCP/TLS, DNS, UDP, HTTP/2,
   `fetch`, WebSocket und lokale Listener durch denselben inhaltsfreien Fehler
   `DATASECURE_NETWORK_DENIED`.

Der JavaScript-Guard ist zusätzliche Tiefenverteidigung und kein Versprechen einer
Sandbox gegen absichtlich bösartigen In-Process-Code. Die vorhandene Prozessgrenze,
der leere bzw. allowlist-basierte Environment-Transport und geerbtes `stdio`
bleiben zwingend.

## Abnahme

`test-network-boundary.js` versucht jeden genannten Kanal real gegen Loopback und
DNS und akzeptiert ausschließlich den festen Fehler, bevor ein Socket entsteht.
Der Test läuft als Teil von `npm test` auf Windows, macOS und Linux. Lokal ist die
Windows-x64-Zelle belegt. Die macOS-x64-, macOS-ARM64- und Linux-x64-Zellen bleiben
bis zu frischen CI-Läufen offen; BL-020.3 bleibt deshalb in Arbeit.

OCR behält zusätzlich sein eigenes vorinstalliertes `network-deny.cjs` im
verifizierten Universal-Bundle.

## Native UI-Unterprozesse

`ui-process-policy.js` klassifiziert jeden erlaubten Dialogzweck und reduziert
dessen Environment auf eine feste Desktop-Allowlist. Proxyvariablen, Cloud-/API-
Schlüssel, `NODE_OPTIONS` und Electron-Steuerung werden nicht vererbt; alle Starts
verwenden feste Programme, Argumentarrays und `shell: false`.

- Dateiauswahl erhält keinen Dateiinhalt und gibt nur einen absoluten Pfad zurück.
- Bestätigung erhält nur eine begrenzte Trefferzahl.
- Abschlussansicht erhält nur drei begrenzte Zähler.
- Windows-Textprüfung und der begrenzte macOS-Review für Zertifikatsaussteller
  erhalten Original- und bereinigten Text ausschließlich über `stdin`. Linux nutzt
  dafür Zenity-`stdin` oder KDialog-`/dev/stdin`; weder Rohtext noch Fundstellenwert
  stehen in einem Prozessargument. Die Antworten sind auf Entscheidungen und
  Positionsbereiche begrenzt. Die macOS-/Linux-Wege bieten keine freie Textredaktion.

Der Markdown-/Paketexport läuft innerhalb des bereits geschützten Companion-
Prozesses. Es existiert daher kein separater Exportprozess mit Rohinhalt. Für den
Windows-, macOS- und Linux-Textreview besitzen dagegen noch **keine** OS-erzwungene Netzwerksandbox
nachgewiesen. Feste Skripte und bereinigtes Environment reduzieren die
Angriffsfläche, ersetzen aber kein AppContainer- oder gleichwertiges Kernel-Gate.
Dieser Reviewpfad darf BL-020.3 deshalb nicht abschließen oder neue Formate
freigeben.

Windows AppContainer ist der stabile native Prüfkandidat; Microsoft
`CreateProcessInSandbox` und MXC sind noch experimentell. Apples App Sandbox setzt
ein passend paketiertes und signiertes App-Bundle voraus und passt nicht zum
derzeit unsigned ausgelieferten ZIP-Helfer. Unter Linux ist Bubblewrap mit
`--unshare-net` ein Pilotkandidat, aber keine voraussetzungsfreie Systemkomponente.
Firejail wird wegen Installations-/SUID-Abhängigkeit nicht Teil des einfachen
ZIP-Normalwegs.

## Referenzen

- [Node.js Permission Model](https://nodejs.org/download/release/v22.17.0/docs/api/permissions.html)
- [Node.js CLI `--require`](https://nodejs.org/api/cli.html)
- [Microsoft AppContainer isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation)
- [Microsoft `CreateProcessInSandbox` (experimental)](https://learn.microsoft.com/en-us/windows/win32/secauthz/createprocessinsandbox)
- [Apple App Sandbox](https://developer.apple.com/documentation/security/app-sandbox)
- [Bubblewrap](https://github.com/containers/bubblewrap)
- [Microsoft MXC](https://github.com/microsoft/mxc)
