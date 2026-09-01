# Testing

RC83 ergänzt `test-local-handoff-resume.js`: 20 integrierte Produktionskomponenten-
Regressionen für Teilübertragung, Abbruch/Ablauf/Neustart, 1/6/11/100 Ergebnisse,
gemischte Grade und Auslassungen, gestoppte Dateien, Legacy sowie beschädigte
Evidenz/Paketbindung. Das Gate ist in normaler Suite, CI, Fast Path und Delivery
eingebunden. Vollständige lokale CI und Paketbau einschließlich 150/150 gepackter
Anonymisierungsvarianten bestehen. Echte Cowork-/Geräteabnahme bleibt offen.
Zusätzlich verhindert ein `test-batch-results.js`-Negativfall leere Folgeseiten,
wenn nach fünf Ergebnissen nur gestoppte oder bereits bestätigte Einträge folgen.
`test-package-read-capabilities.js` prüft außerdem, dass der direkte
Dateipaging-Ausweichpfad eine Emoji-Surrogatfolge an der Seitengrenze nicht trennt,
ungültiges UTF-8 und fremde Teilzeichen-Offsets ablehnt und Schließfehler ohne
Systemdetails meldet. `test-companion-ipc.js` prüft case-sensitive POSIX-Dateien;
zusätzliche Picker-/Passwort-/UTF-8-, Dateisystem-, Handoff-Race- und
Ergebnisseiten-Negativtests heben RC83 auf insgesamt 32 neue Defectregressionen.

RC82 ergänzt Tests der asynchronen Ergebniswahl: Handoff16/Picker18/MCP41 PASS.
Hostabbruch, Cancel, Doppelstart und fehlerhafte Teilausgaben dürfen keine
Paketlesevorgänge auslösen. `test-keyring-artifacts.mjs` prüft nun den rohen
Marketplace-Produktbaum statt ausschließlich gefilterter Archivdateien (15 PASS).
Historische Adapter/Vendorfixtures liegen nur unter `tests/legacy/keyring`.
Gesamtabschluss und Einschränkungen im
[RC82-Bericht](RC82_DIALOG_MARKETPLACE_FIXES_2026-08-31.md).

Aktuelle Testpriorität nach DS-065 / RC81: Plain-Snapshot-/Reviewpfad ohne
Schlüsselbund, Keyfile oder Passwort; neue/fortgesetzte Stapel, Originalschutz und
unangetastete verschlüsselte Altbestände. 18 Storetests und 24 Retentiontests PASS.
Die vollständige lokale RC81-Gesamtregression `npm run test:ci` einschließlich
Pre-/Posttests und `npm run build` bestehen. Ein erster Sandboxlauf stoppte an
Esbuild-Verzeichnisrechten; der gesonderte Test und die vollständige Suite
außerhalb dieser Einschränkung bestehen. Keine GitHub Actions ausgeführt.

## RC81-Defectregression (31.08.2026)

- `npm run test:rc81-review`: Semantik13, Zertifikatskatalog24, nativer Picker12,
  Reviewmodell7, Revieworchestrator17, Item-Processor14 und Dokumentationsvertrag.
  Das Gate ist in `posttest:ci` eingebunden.
- Die übrige CI prüft unter anderem Gateway-E2E43, MCP39, echte gemischte
  TXT/CSV/DOCX-Fortsetzung, Intake12, Delivery11 und Retention-Schutz9.
- Zusätzlich `node tests/test-batch-session.js`: **67/67 PASS**, inklusive echter
  100-Dateien-Verarbeitung und Test-Worker-Abbrüchen an Position 1/50/100 mit
  anschließender Wiederaufnahme. Protokoll: `dist/rc81-batch-session.log`.
  Der unterbrochene Vorgängerlauf ist kein Erfolg; der vollständige Wiederholungslauf
  prüft auch den korrigierten Prozessereignis-Doppelgänger und RAM-Checkpoint-Vertrag.
- `npm run build`: ZIP/MCPB-Quellparität und 150 Vertragsvarianten, Statusartefakte,
  SBOM und Ausschluss der nicht ausgelieferten Keyring-Komponenten PASS.
- `npm run validate:claude-local`: offizieller CLI-Strukturvalidator 2.1.233,
  Plugin und Marketplace PASS. Keine Modell-/Cowork-Abnahme daraus ableiten.
- Separater Phasenbenchmark für 10 TXT/CSV/DOCX-Dateien: cold 11.398 ms,
  warm 11.227 ms; 20/20 freigegeben, 0 gestoppt, Peak-RSS 72/74 MiB.
  `dist/rc81-benchmark.json`; In-Process-Parser, nicht Cowork, kein kontrollierter
  RC80-/RC81-Vergleich und keine zugesicherte Zielhardware-Laufzeit.
- Einzelbefunde, zusätzliche Langläufe und Grenzen:
  [RC81-Defectabschluss](RC81_DEFECT_ABSCHLUSS_2026-08-31.md).

Lokale Protokolle: `dist/rc81-test-ci.log`, `dist/rc81-build.log`. Kein Test liest
produktive Dokumente oder verwendet produktive Schlüssel. Sichtbare Cowork- und
macOS-/Linux-Abnahmen bleiben im kanonischen Backlog offen.

Native Keyring-Smoke-Tests und zusätzlicher Engineering-Keyring-Session-Unterbau
sind wegen Scopewechsel obsolet, nicht bestanden. Keine VM, kein Zusatzkonto und
keine produktiven Credentials für Tests. Historische Testergebnisse unten bleiben
unverändert; deren Keyring-Aufträge nicht erneut ausführen. Normale echte
Cowork-/Zielsystemabnahme bleibt erforderlich.

## DS-063-Komponentenschnitt (RC79-Folgearbeit, 31.08.2026)

- `npm run test:engineering-keyring`: **52 PASS** (24 Memory-Komponenten-/
  Negativtests, 18 Quell-/Packaging-Gates, 10 Verifier-Verträge). Keine OS-Keys.
- `npm run test:ci`: **PASS**, inklusive Pre-/Post-Gates. Vollständiges lokales
  Protokoll: `dist/same-account-test-ci.log`. Keine GitHub Actions.
- Security-/Architekturreview: Wiederholungsfehler nach ungewisser Speicherung
  gefunden und behoben. Pinning des erwarteten Schreibwerts, synchroner Readback
  und terminale Fehlerbindung verhindern spätere Adoption eines falschen Keys.
  Drei Wiederholungen, fehlender Readback, spätere Schlüsseländerung und
  Promise-/Non-void-Backendausgänge als Regression geprüft; Gegenreview bestätigt.
- Der bestehende SEA-Verifier stoppt auch mit historischer Konto-Bestätigung
  vor Assembly-I/O (`SEA_BATCH_TEST_ISOLATION_PENDING`). Produktcode/-version
  unverändert; Adapter außerhalb des Pluginbaums, keine Laufzeit-/Dialogkosten.
- Das Backend der neuen Integrationstests ist explizit **Memory**. Das
  Produktfeld `backend: native_os_keyring` wird nicht als OS-Evidenz benutzt.
  Kleine, frisch erzeugte synthetische Testverzeichnisse bleiben erhalten;
  keine Credential-Löschung oder Bereinigung echter Nutzerdaten.
- Native Backendprobe und private Session-/Scope-/Buildbindung über sämtliche
  Engineering-Prozesse bleiben offen. Keine VM, kein Zusatzkonto, kein
  Commit/Push und keine neue Produkt-/OS-/Cowork-Abnahme.

## Verbindliche Testumgebung (DS-062/DS-063, 31.08.2026)

Keine zusätzliche System-VM und kein zusätzliches Windows-Benutzerkonto.
Die früher unten beschriebene Kontoanforderung ist verworfen. Sichere Testtrennung
im vorhandenen Konto ist offene E0-Entwicklungsarbeit, keine Nutzeraufgabe.
Der bestehende SEA-Produkt-Keyring-Harness darf bis zum geprüften Neuentwurf nicht
ausgeführt werden; `--isolated-test-account` weder entfernen noch im vorhandenen
Konto zur Umgehung setzen. Temporäre Dateiordner isolieren den Schlüsselbund nicht.
Produktcredentials bleiben unberührt. Produktfreie synthetische Tests bleiben
möglich; sie belegen keine unveränderte Produkt-/OS-Abnahme.

```bash
npm test                # the whole suite
npm run test:ci         # short, security-relevant set used by the one automatic CI job
npm run test:golden     # regenerate the golden expected output after an intended change
npm run test:windows-visual # real Windows OCR/redaction acceptance (Windows only)
npm run test:skills     # local German skill/contract acceptance
npm run validate:claude-local # official local structure validator; no model run or CLI installation
npm run test:intake-worker-stress # 50 real detached intake-worker starts
npm run test:legacy-input # versionierte, datenbewahrende Upgrade-Migration
npm run benchmark:detectors # aggregate detector quality on the synthetic ground truth
npm run build:plugin && npm run test:plugin-zip # same acceptance against the built ZIP
npm run test:sea-gates   # assembly/evidence, resolver and simulated dispatch; not a release gate result
node scripts/verify-sea-launcher.mjs --target <target> --launcher <binary> # legacy NO-GO probe, not the real parent-dispatch test
```

## Lokaler RC79-Nachweis 31.08.2026

BL-010.8: Architektur-/Implementierungsfachagenten und unabhängiges Lifecycle-
Gegenreview. Kein blockierender Gegenreviewbefund. DS-062 nimmt die frühere
System-VM-Testoption zurück; Tests hier laufen direkt auf dem lokalen Rechner,
ohne Produktimporte, Credential Store oder Originaldateien.

- `test-sea-process-observer-contract.mjs`: **47 PASS**. Neue Fälle erzwingen den
  Parent-Modus, Ereignisreihenfolge, fehlende/doppelte/vorzeitige Parentnachweise,
  geschlossene Metadaten und Ablehnung bei fehlendem Worker-/Helferabschluss.
- Nativer Build `dist/sea-observer-rc79-a`: **PASS**, vorhandenes MSVC/SDK,
  `/W4 /WX`, 156672 Bytes, SHA-256
  `0f23066f883248a82507af39cef37a1d3c7ac48af1220a082b5e300033e1f30b`.
  Zweiter Build in `dist/sea-observer-rc79-b`: **byte-identisch**.
- `sea-process-observer-native.mjs dist/sea-observer-rc79-a`: **17 PASS**.
  Zehn RC78-Fälle bleiben erhalten; neu sind native Parent-/Worker-Reihenfolge
  bei kontrolliertem Parentende und Parentkill, Worker-first-Ablehnung, lebender
  Parent bis Deadline, Observerabbruch, falsche Nonce und Parent-/Worker-PID-Kollision.

Alle Nachweise sind Engineering-/synthetische Windows-Prozessnachweise, keine
Produktstapel-, Fortsetzungs-, Prozessabstammungs- oder Privacy-Freigabe. Tests
beenden ausschließlich ihre eigenen Prozesse. Produkt-Harness-Anbindung und
vollständiger Ergebnisvergleich bleiben eigenständig offen. Native Spezialfälle
für frühen Parentexit und falsches Parent-Image folgen beim Anschluss;
Ablehnungscode bereits vorhanden, nicht als ausgeführt behauptet.

Kanonvalidator: **PASS**, 62 Entscheidungen, 24 Epics, 66 Stories. Capability-
Vertrag einschließlich VM-Ausschluss: **11 PASS**. `npm run test:ci` einschließlich
Vor-/Nachtests: **PASS, Exit 0**. `npm run build`: **PASS**, ZIP 430 und MCPB 605
Einträge, gepackte 13 Skill-/Vertrags- und 150 Anonymisierungsfälle, Quellparität,
SBOM-/Status-App-Nachweise bestanden. Nach diesem Eintrag wird das MCPB mit der
finalen Dokumentation neu gebaut und nochmals geprüft; finale Hashes stehen in
`dist/SHA256SUMS`. Der native Engineering-Beobachter bleibt außerhalb der Pakete.
Keine GitHub Actions, keine VM, kein Commit/Push. Ein OS-Testkonto wurde nicht angelegt.

## Lokaler RC78-Nachweis 31.08.2026

BL-010.8, Architektur-/Security-Gegenreview: separater Engineering-Beobachter,
keine Produktimporte/Keyringjobs. Keine produktive Parser-/Supervisoränderung.

- `test-sea-process-observer-contract.mjs`: **37 PASS**, reine Protokoll-/Budget-
  Prüfungen; keine nativen Prozesse im automatischen SEA-Testgate.
- `build-sea-process-observer.mjs --output-directory dist/sea-observer-rc78-c`:
  **PASS**, MSVC 19.50.35725, SDK 10.0.26100.0, `/W4 /WX`, statische CRT.
  EXE 156160 Bytes, SHA-256
  `cd1a7a86b58209a519769d3c88bc2672ad624e38ecd506cc446937177babffa3`.
  Zweiter finaler Build in `dist/sea-observer-rc78-d`: **byte-identisch**.
  Builder und C++-Quelle bleiben an die vor Buildbeginn erfassten Bytes gebunden.
- `tests/manual/sea-process-observer-native.mjs dist/sea-observer-rc78-c`:
  **10 native synthetische Fälle PASS**: normaler Exit, signalisierter Exit 259,
  kontrolliertes Parentende, Parentkill mit detached-Enkel, fremde PID bei
  gleichem Image, falsches Image, falsche Nonce, Verbindungsdeadline,
  Worker-Wartedeadline und abgebrochener Observer ohne Exitnachweis.

Frühe Läufe schlugen korrekt fehl: der noch nicht detached gestartete Enkel
endete beim Parentende mit Code 0 statt seinem eigenen erwarteten Code 7.
Die Fixture wurde unabhängig gestartet; feste Exitfrist und gehaltene Pipes
begrenzen ihre Lebensdauer. Alleine daraus folgt keine Produktfortsetzung.
Gegenreviewfunde zu beliebigen Fehlern als Negativ-PASS und unbegrenzter Ausgabe
sind korrigiert. Zusätzliche ungültige Protokollzeilen werden auch bei erwarteten
Fehlern abgelehnt. Native Ergebnisse sind ausschließlich synthetische Windows-
Evidenz, kein SEA-Stapel-/OS-Isolations-/POSIX-/Cowork- oder Power-Loss-Nachweis.

