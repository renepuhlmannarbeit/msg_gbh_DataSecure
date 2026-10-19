# Produktvertrag: GBH DataSecure

Stand: 19.10.2026 · 3.2.0-rc166 · Ist-Zustand RC166 (Entwicklung) · veröffentlichte Windows/macOS RC165 unverändert · Linux RC159 · Cowork RC151

**Aktuelle Standalone-Präzisierung nach RC164:** Der normale Dokumentweg benötigt
keine gesonderte Pflichtfreigabe mehr. Nach der Fundstellenprüfung können die
bereits angewendeten Maskierungen angesehen und gewünschte Dokumente gewählt
werden. Eine lesende Exportvorschau und anschließend **Freigeben und exportieren**
bestätigen genau diese Textstände. Intern bleiben revisions-/hashgebundene
Freigabe, erneute Kandidatenprüfung, native Zielbindung, eindeutiger Exportauftrag
und Empfangsbestätigung getrennte technische Schritte. Der Klick behauptet keine
menschliche Lektüre aller Dokumente oder vollständige Anonymität. Nur freigeben
und Widerrufen bleiben optionale Verwaltungsaktionen. Dieser Ablauf ist als
RC165-Testpaket veröffentlicht, kein menschlicher Zielhost-PASS.

Windows und beide Mac-Architekturen binden in RC165 den Appcommit
`973274f17cda46bb66621d956af2cbc96e2272e3`/Build `973274f1`.
Linux bleibt beim RC159-Paket aus Quellcommit `7af2a9d0268864a01b954e0175cae9f5a3616fe8`.
[Release und begrenzte technische Nachweise](../RELEASE.md).
Die integrierte lokale Prüfung und Identitätszuordnung gehören ausschließlich
zum Standalone-Adapter; der veröffentlichte Cowork-Weg wird dadurch nicht verändert.

## Ziel

Lokaler RC160-Nachtrag (13.10.2026, DS-085/DS-110): Reine Konvertierung und
Markdown-Nachkorrektur erhalten Originalinhalte und ursprüngliche Basisnamen
mit `.md` (eindeutige Kollisionszusätze), ohne Inhalts-/Namensanonymisierung.
Zielpräzisierung vom 14.10.2026: Das Standardprofil enthält lesbaren Text und
Tabellen, keine Bilder, Bildverweise oder technischen Konvertierungsnotizen.
Erkannte Wörter, echte Überschriften, Listen, Tabellenwerte und sichtbare
Bildunterschriften bleiben erhalten. Technische Container-Metadaten und
Extraktions-/Unsicherheitsmeldungen gehören in lokale Dokumentinformationen,
nicht in die Seitenprosa. Ein erläuterndes Profil behält die bisherigen Hinweise.
Scan-Texterkennung und zusätzliche Bild-/Grafik-Texterkennung werden getrennt
gewählt und unveränderlich im Lauf gespeichert; zusätzliche Bild-OCR ist
standardmäßig aus. Dieser vollständige Optionsanschluss ist noch in Arbeit.
Echte Codebeispiele und Literalinhalt bleiben erhalten. Anonymisierung,
Fundstellenprüfung und technische Dokumentfreigabe bleiben getrennte Verträge;
die finale Exportbestätigung kann die Freigabe einschließen. Der Schnellweg
kennzeichnet seine automatische Erstfreigabe, nicht eine menschliche Prüfung.
Keine garantierte OCR-Wahrheit; Exporte sind auch ohne KI verwendbar.

DataSecure umfasst zwei lokale Produkte mit gemeinsamem Verarbeitungskern:
Das Cowork-Plugin de-identifiziert Geschäftsdokumente vor einer ausdrücklich
gewünschten Claude-Auswertung. Standalone bietet unabhängig davon dieselbe
Anonymisierung sowie reine Markdown-Konvertierung **ohne** Anonymisierung.
Menschen wählen Dateien und Zweck; Originale bleiben unverändert. Der
Anonymisierungsmodus reduziert Daten, garantiert aber keine rechtliche
Anonymität. Keines der Produkte trifft Personal- oder Fachentscheidungen.

