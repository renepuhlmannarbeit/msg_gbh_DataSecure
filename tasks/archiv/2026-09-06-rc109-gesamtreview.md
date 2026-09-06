# RC109 – unabhängiges Gesamt- und Schnittstellenreview

Stand: 06.09.2026. Bewertet wurde der lokale Arbeitsbaum auf `main` bei
`ca1a0ee` **einschließlich der noch nicht committeten RC109-Änderungen**.
Dieser Bericht ist keine Freigabe eines neuen Commit-/PKG-04-/INT-13-Kandidaten.

## 1. Auftrag, Vorgehen und Grenzen

Read-only-Review der beiden Produkte, ihrer Ziele, Fachlichkeit, aktuellen
Dokumentation/UML, Architektur, Übergaben, Tests und Mocks. Kein Produktcode wurde
in diesem Review verändert. Keine Installation in Claude, kein Push, keine
GitHub Actions und kein neuer Releasebuild wurden ausgelöst.

Drei unabhängig abgegrenzte Fachreviews wurden ausgeführt:

1. Standalone-Entwicklung/UX: Frontend, Rust-/Tauri-Commands, private IPC,
   Sidecar, Application-Service, Historie, Fortsetzung und Statusprojektion.
2. Claude/Cowork/MCP: öffentliche Toolfläche, Host-/Skillvertrag, Handoff,
   gemeinsame Workerpfade und Abgleich mit offiziellen Dokumentationen.
3. Konvertierung/Inhaltstreue: Aufnahme, OOXML-/Bildextraktion, PDF/OCR-Worker,
   Artefakt-/Exportvertrag, Ressourcenprojektion und Tests.

Der Hauptreview hat Befunde an den betreffenden Implementierungen gegengeprüft
und die unten beschriebenen XLSX-/BMP-, Resume-, MCP- und Testharness-
Gegenbeispiele separat ausgeführt. Synthetische Daten und isolierte Adapter;
keine echten Kundendokumente oder produktiven Journale wurden verändert.

Tief gelesen wurden insbesondere Produktvision/-vertrag, Zielarchitektur,
Refactoringplan, UML, Standalone-Architektur/-Sicherheitsmodell, Entscheidungen
DS-082 bis DS-086, Dokumentregister/-verifizierer, Testkonzept und die jeweiligen
kritischen Implementierungsketten. Current-State, Backlog und große
Quellmodule wurden zusätzlich gezielt anhand ihrer Verweise und Zustände
abgeglichen. **Das ist keine Behauptung, jede historische Archivdatei, jede
Vendorzeile oder jeden möglichen Laufzustand vollständig verifiziert zu haben.**

Nicht neu nachgewiesen: echte Cowork-Bedienung, sichtbarer Explorer/Finder auf
allen Zielhosts, native macOS-Ausführung auf Intel/ARM, Endnutzer-UAT sowie
bytegleiche Builds aus einem neuen sauberen Commit. Vorhandene RC108- oder
RC109-Paketberichte ersetzen diese Unterscheidung nicht.

## 2. Gesamturteil

Die Grundarchitektur passt zum Ziel. Zwei Produkte mit gemeinsamen Parser-/PII-/
Journal-/Recovery-Bausteinen, aber getrennten Datenbereichen und getrennten
öffentlichen Schnittstellen sind sinnvoll. Tauri als lokale Hülle mit privatem
Sidecar verlangt keinen eigenen Serverstart durch den Anwender. Eine andere
Programmiersprache, zusätzliche VM, ein Zusatzkonto oder Schlüsselbund würden
die hier gefundenen Fehler nicht beheben.

Es gibt jedoch **zwei prioritäre funktionale Defects**, mehrere begrenzte
Vertrags-/Inhaltstreuefehler und eine nachgewiesene Schwäche im Testurteil.
„Tests grün“ ist deshalb aktuell nicht gleichbedeutend mit „alle zugesagten
Abläufe korrekt“. Die aktuelle Dokumentation enthält zudem widersprüchliche
IST-Aussagen, obwohl ihre mechanischen Gates passieren.

Empfehlung: RC109 als Engineering-Stand weiterführen; vor einer erweiterten
Freigabe zunächst F-01/F-02 und den Testharness schließen, anschließend die
weiteren Defects und den Dokumentationskanon konsolidieren. Kein pauschaler
Nachweis eines P0-Datenabflusses oder eines Schreibens in Originaldateien wurde
in diesem Review gefunden; das ist keine Garantie, dass alle solchen Fehler
ausgeschlossen sind.