`npm run test:ci` einschließlich Pre-/Posttests: **PASS, Exit 0**. Kanonischer
Dokumentenvalidator: **PASS**, 61 Entscheidungen, 24 Epics, 66 Stories.
`npm run build`: **PASS, Exit 0**; ZIP 430 und MCPB 605 Einträge, Quellparität,
13 gepackte Skill-/Vertragsfälle und 150 gepackte Anonymisierungsfälle bestanden.
SBOM-/Status-App-Archivprüfung ebenfalls PASS. Nach diesem Nachweiseintrag wird
das MCPB mit finaler Dokumentation neu gebaut und nochmals geprüft; finale
Artefakthashes stehen in `dist/SHA256SUMS`. Keine GitHub Actions,
kein Commit/Push in diesem Schnitt.
Rollenvertrag und Backlog trennen implementierten Observer und offene
Produkt-Harness-Integration. Standardstart bleibt `node`, Helfer nicht im ZIP/MCPB.

## Lokaler RC77-Nachweis 31.08.2026

BL-010.1/BL-010.8: rekonstruierte Parent-Buildprovenienz, begleitet von Architektur-
und Security-Agenten. Keine native SEA-Ausführung, keine Produkt-Keyringjobs.

- `test-sea-launcher-provenance.mjs`: **38 PASS**. Quellen-/Bootstrap-/Config-/Toolchain-
  Manipulation, Standortunabhängigkeit, geschlossene V2-Buildfelder, Nullrolle,
  Binärhash/-länge und falsche Typen. Commander-Code wird zusätzlich erfasst.
- `test-sea-plugin-assembly.js`: **84 PASS** im gezielten Lauf, einschließlich
  frischer MCP-Nachweise bei veralteter Parentprovenienz und gleichzeitiger
  Neudefinition aller Build-/MCP-Nachweise nach erster Quellenaufnahme. Beides
  stoppt vor Stage-Erstellung. Explizites NO-GO für noch nicht paketierte Parserrollen.
- Launcher-/Worker-Verträge verwenden die wirkliche gemeinsame SEA-Konfiguration.
  Gegenreviewfunde: Quellen-Rebaselining, fehlende Commander-Abhängigkeit und
  Array-als-Hash wurden korrigiert. Builder bindet archivgeprüftes und kopiertes
  Nodeprogramm an denselben vorher erfassten Hash.

Ein erster `test:sea-gates`-Lauf scheiterte an einem veralteten Konfigurations-
Stringtest, der angepasst wurde. Der Folgelauf erreichte den Parserbundle-Test,
scheiterte dort aber an Sandbox-Leserechten für esbuild. Die Tests werden mit
erweiterten lokalen Rechten wiederholt, ohne Testgates abzuschwächen.
`npm run test:ci` mit Pre-/Posttests: **PASS, Exit 0**. Zusätzlich finaler
Provenienzlauf **38 PASS**, Assembly **84 PASS**, kanonischer Dokumentenvalidator
**PASS** (61 Entscheidungen, 24 Epics, 66 Stories), `git diff --check` sauber.
Die Rekonstruktion gegen den echten installierten Toolbestand wurde separat
read-only geprüft: 27 Toolchain-Dateien. Dabei wurde die Commander-Auflösung
an dessen tatsächlich exportierten Einstieg angepasst; Fixtures bilden die
Sperre von `commander/package.json` nun ebenfalls ab.
`npm run build`: **PASS, Exit 0**. ZIP **430** und MCPB **605** Einträge;
Quellparität, 13 gepackte Skill-/Vertragsfälle und 150 gepackte Anonymisierungsfälle
bestanden. SBOM-/Status-App-Archivprüfung ebenfalls PASS. Das Security-Gegenreview
bestätigt alle drei Befunde als geschlossen. Nach Eintrag dieser Ergebnisse wird
das MCPB einmal mit der finalen Dokumentation neu gebaut und auf Quellparität
geprüft; finale Artefakthashes stehen in `dist/SHA256SUMS`.

Buildkonsistenz ist keine Binär-/Hostattestierung oder Laufzeitimmutabilität
externer Module. Kein Format freigeschaltet, kein zusätzlicher Dialog, keine
per-Dokument-Hashinventur. Öffentlicher Node-Start bleibt erhalten.
Kein Commit/Push und keine GitHub Actions in diesem Schnitt.

## Lokaler RC76-Nachweis 31.08.2026

BL-010.8/BL-011.8/BL-011.11: besitzgebundene Staging-Recovery mit Architektur-,
Security- und Testgegenreview. Der Einzeldateinamen-Vertragskonflikt wurde vor
Abschluss behoben und integriert getestet.

- `test-package-staging.js`: **24 PASS**. Root-/Owner-/Payloadbindung, Publish,
  Discard, tote/lebende Besitzer, Wiederholung, unbekannte Altdaten, Root-/Stage-
  Austausch, ungültige Kennungen, defekte/hardverlinkte Records, Links/Hardlinks,
  belegtes/fremdes Finalziel, fehlendes Payload nach Rename.
- `test-safe-private-tree.js`: **7 PASS**, inklusive vollständiger gebundener
  Baumprüfung vor erster Löschung und exakter Parent-/Zielidentitäten.
- `test-source-folder.js`: **8 PASS**; private Stages werden weder direkt noch
  rekursiv als Quellen übernommen; ähnliche Originalordnernamen bleiben zulässig.
- `test-package-staging-integration.js`: **5 Gruppen PASS**. Echter eigener
  Node-Kindprozess hart beendet vor Publish; separater Exit nach Rename vor
  Receiptabschluss. Produktive Startwartung entfernt nur eindeutig gebundene
  Reste; bereits fertiges Paket und Originalbytes bleiben unverändert. Erfolgs-
  und Fehlerpfad ohne feste Batchpaket-ID, PII-Gate und Qualifikationserhalt.
  Drei serielle Dokumente nutzen genau eine vorbereitende Recoveryinventur.
- `test-sea-batch-result-contract.js`: **17 PASS**, einschließlich schreibfreier
  Staging-Abnahme. Restzähler, Fehler, fehlende oder falsch typisierte Werte
  dürfen kein PASS liefern; vorhandene Outputinventur bleibt streng.
- Zusätzliche Regression: Gateway **40 PASS**, Companion-Verarbeitung **39 PASS**,
  datensparsame Diagnostik **8 PASS**, Performance-Verträge **6 PASS**.

`test:staging` ist in Pretest/Pretest-CI/Pretest-Fast-Path eingebunden. Die
Integration nutzt synthetische Quellen und einen festen In-Memory-Konverter,
keinen Produkt-Keyring, keine GUI und kein Internet. Sie ist keine native SEA-,
Cowork-, POSIX- oder Power-Loss-Abnahme. Kleine eigene Testbäume bleiben erhalten.
Der SEA-Oracle prüft Output und Staging streng, ohne selbst zu bereinigen.

`npm run test:ci` einschließlich Pre-/Posttests: **PASS, Exit 0**. Zuvor wurden
ein unzulässiger Dokumentationsstatus und die alte exakte Pretest-Liste im
Manifesttest korrigiert; die erneute komplette Suite besteht. Anschließende
Fehlerpfad-Härtung des Testharness (Fixture auch bei fehlgeschlagener Beobachtung
beenden, danach `close` abwarten) separat erneut geprüft: fünf Gruppen PASS.

`npm run build`: **PASS, Exit 0**, mit Plugin-ZIP/MCPB-Quellparität,
13 gepackten Skill-/Vertragsfällen, 150 gepackten Anonymisierungsfällen,
SBOM und Status-App-Archivprüfung. RC76: **430 ZIP-/605 MCPB-Einträge**.
Nach Abschluss dieser Dokumentation wird das MCPB nochmals gebaut und auf
Quellparität geprüft; verbindliche finale Hashes stehen in `dist/SHA256SUMS`.
Kein Commit/Push und keine GitHub Actions in diesem Korrekturschnitt.

## Lokaler RC75-Nachweis 31.08.2026

BL-010.8/BL-011.11: Architektur-, Security- und Testagenten haben den neuen
Worker-Crash-/Resume-Harness unabhängig geprüft. Der echte native Lauf ist hier
**nicht ausgeführt**, weil die sichere Credential-Trennung fehlte. Der dafür
zunächst vorgesehene zusätzliche Kontoansatz ist seit DS-063 verworfen.
Das normale Plugin bleibt beim Node-Start.

- `test-sea-batch-resume-contract.js`: **44 PASS**. Echtes privates Predicate,
  Zustands-/ID-/Paketbindung, readonly Journal, Parser-`close` vor `onExtracted`,
  letzter bildfreier DOCX. Sparse-Array-Gegenreviewfund behoben; keine Behauptung,
  dass echte JSON-Journale Arraylöcher enthalten.
- `test-sea-batch-resume-lifecycle.js`: **17 Gruppen PASS**. Echte private
  Orchestrierungsfunktionen im VM mit synthetischem Journal, Speicherdateien,
  Child-Events und virtueller Uhr: Erhalt zweier fertiger Pakete; tatsächliche
  Exit-/Disconnect-Events vor Fortsetzung; Lease vor IPC; verpasster Crashpunkt,
  natürlicher Exit, fehlgeschlagener Kill/Claim/IPC, fremder Token, veränderte
  Pakete, fehlerhafte Abschlussframes, Journal- und Cleanup-Timeouts.
- `test-sea-batch-result-contract.js`: **16 PASS**. PII-/Qualifikationsoracle und
  alle drei festen TXT/CSV/DOCX-Fixtures; der reale In-Memory-OOXML-Parser liest
  auch das vergrößerte letzte Resume-DOCX ohne Warnungen/Bilder. Keine Worker,
  kein Keyring; dies ersetzt keinen nativen Parser-/Stapel-/Performancenachweis.
- `test-sea-batch-probe-contract.js`: **41 PASS**, einschließlich gültigem
  Resume-Scope und Netzwerkguard vor Produktimport. Die Sandbox verweigerte
  zunächst den Elternpfad-Realpath; derselbe Test bestand mit lokal erweiterter
  Leseberechtigung. Keine abgeschwächte Pfadprüfung.
- `test-sea-batch-verifier.mjs`: **neun PASS**. Standardmäßig drei serielle
  Szenarien, zwei obligatorische Resume-Ergebnisflags, kein falsches Resume-PASS
  für positive/Disconnect-Läufe. Fehlendes Opt-in und ungültige Szenarien stoppen
  vor nativen Jobs. `test-sea-background-bootstrap.js`: **27 PASS**.

Alle sechs Testsuiten (154 Testgruppen insgesamt) sind in `test:sea-gates` integriert.

Gesamtnachweise: `npm run test:ci` einschließlich Pre-/Posttests **PASS, Exit 0**;
`npm run build` einschließlich Plugin-ZIP-/MCPB-Parität, 13 Vertragsfällen,
150 Anonymisierungsfällen, SBOM und Status-App-Archivprüfung **PASS, Exit 0**.
RC75-Archive enthalten 429 (Plugin-ZIP) beziehungsweise 604 (MCPB) Einträge;
verbindliche Hashes stehen in `dist/SHA256SUMS`. Nach Aufnahme dieses Nachweises
wird das MCPB mit der aktualisierten Dokumentation erneut paketiert/geprüft.
Neue Tests nur per Intent-to-add registriert; kein Commit/Push, keine GitHub
Actions gestartet. Die bestehende Gesamtsuite enthält weiterhin einen
automatisch geschlossenen lokalen Windows-Formulartest.

`extracted` ist ein non-durable Zwischenmarker: kein Power-Loss-/Fsync-Nachweis.
Der Headless-Test nutzt Fortsetzungs-/Worker-/Lease-APIs, nicht den GUI-Starter
`startLocalBatchExecutor`; Cowork, Parent-Crash und plattformweite Abnahme offen.
`cleanup_safe` ist kein allgemeiner Prozessbaum-Cleanup-Beleg. Die synthetischen
nativen Testbäume bleiben immer erhalten.

**Historischer Produktbefund (RC76-Korrektur oben):** Ein Hard-Crash während des `extracted`-Abschnitts kann
ein unveröffentlichtes `Output/.ds_*.tmp_*` zurücklassen: nur der Orchestrator-
`catch` entfernt es; Resume und Retention tun dies nicht. Architektur und Security
haben den Quellpfad bestätigt, keine native Reproduktion. Das Verzeichnis kann
noch leer sein; keine Rohdatenoffenlegung aus diesem Befund ableiten. Der Harness
behält die vollständige Output-Inventur und muss dann `SEA_BATCH_RESULT_INVALID`
melden. Herkunfts-/identitätsgebundene Recovery wurde anschließend in RC76 ergänzt.

## Lokaler RC74-Nachweis 31.08.2026

BL-010.1/BL-010.8: Architektur-, Security- und Testfachagenten begleiteten den
Opt-in-Harness `scripts/verify-sea-batch.mjs`. Er erzeugt nur feste synthetische
TXT/CSV/DOCX und verwendet für positiven Stapel und IPC-Trennung den echten
Produktworker. Der Security-Gegenreviewfund zu nur teilweise entfernten Namen
ist im Fixture-Orakel korrigiert und mit Formatierungsvarianten abgesichert.

- `test-sea-batch-probe-contract.js`: **41 PASS**; SEA-/IPC-/Frame-/Scopegrenzen,
  zwei Dateiwurzeln, Startabbruch, Worker-Exit/Disconnect in beiden Reihenfolgen,
  einmalige Killanforderung und Cleanup-Timeout mit virtueller Uhr. Gültiger
  `worker-resume`-Scope stoppt vor Produktimport mit `SEA_BATCH_RESUME_PENDING`.
- `test-sea-batch-result-contract.js`: **11 PASS**; einzelne Namensbestandteile,
  Zeilenumbrüche, Markdown, unsichtbare Zeichen, Unicode und fehlende Qualifikation.
- `test-sea-batch-verifier.mjs`: **acht PASS**; zwingendes Opt-in, geschlossene
  Argumente/Ergebnisfelder, ausschließlich serielle Fälle und keine positiven
  nativen Jobs in CI. Fehlendes Opt-in/Resume ergeben auch im realen normalen
  Node-CLI-Prozess feste Ablehnungen vor Artefaktzugriff.
