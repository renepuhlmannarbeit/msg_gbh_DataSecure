# DataSecure Standalone auf macOS starten

Anleitung für den macOS-Test-Pre-Release **3.2.0-rc161**.
[RC161-ZIP und DMG für Intel und Apple Silicon](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc161)
mit der jeweils passenden Prüfsumme verwenden. Das Testpaket ist ad-hoc-signiert,
nicht mit Apple Developer ID signiert oder notarisiert. Native technische
Runner-Prüfungen ersetzen keine Finder-/Gatekeeper-/VoiceOver-/Bedienabnahme.

**Bekannter Mac-26.2/M2-Prüfstopp:** Ein Nutzer meldete bei DMG und ZIP eine
sofort unterbrochene lokale Verbindung. RC160 ist auf diesem Zielhost daher
**nicht als funktionsfähig abgenommen**; auch RC161 ist zunächst nur eine
gezielte Neuprobe mit synthetischen Daten. RC161 protokolliert den frühen
Core-Start genauer und begrenzt automatische Wiederholungen. Das Kopieren
der App in den eigenen Nutzerordner verlangt normalerweise
keine Administratorrechte. Eine gesperrte Terminal-App ist für die normalen
Datei-/Ordnerbuttons keine Voraussetzung. Beide Aussagen sind keine
Umgehungsempfehlung für Organisationsrichtlinien.

Für die nächste gemeinsame M2-Probe das **RC161-Testpaket**, nicht das
unveränderte RC160 verwenden. Im Fuß der Anwendung die kurze Build-ID und die
tatsächlich laufende Architektur (ARM64 oder Intel) notieren.
Nur eine Paketvariante in einem eigenen Testordner starten und zunächst
synthetische Testdateien verwenden. Wenn schon die Verbindung fehlt,
„Diagnose öffnen“ wählen und alle `desktop-interactions*.jsonl` sowie
vorhandene `sidecar-interactions*.jsonl` aus diesem Diagnoseordner
weitergeben. Fehlt die zweite Art, ausdrücklich „fehlt“ melden; nicht auf
einen fehlenden Crashbericht als Entwarnung schließen. Falls die App
„automatische Verbindungsversuche angehalten“ meldet, nach Sicherung der
Diagnose einmal „Verbindung und Laufstatus prüfen“ wählen. Keine erneute
Verarbeitung oder Exportaktion aus einem unbestätigten Status ableiten.
Schlägt schon der Start des lokalen Core auf einem verwalteten Mac fehl,
die IT um eine zeitpunktbezogene Prüfung der Ausführungsrichtlinien bitten;
keine Gatekeeper- oder Endpoint-Schutzfunktion deaktivieren.

## Verarbeitung und Prüfung in RC161

1. Nach der Installation unter **Neue Verarbeitung** zuerst **Nur umwandeln**
   oder **Umwandeln und anonymisieren** wählen. Dateien/Ordner hinzufügen,
   gewünschte Dateien anhaken und das Ergebnisziel kontrollieren.
   **Verarbeitung starten** beginnt höchstens 200 Dateien / 500 MB.
   Auswahl oder Drag-and-drop allein startet nichts.
2. **Jetzt prüfen** öffnet die Fundstellen dieses Laufs. Checkboxen wählen nur
   aus. Gemeinsame Behandlungen sind zunächst vorgemerkt; erst **Gruppe
   übergeben und weiter** speichert die vollständig bearbeitete Gruppe.
   Offen-Filter, weitere Seiten und Folgegruppen beachten. Original-/Markdown-
   Vergleich und OCR-Originalbildausschnitt gehören zum angezeigten Punkt.
   Personen- und Unternehmensentscheidungen bleiben unterscheidbar.
3. Nach Fundstellenabschluss öffnet sich bei Anonymisierung direkt die
   Dokumentprüfung desselben Laufs. Quelle und geplantes Markdown vergleichen,
   gewünschte Dokumente auswählen und **Auswahl freigeben** wählen.
   Das ist ein eigener Schritt; technische Verarbeitung ist noch keine Freigabe.
4. **Auswahl für KI exportieren** kopiert nach ausdrücklicher Bestätigung
   ausschließlich freigegebene aktuelle Markdown-Stände in einen normalen
   separaten Ordner. Originale, Identitäts-/Dateizuordnung, private Prüfstände
   und Begleitdateien werden nicht mitkopiert. Den technischen Laufordner
   niemals pauschal an eine KI weitergeben.
