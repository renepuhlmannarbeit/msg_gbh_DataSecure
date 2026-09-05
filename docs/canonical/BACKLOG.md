# Aktives Entwicklungsbacklog

Stand: 05.09.2026 · Produktstand 3.2.0-rc107

Dies ist die **einzige aktive Arbeitsliste**. Historische RC-Schnitte, erledigte
Teilarbeiten und frühere Keyring-/MCPB-Pläne stehen im
[Archiv](../archive/README.md) und in den monatlichen Backlogarchiven.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Eine technisch fertige Story mit
offener Zielsystem- oder Anwenderabnahme bleibt hier als „menschliche Evidenz
offen“ sichtbar, wird aber nicht als weitere Entwicklungsarbeit dargestellt.

## Aktiver Umsetzungsblock – Gesamtgegenreview 01.09.2026

### Korrekturblock aus dem erneuten RC106-Review – RC107 E0 geschlossen

| Befund | Bestehende Storys | Umsetzung / verbleibender Nachweis |
|---|---|---|
| Nativer Starttest verwendete reale Anwendungsdaten statt isolierter Testdaten. | BL-010.13, BL-051.1, BL-002 | **E0 erledigt:** explizites, vor Bootstrap validiertes Native-Smoke-Profil für Daten, Dokumente, Diagnosen und WebView einschließlich fehlendem Marker und Pfad-/Link-Negativtests. Neuer Paketnachweis aus dem Korrekturcommit erforderlich. Keine VM und kein Zusatzkonto. |
| Polling blieb nach langen Aktionen stehen; schnelle Folgeläufe zeigten alte Ziele. | BL-010.12/13, BL-002 | **E0 erledigt:** Poll-Lebenszyklus und beide asynchronen Antwortgrenzen an Operationsgeneration gebunden; 14 Frontendfälle decken schnelle Folgestapel, verzögerte Picker/Start/Abbruch und fehlende Zuordnung ab. |
| Geschlossener Desktop ließ einen Steuerprozess mit offenem Worker-IPC weiterleben. | BL-010.13, BL-011.3, BL-002 | **E0 erledigt:** EOF beendet nur den Standalone-Steuerprozess; wartende Requests starten nicht nach. Dauerhaft übergebene Worker behalten ihren Fortsetzungsvertrag. Sieben echte Prozess-/Worker-Negativszenarien grün; Cowork besitzt bereits einen begrenzten Shutdown. |
| Vollständig gestoppter Stapel öffnete die Zuordnung eines erfolgreichen Vorgängers. | BL-040.5/6, BL-010.19, BL-002 | **E0 erledigt:** eigene Standalone-Laufübersicht auch ohne Ergebnisdateien; Fehlercode pro gestoppter Quelle, kein Altstapelfallback. Fail-/Mischlauf, offene Abschlussmetadaten, Exportfehler, Replay, Crashfenster bereits veröffentlichter Altzuordnungen und Plugin-Abgrenzung regressionsgeprüft. |
| Echter Paket-Folgestapel mit defekter CSV wurde unbegrenzt als wiederaufnehmbar behandelt. | BL-020.1, BL-011.3, BL-002 | **E0 korrigiert:** bestätigte negative Parserantwort erhält `PARSE_FAILED` statt codeleerem Fehler; nur exakter Negativ-Envelope mit passendem Exit gilt als bestätigte Ablehnung. Unbekannte Abstürze behalten Unterbrechungssemantik, Timeout bleibt `PARSER_TIMEOUT`. Gemeinsamer Kern für Cowork/Standalone; Parser-Isolation 19/19 und Itemprozessor 16/16 grün, unabhängiger Gegencheck ohne neuen Defect. Erster RC107-Paketversuch aus `ebffe87` verworfen, keine INT-13-Bindung; frischer Commit und beide Builds erforderlich. |
| Firmenkurzformen wurden durch konkurrierende Personensamen falsch typisiert. | BL-030.2, BL-021.1, BL-002 | **E0 erledigt:** eindeutige Firmenaliasbindung, unklare Organisation bei Rechtsformkonflikt; natürliche Kundenpersonen und explizite Namensfelder auch in Listen bleiben Personen. Registry 26/26 und PII 120/120; beide Produktkontexte und Resume geprüft. |
| Grüne Tests und Dokumentation überzeichneten den Abschlussumfang. | BL-002, BL-051.1 | **E0 erledigt:** Frontendtests im Produktgate, historische PKG-04-Evidence exakt benannt, UML-IST/SOLL und Markdown-Zwischen-/Endartefakte getrennt. Produktsuite 40 Basis- und 111 direkte Dateien grün, geänderte Standalone-Kette abschließend erneut geprüft. PKG-04/INT-13 benötigen den neuen Kandidaten; E1/E2 bleiben offen. |

BL-010.28 bleibt ein eigenständiger verbindlicher Funktionsausbau, kein bereits
erledigter Bugfix. Der technische Gegencheck identifiziert Modusbindung durch
Admission/IPC/Worker/Journal, inhaltstreue Parser ohne Privacy-Normalisierung,
eine separate Konvertat-Artefaktklasse mit Ablehnung an allen MCP-Lesegates,
modusgebundene Recovery/Delivery und `DataSecure-Markdown`-Export. Erst die
vollständige Kette mit echten Vierformat-/Crash-/Negativtests aktiviert den Modus.
MarkItDown ist für die ersten vier Formate nicht erforderlich; breitere Formate
bleiben ausdrücklich Teil der nachfolgenden Konverterlieferung.

Paketnachweis RC107 (BL-051.1/BL-002): `aaecf59` besteht die lokale CI-Produktsuite,
den gepackten Erfolgs-/Fehlerfolgelauf und den isolierten nativen Windows-Start.
PKG-04 bleibt aus diesem Versuch unvollständig: Die Cleanup-Inventur stoppte an
einer internen Windows-Cache-Junction, ohne Testdaten zu löschen. Der Testrest
bleibt erhalten. Nur ein eng geprüfter Harness-Vertrag für neu erzeugte
Testprofile mit synthetischen Negativtests darf einen neuen Zweifachlauf
ermöglichen; unbekannte Links bleiben verboten. INT-13 wird nicht vorab gebunden.
Der neue Testharness ist inzwischen implementiert: zwölf Desktop-Vertragstests
einschließlich acht synthetischer Cleanup-Gruppen prüfen zulässigen Cache-Link,
unveränderten Zielinhalt, falsche Ziele und ausgetauschte Objektidentitäten.
Der echte neue Zweifach-Build bleibt separat nachzuweisen.
Ein weiterer echter Smoke zeigte leere Junction-Providerfelder unter Windows
PowerShell. Der native No-follow-Tag-/Zielcheck ersetzt diese Anzeigeheuristik;
12/12 Desktop-Verträge sowie ein frischer vollständiger nativer Lauf inklusive
Bereinigung sind grün. Beide alten Testreste bleiben erhalten. PKG-04 wird erst
nach dem letzten Produktfix erneut ausgeführt.

Das unabhängige Gegenreview aus Test/CI, Dokumentation/UAT sowie Architektur,
Security, Performance, UX und aktueller Claude-Cowork-Sicht ist bis zum Abschluss
dieses Blocks ein **NO-GO für einen breiten Rollout**. Grüne E0-Tests ersetzen die
folgenden Produkt- und Zielhostnachweise nicht.

| Reihenfolge | Zugehörige Storys | Verbindliche Lieferung | Status |
|---|---|---|---|
| 1 | BL-002, BL-051.2, BL-052.1 | Produkt-, Legacy- und Engineering-Tests sowie GitHub-Workflows trennen; aktuellen UAT-Generator wirklich ausführen; Batch-Maintenance in die Produktregression aufnehmen. | **E0 erledigt** |
| 2 | BL-001, BL-002, BL-003 | `SECURITY.md`, Third-Party-Notices, Companion-/Governance-Altverträge, Register, Archivlinks und dokumentgesteuerte Link-/Driftgates auf den aktuellen Produktvertrag bringen. | **erledigt** |
| 3 | BL-012.2, BL-041.7, BL-044.1 | Keine stille Ordnerteilmenge, ehrliche Trennung zwischen Worker-Annahme und dauerhaftem Checkpoint sowie ausdrücklicher Prompt-Injection-Vertrag für übergebenes Markdown. | **E0 erledigt** |
| 4 | BL-010.7, BL-010.1, BL-041.7 | Cowork-Hostmatrix gemäß DS-078 korrigieren: Originale nur in lokaler Cowork-Sitzung eines bestehenden Desktop-Deployments mit laufendem Plugin-MCP oder lokalem Claude Code; Cloud-Cowork/Web/Mobil/Scheduled nutzen ausschließlich bereits freigegebenes Markdown. | **E0 erledigt; Zielhostevidenz offen** |
| 5 | BL-010.8, BL-010.1, BL-010.2, BL-010.3 | Selbsttragende Plugin-Runtime ohne System-Node für Windows x64 und macOS Intel/ARM bauen, paketieren und automatisiert prüfen. | **E0 implementiert; Zielhostevidenz offen** |
| 6 | BL-051.1, BL-051.2, BL-051.3, BL-051.5, BL-052.1–BL-052.5 | Fresh Install, Marketplace-Lebenszyklus, sichtbarer Cowork-Ablauf, Accessibility, Fach-/Security-/Datenschutz- und Anwenderabnahme mit dem ausführbaren UAT-Kit. | **menschliche Evidenz nach 1–5** |

