# DataSecure Standalone auf macOS starten

Status: Native ad-hoc-signierte App-Bundles sind auf echten Intel- und
Apple-Silicon-Runnern gebaut und über ihre private IPC-Grenze gestartet. Ein
Browser-Download mit Finder-Entpackung und Gatekeeper wurde damit noch nicht
nachgewiesen. Der
Workflow kann daraus zusätzlich ein geprüftes Engineering-ZIP für einen Tag
zum Zielhosttest bereitstellen. Die sichtbare menschliche Abnahme bleibt offen.

## Kostenkontrollierter technischer Vorlauf

Der GitHub-Workflow **Manual Standalone macOS sandbox evidence** kann auf echten
GitHub-macOS-Runnern getrennt für Intel und Apple Silicon ausgeführt werden. Er
ist ausschließlich manuell startbar und verlangt vor Runner-Zuteilung die
Bestätigung, dass ein privates Repository enthaltene macOS-Minuten verbrauchen
oder darüber hinaus Kosten auslösen kann. Zuerst nur `macos-arm64` starten;
`both` erst nach Prüfung des GitHub-Actions-Budgets wählen.

Der Workflow baut und prüft die gepinnte Laufzeit, den nativen POSIX-
Supervisor, die Standalone- und echten Konverterverträge, Rust/Clippy sowie das
native Tauri-Release-Binary. Er verwendet keine Secrets oder persistenten
Abhängigkeits-Caches. Ein Paket-Upload ist standardmäßig
ausgeschaltet. Wird `upload_package` ausdrücklich aktiviert, lädt der Workflow
nur das verifizierte ZIP und seine SHA-256-Datei mit einem Tag Aufbewahrung hoch.
Das Archiv wird zweimal bytegleich erzeugt, geprüft, entpackt, erneut auf
Signatur und Architektur geprüft und aus dem entpackten Paket über die private
IPC-Grenze gestartet. Das ersetzt nicht die nachfolgende sichtbare
Finder-/Gatekeeper-/Picker-/VoiceOver-/Anwenderabnahme.

Maßgebliche Herstellerhinweise:
[GitHub-gehostete Runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Actions-Abrechnung](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[Budgets und harte Ausgabenlimits](https://docs.github.com/en/billing/how-tos/set-up-budgets)
und [Tauri-Builds mit GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/).

## Passendes Paket

- Intel-Mac: `DataSecure-Standalone-<Version>-macos-x64.zip`
- Apple Silicon (M1 oder neuer):
  `DataSecure-Standalone-<Version>-macos-arm64.zip`
- Mindestversion: macOS 13.5

Das ZIP enthält einen Ordner
`DataSecure-Standalone-<Version>-macos-<Architektur>` mit der App,
`SHA256SUMS`, SBOM und Lizenznachweisen. Die Prüfsumme des **gesamten ZIPs**
steht in einem separaten Download `<ZIP-Name>.sha256` derselben Release-Seite.
Beide Dateien im selben Ordner ablegen und vor dem Entpacken im Terminal prüfen,
zum Beispiel für Apple Silicon:

```sh
cd ~/Downloads
shasum -a 256 -c DataSecure-Standalone-3.2.0-rc140-macos-arm64.zip.sha256
```

Nur bei `OK` fortfahren. Den Versions- und Architekturnamen im Befehl an die
tatsächlich heruntergeladenen Dateien anpassen. Die interne `SHA256SUMS` ist
kein Ersatz für diese Prüfung des heruntergeladenen ZIPs.

## Installation eines ad-hoc-signierten internen Pilotpakets

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
Weg bleibt ein interner Pilot. Developer-ID-Signierung und Notarisierung sind
optionale spätere Verbesserungen für eine bequemere breite Verteilung.

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
