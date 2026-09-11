# Formale Freigabeentscheidung

Kampagne: _noch einzutragen_

Kandidat (vollständiger Commit): _noch einzutragen_

Produktversion: _noch einzutragen_

## Plattformurteile

| Zielhost / Produkt | N3 | N4 | Offene P0/P1 | Urteil |
|---|---|---|---|---|
| Windows x64 / Standalone | NOT_RUN | NOT_RUN | – | BLOCKED |
| Windows x64 / Cowork-Plugin | NOT_RUN | NOT_RUN | – | BLOCKED |
| macOS tatsächliche Architektur / Standalone | NOT_RUN | NOT_RUN | – | BLOCKED |
| macOS tatsächliche Architektur / Cowork-Plugin | NOT_RUN | NOT_RUN | – | BLOCKED |

## Gemeinsames Urteil

`GO`, `NO-GO` oder `BLOCKED`: **BLOCKED – Kampagne noch nicht durchgeführt**

Cowork-Modellabnahme 41×3: **NOT_RUN**

Cowork-Kandidatensmoke 12×3: **NOT_RUN**

Gebundene Korpus-Hashes geprüft: **NOT_RUN**

GO ist nur zulässig, wenn alle als Releaseumfang markierten Zeilen N3 und N4
`PASS` sind, keine offenen P0/P1-Defects bestehen und Commit sowie Paket-Hashes
mit dem Kampagnenmanifest übereinstimmen. Für Cowork müssen außerdem beide
Modellgates `PASS` sein und die geprüften Korpus-Hashes mit dem Manifest
übereinstimmen. Ein einzelner Mac gibt nur die dort
wirklich getestete Architektur frei.

Windows-Tester / Datum UTC: _noch einzutragen_

Mac-Tester / Datum UTC: _noch einzutragen_

Release-Koordination / Datum UTC: _noch einzutragen_

Die Namen dienen der internen Verantwortlichkeit. Keine Signaturen, E-Mail-
Adressen oder anderen personenbezogenen Angaben in ein öffentliches Repository
übernehmen.
