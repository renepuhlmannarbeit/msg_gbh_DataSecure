# Anwenderreview des DataSecure-Ablaufs

> **Ist-Review RC34:** Diese Datei dokumentiert den heute implementierten Ablauf. Das
> verbindliche Ziel nach dem Produkt-Grill steht unter
> [canonical/PRODUCT.md](canonical/PRODUCT.md).

Stand: RC34 · Reviewziel: einfacher, verständlicher und technisch gebundener Ablauf
für eine oder mehrere lokale Dateien auf Windows, macOS und Linux.

## Zielbild

Der Anwender soll nur drei Dinge bewusst tun müssen:

1. In einer lokalen Cowork-Desktop-Sitzung *„Dateien anonymisieren“* schreiben.
2. Die gewünschten Dateien im einmal geöffneten Betriebssystem-Mehrfachpicker wählen.
3. Mit **„Öffnen“** genau einmal bestätigen.

Profilwahl, Reihenfolge und Paketlesen bleiben intern. Bilder bleiben ohne Rückfrage
lokal, sofern der Anwender ihre Entfernung oder Verwendung nicht ausdrücklich verlangt.

## Geprüfte Anwenderreisen

| Reise | Erwartetes Verhalten |
|---|---|
| Erststart | Der lokale Mehrfachpicker erscheint direkt; Abbrechen beendet ohne Wiederöffnung oder Verarbeitung. |
| Eine Datei | Picker öffnet sich, **Öffnen** bestätigt einmal, danach läuft die lokale Verarbeitung unabhängig vom Chat. |
| Mehrere Dateien | Der Picker bindet die Auswahl lokal; ein Hintergrundprozessor arbeitet den versiegelten Stapel ab. |
| Gemischte Dokumentarten | `auto` ordnet TXT/Markdown/CSV/DOCX intern ein; weitere Formate bleiben im Pilot gesperrt. |
| Reines Bild/Scan | Stoppt im beaufsichtigten Pilot mit `FORMAT_COVERAGE_UNVERIFIED`. |
| Personalprofil mit Bildern | Keine zusätzliche Standardfrage; Bilder bleiben lokal, Text kann freigegeben werden. |
| Nur Markdown / Bilder nicht im Ergebnis | `remove_images=false`; Bildpixel werden ohnehin nie freigegeben, Grafiken bleiben lokal und sicher erkannter Bildtext kann erhalten bleiben. |
| Lokale Bildanlagen ausdrücklich verwerfen | `remove_images=true`; Bildtext wird nicht übernommen, unsichere Office-Objekte stoppen statt still erhalten zu bleiben. |
| Technischer Altbestand | Der Normalweg öffnet `Input` nicht; ein offener Stapel bietet nur Fortsetzen, Verwerfen oder Nichts tun an. |
| Abweichende/ungültige Auswahl | Keine Verarbeitung; der Anwender kann den Picker auf ausdrücklichen Wunsch neu starten. |
| Stopp in Datei 1 | Der Server markiert den Stopp; Datei 2 bis N werden genau einmal versucht. |
| Teilerfolg | Claude erhält nur eine namenfreie, begrenzte Ergebnisliste und nennt exakte Zähler. |
| Chat-Anhang | Sicherer Stopp; die frühere Offenlegung wird nicht als rückgängig gemacht dargestellt. |
| PDF | Sicherer Stopp mit `PDF_COVERAGE_UNVERIFIED`; kein Upload als Umgehung. |
| Löschen | Umfang und Bestätigung bleiben ausdrücklich; Audit-Metadaten werden nicht mitgelöscht. |

## Im Review beseitigte Ablaufprobleme

1. **Stapel-Timeout und Modellaufruf-Flut:** Der Startaufruf kehrt sofort zurück; ein
   getrennter lokaler Prozessor arbeitet bis zum nächsten sicheren End-/Reviewzustand.
   Claude liest anschließend höchstens fünf namenfreie Ergebnisse pro Seite und nur
   den für die Aufgabe benötigten Inhalt.
2. **Wiederholungsschleife:** Eine gestoppte Datei bleibt als versiegelte private
   Arbeitskopie fortsetzbar. Die Originaldatei bleibt an ihrer Quelle unverändert. Eine
   serverseitige Batch-Sitzung verwaltet Fortschritt und Stopps, ohne modellseitige
   Queue-Position oder automatische Wiederholung.
3. **Unbemerkte Altbestände:** Der Picker-Normalweg mischt keine technische Inbox
   hinein. Ein vorhandener offener Stapel stoppt eine neue Auswahl und verlangt eine
   ausdrückliche Fortsetzen-/Verwerfenentscheidung.