## 3. Revalidierte Produkt- und Übergabelogik

| Grenze | Fachlicher Vertrag | Bewertung des aktuellen Codes |
| --- | --- | --- |
| Startseite → Vorbereitung | Noch kein Modus ausgewählt; Datei-/Ordnerauswahl oder Drop allein startet keine Verarbeitung. | RC109 bildet dies ab. Bedienung darf nicht durch alte UML-Autostartbilder zurückgebaut werden. |
| Lokale UI → Rust | Lokale Auswahl-/Zielinformationen dürfen angezeigt werden; keine allgemeine Dateisystem-/Shellvollmacht für die WebView. | Geschlossene Commands, spezifische Berechtigungen und lokale Anzeige sind vorhanden. Die pauschale Pfadverbotsaussage im Sicherheitsdokument ist veraltet. |
| Rust → Sidecar | Expliziter Zweck, begrenzte Frames, passende Requests/Responses, nachvollziehbarer Fehler statt falschem Erfolg. | `processingMode` → `processing_mode`, exakte Envelopes und 1-MiB-Grenze sind getestet. Rust-Tests sind keine vollständige native Bedienabnahme. |
| Admission → dauerhafter Stapel | Quellen nur lesen; Zweck, Ziel und Stapelidentität dauerhaft binden. Auswahl, IPC-Annahme und Checkpoint sind verschiedene Zustände. | Grundsätzlich richtig getrennt. Zielarchitektur und ältere Ablaufbilder sagen stellenweise etwas anderes. |
| Verarbeitung → Sammelreview | Automatische Arbeit zuerst, danach nur tatsächlich offene fachliche Entscheidungen gesammelt prüfen. | F-01 verletzt dies bei unterbrochenen Mischstapeln. |
| Markdown-only → Ausgabe | Ausgangsinhalte ohne PII-Ersetzung erhalten; begrenzte Extraktion ehrlich kennzeichnen; kaputte Quellen nicht als normale Konvertierung ausgeben. | Eigener Zweck/Artefakttyp und Ausgabebaum vorhanden; F-02 bis F-04 betreffen Inhaltstreue. |
| Anonymisieren → Ausgabe | PII-/Restprüfung und gegebenenfalls lokale Entscheidung; keine Garantie rechtlicher Anonymität. | Gemeinsame Engine und produktgebundene Ausgabegates bleiben bestehen. |
| Terminaler Stapel → sichtbarer Lauf | Ergebnisse und Zuordnung gemeinsam fertig; kein früher sichtbarer Teillauf; keine automatische Ergebnisnavigation in Standalone. | Aktuelle Export-/Historienlogik bildet die gewählte Semantik ab. Alte UML legt eine falsche Reihenfolge nahe. |
| Historienzeile → Öffnen/Fortsetzen | Exakte Stapel-ID und ursprüngliches Laufziel, nicht heutiger Standardordner oder „neuester Lauf“. | Bindungen vorhanden; F-01 betrifft auch die neue Historienfortsetzung. Echte Öffnung durch Explorer/Finder bleibt Zielhost-Evidenz. |
| MCP → lokale Handlung/Handoff | Alle Argumente validieren; keine Rohkonvertate oder private Zuordnung durch Plugin-Handoff. | Produkttrennung überprüft, aber F-05: keine zentrale Schemaausführung vor Dispatch. |

Die Beschränkung auf die letzten 20 sichtbaren Historieneinträge ist keine
Löschfrist. Ein geänderter Ergebnisstandard darf alte Laufaktionen nicht auf
neue Ordner umlenken. Diese Entscheidungen bleiben sinnvoll. Reine Konvertierung
ist ein eigenständiger Standalone-Zweck, kein schwächer geprüfter
Anonymisierungsmodus und keine Erweiterung des öffentlichen Cowork-Handoffs.

## 4. Bestätigte Defects und Testlücken

### F-01 · P1 · Fortsetzung eines Mischstapels wählt zu früh den Review-Worker

- Stellen: `plugins/data-secure/server/standalone/application-service.js:401`
  und `:576`; `plugins/data-secure/server/mcp-server.js:359`;
  Gegenvertrag `gateway/batch-review-state.js:14`.
