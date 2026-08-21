# Entwicklungsbacklog: DataSecure als einfaches Claude-Plugin

Stand: 21.08.2026
Status: Produkt- und Architekturvorschlag nach UX-, Plattform- und Security-Review

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
optionale lokale Prüfung: Freigeben | Korrigieren | Überspringen
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
| Claude Cowork | Nach technischer Abnahme | lokale Verarbeitung tatsächlich verfügbar; kein Cloud-Connector für Rohdaten |
| Claude Web | Skill/Erklärung, ggf. Nutzung bereits bereinigter Outputs | niemals Rohdateien zur Vorverarbeitung hochladen |
| Claude Code | Expertenmodus | Originale außerhalb des Workspace und der erlaubten Dateisystembereiche; MCP allein verhindert keinen direkten Shell-/Dateizugriff |

Fehlt die lokale Fähigkeit, stoppt DataSecure mit einer klaren Anleitung. Es gibt
keinen stillen Fallback auf Upload, Cloud-OCR oder Remote-Verarbeitung.

## Leitplanken und Nicht-Ziele

- Ziel ist De-Identifizierung vor KI-Verarbeitung, nicht eine Garantie rechtlicher
  Anonymität oder eine DSGVO-/AI-Act-Zertifizierung.
- Erkannte Inhalte werden automatisch ersetzt. Harte Sicherheitsfehler wie OCR-Ausfall,
  nicht auswertbare Bereiche oder unsichere Bilder sind nicht überspringbar.
- „Prüfung überspringen“ überspringt nur die optionale inhaltliche Sichtkontrolle.
- Keine Deanonymisierung und vorerst kein dauerhaftes Identitäts-Mapping.
- Kein Nutzer installiert Node.js, Python, Java, OCR-Modelle oder npm-Pakete manuell.
- Keine Produkttelemetrie mit Dateinamen, Dokumenttext, Originalwerten, Mappings oder
  Dokument-Hashes.

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

**Ergebnis:** Ein lokales Fenster zeigt Original und bereinigte Fassung mit markierten
Ersetzungen. Aktionen: „Übersehene Stelle markieren“, „Ersetzung zurücknehmen“,
„Freigeben“ und „Prüfung überspringen“.

**Abnahme:**

- Originalwerte und Review-Vorschau sind über kein MCP-Read-Tool erreichbar.
- Korrekturen lösen den Residual-Gate erneut aus.
- Überspringen gibt ausschließlich technisch vollständig verarbeitete Textbereiche frei.
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

**Ergebnis:** Ein reproduzierbarer Release-Prozess erzeugt signierte Pilotartefakte und
prüft Installation, Start, Upgrade und Rollback auf einem frischen Windows-System.

**Abnahme:**

- Plugin-ZIP unter dem Organisationslimit und Standalone-Fallback werden aus demselben
  geprüften Quellstand erzeugt.
- Signatur, Version, SBOM, Prüfsummen und Herkunft sind nachvollziehbar.
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

**Abnahme:**

- Kein Netzwerkzugriff aus Verarbeitungsworkern.
- Private zufällige Arbeitsverzeichnisse mit restriktiven Rechten; Symlinks, Junctions,
  Reparse Points, Traversal und Polyglots werden abgewiesen.
- Timeout, Speichergrenze oder Worker-Absturz erzeugen keinen Teiloutput und lassen das
  Original wiederauffindbar.
- Fuzzing, ZIP-Bombs, PDF-Objektbomben und manipulierte Bildcontainer laufen im
  verpflichtenden Release-Gate.

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

### DS-105 – Bewusster Mehrdatei-Batch (L)

**Ergebnis:** Ein bewusst gestarteter Batch verwendet konsistente Platzhalter über alle
Dateien, damit der fachliche Zusammenhang für Claude erhalten bleibt.

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

1. **Pilotkern:** DS-001, DS-002, DS-004, DS-005, DS-006, DS-007, DS-008, DS-009
2. **Sichere Prüfung:** DS-003 und zugehörige Human-Presence-Evidenz
3. **Organisation:** DS-104, DS-106, DS-107
4. **Plattformbasis:** DS-101; danach DS-102, optional DS-103
5. **Zusammenhängende Dateien:** DS-105
6. **Qualität und Reichweite:** DS-201 vor DS-202; danach DS-203 und DS-204
7. **Rolloutentscheidung:** DS-205 und erneuter unabhängiger Security-/UX-Review

## Nächste Iteration

Für den nächsten Sprint empfiehlt sich ein dünner, belegbarer Pilot-Slice:

- DS-001: vorhandene Skills hinter einem sichtbaren DataSecure-Einstieg routen
- DS-002: Fähigkeiten und Fehlertexte vereinheitlichen
- DS-004: nicht sensitiven Abschlussbericht implementieren
- DS-005: Upload-Umgehungsfälle als Skill-/Prompt-Tests ergänzen
- DS-007: frische Windows-Installation inklusive Upgrade/Rollback automatisieren
- DS-008: persistente Original- und Treffer-Fingerprints aus dem Audit entfernen
- DS-009: Worker-/Isolation-Spike für Parser und OCR durchführen
- DS-003 als UI-/Human-Presence-Spike spezifizieren, noch nicht improvisiert über
  modellgesteuerte MCP-Parameter umsetzen

Erst wenn dieser Slice im Pilot ohne technische Begriffe und ohne Rohdaten-Upload
funktioniert, sollte die plattformübergreifende Paketierung parallelisiert werden.

## Validierte Annahmen zur Claude-Verteilung

Die Planung stützt sich auf den am 21.08.2026 dokumentierten Claude-Stand:

- Plugins können Skills, lokale MCP-Server und weitere Komponenten bündeln.
- Organisationsmarketplaces können Plugins per ZIP pilotieren oder aus einem privaten/
  internen GitHub-Repository synchronisieren.
- Organisations-Skills benötigen aktivierte Skills sowie Codeausführung/Dateierstellung;
  gruppenspezifische Skills sollen als Plugin verteilt werden.
- Plugin-Skills sind in Claude Chat/Desktop und Cowork nutzbar; nicht jede erweiterte
  Plugin-Komponente steht in jeder Oberfläche zur Verfügung.
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
