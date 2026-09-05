# DataSecure Standalone auf macOS starten

Status: Vorbereiteter Installations- und UAT-Vertrag. Die App-Pakete sind noch
nicht gebaut oder auf echten Intel-/Apple-Silicon-Macs abgenommen.

## Passendes Paket

- Intel-Mac: `DataSecure-Standalone-<Version>-macos-x64.zip`
- Apple Silicon (M1 oder neuer):
  `DataSecure-Standalone-<Version>-macos-arm64.zip`
- Mindestversion: macOS 13.5

Das ZIP muss `SHA256SUMS`, die SBOM und Lizenznachweise enthalten. Vor der
Installation ist die veröffentlichte SHA-256-Prüfsumme zu vergleichen.

## Installation eines ad-hoc-signierten internen Pilotpakets

1. Das passende ZIP im Finder öffnen.
2. `DataSecure Standalone.app` nach **Programme** ziehen.
3. Die App einmal normal öffnen.
4. Falls macOS die App blockiert: **Systemeinstellungen → Datenschutz &
   Sicherheit** öffnen und bei DataSecure **Dennoch öffnen** wählen.
5. Die erneute Rückfrage mit **Öffnen** bestätigen.

Danach lässt sich die App normal über **Programme** oder Spotlight starten.
Die Ausnahme gilt nur für diese App. Gatekeeper darf weder global abgeschaltet
noch mit `xattr`- oder `spctl`-Befehlen umgangen werden. Auf verwalteten Macs
kann die Organisation das Öffnen nicht freigegebener Apps unterbinden.

Das Pilotpaket wird beim nativen macOS-Build ohne Apple-Zertifikat ausdrücklich
ad-hoc signiert (`signingIdentity: "-"`), aber nicht notariell beglaubigt. Diese
kostenfreie technische Signatur ersetzt weder Developer-ID-Signierung noch
Notarisierung und kann die Gatekeeper-Rückfrage deshalb nicht vermeiden. Der
Weg bleibt ein interner Pilot. Developer-ID-Signierung und Notarisierung sind
optionale spätere Verbesserungen für eine bequemere breite Verteilung.

## Zielhost-Abnahme

Die Freigabe erfordert je einen nativen Lauf auf Intel und Apple Silicon:

- Download, Prüfsumme, Finder-Entpackung und Gatekeeper-Ablauf;
- Mehrfachauswahl und Ordnerauswahl ohne zweiten Picker;
- TXT, Markdown, CSV und DOCX lokal anonymisieren;
- Review, Abbruch, App-Neustart und Fortsetzung;
- Ergebnis- und Zuordnungsordner öffnen;
- falsches Architekturpaket stoppt verständlich;
- keine Rosetta-Pflicht auf Apple Silicon;
- Offline-Lauf, VoiceOver, Tastatur, Zoom, Fokus und Dark Mode;
- Kaltstart p50/p95, Arbeitsspeicher und Paketgröße erfassen;
- App ersetzen, zurückrollen und entfernen, ohne Nutzer- oder Plugin-Daten zu
  löschen oder zu verändern.

Ein ARM-Lauf unter Rosetta ersetzt den echten Intel-Nachweis nicht.
