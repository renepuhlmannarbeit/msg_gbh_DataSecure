# RC166: Nutzer-Abschlusstests des vereinfachten Ablaufs

Dieser Plan gilt nur für das künftig neu gebundene Paket mit direkter
Ergebnisbereitstellung. Der ältere lokale Ordner `RC166` mit Build `76078347`
enthält den vorherigen Ablauf und ist kein Nachweis dieser Änderung.
Paketname, Appcommit und Prüfsummen werden bei tatsächlicher Übergabe ergänzt.
Alle Desktoptests sind **offen** und werden vom Nutzer/Kollegen durchgeführt.

Die vorhandenen synthetischen Eingaben verwenden. Je Fall ausschließlich
`EINGABEN` wählen und einen neuen leeren Ergebnisunterordner anlegen; keine
alten Ergebnisse überschreiben. Windows und Mac erhalten denselben Plan.

## 1. Markdown ohne OCR

- „Neue Verarbeitung“ → „Nur umwandeln“, OCR aus.
- Die drei vorgesehenen Eingaben des normalen Konvertierungsfalls wählen.
- Starten und bis zum tatsächlichen Abschluss warten.
- „Ergebnisordner öffnen“ wählen.
- Erwartung: keine zweite Dokumentauswahl, Freigabe oder Exportbestätigung;
  verfügbare MD bereits vorhanden. Nicht umgewandelte Bilddatei wird als Hinweis
  beschrieben, nicht als heimlich verarbeitete Quelle.

## 2. Geführte Anonymisierung mit OCR

- „Umwandeln und anonymisieren“ → „Selbst entscheiden“, OCR einschalten.
- Den OCR-/Anonymisierungsfall wählen. Die separate optionale OCR-Kontaktprüfung
  ist eine Option für „Nur umwandeln“, nicht ein weiterer Schalter dieses Modus.
- In tatsächlich angebotenen Gruppen die Erkennung vergleichen beziehungsweise
  unklare Fundstellen behandeln; Gruppe speichern.
- Erwartung: Nach der letzten Gruppe Laufabschluss, nicht automatisch eine
  weitere Dateiauswahl-/Exportseite. Gruppenzahl hängt von den Eingaben ab.
- Ergebnisordner öffnen: aktuelle anonymisierte MD vorhanden; keine Originale,
  Zuordnungstabellen, Identitätsübersichten oder Diagnosen zwischen diesen MD.

## 3. Automatisch maskieren, OCR unabhängig

- „Automatisch maskieren“ einmal mit und einmal ohne OCR durchführen.
- Erwartung: kein vorgetäuschter manueller Prüfabschluss, kein zusätzliches
  Exportereignis erforderlich. OCR-aus-Auslassungen bleiben sichtbar.
- Bekannte OCR-Labels an Wurzel- und Unterordnerzeilen sind auch zugeklappt da;
  das Label schaltet OCR nicht selbst ein.

## 4. Optionale Textkorrektur

- Fertigen Markdownlauf → optionale Nachbearbeitung öffnen.
- Einen eindeutig synthetischen Satz ändern und einmal speichern.
- Erwartung: Der bestätigte aktuelle Ergebnisstand enthält exakt die Korrektur.
  Keine weitere Auswahl/Freigabe/Kopie erforderlich. Frühere Stände bleiben
  erhalten; der Ordneröffner führt auf den aktuellen bestätigten Stand.
- App normal schließen, neu öffnen, denselben Lauf/Ordner öffnen; Korrektur bleibt.
- Auf Mac den bestätigten Ergebnisordner im Finder ansehen, Darstellung ändern
  und danach erneut öffnen/nachkorrigieren. Eine reguläre Finder-`.DS_Store`
  darf den MD-Stand nicht blockieren und wird nicht in den nächsten Stand kopiert.
  Solche OS-Metadaten sind nicht anonymisiert: nur gewünschte MD weitergeben.

## 5. Zusätzliche Maskierung und Wiederherstellung

