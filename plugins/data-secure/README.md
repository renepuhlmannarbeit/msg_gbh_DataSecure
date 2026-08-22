# GBH DataSecure – Dokumente anonymisieren

Claude-Plugin zur lokalen Anonymisierung und Datenschutzprüfung von DOCX-, XLSX-, PPTX-, Text- sowie eigenständigen PNG-, JPEG- und BMP-Dateien. PDF bleibt in RC28 bis zum vollständigen nativen Coverage-Nachweis sicher gesperrt.

Das Plugin verbindet:

- zwei klar getrennte Claude-Skills für Anonymisierung und Datenschutzerklärung,
- einen lokalen MCP-Server als technische Datenschutzgrenze und zur Dateiverarbeitung,
- ein sicher abbrechendes Ausgabemodell: Claude liest nur freigegebenes Markdown und freigegebene PNG-Dateien.

## Ablauf für Anwender

1. Bitte Claude, den DataSecure-Eingangsordner zu öffnen. Kopiere eine oder mehrere Dateien in `Input` und bestätige anschließend im Chat, dass sie bereitliegen. Lade sensible Originale nicht als Chat-Anhang hoch.
2. Claude prüft die Anzahl erneut und verarbeitet danach genau diese bestätigte Zahl mit einem kurzen Aufruf pro Datei. Bereits gestoppte Dateien werden im selben Lauf übersprungen statt wiederholt. Für gemischte Dokumentarten genügt `auto`; nur reine Bilder brauchen ein ausdrückliches Profil. PDF erzeugt bewusst kein Paket.
3. Der getrennte Ablauf hält weder Dateiauswahl noch einen kompletten Stapel in einem einzigen MCP-Aufruf offen und vermeidet dadurch das beobachtete Claude-Zeitlimit.
4. Claude verwendet ausschließlich freigegebenes Markdown und freigegebene PNG-Dateien.
5. Nicht automatisch verifizierbare Grafiken bleiben lokal unter `Needs Visual Review`. Dieser Engineering-Build besitzt keinen menschlichen Freigabeweg für visuelle Inhalte; das Öffnen des Ordners macht sie für Claude nicht lesbar.

Der normale Input-Ablauf öffnet auf keiner Plattform einen zusätzlichen Textprüfdialog. Mehrdeutigkeiten stoppen die betroffene Datei sicher; Bilder werden nach Profil und Sicherheitslage entfernt, automatisch verifiziert oder lokal zurückgehalten. Eine getrennte Windows-Companion-Prüfoberfläche bleibt Engineering-Gegenstand und ist nicht Teil dieses einfachen Standardablaufs.

Lade ein sensibles Original nicht direkt in Claude hoch und füge es nicht in den Chat ein, wenn Claude den Inhalt erst nach der Datenschutzverarbeitung sehen darf.

Dieses Plugin bietet keine Rechtsberatung, keine Garantie rechtlicher Anonymität und keine Zertifizierung nach DSGVO oder EU AI Act.

Wenn ausschließlich der Text benötigt wird, können bekannte Bildanlagen texttragender Office-Dateien nach ausdrücklicher Zustimmung entfernt werden. Die erzeugte `.md` kennzeichnet jede entfernte Grafik. Reine Bilder, Scans und unbekannte eingebettete Objekte werden dadurch nicht an den Sicherheitsprüfungen vorbeigeschleust.

Bei einem lokalen Abbruch zeigt `diagnostic_status` die letzte Verarbeitungsphase
und einen festen Fehlercode. Das Journal ist auf 14 Tage und 200 Ereignisse
begrenzt und enthält keine Dateinamen, Pfade, Inhalte, erkannten Werte,
Rohfehlermeldungen oder Dokument-Hashes. Fehlgeschlagene Dateien werden nicht
automatisch wiederholt; mehrere Versuche derselben Datei dürfen nicht als mehrere
Dateien dargestellt werden.
