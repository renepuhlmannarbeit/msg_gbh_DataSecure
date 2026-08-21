# GBH DataSecure – Dokumente anonymisieren

Claude-Plugin zur lokalen Anonymisierung und Datenschutzprüfung von DOCX-, XLSX-, PPTX-, Text- sowie eigenständigen PNG-, JPEG- und BMP-Dateien. PDF bleibt in RC20 bis zum vollständigen nativen Coverage-Nachweis sicher gesperrt.

Das Plugin verbindet:

- zwei klar getrennte Claude-Skills für Anonymisierung und Datenschutzerklärung,
- einen lokalen MCP-Server als technische Datenschutzgrenze und zur Dateiverarbeitung,
- ein sicher abbrechendes Ausgabemodell: Claude liest nur freigegebenes Markdown und freigegebene PNG-Dateien.

## Ablauf für Anwender

1. Bitte Claude bei TXT oder DOCX, ein lokales Dokument vorzubereiten. DataSecure öffnet einen lokalen Dateidialog und unter Windows anschließend eine auf zusätzliche Schwärzungen begrenzte Prüfung.
2. Bitte Claude bei XLSX, PPTX, MD, CSV, Bildern oder mehreren formatgemischten Dateien, den Datenschutzordner zu öffnen, und kopiere die Quelldateien nach `Input`. PDF erzeugt derzeit bewusst kein Paket.
3. Bitte Claude, das nächste Dokument oder alle Dokumente zu anonymisieren. Der Stapellauf verarbeitet bis zu 25 Dateien nacheinander und erstellt pro erfolgreich freigegebener Datei ein eigenes Markdown-Paket. Für gemischte Dokumentarten genügt `auto`; nur reine Bilder brauchen ein ausdrückliches Profil.
4. Claude verwendet ausschließlich freigegebenes Markdown und freigegebene PNG-Dateien.
5. Nicht automatisch verifizierbare Grafiken bleiben lokal unter `Needs Visual Review`. Dieser Engineering-Build besitzt keinen menschlichen Freigabeweg für visuelle Inhalte; das Öffnen des Ordners macht sie für Claude nicht lesbar.

Die Windows-Textprüfung kann zusätzliche Ersetzungen mit `[MANUAL_REDACTION]` hinzufügen, den fachlichen Inhalt aber nicht frei bearbeiten. Das Überspringen der optionalen Prüfung umgeht weder technische Abdeckungsprüfungen noch Kontrollen auf verbliebene personenbezogene Daten oder visuelle Inhalte.

Lade ein sensibles Original nicht direkt in Claude hoch und füge es nicht in den Chat ein, wenn Claude den Inhalt erst nach der Datenschutzverarbeitung sehen darf.

Dieses Plugin bietet keine Rechtsberatung, keine Garantie rechtlicher Anonymität und keine Zertifizierung nach DSGVO oder EU AI Act.

Wenn ausschließlich der Text benötigt wird, können bekannte Bildanlagen texttragender Office-Dateien nach ausdrücklicher Zustimmung entfernt werden. Die erzeugte `.md` kennzeichnet jede entfernte Grafik. Reine Bilder, Scans und unbekannte eingebettete Objekte werden dadurch nicht an den Sicherheitsprüfungen vorbeigeschleust.

Bei einem lokalen Abbruch zeigt `diagnostic_status` die letzte Verarbeitungsphase
und einen festen Fehlercode. Das Journal ist auf 14 Tage und 200 Ereignisse
begrenzt und enthält keine Dateinamen, Pfade, Inhalte, erkannten Werte,
Rohfehlermeldungen oder Dokument-Hashes. Fehlgeschlagene Dateien werden nicht
automatisch wiederholt; mehrere Versuche derselben Datei dürfen nicht als mehrere
Dateien dargestellt werden.
