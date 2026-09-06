# Verbindliches Entscheidungsregister

Stand: 06.09.2026

Alle Entscheidungen bleiben als unveränderliche Historie erhalten. „Angenommen“
bedeutet deshalb nicht automatisch „heute vollständig aktiv“:

- **aktiv:** DS-001 bis DS-012, DS-014, DS-017 bis DS-018, DS-020 bis DS-049,
  DS-051 bis DS-058, DS-060 sowie DS-062 bis DS-065 und DS-067 bis DS-081, jeweils mit den unten
  genannten Präzisierungen;
- **ersetzt:** DS-013 durch DS-043, DS-015 durch DS-045, DS-016 durch DS-046,
  DS-019 durch DS-059, DS-050 durch DS-065 und DS-066 durch DS-078;
- **teilweise präzisiert:** DS-002, DS-009, DS-020, DS-023 und DS-053 durch
  DS-067; DS-003 und DS-041 durch DS-066; DS-059 und DS-061 durch DS-065/DS-067; DS-020 und
  DS-044 durch DS-070; DS-026 und DS-048 durch DS-071; DS-003, DS-040,
  DS-041, DS-048, DS-063, DS-064, DS-067 und DS-069 durch DS-072; DS-008, DS-026 und DS-072
  durch DS-073; DS-007, DS-018, DS-024, DS-038, DS-049, DS-060 und DS-072
  durch DS-075; DS-004, DS-028, DS-030 und DS-075 durch DS-076; DS-004,
  DS-075 und DS-076 durch DS-077; DS-004 und DS-034 teilweise durch DS-052;
  DS-023 und DS-069 durch DS-080.

Der aktuelle operative Status steht in
[`TRACEABILITY.md`](TRACEABILITY.md). Historische Texte werden nicht still
umgedeutet.

Diese Entscheidungen stammen aus dem Produkt-Grill und bestätigten Ergänzungen. Sie beschreiben
das Zielprodukt, nicht automatisch den freigegebenen Funktionsumfang des aktuellen
Release Candidates. Der belegte Stand steht ausschließlich in `CURRENT_STATE.md`.

## DS-001 – Produktzweck und Aussagegrenze

DataSecure bereitet sensible Dateien lokal vor der KI-Verarbeitung auf. Es entfernt
erkannte Identifikatoren und liefert datenschutzreduzierte beziehungsweise
pseudonymisierte Inhalte. Es behauptet weder rechtssichere Anonymität noch eine
DSGVO-, AI-Act- oder sonstige Zertifizierung.

## DS-002 – Primäres Produkt und Verteilungswege

Das Claude-Plugin ist das Hauptprodukt. Direkter ZIP-Import und privater
Organisations-Marketplace sind gleichwertig unterstützte Verteilungswege. Ein MCPB
wird ausschließlich intern als Engineering-Artefakt gebaut und ist weder
Produktkanal noch Anwender-Fallback.

## DS-003 – Unterstützte Claude-Oberflächen (durch DS-066 ersetzt)

Lokale Originalverarbeitung ist nur in Claude Desktop oder Claude Code zulässig,
wenn `privacy_status` in der konkreten Unterhaltung erfolgreich verfügbar ist.
Cowork Desktop ist damit versionsabhängig möglich. Die Claude-Desktop-App wird nach
aktueller Herstellerdokumentation auf Windows und macOS angeboten; Linux ist nur als
lokaler Claude-Code-Host-Zielpfad vorgesehen und braucht eine eigene Abnahme. Web,
Mobil und Remote-Sitzungen dürfen nur bereits bereinigte Ergebnisse verwenden oder
den Schutz erklären.

Diese historische Oberflächenannahme wurde durch DS-066 ersetzt: Cowork darf
standardmäßig in der Cloud laufen. Entscheidend ist nicht „lokal oder Cloud“,
sondern die aktive, auf Desktop gestartete Verbindung zum lokal auf dem
Anwenderrechner laufenden Plugin-MCP.

## DS-004 – Plattformziel und Installation

Windows, macOS und Linux erhalten denselben normalen Benutzerablauf. Anwender
installieren Node, Python, OCR-Modelle oder andere Laufzeiten nicht manuell. Nach
außen existiert ein Plugin; intern dürfen betriebssystemspezifische Komponenten und
Pakete verwendet werden.

## DS-005 – Genau zwei sichtbare Skills

Sichtbar bleiben `gbh-datasecure-dokument-anonymisieren` und
`gbh-datasecure-datenschutz-erklaeren`. Dokumentarten erhalten keine eigenen Skills.

## DS-006 – Zwei gleichwertige Starts

Natürliche Sprache und direkte Skillauswahl starten denselben Ablauf. Originale
werden lokal ausgewählt und niemals als erforderlicher Chat-Upload angefordert.

## DS-007 – Verbindliche Zielformate

Das Zielprodukt unterstützt TXT, Markdown, DOCX, PDF einschließlich Scan-PDF,
XLSX, PPTX, CSV, PNG, JPEG und BMP. Ein Format gilt erst als unterstützt, wenn seine
vollständige Coverage und sein sicherer Fehlerpfad abgenommen sind.

## DS-008 – Einheitliches Ausgabeformat

Für jede Eingabedatei entsteht ein separates Markdown-Ergebnis. Tabellen, Seiten,
Folien, Notizen und andere fachlich relevante Strukturen werden darin nachvollziehbar
abgebildet. Eine originalgetreue Rekonstruktion der Quelldatei ist kein Ziel.

## DS-009 – Bilder und visueller Inhalt

Bildpixel gelangen nicht an Claude. Lokaler OCR-Text durchläuft dieselbe
De-Identifizierung und darf danach in Markdown erscheinen. Fotos, Logos und
dekorative Grafiken entfallen; nicht vollständig textuell übertragbare fachliche
Grafiken werden im gebündelten lokalen Abschlussdialog kenntlich gemacht.

## DS-010 – Stapelgrenzen

Ein Stapel umfasst höchstens 100 Dateien und 500 MiB Gesamtdaten. Es gibt keine feste
Grenze für Seiten, Folien oder Tabellenblätter. Interne Ressourcen-, Entpack-,
Verschachtelungs- und Laufzeitschranken bleiben erforderlich.

## DS-011 – Automatische Dokumenttypwahl

Profile und Dokumenttypen werden pro Datei intern erkannt. Gemischte Stapel sind der
Normalfall. Eine manuelle Profilwahl ist höchstens eine Support-/Expertenfunktion.

## DS-012 – Kontextbezogener Inhaltserhalt

Nur identifizierende Vorkommen werden entfernt. Rollen, Methoden, Technologien,
Fachbegriffe, Qualifikationen und Zertifizierungen bleiben erhalten. Ein
Zertifikatsaussteller bleibt im eindeutigen Zertifizierungskontext erhalten, wird als
Arbeitgeber, Kunde oder Vertragspartner jedoch anonymisiert. Kataloge unterstützen,
entscheiden aber nie allein.

Präzisierung 03.09.2026 (RC93, Codex-Befund C-04): Eine geschlechtliche Anrede
am Personennamen („Herr“, „Frau“, „Mr.“, „Mrs.“, „Ms“) ist ein
Quasi-Identifikator und wird mit dem Namen entfernt. Akademische und berufliche
Titel („Dr. med.“, „Prof.“, „Dipl.-Ing.“, „Dr.-Ing.“) sind fachlich benötigte
Qualifikationen und bleiben vor dem Pseudonym erhalten.

## DS-013 – Ein gebündelter Abschlussdialog

Der Stapel wird ohne Zwischenfragen vollständig abgearbeitet. Mehrdeutigkeiten und
fachlich nicht vollständig übertragbare Bereiche erscheinen danach in genau einem
lokalen Dialog. Entscheidungen gelten fundstellenbezogen; gleichartige Stellen im
aktuellen Stapel können bewusst gemeinsam behandelt werden.

Präzisierung 04.09.2026 (RC95): Erreicht der automatische Hintergrundlauf den
Reviewzustand, öffnet derselbe lokale Worker unmittelbar den einen Sammelreview.
Claude muss dafür keinen weiteren Toolaufruf veranlassen. „Später“, Schließen oder
Abbrechen pausiert den Review ohne Freigabe und ohne nachgeschalteten zweiten
Zustandsdialog. Nach der Entscheidung wird ausschließlich der tatsächlich
terminale Abschluss präsentiert.

## DS-014 – Später entscheiden

Eine Entscheidung darf mit deutlichem Hinweis vertagt werden. Die betroffene Datei
wird nicht freigegeben, bleibt aber fortsetzbar. Vertagen bedeutet nie, ungeprüfte
Inhalte an Claude zu senden.

## DS-015 – Technisch unlesbare Inhalte

Eine absolute Freigabegarantie für beschädigte oder technisch unlesbare Dateien ist
unzulässig. Der übrige Stapel wird beendet; offene Dateien bleiben lokal mit einer
konkreten Handlungsanweisung. Teilinhalte einer ungeklärten Datei werden nicht als
vollständiges Ergebnis ausgegeben.

## DS-016 – Passwortgeschützte Dateien

Passwörter werden ausschließlich in einem lokalen Dialog abgefragt, nur im
Arbeitsspeicher gehalten und weder gespeichert noch an Claude oder Diagnoseausgaben
übertragen.

## DS-017 – Eingebettete und aktive Inhalte

Unterstützte eingebettete Dokumente werden mit festen Rekursions- und
Ressourcengrenzen verarbeitet. Makros, Skripte, Programme und externe Inhalte werden
nie ausgeführt oder nachgeladen. Statischer Inhalt wird geprüft; Unklarheiten gehen
in den Abschlussdialog.

## DS-018 – Netzwerkfreier Verarbeitungskern

Parser, OCR, Erkennung, Review und Paketbildung arbeiten ohne Netzwerkzugriff.
Modelle und Kataloge werden nur als Bestandteil einer geprüften Plugin-Version
aktualisiert. Ein größeres Installationspaket wird dafür akzeptiert.

