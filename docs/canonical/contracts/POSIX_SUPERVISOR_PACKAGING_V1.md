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
- Jedes Ressourcenlimit wird als Obergrenze angewendet. Ist das vom Zielhost
  geerbte Hard-Limit bereits niedriger, bleibt dieses strengere Limit erhalten;
  der Supervisor darf nicht versuchen, es zu erhöhen oder den Parser deshalb
  vor `exec` abbrechen.
- Linux begrenzt zusätzlich virtuellen Adressraum und Datensegment per
  `RLIMIT_AS`/`RLIMIT_DATA`. Auf macOS sind diese beiden Linux-typischen Limits
  nicht Teil des zugesagten Vertrags: XNU verweigert sie, sobald die bereits
  vorhandene Mach-VM-Map größer als der Sollwert ist. Dort begrenzt der externe
  Elternprozess den tatsächlichen physischen Footprint stattdessen hart über
  `proc_pid_rusage`; CPU-, Core-, Dateigrößen-, Deskriptor- und Wallclock-Grenzen
  bleiben zusätzlich aktiv.
- Keine Freigabe entsteht allein durch Verpackung: reale CPU-, RAM-, Kindprozess-,
  Timeout- und Fresh-Install-Evidenz für macOS x64, macOS ARM64 und Linux x64
  bleibt Pflicht.

## Negativfälle

`POSIX_SUPERVISOR_TARGET_INCOMPLETE`, `POSIX_SUPERVISOR_EXECUTABLE_UNSAFE`,
`POSIX_SUPERVISOR_CHECKSUM_UNSAFE`, `POSIX_SUPERVISOR_TARGET_MISMATCH` und
`POSIX_SUPERVISOR_INTEGRITY_FAILED` dürfen kein Archiv erzeugen.
