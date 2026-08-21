# Entwicklungsbacklog: DataSecure als einfaches Claude-Plugin

Stand: 21.08.2026
Status: Revalidiert nach UX-, Datenschutz-/Health-IT-, Security- und Architekturreview
unter Einbezug der übertragbaren Provenienz-/Contract-Test-Ideen aus German-law-mcp

## Zielbild

Beschäftigte sollen sensible Dateien unterschiedlicher Formate lokal de-identifizieren,
bevor Claude Inhalte verarbeitet. Fachlicher Inhalt und Dokumentstruktur sollen dabei
so weit wie technisch möglich erhalten bleiben. Erkannte Stellen werden automatisch
ersetzt; eine lokale Prüfung wird angeboten und darf – soweit die Organisationsrichtlinie
es erlaubt – übersprungen werden.

Nach außen gibt es **ein Produkt und einen Einstieg**: DataSecure. Profile, Parser,
OCR und Sicherheitsprüfungen bleiben interne Details.

```text
Dateien lokal auswählen
        ↓
DataSecure prüft Fähigkeiten und verarbeitet lokal
        ↓
automatische Ersetzung + harte Rest-PII-/Visual-Gates
        ↓
lokale Prüfung nur bei Bedarf: Freigeben | Korrigieren | Überspringen
        ↓
nur das freigegebene Privacy-Paket erreicht Claude
```

## Produktentscheidung

### Plugin zuerst, Skill für Bedienung, lokaler Dienst als Sicherheitsgrenze

- Das **Claude-Plugin** ist das primäre Distributionsprodukt. Es bündelt den Skill,
  die lokale MCP-Anbindung und später plattformspezifische Hilfsprogramme.
- Ein einziger **DataSecure-Skill** erkennt die Nutzerabsicht, erklärt den Status und
  orchestriert die lokalen Tools. Die vorhandenen Fach-Skills werden intern geroutet
  und nicht als mehrere Produkte präsentiert.
- Der **lokale MCP/Companion** ist die technische Datenschutzgrenze. Nur er darf
  Originale lesen. Der Skill darf nie behaupten, ein bereits in Claude hochgeladenes
  Original nachträglich geschützt zu haben.
- Eine **lokale Review-Oberfläche** zeigt Originalwerte und Vorschauen. Weder Claude
  noch ein Remote-Connector dürfen diese Ansicht erzeugen oder lesen.
- Ein nativer, signierter Companion pro Betriebssystem ist das Ziel für normale
  Anwender. Docker bleibt eine optionale IT-/Server-Auslieferung, nicht der Standard.

### Unterstützte Claude-Oberflächen

| Oberfläche | Zielmodus | Sicherheitsbedingung |
|---|---|---|
| Claude Desktop Chat | Primärer Pilot | lokaler Companion/MCP verfügbar |
| Claude Cowork | Skill/Erklärung und bereits bereinigte Outputs | lokaler MCP ist dort aktuell nicht verfügbar; niemals Rohdateien zur Vorverarbeitung hochladen |
| Claude Web | Skill/Erklärung und bereits bereinigte Outputs | lokaler MCP ist dort aktuell nicht verfügbar; niemals Rohdateien zur Vorverarbeitung hochladen |
| Claude Code | Expertenmodus | Originale außerhalb des Workspace und der erlaubten Dateisystembereiche; MCP allein verhindert keinen direkten Shell-/Dateizugriff |

Fehlt die lokale Fähigkeit, stoppt DataSecure mit einer klaren Anleitung. Es gibt
keinen stillen Fallback auf Upload, Cloud-OCR oder Remote-Verarbeitung.

## Leitplanken und Nicht-Ziele

- Ziel ist De-Identifizierung vor KI-Verarbeitung, nicht eine Garantie rechtlicher
  Anonymität oder eine DSGVO-/AI-Act-Zertifizierung.
- Erkannte Inhalte werden automatisch ersetzt. Harte Sicherheitsfehler wie OCR-Ausfall,
  nicht auswertbare Bereiche oder unsichere Bilder sind nicht überspringbar.
- „Prüfung überspringen“ überspringt nur die optionale inhaltliche Sichtkontrolle.
- Offene fachliche Mehrdeutigkeiten sind Pflichtentscheidungen und niemals
  überspringbar. Ein Katalogtreffer darf allein keine Freigabe begründen.
- Keine Deanonymisierung und vorerst kein dauerhaftes Identitäts-Mapping.
- Kein Nutzer installiert Node.js, Python, Java, OCR-Modelle oder npm-Pakete manuell.
- Keine Produkttelemetrie mit Dateinamen, Dokumenttext, Originalwerten, Mappings oder
  Dokument-Hashes.

### Einfachheitsbudget

Jede neue Funktion muss entweder einen harten Schutz verbessern oder den normalen
Nutzerweg messbar vereinfachen. Andernfalls wird sie nicht in den Pilotkern aufgenommen.

- Sichtbar bleibt ein Ablauf: **Dateien auswählen → nur nötige Stellen lokal klären →
  Ergebnis in Claude verwenden**.
