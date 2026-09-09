# Gate: PDF- und OCR-Risikobeweis v1

Status: Cowork-/Originalcontainer-Gesamtfreigabe offen; Standalone-E0 aktiv · Story: BL-023.1 · Entscheidungen: DS-004, DS-007, DS-009,
DS-015, DS-016, DS-017, DS-018, DS-030, DS-034 und DS-037

Dieses Gate erlaubt noch keine Cowork- oder vollständige Originalcontainer-/
Pixel-Freigabe für PDF und Bilder. Es bündelt die vorhandene PDFium-Entscheidung
zu einer plattformübergreifenden, reproduzierbaren GO/NO-GO-Prüfung. Bis jede
Pflichtzelle positiv belegt ist, bleiben PDF, Scan-PDF und eigenständige Bilder
im Cowork-Manifest, Cowork-Picker, Cowork-Skill und Marketplace gesperrt.

Der Geltungsbereich ist die Cowork-Freigabe sowie eine Vollständigkeitszusage
für Originalcontainer oder Bildpixel. Die eigenständige Standalone-App darf
PDF-/Bildquellen lokal nach Markdown extrahieren und diesen gültigen, nichtleeren
Markdown-Inhalt nach DS-087/090 anonymisieren. Das erfüllt dieses Gate nicht und
behauptet weder vollständige Quellenextraktion noch Pixelanonymisierung.

## Aktueller Produktstatus 09.09.2026

Die oben genannte Sperre gilt für das **Cowork-Plugin** und für jede Aussage,
der ursprüngliche PDF-/Bildcontainer oder seine Pixel seien vollständig
anonymisiert. Sie gilt nicht mehr als Verbot der eigenständigen Standalone-
Funktion: Die Standalone-App enthält heute eine gepinnte, vollständig lokale
PDF.js-/Canvas-/Tesseract-Runtime. Sie darf Quellen in Markdown extrahieren und
den gültigen, nichtleeren Markdown-Inhalt anschließend durch denselben Privacy-
Core anonymisieren. Extraktionsstatus und Anonymisierungsstatus bleiben getrennt.

BL-023.2/3 ist lokal E0 belegt: Der echte paketierte Parser stoppt erkannte
Formulare/XFA, JavaScript/Aktionen, Anhänge, Signaturen, Annotationen, Outline,
XMP und Verschlüsselung. Standardskonforme In-Memory-Golden-PDFs decken
AcroForm, Signaturfeld, EmbeddedFile/Name-Tree, JavaScript sowie leere und
nichtleere Benutzerpasswörter ab. Dieser Nachweis fand einen realen Defect in
der PDF.js-Integration: Anhänge werden als `Map` geliefert und waren durch eine
`Object.keys`-Prüfung nicht sichtbar. Diese reale `Map`-Regression ist im Golden-
Korpus belegt. Das Produktgate normalisiert zusätzlich defensiv `Set`, Arrays und
gewöhnliche Objekte; diese Formen sind keine behaupteten beobachteten PDF.js-
Rückgaben. Fremderzeuger-, adversariale,
Layout-, OCR-Fach- und sichtbare Zielhostabnahme bleiben E1/E3 offen.

## Festgelegte technische Richtung

- Für Standalone ist Mozilla PDF.js mit lokal gebündeltem Canvas die aktive,
  gepinnte Produktengine. PDFium bleibt historische Engineering-Evidenz und ist
  keine Produktabhängigkeit. Die Cowork-Freigabe bleibt von der paketierten
  Runtime und der vollständigen Pflichtmatrix abhängig.
- OCR arbeitet vollständig offline und muss Deutsch, Englisch sowie gemischte
  Dokumente unterstützen.
- Tesseract.js 7.0.0 mit tesseract.js-core 7.0.0, `@napi-rs/canvas` 1.0.7 und den
  offiziellen `tessdata_fast`-Modellen 4.1.0 für `deu` und `eng` ist die aktive
  Standalone-OCR-Runtime. Tesseract 5.5.2 bleibt historische Engineering-Evidenz
  und ist keine Produktabhängigkeit. Engine und Modelle werden je Release aus offiziellen Quellen
  bezogen, exakt gelockt, unverändert gehasht und gemeinsam lizenziert inventarisiert.