Review-Evidence: Der aktuelle Node-UAT-Generator erzeugt reproduzierbar 111
synthetische Dateien. Produkt-, Engineering- und Legacy-Pfade sind getrennt;
Dokumentation, Hostmatrix, Ordnerannahme, Startstatus und Prompt-Injection-Vertrag
sind automatisiert geprüft. Der gebündelte Runtimevertrag deckt Windows x64 sowie
macOS Intel/ARM ab. Ein reales Windows-x64-Artefakt startete mit leerem `PATH`,
bestand MCP-Handshake/Status-Smoke und blieb unter 45 MiB (Build 01.09.2026:
34.845.038 Byte; lokaler Build 02.09.2026 nach dem Gesamtgegenreview:
34.913.330 Byte, SHA-256 `c34211c0…3815c`).
Reale macOS-Ausführung, Cowork-Fresh-Install und Marketplace-Lebenszyklus bleiben
menschliche Freigabeevidenz; bis dahin bleibt der breite Rollout NO-GO.

### Codex-Gegenreview RC92 – in RC93 E0 geschlossen

Die Befunde C-01 bis C-08 sind technisch behoben und regressionsgebunden.
C-04 wurde gegen DS-012 fachlich präzisiert: Anreden werden entfernt,
Qualifikationen bleiben. C-09 war kein Rohdatenabfluss; DS-071 grenzt die
Laufkennung nun ausdrücklich auf zwei vom Anwender beziehungsweise Support
aktivierte Diagnoseflächen ein. Es entsteht kein neuer Dialog. Die Änderungen
gehören zu BL-021.1, BL-042, BL-044.1 und BL-002. Echte Zielhost-, Cowork- und
Fachabnahme bleibt im Abschnitt B offen; insbesondere ersetzt die Regression
keinen Vollständigkeitsbeweis für alle künftigen Dokumentdarstellungen.

### Claude-Code-Gegenreview RC93 – in RC94 E0 nachkorrigiert

Das RC93-Gegenreview schloss Anrede-/Titel- und Startmarkerbefunde, führte bei
ungleich breiten Tabellenzeilen aber eine positionsbasierte Zuordnung ein. Der
unabhängige Codex-Gegencheck reproduzierte dadurch weiterhin klare Steuer-IDs bei
führenden oder fehlenden Zellen. RC94 ersetzt dieses Raten durch einen
eigenständigen Struktur-Restbefund: bis zu drei gleich breite, eindeutig bekannte
PII-Kopfzeilen werden verarbeitet; verschobene, überlange oder anders breite
sensible Tabellen stoppen fail-closed. Horizontal oder vertikal verbundene
DOCX-Zellen stoppen bereits im Parser. Exakte IT-/Health-IT-Begriffe wie
`Graph API`, `Project Server`, `Robot Framework`, `Imaging Protocol` und
`Treatment Protocol` bleiben erhalten, ohne Anredeerkennung allgemein zu
lockern. Zugeordnet: BL-021.1, BL-022.1, DS-012 und DS-049. Die automatisierte
E0-Korrektur ist erledigt; echte Word-/LibreOffice-Dokumente und Cowork bleiben
Zielhost-/Fachevidenz in Abschnitt B.

### In diesem Schnitt E0 abgeschlossen

| Story | Technischer Abschluss | Verbleibende Evidenz | Status |
|---|---|---|---|
| BL-011.8 | Journal, Intake-Intent, Arbeitsbaum und Cleanup sind größenbegrenzt sowie datei-/verzeichnisidentitätsgebunden; Austauschversuche und unsichere Strukturen stoppen fail-closed. | echtes Windows-/macOS-Dateisystem, Crash/Power-Loss und feindliche Race-Beobachtung über BL-011.11/BL-050.3 | **erledigt** |
| BL-020.1 | `data-secure-content-graph/v1` deckt TXT, Markdown, CSV und DOCX mit validierten Markdown-/Part-Locators ab; leere oder ungebundene Textknoten stoppen. | feinere Absatz-/Zelllocators sind erst für spätere Formatstories nötig | **erledigt** |
| BL-020.2 | Produktpreflight sperrt alle OOXML-Einbettungen; DOCX-Parser sperrt aktive Felder, Revisionen, Controls, externe/unklare Beziehungen und falsche Content Types fail-closed. | echter Office-Interoperabilitätskorpus und Security-Abnahme über BL-022.1/BL-049.1 | **erledigt** |
| BL-030.2 | zufälliger Stapelseed plus rohwertfreie HMAC-Alias-/Kollisionsbindungen werden dauerhaft gecheckpointet; Neustart, Alias, Manipulation und Fehlercleanup sind getestet – ohne Keyring oder Zusatzverschlüsselung. | echte Cowork-/OS-Neustart- und Crash-Fortsetzung über BL-011.3/BL-011.11 | **erledigt** |
| BL-011.10 | Eine atomare, prozessübergreifende Intake-Reservierung gilt vom Pickerstart bis zum dauerhaften Stapelcheckpoint. Die Reservierung kann sicher an den Worker delegiert werden; verwaiste Eigentümer werden fail-closed erkannt und zwei reale konkurrierende Prozesse lassen genau eine Aufnahme zu. | Mehrfachauswahl und Hintergrundstart in echter Cowork-Bedienung auf Windows/macOS messen | **erledigt** |
| BL-047.1 | Freigegebene Markdown-Snapshots werden asynchron und größenbegrenzt gelesen, gehasht und UTF-8-indiziert; ein 6-MiB-Regressionslauf belegt, dass der MCP-Ereignisloop währenddessen weiterläuft. | Referenzhardware messen und erst danach eine adaptive Parallelisierung bewerten; Produktstandard bleibt seriell | **erledigt** |
| BL-040.5 | Beim ersten startfähigen Lauf wird der dedizierte lokale Ergebnisordner erst nach erfolgreicher Anlage von `DataSecure-Output` dauerhaft gespeichert. Nur verifiziertes Markdown wird mit neutralen Namen exportiert; die Zielidentität ist gebunden und die Veröffentlichung ist exklusiv atomar, sodass eine zwischen Prüfung und Publikation entstandene Benutzerdatei nie überschrieben wird. Nur ein fehlgeschlagener Export wird nachgeholt, ein abgeschlossener Export ist endgültig (gelöschte oder bearbeitete sichtbare Ergebnisse werden nicht wiederhergestellt, ein Zielwechsel spiegelt keine alten Läufe). Private Daten bleiben getrennt, der Abschluss bietet „Ergebnisse öffnen“, rekursive Quellen dürfen den sichtbaren Output nicht wieder aufnehmen und die MCP-Startantwort wartet begrenzt auf die ausdrückliche Empfangsbestätigung des Workers. | Fresh Install, Neustart, Ordnerwechsel und Abschlussaktion in echter Cowork-Bedienung auf Windows/macOS beobachten | **erledigt** |

### Experten-Gegencheck RC95 – E0 abgeschlossen

Der Architektur-, Worker-, Performance-, Claude-/Cowork- und UX-Gegencheck schließt
vier zusammenhängende Restbefunde, ohne einen zweiten Produktweg einzuführen:

- Intake, Fortsetzung und lokaler Review gelten erst nach einer ausdrücklichen,
  inhaltsfreien Worker-Bestätigung als gestartet.
- Der Abschlussdialog nutzt eine zweiphasige Reservierung. Seit dem E0-Schnitt
  vom 05.09. bestätigt Standalone erst nach Renderer-Paint und Windows-Cowork
  erst nach nativem `Shown`; ein Fehler gibt die Reservierung für genau einen
  Worker-Fallback frei. macOS bleibt Zielhostevidenz.
- Ein Stapel mit Mehrdeutigkeiten wechselt im bereits laufenden lokalen Worker
  direkt in den Sammelreview. „Später“ bleibt ein sicherer, fortsetzbarer Zustand;
  es folgt weder ein zweiter Cowork-Aufruf noch ein automatisches Freigeben.
- Ein offener sichtbarer Export wird nach dem MCP-Start in einem begrenzten Worker
  nachgeholt. Ergebnislisten verwenden die dauerhaft gebundene Paketidentität;
  der vollständige asynchrone SHA-256-Nachweis bleibt vor jeder Inhaltsübergabe
  verpflichtend.

Zugeordnet: BL-040.5, BL-041.9, BL-041.10, BL-043 und BL-047.1. Die automatisierte
E0-Evidenz ist grün; echte Windows-/macOS-Cowork-, Fokus- und Fresh-Install-
Beobachtungen bleiben in Abschnitt B.

### Windows-UAT RC95/RC96 und Laufzeitkorrektur RC97

Der erste reale RC95-Cowork-Lauf bestätigte den Picker und den echten
Worker-Handoff, erzeugte danach aber weder Stapelcheckpoint noch Ergebnis. Die
Claude-Desktop-Diagnose belegte: Der MCP-Elternprozess lief aus einer temporären
Pluginprojektion; nach Ende des Cowork-Aufrufs war dieser Quellbaum entfernt,
während der Hintergrundworker weitere Programmdateien daraus benötigte. UAT-01
ist für RC95 deshalb **fehlgeschlagen**, nicht „unentschieden“.

RC96 setzte damit DS-072 um und projizierte beim Start ausschließlich Produktcode und gebündelte Runtime in
einen dauerhaften, versionsgebundenen lokalen Runtime-Cache. Ein automatisierter
Regressionstest löscht den temporären Pluginbaum und startet danach den Worker
aus dem Cache. Zugeordnet: BL-010.8, BL-011.10, BL-041.7 und BL-051.5. Der reale
Der reale RC96-Wiederholungslauf zeigte dieselbe Wirkung: Cowork leitete auch
`LOCALAPPDATA` in eine sitzungsgebundene Umgebung um, sodass Cache und
Ergebnisordnerkonfiguration mit dem Toolaufruf verschwanden. RC97 erkennt nur
diese Claude-Temporärprojektion und bindet Produktzustand und Runtime-Cache an
das bestehende reguläre Windows-Benutzerprofil (DS-073). Der RC97-
Wiederholungslauf bleibt E1-Evidenz.

