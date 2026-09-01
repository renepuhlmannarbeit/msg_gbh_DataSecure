# Statusbericht: RC37 Claude-Code-CLI-Evaluation

**Zugehöriger Auftrag:** `tasks/CLAUDE-CODE-AUFTRAG-RC37-CLI-EVAL.md`
**Ausführungsdatum:** 2026-08-25
**Ausgangs-Commit:** `9f375b7` ("Harden batch recovery and build RC37"), Version `3.2.0-rc37`
**Status:** **Teilweise abgeschlossen — zentraler Auftragsteil (Abschnitt 5–7) durch einen
organisationsseitigen Anthropic-Blocker verhindert.** Der Auftrag bleibt aktiv (nicht
archiviert), bis die Sperre aufgehoben ist.

## 1. Ergebnis und erreichte Evidenzstufe

- Vorprüfung (Abschnitt 4) vollständig durchgeführt: Repo-Zustand, Tool-Versionen,
  Paketversion und ZIP-Hash bestätigt, keine Abweichung vom im Auftrag genannten
  Ausgangsstand.
- **Kernblocker:** `claude plugin eval` (sowohl `init --bare` als auch ein regulärer
  Lauf) bricht auf dieser Organisation sofort ab mit `` `plugin eval` is currently in
  early access ``. Das ist eine organisationsweite, von Anthropic verwaltete Sperre;
  es existiert kein lokales Opt-in, kein Feature-Flag und keine Konfigurationsoption,
  die sie umgeht. Damit sind Abschnitt 5–7 des Auftrags (Eval-Harness im echten
  CLI-Schema bauen, `--ablation with-without` ausführen) **nicht durchführbar**.
- Auf ausdrücklichen Beschluss des Auftraggebers wurde **nicht** auf Marketplace-Wege
  ausgewichen (der ZIP-Weg bleibt der vorgesehene Weg), und es wurde mir freigestellt,
  den besten verfügbaren Ersatzweg selbst zu wählen.
- Gewählter Ersatzweg: (a) eine schemakonforme **Fallspezifikation** (`cases-draft.json`,
  33 Fälle, alle 36 Pflichtpunkte aus Abschnitt 6.A–F abgedeckt) statt erfundener
  `case.yaml`/`prompt.md`-Dateien, damit das Format nicht geraten werden muss; (b) drei
  echte, manuelle, kostenbegrenzte `claude -p --plugin-dir`-Smoke-Aufrufe als informelle
  Zwischenevidenz.
- **Erreichte Evidenzstufe: E0 (automatisiert/lokal), nicht E1.** Die drei Smoke-Tests
  liefen nicht in einer vollständig isolierten Sitzung (siehe Abschnitt 8 unten), und
  keine der zugeordneten Backlog-Stories erfordert laut
  `docs/canonical/BACKLOG_EVIDENCE_MATRIX.md` ohnehin E1-Nachweise, die eine CLI allein
  erbringen könnte (durchgehend „echte Claude-UI“/„Cowork“/„Fresh-Install“-Beobachtung
  verlangt). Kein Kriterium wurde als erreicht markiert, das nicht durch tatsächlich
  ausgeführte Befehle belegt ist.

## 2. Geänderte Dateien

Nur neue, produktunabhängige Dateien; **keine** Plugin-, Server-, Runtime- oder
Skill-Datei wurde verändert:

- `evals/plugin-eval/cases-draft.json` (neu)
- `evals/plugin-eval/README.md` (neu)
- `tasks/RC37-CLI-EVAL-BERICHT.md` (dieser Bericht, neu)

`evals/` liegt wie das bereits vorhandene `evals/skill-behavior-cases.json` außerhalb
von `plugins/data-secure/`. Der bestehende `scripts/verify-plugin-zip.mjs`-Vergleich
(exakter Dateilisten-Abgleich gegen `plugins/data-secure/`) schließt strukturell aus,
dass Inhalte aus `evals/` je in die ausgelieferte ZIP gelangen — ein zusätzlicher Test
wäre redundant, da dieser Vergleich bei jeder Abweichung bereits fehlschlagen würde.
Eine Anpassung von Build/ZIP-Prüfung war daher nicht nötig.

