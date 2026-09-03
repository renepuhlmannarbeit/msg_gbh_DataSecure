# Codex-Gegenreview DataSecure 3.2.0-rc92

Stand: 03.09.2026  
Prüfbasis: Produktstand `4d932ad`; der zusätzliche Auftrag-Commit ändert keinen
Produktcode.  
Vorgehen: ausschließlich lesendes Code-Review, bestehende Tests und synthetische
Probes unter dem Betriebssystem-Temp-Ordner. Keine echten Dokumente, keine
GitHub Actions, kein Commit und kein Push.

## Aktueller Umsetzungsstatus

Die im Gegenreview gefundenen Produktdefekte sind im Arbeitsstand
`3.2.0-rc93` behoben. Das ursprüngliche Kurzurteil unten beschreibt den
geprüften RC92-Ausgangsstand und ist nicht mehr der Status der Korrekturen.
Die E0-Abnahme ist vollständig grün; die weiterhin notwendige menschliche
Zielhost-/Cowork-Abnahme bleibt davon getrennt offen.

## Kurzurteil zum RC92-Ausgangsstand

Der Stand ist **nicht freigabefähig**, solange C-01 bis C-03 offen sind. Die drei
P1-Befunde sind Unterredaktionen, bei denen das Residual-Gate denselben blinden
Fleck wie die Redaktion besitzt. Zusätzlich bestehen vier P2-Befunde in
Titelbehandlung, Startschutz und Pfadgrenzen sowie zwei P3-Befunde. Positiv sind
die bereits umgesetzten Batch-, Handoff-, Staging-, Lösch-, Runtime- und
Skill-Verträge in den geprüften Normalfällen belastbar.

## Umsetzungsnachtrag RC93

Nach Privacy-, Dateisystem-/Security- und Claude-Cowork-/Produkt-Revalidierung
sind C-01 bis C-08 E0 korrigiert und mit Negativtests gebunden. Für C-04 gilt
die kanonische Produktentscheidung DS-012: Geschlechtliche Anreden werden
entfernt, akademische beziehungsweise berufliche Qualifikationen bleiben als
fachlich benötigter Inhalt erhalten. C-09 ist kein Defect im Datenfluss;
DS-071 dokumentiert nun ausdrücklich, dass die zufällige, nicht aus Dokumenten
abgeleitete Kennung ausschließlich im expliziten Supportstatus und im
bestätigten lokalen Diagnoseexport erscheinen darf. Normaler Cowork-Ablauf,
Skills, Ergebnisse und Mapping enthalten sie nicht.

Zusätzlich wurde ein vorhandener Tippfehler im direkten
`test:executor-lifecycle`-Befehl korrigiert. Die vollständigen E0-Gates und die
weiterhin offene menschliche Zielhost-/Cowork-Evidence stehen im kanonischen
Backlog. Die Korrekturen schließen die konkret reproduzierten Formen; sie sind
kein mathematischer Vollständigkeitsbeweis für jede denkbare künftige Eingabe.

Abschließende lokale Evidence am 03.09.2026, ohne GitHub Actions:

- `npm run test:product`: PASS, 27 Basis- und 108 direkte Testdateien;
- `npm run build`: PASS;
- `npm run test:plugin-zip`: PASS, 170 ZIP-Einträge, 13 Skill-Abnahmen und
  150/150 Vertragsfälle;
- `claude plugin validate plugins/data-secure --strict`: PASS;
- `claude plugin validate . --strict`: PASS;
- Release-ZIP:
  `DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc93.zip`, 34.936.277 Byte,
  SHA-256
  `903F9C495D96C80534B1FB8C5665BECAC28F54FC2B67C125000A97A5DEC6B4B5`.

