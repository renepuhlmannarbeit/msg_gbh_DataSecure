# Standalone: Migration auf den klickbaren Prototyp v2

Stand: 2026-10-08. Referenz: `codex_auftrag_datasecure/ARBEITSAUFTRAG.md`,
Design-Tokens und klickbarer Prototyp. Einzige Arbeitsliste: BL-010.53.

## Aktueller lokaler R6 Prozess und Navigationsauftrag vom 18.10.2026

Die Nutzergegenprobe von RC163-R5 zeigt einen Navigationsmangel: Dokument- und
Fundstellenprüfung sind keine Verlaufsliste, wurden aber als aktiver „Verlauf“
gekennzeichnet. Ein bestätigter Export endete weiterhin in der Prüffläche.
Der gezielte Umbau trennt Liste und laufgebundene Details, hält häufige
Ergebnis-/Hinweisaktionen direkt sichtbar und ordnet Diagnose als optionale
Unterstützung ein. Die Umsetzung wird aktuell gegen die unveränderten
Freigabe-/Revision-/Hash-/ACK-/Entwurfsschutzverträge geprüft.

Verbindlicher aktueller Prozessvertrag mit elf Aktivitäts- und elf
Sequenzdiagrammen sowie Klick-/Statusmatrix:
[RC163-R6 Workflowreview](acceptance/RC163_R6_WORKFLOW_REVIEW_20261018.md).
Der aktive Arbeitsstand steht in CURRENT_STATE und BACKLOG; ältere datierte
Navigationsentscheidungen unten sind Entwicklungshistorie, nicht zusätzliche
heutige Pflichten. Keine Desktopbedienung oder Timerfortsetzung ist erlaubt;
headless Browsermodelle ersetzen keine neue menschliche Windows-/Mac-Abnahme.

