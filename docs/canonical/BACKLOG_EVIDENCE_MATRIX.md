# Evidence-Matrix für aktive Arbeit

Stand: 02.09.2026 · 3.2.0-rc86

E0 = lokale Code-/Testevidenz, E1 = Zielsystem/Installation, E2 = beobachtete
Anwendung/Accessibility, E3 = Fach-, Datenschutz-, Security- oder
Architekturfreigabe. Nur das [Backlog](BACKLOG.md) steuert Arbeit.

| Bereich / Stories | E0 | Noch erforderlich |
|---|---|---|
| BL-010.8 | gebündelter Runtimevertrag, drei Zielpaketprojektionen, Lizenz-/Hash-/Architekturgates und realer Windows-Smoke ohne System-Node | E1 macOS Intel/ARM und E2 Cowork-Fresh-Install |
| BL-011.8 | identitätsgebundene Journal-/Intent-/Workcopy-Lese-, Publikations- und Cleanupgates; Größen-, Link-, Swap-, Abbruch- und Negativtests | E1 Windows/macOS-Dateisystem und E3 Security |
| BL-020.1 | Content-Graph/Locator für TXT, Markdown, CSV und DOCX einschließlich Unicode-, Part-, Asset- und Leerabdeckung | spätere Container/feinere Locators in ihren Formatstories |
| BL-020.2 | Produktpreflight sperrt OOXML-Einbettungen; aktive/rekursive DOCX-Strukturen, falsche Content Types und Beziehungen fail-closed | E1 Office-Korpus und E3 Security |
| BL-030.2 | neustartfester rohwertfreier HMAC-Kontext, Alias-/Kollisionszustand, dauerhaftes Pre-Publish-Checkpointing und Manipulationsgates | E1/E2 echter Neustart/Crash/Cowork |
| BL-022.1 | Grundparser, Struktur-/Differentialtests, namespacegebundene WordprocessingML-Auswertung, geschlossene XML-Entity-/Relationship-Namespace-Gates sowie referenzgebundene kanonische Kopf-/Fußzeilenreihenfolge | realer Office-Korpus und realistische Kommentare/AlternateContent; danach E1/E3 |
| BL-024.2 | installationsfreier Offline-Kern, vollständige Übernahme des Universal-Bundles in Engineering-Portable/SEA, geschlossene Manifest-/Inventar-/Hash-/Modusgates, Pfade mit Leerzeichen, echter Windows-OCR-Smoke sowie Timeout und laufender Abbruch bei deaktivierter Freigabe | kohärente Aufnahme in die freizugebenden Produktziele, nicht allein per Manifest aktivierbares Produktgate und echter Paket-zu-Adapter-zu-OCR-End-to-End-Test; danach E1 |
| BL-042.3 | inhaltsfreie Startprojektion einschließlich beider `batch_active`-Varianten, DE/EN, Textfallback, Server-/Artefaktgates sowie repo- und CWD-unabhängiger Windows-Build | bounded Abschlussprojektion, vollständige Fallbackmatrix und automatisierter echter Browser-/A11y-/DE-EN-DOM-Lauf; danach E1/E2 |
| BL-011.10 | atomare prozessübergreifende Intake-Reservierung von Pickerstart bis dauerhaftem Stapelcheckpoint, sichere Eltern-/Worker-Delegation, fail-closed Recovery und echter Zwei-Prozess-Kollisionstest | E1/E2 Mehrfachauswahl und Hintergrundstart in Cowork auf Windows/macOS |
| BL-047.1 | bounded Handoff-Seiten und 64-MiB-Sitzungsbudget; asynchrones größenbegrenztes Snapshot-Lesen, Hashen und UTF-8-Indizieren mit Event-Loop-Yield-Nachweis an 6 MiB | E1-Referenzmessung; adaptive Parallelisierung nur bei belegtem Nutzen |
| BL-040.5 | Ergebnisordner erst nach erfolgreicher Output-Anlage persistiert; identitätsgebundener Zielpfad; nur fehlgeschlagene Exporte werden genau einmal nachgeholt, abgeschlossene Exporte sind endgültig (Nutzerlöschung/-bearbeitung respektiert, kein Spiegeln bei Zielwechsel); nur verifiziertes Markdown mit neutralen Namen; atomarer Export; Output-als-Quelle-Gate; begrenzte Worker-Empfangsbestätigung; Abschlussaktion „Ergebnisse öffnen“; kein Pfad im MCP | E1/E2 Fresh Install, Ordnerwechsel, Neustart, Sync-Hinweis und beobachteter Windows-/macOS-Cowork-Ablauf |
| BL-010.1–3, BL-010.6–9, BL-011.3/6/7/9–13 | umfangreich vorbereitet; BL-010.1 Windows-E0 grün | E1 Windows/macOS; für Bedienung zusätzlich E2 |
| BL-012.2/3/5–8, BL-032.1 | Dialog-/Statusverträge automatisiert | E1 + E2, teilweise E3 |
| BL-012.9/10, BL-043.1 | gebündelter lokaler Review, anonyme Prüfgruppen, direkte Aktionen, inhaltsfreie Fortschrittszähler, Windows-Kürzel, Klarstapel ohne UI und Mischstapel-Schnellpfad | E1/E2 Windows/macOS sowie E3 IT-/Health-IT und Security |
| BL-021.1/2, BL-022.1 | Parser-/Differential-/Formatgates | E1 und Fachprüfung E3 |
| BL-022.2/3, BL-023.1–4, BL-024.3 | NO-GO-/Negativgates | vollständige E0-Coverage, danach E1 + E3 |
| BL-031.1 | Kontext- und Regressionskorpus | IT-/Health-IT-Fachprüfung E3 |
| BL-041.1–9, BL-044.1, BL-049.1, BL-050.3 | Tool-, Picker-, Handoff-, Recovery- und Performanceverträge | aktuelle Cowork-/OS-/UX-/Security-Evidenz E1/E2/E3 |
| BL-051.1–6 | ZIP-/Marketplace-/Paketgates lokal | Fresh Install, Update, Rollback, Hostmatrix und 100/500-Lauf E1 |
| BL-052.1–5 | synthetisches UAT-Kit und leere Evidenzvorlage | benannte Anwender-, Fach-, Datenschutz-, UX-, Architektur- und Securityrollen |

