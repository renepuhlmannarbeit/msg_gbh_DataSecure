# RC80 – Gesamtgegenreview: Anwendung, UX, Datensprache und Performance

**Nachtrag RC81:** R80-01–17 wurden anschließend korrigiert. Einzelne Nachweise
und verbleibende Abnahmegrenzen stehen im [Defectabschluss](RC81_DEFECT_ABSCHLUSS_2026-08-31.md).
Die folgende Befundlage bleibt unverändert als historisches Review erhalten.

Stand: 2026-08-31. Gegenstand: **lokaler, nicht vollständig committeter Arbeitsstand 3.2.0-rc80**, Git-HEAD `afdb1dc`. Kein Review allein des HEAD-Commits. Nach dem unterbrochenen Werkzeugaufruf wurden HEAD und Produktversion erneut geprüft.

## Gesamturteil

Die Grundrichtung ist passend: zwei deutschsprachige Skills, lokaler Node/MCP-Prozess, native Dateiauswahl, Hintergrundverarbeitung und ausdrücklich angeforderte Übergabe bereinigter Ergebnisse. **Ein Sprachwechsel oder eine zusätzliche Schlüsselbund-/Verschlüsselungsarchitektur ist für die gefundenen Probleme nicht erforderlich.**

Der Stand ist dennoch nicht abnahmebereit für unbeaufsichtigte Verarbeitung echter Personalprofile: synthetische Gegenbeispiele zeigen unerkannt verbleibende Personen-/Organisationsangaben und fachlich falsche Ersetzungen. Zusätzlich bestehen reproduzierbare Fehler bei Stapelauswahl, Ergebnisübergabe und Aufbewahrung. Bestehende grüne Tests decken diese Kombinationen nicht ausreichend ab.

Priorisierung: **4 P1, 11 P2, 2 P3**. P1 bedeutet zeitnah vor einer entsprechenden produktiven Nutzung beheben; es wird kein bestätigter Angriff oder bereits erfolgter Datenabfluss behauptet. Bereits bekannte Plattform-/Formatfreigaben stehen getrennt von neuen Codebefunden.

## Prüfauftrag und Grenzen

Drei unabhängige Fachreviews wurden durchgeführt und vom Hauptreviewer zusammengeführt:

- Anwendung/UX/UI: Normalablauf, Auswahl, Abbruch, Fortsetzung, Teilresultate, Dokumentation.
- Daten-/Fachsprache: Personen, Organisationen, Zertifikate, Produktnamen und Gesundheits-IT-Terminologie; verständliche Ergebnisaussagen.
- Software/Architektur/Performance: Plain-Work-Store, Intake, Journal, Recovery, Cleanup, Speicherverbrauch und Paketkanäle.

Die Produktentscheidung DS-065 bleibt unverändert: **keine zusätzliche Verschlüsselung, kein Schlüsselbund, keine Schlüsseldatei, kein Passwort, keine separate VM und kein zusätzliches Betriebssystemkonto.** Arbeitskopien bleiben lokal unverschlüsselt; Originale dürfen nicht gelöscht werden. Eine Korrektur der zugesagten Aufbewahrung ist keine Forderung nach neuer Verschlüsselung.

Nur synthetische Eingaben und isolierte/injizierte Testabhängigkeiten wurden verwendet. Kein Zugriff auf echte Kundendokumente oder produktive Secrets; keine Originale gelöscht. Keine Produktcodeänderungen, kein Commit und kein Push in diesem Review. Dieser Bericht ist das neue Review-Artefakt; die Befunde sind **noch nicht umgesetzt und nicht als erledigt ins kanonische Backlog übertragen**.

Es gab keine echte Cowork-Neuinstallation, keinen sichtbaren Desktop-Abnahmelauf und keine macOS-/Linux-Geräteprüfung. Auch ein Windows-Dialogaufbau ohne `ShowDialog` ersetzt keine Fokus-/DPI-/Mehrmonitor-Abnahme.

## 1. Datenqualität und fachliche Bedeutung

### R80-01 · P1 · Zertifikatsinhaber bleibt im Fließtext erhalten

