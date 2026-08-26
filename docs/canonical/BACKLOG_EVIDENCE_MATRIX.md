# Evidence-Matrix für aktive Backlog-Stories

Stand: 25.08.2026 · gilt für RC44 und ergänzt das [aktive Backlog](BACKLOG.md).

Diese Matrix trennt strikt zwischen lokaler Entwicklungsarbeit und einem echten
Abschlussnachweis. Ein lokaler Test, eine Code-Review oder eine CI-Ausführung auf
einem anderen Host ist kein Ersatz für eine hier verlangte reale Evidenz.

## Legende

- **E0 – lokal reproduzierbar:** Ich kann die Story mit Code und synthetischen
  Tests vollständig belegen. Eine fachliche Gegenlese bleibt sinnvoll, aber nicht
  releaseblockierend.
- **E1 – Zielsystem:** Eine Testverantwortliche Person führt den Schritt auf dem
  genannten Betriebssystem, in Claude oder in einem frischen Konto aus und hält nur
  Version, Artefakt-Hash, PASS/FAIL/BLOCKED und festen Fehlercode fest.
- **E2 – beobachtete Nutzung:** Eine reale Person führt den Ablauf aus; eine zweite
  Person beobachtet ihn. Es werden ausschließlich synthetische Dateien verwendet.
- **E3 – Fach-/Freigabeentscheidung:** Datenschutz, IT-Security oder Fachexpert:innen
  beurteilen eine Grenze. Das Werkzeug darf diese Entscheidung nicht simulieren.

"Mensch erforderlich" umfasst E1 bis E3. E1 kann ein:e IT-Tester:in sein und
muss keine Endanwenderin bzw. kein Endanwender sein.

## Product Vision und neue priorisierte Pakete

| Story | Was noch zu liefern bzw. zu prüfen ist | Evidenz und konkrete menschliche Aufgabe |
|---|---|---|
| BL-011.13 | Private Daten OS-benutzergebunden verschlüsseln. | **E0 + E1 + E3:** Unit-/Negativtests; DPAPI/Keychain real; Security-Review. |
| BL-011.14 | Originale unverändert und Exporte dauerhaft halten. | **E0:** synthetische Mutation-/Retentiontests; E1 nur für Cloud-Sync-Interoperabilität. |
| BL-041.9 | Review/Abschluss nicht blockierend und pausierte Stapel startbar machen. | **E0 + E1 + E2:** Zustands-/Timeouttests; echte Cowork-Laufzeit; beobachtete UX. |
| BL-044.1 | Rekursive Ordnerquelle ohne Linkverfolgung liefern. | **E0 + E1:** synthetische Hierarchie-/Race-Tests; reale Reparse-/Symlink-Gegenprobe. |
| BL-047.1 | Adaptive Parallelität und Performancebudgets aktivieren. | **E0 + E1:** deterministische Scheduler-/Speichertests; Referenzhardwaremessung. |
| BL-049.1 | Signatur/Struktur/Endung und drei Ergebnisgrade umsetzen. | **E0 + E3:** Polyglot-/Korruptionssuite; Security-Review vor Formatfreigabe. |
| BL-042.3 | Inhaltsfreie MCP-App und vollständigen Fallback liefern. | **E0 + E1 + E2:** Schema-/Leckagetests; echte Cowork-Version; A11y-/UX-Abnahme. |

## P0-Release- und Sicherheitsblocker

