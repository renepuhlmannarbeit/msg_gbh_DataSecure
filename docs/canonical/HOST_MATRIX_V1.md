# DataSecure-Hostmatrix V1

Stand: 01.09.2026 · offizielle Anthropic-Dokumentation erneut geprüft

Diese Matrix bewertet nicht, wo ein Skill sichtbar ist. Sie entscheidet nur, ob
DataSecure lokale **Originale** annehmen darf.

Begriffsregel: Cowork-Ausführung und MCP-Ausführung sind zwei getrennte Ebenen.
Cowork läuft standardmäßig in der Cloud (für bestehende Desktop-Deployments ist
auch lokale Ausführung verfügbar). Der DataSecure-MCP läuft immer auf dem
Anwenderrechner. Eine auf Desktop gestartete Cloud-Sitzung erreicht ihn nur über
die geöffnete Desktop-App.

| Hostklasse | Originale | Bereits bereinigtes Markdown | Bedingung |
|---|---:|---:|---|
| Cowork in der geöffneten Claude-Desktop-App mit lokalem Plugin-MCP | konditional | ja | gestartete lokale Runtime, aktive Desktop-Brücke und erreichbarer DataSecure-Picker sind beobachtet; die Cowork-Sitzung darf cloudlaufen |
| Claude Code lokal mit lokalem Plugin-MCP | konditional | ja | gestartete Runtime und erreichbarer DataSecure-Picker sind beobachtet |
| Lokale Desktop-Sitzung ohne Local MCP | nein | ja | sichtbarer Skill/Plugin-Eintrag genügt nicht |
| Web oder Mobil ohne aktive Desktop-Brücke | nein | ja | kein Zugriff auf den lokalen Plugin-MCP |
| Geplante Sitzung ohne aktive Desktop-Brücke | nein | ja | kein Zugriff auf den lokalen Plugin-MCP |

## Erreichbarkeit ist keine Host-Attestierung

Nach aktueller [Cowork-Nutzungsdokumentation](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
arbeiten lokale Connectoren und Plugins mit lokalem MCP ausschließlich über die
geöffnete Desktop-App. Die Cowork-Sitzung selbst darf dabei cloudlaufen. Das
ändert den DataSecure-Vertrag nicht: Nur der lokale MCP erhält Originale; ein
direkter Cowork-Dateizugriff oder Chat-Upload ist kein Ersatz.

Der Normalstart prüft die lokale Enginebereitschaft, aber nicht die interne
Ausführungsart der Cowork-Sitzung. Ein Picker-Abbruch ohne Auswahl belegt nur die
Erreichbarkeit. Zusätzlich sind Claude-Version, aktive Desktop-Brücke,
installierte Runtime und beobachtete Rohdatengrenze mit synthetischen Daten
abzunehmen. `privacy_status` und Diagnose sind support-only und keine normale
Voraussetzung.

Chat-Upload, Computer Use, verbundene Ordner, allgemeiner Dateizugriff, Remote-MCP
und andere Connectoren sind keine Ersatzwege. In Web, Mobil, ohne aktive
Desktop-Brücke oder bei unklarer Hostklasse darf der Skill ausschließlich bereits
lokal freigegebenes Markdown verwenden und muss Originalverarbeitung ablehnen.
