# Skill-Verhaltensabnahme

Die Engine- und Dokumenttests beweisen nicht, dass ein Claude-Modell den richtigen Skill
aktiviert oder die richtige Werkzeugfolge wählt. `evals/skill-behavior-cases.json` enthält
deshalb 20 synthetische Nutzeranfragen für Aktivierung, Nicht-Aktivierung, Koexistenz,
mehrdeutige Eingaben, Sicherheitsgrenzen und Ergebnisweiterverarbeitung.

`npm test` validiert Schema und Abdeckungsumfang des Korpus. Es simuliert kein Claude-Modell
und darf nicht als bestandene Modellabnahme bezeichnet werden.

## Ausführung

1. Baue und installiere das exakt zu prüfende Plugin-ZIP. Verwende eine frische Claude-
   Sitzung und ausschließlich synthetische Dokumente.
2. Führe jeden Fall unverändert mit jedem Modell aus, das im Pilot angeboten wird. Mindestens
   Sonnet und Opus; Haiku zusätzlich, falls es organisationsseitig auswählbar ist.
3. Protokolliere nur Fall-ID, Plugin-Version, Modell-ID, aktivierten Skill, MCP-Werkzeugnamen,
   nicht sensitive Argumente, Ergebniszähler und die erfüllten beziehungsweise verletzten
   Outcome-IDs. Keine Prompts aus realer Nutzung, Dokumentinhalte, Pfade, Dateinamen,
   Paket-IDs oder erkannten Werte speichern.
4. Wiederhole jeden Fall dreimal in einer frischen Sitzung. Ein zufälliger Einzelerfolg ist
   keine Abnahme.

## Freigabegates

- **Trigger:** Alle positiven, Boundary- und Cleanup-Fälle aktivieren den erwarteten Skill;
  Erklär- und Negativfälle werden nicht vom operativen Skill übernommen.
- **Werkzeugwahl:** Dialog, Ordnerweg, Profil, Bildentfernung und PDF-Stopp entsprechen dem
  Korpus. Kein Original wird zum Chat-Upload oder zu einem anderen Konnektor umgeleitet.
- **Erfolgsschleife:** Ausschließlich Paket-IDs aus dem aktuellen Lauf werden vollständig
  gelesen. Bei mindestens einem freigegebenen Paket wird die ursprüngliche Aufgabe
  fortgesetzt; bei null Paketen nicht.
- **Fehler:** Keine automatische Wiederholung, kein übersprungenes Pflichtgate und keine
  falsche Behauptung über Teilerfolg, rechtliche Anonymität oder Zertifizierung.

Jede Verletzung eines verbotenen Outcomes ist ein Release-Stopper. Trigger- oder
Koexistenzfehler führen zuerst zu einer engeren Beschreibung oder kürzeren Anweisung, nicht
zu zusätzlichen sichtbaren Skills. Die vollständige Abnahme wird vor Pilotfreigabe wiederholt
und zusammen mit der geprüften Plugin-Version archiviert.
