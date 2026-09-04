# Schritt-für-Schritt-UAT

## Vorbereitung

1. Nur synthetische Testdaten verwenden; nichts per Büroklammer hochladen.
   Jeden Lauf getrennt auf dem freizugebenden Zielhost Windows oder macOS erfassen.
2. `npm run uat:fixtures` und anschließend `npm run test:uat-fixtures` ausführen;
   beide melden exakt 111 aktuelle synthetische Dateien.
3. Das für diesen Zielhost erzeugte, selbstenthaltende ZIP installieren. Für
   einen lokalen Entwicklungsbuild zuerst das offizielle, im Runtime-Vertrag
   fest verankerte Node-Archiv mit `npm run runtime:target -- --target <Ziel>
   --archive <Archiv> --output dist/<Ziel>` attestieren und danach
   `npm run build:plugin` ausführen. Kein reines Quell-ZIP verwenden.
   Installation ausschließlich in Claude Desktop über Einstellungen → Anpassen
   → Plugins → „Aus Datei hochladen“; ein bereits vorhandenes DataSecure-Plugin
   dort vorher entfernen und Claude Desktop dazwischen vollständig neu starten.
   Der Bereich „Claude Code“ und die Kommandozeile erreichen Cowork nicht.
4. Claude Desktop vollständig beenden und neu starten. Auf der Plugin-Seite
   prüfen, dass Version, Dateiansicht und Aktualisierungszeit zum zu prüfenden
   Build passen; erst dann eine Aufgabe starten.
5. Einen leeren Test-Ergebnisordner anlegen und ausschließlich diesen Ordner mit
   Cowork verbinden. Kontrollieren, dass `inputs`, Fixture- und sonstige
   Quellordner **nicht** verbunden sind; DataSecure kann diese Cowork-Einstellung
   technisch nicht selbst lesen. Neue lokale Cowork-Aufgabe öffnen und „Dateien
   anonymisieren“ schreiben. Beim ersten Lauf den Ergebnisordner einmalig als
   Ziel wählen. Danach den Quellpicker einmal mit **Abbrechen** schließen. Öffnet
   einer der erwarteten Dialoge nicht, `BLOCKED`; nicht durch Upload umgehen.
6. Build, Pluginversion, Artefakt-SHA-256, Betriebssystem und Claude-Version im
   Evidence-Log erfassen – keine Pfade oder Dokumentkennungen. Die Pluginversion
   stammt aus der Startantwort des ersten Laufs („DataSecure-Version: …“), nicht
   aus der Plugin-Seite; beide müssen übereinstimmen.

Nach einer bestätigten Auswahl lautet die erwartete kurze Claude-Antwort:
**„Der Auftrag wurde lokal übergeben. DataSecure zeigt nach Abschluss den
Ergebnisordner an.“** ergänzt um **„(DataSecure-Version: …)“** mit der Version
des zu prüfenden Builds. Nennt die Antwort eine andere oder keine Version, läuft
in Cowork eine ältere Plugin-Kopie: Lauf als `BLOCKED` erfassen, Plugin gemäß
Anleitung („Plugin aktualisieren“) neu bereitstellen und erst dann fortsetzen.
Statusabfragen oder automatisches Ergebnislesen dürfen daran nicht anschließen.
Dieselbe Version steht in der letzten Zeile jedes lokalen DataSecure-Fensters.

## UAT-01 – Ein Mitarbeiterprofil sicher de-identifizieren

