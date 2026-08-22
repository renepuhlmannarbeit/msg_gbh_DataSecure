# Gate: PDF- und OCR-Risikobeweis v1

Status: Nachweis offen · Story: BL-023.1 · Entscheidungen: DS-004, DS-007, DS-009,
DS-015, DS-016, DS-017, DS-018, DS-030, DS-034 und DS-037

Dieses Gate erlaubt noch keine PDF- oder Bildfreigabe. Es bündelt die vorhandene
PDFium-Entscheidung zu einer plattformübergreifenden, reproduzierbaren GO/NO-GO-
Prüfung. Bis jede Pflichtzelle positiv belegt ist, bleiben PDF, Scan-PDF und
eigenständige Bilder in Ist-Manifest, Picker, Skills und Marketplace gesperrt.

## Festgelegte technische Richtung

- Unter DS-038 bleibt die endgültige PDF-Engine bis zum praktischen Vergleich offen.
  Mozilla PDF.js mit lokal gebündeltem Canvas ist der bevorzugte einfache
  Drei-Plattform-Pilot; PDFium bleibt der native Fallback. Der Community-Binary-Spike
  ist nur Engineering-Evidenz und keine Produktabhängigkeit.
- OCR arbeitet vollständig offline und muss Deutsch, Englisch sowie gemischte
  Dokumente unterstützen.
- Tesseract.js 7.0.0 mit tesseract.js-core 7.0.0, `@napi-rs/canvas` 1.0.7 und den
  offiziellen `tessdata_fast`-Modellen 4.1.0 für `deu` und `eng` ist der bevorzugte
  portable OCR-Pilot. Tesseract 5.5.2 bleibt nativer Fallback. Beides sind noch keine
  Produktabhängigkeiten. Engine und Modelle werden je Release aus offiziellen Quellen
  bezogen, exakt gelockt, unverändert gehasht und gemeinsam lizenziert inventarisiert.
- Parser/OCR erhalten ausschließlich begrenzte Bytes aus privaten Arbeitskopien,
  keine Quellpfade, Cloud-Credentials oder Netzwerkfähigkeit.
- Betriebssystemspezifische Worker sind zulässig; ihre normalisierten Ergebnisse und
  Fehlercodes müssen demselben Content-Graph-Vertrag folgen.
- Signatur, Notarisierung und Produktzertifizierung sind keine Freigabegates. Lizenz,
  SBOM, feste Quellrevisionen, Hashes und reproduzierbare Builds bleiben Pflicht.

## Pflichtmatrix

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

## PDF.js-/Canvas-Open-Source-Pilot

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

## Tesseract.js-/Canvas-Open-Source-Pilot

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