- Der Service wählt Review schon bei irgendeinem `deferred_review`-Eintrag.
  Die echte Reviewplanung erlaubt ihn erst ohne verbleibende, wiederholbare
  oder noch bereitzustellende Dateien. Die Continuation macht unterbrochene
  `retryable`-Positionen wieder `pending`.
- Reproduzierbarer Zustand: eine Reviewposition und eine Pendingposition.
  Zweimaliger Aufruf der echten `continueHistoryBatch`-Methode mit echtem
  Progress-/Review-State-Modul ergibt jeweils:
  `serviceOk=true, selectedWorker=review, reviewReady=false, remaining=1`.
  Prozessstart/Reservierung wurden dabei isoliert adaptiert; kein natives
  Reviewfenster wurde geöffnet. Das Fachreview prüfte zusätzlich den echten
  Continuation-/Review-Orchestratorpfad mit adaptiertem Journal/Lock.
- Der öffentliche Cowork-Fortsetzungspfad hat dieselbe verfrühte Verzweigung.
  Damit ist es kein ausschließliches Problem des RC109-Frontends.
- Lösung: eine gemeinsame Readiness-Bedingung bzw. Next-Action-Auswahl; zunächst
  offene automatische Arbeit über den Batch-Worker erledigen, dann bestehendes
  Auto-Sammelreview verwenden. Kein neuer Anwenderdialog.
- Abnahme: Review + pending/retryable/delivery_pending, wiederholte Fortsetzung,
  ACK/Abbruch und schließlich terminaler Export; beide Produkte und echte
  Progress-/Reviewplanung zusammen testen, nicht nur einen gewählten Mockaufruf.

### F-02 · P1 · Leere XLSX-Zellen verschieben Werte in die falsche Spalte

- Stelle: `plugins/data-secure/server/ooxml.js:1113` (`parseXlsx`).
- Der Zellregex kann eine selbstschließende Zelle bis zum Endtag der nächsten
  Zelle konsumieren und deren Inhalt an die erste Zelladresse binden.
- Synthetisches gültiges Beispiel mit Spalten `Debit | Credit`:
  `<c r="A2"/><c r="B2"><v>1000</v></c>` wird zu `1000 | leer` statt
  `leer | 1000`. Separat verlieren gültige einfach gequotete Attribute wie
  `t='inlineStr'` ihren Textwert. Hauptreview und Fachreview reproduzierten dies.
- Der generische Hinweis `SOURCE_COVERAGE_UNVERIFIED` entschuldigt keine
  falsche fachliche Spaltenzuordnung.
- Lösung: begrenztes strukturelles XML-Lesen für Zellen und Attribute statt
  mehr Sonderfällen im globalen Regex. Keine Formelausführung hinzufügen.
- Abnahme: leere/self-closing Zellen, einfache/doppelte Quotes, sparse rows,
  verschiedene Namensräume und unabhängige Office-/LibreOffice-Beispiele;
  Originalposition und Literalwert müssen erhalten bleiben.

### F-03 · P2 · Beschädigtes XLSX-Part-XML liefert ein normales Teilkonvertat

- Stellen: `ooxml.js:1108–1113`, `standalone/markdown-extractor.js:81`;
  Vertrag: `docs/FORMAT_COVERAGE_MATRIX.md:72`.
- Ein ZIP mit gültigen CRCs/OPC-Struktur, einem vollständigen ersten Datensatz
  und später abgeschnittenem Worksheet-XML liefert nur den gefundenen Präfix
  als `incomplete` mit pauschaler Coveragewarnung. Der eigentliche XML-Defekt
  wird nicht als beschädigte Quelle verworfen.
- Hauptreview reproduzierte die Extraktorantwort; das Fachreview prüfte auch,
  dass die OPC-Aufnahme diesen Kandidaten nicht wegen der Part-XML-Struktur
  aussortiert. Kein produktiver Datenbestand wurde verwendet.
- Lösung: XML-Wellformedness von zulässiger unvollständiger Layout-/Objekt-
  Coverage unterscheiden. Strukturdefekt → fester Parserfehler, kein Artefakt;
  nächste Stapelposition läuft weiter. Gemeinsame Infrastruktur mit F-02 nutzen.
- Abnahme: tatsächliche Aufnahme → Worker → Artefakt/Zuordnung, nicht nur ein
  Test für einen offensichtlich kaputten ZIP-Header.

### F-04 · P2 · Gültiges 32-Bit-BMP kann vor OCR transparent werden

