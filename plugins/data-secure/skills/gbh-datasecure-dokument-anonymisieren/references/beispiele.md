# Beispiele

## Vertrag analysieren

Anfrage: „Anonymisiere diese Verträge und vergleiche anschließend die Kündigungsfristen.“

Wähle intern `contract`, verarbeite die lokal ausgewählten Dateien, lies alle im aktuellen
Lauf freigegebenen Markdown-Pakete vollständig und vergleiche erst danach die Fristen.

## Gemischter Stapel

Anfrage: „Bereite den Ordner mit Vertrag, Ausschreibung und Mitarbeiterprofil für Claude vor.“

Verwende `auto`; verlange keine Einzelklassifizierung. Jede Datei wird unabhängig behandelt.
Erkläre einen Teilerfolg anhand der Zähler und verwende nur die Paket-IDs dieses Laufs.

## Reine Textausgabe

Anfrage: „Entferne die Bilder, anonymisiere alle Dateien und fasse danach die Qualifikationen zusammen.“

Die ausdrückliche Bildentfernung erlaubt `remove_images=true`. Lies danach alle freigegebenen
Markdown-Dateien und fasse ausschließlich deren fachliche Inhalte zusammen.

Ohne eine solche Zustimmung bleibt `remove_images=false`.
