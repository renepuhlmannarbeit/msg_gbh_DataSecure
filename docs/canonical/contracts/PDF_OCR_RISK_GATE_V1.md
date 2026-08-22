# Gate: PDF- und OCR-Risikobeweis v1

Status: Nachweis offen · Story: BL-023.1 · Entscheidungen: DS-004, DS-007, DS-009,
DS-015, DS-016, DS-017, DS-018, DS-030, DS-034 und DS-037

Dieses Gate erlaubt noch keine PDF- oder Bildfreigabe. Es bündelt die vorhandene
PDFium-Entscheidung zu einer plattformübergreifenden, reproduzierbaren GO/NO-GO-
Prüfung. Bis jede Pflichtzelle positiv belegt ist, bleiben PDF, Scan-PDF und
eigenständige Bilder in Ist-Manifest, Picker, Skills und Marketplace gesperrt.

## Festgelegte technische Richtung

- PDFium bleibt die bevorzugte PDF-Engine; der Community-Binary-Spike ist nur
  Engineering-Evidenz und keine Produktabhängigkeit.
- OCR arbeitet vollständig offline und muss Deutsch, Englisch sowie gemischte
  Dokumente unterstützen.
- Tesseract 5.5.2 mit den offiziellen `tessdata_fast`-Modellen 4.1.0 für `deu`
  und `eng` ist der gepinnte OCR-Kandidat des Risikobeweises, noch keine
  Produktabhängigkeit. Engine und Modelle werden je Release aus offiziellen Quellen
  gebaut beziehungsweise unverändert gehasht und gemeinsam lizenziert inventarisiert.
- Parser/OCR erhalten ausschließlich begrenzte Bytes aus privaten Arbeitskopien,
  keine Quellpfade, Cloud-Credentials oder Netzwerkfähigkeit.
- Betriebssystemspezifische Worker sind zulässig; ihre normalisierten Ergebnisse und
  Fehlercodes müssen demselben Content-Graph-Vertrag folgen.
- Signatur, Notarisierung und Produktzertifizierung sind keine Freigabegates. Lizenz,
  SBOM, feste Quellrevisionen, Hashes und reproduzierbare Builds bleiben Pflicht.

## Pflichtmatrix

| Nachweis | Windows | macOS | Linux |
|---|---|---|---|
| eigener gepinnter PDFium-Build | offen | offen | offen |
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
