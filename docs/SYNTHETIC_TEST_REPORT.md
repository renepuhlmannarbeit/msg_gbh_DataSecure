# SYNTHETIC TEST REPORT – DEMO ONLY

> **Wichtig:** Dieser Report ist ein synthetisches Beispiel und **kein Nachweis eines tatsächlich ausgeführten Produktivtests**. Er dient als Vorlage für CI/CD und spätere Abnahmeberichte.

## Testgegenstand

EU Privacy Document Gateway / geplanter Claude Plugin-Workflow

Profil: `personnel_profile`

Fixture: `tests/fixtures/synthetic-personnel-profile.md`

Expected Output: `tests/expected/synthetic-personnel-profile.expected.md`

## Ziel

Prüfen, ob ein Mitarbeiterprofil vor der Weitergabe an Claude lokal de-identifiziert wird, während fachlich relevante Informationen erhalten bleiben.

## Synthetische Ausgangsdaten

Enthalten sind absichtlich erfundene Identifikatoren:

- Personenname: Erika Beispiel
- Arbeitgeber: Nordlicht Digital GmbH
- Standort und Adresse: Hamburg, Speicherstraße 12
- Kunde: HanseCargo AG
- Projekt: Projekt Orion
- E-Mail-Adresse
- Telefonnummer
- Mitarbeiternummer

Außerdem enthält das Fixture fachlich relevante Inhalte wie Product Owner, Business Analyst, Scrum, SAFe, Jira, Confluence und Miro.

## Erwartete Privacy-Regeln

| Kategorie | Erwartung |
|---|---|
| Personenname | pseudonymisieren |
| Arbeitgeber | pseudonymisieren |
| Kunde | pseudonymisieren |
| Projektbezeichnung | pseudonymisieren |
| genaue Adresse / Standort | generalisieren oder entfernen |
| E-Mail | entfernen |
| Telefon | entfernen |
| Mitarbeiternummer | entfernen |
| Rollen und Skills | erhalten |
| Methoden und Technologien | erhalten |
| Zeiträume | grundsätzlich erhalten |

## Beispielhafte erwartete Ergebnisse

- `ERIKA BEISPIEL` darf im freigegebenen Output nicht vorkommen.
- `Nordlicht Digital GmbH` darf im freigegebenen Output nicht vorkommen.
- `HanseCargo AG` darf im freigegebenen Output nicht vorkommen.
- `erika.beispiel@example.invalid` darf im freigegebenen Output nicht vorkommen.
- `Product Owner`, `Scrum`, `Jira` und `Confluence` sollen erhalten bleiben.

## Beispielstatus

**DEMO STATUS: EXPECTED PASS**

Dieser Status ist nur die Soll-Erwartung. Ein echter CI-Test muss den erzeugten Output mit dem Expected Output bzw. mit Assertions vergleichen und bei verbleibenden direkten Identifikatoren fehlschlagen.

## AI-Act-Hinweis

Das Privacy-Gateway ist eine Vorverarbeitung und keine Freigabe eines nachgelagerten HR-Anwendungsfalls. Eine reine Kompetenzzusammenfassung ist von einer automatisierten Auswahl-, Ranking-, Beförderungs- oder Beschäftigungsentscheidung zu unterscheiden. Der nachgelagerte Zweck muss separat bewertet und dokumentiert werden.

## Empfohlene CI-Assertions

1. Keine direkten synthetischen Identifikatoren im freigegebenen Markdown.
2. Erwartete Pseudonyme vorhanden.
3. Fachliche Schlüsselbegriffe bleiben vorhanden.
4. Kein Rohdokument im Output-/Release-Artefakt.
5. Bei visuellen Assets: nur explizit freigegebene, geprüfte Assets im Claude-lesbaren Paket.
6. Manipulationsprüfung von Markdown und Assets über SHA-256.

---

Erstellt als **synthetische Testvorlage**, nicht als Compliance-Zertifikat oder Rechtsnachweis.
