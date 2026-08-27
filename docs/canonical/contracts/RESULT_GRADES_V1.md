# Vertrag: Dokumentergebnisgrade V1

Stand: 27.08.2026 · Paketbindung RC60 · Journal-/Mappingbindung RC61 · Evidence-/Receipt-Bindung RC62 · Projektion RC63/RC65 · Entscheidung DS-045

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

## Dauerhafte Evidence- und Receipt-Bindung

Neue lokale Batch-Nachweise verwenden `datasecure-batch-evidence/3`. Sie enthalten
ausschließlich aggregierte Zähler für `complete`, `usable-with-omissions`,
`not-processed` und – nur für historische oder noch nicht terminale Zustände –
`unavailable`. Zwei weitere Zähler erfassen ausschließlich die erlaubten
Auslassungscodes. Vor dem Export wird jeder positive Grad erneut gegen das
verifizierte V3-Paket geprüft. Der Nachweis enthält weiterhin keine Namen, Pfade,
Paket-/Batch-IDs, Hashes, Fähigkeiten oder Rohwerte.

Freigegebene Pakete verwenden `data-secure-audit-receipt/4`. Das Receipt trägt
exakt denselben positiven `document_result` wie das verifizierte V3-Manifest.
`not-processed` erzeugt ohne Paket kein Audit-Receipt. Historische Audit- und
Evidence-Stände bleiben ohne nachträglich unterstellten Grad lesbar.

Reason-Codes stammen aus einem endlichen, inhaltsfreien Katalog. Unbekannte
interne Codes werden vor einer terminalen Persistierung zu `INTERNAL_FAILURE`
vergröbert; dokumentabgeleitete oder frei formulierte Werte sind unzulässig.

## Progress-, Results-, Abschluss- und Cowork-Projektion

RC63 verwendet eine einzige, fail-closed Projektionsschicht. RC65 konkretisiert
die erneute Paketbindung ohne wiederholtes Voll-Hashing: Bei der terminalen
Evidence-Erzeugung wird jedes freigegebene V3-Paket einmal vollständig geprüft.
Unmittelbar davor und danach werden die exakten Dateisystemidentitäten von
`manifest.json` und `<package_id>.md` mit BigInt-`dev`, -`ino`, -`size` und
-`mtimeMs` erfasst. Nur stabile Identitäten werden im privaten Checkpoint
gespeichert. Vor jeder späteren öffentlichen Zählung werden dieselben beiden
Dateien mit genau zwei Metadatenzugriffen je Paket erneut gebunden. Fehlen,
Linkstatus, ungültige oder geänderte Identität ergeben `unavailable` und
`grades_verified: false`; der Fortschritt liest oder hasht den Dokumentinhalt
nicht erneut.

Die privaten Identitätswerte gelangen weder in Batch-Nachweis oder Audit-Receipt
noch in Diagnose, Mapping, MCP-Antwort oder Handoff. Progress und der vorhandene
lokale Abschlussdialog zeigen ausschließlich
Zähler für `complete`, `usable-with-omissions`, `not-processed` und `unavailable`
sowie die zwei erlaubten visuellen Auslassungsarten. Laufende Zustände und
Altbestände bleiben `unavailable`; aus `released` oder `stopped` wird kein Grad
erfunden.

Die Results-Fassade gibt einen positiven Grad erst nach exakter Journal-/Paket-
Übereinstimmung zusammen mit der kurzlebigen Leseberechtigung frei. Der normale
Cowork-Handoff hält Paket-IDs, Fähigkeiten, Cursor, Namen und Pfade im lokalen
Server. Er liefert die anonymisierten Markdown-Fragmente mit dem verifizierten
positiven Grad und zeigt die aggregierte Stapelübersicht genau auf der ersten
Seite. `not-processed` erzeugt kein Dokument. Acknowledgements öffnen keinen
zweiten Abschlussdialog; dessen einziger Owner ist der lokale Worker.

Echte Zielsystem-, Accessibility- und Security-Abnahmen (E1/E3) bleiben weiterhin
erforderlich.
