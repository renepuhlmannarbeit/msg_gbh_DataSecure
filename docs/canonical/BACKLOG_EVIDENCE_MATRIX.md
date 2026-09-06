# Evidence-Matrix für aktive Arbeit

Stand: 06.09.2026 · 3.2.0-rc108

E0 = lokale Code-/Testevidenz, E1 = Zielsystem/Installation, E2 = beobachtete
Anwendung/Accessibility, E3 = Fach-, Datenschutz-, Security- oder
Architekturfreigabe. Nur das [Backlog](BACKLOG.md) steuert Arbeit.

Aktueller Windows-Paketnachweis: RC108 aus `a742333` besteht PKG-04 mit zwei
bytegleichen Builds, beiden echten Paket-/Worker-/nativen Smokes und neuer
INT-13-Bindung. Beide Modi, elf Konvertierungsergebnisse plus Fehlerposition,
Zuordnung und Supportspur sind geprüft. Details und vollständige Hashes stehen
in [CURRENT_STATE](CURRENT_STATE.md). E1/E2/E3 sind dadurch nicht geschlossen.

| Bereich / Stories | E0 | Noch erforderlich |
|---|---|---|
| BL-010.8 | gebündelter Runtimevertrag, drei Zielpaketprojektionen, Lizenz-/Hash-/Architekturgates, realer Windows-Smoke ohne System-Node und selbsttragende Git-Marketplace-Projektion mit relativer Quelle | Veröffentlichung der Projektion in einem privaten/internen Marketplace-Repository; E1 macOS Intel/ARM und E2 Cowork-Fresh-Install/Update |
| BL-010.9–27 | direkter Standalone-Coreadapter, eigener Datenroot, Tauri-Hülle, geschlossene private IPC, expliziter Start und konfiguriertes Ergebnisziel. RC108 integriert die zweite Kernfunktion mit eigenem Konverterprozess und separater Node-/PDF.js-/Canvas-/Tesseract-Runtimeprojektion einschließlich Inventar, SBOM und Lizenztexten. MarkItDown 0.1.7/Python ist nur optionales Differentialorakel, keine Anwender- oder Bundlevoraussetzung | komponentenweise Rust-Lizenzklärung; verständlicher WebView2-Fehlfall; E1/E2 Windows/macOS und native macOS-Pakete. Linux-Konverterpaketierung bleibt späterer Umfang. Anonymisierung/Cowork bleibt auf vier Formate begrenzt |
| BL-010.13/14, BL-040.6 | Standalone meldet nur den jüngsten eigenen Stapel, unterscheidet internen Abschluss von sichtbarem Export (`export_pending`), holt offene Exporte beim Start, beim UI-Kontext und nach Ordnerwahl nach, bindet Zielstamm und `DataSecure-Output` identitätsfest, serialisiert Exportprozesse und öffnet ausschließlich den vollständig sichtbaren aktuellen Lauf. RC105 lässt den privaten Sidecar das exakte Ziel auflösen und den Rust-Host Explorer/Finder/`xdg-open` sichtbar starten; der reale Paket-Smoke prüft Laufordner, `DataSecure-Zuordnung.csv` und beide Resolver. Offene Mischstapel bleiben gemäß DS-079 unsichtbar | E1/E2 Windows/macOS: tatsächlich sichtbare Öffnen-Aktion, Abschluss, Exportfehler/-replay, Ordnerwechsel, Sidecar-Abbruch/-neustart und verständliche Wiederaufnahme |
| BL-011.8 | identitätsgebundene Journal-/Intent-/Workcopy-Lese-, Publikations- und Cleanupgates; Größen-, Link-, Swap-, Abbruch- und Negativtests | E1 Windows/macOS-Dateisystem und E3 Security |
| BL-020.1 | Content-Graph/Locator für TXT, Markdown, CSV und DOCX einschließlich Unicode-, Part-, Asset- und Leerabdeckung | spätere Container/feinere Locators in ihren Formatstories |
| BL-020.2 | Produktpreflight sperrt OOXML-Einbettungen; aktive/rekursive DOCX-Strukturen, falsche Content Types und Beziehungen fail-closed | E1 Office-Korpus und E3 Security |
| BL-030.2 | neustartfester rohwertfreier HMAC-Kontext; neue Standalone-v2-Stapel nutzen lesbare Nummern und einen gemeinsamen Unternehmensraum, v1 bleibt erhalten. RC107: exakte bekannte Aliase im freien Folgetext nach echtem Registry-/Journal-Neuaufbau, Klammern/Separatoren, Rollenwechsel und Rechtsformkonflikte; 34 Registry, 23 State, 17 Journal, 17 Item und 120 PII grün, 32 unabhängige Gegenchecks. Optionaler bindingsgebundener HMAC-Index mit vollständigem Altjournal-Fallback und dokumentierter Altreader-Grenze | E1/E2 echter Neustart/Crash/Cowork; reale Personen-/Unternehmensvarianten im fachlichen UAT |
| BL-010.12/13, DS-084 | Native Tauri-Dragdrop-Aufnahme über denselben Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, Reset nach IPC-Fehler, Test für veraltete Statusantworten, echte Unicode-Pfade im Rust-Test; Pickeralternative bleibt | E1/E2 tatsächliches Ziehen aus Explorer/Finder, Fokus/Zoom/Screenreader und native Mac-Pakete |
| BL-040.6, BL-041.10 | Cowork-Presenter bindet Erstlauf/Fortsetzung/Review an exakt den eigenen sichtbaren Exportlauf. Fehlender Lauf/Zielwechsel ergibt keinen falschen Öffnen-Hinweis. Echte Plugin-Exportdateien und PowerShell-Handler mit simulierter OS-Grenze geprüft | E1/E2 tatsächliche Explorer-/Finder-Sichtbarkeit; PowerShell-Test und Prozessstart beweisen kein sichtbares Fenster |
| BL-010.28, DS-085 | zwei aktive Modi vom Frontend über Rust/IPC/Service, unveränderlicher Zweck bei Fortsetzung, v5-Journal und eigene Worker-Envelope-Typen; `dm_`-Artefakte mit Extraktionsgrad, Recovery/Delivery/Export in derselben Batchengine. `markdown-only` erhält Originalinhalte und exportiert nach `DataSecure-Markdown` mit Zuordnung, ohne Privacy-Capability oder PII-Review. Elf Eingabetypen einschließlich Scan-PDF als gesondertem PDF-Fall; 25 reale Konvertertestgruppen, bestehende Modus-/Artefakt-/Cross-Read-/Extraktionsgates | E1/E2/E3: echte Zielhostbedienung und breiter fachlicher Korpus. Aktueller Zwei-Modi-Paketnachweis, Fehlerfolgelauf und Code-Recoverytests stehen E0; das ist keine UAT-Freigabe |
| BL-022.1 | Grundparser, Struktur-/Differentialtests, namespacegebundene WordprocessingML-Auswertung, geschlossene XML-Entity-/Relationship-Namespace-Gates sowie referenzgebundene kanonische Kopf-/Fußzeilenreihenfolge | realer Office-Korpus und realistische Kommentare/AlternateContent; danach E1/E3 |
| BL-024.2 | Universal-Bundle bleibt separate Engineering-Evidence mit deaktivierter Pluginfreigabe. Standalone `markdown-only` verwendet eine eigene aktive gepinnte Tesseract-/Canvas-Projektion mit lokalen DE/EN-Modellen; reale PNG/JPEG/BMP-/Scan-PDF-Bytes, Timeout, Abbruch und unveränderte Inputhashes im Konvertergate | E1 Windows/macOS; OCR-/Bildanonymisierung und vollständige Erkennung sind dadurch nicht freigegeben |
| BL-042.3 | inhaltsfreie Startprojektion einschließlich beider `batch_active`-Varianten, DE/EN, Textfallback, Server-/Artefaktgates sowie repo- und CWD-unabhängiger Windows-Build | bounded Abschlussprojektion, vollständige Fallbackmatrix und automatisierter echter Browser-/A11y-/DE-EN-DOM-Lauf; danach E1/E2 |
| BL-042.4 | separate manuelle Debug-ZIP-Variante mit derselben Engine; Fach-, Workflow- und Supportdiagnose als mehrprozesssichere unveränderliche Einzelereignisse mit physischer Alters-/Mengengrenze; MCP-/Picker-/Worker-/Review-/Exportgrenzen und Parallel-/Negativtests | E1 Installation und reproduzierter Cowork-Fehlerlauf; anschließend Rückkehr zum Normalpaket |
| BL-011.10 | atomare prozessübergreifende Intake-Reservierung von Pickerstart bis dauerhaftem Stapelcheckpoint, sichere Eltern-/Worker-Delegation, fail-closed Recovery und echter Zwei-Prozess-Kollisionstest | E1/E2 Mehrfachauswahl und Hintergrundstart in Cowork auf Windows/macOS |
| BL-047.1 | bounded Handoff-Seiten und 64-MiB-Sitzungsbudget; asynchrones größenbegrenztes Snapshot-Lesen, Hashen und UTF-8-Indizieren mit Event-Loop-Yield-Nachweis an 6 MiB | E1-Referenzmessung; adaptive Parallelisierung nur bei belegtem Nutzen |
| BL-040.5/6 | ausdrückliche geräte-/produktlokale Zielwahl ohne Workspace-Erkennung; identitätsgebundene atomare Veröffentlichung, fehlgeschlagene Exporte nachholbar, abgeschlossene Exporte final. Anonymisierte Dateien unter `DataSecure-Output`, eigene nicht anonymisierte `dm_`-Konvertate nur Standalone unter `DataSecure-Markdown`; beide Bäume gegen erneute Aufnahme gesperrt. Standalone ergänzt die formelneutralisierte `DataSecure-Zuordnung.csv`, Cowork nicht. Öffnen bindet exakt den terminalen aktuellen Lauf, DS-079 verhindert sichtbare Teilprojektion, MCP erhält keine Quellpfade oder rohen Konvertate | E1/E2 Fresh Install, Ordnerwechsel, Neustart, Sync-Hinweis sowie beobachteter Windows-/macOS-Ablauf |
| BL-010.1–3, BL-010.6–9, BL-011.3/6/7/9–13 | umfangreich vorbereitet; BL-010.1 Windows-E0 grün | E1 Windows/macOS; für Bedienung zusätzlich E2 |
| BL-012.2/3/5–8, BL-032.1 | Dialog-/Statusverträge automatisiert | E1 + E2, teilweise E3 |
| BL-012.9/10, BL-043.1 | gebündelter lokaler Review, anonyme Prüfgruppen, direkte Aktionen, inhaltsfreie Fortschrittszähler, Windows-Kürzel, Klarstapel ohne UI und Mischstapel-Schnellpfad | E1/E2 Windows/macOS sowie E3 IT-/Health-IT und Security |
| BL-021.1/2, BL-022.1 | Parser-/Differential-/Formatgates | E1 und Fachprüfung E3 |
| BL-022.2/3, BL-023.1–4, BL-024.3 | Anonymisierungs-/Cowork-NO-GO unverändert. Reine Standalone-Konvertierung von XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP im isolierten Produktworker integriert; Originalwerte bleiben, unvollständige Coverage/OCR wird mit festen Gründen gespeichert statt vollständig genannt. PDF liest native Texte und bei tatsächlich gemalten Bildern zusätzlich OCR; gleiche OCR-Zeilen werden nicht doppelt angehängt. Scan plus Seitenzahl ist regressionsgeprüft. Gebündelte Decoder/Modelle ohne Download; bestätigtes Ende oder `CONVERSION_TERMINATION_UNCONFIRMED`; 60 frühe Windows-Kills prüfen atomare Jobzuweisung | E1/E3; bessere Objekt-/Layoutabdeckung sowie breitere Anonymisierung bleiben eigenständig offen. Neue Komponenten sind an RC108 gebunden, nicht an den alten RC107-Kandidaten |
| BL-031.1 | Kontext- und Regressionskorpus | IT-/Health-IT-Fachprüfung E3 |
| BL-041.1–9, BL-044.1, BL-049.1, BL-050.3 | Tool-, Picker-, Handoff-, Recovery- und Performanceverträge; stdio-JSON-RPC vor dem Parsen auf 1 MiB je Frame begrenzt und nach Überschreitung wieder synchronisiert | aktuelle Cowork-/OS-/UX-/Security-Evidenz E1/E2/E3 |
| BL-051.1–6 | ZIP-/Marketplace-/Paketgates lokal | Fresh Install, Update, Rollback, Hostmatrix und 100/500-Lauf E1 |
| BL-052.1–5 | synthetisches UAT-Kit und leere Evidenzvorlage | benannte Anwender-, Fach-, Datenschutz-, UX-, Architektur- und Securityrollen |

