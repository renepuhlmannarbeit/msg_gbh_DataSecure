# Kanonisches Dokumentensystem

Stand: 04.09.2026

## Rangfolge

1. [DECISIONS.md](DECISIONS.md) – angenommene, ersetzte und präzisierte Entscheidungen.
2. [PRODUCT_VISION.md](PRODUCT_VISION.md) – Nutzen, Zielgruppen und Experience-Prinzipien.
3. [PRODUCT.md](PRODUCT.md) – aktueller Produktvertrag und Nutzerreise.
4. [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) – technische Zielgrenzen.
5. [UML_ARCHITECTURE.md](UML_ARCHITECTURE.md) – codebasierte System-, Komponenten-, Sequenz-, Zustands- und Datensichten.
6. [STANDALONE_ARCHITECTURE.md](STANDALONE_ARCHITECTURE.md) und
   [STANDALONE_SECURITY_MODEL.md](STANDALONE_SECURITY_MODEL.md) – eigenständiges
   zweites Produkt, Sicherheitsgrenze, gemeinsamer Core und sichere MarkItDown-Einführung.
7. [REFACTORING_PLAN.md](REFACTORING_PLAN.md) – aktuelle sichere Lieferreihenfolge.
8. [BACKLOG.md](BACKLOG.md) – einzige aktive Arbeitsliste.
9. [CURRENT_STATE.md](CURRENT_STATE.md) – kompakter belegter Iststand.
10. [TRACEABILITY.md](TRACEABILITY.md) – Entscheidung zu Backlog und Evidence.
11. [TARGET_CAPABILITIES.json](TARGET_CAPABILITIES.json),
   [HOST_MATRIX_V1.json](HOST_MATRIX_V1.json) und `contracts/*` – maschinenlesbare
   Ziel-/Sicherheitsverträge.
12. [BACKLOG_EVIDENCE_MATRIX.md](BACKLOG_EVIDENCE_MATRIX.md) und
    [OPEN_SOURCE_COMPONENTS.md](OPEN_SOURCE_COMPONENTS.md) – Evidenz und Wiederverwendung.
13. [DOCUMENT_REGISTER.md](DOCUMENT_REGISTER.md) – Status aller aktuellen und
    historischen Dokumentklassen.
14. [BACKLOG_ARCHIVE_2026-08.md](BACKLOG_ARCHIVE_2026-08.md) und
    [BACKLOG_ARCHIVE_2026-09.md](BACKLOG_ARCHIVE_2026-09.md) – erledigte Stories.

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
[`docs/archive`](../archive/README.md). Sie sind zugänglich, aber nicht
entscheidungsführend.

Der aktuelle lokale Reviewvertrag steht in
[`contracts/BATCH_REVIEW_V2.md`](contracts/BATCH_REVIEW_V2.md). Version 1 bleibt
als ersetzter Entwurfsvertrag erhalten.

## Änderungsablauf

Entscheidung → Vision/Produkt/Architektur → Backlog → Code/Tests → Iststand und
Traceability → Anwender-/Betriebsdokumentation. Bei Widerspruch gilt das höher
rangige aktuelle Dokument. Ersetzte Entscheidungen werden nicht gelöscht.

`npm run test:docs` prüft Struktur, Referenzen, UAT-Verständlichkeit und die
DS-067-Grenzen. Automatisierte Evidenz ersetzt keine Zielsystem-, UX-, Fach- oder
Datenschutzabnahme.
