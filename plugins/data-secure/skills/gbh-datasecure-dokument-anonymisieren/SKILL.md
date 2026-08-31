---
name: gbh-datasecure-dokument-anonymisieren
description: TXT/Markdown/CSV/DOCX lokal anonymisieren; DataSecure-Ergebnisse später übergeben, Stapel fortsetzen und Support-/Löschgrenzen erklären. Keine reine Datenschutz-Erklärung.
---

# GBH DataSecure – Dokumente anonymisieren

DataSecure bereitet Originale vollständig lokal vor. Claude erhält ausschließlich freigegebenes Markdown, niemals Originalbytes, Dateinamen, Pfade, Bildpixel oder Dokument-Hashes.

Dieser Ablauf gilt nur in einer lokalen Claude-Desktop-/Cowork-Sitzung mit tatsächlich verbundenem `data-secure-local`. Ein sichtbarer Skill oder Plugin-Eintrag genügt nicht. In Cloud-Cowork, Web, Mobil oder geplanten Cloud-Aufgaben keine Originale auswählen oder hochladen; dort nur bereits lokal freigegebene Ergebnisse verwenden.

Die Desktop-App allein beweist keine lokale Sitzung: Auch dort kann Cowork cloud-gehostet sein. In unbekannten oder nicht freigegebenen Host-Konstellationen stoppen; Computer-Use, allgemeiner Dateizugriff und andere Connectoren sind kein Ersatz für den lokalen Picker.

## Normalablauf

1. Prüfe zuerst nur, ob ein Original bereits im Chat sichtbar angehängt wurde. Falls ja: stoppe; DataSecure kann eine frühere Offenlegung nicht rückgängig machen. Empfehle eine neue lokale Cowork-Unterhaltung ohne Anhang.
2. Bei einer eindeutigen Anonymisierungsabsicht wie „Dateien anonymisieren“ rufe **genau einmal** `start_document_batch_from_picker` mit `mode=local_only` auf. Verwende bei einem ausdrücklich gewünschten Ordner oder einer rekursiven Verarbeitung `source_kind=folder`, sonst `source_kind=files`. Wähle ein passendes Profil nur bei eindeutigem Zweck, sonst `auto`.
   - `customer` für Kundendaten, `applicant` für Bewerbungen, `personnel_profile` für Mitarbeiter- oder Beraterprofile und `contract` für Verträge; bei gemischten oder allgemeinen Unterlagen `general` beziehungsweise `auto`.
3. Führe vorher weder `privacy_status` noch ein Ordner- oder Supportwerkzeug aus. Die lokale Datei- beziehungsweise Ordnerauswahl ist der einzige Dateieingang. Mit **„Öffnen“** bestätigt der Anwender die Verarbeitung. Es gibt keine zusätzliche Start- oder Bildfrage.
4. Bei `local_selection_cancelled` nichts erneut öffnen. Bei `local_start_failed` oder `local_engine_unavailable` nicht automatisch wiederholen; biete nur auf ausdrücklichen Wunsch einen neuen Versuch an. Bei `batch_active` nicht neu starten. Ein pausierter oder fortsetzbarer Stapel blockiert eine ausdrücklich gewünschte neue Auswahl nicht. Nur wenn der Anwender den früheren Stapel verwalten möchte, biete Fortsetzen (`continue_most_recent_document_batch` erst nach ausdrücklicher Bestätigung), Verwerfen (`discard_incomplete_document_batches` erst nach Umfangserklärung und zweiter ausdrücklicher Bestätigung) oder Nichts tun an.
5. Bilder bleiben standardmäßig lokal und blockieren den Textlauf nicht. Nur bei einer tatsächlich unsicheren lokalen Sichtprüfung oder einem ausdrücklichen Wunsch, lokale Bildanlagen zu verwerfen, ist eine weitere Entscheidung nötig.
   - Benötigt ein offener Stapel eine Fachentscheidung, reicht die ausdrückliche Auswahl „Fortsetzen“. `continue_most_recent_document_batch(confirmed=true)` startet die lokale Prüfung selbst in einem getrennten Prozess. Rufe im Normalweg niemals zusätzlich `review_deferred_document_batch` auf; dieses tokenbasierte Werkzeug ist ausschließlich technischer Support. Die lokale Oberfläche entscheidet, Claude nicht.
