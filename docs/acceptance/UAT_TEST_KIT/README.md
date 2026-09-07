# Aktuelles Cowork-Plugin-UAT-Testpaket

Stand: 03.09.2026 · gilt für den jeweils installierten, dokumentierten Build

Dieses Paket verwendet ausschließlich synthetische Daten. Es ist der aktuelle
Einstieg für die menschliche **Cowork-Plugin-Abnahme**. Die eigenständige App
wird mit dem [Standalone-UAT-Kit](../STANDALONE_UAT_TEST_KIT/README.md)
abgenommen. Alte RC30-/RC63-Kits bleiben als
reproduzierbare Historie erhalten, sind aber keine Anleitung.

## In drei Schritten

1. Im Repository `npm run uat:fixtures` ausführen. Der aktuelle Node-Generator
   erzeugt plattformneutral exakt 111 synthetische Dateien unter
   `docs/acceptance/UAT_TEST_KIT/inputs`; Python und historische RC-Kits werden
   dafür nicht benötigt.
2. Aktuelles Plugin-ZIP bauen und in Claude Desktop über Einstellungen →
   Anpassen → Plugins hochladen (ein vorhandenes DataSecure-Plugin vorher dort
   entfernen), Claude Desktop vollständig neu starten und auf der Plugin-Seite
   Version, Dateiansicht und Aktualisierungszeit prüfen. Der Bereich „Claude
   Code“ erreicht Cowork nicht.
3. Die sechs verständlich benannten Fälle aus
   [STEP-BY-STEP.md](STEP-BY-STEP.md) durchführen und
   [EVIDENCE_LOG.csv](EVIDENCE_LOG.csv) ausfüllen.

Beim allerersten Lauf wird einmalig ein dedizierter, bereits mit Cowork verbundener
synthetischer Test-Arbeitsordner als Ergebnisziel gewählt. Danach verwendet jeder
Stapel genau einen lokalen Mehrfachpicker und eine Bestätigung mit „Öffnen“.
Freigegebenes Markdown muss in dessen `DataSecure-Output` erscheinen. Die
dauerhafte lokale `DataSecure-Mapping.csv` bleibt im privaten Bereich und wird
geprüft, aber niemals in den Chat oder den dedizierten lokalen Ergebnisordner gelesen.

Produktivdaten und Chat-Uploads sind verboten. Die Erzeugung wird automatisiert
mit `npm run test:uat-fixtures` gegen Dateizahl, Struktur, Reproduzierbarkeit und
synthetische Marker geprüft.

## Testbereiche

- `01-positive`: derselbe synthetische Fall als TXT, Markdown, CSV und DOCX.
- `02-review`: Bild-DOCX und mehrdeutiger Zertifikatsanbieter.
- `03-blocked`: absichtlich gesperrte oder beschädigte Formate.
- `04-batch-100`: 100 kleine TXT-Dateien für Fortsetzung und Serienlauf.

Jede Kennung wird immer zusammen mit ihrem Klartextnamen verwendet. Wer etwa
„UAT-03“ liest, findet im [Fallkatalog](CASE_CATALOG.md#uat-03) unmittelbar Ziel,
Dateien und erwartetes Verhalten. Technische Fehlercodes stehen nur unter
„Details für IT“.

## Harte Datenschutzkriterien

Sofort `FAIL`, wenn Originalinhalt, Originaldateiname, Quellpfad, Paket-ID,
Capability, Token oder Cursor im Chat erscheint; eine Quelle verändert/gelöscht
wird; oder eine sicher gestoppte Datei ein Teilresultat erhält.

Ein gesperrtes Format besteht nur dann, wenn es sicher stoppt und Claude keinen
Inhalt erhält. Quellen/Originale und fertige Exporte werden niemals automatisch
gelöscht.

## GO-Regel

Ein Release-GO erfordert alle sechs Fälle als `PASS` auf jedem freizugebenden
Zielbetriebssystem. `BLOCKED` ist kein PASS. Zusätzlich müssen ZIP-Fresh-Install,
Tastaturbedienung, verständliche Beschriftungen, Quellen-/Retention-Schutz sowie
der 100-Dateien-Stapel belegt sein. Für eine Marketplace-Veröffentlichung sind
Installieren, Aktualisieren und Zurückrollen dort zusätzlich Pflicht. Der lokale
500-MB-Grenztest wird separat mit `npm run test:batch-500mb-local` nachgewiesen;
er darf wegen seiner Größe nicht durch einen kleinen UAT-Scheindatensatz ersetzt
werden. Jeder harte Datenschutzfehler bedeutet sofort `NO-GO`.
