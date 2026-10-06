# Vertrag: einfacher lokaler Sammelreview v2

Status: verbindlicher Produktvertrag · Stories: BL-012.9, BL-012.10, BL-043.1,
BL-032.1, BL-021.1, BL-050.6 · Entscheidungen: DS-068, DS-096, DS-108

## Produktentscheidung

DataSecure behält den vorhandenen lokalen Sammelreview. Es wird weder eine
cloudseitige Rohdatenoberfläche noch ein zweiter Reviewweg eingeführt. Klare
Dateien werden automatisch lokal abgeschlossen; ausschließlich Dateien mit einer
echten fachlichen Mehrdeutigkeit gelangen in die lokale Prüfung.

Der Vertrag übernimmt aus dem PII-Shield-Interaktionsmuster nur die Teile, die die
Bedienung vereinfachen, ohne die lokale Datenschutzgrenze zu verschieben:

- farbliche Trennung: rot steht für bereits anonymisierte, gelb für noch zu
  entscheidende Stellen;
- direkte fachliche Aktionen statt Ja/Nein: für Zertifikatskontexte
  **Zertifikatsanbieter behalten** / **Organisation anonymisieren**, für eng
  begrenzte plausible Prosanamen **Kein Personenname – beibehalten** /
  **Als Person anonymisieren**;
- sichtbarer Fortschritt für automatisch abgeschlossene, bereits geprüfte,
  aktuell zu prüfende und danach noch offene Dateien;
- Vor/Zurück beziehungsweise Rückgängig, ausdrückliches Vertagen und eine einzige
  abschließende Freigabe je begrenzter Prüfgruppe;
- Tastaturbedienung auf Windows: `Alt+Z` behalten, `Alt+O` anonymisieren,
  `Alt+R` rückgängig, `Strg+Enter` freigeben und `Esc` vertagen/abbrechen;
- eine bewusste Gruppenaktion für Zertifikatsanbieter nur bei lokal nachweislich
  identischen vollständigen Kontextzeilen; mögliche Personennamen desselben
  Fundstellentyps mit exakt gleichem normalisierten Wortlaut werden innerhalb
  der aktuellen Prüfgruppe nach sichtbarem Hinweis einmal entschieden. Jede
  Fundstelle bleibt separat an ihre unveränderte Textposition gebunden;
  niemals fuzzy oder als dauerhafte Begriffsfreigabe.

## Normal- und Ausnahmeweg

1. Die automatische Analyse verarbeitet den gesamten Stapel ohne fachlichen
   Dialog pro Datei.
2. Eine klare Datei wird unmittelbar nach den normalen Sicherheitsgates lokal
   veröffentlicht. Sie öffnet keine Review-UI und wird bei einem späteren Review
   nicht erneut verarbeitet.
3. Eine mehrdeutige Datei bleibt als inhaltsfreier Zustand `deferred_review`
   gesperrt. Originaltext, Ergebnistext, Fundstellen und Entscheidungen werden
   weder journalisiert noch an Claude gegeben.
4. Nach der Analyse werden nur die mehrdeutigen Dateien in einer begrenzten
   lokalen Prüfgruppe rekonstruiert. Die Oberfläche nennt Dateien ausschließlich
   anonym als `Dokument N`.
5. Die lokale Freigabe publiziert nur vollständig entschiedene Dokumente. Abbruch,
   Vertagung, Timeout oder ungültige Antwort lassen offene Dateien gesperrt und
   bewahren bereits atomar veröffentlichte Ergebnisse.

## Daten- und Sicherheitsgrenze

- Rohtext gelangt nur über `stdin` in den klassifizierten lokalen UI-Prozess.
- Fortschrittsmetadaten enthalten ausschließlich Zähler; keine Namen, Pfade,
  Fundstellenwerte, Hashes, Tokens oder Mappings.
- PII-Shields browserseitiges Rohdaten-Payload, reversible Zuordnungstabellen,
  Laufzeitdownloads und ein Cloud-/MCP-App-Review werden nicht übernommen.
- Freie Bereichsredaktionen bleiben im Sammelreview gesperrt, bis ihre
  Dokumentkoordinaten auch über Separatoren, Teilgruppen und Neustart
  positionssicher gebunden werden können. Der Einzeldateireview darf seine
  bestehende validierte Auswahlfunktion behalten.
