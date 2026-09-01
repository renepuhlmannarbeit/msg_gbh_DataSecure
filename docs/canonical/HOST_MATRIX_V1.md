# DataSecure-Hostmatrix V1

Stand: 01.09.2026 · offizielle Anthropic-Dokumentation erneut geprüft

Diese Matrix bewertet nicht, wo ein Skill sichtbar ist. Sie entscheidet nur, ob
DataSecure lokale **Originale** annehmen darf.

| Hostklasse | Originale | Bereits bereinigtes Markdown | Bedingung |
|---|---:|---:|---|
| Lokale Cowork-Sitzung in Claude Desktop mit lokalem Plugin-MCP | konditional | ja | lokaler Ausführungsmodus, gestartete Runtime und erreichbarer DataSecure-Picker sind beobachtet |
| Cloud-Cowork, auch in Claude Desktop angezeigt | nein | ja | lokale Plugin-MCPs laufen laut Hersteller nicht in Cloud-Sitzungen |
| Claude Code lokal mit lokalem Plugin-MCP | konditional | ja | gestartete Runtime und erreichbarer DataSecure-Picker sind beobachtet |
| Lokale Desktop-Sitzung ohne Local MCP | nein | ja | sichtbarer Skill/Plugin-Eintrag genügt nicht |
| Web oder Mobil | nein | ja | Cowork läuft dort in der Cloud; kein lokaler Plugin-MCP |
| Geplante oder andere Cloud-Sitzung | nein | ja | kein lokaler Plugin-MCP |

## Erreichbarkeit ist keine Host-Attestierung

Nach aktueller [Cowork-Architektur](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)
laufen lokale Plugin-MCPs nur in **lokalen** Desktop-Sitzungen. Cloud-Sitzungen
können zwar über die Desktop-App auf ausdrücklich verbundene lokale Dateien
zugreifen; dabei würden diese Dateien jedoch in der Cloud verarbeitet. Das ist kein
zulässiger Ersatz für DataSecure und keine „Desktop-Brücke“ zum lokalen MCP.

Der Normalstart prüft die lokale Enginebereitschaft, kann aber die Cowork-
Ausführungsart nicht selbst sicher attestieren. Ein Picker-Abbruch ohne Auswahl
belegt nur die Erreichbarkeit. Zusätzlich sind Claude-Version/Ausführungsmodus,
installierte Runtime und beobachtete Rohdatengrenze mit synthetischen Daten
abzunehmen. `privacy_status` und Diagnose sind support-only und keine normale
Voraussetzung.

Chat-Upload, Computer Use, verbundene Ordner, allgemeiner Dateizugriff, Remote-MCP
und andere Connectoren sind keine Ersatzwege. In Web, Mobil, Cloud oder bei
unklarer Hostklasse darf der Skill ausschließlich bereits lokal freigegebenes
Markdown verwenden und muss Originalverarbeitung ablehnen.