- Einzel- und Mehrdateien verwenden denselben Einstieg. Profile, Parser, Kataloge,
  Regelversionen und Pakete bleiben interne Begriffe.
- Im Normalfall sind höchstens drei bewusste Nutzeraktionen bis zum ersten Ergebnis
  erlaubt. Zusätzliche Entscheidungen entstehen ausschließlich aus echten
  Mehrdeutigkeiten oder nicht überspringbaren Sicherheitsgrenzen.
- Pro Entscheidung zeigt die Oberfläche genau eine Frage, zwei eindeutige Antworten,
  „Zurück/Ändern“, Fortschritt und Abbruch.
- Technische Fehlercodes und Diagnosedetails erscheinen nur unter „Details für IT“.
- Keine Endnutzer-Konfiguration für Zertifikatsanbieter, Profile, URLs, Scanner oder
  Regelwerke.

### Pilotgrenze Health-IT

Der erste Pilot umfasst synthetische beziehungsweise ausdrücklich freigegebene
Mitarbeiter-, Bewerber-, Vertrags- und allgemeine Geschäftsdokumente. Patienten-,
Behandlungs- und klinische Dokumente mit besonderen Kategorien personenbezogener Daten
werden erst nach eigenem Recall-/Leakage-Nachweis, DSFA/DPIA und organisatorischer
Claude-Freigabe als unterstützt bezeichnet. Health-IT-Fachvokabular im Testkorpus ist
noch keine Freigabe dieses Dokumentzwecks.

## Priorisierung

- **P0:** Voraussetzung für einen sicheren, verständlichen Pilot
- **P1:** organisationsweit nutzbares Produkt und plattformunabhängige Basis
- **P2:** höhere Erkennungsqualität, Formatabdeckung und Skalierung
- Größen: **S** bis etwa 3 Tage, **M** bis etwa 2 Wochen, **L** mehrere Wochen;
  Schätzungen werden nach technischem Spike verfeinert.

## P0 – Sicherer Ein-Produkt-Pilot

### DS-001 – Ein sichtbarer DataSecure-Einstieg (M)

**Ergebnis:** Natürliche Sprache und optional `/datasafe` starten denselben geführten
Workflow. Fachprofile werden automatisch geroutet oder nur bei echter Mehrdeutigkeit
einmal abgefragt.

**Abnahme:**

- Höchstens drei Nutzeraktionen von der installierten Anwendung bis zum ersten Ergebnis.
- Kein Nutzer muss MCP, Node, npm, JSON, OCR oder Profilnamen kennen.
- Mindestens 90 % First-Time-Success in einem beaufsichtigten Test mit fachfremden
  Pilotanwendern.
- Bereits an Claude angehängte Originale werden ausdrücklich nicht als sicher
  vorverarbeitet dargestellt.

### DS-002 – Fähigkeitscheck und sicherer Start (M)

**Ergebnis:** `privacy_status` meldet verständlich, ob Companion, Parser, OCR,
Review-Oberfläche, Speicherpfad und Richtlinie einsatzbereit sind.

**Abnahme:**

- Ein grüner Status bedeutet, dass der komplette gewählte Pfad lokal ausführbar ist.
- Teilfähigkeiten werden formatbezogen benannt; unsichere Formate bleiben gesperrt.
- Kein automatischer Cloud-, Upload- oder Remote-Connector-Fallback.
- Fehler nennen: Was ist passiert? Ist etwas an Claude gelangt? Wo bleibt das Original?
  Was ist genau der nächste sichere Schritt?

### DS-003 – Lokale optionale Textprüfung (L)

**Stand:** Windows-Vertical-Slice umgesetzt: lokale Gegenüberstellung, heuristische
Markierungshinweise, ausschließlich zusätzliche manuelle Redaktionen,
exakte Ergebnisvorschau, inhaltshashgebundener Review/Skip-Nachweis, erneuter
Residual-Gate, DOCX-Part-Coverage und verwaiste-Arbeitskopien-Cleanup. Der echte
Windows-Forms-Pfad ist automatisiert mit synthetischer Auswahl und Schaltflächen-
Auslösung abgenommen. Kataloggestützte Organisationsmehrdeutigkeiten benötigen bereits
eine lokale Erhalten-/Anonymisieren-Entscheidung und können nicht übersprungen werden.
RC14 ergänzt „Zurück/Entscheidung ändern“, die feste Einzelfrage mit zwei Antworten,
Fortschritt „Stelle x von y“ und blendet Überspringen bei Pflichtentscheidungen aus.
Offen sind die menschliche Windows-Usability-Abnahme, eine noch kompaktere Ansicht
ohne dauerhaft sichtbare Gegenüberstellung, macOS/Linux, Provenienz aus der
tatsächlichen Replacement-Pipeline sowie strukturbezogene OOXML-Locatoren.

