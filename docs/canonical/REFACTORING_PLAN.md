# Verbindlicher Refactoring- und Migrationsplan

Stand: 25.08.2026 · Zielbasis: RC44 · abgeleitet aus DS-041 bis DS-060

## Zweck

Dieser Plan übersetzt Product Vision und Zielarchitektur in eine sichere
Implementierungsreihenfolge. Er ändert keine Produktentscheidung. Bei einem
Widerspruch gelten `DECISIONS.md`, `PRODUCT_VISION.md`, `PRODUCT.md` und
`TARGET_ARCHITECTURE.md` in dieser Reihenfolge.

Das Refactoring erfolgt in kleinen, einzeln rückrollbaren Teilschnitten. Eine
Performanceverbesserung, ein neues Format oder eine neue Oberfläche darf keine
Datenschutz-, Originalschutz-, Durability- oder Coverage-Grenze abschwächen.

## Durchgängige Arbeitsregeln

1. Vor jeder Verhaltensänderung wird der bestehende Vertrag durch
   Charakterisierungs-, Negativ- und Recoverytests festgehalten.
2. Strukturänderung und Produktverhalten werden nicht im selben Commit vermischt.
3. Jeder Teilschnitt hält die öffentliche MCP-, Skill-, Paket- und Dateigrenze
   entweder bytegleich oder aktualisiert sie ausdrücklich mit Backlog und Tests.
4. Originale werden ausschließlich lesend geöffnet. DataSecure verschiebt,
   überschreibt oder löscht keine Quelle und folgt keinen Links.
5. Private Rohdaten gelangen weder in Logs noch in Testausgaben, Dateinamen,
   Kommandozeilen, Umgebungsvariablen oder Claude-Antworten.
6. Ein fehlender Schlüssel, Parser, Supervisor, Launcher oder Coverage-Nachweis
   stoppt vor dem betroffenen Rohdatenzugriff; es gibt keinen stillen Fallback.
7. Nach jedem Teilschnitt laufen mindestens betroffene Unit-/Negativtests,
   `npm run test:docs`, `git diff --check` und vor Abschluss des Pakets
   `npm run test:ci` lokal. GitHub-Actions bleiben kostenbegrenzt.
8. Erst nach grünem Nachweis werden Backlog, Current State und Traceability
   gemeinsam fortgeschrieben.

## Phasen und feste Reihenfolge

### R0 – Entscheidungen und RC44-Baseline

Status: **abgeschlossen**

- DS-041 bis DS-060, Product Vision, Zielarchitektur, Ist-/Soll-Abgleich,
  Dokumentenregister und priorisiertes Backlog bilden die unveränderte Basis.
- Der getestete Ausgangsstand ist separat committed, damit jeder spätere
  Teilschnitt sauber vergleich- und rückrollbar bleibt.

### R1 – Öffentliche Altoberfläche schließen

Status: **abgeschlossen**

- Normaler Cowork-Ablauf: acht Werkzeuge.
- Gesamte Supportoberfläche: 25 Werkzeuge.
- `open_input_folder`, `begin_document_batch` und
  `start_document_batch_processing` sind auf keiner MCP-Oberfläche aufrufbar.
- Der direkte Betriebssystempicker ist der einzige neue Dateieingang.
- Eine datenbewahrende Upgrade-Migration darf vorhandene verwaiste Alt-Claims
  wiederherstellen, aber niemals neue Quellen annehmen.

### R2 – Stapelkern verhaltensneutral zerlegen

Status: **in Arbeit** · Story: BL-011.15

Der große Stapelkern wird hinter seiner bestehenden Exportoberfläche schrittweise
in klar verantwortete Module getrennt:

1. Intake, Snapshot-Preflight und Quellbindung,
2. Journal, Zustandsautomat, Lease und Crash-Recovery,
3. Verarbeitung und zentraler deterministischer Commit,
4. lokale Mehrdeutigkeits-/Review-Queue,
5. Veröffentlichung, Ergebnisübergabe und Mapping,
6. Retention, Migration und Wartung.

