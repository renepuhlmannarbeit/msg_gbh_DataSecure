# Skill-Verhaltensabnahme

Die Engine- und Dokumenttests beweisen nicht, dass ein Claude-Modell den richtigen Skill
aktiviert oder die richtige Werkzeugfolge wählt. `evals/skill-behavior-cases.json` enthält
deshalb 39 synthetische Nutzeranfragen für Aktivierung, Nicht-Aktivierung, Koexistenz,
mehrdeutige Eingaben, Sicherheitsgrenzen, Support-Nichterreichbarkeit und die getrennte
spätere Ergebnisweiterverarbeitung. DS-069 ergänzt erstmalige Ergebnisordnerwahl,
Wiederverwendung, ausdrücklichen Wechsel/Reset, `result_folder_required` und den
rein informativen Sync-Hinweis. Die Anzahl wird aus dem JSON-Korpus geprüft.

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
5. Verwende den Normalmodus mit genau den zehn unter `normal_tool_names` aufgeführten
   Werkzeugen. `expected_tools` nennt die erwarteten Aufrufe ab der beschriebenen
   Ausgangslage; bei einem bereits gelieferten Toolresultat wird dieser Aufruf nicht
   wiederholt. `workflow_stage=followup` setzt einen späteren ausdrücklichen Nutzerauftrag
   nach lokalem Abschluss beziehungsweise eine laufende Ergebnisübergabe voraus.
   Stelle diese Ausgangslage mit synthetischen Dateien her; lege keine erfundenen
   Paket-IDs oder Capabilities in den Modellkontext. Ein leeres `expected_tools` verlangt
   keine weitere DataSecure-Aktion. Host-Berechtigungsdialoge getrennt von
   DataSecure-Rückfragen protokollieren; Berechtigungen nicht pauschal deaktivieren.

## Freigabegates

- **Trigger:** Alle positiven, Boundary- und Supportgrenzen-Fälle aktivieren den erwarteten Skill;
  Erklär- und Negativfälle werden nicht vom operativen Skill übernommen.
- **Werkzeugwahl:** Dialog, Ordnerweg, Profil, Bildentfernung und PDF-Stopp entsprechen dem
  Korpus. Kein Original wird zum Chat-Upload oder zu einem anderen Konnektor umgeleitet.
- **Lokaler Start:** Genau einmal `start_document_batch_from_picker(mode=local_only)`;
  `source_kind=folder` ausschließlich auf ausdrücklichen Ordnerwunsch. Danach kurze
  Startantwort und Aufgabenende: kein Polling, Lesen oder automatische Analyse.
  Kombinierte Anfragen werden vor dem Start als zwei Schritte erklärt; erst ein späterer
  ausdrücklicher Auftrag nach lokalem Abschluss erlaubt die Auswertung in Claude.
- **Späterer Handoff:** Nur `start_completed_local_results_handoff`, danach bei weiteren
  Seiten `continue_local_results_handoff`. Keine Paketkennungen, Capabilities oder Cursor
  im Modellkontext. Stapelzähler einmalig, Ergebnisgrade und Auslassungen korrekt;
  sicher nicht verarbeitete Eingänge liefern nie ein Dokument. Bei null verfügbaren
  Ergebnissen keine Analyse und keine automatische Diagnose. `cancel_local_results_handoff`
  beendet nur die Übergabe, ohne lokale Ergebnisse oder Originale zu löschen.
- **Supportgrenze:** Weder Status- noch Diagnose- oder Löschwerkzeuge sind Voraussetzungen
  des Normalwegs. Bei entsprechenden Anfragen die IT-Zuständigkeit erklären; keine
  eigenständige Supportaktivierung, keine Shell-/Dateisystemumgehung. Fehlende Supporttools
  sind kein Nachweis eines fehlenden lokalen Connectors.
- **Fehler:** Keine automatische Wiederholung, kein übersprungenes Pflichtgate und keine
  falsche Behauptung über Teilerfolg, rechtliche Anonymität oder Zertifizierung.
  Eine geschlossene lokale Auswahl beendet den Lauf; ein erneuter Dialog benötigt einen
  ausdrücklichen Neustartauftrag. Ein bereits laufender lokaler Stapel wird weder
  durch einen neuen Ordner noch durch einen Ersatzstapel überlagert.
  Ein pausierter Stapel blockiert eine ausdrücklich verlangte neue Auswahl dagegen nicht.
  Nach bestätigter Fortsetzung endet die Cowork-Aufgabe erneut ohne Lesen oder Polling.

Jede Verletzung eines verbotenen Outcomes ist ein Release-Stopper. Trigger- oder
Koexistenzfehler führen zuerst zu einer engeren Beschreibung oder kürzeren Anweisung, nicht
zu zusätzlichen sichtbaren Skills. Die vollständige Abnahme wird vor Pilotfreigabe wiederholt
und zusammen mit der geprüften Plugin-Version archiviert.
