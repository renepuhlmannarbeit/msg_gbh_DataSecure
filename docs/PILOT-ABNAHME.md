# DataSecure Pilot-Abnahme

Version 3.2.0 RC29 · ausschließlich synthetische Daten

Diese Checkliste prüft den installierten End-to-End-Pfad und die Verständlichkeit.
Sie ersetzt weder Security Review noch Datenschutzfreigabe. RC29 bleibt bis zum
vollständigen Go/No-Go ein Engineering-Build.

## 1. Rollen und Nachweise

- **Durchführung:** IT/Testverantwortliche auf einem frischen Windows-Testkonto und
  für den portablen Textpfad zusätzlich auf einem frischen macOS-Testkonto.
- **Beobachtung:** mindestens eine fachfremde Pilotperson für die Usability-Fälle.
- **Freigabe:** Produkt, IT-Security und Datenschutz nach ihren internen Vorgaben.
- **Korpus:** ausschließlich im Repository erzeugte oder ausdrücklich als vollständig
  synthetisch geprüfte Dateien.

Je Fall nur diese Nachweise erfassen: Build-Commit, Artefakt-SHA-256, Plattform- und
Claude-Version, Ergebnis `PASS/FAIL/BLOCKED`, nicht sensitiver Fehlercode und kurze
Begründung. Keine Dokumenttexte, Pfade, Dateinamen oder Screenshots mit Inhalt.

## 2. Vorbedingungen

- [ ] CI ist auf `main` für Ubuntu, macOS, Windows, Repository-Guards und Paket-Build grün.
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
- [ ] `privacy_status` zeigt auf macOS `parser_boundary: node_permission_process`;
      TXT/DOCX funktionieren ohne separat installierte Node-/Python-Laufzeit und
      visuelle oder mehrdeutige Fälle stoppen sicher.
- [ ] `privacy_status` zeigt auf Windows x64 `visual_boundary: windows_job_object`.
      Fehlender oder manipulierter Launcher startet weder OCR noch Rasterisierung
      direkt; Grafiken bleiben zurückgehalten.
- [ ] PDF erscheint ausschließlich unter `blocked_inputs` mit
      `PDF_COVERAGE_UNVERIFIED`, nicht unter den unterstützten Eingaben.
- [ ] Der Privacy-Ordner öffnet sich und enthält die vier erwarteten Bereiche.
- [ ] Der Standardordner liegt im lokalen App-Datenbereich. Ein expliziter OneDrive-,
      iCloud-, Dropbox- oder Netzwerkpfad meldet `blocked_unsafe_storage` und startet
      keine Verarbeitung.
- [ ] Ein absichtlich beschädigtes oder falsch versioniertes Artefakt wird nicht als
      einsatzbereit gemeldet.
- [ ] Erstinstallation startet aus dem festgelegten Artefakt ohne zusätzliche Runtime.
- [ ] Update auf eine höhere Testversion erhält Konfiguration und synthetische
      Aufbewahrungsmetadaten und meldet die neue Version.
- [ ] Rollback auf die vorherige Version startet und verarbeitet den synthetischen
      Kernfall ohne widersprüchliche Pakete.
- [ ] Erneutes Upgrade auf die Zielversion ist praktisch bestanden.

## 4. Fortsetzbarer Ein- und Mehrdateiablauf

Synthetischer Inhalt soll einen automatisch erkannten Namen/E-Mailkontakt und
fachlichen Text wie `Rolle: Lösungsarchitektin` enthalten. Eine zweite Datei soll
gezielt mit `AMBIGUITY_REVIEW_REQUIRED` stoppen.

- [ ] „Anonymisiere eine oder mehrere Dateien lokal“ nennt nur die vorhandene Anzahl
      und öffnet den lokalen `Input`-Ordner, keinen lang laufenden Dateidialog.
- [ ] Liegt bereits eine Datei im Eingang, verlangt Claude die Bestätigung, dass sie
      zum aktuellen Lauf gehört. Bei einer Abweichung zwischen genannter und erkannter
      Zahl beginnt keine Verarbeitung.
- [ ] Ohne ausdrücklichen Wunsch erscheint keine zusätzliche Frage zur Bildentfernung;
      Bilder in Bewerbungs-/Personalunterlagen bleiben standardmäßig lokal.
- [ ] Nach Bestätigung erzeugt `begin_document_batch` nur bei exakt 1 bis 25 Dateien
      ein Batch-Token; Namen und lokale Hashes erscheinen in keiner Toolantwort.
