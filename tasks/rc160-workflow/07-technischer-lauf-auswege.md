# Aufgabe 7: Technisch unterbrochener Lauf – sichere Auswege

Verknüpft mit [BL-010.53.9](../../docs/canonical/BACKLOG.md) und
[RC160-Arbeitsauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md).
Status: teilweise belegt. Der Fristenschnitt wurde im unveröffentlichten
r21-Windows-Paket nativ gegen den früher unterbrochenen synthetischen
133-Dateien-Lauf geprüft; der sichtbare Ergebnisexport wurde wiederhergestellt.
Der Quellstand vom 15.10. ergänzt nun einen dauerhaften, plan- und laufgebundenen
Verzichtsbeleg für den unvollständigen sichtbaren Anonymisierungsexport. Auch
ein vor der ersten sichtbaren Exportplanung gescheiterter Lauf kann den Plan
unter derselben Sperre sicher anlegen und sofort aufgeben. Beide automatischen
Wiederholungspfade respektieren den Beleg; Verlauf und Bestätigungsdialog
zeigen keine falsche Fertigstellung. Der Verlauf meldet die tatsächlich
sichtbar kopierten und offenen Anzahlen, und „Bereitstellung erneut prüfen“
stößt den lokalen Verlaufsabgleich wirklich an. Gezielte synthetische Quelltests
bestanden (34/0), ebenso der Verifier und isolierte Paket-Sidecar-Smoke des
unveröffentlichten Windows-r28-ZIPs; Details und Hash in CURRENT_STATE.
Die letzte vollständige Standalone-Quellsuite bestand einschließlich 118/0
Rusttests, aber mit nativen Windows-Formfällen `NOT_RUN`. Eine native
Bedienprobe und Verbindungsausfall-/Teilkopie-Proben fehlen noch; der r27-
Bedienversuch konnte das Fenster technisch nicht binden. Die Aufgabe ist
deshalb **nicht abgeschlossen**.

r35-Quell- und Paketfortschritt: Ein gemeldeter Verbindungsabbruch oder
fehlgeschlagener Verlaufsabruf entfernt alte, sonst irreführend anklickbare
Laufaktionen. Die Anzeige bezeichnet den alten Fortschritt als unbestätigt;
die inhaltsfreie native Diagnose bleibt erreichbar. Ein frischer
erfolgreicher Abruf kann die Aktionen wiederherstellen, ohne Start oder
Freigabe automatisch zu wiederholen. Drei neue gezielte UI-Übergangstests
bestanden (83/0 gesamt), ebenso die vollständige Standalone-Suite
(118 Rusttests, sechs automatische native Windows-Formfälle `NOT_RUN`),
Paketverifier und isolierter r35-Paket-Sidecar-Smoke beider Wege. Das
unveröffentlichte r35-ZIP hat SHA-256
`c349afaaf231c5bed8495ca077a71bb0840634c2346df68849649275fc8b57a8`.
Die verpackte EXE verarbeitete in einem validierten isolierten Windows-Profil
eine ausschließlich synthetische MD-Datei: 1/1 privates anonymisiertes
Ergebnis, 0 technische Probleme, erwartete Platzhalter und erhaltene
Tabelle. Nach technischem Abschluss ohne Export wurde nur der eindeutig
zugehörige Test-Sidecar beendet. Der native Verbindungsfehler entfernte
Altaktionen und ließ die Diagnose erreichbar; nach automatischer
Wiederverbindung erschien genau derselbe gespeicherte Lauf einmalig im
Verlauf. Das ist eine begrenzte native Fehlerprobe, **kein** Beleg für den
ursprünglich festhängenden Prozess, Teilkopie, Wiederaufnahme oder
Verzicht. Die Aufgabe bleibt für diese Bedienfälle offen. Ein willkürliches
„Lauf beenden“ bei ungeklärtem Prozess-/Exportzustand bleibt unzulässig.

r36-Ergänzung: Eine vom Sidecar unabhängige, inhaltsfreie native Statusabfrage
nennt die Prozess-Abgleichphase. „Verbindung und Laufstatus prüfen“ liest diese
Phase und danach den gespeicherten Status erneut; sie startet und bestätigt
nichts. Diagnose und Wiederholen bleiben auch nach fehlgeschlagenem
Ersatzdienst-Start erreichbar. Ein Klick während eines laufenden Reads wird
erklärt. Gezielt 86/0 Workspacefälle, vollständige Standalone-Quellsuite
Exit 0 mit 120/0 Rusttests, Paketverifier und isolierter Paket-Sidecar-Smoke
beider Wege grün; r36-ZIP/SHA in CURRENT_STATE. Der native Windows-Start/IPC
aus dem Paket bestand im isolierten Profil. Interaktive r36-Bedienung sowie
dauerhafte Blockade/Teilkopie sind weiter offen. Die Anzeige allein ist kein
sicherer manueller Abbruch.

Zusätzliche synthetische Quellgegenproben wechseln nach dem gespeicherten
Verzicht den Ergebnisordner und stoppen einen Zwei-Dateien-Export nach genau
einer sichtbaren Teilkopie. Die vorhandenen Dateien bleiben bytegleich, der
neue Ordner leer und der Lauf unvollständig (35/0 gezielte Fälle). Die echten
nativen Bedienfälle sind dadurch nicht ersetzt. Ein r28-Launcher-Versuch
stoppte in der Test-Harness-Identitätsprüfung eines 264-Zeichen-Paketpfads;
der korrigierte No-Follow-Langpfadleser und die neun Cleanup-Vertragsgruppen
bestanden. Der erneute isolierte r28-Nativstart lud Haupt- und Prüfseite mit
erfolgreicher IPC und bereinigte sein Testprofil; eine Entscheidung im
Ausweg-Dialog oder ein Verbindungsausfall wurde dabei nicht bedient.

