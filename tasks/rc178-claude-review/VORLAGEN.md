# Vorlagen für den RC178-Review

Diese Vorlagen gehören zum
[Arbeitsauftrag an Claude Code](../AUFTRAG-CLAUDE-RC178-STANDALONE-REVIEW.md).
Ersetze Platzhalter durch beobachtete Fakten. Befunde und Tests beziehen sich
auf einen konkreten Commit. Verweise auf öffentliche Quellen und synthetische
Testdaten mit genug Kontext für eine unabhängige Prüfung.

## `BEFUNDE.md` · Analyse, Annahmen und Entscheidungen

### Ausgangslage und tatsächlicher Nutzerablauf

- Einstieg – `<Einstiegscommit>`
- Produktstand – `<Tag, Commit und Produktfingerprint>`
- Zweck und Plattformen – `<unterstützte Zwecke und tatsächlich geprüfte Ziele>`
- Geprüfte Aufrufketten – `<Oberfläche → Grenzen → Core → Worker → Ergebnis>`
- Widersprüche zwischen Dokumentation, CI oder Quellcode – `<Zeile und Beobachtung>`
- Baseline-Tests – `<Befehle, Ergebnisse und Umgebungsgrenzen>`

### Übersicht

| ID | Priorität | Dimension und Plattform | Befund in einem Satz | Backlog oder Entscheidung | Status |
| --- | --- | --- | --- | --- | --- |
| R-001 | offen | offen | offen | vorhandene ID oder Vorschlag | Hypothese |

Priorisiere nach beobachteter Auswirkung. Kritisch sind insbesondere belegter
Datenschutzverlust, Datenverlust und fehlerhafte Ergebniszuordnungen. Eine
fehlende Freigabe oder eine nicht verfügbare Testumgebung ist ein Blocker für
den betroffenen Nachweis und allein kein Produktfehler.

### Einzelbefund `R-<Nr.>`

- **Fundstelle** – `<Commit, Pfad:Zeile, Funktion, tatsächliche Aufrufer>`
- **Auslöser und Geltungsbereich** – `<Zweck, Zielplattform, Voraussetzung und synthetischer Fall>`
- **Ist und Soll** – `<konkrete Beobachtung und fachlicher oder technischer Vertrag>`
- **Auswirkung** – `<Daten, Sicherheit, Bedienung, Leistung oder Wartung>`
- **Evidenz** – `<Befehl, beobachtetes Ergebnis, relevante Referenz>`
- **Engste geeignete Änderung** – `<betroffene Module, verworfene Ansätze und Begründung>`
- **Abnahme** – `<positiver Fall, Negativfall, plattformspezifische Probe und bestehende Invariante>`
- **Ergebnis** – `<Fix-/Testcommit, Urteil, verbleibende Grenze>`

### Annahmen und Revalidierung

| ID | Annahme und Entscheidung | Evidenz dafür | Stärkster Gegenfall oder alternative Erklärung | Perspektiven und Prüfer | Ergebnis und Auswirkung |
| --- | --- | --- | --- | --- | --- |
| A-001 | offen | offen | offen | z. B. fachliche Sollwerte und Datenschutz | offen |

Prüfe bei jeder risikorelevanten Annahme, ob sie auch unter einer anderen
Plattform, beim Fehler des nächsten Teilschritts oder mit einem unabhängigen
Sollwert trägt. Gib Perspektive, tatsächliche Quelle und Ergebnis an.
Dokumentiere, wenn der Gegencheck die Entscheidung geändert hat.

### Plan vor der Umsetzung

| Reihenfolge | Befund-IDs | Ziel und relevante Invarianten | Geänderte Pfade | Verifikation | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | offen | offen | offen | offen | geplant |

## `ABDECKUNG.tsv` · Register des Einzelreviews

Kopiere die Kopfzeile mit Tabulatoren. Erstelle für jede erfasste Einheit einen
Eintrag. Funktionen, Methoden, Klassen, Callbacks und relevante
Fehler-/Zustandsgrenzen bekommen einen eigenen Prüfstatus. Gruppiere mechanisch
gleichartige generierte oder unveränderte Fremdcodeartefakte, wenn Herkunft,
Relevanz und geprüfte Integration verlinkt sind. Erfasse eigene Patches daran
einzeln. Eine eindeutige ID umfasst die überprüfte Quelle und ein Symbol oder
eine stabile Stelle. Ein Fortschrittsstand nennt Zähler pro Prüfdimension.

```tsv
id	commit	pfad	zeile	symbol_oder_grenze	dimension	plattform_zweck	zweck_aufrufer	eingaben_vertrauen	zustand_nebenwirkungen	fehler_cleanup	invariante	test_oder_evidenz	befund_ids	status	bemerkung
```

