# Lokale Nach-RC162-Runde: Schnellweg, Sammelfreigabe und robuste Laufanzeige

Stand: 17.10.2026. Unveröffentlichter Quellstand auf dem RC162-Zweig.
Kein Beleg für eine neue Windows-/Mac-Paketabnahme oder den verwalteten M2.

## Im Quellcode durchgängig umgesetzte Ketten

| Kette | Verhalten und direkte Reviewgrenze |
| --- | --- |
| Dokumentauswahl → Renderer → Rust-Command/ACL → privater IPC → Service → Dokumentstore | `decide_document_review_batch` übergibt ausschließlich `action`, `operation_id` und 1–200 eindeutige Bindungen aus Dokument-ID, Revision und Text-Hash. Nur Freigabe/Widerruf. Alle Kandidaten werden vor einem gemeinsamen Commit geprüft. Die UI bestätigt erst die vollständige, exakt passende Antwort. |
| Gemeinsamer Commit → verlorene Antwort/Projektion → neues Storeobjekt | Der bestehende exklusive und synchronisierte Commit-Beleg gilt für die gesamte Auswahl. Seine Projektionsdatei kann daraus rekonstruiert werden. Wiederholung derselben Operation erzeugt keine neue Revision; geänderte Operationen oder spätere Textstände werden abgewiesen. |
| Rust-Core-Lock → Queue-Zeitablauf | Vor Versand abgelaufene Anfragen liefern `STANDALONE_IPC_BUSY` und das Ereignis `ipc_request_queue_busy`. Sie invalidieren keine Verbindung und wiederholen keinen Auftrag. Ein Zeitablauf nach Versand bleibt davon getrennt und klärt den tatsächlichen Ausgang nicht automatisch. |
| Aktiver Rust-Auftrag → unabhängige native Statusabfrage → UI | Ein eigener kurzer Aktivitätsspeicher liefert feste Aktion, Phase und Dauer, ohne den Core-Lock zu benötigen. Sein Guard räumt auf allen Rückkehrpfaden auf. Er belegt einen offenen Auftrag, keinen erfolgreichen Abschluss. `closing`/`blocked` haben Vorrang vor einer Aktivitätsanzeige. |
| Konfiguration → Ergebnisordner → Start | `unconfigured`, `available` und `unavailable` sind verschiedene Zustände. Ein verlorener oder ersetzter konfigurierter Ordner löst keine automatische Standardordneranlage aus. „Ordner erneut prüfen“ erhält die Auswahl und erkennt den zurückgebrachten Originalordner wieder. Nur bei Erstkonfiguration darf der Standard angelegt werden. |
| Verlauf → ausdrücklich angeforderte Exportvorschau | Bekannte nicht verarbeitete Quellen verhindern keine Vorschau der verfügbaren, aktuell freigegebenen Dokumente. Der Dialog nennt die Ausnahmen. Verlorene oder unklare frühere Prüfstände verhindern weiterhin die vollständige Vorauswahl. |
| Markdown-Kopie → verlorene Freigabeantwort | Ein Abgleich kann bereits gespeicherte neue Revisionen finden. Danach wird die alte Vorschau geschlossen und fordert eine erneute Auswahl; kein aktiver, wirkungsloser Bestätigungsbutton bleibt stehen. |
| Schnellweg → gebundener Start → gespeicherte Content-Operation → veröffentlichter Basisstand | Nur ausdrücklich gewählte Standalone-Anonymisierung erhält `automatic-conservative`. Bekannte unklare Fundstellen und OCR-Kontaktkorridore werden tatsächlich maskiert; die Transformationsspur unterscheidet automatische und menschliche Entscheidungen. Endprüfungen und Quellenbindung bleiben bestehen. Kein automatischer KI-Export. |
| Automatische Erstfreigabe → Änderung/Widerruf → Wiederöffnen/Neustart | Automatik gilt nur für den belegten veröffentlichten Basisstand, Revision 0. Alle späteren Revisionen benötigen erneut eine ausdrückliche Freigabe. Die Run-Policy ist keine Behauptung über heutige Freigabezahlen oder vorhandene KI-Kopien. |
| Laufkarte → Dokumentkarte → Verlauf | Technischer Laufabschluss wird prominent benannt, auch mit Hinweisen. Automatische Freigabe ist als „nicht manuell geprüft“ erkennbar. Teilweise vorhandene Ergebnisse dürfen keinen noch laufenden Stapel als abgeschlossen bezeichnen. |

## Gegenprüfung und Testbelege

Drei unabhängige Quellreviews haben Backendtransaktion, Rust/OS-Transport und
fachliche/UI-Abläufe geprüft. Eine zweite Integrationsrunde fand den veralteten
Markdown-Kopierdialog und eine fehlende erneute Ordnerprüfung; beides ist
korrigiert. Die Direktprüfung deckt die genannten Ketten ab, keine pauschale
Behauptung über jede Methode des gesamten Repositories. Weitere unabhängige
Quellreviews haben anschließend die Fastweg-Verankerung, Datenschutztransformation,
Windows-/macOS-Startparameter und Benutzerführung geprüft. Dabei wurden eine
zu frühe Fastweg-Abschlussüberschrift, eine widersprüchliche Laufkarte und
der verlorene native Auswahlstatus nach verweigerter Ordneranlage korrigiert.

- Dokumentstore: 57 Fälle bestanden, einschließlich einer echten Auswahl aus
  200 gespeicherten Dokumenten, einem Journalabgleich und einem gemeinsamen
  Commit. Fehler vor dem Commit, verlorene Projektion, verlorene Bestätigung,
  stale Hash/Revision, Restbefunde, Zweckbindung und gefälschte Records werden
  geprüft. Daraus folgt keine gemessene Laufzeit auf einem Kundengerät.
- Dokumentrenderer: 77 Fälle bestanden, einschließlich vollständiger
  Sammelantwortbindung, defekter/teilweiser Antworten und keinem automatischen
  Kopierversuch nach unklarer Bestätigung.
- Ergebnisordner: 46 echte Dateisystemfälle bestanden; verloren, ersetzt und
  als Original zurückgebracht sind von einer Erstinstallation unterschieden.
- Rust: 137 bestanden, drei OS-/manuelle Fälle ignoriert. Darunter unabhängiger
  Aktivitätsleser, alte Guards, Panic-Unwind und Mutexvergiftung.
- Lauf-/Verlaufsrenderer: 132 Fälle; gemeinsame Statusprojektion: 33 Fälle.
  Die zusätzlich geprüften Grenzen betreffen erfolgreich erzeugte OCR-Dateien
  mit Hinweisen, fehlende Altbasis und den getrennten Dokument-/Kopiestatus.