- Kein Modell und keine Heuristik darf eine mehrdeutige Keep-/Redact-Entscheidung
  still im Namen des Menschen treffen.

## Abnahmekriterien E0

- Ein vollständig klarer Mehrdateienstapel öffnet null Reviewdialoge und endet
  vollständig.
- Ein Mischstapel darf klare Dateien intern abschließen, veröffentlicht den
  sichtbaren Stapel aber erst nach dem erforderlichen Review als Einheit. Der
  Reviewentwurf enthält nur mehrdeutige Dokumente und zeigt korrekte
  inhaltsfreie Zähler.
- Genau ein lokaler Reviewer-Aufruf bearbeitet eine begrenzte Prüfgruppe.
- Windows-, macOS- und Linux-Adapter verwenden dasselbe Aktionsvokabular und
  zeigen den Fortschritt, ohne Rohdaten in Argumenten oder Metadaten abzulegen.
- Unvollständige, manipulierte oder fremde Entscheidungen stoppen fail-closed.
- Gruppenaktionen gelten für Zertifikatsanbieter nur bei exakt identischen
  normalisierten Kontextzeilen. Bei möglichen Personen bilden exakt gleiche
  normalisierte vollständige Namen eine gemeinsame Entscheidungseinheit.
- Eine als Person bestätigte Prosafundstelle erhält dasselbe stapelweite
  Personenpseudonym wie dieselbe Identität an eindeutigen Personenfeldern. Ein
  bereits gebundener exakter vollständiger Name wird in Folgedokumenten
  automatisch anonymisiert. „Beibehalten“ gilt nur für die geprüften offenen
  Stellen, innerhalb desselben Sammelreviews aber stets einheitlich.

## Standalone-Erweiterung: OCR-Kontakte vor der Anonymisierung (06.10.2026, unveröffentlicht)

Ein syntaktisch plausibler OCR-Kontakt ist noch kein nachweislich richtig
erkannter Kontakt. Übernommene Kontaktzeilen aus PDF-/Bild-OCR erhalten deshalb
exakte UTF-16-Spannen mit Seite und OCR-Zeile. Im Anonymisierungszweck bleibt die
Datei zunächst offen. Das bestehende private Prüffenster zeigt vor dem
Personen-/Unternehmensreview **Wurde dieser Kontaktwert richtig erkannt?** und
bietet **OCR-Wert unverändert bestätigen** oder **Kontaktwert korrigieren**.
Die Originaldatei bleibt unverändert. Das Prüffenster zeigt bei eindeutiger
Geometrie den tatsächlichen Rasterausschnitt neben Lesart und Korrektur; bei PDF
stammt dieser aus der lokal gerenderten Seite. Fehlt eine sichere Zuordnung oder
wird das Größenbudget überschritten, erscheint ein ausdrücklicher Hinweis auf
den Vergleich mit der Originaldatei, kein Ersatzbild. Die Oberfläche
erfindet keine richtige Schreibweise und lädt keine Referenzdaten nach.

Bei **Nur in Markdown umwandeln** bleibt diese Prüfung standardmäßig aus.
Das ausdrücklich gesetzte `ocr_contact_review: true` erlaubt Kontaktkorrektur
vor dem Export. Es ist nur für neue Standalone-v5-Markdown-Stapel gültig;
falscher Modus oder andere Werte werden abgewiesen. Opt-in und ein eigener
32-Byte-Seed gehören zur dauerhaften Zweckbindung. Der private Kontaktentwurf
trägt dann `processing_mode: markdown-only`; die normale Entitätsprüfung wird
nicht gestartet. Verschieben und Neustart bleiben möglich. Der Export enthält
Originalinhalte und markiert übrige OCR-Inhalte weiterhin als ungeprüft.

Eine vollständige Kontaktentscheidung wird vor Personenreservierung und
Anonymisierung auf den aktuellen Privacy-Eingang angewendet. Bestätigen ist
keine Beibehalten-/PII-Ausnahme: E-Mail und Telefon unterliegen danach erneut
den normalen Ersetzungen und der unabhängigen Restprüfung. Verschieben,
Schließen, ungültige Antwort oder überschrittene Grenzen veröffentlichen die
betroffene Datei nicht. Folgephasen werden im selben Prüffenster bearbeitet.

Diese zusätzliche Phase ist auf Standalone begrenzt. Coworks Formate,
Werkzeuge und externe Reviewadapter werden dadurch nicht erweitert. Der
transportneutrale Validator ist ein Core-Modul; der private Gatewaystore wird
nur vom ausdrücklich gesetzten Standalone-Hook benutzt.

