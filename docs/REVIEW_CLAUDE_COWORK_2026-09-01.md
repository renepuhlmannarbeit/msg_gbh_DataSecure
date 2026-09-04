# Claude-/Cowork-Revalidierung

Stand: 04.09.2026 · Produktarbeitsstand RC94 · zeitgebundener Herstellerabgleich
(Cowork-Host- und Marketplace-Aussagen am 04.09.2026 erneut abgerufen)

## Aktuell belegte Herstelleraussagen

| Quelle | Belegte Aussage | Folge für DataSecure |
|---|---|---|
| Plugins reference | `name` ist das einzige Pflichtfeld in `plugin.json`; `${CLAUDE_PLUGIN_ROOT}` „changes when the plugin updates“ | Manifeste konform; ein Edit im installierten Plugin (z. B. Supportmodus) ist nicht update-fest |
| Plugins reference | Plugin-MCP-Server starten automatisch mit dem Plugin; in Cowork/Cloud werden Skills als `<name>@synced` geladen | Normalweg braucht keinen manuellen Serverstart; der lokale MCP-Prozess bleibt auf dem Rechner und kann von einer auf Desktop gestarteten Cloud-Sitzung über die aktive Desktop-Brücke erreicht werden |
| Plugin marketplaces | Pflichtfelder `name`, `owner.name`, `plugins[].name`, `plugins[].source`; Archive über 256 MiB werden abgelehnt | `marketplace.json` konform |
| Skills reference | Kürzung von `description` + `when_to_use` bei 1.536 Zeichen in der Skill-Liste | 200-Zeichen-Grenze ist DataSecure-Konvention, kein Herstellerlimit |
| Subagents | Frontmatter `tools`, `disallowedTools`, `model`, `effort`, `maxTurns` | die drei Projektagenten sind formal gültig |
| Permissions | MCP-Tools mit `requiresUserInteraction` fragen weiterhin nach | Host-Berechtigungsdialoge sind nicht abschaltbar (DS-040) |
| Use plugins in Claude | Plugins dürfen lokale MCP-Server enthalten, die auf dem Rechner laufen | lokaler Plugin-MCP ist ein zulässiger Hostvertrag |
| Manage plugins for your organization | „The file must be a valid .zip under 50 MB.“ | 45-MiB-Ziel für Direkt-Upload ist begründet |
| Use Claude Cowork on web, desktop and mobile | Cowork läuft standardmäßig in der Cloud; lokale Connectoren und Plugins mit lokalem MCP arbeiten ausschließlich über die geöffnete Desktop-App | Die Sitzung darf cloudlaufen, während DataSecure-Prozess und Originalverarbeitung lokal bleiben; Web/Mobil ohne Desktop-Brücke bleiben NO-GO für Originale |
| Get started with Cowork | Cowork benötigt eine aktive Internetverbindung; Auto kann sichere Leseaktionen automatisch erlauben, Organisationsrichtlinien können trotzdem Freigaben erzwingen | „lokale Verarbeitung“ nicht mit „Claude läuft offline“ verwechseln; Skip ist kein DataSecure-Standard für sensible Dateien |
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

Die belastbare Zusage lautet deshalb: Originalverarbeitung ist ausschließlich über
den tatsächlich verbundenen lokalen DataSecure-MCP in der geöffneten Desktop-App
oder in Claude Code zulässig. Cowork darf die Sitzung in der Cloud ausführen; der
DataSecure-Prozess und die Originalverarbeitung bleiben lokal und werden über die
Desktop-Brücke erreicht. Chat-Upload, Web-/Mobilzugriff ohne Desktop-Brücke,
verbundene Ordner oder Remote-MCP sind kein Ersatz.

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