## Aktueller DS-067-Nachweis

- Manifest/Runtime begrenzen temporäre Aufbewahrung auf 0–14 Tage.
- Retentiontests bewahren Quellen, `Processed`, fertige `Output`-Pakete und
  `DataSecure-Export` vor automatischer Löschung.
- Manifest besitzt keinen auswählbaren Bildmodus; Runtime startet fest im
  sicheren Bildschutz.
- Anwenderdokumente nennen nur ZIP/Marketplace. MCPB wird ausschließlich über
  explizite Engineering-Skripte gebaut und geprüft.
- Manifest-, Retention-, Dokumenten-, Capability-, ZIP- und Marketplace-
  Vertragstests sichern diese Grenzen.
- Das versionneutrale UAT-Kit nennt UAT-01 bis UAT-06 stets mit Klartextnamen und
  direkten Anleitungslinks. Aktive lokale Dokumentlinks werden automatisiert
  aufgelöst; historische RC-Kits und Aufträge sind sichtbar als nicht aktuell
  klassifiziert.

## Bedeutung von „blockiert“

Ein Backlogpunkt ist blockiert, wenn kein weiterer lokaler Codeabschluss behauptet
werden darf, bevor eine reale Claude-Version, Zielplattform oder benannte Fachrolle
die Evidenz liefert. Das ist keine implizite Aufforderung, VM, Zusatzkonto,
Schlüsselbund oder Clouddienst einzuführen.

Die vor der Konsolidierung geführte Einzelstory-Matrix bleibt als historischer
Nachweis im
[Archiv](../archive/2026-09/canonical-history/BACKLOG_EVIDENCE_MATRIX_HISTORY_THROUGH_RC84.md).
