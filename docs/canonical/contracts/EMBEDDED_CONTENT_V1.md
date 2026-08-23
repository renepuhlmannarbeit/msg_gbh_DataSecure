# Eingebettete und aktive Inhalte V1

Status: **Engineering-Vertrag, erste Runtime-Scheibe aktiv** · Story: BL-020.2 ·
Entscheidung: DS-017

Dieser Vertrag erweitert keine veröffentlichte Eingabeformatliste. Er regelt, wie
bereits geöffnete OOXML-Container mit eingebetteten Dateien umgehen, ohne Inhalte
auszuführen, nachzuladen oder unbemerkt auszulassen.

## Unterstützte statische Einbettungen

Nur echte OOXML-Pakete mit den internen Endungen `.docx`, `.xlsx` oder `.pptx` in
`word/embeddings`, `xl/embeddings` oder `ppt/embeddings` werden rekursiv durch
dieselbe isolierte Parser- und Datenschutzgrenze verarbeitet. Jede Einbettung muss
über genau eine eindeutige interne Paketbeziehung erreichbar sein und darf
nicht zugleich über eine aktive Beziehung referenziert werden. Verwaiste Parts,
fehlende Ziele und mehrdeutige aktive Referenzen werden nicht anhand ihres
Dateinamens verarbeitet. Die Containerkette
bleibt im `source_part` des Content-Graph erhalten. Beschädigte oder andersartige
Pakete erzeugen ausschließlich eine inhaltsfreie Coverage-Warnung und verhindern
die Freigabe.

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

Die erste Runtime-Scheibe belegt rekursive OOXML-Pakete, Container-Locators,
Tiefen-/Anzahl-/Archiv-/Entpackbudgets sowie negative Makro-, OLE- und
Korruptionspfade. Weitere eingebettete statische Formate, vollständige Beziehungs-
Coverage und echte Drei-OS-Ressourcenabnahmen bleiben offen.
