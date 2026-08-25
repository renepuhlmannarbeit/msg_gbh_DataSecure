# DataSecure Pilot-Abnahme

Version 3.2.0 RC39 · ausschließlich synthetische Daten

Diese Checkliste prüft den installierten End-to-End-Pfad und die Verständlichkeit.
Sie ersetzt weder Security Review noch Datenschutzfreigabe. RC39 bleibt bis zum
vollständigen Go/No-Go ein Engineering-Build.

Die wiederverwendbaren, vollständig synthetischen Testdokumente, der gruppierte
Schritt-für-Schritt-Ablauf und die inhaltsfreie Evidence-Vorlage stehen im
[`acceptance/RC30_HUMAN_TEST_KIT`](acceptance/RC30_HUMAN_TEST_KIT/README.md).
Die dortigen Test-IDs sind diesem Handbuch zugeordnet; der Testkit ersetzt keine
hier verlangte Rolle oder Freigabe.

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
TXT/Markdown/CSV/DOCX funktionieren ohne separat installierte Node-/Python-Laufzeit und
      visuelle oder mehrdeutige Fälle stoppen sicher.
- [ ] `privacy_status` zeigt auf Windows x64 `visual_boundary: windows_job_object`.
      Fehlender oder manipulierter Launcher startet weder OCR noch Rasterisierung
      direkt; Grafiken bleiben zurückgehalten.
- [ ] PDF erscheint ausschließlich unter `blocked_inputs` mit
      `PDF_COVERAGE_UNVERIFIED`, nicht unter den unterstützten Eingaben.
- [ ] Der Privacy-Ordner öffnet sich und enthält die fünf erwarteten Bereiche
      `Input`, `Output`, `Needs Visual Review`, `Processed` und `DataSecure-Export`.
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

## 3a. Host-Gate und negative Oberflächen

Jeden Fall in einer neuen Unterhaltung mit einem ausschließlich synthetischen
Original prüfen. Ein sichtbarer Skill oder Plugin-Eintrag zählt nicht als
Verbindungsnachweis.

- [ ] Cowork Desktop mit aktivem Local MCP darf den Originalpfad erst nach einem in
      derselben Sitzung erfolgreichen `privacy_status` öffnen.
- [ ] Cowork Desktop mit getrenntem oder nicht erlaubtem Local MCP stoppt einmalig
      vor Datei-/Ordnerzugriff und empfiehlt nur neue lokale Sitzung oder IT-Prüfung.
- [ ] Claude Web stoppt trotz sichtbarem Skill, Originalanhang, Pfadangabe und Wunsch
      nach anderem Connector; weder Upload noch Originalinhalt werden verarbeitet.
- [ ] Claude Mobile versucht weder rechnerübergreifenden Ordnerzugriff noch
      Computer-Use und behauptet keine lokale Verbindung.
- [ ] Eine Cloud-/Scheduled-Sitzung plant oder startet keine Verarbeitung lokaler
      Originale und verwendet keinen allgemeinen Filesystem- oder anderen Connector.
- [ ] Bereits **vorher lokal bereinigtes** synthetisches Markdown lässt sich in allen
      Negativklassen normal weiterverarbeiten, ohne einen neuen DataSecure-Lauf zu
      behaupten.
- [ ] Nach fehlgeschlagenem Host-Gate entsteht keine Wiederholschleife und kein
      Ersatzdialog. Die Nachweise enthalten nur Hostklasse, Claude-Version,
      `PASS/FAIL/BLOCKED` und nicht sensitiven Fehlercode.

## 4. Fortsetzbarer Ein- und Mehrdateiablauf

Der **Normalweg** hat nur drei bewusste Handlungen: neue Cowork-Unterhaltung öffnen,
„Dateien anonymisieren“ schreiben und im nativen Mehrfachdialog einmal **Öffnen**
wählen. Quellen werden nie per Büroklammer in den Chat hochgeladen.

- [ ] Der direkte Mehrfach-Dateidialog akzeptiert 1 bis 100 TXT-, Markdown-, CSV-
      oder DOCX-Dateien mit zusammen höchstens 500 MiB und weist Überschreitungen
      der Einzelgrenzen (TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes, DOCX
      64 MiB komprimiert/128 MiB entpackt) vor dem Hintergrundlauf ab. Es gibt keine
      feste Seitenbegrenzung und keine vorgelagerte Profil-, Bild-, Start- oder
      Einzeldatei-Abfrage.
- [ ] Nach der Auswahl startet genau ein lokaler, fortsetzbarer Batch. Der Normalweg
      zeigt keinen zweiten Dateidialog, keinen Textreview und keine Ergebnislese-
      Bestätigung. Hostseitige Cowork-Toolberechtigungen werden als Host-Evidenz
      gezählt, nicht als DataSecure-Dialog bewertet.
- [ ] Bilder bleiben standardmäßig lokal. Der Wunsch „Bilder entfernen“ aktiviert
      ausschließlich den strengen lokalen Löschpfad; unsichere Office-Objekte stoppen
      sicher. Bildpixel werden nie über Claude freigegeben.
- [ ] Claude zeigt niemals Pfad, Dateiname, Originaltext, Hash, Token oder interne
      Queue-Position. Die dauerhafte lokale Zuordnung liegt nur in
      `DataSecure-Mapping.csv` im Exportbereich.
- [ ] Rolle, Zertifizierungen und fachlicher Inhalt bleiben im erfolgreichen
      synthetischen Fall erhalten. Mehrdeutige Zertifikats-/Organisationsstellen
      werden nicht geraten, sondern sicher gestoppt oder lokal geprüft.
- [ ] Ein sicherer Stopp veröffentlicht kein Teilpaket. Abbruch oder Cowork-Neustart
      erzeugen weder Ersatzpicker noch Doppelverarbeitung; eine Fortsetzung ist
      ausschließlich nach ausdrücklichem Auftrag zulässig.
- [ ] Der reale 100-Dateien-Test prüft Start, Abbruch und Wiederaufnahme bei
      ungefähr Position 1, 50 und 100. Bereits terminale Positionen erscheinen
      weder doppelt noch erneut im Mapping.

## 5. Formatgrenze des beaufsichtigten Piloten

Jeweils eine synthetische TXT-, Markdown-, CSV- und DOCX-Datei als Positivfall
verwenden. XLSX, PPTX, eigenständige PNG/JPEG/BMP und PDF dienen als verpflichtende
Stop-Gegenproben.

- [ ] TXT, Markdown, CSV und vollständig abgedeckte DOCX erzeugen ein verifiziertes
      Privacy-Paket; Markdown-Referenzen bleiben inert und CSV-Zellen werden nicht
      ausgeführt.
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

RC39 besitzt bewusst keinen visuellen Human-Presence-Freigabekanal. Ein Pilot darf
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
- Artefakte versioniert, mit SBOM und dokumentierter Prüfsumme abgelegt sind;
- menschliche Usability-Abnahme bestanden ist;
- Datenschutz und IT-Security den konkreten Zweck und Pilotumfang freigegeben haben.

Jedes `FAIL` bei Rohdatenzugriff, Coverage, Residual-Gate, Visual-Gate, Manipulations-
oder Löschgrenzen bedeutet **No-Go**. `BLOCKED` ist kein `PASS`.