Stellen: `plugins/data-secure/server/privacy/entities.js:277`, `privacy/engine.js:205`, `privacy/engine.js:328`.

Synthetischer Input, Profil `personnel_profile`:

```text
Zertifizierungen
Zertifikat für Erika Beispielfrau ausgestellt durch Scrum.org.
```

Tatsächlich bleibt der Text unverändert. `credentialIssuerAmbiguities` und die finale Restprüfung einschließlich Ergebnisheader liefern keine Treffer. Mit einem Komma hinter dem Namen greift dagegen ein anderes Verhalten. Das Inhabermuster verlangt einen zu engen Satzabschluss; der Zertifikatskontext unterdrückt weitere Personenkandidaten.

Erwartet: Inhaberin ersetzen, Zertifikatsaussteller erhalten. Kleinster Lösungsansatz: explizite Inhaberbeziehungen auch vor Folgeklauseln wie „ausgestellt durch“ erkennen und nicht pauschal durch den Zertifikatsabschnitt ausnehmen. Regressionen mit/ohne Komma, Zeilenumbruch und vergleichbaren Folgeklauseln durch Engine **und Gateway-Veröffentlichung** führen.

Evidenz: Fachreview und Hauptreviewer haben die realen Anonymisierungs-, Mehrdeutigkeits- und Restprüfungsfunktionen unabhängig ausgeführt. Kein tatsächlicher Upload oder vollständiger Dateipaketlauf für diesen Gegenbeleg.

### R80-02 · P1 · Zertifikatsabschnitt schützt unklare Organisationsnennungen pauschal

Stellen: `plugins/data-secure/server/privacy/credentials.js:123`, `:171`, `:240`.

```text
Zertifizierungen
Bei Nordlicht Beispiel GmbH absolvierte ich die Weiterbildung zum ISTQB Certified Tester.
```

Auch diese unbekannte Variante bleibt unverändert:

```text
Zertifizierungen
Quantum Validation Expert bei Nordlicht Beispiel GmbH
```

Keine lokale Mehrdeutigkeit, keine finale Restfundstelle. Im zweiten Beispiel ist gerade nicht belegt, ob die Firma Aussteller, Schulungsort oder Arbeitgeber ist. Abschnittsschutz ersetzt hier die notwendige Rollenentscheidung; die Mehrdeutigkeitsprüfung betrachtet Katalogtreffer, nicht alle Abschnitts-/Explizit-Treffer.

Lösungsansatz: Schutz auf konkrete Titel-/Ausstellerspannen beschränken. Nicht eindeutig gebundene Organisationen lokal entscheiden lassen. Weder alle Firmen in Zertifikatsabschnitten erhalten noch alle Vorkommen von „bei“ global schwärzen. Regressionen für bekannte und unbekannte Zertifikate, auch ohne Abschnittsüberschrift.

Evidenz: unabhängig wie R80-01 bestätigt. Ein umfangreicherer Zertifikatskatalog allein behebt diesen Fehler nicht.

### R80-03 · P2 · Gleicher Anbieter als Arbeitgeber und Zertifikatsgeber führt zum Fehlstopp

Stelle: `plugins/data-secure/server/privacy/engine.js:358`.

```text
Arbeitgeber: Microsoft
Microsoft Certified: Azure Administrator Associate
```

Ein erster Ersetzungslauf behandelt beide Rollen korrekt. `anonymizeMarkdown` stoppt trotzdem nach drei Durchläufen mit `RESIDUAL_ENTITY`. Die verbleibende legitime Zertifikatsstelle wird anhand des globalen Wörterbucheintrags erneut beanstandet.

Lösungsansatz: Restprüfung mit typ-/positionsbezogenen Rollenentscheidungen statt allein globalen Literalen. Gemeinsames Dokument testen, nicht nur Arbeitgeber und Zertifikat in getrennten Fällen. Hauptreviewer hat den Fehlstopp reproduziert.

### R80-04 · P2 · Gesundheits-IT-Fachbegriffe werden als Kunden ersetzt

Stelle: `plugins/data-secure/server/privacy/personnel.js:188`.