| ID | Schwere | Kurzbefund |
| --- | --- | --- |
| C-01 | P1 | Mehrzeilige oder durch `<br>` getrennte Tabellenköpfe lassen Direktidentifikatoren stehen; das Gate bleibt leer. |
| C-02 | P1 | Gängige Geburtsdatumsformen und das Label `Geboren:` werden nicht erkannt; das Gate bleibt leer. |
| C-03 | P1 | Gängige deutsche Telefonnummern mit `0049` oder Leerraum um `/` werden nicht erkannt; das Gate bleibt leer. |
| C-04 | P2 | Mehrteilige akademische Titel bleiben vor einem korrekt pseudonymisierten Namen stehen. |
| C-05 | P3 | Harmlose Zeitangabe „Im Januar 1980“ wird als Anschrift entfernt. |
| C-06 | P2 | Modul-Ladefehler vor dem Startschutz geben einen Node-Stacktrace mit absolutem Pfad auf stderr aus. |
| C-07 | P2 | Die Startmarker-Datei folgt einem Junction/Symlink des Diagnoseordners aus dem Datenbaum. |
| C-08 | P2 | Ein nach der Zielprüfung ausgetauschter Ergebnisordner kann Exporte außerhalb des gewählten Zielbaums anlegen. |
| C-09 | P3 | `run_id` erscheint entgegen der expliziten Prüffrage in einer MCP-Diagnoseantwort und im lokalen Diagnoseexport. |

## Findings

### C-01 – P1: fragmentierte und zweizeilige Tabellenköpfe sind unterredigiert

**Stellen:** `plugins/data-secure/server/privacy/base.js:332-339`,
`plugins/data-secure/server/privacy/base.js:485-492`,
`plugins/data-secure/server/privacy/base.js:546-557`,
`plugins/data-secure/server/ooxml.js:124-125` und
`plugins/data-secure/server/ooxml.js:463-489`.

`canonicalizeRenderedText` macht aus `<br>` ein Leerzeichen. Die Labelmuster
erkennen danach weder `Geburts datum` noch `Personal nummer`. `buildTableIndex`
akzeptiert außerdem ausschließlich genau eine Kopfzeile direkt vor der
Markdown-Trennzeile. Eine zweite Kopfzeile verhindert den Aufbau des gesamten
Spaltenindex. Das ist auch für DOCX relevant, weil der Parser Zellumbrüche als
`<br>` emittiert.

Reproduktion:

```powershell
node -e 'const {anonymize,scanResidual}=require("./plugins/data-secure/server/privacy/engine"); const cases={br:"| Steuer<br>ID | Geburts<br>datum | Telefon<br>(privat) | Personal<br>nummer |\n| --- | --- | --- | --- |\n| 26954371827 | 01.01.1980 | 030 12345678 | P-4711 |",two:"| Steuer | Geburts | Telefon | Personal |\n| ID | datum | privat | nummer |\n| --- | --- | --- | --- |\n| 26954371827 | 01.01.1980 | 030 12345678 | P-4711 |"}; for(const [k,v] of Object.entries(cases)){const r=anonymize(v,"general");console.log(JSON.stringify({case:k,output:r.text,residual:scanResidual(r.text)}));}'
```

Tatsächlich, gekürzt auf die relevanten Werte:

```text
br:  [ID_REDACTED] | 01.01.1980 | [PHONE_REDACTED] | P-4711 ; residual=[]
two: 26954371827 | 01.01.1980 | 030 12345678 | P-4711 ; residual=[]
```

**Ist:** Direkte Identifikatoren bleiben in freigabefähig wirkendem Text; die
zweite Prüfung meldet nichts.  
**Soll:** Fragmentierte sichtbare Label müssen kanonisch erkannt und
mehrzeilige Tabellenköpfe pro Spalte zusammengesetzt werden; bei nicht sicher
interpretierbaren Tabellen muss der Lauf stoppen.  
**Auswirkung:** Personenbezug kann an Claude und in `DataSecure-Output`
gelangen.  
**Zuordnung:** DS-049, BL-021.1.

### C-02 – P1: Geburtsdatumsformen und Labelvarianten sind gemeinsam blind

**Stellen:** `plugins/data-secure/server/privacy/base.js:149-166` und
`plugins/data-secure/server/privacy/structured.js:113-117`.

Reproduktion:

