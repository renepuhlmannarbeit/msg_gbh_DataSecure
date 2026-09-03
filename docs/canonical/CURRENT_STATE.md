# Aktueller Iststand

Stand: 03.09.2026 · 3.2.0-rc91 · Git-Arbeitsstand nach Tabellen-Labelgate, Handoff-Antworttexten und Abschlussfenster-Diagnose

## Produkt in einem Satz

DataSecure ist ein lokal arbeitendes Claude-Plugin für die De-Identifizierung von
Geschäftsdokumenten. Originale werden ausschließlich über einen lokalen
Betriebssystemdialog gewählt und niemals automatisch verändert oder gelöscht. Nur
freigegebene, de-identifizierte Markdown-Ergebnisse dürfen Claude erreichen.

## Belegter Produktumfang

- Anwenderkanal heute: das zielsystemspezifische, selbsttragende Plugin-ZIP.
  Der private Marketplace ist der gleichwertige Zielkanal (DS-002/DS-067), aber
  noch nicht freigegeben: Der aktuelle Marketplace-Quellordner startet mit
  `command: node`, enthält den gesperrten OCR-Engineering-Baum (rund 57 MiB,
  über dem 50-MB-Limit) und keine gebündelte Runtime. Die selbsttragende
  Marketplace-Projektion bleibt offene Arbeit unter BL-010.8/BL-051.2.
- MCPB: internes Engineering-Artefakt, kein Installations-, Fallback- oder
  Supportweg für Anwender.
- Freigegebene Eingaben: TXT, Markdown (`.md`, `.markdown`), CSV und DOCX.
- Sicher gesperrt: XLSX, PPTX, PDF, Scan-PDF und eigenständige Bilder.
- Stapel: höchstens 100 Dateien und 500 MiB; nur ein aktiver Stapel.
- Bilder aus DOCX: Pixel bleiben lokal; kein auswählbarer Bildmodus und keine
  Freigabe über Claude.
- Speicherung: lokale Plain-Arbeits- und Reviewkopien ohne Schlüsselbund,
  Passwort oder zusätzliche Verschlüsselung.
- Aufbewahrung: konfigurierbar 0–14 Tage nur für temporäre DataSecure-Arbeits-
  und Reviewdaten. Quellen/Originale und fertige Exporte werden niemals
  automatisch gelöscht.
- Ergebnis: Markdown pro freigegebener Datei plus dauerhaft lokale
  `DataSecure-Mapping.csv`; rekursive relative Labels und gleiche Basenames aus
  unterschiedlichen lokalen Ordnern bleiben darin kollisionsfrei unterscheidbar.
- Sichtbarer Cowork-Export: Beim ersten Lauf wird ein Ergebnisordner einmal lokal
  gewählt, die Output-Anlage geprüft und das Ziel erst danach identitätsgebunden
  gespeichert. Nur verifiziertes Markdown mit
  neutralen Namen gelangt nach `DataSecure-Output/Lauf-…`; Mapping, Originale,
  Review und Recovery bleiben privat. Nur ein fehlgeschlagener Export wird lokal
  vorgemerkt und beim nächsten Start oder Ordnerwechsel genau einmal nachgeholt.
  Jede einmal geschriebene Ergebnisdatei ist endgültig, auch wenn ein anderes
  Item desselben Laufs noch offen ist: vom Anwender gelöschte oder bearbeitete
  sichtbare Ergebnisse werden weder überschrieben noch wiederhergestellt, und ein
  späterer Ordnerwechsel spiegelt keine früheren Läufe in den neuen Ordner. Der
  Outputbaum ist als rekursive Quelle gesperrt.

## Claude-/Cowork-Grenze

Der lokale Plugin-MCP kann nur in einer **lokalen** Claude-Desktop-/Cowork-
Ausführung oder in Claude Code genutzt werden, die lokale Plugin-MCPs tatsächlich
startet. Cloud-Sitzungen – auch in Desktop, Web oder Mobil – erhalten keinen
Originalzugriff; eine Dateibrücke wäre kein lokaler DataSecure-Lauf. Die lokale CLI 2.1.233 validiert
Quellplugin und Marketplace streng; das ist kein Fresh-Install- oder
Cowork-Laufnachweis. Die offizielle aktuelle Hostdokumentation wird vor jeder
Freigabe erneut geprüft.

## Teststand

Manifest-, Retention-, Architektur-, Format-, Picker-, Handoff-, Recovery-,
Gateway- und Dokumentenverträge sind automatisiert. Das vollständige historische
Testjournal liegt unter
[`docs/archive/2026-09/testing`](../archive/2026-09/testing/TESTING_HISTORY_THROUGH_RC84.md).
Aktuelle Testklassen und Befehle stehen in [`docs/TESTING.md`](../TESTING.md).
Automatisierte Tests ersetzen keine Windows-/macOS-Fresh-Install-, Cowork-, UX-,
Accessibility-, Security- oder Fachabnahme.