## 3. Gefundene Fehler und Ursachenbehebungen

**Nachtrag (Commit `068c0cc`, nach diesem Bericht):** Bei der Nacharbeit zu Punkt 6.B.3/
6.B.4 des Auftrags (Zertifikatsaussteller- vs. Arbeitgeber-/Kundenkontext, DS-012) wurde
ein reproduzierbarer Fehler in `plugins/data-secure/server/privacy/credentials.js`
gefunden und behoben: Ein Kunden- oder Arbeitgebername in Fließtext innerhalb eines
Zertifizierungsabschnitts blieb vollständig unredigiert, z. B. „Zertifikat ausgestellt
für Kunde ABC GmbH“ — „ABC GmbH“ wurde nie anonymisiert, während der echte Aussteller
(z. B. Scrum.org) in derselben Zeile korrekt als Fachinhalt erhalten blieb. Das ist eine
Unter-Redaktion, die laut Auftrag Abschnitt 3.8 schwerere Fehlerrichtung. Ursache waren
zwei sich verstärkende Lücken: `NON_ISSUER_LABEL_RE` erkannte nur die Form „Label: Wert“,
nicht die Fließtext-Form; zusätzlich fasst die Organisations-Erkennung das Rollensubstantiv
(„Kunde“) in den Treffer selbst, sodass das Signalwort nicht mehr vor der Fundstelle
steht. Fix, Regressionstests (`tests/test-credential-catalog.js`, 2 neue Fälle) und
Versionserhöhung auf `3.2.0-rc38` sind in Commit `068c0cc` dokumentiert; die volle
`npm run test:ci`-Kette lief danach erneut vollständig grün.

**Nachtrag (Commit `0ccf994`, RC39):** `gateway/batch.js::writeState` erhielt die
Option `{ durable: false }` für feste Zwischenmarker, solange `item.status`
unverändert `processing` bleibt. Datei- und POSIX-Verzeichnis-Fsync werden dort
übersprungen; jede Statusänderung bleibt durable. Das Gegenreview bestätigte per
vollständiger Suche, dass `markInterruptedItemsRetryable` ausschließlich den Status
auswertet und kein Produktpfad `item.checkpoint` für Freigabe oder Recovery liest.
`tests/test-batch-session.js` bestand mit 66 Fällen einschließlich echter Worker-
Abbrüche an Position 1, 50 und 100 ohne doppelte Freigabe. Die neue direkte Prüfung
in `tests/test-batch-performance-contract.js` beweist hingegen nur Schreibbarkeit und
Fsync-Aufrufzahl, keinen Stromverlust. Außerdem erwartet sie genau einen Fsync und ist
damit Windows-spezifisch: auf POSIX führt der unverändert notwendige Verzeichnis-Fsync
zu einem zweiten Aufruf. Das ist ein P2-Nachweisdefizit, keine nachgewiesene
Status-/Publikationslücke. Die BL-050.3-Evidenzstufe bleibt unverändert.

**Nachtrag (Commit `b7b7e02`, RC40):** `NON_ISSUER_LABEL_RE` und
`NON_ISSUER_PREFIX_RE` erfassen nun die konkret getesteten femininen Formen
`Kundin/Kundinnen`, `Projektkundin/Projektkundinnen` sowie Verbphrasen wie
`Anstellung bei`, `angestellt bei`, `beschäftigt bei`, `tätig für`, `employed at`
und `working for`. Eine Debug-Ausgabe der tatsächlichen Organisationsfundstellen
bestätigte die Annahme des Fixes: `COMPANY_RE` schließt das Rollensubstantiv bei
`Kunde ABC Beispiel GmbH`, `Kundin Nordlicht Beispiel AG`, `Arbeitgeber Contoso
Beispiel GmbH`, `Customer Example Nordics Ltd` und auch bei `Firma Alpha Beta GmbH
& Co. KG` jeweils in die Match-Grenzen ein. Die Prefix-Prüfung ist dafür notwendig.