```powershell
node -e 'const {anonymize,scanResidual}=require("./plugins/data-secure/server/privacy/engine"); for(const input of ["Geboren: 01.01.1980","Geburtsdatum: 1980-01-01","Date of birth: 1980/01/01"]){const r=anonymize(input,"general");console.log(JSON.stringify({input,output:r.text,residual:scanResidual(r.text)}));}'
```

Tatsächlich bleiben alle drei Eingaben unverändert; jedes Ergebnis enthält
`residual: []`.

**Ist:** Der Zahlenregex akzeptiert nur Tag-Monat-Jahr, nicht ISO-Jahr-Monat-Tag;
das deutsche Label kennt `geboren am`, aber nicht das häufige alleinstehende
`Geboren:`. Redaktor und Gate verwenden dieselben strukturierten Detektoren.  
**Soll:** Beschriftete ISO-/Slash-Formen und `Geboren:` erkennen; das Gate braucht
zusätzlich einen unabhängigen konservativen DOB-Kanal.  
**Auswirkung:** Ein unmittelbares Geburtsdatum kann freigegeben werden.  
**Zuordnung:** DS-049, BL-021.1.

### C-03 – P1: deutsche Telefonnummern mit `0049` oder getrenntem Slash

**Stellen:** `plugins/data-secure/server/privacy/base.js:73-86` und
`plugins/data-secure/server/privacy/structured.js:127-140`.

Reproduktion:

```powershell
node -e 'const {anonymize,scanResidual}=require("./plugins/data-secure/server/privacy/engine"); for(const input of ["Telefon: 0049 30 12345678","Telefon: 030 / 123456","Phone number: (020) 1234 5678"]){const r=anonymize(input,"general");console.log(JSON.stringify({input,output:r.text,residual:scanResidual(r.text)}));}'
```

Tatsächlich bleiben die ersten zwei Nummern unverändert und das Gate bleibt
leer. Die englische Klammerform wird korrekt zu `[PHONE_REDACTED]`; sie ist die
Kontrolle.

**Ist:** Der Regex kennt `+<Ländercode>`, aber kein `00<Ländercode>`, und erlaubt
zwischen Nummerngruppen nur jeweils ein Trennzeichen, nicht `Leerraum / Leerraum`.
Das Gate teilt denselben Regex.  
**Soll:** Übliche internationale Präfixe und typografisch getrennte Separatoren
erkennen; ein unabhängiger, labelgebundener Gate-Check muss im Zweifel stoppen.  
**Auswirkung:** Direkte Kontaktinformation kann freigegeben werden.  
**Zuordnung:** DS-049, BL-021.1.

### C-04 – P2: mehrteilige akademische Titel bleiben sichtbar

**Stellen:** `plugins/data-secure/server/privacy/base.js:204-216` und
`plugins/data-secure/server/privacy/engine.js:60-70`.

Reproduktion:

```powershell
node -e 'const {anonymize}=require("./plugins/data-secure/server/privacy/engine"); for(const input of ["Ansprechpartner: Dr. med. Anna Beispiel","Ansprechpartner: Frau Dr. med. Anna Beispiel"]){const r=anonymize(input,"general");console.log(JSON.stringify({input,output:r.text}));}'
```

Tatsächlich:

```text
Ansprechpartner: Dr. med. [PERSON_001]
Ansprechpartner: Frau Dr. med. [PERSON_001]
```

**Ist:** Die Seed-Bereinigung kennt Qualifikatoren wie `med.`, der nachgelagerte
Span-Expander aber nur einzelne alte Titel.  
**Soll:** Die gesamte zusammenhängende Anrede-/Titelkette wird in denselben
Personenspan einbezogen.  
**Auswirkung:** Der Name ist entfernt, aber Geschlecht und seltene Qualifikation
bleiben als Quasi-Identifikatoren erhalten.  
**Zuordnung:** DS-049, BL-021.1.

### C-05 – P3: Zeitangabe wird als Straße überredigiert

**Stelle:** `plugins/data-secure/server/privacy/base.js:137-146`.

Reproduktion:

```powershell
node -e 'const {anonymize}=require("./plugins/data-secure/server/privacy/engine"); console.log(anonymize("Im Januar 1980 wurde das Projekt gestartet.","general").text);'
```