```text
# Kenntnisse
FHIR R4
HL7 V2
SNOMED CT
LOINC
DICOM
```

Tatsächlich entstehen fünf `[KUNDE_…]`-Platzhalter; die Restprüfung besteht. Die Großbuchstabenheuristik greift auch außerhalb echter Projekt-/Organisationskontexte. Fachlich nützliche Inhalte gehen verloren.

Lösungsansatz: Kundenheuristik auf belegte Organisationskontexte beschränken; Fachabschnitte und kompakte Begriffslisten berücksichtigen. Nicht ausschließlich neue Whitelist-Einträge hinzufügen. Hauptreviewer hat alle fünf falschen Ersetzungen bestätigt.

Zusätzliche Fachreview-Beobachtung: „Ich implementiere SNOMED CT, HL7 FHIR und DICOM in der elektronischen Patientenakte.“ erzeugt eine unnötige Aussteller-Mehrdeutigkeit für HL7. Die gemeinsame Nennung von Standards ist noch keine Zertifizierung; als Regression zum selben Themenpaket aufnehmen.

### R80-05 · P2 · Arbeitgeberalias zerstört Produktnamen

Stelle: `plugins/data-secure/server/privacy/engine.js:250`.

```text
Arbeitgeber: Microsoft
Erfahrung mit Microsoft Azure und Microsoft Teams.
```

Tatsächlich: `Erfahrung mit [ARBEITGEBER_001] Azure und [ARBEITGEBER_001] Teams.` Allgemeiner Technologieschutz bei der Personenerkennung schützt nicht vor der späteren globalen Organisationsalias-Ersetzung.

Lösungsansatz: Produkt-/Technologiespannen bei der Alias-Ersetzung erhalten, ohne den Arbeitgeber selbst freizugeben. Hauptreviewer hat das Ergebnis reproduziert.

### R80-06 · P2 · „Persistente Rückzuordnung: nein“ ist missverständlich

Stellen: `plugins/data-secure/server/gateway/compliance.js:88`, `gateway/mapping.js:18`, `:329`.

Der Ergebnisheader behauptet pauschal fehlende persistente Rückzuordnung, obwohl die gewünschte lokale Mapping-Datei Originaldatei und Ergebnis dauerhaft verbindet. Das ist nicht dasselbe wie eine Personen-Pseudonymtabelle, ermöglicht aber dokumentbezogene Rückzuordnung.

Lösungsansatz: Aussage eingrenzen, etwa „Keine persistente Personen-Pseudonymtabelle; lokale Zuordnung von Originaldatei und Ergebnis vorhanden“. Die gewünschte Mapping-Datei nicht abschaffen. Code und Formulierung gegengeprüft; keine zusätzliche rechtliche Bewertung.

## 2. Bedienablauf und UX

### R80-07 · P1 · Windows-Auswahl zwischen mehreren fertigen Stapeln scheitert

Stellen: `plugins/data-secure/server/companion/completed-batch-picker.js:39`, `:49`, `:99`.

Bei mindestens zwei fertigen Stapeln erzeugt jedes `$list.Items.Add(...)` zusätzlich einen Index auf stdout. Nach einer gültigen Auswahl entsteht `0\r\n1\r\n1`; `Number(output)` ergibt `NaN`. Außerdem wird `SelectedIndex=0` vor dem Befüllen gesetzt und löst einen Zuweisungsfehler aus.

Lösungsansatz: Rückgaben der Add-Aufrufe unterdrücken und Vorauswahl nach dem Befüllen setzen. Regression mit tatsächlich ausgeführtem PowerShell-Aufbau und genau einer numerischen Rückgabe; auch Abbrechen abdecken.

Evidenz: Hauptreviewer hat das vom Produkt erzeugte PowerShell-Skript ohne sichtbaren Dialog ausgeführt; nur `ShowDialog` wurde durch eine synthetische OK-Auswahl ersetzt. Ergebnis: `stdout:"0\r\n1\r\n1"`, Selection-Fehler vorhanden, numerische Auswertung ungültig. Keine Benutzerinteraktion vorgetäuscht.