- Ein neuer, vom produktiven Projektionsskript erzeugter Runtimebaum wurde mit
  echtem Konverter, OCR und getrennten Worker-/Core-Prozessen über gerahmte IPC
  geprüft. Zwei synthetische OCR-Bilder und ein mehrdeutiges Markdown werden
  ohne menschlichen Dialog maskiert und automatisch freigegeben; ein defektes
  CSV bleibt mit seinem echten Grund ausgeschlossen. Frischer Prozessstart
  rekonstruiert die Freigaben exakt; Widerruf bleibt nach weiterem Neustart
  wirksam. Erst ausdrückliche Vorschau, Export und ACK erzeugen eine KI-Kopie.
  Deren neutrale Dateinamen und tatsächliche Hashes wurden geprüft. Dies ist
  kein bedienter Tauri- oder neuer Bundle-/SEA-Lauf auf Windows oder macOS.
- Die Browserprüfung der tatsächlichen Oberfläche mit synthetischer IPC
  bestand einschließlich Schnellweg, Hinweisabschluss, Tastatur-/Dialogfokus,
  axe und Reflow bei 390, 720 und 1280 Pixeln. Die eigene Sichtprüfung der
  erzeugten Bilder bestätigte die Trennung von grünem Abschluss und gelbem
  OCR-Hinweis. Native Dateidialoge sind damit nicht geprüft.
- `npm run test:standalone` einschließlich Content-/Qualitäts-Vorgates,
  tatsächlichem Sidecar-/Worker-Lifecycle und nativen Rust-/Node-Exporttests
  bestanden. Danach ergänzte Hinweisprojektion wurde separat mit 32
  Anonymisierungs-Publikationsfällen, Service-/History-/Produktprojektion,
  echten OCR-/Fastweg-Prozessen und den betroffenen Renderern wiederholt.
- Native Windows-Formularfälle und der verwaltete M2-Finder-Weg bleiben
  gesonderte, noch offene Abnahmen. Die Quellsuite meldet die sechs nativen
  Windows-Bedienfälle ausdrücklich `NOT_RUN`; sie sind nicht grün mitgezählt.

### Warum die direkten Integrations- und Quellreviews nötig waren

Die echte OCR-Runde deckte eine vom synthetischen Extraktor verdeckte
Übergabedifferenz auf: Der Konverter liefert Kontaktwerte teilweise in
Markdown-Auszeichnung, während die Transformationsspur kanonischen Text
belegen muss. Der Schnellweg bildet jetzt jede genaue Kontaktgrenze durch
die tatsächliche Kanonisierung ab, prüft die vollständig wiederhergestellte
Quelle und maskiert erst dann die belegten Bereiche. Unbeweisbare Grenzen
werden nicht durch unscharfe Wertsuche ersetzt. Wiederholte Werte und
Marker-Kollisionen haben eigene Regressionen. Endprüfung und Replay bleiben
unverändert streng.

Der nächste echte Worker-Lauf fand eine zweite Übergabelücke: Der sichtbare
Ergebnisexport akzeptierte den bisherigen Inhaltsanker `/3`, aber noch nicht
den neuen Schnellweganker `/4`. Diese geschlossene Fallunterscheidung ist
einschließlich unveränderlicher Policy korrigiert. Der anschließend bestandene
Durchlauf umfasst damit auch die tatsächliche sichtbare Ergebnisbereitstellung,
nicht nur terminale interne Dokumentzähler.

Das erneute Quellreview fand außerdem, dass erfolgreiche OCR-Anonymisierung
ihre gespeicherten Quellenhinweise noch nicht bis zur Lauf-/Verlaufsanzeige
transportierte. Der Ergebnisgrad `complete` bezeichnet hier bewusst den
geprüften extrahierten Markdown und darf nicht als perfekte OCR ausgelegt
werden. Diese beiden Aussagen bleiben getrennt; eine fehlende ältere
Hinweisgrundlage wird nicht als bewiesene Hinweisfreiheit dargestellt.
Die echte Kettenprobe fand hierbei zusätzlich den Unterschied zwischen
Profilwahl `auto` und dem tatsächlich ermittelten Publikationsprofil. Der
Hinweisleser folgt jetzt derselben Fallunterscheidung wie die Veröffentlichung.

Ein weiterer unabhängiger Quellreview fand zwei Rückschreibrisiken der ersten
Hinweisprojektion: spätes Zurückschreiben alter Laufzähler und Verlust zuvor
bekannter Hinweise bei später beschädigten Metadaten. Hinweise liegen nun in
einer separaten, atomar geschriebenen und eigenständig gesperrten Projektion.
Detailabfragen schreiben niemals die gelesene Laufsummary zurück; die
Verlaufsliste persistiert ebenfalls keine älteren Momentaufnahmen mehr.
Ein unvollständiger Neuabgleich erhält den belegten Mindestbestand und setzt
die heutige Aufschlüsselung auf unbekannt. Frühere lokale Inline-Snapshots
werden vor ihrem Ersatz erhalten. Eine echte Rename-Injektion prüft den
konkurrierenden neueren Abschluss; die Migration und das fehlende Lesen von
Dokumentkörpern sind gesondert geprüft. Das ist keine neue Exportbefugnis.

## Read-only-Nachprüfung der drei tatsächlichen lokalen Testläufe

Am 17.10. wurden die vorhandenen Testläufe ohne Änderung an Nutzerdateien
gegen Laufsummary, Batchjournal, unabhängigen Dokumentanker, Dateihashes,
Exportplan und Abschluss-/Empfangsbelege abgeglichen. Keine Dokumenttexte
oder vertraulichen Zuordnungen sind Teil dieses Berichts.

| Lauf, Ortszeit Berlin | Terminale Quellen / Ergebnisse | Ausnahmen | Heutige Freigaben | Bestätigte KI-Kopien |
| --- | --- | --- | --- | --- |
| 17.10., 14:05 | 133 / 115 | 17 ohne OCR, 1 Mehrdeutigkeitsstopp | 115 / 115 | 1 × 115 |
| 16.10., 11:25 | 133 / 115 | 17 ohne OCR, 1 Mehrdeutigkeitsstopp | 115 / 115 | 2 × 115 |
| 15.10., 09:36 | 133 / 132 | 1 Mehrdeutigkeitsstopp | 131 / 132 | 1 × 132 |

Alle 362 sichtbaren Markdown-Ergebnisse stimmen mit ihren gespeicherten
Hashes überein. Die vier KI-Kopien enthalten exakt die geplanten neutralen
Markdown-Dateien (115 + 115 + 115 + 132), ohne zusätzliche Dateitypen oder
fehlende Dateien. Abschlussbeleg, Auftragsdigest und Empfangsbestätigung
sind jeweils konsistent. Keine offenen Batch-/Mappingzustände gefunden.
Dies ist kein Nachweis perfekter Texterkennung oder Anonymisierung und kein
Nachstellen der damaligen nativen ACL-/Handleprüfung.

Der Lauf vom 16.10. wurde tatsächlich zweimal mit gleicher Auswahl, Revision
und gleichem Inhalt kopiert, nicht nur zweimal gemeldet. Die neue Oberfläche
setzt nach bestätigter Kopie die Auswahl zurück, hebt den Abschluss hervor
und bezeichnet einen weiteren Auftrag ausdrücklich als zusätzliche Kopie.