Tatsächlich:

```text
[LOCATION_REDACTED] wurde das Projekt gestartet.
```

**Ist:** Die Anschriftenalternative `Im <Titelwort> <Zahl>` verlangt kein
straßentypisches Nomen und akzeptiert daher Monat plus Jahr.  
**Soll:** Präpositionale Straßenformen nur mit belastbarem Straßenkontext oder
plausibler Hausnummer erkennen.  
**Auswirkung:** Fachlich relevante Zeitinformation geht verloren.  
**Zuordnung:** DS-049, BL-021.1.

### C-06 – P2: `require`-Fehler umgehen den Startschutz

**Stellen:** `plugins/data-secure/server/index.js:2-23` und
`plugins/data-secure/server/index.js:370-375`.

Reproduktion (der Modul-Lader erzeugt ausschließlich einen synthetischen Fehler):

```powershell
node -e 'const {spawnSync}=require("child_process"); const path=require("path"); const entry=path.resolve("plugins/data-secure/server/index.js"); const child="const Module=require(\"module\");const old=Module._load;Module._load=function(r){if(r===\"./gateway\")throw new Error(\"synthetic pre-guard require failure\");return old.apply(this,arguments)};require("+JSON.stringify(entry)+")"; const x=spawnSync(process.execPath,["-e",child],{encoding:"utf8",env:{...process.env,EU_PRIVACY_SUPPORT_MODE:"0"}}); console.log(JSON.stringify({status:x.status,stdout_empty:x.stdout==="",stderr_lines:x.stderr.trim().split(/\r?\n/u).length,has_stack:/synthetic pre-guard require failure[\s\S]*at /u.test(x.stderr),has_absolute_js_path:/[A-Za-z]:\\[^\r\n]+\.js/u.test(x.stderr)}));'
```

Tatsächlich:

```json
{"status":1,"stdout_empty":true,"stderr_lines":17,"has_stack":true,"has_absolute_js_path":true}
```

**Ist:** Alle Produktmodule werden vor dem geschützten `try` geladen. Ein
Syntax-, Packaging- oder Ladefehler erreicht `refuseStartup` deshalb nie.  
**Soll:** Ein minimaler Bootstrap fängt auch Modulinitialisierung ab und gibt nur
den festen pfadfreien Startcode aus.  
**Auswirkung:** Lokale Benutzerpfade können im Host-/Supportlog erscheinen; der
Startmarker fehlt gerade beim frühen Packagingfehler.  
**Zuordnung:** DS-048, DS-071, BL-042.

### C-07 – P2: Startmarker folgt einem Diagnose-Junction

**Stellen:** `plugins/data-secure/server/gateway/startup-guard.js:45-70`.

Reproduktion:

```powershell
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const {recordStartupRefusal}=require("./plugins/data-secure/server/gateway/startup-guard");const base=fs.mkdtempSync(path.join(os.tmpdir(),"ds-rc92-marker-")),root=path.join(base,"root"),outside=path.join(base,"outside");fs.mkdirSync(root);fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(root,"diagnostics"),"junction");const out=recordStartupRefusal(new Error("synthetic"),{dataRoot:root,recordWorkflowEvent:()=>false,stderr:{write(){}}});console.log(JSON.stringify({code:out.code,recorded:out.recorded,marker:out.marker,root_diagnostics_is_symlink:fs.lstatSync(path.join(root,"diagnostics")).isSymbolicLink(),marker_in_outside:fs.existsSync(path.join(outside,"startup-refused.json"))}));fs.rmSync(path.join(root,"diagnostics"));fs.rmSync(base,{recursive:true});'
```

Tatsächlich:

```json
{"code":"STARTUP_FAILED","recorded":false,"marker":true,"root_diagnostics_is_symlink":true,"marker_in_outside":true}
```

**Ist:** Der Markerpfad wird nach `mkdirSync` nicht mit `lstat`/Identitätsprüfung
gebunden.  
**Soll:** Bei Link/Reparse-Point oder Identitätswechsel keinen Marker schreiben;
die feste stderr-Zeile bleibt als letzter Kanal.  
**Auswirkung:** Ein lokaler Angreifer kann eine kleine inhaltsfreie JSON-Datei
außerhalb des vorgesehenen DataSecure-Baums überschreiben/anlegen lassen.  
**Zuordnung:** DS-071, BL-044.1.

