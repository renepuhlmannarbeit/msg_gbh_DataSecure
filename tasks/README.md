# Arbeitsaufträge

Das verbindliche Arbeitsprogramm steht ausschließlich in
[`docs/canonical/BACKLOG.md`](../docs/canonical/BACKLOG.md). `AUFTRAG.md` ist nur ein
optionaler zeitlich begrenzter Review-/Übergabeauftrag und darf das kanonische
Backlog oder Entscheidungsregister nicht verändern. Jeder neue Umsetzungsauftrag muss
mindestens eine konkrete Story `BL-nnn.x` nennen; reine Backlogpflege darf `BL-001`
zugeordnet werden. Abgeschlossene Aufträge liegen datiert in `archiv/`. Der
einzige aktuelle unabhängige Review- und Fixauftrag ist
[`CLAUDE-CODE-FOLGEAUFTRAG-GEGENREVIEW-RC93.md`](CLAUDE-CODE-FOLGEAUFTRAG-GEGENREVIEW-RC93.md).
Der abgeschlossene RC86-Auftrag, sein nicht kanonisches Ausführungsledger und
sein Abschlussbericht liegen im Archiv. Daneben liegt der
zeitgebundene Read-only-Gegenreview-Auftrag
[`CODEX-AUFTRAG-REVIEW-RC92.md`](CODEX-AUFTRAG-REVIEW-RC92.md); sein Ergebnis ist
allein der Bericht `CODEX-REVIEW-BERICHT-RC92.md`, Fixes setzt danach die
schreibende Hauptsession um.

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