## DS-019 – Stapelweite flüchtige Pseudonyme

Identische Personen und Organisationen erhalten innerhalb eines Stapels konsistente
Platzhalter. Die Zuordnung wird nicht stapelübergreifend verwendet und nach Abschluss
aus dem Arbeitsspeicher entfernt.

## DS-020 – Originale und Arbeitskopien

Originaldateien bleiben unverändert am ursprünglichen Ort. DataSecure verarbeitet
private Arbeitskopien. Nach Erfolg werden sie sofort gelöscht; offene Arbeitskopien
eines abgebrochenen oder pausierten Auftrags dürfen für die Fortsetzung höchstens
14 Tage lokal bleiben.

## DS-021 – Fortsetzung statt Neustart

Erfolgreiche Dateien und Ergebnisse werden nach Fehler, Abbruch oder Programmneustart
nicht erneut verarbeitet. DataSecure bietet die Fortsetzung an der letzten sicheren
Position an.

## DS-022 – Nur ein aktiver Stapel

Pro Benutzer verarbeitet DataSecure höchstens einen aktiven Stapel. Mehrere pausierte
Aufträge dürfen gespeichert sein.

## DS-023 – Exportordner und dauerhafte Ergebnisse

DataSecure verwendet einen festen benutzerlokalen Exportordner
`DataSecure-Export` innerhalb seines Datenschutzbereichs. Der Normalweg fragt nicht
nach einem Ordner und zeigt ihn nicht vor jedem Start erneut an; das verhindert
Fehlablagen und hält Ergebnis, Mapping und Nachweis dauerhaft an derselben Stelle.
Exportierte Markdown-Ergebnisse, Mapping und Nachweis bleiben dort, bis der Anwender
sie selbst löscht oder außerhalb von DataSecure kopiert.

## DS-024 – Neutrale Namen und lokales Mapping

Ergebnisdateien erhalten neutrale Namen. Zusätzlich wird dauerhaft eine UTF-8-CSV
mit `Originaldatei;Ergebnisdatei;Status;Hinweis` exportiert. Sie enthält den
Originaldateinamen, aber keinen Quellpfad, und ist niemals für Claude oder MCP-Lesetools
zugänglich.

## DS-025 – Datensparsamer Verarbeitungsnachweis

Pro Stapel wird ein JSON-Nachweis mit Versionen, Zeitpunkt, Zählern, Regelstand und
inhaltsfreien Status-/Fehlercodes exportiert. Er enthält keine Originalnamen, Pfade,
Rohwerte, Inhalte oder Pseudonymzuordnungen.

## DS-026 – Diagnosemodell

Ein Diagnosepaket wird nur auf Wunsch lokal erzeugt und nie automatisch versandt. Es
enthält technische Versionen, Plattform, Phasen, Zähler, Laufzeiten, feste Fehlercodes
und Prüfsummen von Programmdateien, aber keine Dokumentkennzeichen oder Inhalte.
Eine getrennte Ablaufspur darf ausschließlich fest definierte Übergänge von Picker,
Worker, privatem IPC, Checkpoint, Verarbeitung und lokaler Abschlussanzeige sowie
begrenzte Zähler und feste Codes speichern. Freitext, Pfade, Namen, Inhalte, Tokens,
PIDs und Dokument-Hashes sind im Schema nicht darstellbar.

## DS-027 – Freiwillige Vorschau und automatische Freigabe

Eindeutig geprüfte Dateien werden ohne Pflichtlektüre freigegeben. Eine lokale
Gesamtvorschau ist freiwillig und optional. Nur echte Mehrdeutigkeiten benötigen eine
Entscheidung.

## DS-028 – Einfache und barrierearme Oberfläche

Der Normalweg zeigt Dateien auswählen, Fortschritt, gegebenenfalls Entscheidungen und
Ergebnis. Technische Begriffe bleiben unter Details. Die Oberfläche ist per Tastatur,
mit Skalierung und Screenreader bedienbar.

## DS-029 – Zentral gepflegte Regeln

Normale Anwender ändern keine Erkennungsgrenzen, Profile oder Fachkataloge. Diese sind
versioniert und Bestandteil eines geprüften Releases. Einstellbar bleiben
Exportordner, optionale Vorschau und der ausdrücklich gewünschte strenge lokale
Verwerfmodus für Bildanlagen. Jede Markdown-Ausgabe enthält ohnehin keine Bildpixel;
eine reine Markdown-Anforderung aktiviert diesen Modus nicht.

## DS-030 – Keine Signierungs- oder Zertifizierungspflicht

Codesignatur, Notarisierung und Produktzertifizierung sind keine Freigabevoraussetzung.
Das Produkt darf entsprechende Vertrauensaussagen nicht machen. Tests, SBOM und
Prüfsummen belegen technische Konsistenz, nicht Herstelleridentität.

## DS-031 – Update und Rückrolle

Jede verteilte Version besitzt eine höhere Versionsnummer und ein archiviertes
Vorgängerartefakt. Vor Verteilung laufen Tests und Artefaktprüfungen. Bei Problemen
wird die letzte funktionierende Marketplace-Version beziehungsweise ZIP erneut
bereitgestellt.

## DS-032 – Terminologie

„Anonymisieren“ bleibt der verständliche Aktionsname. Installation, Dokumentation und
Ergebnis erklären dauerhaft, dass erkannte Identifikatoren entfernt werden, das
Ergebnis aber datenschutzreduziert beziehungsweise pseudonymisiert und nicht
garantiert rechtlich anonym ist.

## DS-033 – Qualitäts- und Freigabeschwelle

Vor einem Echtdatenpilot müssen mindestens 1.000 vollständig synthetische Dokumente
über alle Zielformate und Dokumenttypen bestehen, ohne übersehenen direkten
Identifikator in der verpflichtenden Suite und mit mindestens 99 Prozent Erhalt der
markierten fachlichen Inhalte. Jeder Defekt wird dauerhaft zum Regressionstest.

## DS-034 – Gemeinsame Plattformfreigabe

Eine Version heißt erst plattformübergreifend freigegeben, wenn ZIP und Marketplace
auf Windows, macOS und Linux frisch installiert und der vollständige Benutzerweg,
alle Formate, Fortsetzung und Exporte abgenommen wurden. Vorher sind einzelne
Plattformen höchstens Engineering-Vorschauen.

## DS-035 – Evolution statt Rewrite

RC30 bleibt getestete Ausgangsbasis. Auftragsmodell, Plattformadapter, Parser, OCR,
Review und Tests werden schrittweise ersetzt oder erweitert. Ein Total-Rewrite ist
nicht vorgesehen.

## DS-036 – Fortschritt und sicherer Abbruch

Der lokale Fortschritt zeigt Position, Phase, Zähler und nur belastbare Restzeiten.
Ein Abbruch ist sicher, hinterlässt einen fortsetzbaren Auftrag und veröffentlicht
keine ungeklärte Datei.

## DS-037 – OCR-Sprachen

Deutsch und Englisch sind die verbindlichen OCR-Sprachen des ersten vollständigen
Releases, einschließlich gemischtsprachiger Dokumente. Die Entitätserkennung bleibt
zusätzlich für relevante lateinische, griechische, kyrillische und häufige
CJK-Namensschreibweisen ausgelegt. Weitere OCR-Sprachpakete können versioniert folgen.

## DS-038 – Open Source vor Eigenentwicklung

Vor eigener technischer Implementierung wird für jede Backlog-Story geprüft, ob ein
gepflegter Open-Source-Baustein das Nutzerziel einfacher und sicher erfüllt. Eine
Komponente wird nur übernommen, wenn Herkunft und Version fest pinbar sind, die
Lizenz zur Verteilung passt, Verarbeitung vollständig lokal und netzwerkfrei möglich
ist, Windows/macOS/Linux ohne manuelle Installation abgedeckt sind und unsere
Coverage-, Ressourcen-, Datenschutz- und Negativtests bestehen. Externe Bibliotheken
ersetzen nicht die DataSecure-Sicherheitsgrenze. Nicht passende Komponenten dürfen
als Testorakel oder Benchmark dienen; Eigenentwicklung braucht eine dokumentierte
Restlücke.

## DS-039 – Lokale Stapelaufbereitung und Claude-Weiterverarbeitung trennen

Die Grenze von 100 Dateien und 500 MiB gilt für die vollständige lokale, fortsetzbare
Aufbereitung, Prüfung und den Export. Sie ist keine Zusage, dass dieselbe Datenmenge
in einen einzelnen Modellkontext passt oder vollständig in einer Unterhaltung gelesen
wird. DataSecure beendet den lokalen Stapel unabhängig von der nachfolgenden
Claude-Aufgabe und hält alle freigegebenen Markdown-Ergebnisse lokal bereit.

Claude verwendet anschließend nur freigegebene Ergebnisse und liest sie
aufgabenbezogen in begrenzten, fortsetzbaren Schritten. Soll ausdrücklich der gesamte
Stapel ausgewertet werden, zeigt der Ablauf die Anzahl bereits verwendeter und noch
offener Ergebnisse und setzt die Auswertung gestuft fort. Ergebnisse dürfen weder
stillschweigend ausgelassen noch wegen eines Modell-, Kontext- oder Hostlimits als
lokal unverarbeitet dargestellt werden.

## DS-040 – Cowork-Fast-Path ist lokal zuerst

Die Standardabsicht „Dateien anonymisieren“ ist ein `local_only`-Auftrag: Nach der
einzigen lokalen Mehrfachauswahl verarbeitet und exportiert DataSecure den Stapel
ohne Markdown-Lese-, Bestätigungs- oder Polling-Aufruf durch Claude. Ein lokaler,
inhaltsfreier Abschluss meldet nur Zähler und den Speicherort der lokalen Ergebnisse.

