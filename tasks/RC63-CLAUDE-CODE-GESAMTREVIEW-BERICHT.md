# Unabhängiges Gesamtreview RC63 – Bericht

**Auftrag:** `tasks/CLAUDE-CODE-AUFTRAG-RC63-GESAMTREVIEW.md` (Commit `6e95d81`)
**Geprüfter Stand:** `main` auf `6e95d81`, Produktversion `3.2.0-rc63`
**Datum:** 27.08.2026
**Rolle:** Gegenreview. Es wurde in diesem Auftrag **kein Produktfehler behoben.**

---

## 1. Ergebnis und erreichte Evidenzstufe

**Erreichte Evidenzstufe: E0.** Statische Analyse, Unit-/Integrations-/Vertrags-
und CLI-Tests, reproduzierbarer Build, synthetische Fixtures. **Keine E1/E2/E3-
Evidenz.** Es wurde keine Claude-Cowork-Sitzung, kein realer Dateidialog, keine
Accessibility-, Plattform- oder Security-Abnahme durchgeführt oder simuliert.

**Gesamturteil:** Der DS-045-Vertragskern (drei Grade, Paket-, Journal-,
Mapping-, Evidence- und Receipt-Bindung) ist sauber, fail-closed und dicht
getestet. Der Build ist bit-reproduzierbar. Die Cowork-Fassade, das Toolinventar
und die Skillgrenzen entsprechen dem Vertrag.

**Drei P1-Befunde blockieren die RC63-UAT jedoch, bevor sie beginnen kann:**

1. **DOCX ist im Pilot praktisch unbenutzbar.** Jede DOCX-Datei mit den
   Standard-OPC-Kernmetadaten – also die normale Ausgabe von Microsoft Word,
   LibreOffice und `python-docx` – wird als „aktiver Inhalt" sicher gestoppt.
   Fehlerrichtung ist Über-Blockade, kein Datenschutzbruch.
2. **Ein Pflichttest schlägt fehl.** `node tests/test-batch-session.js` und damit
   `npm test` brechen ab, weil eine benötigte Testhilfsdatei nicht im Repository
   liegt. Die behauptete E0-Crash-Recovery-Regressionsevidenz ist aus dem
   Repository nicht reproduzierbar.
3. **Positive Ergebnisgrade werden bei vorhandenem durablem Receipt nicht mehr
   gegen das gebundene Paket verifiziert** – entgegen dem eigenen kanonischen
   Vertrag `RESULT_GRADES_V1.md`.

Zusätzlich ist das RC63-UAT-Paket in der vorliegenden Form nicht ausführbar (P2):
es verweist auf Eingangsverzeichnisse, die es nicht gibt, und nennt den Generator
nicht, der sie erzeugt.

**Abweichung vom Auftragsstand (Auftrag §4.4):** Der Auftrag nennt `26ce0fb` als
Ausgangsstand. Tatsächlich ist `main` bei `6e95d81`; dieser Commit fügt
ausschließlich die Auftragsdatei selbst hinzu und ändert kein Produkt- oder
Testartefakt. Der geprüfte Produktstand ist damit inhaltlich `26ce0fb`/RC63.
`git status --short` war beim Start und beim Abschluss leer.

---

## 2. Findings

Prioritäten nach Auftrag §11. Reihenfolge: P1 → P3. **Keine P0-Findings.** Es
wurde kein Weg gefunden, auf dem Rohbytes, Quellpfade, Originaldateinamen,
Dokument-Hashes, Aktionstoken, Paket-IDs, Capabilities oder Cursor an Claude
gelangen, und kein Weg zu einer Unter-Redaktion oder zu einer Mutation oder
Löschung einer Originalquelle.

---

### P1-1 · DOCX mit Standard-OPC-Kernmetadaten wird als „aktiver Inhalt" gestoppt

| Feld | Inhalt |
|---|---|
| **Story** | BL-049.1 (Inhalts- und Formatgrenze, Source-Preflight); angrenzend BL-022.1 (DOCX-Interoperabilität) |
| **Entscheidung** | DS-049, DS-007, DS-017; Auftrag §3.7 (TXT, Markdown, CSV, DOCX sind im Pilot freigegeben) |
| **Fundstelle** | `plugins/data-secure/server/gateway/opc-source-validator.js:214`, Funktion `validateOpcControls` |

**Ist.** Der Beziehungstyp jeder OPC-Relationship wird gegen das nicht verankerte
Teilstringmuster
`/(?:oleobject|package|attachedtemplate|externalLink|hyperlink|vbaProject|customUI|activeX)/iu`
geprüft. Jeder Standard-OPC-Beziehungstyp liegt im Namensraum
`http://schemas.openxmlformats.org/package/2006/relationships/…` und enthält
damit das Teilstring `package`. Folge:

```
Beziehungstyp in _rels/.rels                                    Verdikt
--------------------------------------------------------------  ------------------------------------
package/2006/relationships/metadata/core-properties             SOURCE_ACTIVE_CONTENT_UNSUPPORTED
package/2006/relationships/metadata/thumbnail                   SOURCE_ACTIVE_CONTENT_UNSUPPORTED
package/2006/relationships/digital-signature/origin             SOURCE_ACTIVE_CONTENT_UNSUPPORTED
officeDocument/2006/relationships/extended-properties           SOURCE_FORMAT_CANDIDATE
officeDocument/2006/relationships/custom-properties             SOURCE_FORMAT_CANDIDATE
officeDocument/2006/relationships/hyperlink (interner Target)    SOURCE_ACTIVE_CONTENT_UNSUPPORTED
officeDocument/2006/relationships/package   (echtes OLE)        SOURCE_ACTIVE_CONTENT_UNSUPPORTED
officeDocument/2006/relationships/oleObject (echtes OLE)        SOURCE_ACTIVE_CONTENT_UNSUPPORTED
```

Praktisch jede von Word, LibreOffice oder `python-docx` erzeugte DOCX-Datei führt
eine `core-properties`-Beziehung. Sie wird deshalb vor jeder privaten Kopie
terminal gestoppt.

**Soll.** `core-properties`, `extended-properties`, `thumbnail` und
`digital-signature` sind Paketmetadaten, kein aktiver Inhalt. Sie müssen
`candidate` / `SOURCE_FORMAT_CANDIDATE` ergeben. Die beabsichtigten Sperren
(`officeDocument/2006/relationships/package`, `oleObject`, `vbaProject`,
`attachedTemplate`, `customUI`, `activeX`, jede Beziehung mit
`TargetMode="external"`) müssen unverändert greifen.

**Reproduktion** (rein synthetisch, zwei minimale DOCX-Pakete, deren einziger
Unterschied die `core-properties`-Beziehung ist):

```bash
node -e '
const fs=require("fs"),os=require("os"),path=require("path");
const {inspectSourceFormatFromFd}=require("./plugins/data-secure/server/gateway/source-format-inspector");
const {zipStore}=require("./tests/lib/zip");
const CT=`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const OFF="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const CORE="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ds-opc-"));
for (const [label,extra,part] of [["ohne core-properties","",null],["mit  core-properties",`<Relationship Id="rId2" Type="${CORE}" Target="docProps/core.xml"/>`,"docProps/core.xml"]]) {
  const rels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OFF}" Target="word/document.xml"/>${extra}</Relationships>`;
  const entries=[["[Content_Types].xml",CT],["_rels/.rels",rels],["word/document.xml",`<w:document xmlns:w="urn:test"><w:body/></w:document>`]];
  if (part) entries.push([part,"<x/>"]);
  const f=path.join(dir,"probe.docx"); fs.writeFileSync(f,zipStore(entries));
  const st=fs.lstatSync(f), fd=fs.openSync(f,fs.constants.O_RDONLY);
  try { const r=inspectSourceFormatFromFd(fd,st,".docx"); console.log(label,"->",r.verdict,"/",r.code); } finally { fs.closeSync(fd); }
}
fs.rmSync(dir,{recursive:true,force:true});'
```

Beobachtetes Ergebnis:

```
ohne core-properties -> candidate / SOURCE_FORMAT_CANDIDATE
mit  core-properties -> rejected  / SOURCE_ACTIVE_CONTENT_UNSUPPORTED
```

Gegenprobe mit einer realistischen synthetischen DOCX aus dem eingecheckten
Generator (`generate_synthetic_acceptance_data.py`, in einem temporären Verzeichnis
ausgeführt): `01-positive/personnel-profile.docx` und
`02-review/personnel-profile-with-image.docx` ergeben beide
`stopped / SOURCE_ACTIVE_CONTENT_UNSUPPORTED`.

**Auswirkung.**

- **UX/Funktion:** DOCX ist ein freigegebenes Pilotformat, wird aber im Normalfall
  terminal gestoppt. Der dokumentierte Normalweg ist blockiert.
- **UAT:** `UAT-02` („vier lokale Zuordnungen und vier anonymisierte
  Markdown-Ergebnisse") ist nicht erfüllbar; das Ist wäre 3 freigegeben /
  1 gestoppt. `UAT-03` würde formal über den Zweig „oder sicher gestoppt"
  bestehen, aber **inhaltsleer**: es prüft dann den Containerpfad statt des
  visuellen Auslassungsvertrags, für den es geschrieben wurde.
- **Datenschutz:** keine Verschlechterung. Die Fehlerrichtung ist Über-Blockade
  (Auftrag §3.5); es wird kein Identifikator durchgelassen und keine private
  Kopie erzeugt.

**Vermutete Ursache (Analyse).** Gemeint war offenkundig die OLE-Beziehung
`http://schemas.openxmlformats.org/officeDocument/2006/relationships/package`.
Das Muster ist jedoch unverankert und wird gegen die vollständige Typ-URI
angewandt, sodass es zusätzlich den gesamten OPC-Paketnamensraum trifft.

