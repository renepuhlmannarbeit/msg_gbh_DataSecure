# DataSecure Standalone starten (Windows x64)

Anleitung für den lokalen Windows-Testkandidaten **3.2.0-rc160** und die neue
Oberfläche. Das lokal bereitgestellte RC160-ZIP vollständig entpacken und seine
beiliegende Prüfsumme vergleichen. Der veröffentlichte RC159 bleibt unverändert;
dieser Kandidat ist noch nicht online veröffentlicht. Es gibt keine abgeschlossene
menschliche Plattform-, Bedien- oder Barrierefreiheitsfreigabe.

## Verarbeitung und Prüfung

1. `DataSecure Standalone.exe` doppelklicken. Voraussetzung: Windows 10/11 x64
   mit vorhandenem Microsoft Edge WebView2. DataSecure lädt keine Runtime nach.
2. Unter **Neue Verarbeitung** die Aufgabe **Nur umwandeln** (Zweck:
   **Nur in Markdown umwandeln**) oder **Umwandeln und anonymisieren** wählen.
   Anfangs ist keine Aufgabe vorbelegt; Auswahl allein verarbeitet nichts.
   Für beide Aufgaben ist **Text aus Scans, Bildern und Grafiken per OCR lesen**
   zunächst aus. Anhaken, wenn auch Rastertext übernommen werden soll. Ohne
   Häkchen liest die App nur vorhandenen Text; reine Scans und Bilddateien
   erhalten einen benannten Hinweis statt eines leeren Ergebnisses.
   Bei **Nur umwandeln** ist **Erkannte OCR-Kontaktwerte anhand des Originalbilds prüfen**
   eine getrennte, anfangs ausgeschaltete Wahl, kein Schalter für die Texterkennung.
   Mit Häkchen stoppt der Lauf bei erkannten E-Mail-/Telefonwerten, auch wenn
   sie plausibel aussehen. Die Anzahl ist vorher unbekannt: 16 betroffene
   Dokumente können beispielsweise 97 einzelne Werte enthalten. Diese
   Wahl ist vor dem Start freiwillig. Beim Weg **Nur umwandeln** kannst du
   die offene Kontaktprüfung später auch direkt am Lauf ausdrücklich
   **überspringen**; dann werden die Kontaktwerte nicht als geprüft
   bestätigt und mögliche OCR-Lesefehler bleiben in den Markdown-Dateien.
   Bereits ausdrücklich bestätigte oder korrigierte Dokumentantworten bleiben
   wirksam; nur die noch unbeantworteten Kontakte bleiben ungeprüft.
   Andernfalls sind Entscheidungen zu allen gefundenen Kontaktwerten nötig,
   damit dieser Prüfschritt abgeschlossen wird. Beim Anonymisierungsweg darf
   eine erforderliche Fundstellenprüfung nicht auf diese Weise umgangen werden.
   Die Anonymisierung verlangt unabhängig von dieser optionalen OCR-Kontaktwahl
   eine Fundstellenprüfung, danach Dokumentfreigabe und einen gesonderten KI-Export.
   Die Kontaktprüfung bestätigt ohnehin keine übrigen OCR-Zeilen. Mit oder
   ohne das zweite Häkchen ist später eine freiwillige Markdown-Nachkorrektur
   möglich; sie ist keine zweite OCR-Pflichtprüfung.
3. Dateien oder einen Ordner hinzufügen, gewünschte Dateien anhaken und das
   Ergebnisziel kontrollieren. Unterordner werden berücksichtigt. Der Katalog
   kann mehr Dateien enthalten; pro Verarbeitung höchstens 200 Dateien / 500 MB
   auswählen. Weitere Dateien lassen sich vor dem Start ergänzen.