**Bereitstellungsnachtrag 11.10.2026:** Die neue Oberfläche ist mit RC159 der
reguläre Einstieg aller vier veröffentlichten Standalone-Testpakete, gebunden
an `7af2a9d0268864a01b954e0175cae9f5a3616fe8`. Native Paket-/Start-, CI- und
Sicherheitsgates bestanden; [genauer Scope](RELEASE.md#rc159--standalone-auf-allen-zielplattformen).
Die vollständige grafische/menschliche Zielhostabnahme und übrigen Storyreste
bleiben BL-010.53, keine pauschale Gesamtfreigabe. Frühere datierte Sperren
unten sind Entwicklungsevidenz, nicht der aktuelle Veröffentlichungsstatus.

## Fachlicher Abgleich

**Späterer Zielnachtrag 13.10.2026 – in Arbeit:** Das neue gebundene Inhaltsprofil
ersetzt künftig generierte Hinweise im Markdown durch lokale Coverageanzeigen.
Echte MD-Bildknoten werden syntaxbasiert durch Alttext ersetzt; Code/Literale
bleiben erhalten. Scan-OCR standardmäßig an, zusätzliche Bild-OCR aus; beide
explizit wählbar und unveränderlich pro Lauf. Dies ist noch keine gelieferte
Checkbox oder Formatabnahme. Verbindliche Matrix und Negativfälle:
[Aufgabe 6](../tasks/rc160-workflow/06-markdown-ocr.md). Desktoptests sind nun
wieder autorisiert; die folgenden datierten Nichtbedien-/r4-Paketbelege bleiben
historisch und belegen keinen neuen Quellstand.

**Nachtrag 13.10.2026 – lokales RC160, BL-010.53:** Nur konvertieren / Markdown
nachkorrigieren anonymisiert weder Namen noch Inhalte. Der Maskierungsbutton
ist nur im Anonymisierungsweg verfügbar und auch serverseitig zweckbegrenzt.
Neue raw Kopien behalten Basisnamen mit `.md`, nötige Kollisionszusätze sind
sichtbar. Exportvorschau liest den servergebundenen Dateinamenplan, erzeugt
keinen Exportintent, keine Freigabe und keine Kopie; bestehender privater
Nachweisabgleich kann dabei stattfinden. Alte Exportaufträge behalten ihre
damaligen Namen. Alle Zeilenkontrollen sind während der Vorschau wirklich
deaktiviert. Private Fehlerdetails nennen gezielt betroffene Quellen, nicht
pauschal die Auswahl. Keine Dateinamen in Diagnose oder Cowork-Rückgaben.

PDF-/Bildtext erscheint als lesbare Absätze mit Zeilen-/Seitenbezug und einem
kurzen Unsicherheits-/Auslassungshinweis. Erkannter Text und Metadaten werden
nicht blind entfernt. OCR-Kontaktwerte bleiben exakte Originalwerte mit
remappter Position und lokalem Bildausschnitt, spätere Korrekturen weiterhin
möglich. Das Checkbox-Häkchen aktiviert zusätzliche Kontaktprüfung, nicht OCR
oder die Lesbarkeitsformatierung. Echte Markdownquellen sind davon ausgenommen.
Quellescapes, echte Fences und erlaubte korrigierte Kontaktzeichen werden im
Privacy-Kern literal erhalten und trotzdem geprüft (`de-business/5`). Nicht
eindeutig darstellbare Steuer-/Ersatzzeichen stoppen die Anonymisierung; reine
ASCII-Beispiele in Code werden nicht als aktive Zeichen interpretiert.
Kodierte Identifier innerhalb solcher Literale erhalten keine Datenschutz-
Ausnahme: Nur nachweisbare Identifierbereiche werden mit Originalkoordinaten
dekodiert; gewöhnlicher Beispieltext wie `&amp;` bleibt literal. Explizite
einspaltige Namens-/Firmentabellen werden ebenfalls geprüft. Generische
Tabellenkontexte behalten ihre bisherige Mehrspaltensemantik, damit eine
maskierte erste Zelle fachliche Zertifizierungsangaben nicht umklassifiziert.

Die tatsächlichen v2-Seiten beider Zwecke wurden mit simuliertem IPC headless
in Edge geprüft: berechnete Schrift, Fokus, Dialog, Freigabe-/Vorschautrennung,
axe und 390–1280px-Reflow. Zusätzliches unabhängiges CommonMark-Testorakel
prüft sichtbare Wörter statt allein Quellbytes. Keine Desktopbedienung und
keine Native-GUI-Freigabe. Lokales Windows-RC160-r4-ZIP und exakte Sidecar-
Smokes beider Zwecke bestehen, einschließlich korrigierter OCR-Kontakte,
Folgegruppen, Neustart und konkreter Fehlermeldungen. Neue 72-Varianten-
Qualitätsbindung besteht mit den neun bekannten Roh-OCR-Warnungen; keinerlei
bekannte Restdaten/Sachwortverluste nach den synthetischen Referenzentscheidungen.
Die 219 kanonischen Headless-Dateien sind in zwei belegten Etappen abgedeckt:
161 Dateien, Korrektur des veralteten raw Namensorakels im Pausentest und 58
Dateien in quellstabiler Fortsetzung. Keine umgeschriebene monolithische PASS-
Evidenz. Neue Mac-Tests zunächst zurückgestellt. Tests des früheren Hinweistexts wurden auf den neuen
einzigen Hinweis umgestellt und behalten vollständige Inhalts-/Negativprüfungen.

RC159-Korrektur vom 08.10.2026 (BL-010.53): Nach dem nativ bestätigten
Abschluss der eingebetteten Fundstellenprüfung öffnet sich direkt die private
Ergebnisprüfung **desselben** Laufs, statt kommentarlos zum Verlauf zu wechseln.
OCR-Kontaktprüfung, Anonymisierungsfundstellen und abschließende revisionsgebundene
Dokumentfreigabe bleiben unterschiedliche Schritte. Bestehende Entscheidungen
werden nicht erneut abgefragt; Auswahl, Freigabe und KI-Export bleiben explizit.
„Ergebnisse prüfen und freigeben“ im Verlauf öffnet die Dokumentansicht mit einem
Klick. Der reine Freigabe-/Exportstatus ist eine sekundäre Aktion, kein vorgeschalteter
Pflichtklick. Schließmeldungen tragen die native Öffnungsgeneration; fremde,
verspätete oder doppelte Meldungen können keine Folgeansicht verlassen.
Vertagen und manuelles Verlassen kehren weiterhin zum Ausgangskontext zurück.
Keine automatische Freigabe, kein Export und keine Verarbeitung wiederholen sich.
Die grafische/native Anwenderabnahme bleibt getrennt von Renderer-Regressionstests.

Aktueller Korrekturstand vom 08.10.2026: Nach dem Gesamtreview sind R9-01/02/03
lokal behoben; registrierte native Publikationsworker und sofortiges Retirement
einschließlich Spawnreservierung sind implementiert und unter Windows an echten
Rename-/Kindprozessgrenzen geprüft. Dokumentierte frühere Schnitte unten sind
zeitgebundene Evidenz, nicht der heutige Fehlerstatus. Maßgeblich bleiben
BL-010.53 und der [R9-Korrekturanhang](REVIEW_STANDALONE_R9_2026-10-08.md#korrektur-und-erneute-gegenprüfung-08102026).
Die anschließende vollständige Produktsuite besteht mit 217 Testdateien am
vor/nach dem Lauf unveränderten korrigierten Quellscopedigest; Windows-
Releasekompilierung und 108 Rusttests/Clippy bestehen ebenfalls. Native Mac-/
vollständige v2-Bedien-/exakte neue Paketabnahme weiterhin offen.

Drei unabhängige, rein lesende Gegenprüfungen untersuchten Aufnahme/Zustände,
Prüfung/Export und Gestaltung/Interaktion. Der Kern ist wiederverwendbar. Die neue Oberfläche allein
liefert jedoch weder Pause noch vollständige nachträgliche Dokumentfreigaben
oder einen neuen sicheren Exportvertrag. Keine Demo-Zustände ins Produkt kopieren.

| Alt | Ziel / verbindliche Korrektur |
|---|---|
| Start + Verarbeiten, doppelte Aufgabenwahl | Eine Ansicht „Neue Verarbeitung“, Radio-Karten; Dateien vorher auswählbar. |
| Entfernen pro Datei | Hierarchische Häkchen, serverbesessene IDs. Hinzufügen erhält Ausschlüsse. Auswahl ist kein Start. |
| Gemischter Ordner komplett abgelehnt | Standalone-Katalog zeigt reguläre ungeeignete Dateien mit Namen/Grund. Unsichere Bäume bleiben atomar gesperrt; Cowork unverändert. |
| Prozessabbruch als Pause | Persistierte Pause erst nach aktiver Datei inklusive Bereitstellung/Zuordnung. |
| Nur Fehleranzahl | Namen mit Endung, fester verständlicher Grund, nur zulässige Folgeaktionen. |
| Prüfung über Verlauf / mehrere Fenster | Beim exakten Lauf erreichbar, integrierte Sitzung, Sammelansicht mit Originalpixeln, Quelltext und geplantem Markdown. |
| Wiederholte Entscheidungen | Exakte gleiche Entitäten laufweit; keine fuzzy Identitätsverschmelzung und keine blinde OCR-Zeilenübernahme. |
| Automatische technische Veröffentlichung | Neue v2-Läufe benötigen revisionierte private Dokumentpläne, ausdrückliche Freigabe und getrennten flachen KI-Export. Legacy nicht rückwirkend umdeuten. |
| Teil-Export schließt alles | Nicht exportierte/offene Dokumente bleiben offen. Änderungen invalidieren betroffene Freigaben, nicht frühere Exporte. |
| Vertrauliche Zuordnung neben KI-Dateien | Menschlicher Ergebnisbereich, ohne Löschbutton/automatische Löschung; nie im neuen KI-Export. |

## Konfliktentscheidungen

- Gestaltung eng übernehmen: lokale Inter-Schrift, 1180 px Inhaltsbreite,
  ruhige Flächen ohne Kartenschatten, unterstrichene Navigation, Karten,
  Dateibaum, Job-Leiste, Dokumentprüfung. Keine Demo-Leiste oder `support.js`.
- Keine Anmeldung, kein App-Passwort und kein Entsperren geschützter Quellen.
  Geschützte Datei: Name, Grund, Auslassen; übrige Dateien weiterverarbeiten.
- OCR-Prüfung auch für reine Markdown-Konvertierung erhalten. Neun bekannte
  rohe E-Mail-Lesefehler bleiben im Qualitätsgate, keine fehlerfreie OCR zusagen.
- Keine erfundenen Konfidenzen, Dauern oder Scan-Klassifikation aus Endungen.
  PDF-OCR-Bedarf vor Extraktion unbekannt. Inhaltsprobe ist nicht Metadatenaufnahme.
- Notwendiger kleiner Text verwendet `--c-muted`, nicht das kontrastarme
  `--c-faint` (unter 4,5:1 auf den vorgesehenen Flächen).
- Keine freie `openPath`-Schnittstelle; nur geschlossene laufgebundene Aktionen.
  Originalwerte/Dateinamen nur lokal, nie in Diagnose oder Cowork.
- „Nicht ersetzen“ umgeht kein unabhängiges abschließendes Datenschutzgate.
- Tauri/Node/Privacy-Core behalten getrennte Verantwortlichkeiten; kein
  Framework- oder MVC-Wechsel ohne fachlichen Nutzen.

## Technischer Weg und Abnahme

1. Design-Tokens, neue Hauptoberfläche und reale bestehende Aktionen.
2. Standalone-Quellenkatalog mit servergeprüfter Auswahl und Dateiproblemen.
3. Persistierte Pause/Fortsetzung, sequenzierte Zustandsbenachrichtigungen.
4. Unveränderliche private Extraktions-/Entitätenpläne, revisionierte
   Entscheidungen/Freigaben; nicht aus Pseudonymen rekonstruieren.
5. Idempotenter Export ausgewählter freigegebener Revisionen: neutral, flach,
   hashgebunden, keine Originalnamen/Zuordnung/Crops, keine Überschreibung.
6. Verlauf, Fehlerfälle, Browser-/Tastaturprüfung, Accessibility und echte
   verfügbare native Pakettests. Mac-Abnahme nicht durch Windows simulieren.

Pflichtfälle: beide Aufgaben, Unterordner, gemischte Formate, Ausschlüsse beim
Hinzufügen, Pause während Datei/Bereitstellung, Neustart, geschützte/defekte
Datei, Sammelentscheidung, Originalvergleich, spätere Prüfung, Teil-Export,
Änderung nach Freigabe, doppelte Aktion und stale Revision. Sicherheitsfälle:
Links/Hardlinks/Elternaustausch, abgebrochene Schreibvorgänge, unveränderte
Originale, keine freien Rendererpfade/-spans, keine personenbezogenen Logs.
Grafische Abnahme bei schmalen/breiten Fenstern, langen deutschen Dateinamen,
gemischten Checkboxen und allen Leer-/Arbeits-/Fehler-/Abschlusszuständen.

## Aktueller Umsetzungsschnitt, unveröffentlicht

`workspace.html/js/css` und lokale Tokens setzen die visuelle Grundlage,
Dateibaum, echte geschlossene Aktionen, Verlauf/Einstellungen und integrierte
Sammelprüfung um. Der alte Einstieg bleibt bis zur vollständigen Backend-
Migration Standard. Browserdaten sind ausdrücklich synthetisch; dortige
Prüfgruppen sind keine Abnahme der Verarbeitung ausgewählter Quelldateien.
Der eingebettete Prüfer verwendet einen geschlossenen Parent-Befehlssatz;
die native Oberfläche prüft zusätzlich die ausdrücklich aktive Eigentümerschaft.
Es wird nicht angenommen, dass jede WebView die Tauri-API in Frames injiziert.

Dateikatalog und Startauswahl sind servergebunden implementiert. Ein separater
Metadatenkatalog erlaubt bis zu 1.000 Dateien und eine vollständige Aufnahmeantwort
von höchstens 512 KiB einschließlich Artefaktdetails und privatem Antwortumschlag.
Erst die angehakte Teilmenge wird gegen 200 Dateien und
500 MiB geprüft, im Renderer und vor Ergebnisordneranlage/Reservierung erneut
auf der Verarbeitungsseite. Einzeldatei-/Baumgrenzen bleiben erhalten; bei einer
zu großen Katalogerweiterung bleiben bisherige Auswahl, IDs und Revision stehen.
Ein delegierter Start verbraucht alle privaten Katalog-IDs und Ablehnungen,
auch bei verlorener Bestätigung; nur Anzeigeinformationen des gestarteten
Laufs bleiben erhalten. Die nächste Aufnahme beginnt ohne alte Ablehnungen.
Die persistierte Pause wird mit einer kurzen gemeinsamen Kontrollsperre an
den dauerhaften Dateiclaim gebunden; Kontrollfehler stoppen keine Dokumente.
Der aktuelle Entitäten-/Exportstand wird unten gesondert beschrieben.

Die tatsächlich extrahierte lokale Quelle und der final geprüfte Markdown-Stand
bleiben unveränderlich außerhalb der befristeten Arbeitskopien. Zusätzlich wird
jetzt ein reversibler Plan aus den tatsächlichen Core-Ersetzungsoperationen
erfasst. Sichtbare Marker im Quelldokument begründen keine Entität. Fehlende oder
nicht vollständig replaybare Alt-Pläne erhalten keine erfundenen Fundstellen.
Menschliche Freigabe und Widerruf sind revisions-/hashgebunden. Jede Änderung
hebt eine vorhandene Freigabe auf. Zusätzliche Maskierungen können keine
überlappenden Originalwerte versehentlich wiederherstellen.

Der getrennte Export nimmt nur explizit gewählte freigegebene Revisionen an,
erstellt exklusiv einen neuen flachen Ordner mit neutralen Markdown-Namen und
prüft dessen exakte Dateimenge und Hashes. Ein verlorenes ACK ist über dieselbe
Aktionskennung abgleichbar, ein geänderter Exportauftrag unter derselben Kennung
ist ein Konflikt. Private Prüfstände/Identitäten werden nicht mitkopiert. Diese
Prüfstände bleiben lokal erhalten; kein automatisches Löschen. Der Ablauf ist
noch nicht freigabereif: insbesondere native Export-Erstbindung und
paketgebundene End-to-End-Abnahmen sind offen. Implementierte Entitätenbearbeitung
und Roh-Markdown-Nachkorrektur sind kein Ersatz für diese Abnahmen.

## Grafische und Interaktionsgegenprobe vom 07.10.2026

Der tatsächliche HTML-/CSS-/JavaScript-Stand wurde im eingebauten Browser
gegen die Referenz betrachtet, mit ausdrücklich synthetischem Vorschauadapter.
Die Prüfung deckt Gestaltung und Renderer-Interaktion ab, nicht native Picker,
die Inhalte der dargestellten Beispieldateien oder die Anonymisierungsqualität.

- Breite Arbeitsansicht: zentrale Behandlung oberhalb der Liste, keine
  Entscheidungsbuttons pro Zeile; daneben Originalausschnitt und zwei
  Vergleichsspalten für Quelltext/Markdown. Kurze Fenster behalten eine
  erreichbare Übergabeleiste statt einer zusammengedrückten Ein-Zeilen-Liste.
  Beim Scrollen im breiten Vergleich bleibt der tatsächlich ausgewählte Wert
  sichtbar; der Textvergleich verliert dadurch nicht seinen Bezugspunkt.
- Die eingebettete Ansicht zeigt auch ohne den ausgeblendeten alten Titel
  „N von M Fundstellen vorgemerkt · K offen“. Auswahl allein bleibt bei null
  vorgemerkten Entscheidungen. 50 vorgemerkte Zeilen mit 14 offenen Resten
  sperren die Übergabe. Seit r8 ist „Noch offen“ die Startansicht: Nach dem
  Vormerken der ersten 50 erscheinen unmittelbar die übrigen 14, ohne einen
  zusätzlichen Seitenwechsel. Nach deren Behandlung sind 64/64 übergabefähig.
  „Alle gefilterten Zeilen auswählen“ erfasst alternativ beide Seiten; Auswahl
  allein entscheidet weiterhin nichts. „Vorgemerkt“ erlaubt die Nachkontrolle.
  Seit r9 macht Rückgängig auch restaurierte vorgemerkte oder gemischte Zeilen
  mit passendem Filter unmittelbar sichtbar; Status und Vergleich folgen ihnen.
- Übergabe führt zunächst zum sichtbaren Arbeitszustand; der simulierte
  Abschluss kehrt zur zugehörigen Verarbeitung zurück. Der Tastaturfokus
  bleibt auf deren stabiler Überschrift und fällt nicht auf den Seitenkörper.
  Eine direkt im Verlauf gestartete Prüfung kehrt dagegen zur Verlaufnavigation
  zurück. Vertagen gibt nichts frei; die Rückkehr erfolgt ausdrücklich.
- Reflow ohne horizontalen Seitenüberlauf bei 390, 720, 1000 und 1440 Pixeln
  geprüft; am aktuellen 390-Pixel-Stand zusätzlich der neue Fortschrittszähler.
- Bei 1280 und 900 Pixeln anschließend erneut geprüft. Der kompaktere Kopf
  und die gemeinsame Dokument-/Statuszeile lassen mehr Fundstellen sichtbar;
  keine neue Behandlungsaktion pro Zeile. Vollständige Dateibezeichnungen
  bleiben im DOM, Tooltip und beim ausgewählten Vergleich erhalten. Die
  Hinweise unterscheiden weiterhin Auswahl, Vormerken und tatsächliche
  Übergabe einschließlich Verwerfen noch nicht übergebener Eingaben.
- Verspätete erfolgreiche oder fehlgeschlagene Dateidetails eines früheren
  Laufs dürfen keine neue Vorbereitung verändern. Vorbereitete Quellen werden
  beim Fortsetzen eines fremden historischen Laufs nicht still ersetzt.
- Im sichtbaren Verlauf aktualisieren die vorhandenen privaten Statusabfragen
  auch die Laufzeilen. Unveränderte Antworten bauen die Bedienelemente nicht
  neu auf; Änderungen erhalten aufgeklappte Dateiprobleme und den Fokus.
  Das ist noch kein sequenzierter Backend-Ereignisvertrag.

Eine zusätzliche echte Browserprobe zeigt 201 synthetische Katalogdateien,
den roten Grenzhinweis unmittelbar unter der Liste und einen gesperrten Start.
Nach Abwahl einer Datei verschwinden Hinweis und Startsperre. Die echte
gerahmte Sidecar-Gegenprobe nimmt ebenfalls 201 kleine Testdateien auf, weist
einen ungefilterten Start zurück und erhält den vollständigen Katalog.
Das ist kein nativer Picker- oder Konvertierungsnachweis für 201 Dateien.

Gezielte Rendererregressionen des ersten Teilschnitts: 17 Workspace- und 33 Prüferfälle
bestanden. Die damalige vollständige Produktsuite mit 206 Testdateien bestand;
das nachfolgende Kompaktierungsdelta ist zusätzlich durch 33 Prüferfälle,
Browserreflow und eine begrenzte unabhängige Interaktionsprüfung geprüft.
Weitere technische Verifikation und bewusst offene Paketgates
stehen im kanonischen Iststand. Lokale Bildschirmbelege liegen unter
`tmp/frontend-v2-ui/`; sie sind keine Release- oder menschliche Zielhostabnahme.
## Implementierungsergänzung: dauerhafte Pause (2026-10-07)

Der folgende Rest-Schnitt erweitert den privaten Dokumentprüfstand um einen
unveränderlichen Verarbeitungszweck. Reine Markdown-Konvertate dürfen lokal
nachkorrigiert werden (begrenzte, revisionsgebundene Bereichsersetzung). Ihre
Korrekturkopien bleiben ausdrücklich nicht anonymisiert in einem getrennten
`DataSecure-Markdown-Korrektur`-Bereich; sie dürfen weder durch UI-Bezeichnung
noch durch Exportziel zum KI-Export werden. Ein Auftrag darf keine Dokumente
unterschiedlicher Zwecke mischen. Entitätenpläne werden an den echten
Ersetzungsoperationen erfasst, nicht aus sichtbaren Platzhaltern zurückgerechnet.

Der Pausewunsch wird ausschließlich im privaten Standalone-Namensraum als
unveränderlicher, an Lauf und Generation gebundener Intent gespeichert. Der
Desktop schreibt niemals parallel in das aktive Verarbeitungsjournal. Der
Worker beendet die aktuelle Datei einschließlich Veröffentlichung und Zuordnung;
vor der nächsten Datei kontrollieren sowohl Runner als auch Item-Orchestrator
den Intent. Eine offene Zuordnungsschuld ist noch keine wirksame Pause.

Fortsetzen erhöht unter der vorhandenen Stapelsperre die Kontrollgeneration;
alte Pausewünsche gelten danach nicht mehr. Ein vollständiger Lauf gewinnt
gegen verspätete Pausewünsche. Pause ist weder Abbruch noch Freigabe. Bei
Null-Tage-Aufbewahrung wird Pause mit einem erklärbaren Fehler abgelehnt;
auch sonst gilt die bestehende Snapshot-Aufbewahrungsfrist. Cowork bleibt
unverändert. Prüfstände und ausgewählte KI-Exporte besitzen nun getrennte,
revisionsgebundene Speicherung; die bisherige Identitätsliste ersetzt diese
Speicherung ausdrücklich nicht. Fehler-/Wiederholungsregressionen prüfen reale
lokale Dateien, verlorene Bestätigungen, Widerruf und Zielersetzung. Die neue
Dokumentansicht verwendet den tatsächlichen Renderer; Browserdaten sind rein
synthetisch und klar markiert. Eine verbleibende Erstbindungs-Race zwischen
Ordneranlage und Ownership-Erfassung ist statisch dokumentiert, nicht nativ
reproduziert und vor einer Freigabe weiter zu bearbeiten.

Die neue Dokumentansicht wurde im tatsächlichen Browser mit klar markierten
synthetischen Daten geprüft: Häkchen treffen keine Entscheidung, die globale
Freigabe schaltet nur den eigenen KI-Export frei, Quelle und Markdown bleiben
vergleichbar. Der Rückweg führt zum tatsächlichen Ursprung (Lauf oder Verlauf).
Bei 390 und 900 Pixeln entsteht kein horizontaler Seitenüberlauf; der schmale
Vergleich stapelt seine Textfelder. Ein Bildschirmbeleg liegt lokal unter
`tmp/frontend-v2-ui/dokumentfreigabe-v2.png`. Das belegt weder native Tauri-
Integration noch die Verarbeitung dieser erfundenen Beispieldateien.

Zusätzliche Regressionen des vorausgehenden Schnitts: sieben Pausefälle
einschließlich echter TXT-Verarbeitung beider Modi und Neustart, 14 Runner- und
15 Zweckbindungsfälle bestehen. Die aktuellen Dokument-/Entitätenzahlen stehen
im folgenden Gegenprüfungsabschnitt. Ein mehrsprachiger 9-MiB-Prüfstand wird nicht
wegen einer zu engen Bytegrenze ausgeschlossen. Export validiert ausgewählte
Freigaben unter derselben Sperre wie Änderungen und lädt anschließend nur
einen Dokumentkörper pro Schreibschritt. Der erweiterte Gesamteingang bleibt
am unveränderten Git-Tracking-Check rot, solange neue Dateien ungetrackt sind.
Paket- und native Zielhostgates bleiben getrennt und sind nicht bestanden.

Die letzte Gegenprüfung korrigierte zwei zusätzliche Fehler: UTF-16-Blockgrenzen
trennten zuvor Emoji-Paare und konnten die native JSON-Auswertung abbrechen;
jetzt bleiben beide Vergleichstexte blockweise wohlgeformt und exakt zusammensetzbar.
Die vorher nur ansichtsgebundene Export-Aktionskennung wird nun aus dem privaten
dauerhaften Intent wiederentdeckt. Nach verlorener Antwort kann ein frischer
Prozess denselben Export abgleichen, selbst wenn dessen früher freigegebener
Stand inzwischen widerrufen ist: Es werden ausschließlich die bereits vorhandenen
fertigen Bytes überprüft, keine neue Kopie erzeugt. Eine gesonderte ausdrückliche
Empfangsbestätigung entfernt den Auftrag aus der offenen Wiederaufnahmeprojektion,
ohne Dateien oder historische Receipts zu löschen. Öffnen startet keinen Export.
Native IPC erlaubt hierfür nur das feste Bestätigungsflag, keine Pfade oder Texte.
Der Abschlussbeleg bleibt auch nach gespeicherter Empfangsbestätigung sichtbar;
eine verlorene Bestätigungsantwort macht eine zuvor nachweislich erfolgreiche
Kopie nicht wieder ungewiss. Diese historischen Belege prüfen nicht erneut,
ob heutige Exportdateien seitdem geändert wurden. Die Wiederaufnahmeprojektion
enthält nur den nächsten offenen Auftrag und die offene Gesamtzahl; damit
bleibt sie auch bei mehreren großen Auswahlen innerhalb des Transportbudgets.
Eine explizite Verzichtsaktion für einen dauerhaft nicht mehr erfüllbaren
Teilauftrag ist inzwischen implementiert: gesonderter bestätigter Terminalbeleg,
keine Änderung der ursprünglichen Auswahl und keine Löschung angelegter Dateien.
Ein fertiger Export bietet nur Empfangsbestätigung, keinen nachträglichen Verzicht.

Die abschließende Browserprobe bestätigt den wiedergeöffneten Abschlussbeleg,
sichtbar graue deaktivierte Exportaktionen und den Tastaturfokus auf der
geladenen Dokumentüberschrift. Bildschirmbeleg:
`tmp/frontend-v2-ui/dokumentfreigabe-v2-export.png`. Dies bleibt eine synthetische
Vorschau, kein nativer Paketnachweis. Pause- sowie Dokument-/Exporttests sind
auch im macOS-verwendeten Standalone-Testeingang enthalten; dessen statischer
Workflowtest besteht, ohne einen neuen GitHub-Actions-Lauf zu behaupten.

## Best-Practice-Revalidierung und Fehlergegenproben (2026-10-07)

Bewertet wurde nicht nur das Erscheinungsbild, sondern die Vertrauensgrenze,
dauerhafte Zustandsübergänge, fachliche Identität und Fehlererholung. Die
folgenden offiziellen Empfehlungen sind Prüfkriterien, keine pauschale
Sicherheits- oder WCAG-Konformitätsbescheinigung:

| Maßstab | Umsetzung / gemessene Grenze |
|---|---|
| [Tauri: Vertrauensgrenzen](https://v2.tauri.app/security/) und [Runtime Authority](https://v2.tauri.app/security/runtime-authority/) | Geschlossene Befehle, aktive native Laufbindung, serverbesessene IDs, keine freien Rendererpfade. Private Prüf-/Exportverträge bleiben außerhalb Cowork. Native End-to-End-Abnahme des neuen Einstiegs bleibt offen. |
| [OWASP: Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) | Geschlossene Payloads und Journals, Revision/Hash/Zweck/Operation auf der schreibenden Seite prüfen; weder UI-Auswahl noch ungebundenes ACK verleiht Freigabe. |
| [W3C: modaler Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Exportvorschau vor I/O, Fokus im nativen HTML-Dialog, Escape/Abbrechen ohne Export und Fokusrückkehr. Tastaturgegenprobe im Browser; keine native Screenreader-Abnahme. |
| Fehlererholung statt optimistischer Erfolgsmeldung | Nach verlorener Antwort gespeicherten Stand abgleichen. Schlägt auch das fehl, bleiben Mutationen gesperrt und der unklare Bestätigungsstatus sichtbar. Vollständige Roh-Markdown-Entwürfe werden für Vergleich/Kopie erhalten, nicht blind erneut gesendet. |
| Atomare Sammelentscheidung | Ein gemeinsamer dauerhafter Commit für alle betroffenen Dokumente. Fehler vor dem Commit ändert keines; verlorene Antwort nach Commit projiziert alle konsistent. Keine Folge von teilweise erfolgreichen Einzeldateientscheidungen. |
| Fachliche Identität | Exakte normalisierte vollständige Identität plus Typfamilie, laufgeheimer HMAC. Kurze/Slug-Aliasse folgen nur derselben tatsächlich erfassten eindeutigen Registry-Bindung. Mehrdeutige Nachnamen und Kontakte erhalten keine laufweite Regel. |

Die Gegenprüfung fand und korrigierte sechs konkrete Fehler: veraltete
Registry-Aliasse nach einem zweiten vollständigen Namen, wiederauflebende
Freigaben nach Journal-Endverlust, Weiterarbeiten mit veraltetem Stand nach
fehlgeschlagenem Abgleich, verlorene Roh-Markdown-Entwürfe und veraltete Aktionen
in einem während der Wiederaufnahme geöffneten Exportdialog sowie verlorene
feste Fehlergründe im echten Sidecar-Antwortweg. Der letzte Fall ist mit realen
gerahmten IPC-Anfragen einschließlich fehlender Entitätenspur und veraltetem
Journalformat nachgewiesen. Ein unabhängiger
Commitnachweis enthält den exakten gemeinsamen Record; ein fehlender Spiegel
wird nur daraus rekonstruiert. Widersprüchliche Belege oder alte Engineering-
Journals ohne diesen Nachweis werden gesperrt, nicht automatisch freigegeben.
Kein Nachweis gegen gemeinsamen Verlust beider Kopien oder native Stromausfälle.

Gezielte Prüfungen bestehen: 12 tatsächliche Transformationsspurfälle,
8 reversible Entitätenfälle, 11 laufweite Entscheidungsfälle, 34 private
Dokument-/Exportfälle, 29 Dokument-Rendererfälle, 12 Zuordnungsfälle und 29 Workspace-Fälle. Die letzten Alias-/Journal- und
Wiederaufnahmegegenbeispiele wurden zusätzlich unabhängig lesend nachgeprüft.
Die volle Produktsuite enthält nun 213 Testdateien; Git-Tracking-, Paket- und
Qualitätsgates werden nicht durch diese Einzelresultate ersetzt.

Im tatsächlichen Browser: Auswahl und Behandlung allein lassen Revision 0
unverändert; erst „Auswahl anwenden“ ändert drei synthetische Dokumente, hebt
deren Freigaben auf und startet keinen Export. Bei 390 und 1280 Pixeln kein
horizontaler Seitenüberlauf. Bildschirmbeleg:
`tmp/frontend-v2-ui/dokumententscheidung-laufweit-v2.png`. Dies ist ausdrücklich
eine synthetische Rendererprobe, kein Verarbeitungs-/Paketnachweis.

Fertige Exportbelege besitzen eine geschlossene native Öffnungsaktion. Nur
Lauf-/Operations-ID werden übertragen; gespeicherter Zweck, ursprünglicher
Ergebnisordner, Verzeichnisidentität, genaue Dateimenge und alle Hashes werden
erneut geprüft. Öffnen kopiert oder bestätigt nichts. Veränderte, zusätzliche,
fehlende und ausgetauschte Dateien/Ordner werden abgewiesen. Die Tastaturprobe
bestätigt die Interaktion im synthetischen Browseradapter, nicht einen echten
Explorer-/Finder-Aufruf. Die neue Bildschirmaufnahme lief in einen Browser-
Timeout; daraus wird kein aktueller visueller Abnahmebeleg abgeleitet.

Der Verlauf bietet jetzt pro Lauf einen ausdrücklich ausgelösten Abgleich von
Freigaben und Exportbelegen. Die reguläre Statusabfrage liest nicht automatisch
20 vollständige Dokumentjournale. Aktuelle menschliche Freigaben, historische
fertige Kopien, unvollständige Exportaufträge und offene Empfangsbestätigungen
werden getrennt gezählt. Fehlende Prüfstände bleiben gesondert sichtbar; alte
Läufe ohne v2-Manifest gelten als unbekannt, nicht als null freigegeben. Fehler
zeigen einen festen Grund und erlauben erneuten Abgleich, ohne einen Export zu
starten. Verspätete Antworten nach Ansichtswechsel dürfen nichts einblenden.
Der Abgleich ersetzt weder aktuelle Exportvalidierung noch Dateihashprüfung.
Tastatur-/DOM-Gegenprobe am synthetischen Browseradapter: laufgebundenes
Aufklappen, Legacy-Unbekanntzustand, stabiler Fokus und kein horizontaler
Seitenüberlauf bei 390 Pixeln. Keine neue Bildschirmaufnahme oder native Abnahme.

Die unabhängige Dateisystem-Gegenprüfung präzisierte den offenen P1: Eine
native Verzeichnis-Lease genügt nicht, wenn Node anschließend weiterhin
absolute Zielpfade öffnet. Der geplante native Broker muss deshalb Anlage,
Dateischreiben und Verifikation handle-relativ besitzen. Windows bietet hierfür
[NtCreateFile mit RootDirectory](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile).
Auf macOS verhindert ein offener Deskriptor allein keine Verzeichnisumbenennung;
auch die Erstbindung zwischen Anlage und Öffnen benötigt eine nachgewiesene
Strategie. Aus der [Apple-open-Dokumentation](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/open.2.html)
wird keine atomare Verzeichnis-Erstbindung abgeleitet. Der Export wird nicht
durch einen ungesicherten Fallback als freigabereif erklärt. Der konkrete Broker
und seine nativen Race-/Crash-/Dateisystemgegenproben sind noch nicht umgesetzt.

Vor der vollständigen Umstellung offen: nativer handle-relativer Exportbroker
einschließlich sicherer Erstbindung (P1), sichere Bereitstellung der neuen
vertraulichen Zuordnung im menschlichen Ergebnisbereich, einzelne Fehlerdateien
wiederholen/auslassen, vollständige Verlaufsabnahme, sequenzierte
native Ereignisse/Wiederverbindung sowie vollständige Windows-/Mac-Paket-
und Accessibility-Abnahme. Keine neue Veröffentlichung oder Standardumschaltung.

## Revisionsgebundene menschliche Zuordnung (2026-10-07, unveröffentlicht)

Die Dokumentprüfung bietet eine **aktuelle vertrauliche Zuordnung** der verfügbaren
gespeicherten Anonymisierungsstände; fertige Exportbelege besitzen eine separate
**Zuordnung dieses Exports**. Die zweite bleibt an exakt die damals ausgewählten
Dokumentrevisionen und Ausgabehashes gebunden. Spätere Personen-/Firmenentscheidungen
ändern die aktuelle Referenz, niemals rückwirkend die exportgebundene. Der alte
Verlaufsverweis heißt deshalb „Basiszuordnung“, nicht aktuelle Zuordnung.

Die Referenz folgt ausschließlich echten replaybaren Ersetzungen. Importierte
Marker, direkte Kontaktwerte, beibehaltene oder zusätzlich maskierte Stellen und
mehrdeutige Identitäten werden nicht als eindeutige Personen-/Firmenzuordnung
ausgegeben. Vollname, Bindestrich- und Nachnamenalias werden nur bei derselben
belegten eindeutigen Registry-Bindung zusammengeführt. Die gleiche Markerschreibweise
in zwei Dateien beweist keine gleiche Person. Originalfragmente und Dateinamen
bleiben lokal, ohne automatische Löschung; keine Kopie im KI-Export.

Der Snapshot wird vor einem neuen Exportintent gespeichert. Ein Fehler dabei
beginnt keine neue Zielkopie. Fehlt die Referenz später, bleiben abgeschlossene
Exportbelege, deren Öffnung und Empfangsbestätigung erhalten. Eine damalige
fehlende oder veränderte Referenz wird nicht aus heutigen Daten nachgebaut.
Die unabhängige Gegenprüfung fand einen P2: TXT plus separat angepasstes
Textdigest konnten eine falsche Zuordnung anzeigen. Korrigiert und erneut
unabhängig gegengeprüft: Der Reader rendert das exportgebundene semantische
Objekt deterministisch und verlangt exakte Bytegleichheit. Die Zwei-Dateien-
Manipulation wird abgewiesen, ohne Belege oder manipulierte Dateien zu überschreiben.

Nachgewiesen sind 12 Helferfälle, inzwischen 38 reale private Dokument-/Exportfälle und
31 Rendererfälle; der echte gerahmte Sidecar erreicht die neue ID-only-Aktion,
erzeugt die private Referenz und reicht feste Konfliktgründe ohne Inhalte weiter.
Die synthetische Browser-Tastaturprobe bestätigt getrennte aktuelle/Export-
Aktionen, Auswahl ohne Freigabe und expliziten Export. Maus- und Bildschirm-
aufnahmeversuche liefen in Browser-Transporttimeouts: kein neuer Screenshot-
oder vollständiger grafischer Abnahmebeleg. Eine native Explorer-/Finder-Abnahme
und die sichere Kopie in den menschlichen Ergebnisbereich stehen weiterhin aus.

Fehlende Dokumentkörper werden anhand eines separaten Veröffentlichungseintrags
weiter mit Namen angezeigt, auch nach Ablauf des Verarbeitungsjournals. Eine
reine Leseabfrage legt keine leere Körperablage an und erzeugt so keinen falschen
Veröffentlichungsnachweis. Alte Quellmitgliedschaft ohne solchen Beleg bleibt
gesondert unbekannt. Der Verarbeitungszweck eines Roh-Markdown-Laufs bleibt auch
bei Verlust aller Körper erhalten; ein unbekannter Zweck erhält keinen KI-Export.

## Priorisierte Verlaufsaktionen und erneute Gegenprüfung (2026-10-07)

Jede Zeile besitzt höchstens eine Hauptaktion. Laufende Verarbeitung wird nicht
durch einen Freigabeabgleich überschrieben. Fortsetzbare Arbeit hat Vorrang vor
technischer Bereitstellung, diese vor konkreten Dateiproblemen; erst danach wird
ein abgeschlossener Anonymisierungslauf anhand frisch geladener Dokumentstände
eingestuft. Weitere verfügbare Funktionen stehen unter „Weitere Aktionen“.
Der [W3C-Disclosure-Vertrag](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
ist mit nativen Buttons, Enter/Leertaste, `aria-expanded` und `aria-controls`
umgesetzt. Statusänderungen besitzen eine [Status-Live-Region](https://www.w3.org/WAI/WCAG21/Understanding/status-messages).
Keine vollständige WCAG-Abnahme daraus ableiten.

| Belegter Zustand | Hauptaktion / Grenze |
|---|---|
| Offene lokale Prüfung / pausiert | Jetzt prüfen / Fortsetzen, an exakt diesen Lauf gebunden |
| Technische Bereitstellung offen | Bereitstellung prüfen; keine vorgetäuschte Wiederaufnahme eines terminalen Laufs |
| Terminale Dateiprobleme | Probleme ansehen; Dateinamen und Gründe laden, keine erneute Verarbeitung |
| Dokumentstatus noch nicht abgeglichen | Prüfstatus laden; keine optimistische Exportbereitschaft |
| Nicht alle verfügbaren Stände freigegeben | Prüfung fortsetzen |
| Fehlende oder unklassifizierte Dokumentstände | Prüfstände ansehen; keine vollständige Freigabe behaupten |
| Offener Exportauftrag / Bestätigung | Export abgleichen; alte Auswahl nicht durch heutige ersetzen |
| Alle nichtleeren aktuellen Stände freigegeben, noch nicht vollständig exportiert | Exportvorschau; vor dem Dialog erneut laden, keine Kopie oder Freigabe beim Öffnen |
| Jeder aktuelle Stand in fertigen Belegen erfasst | Prüfung öffnen, sekundär; gespeicherter Beleg ist keine heutige Integritätsprüfung der Kopie |
| Ursprünglicher Ergebnisordner fehlt | Keine Hauptaktion; private Prüfstände bleiben nur ausdrücklich als Nebenaktion erreichbar |
| Ordner ersetzt oder Bindung unlesbar | Nicht sicher verfügbar, keine Exportbereitschaft daraus ableiten |

Die Exportabdeckung vereinigt alle abgeschlossenen Operationen, dedupliziert
Dokumente und verlangt dieselbe Revision, Ausgabehash und Verarbeitungsart wie
der heutige Prüfstand. Wiederholte Teil-Exporte zählen nicht doppelt, Widerruf
oder Änderung entwertet die Abdeckung des aktuellen Stands. Die letzten zwanzig
sichtbaren Belege begrenzen nicht die Prüfung der tatsächlichen Operationen.

Der unabhängige Abschlussreview fand einen P2 im neuen Ladebutton: Zuklappen
während einer offenen Anfrage oder ein paralleler nativer Ordneraufruf konnte
eine überholte Bedienungssperre erhalten. Zwei echte Renderergegenproben waren
vorher rot, nach der Korrektur grün. Zuklappen beendet Anfragebindung und Sperre;
logische Sperränderungen aktualisieren auch den globalen Wiederherstellungsstand.
Veraltete Antworten werden weiterhin verworfen. Doppelte initiale Ladeaktionen
sind entfernt. Inzwischen bestehen 32 Workspace- und 31 Dokumentrendererfälle, ebenso
38 private Dokument-/Exportfälle und die echte History-Ordnergegenprobe
(vorhanden, entfernt, durch neues Verzeichnis ersetzt).

Die synthetische Browserprobe bestätigt Hauptaktion, Sammelfreigabe, Rückkehr
in den Verlauf, frisch geladene Exportvorschau, Escape und sinnvolle Fokusrückkehr.
Bei 390 Pixeln haben Dialog und Verlauf keinen horizontalen Seitenüberlauf;
Hauptbuttons bleiben einzeilig. Keine native Windows-/Mac-Abnahme daraus ableiten.
Gesamtprodukttest bleibt am unveränderten Git-Vollständigkeitscheck rot: neue
Produktdateien sind nicht versioniert. Die installierte Claude-CLI 2.1.280
validiert Plugin und Marketplace streng; dies ist nur Strukturprüfung.

## Gemischte Aufnahme, abgewiesene Dateien und Neustartgrenzen (2026-10-07)

Die echte Gateway-Gegenprobe mit gültigem TXT und beschädigtem DOCX war für beide
Zwecke zunächst rot: Der Dokumentmanifest-Aufbau verlangte irrtümlich auch für
abgewiesene Quellen einen Hash. Die Korrektur trennt hashgebundene Dokumente von
einer geschlossenen Liste `preflight_rejections` (ID, relativer Name mit Endung,
fester Aufnahmegrund). Nur die echten Preflight-Zustandspaare und deren zehn
festen Quellformatcodes gelangen in diese Liste. Keine Arbeitskopie, erfundene
Quellhashes, Textkörper, Freigabe oder Exportautorität für abgewiesene Eingaben.
Die gemeinsame ID-Menge bleibt eindeutig und insgesamt auf 200 beschränkt.
Das ältere Manifest `/1` bleibt lesbar; `/2` trägt die getrennten Ablehnungen.

Auch ausschließlich abgewiesene Eingaben behalten Zweck, Namen und Gründe,
ohne einen prüfbaren Dokumentkörper zu erfinden. Die Metadaten werden bereits
nach dem dauerhaften Aufnahmejournal gespeichert, nicht erst nach einer
erfolgreichen Konvertierung. Bei Schreibfehler bleibt der veröffentlichte
Aufnahmezustand Eigentümer der versiegelten Arbeit; kein falscher Start-ACK.
Die Aufnahmegegenprobe umfasst jetzt 27 Fälle.

Die unabhängige Fehler-/Recovery-Gegenprüfung fand anschließend zwei weitere
P2-Grenzen. Erstens konnte ein noch nicht terminaler Zuordnungsschritt den
alten `failed_count` bei null halten und nach Journalablauf eine belegte
Ablehnung ausblenden. Die private Fehleransicht verwendet jetzt mindestens
die belegte Ablehnungszahl, weiterhin begrenzt durch die tatsächliche Auswahl.
Zweitens fehlte die Reparatur des Journalcommit→Metadaten-Crashfensters.
Recovery stellt das unveränderte Manifest jetzt vor Zuordnungsfortschritt und
vor Ablaufbereinigung idempotent wieder her. Periodische Bereinigung und der
direkte abgelaufene Journalreader verwenden dieselbe Reparaturgrenze.
Konflikte werden nicht überschrieben; ein nicht sicher reparierter Zustand
meldet Bereinigungsfehler und verliert nicht sein einziges Aufnahmejournal.
Zero-Day-Arbeitskopiebereinigung behält ihre vorgelagerte bestehende Grenze.
Der begrenzte unabhängige Abschlussreview bestätigt beide Korrekturen ohne
weiteren blockierenden Befund; die offene native Exportabsicherung ist davon
nicht erfasst.

Zunächst rote gezielte Regressionen sind grün: 24 Recovery-, 19 Journal- und
die reale Verlaufsgegenprobe. Die sieben Pause-/Gatewayfälle enthalten zusätzlich
echte Neustarts für beide Zwecke × normale Recovery, periodischen Journalablauf
und direkten abgelaufenen Reader. Nach fehlendem Manifest werden exakt dieselben
Namen/Gründe wiederhergestellt; reine Leseansichten erzeugen weder Dokumentkörper
noch Freigaben. Originalquellen bleiben bytegleich. Cowork und Legacy aktivieren
diese Dokumentprüfung nicht. Der Renderer nennt die abgewiesenen Dateien und
weist bei einer nur teilweise verfügbaren Fehlerliste ausdrücklich auf fehlende
Dateidetails hin; keine nur an einer Anzahl festgemachte Exportbereitschaft.

## Fokus, Hintergrundarbeit und Fachgegenprüfung (2026-10-07)

Ein fortlaufender Verarbeitungsstatus ersetzt nicht mehr unbemerkt den gerade
fokussierten Laufbutton. Stabile Aktions-IDs stellen den Fokus wieder her;
entfällt die Aktion am Abschluss, folgt die feste Laufüberschrift. Navigation,
Einstellungen und Dialoge werden nicht vom Hintergrundlauf fokussiert.
Eine dauerhafte höfliche Statusregion meldet Phasenwechsel, neue Fehler und
Abschluss, nicht jeden Dateizähler. Dies folgt den
[W3C-Statusmeldungen](https://www.w3.org/WAI/WCAG21/Understanding/status-messages)
und der Trennung von Fortschritt und Nutzeraktion in den offiziellen
[Windows-Fortschrittskontrollen](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/progress-controls).
Der unabhängige Accessibility-Review bestätigt die begrenzte Tastatur-/DOM-Probe;
keine vollständige WCAG-, Screenreader- oder Paketabnahme daraus ableiten.
Die tatsächliche synthetische Browservorschau öffnet die Prüfung per Enter
direkt aus der aktuellen Laufkarte und hat bei 390 Pixeln keinen horizontalen
Seitenüberlauf. Kein native-GUI- oder neuer Screenshotnachweis aus dieser Probe.

## Normaler Ergebnisordner bleibt – sichere Veröffentlichung noch offen

Der Anwender hat ausdrücklich einen **normalen Ergebnisordner**, keine ZIP,
gewählt. Die unabhängige Export-Fachgegenprüfung bestätigt einen begrenzten
Implementierungsweg: alle ausgewählten freigegebenen Markdown-Dateien zunächst
unter der kontrollierten privaten Standalone-Datenwurzel vollständig vorbereiten,
synchronisieren und prüfen; danach den fertigen Ordner nativ **ohne Ersetzen**
in den gebundenen Zielparent veröffentlichen. Ein fehlender Namespace-Ordner
benötigt ebenfalls diese sichere Erstveröffentlichung, nicht `mkdir` mit einer
nachträglichen ungebundenen Identitätsübernahme.

Windows kann einen gehaltenen Quellhandle mit relativem `RootDirectory` und
`ReplaceIfExists = false` umbenennen
([FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info));
macOS bietet handle-relative Parents und `RENAME_EXCL`
([Apple-XNU-rename-Vertrag](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man2/rename.2)).
Das ist eine Architekturvorbereitung, **noch keine implementierte Absicherung**.
Der native Broker muss alle Ziel-I/O besitzen; eine Lease vor Node-Absolutpfaden
genügt nicht. Intent und Eigentumsbeleg müssen die bereits bekannte Staging-
Identität vor Veröffentlichung binden. Crash nach Veröffentlichung aber vor ACK
ist an genau dieser Identität plus vollständigen Hashes abzugleichen, ebenso
vor einem Verzicht auf den Auftrag; niemals eine fremde gleichnamige Kopie
adoptieren oder unbekannte Ordner aufräumen.

Der vorgeschlagene atomare Umbenennungsweg verlangt dieselbe Dateisystemgrenze.
Bei `EXDEV` oder fehlender Unterstützung wäre ein verständlicher Stopp nötig,
kein stiller Kopier-Fallback. Sichere Unterstützung anderer Volumes bleibt
separat zu entwickeln; dies ist noch keine eingeführte Nutzerbeschränkung.
Atomare Sichtbarkeit beweist keine Stromausfalldauerhaftigkeit. Native
Windows-/beide macOS-Architektur-Gegenproben für Race, Crash, Kollision,
Rootaustausch und Dateisystemgrenzen bleiben P1 vor Standardumschaltung.

## Erster nativer Dateisystemschnitt – historischer Zwischenstand

Der interne Baustein `tauri-contract/src/export_directory.rs` ist im vorhandenen
Rust-Package implementiert, zunächst ohne zusätzliche direkte Abhängigkeit, UI-Berechtigung,
CLI-Einstieg oder Node-Aktion. Er öffnet bestehende Verzeichnisse ohne Anlage
fehlender Parents, bindet native Volume-/Objekt-/Erstellungsidentität, schreibt
Dateien relativ zu gehaltenen Handles exklusiv und synchronisiert ihre Körper.
Eine vollständige private Stage wird ausschließlich ohne Ersetzen veröffentlicht.
Die Windows-Gegenprobe verwendet
[NtSetInformationFile / FileRenameInformation](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile)
mit gebundenem Zielparent; bestehende gleichnamige Dateien oder selbst leere
Ordner bleiben unangetastet. Der erste Win32-Versuch scheiterte in der echten
Happy-Path-Probe mit Fehler 87 und wurde nicht als funktionierende Lösung
übernommen. POSIX nutzt `renameatx_np(RENAME_EXCL)` beziehungsweise
`renameat2(RENAME_NOREPLACE)` ohne Kopier-/Ersetzungsfallback; dessen native
macOS-/Linux-Ausführung steht aus.

Zwölf echte Windows-Fälle bestehen: erfolgreicher Ordnerexport gleicher
Identität, fremde leere/belegte Ordner und Dateiziele, fehlende Parents, unsichere
Blattnamen, Junction, falsche Root-/Stagebindung, bereits verschobene Stage,
32 konkurrierende Zielanlagen, gesperrter Rootaustausch und injizierter Fehler
nach **tatsächlichem** Rename. Der letzte Fall meldet ausdrücklich `Uncertain`,
nicht „nichts exportiert“. Alle 64 Windows-Rusttests sowie Clippy ohne Warnung
bestehen. Dies sind native Dateisystemtests, keine Tauri-Bedien-, echte
Stromausfall-, Cross-Volume- oder macOS-Paketabnahme.

Der begrenzte unabhängige Code-Review fand am noch unaktivierten Baustein
keinen weiteren blockierenden P1/P2-Befund, aber eine missverständliche
Inspektions-API: Der kurzlebige Windows-Inspektionshandle muss Löschfreigabe
mit dem gehaltenen Stage-Eigentümer teilen und ist deshalb kein unabhängiger
Schreib-/Namensbesitz. `inspect_child` liefert jetzt nur die geprüfte Identität,
keine neue Verzeichniskapazität. Auf POSIX wird zusätzlich das vorbereitete
Stage-Verzeichnis vor dem Rename synchronisiert. Beide Nachbesserungen sind
erneut durch alle 64 Windows-Rusttests und Clippy geprüft; daraus folgt weder
eine macOS-Laufzeitfreigabe noch eine Freigabe des vollständigen Exportwegs.

Der damalige Integrationsreview fand am synchronen Helper-Vorschlag keinen
belegten vollständigen Kindprozessbesitz. Der anschließende Schnitt verwendet
stattdessen einen privaten Rückkanal zur bereits besessenen nativen Hülle;
kein zusätzlicher Exporthelper wird gestartet. Eine asynchrone Anbindung muss
die Dokument-Kontrollsperre bis zum tatsächlichen Abschluss halten. Der bisherige
synchrone `finally`-Pfad ist inzwischen durch einen Promise-bewussten Besitzer
ersetzt; sechs reale Sperr-/Fehlergegenproben bestehen. Ein zukünftiger nativer
Timeout darf diesen Besitzer nicht vor Ende der tatsächlichen Schreibarbeit lösen.

## Nativer Transaktionskern und tatsächlicher Prozessabbruch – vorausgehender Schnitt (2026-10-07)

`native_export_channel.rs` und `standalone/native-export-channel.js` verbinden
jetzt ausschließlich die native Metadatenbindung des exakt per Picker gewählten
Ergebnisordners. Geschlossene Frames, Anfrage-/Einmalbindung und dezimale native
IDs verhindern eine stille Ableitung aus JavaScript-`stat`. Der Rückkanal wird
innerhalb der vorhandenen Antwortpumpe behandelt, ohne rekursive RPC. Nur
ausdrücklich optierte v2-Konfigurationen nutzen ihn; Legacy/Cowork unverändert.
Blockierte reine Metadatenleser haben eine Deadline, späte Antworten werden
verworfen. Die Lifecycle-Barriere erfasst native Arbeit und schließt zusätzlich
die Start-/Registrierungslücke beim besessenen Sidecar. Das ist **keine aktive
Exportveröffentlichung** und keine neue Renderer-Dateisystemberechtigung.

Der interne `native_export_transaction.rs` bindet unveränderliche Aufträge an
Lauf, Operation, Zweck, Anfragehash, native Journal-/Staging-/Zielparents und
neutrale Dateimengen. Größen und SHA-256 werden handle-relativ geprüft. Eine
OS-Besitzsperre serialisiert den Transaktionsbesitz; unbekannte Stages und
Teil-Dateien werden nicht adoptiert, überschrieben oder aufgeräumt. Vor Retry,
ACK und Verzicht wird eine möglicherweise schon veröffentlichte Kopie anhand
der **vorher bekannten** Stageidentität und ihrer gesamten Dateimenge abgeglichen.
Fehlen beide bekannten Namen, bleibt der Status unklar; keine neue Kopie oder
falsche Verzichtsbestätigung. Der normale Ergebnisordner bleibt erhalten.

Zwei unabhängige Befunde sind korrigiert: Wiedergeöffnete Windows-Zielordner
teilen keine Löschfreigabe und behalten ihre Parent-/Namensbindung; die
Wiederherstellungsfähigkeit ist ausdrücklich nur lesend. Journalbelege werden
vollständig exklusiv vorbereitet, synchronisiert, zurückgelesen und erst danach
nativ ohne Ersetzen unter ihrem endgültigen Namen veröffentlicht. Abbrüche lassen
nur private `pending-*`-Reste, keine halben finalen Belege. Identische vorhandene
Belege benötigen keine neue Vorbereitung. Begrenzter unabhängiger Abschlussreview
ohne weiteren konkret belegten P1/P2 im geprüften Baustein, keine Gesamtfreigabe.

Zwölf Transaktionsregressionen einschließlich zwölf injizierter Speicherfehler
und zwölf **wirklicher Testprozess-Beendigungen** bestehen auf Windows. Bei der
Prozessprobe wird ausschließlich das eigene Testkind am bestätigten Checkpoint
beendet, ohne dessen normale Destruktoren. Frisch geöffnete Handles finden genau
eine korrekte Kopie wieder; auch die OS-Sperre wird frei. Das ist weder ein
Stromausfalltest noch der Abbruch des vollständigen paketierten App-Workflows.
Insgesamt 100 Windows-Rusttests bestehen. Zwei ignorierte Kindhelfer sind keine
selbständigen Abnahmenachweise: Die Eltern-Tests starten sie für insgesamt
16 tatsächliche eigene Prozessbeendigungen (zwölf Transaktions- und vier
Parent-Anlagegrenzen). Clippy prüft alle Targets ohne Warnungen.
`sha2` und Unix-`libc` sind nun direkte, exakt an bereits vorhandene Lockfile-
Versionen gebundene Abhängigkeiten; keine zusätzlichen Versionen nachgeladen.
POSIX ist noch nicht nativ ausgeführt. Seine Namensprüfung ist keine persistente
Namespace-Sperre gegen einen bereits berechtigten Schreiber.

`export_private_security.rs` prüft private Verzeichnisrechte an gehaltenen
Handles, ohne Rechte nachträglich zu reparieren. Windows-Anlage und erneutes
Öffnen samt absichtlich verbreiterter ACL sind real gegengeprüft. Eine unabhängig
gefundene Darwin-Verwechslung des Rückgabewerts von `acl_get_entry` ist anhand
der Apple-Implementierung korrigiert; ein reiner Vertragsfall besteht auf
Windows. Die zusätzlich geschriebenen nativen Mac-ACL-Gegenproben sind **NOT_RUN**,
nicht durch Windows-Tests belegt. Die Schutzgrenze betrifft gewöhnliche andere
Konten, nicht denselben bereits berechtigten Benutzer oder Administratoren.

`native_export_workspace.rs` verankert private Journal-/Staging-Parents in einem
unveränderlichen Intent und einem vollständigen nativen Identitätsbeleg. Nach
Abbruch werden nur die vorher gebundenen Objekte wieder geöffnet. Intent ohne
Binding bleibt unklar, Binding ohne Intent ist ein Konflikt; keine Adoption,
Reparatur, neue Ersatzkopie oder automatische Löschung. Sieben Regressionen
einschließlich vier tatsächlicher Kindprozess-Beendigungen bestehen. Begrenzter
unabhängiger Abschlussreview ohne weiteren belegten P1/P2 im aktualisierten
Baustein. Historische Root-Trennung, dauerhaft verankerte Eingangshandles und
äußerer Freigabebesitz bleiben Voraussetzungen des noch fehlenden Aufrufers.

In diesem vorausgehenden Schnitt war der Node-Publisher noch nicht ersetzt.
Der folgende Anschluss löst Bootstrap und native Ziel-I/O; eine reine
Metadatenbindung wäre dafür weiterhin nicht ausreichend. Cross-Volume erhält
keinen stillen Kopier-Fallback. Neue native Windows-/beide macOS-Pakete und
deren Abbruch-/Wiederverbindungs-/Bedienprobe bleiben offen.

## Tatsächlicher v2-Exportanschluss (2026-10-07)

Der Desktop-Sidecar verwendet jetzt `native_export_broker.rs` über den bereits
besessenen privaten Antwortkanal. Die ausdrückliche Ordnerwahl erzeugt native
Privatrechte und dauerhaft gespeicherte Identitäten von Datenroot, privatem
Arbeitsparent und beiden öffentlichen Zweck-Namespaces. Einstellungsschema 4
und Operationsschema 5 bewahren diese **ursprünglichen** Bindungen; alte
Einstellungen werden nicht aus frischen Stat-Werten hochgestuft. Erneute
Ordnerwahl ist für neue Exporte ohne solche Bindung erforderlich. Bestehende
Operationen wechseln auch bei neuer Ordnerwahl nicht das Ziel. Keine neue
Renderer-Pfadberechtigung, kein Exporthelper und keine Cowork-Exportaktion.

Freigegebene Körper werden in 64-KiB-Blöcken ausschließlich über die private
Pipe übertragen. Native begrenzt eine laufende Körperpufferung auf die
gebundene Einzeldateigröße, prüft Offsets, Endmarkierung, Größe und SHA-256 und
schreibt nur durch die zuvor gebundenen Handles in den jeweiligen Operationsstage.
Zwei unabhängig reproduzierte P2 des ersten Anschlussversuchs sind dadurch
geschlossen: Node schreibt keinen Originaltext mehr in einen ausgetauschten
Spoolordner, und Körperreste sammeln sich nicht im gemeinsamen 2.048-Einträge-
Journalinventar. Die Journalgrenze wird nicht erhöht und keine Datei gelöscht.
Auch der Root-Trennungsreader unterstützt das neue Einstellungsschema; sonst
verweigerte die nächste Abfrage die zuvor erfolgreich gespeicherte Einstellung.

Die Dokumentsperre bleibt bis zur tatsächlichen Erledigung aller nativen
Aufrufe gehalten. Ihr Besitzer ist im Desktopbetrieb der geprüfte native
Elternprozess, nicht der austauschbare Sidecar-PID. Stirbt nur der Sidecar,
kann ein anderer Prozess die laufende native Schreibarbeit nicht als verwaist
überholen. Diese konservative Sperre erfordert nach solchem Kontrollabbruch
derzeit einen vollständigen App-Neustart; automatische Besitzerbereinigung
und vollständiger Wiederverbindungsvertrag bleiben offen.

Der echte Node-Dokumentstore → private Pipe → Rust-Dateisystemweg besteht auf
Windows für beide Zwecke: echte Bytes, verlorene Abschlussantwort, späterer
Widerruf, Abgleich/ACK derselben Kopie, Öffnen, verweigerter Verzicht auf fertige
Kopie, Inventarmanipulation, geänderter Körper, expliziter Verzicht,
mehrteiliger Unicode-Körper und ausgetauschter Privatroot ohne Originaltext-
Schreibzugriff. Das ist keine vollständige native Tauri-/GUI-Paketabnahme.
103 Windows-Rusttests bestehen, drei ignorierte Helfer werden nur von ihren
Eltern-/Pipe-Tests verwendet. Clippy ist warnungsfrei; acht Kanal- und sieben
Dokumentbesitzfälle bestehen. Neue native Mac-Gegenproben bleiben NOT_RUN.
Der lokale Gesamtprodukteingang enthält nun 217 Testdateien; seine aktuelle
Gesamtbewertung bleibt von den gezielten Exportgegenproben getrennt.

## Dateifehler und grafischer Abgleich (2026-10-07)

Echte terminal gestoppte v2-Dateien erhalten jetzt zusätzlich zum Prozessjournal
einen geschlossenen unveränderlichen Fehlerbeleg mit Mitgliedschaft, Dateiname,
Zweck und Grund. Nach Journalablauf bleiben diese Details verfügbar. Fehlgeschlagene
unveröffentlichte Entwürfe blockieren keine gesunden Dokumentprüfstände; vorhandene
oder auch defekte Veröffentlichungsbelege verhindern eine falsche Fehlerklassifikation.
Sieben reale Persistenz-/Konfliktgegenproben und begrenzter unabhängiger Review
bestehen. Das implementiert noch **keine einzelne Datei-Wiederholung/Auslassung**.

Die synthetische Browserprobe bestätigt Sammelauswahl ohne Entscheidung,
explizite Freigabe/Widerruf, getrennten Exportdialog vor I/O und Original-/Markdown-
Vergleich. Die Auswahlspalte bricht nicht mehr unleserlich um. 1280-/600-Pixel-
Darstellung, sichtbare zentrale Behandlung, kein horizontaler Seitenüberlauf
und keine Warn-/Fehlerausgaben in der geprüften Sitzung; dies ist keine native
Paket-, vollständige grafische, Screenreader- oder fachliche Inhaltsabnahme.

Der damalige Gesamtprodukteingang umfasste 217 Testdateien. Der ausgeführte
Gesamtlauf stoppte am unveränderten Git-Tracking-Gate für neue unversionierte
v2-Produktdateien; er wird nicht als PASS deklariert. Dokumentationsgates und
gezielte Funktionsprüfungen bestehen. Der veröffentlichungsgebundene `build`
stoppt weiter korrekt an `BUNDLED_PLUGIN_SOURCE_COMMIT_INVALID`,
`test:plugin-zip` findet kein neu gebautes RC158-Pluginarchiv. Die strenge
installierte Claude-CLI-Prüfung bestätigt lediglich die Plugin-/Marketplace-
Struktur, nicht die neue native Exportfunktion. Keine Commits, Pushes,
Actions-Starts, Standardumschaltung oder Veröffentlichung in diesem Schnitt.

## Lokales Windows-v2-Testpaket und grafische Nachprüfung (2026-10-08)

Ein gesonderter Engineering-Bau aktiviert `workspace.html` über eine auf den
Bauprozess begrenzte Tauri-Konfiguration; der reguläre Einstieg wird noch nicht
umgeschaltet. Das frisch gebaute Paket r3 (ersetzt r2) liegt unter
`dist/engineering-workspace-v2-windows-20261008-r3/`. Die Testanleitung und der
separate Prüfnachweis stehen daneben, nicht als zusätzliche Dateien im
verifizierten Archiv. ZIP: 611 Einträge, 111.006.602 Bytes, SHA-256
`f95c3ff09aa6f18da552e48d12852a5e4e53386340a483df9e15d5e2b14e6cba`.
Der Versionsaufdruck bleibt RC158; dieses Paket ist nicht das veröffentlichte
RC158-Release und bindet einen unveröffentlichten, nicht sauberen Quellstand.

Nachweise bleiben getrennt:

- Archiv-Verifier: PASS für genau diese ZIP.
- Tatsächlicher paketierter Sidecar: PASS für gemischte Formate/beide Zwecke,
  benannte beschädigte CSV, Personen-/Unternehmensentscheidungen, Folgegruppen,
  Vertagen/Neustart, OCR-Originalpixel/Korrekturen und Verlauf bei geändertem Ziel.
  Das ist kein vollständiger Tauri-v2-GUI-/Exportnachweis.
- Exakter nativer Start auf Windows 11 x64, Build 10.0.26200.0, WebView2
  154.0.4258.62: Haupt-/Prüfseite geladen; `get_public_state`, `get_ui_context`
  und `get_review_session` erfolgreich. Startdauer 1.361,89 ms im isolierten
  Testprofil. Kein vollständiger nativer Entscheidungs-/Exportablauf, keine
  Netzwerkbeobachtung oder menschliche Zielhostfreigabe daraus ableiten.
  Beim Testende meldete WebView2 `Failed to unregister class Chrome_WidgetWin_0`
  (Windows-Fehler 1412); der Test beendete sich mit Exit 0. Daraus ist kein
  beobachteter Bedienfehler abzuleiten, die Shutdown-Warnung bleibt dokumentiert.
- Synthetischer Browser: vollständige OCR-Sammelübergabe über zwei Seiten
  (50 + 14 Zeilen), Folge-/Warteansicht, Dokumentvergleich, explizite
  Sammelfreigabe und eigener Exportdialog. Häkchen allein mutieren nicht.
  Bei 720 × 560 kein horizontaler Seitenüberlauf; Aktionen bleiben erreichbar.
  Initialer Fokus geht jetzt zur Prüflistenüberschrift statt zum Detailwert,
  damit bei gestapeltem Layout die Sammelwerkzeuge sichtbar bleiben.
  33 Rendererfälle bestätigen den Fokusvertrag. Der Vorschauadapter setzt
  seinen Ergebnisbereitschaftsstatus konsistent; seine VM-Gegenprobe prüft beide
  Zwecke. Keine verarbeiteten Produktdateien aus dieser Simulation behaupten.

Der echte Node-Store/Pipe/Rust-Exportnachweis vom vorausgehenden Anschluss bleibt
ergänzende Quell-/Dateisystemevidenz, keine nachträgliche Aufwertung des nativen
Starttests. Neue v2-Dateien sind nun ausdrücklich per Intent-to-add zur
Versionierung vorgemerkt, ohne Inhaltscommit. Der nächste Gesamtprüflauf fand
eine echte Lücke: `privacy/transform-plan.js` fehlte in `CORE_POLICY_FILES`,
sodass Änderungen an dieser neuen Logik die gebundene Wiederaufnahmeregelversion
nicht änderten. Die Datei ist nun enthalten, ohne die Prüferwartung zu lockern.
25 Versions-/Pseudonymfälle und neun reale Plugin-/Standalone-Projektions- und
Neustartfälle bestehen. Eine unabhängige lesende Gegenprüfung bestätigt die
Bindung und Ablehnung früherer gebundener Kontexte. r3 projiziert deshalb die
Node-Produktquellen frisch; der unveränderte native Desktop-Build bleibt gleich.
Neue Testläufe verwenden: Unvollständige ältere Engineering-Läufe mit anderer
Regelversion bleiben absichtlich gesperrt; keine stille Freigabe-/Mappingmigration.
Der vollständige Gesamtprodukteingang besteht nach dieser Korrektur mit
96 Basis- plus 121 direkten Testdateien (217 insgesamt). Dokumentationsgates,
`git diff --check` und strenge lokale Claude-CLI-Strukturvalidierung bestehen;
letztere belegt keine Cowork- oder native Standalone-Bedienabnahme.

Einzeldatei-Retry/Auslassen ist weiter offen. Die lesende Gegenprüfung bestätigt,
dass einfache Wiederverwendung von `Fortsetzen` weitere offene Dateien,
Maintenance und Fehlerstabilisierung berühren würde. Der in BL-010.53.7
präzisierte Zielvertrag verlangt daher dauerhaften Zielauftrag, Versionsbindung,
atomaren Claim, durchgängige Zielmenge und Lost-ACK-/Neustartabgleich.
Vollständige grafische/Accessibility-Abnahme, native v2-GUI-Prüfung auf Windows,
beide Mac-Pakettests und sequenzierte Wiederverbindung bleiben ebenfalls offen.
`build` bleibt am gebundenen Quellcommit rot; das neue Pluginarchiv fehlt weiterhin.
Ein zusätzlicher `cargo fmt --check` meldet Formatierungsdrift im Rustbaum,
auch in unveränderten Bestandsmodulen. Keine funktionsfremde Massenformatierung
durchgeführt; dieser Check wird nicht mit den bestandenen Rusttests/Clippy
verwechselt und nicht als grün ausgewiesen.
Kein Commit, Push, Actions-Start, Standardwechsel oder Release aus diesem Testbau.

## Wiederverbindung und tatsächliche Windows-GUI-Kette (2026-10-08, r7)

Aktueller Engineering-Schnitt: `dist/engineering-workspace-v2-windows-20261008-r7/`,
SHA-256 `bb603fdf95e6487f39131e8a4582976a18cdaa095c8f4b05ab9a168cda91e8ad`.
r3–r6 bleiben historische Zwischenstände. Kein veröffentlichtes RC158-Paket,
keine Standardumschaltung; `TESTHINWEISE.txt` und `PRUEFNACHWEIS.json` daneben.

Automatische Wiederverbindung ist implementiert. Native Besitzergeneration,
bestätigtes Prozessende und drain aller nativen Aufträge verhindern voreilige
Sperrfreigabe. Sequenzierte Invalidierung verwirft veraltete UI-Antworten und
private Auswahlen. Ein erfolgreicher neuer Ready-Handshake lädt nur Kontext;
Start/Entscheidung/ACK/Export werden nicht automatisch wiederholt.
106 Windows-Rustfälle plus drei nicht separat gezählte Kindhelfer, Clippy,
38 Workspace-, 34 Review-, 37 Dokumentrenderer- und zehn Besitzfälle bestehen.

Zwei r6-GUI-Gegenbefunde sind korrigiert und in r7 neu geprüft:

- Eine tatsächlich gestoppte CSV mit `PARSE_FAILED` blockierte durch einen zu
  engen Renderer-Vertrag auch gesunde Dokumentprüfstände. Begrenzte feste
  Prozesscodes werden jetzt sicher als Text mit Dateiname/Grund angezeigt;
  unbekannte oder fehlende Dokumentautorität bleibt gesperrt.
- Tauri ordnet JSON-Objektschlüssel um. Der Vergleich einer vertraulichen
  Identitätsauswahl hielt gleiche Werte deshalb fälschlich für verändert.
  Ein zuerst roter Regressionstest belegt den Defect; der Vergleich verwendet
  nun validierte Dokument-ID/Revision/Hash-Werte. Keine Lockerung der
  Inhalts-/Bindungsprüfung oder Änderung der Exportreihenfolge. 39 Dokument-
  und sieben tatsächliche Node/Pipe/Rust-Fälle sowie unabhängiger begrenzter
  Korrekturreview bestehen.

Die agentisch beobachtete native r7-Kampagne verwendet ausschließlich ein neues
isoliertes Profil und drei synthetische Dateien. Native Ordnerwahl/Start,
direkte integrierte Sammelprüfung (sieben Vorkommen in drei Gruppen über zwei
Dokumente), Unternehmen/Person/Beibehalten, Auswahl ≠ Entscheidung, Vormerken ≠
Übergabe, Warteindikator und automatischer Rückweg sind beobachtet. Der echte
Original-/Markdown-Vergleich zeigt typisierte Ersetzungen. Beide Dokumente sind
erst ausgewählt (0 freigegeben), dann ausdrücklich freigegeben. Der bestätigte
KI-Export schreibt genau zwei neutrale Markdown-Dateien; vorher ist der bei
Ordnerkonfiguration angelegte KI-Namespace leer. Keine Zuordnungen, Originale,
Bilddaten oder technischen Begleitdateien im Export, Quellhashes unverändert.
Die beschädigte `03-defekt.csv` bleibt mit Ursache/Endung separat sichtbar.

Nach kontrollierter Beendigung ausschließlich des eigenen r7-Sidecars verbindet
die App automatisch neu. Die Dokumentauswahl ist verworfen; ausdrückliches
Neuladen zeigt weiterhin beide Freigaben und genau einen fertigen Export samt
ACK. Reguläres Schließen beendet App und Sidecar. Dies beweist weder jeden
Abbruchzeitpunkt noch Screenreader-, menschliche N3/N4- oder native Mac-Abnahme.
Archiv-Verifier, echter Paket-Sidecar und der erneute vollständige
Gesamtprodukteingang (217 Testdateien) bestehen. Einzeldatei-Retry/Auslassen,
vollständige Grafik-/Accessibility-Kampagne, beide neuen Mac-Pakettests sowie
sauber gebundener Releasebuild/Pluginarchiv bleiben offen.

Zusatzprobe desselben r7-Archivs: neuer isolierter Nur-Markdown-Start und
native Ergebnisordnerwahl beobachtet. Der Quellenpicker ließ sich im
Computer-Use-Helfer nicht zuverlässig bedienen (ungültige Fenstergeometrie).
Vor Verarbeitung abgebrochen; kein weiterer PASS und kein App-Defect daraus
abgeleitet. Eigene überprüfte Testprozesse beendet, Profil erhalten.

Der unabhängige Retry-Review ergänzt drei verbindliche Vorbedingungen in
BL-010.53.7: nur noch vorhandene verifizierte private Kopien erneut verwenden,
unveränderliche Fehler-/Basisstände durch versionierte Versuche ablösen und
neue Abschlussgenerationen statt Umschreiben früherer Nachweise verwenden.
Gegenbeispiele mit fremden Fehlern/Freigaben, Lost-ACK und Neustart bleiben
vor der Aktivierung eines Einzeldatei-Buttons zwingend.
