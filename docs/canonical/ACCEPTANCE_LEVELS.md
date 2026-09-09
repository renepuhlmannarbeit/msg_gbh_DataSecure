# N3/N4-Abnahmevertrag

Stand: 09.09.2026 · gilt für Cowork-Plugin und Standalone

Dieser Vertrag ergänzt die bestehende Evidence-Skala. Er ersetzt weder die
automatisierte E0-Evidence noch die produktbezogenen UAT-Testfälle.

## N3 – technische Zielhost-Abnahme

N3 belegt, dass **genau ein festgeschriebener Kandidat** auf einem konkreten
Zielrechner installierbar und technisch lauffähig ist. Ein N3-Protokoll bindet:

- vollständigen Git-Commit, Produktversion, Paketname und SHA-256;
- Produkt, Installationskanal, Betriebssystemversion und CPU-Architektur;
- Fresh Install, echten Start, Produkt-/Core-Kommunikation und Diagnosezugriff;
- Format-, Datei-/Ordner-, Ergebnis-, Mapping-, Abbruch-/Fortsetzungs- und
  Offline-/Netzwerkgrenzen des jeweiligen Produkts;
- versionsneuen 200-Dateien-Lauf, die vereinbarte 500-MiB-Grenzprüfung sowie
  Update, Rollback und Entfernen ohne Veränderung von Quellen oder Exporten;
- `PASS`, `FAIL` oder `BLOCKED` je Fall. `BLOCKED` ist kein Nachweis.

N3 entspricht der noch fehlenden realen E1-Zielhost-/Installationsevidence. Ein
CI-Runner, ein Quellbuild oder ein Smoke ohne sichtbare Installation ist E0 und
kann N3 nicht ersetzen.

## N4 – formale Anwender- und Freigabeabnahme

N4 beginnt erst, wenn N3 für denselben Kandidaten auf dem betreffenden Zielhost
vollständig bestanden ist. N4 belegt die beobachtete Nutzung und Freigabe:

- alle Fälle des zutreffenden Cowork- beziehungsweise Standalone-UAT-Kits;
- verständlicher Normalweg ohne technische Hilfe oder unnötige Bestätigungen;
- Tastatur, Fokus, 200-%-Zoom und Screenreader;
- fachlich richtige Erhaltung und Ersetzung, korrekte Ergebnis- und
  Zuordnungsdarstellung sowie verständliche Fehler- und Extraktionshinweise;
- Datenschutz-, Security-, Architektur- und Betriebsgrenzen;
- dokumentierte Defects und eine gemeinsame Entscheidung `GO`, `NO-GO` oder
  `BLOCKED`.

N4 umfasst damit die menschliche E2-Anwendungs-/Accessibility-Evidence und die
für die Freigabe tatsächlich benannten E3-Fachrollen. Zwei Betriebssystemläufe
dürfen gemeinsam entschieden, aber niemals zu einem einzigen undifferenzierten
Protokoll zusammengezogen werden.

## Zwei Personen, ein Repository

Beide Personen testen denselben unveränderlichen Commit und die daraus gebauten
zielsystemspezifischen Pakete. Die Windows-Person schreibt ausschließlich in
eine Windows-Evidenzdatei auf `uat/windows-<kampagne>`, die Mac-Person
ausschließlich in eine macOS-Evidenzdatei auf `uat/macos-<kampagne>`. Produktcode
und Testdaten werden während der Kampagne nicht verändert. Die Ergebnisse werden
erst nach Gegenprüfung in `main` übernommen.

Ein einzelner Mac belegt nur seine tatsächlich dokumentierte Architektur. Ein
Apple-Silicon-Lauf ist kein Intel-Lauf und umgekehrt; Rosetta ersetzt keine
zweite native Architekturabnahme.

Der ausführbare Ablauf, Vorlagen und GO-Regeln stehen im
[formalen UAT-Kit](../acceptance/FORMAL_UAT/README.md).
