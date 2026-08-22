# Kanonisches Dokumentensystem

Stand: 22.08.2026

Dieser Ordner ist die verbindliche Quelle für die Weiterentwicklung von GBH
DataSecure. Er trennt das heute ausführbare RC30-System vom beschlossenen
Produktziel. Ältere Architektur-, Review- und Backlogdateien bleiben als
Entstehungsnachweis erhalten, dürfen aber keine Entscheidung in diesem Ordner
überschreiben.

## Rangfolge

1. [DECISIONS.md](DECISIONS.md) – angenommene Produktentscheidungen und ihre Gründe.
2. [PRODUCT.md](PRODUCT.md) – daraus abgeleitetes Zielprodukt und Benutzerablauf.
3. [BACKLOG.md](BACKLOG.md) – einzige priorisierte Arbeitsliste für das Zielprodukt.
4. [CURRENT_STATE.md](CURRENT_STATE.md) – belegter RC30-Ist-Abgleich, damit vorhandene
   Funktionen nicht erneut geplant werden.
5. [TRACEABILITY.md](TRACEABILITY.md) – Zuordnung jeder Entscheidung zu Umsetzung
   und Abnahmenachweis.
6. [TARGET_CAPABILITIES.json](TARGET_CAPABILITIES.json) – maschinenlesbarer,
   ausdrücklich nicht als Runtime-Freigabe verwendbarer Zielvertrag.
7. Bestehende Betriebs-, Test- und Architekturunterlagen – beschreiben RC30 oder
   liefern Detailwissen, sind aber nicht entscheidungsführend.

Bei einem Widerspruch gilt die höher stehende Quelle. Eine neue Entscheidung erhält
eine neue `DS-nnn`-ID. Bestehende Entscheidungen werden nicht still editiert:
Änderungen verweisen mit `ersetzt DS-nnn` auf die frühere Entscheidung. `BL-nnn`
bezeichnet ein dauerhaftes Epic; eine konkrete Umsetzung beginnt grundsätzlich über
eine lieferbare Story `BL-nnn.x` in `BACKLOG.md`. Reine Pflege am kanonischen System
darf direkt dem Epic `BL-001` zugeordnet werden.

## Statusbegriffe

- **IST:** im aktuellen, getesteten RC tatsächlich implementiert.
- **ZIEL:** beschlossen, aber nicht automatisch implementiert.
- **GO Abnahme:** mit synthetischen Daten testbar.
- **GO Pilot:** für den festgelegten Pilotumfang freigegeben.
- **NO-GO:** darf für den genannten Zweck nicht eingesetzt werden.

Backlogstatus werden streng verwendet: **offen** bedeutet noch nicht begonnen,
**in Arbeit** besitzt überprüfbare aktuelle Änderungen, **blockiert** nennt einen
konkreten externen Hinderungsgrund und **erledigt** erfüllt die Definition of Done.
Eine wiederverwendbare technische Basis macht ein Epic deshalb noch nicht erledigt.

## Änderungsablauf

1. Entscheidung mit ID erfassen oder ausdrücklich ersetzen.
2. `PRODUCT.md` nur dann anpassen, wenn sich das Zielverhalten ändert.
3. Backlogposition mit Entscheidungs-IDs und messbarer Abnahme ergänzen.
4. Ist-Abgleich und Traceability aktualisieren.
5. `npm run test:docs` sowie die betroffenen Produkt- und Artefakttests ausführen.
6. Erst danach README, Handbücher, Skills und Marketplace-Texte ableiten.

`scripts/verify-canonical-docs.mjs` verhindert fehlende oder verwaiste
Entscheidungs- und Story-IDs. `tests/test-capability-contract.js` trennt zusätzlich
den Zielvertrag von den aktuell freigegebenen Runtime-Fähigkeiten und blockiert
Widersprüche zwischen Runtime, Skills, Marketplace und aktiven Handbüchern. Diese
Prüfungen ersetzen kein fachliches Review, machen Drift aber sichtbar.

Verbindliche technische Zielverträge liegen unter `contracts/`. Sie dürfen einen
Produktpfad erst dann als freigegeben markieren, wenn die zugehörigen Backlog-
Abnahmen tatsächlich bestanden sind.