4. **Verarbeitung starten** wählen (in früheren Versionen **Starten**).
   Die Laufkarte zeigt Fortschritt, laufende Arbeit und Dateiprobleme.
   **Pausieren** stellt die aktuelle Datei einschließlich Bereitstellung fertig;
   danach beginnt keine weitere Datei. **Verarbeitung fortsetzen** setzt diesen
   Lauf fort. Neue Eingaben gehören in eine **Neue Verarbeitung**.
   Bei **Nur umwandeln** ist danach **Ergebnisordner öffnen** der normale nächste
   Schritt. **Lauf abgeschlossen mit Hinweisen** bedeutet beispielsweise:
   Markdown-Dateien wurden erstellt, reine Bild-/Scan-Dateien wegen ausgeschalteter
   OCR nicht umgewandelt. **Hinweise ansehen** nennt diese Dateien mit Endung.
   Das ist kein technischer Konvertierungsfehler; falls du ihren Text ebenfalls
   benötigst, einen neuen Lauf mit OCR vorbereiten. Echte Dateifehler werden
   gesondert angezeigt. Inhaltshinweise zu bereits erstellten Dateien, etwa nicht
   bestätigte Vollständigkeit, stehen in einer eigenen aufklappbaren Liste.
   Für vorhandene reine Markdown-Ergebnisse ist keine menschliche Freigabe nötig.
   Die folgenden Schritte 5–7 beschreiben erforderliche Prüfungen, soweit gewählt,
   und insbesondere den Anonymisierungsweg, nicht zusätzliche Pflichtschritte
   für einen abgeschlossenen Markdown-Lauf.
5. Bei **Jetzt prüfen** die Fundstellenprüfung direkt am Lauf öffnen.
   Die sichtbaren Schritte sind **1. Werte auswählen**, **2. Behandlung wählen
   und anwenden** und **3. Entscheidungen speichern**. Checkboxen wählen nur
   aus. **Alle gefilterten Zeilen auswählen** gilt auch für weitere Listenseiten;
   die Checkbox im Tabellenkopf gilt nur für die aktuelle Seite. **Anwenden**
   merkt Entscheidungen zunächst vor; erst der Abschlussknopf speichert die
   vollständig bearbeitete Gruppe. Offen-Filter, weitere Seiten und Folgegruppen
   beachten. Es wird nichts automatisch bestätigt.
   Der Original-/Markdown-Vergleich gehört jeweils zum angezeigten Punkt.
   OCR-Kontaktwerte mit den Originalbildpixeln vergleichen. **Als Person**,
   **Als Unternehmen** und **Beibehalten** sind unterschiedliche Entscheidungen;
   nachweislich gleiche vollständige Werte gelten für den betreffenden Lauf.
   Bei **Nur umwandeln** kehrst du nach bestätigtem Abschluss der gewählten
   Kontaktprüfung zur Laufseite beziehungsweise zum Verlauf zurück, von dem
   aus du sie geöffnet hast. Es wird keine zweite Prüfseite automatisch
   geöffnet. **Ergebnisordner öffnen** bleibt der normale nächste Schritt;
   der Text ist weiterhin nicht anonymisiert.
6. Nach Abschluss aller Fundstellengruppen öffnet sich bei Anonymisierung die
   Dokumentprüfung **desselben Laufs**. Das ist noch kein KI-Export:
   Originaltext und geplantes Markdown vergleichen, gewünschte Dokumente
   auswählen und **Auswahl freigeben** wählen. Änderungen heben betroffene
   Freigaben auf. Über **Ergebnisse prüfen und freigeben** im Verlauf lässt
   sich die Dokumentprüfung später wieder öffnen.
7. **Auswahl für KI exportieren** wählen und den angezeigten Auftrag
   ausdrücklich bestätigen. Nur freigegebene aktuelle Markdown-Stände werden
   in einen **normalen separaten Ordner** kopiert. Originale, Identitäts- und
   Dateizuordnung, private Prüfstände und technische Begleitdateien sind nicht
   enthalten. Der technische Laufordner ist nicht dieser KI-Exportordner.

**Später entscheiden** verschiebt die Prüfung des konkreten Laufs. Noch nicht
übergebene Eingaben sind nicht gespeichert. Der **Verlauf** enthält höchstens
20 Verarbeitungen mit jeweils eigenen Aktionen; Fortsetzen oder Prüfen wählt
keinen anderen Lauf. Nach Verbindungsverlust werden Starts, Entscheidungen und
Exportbestätigungen nicht blind wiederholt. Den gespeicherten Stand bewusst
neu laden und die angezeigte Wiederherstellung abwarten.

