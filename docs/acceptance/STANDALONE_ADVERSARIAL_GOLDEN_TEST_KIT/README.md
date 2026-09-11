# Adversarieller Golden-Härtetestkorpus

Der Generator `scripts/generate-adversarial-golden-corpus.mjs` erzeugt einen
deterministischen Testkorpus mit 16 vollständig synthetischen Dateien. Anders
als der breite 100-Dateien-Korpus konzentriert sich dieser Satz auf schwierige
Inhalte: lange Fließtexte, wiederholte Personen und Unternehmen, Unicode,
Markdown-Zitate und Links, mehrzeilige CSV-Felder, fragmentierte Office-Runs,
Kopf-/Fußzeilen, Kommentare, Formeln, ausgeblendete Tabellenblätter,
Präsentationsnotizen, mehrseitige Text-/Hybrid-/Scan-PDFs und dichte OCR-Bilder.

## Erzeugen

```powershell
npm run uat:adversarial-corpus
```

Dabei entstehen lokal und nicht versioniert:

- `dist/DataSecure-Haertetestkorpus-16-<Produktversion>/`
- `dist/DataSecure-Haertetestkorpus-16-<Produktversion>.zip`

In der App wird ausschließlich der Unterordner `EINGABEN` ausgewählt. Seine
Unterordnerstruktur muss vollständig erhalten bleiben. `ERWARTUNGEN.json`
enthält SHA-256-Prüfsummen, alle fiktiven Identifikatoren und fachliche Begriffe,
die bei der Anonymisierung erhalten bleiben müssen.

## Erwartete Ergebnisse

1. **Nur in Markdown umwandeln:** Alle 16 Quellen erzeugen Markdown. Die
   Originalinhalte bleiben erhalten, eine Zuordnungsdatei entsteht nicht.
2. **Umwandeln und anonymisieren:** Jeder im extrahierten Markdown enthaltene
   fiktive Identifikator wird ersetzt. Wiederholte Personen und Unternehmen
   erhalten stapelweit dieselbe Zuordnung.
3. **Lokale Prüfung:** `02-komplexes-markdown.md` enthält absichtlich einen
   unbeschrifteten, namenförmigen Satzanfang. Korrekt ist eine lokale
   Reviewentscheidung; eine stille Freigabe wäre ein Fehler.
4. **Quellabdeckung:** XLSX, PPTX, PDF, Scan-PDF und Bilder weisen die
   Extraktionsreichweite unabhängig vom Anonymisierungsstatus aus.
5. **DOCX-Policy:** Reine Konvertierung enthält Kopf und Fuß; der
   Anonymisierungspfad schließt beide aus und weist dies als Scope aus.
6. **Geöffnetes Office-Dokument:** Eine zusätzlich vorhandene
   `~$*.docx`-Besitzerdatei wird in der rekursiven Aufnahme übersprungen und
   inhaltsfrei gezählt. Die 16 echten Quellen bleiben vollständig aufgenommen.
7. **Neustart:** Ein alter fortsetzbarer Lauf erscheint nach App-Neustart nur
   im Verlauf. Die aktuelle Prozesskarte bleibt bereit; eine Fortsetzung wird
   aus der konkreten Verlaufszeile gestartet.

Für die sichtbare Office-Artefakt-UAT wird
`02-word/04-langer-bericht-mit-kopf-fuss-kommentar.docx` in Word geöffnet und
während der Auswahl des Ordners `EINGABEN` offengehalten. Die App muss weiterhin
genau 16 echte Quellen aufnehmen und zusätzlich eine übersprungene temporäre
Office-Datei melden. Nach dem Schließen von Word darf die Meldung entfallen.

Der automatisierte Test `tests/test-adversarial-golden-corpus.mjs` erzeugt den
Korpus zweimal bytegleich, prüft echte rekursive Aufnahme, Format-Admission,
die direkten Produktionsparser, PII-Engine, Residual-Gate und den lokalen
Reviewpfad. Zusätzlich führt `tests/test-standalone-conversion-worker.mjs`
Text-PDF, Scan-PDF und JPEG aus diesem Korpus durch den tatsächlich paketierten,
netzgesperrten Konvertierungsworker und anschließend durch das Privacy-Gate.
Beide ersetzen die sichtbare UAT von PDF-/OCR-Ergebnissen nicht.
