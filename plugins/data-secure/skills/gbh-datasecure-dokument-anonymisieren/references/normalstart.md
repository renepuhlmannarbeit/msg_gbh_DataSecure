# Normalstart

Prüfe nur, ob ein Original bereits im Chat angehängt wurde. Falls ja, stoppe: DataSecure kann eine frühere Offenlegung nicht rückgängig machen.

Verwende `customer` für Kundendaten, `applicant` für Bewerbungen, `personnel_profile` für Mitarbeiter-/Beraterprofile, `contract` für Verträge und bei gemischten Unterlagen `general` oder `auto`. Bei Unsicherheit nicht raten, sondern `auto`.

Beim ersten Start lässt DataSecure einmalig einen dedizierten lokalen Ergebnisordner wählen und öffnet danach die Quellenwahl. Spätere Läufe öffnen nur die Quellenwahl. DataSecure errät keinen Projektpfad und kann verbundene Cowork-Ordner nicht erkennen. Nur einen dedizierten Ergebnisordner mit Cowork verbinden; Originale außerhalb verbundener Ordner halten.

Bei `local_selection_rejected` den mitgelieferten inhaltsfreien Grund wörtlich nennen. Ein rekursiver Ordner muss als Ganzes zulässig sein. Bei `result_folder_required`, `local_start_failed`, `local_engine_unavailable` oder `batch_active` nichts automatisch wiederholen. `local_selection_cancelled` beendet die Aufgabe ohne zweiten Picker.

Falls ein Sammelreview erforderlich ist, startet DataSecure ihn lokal selbst. Weder nachfragen noch `review_deferred_document_batch` aufrufen. „Später entscheiden“ lässt den Stapel sicher fortsetzbar. Bilder bleiben standardmäßig lokal; für Markdown gibt es keine zusätzliche Bildfrage.

Nach erfolgreicher Worker-Annahme das serverseitige `user_status` genau einmal wörtlich wiedergeben und beenden. Fehlt es bei einer älteren Plugin-Kopie, nur sagen, dass die lokale Übernahme bestätigt wurde und der genaue Zustand im lokalen DataSecure-Fenster sichtbar ist. Keine offene Formulierung wie „ich warte“ oder „danach können wir“.
