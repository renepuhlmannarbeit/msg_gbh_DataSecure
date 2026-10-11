# DataSecure Standalone Desktop

### Prototyp v2 (08.10.2026, laufende unveröffentlichte Migration)

`frontend/workspace.html` übernimmt Gestaltung und Interaktion des klickbaren
Anwenderprototyps: lokale Inter-Schrift, ruhige Karten, unterstrichene Navigation,
Radio-Karten, hierarchische Dateiauswahl und eine integrierte schnelle Prüfliste.
Die tatsächliche Verarbeitung nutzt die bestehenden geschlossenen Desktop-
Funktionen; keine Demo-Verarbeitung gehört zum Produkt. Auswahl und Eingaben
bestätigen nichts, zentrale Sammelaktionen merken vor und erst die vollständige
Gruppenübergabe sendet Entscheidungen. Die Prüfansicht nennt den zugehörigen Lauf.

Seit der ausdrücklich beauftragten RC159-Prerelease-Vorbereitung vom 11.10.2026
ist die neue Seite der **gemeinsame native Einstieg aller vier Testpakete**,
ohne Engineering-Override. Die allgemeine grafische/native Freigabe bleibt offen.
Persistierte Pause,
nachträgliche Dokumentfreigaben und getrennter nativer Export sind lokal
implementiert. Sichere automatische Wiederverbindung nach Kontrollverlust ist
jetzt ebenfalls implementiert: keine automatische Wiederholung von Start,
Entscheidung oder Exportbestätigung; private Ansichten bewusst neu laden.
Einzelne Datei-Wiederholungen und vollständige grafische/native Plattformabnahme
fehlen noch. Der Metadatenkatalog erlaubt bis zu 1.000 Dateien (maximal 512 KiB
für die vollständige Aufnahmeantwort inklusive Artefaktdetails), die angehakte
Verarbeitungsmenge bleibt bei 200/500 MiB.
Der aktuelle lokale Windows-v2-Testbau ist **RC159** unter
`dist/engineering-workspace-v2-windows-rc159-20261008/`. Er ersetzt r10 für neue
Tests. Nach dem bestätigten Abschluss der OCR-/Entitäts-Fundstellenprüfung
öffnet die App direkt die Ergebnisprüfung desselben Laufs. Der Verlaufs-
Hauptbutton öffnet ebenfalls unmittelbar die Dokumentansicht statt zuerst eine
Status-Momentaufnahme. Freigaben und Exportbelege bleiben als sekundäre Aktion
verfügbar. Vertagen oder ein fehlgeschlagenes Schließen lösen diesen Übergang
nicht aus; native Sitzungsgeneration und Antwortbesitz verhindern verspätete
Phasenwechsel. Auswahl, Dokumentfreigabe und KI-Export bleiben ausdrücklich
getrennt; keine automatische Freigabe oder Ausgabe. Der unveröffentlichte
Offline-/Locked-Bau aktiviert `workspace.html` mit RC159-Fenstertitel.
`TESTHINWEISE.txt` und `PRUEFNACHWEIS.json` neben dem ZIP beschreiben Bedienprobe,
technische Nachweise und offene Grenzen. Die App wird nicht automatisch
gestartet; sichtbare Windows-Abnahme beim Anwender, Mac-Abnahme weiterhin offen.