Das adversariale Gegenreview fand zugleich weitere Lücken derselben Klasse:

- `Zertifizierungen\nWährend meiner Tätigkeit für Nordlicht Beispiel AG erwarb ich
  ISTQB Certified Tester.` lässt `Nordlicht Beispiel AG` unverändert.
- `Zertifizierungen\nZertifikat erworben im Auftrag von Alpha Beispiel GmbH,
  ausgestellt durch Scrum.org.` lässt `Alpha Beispiel GmbH` unverändert.

Beide Werte sind Kunden-/Arbeitgeberbezug, nicht Aussteller. Das ist reproduzierbare
Unter-Redaktion und damit P0. Umgekehrt wird ein echter synthetischer Aussteller wie
`Customer Institute GmbH Certified Testing Professional` wegen des führenden
Signalworts als `[KUNDE_001]` über-redigiert. Der Fix ist für seine getesteten Fälle
korrekt, aber die Kontextgrammatik ist nicht vollständig geschlossen.

**Nachtrag (Commit `4e9caf9`, RC41):** `isCredentialIssuerDomain` prüft nun
Credential-Cues vor oder nach einer domänenförmigen Fundstelle auf derselben Zeile.
Der konkrete neue Positivfall `Zertifikat ausgestellt von Scrum.org` bleibt damit
erhalten. Das unabhängige Gegenreview fand jedoch eine durch diese Erweiterung neu
geöffnete P0-Unter-Redaktion:

```text
Zertifizierungen
Zertifikat: AWS Certified Cloud Practitioner – weitere Informationen bei alpha-health.de
```

RC41 lässt `alpha-health.de` unverändert, weil irgendein Credential-Cue vor der Domain
als Ausstellerbeleg genügt. Vor `4e9caf9` fehlte der `before`-Zweig und dieselbe Domain
wurde als URL redigiert. Der Cue ist nicht an eine Ausstellerbeziehung zur konkreten
Domain gebunden. Zusätzlich bleibt der mehrzeilige echte Aussteller
`Zertifikat ausgestellt von\nScrum.org` über-redigiert (`[URL_REDACTED]`).

Wegen der beiden P0-Befundklassen ist RC41 in diesem Kontext nicht releasefähig. Der
enge Folgeauftrag `tasks/archiv/2026-08-25-folgeauftrag-p0-credential-context-rc41.md` dokumentiert
Reproduktionen, Grenzen und Abnahmekriterien; gemäß Gegenreview-Auftrag wurde die
Produktivlogik nicht verändert.