4. **Unnötige Bildfrage:** Für Personal-/Bewerbungsunterlagen ist lokales Zurückhalten
   jetzt der rückfragefreie Standard. Nur ein ausdrücklicher Wunsch ändert dies.
5. **Quellenschutz:** Der Mehrfachpicker ist der Standardweg. Er liest Quellen nur
   lesend und erzeugt private Arbeitskopien. Der `Input`-Ordner ist ausschließlich
   eine DataSecure-eigene technische Inbox; externe oder SharePoint-Quellen dürfen
   dort nie eingebunden werden.
6. **Falsche PDF-Erwartung:** Die Marketplace-Beschreibung führt PDF nicht länger als
   unterstützt auf.
7. **Ungültige Skill-Metadaten:** Das nicht unterstützte `version`-Frontmatter wurde
   entfernt. Die Releaseversion stammt eindeutig aus dem Plugin-Manifest; beide Skills
   bestehen den Skill-Validator.
8. **Automatischer Skill-Aufruf:** Der Hauptskill bleibt absichtlich per natürlicher
   Sprache aufrufbar und setzt daher nicht `disable-model-invocation: true`. Das ist
   eine bewusste Bedienentscheidung: Dateiauswahl, Stapelbestätigung, Bildentfernung
   und Löschung bleiben trotzdem durch lokale beziehungsweise ausdrückliche
   Bestätigungsschranken geschützt. Ist `data-secure-local` in der aktuellen lokalen
   Cowork-Sitzung nicht verbunden, darf kein Upload- oder Fremdwerkzeug als Ersatz dienen.

9. **Klare Hostgrenze:** Ein sichtbarer Skill oder ein installiertes Plugin ist kein
   Nachweis lokaler Ausführung. Originale dürfen ausschließlich in einer lokalen
   Claude-Desktop-/Cowork-Sitzung mit verbundenem MCP verarbeitet werden. Cloud-Cowork,
   Web, Mobil und geplante Cloud-Aufgaben dürfen nur bereits lokal freigegebene
   Ergebnisse erhalten.

10. **Kleine Normaloberfläche:** Standardmäßig sind genau acht Werkzeuge sichtbar:
    Picker, lokale Ergebnisübergabe und deren Abbruch/Fortsetzung, offene Stapel
    fortsetzen/verwerfen, Privacy-Ordner konfigurieren und Exportordner öffnen.
    Die Fortsetzung startet bei Bedarf selbst eine getrennte lokale Fachprüfung;
    ein tokenbasierter Review-Aufruf bleibt Support. Die vollständigen 28 Werkzeuge sind nur im bewusst aktivierten
    IT-Supportmodus sichtbar.

## Zweites Expertenreview und Hardening

Das anschließende UX-, Datenschutz-, Security-, QA- und Architekturreview führte zu
folgenden technischen Änderungen:

1. Verwaiste `.processing_*`-Claims werden beim Start ohne Überschreiben, Symlinkfolge
   oder stille Wiederholung wiederhergestellt. Cancellation und Shutdown sind kooperativ.
2. Der Standardordner liegt im lokalen App-Datenbereich; bekannte Cloud-Sync- und
   Netzwerkpfade blockieren die Verarbeitung.
3. Der Picker-Normalweg bindet 1 bis 100 bestätigte TXT-/Markdown-/CSV-/DOCX-Dateien
   mit zusammen höchstens 500 MiB lokal an einen Snapshot. Zusätzlich prüft der
   Picker vor dem Hintergrundlauf TXT/Markdown bis 8.000.000 Bytes, CSV bis
   1.500.000 Bytes und DOCX bis 64 MiB komprimiert/128 MiB entpackt. Es gibt keine
   feste Seitenbegrenzung. `begin_document_batch`
   bleibt der entsprechende technische Inbox-Vertrag im IT-Supportmodus.
4. Paket-IDs sind keine Leseberechtigung. Jeder Erfolg liefert ein paketgebundenes,
   15 Minuten gültiges RAM-Token; historische Pakete sind nicht global auflistbar.
5. Der Pilot ist auf UTF-8-TXT, Markdown (`.md`), CSV und vollständig abgedeckte DOCX begrenzt. CSV-Zellen bleiben rein textuell und werden nie ausgeführt. Jede
   Parserwarnung und jedes andere Format stoppt fail-closed.
6. Bildpixel bleiben profilunabhängig lokal. Die Namensregeln decken zusätzlich
   beschriftete griechische, kyrillische und CJK-Namen sowie begrenzte CJK-Profilköpfe ab.

## Bewusst verbleibende Grenzen

- Ein echter Modell-/UI-Abnahmelauf mit installiertem RC34 bleibt erforderlich; die
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
