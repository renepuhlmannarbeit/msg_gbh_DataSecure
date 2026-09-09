# DataSecure Standalone – UAT-Testkit

Stand: 09.09.2026 · Engineering-Pilot 3.2.0-rc131

Dieses Testkit erzeugt menschliche Zielsystem-Evidence. Automatische Tests und
ein erfolgreiches Paket sind kein Ersatz. Ausschließlich synthetische Dateien
verwenden.

Für die geplante gemeinsame Abnahme durch eine Windows- und eine Mac-Person gilt
zusätzlich der [formale N3/N4-Rahmen](../FORMAL_UAT/README.md). Er legt Kandidat,
Paket-Hashes, Reihenfolge und getrennte Evidence-Dateien fest; die folgenden
S01–S23 bleiben die ausführbaren Standalone-Fälle.

## Vorbereitung

Anwender verwenden das für ihren Zielrechner fertig bereitgestellte ZIP:
Windows x64, macOS Intel, macOS Apple Silicon oder Linux x64 glibc. Sie müssen
weder Quellcode bauen noch eine Entwicklungsumgebung installieren.

1. Den in `docs/canonical/CURRENT_STATE.md` benannten Kandidaten und die
   synthetischen Testdateien bereitstellen lassen.
2. ZIP und zugehörige `.sha256`-Datei aus `dist/` in einen neuen Ordner mit
   Leerzeichen und Umlaut kopieren und die Prüfsumme vergleichen.
3. ZIP vollständig entpacken. Nicht direkt aus dem Archiv starten.
4. Netzwerk trennen. Claude Desktop, Node, Rust und Python sind für den Test
   nicht erforderlich. Windows 10/11 x64 benötigt Microsoft Edge WebView2;
   macOS mindestens 13.5. Das Linux-Paket setzt x64 mit glibc 2.35 oder neuer
   und eine grafische Desktopumgebung voraus.
5. Nur auf macOS: Das zur CPU passende Paket verwenden. Bei einem ad-hoc
   signierten Engineering-Piloten ausschließlich **Datenschutz & Sicherheit →
   Dennoch öffnen** nutzen; keine globale Schutzabschaltung.
6. Nur auf Linux: ZIP-Prüfsumme vor dem Entpacken verifizieren. Falls das
   Ausführungsrecht beim Entpacken verloren ging, einmal
   `chmod u+x "DataSecure Standalone.AppImage"` ausführen.

Nur für die Entwicklerbereitstellung: `npm run uat:fixtures` erzeugt die
synthetischen Eingaben. `npm run test:standalone:pkg-04` baut und prüft den
Kandidaten aus einem sauberen Commit; ein beliebiger lokaler Neubau ersetzt
diese konkrete Paketbindung nicht.

## Gemeinsamer Ablauf auf Windows, macOS und Linux x64

