# Arbeitsaufträge

Das verbindliche Arbeitsprogramm steht ausschließlich in
[`docs/canonical/BACKLOG.md`](../docs/canonical/BACKLOG.md). `AUFTRAG.md` ist nur ein
optionaler zeitlich begrenzter Review-/Übergabeauftrag und darf das kanonische
Backlog oder Entscheidungsregister nicht verändern. Jeder neue Umsetzungsauftrag muss
mindestens eine konkrete Story `BL-nnn.x` nennen; reine Backlogpflege darf `BL-001`
zugeordnet werden. Abgeschlossene Aufträge liegen datiert in `archiv/`. Der
einzige aktuelle unabhängige Review- und Fixauftrag ist
[`CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md`](CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md).
Sein abgeleitetes, nicht kanonisches Ausführungsledger ist
[`CLAUDE-CODE-ARBEITSBACKLOG-RC86.md`](CLAUDE-CODE-ARBEITSBACKLOG-RC86.md), der
zugehörige Abschlussbericht
[`CLAUDE-CODE-GESAMTREVIEW-BERICHT-RC86.md`](CLAUDE-CODE-GESAMTREVIEW-BERICHT-RC86.md).
Beide werden gemäß Auftrag erst nach Annahme archiviert.

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
