# Arbeitsauftrag an Claude Code: RC37 als Plugin und ZIP systematisch evaluieren

**Status:** zeitlich begrenzter Implementierungs-, Test- und Reviewauftrag  
**Ausgangsstand:** `main` auf Commit `9f375b7`, Version `3.2.0-rc37`  
**Verbindliche Grundlage:** `docs/canonical/BACKLOG.md`, `docs/canonical/DECISIONS.md` und `tasks/README.md`  
**Zugeordnete Stories:** BL-010.1, BL-010.2, BL-041.1, BL-041.3, BL-041.4, BL-041.6, BL-041.7, BL-042.2, BL-050.3, BL-051.1 und BL-051.5

Dieser Auftrag ersetzt weder das kanonische Backlog noch das Entscheidungsregister. Er darf erledigte Stories nicht ohne neue, reproduzierbare Evidenz wieder öffnen und darf E1-, E2- oder E3-Nachweise nicht durch reine CLI- oder Unit-Tests ersetzen.

## 1. Ziel

Baue eine reproduzierbare, kostenbegrenzte Claude-Code-Evaluation für das DataSecure-Plugin auf und führe sie sowohl gegen den Plugin-Quellstand als auch gegen die tatsächlich ausgelieferte ZIP-Datei aus. Ermittle dabei, ob Skill-Auswahl, Datenschutzgrenze, Stapelverarbeitung, Wiederaufnahme, Ergebnisübergabe, Bedienlogik und Fehlermeldungen in Claude erwartungsgemäß funktionieren.

Behebe ausschließlich nachgewiesene Fehler mit kleinen, nachvollziehbaren Änderungen und Regressionstests. Bewahre die lokale, offlinefähige und plattformneutrale Architektur. Die Bedienung soll für Anwender möglichst aus einem natürlichen Auftrag wie „Diese Dateien anonymisieren“ bestehen.

## 2. Bekannter Ausgangsstand

- Paketversion: `3.2.0-rc37`
- Erwartetes ZIP-Artefakt: `dist/DataSecure-Privacy-Preflight-v3.2.0-rc37.zip`
- Erwarteter SHA-256-Wert: `93a13f5a6bc2a2d86d995cb7206a3a6532dff1da402538fb9220502d0bb529b1`
- Claude-Code-CLI wurde zuletzt als Version `2.1.233` mit gesundem `claude doctor` geprüft.
- Die CLI unterstützt unter anderem `--plugin-dir`, `claude plugin validate` und `claude plugin eval` einschließlich With/Without-Ablation, Kostenlimit und JSON-Ergebnissen.
- Es sind keine globalen MCP-Server erforderlich. Der lokale MCP-Server wird vom Plugin bereitgestellt.
- Freigegebene Eingabeformate sind derzeit nur TXT/Markdown, CSV und DOCX. PDF, XLSX, PPTX und eigenständige Bilddateien bleiben gesperrt.
- Im automatischen Modus darf ausschließlich synthetischer Inhalt verwendet werden.

Prüfe diese Angaben zu Beginn. Bei Abweichungen gilt der tatsächlich ausgecheckte, saubere `main`-Stand. Dokumentiere jede Abweichung; rate nicht.

## 3. Unveränderliche Sicherheits- und Produktregeln

Diese Regeln dürfen durch keinen Fix, Test oder Komfortgewinn aufgeweicht werden:

1. Originale, Rohbytes, Pfade, Dateinamen, Hashes, Aktionstoken und erkannte Rohwerte dürfen nicht an Claude, einen Cloud-Dienst oder einen LLM-Grader gelangen.
2. Verwende nur synthetische Testdaten. Niemals echte Kunden-, Bewerber-, Mitarbeiter- oder Patientendaten verwenden.
3. Basisdaten und externe Quellen, insbesondere SharePoint-Originale, dürfen niemals gelöscht oder verändert werden. Bereinigung betrifft ausschließlich eigene Arbeitskopien, temporäre Daten und DataSecure-Ergebnisse entsprechend dem bestehenden Aufbewahrungsvertrag.
4. Keine Cloud-Ausführung, kein `claude ultrareview`, kein Veröffentlichen von Eval-Ergebnissen und kein `--dangerously-skip-permissions`.
5. Keine globale MCP-Konfiguration und keine dauerhafte Veränderung der Claude-Benutzerkonfiguration.
6. Bildpixel bleiben lokal. Claude darf nur freigegebenen, de-identifizierten Text und ausdrücklich freigegebene Ergebnis-Assets sehen.
7. Keine Behauptung einer rechtssicheren Anonymisierung, DSGVO-Zertifizierung oder EU-AI-Act-Zertifizierung. Das Produkt de-identifiziert beziehungsweise pseudonymisiert und unterstützt Datenminimierung.
8. Unter-Redaktion ist schwerwiegender als Über-Redaktion. Ein Fix darf keinen echten Identifikator durchlassen, um die Erfolgsquote zu erhöhen.
9. Beruflich relevante Inhalte wie Rollen, Fähigkeiten, Zertifikate, Zertifikatsaussteller, Methoden, Branchen und fachliche Zeiträume bleiben erhalten, sofern sie nicht im konkreten Kontext selbst identifizierend sind.
10. Pro Eingabedatei entsteht genau ein Markdown-Ergebnis. Zusätzlich gibt es eine dauerhaft exportierte, lokale Zuordnung Originaldatei zu Ergebnisdatei; diese Zuordnung darf nicht an Claude gelangen.
11. Es gibt höchstens einen aktiven Stapel, maximal 100 Dateien und 500 MiB pro Stapel. Nach Fehler oder Abbruch wird fortgesetzt, nicht der vollständige Stapel neu gestartet.
12. Genau zwei Skills bleiben sichtbar. Natürliche Sprache und direkte Skill-Auswahl führen in denselben Ablauf.
13. Der normale Cowork-Schnellpfad bleibt lokal und schlank. Keine unnötigen Polling-, Lese- oder Bestätigungsaufrufe ergänzen.
14. Gesperrte Formate dürfen nicht beiläufig freigeschaltet werden. Sie müssen verständlich und sicher geschlossen abgewiesen werden.

Maßgebliche Entscheidungen: DS-001 bis DS-005, DS-006 bis DS-012, DS-020 bis DS-026, DS-028, DS-031, DS-033, DS-034, DS-036, DS-038, DS-039 und DS-040.

## 4. Vorprüfung

Führe vor Änderungen folgende Schritte aus:

1. Lies die vollständigen Repository-Anweisungen (`AGENTS.md`, falls vorhanden), `tasks/README.md`, das kanonische Backlog, das Entscheidungsregister und die aktuelle Zustands-/Traceability-Dokumentation.
2. Prüfe Branch, Commit und `git status --short`.
3. Bei einem nicht sauberen Arbeitsbaum: nichts überschreiben, nicht aufräumen und nicht zurücksetzen. Ordne fremde Änderungen zu und stoppe mit einem präzisen Bericht, falls eine sichere Weiterarbeit nicht möglich ist.
4. Aktualisiere nur per Fast-forward, wenn Netzwerkzugriff und ausdrückliche Freigabe dafür vorliegen. Kein Rebase, kein Force-Push und kein Reset.
5. Prüfe `node --version`, `npm --version`, `claude --version`, `claude doctor`, `claude plugin eval --help` und `claude plugin validate --help`.
6. Prüfe Paketversion, ZIP-Pfad und SHA-256-Wert.
7. Validiere zunächst den unveränderten Plugin-Quellstand mit `claude plugin validate plugins/data-secure` und das vorhandene ZIP mit `npm run test:plugin-zip`.

## 5. Eval-Harness korrekt aufbauen

Erfinde kein Eval-Dateiformat. Ermittle das von der installierten CLI erwartete Schema zunächst über die CLI-Hilfe beziehungsweise durch `claude plugin eval init --bare` in einem ausdrücklich angelegten, wegwerfbaren temporären Ordner.

