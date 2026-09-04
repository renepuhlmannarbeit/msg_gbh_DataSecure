# Claude-Code-Gegenreview DataSecure 3.2.0-rc93

> **Codex-Nachtrag 03.09.2026 / RC94:** Der in Abschnitt 5 offene dreizeilige
> Tabellenkopf wurde nach Architektur-, Datenschutz- und UX-Gegenprüfung
> entschieden und umgesetzt: höchstens drei gleich breite Zeilen werden nur zu
> bekannten sensiblen Labels verbunden; abweichende Breiten, längere sensible
> Köpfe und verbundene DOCX-Zellen stoppen ohne neuen Dialog fail-closed. Dabei
> zeigte die Reproduktion, dass der Fix `d7b7e4f` bei führenden/fehlenden Zellen
> weiterhin Steuer-IDs freigeben konnte; RC94 ersetzt die positionsbasierte
> Annahme vollständig. Die ebenfalls reproduzierte Überredaktion von `Mx Graph
> API`, `Ms Project Server` und `Mr Robot Framework` ist mit engen Fachphrasen
> korrigiert, ohne die Anredeerkennung zu lockern. Nachweis: 120/120
> PII-Regressionen, 35/35 DOCX-Strukturtests, vollständiger Parser-Vertrag und
> vollständige Produktsuite mit 27 Basis- sowie 108 direkten Testdateien. Der
> RC94-Build umfasst 170 ZIP-Einträge und 34.937.730 Byte; SHA-256:
> `5083c134b5529ebc54199a9299170df4c6870eff2ad2d791e2ce2735f4f54086`.

Stand: 03.09.2026 · Auftrag
[`2026-09-03-claude-code-folgeauftrag-gegenreview-rc93.md`](2026-09-03-claude-code-folgeauftrag-gegenreview-rc93.md)
· kanonische Zuordnung BL-021.1, BL-042, BL-044.1, BL-002

## 1. Prüfbasis und Werkzeuge

| Punkt | Wert |
|---|---|
| geprüfter Commit | `62cb561` „fix(rc93): close privacy and filesystem review findings“ gegen Vorgänger `292f1c2` (rc92); 44 Dateien, +1.550/−479 |
| Referenzbericht | [`CODEX-REVIEW-BERICHT-RC92.md`](../CODEX-REVIEW-BERICHT-RC92.md), Befunde C-01 bis C-09 |
| Arbeitsbaum | `main`, `git pull --ff-only` auf `62cb561`, sauber vor Beginn |
| Node / npm | v24.19.0 / 11.17.0 (Host); gebündelte Laufzeit im ZIP: Node 22.23.2 |
| Claude CLI | 2.1.229 |
| git | 2.55.0.windows.4 |
| Host | Windows 11 Enterprise, NTFS; POSIX-Linktests plattformbedingt nicht ausführbar |

Vorgehen: vollständiger Diff des Commits, vollständige Lektüre der im Auftrag
genannten Kanon- und Betriebsdokumente, eigene synthetische Proben, drei
begrenzte lesende Gegenchecks (Datenschutz C-01 bis C-05, Dateisystem/Start
C-06 bis C-08, Produkt-/Dokumentationsvertrag einschließlich C-09). Kein
Befund aus Berichten wurde ungeprüft übernommen; jeder hier genannte Defect ist
mit synthetischen Daten reproduziert und vor sowie nach dem Fix gemessen.

Hinweis zur Prüfmethodik: Der Datenschutz-Gegencheck lief zeitgleich zu meinen
Arbeitsbaum-Änderungen und sah kurzzeitig einen roten, von mir soeben
hinzugefügten Regressionstest. Auf dem unveränderten Commit `62cb561` waren
`test-pii-regression` (115/115) und die gesamte Produktsuite (121 Suiten)
grün; diese Beobachtung ist kein Befund gegen `62cb561`.

## 2. Urteil je Befund