5. **Später entscheiden**, Pause und Fortsetzung gehören zum konkreten Lauf.
   Der Verlauf zeigt höchstens 20 Verarbeitungen. **Ergebnisse prüfen und
   freigeben** öffnet bei Anonymisierung die spätere Dokumentprüfung.
   Neue Dateien gehören nach dem Start in eine neue Verarbeitung.
   Verbindungsverlust wiederholt Entscheidungen und Exportbestätigungen nicht blind.

Bei reiner Umwandlung bleiben Originalinhalte erhalten.
**Markdown nachkorrigieren** bietet die spätere Korrektur; ein solcher
Markdown-Export ist ausdrücklich **nicht anonymisiert**. Neun rohe OCR-E-Mail-
Abweichungen bleiben im synthetischen Qualitätskorpus bekannte Warnungen.
Fehlerdateien werden lokal mit Namen, Fehlercode und nächstem Schritt angezeigt;
Diagnoseprotokolle enthalten keine Namen, Pfade oder Dokumentinhalte.
Originale und vertrauliche Identitätszuordnungen werden nicht automatisch gelöscht.

## Historische technische Nachweise

RC157: Die beiden nativen Mac-Jobs aus Commit
`111737d28021b6989ffe8d563b58daa9cbae610f`
[sind bestanden](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770900387).
Diese Evidence gehört zu RC157, nicht zum neuen RC159-Paket.

Historischer RC142-Nachweis: Die beiden nativen Mac-Jobs aus Commit
`c0ddd11ecf366d32ff9962bfeffc6519b01a8c5d` [bestanden ebenfalls](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36562812021);
ZIP und zusätzlich DMG wurden im [RC142-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc142)
bereitgestellt.

Historischer RC141-Nachweis:
Status: Die veröffentlichten RC141-ZIPs aus Commit
`1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542` bestehen den nativen Intel-/ARM-Lauf
[`35875613438`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/35875613438)
einschließlich Signaturen, Mindestversionen sämtlicher nativer Komponenten,
direktem/LaunchServices-Start, Konvertierung, Anonymisierung und Verlauf.
[Exakte ZIP-Hashes und Nachweisgrenzen](../../docs/REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).
Die ZIPs samt Prüfsummen sind im
[dauerhaften RC141-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)
verfügbar und lokal gesichert. Browser-/Finder-/Gatekeeper-Installation und eine
tatsächliche Ausführung auf macOS 13.5 bleiben offen.

Historischer Vergleich: Die RC140-ZIPs aus Commit `814bc50e3d754224cd95b6fa91f122dd45f48487`
sind auf echten Intel- und Apple-Silicon-Runnern zweimal bytegleich gebaut,
einzeln auf Signatur und Architektur geprüft sowie entpackt mit echten
Konvertierungen über die private IPC-Grenze gestartet. Ein
Browser-Download mit Finder-Entpackung, Kopie nach Programme, LaunchServices
und Gatekeeper wurde damit noch nicht nachgewiesen. Die Runner verwenden
macOS 14/15. **Der erneute Byte-Review hat einen Fehler im RC140-Paketvertrag
bewiesen:** Der POSIX-Helfer verlangt Intel macOS 15.0 bzw. ARM macOS 14.0,
obwohl die App macOS 13.5 deklariert. RC140 deshalb nicht auf 13.5 einsetzen.
RC141 korrigiert das Deployment-Target, native Signaturen und numerische
App-Metadaten; die veröffentlichten RC140-ZIPs enthalten diese Korrekturen nicht.
Die sichtbare menschliche Abnahme bleibt offen.

## Diagnose ohne geladene Oberfläche

DS-109 ist im RC159-Quellstand enthalten. DataSecure kann den inhaltsfreien Diagnoseordner vor der WebView-Initialisierung mit
`--startup-diagnostics` öffnen. Im Terminal den ausführbaren App-Inhalt
`"/Applications/DataSecure Standalone.app/Contents/MacOS/datasecure-standalone" --startup-diagnostics`
starten; bei anderem Installationsort den App-Pfad entsprechend wählen.
Ein Startbericht nennt einen festen System-/Paketfehlercode ohne Dokumentinhalt.
Wird schon der Prozessstart von macOS blockiert, kann die App selbst keinen
Bericht erzeugen. Die macOS-Meldung mit der IT prüfen; Gatekeeper oder andere
Schutzfunktionen nicht pauschal deaktivieren. Diese Diagnosefunktion ist keine
neue native Mac-Bedienabnahme.