Nur eine ausdrücklich verlangte Folgeaufgabe verwendet `continue_in_chat`; erst dann
darf Cowork freigegebenes Markdown in begrenzten Seiten lesen. Der Plugin-Server kann
Host-Berechtigungsdialoge nicht abschalten, minimiert aber die Anzahl und Vielfalt
der Werkzeuge im Normalpfad. Lokale Verarbeitung bleibt der Produktkern; MCP-Tasks
oder Benachrichtigungen sind nur ein versionsgebundener Host-Spike und keine
Voraussetzung für Offline-Verarbeitung oder Abschluss.

## DS-041 – Cowork-first mit lokaler Ausführung

Cowork ist der normale Einstieg sowie der Ort für inhaltsfreien Status und
freigegebene Ergebnisse. Originalzugriff, Verarbeitung und rohdatenhaltige Prüfung
bleiben lokal. Eine separate Companion-Anwendung gehört nicht zum Normalweg.

## DS-042 – Progressive, inhaltsfreie MCP-App

Eine eingebettete MCP-App darf den Ablauf komfortabler machen, aber nur opake
Vorgangskennungen, feste Statuswerte, Zähler und inhaltsfreie Aktionen erhalten.
OS-Picker und Textfallback bleiben vollständig funktionsfähig; ein App-iframe ist
kein belegbar lokaler Rohdatenkanal.

## DS-043 – Nicht blockierender, dauerhafter Auftrag

Nach durablem Checkpoint kehrt der Startaufruf kurzfristig zurück. Ein unabhängiger
lokaler Worker verarbeitet weiter. Reviewentscheidungen besitzen keinen
menschlichen Timeout; pausierte Stapel blockieren keinen neuen Stapel. Diese
Entscheidung ersetzt DS-013 und präzisiert DS-021, DS-022, DS-036 und DS-040.

## DS-044 – Sichere Datei- und Ordnerquellen

Datei- und rekursive Ordnerwahl sind gleichwertige lokale Starts. Der gesamte
Umfang wird vorab validiert; Symlinks, Junctions, Reparse Points und externe
Beziehungen werden nicht verfolgt. Lokal synchronisierte SharePoint-/OneDrive-
Quellen sind schreibgeschützt zulässig. Chat-Anhänge sind kein Originaleingang.

## DS-045 – Drei ehrliche Ergebnisgrade

Jede Quelle endet als vollständig verarbeitet, verwendbar mit ausdrücklich
benannten Auslassungen oder sicher nicht verarbeitet. Eine stille Teilfreigabe ist
unzulässig. Diese Entscheidung ersetzt DS-015.

## DS-046 – Verschlüsselte Quellen nicht entschlüsseln

Passwortgeschützte oder verschlüsselte Quellen werden weder kopiert noch
entschlüsselt. Sie werden im Stapel getrennt als nicht verarbeitet ausgewiesen;
andere Quellen laufen weiter. Diese Entscheidung ersetzt DS-016.

## DS-047 – Adaptive lokale Ressourcensteuerung

Parallelität richtet sich automatisch nach CPU, freiem Speicher, Format und OCR.
Der normale Speicheretat beträgt höchstens das Minimum aus 25 Prozent RAM und zwei
GiB. Picker und Startannahme sollen je höchstens zwei Sekunden benötigen, kein
Verarbeitungsaufruf Cowork länger als zehn Sekunden blockieren; ein unbegründeter
Regressionseffekt über zehn Prozent blockiert die Freigabe.

## DS-048 – Readiness, Selbstheilung und inhaltsfreie Diagnose

Vor dem Start werden lokale Bereitschaft, Benutzerbindung, Schreibrechte und
Speicher geprüft. DataSecure darf einen eigenen Prozess genau einmal neu starten,
nicht aber einen ausgefallenen Claude-Host kaschieren. Ereignisse bleiben 14 Tage,
enthalten keine Inhalte, Namen, Pfade, Hashes oder Tokens und werden nie automatisch
übertragen.

## DS-049 – Vollständige Inhaltsgrenze

Signatur, Containerstruktur und Endung müssen zusammenpassen. Aktive Inhalte werden
nie ausgeführt und externe Inhalte nie geladen. Native Textschichten haben Vorrang;
lokale deutsch-/englische OCR ergänzt nur fehlende Bereiche. Header, Footer,
Notizen, Kommentare und relevante versteckte Office-Bereiche gehören zur Coverage.
Ein Nulltreffer wird nur nach vollständigem Parse und unabhängigem Residual-Gate
freigegeben.

Präzisierung 03.09.2026 (RC94): Fragmentierte Tabellenköpfe werden nur dann
automatisch spaltengebunden zusammengesetzt, wenn höchstens drei gleich breite
Kopfzeilen je Spalte ein bereits bekanntes sensibles Label ergeben. Abweichende
Zeilenbreiten, mehr als drei sensible Kopfzeilen oder nicht eindeutig
koordinierbare Zellen stoppen am unabhängigen Restprüfungsgate; es wird keine
Spaltenposition geraten. DOCX-Tabellen mit horizontal oder vertikal verbundenen
Zellen stoppen bis zu einer koordinatentreuen OOXML-Abbildung ebenfalls
fail-closed. Dafür entsteht keine neue Anwenderbestätigung.

## DS-050 – Benutzergebundene Verschlüsselung und sichere Löschung

Private Snapshots und Reviewdaten werden pro OS-Benutzer mit einem über DPAPI oder
Keychain geschützten Schlüssel verschlüsselt; ohne sicheren Store wird vor jedem
Rohschreibzugriff gestoppt. DataSecure löscht nur eigene verwaltete Artefakte,
niemals Quellen oder Links. Temporäre Rohdaten verschwinden nach Erfolg sofort und
sonst spätestens nach 14 Tagen; Exporte und Mapping bleiben dauerhaft.

Für Verlust oder Widerruf des OS-gebundenen Schlüssels gibt es keine
Wiederherstellungs-Hintertür und keinen Ersatzschlüssel. Unlesbare private
Arbeitskopien bleiben gesperrt und dürfen erst nach ausdrücklicher lokaler
Bestätigung verworfen werden. Falls die unveränderte Originalquelle weiterhin
verfügbar ist, wird anschließend ein neuer Auftrag aus dieser Quelle begonnen;
DataSecure verändert oder löscht die Originalquelle dabei niemals.

## DS-051 – Einmalige Ergebnisübergabe

`nur anonymisieren` übergibt keine Dokumentinhalte. `anonymisieren und auswerten`
übergibt freigegebene Markdown-Ergebnisse stapelweise mit höchstens einer
nutzungsseitigen Freigabe, soweit der Host dies ermöglicht. Hostberechtigungen
werden nicht umgangen. Der Abschluss zeigt höchstens die drei anwendbaren Aktionen
„Ergebnisse verwenden“, „lokal prüfen“ und „Ausgabe öffnen“.

## DS-052 – Gestufte Plattformfreigabe

Der erste produktive Cowork-Release umfasst Windows x64 und macOS Intel/Apple
Silicon. Die Engine bleibt portabel; Linux und Windows ARM64 folgen erst mit eigener
Hostevidenz. Diese Entscheidung ersetzt DS-004 und DS-034, soweit diese eine
gleichzeitige Drei-Plattform-Freigabe verlangen.

## DS-053 – Selbsttragende Distribution ohne Signierungszwang

Anwender installieren weder Node.js noch Python. Marketplace und manuelle
zielsystemspezifische Windows-x64-, macOS-x64- und macOS-arm64-ZIPs enthalten
alle Laufzeiten; MCPB ist nur ein internes Engineering-Artefakt und kein
Anwender-Fallback. Ein universeller Marketplace-Ordner ist nur zulässig, wenn er
self-contained, innerhalb der geltenden Paketgrenze und auf allen enthaltenen
Zielen abgenommen ist. Es besteht keine Produktpflicht zur Signierung oder
Zertifizierung; Hashbindung, reproduzierbarer Build, SBOM und Zielsystemtests
bleiben Pflicht. Diese Fassung bestätigt DS-030 und wird durch DS-067 präzisiert.

## DS-054 – Datenwahrender Lifecycle

Update, Rückrolle und Deinstallation dürfen Originale, Exporte, Mappings und offene
Aufträge nicht verlieren. Datenmigrationen sind versioniert, vorab gesichert und
reversibel; bei Fehler bleibt der letzte durable Stand nutzbar.

## DS-055 – Sprache, Barrierefreiheit und Administration

Deutsch und Englisch sowie WCAG-orientierte Tastatur-, Fokus-, Kontrast-, Skalierungs-
und Screenreader-Gates sind Releasebestandteil. Administration darf Formate,
Quellgrenzen, Sprache, Ausgabe, Auswertungsmodus und Retention bis höchstens 14 Tage
verschärfen, aber keine Sicherheitsgrenze abschwächen.

## DS-056 – Stufenweise Freigabe mit menschlicher Evidenz

Auf synthetische Techniktests folgen interne Cowork-Abnahme, kontrollierter
Echtdatenpilot nach Datenschutz-/Security-Freigabe, Unternehmensrollout und erst
danach öffentlicher Marketplace. Vor Rollout bleiben P0 und P1 geschlossen und
Windows-/macOS-Cowork-Nachweise verpflichtend.

## DS-057 – Kanonische Produktführung

`DECISIONS.md`, `PRODUCT_VISION.md`, `PRODUCT.md`, `TARGET_ARCHITECTURE.md`,
`BACKLOG.md`, `CURRENT_STATE.md`, `TRACEABILITY.md` und Maschinenverträge bilden in
dieser Rangfolge den Kanon. Entscheidungen besitzen unveränderliche DS-IDs und
werden ausschließlich durch neue, explizit ersetzende IDs geändert.

## DS-058 – Neutrales Ergebnis und lokales Mapping

Ergebnisse erhalten neutrale Namen. Das dauerhafte lokale Mapping enthält keine
Rohentitätstabelle und nur dann einen relativen Quellpfad, wenn eine gewählte
Ordnerhierarchie sonst nicht eindeutig abbildbar wäre. Diese Entscheidung
präzisiert DS-024.