| ID | Urteil | Begründung |
|---|---|---|
| C-01 | **bestätigt geschlossen** für `<br>`-Fragmente und zweizeilige, gleichbreite Köpfe; **Restdefect behoben** (ungleich breite Datenzeilen, `d7b7e4f`); **Restdefect offen** (dreizeilige Köpfe, siehe 5) | `<br>`, U+00A0/U+202F, Groß-/Kleinschreibung, Doppelpunkt, `:---:`, Tabellen ohne Außenpipes, Beschriftungszeile mit Pipes: alle redigiert, Gate leer nach Redaktion, Rohgate sieht die Werte. Ungleich breite Zeilen ließen Steuer-ID/Geburtsdatum/Telefon stehen, Gate blind (Reproduktion in 4). |
| C-02 | **bestätigt geschlossen** | `Geboren:`, `geb.`, ISO, Slash, zweistelliges Jahr: redigiert. Negativkontrollen `Projektstart: 1980-01-01`, `Vertragsbeginn: 01.01.2020`, `Version 2024-01-01` bleiben. `Geburtsdatum: 1980 - 01 - 01` lässt der Redaktor stehen, das konservative Gate meldet ihn (gewollt fail-closed). |
| C-03 | **bestätigt geschlossen** | `0049 30 …`, `+49 (0) 30 …`, `030 / 123456`, `030/123456`, `(030) 123 456 78`, `0170-1234567`, `030 12 34 56 78` unter `Telefon:`, `Tel.:`, `Mobil:`, `Fax:`, `Durchwahl:` und als Spaltenkopf: redigiert. Negativkontrollen `Auftrag 030 / 123456`, `Version 0049.30`, `Artikelnummer 030 123456`, `Telefonkonferenz: 12.03.2025 14:00`, `Mobilfunkvertrag: 4711` bleiben. `Telefon: 00 49 30 …` lässt der Redaktor stehen, das Gate meldet ihn (fail-closed). |
| C-04 | **Produktentscheidung bestätigt** (DS-012: Anrede entfernt, Titel bleibt); **zwei Restdefects behoben** (`4ba4dc2`, `7b8ab53`) | `Frau Dr. med. Anna Beispiel` → `Dr. med. [PERSON_001]`, `Herrn Prof. Muster` → `Prof. [PERSON_001]`, `Frau Dipl.-Kfm. …` → `Dipl.-Kfm. [PERSON_001]`. Nicht abgedeckt waren „Dr.-Ing.“ (voller Name im Klartext, Gate blind) und englische Anreden `Mr./Mrs./Ms` (voller Name im Klartext, Gate blind). Beides bestand bereits vor rc93. |
| C-05 | **bestätigt geschlossen** | `Im Januar 1980`, `Im Mai 2024` bleiben; `Am Markt 12`, `Im Grund 5`, `In der Au 3`, `Hauptstraße 5` werden Orte. Zertifizierungen (`Microsoft Azure Administrator Associate`, `ITIL 4 Foundation`, `Professional Scrum Master I`) bleiben vollständig. |
| C-06 | **bestätigt geschlossen** | Produktmodul nicht ladbar sowie Produktmodul und Startschutz nicht ladbar: Exit 1, stdout leer, genau eine pfadfreie stderr-Zeile ohne Stacktrace, kein Worker, keine Datei außer dem Marker. `.mcp.json`, `plugin.json`, `manifest.json` zeigen weiter auf `server/index.js` (536 Byte Bootstrap); das gebaute ZIP enthält `server/mcp-server.js` (54.719 Byte), 170 Einträge, selbsttragend. |
| C-07 | **bestätigt geschlossen** (Junction auf `diagnostics`), **Nebenwirkung behoben** (`ba86318`), **Designgrenze offen** (siehe 5) | Junction als `diagnostics`: kein Marker außerhalb. Zwei parallel startende Prozesse: genau ein gültiger Marker, keine Temp-Datei. Nebenwirkung: bei abweichender Groß-/Kleinschreibung des Datenpfads (LOCALAPPDATA/EU_PRIVACY_ROOT gegen Datenträgerschreibung) wurde der Marker still verweigert. Junction als Elternteil und 8.3-Kurzpfad bleiben verweigert (bewusst konservativ, nur Markerverlust; Journal und stderr unberührt). |
| C-08 | **bestätigt geschlossen** | Austausch von `DataSecure-Output` vor `ensurePlainDirectory`, Austausch des Laufordners nach Bindung vor dem Schreiben, Austausch der Ergebniswurzel: jeweils `RESULT_EXPORT_PATH_UNSAFE`, nichts außerhalb angelegt, keine Temp-Datei. `test-result-folder-export` PASS. NTFS: Löschen/Neuanlegen behält die birthtime (Tunneling), ändert aber die Inode; die Bindung greift über dev/ino. |
| C-09 | **Produktentscheidung bestätigt** | `run_id` erscheint nur in `workflow-diagnostics.js` und `batch-executor.js`; nicht in `diagnostic-causes.js`, `normal-path-response.js`, `result-export.js`, Skills oder Mapping. Sichtbar nur über `diagnostic_status` (Supportwerkzeug) und den bestätigten Diagnoseexport; DS-071 beschreibt genau das. |

