# Folgeauftrag P1: OPC-Paketmetadaten dürfen DOCX nicht als aktiven Inhalt sperren

**Herkunft:** Finding **P1-1** aus `tasks/RC63-CLAUDE-CODE-GESAMTREVIEW-BERICHT.md`
**Story:** BL-049.1 (Inhalts- und Formatgrenze, Source-Preflight); angrenzend BL-022.1
**Entscheidungen:** DS-049, DS-007, DS-017
**Ausgangsstand:** `main` auf `6e95d81`, Produktversion `3.2.0-rc63`
**Fehlerrichtung:** Über-Blockade. Ein Fix darf sie unter keinen Umständen in
Unter-Redaktion oder in eine gelockerte Containerprüfung umschlagen lassen.

## 1. Befund

`plugins/data-secure/server/gateway/opc-source-validator.js:214`, Funktion
`validateOpcControls`, prüft den vollständigen OPC-Beziehungstyp gegen das nicht
verankerte Teilstringmuster:

```js
if (/(?:oleobject|package|attachedtemplate|externalLink|hyperlink|vbaProject|customUI|activeX)/iu.test(type)) {
  throw new OpcValidationError('SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
}
```

Jeder Standard-OPC-Beziehungstyp liegt im Namensraum
`http://schemas.openxmlformats.org/package/2006/relationships/…` und enthält
damit das Teilstring `package`. Gemeint war offenkundig ausschließlich die
OLE-Beziehung
`http://schemas.openxmlformats.org/officeDocument/2006/relationships/package`.

**Ist:** Eine DOCX-Datei, die die Standard-Beziehung
`metadata/core-properties` führt – also praktisch jede von Microsoft Word,
LibreOffice oder `python-docx` erzeugte Datei – wird vor jeder privaten Kopie
terminal mit `SOURCE_ACTIVE_CONTENT_UNSUPPORTED` gestoppt.

**Soll:** Sie wird `candidate` / `SOURCE_FORMAT_CANDIDATE`.

Betroffen sind genau diese drei Standardbeziehungen:

- `http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties`
- `http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail`
- `http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/origin`

Korrekt gesperrt bleiben müssen mindestens:

- `http://schemas.openxmlformats.org/officeDocument/2006/relationships/package` (OLE)
- `.../officeDocument/2006/relationships/oleObject`
- `vbaProject`, `attachedTemplate`, `customUI`, `activeX`
- jede Beziehung mit `TargetMode="external"` (bereits Zeile 211, unverändert lassen)

## 2. Reproduktion

Vor dem Fix rot, nach dem Fix grün:

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

Beobachtetes Ist:

```
ohne core-properties -> candidate / SOURCE_FORMAT_CANDIDATE
mit  core-properties -> rejected  / SOURCE_ACTIVE_CONTENT_UNSUPPORTED
```

Gegenprobe mit einer realistischen synthetischen DOCX: Generator
`docs/acceptance/RC30_HUMAN_TEST_KIT/tools/generate_synthetic_acceptance_data.py`
in einem temporären Verzeichnis laufen lassen, dann
`01-positive/personnel-profile.docx` durch `planBatchAdmission` schicken. Ist
heute `stopped / SOURCE_ACTIVE_CONTENT_UNSUPPORTED`.

## 3. Umfang

**Dazu gehört:**

1. Die Beziehungstypprüfung in `opc-source-validator.js` so präzisieren, dass sie
   den Typ als Ganzes klassifiziert statt als Teilstring zu durchsuchen. Empfohlen:
   eine explizite Menge gesperrter Beziehungstypen beziehungsweise verankerte
   Muster mit vollständigem Namensraumpfad. Die `TargetMode="external"`-Prüfung
   bleibt unverändert.
2. Regressionstests in `tests/test-source-opc-preflight.js` ergänzen:
   - **positiv:** DOCX mit `metadata/core-properties`, `extended-properties` und
     `metadata/thumbnail` → `candidate` / `SOURCE_FORMAT_CANDIDATE`;
   - **positiv:** DOCX mit `digital-signature/origin` → `candidate`;
   - **negativ:** DOCX mit `officeDocument/2006/relationships/package` →
     `SOURCE_ACTIVE_CONTENT_UNSUPPORTED`;
   - **negativ:** DOCX mit `oleObject`, `vbaProject`, `attachedTemplate`,
     `customUI`, `activeX` → jeweils `SOURCE_ACTIVE_CONTENT_UNSUPPORTED`;
   - **negativ:** jede Beziehung mit `TargetMode="external"` → unverändert
     `SOURCE_ACTIVE_CONTENT_UNSUPPORTED`.
3. `tests/lib/opc.js` um eine Option erweitern, mit der ein Fixture die
   Standard-Paketmetadatenbeziehungen führt, damit künftige Tests reale
   Office-Dateien abbilden statt eines minimalen Sonderfalls.
4. Product-Owner-Entscheidung zu `hyperlink` einholen und umsetzen: externe
   Ziele sind bereits durch Zeile 211 abgedeckt; der Musterterm sperrt zusätzlich
   jede DOCX mit einer gewöhnlichen internen Hyperlink-Beziehung. Entweder
   bewusst beibehalten und in `docs/canonical/CURRENT_STATE.md` sowie in der
   Anwendermeldung dokumentieren, oder mit demselben Fix auf externe Ziele
   begrenzen.
5. Prüfen, ob XLSX und PPTX nach dem Fix weiterhin ausschließlich als
   `SOURCE_FORMAT_NOT_RELEASED` beziehungsweise mit einem OPC-Strukturcode enden
   und **nicht** versehentlich zu `candidate` werden.
6. `docs/canonical/CURRENT_STATE.md` und `docs/canonical/TRACEABILITY.md` für
   BL-049.1 nachziehen.

**Dazu gehört ausdrücklich nicht:**

- Änderungen an `zip-reader.js` (CRC-, Polyglot-, Overlap-, Limit- und
  Verschlüsselungsprüfungen bleiben unverändert)
- Änderungen am Freigabeumfang der Formate: XLSX, PPTX, PDF und Rasterbilder
  bleiben gesperrt
- Änderungen am DS-045-Gradvertrag oder an der Ergebnisprojektion
- Anpassungen des RC63-UAT-Pakets (eigener Vorgang, siehe P2-1 im Bericht)
- Behebung von P1-2 oder P1-3

## 4. Abnahmekriterien

1. Die Reproduktion aus Abschnitt 2 liefert für **beide** Varianten
   `candidate / SOURCE_FORMAT_CANDIDATE`.
2. Alle 111 synthetischen UAT-Eingänge ergeben:
   `01-positive` 4 × `candidate` (einschließlich DOCX), `02-review` 2 ×
   `candidate`, `03-blocked` 5 × `stopped`, `04-batch-100` 100 × `candidate`.
3. Ein Negativtest je gesperrter Beziehungsart ist vorhanden und rot, wenn die
   Sperre entfernt wird.
4. `npm run test:source-preflight`, `npm run test:result-grades` und
   `npm run test:ci` sind grün.
5. `npm run build:plugin` und `npm run test:plugin-zip` sind grün; der neue
   ZIP-SHA-256 ist im Commit dokumentiert (er ändert sich erwartungsgemäß).
6. `git diff --check` ist sauber.
7. Es wurden ausschließlich synthetische Testdaten verwendet.
8. Kein Commit und kein Push ohne ausdrückliche Freigabe.
