# Kanonisches Dokumentenregister

Stand: 31.08.2026

Dieses Register verhindert, dass historische Arbeitsstände oder abgeleitete
Handbücher neue Produktentscheidungen einführen.

| Rang | Dokument | Rolle | Zielgruppe | Normativ |
|---:|---|---|---|---|
| 1 | `DECISIONS.md` | angenommene und ausdrücklich ersetzte Entscheidungen | Product Owner, Architektur, Security | ja |
| 2 | `PRODUCT_VISION.md` | Problem, Nutzen, Experience-Prinzipien, Erfolg und Nicht-Ziele | alle Produktbeteiligten | ja |
| 3 | `PRODUCT.md` | konkrete Fähigkeiten und Benutzerreisen | Produkt, UX, Entwicklung | ja |
| 4 | `TARGET_ARCHITECTURE.md` | technische Zielgrenzen und Komponentenverträge | Architektur, Entwicklung, Security | ja |
| 5 | `REFACTORING_PLAN.md` | verbindliche Implementierungs-, Migrations- und Gate-Reihenfolge | Architektur, Entwicklung, Security, Product Owner | ja |
| 6 | `BACKLOG.md` | einzige aktive priorisierte Arbeitsliste | Product Owner, Entwicklung | ja |
| 7 | `CURRENT_STATE.md` | evidence-basierter Ist-/Soll-Abgleich | Entwicklung, Test, Product Owner | ja für den belegten Iststand |
| 8 | `TRACEABILITY.md` | Entscheidung zu Story, Vertrag, Test und Evidenz | Governance, Test | ja |
| 9 | `TARGET_CAPABILITIES.json`, `HOST_MATRIX_V1.json`, `contracts/*` | maschinenlesbare Ziel- und Sicherheitsverträge | Build, Test, Runtime | ja im jeweiligen Geltungsbereich |
| 10 | `BACKLOG_EVIDENCE_MATRIX.md`, `OPEN_SOURCE_COMPONENTS.md` | Evidenz- und Wiederverwendungsregister | Test, Security, Entwicklung | ergänzend normativ |
| 11 | `BACKLOG_ARCHIVE_*.md` | abgeschlossene Arbeit mit Nachweisen | Audit, Product Owner | historischer Nachweis |

## Abgeleitete aktuelle Dokumentation

`../RC81_DEFECT_ABSCHLUSS_2026-08-31.md` ist der lokale Korrektur- und
Regressionsnachweis für R80-01–17. Er ersetzt nicht die ursprüngliche Befundlage
in `../REVIEW_RC80_ANWENDUNG_UX_DATEN_PERFORMANCE_2026-08-31.md` und belegt keine
Cowork-/Zielsystemfreigabe. Offene Mutterstories bleiben in `BACKLOG.md`.

`STATUS_APP_PILOT_V1.md` ist der technische Teilvertrag für BL-042.3 im Geltungs-
bereich der DS-042/DS-055-Entscheidungen, kein neuer Produktbeschluss. Er beschreibt
den deaktivierten RC68-Pilot und seine fehlenden E1/E2-Nachweise.

`contracts/SEA_ASSEMBLY_EVIDENCE_V2.md` präzisiert das nicht freigegebene
Engineering-Assembly für BL-010.1/BL-010.8: Inhaltsbindung, Dateisystem-/ZIP-Gates,
Rollenintegration und echte Nachweispflichten. Keine neue Host- oder
Runtimefreigabe.

`contracts/SEA_PARSER_ROLE_V1.md` beschreibt die separate Engineering-Parserrolle,
feste Rechte, vollständige Bundle-Rekonstruktion, RC71-Parentbindung und die festen
RC72-Windows-Nebenrollen. Positiver Stapel-/Resume-Lifecycle, gesamte Nebenrollen-
Quellbindung, finale Rollenassembly und reale POSIX-Integration fehlen weiterhin.
Kein freigegebener ZIP-Produktpfad.

`README.md`, `docs/ANLEITUNG.md`, `docs/IT-BETRIEBSHANDBUCH.md`,
`docs/PILOT-ABNAHME.md`, `docs/RELEASE.md`, `docs/TESTING.md`, Plugin-Manifeste und
Skilltexte beschreiben freigegebenen Iststand und Bedienung. Sie dürfen keine
Entscheidung des Kanons verändern. Bei Drift werden sie aus Rang 1 bis 9 neu
abgeleitet.

## Historische, nicht entscheidungsführende Dokumente

Das [Review vom 31.08.2026](../REVIEW_CLAUDE_BEST_PRACTICES_2026-08-31.md) liefert
aktuelle technische Befunde, Quellen und Evidenzgrenzen. Arbeitsstatus ausschließlich
im kanonischen Backlog; keine eigenständige neue Produktentscheidung.

- `ARCHITECTURE_DECISION.md`
- `docs/PRODUCT_ARCHITECTURE_DECISION.md`
- `docs/PLUGIN_TARGET_ARCHITECTURE.md`
- `docs/DEVELOPMENT_BACKLOG.md`
- `docs/REVIEW_CLAUDE_COWORK_UX_PERFORMANCE_2026-08-24.md`

`docs/COMPANION_API_V1.md` und `docs/COMPANION_IPC_V1.md` bleiben technische
Bestandsverträge. „Companion“ bezeichnet dort den internen lokalen Broker/Worker,
nicht eine separate Nutzeranwendung.

## Änderungsregel

Eine normative Änderung beginnt in `DECISIONS.md`, wird in Vision, Produkt,
Architektur und Refactoring-Plan abgeleitet, erhält eine lieferbare Backlog-Story und wird erst danach in
Iststand, Traceability, Verträgen, Handbüchern und Skills umgesetzt. Eine ersetzte
Entscheidung bleibt als Historie sichtbar und verweist auf ihre Nachfolge-ID.