## 3. Bestätigte Kernaussagen (Auftrag A bis D)

- **A.4 Gate-Unabhängigkeit:** Der neue konservative Kanal
  (`conservativeLabelledResiduals`) fängt breitere Formen als der Redaktor
  (`1980 - 01 - 01`, `00 49 30 …`). Er teilt jedoch `hasLabelBefore` und damit
  den Tabellenindex; ein Fehler im Spaltenindex ist für beide blind. Genau das
  war der Restdefect der ungleich breiten Zeilen.
- **A.5 Negativkontrollen:** Projekt-, Vertrags-, Versions- und Mengenwerte
  ohne PII-Label bleiben erhalten. Einzige Überredaktion:
  `Bestellnummer: 1980-01-01` → `[ID_REDACTED]` (Referenzlabel absorbiert einen
  Datumswert; kein Datenschutzrisiko, P3, nicht geändert).
- **B Startschutz:** Bootstrap mit doppeltem Rückfall verifiziert; keine
  Teilverarbeitung; Eintrittspunkt unverändert.
- **C Dateisystem:** drei TOCTOU-Fenster geschlossen; `O_NOFOLLOW` ist auf
  win32 nicht definiert (evaluiert zu 0), kompensiert durch `fstat`/`lstat`
  nach dem Öffnen; Bewertung auf POSIX bleibt Zielhost-Evidenz.
- **D Vertrag:** kein neuer Dialog, keine neue Bestätigung (Codeverschiebung
  `index.js` → `mcp-server.js` ist ein reiner Move plus zwei Kommentarzeilen);
  C-01 bis C-08 nur als E0 geschlossen, Abschnitt B des Backlogs offen;
  `test:executor-lifecycle` ausführbar und in `test-manifest.js` gepinnt.

## 4. Reproduktionen

Alle Eingaben synthetisch; Skripte lagen im Sitzungs-Scratchpad, nicht im
Repository. Vorher = `62cb561`, nachher = nach den Fixcommits.

| Eingabe | vorher | nachher |
|---|---|---|
| `\| Name \| Steuer-ID \| Ort \|` + Datenzeile mit 4 Zellen `… \| 26954371827 \| Berlin \| extra \|` | Steuer-ID im Klartext, Gate `[]` | `[ID_REDACTED]`, `Berlin` und `extra` bleiben |
| Kopf mit 4 Spalten, Datenzeile mit 3 Zellen | Steuer-ID im Klartext, Gate `[]` | `[ID_REDACTED]` |
| `Projektleiter: Dr.-Ing. Max Mustermann, Bauingenieur` | unverändert, Gate `[]` | `Projektleiter: Dr.-Ing. [PERSON_001], Bauingenieur` |
| `Contact: Mrs. Erika Beispiel` / `Mr. Max Mustermann` / `Ms Anna Beispiel` | unverändert, Gate `[]` | `Contact: [PERSON_001]` |
| `Contact: Mr. Dr. Max Mustermann` | unverändert | `Contact: Dr. [PERSON_001]` |
| Kontrolle `Summr Report … MRS steht für Multi Resolution Scan` | unverändert | unverändert |
| Startmarker, Datenpfad `…\profile\SecureDataMsg` statt `…\Profile\…` | `marker=false` | `marker=true`, Datei im echten Ordner |
| Startmarker, Laufwerksbuchstabe klein | `marker=false` | `marker=true` |
| Startmarker, Junction als Elternteil | `marker=false` | `marker=false` (bewusst, offen) |