- Stelle: `plugins/data-secure/server/images/bmp.js:13`; weißes Compositing in
  `standalone/conversion-worker-child.js`.
- Bei 32-Bit-`BI_RGB` ist das hohe Byte nicht automatisch ein Alphakanal.
  Der Decoder übernimmt es trotzdem als Alpha. Ein gültiger schwarzer Pixel
  mit unbenutztem Byte `0` wird `[0,0,0,0]` statt `[0,0,0,255]`.
- Separat mit einem minimalen gültigen BMP reproduziert. Auf Weiß kann so
  Bildtext vor OCR verschwinden. Der eigene Fixture-Encoder erzeugt 24-Bit-BMP
  und deckt diesen Fall nicht ab.
- Lösung: korrekte BI_RGB-Semantik; abweichende Masken-/Alphaformate ausdrücklich
  unterstützen oder ablehnen. Regression mit unabhängig erzeugtem 32-Bit-BMP
  und nachfolgender OCR, nicht nur Encode-/Decode-Roundtrip.

### F-05 · P2 · MCP-Inputs sind beschrieben, aber nicht zentral durchgesetzt

- Stelle: `plugins/data-secure/server/mcp-server.js:425` und Dispatch davor.
- `tools/call` reicht `arguments || {}` direkt weiter. Einzelne Handlersicherungen
  ersetzen keine vollständige Durchsetzung des veröffentlichten `inputSchema`.
- Der tatsächliche Handle-/Dispatch-Code wurde isoliert mit adaptiertem Handoff
  ausgeführt: `continue_local_results_handoff` akzeptiert `[]` und
  `{unexpected:true}`, ruft beide Male `nextAsync` auf und liefert kein
  `isError`. Der Repro konsumierte keine echten Dokumente.
- Das ist eine Vertragsverletzung mit potenzieller Zustandsänderung bei
  ungültiger Anfrage, **kein nachgewiesener Rohdatenabfluss**.
- Lösung: zentrale Validierung vor Dispatch; Objekttyp, unknown properties,
  erforderliche Felder, Enums und Grenzen. Bestehende beabsichtigte
  Normalisierungen explizit versionieren statt versehentlich abschaffen.
- Abnahme: ungültige Requests dürfen keinerlei Handoff-/ACK-/Startwirkung haben.
  Passende Fehlerantworten und bestehende zulässige Requests mitprüfen.

### F-06 · P2 · „Abgeschlossen“-Zähler unterschlägt fehlgeschlagene Positionen

- Stellen: `gateway/batch-recovery.js:137`, Standalone-Service-Status und
  `apps/datasecure-standalone/frontend/app.js:563–564`.
- `completed_count` wird aus `progress.released` gebildet, obwohl der Core
  `completed = released + stopped` führt. Beispiel: released + stopped +
  processing → tatsächlich zwei terminale Positionen, UI sagt eine von drei
  abgeschlossen. Im Fachreview durch echte Projektionen reproduziert und
  anschließend am Code gegengeprüft.
- Lösung: fachlich korrekten Completed-Zähler übernehmen; erfolgreiche Ergebnisse
  und Fehler separat lassen. Alternativ müsste die gesamte UI eindeutig
  „erfolgreich“ statt „abgeschlossen“ sagen. Erstere Variante ist einfacher.

### F-07 · P2 · Asynchrone Tests können trotz verspätetem Fehler Exit 0 liefern

- Stellen: `tests/helpers.js:27,57`, `test-automatic-local-review.js:127`,
  `test-batch-executor-runner.js:309–313`.
- Manche Aufrufer starten `testAsync` ohne Await und rufen nach einem
  `setImmediate` bereits `done` auf. Sofort aufgelöste Mockpromises verschleiern
  dies; echte verzögerte IO ist damit nicht zuverlässig abgewartet.
- Isolierter Sentinel mit echtem Helper: `testAsync` wartet 25 ms und wirft
  anschließend absichtlich eine Assertion; `setImmediate(done)` meldet davor
  `0 passed, 0 failed`, danach erscheint `FAIL`, **Prozessexit bleibt 0**.
- Lösung: alle registrierten Tests vor Verdict/Cleanup vollständig awaiten;
  durchgängige Runnersemantik statt willkürlicher Sleeps. Einen eigenen
  Childprocess-Sentinel aufnehmen, der verspätete Fehler mit Nonzero-Exit belegt.
