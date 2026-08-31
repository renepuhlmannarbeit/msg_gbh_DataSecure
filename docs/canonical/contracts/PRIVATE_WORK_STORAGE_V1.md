# Vertrag: lokale Plain-Arbeitskopien v1

Stand: 31.08.2026 · RC81 · DS-065 · BL-011.13

## Umfang

Neue Snapshots und Reviewkopien liegen als normale lokale Dateien vor, ohne
zusätzliche Verschlüsselung, Keyring, Schlüsseldatei oder Passwort. „Privat“
bedeutet lokal und nicht zur Modellverarbeitung freigegeben. Dateien sind für das
Benutzerkonto und andere Prozesse mit passenden Dateirechten lesbar. Originale
werden ausschließlich gelesen, niemals verändert, verschoben oder gelöscht.

`private-work-store.js` schreibt neue Dateien exklusiv und prüft beim Lesen
Dateityp, Identität und Größenlimit. Kopie und Journal behalten ihre vorhandenen
Integritäts-/Durabilityregeln. SHA-256 ist Integritätsprüfung, keine Verschlüsselung.
Es gibt keinen Secret-Store-Fallback und keine Schlüsselbundinitialisierung.

## Versionierung und Wiederaufnahme

- Neues Batchschema: `datasecure-batch/4`.
- Snapshot-Item: `private_artifact_plain: true`; kein
  `private_artifact_encrypted`-Feld. Plainbytes werden nicht unter `.dsart` abgelegt.
- Reviewmetadaten: `schema_version: 2`, `preview_storage: local-plain`,
  `preview_encrypted: false`; lokale Preview bleibt ein geprüftes PNG.
- Status: `private_work_storage: local-plain`, `private_work_encryption: false`.
- Neue Plain-Stapel sind anhand ihrer lokalen Checkpoints fortsetzbar. Bereits
  veröffentlichte Dateien werden nicht erneut verarbeitet. Ausnahme: ausdrücklich
  konfigurierte Aufbewahrung von 0 Tagen (siehe Lebensdauer).
- Geprüfte V2-Plain-Snapshots können ohne Neukopie nach V4 übernommen werden.
  Fehlende oder widersprüchliche Storage-Metadaten sind keine Erlaubnis, Bytes
  ungeprüft als Plain zu behandeln.

## Verschlüsselte Altbestände

V3-Stapel, `.dsart`-Dateien und erkannte `DSARTF01`-Envelopebytes werden nicht als
Plain interpretiert. Sie und zugehörige Metadaten bleiben unverändert; keine
Entschlüsselung, Migration verschlüsselter Daten, Keyringabfrage oder Löschung
durch die Umstellung oder automatische Retention. Die Oberfläche weist auf die
erneute Auswahl der unveränderten Originaldatei hin. Auch eine umbenannte
verschlüsselte Datei wird nicht zum Plain-Ergebnis.

## Lebensdauer und Ausgabe

Erfolgreiche neue Rohkopien werden entfernt, offene neue Rohkopien spätestens
nach 14 Tagen. Neue Reviewkopien folgen der konfigurierten Frist. Originale,
Mapping und dauerhafte Exporte unterliegen keiner automatischen Löschung.
Claude erhält ausschließlich freigegebenes anonymisiertes Markdown, keine
privaten Snapshots, Previewpixel, Originalnamen oder Rohwerte. Bestehende
Format-, Anonymisierungs- und Release-Gates bleiben unverändert.

RC81: Bei ausdrücklich konfigurierten **0 Tagen** läuft ein aktiver Stapel bis
zum Ende seiner Operation weiter. Dann werden offene Arbeitskopien beendet und
bereinigt; auch vertagte Prüfungen sind damit nicht fortsetzbar und benötigen
eine erneute Originalauswahl. Fertige Ergebnisse bleiben verfügbar. Das Journal
behält für ihre Auffindbarkeit das normale Zeitfenster, nicht die Rohkopien.

Vor dem ersten Kopieren wird ein kleiner dauerhafter `.intake`-Besitznachweis
geschrieben. Bei fehlendem Journal können spätere Recovery-Läufe abgelaufene
Rückstände eines beendeten Prozesses gezielt bereinigen. Unbekannte, ausgetauschte
oder verlinkte Bereiche bleiben unangetastet; es wird kein Rohtext protokolliert.
Der Schutz alter verschlüsselter Dateien gilt auch an der terminalen
Einzeldatei-Löschgrenze und für umbenannte Envelopebytes.

## Nachweise

RC80-Baseline: Store18, Retention24, Gateway-E2E40, MCP37 und gemischte Fortsetzung PASS.
Vollständige lokale `test:ci` inklusive Pre-/Posttests sowie ZIP-/MCPB-Build und
Artefaktprüfung PASS; keine nativen Keyringmodule in den Produktarchiven.
Native Keyring-Smoke- und zusätzliche Engineering-Keyring-Kombinationstests sind
wegen Scopewechsel obsolet, nicht bestanden. Normale Stapel-/Fortsetzungs- und
echte Cowork-Abnahme bleiben erforderlich. Dieser Speicherwechsel aktiviert
weder weitere Dateiformate noch neustartfeste stapelweite Pseudonyme (BL-030.2).