Der frühere lokale Windows-v2-Testbau r10 liegt unter
`dist/engineering-workspace-v2-windows-20261008-r10/`; `TESTHINWEISE.txt` nennt
Start, Testdaten und Grenzen. Seine Nachweise gelten nur für r10, nicht
automatisch für RC159. Der Bau enthält die nach r9 korrigierte Dokumentbindung, Pause,
Kontaktübersicht und native Prozess-/Antwortfristbehandlung. Offline-/Locked-
Kompilierung, ZIP-Verifier und echter isolierter Paket-Sidecar-Smoke bestehen;
alle 190 projizierten Serverdateien und die EXE sind bytegebunden. Der
unveränderte Quellscope besteht den vollständigen Headless-Eingang mit
218 Testdateien. Frische Renderer-/Guardproben: 42/42/39/11 Fälle. Neun rohe
OCR-E-Mail-Abweichungen bleiben sichtbare Qualitätswarnungen. r10 wurde nicht
auf dem Desktop gestartet oder bedient; die sichtbare Windows-Abnahme
übernimmt der Anwender. Native Mac-/vollständige Release-Paketabnahme bleibt
offen. Nur dieser Engineeringbau aktiviert `workspace.html` mit lokalem
r10-Fenstertitel; der reguläre Einstieg bleibt unverändert. Details und
Grenzen stehen in `PRUEFNACHWEIS.json` neben dem ZIP und im kanonischen Iststand.

Frühere native Windows-Evidenz ausschließlich für r7: ZIP-Verifier,
echte Paket-Sidecar-Abläufe sowie die begrenzte native Windows-GUI-Kette
Ordnerwahl → Sammelprüfung → Dokumentvergleich → Freigabe → KI-Export bestehen.
Ein beschädigtes CSV wird mit Namen/Grund angezeigt, zwei gesunde Dokumente
lassen sich trotzdem prüfen und exportieren. Die Exportbytes und unveränderten
Quellen sind kontrolliert. Automatische Wiederverbindung nach einem kontrollierten
Sidecar-Ausfall nach Exportabschluss ist für genau dieses Paket beobachtet.
Keine menschliche Zielhost-, vollständige Accessibility- oder Mac-Abnahme daraus
ableiten. Der r7-Schnitt korrigiert zudem den semantischen Vergleich über Tauri
umgeordneter Identitätsfelder; die Regelversionsbindung aus r3 bleibt erhalten.
Bitte einen neuen Testlauf starten und
den Test-Ergebnisordner ausdrücklich auswählen; alte unvollständige
Engineering-Läufe werden nicht stillschweigend auf andere Regeln migriert.
Der damalige vollständige lokale Produktprüflauf bestand mit 217 Testdateien
(96 Basis plus 121 direkte Tests). Releasebuild und Pluginarchivgate bleiben
davon getrennt und sind auf dem unveröffentlichten Arbeitsstand nicht grün.
Aktuelle Abgrenzung und Backlog:
[Migrationsabgleich](../../docs/frontend-migration.md), BL-010.53 im kanonischen
Backlog. Eine lokale Gestaltungsvorschau startet mit
`npm run preview:standalone:review -- --workspace`; ihre Daten und Verarbeitung
sind ausdrücklich simuliert und keine Produktabnahme.
Für die grafische Grenzprüfung dient in dieser Vorschau
`/workspace.html?demo=large-catalogue` mit 201 erfundenen Dateien.

Veröffentlichte Pakete: [RC158 für Windows und beide Macs](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc158).
Linux bleibt [RC157](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc157).
Die folgenden früheren Entwicklungs-/Testbauangaben bleiben zeitlich getrennte Evidenz.

Vorherige Pakete: [RC157 für Windows, macOS Intel, macOS Apple Silicon und Linux](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc157).
Auf beiden Macs bleibt ZIP erhalten; DMG ist ein zusätzlicher Weg. Alle vier
nativen Paket-/App-Prüfungen einschließlich integrierter Prüfseite bestanden;
der Windows-Anwenderlauf mit 140 Ergebnissen wurde als bestanden bestätigt.