- Bestehende grüne Ergebnisse sind nicht pauschal wertlos. Die Aussagekraft
  gerade der betroffenen asynchronen Suiten ist jedoch eingeschränkt.

### F-08 · P2 · Aktive Konzeptionsdokumente widersprechen dem implementierten IST

- `UML_ARCHITECTURE.md:446` beschreibt Auswahl → sofortige Arbeit → Abschluss →
  Zuordnung → automatisches Öffnen. Aktuell gilt bewusster Start, Zuordnung vor
  vollständigem Abschluss und keine automatische Standalone-Ergebnisnavigation.
- `UML_ARCHITECTURE.md:484–487` und `TARGET_ARCHITECTURE.md:90–96` nennen reine
  Konvertierung noch nicht ausführbar/aktiv. Spätere Abschnitte desselben UML-
  Dokuments und Code beschreiben sie bereits als implementiert.
- `TARGET_ARCHITECTURE.md:52` behauptet Checkpoint vor MCP-Rückkehr; der aktuelle
  ACK kann bewusst vor dem ersten Checkpoint liegen (UML-Sequenz um Zeile 156).
- MarkItDown steht noch als produktiver Konverter in der Zielarchitektur;
  tatsächlich sind Node-/PDF-/OCR-Komponenten produktiv und MarkItDown ist ein
  optionales Engineering-Oracle (Formatmatrix, DS-085).
- `STANDALONE_SECURITY_MODEL.md:26` verbietet Quellpfade in der lokalen UI;
  DS-082 erlaubt deren lokale Anzeige. Sein Lebenszyklus kennt nur PII-geprüfte
  Outputs und sein Nichtziel Drag-and-drop ist durch neuere Arbeit überholt.
- Alte globale Vier-Format-Aussagen in `CLAUDE.md`/Refactoringplan, die
  zweigeteilte UI in `TESTING.md:150`, Teile des Produkt-/OSS-Vertrags sowie die
  ausschließliche Neuester-Stapel-Projektion in UML benötigen Produktscope und
  Zeitbezug. Eine alte Plugin-Aussage darf Standalone nicht unbemerkt einschränken.
- Die Dokumenttests suchen vielfach nach vorhandenen neuen Stichworten/DS-IDs.
  Angehängte neue Absätze erfüllen sie, obwohl widersprechende alte Absätze
  bleiben. Das Register prüft Identität/Links, nicht diese semantischen Konflikte.
- Lösung: pro Produkt/Zweck eine verbindliche aktuelle Fähigkeiten-/Datenfluss-
  Matrix; historische Abschnitte archivieren, aktive UML ersetzen statt neue
  Gegenbilder anhängen. Tests müssen positive und ausdrücklich veraltete Aussagen
  prüfen. Keine neuen Benutzerbestätigungen und kein zusätzliches Dokuwerkzeug nötig.

### F-09 · P2 · Reine Standalone-App-Änderungen können die CI komplett überspringen

- Stelle: `.github/workflows/ci.yml:9–36`.
- Push-/PR-Pfadfilter enthalten `plugins`, `tests`, `scripts` usw., nicht `apps`.
  Eine ausschließlich in Frontend/Rust/Capabilities erfolgte Änderung startet
  deshalb keinen automatischen Job. Der aktuelle gemischte RC109-Diff würde
  durch seine übrigen Dateien sehr wohl triggern.
- Lösung: `apps/datasecure-standalone/**` in beide Filter. Ein vorhandener kurzer
  Job reicht; dies verlangt **keine** teuren neuen Multi-OS- oder OCR-Actions.

### F-10 · P3 · Historischer Gatewaytest ist kein Beleg des aktuellen MCP-Bildwegs

- `tests/test-gateway-e2e.js:657–692` ruft intern
  `approveReviewAsset(..., true)`/`listAssets`/`readAsset` auf. Der Dateikopf
  bezeichnet die Fassade als MCP-End-to-End-Pfad, obwohl diese Bildfreigabe nicht
  zur aktuellen öffentlichen Toolfläche gehört; weitere Fixturepfade sind legacy.
- Kein Beleg einer heute öffentlich erreichbaren Bildfreigabe. Den sinnvollen
  Integritätstest behalten, aber korrekt als internen/Legacy-Test einordnen und
  separat den tatsächlichen öffentlichen Verbotsvertrag prüfen.

## 5. Priorisierte Arbeitspakete zur Übernahme in den Kanon

