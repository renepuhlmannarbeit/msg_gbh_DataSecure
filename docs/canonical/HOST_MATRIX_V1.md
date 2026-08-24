# DataSecure-Hostmatrix V1

Diese Matrix ist die menschenlesbare Fassung von `HOST_MATRIX_V1.json`. Sie bewertet
nicht, ob eine Claude-Oberfläche grundsätzlich Skills anzeigen kann. Sie entscheidet
nur, ob DataSecure in diesem Pilot lokale **Originale** verarbeiten darf.

| Hostklasse | Originale | Bereits bereinigtes Markdown | Bedingung |
|---|---:|---:|---|
| Cowork Desktop mit Local MCP | konditional | ja | lokaler Start prüft Engine und Hostbindung implizit |
| Claude Code lokal mit Local MCP | konditional | ja | lokaler Start prüft Engine und Hostbindung implizit |
| Desktop ohne erreichbaren Local MCP | nein | ja | sichtbarer Skill/Plugin-Eintrag genügt nicht |
| Claude Web | nein | ja | im Pilot nicht als Originalpfad freigegeben |
| Claude Mobile | nein | ja | im Pilot nicht als Originalpfad freigegeben |
| Cloud-/Scheduled-Sitzung | nein | ja | im Pilot nicht als Originalpfad freigegeben |

## Verbindlicher Laufzeitnachweis

Der einzige Normalstart prüft Engine und lokale Hostbindung implizit vor dem
Dateidialog. Bei fehlender oder fehlerhafter Bindung stoppt DataSecure vor Datei-
und Ordnerzugriff. Ein zusätzlicher modellseitiger `privacy_status`-Aufruf ist kein
Voraussetzungsschritt und erzeugt keinen weiteren Bestätigungsdialog. Chat-Upload,
Computer-Use, allgemeiner Dateizugriff und andere Connectoren sind keine Ersatzwege.
Die Nutzerempfehlung beschränkt sich auf eine neue unterstützte lokale Desktop-/
Claude-Code-Sitzung oder eine IT-Prüfung.

Die Quellen und ihr Prüfdatum stehen in der JSON-Fassung. Widersprüchliche oder neue
Herstellerangaben ändern diese konservative Pilotfreigabe erst nach einer separaten,
beobachteten Abnahme.
