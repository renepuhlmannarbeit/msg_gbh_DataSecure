# DataSecure Standalone starten (Windows x64)

Anleitung für das beiliegende Windows-x64-Testpaket. Die genaue Version und
Build-ID stehen im App-Fuß und in `STANDALONE-MANIFEST.json`; diese Anleitung
ist kein Nachweis für ein anderes oder bereits veröffentlichtes Paket.
Das ZIP vollständig entpacken und seine beiliegende Prüfsumme vergleichen.
Im neuen Paket heißt der enthaltene Programmordner kurz `DataSecure`. Alle
seine Dateien zusammenlassen; nicht nur die EXE herauskopieren. In einen neuen,
möglichst kurzen lokalen Zielordner entpacken, nicht über eine ältere Version.
Die früheren Releases bleiben unverändert.
Es gibt keine abgeschlossene
menschliche Plattform-, Bedien- oder Barrierefreiheitsfreigabe.

## Verarbeitung und Prüfung

**Orientierung:** Unter **Neue Verarbeitung** stellst du einen neuen Auftrag
zusammen. **Verlauf** ist die kompakte Liste deiner bisherigen Läufe. Nach
dem Start oder Öffnen eines Laufs erscheint zusätzlich **Laufdetails** mit
seiner Laufkennung. Dort gehören Fortschritt, Prüfung, Dokumente und Abschluss
zu genau diesem Lauf. Ein Reiterwechsel startet oder bestätigt nichts.
Ausführliche Erklärungen lassen sich aufklappen; der Abschlussstatus bleibt
sichtbar. Der Ergebnisordner und vorhandene Hinweise sind direkt erreichbar.
Nach einem gestarteten Lauf ist dessen Dateiauswahl verbraucht; **Neue Verarbeitung**
beginnt wieder ohne diese Dateien. Eine neu vorbereitete, noch nicht gestartete
Auswahl bleibt beim bloßen Reiterwechsel erhalten.

Abgeschlossene Läufe lassen sich über **Weitere Aktionen → Aus Verlauf ausblenden**
aus der normalen Liste entfernen. Das löscht keine Dateien, Ergebnisse oder
Zuordnungen. **Ausgeblendete Läufe anzeigen** macht sie wieder erreichbar. Offene
Vorgänge und einige Alteinträge ohne ausreichende Laufmetadaten sind geschützt.
Die Sicherheitsprüfung für Wiederaufnahme und Aufbewahrung bleibt beim Start
aktiv; die App öffnet dabei nicht automatisch die vollständige Verlaufsliste.

1. `DataSecure Standalone.exe` doppelklicken. Voraussetzung: Windows 10/11 x64
   mit vorhandenem Microsoft Edge WebView2. DataSecure lädt keine Runtime nach.
2. Unter **Neue Verarbeitung** die Aufgabe **Nur umwandeln** (Zweck:
   **Nur in Markdown umwandeln**) oder **Umwandeln und anonymisieren** wählen.
   Anfangs ist keine Aufgabe vorbelegt; Auswahl allein verarbeitet nichts.
   Für beide Aufgaben ist **Text aus Bildern und Scans lesen (OCR)**
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
   Bei geführter Anonymisierung folgt die erforderliche Fundstellenprüfung,
   danach die technische Ergebnisbereitstellung ohne weitere Exportbestätigung. Alternativ kannst du vor
   dem Start die unten erläuterte Auswahl **Automatisch maskieren** wählen.
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
   Die sichtbaren Schritte sind **1. Werte auswählen**, **2. Entscheidung wählen**
   und **3. Entscheidungen speichern**. Checkboxen wählen nur
   aus. **Alle gefilterten Zeilen auswählen** gilt auch für weitere Listenseiten;
   die Checkbox im Tabellenkopf gilt nur für die aktuelle Seite. **Auf Auswahl anwenden**
   merkt Entscheidungen zunächst vor; erst **Entscheidungen speichern und fortfahren**
   speichert die vollständig bearbeitete Gruppe. Die Anzahl steht vor dem Buttontext;
   bei OCR lautet er **OCR-Entscheidungen speichern und fortfahren**.
   Offen-Filter, weitere Seiten und Folgegruppen
   beachten. Im geführten Weg wird hier nichts automatisch bestätigt.
   Der Original-/Markdown-Vergleich gehört jeweils zum angezeigten Punkt.
   OCR-Kontaktwerte mit den Originalbildpixeln vergleichen. **Als Person**,
   **Als Unternehmen** und **Beibehalten** sind unterschiedliche Entscheidungen;
   nachweislich gleiche vollständige Werte gelten für den betreffenden Lauf.
   Bei **Nur umwandeln** kehrst du nach bestätigtem Abschluss der gewählten
   Kontaktprüfung zur Übersicht desselben Laufs unter **Laufdetails** zurück.
   Es wird keine zweite Prüfseite automatisch
   geöffnet. **Ergebnisordner öffnen** bleibt der normale nächste Schritt;
   der Text ist weiterhin nicht anonymisiert.