#### Standalone ohne Claude/Cowork und sichere MarkItDown-Konvertierung

Detailarchitektur: [`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).
Die Storys sind revalidiert aus Produkt-, UX-, Architektur-, Security-,
Performance-, Packaging- und Betriebsblick. Standalone ist ein eigenständiges
zweites Endnutzerprodukt ohne Claude, Cowork, MCP oder Agenten. Gemeinsam bleibt
nur der geprüfte DataSecure-Core. DS-075 ist der verbindliche Architektur- und
Vertrauensgrenzenentscheid. DS-076/DS-077 binden die Tauri-Hülle, den
Windows-x64-Engineering-Piloten, WebView2-Voraussetzung und Evidencegrenzen.

| Story | Lieferung / Abnahme | Status |
  |---|---|---|
| BL-010.9 | Direkte Standalone-Application-Schicht unterhalb von MCP: keine Toolnamen, Protokollversionen, Claude-Antwortfelder oder Handofflogik. Eigener Daten-/Konfigurations-/Review-/Exportroot wird vor Laden des Core aktiviert und an Worker weitergegeben. E0 steht einschließlich neutraler gemeinsamer Start-/Recovery-Transaktion; Core-API-Extraktion aus verbleibenden Pluginbegriffen bleibt offen. | **in Arbeit** |
| BL-010.10 | Schlanke technische CLI für Datei-/Ordnerwahl, automatische Profilerkennung, Standard-Ergebnisordner und Ergebnisordneröffnung. Keine Rohpfade in Argumenten oder Ausgaben; kein Endnutzer-Terminal im freigegebenen Produkt. | **erledigt** |
| BL-010.11 | Native Desktop-Hülle: Tauri 2 ist gemäß DS-076/077 gesetzt. Reale Rust-Hülle, Tauri-CSP/Capability-Grenze, nativer Datei-/Ordnerpicker, korrelierter bidirektionaler Core-Dispatcher mit begrenzten Längenframes, 30-Sekunden-Antwortgrenze, Ready-Handshake, Neustart nach IPC-Fehler, Sidecar-Lifecycle und inhaltsfreie Rendererprojektion sind implementiert. Der Renderer besitzt keine direkten Dialog-, Datei-, Shell- oder Netzrechte. Windows x64 ist kompiliert und als laufender Engineering-Prozess sowie im selbsttragenden Pilot-ZIP geprüft. Offen sind Kaltstart p50 ≤1,5 s/p95 ≤2,5 s, Hülle ≤20 MiB ohne Core, Tastatur/Screenreader, Update/Rollback, Null-Listener-Nachweis und native Zielhost-Spikes auf macOS Intel/ARM und Linux x64. | **in Arbeit** |
| BL-010.12 | Ein Vorbereitungsbild mit Anzahl und Größe; danach passiver Fortschritt ohne Modal je Datei. Native Mehrfach-/Ordnerauswahl und Dragdrop verwenden denselben Core-Admissionpfad mit Pfad-, NUL-, Duplikat-, Format- und Größengates. Die Auswahl ist ausschließlich lokal sichtbar und startet erst nach **Anonymisierung starten**, ohne zweiten Picker. Native Guards verhindern konkurrierende Auswahl/Start und unbemerktes Ersetzen einer vorbereiteten Auswahl. Der Paket-Smoke nimmt vier echte TXT/MD/CSV/DOCX-Fixtures auf. Offen: UI-Aufteilung direkt/konvertierbar/gesperrt/verschlüsselt sowie E2 für Dragdrop, 100 Dateien und 500 MiB. | **in Arbeit** |
| BL-010.13 | Bestehenden Sammelreview und Klar-Datei-Pfad wiederverwenden. **Verarbeiten** und **Ergebnisse** zeigen je Zustand eine primäre Aktion und den exakten letzten `Lauf-*`-Ordner. Für **Ergebnisse öffnen** und **Zuordnungsdatei anzeigen** löst der Sidecar ausschließlich den vollständig sichtbaren Lauf bzw. dessen `DataSecure-Zuordnung.csv` auf; Rust validiert das private Ziel und startet Explorer/Finder/`xdg-open` sichtbar. Die Öffnungsaktion liefert dem Renderer nur eine inhaltsfreie Übergabebestätigung; ein separates `aria-live` überschreibt den Laufstatus nicht. Der UI-Kontext ergänzt ältere Exportrecords journalgebunden vor der Anzeige. Der reale Paket-Smoke verarbeitet vier Formate und prüft stabile Personen-/Firmenkennungen, unveränderte Quellen, exakten Lauf, Mapping und beide Resolver. Zähler stammen nur aus dem jüngsten eigenen Stapel; ein interner Abschluss ohne sichtbaren Export bleibt `export_pending`. Sichtbare Version verhindert Kandidatenverwechslung. Im Piloten bleibt der lokale Core-Reviewer zuständig; integrierter Tauri-Review erfordert später einen eigenen begrenzten Reviewvertrag. | **in Arbeit** |
| BL-010.14 | Absturz-/Abbruchfortsetzung, genau ein aktiver Stapel, keine Doppelverarbeitung, Quellen unverändert und niemals automatisch gelöscht. Der öffentliche Stand zeigt vorhandene fortsetzbare Stapel als `stopped`/`resumable`; nach Sidecar-Neustart oder verlorenem Admission-Zustand setzt der Renderer die veraltete Startfreigabe zurück und verlangt eine neue lokale Auswahl. Echter Desktop-Absturz-/Neustart-UAT bleibt offen. | **in Arbeit** |
| BL-010.15 | MarkItDown 0.1.7 als gepinnter, deaktivierter DOCX-Differentialadapter: Byte-Stream, nur expliziter DOCX-Konverter, Plugins/Built-ins/Netzwerk/LLM/OCR aus, keine persistierte rohe Markdown-Datei. Engineering-Bridge startet mit `-I -S`, erbt weder Host-TEMP noch PATH und kennzeichnet ihr ungerahmtes stdin/stdout ehrlich als nicht authentisierten Testpfad. | **in Arbeit** |
| BL-010.16 | Exakt gepinnte portable CPython-3.12-Patchversion und zunächst nur `markitdown[docx]==0.1.7` samt Hash-Wheellock für Windows x64, macOS Intel/ARM und Linux x64 glibc offline bündeln; NOTICE, SBOM, reproduzierbare Inventur, kein Runtime-Install. | **offen** |
| BL-010.17 | MarkItDown als gleichrangigen isolierten Worker über Windows-/POSIX-Supervisor anbinden: CPU/RAM/Zeit/Ausgabe/Prozessgruppe begrenzen, exklusiv geerbte gerahmte IPC mit Prozessbesitz statt eines schein-authentisierten offenen Kanals, private produktgebundene Tempwurzel, Crash und Abbruch fortsetzbar. Netzwerkbehauptung bleibt auf nachweislich fehlende Produktfunktion und negative Canaries begrenzt; keine unbelegte Kernel-Sandbox-Zusage. | **offen** |
| BL-010.18 | Formatstufen mit unabhängiger Coverage: XLSX/PPTX, dann Text-PDF, zuletzt Scan-PDF/Bilder plus lokale OCR. Pro Format Positiv-, Negativ-, Differential-, Angriffs- und Realdateikorpus; unbekannte Inhalte stoppen. | **offen** |
| BL-010.19 | Geschlossene Konverterdiagnose (`converter_started/completed/stopped`, `coverage_checked`) in Supportspur; keine Inhalte, Namen, Pfade, Hashes, Metadaten, argv/env, stderr oder Tracebacks. Der Engineering-DOCX-Pfad liefert die drei Lifecycle-Ereignisse; Coverage und spätere Produktworker bleiben offen. | **in Arbeit** |
| BL-010.20 | Vier selbsttragende Standalone-ZIPs für Windows x64, macOS x64, macOS ARM64 und Linux x64 glibc mit Rollback-, Offline-, Dateimodus-, Start-, Update- und Signaturinventurgates. Windows x64 wird mit frisch erzeugter Coreprojektion, gepinnter Runtime, Manifest, SBOM, SHA-256 und isoliertem Sidecar-Smoke gebaut. Beide Mac-Pakete werden nativ auf macOS gebaut, verlangen mindestens macOS 13.5, werden ohne Apple-Zertifikat explizit ad-hoc signiert (`signingIdentity: "-"`) und enthalten exakt architekturpassenden Core/Konverter, `SHA256SUMS`, SBOM, Lizenzinventur und `MACOS-START.md`; falsche/gemischte Architektur stoppt. Developer-ID-Signierung bleibt keine Produktpflicht; interne Pilotpakete dokumentieren und testen Gatekeeper **Dennoch öffnen** ohne `xattr`, `spctl` oder globales Abschalten. | **in Arbeit** |
| BL-010.21 | E1/E2-UAT auf Windows sowie nativ auf macOS Intel und Apple Silicon: Download/Prüfsumme/Finder/Quarantäne/Gatekeeper, erste Nutzung, falsches Architekturpaket, kein Rosetta-Zwang, 100 Dateien/500 MiB, gemischte Formate, nativer Mehrfachpicker ohne zweiten Dialog, Review, Fehler, Crash/Resume, Offline-Lauf, Ergebnis-/Mappingfund, VoiceOver/Tastatur/Zoom/Fokus/Dark Mode, Kaltstart/RAM/Paketgröße und verständliche DE-Texte. Ein ARM-Lauf unter Rosetta ersetzt den Intel-Nachweis nicht. | **offen** |
| BL-010.22 | Produktisolation: Standalone-Paket enthält keine Plugin-/Skill-/MCP-/Claude-/OpenAI-/Azure-Bestandteile; Plugin-Handoff kann Standalone-Stapel/Packages nicht finden oder lesen; parallele Starts vermischen keine Daten. Nicht überlappender Root `SecureDataMsg-Standalone`, gebundener Journal-Kanal und Handoff-Negativgate stehen E0; Paket-, echte Cross-Read- und Konkurrenzgates sind offen. | **in Arbeit** |
| BL-010.23 | Gemeinsamer Corevertrag: Plugin und Standalone binden denselben Core-/Policy-Fingerprint und bestehen denselben Golden-Korpus mit gleichen geschützten Inhalten und Ergebnisgraden. Die bewusst unterschiedlichen v1-/v2-Ausgabekennungen nach DS-084 werden semantisch verglichen, nicht bytegleich; keine Abweichung der PII-Erkennung durch den Produktkanal. | **offen** |
| BL-010.24 | Offline-/Environment-Vertrag: jeder Standalone-Kindprozess erhält nur feste OS-/Locale-/DataSecure-Werte; DNS-, Socket- und HTTP-Canaries bleiben null; kein Proxy, Token, API-Key, Agent- oder Cloudwert gelangt in Worker. Worker-Allowlist steht; vollständiger Standalone-E2E-Gate ist offen. | **in Arbeit** |
| BL-010.25 | Eigenes Standalone-Manifest, SBOM, Runtime-Evidence, manueller Update-/Rollbackweg durch Austausch des Pakets und Deinstallation. Manifest, Runtime-Evidence und Engineering-SBOM stehen; Crate-Lizenzen sind darin ehrlich `NOASSERTION`. Zunächst kein Netzwerk- oder Auto-Updater. Installation oder Entfernung verändert weder Plugininstallation noch Daten des jeweils anderen Produkts. | **in Arbeit** |
| BL-010.26 | Diagnose- und Fehlerübersetzung: neutrales Core-Journal, getrennte Plugin- und Standalone-Ereignisse, PII-Sentineltests über Quelle/Konverter/OCR/Fehler; jeder feste Domaincode erhält eine kurze handlungsfähige UI-Meldung. Rotierende, über **Diagnose öffnen** erreichbare Desktop-/Sidecar-JSONL-Spuren enthalten keine Namen, Pfade, Inhalte oder Request-IDs. RC105 trennt `local_target_requested/resolved/failed` im Sidecar von `os_open_requested/handoff_confirmed/failed` im Rust-Host. Die sichtbare Version macht den tatsächlich ausgeführten Kandidaten prüfbar. Unit-, Frontend-, realer Paket- und native Starttests sichern die Spur. Sichtbarer RC105-Windows-UAT, macOS-Zielhost-UAT und spätere Konverter-/OCR-Ereignisse bleiben offen. | **in Arbeit** |
| BL-010.27 | Releasehygiene des Standalone-Piloten: Windows verwendet das vorhandene System-WebView2 ohne Laufzeitdownload; verständlicher Fehlhinweis und UAT bei fehlender Runtime. Rust-Toolchain für Builder exakt pinnen. Vor Endnutzerfreigabe alle ausgelieferten Rust-Crates komponentenweise lizenzprüfen und das SBOM mit belastbaren Lizenzwerten ergänzen. Native Dragdrop-Aufnahme ist E0 implementiert; echte Zielhost-Drop-/Fokusprüfung bleibt offen. Pause bleibt außerhalb der Istzusage. | **in Arbeit** |
| BL-010.28 | Zweite gleichwertige Standalone-Kernfunktion **Nur in Markdown umwandeln** (DS-085): derselbe komplette Workflow wie Anonymisieren, aber ohne PII-Ersetzung/-Review; Inhalte einschließlich Namen, Unternehmen, Kontakten und Tabellen bleiben erhalten. Dauerhafte Modusbindung, `DataSecure-Markdown/Lauf-…` mit Hinweis **nicht anonymisiert**, eine `.md` pro Quelle, eigene lokale Zuordnung, exakte Ergebnisöffnung, Abbruch/Fortsetzung und keine automatische KI-Übergabe. Die breite Formatliste bleibt verbindliches Ziel; Freigabe je nach belegter Coverage. Priorisierter Lieferplan und echte Abnahmekriterien unten. Im Piloten sichtbar, aber weiterhin deaktiviert. | **offen** |

DS-082 bindet dazu die lokale, nicht protokollierte Anzeige von Quellenordner,
Dateiauswahl und Ergebnisziel sowie die strikte Trennung des noch nicht
freigegebenen Nur-Konvertieren-Modus.

#### Verbindlicher Lieferplan für reine Markdown-Konvertierung (BL-010.28)

Diese Funktion wird nicht gestrichen oder durch eine reine Textvorschau ersetzt.
Reihenfolge nach dem laufenden Fehler-/UX-Schnitt; keine neuen doppelten Storys:

| Paket | Zuständige Story | Lieferung und Nachweis | Status |
|---|---|---|---|
| Modusvertrag | BL-010.28 | `markdown-only` und `markdown-and-anonymize` durch UI, Admission, Journal, Worker, Recovery und Export führen; ein offener Stapel kann den Modus nicht wechseln. Altjournale bleiben explizit im Anonymisierungsmodus. Negativtests für fehlenden/ungültigen Modus und Resume nach UI-Defaultwechsel. | offen |
| Inhaltstreue für direkte Formate | BL-010.28, BL-020.1 | TXT/Markdown/CSV/DOCX über denselben Offline-Parser aufnehmen; ohne Pseudonymisierung und ohne PII-Review. Positivfixtures behalten Personen, Firmen, IBAN und Tabellenwerte. Coverage-/Containerfehler ehrlich ausweisen; niemals einen abgeschnittenen Text als vollständige Konvertierung melden. | offen |
| Vollständige Ergebnisreise | BL-010.28, BL-040.5/6 | Getrennter identitätsgebundener Markdown-Zielbaum, atomarer Gesamtabschluss, eine `.md` je Quelle und Zuordnung; exakter Lauf öffnet sich. Kein Export in Anonymisierungsordner, kein Plugin-Handoff, keine automatische KI-Nutzung. Abbruch, Exportfehler, Zielwechsel, Namenskollision und Neustart mit echten Dateien prüfen. | offen |
| Breite Formate | BL-010.15–18 | Gepinnter gebündelter MarkItDown-/Konverterpfad für XLSX/PPTX, dann PDF und lokale OCR für Scan-PDF/Bilder; keine zusätzliche Installation beim Anwender. Pro Typ Inhalte und Auslassungen anhand unabhängiger Erwartungen prüfen. | offen |
| UX, Diagnose und Paketnachweis | BL-010.19/21/26/28 | Beide Modi gleich bedienen (Picker/Drop → Ziel → Start → Fortschritt → Ergebnis/Zuordnung), **nicht anonymisiert** dauerhaft sichtbar ohne Bestätigungsserie. Inhaltsfreie Ereignisse inkl. Modus/Coverage/Export, Rohwert-Sentinels in Logs. Reales Paket ohne Systemruntime mit beiden Modi, Crash/Resume und Mac-Zielhost testen. | offen |

### Aktueller produktübergreifender UX-/Konsistenzschnitt

BL-010.13: Der zweite native Gegencheck verhindert einen möglichen Zugriff
auf noch nicht registrierten Desktopzustand bei frühen Fensterereignissen.
Der Hook nutzt `try_state()` ausschließlich im Drop-Arm. Der erste native
RC106-Start war durch die Sandbox/WebView-Umgebung blockiert; dasselbe ZIP
bestand mit normalen Hostrechten. Der finale PKG-04-Neubau aus `17a2160` wurde
nachgewiesen (siehe CURRENT_STATE). Seine native Testdatenisolation war jedoch
unzureichend und ist Gegenstand des aktuellen Korrekturblocks; sichtbare
Zielhost-UAT bleibt offen.

| Befund / Verbesserung | Zugeordnet | Engineering-Status und verbleibende Evidenz |
|---|---|---|
| Kryptische Standalone-Pseudonyme und getrennte Firmenrollen erschweren das Lesen zusammengehöriger Dokumente. | BL-030.2, DS-084 | v2 für neue Standalone-Stapel: lesbare stabile Nummern, gemeinsame Unternehmensidentität, keine Umnummerierung von Altbeständen; Registry-/Journal-/Mehrformat-Recoverytests. Native fachliche UAT bleibt offen. |
| Ein Lookup gespeicherter Firmenbindungen befüllte die aktuelle Ersetzungsliste nicht; Folgedokumente konnten am Restgate stoppen. | BL-030.2, BL-002 | Gemeinsamer Fix für Plugin/v1 und Standalone/v2, echte Folgedokumenttests statt ausschließlich Registry-Assertions. |
| Dateien bequem hineinziehen, aber nie versehentlich sofort starten. | BL-010.12/13, DS-084 | Native Tauri-Aufnahme über bestehenden Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, klarer Start und Pickeralternative. Reale Dragdrop-/Fokus-UAT auf Windows/macOS offen. |
| Cowork-Abschluss öffnete noch den Oberordner und behauptete bei nicht verfügbarem Export trotzdem Ergebnisse. | BL-040.6, BL-041.10 | Privater stapelgebundener Presenter löst exakten Exportlauf auf; Text und Button teilen dieselbe Verfügbarkeitsbedingung. Allgemeiner MCP-Ordnerbefehl bleibt unverändert; Mappingnamen bleiben privat. Echte Finder-/Explorer-Anzeige bleibt UAT. |
| Nur-Konvertieren war im Zielbild zu schwach und in der UI zeitweise nicht sichtbar. | BL-010.28, DS-085 | Vision, Produktvertrag, Kanon, UML und maschinenlesbares Zielmodell binden die zweite Kernfunktion. Umsetzung bleibt ehrlich offen; kein unimplementierter Modus wird als freigegeben ausgegeben. |

### Zweiter unabhängiger Konsolidierungsreview 04.09.2026

Code-/Architektur- und Kanonreview wurden unabhängig durchgeführt und gegen die
aktuelle Herstellerdokumentation revalidiert. E0 geschlossen sind die
laufgebundenen Standalone-Zähler, der ehrliche `export_pending`-Zustand, Replay
offener Exporte beim Start/Ordnerwechsel, feste Zielbindung vor dem ersten
Teilexport, keine Cowork-Abschlussdialoge aus dem Standalone-Worker sowie der
UI-Reset nach verlorenem Sidecar-Admission. DS-078 korrigiert die frühere
Cloud-/Desktop-Brücken-Annahme. Der RC-Synchronisierer bindet nun auch Tauri-
Konfiguration, Rust-Paket, Zielartefaktnamen und alle aktuellen Standalone-
Nachweise; ein Vertragstest verhindert künftig gemischte Produktversionen.
Das dimensionsübergreifende Abschlussurteil mit der getrennten Evidencegrenze
für beide Produkte steht in
[`REVIEW_BEIDE_PRODUKTE_2026-09-04.md`](../REVIEW_BEIDE_PRODUKTE_2026-09-04.md).

#### Wiederholter Experten-Gegencheck RC99 – E0 geschlossen

Der unabhängige Core-/Security-, Cowork-/UX- und Standalone-/Plattformcheck
reproduzierte und schloss sieben Restdefekte: fehlende Prüfung einer verweigerten
globalen Lock-Freigabe an allen Transaktionsgrenzen, einen nach Snapshot-API-Drift
wirkungslosen Lock-Integrationstest, falsche offene Exportzähler nach Replayfehler,
falschen Fortsetzungserfolg ohne Executor-ACK, einen als „bereit“ verschluckten
All-stopped-Abschluss, unvollständige CLI-Zustandstexte sowie den fehlenden
Cloud-Sync-Hinweis in direkten MCP-Prompts. Produktive Texte verwenden jetzt den
dedizierten lokalen Ergebnisordner; Originale bleiben außerhalb verbundener
Cowork-Ordner. Zertifikatsfreie macOS-Piloten sind ausdrücklich ad-hoc signiert;
native Intel-/ARM-Builds und Gatekeeper-UAT bleiben unter BL-010.20/21 offen.
Zugeordnet: BL-002, BL-010.13/14/20, BL-011.8, BL-040.5/6, BL-041.7 und
BL-047.1. Die erneute fachliche und technische Revalidierung meldete keine
weiteren E0-Defekte in diesen Umfängen. Ein anschließender State-of-the-Art-
Quellcodecheck schloss außerdem falschen Exporterfolg bei nicht freigegebenem
Export-Claim, den doppelten Standalone-Journalscan, eine zu frühe Ledger-Aktion
im Mischstapel, den widersprüchlichen Reviewvertrag und einen timingabhängigen
Intake-Worker-Nachweis. Zugeordnet: BL-010.13/14, BL-011.8, BL-040.6,
BL-043.1 und BL-047.1. Der anschließende manuelle Zustandsmaschinencheck schloss
zusätzlich die erneute Reservierung eines bereits präsentierten historischen
Abschlussmarkers mit alter Reservierungs-ID; Regression unter BL-011.8 und
BL-041.10.

| Restbefund | Story | Prio | Nächste Lieferung |
|---|---|---|---|
| `get_public_state` rief Recovery- und jüngsten Stapelstatus über zwei synchrone Vollscans ab. | BL-047.1, BL-010.13 | erledigt | ein kombinierter Snapshot liest jedes Journal je Poll höchstens einmal; 1.000-Journal-Read-Count-Test grün, 100-Dateien-Zielhostbenchmark bleibt E1 |
| Ein offener Export-Outbox-Eintrag besitzt keinen exklusiven prozessweiten Claim. | BL-040.6 | erledigt | atomarer Claim serialisiert Terminalexport und Replay; Live-Claim und Wiederanlauf regressionsgetestet |
| „Ergebnisse öffnen“ öffnet den globalen Outputstamm statt exakt den aktuellen Lauf. | BL-010.13, BL-040.6 | erledigt | laufgebundene, inhaltsfreie Öffnen-Aktion verweigert unvollständige Läufe |
| Der lokale OS-Öffner meldete Erfolg vor dem asynchronen `spawn`-Ergebnis; `ENOENT` konnte danach den Sidecar beenden. Erfolgreiche Klicks hatten zudem keine sichtbare Rückmeldung und „Zuordnung öffnen“ öffnete nur einen Ordner. | BL-010.13, BL-010.26 | erledigt | absoluter plattformspezifischer Öffner, bestätigter `spawn`/behandelter Fehler, exakte Dateimarkierung unter Windows/macOS, inhaltsfreie Events und separater UI-Hinweis; echter RC103-UAT bleibt E1 |
| RC103 bestätigte den Explorer-Start, startete die ausdrücklich gewünschte Windows-Oberfläche aber mit `windowsHide:true`; dadurch konnte der Klick ohne sichtbares Fenster enden. | BL-010.13, BL-010.26 | erledigt | RC104 startet nur diesen OS-Öffner sichtbar; Shell bleibt aus, Umgebung allowlisted, asynchrones Start-Fail-closed bleibt erhalten |
| Standalone verwies für die Zuordnung auf die private globale Mappingdatei und legte keine verständliche laufbezogene Tabelle neben die Ergebnisse. | BL-010.13, BL-040.5, DS-083 | erledigt | `DataSecure-Zuordnung.csv` wird formelneutralisiert und atomar als letzter Bestandteil eines vollständigen Standalone-Laufs veröffentlicht; Cowork erhält wegen der Originalnamen keine solche Projektion; RC103-Records werden journalgebunden migriert |
| Der native Windows-Paket-Smoke startete die Tauri-Hülle versteckt; WebView2 konnte dadurch die Seiteninitialisierung aufschieben und einen falschen IPC-Timeout erzeugen. | BL-010.11, BL-010.25 | erledigt | Paketgate startet denselben sichtbaren Lifecycle wie das Produkt, wartet auf Page-/Frontend-/Core-/IPC-Nachweise und beendet nur seine eigene Instanz |
| Worker-Empfangsbestätigung lag vor dem dauerhaften ersten Stapelcheckpoint. | BL-011.8, BL-043 | erledigt | öffentliche Semantik trennt jetzt angenommene lokale Aufnahme (`checkpoint_pending`) vom erst später belastbaren Journalcheckpoint; ACK-/Crash-Negativtests sind grün |
| PID-Wiederverwendung konnte eine tote Executor-Lease als lebendig erscheinen lassen. | BL-011.11 | erledigt | Lease-Eigentum bindet PID plus gehashte Betriebssystem-Startidentität; tote, wiederverwendete und nicht sicher beobachtbare Eigentümer sind regressionsgetestet |
| Presenter-Start bewies keine sichtbare Abschlussdarstellung. | BL-041.10, BL-012.2 | teilweise erledigt | Standalone bestätigt erst nach Renderer-Paint; Windows-Cowork bestätigt das native `Shown`-Ereignis. Gleichwertiger macOS-Adapter und reale Windows-/macOS-Beobachtung bleiben E1 |
| Core-/Policy-Fingerprint und vollständige neutrale Core-API fehlen zwischen beiden Produkten. | BL-010.9, BL-010.23 | P1 | Plugin-Komposition entkoppeln und Golden-Korpus produktübergreifend binden |
| Dokumentkanon besaß keinen vollständigen maschinenlesbaren Index aller aktuellen Dokumentklassen. | BL-003.9 | erledigt | `DOCUMENT_INDEX.json` bindet Status, Geltungsbereich, Eigentümer, Supersession und Entscheidungen; Driftgate läuft in `test:docs` |

#### Expertenimplementierung 05.09.2026 – Prozessidentität, ehrliche Annahme und sichtbarer Abschluss

Der Core-/Security-, Cowork-/UX- und Standalone-/Plattformgegencheck wurde in
einem gemeinsamen E0-Schnitt umgesetzt:

- Eine Worker-Empfangsbestätigung bedeutet nur noch, dass die lokale Aufnahme
  angenommen wurde. Bis zum dauerhaften Journalcheckpoint lautet der öffentliche
  Zustand ausdrücklich `local_intake_accepted_checkpoint_pending`; weder Skill
  noch Server behaupten bereits laufende oder fortsetzbare Verarbeitung.
- Executor-Leases binden den Prozess an `PID + Betriebssystem-Startidentität`.
  Linux verwendet Boot-ID und Start-Ticks, Windows die Prozessstartzeit und
  macOS den nativen Prozessstart. Nur sicher tote oder nachweislich
  wiederverwendete Eigentümer werden verworfen; Beobachtungsfehler blockieren
  fail-closed.
- Die Standalone-Oberfläche zeigt Vorbereitung und anschließend passive,
  inhaltsfreie `erledigt/gesamt`-Zähler. Ein terminaler Hinweis gilt erst nach
  tatsächlichem Renderer-Paint und passender inhaltsfreier Generationsnummer als
  dargestellt; verspätete/doppelte ACKs sind inert, bei ausbleibender Bestätigung
  bleibt genau der bestehende Worker-Fallback zuständig.
- Der Windows-Cowork-Dialog bestätigt nicht mehr den PowerShell-Prozessstart,
  sondern sein natives `Shown`-Ereignis. Für macOS ist der gleichwertige native
  Sichtbarkeitsnachweis weiterhin mit BL-041.10/BL-051 auf dem Zielhost zu
  schließen; ein bloßer Windows-Test darf ihn nicht ersetzen.

Damit entstehen keine neuen Anwenderdialoge und kein Polling durch Claude.
Native Intel-/ARM-macOS-Build-, Gatekeeper-, Review- und Sichtbarkeitsevidenz
bleibt menschliche Zielhostabnahme unter BL-010.20/21, BL-012.9/10 und BL-051.

### P0 – einfacher lokaler Sammelreview nach DS-068

Der verbindliche Detailvertrag ist
[`contracts/BATCH_REVIEW_V2.md`](contracts/BATCH_REVIEW_V2.md). Die drei vom
Product Owner bestätigten Lieferungen sind E0 umgesetzt; Zielsystem- und
Anwenderevidenz bleibt ausdrücklich getrennt.

| Priorität / Story | Detaillierte Lieferung | E0-Abnahmekriterium | Status / Rest |
|---|---|---|---|
| 1 · BL-012.9 | Den bestehenden lokalen Sammelreview als einzigen Reviewweg behalten. Nur `deferred_review`-Dateien werden lokal rekonstruiert; Reviewtext bleibt in `stdin`/Speicher, Journal, MCP und Diagnose bleiben inhaltsfrei. Abbruch, Vertagung, Timeout und Teilpublikation bewahren vorhandene Ergebnisse. | ein begrenzter Reviewer-Aufruf je Prüfgruppe; keine Rohdaten in Argumenten/Metadaten; Negativ- und Teilabbruchtests grün | **E0 erledigt** · E1/E2 Windows/macOS offen |
| 2 · BL-012.10 | PII-Shield-Interaktionen sicher übernehmen: rot/gelb, direkte fachliche Aktionen, automatisch/bereits/jetzt/danach-Zähler, Rückgängig, exakte Gruppenaktion, eine Schlussfreigabe und Windows-Kürzel `Alt+Z`, `Alt+O`, `Alt+R`, `Strg+Enter`, `Esc`. | UI-Vertrag für Windows/macOS/Linux, Fortschrittsmodell und inhaltsfreie Projektion getestet | **E0 erledigt** · Fokus/A11y/Verständlichkeit E2 offen |
| 3 · BL-043.1 | Klare Dateien automatisch intern abschließen. Gemäß DS-079 bleibt der sichtbare Laufordner eines Mischstapels bis zum abgeschlossenen Review verborgen; vollständig klare Stapel öffnen keine Review-UI. Die Reviewgruppe enthält nur tatsächlich mehrdeutige Dateien. | vollständiger Klarstapel: null Reviewaufrufe und 100 Prozent abgeschlossen; Mischstapel: korrekte Zähler, nur offene Dateien im Review und kein sichtbarer Teillauf | **E0 erledigt** · beobachteter Cowork-Lauf E2 offen |

| Aus PII-Shield bewertete Idee | Entscheidung | Backlogfolge |
|---|---|---|
| farbliche Treffer und direkte Keep/Redact-Aktionen | jetzt lokal übernommen | BL-012.10 |
| Fundstellenfortschritt, Rückgängig, Tastatur und eine Schlussfreigabe | jetzt lokal übernommen | BL-012.10, BL-012.5 |
| nur unklare Dateien vorlegen, klare Dateien automatisch abschließen | jetzt umgesetzt | BL-043.1 |
| gleiche Entscheidung auf nachweislich identische Kontexte anwenden | jetzt, aber nur bewusst und exakt | BL-012.10, BL-032.1 |
| zusätzliche übersehene Bereiche frei markieren | im Einzelreview vorhanden; im Sammelreview erst nach positionssicherer Dokumentabbildung | spätere eigenständige Story, kein aktueller P0 |
| lokale HTML-/App-Oberfläche für Rohdaten | nicht in die inhaltsfreie MCP-Status-App mischen; nur als späterer vollständig lokaler Architekturentscheid | BL-042.3 bleibt status-only |
| reversible Mappings, Rohdaten im Browser/MCP, Laufzeitdownloads, automatisches Raten | nicht übernehmen | dauerhaftes Sicherheits-Nichtziel |

Entscheidungsbasis: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016,
DS-017, DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025,
DS-026, DS-027, DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034,
DS-035, DS-036, DS-037, DS-038, DS-039, DS-040, DS-041, DS-042, DS-043,
DS-044, DS-045, DS-046, DS-047, DS-048, DS-049, DS-050, DS-051, DS-052,
DS-053, DS-054, DS-055, DS-056, DS-057, DS-058, DS-059, DS-060, DS-061,
DS-062, DS-063, DS-064, DS-065, DS-066, DS-067, DS-068, DS-069, DS-070,
DS-071, DS-072, DS-073, DS-074, DS-075, DS-076, DS-077, DS-078, DS-079 und DS-080.
DS-081 ergänzt die hostgesteuerte MCP-Versionsaushandlung und schließt einen
künstlichen `MCP26-01`-Cutover aus.

## A. Eigenständig lieferbare Entwicklung

| Story | Lieferung | Status |
|---|---|---|
| BL-022.1 | WordprocessingML wird namespacegebunden ausgewertet. Unbekannte XML-Entities, fremde Relationship-Namespaces und fremde direkte Textknoten stoppen fail-closed; Kopf-/Fußzeilen werden nur über die tatsächlichen Dokumentreferenzen in kanonischer Reihenfolge gelesen und fehlende Referenzen blockieren. `gridSpan`/`vMerge` stoppen statt Spalten zu verschieben. Offen bleiben echte Word-/LibreOffice-/`python-docx`-Pakete, realistische Kommentare und eine konsistente AlternateContent-Policy. | **in Arbeit** |
| BL-024.2 | Der Engineering-Portable-Build übernimmt das verifizierte Universal-OCR-Bundle vollständig. Geschlossene Manifest-/Inventar-/Modus-/Hashgates, Installationspfade mit Leerzeichen, Adapter-Timeout und laufender Abbruch sind regressionsgetestet; der SEA-Engineering-Build behält das belegte OCR-Testbundle. Offen bleiben die kohärente Aufnahme in freizugebende Produktziele, ein nicht allein per Manifest aktivierbares Produktgate und ein echter Paket-zu-Adapter-zu-OCR-End-to-End-Test. PNG/JPEG/BMP-Freigabe bleibt getrennt BL-024.3. | **in Arbeit** |
| BL-042.3 | Inhaltsfreie Status-App um terminale bounded Zustände, vollständige Textfallback-Matrix und automatisierte Browser-/A11y-/DE-EN-DOM-Gates ergänzen. Der Windows-/CWD-unabhängige reproduzierbare Build sowie beide zulässigen Varianten für „Stapel läuft bereits“ sind korrigiert und regressionsgetestet. | **in Arbeit** |
| BL-042.4 | Gemäß DS-074 UML-basierte Supportdiagnose: separate manuelle Debug-ZIP-Variante, gleicher Enginepfad, geschlossene JSON-Ereignisse an MCP-, Picker-, Worker-, Review- und Exportgrenzen. Fach-, Workflow- und Supportdiagnose verwenden dieselbe mehrprozesssichere Einzelereignis-Komponente; Alters- und Mengengrenzen werden physisch bereinigt, historisches JSONL bleibt nur lesbarer Upgradebestand. Keine Rohkommunikation und keine Wirkung auf Freigaben. E0 ist erledigt; echter Cowork-Supportlauf bleibt E1. | **in Arbeit** |
| BL-040.6 | Sichtbaren Export je Lauf und Zielunterordner identitätsgebunden serialisieren; ein Prozessclaim verhindert konkurrierende Record-Schreiber, ein ausgetauschter `DataSecure-Output` stoppt den Restexport, und lokale Öffnen-Aktionen wählen nur den vollständig abgeschlossenen aktuellen Lauf. Mischstapel bleiben gemäß DS-079 bis zum Gesamtabschluss unsichtbar. | **erledigt** |
| BL-003.9 | Maschinenlesbarer Dokumentindex mit Klasse, Status, Produktgeltung, Eigentümer, Versionsregel, Ablösung und Backlogbindung; Driftgate prüft Existenz, Eindeutigkeit und Kanonvollständigkeit. | **erledigt** |

### Offene Restbefunde aus dem Gesamtgegenreview 02.09.2026

Belegte, nicht behobene Befunde des Claude-Code-Gesamtgegenreviews (Bericht
`tasks/archiv/2026-09-03-claude-code-gesamtreview-bericht-rc86.md`). Sie sind ihren bestehenden
Storys zugeordnet und keine neuen Storys; Unterredaktion wiegt schwerer als
Komfort.

| Befund | Story | Prio | Rest |
|---|---|---|---|
| Liveness nur über `kill(pid, 0)`: eine wiederverwendete PID ließ eine tote Executor-Lease „lebendig“ wirken. | BL-011.11 | erledigt | PID plus OS-Prozessstartidentität implementiert; reale Crash-/macOS-Evidenz bleibt in Abschnitt B |
| Unicode-Kompatibilitätsvarianten (Fullwidth `＠`/Ziffern, Dot-Leader) umgehen E-Mail-/IBAN-/Telefon-Detektoren und Residual-Gate; `CONTACT_URI_RE` frisst ohne Trennzeichen angrenzenden Text (Überredaktion). | BL-021.1 | P3 | NFKC-/Confusable-Regel für Erkennung und Residual-Gate ohne Fachinhaltsverlust |
| Support-Review `review_deferred_document_batch` rekonstruiert Rohtext im MCP-Hauptprozess ohne `network-deny`. | BL-020.3 | P3 | Supportweg über den detached Review-Worker leiten oder als Ausnahme im Netzwerkvertrag dokumentieren |
| Ein nach ACK-Timeout gestoppter Intake lässt bereits kopierte Arbeitskopien bis zum Intent-Ablauf liegen. | BL-011.8 | P3 | toten Intake-Owner ohne Journal sofort bereinigen |
| `visibleResultTreeOverlaps` ohne Cache (Realpath je Datei und Wurzel). | BL-044.1 | P3 | Quantifizierung auf Referenzhardware; Cache nur bei belegtem Bedarf |
| Skill-Evals und MCPB-Manifest ohne DS-069-Fälle (Ordnerwechsel, Reset, `result_folder_required`, Sync-Hinweis). | BL-041.10 | P3 | Eval-Fälle ergänzen; MCPB bleibt Engineering-only |
| `test:product` (Profil `full`) startet über den Picker-Lifecycle-Test reale, fensterlose PowerShell-Prozesse (nur Windows, zeitbegrenzt). | BL-002 | P3 | akzeptiert; bei Bedarf in ein Windows-Only-Gate auslagern |
| Zwei parallel gepflegte Allowlists (`diagnostic-causes.js` `CAUSES` und `workflow-diagnostics.js` `ERROR_CODES`); IPC-Ack-Klassifikation über festen Fehlertext statt `.code` (Review rc90, kein Abfluss). | BL-041.1 | P3 | eine gemeinsame Codeliste; `.code` an den beiden festen IPC-Fehlern |

### Restbefunde aus UML-, Architektur-, UX- und Fehlergegencheck 04.09.2026

Die UML-Prüfung hat die Zustandsmodelle von Dokumentposition, abgeleiteter
Stapelphase und kurzlebiger Reservation getrennt. Sechs technische Defekte sind
E0 geschlossen: Setupdialoge erst nach Readiness-/Aktivitätsprüfung,
zweckspezifische Pickerfehler, mehrprozesssichere und physisch bereinigte
Diagnoseereignisse sowie exklusive Ergebnisveröffentlichung ohne
Überschreibungsrennen, eine begrenzte JSON-RPC-Frameaufnahme und die wieder
aus der kanonischen Protokolldatei erzeugte MCPB-Engineering-Metadatenprojektion.
Das veraltete Marketplace-Einzeldateiartefakt wird beim Build entfernt. Die folgenden Punkte bleiben echte Lieferungen und werden
nicht durch Diagramme als erledigt dargestellt:

| Befund | Story | Prio | Nächste Lieferung |
|---|---|---|---|
| Der Abschluss galt nach erfolgreichem Presenter-Start als übernommen, nicht erst nach einer belegten sichtbaren Darstellung. | BL-041.10, BL-012.2 | teilweise erledigt | Standalone-Renderer-Paint und Windows-`Shown` stehen E0; macOS-Adapter und E1-Cowork-Beobachtung bleiben offen |
| Der Ergebnisstamm ist eine ausdrückliche geräte- und produktlokale Einstellung. Cowork stellt dem MCP keinen belastbaren aktuellen Workspacepfad bereit; DataSecure darf ihn nicht erraten. | BL-040.5 | entschieden | DS-080: Ziel beim Start identitätsgebunden an den Stapel binden; Änderung nur über „Ergebnisordner ändern“, keine Rückfrage und kein heimlicher Wechsel pro Projekt oder Lauf |
| `MCP26-01` ist keine offizielle Protokollversion; ein harter Wechsel würde ältere Claude-Hosts ohne Produktnutzen ausschließen. | BL-041.8 | entschieden | DS-081: moderne Version `2026-07-28` und getestete Legacy-Pfade hostgesteuert aushandeln; keine Nutzereinstellung, keine vollständige Konformitätsaussage ohne offizielle Conformance-Evidence |
| Klare Positionen eines Mischstapels sind intern dauerhaft, der sichtbare Export wartet auf den terminalen Gesamtstapel. | BL-043.1, BL-040.6 | entschieden | DS-079 behält die terminale sichtbare Semantik ausdrücklich bei; E0-Negativtest verhindert Teillauföffnung |
| Windows besitzt einen echten Sammelreview; macOS/Linux verwenden weiterhin einzelne modale Entscheidungen. | BL-012.9, BL-012.10 | P1 | ein gemeinsames Review-View-Model und je freigegebenem Zielhost genau ein lokaler Sammeladapter; einzelne Dialoge bleiben Engineering-Fallback, nicht Produktweg |
| „Ergebnisse öffnen“ öffnete den Output-Stamm statt zwingend den aktuellen Lauf. | BL-010.13, BL-040.6 | erledigt | exakter vollständiger `Lauf-*`-Ordner wird im vertrauenswürdigen Prozess auf allen unterstützten Shellpfaden geöffnet; Zielhostbeobachtung bleibt E1 |
| Ein offener Export-Outbox-Eintrag besaß keinen exklusiven prozessweiten Claim. | BL-040.6 | erledigt | Replay und Terminalexport sind über atomaren Claim serialisiert; Live-Claim, Zielaustausch und Wiederanlauf sind regressionsgetestet |
| Die Worker-Empfangsbestätigung belegt validierte Nachrichtenannahme, aber noch keinen dauerhaften ersten Stapelcheckpoint. | BL-011.8, BL-043 | erledigt | öffentlicher Zustand benennt bis zum Checkpoint ausdrücklich `checkpoint_pending` |
| Lange Standalone-Stapel besaßen keine passive lokale Fortschrittsanzeige. | BL-012.6, BL-042.3 | erledigt | inhaltsfreie Vorbereitung und monotone Zähler laufen im bestehenden Fenster ohne Polling durch Claude; E2-UX bleibt offen |
| Skill und Server spiegeln Teile der Zustandsentscheidung und können sprachlich oder logisch auseinanderlaufen. | BL-041.1 | P3 | Skill auf Intent/Toolwahl begrenzen, Serverantwort als einzige Zustandswahrheit kontraktprüfen |
| GitHub-synchronisierte Organisations-Marketplaces unterstützen die zuvor erzeugte `archive`-Quelle nicht. | BL-010.8 | erledigt | Build und Dokumentation erzeugen ausschließlich die selbsttragende relative Git-Projektion; Veröffentlichung und Zielhost-UAT bleiben menschliche Evidenz |
| DataSecure kann verbundene Cowork-Ordner nicht auslesen und damit die Trennung von Quellen und Ergebnisziel nicht technisch attestieren. | BL-040.5, BL-041.7 | entschieden | ehrliche Setup-/UAT-Regel: nur dedizierten Ergebnisordner verbinden, Quellordner nicht verbinden; keine zusätzliche Laufbestätigung |
| Nativer Standalone-Admission-Pfad prüfte die 500-MiB-Gesamtgrenze nicht und eine verlorene Worker-Bestätigung ließ dieselbe Auswahl erneut starten. | BL-010.12, BL-011.10 | erledigt | Gesamtbudget vor Start, einmaliger Verbrauch nach delegiertem Start und Regressionstests |
| Ein neuerer aktiver Standalone-Stapel verdeckte den jüngsten vollständig sichtbaren Ergebnislauf. | BL-010.13, BL-040.6 | erledigt | Status bleibt auf dem neuesten Stapel, „Ergebnisse öffnen“ sucht getrennt den neuesten tatsächlich sichtbaren Lauf |
| Tauri und Node-Sidecar hatten abweichende Pfadbudgets und die UI besaß `core:default`. | BL-010.12, BL-010.15 | erledigt | identische UTF-8-Einzel-/Gesamtbudgets, nicht-UTF-8 fail-closed und nur explizite DataSecure-Kommandorechte |
| Atomare Journalpublikation erkennt viele Austauschfälle, kann aber ohne betriebssystemweites CAS keinen feindlichen gleichzeitigen Austausch durch denselben lokalen Benutzer ausschließen. | BL-011.8, BL-011.11 | P3 | bewusst außerhalb des aktuellen lokalen Vertrauensmodells; für ein später verschärftes Modell immutable Generationen oder nativen No-Replace-/CAS-Vertrag entwerfen, ohne Anwenderdialog |

## B. Technisch vorbereitet – menschliche Evidenz offen

| Story | Noch erforderlicher Nachweis | Status |
|---|---|---|
| BL-010.8 | Selbsttragende Runtime und drei Zielpaketprojektionen sind E0 fertig; reale macOS-Intel-/ARM-Ausführung und Cowork-Fresh-Install fehlen. Der Build erzeugt die von Anthropic unterstützte selbsttragende Git-Marketplace-Projektion mit relativer Quelle. Vor einer Freigabe fehlen Veröffentlichung in einem privaten/internen Marketplace-Repository sowie Installation und Update auf den Zielhosts. | **blockiert** |
| BL-010.7 | Lokale Cowork-Sitzung eines bestehenden Desktop-Deployments mit Plugin-MCP positiv sowie Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – negativ für Originale prüfen. | **blockiert** |
| BL-010.1 | Portablen Pluginstart auf jedem freizugebenden Zielsystem ohne vorinstallierte Runtime nachweisen; Windows-E0 ist grün, macOS und echter Cowork-Host fehlen. | **blockiert** |
| BL-010.2 | Windows-x64 Fresh Install, Kernlauf, Update und Entfernen. | **offen** |
| BL-010.3 | macOS Intel/ARM Fresh Install, Kernlauf, Quarantäne und Entfernen. | **offen** |
| BL-010.6 | Upgrade und Rollback mit unveränderten Quellen und synthetischen Daten. | **offen** |
| BL-011.3 | Mehrere pausierte Stapel und stabilen Pseudonymkontext real prüfen; kein Keyring. | **blockiert** |
| BL-011.6 | Größen- und Ressourcenstopps auf Windows und macOS beobachten. | **blockiert** |
| BL-011.7 | Abbruch, Fortsetzung und Zähler in echter Cowork-Bedienung verstehen lassen. | **blockiert** |
| BL-011.9 | POSIX-Supervisor auf realen macOS-Zielen unter Last und Abbruch nachweisen. | **blockiert** |
| BL-011.11 | Crash-/Dateisystemverhalten auf realen Zielsystemen prüfen. | **blockiert** |
| BL-011.12 | Adaptive Mehrprozessvorbereitung erst nach Windows-/macOS-Ressourcennachweis aktivieren. | **blockiert** |
| BL-011.13 | Plain-Arbeitskopien, Review und Fortsetzung auf Zielsystemen abnehmen; kein Schlüsselbundtest. | **blockiert** |
| BL-012.2 | Abschluss-, Review-, Resume- und Stopmeldungen beobachtet abnehmen. | **blockiert** |
| BL-012.3 | Vertagten Review nach Neustart ohne neue Dateiauswahl fortsetzen. | **blockiert** |
| BL-012.5 | Tastatur, Zoom, Screenreader und Fokus auf Windows/macOS prüfen. | **blockiert** |
| BL-012.6 | Alltagssprache und genau eine nächste Aktion mit fachfremden Personen prüfen. | **blockiert** |
| BL-012.7 | Kernaufgabe ohne technische Hilfe in höchstens drei bewussten Aktionen abschließen. | **blockiert** |
| BL-012.8 | macOS-Reviewdialog mit echtem `osascript` und Fresh Install prüfen. | **blockiert** |
| BL-012.9/10, BL-043.1 | Vereinfachten Sammelreview und automatischen Klar-Datei-Pfad in echter lokaler Cowork-Sitzung auf Windows/macOS beobachten; prüfen, dass klare Dateien keinen Dialog öffnen und die inhaltsfreien Zähler verstanden werden. | **blockiert** |
| BL-021.1 | TXT/Markdown auf Windows und macOS im installierten Produkt abnehmen. | **blockiert** |
| BL-021.2 | CSV-Dialekte und fachlichen Inhalt auf Windows/macOS abnehmen. | **blockiert** |
| BL-031.1 | Zertifikats-/Organisationskontext durch IT-/Health-IT-Fachvertretung prüfen. | **blockiert** |
| BL-032.1 | Mehrdeutigkeitsdialog auf Windows/macOS verständlich und konsistent abnehmen. | **blockiert** |
| BL-041.1 | Beide Skills in echter Claude-UI gegen denselben Jobvertrag prüfen. | **blockiert** |
| BL-041.2 | Ursprüngliche Aufgabe nach Abbruch begrenzt und verständlich fortsetzen. | **blockiert** |
| BL-041.3 | Chat-Upload eines synthetischen Originals muss sicher zum lokalen Picker umleiten. | **blockiert** |
| BL-041.4 | Spracheingabe und direkte Skillauswahl müssen denselben Ablauf starten. | **blockiert** |
| BL-041.5 | 100 Dateien/500 MiB, Neustart und Fortsetzung in Cowork abnehmen. | **blockiert** |
| BL-041.6 | Reine Anonymisierung endet lokal ohne Polling oder automatisches Ergebnislesen. | **blockiert** |
| BL-041.7 | Werkzeugberechtigungen, Pickerabbruch und Ergebnisübergabe in aktueller Cowork-Version prüfen. | **blockiert** |
| BL-041.8 | Den ausgelieferten Pluginserver mit der offiziellen MCP-Conformance-Prüfung gegen `2026-07-28` belegen. MCP-Tasks/Benachrichtigungen zusätzlich versions- und zielhostgebunden prüfen; ohne jeweiligen Nachweis kein Produktpfad und keine vollständige Konformitätsaussage. | **blockiert** |
| BL-041.9 | Den automatischen Übergang vom Hintergrundstapel in genau einen nicht blockierenden Sammelreview sowie „Später“, Abschluss und Wiederaufnahme auf Windows/macOS beobachten. | **blockiert** |
| BL-041.10 | Die gelieferte einmalige Ergebnisordnerwahl, Wiederverwendung ohne neue Abfrage, Ordnerwechsel, begrenzten Hintergrund-Replay und „Ergebnisse öffnen“ in echter Cowork-Bedienung auf Windows/macOS abnehmen. Beobachtung 03.09.2026 (Windows, rc85): Cowork beendet den MCP-Elternprozess kurz nach der Tool-Antwort; die Abschlussmeldung erschien in 4 von 5 Läufen nicht. Seit der zweiphasigen Eltern-/Worker-Übernahme (E0) ist nativ zu belegen, dass bei Elternprozessende oder Presenterfehler genau ein Fenster erscheint. | **blockiert** |
| BL-044.1 | Rekursive Ordnerquelle mit Link-/Race-Gegenproben auf Zielsystemen prüfen. | **blockiert** |
| BL-049.1 | Format-/Strukturgates und Ergebnisgrade durch Security auf Zielsystemen abnehmen. | **blockiert** |
| BL-050.3 | Referenzwerte und reales Dateisystem-/Power-Loss-Verhalten erfassen. | **blockiert** |
| BL-051.1 | Plugin-ZIP auf Windows x64 und macOS Intel/ARM frisch installieren. | **offen** |
| BL-051.2 | Erst nach Bereitstellung der selbsttragenden Marketplace-Projektion: privaten Marketplace auf Windows/macOS installieren, aktualisieren und entfernen. | **offen** |
| BL-051.3 | Versionneuen UAT-Serienlauf mit 100 Dateien und bis zu 500 MiB durchführen. | **offen** |
| BL-051.4 | Produktrollback auf Windows/macOS abnehmen. | **offen** |
| BL-051.5 | ZIP-/Marketplace-Lebenszyklus in Cowork real abnehmen. | **offen** |
| BL-051.6 | Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – sowie lokale Desktop-Sitzung ohne MCP negativ auf Originalzugriff prüfen. | **blockiert** |
| BL-052.1 | Beobachtete Anwenderabnahme mit dem aktuellen UAT-Kit durchführen. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit fachfremden Nutzenden abnehmen. | **offen** |
| BL-052.5 | Architektur und lokale Sicherheitsgrenze vor breitem Rollout freigeben. | **offen** |

„Blockiert“ bedeutet hier: Die Implementierung oder E0-Vorbereitung ist vorhanden,
aber eine reale Zielplattform, Claude-Version oder benannte Fachperson ist für den
Abschluss erforderlich. Es ist kein verdeckter Entwicklungsauftrag.

## Release-Evidence-Verträge

- **PKG-04:** Zwei unabhängige, jeweils mit leerem Cargo-Buildzustand erzeugte
  Windows-x64-Pakete desselben sauberen `main`-Commits müssen als ZIP sowie bei
  Desktop- und Core-Binary bytegleich sein. Beide Archive bestehen Manifest-,
  Modus-, SBOM-/Summen-, echten Worker-Handoff- und nativen Start-Smoke. Das
  Receipt nennt Commit, Tree, Toolchain und alle drei Hashes.
- **INT-13:** Eine Integrationsbindung darf erst nach bestandenem PKG-04
  entstehen und referenziert unveränderlich Commit, Kandidat, Archivhash und
  PKG-04-Receipthash. Ein Stage-Verzeichnis, `latest` oder nur eine Versionsnummer
  sind keine gültige Bindung. Zielhost-UAT bleibt davon getrennt offen.

## C. Spätere Format- und Plattformausbaustufen

| Story | Lieferung | Status |
|---|---|---|
| BL-010.4 | Linux-Paket nach dem Windows-/macOS-Erstrelease mit eigener Hostevidenz liefern. | **offen** |
| BL-022.2 | XLSX erst nach vollständiger Formel-, Kommentar-, Chart- und Relationship-Coverage freigeben. | **offen** |
| BL-022.3 | PPTX erst nach vollständiger Folien-, Master-, Notiz-, Chart- und Objekt-Coverage freigeben. | **offen** |
| BL-023.1 | PDF-/OCR-Risikogate bis zur vollständigen Pflichtmatrix als NO-GO erhalten. | **in Arbeit** |
| BL-023.2 | Text-PDF nur nach vollständiger Parser-/Render-/Security-Coverage freigeben. | **offen** |
| BL-023.3 | PDF-Formulare, Annotationen, Anhänge, Signaturen und Verschlüsselung absichern. | **offen** |
| BL-023.4 | Scan-PDF und visuelle Coverage vollständig absichern. | **offen** |
| BL-024.3 | PNG, JPEG und BMP erst nach Decoder-, OCR-, Metadaten- und Pixelredaktionsnachweis freigeben. | **offen** |

## Epics

### BL-010 – Plattform und Distribution
### BL-003 – Product Vision und Dokumentenkanon
### BL-001 – Dokumentensystem und Wiederverwendung
### BL-002 – Ist-/Zielvertrag und Drift
### BL-011 – Sicherer fortsetzbarer Stapelkern
### BL-012 – Nutzerreise und lokaler Review
### BL-020 – Gemeinsame Inhaltsgrenze
### BL-021 – Text und CSV
### BL-022 – OOXML-Formate
### BL-023 – PDF-Risikogate
### BL-024 – OCR und Rasterbilder
### BL-030 – Profil und Pseudonyme
### BL-031 – Zertifikats- und Fundstellenkontext
### BL-032 – Mehrdeutigkeit
### BL-040 – Lokaler Export und Nachweis
### BL-041 – Claude-Übergabe
### BL-043 – Cowork-Fast-Path
### BL-044 – Sichere Datei- und Ordnerquellen
### BL-047 – Performance und Ressourcensteuerung
### BL-049 – Inhalts- und Formatgrenze
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme

Erledigte Arbeiten zu BL-001/002/003/040/043 sowie abgeschlossene E0-Scheiben
stehen ausschließlich in `BACKLOG_ARCHIVE_2026-08.md` und
`BACKLOG_ARCHIVE_2026-09.md`.
