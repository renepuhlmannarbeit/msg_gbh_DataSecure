# Evidence-Matrix für aktive Arbeit

Stand: 05.09.2026 · 3.2.0-rc107

E0 = lokale Code-/Testevidenz, E1 = Zielsystem/Installation, E2 = beobachtete
Anwendung/Accessibility, E3 = Fach-, Datenschutz-, Security- oder
Architekturfreigabe. Nur das [Backlog](BACKLOG.md) steuert Arbeit.

| Bereich / Stories | E0 | Noch erforderlich |
|---|---|---|
| BL-010.8 | gebündelter Runtimevertrag, drei Zielpaketprojektionen, Lizenz-/Hash-/Architekturgates, realer Windows-Smoke ohne System-Node und selbsttragende Git-Marketplace-Projektion mit relativer Quelle | Veröffentlichung der Projektion in einem privaten/internen Marketplace-Repository; E1 macOS Intel/ARM und E2 Cowork-Fresh-Install/Update |
| BL-010.9–27 | direkter Standalone-Coreadapter ohne MCP/JSON-RPC, eigener Datenroot, gemeinsame neutrale Start-/Recovery-Transaktion und technische CLI; reale Windows-x64-Tauri-Hülle mit geschlossenem UI-Zustandsvertrag, strikten Zählerinvarianten, 1-MiB-Framing, inhaltsfreier Rendererprojektion, CSP-/Capability-Grenze, Sidecar-Neustart und konfigurierbarem Ergebnisordner; selbsttragendes Windows-x64-Engineering-ZIP mit frischer Coreprojektion, gepinnter Runtime, Manifest, SBOM, SHA-256, Paketprüfung und isoliertem Sidecar-Smoke; MarkItDown-0.1.7-Vertrag, netz-/plugin-/LLM-/OCR-freie DOCX-Stream-Bridge mit `-I -S`, ohne Host-PATH/-TEMP, statische Negativtests und echter synthetischer Konverter-Smoke | vollständige Core-/Produktisolation, Cross-Read-/Golden-/Offline-/Environment-Gates; exakte gebündelte Python-Runtime; produktiver Konverter-Supervisor; komponentenweise Rust-Lizenzklärung; verständlicher WebView2-Fehlfall; E1/E2 Windows/macOS/Linux-UAT und native macOS-Pakete; XLSX/PPTX/PDF/Scan/Bild bleiben bis dahin gesperrt |
| BL-010.13/14, BL-040.6 | Standalone meldet nur den jüngsten eigenen Stapel, unterscheidet internen Abschluss von sichtbarem Export (`export_pending`), holt offene Exporte beim Start, beim UI-Kontext und nach Ordnerwahl nach, bindet Zielstamm und `DataSecure-Output` identitätsfest, serialisiert Exportprozesse und öffnet ausschließlich den vollständig sichtbaren aktuellen Lauf. RC105 lässt den privaten Sidecar das exakte Ziel auflösen und den Rust-Host Explorer/Finder/`xdg-open` sichtbar starten; der reale Paket-Smoke prüft Laufordner, `DataSecure-Zuordnung.csv` und beide Resolver. Offene Mischstapel bleiben gemäß DS-079 unsichtbar | E1/E2 Windows/macOS: tatsächlich sichtbare Öffnen-Aktion, Abschluss, Exportfehler/-replay, Ordnerwechsel, Sidecar-Abbruch/-neustart und verständliche Wiederaufnahme |
| BL-011.8 | identitätsgebundene Journal-/Intent-/Workcopy-Lese-, Publikations- und Cleanupgates; Größen-, Link-, Swap-, Abbruch- und Negativtests | E1 Windows/macOS-Dateisystem und E3 Security |
| BL-020.1 | Content-Graph/Locator für TXT, Markdown, CSV und DOCX einschließlich Unicode-, Part-, Asset- und Leerabdeckung | spätere Container/feinere Locators in ihren Formatstories |
| BL-020.2 | Produktpreflight sperrt OOXML-Einbettungen; aktive/rekursive DOCX-Strukturen, falsche Content Types und Beziehungen fail-closed | E1 Office-Korpus und E3 Security |
| BL-030.2 | neustartfester rohwertfreier HMAC-Kontext; neue Standalone-v2-Stapel nutzen lesbare Nummern und einen gemeinsamen Unternehmensraum, v1 bleibt erhalten. Lookup-Hydration im Folgedokument für beide Produkte, Registry-/Journal-Roundtrip durch TXT/MD/CSV/DOCX, Pre-Publish-Checkpointing und Manipulationsgates | E1/E2 echter Neustart/Crash/Cowork; reale Personen-/Unternehmensvarianten im fachlichen UAT |
| BL-010.12/13, DS-084 | Native Tauri-Dragdrop-Aufnahme über denselben Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, Reset nach IPC-Fehler, Test für veraltete Statusantworten, echte Unicode-Pfade im Rust-Test; Pickeralternative bleibt | E1/E2 tatsächliches Ziehen aus Explorer/Finder, Fokus/Zoom/Screenreader und native Mac-Pakete |
| BL-040.6, BL-041.10 | Cowork-Presenter bindet Erstlauf/Fortsetzung/Review an exakt den eigenen sichtbaren Exportlauf. Fehlender Lauf/Zielwechsel ergibt keinen falschen Öffnen-Hinweis. Echte Plugin-Exportdateien und PowerShell-Handler mit simulierter OS-Grenze geprüft | E1/E2 tatsächliche Explorer-/Finder-Sichtbarkeit; PowerShell-Test und Prozessstart beweisen kein sichtbares Fenster |
| BL-010.28, DS-085 | Zweite Kernfunktion in Vision, Produktvertrag, UML, Zielmodell und Backlog gebunden; Dokumentationsguard verhindert stilles Entfernen oder vermeintliche Freigabe. Keine produktive Konvertierungsevidenz | E0 Modus-/Journal-/Exportvertrag, Inhaltserhaltung, Offline-Konverter und kompletter Paketlauf; anschließend E1/E2 beider Modi |
| BL-022.1 | Grundparser, Struktur-/Differentialtests, namespacegebundene WordprocessingML-Auswertung, geschlossene XML-Entity-/Relationship-Namespace-Gates sowie referenzgebundene kanonische Kopf-/Fußzeilenreihenfolge | realer Office-Korpus und realistische Kommentare/AlternateContent; danach E1/E3 |
| BL-024.2 | installationsfreier Offline-Kern, vollständige Übernahme des Universal-Bundles in Engineering-Portable/SEA, geschlossene Manifest-/Inventar-/Hash-/Modusgates, Pfade mit Leerzeichen, echter Windows-OCR-Smoke sowie Timeout und laufender Abbruch bei deaktivierter Freigabe | kohärente Aufnahme in die freizugebenden Produktziele, nicht allein per Manifest aktivierbares Produktgate und echter Paket-zu-Adapter-zu-OCR-End-to-End-Test; danach E1 |
| BL-042.3 | inhaltsfreie Startprojektion einschließlich beider `batch_active`-Varianten, DE/EN, Textfallback, Server-/Artefaktgates sowie repo- und CWD-unabhängiger Windows-Build | bounded Abschlussprojektion, vollständige Fallbackmatrix und automatisierter echter Browser-/A11y-/DE-EN-DOM-Lauf; danach E1/E2 |
| BL-042.4 | separate manuelle Debug-ZIP-Variante mit derselben Engine; Fach-, Workflow- und Supportdiagnose als mehrprozesssichere unveränderliche Einzelereignisse mit physischer Alters-/Mengengrenze; MCP-/Picker-/Worker-/Review-/Exportgrenzen und Parallel-/Negativtests | E1 Installation und reproduzierter Cowork-Fehlerlauf; anschließend Rückkehr zum Normalpaket |
| BL-011.10 | atomare prozessübergreifende Intake-Reservierung von Pickerstart bis dauerhaftem Stapelcheckpoint, sichere Eltern-/Worker-Delegation, fail-closed Recovery und echter Zwei-Prozess-Kollisionstest | E1/E2 Mehrfachauswahl und Hintergrundstart in Cowork auf Windows/macOS |
| BL-047.1 | bounded Handoff-Seiten und 64-MiB-Sitzungsbudget; asynchrones größenbegrenztes Snapshot-Lesen, Hashen und UTF-8-Indizieren mit Event-Loop-Yield-Nachweis an 6 MiB | E1-Referenzmessung; adaptive Parallelisierung nur bei belegtem Nutzen |
| BL-040.5/6 | Ergebnisordner erst nach Readiness-/Aktivitätsprüfung und erfolgreicher Output-Anlage persistiert; DS-080 bestimmt die ausdrückliche geräte- und produktlokale Wahl ohne Workspace-Erkennung oder automatischen Projektwechsel; Zielstamm und Output-Unterordner identitätsgebunden; nur fehlgeschlagene Exporte werden nachgeholt, abgeschlossene Exporte sind endgültig; atomarer Prozessclaim plus exklusive Dateiveröffentlichung; nur verifiziertes Markdown mit neutralen Namen; Standalone ergänzt atomar eine formelneutralisierte Laufzuordnung, Cowork ausdrücklich nicht; Output-als-Quelle-Gate; Abschlussaktion öffnet exakt den terminalen Lauf; kein Pfad im MCP; DS-079 entscheidet gegen sichtbare Teilprojektion | E1/E2 Fresh Install, Ordnerwechsel, Neustart, Sync-Hinweis und beobachteter Windows-/macOS-Cowork-Ablauf |
| BL-010.1–3, BL-010.6–9, BL-011.3/6/7/9–13 | umfangreich vorbereitet; BL-010.1 Windows-E0 grün | E1 Windows/macOS; für Bedienung zusätzlich E2 |
| BL-012.2/3/5–8, BL-032.1 | Dialog-/Statusverträge automatisiert | E1 + E2, teilweise E3 |
| BL-012.9/10, BL-043.1 | gebündelter lokaler Review, anonyme Prüfgruppen, direkte Aktionen, inhaltsfreie Fortschrittszähler, Windows-Kürzel, Klarstapel ohne UI und Mischstapel-Schnellpfad | E1/E2 Windows/macOS sowie E3 IT-/Health-IT und Security |
| BL-021.1/2, BL-022.1 | Parser-/Differential-/Formatgates | E1 und Fachprüfung E3 |
| BL-022.2/3, BL-023.1–4, BL-024.3 | NO-GO-/Negativgates | vollständige E0-Coverage, danach E1 + E3 |
| BL-031.1 | Kontext- und Regressionskorpus | IT-/Health-IT-Fachprüfung E3 |
| BL-041.1–9, BL-044.1, BL-049.1, BL-050.3 | Tool-, Picker-, Handoff-, Recovery- und Performanceverträge; stdio-JSON-RPC vor dem Parsen auf 1 MiB je Frame begrenzt und nach Überschreitung wieder synchronisiert | aktuelle Cowork-/OS-/UX-/Security-Evidenz E1/E2/E3 |
| BL-051.1–6 | ZIP-/Marketplace-/Paketgates lokal | Fresh Install, Update, Rollback, Hostmatrix und 100/500-Lauf E1 |
| BL-052.1–5 | synthetisches UAT-Kit und leere Evidenzvorlage | benannte Anwender-, Fach-, Datenschutz-, UX-, Architektur- und Securityrollen |

## Aktueller DS-067-Nachweis

Der RC107-Korrekturschnitt ergänzt unter den vorhandenen Storys Regressionen
für verlorene Frontend-Polltimer, veraltete Folgelaufanzeigen, aktuelle
Standalone-Zuordnung auch bei gestoppten Dateien, ausstehende
Abschlussmetadaten ohne verfälschte Dokumentzähler und typstabile
Unternehmenskurzformen sowie den expliziten Sidecar-Abschluss bei EOF und
defektem IPC ohne Abbruch dauerhaft übergebener Worker. Produktsuite (40 Basis-
und 111 direkte Dateien) und abschließendes Standalone-/Rust-Gate sind grün.
Der native Windows-Test besitzt jetzt eine vor dem
Bootstrap validierte private Umgebung einschließlich WebView und Dokumenten.
Neue Paket-Evidence muss aus dem neuen Commit erstellt werden; der
historische RC106-Receipt beweist weder diese Korrekturen noch die neue
Testdatenisolation. Sichtbare Explorer-/Finder-Bedienung und macOS bleiben E1/E2.

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