6. Nach bestätigtem Abschluss aller erforderlichen Gruppen kehrst du zu den
   **Laufdetails desselben Laufs** zurück. Die gewählten Maskierungen sind
   bereits angewendet. Erst wenn die technische Bereitstellung bestätigt ist,
   sind die Dateien fertig. Es gibt keine zweite Dokumentauswahl, Pflichtfreigabe
   oder Exportbestätigung.
7. **Ergebnisordner öffnen** führt zu den fertigen Dateien. Diese kannst du im
   Dateimanager selbst auswählen und auch ohne KI verwenden. Die neuen fertigen
   Anonymisierungsstände des neuen `/3`-Layouts enthalten neben den Markdown-
   Dateien den Unterordner **Vertraulich** mit **Dateizuordnung.csv**
   (Originaldateiname → tatsächlicher Ergebnisname),
   **Pseudonym-Zuordnung.txt** und **Pseudonym-Zuordnung.xlsx** (belegte Personen,
   Unternehmen/Organisationen und Projekte des jeweiligen Standes). Die Excel-
   Datei zeigt im ersten Blatt **Zuordnungen** dieselben Zuordnungen wie die TXT:
   **Pseudonym**, **Typ**, **Originalwert(e)**, **Vorkommen** und **Datei**.
   Eine Zeile entspricht einer TXT-Zuordnung; Vorkommen ist deren gesamte Anzahl,
   nicht eine zusätzliche Zählung je Schreibvariante. Gleichlautende Pseudonyme
   aus verschiedenen Dateien werden nicht zusammengezogen. Technischer Kontext
   steht dahinter in **Übersicht**; die ergänzenden Dokumentblätter behalten
   **Typ**, **Basiswert** und **Endwert**. Vorhandene alte Excel-Dateien bleiben
   unverändert; erst neue Läufe oder bewusst gespeicherte neue Korrekturstände
   erhalten das neue erste Blatt.
   Keine weitere Aktion ist nötig. Nachbearbeitungen erhalten eigene,
   passende Zuordnungen. Ältere `/1`- und `/2`-Läufe behalten ihre bisherigen Zuordnungen;
   ihre Ordner werden nicht nachträglich verändert. Reine Konvertierung erzeugt
   keine Zuordnungen. Originaldateien und private Prüfstände werden nicht kopiert.
   Betriebssysteme können zusätzliche Anzeige-Metadaten wie `.DS_Store`
   hinzufügen. Diese sind nicht geprüft oder anonymisiert: nur die gewünschten
   Markdown-Dateien weitergeben, nicht ungeprüft den gesamten Ordner verpacken.
   Nach bestätigter Bereitstellung sind die Ergebnisdateien deine Arbeitskopien:
   Du darfst sie außerhalb der App manuell bearbeiten. Der normale Ordneröffner
   prüft dann nur die sichere Erreichbarkeit des gebundenen Ordners, nicht erneut
   die Hashes oder das Inventar seiner Dateien. Manuelle Änderungen werden nicht
   in private Prüfstände übernommen. Eine neue App-Nachbearbeitung erstellt aus
   ihrem privaten Basisstand einen neuen Ordner und überschreibt deine Arbeitskopie
   nicht. Die Zuordnungen beschreiben den von DataSecure bereitgestellten Stand,
   nicht spätere externe Änderungen. Fehlende oder ausgetauschte Ordner werden
   nicht repariert oder neu angelegt. Private Belege und offene Schreib-/
   Bestätigungstransaktionen werden weiterhin streng geprüft.
   Bei alten Läufen können solche
   Beilagen weiterhin vorhanden sein; alte Ordner werden nicht bereinigt.
   DataSecure lädt nichts hoch. Eine technische Prüfung garantiert weder
   vollständige Anonymität noch fachliche Fehlerfreiheit.

