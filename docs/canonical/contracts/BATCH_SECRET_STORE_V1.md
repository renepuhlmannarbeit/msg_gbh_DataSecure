# Vertrag: lokaler Batch-Secret-Store v1

Status: **historischer nicht-produktiver Vertrag; Keyring-Pflicht durch DS-065 superseded** · Story: BL-030.2 ·
Abhängigkeiten: BL-011.1, BL-030.1, BL-010.1

Keine Aktivierung dieses OS-Secret-Stores und keine native Keyring-Abnahme mehr.
BL-030.2 bleibt für einen minimalen lokalen, nicht zusätzlich verschlüsselten
neustartfesten Pseudonymkontext offen. Die RC80-Snapshot-Umstellung aktiviert diese
Funktion nicht. Nachfolgende Keyring-/Fallbackregeln dokumentieren nur das alte
Design; sie sind keine aktuelle Implementierungs- oder Releasepflicht.

## Zweck und Grenze

Dieser Vertrag beschreibt ausschließlich den lokalen Schutz des 256-Bit-
`batch_secret` aus `BATCH_PSEUDONYM_V1`. Er ersetzt weder die dort festgelegte
HMAC-Ableitung noch die Batch-Snapshot-Grenze. Solange sämtliche unten genannten
Bundle- und Offline-Nachweise fehlen, darf der Adapter nicht durch den Produktpfad
aufgerufen werden; ein fortsetzbarer stapelweiter Pseudonymkontext bleibt deaktiviert.

## Kandidat und feste Auflösung

- Kandidat: `@napi-rs/keyring` **1.3.0**, MIT, N-API.
- Die Runtime lädt den Kandidaten dynamisch erst nach erfolgreichem Plattform- und
  Bundle-Check. Ein allgemeines `require`-Scanning oder eine automatische
  Paketinstallation ist verboten.
- Der API-Vertrag ist exakt `new Entry(service, account)`, `setPassword`,
  `getPassword` und `deletePassword`.
- Der Servicename ist exakt `de.msg.datasecure.batch-pseudonym.v1`; der Account ist
  ausschließlich `batch-v1-` plus ein 64-stelliger hexadezimaler, lokaler Batch-Token.
  Dateinamen, Pfade, Hashes, Personen- oder Organisationswerte sind dort verboten.
- Das gespeicherte Material ist exakt 32 Byte und wird als Base64url ohne Padding
  übergeben. Kopien im JavaScript-Speicher werden nach dem Setzen verworfen.

## Zielartefakte und Sperren

Der spätere versions- und integritätsgebundene Bundle-Lock muss genau diese
Zielartefakte aus Version 1.3.0 enthalten und prüfen:

| Ziel | Artefakt |
|---|---|
| Windows x64 | `@napi-rs/keyring-win32-x64-msvc` |
| macOS x64 | `@napi-rs/keyring-darwin-x64` |
| macOS ARM64 | `@napi-rs/keyring-darwin-arm64` |
| Linux x64 GNU | `@napi-rs/keyring-linux-x64-gnu` |
| Linux x64 Musl | `@napi-rs/keyring-linux-x64-musl` |

Eine andere Architektur, ein fehlendes Artefakt, eine abweichende Version oder eine
fehlende Integritäts-/Lizenz-/NOTICE-Evidenz ist `BATCH_SECRET_STORE_UNAVAILABLE`.
Der Batch stoppt **vor** Snapshot-Commit und Pseudonymvergabe. Es entsteht weder eine
Arbeitskopie noch ein neues Pseudonym.

## Verbotene Ausweichwege

Es gibt keinen Klartext-, Datei-, Umgebungsvariablen-, CLI-, Cloud-,
Eigenverschlüsselungs- oder zweiten-Keyring-Fallback. Ein fehlender/gesperrter
Windows Credential Manager, macOS Keychain oder Linux Secret Service wird nicht
automatisch repariert und nicht als Erfolg ausgegeben.

## Verbindliche Evidenz vor Aktivierung

Für jedes Ziel der Tabelle muss eine frische, offline gestartete Paketinstallation
zeigen: dynamisches Laden des gelockten Bytes, Set/Get/Delete eines 256-Bit-Secrets,
Rechnerneustart zwischen Set und Get sowie Entfernung nach terminalem Batch. Zusätzliche
Negativfälle prüfen fehlenden Dienst, gesperrten Dienst, fehlendes natives Artefakt und
Manipulation. Die Nachweise enthalten keine Secretwerte, Tokens, Dateinamen oder
Pfade. Erst danach darf die Batch-Integration eine neue Capability behaupten.

## Quellen

- https://www.npmjs.com/package/@napi-rs/keyring (Version/Artefaktmetadaten,
  abgerufen am 23.08.2026)
- https://github.com/Brooooooklyn/keyring-node (API und Lizenzquelle, abgerufen am
  23.08.2026)
