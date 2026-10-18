# R6-Anwenderbefunde: nächster lokaler Entwicklungsstand

Datum: 18.10.2026. Der Nutzer bedient seine bestehende RC163-R6-App selbst.
Das ZIP f56963aa… / Quellenfreeze 244d86f4… bleibt unverändert. Die folgenden
Änderungen sind Folgeentwicklung und kein nachträglicher PASS dieses Pakets.
Keine Desktopbedienung, Löschung von Nutzerdaten, Veröffentlichung oder Runner.

## Plan und Abnahmegrenzen

| ID | Befund / gewünschter Vertrag | Implementierung und erforderliche Gegenprobe |
| --- | --- | --- |
| UAT-UX-01 | Fundstellenprüfung zu schmal/niedrig, mehrere Scrollflächen | Vollbreiter Reviewmodus; durchgängige Flex-Höhenkette über details-view; ein vertikaler Scrollbesitzer im eingebetteten Dokument statt Tabelle/Detail/pre. Tatsächliche Workspace-iframe-Verschachtelung bei 1920×1080 bis 683×384 und 390×700 testen; Tastaturfokus und Reflow. |
| UAT-UX-02 | Dokumentfreigabe endet ohne prominente Bestätigung | Karte direkt oben auf Dokumentseite: Verarbeitung abgeschlossen / Dokumentprüfung offen / verfügbare Dokumente freigegeben / bestätigter Export getrennt. Aktuelle Vollfreigabe nur bei frischem, vollständig verarbeiteten Stand ohne Busy/Entwurf/offenem Export. Hinweise schließen einen technischen Laufabschluss nicht aus. |
| UAT-UX-03 | Exportdialog schließt mit unerwartetem Seitenwechsel | ACK bleibt exakt gebunden; Dialogschließen behält Dokumentseite und fokussiert Abschlussaktion. Zum Verlauf und Laufdetails sind ausdrücklich verschiedene, reine Navigationsaktionen. Kein zusätzlicher Export. |
| UAT-UX-04 | Abschlussstatus steht im Verlauf erst unter Metadaten | Status zuerst im DOM und visuell; danach Aufgabentyp/Datum, Zähler, ID und Aktionen. Explizite stateLabel-Referenz statt positionsabhängigem children[2]. Nachgeladene Freigabe darf Titel/Zähler nicht überschreiben. |
| UAT-UX-05 | Konsumierte Dateiauswahl erscheint unter Neue Verarbeitung weiter | Nach bestätigtem Start Baum neu rendern, Gruppen/Erweiterung zurücksetzen, laufgebundenen Snapshot erhalten. Kein Cancel als Nebenwirkung der Navigation. Ungestarteter neuer Entwurf bleibt erhalten; alte Admissionrevision wird nicht erneut übernommen. |
| UAT-HIST-01 | Abgeschlossene Läufe dauerhaft nur aus der App entfernen | Separate Anzeigepräferenz, keine Entfernung von Journalen, Zusammenfassungen, Zuordnungen, Ergebnissen oder Exporten. Backendfilter vor Detaillesungen und vor 20er-Limit; ausdrückliches Wiederanzeigen. Offene/aktive Vorgänge bleiben sichtbar und geschützt. |
| UAT-HIST-02 | Externe Löschung soll übrigen Verlauf nicht zerstören | Fehlende Metadaten nicht zu Aktionen machen, fehlende sichtbare Ausgabe getrennt von privaten Prüfständen darstellen. Nur read-only Listenprojektion darf bei verlorener Inventarbeweisbarkeit degradiert antworten; Resolver/Mutationen bleiben fail-closed. Kein automatisches Neuerzeugen. |
| UAT-PERF-01 | Historische Prüfungen belasten Start, Status und Ordnerwahl | UI-Historie von aktiver Recovery/Retention trennen. Versteckte terminale Läufe früh aus Anzeigelesern ausschließen; Kontext/Ordnerwahl nicht als Anlass einer globalen Detailprojektion verwenden. Tatsächliche Reads messen. |
| UAT-PKG-01 | Explorer-Entpacken überschreitet MAX_PATH | Das unveränderte ZIP benötigt im bisherigen langen Standardziel bis278 Zeichen; kurzer Nutzerpfad DS-R6 benötigt185. Kürzeres Layout/Entpackhinweis und Zielpfadlängen-Gate für den nächsten Kandidaten prüfen. Kein Registry-/Schutzrichtlinienwechsel. |