Beim Lauf vom 15.10. wurde nach dem bestätigten 132er-Export eine Maskierung
dauerhaft gespeichert; genau dieser heutige private Stand hat deshalb keine
Freigabe mehr. Der alte Export bleibt eine korrekte damalige Kopie. Die
damalige Sofortschreibwirkung erklärt die Irritation des Anwenders. Die
lokale neue Oberfläche benötigt dafür eine eigene vorbereitete Vorschau
und eine ausdrückliche Speicherbestätigung; bloßes Markieren schreibt nichts.

## Fachliche und technische Grenzen der neuen Pfade

Die neuen Fastweg-Läufe besitzen zusätzlich `datasecure-document-run/4` und
eine an Quelle, Inhaltseinstellungen und Zweck gebundene Policy. Das neue
Modul ist Teil der geschlossenen Standalone-Runtimeprojektion. Alte Apps
dürfen solche Daten nicht stillschweigend als manuell freigegeben lesen.
Die Bedienprüfung verwendet die tatsächliche HTML-/CSS-/JS-Oberfläche mit
synthetischer IPC: Browserdarstellung, Tastatur-/Dialogfokus, axe-Prüfungen und
390–1280 Pixel Reflow sind damit prüfbar, nicht aber native Picker oder ein
verwalteter M2. Der Schnellweg zeigt seine wesentlichen Grenzen direkt an;
weitere Erklärungen sind aufklappbar, nicht ausschließlich Hover-Tooltips.

Scan- und Grafik-OCR sind im bestehenden Hauptweg eine gemeinsame ausdrückliche
Auswahl. Der direkte Quellcode in `core/content-ocr-plan.js` zeigt den Grund:
Bei unterschiedlicher Einwilligung ist eine PDF-Fläche nicht allein anhand
Geometrie oder vorhandenen Textes zuverlässig als Scan oder Grafik erkennbar;
der Konverter verlangt dann `PDF_OCR_SCOPE_UNVERIFIED`. Zwei getrennte
Schalter ohne passende Bereichsauswahl würden bisher funktionierende PDFs
anhalten. Eine solche UI wird deshalb nicht als fertige Vereinfachung angeboten.

Die neuen Auswahlrecords tragen `datasecure-run-decision/2`. Ältere App-Stände
können einen damit bearbeiteten Prüfstand nicht lesen und weisen ihn geschlossen
ab. Ein künftiges Testpaket muss diese Rückwärtsgrenze nennen; Quelltests laufen
mit isolierten Testprofilen.

## Lokale Performance- und Diagnoserunde

Die drei zusätzlichen Ketten sind implementiert. Der neue Stand ist weiterhin
unveröffentlicht; der zurückgestellte M2-Test ist kein bestandenes Gate.

### Export: weniger doppelte Arbeit, neue Übergaben weiter prüfen

Dateiplan, Restdatenprüfung und vertrauliche Zuordnung verwenden einen
gemeinsamen Vorbereitungsdurchgang. Unmittelbar vor der Kopie werden die
Quellen unabhängig frisch eingelesen und an Auswahl, Revision, Freigabe und
Hash gebunden. Für automatisch freigegebene Revision 0 führt `current()` die
Restdatenprüfung bereits aus; der direkt anschließende identische Aufruf ist
entfallen. Es gibt keinen aktionsübergreifenden Kandidaten-/Freigabecache und
keinen Speicher für 200 vollständige Dokumentkörper. Größenlimits,
Zielinventare, Hashprüfung, Abschlussbeleg und Wiederaufnahme bleiben erhalten.
Ein zusätzlicher unabhängiger Quellreview hat für diese Grenze keinen
blockierenden Schutzverlust gefunden.

Gemessen mit echten gespeicherten synthetischen `/4`-Publikationen und
Entscheidungsjournalen: Windows 10.0.26200 x64, Node v24.18.0, je Dokument
1.360 Quellbytes und 1.340 anonymisierte Bytes. Die Zeitwerte sind explorative
Einzelmessungen unter paralleler Last, keine SLA oder Mac-Durchsatzmessung.

| Fall / Kopierphase | Vorher | Nachher |
| --- | --- | --- |
| 115 Dokumente, Node-Dateisystem: vollständige Dokumentlesungen | 460 | 230 |
| Dabei instrumentierte Stat-Aufrufe / gelesene Bytes | 863.218 / 23.391.419 | 398.158 / 11.894.351 |
| Dabei gemessene Zeit | 71,4 s | 51,1 s |
| 200 Dokumente, JS-Nativevorbereitung/-Streaming: vollständige Dokumentlesungen | 800 | 400 |
| Dabei instrumentierte Stat-Aufrufe / gelesene Bytes | 1.475.918 / 63.022.828 | 667.118 / 31.603.293 |
| Dabei Restdatenprüfungen / gemessene Zeit | 200 / 190,3 s | 200 / 71,4 s |

Der 200er-Pfad verwendet einen gekennzeichneten JS-Testtransport, nicht den
Rust-Dateisystemadapter. Die 115er-Vorschau war trotz weniger I/O in einer
Messung langsamer (16,1 → 24,1 s). Belastbarer ist die deterministische
Reduktion doppelter Lesungen; die wahrgenommene Wartezeit bleibt ein offener
Optimierungspunkt. Reproduzierbar über `npm run benchmark:standalone:export --
--count=115` bzw. `--count=200 --native`; nicht Teil des normalen CI-Budgets.
Negativfälle prüfen beschädigte Publikation zwischen Vorbereitung und Kopie,
Restdatenabwehr, Widerruf und verlorene Empfangsbestätigung.

### Startup: alte Sicherung bewahren, wiederholte Suche vermeiden

Alle kompakten Laufzusammenfassungen werden weiter vor Retention gesichert.
Nur der konkrete Standalone-Dateileser aktiviert den neuen Capture-Index.
Er bindet tatsächliche gelesene Bytes, Mitgliedschaften und die gespeicherten
Zielbindungen; eine getrennte Pin-Datei erkennt auch byteidentisch ersetzte
Indexdateien. Fehlende/beschädigte/geänderte Grundlagen fallen auf den
bisherigen vollständigen Leser zurück. Der Index erteilt weder Freigaben noch
Exportvollständigkeit und beantwortet keine aktuelle Zielordnerprüfung.

Der opt-in-Profillauf mit 320 gespeicherten synthetischen Lauf-/Exportmetadaten
und je vier Quellen ergab für den Capture allein 21,028 → 7,418 s, 320 → 1
Prüflauf-Verzeichnislisten, 103.040 → 1.602 gelistete Einträge sowie
184.321 → 71.186 Statusabfragen. Das ist kein gemessener gesamter App-Start.
Der normale echte FS-Test verwendet acht Läufe; 320 sind ausdrücklich über
`npm run benchmark:standalone:startup-history` abrufbar. Neue/geänderte
Exportgrundlagen benötigen derzeit einmal den vollen Abgleich, noch keinen
inkrementellen Leser. Die frühe Sicherung wird nicht blind asynchron gemacht.

