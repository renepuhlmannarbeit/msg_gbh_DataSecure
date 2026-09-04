# DataSecure Standalone – UAT-Testkit

Stand: 04.09.2026 · Engineering-Pilot 3.2.0-rc99

Dieses Testkit erzeugt menschliche Zielsystem-Evidence. Automatische Tests und
ein erfolgreiches Paket sind kein Ersatz. Ausschließlich synthetische Dateien
verwenden.

## Vorbereitung

1. `npm run uat:fixtures` im Repository ausführen.
2. `npm run build:standalone:windows:portable` ausführen.
3. ZIP und zugehörige `.sha256`-Datei aus `dist/` in einen neuen Ordner mit
   Leerzeichen und Umlaut kopieren und die Prüfsumme vergleichen.
4. ZIP vollständig entpacken. Nicht direkt aus dem Archiv starten.
5. Netzwerk trennen. Claude Desktop, Node, Rust und Python sind für den Test
   nicht erforderlich. Windows 10/11 x64 benötigt Microsoft Edge WebView2.

## Windows-x64-Ablauf

| Schritt | Aktion | Erwartung / PASS |
|---|---|---|
| S01 | `DataSecure Standalone.exe` doppelklicken | Ein Fenster erscheint; kein Terminal, Download oder zweiter Prozessdialog wird verlangt. |
| S02 | **Dateien auswählen** und einen kleinen gemischten Satz aus `docs/acceptance/UAT_TEST_KIT/fixtures` wählen | Genau ein Mehrfachpicker; danach verständliche Stapelübersicht, keine Rohpfade im Fenster. |
| S03 | **Anonymisierung starten** | Passiver Fortschritt; klare Dateien laufen ohne Einzelbestätigung. |
| S04 | Falls Review erscheint, eine Gruppe entscheiden und abschließen | Eine Sammelprüfung; keine zweite Quellauswahl. |
| S05 | **Ergebnisse öffnen** | Nur freigegebene `.md`-Ergebnisse im gewählten Ergebnisordner; Originale unverändert. |
| S06 | **Zuordnung öffnen** | Lokale Zuordnung ist verständlich; sie liegt nicht im Ergebnisordner für Claude. |
| S07 | **Ergebnisordner ändern**, neuen leeren Ordner wählen, zweiten Lauf starten | Ein Ordnerpicker; neue Ergebnisse landen nur dort, bestehende Exporte werden nicht gespiegelt oder gelöscht. |
| S08 | Picker abbrechen | Ruhiger Abbruch, kein automatischer zweiter Picker und kein erfundener Erfolg. |
| S09 | Während eines synthetischen Stapels App beenden und erneut starten | Stapel erscheint als gestoppt/fortsetzbar; Fortsetzung verarbeitet nichts doppelt. |
| S10 | Passwortgeschützte oder nicht freigegebene Testdatei wählen | Datei bleibt unverändert, wird verständlich als nicht verarbeitet gemeldet; andere sichere Stapelpositionen bleiben konsistent. |

## Pflichtbeobachtungen

- Quelle, Name und Dateigröße vor und nach dem Lauf vergleichen.
- Ergebnis- und Mappingfund dokumentieren, aber keine realen Pfade oder Inhalte
  in Issues/Logs kopieren.
- Tastaturbedienung, Fokus, 200-%-Zoom, Kontrast und verständliche deutsche
  Meldungen prüfen.
- Kaltstart und einen 100-Dateien-/bis-500-MiB-Synthetiklauf messen; ein Abbruch
  ist kein Performancewert.
- Prüfen, dass das Programm offline bleibt und keine Firewallfreigabe verlangt.

## Noch nicht durch diesen Windows-Test belegt

macOS Intel, macOS Apple Silicon und Linux benötigen native Pakete und eigene
Zielhostläufe. Ein Rosetta-Lauf ersetzt keinen Intel-Nachweis. Bei unsignierten
macOS-Piloten ist ausschließlich **Datenschutz & Sicherheit → Dennoch öffnen**
zulässig; globale Schutzabschaltungen oder Terminaltricks sind kein Testweg.

## Ergebnis

PASS/FAIL je Schritt, Betriebssystemversion, Paket-SHA-256, beobachtete Dauer und
Defects in einer separaten Evidence-Datei festhalten. Keine Originalinhalte,
Dateinamen, Pfade, Tokens oder Dokumenthashes protokollieren.