- `test-sea-background-bootstrap.js`: **27 PASS**, davon fünf neue Gruppen zum
  privaten Probe-Einstieg, Parserbindung, IPC und inhaltsfreien Fehlerbericht.
  Alle vier Testsuiten sind in `test:sea-gates` integriert.
- Synthetische DOCX zusätzlich vollständig im vorhandenen In-Memory-Parser
  gelesen: **PASS**, keine Warnungen; Qualifikation und Kontakt-Testwerte vor
  Anonymisierung vorhanden. Kein Keyring oder Worker beteiligt.
- Vollständiges lokales `npm run test:ci` einschließlich Pre-/Posttests:
  **PASS, Exit 0**. Erster Lauf stoppte am bestehenden Tracking-Gate für eine
  neue Quelldatei; die sechs neuen Dateien wurden anschließend mit Intent-to-add
  registriert. Keine Prüfung abgeschwächt, kein Commit/Push durchgeführt.
  Neue Archive werden über `npm run build` erzeugt; verbindliche Größen und
  SHA-256-Nachweise stehen in `dist/SHA256SUMS` und den Buildreports.

Dies sind Vertrags-/Negativ-/VM-Nachweise, **kein nativer positiver Stapellauf**.
Für letzteren muss zuerst sichere Testtrennung im vorhandenen Konto entwickelt werden (DS-063).
Die frühere System-VM-Option ist seit DS-062 ausgeschlossen; `VM` in den reinen
JavaScript-Vertragstests bezeichnet lediglich `node:vm`, keine Betriebssystem-VM.
Temporäre `EU_PRIVACY_ROOT`-/`LOCALAPPDATA`-Ordner isolieren nicht den Keyring;
die Operator-Erklärung ist ausdrücklich keine technische OS-Attestierung.
Die neuen Tests benutzen keinen Produktcredential und starten keine Dialoge.
Die bestehende Gesamtprüfung enthält weiterhin ihren automatisch geschlossenen
Windows-Formulartest; keine GitHub Actions gestartet.
Worker-Resume, Parent-Crash, gesamte Nebenrollen-/Bootstrapbindung, POSIX und
finale V2-Evidenz bleiben offen. Anleitung und Grenzen stehen im
[Rollenvertrag](canonical/contracts/SEA_PARSER_ROLE_V1.md).

## Lokaler RC73-Nachweis 31.08.2026

BL-010.8/BL-041.9/BL-012.6: Architektur-/Lifecycle-Gegenreview und zwei unabhängige
Implementierungs-/Testaufträge. Vier konkrete Befunde geschlossen: unbehandeltes
Spawn-`error`, veralteter Review-Rückruf, unvollständige IPC-Fehlerbereinigung und
blockierende Restzustands-/Fehleranzeigen. Zusätzlich im Gegenreview entdeckt:
voreiliges/doppeltes Exit-Logging. Exit wird jetzt nur einmal nach tatsächlichem
Prozessende gemeldet, asynchroner Dialogstart heißt `completion_notice_dispatched`.

- `npm run test:executor-lifecycle`: **22 Startup-, 17 Completion-, sechs
  Diagnosegruppen PASS**. In Pretests von `test`, `test:ci` und `test:fast-path`
  verankert. Pending/Lease bleiben bei signalisiertem, aber noch nicht beendetem
  Prozess erhalten; späte Rückrufe beeinflussen keinen Nachfolgestart.
- Reale isolierte Node-ENOENT-Probe für Batch/Intake/Review: fehlendes Programm
  liefert `error`/`close`, keinen `exit`; Elternprozess bleibt kontrolliert.
  Kein Produkt-Keyring oder echtes Journal beteiligt. Zusätzlich bestehende
  elf Picker- und drei Review-Executor-Gruppen PASS.
- Dialogbefehle und Umgebung für Windows/macOS/Linux vertraglich geprüft;
  Windows-Formular lokal automatisch geöffnet/geschlossen. Kein beobachteter
  Cowork-, Fokus-, Screenreader- oder realer macOS-/Linux-UX-Nachweis.
- Abschließendes `npm run test:ci`: **PASS, Exit 0**. `npm run build`: ZIP mit
  427 Einträgen/26.292.416 Bytes/SHA-256
  `6cfcb2f6c48fb4d41c8922ec50a83c66c9d177c813f6b4fcdf4391e44d5eceac`;
  MCPB mit 602 Einträgen/26.763.790 Bytes/SHA-256
  `b699be0864faef0030372e965733e0bd62c153f1456b1994893390bfe228a4c1`.
  Quellparität, Modus-/Manifest-, native Artefakt-, SBOM- und Status-App-Gates
  PASS. Keine GitHub Actions gestartet.

Der [Rollenvertrag](canonical/contracts/SEA_PARSER_ROLE_V1.md) enthält jetzt den
fachlich gegengeprüften positiven SEA-Stapel-/Crash-/Resume-Testplan. Ein Temp-
Ordner isoliert **nicht** den OS-Keyring. Der zunächst vorgesehene separate
Kontoansatz ist seit DS-063 verworfen; sichere Testtrennung im vorhandenen Konto
ist noch zu entwickeln. Keine zusätzliche System-VM und keine
Produktionscredentials für Testzwecke ändern (DS-062/DS-063).
Harness-/Integrationsarbeit bleibt offen, ebenso echte E1/E2-Abnahme. Keine neue
SEA-Freigabe, keine behauptete Anonymisierungs-Beschleunigung in Millisekunden.

## Lokaler RC72-Nachweis 31.08.2026

BL-010.1/BL-010.8: drei Fachagenten für Architektur, festen Rollenstarter und
reale IPC-Probe. Keine neuen Normaltools, Anwenderabfragen, Abhängigkeiten oder
zusätzlichen Node-Binärkopien für Batch/Review/Companion. Öffentliche Starts
bleiben `node`, SEA ist nicht freigegeben.

- 42 Launcher-, 22 Bootstrap-, neun Companion-Start- und sechs Probe-Lifecycle-
  Gruppen PASS. Zusammen mit den RC71-Gruppen: **228 SEA-Vertragsgruppen**.
  Simulierte Plattformen sind kein realer macOS-/Linux-Nachweis.
- Elf bestehende Companion-Supervisortests, drei Review-Executor-, elf direkte
  Picker-, zwei echte Intake-Worker- und vier Netzwerkgrenzgruppen PASS.
- Zwei P2-Gegenreviewbefunde geschlossen und erneut geprüft: nach Exit keine
  erneut verwendbare PID beenden; Abbruch/Timeout bereinigt Sitzung und Geheimnis
  auch ohne erfolgreiches Prozessende. FD3-Lesen auf 33 Bytes begrenzt, nur
  exakt 32 akzeptiert; technische Ready-Deadline zehn Sekunden.
- Erster echter Hintergrundlauf FAIL bei sofortigem IPC-Disconnect: Der Worker
  war bereits mit Code 2 beendet, aber Node/Windows lieferte kein `close`.
  Auch mit gewöhnlichem Node reproduziert. Probe korrigiert auf OS-Exit **plus**
  IPC-Disconnect; Companion-Pipes warten weiter auf `close`. Sechs dauerhafte
  VM-Negativ-/Reihenfolgentests sichern ab, dass ein Ereignis allein nicht reicht.
- Frischer Engineering-Parser `dist/sea-parser-engineering-rc72-b/datasecure-parser.exe`:
  87.249.408 Bytes, SHA-256
  `102158f1c2a3576f1ecdeb4b91d15907f5ff77f637a4a3b7f5f431f9c6fc8037`.
  Binäridentisch zu RC71, Provenance gegen aktuelle Quellen/Toolchain neu geprüft.
  `verify-sea-parser.mjs --directory dist/sea-parser-engineering-rc72-b`:
  **19/19 reale Windows-Gruppen PASS** (Format/Rechte/Netzwerk, nativer Supervisor).
- Engineering-Parent `dist/sea-parent-engineering-rc72-d/datasecure-mcp.exe`:
  87.131.136 Bytes, SHA-256
  `6d4f1408ab099d47ee75aa69a80f64da069d46eb14d5d5a7691618cb5f05a202`.
  `verify-sea-parent-parser.mjs`: **14 echte Gruppen PASS** inklusive neun internen
  Nebenrollenfällen: fehlerhafte Starts, frühes Disconnect, fehlendes Journal,
  ungültige Intake-Queue, echte HMAC-Anfrage/Antwort und falsches Startgeheimnis.
  Parserkonvertierungen TXT/MD/Markdown/CSV/DOCX, MCP-Start und Manipulations-
  Gegenproben bleiben enthalten. Live-Symlinkprobe mangels Hostrecht übersprungen.
- Erster Gesamtlauf stoppte am alten Quelltexttest, der das Preload noch direkt
  im Supervisor/Executor suchte. Er prüft jetzt den gemeinsamen Launcher und alle
  drei Aufrufstellen sowie den SEA-Guard vor Rollenimport; nicht entfernt oder
  durch eine pauschale Erfolgserwartung ersetzt.
- Abschließendes `npm run test:ci` mit Pre-/Posttests: **PASS, Exit 0**, lokal auf
  Windows/Node 24.18.0. Darunter 228 SEA-, 101 Format-, 40 Gateway-, 37 MCP-,
  17 Parserisolations- und 30 DOCX-Strukturgruppen sowie das unabhängige
  96/24/16-Dokument-Orakel. Keine GitHub Actions gestartet.
- Paketabschluss über `npm run build`: normale Node-ZIP-/MCPB-Pakete, Quellparität,
  Modus-/Manifest-, native Artefakt- und Status-App-Gates. Artefaktnamen und
  verbindliche Prüfsummen stehen in `dist/SHA256SUMS`; Engineering-SEA-Binärdateien
  werden nicht in die normalen Pakete aufgenommen.

Nur synthetische private Testbäume verwendet; keine Originaldateien verändert.
Die Probe erzeugt keine positive V2-Evidenz. `background_full_job_verified` und
`privacy_release_verified` bleiben **false**: positiver kompletter SEA-Stapel,
Resume/Parent-Abbruch nach Start, ganze Nebenrollen-Quellbindung, finale Assembly
und POSIX-/Cowork-Evidenz bleiben im kanonischen Backlog offen. Der Windows-
Prozessbaum-Kill hat ein separates Budget; keine harte Acht-Sekunden-Gesamtlatenz.

## Lokaler RC71-Nachweis 31.08.2026

BL-010.1/BL-010.8: Drei Software-/Architektur-Fachagenten für Rollenresolver,
Dispatch-Gegenreview und echten Parent-Abnahmetest. Keine neue Anwenderabfrage,
kein Runtime-Release. Architektur-Gegenreview fand einen Getter-TOCTOU bei
Ausführungsoptionen; SEA liest sie jetzt nach der Validierung nicht erneut.
Abschließendes begrenztes Getter-Gegenreview ohne verbleibenden Fund.

- Rollenresolver 25/25: feste Zielheader/-pfade, unveränderbare vollständige
  Metadaten, begrenzte Reads, Cache-Invalidierung aller gebundenen Quellen,
  Links/Hardlinks, Identitätswechsel. Vier Ziele simuliert, kein Vier-Host-Nachweis.
- Nativer SEA-Dispatch 8/8: exakte Supervisor-/Parserargumente auf vier simulierten
  Zielen, fehlende Rolle, verbotene Overrides, fehlender POSIX-Supervisor und
  wechselnde Getter. Bestehende Parserisolation 17/17 unverändert grün.
- Frische Offline-Engineering-Builds, ausschließlich synthetische Eingaben:
  `dist/sea-parser-engineering-rc71-a/datasecure-parser.exe` (87.249.408 Bytes,
  SHA-256 `102158f1c2a3576f1ecdeb4b91d15907f5ff77f637a4a3b7f5f431f9c6fc8037`),
  `dist/sea-parent-engineering-rc71-a/datasecure-mcp.exe` (87.128.064 Bytes,
  SHA-256 `99dd7047550b1acb6e196a749337c98f9fee71a9d962acaa08486573c2794073`).
  Der Parser ist binäridentisch zu RC70; aktuelle Provenance neu geprüft.
- `verify-sea-parser.mjs --directory dist/sea-parser-engineering-rc71-a`:
  **19/19 echte Windows-Prüfgruppen PASS**, nach dem abschließenden Runtimefix
  erneut ausgeführt. Unabhängige Bundle-Rekonstruktion plus Format-/Rechte- und
  Netzwerkproben; ersetzt nicht die Parent-/Privacy-Integration.
- `verify-sea-parent-parser.mjs --parent dist/sea-parent-engineering-rc71-a/datasecure-mcp.exe --parser-directory dist/sea-parser-engineering-rc71-a`:
  **8 echte Windows-Prüfgruppen PASS**, nach dem Getterfix erneut ausgeführt.
  Je Parent zwei Runden TXT/MD/Markdown/CSV/DOCX, vor und nach Negativproben;
  normaler MCP-Start mit acht Tools. Fremdes CWD/Unicodepfad, leerer `PATH` und
  ungültiges `NODE_OPTIONS`; kein `execPath`-/Spawn-Seam im Konvertierungspfad.
  Zusatzargument, geänderte/fehlende Parserbinärdatei, geänderte gebundene Quelle
  und Hardlink werden geschlossen abgewiesen. **Symlink-Liveprobe übersprungen**,
  auf diesem Host nicht verfügbar; kein bestandener Live-Symlinknachweis behauptet.
- Abschließendes `npm run test:ci` inklusive Pre-/Posttests auf Windows und
  Node 24.18.0 **PASS (Exit 0)**: unter anderem 149 SEA-, 101 Format-, 40 Gateway-,
  37 MCP-, 17 Parserisolations- und 30 DOCX-Strukturgruppen. Zusätzlich 96 normale,
  24 verschachtelte Tabellen- und 16 Textfelddokumente im unabhängigen DOCX-Orakel.
- Normale RC71-ZIP-/MCPB-Artefakte werden anschließend über `npm run build`
  einschließlich Quellparität, Dateimodi, nativer Artefakte und Status-App-Vertrag
  geprüft. Verbindliche Paketprüfsummen stehen in `dist/SHA256SUMS`.

