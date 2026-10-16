# RC161-Windows: drei lokale Markdown-Läufe vom 16.10.2026

Read-only-Nachprüfung der drei zuletzt angelegten, abgeschlossenen Läufe mit
demselben synthetischen Satz aus 133 Eingaben. Geprüft wurden gespeicherte
Stapeljournale, Exportbelege, historisch gebundene Laufordner und **jede**
exportierte Markdown-Datei gegen die im Beleg gespeicherte Bytelänge und
SHA-256. Es wurden keine Nutzerdateien verändert oder neu verarbeitet.

| Startzeit | Modus | Journal | Exportbeleg und Dateien |
| --- | --- | --- | --- |
| 08:00 | Ohne OCR | 116 freigegeben, 17 gestoppt | vollständig; 116/116 Dateien mit Beleggröße und SHA-256 identisch |
| 08:16 | OCR, ohne zusätzliche Kontaktprüfung | 133 freigegeben, 0 gestoppt | vollständig; 133/133 Dateien mit Beleggröße und SHA-256 identisch |
| 08:21 | OCR und zusätzliche Kontaktprüfung | 133 freigegeben, 0 gestoppt | vollständig; 133/133 Dateien mit Beleggröße und SHA-256 identisch |

Die 17 Auslassungen ohne OCR sind genau 13 `IMAGE_OCR_REQUIRED` und vier
`PDF_TEXT_UNAVAILABLE_BY_POLICY`: Folgen der gewählten Einstellung, keine
technischen Laufzeitfehler. Der mittlere Exportbeleg nennt für 18 Dateien
`OCR_CONTACT_VALUES_UNVERIFIED`; der letzte nach abgeschlossener
Kontaktprüfung nicht mehr. In den drei gebundenen Ordnern fehlen keine
gelisteten Dateien; es gibt keine zusätzlichen Markdown-Dateien, keine
Link-/Reparse-Einträge und keine Hash-Abweichung.

Diese Prüfung belegt technische Vollständigkeit und Integrität der sichtbaren
Exporte, **nicht** die Richtigkeit jedes OCR-Zeichens oder vollständige
Textextraktion. Im letzten Beleg bleiben Inhaltswarnungen, u. a.
`OCR_NOT_VERIFIED` (28), `SOURCE_COVERAGE_UNVERIFIED` (39) und
`VISUAL_CONTENT_NOT_EXTRACTED` (32). Diese müssen bei Bedarf fachlich mit
den Originalen verglichen werden. Eine native macOS-Abnahme ist daraus nicht
ableitbar.
