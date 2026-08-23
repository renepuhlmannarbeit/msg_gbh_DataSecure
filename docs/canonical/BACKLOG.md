# Kanonisches Entwicklungsbacklog

Stand: 23.08.2026 · Ausgangsbasis: RC30

Dies ist die einzige priorisierte Arbeitsliste für das beschlossene Zielprodukt.
`P0` blockiert alle nachfolgenden Freigaben. Ein Eintrag gilt erst als erledigt, wenn
Code, Tests, Dokumentation und Traceability gemeinsam aktualisiert sind.

Pflegeregel: Jeder Entwicklungscommit aktualisiert die betroffene Story oder wird
unmittelbar von einem Dokumentationscommit begleitet. Das Backlog nennt dabei den
tatsächlich erreichten Nachweis und die verbleibende Restlücke; Piloten werden nicht
mit Produktfreigaben gleichgesetzt.

## Statusübersicht der Epics

| Epic | PO-Status | Wiederverwendbare Basis | Nächster echter Produktfortschritt |
|---|---|---|---|
| BL-001 | erledigt | kanonische Dokumente und Prüftest | laufend pflegen |
| BL-002 | erledigt | getrennte Ist-/Zielmanifeste und Drift-Test | laufend bei jeder Capability-Änderung prüfen |
| BL-010 | teilweise | ZIP/MCPB, Parität, Plattformadapter | installationsfreier Startvertrag |
| BL-011 | teilweise | Journale, Snapshot, Claims, Recovery | private Kopien und echte Wiederaufnahme |
| BL-012 | teilweise | Windows-Einzeldialoge und Abschlusszähler | ein stapelweiter Dialog auf drei OS |
| BL-020 | teilweise | ZIP-/OOXML-Härtung und Warnungen | gemeinsamer Content-Graph |
| BL-021 | teilweise | TXT, MD/`.markdown` und CSV im aktiven Textpfad | praktische Drei-OS-Abnahme und Differentialtests belegen |
| BL-022 | teilweise | DOCX freigegeben, XLSX/PPTX-Parser getestet | vollständige OOXML-Coverage |
| BL-023 | in Arbeit | PDFium-Spike und Drei-OS-Risikogate | Pflichtmatrix praktisch belegen |
| BL-024 | teilweise | Windows-OCR und Bildbausteine | gebündelte OCR auf drei OS |
| BL-030 | teilweise | Auto-Profil und Dokumentpseudonyme | stapelweiter fortsetzbarer Kontext |
| BL-031 | teilweise | fortgeschrittener Zertifikatskontext | Stapelentscheidungen und Corpus-Ausbau |
| BL-032 | teilweise | Windows-Mehrdeutigkeitsreview | Passwort, Vertagen und drei OS |
| BL-040 | erledigt | dauerhafter lokaler Export, Mapping und Batch-Nachweis | bei Produktänderungen regressiv prüfen |
| BL-041 | teilweise | zwei Skills und sicherer RC30-Teilweg | neuer Stapelweg und Aufgabenfortsetzung |
| BL-042 | teilweise | Aussagegrenzen und Diagnosejournal | exportierbares Diagnosepaket |
| BL-050 | teilweise | 1.000er-Mehrprofilkorpus und breite Regression | Format-/Sprachverteilung erweitern |
| BL-051 | teilweise | kostenbegrenzte Kern-CI, manuelle Drei-OS-/Build-/Security-Evidenz, SBOM und Parität | echte Installations-/Rollback-Matrix |
| BL-052 | offen | Expertenreviews, aber keine Nutzerabnahme | beobachtete Drei-Parteien-Abnahme |

## Lieferreihenfolge

Die Epics bleiben für Entscheidungen und Traceability stabil. Die folgenden Stories
sind die tatsächlich planbaren Einheiten. Eine Parserexistenz oder ein Spike ist noch
keine Formatfreigabe.

Review-Gate 23.08.2026: Software-, Security-, Product-Owner-/UX- und
Claude-/Cowork-Review priorisieren die neuen beziehungsweise präzisierten
Release-Sperren in dieser Reihenfolge:

1. `BL-012.8` macOS-Review reparieren und `BL-011.8` private Batchwurzel absichern.
2. `BL-042.2` Toolberechtigungen, `BL-010.7` Hostvertrag und `BL-010.8`
   installationsfreien Pluginstart belegen.
3. `BL-011.9` harte portable Parsergrenzen und `BL-041.4` gleiche
   Einstiegsentscheidungen liefern.
4. `BL-041.5` vollständige lokale Stapelaufbereitung von der gestuften
   Claude-Weiterverarbeitung trennen.
5. `BL-030.2` erst nach positiver Drei-OS-Keyring-Evidenz aktivieren und danach die
   echten Cowork-/Distributionsgates `BL-051.5` und `BL-051.6` schließen.

Keiner dieser Befunde erweitert den aktuellen Engineering-Funktionsumfang. P0 bleibt
bis zum jeweils geforderten Code-, Negativtest- und realen Host-/OS-Nachweis offen.

### Meilenstein 0 – Wahrheit und riskante Verträge zuerst

#### BL-001.1 – Open-Source-Wiederverwendung verbindlich machen

Status: **erledigt** · Epic: BL-001 · Entscheidung: DS-038

Jedes Epic besitzt im kanonischen Komponentenregister Kandidaten, Prüfgates oder eine
begründete Restlücke. Eine Story darf Eigenentwicklung erst beginnen, wenn passende
Bausteine praktisch verglichen wurden; ein Bibliotheksname allein ist keine Abnahme.

#### BL-002.1 – RC30-Ist-Manifest vervollständigen

Status: **erledigt** · Epic: BL-002

`BUILD_INFO.json`, Runtime-Status und öffentliche Texte nennen nur tatsächlich
freigegebene Fähigkeiten; TXT/Markdown/CSV/DOCX sind als exakte Allowlist getestet.

#### BL-002.2 – Maschinenlesbares Zielmanifest einführen

Status: **erledigt** · Epic: BL-002

Das Zielmanifest enthält DS-IDs, Zielformate, Plattformen und Grenzwerte, wird aber
niemals von der RC30-Runtime als aktuelle Fähigkeit ausgegeben.

#### BL-002.3 – Fähigkeits-Drift automatisch blockieren

Status: **erledigt** · Epic: BL-002 · Abhängigkeit: BL-002.2

Ein Test vergleicht Runtime, Ist-Manifest, Skills, Marketplace und aktive Handbücher;
Zieltexte werden ausdrücklich getrennt behandelt.

#### BL-011.1 – Privaten unveränderlichen Stapel-Snapshot spezifizieren

Status: **erledigt** · Epic: BL-011

Ausgewählte Originale bleiben unverändert; private Kopien und ihr atomarer Zustand
sind die alleinige Fortsetzungsbasis. Originaländerungen nach Start verändern den
Auftrag nicht.

#### BL-030.1 – Fortsetzbaren Pseudonymvertrag spezifizieren

Status: **erledigt** · Epic: BL-030 · Abhängigkeit: BL-011.1

Stapelweite Konsistenz über Neustarts wird ohne persistente Rohwert-Mappingtabelle
nachgewiesen. Seed-/Ableitungsverfahren, 14-Tage-Lebenszyklus und Löschung sind Teil
des Sicherheitsvertrags.

#### BL-023.1 – PDF-/OCR-Risikobeweis auf drei Plattformen

Status: **in Arbeit** · Epic: BL-023, BL-024

Vor Produktcode werden bestehende PDF-/OCR-Bausteine gegen einen Eigenbuild sowie
Engine, Offline-Verhalten, Paketgröße, Lizenzinventar,
Verschlüsselung, Scanpfad und sichere Prozessgrenze auf Windows/macOS/Linux belegt.

Fortschritt 22.08.2026:

- PDFium-Preflight `32593313169` und PDF.js-/Canvas-Pilot `32594467568` liefen auf
  Windows x64, macOS x64/ARM64 und Linux x64; alle Ergebnisse bleiben `no_go`.
- Tesseract.js-/Canvas-Pilot `32594838193` bestand lokale Deutsch-/Englisch-OCR und
  Netzwerkverbot auf denselben vier Zielen.
- Lauf `32595199861` ergänzte offizielle CycloneDX-1.5-SBOMs, Paketintegritäten,
  Lizenzallowlist sowie Commit-/Hashprüfung der Sprachmodelle und ihrer Lizenz.
- Lauf `32595454727` bestand getrennte OCR-Prozesse, Timeout-/Flood-Gegenproben,
  Heap-, Laufzeit- und Ausgabegrenzen; Windows zusätzlich mit Job-Object-RAM/CPU.

Restlücke: vollständige PDF-Coverage einschließlich Verschlüsselung und Scanpfad,
native harte RAM-/CPU-Grenzen auf macOS/Linux, Notices/Schwachstellenrichtlinie,
Angriffskorpus sowie ein frisches verteilbares Pluginpaket. Keine Pflichtmatrixzelle
ist allein durch die Piloten als Produktnachweis bestanden.

### Meilenstein 1 – Nutzbarer fortsetzbarer TXT-/DOCX-Stapelkern

#### BL-011.2 – Stapel auf 100 Dateien und 500 MB umstellen

Status: **erledigt** · Epic: BL-011 · Abhängigkeit: BL-011.1

Die bisherige 25-Dateien- und sichtbare 100-MB-Einzelgrenze wird durch 100 Dateien
und 500 MB Gesamtgröße ersetzt; Seitenzahlen bleiben unbegrenzt.

Nachweis 23.08.2026: Gateway, Companion-Dialog, IPC, Abschlusszähler und MCP-Schema
verwenden eine gemeinsame 100-Dateien-/500-MB-Grenze. Die Gesamtgröße wird vor der
Hashbildung geprüft; ein Test belegt 100 akzeptierte Dateien sowie die sperrende
Behandlung von 101 Dateien und 600 MB. Die aktive Format-Allowlist bleibt TXT/Markdown/CSV/DOCX.

#### BL-011.3 – Einen aktiven und mehrere pausierte Stapel erzwingen

Status: **in Arbeit** · Epic: BL-011 · Abhängigkeit: BL-011.1

Pro Benutzer existiert genau ein verarbeitender Auftrag. Pausierte Aufträge besitzen
getrennte Arbeitskopien, Pseudonymkontexte und Exporte.

Fortschritt 23.08.2026: `active-processing.json` ist eine atomar angelegte,
benutzerlokale Prozesssperre. Sie verhindert gleichzeitig verarbeitende Stapel auch
über getrennte Serverprozesse; nur eine nachweislich tote, wohlgeformte Sperre darf
wiederhergestellt werden. Beim Start entstehen ausschließlich versiegelte, zufällig
benannte private Arbeitskopien; Originale bleiben unverändert und spätere
Input-Änderungen beeinflussen den Batch nicht. Mehrere pausierte Snapshot-Sitzungen
können bestehen. Rest: getrennte Pseudonymkontexte aus BL-030.2.

Ergänzung 23.08.2026 (Review-Folge): Unvollständige lokale Stapel können nach
einer zweiten ausdrücklichen Bestätigung gesammelt verworfen werden. Dabei werden
nur versiegelte Arbeitskopien und Checkpoints entfernt; bereits veröffentlichte
Pakete und das dauerhafte Mapping bleiben erhalten. Ein konfigurierter
Datenschutzordner hinter Symlinks oder Windows-Junctions wird vor der Übernahme
fail-closed abgewiesen, auch wenn sein sichtbarer Name lokal wirkt.

Review-Befund 23.08.2026: Diese Prüfung schützt den konfigurierten
Datenschutzordner, aber noch nicht die separat erzeugte private `batches`-Wurzel.
Damit bleibt `BL-011.8` eine P0-Sicherheitsvoraussetzung; die vorstehende Ergänzung
ist ausdrücklich kein vollständiger Junction-/Reparse-Nachweis.

Ergänzung 23.08.2026: Eine vorhandene Sperre wird nur dann als wiederherstellbar
betrachtet, wenn Schema, Token, positive Prozess-ID und ein gültiger Zeitstempel
vollständig vorliegen und ihr Owner nachweislich tot ist. Eine unvollständige oder
manipulierte Sperre bleibt erhalten und blockiert fail-closed; sie kann nie still
gelöscht werden.

#### BL-011.4 – Checkpoints und echte Wiederaufnahme implementieren

Status: **erledigt** · Epic: BL-011 · Abhängigkeiten: BL-011.1, BL-030.1

Erfolge werden nicht wiederholt; offene/fehlgeschlagene Positionen können nach
Abbruch oder Neustart an der letzten sicheren Phase fortgesetzt werden.

Fortschritt 23.08.2026: Ein Abbruch während `processing` wird beim Lauf oder bei
Startup-Recovery als `retryable` persistiert. Bereits freigegebene Positionen bleiben
abgeschlossen; nach einem ausdrücklichen `resume_document_batch` werden nur
retryfähige Positionen erneut ausstehend. Terminale Sicherheitsstopps bleiben
gesperrt. Ein bereits atomar veröffentlichtes Paket ist nun über die vorab zufällige
Batch-Item-ID wiedererkennbar: Recovery verifiziert Manifest und Markdown-Hash,
schreibt das lokale Mapping idempotent und bietet exakt dieses Paket erneut an. Erst
nach `acknowledge_batch_document` darf die Queue fortschreiten; damit erzeugt ein
Chat-/Serverabbruch weder ein Doppelpaket noch eine verlorene Zuordnung.

Ergänzung 23.08.2026: `privacy_status` meldet ausschließlich inhaltsfreie Zähler
offener Stapel. In einer neuen Unterhaltung fragt der Skill vor jeder neuen Auswahl
nach der Fortsetzung; erst `continue_most_recent_document_batch(confirmed=true)`
gibt einen neuen opaken Token für den zuletzt offenen Stapel zurück. Ein Ersatzbatch
oder eine Ordneröffnung erfolgt dabei nicht automatisch.

Ergänzung 23.08.2026: Jede versiegelte Position führt zusätzlich einen festen,
lokalen Checkpoint (`sealed`, private Kopie, Extraktion, Textprüfung,
Paketverifikation, Übergabe oder terminaler Zustand). Diese Phasen enthalten keine
Quellidentität und werden nicht über MCP ausgegeben; die Recovery übernimmt ein
verifiziert veröffentlichtes Paket weiterhin vor jeder Wiederholung.

#### BL-011.5 – Lebenszyklus offener Arbeitskopien umsetzen

Status: **erledigt** · Epic: BL-011 · Abhängigkeit: BL-011.1

Erfolgreiche Arbeitskopien verschwinden unmittelbar nach der bestätigten lokalen
MCP-Übergabe, offene nach spätestens 14 Tagen;
Originale und dauerhafte Exporte bleiben unberührt.

Fortschritt 23.08.2026: Die erfolgreiche Snapshot-Datei bleibt ausschließlich bis zur
bestätigten MCP-Übergabe im privaten Batchbereich und wird danach sofort entfernt.
Scheitert ausschließlich diese nachgelagerte Löschung, bleibt das bereits
veröffentlichte Ergebnis korrekt `released`; die private Arbeitskopie wird nur lokal
als bereinigungsbedürftig markiert. Jeder nächste sichere Batch-Aufruf und die
Startup-Recovery versuchen ausschließlich diese reguläre private Datei erneut zu
entfernen; Symlinks oder unerwartete Einträge werden dabei nicht angerührt. Ablauf-
und Startup-Recovery entfernen Arbeitsbereich und Snapshot gemeinsam, während das
Original unangetastet bleibt.

Ergänzung 23.08.2026: Auch ein terminal sicher gestopptes Dokument erhält nach dem
lokalen Mapping-Commit keine aufzubewahrende Arbeitskopie mehr: seine versiegelten
Quellbytes werden mit derselben regulären-Datei-/Symlink-Prüfung sofort entfernt.
Ist genau diese Löschung gesperrt, bleibt nur der inhaltsfreie lokale
Bereinigungsmarker bestehen und jeder spätere sichere Batchaufruf versucht erneut
ausschließlich diese erwartete Arbeitskopie. Ein Test deckt sofortige Löschung und
einen künstlich gesperrten Wiederholungsfall sowohl im Folgeaufruf als auch nach
lokaler Startup-Recovery ab.

Ergänzung 23.08.2026: Wird eine versiegelte Arbeitskopie vor Verarbeitung verändert,
invalidiert der Batch die offene Snapshot-Sitzung fail-closed. Alle noch offenen
Positionen erhalten denselben festen Terminalcode, einen lokalen Stopp-Mappingeintrag
und ihre erwarteten privaten Kopien werden entfernt; kein Original wird dabei gelesen,
verändert oder aus dem lokalen Bereich herausgegeben.

Ergänzung 23.08.2026: `privacy_status` meldet zusätzlich nur den Zähler
`private_work_copy_cleanup_pending`. Er zeigt einen noch nicht bereinigten privaten
Arbeitskopierest ohne Batch-ID, Position, Namen, Pfad, Hash oder Dokumentinhalt;
der nächste sichere Batch-Aufruf und die Startup-Recovery versuchen weiterhin nur
die reguläre Datei zu bereinigen. Eine sechs-stündige lokale Wartung bereinigt
abgelaufene Snapshot-Bereiche zusätzlich nur unter derselben globalen
Verarbeitungssperre. Startup-Recovery und Wartung geben bei einem lebenden Owner
vollständig nach; sie dürfen einen laufenden `processing`-Zustand weder in
`retryable` überführen noch dessen Arbeitskopie löschen.

Ergänzung 23.08.2026: Ein zweiter ausschließlich aggregierter Statuszähler
`expired_batch_cleanup_pending` macht abgelaufene, noch nicht bereinigte
Snapshotjournale sichtbar. Er enthält keine Batch- oder Dokumentidentität und zählt
nicht Dateien; ein Löschfehler bleibt damit für IT erkennbar, ohne die
Datenschutzgrenze zu erweitern.

Ergänzung 23.08.2026: Stirbt ein Owner erst nach einem bewusst übersprungenen
Recovery-Lauf, übernimmt ausschließlich `resume_document_batch` beziehungsweise
die bestätigte Fortsetzung den nach dem Sperrerwerb verwaisten `processing`-Schritt.
Er wird dabei erst als `retryable`, dann als `resumed` protokolliert; eine normale
Abfrage oder `anonymize_next_document` startet ihn nicht stillschweigend erneut.