- Fertigen Anonymisierungslauf optional nachbearbeiten.
- Eine synthetische weitere Maskierung speichern, anschließend Ergebnis öffnen.
- Erwartung: aktueller Stand enthält die Maskierung; alle unveränderten
  Dokumente bleiben im vollständigen Stand vorhanden.
- Eine angebotene Wiederherstellung bewusst bestätigen. Technische Prüfung
  muss weiterhin greifen; kein Erfolg bei verweigerter Bereitstellung behaupten.

## 6. Vertagen und Neustart

- „Neue Verarbeitung“ → „Umwandeln und anonymisieren“ → „Selbst entscheiden“.
- OCR einschalten, `05-Vertagen-Neustart/EINGABEN` aus dem Kompaktarchiv wählen,
  ein neues leeres Ergebnisziel wählen und die Verarbeitung starten.
- In einer tatsächlich angebotenen Prüfgruppe eine Entscheidung nur vormerken,
  nicht vollständig speichern. „Später entscheiden“ anklicken, die App normal
  schließen, neu öffnen und denselben Lauf fortsetzen.
- Erwartung: derselbe Lauf ist fortsetzbar; ungespeicherte Vormerkung ist nicht
  versehentlich als fertige Ergebnisänderung veröffentlicht.
- Danach die vollständige Gruppe bearbeiten und „Entscheidungen speichern und
  fortfahren“ anklicken; weitere erforderliche Gruppen ebenso abschließen.
  Erwartung: direkt Ergebnisordner erreichbar, keine weitere Exportauswahl.

## 7. Vorhandene Ergebnisse außerhalb der App verändern

- Nur einen eigenen synthetischen aktuellen Ergebnisstand verwenden.
- Bei geschlossener App eine MD kontrolliert umbenennen oder ihren Text ändern;
  Originalzustand für spätere Wiederherstellung sichern.
- In App nur Verlauf/Ergebnisordner lesen, dann eine neue Nachkorrektur versuchen.
- Erwartung: keine stille Wiederanlage, Übernahme oder Überschreibung; klarer
  Konflikt. Private gespeicherte Revision und noch unbestätigte Bereitstellung
  werden unterschieden. Keine erneute Quellverarbeitung starten.

## 8. Verlauf, neue Verarbeitung und Pickerabbruch

- Mindestens sechs kleine synthetische Läufe erzeugen: maximal letzte fünf.
- Lauf aus Anzeige ausblenden: Dateien/Entscheidungen bleiben; kein sechster
  historischer Lauf rückt nach. Neustart prüfen.
- Nach fertigem Lauf „Neue Verarbeitung“: verbrauchte Auswahl leer.
- Ungestartete Auswahl kurz verlassen und zurückkehren: Entwurf bleibt.
- Datei-/Zielpicker abbrechen: bisherige Auswahl und Ziel bleiben unverändert.

## 9. Hintergrundanzeige und alte Belege

- Größeren Lauf laufen lassen, ohne zu klicken.
- Erwartung: Dateifortschritt aktualisiert sich ohne wiederholten Seiten-/Button-
  Neuaufbau. Echte Phasenwechsel/Fehler bleiben sichtbar.
- Optional einen alten RC164/165-Lauf öffnen: damalige Belege/zusätzliche Kopien
  bleiben historisch. Kein alter Ordner wird rückwirkend als neuer bereinigter
  Ergebnisstand umetikettiert oder automatisch neu erzeugt.

## 10. Große synthetische Eingaben

- Neue separate `Large-Testdaten.zip` verwenden; ausschließlich deren EINGABEN.
- Ergebnis-/Hinweiszahlen und aktuelle Ordner prüfen. Alle ursprünglichen
  Testdateien bleiben bytegleich; kein Löschen oder pauschales Reparieren nötig.
- Auf Mac zusätzlich reales Öffnen aus Finder, Eingabe-/Ergebnisordnerrechte
  und Neustart prüfen. CI ersetzt diese Zielhostprüfung nicht.

Fehlerbericht: Buildkennung, Betriebssystem/Architektur, Fallnummer, erwartetes
und tatsächliches Verhalten sowie optional lokal gespeicherte Diagnose. Keine
echten personenbezogenen Dokumente für die Abnahme verwenden.