Die Parentprobe prüft Konvertierung, nicht eine freigegebene anonymisierte
Cowork-Ausgabe. `release_enabled` und `privacy_release_verified` bleiben `false`;
keine positive V2-MCP-Evidenz geschrieben. Parser-Closurebindung ist keine
Attestierung der gesamten Parentimplementierung. Kein belegter Performancegewinn;
Cache spart nur das Wiederhashen unveränderter Dateien. Weitere Nebenrollen,
finale Rollenassembly und reale POSIX-Strecke bleiben eigenständige E0-Arbeit.
Öffentliche ZIP/MCPB weiterhin `node`, keine experimentellen SEA-Binärdateien.
Keine Originaldaten verarbeitet/verändert, keine GitHub Actions gestartet.

## Lokaler RC70-Nachweis 31.08.2026

BL-010.1/BL-010.8: Architektur-/Security-Review und begrenztes Gegenreview.
Produktiv korrigiert: Parsergrenze **vor** Modulimport/Eingabelesen sowie
Netzwerk-Guard für `dns.promises.Resolver`. Keine Änderung am Anwenderablauf oder
der öffentlichen Node-Konfiguration. Separater SEA-Parser bleibt Engineering.

- Workergrenze 8/8 und Netzwerkgrenze 4/4 jeweils real unter Node 22.23.2 sowie
  24.18.0 PASS. Die DNS-Promise-Regression wurde vor dem Fix ohne DNS-Anfrage
  reproduziert (`wrong-error`), danach verlangt sie `DATASECURE_NETWORK_DENIED`.
- SEA-Rollenvertrag 5/5, vollständige Provenance 13/13 PASS: realer Bundle-
  Neuaufbau, vollständiges Inventar, deterministische Wiederholung, fehlende/
  doppelte/geänderte Quellen, Konfiguration und Toolchain-/Lock-Bindung.
  Zusammen mit den bisherigen 90 und den acht Workergruppen: 116 SEA-Gruppen.
- Frischer korrigierter Windows-x64-Parser aus dem lokal vorhandenen offiziellen
  Node-Archiv: 87.249.408 Bytes, SHA-256
  `102158f1c2a3576f1ecdeb4b91d15907f5ff77f637a4a3b7f5f431f9c6fc8037`.
  Artefakt getrennt unter `dist/sea-parser-engineering-rc70-c/`, nicht im Plugin.
  Vorherige Engineering-Artefakte bleiben unverändert.
- `verify-sea-parser.mjs --directory dist/sea-parser-engineering-rc70-c`:
  **19/19 echte Prüfgruppen PASS**. TXT/MD/Markdown/CSV/DOCX gegen direkten
  Parservergleich, sieben Rechteproben, 15 Netzwerk-API-Proben innerhalb der
  Grenzgruppe; fremdes CWD, Leerzeichen/Umlaut im Programmpfad, leerer `PATH`,
  ignoriertes `NODE_OPTIONS`, abgewiesene Skripte/Flags/Descriptoren und kaputte
  DOCX. Native Supervisor-Usagefehler 120 bei fehlenden Argumenten getrennt vom
  Parser-JSON-Fehler 2 geprüft; kein Timeout als Erfolg gewertet.
- Gegenreview-Funde DNS-Promise-Resolver und unvollständiges Evidence-Inventar
  geschlossen; abschließendes begrenztes Gegenreview ohne neue Findings.
- Gesamtlauf zuerst an noch nicht synchronisiertem RC70-Produktheader, danach
  am noch nicht Git-vorgemerkten neuen Parser-Testhelfer gestoppt. Beides ohne
  Abschwächen der Gates korrigiert.
- Abschließendes `npm run test:ci` einschließlich Pre-/Posttests PASS (Exit 0,
  Windows/Node 24.18.0): unter anderem 116 SEA-, 101 Format-, 40 Gateway-, 37
  MCP-, 17 Parserisolations- und 30 DOCX-Strukturgruppen plus Differentialtests.
- Normale RC70-Artefakte werden über `npm run build` mit unverändertem
  Produktstart gebaut. ZIP-/MCPB-Quellparität, Modus-, Supply-Chain- und
  Status-App-Prüfungen bleiben verpflichtend; Prüfsummen in `dist/SHA256SUMS`.
  Der experimentelle Parser ist ausdrücklich **nicht** Teil dieser Archive.

Dieser Nachweis belegt **keine** MCP-Parent-/Nebenrollen-/POSIX-Integration,
Cowork-Abnahme, Anonymisierungsfreigabe oder Geschwindigkeitsverbesserung.
Keine positive V2-MCP-Evidenz erzeugt. Der bisherige MCP-Launcher bleibt am
Worker-Dispatch blockiert. Details und nächste E0-Pakete im
[Rollenvertrag](canonical/contracts/SEA_PARSER_ROLE_V1.md) und kanonischen Backlog.
Keine Originaldateien verarbeitet oder verändert; keine GitHub Actions gestartet.

Informeller lokaler Start-/Parservergleich (Windows x64, Node 22.23.2, nativer
Supervisor, je zwei Aufwärm- und sieben Messstarts, Median einschließlich
Prozessstart und JSON-Rückgabe):

| Synthetische Eingabe | Separate SEA-Rolle | Standard-Node mit Parserrechten |
|---|---:|---:|
| TXT, 31 Bytes | 106,01 ms | 111,12 ms |
| DOCX, 5.000 Absätze, 320.995 Bytes | 133,82 ms | 139,82 ms |

Messung während weiterer lokaler Regressionen, ohne Statistik-/SLA-Anspruch.
Keine PII-Erkennung, Dateidialog-, Keyring- oder Cowork-Latenz gemessen. Diese
kleine Stichprobe begründet keinen Architekturwechsel; der zusätzliche
Node-Binäranteil pro Rolle bleibt ein zu prüfender Distributionsnachteil.

## Lokaler RC69-Nachweis 31.08.2026

### Zusätzlicher SEA-Engineering-Schnitt (kein Runtime-Release)

Zwei Software-/Architektur-Fachagenten: sichere Paketierung, Source-Evidenz und
isolierte Workergrenze. Produktversion und öffentliche Node-Konfiguration bleiben
RC69; keine zusätzlichen Nutzerabfragen und keine GitHub Actions.

- `test:sea-gates`: 12 Source-Evidence-, 66 dynamische Assembly-, sechs
  Launcher-Vertrags- und sechs Worker-NO-GO-Prüfgruppen. Ausschließlich
  synthetische positive Assemblyfixtures, keine erfundenen Zielsystemnachweise.
- Frischer Windows-x64-Launcher aus vorhandener gepinnter Offline-Nodequelle:
  87.126.016 Bytes, SHA-256
  `4642932f05b339ca0aef33d9a0d62d1eaa0ed4560e925194f1b39403d9d9b24a`.
  Leerer `PATH` und ignoriertes `NODE_OPTIONS`: Normalmodus mit acht Tools und
  explizite Supportdiagnose PASS. Danach echter synthetischer TXT-/DOCX-Kernlauf
  **FAIL: `SEA_PARSER_CORE_FAILED:txt,docx`**. Keine positive MCP-Evidenz geschrieben.
- Ein älterer lokaler Launcher scheiterte bereits am veralteten Einstiegspfad
  (`SEA_MCP_PROCESS_FAILED:1:ENOENT`). Alte Binärdatei unverändert behalten;
  der neue Probe-Build liegt separat unter `dist/sea-rc69-boundary/`.
- Grüne NO-GO-Tests bedeuten nur: die Freigabesicherung erkennt den fehlenden
  Worker-Dispatch. Permission-/Netzwerk-Negativmatrix, echte vier Zielsysteme,
  Cowork-Fresh-Install und Lifecycle sind weiterhin offen. Details:
  [SEA-Paketvertrag](canonical/contracts/SEA_ASSEMBLY_EVIDENCE_V2.md).
- `npm run test:ci` einschließlich Pretests und Parser-Posttests erneut PASS
  (Windows/Node 24.18.0, Exit 0). 101 Formatfälle, Gateway 40, MCP 37 und
  Originalschutz unverändert grün; keine echte installierte Cowork-Abnahme.
- Unabhängiges Gegenreview fand nach dem ersten Assembly-Schnitt einen
  späteren Stage-/ZIP-Payloadtausch bei weiterhin korrekten Dateimodi. Der finale
  ZIP-Inhalt muss deshalb zusätzlich gegen das aus geprüften Schreibbytes
  abgeleitete Sollinventar bestehen; gezielte Spätänderungs-Regressionen ergänzen
  die erste Assembly-Matrix.

### Graph und DOCX

BL-020.1/BL-020.2/BL-022.1: begrenzte Korrekturscheibe für DOCX-Inhaltserhalt und
Graph-/Parserbindung. Zwei Code-Experten und unabhängiges Gegenreview; keine
neuen Formate, keine Produkt-UI-/Dialogänderung, keine GitHub-Actions.

- Vor Fix: fünf neue Graph-Prüfgruppen scheiterten erwartungsgemäß. Danach
  17/17 PASS, einschließlich 1.200 deterministischer Unicode-/Containerfälle
  gegen einen unabhängigen Segmentvergleich. Das Gegenreview fand zusätzlich
  einen U+2028/U+2029-Lookahead-Bypass; korrigiert und mit acht gezielten Fällen
  abgesichert. Schema und Runtime verwenden dieselbe kanonische Grammatik.
- Parser-Isolation 17/17 PASS: tatsächliche Eingabeextension statt Worker-
  Selbstauskunft, drei injizierte Plattformverträge, Fehler-/Abbruch-/EPIPE-Pfade.
  Fake-Prozessende auf die nächste Eventloop-Phase verschoben, damit Stream-
  Flush nicht künstlich überholt wird; Produktions-Transfergate unverändert.
- DOCX-Struktur 30/30 PASS: alle sechs Stories, verschachtelte Tabellen und
  Textfelder, äußere Läufe/Nachbarzellen, Quellreihenfolge/einmalige Ausgabe,
  48 fehlerhafte Story-Kombinationen, Attribute, Unicode-/Texttokenisierung,
  Tiefen-/Knoten-/Element-/Ausgabebudgets und 5.000 Zeilen. Die anschließend
  de-identifizierten Namen/Kontakte fehlen, Zertifikat und Fachtext bleiben.
- Mammoth-Differential 4/4 Gruppen mit 136 Dokumenten PASS: 96 reguläre,
  24 verschachtelte Tabellen und 16 Textfelder. Mammoth ignoriert moderne
  `wps`-Textfelder; dort nur äußere Läufe im Vergleich, innere Texte über feste
  unabhängige Sollwerte. Kein vollständiger DOCX-Renderer behauptet.
- Separat Parser 70, Zertifikatskatalog 24, Text 8, CSV 11 und POSIX-Vertrag 2
  PASS. Abschließendes Renderer-Gegenreview ohne neuen konkreten Befund.
- Kompletter `npm run test:ci` einschließlich Pretests und neu integriertem
  `posttest:ci` / `test:parser-contract` PASS (Exit 0) auf Windows/Node 24.18.0.
  Einschließlich 101 Formatfällen, Gateway, MCP, Datenschutz, Originalschutz,
  Verschlüsselung, Resume und Angriffstests. Kein installierter Cowork-/macOS-Test.
- Erster Gesamtlauf war am Offline-Bundler durch die Agent-Sandbox blockiert;
  Wiederholung mit genehmigtem lokalem Zugriff. Der Manifesttest wurde auf den
  bewusst erweiterten Posttest-Vertrag synchronisiert, nicht abgeschwächt.
- RC69-ZIP/MCPB werden über `npm run build` einschließlich Lieferkettenprüfung,
  Quell-/Dateimodusparität, extrahierter ZIP-Akzeptanz und UI-Artefaktprüfung gebaut.
  Aktuelle finale Archiv-/SPDX-Prüfsummen: `dist/SHA256SUMS`. Alte RC68-Archive
  bleiben unverändert; keine Prüfsumme wird rekursiv ins MCPB geschrieben.

Informelle warme Parsermessung auf diesem Windows-Rechner, jeweils drei
Aufwärm- und zehn Messläufe mit ausschließlich synthetischen Dokumenten:

| Dokument | Eingabe / Markdown in Bytes | Median | Min–Max |
|---|---:|---:|---:|
| 5.000 flache Tabellenzeilen | 389.900 / 118.897 | 16,66 ms | 13,24–22,65 ms |
| 12 Verschachtelungsebenen, 1.000 innere Zeilen | 82.438 / 30.815 | 2,62 ms | 2,40–4,05 ms |

Dies misst nur den Parser, nicht De-Identifizierung, Keyring, Dateiauswahl oder
Cowork-Latenz. Kein plattformübergreifender Performance-Gate oder SLA. Die
Stories bleiben teilweise: feinere Locators, weitere Story-Coverage und reale
Word-/Zielsystem-/UX-Abnahme fehlen weiterhin.

## Lokaler RC68-Nachweis 31.08.2026

BL-042.3: passive, standardmäßig deaktivierte Start-Momentaufnahme. Architektur-/
Security- und UX-Gegenprüfung; abschließendes Code-Gegenreview ohne verbleibenden
konkreten Befund im engen Pilotschnitt. Keine installierte Cowork-/macOS-Abnahme.

- Status-Modell/View: 24 Checks; Status-Server: 11 Negativ-/Fallbackchecks PASS.
- MCP-Protokoll: 37 stdio-Tests PASS, einschließlich Default/Support/Discovery,
  ausgehandelter Ressource und bytegleich bleibender Startantwort.
- Deterministischer Offline-Build, ausführbare JavaScript-Syntax,
  Hash/Größe/Schema sowie exakte Bundle-/Lizenzinventare PASS. HTML: 506.951 Bytes,
  unter dem 768-KiB-Budget; vier tatsächlich gebündelte Abhängigkeiten. Im
  deaktivierten Normalweg kein HTML-Zugriff, im Pilot einmalige Prüfung/Caching.