## DS-059 – Neustartfester Pseudonymkontext

Stapelweite Pseudonyme bleiben über Pause und Neustart konsistent. Dafür wird nur
der minimal nötige Kontext benutzergebunden verschlüsselt gespeichert und nach
Abschluss gelöscht. Diese Entscheidung ersetzt die reine RAM-Vorgabe aus DS-019.

## DS-060 – Offline-Lieferkette

Open Source bleibt bevorzugt, wird aber nur gepinnt, integritätsgeprüft,
lizenzkompatibel, SBOM-erfasst und ohne Runtime-Downloads ausgeliefert. Jede
Komponente muss die Offline-, Format-, Ressourcen- und Negativgates bestehen. Diese
Entscheidung präzisiert DS-038.

## DS-061 – Verbindlicher Refactoring- und Migrationsplan

`REFACTORING_PLAN.md` übersetzt die beschlossenen Produkt- und Architekturgrenzen
in eine verbindliche, rückrollbare Implementierungsreihenfolge. Strukturänderung
und Verhaltensänderung werden getrennt; Originalschutz und benutzergebundene
Verschlüsselung gehen Distribution, Performance und Formaterweiterung voraus.
Charakterisierungs-, Negativ-, Recovery-, Dokumentations- und lokale CI-Gates sind
für jeden Teilschnitt Pflicht. Diese Entscheidung ergänzt DS-057 um den
Implementierungs- und Migrationsrang, ohne frühere Produktentscheidungen zu ändern.

## DS-062 – Keine zusätzliche System-VM

Bestätigt am 31.08.2026: DataSecure wird nicht als VM-Lösung gebaut; auch die
Testplanung darf keine zusätzliche System-VM vorsehen oder voraussetzen.
Entwicklung und Abnahme erfolgen auf echten lokalen Zielsystemen. Diese
Entscheidung präzisiert DS-052/DS-056 und verwirft die frühere VM-Testoption.
Ein separates lokales OS-Testkonto ist ein möglicher, aber gesondert mit dem
Anwender abzustimmender Weg für Tests mit echtem Credential Store. Ohne sichere
Trennung bleiben solche Tests offen; produktive Schlüssel und Originale werden
nicht umbenannt, ausgelesen, überschrieben oder gelöscht, um Tests zu ermöglichen.
Produktfreie synthetische Tests dürfen weiter lokal laufen. JavaScript-
Testkontexte (`node:vm`) sind keine zusätzlichen Betriebssystem-VMs. Die Zusage
betrifft DataSecure und unsere Testinfrastruktur, nicht interne Sandboxtechnik
des externen Claude-Hosts.

## DS-063 – Kein zusätzliches Windows-Benutzerkonto

Bestätigt am 31.08.2026: Auch ein separates Windows-Benutzerkonto wird weder für
DataSecure noch für seine Tests bereitgestellt. Diese Entscheidung ersetzt den
in DS-062 noch zur Abstimmung gestellten OS-Testkonto-Weg. Keine erneute
Kontoanforderung als Nutzeraufgabe. Der VM-Ausschluss bleibt bestehen.

Die sichere Trennung von Testdaten und Testschlüsseln im vorhandenen Konto ist
Entwicklungsarbeit. Zunächst sind ausschließlich produktfreie synthetische Tests
zulässig. Ein möglicher Engineering-eigener Credential-Namensraum benötigt ein
separates Design, Negativtests und Nachweis, dass kein Produktcredential gelesen,
verändert oder gelöscht werden kann. Eine frei wählbare Produktvariable zur
Schlüsselumleitung oder ein anderes Datenverzeichnis alleine genügen nicht.
Bis dahin bleiben die bisherigen echten SEA-Keyring-Abnahmeläufe unzulässig.
Synthetische oder abweichend konfigurierte Nachweise dürfen nicht als unveränderte
Produkt-/OS-Abnahme ausgegeben werden. Diese Grenze ist keine weitere vom Nutzer
zu beschaffende Infrastruktur, sondern offene E0-Testarchitekturarbeit.

## DS-064 – Einfacher Produktablauf statt wachsender Testinfrastruktur

Bestätigt am 31.08.2026: Einfachheit und Funktionsfähigkeit haben Vorrang vor
weiterem Ausbau einer umfassenden Schlüsselbund-/SEA-Testinfrastruktur. Diese
Entscheidung begrenzt den aus DS-063 abgeleiteten Implementierungsumfang; keine
VM, kein Zusatzkonto und keine weiteren Anwenderdialoge.

Produktive lokale Verschlüsselung, Originalschutz, inhaltsfreie Diagnostik und
sicheres Stoppen bei Schlüssel-/Parserfehlern bleiben erhalten. Automatisierte
Verschlüsselungs-, Fehler-, Abbruch- und Fortsetzungstests verwenden die vorhandenen
Testadapter. Für den echten Windows-Schlüsselbund genügt zunächst ein gezielter
Smoke-Test: synthetischen Schlüssel in einem eindeutig eigenen temporären
Testeintrag schreiben, lesen/vergleichen, ausschließlich diesen Eintrag entfernen.
Keine Produktionscredentials lesen, ersetzen oder löschen. Ein kleiner, expliziter
lokaler Test genügt; kein allgemeiner Namespace-Manager oder zusätzlicher Dienst.

Die zusätzliche prozessübergreifende Engineering-Session-/Buildbindung und eine
vollständige native Keyring×SEA×Crash×Recovery-Matrix sind zurückgestellt, nicht
erledigt und keine vorgeschaltete Pflicht für weitere Produktarbeit. Die
Kombination ist damit nicht umfassend geprüft; daraus keine pauschale Risiko-
oder Produktfreigabe ableiten. Normale echte Installation, Dokumentverarbeitung
und relevante Abbruch-/Fortsetzungsabläufe bleiben praktisch abzunehmen.
Bekannte reproduzierbare Fehler werden weiterhin behoben.

Historischer damaliger Folgeschritt war ein kleiner Schlüsselbund-Smoke-Test.
DS-065 hat diese Priorität später ausdrücklich verworfen; sie ist weder aktuelle
Produktarbeit noch eine offene Nutzeraufgabe.

## DS-065 – Lokale Arbeitskopien ohne zusätzliche Verschlüsselung

Bestätigt am 31.08.2026: DataSecure verwendet für neue private lokale Snapshots,
Reviewkopien und einen künftig neustartfesten Pseudonymkontext keine zusätzliche
Verschlüsselung. Kein Windows-Schlüsselbund oder anderer OS-Secret-Store, keine
Ersatzschlüsseldatei und keine Passwortabfrage. Keine zusätzliche VM, kein
zusätzliches Windows-Konto und kein zusätzlicher Anwenderdialog.

Die verwalteten lokalen Dateien sind für das Benutzerkonto und bei entsprechenden
Dateirechten auch für andere Prozesse lesbar. Diese Einschränkung ist bewusst
akzeptiert; „privat“ bedeutet lokal und nicht an Claude freigegeben, nicht
verschlüsselt. Originalschutz, lokale Anonymisierung, Inhalts-/Release-Gates,
inhaltsfreie Diagnostik und die Aufbewahrungsregeln neuer Plainkopien bleiben
unverändert. Erfolgreiche Rohkopien werden entfernt, offene Rohkopien spätestens
nach 14 Tagen; Reviewkopien folgen ihrer konfigurierten Frist. Originale, Exporte
und Mappings bleiben geschützt.

Verschlüsselte Altbestände (`datasecure-batch/3`, `.dsart` und zugehörige
Metadaten) bleiben unangetastet. Keine automatische Entschlüsselung, Migration,
Schlüsselbundabfrage oder Löschung zur Umstellung. Für eine erneute Verarbeitung
wird die unveränderte Originaldatei neu ausgewählt. Neue Plain-Stapel erhalten
einen eindeutigen Speichervertrag und bleiben fortsetzbar; Ciphertext darf niemals
als Plain umgedeutet werden. Passwortgeschützte Eingangsdateien bleiben gemäß
DS-046 nicht unterstützt.

Diese Entscheidung ersetzt die Verschlüsselungsanteile von DS-050/DS-059, die
Verschlüsselung als vorgeschaltetes Arbeitspaket aus DS-061 sowie die
Schlüsselbund-Testpriorität aus DS-063/DS-064. Native Keyring-Smoke-Tests,
Engineering-Keyring-Session-Infrastruktur und deren Kombinationsmatrix sind
wegen Scopewechsel obsolet, nicht bestanden. Vorhandene historische Nachweise
bleiben dokumentiert; normale lokale Stapel-, Abbruch-/Fortsetzungs-, Paket- und
Cowork-Tests haben Vorrang.

## DS-066 – Lokale DataSecure-Grenze bei Cloud- und Local-Cowork (historisch; durch DS-078 ersetzt)

**Nicht mehr normativ:** Die in diesem Abschnitt beschriebene Desktop-Brücke für
lokale Plugin-MCPs in Cloud-Sitzungen wurde durch DS-078 vollständig ersetzt.
Aktuell gilt ausschließlich DS-078 samt Hostmatrix.

Bestätigt am 01.09.2026: Die belastbare Produktzusage lautet: **Originale werden
ausschließlich durch den lokalen DataSecure-Prozess verarbeitet; Claude erhält nur
freigegebene, de-identifizierte Ergebnisse.** Eine sichtbare Desktop-Oberfläche
und ein installiertes Plugin belegen noch keinen aktiven lokalen MCP.