## Backlog-Ist je Epic

### BL-010 – Plattform und Distribution
ZIP/Marketplace sind der Produktkanal. Die selbsttragende Node-22.23.2-Runtime
ist für Windows x64 sowie macOS Intel/ARM gebaut, hash-/architekturgebunden und
paketvertraglich geprüft. Ein reales Windows-Paket startete ohne System-Node;
reale Cowork-Fresh-Install- und macOS-Nachweise bleiben offen. Linux ist kein
aktuelles Cowork-Produktziel.

### BL-003 – Product Vision und Dokumentenkanon
Vision und Kanon sind eingerichtet. Diese Konsolidierung trennt aktuelle Quellen
von historischer Evidence.

### BL-001 – Dokumentensystem und Wiederverwendung
Ein aktives Backlog, ein Register und ein Archivindex sind vorhanden.

### BL-002 – Ist-/Zielvertrag und Drift
Aktuelle Aussagen werden durch Dokumenten- und Capabilitytests geprüft; weitere
semantische Driftgates werden in diesem Schnitt ergänzt.

### BL-011 – Sicherer fortsetzbarer Stapelkern
Intake, identitätsgebundene Checkpoints/Cleanup, Resume, Mapping, Ergebnisse,
Retention und neustartfeste stapelweite HMAC-Pseudonyme sind E0-implementiert.
Zielsystem- und echte Crash-/Dateisystemnachweise bleiben offen. Eine atomare,
prozessübergreifende Intake-Reservierung sperrt bereits den Pickerstart und bleibt
bis zum dauerhaften Stapelcheckpoint bestehen. Sie kann sicher an den Worker
delegiert werden; verwaiste Eigentümer werden fail-closed behandelt und ein echter
Zwei-Prozess-Test lässt genau eine Aufnahme zu. Reale Cowork-Messungen auf
Windows/macOS bleiben BL-011.10.

### BL-012 – Nutzerreise und lokaler Review
Ein Pickerstart und ein gebündelter lokaler Review sind implementiert. Klare
Dateien umgehen den Review vollständig; Mischstapel schließen klare Positionen
vorher ab und legen nur mehrdeutige Dokumente lokal vor. Der Review zeigt
inhaltsfreie Fortschrittszähler, rot/gelbe Fundstellen, direkte
Beibehalten-/Anonymisieren-Aktionen, Rückgängig, exakte Gruppenaktionen und auf
Windows Tastaturkürzel. Reale UX-, macOS- und Accessibility-Abnahme bleibt offen.

### BL-020 – Gemeinsame Inhaltsgrenze
Content-Graph und rekursive Sicherheitsgrenzen existieren, sind aber noch nicht
für alle Zielcontainer vollständig.

### BL-021 – Text und CSV
TXT/Markdown/CSV sind im Produktallowlist; reale Zielsystemabnahme bleibt offen.

### BL-022 – OOXML-Formate
DOCX ist im Produktallowlist und für die bisher belegten Strukturen fail-closed
gehärtet. Die Auswertung ist an die tatsächliche WordprocessingML-Namespace-URI
gebunden; unbekannte XML-Entities, fremde Relationship-Namespaces und fremde
direkte Textknoten stoppen. Kopf-/Fußzeilen werden ausschließlich über die
tatsächlichen Dokumentreferenzen in kanonischer Reihenfolge gelesen. Offen bleiben
reale Office-Interoperabilitätsfixtures sowie die vollständige Kommentar-/
AlternateContent-Abdeckung. XLSX und PPTX bleiben gesperrt.

### BL-023 – PDF-Risikogate
PDF und Scan-PDF bleiben ohne vollständige Pflichtmatrix sicher gesperrt.

### BL-024 – OCR und Rasterbilder
Engineering-Komponenten und Harnesses existieren. Der Portable-Engineering-Build
übernimmt das verifizierte Universal-OCR-Bundle vollständig; dessen geschlossenes
Manifest und Inventar, Modi, Hashes, Installationspfade mit Leerzeichen sowie
Adapter-Timeout und laufender Abbruch sind E0-geprüft. Die
Aufnahme in freizugebende Produktpakete und ein Paket-End-to-End-Nachweis fehlen
noch. Eigenständige Bilder sind nicht freigegeben; Bildpixel aus DOCX bleiben lokal.

### BL-030 – Profil und Pseudonyme
Ein neustartfester stapelweiter HMAC-Kontext ohne Keyring, Keyfile oder zusätzliche
Verschlüsselung ist E0-implementiert. Echte Cowork-/OS-Fortsetzung bleibt offen.