**Fehlender Regressionstest.** Alle OPC-Testfixtures entstehen aus
`tests/lib/opc.js:opcControlEntries`, dessen `_rels/.rels` **ausschließlich** die
`officeDocument`-Beziehung enthält. Kein Fixture entspricht einer realen
Office-Datei. Nötig ist erstens ein positives DOCX-Fixture mit
`metadata/core-properties`, `extended-properties` und `metadata/thumbnail`
(Erwartung: `candidate`), zweitens ein Negativfixture mit
`officeDocument/2006/relationships/package` (Erwartung: weiterhin
`SOURCE_ACTIVE_CONTENT_UNSUPPORTED`).

**Zusätzlich vom Product Owner zu entscheiden:** `hyperlink` steht ebenfalls im
Muster. Externe Ziele sind bereits durch die `TargetMode="external"`-Prüfung in
Zeile 211 abgedeckt; der Musterterm sperrt darüber hinaus jede DOCX mit einer
gewöhnlichen internen Hyperlink-Beziehung. Das ist entweder gewollt und dann zu
dokumentieren oder mit demselben Fix zu präzisieren.

**Folgeauftrag:** `tasks/CLAUDE-CODE-FOLGEAUFTRAG-P1-OPC-PAKETMETADATEN.md`

---

### P1-2 · Pflichttest `tests/test-batch-session.js` und `npm test` schlagen fehl – Crash-Worker-Fixture fehlt im Repository

| Feld | Inhalt |
|---|---|
| **Story** | BL-011.7 (sicherer Abbruch und explizites Resume sind regressionsgetestet); angrenzend BL-011.11, BL-050.3 |
| **Entscheidung** | DS-021, DS-043; `BACKLOG.md` „Definition of Done" |
| **Fundstelle** | `tests/test-batch-session.js:85` (`fork(path.join(__dirname,'fixtures','crash-batch-worker.js'))`); Ursache in `.gitignore:32` (`/tests/fixtures/`) |

**Ist.** `tests/fixtures/crash-batch-worker.js` existiert nicht. Es ist
nirgends im Repository vorhanden, wurde in der gesamten Historie nie committet
(`git log --all -- tests/fixtures/crash-batch-worker.js` ist leer) und wird von
`tests/make-fixtures.js` nicht erzeugt. `fork()` auf eine fehlende Datei beendet
das Kind mit Exitcode 1; der Test erwartet den Sentinel-Exitcode 17.

**Soll.** `node tests/test-batch-session.js` und `npm test` laufen auf einem
frischen Clone mit Exitcode 0 durch; der Crashfall belegt reproduzierbar
Recovery ohne Doppelfreigabe.

**Reproduktion** (frischer Clone, keine lokalen Artefakte):

```bash
git clone https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure.git ds-fresh && cd ds-fresh && npm ci && node tests/test-batch-session.js
```

Beobachtet:

```
FAIL real worker crashes at positions 1, 50 and 100 recover without duplicate release
     worker must crash at global item 1
     1 !== 17
Server-bound batch session: 66 passed, 1 failed
```

Exitcode 1 nach 196 s. `npm test` bricht mit derselben einzelnen Zusicherung ab
(Exitcode 1 nach 304 s).

**Auswirkung.**

- Zwei Pflichtbefehle des Auftrags §9 sind rot.
- Die für BL-011.7/BL-011.11 beanspruchte E0-Evidenz „sicherer Abbruch und
  explizites Resume sind regressionsgetestet" ist aus dem Repository **nicht
  reproduzierbar**. Der 66 von 67 grünen Tests umfassende Rest deckt Crash und
  Wiederanlauf des echten detachierten Workers gerade nicht ab.
- Kein Datenschutz-, Durability- oder Laufzeitverhalten des Produkts ist
  betroffen; der Produktcode wurde durch diesen Befund nicht widerlegt, er ist an
  dieser Stelle lediglich unbelegt.

**Vermutete Ursache (Analyse).** `.gitignore` schließt das gesamte Verzeichnis
`/tests/fixtures/` aus, weil dort generierte Binärfixtures liegen. Der
Crash-Worker ist aber Testquellcode, keine generierte Datei, und wurde durch
diese Pauschalregel stillschweigend mit ausgeschlossen. Die einzige heute
getrackte Datei in diesem Verzeichnis
(`tests/fixtures/synthetic-personnel-profile.md`) wurde erzwungen hinzugefügt –
ein Hinweis darauf, dass die Regel bereits einmal im Weg stand.

**Fehlender Regressionstest / Absicherung.** Ein Vertragstest, der prüft, dass
jede von einem Test per `fork()`/`spawn()` referenzierte Hilfsdatei tatsächlich im
Arbeitsbaum existiert und von Git getrackt ist. Ohne diese Absicherung kann
derselbe Fehler jederzeit erneut entstehen.

**Folgeauftrag:** `tasks/CLAUDE-CODE-FOLGEAUFTRAG-P1-CRASH-WORKER-FIXTURE.md`

---

### P1-3 · Positiver Ergebnisgrad wird bei vorhandenem durablem Receipt nicht erneut gegen das gebundene Paket verifiziert

| Feld | Inhalt |
|---|---|
| **Story** | BL-049.1 (RC63-Ergebnisprojektion); angrenzend BL-050.3 |
| **Entscheidung** | DS-045; kanonischer Vertrag `docs/canonical/contracts/RESULT_GRADES_V1.md`, Abschnitt „Progress-, Results-, Abschluss- und Cowork-Projektion" |
| **Fundstelle** | `plugins/data-secure/server/gateway/batch-progress.js:122` und `:134`, Funktion `publicProgress`; mitverursachend `batch-result-projection.js:39` (`positivePackageMatches`) und `batch-terminal-evidence.js:63` (`exportedMarkerMatchesState`) |

**Ist.** Sobald `state.terminal_evidence.status === 'exported'` ist, projiziert
`publicProgress` die Gradzähler aus dem durablen Marker. Die dafür verwendete
Gegenprobe in Zeile 122 ruft `projectBatchResults(state)` **ohne** `verifyPositive`
auf; `positivePackageMatches` gibt dann ohne Prüfung `true` zurück. Der
paketverifizierende Zweig in Zeile 134 wird durch `durableProjection || …`
kurzgeschlossen und nie erreicht. Es findet **kein einziger Paketzugriff** statt.

**Soll.** `RESULT_GRADES_V1.md`: „Terminale V2-Stapel werden vor der öffentlichen
Zählung erneut gegen jedes veröffentlichte V3-Paket gebunden." Auftrag §5: „Ein
positiver Grad wird unmittelbar vor Progress, Abschluss, Results und
Cowork-Handoff erneut gegen das gebundene Paket verifiziert." Ein nicht mehr
verifizierbares Paket muss `unavailable` und `grades_verified: false` ergeben.

**Reproduktion** (rein synthetischer In-Memory-Zustand, keine Dateien):

```bash
node -e '
const {createBatchProgress}=require("./plugins/data-secure/server/gateway/batch-progress");
const {evidenceRecord}=require("./plugins/data-secure/server/gateway/batch-evidence");
const {releasedDocumentResult}=require("./plugins/data-secure/server/gateway/document-result-grade");
const dr=releasedDocumentResult({parserWarnings:[],visualResults:[],unreviewedVisualCount:0,imagesRemovedByExplicitRequest:0});
const state={schema:"datasecure-batch/2",token:"9".repeat(64),created_at:"2026-08-27T08:00:00.000Z",profile:"general",remove_images:false,
  items:[{status:"released",package_id:"ds_"+"8".repeat(32),document_result:dr}]};
const id="7".repeat(32);
// Receipt entsteht regulaer, waehrend das Paket noch verifiziert:
const record=evidenceRecord(state,"2026-08-27T08:01:00.000Z",id,{publishedPackageRecord:()=>({state:"verified",document_result:dr})});
state.terminal_evidence={schema:"datasecure-batch-terminal-evidence/2",status:"exported",receipt_id:id,record};
// Danach ist das gebundene Paket verschwunden oder veraendert:
let lookups=0;
const f=createBatchProgress({deliveryPendingStatus:"delivery_pending",deferredReviewStatus:"deferred_review",
  mappingPendingStatus:"mapping_pending",liveLocalExecutor:()=>false,
  publishedPackageRecord:()=>{lookups++;return{state:"missing",document_result:null};}});
const p=f.publicProgress(state);
console.log("Paketzugriffe        :",lookups);
console.log("result_grades_verified:",p.result_grades_verified);
console.log("result_grade_counts  :",JSON.stringify(p.result_grade_counts));
console.log("user_status          :",p.user_status);'
```

Beobachtet:

```
Paketzugriffe        : 0
result_grades_verified: true
result_grade_counts  : {"complete":1,"usable_with_omissions":0,"not_processed":0,"unavailable":0}
user_status          : Stapel abgeschlossen: 1 vollständig verarbeitet, 0 mit Auslassungen verwendbar, 0 sicher nicht verarbeitet.
```

