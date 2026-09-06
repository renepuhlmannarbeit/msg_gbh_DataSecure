# DataSecure Standalone – UAT-Testkit

Stand: 06.09.2026 · Engineering-Pilot 3.2.0-rc111

Dieses Testkit erzeugt menschliche Zielsystem-Evidence. Automatische Tests und
ein erfolgreiches Paket sind kein Ersatz. Ausschließlich synthetische Dateien
verwenden.

## Vorbereitung

Anwender verwenden das fertig bereitgestellte Windows-ZIP. Sie müssen weder
Quellcode bauen noch eine Entwicklungsumgebung installieren.

1. Den in `docs/canonical/CURRENT_STATE.md` benannten Kandidaten und die
   synthetischen Testdateien bereitstellen lassen.
2. ZIP und zugehörige `.sha256`-Datei aus `dist/` in einen neuen Ordner mit
   Leerzeichen und Umlaut kopieren und die Prüfsumme vergleichen.
3. ZIP vollständig entpacken. Nicht direkt aus dem Archiv starten.
4. Netzwerk trennen. Claude Desktop, Node, Rust und Python sind für den Test
   nicht erforderlich. Windows 10/11 x64 benötigt Microsoft Edge WebView2.

Nur für die Entwicklerbereitstellung: `npm run uat:fixtures` erzeugt die
synthetischen Eingaben. `npm run test:standalone:pkg-04` baut und prüft den
Kandidaten aus einem sauberen Commit; ein beliebiger lokaler Neubau ersetzt
diese konkrete Paketbindung nicht.

## Windows-x64-Ablauf

