# Claude-Code-Folgeauftrag: unabhängiges Gegenreview DataSecure RC93

Stand: 03.09.2026  
Ausgangsbasis: der `main`-Commit, der diesen Auftrag zusammen mit
`3.2.0-rc93` enthält  
Repo: `renepuhlmannarbeit/msg_gbh_DataSecure`
Kanonische Zuordnung: BL-021.1, BL-042, BL-044.1 und BL-002

## Ziel

Prüfe die in RC93 vorgenommenen Datenschutz-, Startschutz- und
Exportpfadkorrekturen unabhängig gegen Code, kanonische Produktentscheidungen
und ausführbare Tests. Das Ziel ist nicht ein weiteres allgemeines Redesign,
sondern der belastbare Nachweis, dass die konkreten RC92-Befunde geschlossen
sind, ohne neue Unterredaktion, Überredaktion, Pfadflucht oder zusätzliche
Cowork-Bürokratie zu erzeugen.

Wenn du einen reproduzierbaren Defect findest, behebe ausschließlich diesen
Defect mit einem engen Regressionstest und einem thematischen Commit. Vermutete
Verbesserungen ohne reproduzierbaren Fehler werden nur im Bericht festgehalten
und nicht vorsorglich implementiert.

## Verbindlicher Arbeitsbeginn

1. Arbeite auf `main` und führe zuerst `git pull --ff-only` aus.
2. Prüfe, dass der Arbeitsbaum sauber ist.
3. Ermittle den Commit, der diese Datei und RC93 eingeführt hat, und lies seinen
   vollständigen Diff gegen den direkten Vorgänger.
4. Lies vollständig:
   - `tasks/CODEX-REVIEW-BERICHT-RC92.md`
   - `docs/canonical/PRODUCT.md`
   - `docs/canonical/DECISIONS.md`
   - `docs/canonical/CURRENT_STATE.md`
   - `docs/canonical/BACKLOG.md`
   - `docs/canonical/TRACEABILITY.md`
   - `docs/ANLEITUNG.md`
   - `docs/IT-BETRIEBSHANDBUCH.md`
5. Prüfe danach den produktiven Code und die zugehörigen Tests; übernimm keine
   Aussage aus dem Bericht ungeprüft.

## Unveränderliche Produktgrenzen

- Originale, Rohbytes, Rohwerte, Dateinamen, Quellpfade und Dokument-Hashes
  dürfen Claude nicht erreichen.
- Basis-/Originaldateien werden niemals gelöscht oder verändert.
- Die lokale Verarbeitung bleibt offline und fail-closed.
- Der Nutzerfluss erhält keine neue Profilfrage, Werkzeugbestätigung oder
  zusätzliche Dialogstufe.
- Fachlich benötigte Rollen, Methoden, Technologien, Qualifikationen,
  Zertifizierungen und akademische Titel bleiben erhalten. Geschlechtliche
  Anreden werden entfernt.
- Keine VM, kein separates Betriebssystemkonto und kein Windows-Schlüsselbund
  als neue Voraussetzung.
- Unterstützter Produktumfang und NO-GO-Formate dürfen nicht stillschweigend
  erweitert werden.
- `run_id` darf nur im ausdrücklich angeforderten inhaltsfreien Supportstatus
  und im ausdrücklich bestätigten lokalen Diagnoseexport erscheinen, nicht im
  normalen Cowork-Ablauf, in Skills, Ergebnissen oder Mapping.
- Keine GitHub Actions auslösen. Alle Prüfungen laufen lokal.

## Prüfauftrag

### A. Datenschutzdetektoren und Residual-Gate

Prüfe C-01 bis C-05 aus dem RC92-Bericht, insbesondere:

1. fragmentierte `<br>`-Tabellenköpfe und höchstens zweizeilige,
   gleichbreite Tabellenköpfe für Steuer-ID, Geburtsdatum, Telefon und
   Personalnummer;
2. `Geboren`, ISO-/Slash-Geburtsdaten und Labelbindung;
3. deutsche Telefonnummern mit `0049`, `+49`, Klammern, Leerraum und Slash;
4. echte Unabhängigkeit des konservativen Residual-Gates von der eigentlichen
   Redaktion;
5. negative Kontrollen für Projekt-, Vertrags-, Versions-, Mengen- und
   unbeschriftete Datums-/Zahlenwerte;
6. Anreden versus akademische und berufliche Qualifikationen;
7. harmlose Monats-/Jahresangaben versus echte Adressen.

Challenge dabei besonders:

- Werden Datenzeilen versehentlich als zweite Kopfzeile interpretiert?
- Werden ungleich breite oder unbekannte Tabellen konservativ behandelt?
- Entstehen durch Unicode-Leerzeichen oder Groß-/Kleinschreibung neue Lücken?
- Kann ein vom Redaktor absichtlich nicht akzeptierter, aber plausibel
  sensitiver labelgebundener Wert das Residual-Gate passieren?
- Bleiben Zertifizierungen und Qualifikationen vollständig erhalten?

Fuzzing oder generative Testdaten sind willkommen, müssen deterministisch,
synthetisch und ohne Netz-/Echtdatenzugriff ausgeführt werden.

### B. Früher Startschutz

Prüfe C-06 und die Aufteilung von `server/index.js` und `server/mcp-server.js`:

- Produktmodul kann nicht geladen werden;
- Produktmodul und regulärer Startschutz können beide nicht geladen werden;
- stderr enthält genau eine kurze, pfadfreie Meldung ohne Stacktrace,
  Quellpfad, Benutzername oder Interna;
- Prozess beendet sich ungleich null und startet keine Teilverarbeitung;
- Manifest, Paket und Marketplace verwenden weiterhin nur den kleinen
  Bootstrap als Eintrittspunkt;
- das gebaute ZIP enthält die Produktimplementierung und bleibt
  selbsttragend/offline-fähig.

### C. Dateisystem- und Exportgrenzen

Prüfe C-07 und C-08 mit realen temporären Testverzeichnissen:

- Diagnose-, Root-, Output- und Run-Verzeichnisse als Symlink/Junction oder
  nach der Erstprüfung ausgetauscht;
- Austausch unmittelbar vor Anlage, temporärem Schreiben und atomarem Rename;
- kein Byte und kein Marker wird außerhalb des gebundenen Zielbaums erzeugt;
- Root-/Output-/Run-Identität wird vor jedem relevanten Schreibschritt erneut
  geprüft;
- normale Exporte, Wiederaufnahme, fehlgeschlagener Einmal-Replay und
  endgültige abgeschlossene Exporte bleiben funktional;
- Verhalten ist auf Windows und POSIX konservativ. Plattformbedingt nicht
  ausführbare Linktests müssen ausdrücklich als Zielhost-Evidence offenbleiben
  und dürfen nicht künstlich als bestanden gemeldet werden.

### D. Produkt-, Cowork- und Dokumentationsvertrag

Prüfe:

- keine neue Nutzerbestätigung und kein neuer Dialog durch die Fixes;
- DS-012 und DS-071 stimmen in Produkt, Entscheidungen, Betriebsanleitung,
  Current State, Backlog und Traceability überein;
- C-01 bis C-08 sind nur als E0 geschlossen; reale Windows-/macOS-Cowork-UAT
  bleibt korrekt offen;
- Versionen, Manifest, BUILD_INFO, Paketname und Dokumentation stehen überall
  auf `3.2.0-rc93` beziehungsweise verwenden bewusst versionsneutrale Texte;
- der korrigierte `test:executor-lifecycle`-Befehl ist ausführbar und durch
  einen Vertragstest gebunden.

## Pflichtgates

Mindestens ausführen:

```text
node tests/test-pii-regression.js
npm run test:executor-lifecycle
npm run test:docs
npm run test:skills
npm run test:source-preflight
npm run test:parser-contract
npm run test:product
npm run build
npm run test:plugin-zip
claude plugin validate plugins/data-secure --strict
claude plugin validate . --strict
git diff --check
```

Falls ein Gate aus Umgebungsgründen nicht ausführbar ist, dokumentiere Befehl,
Exitcode, genaue inhaltsfreie Ursache und Ersatzprüfung. Ein übersprungenes Gate
ist kein PASS. Keine GitHub Actions starten.

## Arbeitsweise mit Subagenten

Nutze bei Verfügbarkeit getrennte, lesende Gegenchecks für genau diese drei
begrenzten Ergebnisse:

1. Datenschutz/Unter- und Überredaktion C-01 bis C-05;
2. Dateisystem-/TOCTOU- und Startschutz C-06 bis C-08;
3. Claude-Cowork-/Produkt-/Dokumentationskonsistenz einschließlich C-09.

Subagenten ändern keinen Code. Du prüfst ihre Befunde selbst. Lass sie keine
weiteren Subagenten starten und gib ihnen ausreichend, aber endliche Turns.

## Änderungsregeln

- Keine fremden oder bereits vorhandenen Nutzeränderungen überschreiben.
- Kein Refactoring ohne nachgewiesenen Defect.
- Ein Defect-Thema pro Commit; Tests im selben Commit wie der Fix.
- Kanonische Dokumente nur ändern, wenn ein bestätigter Befund den realen Stand
  verändert. Keine neuen Backlog-IDs erfinden, wenn eine bestehende ID passt.
- Keine Abhängigkeit ohne zwingenden, dokumentierten Bedarf hinzufügen.
- Keine echten personenbezogenen Daten in Tests, Logs, Berichten oder Commits.
- Nicht pushen, bis der Nutzer dies ausdrücklich freigibt.

## Lieferergebnis

Erstelle `tasks/CLAUDE-CODE-GEGENREVIEW-BERICHT-RC93.md` mit:

- geprüftem Commitbereich und Werkzeugversionen;
- Urteil pro C-01 bis C-09: bestätigt geschlossen, Restdefect oder
  Produktentscheidung;
- positiven und negativen Reproduktionen;
- Gate-Tabelle mit Befehl, Exitcode und Ergebnis;
- Liste eigener Fixcommits, falls notwendig;
- sauberer Trennung von E0-Evidence und weiterhin offener menschlicher
  Windows-/macOS-Cowork-UAT;
- abschließender Push-Empfehlung.

Wenn kein weiterer Defect reproduzierbar ist, ändere außer dem Bericht keine
Produktdatei. Committe den Bericht beziehungsweise bestätigte Fixes lokal,
pushe jedoch nicht.