Soll: `grades_verified: false`, `unavailable: 1`, `complete: 0`.

**Auswirkung.**

- Betroffen sind drei der vier vom Auftrag genannten Flächen, weil alle den
  Wert aus `publicProgress` weiterreichen:
  `companion/completion-summary.js:88,259` (lokale Abschlussanzeige),
  `gateway/local-only-handoff.js:52-68` über
  `gateway/batch-results.js:121-131` (Cowork-Handoff-Kandidat) und
  `server/index.js:152` (Cowork-Statusantwort).
- **Results bleibt korrekt:** `batch-results.js:22` (`verifiedResultPackage`)
  prüft jedes Paket einzeln und wirft `„Ein freigegebenes Ergebnis konnte nicht
  sicher verifiziert werden."`. Auch `package-store.js:79` (`readOutput`) prüft
  Manifest, Dokument-SHA-256 und Grad erneut.
- **Kein Rohdatenabfluss und keine falsche Inhaltsfreigabe.** Der Schaden ist eine
  falsche Vollständigkeitsaussage in Fortschritt, Abschlussmeldung und
  Kandidatenliste. Realistischer Auslöser ist keine Manipulation, sondern der
  Normalfall, dass Exporte nach Abschluss verschoben oder gelöscht werden
  (DS-023 erlaubt das ausdrücklich).
- Ein manipulierter Checkpoint (Marker plus passende Itemzustände) erzeugt auf
  demselben Weg positive Gradzähler. Das setzt Schreibrechte im privaten
  Benutzerbereich voraus und fällt heute in die offene Story BL-011.13; es ist
  deshalb kein eigener Befund, verschärft aber die Bewertung.

**Vermutete Ursache (Analyse).** Bewusster Performance-Kompromiss – die
Codekommentare sagen „Package hashing is deliberately restricted to the terminal
boundary" (`batch-progress.js:113`) und „Package-bound result verification happens
exactly once while the durable evidence record is created."
(`batch-terminal-evidence.js:53`). Auftrag §6 zählt „wiederholte Paketprüfung"
tatsächlich als Performance-Geruch auf. Der kanonische Vertrag verlangt an dieser
Stelle jedoch ausdrücklich die erneute Bindung vor der öffentlichen Zählung, und
DS-057 stellt Maschinenverträge über eine Implementierungsoptimierung. Die
Auflösung des Konflikts ist eine Product-Owner-Entscheidung; als billige Variante
kommt eine Identitätsbindung (dev/ino/size/mtime des Manifests und Dokuments)
statt eines erneuten Voll-Hashes in Frage.