**Ergebnis:** Der Standardpfad zeigt eine kurze Vorschau. Nur bei Mehrdeutigkeit zeigt
das lokale Fenster nacheinander genau eine markierte Stelle mit ausreichendem Kontext
und fragt: „Gehört dieser Name zu einer Zertifizierung?“ Aktionen: „Ja, beibehalten“,
„Nein, Namen ersetzen“, „Zurück/Ändern“ und „Abbrechen“. Die vollständige
Gegenüberstellung bleibt als erweiterte Prüfung erreichbar.

**Abnahme:**

- Originalwerte und Review-Vorschau sind über kein MCP-Read-Tool erreichbar.
- Korrekturen lösen den Residual-Gate erneut aus.
- Überspringen gibt ausschließlich technisch vollständig verarbeitete Textbereiche frei.
- Bei offenen Mehrdeutigkeiten ist Überspringen ausgeblendet oder deaktiviert.
- Eine Entscheidung kann vor der Freigabe zurückgenommen und geändert werden.
- Fortschritt „Stelle x von y“ und eine kurze Abschlussübersicht sind sichtbar.
- OCR-Ausfälle, nicht auswertbare Bereiche und zurückgehaltene Bilder bleiben auch beim
  Überspringen gesperrt.
- Eine echte lokale Nutzeraktion erzeugt einen nicht vom Modell fälschbaren Freigabe-
  oder Skip-Nachweis; ein Tool-Boolean allein reicht nicht.

### DS-004 – Klarer Abschlussbericht (S)

**Ergebnis:** Nach jedem Lauf sieht der Anwender Dateianzahl, Fundstellen je Kategorie,
zurückgehaltene Inhalte, Review-/Skip-Status und lokalen Löschstatus.

**Abnahme:**

- Bericht enthält weder Originalwerte noch sensible Dateinamen.
- In weniger als zehn Sekunden ist erkennbar, ob das Ergebnis verwendbar ist.
- Eingangsdokumente, tatsächliche Verarbeitungsversuche und Ergebnisse werden getrennt
  gezählt; ein Wiederholungsversuch darf nie als zweite Datei erscheinen.
- Pro Datei gibt es genau einen Status: bereit, Entscheidung erforderlich oder sicher
  gestoppt. Die Hauptansicht enthält keine technischen Fehlercodes.
- Der Wortlaut lautet „lokal de-identifiziert/geprüft“, nicht pauschal „vollständig
  anonym“.

### DS-005 – Schutz vor direktem Rohdaten-Upload (M)

**Ergebnis:** Skill, Anleitung und UI führen immer über den lokalen Eingangsweg. Wird
ein bereits hochgeladenes Original erwähnt, erklärt DataSecure die bereits erfolgte
Offenlegung und bietet einen sicheren neuen Vorgang an.

**Abnahme:**

- Prompt-/Skill-Tests decken Upload-Umgehung, Prompt Injection im Dokument und
  behauptete nachträgliche Anonymisierung ab.
- In Usability-Tests wählen mindestens 95 % den lokalen DataSecure-Weg statt des
  normalen Uploads.
- Organisationshinweise dokumentieren, dass ein Plugin normale Claude-Anhänge nicht
  global technisch blockieren kann.

### DS-006 – Fehler-, Wiederanlauf- und Wiederholschutz (M)

**Ergebnis:** Fehler verlieren kein Original und erzeugen kein halb freigegebenes Paket.
Ein unterbrochener Vorgang wird sicher bereinigt oder eindeutig wiederaufgenommen.

**Abnahme:**

- Verarbeitung und Freigabe sind idempotent; Wiederholen erzeugt keine widersprüchlichen
  Ergebnisse.
- Crash-Tests decken jede Phase zwischen Claim, Originalverschiebung und atomarer
  Veröffentlichung ab.
- Diagnosepakete enthalten nur fest definierte Fehlercodes und keine Inhalte/Pfade.
- Gesperrte Dateien führen nicht zu aggressiven Löschversuchen oder Datenverlust.

### DS-007 – Pilot-Release-Gate und Installationsbeweis (M)

**Stand RC14: teilweise umgesetzt.** CI baut ZIP und MCPB reproduzierbar, erzeugt
eine SPDX-2.3-SBOM und SHA-256-Prüfsummen, scannt die vollständige Git-Historie mit
Gitleaks und analysiert JavaScript mit CodeQL; Actions sind auf Commit-SHAs gepinnt.
Offen bleiben Codesignatur sowie dokumentierte Installation, Upgrade und Rollback
auf einem frischen, vom Entwicklungsrechner unabhängigen Windows-System.

**Ergebnis:** Ein reproduzierbarer Release-Prozess erzeugt signierte Pilotartefakte und
prüft Installation, Start, Upgrade und Rollback auf einem frischen Windows-System.

**Abnahme:**

- Plugin-ZIP unter dem Organisationslimit und Standalone-Fallback werden aus demselben
  geprüften Quellstand erzeugt.
- Signatur, Version, SBOM, Prüfsummen und Herkunft sind nachvollziehbar.
- CodeQL und Gitleaks einschließlich Historie laufen für Pull Requests und `main`;
  verwendete GitHub Actions sind auf geprüfte Commit-SHAs gepinnt. Weitere Scanner
  werden nur bei nachgewiesenem Mehrwert ergänzt.