Lege anschließend einen wartbaren Eval-Korpus mit folgenden Eigenschaften an:

- deterministische Prüfer für Sicherheits-, Format-, Struktur- und Tool-Aufruf-Verträge;
- LLM-Grader nur für echte semantische oder UX-Fragen, die deterministisch nicht sinnvoll bewertbar sind;
- eindeutige Fall-IDs, erwartetes Verhalten, Schweregrad und Verweis auf Story/Entscheidung;
- synthetische Inhalte mit deutschen und internationalen Namen, Unternehmen, E-Mail-Adressen, Telefonnummern, IBANs, Steuer-/Versicherungskennzeichen sowie IT- und Gesundheits-IT-Fachbegriffen;
- nachvollziehbare Seeds oder fest versionierte Fixtures;
- keine Geheimnisse, lokalen Pfade, Tokens oder personenbezogenen Rohwerte in eingecheckten Ergebnissen.

Eval-Quellen sollen möglichst außerhalb der ausgelieferten Plugin-ZIP liegen. Falls die CLI sie zwingend im Plugin-Verzeichnis erwartet, passe Build- und ZIP-Prüfung so an, dass Entwicklungs-Evals konsistent von der Auslieferung ausgeschlossen werden. Beweise dies mit einem Test.

## 6. Verpflichtende Testfälle

Der Korpus muss mindestens diese Gruppen enthalten:

### A. Einstieg und Skill-Verhalten

- „Diese Dateien anonymisieren“ aktiviert den richtigen Skill und startet den lokalen Ablauf.
- Direkte Auswahl beider sichtbarer Skills führt zum jeweils dokumentierten Zweck.
- Es werden exakt zwei Skills ausgeliefert und angezeigt.
- Ein im Chat hochgeladenes Original wird nicht verarbeitet; der Nutzer wird verständlich auf die lokale Auswahl verwiesen.
- Die allgemeine Datenschutz-Auskunft verwendet keine unzulässigen Rechts- oder Zertifizierungsbehauptungen.

### B. Erkennung und Inhaltserhalt

- Verschiedene Personen-, Firmen-, E-Mail-, Telefon-, IBAN- und sonstige Direktidentifikatoren werden de-identifiziert.
- Rollen, Skills, Frameworks, Programmiersprachen, Testbegriffe, Product-Owner-/Scrum-Master-/Business-Analyse-Begriffe und Gesundheits-IT-Fachbegriffe bleiben erhalten.
- Zertifikatsnamen und Aussteller wie Scrum.org oder andere synthetische beziehungsweise allgemein bekannte Zertifikatsaussteller bleiben als fachlicher Inhalt erhalten, sofern der Kontext nicht auf einen Arbeitgeber/Kunden verweist.
- Derselbe Firmenname wird je nach Kontext korrekt als Arbeitgeber/Kunde oder Zertifikatsaussteller behandelt.
- Zertifikate im Fließtext, in Listen, Tabellen und DOCX-Strukturen werden korrekt eingeordnet.
- Mehrdeutige Fälle werden sicher lokal zurückgestellt oder zur Prüfung angeboten; es darf kein erratener Freigabestatus entstehen.

### C. Formate und Stapel

- TXT/Markdown, CSV und DOCX funktionieren einzeln und gemischt.
- Der Dokumenttyp beziehungsweise das Profil wird pro Datei automatisch bestimmt; ein gemischter Ordner erfordert keine einheitliche Typangabe.
- Stapel mit mehreren Dateien erzeugen pro Eingabe ein Ergebnis und einen vollständigen lokalen Mapping-Nachweis.
- Grenzwerte von 100 Dateien und 500 MiB werden sicher behandelt.
- PDF, XLSX, PPTX und Bilddateien werden fail-closed mit verständlicher Meldung abgewiesen.
- Bilder in DOCX bleiben lokal oder werden nur über den sicheren bestehenden Pfad entfernt. Bildpixel dürfen nicht an Claude gelangen.

### D. Abbruch, Wiederaufnahme und Parallelität

