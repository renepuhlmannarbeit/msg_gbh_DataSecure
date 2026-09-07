# Standalone Testkorpus mit 100 Dateien

Der Generator `scripts/generate-standalone-format-corpus.mjs` erzeugt genau 100
vollständig synthetische Eingabedateien. Er deckt TXT, Markdown, CSV, DOCX,
XLSX, PPTX, Text-PDF, Scan-PDF, PNG, JPEG und BMP ab. Jede Kategorie enthält
mindestens ein kurzes, ein mittleres und ein großes Beispiel. Text-, Office- und
PDF-Beispiele enthalten teils Fließtext, teils Tabellen oder gegliederte Inhalte.

Die Testdaten enthalten erfundene Personen, Unternehmen, E-Mail-Adressen,
Telefonnummern, Anschriften, IBAN-ähnliche Werte und Zertifikate. Es dürfen keine
realen Daten in den Generator übernommen werden.

## Erzeugen

```powershell
npm run uat:format-corpus
```

Das Kommando verweigert das Überschreiben eines vorhandenen Ziels. Es erzeugt:

- `dist/DataSecure-Testkorpus-100-<Produktversion>/`
- `dist/DataSecure-Testkorpus-100-<Produktversion>.zip`
- `MANIFEST.csv` mit Dateityp, Größenklasse und vorgesehenem Testweg

## Testwege

**Nur in Markdown umwandeln:** Alle 100 Dateien dürfen gemeinsam ausgewählt
werden. Die Ergebnisse behalten ihre relative Unterordnerstruktur und ihren
Quellbasisnamen, tragen die Endung `.md` und erzeugen keine Zuordnungsdatei.

**Anonymisieren:** TXT, Markdown und CSV sind direkte positive Quellen. DOCX,
XLSX, PPTX, PDF, Scan-PDF und Bilder werden in demselben Lauf einmal nach
Markdown extrahiert und anschließend anonymisiert. Prüfe bei diesen Ergebnissen
beide getrennten Angaben: den Extraktionsstatus der Quelle und den
Anonymisierungsstatus des extrahierten Markdown-Inhalts. Leere OCR und unsichere
Quellen müssen stoppen. Die sichtbare Ergebnisstruktur muss den Eingabeordnern
entsprechen. Prüfe zwei getrennte Läufe: Der Standard erzeugt neutrale Namen wie
`Dokument-001-anonymisiert.md`; die ausdrücklich gewählte Alternative erhält den
Quellbasisnamen mit `-anonymisiert.md`. Jede Zeile der
`DataSecure-Zuordnung.csv` nennt den relativen Quellpfad und genau den im
jeweiligen Lauf tatsächlich erzeugten relativen Ergebnisweg.

Die drei Größenklassen prüfen schnelle Einzelfälle, mehrseitige beziehungsweise
mehrblättrige Beispiele und größere Stapel. Der Gesamtkorpus bleibt unter der
Produktgrenze von 200 Dateien und 500 MB. Die 100 Eingaben sind ein handhabbarer
formatbreiter UAT-Korpus, nicht die technische Obergrenze.