## Fachliche Zustände

- Verarbeitung beendet bedeutet: keine weiteren Dateien dieses Laufs werden verarbeitet.
  Erwartete OCR-Auslassungen, Datenschutzstopps und Dateifehler bleiben getrennte Hinweise.
- Dokumentprüfung abgeschlossen bedeutet nur: alle **verfügbaren aktuellen** Dokumentstände
  sind freigegeben. Es ist kein Beleg, dass jede Quelle verarbeitet oder exportiert wurde.
- Export abgeschlossen folgt nur aus dem bestehenden kopier- und revisionsgebundenen
  Empfangs-ACK. Ein später unklarer Dokumentstatus löscht diesen historischen Fakt nicht,
  bestätigt aber auch keine heutige Freigabe.
- Ausblenden ist eine Anzeigepräferenz, niemals Beweis für Terminalität, Nichtaktivität,
  eine Freigabe oder die Zulässigkeit von Retention/Löschung.

## Performance: bestätigte Architekturgrenze

Ein Filter erst hinter collect() wäre nicht ausreichend: initializeProduct()/
captureDurableHistory() und productStatusSnapshot() lesen weiterhin historische
Journale bzw. Exportinventare. Der Produktions-UI-Kontext ruft jetzt weder einen
historischen Status noch eine historische Ergebnisauflösung auf. configureResults()
erhält nur bestehende Exportbindungen und stößt die bisherige kontrollierte
Pending-Export-Nachholung an; es projiziert keine vollständige Verlaufsliste und
schreibt keine Journal-Snapshots als Zusammenfassungen zurück. Für einen vollständigen
Verzicht auf solche Startlesungen ist ein eigenständig abgesicherter terminaler
Checkpoint nötig. hidden=true allein darf aktive Locks, Mapping-Outbox, Pending-
Exporte, Retention-Schutz oder Recovery nicht umgehen. Diese weitergehende Grenze
bleibt offen, bis Produktionspfad, Gegenfälle und echte Zugriffsmessung vorliegen.

## Review und Quellen

Zwei begrenzte, unabhängige KI-Quellenreviews haben Layout-/Abschlusszustände und
anschließend historische Ladepfade sowie den konsumierten Dateikatalog geprüft.
Das sind keine zertifizierten Fachpersonen und keine native Windows-/Mac-Abnahme.

- [W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html):
  kleine/zoomte Ansichten dürfen keinen Bedieninhalt verlieren; feste Elemente
  können Arbeitsfläche und Fokus verdecken. Daraus folgt hier der Verzicht auf
  konkurrierende Sticky-Werkzeuge im kleinen eingebetteten Arbeitsbereich.
