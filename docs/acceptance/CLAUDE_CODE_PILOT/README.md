# Lokaler Claude-Code-Pilot – bestehendes DataSecure-Plugin

Stand: 23.09.2026 · BL-041.20 · **Vorbereitet, keine Host-/Produktionsfreigabe.**
Dies ist kein drittes Produkt. Standalone bleibt unabhängig; auch die lokale
Cowork-Abnahme wird nicht durch diesen Pilot ersetzt. Freigegebene Eingabetypen
bleiben TXT, Markdown, CSV, DOCX, XLSX und PPTX. PDF/OCR wird dadurch nicht freigegeben.

## Voraussetzungen und kostenfreier Vorcheck

```powershell
node scripts/check-claude-code-pilot.mjs
```

Der Entwickler-Vorcheck ruft ausschließlich Versions-/Hilfeausgabe und lokale
Plugin-/Marketplace-Validierung auf. Keine Installation, Anmeldung, Aktualisierung
oder Modellanfrage. Exit 2 bedeutet BLOCKED, nicht eine fehlgeschlagene Abnahme.
Die eigentliche Endnutzerinstallation verwendet weiterhin das selbsttragende
Windows-x64-/macOS-x64-/macOS-ARM64-Paket, nicht ein Source-Node-Ersatzpaket.

Am 23.09.2026: lokale CLI über den offiziellen `claude update` von 2.1.267
auf **2.1.280** aktualisiert; Versions-/Hilfe-/Plugin-/Marketplace-Vorcheck PASS.
Keine Modellanfrage. `claude auth status` meldet für diese CLI nicht angemeldet;
das ist keine Aussage über die Anmeldung in Claude Desktop.
Die Pilot-Mindestversion 2.1.273 umfasst auch den zu prüfenden Kontosync.
Der Vorcheck führt selbst kein CLI-Update aus. Linux, WSL, SSH,
Container und Cloud sind für dieses Paket kein abgenommener Ersatz.

## Claude Code in Claude Desktop

Der **Code-Reiter** in Claude Desktop ist eine zweite Bedienoberfläche für
Claude Code, nicht Cowork und kein drittes DataSecure-Produkt. Für den sichtbaren
Abo-Piloten ist er ausdrücklich vorgesehen. Dort **Local** als Umgebung wählen,
einen eigenen leeren Testordner nutzen und die tatsächliche Plugin-Ladequelle,
App-/Engineversion, Werkzeuge und Berechtigungen getrennt erfassen. Eine grüne
CLI-Probe beweist weder App-Version noch Desktop-Ladeweg oder Isolation.

Die folgende CLI-Anleitung ist kein automatisch gleichwertiges Desktop-Profil:
CLI-Flags haben nicht zwingend einen identischen UI-Schalter. Im Code-Reiter
dürfen Originale weder angehängt noch per Drag-and-drop in den Chat gelangen;
nur der lokale DataSecure-Picker darf sie aufnehmen. Native Datei-, Shell-,
Browser-/Computer-Use- und zusätzliche Connector-Wege gesondert prüfen.
Eine bloße Einstellung „Manual“ ist kein Nachweis verweigerten Originalzugriffs.
Fehlt der Nachweis für CC-10, bleibt dieser Host nicht freigegeben.

