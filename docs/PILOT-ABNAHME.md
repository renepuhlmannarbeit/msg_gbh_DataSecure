# DataSecure Pilot-Abnahme

Version 3.2.0 RC23 · ausschließlich synthetische Daten

Diese Checkliste prüft den installierten End-to-End-Pfad und die Verständlichkeit.
Sie ersetzt weder Security Review noch Datenschutzfreigabe. RC23 bleibt bis zum
vollständigen Go/No-Go ein Engineering-Build.

## 1. Rollen und Nachweise

- **Durchführung:** IT/Testverantwortliche auf einem frischen Windows-Testkonto.
- **Beobachtung:** mindestens eine fachfremde Pilotperson für die Usability-Fälle.
- **Freigabe:** Produkt, IT-Security und Datenschutz nach ihren internen Vorgaben.
- **Korpus:** ausschließlich im Repository erzeugte oder ausdrücklich als vollständig
  synthetisch geprüfte Dateien.

Je Fall nur diese Nachweise erfassen: Build-Commit, Artefakt-SHA-256, Plattform- und
Claude-Version, Ergebnis `PASS/FAIL/BLOCKED`, nicht sensitiver Fehlercode und kurze
Begründung. Keine Dokumenttexte, Pfade, Dateinamen oder Screenshots mit Inhalt.

## 2. Vorbedingungen

- [ ] CI ist auf `main` für Ubuntu, Windows, Repository-Guards und Paket-Build grün.
- [ ] Build-Commit und Artefaktprüfsummen sind protokolliert.
- [ ] Testsystem enthält keine echten DataSecure-Dokumente oder Altbestände.
- [ ] Aktuelle Claude-Desktop-Version und erlaubte Desktop Extensions sind bestätigt.
- [ ] Zu prüfender Installationsweg ist festgelegt: MCPB oder Plugin-ZIP.
- [ ] Abbruch- und Löschrechte der Testperson sind erklärt.

## 3. Installation und Start

- [ ] Artefakt lässt sich ohne npm-, Python-, Java- oder OCR-Modellinstallation durch
      den Endanwender installieren.
- [ ] Claude-Neustart aktiviert DataSecure.
- [ ] `privacy_status` zeigt Version, Retention, Companion-/Review-Fähigkeit und
      `visual_bridge` verständlich an.
- [ ] `privacy_status` zeigt auf Windows x64 `parser_boundary: windows_job_object`.
      Fehlender oder manipulierter Launcher meldet `PARSER_ISOLATION_FAILED`, öffnet
      keinen Dateidialog und startet Node nicht direkt.
- [ ] `privacy_status` zeigt auf Windows x64 `visual_boundary: windows_job_object`.
      Fehlender oder manipulierter Launcher startet weder OCR noch Rasterisierung
      direkt; Grafiken bleiben zurückgehalten.
- [ ] PDF erscheint ausschließlich unter `blocked_inputs` mit
      `PDF_COVERAGE_UNVERIFIED`, nicht unter den unterstützten Eingaben.
- [ ] Der Privacy-Ordner öffnet sich und enthält die vier erwarteten Bereiche.
- [ ] Ein absichtlich beschädigtes oder falsch versioniertes Artefakt wird nicht als
      einsatzbereit gemeldet.
- [ ] Erstinstallation startet aus dem festgelegten Artefakt ohne zusätzliche Runtime.
- [ ] Update auf eine höhere Testversion erhält Konfiguration und synthetische
      Aufbewahrungsmetadaten und meldet die neue Version.
- [ ] Rollback auf die vorherige Version startet und verarbeitet den synthetischen
      Kernfall ohne widersprüchliche Pakete.
- [ ] Erneutes Upgrade auf die Zielversion ist praktisch bestanden.

## 4. TXT-/DOCX-Mehrfachauswahl und lokale Textprüfung

Synthetischer Inhalt soll einen automatisch erkannten Namen/E-Mailkontakt, den
zusätzlichen Alias `Blauwal` und fachlichen Text wie `Rolle: Lösungsarchitektin`
enthalten.

