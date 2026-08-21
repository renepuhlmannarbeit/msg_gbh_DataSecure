# Review-Auftrag für Claude — DataSecure 3.2.0 RC8

Bitte den aktuellen Stand auf `main` unabhängig prüfen. Keine Produktivdaten
verwenden; ausschließlich die synthetischen Repository-Fixtures.

## Änderungen

- Geschäftliche Projektzeiträume bleiben vollständig erhalten; nur ausdrücklich
  als Geburtsdatum bezeichnete Daten werden entfernt.
- PNG, JPEG und BMP sind eigenständige Inputs und laufen durch den lokalen
  Visual-/OCR-Gate. Reine Bild-/Scan-Eingaben verlangen fail-closed ein
  ausdrücklich gewähltes Profil, weil `auto` vor OCR nicht sicher klassifizieren
  kann.
- Scan-PDFs ohne Textlayer laufen über denselben Gate, wenn JPEG-Seitenbilder
  sicher extrahiert werden können; andere Scans stoppen fail-closed.
- `npm run test:golden` funktioniert jetzt unter Windows und POSIX.
- Ein reproduzierbarer PII-Shield-2.2.0-Vergleich mit 20 Inhaltsprüfungen liegt
  unter `docs/PII_SHIELD_BENCHMARK.md` und `scripts/benchmark-pii-shield.mjs`.
- Die reale Windows-OCR-/Redaktionsprüfung ist über
  `npm run test:windows-visual` wiederholbar.

## Bitte besonders challengen

1. Können Bild- oder Scan-PDF-Bytes irgendeinen Pfad zum Modell umgehen?
2. Wird bei OCR-Ausfall, unleserlichem Bild, ungültigem JPEG/BMP oder zweitem
   OCR-Fehler immer sicher zurückgehalten?
3. Bleiben geschäftliche Daten/Zeiträume unverändert, während beschriftete
   Geburtsdaten weiterhin verschwinden?
4. Ist die Scan-PDF-Erkennung gegen beschädigte, falsche oder übergroße
   DCT-Streams ausreichend begrenzt?
5. Sind README, Skills, Manifest, Anleitung, Release- und Sicherheitsmodell
   konsistent mit der Runtime?
6. Ist der PII-Shield-Vergleich fair, reproduzierbar und frei von Aussagen, die
   die Messung nicht belegt?

## Verifikation

```powershell
npm test
npm run test:golden
npm run test:windows-visual
npm run build
git diff --check
```

`npm run benchmark:pii-shield` benötigt den separat und unverändert gebauten
PII-Shield-Upstream sowie dessen lokales GLiNER-Modell; Pfade und Commit sind im
Benchmark-Dokument festgehalten.

Bitte Findings nach Schweregrad mit Datei und Zeile melden. Wenn keine Findings
vorliegen, ausdrücklich „keine Findings“ sagen und verbleibende Restrisiken
nennen. Keine Änderungen direkt auf `main` pushen; stattdessen einen neuen
Auftrag oder einen Review-Bericht unter `tasks/` ablegen.