Herstellerreferenz: [Claude Code Desktop](https://code.claude.com/docs/en/desktop).

## Zwei getrennte Prüfphasen

1. **Begrenzte MCP-Transportprüfung:** in einem eigenen leeren Testordner;
   ausschließlich synthetische Quellen außerhalb dieses Ordners. Die exakte
   paketierte MCP-Konfiguration verwenden, Plugin-Root auf den geprüften lokalen
   Paketpfad auflösen. Mit `--strict-mcp-config` nur diesen Server laden,
   `--tools ""` schaltet eingebaute Werkzeuge aus; `--restricted` und
   `--permission-mode default` beibehalten. Keine weiteren Connectoren,
   IDE-Sitzung, zusätzlichen Verzeichnisse, Hooks oder automatischen Freigaben.
   Diese Phase prüft MCP, **nicht** den geladenen Skill.
2. **Vollständiger Plugin-/Skill-Pilot:** dasselbe exakte ZIP lokal laden,
   tatsächliche Ladequelle, Tools und Berechtigungen in der Sitzung erfassen.
   Skillreferenzen benötigen einen eigenen eng begrenzten Leseweg nur im
   verifizierten Plugin; Original-/Privacy-/Datenroot bleiben ausgeschlossen.
   Sobald andere Werkzeuge Originale erreichen können: FAIL, nicht einfach
   bestätigen. Erst danach Modell-/Native-Fälle ausführen.

Die Flags sind Herstellerfunktionen, keine durch DataSecure attestierte
Hostisolation. `--allowedTools` allein beschränkt nicht das verfügbare Inventar.
Die [CLI-Referenz](https://code.claude.com/docs/en/cli-reference) und
[Berechtigungsdokumentation](https://code.claude.com/docs/en/permissions)
definieren ihre Grenzen. Native-Windows-Sandboxing darf nicht vorausgesetzt werden.
Vor dem ersten Modellaufruf das tatsächliche Werkzeugangebot prüfen; keine
Ausführung mit `bypassPermissions`. Managed Policies können die Sitzung beeinflussen.

## Fall- und Evidenzvertrag

[contract.json](contract.json) definiert 14 Fälle, Zielplattformen und Pflichtfelder.
Pro Plattform eine eigene Aufzeichnung; jeder Fall beginnt bei `NOT_RUN`.
Erfassen: Kandidatencommit, ZIP-SHA, Version, OS/CPU, CLI, tatsächliche Ladequelle,
Toolinventar und Berechtigungen, Testperson und Datum. Je Fall außerdem Ergebnis,
inhaltsfreie Beobachtung und Defect-ID. Bei fehlendem Zielhost: BLOCKED.

- CC-01–06: Installation, native Abbrüche, sechs reale Formate, Review,
  deterministischer Fehler und echter Worker-Checkpoint.
- CC-07–09: ausdrückliche Übergabe, Mehrseiten-/Abbruchpfad, erneute Auswahl in
  neuer Aufgabe sowie abgelaufene/manipulierte Ergebnisse. Wiederverwendung muss
  auch bei einem einzelnen Kandidaten lokal bestätigt werden.
- CC-10–12: Originalzugriff über Datei/Shell/IDE/fremde MCPs verweigern,
  Dokumentanweisungen als Daten behandeln, kollidierende Ordner beidseitig stoppen.
- CC-13–14: Version/Sync/Doppelinstallation, Update/Rollback und falsches Ziel.

Keine reale Personendatei zum Negativtest verwenden. Niemals Rohtexte in Evidence,
Debugausgaben oder Modellprompts aufnehmen. Retention/Hash-Manipulation nur an
eigenen synthetischen Testläufen. Eine erfolgreiche Strukturprüfung belegt keinen Fall.

## Abonutzung und Abnahme – keine zusätzlichen Tokenkosten

Nutzerentscheidung vom 23.09.2026: Modelltests ausschließlich im bestehenden
Claude-Abo und innerhalb seiner enthaltenen Nutzung. **Keine API-/Console-
Abrechnung, keine Usage Credits/Extra Usage und kein automatischer Fallback.**
Der Vorcheck startet keinerlei Modelltest. Vor einem sichtbaren synthetischen
Piloten in Claude Desktop den aktiven Abozugang, enthaltene Nutzung und
deaktivierte kostenpflichtige Fortsetzung prüfen. Bei unbekanntem Abrechnungsweg
oder erreichtem Limit stoppen; weder Credits kaufen noch Einstellungen ändern.

Auch eine CLI-Anmeldung im Abo genügt nicht allein als Kostennachweis: Ein
gesetzter API-Key kann einen anderen Abrechnungsweg wählen. Nur Vorhandensein
prüfen, niemals Schlüssel oder Zugangstoken in Evidence schreiben. Der bisherige
CLI-Status ist `loggedIn: false`; die Desktop-Anmeldung wurde nicht geprüft.
Konten werden nicht automatisch ab- oder angemeldet. Herstellerreferenz:
[Abo und API-Abrechnung](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan).

Der bestehende [Evalplan](../../../evals/plugin-eval/README.md) bleibt maßgeblich;
ein Dollar-Schwellwert ist kein Ersatz für diesen Abonachweis. Nur synthetische
Fälle, keine automatische Veröffentlichung;
echte MCP-Nachweise ohne Toolmocks. Native Dialoge zusätzlich sichtbar prüfen.
Erst nach allen erforderlichen PASS, behobenen Defects und menschlicher
N3/N4-/Hostentscheidung darf dieser Weg für Anwender freigegeben werden.

Kontosync und lokale Installation sind unterschiedliche Ladewege:
[Anthropic Plugins](https://support.claude.com/en/articles/13837440-use-plugins-in-claude).
Ein altes lokales Plugin kann eine synchronisierte Kopie übersteuern:
[Pluginreferenz](https://code.claude.com/docs/en/plugins-reference).