- Synthetischer Browserhost mit dem echten SDK: Handshake PASS, keine ausgehenden
  Methoden außer `ui/initialize` und `ui/notifications/initialized`; keine Anzeige
  des Rohtext-Canarys. Deutsch/320 px normal: axe 20 Prüfgruppen ohne Befund;
  Englisch/320 px/vierfache Schrift nach Reflowfix: axe 21 ohne Befund, kein
  horizontales Überlaufen. Visuell geprüft. Dies ist weder vollständige WCAG-
  Abnahme noch echter Browserzoom; Tastatur-/Screenreader-/Dark-/Forced-Colors-
  und echte Hostprüfung bleiben offen. Der Browseradapter konnte die
  iframe-Tastatursteuerung nicht direkt adressieren; kein Tastatur-PASS erfunden.
- Beim ersten Smoke korrigiert: JavaScript-$-Sequenzen wurden durch String-
  Replacement verändert; Callback-Replacement plus Syntaxgate verhindert dies.
  Beim Reflowtest korrigiert: überbreites Sprachfeld bei vierfacher Schrift.
- Im ersten vollständigen Regressionslauf RV-06 gefunden: Der visuelle Timeout-
  Test verwendete produktiven Keyring statt Testkryptografie und zählte zwei
  dauerhaft erhaltene Schlüsselmetadaten als Reviewreste. Synthetische Experten-
  Reproduktion bestätigt korrekten Dokument-Cleanup. Test isoliert, Resteprüfung
  unverändert streng; zwei OCR-Aufrufe werden nun ausdrücklich verlangt.
- Offizielle lokale Claude CLI 2.1.233: Plugin und Marketplace Strukturvalidierung
  PASS; keine Modellanfrage/Installation. Skill-Korpus 14, Abschlussdialog 13 und
  Angriffssuite 20 Prüfungen zusätzlich PASS.
- Nach RV-06-Korrektur: kompletter `npm run test:ci` einschließlich Pretests auf
  RC68 PASS (Exit 0), darunter 101 Formatfälle, 40 Gateway- und 37 MCP-Tests.
- RC68-ZIP: 423 Einträge, 26.278.276 Bytes, Quell-/Modusparität und extrahierte
  Paketakzeptanz (13 + 150 Vertragsfälle) PASS. SHA-256:
  `fe99cd1b9e9b1a336ac746b94c6cf85d1ef1f85508939f687f7796022763499b`.
- RC68-MCPB: 596 Einträge, Quellparität PASS. SPDX erzeugt; zusätzliche
  `test-status-app-artifacts.mjs --archives` prüft exakte UI-Bytes in beiden
  Archiven und alle vier SDK-Komponenten im SPDX-Inventar: PASS. Vollständige
  native/OCR-SBOM-Abdeckung wird damit nicht behauptet; deren eigene Manifeste
  und Original-Lizenztexte bleiben Paketbestandteil.
- Kein Commit, Push oder GitHub-Action-Lauf durch diese Prüfung. Finale
  ZIP-/MCPB-/SPDX-Prüfsummen stehen in `dist/SHA256SUMS`, nicht rekursiv im MCPB.

Der [Pilotvertrag](canonical/STATUS_APP_PILOT_V1.md) hält Rest-E0 und E1/E2 fest.
BL-042.3 bleibt **in Arbeit**; keine Änderung der Format-/Hostfreigabe. Die
normale Anonymisierung bleibt ohne Zusatzschritt, Laden der Karte oder neue Berechtigung.

## Lokaler RC67-Nachweis 31.08.2026 (historischer Arbeitsstand)

Revalidierung von RC66 (`afdb1dc`), anschließend Korrekturscheibe RV-01 bis RV-05.
Zwei unabhängige Architektur-/UX-Reviews und zusätzliche Gegenprüfung der Änderungen.
E0-Nachweise auf Windows mit Node v24.18.0; keine installierte Cowork-/macOS-Abnahme:

- `npm run test:ci`: vollständig PASS, einschließlich Pretests für Verschlüsselung,
  Originalschutz, Journal/Recovery, Formatmatrix, 40 Gateway- und 34 MCP-Protokolltests.
  Dieser Lauf erfolgte auf dem vollständigen Codefix vor der reinen RC67-Versionssync.
- Danach RC67: `npm run test:docs`, Manifest (19), Skill-Korpus (14 für 33 spezifizierte
  Fälle), Hostmatrix (6), Cowork-Dokumentvertrag und Abschlussdialog (13) PASS.
- `node scripts/validate-claude-local.mjs --cli <lokale-Claude-CLI>`:
  Claude Code 2.1.233, Plugin- und Marketplace-Validierung PASS. Keine Modellanfrage,
  kein Installationsnachweis. Sechs lokale Validator-Vertragsszenarien prüfen auch
  fehlende CLI, Timeout, Signal und erfolglose Marketplace-Validierung.
- `npm run build`: Native-/Keyring-/OCR-Lieferkettenprüfung, ZIP-/MCPB-Quellparität
  und Skillakzeptanz im extrahierten ZIP (13 + 150 Fälle) PASS. SBOM erstellt.
- `git diff --check`: PASS. Keine neue/gestartete GitHub Action.

Artefakte dieses lokalen Arbeitsstands (nicht als committiert/publiziert ausgeben):

| Artefakt | Einträge | SHA-256 |
|---|---:|---|
| `DataSecure-Privacy-Preflight-v3.2.0-rc67.zip` | 417 | `1fb6bd5e36d31d45bb419570b731bd68fecc7c8069bbe834f7fff6a9ebb8ac47` |
| `DataSecure-Privacy-Gateway-v3.2.0-rc67.mcpb` | 589 | siehe generiertes `dist/SHA256SUMS`; dieses Handbuch ist selbst Paketbestandteil und enthält deshalb nicht den eigenen Pakethash |

Für den manuellen Test die aktualisierte
[Schritt-für-Schritt-Anleitung](acceptance/RC63_UAT_TEST_KIT/STEP-BY-STEP.md)
verwenden, nicht den alten Diagnose-Einstieg aus früheren UAT-ZIPs. Die bestehenden
111 synthetischen Eingänge bleiben gültig. Reale Ausführungsart, Fresh Install ohne
System-Node, Berechtigungen, Modellverhalten und beobachtete UX bleiben E1/E2/E3.
Der Korpus ist kein ausgeführter Modelltest; Host-/Formatfreigaben bleiben unverändert.

## Lokaler RC63-Nachweis 27.08.2026

RC63 ergänzt eine gemeinsame fail-closed Projektion für terminalen Progress,
Results, den bestehenden lokalen Abschlussdialog und den normalen tokenfreien
Cowork-Handoff. Direkte Positiv- und Negativtests prüfen gemischte Grade, beide
erlaubten visuellen Auslassungen, Paket-/Journal-Widerspruch, Legacy ohne
Nachklassifizierung, strikt begrenztes Worker-IPC, genau einen Abschlussdialog,
Results vor Capability-Ausgabe sowie Paging ohne Paket-ID, Token, Cursor,
Dateinamen oder Pfade. Die Toolzahl, der Picker und der Bestätigungsablauf bleiben
unverändert. `npm test` bestand vollständig einschließlich 67 servergebundener
Batchtests, 100 Dateien, zehn Ergebnisseiten, Crash/Resume an den Positionen 1,
50 und 100 sowie 2.000 explorativen Anonymisierungsfällen. Ein dabei sichtbar
gewordener quadratischer Abschluss-Pfad wurde entfernt: Ein paketgebundener
Nachweis verifiziert die Pakete genau einmal und bereits exportierte Aggregate
öffnen sie bei jeder Ergebnisbestätigung nicht erneut; ein Zähltest fixiert den
Vertrag. Der frisch gebaute ZIP enthält 385 Einträge und hat SHA-256
`4aca812afa50ffc2421c668eb8248bc17ab3a40c67a77df3dfbeb6950debf886`, das MCPB
enthält 550 Einträge und hat SHA-256
`840c987e49859e9ffa89c279d42a73bc86a0f5bbb1d101e8bb8f25ea6d8c5e8f`.
Paketparität, Skill-Abnahme, 150-Fälle-Vertragsmatrix und MCPB-Prüfung bestanden.
Dieser E0-Nachweis ersetzt weiterhin keine frische installierte Windows-/macOS-
Cowork-, Accessibility- oder Security-Abnahme.

## Lokaler RC62-Nachweis 26.08.2026

RC62 erweitert die dauerhafte DS-045-Bindung um `datasecure-batch-evidence/3`
und `data-secure-audit-receipt/4`. Direkte Tests prüfen alle drei Grade, beide
erlaubten Auslassungsarten, Paket-/Journal-/Receipt-Parität, unveränderte
Pending-Marker bei Crash/Retry, Legacy ohne Nachklassifizierung und den
inhaltsfreien endlichen Reason-Code-Katalog. `npm test` endete vollständig mit
Exit-Code 0. Der Lauf bestand unter anderem 67 Batch-/Crash-/Resume-, 40
Gateway-End-to-End-, 31 MCP-Protokoll-, 20 adversariale und 2.000 explorative
Fälle sowie 96 DOCX-Differentialdokumente und sieben native Windows-Grenztests.
Der echte 100-Dateien-Lauf und Crash-Recovery an Position 1, 50 und 100 waren
ebenfalls grün. Ein Security-Gegenreview wies nach, dass zuvor ein formal
gültiger frei erfundener Code wie `ALICE_MUSTERMANN` persistierbar war; RC62
verwirft solche Werte und persistiert stattdessen ausschließlich den festen Code
`INTERNAL_FAILURE`. Dieser E0-Nachweis erweitert keine Formatfreigabe und ändert
den Cowork-Werkzeug- oder Bestätigungsablauf nicht.

## Lokaler RC61-Nachweis 26.08.2026

Nach der crashsicheren Bindung der DS-045-Ergebnisgrade an Paketmanifest,
`datasecure-batch/2` und Mapping CSV/Outbox V2 endete `npm test` vollständig mit
Exit-Code 0. Der Lauf umfasste insbesondere 14 Journal-, elf Mapping-, acht
Outbox-, sechs Result-Bindungs-, 67 servergebundene Batch-/Crash-/Resume-, 40
Gateway-End-to-End-, 31 MCP-Protokoll- und 20 adversariale Fälle sowie die
2.000-Fälle-Exploration, 96 DOCX-Differentialdokumente und sieben native
Windows-Job-Object-Prüfungen. Ein dabei gefundener Post-Publish-Crashrest wurde
geschlossen: Ein nur im Speicher gesetzter Grad wird bei fehlgeschlagenem
Journalwechsel verworfen und beim Wiederanlauf ausschließlich aus dem erneut
verifizierten V3-Paketmanifest gebunden. Dieser E0-Nachweis erweitert keine
Formatfreigabe und ersetzt keine frische ZIP-/MCPB-/Cowork-Abnahme auf den
Zielplattformen.

Lokaler RC55-Schlusslauf 26.08.2026: `npm test` endete nach dem atomaren R3b-Schnitt
mit Exit-Code 0. Der Lauf bestand 15 direkte Legacy-Migrationsfälle,
20 Architekturverträge, 40 Gateway-End-to-End-, 66 Batch-/Crash-/Resume- und
31 MCP-Protokollfälle sowie 20 adversariale Fälle und den 2.000-Fälle-Sweep. Fresh
Install erzeugt keinen technischen `Input`; sichtbare Altdateien und historische
Claims bleiben erhalten. Der Fast Path und der reale TXT-/CSV-/DOCX-Benchmark sind
ebenfalls grün. Der vorherige RC54-Schlusslauf: `npm test` endete nach dem fail-closed
Schutz historischer Originale in `Processed` mit Exit-Code 0. Zusätzlich zu den
bestehenden Korpora bestanden 21 Retention-/Purge-Grenzfälle, zwölf direkte
Read-only-Snapshot-Grenztests, 19 Architekturverträge, 40 Gateway-End-to-End-
Szenarien, 66 reale Batch-/Crash-/Resume-Szenarien, 31 MCP-Protokollfälle,
20 adversariale Fälle, der 2.000-Fälle-Sweep, 96 DOCX-Differentialfälle und
sieben native Windows-Job-Object-Prüfungen. Die zuvor für RC53 ausgeführten
Copy-only-Snapshot-Prüfungen bleiben Teil der grünen Gesamtsuite. Der Fast Path
endete ebenfalls mit Exit-Code 0. Ein zuvor reproduzierbarer transienter Windows-
`EPERM` beim atomaren Batch-Journal-Rename blieb nach identitätsgebundenem,
begrenztem Retry in 50 aufeinanderfolgenden echten Intake-Worker-Läufen aus;
Journal-, Active-Lock-, Lease- und Picker-Grenztests belegen zusätzlich dauerhafte
Fehler, Replacement-Rennen und verlorenes Abschluss-IPC fail-closed. Dies ist ein
lokaler E0-Nachweis und keine installierte Windows-/macOS-/Claude-Abnahme.

Lokaler Schlusslauf 23.08.2026: `npm run test:ci` endete nach den SEA-Launcher-,
Dispatcher-, Runtime-Status- und Assemblyänderungen mit Exit-Code 0. Darin enthalten
waren unter anderem 58 Batch-/Crash-Recovery-, 37 Gateway-, 29 MCP-Protokoll- und
20 adversariale Fälle. Zusätzlich bestanden zwei byteidentische Windows-x64-
SEA-Builds und der echte eigenständige MCP-Handshake bei leerem `PATH`. Dies ist
keine macOS-/Linux- oder installierte Claude-Abnahme.

`npm test` prüft zusätzlich jedes Byte der im kanonischen Pluginbaum eingebetteten,
weiterhin gesperrten universellen OCR-V2-Runtime. Damit verwenden normaler ZIP-Build
und Marketplace dieselbe Quelle. Für die erneute Prüfung eines frisch assemblierten
externen Runtime-Verzeichnisses bleibt der Engineering-Build verfügbar:

```bash
node scripts/build-portable-plugin.mjs --runtime dist/ocr-runtime/universal
node scripts/verify-portable-plugin-zip.mjs
```

Ein normaler Push oder Pull Request startet aus Kostengründen genau **einen** auf zehn
Minuten begrenzten Ubuntu-Job mit `test:ci`. Doppelte Läufe desselben Branches werden
abgebrochen; reine Änderungen außerhalb des Produkt-, Test- und kanonischen
Vertragsbaums starten gar keinen Lauf. Die vollständige Windows-/macOS-/Linux-Matrix,
der Windows-Nativtest, Release-Builds, OCR-/PDF-Piloten und Security-Scans sind nur
über bewusstes `workflow_dispatch` verfügbar. Ein manueller grüner macOS-Lauf belegt
Parser- und Vertragsverhalten, ersetzt aber nicht die Finder-/Claude-Desktop-Abnahme
auf echter Mac-Hardware.

