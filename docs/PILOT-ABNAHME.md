# DataSecure Pilot-Abnahme

Version 3.2.0 RC30 · ausschließlich synthetische Daten

Diese Checkliste prüft den installierten End-to-End-Pfad und die Verständlichkeit.
Sie ersetzt weder Security Review noch Datenschutzfreigabe. RC30 bleibt bis zum
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
- [ ] „Nur Markdown“ oder „Bilder nicht an Claude geben“ lässt `remove_images=false`:
      Bildpixel bleiben lokal, sicher erkannter Bildtext durchläuft den normalen
      Text-Gate und der strenge lokale Verwerfmodus wird nicht unnötig aktiviert.
- [ ] Der strenge lokale Verwerfmodus wird nur bei dem ausdrücklichen Wunsch genutzt,
      lokale Bildanlagen selbst zu löschen; unbekannte Office-Objekte stoppen dabei sicher.
- [ ] Nach Bestätigung erzeugt `begin_document_batch` nur bei exakt 1 bis 100 TXT-/Markdown-/CSV-/DOCX-Dateien mit zusammen höchstens 500 MB
      ein Batch-Token; Namen und lokale Hashes erscheinen in keiner Toolantwort.
- [ ] Austausch, Hinzufügen oder Zeitstempeländerung im `Input`-Ordner nach der
      versiegelten Übernahme verändert den gestarteten Stapel nicht. Eine absichtlich
      veränderte **private Arbeitskopie** wird dagegen fail-closed gestoppt; sie darf
      niemals ein Ergebnis für die ursprüngliche Quelle erzeugen.
- [ ] `start_document_batch_processing` kehrt kurz zurück; der getrennte lokale
      Worker verarbeitet intern sequenziell und läuft weder als langer MCP-Aufruf
      noch als modellseitiger Aufruf pro Datei.
- [ ] `document_batch_status` enthält nur Zähler. `list_document_batch_results`
      liefert höchstens zehn namenfreie Ergebnisse pro Skillseite; Abbruch der
      Claude-Auswertung verändert den lokal abgeschlossenen Stapel nicht.
- [ ] Ein Stopp veröffentlicht für die betroffene Datei nichts und wird serverseitig
      im Batch markiert. Die übrigen Dateien werden genau einmal versucht, ohne einen
      vom Modell berechneten Überspringzähler.
- [ ] Claude zeigt weder Pfad, Dateiname, Originaltext noch interne Queue-Position.
- [ ] Der normale Input-Ablauf öffnet keinen Textreview pro Datei und keinen zweiten
      Dateidialog. Mehrdeutigkeiten werden erst nach der restlichen Analyse in genau
      einem ausdrücklich gestarteten lokalen Sammelreview behandelt.
- [ ] Mehrdeutige Zertifikats-/Organisationsstellen werden nicht geraten, sondern
      bleiben bis zu diesem lokalen Review gesperrt; technische Fortsetzung darf sie
      nicht freigeben.
- [ ] Rolle, Zertifizierungen und sonstiger fachlicher Inhalt bleiben im erfolgreichen
      synthetischen Fall unverändert.
- [ ] Das Residual-Gate prüft exakt die später freigegebene Markdown-Fassung.
- [ ] Claude nennt am Ende nur erfolgreiche und sicher gestoppte Dateien und verwendet
      ausschließlich Paket-IDs aus dem Batch-gebundenen paginierten Ergebnisplan.
- [ ] Eine erneute Verarbeitung einer gestoppten Datei beginnt erst nach einem neuen,
      ausdrücklichen Nutzerauftrag.
- [ ] Abbruch, MCP-Neustart oder geschlossenes stdin nach dem Claim stellt die Datei
      kollisionsfrei sichtbar wieder her; ein unsicher unterbrochener Batch-Eintrag
      wird nicht automatisch wiederholt.
- [ ] Der reale 100-Dateien-Test besteht mit Stopps an Position 1, 50 und 100 ohne
      doppelte Verarbeitung; 97 Freigaben erscheinen lückenlos in zehn Seiten.

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

RC30 besitzt bewusst keinen visuellen Human-Presence-Freigabekanal. Ein Pilot darf
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