## Kostenkontrollierter technischer Vorlauf

Der GitHub-Workflow **Manual Standalone macOS sandbox evidence** kann auf echten
GitHub-macOS-Runnern getrennt für Intel und Apple Silicon ausgeführt werden. Er
ist ausschließlich manuell startbar und verlangt vor Runner-Zuteilung die
Bestätigung, dass ein privates Repository enthaltene macOS-Minuten verbrauchen
oder darüber hinaus Kosten auslösen kann. Ein einzelnes Ziel oder `both` darf
erst nach einer ausdrücklichen Budgetentscheidung gestartet werden.

Der Workflow baut und prüft die gepinnte Laufzeit, den nativen POSIX-
Supervisor, die Standalone- und echten Konverterverträge, Rust/Clippy sowie das
native Tauri-Release-Binary. Er verwendet keine Secrets oder persistenten
Abhängigkeits-Caches. Ein Paket-Upload ist standardmäßig
ausgeschaltet. Wird `upload_package` ausdrücklich aktiviert, lädt der Workflow
das verifizierte ZIP und DMG samt SHA-256-Dateien mit einem Tag Aufbewahrung hoch.
Das Archiv wird zweimal bytegleich erzeugt, geprüft, entpackt, erneut auf
Signatur und Architektur geprüft. Der überarbeitete Workflow prüft zusätzlich
die tatsächlich eingebettete Mindestversion und Systembibliotheken **aller**
Mach-O-Dateien einschließlich des Canvas-Addons. Er startet die entpackte App
direkt sowie über LaunchServices und prüft Konvertierung, Anonymisierung,
Zuordnung, Fehlerfälle und Verlauf mit der gebündelten Runtime. Diese neuen
Gates bestehen für RC141, RC142, RC151 und RC157 auf Intel und ARM aus ihren jeweils gebundenen
Commits. Das ersetzt nicht die nachfolgende sichtbare
Finder-/Gatekeeper-/Picker-/VoiceOver-/Anwenderabnahme.

Der DMG-Weg ist ein zusätzlicher, in RC142, RC151 und RC157 nativ belegter Installationsweg:
DMG öffnen und die enthaltene App auf **Programme** ziehen. Er enthält dieselbe
App wie das ZIP und wurde vor Bereitstellung separat auf Integrität, Signatur,
Start und Architektur geprüft. Ein DMG allein behebt jedoch keine
Gatekeeper-Sperre. Solange Developer-ID-Signatur und Apple-Notarisierung fehlen,
bleibt auch der DMG ein ad-hoc-signiertes internes Pilotpaket; die unten
beschriebene app-spezifische Freigabe kann weiterhin nötig sein.