Lokaler Entwicklungsstand vom 05.10.2026 (noch nicht in RC157 veröffentlicht):
Die Prüfung bietet zusätzlich **Als Unternehmen anonymisieren** und
**Beibehalten**. Eine bestätigte Behandlung derselben vollständigen Schreibweise
gilt für offene und folgende Prüfungen dieses Laufs, auch nach Neustart. Neue
Läufe und bereits fertige Ergebnisse bleiben getrennt. Nicht verarbeitete
Dateien werden mit Namen einschließlich Endung, Fehlercode und nächstem Schritt
genannt; **Dateidetails erneut laden** lädt nur die Liste, nicht die Verarbeitung.
PDF-OCR über bereits vorhandenem nativem Text wird nur bei vollständiger
Geometrieabdeckung, exakter Wortgleichheit und sicherer Malreihenfolge
unterdrückt. Nicht lesbare Symbolruns und ausgelassene Grafiken erhalten einen
sachlichen Hinweis; unbekannte Bildtexte werden nicht blind entfernt und
Grafikbeschreibungen nicht erfunden. Siehe DS-106 / BL-010.46 im kanonischen Stand.

DS-107 / BL-010.48 härtet zusätzlich die echte Desktop-Verbindung und den
Prüfprozess: Unternehmensentscheidungen passieren die private IPC-Validierung;
Vorbereitung, Veröffentlichung, Fehler und nötige Exportreparatur werden
unterschieden. Fehlende Komponente, verweigerte Ausführung oder falsche
Architektur erhalten einen festen Fehlercode mit passendem nächsten Schritt.
Das laufgebundene Prüffenster kann die dafür vorgemerkten Dateinamen nennen,
auch wenn der Worker vor dem ersten Entwurf nicht startet. Eine Wiederholung
ist erst nach dessen tatsächlichem Ende möglich. Das Schließen der App wartet
nicht unbegrenzt auf einen blockierten Prüfkanal; ungeprüfte Dateien bleiben
gesperrt und fortsetzbar. Pro Prüfdialog sind auf allen Plattformen maximal
5.000 Fundstellen möglich. Größere einzelne Dokumente müssen aufgeteilt werden.
Diese Änderungen sind im lokalen Windows-Engineering-Bau geprüft, noch nicht
als neues Release oder native macOS-Bedienabnahme veröffentlicht.

DS-109 ergänzt lokal (noch unveröffentlicht) gebundene Gesprächsnamen,
konservative OCR-Wort-/Malreihenfolgenprüfung und ehrliche Identitätswarnungen.
Bekannte OS-Begleitdateien werden nur nach Strukturprüfung übersprungen und
namentlich angezeigt. Startet die Oberfläche nicht, kann die Anwendung mit
`--startup-diagnostics` den inhaltsfreien Diagnoseordner ohne WebView öffnen.
Ein komplett vom Betriebssystem blockiertes Programm kann selbst keinen Bericht
erstellen; hierfür benötigt die IT die Betriebssystemmeldung. Schutzfunktionen
nicht deaktivieren. Weitere technische Evidenz und offene Geräteprüfungen stehen
in DS-109 / BL-010.52 und der kanonischen Evidence-Matrix.

Dieses Verzeichnis enthält die reale Tauri-2-Desktop-Hülle und ihren
plattformneutralen, maschinenprüfbaren Vertrag. Die Rust-Hülle, der native
Datei-/Ordnerdialog und der private DataSecure-Sidecar-Kanal wurden in getrennten
Engineering-Paketen für Windows x64, macOS Intel, macOS Apple Silicon und Linux
x64 glibc gebaut. Alle vier Pakete enthalten ihre gepinnte Runtime; die drei
POSIX-Ziele sind nativ bis durch App → private IPC → Core gestartet. Es ist
noch **kein freigegebenes Endnutzerprodukt**.

### Schnellere Prüfliste (07.10.2026, unveröffentlichter Quellstand)

