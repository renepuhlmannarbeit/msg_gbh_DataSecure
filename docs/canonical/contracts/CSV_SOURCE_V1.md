# CSV-Quellvertrag V1

Status: **Engineering-Vertrag, Release-Gate geschlossen** · Story: BL-021.2

CSV wird lokal als strukturierte, inerte Textquelle gelesen und ausschließlich als
Markdown-Tabelle ausgegeben. DataSecure erzeugt weder CSV noch XLSX als Ergebnis und
führt keine Formeln aus.

## Parservertrag

- Die UTF-8-, BOM-, Unicode- und Steuerzeichenregeln aus `TEXT_SOURCE_V1.md`
  gelten unverändert.
- RFC-4180-Quotes, doppelte Anführungszeichen und Zeilenumbrüche innerhalb
  gequoteter Felder werden strukturerhaltend verarbeitet.
- Komma, Semikolon und Tab werden nur bei konsistenter Spaltenzahl erkannt.
  Gleichstände, kaputte Quotes, ungleiche Zeilenbreiten und leere Tabellen stoppen
  mit inhaltsfreien Fehlercodes.
- Leere oder doppelte Kopfzeilen erhalten nur eine sichtbare stabile Darstellung;
  Zellenwerte bleiben fachlich erhalten. Zeilenumbrüche werden als sichtbares
  `<br>` in Markdown repräsentiert.
- Formelähnliche Werte (`=`, `+`, `-`, `@`, Tab/CR) bleiben Text. Da weder CSV
  noch Spreadsheet ausgegeben wird, gibt es keine Formelausführung im Produktpfad.
- Die resultierende Tabelle erhält die vollständige Content-Graph-V1-Abdeckung
  und danach dieselbe Anonymisierung wie TXT/DOCX.

## Wiederverwendung und Gate

Papa Parse ist ein gepflegter, abhängigkeitsfreier MIT-Kandidat und dient als
Differentialreferenz für Dialekte, Quote- und Formeltests. Es wird zunächst nicht
eingebettet: Die Paketfreigabe verlangt eine minimierte, überprüfbare lokale
Angriffsfläche ohne generische Download-/Worker-/Stream-Optionen. Erst wenn der
Differentialtest gegen eine gepinnte Papa-Parse-Version, End-to-End-Stapel-, Paket-,
Skill- und Drei-OS-Abnahme grün sind, darf `.csv` in die Ist-Allowlist.

## Primärquellen

- [RFC 4180](https://www.rfc-editor.org/info/rfc4180/)
- [Papa Parse](https://github.com/mholt/PapaParse)
- [Papa Parse Formula Escaping](https://github.com/mholt/PapaParse/blob/master/docs/docs.html)