Einfachheit ist Produktziel: vorhandene Bedienwege und gemeinsame Kernlogik
wiederverwenden, statt für Fehler neue Einstellungen oder Sonderabläufe
einzuführen. Claude erhält knappe aufgabenbezogene Anweisungen; technische
Schutzprüfungen bleiben im Code. Nur tatsächlich mehrdeutige Inhalte benötigen
eine lokale Fachentscheidung, nicht jeder erfolgreiche Verarbeitungsschritt.

## Normalreise: Standalone RC165, nach RC164 vereinfachter Weg

Die bewusste Zweckwahl aus DS-086 bleibt erhalten; Benennung und Darstellung
wurden mit v2 erneuert. Historische Abgrenzung: Der integrierte Standalone-
App-Review war in RC151 noch nicht enthalten oder nativ abgenommen.

Unter **Neue Verarbeitung** wird ausdrücklich **Nur umwandeln** oder
**Umwandeln und anonymisieren** gewählt. Dateien/Ordner hinzufügen und anhaken
verarbeitet noch nichts; **Verarbeitung starten** beginnt den ausgewählten
Stapel. Die laufgebundene Ansicht nennt Fortschritt und Dateiprobleme.
**Pausieren** beendet die aktive Datei einschließlich Bereitstellung; danach
beginnt keine weitere. **Verarbeitung fortsetzen** gehört genau zu diesem Lauf.

**Jetzt prüfen** öffnet die integrierte Fundstellenprüfung ohne Verlaufsumweg.
Checkboxen sind Auswahl, zentrale Aktionen merken Entscheidungen zunächst vor;
erst **Gruppe übergeben und weiter** speichert eine vollständig behandelte
Gruppe. Bewiesen gleiche vollständige Entitäten werden laufweit wiederverwendet;
OCR-Korrekturen bleiben an konkrete Originalfundstellen gebunden. Originalpixel,
Quelltext und Markdown-Vorschau bleiben lokal im berechtigten privaten Prüfweg.
Der inhaltsfreie öffentliche Metadatenkanal ist davon getrennt; der Workspace
erhält Dokumentinhalte nur über den expliziten privaten Dokumentprüfvertrag.
Coworks Reviewadapter bleibt unabhängig.

Nach bestätigtem Fundstellenabschluss öffnet sich bei Anonymisierung die
Dokumentprüfung **desselben Laufs**, nicht nur dessen Status-Momentaufnahme.
Original und geplanten Text vergleichen, gewünschte Dokumente auswählen und
**Auswahl exportieren** wählen. Die Vorschau zeigt Namen und gespeicherten
Ergebnisordner; sie speichert keine neue Freigabe und kopiert nichts.
**Freigeben und exportieren** bestätigt die genaue Auswahl einmal. Noch fehlende
Freigaben werden atomar gespeichert; nach eindeutigem vollständigem ACK werden
die neuen Revisionen und der unveränderte Dateiplan erneut geprüft. Erst danach
gelangen aktuelle freigegebene Markdown-Stände in einen separaten Exportordner.
Eine verlorene Freigabeantwort oder veränderte Vorschau startet keinen Export.
Eine bereits gespeicherte Freigabe kann dabei bestehen bleiben; neu laden und
bewusst erneut auswählen statt blind wiederholen. Freigaben binden Revision/Hash;
Änderungen heben betroffene Freigaben auf. **Auswahl nur freigeben** ist optional.
Originale, private Prüfstände und Zuordnungen werden nicht mitkopiert.
Fundstellenabschluss ist weder Dokumentfreigabe noch Exportabschluss.

