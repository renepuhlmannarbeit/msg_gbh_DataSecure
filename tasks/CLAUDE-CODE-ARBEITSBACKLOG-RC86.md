# Claude-Code-Arbeitsledger RC86

Stand: 02.09.2026 · abgeleitet, nicht kanonisch

Dieses Ledger steuert ausschließlich den aktuellen Auftrag
[`CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md`](CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md).
Das verbindliche Produktbacklog bleibt ausschließlich
[`docs/canonical/BACKLOG.md`](../docs/canonical/BACKLOG.md). Claude Code trägt je
Item Status, Evidenz, Commit oder Blocker ein; neue Produktanforderungen gehören
nicht ungeprüft hierher.

Statuswerte: `OFFEN`, `IN_ARBEIT`, `ERLEDIGT`, `BLOCKIERT`, `VERWORFEN`.

| ID | Priorität | Prüfpaket / Lieferung | Kanonische Zuordnung | Startstatus | Evidence / Commit |
|---|---|---|---|---|---|
| CC-01 | P0 | Startzustand, sauberer `main`, Versionen und Dokumentenrangfolge belegen | BL-001, BL-002 | OFFEN | – |
| CC-02 | P0 | Aktuelle offizielle Claude-/Cowork-/Plugin-/MCP-Verträge revalidieren; Herstellerbeleg und Ableitung trennen | BL-002, BL-010.7, BL-041.7 | OFFEN | – |
| CC-03 | P0 | End-to-end Privacy-/Security-/Prompt-Injection-/Originalschutz-Review | BL-011, BL-020, BL-030, BL-040, BL-049 | OFFEN | – |
| CC-04 | P0 | Ergebnisordner, Exportidentität, Rootwechsel, Replay, Manipulation, TOCTOU und Output-als-Quelle challengen | BL-040.5, BL-044.1 | OFFEN | – |
| CC-05 | P0 | Worker-ACK, Timeout, Abbruch, Crash, Resume, Review, Mapping und genau-ein-Stapel prüfen | BL-011.8, BL-011.10, BL-012.9, BL-043.1 | OFFEN | – |
| CC-06 | P1 | UX ohne Bestätigungsorgie, klare Dateien, Sammelreview, Ergebnisauffindbarkeit und Supportweg prüfen | BL-012, BL-041, BL-043 | OFFEN | – |
| CC-07 | P1 | TXT/Markdown/CSV/DOCX-Detektion und Parser-/Containergrenzen adversarial prüfen | BL-020.1, BL-020.2, BL-021, BL-022.1, BL-031, BL-032 | OFFEN | – |
| CC-08 | P1 | Batchperformance, Eventloop, Speicher-/Zeitgrenzen und sichere serielle Standardverarbeitung prüfen | BL-011.12, BL-047.1, BL-050.3 | OFFEN | – |
| CC-09 | P1 | ZIP/Marketplace/Runtime/Manifest/SBOM/Prüfsummen/Offline-/Dateimodus-Parität prüfen | BL-010, BL-024.2, BL-051 | OFFEN | – |
| CC-10 | P1 | Status-App terminale Zustände, Fallback, A11y und CWD-/Build-Reproduzierbarkeit vervollständigen | BL-042.3 | OFFEN | – |
| CC-11 | P1 | DOCX-Realitätskorpus und AlternateContent-/Kommentar-/Header-/Footer-Policy vervollständigen | BL-022.1 | OFFEN | – |
| CC-12 | P1 | OCR-Engineeringbundle vollständig prüfen, ohne gesperrte Bild-/PDF-Produktfreigabe | BL-024.2, BL-023, BL-024.3 | OFFEN | – |
| CC-13 | P1 | Kanon, README, Anleitung, IT, Security, Release, Testing, UAT und Traceability gegen Code synchronisieren | BL-001, BL-002, BL-003 | OFFEN | – |
| CC-14 | P1 | Vollständige lokale Regression, Build, ZIP-Verifikation und Claude-CLI-Validierung | BL-002, BL-051.1 | OFFEN | – |
| CC-15 | P1 | Unabhängigen Gegencheck nach Fixes, Abschlussbericht und sauberen unpushed `main` liefern | BL-002 | OFFEN | – |

## Vorbekannte Prüfhinweise, keine ungeprüften Findings

- Ein ungültiger Ergebnisordner darf erst nach erfolgreicher Anlage/Prüfung von
  `DataSecure-Output` gespeichert werden.
- Ein Zielwechsel oder gelöschtes/manipuliertes sichtbares Ergebnis muss zu
  ehrlichem Replay beziehungsweise Stopp führen, nicht zu `available:true`.
- Rekursive Auswahl eines Cowork-Roots darf `DataSecure-Output` nicht erneut als
  Quelle aufnehmen.
- Worker-IPC-ACK muss begrenzt sein; verspätete Callbacks und Abbruch dürfen einen
  neuen Lauf nicht beeinflussen.
- Die Rest-TOCTOU-Grenze des sichtbaren Exportpfads ist adversarial zu prüfen.
- Menschliche Windows-/macOS-/Cowork-Evidenz ist keine Aufgabe dieses Ledgers und
  darf nicht als bestanden markiert werden.
