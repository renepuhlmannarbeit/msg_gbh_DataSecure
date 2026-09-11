# Lokale Konfiguration

`configure_result_folder` nur auf ausdrücklichen Wunsch zum Ändern oder Zurücksetzen der gespeicherten Ergebnisordnerwahl verwenden. Die lokale Ordnerauswahl ist die Bestätigung; der Pfad wird nicht an Claude zurückgegeben. Nach Änderung `user_status` genau einmal wörtlich wiedergeben. Cloud-Sync-/Netzwerkhinweise niemals aus Einzel-Flags zusammensetzen. Ein Reset entfernt nur die gespeicherte Auswahl, nicht vorhandene Ergebnisse.

`configure_privacy_folder(confirmed=true)` nur auf ausdrücklichen Wunsch. Offene Stapel müssen vorher abgeschlossen, fortgesetzt oder verworfen sein. Der Betriebssystemdialog und die Speicherprüfung bleiben lokal; kein Pfad gelangt an Claude.

Keines der Werkzeuge beweist oder erkennt, ob ein Ordner mit Cowork verbunden ist. Das ist eine dokumentierte Anwender- und UAT-Voraussetzung, keine Modellannahme.
