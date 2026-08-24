# DataSecure RC30 – menschliches Abnahmepaket

Dieses Paket verwendet ausschließlich künstliche Daten. Es trennt die einfache
Cowork-Nutzerreise von technischen Grenz- und Sicherheitsnachweisen. Echte Dateien
gehören weder in den Test noch per Büroklammer in Claude.

## Der Normaltest: eine DataSecure-Entscheidung

1. Neue Cowork-Unterhaltung öffnen und **„Dateien anonymisieren“** schreiben.
2. Im nativen lokalen Mehrfachdialog die synthetischen Dateien wählen und einmal
   **Öffnen** klicken.
3. Nach Abschluss den lokalen Export öffnen und Markdown sowie
   `DataSecure-Mapping.csv` prüfen.

Das ist der vollständige Normalweg. DataSecure verlangt genau **eine fachliche
Entscheidung**: Dateien wählen und **Öffnen** klicken. Er enthält keine Profil-,
Bild-, Größen-, Start-, Einzeldatei-, Status-, Ergebnislese- oder Ack-Abfrage.
Cowork kann eigene Toolberechtigungen anzeigen; das ist Host-Verhalten und wird
separat gezählt, nicht als DataSecure-Nutzerdialog akzeptiert.

## Vorbereitung

1. Frisches lokales Testkonto verwenden; Cloud-Synchronisation für den Testordner
   deaktivieren. Keine echten DataSecure-Dateien oder Altbestände verwenden.
2. Das zu prüfende Plugin-ZIP oder Marketplace-Artefakt installieren und Claude
   vollständig neu starten.
3. Mit `tools/generate_synthetic_acceptance_data.py` die Testdaten erzeugen. Der
   Generator arbeitet lokal und ohne Netzverbindung.
4. Pro Lauf eine Zeile in `EVIDENCE_LOG_TEMPLATE.csv` erfassen. Zulässig sind
   Build-Commit, Artefakt-SHA-256, Betriebssystem-/Claude-Version, Test-ID,
   Größenklasse, cold/warm, Dauer in Sekunden, Zähler, PASS/FAIL/BLOCKED und fester
   Fehlercode. Nicht zulässig sind Namen, Pfade, Inhalte, Dokumenthashes, Tokens
   oder Screenshots mit lesbarem Dokument.

## Kompakte Reihenfolge

| Lauf | Zustand und Daten | Prüft |
|---|---|---|
| M-01 | cold, 1 synthetische TXT | Ein Picker, kein Original im Chat, Ergebnis auffindbar. |
| M-02 | warm, 10 gemischte TXT/Markdown/CSV/DOCX | Ein lokaler Batch, konsistente Ergebnisse und Stopps. |
| M-03 | warm, 100 synthetische Dateien, höchstens 500 MB | Jede Position genau einmal terminal; Mapping/Zähler stimmen. |
| M-04 | warm, 10 Dateien; gezielter Abbruch | Kein Ersatzpicker, keine Doppelpakete, klare lokale nächste Aktion. |
| M-05 | cold nach Neustart, M-04 fortsetzen | Nur ausdrückliche Wiederaufnahme oder sicherer Stopp. |
| M-06 | 1 Bild-DOCX und 1 mehrdeutiger Fall | Pixel bleiben lokal; keine geratenen Zertifikats-/Organisationstreffer. |

`cold` bedeutet: Claude beenden, lokale DataSecure-Prozesse auslaufen lassen und
eine neue Sitzung öffnen. `warm` bedeutet: gleicher installierter Build ohne
Rechnerneustart. Der separate 500-MB-Grenztest in
[`tests/manual/batch-500mb-acceptance.js`](../../../tests/manual/batch-500mb-acceptance.js)
ist kein UX-Test und bleibt getrennt.

Die detaillierten Fälle stehen in [TEST_CASES.md](TEST_CASES.md). `BLOCKED` ist für
bewusst gesperrte Formate, Visuals oder Hostgrenzen zulässig, aber niemals ein PASS
für eine Freigabe-Story.

## Passkriterien des Normalwegs

- Höchstens drei bewusste Handlungen bis zum lokalen Ergebnis.
- Genau ein nativer Dateidialog; keine zusätzliche DataSecure-Bestätigung.
- Original, Dateiname und Pfad erscheinen weder im Chat noch in Toolantworten.
- Die lokale Zuordnung `DataSecure-Mapping.csv` ist auffindbar und wird nicht in den
  Chat gelesen.
- Bei einem Stopp ist klar: nichts freigegeben; welche lokale Aktion als Nächstes
  möglich ist.

Windows Cowork Desktop ist der aktuelle Zielhost. macOS Cowork Desktop (Intel und
Apple Silicon) bleibt bis zum Abschluss von BL-012.8 **BLOCKED**, weil der lokale
AppleScript-Reviewdialog noch einen bekannten Aktionsfehler hat; erst danach wird
M-01 bis M-06 dort wiederholt. Linux wird nur als ausdrücklich unterstützter
Claude-Code-Host geprüft; es wird keine Claude-Desktop-Unterstützung behauptet.
