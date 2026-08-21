# DataSecure IT-Betriebshandbuch

Version 3.2.0 RC16 · Stand 21.08.2026

Dieses Handbuch richtet sich an IT-Administration, Pilotverantwortliche und
Support. RC16 ist ein Engineering-Build für synthetische Testdaten. Es ist weder
produktionsfreigegeben noch signiert und darf nicht mit echten Beschäftigten-,
Bewerber-, Kunden- oder Vertragsdokumenten pilotiert werden.

## 1. Betriebsmodell und Sicherheitsgrenze

DataSecure verarbeitet Originaldateien lokal und veröffentlicht ausschließlich
verifiziertes Markdown sowie automatisch freigegebene PNG-Assets. Originalpfade,
Originalbytes, Review-Texte und lokale Aktionsnachweise sind keine MCP-Read-Daten.

Es existieren zwei Auslieferungswege:

| Artefakt | Ziel | Status RC16 |
|---|---|---|
| `EU-Privacy-Document-Gateway-Windows-v3.2.0-rc16.mcpb` | lokale Claude-Desktop-Extension | bevorzugter Windows-Engineering-Weg; frische Installation noch abzunehmen |
| `DataSecure-Privacy-Preflight-v3.2.0-rc16.zip` | Claude-Plugin/Organisations-Marketplace | Skills plus lokaler MCP; Runtime-Auflösung in der Zielumgebung noch abzunehmen |

Der lokale MCP öffnet keinen Netzwerklistener. Der private Companion verwendet
authentifizierte geerbte stdio-Kanäle. Das ersetzt keine Codesignatur oder
Installationsherkunft.

Plugin-Skills können auch in Web und Cowork erscheinen. Das macht den lokalen MCP
dort nicht verfügbar: Der lokale Dateipfad ist aktuell auf Claude Desktop und Claude
Code begrenzt. Web/Cowork dürfen keine Originaldatei für diesen Preflight erhalten.

## 2. Voraussetzungen

- Unterstützter Pilot: Windows 10/11 mit aktueller Claude-Desktop-Version.
- Desktop Extensions und lokale MCP-Server dürfen nicht durch Enterprise-Richtlinien
  deaktiviert sein.
- Der angemeldete Nutzer benötigt Schreibzugriff auf den konfigurierten lokalen
  Privacy-Ordner.
- Keine Cloud-OCR-, Remote-MCP- oder Upload-Fallbacks für Originaldaten zulassen.
- Nur Artefakte aus demselben grünen `main`-Commit verwenden; SHA-256 vor der
  Installation mit der Release-Evidenz vergleichen.

Claude Desktop stellt für MCPB-Desktop-Extensions eine eingebaute Node.js-Runtime
bereit. Für Endanwender ist keine separate Node-/npm-Installation vorgesehen. Ob
der Plugin-ZIP seinen lokalen `node`-Start ebenfalls ohne Systemruntime auflöst,
muss der frische Plugin-Installationstest belegen; bis dahin keine entsprechende
Zusage machen.

## 3. MCPB auf einem Testrechner installieren

1. Aktuelle Claude-Desktop-Version installieren und anmelden.
2. `Settings → Extensions → Advanced settings` öffnen.
3. Im Extension-Developer-Bereich `Install Extension…` wählen.
4. Das geprüfte `.mcpb` auswählen, Berechtigungen und vier Konfigurationswerte
   kontrollieren:
   - Privacy-Ordner: leer für den Standard unter `Dokumente\Claude Privacy`;
   - Sprache: `de`;
   - Grafikmodus: `strict`;
   - Aufbewahrung: `7` Tage für den Engineering-Test.
5. Claude Desktop vollständig beenden und neu starten.
6. Im Chat „Prüfe bitte den Status von DataSecure“ ausführen.
7. Extension-Status und Logs unter `Settings → Extensions` prüfen, falls die Tools
   fehlen.

Offizielle Referenz, vor jedem Rollout erneut prüfen:
<https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop>.

## 4. Plugin-ZIP bereitstellen

Für einen Einzeltest wird das benutzerdefinierte Plugin unter `Customize → Plugins`
hochgeladen. Für Team/Enterprise soll die Organisation einen manuellen oder
GitHub-synchronisierten Marketplace verwalten. Das Repository muss für die
GitHub-Synchronisierung private oder internal bleiben.

Vor einer Organisationsverteilung:

1. ZIP-Größe und Manifest prüfen.
2. Lokalen MCP-Start in genau der vorgesehenen Claude-Oberfläche belegen.
3. Installationseinstellung zunächst `Available for install`, nicht `Required`.
4. Nur einer kleinen Pilotgruppe zuweisen.
5. Update und Rücknahme mit einer synthetischen Testversion proben.

Aktuelle offizielle Referenzen:

- <https://support.claude.com/en/articles/13837440-use-plugins-in-claude>
- <https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization>

## 5. Technische Startprüfung

Ein grüner Startnachweis umfasst mindestens:

- `privacy_status` antwortet mit Version, Retention und formatbezogenen Fähigkeiten;
- der lokale Privacy-Ordner lässt sich öffnen;
- `Input`, `Output`, `Processed` und `Needs Visual Review` existieren;
- bis zu 25 TXT-/DOCX-Dateien öffnen gemeinsam den privaten Dateidialog und unter
  Windows nacheinander die lokale Textprüfung; ein Einzelfehler blockiert die übrigen
  Dateien nicht;