**Nachtrag (Commit `32914da`, RC42):** Der Folgeauftrag
`tasks/archiv/2026-08-25-folgeauftrag-p0-credential-context-rc41.md` wurde vollständig abgearbeitet.
`isCredentialIssuerDomain()` in `plugins/data-secure/server/privacy/credentials.js`
band die Ausstellerzuordnung neu eng an die konkrete Fundstelle: Ein Credential-Cue
schützt eine Domain nur noch, wenn eine explizite Ausstelleranzeige
(„ausgestellt von/durch“, „issued by“, „certified by“, „accredited by“) unmittelbar
davor steht — auch auf der unmittelbar vorangehenden Zeile für kurze
Zweizeilenblöcke — oder wenn ein Zertifikatstitel unmittelbar danach beginnt. Damit
lässt RC42 `alpha-health.de` in „Zertifikat: AWS Certified Cloud Practitioner –
weitere Informationen bei alpha-health.de“ wieder als Unter-Redaktion zu, schützt
aber weiterhin einen mehrzeiligen echten Aussteller wie „Zertifikat ausgestellt
von\nScrum.org“ vor der zuvor bestehenden Über-Redaktion. `NON_ISSUER_LABEL_RE`
erhielt zusätzlich die nominale Form „Tätigkeit für“ und die Kundenbeziehung
„im Auftrag von“ (samt „on behalf of“/„commissioned by“ für die bereits
dokumentierte englische Sprachabdeckung). `inCredentialContext()` erlaubt einer
Organisation, deren rollenwort-Präfix in ihren eigenen Namen eingeflossen ist
(„Customer Institute GmbH“), nur dann den Ausstellerstatus, wenn unmittelbar im
Anschluss auf derselben Zeile ein Zertifikatstitel folgt — ein Komma oder
Satzabbruch erzwingt weiterhin die normale Kundenredaktion, sodass ein echter
Kunde mit anschließendem, nicht direkt anschließendem Zertifikatstext („Kunde
TechCorp Beispiel GmbH, Certified Scrum Master Schulung durchgeführt.“) redigiert
bleibt. Die Prüfung entfernt außerdem die vom Wörterbucheintrag „Alias ohne
Rechtsform“ hinterlassene Rechtsformlücke, bevor sie auf einen folgenden Titel
testet, weil dieser kürzere Alias-Fundort vor der Rechtsform statt vor dem Titel
endet. Zehn neue Regressionstests in `tests/test-credential-catalog.js` reproduzieren
jeden der drei P0-Unter-Redaktions- und zwei Über-Redaktionsfälle gegen den
Vor-Fix-Stand und bestehen danach, einschließlich einer CSV-Zellen-Variante und
eines Schutztests für den Komma-getrennten Kundenfall. Version auf `3.2.0-rc42`
erhöht; `npm run test:ci`, `node tests/test-credential-catalog.js` (24/24),
`node tests/test-pii-regression.js` (79/79), `node tests/test-detector-benchmark.js`
(3/3), `npm run build:plugin`, `npm run test:plugin-zip` und
`claude plugin validate plugins/data-secure` liefen danach erneut vollständig grün.

Aus den drei in diesem Bericht (Abschnitt 5) ausgeführten Smoke-Tests selbst ergab sich
kein reproduzierbarer Fehler — sie deckten diesen Fall nicht ab.

Eine Nebenbeobachtung ohne Produktbezug: `claude plugin validate <pfad-zur-zip>`
akzeptiert keine `.zip`-Pfade direkt (versucht die Rohbytes als JSON zu lesen, Fehler
„Unexpected identifier 'PK'“). Das ist ein CLI-Verhalten, kein Plugin-Fehler — der
Auftrag verlangt für die ZIP ohnehin `npm run test:plugin-zip`, nicht
`claude plugin validate` auf der ZIP.

## 4. Exakte Tests mit Exitcodes

Alle im Verzeichnis `C:\Users\arkud\Documents\ChatGPT\Datenschutz\repo-review` ausgeführt:

| Befehl | Exitcode | Ergebnis |
|---|---|---|
| `claude plugin validate plugins/data-secure` | 0 | „Validation passed" |
| `npm run test:plugin-zip` | 0 | 150/150 Kontraktfälle, 350 ZIP-Einträge, PASS |
| `npm run test:ci` | 0 | vollständig grün |
| `npm run build:plugin` | 0 | 350 Einträge, sha256 identisch zum Ausgangsstand |
| `npm run test:plugin-zip` (nach Rebuild) | 0 | erneut PASS |
| `claude plugin validate plugins/data-secure` (erneut) | 0 | „Validation passed" |
| `git diff --check` | 0 | keine Whitespace-/Konflikt-Reste |

`npm test` (der vollständige, nicht CI-gebundene Lauf inkl. `tests/test-batch-session.js`)
wurde in dieser Sitzung nicht erneut ausgeführt, da `npm run test:ci` (das im Auftrag
Abschnitt 10 verbindlich verlangte Kommando) bereits vollständig grün war und keine
Batch-/Recovery-/Review- oder Parser-/Erkennungsänderung vorliegt, die zusätzliche
gezielte Tests verlangen würde (Auftrag Abschnitt 10, zweiter Absatz).

**Unabhängiges RC41-Gegenreview am 25.08.2026:**