Der bereits gespeicherte Ergebnisordner wird angezeigt und ohne neuen Picker
verwendet, sofern ursprüngliche Identität und tatsächlicher Zugriff passen.
Ein ersetzter, fehlender oder verweigerter Ordner benötigt eine neue bewusste
Wahl für neue Läufe; alte Ergebnisstände werden dabei nicht verschoben oder
stillschweigend unter einem anderen Ziel wiederhergestellt.

**Später entscheiden** verschiebt die Prüfung des konkreten Laufs. Noch nicht
übergebene Eingaben sind nicht gespeichert. Der **Verlauf** enthält höchstens
5 Verarbeitungen mit jeweils eigenen Aktionen; Fortsetzen oder Prüfen wählt
keinen anderen Lauf. Nach Verbindungsverlust werden Starts, Entscheidungen und
Exportbestätigungen nicht blind wiederholt. Den gespeicherten Stand bewusst
neu laden und die angezeigte Wiederherstellung abwarten.

Bei reiner Umwandlung bleiben Originalinhalte erhalten: **Markdown nachkorrigieren**
bietet die nachträgliche Korrektur. Ein Markdown-Export ist ausdrücklich
**nicht anonymisiert**. Die bereits erzeugten Markdown-Dateien musst du nicht
nochmals freigeben. Die Nachkorrektur ist freiwillig. Zum Vergleichen und
Korrigieren den **Dateinamen anklicken**. Die Dateiliste zeigt
zuerst nur erstellte Markdown-Dateien mit Inhaltshinweisen; über **Dateien
anzeigen** kannst du **Nachbearbeitet**, **Alle Dateien** oder **Ohne Hinweise**
wählen. Eine Datei ohne Hinweis ist nicht automatisch inhaltlich oder per OCR
fehlerfrei. **OCR-Text nicht vollständig fachlich geprüft** bedeutet, dass
eine Kontaktprüfung nur erkannte E-Mail-/Telefonwerte kontrolliert, nicht die
übrigen Wörter, Zahlen oder Lesereihenfolge. Dieser Hinweis verschwindet durch
Kontaktbestätigung oder eine gespeicherte Textkorrektur nicht automatisch.
Nicht umgewandelte Dateien haben keinen Textstand zum Korrigieren
und werden separat mit Grund angezeigt. **Korrektur speichern** sichert die
Revision und stellt den vollständigen aktuellen Ergebnisstand automatisch bereit.
Erst nach Bestätigung gilt die sichtbare Ergebnisdatei als aktualisiert.
Der Ordneröffner führt auf den bestätigten neuen Stand; ältere Stände bleiben
erhalten. Bei einem Fehler kann die Revision privat gespeichert sein, während
die Bereitstellung noch unbestätigt ist. Den konkreten Vorgang abgleichen,
nicht blind neu speichern oder verarbeiten. Außerhalb der App veränderte oder
gelöschte Ergebnisse werden nicht ungefragt überschrieben oder wiederangelegt.
Inhaltshinweise verschwinden durch eine manuelle Korrektur nicht automatisch.
Historische zusätzliche Kopien bleiben unter den ausführlichen Laufdetails
erreichbar und werden nicht als heutige Ergebnisstände umgedeutet.