Ergänzung 23.08.2026: Startup-Recovery erwirbt nun dieselbe globale Sperre wie
Verarbeitung und Ablaufwartung. Jeder gelesene Journalzustand wird vor einer
Bereinigung an den Token seines eigenen Dateinamens gebunden; ein manipuliertes oder
fremdzugeordnetes Journal bleibt als lokaler Fehler liegen und kann niemals die
private Arbeitskopie eines anderen Stapels auswählen oder entfernen.

#### BL-011.6 – Speicher-, Entpack- und Ressourcen-Vorprüfung

Status: **in Arbeit** · Epic: BL-011, BL-020

500 MB Eingabe, ZIP-Bomben und große entpackte Inhalte werden vor Kapazitätsverlust
sicher behandelt; die Meldung bleibt verständlich und der Auftrag fortsetzbar.

Fortschritt 23.08.2026: Vor der ersten Kopie prüft der Batch die frei verfügbare
lokale Kapazität für Snapshot, aktive private Parserkopie und festen Puffer. Bei
zu wenig Speicher wird nichts übernommen. Für die veröffentlichte DOCX-Strecke
wird vor dem Snapshot zusätzlich nur das lokale ZIP-Zentralverzeichnis gelesen:
verschlüsselte/ZIP64-, beschädigte oder über das bestehende 300-MiB-Entpackbudget
gehende Container werden abgewiesen, ohne sie zu entpacken oder eine Arbeitskopie
anzulegen. Die vollständige Header-, CRC- und Inhaltsprüfung bleibt danach im
OOXML-Leser verpflichtend. Rest: dieselbe Vorprüfung für künftig freigegebene
Archive, explizite RAM-/Zeitbudgets und plattformübergreifende Ressourcenabnahme.

Ergänzung 23.08.2026: Die Speicherprüfung akzeptiert nur einzeln valide,
nichtnegative freie Blockzahlen und positive Blockgrößen. Fehlende, nichtnumerische,
negative oder überlaufende Dateisystemwerte stoppen damit vor Arbeitsordner,
Snapshot und Hashbildung; insbesondere können zwei fehlerhafte negative Werte nicht
zu einer scheinbar ausreichenden Kapazität multipliziert werden.

Ergänzung 23.08.2026: Der aktive Parserpfad besitzt jetzt explizite, getestete
Laufzeitbudgets: Windows erzwingt über den verifizierten Job-Object-Launcher
768 MiB Speicher, 40 Sekunden CPU und 45 Sekunden Wallclock; alle aktiven
Plattformen starten Node zusätzlich mit 384 MiB V8-Heap und der aufrufende Prozess
beendet den Parser nach 50 Sekunden. Der äußere Timeout liegt bewusst hinter dem
nativen Windows-Wallclock-Limit, damit dessen sichere Ressourcenmeldung übernommen
werden kann. Rest: dieselben Vorprüfungen für künftig freigegebene Archive und
praktische plattformübergreifende Ressourcenabnahme.

Review-Befund 23.08.2026: V8-Heap und Eltern-Timeout begrenzen auf macOS/Linux weder
alle nativen beziehungsweise `Buffer`-Allokationen noch einen vollständigen
Prozessbaum. Die Windows-Job-Object-Aussage darf deshalb nicht als gleichwertiger
Drei-OS-Schutz gelesen werden. `BL-011.9` schließt diese Lücke mit einem gebündelten
POSIX-Supervisor und realen adversarial OS-Proben.

#### BL-011.7 – Fortschrittsereignisse und sicheren Abbruch liefern

Status: **in Arbeit** · Epic: BL-011, BL-012 · Abhängigkeit: BL-011.4

Position, Phase, Zähler und belastbare Restzeit sind lokal verfügbar. Abbruch erzeugt
einen konsistenten Checkpoint und keine Teilfreigabe.

Fortschritt 23.08.2026: Jede serverseitige Batch-Antwort liefert jetzt nur
inhaltsfreie Zähler plus `batch_phase`, `next_position` und `completion_percent`.
Der Prozentwert zählt ausschließlich bestätigte terminal freigegebene oder gestoppte
Dateien; `delivery_pending` und ein fortsetzbarer Abbruch können daher nie fälschlich
als vollständig erscheinen. Der Skill bestätigt jedes gelesene Paket mit einem
paketgebundenen Übergabeschritt, bevor er die Queue fortsetzt. Rest: lokale Fortschrittsanzeige,
belastbare Restzeit und ein sichtbarer, sicherer Abbruchknopf.

Ergänzung 23.08.2026: `privacy_status` enthält den booleschen, inhaltsfreien Wert
`batch_processing_active`. Der Skill wartet bei `true`, statt eine konkurrierende
Fortsetzung oder neue Auswahl anzubieten; Batch-ID, Name, Pfad, Position und Inhalt
bleiben weiterhin lokal.

Präzisierung 23.08.2026: Status- und Diagnosepfade lesen Batchjournale ohne
Seiteneffekt. Insbesondere dürfen sie keine abgelaufene Sitzung bereinigen oder
einen verwaisten Lauf klassifizieren; das verbleibt ausschließlich bei expliziter
Recovery, Wartung oder bestätigter Fortsetzung unter globaler Sperre.

Ergänzung 23.08.2026: Der Host-Abbruch eines laufenden MCP-Aufrufs ist als
`REQUEST_CANCELLED` technisch fortsetzbar: Er erzeugt kein Teilpaket, keinen
Ersatzdialog und keine automatische Wiederholung. Skill, Anwenderhandbuch und
Eval-Korpus machen die erforderliche ausdrückliche spätere Fortsetzung sichtbar.
Der sichtbare Stoppknopf selbst bleibt Host-Funktion; eine eigene plattformabhängige
Parallel-UI wird dafür nicht eingeführt. Rest: lokale Fortschrittsanzeige und
belastbare Restzeit.

Ergänzung 23.08.2026: Nach der Bestätigung des letzten freigegebenen Dokuments
zeigt der reguläre MCP-Stapelweg bei mehr als einer Datei eine native lokale
Abschlussübersicht. Sie erhält ausschließlich die drei begrenzten Zähler
ausgewählt/freigegeben/sicher gestoppt; ein Fehler beim freiwilligen Hinweis ändert
den freigegebenen Stapel nicht.

Ergänzung 23.08.2026: Ab drei bereits lokal gemessenen Dokumentverarbeitungen
liefert der Fortschritt eine konservative Restzeit auf Basis des Medians dieser
reinen Verarbeitungsdauern. Sie wird weder aus Dateinamen oder Inhalten abgeleitet
noch während einer manuellen Prüfung oder expliziten Fortsetzung angezeigt. Rest:
eine freiwillige lokale Fortschrittsansicht; der Host-Stoppknopf bleibt absichtlich
die plattformübergreifende Abbruchmöglichkeit.

Ergänzung 23.08.2026: Ein persistierter In-Flight-Zustand zählt nun ausdrücklich
als `processing`; er kann weder `complete=true` noch 100 Prozent erzeugen. Die
inhaltsfreie Phase `processing_local_document` und ihre Position bleiben damit
konsistent, auch wenn eine Statusabfrage genau während der lokalen Verarbeitung
erfolgt.

#### BL-011.8 – Private Batchwurzel und Cleanup-Grenze pinnen

Status: **in Arbeit** · Priorität: **P0** · Epic: BL-011 · Abhängigkeiten: BL-011.3, BL-011.5

Alle privaten Batch-, Audit-, Job- und Cleanup-Pfade verwenden genau einen zentralen,
fail-closed validierten Speicherhelfer. Vor und nach `mkdir`, Kopie, Recovery, Lesen
und Löschen werden jedes erwartete Segment, kanonischer Parent und Plattformattribute
erneut geprüft. Symlinks sind überall verboten; Windows-Junctions und sonstige
Reparse-Points werden über einen geprüften Win32-Attributhelfer erkannt. Eine
Abweichung erzeugt nur einen festen lokalen Sicherheitscode und führt zu keiner
Operation außerhalb des erwarteten Datenschutzbereichs.

Abnahme: echte `mklink /J`-/Symlink-Fixtures auf Windows sowie Symlink-Fixtures auf
macOS/Linux; Swap-/Race-Gegenproben unmittelbar vor Kopie, Recovery und rekursivem
Cleanup; kein fremder Pfad wird gelesen oder verändert und das Original bleibt
unverändert. Ein reiner `realpath`-Vorcheck oder eine simulierte Windows-Junction
genügt nicht. Ein späterer handle-relativer Native-Helper bleibt zulässig, falls die
Revalidierung den TOCTOU-Nachweis nicht schließt.

Teilfortschritt 23.08.2026: `ensurePrivateDirectory` validiert nur literale
Kindnamen, prüft Parent und Ziel vor/nach der Anlage gegen Links, kanonische
Containment-, Geräte- und Inode-Abweichungen und wird nun für `batches`, `audit`,
`jobs` sowie alle Datenschutzunterordner verwendet. `batchRoot()` revalidiert bei
jedem Zugriff. Ein echter Windows-Junction-Test belegt den Stopp vor Listing/Kopie
und dass das externe Ziel unberührt bleibt. Offen bleiben ein gesonderter Win32-
Attributnachweis für sonstige Reparse-Typen sowie Swap-/TOCTOU-Gegenproben vor
Recovery und Cleanup auf allen Zielplattformen.

Race-Fortschritt 23.08.2026: Drei reale Dateisystemproben ergänzen den bisherigen
Root-Junction-Test. Ein Inode-Austausch unmittelbar in der letzten
Kapazitätsprüfung vor dem Snapshot stoppt beim handle-/namenbezogenen Recheck, ohne
das gerettete Original zu verändern. Eine ausgetauschte versiegelte Arbeitskopie
wird vor Recovery/Verarbeitung anhand Identität, Größe und SHA-256 abgelehnt; nur
das eingesetzte Objekt wird anschließend als ungültige Arbeitskopie entfernt. Ein
verschachtelter Junction/Symlink im Work-Verzeichnis verhindert rekursives
Verwerfen vollständig und lässt sein externes Ziel unangetastet. Damit sind die
konkreten Copy-, Recovery- und Cleanup-Grenzen lokal belegt. Offen bleiben echte
macOS-/Linux-Wiederholungen, ein Win32-Attributnachweis für Reparse-Typen jenseits
von Junction/Symlink sowie die nur handle-relativ vollständig schließbare Race-Lücke
zwischen letzter Baumprüfung und rekursivem OS-Delete.

#### BL-011.9 – Harte Parserressourcen auf macOS und Linux erzwingen

Status: **offen** · Priorität: **P0** · Epic: BL-011, BL-020 · Abhängigkeiten: BL-011.6, BL-010.3, BL-010.4

Der bereits für OCR bewährte POSIX-Supervisor wird als wiederverwendbarer,
hashgebundener `datasecure-sandbox`-Launcher für den allgemeinen Parserpfad
ausgeliefert. Er setzt mindestens CPU-, Adressraum-/Daten-, Dateigrößen- und
Dateideskriptorgrenzen, startet eine eigene Prozessgruppe und beendet sie bei
Wallclocküberschreitung vollständig. Node-Permission- und Netzwerk-Guard bleiben
zusätzliche Schichten. Kann eine Pflichtgrenze nicht gesetzt oder verifiziert werden,
stoppt der Parser mit `PARSER_ISOLATION_FAILED`.

Abnahme: echte macOS-x64-/ARM64- und Linux-x64-Proben für CPU-Loop, nativen/
`Buffer`-Speicherdruck, Ausgabeflut, Kindprozessbaum und Timeout; beobachtete Maxima,
vollständiges Child-Reaping, Bundle-Hashes und feste Limit-Exitcodes. Shell-`ulimit`,
Docker/VM oder vorausgesetzte Admin-/cgroup-Konfiguration sind kein Endanwenderweg.

Supervisor-Fortschritt 23.08.2026: Der wiederverwendbare POSIX-Quellpilot setzt nun
zusätzlich zu CPU/Core und dem unabhängigen RSS-/Wallclock-Monitor harte
`RLIMIT_AS`-, `RLIMIT_DATA`-, `RLIMIT_FSIZE`- und `RLIMIT_NOFILE`-Grenzen. Weil V8
mehr virtuellen Adressraum als residenten Speicher reserviert, bleibt die
Adressraumgrenze endlich, aber bewusst größer als das separate RSS-/Datenbudget.
`--sandbox-contract` liefert ausschließlich einen festen JSON-Vertrag mit sieben
Grenzklassen und vollständigem Prozessgruppen-Reaping. Der manuelle
Vier-Ziel-OCR-Workflow kompiliert mit `-Werror` und validiert diesen Marker künftig
vor jedem Pilotlauf; der Architekturtest pinnt alle Pflichtgrenzen.
Auf dem aktuellen Windows-Rechner war zwar WSL vorhanden, im installierten Ubuntu
jedoch kein C-Compiler; deshalb wird kein lokaler Linux-Binärnachweis behauptet.
Offen bleiben die tatsächlichen CPU-/RAM-/Flood-/Child-/Timeout-Proben auf den
Zielarchitekturen, hashgebundene neue Binärartefakte und erst danach die Einbindung
des Supervisors in den allgemeinen Parserpfad.

#### BL-030.2 – Stapelweites Auto-Profil und Pseudonyme implementieren

Status: **in Arbeit** · Epic: BL-030 · Abhängigkeiten: BL-011.4, BL-030.1

Gemischte Dateien werden einzeln klassifiziert; gleiche Entitäten erhalten im
gesamten Stapel konsistente, danach gelöschte Pseudonyme.

Auto-Profil-Nachweis 23.08.2026: Der produktive `auto`-Pfad klassifiziert jede
versiegelte Arbeitskopie erst nach ihrer eigenen lokalen Extraktion. Ein realer
Vier-Datei-Batch in `test-batch-session.js` veröffentlicht Vertrag,
Mitarbeiterprofil, Bewerbung und Kundenvorgang mit vier unterschiedlichen korrekten
Manifestprofilen. Direkte Identifikatoren fehlen in allen Resultaten, während
Haftung, Skillset, Motivation und Kundennummer erhalten bleiben. Damit ist die
automatische Profilentscheidung für gemischte aktive Textformate lokal belegt; der
offene Anteil dieses Items ist nur noch der produktive stapelweite
Pseudonym-Lifecycle und seine Drei-OS-Keyring-Abnahme.

Entscheidung 23.08.2026: Die Implementierung beginnt erst mit einem nachweisbar
gleichwertigen Benutzerschutz für Windows DPAPI, macOS Keychain und Linux Secret
Service. Ein dateibasierter Klartext- oder selbstverschlüsselter Fallback würde den
Vertrag `BATCH_PSEUDONYM_V1` verletzen und ist ausgeschlossen. Bis zu diesem
Nachweis bleibt die bestehende pro Dokument begrenzte Pseudonymisierung aktiv;
gemischte Stapel werden weiter einzeln und fail-closed verarbeitet.

Ergänzung 23.08.2026: Als erster wiederverwendbarer Pilotkandidat ist
`@napi-rs/keyring` 1.3.0 (MIT) im Komponentenregister dokumentiert. Die mögliche
Übernahme verlangt einen versions- und architekturgebundenen Bundle-Lock, dynamisches
Laden, Offline-/Set-/Get-/Delete-Nachweise auf Windows, macOS x64/ARM64 und Linux
x64 sowie einen Negativtest für einen gesperrten oder fehlenden Secret Service. Jede
Unverfügbarkeit stoppt vor Snapshot und Pseudonymvergabe; insbesondere sind Datei-,
CLI- und Eigenverschlüsselungs-Fallbacks ausgeschlossen.

Teilfortschritt 23.08.2026: `server/batch-secret-store.js` kapselt diesen Kandidaten
als noch nicht angebundenen Adapterpilot. Er akzeptiert ausschließlich einen
undurchsichtigen Batch-Token, verwendet einen festen Servicenamen und hält exakt
256 Bit nur im nativen Store. Fehlt die Native-Bindung oder liefert sie einen Fehler,
stoppt der Aufruf mit einem generischen Fehler; Datei-, Umgebungsvariablen-, CLI- und
Eigenverschlüsselungs-Fallbacks existieren nicht. `test-batch-secret-store.js`
belegt den Vertrag mit einer isolierten Fake-Bindung. Der getrennte native Pilot
besitzt einen Bundle-Lock, aber dieser Adaptertest ist kein Drei-OS-Nachweis und
aktiviert keine stapelweite Pseudonymisierung.

Zusätzlich implementiert `server/batch-pseudonym-registry.js` die ausschließlich
flüchtige HMAC-SHA-256-/Base32-Ableitung aus dem Zielvertrag. Sie akzeptiert nur ein
256-Bit-Secret, vereinheitlicht Unicode, trennt Entitätstypen, entkoppelt verschiedene
Secrets und verlängert kollidierende gekürzte Labels statt Werte zusammenzuführen.
Sie kann über eine ausschließlich interne, nicht MCP-erreichbare Abhängigkeitsnaht an
die vorhandene PII-Engine und ihren normalen Rest-PII-Gate übergeben werden; Ergebnis,
Journal, Audit und Diagnose erhalten diese Registry nie. Sie ist wegen der fehlenden
OS-Matrix weiterhin nicht im produktiven Batchpfad aktiviert.
`test-batch-pseudonym-registry.js` belegt diese Eigenschaften.

Ergänzung 23.08.2026: Die PII-Engine verwendet für organisationsweite Aliasauflösung
nun eine enge Registry-Schnittstelle (`remember` und `entriesForKind`) statt einer
frei mutierbaren Alias-Map. Die Map ist weder eine öffentliche Property noch
serialisierbar; die Regression belegt zugleich die unveränderte Alias-Redaktion.