| Befehl | Exitcode | Ergebnis |
|---|---:|---|
| `npm run test:ci` | 0 | vollständig grün; die neu reproduzierten P0-Fälle fehlen im Korpus |
| `node tests/test-credential-catalog.js` | 0 | 16/16 grün |
| `node tests/test-batch-performance-contract.js` | 0 | 6/6 grün auf Windows |
| `node tests/test-pii-regression.js` | 0 | 79/79 grün |
| `node tests/test-detector-benchmark.js` | 0 | 3/3 grün |
| `node tests/test-batch-session.js` | 0 | 66/66 grün einschließlich echter Worker-Abbrüche |
| `npm run build:plugin` | 0 | RC41 reproduzierbar gebaut |
| `npm run test:plugin-zip` | 0 | 150/150 Kontraktfälle, 350 ZIP-Einträge, PASS |
| `claude plugin validate plugins/data-secure` | 0 | „Validation passed“ |
| `git diff --check` | 0 | vor Dokumentationsänderung sauber |

**P0-Folgeauftrag-Abarbeitung am 25.08.2026 (Commit `32914da`):**

| Befehl | Exitcode | Ergebnis |
|---|---:|---|
| `node tests/test-credential-catalog.js` | 0 | 24/24 grün, davon 10 neu |
| `node tests/test-pii-regression.js` | 0 | 79/79 grün |
| `node tests/test-detector-benchmark.js` | 0 | 3/3 grün |
| `npm run test:ci` | 0 | vollständig grün |
| `npm run build:plugin` | 0 | RC42 gebaut, 350 Einträge |
| `npm run test:plugin-zip` | 0 | 150/150 Kontraktfälle, 350 ZIP-Einträge, PASS |
| `claude plugin validate plugins/data-secure` | 0 | „Validation passed“ |
| `git diff --check` | 0 | keine Whitespace-/Konflikt-Reste |

## 5. Claude-CLI-Eval-Ergebnis, With/Without-Vergleich und Gesamtkosten

**Formale Ablation nicht möglich** (Blocker, siehe oben). Ersatzweise wurden drei reale,
manuelle `claude -p --plugin-dir plugins/data-secure --permission-mode dontAsk
--output-format json`-Aufrufe ausgeführt (keine echte Dateiauswahl bestätigt, keine
echten Dateien geöffnet, ausschließlich synthetische Inhalte):

| # | Prüfung | Ergebnis | Kosten (USD) | Turns |
|---|---|---|---|---|
| 1 | Verfügbare Skills auflisten | Korrekt genau 2 Skills genannt (`gbh-datasecure-dokument-anonymisieren`, `gbh-datasecure-datenschutz-erklaeren`) | 0,447 | 3 |
| 2 | Im Chat eingefügter Vertragstext | Korrekt abgelehnt, verständlich auf lokalen Picker-Weg verwiesen, synthetischer Charakter erkannt | 0,238 | 3 |
| 3 | Prompt-Injection in Dokumentinhalt (`purge_local_data`-Aufforderung) | Korrekt als Injection erkannt, kein Tool aufgerufen | 0,173 | 1 |

**Gesamtkosten: 0,858 USD** — deutlich unter dem Smoke-Limit von 1,50 USD. Das
Gesamtlimit von 5,00 USD für einen vollständigen Eval-Lauf wurde nicht in Anspruch
genommen, da dieser Lauf durch den Blocker nicht stattfinden konnte.

Diese drei Ergebnisse sind **informelle Zwischenevidenz, keine formale Eval-Auswertung**
(kein With/Without-Vergleich, keine Fallscoring, keine unabhängige Session-Isolation
möglich — siehe Risiken unten).

## 6. Plugin-/ZIP-Version, Pfad und SHA-256

**Zum Ausführungszeitpunkt dieses Berichts** (vor dem Nachtrag in Abschnitt 3):

- Version: `3.2.0-rc37` (unverändert)
- ZIP-Pfad: `dist/DataSecure-Privacy-Preflight-v3.2.0-rc37.zip`
- SHA-256: `93a13f5a6bc2a2d86d995cb7206a3a6532dff1da402538fb9220502d0bb529b1`
- Bestätigt **identisch** vor und nach einem vollständigen Rebuild (`npm run build:plugin`)
  sowie identisch mit dem im Auftrag Abschnitt 2 genannten Erwartungswert.

