# Claude-/Cowork-Revalidierung

Stand: 12.09.2026 · Quellbasis RC137 · zeitgebundener Herstellerabgleich
(Cowork-Host-, Plugin-, Skill- und MCP-Aussagen am 12.09.2026 erneut abgerufen;
DS-078/DS-093/DS-097/DS-099). Lokale Korrekturen sind noch kein neuer Release.

## Revalidierung 12.09.2026 – Hersteller, Architektur, Sicherheit und Testrealität

Drei unabhängige Read-only-Reviews wurden am sauberen Quellstand `09e1fc9`
konsolidiert. Folgende Befunde sind über diese Kennungen dauerhaft auffindbar;
die Arbeitsführung bleibt ausschließlich im kanonischen Backlog.

| Kennung | Belegter Fehler / Korrektur im Arbeitsstand | Regression und Restgrenze |
|---|---|---|
| CWR-20260912-01 | `configureResultFolder` quittiert jetzt eine vollständig gelieferte terminale Handoff-Seite wie der Privacy-Ordnerwechsel. Zuvor blieb der Wechsel unnötig gesperrt. | Echter Handoff-Zustandsautomat mit terminaler und unvollständiger Seite; unvollständige Übergaben bleiben gesperrt. BL-041.10/.12 |
| CWR-20260912-02 | Die erste Seite nennt zur Übergabe verfügbare Ergebnisse statt alle Ergebnisse als bereits geliefert auszugeben. | Sechs Dokumente, mehrere Textchunks, synchrone/asynchrone Snapshotpfade, Quittierung und Abbruch. BL-041.12 |
| CWR-20260912-03 | Statusprojektion liest echte Core-Zähler/-Phasen einschließlich verschachteltem `batch`. Abgelehnter Aufruf und weiterlaufender Stapel bleiben getrennt. | Produktionsechtes `publicProgress`, aktive Verarbeitung, lokaler Review und terminaler Zustand. BL-041.12 |
| CWR-20260912-04 | Fehlendes Worker-ACK bedeutet `unknown`, nicht bewiesenen Nichtstart. Veraltete Vorab-Progressdaten überschreiben diese Unsicherheit nicht. | ACK-Timeout, ungültige Startantwort und unbekannte Fehler; kein automatischer Neustart. BL-041.12, DS-097 |
| CWR-20260912-05 | Nativer Abbruch der Ergebnisauswahl bleibt eine feste Diagnosekennung und `cancelled`, statt zum internen Fehler zu werden. | Echte stdio-Abbruch-/Parallelaufrufe mit kontrollierter nativer Dialoggrenze. BL-041.12 |
| CWR-20260912-06 | Ungültige MCP-Hüllen erhalten definierte Fehler; aktive doppelte IDs dürfen keine Cancel-Zuordnung überschreiben. | Echte stdio-Frames für primitive Werte, ungültige IDs/Params, Notifications und nachfolgenden gültigen Ping. BL-041.8 |
| CWR-20260912-07 | Mehrere fertige Stapel sind im lokalen Picker anhand Datum/Uhrzeit und Sortierhinweis unterscheidbar. | Zeitpunkte werden streng projiziert; unbekannter Zeitpunkt explizit, keine Rückgabe von Datum/Pfaden/Kennungen an Claude. Sichtbare Auswahl bleibt UAT. BL-041.13 |
| CWR-20260912-08 | Der manuelle Cowork-Releaseworkflow benötigt nun einen nativen Start der exakt erzeugten ZIPs auf jedem gewählten Zielhost. Linux-Paketprüfung allein ist kein nativer Nachweis. | `--require-native` verweigert fremde Hosts. Manifest → Initialize → Tools → ungefährlicher Toolaufruf → EOF und Cacheprüfung. Neue Mac-Jobs noch nicht ausgeführt. BL-010.8, BL-041.8 |
| CWR-20260912-09 | Der ZIP-Prüfer erhält geprüfte Execute-Bits auf macOS und isoliert dessen Datenwurzel. Bisher verloren entpackte Runtime-Dateien ihre Ausführbarkeit und der Cachepfad lag falsch. | Windows-Paketstart lokal; native macOS-Ausführung erst im manuellen Zielhost-Gate. BL-010.8 |
| CWR-20260912-10 | `CLAUDE.md` verweist nicht mehr auf einen vermeintlich aktiven RC123-Auftrag und trennt Formatumfang sowie Zuordnungsdatei korrekt nach Produkt/Zweck. | Dokumentationsvertrag verhindert Wiederkehr der veralteten Kurzregeln. |
| CWR-20260912-11 | Der Marketplace-Bau wählte alphabetisch ein altes Mac-ZIP derselben Version statt des frisch gebauten Windows-ZIPs. Jetzt: exakte Hostwahl, gemeinsamer Quellbyte-Guard vor jeder Ausgabeänderung, Runtime-/Manifestprüfung, erhaltene Execute-Bits und abschließender Bytevergleich mit dem tatsächlichen ZIP. | `test-marketplace-projection.mjs`: Quellmutation/fehlende Dateien, echter ungültiger ZIP ohne Ausgabeänderung und `--artifact` gegen das fertige Produkt. `PROJECTION-EVIDENCE.json` bindet Archivhash und Ziel, behauptet keinen nativen Start. Mac-Projektion auf Windows wird verweigert; POSIX-/Git-Execute-Bits bleiben Releasevoraussetzung. BL-010.8, BL-041.14 |