- Endanwender führen weder npm noch Runtime-Installer aus.
- Warmstart eines üblichen Textdokuments beginnt innerhalb von fünf Sekunden; Zielwert
  für ein Standarddokument ist unter 30 Sekunden ohne OCR.

### DS-008 – Datensparsames Audit und verständliche Aufbewahrung (M) — umgesetzt

**Ergebnis:** Dauerhaftes Audit speichert nur Kategorien, Zähler, Komponenten-/
Regelversionen, Ergebnisstatus und eine zufällige Vorgangs-ID. Die derzeit dauerhaft
gespeicherten vollständigen Originaldatei-Hashes und verkürzten ungesalzenen
`value_hash`-Fingerprints werden entfernt oder auf die Paketaufbewahrung begrenzt.

**Abnahme:**

- Wörterbuchtests können aus Auditdaten keine synthetischen Namen oder Kennungen
  wiedererkennen oder dokumentübergreifend verknüpfen.
- Integritätshashes freigegebener Outputs bleiben paketlokal und verfallen mit dem Paket.
- UI erklärt, ob Eingangsdokumente kopiert oder verschoben werden, sowie „Jetzt löschen“
  und die aktive Frist; Benutzeroriginale werden nie überraschend gelöscht.
- Audit-, Log-, Temp-, JSON-RPC- und Crash-Dump-Prüfungen finden keine Originalwerte
  oder Mappingtabellen; verbleibende Betriebssystemgrenzen werden dokumentiert.

### DS-009 – Parser-/OCR-Isolation (L)

**Ergebnis:** Unvertraute Dokumente, Konverter und OCR laufen in kurzlebigen Workern mit
Zeit-, Speicher-, Größen-, Seiten-, Objekt- und Dekompressionsgrenzen.

**Stand RC18: native Parser-Prozessgrenzen für Windows x64 umgesetzt.** Jede Datei wird
in einem kurzlebigen Node-Kindprozess geparst. Auf Windows startet er ausschließlich
über einen gebündelten C++17-Launcher: Quelle als geerbtes stdin-Handle ohne Pfad,
`CREATE_SUSPENDED`, Job-Zuweisung vor Resume, `ACTIVE_PROCESS=1`, 768 MiB Prozess-/
Jobspeicher, 40 Sekunden CPU-Zeit, 45 Sekunden Wallclock und `KILL_ON_JOB_CLOSE`.
Nur stdin/stdout/stderr
werden vererbt; das Jobhandle nie. Fehlender, beschädigter oder nicht zur Architektur
passender Launcher stoppt ohne direkten Node-Fallback. SHA-256, reproduzierbarer
Quellbuild, bytegleicher `/Brepro`-Vergleich gegen das committed Binary, PE-x64-/
Paketkonsistenzprüfung, reale Grenztests sowie getrenntes C++-CodeQL sind Teil des
Release-Gates. Der Sidecar ist ausdrücklich kein Herkunfts- oder Signaturnachweis.
Der Parent begrenzt zusätzlich Wallclock, V8-Heap, Antwortschema, Text, Anlagen und
Gesamtausgabe und bestätigt das Launcher-Ende vor der Rückgabe eines Timeoutfehlers.
OCR/Raster besitzen weiterhin Dokument-/Einzelzeit- und Ausgabegrenzen, ihr heutiger
Windows-Prozessbaum-Abbruch ist aber noch best effort. Offen sind Codesignatur,
Windows ARM64, der Job-Object-Pfad für OCR/Raster sowie AppContainer als belegte
OS-Netz-/Dateisystem-/Credential-Grenze. Vor klinischen Echtdaten bleibt dies ein Gate.

**Abnahme:**

- Kein Netzwerkzugriff aus Verarbeitungsworkern.
- Private zufällige Arbeitsverzeichnisse mit restriktiven Rechten; Symlinks, Junctions,
  Reparse Points, Traversal und Polyglots werden abgewiesen.
- Timeout, Speichergrenze oder Worker-Absturz erzeugen keinen Teiloutput und lassen das
  Original wiederauffindbar.
- Fuzzing, ZIP-Bombs, PDF-Objektbomben und manipulierte Bildcontainer laufen im
  verpflichtenden Release-Gate.

### DS-010 – Versionierter Offline-Fachkatalog und Contract-Korpus (S–M)

**Stand RC14: umgesetzt.** Der lokale Katalog enthält 29 fachlich relevante Anbieter
mit Aliasen, Kategorien und Codes. Loader, Literal-Compiler und Contract-Korpus prüfen
Schema, Normalisierung, Kontexttrennung und optionale verifizierte HTTPS-Referenzen.
Er besitzt weder Datums-/Ablauflogik noch Laufzeitnetz oder eine Nutzeroberfläche.

**Ergebnis:** Zertifikatsanbieter, Aliase und Codes liegen als kleine, versionierte
Offline-Datendatei getrennt von der Erkennungslogik vor. Die Idee übernimmt nur die
strukturierte Provenienz und Contract-Prüfung aus German-law-mcp – keine
Online-Datenbank und keine Freshnesslogik.