### BL-031 – Zertifikats- und Fundstellenkontext
Kontextregeln schützen Zertifizierungsanbieter und Fachbegriffe; Fachevidenz mit
unterschiedlichen Vorlagen bleibt offen.

### BL-032 – Mehrdeutigkeit
Unklare Organisationen stoppen zur lokalen Prüfung. Plattformgleiche Bedienabnahme
fehlt.

### BL-040 – Lokaler Export und Nachweis
Mapping und inhaltsfreie Nachweise sind implementiert; Quellen bleiben unverändert.
BL-040.5 ergänzt den einmalig gewählten Cowork-Ergebnisordner. Der Export prüft
das Paket erneut, schreibt ausschließlich Markdown atomar unter neutralem Namen
und bietet im lokalen Abschluss „Ergebnisse öffnen“. Der MCP erhält weder Zielpfad
noch Mapping. Die erfolgreiche MCP-Startantwort wartet höchstens fünf Sekunden auf
die ausdrückliche, inhaltsfreie Empfangsbestätigung des Intake-Workers; Timeout,
Worker-Exit vor der Bestätigung und Abbruch räumen die Aufnahme fail-closed auf. Reale
Windows-/macOS-Cowork-Abnahme bleibt offen.

### BL-041 – Claude-Übergabe
Nur verifizierte Markdown-Ergebnisse werden begrenzt übergeben. Reale
Berechtigungs-, Skill- und Hostabnahme bleibt offen.

### BL-043 – Cowork-Fast-Path
Der Normalweg endet nach einem lokalen Start ohne Polling. Ergebnisse werden erst
auf späteren ausdrücklichen Auftrag gelesen. Ein vollständig klarer Stapel öffnet
keinen Reviewdialog; nur echte Mehrdeutigkeiten wechseln in den lokalen
Sammelreview. Nach der einmaligen Ergebnisordnerwahl benötigt jeder weitere reine
Anonymisierungslauf nur noch die Quellauswahl. Die Startantwort wird erst als
Erfolg ausgegeben, nachdem der unabhängige Worker den Empfang der privaten
Intake-Nachricht ausdrücklich bestätigt hat.

### BL-044 – Sichere Datei- und Ordnerquellen
Mehrfachauswahl und rekursiver Ordnervertrag sind E0 implementiert; reale Link-/Race-
Gegenproben fehlen.

### BL-047 – Performance und Ressourcensteuerung
Adaptive Vorbereitung ist technisch begrenzt, bleibt bis zu Referenzmessungen im
Produktstandard seriell. Stapel, Speicher und Cowork-Seiten sind begrenzt; große
freigegebene Markdown-Snapshots werden verifiziert und höchstens 64 MiB pro
Handoff-Sitzung gehalten. Lesen, Hashen und Erzeugen des UTF-8-Index erfolgen im
Produktpfad asynchron und größenbegrenzt; ein 6-MiB-Regressionslauf belegt das
Yielding des MCP-Ereignisloops. Referenzmessungen und die Entscheidung über eine
adaptive Parallelisierung bleiben BL-047.1.

### BL-049 – Inhalts- und Formatgrenze
Signatur-/Strukturprüfung und drei Ergebnisgrade sind implementiert; XLSX/PPTX/PDF/
Bild bleiben gesperrt.

### BL-042 – Diagnose und Berechtigungen
Normal- und Supportoberfläche sind getrennt. Die inhaltsfreie Status-App besitzt
einen reproduzierbaren, vom Aufruf-CWD unabhängigen Offline-Build, DE/EN und einen
Textfallback. Terminale Zustände und echte automatisierte Browser-/A11y-Gates
fehlen; sie ist deshalb noch nicht als vollständige progressive Bedienoberfläche
freigegeben.

### BL-050 – Korpus und Qualitätsmetriken
Synthetische Korpora, 2.000 Variationen und lokale Benchmarks bestehen. Reale
Referenzhardwarewerte und kontrollierter Vorher-/Nachhervergleich fehlen.

### BL-051 – Installations- und Hostabnahme
Artefaktprüfungen bestehen lokal. Fresh Install, Marketplace, Update, Rollback und
100-Dateien-/500-MiB-Lauf sind menschlich offen.

### BL-052 – Menschliche Abnahme
Das aktuelle synthetische UAT-Kit ist vorbereitet. Anwender-, IT/Health-IT-,
Datenschutz-, Accessibility- und Architekturfreigaben sind offen.

Die vollständige Vorgeschichte bleibt unter [`docs/archive`](../archive/README.md)
zugänglich und darf diesen Iststand nicht überschreiben.
