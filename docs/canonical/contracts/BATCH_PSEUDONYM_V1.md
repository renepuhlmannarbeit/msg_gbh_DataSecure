# Vertrag: fortsetzbare stapelweite Pseudonyme v1

Status: verbindlicher Zielvertrag · Story: BL-030.1 · Entscheidungen: DS-011,
DS-012, DS-019, DS-020 und DS-021

## Ziel und Aussagegrenze

Gleich erkannte Personen beziehungsweise Organisationen erhalten innerhalb eines
Stapelauftrags denselben Platzhalter, auch nach Programm- oder Rechnerneustart.
Zwischen Stapeln entsteht absichtlich keine stabile Verknüpfung. Eine persistente
Tabelle aus Rohwert und Platzhalter ist verboten.

## Ableitung

- Beim Snapshot-Commit entsteht ein kryptografisch zufälliger 256-Bit-`batch_secret`.
- Der Secret wird im betriebssystemspezifischen Benutzerschutz gespeichert: Windows
  DPAPI, macOS Keychain und Linux Secret Service. Ist der Schutz nicht verfügbar,
  darf ein fortsetzbarer Auftrag nicht starten; Klartext-Fallback ist verboten.
- Die Entitätsauflösung erzeugt aus Typ, versionierter Normalform und kanonischer
  Entitätsidentität einen UTF-8-Ableitungswert. Aliasauflösung findet vor der
  Pseudonymbildung statt.
- Der sichtbare Bezeichner wird deterministisch aus
  `HMAC-SHA-256(batch_secret, ruleset_version || entity_type || canonical_value)`
  abgeleitet und als typisierter, kollisionsgeprüfter Base32-Wert ausgegeben, zum
  Beispiel `[PERSON_7K4M2Q]`. Rohwert und Normalform werden nicht persistiert.
- Eine Kollision innerhalb eines Stapels wird mit einer versionierten Domänentrennung
  deterministisch verlängert. Ein stilles Zusammenführen zweier Entitäten ist
  verboten.

## Lebenszyklus und Datenschutz

Der geschützte Secret gehört zum privaten Snapshot, ist niemals Teil von Mapping,
Ergebnis, Audit, Diagnose oder MCP-Antwort und wird nach Abschluss des Stapels sofort
gelöscht. Für pausierte oder fortsetzbare Aufträge gilt dieselbe maximale Frist von
14 Tagen wie für Arbeitskopien. Nach Verlust oder abgelaufener Löschung des Secrets
wird nicht mit neuen Pseudonymen weitergearbeitet; die offene Datei erhält einen
festen terminalen Fehlercode.

Die deterministische Ableitung ist Pseudonymisierung, keine rechtliche Anonymisierung.
Wer Secret und Kandidatenwerte besitzt, kann Zuordnungen testen. Deshalb gelten
Secret und Arbeitskopien als besonders schützenswerter lokaler Auftragszustand.

## Versions- und Wiederaufnahmeregel

Snapshot und Ergebnis speichern nur `pseudonym_contract_version` und
`ruleset_version`. Eine begonnene Charge bleibt auf diesen Versionen fixiert. Ein
Plugin-Update darf sie nur fortsetzen, wenn ein explizit getesteter kompatibler Leser
vorliegt; andernfalls bleibt sie pausiert und bietet Rückrolle oder kontrollierten
Neustart an. Bereits freigegebene Dateien werden nie erneut pseudonymisiert.

## Verpflichtende Gegenproben

Tests müssen gleiche Entitäten über mehrere Dateien und Neustarts, unterschiedliche
Stapel, Aliasformen, Unicode-Normalisierung, Typtrennung, künstliche Kollisionen,
Secret-Verlust, Ablauf nach 14 Tagen, Rollback sowie die Abwesenheit von Rohwerten in
Snapshot, Journal, Export, Diagnose und MCP-Ausgaben belegen.