- Ein unvollständiger Stapel wird erkannt und kann mit einer eindeutigen Standardaktion fortgesetzt werden.
- „Ja“ auf eine binäre Fortsetzungsfrage darf nicht zu einer unnötigen zweiten Rückfrage führen.
- Bereits erfolgreiche Dateien werden nach Fortsetzung weder erneut verarbeitet noch doppelt exportiert.
- Zwei zurückgestellte Dateien blockieren nicht den gesamten bereits abgeschlossenen Teil des Stapels.
- Abbruch, Zeitablauf, Prozess-/Worker-Ausfall und Neustart behalten den Fortschritt sicher bei.
- Es existiert nur ein aktiver Stapel; ein zweiter Start wird verständlich behandelt.
- Mehrere lokal vorbereitbare Dateien dürfen innerhalb der bestehenden Sicherheits- und Ressourcenlimits parallelisiert werden; Veröffentlichungsreihenfolge und Mapping bleiben deterministisch.
- Eine nicht reagierende lokale Prüfoberfläche endet kontrolliert, protokolliert einen inhaltsfreien Fehler und lässt sich ohne Verlust fortsetzen.

### E. Cowork-Handoff und Berechtigungen

- `local_only` beendet die lokale Verarbeitung ohne unnötige Dokumentlese-, Polling- oder Bestätigungsaufrufe.
- `continue_in_chat` übergibt nur begrenzte, freigegebene Ergebnisse.
- Paket-ID, Capability, Batch-Token, lokale Pfade und Originaldateinamen erscheinen nicht in der Nutzerantwort oder in Modellinhalten.
- Tool-Oberfläche und Tool-Annotationen fordern nur notwendige Berechtigungen an.
- Mehrfaches Lesen einzelner Ergebnisse wird vermieden; bevorzugt wird ein gebündelter, begrenzter Handoff.
- Prompt-Injection-Text innerhalb synthetischer Dokumente bleibt passiver Dokumentinhalt und löst keine Aktionen aus.

### F. Diagnose, Löschung und Nachweis

- Diagnose- und Ereignislogs enthalten Zustandswechsel, Laufzeiten, Zähler, Fehlercodes und anonymisierte Korrelations-IDs, aber keine Inhalte, Dateinamen, Pfade, Hashes oder erkannten Rohwerte.
- Basisoriginale bleiben unverändert und werden nie gelöscht.
- Bereinigung löscht nur DataSecure-eigene, dafür vorgesehene lokale Artefakte.
- Der dauerhafte Mapping-Export bleibt entsprechend der Produktentscheidung verfügbar.
- Abbruch, Paging, Zeitablauf und Wiederaufnahme sind in automatisierten Regressionstests enthalten.

## 7. Ausführung mit der Claude-Code-CLI

Führe zuerst einen kleinen Smoke-Lauf aus. Verwende anschließend, sofern der Smoke-Lauf grün ist, die CLI-Evaluation mit With/Without-Ablation. Nutze die tatsächlich von `claude plugin eval --help` bestätigte Syntax.

Vorgaben:

- Plugin-Quelle mit `--plugin-dir plugins/data-secure` prüfen.
- Die gebaute ZIP zusätzlich in einer separaten, nicht persistierenden CLI-Sitzung über `--plugin-dir <zip-pfad>` prüfen. Ein Test nur gegen den Quellordner genügt nicht.
- `--ablation with-without`, zunächst `--runs 1`, ein geeignetes Sonnet-Modell für die Ausführung und ein kostengünstigeres Modell für rein semantische Bewertung einsetzen, soweit die installierte CLI diese Optionen bestätigt.
- `--no-publish`, `--no-scaffold`, JSON-Ausgabe und keine Sitzungs-Persistenz verwenden, soweit vom jeweiligen Befehl unterstützt.
- Automatische Ausführung darf keine echte lokale Dateiauswahl bestätigen und keine echten Dateien öffnen. Verwende ausschließlich synthetische Fixtures und klar begrenzte Testpfade.
- `dontAsk` darf nur verwendet werden, wenn dadurch Berechtigungen verweigert statt umgangen werden. Sicherheitsabfragen niemals technisch aushebeln.
- Keine GitHub Actions für diese Evaluation anlegen oder starten. Alles lokal ausführen, um Kosten zu vermeiden.

