# Kanonisches Dokumentenregister

Stand: 25.08.2026

Dieses Register verhindert, dass historische Arbeitsstände oder abgeleitete
Handbücher neue Produktentscheidungen einführen.

| Rang | Dokument | Rolle | Zielgruppe | Normativ |
|---:|---|---|---|---|
| 1 | `DECISIONS.md` | angenommene und ausdrücklich ersetzte Entscheidungen | Product Owner, Architektur, Security | ja |
| 2 | `PRODUCT_VISION.md` | Problem, Nutzen, Experience-Prinzipien, Erfolg und Nicht-Ziele | alle Produktbeteiligten | ja |
| 3 | `PRODUCT.md` | konkrete Fähigkeiten und Benutzerreisen | Produkt, UX, Entwicklung | ja |
| 4 | `TARGET_ARCHITECTURE.md` | technische Zielgrenzen und Komponentenverträge | Architektur, Entwicklung, Security | ja |
| 5 | `BACKLOG.md` | einzige aktive priorisierte Arbeitsliste | Product Owner, Entwicklung | ja |
| 6 | `CURRENT_STATE.md` | evidence-basierter Ist-/Soll-Abgleich | Entwicklung, Test, Product Owner | ja für den belegten Iststand |
| 7 | `TRACEABILITY.md` | Entscheidung zu Story, Vertrag, Test und Evidenz | Governance, Test | ja |
| 8 | `TARGET_CAPABILITIES.json`, `HOST_MATRIX_V1.json`, `contracts/*` | maschinenlesbare Ziel- und Sicherheitsverträge | Build, Test, Runtime | ja im jeweiligen Geltungsbereich |
| 9 | `BACKLOG_EVIDENCE_MATRIX.md`, `OPEN_SOURCE_COMPONENTS.md` | Evidenz- und Wiederverwendungsregister | Test, Security, Entwicklung | ergänzend normativ |
| 10 | `BACKLOG_ARCHIVE_*.md` | abgeschlossene Arbeit mit Nachweisen | Audit, Product Owner | historischer Nachweis |

## Abgeleitete aktuelle Dokumentation

`README.md`, `docs/ANLEITUNG.md`, `docs/IT-BETRIEBSHANDBUCH.md`,
`docs/PILOT-ABNAHME.md`, `docs/RELEASE.md`, `docs/TESTING.md`, Plugin-Manifeste und
Skilltexte beschreiben freigegebenen Iststand und Bedienung. Sie dürfen keine
Entscheidung des Kanons verändern. Bei Drift werden sie aus Rang 1 bis 8 neu
abgeleitet.

## Historische, nicht entscheidungsführende Dokumente

- `ARCHITECTURE_DECISION.md`
- `docs/PRODUCT_ARCHITECTURE_DECISION.md`
- `docs/PLUGIN_TARGET_ARCHITECTURE.md`
- `docs/DEVELOPMENT_BACKLOG.md`
- `docs/REVIEW_CLAUDE_COWORK_UX_PERFORMANCE_2026-08-24.md`

`docs/COMPANION_API_V1.md` und `docs/COMPANION_IPC_V1.md` bleiben technische
Bestandsverträge. „Companion“ bezeichnet dort den internen lokalen Broker/Worker,
nicht eine separate Nutzeranwendung.

## Änderungsregel

Eine normative Änderung beginnt in `DECISIONS.md`, wird in Vision, Produkt und
Architektur abgeleitet, erhält eine lieferbare Backlog-Story und wird erst danach in
Iststand, Traceability, Verträgen, Handbüchern und Skills umgesetzt. Eine ersetzte
Entscheidung bleibt als Historie sichtbar und verweist auf ihre Nachfolge-ID.