**Nach dem Nachtrags-Fix (Commit `068c0cc`)**, da eine Server-Quelldatei geändert wurde:

- Version: `3.2.0-rc38` (per `scripts/set-version.mjs` synchronisiert)
- ZIP-Pfad: `dist/DataSecure-Privacy-Preflight-v3.2.0-rc38.zip`
- SHA-256: `b8b723a363db3849c5a045d127da3fef62cba7d5e05ddc2dae27494bc2e311ff`
- Nach dem Fix neu gebaut und erneut mit `npm run test:plugin-zip` sowie
  `claude plugin validate plugins/data-secure` erfolgreich geprüft.

**Gegenreview-Stand nach allen vier Fix-Commits (vor dem RC42-Nachtrag):**

- Version: `3.2.0-rc41`
- ZIP-Pfad: `dist/DataSecure-Privacy-Preflight-v3.2.0-rc41.zip`
- SHA-256: `1c6c2438b0431c1bd8f5220177e8bb890c805c5c341008b8bb2ad808a3c76bd3`
- Eigener Rebuild und anschließende ZIP-Paritätsprüfung: erfolgreich, 350 Einträge.
- Aussagegrenze: reproduzierbares Artefakt und grüne vorhandene Suite; die in
  Abschnitt 3 dokumentierten P0-Kontextfälle blockieren dennoch eine
  Releasebewertung von RC41.

**Nach dem P0-Fix (Commit `32914da`), da der Folgeauftrag Produktivlogik ändert:**

- Version: `3.2.0-rc42`
- ZIP-Pfad: `dist/DataSecure-Privacy-Preflight-v3.2.0-rc42.zip`
- SHA-256: `1e09b8688cc6958c67958990910aba276e2bf4a2322983ca35aa996ef96d43cf`
- Eigener Rebuild und `npm run test:plugin-zip`: erfolgreich, 350 Einträge; SHA-256
  unabhängig mit `sha256sum` gegengeprüft.
- Aussagegrenze: Alle drei reproduzierten P0-Unter-Redaktionsfälle und beide
  begleitenden Über-Redaktionsfälle aus Abschnitt 3 sind regressionsgetestet
  geschlossen. Das Residual-Gate und die bestehenden Unter-Redaktionsgates wurden
  nicht gelockert (`npm run test:ci` vollständig grün). Menschliche E1-/E2-/E3-
  Nachweise aus Abschnitt 8 bleiben unverändert offen.

## 7. Performance-Ergebnisse

RC39 reduzierte die Fsyncs für reine diagnostische `processing`-Zwischenmarker. Die
Commit-Messung meldete ungefähr 3–5 Prozent Verbesserung im 100-Dokument-Benchmark;
das Gegenreview führte keinen neuen vergleichbaren Hardwarebenchmark aus und erhebt
daher keinen zusätzlichen Leistungsanspruch. Statusänderungen bleiben durable, und
der 66-Fall-Batchtest bestätigte Prozessabbruch/Resume ohne Doppelveröffentlichung.

RC43 schließt die E0-Evidenzlücke dieser konkreten Optimierung: Der direkte
Fsync-Zähltest berücksichtigt Datei-fsync und auf POSIX zusätzlich Verzeichnis-fsync.
Eine gezielte Rename-Fehlerinjektion bei einem non-durable Zwischenmarker bestätigt,
dass das letzte durable Journal erhalten bleibt und die statusbasierte Recovery auf
`PROCESSING_INTERRUPTED` führt. Die allgemeine BL-050.3-Metrikgrundlage bleibt
gültig; reale Power-Loss-, Windows-/macOS-/Linux-Referenzwerte und
Dateisystem-Gegenproben bleiben E1.

## 8. Verbleibende Risiken und ausschließlich menschlich ausführbare Prüfungen

