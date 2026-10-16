# RC161 auf M2/macOS 26.2: Core-Startabbruch vor Ready

Stand: 16.10.2026. Dies ist ein negativer Zielhostbefund, **kein**
erfolgreicher Mac-Abnahmetest und keine Diagnose einer bewiesenen OS-Ursache.
Der spätere RC162-Kandidat und seine konkrete Signaturkorrektur sind in
[RC162 Mac-Core-Signierung und Diagnose](RC162_MAC_CORE_SIGNING_AND_DIAGNOSTICS_20261016.md)
getrennt dokumentiert; die RC161-Beobachtung bleibt unverändert.
Die bereitgestellten `desktop-interactions*.jsonl` wurden nur lesend
ausgewertet. Kopierte Varianten gehören zum selben Ereignisstrom; die elf
Anhänge sind nicht elf unabhängige Testläufe. Dokumentinhalte, private Pfade
und rohe Prozessausgaben werden hier nicht übernommen.

## Beobachtung

- RC161, Build `f96c9e246997e52bf37f21930e2d0a3f978d68b2`, Ziel
  `macos-aarch64`: Der Desktop löst den gebündelten Core auf und `spawn()`
  gelingt. Danach endet der Core bei jedem der 16 protokollierten Versuche
  innerhalb von ungefähr 35–75 ms mit Signal 5 (`SIGTRAP`). Es folgt
  `STANDALONE_RECOVERY_ATTEMPTS_EXHAUSTED`.
- Kein `sidecar_entry` oder Ready des JavaScript-Sidecars ist belegt.
  Ein ausbleibendes Sidecar-Log ist mit einem Absturz vor JavaScript vereinbar,
  beweist diesen allein aber nicht: auch das Schreiben des Logs könnte
  scheitern. Eine rohe stderr-Zeile wurde aus Datenschutzgründen nicht
  gespeichert; ein klassifizierter stderr-Hinweis ist nicht vorhanden.
- Datei- und Ordnerdialoge sind ohne bestätigte Core-Verbindung bewusst
  gesperrt. Sie sind in diesem Befund Folge des Startfehlers, kein separat
  nachgewiesener Picker-Fehler. ZIP und DMG enthalten denselben App-Core.
- Schon die RC160-Diagnose enthielt wiederholte frühe Startfehler; die
  damaligen Logs hatten den Exit-Signal-Code noch nicht. Das beweist nicht,
  dass beide Fassungen dieselbe genaue Absturzursache haben.

## Abgleich mit dem aktuellen Entwicklungsstand

Zwischen dem RC161-Tag und dem committed HEAD wurden nur Dokumente geändert.
Die danach lokal hinzugefügten Prüfungen für vorhandene Core-, Sidecar- und
Preloader-Dateien helfen bei fehlenden Paketinhalten, nicht bei diesem
SIGTRAP: Im M2-Protokoll sind die Dateien bereits gefunden und der Core ist
gestartet. Spätere JavaScript-Startphasen werden vor `sidecar_entry` nicht
erreicht. Der Fehler ist im aktuellen Arbeitsstand deshalb **nicht als
behoben nachgewiesen**.

Die macOS-Pipeline signiert ad hoc und testet eine unverquarantinierte App
auf CI-macOS 26. Ein von GitHub heruntergeladenes und im Finder kopiertes
Paket auf dem verwalteten M2/macOS 26.2 ist damit nicht abgedeckt. Die
ausführbaren Konverter in `Contents/Resources` sind außerdem eine offene
Bundle-/Verteilungsprüfung; aus dem vorliegenden Signal folgt nicht, dass sie
den hier abstürzenden Core verursachen.

## Nächste Diagnose und Freigabegrenze

1. Im lokalen Entwicklungsstand ergänzen Desktop-Ereignisse nun die
   macOS-Produktversion, Prozess-ID, verstrichene Bootstrap-Zeit und den
   bloßen Vorhandenseinsstatus des Quarantäne-Merkmals an Core und App zu
   vorhandenen Phasen-, Signal- und stderr-Klassifikationen. Der Wert des
   Quarantäne-Merkmals und damit ein möglicher Download-Ursprung werden
   ausdrücklich nicht gelesen oder protokolliert. Der feste
   `STANDALONE_SIDECAR_SIGNAL_TRAP`-Code erreicht jetzt die Oberfläche;
   automatische Verbindungsversuche halten bei diesem Befund bereits nach
   dem ersten Fehlschlag an. Eine ausdrücklich ausgelöste Statusprüfung
   bleibt möglich, startet aber keinen Lauf oder Export. Das ist noch
   kein neues Mac-Paket und kein Beleg für einen reparierten Core.
2. Ein einmaliger, ausdrücklich ausgelöster lokaler Preflight soll die
   **geprüfte gebündelte** Core-Binary ohne Dokumentzugriff stufenweise
   testen: reiner Versionsstart, Start mit Netzwerk-Preloader, dann normales
   Sidecar-Bootstrap. Nur feste Ergebnisse, Signal und Dauer speichern.
   Kein CLI-Aufruf durch den Anwender, kein Abschalten einer Schutzrichtlinie.
3. Auf dem M2 wären ein redigierter Apple-Absturzbericht bzw. die
   Klassifikation aus dem Systemprotokoll, Signatur-/Entitlement-Status der
   tatsächlich kopierten Core-Binary und ein Vergleich mit einem nicht
   verwalteten macOS-26.2-Host entscheidend. Ohne diese Belege bleibt
   Betriebssystem-/Organisationsrichtlinie versus Signierung/Node-V8-JIT
   eine Hypothese. Weder Adminrechte noch eine freigegebene Terminal-App
   sollten für den vorgesehenen Benutzerordner-Weg vorausgesetzt werden.
4. Eine neue Mac-Testversion darf nicht als M2-funktionsfähig bezeichnet
   werden, bevor genau das heruntergeladene ZIP/DMG nach Finder-Kopie auf
   dem Zielhost startet, Core-Ready erreicht und Datei-/Ordnerauswahl mit
   synthetischen Daten funktioniert. Für eine reguläre Verteilung stehen
   Developer-ID-Signierung, Hardened Runtime, passende Entitlements und
   Notarisierung gesondert aus.

Apple dokumentiert [SIGTRAP/EXC_BREAKPOINT](https://developer.apple.com/documentation/xcode/sigtrap_sigill),
[Bundle-Code-Platzierung](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle)
und [Voraussetzungen für Notarisierung](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
Signal 5 allein ist kein Beleg für eine bestimmte Apple- oder IT-Sperre.