**Abnahme:**

- Schlanke Felder: stabile ID, Anzeigename, Aliase, Kategorie und optional eine
  Referenz-URL, wenn diese tatsächlich geprüft wurde.
- Keine Pflicht-URL, kein Prüfdatum, kein Ablaufdatum, kein Laufzeitnetz und kein
  zusätzliches MCP-Tool.
- Unbekannte Felder, doppelte IDs sowie Alias-Kollisionen nach Unicode-/Case-
  Normalisierung werden in CI abgewiesen; Regex-Metazeichen werden nicht als aktive
  Muster übernommen.
- Generierte Contract-Tests prüfen denselben Namen im Zertifikats-, Arbeitgeber-,
  Kunden- und Technologiekontext sowie unbekannte Zertifikate in expliziten
  Zertifikatsabschnitten und lange Projekttexte.
- Ein Katalogtreffer bleibt ein Hinweis. Expliziter Kontext entscheidet automatisch;
  echte Restmehrdeutigkeit bleibt eine lokale Pflichtentscheidung.

### DS-011 – Ein lokaler Datei- und Mehrdatei-Einstieg (M)

**Stand RC19 (seit RC17): nutzbarer TXT-/DOCX-Slice umgesetzt.** Der private Windows-Dialog erlaubt
bis zu 25 TXT-/DOCX-Dateien; jede erhält einen eigenen Job und ein eigenes Paket.
Fehler werden pro Datei isoliert, das lokale Prüffenster zeigt „Datei x von y“, und
die MCP-Zusammenfassung trennt ausgewählt, freigegeben und sicher gestoppt. Nach einer
Mehrfachauswahl erscheint genau einmal eine lokale Abschlussansicht mit denselben drei
Zählern und ausschließlich „Schließen“. PDF wurde nach adversarialem Security-Review
nicht freigeschaltet: Der Lite-Parser belegt Page-, Font- und Visual-Coverage noch nicht.

**Ergebnis:** „Dateien für Claude vorbereiten“ öffnet einen lokalen Dialog für eine
oder mehrere Dateien. Jede Datei wird unabhängig verarbeitet; offene Entscheidungen
werden nacheinander lokal geklärt. Der Input-Ordner bleibt ein IT-/Fallbackweg, aber
kein zweiter normaler Nutzerprozess.

**Abnahme:**

- Mehrfachauswahl, automatische Dokumentart und sichtbarer Fortschritt „Datei x von y“.
- Nur nicht klassifizierbare Scans lösen eine gezielte Profilfrage aus.
- Ein Fehler stoppt nur die betroffene unabhängige Datei; andere Dateien laufen weiter.
- Abschluss: Anzahl bereit, Entscheidung erforderlich und sicher gestoppt sowie je
  Datei genau eine nächste Handlung – ohne Pfade oder sensible Dateinamen an Claude.
- Bilder folgen einer organisationsseitigen Voreinstellung; der Nutzer wird nicht bei
  jeder Datei erneut mit technischen Optionen konfrontiert.
- Zunächst getrennte Pakete und getrennte Platzhalter je Datei. Kein gemeinsames
  Identitätsmapping und keine Alles-oder-nichts-Sperre im einfachen Modus.

## P1 – Organisation und Plattformunabhängigkeit

### DS-101 – Plattformadapter und stabile lokale API (M)

**Ergebnis:** Parser-, OCR-, Rasterisierungs-, Speicher- und Review-Funktionen hängen
von versionierten Adapterinterfaces ab. Die MCP-Tooloberfläche bleibt auf allen
Plattformen identisch.

**Abnahme:**

- Capability-Erkennung statt Betriebssystemannahmen im Workflow.
- Windows-, macOS- und Linux-Adapter laufen gegen dasselbe synthetische Abnahmekorpus.
- Adapterfehler werden fail-closed und formatbezogen gemeldet.

### DS-102 – Signierter Companion für Windows, macOS und Linux (L)

**Ergebnis:** Das Plugin startet automatisch das passende selbstständige Hilfsprogramm.
Vorgesehene OCR-Backends: Windows OCR, macOS Vision, Linux Tesseract/OCRmyPDF; endgültige
Auswahl folgt aus einem Spike.

**Abnahme:**

- Keine separate Installation von Node, Python, Java oder OCR-Daten durch Anwender.
- Installations-, erster Start-, Upgrade- und Rollback-Tests für alle drei Plattformen.
- Companion bindet nicht an eine Netzwerkschnittstelle; bevorzugt stdio. Falls Loopback
  nötig wird: zufälliges kurzlebiges Token und strikte Origin-/Prozessprüfung.
- Code Signing/Notarisierung und reproduzierbare Herkunft je Plattform.

### DS-103 – Docker als optionale Enterprise-Auslieferung (M)

**Ergebnis:** Eine gehärtete Container-Variante unterstützt verwaltete Arbeitsplätze,
CI und Server-Szenarien, ohne zum Standardweg für Beschäftigte zu werden.

