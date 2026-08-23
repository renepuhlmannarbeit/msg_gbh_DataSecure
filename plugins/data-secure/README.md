# GBH DataSecure – Dokumente anonymisieren

Claude-Plugin zur lokalen De-Identifizierung und Datenschutzprüfung. Der beaufsichtigte Pilot verarbeitet ausschließlich TXT, Markdown (`.md`, `.markdown`), CSV und DOCX; PDF und alle weiteren Formate bleiben bis zum vollständigen Coverage-Nachweis sicher gesperrt.

Das Plugin verbindet:

- zwei klar getrennte Claude-Skills für Anonymisierung und Datenschutzerklärung,
- einen lokalen MCP-Server als technische Datenschutzgrenze und zur Dateiverarbeitung,
- ein sicher abbrechendes Ausgabemodell mit kurzlebiger, paketgebundener Leseberechtigung; Bildpixel bleiben im Pilot lokal.

## Ablauf für Anwender

1. Bitte Claude, den DataSecure-Eingangsordner zu öffnen. Kopiere eine oder mehrere Dateien in `Input` und bestätige anschließend im Chat, dass sie bereitliegen. Lade sensible Originale nicht als Chat-Anhang hoch.
2. Vor dem lokalen Snapshot bestätigt der Anwender Anzahl, Gesamtgröße, Formate und Bildstandard in einem nativen **Starten**/**Abbrechen**-Dialog. Danach bindet Claude die bestätigte Anzahl mit `begin_document_batch` an einen lokalen Snapshot. Fortschritt und Stopps verwaltet der Server. Änderungen am Input invalidieren den gestarteten Stapel nicht.
3. Der getrennte Ablauf hält weder Dateiauswahl noch einen kompletten Stapel in einem einzigen MCP-Aufruf offen und vermeidet dadurch das beobachtete Claude-Zeitlimit.
4. Claude verwendet ausschließlich Markdown, für das derselbe Lauf `package_id` und eine noch gültige `read_capability` zurückgegeben hat.
5. Alle Grafiken bleiben lokal unter `Needs Visual Review`. Dieser Engineering-Build besitzt keinen Freigabeweg für visuelle Inhalte; das Öffnen des Ordners macht sie für Claude nicht lesbar.
6. Ein Mehrdatei-Stapel zeigt nach der letzten Bestätigung lokal nur die drei Abschlusszähler. Die dauerhafte lokale Zuordnung liegt in `DataSecure-Export/DataSecure-Mapping.csv` und wird ausschließlich auf Wunsch geöffnet.

Der normale Input-Ablauf unterbricht die Analyse nicht mit einem Prüfdialog pro Datei.
Mehrdeutige Zertifikats-/Organisationsstellen werden gesammelt und erst auf
ausdrücklichen Auftrag in einem einzigen lokalen Sammelreview entschieden; bis dahin
bleiben die betroffenen Dateien gesperrt. Bildpixel bleiben immer lokal
zurückgehalten. Der Sammelreview ist Engineering-Gegenstand: Windows besitzt den
vollständigsten Pfad, Linux einen begrenzten Adapter; der aktuelle macOS-Dialog ist
wegen eines bekannten AppleScript-Aktionsfehlers nicht freigegeben.

Lade ein sensibles Original nicht direkt in Claude hoch und füge es nicht in den Chat ein, wenn Claude den Inhalt erst nach der Datenschutzverarbeitung sehen darf.

Dieses Plugin bietet keine Rechtsberatung, keine Garantie rechtlicher Anonymität und keine Zertifizierung nach DSGVO oder EU AI Act.

Die normale `.md` enthält nie Bildpixel. Deshalb bleibt bei „nur Markdown“ oder „Bilder nicht an Claude geben“ der Standard aktiv: Grafiken bleiben lokal und sicher erkannter Bildtext kann nach derselben Prüfung erhalten bleiben. Nur wenn lokale Bildanlagen selbst verworfen werden sollen, ist der strenge Modus vorgesehen; er übernimmt keinen Bildtext und stoppt bei unbekannten eingebetteten Objekten sicher.

Bei einem lokalen Abbruch zeigt `diagnostic_status` die letzte Verarbeitungsphase
und einen festen Fehlercode. Das Journal ist auf 14 Tage und 200 Ereignisse
begrenzt und enthält keine Dateinamen, Pfade, Inhalte, erkannten Werte,
Rohfehlermeldungen oder Dokument-Hashes. Fehlgeschlagene Dateien werden nicht
automatisch wiederholt; mehrere Versuche derselben Datei dürfen nicht als mehrere
Dateien dargestellt werden.
