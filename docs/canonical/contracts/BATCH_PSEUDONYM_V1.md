# Vertrag: fortsetzbare stapelweite Pseudonyme v1 und Standalone v2

Status: **E0 implementiert** · Story: BL-030.2 · Entscheidungen: DS-011,
DS-012, DS-019, DS-020, DS-021, DS-059, DS-065 und DS-084

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

Im v1-Vertrag ist die Ausgabe typisiert und Base32-kodiert, zum Beispiel
`[PERSON_7K4M2Q9X4P]`. Personen, Organisationen, Kunden und Projekte verwenden
getrennte Domänen. Kollisionen werden deterministisch verlängert; zwei Entitäten
dürfen nie still zusammengeführt werden.

Aliasformen werden vor dem nächsten Dokument als HMAC-Bindung persistiert. Teilt
sich mehr als eine Person denselben Nachnamen, erhält dieser mehrdeutige Alias einen
eigenen stabilen Platzhalter und wird keinem Vollnamen nachträglich neu zugeordnet.
Der statische v1-Arbeitgebermarker `[ARBEITGEBER_001]` bleibt eine Rollenanzeige,
keine eindeutige Unternehmensidentität. Seit RC107 werden die nachgewiesene
vollständige Firmenidentität und ihre Rollenanzeige getrennt über HMAC-Domänen
gebunden. Weder der Rollenmarker noch ein öffentlicher UNKLAR-Marker wird als
Identitätsreservierung verwendet. Unterschiedliche Rechtsformen mit derselben
Kurzform werden nicht zusammengeführt.

### Wiedererkennen ohne erneutes Namensfeld

Eine neue Registry pro Dokument prüft bereits bekannte Personen-/Firmenaliase
auch im freien Folgetext durch exakte HMAC-Mitgliedschaft. Sie erfindet dabei
keine Entität und persistiert keine Rohtexte. Zulässige Aliasformen einschließlich
Klammern, Bindestrichen, Apostrophen und `&` werden vollständig als begrenzte
Kandidaten geprüft. Neue Personen-/Firmenaliase sind auf 160 normalisierte Zeichen
begrenzt; Überschreitung stoppt ausdrücklich mit `TEXT_TOO_LARGE`. Bestehende
HMAC-only Altjournale liefern keinen rückwirkenden Nachweis beliebig langer
früherer Rohformen. Die allgemeine Textressourcengrenze bleibt zusätzlich aktiv.

Neue vollständige Zustände enthalten optional `known_alias_index` mit Schema
`datasecure-known-alias-index/1`: nur HMACs der Anfangstokens und eine an alle
aktuellen Bindings gebundene HMAC-Attestation. Damit entfallen bei normalen
Folgetexten die meisten erfolglosen Fensterprüfungen. Ein alter Zustand ohne
Index oder eine nicht passende Attestation nutzt den vollständigen begrenzten
Abgleich; ein strukturell ungültiger Index wird abgewiesen. Es gibt keinen
unkontrollierten Klartext-Prefixindex und keine neue Anwenderbestätigung.

Rollback-Grenze: Alte Programmstände, deren Journalvertrag ausschließlich
`bindings,labels` akzeptiert, lehnen den erweiterten Zustand ab. Ein laufender
RC107-Stapel darf daher nicht als rückwärtskompatibel zu diesen Ständen
bezeichnet werden. Bestehende zweifeldrige Journale bleiben vorwärts lesbar.

### Neue Standalone-Stapel: v2

Neue Standalone-Stapel wählen `batch-pseudonym/v2`. Ihre rohwertfreien
HMAC-Bindungen reservieren statt einer sichtbaren Digestfolge lesbare Kennungen
wie `[PERSON_001]`, `[UNTERNEHMEN_001]` und `[PROJEKT_001]`. Organisation, Kunde
und Arbeitgeber teilen denselben Unternehmensnummernraum. Verschiedene
Arbeitgeber erhalten verschiedene Kennungen; dieselbe Firma in unterschiedlichen
Rollen behält ihre Kennung. Mehrdeutige Aliasbindungen erhalten einen eigenen
`_UNKLAR`-Platzhalter statt einer stillen Vollnamenzuordnung.

Nummern werden vor jeder Veröffentlichung mit dem Registryzustand dauerhaft
reserviert. Fortsetzung rekonstruiert den Nummernstand aus den gespeicherten
Labels; es wird nie nachträglich umnummeriert. Der Erstauftritt bestimmt die
Kennung, nicht eine Bedeutung oder Reihenfolge zwischen Kunden. Gleiche Nummern
in verschiedenen Stapeln beweisen keine gemeinsame Identität. Die Namenserkennung
ist keine vollständige Entitätsauflösung; verschiedene reale Personen mit
identischer Schreibweise sowie nicht erkannte Firmennamenvarianten bleiben
eine fachliche Aussagegrenze.

Plugin-Stapel sowie bereits vorhandene v1-Standalone-Stapel bleiben v1, auch
nach Neustart. Ein Restore ändert den Vertrag nicht anhand des aktuellen Produkts.
Gemeinsam korrigiert sind der genaue Abgleich bekannter Bindungen im Folgetext
und das Wiederbefüllen des flüchtigen Wörterbuchs bei einem Treffer. Ein Test
mit derselben In-Memory-Registry genügt nicht: Die Pflichtregression baut zwischen
den Dokumenten den Registryzustand über Journal/JSON neu auf.

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