Geprüft sind auch Indexaustausch, gleich große Inhaltsänderung bei
wiederhergestellter `mtime`, beschädigte Bindung, fehlender Erstinstallations-
Ergebnisordner und echte Windows-Junction. Ein ausgetauschter Ergebnisordner
bleibt beim Benutzerzugriff `unsafe`, auch wenn der Capture wiederverwendet
werden konnte. Das Wiederherstellen des Originals wird nicht dauerhaft gesperrt.

### Diagnose: ein lokales Paket, auch ohne Core

„Diagnosepaket speichern“ steht in Einstellungen und Verbindungshilfe bereit.
Es speichert eine einzelne JSON-Datei über den nativen Dialog, ohne Core-RPC,
Shell, Archivprogramm, Adminrechte oder Hochladen. Bestehende Zieldateien
werden nicht überschrieben. Abbruch und unbestätigtes Speichern verändern
keinen Lauf-, Verbindungs- oder Kopiestatus.

Alte Logs gelten als untrusted: Nur geschlossene technische Ereignisse,
validierte Versions-/OS-/Architekturwerte, feste Fehlercodes und begrenzte
Zahlen werden neu aufgebaut. Sitzungs-/Anfragekennungen werden auf lokale
Indizes abgebildet. Keine Dokumentinhalte/-namen, Pfade, Zuordnungen oder
rohes `stderr`. Historische validierte Versionsangaben bleiben erhalten,
damit ein nach einem Update erzeugtes Paket den früheren Fehlerstand nicht
fälschlich dem heutigen Build zuschreibt; sie sind kein Authentizitätsbeweis.

Aktuelles Desktop-Segment und neueste Sidecar-Evidenz erhalten Vorrang,
gekappte Dateien liefern ihre letzten Ereignisse. Das Manifest nennt
fehlende, unlesbare, verworfene, gekürzte und während des Lesens gewachsene
Bestandteile. Grenzen: 128 Inventareinträge, 24 Dateien, je 256 KiB,
8.192 geprüfte Zeilen, 4.096 Ereignisse, maximal 4 MiB Ausgabe. Die aktuellen
Desktop-Rotationsnamen und beide neuen Capture-Ereignisse sind mit abgedeckt.
Nur der Windows-Diagnoseleser erlaubt paralleles Append-Sharing; der strenge
Export-/Journalleser wurde dafür nicht aufgeweicht. Unix verwendet weiter
gehaltene No-follow-Verzeichnisse und Objektidentitäten.

Der vollständige Storelauf ist mit 62/62 erneut bestanden, einschließlich
maximaler 200er-Auswahl. Die echte Node→Rust-Exportintegration besteht mit
beiden Zwecken, Unicode, realer 10.001-Kontakt-Spur, verlorener Antwort,
Widerruf und Manipulationsabwehr. Produktisolation: 4/4, einschließlich echter
MCP-/Sidecar- und Windows-Parserprozesse. Der neue Startup-FS-Test ist grün.
Die erneute Windows-Rust-Gesamtprobe ist mit 147 bestanden / 0 fehlgeschlagen /
3 ignoriert grün. Workspace: 135/135; Desktopvertrag: 32/32. Die tatsächlichen
HTML-/CSS-/JS-Seiten wurden erneut headless einschließlich Diagnose bei
getrenntem Core, Statusbesitz, axe und 390–1280 Pixel Reflow geprüft. Das ist
kein Test eines nativen Speicherdialogs. Native Windows-/macOS-Picker und das
neu gebaute Paket auf M2 bleiben eigenständige offene Gates.

## Welche Prüfungen sind sinnvoll – und auf welchem Betriebssystem?

Nicht die Anzahl vorhandener Prüfaufrufe ist das Schutzziel. Ein Aufruf darf
entfallen oder mit einem anderen zusammengelegt werden, wenn dieselbe
Eigenschaft an der maßgeblichen Vertrauensgrenze weiterhin nachgewiesen wird.
Ein früheres Ergebnis ersetzt dagegen keinen neuen Nachweis, wenn sich Inhalt,
Revision, Berechtigung oder Dateiobjekt inzwischen ändern konnten. Ein
Windows-Erfolg ist kein Nachweis für den macOS-Adapter und umgekehrt.

| Prüfung / Schutzziel | Richtiger Zeitpunkt und mögliche Vereinfachung | Gemeinsamer Vertrag und OS-Unterschied |
| --- | --- | --- |
| Exakte Dokumentauswahl, Revision, Hash und Freigabe | Vor einer neuen Freigabe bzw. einem neuen Exportauftrag. Journal innerhalb derselben gesperrten Aktion einmal lesen; nicht pro Zeile erneut. Keine Freigabe aus einem Verlaufscache ableiten. | Fachlich auf beiden OS gleich; unterschiedliche Prozess- oder Dateidialog-APIs dürfen die Entscheidung nicht verändern. |
| Inhalt, Publikationsanker und bekannte Datenschutzbefunde | Vor Erstellung des verbindlichen Kopierplans; erneut nach veränderbarer Übergabe, nicht allein wegen einer weiteren Darstellung desselben unveränderten Werts. Ein aktionslokaler Snapshot ist keine dauerhafte Freigabe. | Fachlich gleich. Ein stabiler Dateiname oder `mtime` allein belegt auf keinem OS unveränderte Bytes. |
| Identität von Quell-/Zielordnern, keine Linkumleitung, passende Rechte | An tatsächlichen Dateiöffnungen und vor Veröffentlichung. Ein bloßes vorgelagertes `exists` ist kein Ersatz; gehaltene Handles verringern Pfad-Rennen. | Windows: Reparse Points, Volume-/Datei-ID, ACL und Sharing. macOS/Unix: `openat`/No-follow, Geräte-/Inode-Bindung und Rechte. Die Systemaufrufe sind bewusst verschieden. |
| Vollständige KI-Kopie und verlorene Antwort | Nach Kopieren und vor Abschlussbeleg; bei späterem Öffnen/Wiederaufnahme erneut. Kein Erfolg allein aus „Schreiben beendet“ oder einer UI-Meldung. | Gemeinsame Soll-Dateiliste, Byte-/Hashbindung und idempotenter Beleg; native Veröffentlichung/Dateisperren bleiben OS-spezifisch. Eine Zielprüfung ist nicht dieselbe Prüfung wie die vorherige Quellenprüfung. |
| Alter Laufzustand vor Aufbewahrungsbereinigung | Vor möglichem Löschen der einzigen historischen Grundlage sichern. Keine vollständige Ergebnisverifikation nur zum Rendern einer Verlaufsliste; fehlende/beschädigte Grundlage darf nicht als leer gelten. | Gemeinsame Retention-/Recovery-Semantik; tatsächliche Pfad-/Objektbindungen durch den jeweiligen Adapter. Ein Index darf keine Freigabe oder Exportvollständigkeit erteilen. |
| Core-Start und App-Paket | Beim Start bzw. am tatsächlich gebauten/verteilten Paket, nicht bei jedem Dokument. Der produktive Start muss ohne Terminal und mit normalem Benutzerkonto geprüft werden. | Windows: Prozess-/Handlefehler und NTSTATUS. macOS: Architektur, Bundle-Code, Signatur/Entitlements, Quarantäne/Gatekeeper und Signal. Diese Nachweise sind nicht austauschbar. |
| Dateiauswahl und Ergebnisordner | Bei ausdrücklicher Ordnerwahl sowie beim wirklichen Zugriff. Ein fehlender Standardordner beim Erststart ist kein Core-Absturz. Verweigerte Rechte dürfen nicht still umgangen werden. | Windows-ACL/Sharing und macOS-Dateizugriffskontrolle unterscheiden sich. App-Sandbox-Bookmarks sind nur bei entsprechendem Sandbox-Verteilungsmodell relevant; sie werden nicht pauschal für die derzeitige App vorausgesetzt. |
| Diagnoseweitergabe | Beim ausdrücklich ausgelösten Speichern erneut feste Felder, Grenzen und sichere Dateien prüfen; alter Logtext ist keine vertrauenswürdige Eingabe. | Gemeinsame Inhaltsfreiheit und Größenlimits; Eingabe-/Zielbindung mit OS-spezifischen Handles. Diagnose bleibt unabhängig vom seriellen Core-Kanal. |

