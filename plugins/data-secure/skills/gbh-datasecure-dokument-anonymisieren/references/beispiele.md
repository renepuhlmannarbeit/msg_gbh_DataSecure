# Beispiele

## Vertrag analysieren

Anfrage: „Anonymisiere diese Verträge und vergleiche anschließend die Kündigungsfristen.“

Erkläre vor dem Start knapp: Zuerst erfolgt die lokale Verarbeitung; für den Vergleich
ist nach ihrem Abschluss ein neuer ausdrücklicher Auftrag nötig. Wähle intern `contract`
und starte genau einmal `start_document_batch_from_picker(mode=local_only)`.
Beim ersten Lauf lässt DataSecure einmalig einen dedizierten lokalen Ergebnisordner wählen; bei
späteren Läufen erscheint nur der Quellpicker. Antworte bei
`local_intake_accepted_checkpoint_pending` danach nur „Die lokale Übernahme wurde gestartet.
DataSecure bereitet den wiederaufnehmbaren Stapel vor und zeigt nach Abschluss den Ergebnisordner an. (DataSecure-Version:
<gateway_version aus der Antwort>)“ und beende die Aufgabe.
Der Erfolg bedeutet bestätigte Worker-Übergabe, nicht bereits abgeschlossene
Dokumentverarbeitung.
Kein Polling, kein Ergebnislesen und keine automatische Fortsetzung des Vergleichs.

Spätere Anfrage nach lokalem Abschluss: „Verwende jetzt die anonymisierten Ergebnisse
und vergleiche die Kündigungsfristen.“

Rufe `start_completed_local_results_handoff` auf und verwende für weitere Seiten nur
`continue_local_results_handoff`, solange weitere Seiten gemeldet werden. Vergleiche
ausschließlich die verifiziert übergebenen Markdown-Inhalte. Nenne Auslassungen und
behaupte bei einem Teilerfolg keine vollständige Prüfung aller Originale. Bleiben keine
freigegebenen Ergebnisse, führe keinen Vergleich aus und starte keine Diagnose automatisch.

## Gemischter Stapel

Anfrage: „Bereite den Ordner mit Vertrag, Ausschreibung und Mitarbeiterprofil für Claude vor.“

Verwende `auto` und `source_kind=folder`; verlange keine Einzelklassifizierung.
Der lokale Worker verarbeitet die Auswahl unabhängig vom Modell. Der Start beendet
die Cowork-Aufgabe. Erst eine später ausdrücklich gewünschte Auswertung verwendet
den tokenfreien Handoff; Kennungen und Leseberechtigungen bleiben im lokalen Server.

## Reine Textausgabe

Anfrage: „Entferne die Bilder aus dem Ergebnis, anonymisiere alle Dateien und fasse danach die Qualifikationen zusammen.“

Lasse den Bildstandard unverändert: Das Ergebnis ist ohnehin Markdown ohne Bildpixel.
Der normale Picker hat kein `remove_images`-Argument. Grafiken bleiben lokal zurückgehalten
und erscheinen im lokalen Abschlussdialog zur Sichtprüfung; ein Bild-Text-Pfad (OCR) ist im
Pilot noch kein Produktpfad. Wo er später freigegeben wird, gilt für erkannten Bildtext
dieselbe Datenschutzprüfung wie für Dokumenttext.
Erkläre vor dem Start den getrennten späteren Auswertungsauftrag. Nach dem Start kein Lesen;
erst nach lokalem Abschluss und neuem ausdrücklichem Auftrag die freigegebenen Ergebnisse
über den tokenfreien Handoff zusammenfassen.

Ein Wunsch, die **lokalen** Bildanlagen selbst zu verwerfen, ist enger und benötigt eine
gesonderte Klärung. Erfinde dafür kein Argument des Normalwerkzeugs und führe keine
Löschung aus; verweise für nicht verfügbare Optionen an den IT-Support.
