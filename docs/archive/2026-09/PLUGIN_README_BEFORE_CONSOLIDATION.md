# GBH DataSecure – Dokumente anonymisieren

Claude-Plugin zur lokalen De-Identifizierung und Datenschutzprüfung. Der beaufsichtigte Pilot verarbeitet ausschließlich TXT, Markdown (`.md`, `.markdown`), CSV und DOCX; PDF und alle weiteren Formate bleiben bis zum vollständigen Coverage-Nachweis sicher gesperrt.

Das Plugin verbindet:

- zwei klar getrennte Claude-Skills für Anonymisierung und Datenschutzerklärung,
- einen lokalen MCP-Server als technische Datenschutzgrenze und zur Dateiverarbeitung,
- ein sicher abbrechendes Ausgabemodell mit kurzlebiger, paketgebundener Leseberechtigung; Bildpixel bleiben im Pilot lokal.

## Ablauf für Anwender

1. Schreibe in einer neuen Claude-Cowork-Unterhaltung: **„Dateien anonymisieren“**. Lade sensible Originale nicht als Chat-Anhang hoch.
2. Der lokale Mehrfach-Dateidialog öffnet sich. Wähle eine oder mehrere Dateien und klicke **„Öffnen“**. Das ist die einzige Normalbestätigung; Anzahl, Größe, Formate und Bildstandard werden lokal geprüft.
3. Der getrennte lokale Ablauf liest die Auswahl nur lesend, erstellt eine private Arbeitskopie und verarbeitet den Stapel automatisch. Die Quelle bleibt unverändert; nur die von DataSecure selbst erzeugte Arbeitskopie wird nach Abschluss oder Ablauf der Frist bereinigt.
4. Nach dem Start endet Claudes Antwort: Markdown, Mapping und Nachweis bleiben lokal. Bitte erst nach dem lokalen Abschluss ausdrücklich um die Auswertung; dann kann Claude begrenzt anonymisierte Ergebnisse übernehmen. Auch bei einem kombinierten Startwunsch ist dieser spätere Auftrag erforderlich; der Start pollt oder liest nicht automatisch.
5. Alle Grafiken bleiben lokal unter `Needs Visual Review`. Dieser Engineering-Build besitzt keinen Freigabeweg für visuelle Inhalte; das Öffnen des Ordners macht sie für Claude nicht lesbar.
6. Ein Mehrdatei-Stapel zeigt nach dem lokalen Abschluss nur die drei Abschlusszähler. Die dauerhafte lokale Zuordnung liegt in `DataSecure-Export/DataSecure-Mapping.csv` und wird ausschließlich auf Wunsch geöffnet.

Der normale Direktauswahl-Ablauf unterbricht die Analyse nicht mit einem Prüfdialog pro Datei.
Mehrdeutige Zertifikats-/Organisationsstellen werden gesammelt und erst auf
ausdrücklichen Auftrag in einem einzigen lokalen Sammelreview entschieden; bis dahin
bleiben die betroffenen Dateien gesperrt. Bildpixel bleiben immer lokal
zurückgehalten. Der Sammelreview ist Engineering-Gegenstand: Windows besitzt den
vollständigsten Pfad, Linux einen begrenzten Adapter; der aktuelle macOS-Dialog ist
wegen eines bekannten AppleScript-Aktionsfehlers nicht freigegeben.

Lade ein sensibles Original nicht direkt in Claude hoch und füge es nicht in den Chat ein, wenn Claude den Inhalt erst nach der Datenschutzverarbeitung sehen darf.

Dieses Plugin bietet keine Rechtsberatung, keine Garantie rechtlicher Anonymität und keine Zertifizierung nach DSGVO oder EU AI Act.

## Lokalen Privacy-Ordner konfigurieren

Der Standard ist der nicht synchronisierte lokale DataSecure-App-Datenbereich.
In der Plugin-ZIP kann der Anwender im Chat ausdrücklich „Privacy-Ordner ändern“
anfordern; DataSecure zeigt dann einen lokalen Ordnerdialog und speichert die Wahl
ohne den Pfad an Claude zurückzugeben. `EU_PRIVACY_ROOT` bleibt für IT-verwaltete
Verteilungen möglich.
Leer lassen bedeutet: sicherer Standardordner. Die Änderung gilt erst nach einem Claude-Neustart und nie für einen
bereits gestarteten Stapel.

Vor der ersten Verarbeitung prüft DataSecure den gewählten Ordner ohne den Pfad an
Claude zu übermitteln. OneDrive, iCloud Drive, Dropbox, Google Drive, Netzwerkpfade
und Symlinks/Junctions werden mit `UNSAFE_STORAGE_LOCATION` gesperrt. Dann einen
anderen **lokalen** Ordner wählen; nicht durch einen allgemeinen Datei-Connector,
Cloud-Synchronisation oder Chat-Upload umgehen.

Die normale `.md` enthält nie Bildpixel. Deshalb bleibt bei „nur Markdown“ oder „Bilder nicht an Claude geben“ der Standard aktiv: Grafiken bleiben lokal und sicher erkannter Bildtext kann nach derselben Prüfung erhalten bleiben. Nur wenn lokale Bildanlagen selbst verworfen werden sollen, ist der strenge Modus vorgesehen; er übernimmt keinen Bildtext und stoppt bei unbekannten eingebetteten Objekten sicher.

Bei einem lokalen Abbruch nicht automatisch erneut starten. Melde nur den festen
Fehlercode an den IT-Support, keine Dateien oder internen Kennungen.
`diagnostic_status` ist ausschließlich im vorübergehend aktivierten IT-Supportmodus
verfügbar, nicht im normalen Cowork-Ablauf. Es zeigt die letzte Verarbeitungsphase,
eine getrennte inhaltsfreie Ablaufspur von Picker bis Abschlussanzeige und einen
festen Fehlercode. Das Verarbeitungsjournal ist auf 14 Tage und 200 Ereignisse
begrenzt und enthält keine Dateinamen, Pfade, Inhalte, erkannten Werte,
Rohfehlermeldungen oder Dokument-Hashes. Fehlgeschlagene Dateien werden nicht
automatisch wiederholt; mehrere Versuche derselben Datei dürfen nicht als mehrere
Dateien dargestellt werden.
