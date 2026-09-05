# RC107: unabhängiger Entwickler- und Ablaufgegencheck

Stand: 06.09.2026 · Produktversion 3.2.0-rc107

Auftrag: belegte logische, fachliche und technische Defects in Standalone und
gemeinsamem Cowork-Kern korrigieren; echte Prozess- und Paketgrenzen prüfen;
keine unbegründete Zusage einer vollständig fehlerfreien Software.
Die einzige Arbeitsliste bleibt das [kanonische Backlog](../docs/canonical/BACKLOG.md).

## Prüfdimensionen und Befunde

| Dimension | Befund / Korrektur | Bestehende Zuordnung |
|---|---|---|
| UX und asynchrone UI | Verlorene Polltimer, verspätete Antworten und schnelle Folgeläufe korrigiert; Start wird nach unklarer Bestätigung beobachtet, nicht automatisch wiederholt. | BL-010.12/13, BL-002 |
| Aktueller Lauf / Datenübergabe | Rein gestoppte Folgeläufe erhalten eine eigene Zuordnung; kein Rückfall auf alte Ergebnisse. Offene Abschlussmetadaten sind kein vollständiger Erfolg. Historische veröffentlichte Zuordnungen bleiben unverändert. | BL-040.5/6, BL-010.19 |
| Prozess-Lifecycle | Standalone-EOF beendet den Steuerprozess auch bei offenem Worker-IPC; wartende Aktionen starten nicht nach. Dauerhaft übergebene Worker behalten den Fortsetzungsvertrag. Cowork besitzt bereits seinen eigenen begrenzten Shutdown. | BL-010.13, BL-011.3 |
| Fachliche Personen-/Firmenbindung | Firmennamen mit Rechtsform werden nicht durch konkurrierende Personensamen umtypisiert; explizite Namensfelder bleiben Personen. Unterschiedliche Rechtsformen werden nicht still zusammengelegt. | BL-030.2, BL-021.1 |
| Tatsächliche Dokumentgrenze | Bekannte Personen-/Firmenkurzformen werden nach Journal-/Registry-Neuaufbau per exakter HMAC-Mitgliedschaft erneut gefunden. Klammern, `&`, Apostrophe, Unicode-Abstände und Rollenwechsel sind eingeschlossen; Rechtsformkonflikte bleiben unklar. 34 Registry-, 23 State-, 17 Item- und 17 Journalfälle sowie 120 PII-Fälle im Hauptlauf grün. Kein Abschlussnachweis allein durch wiederverwendete In-Memory-Registry. | BL-030.2, BL-021.1, BL-002 |
| Parser-/Fehlerprotokoll | Ein echter fehlerhafter CSV-Folgestapel wurde als `PROCESSING_INTERRUPTED` statt endgültig abgewiesen behandelt. Exakter negativer Parser-Envelope plus passender Exit ergibt jetzt `PARSE_FAILED`; unbekannte Abstürze und Timeout bleiben getrennt. | BL-020.1, BL-011.3 |
| Testrealität / Windows | Nativer Test verwendete zunächst reale Anwendungsdaten. Neuer Scope isoliert Daten, Dokumente, Diagnose, temporäre Dateien und WebView vor Bootstrap. Native Reparse-Metadaten ersetzen unzuverlässige PowerShell-5-Anzeigeeigenschaften. | BL-051.1, BL-010.13, BL-002 |
| Produktgrenze | Private Standalone-Pfade und Zuordnungen werden nicht über öffentliche Cowork-Lesegates freigegeben. | DS-082/083, BL-040.6 |
| Funktionsumfang | Reine Markdown-Konvertierung ohne Anonymisierung bleibt verbindliche zweite Kernfunktion, ist aber noch nicht produktiv implementiert. Nicht als erledigten Bugfix ausweisen. | DS-085, BL-010.28 |

Die unabhängigen Teilprüfungen umfassten Frontend-/IPC-Lifecycle, fachliche
Aliasbindung, Export/Recovery und nativen Paket-/Testaufbau. Der Hauptagent
prüfte Änderungen und Nachweise erneut. Neue Reproduktionen wurden nicht
durch Änderungen an erwarteten Ergebnissen oder allein durch Mocks geschlossen.
Der letzte eng abgegrenzte unabhängige Alias-Gegencheck bestand 32 zusätzliche
Fälle über beide Vertragsversionen und Index-/Altjournalvarianten ohne neuen Fund.

Der zunächst vollständige HMAC-Fensterabgleich war bei 25.000 unterschiedlichen
Wörtern (rund 199 kB) mit etwa 20,4 s zu langsam. Ein optionaler, vollständig
bindingsgebundener HMAC-Anfangstokenindex senkte diese isolierte Lookup-Messung
auf etwa 0,44 s. Das ist kein End-to-End-Durchsatzversprechen. Ein deterministischer
Test begrenzt zusätzlich die HMAC-Proben auf weniger als 26.000 für dieses
25.000-Wörter-Szenario. Indexverlust/-änderung fällt auf den vollständigen
Abgleich zurück; fehlgeformter Zustand stoppt. Altreader lehnen den erweiterten
Snapshot ab, statt ihn still falsch weiterzuschreiben.

## Evidenzfolge und Kandidaten

