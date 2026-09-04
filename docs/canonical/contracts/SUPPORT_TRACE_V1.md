# Vertrag SUPPORT_TRACE_V1

Status: aktiv für ein ausdrücklich installiertes Debugpaket

## Zweck

Ein technischer Supportlauf macht die Grenzen zwischen Cowork,
MCP-Elternprozess, Picker, Worker, lokalem Review und Ergebnisexport zeitlich
nachvollziehbar, ohne die Datenschutzgrenze zu verschieben. Der normale
Produktweg erzeugt diese zusätzliche Spur nicht.

Für das getrennte Standalone-Produkt gilt derselbe inhaltsfreie Grundvertrag,
aber eine eigene Ereignisprojektion im Standalone-Datenroot. Dort sind nur
geschlossene UI-/CLI-, Picker-, Fortschritts-, Pausen- und Abschlussereignisse
zulässig; MCP-Methoden und Toolnamen dürfen nicht auftreten. Umgekehrt bleiben
Standalone-UI-Aktionen aus der Pluginspur ausgeschlossen.

## Aktivierung

- Der normale ZIP-/Marketplace-Build enthält weiterhin genau zwei Skills und
  setzt keinen Supportschalter.
- Nur der gesonderte, sichtbar als **Debug** gekennzeichnete ZIP-Build setzt
  `EU_PRIVACY_SUPPORT_MODE=1` und ergänzt den manuell aufzurufenden Skill
  `gbh-datasecure-debug-anonymisieren`.
- Der Debug-Skill besitzt `disable-model-invocation: true`, nutzt dieselbe Engine
  und darf weder automatisch gewählt noch als zweiter Verarbeitungsweg gepflegt
  werden.

## Ereignisvertrag

Jedes Supportereignis ist eine eigene unveränderliche JSON-Datei mit höchstens:

- Schema, Zeitpunkt und Gateway-Version,
- zufälliger achtstelliger Lauf- und Tracekennung,
- genau ein Produktkanal aus `plugin` oder `standalone`,
- Eintrag aus geschlossenen Katalogen für Ereignis, JSON-RPC-Methode,
  Produktoperation, Ergebnis und Fehlercode,
- begrenzter Dauer in Millisekunden.

Nicht darstellbar sind Roh-JSON-RPC, Argumente, Ergebnisse, Inhalte, erkannte
Rohwerte, Dateinamen, Pfade, Hashes, Batch-/Paketkennungen, Capabilities,
Zugriffstoken und freie Fehlermeldungen. Unbekannte Werte werden auf neutrale
Festwerte reduziert. Ein Logfehler darf die Anonymisierung weder stoppen noch
freigeben.

## Speicherung und Auswertung

Die Ereignisse liegen ausschließlich lokal unter
`<Produktdatenstamm>/diagnostics/support-events/`, höchstens 2.000 Einträge und
höchstens 14 Tage. Einzeldateien verhindern Lost Updates zwischen Eltern-,
Intake- und Reviewprozess. `diagnostic_status` gibt nur die sichere Projektion
zurück. Ein Diagnosepaket wird weiterhin nur nach ausdrücklicher Bestätigung
lokal exportiert; automatische Telemetrie oder Übertragung existiert nicht.

Nach dem Supportfall wird wieder das normale Paket installiert. Das Debugpaket
ist kein Marketplace- und kein Dauerbetriebsweg.

Auch die allgemeine Fachdiagnose und die kleinere Workflowdiagnose verwenden
dieselbe unveränderliche Einzelereignis-Komponente. Die historischen rollierenden
`events.jsonl`- und `workflow-events.jsonl`-Dateien bleiben nur lesbarer
Upgradebestand und werden nicht mehr fortgeschrieben. Abgelaufene Einzelereignisse
werden auch bei einem reinen Statusabruf physisch entfernt; eine abgelaufene
Legacy-Datei wird nach ihrer Upgrade-Schonfrist ebenfalls gelöscht.

Der Produktkanal trennt nur die zwei lokalen Ereignisprojektionen. Er ist keine
Benutzer-, Installations- oder Dokumentkennung und darf nicht aus Pfaden oder
Prozessumgebungen abgeleitet werden.
