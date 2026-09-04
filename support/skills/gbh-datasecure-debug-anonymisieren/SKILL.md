---
name: gbh-datasecure-debug-anonymisieren
description: Manuell aktivierbarer IT-Supportlauf für dieselbe lokale DataSecure-Anonymisierung mit inhaltsfreier JSONL-Ablaufdiagnose. Nur aus dem ausdrücklich gekennzeichneten Debugpaket und nur zur Fehlersuche verwenden.
disable-model-invocation: true
---

# GBH DataSecure – Debuglauf

Diese Fähigkeit ist ausschließlich für eine bewusst gestartete Fehlersuche.
Sie verwendet exakt dieselbe Engine, dieselben Picker, Parser, Sicherheitsgates,
Worker, Reviewregeln und Ergebnisordner wie der normale Skill. Sie darf niemals
eine zweite oder abgeschwächte Anonymisierung ausführen.

## Start

1. Sage knapp, dass der Debuglauf lokal eine inhaltsfreie technische Spur
   mitschreibt. Sie enthält keine Dokumentinhalte, Dateinamen, Pfade, gefundenen
   Werte, Tokens oder Dokument-Hashes.
2. Rufe genau einmal `start_document_batch_from_picker` mit `mode=local_only`,
   `profile=auto` und dem vom Anwender gewünschten `source_kind` auf.
3. Nach bestätigtem Hand-off nicht pollen und keinen zweiten Start auslösen.
   Antworte wie im normalen Skill. Die lokale Verarbeitung läuft unabhängig von
   der Cowork-Antwort weiter.

## Fehlerdiagnose

- Wenn der Start bereits mit `ok=false` antwortet, rufe genau einmal
  `diagnostic_status` mit `limit=50` auf und fasse ausschließlich feste Phasen,
  Codes, Zähler, Dauern und zufällige `trace_id`/`run_id` zusammen.
- Wenn der Anwender später einen Hänger oder fehlenden Output meldet, rufe
  `diagnostic_status` einmal auf. Erfinde keine Ursache und gib niemals einen
  lokalen Pfad aus.
- `export_diagnostic_package` nur nach einer separaten ausdrücklichen Bitte des
  Anwenders und nur mit `confirmed=true` aufrufen. Der Export bleibt lokal.
- Keine Shell, keine allgemeinen Dateiwerkzeuge und keinen Chat-Upload als
  Diagnoseersatz verwenden.

## Protokollgrenze

Das lokale MCP spricht JSON-RPC über `stdio`; es handelt sich nicht um REST.
Rohes JSON-RPC, Argumente und Antworten werden bewusst nicht gespeichert, weil
sie private Tokens, Pfade oder Inhalte enthalten könnten. Die Supportspur ist
eine geschlossene JSON-Projektion aus Zeitpunkt, Version, technischem Ereignis,
festem Methoden-/Werkzeugnamen, Ergebnis, Dauer und festem Fehlercode.

Die Debugfähigkeit ist durch `disable-model-invocation: true` manuell gebunden.
Sie darf nicht automatisch aufgrund eines normalen Anonymisierungswunsches
geladen oder gestartet werden.
