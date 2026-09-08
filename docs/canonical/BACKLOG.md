# Aktives Entwicklungsbacklog

Stand: 08.09.2026 · Produktstand 3.2.0-rc123

Dies ist die **einzige aktive Arbeitsliste**. Historische RC-Schnitte, erledigte
Teilarbeiten und frühere Keyring-/MCPB-Pläne stehen im
[Archiv](../archive/README.md) und in den monatlichen Backlogarchiven.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Eine technisch fertige Story mit
offener Zielsystem- oder Anwenderabnahme bleibt hier als „menschliche Evidenz
offen“ sichtbar, wird aber nicht als weitere Entwicklungsarbeit dargestellt.

Statuslesart: **in Arbeit** kann bedeuten, dass die Engineering-Evidenz E0
vollständig grün ist, aber E1/E2 auf einem echten Zielhost oder durch einen
Menschen noch fehlt. Maßgeblich ist deshalb nicht das Statuswort allein, sondern
die explizite Restangabe in der Story. Für BL-010.11–14, 16–18 und 20–33 ist der
beschriebene E0-Code samt automatisierten Windows-/Paketgates umgesetzt; offen
sind nur die jeweils benannten Windows-/macOS-Zielhost-, Bedien-,
Accessibility-, Performance-, Update-/Rollback- oder Fachevidenzen. Die
Kompatibilitätsadapter für bestehende Journale und Exporte bleiben absichtlich
erhalten und sind keine zu löschende Altlast.

### RC124 – Reviewbefunde aus dem rc123-Gesamtreview

Ein Mehrdimensionsreview von `c62d7ec` hat 27 Befunde erzeugt, alle durch
Ausführung reproduziert und adversarisch gegengeprüft. Ausführungsdetail,
Reproduktionen und Abnahmekriterien stehen im aktuellen schreibenden Auftrag
[`tasks/AUFTRAG-CODEX-RC123-REDAKTIONSKERN.md`](../../tasks/AUFTRAG-CODEX-RC123-REDAKTIONSKERN.md).
Die Befunde werden **bestehenden** Storys zugeordnet; neue `BL-nnn.x`-Kennungen
werden hier nicht eigenmächtig vergeben.

**P0 — Unter-Redaktion.** Die schwerste Fehlerrichtung nach `tasks/README.md`.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F1 | BL-010.30, BL-030.2 (DS-087/DS-090) | Die Standalone-Privacy-Projektion übernimmt eine eindeutige sensible Quellkopfzeile aus einer neutralen `Spalte N`-Extraktion, bevor der gemeinsame Redaktionskern läuft. Der reine Konvertierungsmodus und Cowork bleiben unverändert; ein unabhängiges strukturelles Restgate stoppt unbekannte Tabellenwerte fail-closed. | **E0 erledigt; Produktwahl A/B in Rückfrage dokumentiert** |
| F2 | BL-021.1, BL-030.2 | Eindeutige operative Personenfelder (`Zuständig`, `Verantwortlich`, `Bearbeiter`, `Sachbearbeiter`, `Betreuer`, `Autor`, `Verfasser`, `Empfänger`, `Absender`, `Unterzeichner`, `Gesprächspartner`, `Kontakt`, jeweils unterstützte Geschlechtsform) werden spaltengebunden redigiert. Namensförmige Werte unter unbekannten Überschriften, einschließlich sichtbarer Markdown-Linklabels, stoppen unabhängig vom Redaktorkatalog fail-closed. | **E0 erledigt; neue DS-Kennung zur Bestätigung vorgeschlagen** |
| F3 | BL-021.1 | Explizit bezeichnete Zugangsdaten im Dokumentinhalt (`Benutzername`/Login, Passwort/Kennwort/Passphrase, Secret/Token/API-Key, Zugangscode/PIN) werden zeilen- und tabellenspaltengebunden durch `[CREDENTIAL_REDACTED]` ersetzt. Ein unabhängiges Restgate stoppt verbleibende Werte; Findings und Diagnoseobjekte enthalten weder Wert noch Hash. DS-016/DS-046 betreffen weiterhin nur verschlüsselte Quelldateien. | **E0 erledigt** |
| F4 | BL-021.1 | IBAN-Gruppierungen mit einfachem/mehrfachem Leerraum, Punkt, Schrägstrich, ASCII- und Unicode-Bindestrichen sowie Leerraum um genau ein Satzzeichen werden für DE, AT, BE, GB und NL vollständig erkannt; unbekannte Länderlängen bleiben konservativ. | **E0 erledigt** |
| F5 | BL-021.1 | Bekannte feste IBAN-Längen enden vor nachfolgenden Telefon-/BIC-/IBAN-Labels, durch unabhängige Detektoren abgesicherten Formularlabels und Prosa. Numerische Fortsetzungen und unbekannte Formularfelder bleiben konservativ geschützt; Folgeidentifier werden separat verarbeitet. | **E0 erledigt** |
| F6 | BL-021.1 | Häufige Briefformulierungen (`rufen Sie mich/uns/Frau/Herrn/Mx … [an] unter`, `rufen Sie bitte unter`, `melden Sie sich unter`, `Rückfragen unter`, `telefonisch unter`) sind durch eine begrenzte, zeilenlokale Grammatik als Telefonkontext gebunden. `unter` allein, technische Abrufprosa, Uhrzeiten und Kalenderdaten bleiben unverändert; Redaktor und unabhängiges Restgate sind gegengeprüft. | **E0 erledigt** |
| F7 | BL-021.1 | Namensförmige Bigramme im Prosakörper ohne Trigger-Wort bleiben im Klartext, auch bei starkem Personenanker. Es gibt dazu keine aktive Entscheidung — entweder fail-closed stoppen oder die Grenze kanonisch dokumentieren. | **Entscheidung offen** |

**P1 — Über-Redaktion und Inhaltszerstörung.** Kein Leck, aber
Kern-Anwendungsfälle blockiert oder freigegebener Inhalt zerstört.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F8 | BL-021.1 (DS-049) | Einzeilige, zur Trennzeile gleich breite Tabellenköpfe erzeugen keinen falschen `TABLE_STRUCTURE_AMBIGUOUS`-Befund mehr. Eindeutige Personenfelder werden redigiert; bei nicht katalogisierten Überschriften verhindert das unabhängige `PERSON_CANDIDATE`-Gate weiterhin einen stillen Durchlass namensförmiger Werte. Mehrzeilige Köpfe werden spaltenlokal bewertet, damit eine aufgelöste sensible Spalte keine ungelöste Nachbarspalte maskiert; anders breite und überlange sensible Strukturen stoppen unverändert. Die im Auftrag vorgeschlagene Pauschalredaktion unter `Rechnungs`, `Fall`, `Akten` oder `Abteilung` wurde nach unabhängigem Gegenreview verworfen, weil sie die bestätigte F2-Grenze und Fachinhalte über-redigieren würde. | **E0 erledigt** |
| F9 | BL-030.2 (DS-084) | Persistierte einwortige Personenaliase belegen nur die wiederzuverwendende Identität, nicht die Personenrolle jedes gleichlautenden Worts. In Folgedokumenten greifen sie positionsgebunden nur unter einem Personenlabel, Honorativ, Personen-Tabellenkopf oder enger `z. Hd.`-Einleitung; gewöhnliche Substantive und Jahreszeiten bleiben erhalten. Mehrwortige exakte Personenidentitäten behalten die bestehende stapelweite Wiedererkennung. v1/v2, serialisierte Fortsetzung, Mischvorkommen, Markdown-Linklabel und Firmenüberlagerung sind gegengeprüft. | **E0 erledigt; E1/E2 echter Neustart/UAT offen** |
| F10 | BL-021.1 | Personenlabels werden unabhängig von ihrer Schreibweise erkannt, ihr Wert wird jedoch mit einer eigenen großschreibungsgebundenen Grammatik ausgewertet. Dadurch bleibt in `Autor: Schmidt schrieb dies.` das Prosawort erhalten, `Schmidt` verwendet über Folgedokumente dasselbe v1-/v2-Pseudonym und ein Alias `Schmidt schrieb` entsteht nicht. Derselbe Parser gilt für Zeilen- und Inline-Labels; vollständige explizite Kleinschreibungswerte bleiben unterstützt. | **E0 erledigt** |

**P2 — Evidenz und Gates.** Keine Redaktionsrichtung.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F11 | BL-022.1, BL-050.1, BL-052.1 | Der als E0 zitierte 15-DOCX-Komplexkorpus lässt sich auf einem frischen Clone nicht erzeugen: der Generator hängt an keinem npm-Skript, und `tests/test-complex-docx-uat-corpus.mjs` stürzt ungeschützt mit ENOENT ab. `npm run test:standalone` kann damit nicht grün werden. Fixtures dürfen nach `.gitignore:1-9` nicht versioniert werden. | **offen, P2** |
| F12 | BL-020.3 (DS-018) | `NETWORK_BOUNDARY_V1.md:5` nennt „Export" im Geltungsbereich der Netzwerkgrenze, aber `mcp-server.js:179` ruft `replayPendingResultExports()` im MCP-Hauptprozess, der den Guard nach Vertrag `:16` nicht lädt. Kein belegter Abflusspfad; Vertrag und Implementierung widersprechen sich. Der Einstiegspunkt ist von keinem Gate erfasst. | **offen, P2** |
| F13 | BL-002 (DS-080) | Für Netzwerkpfade als Ergebnisordner fehlt der zu `sync_folder_notice` analoge Hinweis; bei Standalone liegt dort die sichtbare Zuordnung mit Originalnamen. Keine Sperre — nur der fehlende Hinweis. | **offen, P2** |
| F14 | BL-010.28 (DS-085) | Die Legacy-Ausnahme, dass ein v3-Konvertierungsrecord beim Replay eine `DataSecure-Zuordnung.csv` nach `DataSecure-Markdown` schreibt, steht nur im Code und hat keinen Test. | **offen, P2** |
| F15 | BL-010.30 | `termination_unconfirmed` wird auch für Journal-Schema `/6` projiziert; breite Anonymisierungsstapel zeigen den definierten Abbruchgrund. | **E0 erledigt (RC123)** |
| F16 | BL-023.4 | Ein einzelnes textloses Bild setzt `OCR_TEXT_EMPTY` und stoppt ein sonst lesbares PDF hart, statt es als „verwendbar mit Auslassungen" auszuweisen. | **erledigt** – `OCR_TEXT_EMPTY` gilt nur noch für eine insgesamt textleere Extraktion; nativer PDF-Text bleibt mit getrenntem OCR-Hinweis verwendbar |
| F17 | BL-030.2 | Verdacht auf massive Laufzeitkosten von `matchKnownAliases` bei Journalen ohne `known_alias_index` (vor rc123 angelegte Stapel), ohne Timeout in diesem Pfad. **Nicht nachgemessen** — erst messen, dann entscheiden. | **Messung offen** |

**P3 — Kanonkorrekturen.** Reine Dokumentwahrheit, kein Code.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F18/F19 | BL-051.1 (DS-077) | Der belegte aktuelle Umfang und die Formatmatrix sind auf RC111/`b543589f` samt ZIP-SHA gebunden; RC108/RC109 bleiben ausdrücklich historische Evidence. | **E0 erledigt (RC123)** |
| F20/F21/F23 | BL-002 | Der Komfortindex nennt die Präzisierungen DS-089/091/092, ausschließlich RC123 heißt „Aktueller Entwicklungsstand", und die in RC123 gepflegten Dokumente tragen den Stand 08.09.2026. | **erledigt (RC123)** |
| F22 | BL-003.9 | Einstiegsregeln und `tasks/README.md` verwenden einheitlich `AUFTRAG-<ADRESSAT>-<RC>-<THEMA>.md` und verweisen auf den vorhandenen RC123-Auftrag. | **erledigt (RC123)** |
| F24 | BL-051.3 (DS-010) | Die UAT-GO-Regel verlangt zusätzlich zum 100-Dateien-Fall ausdrücklich den noch offenen versionsneuen 200-Dateien-Grenzlauf je Zielbetriebssystem. | **Dokumentvertrag erledigt; E2-Grenzlauf offen** |

**P4 — Standalone-Desktop.** Klein, keine Redaktionsrichtung.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F25 | BL-010.33 (DS-086) | Der letzte in derselben UI-Sitzung fertiggestellte Lauf bleibt während der Vorbereitung der nächsten Auswahl erreichbar. Eine neue Auswahl verwirft weder dessen exakte Laufbindung noch die Freigabe von `process-results`; historische Läufe nach App-Neustart bleiben weiterhin ausschließlich im Verlauf. | **E0 erledigt; E2-Zielhostbedienung offen** |
| F26/F27 | BL-010.33 | Dieselbe Windows-Reparse-Point-Prüfung schützt Eingabe- und Öffnungsziele; Junctions werden vor der Übergabe an Explorer abgelehnt. Der Entnahmetest benennt nur noch seine tatsächlich geprüfte Einzelelementsemantik; die 199/200-Indexgrenze bleibt im Rust-Test separat belegt. | **E0 erledigt; E2-Zielhostbedienung offen** |

Als Reviewergebnis ausdrücklich **sauber** und deshalb ohne offenen Punkt:
Produkttrennung und Datenroots, Exportverifikation und Destination-Bindung,
Modustrennung zwischen Anonymisierung und reiner Konvertierung, die
`support-trace`-Projektion, der Rekursionsschutz zwischen Quell- und
Ergebnisbaum, der Nur-Lese-Zugriff auf Originale, die drei Absturzfenster der
Wiederaufnahme, Tauri-Kommandofläche und CSP, Panikfreiheit des
Rust-Produktivcodes, DS-086 und die laufgebundene Verlaufsbindung,
Markdown-Escaping als Angriffsfläche sowie die Unicode-Wortgrenzen im
Redaktionskern. Drei zunächst gemeldete Befunde wurden gegengeprüft und
**widerlegt**: die leere OCR im reinen Konvertierungspfad, die Gradzählung
zwischen den Journal-Schemata `/5` und `/6` (durch DS-090 gerechtfertigt) und
der fehlende `network-deny` im MCP-Hauptprozess als solcher (Vertragsscope).

### RC123 – DS-092: einfacher Cowork-Normalweg und Produktparität

BL-010.8/BL-010.23/BL-040.5/BL-041.10/BL-044: Die in Standalone bestätigten
Core-Korrekturen bleiben über gemeinsame Policy-/Golden-Gates für Cowork aktiv,
ohne Standalone-Oberfläche oder -Verträge umzubauen. Die normale Cowork-Aktion
**Ergebnisse öffnen** verwendet ausschließlich den exakten sichtbaren Laufordner
des aktuellsten Cowork-Stapels; ein aktiver, fehlgeschlagener oder nicht
exportierter aktueller Lauf fällt nie auf einen älteren Lauf oder den allgemeinen
Output-Stamm zurück. Rekursive Auswahlgrenzen besitzen produktneutrale
`SOURCE_FOLDER_*`-Codes und erscheinen in Cowork als verständliche
Auswahlablehnung. MCP-Protokoll-, Recovery-, Picker-, Source-Folder-,
Standalone- und Cross-Produkt-Gates binden diese Trennung.

