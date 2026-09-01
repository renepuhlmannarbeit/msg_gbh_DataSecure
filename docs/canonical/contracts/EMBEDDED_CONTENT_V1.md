# Eingebettete und aktive Inhalte V1

Status: **Engineering-Vertrag; in freigegebenen Formaten fail-closed gesperrt** · Story: BL-020.2 ·
Entscheidung: DS-017

Dieser Vertrag erweitert keine veröffentlichte Eingabeformatliste. Er regelt, wie
bereits geöffnete OOXML-Container mit eingebetteten Dateien umgehen, ohne Inhalte
auszuführen, nachzuladen oder unbemerkt auszulassen.

## Statische Einbettungen im aktuellen Produkt

Jeder Part unter `word/embeddings`, `xl/embeddings` oder `ppt/embeddings` wird bereits
in der lokalen Verzeichnisvorprüfung als aktiver beziehungsweise nicht vollständig
abgedeckter Inhalt erkannt. Die Eingangsdatei wird vor Snapshot und Parserfreigabe
mit einem inhaltsfreien Fehler gestoppt. Das gilt auch für statische `.docx`-,
`.xlsx`- und `.pptx`-Einbettungen. Der aktuelle Produktpfad behauptet daher **keine**
rekursive Freigabe eingebetteter Office-Dateien.

Der rekursive OOXML-Parser und seine Container-Locators bleiben ein isolierter
Engineering-Harness für eine mögliche spätere Formatstory. Sie erweitern weder die
Allowlist noch umgehen sie die frühere Quellprüfung. Eine spätere Freigabe erfordert
einen vollständigen eigenen Preflight-, Relationship-, Ressourcen- und
Datenschutz-Nachweis für jedes Kindpaket.

Die `package`-Beziehung muss außerdem aus einem vom formatspezifischen Parser
tatsächlich erreichten Inhalts-Part stammen. Eine Beziehung aus einem verwaisten
`customXml`- oder sonstigen nicht erreichten Part kann eine gleichnamige Einbettung
nicht legitimieren.

## Gemeinsames Ressourcenbudget

Das Budget gilt für den vollständigen Dokumentbaum, nicht pro Kind:

- höchstens 3 Ebenen eingebetteter Dokumente,
- höchstens 20 eingebettete Dokumente,
- höchstens 50 MiB eingebettete Archivbytes,
- höchstens 100 MiB tatsächlich entpackte eingebettete Bytes.

Ein überschrittenes Budget stoppt die betroffene Freigabe fail-closed. Der äußere
isolierte Parser behält zusätzlich seine Prozess-, Antwort- und Zeitgrenzen. Das
verbleibende Entpackbudget wird schon an den ZIP-Reader übergeben und damit vor der
Dekompression erzwungen.

## Aktive und externe Inhalte

VBA-Projekte, OLE-Objekte, ActiveX, Controls, angehängte Vorlagen, externe Links und
andere ausführbare oder nicht unterstützte Einbettungen werden weder gestartet noch
als abgedeckter statischer Inhalt behandelt; externe Beziehungen werden niemals
aufgelöst. Sie erzeugen eine inhaltsfreie Coverage-Warnung; das Dokument bleibt bis
zu einer späteren lokalen Entscheidung gesperrt.

## Nachweisgrenze

Der Produktnachweis belegt das frühe Sperren aller Einbettungen sowie negative
Makro-, OLE-, ActiveX- und Korruptionspfade. Der Engineering-Harness belegt zusätzlich
Container-Locators und feste Tiefen-/Anzahl-/Archiv-/Entpackbudgets, ist aber kein
Freigabenachweis. Eine rekursive Produktfreigabe bleibt ausdrücklich offen.