`test-workflow-budget.js` schützt diese Grenze: höchstens ein automatischer Workflow,
ein Ubuntu-Job, keine Matrix oder Artefakte und zehn Minuten Timeout. Der manuelle
Workflow `release-evidence.yml` erlaubt gezielt nur `platform`, `release` oder `all`;
`security.yml` ebenso nur JavaScript-, Native-, Secret- oder Gesamtevidenz. Die
teure Gesamtwahl ist für einen konkreten Releasekandidaten vorgesehen, nicht für
jeden Commit.

The product runtime has no npm dependencies. `tests/helpers.js` is a ~50 line
runner; explicitly pinned dev-only differential oracles may compare selected
parsers but are never included in the plugin or MCPB runtime.

## What runs

| File | Cases | Covers |
|---|---|---|
| `test-manifest.js` | 19 | version consistency across package.json, MCPB manifest, plugin.json, VERSION, BUILD_INFO and all skills; exact pilot format contract; tool/prompt parity between manifest and server; marketplace target; plugin entry point and native build/package contracts; and that every test the npm script names exists |
| `test-architecture-contracts.js` | 14 | canonical batch snapshot, pseudonym, keyring, batch-review, embedded-content recursion/resource/active-content, raw-content network boundary, text/CSV/DOCX, PDF/OCR risk, locked PDF.js/Tesseract engineering contracts and the POSIX supervisor's CPU/address/data/file-size/open-file/RSS/wallclock/process-group source contract; these tests pin safety invariants but do not by themselves release a format or platform |
| `test-plugin-structure.js` | – | plugin directory layout, skill frontmatter, MCP config, and mechanical coverage requiring every runtime tool to appear in agent guidance or a justified exception |
| `test-host-matrix.js` | 5 | versioned positive/negative host classes, live `privacy_status` gate, forbidden upload/Computer-Use/filesystem/connector fallbacks and normal use of already-clean Markdown |
| `test-runtime-start-matrix.js` | 4 | trennt die offizielle MCPB-Built-in-Node-Garantie vom unbelegten Plugin-ZIP-/Marketplace-Start, pinnt den tatsächlichen `node`-Befehl, verbietet Nutzerinstallationen/Online-Bootstrap/stillen Fallback/drei OS-Plugins und hält SEA bis zu Zielbinär-, Dispatch- und Lifecycle-Nachweisen geschlossen |
| `test-sea-launcher-contract.js` | 6 | pins Node 22.23.2/postject and four official archive hashes, checks the fixed one-plugin Windows/POSIX dispatch layout, deterministic SEA configuration, absence of download fallbacks, real-MCP verifier inputs and the still-disabled release switch |
| `test-sea-plugin-assembly.js` | 4 | requires all four target binaries plus hash-bound build and real-MCP evidence, confines command rewriting to an engineering staging tree, forbids network/shell bootstrap and proves that an incomplete target set produces no archive |
| `test-skill-eval-corpus.js` | 14 | versioned set of 33 synthetic model-behavior scenarios covering triggering, non-triggering, four negative host classes, queue confirmation, cancelled local selection and host processing, explicitly confirmed continuation in a new chat, resumable local execution, safe image defaults, PDF refusal, partial results, current-run package binding and cleanup; this validates the evaluation contract, not a simulated Claude run |
| `test-parsers.js` | 69 | DOCX/XLSX/PPTX text including nested DrawingML text boxes, entities, embedded/vector media, recursively embedded OOXML with shared depth/count/archive/expanded-byte budgets enforced before decompression, including a real 21-package boundary where the first over-budget package is neither rendered nor disclosed; mandatory unique internal `officeDocument` package roots and complete renderable DOCX main roots, DOCX image and package relationships, including orphan, traversal, external, duplicate, type-mismatch, active, wrong-story-root, truncated-story and missing-target refusal with content-free warnings; every allowed DOCX secondary-story type (`header`, `footer`, `comments`, `footnotes`, `endnotes`) must match its declared relationship and Word root; embedded OOXML requires exactly one internal `package` edge from a parser-reachable content part and blocks duplicate, orphan, unrelated or active edges; XLSX renders worksheets, reachable comments, drawings, charts and media only through declared internal `worksheet`/`comments`/`drawing`/`chart`/`image` relations, suppresses orphan/external/wrong-type parts, unrendered content structures and truncated worksheet roots, accepts empty self-closing parts, and blocks every formula cell even with cached values; PPTX renders slides, reachable notes, DrawingML tables, charts, media and reachable layout/master text only through internal relationships, permits normal shared layouts/masters, and suppresses orphan/external slide text, malformed table tails, note data, chart data, images, template content, truncated slides or ambiguous notes; personal/core/application/custom OOXML metadata, fail-closed complex custom metadata, strict part-path coverage and external-relationship blocking; Markdown table escaping; standalone PNG routing; legacy PDF parser adversarial coverage plus the mandatory `PDF_COVERAGE_UNVERIFIED` release gate; ZIP hardening including false sizes, aggregate limits and header consistency; CSV conversion and literal fence handling; every failure path raises `SafeError` instead of returning empty text |
| `test-docx-differential.js` | 2 | Mammoth 1.12.1 as an exactly locked BSD-2-Clause development oracle, plus 96 valid generated DOCX files with multiple ordinary main-body paragraphs and table rows whose tokens must agree with the local parser. It is neither a runtime dependency nor evidence that every Word story or external Word generator is covered. |
| `test-text-source.js` | 8 | fatal UTF-8 with optional BOM; NFC/LF normalization; forbidden invisible controls; literal CommonMark/GFM-shaped structure; inert HTML, frontmatter, links and image syntax; PII inside Markdown markup; complete content-graph positions; large deterministic source. Markdown remains outside the released allowlist until its remaining gates pass |
| `test-csv-source.js` | 10 | RFC-4180 quotes, doubled quotes and multiline fields; comma, semicolon and tab detection; ambiguous/malformed/inconsistent input refusal; stable headers; literal formula-looking fields including embedded PII; PII in horizontal table rows; shared UTF-8 and graph boundary; deterministic large tables. CSV is restricted to the local active text path; practical three-OS acceptance remains open. |
| `test-csv-differential.js` | 2 | Papa Parse 5.5.3 as an exact locked MIT test-only oracle, plus 180 unambiguous comma/semicolon/tab RFC-4180 rows across LF/CRLF, Unicode, escaped quotes and multiline cells. It verifies agreement with the local parser while intentional delimiter ambiguity remains fail-closed. |
| `test-parser-isolation.js` | 14 | mandatory Windows-launcher invocation, inherited stdin transport, renamed-PDF signature blocking before spawn, absence of a PDF implementation in the packaged worker, missing/corrupt launcher refusal without fallback, native-host architecture probing, truthful status distinction between Windows Job Object hard limits and the POSIX Node/parent-timeout fallback, fixed resource/setup codes, cooperative cancellation, confirmed deadline termination, response-size/schema enforcement and content-free worker errors |
| `test-content-graph.js` | 11 | versioned text/table/metadata/image graph, W3C-style half-open positions, structural image fragments, complete asset binding, exact sequential ids, ordered/non-overlapping/full non-whitespace text coverage, no text after assets, no duplicated raw text, traversal/extra-field refusal, mandatory isolated-boundary validation, complete nested OOXML container chains and exact OOXML-part locators for DOCX body/header/comments/core metadata, XLSX worksheet/chart/drawing text and PPTX slide/notes/chart/layout/master data |
| `test-network-boundary.js` | 4 | real preloaded refusal of DNS lookup, promises, resolver and record-resolution methods; HTTP(S), TCP/TLS, UDP, HTTP/2, fetch, WebSocket and listeners; coexistence with the parser permission process; mandatory parser/companion launch wiring. The manual platform matrix executes the same probe on Windows, macOS and Linux; a local or automatic run proves only its current OS cell |
| `test-workflow-budget.js` | 7 | exactly one automatic, single-job, timeout-bounded Ubuntu workflow; path filtering, cancellation, read-only permissions, manually selected heavy platform/release/security evidence and a locked development-only dependency boundary |
| `test-ui-process-policy.js` | 9 | explicit data classification for every native dialog; cross-platform folder opening with allowlisted environment and `shell: false`; raw document text only over stdin to Windows/macOS reviews and contextual Linux Zenity/KDialog review without argument leakage; fixed PowerShell/JXA UI scripts without network primitives. The test deliberately keeps raw-review OS sandboxes marked unverified |
| `test-pdfium-spike.mjs` | 6 | offline contract for the non-release PDFium lock: immutable distributor/upstream provenance and hashes, V8/XFA-off build, license inventory, strict separation from the product worker and unchanged `PDF_COVERAGE_UNVERIFIED` runtime gate; the networked/native engineering probe remains an explicit `npm run pdfium:spike` command |
| `test-portable-ocr-adapter.js` | 7 | exact OS/architecture selection, explicit release gate, complete hash inventory and extra-file rejection, bounded OCR-V1 execution, fixed content-free errors and canonical error vocabulary; the shipped runtime remains closed while its release flag is disabled |
| `test-ocr-universal-assembler.mjs` | 8 | four exact target bundles, byte-identical shared runtime closure, single model/runtime copy, four launcher entries, non-release v2 contract, adapter compatibility and rejection of a validly rehashed but divergent platform core |
| `test-ocr-universal-bundle.mjs` | 1 | complete byte, size, target, model and component inventory of the vendored universal OCR runtime while its release gate remains disabled |
| `test-zip-permissions.mjs` | 2 | deterministic ZIP central-directory Unix metadata preserves executable launcher mode while ordinary files remain non-executable |
| `test-native-launcher.js` | 7 | real Windows Job Object transport, `ACTIVE_PROCESS=1` for Node and the PowerShell visual host, process/job memory, CPU and wallclock enforcement, and `KILL_ON_JOB_CLOSE` worker removal |
| `test-pii-regression.js` | 79 | golden personnel profile byte for byte, exact preservation of business periods, occurrence-scoped credential issuers in sections, prose and OCR spans, explicit-versus-ambiguous credential context, domain-shaped issuers versus verification URLs, IT/testing/product/business-analysis/health-IT vocabulary, lower-case legal brands including terminal punctuation, internal connectors, bounded party clauses, ordinal metadata guards and common contractual abbreviations, occurrence-scoped organisation/person overlap and connector false-positive guards, project-prose disambiguation, German and Unicode person names, common and French grouped telephone formats, grouped German tax IDs, phrase-introduced telephone numbers, explicit French/Spanish/Dutch personnel labels, one-pass gateway convergence, plus one case per defect listed below |
| `test-contract-skill-acceptance.js` | 13 | both shipped German skill contracts plus ten invented service contracts with twenty public company-name tokens; identifiers must disappear while service, amount, term, termination and certification content survive; `test:plugin-zip` repeats the same acceptance against the extracted release ZIP |
| `test-contract-skill-matrix.js` | 150 | deterministic combinations of 30 public company-name tokens, 30 invented people, ten invented addresses and six contract layouts; parties, people, contact, bank and reference data must disappear while business and certification content survives; the built-ZIP check repeats the matrix against the shipped runtime |
| `test-contract-corpus.js` | 2 | deterministic positional ground truth for 1.000 German/English contract cases (750/250) plus a separate 1.000-case acceptance corpus across contract, personnel, applicant and customer profiles |
| `test-detector-benchmark.js` | 3 | neutral ground-truth evaluation for the 1.000 German/English contracts and the 1.000-case active-profile corpus: aggregate and per-type precision/recall/F1, severity-weighted misses and explicit content-preservation controls; a negative control proves that extra redaction is penalized |
| `test-format-acceptance-matrix.js` | 101 | real gateway path for each active format (TXT, Markdown, CSV, DOCX) across German/English/French/Spanish/Dutch personnel profiles as well as contract, applicant and customer documents; 17 deterministic variants use different names, e-mails and phone numbers. The matrix checks auto-profile selection, direct-identifier removal, cell-scoped CSV credential context and preservation of IT roles/certifications. |
| `test-credential-catalog.js` | 11 | deterministic offline catalog schema, issuer aliases and credential-code context separation, optional verified references, no runtime lookup and unknown-certification preservation |
| `test-image-sanitizer.js` | 20 | PNG/BMP round trips, bounded PNG decompression and chunk lengths, metadata stripping, refusal of unsupported variants, OCR offset mapping, pixel-level redaction with padding and clamping |
| `test-windows-visual.js` | 10 | mandatory verified Job Object launcher without PowerShell fallback, secret-free environment, native status/resource mapping, console limits, race-safe confirmed process-tree termination, fixed errors and bounded OCR schema |
| `test-visual.js` | 21 | every branch of the visual gate with injected OCR and rasteriser bridges, including the document-wide deadline |
| `test-retention.js` | 21 | expiry by injected time/mtime, duplicate and invalid evidence, immediate reconciliation, scope isolation, stable status diagnostics, staging and audit preservation, non-fatal deletion/inspection failures, fail-closed Output cleanup after incomplete batch-journal inspection, permanent protection of historical `Processed` sources, hidden/directory/link entries and outside targets, unreadable protection state, total-purge preflight and explicit disposable-scope precedence |
| `test-batch-retention-protection.js` | 6 | short-write retry and zero-progress refusal, POSIX parent-directory fsync, complete delivery/mapping package protection, malformed/unreadable journal fail-closed behavior and unreadable journal-root handling |
| `test-audit-privacy.js` | 7 | strict metadata receipts, legacy-to-v3 canonical migration, separate privacy-ruleset provenance, persistent write blocking, marker and markerless crash-window reconciliation, leakage and readiness blocking |
| `test-diagnostics.js` | 8 | strict diagnostic metadata whitelist, canonical status output, 14-day/200-event retention, forged-row hardening, non-blocking write failures, coarse error classification and explicit content-free local diagnostic export, including refusal of a redirected export directory before writing and capacity-safe replacement |
| `test-companion-job-store.js` | 8 | versioned append-only job contract, monotone transitions, local human evidence, limited verification claims, release hash binding, terminal states, strict raw-data-field refusal, tamper and traversal refusal |
| `test-companion-retention.js` | 6 | expiry and zero-day cleanup, strict direct-entry deletion, unsafe-entry preservation, metadata-only status, and local human evidence for immediate purge |
| `test-companion-ipc.js` | 18 | platform multi-picker commands, strict source validation, local fallback, HMAC/session/replay enforcement, path-free responses and journals, explicit local-selection cancellation on Windows/macOS/Linux, real fd-3 bootstrap process start, and Linux Zenity/KDialog fallback behavior |
| `test-companion-processor.js` | 39 | TXT/Markdown/CSV/DOCX release, clear batch files without duplicate per-file confirmation, renamed-PDF blocking in the private picker path, terminal local cancellation and skip, validated macOS button/default/cancel contracts, mandatory keep/redact decisions for ambiguous credential issuers, locator-scoped manual redactions with exact preview, post-edit residual blocking, value-free and Unicode-stable highlight hints, stdin-only Windows/macOS and Linux Zenity/KDialog review transport, real Windows-Forms initialization and automated button-path acceptance, visual/unsupported-part DOCX blocking, abandoned private-copy cleanup, rollback, queue isolation, and path-free result/audit evidence |
| `test-batch-review-model.js` | 6 | one anonymous shared review call; per-document re-mapping; mandatory decision completeness; no name/path leakage; strictly exact normalized-context grouping that only expands after an explicit local group action; deferred review remains bounded |
| `test-companion-supervisor.js` | 11 | child-environment secret filtering, Windows process-tree termination, real authenticated launch, sequence recovery, multi-picker orchestration, one terminal no-selection result without a retry dialog, non-authoritative completion UI failure, guaranteed close, and pre-launch profile/platform refusal |
| `test-completion-summary.js` | 8 | all-success, partial and all-stopped wording; strict count validation; content-free Windows invocation; fail-closed acknowledgement; real auto-closing Windows Forms initialization; and macOS/Linux notification fallbacks |
| `test-local-review-executor.js` | 3 | detached token-free worker start, content-free public response fields and the explicit five-minute synchronous versus thirty-minute detached local-UI timeout contract |
| `test-gateway-e2e.js` | 40 | TXT/Markdown (`.md`/`.markdown`)/CSV/DOCX routes end to end, including inert CSV contact-URI formulas with verified PII removal, refusal jedes erkannten, aber noch nicht freigegebenen Formats vor Claim/Output/Reviewkopie, parser-warning fail-closed behavior, all-pixels-local policy, mandatory PDF and renamed-PDF null-output/byte-identical restoration, cooperative cancellation, startup claim recovery, zero-day retention, audit migration blocking, tamper detection, path traversal, copy-only source preservation and failure-injected cleanup/publication rollback |
| `test-package-read-capabilities.js` | 9 | random in-memory package-bound capabilities, expiry/restart revocation, package-ID-only refusal, strict canonical document-/asset-name, checksum and public-metadata binding against manipulated manifests, descriptor-bound content reads without a second pathname lookup, absence of historical enumeration and lückenlose 7.000-Zeichen-Seiten mit fester 1.000-/30.000-Zeichen-Grenze |
| `test-corpus-contract.js` | 4 | versioniertes Ground-Truth-Schema, 2.000-Sample-Validierung, exakte Format-/Sprach-/Dokumenttyp-/Profilverteilung und direkte Prüfung der Null-Miss-/Null-Zusatzredaktions-/99-%-Erhaltungsgates |
| `test-batch-secret-store.js` | 6 | isolated OS-secret-store pilot: opaque batch accounts, fixed service namespace, 256-bit Set/Get/Delete round trip, unavailable/malformed/native-error refusal, and no filesystem, environment, CLI or self-encryption fallback path; no productive pseudonym release claim |
| `test-batch-pseudonym-registry.js` | 6 | in-memory `HMAC-SHA-256`/Base32 derivation for a shared batch context: Unicode canonicalization, same entity across documents, unlinkability across secrets, deterministic collision extension, disposal, no persistence claim and the internal hand-off through the normal residual-PII gate; not wired into the released batch path |
| `test-batch-pseudonym-context.js` | 7 | deaktivierter Store/Registry-Lifecycle: opake Vertragsreferenz, Zeroing, gleicher Alias über neue Registry-Instanzen, Verluststopp ohne Ersatzschlüssel, partieller Provisionierungs-Rollback, terminales Löschen, Erhalt fester Verarbeitungsfehler und kein Datei-/Environment-/CLI-/Eigenverschlüsselungsfallback |
| `test-keyring-pilot.js` | 3 | verifies the separate `@napi-rs/keyring` lock, all required native target artifacts and the content-free Set/Get/Delete runner; the actual native smoke test runs only with `RUN_KEYRING_PILOT=1` or in the dedicated three-platform workflow |
| `test-batch-session.js` | 66 | abgekoppelter lokaler Worker, paginierte namenfreie Ergebnisse, echter MCP-Prozesswechsel, gemischter Vier-Profil-`auto`-Stapel, 100-Datei-/500-MB-Grenzen vor Hashbildung, reale Worker-Crashes an globalen Positionen 1/50/100 mit ausdrücklichem Resume ohne Doppelpaket, Inode-/Snapshot-/Cleanup-Austauschproben mit unveränderten externen Daten, valide freie-Speicher-Metadaten und DOCX-ZIP-Verzeichnis-Vorprüfung, versiegelte Arbeitskopien, systemweite Ein-Stapel-Sperre, Dead-Owner-Recovery, Mapping-/Nachweis-Rollback, lokale Sammelprüfung, Ablaufbereinigung und fail-closed Manipulationsschutz |
| `test-mapping.js` | 3 | lokale Zuordnungs-CSV: reguläre Werte bleiben lesbar; führende Leerzeichen oder Tabs vor Formelzeichen werden ebenso wie direkte Formelpräfixe als Literaltext neutralisiert; verlinkte Exportdateien oder Exportordner werden vor Lesen, Ersetzen oder Schreiben abgewiesen |
| `test:batch-500mb-local` | manuell | schreibt und hasht 100 synthetische TXT-/Markdown-/CSV-Dateien mit exakt 500 MiB als privaten Snapshot, prüft bounded-memory SHA-256, Originalerhalt und sichere Checkpointentfernung; absichtlich nicht Teil jeder kostenpflichtigen Cloudmatrix |
| `test-batch-user-status.js` | 6 | kurze deutsche Status- und Folgeaktionsverträge für alle Batchphasen, Leckagefreiheit sowie eine erst nach drei lokalen Messwerten zulässige Median-Restzeit ohne Schätzung bei offener manueller Entscheidung oder Wiederaufnahme |
| `test-batch-maintenance.js` | 4 | festes, begrenztes Sechs-Stunden-Intervall für die lokale Ablaufbereinigung, fehlertolerante Folgeausführung, `unref` ohne künstliches Prozesswachhalten und exakt einmaliges Stoppen beim Server-Shutdown |
| `test-mcp-protocol.js` | 31 | the server driven over real stdio: startup recovery, handshake, normal/support tool separation, batch/read-capability schemas, explicit continuation confirmation, annotations, retention/purge/governance instructions, confirmed purge, privacy-safe diagnostic status and local diagnostic export, cancellation/error codes, notification handling and stdout framing |
| `test-adversarial.js` | 20 | hostile document content, Unicode that looks like text but is not, pathological sizes and regex behaviour, mutated containers, determinism, concurrency, the MCP argument surface |
| `exploratory-review-20.js` | 20 | alternative German phone/address/name forms, Unicode e-mail and IDN, IPv6, lower-case IBAN, labelled birth dates and vehicle plates, customer URLs, duplicate ZIP entries and PNG CRC integrity |
| `test-sarif-check.mjs` | 4 | fail-closed local CodeQL report parsing without leaking finding messages into the release-gate output |