Die lokale Prüfung zeigt eine Liste statt eines zwingenden Einzelwert-Assistenten.
Suchen Sie nach Wert oder Dokument und wählen Sie **Alle**, **Offen** oder
**Vorgemerkt**; OCR-Kontakte lassen sich zusätzlich nach E-Mail/Telefon filtern.
Links stehen Prüfliste und zentrale Sammelaktion, rechts ausschließlich der
Original-/Markdown-Vergleich. Es gibt keine zweite Entscheidungsleiste oder
doppelten Korrektureditor. Über Checkboxen wählen Sie eine oder mehrere Zeilen;
das Kopfkästchen wählt nur die sichtbare Seite. Auswahl allein bestätigt nichts. Ein
Filter- oder Seitenwechsel leert die Auswahl. Es werden bis zu 50 Zeilen pro
Seite gezeigt. Gleiche nachgewiesene Namen stehen gemeinsam in einer Zeile;
über den Wert und **Vorkommen im Vergleich** sehen Sie Originaltext und
Markdown-Vorschau jedes einzelnen Vorkommens.

OCR-Kontakte haben genau ein optionales Eingabefeld pro Zeile. Tippen aktualisiert
die Vorschau, trifft aber keine Entscheidung. Wählen Sie über der Liste eine
**Behandlung** und anschließend **Auf N Zeilen anwenden**. Damit werden die
ausgewählten Werte nur lokal **vorgemerkt**, noch nicht an den Worker übergeben.
Gleiche OCR-Lesarten
in verschiedenen Dokumenten können unterschiedliche echte Werte sein und werden
nicht blind gemeinsam korrigiert. Bewusst ausgewählte unveränderte Kontaktwerte
können gemeinsam bestätigt werden; unterschiedliche ausdrücklich eingegebene
Korrekturen können mit einer Sammelaktion übernommen werden. Alle ausgewählten
Eingaben werden vor der ersten Änderung geprüft. Eine fehlerhafte Eingabe stoppt
die gesamte Aktion und nennt Wert und Datei. Unverändert-Bestätigen verwirft keine
abweichende Eingabe. Kontaktstellen mehrerer Dokumente erscheinen
innerhalb der Größenlimits in derselben Gruppe; weitere Gruppen und die
Anonymisierungsprüfung folgen im selben Fenster.

Erst **Gruppe übergeben und weiter**
übergibt die vollständige Gruppe. Noch nicht übergebene Entscheidungen gehen bei
**Später entscheiden** oder Schließen verloren; bestätigte frühere Gruppen bleiben
gespeichert. **Rückgängig** stellt die gesamte vorherige Sammelaktion einschließlich
Korrektureingaben und Vorschau wieder her. Die zentrale Sammelaktions-Überarbeitung
ist im neuesten unten genannten lokalen Windows-Testbau enthalten; sie ist noch
nicht veröffentlicht.

Entwicklungsvorschau (kein Bestandteil ausgelieferter Apps):

```powershell
npm run preview:standalone:review
npm run test:standalone:preview
npm run test:standalone:review-browser
```

Der Vorschauprozess bindet ausschließlich `127.0.0.1`, bietet nur eine feste
Assetliste und erfundene Prüfdaten und muss nach Quelländerungen neu gestartet
werden. Optional lässt sich genau eine selbst ausgewählte HTML-Konzeptdatei mit
`-- --concept "C:\Pfad\Konzept.html"` bereitstellen. Andere Dateien oder Ordner
sind nicht erreichbar. Die Demo hat keine produktive Verarbeitung oder dauerhafte
Speicherung; sie belegt Layout/Interaktion, nicht native Paket- oder OCR-Qualität.

Separater lokaler Windows-Testbau vom 07.10.2026:
`dist/engineering-review-matrix-windows-20261007/` enthält erstmals die neue
Liste im nativen Paket. Das ZIP ist vollständig inventar-/hashgeprüft; reale
Paketverarbeitung einschließlich OCR-Kontaktkorrektur in beiden Zwecken,
Vertagen/Neustart, Folgegruppen und Fehlerdateinamen besteht. Nativer Start
von Haupt- und Prüfseite samt erfolgreicher privater IPC besteht ebenfalls;
dies ist noch keine menschliche Bedienabnahme. Das Paket bleibt ausdrücklich
Engineering und zeigt weiterhin `3.2.0-rc158`, nicht einen neuen Release.
Für den Anwender ist es separat unter
`Downloads/DataSecure-Windows-Test-Pruefliste-20261007/` entpackt; `TESTSTART.txt`
nennt Bedienhinweise und offene Grenzen. Main, Downloads auf GitHub und
macOS-Pakete wurden nicht verändert. `WINDOWS-TEST-EVIDENCE.json` neben dem
Engineering-ZIP bindet Archiv, EXE und geänderte UI-Quelldateien; der angegebene
Basiscommit allein ist ausdrücklich nicht der uncommittierte Gesamtstand.