### R80-08 · P2 · Letzte Ergebnisseite blockiert nächsten Auswertungsauftrag

Stellen: `plugins/data-secure/server/gateway/local-only-handoff.js:92`, `:180`, `:187`; Anonymisieren-`SKILL.md:26`.

Die letzte Seite meldet `more:false`, lässt die Sitzung aber offen. Bestätigung und Freigabe erfolgen erst mit einem weiteren `next()`. Dieser zusätzliche Aufruf ist im normalen Ablauf nicht erforderlich. Ein neuer ausdrücklicher Start erhält daher `local_handoff_active`.

Unabhängiges Ergebnis: `firstMore:false`, `nextStartError:local_handoff_active`, `acks:0`, `sessionPresent:true`. Der bisher grüne Test ruft nach der letzten Seite nochmals `next()` auf und verdeckt die Lücke.

Lösungsansatz: terminale bereits ausgelieferte Sitzung beim nächsten ausdrücklichen Start kontrolliert abschließen oder einen eindeutigen Abschlussvertrag schaffen. Noch laufende mehrseitige Übergaben weiterhin schützen. Keine neue Benutzerbestätigung hinzufügen. Pflichtregression: `start → more:false → start`.

### R80-09 · P2 · Abbruchsignal erreicht die normale Dateiauswahl nicht

Stellen: `plugins/data-secure/server/index.js:207`, `companion/file-picker.js:30`, `docs/ANLEITUNG.md:305`.

Der MCP-Dispatcher erhält ein AbortSignal, übergibt es jedoch nicht an `startPickerBatch`. Der Picker verwendet `spawnSync`; währenddessen kann derselbe Node-Prozess die eingehende MCP-Abbruchnotification nicht verarbeiten. Nach späterer Auswahl kann der Intake-Worker trotzdem starten.

Lösungsansatz: diesen UI-Aufruf asynchron und signalgebunden machen; nur den eigenen Dialogprozess beenden und unmittelbar vor Intake-Start das Signal prüfen. Dokumentieren, dass ein **bereits erfolgreich gestarteter unabhängiger Hintergrundlauf** nicht allein durch das Ende einer Cowork-Aufgabe gestoppt wird.

Codefehler bestätigt. Ob ein bestimmter Claude-Build bei „Stopp“ eine Notification sendet oder den MCP-Prozess beendet, ist ein gesonderter echter Hosttest. Nicht behaupten, jedes Stoppen in Claude reproduziere bereits dieses Szenario.

### R80-10 · P2 · Anleitung widerspricht Normalablauf und Bildbehandlung

Stellen: `docs/ANLEITUNG.md:291`, `:321`; Anonymisieren-`SKILL.md:23`; `references/beispiele.md:35`.

Die Anleitung verspricht Abschlusszähler durch Claude und anschließendes Lesen. Der aktuelle Skill beendet den lokalen Start ausdrücklich sofort, pollt nicht und verlangt für die Auswertung einen späteren neuen Auftrag. Anwender können deshalb vergeblich auf eine Chat-Abschlussmeldung warten.

Zudem verspricht „entferne alle Bilder“ lokales Verwerfen; der normale Start besitzt dafür kein Argument, und das Skill-Beispiel hält ausdrücklich am Bildstandard fest. Lokal zurückhalten ist nicht dasselbe wie lokal löschen.

Lösungsansatz: Anleitung und Beispiele an den beschlossenen Zweischritt-Ablauf und tatsächlichen Bildstandard angleichen. Kein neuer Dialog und kein Umbau der Produktentscheidung nötig. Auch die vereinfachte README-Ablaufgrafik aktualisieren: derzeit DOCX/TXT und unmittelbarer Pfeil zu Claude statt vier freigegebenen Textformaten und späterer Übergabe.

### R80-11 · P3 · Dokumentierter Privacy-Ordner-Aufruf fehlt im Normalmodus

Stellen: `docs/ANLEITUNG.md:244`, `plugins/data-secure/server/index.js:61`.

„Öffne den Privacy-Ordner“ wird empfohlen, das entsprechende technische Werkzeug ist aber nur im Supportmodus freigeschaltet. `open_export_folder` ist normal verfügbar.