Die Architekturentscheidung DS-078 bleibt bestehen: Cloud-Cowork ist der
Herstellerstandard, aber kein DataSecure-Originalweg. Lokale Plugin-MCPs laufen
dort nicht; die Desktop-Brücke macht Cloud-Verarbeitung nicht lokal. Die
MDM-Schalter für lokale MCPs und Desktop-Extensions sind unterschiedliche
Admin-Grenzen. [Anthropic-Architektur](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)

Lokaler Abschlussnachweis: `npm run test:product` bestand 179 Testdateien
(63 Basis- und 116 direkte Tests). Anschließend wurden die zusätzlichen
Marketplace-Regressionen einschließlich veraltetem Zusatzmodul/entferntem Skill
und fehlenden/geänderten Quellbytes geprüft. `npm run build`, Normal- und
Debug-ZIP-Verifikation bestanden auf Windows mit realem gebündeltem
MCP-Prozess, ebenso Dokumentationsverträge und die lokale Claude-CLI-
Manifestprüfung. Die neue kleine Marketplace-Regression ist nun auch in der
Basisliste enthalten. Das ist E0, keine sichtbare Cowork- oder Modellabnahme.
Keine kostenpflichtigen Actions wurden gestartet, keine neuen Pakete
veröffentlicht und keine fremden Repositories geändert.

