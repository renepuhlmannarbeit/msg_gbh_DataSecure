# Fehler und Datenhaltung

## Gestoppte Verarbeitung

Wiederhole einen gestoppten Lauf niemals automatisch. Der getrennte lokale Worker
verwaltet jede bestätigte Datei selbst; Claude steuert weder Einzeldateiaufrufe noch
Batch-Token. Der Server speichert Stopps und verarbeitet weitere zulässige Positionen.
Eine Änderung am privaten bestätigten Snapshot invalidiert den Stapel; spätere Änderungen
an den Originalen ändern die versiegelte Arbeitskopie nicht.

Im Normalmodus sind Diagnosewerkzeuge absichtlich nicht verfügbar. Jede Fehlerantwort
(`ok: false`) trägt stattdessen ein inhaltsfreies Objekt `diagnostic` mit
`gateway_version`, `phase` (z. B. `source_picker`, `folder_enumeration`, `intake_ack`),
dem festen Code `cause` (z. B. `LOCAL_SELECTION_REJECTED`, `LOCAL_PICKER_TIMEOUT`,
`LOCAL_IPC_ACK_TIMEOUT`, `BATCH_ACTIVE`, `ENGINE_NOT_READY`), dem festen Klartext `hint`,
dem Zeitpunkt `at`, `recorded` (ob die lokale Diagnose den Vorgang festgehalten hat)
und bei abgelehnten Ordnern den Zählern `files_total`/`files_rejected`. Nenne `hint`
und Version wörtlich, erkläre den Code nur mit diesem Hinweis und verweise bei weiterem
Diagnosebedarf an die IT. Starte kein Statuspolling und leite aus einem fehlenden Supportwerkzeug keinen
fehlenden Connector ab. Nur im ausdrücklich von der IT aktivierten Supportmodus darf
auf Diagnosewunsch `diagnostic_status` aufgerufen werden. Erkläre nur dessen feste Codes:

- `AMBIGUITY_REVIEW_REQUIRED`: Vor einer Freigabe muss die konkrete Stelle lokal als
  „erhalten“ oder „anonymisieren“ entschieden werden. Vertagen ist möglich, erteilt aber
  keine Freigabe. Eine später ausdrücklich bestätigte Fortsetzung startet die lokale Prüfung.
- `PARSER_ISOLATION_FAILED`: Neuinstallation oder IT-Prüfung erforderlich. Starte den
  Parser niemals direkt als Umgehung.
- `PARSER_RESOURCE_LIMIT`: Nichts wurde freigegeben; keine automatische Wiederholung.
- `PARSER_COVERAGE_UNVERIFIED`: Der extrahierte Inhalt war nicht nachweislich vollständig.
- `FORMAT_COVERAGE_UNVERIFIED`: Im Cowork-Pilot sind TXT, Markdown, CSV und DOCX
  direkt sowie XLSX/PPTX über lokal extrahiertes Markdown freigegeben. PDF,
  Scan-PDF und Bilder bleiben gesperrt.
- `UNSAFE_STORAGE_LOCATION`: Der konfigurierte Ordner liegt in einem bekannten Cloud-Sync-
  oder Netzwerkpfad.
- `PDF_COVERAGE_UNVERIFIED`: PDF bleibt gesperrt und darf nicht per Chat-Upload umgangen
  werden.
- `LOCAL_MAPPING_EXPORT_FAILED`: Es wurde kein Ergebnis freigegeben, weil die lokale
  Zuordnungsübersicht nicht sicher aktualisiert werden konnte. Nicht automatisch
  wiederholen; die lokale Speicherberechtigung beziehungsweise den Exportordner prüfen.

Im Stapel stoppt nur die betroffene Datei, solange der Snapshot unverändert ist.
Im Normalweg verwaltet der lokale Ergebnis-Handoff Paketkennungen und Leseberechtigungen
vollständig serverseitig. Nur im IT-Supportmodus darf mit `package_id` und
`read_capability` gearbeitet werden, die derselbe erfolgreiche Aufruf meldet. Die
Leseberechtigung ist kurzlebig und kann keine anderen Pakete öffnen.

## Aufbewahrung und Löschung

Im IT-Supportmodus zeigt `privacy_status` die Aufbewahrungsfrist. Private
Batch-Arbeitskopien werden nach ihrem sicheren Lebenszyklus bereinigt;
Review-Vorschauen verfallen. Pakete in `Output` bleiben dauerhaft und sind nur
ausdrücklich bestätigt löschbar. Historische Einträge in `Processed` können
Originale aus älteren Builds sein und werden weder automatisch noch durch
`purge_local_data` gelöscht. Ihre Quelle – lokal, auf einem Netzlaufwerk oder künftig
in SharePoint – bleibt unverändert und wird niemals von DataSecure gelöscht,
verschoben oder überschrieben. Bei `retention_days=0` werden nur verwaltete private
Kopien und Vorschauen unmittelbar nach erfolgreicher Verarbeitung entfernt; eine
visuelle Freigabe ist dann nicht verfügbar und bleibt im öffentlichen Pilot
unabhängig davon deaktiviert.

`private_work_copy_cleanup_pending` ist nur ein lokaler Zähler für eine nach einer
bereits bestätigten Übergabe noch nicht entfernte private Arbeitskopie. Er enthält keine
Datei- oder Batchkennung. Die nächste sichere Batch-Verarbeitung und der Serverstart
versuchen die reguläre Bereinigung erneut; der Zähler ist kein Anlass, ein Ergebnis zu
widerrufen oder dieselbe Quelle erneut zu verarbeiten.

`expired_batch_cleanup_pending` zählt ausschließlich abgelaufene lokale Batch-Snapshots,
deren sichere Bereinigung noch aussteht. Er enthält weder Batch-ID noch Dokumentanzahl,
Name, Pfad oder Inhalt. Der Zähler bedeutet nicht, dass Daten an Claude gelangt sind;
er ist ein Hinweis für IT, die lokale Wartung beziehungsweise Zugriffsrechte zu prüfen.

Das Diagnosejournal ist auf 14 Tage beziehungsweise 200 Ereignisse begrenzt und enthält
keine Dateinamen, Pfade, Inhalte, erkannten Werte oder Dokument-Hashes. Ein separater,
metadatenbasierter Audit-Nachweis bleibt ohne diese Rohdaten außerhalb der Frist bestehen.

`purge_local_data` ist nur im ausdrücklich aktivierten IT-Supportmodus verfügbar.
Im Normalmodus verweise an die IT; keine Löschung über allgemeine Dateisystemwerkzeuge.
Für `purge_local_data` muss der Anwender Umfang und Bestätigung ausdrücklich nennen;
beides darf nicht hergeleitet oder erweitert werden. `Output` und `Review` sind die
löschbaren Bereiche. `scope=processed` stoppt bei geschützten Altquellen; `scope=all`
prüft `Processed` zuerst und stoppt bei Bestand oder unvollständiger Inspektion ohne
Teilmutation. Weise dann auf die bewusste lokale IT-Prüfung hin, statt eine Löschung
zu behaupten.
