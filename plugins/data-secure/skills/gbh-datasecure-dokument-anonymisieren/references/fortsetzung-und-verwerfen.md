# Fortsetzung und Verwerfen

Ein pausierter oder retryfähiger Stapel blockiert eine ausdrücklich gewünschte neue Auswahl nicht. Möchte der Anwender den alten Stapel verwalten, nenne die drei Möglichkeiten: fortsetzen, unvollständige Arbeitsstände verwerfen oder nichts tun.

`continue_most_recent_document_batch(confirmed=true)` nur nach ausdrücklichem Fortsetzungswunsch. Der Server entscheidet anhand des dauerhaften Zustands, ob technische Verarbeitung oder lokaler Fachreview zulässig ist. Nach bestätigtem Start knapp berichten und die Cowork-Aufgabe beenden; kein Polling, kein zweiter Start und kein Supportwerkzeug.

`discard_incomplete_document_batches(confirmed=true)` erst verwenden, nachdem der genaue Umfang erklärt und der Anwender ein zweites Mal ausdrücklich bestätigt hat. Es betrifft nur unvollständige Arbeitskopien und Checkpoints; Originale, freigegebene Pakete und vorhandene Mapping-Exporte bleiben erhalten. Eine Bestätigung nie aus einer allgemeinen Aufräumabsicht ableiten.

Terminale, deterministische und unbekannte Fehler werden nicht fortgesetzt. Nur serverseitig ausdrücklich retryfähige Zustände dürfen nach neuem Nutzerauftrag wiederaufgenommen werden.