Positivproben ohne Änderung (Auszug): `Steuer<br>ID`-Kopf, zweizeiliger Kopf
`Steuer`/`ID`, `Geboren: 01.01.1980`, `Geburtsdatum: 1980-01-01`,
`Telefon: 0049 30 12345678`, `Frau Dr. med. Anna Beispiel`, `Im Januar 1980`,
Bootstrap-Doppelfehler, Junction-Austausch von Output/Lauf/Wurzel.

## 5. Offene Punkte (kein Fix, dokumentiert)

| Punkt | Schwere | Einordnung |
|---|---|---|
| Dreizeilige Tabellenköpfe (`Steuer`/`-`/`ID`) werden nicht zusammengesetzt; Werte bleiben im Klartext, Gate blind | P2 | außerhalb des in C-01 zugesagten Umfangs (höchstens zweizeilig); Entscheidung offen: N-zeilige Zusammenführung oder Stopp bei mehr als zwei Kopfzeilen; BL-021.1, DS-049 |
| Startmarker bei Junction im Elternpfad oder 8.3-Kurzpfad verweigert | P3 | konservativ; nur der Marker fehlt, Journalereignis und stderr-Zeile bleiben; ob verwaltete Windows-Profile (FSLogix, UPM) `LOCALAPPDATA` hinter einer Junction führen, ist Zielhost-Evidenz; DS-071, BL-044.1 |
| `Bestellnummer: 1980-01-01` → `[ID_REDACTED]` | P3 | Überredaktion ohne Datenschutzrisiko; DS-049 |
| `birthtimeMs` in der Exportbindung auf POSIX (0 oder instabil) | offen | Zielhost-Evidenz macOS/Linux; auf NTFS trägt die Inode die Bindung; BL-044.1 |
| Salutations-/Titelverhalten nur in einem Änderungsabsatz der Anleitung beschrieben, nicht in Skills | P3 | Nutzerdokumentation; BL-021.1 |

## 6. Eigene Commits

| Commit | Thema | Dateien | Nachweis |
|---|---|---|---|
| `d7b7e4f` | fix(privacy): Tabellenzeilen ungleicher Breite behalten ihre Spaltenlabels (C-01-Rest) | `privacy/base.js`, `tests/test-pii-regression.js` (+1) | `test-pii-regression` 116/116 |
| `4ba4dc2` | fix(privacy): „Dr.-Ing.“ als ein Titel (C-04-Rest) | `privacy/entities.js`, `privacy/base.js` (Stoppliste), `tests/test-pii-regression.js` (+1) | 117/117 |
| `7b8ab53` | fix(privacy): englische Anreden ankern den Namen und werden entfernt (C-04-Rest) | `privacy/entities.js`, `privacy/base.js` (Stoppliste), `tests/test-pii-regression.js` (+1) | 118/118 |
| `ba86318` | fix(startup): Markerpfad-Identität auf Windows schreibungsunabhängig (C-07-Nebenwirkung) | `gateway/startup-guard.js`, `tests/test-startup-guard.js` (+1) | `test-startup-guard` 10/10 |
| (Dokumente) | docs: DS-012 um die in Traceability/Current State/Backlog behauptete Anrede-/Titelregel präzisiert; drei Kopfzeilen (`RELEASE.md`, `TESTING.md`, `PLUGIN_SECURITY_MODEL.md`) von rc92 auf rc93; Register-Zeile für diesen Bericht | `docs/canonical/DECISIONS.md`, `docs/canonical/DOCUMENT_REGISTER.md`, drei Dokumentköpfe | `test:docs` PASS |