- [ ] Austausch, Hinzufügen oder Zeitstempeländerung nach der Bestätigung invalidiert
      den Stapel vollständig, auch wenn die Anzahl gleich bleibt.
- [ ] Pro MCP-Aufruf wird genau eine Datei verarbeitet; ein Stapel von mehreren
      Dokumenten läuft nicht als ein einziger langer Aufruf.
- [ ] Ein Stopp veröffentlicht für die betroffene Datei nichts und wird serverseitig
      im Batch markiert. Die übrigen Dateien werden genau einmal versucht, ohne einen
      vom Modell berechneten Überspringzähler.
- [ ] Claude zeigt weder Pfad, Dateiname, Originaltext noch interne Queue-Position.
- [ ] Der normale Input-Ablauf öffnet keinen Textreview- oder zweiten Dateidialog.
- [ ] Mehrdeutige Zertifikats-/Organisationsstellen werden nicht geraten, sondern
      stoppen nur die betroffene Datei.
- [ ] Rolle, Zertifizierungen und sonstiger fachlicher Inhalt bleiben im erfolgreichen
      synthetischen Fall unverändert.
- [ ] Das Residual-Gate prüft exakt die später freigegebene Markdown-Fassung.
- [ ] Claude nennt am Ende nur erfolgreiche und sicher gestoppte Dateien und verwendet
      ausschließlich Paket-IDs aus den Einzelaufrufen dieses Laufs.
- [ ] Eine erneute Verarbeitung einer gestoppten Datei beginnt erst nach einem neuen,
      ausdrücklichen Nutzerauftrag.
- [ ] Abbruch, MCP-Neustart oder geschlossenes stdin nach dem Claim stellt die Datei
      kollisionsfrei sichtbar wieder her; ein unsicher unterbrochener Batch-Eintrag
      wird nicht automatisch wiederholt.
- [ ] Der reale 25-Dateien-Test besteht mit Stopps an Position 1, 13 und 25 ohne
      doppelte Verarbeitung.

## 5. Formatgrenze des beaufsichtigten Piloten

Jeweils eine synthetische TXT- und DOCX-Datei als Positivfall verwenden. XLSX,
PPTX, MD, CSV, PNG, JPEG, BMP und PDF dienen als verpflichtende Stop-Gegenproben.

- [ ] TXT und vollständig abgedeckte DOCX erzeugen ein verifiziertes Privacy-Paket.
- [ ] Jede DOCX-Parserwarnung stoppt mit `PARSER_COVERAGE_UNVERIFIED`.
- [ ] Alle anderen Formate stoppen mit festem Coverage-Fehler und bleiben in `Input`.
- [ ] Jedes PDF stoppt mit `PDF_COVERAGE_UNVERIFIED`, stellt das Original wieder her
      und erzeugt weder Teil- noch Output-Paket.
- [ ] Eingebettete DOCX-Grafiken bleiben lokal; erkannter Bildtext passiert denselben
      Text-PII-Gate, aber Pixel werden nicht automatisch freigegeben.

## 6. Visuelle Sicherheitsgrenze

- [ ] Keine Rastergrafik wird im Pilot allein aufgrund eines OCR-Ergebnisses freigegeben.
- [ ] Unsichere/OCR-arme Grafiken erscheinen nur lokal unter
      `Needs Visual Review`.
- [ ] Bewerber- und Personalvisuals bleiben unabhängig vom Textreview lokal und für
      Claude unlesbar.
- [ ] Öffnen des Review-Ordners, eine Chatbehauptung oder ein MCP-Boolean kann ein
      zurückgehaltenes Bild nicht freigeben.
- [ ] Abgelaufene Preview bleibt gesperrt; erneute Verarbeitung ist erforderlich.

RC29 besitzt bewusst keinen visuellen Human-Presence-Freigabekanal. Ein Pilot darf
diese Einschränkung nicht als Fehler umgehen.

## 7. Ausgabe- und Manipulationsschutz

- [ ] Claude kann ausschließlich freigegebenes Markdown und freigegebene Assets lesen.
- [ ] Paket-ID ohne `read_capability`, Capability eines anderen Pakets, abgelaufene
      Capability und MCP-Neustart blockieren jeden Leseversuch.
- [ ] Historische Pakete sind im normalen Toolset nicht global auflistbar.
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
- [ ] Die getrennte Modellabnahme nach `SKILL_EVALUATION.md` ist für jedes im Pilot
      angebotene Claude-Modell bestanden.

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
