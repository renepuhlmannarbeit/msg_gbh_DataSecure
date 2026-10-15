# Dateifehler erklären und sicher weiterarbeiten

Bezug: BL-010.53, Scheiben .2/.7/.8; DS-106/DS-107/DS-110.
[Gesamtauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md),
[Vorlage](VORLAGE.md), [Backlog](../../docs/canonical/BACKLOG.md).

## Nutzerproblem und Umsetzung

Dateinamen und feste Ursachen werden bereits privat übertragen. Ergänzung:
ein konsistenter nächster Schritt pro bestätigter Ursacheklasse in Laufkarte,
History und Dokumentprüfung. Geschlossenes Display-Mapping, kein freier
Fehlertext aus Vendor/Parser; lokale Namen nie in Diagnose oder Claude.

„Bericht.pdf“ → „Passwortgeschützt, nicht verarbeitet“ → „Ungeschützte Kopie
separat auswählen“. „Konverterstart verweigert“ nennt den belegten OS-Fakt,
nicht eine erfundene Antivirusursache. Unbestätigte Ursachen bleiben unbestätigt.
Globale Start-/Schutzgrenzenfehler nennen betroffene Zielmenge und noch nicht
gestartete Dateien; nicht jede Datei als beschädigt bezeichnen.

Bei einem unabhängig gebundenen neuen Raw-`content-v1`-Lauf mit beiden OCR-Flags
aus sind terminale `IMAGE_OCR_REQUIRED`- und `PDF_TEXT_UNAVAILABLE_BY_POLICY`-
Stopps erwartete Auslassungen. Die Anzeige zählt sie als „ohne OCR nicht
umgewandelt“ und zeigt gelbe Hinweise statt roter Fehlerkarten. Technische
Journalzustände und Stoppszähler werden nicht geändert. Aktive, wiederholbare
oder Mapping-schwebende Positionen bleiben offen. Bei älteren oder nicht mehr
verfügbaren Options-/Ursachenbelegen ist keine nachträgliche Entwarnung zulässig.
Inhaltshinweise bereits erstellter Dokumente werden zusätzlich und pro Datei
einmal gezählt, mit lokalen Namen in einer gesonderten aufklappbaren Liste.
Diese Hinweise bestätigen weder tatsächlichen Textverlust noch vollständige
Inhaltsidentität. Anonymisierungsfreigaben bleiben unverändert.

## Retry und Nichtziele

Erneutes Laden ist kein Verarbeiten. Laufweites Fortsetzen ist kein
Einzeldatei-Retry. Den dauerhaften zielgebundenen Versuchsjournal-/Lease-Vertrag
aus BL-010.53.7 erst implementieren, bevor ein Datei-Retry-Button freigegeben
wird. Gelöschte/abgelaufene private Kopien nicht still aus Originalpfaden neu lesen.
Schutzgrenzenfehler und unbestätigtes Prozessende nicht automatisch wiederholen.

## Abnahme

RC160-r3: Dokumenteditor mit sichtbarem Ladezustand, gebundener OCR-Auslassung
statt generischem roten Fehler und geschlossenen Gruppen/Einzelfile-Details.
Grund und nächste Aktion erscheinen einmal. Fehlender Journal-/Optionsnachweis,
abweichende ID/Name/Ursache und technische Stopps werden nicht entwarnt.
Lost-/Teil-ACK bei Raw-Kopierbestätigung startet keine Kopie und keine automatische
Wiederholung; frühere Bestätigungen können gespeichert bleiben. 49 Frontend-/
41 Storegruppen plus History-Komposition und echte Headless-Darstellung bestehen.

Je bekannte Fehlerklasse: Name mit Endung, verständlicher Grund, sichere nächste
Aktion. Unbekannter Code erhält neutralen Fallback. Zwei fehlerhafte und ein
gesundes Dokument: Fehlermengen, nicht gestartete Positionen und unveränderte
gesunde Freigabe getrennt prüfen. Quellen unverändert, Diagnose inhaltsfrei.
