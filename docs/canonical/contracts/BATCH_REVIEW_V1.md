# Vertrag: gebündelte lokale Batch-Entscheidung v1

Status: durch [`BATCH_REVIEW_V2.md`](BATCH_REVIEW_V2.md) ersetzt; nur historische
Entwurfsbasis · Stories: BL-012.1 bis BL-012.3, BL-031.1, BL-032.1 ·
Entscheidungen: DS-013, DS-014, DS-020 bis DS-022, DS-028

## Ziel

Ein Stapel analysiert alle Dateien ohne fachlichen Dialog pro Datei. Erst danach
entscheidet ein einziger lokaler, tastaturbedienbarer Vorgang alle offenen
Zertifikats-/Organisationsfundstellen. Claude erhält weder Originale noch
Review-Entwürfe, Fundstellen, Entscheidungen oder lokale Dateizuordnungen.

## Nicht persistierte Reviewdaten

Der Batchjournalzustand darf ausschließlich `deferred_review`, feste technische
Checkpoints, aggregierte Zähler und einen festen Fehlercode führen. Er darf niemals
einen Original- oder Anonymisierungstext, Locator, Fundstellenwert, Entscheidung,
Pseudonym oder Entwurf enthalten.

Bei Start des Abschlussdialogs werden die noch versiegelten privaten Arbeitskopien
für genau diesen lokalen Vorgang erneut durch denselben Parser und dieselben
Erkennungsgates geführt. Der lokale UI-Prozess erhält die daraus abgeleiteten
Entwürfe ausschließlich über `stdin`; weder Prozessargumente, temporäre Dateien,
Umgebungsvariablen noch MCP-Antworten enthalten Dokumentinhalt.

Der lokale Entwurf verwendet nur die Anzeigegrenzen `Dokument 1` bis
`Dokument N`; Originalnamen und Pfade gehören nicht in die UI-Nutzlast. Jede
Fundstelle erhält für den lokalen Vorgang eine globale Entwurfskennung. Ihre
Rückzuordnung zur ursprünglichen Fundstellenkennung lebt nur im Speicher bis
zur Übernahme der Entscheidung. Freie Bereichsredaktionen sind bis zu einer
positionssicheren, dokumentgrenzenfesten Abbildung gesperrt; die
fundstellenbezogenen Aktionen Beibehalten und Anonymisieren bleiben davon
unberührt.

## Ablauf und Wiederaufnahme

1. Klare Dateien werden regulär freigegeben. Mehrdeutige Dateien werden als
   `deferred_review` ohne Ergebnis und ohne Mapping-Eintrag festgehalten.
2. Erst wenn keine normale Position mehr aussteht, kann ein lokaler
   Batch-Review-Vorgang beginnen. Ein Abbruch, Timeout oder Prozessfehler setzt
   keine Freigabe voraus und lässt alle noch offenen Positionen `deferred_review`.
3. Der lokale Vorgang entscheidet fundstellenbezogen. Eine Gruppierung darf nur
   nach nachweislich gleichem Fundstellentyp und identischem Kontext ausdrücklich
   gewählt werden; sie ist nie Voreinstellung.
4. Nach bestätigter lokaler Entscheidung werden nur die geprüften Positionen in
   demselben Vorgang veröffentlicht und lokal abgeschlossen. Eine Unterbrechung vor
   dem atomaren Paket-Commit lässt die Position vertagt; ein bereits verifiziertes
   Paket wird nach Neustart deterministisch übernommen. Claude erhält es erst später
   über den paginierten namenfreien Ergebnisplan; seine Auswertung ist keine
   Voraussetzung für den lokalen Stapelfortschritt.
5. „Später entscheiden“ ist jederzeit möglich und bleibt ein inhaltsfreier
   `deferred_review`-Zustand. Der normale Fortsetzungsweg darf keine vertagte
   Datei ohne lokale Reviewentscheidung automatisch freigeben.

## Ressourcen und Benutzeroberfläche

- Der Dialog verarbeitet höchstens 200 Batchpositionen. Er lädt und zeigt jeweils
  nur eine begrenzte aktuelle Fundstelle; Navigation und Fortschritt sind lokal.
- Windows, macOS und Linux bieten die semantisch gleichen Aktionen: beibehalten,
  anonymisieren, zurück/ändern, später entscheiden und abbrechen.
- Freie Bereichsredaktionen sind nur dort zulässig, wo der lokale UI-Vertrag sie
  positionssicher validiert. Sie sind keine Voraussetzung für die Zertifikats-
  entscheidung.
- Ohne funktionsfähige lokale UI oder bei unbekannter Plattform wird nichts
  veröffentlicht.

## Nachweise vor Freigabe

Die Implementierung muss mindestens belegen: keine Dialogunterbrechung während der
ersten Analysephase; keine Reviewdaten in Journal/MCP/Diagnose/Argumenten; Abbruch
und Vertagung ohne Freigabe; Wiedervorlage nach Neustart; atomare Einzelpakete bei
Teilabbruch; gleiches Aktionsvokabular auf Windows, macOS und Linux; Tastatur- und
Skalierungsprüfung auf allen Zielplattformen.
