# Fehler und Datenhaltung

## Gestoppte Verarbeitung

Wiederhole einen gestoppten Lauf niemals automatisch. Beim Ordnerweg wird jede bestätigte
Datei in einem getrennten Aufruf mit demselben `batch_token` versucht. Der Server markiert
Stopps dauerhaft in dieser Sitzung und setzt mit der nächsten Datei fort. Eine Änderung am
bestätigten Input invalidiert den gesamten Stapel.

Rufe `diagnostic_status` auf und erkläre nur dessen feste Fehlercodes:

- `AMBIGUITY_REVIEW_REQUIRED`: Die konkrete Stelle muss lokal als „erhalten“ oder
  „anonymisieren“ entschieden werden. Diese Entscheidung ist nicht überspringbar.
- `PARSER_ISOLATION_FAILED`: Neuinstallation oder IT-Prüfung erforderlich. Starte den
  Parser niemals direkt als Umgehung.
- `PARSER_RESOURCE_LIMIT`: Nichts wurde freigegeben; keine automatische Wiederholung.
- `PARSER_COVERAGE_UNVERIFIED`: Der extrahierte Inhalt war nicht nachweislich vollständig.
- `FORMAT_COVERAGE_UNVERIFIED`: Im Pilot sind nur TXT und DOCX freigegeben.
- `UNSAFE_STORAGE_LOCATION`: Der konfigurierte Ordner liegt in einem bekannten Cloud-Sync-
  oder Netzwerkpfad.
- `PDF_COVERAGE_UNVERIFIED`: PDF bleibt gesperrt und darf nicht per Chat-Upload umgangen
  werden.

Im Stapel stoppt nur die betroffene Datei, solange der Snapshot unverändert ist. Arbeite
ausschließlich mit `package_id` und `read_capability`, die derselbe erfolgreiche Aufruf
meldet. Die Leseberechtigung ist kurzlebig und kann keine anderen Pakete öffnen.

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