Bei reiner Umwandlung bleiben Originalinhalte erhalten: **Markdown nachkorrigieren**
bietet die nachträgliche Korrektur. Ein Markdown-Export ist ausdrücklich
**nicht anonymisiert**. Die bereits erzeugten Markdown-Dateien musst du nicht
nochmals freigeben. Die Nachkorrektur ist freiwillig. Zum Vergleichen und
Korrigieren den **Dateinamen anklicken**; die **Häkchen wählen nur Dateien
für eine zusätzliche Kopie** und öffnen keinen Vergleich. Die Dateiliste zeigt
zuerst nur erstellte Markdown-Dateien mit Inhaltshinweisen; über **Dateien
anzeigen** kannst du **Nachbearbeitet**, **Alle Dateien** oder **Ohne Hinweise**
wählen. Eine Datei ohne Hinweis ist nicht automatisch inhaltlich oder per OCR
fehlerfrei. **OCR-Text nicht vollständig fachlich geprüft** bedeutet, dass
eine Kontaktprüfung nur erkannte E-Mail-/Telefonwerte kontrolliert, nicht die
übrigen Wörter, Zahlen oder Lesereihenfolge. Dieser Hinweis verschwindet durch
Kontaktbestätigung oder eine gespeicherte Textkorrektur nicht automatisch.
Nicht umgewandelte Dateien haben keinen Textstand zum Korrigieren
und werden separat mit Grund angezeigt. **Korrektur speichern** hält den
geänderten Text zunächst nur als privaten, wieder aufrufbaren Stand fest; die
ursprünglich erzeugte Markdown-Datei bleibt unverändert. **Korrektur
gespeichert** bezeichnet den aktuell vom erzeugten Text abweichenden Stand,
auch nach einem Neustart. Der Inhaltshinweis bleibt bestehen, weil eine
manuelle Textänderung dessen Ursache nicht automatisch widerlegt. Für eine
verwendbare zusätzliche Kopie die gewünschten Dateien anhaken,
**Zusätzliche Markdown-Kopie speichern** wählen und
**Kopie speichern** bestätigen. Eine Vorschau oder **Abbrechen** erstellt keine
Kopie und bestätigt keinen Textstand. Ungespeicherte Korrekturen zuerst speichern
oder verwerfen. Bei verlorener Speicherbestätigung wird keine Teilkopie gestartet;
bereits bestätigte Stände können erhalten bleiben. Den angezeigten Stand neu laden.
Fundstellenbestätigung und Pflichtfreigabe bleiben im Anonymisierungsweg getrennt;
eine technische Erfolgsmeldung ersetzt keine Inhaltsprüfung.
**Nachkorrekturen und Kopien** zeigt nur optionale Prüfungen und zusätzliche
gespeicherte Kopien. Die dortigen Zähler zählen nicht die ursprünglichen Dateien
im Ergebnisordner. Eine noch offene Kopierbestätigung bleibt ausdrücklich sichtbar
und muss vor einem erneuten Kopierauftrag abgeglichen werden.

Nach bestätigtem Start bleibst du auf der Laufseite. Der erfolgreiche Abschluss
ist grün und nennt erstellte Dateien, OCR-aus-Auslassungen und technische Fehler
getrennt. **Ergebnisordner öffnen** steht direkt unter dem Status.
**Weitere Aktionen** und **Hinweise zu diesem Lauf** sind zunächst geschlossen.
Die optionale Nachkorrektur zeigt Laden sichtbar; Hinweise sind nach Ursache
gruppiert, jede Datei lässt sich einzeln öffnen. OCR-aus-Hinweise sind gelb,
technische Fehler rot. Ein unbestätigter Ergebnisordner bleibt als Hinweis
sichtbar, bis genau dieser Lauf seine Bereitstellung bestätigt.

## Ergebnisse, Formate und Fehler