Cowork bleibt absichtlich auf Anonymisierung von TXT/Markdown/CSV/DOCX begrenzt.
Breite Offline-Konvertierung/OCR, reine Markdown-Konvertierung, Verlauf,
sichtbare Zuordnung, Unterordnerprojektion und wählbare Ergebnisnamen bleiben im
eigenständigen Standalone-Produkt. Offene menschliche Evidenz: Fresh-Install-
und sichtbarer Ergebnisöffner-/Auswahlfehler-UAT unter unterstütztem Claude
Desktop/Cowork auf Windows und macOS.

### RC120 – sichtbare Zuordnung auf vorhandene Ergebnisse begrenzt

BL-010.13/BL-040.5/BL-002: Die Standalone-Zuordnungsdatei enthält nur noch
Quelle-zu-Ergebnis-Zeilen, deren Ergebnis vor der Mappingpublikation wirklich
geschrieben und geprüft wurde. Gestoppte Quellen bleiben in Abschluss und
Diagnose; All-stopped erzeugt weder leeren Laufordner noch Zuordnungsdatei und
aktiviert auch bei historischen Läufen keine falsche Öffnen-Aktion. Gemischte
Stapel veröffentlichen die erfolgreichen Ergebnisse und ausschließlich deren
Zuordnungen. Legacy-Dateien werden nicht umgeschrieben. Unit-, History-,
Status-, Replay- und echter Paket-Smoke bilden den Vertrag ab.

### RC119 – P0-Personenunterredaktion im konvertierten DOCX-Korpus geschlossen

BL-021.1/BL-030.2/BL-050.1: Der reale Standalone-Lauf
`Lauf-20260907-163522-142350c1` gab vier Namen aus konvertierten DOCX-Tabellen
im Klartext frei. Ursache war die vom Konverter erzeugte Tabellenbezeichnung
`person`, die im Personenankerkatalog fehlte. Die Restprüfung verwendete
denselben Katalog und bestätigte deshalb denselben blinden Fleck. `Person` ist
jetzt ein ausdrücklicher, positionsgebundener Personenanker. Zusätzlich erkennt
ein enger, unabhängig formulierter Release-Guard klare Namen in
`| person | … |`-Zeilen, ohne den Redaktorkatalog wiederzuverwenden. Der
100-Dateien-Korpustest prüft die vier realen DOCX nicht mehr nur auf
Konvertierbarkeit, sondern auch auf Entfernung des extrahierten Namens,
Personenpseudonym und leere Restbefunde. Der fehlerhafte sichtbare Lauf bleibt
historische UAT-Evidenz und darf nicht verwendet werden.

### RC117 – komplexer DOCX-UAT-Korpus und Word-Interoperabilität

BL-022.1/BL-050.1/BL-052.1: 15 deterministische, vollständig fiktive DOCX decken
kurze, mittlere und lange Fließtexte, Listen, Tabellen, Kopf-/Fußzeilen,
Grafiken, Abschnittswechsel, wiederholte Stapelidentitäten und neutrale
Erhaltungsfälle ab. Der Produktpreflight und Parser akzeptieren jetzt zwei
exakt bekannte interne, nicht ausführbare Microsoft-Beziehungsarten sowie vier
reine DrawingML-Layoutknoten. Lookalikes, externe Ziele und fremde Namespaces
bleiben gesperrt. Reale Admission-, Parser-, Anonymisierungs- und
Determinismusprüfungen sind E0 erledigt. Die sichtbare Durchführung beider
Standalone-Funktionen mit dem Korpus bleibt menschliche E2-Evidenz.

## Aktiver Umsetzungsblock – Gesamtgegenreview 01.09.2026

### RC109 – Gesamt- und Schnittstellenkorrekturen: geprüfter E0-Block abgeschlossen

F-01–F-11 aus dem unabhängigen Review und dem Paketgegencheck sind implementiert beziehungsweise
kanonisch bereinigt. Details, Gegenbeispiele, bestehende BL-Zuordnungen und
Nachweisgrenzen stehen im [archivierten Korrekturbericht](../../tasks/archiv/2026-09-06-rc109-review-korrekturen.md).
Zusätzliche Gegenchecks schließen reentrante Testfinalität, Verlaufszähler,
verweigerte MCP-Fortsetzung/Tokenfehler und die entdeckte Plugin-Paketabhängigkeit
mit ein. Kein neues Parallelbacklog, keine doppelt angelegten User Stories.
Der abschließende Gesamtstand besteht die volle Produktsuite (57 Basis-/114
direkte Testdateien) sowie echte Konverter- und frische Cowork-Paketprüfungen.
Die unten benannten RC86-Restschulden sind gezielt korrigiert; erste
Core-Extraktion und vollständige semantische E0-Golden-Bindung des unterstützten
Format-/Profil-/Review-/Recovery-Umfangs sind nachgewiesen, aber allein kein
Beleg vollständiger struktureller Entkopplung. Zuletzt verstärkte Architektur-,
Produktisolations-, Browser- und Dokumenttests sind zusätzlich grün. Die
frischen Standalone- und Cowork-RC109-ZIPs enthalten diese Korrekturen und
bestehen ihre Paket-Smokes. Standalone wurde aus `6bf7d05747e151ba8f846849229495e9fca4c041`
zweimal bytegleich gebaut und mit beiden Paket-/Worker-/nativen Windows-Smokes
an INT-13 gebunden. Noch offene Zielhostabnahmen bleiben ausdrücklich unten
geführt, nicht pauschal als erledigt markiert.

### RC109 – Startseite und Verlauf: Implementierung und Windows-Prüfungen abgeschlossen

DS-086 / BL-010.29: keine vorausgewählte Verarbeitung, kein automatischer
Ansichts-/Ordnerwechsel, 20 neueste Verarbeitungen mit exakt laufgebundenen
Aktionen. Zwei Gegenreview-Funde zur älteren Fortsetzung einschließlich zweitem
Versuch und Terminal-ACK korrigiert. Service-/History-/Frontend-/Rusttests,
gemeinsame Executor-/Recovery-/Journaltests, echter Zwei-Modi-Paket-/History-Smoke
und beide nativen Windows-Starts stehen grün. PKG-04/INT-13 ist an den oben
genannten RC109-Quellcommit gebunden. E2-Bedienabnahme S20–S23 und macOS bleiben offen.
Details: [archiviertes RC109-Review](../../tasks/archiv/2026-09-06-rc109-start-verlauf-review.md).

### RC108 – einfache Markdown-Konvertierung: Windows-E0 abgeschlossen

BL-010.28 mit BL-010.16–20/22/25/26 und BL-051.1/BL-002: Quellcommit
`a742333e8ef80b445729d4bede6a91a2b8f13207` besteht die vollständige Produktsuite
(48 Basis-/111 Direktdateien), Rust 15/15, Frontend 18/18 und 25 echte
Konvertertestgruppen. Zwei saubere PKG-04-Builds sind bytegleich; beide echten
Paket-/Worker-/nativen Windows-Smokes bestanden. INT-13 ist an diesen RC108-
Kandidaten gebunden: 110.168.168 Byte, SHA-256
`d1151365ebea6fa92e9d7b546d715e962d8787593707cedabcfb3f703c63b893`.
Receipt: `dist/pkg-04/a742333e8ef80b445729d4bede6a91a2b8f13207/`.
Beide Modi, elf Konvertierungsergebnisse plus Fehlerposition, die damals noch
für beide Modi erzeugte Zuordnung und optionale Supportereignisse sind in diesem
historischen RC108-Paket geprüft. DS-088 ersetzt diesen sichtbaren
Konvertierungsvertrag; dafür ist ein neuer Paketnachweis erforderlich. Es gibt keinen
weiteren Implementierungsblocker für diesen Windows-Konvertierungspiloten.
Menschliche Bedienungs-/Fachabnahme, native Mac-Pakete sowie die unten separat
benannten Ausbau-/Releasehygienepunkte bleiben offen. Frühere RC107-Nachweise
und Fehlversuche im folgenden Abschnitt sind historisch, nicht erneut auszuführen.

### Korrekturblock aus dem erneuten RC106-Review – RC107 E0 geschlossen

Abschließende Paket-Evidence (BL-051.1/BL-002): aus sauberem Commit
`7b88a81ff577aaa270f1354d75365b2df4a4666e` zweimal bytegleich gebaut und beide
ZIP-/Worker-/nativen Windows-Smokes bestanden. INT-13 ist an diesen neuen
Kandidaten gebunden (36.071.549 Byte; SHA-256
`01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`).
Vollständige Produktsuite 40 Basis-/111 Direktdateien und Rust 12/12 grün.
Die folgenden Hinweise auf fehlende Paketnachweise beschreiben den jeweiligen
früheren Korrekturversuch, nicht den abschließenden Kandidaten. E1/E2 bleiben offen.

| Befund | Bestehende Storys | Umsetzung / verbleibender Nachweis |
|---|---|---|
| Nativer Starttest verwendete reale Anwendungsdaten statt isolierter Testdaten. | BL-010.13, BL-051.1, BL-002 | **E0 erledigt:** explizites, vor Bootstrap validiertes Native-Smoke-Profil für Daten, Dokumente, Diagnosen und WebView einschließlich fehlendem Marker und Pfad-/Link-Negativtests. Neuer Paketnachweis aus dem Korrekturcommit erforderlich. Keine VM und kein Zusatzkonto. |
| Polling blieb nach langen Aktionen stehen; schnelle Folgeläufe zeigten alte Ziele. | BL-010.12/13, BL-002 | **E0 erledigt:** Poll-Lebenszyklus und beide asynchronen Antwortgrenzen an Operationsgeneration gebunden; 14 Frontendfälle decken schnelle Folgestapel, verzögerte Picker/Start/Abbruch und fehlende Zuordnung ab. |
| Geschlossener Desktop ließ einen Steuerprozess mit offenem Worker-IPC weiterleben. | BL-010.13, BL-011.3, BL-002 | **E0 erledigt:** EOF beendet nur den Standalone-Steuerprozess; wartende Requests starten nicht nach. Dauerhaft übergebene Worker behalten ihren Fortsetzungsvertrag. Sieben echte Prozess-/Worker-Negativszenarien grün; Cowork besitzt bereits einen begrenzten Shutdown. |
| Vollständig gestoppter Stapel öffnete die Zuordnung eines erfolgreichen Vorgängers. | BL-040.5/6, BL-010.19, BL-002 | **E0 erledigt, RC120 präzisiert:** All-stopped bleibt als Verlaufsstatus sichtbar, besitzt aber weder Ergebnis- noch Zuordnungsaktion. Fehlercodes stehen in Abschluss/Diagnose, nicht als künstliche Mappingziele. Kein Altstapelfallback. Fail-/Mischlauf, Exportfehler, Replay, historische Dateien und Plugin-Abgrenzung sind regressionsgeprüft. |
| Echter Paket-Folgestapel mit defekter CSV wurde unbegrenzt als wiederaufnehmbar behandelt. | BL-020.1, BL-011.3, BL-002 | **E0 korrigiert:** bestätigte negative Parserantwort erhält `PARSE_FAILED` statt codeleerem Fehler; nur exakter Negativ-Envelope mit passendem Exit gilt als bestätigte Ablehnung. Unbekannte Abstürze behalten Unterbrechungssemantik, Timeout bleibt `PARSER_TIMEOUT`. Gemeinsamer Kern für Cowork/Standalone; Parser-Isolation 19/19 und Itemprozessor 16/16 grün, unabhängiger Gegencheck ohne neuen Defect. Erster RC107-Paketversuch aus `ebffe87` verworfen, keine INT-13-Bindung; frischer Commit und beide Builds erforderlich. |
| Firmenkurzformen wurden durch konkurrierende Personensamen falsch typisiert. | BL-030.2, BL-021.1, BL-002 | **E0 erledigt:** eindeutige Firmenaliasbindung, unklare Organisation bei Rechtsformkonflikt; natürliche Kundenpersonen und explizite Namensfelder auch in Listen bleiben Personen. Registry 26/26 und PII 120/120; beide Produktkontexte und Resume geprüft. |
| Grüne Tests und Dokumentation überzeichneten den Abschlussumfang. | BL-002, BL-051.1 | **E0 erledigt:** Frontendtests im Produktgate, historische PKG-04-Evidence exakt benannt, UML-IST/SOLL und Markdown-Zwischen-/Endartefakte getrennt. Produktsuite 40 Basis- und 111 direkte Dateien grün, geänderte Standalone-Kette abschließend erneut geprüft. PKG-04/INT-13 benötigen den neuen Kandidaten; E1/E2 bleiben offen. |

BL-010.28 ist im RC108-Quellstand technisch integriert: Modusbindung
durch Admission/IPC/Worker/v5-Journal, inhaltstreue Parser ohne Privacy-
Normalisierung, getrennte `dm_`-Artefakte mit Ablehnung an allen MCP-Lesegates,
modusgebundene Recovery/Delivery und `DataSecure-Markdown`-Export. Der neue
RC108-Standard war reine Konvertierung; seit DS-086 wird keine Betriebsart vorgewählt. XLSX/PPTX/PDF/Scan-PDF und
PNG/JPEG/BMP verwenden eine gebündelte Offline-Runtime. Extraktionshinweise
werden ohne PII-Review gespeichert; Defekte/geschützte Quellen erscheinen in
der Abschlusszuordnung. Native Windows-Startabbruch-Race und v5-Snapshot-/
Recoveryübergänge wurden im unabhängigen Integrationsreview korrigiert.
Der RC107-Receipt belegt diesen Ausbau nicht; der neue RC108-Schnitt ist oben
commitgebunden abgeschlossen. Zielhost-/Anwenderabnahme bleibt offen.

Nachtrag 06.09.2026 zu BL-030.2/BL-021.1/BL-002: Der echte Dokumentwechsel
mit neu aufgebauter Registry fand einen zusätzlichen Aliasdefect. Exakte bekannte
Personen-/Firmenformen werden nun aus rohwertfreien HMAC-Bindungen auch im freien
Folgetext ersetzt. Klammern, Separatoren, Rollenwechsel und Rechtsformkonflikte
sind regressionsgebunden (34 Registry, 23 State, 17 Item, 17 Journal, 120 PII grün).
Ein bindingsgebundener Anfangstokenindex verhindert die gemessene teure
Vollfenstersuche im Normalfall; kein neuer Anwenderdialog. Alter Snapshot bleibt
lesbar, alter Reader lehnt den neuen Index ab. Finaler Produkt-/Paketnachweis
bleibt an den folgenden sauberen Quellcommit gebunden.

Paketnachweis RC107 (BL-051.1/BL-002): `aaecf59` besteht die lokale CI-Produktsuite,
den gepackten Erfolgs-/Fehlerfolgelauf und den isolierten nativen Windows-Start.
PKG-04 bleibt aus diesem Versuch unvollständig: Die Cleanup-Inventur stoppte an
einer internen Windows-Cache-Junction, ohne Testdaten zu löschen. Der Testrest
bleibt erhalten. Nur ein eng geprüfter Harness-Vertrag für neu erzeugte
Testprofile mit synthetischen Negativtests darf einen neuen Zweifachlauf
ermöglichen; unbekannte Links bleiben verboten. INT-13 wird nicht vorab gebunden.
Der neue Testharness ist inzwischen implementiert: zwölf Desktop-Vertragstests
einschließlich acht synthetischer Cleanup-Gruppen prüfen zulässigen Cache-Link,
unveränderten Zielinhalt, falsche Ziele und ausgetauschte Objektidentitäten.
Der echte neue Zweifach-Build bleibt separat nachzuweisen.
Ein weiterer echter Smoke zeigte leere Junction-Providerfelder unter Windows
PowerShell. Der native No-follow-Tag-/Zielcheck ersetzt diese Anzeigeheuristik;
12/12 Desktop-Verträge sowie ein frischer vollständiger nativer Lauf inklusive
Bereinigung sind grün. Beide alten Testreste bleiben erhalten. PKG-04 wird erst
nach dem letzten Produktfix erneut ausgeführt.