Diese Zuordnung ist ein Reviewvorschlag, **keine stillschweigende Änderung der
Storyzustände**. Bereits bestehende IDs verwenden, keine Parallelbacklogs eröffnen.

| Reihenfolge | Umfang | Bestehender Bezug | Abschlussnachweis |
| --- | --- | --- | --- |
| 1 | F-07 Testverdict reparieren | BL-002 | Verzögerter Fehler beendet Sentinel mit Fehlercode; alle Async-Suiten abgewartet. |
| 2 | F-01 gemeinsame Fortsetzungsentscheidung | BL-011.3, BL-043.1, BL-010.29 | Gemischte Zustände → automatische Arbeit → Review → terminaler Export; Plugin und Standalone. |
| 3 | F-02/F-03 strukturelle XLSX-Extraktion | BL-010.28, BL-020.1, BL-002 | Zellidentität/Quotes und beschädigte Parts durch tatsächliche Worker-/Exportkette. |
| 4 | F-04 BMP-Semantik | BL-010.28, BL-002 | Fremdproducer-32-Bit-BMP bleibt sichtbar und liefert lokalen OCR-Text. |
| 5 | F-05/F-06 Eingangs- und Ausgangsverträge | BL-043, BL-012.6, BL-002 | Negative Requests ohne Seiteneffekt; korrekte gemischte Fortschrittszähler. |
| 6 | F-08/F-09/F-10 Kanon und Evidenzhygiene | BL-001, BL-002, BL-051.1 | Widerspruchsfreie aktive Dokumente; App-Pfadfilter; korrekte Testklassen. |
| danach | Releasekandidat und Zielhostprüfung | bestehende PKG-04/INT-13-/E1/E2-Einträge | Neuer sauberer Commit, zwei bytegleiche Builds, beide Binaries smoken, erst dann Kandidatenbindung und UAT. |

Für diese Korrekturen ist keine neue fachliche Nutzerentscheidung nötig. Die
beschlossenen Ziele bleiben erhalten: einfache lokale Bedienung, beide Produkte,
zwei Standalone-Zwecke, unveränderte Originale, ein aktiver Stapel, gezieltes
Sammelreview, laufgebundene Zuordnung und 20 sichtbare Historieneinträge.

## 6. Best-Practice-Abgleich und bewusst nicht empfohlene Umbauten

