# DataSecure-Hostmatrix V1

Diese Matrix ist die menschenlesbare Fassung von `HOST_MATRIX_V1.json`. Sie bewertet
nicht, ob eine Claude-Oberfläche grundsätzlich Skills anzeigen kann. Sie entscheidet
nur, ob DataSecure in diesem Pilot lokale **Originale** verarbeiten darf.

| Hostklasse | Originale | Bereits bereinigtes Markdown | Bedingung |
|---|---:|---:|---|
| Cowork Desktop mit Local MCP | konditional | ja | genehmigte Host-/Datengrenzenevidenz plus erreichbarer lokaler Picker |
| Claude Code lokal mit Local MCP | konditional | ja | genehmigte Host-/Datengrenzenevidenz plus erreichbarer lokaler Picker |
| Desktop ohne erreichbaren Local MCP | nein | ja | sichtbarer Skill/Plugin-Eintrag genügt nicht |
| Claude Web | nein | ja | im Pilot nicht als Originalpfad freigegeben |
| Claude Mobile | nein | ja | im Pilot nicht als Originalpfad freigegeben |
| Cloud-/Scheduled-Sitzung | nein | ja | im Pilot nicht als Originalpfad freigegeben |

## Erreichbarkeit ist keine Host-Attestierung

Diese Matrix ist eine Abnahmepolicy, keine technisch implementierte Erkennung der
Claude-Ausführungsart. Der Normalstart prüft lokale Enginebereitschaft, attestiert
aber nicht den Sitzungsort. Ein Picker-Abbruch ohne Auswahl belegt Erreichbarkeit;
separat sind Claude-Version/Ausführungsart, installierte Runtime und beobachtete
Rohdatengrenze zu dokumentieren. Auch Desktop kann Cloud-Ausführung vermitteln.
Eine sichtbare lokale Oberfläche ist deshalb kein hinreichender Nachweis.
`privacy_status` und Diagnose sind support-only und ebenfalls keine Host-Attestierung.
Ein zusätzlicher modellseitiger Statusaufruf ist kein normaler Voraussetzungsschritt.
Chat-Upload,
Computer-Use, allgemeiner Dateizugriff und andere Connectoren sind keine Ersatzwege.
Bei ungeklärter Konfiguration bleibt der Originalpfad gesperrt; IT muss die
vorgesehene Hostkonfiguration mit synthetischen Daten prüfen. Neue Brokerfähigkeit
bedeutet keine automatische Freigabe von Web, Mobil oder Cloud.

Die Quellen und ihr Prüfdatum stehen in der JSON-Fassung. Widersprüchliche oder neue
Herstellerangaben ändern diese konservative Pilotfreigabe erst nach einer separaten,
beobachteten Abnahme.
