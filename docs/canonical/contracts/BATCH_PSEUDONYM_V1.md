# Vertrag: fortsetzbare stapelweite Pseudonyme v1

Status: **E0 implementiert** · Story: BL-030.2 · Entscheidungen: DS-011,
DS-012, DS-019, DS-020, DS-021, DS-059 und DS-065

## Ziel und Aussagegrenze

Dieselbe erkannte Person oder Organisation erhält innerhalb eines Stapels denselben
Platzhalter – auch nach Prozess- oder Rechnerneustart. Zwischen Stapeln entsteht
absichtlich keine stabile Verknüpfung. Das ist Pseudonymisierung beziehungsweise
De-Identifizierung, keine rechtlich garantierte Anonymisierung.

Der Produktpfad verwendet **keinen** Windows-Schlüsselbund, keine macOS-Keychain,
kein Keyfile, kein Passwort und keine zusätzliche Verschlüsselung. Der für die
Fortsetzung erforderliche Kontext liegt ausschließlich im ohnehin privaten lokalen
DataSecure-Journal. Frühere Keyring-Verträge sind historische, nicht produktive
Entwürfe.

## Persistierter Zustand

Beim Snapshot-Commit entstehen:

- `pseudonym_contract_version = batch-pseudonym/v1`,
- eine feste `pseudonym_ruleset_version`,
- ein kryptografisch zufälliger 256-Bit-`pseudonym_seed`,
- optional eine Registry aus HMAC-Aliasbindungen und
  Platzhalter/Kollisions-Digests.

Rohwerte, normalisierte Namen, Aliastexte und Originalfundstellen dürfen nie in
Journal, Mapping, Audit, Diagnose oder MCP-Antwort geschrieben werden. Die
persistierten Registry-Schlüssel sind HMAC-SHA-256-Werte; sie erlauben die
Fortsetzung, aber kein Zurückrechnen des Rohwerts ohne Kandidatenprüfung und Seed.

## Ableitung und Aliasregel

Der Platzhalter wird deterministisch aus der versionierten Normalform abgeleitet:

`HMAC-SHA-256(seed, ruleset || entity_type || canonical_value)`

Die Ausgabe ist typisiert und Base32-kodiert, zum Beispiel
`[PERSON_7K4M2Q9X4P]`. Personen, Organisationen, Kunden und Projekte verwenden
getrennte Domänen. Kollisionen werden deterministisch verlängert; zwei Entitäten
dürfen nie still zusammengeführt werden.

Aliasformen werden vor dem nächsten Dokument als HMAC-Bindung persistiert. Teilt
sich mehr als eine Person denselben Nachnamen, erhält dieser mehrdeutige Alias einen
eigenen stabilen Platzhalter und wird keinem Vollnamen nachträglich neu zugeordnet.
Statische fachliche Arbeitgebermarker wie `[ARBEITGEBER_001]` bleiben absichtlich
nur aktionslokal und werden nicht als Rohwertbindung persistiert.

## Laufzeit- und Fehlergrenze

Während genau einer begrenzten Verarbeitung darf eine flüchtige Rohwert-Aliasmap im
Speicher existieren. Vor einer Dokumentveröffentlichung wird ihr rohwertfreier
Registryzustand dauerhaft ins Journal geschrieben. Danach – auch bei Parser-,
Publikations- oder Persistenzfehler – werden Registry und Seedkopie verworfen.

Fehlende, teilweise, manipulierte, übergroße oder inkompatible Zustände stoppen
fail-closed. Maximal 10.000 Bindungen und 10.000 Kollisionsreservierungen sind
zulässig; das gesamte Journal ist zusätzlich auf 2 MiB begrenzt. Bereits
veröffentlichte Dateien werden bei einer Fortsetzung nicht erneut verarbeitet.

## Lebenszyklus

Seed und HMAC-Bindungen bleiben nur so lange erhalten wie das private lokale
Stapeljournal: bis Abschluss und kontrollierter Bereinigung, ausdrücklichem
Verwerfen/Purge oder Ablauf der konfigurierten Frist von 0 bis 14 Tagen. Eine
„sichere physische Löschung“ auf SSD, synchronisierten Dateisystemen oder Backups
wird nicht versprochen. Quellen und fertige Exporte sind niemals Ziel dieser
automatischen Bereinigung.

## Verpflichtende Gegenproben

Automatisierte Tests belegen:

- gleiche Entität und Aliasformen über mehrere Registry-Instanzen/Neustarts,
- unterschiedliche Stapel, Typtrennung, Unicode-Normalisierung und Kollisionen,
- geteilte Nachnamen ohne Rebinding,
- manipulierte, inkompatible und übergroße Zustände fail-closed,
- dauerhaftes Pre-Publish-Checkpointing,
- Cleanup auch bei Aktions- oder Persistenzfehlern,
- keine Rohwerte im serialisierten Zustand.

Echte Windows-/macOS-Crash-, Neustart- und Cowork-Fortsetzung bleiben E1/E2-
Abnahme und sind keine weitere Keyring-Aufgabe.
