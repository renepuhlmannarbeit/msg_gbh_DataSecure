# Batch-Parallelität V1 – Sicherheits- und UX-Vertrag

Bezug: **BL-011.12**, DS-018, DS-021, DS-022, DS-023, DS-024, DS-036 und DS-040.

## Status und Nutzervertrag

Der Produktstandard ist **ein** serieller lokaler Dokumentworker. Eine spätere
ressourcenbegrenzte Parallelität ist eine rein interne Optimierung: Sie darf
höchstens **zwei** vorbereitende Dokumentworker aktivieren und bleibt für Cowork
unsichtbar. Der Nutzerweg bleibt eine Mehrfach-Dateiauswahl und ein Klick auf
„Öffnen“; es gibt keine Thread-, Worker-, CPU- oder Speicheroption, keine zusätzliche
Claude-Berechtigung und keinen zweiten parallelen Intake.

Der sichtbare Fortschritt und die lokale Zuordnung bleiben in ursprünglicher
Batch-Reihenfolge monoton. Eine Fertigstellungsreihenfolge darf nie die
Veröffentlichungs- oder Mapping-Reihenfolge bestimmen.

## Nicht verhandelbare Architekturgrenzen

1. Der bestehende Batch-Worker ist der alleinige **Koordinator und zentrale Committer**.
   `processBatchNext` wird nicht parallel aufgerufen und der globale aktive Lock wird
   nicht gelockert, bevor die folgenden Schutzmechanismen nachgewiesen sind.
2. Ein vorbereitender Worker erhält ausschließlich eine bereits verifizierte,
   versiegelte private Arbeitskopie samt Item- und Lease-ID über private IPC. Er darf
   weder Batch-Journal, Audit, Mapping, Manifest noch Output veröffentlichen und
   sendet keine Texte, Pfade, Namen, Hashes, Tokens oder Fehlerdetails zurück.
3. Der zentrale Committer prüft Lease und Stage-Bereich vor jedem irreversiblen Gate,
   führt finalen Residual-Gate, Audit, Mapping und atomare Paketveröffentlichung
   seriell aus und schreibt danach erst `delivery_pending`.
4. Es gibt einen lokalen, atomaren, 0600-geschützten Zwei-Slot- und
   batchbezogenen Lease-Store. Tote PIDs dürfen ausschließlich durch den zentralen
   Koordinator nach passender Batch-/Item-Zustandsprüfung kontrolliert bereinigt
   werden; unlesbare oder manipulierte Leases blockieren fail-closed.
5. Vor Snapshot-Start wird Speicher atomar reserviert: pro aktivem Stapel
   `2 × Batchgröße + Headroom`. Eine Reservierung materialisiert echte private
   Bytes statt Sparse-Dateien oder `ftruncate`; Workspace- und Output-Volume werden
   getrennt geprüft. Reservierungen werden erst im Terminalzustand oder kontrollierter
   Recovery freigegeben.
6. Das Mapping erhält einen eigenen exklusiven Commit-Lock oder einen atomaren,
   deduplizierten Append-only-Ledger. CSV bleibt daraus abgeleitet.
7. Parser- und OCR-Nebenprozesse zählen zum Gesamtbudget. Bei OCR ist höchstens ein
   rechenintensiver OCR-Lauf gleichzeitig aktiv. Ressourcenmangel fällt sicher auf
   einen seriellen Lauf zurück oder stoppt ohne Freigabe.

## Crash- und Freigaberegeln

Ein Crash vor dem zentralen Commit macht nur die betreffende Position retryfähig;
ein Crash nach atomarem Publish wird ausschließlich über die vorhandene
Paket-Reconcile-Logik übernommen. Weder ein bereits freigegebenes Paket noch eine
erfolgreich zugeordnete Quelle darf erneut verarbeitet werden. Bei Lease-,
Speicher-, Stage- oder Mapping-Unsicherheit wird nicht geraten: die betroffene
Position bleibt lokal gestoppt oder fortsetzbar, und es wird kein ungeprüftes Paket
freigegeben.

## Abnahme vor Aktivierung von zwei Workern

- Standard `1`, expliziter Feature-Flag für höchstens `2`; ohne Ressourcenfreigabe
  bleibt der Ablauf seriell.
- Zwei unterschiedlich schnelle synthetische Quellen: Packages, Audit und Mapping
  erscheinen exakt einmal und in Batch-Reihenfolge.
- Worker-Crash vor/nach Snapshot, vor/nach Publish und vor/nach Mapping: keine
  Doppelveröffentlichung, kein Verlust einer Mapping-Zeile und keine erneute
  Verarbeitung fertiger Positionen.
- Gleichzeitiger Start desselben Stapels, dritter Worker, tote und manipulierte
  Leases sowie erschöpfter reservierter Speicher: fail-closed getestet.
- Zwei Parser-lastige und zwei OCR-lastige Quellen: harte Ressourcenobergrenzen,
  Timeout und Prozessbereinigung auf Windows, macOS und Linux.
- MCP-, Diagnose-, Audit-, Mapping- und Export-Negativtests enthalten weiterhin
  keine Worker-Daten, Dateinamen, Quellpfade, Hashes, Batch-Tokens oder Rohinhalte.