Der neuere Testbau mit zentraler Behandlungsauswahl und explizitem Anwenden liegt
unter `dist/engineering-review-bulk-windows-20261007/` beziehungsweise separat in
`Downloads/DataSecure-Windows-Test-Sammelaktionen-20261007/`. Archiv-SHA-256:
`b032020e8d45996318b2f2aef2a059744ba69d64d6b6b3f5a3db59d1ce47b5ac`.
601 Einträge/110.446.310 Bytes; vollständige Inventarprüfung, isolierter echter
Paketworkflow und nativer Haupt-/Prüfseitenstart mit erfolgreicher IPC bestehen.
Die endgültigen UI-Dateien bestehen 33 Frontendfälle und echte Browserabläufe mit
synthetischer Sitzung einschließlich atomarer Sammelkorrektur, Undo und Reflow.
`TESTSTART.txt` und `WINDOWS-TEST-EVIDENCE.json` im neuen Downloadordner erklären
die Bedienung und Aussagegrenzen. Das ältere Testpaket bleibt unverändert.
Menschliche Bedienabnahme, neun Roh-OCR-Abweichungen und neue native Mac-Abnahme
bleiben offen; keine neue Release- oder Genauigkeitsfreigabe.

### OCR-Kontakte prüfen (06.10.2026, unveröffentlichter Quellstand)

Bei der Anonymisierung von Scan-PDFs und Bildern kann die vorhandene lokale
Prüfung zuerst fragen: **Wurde dieser Kontaktwert richtig erkannt?** Seite und
OCR-Zeile nennen die Position. Ein eindeutig zugeordneter Original-Rasterausschnitt
steht direkt daneben; bei PDF aus der lokal gerenderten Seite. Wenn Geometrie
oder Größenlimit keinen sicheren Ausschnitt erlauben, bittet die Oberfläche
ausdrücklich um Vergleich mit der Originaldatei. Sie können den Wert bestätigen oder die richtige
E-Mail-/Telefonschreibweise eingeben. In der Prüfliste heißen die zentralen Aktionen
**OCR unverändert bestätigen**, **Eingegebene Korrekturen übernehmen** und nach
vollständiger Vormerkung **Gruppe übergeben und weiter**.
Danach folgt im selben Fenster die normale
Anonymisierung beziehungsweise Personen-/Unternehmensprüfung. Kontakt bestätigen
bedeutet **nicht**, ihn unverändert im anonymisierten Ergebnis zu behalten.

**Später entscheiden** hält die Datei gesperrt; die Prüfung ist beim selben Lauf
fortsetzbar. Gespeicherte Kontaktentscheidungen werden nur auf genau dieselbe
Quelle und Extraktion dieses Laufs angewendet. Hat sich diese Bindung geändert,
nennt die App die betroffenen Dateien und verlangt einen neuen Lauf. Identische
OCR-Fehlschreibweisen werden nicht automatisch als derselbe echte Kontakt
behandelt. Mehr als 400 Kontaktstellen in einem einzelnen Dokument erfordern
Aufteilung; Korrekturen sind auf 256 Zeichen beschränkt. Originale bleiben
unverändert. **Nur in Markdown umwandeln** benötigt standardmäßig keine
Kontaktfreigabe und enthält den ursprünglichen OCR-Text mit Qualitätshinweisen.
Vor **Starten** kann zusätzlich **OCR-Kontaktwerte vor dem Markdown-Export lokal prüfen**
aktiviert werden. Dann lassen sich Kontaktstellen auch ohne Anonymisierung
korrigieren, verschieben und nach Neustart fortsetzen. Namen und andere
Originalinhalte bleiben erhalten; andere OCR-Zeilen werden dadurch nicht geprüft.
Die Bildausschnitte werden nicht mit exportiert und nicht an KI übergeben.

