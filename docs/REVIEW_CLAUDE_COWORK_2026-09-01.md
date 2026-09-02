# Claude-/Cowork-Revalidierung

Stand: 02.09.2026 · Produktarbeitsstand RC86 · zeitgebundener Herstellerabgleich
(alle unten genannten Quellen am 02.09.2026 erneut abgerufen)

## Am 02.09.2026 wörtlich belegte Herstelleraussagen

| Quelle | Belegte Aussage | Folge für DataSecure |
|---|---|---|
| Plugins reference | `name` ist das einzige Pflichtfeld in `plugin.json`; `${CLAUDE_PLUGIN_ROOT}` „changes when the plugin updates“ | Manifeste konform; ein Edit im installierten Plugin (z. B. Supportmodus) ist nicht update-fest |
| Plugins reference | Plugin-MCP-Server starten automatisch mit dem Plugin; in Cowork/Cloud werden Skills als `<name>@synced` geladen | Normalweg braucht keinen Startaufruf; in Cloud-Sitzungen ist der Skill sichtbar, der lokale MCP nicht |
| Plugin marketplaces | Pflichtfelder `name`, `owner.name`, `plugins[].name`, `plugins[].source`; Archive über 256 MiB werden abgelehnt | `marketplace.json` konform |
| Skills reference | Kürzung von `description` + `when_to_use` bei 1.536 Zeichen in der Skill-Liste | 200-Zeichen-Grenze ist DataSecure-Konvention, kein Herstellerlimit |
| Subagents | Frontmatter `tools`, `disallowedTools`, `model`, `effort`, `maxTurns` | die drei Projektagenten sind formal gültig |
| Permissions | MCP-Tools mit `requiresUserInteraction` fragen weiterhin nach | Host-Berechtigungsdialoge sind nicht abschaltbar (DS-040) |
| Use plugins in Claude | Plugins dürfen lokale MCP-Server enthalten, die auf dem Rechner laufen | lokaler Plugin-MCP ist ein zulässiger Hostvertrag |
| Manage plugins for your organization | „The file must be a valid .zip under 50 MB.“ | 45-MiB-Ziel für Direkt-Upload ist begründet |
| Cowork architecture overview | „Local MCP servers don't run in sessions in the cloud.“; „Cowork sessions run in the cloud by default“; lokale Ausführung bleibt für Desktop-Deployments verfügbar; Admins können Cloud-Sitzungen aus- und lokale anlassen; MDM `isLocalDevMcpEnabled=false` deaktiviert Plugin-MCPs | Anwender müssen eine lokale Sitzung wählen; IT muss lokale Plugin-MCPs erlauben; Dateibroker ist kein lokaler Lauf |
| Get started with Cowork | Plugins mit lokalen MCP-Servern funktionieren nur über die Desktop-App | Web/Mobil bleiben NO-GO für Originale |
| MCP-Spezifikation 2025-06-18 (tools) | Clients müssen Tool-Annotationen als nicht vertrauenswürdig behandeln; Defaults `destructiveHint=true`, `openWorldHint=true` | Server setzt alle vier Annotationen explizit |
| alle Quellen | kein Vertrag, der dem lokalen MCP den verbundenen Cowork-Arbeitsordner mitteilt | Pfad wird nicht geraten (DS-069) |

## Urteil

Die Produktform passt grundsätzlich zu Claude: zwei schlanke Skills steuern einen
lokalen Plugin-MCP; Originale kommen ausschließlich über den Betriebssystempicker
zum lokalen DataSecure-Prozess; Claude erhält nur freigegebene Ergebnisse. ZIP und
privater Marketplace sind dieselben Produktkanäle. Ein internes Engineering-
Artefakt ist weder Anwenderweg noch Fallback.

Das ist noch keine Plattformfreigabe. Offizielle Syntaxprüfung und automatisierte
Verträge ersetzen weder einen frischen Installationslauf noch den realen Cowork-
Ablauf in der jeweils aktuellen Desktop-App.

## Offizielle Quellen und daraus abgeleitete Grenzen

