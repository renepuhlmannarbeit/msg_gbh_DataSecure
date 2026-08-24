# Schritt-für-Schritt-Abnahme

Diese Fälle sind die aktuelle Abnahmequelle für Cowork. Sie testen den direkten
lokalen Mehrfachdialog und `local_only` – nicht den früheren Input-Ordner- oder
manuellen Batch-Token-Ablauf.

## Für jeden Lauf

1. Ausschließlich den synthetischen Korpus verwenden.
2. In einer neuen Cowork-Unterhaltung **„Dateien anonymisieren“** schreiben oder
   den sichtbaren DataSecure-Skill wählen.
3. Nur im nativen lokalen Mehrfachdialog Dateien auswählen und **Öffnen** klicken;
   nie per Büroklammer hochladen.
4. Nur die erlaubten, inhaltsfreien Werte im Evidence-Log erfassen.

Ein Originalinhalt, ein Name oder ein Pfad im Chat bzw. in einer Toolantwort ist ein
sofortiger FAIL. Ein BLOCKED wegen Format-, Visual- oder Hostgrenze ist keine
Freigabe.

## M-01 – Kalter Kernlauf

1. Claude vollständig beenden; lokale DataSecure-Prozesse auslaufen lassen.
2. Neue Cowork-Unterhaltung starten und eine synthetische TXT wählen.
3. Nach Abschluss den lokalen Export öffnen.

PASS: genau ein Picker und genau eine DataSecure-Entscheidung, anonymisiertes Markdown
und lokales `DataSecure-Mapping.csv` auffindbar, kein Original im Chat.

Deckt ab: BL-010.1, BL-010.7, BL-012.7, BL-041.6, BL-041.7, BL-052.1.

## M-02 – Warmer Formatstapel

1. Ohne Rechnerneustart zehn synthetische TXT-, Markdown-, CSV- und DOCX-Dateien
   zusammen im Mehrfachdialog wählen.
2. Keine weitere Auswahl oder Chatfreigabe auslösen.
3. Lokal die aggregierten Zähler, Ergebnisse und das Mapping prüfen.

PASS: genau ein lokaler Batch; TXT, Markdown, CSV und DOCX folgen demselben sicheren
Ablauf; Rollen, Technologien und Zertifikatsnamen bleiben erhalten; direkte
Identifikatoren und als Kunde/Arbeitgeber bezeichnete Organisationen bleiben nicht
sichtbar. Jede gestoppte Position veröffentlicht kein Teilpaket.

Deckt ab: BL-021.1, BL-021.2, BL-022.1, BL-041.1, BL-041.3, BL-050.3.

## M-03 – 100 Positionen

1. Bis zu 100 synthetische Dateien mit insgesamt höchstens 500 MB im selben
   Mehrfachdialog wählen.
2. Den lokalen Ablauf ohne zusätzliche Chataktion abschließen lassen.
3. Zähler und `DataSecure-Mapping.csv` nur lokal vergleichen.

PASS: jede Position ist genau einmal terminal (freigegeben oder sicher gestoppt),
keine Doppelverarbeitung, keine neue Auswahl und keine Namen/Pfade im Chat.

Deckt ab: BL-011.6, BL-011.7, BL-041.5, BL-051.3.

## M-04 / M-05 – Abbruch und explizite Wiederaufnahme

1. Mit zehn synthetischen Dateien starten und Cowork oder den lokalen Worker während
   der Verarbeitung kontrolliert schließen.
2. Zustand und lokale nächste Aktion lesen, ohne eine neue Auswahl anzustoßen.
3. Claude neu starten und nur auf ausdrücklichen Auftrag fortsetzen oder sicher
   stoppen lassen.

PASS: kein automatischer Neustart, kein Ersatzpicker, keine doppelten Pakete und
keine erneute Verarbeitung bereits terminaler Positionen. Der Status ist für eine
fachfremde Person verständlich.

Deckt ab: BL-011.7, BL-011.10, BL-041.2, BL-051.3, BL-052.4.

## M-06 – Visuals und Mehrdeutigkeit

1. Einen synthetischen DOCX-Fall mit Bild sowie einen mehrdeutigen Fall starten.
2. Den Normalweg nicht mit „Bilder entfernen“ verschärfen.
3. Lokale Rückhaltung bzw. sicheren Stopp und den Textausgang prüfen.

PASS: Bildpixel bleiben lokal und Claude kann sie nicht lesen. Mehrdeutige
Zertifikats-/Organisationsstellen werden nicht geraten oder freigegeben. Ein
expliziter Bildlöschwunsch darf bei unbekannten Office-Objekten nur sicher stoppen.

Deckt ab: BL-012.2, BL-012.3, BL-024.2, BL-031.1, BL-032.1, BL-042.2.

## Ergänzende Pflichtgegenproben

- **Hostgrenzen:** Web, Mobile, Cloud/Scheduled und Desktop ohne Local MCP dürfen
  keine lokale Datei verarbeiten. Kein Upload als Ausweichweg. (BL-051.6)
- **Gesperrte Formate:** XLSX, PPTX, eigenständige PNG/JPEG/BMP und PDF stoppen
  sicher; TXT, Markdown, CSV und vollständig abgedeckte DOCX bleiben der aktive
  Kernpfad. (BL-021.1, BL-021.2, BL-022.1, BL-023.1)
- **Berechtigungen:** Cowork-Manual/Auto/Skip auf dem Zielhost beobachten. Host-UI
  dokumentieren, aber keine nicht vorhandene Plugin-Einstellung behaupten.
  (BL-041.4, BL-042.2)
- **Installation:** ZIP und Marketplace auf einem frischen Windows-Konto prüfen.
  macOS folgt erst nach positiver BL-012.8-Evidenz; Linux ausschließlich als
  Claude-Code-Host. (BL-010.2–BL-010.4, BL-012.8, BL-051.1, BL-051.2)
- **Security und Fachlichkeit:** Manipulation, Retention, Löschung, Reparse,
  Keyring, Accessibility, Health-IT- und Datenschutzentscheidungen bleiben eigene
  E1/E2/E3-Fälle der Evidence-Matrix. Sie werden nicht durch diesen Normaltest
  simuliert.