TXT, Markdown, CSV, DOCX, XLSX, PPTX, PDF, Scan-PDF und PNG/JPEG/BMP werden
lokal verarbeitet. Breite Formate werden zuerst extrahiert; anonymisiert wird
der extrahierte Markdown-Inhalt, nicht der ursprüngliche Container. OCR und
komplexe Layouts können Lesefehler oder Auslassungen verursachen. Im synthetischen
Qualitätskorpus bleiben neun rohe OCR-E-Mail-Abweichungen als bekannte Warnung.

Technische Ergebnisse liegen unter `DataSecure-Markdown/Lauf-…` beziehungsweise
`DataSecure-Output/Lauf-…`. Anonymisierung nutzt neutrale Ergebnisnamen.
Die lokale `DataSecure-Zuordnung.csv` und
`VERTRAULICH-NICHT-HOCHLADEN` enthalten Originalangaben. **Nie den gesamten
Laufordner an eine KI geben.** Stattdessen den getrennten freigegebenen
KI-Export verwenden. Die Identitätszuordnung wird nicht automatisch gelöscht.
Reine Markdown-Konvertierung erzeugt keine Dateizuordnung.
Auch nach „Markdown nachkorrigieren“ behalten neue Kopien den ursprünglichen
Basisnamen mit `.md`; bei Kollisionen gibt es eindeutige Zusätze. Dieser Weg
maskiert weder Inhalt noch Dateinamen. Ältere gespeicherte Exportaufträge
behalten ihre damaligen Namen. Neue reine Umwandlungen enthalten Text und
Tabellen ohne aktive Bilder, Bildverweise und technische OCR-Absätze. Erkannter
Bild-/Scantext wird bei gewählter OCR übernommen; Unsicherheits-/Auslassungshinweise
stehen in der App, nicht als künstlicher Nutztext im Markdown. Inhaltliche
Unicodezeichen wie Umlaute, §, Währung und Mathematik bleiben erhalten.
Eingebettete Office-Bilder können als PNG/JPEG/BMP lokal gelesen werden;
andere Bildtypen erhalten bei gewählter OCR einen konkreten Hinweis. Externe
oder relative Markdown-Bildziele werden nicht automatisch geladen: gewünschte
Bilddateien separat auswählen. Neue Optionen ändern ältere Läufe nicht.

Nicht unterstützte Eingaben und verarbeitungsbezogene Probleme werden lokal
mit Dateinamen einschließlich Endung, festem Fehlercode und nächstem Schritt
angezeigt. Passwortgeschützte Dateien müssen außerhalb der App entschlüsselt
werden; es gibt kein Quellenpasswortfeld. Sichere Ergebnisse anderer Dateien
dürfen nicht mit einem vollständigen Laufabschluss verwechselt werden.
Fehlen private Laufdetails später, können einzelne Dateinamen nicht mehr
rekonstruiert werden; Diagnoseprotokolle enthalten bewusst keine Namen,
Quellpfade oder Dokumentinhalte.

## Startprobleme und Testgrenzen

Node.js, Rust, Claude, Cowork und Internetzugang sind nicht erforderlich.
Originaldateien werden niemals verändert oder automatisch gelöscht.

Wenn die Oberfläche nicht startet, versucht DataSecure einen inhaltsfreien
Startbericht anzulegen. In `cmd` im entpackten App-Ordner
`"DataSecure Standalone.exe" --startup-diagnostics` ausführen. Wenn Windows
bereits den Prozessstart blockiert, kann die App keinen Bericht schreiben.
Betriebssystemmeldung und Prüfsumme mit der IT prüfen; Schutzfunktionen nicht
pauschal deaktivieren. Das Testpaket besitzt keine Windows-Codesignatur.

Native technische Runner-Prüfungen ersetzen nicht die Bedienung auf deinem
Gerät. Für formale Nachweise den
[N3/N4-Testplan](../../docs/acceptance/FORMAL_UAT/README.md) verwenden.
Der frühere bestätigte RC157-Anwenderlauf bleibt historische Evidenz seines
damaligen Pakets und ist keine neue RC160-Abnahme.
