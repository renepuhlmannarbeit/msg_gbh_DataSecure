# Vertrag: lokaler Batch-Nachweis v1

Status: verbindlicher Zielvertrag · Story: BL-040.3 · Entscheidung: DS-025

## Zweck und Speicherort

Nach Abschluss eines Stapels schreibt DataSecure unter
`DataSecure-Export/DataSecure-Batch-Nachweis.json` einen atomaren, ausschließlich
lokalen Nachweis. Er ist ein Transparenzartefakt, keine Freigabeautorität und besitzt
kein MCP-Lesewerkzeug.

## Strikt erlaubte Felder

Ein Eintrag besitzt ausschließlich: Schema, drei UTC-Zeitpunkte, Profil,
Bildbehandlungsmodus, fünf aggregierte Zähler, Ergebnis, Gateway-/Regel-/Policy-
Versionen, Snapshot-Vertragsversion, zwei feste Datenschutzwahrheitswerte und eine
Liste fester Fehlercodes. Der Reader verwirft unbekannte Felder, ungültige Zähler,
unzulässige Versionen und inkonsistente Ergebnisse.

Folgende Daten sind verboten: Original- und Ergebnisnamen, Pfade, Inhalte,
Textausschnitte, Rohwerte, Hashes, Pseudonyme, Paket- oder Batch-IDs sowie
Capabilities. Ein beschädigter älterer Nachweis blockiert nur dessen Fortschreibung;
er zieht kein bereits gültig freigegebenes Paket zurück.

## Lebenszyklus

Nur terminale Stapel schreiben einen Eintrag. Ein explizit fortsetzbarer Stapel
schreibt erst nach seiner tatsächlichen Endphase. Der Nachweis bleibt unabhängig von
der Aufbewahrung der Originale, Arbeitskopien und Ergebnisvorschauen lokal bestehen.
