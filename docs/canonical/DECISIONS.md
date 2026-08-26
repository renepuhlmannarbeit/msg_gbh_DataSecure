# Verbindliches Entscheidungsregister

Stand: 23.08.2026 · Status aller folgenden Entscheidungen: **angenommen**

Diese Entscheidungen stammen aus dem abgeschlossenen Produkt-Grill. Sie beschreiben
das Zielprodukt, nicht den Funktionsumfang von RC30.

## DS-001 – Produktzweck und Aussagegrenze

DataSecure bereitet sensible Dateien lokal vor der KI-Verarbeitung auf. Es entfernt
erkannte Identifikatoren und liefert datenschutzreduzierte beziehungsweise
pseudonymisierte Inhalte. Es behauptet weder rechtssichere Anonymität noch eine
DSGVO-, AI-Act- oder sonstige Zertifizierung.

## DS-002 – Primäres Produkt und Verteilungswege

Das Claude-Plugin ist das Hauptprodukt. Direkter ZIP-Import und privater
Organisations-Marketplace sind gleichwertig unterstützte Verteilungswege. Das MCPB
bleibt technischer Fallback und Engineering-Artefakt.

## DS-003 – Unterstützte Claude-Oberflächen

Lokale Originalverarbeitung ist nur in Claude Desktop oder Claude Code zulässig,
wenn `privacy_status` in der konkreten Unterhaltung erfolgreich verfügbar ist.
Cowork Desktop ist damit versionsabhängig möglich. Die Claude-Desktop-App wird nach
aktueller Herstellerdokumentation auf Windows und macOS angeboten; Linux ist nur als
lokaler Claude-Code-Host-Zielpfad vorgesehen und braucht eine eigene Abnahme. Web,
Mobil und Remote-Sitzungen dürfen nur bereits bereinigte Ergebnisse verwenden oder
den Schutz erklären.

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

## DS-013 – Ein gebündelter Abschlussdialog

Der Stapel wird ohne Zwischenfragen vollständig abgearbeitet. Mehrdeutigkeiten und
fachlich nicht vollständig übertragbare Bereiche erscheinen danach in genau einem
lokalen Dialog. Entscheidungen gelten fundstellenbezogen; gleichartige Stellen im
aktuellen Stapel können bewusst gemeinsam behandelt werden.

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

## DS-053 – Selbsttragende Distribution und Signierung

Anwender installieren weder Node.js noch Python. Marketplace und manuelle
Windows-x64-/macOS-universal-ZIPs enthalten alle Laufzeiten; MCPB ist nur Fallback.
Piloten dürfen unsigniert sein, eigene native Sicherheitskomponenten müssen vor
breitem Unternehmenseinsatz signiert sein. Diese Entscheidung ersetzt DS-030.

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