- [Microsoft: maximale Pfadlänge](https://learn.microsoft.com/windows/win32/fileio/maximum-file-path-limitation):
  die Explorer-Entpackgegenprobe muss einen realistischen Gesamtzielpfad prüfen,
  nicht lediglich den ZIP-internen relativen Namen.

## Nachweise

Stabiler Produktstand der gezielten Abschlussprüfung:
8c5e535be7bdb1412bdcd60e3b1bf202c1f38e4f2d284abd06b419c1feb2f010
(326 Produktinputs). Nachfolgend erneut unverändert ermittelt. Verifikationsmanifest
von 15 Test-/Preview-Dateien:
1df7b80351ea4994f72b570c15ffdb9b4639c2e514375744c8e73f339e2611e2.
Maschinenlesbarer Ergebnisbeleg: dist/rc163-r6-uat-followup-20261018/RESULT.json.

| Gezielte Prüfung | Ergebnis |
| --- | --- |
| Workspace / tatsächliche JS-Übergänge | 333 bestanden, 0 fehlgeschlagen |
| Dokumentreview-Renderer | 98 bestanden, 0 fehlgeschlagen |
| Desktopvertrag / Standalone-Service | 36 / 72 bestanden, 0 fehlgeschlagen |
| Review-Frontend / Statusprojektion | 50 / 46 bestanden, 0 fehlgeschlagen |
| Historie / gezielte Historie / dauerhafte Ausblendung | Alle drei Testdateien bestanden; 128 fremde Läufe bei gezielten Aktionen ohne Fremd-/Globalzugriff; frühes Ausfiltern vor 20er-Fenster und Wiederanzeigen in frischem Prozess |
| Aktuelle Dokumentation / Testpfadtrennung | 29 / 15 bestanden, 0 fehlgeschlagen |
| Rust Windows: cargo clippy --offline --all-targets -- -D warnings | Bestanden |
| Rust Windows: cargo test --offline | 211 bestanden, 0 fehlgeschlagen, 3 ausdrücklich ignoriert |
| Headless-Workspace-Browser | Bestanden: echte Assets mit synthetischem IPC, verschachtelter Review-iframe, 390 bis 1920 px, Fokus/Reflow/axe; dist/workflow-usability-design-wM4YB2 |
| Headless-Review-Browser | Bestanden: Staging/Apply/Undo/Privacy/Fokus/Reflow/axe; dist/engineering-review-bulk-browser-TD8mFQ |

Zwei P2-Gegenbefunde aus dem letzten unabhängigen Quellengegenreview wurden
zusätzlich korrigiert: interaktive Ordnerwahl darf keine alte Laufzusammenfassung
über eine neuere Worker-Veröffentlichung schreiben; unbekannte Exportverfügbarkeit
ist keine erfundene offene Aufgabe. Unabhängig bewiesene aktive/wiederaufnehmbare
Arbeit bleibt gezählt. Erneutes begrenztes Quellenreview meldet dazu keine neue
P1-/P2-Regression. Tests prüfen sowohl 0 unbekannte offene Aufgaben als auch eine
weiterhin gezählte tatsächliche aktive Aufgabe. Gezielte Resolver und Recovery
übernehmen keine Berechtigung aus dem degradierten Listenstatus.

Ein roter Browser-Zwischenlauf deckte eine unvollständige synthetische Event-
Bridge auf: Das separate Prüffenster muss vor privaten Reads einen Connection-
Listener registrieren können. Nur die Preview-Bridge wurde ergänzt, nicht die
Produktionsgrenze gelockert. Ein weiterer roter Zwischenlauf verlangte noch das
alte Sticky-Layout; die Gegenprobe prüft jetzt ausdrücklich den beschlossenen
einzelnen Scrollbesitzer und sichtbaren Tastaturfokus ohne überlagerte Aktionen.
Browserbelege werden nun in frischen Verzeichnissen statt einem festen alten
Screenshotziel abgelegt.

Der vom Nutzer gemeldete alte Dateibaum war ein tatsächlicher Renderfehler:
Nach bestätigtem Start wurden die Arrays geleert, aber der Baum nicht neu
gerendert. consumeAdmission() leert nun auch die DOM-Auswahl und schützt gegen
verzögerten Kontext derselben konsumierten Revision. Ein neuer ungestarteter
Entwurf bleibt beim reinen Reiterwechsel erhalten. Ein unbestätigter Start wird
nicht durch ein ungebundenes cancel_admission ergänzt oder erneut gestartet.

## Verbleibende Grenzen

- Keine neue Vollsuite oder neues Windows-ZIP für diesen Folgequellstand;
  frühere grüne R6-Vollsuiten gelten nicht automatisch. Das bisherige R6-ZIP
  bleibt unverändert und zeigt diese Korrekturen noch nicht.
- Kein vollständiger Verzicht auf historische Start-/Statuslesungen. Versteckte
  Läufe benötigen weiterhin begrenzte Hash-/Terminalitätsreads ihrer privaten
  Metadaten; keine Behauptung eines gemessenen kompletten Kaltstartgewinns.
- Export-only-Alteinträge ohne echten Batchanker bieten das Ausblenden bewusst
  nicht an. Ebenso keine neue Öffnungs-/Reparaturbefugnis bei verlorenen privaten
  Exportmetadaten; dort kann auch die Ausblendaktion sicher abgelehnt werden.
- Kürzeres Windows-Paketlayout gegen Explorer-Pfadlängen und erneute Paketgates
  noch offen. Echte native Mac-/M2-Gates erfolgen später.
- Laufende Anwendertests/Ergebnisse, alte Belege und eingefrorene Pakete wurden
  nicht verändert. Keine Desktopbedienung, kein Push/Release, Timer bleibt PAUSED.