Auch **Integrationstests** werden nach Schutzwirkung gewählt: gemeinsame
Vertrags- und Negativtests für Fachlogik; echte gespeicherte Daten und
Rust-/Core-Übergaben für die Prozesskette; native Dateisystemtests pro OS für
Links, Sperren und Veröffentlichung. Erst das gebaute Paket auf dem Ziel-OS
prüft zusätzlich Bundle, Architektur und native Dialoge. Ein Headless-Test
mit synthetischem IPC ist kein Ersatz dafür. Die verwaltete M2-Probe bleibt
ausdrücklich verschoben und nicht bestanden.

## Fortsetzung nach Neustart: belastbarer Exportfortschritt

Die erhaltenen lokalen Änderungen wurden weitergeführt, nicht als neue Version
ausgegeben. Ein erneuter Quellenreview der UI-, Rust- und Core-Übergaben fand
eine echte Abschlusslücke: Nach dauerhaftem Export-ACK wartete der Dialog noch
auf das optionale Neuladen der Dokumentliste. Bei einer langsamen Liste konnte
er deshalb eine fertige Kopie weiter als wartenden Vorgang darstellen. Der
Dialog zeigt den Erfolg jetzt unmittelbar nach dem validierten ACK, hebt die
alte Auswahl auf und lässt sich schließen. Ein unabhängiger Gegenreview fand
außerdem einen Auftragswechsel im Erfolgsdialog, wenn der folgende Reload einen
anderen offenen Export entdeckt. Eine zunächst rote Regression reproduzierte
das; der fertige Dialog bleibt jetzt bis zum Schließen bei seiner Kopie. Der
andere Auftrag braucht weiterhin eine eigene ausdrückliche Bestätigung.
Weitere Änderungen bleiben bis zum
frischen Listenstand gesperrt; ein Lesefehler erzeugt keinen zweiten Export.

Die vorhandene unabhängige native Statusabfrage liefert optional nur
`operation_id`, eine feste Phase und begrenzte Dateizähler. Die UI akzeptiert
sie ausschließlich für den genauen laufenden Exportauftrag und dessen
Auswahlgröße. Der Rust-Reporter zählt erfolgreiche letzte `write_body`-Frames
pro Datei höchstens einmal. Teilchunks, fehlgeschlagene Hashprüfung und die
Wiederaufnahme eines früheren `prepared`-Markers erfinden keine fertigen Dateien.
„Im Zwischenbereich gespeichert“ ist ausdrücklich nicht „Export abgeschlossen“;
Verifikation und Abschlussbeleg bleiben eigenständige Phasen.

Der Reporter erteilt keine Datei- oder Wiederholungsautorität. Guard-Token und
Aktionskennung verhindern, dass ein nach Timeout noch laufender nativer Worker
eine spätere Anfrage überschreibt oder wiederbelebt. Das Beobachten benötigt
keinen Core-Lock, startet höchstens eine parallele Statuslesung und verlängert
weder Exportfrist noch Prozessbesitz. Bei fehlender Beobachtung nennt die UI
das offen, ohne den eigentlichen Export abzubrechen oder erneut zu senden.
Verstrichene Zeit wird monoton gemessen, nicht von der verstellbaren Systemuhr
abgeleitet. Statusänderungen werden höflich gemeldet; gleiche Wartewerte nicht
alle zwei Sekunden neu angesagt. Die Meldung steht vor der langen Dateiliste,
erhält nach ausdrücklichem Start den Fokus und gibt ihn bei Erfolg an
„Schließen“ weiter. Scrollbare Bereiche bleiben auch bei gesperrten Buttons
tastaturerreichbar.

Nachweise dieser Teilrunde: Windows-Rust **155 bestanden, 0 fehlgeschlagen,
3 regulär ignorierte Unterprozess-Einstiegspunkte**, Dokumentrenderer **84/84**,
Workspace **135/135**, Desktopvertrag **32/32**. Tatsächliche Node→Rust-Kopie mit
beiden Zwecken, verlorener Antwort/ACK, Widerruf, Unicode, 10.001-Kontakt-Spur
und manipuliertem Ziel ist erneut grün. Die echten HTML-/CSS-/JS-Seiten bestehen
Headless-Reflow/axe bei 390, 720 und 1280 Pixeln, einschließlich blockierter
Exportphase, Fokus und Diagnose ohne Core. Die erste Browserprobe fand reale
Tastaturlücken in den scrollbaren Bereichen; sie wurden im Produkt behoben,
nicht aus der Prüfung ausgeblendet. Synthetischer Browser-IPC ist weiterhin
keine native Windows-/Mac-Bedienabnahme.

Verbleibende Grenze: Ein wirklich festhängender OS-Dateiaufruf kann weiterhin
über das Antwortbudget hinaus seine native Schreibsperre halten. Das ist kein
Freibrief für einen zweiten Schreiber. Die unveränderte absolute Exportfrist
von 300 Sekunden und der serielle Core-Durchsatz werden durch diese Anzeige
nicht beseitigt. Für einen bereits bereitstehenden menschlichen Prüfschritt
existiert dagegen keine minutenlange Entscheidungsfrist; der 30-Sekunden-
Starttimer wird beim angenommenen Prüfdialog beendet.