Claude-Code-Pluginpfade können sich bei Updates ändern. Die dort dokumentierte
persistente Plugin-Datenablage wird bei letzter Deinstallation ebenfalls
entfernt; sie ersetzt daher weder unseren langlebigen Runtimecache noch
Nutzerergebnisse. Code-spezifische `roots/list`-/Reload-Möglichkeiten begründen
keine automatische Cowork-Ordnerfreigabe. Der selbsttragende Start ohne
nachträgliche Installation bleibt erhalten.
[Pluginreferenz](https://code.claude.com/docs/en/plugins-reference)

Knapper Hauptskill, gezielte Referenzen und repräsentative Evaluationen passen
zu Anthropic-Empfehlungen. Strukturtests und tatsächliche Modellläufe bleiben
getrennte Nachweise; die vorhandenen 41×3- und 12×3-Matrizen werden nicht durch
gemockte Antworten ersetzt.
[Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

MCP verlangt String-/Integer-Request-IDs und verbietet `null` sowie
Wiederverwendung innerhalb einer Sitzung. Der Server weist insbesondere
gleichzeitig aktive doppelte IDs zurück; Clients bleiben für eindeutige
Session-IDs verantwortlich. Nur echte Notifications bleiben ohne Antwort.
[MCP-Basisprotokoll](https://modelcontextprotocol.io/specification/2025-11-25/basic)

## Aktuell belegte Herstelleraussagen

| Quelle | Belegte Aussage | Folge für DataSecure |
|---|---|---|
| Plugins reference | `name` ist das einzige Pflichtfeld in `plugin.json`; `${CLAUDE_PLUGIN_ROOT}` „changes when the plugin updates“ | Manifeste konform; ein Edit im installierten Plugin (z. B. Supportmodus) ist nicht update-fest |
| Plugins reference | Plugin-MCP-Server starten automatisch mit dem Plugin; Skills sind in unterstützten Oberflächen sichtbar | Sichtbarkeit beweist keinen laufenden lokalen MCP; der Originalweg prüft die lokale Runtime und den Picker |
| Plugin marketplaces | Pflichtfelder `name`, `owner.name`, `plugins[].name`, `plugins[].source`; Archive über 256 MiB werden abgelehnt | `marketplace.json` konform |
| Skills reference | Kürzung von `description` + `when_to_use` bei 1.536 Zeichen in der Skill-Liste | 200-Zeichen-Grenze ist DataSecure-Konvention, kein Herstellerlimit |
| Subagents | Frontmatter `tools`, `disallowedTools`, `model`, `effort`, `maxTurns` | die drei Projektagenten sind formal gültig |
| Permissions | MCP-Tools mit `requiresUserInteraction` fragen weiterhin nach | Host-Berechtigungsdialoge sind nicht abschaltbar (DS-040) |
| Use plugins in Claude | Plugins dürfen lokale MCP-Server enthalten, die auf dem Rechner laufen | lokaler Plugin-MCP ist ein zulässiger Hostvertrag |
| Manage plugins for your organization | „The file must be a valid .zip under 50 MB.“ | 45-MiB-Ziel für Direkt-Upload ist begründet |
| Cowork architecture overview | Cowork läuft standardmäßig in der Cloud; lokale Sitzungen bleiben für bestehende Desktop-Deployments verfügbar; lokale MCP-Server laufen ausdrücklich nicht in Cloud-Sitzungen und lokale Dateien, die eine Cloud-Sitzung über Desktop öffnet, werden cloudseitig verarbeitet | Originale nur in lokaler Cowork-Sitzung mit laufendem DataSecure-MCP oder lokalem Claude Code; Cloud-Cowork/Web/Mobil/Scheduled nur für bereits freigegebenes Markdown |
| Get started with Cowork | Cowork benötigt eine aktive Internetverbindung; Auto kann sichere Leseaktionen automatisch erlauben, Organisationsrichtlinien können trotzdem Freigaben erzwingen | „lokale Verarbeitung“ nicht mit „Claude läuft offline“ verwechseln; Skip ist kein DataSecure-Standard für sensible Dateien |
| MCP-Spezifikation 2025-06-18 (tools) | Clients müssen Tool-Annotationen als nicht vertrauenswürdig behandeln; Defaults `destructiveHint=true`, `openWorldHint=true` | Server setzt alle vier Annotationen explizit |
| alle Quellen | kein Vertrag, der dem lokalen MCP den verbundenen Cowork-Arbeitsordner mitteilt | Pfad wird nicht geraten; ausdrückliche Gerätewahl bleibt bestehen (DS-080) |

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
den tatsächlich verbundenen lokalen DataSecure-MCP in einer lokalen Cowork-
Sitzung eines bestehenden Desktop-Deployments oder in lokalem Claude Code
zulässig. In Cloud-Sitzungen laufen lokale MCP-Server nicht; über Desktop
geöffnete lokale Dateien werden dort cloudseitig verarbeitet. Chat-Upload,
Cloud-Cowork, Web/Mobil, geplante Cloud-Aufgaben, verbundene Ordner oder Remote-
MCP sind kein Ersatz.

## Aktuell belegter Technikstand

- Plugin und Marketplace sind lokal streng validierbar.
- Genau zwei Skills und ein lokaler Plugin-MCP bilden die sichtbare Oberfläche.
- Der Normalweg pollt nicht und liest Ergebnisse nicht automatisch.
- Beim ersten Lauf wird einmal ein dedizierter lokaler Ergebnisordner gewählt.
  Optional kann er innerhalb des bereits verbundenen Cowork-Ordners liegen;
  Originale bleiben außerhalb aller mit Cowork verbundenen Ordner. DataSecure errät keinen
  Projektpfad und wechselt das Ziel bei einem Projektwechsel nicht. Danach
  benötigt der Normalweg nur die Quellenwahl;
  ausschließlich freigegebenes Markdown wird unter `DataSecure-Output` sichtbar.
- TXT, Markdown, CSV und DOCX werden direkt verarbeitet. XLSX und PPTX werden
  durch den lokalen isolierten Office-Parser in Markdown extrahiert; ausschließlich
  dieses Markdown wird anonymisiert. PDF, Scan-PDF und eigenständige Bilder
  stoppen im Cowork-Produkt weiterhin fail-closed.
- Bildpixel bleiben lokal; es gibt keinen auswählbaren Bildmodus.
- Nur temporäre Arbeits-/Reviewdaten haben 0–14 Tage Aufbewahrung. Originale und
  fertige Exporte werden niemals automatisch gelöscht.
- Neue private Arbeitskopien verwenden weder Keyring noch Passwort/Keyfile.
- Die Produktpakete verwenden eine fest gepinnte, zielabhängig gebündelte
  Node.js-22.23.2-Runtime. Der Produktstart installiert nichts nach und benötigt
  kein System-Node. Der reale Windows-x64-Smoke mit leerem `PATH` ist grün;
  die zentrale Cowork-ZIP-Prüfung auf Linux beweist dagegen keinen nativen
  Pluginstart auf macOS Intel/ARM. Standalone-Mac-Smokes sind davon getrennt.

## RC125-Gegenprüfung

Der erneute Abgleich bestätigt die zuvor dokumentierte, inzwischen besonders
wichtige Sitzungsgrenze: Cowork startet Sitzungen standardmäßig in der Cloud.
Lokale Plugin-MCP-Server laufen nur in einer lokalen Sitzung eines bestehenden
Claude-Desktop-Deployments; eine Cloud-Sitzung kann lokale Dateien zwar über die
geöffnete Desktop-App erreichen, verarbeitet sie dann aber auf Anthropic-
Infrastruktur. DataSecure darf Originale deshalb weiterhin ausschließlich über
seinen eigenen Betriebssystempicker an den nachweislich laufenden lokalen MCP
übergeben. Skill-Sichtbarkeit allein ist kein Laufzeitnachweis.

Die RC124-Officefreigabe ändert diese Grenze nicht. XLSX/PPTX werden nur im
lokalen Pluginprozess extrahiert. Der Promptvertrag enthält die sechs aktuell
freigegebenen Formate jetzt direkt als kanonischen Textbaustein, statt einen
veralteten Vier-Format-Satz nachträglich per Stringersetzung umzuschreiben. Der
SEA-Crashvertrag prüft beide asynchronen Konvertierungszweige und die neue
Markdown-first-Schicht vor Veröffentlichung des `extracted`-Checkpoints.

## Offene menschliche Nachweise

1. Aktuelles Plugin-ZIP und privater Marketplace jeweils frisch installieren.
2. Windows- und macOS-Cowork-Ablauf mit Picker, Start, Abbruch, Fortsetzung,
   lokalem Review und späterer Ergebnisverwendung durchführen.
3. Nach bestandenem automatisierten nativen ZIP-Smoke zusätzlich den echten
   Claude-Pluginstart auf macOS Intel/ARM beobachten. Der neue verpflichtende
   ZIP-Smoke ist noch auszuführen; er ist technische Evidence und keine
   menschliche Freigabe.
4. Werkzeugberechtigungen in Manual-/Auto-/Organisationsrichtlinien beobachten.
5. Sicherstellen, dass Originalinhalt, Dateiname, Pfad, Token und Paketkennung nie
   im Chat erscheinen.

Die produktbezogenen Fälle stehen im
[versionneutralen UAT-Kit](acceptance/UAT_TEST_KIT/README.md). Der
[formale N3/N4-Rahmen](acceptance/FORMAL_UAT/README.md) bindet sie an denselben
Kandidaten wie die Standalone-Abnahme, hält Plattform- und Produktevidence aber
getrennt. Kennungen werden immer zusammen mit Klartextnamen und direktem
Anleitungslink verwendet.

## Pflegehinweis

Dieser Bericht ist ein zeitgebundener Abgleich, kein zusätzliches Backlog. Offene
Arbeit steht ausschließlich in
[`docs/canonical/BACKLOG.md`](canonical/BACKLOG.md). Frühere Claude-/Cowork-Reviews
liegen unter [`docs/archive`](archive/README.md).