| Schritt | Aktion | Erwartung / PASS |
|---|---|---|
| S01 | `DataSecure Standalone.exe` doppelklicken | Die Startseite erklärt beide Funktionen; weder Verarbeiten noch eine Betriebsart ist vorbelegt. Kein Terminal, Download oder zweiter Prozessdialog wird verlangt. |
| S02 | Auf Start **Markdown erstellen**, dann **Dateien auswählen** und einen kleinen gemischten Satz aus `docs/acceptance/UAT_TEST_KIT/inputs` wählen | Genau ein Mehrfachpicker; danach Anzahl, gewählte Dateinamen, Quellenordner und der aktuelle Ergebnisordner im ausschließlich lokalen Fenster. |
| S03 | Die ausdrücklich gewählte Betriebsart **Nur in Markdown umwandeln** prüfen und **Starten** wählen | Fortschritt ohne PII-Prüfung oder Einzelbestätigung; Namen bleiben erhalten. Ohne gewählte Betriebsart kann kein neuer Stapel starten. |
| S04 | Abschluss und eventuell angezeigte Extraktionshinweise ansehen | Kein Reviewdialog im reinen Konvertierungsmodus. Unvollständige/OCR-Ausgaben sind als solche gekennzeichnet; keine Behauptung vollständiger oder anonymisierter Inhalte. |
| S05 | **Verlauf**, dann **Ergebnisordner** in der Zeile dieses Laufs | Explorer/Finder öffnet exakt dessen `DataSecure-Markdown/Lauf-*`-Ordner; dort liegen `.md`-Ergebnisse und `DataSecure-Zuordnung.csv`; Originale bleiben unverändert. Kein automatischer Ansichts- oder Explorerwechsel bei Abschluss. |
| S06 | **Zuordnung** in derselben Zeile | Explorer/Finder markiert `DataSecure-Zuordnung.csv` genau dieses Laufs; jede Quelle ist ihrem neutralen Ergebnisnamen zugeordnet. Die Tabelle enthält keine Zuordnung von Personennamen zu Pseudonymen. |
| S07 | **Ergebnisordner ändern**, neuen leeren Ordner wählen, zweiten Lauf starten | Ein Ordnerpicker; neue Ergebnisse landen nur dort, bestehende Exporte werden nicht gespiegelt oder gelöscht. |
| S08 | Picker abbrechen | Ruhiger Abbruch, kein automatischer zweiter Picker und kein erfundener Erfolg. |
| S09 | Während eines synthetischen Stapels App beenden und erneut starten | Der bereits übergebene Worker darf lokal weiterarbeiten. Beim Neustart erscheint der tatsächliche Zustand: laufend, abgeschlossen oder bei einer echten Unterbrechung fortsetzbar. Kein Doppelstart und keine doppelte Verarbeitung. Fensterschließen allein ist kein zugesagter Stapelabbruch. |
| S10 | Passwortgeschützte oder nicht freigegebene Testdatei wählen | Datei bleibt unverändert, wird verständlich als nicht verarbeitet gemeldet; andere sichere Stapelpositionen bleiben konsistent. |
| S11 | **Diagnose öffnen** | Der lokale Diagnoseordner öffnet sich. `desktop-interactions.jsonl` und `sidecar-interactions.jsonl` enthalten nur feste Ereignisse, Aktionen, Laufzeiten und Fehlercodes – keine Dateinamen, Quell-/Zielpfade oder Inhalte. |
| S12 | Vier Dateien aus `inputs/01-positive` hineinziehen, noch nicht starten | Lokale Dateinamen und Quellenordner erscheinen; **Starten** ist die einzige Startaktion. Ohne Klick entstehen keine Ergebnisse. Klick-/Tastaturauswahl bleibt gleichwertig. |
| S13 | Während vorbereiteter Auswahl erneut Dateien hineinziehen; anschließend Auswahl verwerfen | Zweiter Drop ersetzt die erste Auswahl nicht. Verständlicher Hinweis; danach ist eine neue Auswahl möglich. Dateien plus Ordner zusammen werden als gemischte Auswahl abgelehnt. |
| S14 | Für einen neuen vierformatigen Stapel ausdrücklich **In Markdown umwandeln und anonymisieren** wählen, starten und die vier Ergebnisse vergleichen | Dieselbe synthetische Person ist überall `[PERSON_001]`; Arbeitgeber und Kunde tragen zwei unterschiedliche, dokumentübergreifend identische `[UNTERNEHMEN_…]`-Kennungen. Keine ursprünglichen Personen-/Firmennamen. Diese Betriebsart darf eine lokale Sammelprüfung verlangen. Ausgabe und Zuordnung liegen getrennt unter `DataSecure-Output/Lauf-*`. |
| S15 | Wieder **Nur in Markdown umwandeln** wählen; synthetische XLSX/PPTX, Text-PDF, Scan-PDF und PNG/JPEG/BMP verarbeiten | Alle lesbaren Eingaben erzeugen je eine Markdown-Datei. Namen bleiben erhalten; OCR und nicht vollständig erfasste Objekte werden verständlich als Hinweise ausgewiesen, ohne Zusatzdialog. Kein Python-/Node-Download, keine KI-Verbindung. Ergebnisse sind ausdrücklich **nicht anonymisiert**. |
| S16 | Nach einem erfolgreichen Lauf **Neue Aufgabe wählen**, eine Funktion wählen und einen zweiten kleinen Stapel starten | Die Verarbeitung läuft ohne erneutes Öffnen der App weiter. Unter **Verlauf** stehen beide Läufe; jede Öffnen-Aktion gehört ausschließlich zu ihrer Zeile. |
| S17 | Einen Picker länger offen lassen, abbrechen und anschließend einen kleinen Stapel starten | Nach dem Abbruch bleibt die App bedienbar; Fortschritt und Abschluss aktualisieren sich wieder selbständig. |
| S18 | Nach einem erfolgreichen Stapel nur `../UAT_TEST_KIT/inputs/03-blocked/malformed.docx` starten; danach diese Datei gemeinsam mit `../UAT_TEST_KIT/inputs/01-positive/personnel-profile.txt` wählen | Der reine Fehlerlauf meldet keine Ergebnisse, bietet aber seine eigene Zuordnung mit Fehlercodes. Der Mischlauf enthält fertige Ergebnisse und gestoppte Quellen in seiner Zuordnung. Im reinen Konvertierungsmodus bleiben Namen erhalten. Nie wird eine alte Zuordnung als aktuelle angeboten. Falls die Übersicht nicht geschrieben werden kann, erscheint ein ausdrücklicher Hinweis statt „Fertig“. |
| S19 | Im ausdrücklich gewählten Anonymisierungsmodus zwei synthetische Dokumente mit `Kunde: Nordstern Medizin GmbH` beziehungsweise `Kunde: Nordstern Medizin AG` und zusätzlich dem Kurzverweis `Nordstern Medizin` verarbeiten | Beide vollständigen Firmen bleiben unterschiedliche Unternehmenskennungen. Der mehrdeutige Kurzverweis erscheint als `[UNTERNEHMEN_UNKLAR_…]`, nicht als Person. Ein ausdrücklicher natürlicher Kundenname wie `Max Mustermann` bleibt eine Personenkennung. |
| S20 | Mit bestehenden Ergebnissen App neu starten; zwischen Start, Verarbeiten und Verlauf per Tastatur wechseln | Start bleibt die erste Ansicht. Pfeiltasten/Home/End bewegen den Tab-Fokus; Enter/Leertaste aktiviert. Abschlussmeldungen springen nicht in einen anderen Tab. |
| S21 | Nach zwei Läufen das Ergebnisziel ändern und App neu starten; im Verlauf beide alten Zeilen öffnen | Alte Ergebnisordner und Zuordnungen bleiben exakt gebunden. Gelöschte oder ausgetauschte Ziele werden nicht durch den neuesten Lauf ersetzt. Rückmeldung erscheint bei der betätigten Zeile. |
| S22 | In einer synthetischen Testinstallation insgesamt 21 kleine Verarbeitungen abschließen | Verlauf zeigt genau die 20 neuesten Verarbeitungen, neueste zuerst. Der älteste Ergebnisordner wird dadurch nicht gelöscht. |
| S23 | Einen älteren wirklich unterbrochenen Stapel über seine Verlaufszeile fortsetzen | Genau dessen Betriebsart, Dateien und Zähler werden fortgeführt. Kein zweiter aktiver Stapel; bei vorbereiteter neuer Auswahl bleibt Fortsetzen gesperrt. Nicht fortsetzbare Zeilen erklären den deaktivierten Knopf. |

Der Standard-Ergebnisordner wird bereits beim Start angezeigt, aber erst beim
Start des ersten Stapels sicher angelegt und gespeichert. Eine ausdrückliche
Wahl über **Ergebnisordner ändern** ersetzt diesen Standard. Für Diagnosezwecke
ist kein Server und kein Terminal zu starten; **Diagnose öffnen** führt zum
festen lokalen Protokollordner.

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