**Später entscheiden** lässt einen gespeicherten Lauf offen; unübergebene
Eingaben sind nicht gespeichert. **Verlauf** berücksichtigt nur die letzten 5 Verarbeitungen mit
eigenen Aktionen; bei verfügbaren fertigen Ergebnissen steht **Ergebnisordner
öffnen** zuerst und grün. **Prüfung öffnen** beziehungsweise **Nachkorrektur öffnen
(optional)** bleibt separat direkt erreichbar, danach Laufdetails, Hinweise und
Weitere Aktionen. Neustart/Verbindungsverlust wiederholen Starts, Entscheidungen
oder Exportbestätigungen nicht blind. Der gespeicherte Stand muss bewusst
neu geladen werden; neue Eingaben starten keine alte Verarbeitung heimlich.
**Markdown nachkorrigieren** gehört zum reinen Konvertierungszweck, dessen
Ausgaben ausdrücklich Originalinhalte und keine Anonymisierung enthalten.

Eine seit RC157 veröffentlichte Standalone-Erweiterung (BL-010.45) ist die
**automatische vertrauliche Identitätszuordnung** für Menschen. `[PERSON_011]`
ist nur ein Beispiel, weder ein festes Kennungsformat noch eine Beschränkung
auf Personen. Alle tatsächlich eindeutig zuordenbaren Pseudonyme – darunter
Unternehmens- und Projektkennungen – gehören dazu. Die bestehende Datei-Zuordnung
leistet das nicht. Generische Sammelmasken wie `[EMAIL_REDACTED]` dürfen nicht
irreführend einem einzigen Originalwert zugewiesen werden. Die vertrauliche
TXT-Datei liegt pro Lauf in `VERTRAULICH-NICHT-HOCHLADEN` unter dem
Ergebnisordner; private Einzelsnapshots bleiben im App-Datenbereich. Sie enthält
Originalwerte und darf nicht in KI-Systeme hochgeladen werden. **Der gesamte
Laufordner ist damit kein KI-Uploadpaket.** Die Datei wird nicht automatisch
gelöscht; die App bietet keinen Dateilöschbutton. Nur die 5 jüngsten Läufe sind direkt
im Verlauf erreichbar. Ältere Zuordnungen lassen sich über „Einstellungen und
Hilfe → Vertrauliche Zuordnungen öffnen“ im privaten lokalen Ordner auffinden.
Erfasste und nicht eindeutig zuordenbare Stellen werden getrennt ausgewiesen.
Betriebssystemkonto und Datenträgerverschlüsselung müssen den
lokalen Zugriff schützen; eine zusätzliche Dateiverschlüsselung ist bislang
nicht implementiert.

## Normalreise: Cowork RC151

1. In Cowork „Dateien anonymisieren“ schreiben oder den gleichnamigen Skill wählen.
2. Nur beim ersten Lauf einen lokalen Ergebnisordner ausdrücklich wählen.
   Ein bereits mit Cowork verbundener dedizierter Ordner ist optional; DataSecure
   erkennt verbundene Arbeitsordner nicht selbst. Es merkt sich die Wahl und legt darunter
   `DataSecure-Output` an; spätere Läufe überspringen diesen Schritt.
3. Im lokalen Mehrfachpicker bis zu 200 Dateien mit zusammen höchstens 500 MiB
   auswählen und einmal „Öffnen“ klicken.
4. DataSecure liest Quellen nur, prüft den gesamten Stapel und verarbeitet ihn
   lokal im Hintergrund. Klare Dateien werden ohne Reviewdialog abgeschlossen;
   ein sicherer Stopp oder eine Mehrdeutigkeit blockiert den Reststapel nicht.
5. Die lokale Abschlussmeldung zeigt nur Zähler und bietet „Ergebnisse öffnen“.
   Nur verifiziertes Markdown liegt sichtbar unter `DataSecure-Output/Lauf-…`.
   Cowork verwendet neutrale Namen. Standalone spiegelt bei Ordnerauswahl die
   relative Quellstruktur und verwendet je Stapel entweder neutrale Namen
   (datensparender Standard) oder auf ausdrückliche Wahl den Quellbasisnamen mit
   `-anonymisiert.md`. Dort liegt zusätzlich die lokale
   `DataSecure-Zuordnung.csv` für genau diesen Lauf. Im Cowork-Produkt bleiben
   Originalnamen und die dauerhafte `DataSecure-Mapping.csv` privat. Private
   Arbeitskopien, Review- und Recoverydaten bleiben in beiden Produkten intern;
   Originale bleiben an ihrem gewählten Quellort.