| Status | Bedeutung |
| --- | --- |
| `GEPRÜFT` | Quellkörper und relevante Aufruffolge gelesen. Urteil und Nachweis benannt. |
| `TEILGEPRÜFT` | Teilbereich gelesen. Fehlende Pfade oder Plattformverzweigungen sind benannt. |
| `OFFEN` | Inventarisiert. Die Prüfung steht aus. |
| `BLOCKIERT` | Der benötigte Zugriff, Host, Test oder das Artefakt fehlt. |
| `AUSGENOMMEN` | Außerhalb des belegten Standalone-Umfangs oder unveränderter Fremdcode. Relevante Integration und Grund sind zugeordnet. |

## `ERGEBNIS.md` · Abschluss und Übergabe an Codex

### Identität und Umfang

| Gegenstand | Eintrag |
| --- | --- |
| Repository | `renepuhlmannarbeit/msg_gbh_DataSecure` |
| GitHub-Arbeitsbranch | `claude/rc178-standalone-review` mit direktem Link |
| Eingefrorener Einstieg | `<SHA des Einstiegsbranches vor den Änderungen>` |
| RC178-Produktbaseline | `v3.2.0-rc178` und `<geprüfter SHA und Fingerprint>` |
| Geprüfter Produktstand | `<SHA und Fingerprint, sofern Produktdateien geändert>` |
| Prüfumgebung | `<Claude-Modell, OS, Architektur, relevante Toolchain-Versionen>` |
| Abdeckung | `<Gesamtzahlen je Status und Link zum Register>` |

Der final veröffentlichte Berichtcommit und Remote-HEAD stehen in der
Übergabenachricht. Der Bericht bindet den bereits vorhandenen geprüften
Codecommit. Wenn der Berichtcommit später folgt, verifiziere, dass zwischen
ihnen ausschließlich die Übergabeunterlagen geändert wurden.

### Ergebnis auf einen Blick

1. Welche Nutzerprobleme oder technischen Fehler sind belegt und behoben?
2. Welche Annahmen wurden widerlegt oder mussten eingegrenzt werden?
3. Welche fachlichen, architektonischen und betrieblichen Grenzen bleiben?
4. Welche konkrete Stelle soll Codex zuerst überprüfen und warum?

### Änderungen je Thema

| Commit | Befund und Annahme | Betroffene Pfade und Verhalten | Test / Ergebnis | Auswirkungen auf weitere Plattformen |
| --- | --- | --- | --- | --- |
| offen | offen | offen | offen | offen |

Beschreibe auch begründet verworfene Änderungen und offene Befunde. Prüfe
betroffene Paket- und Workflowverträge mit. Ordne Sicherheits- oder
Fachbehauptungen exakt dem beobachteten Programmverhalten zu.

### Tests und Nachweise

| Bereich | Exakter Befehl und Teststand | Umgebung und Architektur | Ergebnis und Exitcode | Öffentlicher Nachweis oder kurze synthetische Beobachtung |
| --- | --- | --- | --- | --- |
| Reproduktion vor Fix | offen | offen | `NOT_RUN` | offen |
| Gezielt nach Fix | offen | offen | `NOT_RUN` | offen |
| Dokumentation und Headless | offen | offen | `NOT_RUN` | offen |
| Konverter / Rust / Clippy | offen | offen | `NOT_RUN` | offen |
| Windows x64 | offen | offen | `NOT_RUN` | offen |
| macOS Apple Silicon | offen | offen | `NOT_RUN` | offen |
| macOS Intel | offen | offen | `NOT_RUN` | offen |
| iOS-Simulator, falls ausgeführt | offen | offen | `NOT_RUN` | offen |

Ergebnisse können `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` oder
`NOT_APPLICABLE` sein. Begründe jeweils, welche konkrete Behauptung der
Test trägt. Eine vorhandene CI für einen früheren Commit ist ein
Baseline-Nachweis. Eine nicht ausgeführte Probe kann keine Abnahme belegen.

### Entscheidung zu iOS

| Ansatz | Wiederverwendbarer Core | Plattformbindung und Grenzen | Prüfbarer Nachweis | Aufwand und Entscheidung |
| --- | --- | --- | --- | --- |
| Native Aufnahme mit portierbarem Fachkern | offen | offen | offen | offen |
| Wiederverwendung geeigneter UI-Teile | offen | offen | offen | offen |

Trenne Zielgerätezugriff, lokale Simulatorprüfung und Veröffentlichung.
Gib die kleinste sinnvolle Anschlussprüfung an, einschließlich fehlender
Voraussetzungen und der Folgen für die macOS-Roadmap.

### Übergabenachricht zum Weiterreichen

```text
Claude-Code-Review für DataSecure RC178 abgeschlossen.
Branch: https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/tree/claude/rc178-standalone-review
Einstiegscommit: <SHA>
Geprüfter Codecommit: <SHA>
Veröffentlichter Remote-HEAD mit Bericht: <SHA>
Ergebnisbericht: <permanente GitHub-URL mit Berichtcommit zu ERGEBNIS.md>
Für Codex zuerst prüfen: <maximal drei konkrete, belegte Stellen und Risiken>
Offen oder blockiert: <betroffener Prüfpfad und Grund>
```
