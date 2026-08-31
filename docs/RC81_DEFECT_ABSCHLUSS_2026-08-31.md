# RC81 – Korrekturen zum RC80-Gegenreview

Stand: 31.08.2026 · lokaler Arbeitsstand `3.2.0-rc81`, ausgehend von Git-HEAD
`afdb1dc` plus erhaltenen lokalen Vorarbeiten. Kein alleiniger HEAD-Nachweis.

## Umfang und Arbeitsweise

Drei Fachagenten bearbeiteten getrennt Datensprache/Erkennung, Anwendung/UX und
Speicher-/Stapel-Lifecycle. Der Hauptagent prüfte und integrierte die Ergebnisse,
korrigierte Review-Gruppierung, Journal-I/O und Dokumentation. Ein zusätzlicher
Gegencheck fand Abbruch- und Teil-Erfolgsmeldungsfehler zwischen Reviewgruppen;
auch diese sind korrigiert und als Regression aufgenommen.

DS-065 bleibt unverändert: kein Schlüsselbund, kein Ersatzkeyfile, kein Passwort,
keine zusätzliche Verschlüsselung, VM oder zusätzlicher Benutzer. Originale
werden nicht geändert oder gelöscht. Keine neue Bestätigung im Normalablauf.
Die bekannten Format-/Hostgrenzen werden durch dieses Defectpaket nicht geöffnet.

## Befunde und Nachweise

Alle Dateinamen in der Nachweisspalte beziehen sich auf `tests/`.

| Befund | Korrektur | Regression |
|---|---|---|
| R80-01 | Zertifikatsinhaber auch vor Folgeklauseln und Zeilenumbrüchen erkennen; Aussteller erhalten | `test-rc80-semantics.js`, `test-credential-catalog.js` |
| R80-02 | Organisationsrollen positionsgebunden entscheiden; unbekannte Zertifikate und Tabellenzellen nicht pauschal freigeben | `test-rc80-semantics.js` einschließlich lokalem Gateway und gesperrter ungeklärter Rolle |
| R80-03 | Typisierte interne Restwertprüfung unterscheidet Arbeitgeber und Zertifikatsaussteller im selben Dokument | `test-rc80-semantics.js` |
| R80-04 | Gesundheits-IT-Listen und Standardkombinationen nicht als Kunden ersetzen | `test-rc80-semantics.js`, `test-pii-regression.js` |
| R80-05 | Produktspannen bei Arbeitgeberalias-Ersetzung erhalten | `test-rc80-semantics.js` |
| R80-06 | Header unterscheidet Personen-Pseudonymtabelle von gewünschter dauerhafter Dateizuordnung | `test-cowork-documentation-contract.js` |
| R80-07 | Windows-Listeneinträge ohne Zusatz-stdout; Vorauswahl nach Befüllung | `test-native-picker-lifecycle.js`, echtes PowerShell ohne sichtbaren Dialog |
| R80-08 | Neuer ausdrücklicher Handoff nach letzter Seite schließt die vorige Übergabe ab; unvollständige bleibt geschützt | `test-local-only-handoff.js` |
| R80-09 | Asynchroner, signalgebundener Picker; kein Intake nach Abbruch; kein doppelter Picker | `test-native-picker-lifecycle.js`, `test-mcp-protocol.js` |
| R80-10 | Anleitung beschreibt lokalen Abschluss und ausdrücklichen späteren Claude-Auftrag, keine automatische Ergebnislektüre oder Bildlöschung | `test-cowork-documentation-contract.js`, `test-contract-skill-acceptance.js` |
| R80-11 | Privacy-Ordner-Funktion korrekt als Supportweg; Ergebnisübersicht als normaler Einstieg | `test-cowork-documentation-contract.js` |
| R80-12 | Dauerhafter `.intake`-Besitznachweis vor Rohkopie; gezielte Recovery abgelaufener eigener Orphans | `test-batch-intake.js`, synthetischer Prozessverlust mit echten Dateien |
| R80-13 | Gemeinsamer Legacy-Envelope-Schutz auch beim terminalen Einzel-Cleanup | `test-batch-delivery.js`, `test-batch-intake.js`, `test-retention.js` |
| R80-14 | 0-Tage-Frist beendet nicht den aktiven Stapel; offene Kopien nach Laufende beenden; fertige Outputs auffindbar lassen | `test-gateway-e2e.js`: vollständiger Stapel, Pause, toter Owner, Originalerhalt |
| R80-15 | Begrenzte Reviewgruppen statt gesamtem Stapeltext im Speicher; frühe Größenprüfung, präzise Fehler und Teilergebnisse | `test-batch-review-model.js` (7), `test-batch-review-orchestrator.js` (17) |
| R80-16 | Phase-only-Checkpoints nur im RAM; normale Veröffentlichung mit vier statt zehn Journalwrites, Commit-/Recoverygrenzen erhalten | `test-batch-item-processor.js` (14), `test-batch-performance-contract.js` (6), `test-batch-session.js` |
| R80-17 | Output-Schutzscan unterstützt Journals v1–v4; Active-Lock ist kein Paketjournal | `test-batch-retention-protection.js` (9) |