### C-08 – P2: TOCTOU zwischen Ergebnisordnerprüfung und Export

**Stellen:** `plugins/data-secure/server/gateway/result-folder-config.js:131-143`,
`plugins/data-secure/server/gateway/result-export.js:90-98` und
`plugins/data-secure/server/gateway/result-export.js:158-168`.

Die Probe exportiert die interne Hilfsfunktion nur im Arbeitsspeicher; die
Repositorydatei wird nicht verändert.

```powershell
node -e 'const fs=require("fs"),os=require("os"),path=require("path"),Module=require("module");const file=path.resolve("plugins/data-secure/server/gateway/result-export.js");const src=fs.readFileSync(file,"utf8").replace("module.exports = { SCHEMA,", "module.exports = { ensurePlainDirectory, SCHEMA,");const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(src,file);const base=fs.mkdtempSync(path.join(os.tmpdir(),"ds-rc92-export-")),root=path.join(base,"root"),outside=path.join(base,"outside"),output=path.join(root,"DataSecure-Output");fs.mkdirSync(output,{recursive:true});fs.mkdirSync(outside);fs.rmSync(output,{recursive:true});fs.symlinkSync(outside,output,"junction");const made=m.exports.ensurePlainDirectory(output,"Lauf-20260903-120000-abcdef12");console.log(JSON.stringify({output_is_junction:fs.lstatSync(output).isSymbolicLink(),returned_under_lexical_output:path.dirname(made)===output,created_outside:fs.existsSync(path.join(outside,"Lauf-20260903-120000-abcdef12"))}));fs.rmSync(output);fs.rmSync(base,{recursive:true});'
```

Tatsächlich:

```json
{"output_is_junction":true,"returned_under_lexical_output":true,"created_outside":true}
```

**Ist:** `activeDestination` prüft `DataSecure-Output` einmal. Wird genau dieser
Ordner vor `ensurePlainDirectory` ersetzt, prüft die spätere Funktion nur den
neu erzeugten Laufordner, nicht erneut dessen Elternidentität.  
**Soll:** Zielwurzel und Output-Verzeichnis mit gebundener Identität/no-follow bis
zum atomaren Schreiben führen oder unmittelbar vor jedem Schreibschritt erneut
gegen die gespeicherte Identität prüfen.  
**Auswirkung:** Bereits anonymisierte, aber weiterhin geschäftliche Ergebnisse
können durch ein lokales Rennen außerhalb des bewusst gewählten Zielbaums
geschrieben werden.  
**Zuordnung:** DS-049, BL-044.1.

### C-09 – P3: Laufkennung ist über Support-MCP und Diagnoseexport sichtbar

**Stellen:** `plugins/data-secure/server/gateway/workflow-diagnostics.js:71-97`,
`plugins/data-secure/server/gateway/workflow-diagnostics.js:164-180`,
`plugins/data-secure/server/gateway/diagnostics.js:195-207`,
`plugins/data-secure/server/gateway/diagnostics.js:243-266` und
`plugins/data-secure/server/index.js:39-40`.

Reproduktion:

```powershell
node -e 'const fs=require("fs"),os=require("os"),path=require("path");const w=require("./plugins/data-secure/server/gateway/workflow-diagnostics");const {diagnosticStatus}=require("./plugins/data-secure/server/gateway/diagnostics");const root=fs.mkdtempSync(path.join(os.tmpdir(),"ds-rc92-runid-"));w.recordWorkflowEvent({run_id:"deadbeef",event:"mcp_start_response",outcome:"ok"},{dataRoot:root});const d=diagnosticStatus(1,{dataRoot:root});console.log(JSON.stringify({mcp_diagnostic_contains_run_id:d.workflow.events[0].run_id==="deadbeef",diagnostic_export_embeds_same_status:true}));fs.rmSync(root,{recursive:true});'
```