In R2 ändern sich weder Benutzerablauf noch Fehlerschema, Dateiformate,
Parallelität, Speicherorte oder Löschregeln. Bestehende Exporte bleiben zunächst
als Kompatibilitätsfassade erhalten. Jeder Extraktionsschritt muss die gezielten
Batchtests und die vollständige lokale CI bestehen.

Erster Teilstand: `gateway/batch-results.js` kapselt signierte Ergebnis-Cursor,
begrenztes Paging und die interne Auswahl vollständig abgeschlossener lokaler
Handoff-Kandidaten. `gateway/batch-progress.js` kapselt das inhaltsfreie
Statusmodell, gemessene Restzeit und die deutschen nächsten Schritte. Die
öffentlichen Exporte bleiben weiterhin in `gateway/batch.js`; die vorhandenen
Batch-, Handoff-, Gateway- und MCP-Verträge laufen unverändert dagegen.

### R3 – Originalschutz und internes Legacy-Intake entfernen

Status: **offen** · Stories: BL-011.14, BL-044.1

- Neue Installationen erzeugen keinen technischen `Input`-Eingang.
- `listInput` und jede queuebasierte Quelle ohne Picker-/Ordner-Snapshot werden
  aus dem Produktpfad entfernt.
- Picker- und spätere Ordnerquellen werden nur gelesen und in eine private
  Arbeitskopie übernommen. Alle Fehlerpfade lassen die Quelle byteidentisch an
  ihrem Ort.
- Die Upgrade-Migration wird in ein isoliertes, versioniertes Einmalmodul
  verschoben. Sie erhält alte Daten, nimmt keine neuen an und kann nach Ablauf der
  dokumentierten Übergangsversion vollständig entfallen.
- Dauerhafte Markdown-Exporte und Mapping werden nie automatisch durch Retention,
  Update, Rollback oder Deinstallation gelöscht.

### R4 – Benutzergebundene Verschlüsselung

Status: **offen** · Stories: BL-011.13, BL-030.2

- Ein zufälliger Installationsschlüssel wird pro OS-Benutzer durch Windows DPAPI
  beziehungsweise macOS Keychain geschützt.
- Snapshots, Reviewdaten und minimaler neustartfester Pseudonymkontext werden vor
  dem ersten Rohbyte verschlüsselt; ohne sicheren Store stoppt der Auftrag.
- Kein Passwortdialog, keine selbst gebaute Schlüsselableitung und kein
  Klartextfallback.
- Schlüsselrotation und Migration werden atomar, versioniert und rückrollbar
  getestet. Rohwerte erscheinen nie in Recovery- oder Diagnosemeldungen.

Noch vor Aktivierung von R4 ist genau eine Product-Owner-Regel festzuhalten:
Verlust beziehungsweise Widerruf des OS-Schlüssels. Empfehlung: keine
Wiederherstellungs-Hintertür; unlesbare private Arbeitskopien werden nach
ausdrücklicher Bestätigung verworfen und aus unveränderten Originalen neu erzeugt.

### R5 – Dauerhafter nicht blockierender Cowork-Auftrag

Status: **E0 teilweise vorhanden** · Stories: BL-011.3, BL-012.2, BL-012.3,
BL-041.9

- MCP kehrt nach durablem Startcheckpunkt kurzfristig zurück.
- Genau ein Stapel verarbeitet, mehrere dürfen pausieren.
- Reviewentscheidungen besitzen keinen menschlichen Entscheidungs-Timeout.
- Abschluss, Fehler und Resume erzeugen genau eine inhaltsfreie Meldung mit genau
  einer nächsten sicheren Aktion.
- Ein Hostabbruch löst weder erneute Auswahl noch doppelte Veröffentlichung aus.

### R6 – Quellen- und Inhaltsgrenze vereinheitlichen

Status: **offen** · Stories: BL-044.1, BL-049.1

- Datei- und rekursive Ordnerauswahl nutzen denselben Snapshotvertrag.
- Der gesamte Umfang wird vor Start gegen 100 Dateien, 500 MiB, Links,
  Dateitypen, Signatur und Containerstruktur geprüft; keine stille Teilmenge.
- Polyglotte, beschädigte, aktive oder verschlüsselte Quellen stoppen einzeln und
  werden in der lokalen Übersicht eindeutig als nicht verarbeitet ausgewiesen.