Das unabhängige Gegenreview aus Test/CI, Dokumentation/UAT sowie Architektur,
Security, Performance, UX und aktueller Claude-Cowork-Sicht ist bis zum Abschluss
dieses Blocks ein **NO-GO für einen breiten Rollout**. Grüne E0-Tests ersetzen die
folgenden Produkt- und Zielhostnachweise nicht.

| Reihenfolge | Zugehörige Storys | Verbindliche Lieferung | Status |
|---|---|---|---|
| 1 | BL-002, BL-051.2, BL-052.1 | Produkt-, Legacy- und Engineering-Tests sowie GitHub-Workflows trennen; aktuellen UAT-Generator wirklich ausführen; Batch-Maintenance in die Produktregression aufnehmen. | **E0 erledigt** |
| 2 | BL-001, BL-002, BL-003 | `SECURITY.md`, Third-Party-Notices, Companion-/Governance-Altverträge, Register, Archivlinks und dokumentgesteuerte Link-/Driftgates auf den aktuellen Produktvertrag bringen. | **erledigt** |
| 3 | BL-012.2, BL-041.7, BL-044.1 | Keine stille Ordnerteilmenge, ehrliche Trennung zwischen Worker-Annahme und dauerhaftem Checkpoint sowie ausdrücklicher Prompt-Injection-Vertrag für übergebenes Markdown. | **E0 erledigt** |
| 4 | BL-010.7, BL-010.1, BL-041.7 | Cowork-Hostmatrix gemäß DS-078 korrigieren: Originale nur in lokaler Cowork-Sitzung eines bestehenden Desktop-Deployments mit laufendem Plugin-MCP oder lokalem Claude Code; Cloud-Cowork/Web/Mobil/Scheduled nutzen ausschließlich bereits freigegebenes Markdown. | **E0 erledigt; Zielhostevidenz offen** |
| 5 | BL-010.8, BL-010.1, BL-010.2, BL-010.3 | Selbsttragende Plugin-Runtime ohne System-Node für Windows x64 und macOS Intel/ARM bauen, paketieren und automatisiert prüfen. | **E0 implementiert; Zielhostevidenz offen** |
| 6 | BL-051.1, BL-051.2, BL-051.3, BL-051.5, BL-052.1–BL-052.5 | Fresh Install, Marketplace-Lebenszyklus, sichtbarer Cowork-Ablauf, Accessibility, Fach-/Security-/Datenschutz- und Anwenderabnahme mit dem ausführbaren UAT-Kit. | **menschliche Evidenz nach 1–5** |

Review-Evidence: Der aktuelle Node-UAT-Generator erzeugt reproduzierbar 111
synthetische Dateien. Produkt-, Engineering- und Legacy-Pfade sind getrennt;
Dokumentation, Hostmatrix, Ordnerannahme, Startstatus und Prompt-Injection-Vertrag
sind automatisiert geprüft. Der gebündelte Runtimevertrag deckt Windows x64 sowie
macOS Intel/ARM ab. Ein reales Windows-x64-Artefakt startete mit leerem `PATH`,
bestand MCP-Handshake/Status-Smoke und blieb unter 45 MiB (Build 01.09.2026:
34.845.038 Byte; lokaler Build 02.09.2026 nach dem Gesamtgegenreview:
34.913.330 Byte, SHA-256 `c34211c0…3815c`).
Reale macOS-Ausführung, Cowork-Fresh-Install und Marketplace-Lebenszyklus bleiben
menschliche Freigabeevidenz; bis dahin bleibt der breite Rollout NO-GO.

### Codex-Gegenreview RC92 – in RC93 E0 geschlossen

Die Befunde C-01 bis C-08 sind technisch behoben und regressionsgebunden.
C-04 wurde gegen DS-012 fachlich präzisiert: Anreden werden entfernt,
Qualifikationen bleiben. C-09 war kein Rohdatenabfluss; DS-071 grenzt die
Laufkennung nun ausdrücklich auf zwei vom Anwender beziehungsweise Support
aktivierte Diagnoseflächen ein. Es entsteht kein neuer Dialog. Die Änderungen
gehören zu BL-021.1, BL-042, BL-044.1 und BL-002. Echte Zielhost-, Cowork- und
Fachabnahme bleibt im Abschnitt B offen; insbesondere ersetzt die Regression
keinen Vollständigkeitsbeweis für alle künftigen Dokumentdarstellungen.

### Claude-Code-Gegenreview RC93 – in RC94 E0 nachkorrigiert

Das RC93-Gegenreview schloss Anrede-/Titel- und Startmarkerbefunde, führte bei
ungleich breiten Tabellenzeilen aber eine positionsbasierte Zuordnung ein. Der
unabhängige Codex-Gegencheck reproduzierte dadurch weiterhin klare Steuer-IDs bei
führenden oder fehlenden Zellen. RC94 ersetzt dieses Raten durch einen
eigenständigen Struktur-Restbefund: bis zu drei gleich breite, eindeutig bekannte
PII-Kopfzeilen werden verarbeitet; verschobene, überlange oder anders breite
sensible Tabellen stoppen fail-closed. Horizontal oder vertikal verbundene
DOCX-Zellen stoppen bereits im Parser. Exakte IT-/Health-IT-Begriffe wie
`Graph API`, `Project Server`, `Robot Framework`, `Imaging Protocol` und
`Treatment Protocol` bleiben erhalten, ohne Anredeerkennung allgemein zu
lockern. Zugeordnet: BL-021.1, BL-022.1, DS-012 und DS-049. Die automatisierte
E0-Korrektur ist erledigt; echte Word-/LibreOffice-Dokumente und Cowork bleiben
Zielhost-/Fachevidenz in Abschnitt B.

### In diesem Schnitt E0 abgeschlossen

| Story | Technischer Abschluss | Verbleibende Evidenz | Status |
|---|---|---|---|
| BL-011.8 | Journal, Intake-Intent, Arbeitsbaum und Cleanup sind größenbegrenzt sowie datei-/verzeichnisidentitätsgebunden; Austauschversuche und unsichere Strukturen stoppen fail-closed. | echtes Windows-/macOS-Dateisystem, Crash/Power-Loss und feindliche Race-Beobachtung über BL-011.11/BL-050.3 | **erledigt** |
| BL-020.1 | `data-secure-content-graph/v1` deckt TXT, Markdown, CSV und DOCX mit validierten Markdown-/Part-Locators ab; leere oder ungebundene Textknoten stoppen. | feinere Absatz-/Zelllocators sind erst für spätere Formatstories nötig | **erledigt** |
| BL-020.2 | Produktpreflight sperrt alle OOXML-Einbettungen; DOCX-Parser sperrt aktive Felder, Revisionen, Controls, externe/unklare Beziehungen und falsche Content Types fail-closed. | echter Office-Interoperabilitätskorpus und Security-Abnahme über BL-022.1/BL-049.1 | **erledigt** |
| BL-030.2 | zufälliger Stapelseed plus rohwertfreie HMAC-Alias-/Kollisionsbindungen werden dauerhaft gecheckpointet; Neustart, Alias, Manipulation und Fehlercleanup sind getestet – ohne Keyring oder Zusatzverschlüsselung. | echte Cowork-/OS-Neustart- und Crash-Fortsetzung über BL-011.3/BL-011.11 | **erledigt** |
| BL-011.10 | Eine atomare, prozessübergreifende Intake-Reservierung gilt vom Pickerstart bis zum dauerhaften Stapelcheckpoint. Die Reservierung kann sicher an den Worker delegiert werden; verwaiste Eigentümer werden fail-closed erkannt und zwei reale konkurrierende Prozesse lassen genau eine Aufnahme zu. | Mehrfachauswahl und Hintergrundstart in echter Cowork-Bedienung auf Windows/macOS messen | **erledigt** |
| BL-047.1 | Freigegebene Markdown-Snapshots werden asynchron und größenbegrenzt gelesen, gehasht und UTF-8-indiziert; ein 6-MiB-Regressionslauf belegt, dass der MCP-Ereignisloop währenddessen weiterläuft. | Referenzhardware messen und erst danach eine adaptive Parallelisierung bewerten; Produktstandard bleibt seriell | **erledigt** |
| BL-040.5 | Beim ersten startfähigen Lauf wird der dedizierte lokale Ergebnisordner erst nach erfolgreicher Anlage von `DataSecure-Output` dauerhaft gespeichert. Nur verifiziertes Markdown wird mit neutralen Namen exportiert; die Zielidentität ist gebunden und die Veröffentlichung ist exklusiv atomar, sodass eine zwischen Prüfung und Publikation entstandene Benutzerdatei nie überschrieben wird. Nur ein fehlgeschlagener Export wird nachgeholt, ein abgeschlossener Export ist endgültig (gelöschte oder bearbeitete sichtbare Ergebnisse werden nicht wiederhergestellt, ein Zielwechsel spiegelt keine alten Läufe). Private Daten bleiben getrennt, der Abschluss bietet „Ergebnisse öffnen“, rekursive Quellen dürfen den sichtbaren Output nicht wieder aufnehmen und die MCP-Startantwort wartet begrenzt auf die ausdrückliche Empfangsbestätigung des Workers. | Fresh Install, Neustart, Ordnerwechsel und Abschlussaktion in echter Cowork-Bedienung auf Windows/macOS beobachten | **erledigt** |

### Experten-Gegencheck RC95 – E0 abgeschlossen

Der Architektur-, Worker-, Performance-, Claude-/Cowork- und UX-Gegencheck schließt
vier zusammenhängende Restbefunde, ohne einen zweiten Produktweg einzuführen:

- Intake, Fortsetzung und lokaler Review gelten erst nach einer ausdrücklichen,
  inhaltsfreien Worker-Bestätigung als gestartet.
- Der Abschlussdialog nutzt eine zweiphasige Reservierung. Seit dem E0-Schnitt
  vom 05.09. bestätigt Standalone erst nach Renderer-Paint und Windows-Cowork
  erst nach nativem `Shown`; ein Fehler gibt die Reservierung für genau einen
  Worker-Fallback frei. Der AppKit-Adapter bestätigt ebenfalls erst nach einem
  sichtbaren `SHOWN`; offen bleibt seine native Intel-/ARM-Zielhostevidenz.
- Ein Stapel mit Mehrdeutigkeiten wechselt im bereits laufenden lokalen Worker
  direkt in den Sammelreview. „Später“ bleibt ein sicherer, fortsetzbarer Zustand;
  es folgt weder ein zweiter Cowork-Aufruf noch ein automatisches Freigeben.
- Ein offener sichtbarer Export wird nach dem MCP-Start in einem begrenzten Worker
  nachgeholt. Ergebnislisten verwenden die dauerhaft gebundene Paketidentität;
  der vollständige asynchrone SHA-256-Nachweis bleibt vor jeder Inhaltsübergabe
  verpflichtend.

Zugeordnet: BL-040.5, BL-041.9, BL-041.10, BL-043 und BL-047.1. Die automatisierte
E0-Evidenz ist grün; echte Windows-/macOS-Cowork-, Fokus- und Fresh-Install-
Beobachtungen bleiben in Abschnitt B.

### Windows-UAT RC95/RC96 und Laufzeitkorrektur RC97

Der erste reale RC95-Cowork-Lauf bestätigte den Picker und den echten
Worker-Handoff, erzeugte danach aber weder Stapelcheckpoint noch Ergebnis. Die
Claude-Desktop-Diagnose belegte: Der MCP-Elternprozess lief aus einer temporären
Pluginprojektion; nach Ende des Cowork-Aufrufs war dieser Quellbaum entfernt,
während der Hintergrundworker weitere Programmdateien daraus benötigte. UAT-01
ist für RC95 deshalb **fehlgeschlagen**, nicht „unentschieden“.

RC96 setzte damit DS-072 um und projizierte beim Start ausschließlich Produktcode und gebündelte Runtime in
einen dauerhaften, versionsgebundenen lokalen Runtime-Cache. Ein automatisierter
Regressionstest löscht den temporären Pluginbaum und startet danach den Worker
aus dem Cache. Zugeordnet: BL-010.8, BL-011.10, BL-041.7 und BL-051.5. Der reale
Der reale RC96-Wiederholungslauf zeigte dieselbe Wirkung: Cowork leitete auch
`LOCALAPPDATA` in eine sitzungsgebundene Umgebung um, sodass Cache und
Ergebnisordnerkonfiguration mit dem Toolaufruf verschwanden. RC97 erkennt nur
diese Claude-Temporärprojektion und bindet Produktzustand und Runtime-Cache an
das bestehende reguläre Windows-Benutzerprofil (DS-073). Der RC97-
Wiederholungslauf bleibt E1-Evidenz.

#### Standalone ohne Claude/Cowork mit lokaler Markdown-Konvertierung

