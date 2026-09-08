# Arbeitsauftrag an Codex: Redaktionskern und Evidenzlücken in 3.2.0-rc123

Stand: 08.09.2026 · Ausgangscommit `c62d7ec` · Produktstand 3.2.0-rc123
Auftragsart: zeitgebundener schreibender Fix- und Nachweisauftrag
Adressat: Codex auf einem anderen Rechner, ohne Zugriff auf die Reviewsitzung

Alle Befunde wurden auf Windows 11 x64 mit Node 24.19 durch **Ausführung**
reproduziert, nicht aus dem Code erschlossen. Jeder Befund nennt Fundstelle,
kopierbare Reproduktion, Ist, Soll, Begründung, Fehlerrichtung und ein
überprüfbares Abnahmekriterium.

Der Befundsatz wurde anschließend adversarisch gegengeprüft. Drei ursprüngliche
Befunde sind dabei **widerlegt** worden und stehen in Abschnitt 6 als
ausdrückliche Nicht-Themen, damit du sie nicht erneut untersuchst.

---

## 0. Bevor du etwas änderst

### 0.1 Umgebung

```bash
git clone https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure.git
cd msg_gbh_DataSecure
git checkout main
git log --oneline -1          # c62d7ec oder Nachfolger
npm ci
```

- **Node >= 22.13** (`package.json` `engines`). Referenz: Node 24.19.
- **Rust/Cargo** für `npm run test:standalone:rust` und den Windows-Paketbau.
  Fehlt Cargo, kannst du den Rust-Teil nicht verifizieren. Sage das dann
  ausdrücklich, statt es zu überspringen und Grün zu behaupten.
- Kein Netzzugang während der Tests. Der Verarbeitungskern ist nach **DS-018**
  netzwerkfrei; mehrere Gates prüfen das.

### 0.2 Warum dieser Auftrag existiert

Nach `tasks/README.md` gilt: **Unter-Redaktion ist immer der schwerere Fehler.**
Ein Fix, der einen echten Namen durchlässt, wird nicht ausgeliefert, sondern
gemeldet. F1 unten ist genau das: ein echter Name aus einer echten DOCX gelangt
im Standalone-Anonymisierungspfad unredigiert in ein Ergebnis, das das Produkt
als anonymisiert ausweist — während **derselbe Inhalt** über Cowork korrekt
redigiert wird.

### 0.3 Reproduktionsumgebung für alle Privacy-Befunde

Arbeite mit Probeskripten **außerhalb** des Repos (z. B. `%TEMP%\ds-probe`).
Lege keine Probeskripte im Repo ab; sie sind kein Produktartefakt.

Gemeinsamer Einstieg:

```js
const R = '<ABSOLUTER PFAD ZUM REPO>/';
const { anonymizeMarkdown } = require(R+'plugins/data-secure/server/gateway/compliance');
const r = anonymizeMarkdown(rohtext, 'customer_document');
// Rückgabefeld ist  r.text   — NICHT r.markdown
```

Stapelweite Fälle:

```js
const reg = require(R+'plugins/data-secure/server/batch-pseudonym-registry');
const crypto = require('crypto');
const registry = reg.createBatchPseudonymRegistry(
  crypto.randomBytes(reg.SECRET_BYTES),          // SECRET_BYTES === 32
  { contractVersion: 'batch-pseudonym/v2' }
);
// 'batch-pseudonym/v1' zeigt dasselbe Verhalten, liefert aber HMAC-Platzhalter
// wie [PERSON_TFKV5BKLOA] statt der lesbaren Form [PERSON_001] aus F9.
);
anonymizeMarkdown(text, 'customer_document', { registry });
```

**Wichtig zur Interpretation.** `anonymizeMarkdown` enthält bereits einen
Residual-Lauf. Die echte Pipeline setzt in
`plugins/data-secure/server/gateway/orchestrator.js:508` ein **zweites,
unabhängiges** Gate über die exakten Ausgabebytes:

```js
const finalResidual = pii.scanResidual(finalText, effective, anon.dictionary,
  { strongPersonAnchor: anon.strongPersonAnchor });
```

Prüfe jeden vermuteten Leckfall **gegen beide** Gates, sonst hältst du ein Leck
für gestoppt oder umgekehrt:

```js
const engine = require(R+'plugins/data-secure/server/privacy/engine');
engine.scanResidual(anon.text, 'customer_document', anon.dictionary,
  { strongPersonAnchor: anon.strongPersonAnchor });   // []  ===  laesst durch
```

### 0.4 Testdatenregel

Ausschließlich frei erfundene Namen. **Keine** produktiven oder echten
personenbezogenen Testdaten (`CLAUDE.md`). Die Namen in diesem Auftrag
(`Ferdinand Quastenflosser`, `Cornelia Zwirbelbach`, `Anna Beispiel`,
`Mueller Einkauf`, `Anna Sommer`) sind erfunden und dürfen weiterverwendet
werden.

`.gitignore:1-9` schließt `*.docx`, `*.xlsx` und verwandte Typen **global** aus,
mit Begründung: „never commit document payloads … CI fails on any tracked file
of these types." Committe daher niemals ein Office-Dokument, auch kein
synthetisches. Fixtures werden generiert, nicht versioniert.

### 0.5 Rückfragen und Entscheidungen — lies das, bevor du blockierst

Sechs Befunde verlangen eine Wahl, die nicht deine ist: F1 (Weg A/B), F2 (neue
DS-Nummer), F7 (Option 1/2), F11 (Weg des Generators), F12 (Weg A/B), F13
(Formulierung des Hinweises), F17 (Konsequenz aus der Messung), F24 (Umfang).

**Adressat** Der Auftraggeber dieses Dokuments ist der Repository-Eigentümer
(Git-Remote `renepuhlmannarbeit/msg_gbh_DataSecure`). Er ist die einzige
Instanz, die Produktentscheidungen und neue DS-Nummern bestätigt.

**Kanal** Lege `tasks/RUECKFRAGEN-RC123.md` an und schreibe jede Rückfrage dort
als eigenen Abschnitt: Befund-Nummer, die zur Wahl stehenden Optionen, deine
begründete Empfehlung, und was du bis zur Antwort tust. Committe diese Datei
zusammen mit dem Commit, der die Frage auslöst. Nenne die offenen Fragen
zusätzlich im Commit-Text und im Abschlussbericht.

**Interimsverhalten — damit du nie blockierst.** Warte auf keine Antwort.
Arbeite nach diesen Vorgaben weiter und markiere das Ergebnis als vorläufig:

| Befund | Bis zur Antwort |
|---|---|
| F1 | Weg A umsetzen; der Fail-closed-Teil ist ohnehin nicht verhandelbar |
| F2 | Katalog erweitern, Rest fail-closed; **keine** neue DS-Nummer schreiben, nur vorschlagen |
| F7 | Option 1 (fail-closed) umsetzen und als vorläufig markieren. Unter-Redaktion ist der schwerere Fehler, also ist Stoppen die sichere Zwischenlösung |
| F11 | Node-Generator; Python-Skript stehen lassen und als ersetzt markieren |
| F12 | Weg A (Vertrag präzisieren), weil er nichts am Laufzeitverhalten ändert; die Testassertion in beiden Fällen ergänzen |
| F13 | Hinweis ergänzen, **keine** Sperre |
| F17 | nur messen und berichten, nichts ändern |
| F24 | nur die Dokumentationsoption, keine 100 neuen Fixtures |

Wenn du eine dieser Vorgaben für falsch hältst, setze sie trotzdem um und
widersprich im Bericht. Setze sie nicht eigenmächtig anders um.

### 0.6 Arbeitsweise

- Ein Thema pro Commit. Keine Force-Pushes, Resets oder History-Rewrites.
- Keine kosmetischen Nebenänderungen, keine Umbenennungen, keine
  Formatierungsläufe, kein Refactoring über den Befund hinaus.
- Keine GitHub Actions; lokal testen.
- Jeder Fix braucht einen Test, der **vorher rot und nachher grün** ist. Führe
  ihn einmal gegen den unveränderten Code aus und halte im Commit-Text fest,
  wie er dort scheitert. Ein Test, der auch ohne den Fix grün ist, ist keine
  Evidenz.
- Definition of Done (`BACKLOG.md:9`): Code, Tests, `BACKLOG.md`,
  `CURRENT_STATE.md` und `TRACEABILITY.md` werden **gemeinsam** aktualisiert.

---

## 1. P0 — Unter-Redaktion

Fehlerrichtung aller Befunde hier: **Unter-Redaktion.** Über-Redaktion ist das
kleinere Übel. Wenn du einen Fall nicht sicher redigieren kannst, lass ihn
**fail-closed stoppen** statt ihn durchzulassen.

### F1 — KRITISCH: Die Standalone-Extraktion zerstört das Namensfeld, an dem die Redaktion hängt

**Fundstellen**

| Datei:Zeile | Rolle |
|---|---|
| `plugins/data-secure/server/standalone/markdown-extractor.js:80` | ruft `parseOoxml(buffer, '.'+source_type, undefined, { preserveText: true })` |
| `plugins/data-secure/server/ooxml.js:575` | erzeugt unter `preserveText` den synthetischen Kopf `Spalte 1 … N` |
| `plugins/data-secure/server/ooxml.js:155` | dasselbe für PPTX, **bedingungslos** |
| `plugins/data-secure/server/ooxml.js:1243` | dasselbe für XLSX, **bedingungslos** |
| `plugins/data-secure/server/standalone/wide-privacy-extraction.js:13` | `MARKDOWN_FIRST_PRIVACY_EXTENSIONS` enthält `.docx` und alle breiten Formate |
| `plugins/data-secure/server/privacy/entities.js:220` | `isStructuralLine`: jede Zeile mit Pipe fällt aus der Kontexterkennung |
| `plugins/data-secure/server/privacy/entities.js:186` | `markdownTableColumnValues` braucht das Personenlabel **in der Kopfzeile** |
| `plugins/data-secure/server/privacy/engine.js:106` | `RESIDUAL_PERSON_TABLE_CANDIDATE_RE` ist laut Kommentar `:102-105` **ausdrücklich unabhängig** vom Labelkatalog, verlangt aber die Literalform `| person: |` und trifft `Spalte N` deshalb nicht |
| `plugins/data-secure/server/privacy/engine.js:532` | `collectPersonSeeds` im Residual-Gate benutzt denselben labelabhängigen Mechanismus und erbt den blinden Fleck |

Die Bedingung in `ooxml.js:575` lautet

```js
const neutralHeader = options.preserveText && !inCell &&
  !(node.children[0]?.header && !node.children.slice(1).some((row) => row.header));
```

