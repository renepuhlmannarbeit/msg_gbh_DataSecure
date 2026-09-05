# Vertrag: einfacher lokaler Sammelreview v2

Status: verbindlicher Produktvertrag · Stories: BL-012.9, BL-012.10, BL-043.1,
BL-032.1 · Entscheidung: DS-068

## Produktentscheidung

DataSecure behält den vorhandenen lokalen Sammelreview. Es wird weder eine
cloudseitige Rohdatenoberfläche noch ein zweiter Reviewweg eingeführt. Klare
Dateien werden automatisch lokal abgeschlossen; ausschließlich Dateien mit einer
echten fachlichen Mehrdeutigkeit gelangen in die lokale Prüfung.

Der Vertrag übernimmt aus dem PII-Shield-Interaktionsmuster nur die Teile, die die
Bedienung vereinfachen, ohne die lokale Datenschutzgrenze zu verschieben:

- farbliche Trennung: rot steht für bereits anonymisierte, gelb für noch zu
  entscheidende Stellen;
- direkte fachliche Aktionen statt Ja/Nein: **Zertifikatsanbieter behalten** und
  **Organisation anonymisieren**;
- sichtbarer Fortschritt für automatisch abgeschlossene, bereits geprüfte,
  aktuell zu prüfende und danach noch offene Dateien;
- Vor/Zurück beziehungsweise Rückgängig, ausdrückliches Vertagen und eine einzige
  abschließende Freigabe je begrenzter Prüfgruppe;
- Tastaturbedienung auf Windows: `Alt+Z` behalten, `Alt+O` anonymisieren,
  `Alt+R` rückgängig, `Strg+Enter` freigeben und `Esc` vertagen/abbrechen;
- eine bewusste Gruppenaktion nur für lokal nachweislich identische vollständige
  Kontextzeilen; niemals fuzzy oder als Voreinstellung.

## Normal- und Ausnahmeweg

1. Die automatische Analyse verarbeitet den gesamten Stapel ohne fachlichen
   Dialog pro Datei.
2. Eine klare Datei wird unmittelbar nach den normalen Sicherheitsgates lokal
   veröffentlicht. Sie öffnet keine Review-UI und wird bei einem späteren Review
   nicht erneut verarbeitet.
3. Eine mehrdeutige Datei bleibt als inhaltsfreier Zustand `deferred_review`
   gesperrt. Originaltext, Ergebnistext, Fundstellen und Entscheidungen werden
   weder journalisiert noch an Claude gegeben.
4. Nach der Analyse werden nur die mehrdeutigen Dateien in einer begrenzten
   lokalen Prüfgruppe rekonstruiert. Die Oberfläche nennt Dateien ausschließlich
   anonym als `Dokument N`.
5. Die lokale Freigabe publiziert nur vollständig entschiedene Dokumente. Abbruch,
   Vertagung, Timeout oder ungültige Antwort lassen offene Dateien gesperrt und
   bewahren bereits atomar veröffentlichte Ergebnisse.

## Daten- und Sicherheitsgrenze

- Rohtext gelangt nur über `stdin` in den klassifizierten lokalen UI-Prozess.
- Fortschrittsmetadaten enthalten ausschließlich Zähler; keine Namen, Pfade,
  Fundstellenwerte, Hashes, Tokens oder Mappings.
- PII-Shields browserseitiges Rohdaten-Payload, reversible Zuordnungstabellen,
  Laufzeitdownloads und ein Cloud-/MCP-App-Review werden nicht übernommen.
- Freie Bereichsredaktionen bleiben im Sammelreview gesperrt, bis ihre
  Dokumentkoordinaten auch über Separatoren, Teilgruppen und Neustart
  positionssicher gebunden werden können. Der Einzeldateireview darf seine
  bestehende validierte Auswahlfunktion behalten.
- Kein Modell und keine Heuristik darf eine mehrdeutige Keep-/Redact-Entscheidung
  still im Namen des Menschen treffen.

## Abnahmekriterien E0

- Ein vollständig klarer Mehrdateienstapel öffnet null Reviewdialoge und endet
  vollständig.
- Ein Mischstapel darf klare Dateien intern abschließen, veröffentlicht den
  sichtbaren Stapel aber erst nach dem erforderlichen Review als Einheit. Der
  Reviewentwurf enthält nur mehrdeutige Dokumente und zeigt korrekte
  inhaltsfreie Zähler.
- Genau ein lokaler Reviewer-Aufruf bearbeitet eine begrenzte Prüfgruppe.
- Windows-, macOS- und Linux-Adapter verwenden dasselbe Aktionsvokabular und
  zeigen den Fortschritt, ohne Rohdaten in Argumenten oder Metadaten abzulegen.
- Unvollständige, manipulierte oder fremde Entscheidungen stoppen fail-closed.
- Gruppenaktionen gelten nur für exakt identische normalisierte Kontextzeilen.

## Noch erforderliche menschliche Evidenz

- Windows und macOS: Fokus, Escape, Tastatur, Zoom, Screenreader und verständliche
  Aktionsbezeichnungen mit synthetischen Dokumenten beobachten.
- Fachfremde Nutzer müssen erkennen, dass klare Dateien intern bereits fertig
  sein können, der sichtbare Gesamtstapel aber erst nach den Entscheidungen zu
  den gelben Stellen bereitgestellt wird.
- IT-/Health-IT-Fachvertretung prüft unterschiedliche Zertifikats- und
  Organisationskontexte. Security prüft, dass kein Reviewinhalt die lokale Grenze
  verlässt.

## Bewusst nachgelagert

Eine zusammenhängende plattformübergreifende lokale HTML-Oberfläche, eine sichere
freie Auswahl im Sammelreview und nutzerdefinierte Regeln sind nur nach eigener
Story, Sicherheitsdesign und gemessenem UX-Nutzen zulässig. Die inhaltsfreie
Status-App bleibt davon getrennt; sie wird nicht zum Rohdatenreview erweitert.
