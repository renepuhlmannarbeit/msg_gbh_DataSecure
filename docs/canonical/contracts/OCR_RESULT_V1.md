# OCR-Ergebnisvertrag V1

Stand: 22.08.2026 · Story: BL-024.1 · Status: verbindlicher Engineering-Vertrag,
noch keine Produktfreigabe

## Zweck und Primärquelle

Alle OCR-Backends liefern innerhalb der lokalen Datenschutzgrenze dasselbe
maschinenlesbare Ergebnis `data-secure-ocr-result/v1`. Der erste Adapter nutzt
Tesseract.js 7.0.0. Dessen offizielle API verlangt seit Version 6, granulare
`blocks` ausdrücklich über `worker.recognize(..., {}, { blocks: true })`
anzufordern. Die offiziellen Typdefinitionen liefern Wörter mit `text`,
`confidence` und `bbox`; die offiziellen Tests belegen die Hierarchie
Block → Absatz → Zeile → Wort. Quellen:

- https://github.com/naptha/tesseract.js/blob/master/docs/api.md
- https://github.com/naptha/tesseract.js/blob/master/src/index.d.ts
- https://github.com/naptha/tesseract.js/blob/master/tests/recognize.test.mjs

Backend-Rohobjekte, Symbole, Alternativvorschläge und Engine-Fehlertexte werden nie
über die Adaptergrenze weitergereicht.

## Normalisiertes Ergebnis

Das Schema liegt in `ocr-result-v1.schema.json`. Es enthält genau:

- `status`: `recognized` oder `empty`;
- sortierte `languages`: `deu`, `eng` oder beide;
- Bildbreite und -höhe in Pixeln;
- NFKC-normalisierten Text mit LF-Zeilenenden;
- ganzzahlige mittlere Konfidenz von 0 bis 100;
- Wörter in Lesereihenfolge mit fortlaufendem Wort- und Zeilenindex,
  Konfidenz und ganzzahliger, halb offener Pixelbox `[x0,x1) × [y0,y1)`;
- ausschließlich feste Qualitätsgründe.

Koordinaten müssen innerhalb des gerasterten Bildes liegen und eine positive Fläche
besitzen. Ein Backendtext ohne positionierbare Wörter ist ungültig. Ein wirklich
leeres OCR-Ergebnis ist dagegen ein gültiges Engine-Ergebnis mit `status: empty` –
aber niemals der Nachweis, dass ein Bild keinen schützenswerten Inhalt besitzt.

## Konfidenz- und Freigaberegeln

1. Konfidenzen werden nur gerundet, nicht zum Entfernen schwacher Wörter verwendet.
2. Werte außerhalb 0 bis 100 oder nicht endliche Werte machen das Ergebnis ungültig.
3. Wörter unter 70 erzeugen `OCR_LOW_CONFIDENCE_PRESENT`. 70 ist eine versionierte,
   konservative Routinggrenze, keine Behauptung über inhaltliche Richtigkeit.
4. `OCR_EMPTY` und niedrige Konfidenz führen nie zu einer automatischen
   Datenschutzfreigabe.
5. Selbst 100 Prozent Konfidenz autorisieren keine Freigabe. Jeder OCR-Text durchläuft
   Entitäts- und Residualprüfung. Nichttextuelle Bildbedeutung bleibt unbewiesen;
   daher ist `requires_visual_review` in V1 immer `true`.
6. Der Vertrag und Diagnoseereignisse dürfen keine Rohwörter, Dateinamen, Pfade,
   Hashes oder Backend-Fehlertexte protokollieren.

## Ressourcenvertrag

Die bereits produktseitig geltenden kleineren Grenzwerte werden übernommen:

| Ressource | V1-Grenze | Verhalten |
|---|---:|---|
| Eingabebild | 25 MiB | `OCR_INPUT_LIMIT` |
| Dekodierte Pixel | 30.000.000 | `OCR_INPUT_LIMIT` |
| Ergebnistext | 5.000.000 Zeichen | `OCR_OUTPUT_LIMIT` |
| Wörter | 100.000 | `OCR_OUTPUT_LIMIT` |
| Worttext | 1.000 Zeichen | `OCR_RESULT_INVALID` |
| isolierte Standardausgabe | 32 MiB | `OCR_OUTPUT_LIMIT` |
| Node-Heap des Piloten | 512 MiB | Prozess wird beendet |
| Wächterzeit des Piloten | 50 Sekunden | `OCR_TIMEOUT` |

Es läuft höchstens ein OCR-Worker pro aktivem Verarbeitungsschritt. Die offizielle
Tesseract.js-Performance-Dokumentation warnt vor beliebig vielen parallelen Workern
wegen hohen Speicherverbrauchs:
https://github.com/naptha/tesseract.js/blob/master/docs/performance.md

Windows besitzt zusätzlich harte Job-Object-Grenzen. Der Engineering-Pilot enthält
einen kleinen POSIX-Supervisor: `RLIMIT_CPU` begrenzt CPU-Zeit; physischer Speicher
wird über Linux `/proc/<pid>/statm` beziehungsweise Apples `proc_pid_rusage`
überwacht und die gesamte Prozessgruppe bei Überschreitung beendet. Die Grundlagen
sind in der Linux-Manpage zu `setrlimit` und Apples XNU-Header/Manpage dokumentiert:

- https://man7.org/linux/man-pages/man2/getrlimit.2.html
- https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/resource.h
- https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/setrlimit.2.html

Lauf `32596426359` belegt die positiven und negativen Grenzen auf macOS x64/ARM64,
Linux x64 und zusätzlich Windows x64. Damit ist der V1-Ressourcenvertrag erfüllt;
die installationsfreie Auslieferung und Produktintegration bleiben Aufgabe von
BL-024.2.

## Stabile Fehlercodes

| Code | Bedeutung | Wiederholbar |
|---|---|---|
| `OCR_INPUT_INVALID` | Format oder Struktur unzulässig | nach Korrektur |
| `OCR_INPUT_LIMIT` | Byte- oder Pixelgrenze überschritten | nein |
| `OCR_MODEL_UNAVAILABLE` | lokales Sprachmodell fehlt | nach Reparatur |
| `OCR_MODEL_INTEGRITY_FAILED` | Modellprüfung fehlgeschlagen | nach Reparatur |
| `OCR_BACKEND_UNAVAILABLE` | gebündelte Runtime nicht startbar | nach Reparatur |
| `OCR_TIMEOUT` | Zeitgrenze erreicht | fortsetzbar |
| `OCR_RESOURCE_LIMIT` | Speicher- oder CPU-Grenze erreicht | fortsetzbar |
| `OCR_OUTPUT_LIMIT` | Text-, Wort- oder Prozessausgabe zu groß | nein |
| `OCR_RESULT_INVALID` | Backendausgabe verletzt V1 | fortsetzbar nach Reparatur |
| `OCR_NETWORK_POLICY_FAILED` | Offline-Grenze nicht belegbar | nach Reparatur |
| `OCR_CANCELLED` | Anwenderabbruch | fortsetzbar |

Fehlerantworten enthalten nur Code, Phase und zulässige Zähler. Technische
Ausnahmeobjekte werden lokal verworfen. Ein Fehler stoppt nur die betroffene Datei;
der fortsetzbare Stapelzustand richtet sich nach dem kanonischen Batchvertrag.

## Freigabegrenze

Der Vertrag ist durch Positiv- und Negativtests auf allen vier Zielarchitekturen
belegt. Er schaltet weder Bilder noch PDF frei. BL-024.2 muss Adapter,
Modelle und Runtime installationsfrei bündeln; BL-024.3 und BL-023.4 müssen danach
die vollständige visuelle Coverage nachweisen.