Lösungsansatz: für Anwender „lokale Ergebnisübersicht öffnen“ verwenden; technische Ordneröffnung als Supportaktion kennzeichnen. Den normalen Werkzeugkatalog dafür nicht wieder vergrößern.

## 3. Datenlebenszyklus und Performance

### R80-12 · P1 · Absturz beim Intake hinterlässt nicht erfasste Arbeitskopien

Stellen: `plugins/data-secure/server/gateway/batch-intake.js:162`, `:212`; `gateway/batch-recovery.js:190`.

Das `.work`-Verzeichnis wird angelegt und vollständig befüllt, bevor das erste Journal geschrieben wird. Ein Prozessabbruch dazwischen erreicht den `catch`-Cleanup nicht. Recovery und TTL-Maintenance suchen nur `.json`-Journale. Die separate Job-Bereinigung in `gateway/orchestrator.js:82` arbeitet in einem anderen Bereich und mit anderem Namensmuster.

Unabhängig mit injiziertem Dateisystem bestätigt: ein einzelnes `<token>.work` liefert in Recovery und Cleanup jeweils `removed:0, failures:0`; beide Rückstandszähler bleiben null. Das ist keine gemessene native Crash-Abnahme, sondern der Nachweis, dass der entstehende Zustand nicht entdeckt wird.

Lösungsansatz: vor Kopierbeginn einen kleinen dauerhaft gespeicherten Intake-/Ownership-Intent schaffen; nach Abbruch ausschließlich solche nachweislich selbst angelegten Arbeitskopien wiederfinden und nach dem vorgesehenen Lebenszyklus bereinigen. Keine pauschale Löschung unbekannter Altverzeichnisse. Unverschlüsselter Speicher bleibt ausdrücklich die Produktentscheidung.

### R80-13 · P2 · Terminal-Cleanup umgeht Erhaltung alter verschlüsselter Kopien

Stellen: `plugins/data-secure/server/gateway/batch-delivery.js:45`, `:55`; `gateway/batch-processing-orchestrator.js:66`; `gateway/batch-snapshot-invalidation.js:43`.

Der direkte gemeinsame Löschpfad prüft Name und regulären Dateityp, aber nicht den Legacy-Dateikopf. Eine alte Ciphertext-Datei mit `.workcopy`-Namen kann bei einer Snapshot-Invalidierung als Geschwisterdatei mitgelöscht werden. Die neue Headerprüfung in der Journal-Maintenance schützt diesen separaten Pfad nicht.

Fachreview: Processor/Invalidator/Delivery mit synthetisch beschädigter erster Kopie und zweiter `DSARTF01`-Datei. Hauptreviewer: denselben Terminal-Löschhelper mit vollständig injiziertem Dateisystem ausgeführt; `cipherSurvives:false`. Keine echte Datei gelöscht und keine Löschung von Benutzeroriginalen nachgewiesen. P2 wegen besonderem Legacy-/Fehlerzustand, nicht mit normalem Originalverlust gleichsetzen.

Lösungsansatz: dieselbe begrenzte Legacy-Erkennung direkt an der gemeinsamen Löschgrenze verwenden; betroffene Altdatei und Nachweise erhalten. Keine Entschlüsselung oder neue Schlüsselverwaltung entwickeln.

### R80-14 · P2 · Aufbewahrung 0 Tage lässt neue Stapel sofort ablaufen

Stellen: `plugins/data-secure/server/gateway/batch.js:97`; `gateway/batch-intake.js:154`; `gateway/batch-journal-store.js:268`.

Bei zulässiger Retention 0 werden Erstellungs- und Ablaufzeit gleichgesetzt, sogar vor dem Kopieren. Der erste spätere Journal-Read behandelt den Stapel als abgelaufen und bereinigt ihn, bevor er verarbeitet wird. Der Kommentar „am Ende der aktuellen Operation“ entspricht nicht dieser Implementierung.