The case counts above are maintained per suite. The complete local suite treats every
listed suite plus the plugin structure check as mandatory. The automatic cost-capped
CI deliberately runs the smaller `test:ci` release-safety subset; the complete suite
runs locally before a push and in the manually requested platform matrix. The
generated 1.000-case detector corpus is the largest deterministic ground-truth block.
The separate 150-case skill matrix remains an end-to-end smoke and preservation suite.

The manual Windows platform cell additionally runs `test:windows-visual`: a synthetic scan passes through
the real Job Object, Windows OCR, pixel redaction and verification OCR; malformed EMF
input must be refused. This acceptance is intentionally separate from the assertion
count above.

## The adversarial suite

The other files check that documented behaviour holds. This one attacks from
angles the design did not explicitly plan for, and each angle has found
something:

| Angle | What it asks |
|---|---|
| Hostile content | Does a document that instructs Claude, forges a placeholder or forges a compliance header change any behaviour? |
| Unicode | Do decomposed umlauts, soft hyphens, zero-width characters or non-Latin scripts get past the name patterns? |
| Sizes and regexes | Does any pattern backtrack catastrophically? Does a 90 kB document stay in budget? |
| Malformed containers | Do 40 byte-level mutations of a DOCX ever raise something other than `SafeError`? Can a ZIP entry escape? Can an IHDR claim 3.6 gigapixels? |
| Determinism | Is the same input byte-identical twice? Do pseudonyms leak between documents? |
| Concurrency and arguments | Can two parallel runs produce two packages from one source? Can a read argument reach another file, or a negative offset misbehave? |

Findings it produced, all fixed:

- decomposed umlauts (NFC vs NFD) were not matched at all, so a surname in a
  document exported from macOS passed through untouched
- a Word soft hyphen (`U+00AD`) inside a surname hid it from every name pattern;
  Word inserts these for justified text, so this is an ordinary document
- `POSTAL_ADDRESS_RE` used `\s+`, which matches a newline: "20457 Hamburg" ate
  the blank line and the first token of the next paragraph and produced
  `[LOCATION_REDACTED]-2026-0815`. `PHONE_RE` and `DE_SV_RE` had the same
  latitude. All structured detectors are line-local now, which is asserted
  generically rather than per pattern.

## Fixtures

`npm run fixtures` generates the Office and PDF fixtures from
`tests/make-fixtures.js`. They are not committed: CI fails if any `.pdf`,
`.doc*`, `.xls*` or `.ppt*` file is tracked.

`tests/fixtures/synthetic-personnel-profile.md` is committed because it is plain
text. Every value in it is invented.

## The golden file

`tests/expected/synthetic-personnel-profile.expected.md` is generated, not
hand-written. When a change to the engine intentionally changes the output, run
`npm run test:golden` and review the diff before committing it. The command is
portable across Windows and POSIX shells. A hand-written
expectation is how the previous version ended up asserting behaviour the code
never had.

## Regression cases

Each of these corresponds to a defect found in 3.2.0-rc2:

- an upper-case German word (`SOFTWARE`, `UNTERNEHMEN`, `HOFFMANN`) was matched
  as a BIC and replaced before the person rule ran, leaking the given name
- an 11-digit order number or a German-formatted amount blocked the residual
  gate forever, because the gate reported identifier classes the redactor had no
  rule to remove
- `\b` is ASCII-only, so names and organisations with umlauts or `ß` were never
  matched
- a bare surname without an honorific was never replaced
- the same person received several pseudonyms via `Herr X` / `Frau X` / `X`
- the organisation allow list was unreachable, because it was compared against
  strings that always end in a legal form
- every title-case bigram in a personnel profile became a person, so `User
  Stories` and `Azure DevOps` were pseudonymised
- comma-shaped industry, language and role lines bypassed the person-name
  plausibility filter, while real comma and particle names still need detection
- applicant and personnel profiles treated their first 40 non-empty lines as
  implicit person context, so unlisted comma-shaped capability pairs in both
  headers and section bodies were pseudonymised; structural header boundaries
  and immediate body contact evidence now separate those cases
- applying abstract-noun morphology without context let real names such as
  `Jung, Dennis` and `Hartung, Denis` through; it now suppresses a candidate
  only when the document already has a strong person anchor, and that Boolean
  context is retained through residual verification without retaining identity
  data
- five-digit quantities followed by units such as `Euro`, `Stück` or `Punkte`
  were mistaken for postal addresses
- representative golden, contact, comma-name and contract documents did not
  explicitly assert one-pass gateway convergence
- markdown heading prefixes were eaten by the customer/project line rule
- a labelled employee number was documented as removed but matched no detector

## Platform coverage

The deliberately manual `release-evidence.yml` matrix runs the suite on
`windows-latest`, `macos-latest` and `ubuntu-latest`. Windows x64 has the most complete
engineering boundary; the TXT/Markdown/CSV/DOCX text path is also intended for macOS
and Linux. The workflow explicitly installs Node and therefore does not prove the
installation-free Plugin-ZIP runtime. Automated tests also do not replace a fresh
plugin/MCPB installation. Platform-neutral tests stub the visual bridge, which still
requires manual acceptance on each target platform.

## Native Windows acceptance status

- Passed: Windows OCR/redaction/verification against a synthetically rendered scan.
- Passed: the real Windows text-review form initializes, selects a synthetic alias,
  invokes the redaction and approval buttons, returns the exact range and preserves
  the professional text. This proves the native control path, not human usability.
- Still open: EMF/WMF rasterisation through the PowerShell bridge.
- Still open: installation, upgrade and rollback in a fresh Claude engineering
  environment.
- Still open: a small human usability acceptance and the signed local companion;
  no real-data pilot before both are approved.

## Lokaler CI-Nachweis 24.08.2026 (RC34-Arbeitsstand)

`npm run test:ci` wurde nach dem Claude-Cowork-/UX-/Performance-Review vollständig
mit Exit-Code 0 ausgeführt. Der Lauf umfasste unter anderem kanonische Dokumente,
Kostenbudget, Manifest/Capabilities, damals 9 normale und 28 Supporttools, alle vier MCP-
Risikohinweise, zentrale Ressourcenlimits, den inaktiven Zwei-Worker-Harness, 70
Parsertests, Netzwerk- und UI-Prozessgrenzen, 77 PII-Regressionen, 101 freigegebene
Formatkombinationen, Mapping/Outbox, direkten Picker/Intake, lokalen Handoff,
TXT-/CSV-/DOCX-Unterbrechung und Fortsetzung, den inaktiven OCR-Harness, echte
synthetische Performancepfade, 38 Gateway-, 31 MCP- und 20 Angriffstests.

