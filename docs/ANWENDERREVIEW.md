# Anwenderreview des DataSecure-Ablaufs

> **Ist-Review RC30:** Diese Datei dokumentiert den heute getesteten Ablauf. Das
> verbindliche Ziel nach dem Produkt-Grill steht unter
> [canonical/PRODUCT.md](canonical/PRODUCT.md).

Stand: RC30 · Reviewziel: einfacher, verständlicher und technisch gebundener Ablauf
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
| Gemischte Dokumentarten | `auto` ordnet TXT/Markdown/CSV/DOCX intern ein; weitere Formate bleiben im Pilot gesperrt. |
| Reines Bild/Scan | Stoppt im beaufsichtigten Pilot mit `FORMAT_COVERAGE_UNVERIFIED`. |
| Personalprofil mit Bildern | Keine zusätzliche Standardfrage; Bilder bleiben lokal, Text kann freigegeben werden. |
| Nur Markdown / Bilder nicht im Ergebnis | `remove_images=false`; Bildpixel werden ohnehin nie freigegeben, Grafiken bleiben lokal und sicher erkannter Bildtext kann erhalten bleiben. |
| Lokale Bildanlagen ausdrücklich verwerfen | `remove_images=true`; Bildtext wird nicht übernommen, unsichere Office-Objekte stoppen statt still erhalten zu bleiben. |
| Altbestand im Eingang | Nur die Anzahl wird gemeldet; vor Verarbeitung muss der aktuelle Bestand bestätigt werden. |
| Abweichende Anzahl | Keine Verarbeitung, bis der Anwender den Eingang korrigiert oder die erkannte Zahl bestätigt. |
| Stopp in Datei 1 | Der Server markiert den Stopp; Datei 2 bis N werden genau einmal versucht. |
| Teilerfolg | Claude nutzt nur Paket-IDs der erfolgreichen Einzelaufrufe und nennt exakte Zähler. |
| Chat-Anhang | Sicherer Stopp; die frühere Offenlegung wird nicht als rückgängig gemacht dargestellt. |
| PDF | Sicherer Stopp mit `PDF_COVERAGE_UNVERIFIED`; kein Upload als Umgehung. |
| Löschen | Umfang und Bestätigung bleiben ausdrücklich; Audit-Metadaten werden nicht mitgelöscht. |

## Im Review beseitigte Ablaufprobleme

1. **Stapel-Timeout:** Der öffentliche Komplettstapel belegte einen MCP-Aufruf für bis
   zu 25 Dateien. Er wurde aus der öffentlichen Werkzeugoberfläche entfernt. Der Skill
   nutzt jetzt einen Aufruf pro Datei.
2. **Wiederholungsschleife:** Eine gestoppte Datei bleibt als versiegelte private
   Arbeitskopie fortsetzbar. Die Originaldatei bleibt unverändert im Eingang. Eine
   serverseitige Batch-Sitzung verwaltet Fortschritt und Stopps, ohne modellseitige
   Queue-Position oder automatische Wiederholung.
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
8. **Automatischer Skill-Aufruf:** Der Hauptskill bleibt absichtlich per natürlicher
   Sprache aufrufbar und setzt daher nicht `disable-model-invocation: true`. Das ist
   eine bewusste Bedienentscheidung: Dateiauswahl, Stapelbestätigung, Bildentfernung
   und Löschung bleiben trotzdem durch lokale beziehungsweise ausdrückliche
   Bestätigungsschranken geschützt. Fehlt `privacy_status`, stoppt der Ablauf ohne
   Dateizugriff.

## Zweites Expertenreview und Hardening

Das anschließende UX-, Datenschutz-, Security-, QA- und Architekturreview führte zu
folgenden technischen Änderungen:

1. Verwaiste `.processing_*`-Claims werden beim Start ohne Überschreiben, Symlinkfolge
   oder stille Wiederholung wiederhergestellt. Cancellation und Shutdown sind kooperativ.
2. Der Standardordner liegt im lokalen App-Datenbereich; bekannte Cloud-Sync- und
   Netzwerkpfade blockieren die Verarbeitung.
3. `begin_document_batch` bindet 1 bis 100 bestätigte TXT-/Markdown-/CSV-/DOCX-Dateien mit zusammen höchstens 500 MB lokal an einen Snapshot.
   Eine Bestandsänderung invalidiert ihn.
4. Paket-IDs sind keine Leseberechtigung. Jeder Erfolg liefert ein paketgebundenes,
   15 Minuten gültiges RAM-Token; historische Pakete sind nicht global auflistbar.
5. Der Pilot ist auf UTF-8-TXT, Markdown (`.md`), CSV und vollständig abgedeckte DOCX begrenzt. CSV-Zellen bleiben rein textuell und werden nie ausgeführt. Jede
   Parserwarnung und jedes andere Format stoppt fail-closed.
6. Bildpixel bleiben profilunabhängig lokal. Die Namensregeln decken zusätzlich
   beschriftete griechische, kyrillische und CJK-Namen sowie begrenzte CJK-Profilköpfe ab.

## Bewusst verbleibende Grenzen

- Ein echter Modell-/UI-Abnahmelauf mit installiertem RC30 bleibt erforderlich; die
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
