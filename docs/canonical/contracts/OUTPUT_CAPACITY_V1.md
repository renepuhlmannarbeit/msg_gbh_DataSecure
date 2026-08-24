# BL-011.6 – lokaler Kapazitätsvertrag V1

Dieser Vertrag schützt den seriellen DataSecure-Stapel vor einem späten lokalen
Speicherfehler, ohne eine neue fachliche Größen- oder Seitenobergrenze für die
Ausgabe einzuführen.

## Regeln

1. Aufnahme-Workspace, Auditbereich, `Output` und `Needs Visual Review` dürfen
   auf unterschiedlichen Volumes liegen. Jeder Pfad wird vor seinem jeweiligen
   Schreibvorgang separat anhand vertrauenswürdiger lokaler Dateisystemmetadaten
   geprüft.
2. Die Stapelaufnahme reserviert logisch mindestens `2 × Eingabegröße + 64 MiB`
   im Workspace. Das ist eine Kapazitätsprüfung, keine physische Reservierung und
   keine Garantie gegenüber anderen lokalen Prozessen.
3. Für `Output` und `Needs Visual Review` gibt es **keine erfundene globale Output-Grenze**:
   komprimierte Office-Inhalte können beim lokalen Extrahieren
   wachsen und Pakete bleiben aufbewahrt. Vor jedem tatsächlichen Schreiben wird
   stattdessen die zu schreibende, bereits bekannte Bytezahl plus fester
   Metadatenpuffer geprüft.
4. Liegen zwei Zielpfade auf demselben Volume, werden gleichzeitig ausstehende
   konkrete Schreibmengen addiert; auf getrennten Volumes wird jede konkrete
   Menge getrennt geprüft.
5. Fehlende, überlaufende oder widersprüchliche Dateisystemmetadaten sowie
   Platzmangel stoppen die betroffene Position vor Publish und Mapping. Bereits
   freigegebene Positionen bleiben unverändert; die Position ist nur nach
   ausdrücklicher Fortsetzung retryfähig.
6. Node-Dateisystemwerte beweisen keine physische Blockallokation. Daher bleiben
   Speicherreservierung und zwei Worker deaktiviert, bis native Windows-, macOS-
   und Linux-Nachweise vorliegen.

## Umsetzung und Nachweise

Der aktuelle E0-Kern `gateway/storage-capacity.js` verwendet ausschließlich
`statfsSync(..., { bigint: true })`, bindet den vorhandenen Zielordner vor und nach
der Prüfung an seine lokale Identität und gibt nur die festen Codes
`LOCAL_CAPACITY_UNAVAILABLE`, `LOCAL_CAPACITY_INSUFFICIENT` und
`LOCAL_CAPACITY_RACE` zurück. Review-Vorschau, Review-Metadaten, mögliche
Ausgabeanlagen, Markdown, Manifest und Paket-Audit werden unmittelbar vor dem
Schreiben geprüft; diese Codes sind im seriellen Batch retryfähig. Der zentrale
Audit-Spiegel erhält zusätzlich eine separate Vorprüfung unmittelbar vor Source-Move
und Publish. Ein späterer Allokationsverlust beim Spiegel zieht ein bereits
verifiziertes Paket nicht zurück: Der bestehende inhaltsfreie lokale Marker und die
Restart-Reconciliation führen die Spiegelung nachträglich fort. Der lokale
Mapping-Export prüft seine konkrete atomare Ersatzdatei ebenfalls vor dem Schreiben.
Schlägt er nach Paket-Publish fehl, bleibt das verifizierte Paket in einem privaten
`mapping_pending`-Zustand erhalten. Vor dem atomaren Ersatz der CSV wird zusätzlich
ein eng begrenzter lokaler Outbox-Eintrag unter `DataSecure-Export/.mapping-outbox`
angelegt; er enthält ausschließlich einen zufälligen Eintragsnamen, Dateibasename,
verifizierte Paket-ID und den Status `pending`. Bei einem Neustart wird nur für ein
noch manifest-verifiziertes Paket idempotent nachgetragen, danach der Eintrag gelöscht.
Eine Leseberechtigung entsteht erst nach erfolgreichem Mapping. Die versiegelte
Roh-Arbeitskopie wird nach dem dauerhaft geschriebenen Pending-Zustand sofort sicher
entfernt; für die Nachtragung werden nur der lokale Dateibasename und die verifizierte
Paket-ID benötigt. Der bestätigte lokale Diagnoseexport prüft seine konkrete
Ersatzdatei ebenfalls vor dem Schreiben und erhält bei Mangel den vorhandenen,
bereits vollständigen Support-Snapshot. Die Normalisierung eines echten `ENOSPC`
nach positivem Vorabcheck ist für Paket-Audit sowie die übrigen Vor-Publish-Pfade
abgedeckt; außerhalb dieser Pfade bleibt sie als getrennte Restarbeit offen.

Eine positive Vorprüfung ist keine Reservierung. Jeder anschließende
Vor-Publish-Schreibfehler `ENOSPC` für Markdown, Manifest, Review-Vorschau,
Review-Metadaten, mögliche Anlagen und Paket-Audit wird deshalb ausschließlich in
`LOCAL_CAPACITY_RACE` normalisiert und folgt dem bestehenden retryfähigen
Stopp-/Fortsetzungsweg. Beim zentralen Audit-Spiegel nach Veröffentlichung bleibt
das Paket dagegen maßgeblich; ein inhaltsfreier Marker erzwingt die lokale
Restart-Reconciliation. Nicht-Speicherfehler behalten ihre ursprüngliche
Sicherheitssemantik.

Die spätere Umsetzung nutzt ausschließlich lokale Dateisystemabfragen und gibt
weder freie Bytes, Pfade, Namen, Tokens noch Fehlerdetails über MCP, Audit oder
Diagnose aus. Pflichtfälle: getrennte/gleiche Volumes, fehlende Metadaten,
ein Byte zu wenig, `ENOSPC` nach Vorprüfung, Review- und Markdown-Schreibpfad,
Restart/Fortsetzung sowie die Unverändertheit von Mapping und bereits publizierten
Paketen.