Eine normale Word-Tabelle deklariert kein `w:tblHeader`, also ist
`node.children[0]?.header` falsy und `neutralHeader` wird **true**.

**Reproduktion — echte DOCX, beide Kanäle, kopierbar**

```js
const R = '<REPO>/';
const { reviewDocx, run } = require(R+'tests/lib/docx-review-fixtures');
const { extractMarkdownBuffer } = require(R+'plugins/data-secure/server/standalone/markdown-extractor');
const { parseDocumentBuffer } = require(R+'plugins/data-secure/server/document-parser');
const { anonymizeMarkdown } = require(R+'plugins/data-secure/server/gateway/compliance');

const cell = v => `<w:tc><w:p>${run(v)}</w:p></w:tc>`;
const row  = (...v) => `<w:tr>${v.map(cell).join('')}</w:tr>`;
const docx = reviewDocx(`<w:p>${run('Teilnehmerliste')}</w:p><w:tbl>`
  + row('Name','Rolle','Geburtsdatum')
  + row('Ferdinand Quastenflosser','Tester','03.07.1981')
  + row('Cornelia Zwirbelbach','Analyse','14.11.1979')
  + `</w:tbl>`);

for (const [label, md] of [
  ['STANDALONE markdown-first', extractMarkdownBuffer(docx, '.docx').markdown],
  ['COWORK direkter Parser',    parseDocumentBuffer(docx, '.docx').markdown]
]) {
  console.log('### ' + label); console.log(md);
  try {
    const a = anonymizeMarkdown(md, 'customer_document');
    console.log('LECK = ' + /Quastenflosser|Zwirbelbach/.test(a.text));
  } catch (e) { console.log('FAIL-CLOSED: ' + e.message); }
}
```

**Ist — tatsächliche Ausgabe**

```
### STANDALONE markdown-first
Teilnehmerliste

| Spalte 1 | Spalte 2 | Spalte 3 |
| --- | --- | --- |
| Name | Rolle | Geburtsdatum |
| Ferdinand Quastenflosser | Tester | 03\.07\.1981 |
| Cornelia Zwirbelbach | Analyse | 14\.11\.1979 |
LECK = true

### COWORK direkter Parser
Teilnehmerliste

| Name | Rolle | Geburtsdatum |
| --- | --- | --- |
| Ferdinand Quastenflosser | Tester | 03.07.1981 |
| Cornelia Zwirbelbach | Analyse | 14.11.1979 |
LECK = false
```

Beide Namen **und** beide Geburtsdaten stehen im Standalone-Ergebnis im
Klartext, weil die echte Kopfzeile zur Datenzeile degradiert wurde.

Das zweite Gate fängt es ebenfalls nicht. Verifiziert:

```js
const engine = require(R+'plugins/data-secure/server/privacy/engine');
const a = anonymizeMarkdown(extractMarkdownBuffer(docx, '.docx').markdown, 'customer_document');
for (const anchor of [false, true])
  console.log(anchor, engine.scanResidual(a.text, 'customer_document',
    a.dictionary, { strongPersonAnchor: anchor }));   // beide Male []
```

**Soll** Derselbe DOCX-Inhalt muss in beiden Produkten redigiert werden.
Standalone darf nicht schlechter sein als Cowork.

**Warum du daran arbeiten sollst**

1. `docs/canonical/BACKLOG.md:153` sagt für **BL-030.2/BL-021.1** ausdrücklich
   zu: „natürliche Kundenpersonen und **explizite Namensfelder auch in Listen**
   bleiben Personen." Die Quelle *hat* hier ein explizites Namensfeld (`Name`).
   Die Zusage wird nicht durch den Detektor gebrochen, sondern durch die
   Extraktion **davor**.
2. **DS-090** (`DECISIONS.md:1260`) begründet den Markdown-first-Pfad damit,
   dass „ausschließlich die vertraglich geprüfte, nichtleere
   Markdown-Repräsentation anonymisiert" wird. Genau diese Anonymisierung
   scheitert hier still. DS-090 verlangt nirgends, den Tabellenkopf zu ersetzen.
3. **BL-010.30** ist „in Arbeit". Seine Evidenzliste
   (`BACKLOG_EVIDENCE_MATRIX.md:95`) zählt die geprüften Fälle einzeln auf
   (Custom-XML-Lücke, Markdown-escapte E-Mails, stabile Labels).
   Tabellenkopf-Personenspalten stehen **nicht** darin. Der Kanon behauptet
   also nichts Falsches — es ist ein ungeprüfter Fall, dessen Fehlerrichtung
   Unter-Redaktion ist. Deshalb ist das ein Fix und keine Kanonkorrektur.
4. Betroffen ist die häufigste Massenform personenbezogener Daten: Teilnehmer-,
   Mitarbeiter- und Kundenlisten aus DOCX, XLSX, PPTX und PDF. Für XLSX und
   PPTX ist der synthetische Kopf **bedingungslos**, dort trifft es jede
   Tabelle.

**Auftrag** Entscheide begründet und dokumentiere die Wahl als Präzisierung von
DS-090:

- **Weg A (bevorzugt):** Die Extraktion behält die Quellkopfzeile als
  Kopfzeile. Der synthetische Kopf entsteht nur, wenn die Quelltabelle wirklich
  keine Kopfzeile hat. Prüfe dabei, woher `row.header` in `ooxml.js` kommt und
  ob `w:tblHeader` der einzige Indikator sein soll.
- **Weg B:** Der Redaktionskern behandelt die erste Datenzeile einer
  `Spalte N`-Tabelle als Labelkandidat.

**Unabhängig vom Weg und nicht verhandelbar:** Das Residual-Gate muss eine
Tabelle mit neutralem Kopf und namensförmiger Spalte **fail-closed stoppen**.
Der stille Durchlass darf nicht bestehen bleiben, auch wenn Weg A den Regelfall
repariert.

**Abnahmekriterium**

- Ein neuer Test baut die DOCX aus der Reproduktion, führt sie durch **beide**
  Extraktionspfade und durch `anonymizeMarkdown`, und verlangt für beide Pfade
  Redaktion oder Fail-closed. Der Test scheitert gegen `c62d7ec`.
- Dasselbe für je eine XLSX und eine PPTX mit Personenspalte.
- Ein Test verlangt, dass `scanResidual` über die Ausgabebytes bei neutralem
  Kopf und namensförmiger Spalte einen Treffer liefert.
- `docs/FORMAT_COVERAGE_MATRIX.md` beschreibt das neue Verhalten für DOCX,
  XLSX und PPTX.

### F2 — Personenspalten ohne Namenslabel: Umfang klären, aber nicht still durchlassen

**Fundstellen** derselbe Mechanismus wie F1 (`entities.js:186`, `engine.js:106`).

**Reproduktion**

```js
for (const h of ['Name','Nachname','Person','Mitarbeiter','Teilnehmer','Ansprechpartner',
                 'Zuständig','Verantwortlich','Abteilung','Bezeichnung','Eintrag','Spalte 1']) {
  const md = `| ${h} | Rolle | Geburtsdatum |\n| --- | --- | --- |\n| Anna Beispiel | Testerin | 03.07.1981 |\n`;
  try { const r = anonymizeMarkdown(md, 'customer_document');
        console.log((r.text.includes('Anna Beispiel') ? 'LECK ' : 'red. ') + h); }
  catch (e) { console.log('STOP ' + h); }
}
```

**Wichtig zur Ausführung.** Die Trennzeile muss genauso viele Zellen haben wie
der Kopf. Mit `| --- | --- |` bei dreispaltigem Kopf stoppen **alle** Varianten
mit `TABLE_STRUCTURE_AMBIGUOUS` wegen Breitenabweichung — das ist F8, und du
siehst F2 dann nicht. Ersetzt du `Geburtsdatum` durch eine neutrale dritte
Spalte wie `Ort`, stoppt zusätzlich `Mitarbeiter`, ebenfalls durch F8. Nimm für
F2 deshalb genau die Eingabe oben. Beides verifiziert.

**Ist**

```
red. Name / Nachname / Person / Mitarbeiter / Teilnehmer / Ansprechpartner
LECK Zuständig / Verantwortlich / Abteilung / Bezeichnung / Eintrag / Spalte 1
```

Das Geburtsdatum wird in allen Fällen korrekt redigiert, weil `Geburtsdatum` im
Katalog steht. Nur die Personenspalte fällt durch.

**Warum** `Zuständig` und `Verantwortlich` sind gängige deutsche Kopfzeilen für
eine Personenspalte. Ob sie als „explizites Namensfeld" im Sinne von BL-030.2
gelten sollen, ist eine **fachliche Umfangsentscheidung** und nicht deine. Der
heutige Zustand ist aber in jedem Fall falsch: er lässt still durch, statt zu
stoppen oder die Grenze zu dokumentieren.

**Auftrag** Erweitere den Kopfzeilenkatalog um die eindeutig personenbezogenen
Varianten (mindestens `Zuständig`, `Zuständige`, `Verantwortlich`,
`Verantwortliche`, `Bearbeiter`, `Sachbearbeiter`, `Betreuer`, `Autor`,
`Verfasser`, `Empfänger`, `Absender`, `Unterzeichner`, `Gesprächspartner`,
`Kontakt`) und lasse alles Übrige **fail-closed stoppen**, wenn eine Spalte
namensförmige Bigramme enthält.

Für die verbleibende Grenze — eine Personenspalte unter einer beliebigen, nicht
katalogisierten Bezeichnung — schreibe eine ausdrückliche Grenze in
`DECISIONS.md` und `docs/FORMAT_COVERAGE_MATRIX.md`. Erfinde **keine** neue
DS-Nummer eigenmächtig; schlage sie im Commit-Text vor und lass sie menschlich
bestätigen.

**Abnahmekriterium** Ein Test durchläuft die Kopfzeilenliste und verlangt für
**jede** Variante Redaktion oder Fail-closed, niemals stillen Durchlass.

### F3 — Kein Detektor für Zugangsdaten

**Fundstelle** `plugins/data-secure/server/privacy/structured.js:99-230`. Die
Detektorliste kennt `CONTACT_URI, EMAIL, IBAN, CREDIT_CARD, BIC,
DE_SOCIAL_SECURITY, DE_TAX_ID, REFERENCE_ID, DATE_OF_BIRTH, VEHICLE_PLATE,
PHONE, IP, IPV6, STREET_ADDRESS, POSTAL_ADDRESS` — keine Klasse für Passwort,
Secret, Token oder API-Key. `privacy/credentials.js` behandelt ausschließlich
Zertifikats- und Qualifikationskontext, nicht Anmeldedaten.

**Reproduktion / Ist**

