# Aktuelles Anwender- und UX-Review

Stand: 01.09.2026 · 3.2.0 RC84

## Ergebnis

Der Zielablauf ist verständlich und schlank: ein Start, ein lokaler Mehrfachpicker, eine
Startbestätigung, ein lokaler Abschluss und ein späterer optionaler Auftrag zur
Ergebnisverwendung. Technische Profile, Bildmodi, Paketkennungen und Diagnosewege
gehören nicht in die Nutzerreise.

## Was bereits gut gelöst ist

- Direkte Spracheingabe und Skill sollen denselben Vertrag verwenden.
- Originale werden nicht in den Chat geladen und bleiben unverändert.
- Mehrere Formate können in einem Stapel liegen; Nutzer geben keinen Typ an.
- Eine fehlerhafte Datei blockiert nicht den Reststapel.
- Fortsetzung erfolgt ohne erneute Auswahl und ohne Duplikate.
- Bilder bleiben lokal; unklare Zertifikats-/Organisationsstellen werden nicht
  automatisch geraten.
- Mapping und Ergebnisübersicht bleiben lokal.

## Verbleibende UX-Risiken

- Claude-seitige Werkzeugberechtigungen können zusätzliche Hostbestätigungen
  erzeugen; das Plugin darf sie nicht fälschlich als eigene Dialoge zählen.
- Lokale Picker-, Abschluss- und Reviewdialoge müssen auf Windows und macOS
  tatsächlich auf Fokus, Escape, Zoom und Screenreader geprüft werden.
- Der Start darf nicht wie ein hängender Chat wirken. Cowork muss klar sagen:
  „Lokal gestartet; Abschluss erscheint lokal; Ergebnisse später anfordern.“
- Technische Codes dürfen nur als IT-Detail erscheinen. UAT-Kennungen werden immer
  mit Klartextname und Link gezeigt.
- Eine Cloud-Session ohne lokale Desktop-Brücke muss früh und verständlich stoppen.

## UX-Abnahmekriterien

Eine fachfremde Person kann mit dem
[aktuellen UAT-Kit](acceptance/UAT_TEST_KIT/README.md):

1. den Kernfall ohne Hilfe in höchstens drei bewussten Aktionen starten,
2. einen sicheren Stopp erklären,
3. einen Stapel ohne Neuauswahl fortsetzen,
4. Bilder und Originalschutz korrekt beschreiben,
5. zwischen lokalem Abschluss und späterer Claude-Auswertung unterscheiden.

Der frühere RC34-Bericht bleibt im
[Archiv](archive/2026-08/reviews/ANWENDERREVIEW_RC34.md).