Diese Funktion ist lokal implementiert und technisch geprüft, noch nicht in
einem neuen Windows-/Mac-Releasepaket abgenommen. OCR kann auch unerkannte Fehler
enthalten; die Prüfung garantiert weder vollständige Erkennung noch rechtliche
Anonymität. Der [Reviewvertrag](../../docs/canonical/contracts/BATCH_REVIEW_V2.md)
trennt Standalone ausdrücklich von Coworks eigenem Reviewweg.

Tauri ist ausschließlich für Fenster, native Auswahl, Sidecar-Lifecycle und
die feste UI-Projektion zuständig. Formatprüfung, Konvertierung, PII-Erkennung,
Anonymisierung, Review, Recovery, Mapping und Export verbleiben vollständig im
gemeinsamen DataSecure-Core. Der Renderer zeigt ausgewählte Dateinamen sowie
Quellen- und Ergebnisordner ausschließlich lokal als Text an (DS-082). Er erhält
keine Rohtexte, Mappinginhalte, Tokens, Kommandozeilen, freien Fehlertexte oder
direkten Dateisystemzugriff; die lokale Pfadanzeige wird nicht protokolliert.

Dateien oder ein Ordner lassen sich nativ in das Fenster ziehen. Die vorhandenen
Auswahlbuttons bleiben als Tastatur-/Klickalternative erhalten. Beide Wege
zeigen erst die aufgenommene Auswahl. Einzelne Dateien können entfernt und die
gesamte Auswahl kann geleert werden; nur **Starten** verarbeitet sie. Neue Standalone-Stapel im Anonymisierungsmodus verwenden lesbare und bei Fortsetzung stabile
Kennungen wie `[PERSON_001]` und `[UNTERNEHMEN_001]`; vorhandene v1-Stapel bleiben
unverändert. Die Kennungen gelten nicht kundenübergreifend oder über neue Stapel.

DS-086: **Keine Verarbeitung ist vorausgewählt.** Auf der Startseite wählt der
Anwender ausdrücklich **Nur in Markdown umwandeln** oder die Anonymisierung.
Die reine Konvertierung (DS-085) folgt Auswahl oder Drag-and-drop, **Starten**
und bewusstem Öffnen der Ergebnisse. Unterstützt werden TXT, Markdown,
CSV, DOCX, XLSX, PPTX, Text-/Scan-PDF sowie PNG/JPEG/BMP. Konverter und lokale
DE/EN-OCR sind im Paket enthalten; keine zusätzliche Installation ist nötig.
Namen und Originalinhalte bleiben erhalten. `DataSecure-Markdown/Lauf-…` enthält
eine `.md` je erfolgreicher Quelle. Eine gewählte Unterordnerstruktur bleibt
im Ergebnis erhalten. Der ursprüngliche Basisname bleibt erhalten;
nur die Endung wird `.md`, bei Kollisionen folgt ` (2)`, ` (3)` usw. Eine
Zuordnungsdatei wird für reine Konvertierung nicht erzeugt. Unvollständige Extraktion wird ohne Review gespeichert
und ausdrücklich gekennzeichnet; gesperrte/defekte Dateien werden übersprungen.
Die Anonymisierung verarbeitet TXT/MD/CSV direkt. DOCX, XLSX/PPTX/PDF/Scan-PDF
und Bilder durchlaufen denselben lokalen Konverter genau einmal; jeder nichtleere,
vertraglich gültige Markdown-Inhalt wird anschließend an den Privacy-Core
weitergegeben. Bei DOCX bleibt die vollständige Strukturprüfung erhalten, aber
Kopf- und Fußzeilen sowie ausschließlich dort referenzierte Bilder werden nur
im Anonymisierungsmodus nicht ausgegeben. Die reine Konvertierung erhält sie.
PDF-/Scan-PDF-Seitenränder und PPTX-Mastertexte werden nicht heuristisch entfernt.
Ergebnis und Manifest weisen Extraktionsabdeckung und
Anonymisierungsstatus getrennt aus: `incomplete` bedeutet keine Zusage über den
gesamten Originalcontainer, nicht eine unvollständige Anonymisierung des
extrahierten Markdown-Inhalts. Leere OCR sowie beschädigte, verschlüsselte oder
aktive Quellen stoppen. Ein manueller Zweischritt ist dafür nicht erforderlich.
Bei Anonymisierung wählt der Anwender pro Stapel zwischen neutralen Dateinamen
(datensparender Standard, `Dokument-NNN-anonymisiert.md`) und dem ursprünglichen
Basisnamen mit `-anonymisiert.md`. Die Zuordnung nennt in beiden Fällen die
tatsächlich erzeugten relativen Pfade. Namen und Pfade bleiben lokal und werden
nicht diagnostisch protokolliert. Die Wahl wird vor Start gebunden und bleibt
bei Fortsetzung unverändert.