```js
anonymizeMarkdown('Zugangsdaten\n- Benutzername: f.quastenflosser\n'
  + '- Passwort: Sommer2026!\n- API-Key: sk-live-4f9a2b7c1d8e6350\n',
  'customer_document').text
// → wortgleich, residual leer
```

**Warum** Benutzername plus Passwort sind personenbezogene Zugangsdaten und
gehen hier an Claude. Prüfe die naheliegende Entlastung und verwirf sie
ausdrücklich: **DS-016 und DS-046** betreffen *verschlüsselte Quelldateien*,
nicht Dokumentinhalt. Es gibt im Kanon keine Entscheidung, die Zugangsdaten im
Dokumentinhalt freigibt.

**Auftrag** Labelgetriebener Detektor auf
`Passwort|Kennwort|Password|Passphrase|Secret|Token|API[- ]?Key|Zugangsdaten|Zugangscode|PIN`
mit eigener Ersetzung (Vorschlag `[CREDENTIAL_REDACTED]`) und einer
Residualklasse, die bei labelnahen, nicht redigierten Werten fail-closed
stoppt. Story **BL-021.1**.

**Abnahmekriterium** Test über die Reproduktion plus Varianten mit
Doppelpunkt, Gleichheitszeichen und Markdown-Listenpunkt; zusätzlich ein
Negativtest, dass ein Fließtextsatz mit dem Wort „Passwort" ohne Wert nicht
fälschlich redigiert wird.

### F4 — IBAN wird nur bei Leerzeichen-Gruppierung erkannt

**Fundstellen** `privacy/base.js:109` (`IBAN_RE`, Trenner `SEP` aus
`base.js:71`, Zeichenklasse `SEP_CHARS` in `base.js:70` = nur Leerzeichenfamilie), `privacy/structured.js:115`,
`privacy/iban-boundary.js:12` (`NUMERIC_IBAN_LENGTHS`).

**Reproduktion / Ist**

| Eingabe | Ausgabe |
|---|---|
| `IBAN: DE44 5001 0517 5407 3249 31` | `IBAN: [BANK_DATA_REDACTED]` — korrekt |
| `IBAN: DE44-5001-0517-5407-3249-31` | `IBAN: DE44-[BANK_DATA_REDACTED]` — Länder-/Prüfziffern bleiben |
| `IBAN: GB29-NWBK-6016-1331-9268-19` | **vollständig im Klartext** |
| `IBAN: DE44.5001.0517.5407.3249.31` | **vollständig im Klartext** |

**Warum** Direkter Identifikator, unmittelbar hinter dem Label `IBAN:`. Das
Residual-Gate benutzt denselben `IBAN_RE` und kann den blinden Fleck nicht
unabhängig entdecken. Der GB-Fall entgeht auch dem Luhn-Fallback der
`CREDIT_CARD`-Klasse, weil die BBAN alphanumerisch ist.

**Auftrag** Gruppierungstrenner um `-`, `.`, `/` und die Unicode-Bindestriche
erweitern; `DASH_CHARS` existiert bereits in `base.js:72`. Über-Redaktion ist
hier unkritisch, weil zwei Buchstaben, zwei Ziffern und 11+ Gruppenzeichen eine
sehr spezifische Form sind. Story **BL-021.1**.

**Abnahmekriterium** `tests/test-pii-regression.js` und
`tests/test-iban-boundary.js` decken alle vier Gruppierungsformen für
mindestens DE, GB, NL und AT ab. Heute decken sie nur unsegmentierte und
leerzeichen-/NBSP-gruppierte Werte ab (`test-pii-regression.js:346,1272`).

### F5 — Greedy-IBAN verschluckt das Telefonlabel und lässt Ziffern im Klartext

**Fundstellen** `privacy/structured.js:116` (`type: 'IBAN'`; `priority: 88` steht in `:121`, gegen PHONE `80`),
`privacy/iban-boundary.js:20` und `:93` (`PROSE_TAIL_RE`).

**Reproduktion / Ist**

```
Eingabe: "IBAN: DE89370400440532013000 Tel 030 1234567"
Ist:     "IBAN: [BANK_DATA_REDACTED] 1234567"      residual = []
Soll:    "IBAN: [BANK_DATA_REDACTED] Tel [PHONE_REDACTED]"
```

**Warum** `ibanBoundaryEnd` kürzt nach der bekannten DE-Länge nur, wenn direkt
eine E-Mail oder IBAN folgt oder der Zeilenrest `PROSE_TAIL_RE` erfüllt — also
**ausschließlich Kleinbuchstaben-Prosa**. `Tel 030 1234567` und ebenso
`Vielen Dank` (großgeschriebene deutsche Substantive, der Normalfall) fallen
auf den 34-Zeichen-Greedy-Treffer zurück. Das Residual-Gate ist blind, weil
`RESIDUAL_PHONE_CANDIDATE_RE` (`engine.js:100`) ein Telefonlabel per
`hasLabelBefore` verlangt — und genau dieses Label wurde mitredigiert. Ergebnis:
7 von 10 Telefonziffern still im freigegebenen Markdown, plus Inhaltsverlust.

**Auftrag** Bei bekannter numerischer BBAN-Länge (`NUMERIC_IBAN_LENGTHS`) am
Längenende trennen, sobald ein Trennzeichen folgt — unabhängig vom Zeilenrest.
Story **BL-021.1**.

**Abnahmekriterium** Test mit IBAN gefolgt von (a) `Tel …`, (b) `Vielen Dank`,
(c) einer BIC, (d) einer weiteren IBAN, (e) Zeilenende. In allen Fällen bleibt
die IBAN redigiert und der Folgeinhalt korrekt behandelt.

### F6 — Telefonlabel-Katalog kennt die häufigste Briefformulierung nicht

**Fundstelle** `privacy/base.js:95-100` (`PHONE_LABEL_RE`) enthält
`anzurufen unter`, `erreichbar unter`, `unter der (Ruf)nummer`.

**Reproduktion / Ist**

```
"Rufen Sie mich an unter 0151 23456789."   → unverändert im Klartext
"Erreichbar: 0151 23456789"                → "Erreichbar: [PHONE_REDACTED]"
```

**Warum** Die labelgetriebene Telefonerkennung ist bewusst konservativ, aber
diese Lücke ist rein lexikalisch und billig zu schließen. Story **BL-021.1**.

**Auftrag** Varianten `rufen Sie … an unter`, `rufen Sie … unter`,
`melden Sie sich unter`, `Rückfragen unter`, `telefonisch unter` ergänzen.

**Abnahmekriterium** Test über die neuen Varianten plus Negativtest, dass
`unter` allein keine Zahl redigiert.

### F7 — Namen im Prosakörper ohne Trigger-Wort — erst Entscheidung, dann Umsetzung

**Fundstellen** `privacy/entities.js:592-640`
(`collectContextualNameCandidates`; ein Bigramm wird nur zum Seed, wenn
`before`/`after`/`contractual` in 45 bzw. 30 Zeichen greift, `:630`),
`privacy/entities.js:275` (`collectHeaderNameCandidates`, nur Kopfbereich oder
Kontaktblock), `privacy/engine.js:532` (Residual-Gate ruft dieselbe Funktion
und erbt den blinden Fleck).

**Reproduktion / Ist**

```
"Protokoll vom 12.03.2026\n\nFerdinand Quastenflosser berichtet ueber den Stand."
  → unverändert, Name im Klartext, kein Stopp

"Ansprechpartner: Cornelia Zwirbelbach\n\nAm Montag hat Ferdinand Quastenflosser die Rechnung geschickt."
  → "Ansprechpartner: [PERSON_001]" + zweiter Name weiterhin im Klartext
```

Auch ein starker Personenanker (`strongPersonAnchor === true`) hebt die
Erkennung im Prosakörper nicht.

**Warum kein blinder Fix** Bei einem Trigger (`von`, `durch`, `Herr`,
`Kontakt`, nachfolgende Kontaktdaten) und bei alleinstehenden Namenszeilen
greift die Erkennung korrekt — die Kontextbindung ist eine bewusste
Designentscheidung. Ich habe `DECISIONS.md` und `docs/canonical/contracts/`
durchsucht und **keine** aktive Entscheidung gefunden, die unlabelled
Prosanamen aus dem Umfang nimmt. Eine Designentscheidung ohne kanonische Grenze
ist gegenüber dem Anwender eine unausgesprochene Zusage.

**Auftrag** Bringe zuerst eine Entscheidung herbei. Lege genau zwei Optionen
mit ihren Kosten vor:

- **Option 1:** Bei vorhandenem starkem Personenanker meldet das Residual-Gate
  ein namensförmiges Bigramm im Prosakörper als `PERSON_CANDIDATE` und stoppt
  fail-closed. Kosten: mehr Stopps bei Prosadokumenten. Nutzen: keine stille
  Unter-Redaktion.
- **Option 2:** Die Grenze wird als aktive Entscheidung dokumentiert und in
  `PRODUCT.md`, `ANLEITUNG.md` und dem Compliance-Header sichtbar gemacht.
  Kosten: der Anwender muss es wissen. Nutzen: kein Stopp-Regen.

Setze erst nach menschlicher Wahl um. Story **BL-021.1**.

**Abnahmekriterium** Die gewählte Option steht als aktive Entscheidung in
`DECISIONS.md`, ist in `TRACEABILITY.md` mit Testdatei verknüpft, und ein Test
sichert das gewählte Verhalten für beide Reproduktionen.

---

## 2. P1 — Über-Redaktion und Inhaltszerstörung

Diese Befunde lassen keinen Namen durch. Sie zerstören aber Inhalt im
freigegebenen Ergebnis oder blockieren Kern-Anwendungsfälle.

### F8 — Harmlose Spaltenüberschrift blockiert die Datei dauerhaft

**Fundstellen** `privacy/base.js:589` (`SENSITIVE_HEADER_FRAGMENT_RE`),
`:652-663` (`unresolvedSensitiveHeader`), Gate `privacy/engine.js:520`.

**Reproduktion / Ist**

```js
for (const h of ['Name','Mitarbeiter','Kunden','Personal','Patienten',
                 'Rechnungs','Fall','Akten','Lieferanten','Abteilung']) {
  const md = `| ${h} | Rolle |\n| --- | --- |\n| Anna Beispiel | Testerin |\n`;
  try { anonymizeMarkdown(md,'customer_document'); console.log('OK   '+h); }
  catch (e) { console.log('STOP '+h); }
}
// OK:   Name, Abteilung
// STOP: Mitarbeiter, Kunden, Personal, Patienten, Rechnungs, Fall, Akten, Lieferanten
//       → TABLE_STRUCTURE_AMBIGUOUS
```