Fachreview hat den echten Journal-Reader mit synthetischer Uhr `created_at == expires_at`, anschließend +1 ms, geprüft: Expiry und Cleanup. Hauptreviewer hat Berechnung und Löschzweig gegengelesen. Bisheriger Zero-Day-E2E betrifft Einzelverarbeitung, nicht diesen Stapellebenszyklus.

Lösungsansatz: aktive Verarbeitung von der Aufbewahrung pausierter/abgeschlossener Kopien trennen und Zero-Day am definierten Lifecycle-Ende anwenden. Mit Intake, Verarbeitung, Pause und Wiederaufnahme testen.

### R80-15 · P2 · Sammelreview überschreitet Einzeldokumentgrenze und meldet „abgebrochen“

Stellen: `plugins/data-secure/server/gateway/batch-review-orchestrator.js:49`, `:78`; `companion/text-review.js:157`.

Zunächst werden sämtliche Review-Dokumente rekonstruiert. Danach werden Originale und Ergebnisfassungen jeweils zusammengefügt und erst dann gegen 8.000.000 Zeichen geprüft. Zwei jeweils zulässige Dokumente mit 4.000.000 ASCII-Zeichen scheitern bereits wegen zusätzlicher Trennzeilen. Die Oberfläche meldet anschließend `LOCAL_REVIEW_CANCELLED`; Wiederholen ändert nichts.

Fachreview und Hauptreviewer haben den tatsächlichen Aggregationscode mit zwei solchen Entwürfen ausgeführt. Nur die PII-Span-Erkennung wurde für den isolierten Größencheck gestubbt. Ergebnis: „Der lokale Stapelreview ist zu groß …“.

Lösungsansatz: Budget vor Rekonstruktion/Verkettung prüfen und Review in begrenzten Gruppen ermöglichen; echte Größenfehler als solche ausgeben. Kein zweiter Bestätigungsdialog je Datei; keine bloße Erhöhung einer großen Speichergrenze.

### R80-16 · P2 · Gesamtes Journal wird pro Datei vielfach neu geschrieben

Stellen: `plugins/data-secure/server/gateway/batch-item-processor.js:83`, `:88`, `:135`, `:148`, `:151`, `:174`; `gateway/batch-journal-store.js:87`.

Der normale Erfolgsweg schreibt für mehrere diagnostische und verbindliche Zustandswechsel jeweils den ganzen Stapel. `durable:false` spart fsync, nicht Serialisierung und Dateiersetzung. Damit wächst die über alle Dateien serialisierte Metadatenmenge quadratisch mit der Stapelgröße.

Fachreview-Messung am tatsächlichen Item-Processor mit synthetischer Erfolgspipeline und gezählten Schreibaufrufen:

| Dateien | Journalwrites | davon durable | serialisierte Bytes |
| --- | ---: | ---: | ---: |
| 10 | 100 | 50 | 476.560 |
| 100 | 1.000 | 500 | 46.705.600 |

Die konkreten Bytezahlen hängen vom synthetischen Metadatenaufbau ab. Es wurden dabei keine realen Datenträgerlatenzen gemessen; **kein behaupteter 98-facher Zeitverlust**. Der Hauptreviewer hat Schreibstellen und vollständige JSON-Serialisierung gegengeprüft.

Lösungsansatz: rein diagnostische Zwischenstände zusammenfassen; unmittelbar benachbarte gleichwertige Zustandsupdates bündeln. Für Veröffentlichung, Mapping und Recovery nötige dauerhafte Grenzen erhalten. Danach echte lokale 10-/100-Dateien-Läufe messen, getrennt nach Parser, Erkennung, Journal/Mapping und Ergebnisübergabe. Zusätzliche Threads sind nicht der erste Fix für vermeidbare Schreibarbeit.

### R80-17 · P3 · Output-Schutzscan versteht das eigene aktuelle Journalformat nicht

Stelle: `plugins/data-secure/server/gateway/batch-retention-protection.js:37`.

Der Helper akzeptiert nur `datasecure-batch/1`; aktuelle v4-Journale führen zu `complete:false`. Fachreview hat dies mit einem synthetischen gültigen v4-Delivery-Eintrag ausgeführt; Hauptreviewer hat die Bedingung bestätigt.