6. Erst ein späterer ausdrücklicher Auftrag übergibt benötigte freigegebene
   Markdown-Ergebnisse begrenzt an Claude.

DS-101 ergänzt im noch nicht veröffentlichten Quellstand die **ausdrückliche
Wiederverwendung**: Bereits übergebene Cowork-Stapel können ohne neue
Anonymisierung in einem lokalen Dialog erneut gewählt werden, auch bei nur
einem Kandidaten. Standard bleibt die ungelesene Warteschlange; eine leere
Warteschlange löst keine automatische Wiederholung aus. Jede Seite wird gegen
dieselbe unveränderte, noch gültige Paketgeneration geprüft. Standalone-Stapel,
Originale und reine Konvertate sind nicht Teil dieses Claude-Übergabewegs.

Kein Profil-, Bildmodus-, Einzeldatei- oder Ergebnislesedialog gehört zum
Normalstart. Ein zurückgestellter Sammelreview wird ausdrücklich und lokal
fortgesetzt. Er zeigt nur die tatsächlich mehrdeutigen Dateien, direkte
Beibehalten-/Anonymisieren-Aktionen und inhaltsfreie Fortschrittszähler.
Eng begrenzte namensförmige Subjekte in gewöhnlicher Prosa, die der automatische
Kontext nicht eindeutig einordnen kann, werden dort als konkrete Fundstelle
**„Als Person anonymisieren“** oder **„Kein Personenname – beibehalten“**
entschieden. DataSecure rät nicht; die Entscheidung gilt gegenüber späteren
Reviews nur für die gezeigte Stelle. Gleich geschriebene offene Namen werden
innerhalb des aktuellen Sammelreviews konsistent entschieden, während eine
bestätigte Person das stapelweit stabile Pseudonym erhält.

BL-021.3 erweitert im unveröffentlichten Quellstand den lokalen Review auf
exakt lokalisierbare, ausschließlich heuristische Rest-Personenkandidaten.
Exakt gleich geschriebene Kandidaten desselben Typs werden innerhalb **eines**
Reviews mit einer sichtbaren Entscheidung gemeinsam behandelt. Technisch wird
die Entscheidung dennoch an jede geprüfte Fundstelle der unveränderten Fassung
gebunden; es entsteht keine dauerhafte Wortfreigabe. Direkte Identifier,
bekannte Originalwerte, explizite Personenfelder und unlokalisierbare Befunde
bleiben unabhängig gesperrt. Reine Markdown-Konvertierung bleibt unverändert.

BL-021.4 ergänzt dieselbe lokale Entscheidung vor einer Identitätsbindung:
Eine rein typografisch namensähnliche Versalienüberschrift bei unabhängig
belegtem Personenbezug ist noch keine bewiesene Person oder Firma. Sie darf
nicht vorab eine stapelweite Personen-, Unternehmens- oder Projektzuordnung
erzeugen. Explizite Personenfelder und tatsächlich erkannte bestehende
Identitäten bleiben geschützt. Es gibt weder eine technische Wortfreigabeliste
noch einen neuen Bedienmodus; ungeklärte Stellen gehen in den vorhandenen Review.

## Eingaben und Ergebnisse der Anonymisierung

| Bereich | Aktueller Vertrag |
|---|---|
| Cowork freigegeben | TXT, Markdown, CSV und DOCX direkt; XLSX und PPTX werden lokal in Markdown extrahiert und nur als Markdown datenschutzgeprüft |
| Standalone Markdown-first nach DS-087/090 | DOCX, XLSX, PPTX, PDF, Scan-PDF, PNG, JPEG und BMP werden lokal extrahiert; gültiger, nichtleerer Markdown-Inhalt wird anonymisiert und die Quellenabdeckung separat ausgewiesen |
| gesperrt | unbekannte Formate; PDF, Scan-PDF und Bilder im Cowork-Plugin; leere OCR, beschädigte, verschlüsselte oder aktive Quellen |
| verschlüsselt/passwortgeschützt | sicher stoppen, gesondert lokal melden, nicht entschlüsseln |
| Bilder in DOCX | Pixel bleiben lokal; kein auswählbarer Modus; kein Claude-Freigabeweg |
| DOCX-Kopf/-Fußzeilen | reine Konvertierung erhält sie; Anonymisierung prüft sie vollständig, gibt sie und ausschließlich dort referenzierte Bilder aber nicht aus |
| Ergebnis | ein geprüftes Markdown je positiver Datei, dauerhaft lokales Mapping |
| Grade | vollständig verarbeitet; verwendbar mit Auslassungen; sicher nicht verarbeitet |

