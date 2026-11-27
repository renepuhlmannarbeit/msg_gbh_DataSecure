# Abgleich der 52 entfallenen Tests der früheren Oberfläche

Gehört zu [BEFUNDE.md](BEFUNDE.md), Abschnitt „R-019 und R-034 · Frühere
Oberfläche entfernt“, und zu den Befunden R-035 und R-036. Stand 25.11.2026,
Produktstand `1d908311`.

Mit der früheren Oberfläche (`app.js`, `index.html`) ist in `1d908311` ihre
Testdatei `tests/test-standalone-frontend.js` mit 52 Tests entfallen. Diese
Tabelle sagt für jeden dieser Tests, welches Verhalten er prüfte, ob die
geladene Oberfläche (`workspace.js` und ihre Begleitskripte) dieses Verhalten
hat und welcher Test es dort prüft.

## Wie abgeglichen wurde

Vier unabhängige Read-only-Durchgänge haben je 13 Tests bearbeitet: Fallfunktion
des alten Tests gelesen, das Verhalten in der geladenen Oberfläche gesucht, den
prüfenden Test gesucht. Als Test zählt nur, was das Verhalten ausführt oder
gezielt festhält; ein bloßes Wortvorkommen zählt nicht. Die fünf gemeldeten
Lücken und die fehlenden Fehlertexte habe ich danach selbst am Code
nachgeprüft; die übrigen Zeilen sind nicht ein zweites Mal gelesen. Zeilenangaben
gelten für den Stand `1d908311`. „workspace-Test“ meint
`tests/test-standalone-workspace.js`.

## Ergebnis

| Urteil | Anzahl |
| --- | --- |
| GEDECKT | 2 |
| TEILWEISE | 29 |
| UNGEPRÜFT | 9 |
| ENTFÄLLT | 7 |
| LÜCKE | 2 |
| LÜCKE, NICHT BELEGT | 1 |
| OHNE RÜCKMELDUNG | 1 |
| MÖGLICHER WETTLAUF | 1 |

- **GEDECKT:** Verhalten vorhanden und durch einen benannten Test geprüft.
- **TEILWEISE:** ein Teil ist geprüft; die letzte Spalte nennt den Rest.
- **UNGEPRÜFT:** Verhalten vorhanden, kein Test gefunden.
- **ENTFÄLLT:** Das Verhalten gibt es in der geladenen Oberfläche bewusst nicht
  mehr, weil ein anderes Bedienkonzept es ersetzt.
- **LÜCKE:** Das Verhalten fehlt der geladenen Oberfläche und wird fachlich
  weiter gebraucht; von mir am Code bestätigt (Nr. 9 und 49, siehe R-036 und
  R-035).
- **LÜCKE, NICHT BELEGT** (Nr. 6): Im Code ist zu sehen, dass die Prüfung bei
  abgelehnter Fortsetzung nicht öffnet und nur der allgemeine Satz erscheint.
  Ob der Core einen Prüfstart-Fehler in diesem Ablauf so liefert, ist nicht
  nachgestellt.
- **OHNE RÜCKMELDUNG** (Nr. 27): Nach erfolgreichem Öffnen eines Ordners oder
  einer Zuordnung meldet die geladene Oberfläche nichts; nur der Fehlerfall
  hat einen Text. Eine dokumentierte Anforderung dazu habe ich nicht gefunden.
- **MÖGLICHER WETTLAUF** (Nr. 43): aus dem Code abgeleitet, nicht nachgestellt.
  `clearFiles` leert die Auswahl nach der Antwort auf `cancel_admission`
  ohne zu prüfen, ob inzwischen ein Drop eine neue Auswahl gebracht hat.

**Nachtrag:** R-035 und R-036 sind in `d474a579` behoben. Die Zeilen 9 und 49 beschreiben
den Stand davor; dasselbe gilt für die Teile der Zeilen 7, 8, 28, 33, 34 und
48, die fehlende Namen, Texte oder Hinweise nennen. Die Tabelle selbst ist
nicht nachgezogen.

