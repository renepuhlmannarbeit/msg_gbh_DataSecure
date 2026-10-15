# Vorlage für eine Standalone Umsetzungsaufgabe

Diese Vorlage konkretisiert den [Gesamtauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md).
Status ausschließlich in [BACKLOG](../../docs/canonical/BACKLOG.md).

## Auftrag und Nutzerproblem

Datum, vorhandene BL-/DS-Zuordnung, Produkt/Zweck, begrenztes Ergebnis und
betroffene Nutzer benennen. Reproduktion mit synthetischer Quelle, Ist/Soll,
Datei/Funktion und beobachteter beziehungsweise nur statischer Belegstärke.

## Fachliche und technische Regeln

Originalschutz, Modustrennung, Inhalts-/Pixelgrenze, freigegebene Revision und
inhaltsfreie Diagnose explizit bewahren. UI-Text, einzige Hauptaktion und
Nebenaktionen pro Zustand angeben. Busy, leer, Pause, Fehler, alte Generation,
Neustart und Bestätigungsunsicherheit gehören zur Zustandstabelle.

API-/DTO-/Persistenzänderungen geschlossen definieren; alte Journale,
Prüfentscheidungen und Exportpläne nicht rückwirkend verändern. Abhängigkeiten,
Kapazitätsgrenzen, Kosten-/Offlineverhalten und Nicht-Ziele benennen.

## Umsetzung und Abnahme

Regression zuerst rot ausführen. Produktionspfad ändern, nicht nur Mock oder
Stringassertion. Dann positive/negative Unit-, Gateway-/IPC-/Rust-, Browser-
und gegebenenfalls exakte Pakettests. Namen, Inhalte, Revisionen, Hashes,
Schreibwirkungen und Prozessende prüfen. Einzeln benennen, welche native
Bedien-/Mac-/menschliche Fachprüfung erforderlich bleibt.

Unabhängiger Read-only-Gegenreview nach der Lieferung und vor dem Paket.
Gegenbefunde mit Regression beheben. Backlog, Iststand, Traceability und
Evidence gemeinsam aktualisieren; Befehle, Quell-/Paketbindung und verbliebene
Grenzen verlinken. Grüne Teiltests nicht zur Gesamtfreigabe erklären.
