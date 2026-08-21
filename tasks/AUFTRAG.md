# Aktueller Arbeitsauftrag

**Derzeit kein offener Auftrag.** Abgeschlossene Aufträge liegen datiert in
`tasks/archiv/`, die Konvention steht in `tasks/README.md`.

## Offener Rückstand

Nicht als Auftrag formuliert, aber bekannt und dokumentiert:

- **Aufbewahrung und Löschung.** `Processed`, `Output` und die Review-Bilder
  erfolgreicher Läufe wachsen unbegrenzt; aufgeräumt werden nur die
  Review-Items gescheiterter Läufe. Ein Datenschutzwerkzeug legt damit ein
  unverwaltetes Archiv genau der Daten an, die es schützen soll — inklusive
  Bewerbungsfotos. Als „Known gap" in `docs/PLUGIN_SECURITY_MODEL.md`
  beschrieben, prozedural als Regel 3 in `docs/ANLEITUNG.md` abgefedert.
  Braucht ein konfigurierbares Aufbewahrungsfenster, ein `purge_local_data`-Tool
  mit expliziter Bestätigung und die Löschung einer Review-Preview nach
  Freigabe oder Verwerfen.
- **Windows-Abnahme.** OCR gegen ein echtes Scan-Dokument und
  EMF/WMF-Rasterisierung über die PowerShell-Bridge lassen sich in CI nicht
  prüfen. Checkliste in `docs/RELEASE.md`. Erster Punkt dort: Installation auf
  einem Rechner **ohne** Node, dann `privacy_status` — davon hängt ab, welcher
  Rollout-Weg überhaupt möglich ist.
- **`LICENSE`.** Platzhalter, als ungeprüft markiert, wartet auf die
  juristische Prüfung.