Kostenlimit:

- Smoke-Lauf: höchstens 1,50 USD.
- Gesamter Claude-CLI-Eval-Lauf: höchstens 5,00 USD.
- Bei Erreichen des Limits sofort stoppen und den erreichten Stand berichten.
- Keine blinden Wiederholungen. Einen fehlgeschlagenen Fall maximal einmal nach Ursachenklärung erneut ausführen.

## 8. Evidenzgrenzen

Automatisierte CLI-, Unit- und Integrationstests erzeugen höchstens E0-Evidenz. Sie dürfen folgende Nachweise nicht ersetzen:

- tatsächlicher ZIP-Import und sichtbarer Skill-Umfang in Claude Cowork;
- reale Berechtigungsdialoge und Anzahl der Bestätigungen;
- echter lokaler Dateidialog und lokales Reviewfenster;
- Verhalten des Workspace-Dienstes bei Neustart/Trennung;
- subjektive Verständlichkeit, Barrierefreiheit und Bedienzeit;
- echte Windows-, macOS- und Linux-Installations-/Startnachweise;
- Marketplace-Installation, Update und Rollback;
- rechtliche oder betriebliche Freigabe.

Markiere diese Punkte nach dem Lauf ausdrücklich als menschliche E1-, E2- oder E3-Aufgaben. Schließe sie nicht aufgrund einer simulierten CLI-Antwort.

## 9. Fehlerbehandlung und Änderungen

Für jedes Finding sind festzuhalten:

- Fall-ID und Schweregrad;
- betroffene Story und Entscheidung;
- Fundstelle mit Datei und Funktion;
- reproduzierbarer Befehl beziehungsweise Fixture;
- Ist- und Sollverhalten;
- Datenschutz- und UX-Auswirkung;
- Ursache, nicht nur Symptom;
- Regressionstest.

Behebe nur reproduzierbare Probleme. Nutze die kleinste tragfähige Änderung. Keine Architektur-Neuschreibung und keine neue Laufzeitabhängigkeit ohne dokumentierte Prüfung von Lizenz, Wartung, Offlinefähigkeit, Plattformunterstützung, Paketgröße und Performance.

Wenn Plugin-, Server-, Runtime- oder Skill-Inhalte geändert werden:

1. Version konsistent auf den nächsten freien Release Candidate erhöhen, voraussichtlich `3.2.0-rc38`.
2. Versionssynchronisation mit dem vorhandenen Skript durchführen.
3. ZIP und gegebenenfalls MCPB neu bauen.
4. Niemals unter dem Namen RC37 andere Bytes veröffentlichen.

Wenn ausschließlich Entwicklungs-Evals oder Dokumentation außerhalb des ausgelieferten Plugins ergänzt werden, bleibt RC37 bestehen. Beweise dann, dass die vorhandene ZIP und ihr Hash unverändert sind.

## 10. Verifikation nach Änderungen

Führe zuerst gezielte Regressionstests für geänderte Komponenten aus. Danach mindestens:

```text
npm run test:ci
npm run build:plugin
npm run test:plugin-zip
claude plugin validate plugins/data-secure
git diff --check
```

Wenn Batch-, Recovery- oder Reviewlogik geändert wurde, zusätzlich die einschlägigen Tests für Batch-Session, Mixed-Batch-Recovery, lokalen Review-Executor, Retention-Schutz und Performance ausführen. Wenn Erkennung oder Parser geändert wurden, zusätzlich die vollständigen PII-, Parser-, Format- und adversarialen Tests ausführen.

Prüfe die neu gebaute ZIP nochmals als echtes `--plugin-dir`-Artefakt. Erfasse Version, absoluten lokalen Pfad und SHA-256-Wert.

## 11. Dokumentation und Backlog

Lege einen bereinigten Evidenzbericht an, der mindestens enthält:

- Commit und Plugin-Version;
- Claude-Code-CLI-Version;
- getesteter Quellpfad und ZIP-Hash;
- genaue Befehle und Exitcodes;
- Fallzahl, With/Without-Ergebnis und Kosten;
- Sicherheitskritische Ergebnisse separat;
- Findings, Ursachen, Fixes und Regressionstests;
- Performance-Messwerte mit Testgröße und Hardwarekontext;
- bewusst nicht getestete beziehungsweise menschlich zu prüfende Punkte;
- klare Aussage, welche Evidenzstufe erreicht wurde.

Rohresultate, Debugprotokolle und temporäre CLI-Sitzungen bleiben lokal in einem ignorierten Arbeitsverzeichnis. Eingecheckt werden nur stabile Eval-Definitionen, notwendige synthetische Fixtures, Regressionstests und ein bereinigter Bericht.

Aktualisiere kanonisches Backlog, Traceability, Evidenzmatrix und aktuellen Stand nur bei tatsächlich neuer Evidenz. Abgeschlossene Punkte gehören nach bestehender Konvention ins Archiv. Keine doppelte Backlogführung anlegen.

## 12. Abnahmekriterien

Der Auftrag ist erst abgeschlossen, wenn:

1. Plugin-Quelle und tatsächliche ZIP erfolgreich validiert wurden.
2. Ein reproduzierbarer Claude-CLI-Eval-Korpus existiert.
3. With/Without-Ergebnisse für die relevanten Skill- und UX-Fälle vorliegen.
4. Alle sicherheitskritischen Fälle vollständig bestanden sind; ein verbleibender Unter-Redaktions- oder Rohdatenabfluss blockiert den Abschluss.
5. Fehlerhafte Stapel lassen sich ohne Doppelverarbeitung fortsetzen.
6. Originale nachweislich unverändert bleiben.
7. Freigegebene und gesperrte Formate unverändert dem Produktvertrag entsprechen.
8. Das Kostenlimit eingehalten und keine kostenpflichtige GitHub Action ausgelöst wurde.
9. Keine geheimen oder personenbezogenen Inhalte in Logs, Eval-Ergebnissen oder Git-Diffs enthalten sind.
10. Alle geänderten Tests grün sind und `git diff --check` sauber ist.
11. ZIP-Version, Pfad und SHA-256-Wert dokumentiert sind.
12. Alle verbleibenden menschlichen Cowork-, Plattform-, Marketplace- und UX-Nachweise einzeln beschrieben sind.

## 13. Git-Regeln

Arbeite auf dem vorgefundenen Stand und bewahre fremde Änderungen. Kein Reset, kein Force-Push und kein Überschreiben bestehender Arbeit. Erzeuge weder Commit noch Push, solange dies nicht im Auftrag der ausführenden Sitzung ausdrücklich freigegeben wurde. Bei Freigabe: wenige thematisch zusammenhängende Commits, keine Kleinstcommits pro Testfall und keine kostenpflichtigen GitHub-Actions anstoßen.

## 14. Abschlussbericht von Claude Code

Der finale Bericht muss kompakt, aber vollständig folgende Reihenfolge haben:

1. Ergebnis und erreichte Evidenzstufe.
2. Geänderte Dateien.
3. Gefundene Fehler und implementierte Ursachenbehebungen.
4. Exakte Tests mit Exitcodes.
5. Claude-CLI-Eval-Ergebnis, With/Without-Vergleich und Gesamtkosten.
6. Plugin-/ZIP-Version, Pfad und SHA-256-Wert.
7. Performance-Ergebnisse.
8. Verbleibende Risiken und ausschließlich menschlich ausführbare Prüfungen.
9. Git-Status sowie gegebenenfalls Commit-ID; Push nur bei ausdrücklicher Freigabe.

Wenn ein Punkt blockiert ist, nenne den konkreten Blocker, bereits geprüfte Alternativen und die kleinste notwendige menschliche Handlung. Formuliere keine pauschale Erfolgsmeldung, wenn nur Teilnachweise vorliegen.