**Abnahme:**

- Gepinnte Images, non-root, read-only Root-FS, minimale Mounts und kein Netzwerk im
  Verarbeitungscontainer.
- Auf macOS/Windows werden VM-, Ressourcen- und Dateifreigabegrenzen dokumentiert.
- Gleiche API und gleiches synthetisches Sicherheitskorpus wie native Companions.

### DS-104 – Organisationsrichtlinien ohne Nutzerkonfiguration (M)

**Ergebnis:** IT verwaltet Formate, Profile, OCR-Sprachen, Aufbewahrung, Visual-Gates,
Skip-Erlaubnis, Claude-Oberflächen und Telemetrie zentral.

**Abnahme:**

- Anwender benötigen im Normalfall keine Einstellung.
- Lokale Nutzer können Regeln verschärfen, aber keine verpflichtenden Gates schwächen.
- Richtlinien sind signiert oder anderweitig manipulationsgeschützt; Version und aktive
  Quelle erscheinen ohne sensible Werte im Status.

### DS-105 – Zusammenhängender Fall-Batch mit gemeinsamem Mapping (L)

**Ergebnis:** Ein später ausdrücklich gewählter Spezialmodus verwendet konsistente
Platzhalter über zusammengehörige Dateien. Er ist nicht der einfache Mehrdateiweg aus
DS-011 und gehört nicht in den ersten Pilot.

**Abnahme:**

- Gleiches Objekt erhält im Batch denselben Platzhalter; außerhalb des Batches beginnt
  die Zuordnung neu.
- Mapping bleibt lokal, ist verschlüsselt bzw. nur im Arbeitsspeicher und wird nach
  Erfolg, Abbruch, Fehler und Timeout nachweislich entfernt.
- Atomare Freigabe: Entweder besteht der komplette Batch alle harten Gates oder kein Teil
  wird automatisch an Claude übergeben.
- Parallelität, Crash und Stromausfall werden mit synthetischen Identitäten getestet.

### DS-106 – Verwaltete Claude-Verteilung (S)

**Ergebnis:** Pilot per Plugin-ZIP; Rollout über ein privates/internes GitHub-Repository
und den Organisations-Marketplace. Plugin-Gruppen steuern Verfügbarkeit und Pflichtgrad.

**Abnahme:**

- Plugin enthält den sichtbaren Haupt-Skill und alle benötigten lokalen Komponenten.
- Versionsanhebung, Marketplace-Synchronisierung, Rücknahme und Gruppenrollout sind in
  einer IT-Runbook-Probe belegt.
- Installation wird standardmäßig bereitgestellt; „required“ erst nach Pilot und
  Supportfreigabe.

### DS-107 – Datenschutzfreundliche Betriebsmetriken (S)

**Ergebnis:** Optional erfassbar sind nur Installationserfolg, Dauer, Fehlercode,
Formatklasse, Review/Skip und Support-ID.

**Abnahme:**

- Telemetrie ist standardmäßig aus oder organisationsseitig ausdrücklich gesteuert.
- Keine Dateinamen, Texte, Originalwerte, Mappings, Dokument- oder Inhalts-Hashes.
- Pilotziele: ≥ 90 % erfolgreiche Erstnutzung, ≥ 95 % erfolgreiche Verarbeitung
  unterstützter Dateien, < 5 % Supportfälle pro Vorgang.

## P2 – Qualität, Formate und Skalierung

### DS-201 – Unabhängiger Detektor-Benchmark (M)

**Ergebnis:** Bestehende Regeln werden auf demselben versionierten deutschen Testkorpus
gegen GLiNER-, Presidio- und PII-Shield-Ansätze verglichen. Kein Backend wird allein
wegen seiner Trefferzahl zum Produktstandard.

**Abnahme:**

- Metriken je Entitätsklasse: Precision, Recall, F1, False-Negative-Schwere,
  Laufzeit, Paketgröße und Speicherbedarf.
- Fachinhalte wie Rollen, Skills, Methoden, Technologien und Projektzeiträume erhalten
  eigene Over-Redaction-Metriken.
- Kandidaten laufen zunächst hinter Feature Flag und dürfen harte Gates nicht umgehen.

### DS-202 – Erweiterte lokale Erkennung (L)

**Ergebnis:** Der beste Benchmark-Kandidat ergänzt die deterministischen Regeln lokal;
Unternehmens-, Projekt-, Standort-, Personen- und Personalnummernmuster werden erweitert.

**Abnahme:**

- Kein Modell-Download zur Laufzeit und kein Netzbedarf.
- Modell/Regeln sind versioniert, signiert und rollbackfähig.
- Definierte Mindestwerte je kritischer Entitätsklasse und keine signifikante
  Verschlechterung des fachlichen Inhaltserhalts.

### DS-203 – Formatvollständigkeit und Strukturtreue (L)

**Stand RC19:** Die erste explizite Matrix liegt in
[`FORMAT_COVERAGE_MATRIX.md`](FORMAT_COVERAGE_MATRIX.md). Der geplante Text-PDF-
Dialogschnitt wurde nach Security-/Architektur-Gegenproben nicht freigeschaltet.