- [ ] „Anonymisiere eine oder mehrere Dateien lokal“ öffnet einen Dateidialog
      außerhalb Claude.
- [ ] Eine bis 25 TXT-/DOCX-Dateien lassen sich gemeinsam auswählen und werden mit
      verständlichem Fortschritt nacheinander verarbeitet.
- [ ] Abbruch oder Fehler bei einer Datei veröffentlicht dafür nichts, blockiert aber
      die übrigen ausgewählten Dateien nicht.
- [ ] Nach einer Mehrfachauswahl erscheint die Abschlussansicht genau einmal und zeigt
      ausschließlich „Ausgewählt“, „Erfolgreich vorbereitet“ und „Sicher gestoppt“.
- [ ] Die Abschlussansicht formuliert alle erfolgreich, teilweise erfolgreich und
      vollständig sicher gestoppt korrekt; sie enthält keine Rohdaten, Dateinamen,
      Pfade, Job-/Paket-IDs oder technischen Fehler.
- [ ] „Schließen“ und das Fensterschließen schließen nur die Ansicht. Sie starten keine
      Wiederholung und erteilen keine Freigabe. Bei einer Einzeldatei erscheint keine
      zusätzliche Abschlussansicht.
- [ ] Claude zeigt weder gewählten Pfad noch Originaltext.
- [ ] Links sind Hinweise im normalisierten Quelltext sichtbar; rechts ist die
      automatisch bereinigte Fassung schreibgeschützt.
- [ ] `Blauwal` kann ausgewählt und nur durch `[MANUAL_REDACTION]` ersetzt werden.
- [ ] Die untere Vorschau entspricht exakt dem später freigegebenen Text.
- [ ] Rolle und sonstiger fachlicher Inhalt bleiben unverändert.
- [ ] „Geprüft freigeben“ veröffentlicht erst nach erneut bestandenem Residual-Gate.
- [ ] „Prüfung überspringen“ überspringt nur die Sichtkontrolle, nicht technische
      Coverage-, Rest-PII- oder Visual-Gates.
- [ ] „Abbrechen“ beziehungsweise Fensterschließen veröffentlicht nichts.
- [ ] DOCX mit Bild oder unbekanntem inhaltsfähigem Part bleibt gesperrt.

Automatisierte Basisevidenz: Der native Windows-Forms-Pfad mit synthetischer Alias-
Auswahl, Redaktions- und Freigabe-Schaltfläche ist im Windows-Test enthalten. Die
vorstehenden Punkte prüfen zusätzlich Verständlichkeit und den installierten Pfad.

## 5. Andere und formatgemischte Dateien über den Input-Ordner

Jeweils eine synthetische DOCX-, XLSX-, PPTX-, CSV-, PNG-, JPEG- und BMP-Datei
verwenden. Text- und Scan-PDF separat als verpflichtende Stop-Gegenprobe prüfen.

- [ ] Unterstützte Formate erzeugen ein verifiziertes Privacy-Paket oder einen
      verständlichen fail-closed Grund.
- [ ] PPTX-Sprechernotizen und XLSX-Zelltexte werden berücksichtigt.
- [ ] CSV-Inhalt kann nicht aus seinem Markdown-Fence ausbrechen.
- [ ] Jedes PDF stoppt mit `PDF_COVERAGE_UNVERIFIED`, stellt das Original wieder her
      und erzeugt weder Teil- noch Output-Paket.
- [ ] Synthetische PII im Scan wird geschwärzt und durch zweiten OCR-Lauf verifiziert.
- [ ] EMF/WMF rasterisiert sicher oder wird vollständig zurückgehalten.

## 6. Visuelle Sicherheitsgrenze

- [ ] Automatisch verifizierte Rastergrafiken erscheinen als freigegebene PNG-Assets.
- [ ] Unsichere/OCR-arme Grafiken erscheinen nur lokal unter
      `Needs Visual Review`.
- [ ] Bewerber- und Personalvisuals bleiben unabhängig vom Textreview lokal und für
      Claude unlesbar.
- [ ] Öffnen des Review-Ordners, eine Chatbehauptung oder ein MCP-Boolean kann ein
      zurückgehaltenes Bild nicht freigeben.