Originale dürfen nur über die geöffnete Desktop-App oder in Claude Code über den
Betriebssystempicker eines tatsächlich verbundenen lokalen Plugin-MCPs angenommen
werden. Cowork darf die Sitzung in der Cloud ausführen; lokale Connectoren und
Plugin-MCPs werden dort über die aktive Desktop-Brücke erreicht, während der
DataSecure-Prozess und die Originalverarbeitung auf dem Rechner bleiben. Web,
Mobil, geplante Aufgaben ohne aktive Desktop-Brücke und der lokale Dateibroker
sind kein Ersatz. Chat-Upload, Computer Use, verbundene Ordner, allgemeine
Dateifreigabe und Remote-MCP sind ebenfalls kein Ersatz. Die DataSecure-Engine
bleibt netzwerkfrei.

ZIP/Marketplace bleiben Hauptprodukt. Das Quellplugin verwendet für Entwicklung
`command: node`; Produktarchive ersetzen ihn durch einen pluginrelativen Launcher
und enthalten die hashgebundene Zielruntime. Ein realer Windows-E0 ohne System-Node
ist belegt; native macOS- und Cowork-Fresh-Install-Läufe bleiben P0-Evidenz. Das
interne MCPB darf diesen Nachweis nicht ersetzen und wird Anwendern nicht angeboten.
Plattformkompatibilität ist keine
Freigabeevidenz: Windows, macOS und Linux werden erst nach realer Zielsystemabnahme
als freigegeben bezeichnet. Organisationsrichtlinien dürfen lokalen MCP,
Extensions oder dauerhafte Werkzeugfreigaben blockieren; DataSecure umgeht sie
nicht.

Diese Entscheidung präzisiert und ersetzt die Ausführungsortannahmen aus DS-003,
DS-041 und DS-052, nicht deren lokale Datenschutz- oder Plattformziele.

Am 04.09.2026 nochmals gegen die aktuellen Anthropic-Seiten revalidiert:
**„Cloud-Cowork“ und „lokaler DataSecure-MCP“ sind kein Widerspruch.** Cowork
läuft standardmäßig in der Cloud; der lokale MCP-Prozess läuft niemals dort,
sondern auf dem Anwenderrechner. Eine auf Desktop gestartete Cloud-Sitzung erreicht
ihn bei geöffneter Desktop-App über die Anthropic-vermittelte Desktop-Brücke.
Bestehende Desktop-Deployments können Cowork weiterhin lokal ausführen. Der
Produktkanon verwendet deshalb nicht mehr die missverständliche Kurzform
„lokale Cowork-Sitzung“ als Voraussetzung, sondern stets das überprüfbare Gate
„in Desktop gestartet, Desktop-Brücke aktiv, lokaler MCP und Picker erreichbar“.
Eine in Web oder Mobil gestartete Aufgabe und eine geplante Cloud-Aufgabe besitzen
diesen Originaleingang nicht; eine auf Desktop gestartete Aufgabe darf bei
weiterhin geöffneter Desktop-App lediglich von Web oder Mobil weiter begleitet
werden.

## DS-067 – Ein Produktweg, wahrheitsgemäße Aufbewahrung und fester Bildschutz

Bestätigt am 01.09.2026: Anwender installieren DataSecure ausschließlich als
Plugin-ZIP oder über den privaten Marketplace. Beide Kanäle liefern dasselbe
Produkt. Ein MCPB bleibt nur ein internes Engineering-Artefakt für Paket- und
Paritätsprüfungen und erscheint weder in der Anwenderanleitung noch als
Fehler-Fallback.

Es gibt keinen auswählbaren Grafik-Datenschutzmodus. Bildpixel bleiben im Pilot
immer lokal; unsichere Grafiken werden lokal zurückgehalten oder auf ausdrücklichen
Wunsch lokal entfernt. Eine sichtbare Einstellung darf keine nicht vorhandene
Abstufung versprechen.

Die konfigurierbare Aufbewahrung temporärer Arbeits- und Reviewdaten liegt zwischen
0 und höchstens 14 Tagen. Original-/Quelldateien und fertige Exportpakete werden
niemals automatisch gelöscht. Die Oberfläche, Runtime und Tests müssen denselben
Vertrag verwenden. Diese Entscheidung präzisiert DS-002, DS-014, DS-016, DS-038,
DS-055 und DS-066.

## DS-068 – Lokaler Sammelreview mit klarem automatischem Schnellpfad

Bestätigt am 01.09.2026: Der bestehende lokale Sammelreview bleibt der einzige
Produktweg für fachlich mehrdeutige Textstellen. Klare Dateien werden ohne
Reviewdialog automatisch lokal abgeschlossen. Ein Mischstapel wartet nicht mit
klaren Dateien auf unklare Dateien und legt im Review ausschließlich die wirklich
offenen Dokumente vor.

Aus PII-Shield werden die guten Interaktionsmuster übernommen, nicht dessen
Ausführungs- oder Datenarchitektur: farbliche Fundstellen, direkte Aktionen
„Zertifikatsanbieter behalten“/„Organisation anonymisieren“, sichtbarer
inhaltsfreier Fortschritt, Rückgängig, bewusstes Vertagen, Tastaturkürzel und eine
abschließende Freigabe. Rohtext bleibt im lokalen UI-Prozess; Claude, MCP-Antwort,
Journal und Diagnose erhalten nur inhaltsfreie Zähler. Eine Cloud-/MCP-App mit
Rohdaten, reversible Mappings, Laufzeitdownloads und stilles automatisches Raten
werden nicht übernommen.

Freie Bereichsredaktionen bleiben im Sammelreview bis zu einer nachweislich
positionssicheren Dokumentabbildung gesperrt. Die vollständigen Kriterien stehen
in `contracts/BATCH_REVIEW_V2.md`. Diese Entscheidung präzisiert DS-014, DS-027,
DS-028, DS-032, DS-040 und DS-043.

## DS-069 – Einmaliger Cowork-Ergebnisordner ohne Bestätigungsorgie

Bestätigt am 02.09.2026: Beim ersten lokalen Anonymisierungslauf wählt der Anwender
einmalig den bereits mit Cowork verbundenen Arbeitsordner als sichtbares
Ergebnisziel. DataSecure speichert diese Wahl ausschließlich lokal und legt darin
`DataSecure-Output` an. Danach benötigt jeder reine Anonymisierungslauf nur noch
die lokale Datei- beziehungsweise Ordnerauswahl; es gibt keine zusätzliche Start-,
Bild-, Export- oder Einzeldateibestätigung. Der Zielordner kann später über eine
ausdrücklich aufgerufene Plugin-Funktion geändert oder zurückgesetzt werden.

In `DataSecure-Output` gelangen ausschließlich erneut verifizierte, freigegebene
Markdown-Dateien mit neutralen Namen. Originale, Quellpfade, Mapping, Audit,
Review-, Arbeits- und Wiederaufnahmedaten bleiben im privaten DataSecure-Bereich.
Ein fehlgeschlagener sichtbarer Export vernichtet kein internes Ergebnis; ein
lokaler, dauerhafter Exportauftrag wird nach dem nächsten Start in einem
zeitbegrenzten Hintergrundworker oder beim Ordnerwechsel erneut ausgeführt; er
blockiert den MCP-Start nicht. Der Abschlussdialog nennt nur Zähler und bietet
„Ergebnisse öffnen“.

Die Übernahme dieses Abschlussdialogs ist zweiphasig: Eine kurzlebige Reservierung
verhindert Doppeldialoge; dauerhaft als präsentiert gilt sie erst nach bestätigtem
Start des lokalen Presenters. Scheitert der Start, darf der Worker die Anzeige
übernehmen. Das verändert weder Exportdaten noch Freigabestatus.

Der MCP erhält den gewählten Pfad nicht. Eine automatisch sichere Erkennung des
verbundenen Cowork-Ordners ist kein belastbarer Hostvertrag; deshalb wird der Pfad
nicht geraten. Ein Cloud-Sync-Ziel ist zulässig, kann die bereits freigegebenen,
aber nicht garantiert rechtlich anonymen Ergebnisse zum jeweiligen Dienst
synchronisieren und wird deshalb als bewusste Nutzerwahl dokumentiert. Diese
Entscheidung präzisiert DS-008, DS-023, DS-040, DS-041, DS-051, DS-058 und DS-064.

## DS-070 – Dateiidentität ohne Änderungszeit des Dateisystems

Bestätigt am 03.09.2026 nach Datenschutz- und Runtime-Review: Jede
Identitätsbindung regulärer Dateien und Ordner in DataSecure – Quellen vor und
während der lokalen Übernahme, private Arbeitskopien, Journale, Nachweise,
Zuordnungs- und Exportdateien – verwendet Gerät, Inode, Größe und
Modifikationszeit (mtime). Der Inhalt einer übernommenen Quelle ist zusätzlich
und verpflichtend über den SHA-256 des Preflights an die Arbeitskopie gebunden;
eine Kopie ohne diesen Hash wird nicht angelegt.

Die Änderungszeit des Dateisystems (ctime beziehungsweise NTFS ChangeTime) ist
ausdrücklich kein Identitätsmerkmal. Virenscanner, Indexer und
Attributschreibvorgänge verändern sie ohne ein einziges Byte des Inhalts; auf
Windows 11 führte das zu grundlosen, wenn auch sicheren Stopps („Datei während
der Übernahme verändert“) und zu abgebrochenen Testketten. Ein Inhaltsaustausch
bei gleicher Größe und zurückgesetzter Modifikationszeit wird weiterhin durch den
Hash gestoppt; Größen-, Zeit-, Inode- oder Gerätewechsel stoppen weiterhin über
die Identität. Ausgenommen bleiben die Selbstprüfungen der gebündelten
Programmdateien (SEA-Rolle, Statusanzeige), die über Prüfsummen abgesichert sind.
Diese Entscheidung präzisiert DS-020 und DS-044.

## DS-071 – Laufkennung und verweigerter Start bleiben inhaltsfrei nachvollziehbar

