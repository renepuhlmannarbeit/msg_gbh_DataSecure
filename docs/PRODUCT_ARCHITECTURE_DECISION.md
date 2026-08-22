# Produkt- und Architekturentscheidung vNext

> **Historische Architekturgrundlage:** Neuere verbindliche Entscheidungen stehen im
> [kanonischen Entscheidungsregister](canonical/DECISIONS.md). Insbesondere sind eine
> Signierungspflicht und frühere Mengen-/Formatgrenzen nicht mehr das Ziel.

Stand: 21.08.2026
Status: angenommen für die schrittweise Modernisierung

## Entscheidung in einem Satz

DataSecure wird als **lokale Datenschutzschleuse für KI-Anwendungen** gebaut;
Claude ist der erste Adapter, aber nicht die Sicherheitsgrenze und nicht das
eigentliche Produkt.

Wir starten weder einen Total-Rewrite noch entwickeln wir den Prototyp unverändert
weiter. Stattdessen modernisieren wir ihn schrittweise nach dem Strangler-Muster:
Die getestete Engine bleibt zunächst erhalten, während Companion, Jobmodell,
Review-UI, Plattformadapter und isolierte Worker über neue Verträge entstehen.

## Warum diese Entscheidung

Die bestehende Runtime besitzt einen großen Wert als Referenzimplementierung und
Sicherheits-Test-Harness: Parser, PII-Engine, MCP, Paketintegrität, Retention und
Fail-closed-Pfade sind mit einem umfangreichen synthetischen Korpus abgesichert und
haben keine npm-Laufzeitabhängigkeiten.

Gleichzeitig verhindern fünf Grenzen einen unveränderten Produktrollout:

1. Die sichtbare Bedienung ist ein technischer Ordner-/Prompt-Prozess statt eines
   einfachen lokalen Dateiablaufs.
2. Ein über MCP übergebenes `confirmed=true` ist kein unabhängiger Beleg für eine
   menschliche Freigabe.
3. Parser, Dateisystemzugriff, Policy und Veröffentlichung laufen noch zu nah
   beieinander im selben Prozess.
4. Markdown ist eine KI-Arbeitsfassung, keine layout- und strukturidentische Kopie
   einer Office- oder PDF-Datei.
5. Windows-OCR/PowerShell sowie eine vorausgesetzte Node-Runtime im Plugin-ZIP sind
   noch keine plattformunabhängige Ein-Klick-Auslieferung.

## Zielarchitektur

```text
Claude Skill/Plugin (keine Rohdaten, keine Freigabeberechtigung)
                         |
                         v
              stdio MCP-Fassade
     capabilities | session | status | released output | purge
                         |
                         v
       signierter lokaler Companion / Supervisor
          |               |                |
          v               v                v
     File Picker      lokale Review-UI    atomarer Job Store
     außerhalb Claude Freigabe/Skip       außerhalb Workspaces
                          |
                          v
        kurzlebige, netzlose Processing-Worker
    Extraktion | Erkennung | Ersetzung | unabhängige Prüfung
                          |
                          v
              freigegebenes Privacy-Paket
```

### Control Plane

- Ein sichtbarer DataSecure-Skill und eine kleine MCP-Fassade.
- Keine Originalpfade, Rohbytes, Vorschauen oder lokalen Freigabe-Tokens in Claude.
- Der Skill öffnet eine lokale Sitzung und liest ausschließlich veröffentlichte
  Ergebnisse anhand undurchsichtiger IDs.

### Data Plane

- Ein signierter Companion besitzt den Rohdatenbereich, den Jobzustand und das
  alleinige Veröffentlichungsrecht.
- Parser/OCR/NER laufen in kurzlebigen Workern ohne Netzwerk und mit CPU-, RAM-,
  Zeit-, Seiten-, Objekt- und Dekompressionsgrenzen.
- Der Extraction-Vertrag liefert einen versionierten Content Graph. Jeder Text- oder
  Bildspan bleibt mit seinem Source Locator verbunden: OOXML-Part und XML-Node,
  Tabellenzelle, PDF-Seite/BBox beziehungsweise Bild-BBox. Review und Rewriter dürfen
  ausschließlich über diese stabilen Locator-IDs korrigieren.
- Die lokale Review-UI kommuniziert über privaten IPC. Falls ein Loopback-Server für
  einen Spike unvermeidlich ist: zufälliger Port, Einmal-Token, CSP, Origin-/CSRF-
  Prüfung, kein CORS und automatisches Sitzungsende.
- Freigabe oder „Prüfung überspringen“ entstehen ausschließlich durch eine lokale
  Nutzeraktion und werden an Job-ID plus Output-Hash gebunden.

### Jobmodell

Das neue Modell ist monoton und atomar:

```text
Created -> Claimed -> Extracted -> Detected -> Reviewed|Skipped
        -> Verified -> Released
```

Ein Fehler kann niemals zu `Released` führen. Das Recovery-Journal enthält keine
Rohdaten, Pfade oder stabilen Originalfingerprints. Unfertige Jobs werden verworfen
und neu verarbeitet statt halb fortgesetzt.

`Verified` ist kein allgemeiner PII-Freiheitsbeweis. Der Release-Verifier muss für
kritische Entitäten mindestens ein vom Redaktor unabhängiges Signal verwenden. Solange
Redaktor und Abschlussprüfung denselben Collector teilen, darf die Oberfläche nur
melden: „Die unterstützten Prüfungen fanden keine weiteren Treffer.“ Ein heterogener
zweiter Detektor oder eine ausdrücklich eingeschränkte Verifikationssemantik ist Teil
des API-Vertrags.