Maßgebliche Herstellerhinweise:
[GitHub-gehostete Runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Actions-Abrechnung](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[Budgets und harte Ausgabenlimits](https://docs.github.com/en/billing/how-tos/set-up-budgets)
und [Tauri-Builds mit GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/).

## Passendes Paket

- Intel-Mac: [RC161-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc161/DataSecure-Standalone-3.2.0-rc161-macos-x64.zip)
  oder [RC161-DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc161/DataSecure-Standalone-3.2.0-rc161-macos-x64.dmg),
  jeweils mit gleichnamiger `.sha256` auf der Release-Seite.
- Apple Silicon (M1 oder neuer):
  [RC161-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc161/DataSecure-Standalone-3.2.0-rc161-macos-arm64.zip)
  oder [RC161-DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc161/DataSecure-Standalone-3.2.0-rc161-macos-arm64.dmg),
  jeweils mit gleichnamiger `.sha256` auf der Release-Seite.
- Historische RC140-ZIPs: Intel mindestens macOS 15, ARM mindestens macOS 14.
- Aktueller RC161-Binärvertrag: macOS 13.5 für beide Architekturen.
  Die Paketgates laufen auf macOS 15 (Intel) und macOS 26 (ARM);
  die Zielhost-Abnahme auf M2/macOS 26.2 und macOS 13.5 bleibt offen.

Node, PDF-Parser, Canvas-Bilddecoder, Tesseract-WASM und deutsche/englische
OCR-Modelle sind enthalten. Anwender installieren weder Rust/Xcode noch Node,
Python, Homebrew, LibreOffice oder ein eigenes Tesseract. Die Laufzeitprüfung
der RC140-/RC141-/RC142-/RC151-Pakete fand nur macOS-Systembibliotheken als native Ladeabhängigkeiten.
Ein fehlendes Build-Tool ist deshalb keine Erklärung für einen Endanwenderfehler.

Das ZIP enthält einen Ordner
`DataSecure-Standalone-<Version>-macos-<Architektur>` mit der App,
`SHA256SUMS`, SBOM und Lizenznachweisen. Die Prüfsumme des **gesamten ZIPs**
steht in `<ZIP-Name>.sha256` aus demselben Release beziehungsweise Engineering-Artefakt.
Beide Dateien im selben Ordner ablegen und vor dem Entpacken im Terminal prüfen,
zum Beispiel für Apple Silicon:

```sh
cd ~/Downloads
shasum -a 256 -c DataSecure-Standalone-3.2.0-rc161-macos-arm64.zip.sha256
```

Nur bei `OK` fortfahren. Den Versions- und Architekturnamen im Befehl an die
tatsächlich heruntergeladenen Dateien anpassen. Die interne `SHA256SUMS` ist
kein Ersatz für diese Prüfung des heruntergeladenen ZIPs.

## Installation eines ad-hoc-signierten internen Pilotpakets

Beim **DMG** die passende `.dmg` und `.dmg.sha256` gemeinsam herunterladen,
analog die Prüfsumme kontrollieren, das DMG im Finder öffnen und die sichtbare
`DataSecure Standalone.app` auf **Programme** oder für die isolierte Neuprobe
in einen eigenen Benutzer-Testordner ziehen. Danach das DMG auswerfen.
Beim **ZIP** gelten die folgenden Schritte 1–2. Ab Schritt 3 ist der Weg für
beide Pakete gleich:

1. Das passende ZIP im Finder öffnen und den darin enthaltenen Ordner
   `DataSecure-Standalone-<Version>-macos-<Architektur>` öffnen.
2. **Nur** `DataSecure Standalone.app` aus diesem Ordner nach **Programme**
   oder für die isolierte M2-Neuprobe in einen eigenen Benutzer-Testordner
   ziehen; die App nicht direkt aus dem ZIP oder Downloads starten und keine
   ältere RC160-App damit überschreiben.
3. Die App einmal normal öffnen.
4. Nur wenn macOS wegen des nicht identifizierten Entwicklers oder der fehlenden
   Notarisierung blockiert und die Quelle samt Prüfsumme verifiziert wurde:
   **Systemeinstellungen → Datenschutz & Sicherheit** öffnen und bei
   DataSecure **Dennoch öffnen** wählen. Diese Option erscheint erst nach dem
   gescheiterten Öffnungsversuch und nur begrenzte Zeit (etwa eine Stunde).
5. Die erneute Rückfrage mit **Öffnen** bestätigen; gegebenenfalls das
   Mac-Anmeldepasswort eingeben.

Danach lässt sich die App vom gewählten Ort starten.
Die Ausnahme gilt nur für diese App. Gatekeeper darf weder global abgeschaltet
noch mit `xattr`- oder `spctl`-Befehlen umgangen werden. Auf verwalteten Macs
kann die Organisation das Öffnen nicht freigegebener Apps unterbinden.

Falls macOS **„beschädigt“** oder eine **Schadsoftwarewarnung** meldet, nicht
„Dennoch öffnen“ erzwingen: Prüfsumme und richtiges Architekturpaket erneut
kontrollieren und den genauen Wortlaut mit macOS-Version und `uname -m` für
die UAT notieren. Dasselbe gilt, wenn die App nach dem Öffnen sofort schließt;
ein bestandener Runner-IPC-Test ersetzt keinen sichtbaren Start auf dem Mac.

Das Pilotpaket wird beim nativen macOS-Build ohne Apple-Zertifikat ausdrücklich
ad-hoc signiert (`signingIdentity: "-"`), aber nicht notariell beglaubigt. Diese
kostenfreie technische Signatur ersetzt weder Developer-ID-Signierung noch
Notarisierung und kann die Gatekeeper-Rückfrage deshalb nicht vermeiden. Der
Weg bleibt ein interner Pilot, dessen tatsächliche Installierbarkeit pro
Zielhost erst im N3-Test belegt wird. Für eine reibungsarme breite Verteilung
ist Developer-ID-Signierung mit Notarisierung der vorgesehene Weg; eine
ad-hoc-Signatur ist dafür kein Ersatz. Ohne diese Voraussetzungen nicht als
einfach installierbare macOS-Version bewerben.

## Zielhost-Abnahme

Die Freigabe erfordert je einen nativen Lauf auf Intel und Apple Silicon:

- echter Browser-Download beider Release-Dateien, externe ZIP-Prüfsumme,
  Finder-Entpackung samt Paket-Unterordner, Kopie nach Programme und
  Gatekeeper-Ablauf (oder dessen genaue Blockiermeldung);
- **Neue Verarbeitung** ohne vorbelegte Aufgabe; Auswahl/Drag-and-drop
  verarbeitet nichts, erst **Verarbeitung starten** beginnt den Lauf;
- Mehrfachauswahl, rekursive Ordneraufnahme und Katalogcheckboxen; bis 200
  Dateien / 500 MB verarbeiten, Auswahl abbrechen ohne Verlust vorhandener Quellen;
- nicht unterstützte Quellen und gestoppte Dateien mit Namen, Endung,
  Fehlercode und nächstem Schritt lokal anzeigen, ohne Namen in der Diagnose;
- Fortschritt, Pause an Dateigrenzen und Fortsetzung desselben Laufs; neue
  Verarbeitung erhält eine eigene Auswahl und verändert frühere Läufe nicht;
- **Nur umwandeln** für TXT, Markdown, CSV, DOCX, XLSX, PPTX, Text-/Scan-PDF und
  PNG/JPEG/BMP; Originalinhalte erhalten, optionale OCR-Kontaktprüfung,
  Markdown-Nachkorrektur ohne Dateizuordnung oder Anonymisierungsbehauptung;
- **Umwandeln und anonymisieren**: breite Quellen Markdown-first; getrennte
  Extraktions-/Anonymisierungsstatus, neutrale Ergebnisnamen, Personen/Firmen;
- Sammelbehandlung zunächst vorgemerkt, vollständige Gruppenübergabe,
  Folgeschritte im selben Prüffenster, Vertagen/Neustart/Fortsetzen;
- nach Fundstellenabschluss direkt Dokumentprüfung desselben Laufs; Freigaben
  nur für ausdrücklich gewählte aktuelle Dokumentstände;
- getrennter bestätigter KI-Export in einen normalen Ordner ohne Originale,
  Zuordnungen oder private Prüfstände; Änderungen widerrufen betroffene Freigaben;
- große lokale Prüfgruppen und verständliche technische Fehler; Dialogfehler
  dürfen nicht als Benutzerentscheidung „Später“ erscheinen;
- Verlauf mit höchstens 20 laufgebundenen Karten; alle Aktionen gehören zum
  gewählten Lauf, keine Bestätigung allein durch Status-Momentaufnahmen;
- falsches Architekturpaket stoppt verständlich;
- keine Rosetta-Pflicht auf Apple Silicon;
- Offline-Lauf, VoiceOver, Tastatur, Zoom, Fokus und Dark Mode;
- Kaltstart p50/p95, Arbeitsspeicher und Paketgröße erfassen;
- App ersetzen, zurückrollen und entfernen, ohne Nutzer- oder Plugin-Daten zu
  löschen oder zu verändern.

Ein ARM-Lauf unter Rosetta ersetzt den echten Intel-Nachweis nicht.

Für die Zwei-Personen-Abnahme vor der Installation `uname -m` ausführen und die
tatsächliche Architektur in der macOS-Spur des
[N3/N4-Testplans](../../docs/acceptance/FORMAL_UAT/README.md) eintragen. Der Mac-
Tester verwendet denselben Kandidaten-Commit wie der Windows-Tester, aber das
architekturpassende Paket und eine getrennte Evidence-Datei.
