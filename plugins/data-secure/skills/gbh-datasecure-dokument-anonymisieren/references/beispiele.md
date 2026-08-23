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

Anfrage: „Entferne die Bilder aus dem Ergebnis, anonymisiere alle Dateien und fasse danach die Qualifikationen zusammen.“

Verwende `remove_images=false`: Das Ergebnis ist ohnehin Markdown ohne Bildpixel. Grafiken
bleiben lokal zurückgehalten; sicher erkannter Bildtext kann nach derselben Datenschutzprüfung
im Markdown bleiben. Lies danach alle freigegebenen Markdown-Dateien und fasse ausschließlich
deren fachliche Inhalte zusammen.

`remove_images=true` ist nur für den engeren Wunsch geeignet, die **lokalen** Bildanlagen selbst
zu verwerfen. Das kann bei unbekannten Office-Objekten sicher stoppen und lässt keinen Bildtext
in die Markdown-Ausgabe einfließen.
