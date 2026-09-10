# Aktuelles Anwender- und UX-Review

Stand: 10.09.2026 · gegen 3.2.0-rc134 und DS-078/086/088/092/093/095/096 revalidiert

## Ergebnis

Der Cowork-Zielablauf bleibt schlank: ein Auftrag, ein lokaler Mehrfachpicker,
Bestätigung dieser Auswahl, ein lokaler Abschluss und ein späterer optionaler
Auftrag zur Ergebnisverwendung. Bei fehlendem Ergebnisstandard geht einmalig
die Zielordnerwahl voraus. Technische Profile, Bildmodi, Paketkennungen und
Diagnosewege gehören nicht in die Nutzerreise.

Standalone beginnt dagegen auf **Start**, ohne vorausgewählten Zweck. Der
Anwender wählt reine Markdown-Konvertierung oder Anonymisierung, Quellen per
Picker/Drop und **Starten**. **Verlauf** zeigt die 20 neuesten Verarbeitungen
mit exakt laufgebundenen Aktionen. Kein automatischer Ansichts-/Ordnerwechsel;
reine Konvertierung erhält Originalinhalte und benötigt keinen PII-Review.

## Was bereits gut gelöst ist

- Direkte Spracheingabe und Skill sollen denselben Vertrag verwenden.
- Originale werden nicht in den Chat geladen und bleiben unverändert.
- Mehrere Formate können in einem Stapel liegen; Nutzer geben keinen Typ an.
- Eine fehlerhafte Datei blockiert nicht den Reststapel.
- Fortsetzung erfolgt ohne erneute Auswahl und ohne Duplikate.
- Bilder bleiben lokal; unklare Zertifikats-/Organisationsstellen werden nicht
  automatisch geraten.
- Klare Dateien öffnen keinen Reviewdialog. Windows-Sammelreview und der
  E0-implementierte AppKit-Sammelreview zeigen nur
  wirklich mehrdeutige Dateien, inhaltsfreie Fortschrittszähler und direkte
  fachliche Aktionen statt einer missverständlichen Ja/Nein-Frage.
- Mapping und Ergebnisübersicht bleiben lokal.

## Verbleibende UX-Risiken

- Claude-seitige Werkzeugberechtigungen können zusätzliche Hostbestätigungen
  erzeugen; das Plugin darf sie nicht fälschlich als eigene Dialoge zählen.
- Lokale Picker-, Abschluss- und Reviewdialoge müssen auf Windows und macOS
  tatsächlich auf Fokus, Escape, Zoom und Screenreader geprüft werden.
- Der einzelne AppKit-Sammelreview und der gleichwertige sichtbarkeitsbestätigte
  Cowork-Abschlussadapter sind E0 implementiert. Vor der macOS-Abnahme fehlt
  weiterhin die native Ausführungs-, Fokus-, Zoom- und Screenreader-Evidenz auf
  Intel und Apple Silicon; Vertragstests allein belegen den Nutzerablauf nicht.
- Der Start darf nicht wie ein hängender Chat wirken. Die frühe Antwort bestätigt
  nur die lokale Übernahme und Vorbereitung; erst die spätere lokale
  Abschlussmeldung bietet **„Ergebnisse öffnen“**. Sie behauptet weder einen
  dauerhaften Checkpoint noch eine bereits laufende Anonymisierung.
- Technische Codes dürfen nur als IT-Detail erscheinen. UAT-Kennungen werden immer
  mit Klartextname und Link gezeigt.
- Cloud-Cowork, Web, Mobil und geplante Cloud-Aufgaben müssen für Originale früh
  und verständlich stoppen – auch bei geöffneter Desktop-App. Der zulässige
  Claude-Weg ist eine lokale Cowork-Sitzung mit laufendem Plugin-MCP oder lokales
  Claude Code; alternativ steht das eigenständige Standalone-Produkt bereit.

## UX-Abnahmekriterien

Eine fachfremde Person kann mit dem
[Cowork-UAT-Kit](acceptance/UAT_TEST_KIT/README.md) beziehungsweise mit dem
[Standalone-UAT-Kit](acceptance/STANDALONE_UAT_TEST_KIT/README.md):

1. den Kernfall ohne Hilfe in höchstens drei bewussten Aktionen starten,
2. einen sicheren Stopp erklären,
3. einen Stapel ohne Neuauswahl fortsetzen,
4. Bilder und Originalschutz korrekt beschreiben,
5. zwischen lokalem Abschluss und späterer Claude-Auswertung unterscheiden.
6. im Mischstapel erklären, welche Dateien bereits automatisch abgeschlossen
   wurden und warum nur gelbe Fundstellen zur Entscheidung erscheinen.

Die beobachteten Ergebnisse werden im
[formalen N3/N4-Rahmen](acceptance/FORMAL_UAT/README.md) pro Zielhost und Produkt
getrennt protokolliert. Erst ein bestandenes N3 desselben Kandidaten erlaubt die
N4-UX-/Fachfreigabe.

Der frühere RC34-Bericht bleibt im
[Archiv](archive/2026-08/reviews/ANWENDERREVIEW_RC34.md).