## RC108-Integration: neue, noch separat zu bindende Evidence

Der Codeweg ist aktiv, nicht lediglich ein freigeschaltetes Modusflag:
`core/processing-mode` → Desktop/IPC/Service → Intake/v5-Journal →
`conversion-worker` → `markdown-store` → Recovery/Export. Rohes Markdown
erhält weder Privacy-Status noch Capability und wird nicht automatisch an KI
übertragen. Warnende Extraktionen erscheinen ausdrücklich als unvollständig.

E0: 22 echte Konvertertestgruppen und 100 TXT-Dateien in lokal 15,264 Sekunden,
ohne die etwa 188-MB-Runtime je Datei erneut vollständig zu lesen. 60 frühe
Beendigungen prüfen den atomar an `CreateProcess` gebundenen Windows-Job;
7 native Launcher- und 19 Parser-Isolationstests grün. Die native Korrektur
schließt auch im gemeinsamen Cowork-Parser das Start-/Jobzuweisungsfenster.
Diese Messung ist keine allgemeine Performancegarantie.

Der vollständige aktuelle Sidecar-E2E, neue zweimal bytegleiche Builds,
PKG-04-Receipt und INT-13-Bindung sind noch separat zu bestätigen. Windows-
Engineering-Evidence ersetzt weder sichtbaren UAT noch Intel-/ARM-macOS.

