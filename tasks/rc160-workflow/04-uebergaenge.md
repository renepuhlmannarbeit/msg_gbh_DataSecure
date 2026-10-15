# Folgeprüfungen im selben Laufbereich

Bezug: BL-010.53, Scheiben .4/.5/.7/.8; DS-110.
[Gesamtauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md),
[Vorlage](VORLAGE.md), [Backlog](../../docs/canonical/BACKLOG.md).

## Ergebnis und vorhandene Bindung

Folgegruppen laden bereits im selben eingebetteten Prüfer; nur die native
gebundene Abschlussmeldung darf den Abschlussübergang desselben Laufs auslösen.
Bei Anonymisierung führt dieser zur Dokumentprüfung; bei reiner Markdown-
Umwandlung zurück zum Abschluss auf der Laufseite beziehungsweise im Verlauf,
von dem aus die Kontaktprüfung geöffnet wurde. Der Markdown-Editor öffnet sich
nur auf ausdrücklichen Wunsch zur freiwilligen Nachbearbeitung. Diese Generation-/
Eigentümerregel bleibt erhalten. Sichtbare Übergänge sollen
erklären, warum nach einer Gruppe noch automatische Arbeit oder eine weitere
Prüfung nötig ist.

## Texte und Zustände

Nach bestätigtem Submit: „Entscheidungen gespeichert. Weitere Fundstellen
werden geprüft. Bitte warten.“ Danach nächste Gruppe oder, bei Anonymisierung,
„Fundstellenprüfung abgeschlossen. Jetzt die vollständigen Dokumente nachprüfen.“
Bei reiner Umwandlung: „OCR-Kontaktprüfung abgeschlossen. Keine weitere
Pflichtprüfung für diesen Markdown-Lauf.“ Die Kontaktprüfung betrifft nur
erkannte E-Mail-/Telefonwerte, nicht den übrigen OCR-Text. `OCR_NOT_VERIFIED`
bleibt deshalb erhalten und wird verständlich erläutert. OCR und
Entitätsentscheidung sind benannte Unterphasen, keine zwei neuen Läufe.
Bei Lost-ACK: „Bestätigung noch unklar. Gespeicherten Stand abgleichen“.
Manuelles Vertagen/Schließen ist kein Erfolg; kein späterer Status darf den
Nutzer aus einem inzwischen gewählten anderen Bereich herausnavigieren.

## Abnahme

Anonymisierung: OCR → Entitäten → Dokumente. Reines Markdown: OCR-Kontakte
→ Laufabschluss; freiwilliger Editor nur bei ausdrücklichem Aufruf.
Beide Wege: mehrere Folgegruppen, Pause dazwischen,
defer/restart, verzögerter alter Close, Reconnect und unbestätigtes Submit.
Gleiche Lauf-ID, keine doppelten Fenster/Starts, unveränderte gespeicherte
Entscheidungen, keine ungeprüfte Ergebnisfreigabe oder Pixelweitergabe.