- der ausgewählte Pfad und der Originaltext erscheinen weder im MCP-Ergebnis noch im
  Jobjournal oder Audit;
- das gepackte MCP beantwortet `initialize`;
- `visual_bridge: unavailable` wird als degradierter, fail-closed Modus behandelt:
  Text darf weiterlaufen, alle Grafiken bleiben zurückgehalten.

Die vollständige Abnahme steht in [PILOT-ABNAHME.md](PILOT-ABNAHME.md).

## 6. Datenablage und Aufbewahrung

| Bereich | Inhalt | Standardverhalten |
|---|---|---|
| `Input` | noch nicht verarbeitete Quellen | wird vom Ordnerworkflow beansprucht |
| `Processed` | verarbeitete Originale des Ordnerworkflows | nach Retention löschbar |
| `Output` | freigegebene Privacy-Pakete | nach Retention löschbar |
| `Needs Visual Review` | lokal zurückgehaltene Vorschauen | keine Freigabe über Claude; Preview verfällt |
| Audit | datensparsame Zähler/Status | keine Rohwerte, Namen, Pfade oder Inhalts-Hashes |

Die TXT-/DOCX-Dateidialog-Originale bleiben an ihrem ursprünglichen Ort; DataSecure
verarbeitet private Arbeitskopien. Andere Formate oder formatgemischte Stapel werden
über `Input` verarbeitet. Löschfehler werden gemeldet und beim nächsten Cleanup erneut
versucht. Unbekannte Verzeichnisse, Symlinks und Junctions werden nicht aggressiv
entfernt.

`purge_local_data` löscht nur nach ausdrücklicher Bestätigung und nur den gewählten
Scope. Vor einem Purge sicherstellen, dass die synthetischen Ergebnisse nicht mehr
für die Abnahme benötigt werden.

## 7. Update und Rollback

RC16 besitzt noch keinen vollständig belegten Upgrade-/Rollback-Prozess. Bis DS-007
abgeschlossen ist:

1. Konfiguration und Artefaktversion protokollieren, niemals Dokumentinhalte.
2. Alle synthetischen Jobs abschließen oder bewusst abbrechen.
3. Neues Artefakt mit höherer Version installieren beziehungsweise im Marketplace
   als neue Version hochladen.
4. Startprüfung und Kernfälle aus `PILOT-ABNAHME.md` wiederholen.
5. Bei Fehlern die neue Version deaktivieren/entfernen und die zuvor geprüfte Version
   erneut installieren.
6. Keine Arbeitsdaten zwischen Versionen manuell kopieren oder Jobjournale verändern.

Ein Produktionsrollout benötigt signierte Artefakte, SBOM, nachvollziehbare
Prüfsummen, dokumentierte Herkunft und einen praktisch bestandenen Rollback.

## 8. Support und Diagnose

Das read-only Werkzeug `diagnostic_status` liefert die letzten maximal 50 Einträge
aus einem lokal auf 14 Tage und 200 Ereignisse begrenzten Journal. Es enthält nur
Verarbeitungsphase, Formatklasse, Profil, Zähler und feste Fehlercodes. Dateiname,
Pfad, Inhalt, erkannte Werte, technische Fehlermeldung und Dokument-Hash werden
nicht geschrieben. Ein Fehler beim Schreiben des Diagnosejournals darf die
Dokumentenverarbeitung nicht blockieren und bleibt als `write_errors` sichtbar.

Erlaubte Diagnoseangaben:

- DataSecure-, Claude-Desktop- und Windows-Version;
- Artefakttyp und nicht sensitiver SHA-256;
- Fehlercode, Formatklasse, Jobzustand, Zähler und Zeitpunkt;
- Angabe, ob `visual_bridge` verfügbar ist.

Nie an Tickets, Chats oder Repositories anhängen:

- Originaldokumente oder Privacy-Outputs;
- Screenshots mit Dokumentinhalt;
- Pfade oder Dateinamen mit Personen-/Kundendaten;
- andere Jobjournale oder lokale Arbeitsordner ohne vorherige Datenschutzprüfung;
- Zugangsdaten, API-Schlüssel oder Identitätsmappings.

Bei einem vermuteten Klartextdurchlass: Verarbeitung stoppen, Ergebnis nicht an Claude
weiterverwenden, betroffene lokale Daten nach interner Incident-Vorgabe sichern oder
löschen und Datenschutz/Security mit ausschließlich datensparsamen Metadaten
informieren.

## 9. Go/No-Go

Ein Pilot ist **No-Go**, solange mindestens einer dieser Punkte offen ist:

- frische Installation, Upgrade und Rollback nicht bestanden;
- Artefakte nicht signiert oder Herkunft nicht freigegeben;
- visuelle, Parser- oder OCR-Unsicherheit kann durch Nutzer/Modell umgangen werden;
- Echtdaten wären für Installation oder Abnahme nötig;
- nur der normale Claude-Dateiupload statt des lokalen DataSecure-Wegs funktioniert;
- menschliche Bedienbarkeit wurde nicht mit synthetischen Daten bestätigt.
