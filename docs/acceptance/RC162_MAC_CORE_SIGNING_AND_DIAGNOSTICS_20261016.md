# RC162: macOS-Core-Signierung und zielgerichtete Startdiagnose

Stand: 16.10.2026. Dies ist der technische Vertrag für einen internen
Test-Pre-Release, **keine erfolgreiche Abnahme auf dem betroffenen M2**.

## Ausgangsbefund und Ursache im Quellstand

Die deduplizierten RC161-Desktop-Protokolle zeigen 16 erfolgreiche
Prozessstarts des gebündelten ARM-Cores und anschließend einen Abbruch mit
Signal 5 (`SIGTRAP`) nach etwa 35–75 ms, noch vor Sidecar-Ready. ZIP und DMG
scheiterten auf demselben M2/macOS 26.2. Ein Sidecar-Protokoll oder
Apple-Absturzbericht liegt nicht vor. Daher belegt das Signal allein keine
Organisationssperre und keine bestimmte Node-Instruktion.

Die Mac-Buildkette hatte jedoch einen konkreten Defekt: Tauri signierte den
gebündelten Node-Core ad hoc mit Hardened Runtime, ohne diesem ausführbaren
Prozess ein JIT-Entitlement zu geben. Die tatsächlichen RC161-Buildlogs
zeigen `adhoc,runtime` für den Core. Der offizielle Node-22.23.2-Mac-Build
trägt `com.apple.security.cs.allow-jit`; die erneute Tauri-Signierung ersetzt
dessen ursprüngliche Entitlements. Apple Silicon und V8 benötigen unter
Hardened Runtime eine passende JIT-Berechtigung. Das ist eine plausible,
quell- und buildgestützte Erklärung für den sehr frühen Abbruch, aber noch
kein Kausalbeweis auf dem betroffenen Host.

## Korrektur und Verifikationsgrenzen

- Nach dem Tauri-Build wird **nur** der gebündelte Node-Core mit Hardened
  Runtime und genau `com.apple.security.cs.allow-jit=true` neu signiert.
  Die Desktop-UI erhält dieses Recht nicht. Die signierten Core-Bytes werden
  anschließend an die Runtime-Evidence gebunden, dann wird die äußere App
  versiegelt. Das Mac-Gate muss die finalen Entitlements, Runtime-Flags,
  Signaturen, Architektur und den Paketstart prüfen.
- Der Desktop schreibt nur bei einem Core-`SIGTRAP` vor Ready und höchstens
  einmal pro App-Prozess zwei Diagnoseproben: `node --version` und, falls
  erfolgreich, einen minimalen Start mit dem gebündelten Netzwerk-Preloader.
  Beide nutzen dieselbe bereinigte Umgebung wie der Core, kein Shellskript,
  keine Nutzerdokumente, höchstens drei Sekunden je Stufe. Gespeichert werden
  feste Phasen-/Fehlercodes, Signal-Klasse, PID und Dauer; stdout/stderr,
  Dateipfade und Dokumentinhalte bleiben ausgeschlossen.
- Die Desktop-Diagnose rotiert exklusiv in bis zu acht Segmente von je 2 MB.
  Vorherige Segmente werden nicht überschrieben. Das erhöht die Chance, dass
  bei langen Testläufen gerade der Startfehler erhalten bleibt; es ist keine
  unbegrenzte Aufzeichnung und keine Garantie gegen Dateisystemfehler.
- Bis die Core-Verbindung bestätigt ist, sind Datei- und Ordnerwahl bewusst
  gesperrt und erhalten eine klare Startstatusmeldung. Ein `SIGTRAP` löst
  keine endlose automatische Wiederholung aus. „Verbindung und Laufstatus
  prüfen“ ist eine manuelle, nicht datenverarbeitende Neuprobe.

## Noch offene Abnahme

1. Beide Mac-Runner müssen exakt den RC162-Commit mit realem Bundle, ZIP,
   DMG, Konvertierung und Entitlement-Gate grün ausführen; der ARM-Runner auf
   macOS 26 ist zusätzlich erforderlich.
2. Das heruntergeladene ARM-ZIP oder DMG muss auf dem betroffenen M2 nach
   Finder-Kopie in den eigenen Benutzerordner starten. Core-Ready, Datei-
   und Ordnerdialog sowie ein kleiner synthetischer Lauf müssen gelingen.
   Bei einem Fehler alle `desktop-interactions*.jsonl` und vorhandene
   `sidecar-interactions*.jsonl` aus „Diagnose öffnen“ sichern. Insbesondere
   `core_probe_node` und `core_probe_preloader` vergleichen; keine
   Schutzrichtlinie abschalten und keinen zweiten Lauf aus unklarem Status
   starten.
3. Developer-ID-Signierung, Notarisierung und die finale Bundle-Platzierung
   weiterer ausführbarer Konverter sind gesonderte Gates für eine reguläre
   Mac-Verteilung. Das ad-hoc-signierte RC162 bleibt ein internes Testpaket.

Quellen: [Apple zu JIT auf Apple Silicon](https://developer.apple.com/documentation/apple-silicon/porting-just-in-time-compilers-to-apple-silicon),
[Apple zu SIGTRAP](https://developer.apple.com/documentation/xcode/sigtrap_sigill),
[Apple zu Notarisierung](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
[Tauri v2-Konfiguration](https://v2.tauri.app/reference/config/),
[Tauri-v2.11.4-Signierung](https://github.com/tauri-apps/tauri/blob/tauri-v2.11.4/crates/tauri-bundler/src/bundle/macos/sign.rs),
[Node-v22.23.2-Entitlements](https://github.com/nodejs/node/blob/v22.23.2/tools/osx-entitlements.plist).