**Ergebnis:** Kopf-/Fußzeilen, Kommentare, Notizen, Tabellen, Textboxen, Metadaten,
eingebettete Grafiken und Scan-PDFs werden systematisch erfasst. Optionaler Apache-Tika-
Adapter wird nur übernommen, wenn Nutzen, Paketgröße und Angriffsfläche überzeugen.

**Abnahme:**

- Pro Format existiert eine Coverage-Matrix statt einer pauschalen „unterstützt“-Angabe.
- Nicht extrahierbare Bereiche blockieren oder werden klar zurückgehalten.
- Parser-Fuzzing, Zip-Bomb-/Pfadgrenzen und mutierte Container bleiben Teil des Gates.

### DS-204 – Zwei klar getrennte Ausgabearten (M)

**Ergebnis:** „KI-Arbeitsfassung“ liefert bereinigtes Markdown/Assets; „bereinigte
Originaldatei“ bewahrt das Format, sobald es für den jeweiligen Dateityp belegbar ist.

**Abnahme:**

- UI und Manifest benennen Ausgabeart und bekannte Strukturverluste eindeutig.
- Keine Behauptung von Formaterhalt, solange Kommentare, Notizen oder Layout fehlen.
- Semantische Golden-Tests und visuelle Regressionstests je freigegebenem Format.

### DS-205 – Geführter Feldpilot (M)

**Ergebnis:** 10–20 repräsentative Beschäftigte testen Installation und tägliche Arbeit
zunächst ohne Schulung mit synthetischen oder ausdrücklich freigegebenen Dokumenten.

**Abnahme:**

- Messung von First-Time-Success, Bearbeitungsdauer, Irrwegen und verständlichen
  Abbruchgründen.
- „Problem melden“ erzeugt ein automatisch bereinigtes Diagnosepaket.
- P0/P1-Kriterien werden anhand beobachteter Nutzung bestätigt oder angepasst.

## Querschnitt: Security Definition of Done

Jedes Backlog-Item mit Dateizugriff, Freigabe oder Mapping ist erst fertig, wenn:

1. Rohdatenfluss, Trust Boundary und Angreiferannahmen aktualisiert sind.
2. Normal-, Fehler-, Abbruch-, Crash- und Manipulationspfade getestet sind.
3. Kein Dokumenttext, Originalwert, sensibler Pfad oder Mapping in Logs/Audit gelangt.
4. Temporärdaten restriktive Rechte besitzen und bei Erfolg, Fehler, Abbruch und Ablauf
   bereinigt werden; Löschfehler sind sichtbar und werden nicht verschwiegen.
5. Release-Artefakte gepinnt, signiert, mit SBOM versehen und auf bekannte kritische
   Schwachstellen geprüft sind.
6. Härtetest belegt, dass Dokumentinhalt niemals als Anweisung ausgeführt wird.
7. Ein unabhängiger Review die Abnahmeevidenz gegen synthetische Daten bestätigt.

## Empfohlene Lieferreihenfolge

1. **Installiertes Produkt:** DS-007 sowie installierter DS-001/DS-002/DS-004-Pfad
2. **Einfacher Nutzerweg:** DS-003 vereinfachen, danach DS-011
3. **Wartbare Fachregeln:** DS-010 ohne sichtbare Zusatzkonfiguration
4. **Pilot-Security:** DS-005, DS-006 und gestufte DS-009-Härtung
5. **Menschliche Abnahme:** DS-205 mit mindestens fünf fachfremden Beschäftigten
6. **Organisation:** DS-104, DS-106, DS-107
7. **Plattformbasis:** DS-101; danach DS-102, optional DS-103
8. **Qualität und Reichweite:** DS-201 vor DS-202; danach DS-203 und DS-204
9. **Spezialmodus zusammenhängende Dateien:** DS-105 erst nach dem einfachen Pilot

## Nächste Iteration

Der Windows-TXT-/DOCX-Vertical-Slice, das datensparsame Audit und die lokale
Review-/Skip-Grenze sind inzwischen umgesetzt. Der nächste Sprint soll deshalb
nicht noch einmal dieselben Spikes planen, sondern den installierten Pilotpfad
belegen:

1. **Dokumentationshygiene (erledigt in RC14):** sichtbare Versionsangaben,
   Anwenderanleitung, Skills und technische Handbücher wurden konsistent aktualisiert.
2. **DS-007 (M):** einen empfohlenen Plugin-ZIP-Installationsweg auf frischem Windows
   einschließlich Start, Upgrade, Rollback, Prüfsummen, SBOM, Codesignatur sowie
   minimalem CodeQL-/Secret-Scan nachweisen; MCPB bleibt Fallback.
3. **DS-003 (technisch in RC14, menschliche Abnahme offen):** Pflichtdialog nutzt eine
   Frage, zwei Antworten und Zurück/Ändern. Mit mindestens fünf fachfremden Personen
   synthetisch testen. Visuelle Freigabe bleibt deaktiviert.