- [ ] Abgelaufene Preview bleibt gesperrt; erneute Verarbeitung ist erforderlich.

RC23 besitzt bewusst keinen visuellen Human-Presence-Freigabekanal. Ein Pilot darf
diese Einschränkung nicht als Fehler umgehen.

## 7. Ausgabe- und Manipulationsschutz

- [ ] Claude kann ausschließlich freigegebenes Markdown und freigegebene Assets lesen.
- [ ] Originale und lokale Review-Vorschauen sind über kein Read-Tool erreichbar.
- [ ] Nachträgliche Änderung an Markdown oder Asset blockiert das Lesen.
- [ ] Ein manipuliertes Manifest, Paketpfad oder eine Review-ID kann den Output-Bereich
      nicht verlassen.
- [ ] Dokumentinhalt mit Anweisungen an Claude bleibt inert und verändert den Ablauf
      nicht.

## 8. Aufbewahrung und Löschung

- [ ] `privacy_status` zeigt aktive Frist, fällige Einträge und Löschfehler ohne Pfade.
- [ ] Abgelaufene synthetische Processed-, Output- und Preview-Einträge verschwinden;
      Audit-Metadaten und aktive versteckte Staging-Bereiche bleiben korrekt erhalten.
- [ ] `purge_local_data` verlangt die dokumentierte ausdrückliche Bestätigung und
      löscht nur den gewählten Scope.
- [ ] Bei Retention `0` verschwindet das verarbeitete Ordner-Original am nächsten
      Cleanup-Trigger, während das gerade erzeugte Paket noch für die aktuelle Antwort
      lesbar ist.
- [ ] Eine geöffnete/gesperrte Testdatei erzeugt sichtbaren Löschfehler statt eines
      stärkeren oder breiteren Löschversuchs.

## 9. Wiederanlauf und Fehler

- [ ] Abbruch in jeder Verarbeitungsphase erzeugt keinen Teiloutput.
- [ ] Ein verwaister privater Arbeitsordner wird beim nächsten Start sicher bereinigt.
- [ ] Symlink, Junction, unbekannter Ordner oder ungültige Ownerdatei wird nicht
      traversiert oder gelöscht.
- [ ] Wiederholung erzeugt keine widersprüchlichen Pakete.
- [ ] Fehlertext beantwortet: Was ist passiert? Wurde etwas freigegeben? Wo bleibt
      das Original? Was ist der nächste sichere Schritt?

## 10. Usability

Mit mindestens einer Person testen, die weder MCP noch Node/OCR/JSON kennt:

- [ ] Erstes synthetisches Ergebnis mit höchstens drei bewussten Nutzeraktionen.
- [ ] Person lädt das Original nicht über die normale Büroklammer hoch.
- [ ] Person versteht den Unterschied zwischen Textreview und zurückgehaltenem Bild.
- [ ] In weniger als zehn Sekunden ist klar, ob das Ergebnis verwendbar ist.
- [ ] Bezeichnungen behaupten „lokal de-identifiziert/geprüft“, nicht garantierte
      rechtliche Anonymität.
- [ ] Abbruch, Fehler und Löschung werden ohne technische Hilfe korrekt verstanden.

## 11. Go/No-Go-Entscheidung

**Go für einen begrenzten Pilot mit ausdrücklich freigegebenen Daten** nur, wenn:

- alle harten Sicherheits-, Installations-, Update-/Rollback- und Löschfälle `PASS`
  sind;
- keine offene P0-Sicherheitslücke oder unklare Rohdatenübertragung existiert;
- Artefakte signiert, mit SBOM und freigegebener Herkunft versehen sind;
- menschliche Usability-Abnahme bestanden ist;
- Datenschutz und IT-Security den konkreten Zweck und Pilotumfang freigegeben haben.

Jedes `FAIL` bei Rohdatenzugriff, Coverage, Residual-Gate, Visual-Gate, Manipulations-
oder Löschgrenzen bedeutet **No-Go**. `BLOCKED` ist kein `PASS`.
