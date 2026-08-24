# OCR-Batch-Session V1 – Sicherheitsvertrag

Bezug: **BL-024.4**, BL-011.12, DS-018, DS-021, DS-022, DS-023 und DS-024.

## Status

Eine OCR-Batch-Session ist **kein** aktiver Produktpfad. Der aktuelle portable
OCR-Worker verarbeitet genau ein Bild und endet danach. Das ist langsamer, bindet
aber die vorhandenen nativen CPU- und Wallclock-Grenzen eindeutig an genau diese
eine Anfrage.

Eine bloße Wiederverwendung eines Node-/Tesseract-Prozesses oder ein globaler OCR-
Daemon ist verboten. Sie würde die Prozessgrenzen auf den gesamten Stapel
verschieben und damit die pro Bild zugesicherte Isolation schwächen.

## Zulässige Zielarchitektur

Erst nach positiver Drei-Plattform-Evidenz darf ein **stapelgebundener**, serieller
`PortableOcrBatchSession` aktiviert werden:

1. Der verifizierte native Launcher startet genau eine Session für genau einen
   aktiven Stapel. Sie wird niemals zwischen Stapeln, Benutzern oder Prozessen
   wiederverwendet.
2. Die Session lädt die lokalen Modelle `deu` und `eng` genau einmal und arbeitet
   ausschließlich **single-flight**: ein Bild gleichzeitig, keine Warteschlange
   größer als eins und keine parallele OCR.
3. Parent und Worker sprechen ein versioniertes, binäres, length-prefixed Protokoll.
   Jeder Frame enthält nur Protokollversion, eine vom Parent erzeugte Request-ID,
   geprüfte Breite/Höhe und Bildbytes. Pfade, Namen, Hashes, Optionen, Sprachen,
   Umgebungswerte und Rohtexte sind keine Protokollfelder.
4. Pro Frame gelten unverändert die heutigen Eingabe-, Pixel-, Ausgabe-, CPU-,
   Speicher- und Wallclock-Grenzen. Der native Supervisor muss CPU und Wallclock
   **pro Anfrage** erzwingen können; ein JavaScript-Timer allein genügt nicht.
5. Zusätzlich besitzt eine Session feste Höchstwerte für Bilder, Bytes, Laufzeit
   und offene Dateideskriptoren. Nach Erreichen eines Grenzwerts wird sie geordnet
   beendet und bei einer späteren Position frisch gestartet.
6. Bei Abbruch, Timeout, Ressourcenüberschreitung, Prozesscrash, Protokollfehler,
   doppelter oder unerwarteter Request-ID, Netzversuch oder ungültigem OCR-V1-
   Ergebnis beendet der Parent den vollständigen Prozessbaum und wartet sein Ende
   ab. Kein weiterer Frame darf an diese Session gehen.
7. Ergebnisse werden nach jeder Antwort erneut mit dem bestehenden OCR-V1-Vertrag
   validiert. Ein Fehler veröffentlicht weder Paket, Mapping noch Audit der
   betroffenen Position; die bestehende explizite Fortsetzung entscheidet über den
   nächsten Versuch.

Die Session bleibt für Cowork vollständig unsichtbar: keine zusätzliche
Berechtigung, keine Auswahl, kein Polling und keine Worker-/Thread-Option.

## Aktivierungsvoraussetzungen

Vor einer Aktivierung sind erforderlich:

- nativer, versions- und hashgebundener Per-Frame-Supervisor für Windows, macOS
  x64/ARM64 und Linux x64;
- geframte Negativtests: abgeschnittener, übergroßer, doppelter, ungeordneter und
  unerwarteter Frame; kein Rohinhalt in Fehlermeldung oder Diagnose;
- Einzelbild-gegen-Session-Gleichheit, Single-Flight, Timeout, Abbruch,
  Prozessbaum-Bereinigung, Speicher-/Ausgabeflut, Netzverbot, Session-Recycling
  und keine Wiederverwendung über die Batch-Grenze;
- echte Offline-Evidenz auf Windows, macOS und Linux sowie ein fachlicher
  Erkennungsvergleich (E1/E3).

Bis dahin bleibt der Einbild-Worker der sichere Standard und `release_enabled`
für portable OCR unverändert gesperrt.
