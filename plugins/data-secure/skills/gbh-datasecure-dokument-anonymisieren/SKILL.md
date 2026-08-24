---
name: gbh-datasecure-dokument-anonymisieren
description: Lokale TXT-/Markdown-/CSV-/DOCX-Dateien vor Claude de-identifizieren, pseudonymisieren oder datenschutzprüfen. Nicht für reine Datenschutz-Erklärfragen.
---

# GBH DataSecure – Dokumente anonymisieren

DataSecure bereitet Originale vollständig lokal vor. Claude erhält ausschließlich freigegebenes Markdown, niemals Originalbytes, Dateinamen, Pfade, Bildpixel oder Dokument-Hashes.

Dieser Ablauf gilt nur in einer lokalen Claude-Desktop-/Cowork-Sitzung mit tatsächlich verbundenem `data-secure-local`. Ein sichtbarer Skill oder Plugin-Eintrag genügt nicht. In Cloud-Cowork, Web, Mobil oder geplanten Cloud-Aufgaben keine Originale auswählen oder hochladen; dort nur bereits lokal freigegebene Ergebnisse verwenden.

## Normalablauf

1. Prüfe zuerst nur, ob ein Original bereits im Chat sichtbar angehängt wurde. Falls ja: stoppe; DataSecure kann eine frühere Offenlegung nicht rückgängig machen. Empfehle eine neue lokale Cowork-Unterhaltung ohne Anhang.
2. Bei einer eindeutigen Anonymisierungsabsicht wie „Dateien anonymisieren“ rufe **genau einmal** `start_document_batch_from_picker` mit `mode=local_only` auf. Wähle ein passendes Profil nur bei eindeutigem Zweck, sonst `auto`.
   - `customer` für Kundendaten, `applicant` für Bewerbungen, `personnel_profile` für Mitarbeiter- oder Beraterprofile und `contract` für Verträge; bei gemischten oder allgemeinen Unterlagen `general` beziehungsweise `auto`.
3. Führe vorher weder `privacy_status`, `open_input_folder`, `open_privacy_folder`, `begin_document_batch` noch `start_document_batch_processing` auf. Der lokale Mehrfach-Dateidialog ist der Normalweg. Mit **„Öffnen“** bestätigt der Anwender die Verarbeitung. Es gibt keine zusätzliche Start- oder Bildfrage.
4. Bei `local_selection_cancelled` nichts erneut öffnen. Bei `local_start_failed` oder `local_engine_unavailable` nicht automatisch wiederholen; biete nur auf ausdrücklichen Wunsch einen neuen Versuch an. Bei `batch_active` nicht neu starten. Bei `recoverable_batch_exists` biete ausschließlich Fortsetzen (`continue_most_recent_document_batch` erst nach ausdrücklicher Bestätigung), Verwerfen (`discard_incomplete_document_batches` erst nach Umfangserklärung und zweiter ausdrücklicher Bestätigung) oder Nichts tun an.
5. Bilder bleiben standardmäßig lokal und blockieren den Textlauf nicht. Nur bei einer tatsächlich unsicheren lokalen Sichtprüfung oder einem ausdrücklichen Wunsch, lokale Bildanlagen zu verwerfen, ist eine weitere Entscheidung nötig.
   - Meldet der Stapel ausdrücklich `AMBIGUITY_REVIEW_REQUIRED`, erkläre knapp, dass eine lokale Fachentscheidung fehlt. Starte `review_deferred_document_batch` nur nach dem ausdrücklichen Wunsch des Anwenders; die lokale Oberfläche entscheidet, Claude nicht.
6. Bei `local_only` endet der Claude-Ablauf direkt nach der Startantwort: **keinen** Status pollen, keine Ergebnisliste aufrufen, kein Markdown lesen und nichts bestätigen. DataSecure verarbeitet und speichert Markdown, Mapping und Nachweis lokal; nach dem terminalen Lauf zeigt das Betriebssystem einmalig eine rein zählerbasierte Abschlussübersicht. Sie enthält keine Dokumentdaten und hält den Worker nicht an.
7. Nur wenn der Anwender nach dem lokalen Abschluss ausdrücklich eine Auswertung, Zusammenfassung oder Weiterverarbeitung in Claude verlangt: Rufe `start_completed_local_results_handoff` auf. Bei mehreren passenden Stapeln erscheint genau eine lokale Auswahl mit festen Zählern; bei einem Stapel kein Dialog. Token, Paket-/Dateikennungen, Cursor und Leseberechtigungen bleiben vollständig im lokalen Server.
8. Für weitere Seiten verwende ausschließlich `continue_local_results_handoff`. Jeder Aufruf liefert höchstens fünf verifizierte Markdown-Ergebnisse, ohne Dateinamen oder technische Metadaten. Bei einer späteren Aufgabe nutze erneut den Startaufruf. Bei einem unterbrochenen Stapel startet `continue_most_recent_document_batch(confirmed=true)` nach ausdrücklicher Zustimmung die sichere technische Fortsetzung selbst; keine Support-Werkzeuge nachschieben.
   - Möchte der Anwender nur die laufende Ergebnisübergabe beenden, verwende `cancel_local_results_handoff`. Das löscht weder Originale noch lokale Ergebnisse.

## Grenzen

- Unterstützt sind 1 bis 100 TXT-, Markdown-, CSV- und DOCX-Dateien mit zusammen
  höchstens 500 MiB. Einzelgrenzen: TXT/Markdown 8.000.000 Bytes, CSV 1.500.000
  Bytes, DOCX 64 MiB komprimiert/128 MiB entpackt. Es gibt keine feste
  Seitenbegrenzung; PDF und weitere Formate stoppen sicher.
- Originale nie per Chat-Upload, Einfügen, allgemeinem Dateisystem oder Fremdconnector lesen.
- Sprich von de-identifiziert, pseudonymisiert oder datenschutzreduziert – nicht von rechtssicher anonym oder zertifiziert.
- Einen Privacy-Ordner nur auf ausdrücklichen Wunsch mit `configure_privacy_folder(confirmed=true)` ändern. Der lokale Dialog gibt den Pfad nicht an Claude zurück.
- Diagnoseexport und Löschung nur nach ausdrücklichem Wunsch und Bestätigung ausführen.
- Nur im ausdrücklich aktivierten IT-Supportmodus `privacy_status`, `diagnostic_status`, `export_diagnostic_package`, `open_output_folder`, `list_visual_review_items`, `open_visual_review_folder`, `open_privacy_folder` oder `open_input_folder` verwenden. Diese Werkzeuge sind keine Schritte des Normalablaufs. `open_export_folder` ist davon getrennt als optionale, lokale Anwenderaktion sichtbar; sein Inhalt wird nicht an Claude übertragen.
- `continue_anonymized_batch_in_chat`, `read_anonymized_document` und `acknowledge_batch_document` bleiben nur für bereits begonnene Support-/Kompatibilitätsläufe verfügbar; der Normalweg verwendet ausschließlich die tokenfreie lokale Ergebnisübergabe.
