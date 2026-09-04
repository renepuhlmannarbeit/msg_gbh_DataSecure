# PDFium Engineering-Spike – Abnahmeevidenz

Stand: 21.08.2026 · RC21 · **keine PDF-Produktfreigabe**

## Ergebnis

Der separat aufrufbare Windows-x64-Spike bestätigt, dass ein nativer PDFium-Worker
grundsätzlich in den bestehenden Job-Object-Pfad passt. Er rechtfertigt noch keine
PDF-Unterstützung im Produkt. `PDF_COVERAGE_UNVERIFIED` bleibt deshalb unverändert vor
jedem Produktparser aktiv; Picker, Skills, Capabilities, ZIP, MCPB und Produkt-SBOM
enthalten weder Worker noch PDFium-Binärdateien.

Der feste Engineering-Befehl lautet:

```powershell
npm run pdfium:spike
```

Der normale Build, Plugin-Start und Testlauf laden nichts aus dem Netz. Nur dieser
explizite Entwicklerbefehl lädt das gepinnte Evaluationsartefakt in ein kurzlebiges
Temp-Verzeichnis und löscht es anschließend.

Der manuell ausgelöste Workflow `.github/workflows/pdfium-spike.yml` wiederholt diese
Prüfung auf einem frischen GitHub-Windows-Runner, analysiert die kompilierte Probe mit
CodeQL und belegt erneut, dass beide Produktarchive den Spike nicht enthalten. Er ist
absichtlich kein automatischer Produkt-Buildpfad.

## Gepinnte Eingaben

| Nachweis | Wert |
| --- | --- |
| Distribution | `bblanchon/pdfium-binaries`, Tag `chromium/8009` |
| Distributor-Commit | `83e48f560bd8088c649a50ee202a0db78fbc98ea` |
| offizieller PDFium-Branch-Head | `acf52a0b01420c97ed1005ae171edd63bd4701bd` |
| Version | `153.0.8009.0` |
| Asset | `pdfium-win-x64.tgz`, 3.768.924 Bytes |
| Asset-SHA-256 | `c78a8cd51b48abafcb266d868e401afefda1d189aa01ebbe743dc1d144e06031` |
| DLL | 7.261.184 Bytes |
| DLL-SHA-256 | `3aabcd60cec7c2bae8e40d63110b6b53dfe657015f268496fdf9ef9460cbe4d5` |

Die Distribution ist ausdrücklich nicht mit Google oder Foxit verbunden. Die
GitHub-Attestation bindet den Asset-Digest an den Distributor-Workflow, beweist aber
nicht, dass die Binärdatei reproduzierbar genau aus dem genannten offiziellen
PDFium-Commit entstand. Genau deshalb bleibt sie ein Evaluationsartefakt.

## Positiv belegte Spike-Gates

- HTTPS-Redirect-Allowlist, feste Größe und SHA-256 vor Extraktion;
- GitHub-Attestation mit Repository, Workflow, Commit, Ref, Invocation und Asset-Digest;
- offizieller Branch-Head und Distributor-Tag entsprechen der Lockdatei;
- Archivliste, vollständiges Dateimanifest, Dateizahl und Gesamtgröße sind gepinnt;
- absolute Pfade, `..`, doppelte Einträge, Links und Sonderobjekte werden abgelehnt;
- `args.gn` und `VERSION` sind vollständig gehasht; V8, XFA, Debug und Component-Build
  sind aus;
- Lizenzinventar ist vorhanden; PE ist AMD64 und besitzt ASLR, NX, CFG, High Entropy
  und CET; Imports und benötigte Exporte entsprechen einer Allowlist;
- die Probe liest ausschließlich begrenzte Bytes über Standard-Input und läuft als
  einziges Kind des vorhandenen nativen Job-Object-Launchers;
- Standard-Output enthält nur feste Codes und Zähler, nie extrahierten Text, Namen,
  Pfade oder Dokument-Hashes;
- synthetische Kontrolle: ein einfaches Text-PDF wird als Kandidat erkannt; Path,
  Annotation, JavaScript und beschädigtes PDF stoppen mit festen Codes.

## Verbleibende Produktblocker

1. eigener gepinnter und reproduzierbarer Build aus offizieller PDFium-Quelle;
2. bevorzugt statisch gebundene Einzel-EXE statt implizit vor `main` geladener
   Community-DLL;
3. lückenlose öffentliche API-Abdeckung für Catalog/Page-Tree, sämtliche Actions,
   AcroForm/Portfolio, Encryption, Object-/XRef-Streams und Form-XObjects;
4. Type0/CID-, ToUnicode-/Differences-, fehlende-Unicode-, Verschlüsselungs-, Bomben-
   und reale Word-/LibreOffice-/Browser-Gegenproben;
5. AppContainer ohne Capabilities sowie belegte Netz-, Profil-, Temp-, Registry-,
   Font- und Prozessgrenzen;
6. Fuzz-/Sanitizer-Gates, CVE-Abgleich, separate Spike-SBOM und vollständiger Abgleich
   des Lizenzinventars gegen `DEPS`/`third_party`;
7. interne Open-Source-/Legal-Freigabe, frische Windows-VM und unabhängiges
   Security-Review.

Kann eine relevante PDF-Kategorie nicht positiv ausgeschlossen werden, bleibt das
Ergebnis `API_COVERAGE_GAP` beziehungsweise das übergeordnete
`PDF_COVERAGE_UNVERIFIED`. „Nicht gefunden“ gilt niemals als Beleg für „nicht
vorhanden“.

## Entscheidung

- **Go:** weiterer synthetischer Engineering-Spike und eigener PDFium-Build.
- **No-Go:** Community-DLL im Produkt, echte/fremde PDFs, Manifest-/Picker-Freigabe
  oder Behauptung von PDF-Unterstützung.

Damit bleibt die Bedienung für Anwender unverändert: unterstützte Dateien verwenden
den bestehenden Einzel-/Mehrdateiweg; PDF nennt weiterhin nur sichere Alternativen.