Eine Endung ist keine Freigabe. Signatur, Containerstruktur, aktive Inhalte,
Einbettungen und Größen werden fail-closed geprüft. Bekannte, vertraglich
klassifizierte Extraktionslücken dürfen nur im Standalone-Markdown-first-Pfad
weiterlaufen und müssen dort getrennt vom Anonymisierungsstatus sichtbar sein.
Für DOCX-Anonymisierung ist der sichtbare Ausgabeumfang nach DS-098 ausdrücklich
der Dokumentinhalt **ohne Kopf- und Fußzeilen**. Kommentare, Fußnoten und
Endnoten bleiben enthalten. Die Regel gilt in Cowork und Standalone; sie ist
keine allgemeine Heuristik für PDF-Seitenränder, PPTX-Master oder Bilder.
Belegte temporäre Office-Besitzerdateien `~$*.docx/xlsx/pptx` werden bei einer
rekursiven Standalone-Ordneraufnahme nicht als Dokumente verarbeitet. Der Name
allein genügt nicht; ein echtes OPC-Dokument mit `~$`-Namen bleibt Quelle. Nur
diese eng nachgewiesene Artefaktklasse wird übersprungen und in der UI gezählt; andere
nicht unterstützte oder verdächtige Dateien stoppen die Aufnahme weiterhin.

## Lokale Daten

- Quellen/Originale werden niemals verändert, verschoben oder automatisch gelöscht.
- Private Arbeits- und Reviewkopien sind normale lokale Dateien ohne Keyring,
  Passwort oder zusätzliche Verschlüsselung.
- Nur temporäre DataSecure-Arbeits-/Reviewdaten unterliegen 0–14 Tagen.
- Fertige Exporte und das Mapping werden niemals automatisch gelöscht.
- Der Privacy-Ordner muss lokal sein; Cloud-Sync, Netzwerkpfade und Links sind
  gesperrt.
- Ein sichtbarer Ergebnisordner darf ausdrücklich auf einem Netzlaufwerk liegen.
  DataSecure weist bei der Wahl einmal sichtbar darauf hin, dass Ergebnisse und
  – bei Standalone-Anonymisierung – die laufbezogene Zuordnungsdatei dadurch an
  andere Systeme übertragen werden können. Das ist kein zusätzlicher Dialog und
  keine Sperre.

## Claude- und Plattformvertrag

Plugin-ZIP und privater Marketplace liefern dasselbe Nutzerprodukt. Bis die
selbsttragende Marketplace-Projektion freigegeben ist, ist das Plugin-ZIP der
einzige freigegebene Installationsweg. Das intern erzeugte MCPB ist kein
Anwenderweg. Das Cowork-Plugin zielt auf Windows x64 sowie macOS Intel/ARM und
besitzt keinen Linux-Produktweg. Standalone besitzt davon getrennte Pakete für
Windows x64, macOS Intel/ARM und Linux x64 glibc. Alle nötigen Laufzeiten müssen
im jeweiligen Produkt enthalten sein; Anwender installieren weder Node.js noch
Python.

Lokale Originalverarbeitung ist in einer lokalen Cowork-Sitzung eines
bestehenden Claude-Desktop-Deployments oder in lokalem Claude Code zulässig,
wenn der lokale Plugin-MCP tatsächlich verbunden ist. Cloud-Cowork, Web, Mobil
und geplante Cloud-Sitzungen dürfen keine Originale erreichen; sie dürfen nur
bereits lokal freigegebenes Markdown verwenden.

## Zweites Produkt in Entwicklung: DataSecure Standalone