Die Statusgestaltung folgt [W3C: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
Die Zähler sind keine vorgetäuschte Prozent- oder Erfolgsskala; die
[W3C-Meter-Abgrenzung](https://www.w3.org/WAI/ARIA/apg/patterns/meter/)
unterscheidet Messwerte von Aufgabenfortschritt. Die Rust-Besitzbindung nutzt
[Arc](https://doc.rust-lang.org/std/sync/struct.Arc.html) mit gesondertem kurzen
Mutex; gemeinsame Referenzhaltung verleiht keine Schreibberechtigung.

## Laufgenaue History-Detail- und Öffnungsaktionen

`run-history.find()` projizierte zuvor dieselbe globale und auf 20 sichtbare
Einträge gekürzte Liste wie die Verlaufsansicht. Damit las sogar eine konkrete
Dokumentabfrage fremde Journale/Exportanker und konnte einen älteren, weiterhin
gültigen Lauf nur wegen der Darstellungsgrenze nicht mehr finden. Die produktiven
Adapter lesen jetzt genau einen Journal- und Exportnachweis. Auch Fehlerdetails,
OCR-Rückmeldung und Dokumentabschlussbeleg verwenden diese laufgenauen Leser.
Die Liste, der frühe Capture und die ausdrücklich angeforderte Exportnachholung
behalten ihren gesonderten Ablauf; kein Retention-Schritt wurde verschoben.

Die konkrete vollständige Laufkennung bestimmt den erwarteten Exportnamen.
Unabhängiger Eigentümeranker, Produktkanal, Manifest und Inhaltsoptionen werden
weiter frisch geprüft. Ein inzwischen beschädigtes Journal ist nicht dasselbe
wie ein durch Retention fehlendes Journal: Ersteres liefert einen festen Fehler,
Letzteres darf nur mit den verbleibenden gebundenen Nachweisen weiter angezeigt
werden. Fehlende Detailgründe bleiben unbekannt, nicht null. Ein anderer Ordner
am gleichen Pfad wird weiterhin nicht als das ursprüngliche Ergebnis geöffnet.
Der zusätzliche unabhängige Quellenreview fand am alten Anchor-Pfad noch eine
`existsSync`-Lücke: Ein vorhandener defekter Link sah dabei wie Abwesenheit aus.
Eine zunächst rote Gegenprobe mit echter dangling Windows-Junction belegte den
Unterschied. Der genaue Lookup verwendet jetzt `lstatSync` und behandelt nur
`ENOENT` als fehlend. Vorhandene Einträge müssen weiterhin die Verzeichnisbindung
bestehen; injizierte `EACCES`/`EPERM`/`ENOTDIR` liefern einen festen Fehler, keine
Rohmeldung oder Legacy-Freigabe.
Die neue schnelle Projektion ergänzt keine Ordnerbindung, startet keine Recovery
und veröffentlicht keine neue Kopie. Die bereits vorhandene ausdrückliche
Zuordnungs-Öffnungsaktion darf weiterhin ihre zugehörige menschliche Zuordnung
materialisieren; das wurde nicht zur Autorität eines gewöhnlichen Listenzugriffs.

Vier Rust-Leseaktionen (`get_run_failures`, `resolve_history_results`,
`resolve_history_ledger`, `resolve_history_identity_mapping`) waren trotz
vergleichbarer Arbeit nur in der 30-Sekunden-Standardklasse. Sie verwenden jetzt
die vorhandene 300-Sekunden-Klasse der übrigen schweren History-/Dokumentleser.
Das ist keine Verlängerung der 300-Sekunden-Exportmutation und kein durch jede
Fortschrittsmeldung erneuertes Zeitfenster. Der serielle Core-Kanal bleibt ein
offener Durchsatzpunkt; eine globale Verlaufsansicht wird nicht durch einen
kleineren sichtbaren Ausschnitt automatisch kostenlos.

Der neue kanonisch registrierte Test `test-standalone-history-targeted.js` nutzt
die produktiven Adapter und tatsächlich gespeicherte Dateien. Neben 128 neueren
fremden Läufen wird der ältere Ziel-Lauf vor/nach Journalretention gelesen. Die
Dateizugriffsüberwachung meldet **0 fremde Öffnungen und 0 globale Auflistungen**.
Gegenproben umfassen beschädigtes Journal und Export, fehlenden Lauf, falschen
Produktkanal, Windows-Junction, ausgetauschten und wiederhergestellten
Originalordner, beschädigte Zusammenfassung, Wiederaufnahmeregel und den alten
synthetischen History-Alias. Erstinstallation ohne Historie legt bei einem
fehlenden Lookup keine Daten-/Ergebnisordner an. Sehr alte Exporte mit synthetischer
Listen-ID und ohne unabhängigen Owner behalten eine reine Verzeichnisnamensuche;
dieser dokumentierte Kompatibilitätsfall behauptet keine konstante Laufzeit und
liest dafür keine fremden Dokumentkörper oder Exportdateien.
Die Bestands-Historysuite, der Service (64/64), echte Sidecar-/Workerabläufe mit
und ohne OCR einschließlich menschlicher Vertagung/Neustart sowie die reale
Fastweg-Kette sind erneut bestanden. Produktisolation/offline: 4/4, Testpfad-
Trennung: 13/13. Keine Windows-/Mac-Dialog-, Paket- oder Zielhostabnahme wird aus
diesen Quellen- und Prozessnachweisen abgeleitet.

## Weitere Durchsatzrunde: weniger Arbeit, unveränderte Autoritätsgrenzen

Die Änderungen dieser Runde wurden unmittelbar in den produktiven Pfaden
`native_export_channel.rs`, `native_export_transaction.rs`,
`standalone-document-review-store.js`, `result-export.js` und `run-history.js`
geprüft. Zwei getrennte Quellenreviews haben native Lebensdauer/OS-Grenzen
und die fachliche History-/Exportprojektion gegengeprüft. Ein zusätzlicher
unabhängiger Review prüfte die konkreten Implementierungen erneut; dabei
fiel noch die vorzeitige Hinweis-Anreicherung aller gespeicherten Zeilen auf.
Sie wurde vor Abschluss der Runde auf die tatsächlich ausgewählten Zeilen
begrenzt, nicht aus dem Nachweis ausgeklammert.

| Pfad | Eingesparte Arbeit | Weiterhin erforderlich |
| --- | --- | --- |
| Nichtfinale 64-KiB-Exportchunks | Kein eigener OS-Thread und keine Übergabe des großen Zwischenpuffers an einen neuen Worker pro Chunk. | Derselbe geschlossene Decoder, genaue Anfrage/Auswahl, Sequenz, Bytegrenzen und ursprüngliche Deadline. Ein registrierter NativeGuard bleibt aktiv; der Inline-Decoder erhält selbst keine Datei-Schreibfähigkeit. Letzter Chunk und Steuerbefehle bleiben im nativen Worker. |
| Fertige native Kopie bestätigen | Direkter nativer ACK statt reconcile plus ACK; bei vorhandenem Abschlussbeleg eine statt vier vollständiger Zielinventarprüfungen pro Bestätigung. | ACK öffnet die gebundene Kopie und prüft ihre aktuellen Namen, Identität und Bytes erneut. Ein erstmals nachgeholter Abschlussbeleg prüft weiterhin vor und nach seiner dauerhaften Speicherung. Kein implizites Kopieren bei unvollständiger oder aufgegebener Operation. |
| Nativer Transaktionsplan | Validierten Plan-Digest einmal pro Transaktionsinstanz berechnen. | Plan ist privat besessen und unveränderlich; Journalnachweise, native Berechtigungen, Ziel-/Elternidentität und Inventar werden nicht gecacht. |
| Globale Export-History | Aufruflokales Owner-Namensinventar statt jedes Review-Verzeichnis für jeden Export erneut aufzulisten; ein gebundener Outbox-Ordner pro Aufruf. | Owner, Manifest, Produktkanal und Inhaltsoptionen frisch lesen; auch passende Datei-/Linknamen berücksichtigen. Elternidentität und Namensmenge am Ende nachprüfen. Gewöhnliche neue Verzeichnisse erlauben einen vollständig frischen Leseversuch; Austausch, Link, verlorener Name oder erneute Änderung bleiben feste Fehler statt erfolgreicher leerer Liste. |
| Sichtbare History-Zeilen | Erst die neuesten 20 bestimmen, danach deren Wiederaufnehmbarkeit und Hinweisprojektion lesen. | Keine Löschung älterer Läufe oder Ergebnisse. Recovery prüft weiterhin aktive Sperre, Intake-Besitz, Fristen und Policy; fehlende Hinweisnachweise bleiben unbekannt, nicht erwiesen hinweisfrei. |
| Ausdrückliche Exportnachholung | Den Export-Snapshot desselben Aufrufs wiederverwenden, wenn keine Mutation versucht wurde. | Schon ein werfender Exportversuch kann dauerhaft Fortschritt gemacht haben und erzwingt deshalb einen frischen Snapshot. Reines Öffnen der Liste löst keine Nachholung aus. |

Der frühe dauerhafte Retention-Capture bleibt vor der Aufbewahrungsbereinigung.
Sein schon zuvor eingeführter Byte-Index ist weiterhin nur eine Capture-Hilfe,
keine Freigabe- oder aktuelle Zielautorität. Auch die neue Owner-Map lebt nur
innerhalb eines Leseaufrufs. Weder eine persistente Berechtigung noch ein neuer
Parallel-Schreibkanal wurde eingeführt. Plugin und Standalone behalten getrennte
Produktkanäle; die gemeinsame normale Exportvalidierung wird nicht abgeschaltet.

Windows- und macOS-Dateisystemadapter behalten ihre unterschiedlichen nativen
Verträge: Windows-Handles, Sharing, ACL-/Reparse-Prüfung und Unix/macOS-
Handle-relative Öffnung, No-Follow-/Identitäts-/Berechtigungsprüfung sowie
Veröffentlichung bleiben unverändert. Die absolute 300-Sekunden-Exportfrist,
Shutdown-Besitz und serielle Core-Protokollordnung bleiben erhalten. Ein
Antwort-Timeout beendet einen noch arbeitenden OS-Aufruf nicht automatisch;
die [Rust-Dokumentation zu recv_timeout](https://doc.rust-lang.org/std/sync/mpsc/struct.Receiver.html#method.recv_timeout)
beschreibt die Wartefrist des Empfängers, nicht eine Thread-Abbruchgarantie.
Ein Festhänger erlaubt daher weiterhin keinen zweiten Schreiber.

Aktuelle lokale Nachweise dieser Runde:

- Windows-Rust erneut **162 bestanden, 0 fehlgeschlagen, 3 regulär ignorierte
  Unterprozess-Einstiegspunkte**. Die Fälle zählen reale Worker-Dispatches,
  Inventardurchgänge und Plan-Hashberechnungen. Gegenproben verändern Bytes
  nach einem neuen Abschlussbeleg, tauschen Eltern aus und prüfen Shutdown,
  verlorenen ACK sowie tatsächliche Prozessabbrüche und Umbenennungen.
- Dokument-/Auswahlexportsuite erneut **62/62**. Die neue direkte-ACK-Gegenprobe
  war vor der Änderung gezielt rot und ist danach grün. Unvollständiger ACK
  legt weder Kopie noch Bestätigung an; ein historischer ACK bleibt nach
  späterem Widerruf dem ursprünglichen Exportauftrag zugeordnet.
- Tatsächliche Node→Rust-Kopie für beide Zwecke erneut grün, einschließlich
  Unicode, 10.001-Kontakt-Spur, verlorener Antwort, Widerruf und manipuliertem
  Ziel. Die Befehlsaufzeichnung bestätigt genau einen `acknowledge` und keinen
  vorangestellten `reconcile` oder erneuten `publish`. Eine veränderte fertige
  Kopie wird auch über den direkten ACK abgewiesen.
- Service **64/64**, interner Node-Kanal **8/8**, projizierte
  Produktisolation/offline **4/4** erneut bestanden.
- Vollständige tatsächliche Sidecar-/Worker-Suite nach der unten beschriebenen
  Race-Korrektur erneut grün: beide Markdown-/OCR-Pfade, menschliche Vertagung
  mit Neustart, genaue OCR-Bildreferenzen, Fastweg und alle sieben EOF-/Fehler-/
  Shutdown-Lebenszyklen. Auch History, laufgenaue History, Result-Folder-Export,
  Recovery **24/24**, Dokument-/Versionsvertrag und Testpfadtrennung **13/13**
  sind erneut bestanden. Kein nativer Dialog wird dadurch als bedient erklärt.

Das zusätzliche 115-Dokument-Node-Profil arbeitet mit echten privaten
Dokument-/Journaldateien, aber synthetischem nativem Transport. Es zeigte
15,8 Sekunden Vorschau, 33,9 Sekunden Vorbereitung/Kopie und 0,115 Sekunden
ACK in dieser lokalen Konstellation. Es ist ausdrücklich **keine** Messung
des nativen Rust-Dateikopierens, kein Vorher/Nachher-Geschwindigkeitsversprechen
und kein Windows-/Mac-Paketabnahmetest. Erforderliche frische Quell-, Hash- und
Zielzugriffe bleiben bei großen Beständen oder langsamen Volumes kostspielig.

Die Quellcode-Gegenprüfung fand keinen konkreten Schutzverlust durch diese
begrenzten Optimierungen. Das beweist keine vollständige Fehlerfreiheit.
Die nativen Tests dieser Runde laufen unter Windows; ein macOS-Build, native
Dialogbedienung, Paketstart und insbesondere die ausdrücklich verschobene
M2-Zielhostprobe werden daraus nicht abgeleitet. Kein neuer Release oder
Versionssprung wurde in dieser Runde erzeugt. Die strengere Clippy-Prüfung
meldet weiterhin bereits vorher vorhandene lokale Stil-/Argumentzahlbefunde;
diese wurden nicht durch Abschalten von Lints verborgen.

### Reales Parallelitätsrennen in der Schlussgegenprobe

Die zusätzlich vom Hauptagenten ausgeführte tatsächliche Sidecar-Suite war
zunächst rot: Nach dem Markdown-Ablauf wurde im selben Profil ein neuer
OCR-Lauf gestartet. Der Worker legte gerade `document-reviews/<token>` an,
während die globale History ältere Exporte las. Die strikte Gleichheit der
gesamten Namensmenge wertete diese normale Anlage als unsicheren Verlauf.
Der produktive Fehler wurde behoben; der IPC-Testhelper erhielt **keine**
Toleranz für einen Fehler oder eine alte Antwort.

Nur gewöhnliche zusätzliche physische Verzeichnisse bzw. die erstmalige
physisch gebundene Review-Rootanlage qualifizieren jetzt als interner
Bestandswechsel. Die erste Zeilenprojektion wird vollständig verworfen.
Genau ein weiterer, vollständiger Leseversuch liest Outbox, Owner und
Manifeste frisch. Dieselben äußeren Root-/Outbox-/Review-Identitäten gelten
über beide Versuche. Entfernte Namen, Dateieinträge, Links, Austausch und
Zugriffsfehler bleiben hart; ein erneuter Bestandswechsel liefert den festen
Fehler. Es gibt weder Schlafen noch eine Wiederholung von Lauf, Recovery,
Freigabe oder Export. Die Aussage bleibt eine Momentaufnahme, keine atomare
Gesamtsicht; jede spätere Aktion prüft ihre aktuelle Berechtigung selbst.

Eine deterministische reale Dateisystemgegenprobe war vor der Korrektur rot
und ist danach grün. Sie zählt die vollständige zweite Exportlektüre und
prüft zusätzlich eine Änderung in beiden Versuchen, frisch inkompatible
Owner-Evidenz statt einer veralteten Legacy-Zeile, Outboxtausch im zweiten
Versuch, Review-Elternaustausch und erstmalige Rootanlage. Ein gesonderter
erneuter Quellenreview fand keine Übernahme verworfener Zeilen oder neuer
Elternautorität.

Die globalen Profildaten zeigen eingesparte Arbeit, kein allgemeines
Geschwindigkeitsversprechen: bei 320 synthetischen Dateisystemläufen
**320 → 2 Owner-Auflistungen** und **103.040 → 1.280 Auflistungseinträge**
im vollständigen Capture. Bei 130 Journalen benötigt die globale Projektion
**131 statt bis zu 260 Journal-Lektüren**, darunter genau einen sichtbaren
frischen Recovery-Kandidaten. Bei 32 retained Läufen, auch mit zehn
Live-Überlagerungen, werden genau **20 Hinweisdateien** gelesen. Verlorene
oder beschädigte Hinweise liefern weiterhin eine unvollständige Bewertung.

Der abschließende 320er-Wiederholungslauf auf dem integrierten Quellstand
einschließlich der Race-Korrektur ist ebenfalls bestanden. In diesem
Windows-FS-Profil benötigte der vollständige Capture 19,60 s, der bereits
vorher eingeführte unveränderte Capture-Index 6,92 s, ein geänderter
Exportgrundstand 23,00 s und die globale History 16,84 s. Die zugehörigen
Owner-Auflistungen betragen 2 / 1 / 4 / 2. Die globale Liste benötigt dabei
weiter 187.235 Stat-Aufrufe; die vollständigen frischen Anker-/Elternprüfungen
sind also messbar teuer und nicht durch diese Optimierung verschwunden.
Das sind lokale Phasenmessungen, kein Gesamtdauer- oder Zielhostversprechen.

Diese Reduktion unnötiger Aufrufe und das spätere Laden tatsächlich benötigter
Details entspricht [Apples allgemeinen Dateisystem-Performancehinweisen](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/PerformanceTips/PerformanceTips.html)
(archivierte Anleitung, keine aktuelle macOS-Zertifizierung). Das Betriebssystem-
Buffering wurde nicht abgeschaltet: [Microsoft dokumentiert hierfür zusätzliche
Ausrichtungsanforderungen](https://learn.microsoft.com/en-us/windows/win32/fileio/file-buffering).
Ein anderes Cache-/I/O-Verfahren wurde aus diesen Empfehlungen nicht blind
als plattformübergreifend sichere Abkürzung übernommen.

## Primäre Referenzen

Für die anschließende Performance-/Diagnoserunde wurden außerdem die
aktuellen Primärdokumentationen herangezogen:

- [Microsoft: Erstellen/Öffnen und Sharing von Dateien](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files):
  Windows-Zugriff und Sharing werden zusammen durchgesetzt. Ein erneutes
  Öffnen kann legitim scheitern; Unix-Annahmen dürfen nicht übernommen werden.
- [Apple: Distribution-signierten Code erstellen](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac):
  verschachtelter Code benötigt passende eigene Signieroptionen; eine
  Dokumentprüfung beweist weder korrekte Bundle-Platzierung noch Signierung.
- [Apple: NSOpenPanel](https://developer.apple.com/documentation/appkit/nsopenpanel):
  der native Dateidialog besitzt einen eigenen Systempfad. Seine tatsächliche
  Bedienbarkeit ist separat vom Core-Protokoll zu prüfen.
- [Node: Performance Measurement APIs](https://nodejs.org/api/perf_hooks.html):
  monotone Laufzeitmessung für begrenzte Phasen; Zeitwerte sind Messbelege,
  keine Berechtigung zum Überspringen einer Prüfung und kein starres CI-Limit.
- [Rust: Dateisystem und TOCTOU](https://doc.rust-lang.org/stable/std/fs/) sowie
  [OpenOptions::create_new](https://doc.rust-lang.org/std/fs/struct.OpenOptions.html#method.create_new):
  atomare neue Zieldatei und gehaltene Handles statt Existenzprüfung mit
  anschließendem Überschreiben. Elternordner-/Reparse-Sicherheit bleibt ein
  zusätzlicher plattformspezifischer Vertrag.
- [OWASP: Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html):
  Diagnosequellen beim Export erneut als untrusted behandeln, feste erlaubte
  Felder verwenden, sensible Werte ausschließen und Größen-/Fehlergrenzen
  prüfen. Eine nachträgliche Rohkopie alter Logs erfüllt diesen Vertrag nicht.

Die Aktivitätsbereinigung folgt der dokumentierten
[Rust-Guard-Lebensdauer](https://doc.rust-lang.org/std/sync/struct.MutexGuard.html).
Der gemeinsame Commit verwendet weiterhin die bestehende Store-Synchronisierung;
eine normale Schreibantwort allein ist keine zusätzliche Haltbarkeitsgarantie
([Node-Dateisystemdokumentation](https://nodejs.org/api/fs.html)).
Die Trennung von benutzerseitigen Ergebnissen und privaten App-Daten entspricht
[Apples Verzeichniszwecken](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively).
Die Ergebnisanzeige verwendet Text und programmatisch erkennbare Statusmeldungen,
nicht nur Farbe oder ein Häkchen
([W3C: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)).
Ein Vorschlag unter „Dokumente“ umgeht nicht die macOS-Zugriffskontrolle
([Apple: Dateizugriffskontrolle](https://support.apple.com/guide/security/secddd1d86a6/web)).
