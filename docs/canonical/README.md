# Kanonisches Dokumentensystem

Stand: 06.09.2026

## Autorität nach Dokumentklasse

Eine einzige lineare Rangfolge wäre missverständlich: Iststand, Zielbild,
Entscheidung und Testevidenz beantworten unterschiedliche Fragen.

| Frage | Führendes Dokument | Ergänzung |
|---|---|---|
| Welche Produktentscheidung gilt? | [DECISIONS.md](DECISIONS.md) | [TRACEABILITY.md](TRACEABILITY.md) nennt Status und Nachweis. |
| Was ist heute wirklich implementiert? | [CURRENT_STATE.md](CURRENT_STATE.md) | Grüne Tests und Evidence belegen nur ihren definierten Umfang. |
| Was soll das Produkt leisten? | [PRODUCT_VISION.md](PRODUCT_VISION.md), [PRODUCT.md](PRODUCT.md) | Zielarchitektur und Verträge konkretisieren das Soll. |
| Wie sind die technischen Grenzen? | [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), [UML_ARCHITECTURE.md](UML_ARCHITECTURE.md) | [STANDALONE_ARCHITECTURE.md](STANDALONE_ARCHITECTURE.md) und [STANDALONE_SECURITY_MODEL.md](STANDALONE_SECURITY_MODEL.md) gelten zusätzlich für Standalone. |
| Was wird als Nächstes gebaut? | [BACKLOG.md](BACKLOG.md) | [REFACTORING_PLAN.md](REFACTORING_PLAN.md) bestimmt die sichere Reihenfolge. |
| Welche maschinenlesbaren Grenzen gelten? | [TARGET_CAPABILITIES.json](TARGET_CAPABILITIES.json), [HOST_MATRIX_V1.json](HOST_MATRIX_V1.json), `contracts/*` | Ein Zielvertrag ist keine Istfreigabe. |
| Welche Abnahme fehlt? | [BACKLOG_EVIDENCE_MATRIX.md](BACKLOG_EVIDENCE_MATRIX.md) | Zielhost-/UX-/Fachevidence bleibt menschlich. |
| Welche Open-Source-Komponente ist zugelassen? | [OPEN_SOURCE_COMPONENTS.md](OPEN_SOURCE_COMPONENTS.md) | Version, Zweck und Aktivierungsgrenze sind verbindlich. |
| Gilt eine Funktion für beide Produkte? | Produkt-/Modusmatrix in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) | Standalone-Konvertierung ist keine Formatfreigabe der Anonymisierung oder des Cowork-Plugins. |
| Wo ist der Status einer Datei dokumentiert? | [DOCUMENT_INDEX.json](DOCUMENT_INDEX.json), [DOCUMENT_REGISTER.md](DOCUMENT_REGISTER.md) | Der Index ist maschinenlesbar; Archive bleiben zugänglich, aber nicht entscheidungsführend. |

Erledigte Storys bleiben in [BACKLOG_ARCHIVE_2026-08.md](BACKLOG_ARCHIVE_2026-08.md)
und [BACKLOG_ARCHIVE_2026-09.md](BACKLOG_ARCHIVE_2026-09.md) nachvollziehbar.

## Aktuelle abgeleitete Dokumente

- [Anleitung](../ANLEITUNG.md)
- [IT-Betriebshandbuch](../IT-BETRIEBSHANDBUCH.md)
- [Pilot-/UAT-Abnahme](../PILOT-ABNAHME.md)
- [Security-Modell](../PLUGIN_SECURITY_MODEL.md)
- [Release-Vertrag](../RELEASE.md)
- [Testvertrag](../TESTING.md)
- [aktueller Claude-/Cowork-Abgleich](../REVIEW_CLAUDE_COWORK_2026-09-01.md)
- [versionneutrales UAT-Kit](../acceptance/UAT_TEST_KIT/README.md)
- [Standalone-UAT-Kit](../acceptance/STANDALONE_UAT_TEST_KIT/README.md)

Historische RC-Berichte und frühere Vollstände liegen unter
[`docs/archive`](../archive/README.md). Der
[stabile Archivindex](../archive/INDEX.md) ordnet wichtigen Beständen dauerhafte
`ARCH-*`-Kennungen zu. Sie sind zugänglich, aber nicht
entscheidungsführend.

Der aktuelle lokale Reviewvertrag steht in
[`contracts/BATCH_REVIEW_V2.md`](contracts/BATCH_REVIEW_V2.md). Version 1 bleibt
als ersetzter Entwurfsvertrag erhalten.

## Änderungsablauf

Entscheidung → Vision/Produkt/Architektur → Backlog → Code/Tests → Iststand und
Traceability → Anwender-/Betriebsdokumentation. Bei Widerspruch wird zuerst die
Dokumentklasse bestimmt: `CURRENT_STATE` darf ein Ziel begrenzen, eine spätere
aktive Entscheidung ersetzt eine frühere, und Testevidence belegt nur den
benannten Testumfang. Ersetzte Entscheidungen werden nicht gelöscht.

`npm run test:docs` prüft Struktur, Referenzen, UAT-Verständlichkeit und die
DS-067-Grenzen. Aktive Dateien aus `DOCUMENT_INDEX.json` werden in die lokale
Linkprüfung aufgenommen; DS-085/086 und negative Driftprüfungen schützen die
Produkt-/Modustrennung. Historische Reviews bleiben Befunde zum damaligen Stand,
nicht eine zweite offene Arbeitsliste. Ihre Auflösung steht im Backlog und im
verlinkten Korrekturbericht. Automatisierte Evidenz ersetzt keine Zielsystem-, UX-, Fach- oder
Datenschutzabnahme.