Für Menschen entsteht außerdem eine vertrauliche Identitäts-TXT im Unterordner
`VERTRAULICH-NICHT-HOCHLADEN` des jeweiligen Anonymisierungslaufs. Sie enthält
erkannte Originalwerte; private Einzelsnapshots bleiben im App-Datenbereich.
DataSecure löscht beides nicht automatisch und bietet keinen Löschbutton.
**Niemals den gesamten Laufordner an eine KI übergeben** – nur einzeln geprüfte
anonymisierte Markdown-Dateien.

Der Endnutzerablauf besitzt drei Hauptansichten: **Start**, **Verarbeiten** für
Auswahl, Start und Fortschritt sowie **Verlauf** für die 20 neuesten
Verarbeitungen. Ergebnis- und Fortsetzungsaktionen beziehen sich jeweils auf
genau den gewählten Lauf. **Zuordnung** ist nur bei anonymisierten Läufen aktiv.
Abschluss und Wiederherstellung wechseln
weder die Ansicht noch öffnen sie automatisch einen Ordner. Die Anzeigegrenze
löscht keine älteren Ergebnisse. Lokale Öffnen-Aktionen bestätigen nur die Übergabe an den
Dateimanager des Betriebssystems; diese Bestätigung erscheint getrennt vom
fachlichen Laufstatus. Die Zuordnungsaktion markiert unter Windows und macOS
die konkrete CSV-Datei, unter Linux öffnet sie deren Ordner.

Nach einem App-Neustart bleibt die aktuelle Prozesskarte bewusst leer und die
neue Auswahl sofort verfügbar. Fortsetzbare ältere Läufe werden nicht erneut
als aktueller Lauf geladen; sie stehen mit **Fortsetzen** in ihrer exakten
Verlaufszeile. Die lokale Startprüfung läuft dennoch kurz fail-closed, um
verwaiste Sperren oder unvollständige Exporte zu bereinigen. Nur ein tatsächlich
noch lebender Worker blockiert eine parallele zweite Verarbeitung.

Ist ein Office-Dokument noch in Word, Excel oder PowerPoint geöffnet, kann im
Quellordner eine `~$`-Besitzerdatei liegen. Die rekursive Aufnahme überspringt
sie nur, wenn Größe, fehlende OPC-Signatur und die passende größere
OPC-Quelldatei das Artefakt gemeinsam belegen, und zeigt nur deren Anzahl. Ein
echtes Office-Dokument wird nie allein wegen seines Namens verworfen; die
eigentliche Datei bleibt im Stapel. Eine direkte Auswahl einer belegten
Besitzerdatei wird verständlich abgewiesen.

