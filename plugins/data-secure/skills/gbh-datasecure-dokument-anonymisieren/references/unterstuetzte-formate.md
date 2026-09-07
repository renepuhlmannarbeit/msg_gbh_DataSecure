# Unterstützte Formate

Der beaufsichtigte Pilot verarbeitet ausschließlich UTF-8-TXT, Markdown (`.md` und `.markdown`), CSV und DOCX. PDF, XLSX, PPTX, PNG, JPEG und BMP bleiben gesperrt. Bereits die lokale Eingangsprüfung kann `SOURCE_FORMAT_NOT_RELEASED` oder bei widersprüchlichem beziehungsweise ungültigem Container `SOURCE_TYPE_MISMATCH` melden; spätere Coverage-Gates besitzen eigene feste Codes. Erkläre nur den tatsächlich gemeldeten Code und behaupte keine Unterstützung durch eine Umgehung. Eine Parserwarnung oder eine unvollständige OOXML-Relationship-Coverage stoppt sicher, statt eine möglicherweise unvollständige Fassung freizugeben.

Alle Grafiken bleiben im Pilot lokal unter `Needs Visual Review`; OCR allein kann Gesichter, Logos, Unterschriften oder QR-Codes nicht zuverlässig freigeben. Dieser Engineering-Build bietet bewusst keinen menschlichen Freigabeweg über Claude oder MCP.

Bis zu 200 Dateien mit zusammen höchstens 500 MiB werden im lokalen Mehrfach-Dateidialog ausgewählt. Wenn ausdrücklich ein Ordner gewünscht ist, prüft DataSecure ihn vorab vollständig und rekursiv, ohne Links, Junctions oder Reparse Points zu verfolgen; das lokale Mapping nennt einen relativen Unterordner nur, wenn gleiche Dateinamen sonst nicht unterscheidbar wären. Die Ordnerauswahl ist niemals ein stiller Formatfilter: Sobald eine reguläre Datei ein unbekanntes oder im Pilot gesperrtes Format besitzt, stoppt die gesamte Auswahl vor dem Anlegen des Stapels und meldet nur inhaltsfreie Zähler. Vor dem Hintergrundlauf gelten außerdem diese Einzelgrenzen: TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes, DOCX 64 MiB komprimiert und 128 MiB entpackt. Es gibt keine feste Seitenbegrenzung.

Mit **„Öffnen“** ist der Stapel bestätigt: `start_document_batch_from_picker` startet mit
`mode=local_only` den getrennten lokalen Ablauf mit privaten lokalen Arbeitskopien
ohne zusätzliche Verschlüsselung. Kein Schlüsselbund, Keyfile oder Passwort;
die Dateien sind mit passenden Dateirechten lesbar. Verschlüsselte Altbestände
bleiben unangetastet; zur Verarbeitung das Original erneut lokal auswählen.
Es gibt keinen zweiten Startdialog und keinen nötigen `Input`-Ordner. Claude beendet nach
der Annahmeantwort die Aufgabe, ohne Fortschritt zu pollen oder Ergebnisse zu lesen.
Vor dem dauerhaften Batchcheckpoint lautet der ehrliche Status nur, dass die lokale
Auswahl übernommen wurde und vorbereitet wird; ein Verarbeitungsstart wird zu diesem
Zeitpunkt nicht behauptet.
Dateiidentitäten, Hashes und technische Kennungen bleiben lokal. Erst eine später ausdrücklich
angeforderte Übergabe über `start_completed_local_results_handoff` und gegebenenfalls
`continue_local_results_handoff` liefert höchstens fünf verifizierte Markdown-Ergebnisse je
Seite und einmalig die Stapelzähler; keine Tokens, Paket-IDs, Cursor oder Leseberechtigungen.

Änderungen an den ausgewählten Originalen nach der Bestätigung verändern den gestarteten
Snapshot nicht. Fortschritt und Stopps verwaltet der Server; gestoppte Dateien werden nicht
automatisch wiederholt. Unter Windows steht die vollständigere Textprüfung im getrennten
lokalen Companion-Pfad zur Verfügung; macOS und Linux stoppen bei notwendigen
Mehrdeutigkeitsentscheidungen ebenso sicher. PDF darf weder per Dateiauswahl noch per
Chat-Upload umgangen werden.