Der erste Lauf fand dabei einen nicht normalisierten `ZipError` für ein mutiertes
OOXML-Zentralverzeichnis. Die Runtime wandelt diesen Fall jetzt vor dem Worker in
einen inhaltsfreien `SafeError` um; Parser- und Angriffssuite sowie der anschließend
vollständig wiederholte `test:ci`-Lauf bestanden. Dieser lokale Nachweis ersetzt
keine Fresh-Install-, Cowork-UI-, Accessibility- oder Drei-OS-Evidenz.

Die bewusst nicht im kostenoptimierten Cloud-Gate enthaltene monolithische
`test-batch-session.js`-Suite wurde anschließend ebenfalls vollständig ausgeführt:
66 Tests bestanden, einschließlich zweier echter 100-Dateien-Serienläufe sowie
Crash/Resume an den Positionen 1, 50 und 100. Dabei wurden alte Erwartungen an die
Review-Phase korrigiert und zwei reale Restfehler behoben: erfolgreicher früher
Work-Copy-Cleanup meldet nicht länger fälschlich einen offenen Cleanup, und eine
Crash-Recovery kann dieselbe Paket-ID nicht erneut in die Mapping-CSV schreiben.

## Lokaler RC36-Nachweis 24.08.2026

Nach der Entkopplung der lokalen Stapelprüfung bestand `npm run test:ci` vollständig
mit Exit-Code 0. Der vorgeschaltete RC36-Vertragstest bestätigt den sofortigen,
tokenfreien Cowork-Rückgabewert und die nur über privates IPC gestartete lokale
Prüfung. Zusätzlich bestanden die 66 servergebundenen Stapeltests, einschließlich
Review-Rekonstruktion, Abbruch, Vertagung, Wiederaufnahme und zweier echter
100-Dateien-Läufe. Der gebaute ZIP enthielt 349 Einträge, bestand die Paketparität,
13 Skill-Vertragstests sowie die synthetische 150-Fälle-Vertragsmatrix. Sowohl der
Quellplugin-Ordner als auch der entpackte ZIP bestanden `claude plugin validate`.
Diese Evidenz ersetzt nicht den erneuten Cowork-UI-Test mit installiertem RC36 und
nicht die noch offenen Zielplattformabnahmen.

## Lokaler RC37-Sicherheitsnachweis 25.08.2026

RC37 schließt die beim Review des RC36-Nachtrags gefundenen Restlücken. Automatische
Output-Retention läuft nur noch, wenn jedes offene Batch-Journal vollständig gelesen
und validiert werden konnte; bei einem einzigen unlesbaren oder ungültigen Journal
blieb der gesamte Output-Bereich unangetastet, während nach dem damaligen RC37-Vertrag
Processed- und Review-Retention weiterliefen. RC54 ersetzt diesen historischen
Processed-Vertrag: mögliche Alt-Originale werden weder automatisch noch durch Purge
gelöscht. Batch-Journale behandeln partielle Writes vollständig, flushen die Datei
vor dem atomaren Rename und synchronisieren auf POSIX zusätzlich das Elternverzeichnis.
Der damalige RC37-Nachweis verwendete für den abgekoppelten Review-Worker 30 Minuten;
der aktuelle Zielvertrag entfernt diesen menschlichen Entscheidungs-Timeout. Der
synchrone Supportpfad bleibt auf fünf Minuten begrenzt.

Direkte Regressionsevidenz liefern 6 Journal-/Schutztests, 16 Retentiontests, 3
Review-Executor-Vertragstests und 39 Companion-Verarbeitungstests. `test:ci` und die
66 servergebundenen Batchtests bestanden vollständig. Der frisch gebaute RC37-ZIP
enthält 350 Einträge und bestand Quellparität, 13 Skill-Vertragstests sowie die
synthetische 150-Fälle-Vertragsmatrix; sein SHA-256 lautet
`93a13f5a6bc2a2d86d995cb7206a3a6532dff1da402538fb9220502d0bb529b1`.
Diese lokale E0-Evidenz ersetzt weiterhin keine Cowork-UI- oder Zielplattformabnahme.

## Lokaler RC44-Refactoring-Nachweis 25.08.2026

Nach der Entfernung der drei alten Input-Werkzeuge aus sämtlichen aufrufbaren MCP-
Oberflächen bestand `npm run test:ci` vollständig mit Exit-Code 0. Der Supportmodus
umfasst jetzt 25 Werkzeuge, davon sind acht im normalen Cowork-Ablauf sichtbar;
`open_input_folder`, `begin_document_batch` und
`start_document_batch_processing` sind auch im Supportmodus nicht mehr aufrufbar.
Die datenbewahrende Startmigration für bereits verwaiste Alt-Claims ist seit RC55
als versioniertes, gesperrtes Modul isoliert. Sie nimmt keine neuen Quellen an;
der Normalpfad besitzt weder `listInput` noch einen technischen Ordnerfallback.

Der Lauf enthielt unter anderem 70 Parser-, 79 PII-Regressions-, 101 freigegebene
Formatkombinations-, 38 Gateway-End-to-End-, 31 MCP-Protokoll- und 20 adversariale
Tests sowie Mapping/Outbox, direkten Picker/Intake, lokalen Handoff, gemischte
TXT-/CSV-/DOCX-Wiederaufnahme und die inaktiven Performance-/OCR-Harnesses. Dies ist
lokale E0-Evidenz und ersetzt keine Fresh-Install-, Cowork-UI- oder macOS-Abnahme.

## Lokaler RC64-OPC-Interoperabilitätsnachweis 27.08.2026

RC64 klassifiziert OPC-Beziehungstypen vollständig statt über ungebundene
Teilstrings. Dadurch bleiben Standard-Paketmetadaten (`core-properties`,
`extended-properties`, `thumbnail`) und der Signaturursprung zulässige statische
DOCX-Inhalte. Die Product-Owner-Entscheidung folgt DS-017 und DS-049: enthaltene
interne Hyperlinks und normale relative Ziele dürfen ausschließlich auf vorhandene
Parts innerhalb der Paketwurzel zeigen; externe Ziele, Root-Escapes sowie OLE,
Package, VBA, Attached Templates, External Links, Custom UI und ActiveX stoppen
weiterhin vor jeder privaten Arbeitskopie. XLSX und PPTX bleiben gesperrt.

Die verlangte synthetische UAT-Admission-Gegenprobe ergab exakt 111 Eingänge:
`01-positive` 4 Kandidaten, `02-review` 2 Kandidaten, `03-blocked` 5 gestoppte
Dateien und `04-batch-100` 100 Kandidaten. `npm run test:source-preflight`
bestand mit 16 Source-, 12 OPC- und 5 Admission-Tests; `npm run
test:result-grades` bestand mit 6 Grad- und 4 Projektionstests. `npm run test:ci`
lief vollständig mit Exit-Code 0. Der gebaute Plugin-ZIP bestand Quellparität,
13 Skill-Vertragstests und die 150-Fälle-Vertragsmatrix.

`DataSecure-Privacy-Preflight-v3.2.0-rc64.zip` enthält 385 Einträge und 22.217.142
Bytes; sein SHA-256 lautet
`755f8d7bbc6b787e735c629a116b742a069b83e8931ed466dfc034c467432b9d`.
Alle genannten Eingänge waren synthetisch. Diese lokale E0-Evidenz ersetzt keine
Fresh-Install-, Cowork-UI-, Accessibility-, Security-E3- oder Drei-OS-Abnahme.

## Lokaler RC64-Nachtrag zur Inode-Testpräzision 27.08.2026

Der ausschließlich synthetische BL-049.1a-Testfix verändert keinen Produktcode und
keine ausgelieferten Artefakte. Eine Gegenprobe mit 400 Dateien erkannte 400
Identitätsänderungen (`noThrow: 0`); `test-source-format-inspector.js` bestand 20
aufeinanderfolgende Läufe. `npm run test:source-preflight` und `npm run test:ci`
endeten jeweils mit Exit-Code 0. Menschliche E1/E2/E3-Nachweise werden dadurch
nicht ersetzt.

## Lokaler RC65-Nachweis zur Paketidentitätsbindung 27.08.2026

RC65 setzt das gewählte Zielbild A aus BL-049.1 um. Bei der terminalen
Evidence-Erzeugung wird jedes freigegebene Paket einmal vollständig verifiziert;
Manifest und Markdown werden davor und danach über exakte BigInt-Werte für
`dev`, `ino`, `size` und `mtimeMs` stabil gebunden. Spätere öffentliche
Zählungen führen ausschließlich zwei Metadatenzugriffe je Paket aus und hashen
keinen Dokumentinhalt erneut. Fehlen, Linkstatus oder Identitätsabweichung ergeben
fail-closed `unavailable`. Die Identitäten verbleiben im privaten Checkpoint.

Die direkten Tests bestanden mit 5 Projektions-, 11 Status-, 15
Terminal-Evidence-, 12 Abschluss-, 8 Handoff- und 7 Results-Fällen. Die
100-Pakete-Gegenprobe belegte exakt 100 Identitätsprüfungen und keinen
Voll-Hash-Aufruf. `npm run test:result-grades`, `test-audit-privacy.js`,
`test-diagnostics.js` und `npm run test:ci` endeten mit Exit-Code 0. Der echte
Intake-Worker bestätigt den identitätsgebundenen Grad erst nach dem terminalen
Evidence-Commit; ein früher read-only Poll darf davor noch `unavailable` sehen.

`DataSecure-Privacy-Preflight-v3.2.0-rc65.zip` enthält 386 Einträge und
22.218.988 Bytes; Paketparität, 13 Skill-Vertragstests und die synthetische
150-Fälle-Vertragsmatrix bestanden. Sein SHA-256 lautet
`b5360c2da4ba937b924b2bd4ef0b8dd4fda7aa11c48fa2688b4bef02393382a7`.
Diese lokale E0-Evidenz ersetzt keine Fresh-Install-, Cowork-UI-, Accessibility-
oder Security-E3-Abnahme.

## Ausführbares RC63-UAT-Kit 27.08.2026

Das UAT-Kit besitzt nun einen einzigen dokumentierten Aufbauweg: zuerst
`npm run fixtures`, danach die gepinnte Python-Abhängigkeit installieren und den
Generator mit `--out docs/acceptance/RC63_UAT_TEST_KIT/inputs` ausführen. Das
maschinenlesbare Fixture-Layout und der Dokumentvertragstest belegen exakt 111
synthetische Eingänge in vier Gruppen: 4 positive, 2 Review-, 5 gesperrte und 100
Batchdateien. Der Generator behält seinen bisherigen Standardpfad, akzeptiert aber
ein explizites, sicher begrenztes Zielverzeichnis und prüft sein Ergebnis gegen das
Layout.

Die fünf gesperrten Eingänge wurden gegen den tatsächlichen Preflight geprüft:
PDF und PNG enden mit `SOURCE_FORMAT_NOT_RELEASED`; die minimalistischen XLSX-,
PPTX- und beschädigten DOCX-Fixtures mit `SOURCE_TYPE_MISMATCH`. Die Sollmatrix
bildet diese Codes ab. Produktversion und Build-Commit sind in der Evidenzvorlage
absichtlich leer, damit ausschließlich der wirklich getestete Stand eingetragen
wird.

`test-rc63-uat-kit-contract.js` bestand mit 5 von 5 Fällen; `npm run test:docs`
und die vollständige Regression `npm run test:ci` endeten jeweils mit Exit-Code
0. Beide erzeugten DOCX-Dateien wurden strukturell mit
`python-docx` geprüft; das positive Profil enthält kein Bild, das Reviewprofil
genau eines. Eine visuelle LibreOffice-Renderprüfung war in dieser lokalen
Umgebung mangels ausführbarer LibreOffice-Installation nicht möglich. Diese
E0-Vorbereitung ersetzt weder den installierten 100-Dateien-/500-MiB-Lauf noch
die beobachteten menschlichen E1/E2/E3-Abnahmen.

## Lokaler RC66-Nachweis für private Artefakte, Ordnerquelle und adaptive Policy 28.08.2026

RC66 verdrahtet die OS-benutzergebundene AES-256-GCM-Fassade in Batch-Snapshot,
Review und Parserübergabe. Acht Secret-Store-, 19 Crypto-, vier Batchmigrations-,
drei Reviewmigrations-, neun Snapshot-, 16 Parser-, 21 Visual- und 40 Gateway-
Fälle bestanden. Der Build prüft fünf native `@napi-rs/keyring`-Zielartefakte der
Version 1.3.0 gegen Lockfile, Lizenz, Größe, SHA-256 und Binärformat. Direkte
Pickerverarbeitung erzeugt keine Klartext-Jobdatei; unbestätigte Commitmarker und
Schlüsselverlust stoppen geschlossen.

Die rekursive Ordnerquelle bestand sieben direkte Drei-OS-, Hierarchie-, Link-,
Grenz- und Mappingtests sowie die bestehenden Intake-, Journal- und MCP-Verträge.
Der adaptive Performance-Harness bestand sechs Reihenfolge-, Zwei-Slot-, Speicher-,
Abbruch-, Commit- und OCR-Single-Flight-Fälle; der reale synthetische
TXT-/CSV-/DOCX-Benchmark bestand weiterhin. Produktparallelität bleibt bis zur
realen Windows-/macOS-Referenzmessung geschlossen.

`npm run build` erzeugte und verifizierte
`DataSecure-Privacy-Preflight-v3.2.0-rc66.zip` mit 417 Einträgen und 26.157.792
Bytes (`d668a529269af7c3440c0ddf4665e89a6eb0cdfc863e7348f40b044e0aa850fa`)
sowie `DataSecure-Privacy-Gateway-v3.2.0-rc66.mcpb` mit 588 Einträgen und
26.588.482 Bytes (`6334587e19959bfdf85f96195222178094d67e8b3838fc360a8da6c164ca9c59`).
Paketparität, 13 Skill-Vertragstests und die 150-Fälle-Vertragsmatrix bestanden.
Diese E0-Evidenz ersetzt keine Fresh-Install-, Keyring-/Dateisystem-, Cowork-UI-,
Accessibility- oder Security-E3-Abnahme.