**Zweiter Nachtrag:** Seit `3b85e395` haben die neun als ungeprüft geführten
Verhalten (Zeilen 11, 14, 19, 20, 21, 22, 29, 32 und 40) einen eigenen Test an
der geladenen Oberfläche; Zeile 15 ist um die Zahl der Verlaufszeilen ergänzt.
Zeile 6 ist bestätigt und in `6e10ac80` behoben, Zeile 43 für das Produkt
widerlegt (die Hülle sperrt Leeren und Hineinziehen gegeneinander), Zeile 27
als Tatsache bestätigt und unverändert. Damit sind 11 Verhalten gedeckt und 29
nur zum Teil geprüft. Einzelheiten in BEFUNDE.md, „Nachprüfung · Geführte Prüfung, native Meldung, offene Punkte des Abgleichs“.

Die Tabelle beurteilt die Tests, nicht die Bedienbarkeit. Ob ein Verhalten im
Fenster wirklich so wirkt, zeigt nur ein nativer Lauf.

## Tabelle

| Nr. | Entfallener Test | Was er prüfte | Geladene Oberfläche | Test der geladenen Oberfläche | Urteil | Fehlender Teil oder Begründung |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | home is the default, mode must be explicit, and terminal updates never navigate | Start ohne vorbelegten Zweck; Start-Klick ohne Zweck startet nichts; Endzustand navigiert nicht; Abschluss-Quittung; „Neu“ führt zum leeren Zustand | workspace.js 748-757, 898-919, 1152-1163, 1011-1025 | workspace-Test 141, :4234, :4608 | TEILWEISE | Endzustands-Poll wechselt die Ansicht nicht; Start-Klick ohne Zweck löst keinen Start aus (nur aria-disabled geprüft) |
| 2 | a finished run requires an explicit clean transition before another task | Nach Abschluss ausdrücklicher sauberer Übergang; Auswahl und Zweck leer; Folgepoll bringt Vorlauf nicht zurück | workspace.js 921-927 (Auswahl wird beim Start verbraucht), 1011-1025 | workspace-Test 1692, :4674, :1085 | TEILWEISE | Zurücksetzen des Zwecks in newJob; Folgepoll |
| 3 | active local review explains a blocked global new-task click | Aktive lokale Prüfung: „Neu“ erklärt den aktiven Lauf und bricht die Aufnahme nicht ab | workspace.js 754, 1012, 1331 | workspace-Test 1702 | TEILWEISE | Zustand review_required zählt nicht als aktiv: kein Hinweis und kein Test, ob ein zweiter Start möglich ist |
| 4 | review actions stay with their exact run and history navigation does not resume it | Prüfaktion bleibt am Lauf; abgelehnte Fortsetzung öffnet keine Prüfung; Fortsetzen im Verlauf bindet die Lauf-ID | workspace.js 1026-1049, 1002-1010, 1316 | workspace-Test 1130, :1726, :1108-1128 | TEILWEISE | abgelehnte Fortsetzung (STANDALONE_BUSY) öffnet keine Prüfung; Doppelklick auf „Jetzt prüfen“ |
| 5 | a run with no results is visibly a failure rather than a green completion | Lauf ohne Ergebnis ist kein grüner Erfolg | workspace.js 10, 1263, 1324, 1686 | workspace-Test 2298, :3120, :4608 | GEDECKT | — |
| 6 | a proven review-start failure explains its cause and opens only its bound private file list | Nachgewiesener Prüfstart-Fehler: Ursache sichtbar, kein Wiederholversuch, private Dateiliste erreichbar | LOCAL_REVIEW_START_* nur in review.js:20-23, 36-60; workspace.js 1029-1032 öffnet die Prüfung bei abgelehnter Fortsetzung nicht, Allgemeinsatz mit Code | review-frontend-Test :807, :884-916 (nur bei schon geöffneter Prüfung) | LÜCKE, NICHT BELEGT | Ursache und Dateinamen erreichen den Anwender im Weg über Verlauf oder „Jetzt prüfen“ nicht; ob der Core den Fehler dort als abgelehnte Fortsetzung liefert, nicht belegt |
| 7 | local folder errors and stopped runs reveal affected file names without logging content | Ordnerfehler und gestoppte Läufe nennen betroffene Dateinamen | gestoppte Dateien: workspace.js 1072-1151; Namensliste bei Ordnerfehlern nicht vorhanden (workspace.js 550-552 verwirft details) | workspace-Test 3102, :2132 | TEILWEISE | Namensliste bei Aufnahmefehlern fehlt in der Oberfläche; Anzeige im laufenden Job und batchId-Bindung ungeprüft |
| 8 | admission lists every local rejection and system failures stay distinct from untouched documents | Aufnahme listet jede Ablehnung mit Namen und Grund; Systemfehler getrennt von nicht gestarteten Dateien | workspace.js 1145, 63, 307, 855-856; Namensliste bei SOURCE_SELECTION_REJECTED nicht vorhanden | workspace-Test 110, :1015, :1099; workflow-presentation-Test :166 | TEILWEISE | Namensliste bei Aufnahmefehlern fehlt; ausstehende Dateien und Trennung ungeprüft |
| 9 | single and mixed Office owner rejections retain their filename, correct reason and prepared selection | Office-Sperrdatei (~$…): Dateiname und Erklärung, Auswahl bleibt | kein Text für SOURCE_ARTIFACT_IGNORED/SOURCE_SELECTION_REJECTED in workspace.js 13-113; Name kommt nicht an | Core: test-standalone-sidecar.js:549-611 | LÜCKE | Name und Erklärung erreichen die Oberfläche nicht (Allgemeinsatz mit Code) |
| 10 | one real finding can exceed the UTF-8 draft size guard and is not reported as more than 5000 findings | Ein Fund kann die Textgrößengrenze überschreiten und wird nicht als „mehr als 5.000 Funde“ gemeldet | review.js:40-41; workspace.js 59 | review-frontend-Test :795; Core test-batch-review-model.js:28,78,91 | TEILWEISE | echter Größenfall mit einem Fund; Wortlaut der Fehlerliste |
| 11 | failed detail reads offer a local-only retry without restarting an all-stopped run | Fehlgeschlagenes Lesen der Dateidetails bietet lokales erneutes Laden, ohne den Lauf neu zu starten | workspace.js 1149-1150 | keiner gefunden | UNGEPRÜFT | Wiederholknopf, kein Neustart, kein Endlos-Wiederholen |
| 12 | each stopped file has its full extension, a fixed reason and an appropriate recovery step | Jede gestoppte Datei: voller Name, fester Grund, Fehlercode, passender nächster Schritt (11 Codes), kein Freitext aus dem Core | workspace.js 1093-1099, 13-113; workflow-presentation.js:297-319 | workflow-presentation-Test :166-188 (7 Codes); workspace-Test 3102 | TEILWEISE | Karte je Code; Ausblenden von Freitext; nächster Schritt für sechs Codes; kein Grundtext für SOURCE_SNAPSHOT_CHANGED |
| 13 | first start distinguishes a proposed result folder from a chosen one | Erststart unterscheidet vorgeschlagenen von gewähltem Ergebnisordner | nicht vorhanden (workspace.js 874-897, 2175-2190; workspace.html:86, 100: Zielordner wird angezeigt, Wahl in den Einstellungen) | keiner | ENTFÄLLT | Erststart-Anleitung gibt es nicht mehr; ob gewünscht, ist eine Produktentscheidung |
| 14 | tabs use manual activation and roving arrow, Home and End focus | Tastatur der Navigationsleiste: Pfeile, Pos1, Ende verschieben nur den Fokus; Aktivierung erst mit Enter/Leertaste; Fokuswechsel liest keinen Verlauf | workspace.js 2201-2213, workspace.html:17-21 | keiner gefunden | UNGEPRÜFT | Tastaturverhalten der Navigation ohne Test |
| 15 | history renders at most 5 rows and every action binds its exact batch ID | Höchstens 5 Verlaufszeilen; jede Aktion sendet die batchId ihrer Zeile, nie die „current“-Befehle | workspace.js 1622, 1864, 1870, 1871, 1004 | test-standalone-workspace.js 4800, :1140, :3093; Core: test-standalone-history.js:264,700 | TEILWEISE | 5er-Kappung im Renderer; batchId von open_history_results/ledger/identity_mapping; Ausschluss der open_current_*-Befehle |
| 16 | 93 one pending failed-file read survives an unchanged history availability refresh | Offene Dateilisten-Anfrage übersteht unveränderte Verlaufsaktualisierung; genau eine Anfrage | workspace.js 1610, 1969-1976, 1072-1075 (Auf-/Zuklappen statt gesperrtem Knopf) | test-standalone-workspace.js 2411 (synchron aufgelöst) | TEILWEISE | noch offene get_run_failures-Antwort während Aktualisierung; Mehrfachklick |
| 17 | 93 late failed-file success and rejection respect a still-active foreground picker | Späte Dateilisten-Antwort entsperrt den Knopf nicht, solange ein Picker offen ist | nicht vorhanden (kein Sperrzustand mehr, workspace.js 1072-1150, 1969-1976) | keiner | ENTFÄLLT | kein gesperrter Detail-Knopf mehr |
| 18 | 93 detail-read ownership is per batch and survives row removal and replacement | Detail-Lesen gehört je Lauf seinem Besitzer; überlebt Entfernen/Ersetzen der Zeile; alter Besitzer rendert nicht in Ersatzzeile | workspace.js 331, 1073-1075, 1616-1617 | test-standalone-workspace.js 2478 (nur Job-Karte) | TEILWEISE | Ersetzen/Entfernen einer Verlaufszeile, parallele Lesevorgänge zweier Läufe |
| 19 | 93 late failed-file responses cannot re-enable a closed legacy page | Späte Dateilisten-Antworten rendern nach Schließen der Seite nichts mehr; Timer geleert | workspace.js 2484 (beforeunload), 1075 | keiner gefunden | UNGEPRÜFT | Schließen, Verwerfen später Antworten, Timer |
| 20 | 94 legacy home, ARIA and caption agree with the actual five-run history | Text, ARIA-Label und Beschriftung nennen übereinstimmend die letzten 5 Läufe, nie 20 | workspace.js 1605, 1620 | keiner gefunden | UNGEPRÜFT | Texte ungeprüft |
| 21 | 89 compatibility shows safe partial legacy file details without claiming complete availability | Teilweise vorhandene Dateidetails als unvollständig gezeigt; ausstehende Dateien nicht als Dokumentfehler; unsichere Namen verworfen; ungültige Umschläge „nicht mehr verfügbar“ | workspace.js 1080, 1088, 1145-1150 | keiner gefunden (:3001, :3079 nur vollständige Listen) | UNGEPRÜFT | Teilliste, ausstehende Dateien, verworfene Namen, ungültige Umschläge |
| 22 | private identity mapping opens locally without a delete action | Identitätszuordnung öffnet lokal; keine Löschaktion | workspace.js 1866-1872 | keiner gefunden (:3427, :3438 betreffen open_identity_mappings_directory) | UNGEPRÜFT | Knopf in der Verlaufszeile, batchId, Fehlen einer Löschaktion |
| 23 | history preserves focus, ignores progress polls and rejects stale replies and actions | Verlauf: Fokus und Knoten bleiben bei Fortschritts-Polls; Umsortierung behält gebundene Aktion; veraltete Antwort/Aktion verworfen | workspace.js 1607-1610, 1573-1599, 1522-1537 | test-standalone-workspace.js 2411, :2751, :4800 | TEILWEISE | Knotenidentität bei Zähleränderung/Umsortierung; ältere Antwort ohne Verbindungswechsel; keine Verlaufslesung bei Fortschritts-Polls; Aktion aus ersetztem Stand |
| 24 | history requires a local-only envelope and explains disabled actions | Verlaufsumschlag muss local_ui_only:true und external_disclosure:false haben; nicht verfügbare Aktionen ohne Aufruf | workspace.js 1600, 1563-1572, 1857-1862, 1864, 1866 | test-standalone-workspace.js 2722, :4847 | TEILWEISE | ungültiger Umschlag für get_run_history; Auslassen der Aktionen bei Nichtverfügbarkeit (Konzept: weglassen statt deaktiviert erklären) |
| 25 | a native admission invalidates pending history and refreshes the selected panel safely | Nativer Drop macht offene Verlaufsantwort ungültig und behält das gewählte Panel | workspace.js 2525-2529 (angenommene Auswahl wechselt bewusst zu „Neu“) | test-standalone-workspace.js 2774, :4688 | ENTFÄLLT | Panelwechsel bewusst anders; offen: ob eine während des Drops offene Verlaufsantwort danach noch landet |
| 26 | a successful status poll clears an earlier IPC error atomically | Erfolgreicher Status-Poll nach IPC-Fehler räumt den Fehlerzustand atomar auf | workspace.js 2150-2157 | test-standalone-workspace.js 2650, :2663, :158 | TEILWEISE | Heilung beim automatischen Timer-Poll (Tests heilen nur über ausdrückliches Wiederholen) |
| 27 | result and ledger actions show a separate confirmed handoff | Öffnen von Ergebnisordner, Zuordnung und Zuordnungsordner zeigt je eine Rückmeldung „an das Betriebssystem übergeben“ | workspace.js 1823, 1864, 1870-1871, 2343 rufen nur perform; perform (672-681) meldet nur Fehler; handoff_confirmed wird dort nicht ausgewertet | workspace-Test 3090-3093, :1498-1503, :5111 (nur Aufruf und Fehlerfall) | OHNE RÜCKMELDUNG | keine Rückmeldung nach erfolgreichem Öffnen; kein Datenrisiko |
| 28 | native drops prepare without starting and preserve admission across races | Drop bereitet nur vor; Phasen der Drop-Zone; veralteter Poll überschreibt frische Auswahl nicht; Ursache bei fehlerhaftem Drop | workspace.js 2520-2537, 2561, 2484; kein Text für STANDALONE_DROP_MIXED | workspace-Test 2774, :5517, :3445, :5964 | TEILWEISE | Phase „angenommen“, Poll gegen frische Aufnahme, Listener-Abbau; eigener Text für gemischten Drop fehlt |
| 29 | a renderer reload restores a prepared selection and listener failure preserves picker fallback | Nach Neuladen wird eine vorhandene Aufnahme wiederhergestellt; schlägt der Drop-Listener fehl, bleibt der Picker | workspace.js 2575-2578, 2534, 2561 | keiner gefunden | UNGEPRÜFT | Wiederherstellung beim Start; fehlgeschlagener Drop-Listener |
| 30 | a poll timer consumed by a cancelled picker keeps polling alive | Ablaufender Poll-Timer während offenem Picker sendet keinen Befehl; danach läuft das Polling weiter | workspace.js 2038, 903-915 | workspace-Test 4173-4200 | TEILWEISE | Timer während offenem Picker |
| 31 | slow admission shows real elapsed progress and a hard timeout invalidates only its lost prepared selection | Langsame Aufnahme zeigt Fortschritt; Zeitüberschreitung macht nur die verlorene Vorbereitung ungültig | workspace.js 2535-2537 (fester Text, keine Sekunden), 102, 2038, 908-915 | workspace-Test 2520, :2761 | TEILWEISE | Fortschrittshinweis, Text und Folgen der Zeitüberschreitung; bewusst kein Sekundenzähler mehr |
| 32 | an oversized nested folder explains the limit until a valid selection replaces it | Zu großer Ordner erklärt die Grenze; Poll löscht die Ablehnung nicht; gültige Auswahl ersetzt sie | workspace.js 53, 553-575, 917-918 (ohne die Zahl 64 MiB) | keiner gefunden | UNGEPRÜFT | Ablehnungsgrund, Beständigkeit, Ersatz |
| 33 | a prepared selection supports per-file removal and clearing before Start | Einzelnes Entfernen und Leeren der Auswahl; Hinweis auf übersprungene Begleitdatei | Einzelentfernen durch Häkchen ersetzt (workspace.js 826-860); Leeren :920; Hinweis auf übersprungene Begleitdateien fehlt (Core application-service.js:1164-1165) | workspace-Test 1066-1080, :986-992 | TEILWEISE | Hinweis auf übersprungene Begleitdateien nicht vorhanden; cancel_admission-Aufruf nicht ausdrücklich geprüft |
| 34 | an existing selection accepts later files and folders without losing it on errors | Weitere Dateien erweitern die Auswahl; fehlgeschlagenes Hinzufügen ersetzt sie nicht; Hinweis „nicht doppelt hinzugefügt“ | workspace.js 2233-2236, 890-893, 908-916 | workspace-Test 986-992, :1066-1075, :4173-4200, :141-148 | TEILWEISE | fehlgeschlagenes Hinzufügen mit Fehlercode; Hinweis auf bereits enthaltene Dateien fehlt |
| 35 | file and folder addition stays discoverable above long prepared lists | Hinzufügen bleibt über langen Listen auffindbar (Reihenfolge im HTML) | anders gelöst: workspace.html:69-82, begrenzter scrollender Baum, Gruppen ab 12 Dateien eingeklappt (workspace.js 823) | keiner | ENTFÄLLT | anderes Layoutkonzept; Auffindbarkeit nur an der echten Oberfläche beurteilbar |
| 36 | an unconfirmed slow start is observed until completion without restarting the batch | Unbestätigter Start wird bis zum Ende beobachtet, nie erneut gestartet | workspace.js 949-956, 1185 | workspace-Test 2492, :4769, :2512, :4936 | TEILWEISE | durchgängige Beobachtung bis zum Abschluss in einem Ablauf |
| 37 | an unconfirmed start of a restored admission starts status recovery | Wiederhergestellte Aufnahme und unbestätigter Start: Statuswiederherstellung | workspace.js 2575-2578, 949-956 | workspace-Test 2492, :4769 (nur frische Aufnahme) | TEILWEISE | Kombination mit wiederhergestellter Aufnahme |
| 38 | fast consecutive terminal runs refresh their exact result folder without repeated idle export reads | Schnell aufeinanderfolgende Endzustände lösen den Ergebnisordner des richtigen Laufs auf | entfällt: Öffnen ist an die Lauf-ID gebunden (workspace.js 1823, 1864); presentation_generation 1153-1162 | workspace-Test 4909-4916, :1692 (indirekt) | ENTFÄLLT | durch laufgebundene Aktionen ersetzt (DS-086) |
| 39 | a completed result remains available while the next selection is prepared | Ergebnisaktion des fertigen Laufs bleibt aktiv, während die nächste Auswahl vorbereitet wird | workspace.js 1011-1025, 1823, 928-961 | workspace-Test 1679, :1692, :4173 | TEILWEISE | Ergebnis-Öffnen des fertigen Laufs nach Vorbereitung der nächsten Auswahl |
| 40 | a stale poll cannot overwrite a new run after selection and Start both completed | Statusantwort, die vor Auswahl und Start angefordert wurde und danach eintrifft, überschreibt den neuen Lauf nicht | workspace.js 676, 2054-2060 (generation, currentRead) | keiner gefunden (:5428 betrifft Ready-Ereignis) | UNGEPRÜFT | Generationsschutz über Auswahl und Start ungeprüft |
| 41 | a delayed terminal context cannot overwrite a newly prepared selection | Verzögerter Terminal-Kontext überschreibt neu vorbereitete Auswahl nicht | workspace.js 2067 (Poll liest nur get_public_state; get_ui_context nur über perform) | :5461 betrifft Verbindungsepoche | ENTFÄLLT | kein periodisch nachgeladener Kontext mehr |
| 42 | a delayed terminal context remains stale after the new selection was already started | wie 41, nach bereits gestarteter neuer Auswahl | wie 41; workspace.js 921 | wie 41 | ENTFÄLLT | wie 41 |
| 43 | late cancellation context preserves a freshly dropped selection | Späte Antwort auf cancel_admission setzt eine inzwischen per Drop aufgenommene Auswahl nicht zurück | workspace.js 920 clearFiles leert nach await ohne Prüfung; Drop-Handler 2525-2529 | keiner gefunden (:1074 ohne Drop dazwischen) | MÖGLICHER WETTLAUF | aus dem Code abgeleitet, nicht reproduziert; ob die Hülle einen Drop während eines laufenden Befehls zulässt, ungeprüft |
| 44 | a failed pure conversion never offers a mapping even if stale state claims one | Fehlgeschlagene reine Umwandlung bietet nie die Zuordnungsdatei an, auch bei veraltetem Zustand | workspace.js 1866-1871 (nur bei entry.ledger_available) | test-standalone.js:925 (Quelltext), workspace-Test 1597; Core test-standalone-history.js:554 | TEILWEISE | Oberfläche mit markdown-only und fälschlich gemeldetem ledger_available:true |
| 45 | completion metadata debt is visible without claiming zero missing documents or no results | Ausstehender Abschlussnachweis behauptet weder „0 anonymisierte“ noch „keine Ergebnisse“ | workspace.js 1283, 192, 548, 1512; workflow-presentation.js:36, 72 | workspace-Test 4608, :4641, :3157 | TEILWEISE | Kombination export_pending, 0 Ergebnisse, completion_pending im Live-Lauf und Wechsel auf den Abschlusstitel |
| 46 | explicit Start sends one immutable camelCase processing mode and locks it before checkpoint | Start sendet genau einen unveränderlichen Modus und sperrt ihn; nur ein Start-Aufruf | workspace.js 928-942, 650, 741 | workspace-Test 141, :767, :782, :4710 | TEILWEISE | Sperre der Moduswahl während des ausstehenden Starts; spätere Änderung schadet dem gesendeten Aufruf nicht (nur durch Bauweise) |
| 47 | anonymization offers one explicit filename choice with neutral privacy-preserving default | Anonymisierung: ausdrückliche Dateinamenwahl, Standard neutral, Hilfetexte, Weitergabehinweis | workspace.js 768-776, 938, 1658 | workspace-Test 782, :800, :856 | TEILWEISE | Wortlaut der Hilfen; „Reine Markdown-Konvertierung anonymisiert keine Inhalte“ im geladenen Fenster nicht gefunden |
| 48 | unavailable conversion keeps the admission without a silent anonymization fallback | MARKDOWN_CONVERSION_NOT_READY: Auswahl bleibt, kein Fallback auf Anonymisierung, kein zweiter Start, klarer Hinweis | workspace.js 942-957; Code nicht abgebildet, Allgemeintext mit Code (553-572) | workspace-Test 254-266 (andere Codes) | TEILWEISE | Auswahl und Modus bleiben nach abgelehntem Start; eigener Text für den Code fehlt |
| 49 | a configured network result folder produces a visible local warning | Netzwerk-Ergebnisordner zeigt sichtbaren lokalen Hinweis | nicht vorhanden: workspace.js 2175-2190 liest network_folder_notice nicht (Core: application-service.js:1557) | keiner | LÜCKE | DS-080 / BL-002 / BL-040.5 verlangen den Hinweis in Standalone (TRACEABILITY, CURRENT_STATE) |
| 50 | only active work blocks admission while historical recovery remains optional | Nur aktive Arbeit sperrt neue Aufnahme; historische Zustände lassen sie frei | workspace.js 740-741 | workspace-Test 1702, :1692, :4710 | TEILWEISE | review_required und export_pending erlauben Aufnahme; blocked und preparing sperren; fremder RPC entsperrt nicht |
| 51 | pure conversion stays selected during intake and reports raw results and OCR warnings honestly | Reine Umwandlung: Modus bleibt; kein outputNamingMode/ocrContactReview; Text „nicht anonymisiert“; Anzeige bei unbestätigter Beendigung | workspace.js 938-939, 1279; workflow-presentation.js:30-40; termination_unconfirmed nur als Schutzbedingung (193) | workspace-Test 767, :856, :4710, :3077 | TEILWEISE | Anzeige bei unbestätigter Beendigung im Frontend nicht vorhanden |
| 52 | optional OCR contact correction starts only with explicit Markdown opt-in, never an anonymization flag | OCR-Kontaktkorrektur nur mit ausdrücklichem Opt-in im Markdown-Modus, nie vorbelegt | workspace.js 939, 764, 1017-1018 | workspace-Test 721, :882, :869, :4710 | GEDECKT | — |