## Historischer RC107-/DS-067-Nachweis

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

Der reale Folgestapel im ersten RC107-Paket (`ebffe87`) deckte zusätzlich die
fehlende terminale Klassifikation einer bestätigten Parserablehnung auf. Dieser
Build wurde nicht an INT-13 gebunden. `PARSE_FAILED` gegenüber Timeout/Crash wird
im gemeinsamen Runtimevertrag korrigiert und separat regressionsgeprüft; erst
ein neuer Quellcommit mit beiden erfolgreichen Paketläufen liefert neue Evidence.

`aaecf59` bestand anschließend die lokale CI-Produktsuite (40 Basis- und 48
direkte Dateien), den gepackten Vierformat-/Fehlerfolgelauf und den isolierten
nativen Windows-Start. Die sichere Testbereinigung verweigerte eine vom
Betriebssystem erzeugte Cache-Junction vor jeder Löschung; der Testrest bleibt
erhalten. Daher weiterhin kein vollständiger RC107-PKG-04-Receipt und keine
INT-13-Bindung aus diesem Versuch. Eine spätere erfolgreiche Bindung muss den
neuen Harness-Commit nennen, nicht rückwirkend diesen Versuch freigeben.

Abschluss 06.09.2026: `7b88a81ff577aaa270f1354d75365b2df4a4666e` besitzt nun
einen vollständigen PKG-04-Receipt und INT-13-Bindung. Beide unabhängig sauber
gebauten ZIPs/Desktop/Core-Binaries bytegleich, beide realen Paket-/Worker- und
nativen Windows-Smokes bestanden. Archivhash
`01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`,
36.071.549 Byte. Vollsuite 40 Basis-/111 Direktdateien und Rust 12/12 grün.
Die beiden alten verweigerten Testprofile bleiben unverändert. Dies ist E0,
keine sichtbare Bedienungs- oder macOS-E1/E2-Abnahme.

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