Nach bestätigtem Start bleibst du auf der Laufseite. Der erfolgreiche Abschluss
ist grün und nennt erstellte Dateien, OCR-aus-Auslassungen und technische Fehler
getrennt. **Ergebnisordner öffnen** steht direkt unter dem Status.
Ausführliche Laufdetails, **Weitere Aktionen** und **Hinweise zu diesem Lauf**
sind zunächst geschlossen. Neue Anonymisierungsstände enthalten beide
vertraulichen Zuordnungen direkt unter **Vertraulich** im Ergebnisordner;
ein zusätzlicher Zuordnungsbutton ist nicht erforderlich. Nur historische Läufe
können getrennte optionale Zuordnungsaktionen besitzen. Die vertraulichen Dateien
nicht zusammen mit den anonymisierten Markdown-Dateien weitergeben.
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
`DataSecure-Output/Lauf-…`. Anonymisierung nutzt standardmäßig neutrale Ergebnisnamen.
Vor einem neuen Lauf kannst du stattdessen **Originalname mit „-anonymisiert“**
wählen. Dateinamen können personenbezogene Angaben enthalten; diese Wahl ist
daher keine Anonymisierung der Namen. Sie gilt nur für die Ergebnisdateien
dieses Laufs. Neue nachbearbeitete Anonymisierungsstände erhalten neutrale Namen.
Vertrauliche Datei-/Identitätszuordnungen liegen getrennt von den Markdown-
Dateien unter `Vertraulich/Dateizuordnung.csv`, `Vertraulich/Pseudonym-Zuordnung.txt`
und `Vertraulich/Pseudonym-Zuordnung.xlsx` im neuen anonymisierten Ergebnisstand.
**Vertraulich enthält Originalangaben: nicht weitergeben oder hochladen.**
Alle drei Dateien sind ohne zusätzliche Aktion vorhanden, auch im neuen vollständigen
Stand nach einer gespeicherten Nachbearbeitung. In älteren Laufordnern
können `DataSecure-Zuordnung.csv` und `VERTRAULICH-NICHT-HOCHLADEN` weiterhin
Originalangaben enthalten; diese alten Ordner nicht pauschal weitergeben.
Die Identitätszuordnung wird nicht automatisch gelöscht.
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

Meldet die geöffnete App einen unsicheren **internen App-Datenordner**, ist
damit nicht dein Ergebnisordner gemeint. Bei der ersten Verwendung legt der
native Windows-Host seinen fehlenden privaten Datenbereich mit eigenen
Zugriffsrechten an. Vorhandene Datenordner und Berechtigungen werden niemals
automatisch repariert oder gelöscht. Bei einer Ablehnung **Diagnosepaket
speichern** und den Zugriff mit der IT prüfen; keine Sperrdateien entfernen.
Dateiauswahl und Verarbeitung bleiben bis dahin gesperrt. Automatische
Startversuche sind nach einem solchen Startfehler angehalten. **Verbindung
und Laufstatus prüfen** erlaubt einen ausdrücklichen neuen Verbindungsversuch,
startet aber keinen früheren Lauf oder Export erneut.

Native technische Runner-Prüfungen ersetzen nicht die Bedienung auf deinem
Gerät. Für formale Nachweise den
[N3/N4-Testplan](../../docs/acceptance/FORMAL_UAT/README.md) verwenden.
Der frühere bestätigte RC157-Anwenderlauf bleibt historische Evidenz seines
damaligen Pakets und ist keine Abnahme dieses Pakets.

## Umgang mit unklaren Fundstellen und klarer Abschluss