Nachweisvorbereitung 23.08.2026: `native/keyring/pilot` enthält einen npm-v3-Lock
für `@napi-rs/keyring` 1.3.0 und alle Zielartefakte. Der inhaltsfreie Pilot prüft
Set/Get/Delete eines zufälligen 256-Bit-Secrets und löscht es anschließend wieder;
er protokolliert weder Secret noch Account. `test-keyring-pilot.js` prüft Lock und
Runner. Der lokale Windows-Smoke-Test ist grün. `.github/workflows/keyring-pilot.yml`
definiert die noch auszuführende Windows-/macOS-x64-/macOS-ARM64-/Linux-Matrix; ohne
deren positive Artefakte bleibt der Runtimepfad geschlossen.

Lifecycle-Fortschritt 23.08.2026: `server/batch-pseudonym-context.js` schließt die
interne Naht zwischen nativem Store und flüchtiger Registry, ohne sie für MCP oder
den produktiven Stapel zu aktivieren. Provisionierung speichert genau ein zufälliges
256-Bit-Secret und liefert ausschließlich Vertragsversion plus opakes Batchkonto;
Fehler versuchen den möglicherweise teilgeschriebenen Eintrag zu löschen. Jeder
Verarbeitungsschritt lädt das Secret neu, erzeugt eine kurzlebige Registry und
löscht Registry sowie Buffer im `finally`-Pfad. Fehlendes oder unlesbares Material
stoppt fest mit `PSEUDONYM_SECRET_UNAVAILABLE`, statt einen neuen Schlüssel zu
erzeugen. Terminales Entfernen macht spätere Fortsetzung unmöglich.
`test-batch-pseudonym-context.js` belegt diese sieben Fälle einschließlich zweier
prozessähnlich getrennter Aufrufe mit identischem Pseudonym, Callback-Fehlererhalt,
Rollback und fehlender Datei-/Environment-/CLI-/Eigenverschlüsselung. Offen bleiben
die positive Drei-OS-Keyring-Matrix und erst danach die atomare Einbindung dieser
Naht in Begin/Resume/TTL/Discard des produktiven Batchpfads.

Review-Lösungsvertrag 23.08.2026: Nach positiver Matrix wird vor dem finalen
Snapshot-Commit ein 256-Bit-Secret unter einem opaken Batchkonto im OS-Keyring
angelegt. Der persistierte Zustand enthält nur Vertrags-/Regelversion und opakes
Konto. Jeder Verarbeitungsschritt lädt das Secret kurzlebig, erzeugt daraus die
interne Registry und löscht sie nach dem Aufruf. Snapshot-/Statefehler löschen das
Secret; Verlust oder Keyringfehler stoppen mit `PSEUDONYM_SECRET_UNAVAILABLE`, statt
neue Pseudonyme abzuleiten. Nach terminalem Abschluss, TTL oder bestätigtem Verwerfen
wird der Keyring-Eintrag entfernt; bei ausstehender Paketübergabe bleibt er bis zur
Bestätigung beziehungsweise TTL erhalten. Journal, Mapping, Audit, Diagnose und MCP
sehen weder Secret noch Rohwert. Gleiche Entität nach Prozessneustart, Batchtrennung,
Unicode, Aliase, Typtrennung, Kollision, Verlust und Rollback sind Pflichtfälle.

#### BL-040.1 – Exportordner, neutrale Namen und Kollisionsschutz

Status: **erledigt** · Epic: BL-040 · Abhängigkeit: BL-011.1

Ein fester benutzerlokaler Standardordner hält alle Exporte auffindbar zusammen.
Neue Ergebnis-Pakete überschreiben niemals vorhandene Dateien.

Nachweis 23.08.2026: Die PO-Entscheidung ersetzt die wechselnde Ordnerwahl durch
den festen, benutzerlokalen Ordner `DataSecure-Export` innerhalb des bereits sicheren
Datenschutzbereichs. Das vermeidet Fehlablagen und macht Mapping und Nachweise
dauerhaft an einer Stelle auffindbar. Ergebnis-Pakete erhalten kollisionssichere
neutrale Namen; Mapping und Nachweis sind atomare fortlaufende Ledger.

#### BL-040.2 – MCP-unsichtbare UTF-8-Mapping-CSV

Status: **erledigt** · Epic: BL-040 · Abhängigkeit: BL-040.1

Originalname, neutraler Ergebnisname, Status und fester Hinweis werden ohne Pfad
exportiert. CSV-Formelinjektion ist verhindert; kein MCP-Lesetool erreicht die Datei.

Fortschritt 23.08.2026: Ein lokaler, atomar geschriebener UTF-8-CSV-Export liegt
dauerhaft unter `DataSecure-Export/DataSecure-Mapping.csv`. Er enthält nur
Originalbasename, Paket-ID (bei einem Sicherheitsstopp leer), Status und einen festen
Hinweis; Felder werden gegen Tabellenformeln geschützt. Damit bleibt auch ein
teilweise gestoppter Stapel lokal nachvollziehbar, ohne einen Ergebnisnamen zu
erfinden. Bei einem Sicherheitsstopp erhält der Skill ausschließlich den
inhaltsfreien Wahrheitswert, ob dieser lokale Ledger-Eintrag geschrieben werden
konnte; Namen und Mappingpfad bleiben außerhalb von MCP. Der feste
Exportort ist die explizit beschlossene Benutzervereinfachung. Ein fehlgeschlagener
Mapping-Commit zieht ein gerade erzeugtes Paket zurück und liefert nur den festen
Fehlercode `LOCAL_MAPPING_EXPORT_FAILED`.

#### BL-040.3 – Stapelweiten JSON-Nachweis exportieren

Status: **erledigt** · Epic: BL-040 · Abhängigkeit: BL-040.1

Versionen, Zeitpunkt, Zähler, Regelstand und feste Codes bestehen eine strikte
Leckageprüfung ohne Namen, Pfade, Inhalte oder Pseudonymzuordnung.

Fortschritt 23.08.2026: Nach einem terminalen Stapel entsteht bzw. wächst unter
`DataSecure-Export/DataSecure-Batch-Nachweis.json` ein atomar geschriebener
JSON-Nachweis. Jeder Eintrag enthält nur Zeitpunkt, Profil, aggregierte Zähler,
Bildmodus, Versionen, Regelstände und validierte feste Fehlercodes. Namen, Pfade,
Inhalte, Hashes, Paket-/Batch-IDs und Pseudonyme sind ausgeschlossen und werden
durch Regressionstests gegen freigegebene und terminal gestoppte Beispieldaten
geprüft. Der Reader akzeptiert nur den geschlossenen V1-Feldsatz und konsistente
Zähler; unbekannte Felder werden abgewiesen.

### Meilenstein 2 – Ein zusammenhängender lokaler Benutzerweg

#### BL-012.1 – Stapel ohne Zwischenfragen analysieren

Status: **erledigt** · Epic: BL-012 · Abhängigkeit: BL-011.4

Alle Dateien erreichen zuerst einen sicheren Ergebnis- oder Offenstatus; kein
per-Datei-Dialog unterbricht die Analysephase.

Fortschritt 23.08.2026: Die bewusste lokale Mehrfachauswahl gilt jetzt als
Batchzustimmung für eindeutig automatisch prüfbare Textdateien. Sie erhalten keinen
identischen Bestätigungsdialog je Datei; die lokale Jobkette dokumentiert dennoch den
automatischen Pfad. Der zentrale serverseitige Batchpfad verwendet bei einer
Zertifikats-/Organisations-Mehrdeutigkeit jetzt denselben lokalen, betriebssystem-
bezogenen Entscheidungsweg wie der Einzelpfad; die Entwurfsdaten bleiben im Speicher,
werden per `stdin` an die lokale Oberfläche gegeben und weder im Batchjournal noch per
MCP ausgegeben. Ein Abbruch ist terminal und wird nicht automatisch wiederholt.
Visuelle/technische Unsicherheiten bleiben gesperrt.

Ergänzung 23.08.2026: In Mehrdatei-Stapeln werden Zertifikats-/Organisations-
Mehrdeutigkeiten während der ersten Analysephase automatisch als inhaltsfreies
`deferred_review` festgehalten; dadurch unterbricht keine einzelne Fundstelle die
Bearbeitung klarer restlicher Dateien. Nach ausdrücklichem Auftrag startet allein
`review_deferred_document_batch` die gemeinsame lokale Entscheidung; der technische
Fortsetzungsbefehl setzt vertagte Positionen nicht in den Einzeldialogpfad zurück.

#### BL-012.2 – Einen gebündelten Abschlussdialog bauen

Status: **in Arbeit** · Epic: BL-012, BL-031 · Abhängigkeit: BL-012.1

Alle Mehrdeutigkeiten und fachlich nicht vollständig übertragbaren Bereiche werden
in genau einem lokalen Dialog fundstellenbezogen entschieden.

Fortschritt 23.08.2026: Die rein informative Batch-Abschlussansicht nutzt Windows
Forms unter Windows, AppleScript unter macOS sowie Zenity mit KDialog-Fallback unter
Linux. Sie zeigt nur feste Zähler und keinen Dokumentinhalt; ihr Ausfall widerruft
keine bereits sicher freigegebenen Pakete. Rest: der eine fachliche Abschlussdialog
mit vertagbarer lokaler Sichtprüfung, Fortschrittsanzeige und Zugänglichkeitsabnahme.

Entwurfsvertrag 23.08.2026: `contracts/BATCH_REVIEW_V1.md` legt fest, dass ein
späterer echter Sammeldialog keine Rohentwürfe persistiert: Er rekonstruiert sie erst
aus den versiegelten Arbeitskopien im lokalen UI-Vorgang und veröffentlicht nur nach
dessen Entscheidungen atomar. Der Vertrag fixiert Abbruch, Vertagung, Wiederaufnahme,
Ressourcengrenzen sowie den Plattform-Paritätsnachweis vor der Implementierung.

Teilfortschritt 23.08.2026: `companion/text-review.js` besitzt eine rein
flüchtige Batch-Entwurfs- und Rückzuordnungsmodellschicht. Sie bündelt mehrere
lokale Entwürfe unter anonymen Dokumentnummern, vergibt nur für den Vorgang
globale Fundstellen-IDs und zerlegt eine validierte Entscheidung wieder in je
Dokument. Ein Test prüft die fehlende Namens-/Pfadübernahme und lehnt noch nicht
positionssicher abbildbare freie Bereichsredaktionen ab. Der Koordinator ruft
für diesen Entwurf genau einen lokalen Reviewer auf; die Windows-Ansicht
kennzeichnet ihn als Stapelprüfung und blendet freie Bereichsanonymisierungen
aus. Entwurf und Entscheidung werden ausschließlich innerhalb desselben lokalen
Vorgangs verarbeitet oder verworfen – niemals in das Batchjournal übernommen.

Umsetzung 23.08.2026: `review_deferred_document_batch` rekonstruiert nach der
Analyse alle vertagten Entwürfe sequenziell aus versiegelten Arbeitskopien,
öffnet genau einen lokalen Reviewer-Aufruf und führt die entschiedenen Positionen
anschließend erneut durch den normalen atomaren Paketpfad. Bereits veröffentlichte
Pakete bleiben `delivery_pending` und werden bei einer Unterbrechung regulär
wieder zugestellt; nicht veröffentlichte Positionen bleiben gesperrt. Die
End-to-End-Regression belegt zwei Fundstellen, einen Reviewer-Aufruf, zwei
Paketfreigaben und die Abwesenheit der Rohwerte im Journal. Rest: tatsächliche
native Ein-Fenster-Parität und Zugänglichkeitsnachweise auf macOS/Linux.

Fortschritt 23.08.2026: Der bestehende Windows-Prüfdialog akzeptiert jetzt den
gemeinsamen 100-Datei-Vertrag statt einer veralteten 25-Datei-UI-Grenze. Der
stapelweit gebündelte Review-Aufruf ist inzwischen im Gateway angebunden; echte
native Ein-Fenster- und Zugänglichkeitsparität auf macOS und Linux bleibt offen.

Ergänzung 23.08.2026: Die Linux-Auswahl fordert bei Mehrfachauswahl jetzt explizit
zeilengetrennte Mehrfachpfade für Zenity und KDialog an; dadurch bleibt der
100-Datei-Vertrag vor der lokalen Verarbeitung erhalten.

Ergänzung 23.08.2026: Die macOS-Dateiauswahl erhält nun ebenfalls direkt die
jeweilige aktuelle Typ-Allowlist (im RC30 TXT/Markdown/CSV/DOCX). Die nachgelagerte Prüfung von
Erweiterung, regulärer Datei, Symlink und Größe bleibt als unabhängige Fail-closed-
Grenze bestehen; die Filterung ist nur eine Ablauferleichterung.

Ergänzung 23.08.2026: Das rein informative Abschlussfenster ist jetzt auch über
native macOS- und Linux-Dialoge verfügbar; sein Ausfall bleibt ohne Einfluss auf
bereits sicher freigegebene Pakete.

#### BL-012.6 – Anwenderstatus und nächste sichere Aktion vereinheitlichen

Status: **in Arbeit** · Epic: BL-012 · Abhängigkeit: BL-011.7

Jede Batchphase hat eine kurze, verständliche Statusmeldung und genau eine sichere
Folgeaktion. Weder Dokumentname noch Pfad oder Inhalt erscheinen darin. Der Anwender
sieht insbesondere klar den Unterschied zwischen „wird verarbeitet“, „Fortsetzen",
„lokale Prüfung erforderlich“ und „abgeschlossen“.

Fortschritt 23.08.2026: Der Gateway-Fortschritt liefert nun die inhaltsfreien Felder
`user_status` und `next_action`; der Skill gibt sie wieder und folgt ihnen. Ein Test
prüft alle sechs Zustände einschließlich der Leckagefreiheit. Rest: native Anzeige
derselben Zustände während der Verarbeitung auf allen Zielplattformen.

#### BL-012.7 – Start- und Ergebnisweg auf eine kurze Anwenderreise reduzieren

Status: **in Arbeit** · Epic: BL-012 · Abhängigkeit: BL-012.6

Der lokale Einstieg zeigt nur Dateiauswahl/`Input`, Anzahl, 100-Dateien-/500-MB-Grenze,
unterstützte Formate sowie Start. Das Ende bietet eine lokale Übersicht mit Erfolg,
Sicherheitsstopp, Fortsetzung und dem dauerhaften Mapping-Export. Bildpixel bleiben
standardmäßig lokal; „lokal entfernen“ ist eine seltene, klar beschriebene Option.

Abnahme: Ein neuer Anwender kann einen gemischten Stapel ohne Profilwahl starten,
einen Abbruch fortsetzen und die lokale Zuordnung öffnen, ohne interne Toolnamen,
Paket-IDs oder Datenschutzprofile kennen zu müssen.

Teilfortschritt 23.08.2026: Die Abschlussaktion `open_local_overview` verweist nun
auf ein eigenes, nur auf Wunsch aufgerufenes MCP-Werkzeug `open_export_folder`. Es
öffnet den lokalen `DataSecure-Export` mit `DataSecure-Mapping.csv`; weder Pfad noch
Dateinamen oder Mappingdaten gehen an Claude. Rest: vereinfachter nativer Startdialog,
sichtbare Fortsetzungsaktion und Abschlussansicht in einer konsistenten Oberfläche.

Ergänzung 23.08.2026: Die native Auswahl auf Windows, macOS und Linux benennt jetzt
im sichtbaren Titel den lokalen Ablauf sowie die Grenzen von 100 Dateien und 500 MB;
der bestehende Dateifilter zeigt nur die aktuelle Allowlist. Der Dialog bleibt
pfadbasiert und erhält keinen Dokumentinhalt.

Umsetzung 23.08.2026: Nach der nativen Mehrfachauswahl zeigt der Companion vor jeder
privaten Arbeitskopie eine lokale Stapelbestätigung. Sie enthält ausschließlich
Anzahl, Gesamtgröße, die vier freigegebenen Formate und den Bildstandard sowie
„Starten“/„Abbrechen“. Ein Abbruch erzeugt keinen Job und keine Arbeitskopie. Die
Windows-, macOS- und Linux-Varianten sowie die Leckagegrenze sind automatisiert
getestet. Rest: denselben kompakten Einstieg in den servergebundenen Input-Ordnerpfad
und eine sichtbare Fortsetzungsansicht übernehmen.

Ergänzung 23.08.2026: Auch der servergebundene `Input`-Ordner zeigt dieselbe lokale
Startbestätigung vor Snapshot und Arbeitskopie. Die Anzeige erhält ausschließlich
Anzahl und Gesamtgröße; „Abbrechen“ erzeugt weder Batchjournal noch Arbeitskopie
und öffnet keinen Ersatzdialog.

Review-Präzisierung 23.08.2026: Vor dem zweifach bestätigten Verwerfen nennt der
lokale Ablauf künftig die Anzahl betroffener offener Stapel und erklärt, dass nur
Arbeitskopien und Checkpoints entfallen, während freigegebene Outputs und das
dauerhafte Mapping erhalten bleiben. Abbrechen ändert nichts. Der Startdialog muss
auf allen drei Plattformen semantisch dieselben tatsächlichen Angaben und Aktionen
zeigen; generische Formattexte oder `Ja/Nein`, während die Dokumentation
`Starten/Abbrechen` zusagt, gelten als offener UX-Defekt. Dateinamen, Pfade, Inhalte
und Mappingwerte bleiben auch aus diesen Anzeigen ausgeschlossen.

Präzisierung 23.08.2026: Die Pilot-Abnahme trennt nun ausdrücklich die positiven
RC30-Pfade (TXT, Markdown, CSV und vollständig abgedecktes DOCX) von den sicheren
Stopps (XLSX, PPTX, eigenständige Bilddateien und PDF). Sie nennt alle fünf lokalen
Arbeitsbereiche einschließlich `DataSecure-Export` und erklärt, dass eine Änderung
im `Input`-Ordner einen bereits versiegelten Batch nicht verändert, aber die
veränderte Arbeitskopie nicht weiterverarbeitet wird. `test-capability-contract`
sichert diese Anwenderaussagen gegen erneuten Dokumentationsdrift ab.

#### BL-052.4 – Beobachtete Gebrauchstauglichkeitsabnahme durchführen

Status: **offen** · Epic: BL-052 · Abhängigkeit: BL-012.7, BL-051.1