Tatsächlich:

```json
{"mcp_diagnostic_contains_run_id":true,"diagnostic_export_embeds_same_status":true}
```

**Ist:** Die Kennung ist korrekt zufällig und aus keinem Dokumentmerkmal
abgeleitet. Sie wird jedoch von `diagnostic_status` an den MCP-Aufrufer gegeben;
`export_diagnostic_package` bettet denselben Status in eine lokale Datei ein.
In Skills und normalen Ergebnisexporten wurde sie nicht gefunden.  
**Soll:** Entweder die Prüfvorgabe „nirgends in MCP-Antworten oder Exportdateien“
umsetzen, oder DS-071 ausdrücklich auf die beiden bestätigten Supportflächen
präzisieren. Aus Datenschutzsicht ist die zufällige Kennung selbst kein
personenbezogener Rohwert.  
**Auswirkung:** Kein erkannter Datenabfluss, aber eine überprüfbare Abweichung
zwischen erwarteter Reichweite und tatsächlicher Supportoberfläche.  
**Zuordnung:** DS-026, DS-071, BL-042.

## Bestätigte Korrektheit

### A1 – Residual-Gate und Laufzeit

Das unabhängige Wörterbuch-Gate erkennt einen absichtlich wieder in den
Kandidaten eingefügten bekannten Namen in drei Darstellungen:

```powershell
node -e 'const {scanResidual}=require("./plugins/data-secure/server/privacy/engine"); for(const text of ["Rest: Erika Beispiel bleibt.","Rest: **Erika Beispiel** bleibt.","Rest: Erika&nbsp;Beispiel bleibt."]){console.log(JSON.stringify({text,gate:scanResidual(text,"general",["Erika Beispiel"])}));}'
```

Alle drei Ausgaben enthalten `RESIDUAL_ENTITY: Erika Beispiel`. Damit ist der
unabhängige Wörterbuchkanal wirksam. C-01 bis C-03 zeigen zugleich Formen, in
denen Redaktor und strukturierter Gate-Kanal gemeinsam blind sind.

`node tests/test-pii-regression.js` bestand mit 110/110 Fällen. Darin bestand
auch der vorhandene lineare Langtext-/Titelketten-Test unter seinem Zwei-Sekunden-
Limit; ein exponentielles Verhalten wurde nicht beobachtet. Namen mit Partikeln,
Firmenbegriffe mit `von`/`de` und die vorhandenen Kontrollformen bestanden.

### A2 – Runtime-Prüfung und normale Startfehler

`node tests/test-startup-guard.js` bestand mit 6/6 Fällen. Die Prüfung lehnt eine
Größenabweichung vor dem Hashen ab, stoppt bei manipuliertem Programm und lässt
einen Quellcheckout mit Host-Node ohne fehlende Evidence-Datei zu. Ein
synthetisches `darwin-arm64`-Ziel mit passender ausführbarer Datei und Evidence
bestand. Die abschließende Programmdatei wird per `lstat` als Symlink abgelehnt
(`startup-guard.js:117-124`).

Das synchrone SHA-256 einer 86.997.320-Byte-Testlaufzeit dauerte auf diesem Host
in zwei Läufen rund 40 ms. Das ist hier unkritisch; langsame Datenträger sind
unter „nicht geprüft“ abgegrenzt.

`recordStartupRefusal` fängt Fehler seiner Journal- und Markerkanäle ab und
behält die feste stderr-Zeile als letzten Kanal. C-06 betrifft ausschließlich
Fehler, die schon beim Laden der Imports vor diesem Schutz auftreten.

### A3 – Erzeugung und Weitergabe von `run_id`

`newRunId` verwendet vier kryptografische Zufallsbytes und keine Pfade, Tokens,
Hashes, PIDs oder Dokumentdaten (`workflow-diagnostics.js:48-50`).
`node tests/test-batch-executor-startup.js` bestand mit 35/35 Fällen und belegt
die Weitergabe derselben Kennung innerhalb je eines Starts an Intake-, Batch-
und Review-Worker. Jeder neue Intake-, Batch- oder Review-Start erzeugt eine neue
Kennung (`batch-executor.js:253`, `:359`, `:557`); eine Fortsetzung ist damit ein
neuer Lauf mit neuer Kennung. DS-071 beschreibt zutreffend „pro Start“ und die
Stabilität zwischen Eltern- und Workerprozess. Die abweichende Sichtbarkeit ist
separat als C-09 dokumentiert.