**Selbst entscheiden** ist vor einem neuen Anonymisierungslauf vorausgewählt:
Die App anonymisiert automatisch und fragt bei unklaren Fundstellen nach.
Alternativ **Automatisch maskieren** (bisher Schnellweg: automatisch anonymisieren und freigeben)
ausdrücklich wählen. Bekannte unklare Stellen und
erkannte OCR-Kontaktbereiche werden automatisch maskiert, nicht als richtig
erkannt bestätigt. Die unveränderten erstellten Basisstände erhalten eine
gekennzeichnete automatische Erstfreigabe, keine menschliche Prüfung.
Nicht lesbare oder technisch nicht sicher prüfbare Dateien werden mit Grund
ausgelassen. Eine spätere Änderung oder ein Widerruf hebt die betroffene
Freigabe auf; sie wird nicht beim nächsten Laden automatisch wieder erteilt.
Fertige Ergebnisdateien benötigen im neuen Ablauf keinen zusätzlichen Exportauftrag.
Die separate Option **Text aus Bildern und Scans lesen (OCR)** gilt für beide
Abläufe und wird dadurch nicht eingeschaltet. Alle vier Kombinationen sind
möglich; die technischen Schutzprüfungen bleiben erhalten.
Die Datei- und Ordnerlabels nennen bekannten OCR-Bedarf einschließlich
Unterordnern, auch wenn diese zugeklappt oder Dateien abgewählt sind.
Bei Markdown-Konvertierung stehen optionale Kopierbelege ausschließlich in
**Ausführliche Laufdetails**; **Kopierstatus aktualisieren** liest diese erneut,
**Nachkorrektur öffnen (optional)** öffnet dagegen die Textbearbeitung.

**Lauf abgeschlossen – mit Hinweisen** ist ein abgeschlossener technischer
Lauf, kein weiter laufender Prüfschritt. Hinweise und ausgelassene Dateien
bleiben gelb sichtbar. Sobald die technische Bereitstellung bestätigt ist,
führt **Ergebnisordner öffnen** zum fertigen Stand. Eine optionale gespeicherte
Korrektur erzeugt einen neuen vollständigen Stand, nicht eine neue Pflichtfreigabe.
Ein alter **Export abgeschlossen**-Beleg beschreibt nur die damalige zusätzliche
Kopie; er ist kein Nachweis für heute nachbearbeitete Dateien. Kein Schritt lädt
automatisch Daten ins Internet hoch.

## Freiwillige Nachbearbeitung

Im fertigen Anonymisierungslauf **Nachbearbeitung öffnen (optional)** wählen
und links eine Datei öffnen. Rechts steht der aktuelle Ergebnistext. Dort die
zusätzlich sensible Stelle vollständig markieren; Vorschau und Sperrgrund
stehen direkt darunter. **Maskierung speichern** ersetzt genau diese Stelle
und stellt anschließend den vollständigen neuen Ergebnisstand bereit.
Eine Markierung nur im linken Original ist kein Maskierungsauftrag.

Unter **Behandlung erkannter Stellen ändern (optional)** erkannte Werte anhaken,
die gewünschte Behandlung bewusst wählen und **Gewählte Behandlung speichern**
klicken. Anfangs gilt **Nur diese Datei**. Laufweite Behandlung ist nur für
belegte gleiche Identitäten möglich. Fundstellenseiten wechseln speichert
nichts; die Auswahl bleibt erhalten. Vor Dateiwechsel oder Neuladen den
Entwurf speichern oder ausdrücklich verwerfen. Eine fehlende Speicher- oder
Bereitstellungsbestätigung zuerst abgleichen, nicht blind erneut klicken.
Originaldateien und frühere Ergebnisstände bleiben unverändert. Keine zweite
Dateiauswahl, Dokumentfreigabe oder Exportbestätigung ist nötig.

Bei Problemen unter **Einstellungen** oder in der Fehlerhilfe
**Diagnosepaket speichern** wählen; diese Funktion ist ohne Core-Verbindung
verfügbar. Sie ist kein notwendiger Export- oder Abschlussschritt. Sie speichert eine
neue lokale JSON-Datei, keine Dokumentinhalte oder Quellpfade. Fehlende,
gekürzte oder verworfene Ereignisse werden gekennzeichnet. Die Diagnose ist
bestmöglich, aber kein lückenloses Auditprotokoll und keine Exportbestätigung.
