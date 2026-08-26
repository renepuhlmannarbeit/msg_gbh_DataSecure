# Vertrag: Dokumentergebnisgrade V1

Stand: 26.08.2026 · Paketbindung RC60 · Journal-/Mappingbindung RC61 · Entscheidung DS-045

## Zweck

Jede Quelle darf öffentlich nur eines von genau drei Ergebnissen erhalten. Interne
Verarbeitungszustände wie `candidate`, `released`, `stopped`, `deferred`, `retry`
oder `timeout` sind keine Ergebnisgrade. Ein Ergebnisgrad entsteht ausschließlich
aus deterministischen, bereits geprüften lokalen Signalen; weder Skill noch Modell
dürfen ihn frei formulieren.

## Die drei Grade

| Interner Wert | Deutsche Anzeige | Bedingung |
|---|---|---|
| `complete` | Vollständig verarbeitet | Inhalt und alle visuellen Bestandteile sind vollständig geprüft; keine Auslassung und keine Parserwarnung. |
| `usable-with-omissions` | Verwendbar mit ausdrücklich benannten Auslassungen | Ausschließlich erlaubte, gezählte Auslassungen liegen vor. |
| `not-processed` | Sicher nicht verarbeitet | Es wurde kein freigegebenes Paket erzeugt; ein fester inhaltsfreier Fehlercode benennt den Grund. |

Für den mittleren Grad sind in V1 nur diese Auslassungen erlaubt:

- `IMAGES_REMOVED_BY_REQUEST`
- `VISUAL_ASSETS_WITHHELD_LOCALLY`

Parserwarnungen, unbekannte Coverage, aktive Inhalte, verschlüsselte Quellen,
Residual-Gate-Fehler oder sonstige Unsicherheit sind niemals erlaubte Auslassungen.
Sie stoppen die Freigabe.

## Paketbindung

Neue Pakete verwenden `eu-privacy-package/3` und enthalten ein exakt validiertes
`document_result` nach `datasecure-document-result/1`. Der Grad wird vor der
atomaren Veröffentlichung aus den Manifest-Signalen abgeleitet. Ein gespeicherter
Grad, der diesen Signalen widerspricht, macht das Paket ungültig.

`visual_assets_withheld_at_release` hält die Anzahl lokal zurückgehaltener Grafiken
zum Veröffentlichungszeitpunkt unveränderlich fest. Eine spätere menschliche lokale
Freigabe darf das Paket ergänzen, aber den ursprünglichen Grad nicht rückwirkend
von `usable-with-omissions` auf `complete` ändern.

Historische `eu-privacy-package/2`-Pakete bleiben ausschließlich lesekompatibel.
Ihnen wird kein Ergebnisgrad nachträglich unterstellt.

## Dauerhafte Journal- und Mappingbindung

Neue Stapel verwenden `datasecure-batch/2`. Ein positiver Grad ist ausschließlich
für `mapping_pending`, `delivery_pending` oder `released` zusammen mit einer
verifizierten Paket-ID zulässig. `not-processed` ist ausschließlich an einen
terminalen Stopp und denselben festen Grundcode gebunden. Offene, vertagte und
wiederholbare Zustände besitzen keinen Ergebnisgrad. Historische V1-Journale
bleiben lesbar; ihnen wird kein Grad hinzugefügt.

Die lokale Zuordnung verwendet sechs Spalten: Originaldatei, anonymisiertes
Ergebnis, deutsche Ergebnisgradanzeige, gezählte Auslassungen, Grundcode und
Hinweis. Der Mapping-Outbox-Eintrag bindet einen positiven Grad unveränderlich an
das verifizierte V3-Paket. Wiederanlauf vergleicht Paket, Journal und Outbox erneut;
Widersprüche bleiben lokal ausstehend. Historische CSV-/Outbox-V1-Einträge werden
lesbar migriert und ausdrücklich als ohne verfügbaren Ergebnisgrad bezeichnet.

## Noch nicht Teil dieses E0-Schnitts

Die Projektion der Grade in Evidence/Receipt, Stapelabschluss, Results-/Progress-
Fassaden und Cowork-Anzeige folgt in getrennten Schnitten. Echte Zielsystem- und
Security-Abnahmen (E1/E3) bleiben ebenfalls erforderlich.
