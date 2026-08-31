# Claude-Best-Practices: unabhängige Revalidierung

Stand 31.08.2026. Ausgangspunkt: `afdb1dc`, Produkt 3.2.0-rc66.
Architektur-/Integrations- und UX-/Skill-Review durch zwei unabhängige Subagenten;
Befunde durch Hauptagent gegen Code und aktuelle offizielle Quellen geprüft.
Keine echte Cowork-Modell-/Hostabnahme und keine Behauptung vollständiger Fehlerfreiheit.

## Entscheidung und Scope

Lokaler Node-MCP, zwei schlanke Skills und ZIP/Marketplace bleiben geeignet.
Kein Sprachwechsel, Remote-PII-Dienst, Uploadfallback, zusätzliches Normaltool
oder globaler Berechtigungsbypass. Zuerst die widersprüchlichen Verträge reparieren;
MCP-App-Komfort und neue Formate folgen den bestehenden Backlog-Gates.

| Befund | Priorität | Korrektur und Nachweis |
|---|---|---|
| RV-01 | P1 | Diagnose ist support-only, aber UAT und Fehlerdialog verlangen sie im Normalmodus. Picker-Abbruchtest und erreichbaren Supportweg herstellen. |
| RV-02 | P2 | Öffentlicher Picker bietet nicht verfügbares `continue_in_chat`. Normalmodus separat projizieren; Supportzugriff bleibt serverseitig gesperrt. |
| RV-03 | P2 | Beispiele und Eval erwarten alte Paketkennungen/automatische Analyse. Mit local_only und späterer ausdrücklicher Übergabe vereinheitlichen. |
| RV-04 | P2 / E1-P0 | Offizielle CLI-Validierung lokal reproduzierbar machen. Sie beweist Struktur, nicht Installation, lokale Node-Auflösung oder Cowork-Verhalten. |
| RV-05 | P1-Evidenz | Die Desktop-Oberfläche beweist nicht lokale Sitzungsausführung. Hostmatrix darf eine Diagnose nicht mit einer Ausführungsort-Attestierung verwechseln. |

Verbindliche Zuordnung und Arbeitsstatus: [Backlog-Korrekturscheibe](canonical/BACKLOG.md#korrekturscheibe-claude-vertrag-vom-31082026).
Keine doppelten User Stories; gemischte E0/E1-Stories werden nicht als vollständig erledigt archiviert.

## Quellen und daraus gezogene Grenzen

- [Plugin-Referenz](https://code.claude.com/docs/en/plugins-reference): Manifest,
  Komponentenstruktur und `claude plugin validate`; Code-Validierung ist keine Cowork-Zertifizierung.
- [Plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude):
  Plugin-/Skill-Sichtbarkeit und lokaler MCP sind unterschiedliche Fähigkeiten;
  Organisationsrichtlinien bleiben maßgeblich.
- [Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices):
  kurze Anweisungen, gezielte Referenzen und echte Verhaltensevaluation.
- [Cowork-Architektur](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview):
  Cloud-Ausführung kann auch aus der Desktop-Oberfläche erfolgen; lokale Werkzeuge
  können über Desktop vermittelt werden. Schlussfolgerung für DataSecure: sichtbares
  Fenster oder erfolgreicher MCP-Aufruf allein belegen keine geprüfte Hostkonfiguration.
- [Lokale Desktop-MCPs](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop):
  eingebaute Node-Runtime für Desktop Extensions nicht ungeprüft auf Plugin-ZIP übertragen.

## Ergebnis der Korrekturscheibe

RV-01 bis RV-05 sind im RC67-Arbeitsstand auf E0-Ebene bearbeitet. Die zweite
Architektur-Gegenprüfung bestätigte Schema-/Supportsperren, testseitige Isolation
und den lokalen Validator; ihr zusätzlicher MD-/JSON-Hostwiderspruch wurde korrigiert
und regressionsgetestet. Nachweis, Kommandos und Artefakthashes stehen in
[TESTING.md](TESTING.md#lokaler-rc67-nachweis-31082026).
Keine autonome Host-Erkennung neu implementiert, keine Cloud-Freigabe erteilt.

### Weiterhin erforderliche reale Abnahme

Reale Windows-/macOS-Fresh-Install-, Update-/Rollback-, Berechtigungs-, Fokus-,
Screenreader- und Modelltests bleiben offen. Ebenso Messung der wahrgenommenen
Latenz auf Zielhardware. Keine neuen GitHub Actions für diese Revalidierung;
automatisierte Prüfungen laufen lokal. Formate außerhalb TXT/Markdown/CSV/DOCX
bleiben gesperrt. Originale werden weder geändert noch gelöscht.
