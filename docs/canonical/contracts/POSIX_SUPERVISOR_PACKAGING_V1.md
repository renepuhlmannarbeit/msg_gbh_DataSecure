# POSIX-Supervisor-Paketvertrag V1

Status: Engineering-Vertrag für **BL-011.9**; kein Plattformfreigabenachweis.

## Ziel

Sobald ein POSIX-Supervisor für `macos-x64`, `macos-arm64` oder `linux-x64`
ausgeliefert wird, muss der Plugin-ZIP- und MCPB-Build genau das geprüfte,
zielgebundene Programm enthalten. Ein fehlendes Zielartefakt ist bis zur
Plattformevidenz zulässig; ein nur teilweise vorhandenes Ziel ist dagegen ein
Build-Fehler.

## Unveränderliche Regeln

- Der einzige Paketpfad lautet `server/native/<ziel>/datasecure-sandbox`;
  daneben liegt zwingend `datasecure-sandbox.sha256`.
- `<ziel>` ist ausschließlich `macos-x64`, `macos-arm64` oder `linux-x64`.
  PATH, Umgebungsvariablen, Links und Ersatzprogramme sind ausgeschlossen.
- Build und MCPB prüfen reguläre Dateien, Binärformat/Zielarchitektur und
  SHA-256 vor dem Archivieren. Sie brechen bei Teilpaket, Link, falscher
  Architektur oder abweichender Prüfsumme fail-closed ab.
- POSIX-Programme erhalten im Archiv den Ausführmodus `0755`; alle übrigen
  Dateien bleiben nicht ausführbar. Die Runtime prüft zusätzlich ihren festen
  `--sandbox-contract` mit leerer Umgebung.
- Keine Freigabe entsteht allein durch Verpackung: reale CPU-, RAM-, Kindprozess-,
  Timeout- und Fresh-Install-Evidenz für macOS x64, macOS ARM64 und Linux x64
  bleibt Pflicht.

## Negativfälle

`POSIX_SUPERVISOR_TARGET_INCOMPLETE`, `POSIX_SUPERVISOR_EXECUTABLE_UNSAFE`,
`POSIX_SUPERVISOR_CHECKSUM_UNSAFE`, `POSIX_SUPERVISOR_TARGET_MISMATCH` und
`POSIX_SUPERVISOR_INTEGRITY_FAILED` dürfen kein Archiv erzeugen.
