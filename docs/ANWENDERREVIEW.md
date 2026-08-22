# Anwenderreview des DataSecure-Ablaufs

Stand: RC28 · Reviewziel: einfacher, verständlicher und sicher fortsetzbarer Ablauf
für eine oder mehrere lokale Dateien auf Windows, macOS und Linux.

## Zielbild

Der Anwender soll nur drei Dinge bewusst tun müssen:

1. Claude um lokale DataSecure-Verarbeitung bitten.
2. Im geöffneten `Input`-Ordner ausschließlich die gewünschten Dateien ablegen.
3. Im Chat bestätigen, dass diese Dateien bereitliegen.

Profilwahl, Reihenfolge und Paketlesen bleiben intern. Bilder bleiben ohne Rückfrage
lokal, sofern der Anwender ihre Entfernung oder Verwendung nicht ausdrücklich verlangt.

## Geprüfte Anwenderreisen

| Reise | Erwartetes Verhalten |
|---|---|
| Erststart | Status nennt Version, Bereitschaft und Anzahl im Eingang ohne Pfade oder Namen. |
| Eine Datei | Ordner öffnet sich, Bestätigung wird abgewartet, genau ein Verarbeitungsaufruf folgt. |
| Mehrere Dateien | Anzahl wird nach Bestätigung erneut geprüft; pro Datei folgt ein eigener kurzer Aufruf. |
| Gemischte Textformate | `auto` ordnet jede Datei intern ein; keine Klassifizierung pro Datei. |
| Reines Bild/Scan | Ein eindeutiger Zweck ist nötig; ohne Zweck stoppt nur diese Datei. |
| Personalprofil mit Bildern | Keine zusätzliche Standardfrage; Bilder bleiben lokal, Text kann freigegeben werden. |
| Ausdrückliche Bildentfernung | `remove_images=true`; unsichere Office-Objekte stoppen statt still erhalten zu bleiben. |
| Altbestand im Eingang | Nur die Anzahl wird gemeldet; vor Verarbeitung muss der aktuelle Bestand bestätigt werden. |
| Abweichende Anzahl | Keine Verarbeitung, bis der Anwender den Eingang korrigiert oder die erkannte Zahl bestätigt. |
| Stopp in Datei 1 | Kein automatischer Retry; Datei 2 bis N werden mit `skip_stopped` genau einmal versucht. |
| Teilerfolg | Claude nutzt nur Paket-IDs der erfolgreichen Einzelaufrufe und nennt exakte Zähler. |
| Chat-Anhang | Sicherer Stopp; die frühere Offenlegung wird nicht als rückgängig gemacht dargestellt. |
| PDF | Sicherer Stopp mit `PDF_COVERAGE_UNVERIFIED`; kein Upload als Umgehung. |
| Löschen | Umfang und Bestätigung bleiben ausdrücklich; Audit-Metadaten werden nicht mitgelöscht. |

## Im Review beseitigte Ablaufprobleme

1. **Stapel-Timeout:** Der öffentliche Komplettstapel belegte einen MCP-Aufruf für bis
   zu 25 Dateien. Er wurde aus der öffentlichen Werkzeugoberfläche entfernt. Der Skill
   nutzt jetzt einen Aufruf pro Datei.
2. **Wiederholungsschleife:** Eine gestoppte Datei bleibt sicher im Eingang und wäre
   erneut die nächste gewesen. `skip_stopped` überspringt bereits gestoppte Dateien im
   aktuellen Lauf, ohne sie zu löschen oder erneut zu versuchen.
3. **Unbemerkte Altbestände:** Status und Anzahl werden vor dem Öffnen und nach der
   Nutzerbestätigung geprüft. Abweichungen stoppen vor der Verarbeitung.
4. **Unnötige Bildfrage:** Für Personal-/Bewerbungsunterlagen ist lokales Zurückhalten
   jetzt der rückfragefreie Standard. Nur ein ausdrücklicher Wunsch ändert dies.
5. **Widersprüchliche Dialogtexte:** Anwender-, Betriebs- und Pilotdokumentation
   beschreiben jetzt den Input-Ordner als einzigen Standardweg. Der alte Companion-
   Dialog bleibt ein nicht öffentlich exponierter Engineeringpfad.
6. **Falsche PDF-Erwartung:** Die Marketplace-Beschreibung führt PDF nicht länger als
   unterstützt auf.
7. **Ungültige Skill-Metadaten:** Das nicht unterstützte `version`-Frontmatter wurde
   entfernt. Die Releaseversion stammt eindeutig aus dem Plugin-Manifest; beide Skills
   bestehen den Skill-Validator.

## Bewusst verbleibende Grenzen

- Ein echter Modell-/UI-Abnahmelauf mit installiertem RC28 bleibt erforderlich; die
  automatisierten Tests beweisen nicht, dass jede Claude-Version den Skill identisch
  ausführt.
- Mehrdeutige Zertifikats-/Organisationsstellen stoppen im Standardablauf. Ein einfacher,
  plattformneutraler lokaler Entscheidungsdialog ist noch nicht produktionsreif.
- PDF, Codesignatur, geschützter Installationspfad, Windows ARM64 sowie die vollständige
  visuelle macOS/Linux-Abnahme bleiben No-Go-Punkte für einen allgemeinen Rollout.
- Das Ergebnis ist De-Identifizierung/Pseudonymisierung, keine garantierte rechtliche
  Anonymität.

Die praktische Abnahme erfolgt mit synthetischen Dateien nach
[PILOT-ABNAHME.md](PILOT-ABNAHME.md).