4. **DS-011 (TXT-/DOCX-Slice seit RC17):** Mehrfachauswahl, lokales „Datei x von y“,
   Fehlerisolierung und eine rein informative Abschlussansicht sind umgesetzt;
   weitere Formate folgen ausschließlich anhand der Coverage-Matrix aus DS-203.
5. **DS-010 (erledigt in RC14):** Offline-Fachkatalog, Validator und Contract-Korpus
   laufen ohne neue Nutzeroberfläche, Datumslogik oder Laufzeitnetz.
6. **DS-009 (Parser-Job-Object-Slice in RC18):** Native Windows-x64-Prozess-, CPU-
   und Speichergrenzen samt fail-closed Packaging sind umgesetzt. Als Nächstes den
   Launcher für OCR/Raster kalibrieren und AppContainer ohne Netz-Capabilities gegen
   Internet, DNS, RFC1918 und Loopback nachweisen; ARM64 und Signatur folgen getrennt.
7. **DS-203 (Security-Revalidierung in RC19):** Text-PDF bleibt aus dem privaten
   Dialog, bis Catalog/Page-Tree/Contents vollständig verfolgt, Font-Encoding und
   ToUnicode korrekt ausgewertet sowie Images, Inline-Images, Form-XObjects und
   Vektorinhalt vollständig erfasst oder blockiert werden. Indirekte Filter und
   DecodeParms gehören ebenfalls ins Gate. Erst danach folgen reale Word-/LibreOffice-/
   Browser-PDFs und adversariale Gegenproben als Freigabeevidenz.
8. **DS-005/DS-205:** Upload-Umgehung, Einzel-/Mehrdateiweg, Mehrdeutigkeit, sicheren
   Abbruch und Verständlichkeit mit synthetischen Dokumenten abnehmen.

Erst wenn Installation, installierter End-to-End-Pfad und menschliche Bedienbarkeit
belegt sind, sollte ein Pilot mit ausdrücklich freigegebenen Daten erwogen werden.

## Revalidierungsprotokoll

Die Priorisierung wurde aus drei unabhängigen Fachperspektiven gegengeprüft:

- **UX/Produkt:** ein sichtbarer Einzel-/Mehrdateiweg, reduzierte Pflichtentscheidung,
  verständlicher Abschluss statt Ordner-/Paketverwaltung;
- **Datenschutz, IT-Security und Health-IT:** Katalog nie als Freigabewahrheit,
  installierte Release-Herkunft, minimale Supply-Chain-Prüfung, gestufte
  Parserisolation und klare Grenze für klinische Daten;
- **Softwarearchitektur/Entwicklung:** bestehende Engine behalten, Katalog und Tests
  intern strukturieren, einfachen Batch von gemeinsamem Mapping trennen, kein
  Big-Bang-Port und keine Online-Datenbank.

Gemeinsamer Beschluss: Die aus der
[Quellenstruktur](https://github.com/nenna-ai-GmbH/German-law-mcp/blob/main/sources.yml)
und [Security-Automatisierung](https://github.com/nenna-ai-GmbH/German-law-mcp/tree/main/.github/workflows)
von German-law-mcp übertragbaren Muster sind strukturierte Provenienz, Contract-Tests
und minimale Release-/Security-Evidenz. Nicht übernommen
werden tägliche Quellenprüfung, `last_verified`-/Ablaufdaten, Runtime-Downloads,
Remote-MCP, große Datenbank oder eine Sammlung überlappender Scanner. Diese Entscheidung
hält die technische Nachvollziehbarkeit hoch und die sichtbare Bedienung klein.

## Validierte Annahmen zur Claude-Verteilung

Die Planung stützt sich auf den am 21.08.2026 dokumentierten Claude-Stand:

- Plugins können Skills, lokale MCP-Server und weitere Komponenten bündeln.
- Organisationsmarketplaces können Plugins per ZIP pilotieren oder aus einem privaten/
  internen GitHub-Repository synchronisieren.
- Organisations-Skills benötigen aktivierte Skills sowie Codeausführung/Dateierstellung;
  gruppenspezifische Skills sollen als Plugin verteilt werden.
- Plugin-Skills sind in Claude Chat/Desktop und Cowork nutzbar. Lokale MCP-Server
  stehen nach aktuellem Claude-Stand nur in Desktop und Claude Code zur Verfügung;
  Web/Cowork sind deshalb kein Rohdaten-Preflight-Pfad.
- Cowork-Connectoren erreichen externe Dienste über Anthropic-Infrastruktur und sind
  deshalb kein Ersatz für den lokalen Rohdaten-Gate.

Vor jedem Rollout werden diese Voraussetzungen erneut gegen die aktuelle offizielle
Claude-Dokumentation geprüft.

Offizielle Referenzen:

- [Plugins in Claude verwenden](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
- [Plugins organisationsweit verwalten](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization)
- [Skills organisationsweit bereitstellen](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)
- [Skills in Claude verwenden](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Offizielle Plugin-Struktur](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/plugin-structure/SKILL.md)
