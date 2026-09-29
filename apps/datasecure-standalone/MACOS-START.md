# DataSecure Standalone auf macOS starten

Aktuell für Standalone: [RC142-Vorabrelease mit ZIP **und zusätzlich DMG** für
Intel und Apple Silicon](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc142).
Die beiden nativen Mac-Jobs aus Commit `c0ddd11ecf366d32ff9962bfeffc6519b01a8c5d`
[sind bestanden](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36562812021):
ZIP und DMG enthalten dieselbe signierte App; beide Pakete wurden geprüft,
das DMG gemountet und die App daraus gestartet. Die veröffentlichten Digests
stimmen mit den lokal gesicherten Dateien überein. Die sichtbare
Finder-/Gatekeeper-Installation auf den Macs der Testpersonen bleibt offen.

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
Gates bestehen für RC141 und RC142 auf Intel und ARM aus ihren jeweils gebundenen
Commits. Das ersetzt nicht die nachfolgende sichtbare
Finder-/Gatekeeper-/Picker-/VoiceOver-/Anwenderabnahme.

Der DMG-Weg ist ein zusätzlicher, in RC142 nativ belegter Installationsweg:
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

- Intel-Mac: [RC142-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc142/DataSecure-Standalone-3.2.0-rc142-macos-x64.zip)
  oder [RC142-DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc142/DataSecure-Standalone-3.2.0-rc142-macos-x64.dmg),
  jeweils mit gleichnamiger `.sha256` auf der Release-Seite.
- Apple Silicon (M1 oder neuer):
  [RC142-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc142/DataSecure-Standalone-3.2.0-rc142-macos-arm64.zip)
  oder [RC142-DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc142/DataSecure-Standalone-3.2.0-rc142-macos-arm64.dmg),
  jeweils mit gleichnamiger `.sha256` auf der Release-Seite.
- Historische RC140-ZIPs: Intel mindestens macOS 15, ARM mindestens macOS 14.
- RC141-ZIPs sowie RC142-ZIPs/DMGs: minOS-Binärvertrag 13.5 für beide Architekturen geprüft;
  tatsächlich ausgeführt auf macOS 15 (Intel) und 14 (ARM). Abnahme auf 13.5 bleibt offen.

Node, PDF-Parser, Canvas-Bilddecoder, Tesseract-WASM und deutsche/englische
OCR-Modelle sind enthalten. Anwender installieren weder Rust/Xcode noch Node,
Python, Homebrew, LibreOffice oder ein eigenes Tesseract. Die Laufzeitprüfung
der RC140-/RC141-/RC142-Pakete fand nur macOS-Systembibliotheken als native Ladeabhängigkeiten.
Ein fehlendes Build-Tool ist deshalb keine Erklärung für einen Endanwenderfehler.

Das ZIP enthält einen Ordner
`DataSecure-Standalone-<Version>-macos-<Architektur>` mit der App,
`SHA256SUMS`, SBOM und Lizenznachweisen. Die Prüfsumme des **gesamten ZIPs**
steht in `<ZIP-Name>.sha256` aus demselben Release beziehungsweise Engineering-Artefakt.
Beide Dateien im selben Ordner ablegen und vor dem Entpacken im Terminal prüfen,
zum Beispiel für Apple Silicon:

```sh
cd ~/Downloads
shasum -a 256 -c DataSecure-Standalone-3.2.0-rc142-macos-arm64.zip.sha256
```

Nur bei `OK` fortfahren. Den Versions- und Architekturnamen im Befehl an die
tatsächlich heruntergeladenen Dateien anpassen. Die interne `SHA256SUMS` ist
kein Ersatz für diese Prüfung des heruntergeladenen ZIPs.

## Installation eines ad-hoc-signierten internen Pilotpakets

Beim **DMG** die passende `.dmg` und `.dmg.sha256` gemeinsam herunterladen,
analog die Prüfsumme kontrollieren, das DMG im Finder öffnen und die sichtbare
`DataSecure Standalone.app` auf **Programme** ziehen. Danach das DMG auswerfen.
Beim **ZIP** gelten die folgenden Schritte 1–2. Ab Schritt 3 ist der Weg für
beide Pakete gleich:

1. Das passende ZIP im Finder öffnen und den darin enthaltenen Ordner
   `DataSecure-Standalone-<Version>-macos-<Architektur>` öffnen.
2. **Nur** `DataSecure Standalone.app` aus diesem Ordner nach **Programme**
   ziehen; die App nicht direkt aus dem ZIP oder Downloads starten.
3. Die App einmal normal öffnen.
4. Nur wenn macOS wegen des nicht identifizierten Entwicklers oder der fehlenden
   Notarisierung blockiert und die Quelle samt Prüfsumme verifiziert wurde:
   **Systemeinstellungen → Datenschutz & Sicherheit** öffnen und bei
   DataSecure **Dennoch öffnen** wählen. Diese Option erscheint erst nach dem
   gescheiterten Öffnungsversuch und nur begrenzte Zeit (etwa eine Stunde).
5. Die erneute Rückfrage mit **Öffnen** bestätigen; gegebenenfalls das
   Mac-Anmeldepasswort eingeben.

Danach lässt sich die App normal über **Programme** oder Spotlight starten.
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
- Startseite ohne vorbelegten Modus; Auswahl oder Drag-and-drop verarbeitet noch
  nichts und erst **Starten** beginnt den Stapel;
- Mehrfachauswahl und rekursive Ordnerauswahl ohne zweiten Picker;
- **Nur in Markdown umwandeln** für TXT, Markdown, CSV, DOCX, XLSX, PPTX,
  Text-/Scan-PDF und PNG/JPEG/BMP; Basisnamen bleiben erhalten, es entsteht
  keine Zuordnungsdatei und kein PII-Review;
- **In Markdown umwandeln und anonymisieren** für TXT/Markdown/CSV direkt sowie
  DOCX und breite Quellen genau einmal Markdown-first; Extraktionsabdeckung und
  Anonymisierungsstatus werden getrennt angezeigt;
- bei Anonymisierung neutrale Ergebnisnamen als Standard und den Quellbasisnamen
  mit `-anonymisiert` als ausdrückliche Alternative prüfen;
- Review, Abbruch, App-Neustart und Fortsetzung;
- große lokale Prüfgruppen: mehr als 1000 Fundstellen werden auf mehrere
  begrenzte Gruppen verteilt; technische Dialogfehler dürfen nicht als
  Benutzerentscheidung „Später“ erscheinen (Quellkorrektur nach RC140);
- Verlauf mit 20 zeilengebundenen Läufen; Ergebnisordner, Zuordnung und
  Fortsetzung öffnen stets nur den gewählten Lauf;
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