- [Plugins reference](https://code.claude.com/docs/en/plugins-reference):
  Pluginstruktur, Manifest, Skills und Plugin-MCP-Konfiguration.
- [Claude Code memory](https://code.claude.com/docs/en/memory) und
  [Best practices](https://code.claude.com/docs/en/best-practices): knapper
  versionierter Projektkontext in `CLAUDE.md`; umfangreiche einmalige Aufträge
  bleiben außerhalb dieser dauerhaft geladenen Datei.
- [Claude Code subagents](https://code.claude.com/docs/en/subagents) und
  [Agents](https://code.claude.com/docs/en/agents): projektbezogene Prüfrollen
  unter `.claude/agents`; DataSecure setzt sie nur read-only für unabhängige
  Reviews ein und lässt eine Hauptsession Änderungen konsolidieren.
- [Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude):
  Installation und Verwendung von Plugins in Claude/Cowork.
- [Manage plugins for your organization](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization):
  private Marketplace-Verteilung und Organisationssteuerung.
- [Claude Cowork architecture overview](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview):
  lokale und cloudbasierte Sitzungsgrenzen sowie lokale MCP-Abhängigkeiten.
- [Local MCP servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop):
  separates Desktop-Extension-Verfahren; daraus wird keine Laufzeitzusage für ein
  Plugin-ZIP abgeleitet.

Die belastbare Zusage lautet deshalb: Originalverarbeitung ist ausschließlich in
einer lokalen Cowork-Sitzung der Desktop-App oder in Claude Code zulässig. Lokale
Plugin-MCPs laufen laut aktueller Herstellerdokumentation nicht in Cloud-Sitzungen.
Das gilt auch für Cloud-Cowork in der Desktop-App; deren lokaler Dateibroker ist
kein Ersatz, weil die geöffneten Bytes cloudseitig verarbeitet würden. Chat-Upload,
Web-/Mobilzugriff, verbundene Ordner oder Remote-MCP sind kein Ersatz.

## Aktuell belegter Technikstand

- Plugin und Marketplace sind lokal streng validierbar.
- Genau zwei Skills und ein lokaler Plugin-MCP bilden die sichtbare Oberfläche.
- Der Normalweg pollt nicht und liest Ergebnisse nicht automatisch.
- Beim ersten Lauf wird der bereits verbundene Cowork-Arbeitsordner einmal lokal
  als Ergebnisziel gewählt. Danach benötigt der Normalweg nur die Quellenwahl;
  ausschließlich freigegebenes Markdown wird unter `DataSecure-Output` sichtbar.
- TXT, Markdown, CSV und DOCX sind freigegeben; weitere Formate stoppen fail-closed.
- Bildpixel bleiben lokal; es gibt keinen auswählbaren Bildmodus.
- Nur temporäre Arbeits-/Reviewdaten haben 0–14 Tage Aufbewahrung. Originale und
  fertige Exporte werden niemals automatisch gelöscht.
- Neue private Arbeitskopien verwenden weder Keyring noch Passwort/Keyfile.
- Die Produktpakete verwenden eine fest gepinnte, zielabhängig gebündelte
  Node.js-22.23.2-Runtime. Der Produktstart installiert nichts nach und benötigt
  kein System-Node. Der reale Windows-x64-Smoke mit leerem `PATH` ist grün;
  macOS Intel/ARM bleiben bis zum Zielhostlauf ungeprüft.

## Offene menschliche Nachweise

1. Aktuelles Plugin-ZIP und privater Marketplace jeweils frisch installieren.
2. Windows- und macOS-Cowork-Ablauf mit Picker, Start, Abbruch, Fortsetzung,
   lokalem Review und späterer Ergebnisverwendung durchführen.
3. Die gebündelte Runtime auf macOS Intel und ARM nativ starten und denselben
   MCP-Handshake-/Status-Smoke wie auf Windows belegen.
4. Werkzeugberechtigungen in Manual-/Auto-/Organisationsrichtlinien beobachten.
5. Sicherstellen, dass Originalinhalt, Dateiname, Pfad, Token und Paketkennung nie
   im Chat erscheinen.

Die genaue Durchführung steht im
[versionneutralen UAT-Kit](acceptance/UAT_TEST_KIT/README.md). Kennungen werden dort
immer zusammen mit Klartextnamen und direktem Anleitungslink verwendet.

## Pflegehinweis

Dieser Bericht ist ein zeitgebundener Abgleich, kein zusätzliches Backlog. Offene
Arbeit steht ausschließlich in
[`docs/canonical/BACKLOG.md`](canonical/BACKLOG.md). Frühere Claude-/Cowork-Reviews
liegen unter [`docs/archive`](archive/README.md).