| Story | Was noch zu liefern bzw. zu prüfen ist | Evidenz und konkrete menschliche Aufgabe |
|---|---|---|
| BL-011.8 | Private Batchwurzel gegen Reparse-, Austausch- und Cleanup-Rennen auf den ersten Releaseplattformen härten. | **E1, ja:** Security-Test auf Windows und macOS mit Symlink/Junction-/Rename-Gegenproben; nur Ergebnis und Fehlercode protokollieren. Linux folgt mit BL-010.4. |
| BL-011.9 | Den vorhandenen POSIX-C-Supervisor als allgemeinen Parserboundary paketieren und aktivieren. | **E1, ja:** Release Engineering baut und startet die signatur-/hashgebundenen macOS-x64- und macOS-arm64-Artefakte; CPU-, RAM-, Fork-, Flood- und Timeout-Gegenprobe real ausführen. Linux folgt mit BL-010.4. |
| BL-012.8 | Den korrigierten macOS-Reviewdialog tatsächlich als `osascript`-Dialog zeigen und abbrechen/vertagen. | **E1, ja:** macOS-Testkonto, frisches Plugin, alle Dialogwege einschließlich Schließen/Escape beobachten. |
| BL-010.7 | Den Local-MCP-Hostvertrag in der konkreten Claude-/Cowork-Version beobachten. | **E1, ja:** In Cowork Desktop eine neue Sitzung öffnen, `privacy_status` prüfen und den positiven sowie getrennten Connectorfall festhalten. |
| BL-010.8 | **E0 abgeschlossen:** SEA-/Dispatcher-Assembly, Dateimodi, Paketgates und Rollback-Verträge sind automatisiert; die drei Programme des Erstreleases und ihr Lebenszyklus bleiben real zu beweisen. | **E1, ja:** Je Windows x64 und macOS x64/ARM64 ohne Host-Node installieren, `initialize`/`privacy_status` ausführen und Upgrade/Rollback testen. Linux folgt mit BL-010.4. |
| BL-041.4 | Direkte Spracheingabe und Skillauswahl müssen im echten Modell identisch sicher starten. | **E1, ja:** Beide Startarten in einer frischen Claude-Sitzung mit synthetischem Fall durchführen und die gleiche sichere Entscheidung dokumentieren. |
| BL-041.5 | Getrennten lokalen Worker mit 500 MiB, Neustart und Cowork-Ende-zu-Ende nachweisen. | **E1, ja:** Windows und macOS in Cowork testen; reale 100-Dateien-/500-MiB-Fälle inklusive Restart und Resume ausführen. Linux folgt später. |
| BL-042.2 | **E0 abgeschlossen:** `readOnlyHint`, `destructiveHint`, `idempotentHint` und `openWorldHint` sind für alle 25 Tools wahrheitsgemäß und regressionsgetestet. | **E1, ja:** Tatsächliche Berechtigungsanzeigen und Ausführungswege für Lese-, Start-, Resume-, Purge- und Skip-Fälle erfassen. |
| BL-051.5 | ZIP- und Marketplace-Lebenszyklus in Cowork testen. | **E1, ja:** Frische ZIP-Installation, Marketplace-Installation, Update, Deaktivierung und Rücknahme mit derselben Claude-Version beobachten. |
| BL-051.6 | Nichtlokale Hostklassen dürfen nie Originale verarbeiten. | **E1, ja:** Web, Mobile, Cloud/Scheduled und Desktop ohne Local MCP mit einem synthetischen Original testen; nur BLOCKED/PASS ohne Upload akzeptieren. |

## Kernworkflow und Nutzerreise