Zusatz im Pickerpaket: explizites UTF-8-stdout verhindert beschädigte Windows-
Quelldateinamen (Umlaute und nichtlateinische Schrift). Reale PowerShell-Präambeln
mit `Müller 東京` werden ohne Öffnen eines Benutzerdialogs geprüft.

## Performance und Grenzen der Aussage

Der fehlerfreie Item-Processor schreibt jetzt **4 statt 10 Journals pro Datei**,
davon **4 statt 5 dauerhaft synchronisiert**. Tests zählen dies bei 10 und 100
Dateien. Das sind 60 % weniger Aufrufe in diesem Pfad, nicht 60 % weniger Laufzeit.
Zusätzliche Intake-, Mapping-, Abschluss- und Fehlerwrites bleiben erforderlich.
Das vollständige Journal wächst weiterhin mit dem Stapel; keine Behauptung einer
asymptotisch konstanten Speicherung oder beschleunigten echten Cowork-Sitzung.

Separater lokaler Phasenbenchmark nach Ende der Testläufe:
`node scripts/benchmark-batch-phases.mjs --counts=10 --temperatures=cold,warm`,
Windows/Node 24.18.0, synthetisch gemischte TXT/CSV/DOCX, privater Plain-Inputbuffer,
In-Process-Parser, **nicht Cowork**. Protokoll: `dist/rc81-benchmark.json`.

| Lauf | Dateien | Gesamtzeit | Peak-RSS | Freigegeben / gestoppt |
|---|---:|---:|---:|---:|
| cold | 10 | 11.398 ms | 72 MiB | 10 / 0 |
| warm | 10 | 11.227 ms | 74 MiB | 10 / 0 |

Dies ist kein kontrollierter RC80-/RC81-Vergleich und kein universelles SLA.
Der 100-Dateien-Test bestätigt Funktions- und Wiederaufnahmeverhalten, nicht
eine Zielhardware-Laufzeit; zahlreiche vorherige Stapel beeinflussen seinen Aufwand.

Reviewgruppen halten das bestehende 8-Millionen-Zeichenlimit ein. TXT-Größen
helfen vor der Rekonstruktion; bei Office-Erweiterung kann genau ein weiterer
Entwurf für die nächste Gruppe gehalten werden. Fertige Gruppen werden vor
weiterer Verarbeitung veröffentlicht. Abbruch vor/nach Rekonstruktion, nach der
UI und zwischen Gruppen einschließlich vorgehaltenem Entwurf stoppt weitere
Veröffentlichung. Vorher fertige Ergebnisse bleiben erhalten. Ein einzelnes zu
großes Dokument wird nicht heimlich geteilt oder als Benutzerabbruch ausgegeben.

## Integrationsprüfung

- ZIP-/MCPB-Build und Artefaktprüfung: PASS; exakte Quellparität,
  150 Vertragsvarianten, SBOM und Offline-/Paketgrenzen geprüft.
- Offizieller lokaler Claude-CLI-Strukturvalidator 2.1.233: Plugin und Marketplace
  PASS. Kein Modelllauf und keine echte Cowork-Bedienabnahme.
- Vollständige `npm run test:ci` einschließlich Pre-/Posttests: PASS
  (`dist/rc81-test-ci.log`). Ein erster Sandboxlauf stoppte an Esbuild-Leserechten;
  derselbe Test separat und der vollständige Wiederholungslauf außerhalb dieser
  Dateisandbox bestehen. Kein Produkt-Gate übersprungen.
- Zusätzliche `test-batch-session.js`-Langlaufregression: **67/67 PASS**
  (`dist/rc81-batch-session.log`). Einschließlich 100-Dateien-Stapel mit Stopps
  an Position 1/50/100 und echten Test-Worker-Abbrüchen an denselben Positionen,
  Wiederaufnahme ohne doppelte Freigaben und Erhalt aller synthetischen Originale.
  Ein alter Test-Doppelgänger ohne Prozessereignisse wurde zum EventEmitter
  korrigiert; die Checkpoint-Erwartung folgt dem neuen RAM-/Durabilityvertrag.
  Ein zwischenzeitlich vom Sitzungsabbruch beendeter Lauf zählt nicht als PASS;
  maßgeblich ist der danach vollständig beendete Wiederholungslauf.

## Offen, nicht als behoben behauptet

- Echte Cowork-ZIP-Installation und Bedienprüfung, insbesondere Fokus, sichtbare
  Dialoge, Abbruchsignale des Hosts und mehrere aufeinanderfolgende Stapel.
- macOS-/Linux-Gerätenachweise, vollständige selbstenthaltene Runtime-Abnahme
  und die bereits gesperrten weiteren Dokumentformate.
- Der rohe Marketplace-Quellordner enthält noch nicht ausgelieferte historische
  Keyring-Vendordateien; ZIP/MCPB schließen sie aus. Kanalkonsolidierung bleibt
  eigenständige Arbeit, kein Grund für eine neue Schlüsselverwaltung.
- Kein nativer Kill-/Stromausfallnachweis allein durch den Intake-Orphan-Test.
- Kein allgemeiner Beweis vollständiger Anonymisierung beliebiger Dokumente.

Keine GitHub Actions gestartet, kein Commit oder Push im Rahmen dieses Pakets.