### B1 – Staging und Löschung

Folgende vorhandene Negativtests bestanden:

- `node tests/test-result-folder-export.js` – PASS;
- `node tests/test-package-staging.js` – 24/24;
- `node tests/test-retention.js` – 25/25;
- `node tests/test-safe-private-tree.js` – 7/7.

Damit sind reguläre Pfadtraversal-, direkter und verschachtelter Link-,
Hardlink-/Austausch- sowie gebundene Löschfälle für Package-Staging und
`purge_local_data` abgedeckt. Die Löschung berührt bei Linkbefunden das externe
Ziel nicht. C-08 betrifft das engere Zeitfenster nach erfolgreicher Prüfung des
sichtbaren Ergebnisordners.

### B2 – vertagte Dokumente

Der Code lässt nur `status === 'released'` in einen Exportrecord und in die
Ergebnisliste (`result-export.js:102`, `batch-results.js:65-75`). Ein vertagtes
Item macht den Stapel ausdrücklich unvollständig (`batch-progress.js:97-112`),
wodurch es keinen Handoff-Kandidaten gibt (`batch-results.js:109-130`).

Ein synthetischer Zustand mit ausschließlich `deferred_review` ergab:

```json
{"results":[],"still_open":1,"batch_complete":false,"candidates":[],"package_reads":0,"grants":0}
```

Der defensive Exportaufruf desselben Zustands ergab `exported=0`, `pending=0`
und keine sichtbare Markdown-Datei. Zusätzlich bestanden:

- `node tests/test-batch-results.js` – 8/8;
- `node tests/test-local-only-handoff.js` – 27/27;
- `node tests/test-batch-continuation.js` – 10/10;
- `node tests/test-batch-review-state.js` – 5/5.

Damit wurde kein Pfad gefunden, über den ein vertagtes Item exportiert oder an
Claude übergeben wird.

### B3 – Skill-Aussagen gegen Engine und Tooloberfläche

Beide Skills und die referenzierten Profil-/Fehlerregeln wurden vollständig
gegen Engine, Result-Grade und MCP-Werkzeugliste gelesen. Bestätigt sind:

- Originale kommen nur über den lokalen Picker; `local_only` pollt oder liest
  danach nicht weiter.
- Der tokenfreie Handoff liefert höchstens fünf freigegebene Dokumente pro
  Aufruf.
- `complete` und `usable-with-omissions` samt festen Auslassungsangaben stimmen
  mit `document-result-grade.js` und `batch-result-projection.js` überein.
- Die Skills versprechen keine feste Nummer eines `PERSON_`-/`ORG_`-Tokens,
  sondern nur konsistente Beziehungserhaltung innerhalb des lokalen Laufs.
- Pixel zurückgehaltener Bilder sind über die produktive MCP-Werkzeugliste
  nicht lesbar. Legacy-interne Assetfunktionen sind nicht als Tool exponiert.
- Freigegeben werden nur TXT, Markdown, CSV und DOCX; andere Formate stoppen.

Außer C-04 wurde keine konkrete Skillbehauptung gefunden, die der Engine oder
der produktiven Tooloberfläche widerspricht.

### B4 – externe DOCX-Hyperlinks: Empfehlung

`plugins/data-secure/server/gateway/opc-source-validator.js:269-270` stoppt jede
OPC-Beziehung mit `TargetMode=External`; interne Hyperlinks bleiben erlaubt.
`node tests/test-source-opc-preflight.js` bestand mit 13/13 Fällen und bestätigt
beide Richtungen.