**Fehlender Regressionstest.** `publicProgress` mit exportiertem Marker und einem
`publishedPackageRecord`, der `missing` beziehungsweise `unsafe` liefert, muss
`grades_verified: false` und `unavailable` ergeben. Achtung: der heute bestehende
Test `tests/test-batch-user-status.js:74` („durable terminal grades avoid package
reopens…") zementiert mit `assert.strictEqual(packageReads, 0)` genau das
Gegenteil und muss mit derselben Entscheidung ersetzt werden. Zusätzlich sollte
`batch-result-projection.js:39` fail-closed werden: ein fehlender Verifizierer
darf nicht `true` bedeuten.

**Folgeauftrag:** `tasks/CLAUDE-CODE-FOLGEAUFTRAG-P1-GRADE-PAKETBINDUNG.md`

---

### P2-1 · RC63-UAT-Paket ist wie dokumentiert nicht ausführbar

| Feld | Inhalt |
|---|---|
| **Story** | BL-052.1/BL-052.3 (menschliche Abnahme) und BL-049.1 (Nachweis der Ergebnisgrade) |
| **Entscheidung** | DS-056; Auftrag §8 |
| **Fundstelle** | `docs/acceptance/RC63_UAT_TEST_KIT/README.md:12-20`, `STEP-BY-STEP.md:22,35,53,70,80,92`, `EXPECTED_RESULTS.csv` Spalte `input_group`; Generator `docs/acceptance/RC30_HUMAN_TEST_KIT/tools/generate_synthetic_acceptance_data.py:15-16,48-52` |

**Ist.** `README.md` führt unter „Inhalt" vier Eingangsverzeichnisse
`inputs/01-positive`, `inputs/02-review`, `inputs/03-blocked`,
`inputs/04-batch-100` auf, und `STEP-BY-STEP.md` verweist an sechs Stellen auf
konkrete Pfade darunter. Diese Verzeichnisse existieren nicht; Commit `26ce0fb`
fügt ausschließlich die vier Dokumentdateien hinzu. Kein Dokument des Pakets
nennt den Generator oder einen Befehl, mit dem die Eingänge entstehen.

Der eingecheckte Generator legt seine Ausgabe zudem unter einem anderen Namen und
an einem anderen Ort ab:
`docs/acceptance/RC30_HUMAN_TEST_KIT/test-data/generated/<gruppe>/` statt
`inputs/<gruppe>/`.

Weitere Ausführungshürden desselben Pakets:

- Der Generator hat **keine Option für ein Ausgabeverzeichnis**. `OUT` ist auf
  einen Pfad im Repository festgenagelt, und `clean_output()` führt darauf
  `shutil.rmtree` aus. Auftrag §8 („Führe den Generator in einem ausdrücklich
  angelegten temporären Verzeichnis aus") ist mit dem Skript nicht erfüllbar.
  Für dieses Review wurde deshalb die Verzeichnisstruktur in ein temporäres
  Verzeichnis nachgebaut, damit `Path(__file__).parents[…]` dort auflöst.
- Der Generator benötigt `python-docx` (`from docx import Document`). Die
  Abhängigkeit ist nirgends dokumentiert, nicht gepinnt und war auf der
  Prüfmaschine (Python 3.14.7) nicht installiert.
- Der Generator liest `tests/fixtures/synthetic_scan.png`. Diese Datei entsteht
  erst durch `npm run fixtures`; das steht in keiner UAT-Anleitung.
- `EVIDENCE_LOG.csv` ist in Spalte `build_commit` mit `d66aae5` vorbelegt,
  obwohl das UAT-Paket erst mit `26ce0fb` ausgeliefert wird. Die Spalte sollte
  leer bleiben, damit die Prüfperson den tatsächlich getesteten Commit einträgt.

**Soll.** Die Anleitung benennt genau einen ausführbaren Weg zu den 111
Eingängen – Befehl, Ausgabeverzeichnis, Abhängigkeiten und Vorbedingungen – und
alle Pfadangaben in `README.md`, `STEP-BY-STEP.md` und `EXPECTED_RESULTS.csv`
stimmen mit dem tatsächlichen Ergebnis dieses Befehls überein.

**Reproduktion.**

```bash
ls docs/acceptance/RC63_UAT_TEST_KIT          # kein inputs/
grep -rn "inputs/" docs/acceptance/RC63_UAT_TEST_KIT
grep -rn "generate_synthetic_acceptance_data\|test-data/generated" docs/acceptance/RC63_UAT_TEST_KIT
git show --stat 26ce0fb
```

**Auswirkung.** Eine Prüfperson kann die RC63-UAT nicht starten. Die
Sollwertprüfung selbst ist davon nicht betroffen (siehe Abschnitt 7); es fehlt
ausschließlich der Weg zu den Eingängen. Kein Datenschutzbezug.

**Vermutete Ursache (Analyse).** Das UAT-Paket wurde als reines Dokumentcommit
nachgezogen, ohne den älteren RC30-Generator anzupassen oder zu verlinken. Die
binären Office-/PDF-Testdateien dürfen laut Auftrag §8 zu Recht nicht in Git
liegen – genau deshalb muss ihre Erzeugung aber Teil der Anleitung sein.

**Fehlender Regressionstest.** Ein Dokumentvertragstest, der jeden im
RC63-UAT-Paket erwähnten Eingangspfad gegen die tatsächliche Ausgabestruktur des
Generators prüft (analog zu `scripts/verify-canonical-docs.mjs`).

---

### P3-1 · Release-Checkliste verlässt sich auf einen Exitcode, den `claude plugin validate` nicht liefert

| Feld | Inhalt |
|---|---|
| **Story** | BL-051.1/BL-051.2 (Installations- und Hostabnahme) |
| **Entscheidung** | DS-031, DS-053 |
| **Fundstelle** | `docs/RELEASE.md:65-66` |

**Ist.** `docs/RELEASE.md` führt `claude plugin validate ./plugins/data-secure
--strict` und `claude plugin validate . --strict` als Freigabegate. Die
installierte CLI 2.1.233 gibt bei einem Validierungsfehler zwar `✘ Validation
failed` aus, beendet sich aber mit **Exitcode 0**. Nachweis auf demselben Stand:

```
$ claude plugin validate dist/DataSecure-Privacy-Preflight-v3.2.0-rc63.zip
✘ Found 1 error:
  ❯ json: Invalid JSON syntax: JSON Parse error: Unexpected identifier "PK"
✘ Validation failed
$ echo $?
0
```

**Soll.** Das Gate erkennt ein Fehlschlagen unabhängig vom Exitcode, zum Beispiel
durch Prüfung der Ausgabe auf `Validation passed`.

**Auswirkung.** Solange die Checkliste von einem Menschen gelesen wird, ist der
Fehler sichtbar. Wird das Gate je automatisiert, entstünde ein stiller
Falsch-Positiv. Dies ist eine Eigenschaft der externen CLI, kein Produktfehler
von DataSecure. `docs/TESTING.md:344` ist korrekt formuliert (es bezieht sich auf
den *entpackten* ZIP-Ordner); nur der ZIP selbst ist kein gültiges
`validate`-Ziel.

---

### P3-2 · Zwei unterschiedliche Sortierungen derselben Auslassungscodes

| Feld | Inhalt |
|---|---|
| **Story** | BL-049.1 |
| **Entscheidung** | DS-045 |
| **Fundstelle** | `plugins/data-secure/server/gateway/document-result-grade.js:92` gegen `:112` |

**Ist.** `validateDocumentResult` prüft die Reihenfolge mit
`[...seen].sort()` (UTF-16-Codeeinheiten), `immutableResult` erzeugt sie mit
`.sort((l,r) => l.code.localeCompare(r.code))`. Bei den heutigen zwei
ASCII-Grosschreibungs-Codes stimmen beide Ordnungen überein, der Befund ist
derzeit wirkungslos.

**Soll.** Eine Sortierfunktion für beide Seiten, damit ein künftiger dritter
Auslassungscode nicht in einer gebauten und gleichzeitig ungültigen Struktur
enden kann. `localeCompare` ist zusätzlich laufzeit- und ICU-abhängig und in einem
Vertragspfad die schlechtere Wahl.

**Auswirkung.** Wartbarkeit; kein falsches Produktverhalten im heutigen Stand.

**Fehlender Regressionstest.** Ein Test, der `immutableResult` und
`validateDocumentResult` über die vollständige Potenzmenge der Auslassungscodes
auf identische Ordnung prüft.

---

## 3. Review der fünf Schwerpunktcommits

Geprüft wurden die Diffs **und** der heutige Datenfluss von der lokalen Quelle bis
zur Cowork-Antwort sowie von Recovery-/Legacy-Daten bis zur Ergebnisprojektion.

### `0c7b8ba` – kanonischer Vertrag für drei Dokument-Ergebnisgrade

Führt `document-result-grade.js`, den Vertrag
`docs/canonical/contracts/RESULT_GRADES_V1.md` und `eu-privacy-package/3` ein.

Adversarial geprüft und **in Ordnung**:

- Die Grade sind exakt `complete`, `usable-with-omissions`, `not-processed`
  (`GRADES`, `Object.freeze`). Interne Zustände sind keine Grade.
- `validateDocumentResult` erzwingt exakte Schlüsselmengen über
  `Object.keys().sort().join(',')`, verbietet damit Zusatzfelder und lehnt
  Prototypenverschmutzung ab. `Object.hasOwn(counts, status)` in
  `releasedDocumentResult:134` verhindert, dass `__proto__` oder `toString` als
  Visualstatus durchgeht.
- Die einzigen erlaubten Auslassungen sind `IMAGES_REMOVED_BY_REQUEST` und
  `VISUAL_ASSETS_WITHHELD_LOCALLY`; Zähler sind auf `1 … MAX_VISUAL_ASSETS`
  (150) begrenzt und dürfen sich nicht doppeln.
- `releasedDocumentResult` verlangt `parserWarnings.length === 0` und
  `unreviewedVisualCount === 0`. Parserunsicherheit, unentschiedene Visuals und
  widersprüchliche Zähler (`counts.removed !== explicitlyRemoved`,
  `withheldAtRelease < counts.review_required`) werfen. Das ist fail-closed und
  entspricht Auftrag §5.
- Type-Coercion geprüft: `Number(x || 0)` in Zeile 123-124 kann `[]`, `null`,
  `false` oder `""` zu `0` verrechnen. Das Ergebnis ist in jedem Fall der
  **sichere** Wert; jeder von Null verschiedene Wert wirft. Kein Gewinn für einen
  Angreifer, kein Befund.
- `validateManifestDocumentResult` rechnet den Grad aus den Manifestsignalen neu
  und vergleicht ihn mit dem gespeicherten Grad. Ein manipuliertes Manifest
  macht das Paket ungültig statt es aufzuwerten
  (`package-store.js:57-59` → `SafeError`).

Befund aus diesem Commit: **P3-2**.

### `556ae9a` – dauerhafte Bindung der Grade an Pakete, Journal und Mapping

- `batch-journal-store.js:validV2ItemResult` erzwingt: positiver Grad nur bei
  `mapping_pending`, `delivery_pending` oder `released` **mit** gültiger
  `ds_<32 hex>`-Paket-ID; `not-processed` nur bei `stopped`/
  `preflight_mapping_pending` **mit** `reason_code === error_code` und **ohne**
  `package_id`; offene, laufende, vertagte und wiederholbare Zustände dürfen
  überhaupt kein `document_result` besitzen. Ein Journal, das das verletzt, wird
  beim Lesen als `INVALID` verworfen. Das deckt Auftrag §5 („Legacy- oder nicht
  beweisbare Zustände bleiben `unavailable`") auf der Persistenzebene sauber ab.
- `batch-reconciliation.js:markMappingPending` weist einen Grad ausdrücklich ab,
  wenn das veröffentlichte Paket keinen trägt („Ein historisches Paket darf
  keinen nachträglich erfundenen Ergebnisgrad erhalten"). `publishedPackageRecord`
  prüft `lstat` gegen Symlinks, Manifestschema, Paket-ID, Dokumentnamen und
  vergleicht den vollständigen Dokument-SHA-256.
- Der Mapping-Header ist auf die sechs Spalten des Vertrags erweitert
  (`mapping.js:18`), der Legacy-Header bleibt lesbar migrierbar mit fester
  Anzeige „Ergebnisgrad für älteres Paket nicht verfügbar" (`:31`).
- Gegengeprüft: der Mapping-Export ist über **kein** MCP-Werkzeug lesbar.
  `roots().exports` wird nur von Evidence, Diagnose und Mapping selbst
  beschrieben; `open_export_folder` öffnet ausschließlich den
  Betriebssystem-Dateimanager (`index.js:186`). DS-024/DS-058 erfüllt.

Keine Befunde aus diesem Commit.

### `feb27a0` – Bindung der Grade an Evidence und Audit-Receipt

- `batch-evidence.js:aggregateDocumentResults:65-67` **erzwingt** einen
  Paketverifizierer und wirft ohne ihn. Jeder positive Grad wird vor dem
  Nachweisexport gegen das verifizierte V3-Paket geprüft. Das ist die Stelle, an
  der die Paketbindung tatsächlich stattfindet.
- `validateEvidenceRecord` erzwingt Kreuzsummen: Gradzähler = `counts.total`,
  `complete + usable_with_omissions = released`, `not_processed = stopped`,
  `unavailable = retryable + pending`, und für `datasecure-batch/1` sind alle
  positiven Zähler auf 0 festgenagelt. Ein manipulierter Zähler ergibt kein
  gültiges Receipt.
- `data-secure-audit-receipt/4` (`audit.js:17`) trägt denselben positiven Grad;
  `not-processed` erzeugt ohne Paket kein Receipt.
- Reason-Codes stammen aus einem endlichen Katalog;
  `normalizeDocumentResultReasonCode` vergröbert Unbekanntes zu
  `INTERNAL_FAILURE`. Freitext ist im Schema nicht darstellbar.

Keine Befunde aus diesem Commit.

### `d66aae5` – erneute Paketprüfung und Projektion in Progress, Abschluss, Results und Cowork-Handoff

- `batch-result-projection.js` ist eine reine, fail-closed Projektion: leere
  Itemliste, `datasecure-batch/1` und jedes unbekannte Schema ergeben
  `unavailable`; jede Ausnahme im Schleifenkörper fällt auf `unavailable`
  zurück; eine Summenprüfung (`sum !== items.length`) fängt Zählerdrift.
- `publicProgress` projiziert ausschließlich bei `complete` und setzt sonst alle
  Grade auf `unavailable` – laufende Zustände werden nie hochgestuft.
- `publicPositiveDocumentResult` liefert nur `complete` und
  `usable-with-omissions` samt fester deutscher Anzeige und wirft bei
  `not-processed`.
- Der Cowork-Handoff ist eng gefasst: `local-only-handoff.js:publicBatchSummary`
  prüft Schlüsselmengen, Nichtnegativität, Gesamtsumme **und** ein Kreuzprodukt
  gegen `released`/`stopped` und wirft sonst
  `LOCAL_HANDOFF_VERIFICATION_FAILED`. Die Stapelübersicht erscheint nur auf der
  ersten Seite (`session.initial`).

Befund aus diesem Commit: **P1-3**.

### `26ce0fb` – RC63-UAT-Anleitung, Sollmatrix und inhaltsfreie Evidenzvorlage

Befund: **P2-1**. Inhaltlich ist die Sollmatrix bis auf die Pfadangaben korrekt
(siehe Abschnitt 7).

### Datenfluss-Gegenprobe über die Commitgrenzen hinweg

Verfolgt wurde: lokale Auswahl → `validateBatchLimits` → `planBatchAdmission`
(mutationsfrei) → privater Snapshot → Verarbeitung → atomare Veröffentlichung →
Mapping → Journal → Evidence/Receipt → Projektion → Cowork-Antwort, und
zusätzlich Recovery- und Legacy-Eintritt in dieselbe Projektion.

Positiv bestätigt:

- Die Einzeldateigrenzen greifen **vor** dem Formatpreflight
  (`batch-intake.js:102` vor `:134`). Eine 500-MiB-`.txt` wird nicht erst
  vollständig UTF-8-validiert.
- `planBatchAdmission` bindet jeden Deskriptor über
  `dev/ino/size/mtimeMs/ctimeMs` und wiederholt die Prüfung nach dem Lesen; ein
  Inode-Tausch während der Prüfung ist TOCTOU-sicher abgedeckt.
- Legacy-Eintritt: `datasecure-batch/1` ergibt in **jedem** Pfad `unavailable`
  (`batch-result-projection.js:54`, `batch-evidence.js:49`,
  `batch-results.js:26`), und `eu-privacy-package/2` liefert
  `document_result: null` statt eines erfundenen Grades.
- `readVerifiedFile` (`package-store.js:64`) bindet Deskriptor und Name über
  `dev/ino/size` vor **und** nach dem Lesen und prüft `O_NOFOLLOW`.
- Eine spätere menschliche Freigabe einer zurückgehaltenen Grafik
  (`review.js:approveReviewAsset`) bricht die DS-045-Bindung **nicht**:
  `visual_assets_withheld_at_release` ist ein zum Freigabezeitpunkt eingefrorener
  Wert, und der Grad wird deshalb nicht rückwirkend auf `complete` gehoben.
  Synthetisch gegengeprüft; entspricht `RESULT_GRADES_V1.md`, Abschnitt
  „Paketbindung".

---

## 4. Security-/Privacy- und Originalschutzprüfung

**Keine P0-Findings.** Geprüft und bestätigt:

| Prüfpunkt (Auftrag §3, §5) | Ergebnis |
|---|---|
| Rohbytes, Quellpfade, Originaldateinamen, Dokument-Hashes, Tokens, Paket-IDs, Capabilities, Cursor gelangen nicht an Claude | Bestätigt. Im Normalpfad exponiert der Server 8 Werkzeuge, keines davon liefert Namen oder Pfade. `list_document_batch_results` und die Handoff-Werkzeuge halten Token, Cursor und Capabilities serverseitig. Die Testsuite prüft dies aktiv (`test-batch-session.js`, `test-local-only-handoff.js`, `test-package-read-capabilities.js`, `test-audit-privacy.js` – alle grün). |
| Ergebnis-Cursor sind stapelgebunden und manipulationssicher | Bestätigt. `batch-results.js:38-63`: HMAC über den Batch-Token, Vergleich mit `crypto.timingSafeEqual`, Längenprüfung, Zeichenklasse und Indexobergrenze. |
| Leseberechtigungen sind kurzlebig, prozesslokal und nicht persistiert | Bestätigt. `package-store.js:10-38`: TTL max. 15 min, nur SHA-256-Digest im Speicher, Serverneustart entzieht jede Berechtigung. Eine Paket-ID allein autorisiert nichts. |
| Originale werden nie verändert oder gelöscht | Bestätigt. `planBatchAdmission` öffnet ausschließlich `O_RDONLY|O_NOFOLLOW` und ist ausdrücklich mutationsfrei; `purge_local_data` schützt `Processed` und die Auditnachweise (`index.js` Werkzeugbeschreibung, `retention.js`). `test-batch-session.js` belegt „a preflight-stopped source never creates a cleanup obligation or invokes source deletion" und „expired batch snapshots remove only their private working copies". |
| Nur TXT, Markdown, CSV, DOCX freigegeben; alles andere fail-closed | Bestätigt für XLSX, PPTX, PDF, PNG, JPEG, BMP, CFB/OLE, verschlüsselte ZIP-Einträge, polyglotte Container und unbekannte Endungen. **Aber:** DOCX ist heute faktisch mitgesperrt (**P1-1**). |
| Höchstens ein freigegebenes Markdown pro Eingabe; Mapping bleibt lokal | Bestätigt; Mapping ist über kein MCP-Werkzeug lesbar. |
| Bildpixel bleiben lokal | Bestätigt. Der Normalpfad exponiert `read_asset`/`list_assets` nicht; `EU_PRIVACY_VISUAL_MODE` steht in `.mcp.json` auf `strict`, dem konservativeren Wert. |
| Manipulierte Manifeste, Evidence, Receipts, Zähler, Statuswerte oder Capabilities erzeugen keinen positiven Grad, kein Teilresultat, keine fremde Seite | Für Manifest, Evidence-Record, Receipt, Journal und Cursor bestätigt. **Ausnahme:** ein exportierter Terminal-Marker plus passende Itemzustände erzeugt positive Gradzähler ohne Paketzugriff (**P1-3**). |
| Diagnose- und Auditdaten sind inhaltsfrei | Bestätigt; `test-audit-privacy.js` und `test-diagnostics.js` grün. |
| Keine Behauptung rechtssicherer Anonymität oder einer Zertifizierung | Bestätigt, auch im tatsächlichen Modellverhalten – siehe CLI-Smoke 2 und 3 in Abschnitt 9. |

**Auftragsinterne Klarstellung.** §5 verlangt, dass „Diagnose-, Journal-,
Mapping- und Auditdaten keine … Dateinamen" enthalten. DS-024 und DS-058
verlangen für den **Mapping-Export** ausdrücklich den Originaldateinamen. Das ist
kein Produktfehler: der Mapping-Export ist dauerhaft, rein lokal und für Claude
und MCP-Lesewerkzeuge unzugänglich. Für künftige Aufträge sollte §5 den
Mapping-Export von dieser Aufzählung ausnehmen.

**Nicht geprüft (Grenze dieses Reviews).** Die benutzergebundene Verschlüsselung
privater Snapshots ist laut BL-011.13 noch nicht produktiv verdrahtet. Ein
Angreifer mit Schreibrechten im privaten Benutzerbereich kann den Checkpoint
verändern. Das ist bekannter, offener Stand und wurde hier nicht als eigener
Befund geführt.

---

## 5. Architektur-, Recovery- und Performanceprüfung

**Geprüft und in Ordnung:**

- **Gemischte Stapel und Einzelstopps.** `planBatchAdmission` journalisiert pro
  Datei; der Reststapel läuft weiter. Über die 111 synthetischen UAT-Eingänge
  gegengeprüft (Abschnitt 7).
- **Grenzfälle 0 / 1 / 100 / 101 Dateien und 500 MiB.**
  `test-batch-session.js` – „batch boundaries accept 100 files but reject 101
  files and more than 500 MB before hashing" und „insufficient free local storage
  refuses the whole batch before copying a source" – grün. Ein leerer oder
  fehlerhafter Checkpoint wird nie als `complete` gemeldet
  (`batch_phase: 'invalid_local_state'`).
- **Single-Flight und genau ein aktiver Stapel.** `batch-active-lock.js` plus
  `batch-executor-lease.js`; ein toter Owner ist wiederherstellbar, ein
  fehlerhaftes Lock bleibt fail-closed. Tests grün.
- **Abbruch/Crash vor und nach Snapshot, Verarbeitung, Veröffentlichung,
  Mapping, Review und Evidence.** `test-mixed-batch-recovery.js` (4,5 s),
  `test-batch-post-publish-recovery.js` und 66 von 67 Fällen in
  `test-batch-session.js` grün: „an unacknowledged package is redelivered without
  processing its source twice", „crash recovery adopts a verified published
  package and writes no duplicate mapping row", „a failed mapping write retains
  the published package for local repair without delivery".
- **Fortsetzung an Position 1, Mitte und Ende ohne Doppelfreigabe.** Der
  100-Datei-Fall mit Stopps an 1/50/100 ist grün („a real 100-file local executor
  handles stops at positions 1, 50 and 100 with bounded result pages": 97
  freigegeben, 3 gestoppt, 10 Seiten). Der **Crash**-Gegenpart an denselben
  Positionen ist der einzige rote Fall – **P1-2**.
- **Zwei zurückgestellte Reviewfälle bei fertigen Dateien.** Abgedeckt durch „a
  deferred credential decision keeps its source local, lets the batch continue,
  and needs the shared local review" und „a new-chat continuation preserves
  deferred review for the shared local review path".
- **Deterministische Zuordnung und Ergebnisreihenfolge.** Die Itemreihenfolge ist
  positionsgebunden; `resultCursor` ist ein deterministischer Index, kein
  Zeitstempel. `parallel-preparation-harness.js` ist nicht importiert; der
  Produktstandard bleibt seriell (BL-011.12).
- **Ressourcenlimits, Backpressure, Timeout.**
  `test-resource-limits.js` und `test-batch-performance-contract.js` (5,3 s)
  grün. Visuals haben ein hartes Gesamtzeitbudget von 3 min
  (`visuals.js:17`), der Reviewpfad läuft in einem getrennten Prozess ohne
  menschlichen Timeout (DS-043).
- **Ergebnisreihenfolge/Paging.** Seitengröße 1–20, Stapelübersicht genau
  einmal, Cursor nie im Modelltext. `test-batch-results.js`,
  `test-local-only-handoff.js`, `test-completion-summary.js` grün.
- **Keine überflüssigen `fsync`s.** `writeState` unterscheidet ausdrücklich
  `durable` von Diagnose-Checkpoints und flusht nur zwei definierte Punkte; die
  atomare Temp-Datei-Publikation bleibt unbedingt. Der Fsync-Vertrag aus
  BL-050.3 ist über `test-batch-performance-contract.js` abgedeckt.

**Bewusst begrenzt und dadurch fraglich:** Die einmalige Paketprüfung an der
terminalen Grenze ist eine Performanceentscheidung, die den kanonischen Vertrag
verletzt (**P1-3**). Auftrag §6 zählt „wiederholte Paketprüfung" selbst als
Performance-Geruch auf; der Zielkonflikt ist explizit im Befund benannt.

**Nicht gefunden:** keine unnötige Serialisierung, kein wiederholtes Parsen, kein
N+1-Ergebnislesen. `openVerifiedMarkdownSnapshot` liest ein freigegebenes
Markdown genau einmal, baut einen UTF-8-Zeichenindex und gibt Seiten daraus
aus – statt pro Seite neu zu lesen und zu hashen; `dispose()` überschreibt den
Puffer.

---

## 6. Plugin-/Skill-/Cowork-/UX-Prüfung

Quellstruktur und gebaute ZIP wurden getrennt geprüft.

| Prüfpunkt (Auftrag §7) | Quelle | Gebaute ZIP |
|---|---|---|
| Genau zwei sichtbare Skills, deutsche Namen/Beschreibungen | ✅ `gbh-datasecure-dokument-anonymisieren`, `gbh-datasecure-datenschutz-erklaeren` | ✅ nur diese zwei `SKILL.md` unter `skills/` |
| Eindeutige Trigger ohne funktionale Dopplung | ✅ Der Erklärskill grenzt sich ausdrücklich ab („Nicht für reine Datenschutz-Erklärfragen" bzw. umgekehrt) | ✅ identisch |
| Toolinventar minimal und wahrheitsgemäß | ✅ 8 Werkzeuge im Normalmodus, 25 im Supportmodus – live gegen den laufenden Server geprüft | ✅ ZIP lädt und listet exakt die zwei Skills |
| Vier explizite MCP-Annotationen je Werkzeug | ✅ `tools/list` liefert `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` als Boolean; `openWorldHint` ist überall `false`; `test-mcp-tool-annotations.js` grün | – |
| Keine alte Picker-, Ordner-, Polling- oder Einzeldateilogik | ✅ `open_input_folder`, `begin_document_batch`, `start_document_batch_processing` sind auf keiner aufrufbaren Fläche vorhanden (`test-cowork-tool-surface-contract.js`) | ✅ 385 Einträge, kein `tests/`, `docs/`, `tasks/`, `benchmarks/` oder `evals/` |
| Dateimodi der nativen Komponenten | – | ✅ genau die drei OCR-Sandbox-Binaries auf `0755`, sonst nichts ausführbar |

**Live gegen den Server geprüft** (`EU_PRIVACY_ROOT` in einem temporären
Verzeichnis, `initialize` + `tools/list`):

```
NORMAL mode tools: 8
configure_privacy_folder, start_document_batch_from_picker,
start_completed_local_results_handoff, continue_local_results_handoff,
cancel_local_results_handoff, continue_most_recent_document_batch,
discard_incomplete_document_batches, open_export_folder
```

Kein Statuswerkzeug, kein Lesewerkzeug und kein Pollingwerkzeug im Normalmodus –
DS-040 und BL-041.7 sind auf dieser Ebene erfüllt.

**Verhalten gegen die tatsächliche CLI und die aktuelle Plugin-Hilfe geprüft:**
Die installierte CLI 2.1.233 dokumentiert `--plugin-dir <path>` für „a directory
or .zip". Genau darüber wurde die gebaute ZIP geladen (Abschnitt 9, Smoke 5).
`claude plugin validate` akzeptiert dagegen nur Verzeichnisse (**P3-1**). Es
wurden keine inoffiziellen Quellen verwendet.

**Fortsetzungsfragen und Meldungen.** `SKILL.md` Schritt 4 formuliert die
Fortsetzung eindeutig und verbietet die Rückfrage „fortsetzen oder verwerfen"
nach einer bereits erteilten Zustimmung; `continue_most_recent_document_batch`
verlangt genau eine Bestätigung (`confirmed=true`) und startet den lokalen
Prozess selbst. Die Statusmeldungen in `batch-progress.js:batchUserStatus` sind
kurz, deutsch, handlungsorientiert und tragen genau eine nächste Aktion; ein
unbekannter Zustand fällt auf `check_privacy_status` zurück statt weiter zu
verarbeiten. `test-batch-user-status.js` prüft zusätzlich, dass keine
Dateinamen, Pfade oder Hashes im Text erscheinen.

**Keine Befunde in diesem Abschnitt** außer dem in Abschnitt 9 belegten,
korrekten Verhalten.

---

## 7. UAT-Kit-Prüfung

Geprüft wurden alle fünf im Auftrag §8 genannten Dateien.

**Generatorlauf.** Der Generator wurde in einem ausdrücklich angelegten
temporären Verzeichnis ausgeführt. Weil er kein Ausgabeverzeichnis annimmt,
wurde seine erwartete Verzeichnisstruktur dort nachgebaut; `python-docx` wurde in
einer wegwerfbaren venv im temporären Bereich installiert, nicht global. Das
Repository wurde dabei nicht beschrieben (`git status --short` blieb leer).

**Erwartete 111 Eingänge: bestätigt.**

| Gruppe | Erwartet | Erzeugt |
|---|---|---|
| `01-positive` (TXT, MD, CSV, DOCX) | 4 | 4 |
| `02-review` (Bild-DOCX, mehrdeutiger Zertifikatsanbieter) | 2 | 2 |
| `03-blocked` (PDF, XLSX, PPTX, PNG, defektes DOCX) | 5 | 5 |
| `04-batch-100` | 100 | 100 |
| **Summe** | **111** | **111** |

**Sollwerte gegen den tatsächlichen RC63-Vertrag geprüft.** Der RC63-Source-
Preflight wurde über alle 111 Eingänge laufen gelassen:

| Eingang | Ist (RC63) | Sollmatrix | Urteil |
|---|---|---|---|
| `01-positive/personnel-profile.txt` | `candidate` | freigegeben | ✅ |
| `01-positive/personnel-profile.md` | `candidate` | freigegeben | ✅ |
| `01-positive/personnel-profile.csv` | `candidate` | freigegeben | ✅ |
| `01-positive/personnel-profile.docx` | `stopped` / `SOURCE_ACTIVE_CONTENT_UNSUPPORTED` | freigegeben, Grad `complete` | ❌ **P1-1** |
| `02-review/ambiguous-certificate-provider.txt` | `candidate` | lokale Entscheidung | ✅ |
| `02-review/personnel-profile-with-image.docx` | `stopped` / `SOURCE_ACTIVE_CONTENT_UNSUPPORTED` | `usable-with-omissions` **oder** sicher gestoppt | ⚠️ formal erfüllt, inhaltlich leer |
| `03-blocked/blocked-text.pdf` | `stopped` / `SOURCE_FORMAT_NOT_RELEASED` | sicherer Stopp | ✅ |
| `03-blocked/blocked-image.png` | `stopped` / `SOURCE_FORMAT_NOT_RELEASED` | sicherer Stopp | ✅ |
| `03-blocked/blocked-workbook.xlsx` | `stopped` / `SOURCE_TYPE_MISMATCH` | „noch nicht freigegebenes Format" | ⚠️ Stopp korrekt, Grundcode weicht ab |
| `03-blocked/blocked-slides.pptx` | `stopped` / `SOURCE_TYPE_MISMATCH` | „noch nicht freigegebenes Format" | ⚠️ Stopp korrekt, Grundcode weicht ab |
| `03-blocked/malformed.docx` | `stopped` / `SOURCE_TYPE_MISMATCH` | „ungültiger/unsicherer Container" | ✅ |
| `04-batch-100/batch-001…100.txt` | alle 100 `candidate` | 100 freigegeben | ✅ |

Zu den beiden ⚠️-Grundcodes: Der Generator erzeugt XLSX/PPTX als minimale ZIPs
mit leerem `[Content_Types].xml`. RC63 stoppt sie deshalb bereits an der
OPC-Strukturprüfung als `SOURCE_TYPE_MISMATCH`, nicht am Freigabegate als
`SOURCE_FORMAT_NOT_RELEASED`. Das Ergebnis für den Anwender – sicherer Stopp,
Grad `Sicher nicht verarbeitet`, kein Teilpaket – ist identisch und die
Erwartung „stoppen sicher" ist erfüllt. Nur die Spalte `error_code` im
`EVIDENCE_LOG.csv` würde einen anderen festen Code tragen als die Anleitung
suggeriert. Wer den Freigabegate-Pfad selbst prüfen will, braucht ein
strukturell vollständiges XLSX/PPTX; heute wird er nicht erreicht.

**Weitere Prüfpunkte aus §8:**

| Prüfpunkt | Ergebnis |
|---|---|
| Alle Inhalte eindeutig synthetisch | ✅ „Lina Testfeld", „Mara Beispiel", „Nordstern Medizin IT GmbH", `@privacy-example.test`, erfundene IBAN und Telefonnummern, „Testperson n"/„Testfirma n GmbH". Keine realen Daten. |
| Positive Fälle prüfen Entfernung direkter Identifikatoren **und** Erhalt von Rolle, Technologien, HL7 FHIR, ISTQB, Scrum.org | ✅ Die Fixtures enthalten genau diese Paare; `EXPECTED_RESULTS.csv` fordert beide Richtungen; `STEP-BY-STEP.md` UAT-01/02 ebenfalls. Entspricht DS-012. |
| Reviewfälle erfordern eine lokale, nicht geratene Entscheidung | ✅ Der mehrdeutige Zertifikatsanbieter ist so konstruiert, dass Aussteller- und Arbeitgeberdeutung möglich bleiben; die Anleitung verbietet das Raten ausdrücklich. |
| XLSX/PPTX/PDF/PNG und beschädigtes DOCX stoppen sicher | ✅ alle fünf gestoppt, kein Kandidat, keine private Kopie |
| Anleitung verlangt nie einen Original-Upload in den Chat | ✅ `README.md` und `STEP-BY-STEP.md` verbieten es mehrfach ausdrücklich |
| Evidenzvorlage ohne Inhalte, Pfade, Dateinamen, Dokument-Hashes, Paket-IDs, Tokens, Capabilities, Cursor | ✅ Die 28 Spalten enthalten nur Plattform, Versionen, Commit, Artefakt-SHA-256, Zähler, Zeiten, Urteil und einen festen Fehlercode. `build_commit` ist unnötig vorbelegt (siehe P2-1). |
| UAT-01 bis UAT-06 ohne widersprüchliche oder unmögliche Erwartungen ausführbar | ❌ UAT-02 ist wegen **P1-1** unerfüllbar; UAT-03 besteht nur inhaltsleer. Alle Läufe scheitern zuvor an **P2-1** (Eingänge nicht auffindbar). UAT-01, UAT-04, UAT-05 und UAT-06 sind inhaltlich konsistent. |
| Quelloriginale bleiben bytegleich und werden nie durch `purge_local_data` gelöscht | ✅ Vertraglich und testseitig abgesichert (Abschnitt 4). `STEP-BY-STEP.md` §8.4 sagt es der Prüfperson ausdrücklich. |

**Ausdrücklich nicht getan:** Es wurde **kein** bestandener UI-Test simuliert. Die
tatsächliche Durchführung in Claude Cowork bleibt menschliche E1/E2-Evidenz.

**Gegengeprüft und korrekt:** Dass `EXPECTED_RESULTS.csv` für UAT-03 den Grad
`complete` **nicht** zulässt, ist richtig. Sobald eine Grafik zum
Freigabezeitpunkt lokal zurückgehalten wurde, friert
`visual_assets_withheld_at_release` diesen Zustand ein, und der Grad bleibt auch
nach einer späteren menschlichen Freigabe `usable-with-omissions`. Synthetisch
verifiziert.

---

## 8. Exakte Tests, Dauern und Exitcodes

Node 24.18.0 · npm 11.16.0 · Windows 11 Pro 10.0.26200 · `npm ci` aus
`package-lock.json` (29 Pakete, 0 Vulnerabilities).

| Befehl | Exitcode | Dauer |
|---|---|---|
| `npm run test:ci` | 0 | 144,1 s |
| `npm run test:source-preflight` | 0 | 0,7 s |
| `npm run test:result-grades` | 0 | 0,6 s |
| `node tests/test-batch-session.js` | **1** | 196,1 s |
| `node tests/test-mixed-batch-recovery.js` | 0 | 4,5 s |
| `node tests/test-batch-performance-contract.js` | 0 | 5,3 s |
| `node tests/test-local-only-handoff.js` | 0 | 0,1 s |
| `node tests/test-batch-results.js` | 0 | 0,1 s |
| `node tests/test-completion-summary.js` | 0 | 0,5 s |
| `node tests/test-package-read-capabilities.js` | 0 | 3,0 s |
| `node tests/test-mcp-protocol.js` | 0 | 15,9 s |
| `npm run build:plugin` | 0 | 3,6 s |
| `npm run test:plugin-zip` | 0 | 1,6 s |
| `claude plugin validate plugins/data-secure` | 0 | 0,4 s |
| `git diff --check` | 0 | 0,1 s |
| `npm test` (vollständige Suite, zusätzlich) | **1** | 304,0 s |

Zusätzlich, ohne Modellkosten:

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `claude plugin validate plugins/data-secure --strict` | 0 | `✔ Validation passed` |
| `claude plugin validate .` (Marketplace) | 0 | `✔ Validation passed` |
| `npm run build:plugin` (zweiter Lauf) | 0 | identischer SHA-256 |

**Die beiden roten Läufe haben genau eine gemeinsame Ursache:** die fehlende
Datei `tests/fixtures/crash-batch-worker.js` (**P1-2**). Beide melden
`Server-bound batch session: 66 passed, 1 failed`. Es wurde keine GitHub Action
ausgelöst; alle Prüfungen liefen lokal.

Rohlogs, temporäre CLI-Sitzungen, die venv und die generierten Binärfixtures
liegen ausschließlich im Sitzungs-Scratchpad außerhalb des Repositorys.

---

## 9. Claude-CLI-Version, Befehle, Resultate und Kosten

**CLI-Version:** `2.1.233 (Claude Code)`

### `claude plugin eval` – weiterhin durch Early Access blockiert

Zwei unabhängige Versuche, beide mit derselben Meldung:

```
$ claude plugin eval init --bare rc63probe        # in einem wegwerfbaren temporären Ordner
`plugin eval` is currently in early access

$ claude plugin eval plugins/data-secure --no-publish --runs 1 --max-cost-usd 0.50
`plugin eval` is currently in early access
```

`claude plugin eval --help` dokumentiert den Befehl in dieser Version vollständig
(einschließlich `--ablation with-without`, `--max-cost-usd`, `--no-publish`), die
Ausführung bleibt jedoch gesperrt. Es wurde kein lokales Opt-in und kein
Feature-Flag gefunden. **Das ist ein Anthropic-seitiger Zugangsblocker, kein
Produktfehler.** Der Befund aus `tasks/RC37-CLI-EVAL-BERICHT.md` und
`evals/plugin-eval/README.md` gilt unverändert weiter; die dort vorbereitete
`cases-draft.json` bleibt damit korrekt als Vorabspezifikation und nicht als
ausführbare Fixture geführt.

Nebenbeobachtung: der gesperrte Befehl beendet sich mit **Exitcode 0** – wie auch
`claude plugin validate` im Fehlerfall (**P3-1**). Beide Gates sind nicht
exitcode-basiert automatisierbar.

### Ersatz: fünf begrenzte `claude -p --plugin-dir`-Smokes

Alle mit `--permission-mode manual`, ohne `--dangerously-skip-permissions`, ohne
Publish, ohne persistente Konfigurationsänderung. **Es wurde kein echter
Dateidialog geöffnet oder bestätigt und kein lokaler Pfad und kein Original an
das Modell übergeben** – jeder MCP-Werkzeugaufruf wurde durch den
Berechtigungsmodus abgelehnt, was die Absicht sichtbar macht, ohne den Picker zu
starten. Alle Prompts sind rein synthetisch.

| # | Prüfgegenstand | Ziel | Ergebnis | Kosten |
|---|---|---|---|---|
| 1 | Skilltrigger | `plugins/data-secure` | **PASS.** „Dateien anonymisieren." führt zu genau einem Aufruf von `start_document_batch_from_picker`. Kein Upload-Verlangen, kein `privacy_status` davor, keine Profilfrage. | 0,5226 USD |
| 2 | Upload-Ablehnung | `plugins/data-secure` | **PASS.** Der eingefügte synthetische Profiltext wird abgelehnt und nicht weiterverarbeitet; Begründung „bereits offengelegt, kann nicht rückgängig gemacht werden"; Verweis auf neue lokale Unterhaltung und den lokalen Dialog; Pilotformate korrekt genannt; ausdrücklicher Hinweis „datenschutzreduzierte, pseudonymisierte Fassung, keine rechtssicher zertifizierte Anonymität". Kein Werkzeugaufruf. | 0,5010 USD |
| 3 | Datenschutzbeschreibung | `plugins/data-secure` | **PASS.** Verneint DSGVO- und EU-AI-Act-Zertifizierung von sich aus; nennt den lokalen MCP-Server als Datenschutzgrenze; Formate, Grenzen, Retentionskategorien, Cloud-/Netzwerkpfadsperre korrekt; verweigert ausdrücklich die Nennung des konkreten Retentionswerts, weil das Statuswerkzeug nicht verbunden ist, statt zu raten; trennt Datenschutzvorverarbeitung von HR-Zwecken. | 0,3824 USD |
| 4 | Folgeauswertung | `plugins/data-secure` | **PASS.** Zielt auf `start_completed_local_results_handoff`, **nicht** auf einen neuen Picker; beschreibt korrekt Seitengrösse 5, `continue_local_results_handoff`, keine Namen/Pfade/Token, getrennte Ausweisung von `usable-with-omissions`; keine Vollständigkeitsbehauptung; ausdrücklich kein Ranking oder Eignungsurteil. | 0,2749 USD |
| 5 | Gebaute ZIP | `dist/DataSecure-Privacy-Preflight-v3.2.0-rc63.zip` | **PASS.** Die ZIP lädt über die von der CLI dokumentierte `--plugin-dir`-Syntax und liefert exakt zwei Skills: `gbh-datasecure-dokument-anonymisieren`, `gbh-datasecure-datenschutz-erklaeren`. | 0,1530 USD |

**Gesamtkosten aller kostenpflichtigen Claude-CLI-Prüfungen: 1,8339 USD**
(Limit 3,00 USD, eingehalten). Kein Fall musste wiederholt werden.

**Nicht per CLI belegbar:** `local_only` (kein Polling, kein Ergebnislesen, kein
Bestätigen nach dem Start) ließ sich nicht über die CLI beobachten, weil der
Startaufruf am Berechtigungsmodus abgelehnt wird. Diese Eigenschaft ist über
`test-local-only-handoff.js`, `test-direct-picker-intake-worker.js`,
`test-normal-path-response.js` (alle grün) und die Werkzeugfassade (kein
Statuswerkzeug im Normalmodus) als E0 belegt. Der reale Nachweis bleibt E1
(BL-041.6).

---

## 10. Plugin-ZIP: Pfad, Größe und SHA-256

```
Pfad   : dist/DataSecure-Privacy-Preflight-v3.2.0-rc63.zip
Größe  : 22.216.865 Bytes
SHA-256: 4ACA812AFA50FFC2421C668EB8248BC17AB3A40C67A77DF3DFBEB6950DEBF886
Einträge: 385
```

**Der Build ist reproduzierbar.** Der frisch gebaute ZIP trifft den im Auftrag §9
hinterlegten, zuletzt lokal gemessenen Hash **exakt**. Ein zweiter Build in
derselben Sitzung ergab bitgenau denselben Hash. Es gibt keine
Buildabweichung und damit auch keinen Anlass, den erwarteten Wert zu ändern.

Versionskonsistenz über alle fünf Quellen geprüft: `package.json`,
`plugins/data-secure/.claude-plugin/plugin.json`, `plugins/data-secure/VERSION`,
`plugins/data-secure/server/version.js` und `manifest.json` tragen alle
`3.2.0-rc63`.

---

## 11. Menschlich verbleibende Prüfungen (E1/E2/E3), einzeln

Dieses Review ersetzt **keine** dieser Nachweise. Keine davon wurde simuliert.

**E1 – Zielsystem und Host**

1. Lokale Cowork-Desktop-Sitzung in der aktuellen Claude-Version positiv
   erkennen; Cloud, Web, Mobil und Scheduled müssen vor Originalzugriff stoppen.
   (BL-010.7, BL-051.6)
2. Frische ZIP-Installation auf Windows x64 und macOS Intel/ARM. (BL-051.1)
3. Marketplace-Installation auf denselben Plattformen. (BL-051.2)
4. Update, Rückrolle und Entfernung ohne System-Node. (BL-010.8, BL-051.4,
   BL-051.5)
5. Gleichheit von Spracheingabe und direkter Skillauswahl in der echten
   Claude-UI. (BL-041.4, BL-041.1)
6. Ablehnung eines echten Chat-Uploads in der echten UI. (BL-041.3)
7. `local_only` endet real ohne Polling, Ergebnislesen oder Bestätigung; genau
   eine terminale lokale Zählerübersicht. (BL-041.6)
8. Tatsächliche Anzahl der Cowork-Berechtigungsdialoge in Manual, Auto und Skip
   sowie bei 1, 5 und 20 Handoff-Seiten. (BL-042.2, BL-041.7)
9. Reale Messung für 1, 10 und 100 Dateien und 500 MiB auf Zielhardware: Zeit,
   CPU, Peak-RAM, Fortschritt, Stopp, Resume; R3a-Vorhashing getrennt messen.
   (BL-041.5, BL-050.3, BL-051.3)
10. POSIX-Supervisor: reale CPU-, RAM-, Flood-, Child- und Timeout-Evidenz auf
    macOS x64/ARM64. (BL-011.9)
11. Darwin-Reviewvertrag mit echtem `osascript` und Fresh-Install-Nachweis.
    (BL-012.8)
12. Reparse-, Swap- und Cleanup-Gegenproben auf Windows und macOS. (BL-011.8)
13. Reale DPAPI-/Keychain- und Dateisystemevidenz für die benutzergebundene
    Verschlüsselung sowie Rotation, Migration und Recovery. (BL-011.13)
14. Keyring-gestützte stapelweite Pseudonyme über Pause und Neustart.
    (BL-030.2, BL-059/DS-059)
15. Reale Power-Loss- und Dateisystemevidenz für den Durability-Vertrag.
    (BL-050.3)
16. Netzwerkfreiheit als eigenes Hostgate auf Windows und macOS. (BL-020.3)
17. Reale TXT-/Markdown-/CSV-/DOCX-Interoperabilität auf den Zielplattformen.
    (BL-021.1, BL-021.2, BL-022.1) — **setzt die Behebung von P1-1 voraus.**
18. Zwei-Worker- und OCR-Ressourcen-/Timeout-/Qualitätsnachweis. (BL-011.12,
    BL-024.2, BL-024.4)

**E2 – Bedienung und Barrierefreiheit**

19. Beobachtete Gebrauchstauglichkeit ohne technische Hilfestellung: Fortschritt,
    alle Endzustände, Fortsetzung. (BL-011.7, BL-012.2, BL-012.6, BL-012.7,
    BL-052.1, BL-052.4)
20. Tastatur, Fokus, Skalierung, Kontrast und Screenreader auf Windows und
    macOS. (BL-012.5, BL-052.4, DS-055)
21. Mehrdeutigkeitsdialog und vertagte Entscheidungen plattformgleich.
    (BL-032.1, BL-012.3, BL-031.1)
22. Vollständige Durchführung von UAT-01 bis UAT-06 in Claude Cowork —
    **setzt die Behebung von P2-1 und P1-1 voraus.**

**E3 – Fachliche, Datenschutz- und Sicherheitsfreigabe**

23. IT-/Health-IT-Fachabnahme mit ausschließlich synthetischen Daten.
    (BL-052.2)
24. Datenschutzabnahme einschließlich Inhaltserhalt, Restrisiko, Retention und
    zulässigem Verwendungszweck. (BL-052.3)
25. Architektur- und Security-Freigabe der Zielarchitektur und der lokalen
    Sicherheitsgrenze. (BL-052.5)
26. Security-Abnahme der benutzergebundenen Verschlüsselung. (BL-011.13)
27. Fach-/Security-Abnahme der noch gesperrten Formate, bevor XLSX, PPTX, PDF
    oder Rasterbilder freigegeben werden. (BL-022.2, BL-022.3, BL-023.*,
    BL-024.3)

---

## 12. Git-Status und angelegte Folgeaufträge

**Git-Status.** `git status --short` war beim Start leer und ist beim Abschluss
leer bis auf die in diesem Auftrag angelegten Dokumente. `git diff --check` ist
sauber (Exitcode 0). Es wurde **kein Commit und kein Push** erzeugt; es wurde
nichts zurückgesetzt, rebased oder überschrieben, keine globale Claude-/MCP-
Konfiguration geändert, kein globales Paket installiert und keine GitHub Action
ausgelöst.

Auf der Prüfmaschine existierte kein Arbeitsbaum; das Repository wurde für dieses
Review deshalb frisch von
`https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure` geklont, statt `git
pull` auszuführen. HEAD ist unverändert
`6e95d817ce99979eeacdbf1447ebe4a5e67e02a1`.

**In Git gehören aus diesem Auftrag nur diese vier Dokumente:**

| Datei | Zweck |
|---|---|
| `tasks/RC63-CLAUDE-CODE-GESAMTREVIEW-BERICHT.md` | dieser Bericht |
| `tasks/CLAUDE-CODE-FOLGEAUFTRAG-P1-OPC-PAKETMETADATEN.md` | Folgeauftrag zu **P1-1** |
| `tasks/CLAUDE-CODE-FOLGEAUFTRAG-P1-CRASH-WORKER-FIXTURE.md` | Folgeauftrag zu **P1-2** |
| `tasks/CLAUDE-CODE-FOLGEAUFTRAG-P1-GRADE-PAKETBINDUNG.md` | Folgeauftrag zu **P1-3** |

Für **P2-1**, **P3-1** und **P3-2** wurde gemäß Auftrag §11 kein eigener
Folgeauftrag angelegt; sie sind hier vollständig reproduzierbar beschrieben.

**Empfohlene Reihenfolge.** P1-1 zuerst — ohne DOCX ist die RC63-UAT inhaltlich
wertlos. Dann P2-1, damit die UAT überhaupt startbar ist. P1-2 ist unabhängig und
klein. P1-3 braucht zuerst eine Product-Owner-Entscheidung zum Zielkonflikt
zwischen `RESULT_GRADES_V1.md` und dem Performanceziel.

**Restrisiken, die kein Finding sind.**

- Die benutzergebundene Verschlüsselung privater Snapshots ist noch nicht
  produktiv verdrahtet (BL-011.13). Bis dahin ist ein Angreifer mit
  Schreibrechten im privaten Benutzerbereich im Modell nicht abgedeckt.
- Der Produktstandard ist seriell; die adaptive Parallelität aus BL-047.1 ist
  nicht implementiert. Die Latenzbudgets aus DS-047 sind damit noch unbelegt.
- XLSX, PPTX, PDF und eigenständige Rasterbilder bleiben korrekt fail-closed.
  Der Freigabegate-Pfad `SOURCE_FORMAT_NOT_RELEASED` für strukturell
  vollständige XLSX/PPTX wird von den heutigen UAT-Fixtures nicht erreicht
  (siehe Abschnitt 7).
- Der `hyperlink`-Term im OPC-Muster sperrt auch DOCX mit gewöhnlichen internen
  Hyperlink-Beziehungen. Ob das gewollt ist, ist eine offene
  Product-Owner-Frage (in P1-1 benannt).