- Tauri-Commands/Capabilities und ein kleiner privater Sidecar passen zum
  Offline-Desktopziel. Die vorhandenen handgeschriebenen Commandberechtigungen
  wurden mit der erzeugten ACL abgeglichen; fehlendes `AppManifest.commands`
  allein ist hier **kein** Beweis einer offenen IPC. Siehe
  [Tauri Capabilities](https://v2.tauri.app/security/capabilities/),
  [Calling Rust](https://v2.tauri.app/develop/calling-rust/) und
  [Sidecar](https://v2.tauri.app/develop/sidecar/).
- MCP verlangt Inputvalidierung auch serverseitig; Schema-Metadaten allein
  genügen nicht. Siehe
  [offizielle MCP-Tools-Spezifikation](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
  Das begründet F-05, keinen pauschalen SDK-/Protokollneubau.
- XML erlaubt beide Attribut-Quoteformen und unterscheidet Strukturfehler von
  normalen Dokumentinhalten. Siehe [W3C XML](https://www.w3.org/TR/xml/#NT-AttValue).
  F-02/F-03 benötigen deshalb robuste XML-Strukturbehandlung, nicht ein weiteres
  positives Beispiel für denselben Regex.
- Die 32-Bit-BI_RGB-Definition behandelt das hohe Byte als unbenutzt, siehe
  [Microsoft BITMAPINFOHEADER](https://learn.microsoft.com/en-us/previous-versions/dd183376(v=vs.85)).
  Die Reparatur von F-04 ist eine Formatkorrektur, keine neue Sicherheitsstufe.
- Die drei Standalone-Ansichten sind für Orientierung und Wiederauffindbarkeit
  sinnvoll. Tastatur/Fokus und korrektes Tab-/Panel-Verhalten bleiben prüfbar
  gemäß [WAI-ARIA Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
  Native Dateimanageröffnung muss getrennt vom bloßen API-Übergabeerfolg getestet
  werden. Kein zusätzlicher Dialog pro Datei ist erforderlich.
- Die aktuellen Anthropic-Seiten unterscheiden Cloud-Laufzeit und Desktop-
  Brücke nicht überall mit denselben Kurzformulierungen. Der
  [Architekturüberblick](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)
  beschreibt lokale Einschränkungen; die
  [Web/Desktop/Mobile-Anleitung](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
  beschreibt lokale Connector-/MCP-Nutzung über eine geöffnete Desktop-App auch
  bei Cloud-Sitzungen. Daher weder „Cloud immer unmöglich“ behaupten noch die
  Produktfreigabe automatisch auf Cloud-Bridging erweitern. DS-078 bleibt die
  konservative unterstützte Betriebsart; weitergehende Bridge-Nutzung benötigt
  eine explizite versions-/zielhostgebundene Prüfung. Keine neuerliche
  unbegründete Umkehr des Produktstandards.
- Der neue Nutzerturn für eine KI-Auswertung ist ein Host-/Skillvertrag. Ein
  lokaler MCP-Server kann aus einem Toolaufruf allein nicht beweisen, was der
  Mensch zuvor im Chat geschrieben hat. Diese Verantwortungsgrenze präzise
  dokumentieren; nicht mit einem weiteren Bestätigungsdialog kaschieren.

Performance: Die isolierte native Konvertierungssuite verarbeitete 100 kleine
TXT-Quellen in diesem Lauf in 19.964 ms, ohne erneutes Lesen des schweren
Runtimebaums je Datei. Das ist ein spezifischer lokaler Messpunkt unter weiterer
Testlast, kein allgemeines SLA oder Hardwarevergleich. Begrenzte Speichernutzung,
korrektes Prozessende und Inhaltskorrektheit haben vor „mehr Threads“ Vorrang.

## 7. Ausgeführte Prüfungen und Aussagekraft

| Prüfung | Ergebnis / Grenze |
| --- | --- |
| `npm run test:product` | Exit 0: `Product full suite passed (49 base + 111 direct test files)`. Unter anderem 69 servergebundene Stapelszenarien, 2.000 synthetische Anonymisierungsfälle und 20 explorative Fälle grün. Enthält Quell-/Dokument-/Recovery-/Korpustests, nicht automatisch native Zielhost-UAT; F-07 schränkt das Urteil betroffener Async-Suiten ein. |
| `npm run test:standalone:conversion` | 25/25 Gruppen grün. Reale paketierte Runtimeprojektion, TXT/MD/CSV/DOCX/XLSX/PPTX, PNG/JPEG/BMP, Text-/Scan-/Hybrid-PDF, Offline-/Abbruch-/Timeout-/Ressourcenfälle, 100-TXT-Serie. F-02/F-03/F-04 sind zusätzliche nicht enthaltene Gegenbeispiele. |
| `npm run test:standalone:rust` | 16/16 grün. Commands, Frames, Envelopes, Modus-/Historybindung, Auswahlguard und Native-Smoke-Vertrag; kein sichtbarer UI-UAT. |
| Fachreview Standalone | 41 Service-, 24 Frontend-, 14 Desktop-Vertragstests und Historientests grün gemeldet. Kein zusätzlicher Releasebuild. |
| Fachreview Cowork | Handoff 27, Recovery 20, MCP 45 grün gemeldet; nicht gleichzusetzen mit vollständiger moderner MCP-Konformitäts- oder Cowork-UAT-Prüfung. |
| Fachreview Extraktor | 38 bestehende Extraktortests grün; neue synthetische OOXML-/BMP-Gegenbeispiele reproduzierbar fehlerhaft. |
| Unabhängige Gegenproben des Hauptreviews | F-01-Service/Readiness, F-02/F-03-Extraktor, F-04-Decoder, F-05-Dispatch sowie F-07-Sentinel reproduziert. Adaptergrenzen bei F-01/F-05 ausdrücklich dokumentiert. |
| `git diff --check` | Exit 0; vorhandene RC109-Produktänderungen unverändert belassen. Dieser Bericht ist der einzige neu hinzugefügte Review-Arbeitsstand. |

Die Expertenergebnisse und Gegenproben zeigen gerade, warum ein breiter grüner
Korpus allein kein Abschlusskriterium ist. Künftige Regressionen sollten die
fehlerhaften Grenzübergänge mit den echten beiden Seiten zusammen prüfen und
Fremdproducer-/Negativdaten enthalten, statt lediglich erwartete Mockantworten
zurückzugeben. Native Zielhost- und menschliche Evidenz bleibt separat offen.