Mindestens fünf Anwender bearbeiten mit ausschließlich synthetischen Dokumenten drei
Aufgaben: gemischten Stapel verarbeiten, unterbrochenen Stapel fortsetzen und einen
Format-/Bildstopp richtig einordnen. Fehler, Nachfragen und Zeit bis zum Ergebnis
werden als produktnahe UX-Mängel in BL-012 zurückgeführt.

Cowork-Ergänzung 23.08.2026: Die beobachtete Abnahme beginnt in einer frisch
installierten neuen Cowork-Desktop-Sitzung und prüft natürlichen sowie direkten
Skillstart. Anwender müssen ohne Entwicklerhilfe erkennen, ob der lokale Connector
verbunden ist, zwischen „technisch fortsetzen“, „lokal fachlich prüfen“, „sicher
gestoppt“ und „jetzt nichts tun“ unterscheiden, die Auswirkung eines quantifizierten
Verwerfens erklären und bei Teilerfolg wissen, dass Claude ausschließlich die
freigegebenen Markdown-Fassungen verwendet. Fünf erfolgreiche Codepfade ohne
beobachtete Host-/UX-Abnahme sind kein Cowork-Releasebeleg.

Ergänzung 23.08.2026: Die gemeinsame Ordneröffnung für Input, Output und lokale
Sichtprüfung startet nun auf Windows, macOS und Linux ohne Shell und mit derselben
bereinigten Prozessumgebung wie die übrigen nativen Dialoge. Der Helfer bekommt nur
einen lokalen Ordnerpfad, niemals Dokumentinhalt oder Modell-/Cloud-Zugangsdaten.

Ergänzung 23.08.2026: macOS besitzt für die konkrete Mehrdeutigkeit eines
Zertifikatsausstellers einen lokalen JXA-Entscheidungsweg; Linux nutzt Zenity oder
KDialog. Alle festen, shell-freien Prozesse erhalten Fundstellenkontext ausschließlich
über `stdin` beziehungsweise bei KDialog über `/dev/stdin`, zeigen begrenzten Kontext
und geben nur Beibehalten/Anonymisieren oder Abbruch zurück. Die Companion-
Integration, das Nichtauftauchen des Rohtexts in Argumenten und das bereinigte
Environment sind getestet. Im Batchmodus werden sie über denselben gemeinsamen
Reviewer-Aufruf erreicht und als Stapelprüfung gekennzeichnet; freie
Bereichsredaktionen bleiben dort gesperrt. Die reale macOS-/Linux-Abnahme sowie
die native Ein-Fenster-Parität stehen noch aus.

#### BL-012.3 – „Später entscheiden“ fortsetzbar machen

Status: **in Arbeit** · Epic: BL-012, BL-032 · Abhängigkeiten: BL-011.4, BL-012.2

Der Hinweis nennt die Nichtfreigabe; der spätere Lauf öffnet direkt die offenen
Entscheidungen.

Fortschritt 23.08.2026: Eine lokale Entscheidung kann jetzt als `deferred_review`
ohne Ergebnis, Mapping-Eintrag oder Rohtext-Journal vertagt werden. Klare restliche
Dateien laufen weiter; der Batch meldet ausschließlich den inhaltsfreien Zähler
`deferred_review` und die Phase `awaiting_local_review`. Ein ausdrücklicher Auftrag
für `review_deferred_document_batch` rekonstruiert die vertagten Entwürfe aus den
versiegelten Arbeitskopien und übergibt sie gemeinsam an den lokalen Reviewer.
`resume_document_batch` ist für diese Positionen absichtlich wirkungslos und bleibt
technischen Retry-Fällen vorbehalten. Abbruch und „Später entscheiden“ lassen alle
offenen Positionen vertagt, ohne Ergebnis, Mapping-Eintrag oder Rohtext-Journal.
Rest: tatsächliche native Ein-Fenster-Parität und praktische Drei-OS-Abnahme.

#### BL-012.4 – Freiwillige Gesamtvorschau anbieten

Status: **erledigt** · Epic: BL-012 · Abhängigkeit: BL-012.2

Eindeutig geprüfte Dateien benötigen keine Pflichtlektüre; die lokale Vorschau ist
optional und besitzt keine Umgehungsfunktion.

Umsetzung 23.08.2026: Die dauerhafte lokale Zuordnung liegt nach einem Abschluss in
`DataSecure-Export/DataSecure-Mapping.csv`. Das MCP-Werkzeug
`open_export_folder` öffnet diesen Ordner ausschließlich auf ausdrücklichen Wunsch;
es überträgt weder Mapping, Originalnamen noch Pfade an Claude und beeinflusst keine
Freigabeentscheidung.

#### BL-012.5 – Barrierefreiheit auf drei Plattformen abnehmen

Status: **in Arbeit** · Epic: BL-012 · Abhängigkeiten: BL-012.2, BL-010.2 bis BL-010.4

Tastatur, Screenreader, Skalierung, Fokusfolge und verständliche Meldungen werden
praktisch nachgewiesen.

Teilfortschritt 23.08.2026: Eine automatisierte Vertragsprüfung sichert, dass die
Startbestätigung, Dateiauswahl und Abschlussansicht auf Windows Standarddialoge mit
Tastaturbedienung verwenden und macOS/Linux die jeweiligen Systemdialoge ohne Shell
aufrufen. Die praktische Screenreader-, Skalierungs- und Fokusabnahme auf realen
Zielgeräten bleibt offen.

#### BL-031.1 – Fundstellen gruppiert im Stapel entscheiden

Status: **in Arbeit** · Epic: BL-031 · Abhängigkeit: BL-012.2

Einzelentscheidung bleibt Standard; eine bewusste Gruppenaktion gilt nur für
nachgewiesen gleichartige Fundstellen desselben Stapels.

Teilfortschritt 23.08.2026: Der gemeinsame lokale Review gruppiert ausschließlich
mehrfach vorkommende, nach NFC-/Whitespace-Normalisierung identische vollständige
Kontextzeilen desselben Fundstellentyps. Die Gruppenmetadaten enthalten nur opake
Fundstellen-IDs, nicht den Kontextwert. Windows, macOS und Linux bieten dafür eine
eigene bewusste „gleiche Stellen“-Aktion; die normale Beibehalten-/Anonymisieren-
Entscheidung bleibt einzeln. Die UI erweitert die Entscheidung wieder zu einzelnen,
vollständigen Fundstellenentscheidungen, bevor die normale Paketprüfung fortfährt.
Entwurf, Gruppierung und Entscheidung werden weder journalisiert noch an Claude
übertragen. Rest: praktische Zielplattformabnahme und fachliche Erweiterung nur mit
einem stärkeren Gleichartigkeitsnachweis.

#### BL-032.1 – Plattformgleichen Mehrdeutigkeitsdialog liefern

Status: **in Arbeit** · Epic: BL-032 · Abhängigkeiten: BL-012.2, BL-010.2 bis BL-010.4

Behalten, anonymisieren, zurück/ändern und später entscheiden verhalten sich auf
Windows, macOS und Linux identisch.

Teilfortschritt 23.08.2026: Windows Forms, macOS JXA und Linux Zenity/KDialog
führen nun dieselben entscheidungsrelevanten Aktionen: Beibehalten,
Anonymisieren, Abbrechen, im fortsetzbaren Batch „Später entscheiden“ sowie vor
der Freigabe „Zurück / ändern“. macOS und Linux verwerfen bei „Ändern“ die rein
flüchtige Entscheidung und durchlaufen die Fundstellen erneut; sie persistieren
dabei weder Entwurf noch Auswahl. Stdin-only, shell-freie Aufrufe und die
Linux-Änderungsrunde sind automatisiert getestet. Rest: tatsächliche native
Ein-Fenster-Parität, Tastatur/Screenreader/Skalierung und praktische
Zielplattformabnahmen.

Review-Korrektur 23.08.2026: Der aktuelle macOS-AppleScript-Pfad ist trotz der
vorstehenden Implementierungsbasis nicht funktionsfähig belegt. Er setzt bei
vertagbaren Review- und Finaldialogen einen `cancelButton`, der nicht in der
jeweiligen Buttonliste enthalten ist; Standard Additions bricht dadurch ab. macOS
bleibt bis `BL-012.8` ohne Review-/Pilotfreigabe. Diese Korrektur ersetzt jede frühere
Lesart, wonach allein die vorhandene JXA-/AppleScript-Erzeugung Plattformparität
belege.

#### BL-012.8 – Darwin-Reviewdialog aus einem validierten Aktionsvertrag erzeugen

Status: **in Arbeit** · Priorität: **P0** · Epic: BL-012, BL-032 · Abhängigkeiten: BL-012.2, BL-032.1

Ein gemeinsamer Builder erzeugt Buttonliste, Defaultaktion und Abbruchsemantik für
Einzelfundstelle, Gruppierung und Finalfreigabe. Er validiert vor der
AppleScript-Erzeugung, dass jede referenzierte Default-/Cancel-Aktion tatsächlich
angeboten wird. Bei erlaubter Vertagung werden Schließen und Escape sicher als
`deferred` behandelt; ohne Vertagung bleiben sie ein nicht freigebender Abbruch.
„Beibehalten“, „Anonymisieren“, „Zurück / ändern“, „Später entscheiden“ und
„Geprüft freigeben“ behalten die bestehenden fachlichen Bedeutungen. Ein zweiter
inkonsistenter „Weitere Optionen“-Pfad entfällt.

Abnahme: statische Invariante für jede Dialogkonfiguration; Unitfälle mit/ohne
Vertagung, Gruppe und Finale; echter `osascript`-Nachweis auf macOS für Beibehalten,
Anonymisieren, Vertagen, Schließen, Zurück und Freigeben; End-to-End-Batch mit zwei
vertagten Dokumenten und atomarer Folgeveröffentlichung. Erst diese Fresh-Install-
Evidenz erlaubt eine macOS-Pilotbehauptung.

Teilfortschritt 23.08.2026: Ein unveränderlicher Darwin-Dialogvertrag erzeugt jetzt
für Fundstelle, Gruppenwahl und Finale jeweils höchstens drei angebotene Buttons und
validiert, dass Default- und Cancel-Button tatsächlich enthalten sind. Escape/
Schließen wird bei erlaubter Vertagung nur als `deferred`, sonst als `cancelled`
behandelt. Der fehlerhafte „Weitere Optionen“-Pfad entfällt; Gruppenaktionen werden
nach der Einzelentscheidung separat und bewusst angeboten. 38 Companion-, sechs
Batchreview- und neun UI-Policy-Tests sind grün. Offen bleiben echter `osascript`-
Nachweis und Fresh-Install-E2E auf macOS x64/ARM64.

#### BL-032.2 – Lokalen Passwortweg implementieren

Status: **offen** · Epic: BL-032

Passwörter bleiben im RAM, erscheinen in keinem Log und werden nach Neustart lokal
erneut abgefragt.

#### BL-041.1 – Beide Skillstarts auf denselben Jobvertrag führen

Status: **in Arbeit** · Epic: BL-041 · Abhängigkeit: BL-011.4

Natürliche Sprache und direkte Skillauswahl starten identische lokale Auswahl,
Fortsetzung und Fehlerbehandlung.

Fortschritt 23.08.2026: Die vier MCP-Prompts und der einzige sichtbare
Anonymisierungsskill verwenden denselben serverseitigen Stapelvertrag. Sie prüfen
zuerst `privacy_status`, warten bei `batch_processing_active=true` ohne Ersatzdialog
oder neuen Batch und fragen sonst bei einem offenen Stapel ausdrücklich nach
Fortsetzung. Sie verwenden dann ausschließlich `continue_most_recent_document_batch`;
andernfalls beginnen sie über den bestätigten Input-Ordner. Der Vertrag ist mit
Manifest-, Skillkorpus- und MCP-Tests gegen Drift geschützt. Der Skillkorpus enthält
einen eigenen Aktiv-Status-Fall, der einen zweiten Dialog oder Ersatzstapel verbietet.
„Nur Markdown“ verwendet
den bildpixelfreien Standardpfad statt den strengen lokalen Bild-Verwerfmodus; dadurch
bleibt sicher erkannter Bildtext nutzbar und unbekannte Office-Grafikobjekte lösen
keinen unnötigen Stopp aus. Rest: die beobachtete manuelle Abnahme beider Starts auf
frisch installierten Claude-Zieloberflächen.

Review-Korrektur 23.08.2026: Der zunächst erkannte Entscheidungsdrift zwischen Skill
und direkten MCP-Prompts ist im Quellstand behoben. `BL-041.4` hält die Parität als
eigenes Gate offen, bis zusätzlich die vollständige Nutzerentscheidung auf einer
frisch installierten Claude-Oberfläche beobachtet wurde.

Ergänzung 23.08.2026: Ein geschlossener lokaler Dateidialog wird entlang der
authentisierten Companion-IPC als fester Code `LOCAL_SELECTION_CANCELLED` erhalten.
Der Manager liefert danach den inhaltsfreien terminalen Zustand
`local_selection_cancelled`, schließt den Companion und öffnet weder einen zweiten
Dialog noch einen Ersatzstapel. IPC- und Supervisor-Tests belegen den Einmalaufruf.

Präzisierung 23.08.2026: Der gleiche Code gilt nun auch für die regulären
nicht-null-Abbrüche ohne Ausgabepfad von macOS-AppleScript und Linux-Zenity/KDialog.
Ein benutzerseitig geschlossenes Fenster wird damit auf allen drei Plattformen
einheitlich terminal, ohne Wiederholungsdialog oder Ersatzstapel behandelt.

#### BL-041.2 – Ursprüngliche Claude-Aufgabe automatisch fortsetzen

Status: **in Arbeit** · Epic: BL-041 · Abhängigkeiten: BL-040.1 bis BL-040.3, BL-041.1

Claude verwendet ausschließlich freigegebenes Markdown und verarbeitet Teil- sowie
Gesamterfolg entsprechend der Ausgangsaufgabe.

Teilfortschritt 23.08.2026: Der Skill schreibt die Fortsetzung ausschließlich nach
`read_anonymized_document` mit der aktuellen paketgebundenen Leseberechtigung vor.
Der Skillkorpus enthält jetzt einen Teilerfolgsfall für eine Vertragsanalyse: exakte
Zähler nennen, ausschließlich aktuelle freigegebene Pakete vergleichen, die
ursprüngliche Fristenaufgabe fortsetzen und weder das gestoppte Dokument wiederholen
noch das Original nachfordern. Rest: beobachtete Modellabnahme auf frischer
Zieloberfläche.

#### BL-041.3 – Bereits hochgeladene Originale sicher behandeln

Status: **in Arbeit** · Epic: BL-041

Ein Chat-Anhang erzeugt eine klare Offenlegungswarnung und keinen irreführenden
„sicheren“ DataSecure-Lauf; Regression und Modellabnahme sind verpflichtend.

Fortschritt 23.08.2026: Der operative Skill stoppt beim sichtbaren Original vor
jeder Werkzeugnutzung, erklärt die bereits erfolgte Offenlegung und verweist auf eine
neue Unterhaltung ohne Anhang. Der versionierte Skillkorpus deckt zusätzlich ab,
dass eine geschlossene lokale Auswahl weder automatisch erneut geöffnet
noch durch einen Ersatzbatch umgangen wird. Rest: die manuelle Modellabnahme auf einer
frisch installierten Claude-Oberfläche.

#### BL-041.4 – Alle Claude-Einstiege aus demselben Entscheidungsvertrag erzeugen

Status: **in Arbeit** · Priorität: **P0** · Epic: BL-041 · Abhängigkeiten: BL-011.4, BL-012.3, BL-041.1

Natürlicher Start, direkte Skillauswahl und die vier MCP-Prompts verwenden bei
offenen Stapeln dieselben drei Möglichkeiten: zuletzt offenen Stapel fortsetzen,
alle offenen Stapel nach quantifizierter Doppelbestätigung verwerfen oder jetzt
nichts tun. `batch_processing_active` öffnet nichts. `awaiting_local_review` führt
ausschließlich zur lokalen fachlichen Prüfung und niemals zum technischen Resume.
Ein sichtbarer Chat-Anhang bleibt bei jedem Einstieg ein harter Stopp.

Abnahme: eine kanonische Ablaufdefinition beziehungsweise ein strikter
Contract-Test verhindert abweichende Skill-/Prompt-/Manifesttexte; alle fünf
Einstiege durchlaufen dieselben Zustands- und Folgeaktionstests. Ablehnen oder
Abbrechen verändert nichts. Zusätzlich Modell-Eval und beobachtete Fresh-Install-
Abnahme für natürliche und direkte Variante; ein gemeinsamer Serveraufruf allein
gilt nicht als UX-Parität.

Teilfortschritt 23.08.2026: `prompt-contract.js` enthält jetzt einen unveränderlichen
kanonischen Drei-Wege-Vertrag für offene Stapel. Alle vier MCP-Prompts und das
MCPB-Manifest bieten Fortsetzen nur nach Zustimmung, Verwerfen nur nach benannter
Anzahl und zweiter ausdrücklicher Bestätigung sowie einen folgenlosen Abbruch an.
`awaiting_local_review` wird ausdrücklich zu `review_deferred_document_batch` und
nie zu einem erneuten Resume geroutet; ein neuer Input-Ordner ist nur bei
`recoverable_batches=0` zulässig. Manifest-, MCP-, Capability- und Skillkorpus-Tests
sind grün. Offen bleiben Modell-Eval und beobachtete Fresh-Install-Abnahme aller
Einstiege in Cowork.

#### BL-041.5 – Lokalen Batchabschluss und gestufte Inhaltsübergabe liefern

Status: **in Arbeit** · Priorität: **P0** · Epic: BL-011, BL-041 · Entscheidungen: DS-039 ·
Abhängigkeiten: BL-011.4 bis BL-011.9, BL-040.1 bis BL-040.3, BL-041.2

Ein persistenter lokaler Executor verarbeitet den bestätigten Stapel sequenziell und
fortsetzbar bis zu einem lokalen Ergebnis, ohne pro Datei einen vollständigen
Claude-Lese-/Bestätigungszyklus als Verarbeitungsfortschritt zu benötigen. MCP liefert
inhaltsfreien Status und eine paginierte, namenfreie Ergebnisliste; alle Pakete,
Mappings und Nachweise bleiben vollständig lokal verfügbar.