- Maximal 400 Kontaktvorkommen pro Dokument, 256 Zeichen je Korrektur und
  höchstens 900 KiB für die vollständige Kontaktantwort. Das bestehende
  1-MiB-IPC-Framebudget und das separate 5.000-Entitätsbudget bleiben erhalten.
- Optionaler Bildvertrag `datasecure-ocr-contact-image/1`: genaue Rastergröße,
  Crop-Koordinaten/Dimensionen und kanonisches Base64 eines minimalen PNG.
  96 KiB/200.000 Pixel je Crop, 2 MiB/2.000.000 Pixel insgesamt; 4.096 × 256
  Pixel Maximaldimensionen. Ganze OCR-Fassung und eindeutige Zeile müssen zur
  Geometrie passen; Hybrid-Filterung oder doppelte Zeilen deaktivieren den Crop.
  Keine URL, externe Referenz, Bildexport, Diagnose oder dauerhafte Bildablage.
- Jede Kontaktstelle wird einzeln gebunden. Gleiche OCR-Schreibweisen können
  unterschiedliche Originalwerte darstellen; es gibt keine fuzzy oder
  dokumentübergreifend erratene Kontaktkorrektur.
- Vollständige Entscheidungen liegen atomar und fsync-/readback-geprüft als
  private `.ocrreview`-Arbeitsartefakte vor. HMAC bindet Lauf, Seed,
  Snapshot-Hash, vollständigen Extraktionstext, Policy-/Pseudonymvertrag und
  Kontaktspannen. v2 bindet zusätzlich Verarbeitungszweck und gegebenenfalls
  Bilddigest, nicht Bildbytes. Authentifizierte v1-Records bleiben ausschließlich
  für ihren bisherigen Anonymisierungszweck kompatibel. Geänderte Quelle,
  OCR-Fassung, v2-Bildausschnitt oder manipulierte Entscheidung
  erfordert einen neuen Lauf statt stiller Wiederverwendung.
- Rohwerte und Korrekturen gelangen weder in das Laufjournal noch in Diagnose,
  Support oder die Hauptansicht. Die Artefakte sind normale private lokale
  Arbeitsdateien, keine Verschlüsselungszusage; ihre temporäre Aufbewahrung
  entspricht den Arbeitsdaten, nicht der dauerhaft erhaltenen Identitäts-TXT.
- `OCR_CONTACT_REVIEW_INVALID` nennt in der privaten Oberfläche die betroffenen
  Dateien und einen festen nächsten Schritt, niemals ungeprüfte Exceptions.

Die exakte Warnung-/Spannenbindung, CR/LF-Zeilenpositionen, echte private IPC,
Abbruch/Neustart, Manipulation und Publikation sind E0-Regressionsfälle.
Die integrierte Zweidokumentprüfung verwendet einen kontrollierten
Konvertertranskript, nicht native GUI-Klicks. Reale Konverter/OCR und der
72-Varianten-Benchmark sind gesonderte Nachweise. Die rohe OCR-Fehlerrate bleibt
separat sichtbar; synthetische Referenzkorrekturen sind keine menschliche
Bedien- oder Qualitätsabnahme.

## Noch erforderliche menschliche Evidenz

- Windows und macOS: Fokus, Escape, Tastatur, Zoom, Screenreader und verständliche
  Aktionsbezeichnungen mit synthetischen Dokumenten beobachten.
- Fachfremde Nutzer müssen erkennen, dass klare Dateien intern bereits fertig
  sein können, der sichtbare Gesamtstapel aber erst nach den Entscheidungen zu
  den gelben Stellen bereitgestellt wird.
- IT-/Health-IT-Fachvertretung prüft unterschiedliche Zertifikats- und
  Organisationskontexte. Security prüft, dass kein Reviewinhalt die lokale Grenze
  verlässt.

## Bewusst nachgelagert

Eine zusammenhängende plattformübergreifende lokale HTML-Oberfläche, eine sichere
freie Auswahl im Sammelreview und nutzerdefinierte Regeln sind nur nach eigener
Story, Sicherheitsdesign und gemessenem UX-Nutzen zulässig. Die inhaltsfreie
Status-App bleibt davon getrennt; sie wird nicht zum Rohdatenreview erweitert.
