# Komplexer DOCX-Testkorpus

Stand: 10.09.2026 · vorbereitet für den nächsten Kandidaten nach 3.2.0-rc133

Dieser Korpus enthält 15 vollständig fiktive Word-Dokumente für die beiden
Standalone-Funktionen **Nur in Markdown umwandeln** und **In Markdown umwandeln
und anonymisieren**. Die Dateien kombinieren mehrseitigen Fließtext, Tabellen,
Listen, Kopf- und Fußzeilen, Grafiken und Abschnittswechsel. Eine Datei enthält
zusätzlich harmlose interne Microsoft-Klassifizierungsmetadaten.

Es gibt neun Dokumente mit erfundenen Personen-, Unternehmens-, Kontakt-,
Adress- und Kontodaten sowie sechs neutrale Kontrollfälle. In jedem Dokument
stehen Fachbegriffe, die nicht anonymisiert werden dürfen. Mehrere Dokumente
verwenden absichtlich dieselbe fiktive Person **Laura Stein** und dasselbe
fiktive Unternehmen **Nordlicht Digital GmbH**, um die stapelweit konsistente
Pseudonymisierung zu prüfen.

Alle Sollwerte stehen in [EXPECTED_RESULTS.csv](EXPECTED_RESULTS.csv). Die
Eingaben selbst liegen ausschließlich unter `inputs/`, damit dieser Ordner als
ein Stapel gewählt werden kann. Die Dokumente sind reine Testdaten und dürfen
frei kopiert, gelöscht und erneut erzeugt werden. Sie enthalten keine Angaben
realer Personen oder Unternehmen.

Der Kopf-/Fußzeilenvertrag DS-098 liegt nach dem gebundenen RC133. Die hier
beschriebene Anonymisierungsprüfung darf deshalb nicht rückwirkend als RC133-
Evidence gewertet werden, sondern erst für einen daraus neu gebauten Kandidaten.

## Test A – reine Markdown-Konvertierung

1. In der Standalone-App **Nur in Markdown umwandeln** wählen.
2. Den Ordner `inputs/` auswählen und prüfen, dass 15 Dateien angezeigt werden.
3. **Starten** wählen.
4. Erwartet werden 15 `.md`-Dateien mit unveränderten Basisnamen und ohne
   `DataSecure-Zuordnung.csv`.
5. Fiktive Namen und Unternehmen müssen im Markdown weiterhin enthalten sein.
   Die in der Solltabelle genannten Erhaltungsanker müssen auffindbar sein.
6. Kopf- und Fußzeilen der DOCX müssen in diesem inhaltserhaltenden Modus im
   Markdown vorhanden sein.

## Test B – Anonymisierung

1. Einen neuen Stapel vorbereiten und **In Markdown umwandeln und
   anonymisieren** wählen.
2. Wieder den vollständigen Ordner `inputs/` auswählen und starten.
3. Erwartet werden 15 anonymisierte `.md`-Ergebnisse plus eine
   `DataSecure-Zuordnung.csv`.
4. In den neun PII-Szenarien dürfen die in der Solltabelle genannten fiktiven
   Identifikatoren nicht mehr offen vorkommen. Die Erhaltungsanker bleiben.
5. In den sechs neutralen Kontrollfällen bleibt der fachliche Inhalt erhalten;
   es dürfen keine willkürlichen Personen- oder Unternehmenspseudonyme
   entstehen.
6. Die fünf Dokumente der Stapelgruppe `Laura-Stein-Nordlicht` müssen für Laura
   Stein und Nordlicht Digital GmbH jeweils dieselben Pseudonyme verwenden.
7. Kopf- und Fußzeilen dürfen in keinem anonymisierten Markdown vorkommen.
   Dokumenthauptteil, Fuß-/Endnoten und Kommentare bleiben, sofern im Szenario
   vorhanden, enthalten.

## Reproduzierbar neu erzeugen

Der Generator erneuert ausschließlich den fest gebundenen, ignorierten
`inputs`-Ordner des Testkits:

```powershell
npm run uat:complex-docx
```

Der frühere Python-Generator wurde durch diesen plattformneutralen Node-Generator
ersetzt. Er benötigt nur die ohnehin für Entwicklung und Tests verwendete
Node-Laufzeit. Die 15 DOCX-Dateien werden deterministisch erzeugt und bleiben
wie alle Dokumentnutzdaten bewusst unversioniert.

Die erzeugten DOCX-Archive werden mit sortierten Einträgen und festen
Zeitstempeln geschrieben, damit ein erneuter Lauf bytegleiche Dateien ergibt.