| Story | Was noch zu liefern bzw. zu prüfen ist | Evidenz und konkrete menschliche Aufgabe |
|---|---|---|
| BL-011.3 | Produktiven stapelweiten Pseudonymkontext nur mit OS-Secret-Store aktivieren. | **E1, ja:** DPAPI/Keychain auf Windows und macOS mit Prozesswechsel, Sperre und Löschung real prüfen; keine Klartextfunde dokumentieren. Linux Secret Service folgt mit BL-010.4. |
| BL-011.6 | **E0 abgeschlossen:** Zentrale Stapel-, TXT/Markdown-, CSV-, DOCX- und OOXML-Entpackgrenzen werden im Picker, Snapshot und Parservorlauf regressionsgetestet. | **E1, ja:** Grenzdateien auf Windows und macOS ausführen und Ressourcen-/Stopcodes beobachten; Linux folgt später. |
| BL-011.7 | **E0 abgeschlossen:** Inhaltsfreie lokale Phasen-/Zähleranzeige, sicherer Abbruch und explizites Resume ohne Claude-Polling sind regressionsgetestet. | **E1 + E2, ja:** IT testet Crash/Resume; eine Pilotperson beurteilt, ob der Status und die nächste Aktion verständlich sind. |
| BL-030.2 | Stapelweite stabile Pseudonyme nach positiver Keyring-Evidenz einschalten. | **E1, ja:** Nach BL-011.3 mehrere Dateien mit gleicher synthetischer Person über Restart prüfen; Löschung des Secret-Kontexts verifizieren. |
| BL-012.2 | **E0 abgeschlossen:** Abschluss, Review, Resume, Mapping-Reparatur und Stopp erzeugen automatisiert genau eine inhaltsfreie Meldung mit genau einer nächsten Aktion. | **E1 + E2, ja:** Zielsystemtest plus beobachtete Bedienprobe für alle Dialogwege. |
| BL-012.3 | Vertagte Entscheidungen ohne neue Auswahl korrekt fortsetzen. | **E1, ja:** Lokalen Review vertagen, Prozess/Claude neu starten und die vorhandene Entscheidung später fortsetzen. |
| BL-012.5 | Tastatur, Skalierung und Screenreader der lokalen Dialoge abnehmen. | **E2, ja:** Accessibility-Tester:in prüft Fokusreihenfolge, Escape, Skalierung und Screenreader auf Windows und macOS; Linux folgt später. |
| BL-012.6 | **E0 abgeschlossen:** Status und genau eine nächste sichere Aktion sind alltagssprachlich vereinheitlicht; unbekannte/defekte Zustände stoppen. | **E2, ja:** Fachfremde Pilotperson erklärt nach jedem synthetischen Stop, was passiert ist und was sie als Nächstes tun würde. |
| BL-012.7 | **E0 abgeschlossen:** Pickertext, doppelte lokale Quelldateinamen, Fortsetzung ohne Neuauswahl und Dokumentationsdrift sind regressionsgetestet. | **E2, ja:** Pilotperson startet ohne Anleitung und erreicht ein verwendbares Markdown-Ergebnis mit höchstens drei bewussten Aktionen. |
| BL-031.1 | **E0 P0-Kontextfehler einschließlich der angrenzenden Rollenpräfix-Lücke mit RC43 geschlossen:** Gruppierte mehrdeutige Fundstellen lokal im Stapel entscheiden. | **Evidenzstufe unverändert E1 + E3, ja:** IT prüft Gruppierung/Resume; Fachvertretung bestätigt, dass nur identische Kontextstellen gemeinsam entschieden werden dürfen. |
| BL-032.1 | Mehrdeutigkeitsdialog auf den Releaseplattformen gleich sicher liefern. | **E1 + E2, ja:** Windows und macOS testen Beibehalten/Anonymisieren/Vertagen/Abbruch; beobachtete Person prüft Verständlichkeit. Linux folgt später. |
| BL-041.1 | Beide Skills auf exakt denselben Jobvertrag führen. | **E1, ja:** In echter Claude-UI beide Skills starten und Toolfolge sowie Hostgate vergleichen. |
| BL-041.2 | Ursprüngliche Aufgabe nur begrenzt und fortsetzbar weiterführen. | **E1 + E2, ja:** Chat abbrechen/neustarten und prüfen, dass keine Ersatzverarbeitung entsteht und der Anwender die Fortsetzung versteht. |
| BL-041.3 | Sichtbare bzw. hochgeladene Originale sicher ablehnen. | **E1, ja:** In Claude einen synthetischen Anhang hochladen und bestätigen, dass kein lokaler Originalpfad und keine Inhaltsverarbeitung erfolgt. |
| BL-041.6 | **E0 abgeschlossen:** `local_only` endet im Vertrags-/Transcript-Test mit einem Startaufruf, lokalem Abschluss und ohne Claude-Lese-/Bestätigungs-/Pollingaufruf. | **E1, ja:** In Cowork mit synthetischem Stapel beobachten. |
| BL-041.7 | **E0 abgeschlossen:** 8 normale Werkzeuge aus einer Gesamtoberfläche von 25, tokenfreier asynchroner Reviewstart, Skill-/Handbuch-/Manifestdrift, einmalige begrenzte UTF-8-Dekodierung und kontextgebundenes Seitenbudget sind getestet. Die drei alten Input-Werkzeuge sind auf keiner aufrufbaren Oberfläche mehr vorhanden. | **E1, ja:** Frische Cowork-Installation und reale Freigabezahl; Supportmodus und datenbewahrende Upgrade-Recovery bleiben erreichbar. |
| BL-041.8 | Hostunterstützung für MCP-Tasks/Benachrichtigungen sicher feststellen. | **E0 + E1, ja:** versionsgebundener Cowork-Test; ohne positiven Nachweis bleibt der lokale Worker ohne Polling maßgeblich. |
| BL-050.3 | **E0-Metrik- und Durability-Grundlage abgeschlossen:** Echter TXT-/CSV-/DOCX-Parser, Kalt/Warm, 1/10/100, p50/p95, Gesamtzeit, CPU, Peak-RAM, monotone Uhr, nicht zugeordnete Laufzeit und relative Regressionstore sind implementiert. Der Fsync-Zähltest ist plattformneutral; eine gezielte Rename-Fehlerinjektion belegt die sichere Recovery bei verlorenem non-durable Zwischenmarker. | **Evidenzstufe unverändert E1, ja:** Referenzwerte, reales Power-Loss- und Dateisystemverhalten im installierten Produkt auf Windows/macOS/Linux festhalten. |
| BL-011.10 | Sofortige Hintergrundaufnahme und Recovery während des Intakes sichern. | **E0 + E1, ja:** Crash-/Swap-Test plus echte Mehrfachauswahl auf Windows und macOS; Linux folgt später. |
| BL-011.11 | **E0 abgeschlossen:** Feste I/O-Phasen, gemischtes Exactly-once-Resume sowie einmalige begrenzte Handoff-Dekodierung mit Indexfenster und Buffer-Wipe sind getestet. | **E1, ja:** Byte-/Gate-Regression und Messung auf realen Dateisystemen vor weiterer Optimierung. |
| BL-011.12 | **E0 abgeschlossen:** Ein nicht importierter Zwei-Worker-Harness prüft Reihenfolge, zentralen Commit, geschlossene Nachrichten, Crash, ungewissen Commit und Ressourcenstopps; Produkt bleibt seriell. | **E1, ja:** Ressourcen-/Crashabnahme auf Windows und macOS vor Aktivierung; Linux folgt später. |
| BL-011.15 | Verhaltensneutrale Modulzerlegung mit unveränderter Exportfassade, Charakterisierungs-/Negativtests, vollständiger lokaler CI und Diff-/Dokumentengate. Der lokale terminale Nachweis ist über Pending-/Exported-Marker, opake Receipt-ID und retention-unabhängige Outbox crashfest reparierbar; Discard, Resume/Continue, Snapshot-Invalidierung, der serielle lokale Executor-Runner, der rein speicherinterne Review-Capture und der pure Review-State-/Readiness-Vertrag sind hinter eigenen Lock-, Executor-, Reconciliation-, Snapshot- und tokengebundenen Grenzen isoliert. Active-Locks besitzen eine unveränderliche zufällige Identität und ignorieren volatile Windows-Zeitstempel; Journal- und Runner-Grenzen erzwingen höchstens 100 Positionen und eine fehlgeschlagene Lease-Freigabe meldet keinen Erfolg. | **Nein:** interne Struktur- und Fail-closed-Härtung; menschliche Evidenz wird erst bei einer nachfolgenden sichtbaren Verhaltensänderung fällig. |
| BL-011.15/R2-Review-Publication | Vollständige lokale Review-Entscheidungen vor der ersten Mutation bijektiv an Dokumentindizes und Ambiguitäts-IDs binden; Publish-Callback und deterministische Paket-ID positiv belegen; danach je Dokument atomar publizieren und Post-Commit-Fehler ohne Rückstufung recoverbar halten. | **E0 abgeschlossen, keine menschliche Evidenz:** acht direkte Bindungs-, Mutations-, Publish-Nachweis-, Partial-Publish-, Journalphasen-, Delivery-, Retry-, Mapping- und Cleanup-Negativtests plus 66 reale Batch-Sitzungsszenarien. |
| BL-011.15/R2-Review-Orchestrator | Gemeinsame Review-Orchestrierung mit geteilter Single-Flight-Sperre, Reconciliation vor Readiness, vollständigem speicherinternem Capture, genau einem UI-Aufruf, selektiver Fehlerübersetzung und Evidenz nach Local Finalize isolieren. | **E0 abgeschlossen, keine menschliche Evidenz:** acht direkte Orchestrierungs-, Fehler-, Lock- und Fassadentests einschließlich propagierendem Releasefehler plus Review-/Batch-/MCP-Integration. |
| BL-011.15/R2-Single-Item | Normalen Single-Item-Processing-/Commit-Automaten isolieren und Publish-Nachweis, deterministische Paket-ID sowie recoverbare Post-Commit-Fehler erzwingen. | **E0 abgeschlossen, keine menschliche Evidenz:** elf direkte Zustands-, Security-, Journal-, Mapping-, Cleanup-, Evidence- und Fassadentests einschließlich persistentem Journalausfall plus 67 reale Batch-Sitzungsszenarien mit echter Post-Publish-Adoption und bestehende Reconciliation-/Delivery-Gates. |
| BL-024.4 | **E0 abgeschlossen:** Der nicht importierte Session-Harness belegt geschlossenes Framing, Requestbindung, Replay-Schutz, Single-Flight, Pixel-/Byte-/Zeitbudgets, Abbruch und Fail-Closed; keine Produktintegration. | **E1 + E3, ja:** Offline-Runtime, native Per-Frame-Grenzen, Speicher/Abbruch und Fachvergleich; bis dahin beendet sich der Einbild-Worker absichtlich nach jedem Bild. |