- Parser/OCR erhalten ausschließlich begrenzte Bytes aus privaten Arbeitskopien,
  keine Quellpfade, Cloud-Credentials oder Netzwerkfähigkeit.
- Betriebssystemspezifische Worker sind zulässig; ihre normalisierten Ergebnisse und
  Fehlercodes müssen demselben Content-Graph-Vertrag folgen.
- Signatur, Notarisierung und Produktzertifizierung sind keine Freigabegates. Lizenz,
  SBOM, feste Quellrevisionen, Hashes und reproduzierbare Builds bleiben Pflicht.

## Pflichtmatrix für Cowork und vollständige Originalcontainerfreigabe

| Nachweis | Windows | macOS | Linux |
|---|---|---|---|
| gepinnte gepflegte PDF-Engine und Lieferkette | offen | offen | offen |
| reproduzierbares Runtime-Paket ohne manuelle Installation | offen | offen | offen |
| Offline-/DNS-/Loopback-/Privatnetz-Verweigerung | offen | offen | offen |
| Text, Unicode, Seitenbaum und Objekt-Coverage | offen | offen | offen |
| Formulare, Annotationen, Anhänge, Actions und Verschlüsselung | offen | offen | offen |
| Scan-PDF und OCR Deutsch/Englisch/gemischt | offen | offen | offen |
| CPU-, RAM-, Zeit-, Entpack- und Ausgabegrenzen | offen | offen | offen |
| Fuzzing, Sanitizer und bösartige Gegenproben | offen | offen | offen |
| Lizenzinventar und SBOM | offen | offen | offen |
| frische Plugin-ZIP- und Marketplace-Ausführung | offen | offen | offen |

Das manuelle Workflow-Gate `.github/workflows/pdf-ocr-risk.yml` erzeugt getrennte
Preflight-Evidenz für Windows x64, macOS x64/ARM64 und Linux x64. Ein Preflight
belegt lediglich Pins, Plattformausführung und den weiterhin geschlossenen
Produktpfad; er setzt keine Pflichtzelle automatisch auf bestanden. Der bestehende
Windows-Community-Spike muss ausdrücklich `no_go` melden.

## Ausgeführter Plattform-Preflight

GitHub-Actions-Lauf `32593313169` auf Commit `fdd2a02` wurde am 22.08.2026 auf
Windows x64 (`windows-latest`), macOS x64 (`macos-15-intel`), macOS ARM64
(`macos-14`) und Linux x64 (`ubuntu-latest`) erfolgreich ausgeführt. Die vier
Artefakte bestätigen ausschließlich Plattformausführung, gültige Quell-Pins und den
fail-closed Produktpfad. Sie melden übereinstimmend `passed_gates: []`, alle elf
offenen Gates, `PDF_COVERAGE_UNVERIFIED` und `release_decision: no_go`.

Das zusätzliche Windows-Community-Negativ-Gate bestand ebenfalls, weil der gepinnte
Fremdbinary-Spike erwartungsgemäß `no_go` meldete. Damit ist die CI-Vorprüfung
funktionsfähig; keine Zelle der Pflichtmatrix ist dadurch bestanden und BL-023.1
bleibt in Arbeit.

## Historische, für Standalone supersedierte PDF.js-/Canvas-Pilotevidenz

GitHub-Actions-Lauf `32594467568` auf Commit `b622278` führte den exakt gelockten
Stack PDF.js 6.2.108 und `@napi-rs/canvas` 1.0.7 auf Windows x64, macOS x64, macOS
ARM64 und Linux x64 aus. Alle Plattformen bestanden lokale Byte-Eingabe,
Textextraktion, Seitenrendering, Erkennung einer eingebetteten JavaScript-Action und
die instrumentierte Prüfung mit null Netzwerkversuchen.

Dieser Nachweis bevorzugt den einfacheren portablen Stack für die nächste
Coverage-Prüfung, besteht aber noch keine Pflichtmatrix-Zelle. Anhänge, Formulare,
Annotationen, Verschlüsselung, Ressourcen-/Prozessisolation, Offline-OCR,
Angriffskorpus, NOTICE/SBOM sowie das echte Pluginpaket bleiben offen. PDF bleibt
deshalb `PDF_COVERAGE_UNVERIFIED`.

## Historische, für Standalone supersedierte Tesseract.js-/Canvas-Pilotevidenz