Entwickler bauen und prüfen die Hülle mit:

```powershell
npm run test:standalone
npm run build:standalone:windows:portable
```

Die zusätzliche native OCR-Bedienkampagne wird mit
`node tests/manual/standalone-native-review-campaign.mjs --prepare-ocr <exaktes-ZIP>`
vorbereitet. Sie bleibt bis zu echter Bedienung `NOT_RUN`: Kontaktprüfung
vertagen, nach Neustart ausdrücklich andere synthetische Kontakte korrigieren,
im folgenden Entitätsreview erneut vertagen und nach drittem Start deren
Übernahme prüfen. Finale Körper-/Quellen-/Paketkontrollen sind Pflicht. Der
automatische Paket-Smoke prüft dieselbe tatsächliche OCR-/Privacy-Kette über
private IPC, ist aber keine Tauri-/WebView-Klickabnahme.

Für native POSIX-Engineeringnachweise existieren die manuellen GitHub-Workflows
**Manual Standalone macOS sandbox evidence** und **Manual Standalone Linux
sandbox evidence**. Sie laufen niemals bei Push oder Pull Request, sondern nur
nach ausdrücklicher Bestätigung möglicher Runner-Minuten. Die macOS-Zellen bauen
getrennt auf Intel und Apple Silicon; Linux x64 baut auf Ubuntu 22.04 mit glibc
2.35. Beide Gates prüfen Zielarchitektur, Runtime, POSIX-Supervisor,
Produkt-/Konverterverträge, Rust/Clippy, native Hülle und App→private IPC→Core.
Die Distributionspfade bauen ihr ZIP zweimal bytegleich und starten es nach dem
Entpacken erneut. Ein optionaler Paketupload gilt höchstens einen Tag. Diese
E0-Läufe ersetzen keine Finder-/Gatekeeper-/Linux-Dateimanager-, sichtbare
Picker-/Drop-, Screenreader- oder Anwender-UAT.

Der Build erzeugt die geschlossene Runtime-Projektion frisch aus dem aktuellen
Quellstand, bindet die herkunftsgeprüfte Node-Runtime und legt Manifest, SBOM,
Lizenzhinweise und SHA-256 bei. Anwender installieren weder Rust noch Node. Vor
einer Freigabe fehlt die sichtbare menschliche UAT auf Windows, macOS Intel,
macOS Apple Silicon und Linux x64; technische E0-Pakete ersetzen sie nicht.
Windows verwendet für den kleinen Pilot das vorhandene Microsoft Edge
WebView2-Systemruntime und lädt es nicht selbst nach.

Die erste formale N3/N4-Kampagne ist für eine Windows-x64-Person und eine
Mac-Person vorbereitet. Der gemeinsame Ablauf, die Kandidatenbindung und die
getrennten Evidence-Dateien stehen im
[`FORMAL_UAT`-Kit](../../docs/acceptance/FORMAL_UAT/README.md). Ein einzelner Mac
belegt nur seine tatsächliche Intel- oder ARM64-Architektur.

Sieben transportneutrale Core-Verträge für Start, Zweck, nächste Aktion,
Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und Fortschritt sind
in beiden Produktprojektionen gebunden. Breitere Format-/Profil-/Recovery-
Goldenabdeckung bleibt ein Refactoringziel. Standalone verwendet auf Windows,
macOS und Linux dieselbe integrierte Tauri-Prüfseite mit privater IPC, nicht
Coworks externen AppKit-/PowerShell-Adapter. Die vollständige sichtbare
Bedienabnahme auf beiden Mac-Architekturen bleibt getrennte Zielhostevidenz. Reine Markdown-Konvertierung
benötigt keinen PII-Sammelreview. Maßgeblich sind der
[aktuelle Stand](../../docs/canonical/CURRENT_STATE.md) und das
[kanonische Backlog](../../docs/canonical/BACKLOG.md).