Für die Ausgangsaufgabe liest Claude standardmäßig nur benötigte freigegebene
Ergebnisse. Ein ausdrücklicher Gesamtauftrag verwendet einen begrenzten,
fortsetzbaren Leseplan und nennt `verwendet`, `noch offen` und `sicher gestoppt`.
Eine Unterbrechung der KI-Auswertung ändert den lokal abgeschlossenen Stapel nicht.
Weder ein Einzelaufruf über alle Dateien noch ein zusammengefügtes Groß-Markdown oder
eine neue lokale KI-Zusammenfassung ist der Normalweg.

Abnahme: 100 synthetische gemischte Dateien an der 500-MB-Grenze, Stopps an Position
1/50/100, Host-/MCP-Neustart, exakt-einmal Mapping/Export und keine Quellidentität über
MCP. Der lokale Stapel endet ohne 100 modellabhängige Voll-Leseaufrufe. Getrennte
Tests messen den maximalen Aufruf-/Zeichenumfang pro Ergebnis, die fortsetzbare
Gesamtauswertung und die niemals stille Auslassung. `BL-051.3` prüft lokale
Aufbereitung und Claude-Weiterverarbeitung als zwei getrennte Gates.

Teilfortschritt 23.08.2026: `start_document_batch_processing` startet einen vom MCP-
Aufruf getrennten lokalen Worker; das opake Batch-Token wird ausschließlich über
private IPC und nicht als Prozessargument übergeben. Der Worker besitzt eine
PID-gebundene Lease, läuft mit Netzwerk-Deny und einer Umgebungs-Allowlist und
verarbeitet klare Positionen sequenziell bis Abschluss, Review oder Recovery. Ein
lokal verifiziertes Paket wird unabhängig von Claude als `released` abgeschlossen;
die private Arbeitskopie wird bereinigt und `analysis_acknowledged` bleibt als
getrennter KI-Lesefortschritt offen.

`document_batch_status` liefert nur inhaltsfreie Zähler.
`list_document_batch_results` liefert über Batch-gebundene, manipulationsgeschützte
Cursor höchstens 20 namenfreie Einträge; Skill und Prompts verwenden Seiten von
höchstens zehn. Leseberechtigungen sind kurzlebig und paketgebunden. Der gemeinsame
lokale Review kann bestätigte Pakete ebenfalls lokal abschließen; der MCP-Normalpfad
gibt keine unbeschränkte Paketliste mehr zurück. Der Skill nennt bei Gesamtaufträgen
`used`, `still_open` und `safely_stopped` und trennt selektives Lesen vom lokalen
Abschluss.

Nachweise im Quellstand: echter abgekoppelter Worker-Lauf für TXT, Drei-Datei-
Seitentest, Batch-gebundene Cursor-/Manipulationsgegenprobe, lokaler Sammelreview und
ein 100-Dateien-Lauf mit sicheren Stopps an Position 1/50/100 sowie zehn Ergebnisseiten
für 97 Freigaben. Ein zusätzlicher echter 100-Positionen-Mischstapel beendet den
separaten Worker hart an den globalen Positionen 1, 50 und 100, übernimmt jede
unterbrochene Position erst nach Recovery und ausdrücklichem Resume und endet mit
drei eindeutigen Freigaben sowie 97 terminalen Formatstopps ohne Doppelpaket. Offen
bleiben die vollständige 500-MB-Nutztextverarbeitung, Host-/Rechnerneustart,
macOS/Linux-Fresh-Install und
beobachtete Cowork-Gesamtauswertung; die Story ist deshalb noch nicht abgeschlossen.

Ein echter MCP-Prozesswechsel beweist zusätzlich, dass alte prozesslokale
Leseberechtigungen widerrufen sind, der Batch-gebundene Cursor aber im neuen Prozess
ohne Quellidentität fortgesetzt und mit frischen Berechtigungen gelesen werden kann.
Der Paketlesetest setzt ein langes Markdown in 7.000-Zeichen-Seiten lücken- und
überlappungsfrei bis `has_more=false` zusammen und prüft die festen 1.000-/30.000-
Zeichen-Unter-/Obergrenzen. Damit sind MCP-Neustart und Zeichenbudget im lokalen
Quellstand abgedeckt; echter Host-/Rechnerneustart bleibt getrennt offen.

Die lokale Maximal-Snapshot-Abnahme `test:batch-500mb-local` bindet 100 echte
synthetische TXT-/Markdown-/CSV-Dateien mit zusammen exakt 524.288.000 Bytes, prüft
alle privaten Kopien und Hashes, verwirft den Checkpoint wieder und erhält alle
Originale. Der Lauf vom 23.08.2026 bestand in 1.732 ms mit 3.403.776 Bytes gemessenem
RSS-Zuwachs. Dafür hasht `sha256File` nun descriptorbasiert in 1-MiB-Blöcken statt
eine erlaubte 500-MB-Datei vollständig in den Node-Heap zu laden. Der Test bleibt
bewusst lokal/manuell und belastet nicht jede GitHub-Actions-Matrix. Offen ist
weiterhin die vollständige Verarbeitung von 500 MB Nutztext, nicht mehr deren
Snapshot-, Kapazitäts- und Speichergrenze.

### Meilenstein 3 – Formate in positiven Coverage-Scheiben

#### BL-020.1 – Gemeinsamen Content-Graph und Locator-Vertrag implementieren

Status: **in Arbeit** · Epic: BL-020 · Abhängigkeit: BL-011.1

Alle Parser liefern dieselbe versionierte Struktur für Text, Tabellen, Bilder,
Metadaten und Quellenpositionen.

Umgesetzte Schnitte: `data-secure-content-graph/v1` ist als striktes Schema und
Runtime-Validator implementiert. Die produktive Parsergrenze liefert jetzt für TXT,
DOCX sowie die noch gesperrten Testparser denselben Graph mit Text-, Tabellen- und
Bildknoten. Halb offene Textpositionen folgen dem W3C-`TextPositionSelector` im
expliziten NFC-/LF-normalisierten UTF-16-Markdown; Bilder sind vollständig und
indexstabil über strukturelle `FragmentSelector` an Assets gebunden. Der Graph
dupliziert keine Rohtexte und akzeptiert weder Pfade noch unbekannte Felder.
DOCX unterscheidet Hauptteil, Kopf-/Fußzeilen, Kommentare, Fuß- und Endnoten;
XLSX unterscheidet Arbeitsblätter, Diagramme und Zeichnungstext; PPTX unterscheidet
Folien, Notizen, Diagramme sowie eindeutig erreichte Layouts und Master jeweils über
den containerinternen OOXML-Part. Die
internen Abschnittstexte verlassen die Parsergrenze nicht zusätzlich. Standard-
und benutzerdefinierte OOXML-Dokumenteigenschaften werden als prüfbarer Markdown-
Inhalt mit eigenen `metadata`-Knoten ausgegeben; damit können Autor, letzter
Bearbeiter, Manager, Unternehmen und freie Eigenschaften nicht still am
Datenschutz-Gate vorbeigehen. Unbekannte oder komplexe benutzerdefinierte
Eigenschaftstypen werden nicht verlustbehaftet abgeflacht, sondern erzeugen eine
Coverage-Warnung und verhindern die Freigabe.
Der Runtime-Validator verlangt darüber hinaus exakt fortlaufende Knoten-IDs,
geordneten und überlappungsfreien Text vor allen Bildknoten sowie vollständige
Abdeckung jedes nicht-leeren Zeichens im freigegebenen Markdown. Ein isoliertes
Parserergebnis kann dadurch keinen unlokalisierten Inhalt zwischen gültigen Knoten
verbergen.

Offen: feinere Absatz-, Zell- und Seitenelement-Locators, bislang nicht extrahierte
Office-Parts, PDF-Seiten, formatabhängige Spezialmetadaten und weitere statische
Anhangsformate sowie positive Coverage-Gegenproben pro später freizugebendem Format.
Dieser Schnitt erweitert die aktuelle Formatfreigabe nicht.

#### BL-020.2 – Rekursive Einbettungen und aktive Inhalte absichern

Status: **in Arbeit** · Epic: BL-020 · Abhängigkeit: BL-020.1

Unterstützte Einbettungen werden begrenzt rekursiv verarbeitet; Makros, Skripte,
Programme und externe Abrufe bleiben inert.

Erste Scheibe: `contracts/EMBEDDED_CONTENT_V1.md` fixiert ein gemeinsames Budget von
3 Einbettungsebenen, 20 Dokumenten, 50 MiB Archiv- und 100 MiB entpackten Bytes.
Eingebettete DOCX/XLSX/PPTX-Pakete aus den OOXML-Embedding-Parts durchlaufen
rekursiv denselben isolierten Parser; ihre vollständige Containerkette bleibt im
Content-Graph-Locator. Beschädigte Pakete, Budgetüberschreitungen sowie VBA, OLE,
ActiveX und externe Beziehungen erzeugen inhaltsfreie Coverage-Warnungen; das
Entpackbudget wird vor der Dekompression erzwungen. Jede unterstützte Einbettung
benötigt eine interne `package`-Beziehung; verwaiste, fehlende oder zugleich aktiv
referenzierte Parts werden nicht anhand ihrer Endung verarbeitet. Offen: weitere
statische Einbettungsformate und vollständige Beziehungs-Coverage sowie
plattformübergreifende Ressourcenabnahme. Die veröffentlichte Formatliste ändert
sich nicht.

Ergänzung 23.08.2026: Mehrere interne `package`-Beziehungen zu demselben
eingebetteten Part gelten ebenfalls als mehrdeutig. Der Parser reduziert sie nicht
still auf eine Kante, sondern hält den gesamten inneren Inhalt zurück und erzeugt
nur eine inhaltsfreie Coverage-Warnung.

Ergänzung 23.08.2026: Eine `package`-Beziehung aus einem verwaisten oder sonst
nicht erreichten OOXML-Part legitimiert keine Einbettung mehr. Nur eine Kante aus
einem formatspezifisch erreichten Inhalts-Part darf in die rekursive Prüfung
führen; auch diese Sperre bleibt inhaltsfrei.

#### BL-020.3 – Netzwerkfreiheit als eigenes Gate nachweisen

Status: **in Arbeit** · Epic: BL-020, BL-010

Parser, OCR, Review und Exporte bestehen OS-spezifische Negativtests ohne DNS,
Internet, RFC1918 oder Loopback-Ausweichpfad.

Umgesetzte Scheiben: `contracts/NETWORK_BOUNDARY_V1.md` fixiert die Netzwerkgrenze und
`network-deny.cjs` wird vor Parser und Companion geladen. Drei Tests versuchen
HTTP(S), TCP/TLS, DNS, UDP, HTTP/2, Fetch, WebSocket und lokale Listener real und
belegen auf dem lokalen Windows-x64-System die inhaltsfreie Sperre. Dieselben Tests
sind Bestandteil der manuell gestarteten Windows-/macOS-/Linux-Abnahmematrix. Alle nativen
UI-Helfer besitzen nun eine feste Datenklassifikation, ein allowlist-bereinigtes
Environment, `shell: false` und Negativtests gegen Netzwerkprimitive. Dateiauswahl,
Zählbestätigung und Abschlussansicht erhalten keine Rohinhalte; Export bleibt im
geschützten Companion. Windows- und macOS-Zertifikatsreview erhalten Rohtext
ausschließlich per `stdin`; Linux verwendet Zenity-`stdin` oder KDialog-`/dev/stdin`.
Alle bleiben explizit `os_network_sandbox_verified: false`. Offen: frische
CI-Nachweise für macOS x64/ARM64 und Linux x64 sowie ein echtes OS-Netzwerkgate für diese Reviewprozesse
(Windows-AppContainer-Pilot, danach gleichwertige Zielplattformwege).
Bis dahin erweitert dieser Nachweis keine Freigabe.

#### BL-021.1 – TXT und Markdown vollständig freigeben

Status: **in Arbeit** · Epic: BL-021 · Abhängigkeit: BL-020.1

Encoding, Unicode, Struktur, große Dokumente und Injection-Fälle besitzen positive
Coverage; erst dann wird Markdown ins Ist-Manifest aufgenommen.

Erste Scheibe: `contracts/TEXT_SOURCE_V1.md` fixiert wohlgeformtes UTF-8,
optionale BOM, NFC-/LF-Normalisierung, verbotene unsichtbare Steuerzeichen,
quelltreues inertes Markdown und vollständige Content-Graph-Abdeckung. Der Parser
verwendet Nodes eingebauten fatalen `TextDecoder`, statt fehlerhafte Bytes durch
Ersatzzeichen zu verschleiern. Acht Tests belegen CommonMark-/GFM-artige Struktur,
Raw HTML, Frontmatter, lokale und entfernte Links/Bilder ohne Ausführung, PII in
Markup, große Eingaben und Determinismus. `markdown-it` wurde als gepflegte
MIT-Referenz geprüft, aber nicht eingebettet, weil Rendering/Tokenisierung den
quelltreuen Pfad verändert und zusätzliche Runtime-Abhängigkeiten erzeugt. Ein
Gateway-End-to-End-Test belegt `.md` durch dieselbe isolierte UTF-8-/Content-Graph- /
PII-/Residual-Gate-Strecke wie TXT; Personendaten werden ersetzt und externe
Referenzen werden ohne Abruf als Text geprüft. Die aktuelle Allowlist umfasst daher TXT,
Markdown (`.md` und `.markdown`), CSV und DOCX. Alle weiteren Formate erzeugen
weiterhin weder Claim noch Output-Paket oder lokale Reviewkopie. Offen: frische
praktische Drei-OS-Abnahme.

#### BL-021.2 – CSV vollständig freigeben

Status: **in Arbeit** · Epic: BL-021 · Abhängigkeit: BL-020.1

Dialekte, Trennzeichen, Quotes, Encodings, große Tabellen und Formula-Injection sind
abgedeckt.

Erste Scheibe: `contracts/CSV_SOURCE_V1.md` und ein lokaler endlicher Parser
verarbeiten RFC-4180-Quotes, doppelte Anführungszeichen und Mehrzeilenfelder. Komma,
Semikolon und Tab werden nur bei konsistenten Zeilen erkannt; Mehrdeutigkeit,
Quote-Defekte, ungleiche Spaltenbreiten und leere Tabellen stoppen. CSV wird als
Markdown-Tabelle veröffentlicht, nie als CSV/XLSX; formelähnliche Werte bleiben
literal. Neun Tests prüfen diese Fälle, UTF-8, Graph-Abdeckung, große Tabellen und
PII in Kopfzeilen-/Datentabellen. Dabei wurde die Personenerkennung für echte
Markdown-Kopfzeilen ergänzt. Gateway-, Companion-, Paket- und Skill-Verträge
sind für `.csv` aktualisiert und getestet.

Ergänzung 23.08.2026: Papa Parse 5.5.3 (MIT, feste `package-lock.json`-Integrität)
ist nun ausschließlich als Entwicklungsorakel eingebunden, nicht als Runtime- oder
Pluginabhängigkeit. `test-csv-differential.js` vergleicht 180 eindeutige RFC-4180-
Fälle über Komma, Semikolon, Tab, LF/CRLF, Unicode, Quotes und Mehrzeilenfelder mit
dem lokalen endlichen Parser. Mehrdeutige Trennzeichen bleiben bewusst außerhalb
dieser Vergleichsmenge und werden weiterhin fail-closed abgewiesen. Rest: praktische
Drei-OS-Abnahme.

#### BL-022.1 – DOCX-Vollcoverage abschließen

Status: **in Arbeit** · Epic: BL-022 · Abhängigkeiten: BL-020.1, BL-020.2

Alle relevanten Parts, Beziehungen, Kommentare, Kopf-/Fußbereiche, Textfelder und
Einbettungen besitzen positive und negative Coverage.

Fortschritt 23.08.2026: Der strukturtreue Story-Parser verarbeitet Hauptteil,
Kopf-/Fußzeilen, Kommentare, Fuß- und Endnoten einheitlich, einschließlich Tabs
und Umbrüchen. Der Privacy-Gate-Test deckt auch einen tabgetrennten Namen in einer
Kopfzeile ab. `contracts/DOCX_STORY_COVERAGE_V1.md` hält die Allowlist und die
bewussten Sperren fest. Ein sekundärer Story-Part muss nun außerdem über eine
passende interne Beziehung von `word/document.xml` erreichbar sein; verwaiste,
externe oder fehlende Ziele blockieren. Rest: vollständige positive/negative
Relationship-Matrix für alle zulässigen Varianten.

Ergänzung 23.08.2026: Die Negativmatrix deckt jetzt zusätzlich fehlende, externe,
falsche und doppelte Root-`officeDocument`-Beziehungen sowie Parent-Traversal,
externe Story-Ziele und Typ-Ziel-Mismatches ab. Jeder Fall erzeugt nur eine
inhaltsfreie Coverage-Warnung; Partnamen, Zielpfade und Story-Text gelangen nicht
in die Fehlermeldung. Vollcoverage der übrigen zulässigen Varianten bleibt offen.

Ergänzung 23.08.2026: DOCX-Medien werden nur noch über interne Beziehungen des
Typs `image` aus einem Word-Part in den lokalen visuellen Prüfpfad aufgenommen.
Verwaiste, externe oder unter einem anderen Typ referenzierte Grafikteile bleiben
vollständig außerhalb des Assetsatzes und sperren die Freigabe mit einer
inhaltsfreien Coverage-Warnung.

Ergänzung 23.08.2026: Auch doppelte interne Kanten zu derselben sekundären Story
und ein nicht zum Relationship-Typ passender WordprocessingML-Wurzeltyp sperren
den Lauf. Für den Main-Part sind zusätzlich `w:document` und `w:body` verpflichtend;
ein nur passend benannter, aber nicht darstellbarer Main-Part kann daher nicht als
leeres und vermeintlich sicheres Dokument erscheinen. Die Parsermatrix enthält für
alle drei Fälle ausschließlich inhaltsfreie Negativtests.