| Quellstand / Prüfung | Ergebnis und Grenze |
|---|---|
| Historisch RC106 `17a2160` | Zweifachbau und INT-13-Bindung vorhanden; beweisen keine späteren RC107-Fixes oder neue Testisolation. |
| RC107 `ebffe87` | Produktsuite: 40 Basis- und 111 direkte Testdateien, einschließlich 2.000 variierender Eingaben und echter 100-Dateien-Crash-/Fortsetzung. Standalone-/Rust-Gates grün. Verschärfter realer Paket-Folgelauf fand anschließend den Parserfehler; keine INT-13-Bindung. |
| Parserfix `aaecf59` | Parser-Isolation 19/19, Itemprozessor 16/16, MCP 45/45 und lokale CI-Produktsuite mit 40 Basis-/48 Direktdateien grün. Neu gepackter Vierformat-/Fehlerfolgelauf und nativer Start bestanden. Cleanup-Inventur verweigerte Windows-Cache-Junction vor jeder Löschung; PKG-04 unvollständig. |
| Testharness `ce8319b` | Desktop-Vertrag 12/12 einschließlich 8 synthetischer Cleanup-Gruppen. Echter Folgetest fand PowerShell-5-Providerfelder `null` trotz gültiger Junction; Start grün, Cleanup weiterhin verweigert. |
| Native-Metadatenfix `d3d384c` | Desktop-Vertrag 12/12; echte Junction zusätzlich nur lesend validiert. Frischer nativer Start mit beiden IPC-Antworten und vollständiger Bereinigung von 426 eigenen Testeinträgen bestanden. Noch kein Zweifachbau des letzten Produktstands. |
| Abschließender Produktstand `7b88a81` | Vollsuite 40 Basis-/111 Direktdateien einschließlich 2.000 Eingaben und Rust 12/12 grün. PKG-04 zweimal bytegleich: ZIP 36.071.549 Byte, SHA-256 `01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`. Beide Kandidaten bestehen Paket-/Worker-/isolierte native Smokes. Receipt und INT-13-Bindung unter `dist/pkg-04/7b88a81ff577aaa270f1354d75365b2df4a4666e/`. |

Die beiden verweigerten nativen Testprofile bleiben unverändert und sind von
Git ausgeschlossen. Nur neu erzeugte, genau geprüfte Testobjekte wurden
bereinigt; keine Originaldateien oder produktiven Installationsdaten.

Der endgültige Kandidat darf erst nach dem letzten Produktfix aus einem sauberen
Commit zweimal gebaut werden. Beide ZIPs, Desktop- und Core-Binaries müssen
bytegleich sein, beide Kandidaten die Paket-/Worker-/nativen Smokes bestehen.
Erst dann schreibt PKG-04 die hashgebundene INT-13-Bindung. Ein Versionsname oder
ein erfolgreiches Teilgate genügt nicht.

## Offene Abnahme und Nicht-Zusagen

### Anschließender Konvertierungsunterbau (separat vom PKG-04-Kandidaten)

Der Folgeauftrag hat einen zentralen Modusvertrag, vollständigen Desktop-
Parametertransport bis zum Service, inhaltstreue direkte Extraktion und einen
getrennten Markdown-Artefaktvertrag ergänzt. Weitere Engineering-Einstiege
verarbeiten Office, Text-PDF, Scan-PDF und PNG/BMP mit lokalen OCR-Modellen.
Unabhängige Teilreviews prüften Modusbindung/Mutation, öffentliche Privacy-
Cross-Reads sowie PDF-/OCR-Lifecycle. Zwei reproduzierte Fehler wurden dabei
behoben: ein bei PDF.js-Abbruch unaufgelöster Wartezustand und die verfrühte
Scan-PDF-Antwort vor dem OCR-Prozessende. Verweigerte Beendigung bleibt ein
eigener Fehler, statt einen bestätigten Abbruch zu behaupten.

Abschlussnachweise: Produktsuite **43 Basis-/111 Direktdateien**, Rust **14/14**
und das reale PDF-/OCR-/Scan-PDF-Engineering-Gate grün; erweiterte Scan-PDF-
Abbruchfälle zusätzlich mit gebündeltem Node 22 grün. Journal v5, Worker,
Recovery, Markdown-Export und breite Runtime-Paketierung sind ausdrücklich
noch nicht vollständig integriert. Der Unterbau schaltet die UI-Funktion
nicht frei und ist **nicht** Bestandteil des zuvor an INT-13 gebundenen
`7b88a81`-Pakets. Ausführungsdetails stehen im
[Format-/Konvertierungsplan](STANDALONE-FORMATAUSBAU-IMPLEMENTIERUNGSPLAN.md).

### Weiterhin offene Zielhost- und Produktnachweise

- Keine neue globale Identitätsauflösung: gleiche Schreibweise allein beweist
  bei Personen oder verschiedenen Firmen keine reale Identität.
- Sichtbares Öffnen in Explorer/Finder, Drag-and-drop, Fokus, Accessibility und
  echte Cowork-Bedienung bleiben Zielhost-/Anwendernachweise.
- Native Intel-/ARM-macOS-Ausführung wird nicht aus Windows-Tests abgeleitet.
- TXT, Markdown, CSV und DOCX sind der aktuelle Formatumfang; XLSX/PPTX/PDF/
  Scan-PDF/Bilder und die eigenständige reine Markdown-Konvertierung bleiben
  ausdrücklich in ihren offenen Stories. Der Nutzer hat ihre anschließende
  Implementierung am 06.09.2026 beauftragt; der Auftrag ist im bestehenden
  Lieferplan BL-010.28/BL-010.15–19 aufgenommen. Der RC107-Bugfixnachweis behauptet
  diese neuen Funktionen noch nicht als geliefert.
- Alle hier genannten Läufe sind lokal. Keine GitHub Actions, kein Push und
  keine Änderung produktiver Originaldaten durch diesen Review.