Bestätigt am 03.09.2026 nach dem Nachvollziehbarkeits-Review: Jedes Ereignis der
inhaltsfreien Ablaufspur trägt eine Laufkennung `run_id` von acht Hexzeichen. Sie
wird vom Elternprozess beim Start eines Laufs zufällig erzeugt, dem getrennten
Worker über seine Umgebung mitgegeben und ist aus nichts abgeleitet: weder aus
Batch-Token, Pfad, Dokument-Hash noch Prozesskennung. Sie erlaubt der IT nur, die
Ereignisse eines Laufs aus Elternprozess und Worker zusammenzuführen, und
verletzt damit DS-026 nicht, das Freitext, Pfade, Namen, Inhalte, Tokens, PIDs und
Dokument-Hashes aus dem Schema ausschließt.

Die Laufkennung gehört ausschließlich zur lokalen Supportdiagnose. Sie erscheint
nicht im normalen Cowork-Ablauf, in den Skills, in Ergebnisdateien oder im
Mapping. Nur ein ausdrücklich aufgerufenes Supportwerkzeug `diagnostic_status`
darf sie in einer inhaltsfreien MCP-Diagnose anzeigen; der ebenfalls
ausdrücklich bestätigte lokale Diagnoseexport darf denselben Status enthalten.
Beide Flächen dienen der technischen Zuordnung eines Fehlers und ändern die
Anonymisierung nicht. Diese begrenzte Sichtbarkeit ist beabsichtigt und keine
allgemeine Freigabe von Laufkennungen.

Verweigert der Dienst den Start fail-closed, hinterlässt er statt eines rohen
Stacktrace mit Pfaden ein Ereignis `startup_refused` mit festem Code in der
Ablaufspur, eine Markerdatei `startup-refused.json` mit Zeitpunkt, Version und
Code sowie genau eine pfadfreie Zeile auf dem Fehlerkanal. Im gebündelten Paket
wird die laufende Programmdatei beim Start gegen `RUNTIME-EVIDENCE.json`
geprüft; eine Abweichung stoppt mit `RUNTIME_INTEGRITY_FAILED`. Diese Prüfung
erkennt Beschädigung und Austausch nach dem Build, ersetzt aber nicht die
Prüfsumme des Pakets vor der Installation. Diese Entscheidung präzisiert DS-026
und DS-048.

## DS-072 – Hintergrundlaufzeit überlebt den kurzlebigen Cowork-Pluginordner

Bestätigt am 04.09.2026 nach dem ersten Windows-Cowork-Lauf mit RC95: Die
erfolgreiche IPC-Übergabe an den Intake-Worker beweist noch keinen abgeschlossenen
Stapel. Cowork darf seinen temporären Pluginordner nach Ende des MCP-Aufrufs
entfernen. Ein bereits gestarteter Worker muss Parser, Review und Abschluss daher
aus einer dauerhaften lokalen Laufzeitprojektion starten können.

Das selbsttragende Plugin kopiert beim MCP-Start ausschließlich die geprüfte
Programmlaufzeit und den Produktcode in einen versions- und fingerprintgebundenen
Unterordner von `SecureDataMsg/runtime-cache`. Dokumente, Dateinamen, Quellpfade,
Mappings, Journale, Review- und Ergebnisdaten gehören ausdrücklich nicht in
diesen Cache. Ist die Projektion unvollständig oder verändert, stoppt der Server
mit `DURABLE_RUNTIME_FAILED`. Erst danach dürfen Intake-, Review-, Companion- und
Parserprozesse daraus gestartet werden. Ein Regressionstest entfernt den
ursprünglichen Pluginordner vor dem Workerstart vollständig.

Der DataSecure-Core darf zusätzlich durch ein eigenständiges zweites
Endnutzerprodukt verwendet werden. DataSecure Standalone besitzt eine eigene
Desktop-Oberfläche, Distribution und getrennte Produktdaten, benötigt weder
Claude noch Cowork, MCP, Agenten oder Internet und bietet keine optionale
Claude-Übergabe an. Nur die geprüfte Anonymisierungsengine bleibt gemeinsam.
Diese Entscheidung präzisiert DS-003, DS-040, DS-041, DS-048, DS-067 und
DS-069.

## DS-073 – Cowork-Temporärpfade sind kein Produktdatenspeicher

Bestätigt am 04.09.2026 durch den zweiten Windows-Cowork-UAT: Cowork kann dem
lokalen Plugin eine `LOCALAPPDATA`-Adresse innerhalb einer kurzlebigen
`Temp/claude`-Projektion geben. Dieser Pfad verschwindet zusammen mit dem
Toolaufruf. Er darf deshalb weder Ergebnisordnerkonfiguration, Journale und
Reviewdaten noch die dauerhafte Programmlaufzeit aus DS-072 aufnehmen.

Nur wenn `LOCALAPPDATA` eindeutig als Claude-Temporärprojektion erkannt wird,
verwendet DataSecure unter Windows stattdessen das bereits vorhandene reguläre
`AppData/Local` des Benutzerprofils. Ein normaler oder bewusst umgezogener
`LOCALAPPDATA`-Pfad bleibt unverändert. Ist das reguläre Ziel kein bestehendes,
reguläres Verzeichnis oder ist es ein Link, wird die Hostadresse nicht
umgeschrieben. Der Pakettest startet die echte selbsttragende Runtime mit einer
synthetischen Claude-Temporäradresse und verlangt den Cache im stabilen
Testprofil. Diese Entscheidung präzisiert DS-008, DS-026 und DS-072.

## DS-074 – Debug ist eine manuelle, inhaltsfreie Projektion derselben Engine

Bestätigt am 04.09.2026 nach UML-, Datenschutz-, Betriebs- und
Performanceprüfung: Der normale Produktbuild bleibt frei von zusätzlicher
Supportinteraktion. Für gezielte Fehleranalysen darf ein separat gebautes und
sichtbar als **Debug** gekennzeichnetes Plugin-ZIP installiert werden. Es ergänzt
genau einen nur manuell aufrufbaren Debug-Skill und aktiviert den bestehenden
lokalen Supportmodus. Es dupliziert weder Anonymisierungsregeln noch Worker,
Review, Speicher- oder Freigabelogik.

Die Debugspur protokolliert nicht die Kommunikation selbst, sondern nur eine
geschlossene, inhaltsfreie JSON-Projektion ihrer technischen Grenzen. Rohes
JSON-RPC, Argumente, Ergebnisse, Inhalte, Namen, Pfade, Hashes, Tokens,
Capabilities und freie Meldungen sind nicht darstellbar. Jeder Prozess schreibt
unveränderliche Einzelereignisse, damit Eltern-, Intake- und Reviewprozess keine
Zeilen gegenseitig überschreiben. Fehler der Diagnose sind wirkungslos für jede
Datenschutzentscheidung. Nach dem Supportfall wird wieder das normale Paket
installiert. Diese Entscheidung präzisiert DS-026, DS-048 und DS-071.

## DS-075 – Standalone ist ein zweites Produkt mit gemeinsamem Core

Bestätigt am 04.09.2026 nach Produkt-, UX-, Architektur-, Security-,
Performance- und Betriebsreview: DataSecure Standalone ist ein eigenständiges,
vollständig lokales Endnutzerprodukt ohne Claude, Cowork, Skills, MCP, Agenten,
Chat oder Internet. Seine Desktop-UI und optionale Support-CLI rufen eine
neutrale DataSecure-Application-API direkt auf; ein MCP-/JSON-RPC-Umweg ist
unzulässig. Das Claude-Plugin bleibt ein getrenntes Produkt und lediglich ein
zweiter Adapter auf denselben Core. Eine zweite Erkennungs- oder
Freigabelogik ist unzulässig.

Standalone und Plugin besitzen getrennte Daten-, Konfigurations-, Journal-,
Review- und Exportnamespaces sowie getrennte Pakete, SBOMs, Update-, Rollback-
und Deinstallationsverträge. Standalone-Stapel dürfen niemals Claude-Handoff-
Kandidaten werden. Beide Produkte müssen denselben Core-/Policy-Fingerprint
und Golden-Korpus bestehen. Gemeinsam bleiben nur Admission, Snapshot,
Parser/Konverter, Content-Graph, PII-/Residual-Gates, Sammelreview,
Journal/Fortsetzung, Mapping, Export und neutrale Diagnose.

Microsoft MarkItDown 0.1.7 darf als gebündelte Offline-Komponente zur
Formatkonvertierung aufgenommen werden, ist aber weder Sicherheitsgate noch
Anonymisierer. Der Konverter erhält nur bereits zugelassene, versiegelte
Snapshot-Bytes in einem isolierten, ressourcenbegrenzten Worker. Er darf keine
Pfade oder URLs öffnen, kein Netzwerk, keine Plugins, keine LLM-Clients und
insbesondere nicht `markitdown-ocr` verwenden. Noch personenbezogenes Markdown
bleibt ausschließlich im privaten Prozess-/Speicherpfad und wird nicht als
sichtbare Zwischenablage persistiert. Nur das nach DataSecure-Prüfung
freigegebene anonymisierte Markdown wird exportiert.

Jedes neue Format benötigt weiterhin einen eigenen DataSecure-Coverage-,
Angriffs-, Offline-, Paket- und Zielsystemnachweis. Die erste Integration ist
ein deaktiviertes DOCX-Differentialorakel; sie verändert den aktuell
freigegebenen Formatumfang nicht. „Ohne KI“ wird belastbar als „ohne Claude,
Agenten, generative KI oder externe KI-Dienste“ kommuniziert; spätere lokale
OCR ist eine separat freizugebende Extraktionskomponente. Diese Entscheidung
präzisiert DS-007, DS-018, DS-024, DS-038, DS-049, DS-060 und DS-072.

## DS-076 – Tauri-2-Spike und vier eigenständige Desktopziele