Aktuell führt dies nicht zur automatischen Löschung von Output, weil diese ohnehin ausgenommen ist. Es bleibt ein veralteter Scan mit falschem Vollständigkeitsstatus. Unterstützte Schemas korrigieren oder den nachweislich überflüssigen Scan entfernen, nachdem alle Aufrufer geprüft wurden.

## 4. Claude-Best-Practice und Paketkanäle

### Was passt

Plugin-Metadaten unter `.claude-plugin`, getrennte Skill-Verzeichnisse, `.mcp.json` und der Plugin-Pfadparameter entsprechen der dokumentierten Plugin-Struktur. Die beiden Skills bleiben kurz und verweisen auf Details nur bei Bedarf. Das passt zu Anthropicʼs Empfehlungen für progressive Offenlegung und kompakte Skill-Anweisungen. [Plugin-Referenz](https://code.claude.com/docs/en/plugins-reference), [Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

Die offizielle Claude-Dokumentation beschreibt ausdrücklich Plugins mit lokalen MCP-Servern sowie das Hochladen eigener Plugin-Dateien. Der ZIP-Weg ist damit grundsätzlich passend; daraus folgt noch keine Garantie, dass auf jedem Zielgerät die benötigte Node-Runtime vorhanden ist. [Plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude).

### Lokal ist nicht durch den Namen „Cowork“ bewiesen

Die aktuell abgerufene Architektur-Dokumentation unterscheidet Cloud- und lokale Sitzungen. In lokalen Sitzungen laufen Plugin-MCP-Server nativ auf dem Gerät; Codeausführung kann eine von Claude verwaltete VM verwenden. Eine ausgefallene Workspace-VM bedeutet laut Dokumentation nicht automatisch, dass native Datei-/Web-Werkzeuge ebenfalls ausfallen. Deshalb darf ein Workspace-Banner allein nicht mehr als Beweis eines defekten DataSecure-MCP gelten. [Cowork-Architektur](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview).

Für dieses Produkt weiter wichtig: Originale nur über den echten lokalen Prozess auswählen; keine Cloud-/Upload-Ausweichroute. Keine vom Anwender einzurichtende VM. Die lokale Vorverarbeitung kann offline ausgelegt sein, **die anschließende Claude-Modellauswertung ist dadurch nicht offline**. Kein neuer Architekturumbau aus diesen Aussagen abgeleitet.

### Noch bestehende Paket-/Plattformgrenzen

- Die normale ZIP startet `node` über `.mcp.json`. Der Nachweis einer frischen Installation einschließlich Runtime-Auflösung bleibt offen; die lokale CLI-Manifestprüfung beweist dies nicht.
- Marketplace zeigt auf `./plugins/data-secure`, während der ZIP-Build durch `scripts/lib/product-files.mjs` Legacy-Dateien ausfiltert. Im Quellverzeichnis liegen 30 ausgeschlossene Dateien mit zusammen 9.054.310 Bytes, darunter alte Keyring-Module/Vendor-Dateien. Das ist eine nachgewiesene **Quell-/Paketdivergenz**, kein Nachweis eines produktiven Schlüsselbundaufrufs. Den tatsächlichen Marketplace-Installationsinhalt prüfen und Vertriebskanäle vereinheitlichen. Für reinen ZIP-Test ist das kein Beleg eines Keyring-Rückfalls.
- Freigegeben sind weiterhin nur TXT, Markdown, CSV und DOCX. XLSX/PPTX/PDF/OCR/eigenständige Bilder bleiben gesonderte Release-Themen, keine durch dieses Review erledigten Features.
- macOS-/Linux-Dialoge, Runtime-Start, bekannte Review-Einschränkungen und tatsächliches Claude-Toolrouting brauchen die vorgesehenen Plattformnachweise. Windows-Skriptaufbau und portable Unit-Tests beweisen diese nicht.
- Die passive Status-App ist standardmäßig deaktiviert und darf nicht als normal verfügbare Live-Fortschrittsoberfläche beschrieben werden.
- Hostseitige Werkzeugberechtigungen sind nicht allein durch einen Skill abschaltbar. Keine Umgehung und keine neue pro-Datei-Bestätigung empfehlen.

## 5. Testnachweise dieses Reviews

| Prüfung | Ergebnis | Aussagegrenze |
| --- | --- | --- |
| Claude CLI 2.1.233: `plugin validate plugins/data-secure` | bestanden | Manifest, kein Cowork-Start |
| Claude CLI: `plugin validate .claude-plugin/marketplace.json` | bestanden | Marketplace-Metadaten, kein installierter Bytevergleich |
| `test-credential-catalog.js` | 24 bestanden, Fachreview | vorhandene Fälle; R80-01/02/03 trotzdem reproduzierbar |
| `test-pii-regression.js` | 79 bestanden, Fachreview | vorhandene Fälle; neue Gegenbeispiele fehlen |
| `test-local-only-handoff.js` | 8 bestanden, Hauptreviewer | zusätzlicher Abschlussaufruf kaschiert R80-08 |
| `test-cowork-documentation-contract.js` | bestanden | erfasst R80-10/11 nicht vollständig |
| `test-plugin-structure.js` | bestanden | Struktur, nicht Benutzerfluss |
| Neue synthetische Datengegenbeispiele | R80-01 bis -05 bestätigt | reale Engine-/Restprüfung, kein tatsächlicher Modellexport |
| Windows-Picker ohne sichtbaren Dialog | R80-07 bestätigt | kein DPI-/Fokus-Test |
| `start → more:false → start` | R80-08 bestätigt | injizierte Paketzugriffe, reale Handoff-Logik |
| Recovery nur mit orphan `.work` | R80-12 bestätigt | injiziertes Dateisystem, kein Prozesskill |
| Terminal-Delete mit Legacy-Magic | R80-13 bestätigt | injizierter Unlink; keine echte Löschung |
| Zwei 4-Millionen-Zeichen-Reviewentwürfe | R80-15 bestätigt | Span-Erkennung isoliert, echter Aggregationscode |

Frühere RC80-Vollsuite-/Build-Ergebnisse bleiben historische Evidenz. Sie wurden hier nicht als neu ausgeführter kompletter Testlauf ausgegeben. Die zusätzlichen Gegenbeispiele widerlegen keine bestandenen Tests, sondern zeigen deren Abdeckungslücken.

## 6. Empfohlene nächste Arbeitspakete

Diese Reihenfolge ist eine Review-Empfehlung, kein bereits erteilter Implementierungs-/Release-Nachweis:

1. **Fachliche Erkennung korrigieren:** R80-01/02 zuerst, dann -03/-04/-05. Jede Rollenpaarung im selben Dokument prüfen; Namen ersetzen und Zertifikats-/Technologieinhalt erhalten. Reale Gateway-Pakettests ergänzen.
2. **Normalablauf zuverlässig abschließen:** R80-07/-08/-09; dann Dokumentation -10/-11/-06 konsistent machen. Keine zusätzlichen Anwenderschritte.
3. **Arbeitskopien sauber verwalten:** R80-12/-14/-13/-17 mit synthetischen Crash-/Expiry-/Legacy-Zuständen. Originalschutz beibehalten; keine Keyring-Arbeit.
4. **Größenfestigkeit und Performance:** R80-15/-16; begrenzte Reviewgruppen, weniger Journalwrites, danach vergleichbare echte lokale Benchmarks. Kein Sprachwechsel vor Messung.
5. **Release-Gegenprobe:** ZIP/Marketplace-Inhalt und Runtime-Start prüfen; anschließend kurzen echten Cowork-UAT mit mehreren fertigen Stapeln, wiederholter Auswertung und einem Abbruch. Plattformgrenzen offen ausweisen.

**Eigenständig entwickelbar:** die genannten Code-/Test-/Dokumentationskorrekturen und lokale synthetische Regressionen. **Echte Anwender-/Host-Evidenz nötig:** Installation im tatsächlichen Claude-Build, sichtbarer Ablauf/Berechtigungen, Geräte-/Plattformdialoge und subjektive Verständlichkeit. Dafür keine VM oder zusätzlichen Benutzerkonten verlangen.