**Empfehlung für den Pilot:** Den fail-closed Stopp beibehalten und die
Einschränkung präzise in der Format-Coverage nennen. Das bloße Entfernen des
Linkziels bei Erhalt des sichtbaren Textes wäre erst nach einer eigenen,
strukturellen Rewrite-Implementierung vertretbar, die alle Beziehungsteile,
Felder, Alt-/Tooltip-Texte und die erneute Inhaltsprüfung abdeckt. Der aktuelle
Stopp verhindert externe Referenz-/Fetch-Risiken und unvollständig geprüfte
Metadaten und passt deshalb besser zu DS-007, DS-017 und DS-049. Das ist kein
Fehler der zugesagten DOCX-Abdeckung, sondern eine dokumentationspflichtige
Sicherheitsgrenze.

### B5 – Ursachen

Die beiden verlangten Ursachen sind durch C-01 und C-05 mit Datei und Zeile
belegt: `buildTableIndex` modelliert nur eine Kopfzeile; der Anschriftenregex
akzeptiert die harmlose Zeitphrase „Im Januar 1980“.

## Weitere bestandene zielnahe Tests

| Befehl | Ergebnis |
| --- | --- |
| `node tests/test-workflow-diagnostics.js` | 6/6 |
| `node tests/test-source-opc-preflight.js` | 13/13 |
| `node tests/test-batch-executor-startup.js` | 35/35 |
| `node tests/test-batch-results.js` | 8/8 |
| `node tests/test-local-only-handoff.js` | 27/27 |
| `node tests/test-batch-continuation.js` | 10/10 |
| `node tests/test-batch-review-state.js` | 5/5 |
| `node tests/test-pii-regression.js` | 110/110 |

Die Tests wurden einzeln lokal ausgeführt. Kein Build und keine vollständige
Produktsuite waren für den ausdrücklich zielgerichteten Read-only-Auftrag nötig.

## Nicht geprüft

- Tatsächlich gleichzeitiger Start zweier separater Serverprozesse gegen
  dieselbe Markerdatei. Zwei sequenzielle Schreibvorgänge hinterließen einen
  gültigen Marker und keine Tempdatei; das echte Rennen wurde nicht als
  Korrektheitsnachweis simuliert.
- Reale POSIX-Symlinks für die gebündelte Runtime auf macOS/Linux. Windows
  verweigerte das Anlegen eines Datei-Symlinks ohne erhöhte Rechte; der
  `lstat`-Ablehnungszweig wurde statisch geprüft, das synthetische macOS-Ziel als
  reguläre Datei dynamisch.
- Startdauer des Runtime-Hashings auf einem bewusst langsamen Datenträger und
  innerhalb eines echten Cowork-Hostzeitbudgets. Gemessen wurde nur der aktuelle
  lokale Host.
- Eine echte DOCX-Datei mit zusammengeführten Tabellenzellen und eine Zelle,
  deren **Wert** über mehrere OOXML-Absätze läuft. Die parsernahe `<br>`-Form und
  zweizeilige Markdown-Köpfe wurden synthetisch geprüft; zusammengeführte Zellen
  sind damit nicht als „ohne Befund“ bewertet.
- Native E1/E2/E3-UAT-Evidenz, Cowork-Kontocache und `claude plugin eval`; diese
  Punkte sind laut Auftrag ausdrücklich menschlich beziehungsweise außerhalb
  des Repositories.

## Schlussfolgerung und Reihenfolge

1. C-01 bis C-03 vor jeder Freigabe beheben und jeweils mit einem unabhängigen
   Residual-Gate-Negativtest absichern.
2. C-04 gemeinsam mit der bestehenden Titelkettenlogik korrigieren; C-05 als
   fachlichen Qualitätsschutz ergänzen.
3. C-06 bis C-08 als Start-/Pfadgrenzen schließen, ohne zusätzliche
   Anwenderdialoge einzuführen.
4. Für C-09 die Produktentscheidung explizit treffen: Support-Korrelation in
   Diagnoseflächen dokumentieren oder Kennung aus diesen Flächen entfernen.
5. Danach die zielnahen Tests sowie `test:product`, Dokumentationsgates und Build-
   Paketprüfungen vollständig erneut ausführen. Die menschliche UAT bleibt davon
   getrennt offen.
