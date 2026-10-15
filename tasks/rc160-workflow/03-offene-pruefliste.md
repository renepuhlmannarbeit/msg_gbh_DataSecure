# Offene Fundstellen gemeinsam behandeln

Bezug: BL-010.53, Scheiben .4/.8; DS-110.
[Gesamtauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md),
[Vorlage](VORLAGE.md), [Backlog](../../docs/canonical/BACKLOG.md).

## Vorhandener Weg und Präzisierung

Standardfilter „Noch offen“, 50+14-Nachrücken, atomare Behandlung und Undo
sind bereits implementiert. Diese Funktion nicht neu bauen. Checkboxauswahl,
Vormerkung und bestätigte Speicherung sprachlich eindeutig trennen.
Übergabebutton nennt die Anzahl der tatsächlichen Vorkommensentscheidungen:
„64 Entscheidungen speichern und fortfahren“. Eine Zeile kann viele Vorkommen
enthalten; sichtbare Zeilenanzahl ist nicht Entscheidungsanzahl.

## Umsetzung und Fehlerzustände

Zentrale Auswahl-/Behandlungsleiste, keine doppelten Einzelaktionen. Nach Apply
machen vorgemerkte Zeilen im Offenfilter Platz für die nächsten; Filter
„Vorgemerkt“ und Undo bleiben. Keine automatische Übergabe. Gruppenübernahme
erst vollständig und serverbestätigt; verlorene Bestätigung bedeutet unklar,
nicht „gespeichert“ und nicht „nichts passiert“. Originalpixel, Quelltext und
Markdownvergleich zeigen genau die gewählte Fundstelle, auch nach Filterwechsel.

## Abnahme

64 Einzelkontakte → 50 behandeln → nächste 14 sichtbar; kein IPC-Submit vor
expliziter Übergabe. Gruppierte Namen zählen alle Vorkommen. Reset/Undo,
leere Filter, Suche, Seitenwahl, ungültige Korrektur und 5.000er-Grenze prüfen.
Nach Lost-ACK kein automatisches Resubmit; Vertagen speichert keine Vormerkungen.