Ergänzung 23.08.2026: Unvollständig geschlossene Main- oder Neben-Stories gelten
nicht mehr als abgedeckt. Die Beziehung-/Wurzel-Negativmatrix umfasst jetzt jede
zulässige Neben-Story (`header`, `footer`, `comments`, `footnotes`, `endnotes`)
und prüft, dass ihr Inhalt auch bei Fehlern nicht in Warnungen erscheint. Rest:
vollständige praktische Interoperabilitätsabnahme mit realen Word-Generatoren und
die bewusst separat gesperrten, nicht in V1 enthaltenen Story-Typen.

Ergänzung 23.08.2026: Mammoth 1.12.1 ist jetzt als exakt gelocktes,
BSD-2-Clause-lizenziertes Entwicklungsorakel eingebunden. Die Differentialprobe
vergleicht für 24 gültige synthetische DOCX den Token-Erhalt im Hauptteil und in
gewöhnlichen Tabellen mit einer unabhängigen Konvertierung. Die Bibliothek ist
eine reine Dev-Dependency und nicht Teil des Plugin-/MCPB-Runtimepfads. Reale
Word-Generatoren, weitere Stories und die geschlossene Coverage-Prüfung bleiben
ausdrücklich offen.

#### BL-022.2 – XLSX vollständig freigeben

Status: **offen** · Epic: BL-022 · Abhängigkeiten: BL-020.1, BL-020.2

Blätter, Zellen, Formeln, Kommentare, Charts, Beziehungen und Einbettungen werden
vollständig und sicher als Markdown abgebildet.

Vorarbeit 23.08.2026: Der Parser rendert ein XLSX-Arbeitsblatt nur noch, wenn es
vom Workbook über eine interne Relationship des Typs `worksheet` eindeutig erreicht
wird. Verwaiste Blatt-Parts sowie externe oder typfalsche Ziele bleiben vollständig
aus Markdown heraus und erzeugen ausschließlich eine inhaltsfreie Sperrwarnung.
Jede Formelzelle, auch mit gecachtem Ergebnis, erzeugt ebenfalls eine inhaltsfreie
Sperrwarnung statt eine unvollständige Tabellenfreigabe.
XLSX bleibt bis zur vollständigen Formel-, Kommentar-, Chart- und Einbettungscoverage
weiterhin nicht freigegeben.

Ergänzung 23.08.2026: `xl/media/` wird nicht mehr per Dateiname in den lokalen
Prüfpfad aufgenommen. Ein Bild benötigt eine interne `image`-Relationship; ein
zulässiges `../media/...` aus einem Drawing-Part wird dabei normalisiert, ein
externes, verwaistes oder typfalsches Ziel bleibt aus dem Asset-Satz und erzeugt
eine inhaltsfreie Sperrwarnung. Diese Vorarbeit ändert den XLSX-Release-Status nicht.

Ergänzung 23.08.2026: Die OPC-Paketwurzel muss genau eine interne
`officeDocument`-Relationship auf `xl/workbook.xml` führen. Fehlende, externe,
falsche oder doppelte Wurzeln blockieren unabhängig von der Blattprüfung mit einer
inhaltsfreien Warnung. XLSX bleibt weiterhin nicht freigegeben.

Ergänzung 23.08.2026: Drawing-Text benötigt eine interne `drawing`-Relationship
aus einem bereits erreichbaren Arbeitsblatt; Chartdaten benötigen anschließend eine
interne `chart`-Relationship aus diesem Drawing-Part. Verwaiste oder nur per
Dateiname vorhandene Drawing-/Chart-Parts bleiben aus Markdown und Content-Graph
heraus und erzeugen eine inhaltsfreie Sperrwarnung.

Präzisierung 23.08.2026: Eine `image`-Relationship genügt bei XLSX nur, wenn ihr
konkreter Drawing-Quellpart selbst über diese erreichbare Arbeitsblattkette belegt
ist. Das Verzeichnis des Relationship-Parts ist kein Ersatz für die Part-Reachability.

Ergänzung 23.08.2026: XLSX-Kommentare werden als Text übernommen, aber nur über
genau eine interne `comments`-Relationship aus einem erreichbaren Arbeitsblatt.
Verwaiste, mehrdeutige oder beschädigte Kommentar-Parts bleiben außerhalb des
Markdowns und erzeugen eine inhaltsfreie Sperrwarnung. Nicht gerenderte weitere
Inhaltsstrukturen – Tabellen-/Pivot-/Validierungs- und unbekannte
Relationship-Parts – erzeugen ebenfalls inhaltsfreie Coverage-Warnungen. Auch
unvollständige Workbook-, Shared-String- oder Arbeitsblattwurzeln können nicht
mehr als leere, scheinbar vollständige Tabellen durchlaufen. Der Format-Gate
bleibt geschlossen. Leere, standardkonforme selbstschließende XML-Parts bleiben
dabei zulässig.

#### BL-022.3 – PPTX vollständig freigeben

Status: **offen** · Epic: BL-022 · Abhängigkeiten: BL-020.1, BL-020.2

Folien, Master, Notizen, Tabellen, Charts, Textfelder, Beziehungen und Einbettungen
sind abgedeckt.

Vorarbeit 23.08.2026: Der Parser verarbeitet Folientext nur über eine eindeutige
interne `slide`-Relationship aus `presentation.xml`; Notizen nur über eine interne
`notesSlide`-Relationship der jeweiligen Folie. Die Relationship-ID ist beliebig;
mehrere passende Notizbeziehungen bleiben mehrdeutig und werden nicht gerendert.
PPTX bleibt bis zur Master-, Tabellen-, Chart- und vollständigen
Relationship-Coverage nicht freigegeben.

Ergänzung 23.08.2026: `ppt/media/` folgt derselben Bildgrenze: Nur eine interne
`image`-Relationship aus einem Präsentationspart darf ein Bild für die lokale
Sichtprüfung bereitstellen. Der standardkonforme relative Weg `../media/...` wird
innerhalb von `ppt/media/` normalisiert; andere, externe oder verwaiste Ziele
bleiben fail-closed. PPTX bleibt weiterhin nicht freigegeben.

Ergänzung 23.08.2026: Die OPC-Paketwurzel muss genau eine interne
`officeDocument`-Relationship auf `ppt/presentation.xml` enthalten. Fehlende,
externe, falsche oder doppelte Wurzeln sperren unabhängig von Folien- und
Notizbeziehungen. PPTX bleibt weiterhin nicht freigegeben.

Ergänzung 23.08.2026: PPTX-Chartdaten benötigen eine interne `chart`-Relationship
aus einer bereits erreichbaren Folie. Ein verwaister Chart-Part wird nicht mehr in
Markdown oder Content-Graph aufgenommen und erzeugt eine inhaltsfreie Sperrwarnung.

Präzisierung 23.08.2026: Auch bei PPTX muss eine `image`-Relationship aus einer
erreichbaren Folie stammen; ein gleichnamiger Relationship-Ordner oder ein
verwaister Zwischenpart kann kein Asset legitimieren.

Ergänzung 23.08.2026: PPTX-Notizen werden nur über genau eine interne
`notesSlide`-Relationship aus einer erreichbaren Folie aufgenommen. Verwaiste,
mehrdeutige oder abgeschnittene Notiz-Parts bleiben außerhalb des Markdown und
erzeugen eine inhaltsfreie Sperrwarnung.

Ergänzung 23.08.2026: Nicht gerenderte PPTX-Inhaltsstrukturen – einschließlich
Master-, Layout-, Notiz- und unbekannten Relationship-Parts – erzeugen jetzt
inhaltsfreie Coverage-Warnungen. Abgeschnittene Präsentations- oder Folienwurzeln
werden ebenfalls nicht als leere, scheinbar vollständige Präsentation behandelt.
Der Format-Gate bleibt geschlossen.

Ergänzung 23.08.2026: Erreichbare Layout- und Mastertexte werden nun ausschließlich
über die vollständige Kette `slide` → `slideLayout` → `slideMaster` aufgenommen;
der Master muss außerdem genau einmal aus `presentation.xml` referenziert sein. Ein
Layout darf von mehreren Folien und ein Master von mehreren Layouts geteilt werden –
das ist normales PPTX und keine Mehrdeutigkeit. Verwaiste, doppelte oder
abgeschnittene Vorlagen-Parts werden weder gerendert noch mit ihren Werten
protokolliert. PPTX bleibt bis zur vollständigen Tabellen-, Einbettungs- und
Relationship-Coverage nicht freigegeben.

Ergänzung 23.08.2026: Erreichbare DrawingML-Tabellen einer Folie werden als
eigenständige, Markdown-escaped Tabellenknoten gerendert und nicht zusätzlich als
Folienprosa wiederholt. Eine unausgewogene Tabellenstruktur hält den betroffenen
Tabellenrest aus dem Markdown zurück und erzeugt nur einen inhaltsfreien
DrawingML-Tabellenstopp. PPTX bleibt nicht freigegeben.

#### BL-024.1 – Gemeinsamen OCR-Vertrag Deutsch/Englisch definieren

Status: **erledigt** · Epic: BL-024 · Abhängigkeit: BL-023.1

Wortpositionen, Konfidenz, gemischte Sprache, Ressourcenlimits und Fehlercodes sind
plattformneutral versioniert.

Fortschritt: Tesseract.js 7.0.0 liefert Deutsch/Englisch lokal auf allen vier
Zielarchitekturen. Prozess-, Netzwerk-, Heap-, Laufzeit- und Ausgabegrenzen sowie
feste Pilotfehler sind nachgewiesen. `contracts/OCR_RESULT_V1.md` und das strikte
`ocr-result-v1.schema.json` versionieren nun Text, Wort-/Zeilenindex, halb offene
Pixelpositionen, Deutsch/Englisch, Konfidenz- und Fail-closed-Regeln, gemeinsame
Grenzwerte sowie elf inhaltsfreie Fehlercodes. Der Tesseract.js-Adapter fordert
`blocks` ausdrücklich an und normalisiert die echte gemischtsprachige Probe; acht
Positiv-/Negativtests decken leere Ergebnisse, niedrige Konfidenz, fehlende
Positionen, ungültige Boxen und Pixelgrenzen ab. GitHub-Actions-Lauf `32596087930`
bestätigt Vertrag, echte OCR und Negativtests auf Windows x64, macOS x64/ARM64 und
Linux x64. Offen vor Abschluss sind native harte macOS/Linux-RAM-/CPU-Grenzen.

Aktuelle Umsetzung: Ein kleiner POSIX-C-Supervisor setzt pro OCR-Prozess die native
CPU-Grenze, überwacht den physischen Speicher über Linux `/proc` beziehungsweise
macOS `proc_pid_rusage`, beendet die gesamte Prozessgruppe bei RAM-, CPU- oder
Zeitüberschreitung und erzeugt keine Inhaltsausgabe. Der Workflow kompiliert ihn auf
macOS x64/ARM64 und Linux x64 und führt echte RAM-/CPU-Negativproben aus. Dieser
Nachweis ist bis zum erfolgreichen Vier-Plattform-Lauf noch ausstehend.

Negativnachweis: Lauf `32596337378` bestand Linux und Windows, stoppte aber beide
macOS-Ziele bereits beim `-Werror`-Build, weil der strikt gesetzte POSIX-Namensraum
Darwin-Typen aus `libproc.h` ausblendete. Der Quelltext aktiviert deshalb auf macOS
explizit den Darwin-Namensraum; danach wurde vollständig neu geprüft.

Abschlussnachweis: Lauf `32596426359` auf `4c9f0ec` bestand auf Windows x64, macOS
x64/ARM64 und Linux x64. Alle vier Ziele bestanden den OCR-V1-Vertrag, echte lokale
Deutsch-/Englisch-OCR, Netzwerkverbot, RAM-, CPU-, Zeit- und Ausgabegrenzen sowie
die zugehörigen Gegenproben. BL-024.1 ist damit abgeschlossen; dies ist ausdrücklich
noch keine Produktfreigabe oder gebündelte Auslieferung.

#### BL-024.2 – OCR-Backends für Windows, macOS und Linux liefern

Status: **in Arbeit** · Epic: BL-024 · Abhängigkeiten: BL-024.1, BL-010.1

Alle Backends laufen gebündelt, offline und mit demselben Vertrag.

Vorarbeit: Der portable Tesseract.js-WASM-Pilot läuft offline auf Windows x64,
macOS x64/ARM64 und Linux x64. BL-024.1 ist abgeschlossen. Runtime, Modelle und
native Supervisoren sind inzwischen installationsfrei pro Zielarchitektur gebündelt;
die Story bleibt bis zur vollständigen Integration und Abnahme im echten Pluginpfad
offen.

Der geprüfte Universal-V2-Baustein ist nun im kanonischen Pluginbaum eingebettet.
ZIP und Marketplace verwenden damit dieselben Bytes ohne manuelle Runtime-
Installation. Erst frische ZIP- und Marketplace-Installationen dürfen den Pfad nach
den Coverage-Gates freigeben; das eingebettete Manifest bleibt bis dahin gesperrt.

Umsetzung in Prüfung: `build-ocr-runtime.mjs` erzeugt pro Zielarchitektur ein
hashinventarisiertes, weiterhin gesperrtes Bundle aus Tesseract.js, 13 tatsächlichen
Runtime-Komponenten, `deu`/`eng`, OCR-V1, Netzsperre, Drittanbieterhinweisen und dem
nativen Supervisor. Das nur für Testbilder benötigte `@napi-rs/canvas` wird nicht
ausgeliefert. Das Windows-x64-Bundle umfasst 241 inventarisierte Dateien und rund
57,5 MB; Hashprüfung, echter Offline-OCR-Lauf und inhaltsfreier Negativfall bestehen
lokal. Lauf `32597030060` auf `7427b3c` belegt Build, statische Prüfung und echten
Offline-OCR-
Smoke-Test derselben Bündel auf Windows x64, macOS x64/ARM64 und Linux x64. Für das
einzige Paket ohne mitgelieferte Lizenzdatei (`tr46@0.0.3`) liegt ein exakt
versionsgebundener, vollständiger MIT-Text mit Herkunftshinweis vor. Offen sind
frische ZIP-/Marketplace-Installationen und die nachfolgenden Coverage-Gates. Der
Produktadapter `portable-ocr.js` ist bereits integriert, prüft
Zielplattform, vollständiges Dateiinventar und SHA-256 jedes Bundle-Bestandteils und
startet nur bei `release_enabled: true`; der aktuelle Pluginbaum enthält das Bundle
bewusst nur mit `release_enabled: false` und behält damit das bisherige Verhalten.

Gefundener Paketierungsdefekt: Der erste Artefaktlauf ließ standardmäßig versteckte
npm-Dateien aus, obwohl sie im Bundle-Manifest inventarisiert waren. Der Universal-
Assembler stoppte deshalb korrekt. Der Workflow lädt Bundle-Verzeichnisse nun mit
`include-hidden-files: true` hoch; Lauf `32597783210` auf `df1c85f` erbringt den
erneuten Download-/Assemblierungsnachweis.

Der neue `assemble-ocr-runtime.mjs` akzeptiert genau die vier vollständig
hashgeprüften V1-Quellbundles und erzeugt den weiterhin gesperrten Universalvertrag
`data-secure-ocr-runtime-bundle/v2`: 239 byteidentische gemeinsame Dateien werden
nur einmal übernommen, die vier nativen Launcher liegen zielgetrennt. Abweichende
gemeinsame Bytes stoppen auch dann, wenn ein einzelnes Quellmanifest passend neu
gehasht wurde. Lauf `32597783210` lädt die vier Artefakte erneut herunter,
assembliert, prüft und führt auf Linux echten Offline-OCR aus. Das erneut lokal
heruntergeladene Universal-Artefakt umfasst 244 inventarisierte Dateien und
57.592.942 Bytes. Die Herkunft ist im Pluginbaum mit Workflow-Lauf, Commit und
Manifest-SHA dauerhaft festgehalten.

Lokaler Paketierungsschnitt: `build-portable-plugin.mjs` kopierte den kanonischen
Pluginbaum und das vollständig geprüfte V2-Bundle zunächst in eine flüchtige
Staging-Struktur. Der erzeugte Engineering-ZIP enthielt 319 Einträge, war rund
22,0 MB groß und blieb mit deaktiviertem OCR-Gate eindeutig nicht freigegeben.
`verify-portable-plugin-zip.mjs` prüft Plugin-Quellparität, jedes Runtime-Byte und die
POSIX-Ausführungsmodi. Der normale Plugin-Build validiert nun die eingebetteten 244
Runtime-Dateien samt Herkunftsnachweis. Der Paketierungs-Checkpoint `75da6c5`
erzeugte aus derselben Marketplace-Quelle 320 Einträge, 22.033.607 Bytes und SHA-256
`6d3883745cfb01f444fecfcfffe77e7515eac0cf84c81e009420a4c07f2b5cf3`.
Der ZIP-Writer schreibt deterministische Unix-Modi. Der vorgesehene Cloud-Folgejob
`32598196806` startete wegen eines GitHub-Abrechnungs-/Ausgabenlimits nicht; der
Cloud-Doppelbuild und die echte `unzip`-Prüfung aller drei POSIX-Launcher bleiben
daher als externer Abnahmenachweis offen.

#### BL-024.3 – PNG, JPEG und BMP freigeben

Status: **offen** · Epic: BL-024 · Abhängigkeiten: BL-020.1, BL-024.2

Metadaten, OCR, Textprüfung und nichttextuelle Bedeutung sind vollständig behandelt;
das Ergebnis bleibt Markdown ohne Bildpixel.

#### BL-023.2 – Textbasierte PDFs freigeben

Status: **offen** · Epic: BL-023 · Abhängigkeiten: BL-020.1, BL-023.1

Fonts, Textpositionen, Seitenreihenfolge und beschädigte Strukturen bestehen den
Coverage-Vertrag.

#### BL-023.3 – PDF-Formulare, Annotationen, Anhänge und Verschlüsselung

Status: **offen** · Epic: BL-023 · Abhängigkeiten: BL-020.2, BL-023.2, BL-032.2

Alle statischen Inhalte und unterstützten Anhänge werden geprüft; Passwörter bleiben
lokal und aktive Inhalte inert.

#### BL-023.4 – Scan-PDF und visuelle Coverage freigeben