- Ergebnisse verwenden ausschließlich die drei Grade aus DS-045.

### R7 – Selbsttragende Distribution

Status: **E0 vorbereitet** · Stories: BL-010.8, BL-051.1 bis BL-051.5

- Getrennte Windows-x64- und macOS-Universal-ZIPs sowie ein inhaltlich gleiches
  Marketplace-Produkt enthalten alle benötigten Laufzeiten.
- System-Node und Python sind weder Voraussetzung noch Vertrauensanker.
- Install, Update, Rollback und Deinstallation bewahren Konfiguration, offene
  Aufträge, Exporte und Mapping.
- Piloten dürfen unsigniert sein. Eigene native Sicherheitskomponenten werden vor
  breitem Unternehmenseinsatz signiert.

### R8 – Performance erst nach Sicherheitsgates aktivieren

Status: **Harness vorhanden, Produkt seriell** · Stories: BL-047.1, BL-050.3

- Zuerst reale Referenzwerte für 1/10/100 Dateien und die 500-MiB-Grenze erfassen.
- Kleine adaptive Parallelität bleibt hinter Lease-, Speicher-, Reihenfolge-,
  Crash- und Commitgates.
- Der Produktstandard bleibt seriell, bis Windows-/macOS-Evidenz die Aktivierung
  trägt.
- Zielbudgets: Startreaktion 2 Sekunden, kein Cowork-Aufruf über 10 Sekunden,
  höchstens 25 Prozent freier Speicher beziehungsweise zunächst 2 GiB und kein
  unbegründeter Rückschritt über 10 Prozent.

### R9 – Formate stufenweise freigeben

Status: **TXT/Markdown/CSV/DOCX Pilot; weitere Formate gesperrt**

Reihenfolge nach vollständigem Content-, Sandbox-, Ressourcen- und
Interoperabilitätsnachweis:

1. XLSX und PPTX,
2. Text-PDF einschließlich Formularen, Annotationen und Anhängen,
3. Scan-PDF und lokale OCR,
4. PNG, JPEG und BMP.

Verschlüsselte Dateien werden in keiner Stufe entschlüsselt. Ein Parser-Spike oder
synthetischer Test allein aktiviert kein Format.

### R10 – Progressive UI und Rollout

Status: **offen** · Stories: BL-042.3, BL-052.1 bis BL-052.5

- Eine inhaltsfreie MCP-App darf den Ablauf vereinfachen, aber nie Voraussetzung
  sein; Text-/OS-Fallback bleibt vollständig.
- Deutsch/Englisch, Tastatur, Fokus, Skalierung, Kontrast und Screenreader werden
  vor Release real geprüft.
- Technikpilot, interner Pilot, Datenschutz-/Security-Freigabe,
  Unternehmenseinsatz und öffentlicher Marketplace bleiben getrennte Gates.

## Commit-, Rollback- und Stopvertrag

- R0 bleibt eigener Baseline-Commit.
- Jede weitere Phase besteht aus kleinen fachlich zusammenhängenden Commits.
- Eine reine Modulverschiebung enthält keine neue Policy und keine neue
  Parallelität.
- Vor einer Persistenzmigration wird der alte Zustand gesichert; fehlgeschlagene
  Migration lässt den letzten durable Zustand lesbar.
- Ein Teilschnitt wird nicht weitergeführt, wenn Originalschutz, Exactly-once,
  Mapping, Residual-Gate, Paketprüfung, Netzwerkgrenze oder Recovery regressieren.
- Ein Release-Artefakt entsteht erst nach Paketparität und den in der
  Evidence-Matrix geforderten realen Zielsystemnachweisen.

## Noch notwendige menschliche Entscheidungen und Evidenz

Vor R2 und R3 ist keine weitere Product-Owner-Entscheidung nötig. Vor Aktivierung
von R4 ist nur der oben genannte Schlüsselverlustvertrag zu bestätigen. Alle
weiteren menschlichen Punkte sind keine Entwicklungsblocker, sondern Release- oder
Pilotgates gemäß `BACKLOG_EVIDENCE_MATRIX.md`.
