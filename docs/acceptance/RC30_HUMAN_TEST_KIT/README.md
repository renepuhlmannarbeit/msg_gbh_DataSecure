# DataSecure RC30 – menschliches Abnahmepaket

Dieses Paket enthält ausschließlich künstliche Testdaten. Es ist für die noch
offenen Zielsystem-, Cowork-, Nutzungs- und Fachnachweise bestimmt – niemals für
echte Personal-, Kunden- oder Vertragsdaten.

## Einmal vorbereiten

1. Auf dem Testrechner eine **frische lokale Testumgebung** verwenden. Keine echten
   Dateien im DataSecure-Ordner; Cloud-Sync für den Testordner deaktiviert.
2. Das zu testende ZIP oder MCPB installieren, Claude vollständig beenden und neu
   starten.
3. In diesem Ordner `tools/generate_synthetic_acceptance_data.py` mit dem mitgelieferten
   Befehl aus `test-data/README.md` ausführen. Dadurch entstehen die vier
   Positivdokumente, ein mehrdeutiger Fall, die Stop-Gegenproben und ein 100-Dateien-
   Stapel. Der Generator braucht nur Python und erstellt keine Netzanfrage.
4. Den erzeugten Ordner `test-data/generated` **nicht** per Büroklammer in Claude
   anhängen. Über „Öffne den Privacy-Ordner“ die Dateien in `Input` kopieren.
5. Für jeden Test eine Zeile in `EVIDENCE_LOG_TEMPLATE.csv` anlegen. Nur Build-ID,
   Artefakt-Hash, OS-/Claude-Version, Test-ID, PASS/FAIL/BLOCKED und festen Fehlercode
   erfassen. Keine Rohtexte, Pfade, Dateinamen, Screenshots mit lesbarem Inhalt oder
   Hashes der Dokumente protokollieren.

## Reihenfolge: wenige Läufe, maximale Abdeckung

| Lauf | Führt zusammen aus | Daten | Ergebnis in einem Satz |
|---|---|---|---|
| A – Start & Host | H-01 bis H-04 | keine Originale | Nur Cowork mit diesem Local MCP darf den lokalen Ablauf starten. |
| B – Vier Formate | H-05 bis H-07 | `01-positive` | TXT, MD, CSV, DOCX werden lokal anonymisiert; Zertifikate/Rollen bleiben. |
| C – Bilder & Mehrdeutigkeit | H-08 bis H-09 | `02-review` | Bilder bleiben lokal; unklare Zertifikats-/Firmenzuordnung wird nicht geraten. |
| D – Fehler & Formatgrenze | H-10 bis H-12 | `03-blocked` | Gesperrte Formate, Parserfehler und unsicherer Speicher stoppen ohne Paket. |
| E – Stapel & Wiederaufnahme | H-13 bis H-15 | `04-batch-100` | Ein Stapel läuft fortsetzbar, ohne doppelte oder unvollständige Ergebnisse. |
| F – Ausgabe & Löschung | H-16 bis H-18 | Ergebnis aus B/E | Nur bereinigtes Markdown ist lesbar; Manipulation, Ablauf und Purge stoppen sicher. |
| G – Installation & Rollback | H-19 bis H-22 | B-D wiederholen | Frische Installation, Update und Rollback auf jeder Zielplattform. |
| H – Bedienbarkeit & Fachabnahme | H-23 bis H-26 | B-C | Menschen verstehen Start, Stop, Bildgrenze und Ergebnis ohne Technikkenntnis. |

Eine vollständige Story-zu-Test-Zuordnung steht in [TEST_CASES.md](TEST_CASES.md).
`BLOCKED` ist ein valides Testergebnis für bewusst noch gesperrte Formate, aber nie
ein PASS für eine Freigabe-Story.

## Gemeinsame Prüfkriterien für jeden erfolgreichen Positivlauf

Vergleiche lokal das erzeugte Markdown mit dem jeweiligen Testdokument:

- Personen, E-Mail, Telefon, IBAN und als Kunde/Arbeitgeber bezeichnete Organisationen
  sind nicht mehr lesbar.
- Rolle, Technologie, fachlicher Leistungsinhalt und der Zertifikatsname bleiben.
- Claude erhält weder das Original noch den Dateinamen oder einen lokalen Pfad.
- Der lokale Export enthält eine Mapping-Übersicht; diese wird nicht in den Chat gelesen.
- Bei einem Fehler gibt es kein Teilpaket; das Original bleibt lokal.

## Stop-Regeln

Sofort abbrechen und als **FAIL** dokumentieren, wenn ein Originalinhalt im Chat,
in einer Toolantwort oder in einem öffentlichen Log erscheint, wenn ein Paket trotz
Residual- oder Coverage-Fehler freigegeben wird, oder wenn eine zurückgehaltene
Grafik über Claude zugänglich wird. Kein erneuter Versuch mit echten Daten.

## Was nach dem Test an DataSecure geht

Nur die Zeile aus dem Evidence-Log und ein fester Fehlercode. Die Testdaten dürfen
nicht in Incident-Tickets, Chats oder Screenshots wiederholt werden.
