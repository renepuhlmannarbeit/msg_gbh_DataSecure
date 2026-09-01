# Pilot- und UAT-Abnahme

Stand: 01.09.2026 · aktueller Produktvertrag

Diese Datei ist der Abnahmeindex, keine konkurrierende zweite Testanleitung. Die
Durchführung steht ausschließlich im
[aktuellen UAT-Testpaket](acceptance/UAT_TEST_KIT/README.md).

## Vorbedingungen

- aktuelles Plugin-ZIP oder derselbe private Marketplace-Build;
- ausschließlich synthetische Testdaten;
- dokumentierte Plugin-, Claude- und Betriebssystemversion;
- keine Produktivdaten und kein Chat-Upload;
- Windows/macOS-Zielsystem mit aktiver lokaler Plugin-MCP-Brücke.

## Freigabeblöcke

| Block | Erforderlich |
|---|---|
| Produktkanal | ZIP und Marketplace jeweils frisch installieren; kein anderer Anwenderweg |
| Kernformate | TXT, Markdown, CSV und DOCX positiv |
| Stopps | XLSX, PPTX, PDF, Scan-PDF, Bilder, beschädigte und verschlüsselte Dateien sicher negativ |
| Datenschutz | keine Originalinhalte/-namen/-pfade/Token im Chat; Quellen bytegleich |
| Bilder | Pixel bleiben lokal; kein auswählbarer Modus; nie aus Originalen löschen |
| Retention | 0–14 Tage nur temporär; Quellen/Originale und fertige Exporte nie automatisch löschen |
| Recovery | Unterbrechung/Fortsetzung ohne Neuauswahl oder Duplikate |
| UX/A11y | Klartext, eine nächste Aktion, Tastatur, Fokus, Zoom, Screenreader |
| Performance | 100 Dateien und bis zu 500 MiB auf Referenzhardware |
| Governance | IT/Health-IT, Datenschutz, Security und Architektur bestätigen ihren Bereich |

## Entscheidung

- **GO Pilot:** alle P0-Blöcke PASS, keine offenen P0/P1-Defects, Zielsysteme und
  Verantwortliche benannt.
- **BLOCKED:** Test konnte wegen Host, Installation oder fehlender Rolle nicht
  durchgeführt werden; kein Ersatz durch lokale E0-Tests.
- **NO-GO:** Originalschutz, Datenbegrenzung, Formatstopp oder Ergebnisintegrität
  verletzt.

Technische Codes und UAT-IDs werden nie allein berichtet. Beispiel:
„UAT-04 – Gesperrte und beschädigte Dateien stoppen sicher; IT-Detail:
`SOURCE_FORMAT_NOT_RELEASED`.“

Die frühere RC57-Checkliste ist unter
[`docs/archive`](archive/2026-08/acceptance/PILOT-ABNAHME_RC57.md) erhalten.