DataSecure Standalone ist eine eigenständige lokale Desktopanwendung ohne
Claude, Cowork, MCP, Skills, Agenten oder Internet. Sie teilt ausschließlich den
geprüften DataSecure-Core mit dem Plugin und besitzt einen getrennten Datenroot,
ein eigenes Paket und einen eigenen Update-/Rollbackvertrag. Der E0-Unterbau,
die Tauri-Hülle und ein selbsttragendes Windows-x64-Engineering-Paket sind
vorhanden und automatisch verifiziert, aber noch kein freigegebenes
Endnutzerpaket. Microsoft MarkItDown 0.1.7 ist ausschließlich als deaktivierter
DOCX-Differentialpfad vorbereitet. Im Cowork-Plugin bleiben TXT, Markdown, CSV
und DOCX der direkte Anonymisierungspfad; XLSX/PPTX nutzen nach DS-093 die lokal
extrahierte Markdown-Repräsentation. Nach DS-087/090 kann Standalone DOCX, XLSX,
PPTX, PDF/Scan-PDF und PNG/JPEG/BMP erst neutral in Markdown extrahieren und anschließend
denselben Privacy-Core nutzen. Dabei wird nur eine anonymisierte Markdown-
Extraktion veröffentlicht; ihre Quellenabdeckung wird separat ausgewiesen. Die reine
Standalone-Konvertierung besitzt denselben breiten Eingabeumfang, darf Hinweise
dagegen sichtbar mit ausgeben. Native macOS-App-Bundle-/IPC-E0 ist für Intel
und Apple Silicon belegt; reproduzierbare Engineering-ZIPs wurden je
Architektur entpackt und erneut gestartet. Linux x64 glibc besitzt denselben
technischen Vertikalschnitt als AppImage im reproduzierbaren ZIP. Zielhost-UAT
bleibt für alle Plattformen gesondert offen. Details stehen in
[`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).

Standalone besitzt zwei verbindliche Kernfunktionen (DS-085). Die heute
implementierte Anonymisierung und die **aktivierte reine
Markdown-Konvertierung** verwenden denselben Auswahl-/Start-/Fortschritts- und
Ergebnisablauf. Reine Konvertierung entfernt keine personenbezogenen Inhalte,
hat keinen PII-Review und exportiert ausschließlich `.md`-Nutzdokumente ohne
Zuordnungsdatei nach `DataSecure-Markdown/Lauf-…`. Diese Dateien sind ausdrücklich
**nicht anonymisiert** und werden niemals automatisch an Claude übergeben.
Eine eng begrenzte Recovery-Ausnahme gilt nur für bereits vor DS-085 angelegte
Legacy-Exportpläne mit Schema `datasecure-result-export/3`: Hatte ein solcher
Plan seine sichtbare Zuordnung schon zugesagt, beendet ein Replay genau diese
alte Transaktion einschließlich `DataSecure-Zuordnung.csv`. Neue reine
Konvertierungsläufe erzeugen weiterhin keine Zuordnungsdatei.
Die Format-Zielliste bleibt für beide Modi erhalten; deren Freigabestatus darf
nicht aus einer sichtbaren Moduswahl oder vorhandenen Dateiendung abgeleitet werden.
Bei DOCX erhält dieser reine Konvertierungszweck Kopf- und Fußzeilen, während der
Anonymisierungszweck sie nach vollständiger Strukturprüfung nicht veröffentlicht.

Für Standalone-Anonymisierung ist die sichtbare Ergebnisbenennung eine
ausdrückliche Stapelwahl (DS-091): neutral ist Standard, alternativ bleibt der
Quellbasisname mit `-anonymisiert` erhalten. Die Zuordnungsdatei verweist immer
auf den tatsächlich erzeugten Namen. Cowork bleibt stets neutral; reine
Konvertierung behält den Quellbasisnamen und benötigt keine Zuordnung.

Im Standalone-Konvertierungsmodus sind zusätzlich DOCX, XLSX/PPTX/PDF/Scan-PDF
und PNG/JPEG/BMP über den einmaligen Markdown-first-Pfad angebunden.
Extrahierbarer Text und Tabellen werden übernommen;
grafische Inhalte und OCR besitzen kenntlich gemachte Grenzen. Solche Hinweise
werden ohne PII-Review mit den Ergebnissen gespeichert. Defekte, verschlüsselte
oder aktiv gefährliche Eingaben erhalten eine eigene Fehlerposition, während der
Stapel weiterläuft. Die **Cowork-Anonymisierungsfreigabe** umfasst TXT,
Markdown, CSV, den strengen direkten DOCX-Parser sowie lokal extrahiertes
Markdown aus XLSX/PPTX (DS-093). Standalone-PDF/Scan-PDF und eigenständige
Bilder erweitern diese Cowork-Freigabe nicht (BL-023.1).

Die Ordneraufnahme prüft in beiden Produkten den gesamten regulären Baum:
Ein unbekanntes oder für das jeweilige Produkt gesperrtes Format weist die
Auswahl atomar zurück; es wird kein Teilstapel übernommen (DS-100).
Explizit erkannte temporäre Office-Besitzerdateien werden dagegen übersprungen
und gezählt. Nach erfolgreicher Aufnahme stoppt eine später als defekt,
verschlüsselt oder unsicher erkannte unterstützte Datei nur ihre eigene
Position; der Reststapel läuft weiter. Aufnahme und Verarbeitung sind getrennte
Phasen, keine stillschweigende Teilfreigabe unbekannter Formate.

## Standalone-Prototyp v2 (DS-110, Zielvertrag)

Die neue Gestaltung und Interaktion folgt dem gelieferten klickbaren Prototyp.
Fachliche Konflikte und Alt/Neu-Zuordnung stehen in `docs/frontend-migration.md`.
Für Standalone ersetzt ein sicherer Quellenkatalog die pauschale Ablehnung
gemischter regulärer Dateibäume: ungeeignete Dateien sichtbar mit Name/Grund,
geeignete per Häkchen auswählbar. Unsichere Bäume bleiben gesperrt. Der
Cowork-Aufnahmevertrag oben bleibt unverändert. Auswahl ist kein Start.
Der Metadatenkatalog ist separat begrenzt (1.000 Dateien und 512 KiB für die
vollständige Aufnahmeantwort einschließlich Artefaktdetails und Antwortumschlag).
Die Verarbeitungsgrenze von 200 Dateien/500 MiB
gilt erst für die angehakte Teilmenge; Einzeldatei- und Baum-Sicherheitsgrenzen
bleiben erhalten. Ein überschrittener Katalog verwirft die neue Aufnahme,
nicht die bereits vorbereitete Auswahl.
Im unveröffentlichten v2-Schnitt sind Pause/Fortsetzung, dauerhafte private
Text-Prüfstände, explizite revisionsgebundene Sammelfreigabe/Widerruf und ein
getrennter KI-Export ausgewählter freigegebener Markdown-Dateien implementiert.
Maskierung/Zurücksetzen widerruft Freigaben. Der Text-Prüfstand ist noch kein
vollständiger reversibler Entitätenplan. Bestehende Läufe werden nicht
rückwirkend als menschlich geprüft behandelt. Keine privaten Nebenprodukte
im KI-Export; native Paketabnahme bleibt Voraussetzung der Standardumschaltung.
Kein Passwortdialog.
OCR-Prüfung für reine Konvertierung, Sammelbearbeitung und laufweite exakte
Entitätsentscheidungen bleiben erhalten. Teil-Exporte lassen offene Dateien offen.

## Grenzen vor Freigabe

Fresh Install, Update/Rollback, Host-/Berechtigungsanzeigen, Windows-/macOS-/Linux-
Dateisystemverhalten, 200 Dateien/500 MiB, UX, Accessibility, IT/Health-IT,
Datenschutz, Security und Architektur benötigen noch menschliche Evidenz. Siehe
[`BACKLOG.md`](BACKLOG.md) und [`BACKLOG_EVIDENCE_MATRIX.md`](BACKLOG_EVIDENCE_MATRIX.md).
