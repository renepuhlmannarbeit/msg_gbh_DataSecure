# DataSecure-Hostmatrix V1

Stand: 23.09.2026 · offizielle Anthropic-Dokumentation erneut geprüft

Diese Matrix bewertet nicht, wo ein Skill sichtbar ist. Sie entscheidet nur, ob
DataSecure lokale **Originale** annehmen darf.

Der zusätzliche Herstellerweg Konto→Claude Code ändert diese Matrix nicht:
Synchronisierung ist keine Host- oder Rohdatengrenzen-Abnahme. Lokales Claude
Code bleibt konditional; Installation, Berechtigungen und GUI-/Modellverhalten
werden separat in BL-041.20 qualifiziert. Die lokale Korrektur zur Ordnertrennung
BL-041.19 muss im tatsächlich geprüften Kandidaten enthalten sein; alte Archive
belegen den neuen Quellstand nicht. Quellen, Details und lokale Nachweise:
[PH-20260923](../REVIEW_PRODUCT_HOSTS_2026-09-23.md).

**Geltungsbereich:** Diese Hostmatrix gilt ausschließlich für das
**DataSecure-Cowork-Plugin**. Das eigenständige Standalone-Produkt verarbeitet
Originale vollständig lokal ohne Claude, Cowork, Skill oder MCP und wird durch
seinen eigenen Plattform- und Paketvertrag abgenommen.

Begriffsregel: Cowork läuft standardmäßig in der Cloud; für bestehende Desktop-
Deployments ist auch lokale Ausführung verfügbar. Der DataSecure-MCP läuft nur
auf dem Anwenderrechner und laut Hersteller ausschließlich in einer lokalen
Sitzung. Eine Cloud-Sitzung erreicht lokale MCP-Server nicht.

| Hostklasse | Originale | Bereits bereinigtes Markdown | Bedingung |
|---|---:|---:|---|
| Lokale Cowork-Sitzung eines bestehenden Desktop-Deployments mit lokalem Plugin-MCP | konditional | ja | lokale Sitzung, gestartete Runtime und erreichbarer DataSecure-Picker sind beobachtet |
| Claude Code lokal mit lokalem Plugin-MCP | konditional | ja | gestartete Runtime und erreichbarer DataSecure-Picker sind beobachtet |
| Lokale Desktop-Sitzung ohne Local MCP | nein | ja | sichtbarer Skill/Plugin-Eintrag genügt nicht |
| Claude-Desktop-Chat außerhalb einer nachgewiesenen lokalen Cowork-Sitzung | nein | ja | Skill-Sichtbarkeit oder ein erreichbares Werkzeug ist noch kein freigegebener Originalpfad |
| Cowork-Sitzung in der Cloud, Web oder Mobil – auch mit geöffneter Desktop-App | nein | ja | lokale MCP-Server laufen laut Hersteller nicht in Cloud-Sitzungen; lokale Dateien würden cloudseitig verarbeitet |
| Geplante Cloud-Sitzung | nein | ja | kein Zugriff auf den lokalen Plugin-MCP |

## Erreichbarkeit ist keine Host-Attestierung

Für lokales Claude Code ist der [eigene Pilotvertrag](../acceptance/CLAUDE_CODE_PILOT/README.md)
mit 14 Fällen vorbereitet. `npm run validate:claude-code-pilot` führt nur
kostenfreie lokale Versions-/Strukturprüfungen aus. Er ersetzt weder native
Dialoge noch Modellabnahme; das Profil bleibt konditional. CLI und der lokale
Code-Reiter von Claude Desktop sind getrennt zu beobachten. Modelltests dürfen
gemäß Nutzerentscheidung nur die enthaltene Abonutzung verwenden, niemals
API-Abrechnung oder kostenpflichtige Zusatznutzung.

Nach aktueller [Cowork-Architekturdokumentation](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)
laufen lokale Plugin-MCPs nur in lokalen Sitzungen bestehender Desktop-
Deployments. Cloud-Sitzungen können lokale Dateien zwar über die Desktop-App
erreichen, verarbeiten diese aber auf Anthropic-Infrastruktur; lokale MCP-
Server laufen dort ausdrücklich nicht. Deshalb sind direkter Cowork-
Dateizugriff, Chat-Upload und Desktop-Dateibrücke kein Ersatz für den lokalen
DataSecure-Picker.

Der Normalstart prüft die lokale Enginebereitschaft, aber nicht die interne
Ausführungsart der Cowork-Sitzung. Ein Picker-Abbruch ohne Auswahl belegt nur die
Erreichbarkeit. Zusätzlich sind Claude-Version, lokale Sitzung,
installierte Runtime und beobachtete Rohdatengrenze mit synthetischen Daten
abzunehmen. `privacy_status` und Diagnose sind support-only und keine normale
Voraussetzung.

Chat-Upload, Computer Use, verbundene Ordner, allgemeiner Dateizugriff, Remote-MCP
und andere Connectoren sind keine Ersatzwege. In Cloud-Cowork, Web, Mobil oder
bei unklarer Hostklasse darf der Skill ausschließlich bereits
lokal freigegebenes Markdown verwenden und muss Originalverarbeitung ablehnen.