Dokumentbefund (P2, behoben): `TRACEABILITY.md:101`, `CURRENT_STATE.md:71` und
`BACKLOG.md:44` schrieben DS-012 die Regel „Anrede entfernt, Titel bleibt“ zu,
der DS-012-Text selbst enthielt sie nicht. Versionsbefund (P3, behoben): drei
aktive Dokumente standen nach dem rc93-Bump noch auf rc92; kein Test prüft
diese Kopfzeilen.

## 7. Gate-Tabelle

Lauf A = unveränderter Stand `62cb561`; Lauf B = nach den vier Fixcommits;
Lauf C = nach den Dokumentkorrekturen.

| Befehl | Exit | Ergebnis |
|---|---|---|
| `node tests/test-pii-regression.js` | 0 / 0 | A 115/115 · B 118/118 |
| `npm run test:executor-lifecycle` | 0 / 0 | A und B PASS (Startup guard 9 bzw. 10, Result folder export PASS) |
| `npm run test:docs` | 0 / 0 / 0 | A, B, C PASS |
| `npm run test:skills` | 0 / 0 | 13 Skill-Abnahmen, 150/150 Vertragsfälle |
| `npm run test:source-preflight` | 0 / 0 | PASS |
| `npm run test:parser-contract` | 0 / 0 | PASS |
| `npm run test:product` | A 0 · B 1 · C siehe unten | A 121 Suiten grün. B: Abbruch in `test-uat-fixture-generation` mit `SOURCE_IDENTITY_CHANGED` während der Fixture-Erzeugung; isolierter Wiederholungslauf sofort grün, kein Temp-Rest; Einordnung: transiente Identitätsänderung frisch geschriebener Fixtures durch den Echtzeitscanner (bekannte Klasse BL-050.3), kein Produktdefekt. C: vollständiger Wiederholungslauf, Ergebnis unten. |
| `npm run build` | 0 | ZIP `DataSecure-Privacy-Preflight-windows-x64-v3.2.0-rc93.zip`, 170 Einträge, 34.936.762 Byte, SHA-256 `3e36a7e60089ee8914089d541b243739fcfee2f8334587514c5a510ab9e4fab7`; SBOM `903a0e2b…c581`; Status-Artefakt PASS |
| `npm run test:plugin-zip` | 0 | PASS, 13 Skill-Abnahmen, 150/150 |
| `claude plugin validate plugins/data-secure --strict` | 0 | Validation passed |
| `claude plugin validate . --strict` | 0 | Validation passed |
| `git diff --check` | 0 | keine Whitespace-Fehler |

Der im Codex-Bericht genannte rc93-ZIP-Hash (`903F9C49…`, 34.936.277 Byte)
stammt von einem anderen Buildhost/-zeitpunkt; der hier gebaute Stand enthält
zusätzlich die vier Fixcommits und weicht daher erwartungsgemäß ab.

Lauf C `npm run test:product`: Exit 0, 121 Suiten, 0 Fehlschläge (nach den vier
Fixcommits und den Dokumentkorrekturen; `test:docs` im selben Lauf grün).

## 8. E0-Evidenz gegenüber offener menschlicher Abnahme

E0 (lokal, automatisiert, Windows-Entwicklerhost): alle Aussagen dieses
Berichts. Weiterhin offen und durch nichts hier ersetzt: reale Windows- und
macOS-Cowork-UAT (Fresh Install, Update/Rollback, Abschlussdialog,
Ergebnisordner), POSIX-Symlinks und `birthtime`-Semantik auf APFS/ext4,
verwaltete Windows-Profile mit Junctions, echte DOCX-Dateien mit verbundenen
Zellen und dreizeiligen Köpfen, Cowork-Kontocache (U-05/U-09/U-18). Alles
bleibt in Abschnitt B des Backlogs.

## 9. Push-Empfehlung

Lokal liegen vier thematische Fixcommits und die Dokumentkorrekturen vor.
Empfehlung: **Push freigeben**, sobald Lauf C der Produktsuite grün ist und der
Nutzer den Stand gesichtet hat. Ein neuer Versionsschnitt (rc94) ist sinnvoll,
weil die Redaktion und der Startschutz gegenüber dem ausgelieferten rc93-ZIP
verändert sind; der Bump wurde gemäß Auftrag nicht vorgenommen.