Der lokale Windows-x64-Pilot verwendet exakt Tesseract.js 7.0.0,
tesseract.js-core 7.0.0 und `@napi-rs/canvas` 1.0.7. Die offiziellen Modelle
`deu.traineddata` und `eng.traineddata` stammen aus dem aufgelösten
`tessdata_fast`-4.1.0-Commit `65727574dfcd264acbb0c3e07860e4e9e9b22185`;
Größe und SHA-256 werden vor jeder Verwendung geprüft. Der annotierte Tag-Objektwert
`a8ba5063ab8013372a20e300da0c97ee46b92b07` wird getrennt dokumentiert und nicht
fälschlich als Quell-Commit verwendet.

Eine synthetische deutsch-/englischsprachige Bildprobe bestand lokal mit 95 Prozent
mittlerer OCR-Konfidenz. Während der Erkennung blockierte ein von Haupt- und
Workerprozess geerbtes Preload-Modul HTTP, HTTPS, TCP, TLS, DNS und `fetch`; die
Modelle wurden ausschließlich aus dem lokalen, hashgeprüften Verzeichnis geladen.
GitHub-Actions-Lauf `32594838193` auf Commit `b6ce3ad` wiederholte diese Probe
erfolgreich auf Windows x64, macOS x64, macOS ARM64 und Linux x64. Alle vier
Artefakte melden 95 Prozent Konfidenz, lokale Modelle und gemischtsprachige OCR.
Auch dieser Pilot meldet `passed_gates: []`, `OCR_COVERAGE_UNVERIFIED` und
`release_decision: no_go`: Modellbündel/NOTICE, Sandbox und Ressourcenlimits,
Pixelredaktion, Scan-PDF-Integration, Angriffskorpus und echtes Pluginpaket fehlen.

GitHub-Actions-Lauf `32595199861` auf Commit `fcb55ed` ergänzte auf allen vier
Zielplattformen ein offizielles npm-CycloneDX-1.5-SBOM und eine strikte
Lieferkettenprüfung. Je Artefakt sind 25 gelockte Paketkomponenten, vollständige
Integritätswerte und nur Apache-2.0, MIT oder BSD-2-Clause belegt. Modellbytes und
die Apache-2.0-Modelllizenz wurden erneut gegen Commit, Größe und SHA-256 geprüft.
Die Pflichtzelle „Lizenzinventar und SBOM“ bleibt dennoch offen, bis vollständige
Notice-Texte, Schwachstellenrichtlinie und das wirklich auszuliefernde Runtime-/
Pluginpaket denselben Nachweis bestehen.

GitHub-Actions-Lauf `32595454727` auf Commit `fa34c91` belegt außerdem den
separaten OCR-Prozess auf Windows x64, macOS x64/ARM64 und Linux x64. Alle vier
Ziele bestanden Netzwerkverbot, 512-MiB-Node-Heap, 50-Sekunden-Wächter,
64-KiB-Ausgabegrenze sowie echte Timeout- und Ausgabeflut-Gegenproben. Windows
bestand über das vorhandene verifizierte Job Object zusätzlich 768 MiB RAM,
40 Sekunden CPU und 45 Sekunden Job-Laufzeit. Auf macOS/Linux fehlen weiterhin
native harte RAM-/CPU-Limits; außerdem ist der Pfad weder in das Runtime-Bundle noch
in eine frische Plugininstallation eingebunden. Die Ressourcen-/Prozesszelle bleibt
daher offen.

## Messprotokoll

Jede Zelle benötigt Plattform/Architektur, OS-Version, Compiler/SDK, Engine-Commit,
Buildargumente, Artefakthash, Paketgröße, Laufzeit- und Speicherwerte, Test-Corpus-ID,
Ergebnis und einen CI- oder manuellen Nachweis. Dokumentinhalte, Originalnamen und
Quellpfade gehören nicht in das Protokoll. Ein ausgelassener Test ist `offen`, nie
`bestanden`.

GO erfordert alle Zellen auf allen drei Plattformen sowie die positiven Coverage-
Abnahmen der späteren Stories BL-023.2 bis BL-023.4 und BL-024.1 bis BL-024.3. Ein
einzelnes NO-GO hält nur die betroffene Capability gesperrt; TXT/DOCX bleiben davon
unabhängig nutzbar.