## Nutzerziel

Ein technischer Fehler darf keinen scheinbar endlos laufenden Stapel ohne
erkennbaren nächsten Schritt hinterlassen. Dateiverarbeitung, menschliche
Prüfung, sichtbare Ergebnisbereitstellung und KI-Export sind verschiedene
Zustände. `133 von 133` bezeichnet nur bearbeitete Quelldateien und darf
niemals allein „fertig“ bedeuten.

## Abgrenzung

1. Während einer unterbrochenen Verbindung: ehrliche Anzeige von letzter
   bestätigter Phase und Uhrzeit, „Verbindung/Status erneut prüfen“ sowie
   erreichbare inhaltsfreie Diagnose. Keine Start-, Freigabe- oder
   Exportaktion wird automatisch wiederholt.
2. Nach stabiler Verbindung und frischer, laufgebundener Zustandsprüfung:
   „Ergebnisexport fortsetzen“ nur bei `export_pending` und gültiger privater
   Evidenz; idempotente, gebundene Wiederaufnahme. Ein vorhandener vollständiger
   Export wird erkannt, nicht erneut erzeugt.
3. „Lauf ohne Export aufgeben“ ist eine andere, ausdrückliche Entscheidung.
   Der Dialog nennt Run-ID, Anzahl technisch verarbeiteter, ausgelassener und
   sichtbar exportierter Dateien sowie den Verbleib von Originalen, privaten
   Zwischenständen und Teilkopien. Bestätigung schreibt einen dauerhaften
   Verzichtsbeleg mit Zweck und Zeitpunkt; sie löscht nichts, erteilt keine
   Dokumentfreigabe und bezeichnet Teilkopien nicht als fertig. Ohne gesunde
   Verbindung oder bei nicht eindeutigem Beleg bleibt die Aktion gesperrt.
4. Nach Neustart zeigt der Verlauf denselben bestätigten Status. Ein zweites
   Fenster, Lost-ACK und Wiederholung dürfen weder Duplikate noch einen
   widersprüchlichen Terminalzustand erzeugen. Ein späterer neuer Lauf bleibt
   eine neue bewusste Auswahl; alte Prüfentscheidungen werden nicht übernommen.

## Sicherheitskritischer Schnitt für „ohne Export aufgeben“

Ein UI-Schalter allein reicht nicht: Sowohl der Verlaufsabruf als auch der
Sidecar-Neustart können einen unvollständigen sichtbaren Ergebnisexport
automatisch wiederholen. Deshalb ist die Aufgabe erst erfüllt, wenn ein
dauerhafter, inhaltsfreier Verzichtsbeleg **unter demselben Export-Claim** wie
die Veröffentlichung geschrieben wird und beide Wiederholungspfade ihn vor
jeder weiteren Dateikopie prüfen. Der Beleg bindet Run-ID und unveränderliche
Identität des konkreten Exportplans, erfasste Zähler, Entscheidung und Zeit;
er enthält weder Rohtext noch Kontaktwerte. Derselbe Beleg wird idempotent
erkannt, ein geänderter oder bereits abgeschlossener Plan und ein aktiver
Worker werden verweigert. Der Verlauf zeigt danach ausdrücklich „ohne
Export aufgegeben“ statt „fertig“; bestehende Teilkopien bleiben sichtbar,
aber nicht freigegeben. Kein anderer Lauf und kein Dokument-KI-Export wird
durch diesen Beleg geändert. Die bereits vorhandene Aktion zum Aufgeben
eines **Dokument-KI-Exports** ist hierfür keine Ersatzimplementierung.

## Gegenproben und Abnahme

- Langsamer Sidecar-Start vor dem ersten Statusabruf, langsamer Export,
  Verbindungsabbruch vor/nach privatem Journalabschluss und vor/nach sichtbarem
  Exportbeleg; jeweils Anzeige und erlaubte Aktionen prüfen.
- Verlorene Empfangsbestätigung, abgestürzter Prozess mit alter Sperre,
  unveränderter sowie veränderter Ergebnisordner, zwei Fenster und Neustart
  gegen dieselbe Run-ID testen. Nie Sperren blind entfernen.
- Reale lokale Windows-Bedienung mit synthetischen Quellen und geprüftem
  Paket: Während des Fehlers verständliche Diagnose; nach Wiederverbindung
  idempotentes Fortsetzen oder bewusstes Aufgeben. Dateiinhalte, Originale und
  historische Exportkopien bleiben unverändert.
- Markdown-only-Regressionssuite, Anonymisierungs-Prüf-/Freigabe-/Exportkette,
  Rust-/IPC-/Pakettests und Dokumentationsgate erneut ausführen. Mac-Bedienung
  nur mit echtem Zielhostbeleg behaupten.

## Nicht als Lösung zulässig

Ein roher „Lauf beenden“-Klick, der `processing` oder `export_pending` nur in
`complete` umetikettiert; stille Sperrdatei-Löschung, pauschale Freigabe,
erneutes Starten desselben 133er-Laufs oder Behauptung eines vorhandenen
Exportbelegs aus einem privaten Journalabschluss.