Bestätigt am 04.09.2026 nach UX-, Desktop-, Packaging-, Security- und
Performancegegencheck: Für die Standalone-Desktop-Hülle ist Tauri 2 der
verbindliche Engineering-Kandidat. Die Auswahl beruht auf nativen
Dateidialogen, der Betriebssystem-WebView, einer kleinen Rust-Hülle und der
Möglichkeit, den vorhandenen DataSecure-Core als zielgebundenes Sidecar
mitzuliefern. Eine Produktfreigabe folgt daraus noch nicht; der Spike muss die
definierten Start-, Größen-, Barrierefreiheits-, Offline-, Abbruch- und
Rollbackwerte auf echten Zielsystemen erfüllen.

Es entstehen vier selbsttragende Artefakte: Windows x64, macOS x64, macOS
ARM64 und Linux x64 glibc. Ein Universal-macOS-Binary ist für die erste
Lieferung nicht erforderlich. Kein Paket setzt vom Anwender installiertes
Node, Python, Rust oder Claude voraus. Der Renderer erhält weder Rohbytes noch
Quellpfade, Mapping, private Verzeichnisse oder direkten Dateisystemzugriff.
Nur die Rust-Hülle öffnet den nativen Picker und übergibt die Auswahl intern an
den Core. UI und Core kommunizieren lokal über begrenzte, gerahmte Nachrichten
auf geerbten Prozesskanälen; ein lokaler HTTP-/WebSocket-Port ist unzulässig.

Developer-ID-Signierung und Apple-Notarisierung bleiben nach DS-030 keine
technische Freigabepflicht. Zertifikatsfreie interne macOS-Piloten werden jedoch
mit Tauri ausdrücklich ad-hoc signiert (`signingIdentity: "-"`). Sie müssen
ehrlich auf die zu erwartende Gatekeeper-Handhabung hinweisen und diese im macOS-UAT prüfen; es
darf nicht als reibungslose öffentliche Installation beworben werden. Diese
Entscheidung präzisiert DS-004, DS-028, DS-030 und DS-075.

## DS-077 – Windows-Standalone-Pilot, WebView2 und Evidencegrenze

Bestätigt am 04.09.2026 nach zweitem Architektur-, UX-, Packaging- und
Supply-Chain-Gegencheck: Der Windows-x64-Standalone-Vertikalschnitt wird als
**Engineering-Pilot** selbsttragend paketiert. Er enthält die Tauri-Hülle, eine
gepinnt und herkunftsgeprüft gebündelte Node-Runtime, die beim Paketbau frisch
aus dem aktuellen Quellstand erzeugte geschlossene Coreprojektion, Manifest,
Runtime-Evidence, SBOM, Lizenzhinweise und Prüfsummen. Anwender installieren
weder Node, Rust noch Python. Automatische Paketprüfung und isolierter
Sidecar-Smoke sind E0-Evidence, aber keine Endnutzerfreigabe.

Für die kleine Windows-Auslieferung wird das von Windows beziehungsweise der
Organisation bereitgestellte Microsoft Edge WebView2-Systemruntime vorausgesetzt.
DataSecure lädt es weder nach noch bündelt es einen Fixed-Version-WebView2-
Baum. Fehlt es, muss Installation beziehungsweise UAT verständlich stoppen.
Diese bewusste Betriebssystemvoraussetzung ist nicht mit einer zusätzlichen
Entwickler-Toolchain gleichzusetzen.

Vor Endnutzerfreigabe bleiben Windows-UAT, native macOS-Intel-/ARM-Pakete und
UAT sowie die komponentenweise Lizenzklärung der ausgelieferten Rust-Crates
Pflicht. Das Engineering-SBOM darf unbekannte Crate-Lizenzen als `NOASSERTION`
inventarisieren, aber keine abgeschlossene Lizenzprüfung behaupten. Drag-and-
drop und Pausieren bleiben Zielumfang, bis ein echter Befehl, Recoveryvertrag
und UI-/Negativtests existieren. Diese Entscheidung präzisiert DS-004, DS-075
und DS-076.

## DS-078 – Lokale MCPs nur in lokaler Cowork-Sitzung

Bestätigt am 04.09.2026 nach erneuter Prüfung der aktuellen offiziellen
Cowork-Architekturdokumentation: Originale dürfen im Claude-Produkt nur in
einer **lokalen Cowork-Sitzung eines bestehenden Desktop-Deployments** oder in
lokal ausgeführtem Claude Code verarbeitet werden, wenn der lokale
DataSecure-Plugin-MCP tatsächlich läuft und sein Betriebssystempicker
erreichbar ist.

Eine Cowork-Sitzung in der Cloud darf zwar verbundene lokale Dateien und den
Browser über die geöffnete Desktop-App erreichen; diese Dateien werden dabei
jedoch auf Anthropic-Infrastruktur verarbeitet. Lokale MCP-Server laufen laut
Hersteller ausdrücklich nicht in Cloud-Sitzungen. Deshalb sind Cloud-Cowork,
Web, Mobil und geplante Cloud-Aufgaben für DataSecure-Originale NO-GO – auch
bei geöffneter Desktop-App. Sie dürfen ausschließlich bereits lokal
freigegebenes, de-identifiziertes Markdown verwenden.

Der Skill darf weder eine Desktop-Brücke als MCP-Brücke ausgeben noch einen
Cloud-Start als lokale Vorverarbeitung bestätigen. Wenn der Host keine lokale
Cowork-Sitzung mit verbundenem Plugin-MCP belegt, stoppt der Originalweg früh
und verweist auf eine lokale Sitzung beziehungsweise auf DataSecure
Standalone. Diese Entscheidung ersetzt DS-066 und präzisiert DS-002, DS-041,
DS-051, DS-067 und die Hostmatrix.

## DS-079 – Sichtbare Ergebnisse erst nach Abschluss des gesamten Stapels

Bestätigt am 04.09.2026 nach Produkt-, UX-, Architektur- und Sicherheitsreview:
Klare Dateien dürfen in einem Mischstapel intern bereits verarbeitet und als
einzelne Positionen dauerhaft abgeschlossen sein. Der sichtbare Laufordner wird
jedoch erst bereitgestellt, wenn alle Dateien des Stapels terminal sind und ein
erforderlicher lokaler Sammelreview abgeschlossen wurde.

Damit sieht der Anwender genau einen vollständigen, zusammengehörigen Lauf statt
eines scheinbar fertigen Teilbestands. Abbruch und Vertagung verlieren keine
interne Arbeit; nach Fortsetzung wird nur der noch offene Rest bearbeitet. Vor
dem terminalen Abschluss melden Cowork und Standalone keine sichtbaren Ergebnisse
und bieten den Laufordner nicht zum Öffnen an. Diese Entscheidung präzisiert
DS-023, DS-043, DS-068 und DS-069.

## DS-080 – Ein expliziter Ergebnisordner statt Workspace-Erkennung

Bestätigt am 04.09.2026 nach Produkt-, Cowork-, UX-, Architektur- und
Sicherheitsgegencheck: Cowork stellt dem lokalen Plugin-MCP keinen belastbaren
aktuellen Projekt- oder Workspacepfad bereit. DataSecure errät ihn deshalb nicht
und wechselt das Ausgabeziel bei einem Cowork-Projektwechsel niemals unbemerkt.

Cowork-Plugin und Standalone speichern auf dem jeweiligen Gerät genau einen vom
Anwender ausdrücklich gewählten lokalen Ergebnisstamm. Beim Cowork-Plugin kann
der dedizierte Ergebnisordner zusätzlich mit Cowork verbunden werden, damit Claude
freigegebene Ergebnisse anschließend verwenden kann. DataSecure erhält jedoch
keine Liste verbundener Cowork-Ordner und kann die Trennung vom Quellordner nicht
selbst attestieren; sie bleibt Setup- und UAT-Voraussetzung. DataSecure legt
darunter ausschließlich `DataSecure-Output` an. Originale, Mapping, Review-,
Diagnose- und Recoverydaten bleiben außerhalb.

Nach erfolgreicher Erstwahl gibt es keine erneute Ergebnisfrage pro Datei,
Stapel oder Cowork-Projekt. Der Anwender kann das Ziel jederzeit über die
ausdrückliche Einstellung „Ergebnisordner ändern“ wechseln, sofern kein Stapel
offen ist. Ein Wechsel wirkt nur für künftige sichtbare Exporte und spiegelt
keine abgeschlossenen Läufe. Diese Entscheidung präzisiert DS-023, DS-069 und
DS-079 und schließt die projektbezogene Zielbindung bewusst ohne zusätzliche
Bestätigungsorgie.

## DS-081 – MCP-Version aushandeln statt künstlichen Cutover erzwingen

Bestätigt am 05.09.2026 nach Abgleich mit der offiziellen MCP-Veröffentlichung
und dem aktuellen TypeScript-SDK-Migrationspfad: `MCP26-01` ist kein offizieller
MCP-Protokollbezeichner und darf weder als Zielversion noch als
Migrationsanforderung in Produkt, Backlog oder Freigabeaussagen verwendet werden.
Die maßgebliche moderne Protokollversion ist derzeit `2026-07-28`.

Das Cowork-Plugin behält die bereits implementierte, hostgesteuerte
Versionsaushandlung: `server/discover` bietet `2026-07-28` an; nachgewiesene
ältere Claude-Hosts bleiben über den Legacy-`initialize`-Pfad kompatibel. Der
Anwender wählt keine Protokollversion und erhält dafür weder eine Einstellung
noch einen zusätzlichen Dialog. Legacy-Unterstützung wird erst entfernt, wenn
die freigegebene Claude-Hostmatrix sie nicht mehr benötigt und die Änderung mit
realer Zielhostevidenz belegt ist.

DataSecure behauptet keine vollständige Konformität zu `2026-07-28`, bevor die
offizielle MCP-Conformance-Prüfung für den tatsächlich ausgelieferten
Pluginserver bestanden und dokumentiert wurde. Neue versionsgebundene
Funktionen wie MCP-Tasks oder Benachrichtigungen bleiben bis zu ihrem eigenen
Nachweis außerhalb des Produktpfads. Die lineare Validierung interner
DataSecure-Graphen ist eine unabhängige Performance-/Robustheitseigenschaft und
kein Anlass für einen MCP-Versionswechsel. Das Standalone-Produkt bleibt von
MCP vollständig unabhängig.

