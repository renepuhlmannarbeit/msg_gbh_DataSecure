# Claude-Cowork-, UX-, Architektur- und Performance-Review

Stand: 24.08.2026 · geprüfter Arbeitsstand: RC34 (lokaler, noch nicht
veröffentlichter Entwicklungsstand)

## Gesamturteil

DataSecure besitzt einen überdurchschnittlich sorgfältigen lokalen
Datenschutzkern: Originale bleiben lokal, der MCP-Server ist die technische
Datengrenze, die normale Werkzeugoberfläche ist begrenzt, der Batch ist
fortsetzbar und Freigaben erfolgen fail-closed. Node.js ist für den MCP- und
Dokumenten-Orchestrator weiterhin eine geeignete Sprache; eine Neuentwicklung in
einer anderen Sprache würde die aktuellen Probleme nicht lösen. Native
Supervisoren bleiben dort sinnvoll, wo Betriebssystem-Ressourcengrenzen erzwungen
werden müssen.

Der Stand ist dennoch **nicht allgemein releasefähig**. Es wurde kein
P0-Sicherheitsbruch nachgewiesen, aber zwei P0-Produktblocker und mehrere messbare
P1-Lücken:

1. Der lokale MCP funktioniert nur in einer Desktop-gebundenen lokalen Sitzung.
   Web, Mobil, reine Cloud-Cowork-Sitzungen und Scheduled Tasks dürfen keinen
   lokalen Originalpfad versprechen.
2. Ein lokaler Stapel kann in `awaiting_local_review`,
   `awaiting_explicit_resume` oder Mapping-Reparatur ruhen, ohne dem Anwender eine
   lokale Meldung zu zeigen. Da der Fast Path absichtlich nicht pollt, wirkt der
   Vorgang dann eingefroren.
3. Der bevorzugte Plugin-ZIP-Weg startet noch `node`; die installationsfreie
   Vier-Ziel-SEA-Strecke ist noch nicht freigegeben.
4. Aktive Skills und Handbücher enthalten noch den alten Input-Ordner-Weg sowie
   widersprüchliche Tool- und Seitengrößenangaben.
5. Die vorhandene Performance-Evidence misst einen Parser-Stub, nicht die reale
   Anonymisierung.

## Abgleich mit aktueller Claude-Dokumentation

- Plugins mit `skills/`, `.claude-plugin/plugin.json` und `.mcp.json` entsprechen
  der aktuellen Struktur. Die zwei fokussierten Skills sind richtig; weitere
  überlappende Skills würden Bedienung und Kontext verschlechtern.
- `${CLAUDE_PLUGIN_ROOT}` wird für den lokalen Server portabel verwendet.
- Cowork läuft standardmäßig in einer isolierten Cloud-Umgebung. Lokale Dateien
  und lokale MCP-Komponenten benötigen die verbundene Desktop-App und sind nicht
  durch einen Remote-Connector zu ersetzen.
- Manual-, Auto- und Skip-Modus sowie Organisationsrichtlinien bestimmen
  Berechtigungsdialoge. Ein Plugin darf wiederholte Freigaben nicht durch
  irreführende `readOnlyHint`-Angaben umgehen. Die Serverwerkzeuge setzen derzeit
  `readOnlyHint` und `openWorldHint`; `destructiveHint` und `idempotentHint` sind
  noch nicht durchgängig explizit.
- Skills sollen kurz, eindeutig auslösbar und progressiv aufgebaut sein. Der
  Anonymisierungs-Skill erfüllt das weitgehend; der Erklär-Skill und mehrere
  Handbücher widersprechen ihm noch beim lokalen Eingang.

Offizielle Referenzen:

- [Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
- [Local MCP servers / Desktop Extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [When to use desktop and web connectors](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors)
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Offizielle Pluginstruktur](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/plugin-structure/SKILL.md)

## Anwender- und UX-Befunde

### P0 – kein unsichtbarer Ruhezustand

`batch-worker.js` meldet nur einen vollständig terminalen Lauf. Lokale Prüfung,
explizite Fortsetzung oder Mapping-Reparatur können ohne Meldung enden. Jeder
automatische Lauf benötigt genau eine inhaltsfreie lokale Zustandsmeldung mit
genau einer nächsten Aktion und ohne neuen Dateipicker.

### P0 – ein einziger Eingang

Der Normalweg ist der native DataSecure-Mehrfachpicker. Der `Input`-Ordner ist
nur ein technischer Supportweg. `ANLEITUNG.md`, `ANWENDERREVIEW.md` und der
Datenschutz-Erklär-Skill müssen denselben Vertrag verwenden.

### P1 – Fortschritt und Berechtigungen

Lange Stapel brauchen eine lokale, inhaltsfreie Fortschrittsanzeige. Claude darf
dazu nicht pollen. Eine spätere Claude-Auswertung liest derzeit fünf Dokumente
pro Werkzeugaufruf; bei 100 Dateien können damit 20 Freigabeereignisse entstehen.
Die reale Dialogzahl muss in Manual/Auto/Skip gemessen werden. Danach ist ein
größeres, aber streng begrenztes Ausgabe-Budget oder eine aufgabenweite Freigabe zu
nutzen, soweit der Host dies tatsächlich unterstützt.

### P1 – unnötige Nutzerhürden

- Gleichnamige Dateien aus verschiedenen Ordnern erzwingen derzeit Umbenennen und
  komplette Neuauswahl. Interne IDs müssen diese Kollision lokal lösen.
- Der Picker-Titel „für Claude vorbereiten“ widerspricht dem Standard
  `local_only`; korrekt ist „mit DataSecure lokal anonymisieren“.
- Abschluss- und Fehlermeldungen müssen eine nächste Handlung nennen, nicht nur
  technische Zustände.

## Entwicklungs- und Performance-Befunde

### P1 – reale Laufzeit ist überwiegend nicht instrumentiert

Der lokale Stub-Benchmark ergab ungefähr 1,5 Sekunden für eine, 9,1 Sekunden für
zehn und 90,9 Sekunden für 100 winzige TXT-Dateien. Bei 100 Dateien erklären die
vorhandenen Phasen nur rund 25 Sekunden; rund 66 Sekunden fehlen. Der Benchmark
umgeht zudem den echten Parser und ist kein Produktnachweis.

Die nächste Messstufe muss reale TXT-, CSV- und DOCX-Parser verwenden und Kalt-/
Warmlauf, 1/10/100 Dateien, Größenklassen, p50/p95, Gesamtzeit, CPU, Peak-RAM und
den bisher nicht zugeordneten Overhead ausweisen. Eine monotone Uhr ist Pflicht.

### P1 – konkrete Hotspots

- `roots()` validiert den vollständigen Pfad sehr häufig bis zur Laufwerkswurzel.
  Eine pro Lauf geprüfte, opake Root-Identity kann Wiederholungen vermeiden, ohne
  ungeprüfte Pfade zu cachen.
- Der vollständige Batchzustand wird pro Checkpoint synchron gelesen und atomar
  neu geschrieben. Vor einer Änderung sind Byte- und Crashprofile nötig; danach
  ist ein geshardeter oder append-only Journalvertrag zu prüfen.
- Mapping und Diagnose ersetzen wachsende Gesamtdateien pro Dokument.
- Der Handoff dekodiert für jede 4.800-Zeichen-Seite erneut den vollständigen
  Markdown-Puffer. Einmalige begrenzte UTF-8-Dekodierung oder ein sicherer
  Decoder-Cursor ist erforderlich.
- Die neuen Tests für gemischtes Resume, OCR-Session-Harness und Archivmodi laufen
  im Fast Path, aber noch nicht im normalen kostensparenden CI-Gate.

### P1 – Größenvertrag

Der Eingang bewirbt 500 MiB pro Stapel beziehungsweise Datei, während der Parser
eine Datei vollständig in den Speicher liest, der Worker 384 MiB Heap besitzt,
die Antwort 48 MiB und Markdown 8 Millionen Zeichen begrenzt. Formate brauchen
deshalb konsistente Vorprüfungen oder einen sicheren Streaming-Textpfad, bevor
500 MiB als reibungsloser Einzeldateifall gelten kann.

### P2 – sichere Parallelität

Der serielle zentrale Commit ist derzeit richtig. Höchstens zwei vorbereitende
Worker dürfen erst nach Lease-, Speicher-, Reihenfolge-, Crash- und Drei-OS-
Nachweisen aktiviert werden. OCR bleibt absichtlich langsam, weil pro Grafik ein
begrenzter Prozess startet. Der inaktive Session-Harness ist eine gute
Vorbereitung, aber noch keine Freigabe zur Wiederverwendung.

## Zielworkflow

1. Nutzer öffnet eine lokale Cowork-Desktop-Aufgabe ohne Originalanhang.
2. „Dateien anonymisieren“ oder direkte Skillauswahl.
3. Einmalige aufgabenbezogene Toolfreigabe, soweit Host/Organisation sie zulässt.
4. Nativer Mehrfachpicker; „Öffnen“ ist die einzige Startbestätigung.
5. Lokale, inhaltsfreie Fortschrittsanzeige; keine Frage pro Datei.
6. Genau eine lokale Meldung: fertig, lokale Prüfung nötig, Fortsetzung nötig oder
   sicher gestoppt – jeweils mit einer nächsten Aktion.
7. Output und Mapping bleiben lokal. Nur auf ausdrücklichen Wunsch startet eine
   gebündelte Claude-Auswertung.
8. Fortsetzung nutzt den vorhandenen Checkpoint und öffnet nie erneut den Picker.

## Freigabeurteil

- **Technische Architektur:** guter, sicherheitsorientierter Kern; Node.js plus
  native Supervisorgrenzen bleibt angemessen.
- **Claude Best Practice:** Struktur grundsätzlich passend; Hostvertrag,
  Werkzeugvertrag und Dokumentationsdrift müssen geschlossen werden.
- **Anwender/UX:** Normalweg konzeptionell einfach, aber unsichtbare Ruhephasen und
  fehlender Fortschritt verhindern derzeit eine belastbare Gebrauchstauglichkeit.
- **Performance:** aktuell nicht als schnell belegbar; Stub-Messung zeigt bereits
  erheblichen uninstrumentierten Overhead.
- **Release:** NO-GO für universellen ZIP-/Marketplace-Rollout bis P0 und echte
  Windows-/macOS-Cowork-Evidence geschlossen sind.