6. Bei `local_only` endet der Claude-Ablauf direkt nach der Startantwort: **keinen** Status pollen, keine Ergebnisliste aufrufen, kein Markdown lesen und nichts bestätigen. Antworte genau einmal knapp mit „Die lokale Verarbeitung wurde gestartet.“ und beende die Cowork-Aufgabe sofort. Verwende keine offene Formulierung wie „Sag Bescheid“, „ich warte“ oder „danach können wir“, denn eine spätere Auswertung ist eine neue Anwenderaufgabe. DataSecure verarbeitet und speichert Markdown, Mapping und Nachweis lokal; nach dem terminalen Lauf zeigt das Betriebssystem einmalig eine rein zählerbasierte Abschlussübersicht. Sie enthält keine Dokumentdaten und hält den Worker nicht an.
   - Bei einem kombinierten Wunsch wie „anonymisieren und anschließend zusammenfassen“ erkläre **vor dem Startaufruf** knapp die zwei getrennten Schritte: jetzt lokale Verarbeitung; eine Auswertung in Claude erfordert nach lokalem Abschluss einen neuen ausdrücklichen Auftrag. Der kombinierte Erstauftrag löst keine automatische Ergebnisübergabe aus. Danach gilt dieselbe kurze Startantwort ohne Polling oder Lesen.
7. Nur wenn der Anwender nach dem lokalen Abschluss ausdrücklich eine Auswertung, Zusammenfassung oder Weiterverarbeitung in Claude verlangt: Rufe `start_completed_local_results_handoff` auf. Bei mehreren passenden Stapeln erscheint genau eine lokale Auswahl mit festen Zählern; bei einem Stapel kein Dialog. Token, Paket-/Dateikennungen, Cursor und Leseberechtigungen bleiben vollständig im lokalen Server. Die erste Seite enthält einmalig die verifizierten Stapelzähler; `not-processed` erzeugt nie ein Dokument.
8. Für weitere Seiten verwende ausschließlich `continue_local_results_handoff`. Jeder Aufruf liefert höchstens fünf freigegebene Markdown-Ergebnisse, die lokal verifiziert wurden, ohne Dateinamen oder technische Kennungen. Ein Ergebnis kann `complete` oder `usable-with-omissions` sein; bei Auslassungen nenne die feste deutsche Anzeige knapp und behaupte niemals Vollständigkeit. Weitere Textseiten desselben Dokuments behalten denselben Grad. Bei einer späteren Aufgabe nutze erneut den Startaufruf. Bei einem unterbrochenen Stapel startet `continue_most_recent_document_batch(confirmed=true)` nach ausdrücklicher Zustimmung die technische Fortsetzung oder lokale Fachprüfung selbst. Antworte danach knapp, dass die lokale Fortsetzung beziehungsweise Prüfung gestartet wurde, und beende die Cowork-Aufgabe; keine zweite Bestätigung, kein Polling und keine Support-Werkzeuge nachschieben.
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
- Nur im ausdrücklich aktivierten IT-Supportmodus `privacy_status`, `diagnostic_status`, `export_diagnostic_package`, `open_output_folder`, `list_visual_review_items`, `open_visual_review_folder` oder `open_privacy_folder` verwenden. Diese Werkzeuge sind keine Schritte des Normalablaufs. Einen technischen Eingangsordner gibt es nicht mehr. `open_export_folder` ist davon getrennt als optionale, lokale Anwenderaktion sichtbar; sein Inhalt wird nicht an Claude übertragen.
- Bei einer Diagnose- oder Löschanfrage im Normalmodus erkläre die Supportgrenze und verweise an die IT. Fehlende Supportwerkzeuge bedeuten nicht, dass der lokale Connector fehlt. Aktiviere den Supportmodus nicht selbst und verwende keine Shell-/Dateiwerkzeuge als Ersatz. `purge_local_data` ist ebenfalls nur im aktivierten IT-Supportmodus verfügbar.
- `continue_anonymized_batch_in_chat`, `read_anonymized_document` und `acknowledge_batch_document` bleiben nur für bereits begonnene Support-/Kompatibilitätsläufe verfügbar; der Normalweg verwendet ausschließlich die tokenfreie lokale Ergebnisübergabe.

## Vertiefung bei Bedarf

Lies nur die zur konkreten Frage passende Referenz; der Normalstart benötigt keine zusätzliche Referenzrunde.

- Kombinierte Aufträge und spätere Auswertung: [Beispiele](references/beispiele.md).
- Formate, Grenzen und Ordnerauswahl: [Unterstützte Formate](references/unterstuetzte-formate.md).
- Fachliche Erhaltung und Profilwahl: [Profilregeln](references/profilregeln.md).
- Hostwechsel, Upload oder fehlender lokaler Connector: [Sicherheitsgrenze](references/sicherheitsgrenze.md).
- Sichere Stopps, IT-Support und Löschung: [Fehler und Datenhaltung](references/fehler-und-datenhaltung.md).
- Fragen zum Installationspaket: [Plugin oder MCPB](references/plugin-oder-mcpb.md).