`TABLE_STRUCTURE_AMBIGUOUS` ist strukturell und verschwindet über die drei
Pässe (`MAX_PASSES = 3` in `gateway/compliance.js:9`, Schleife `:27`) nie. Die korrekt redigierte Tabelle wird
trotzdem gestoppt.

**Soll** Nach dem eigenen Vertrag in `docs/canonical/TRACEABILITY.md:316`
(BL-021.1, DS-049) sollen **„verschobene, anders breite oder überlange sensible
Strukturen"** `TABLE_STRUCTURE_AMBIGUOUS` liefern. Eine einzeilige Kopfzeile
gleicher Breite ist keins davon. Die Auslösebedingung ist also breiter als ihr
dokumentierter Vertrag.

**Warum** `Mitarbeiter`, `Kunden`, `Personal`, `Patienten`, `Fall`, `Akten`
sind normale Spaltentitel in genau den Dokumenten, für die dieses Produkt
gebaut ist. Für Personal- und Kundenlisten heißt der heutige Zustand „sicher
nicht verarbeitet" statt Ergebnis. Die vorhandenen Tests
(`test-pii-regression.js:1714-1725` und `:1740-1744`) fixieren die Stopp-Richtung nur für die
**beabsichtigten** Fälle, nicht für eine schlichte Kopfzeile.

**Auftrag** Der Ambiguitätsverdacht darf nur greifen, wenn die
Kopfblock-Rekonstruktion tatsächlich mehrzeilig oder breitenabweichend ist —
also genau im Umfang von `TRACEABILITY.md:316`.

**Wechselwirkung mit F1/F2, unbedingt beachten:** Repariere F8 nicht so, dass
daraus ein stiller Durchlass wird. Bei zwei Spalten stoppt `Mitarbeiter` heute,
bei drei Spalten redigiert es korrekt — der Mechanismus ist in beide Richtungen
instabil. Nach dem Fix muss `| Mitarbeiter | Rolle |` **redigieren**, nicht
durchlassen.

**Abnahmekriterium** Test über alle zehn Kopfzeilen, je mit zwei und drei
Spalten. Erlaubt: Redaktion. Nicht erlaubt: stiller Durchlass; nicht erlaubt:
Stopp bei einzeiliger Kopfzeile gleicher Breite. Die bestehenden Fälle in
`test-pii-regression.js:1714-1725` und `:1740-1744` müssen weiterhin stoppen.

### F9 — Batch-Alias wird kontextfrei in Folgedokumente übertragen

**Fundstellen** `privacy/engine.js:330` und `:366-372`, Aliasquelle
`privacy/engine.js:213-221`, Mechanismus `matchKnownAliases` in
`batch-pseudonym-registry.js`.

**Reproduktion / Ist** — eine gemeinsame Registry über vier Dokumente,
reproduziert in **beiden** Vertragsversionen `v1` und `v2`:

```
Dok1: "Ansprechpartner: Mueller Einkauf"      → "[PERSON_001]"
Dok2: "Der Einkauf hat den Vertrag geprueft. Einkauf und Vertrieb arbeiten zusammen."
        → "Der [PERSON_001] hat den Vertrag geprueft. [PERSON_001] und Vertrieb ..."
Dok3: "Name: Anna Sommer"                     → "[PERSON_002]"
Dok4: "Im Sommer war das Wetter gut."         → "Im [PERSON_002] war das Wetter gut."
```

**Soll** Ein Batch-Alias ist ein Identitätshinweis, keine Ersetzungslizenz.

**Warum** **DS-084** (`DECISIONS.md:1073-1075`) sagt selbst: „**Gleiche
Schreibweise ist kein Beweis realer Identität**; Namensvarianten und
mehrdeutige Nachnamen dürfen nicht als vollautomatische Personenauflösung
verkauft werden." Genau das passiert hier: die Jahreszeit `Sommer` wird zur
Person, weil in einem früheren Dokument desselben Stapels eine `Anna Sommer`
vorkam. Der Mechanismus ist kanonisch (`TRACEABILITY.md:167`,
BL-030.2/DS-084), aber die **kontextfreie literale Ersetzung** widerspricht dem
Prinzip derselben Entscheidung. `looksSurname` akzeptiert zahlreiche
gewöhnliche Substantive; verifiziert wurden unter anderem `Bericht`,
`Abteilung`, `Vertrag`, `Rechnung`, `Leitung`, `Team`, `Auftrag`, `Angebot`,
`Mitarbeiter`, `Einkauf`, `Vertrieb`, `Zentrale`.

Wirkung: stille, batchweite Zerstörung des freigegebenen Markdowns und ein
verunreinigtes Mapping — bei bis zu 200 Dateien je Stapel potenziell in allen
Folgedokumenten.

**Auftrag** Ein persistierter Alias darf nur greifen, wenn das **aktuelle**
Dokument an der Fundstelle selbst Personenkontext liefert (Label, Honorativ,
Nachbarschaft) — analog zu `collectHeaderNameCandidates`. Story **BL-030.2**,
Entscheidung **DS-084**.

**Abnahmekriterium** Test mit gemeinsamer Registry über beide
Vertragsversionen: Dok2 und Dok4 bleiben unverändert, während ein
Folgedokument mit echtem Personenkontext (`Herr Einkauf`,
`Ansprechpartner: Sommer`) weiterhin dasselbe Pseudonym erhält. Der zweite Teil
ist wichtig, damit du die gewollte Wiedererkennung nicht zerstörst.

### F10 — `i`-Flag hebt die Großschreibungsbedingung von `NAME_TOKEN` auf

**Fundstelle** `privacy/entities.js:412`

```js
const inline = new RegExp(`…${PERSON_LABEL}…[ \t]*:[ \t]*(${NAME_TOKEN}[ \t]+${NAME_TOKEN})`, 'giu');
```

`NAME_TOKEN` beginnt mit `[\p{Lu}\p{Lt}]`; das `i`-Flag macht diese Klasse
wirkungslos.

**Reproduktion / Ist**

```
"Autor: Schmidt schrieb dies."   → "Autor: [PERSON_001] dies."
```

Das Prosawort `schrieb` wird in den Namens-Seed gezogen.

**Warum** Drei Folgen: (a) Inhaltsverlust im Ergebnis; (b) `Schmidt schrieb`
erhält eine **eigene** Pseudonymidentität, die von `Schmidt` abweicht — die
Pseudonymstabilität über Dokumentgrenzen bricht, die DS-059 zusagt — DS-059 hat DS-019
ersetzt (`DECISIONS.md:12`), zitiere DS-019 nicht als lebende Zusage; (c) es speist F9, wenn das Folgewort ein großgeschriebenes Substantiv
ist (`Ansprechpartner: Mueller Einkauf`). Story **BL-021.1**.

**Auftrag** `i`-Flag entfernen oder die Zeichenklassen explizit
großschreibungsgebunden formulieren. Prüfe, ob das `i` für den **Labelteil**
gebraucht wird — falls ja, trenne Label und Namensteil in zwei Ausdrücke,
statt die Großschreibung global aufzugeben.

**Abnahmekriterium** `Autor: Schmidt schrieb dies.` ergibt
`Autor: [PERSON_001] schrieb dies.` und dasselbe Pseudonym wie `Autor: Schmidt`
allein. Bestehende Labelfälle bleiben grün.

---

## 3. P2 — Evidenz und Gates

Fehlerrichtung in diesem Abschnitt: **keine Redaktionsrichtung.** Es geht um
fehlende oder falsch behauptete Evidenz, Vertragswidersprüche und fehlende
Hinweise. Kein Befund hier lässt einen Namen durch, und keiner darf durch
seinen Fix einen durchlassen.

### F11 — Der E0-Nachweis für die schwerste Fehlerklasse bricht auf einem frischen Clone ab

**Fundstellen**

- `docs/canonical/BACKLOG_EVIDENCE_MATRIX.md:15-19` nennt „alle vier echten
  DOCX aus dem 100-Dateien-Korpus **und den 15-DOCX-Komplexkorpus**" als E0 für
  RC119 / BL-021.1 / BL-030.2 / BL-050.1 — den Nachweis, der die im **realen**
  Lauf `Lauf-20260907-163522-142350c1` belegte Personenunterredaktion schließt.
- `tests/test-complex-docx-uat-corpus.mjs:37` ruft ungeschützt
  `fs.readdirSync(inputs)`. Die Datei hat auf 81 Zeilen keinen Guard, kein
  try/catch und kein Skip; `:37` ist die erste ausgeführte Dateisystemzeile.
- `scripts/generate-complex-docx-uat.py` ist versioniert, hängt aber an
  **keinem** npm-Skript und keinem Hook. `package.json` hat `uat:fixtures` und
  `uat:format-corpus`, aber kein Pendant. Aufgerufen wird der Generator nur in
  `docs/acceptance/STANDALONE_COMPLEX_DOCX_TEST_KIT/README.md:54`.
- Der Test läuft nur in `test:standalone` (`package.json:13`), **nicht** in
  `tests/run-product-suite.js`. `npm test` erreicht ihn also nicht.

**Reproduktion / Ist** — auf frischem Clone verifiziert:

```
$ node tests/test-complex-docx-uat-corpus.mjs
Error: ENOENT: no such file or directory, scandir
  '.../docs/acceptance/STANDALONE_COMPLEX_DOCX_TEST_KIT/inputs'
  at .../tests/test-complex-docx-uat-corpus.mjs:37:19
```

Der Test **stürzt ab**, statt eine Aussage zu treffen.

**Wichtige Präzisierung — Fixtures NICHT versionieren.** Ein naheliegender
Weg wäre, die 15 DOCX ins Repo zu legen. Das ist **verboten**: `.gitignore:1-9`
schließt `*.docx` global aus, mit ausdrücklicher Begründung („never commit
document payloads … CI fails on any tracked file of these types", siehe
`SECURITY.md`). Die Abwesenheit der Eingaben ist gewollt; die deterministische
Regenerierung ist in `README.md:49-58` dokumentiert. Der Defekt ist **nicht**
„Evidenz existiert nicht", sondern: der Generator hängt an keinem Skript und
der Test hat keinen Guard.

**Positivbeispiel im Repo** `tests/test-standalone-format-corpus.mjs:23-31`
erzeugt seinen Korpus selbst (`generate(first); generate(second);`), obwohl
`docs/acceptance/STANDALONE_100_FORMAT_TEST_KIT/` ebenfalls nur ein `README.md`
enthält. Bau F11 nach diesem Muster.

**Warum du das zuerst nach P0 bearbeiten sollst** Das ist der Nachweis für
genau die Fehlerklasse, die dieser Auftrag in F1 erneut gefunden hat. Solange er
nicht läuft, arbeitest du bei F1 und F2 ohne Netz.