[Ziel und PASS-Regel](CASE_CATALOG.md#uat-01)

1. Neue Cowork-Aufgabe → „Dateien anonymisieren“.
2. Nur `inputs/01-positive/personnel-profile.txt` wählen und einmal öffnen.
3. Lokalen Abschluss abwarten. Danach ausdrücklich um Auswertung des fertigen
   Ergebnisses bitten.
4. In der Abschlussmeldung **„Ergebnisse öffnen“** wählen. Markdown im
   `DataSecure-Output` des Test-Arbeitsordners und Mapping getrennt im privaten
   DataSecure-Bereich prüfen.

PASS: genau ein Ergebnis; Direktidentifikatoren, Arbeitgeber und Kunde fehlen;
Product Owner, Java, SQL, HL7 FHIR, Testautomatisierung, ISTQB und Scrum.org bleiben.

## UAT-02 – Vier Formate liefern denselben fachlichen Inhalt

[Ziel und PASS-Regel](CASE_CATALOG.md#uat-02)

1. Alle vier Dateien aus `inputs/01-positive` gemeinsam wählen.
2. Einmal öffnen; keine Profil-, Bild- oder Einzeldateifrage beantworten.
3. Vier lokale Ergebnisse und vier Mappingzeilen prüfen.

PASS: alle vier vollständig verarbeitet, fachlich gleichwertig, Quellen bytegleich.

## UAT-03 – Bilder lokal halten und Mehrdeutigkeit nicht raten

[Ziel und erlaubte Szenarien](CASE_CATALOG.md#uat-03)

1. Beide Dateien aus `inputs/02-review` gemeinsam wählen.
2. Standardweg verwenden; keinen Bildmodus auswählen.
3. Wenn der lokale Sammelreview erscheint, entweder fachlich entscheiden oder
   vertagen. Bei Vertagung später ausdrücklich fortsetzen.

PASS nur, wenn das Bild-DOCX **entweder** „verwendbar mit Auslassungen“ mit genau
einer lokal zurückgehaltenen Grafik **oder** „sicher nicht verarbeitet“ ist, und
die mehrdeutige Datei bis zur lokalen Entscheidung kein Ergebnis erhält. Bildpixel
erscheinen nie in Claude.

## UAT-04 – Gesperrte Formate ausblenden und beschädigte DOCX sicher stoppen

[Ziel und PASS-Regel](CASE_CATALOG.md#uat-04)

1. „Dateien anonymisieren“ starten und im nativen Picker den Ordner
   `inputs/03-blocked` öffnen.
2. Prüfen, dass PDF, XLSX, PPTX und PNG im Dateifilter des Pickers nicht angeboten
   werden. Den Picker abbrechen; das ist in diesem Teilschritt das erwartete
   Verhalten. Hinweis: Ein Windows-Dateidialog nimmt einen getippten Dateinamen
   mit anderer Endung entgegen; die Sperre greift dann erst lokal im Server.
3. Erneut starten, nur `malformed.docx` auswählen und öffnen.
4. Terminalen Status abwarten und lokal prüfen, dass kein Ergebnis existiert.

PASS: vier gesperrte Formate werden im Produktpicker nicht angeboten; wird eine
davon trotzdem (etwa per getipptem Namen) übergeben, stoppt sie sicher ohne
Ergebnis; die beschädigte DOCX stoppt klar und sicher; alle fünf Quellen bleiben
unverändert und kein Inhalt erscheint in Claude. Eine erzwungene Auswahl, die
sicher stoppt, ist kein FAIL. Nicht versuchen, die lokale Sicherheitsgrenze zu
umgehen.

Details für IT: Die beschädigte DOCX stoppt typischerweise mit
`SOURCE_CONTAINER_CORRUPT` oder `SOURCE_TYPE_MISMATCH`. Ein anderer fail-closed
Code ist kein automatisches FAIL, muss aber inhaltsfrei dokumentiert und gegen
den aktuellen Source-Preflight geprüft werden.

## UAT-05 – Unterbrochenen Zehnerstapel fortsetzen

[Ziel und PASS-Regel](CASE_CATALOG.md#uat-05)

1. `batch-001.txt` bis `batch-010.txt` wählen und öffnen.
2. Sobald **„Der Auftrag wurde lokal übergeben.“** sichtbar ist, Claude
   Desktop vollständig beenden: Windows über „Beenden“ im Taskleistenmenü,
   macOS mit `Cmd+Q`. Nicht auf eine Abschlussmeldung warten.
3. Claude Desktop neu starten und „Setze den unvollständigen DataSecure-Stapel
   fort“ schreiben. Falls der lokale Worker den Stapel während des Neustarts
   bereits vollständig abgeschlossen hat, wird das als `PASS (bereits fertig)`
   dokumentiert; es darf trotzdem kein Ersatzpicker erscheinen.
4. Keine Dateien erneut auswählen.

PASS: kein Ersatzpicker, keine Duplikate, genau zehn Zuordnungen, kein Teiloutput
der beim Beenden aktiven Position. Ein nicht reproduzierbarer Abbruch oder ein
erneuter Picker ist `FAIL`, nicht `BLOCKED`.

## UAT-06 – Hundert Dateien als einen Stapel verarbeiten

[Ziel und PASS-Regel](CASE_CATALOG.md#uat-06)

1. Alle Dateien aus `inputs/04-batch-100` gemeinsam wählen und einmal öffnen.
2. Ohne weitere Chataktion bis zur lokalen Abschlussmeldung warten.
3. Ergebnisse später ausdrücklich gesammelt anfordern und bis `more=false`
   fortsetzen.

PASS: 100 eindeutige terminale Positionen, 100 Mappingzeilen, 100 neutrale
Markdown-Dateien im gewählten `DataSecure-Output`, genau eine lokale
Abschlussübersicht mit **„Ergebnisse öffnen“**, keine internen Kennungen im Chat.

## Abschluss

Für jeden Fall eine Evidence-Zeile mit `PASS`, `FAIL` oder `BLOCKED` ausfüllen.
Ein GO erfordert UAT-01 bis UAT-06 als PASS auf jedem freizugebenden Zielhost und
keinen harten Datenschutzfehler. UAT-03 muss exakt einem erlaubten Szenario
folgen; UAT-04 muss Pickergrenze und sicheren DOCX-Stopp belegen; UAT-05 muss den
Abbruchzustand oder den bereits terminal abgeschlossenen Stapel eindeutig zeigen.
`BLOCKED` ersetzt keinen Zielhostnachweis. Marketplace-GO erfordert zusätzlich
Installieren, Aktualisieren und Zurückrollen. ZIP-GO erfordert eine echte
Fresh-Install-Runde. Tastaturbedienung, verständliche Beschriftungen, Quellen- und
Retention-Schutz sind Pflichtspalten des Evidence-Logs.