Status: **offen** · Epic: BL-023 · Abhängigkeiten: BL-023.2, BL-024.2

Jede Seite wird visuell abgedeckt, OCR-geprüft und bei fachlich nicht textuell
übertragbaren Inhalten in den Abschlussdialog übernommen.

### Meilenstein 4 – Plattformpakete und Supportfähigkeit

#### BL-010.1 – Betriebssystemneutralen Plugin-Startvertrag beweisen

Status: **in Arbeit** · Epic: BL-010

Vor Paketbau wird mit aktueller Claude-Dokumentation und einem Installationsspike
belegt, wie genau ein sichtbares Plugin die passende lokale Komponente startet.

Präzisierung 23.08.2026: Die aktuelle offizielle Claude-Code-Dokumentation trennt
Plugin-MCP-Server, die beim Aktivieren automatisch starten, von manuellen MCP-
Konfigurationen. Sie dokumentiert die Desktop-App nur für Windows und macOS; Linux
ist folglich kein behaupteter Claude-Desktop-Weg, sondern ein separat abzunehmender
lokaler Claude-Code-Host. Öffentliche Manifeste und Handbücher dürfen diese Grenze
nicht verwischen. Rest: frischer Installationsspike mit der konkreten unterstützten
Claude-Version und Nachweis einer installationsfreien Node-Auflösung je Host.
Quelle: [Claude Code Desktop](https://code.claude.com/docs/en/desktop) und
[Plugin-MCP-Server](https://code.claude.com/docs/en/mcp), abgerufen am 23.08.2026.

Review-Befund 23.08.2026: Die aktuelle Plugin-`.mcp.json` startet `node`, während
die Herstellerzusage einer eingebauten Node-Runtime ausdrücklich für MCPB/Desktop
Extensions dokumentiert ist und nicht automatisch für einen Plugin-ZIP gilt. Ein
Entwicklerrechner mit Node im `PATH` ist daher kein Installationsnachweis. Außerdem
widersprechen sich aktuelle Cowork-Dokumente bei lokalen MCP-Servern in Cloud-/
Web-/Mobil-Sitzungen. `privacy_status` in der konkreten Sitzung bleibt deshalb das
einzige positive Produktgate; UI-Name, Plugin-Kachel oder sichtbarer Skill genügen
nicht.

#### BL-010.2 – Windows-Paket liefern

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.1, Meilenstein 2

Frische ZIP-/Marketplace-Installation ohne manuelle Runtime und vollständiger
lokaler Zielablauf sind nachgewiesen.

#### BL-010.3 – macOS-Paket liefern

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.1, Meilenstein 2

Frische ZIP-/Marketplace-Installation ohne manuelle Runtime und vollständiger
lokaler Zielablauf sind nachgewiesen.

#### BL-010.4 – Linux-Paket liefern

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.1, Meilenstein 2

Frische ZIP-/Marketplace-Installation ohne manuelle Runtime und vollständiger
lokaler Zielablauf sind nachgewiesen.

#### BL-010.5 – ZIP-/Marketplace-Gleichheit belegen

Status: **offen** · Epic: BL-010 · Abhängigkeiten: BL-010.2 bis BL-010.4

Beide Vertriebswege liefern pro Plattform identische Fähigkeiten, Regeln und Tests.

Lokaler Paketierungsnachweis 23.08.2026: Die aus dem aktuellen Quellbaum erneut
erzeugten Artefakte (`DataSecure-Privacy-Preflight-v3.2.0-rc30.zip`, 329 Einträge,
`DataSecure-Privacy-Gateway-v3.2.0-rc30.mcpb`, 361 Einträge) bestehen ihre
Byteparitätsprüfungen. Die verbindlichen, bei jedem Build neu erzeugten Hashes
stehen ausschließlich in `dist/SHA256SUMS`; dadurch schreibt das MCPB keine eigene
Prüfsumme in einen mitverpackten Dokumentationsbestandteil. Der ZIP-Inhalt besteht zusätzlich die
150-Fall-Skillmatrix. Das beweist nur die lokale Quell-/Artefaktgleichheit;
Frischinstallation, Marketplace-Auflösung und Plattformparität bleiben ausdrücklich
offen.

#### BL-010.6 – Versionsarchiv und Rückrolle testen

Status: **offen** · Epic: BL-010 · Abhängigkeit: BL-010.5

Eine fehlerhafte Version kann ohne Verlust dauerhafter Exporte durch die letzte
freigegebene Version ersetzt werden.

#### BL-010.7 – Konditionalen Claude-/Cowork-Hostvertrag festschreiben

Status: **in Arbeit** · Priorität: **P0** · Epic: BL-010, BL-041 · Entscheidung: DS-003

Eine maschinen- und menschenlesbare Hostmatrix unterscheidet je Oberfläche
`skill_available`, `local_mcp_available`, erforderliche Desktop-Brücke,
Runtime-Nachweis und Pilotstatus. Lokale Originalverarbeitung beginnt ausschließlich
nach erfolgreichem `privacy_status` in der aktuellen Sitzung. Fehlt der Aufruf, stoppt
DataSecure vor Datei-/Ordnerzugriff ohne Upload-, Computer-Use-, allgemeinen
Filesystem- oder anderen Connector-Workaround.

Abnahme: Cowork Desktop mit offener App und erlaubtem Local MCP als positiver
Pilotkandidat; fehlender/getrennter Connector sowie Web, Mobil, Cloud-/Scheduled-
Session als erwartete Negativklassen. Bereits bereinigtes Markdown bleibt dort
nutzbar. Der versionsgebundene Widerspruch der offiziellen Cowork-/Connector-Doku
wird mit URL und Prüfdatum als externes Risiko geführt, nicht durch eine pauschale
Produktaussage aufgelöst. Nutzertext bei fehlendem Gate nennt nur neue Desktop-
Sitzung beziehungsweise IT-Prüfung und behauptet keine Verbindung.

Teilnachweis 23.08.2026: `HOST_MATRIX_V1.json` und die gleichnamige
menschenlesbare Fassung definieren das aktuelle Gate maschinenlesbar. Skill und alle
direkten MCP-Prompts verwenden denselben kanonischen Host-Gate-Text. Vier negative
Evalfälle decken Web, Mobil, Cloud-/Scheduled und Desktop mit getrenntem Local MCP
ab; `test-host-matrix` verhindert, dass eine sichtbare Oberfläche oder ein
Ersatzwerkzeug den Originalpfad öffnet. Offen bleiben beobachtete Tests in den
echten Hostklassen, Fresh Install sowie die versionsgebundene Hersteller-Revalidierung.

Herstellerquellen, abgerufen am 23.08.2026: [Plugins in Claude/Cowork](https://support.claude.com/en/articles/13837440-use-plugins-in-claude),
[Cowork-Architektur](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview),
[Cowork auf Web/Desktop/Mobil](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
und [Desktop-/Web-Connectoren](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors).

#### BL-010.8 – Installationsfreien Plugin-Runtime-Start beweisen

Status: **offen** · Priorität: **P0** · Epic: BL-010 · Abhängigkeiten: BL-010.1, BL-010.7

Der veröffentlichte ZIP-/Marketplace-Weg startet ohne manuell installiertes Node,
npm, Python oder globale DataSecure-Dateien. Ein frisches Zielkonto/VM besitzt keine
solche Runtime im `PATH`; nach Installation, Refresh und neuer Sitzung muss
`privacy_status` die richtige Paketversion liefern. `command: node` gilt erst nach
diesem echten Nachweis als unterstützt.

Scheitert die Hostauflösung, folgt ein gesonderter Architekturspike: entweder eine
offiziell belegte Plugin-Hostruntime oder ein selbststartender, pro OS/Architektur
hashgebundener Serverlauncher, beispielsweise auf Basis eines Node-SEA-/gebündelten
Runtime-Artefakts. Der Anwender installiert nichts nach, sieht keine drei OS-Plugins
und erhält keinen stillen MCPB-Fallback. MCPB bleibt ein separat durch IT installierter
Fallback mit demselben Skill-/Serververtrag.

Abnahme: zusätzlich ein absichtlich inkompatibles `node` im `PATH`, fehlende Runtime,
Update und Rollback. Ein Entwickler-Node darf den Test nicht unbemerkt grün machen;
bei fehlender installationsfreier Lösung bleibt ZIP/Marketplace NO-GO.

Herstellerquellen, abgerufen am 23.08.2026: [lokale MCP-Server/MCPB-Runtime](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop),
[Pluginstruktur](https://code.claude.com/docs/en/plugins-reference) und
[Organisations-Marketplace](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization).

Revalidierung 23.08.2026: `RUNTIME_START_MATRIX_V1.json` trennt nun drei nicht
gleichzusetzende Pfade. Nur für MCPB/Desktop Extensions sagt die offizielle
Claude-Dokumentation ausdrücklich eine eingebaute Node-Runtime und damit keine
Node-Installation beim Anwender zu. Für Plugin-ZIP/Marketplace in Desktop/Cowork
bleibt der aktuelle `command: node` bis zur Fresh-Install-Beobachtung NO-GO; für
Claude Code ist die Host-/PATH-Auflösung konditional. Die aktuelle Node-SEA-Doku
bestätigt installationsfreie Einzelprogramme, verlangt unter Node 22 aber einen
einzelnen CommonJS-Bundle, versionsidentische Blob-/Binärbasis und zielabhängige
PE-/Mach-O-/ELF-Injektion. Da die dokumentierte Standard-Plugin-MCP-Konfiguration
nur einen `command` und keinen OS-Selektor besitzt, bleibt SEA ein Spike, bis ein
einziges Plugin die Plattformwahl nachweisbar und ohne Anwenderinstallation lösen
kann. Verboten bleiben Nutzer-Node, Runtime-Downloads, stiller MCPB-Wechsel und drei
sichtbare OS-Plugins. `test-runtime-start-matrix.js` pinnt diese Grenze.

#### BL-042.1 – Diagnosepaket lokal exportieren

Status: **erledigt** · Epic: BL-042

Schema, explizite Nutzeraktion, Programmbinär-Prüfsummen und Leckageprüfung sind
abgenommen; es erfolgt kein automatischer Versand.

Nachweis 23.08.2026: `export_diagnostic_package` verlangt `confirmed=true` und
schreibt ausschließlich lokal `DataSecure-Diagnose.json`. Der Export enthält nur die
bereits whitelist-bereinigten Diagnosen, feste Datenschutzwahrheitswerte sowie
Prüfsummen der ausgelieferten Server-/Launcher-Komponenten. Tests belegen, dass
Originalnamen, Pfade, Rohinhalte und Dokumentidentifikatoren ausgeschlossen bleiben.

#### BL-042.2 – MCP-Toolberechtigungen für Cowork vollständig annotieren

Status: **in Arbeit** · Priorität: **P0** · Epic: BL-042 · Abhängigkeit: BL-010.7

Jedes MCP-Tool erhält fachlich korrekte `title`, `readOnlyHint`, `destructiveHint`,
`openWorldHint` und – nur wenn wahr – `idempotentHint`. Status-, Diagnose- und
Paketlesetools sind read-only und nicht destruktiv; Snapshot, Verarbeitung, Export
und Ordneröffnung werden einzeln bewertet. `purge_local_data` und
`discard_incomplete_document_batches` sind ausdrücklich destruktiv. Die eigene
`confirmed=true`-/Doppelbestätigung bleibt unabhängig von Host-Permissions Pflicht.

Abnahme: Strict-Validator und Policy-Test blockieren fehlende oder widersprüchliche
Annotationen. Manual-, Auto- und Skip-Modus werden in echter Cowork-UI geprüft;
Auto darf Lesen parallelisieren, aber keine Löschung als Lesen klassifizieren oder
eine eigene DataSecure-Bestätigung ersetzen. Toolannotation ist eine
Berechtigungshilfe, keine Datenschutzfreigabe.

Teilfortschritt 23.08.2026: Alle 18 Runtime-Tools besitzen nun `title` und die vier
booleschen Annotationen. Ein zentraler Policy-Satz kennzeichnet Status-/Lesewege als
read-only/idempotent, Ordneröffnungen als nicht destruktive UI-Aktion sowie
Verarbeitung, Review, Paketbestätigung, Batchverwerfen und Purge als destruktive
lokale Zustandsänderung. Der MCP-Test blockiert fehlende Felder und prüft die
kritischen Klassen; Manifest und Pluginstruktur bleiben grün. Offen ist die echte
Cowork-Abnahme in Manual-, Auto- und Skip-Modus.

Herstellerquellen, abgerufen am 23.08.2026: [Software-Directory-Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
und [Cowork-Permission-Modi](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork).

### Meilenstein 5 – Qualitäts- und Freigabenachweis

#### BL-050.1 – Corpus-Schema und Metriken festschreiben

Status: **erledigt** · Epic: BL-050

Ground Truth, Null-Miss-Gate für direkte Identifikatoren, mindestens 99 Prozent
markierter Inhaltserhalt und Format-/Sprachverteilung sind maschinenlesbar.

Fortschritt 23.08.2026: Der deterministische Vertragsgenerator erzeugt 1.000
synthetische deutsche und englische TXT-Verträge (750/250) mit explizitem Format-,
Sprach- und Dokumenttyp-Feld, positionsgenauer Ground Truth sowie Erhaltungsmarkern.
Ein zweiter 1.000er-Akzeptanzkorpus verteilt sich auf 500 Verträge, 167
Mitarbeiterprofile, 167 Bewerbungen und 166 Kundenvorgänge. Beide Läufe prüfen null
direkte PII-Misses, null zusätzliche Redaktionen und vollständigen Erhalt der
markierten Fachinhalte; beim Mehrprofilkorpus gehören Zertifikate ausdrücklich zum
Erhaltungs-Ground-Truth.

Abschluss 23.08.2026: `benchmarks/CORPUS_CONTRACT_V1.json` versioniert jetzt
Pflichtfelder, UTF-16-Positionsraum, ausschließlich synthetische Herkunft, zulässige
Profile und aktive Formate sowie die exakten Format-, Sprach-, Dokumenttyp- und
Profilverteilungen beider 1.000er-Korpora. Die Freigabeschwellen sind
maschinenlesbar auf null direkte False Negatives, null unerwartete Redaktionen und
mindestens 99 Prozent Erhalt markierter Fachinhalte festgelegt.
`test-corpus-contract.js` validiert alle 2.000 Samples, verhindert
Verteilungsdrift und wertet das Detektorergebnis direkt gegen diese Gates aus.
Weitere Container und Sprachen werden erst nach ihrem eigenen Coverage-Gate in
denselben Vertrag aufgenommen; das ist Fixture-Ausbau in BL-050.2 und keine offene
Schemaentscheidung mehr.

#### BL-050.2 – Mindestens 1.000 dokumentartige Fixtures liefern

Status: **in Arbeit** · Epic: BL-050 · Abhängigkeit: BL-050.1, Meilenstein 3

Alle Zielformate, Dokumenttypen, Sprachen, Layouts, Einbettungen und Angriffsvarianten
sind vertreten; jeder Defekt bleibt Regression.

Fortschritt 23.08.2026: Neben 1.000 deterministischen, synthetischen Vertragsfällen
mit sechs Layoutvarianten, deutschen und englischen Beschriftungen ist ein weiterer
1.000er-Akzeptanzkorpus für alle vier aktiven Datenschutzprofile in `npm test`
eingebunden. Er enthält positive Erhaltungs-Ground-Truth für Rollen, Fachinhalte und
Zertifikate sowie direkte Identifikatoren für jede Profilklasse. Rest: reale
dokumentartige Varianten der noch gesperrten Zielcontainer und internationale
Sprach-/Layoutabdeckung.

Ergänzung 23.08.2026: Ein deterministischer 2.000-Fall-Sweep variiert je Fall
Personenname, Organisation, Zertifikat, deutsche IBAN, Telefonnummer, Profil und
acht Markdown-Strukturen. Er prüft Entfernung aller direkten Identifier, Erhalt von
Rolle und Zertifikat sowie Idempotenz eines erneuten Laufs und ist in `npm test`
eingebunden.

Ergänzung 23.08.2026: Eine reale Format-Akzeptanzmatrix führt denselben
synthetischen Personalprofilfall durch TXT, Markdown, CSV und DOCX bis zum
freigegebenen Markdown-Paket. Sie verlangt die Entfernung von Person, E-Mail,
Telefon, IBAN und Arbeitgeber sowie den Erhalt von Zertifizierungen und
IT-Fachrollen. CSV-Zertifikatskontext ist dabei zellengenau: Er schützt keinen
Arbeitgeber in derselben Datenzeile. Die Matrix verwendet den normalen Profilmodus
`auto` und verlangt für alle vier Formate die Erkennung als Personalprofil. Seit
23.08.2026 enthielt sie einen deutschen und englischen Fall; sie enthält nun 33
Gateway-Läufe mit deutschen, englischen, französischen, spanischen und
niederländischen Personalprofilbeschriftungen. Eine Negativregression stellt sicher,
dass einzelne Unternehmens-/Rollenlabels kein allgemeines Dokument überklassifizieren.

Ergänzung 23.08.2026: Die reale Matrix deckt jetzt zusätzlich Vertrag, Bewerbung
und Kundenvorgang ab – jeweils als TXT, Markdown, CSV und DOCX und stets mit
automatischer Profilwahl. Der Bewerbungsweg behandelt beschriftete Wohnorte und
Arbeitgeber nun auch in CSV-Spalten wie in Zeilen- und DOCX-Profilen.

Ergänzung 23.08.2026: Die feldbezeichnungsgebundene Regression deckt französische,
spanische und niederländische Personalprofil-Labels für Name, Telefon und Arbeitgeber
nicht nur isoliert, sondern über alle vier aktiven Quellformate ab. Der
Zertifikatskontext ist bei CSV auf die Zertifikatszelle begrenzt, sodass die
Arbeitgeberzelle derselben Zeile nicht geschützt wird. Der französische
Einziffern-Ortscode wird separat und eng erkannt; Fachrolle und Zertifikat bleiben
erhalten. Das ist kein allgemeines Sprachversprechen, sondern dokumentierte Abdeckung
der getesteten eindeutigen Feldformen.

#### BL-051.1 – Frische ZIP-Installation auf drei OS abnehmen

Status: **offen** · Epic: BL-051 · Abhängigkeit: BL-010.5, Meilenstein 3

Installieren, starten, verarbeiten, fortsetzen und exportieren funktionieren ohne
Entwicklerwerkzeuge.

#### BL-051.2 – Marketplace-Installation auf drei OS abnehmen

Status: **offen** · Epic: BL-051 · Abhängigkeit: BL-010.5, Meilenstein 3

Der Organisationsweg besitzt denselben End-to-End-Nachweis wie der ZIP-Weg.

#### BL-051.3 – 100-Dateien-/500-MB-End-to-End-Abnahme

Status: **offen** · Epic: BL-051 · Abhängigkeiten: BL-011.2 bis BL-011.7, Meilenstein 3

Gemischter Maximalstapel, Fehler, Abbruch und Neustart-Fortsetzung bestehen auf allen
drei Plattformen. Gemäß DS-039 sind zwei getrennte Gates erforderlich: vollständige
lokale Aufbereitung/Export des Stapels und eine begrenzte, fortsetzbare
Claude-Weiterverarbeitung. Der erste Nachweis darf nicht davon abhängen, dass das
Modell alle Markdown-Zeichen liest; der zweite darf weder stille Auslassung noch eine
500-MB-Einzelkontextzusage enthalten.

#### BL-051.4 – Rückrolle auf drei OS abnehmen

Status: **offen** · Epic: BL-051 · Abhängigkeit: BL-010.6

Vorgängerversion startet sicher; offene Jobs werden kompatibel übernommen oder klar
und verlustfrei migriert beziehungsweise pausiert.

#### BL-051.5 – ZIP-/Marketplace-Lebenszyklus in Cowork abnehmen

Status: **offen** · Priorität: **P0** · Epic: BL-051 · Abhängigkeiten: BL-010.5 bis BL-010.8, BL-041.4

Der echte Organisations-ZIP beziehungsweise private Marketplace wird auf einer
frischen Zielumgebung installiert. Archivwurzel, Manifest, zwei Skills, MCP-Server
und Runtime werden strikt validiert; Installation, Refresh/neue Sitzung,
Connector-/Versionssichtbarkeit, Upgrade A→B, Rollback B→A und erneutes Upgrade
werden mit synthetischem Kernfall geprüft. Ein laufender Altchat ist kein
Updatebeleg. Der persönliche ZIP und der Marketplace besitzen denselben Produktweg;
MCPB bleibt eine getrennte IT-Matrixzelle.

Abnahme: natürliche und direkte Skillwahl, `privacy_status`, Drei-Dateien-Mischbatch,
Sicherheitsstopp, Fortsetzung, lokales Mapping und zweifach bestätigte Löschung in
Cowork Desktop. Nachweise nennen Claude-/Cowork-Version, OS/Architektur,
Distributionsweg, Permission-Modus und Paketversion, aber keine Quellidentität.

#### BL-051.6 – Nicht unterstützte Claude-Oberflächen negativ abnehmen

Status: **in Arbeit** · Priorität: **P0** · Epic: BL-051 · Abhängigkeiten: BL-010.7, BL-042.2

Web, Mobil und Cloud-/Scheduled-Sitzung werden jeweils mit Originalanhang,
Uploadaufforderung, Pfadangabe und Aufforderung zu einem anderen Connector getestet.
Erwartung: kein Original lesen, keinen Upload empfehlen, kein allgemeines
Filesystem-/Computer-Use-Werkzeug verwenden und keinen Rohtext in Skill oder Prompt
übernehmen. Eine offene Desktop-App macht Web/Mobil nicht automatisch positiv;
erforderlich bleiben erfolgreicher `privacy_status` und eine separat freigegebene
Hostmatrix. Bereits bereinigtes Markdown darf normal weiterverarbeitet werden.

Abnahme: mit geschlossener/offline Desktop-App verständlicher einmaliger Stopp ohne
Wiederholschleife; mit fehlendem Local-MCP-Policyrecht derselbe sichere Stopp. Jede
unbelegte Hostklasse bleibt NO-GO für Originale.

Teilnachweis 23.08.2026: Die negative Policy- und Modellmatrix ist als
`HOST_MATRIX_V1.json`, Prompt-/Skillvertrag und vier deterministische Evalfälle
umgesetzt. Sie prüft Originalanhang, lokalen Ordnerwunsch, geplante Cloud-Aufgabe und
getrennten Desktop-Connector einschließlich verbotener Upload-, Computer-Use-,
Filesystem- und Connector-Ausweichwege. Dies ist noch keine beobachtete Abnahme in
Web, Mobil, Cloud/Scheduled oder Cowork Desktop; diese Realtests bleiben offen.

#### BL-051.7 – GitHub-Actions-Kosten technisch begrenzen

Status: **erledigt** · Epic: BL-051

Normale Pushes und Pull Requests starten höchstens einen Ubuntu-Job mit zehn Minuten
Timeout, Pfadfilter und `cancel-in-progress`. Er prüft die zentralen Privacy-, Parser-,
Batch-, Gateway-, MCP- und Adversarialverträge, erzeugt aber keine Artefakte. Die
vollständige Drei-OS-Matrix, Windows-Nativabnahme, Releasepakete, CodeQL, Gitleaks und
alle OCR-/PDF-Piloten bleiben erhalten, starten jedoch ausschließlich nach bewusster
manueller Auswahl. `test-workflow-budget.js` blockiert zusätzliche automatische
Workflows, Matrizen, Artefakte oder die Rückkehr der drei Security-Jobs auf jeden Push.

#### BL-052.1 – Beobachtete Anwenderabnahme

Status: **offen** · Epic: BL-052 · Abhängigkeit: Meilenstein 4

Normale Anwender bewältigen Auswahl, Fortschritt, Entscheidungen, Fortsetzung und
Export mit synthetischen Daten ohne Entwicklerhilfe.

#### BL-052.2 – IT-/Health-IT-Fachabnahme

Status: **offen** · Epic: BL-052 · Abhängigkeiten: BL-050.2, BL-052.1

Fachinhalte, Zertifikate, Tabellen, Ausschreibungen und medizinische IT-Terminologie
bleiben im vereinbarten Umfang erhalten.

#### BL-052.3 – Datenschutzabnahme mit synthetischen Daten

Status: **offen** · Epic: BL-052 · Abhängigkeiten: BL-050.2, BL-052.1

Datenflüsse, lokale Grenzen, Aufbewahrung, Mapping, Diagnose und Aussagegrenzen sind
dokumentiert geprüft. Ein Echtdatenpilot bleibt eine getrennte Entscheidung.

## Definition of Ready

Eine Story ist erst bereit, wenn sie Nutzerergebnis und Plattformumfang nennt,
DS-/Epic-IDs sowie wiederzuverwendende Module und Tests referenziert, Abhängigkeiten
und Datenschutzgrenze festhält, positive/negative/Abbruch-Akzeptanzfälle besitzt,
synthetische Fixtures beschreibt, den Eintrag in `OPEN_SOURCE_COMPONENTS.md` bewertet
und keine offene Architekturentscheidung verbirgt.

## Definition of Done

Eine Story ist erst erledigt, wenn Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
Traceability aktualisiert sind; Security-, Privacy- und Recovery-Negativtests bestehen; jeder
Defekt einen Regressionstest erhält; keine Rohwerte, Pfade oder Mappingdaten über MCP
oder Diagnose austreten; Artefaktparität besteht; Ist-Fähigkeiten erst nach positiver
Abnahme erweitert werden; betroffene Zielplattformen praktisch getestet sind; und
bei UI-Arbeit Barrierefreiheit sowie verständliche Fehler nachgewiesen sind.

## Epic-Abnahmekriterien: Steuerung und Ist-/Zielstand

### BL-001 – Kanonisches Dokumentensystem etablieren

Status: **erledigt** · Entscheidungen: DS-001 bis DS-038 · Ist: [BL-001](CURRENT_STATE.md#bl-001--kanonisches-dokumentensystem)

Abnahme: Kanonische Quellen, Entscheidungsregister, Backlog und Traceability sind
vorhanden; ein automatischer Test erkennt fehlende oder verwaiste IDs; alte
Planungsdokumente verweisen sichtbar auf diesen Ordner.

### BL-002 – RC30-Fähigkeitsmanifest vom Zielmanifest trennen

Status: **erledigt** · Entscheidungen: DS-007, DS-010, DS-034, DS-035 · Ist: [BL-002](CURRENT_STATE.md#bl-002--ist--und-ziel-fähigkeiten)

Abnahme: Maschinenlesbare Ist-Fähigkeiten nennen nur tatsächlich freigegebene
Plattformen/Formate/Grenzen; das Zielmanifest wird nie zur Runtime-Werbung verwendet.

## Epic-Abnahmekriterien: Installation und Auftragsbasis

### BL-010 – Ein Plugin, betriebssystemspezifische Laufzeitpakete

Status: **teilweise** · Entscheidungen: DS-002, DS-003, DS-004, DS-030, DS-031, DS-034 · Ist: [BL-010](CURRENT_STATE.md#bl-010--plattformpakete)

Abnahme: ZIP und Marketplace installieren auf Windows, macOS und Linux ohne manuelle
Runtime; Plattformauswahl ist automatisch; Rollback auf das Vorgängerartefakt ist
dokumentiert und getestet.

### BL-011 – Persistenter, fortsetzbarer Job Store

Status: **teilweise** · Entscheidungen: DS-010, DS-020, DS-021, DS-022, DS-036 · Ist: [BL-011](CURRENT_STATE.md#bl-011--fortsetzbarer-job-store)

Abnahme: 100 Dateien/500 MB, ein aktiver Auftrag, sichere Pause/Abbruch/Neustart-
Fortsetzung, keine feste Seitenbegrenzung und 14-Tage-Bereinigung offener Kopien.

### BL-012 – Gemeinsames lokales Fortschritts- und Abschlussfenster

Status: **teilweise** · Entscheidungen: DS-013, DS-014, DS-015, DS-016, DS-028, DS-036 · Ist: [BL-012](CURRENT_STATE.md#bl-012--fortschritts--und-abschlussfenster)

Abnahme: keine Zwischenfragen während des Stapels; ein tastatur- und
screenreaderbedienbarer Abschlussdialog; „Später entscheiden“ warnt und hält die
Datei zuverlässig zurück.

## Epic-Abnahmekriterien: Extraktion und Offline-OCR

### BL-020 – Versionierter Content-Graph und Coverage-Vertrag

Status: **teilweise** · Entscheidungen: DS-007, DS-008, DS-015, DS-017, DS-035 · Ist: [BL-020](CURRENT_STATE.md#bl-020--content-graph-und-coverage)

Abnahme: Jeder extrahierte Text-/Bildbereich besitzt einen stabilen Locator; nicht
abgedeckte Inhalte können nicht still verschwinden; eingebettete Dokumente unterliegen
Rekursions- und Ressourcengrenzen; aktive Inhalte bleiben inert.

### BL-021 – Text-, Markdown- und CSV-Pfad

Status: **teilweise** · Entscheidungen: DS-007, DS-008, DS-012 · Ist: [BL-021](CURRENT_STATE.md#bl-021--txt-markdown-und-csv)

Abnahme: TXT, MD und CSV einschließlich Unicode, Tabellen, Formelfeldern und
Injection-Zeichen werden vollständig als sicheres Markdown dargestellt.

### BL-022 – OOXML-Pfade DOCX, XLSX und PPTX

Status: **teilweise** · Entscheidungen: DS-007, DS-008, DS-017 · Ist: [BL-022](CURRENT_STATE.md#bl-022--docx-xlsx-und-pptx)

Abnahme: Hauptinhalt, Tabellen, Kopf-/Fußbereiche, Textfelder, Kommentare, Notizen,
Beziehungen und eingebettete unterstützte Dateien sind abgedeckt; unbekannte
inhaltstragende Parts werden sichtbar offen gehalten.

### BL-023 – PDF einschließlich Scan-PDF

Status: **offen** · Entscheidungen: DS-007, DS-008, DS-009, DS-015, DS-018 · Ist: [BL-023](CURRENT_STATE.md#bl-023--pdf-und-scan-pdf)

Abnahme: lokale PDF-Engine deckt Text, Fonts, Formulare, Annotationen, Anhänge und
Seitenbilder ab; Scan-PDF läuft durch Offline-OCR; der bestehende PDF-No-Go-Gate wird
erst nach positivem Coverage-Nachweis entfernt.

### BL-024 – Plattformneutrale Offline-OCR und Bildpfade

Status: **teilweise** · Entscheidungen: DS-009, DS-018, DS-028, DS-037 · Ist: [BL-024](CURRENT_STATE.md#bl-024--offline-ocr-und-bilder)

Abnahme: Deutsch/Englisch einschließlich gemischter Dokumente, PNG/JPEG/BMP und visuelle Office-/PDF-Bestandteile laufen
offline auf allen Zielplattformen; Bildpixel bleiben außerhalb von Claude;
fachlich nicht textuell übertragbare Grafiken werden lokal angezeigt.

## Epic-Abnahmekriterien: Erkennung und Entscheidungen

### BL-030 – Stapelweite Entitätsauflösung

Status: **teilweise** · Entscheidungen: DS-011, DS-012, DS-019, DS-029 · Ist: [BL-030](CURRENT_STATE.md#bl-030--stapelweite-entitätsauflösung)

Abnahme: automatische Profilwahl je Datei, gemischte Stapel, konsistente flüchtige
Pseudonyme und keine persistente Mapping-Tabelle.

### BL-031 – Kontextmodell für Organisationen und Zertifizierungen

Status: **teilweise** · Entscheidungen: DS-012, DS-013, DS-029 · Ist: [BL-031](CURRENT_STATE.md#bl-031--organisationen-und-zertifizierungen)

Abnahme: dieselbe Zeichenfolge wird fundstellenbezogen korrekt behandelt;
Zertifikatskontexte bleiben erhalten, Arbeitgeber/Kunden/Parteien verschwinden;
Kataloge sind nur Evidenz und unbekannte Zertifizierungen bleiben prüfbar.
Verifizierte lokale Quellen: ISTQB, Scrum.org, Scaled Agile, IIBA, HIMSS, The Open
Group, Microsoft, AWS, Google Cloud, Cisco, ISACA, ISC2, Linux Foundation, CNCF, PMI,
Red Hat, SAP und HL7. Eine URL ist Hinweisprovenienz, keine Laufzeitabhängigkeit, und
enthält weder Prüfdaten noch eine Aussage über individuelle Zertifikatsgültigkeit.

### BL-032 – Lokale Passwort- und Mehrdeutigkeitsentscheidungen

Status: **teilweise** · Entscheidungen: DS-013, DS-014, DS-016, DS-027 · Ist: [BL-032](CURRENT_STATE.md#bl-032--passwörter-und-lokale-entscheidungen)

Abnahme: Passwörter bleiben im RAM; Entscheidungen können einzeln, gleichartig oder
später erfolgen; eindeutig geprüfte Dateien benötigen keine Pflichtvorschau.

## Epic-Abnahmekriterien: Export und Claude-Integration

### BL-040 – Dauerhafter Exportvertrag

Status: **erledigt** · Entscheidungen: DS-008, DS-023, DS-024, DS-025 · Ist: [BL-040](CURRENT_STATE.md#bl-040--dauerhafter-export)

Abnahme: pro Quelle neutrales Markdown, pro Stapel UTF-8-CSV und inhaltsfreier
JSON-Nachweis; kein Überschreiben; Mapping ist technisch außerhalb aller MCP-Lesetools.

### BL-041 – Fortsetzung der ursprünglichen Claude-Aufgabe

Status: **teilweise** · Entscheidungen: DS-003, DS-005, DS-006, DS-027, DS-032 · Ist: [BL-041](CURRENT_STATE.md#bl-041--claude-aufgabe-fortsetzen)

Abnahme: natürliche Sprache und Skillauswahl verhalten sich gleich; Claude liest nur
freigegebenes Markdown und setzt die Ausgangsaufgabe automatisch fort; Uploads und
unverfügbare lokale Tools stoppen verständlich.

### BL-042 – Datenschutz- und Diagnosekommunikation

Status: **teilweise** · Entscheidungen: DS-001, DS-026, DS-028, DS-032 · Ist: [BL-042](CURRENT_STATE.md#bl-042--kommunikation-und-diagnose)

Abnahme: Alltagssprache im Normalweg, optionale technische Details, keine
Rechtsgarantie und ein lokal erzeugbares, inhaltsfreies Diagnosepaket.

## Epic-Abnahmekriterien: Qualität und Freigabe

### BL-050 – 1.000-Dokument-Abnahmekorpus

Status: **teilweise** · Entscheidungen: DS-007, DS-009, DS-012, DS-017, DS-033 · Ist: [BL-050](CURRENT_STATE.md#bl-050--1000-dokument-korpus)

Abnahme: mindestens 1.000 synthetische Dokumente über alle Formate, Dokumenttypen,
Schriften und Angriffsvarianten; null bekannte direkte Identifikator-Misses in der
Pflichtsuite; mindestens 99 Prozent markierter fachlicher Inhalt bleibt erhalten.

### BL-051 – Plattform- und Distributionsmatrix

Status: **teilweise** · Entscheidungen: DS-002, DS-004, DS-031, DS-034 · Ist: [BL-051](CURRENT_STATE.md#bl-051--plattform--und-distributionsmatrix)

Abnahme: frische ZIP- und Marketplace-Installation, kompletter Benutzerweg,
Fortsetzung und Export auf Windows, macOS und Linux; Belege pro Version archiviert.

### BL-052 – Menschliche UX-/Fach-/Datenschutzabnahme

Status: **offen** · Entscheidungen: DS-012, DS-013, DS-027, DS-028, DS-033 · Ist: [BL-052](CURRENT_STATE.md#bl-052--menschliche-abnahme)

Abnahme: normale Anwender, IT-/Health-IT-Fachvertretung und Datenschutz prüfen
ausschließlich synthetische Szenarien; jeder Defekt wird Regressionstest und
Backlogposition. Echtdaten bleiben bis zur ausdrücklichen Pilotentscheidung NO-GO.
