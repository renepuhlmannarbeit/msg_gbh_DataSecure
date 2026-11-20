# CSV-Quellvertrag V1

Status: **Engineering-Vertrag, Release-Gate geschlossen** · Story: BL-021.2

CSV wird lokal als strukturierte, inerte Textquelle gelesen und ausschließlich als
Markdown-Tabelle ausgegeben; die CSV-Quellinhalte werden dabei nicht als neue
Tabellenkalkulation ausgegeben und Formeln nicht ausgeführt. Vertrauliche
CSV-/XLSX-Zuordnungsbeilagen eines Standalone-Anonymisierungslaufs sind davon
getrennte, ausdrücklich gebundene Ergebnisrollen.

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

### Standalone-Contentprojektion · Reviewkorrektur 27.10.2026

Konvertierung und private Anonymisierungsprojektion verwenden dieselbe reine
Breitenvalidierung für die bereits geparsten Records. Ein einzelnes leeres Feld
darf als erhaltener Leerrecord eine kleinere Breite besitzen. Das behauptet keine
physische Leerzeile: Ein gequotetes leeres Feld hat dieselbe geparste Darstellung.
Andere ungleiche Breiten bleiben ein Fehler. Formelwerte werden nicht ausgeführt.

Die reine Markdown-Konvertierung erhält weiterhin sämtliche Records unter
neutralen Positionsüberschriften. Für die private Content-Anonymisierung wird
nur der erste Record mit einem nichtleeren Wert auf bekannte vollständige
Feldbezeichnungen geprüft. Eine solche Bezeichnung gilt ausschließlich für ihre
eigene Spalte; unbekannte Nachbarwerte bleiben Daten unter einer neutralen
Positionsüberschrift. Nur ein ausschließlich aus bekannten Bezeichnungen und
leeren Feldern bestehender Record kann vollständig in die Kopfzeile wechseln.
Personennamen, freie Texte und persönliche Zusätze an Feldbezeichnungen sind
keine solche Metadatenfreigabe. Eine weiterhin erkennbare Feldpflicht darf dabei
nicht verloren gehen: Ein privat qualifizierter geschützter Header erhält den
festen Besitzer `Geschützter Tabellenwert`; sein Originaltext bleibt als
geschützte Datenzelle erhalten. Dieselbe Pflicht schützt alle folgenden Werte
dieser Spalte. Unbekannte Nachbarspalten erwerben dadurch keine Feldrolle.
Leere Records und alle übrigen Daten bleiben
erhalten. Die vorhandenen Ressourcen-, Struktur- und Veröffentlichungsgates
gelten weiterhin; Quelltext allein ersetzt keine Windows-/Mac-Desktopabnahme.

Papa Parse 5.5.3 (MIT, feste Lockfile-Integrität) dient ausschließlich als
Test-Differentialreferenz für Dialekte, Quote- und Formeltests. Es wird nicht in
das Plugin eingebettet: Die Paketfreigabe verlangt eine minimierte, überprüfbare
lokale Angriffsfläche ohne generische Download-/Worker-/Stream-Optionen. Der
180-Fall-Vergleich ist grün; er umfasst nur eindeutig markierte Dialekte, weil
unquotierte konkurrierende Trennzeichen fachlich mehrdeutig bleiben und im
Produktparser fail-closed stoppen. Die aktive CSV-Allowlist bleibt auf den lokalen
Textpfad begrenzt; die praktische Drei-OS-Abnahme ist weiterhin offen.

## Primärquellen

- [RFC 4180](https://www.rfc-editor.org/info/rfc4180/)
- [Papa Parse](https://github.com/mholt/PapaParse)
- [Papa Parse Formula Escaping](https://github.com/mholt/PapaParse/blob/master/docs/docs.html)