## Content-Gates und gesperrte Formate

| Story | Was noch zu liefern bzw. zu prüfen ist | Evidenz und konkrete menschliche Aufgabe |
|---|---|---|
| BL-020.1 | Content-Graph und Locatorvertrag für alle freigegebenen Container vollständig belegen. | **E1 + E3, ja:** Sicherheitsreview prüft die Markierung/Abdeckung gegen repräsentative synthetische Dokumentstrukturen. |
| BL-020.2 | Rekursive Einbettungen und aktive Inhalte bis zu den Grenzen absichern. | **E1, ja:** Security-Test führt verschachtelte, externe und aktive OOXML-Gegenproben auf Zielsystemen aus. |
| BL-020.3 | Netzwerkfreiheit als OS-Gate zusätzlich zum Node-Guard beweisen. | **E1, ja:** Jede Plattform unter Netzwerkbeobachtung ausführen; ein unabhängiger Testhost protokolliert nur null Verbindungen. |
| BL-021.1 | TXT/Markdown praktisch für den Erstrelease freigeben. | **E1, ja:** Frisch installierter Lauf mit synthetischem Text auf Windows und macOS; Ausgabe, Stopps und Hostgate prüfen. Linux folgt später. |
| BL-021.2 | CSV praktisch für den Erstrelease freigeben. | **E1, ja:** CSV-Dialekte, Formeln und personenbezogene Zellen auf Windows und macOS im installierten Produkt testen. Linux folgt später. |
| BL-022.1 | DOCX-Interoperabilität mit realen Word-Erzeugern schließen. | **E1 + E3, ja:** Word/LibreOffice-/Dritthersteller-DOCX erzeugen und durch Fachexpert:in auf Inhaltserhalt sowie sichere Stops prüfen. |
| BL-022.2 | XLSX erst nach vollständiger Formel-, Kommentar-, Chart- und Relationship-Coverage freigeben. | **E1 + E3, ja:** Security und Fachtest bauen bösartige und normale Arbeitsmappen; Freigabe erst nach vollständiger dreiplattformiger Coverage. |
| BL-022.3 | PPTX erst nach vollständiger Folien-, Master-, Layout-, Notiz- und Chart-Coverage freigeben. | **E1 + E3, ja:** Präsentations- und Security-Test prüfen echte und bösartige PPTX zunächst auf Windows und macOS; unbekannte Inhalte müssen stoppen. Linux folgt später. |
| BL-023.1 | PDF-/OCR-Risikogate als NO-GO erhalten, bis jede Pflichtzelle erfüllt ist. | **E1 + E3, ja:** Security führt die verpflichtende Risikomatrix nach jedem PDF/OCR-Änderungslauf durch; ohne volle Matrix bleibt NO-GO. |
| BL-023.2 | Text-PDFs nur mit vollständiger Parser-, Render- und Sicherheitscoverage freigeben. | **E1 + E3, ja:** PDF-Fach-/Security-Abnahme mit Fonts, Seitenbäumen und manipulierten Text-PDFs zunächst auf Windows und macOS; Linux folgt später. |
| BL-023.3 | PDF-Formulare, Annotationen, Anhänge und Verschlüsselung absichern. | **E1 + E3, ja:** Security testet jede Objektklasse, insbesondere eingebettete Dateien und Passwort-/Signaturfälle, gegen fail-closed Verhalten. |
| BL-023.4 | Scan-PDFs und visuelle Coverage freigeben. | **E1 + E3, ja:** OCR-/Datenschutz-Fachprüfung bewertet Bildtext, Nichttextobjekte, QR/Unterschriften/Gesichter und die lokale Reviewgrenze. |
| BL-024.2 | Gebündelte OCR-Backends zunächst für Windows und macOS bereitstellen. | **E1, ja:** Release Engineering baut/frisch installiert die drei Zielprogramme des Erstreleases und führt Offline-OCR, Hash- und Ressourcenproben aus. Linux folgt später. |
| BL-024.3 | PNG, JPEG und BMP nach OCR-Coverage freigeben. | **E1 + E3, ja:** Bild-/Security-Fachtest prüft Decoder, Metadaten, OCR, Pixelredaktion und unklare visuelle Bedeutung zunächst auf Windows und macOS; Linux folgt später. |