## Produktversprechen trennen

### MVP: KI-Arbeitsfassung

Semantisch möglichst vollständiges, lokal de-identifiziertes Markdown mit nur sicher
freigegebenen Assets. Das ist für die Weiterverarbeitung durch Claude vorgesehen.
Normalisierung und bekannte Strukturverluste werden offen ausgewiesen.

### Später und formatweise: bereinigte Originaldatei

Nur wenn ein echter Rewriter alle relevanten Parts abdeckt und semantische sowie
visuelle Regressionstests bestehen. PDF-Redaktion muss Text-/Objektdaten wirklich
entfernen; ein schwarzes Overlay genügt nie.

## Sprache und Technologie

### Kein Big-Bang-Sprachwechsel

- Die bestehende Node.js-Engine bleibt zunächst der deterministische Kern und
  Referenzpfad.
- Neue öffentliche Control-Plane-Verträge werden zunächst mit JSDoc/`checkJs` und
  anschließend inkrementell mit strict TypeScript abgesichert. Ausgeliefert wird
  kompiliertes JavaScript; Anwender installieren keine Entwicklerwerkzeuge.
- Python/Presidio/GLiNER bleiben optionale isolierte Erkennungsworker oder
  Benchmark-Engines, nicht die Hauptruntime.
- Java/Tika kann ein isoliertes Enterprise-Formatpaket werden, nicht der Standard.

### Companion-Spike

Rust/Tauri ist der bevorzugte Kandidat für Companion, native Review-UI und
Worker-Supervisor: speichersicheres natives Binary, kleine Auslieferung und gute
Signierbarkeit. Diese Wahl wird nicht vorweggenommen, sondern in einem zweiwöchigen
Spike gegen die bestehende Node-Lösung belegt. Bewertet werden:

- signierte Installation auf Windows, macOS und Linux
- Kaltstart, RAM, Artefaktgröße und Barrierefreiheit
- private IPC- und Prozessisolation
- Upgrade, Rollback und reproduzierbarer Build
- Einbindung der bestehenden Engine ohne erneute Datenschutzregression

Go ist der Plan B, wenn Rust-Kompetenz, UI oder benötigte Bibliotheken die Spike-
Kriterien verfehlen. Sprache allein löst keine Formatvollständigkeit.

## Erster Produkt-Vertical-Slice

Der erste vollständige Ablauf wird bewusst schmal:

- Mitarbeiterprofil als DOCX oder textbasiertes PDF
- lokale Dateiauswahl außerhalb Claude
- automatische lokale Ersetzung
- lokale Gegenüberstellung
- „Erkannte Stellen prüfen“ oder bewusst „Ohne Zusatzprüfung fortfahren“
- technische Unsicherheiten bleiben nicht überspringbar
- „Bereinigte Fassung in Claude verwenden“

OCR, Excel, PowerPoint, Bilder, Batch, weitere Betriebssysteme und alternative
Detektoren werden erst entlang dieses bewiesenen Vertrags ergänzt.

## Sofortige Reihenfolge

1. Datensparsames Audit ohne Original-/Wertfingerprints einschließlich Migration
   alter Receipts. **Umgesetzt auf dem aktuellen Feature-Branch.**
2. Modellseitige Visual-Freigabe über `confirmed=true` entfernen; lokale
   Human-Presence-Schnittstelle definieren.
3. Versionierte Companion-API und unveränderliches Jobmodell spezifizieren und testen.
4. Fähigkeitscheck und Abschlussbericht ehrlich und anwenderverständlich machen.
5. Windows-Packaging ohne separat installierte Node-/npm-/Python-/Java-Runtime belegen.
6. Lokalen DOCX-/Text-PDF-Vertical-Slice umsetzen.
7. Rust/Tauri-Spike anhand der definierten Messwerte entscheiden.

## No-Go-Kriterien

- Kein Pilot, solange Claude eine menschliche Freigabe oder Skip-Aktion selbst per MCP
  erzeugen kann.
- Kein Rohdatenmodus für Claude Code ohne nachgewiesene OS-/Container-Sandbox.
- Kein stiller Cloud-, Runtime-, Modell- oder OCR-Download.
- Kein Teilrelease bei unbekannten oder ungeprüften eingebetteten Inhalten.
- Kein uneingeschränkter Verifikationsclaim, wenn Redaktor und Verifier dieselbe
  Erkennungsheuristik verwenden.
- Keine Garantie „anonym“, „PII-frei“, DSGVO- oder AI-Act-konform.
- Keine Behauptung von Formaterhalt ohne Part-Coverage und semantische/visuelle
  Regressionsevidenz.
- Keine persistenten Original-/Wertfingerprints, Rohpfade oder Dateinamen in Audit,
  Logs oder Crash-Dumps.
- Kein Big-Bang-Port ohne erfolgreichen Spike und vollständig erhaltene Testevidenz.

## Sprache gegenüber Anwendern

Sichtbar verwenden wir:

- „Datei für Claude vorbereiten“
- „bleibt auf diesem Gerät“
- „bereinigte Fassung“ oder „lokal de-identifiziert“
- „Die unterstützten Prüfungen fanden keine weiteren Treffer“

Wir vermeiden technische Begriffe wie MCP, Parser, Residual Gate, Privacy-Paket und
interne Profilnamen sowie pauschale Aussagen wie „vollständig anonymisiert“.