**Auftrag**

1. Generator in ein npm-Skript verdrahten, analog `uat:fixtures` /
   `uat:format-corpus`, und als Vorbedingung des Tests aufrufen. Bevorzugt ein
   **Node**-Generator analog `tests/lib/docx-review-fixtures.js`, weil Python
   nach `docs/RELEASE.md:96` keine Anwendervoraussetzung ist und ein
   Python-Zwang im Testpfad die Reproduzierbarkeit senkt.
2. Der Test muss ein fehlendes `inputs/` als klaren Fehler mit
   Handlungsanweisung melden, nicht als ENOENT-Stacktrace.
3. `BACKLOG_EVIDENCE_MATRIX.md:15-19` und `docs/TESTING.md:376-380` („Der
   DOCX-Korpus **enthält** 15 … Dateien") müssen den tatsächlichen Zustand
   beschreiben: generiert, nicht enthalten.

**Vertrag, den der Generator erfüllen muss — sonst erschließt du 15 Dokumente
rückwärts.** `tests/test-complex-docx-uat-corpus.mjs:19-35` hält die 15
Dateinamen **und** je einen erwarteten Inhaltsanker hart verdrahtet (z. B.
`['01-kundenprofil-kurz.docx', 'Product Owner', 'Laura Stein']`) und prüft sie
mit `assert.deepEqual`. Der Generator muss also genau diese Namen und diese
eingebetteten Strings erzeugen. Bytegleichheit ist **zwischen zwei Läufen des
neuen Generators** gefordert, nicht gegenüber der Python-Ausgabe. Wenn du auf
Node umstellst, entferne `scripts/generate-complex-docx-uat.py` nicht
stillschweigend, sondern markiere sie im selben Commit als ersetzt und ziehe
`docs/acceptance/STANDALONE_COMPLEX_DOCX_TEST_KIT/README.md:49-58` nach.

**Fehlerrichtung** Evidenzlücke, keine Redaktionsrichtung.

**Abnahmekriterium** `git clone` → `npm ci` → `npm run test:standalone` läuft
ohne manuellen Zwischenschritt grün durch, oder scheitert mit einer Meldung,
die genau sagt, welches Kommando fehlt. Kein ENOENT-Stack.

### F12 — Der Netzwerkvertrag nennt „Export" im Geltungsbereich, der Export läuft aber ungeschützt im MCP-Hauptprozess

Dieser Befund ist gegenüber der ersten Fassung **eingeschränkt**. Die
ursprüngliche Behauptung „der Guard fehlt im Gateway-Prozess" ist als
Designentscheidung widerlegt — es bleibt ein präziser Vertragswiderspruch.

**Was widerlegt ist** `docs/canonical/contracts/NETWORK_BOUNDARY_V1.md:16` sagt
ausdrücklich, dass **„Parser und Companion"** den Guard laden.
`docs/PLUGIN_SECURITY_MODEL.md:33-36` sagt: „**Der MCP-Hauptprozess prüft nur
Metadaten** … Er rekonstruiert keinen Review-Rohtext." Der historische Verstoß
ist als geschlossen geführt (`BACKLOG.md:554`, BL-020.3). Dass
`server/index.js` (15 Zeilen) nur `./mcp-server` requirt und das ausgelieferte
`.mcp.json` ohne `--require` startet, ist also gewollt.

**Was bleibt** `NETWORK_BOUNDARY_V1.md:5` nennt den Geltungsbereich mit
**vier** Rollen: „Rohinhalte dürfen in **Parser, OCR, Review und Export** keine
… Netzwerkfähigkeit erhalten." Der Export läuft aber im Hauptprozess:
`plugins/data-secure/server/mcp-server.js:179` ruft
`replayPendingResultExports()` direkt. Der zweite Aufrufweg
`gateway/result-export-replay-worker.js` ist ein **`worker_threads`**-Worker,
teilt also den Prozess und erbt dessen fehlenden Guard — anders als die über
`background-role-launcher.js` gestarteten Kindprozesse.

Laufzeitbeweis:

```bash
# Aus dem Repo-Root ausfuehren. Mit relativem Pfad aus einem anderen
# Arbeitsverzeichnis stirbt der Aufruf mit MODULE_NOT_FOUND.
cd <REPO>
node -e "require('./plugins/data-secure/server/mcp-server.js'); \
  console.log('DENY_ACTIVE=', globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__)"
# → DENY_ACTIVE= undefined
```

**Kein belegter Abflusspfad.** Über den eigenen Code findet sich kein
`require('http'|'net'|'tls'|'dns')`, kein `fetch(`, kein `WebSocket`. Es ist
eine Lücke in der Verteidigungstiefe plus ein Vertragswiderspruch, kein
bewiesener Defekt.

**Auftrag** Entscheide eines von beidem und setze es konsistent um:

- **Weg A:** Vertrag präzisieren. `NETWORK_BOUNDARY_V1.md:5` nennt „Export"
  nicht mehr pauschal, sondern grenzt ab, welcher Exportanteil im Hauptprozess
  läuft und warum er ohne Guard vertretbar ist (er verarbeitet verifizierte,
  bereits anonymisierte Bytes, keine Rohinhalte).
- **Weg B:** Guard laden. `require('./network-deny.cjs')` in `server/index.js`
  **vor** `require('./mcp-server')`. Beachte den Kommentar dort: der
  Einstiegspunkt soll klein bleiben, damit ein Ladefehler keinen Node-Stack mit
  lokalen Pfaden druckt — behalte die `try`/`catch`-Hülle. Prüfe vorher, ob
  irgendein Produktpfad im Hauptprozess `child_process` oder lokale Listener
  braucht; der Guard sperrt letztere.

Ergänze in **beiden** Fällen `tests/test-network-boundary.js` um eine
Assertion, die `plugins/data-secure/server/index.js` und beide `.mcp.json`
abdeckt — `plugins/data-secure/.mcp.json` (quellseitig) und
`dist/marketplace-repo/plugins/data-secure/.mcp.json` (ausgeliefert, existiert
erst nach `npm run build`; die Assertion muss das Fehlen tolerieren statt zu
scheitern) — heute
prüft `:29-46` nur `runtime.js`, `background-role-launcher.js`,
`companion/supervisor.js`, `gateway/batch-executor.js` und
`native/sea/bootstrap.cjs`. Genau deshalb konnte diese Frage überhaupt offen
bleiben.

**Abnahmekriterium** Vertrag und Implementierung sagen dasselbe, und ein Test
sichert die Aussage für den Einstiegspunkt. Story **BL-020.3**,
Entscheidung **DS-018**.

### F13 — Netzwerkpfade als Ergebnisordner: kein Defekt, aber ein fehlender Hinweis

Dieser Befund ist gegenüber der ersten Fassung **abgeschwächt**.

**Was widerlegt ist** Der Kanon fordert Lokalität nur für den *Privacy*-Ordner:
`PRODUCT.md:77` „Der **Privacy-Ordner** muss lokal sein; Cloud-Sync,
Netzwerkpfade und Links sind gesperrt." Für den sichtbaren Ergebnisordner ist
die Permissivität gewollt — `mcp-server.js:43` erlaubt ausdrücklich „Ein bereits
mit Cowork verbundener dedizierter Ergebnisordner kann gewählt werden", und
Cloud-Sync wird bewusst nur **gemeldet** (`result-folder-config.js:147`
`isCommonSyncFolder` → `sync_folder_notice`, `mcp-server.js:161/180`). Ein
UNC-Pfad ist damit kein Vertragsbruch.

**Was bleibt** `gateway/result-folder-config.js:22` (`inspectRoot`) prüft
Absolutheit, Verzeichnis, Symlink, Realpath und dev/ino, aber keinen
Netzwerkpfad — obwohl `gateway/common.js:46` (`storageStatus`) `network_path`
bereits erkennt. Für Cloud-Sync warnt das Produkt sichtbar, für Netzwerkpfade
**gar nicht**. Bei Standalone liegt im Ergebnisbaum die sichtbare
`DataSecure-Zuordnung.csv` mit **Originalnamen**; ein Anwender, der eine
SMB-Freigabe wählt, erfährt nichts.

**Auftrag** Einen zu `sync_folder_notice` analogen, inhaltsfreien Hinweis für
Netzwerkpfade ergänzen, in beiden Produkten, und ihn in `PRODUCT.md` und
`ANLEITUNG.md` beschreiben. **Keine** Sperre — das wäre eine
Produktverschärfung ohne Kanongrundlage. Story **BL-002**, Entscheidung
**DS-080**.

**Abnahmekriterium** Test mit simuliertem UNC-Pfad in beiden Produkten
verlangt den Hinweis und **keine** Ablehnung. Junctions und Reparse-Punkte
bleiben unverändert gesperrt — die Prüfung dort ist wirksam, fass sie nicht an.

### F14 — Legacy-Ausnahme steht nur im Code, nicht im Kanon, und hat keinen Test

**Fundstelle** `gateway/result-export.js:678-680` schreibt bei
`schema === LEGACY_MARKDOWN_SCHEMA` (`:19` = `datasecure-result-export/3`) beim
Replay eine `DataSecure-Zuordnung.csv` **auch im Konvertierungskanal**, obwohl
`PRODUCT.md:117-119` für reine Konvertierung „ausschließlich `.md`-Nutzdokumente
ohne Zuordnungsdatei nach `DataSecure-Markdown/Lauf-…`" zusagt.

**Warum die Wirkung gering ist** Der Kommentar bei `:675-677` begründet es
ausdrücklich („Older v3 plans retain their already promised mapping"), jede
Zeile ist als „Nicht anonymisiert" gekennzeichnet, der Ergebnisordner ist
lokal, und der Kanon deckt die Legacy-Schonung generisch (`BACKLOG.md:334`,
`TRACEABILITY.md:346`, `CURRENT_STATE.md:187`).

**Warum du es trotzdem anfassen sollst** Zwei Gründe. Erstens nennt der Kanon
nirgends das Schreiben einer **neuen** Zuordnungsdatei beim Replay — jedes
künftige Review liest das als Vertragsbruch; dieses hat es getan. Zweitens
deckt **kein Test** diesen Zweig ab: eine Suche nach `result-export/3` bzw.
`LEGACY_MARKDOWN_SCHEMA` in `tests/` liefert null Treffer, und der
Legacy-Replay-Test `test-result-folder-export.js:209-221` betrifft den
Anonymisierungskanal.

**Auftrag** Einen Satz in `PRODUCT.md` bzw. als Präzisierung in `DECISIONS.md`
ergänzen **und** einen Test für den v3-Replay-Zweig schreiben. Keine
Verhaltensänderung.

**Abnahmekriterium** `npm run test:docs` grün, ein Test deckt den Zweig ab, und
ein Reviewer findet die Ausnahme im Kanon, ohne den Code zu lesen.

### F15 — `termination_unconfirmed` wird für den breiten Stapel nicht projiziert

**Fundstellen** `gateway/batch-recovery.js:134` gated auf
`schema === 'datasecure-batch/5'`; der Halt in
`gateway/batch-executor-runner.js:67-68` und `:97` gilt aber für
`product_channel === 'standalone'`, also auch für Schema `/6`
(`gateway/batch-intake.js:235`).

**Ist** Endet der Konverter unbestätigt, werden alle Restdateien über
`stopUnstartedConversionItems` mit `CONVERSION_TERMINATION_UNCONFIRMED`
gestoppt, die Statusprojektion enthält aber kein `termination_unconfirmed`. Der
Anwender sieht „sicher nicht verarbeitet" ohne den definierten Grund — für den
in `gateway/batch-item-processor.js:56` ein Produkttext existiert („Weitere
Dateien werden nicht gestartet").

**Warum** Fortsetzbarkeit bleibt erhalten, kein Datenrisiko. Aber der Anwender
bekommt bei einem Stapelabbruch keine Erklärung, obwohl eine formulierte
existiert. Story **BL-010.30**.

**Auftrag** Gate auf beide Schemata erweitern.

**Abnahmekriterium** Test mit einem `/6`-Stapel und unbestätigter
Konverterterminierung verlangt `termination_unconfirmed` in der Projektion.

### F16 — Ein textloses Bild kippt ein sonst lesbares PDF

**Fundstellen** `standalone/conversion-worker-child.js:184-196` fügt
`OCR_TEXT_EMPTY` hinzu, sobald *eine* gerasterte Bildfläche keinen OCR-Text
ergibt — auch wenn `hasNativeText` true ist. `wide-privacy-extraction.js:58`
macht daraus einen harten Stopp.

**Ist** Ein einseitiges PDF mit Textlayer und Logo endet als „sicher nicht
verarbeitet" (`PARSER_COVERAGE_UNVERIFIED`). **Soll** Nach dem Produktvertrag
„verwendbar mit Auslassungen".

**Warum** Richtung ist fail-closed, kein Datenrisiko — aber bei
Geschäfts-PDFs mit Logo oder Briefkopf ist die Falsch-Stopp-Rate realistisch
hoch, und das ist der Regelfall, nicht die Ausnahme. Story **BL-023.4**.

**Auftrag** `OCR_TEXT_EMPTY` nur setzen, wenn die Datei **insgesamt** keinen
verwertbaren Text liefert. Eine einzelne textlose Bildfläche neben vorhandenem
nativem Text ist eine Auslassung, kein Leerbefund. Die harte Sperre für
tatsächlich leere Extraktion in `wide-privacy-extraction.js:58` bleibt
unverändert — sie ist korrekt.

**Abgrenzung zur harten Produktgrenze.** `CLAUDE.md` sagt: „XLSX, PPTX, PDF,
Scan-PDF und Bilder bleiben fail-closed, bis ihre kanonischen Stories erfüllt
und menschlich abgenommen sind." Das ist hier nicht berührt: Der Satz betrifft
die **Formatfreigabe im Cowork-Plugin**, und dort bleiben diese Formate bereits
bei der Aufnahme gesperrt. Du änderst ausschließlich die Gradbildung innerhalb
des bereits nach DS-087/DS-090 freigegebenen Standalone-Markdown-first-Pfads,
und die harte Sperre für tatsächlich leere Extraktion bleibt. Ändere das
Cowork-Gate nicht.

**Abnahmekriterium** Test mit (a) PDF mit Textlayer plus textlosem Bild →
`usable_with_omissions`, (b) PDF ohne jeden Text → weiterhin harter Stopp.

### F17 — Performance von `matchKnownAliases` ohne `known_alias_index`: erst messen

**Fundstellen** `batch-pseudonym-registry.js:436`
(`if (!completeStartIndex) return true;`), `:213-217`, `:470-482`; Prüfung `:417` gegen `MAX_TEXT_CHARS` (8.000.000, definiert in
`resource-limits.js:14`).

**Der Verdacht** `completeStartIndex` wird nur `true`, wenn `bindings.size === 0`
oder das persistierte `known_alias_index` es attestiert. Ein **vor rc123**
geschriebenes Journal hat `bindings`, aber kein `known_alias_index` — und es
wird angenommen, weil `batch-pseudonym-context.js:43-49`
`batch-pseudonym/v1` akzeptiert und `PRIVACY_RULESET_VERSION` unverändert
`de-business/2` ist. Dann liefert `isKnownStart` immer `true` und für **jedes**
Token werden alle Fenster-Startpunkte (bis `KNOWN_ALIAS_MAX_TOKENS = 160`) mit
je zwei HMACs sondiert. `gateway/compliance.js:9` setzt `MAX_PASSES = 3`; die Schleife `:27` ruft
`pii.anonymize` also bis zu dreimal pro Dokument. In diesem Pfad gibt es kein Timeout.

Gemeldete Messung: ~0,4 s mit Index gegen ~16,0 s ohne Index bei 200.000
Zeichen, extrapoliert ~15 s gegen ~10 min bei 8 M Zeichen.

**Diese Messung ist NICHT nachgestellt.** Der Codepfad ist plausibel, die
Zahlen sind ungeprüft. Behandle sie als Hypothese, nicht als Befund.

**Auftrag** Erst messen, dann entscheiden. Baue eine Messung mit einem
`v1`-Journalzustand **ohne** `known_alias_index` und einem tokenreichen Text
und berichte die echten Zahlen. Erst wenn sie den Verdacht bestätigen: für
Zustände ohne Index den Startindex einmalig aus `bindings` rekonstruieren oder
die Fensterprobe hart begrenzen. Story **BL-030.2**.

**Abnahmekriterium** Entweder eine dokumentierte Messung, die den Verdacht
widerlegt — dann ist nichts zu tun und du schreibst das in den Commit-Text —
oder ein Test, der eine obere Laufzeit- bzw. Sondenzahlgrenze auch für
`completeStartIndex === false` sichert. Heute sichert
`tests/test-batch-pseudonym-registry.js:472` nur den Indexpfad
(`probes < 26000`).

---

## 4. P3 — Kanonkorrekturen

Fehlerrichtung in diesem Abschnitt: **keine.** Reine Dokumentwahrheit — ein
Leser darf sich nicht auf überholte Evidenz oder eine ersetzte Namensvorgabe
stützen. Kein Code, keine Verhaltensänderung.

Reine Dokumentkorrekturen, kein Code. Fasse sie zu **einem** Commit zusammen,
weil sie ein Thema sind: Stand- und Evidenzbindung im Kanon.

### F18 — `CURRENT_STATE.md:548` bindet an eine ausdrücklich nicht übertragbare Evidenz

„Belegter Produktumfang" sagt für die reine Standalone-Konvertierung: „Der
Windows-Engineering-Paketnachweis ist an den oben genannten **RC108**-Commit
gebunden." Die Referenz ist auflösbar (`:346`, `:391`), aber `:349` sagt
ausdrücklich „Dieser Nachweis **gilt nur für RC108**". `:317` nennt RC111 / `b543589f` (Hash `:318`) als aktuellen geprüften Kandidaten, dessen Nachweis laut `:319-321`
„beide Modi, elf Konvertierungsergebnisse plus fehlerhafte CSV" umfasst — also
genau die reine Konvertierung. `:869` wiederholt den veralteten Satz („oben
gebundenen RC108-Windows-Paket").

**Soll** RC111 / `b543589f`. **Warum** Der Abschnitt, der den *belegten*
Produktumfang festhält, stützt sich auf ein Receipt, das dasselbe Dokument als
nicht übertragbar erklärt. Die richtige Bindung steht schon in der Datei.
Teilentlastung, die du nicht anfassen musst: `:383` bindet die *Aktivierung*
der Konvertierung korrekt historisch an `a742333`.

### F19 — `FORMAT_COVERAGE_MATRIX.md:133` nennt einen historischen Build „aktuell"

Dort steht „Der vollständige **aktuelle** Paket-/Sidecar-E2E-Lauf ist
bestanden: zwei bytegleiche **RC109**-Builds aus `6bf7d057…`", ZIP-SHA
`807940d1…`. `CURRENT_STATE.md:336` nennt denselben Build „Historischer
Kandidat RC109"; `BACKLOG_EVIDENCE_MATRIX.md:60` nennt „Aktueller Windows-Paketnachweis:
RC111 aus `b543589f`" — der Hash `6086d1eb…` ist die ZIP-SHA-256 (`:64`) und
kein Commit. `:143` erwähnt RC111 nur für die
`source_type`-Bindung, nicht als Paketnachweis. `docs/canonical/README.md:6-7` sagt ausdrücklich „Eine einzige lineare
Rangfolge wäre missverständlich"; `:13` macht `CURRENT_STATE.md` aber genau für
die Frage „Was ist heute wirklich implementiert?" führend — und darum geht es hier.

**Warum** Das ist das Dokument, das die Formatfreigaben trägt. Es darf nicht
auf überholte Evidenz zeigen.

### F20 — Der Komfortindex in `DECISIONS.md` ist veraltet

Die **Unterliste** „teilweise präzisiert" (`DECISIONS.md:16-20`) endet bei „die
UI-Vorbelegung aus DS-085 durch DS-086" und führt die Präzisierungen aus
`:1256` (DS-089), `:1300` (DS-091) und `:1323` (DS-092) nicht.

Zwei naheliegende Verschärfungen sind **falsch** und du sollst sie nicht
übernehmen: die Aktivliste `:8-10` kennt DS-088 bis DS-092 sehr wohl (sie
nennt den Bereich „DS-067 bis DS-092"), und sie ist nicht „unqualifiziert",
weil derselbe Aufzählungspunkt „jeweils mit den unten genannten
Präzisierungen" trägt.

**Ausdrückliche Einschränkung, damit du das richtig einordnest:** Das ist
**kein** Kanonwiderspruch. `:9` qualifiziert die Aktivliste mit „jeweils mit
den unten genannten Präzisierungen", und `:22-23` sagt „Der aktuelle operative
Status steht in `TRACEABILITY.md`". `TRACEABILITY.md` führt die Qualifikationen
vollständig (`:263` DS-058, `:288` DS-083, `:295` DS-089, `:296` DS-091,
`:297` DS-092). Die Kopfliste ist ein Komfortindex, kein Register.

**Auftrag** Kopfliste nachziehen. Aufwand klein, Nutzen: ein Leser, der nur die
Kopfliste sieht, wendet keine ersetzte Namensvorgabe an — genau der Fehler, den
DS-091 beheben soll.

### F21 — Vier Abschnitte heißen „Aktueller Entwicklungsstand"

`CURRENT_STATE.md:5` (RC123), `:69` (RC119), `:88` (RC117), `:194` (RC111) —
dazwischen fünf „Vorheriger Entwicklungsstand". Die Prosaregel `:29-33` legt
fest, dass ausschließlich der RC123-Abschnitt gilt, es ist also ein
redaktioneller Titelfehler und keine inhaltliche Doppelzusage.

**Auftrag** Alte Abschnitte auf „Vorheriger" bzw. „Historischer" umbenennen.
**Warum** Die Datei hebelt ihre eigene Widerspruchsregel durch die
Überschriften aus.

### F22 — Zwei Einstiegsverweise auf Arbeitsaufträge zeigen ins Leere

`CLAUDE.md:13` nennt `tasks/CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md`,
`tasks/README.md` nennt `AUFTRAG.md`. Beide existieren nicht.

**Auftrag** Eine Namenskonvention festlegen und beide Verweise darauf ziehen.
Nach `DOCUMENT_REGISTER.md:104` liegt „im Root von `tasks/` höchstens ein
aktueller schreibender Auftrag; daneben darf genau ein zeitgebundener
Read-only-Reviewauftrag liegen" — die Konvention muss dazu passen. Diese Datei
ist der aktuelle schreibende Auftrag; berücksichtige sie.

### F23 — Stand-Daten mehrerer in rc123 geänderter Dokumente wurden nicht nachgezogen

`c62d7ec` hat in diesen Dateien Inhalt geändert, aber nur die RC-Nummer, nicht
das Datum: `FORMAT_COVERAGE_MATRIX.md:3` (72 Zeilen geändert),
`PLUGIN_SECURITY_MODEL.md:3`, `DECISIONS.md:3` (176 Zeilen; enthält DS-088 bis
DS-092, jeweils „Am **07.09.2026** festgelegt" — das Dokument datiert sich also
vor seine eigenen Entscheidungen), `PRODUCT.md:3`, `PRODUCT_VISION.md:3`,
`UML_ARCHITECTURE.md:3`, `TESTING.md:3`, `UAT_TEST_KIT/README.md:3`,
`STANDALONE_UAT_TEST_KIT/README.md:3`. Zusätzlich trägt das in rc123 **neu**
angelegte `STANDALONE_COMPLEX_DOCX_TEST_KIT/README.md:3` die sechs RCs alte
Version `3.2.0-rc117`.

**Versionsnummern sind dagegen sauber** und musst du nicht anfassen:
`package.json`, `BUILD_INFO.json`, `manifest.json`,
`plugins/data-secure/.claude-plugin/plugin.json`, `plugins/data-secure/VERSION`,
`Cargo.toml` und `tauri.conf.json` stehen konsistent auf `3.2.0-rc123`.

### F24 — Die GO-Regel des UAT-Kits ist schwächer als der Releasevertrag

`docs/acceptance/UAT_TEST_KIT/README.md:64` verlangt für ein Release-GO „der
**100**-Dateien-Stapel"; `04-batch-100` sind 100 TXT-Dateien.
`docs/PILOT-ABNAHME.md:31` nennt als Performance-Kriterium „**200** Dateien und
bis zu 500 MiB", DS-010 (`DECISIONS.md:97`) setzt die Grenze auf 200.
`BL-051.3` („Versionneuen UAT-Serienlauf mit 200 Dateien") ist korrekt als
**offen** geführt.

**Warum** Die 500-MiB-Hälfte ist separat über `test:batch-500mb-local`
abgedeckt; es fehlt nur der Dateizahl-Grenzlauf. Der Defekt ist, dass ein Team,
das dem einzigen zugelassenen Kit folgt, GO vergeben könnte, während BL-051.3
offen ist.

**Auftrag** Benenne die Grenzabnahme im Kit ausdrücklich als getrennten,
zusätzlich erforderlichen Test und verweise auf BL-051.3 als offen. Story
**BL-051.3**.

**Ausdrücklich nicht in Commit 12:** Die Alternative „Fixtures und GO-Regel auf
200 heben" bedeutet 100 neue Fixtures plus Generatorarbeit und ist damit kein
Dokumentcommit. Wenn der Auftraggeber sie wählt, wird sie ein eigener Commit
mit eigenen Tests.

---

**Abnahmekriterium für F18 bis F24 gemeinsam:** `npm run test:docs` ist grün,
und eine Volltextsuche über die aktiven Dokumente findet (a) keinen Verweis
mehr auf RC108 oder RC109 als *aktuellen* Nachweis, (b) keine zweite
Überschrift „Aktueller Entwicklungsstand", (c) keinen Verweis auf eine nicht
existierende Auftragsdatei, (d) kein „Stand:"-Datum, das älter ist als die
jüngste inhaltliche Änderung derselben Datei. Für F20 zusätzlich: die Unterliste
„teilweise präzisiert" nennt DS-089, DS-091 und DS-092.

## 5. P4 — Standalone-Desktop, klein

Fehlerrichtung in diesem Abschnitt: **keine Redaktionsrichtung.** Bedienbarkeit,
eine irreführende Meldung und eine Inkonsistenz in einer
Verteidigungstiefe-Prüfung. Kein Datenabfluss.

### F25 — `process-results` verliert seine Freigabe unwiderruflich

`apps/datasecure-standalone/frontend/app.js:386-387` setzt in
`renderAdmission` `currentSessionRunStarted = false`; gesetzt wird es nur in
`:534` nach erfolgreichem Start, und `resetAdmissionUi` (`:366-381`) stellt es
nicht wieder her. `:314-315` bildet
`currentResultsAvailable = currentSessionRunStarted && …`.

**Reproduktion** Start → „Markdown anonymisieren" → Dateien wählen → Starten →
warten bis „Fertig" → erneut „Dateien auswählen". **Ist** Der Button ist ab der
neuen Auswahl deaktiviert, mit dem sachlich falschen Tooltip „Noch kein
Ergebnisordner verfügbar." (`:115`), und bleibt es für den Rest der Sitzung.

**Präzisierung** Die Sperre tritt bereits mit der neuen Auswahl ein (`:386`);
„Auswahl leeren" ist nicht die Ursache. Der Kommentar `:310-313` begründet den
Ausschluss **früherer App-Sitzungen** („Historical results remain available
through the history table") — er deckt aber nicht das Zurücksetzen eines in
**dieser** Sitzung abgeschlossenen Laufs.

**Warum** Kein Ergebnisverlust, der Lauf bleibt über den Verlauf erreichbar.
Aber der Tooltip behauptet etwas Falsches, und das ist bei einem
Datenschutzwerkzeug teurer als bei anderer Software. Story **BL-010.33**.

**Auftrag** Entweder den Zustand nach `resetAdmissionUi` erhalten, oder den
Tooltip auf den echten Grund ändern.

**Abnahmekriterium** Ein Fall in `tests/test-standalone-frontend.js` fährt die
Folge Start → Lauf abschließen → neue Auswahl und verlangt entweder einen
aktiven Button oder einen Tooltip, der nicht behauptet, es gebe keinen
Ergebnisordner.

### F26 — Windows-Junction wird beim Öffnungsziel nicht erkannt

`apps/datasecure-standalone/tauri-contract/src/main.rs:844` prüft nur
`file_type().is_symlink()`, was für `IO_REPARSE_TAG_MOUNT_POINT` **false**
liefert. Der Eingabepfad in derselben Datei prüft zusätzlich
`file_attributes() & 0x400` (`:152-158`).

**Warum die Wirkung begrenzt ist** Es wird nur ein Ordner im Dateimanager
geöffnet, kein Inhalt an Claude oder ins Netz gegeben (`external_disclosure:
false` bleibt korrekt); das Ziel stammt nicht aus Anwendereingabe, sondern aus
der privaten Sidecar-Antwort (`:828-836`), und die Node-Seite bindet
Ergebnispfade zusätzlich per Realpath und Identität
(`result-folder-config.js:139-144`, `result-export.js:467-476`). **Warum
trotzdem** Es bleibt eine Asymmetrie gegen die Regel, die dieselbe Datei auf
der Eingabeseite schon anwendet (Swap-Angriff auf den Laufordner).

**Auftrag** Dieselbe Reparse-Point-Prüfung auf das Öffnungsziel anwenden.

**Abnahmekriterium** Ein Rust-Unittest legt ein Öffnungsziel mit gesetztem
Reparse-Attribut vor und verlangt die Ablehnung. `npm run test:standalone:rust`
bleibt grün.

### F27 — Ein Testname verspricht mehr als seine Assertions halten

`tests/test-standalone-desktop-contract.js:228` heißt „prepared selections can
remove exactly one **bounded** item", prüft aber nur Capability, Permission,
Signatur, Aufruf und Inhaltsfreiheit. Die Schranke
`selection_index >= MAX_BATCH_FILES` (`main.rs:687`) wird von **keiner**
Assertion geprüft.

**Ausdrücklich: keine Abdeckungslücke.** `main.rs:1638-1650`
(`prepared_selection_removal_is_index_bounded_and_content_free`) prüft real
`removal_request(id, 199)` → ok und `removal_request(id, 200)` →
`STANDALONE_SELECTION_INVALID`, und läuft über `test:standalone:rust`.
Zusätzlich begrenzen `standalone/desktop-ipc.js:47-49` und
`standalone/application-service.js:508` (gegen die echte Queue-Länge).

**Auftrag** Nur den Testnamen präzisieren **oder** eine Grenzwert-Assertion
ergänzen. Keine Codeänderung. **Warum** Ein Testname, der mehr verspricht als
er prüft, ist im nächsten Review wieder ein Fehlalarm — dieses hat ihn
ausgelöst.

---

## 6. Ausdrücklich NICHT Teil dieses Auftrags

**Drei Befunde wurden adversarisch widerlegt. Untersuche sie nicht erneut.**

1. **Leere OCR im reinen Konvertierungspfad ist kein fehlender
   Fail-closed-Fall.** `standalone/conversion-worker-child.js:95` gibt bei
   leerem OCR eine erfolgreiche Extraktion mit leerem Markdown zurück, und
   `convert-next.js:49` validiert nur und publiziert sie danach. Das ist **zugesagt**:
   `docs/FORMAT_COVERAGE_MATRIX.md:87` sagt für BMP „Leertext bleibt
   ausdrücklich als OCR-Leerbefund erkennbar", und die Sperre in
   `PRODUCT.md:59` steht in der Tabelle *„Eingaben und Ergebnisse der
   **Anonymisierung**"*, gilt also nicht für die reine Konvertierung. Der
   Anonymisierungspfad gated korrekt (`wide-privacy-extraction.js:58`). Fass
   das nicht an.
2. **Die Gradzählung zwischen den Kanälen ist keine Inkonsistenz.**
   `core/batch-result-projection.js:59` zählt für Schema `/5` über
   `item.extraction_grade`, der Zweig für Schema `/6` über
   `document_result.grade`. **DS-090** (`DECISIONS.md:1271-1272`) rechtfertigt
   genau das: „Damit ist eine erfolgreiche Anonymisierung des extrahierten
   Markdown-Inhalts nicht länger fälschlich von vollständiger
   DOCX-Container-Coverage abhängig", und `:1267-1269` hält die Lücke „separat
   im `source_extraction_coverage`-Status" fest. Für die reine Konvertierung
   ist der Extraktionsstand umgekehrt die einzige Produktzusage. Beide Zweige
   sind über `npm run test:result-grades` abgesichert.
3. **Der fehlende `network-deny` im MCP-Hauptprozess ist keine Lücke, sondern
   Scope.** Siehe F12: davon bleibt nur der Vertragswiderspruch um das Wort
   „Export" übrig, nicht die ursprüngliche Behauptung.

**Weitere Nicht-Themen**

- **Keine** Änderung am Cowork-Formatumfang. Cowork bleibt bei TXT, Markdown,
  CSV und dem strengen direkten DOCX-Parserpfad (DS-092, `BACKLOG.md:37`).
  Wenn ein Fix aus Abschnitt 1 den Cowork-Pfad berührt, muss er dessen
  Verhalten **erhalten** — F1 zeigt, dass Cowork dort heute korrekt ist.
- **Keine** neuen Formatfreigaben, keine Aktivierung von XLSX/PPTX/PDF/Bildern
  im Cowork-Plugin.
- **Keine** Aktivierung des MarkItDown-Differentialpfads (BL-010.15).
- **Keine** Versionierung von Office-Fixtures (`.gitignore:1-9`, `SECURITY.md`).
- **Keine** Simulation menschlicher E1/E2/E3-Evidenz. Zielhost-, UX-, Fach- und
  Datenschutzabnahmen bleiben offen, bis sie wirklich beobachtet wurden.
  Schreibe „E0 grün, E1/E2 offen" — nicht „abgenommen".
- **Kein** Refactoring des Redaktionskerns über die benannten Befunde hinaus.
  `privacy/` ist dicht getestet; ein Umbau würde die Reviewbasis zerstören.
- **Keine** Änderung an der Junction-/Reparse-Sperre des Ergebnis-Roots
  (`result-folder-config.js`) — die ist wirksam.
- **Kein** Umbau der Produkttrennung. Getrennte Datenroots (`SecureDataMsg`
  gegen `SecureDataMsg-Standalone`, aktiviert in
  `standalone/application-service.js:43` vor jedem Gateway-Import) sind sauber.
- **Keine** GitHub Actions, keine Force-Pushes, keine History-Rewrites.

---

## 7. Reihenfolge und Commitplan

Ein Thema pro Commit. Die Reihenfolge ist nicht beliebig: F11 zuerst, weil du
ohne den Korpus bei F1 und F2 ohne Netz arbeitest.

| # | Commit | Befunde |
|---|---|---|
| 1 | `test(uat): make the complex DOCX corpus reproducible` | F11 |
| 2 | `fix(privacy): keep the source table header in wide extraction` | F1 |
| 3 | `fix(privacy): person columns without a name label stop fail-closed` | F2 |
| 4 | `fix(privacy): detect credentials in document content` | F3 |
| 5 | `fix(privacy): recognise grouped IBAN separators` | F4, F5 |
| 6 | `fix(privacy): complete the phone label catalogue` | F6 |
| 7 | `fix(privacy): a plain sensitive header no longer blocks the file` | F8 |
| 8 | `fix(privacy): batch aliases need person context in the current document` | F9 |
| 9 | `fix(privacy): person labels stay case bound` | F10 |
| 10 | `fix(standalone): a textless image no longer stops a readable PDF` | F16 |
| 11 | `fix(standalone): project the unconfirmed termination reason` | F15 |
| 12 | `docs(canon): bind the proven scope to the current candidate` | F18–F24 |
| 13 | `fix(standalone): desktop result access and reparse consistency` | F25, F26, F27 |
| 14 | `docs(contract): align the network boundary scope with the export path` | F12 |
| 15 | `feat(ui): notify about network result folders` | F13 |
| 16 | `docs(canon): document the legacy v3 mapping replay` | F14 |

F7 und F17 stehen **nicht** im Plan, weil sie eine menschliche Entscheidung
bzw. eine Messung voraussetzen. Bearbeite sie erst nach Rückmeldung, je in
einem eigenen Commit.

---

## 8. Verifikationspflicht

Nach **jedem** Commit:

```bash
npm run test:product          # vollstaendige Produktsuite (61 Basis + 114 direkte Dateien)
npm run test:docs
npm run build
npm run test:plugin-zip
git diff --check
```

Zusätzlich, weil dieser Auftrag Standalone- und Redaktionskern berührt:

```bash
npm run test:standalone       # enthaelt test:standalone:rust (braucht Cargo)
node tests/test-pii-regression.js
node tests/test-iban-boundary.js
node tests/test-adversarial.js
node tests/test-batch-pseudonym-registry.js
npm run test:result-grades
```

Und die Pluginstruktur streng mit der installierten Claude CLI:

```bash
claude plugin validate dist/marketplace-repo
```

**Referenzstand vor deinen Änderungen** — dies sind **beobachtete Werte einer
Umgebung**, kein Vertrag. `BACKLOG.md:154` nennt noch „40 Basis- und 111
direkte Dateien"; eine abweichende Zahl bei dir ist also nicht automatisch rot.
Gemessen auf Windows 11 x64, Node 24.19, ohne Cargo: `test:product` grün, `test:docs` grün, `build` grün
(ZIP mit 198 Einträgen, SPDX und SHA256SUMS erzeugt), `test:plugin-zip` grün,
`git diff --check` sauber, `claude plugin validate` bestanden. Einzige
Ausnahme: `node tests/test-complex-docx-uat-corpus.mjs` stürzt mit ENOENT ab
(F11). Ist bei dir etwas anderes rot, kläre das **vor** der ersten Änderung —
dann unterscheidet sich deine Umgebung.

---

## 9. Globale Abnahmekriterien

1. Für jeden umgesetzten Befund existiert ein Test, der gegen `c62d7ec`
   scheitert und nach dem Fix grün ist. Die Fehlermeldung des roten Laufs steht
   im Commit-Text.
2. Kein Befund aus Abschnitt 1 ist so „behoben", dass ein Name jetzt still
   durchläuft statt zu stoppen. Prüfe jeden Fix gegen **beide** Gates
   (Abschnitt 0.3).
3. `npm run test:product`, `test:docs`, `build`, `test:plugin-zip` und
   `git diff --check` sind grün. `npm run test:standalone` ist grün, oder du
   nennst ausdrücklich, welcher Teil aus Umgebungsgründen nicht lief.
4. `BACKLOG.md`, `CURRENT_STATE.md` und `TRACEABILITY.md` sind gemeinsam
   fortgeschrieben; jede angefasste Story nennt ihren neuen Stand und die
   verbleibende menschliche Evidenz.
5. Keine neue Version wird behauptet, ohne dass `package.json`,
   `BUILD_INFO.json`, `manifest.json`, `plugin.json`, `VERSION`, `Cargo.toml`
   und `tauri.conf.json` übereinstimmen.
6. Was du nicht verifizieren konntest, steht als solches im Bericht. Eine
   ungeprüfte Annahme, die als Ergebnis präsentiert wird, ist schlimmer als
   eine offen benannte Lücke.

---

## 10. Kanonische Zuordnung

| Befund | Story | Entscheidung |
|---|---|---|
| F1, F2 | BL-010.30, BL-030.2, BL-021.1, BL-022.1 | DS-087, DS-090 |
| F3, F4, F5, F6, F7, F10 | BL-021.1 | DS-049 |
| F8 | BL-021.1 | DS-049 |
| F9, F17 | BL-030.2 | DS-084, DS-059 |
| F11 | BL-022.1, BL-050.1, BL-052.1 | — |
| F12 | BL-020.3 | DS-018 |
| F13 | BL-002 | DS-080 |
| F14 | BL-010.28 | DS-085 |
| F15 | BL-010.30 | DS-087, DS-090 |
| F16 | BL-023.4 | DS-087 |
| F18, F19 | BL-051.1 | DS-077 |
| F20, F21, F23 | BL-002 | — |
| F22 | BL-003.9 | — |
| F24 | BL-051.3 | DS-010 |
| F25 | BL-010.33 | DS-086 |
| F26, F27 | BL-010.33 | — |

Wo „—" steht, habe ich **keine** passende aktive Entscheidung gefunden. Das ist
Absicht und keine Lücke, die du durch Raten füllen sollst. Zwei Zuordnungen
habe ich ausdrücklich verworfen, damit du sie nicht wieder einträgst: DS-060
ist „Offline-Lieferkette" (gepinnte OSS, SBOM, keine Runtime-Downloads) und
trägt F12 nicht; DS-089/DS-091 regeln die Dateinamenswahl und tragen F26/F27
nicht.

---

## 11. Herkunft dieses Auftrags

Erstellt am 08.09.2026 aus einem Mehrdimensionsreview von `c62d7ec`
(Dokumentation, Produktkanon, Entwicklungscode, Laufzeit, Paketierung,
Plattformkonformität, Datenschutz), anschließend adversarisch gegengeprüft.

Als Reviewergebnis ausdrücklich **sauber** und deshalb nicht in diesem Auftrag:
Produkttrennung und Datenroots; Exportverifikation und Destination-Bindung;
Modustrennung zwischen Anonymisierung und reiner Konvertierung;
`support-trace`-Projektion (Allowlist ohne Freitextfeld); Rekursionsschutz
zwischen Quell- und Ergebnisbaum; Nur-Lese-Zugriff auf Originale, in jedem
Fehler-, Timeout- und Abbruchpfad getestet; die drei Absturzfenster der
Wiederaufnahme; Tauri-Kommandofläche, Capabilities und CSP; Panikfreiheit des
Rust-Produktivcodes; DS-086 und die laufgebundene Verlaufsbindung;
Markdown-Escaping als Angriffsfläche; Unicode-Wortgrenzen im Redaktionskern;
die Evidenzdisziplin des Kanons, der automatisierte Tests nirgends als
menschliche Abnahme ausgibt.
