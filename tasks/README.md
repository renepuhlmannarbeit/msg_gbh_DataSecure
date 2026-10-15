# Arbeitsaufträge

Das verbindliche Arbeitsprogramm steht ausschließlich in
[`docs/canonical/BACKLOG.md`](../docs/canonical/BACKLOG.md).

Es gibt zwei Auftragsarten, und sie haben unterschiedliche Rechte. Ein
**Read-only-Reviewauftrag** darf das kanonische Backlog und das
Entscheidungsregister nicht verändern; er liefert nur Befunde. Ein
**schreibender Auftrag** muss `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` gemeinsam mit Code und Tests fortschreiben — das ist die
Definition of Done aus `BACKLOG.md`. Neue `BL-nnn.x`- oder `DS-nnn`-Kennungen
vergibt ein Auftrag nie eigenmächtig; er schlägt sie vor und lässt sie
menschlich bestätigen. Namenskonvention im Root von `tasks/`:
`AUFTRAG-<ADRESSAT>-<RC>-<THEMA>.md`. Jeder neue Umsetzungsauftrag muss
mindestens eine konkrete Story `BL-nnn.x` nennen; reine Backlogpflege darf `BL-001`
zugeordnet werden. Abgeschlossene Aufträge liegen datiert in `archiv/`. Der
aktuelle schreibende Auftrag ist
[`AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md`](AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md).
Die sechs verknüpften Spezifikationen und die Aufgabenvorlage liegen unter
[`rc160-workflow`](rc160-workflow/VORLAGE.md). Sie definieren Ergebnisse und
Abnahme, sind aber keine zweite Statusliste. Der frühere RC123-Auftrag liegt
mit seinem damaligen Inhalt im [Archiv](archiv/AUFTRAG-CODEX-RC123-REDAKTIONSKERN.md). Der
abgeschlossene
RC93-Gegenreview-Auftrag und sein um den RC94-Gegencheck ergänzter Bericht liegen
im Archiv.
Der abgeschlossene RC86-Auftrag, sein nicht kanonisches Ausführungsledger und
sein Abschlussbericht liegen ebenfalls im Archiv.

Konvention für einen Auftrag:

- benennt jedes Finding mit Fundstelle (Datei und Funktion) und einer
  Reproduktion, die Ist und Soll zeigt
- sagt, was ausdrücklich **nicht** dazugehört, damit ein Commit nicht mehrere
  Themen vermischt
- endet mit Abnahmekriterien, die überprüfbar sind, statt mit einer Absicht
- nennt die zugehörigen kanonischen Entscheidungs- und Backlog-IDs
- benennt die Fehlerrichtung. Wo Über- und Unter-Redaktion gegeneinander stehen,
  ist Unter-Redaktion immer der schwerere Fehler: ein Fix, der einen echten
  Namen durchlässt, wird nicht ausgeliefert, sondern gemeldet