Offizielle Entscheidungsbasis:

- [MCP-Version 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [Migrationshinweise des offiziellen TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)

## DS-082 – Lokale Auswahl sichtbar, reine Konvertate strikt getrennt

Bestätigt am 05.09.2026 nach dem ersten Windows-Standalone-UAT: Die
Standalone-Oberfläche zeigt den vom Anwender selbst gewählten Quellenordner,
die aktuelle Dateiauswahl und den Ergebnisordner im Hauptfenster an. Diese
Anzeige ist ausschließlich eine lokale, als Text gerenderte Projektion über
den privaten geerbten IPC-Kanal. Sie darf nie in Supportspur, Diagnoseexport,
Cowork, Mapping oder Fehlertext übernommen werden. Der Renderer behält weder
direkten Dateisystem- noch Netzwerkzugriff.

Die Standardaktion bleibt **In Markdown umwandeln und anonymisieren** mit einem
expliziten Startknopf. **Nur in Markdown umwandeln** ist eine eigene fachliche
Betriebsart: Ihre Ausgaben enthalten weiterhin personenbezogene Rohdaten und
dürfen weder im `DataSecure-Output`, noch mit `anonymisiert` im Dateinamen oder
als Claude-sicheres Ergebnis erscheinen. Sie bleibt im Piloten sichtbar als
nicht freigegebene Option, bis ein eigener gekennzeichneter Exportbereich,
Quellenidentitätsprüfung, Abbruch/Fortsetzung, Mapping und Negativtests
implementiert sind. Diese Entscheidung präzisiert DS-075 bis DS-077.

## DS-083 – Laufbezogene Zuordnung nur im Standalone-Ergebnis

Bestätigt am 05.09.2026 nach Windows-Standalone-UAT und Produktgrenzen-
Gegencheck: Ein Standalone-Lauf gilt erst dann als sichtbar vollständig, wenn
neben allen neutral benannten anonymisierten Markdown-Dateien auch eine
`DataSecure-Zuordnung.csv` für genau diesen Lauf atomar veröffentlicht wurde.
Sie enthält ausschließlich die lokale Quellbezeichnung und den neutralen
Ergebnisnamen; für gestoppte Positionen steht in derselben Ergebnisspalte
„Kein Ergebnis – gestoppt (FEHLERCODE)“. Auch ein vollständig gestoppter
Standalone-Lauf erhält eine eigene Übersicht, niemals die eines Vorgängers.
Ein Fehler beim Schreiben dieser Übersicht ist eine ausstehende
Abschlussveröffentlichung und ändert keine Dokumentzähler. Bereits
veröffentlichte Altzuordnungen bleiben unverändert. Tabellenformeln werden
neutralisiert. Der Knopf
**„Zuordnungsdatei anzeigen“** markiert genau diese Datei im letzten sichtbaren
Laufordner. Die dauerhafte globale `DataSecure-Mapping.csv` bleibt weiterhin im
privaten Produktdatenbereich für Recovery und Nachvollziehbarkeit.

Diese Komfortprojektion gilt ausdrücklich nicht für das Cowork-Plugin. Ein mit
Cowork verbundener Ergebnisordner enthält weiterhin ausschließlich neutral
benannte anonymisierte Ergebnisse, damit Originalnamen nicht automatisch in
die Modellgrenze geraten. Alte Exportrecords ohne Produktkanal werden nur
zusammen mit ihrem eigenen privaten Stapeljournal migriert; ein generischer
Startup-Replay darf den Produktkanal nicht erraten. Diese Entscheidung
präzisiert DS-023, DS-069, DS-079 und DS-080.

## DS-084 – Lesbare Stapelkennungen und native Aufnahme in Standalone

Bestätigt am 05.09.2026: Neue Standalone-Stapel verwenden lesbare Kennungen wie
`[PERSON_001]`, `[UNTERNEHMEN_001]` und `[PROJEKT_001]`. Arbeitgeber, Kunde und
allgemeine Organisation sind Rollen derselben Unternehmensidentität, keine
getrennten Nummernräume. Die rohwertfreien Aliasbindungen und reservierten
Nummern werden vor Veröffentlichung dauerhaft gespeichert und bei Fortsetzung
unverändert übernommen. Nummern sind nur innerhalb dieses Stapels aussagekräftig.
Gleiche Schreibweise ist kein Beweis realer Identität; Namensvarianten und
mehrdeutige Nachnamen dürfen nicht als vollautomatische Personenauflösung
verkauft werden. Bereits bestehende v1-Stapel und das Cowork-Plugin behalten
ihren vereinbarten HMAC-Platzhaltervertrag; keine nachträgliche Umnummerierung.

Ein Kurzverweis, der zu mehreren vollständigen Firmennamen mit verschiedenen
Rechtsformen passt, wird keiner dieser Firmen zugeschlagen. Neue Standalone-
Stapel verwenden dafür eine stabile `[UNTERNEHMEN_UNKLAR_…]`-Kennung; im
Plugin-/v1-Vertrag bleibt der Verweis neutral als `[ORGANISATION_UNKLAR]`.
Ausdrückliche Personenfelder, auch in Markdown-Listen und Zitaten, bleiben
positionsgebunden Personen. Bereits veröffentlichte Dokumente werden nicht
nachträglich umgeschrieben, wenn später ein zusätzlicher Namenskonflikt entsteht.

Dateien oder ein Ordner können nativ in Standalone hineingezogen werden. Drop
nutzt dieselbe Core-Aufnahme wie die Picker, zeigt zunächst die lokale Auswahl
und startet keine Verarbeitung. Die Auswahlbuttons bleiben gleichwertige
Klick- und Tastaturalternativen. Der Core erhält die Auswahl über den nativen
Host; der eigene Aufnahmeevent liefert dem Renderer die lokale Textprojektion,
keine zusätzliche rohe Pfadliste und keine Dateisystemrechte. Tauri kann daneben
native Framework-Dropevents mit lokalen Pfaden erzeugen; DataSecure abonniert
sie im Renderer nicht. Es gibt keinen entsprechenden Dragdrop-Eingang
für rohe Chat-Anhänge im Claude-Produkt.

Entscheidungsbasis: [Tauri DragDropEvent](https://docs.rs/tauri/latest/tauri/enum.DragDropEvent.html)
und [W3C: Alternativen zu Ziehbewegungen](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

## DS-085 – Reine Markdown-Konvertierung ist eine zweite Kernfunktion

Am 05.09.2026 erneut ausdrücklich bestätigt: Standalone soll neben Anonymisierung
einen vollständigen **Nur in Markdown umwandeln**-Workflow anbieten. Er bereitet
Dokumentinhalte für eine spätere KI-Nutzung auf, ohne Anonymisierung, Pseudonyme,
PII-Entfernung, Agenten oder KI-Aufrufe. Dies ist verbindlicher Produktumfang,
kein verzichtbarer Prototyp. DS-082 wird präzisiert, nicht zurückgenommen.

Gemeinsam bleiben Dateiauswahl/Dragdrop, Zielwahl, expliziter Start, ein aktiver
Stapel, Größenlimits, Quellenidentität, Offline-Parser, Coverage, Fortschritt,
Abbruch/Fortsetzung, Zuordnung und Ergebnisöffnung. Der Modus wird mit dem Stapel
dauerhaft gebunden und bei Recovery niemals neu aus einem UI-Default abgeleitet.
Die Umwandlung erhält Namen, Unternehmen, Kontakt-/Bankdaten und fachlichen Text.
Nur der PII-/Residual-/Anonymisierungsreview entfällt; gefährliche aktive Inhalte,
unsichere Container und verschlüsselte Quellen werden weiterhin nicht ausgeführt
oder entschlüsselt. Extraktionslücken werden konkret als solche gemeldet, niemals
als vollständige Konvertierung kaschiert.

Zielartefakte sind eine `.md` pro Quelle und eine lokale Zuordnungsdatei in
`DataSecure-Markdown/Lauf-…`, klar **nicht anonymisiert**. Ein Moduswechsel darf
weder bestehende Ergebnisse überschreiben noch Konvertate in `DataSecure-Output`
oder die Plugin-Handoff-Liste bringen. Es gibt keine automatische KI-Übertragung
und keinen neuen Bestätigungsdialog je Datei. TXT, Markdown, CSV, DOCX, XLSX,
PPTX, PDF, Scan-PDF und Bilder bleiben Zielumfang; jeder Konverter braucht seinen
nachgewiesenen Extraktionsumfang. Layoutidentische Rekonstruktion ist kein Ziel.

Präzisierung 06.09.2026: Der Anwender wünscht eine einfache Konvertierung ohne
PII-Review. Lesbare Extraktionen mit OCR-/Coverage-Hinweisen werden deshalb
gespeichert und in der Abschlussübersicht gekennzeichnet; ein weiterer
Freigabedialog ist nicht erforderlich. Fehlerhafte/geschützte Eingaben bleiben
unverändert und erhalten eine Fehlerposition. Es gibt keine Vollständigkeits-
oder Anonymitätszusage. Der Modus ist im Quellstand über v5-Journal, eigene
Worker-Nachrichten, `dm_`-Artefakte und v3-Export verbunden (BL-010.28 mit
BL-010.15–19). Paketnachweise und menschliche Zielhostabnahme bleiben gesondert.

Herstellerabgleich am 05.09.2026: [Microsoft MarkItDown](https://github.com/microsoft/markitdown)
zielt auf Inhalt/Struktur für Textanalyse, nicht originalgetreue Layoutkonvertierung.
Die dort angebotenen Cloud- und LLM-Erweiterungen sind keine Bestandteile unseres
lokalen Konvertierungsvertrags; insbesondere ersetzt `markitdown-ocr` mit
LLM-Vision keine unabhängig belegte lokale OCR.
