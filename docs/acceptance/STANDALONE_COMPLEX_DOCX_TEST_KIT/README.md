# Komplexer DOCX-Testkorpus

Stand: 07.09.2026 · DataSecure Standalone 3.2.0-rc117

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

## Test A – reine Markdown-Konvertierung

1. In der Standalone-App **Nur in Markdown umwandeln** wählen.
2. Den Ordner `inputs/` auswählen und prüfen, dass 15 Dateien angezeigt werden.
3. **Starten** wählen.
4. Erwartet werden 15 `.md`-Dateien mit unveränderten Basisnamen und ohne
   `DataSecure-Zuordnung.csv`.
5. Fiktive Namen und Unternehmen müssen im Markdown weiterhin enthalten sein.
   Die in der Solltabelle genannten Erhaltungsanker müssen auffindbar sein.

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

## Reproduzierbar neu erzeugen

Der Generator überschreibt vorhandene Eingaben nur mit explizitem Schalter:

```powershell
python scripts\generate-complex-docx-uat.py --replace
```

Die erzeugten DOCX-Archive werden mit sortierten Einträgen und festen
Zeitstempeln geschrieben, damit ein erneuter Lauf bytegleiche Dateien ergibt.