| Schritt | Aktion | Erwartung / PASS |
|---|---|---|
| S01 | `DataSecure Standalone.exe`, `DataSecure Standalone.app` beziehungsweise `DataSecure Standalone.AppImage` öffnen | Die Startseite erklärt beide Funktionen; weder Verarbeiten noch eine Betriebsart ist vorbelegt. Kein Terminal, Download oder zweiter Prozessdialog wird verlangt. |
| S02 | Auf Start **Markdown erstellen**, dann **Dateien auswählen** und einen kleinen gemischten Satz aus `docs/acceptance/UAT_TEST_KIT/inputs` wählen. Eine Datei über **Entfernen** herausnehmen, danach erneut auswählen und einmal **Auswahl leeren** testen | Genau ein Mehrfachpicker; danach Anzahl, gewählte Dateinamen, Quellenordner und der aktuelle Ergebnisordner im ausschließlich lokalen Fenster. Einzelnes Entfernen verändert nur die vorbereitete Auswahl; Leeren setzt sie vollständig zurück. Keine Verarbeitung und keine Quelldateiänderung vor **Starten**. |
| S03 | Die ausdrücklich gewählte Betriebsart **Nur in Markdown umwandeln** prüfen und **Starten** wählen | Fortschritt ohne PII-Prüfung oder Einzelbestätigung; Namen bleiben erhalten. Ohne gewählte Betriebsart kann kein neuer Stapel starten. |
| S04 | Abschluss und eventuell angezeigte Extraktionshinweise ansehen | Kein Reviewdialog im reinen Konvertierungsmodus. Unvollständige/OCR-Ausgaben sind als solche gekennzeichnet; keine Behauptung vollständiger oder anonymisierter Inhalte. |
| S05 | **Verlauf**, dann **Ergebnisordner** in der Zeile dieses Laufs | Explorer, Finder beziehungsweise der Linux-Dateimanager öffnet exakt dessen `DataSecure-Markdown/Lauf-*`-Ordner. Jede `.md` behält den Basisnamen ihrer Quelle; nur die Endung ändert sich. Namenskollisionen tragen ` (2)`, ` (3)` usw. Originale bleiben unverändert. Kein automatischer Ansichts- oder Dateimanagerwechsel bei Abschluss. |
| S06 | **Zuordnung** in derselben reinen Konvertierungszeile prüfen | Die Aktion ist deaktiviert und erklärt, dass keine Zuordnung nötig ist. Im Laufordner existiert keine `DataSecure-Zuordnung.csv`. Im späteren Anonymisierungslauf aus S14 ist die Aktion dagegen aktiv und markiert genau dessen Zuordnungsdatei. |
| S07 | **Ergebnisordner ändern**, neuen leeren Ordner wählen, zweiten Lauf starten | Ein Ordnerpicker; neue Ergebnisse landen nur dort, bestehende Exporte werden nicht gespiegelt oder gelöscht. |
| S08 | Picker abbrechen | Ruhiger Abbruch, kein automatischer zweiter Picker und kein erfundener Erfolg. |
| S09 | Während eines synthetischen Stapels App beenden und erneut starten | Der bereits übergebene Worker darf lokal weiterarbeiten. Beim Neustart erscheint der tatsächliche Zustand: laufend, abgeschlossen oder bei einer echten Unterbrechung fortsetzbar. Kein Doppelstart und keine doppelte Verarbeitung. Fensterschließen allein ist kein zugesagter Stapelabbruch. |
| S10 | Passwortgeschützte oder nicht freigegebene Testdatei wählen | Datei bleibt unverändert, wird verständlich als nicht verarbeitet gemeldet; andere sichere Stapelpositionen bleiben konsistent. |
| S11 | **Diagnose öffnen** | Der lokale Diagnoseordner öffnet sich. `desktop-interactions.jsonl` und `sidecar-interactions.jsonl` enthalten nur feste Ereignisse, Aktionen, Laufzeiten und Fehlercodes – keine Dateinamen, Quell-/Zielpfade oder Inhalte. |
| S12 | Vier Dateien aus `inputs/01-positive` hineinziehen, noch nicht starten | Lokale Dateinamen und Quellenordner erscheinen; **Starten** ist die einzige Startaktion. Ohne Klick entstehen keine Ergebnisse. Klick-/Tastaturauswahl bleibt gleichwertig. |
| S13 | Während vorbereiteter Auswahl erneut Dateien hineinziehen; anschließend eine Datei entfernen und dann **Auswahl leeren** | Zweiter Drop ersetzt die erste Auswahl nicht. Einzelnes Entfernen aktualisiert Anzahl und Liste; vollständiges Leeren erlaubt danach eine neue Auswahl. Dateien plus Ordner zusammen werden als gemischte Auswahl abgelehnt. Das Verhalten ist in beiden Betriebsarten identisch. |
| S14 | Für einen neuen vierformatigen Stapel ausdrücklich **In Markdown umwandeln und anonymisieren** wählen, starten und die vier Ergebnisse vergleichen | Dieselbe synthetische Person ist überall `[PERSON_001]`; Arbeitgeber und Kunde tragen zwei unterschiedliche, dokumentübergreifend identische `[UNTERNEHMEN_…]`-Kennungen. Keine ursprünglichen Personen-/Firmennamen. Diese Betriebsart darf eine lokale Sammelprüfung verlangen. Ausgabe und Zuordnung liegen getrennt unter `DataSecure-Output/Lauf-*`. |
| S15 | Wieder **Nur in Markdown umwandeln** wählen; synthetische XLSX/PPTX, Text-PDF, Scan-PDF und PNG/JPEG/BMP verarbeiten | Alle lesbaren Eingaben erzeugen je eine Markdown-Datei. Namen bleiben erhalten; OCR und nicht vollständig erfasste Objekte werden verständlich als Hinweise ausgewiesen, ohne Zusatzdialog. Kein Python-/Node-Download, keine KI-Verbindung. Ergebnisse sind ausdrücklich **nicht anonymisiert**. |
| S16 | Nach einem erfolgreichen Lauf **Neue Aufgabe wählen**, eine Funktion wählen und einen zweiten kleinen Stapel starten | Die Verarbeitung läuft ohne erneutes Öffnen der App weiter. Unter **Verlauf** stehen beide Läufe; jede Öffnen-Aktion gehört ausschließlich zu ihrer Zeile. |
| S17 | Einen Picker länger offen lassen, abbrechen und anschließend einen kleinen Stapel starten | Nach dem Abbruch bleibt die App bedienbar; Fortschritt und Abschluss aktualisieren sich wieder selbständig. |
| S18 | Nach einem erfolgreichen Stapel nur `../UAT_TEST_KIT/inputs/03-blocked/malformed.docx` starten; danach diese Datei gemeinsam mit `../UAT_TEST_KIT/inputs/01-positive/personnel-profile.txt` wählen | Der reine Konvertierungs-Fehlerlauf meldet keine Ergebnisse und keine Zuordnung; Details sind über **Diagnose öffnen** erreichbar. Der Mischlauf enthält die erfolgreiche `.md` unter ihrem Quellbasisnamen, ebenfalls ohne Zuordnung. Im Anonymisierungsmodus enthält die Zuordnungsdatei ausschließlich die erfolgreiche Quelle und ihr tatsächlich vorhandenes Ergebnis; gestoppte Quellen stehen nur in Abschluss und Diagnose. Ein vollständig gestoppter Lauf erzeugt keinen Ergebnisordner und keine Zuordnung. Nie wird eine alte Zuordnung als aktuelle angeboten. |
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

## Zielhostgrenzen dieses Testkits

Native E0-App-/IPC-/Paketläufe bestehen für macOS Intel, macOS Apple Silicon
und Linux x64; Windows besitzt ebenfalls seinen technischen Paketnachweis. Das
ersetzt auf keinem Zielhost die hier beschriebene sichtbare menschliche UAT.
Jede Plattform und auf macOS jede CPU-Architektur erhält ein eigenes Protokoll;
ein Rosetta-Lauf ersetzt keinen Intel-Nachweis. Linux ARM64 und Windows ARM64
sind keine aktuellen Produktziele. Cowork wird auf Linux nicht mitgetestet,
weil Linux ausschließlich ein Standalone-Ziel ist.

## Ergebnis

PASS/FAIL je Schritt, Betriebssystem und Architektur, Paket-SHA-256, beobachtete
Dauer und Defects in einer separaten Evidence-Datei festhalten. Keine
Originalinhalte, Dateinamen, Pfade, Tokens oder Dokumenthashes protokollieren.
