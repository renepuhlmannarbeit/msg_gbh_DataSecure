# Eindeutige Zustände und nächste Hauptaktion

Bezug: BL-010.53, Scheiben .1/.3/.5/.6/.7/.8; DS-110.
[Gesamtauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md),
[Vorlage](VORLAGE.md), [Backlog](../../docs/canonical/BACKLOG.md).

## Reproduktion und Ergebnis

RC160-r3 ergänzt die Anwenderprüfung: Nach bestätigtem Start bleibt die aktive
Laufseite sichtbar. Eine einzelne grüne Raw-Abschlusskarte steht vor dem
primären Ergebnisordnerbutton, geschlossenen weiteren Aktionen und Hinweisen.
Die laufgebundene Bereitstellungsmeldung wird nur nach passender bestätigter
Fertigstellung ohne offene Bereitstellung zurückgenommen. Der Raw-Editor
benötigt keine Pflichtfreigabe aller Konvertate; Kopierzustimmung folgt erst
im ausdrücklichen Speicherdialog. 69 Workspace- und echte Browsergegenproben
unter `dist/workflow-rc160-usability-`; native Abnahme bleibt gesondert.

`workspace.js/renderJob`: raw `results_available`, Ergebnisse vorhanden,
kein Fehler → „Ergebnisordner öffnen“ und „Markdown nachkorrigieren“ beide
primär. Anonymisierung besitzt denselben Konflikt. Höchstens eine nächste
Hauptaktion, weitere gültige Aktionen bleiben sichtbar sekundär.

## Zustandsregeln

| Belegter Zustand | Hauptaktion | Bedeutung |
|---|---|---|
| automatische Arbeit | Pausieren soweit zulässig | keine Freigabe |
| Fundstellen offen | Fundstellen prüfen | Gruppe noch nicht Dokumentfreigabe |
| technische Anonymisierung fertig | Dokumente nachprüfen | nicht bereits für KI exportiert |
| aktuelle ausgewählte Revisionen freigegeben | Exportvorschau | eigener bestätigter Kopierauftrag |
| Exportbestätigung offen | Export abgleichen | kein neuer Blindstart |
| raw Konvertierung fertig | Ergebnisordner öffnen | Originalinhalte, Nachkorrektur optional |
| raw fertig, OCR-aus-Auslassungen | Ergebnisordner öffnen, sofern Ergebnisse vorhanden | abgeschlossen mit Hinweisen, keine Pflichtfreigabe |
| konkrete Dateiprobleme | Probleme ansehen | Fehler nicht mit gesunden Ergebnissen verwechseln |

Die History-Priorisierung und echten Exportbelege wiederverwenden. „Fertig“
und „Verarbeitung abgeschlossen“ durch phasenbezogene Beschriftung ersetzen.
Alte Exporte sind historische Kopien, keine Freigabe heutiger Revisionen.

Bei überlappenden Zuständen gilt: unbestätigte Kopie/Verbindung zuerst abgleichen,
dann aktive Verarbeitung beziehungsweise angeforderte/bestätigte Pause, dann
erforderliche Fundstellenentscheidungen, anschließend Dokumentprüfung und Export.
Verfügbare Teilergebnisse beweisen nie einen ganzen Laufabschluss. Dateifehler
dürfen gesunde freigegebene Auswahlkopien nicht pauschal sperren. Bei ausschließlich
gestoppten Dateien ist die Fehlerklärung primär, kein Ergebnis-/Exportbutton.
Raw-Ergebnisse dürfen direkt geöffnet werden; optional nachkorrigierte Kopien
behalten ihren aktuellen Prüf-/Kopiervertrag, keine automatische Freigabe.
Beim reinen Markdown-Abschluss heißt die optionale Belegansicht
„Nachkorrekturen und Kopien“, nicht „Freigaben und Exporte“. Ihre Zähler sind
keine fehlenden ursprünglichen Ergebnisse. Offene Kopierbestätigungen bleiben
sichtbar. Gestoppte Dateien sind im abgeschlossenen Dateizähler bereits enthalten
und werden im Fortschritt nicht nochmals addiert.

## Abnahme

Aktuelle Karte und History für beide Zwecke mit 0/1/vielen Ergebnissen,
Teilfehlern und offenen Operationen: höchstens eine primäre Aktion. Klicks
dürfen keine automatische Freigabe, Auswahl, Exportkopie oder erneute Starts
auslösen. Neue Dokumentrevision widerruft Freigabe/aktuelle Exportabdeckung.
