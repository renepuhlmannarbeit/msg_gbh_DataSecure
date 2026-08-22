# Fehler und Datenhaltung

## Gestoppte Verarbeitung

Wiederhole einen gestoppten Lauf niemals automatisch. Beim Ordnerweg wird jede bestätigte
Datei in einem getrennten Aufruf versucht. `skip_stopped` entspricht stets der Zahl der
im aktuellen Mehrdateilauf zuvor gestoppten Dateien. Dadurch bleiben diese im Eingang,
werden während desselben Laufs übersprungen und die übrigen Dateien können weiterlaufen.

Rufe `diagnostic_status` auf und erkläre nur dessen feste Fehlercodes:

- `AMBIGUITY_REVIEW_REQUIRED`: Die konkrete Stelle muss lokal als „erhalten“ oder
  „anonymisieren“ entschieden werden. Diese Entscheidung ist nicht überspringbar.
- `PARSER_ISOLATION_FAILED`: Neuinstallation oder IT-Prüfung erforderlich. Starte den
  Parser niemals direkt als Umgehung.
- `PARSER_RESOURCE_LIMIT`: Nichts wurde freigegeben; keine automatische Wiederholung.
- `PDF_COVERAGE_UNVERIFIED`: PDF bleibt gesperrt und darf nicht per Chat-Upload umgangen
  werden.

Im Stapel stoppt nur die betroffene Datei. Arbeite ausschließlich mit den Paket-IDs,
die die einzelnen Aufrufe dieses bestätigten Laufs ausdrücklich als freigegeben melden.

## Aufbewahrung und Löschung

`privacy_status` zeigt die Aufbewahrungsfrist. Originale in `Processed`, Pakete in
`Output` und Review-Vorschauen verfallen. Bei `retention_days=0` sind visuelle Freigaben
nicht verfügbar; Original und Vorschau werden unmittelbar nach erfolgreicher Verarbeitung
entfernt.

Das Diagnosejournal ist auf 14 Tage beziehungsweise 200 Ereignisse begrenzt und enthält
keine Dateinamen, Pfade, Inhalte, erkannten Werte oder Dokument-Hashes. Ein separater,
metadatenbasierter Audit-Nachweis bleibt ohne diese Rohdaten außerhalb der Frist bestehen.

Für `purge_local_data` muss der Anwender Umfang und Bestätigung ausdrücklich nennen; beides
darf nicht hergeleitet oder erweitert werden. Der genaue Satz „Lösche alle lokalen
DataSecure-Daten; ich bestätige die Löschung“ erlaubt `scope=all, confirmed=true`.