## Distribution, Qualität und externe Abnahme

| Story | Was noch zu liefern bzw. zu prüfen ist | Evidenz und konkrete menschliche Aufgabe |
|---|---|---|
| BL-010.1 | Den portablen Pluginstart auf den jeweils freigegebenen Plattformen tatsächlich beweisen. | **E1, ja:** Frische Windows-/macOS-Zielkonten ohne vorinstallierte Runtime ausführen und nur die reale Startmatrix dokumentieren; Linux wird separat freigegeben. |
| BL-010.2 | Windows-Paket liefern. | **E1, ja:** Windows-Testperson installiert das Artefakt auf frischem Konto, validiert Start, Kernfall und Deinstallation. |
| BL-010.3 | macOS-Paket liefern. | **E1, ja:** macOS-Testperson prüft beide Architekturen, Quarantäne/Start, Kernfall und Entfernen. |
| BL-010.4 | Linux-Paket für den Claude-Code-Host liefern. | **E1, ja:** Linux-Testperson prüft den unterstützten Claude-Code-Host, Start, Kernfall und Entfernen; keine Desktop-App behaupten. |
| BL-010.6 | Versionsarchiv und Rückrolle testen. | **E1, ja:** Release Engineering installiert alte Version, Upgrade und Rückrolle auf Windows und macOS; prüft Konfiguration und synthetische Metadaten. Linux folgt mit BL-010.4. |
| BL-051.1 | Frische ZIP-Installation des Erstreleases abnehmen. | **E1, ja:** Frische Konten auf Windows x64 und macOS Intel/ARM, ZIP-Import, Neustart, `privacy_status` und synthetischer Kernfall. |
| BL-051.2 | Marketplace-Installation des Erstreleases abnehmen. | **E1, ja:** Privaten Marketplace auf Windows und macOS mit einer Testversion nutzen, Installation/Update/Rollback und Entfernung beobachten. |
| BL-051.3 | Realen 100-Dateien-/500-MB-Ende-zu-Ende-Lauf abnehmen. | **E1, ja:** Testverantwortliche Person führt den vorgegebenen lokalen Grenztest im installierten Produkt aus, inklusive Stopps und Resume. |
| BL-051.4 | Rückrolle des Erstreleases abnehmen. | **E1, ja:** Auf Windows und macOS Vorversion installieren, Zielversion installieren, zurückrollen und den synthetischen Kernfall ohne widersprüchliche Daten ausführen. |
| BL-052.1 | Beobachtete Anwenderabnahme durchführen. | **E2, ja:** Reale Pilotpersonen arbeiten mit synthetischen Dateien; Beobachtung erfasst nur Aufgabenabschluss und Verständnis. |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **E3, ja:** Fachvertretung bewertet Erhalt von Rollen, Zertifikaten und fachlichem Inhalt sowie verbleibende Re-Identifikationsrisiken. |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **E3, ja:** Datenschutzbeauftragte:r bewertet Zweck, Grenzen, Logs, Retention, Rechtsaussagen und Pilotfreigabe. |
| BL-052.4 | Gebrauchstauglichkeit mit beobachteten Nutzenden abnehmen. | **E2, ja:** Mindestens eine fachfremde Person durchläuft Start, Stopp, Fortsetzung und Ergebnisverständnis ohne technische Hilfe. |
| BL-052.5 | Zielarchitektur und lokale Sicherheitsgrenze freigeben. | **E3, ja:** Architektur und Security prüfen Verschlüsselung, Quell-Unveränderlichkeit, Prozessgrenzen, Offline-Lieferkette und Hostgate vor breitem Rollout. |

## Konsequenz für die Abarbeitung

Ich kann alle **lokalen** Teilaufgaben ohne Unterbrechung implementieren, testen und
in dieser Matrix als vorbereitet dokumentieren. Eine Story mit E1, E2 oder E3 bleibt
jedoch aktiv, bis die benannte Person die reale Evidenz erbracht hat. Das verhindert,
dass ein lokaler Test fälschlich als Cowork-, Plattform-, Usability- oder
Datenschutzfreigabe ausgegeben wird.