Detailarchitektur: [`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).
Die Storys sind revalidiert aus Produkt-, UX-, Architektur-, Security-,
Performance-, Packaging- und Betriebsblick. Standalone ist ein eigenständiges
zweites Endnutzerprodukt ohne Claude, Cowork, MCP oder Agenten. Gemeinsam bleibt
nur der geprüfte DataSecure-Core. DS-075 ist der verbindliche Architektur- und
Vertrauensgrenzenentscheid. DS-076/DS-077 binden die Tauri-Hülle, den
Windows-x64-Engineering-Piloten, WebView2-Voraussetzung und Evidencegrenzen.

| Story | Lieferung / Abnahme | Status |
  |---|---|---|
| BL-010.9 | Direkte Standalone-Application-Schicht unterhalb von MCP: keine Toolnamen, Protokollversionen, Claude-Antwortfelder oder Handofflogik. Eigener Daten-/Konfigurations-/Review-/Exportroot wird vor Laden des Core aktiviert und an Worker weitergegeben. RC109 bündelt sieben reine Verträge für Start, Zweck, nächste Stapelaktion, Konverterkommunikation, Ergebnisgrad, Ergebnisprojektion und Fortschritt unter `server/core/`; Dateisystem-/Paketnachweise werden injiziert. Statischer Importabschluss, I/O-freie VM-Ausführung und beide echten Produktprojektionen sichern den Schnitt. Breitere Format-/Profil-/Recovery-Goldenbindung bleibt BL-010.23. | **erledigt** |
| BL-010.10 | Schlanke technische CLI für Datei-/Ordnerwahl, automatische Profilerkennung, Standard-Ergebnisordner und Ergebnisordneröffnung. Keine Rohpfade in Argumenten oder Ausgaben; kein Endnutzer-Terminal im freigegebenen Produkt. | **erledigt** |
| BL-010.11 | Native Desktop-Hülle: Tauri 2 ist gemäß DS-076/077 gesetzt. Reale Rust-Hülle, Tauri-CSP/Capability-Grenze, nativer Datei-/Ordnerpicker, korrelierter bidirektionaler Core-Dispatcher mit begrenzten Längenframes, 30-Sekunden-Antwortgrenze, Ready-Handshake, Neustart nach IPC-Fehler, Sidecar-Lifecycle und inhaltsfreie Rendererprojektion sind implementiert. Der Renderer besitzt keine direkten Dialog-, Datei-, Shell- oder Netzrechte. Windows x64 ist kompiliert und als laufender Engineering-Prozess sowie im selbsttragenden Pilot-ZIP geprüft. Offen sind Kaltstart p50 ≤1,5 s/p95 ≤2,5 s, Hülle ≤20 MiB ohne Core, Tastatur/Screenreader, Update/Rollback, Null-Listener-Nachweis und native Zielhost-Spikes auf macOS Intel/ARM und Linux x64. | **in Arbeit** |
| BL-010.12 | Ein Vorbereitungsbild mit Anzahl und Größe; danach passiver Fortschritt ohne Modal je Datei. Native Mehrfach-/Ordnerauswahl und Dragdrop verwenden denselben Core-Admissionpfad mit Pfad-, NUL-, Duplikat-, Format- und Größengates. Die Auswahl ist ausschließlich lokal sichtbar und startet erst über den zum gewählten Modus passenden Startbutton, ohne zweiten Picker. Vorher können einzelne eindeutig dargestellte Dateien entfernt oder die gesamte Auswahl geleert werden. Native Guards verhindern konkurrierende Auswahl/Start und unbemerktes Ersetzen einer vorbereiteten Auswahl. Der RC107-Paket-Smoke nimmt vier echte TXT/MD/CSV/DOCX-Fixtures auf; RC108 besteht zusätzlich den aktuellen Paketnachweis beider Modi. RC115 hebt die zentrale, über JS/Rust/IPC/Worker gebundene Grenze auf 200 Dateien bei unverändert 500 MiB und gibt konkrete Fehlercodes für Ordnergrenzen aus. Offen: UI-Aufteilung direkt/konvertierbar/gesperrt/verschlüsselt sowie E2 für Dragdrop, Auswahlkorrektur, 200 Dateien und 500 MiB. | **in Arbeit** |
| BL-010.13 | Bestehenden Sammelreview und Klar-Datei-Pfad wiederverwenden. **Start**, **Verarbeiten** und **Verlauf** trennen seit DS-086 Navigation und Laufzustand. Jede Verlaufszeile bindet ihre drei Aktionen an den eigenen `Lauf-*`-Ordner. Für **Ergebnisse öffnen** und **Zuordnungsdatei anzeigen** löst der Sidecar ausschließlich den vollständig sichtbaren Lauf bzw. dessen `DataSecure-Zuordnung.csv` auf; Rust validiert das private Ziel und startet Explorer/Finder/`xdg-open` sichtbar. Die Öffnungsaktion liefert dem Renderer nur eine inhaltsfreie Übergabebestätigung; ein separates `aria-live` überschreibt den Laufstatus nicht. Der UI-Kontext ergänzt ältere Exportrecords journalgebunden vor der Anzeige. Der reale Paket-Smoke verarbeitet vier Formate und prüft stabile Personen-/Firmenkennungen, unveränderte Quellen, exakten Lauf, Mapping und beide Resolver. RC115 schreibt die sichtbare Zuordnungsdatei mit UTF-8-BOM, damit Excel Umlaute und Gedankenstriche korrekt öffnet; private Protokolldateien bleiben unverändert. Der Exportvertrag weist doppelte Quellen sowie gleichzeitig erfolgreiche und gestoppte Endzustände zurück; der reale XLSX-Paketlauf verlangt exakt eine finale Erfolgszeile ohne alten Coverage-Stopp oder Mojibake. Zähler gehören zum aktiven beziehungsweise ausdrücklich fortgesetzten Stapel, sonst zum jüngsten eigenen Stapel; ein interner Abschluss ohne sichtbaren Export bleibt `export_pending`. Sichtbare Version verhindert Kandidatenverwechslung. Im Piloten bleibt der lokale Core-Reviewer zuständig; integrierter Tauri-Review erfordert später einen eigenen begrenzten Reviewvertrag. | **in Arbeit** |
| BL-010.14 | Absturz-/Abbruchfortsetzung, genau ein aktiver Stapel, keine Doppelverarbeitung, Quellen unverändert und niemals automatisch gelöscht. Der öffentliche Stand zeigt vorhandene fortsetzbare Stapel als `stopped`/`resumable`; nach Sidecar-Neustart oder verlorenem Admission-Zustand setzt der Renderer die veraltete Startfreigabe zurück und verlangt eine neue lokale Auswahl. Echter Desktop-Absturz-/Neustart-UAT bleibt offen. | **in Arbeit** |
| BL-010.15 | MarkItDown 0.1.7 ist als gepinnter, produktiv deaktivierter DOCX-Differentialadapter implementiert: Byte-Stream, nur expliziter DOCX-Konverter, Plugins/Built-ins/Netzwerk/LLM/OCR aus, keine persistierte rohe Markdown-Datei. Engineering-Bridge mit `-I -S`, ohne Host-TEMP/PATH; ungerahmter, nicht authentisierter Testtransport. Optionales Vergleichsorakel, keine Voraussetzung und keine ausstehende Aktivierung für den RC108-Produktkonverter. | **erledigt** |
| BL-010.16 | Vereinfachter Konvertierungsbundle ist implementiert: vorhandene JS-Konverter statt CPython/MarkItDown im Nutzerpaket; gepinntes normales Node, PDF.js, Canvas, Tesseract und DE/EN-Modelle mit Hashinventar, Lizenztexten, SBOM und reproduzierbarer Projektion. Windows-Worker mit echter projizierter Runtime getestet. RC109-PKG-04/INT-13 für Windows ist abgeschlossen; native macOS-x64/ARM64-Builds/-Smokes bleiben erforderlich. Python bleibt optionales Differentialorakel, keine Nutzerabhängigkeit. | **in Arbeit** |
| BL-010.17 | Eigener realer Konvertierungsworker über bestehenden Windows-/POSIX-Supervisor ist integriert: vollständige Byte-Eingabe, feste Antworten, CPU/RAM/Zeit/Ausgabegrenzen und bestätigtes Prozessende bei Abbruch. Windows bindet das Kind bereits bei Erstellung atomar an den Job; 60 frühe Abbrüche sowie Timeout und verweigerte Beendigung sind getestet. Keine neue Benutzerkonfiguration. Die aktuelle Windows-Paketkette ist abgeschlossen; native macOS-Prozessnachweise bleiben offen. | **in Arbeit** |
| BL-010.18 | Standalone markdown-only: XLSX/PPTX, Text-PDF, Scan-PDF und PNG/JPEG/BMP mit echter Offline-OCR umgesetzt. PDF-Seiten behalten nativen Text; auch gemalte Bildinhalte neben Seitenzahlen/Headern werden per OCR gelesen. Vergleichsnormalisierung verhindert identische OCR-Duplikate, zusätzliche Bildtexte werden gekennzeichnet; eine OCR-Session je PDF. Echte synthetische Inhalts-/PII-Erhalt-, Negativ- und Quellenhashprüfungen stehen. Unvollständige Extraktion bleibt als Hinweis sichtbar; gefährliche/defekte Quellen stoppen nur die Datei. Das erweitert weder den Cowork-Formatumfang noch die Vollständigkeitszusage für Originalcontainer; die Standalone-Markdown-first-Anonymisierung ist separat in BL-010.30 geregelt. Der neue Windows-Paketnachweis steht; ein breiter Zielhost-Korpus bleibt offen. | **in Arbeit** |
| BL-010.19 | Produktkonverter ist an die bestehende **Opt-in-Supportspur** gebunden: `converter_started`, `coverage_checked` nach erfolgreicher Vertragsprüfung sowie genau `converter_completed` nach Artefaktpublikation oder `converter_stopped` mit festem Fehlercode. Coverage-Prüfung behauptet keine vollständige Extraktion; Grad und Gründe bleiben im Artefakt/v5-Journal und der Zuordnung. Rust-Sidecar-Start und Batchworker reichen ausschließlich `EU_PRIVACY_SUPPORT_MODE=1` gezielt weiter. Normalbetrieb behält seine Interaktionslogs ohne zusätzliche Supportspur oder Nutzerformular. Echte Parser-/Spool-/Artefakt- und Negativtests prüfen Erfolg, Abbruch, unbekannte Fehler, Inhaltsfreiheit und wirkungslose Diagnosefehler; keine Rohinhalte, Namen, Pfade, Hashes, argv/env oder Vendor-Ausgaben im Log. | **erledigt** |
| BL-010.20 | RC108-Zielpakete sind Windows x64 sowie macOS x64/ARM64; Linux x64 glibc bleibt spätere Stufe unter BL-010.4 und besitzt keinen aktuellen Konvertierungsbundle. Windows-Projektion bindet Core, Konvertierungsruntime, Manifest, SBOM, SHA-256 und isolierte Smokes. Die neue INT-13-Bindung ist nach echter Konverter-Prüfung, sauberem Commit, zwei bytegleichen PKG-04-Builds und beiden Paket-/nativen Smokes erstellt. Der macOS-Buildvertrag verlangt native Builds, mindestens macOS 13.5, passende Architektur und ad-hoc Signierung (`signingIdentity: "-"`) ohne Apple-Zertifikat; reale Builds/Gatekeeper-/Start-/Rollbacknachweise stehen aus. Developer-ID bleibt optional; Gatekeeper **Dennoch öffnen** ohne globale Schutzabschaltung dokumentieren und testen. | **in Arbeit** |
| BL-010.21 | E1/E2-UAT beider Betriebsarten auf Windows sowie nativ auf macOS Intel/Apple Silicon: Download/Prüfsumme/Gatekeeper, erste Nutzung, falsches Architekturpaket, 200 Dateien/500 MiB, gemischte Formate, Picker/Drop und expliziter Start, Fehler/Crash/Resume, Offline-Lauf, Ergebnis-/Zuordnungsfund, VoiceOver/Tastatur/Zoom/Fokus/Dark Mode, Kaltstart/RAM/Paketgröße und verständliche DE-Texte. Reine Konvertierung erhält Inhalte und zeigt Extraktionshinweise ohne PII-Review; fachlicher Sammelreview gehört zur Anonymisierung. Ein ARM-Lauf unter Rosetta ersetzt keinen Intel-Nachweis. | **offen** |
| BL-010.22 | Produktisolation: eigener Standalone-Root und gebundener Journal-Kanal; v5-Konvertate besitzen ausschließlich `dm_`-Identitäten ohne Privacy-Capability und werden an Plugin-Listing, Handoff, Read und ACK abgewiesen. RC109 startet beide tatsächlichen Produktprojektionen parallel in getrennten Prozessen und Datenwurzeln; kopierte fremde Journale werden vor jedem Quellen-/Artefaktzugriff abgewiesen. Paketverträge verhindern Plugin-/Skill-/MCP-Entrypoints und Cloudfunktionen im Standalone-Produkt. Gleichzeitige Starts beider wirklich installierter Zielhostprodukte bleiben E1-offen. | **in Arbeit** |
| BL-010.23 | Gemeinsamer Corevertrag für den **Anonymisierungsmodus**: RC109 bindet gemeinsame Core-/Privacy-Bytes der tatsächlichen Produktprojektionen durch Fingerprint und semantischen Golden-Korpus. TXT, Markdown, CSV und DOCX laufen in beiden Produkten durch alle fünf expliziten Profile; nach echter Extraktion werden Abbruch, frischer Prozess und Fortsetzung mit stabiler Personen-/Unternehmensbijektion geprüft. Bewerber-/Personalprofile decken Reviewbereitschaft, Abbruch, Vertagung, ungültige Entscheidung und spätes Behalten/Schwärzen ab. Bewusst unterschiedliche v1-/v2-Kennungen nach DS-084 werden semantisch, nicht bytegleich verglichen. Der unterstützte E0-Produktumfang ist damit gebunden; native Zielhost-/Fachabnahme und ein persistierter Journalfingerprint bleiben getrennt. Reine Markdown-Konvertierung bleibt ein eigener Inhaltserhaltungszweck ohne PII-Ersetzung. | **in Arbeit** |
| BL-010.24 | Offline-/Environment-Vertrag: Kindprozesse erhalten nur allowlistete OS-/DataSecure-Werte, keine geerbten Proxy-, Token-, API-Key-, Agent- oder Cloudwerte. Echter Konverter startet mit leerem PATH, gebündelten Ressourcen, Node-Berechtigungsgrenze und `network-deny`; lokale Modelle benötigen keinen Download oder Cachewrite. RC109 prüft beide tatsächlichen Produktprojektionen mit jeweils elf nativen DNS-/TCP-/TLS-/HTTP-/UDP-/Fetch-/Proxy-Canaries und genau einem kontrollierten produktübergreifenden Kopierversuch. Paket-/Zielhost-E2E bleibt E1-offen. | **in Arbeit** |
| BL-010.25 | Eigenes Standalone-Manifest, SBOM und Runtime-Evidence einschließlich Konvertierungsressourcen sind implementiert; kein Netzwerk-/Auto-Updater. Das RC109-Inventar erfasst 259 erreichbare Nicht-Dev-Crates und enthält kein `NOASSERTION`; automatisierte Lizenz-/SBOM-Verträge sichern diesen Stand. Manueller Update-/Rollbackweg durch Paketaustausch und Deinstallation sowie die Wechselwirkung mit dem anderen installierten Produkt bleiben Zielhostabnahme. | **in Arbeit** |
| BL-010.26 | Diagnose-/Fehlerübersetzung: getrennte Produktkanäle, feste Konverterfehlercodes und rotierende, über **Diagnose öffnen** erreichbare Desktop-/Sidecar-JSONL-Spuren ohne Rohinhalte, Namen, Pfade oder Request-IDs. Zielresolver-/OS-Öffnereignisse und sichtbare Version bleiben erhalten. Der reine Produktkonverter einschließlich PDF/OCR liefert bei ausdrücklichem Support-Opt-in die vier geschlossenen Ereignisse aus BL-010.19; echte Parser-/Abbruch-/Sentineltests stehen E0. Interne `CONVERSION_OCR_STARTING/READY` dienen weiterhin nur der echten Prozessprüfung; stderr wird nicht als Log kopiert. Keine neue Einstellung oder Bestätigungsrunde. Der aktuelle Paketnachweis einschließlich Supportspur ist abgeschlossen; Windows-/macOS-UAT der Meldungen und Diagnosebedienung bleibt offen. | **in Arbeit** |
| BL-010.27 | Releasehygiene des Standalone-Piloten: Windows verwendet das vorhandene System-WebView2 ohne Laufzeitdownload; verständlicher Fehlhinweis und UAT bei fehlender Runtime. Die Builder-Toolchain ist mit `rust-toolchain.toml` exakt auf Rust 1.98.1 gebunden; erreichbare ausgelieferte Crates werden komponentenweise lizenzgeprüft und mit belastbaren Lizenzwerten in das SBOM übernommen. Native Dragdrop-Aufnahme ist E0 implementiert; echte Zielhost-Drop-/Fokusprüfung bleibt offen. Pause bleibt außerhalb der Istzusage. | **in Arbeit** |
| BL-010.28 | Zweite Standalone-Kernfunktion **Nur in Markdown umwandeln** (DS-085/088): verfügbare Kernfunktion ohne PII-Ersetzung/-Review; keine Vorbelegung seit DS-086. Namen und Inhalte bleiben erhalten. Sichtbare Ergebnisse übernehmen den Quellbasisnamen mit `.md`; case-/Unicode-gleiche Kollisionen erhalten deterministisch ` (2)`, ` (3)` usw. Eine Zuordnungsdatei entfällt in diesem selbsterklärenden Modus. v5-Zweckbindung, eigener Offline-Worker, `dm_`-Artefakte, Recovery und v4-Export nach `DataSecure-Markdown/Lauf-…` sind integriert; bestehende v3-Exporte bleiben final. TXT/MD/CSV/DOCX/XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP; Warnungen ohne zusätzliche Rückfragen, Fehler je Quelle. Keine KI-Übergabe. Zielhost-UAT des neuen Bedienvertrags bleibt offen. | **in Arbeit** |
| BL-010.29 | Startseite und laufgebundener Verlauf (DS-086/088): Start immer sichtbar, keine automatische Ergebnisnavigation, Betriebsart anfangs leer. Die 20 neuesten Standalone-Verarbeitungen als Tabelle mit Datum, Zweck, Zählern und Status; Ergebnis und Fortsetzung binden ausschließlich den gewählten Lauf. Zuordnung ist nur bei Anonymisierung aktiv und bei reiner Konvertierung begründet deaktiviert. Historie über Neustart/Journalablauf und Ergebniszielwechsel erhalten, Ein-Stapel-Guard und geschlossene private IPC. Keine Rohinhalte oder Pfade in Diagnoselogs; 20 ist nur Anzeigegrenze. Implementierung und gezielte Tests stehen; menschliche E2-Abnahme bleibt offen. | **in Arbeit** |
| BL-010.30 | Standalone-Markdown-first-Anonymisierung nach DS-087 und DS-090: DOCX/XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP genau einmal im isolierten Offline-Worker zu einer neutralen Markdown-Extraktion verarbeiten und gültigen, nichtleeren Inhalt ohne sichtbares `dm_`-Zwischenartefakt durch den vorhandenen Privacy-Core führen. Anonymisiert und ausgegeben wird ausschließlich die Markdown-Repräsentation, nie der Originalcontainer. Extraktionsabdeckung (`complete`/`incomplete` plus feste Gründe) und Anonymisierungsstatus werden unabhängig ausgewiesen; `incomplete` ist keine Behauptung unvollständiger Markdown-Anonymisierung. Leere/Whitespace-Extraktion, `OCR_TEXT_EMPTY`, unbekannte Coverage, beschädigte, verschlüsselte oder aktive Quellen stoppen die betroffene Datei. Direkte und konvertierte Quellen teilen stapelweit Personen-/Unternehmenspseudonyme, vorhandenes v4-Journal/Recovery und Mapping `Original → anonymisierte Markdown-Datei`. Cowork bleibt bei vier Formaten und seinem strengen direkten DOCX-Parserpfad. Pflicht: neutraler Extraktionsvertrag, Recoverybindung, Mixed-Batch-/Resume-/Residual-/Cross-Read-/Offline-/Pakettests und ehrliche UI/Dokumentation. RC121 bindet den realen DOCX-UAT-Befund, Markdown-escapte E-Mail-Adressen und den ausgelieferten Sidecar durch synthetische Paketregressionen; auch die spätere Sammelreview-Publikation übernimmt den Standalone-Kanal ausdrücklich und behält Scope sowie Coverage bei. RC123 projiziert einen nicht bestätigten Konverterabbruch auch aus dem breiten Journal-Schema `/6` als `termination_unconfirmed`, damit die lokale Oberfläche den gespeicherten Abbruchgrund nicht verliert. | **in Arbeit** |
| BL-010.31 | Vorbereitete Auswahl und Ergebnisaktionen nach DS-088: einzelne Dateien vor Start über einen indexgebundenen, längengerahmten privaten IPC-Befehl entfernen; letzte Datei oder **Auswahl leeren** setzt Admission und UI vollständig zurück. Die lokale Liste nutzt eindeutige Quelllabels, ohne sie zu protokollieren. Gleicher Vertrag für beide Funktionen, unveränderlicher Stapel nach Start. **Ergebnisordner** steht auch unter Verarbeiten bereit, übernimmt beim App-Start keinen historischen Lauf und wird erst durch einen exakt neu in dieser UI-Sitzung gestarteten vollständigen Lauf aktiviert; alte Läufe bleiben ausschließlich über die Historie erreichbar. JS-, Rust-, IPC-, Frontend- und Paketregression; E2-Zielhostbedienung offen. | **in Arbeit** |
| BL-010.32 | Reproduzierbarer Standalone-UAT-Korpus mit genau 100 synthetischen Dateien: elf Eingabearten, jeweils kurz/mittel/groß, Fließtext-, Tabellen-, Mehrseiten-, Mehrblatt-, Präsentations- und OCR-Beispiele. Manifest und README liegen außerhalb des auswählbaren Eingabeordners, damit ausschließlich die 100 vorgesehenen Testeingaben verarbeitet werden; die Produktgrenze liegt bei 200 Dateien. Der Korpus prüft direkte beziehungsweise Markdown-first-Anonymisierung und rekursive Ordneraufnahme aller Unterordner. Generator und ZIP bleiben frei von echten Personendaten; Zielhost-UAT beider Betriebsarten offen. | **in Arbeit** |
| BL-010.33 | Strukturtreuer Standalone-Export nach DS-089 und DS-091: Die Wurzel-relative Herkunft einer Ordnerauswahl bleibt von der sicheren Rekursion über Queue und Journal bis zum sichtbaren Lauf erhalten. Vor Start wählt der Anwender für Anonymisierung **neutral** (datensparender Standard: `Dokument-NNN-anonymisiert.md`) oder **Originalname mit -anonymisiert** (`<Quellbasis>-anonymisiert.md`); die Zuordnung nennt in beiden Fällen exakt `relativer/Quellpfad` → `relativer/Ergebnispfad`. Die Wahl ist ohne Zusatzbestätigung pro Stapel in `datasecure-batch/6` unveränderlich gebunden; alte Standalone-v4-Läufe, reine Konvertierung (`<Quellbasis>.md`, keine Zuordnung) und Cowork (immer neutral/flach) bleiben unverändert. Segmente werden gegen absolute Pfade, Traversal, Links und Verzeichnistausch geprüft; Kollisionen bleiben deterministisch. E0-UI-/Rust-/IPC-/Worker-/Journal-/Export-/Recoverytests; E2-Zielhost-UAT offen. | **in Arbeit** |

DS-082 bindet dazu die lokale, nicht protokollierte Anzeige von Quellenordner,
Dateiauswahl und Ergebnisziel. DS-085 bindet den inzwischen implementierten
Nur-Konvertieren-Modus mit eigenem Zweck, Artefakt- und Ergebnisbaum;
technische Aktivierung ersetzt weder Paketnachweis noch menschliche Freigabe.

#### Verbindlicher Lieferplan für Standalone-Markdown-first-Anonymisierung (BL-010.30)

DS-087 und DS-090 erweitern nicht die Originalformat-Ausgabe. Die gemeinsame
Extraktionsschicht liefert ein neutrales, streng validiertes Ergebnis mit
Quelltyp, Markdown und Coverage. **Nur in Markdown umwandeln** darf daraus wie
bisher ein ausdrücklich nicht anonymisiertes `dm_`-Artefakt erzeugen.
**In Markdown umwandeln und anonymisieren** hält dasselbe Extraktionsergebnis
privat, bindet es an den vorhandenen stapelweiten Pseudonymzustand und
veröffentlicht ausschließlich ein bestehendes Privacy-Paket.

| Paket | Lieferung | Pflichtnachweis | Status |
|---|---|---|---|
| Neutraler Extraktionsvertrag | Modusfreie Extraktion; getrennte Adapter für `markdown-only` und Privacy; keine öffentliche Cross-Read-Brücke | Vertrags-/Mutations-/Cross-Read-Tests | **E0 umgesetzt und grün** |
| Stapel und Recovery | Breite Typen im Standalone-Anonymisierungsmodus; vorhandene v4-Zweck-/Phasenbindung; kein doppelter Export bei Fortsetzung; bestätigte Konverterbeendigung vor dem nächsten Item | Echte TXT/XLSX-Mischstapel in beiden Reihenfolgen, Abbruch zwischen Items, frische Fortsetzung und Exact-once-Publikation sind RC111-E0. Timeout/Startfehler und unbestätigte Beendigung bleiben durch die bestehenden Negativverträge gebunden | **E0 umgesetzt und grün** |
| Privacy und Pseudonyme | vorhandene PII-/Review-/Residual-Gates; eine Personen-/Unternehmensregistry über direkte und konvertierte Quellen | RC111 prüft reale stabile Personen- und Unternehmenslabels über direkte/konvertierte Quellen und Neustart; unvollständige breite Quellen verbrauchen keine Labels. Breiter Fachkorpus bleibt E3 | **E0 umgesetzt und grün** |
| Getrennte Statusgates | gültige `complete`- oder `incomplete`-Extraktion mit nichtleerem Markdown darf in Privacy; Anonymisierungsgrad wird nur aus PII-/Review-/Residualsignalen gebildet; beide Zustände stehen getrennt in Ergebnis und Manifest | Dateiendung und `source_type` sind gebunden; reale breite Formate durchlaufen den Privacy-Pfad, leere OCR und ungültige Coverage stoppen. Vollständige Container-/Grafik-/OCR-Coverage bleibt offen und wird nicht als Originalanonymisierung behauptet | **E0 umgesetzt und grün** |
| Ergebnis und UX | ein anonymisiertes `.md` je positive Quelle; direkte Zuordnung ohne Zwischenkonvertat; klare Bezeichnung als Markdown-Extraktion | Export-/Mapping-/Historien-/UI-Tests | **E0 umgesetzt und grün** |
| Paket und Produkte | Standalone-Runtime/SBOM/Offline-Smoke; Cowork-Allowlist unverändert | ZIP-/Runtime-/Produktisolationsgates | **RC111 aus `b543589f` besteht nach Korrektur des Harnessfehlers die vollständige Regression und PKG-04: zwei saubere bytegleiche Builds, beide Paket-/Worker-/History-/Sidecar- und sichtbaren nativen Windows-Smokes. INT-13 ist an genau diesen Commit und ZIP-SHA-256 `6086d1eb…69f8f` gebunden. Der gesperrte Cachetestrest stammt ausschließlich aus dem historischen RC109-Kontrolllauf; der neue Kandidat bereinigt beide eigenen Profile vollständig. E1/E2 und native macOS-Evidence bleiben offen.** |

#### Verbindlicher Lieferplan für reine Markdown-Konvertierung (BL-010.28)

Auftragserweiterung vom 06.09.2026: Nach dem abgeschlossenen RC107-Paketnachweis
wurde die zweite Standalone-Betriebsart mit den Formatstufen
XLSX/PPTX/PDF/Scan-PDF/Bilder in RC108 implementiert. Die vorhandenen Storys
werden fortgeführt, nicht dupliziert. Direkte Parser, eigene Artefakt-/Recovery-/
Exportkette und gebündelte PDF-/OCR-Runtime sind verbunden, nicht lediglich in
einer Dateiendungsliste angekündigt. Echte Inhaltserhaltung, getrennte Zwecke,
Offline-Betrieb und Negativtests bleiben verbindlich; abschließender RC108-
Paketnachweis und Zielhost-UAT folgen erst aus dem geprüften sauberen Commit.
Keine neue Cloudfunktion oder zusätzliche Anwenderinstallation.
Der [archivierte Experten-Implementierungsplan](../../tasks/archiv/2026-09-06-standalone-formatausbau-implementierungsplan.md)
bindet die konkreten Schnittstellen, Wiederverwendung, bereits gefundenen
Pilotlücken und Pflichtnachweise. Er führt kein eigenes Backlog.

Diese Funktion wird nicht gestrichen oder durch eine reine Textvorschau ersetzt.
Aktueller Lieferstand und verbleibende Nachweise, ohne neue doppelte Storys:

| Paket | Zuständige Story | Lieferung und Nachweis | Status |
|---|---|---|---|
| Modusvertrag | BL-010.28 | UI → Rust → private IPC → Service → Intake-v2 → eigener Worker → v5-Journal. Continue übernimmt nur den gespeicherten Zweck, alte Worker lehnen neue Nachrichtentypen ab, kein Pseudonymzustand bei reiner Konvertierung. Reale Snapshotaufnahme und prozessfrischer Resume getestet. | implementiert |
| Inhaltstreue für direkte Formate | BL-010.28, BL-020.1 | TXT/Markdown-Unicode/Zeilenenden, CSV-Originalzeilen/-Köpfe und DOCX-Text-/Tabellenstruktur ohne PII-Normalisierung. Eigene Markdown-Identität mit Digest und negativen Privacy-Lesegates. Komplexe DOCX und XLSX/PPTX behalten ehrliche `incomplete`-Hinweise, werden aber ohne Review ausgegeben. | implementiert |
| Vollständige Ergebnisreise | BL-010.28, BL-040.5/6 | Identitätsgebundener Markdown-Zielbaum, atomarer Gesamtabschluss und eine `.md` je erfolgreicher Quelle mit erhaltenem Basisnamen. Keine Zuordnung im reinen Modus; Fehlerdetails bleiben in der lokalen Diagnose. Exakter Laufresolver, kein Anonymisierungsordner/Plugin-Handoff. Recovery, Exportfehler und Replay durch echte Store-/Exporttests gebunden. | implementiert; Paket-/UAT-Nachweis folgt |
| Breite Formate | BL-010.15–18 | Reale Produktworker-Projektion mit gepinntem Node/PDF.js/Canvas/Tesseract und lokalen DE/EN-Modellen. XLSX/PPTX, Text-/Scan-PDF und PNG/JPEG/BMP getestet. PDF-OCR liest textlose und tatsächlich bildhaltige Seiten, auch neben nativen Headern; native Texte bleiben erhalten und identische OCR-Zeilen werden nicht verdoppelt. Reine Textseiten und unbenutzte Bildressourcen starten keine OCR. Keine zusätzliche Anwenderinstallation; grafische/OCR-Vollständigkeit ist keine Zusage. | implementiert; Paket-/Zielhost-UAT offen |
| UX, Diagnose und Paketnachweis | BL-010.19/21/26/28/31 | Picker/Drop → korrigierbare Auswahl → Ziel → Start → Fortschritt → Ergebnis; explizite Funktionswahl gemäß DS-086, **nicht anonymisiert** sichtbar ohne Rückfrageserie. Zuordnung nur für Anonymisierung. Worker-/Native-Abbruch-Negativtests und persistente Opt-in-Konverter-/Coverage-Ereignisse stehen E0; normale Interaktionslogs bleiben standardmäßig verfügbar. Mac-Zielhost separat. | E0 einschließlich realem Arbeitsbaum-ZIP-Smoke umgesetzt; sauberer commitgebundener Kandidat und UAT offen |

### Aktueller produktübergreifender UX-/Konsistenzschnitt

BL-010.13: Der zweite native Gegencheck verhindert einen möglichen Zugriff
auf noch nicht registrierten Desktopzustand bei frühen Fensterereignissen.
Der Hook nutzt `try_state()` ausschließlich im Drop-Arm. Der erste native
RC106-Start war durch die Sandbox/WebView-Umgebung blockiert; dasselbe ZIP
bestand mit normalen Hostrechten. Der finale PKG-04-Neubau aus `17a2160` wurde
nachgewiesen (siehe CURRENT_STATE). Seine native Testdatenisolation war jedoch
unzureichend und ist Gegenstand des aktuellen Korrekturblocks; sichtbare
Zielhost-UAT bleibt offen.

| Befund / Verbesserung | Zugeordnet | Engineering-Status und verbleibende Evidenz |
|---|---|---|
| Kryptische Standalone-Pseudonyme und getrennte Firmenrollen erschweren das Lesen zusammengehöriger Dokumente. | BL-030.2, DS-084 | v2 für neue Standalone-Stapel: lesbare stabile Nummern, gemeinsame Unternehmensidentität, keine Umnummerierung von Altbeständen; Registry-/Journal-/Mehrformat-Recoverytests. Native fachliche UAT bleibt offen. |
| Ein Lookup gespeicherter Firmenbindungen befüllte die aktuelle Ersetzungsliste nicht; Folgedokumente konnten am Restgate stoppen. | BL-030.2, BL-002 | Gemeinsamer Fix für Plugin/v1 und Standalone/v2, echte Folgedokumenttests statt ausschließlich Registry-Assertions. |
| Dateien bequem hineinziehen, aber nie versehentlich sofort starten. | BL-010.12/13, DS-084 | Native Tauri-Aufnahme über bestehenden Admissionpfad, Guard gegen Auswahl-/Startkonkurrenz, klarer Start und Pickeralternative. Reale Dragdrop-/Fokus-UAT auf Windows/macOS offen. |
| Cowork-Abschluss öffnete noch den Oberordner und behauptete bei nicht verfügbarem Export trotzdem Ergebnisse. | BL-040.6, BL-041.10 | Privater stapelgebundener Presenter löst exakten Exportlauf auf; Text und Button teilen dieselbe Verfügbarkeitsbedingung. Allgemeiner MCP-Ordnerbefehl bleibt unverändert; Mappingnamen bleiben privat. Echte Finder-/Explorer-Anzeige bleibt UAT. |
| Nur-Konvertieren war im Zielbild zu schwach und in der UI zeitweise nicht sichtbar. | BL-010.28, DS-085 | Zweite Kernfunktion ist in RC108 technisch umgesetzt und als eigenständige Funktion sichtbar: eigener Zweck, Worker, Journal, Markdown-Artefakte und Ergebnis-/Zuordnungsweg. Neuer RC108-Paketnachweis steht; menschliche Abnahme bleibt offen. Keine Übertragung der RC107-Freigabeevidence auf diesen Ausbau. |

### Zweiter unabhängiger Konsolidierungsreview 04.09.2026

Code-/Architektur- und Kanonreview wurden unabhängig durchgeführt und gegen die
aktuelle Herstellerdokumentation revalidiert. E0 geschlossen sind die
laufgebundenen Standalone-Zähler, der ehrliche `export_pending`-Zustand, Replay
offener Exporte beim Start/Ordnerwechsel, feste Zielbindung vor dem ersten
Teilexport, keine Cowork-Abschlussdialoge aus dem Standalone-Worker sowie der
UI-Reset nach verlorenem Sidecar-Admission. DS-078 korrigiert die frühere
Cloud-/Desktop-Brücken-Annahme. Der RC-Synchronisierer bindet nun auch Tauri-
Konfiguration, Rust-Paket, Zielartefaktnamen und alle aktuellen Standalone-
Nachweise; ein Vertragstest verhindert künftig gemischte Produktversionen.
Das dimensionsübergreifende Abschlussurteil mit der getrennten Evidencegrenze
für beide Produkte steht in
[`ARCH-DOC-REVIEW-BOTH-RC99`](../archive/2026-09/reviews/REVIEW_BEIDE_PRODUKTE_2026-09-04.md).

#### Wiederholter Experten-Gegencheck RC99 – E0 geschlossen

Der unabhängige Core-/Security-, Cowork-/UX- und Standalone-/Plattformcheck
reproduzierte und schloss sieben Restdefekte: fehlende Prüfung einer verweigerten
globalen Lock-Freigabe an allen Transaktionsgrenzen, einen nach Snapshot-API-Drift
wirkungslosen Lock-Integrationstest, falsche offene Exportzähler nach Replayfehler,
falschen Fortsetzungserfolg ohne Executor-ACK, einen als „bereit“ verschluckten
All-stopped-Abschluss, unvollständige CLI-Zustandstexte sowie den fehlenden
Cloud-Sync-Hinweis in direkten MCP-Prompts. Produktive Texte verwenden jetzt den
dedizierten lokalen Ergebnisordner; Originale bleiben außerhalb verbundener
Cowork-Ordner. Zertifikatsfreie macOS-Piloten sind ausdrücklich ad-hoc signiert;
native Intel-/ARM-Builds und Gatekeeper-UAT bleiben unter BL-010.20/21 offen.
Zugeordnet: BL-002, BL-010.13/14/20, BL-011.8, BL-040.5/6, BL-041.7 und
BL-047.1. Die erneute fachliche und technische Revalidierung meldete keine
weiteren E0-Defekte in diesen Umfängen. Ein anschließender State-of-the-Art-
Quellcodecheck schloss außerdem falschen Exporterfolg bei nicht freigegebenem
Export-Claim, den doppelten Standalone-Journalscan, eine zu frühe Ledger-Aktion
im Mischstapel, den widersprüchlichen Reviewvertrag und einen timingabhängigen
Intake-Worker-Nachweis. Zugeordnet: BL-010.13/14, BL-011.8, BL-040.6,
BL-043.1 und BL-047.1. Der anschließende manuelle Zustandsmaschinencheck schloss
zusätzlich die erneute Reservierung eines bereits präsentierten historischen
Abschlussmarkers mit alter Reservierungs-ID; Regression unter BL-011.8 und
BL-041.10.

| Restbefund | Story | Prio | Nächste Lieferung |
|---|---|---|---|
| `get_public_state` rief Recovery- und jüngsten Stapelstatus über zwei synchrone Vollscans ab. | BL-047.1, BL-010.13 | erledigt | ein kombinierter Snapshot liest jedes Journal je Poll höchstens einmal; 1.000-Journal-Read-Count-Test grün, 100-Dateien-Zielhostbenchmark bleibt E1 |
| Ein offener Export-Outbox-Eintrag besitzt keinen exklusiven prozessweiten Claim. | BL-040.6 | erledigt | atomarer Claim serialisiert Terminalexport und Replay; Live-Claim und Wiederanlauf regressionsgetestet |
| „Ergebnisse öffnen“ öffnet den globalen Outputstamm statt exakt den aktuellen Lauf. | BL-010.13, BL-040.6 | erledigt | laufgebundene, inhaltsfreie Öffnen-Aktion verweigert unvollständige Läufe |
| Der lokale OS-Öffner meldete Erfolg vor dem asynchronen `spawn`-Ergebnis; `ENOENT` konnte danach den Sidecar beenden. Erfolgreiche Klicks hatten zudem keine sichtbare Rückmeldung und „Zuordnung öffnen“ öffnete nur einen Ordner. | BL-010.13, BL-010.26 | erledigt | absoluter plattformspezifischer Öffner, bestätigter `spawn`/behandelter Fehler, exakte Dateimarkierung unter Windows/macOS, inhaltsfreie Events und separater UI-Hinweis; echter RC103-UAT bleibt E1 |
| RC103 bestätigte den Explorer-Start, startete die ausdrücklich gewünschte Windows-Oberfläche aber mit `windowsHide:true`; dadurch konnte der Klick ohne sichtbares Fenster enden. | BL-010.13, BL-010.26 | erledigt | RC104 startet nur diesen OS-Öffner sichtbar; Shell bleibt aus, Umgebung allowlisted, asynchrones Start-Fail-closed bleibt erhalten |
| Standalone verwies für die Zuordnung auf die private globale Mappingdatei und legte keine verständliche laufbezogene Tabelle neben die Ergebnisse. | BL-010.13, BL-040.5, DS-083 | erledigt | `DataSecure-Zuordnung.csv` wird formelneutralisiert und atomar als letzter Bestandteil eines vollständigen Standalone-Laufs veröffentlicht; Cowork erhält wegen der Originalnamen keine solche Projektion; RC103-Records werden journalgebunden migriert |
| Der native Windows-Paket-Smoke startete die Tauri-Hülle versteckt; WebView2 konnte dadurch die Seiteninitialisierung aufschieben und einen falschen IPC-Timeout erzeugen. | BL-010.11, BL-010.25 | erledigt | Paketgate startet denselben sichtbaren Lifecycle wie das Produkt, wartet auf Page-/Frontend-/Core-/IPC-Nachweise und beendet nur seine eigene Instanz |
| Worker-Empfangsbestätigung lag vor dem dauerhaften ersten Stapelcheckpoint. | BL-011.8, BL-043 | erledigt | öffentliche Semantik trennt jetzt angenommene lokale Aufnahme (`checkpoint_pending`) vom erst später belastbaren Journalcheckpoint; ACK-/Crash-Negativtests sind grün |
| PID-Wiederverwendung konnte eine tote Executor-Lease als lebendig erscheinen lassen. | BL-011.11 | erledigt | Lease-Eigentum bindet PID plus gehashte Betriebssystem-Startidentität; tote, wiederverwendete und nicht sicher beobachtbare Eigentümer sind regressionsgetestet |
| Presenter-Start bewies keine sichtbare Abschlussdarstellung. | BL-041.10, BL-012.2 | E0 erledigt | Standalone bestätigt erst nach Renderer-Paint; Windows-Cowork bestätigt das native `Shown`-Ereignis. macOS verlangt nun ebenfalls eine sichtbare AppKit-`SHOWN`-Bestätigung; reale Windows-/macOS-Beobachtung bleibt E1/E2 |
| Neutrale Core-API und Core-/Policy-Golden-Bindung fehlten zwischen beiden Produkten. | BL-010.9, BL-010.23 | E0 erledigt | Sieben reine Verträge sowie produktgleiche Goldenläufe für TXT/Markdown/CSV/DOCX, fünf Profile, Review, Abbruch und frische Fortsetzung stehen. Weitere I/O-/Transportentkopplung erfolgt nur bei konkretem Defekt; Zielhost-/Fachabnahme bleibt E1/E3. |
| Dokumentkanon besaß keinen vollständigen maschinenlesbaren Index aller aktuellen Dokumentklassen. | BL-003.9 | erledigt | `DOCUMENT_INDEX.json` bindet Status, Geltungsbereich, Eigentümer, Supersession und Entscheidungen; Driftgate läuft in `test:docs` |

#### Expertenimplementierung 05.09.2026 – Prozessidentität, ehrliche Annahme und sichtbarer Abschluss

Der Core-/Security-, Cowork-/UX- und Standalone-/Plattformgegencheck wurde in
einem gemeinsamen E0-Schnitt umgesetzt:

- Eine Worker-Empfangsbestätigung bedeutet nur noch, dass die lokale Aufnahme
  angenommen wurde. Bis zum dauerhaften Journalcheckpoint lautet der öffentliche
  Zustand ausdrücklich `local_intake_accepted_checkpoint_pending`; weder Skill
  noch Server behaupten bereits laufende oder fortsetzbare Verarbeitung.
- Executor-Leases binden den Prozess an `PID + Betriebssystem-Startidentität`.
  Linux verwendet Boot-ID und Start-Ticks, Windows die Prozessstartzeit und
  macOS den nativen Prozessstart. Nur sicher tote oder nachweislich
  wiederverwendete Eigentümer werden verworfen; Beobachtungsfehler blockieren
  fail-closed.
- Die Standalone-Oberfläche zeigt Vorbereitung und anschließend passive,
  inhaltsfreie `erledigt/gesamt`-Zähler. Ein terminaler Hinweis gilt erst nach
  tatsächlichem Renderer-Paint und passender inhaltsfreier Generationsnummer als
  dargestellt; verspätete/doppelte ACKs sind inert, bei ausbleibender Bestätigung
  bleibt genau der bestehende Worker-Fallback zuständig.
- Der Windows-Cowork-Dialog bestätigt nicht mehr den PowerShell-Prozessstart,
  sondern sein natives `Shown`-Ereignis. Für macOS ist der gleichwertige native
  Sichtbarkeitsadapter noch zu implementieren und anschließend mit
  BL-041.10/BL-051 auf dem Zielhost nachzuweisen; ein bloßer Windows-Test
  darf beides nicht ersetzen.

Damit entstehen keine neuen Anwenderdialoge und kein Polling durch Claude.
Der einzelne AppKit-Sammelreview und eine sichtbarkeitsbestätigte AppKit-
Abschlussmeldung sind E0 implementiert. Native Intel-/ARM-macOS-Build-,
Gatekeeper-, Review- und Sichtbarkeitsevidenz bleibt menschliche Zielhostabnahme
unter BL-010.20/21, BL-012.9/10 und BL-051.

### P0 – einfacher lokaler Sammelreview nach DS-068

Der verbindliche Detailvertrag ist
[`contracts/BATCH_REVIEW_V2.md`](contracts/BATCH_REVIEW_V2.md). Die drei vom
Product Owner bestätigten Lieferungen sind für Windows E0 umgesetzt; der
gleichwertige einzelne macOS-Sammeladapter ist nun ebenfalls E0 vorhanden.
Zielsystem- und Anwenderevidenz folgt getrennt und ersetzt die Implementierung
nicht.

| Priorität / Story | Detaillierte Lieferung | E0-Abnahmekriterium | Status / Rest |
|---|---|---|---|
| 1 · BL-012.9 | Den bestehenden lokalen Sammelreview als einzigen Reviewweg behalten. Nur `deferred_review`-Dateien werden lokal rekonstruiert; Reviewtext bleibt in `stdin`/Speicher, Journal, MCP und Diagnose bleiben inhaltsfrei. Abbruch, Vertagung, Timeout und Teilpublikation bewahren vorhandene Ergebnisse. | Windows-Sammeloberfläche und ein einzelner scrollbarer AppKit-Mac-Dialog; ein begrenzter Reviewer-Aufruf je Prüfgruppe; keine Rohdaten in Argumenten/Metadaten; Negativ- und Teilabbruchtests grün | **E0 erledigt** · native Intel-/ARM-Mac-Ausführung und E1/E2 offen |
| 2 · BL-012.10 | PII-Shield-Interaktionen sicher übernehmen: rot/gelb, direkte fachliche Aktionen, automatisch/bereits/jetzt/danach-Zähler, Rückgängig, exakte Gruppenaktion, eine Schlussfreigabe und Windows-Kürzel `Alt+Z`, `Alt+O`, `Alt+R`, `Strg+Enter`, `Esc`. | Gemeinsamer UI-Vertrag, Fortschrittsmodell und inhaltsfreie Projektion getestet; Mac verwendet einen einzelnen scrollbaren AppKit-Dialog und Abschlussmeldungen verlangen dort `SHOWN` | **E0 erledigt** · Mac-Fokus/A11y/Verständlichkeit E1/E2 offen |
| 3 · BL-043.1 | Klare Dateien automatisch intern abschließen. Gemäß DS-079 bleibt der sichtbare Laufordner eines Mischstapels bis zum abgeschlossenen Review verborgen; vollständig klare Stapel öffnen keine Review-UI. Die Reviewgruppe enthält nur tatsächlich mehrdeutige Dateien. | vollständiger Klarstapel: null Reviewaufrufe und 100 Prozent abgeschlossen; Mischstapel: korrekte Zähler, nur offene Dateien im Review und kein sichtbarer Teillauf | **E0 erledigt** · beobachteter Cowork-Lauf E2 offen |

| Aus PII-Shield bewertete Idee | Entscheidung | Backlogfolge |
|---|---|---|
| farbliche Treffer und direkte Keep/Redact-Aktionen | jetzt lokal übernommen | BL-012.10 |
| Fundstellenfortschritt, Rückgängig, Tastatur und eine Schlussfreigabe | jetzt lokal übernommen | BL-012.10, BL-012.5 |
| nur unklare Dateien vorlegen, klare Dateien automatisch abschließen | jetzt umgesetzt | BL-043.1 |
| gleiche Entscheidung auf nachweislich identische Kontexte anwenden | jetzt, aber nur bewusst und exakt | BL-012.10, BL-032.1 |
| zusätzliche übersehene Bereiche frei markieren | im Einzelreview vorhanden; im Sammelreview erst nach positionssicherer Dokumentabbildung | spätere eigenständige Story, kein aktueller P0 |
| lokale HTML-/App-Oberfläche für Rohdaten | nicht in die inhaltsfreie MCP-Status-App mischen; nur als späterer vollständig lokaler Architekturentscheid | BL-042.3 bleibt status-only |
| reversible Mappings, Rohdaten im Browser/MCP, Laufzeitdownloads, automatisches Raten | nicht übernehmen | dauerhaftes Sicherheits-Nichtziel |

Entscheidungsbasis: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016,
DS-017, DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025,
DS-026, DS-027, DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034,
DS-035, DS-036, DS-037, DS-038, DS-039, DS-040, DS-041, DS-042, DS-043,
DS-044, DS-045, DS-046, DS-047, DS-048, DS-049, DS-050, DS-051, DS-052,
DS-053, DS-054, DS-055, DS-056, DS-057, DS-058, DS-059, DS-060, DS-061,
DS-062, DS-063, DS-064, DS-065, DS-066, DS-067, DS-068, DS-069, DS-070,
DS-071, DS-072, DS-073, DS-074, DS-075, DS-076, DS-077, DS-078, DS-079 und DS-080.
DS-081 ergänzt die hostgesteuerte MCP-Versionsaushandlung und schließt einen
künstlichen `MCP26-01`-Cutover aus.

## A. Eigenständig lieferbare Entwicklung

| Story | Lieferung | Status |
|---|---|---|
| BL-022.1 | WordprocessingML wird namespacegebunden ausgewertet. Unbekannte XML-Entities, fremde Relationship-Namespaces und fremde direkte Textknoten stoppen fail-closed; Kopf-/Fußzeilen werden nur über tatsächliche Dokumentreferenzen gelesen. `gridSpan`/`vMerge` stoppen. `mc:AlternateContent` wählt eine Choice nur über tatsächlich aufgelöste bekannte Namespace-URIs; ein gefälschtes Literal kann `Requires` nicht umgehen. Historische `pPrChange`-/`rPrChange`-Eigenschaften werden nicht als aktueller Inhalt gerendert und blockieren die Datenschutzfreigabe. Kommentarreferenzen benötigen eindeutige, vorhandene IDs und konsistente Bereiche; Abweichungen erzeugen eine Coverage-Warnung. RC117 ergänzt echte Word-/`python-docx`-Pakete einschließlich interner Klassifizierungs-/Styles-Beziehungen, DrawingML-Layout und 15 visuell geprüfter komplexer Dokumente. Offen bleiben LibreOffice-Interoperabilität und realistische Kommentare. | **in Arbeit** |
| BL-024.2 | Der Engineering-Portable-Build übernimmt das verifizierte Universal-OCR-Bundle vollständig. Geschlossene Manifest-/Inventar-/Modus-/Hashgates, Installationspfade mit Leerzeichen, Adapter-Timeout und laufender Abbruch sind regressionsgetestet; der SEA-Engineering-Build behält das belegte OCR-Testbundle. Der reale Windows-Standalone-Paket-Smoke verwendet ausschließlich die extrahierte gebündelte Runtime und verarbeitet XLSX, PPTX, Text-/Scan-PDF sowie PNG/JPEG/BMP bis zum inhaltlich geprüften Markdown-Ergebnis; damit ist Paket→Adapter→OCR E0 belegt. Native macOS-Zielhostläufe bleiben offen. Eine OCR-/Bildfreigabe für die Anonymisierung ist dadurch ausdrücklich nicht erteilt und bleibt BL-024.3. | **in Arbeit** |
| BL-042.3 | Die inhaltsfreie Status-App bleibt nach Revalidierung absichtlich eine einmalige Start-Momentaufnahme: ein terminaler Zustand aus derselben Toolantwort wäre fachlich falsch und wird nicht ergänzt. Fester Textfallback, sieben begrenzte Zustände in DE/EN, beide Varianten für „Stapel läuft bereits“, reproduzierbarer CWD-unabhängiger Build und ein echter lokaler Edge-/axe-Lauf über alle 14 Sprach-/Zustandskombinationen plus 320-px-/400%-Reflow sind E0 belegt. `playwright-core` ist dafür exakt gepinnt und lädt keinen Browser. Der Pilot bleibt standardmäßig aus; echte Cowork-/Screenreader-/Hostabnahme ist E1/E2. | **in Arbeit** |
| BL-042.4 | Gemäß DS-074 UML-basierte Supportdiagnose: separate manuelle Debug-ZIP-Variante, gleicher Enginepfad, geschlossene JSON-Ereignisse an MCP-, Picker-, Worker-, Review- und Exportgrenzen. Fach-, Workflow- und Supportdiagnose verwenden dieselbe mehrprozesssichere Einzelereignis-Komponente; Alters- und Mengengrenzen werden physisch bereinigt, historisches JSONL bleibt nur lesbarer Upgradebestand. Keine Rohkommunikation und keine Wirkung auf Freigaben. E0 ist erledigt; echter Cowork-Supportlauf bleibt E1. | **in Arbeit** |
| BL-040.6 | Sichtbaren Export je Lauf und Zielunterordner identitätsgebunden serialisieren; ein Prozessclaim verhindert konkurrierende Record-Schreiber, ein ausgetauschter `DataSecure-Output` stoppt den Restexport, und lokale Öffnen-Aktionen wählen nur den vollständig abgeschlossenen aktuellen Lauf. Mischstapel bleiben gemäß DS-079 bis zum Gesamtabschluss unsichtbar. | **erledigt** |
| BL-003.9 | Maschinenlesbarer Dokumentindex mit Klasse, Status, Produktgeltung, Eigentümer, Versionsregel, Ablösung und Backlogbindung; Driftgate prüft Existenz, Eindeutigkeit und Kanonvollständigkeit. | **erledigt** |

### Erledigungsabgleich der Restbefunde aus dem Gesamtgegenreview 02.09.2026

Belegte Befunde des Claude-Code-Gesamtgegenreviews mit aktuellem Erledigungsstand (Bericht
`tasks/archiv/2026-09-03-claude-code-gesamtreview-bericht-rc86.md`). Sie sind ihren bestehenden
Storys zugeordnet und keine neuen Storys; Unterredaktion wiegt schwerer als
Komfort.

| Befund | Story | Prio | Rest |
|---|---|---|---|
| Liveness nur über `kill(pid, 0)`: eine wiederverwendete PID ließ eine tote Executor-Lease „lebendig“ wirken. | BL-011.11 | erledigt | PID plus OS-Prozessstartidentität implementiert; reale Crash-/macOS-Evidenz bleibt in Abschnitt B |
| Unicode-Kompatibilitätsvarianten (Fullwidth `＠`/Ziffern, Dot-Leader), Kontakt-/E-Mail-Überlappung und IBAN-Folgeidentifier. | BL-021.1 | E0 erledigt für die reproduzierten Fälle | Längengleiche begrenzte Erkennungssicht statt globalem NFKC; Original-/OCR-/Reviewoffsets bleiben exakt. `tel`/`sms` grenzen Zahlen ab und schützen eine überlappende vollständige E-Mail; benannte `callto`-Ziele bleiben vollständig geschützt. IBAN-Prosaabgrenzung für numerische DE/AT/BE und Schutz nachfolgender Identifier einschließlich zusätzlicher Ziffern. 20 IBAN-/127 PII-Fälle, echte Veröffentlichungs- und Markdown-only-Negativkontrollen. Keine pauschale Confusable- oder Länderlayout-Vollständigkeit; verbleibende konservative Überredaktion im RC109-Bericht. |
| Support-Review rekonstruierte Rohtext im MCP-Hauptprozess ohne `network-deny`. | BL-020.3 | E0 erledigt | Ausschließlich vorhandener guarded Review-Worker; Metadatenreparatur unter dessen Lock, danach strikte Reviewbereitschaft. Echter stdio-Test einschließlich Intake-Reservation, ACK/Cancel und privater Feldprojektion; ACK belegt keine sichtbare UI oder Fertigstellung. |
| Ein nach ACK-Timeout gestoppter Intake ließ private Kopien trotz totem Owner bis zum Intent-Ablauf liegen. | BL-011.8 | E0 erledigt | Nachweislich toter Owner ohne Journal: beim nächsten bestehenden Recovery-/Retentionlauf identitätsgebunden bereinigen, ohne zusätzliche TTL-Wartezeit. Live/unklare/wiederverwendete PID, neue Journale, Swap und Cleanupfehler bleiben geschützt. Keine Original-/Outputlöschung und kein neuer Timer. |
| `visibleResultTreeOverlaps` ohne Cache (Realpath je Datei und Wurzel). | BL-044.1 | P3 | Quantifizierung auf Referenzhardware; Cache nur bei belegtem Bedarf |
| Skill-Evals ohne DS-069-Fälle (Ordnerwechsel, Reset, `result_folder_required`, Sync-Hinweis). | BL-041.10 | E0 erledigt | Sechs neue Fälle: 39 synthetische Anfragen, zehn echte Normalwerkzeuge, genaue Argumentverträge und 22 Korpustests. Modell-/Hostabnahme bleibt E1/E2. Historische MCPB-Metadaten begründen keinen zusätzlichen Produktweg. |
| `test:product` (Profil `full`) startet über den Picker-Lifecycle-Test reale, fensterlose PowerShell-Prozesse (nur Windows, zeitbegrenzt). | BL-002 | P3 | akzeptiert; bei Bedarf in ein Windows-Only-Gate auslagern |
| Mehrfach gepflegte Diagnose-Allowlists und IPC-ACK-Klassifikation über Fehlertext. | BL-041.1 | E0 erledigt | Ein gefrorener öffentlicher/Workflow-/Supportkatalog; feste `.code`-Werte an Timeout, Abbruch, IPC-Fehler und frühem Exit. Exakte codefreie Legacytexte nur explizit opt-in. Unbestätigte Übernahme statt falscher Nichtstartzusage; Lease/Slot bis tatsächlichem Exit erhalten. |

### Restbefunde aus UML-, Architektur-, UX- und Fehlergegencheck 04.09.2026

Die UML-Prüfung hat die Zustandsmodelle von Dokumentposition, abgeleiteter
Stapelphase und kurzlebiger Reservation getrennt. Sechs technische Defekte sind
E0 geschlossen: Setupdialoge erst nach Readiness-/Aktivitätsprüfung,
zweckspezifische Pickerfehler, mehrprozesssichere und physisch bereinigte
Diagnoseereignisse sowie exklusive Ergebnisveröffentlichung ohne
Überschreibungsrennen, eine begrenzte JSON-RPC-Frameaufnahme und die wieder
aus der kanonischen Protokolldatei erzeugte MCPB-Engineering-Metadatenprojektion.
Das veraltete Marketplace-Einzeldateiartefakt wird beim Build entfernt. Die folgenden Punkte bleiben echte Lieferungen und werden
nicht durch Diagramme als erledigt dargestellt:

| Befund | Story | Prio | Nächste Lieferung |
|---|---|---|---|
| Der Abschluss galt nach erfolgreichem Presenter-Start als übernommen, nicht erst nach einer belegten sichtbaren Darstellung. | BL-041.10, BL-012.2 | teilweise erledigt | Standalone-Renderer-Paint und Windows-`Shown` stehen E0; macOS-Adapter und E1-Cowork-Beobachtung bleiben offen |
| Der Ergebnisstamm ist eine ausdrückliche geräte- und produktlokale Einstellung. Cowork stellt dem MCP keinen belastbaren aktuellen Workspacepfad bereit; DataSecure darf ihn nicht erraten. | BL-040.5 | entschieden | DS-080: Ziel beim Start identitätsgebunden an den Stapel binden; Änderung nur über „Ergebnisordner ändern“, keine Rückfrage und kein heimlicher Wechsel pro Projekt oder Lauf |
| `MCP26-01` ist keine offizielle Protokollversion; ein harter Wechsel würde ältere Claude-Hosts ohne Produktnutzen ausschließen. | BL-041.8 | entschieden | DS-081: moderne Version `2026-07-28` und getestete Legacy-Pfade hostgesteuert aushandeln; keine Nutzereinstellung, keine vollständige Konformitätsaussage ohne offizielle Conformance-Evidence |
| Klare Positionen eines Mischstapels sind intern dauerhaft, der sichtbare Export wartet auf den terminalen Gesamtstapel. | BL-043.1, BL-040.6 | entschieden | DS-079 behält die terminale sichtbare Semantik ausdrücklich bei; E0-Negativtest verhindert Teillauföffnung |
| Windows besaß einen Sammelreview, macOS nur einzelne modale Entscheidungen. | BL-012.9, BL-012.10 | E0 erledigt | macOS besitzt jetzt einen einzelnen scrollbaren AppKit-Sammeldialog; native Intel-/ARM-Ausführung, Fokus und Accessibility bleiben E1/E2 |
| „Ergebnisse öffnen“ öffnete den Output-Stamm statt zwingend den aktuellen Lauf. | BL-010.13, BL-040.6 | erledigt | exakter vollständiger `Lauf-*`-Ordner wird im vertrauenswürdigen Prozess auf allen unterstützten Shellpfaden geöffnet; Zielhostbeobachtung bleibt E1 |
| Ein offener Export-Outbox-Eintrag besaß keinen exklusiven prozessweiten Claim. | BL-040.6 | erledigt | Replay und Terminalexport sind über atomaren Claim serialisiert; Live-Claim, Zielaustausch und Wiederanlauf sind regressionsgetestet |
| Die Worker-Empfangsbestätigung belegt validierte Nachrichtenannahme, aber noch keinen dauerhaften ersten Stapelcheckpoint. | BL-011.8, BL-043 | erledigt | öffentlicher Zustand benennt bis zum Checkpoint ausdrücklich `checkpoint_pending` |
| Lange Standalone-Stapel besaßen keine passive lokale Fortschrittsanzeige. | BL-012.6, BL-042.3 | erledigt | inhaltsfreie Vorbereitung und monotone Zähler laufen im bestehenden Fenster ohne Polling durch Claude; E2-UX bleibt offen |
| Skill und Server spiegeln Teile der Zustandsentscheidung und können sprachlich oder logisch auseinanderlaufen. | BL-041.1 | P3 | Skill auf Intent/Toolwahl begrenzen, Serverantwort als einzige Zustandswahrheit kontraktprüfen |
| GitHub-synchronisierte Organisations-Marketplaces unterstützen die zuvor erzeugte `archive`-Quelle nicht. | BL-010.8 | erledigt | Build und Dokumentation erzeugen ausschließlich die selbsttragende relative Git-Projektion; Veröffentlichung und Zielhost-UAT bleiben menschliche Evidenz |
| DataSecure kann verbundene Cowork-Ordner nicht auslesen und damit die Trennung von Quellen und Ergebnisziel nicht technisch attestieren. | BL-040.5, BL-041.7 | entschieden | ehrliche Setup-/UAT-Regel: nur dedizierten Ergebnisordner verbinden, Quellordner nicht verbinden; keine zusätzliche Laufbestätigung |
| Nativer Standalone-Admission-Pfad prüfte die 500-MiB-Gesamtgrenze nicht und eine verlorene Worker-Bestätigung ließ dieselbe Auswahl erneut starten. | BL-010.12, BL-011.10 | erledigt | Gesamtbudget vor Start, einmaliger Verbrauch nach delegiertem Start und Regressionstests |
| Ein neuerer aktiver Standalone-Stapel verdeckte den jüngsten vollständig sichtbaren Ergebnislauf. | BL-010.13, BL-040.6, BL-010.29 | erledigt | Seit DS-086 bleibt die Navigation zwischen Start, Verarbeiten und Verlauf unabhängig vom Laufzustand. Status und Zähler gehören zum aktiven beziehungsweise ausdrücklich fortgesetzten Stapel, sonst zum jüngsten eigenen Stapel. Jede Verlaufszeile öffnet ausschließlich ihren eigenen vollständigen Ergebnislauf bzw. ihre Zuordnung; ein fehlendes Ziel fällt niemals auf einen anderen Lauf zurück. |
| Tauri und Node-Sidecar hatten abweichende Pfadbudgets und die UI besaß `core:default`. | BL-010.12, BL-010.15 | erledigt | identische UTF-8-Einzel-/Gesamtbudgets, nicht-UTF-8 fail-closed und nur explizite DataSecure-Kommandorechte |
| Atomare Journalpublikation erkennt viele Austauschfälle, kann aber ohne betriebssystemweites CAS keinen feindlichen gleichzeitigen Austausch durch denselben lokalen Benutzer ausschließen. | BL-011.8, BL-011.11 | P3 | bewusst außerhalb des aktuellen lokalen Vertrauensmodells; für ein später verschärftes Modell immutable Generationen oder nativen No-Replace-/CAS-Vertrag entwerfen, ohne Anwenderdialog |

## B. Technisch vorbereitet – menschliche Evidenz offen

| Story | Noch erforderlicher Nachweis | Status |
|---|---|---|
| BL-010.8 | Selbsttragende Runtime und drei Zielpaketprojektionen sind E0 fertig; reale macOS-Intel-/ARM-Ausführung und Cowork-Fresh-Install fehlen. Der Build erzeugt die von Anthropic unterstützte selbsttragende Git-Marketplace-Projektion mit relativer Quelle. Vor einer Freigabe fehlen Veröffentlichung in einem privaten/internen Marketplace-Repository sowie Installation und Update auf den Zielhosts. | **blockiert** |
| BL-010.7 | Lokale Cowork-Sitzung eines bestehenden Desktop-Deployments mit Plugin-MCP positiv sowie Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – negativ für Originale prüfen. | **blockiert** |
| BL-010.1 | Portablen Pluginstart auf jedem freizugebenden Zielsystem ohne vorinstallierte Runtime nachweisen; Windows-E0 ist grün, macOS und echter Cowork-Host fehlen. | **blockiert** |
| BL-010.2 | Windows-x64 Fresh Install, Kernlauf, Update und Entfernen. | **offen** |
| BL-010.3 | macOS Intel/ARM Fresh Install, Kernlauf, Quarantäne und Entfernen. | **offen** |
| BL-010.6 | Upgrade und Rollback mit unveränderten Quellen und synthetischen Daten. | **offen** |
| BL-011.3 | Mehrere pausierte Stapel und stabilen Pseudonymkontext real prüfen; kein Keyring. | **blockiert** |
| BL-011.6 | Größen- und Ressourcenstopps auf Windows und macOS beobachten. | **blockiert** |
| BL-011.7 | Abbruch, Fortsetzung und Zähler in echter Cowork-Bedienung verstehen lassen. | **blockiert** |
| BL-011.9 | POSIX-Supervisor auf realen macOS-Zielen unter Last und Abbruch nachweisen. | **blockiert** |
| BL-011.11 | Crash-/Dateisystemverhalten auf realen Zielsystemen prüfen. | **blockiert** |
| BL-011.12 | Adaptive Mehrprozessvorbereitung erst nach Windows-/macOS-Ressourcennachweis aktivieren. | **blockiert** |
| BL-011.13 | Plain-Arbeitskopien, Review und Fortsetzung auf Zielsystemen abnehmen; kein Schlüsselbundtest. | **blockiert** |
| BL-012.2 | Abschluss-, Review-, Resume- und Stopmeldungen beobachtet abnehmen. | **blockiert** |
| BL-012.3 | Vertagten Review nach Neustart ohne neue Dateiauswahl fortsetzen. | **blockiert** |
| BL-012.5 | Tastatur, Zoom, Screenreader und Fokus auf Windows/macOS prüfen. | **blockiert** |
| BL-012.6 | Alltagssprache und genau eine nächste Aktion mit fachfremden Personen prüfen. | **blockiert** |
| BL-012.7 | Kernaufgabe ohne technische Hilfe in höchstens drei bewussten Aktionen abschließen. | **blockiert** |
| BL-012.8 | macOS-Reviewdialog mit echtem `osascript` und Fresh Install prüfen. | **blockiert** |
| BL-012.9/10, BL-043.1 | Vereinfachten Sammelreview und automatischen Klar-Datei-Pfad in echter lokaler Cowork-Sitzung auf Windows/macOS beobachten; prüfen, dass klare Dateien keinen Dialog öffnen und die inhaltsfreien Zähler verstanden werden. | **blockiert** |
| BL-021.1 | TXT/Markdown auf Windows und macOS im installierten Produkt abnehmen. | **blockiert** |
| BL-021.2 | CSV-Dialekte und fachlichen Inhalt auf Windows/macOS abnehmen. | **blockiert** |
| BL-031.1 | Zertifikats-/Organisationskontext durch IT-/Health-IT-Fachvertretung prüfen. | **blockiert** |
| BL-032.1 | Mehrdeutigkeitsdialog auf Windows/macOS verständlich und konsistent abnehmen. | **blockiert** |
| BL-041.1 | Beide Skills in echter Claude-UI gegen denselben Jobvertrag prüfen. | **blockiert** |
| BL-041.2 | Ursprüngliche Aufgabe nach Abbruch begrenzt und verständlich fortsetzen. | **blockiert** |
| BL-041.3 | Chat-Upload eines synthetischen Originals muss sicher zum lokalen Picker umleiten. | **blockiert** |
| BL-041.4 | Spracheingabe und direkte Skillauswahl müssen denselben Ablauf starten. | **blockiert** |
| BL-041.5 | 200 Dateien/500 MiB, Neustart und Fortsetzung in Cowork abnehmen. | **blockiert** |
| BL-041.6 | Reine Anonymisierung endet lokal ohne Polling oder automatisches Ergebnislesen. | **blockiert** |
| BL-041.7 | Werkzeugberechtigungen, Pickerabbruch und Ergebnisübergabe in aktueller Cowork-Version prüfen. | **blockiert** |
| BL-041.8 | Den ausgelieferten Pluginserver mit der offiziellen MCP-Conformance-Prüfung gegen `2026-07-28` belegen. MCP-Tasks/Benachrichtigungen zusätzlich versions- und zielhostgebunden prüfen; ohne jeweiligen Nachweis kein Produktpfad und keine vollständige Konformitätsaussage. | **blockiert** |
| BL-041.9 | Den automatischen Übergang vom Hintergrundstapel in genau einen nicht blockierenden Sammelreview sowie „Später“, Abschluss und Wiederaufnahme auf Windows/macOS beobachten. | **blockiert** |
| BL-041.10 | Die gelieferte einmalige Ergebnisordnerwahl, Wiederverwendung ohne neue Abfrage, Ordnerwechsel, begrenzten Hintergrund-Replay und „Ergebnisse öffnen“ in echter Cowork-Bedienung auf Windows/macOS abnehmen. Beobachtung 03.09.2026 (Windows, rc85): Cowork beendet den MCP-Elternprozess kurz nach der Tool-Antwort; die Abschlussmeldung erschien in 4 von 5 Läufen nicht. Seit der zweiphasigen Eltern-/Worker-Übernahme (E0) ist nativ zu belegen, dass bei Elternprozessende oder Presenterfehler genau ein Fenster erscheint. | **blockiert** |
| BL-044.1 | Rekursive Ordnerquelle mit Link-/Race-Gegenproben auf Zielsystemen prüfen. | **blockiert** |
| BL-049.1 | Format-/Strukturgates und Ergebnisgrade durch Security auf Zielsystemen abnehmen. | **blockiert** |
| BL-050.3 | Referenzwerte und reales Dateisystem-/Power-Loss-Verhalten erfassen. | **blockiert** |
| BL-051.1 | Plugin-ZIP auf Windows x64 und macOS Intel/ARM frisch installieren. | **offen** |
| BL-051.2 | Erst nach Bereitstellung der selbsttragenden Marketplace-Projektion: privaten Marketplace auf Windows/macOS installieren, aktualisieren und entfernen. | **offen** |
| BL-051.3 | Versionneuen UAT-Serienlauf mit 200 Dateien und bis zu 500 MiB durchführen. | **offen** |
| BL-051.4 | Produktrollback auf Windows/macOS abnehmen. | **offen** |
| BL-051.5 | ZIP-/Marketplace-Lebenszyklus in Cowork real abnehmen. | **offen** |
| BL-051.6 | Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – sowie lokale Desktop-Sitzung ohne MCP negativ auf Originalzugriff prüfen. | **blockiert** |
| BL-052.1 | Beobachtete Anwenderabnahme mit dem aktuellen UAT-Kit durchführen. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit fachfremden Nutzenden abnehmen. | **offen** |
| BL-052.5 | Architektur und lokale Sicherheitsgrenze vor breitem Rollout freigeben. | **offen** |

„Blockiert“ bedeutet hier: Die Implementierung oder E0-Vorbereitung ist vorhanden,
aber eine reale Zielplattform, Claude-Version oder benannte Fachperson ist für den
Abschluss erforderlich. Es ist kein verdeckter Entwicklungsauftrag.

## Release-Evidence-Verträge

- **PKG-04:** Zwei unabhängige, jeweils mit leerem Cargo-Buildzustand erzeugte
  Windows-x64-Pakete desselben sauberen `main`-Commits müssen als ZIP sowie bei
  Desktop- und Core-Binary bytegleich sein. Beide Archive bestehen Manifest-,
  Modus-, SBOM-/Summen-, echten Worker-Handoff- und nativen Start-Smoke. Das
  Receipt nennt Commit, Tree, Toolchain und alle drei Hashes.
- **INT-13:** Eine Integrationsbindung darf erst nach bestandenem PKG-04
  entstehen und referenziert unveränderlich Commit, Kandidat, Archivhash und
  PKG-04-Receipthash. Ein Stage-Verzeichnis, `latest` oder nur eine Versionsnummer
  sind keine gültige Bindung. Zielhost-UAT bleibt davon getrennt offen.

## C. Spätere Format- und Plattformausbaustufen

Die folgenden Office-/PDF-/Bildgates betreffen die **Anonymisierungsfreigabe**
und vollständige Objekt-/Sicherheitsabdeckung. Die reine Standalone-Konvertierung
dieser Formate ist unter BL-010.18/28 bereits technisch integriert und darf
ehrlich unvollständige Konvertate mit Hinweisen liefern; sie hebt diese
Anonymisierungsgates nicht auf. Linux bleibt eine spätere Plattformstufe.

| Story | Lieferung | Status |
|---|---|---|
| BL-010.4 | Linux-Paket nach dem Windows-/macOS-Erstrelease mit eigener Hostevidenz liefern. | **offen** |
| BL-022.2 | Extraktions-Unterbau: stille 100-Spalten-/10.000-Zeilen-Kürzung beseitigt, explizite Ressourcenfehler und Literalformel plus gespeicherter Wert; reale Negativfälle. Weiterhin `incomplete`; Zell-/Namespace-/Kommentar-/Chart-/Relationship-Coverage und Produktintegration offen. | **in Arbeit** |
| BL-022.3 | Extraktions-Unterbau erhält Textläufe, numerische Notizen und tatsächliche Folienreihenfolge. RC111 validiert vor der Extraktion alle vorhandenen PPTX-XML-/RELS-Teile gegen DTD/Entities und Strukturgrenzen. Weiterhin `incomplete`; vollständige Folien-/Master-/Notiz-/Chart-/Objekt-Coverage und Fachkorpus offen. | **in Arbeit** |
| BL-023.1 | PDF-/OCR-Risikogate bis zur vollständigen Pflichtmatrix als NO-GO erhalten. | **in Arbeit** |
| BL-023.2 | Text-PDF nur nach vollständiger Parser-/Render-/Security-Coverage freigeben. | **offen** |
| BL-023.3 | RC111 stoppt PDF-Annotationen, Outline und XMP-Metadaten; standardisierte Info-Felder werden im reinen Markdown-Modus sichtbar und begrenzt erhalten. Formulare, Anhänge, Signaturen, weitere Objektarten und Verschlüsselungsvarianten bleiben bis zum vollständigen Coverage-Nachweis gesperrt. | **in Arbeit** |
| BL-023.4 | Reale Scan-PDF-Konvertierung und Privacy-Sperre sind E0 geprüft. Ein textloses Bild neben vorhandenem nativen PDF-Text erzeugt keinen falschen `OCR_TEXT_EMPTY`-Gesamtbefund mehr; wirklich textleere Extraktion bleibt gesperrt. Visuelle Vollständigkeit, OCR-Fachqualität und Zielhostkorpus bleiben offen. | **in Arbeit** |
| BL-024.3 | Reale PNG-/JPEG-/BMP-Extraktion und nachgelagerte Anonymisierung ihres gültigen, nichtleeren OCR-Markdowns sind E0 geprüft. Nicht freigegeben bleiben eine Vollständigkeitszusage für das Originalbild sowie Pixelredaktion; dafür sind Decoder-, OCR-, Metadaten- und Pixelnachweis sowie E1/E3 nötig. | **in Arbeit** |

## Epics

### BL-010 – Plattform und Distribution
### BL-003 – Product Vision und Dokumentenkanon
### BL-001 – Dokumentensystem und Wiederverwendung
### BL-002 – Ist-/Zielvertrag und Drift
### BL-011 – Sicherer fortsetzbarer Stapelkern
### BL-012 – Nutzerreise und lokaler Review
### BL-020 – Gemeinsame Inhaltsgrenze
### BL-021 – Text und CSV
### BL-022 – OOXML-Formate
### BL-023 – PDF-Risikogate
### BL-024 – OCR und Rasterbilder
### BL-030 – Profil und Pseudonyme
### BL-031 – Zertifikats- und Fundstellenkontext
### BL-032 – Mehrdeutigkeit
### BL-040 – Lokaler Export und Nachweis
### BL-041 – Claude-Übergabe
### BL-043 – Cowork-Fast-Path
### BL-044 – Sichere Datei- und Ordnerquellen
### BL-047 – Performance und Ressourcensteuerung
### BL-049 – Inhalts- und Formatgrenze
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme

Erledigte Arbeiten zu BL-001/002/003/040/043 sowie abgeschlossene E0-Scheiben
stehen ausschließlich in `BACKLOG_ARCHIVE_2026-08.md` und
`BACKLOG_ARCHIVE_2026-09.md`.