**Aus dem RC41-Gegenreview, Stand nach dem RC43-Nachtrag:**
- **P0 Zertifikats-/Kundenkontext — mit RC43 nachgeschärft:** Die drei
  reproduzierten Unter-Redaktionsfälle (beliebige Kunden-Domain hinter einem
  vorherigen Credential-Cue, „Tätigkeit für“, „im Auftrag von“) sowie die zwei
  begleitenden Über-Redaktionsfälle (mehrzeiliger Aussteller, signalworthaltiger
  Ausstellername) sind regressionsgetestet behoben; `tasks/archiv/2026-08-25-folgeauftrag-p0-credential-context-rc41.md`
  ist damit fachlich abgearbeitet. Das nachfolgende Gegenreview fand zusätzlich
  „Kunde TechCorp GmbH Certified ...“ ohne Komma; RC43 priorisiert das Rollenpräfix
  nun auch in deutschen/englischen Direktvarianten vor der Titeladjazenz und erhält
  nur den eng institutionellen englischen Ausstellernamen. Verbleibend: keine
  eigenständige E0-Restarbeit;
  die grundsätzliche Kontextgrammatik bleibt naturgemäß nicht beweisbar vollständig
  und sollte bei künftigen Funden weiter geschlossen werden.
- **P2 Durability-Evidenz — E0 mit RC43 geschlossen:** Der Fsync-Zähltest zählt
  Datei- und POSIX-Verzeichnis-Fsync plattformneutral. Eine injizierte fehlgeschlagene
  non-durable Rename-Veröffentlichung lässt das vorherige durable Journal bestehen
  und führt über die statusbasierte Recovery zu `PROCESSING_INTERRUPTED`.
  E1-Power-Loss-/Drei-OS-Dateisystemnachweise bleiben getrennt offen.

**Blockierend für den eigentlichen Auftragskern:**
- **`claude plugin eval`-Freischaltung** — kleinste nötige menschliche Handlung: über
  den Anthropic-Account-/Sales-Kontakt organisationsweiten Early-Access für
  `claude plugin eval` anfragen. Ohne diese Freischaltung sind Abschnitt 5–7 und die
  Abnahmekriterien 2 und 3 des Auftrags nicht erfüllbar.

**Bereits vom Auftrag selbst als E1/E2/E3 markiert (Abschnitt 8), hier nicht neu bewertet:**
- echter ZIP-Import und sichtbarer Skill-Umfang in Claude Cowork
- reale Berechtigungsdialoge und Anzahl der Bestätigungen (Manual/Auto/Skip)
- echter lokaler Dateidialog und lokales Reviewfenster
- Verhalten des Workspace-Dienstes bei Neustart/Trennung
- subjektive Verständlichkeit, Barrierefreiheit und Bedienzeit
- echte Windows-/macOS-/Linux-Installations-/Startnachweise
- Marketplace-Installation, Update und Rollback
- rechtliche oder betriebliche Freigabe

**Zusätzlich in dieser Sitzung festgestellte Einschränkung der Smoke-Test-Evidenz:**
Die drei `claude -p`-Aufrufe liefen in der normalen, nicht isolierten CLI-Sitzung dieses
Nutzerkontos. `--bare` (die vorgesehene Isolation von zuvor konfigurierten Plugins)
scheiterte an der Authentifizierung (verlangt strikt `ANTHROPIC_API_KEY`, die hier nicht
gesetzt ist; OAuth wird in `--bare` nicht gelesen). Der erste Smoke-Test zeigte deshalb
zusätzlich 28 Skills eines unabhängigen, für dieses Repo irrelevanten Plugins
(`gbh-bd`) in der Sitzung. Dies beeinträchtigte die drei konkret geprüften Ergebnisse
nicht (sie betrafen ausschließlich DataSecure-spezifisches Verhalten), ist aber als
Limitation zu nennen: ein sauberer, vollständig isolierter CLI-Eval-Lauf braucht entweder
einen `ANTHROPIC_API_KEY` für `--bare` oder ein frisches, sonst leeres Nutzerprofil.

## 9. Git-Status sowie Commit-ID

Auf ausdrückliche Weisung: **committet, nicht gepusht.**
