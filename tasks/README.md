# Arbeitsaufträge

Das verbindliche Arbeitsprogramm steht ausschließlich in
[`docs/canonical/BACKLOG.md`](../docs/canonical/BACKLOG.md). `AUFTRAG.md` ist nur ein
optionaler zeitlich begrenzter Review-/Übergabeauftrag und darf das kanonische
Backlog oder Entscheidungsregister nicht verändern. Jeder neue Umsetzungsauftrag muss
mindestens eine konkrete Story `BL-nnn.x` nennen; reine Backlogpflege darf `BL-001`
zugeordnet werden. Abgeschlossene Aufträge liegen datiert in `archiv/`. Derzeit
liegt kein aktiver ausführbarer Review- oder Fixauftrag vor. Der abgeschlossene
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
