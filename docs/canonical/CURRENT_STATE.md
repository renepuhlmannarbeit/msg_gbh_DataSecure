# Aktueller Iststand

Stand: 08.09.2026 · 3.2.0-rc125 · unabhängige Produkt- und Cowork-Revalidierung

## Aktueller Entwicklungsstand RC125 – unabhängige Revalidierung

Der vollständige RC124-Stand wurde erneut gegen die am 08.09.2026 abrufbare
offizielle Anthropic-Dokumentation, beide Produktprojektionen, Runtime-, Prompt-,
IPC-, Paket-, Recovery- und Dokumentationsverträge geprüft. Die zentrale
Produktgrenze bleibt korrekt: Originale dürfen nur über den DataSecure-
Betriebssystempicker in einer nachweislich lokalen Claude-Desktop-/Cowork-Sitzung
mit laufendem Plugin-MCP eingehen. Cloud-Cowork läuft inzwischen standardmäßig
auf Anthropic-Infrastruktur; eine geöffnete Desktop-App macht daraus keine lokale
Sitzung. Standalone bleibt davon vollständig unabhängig.

Zwei technische Reviewbefunde sind geschlossen. Der Cowork-Prompt erzeugt die
aktuelle Sechs-Format-Regel nun direkt aus einem benannten Vertragsbaustein und
enthält keinen still ersetzten historischen Vier-Format-Satz mehr. Außerdem
prüft der SEA-Crashvertrag nach der Markdown-first-Erweiterung beide `await`-
Konvertierungszweige sowie das Await innerhalb der gemeinsamen Extraktionsschicht,
bevor ein `extracted`-Checkpoint veröffentlicht werden darf. Dadurch ist der
Test wieder an die wirkliche Laufzeitstruktur gebunden, ohne die Invariante
abzuschwächen.

## Aktueller Entwicklungsstand RC124 / DS-093

Das Cowork-Plugin akzeptiert über seine lokalen Datei- und rekursiven
Ordnerpicker jetzt zusätzlich XLSX und PPTX. Beide Quellen werden im
netzgesperrten lokalen Pluginprozess genau einmal über den bereits
ausgelieferten isolierten Office-Parser in neutrales Markdown extrahiert. Nur
dieses Markdown erreicht anschließend denselben Privacy-Core wie TXT,
Markdown, CSV und DOCX. Originalbytes, Pfade, Dateinamen, private
Zwischenstände und Mappings werden dabei nicht an Claude zurückgegeben.

Quellenabdeckung und Datenschutzprüfung bleiben zwei getrennte Aussagen:
`source_extraction_coverage` beschreibt, dass bei XLSX/PPTX nur der extrahierte
Markdown-Inhalt betrachtet wurde; `privacy_scope=extracted-markdown-only` und
`document_result` bestätigen ausschließlich dessen Anonymisierung. Damit wird
nie behauptet, der vollständige Office-Container einschließlich aller
Grafiken, Kommentare oder eingebetteten Objekte sei anonymisiert worden.

PDF, Scan-PDF und Bilder bleiben im Cowork-Plugin fail-closed gesperrt. Der
Standalone-Konverter kann diese Formate zwar lokal verarbeiten, seine rund
57-MiB-OCR-/PDF-Runtime ist aber weder Bestandteil des aktuellen Cowork-ZIP
noch auf den Cowork-Zielhosts abgenommen. Eine spätere Freigabe verlangt eine
kompakte gebündelte Runtime, Offline-/Netzwerkdeny-, Paket- und
Windows-/macOS-Zielhostnachweise. Der neue Office-Pfad erzeugt keinen weiteren
Bestätigungsdialog und verändert Standalone nicht.

Der Standalone-Desktop behält den letzten innerhalb derselben UI-Sitzung
fertiggestellten Ergebnislauf auch dann als exakt gebundene Öffnen-Aktion, wenn
bereits der nächste Stapel vorbereitet wird. Ein App-Neustart übernimmt diesen
Komfortzustand weiterhin nicht; ältere Läufe werden über den Verlauf geöffnet.
Die native Zielprüfung behandelt unter Windows das Reparse-Attribut nun bei
Eingabe **und** Ergebnisöffnung gleich und übergibt Junction-Ziele nicht an den
Explorer. Frontend-, Desktop-Vertrags- und Rust-Tests belegen beide Grenzen.

Der Netzwerkvertrag benennt den MCP-Hauptprozess präzise als Metadaten-,
Zustands- und Exportkoordinator: Er exportiert nur verifizierte anonymisierte
Paketbytes und verarbeitet keinen Original- oder Review-Rohtext. Parser, OCR und
Review behalten die eigene Netzwerk-Deny-Grenze; beide Plugin-Konfigurationen
werden auf den kleinen MCP-Einstiegspunkt geprüft.

## Vorheriger Entwicklungsstand RC123 / DS-092

Der Cowork-Normalweg übernimmt die gemeinsam nutzbaren Korrekturen der
Standalone-UATs, ohne dessen eigenständige Oberfläche, Konvertierungsmodus,
Verlauf, Ordnerstruktur oder wählbare Ergebnisnamen zu verändern. Personen-,
Unternehmens-, Parser-, Recovery-, Export- und Restprüfungslogik stammen
weiterhin aus demselben Core und werden in beiden Produktprojektionen geprüft.

RC124 schließt die Tabellen-Unterredaktion aus F1/F2: Standalone stellt für die
Anonymisierung eindeutige sensible Quellköpfe aus neutralen `Spalte N`-
Extraktionen wieder her; reine Konvertierung und Cowork werden dadurch nicht
verändert. Der gemeinsame Core kennt die belegten operativen Personenfelder.
Bleibt unter einer beliebigen anderen Kopfzeile ein namensförmiger Tabellenwert
zurück, verhindert ein davon unabhängiges Restgate die Veröffentlichung. Diese
bewusst konservative Grenze kann neutrale namensförmige Zweiwortwerte stoppen
und benötigt für eine Lockerung eine bestätigte Produktentscheidung.

RC124 schützt außerdem ausdrücklich bezeichnete Zugangsdaten im gemeinsamen
Privacy-Core. Benutzer-/Loginwerte, Passwörter, Passphrasen, Secrets, Token,
API-Keys, Zugangscodes und PINs werden in Zeilen und eindeutigen Tabellenspalten
durch `[CREDENTIAL_REDACTED]` ersetzt. Die Restprüfung besitzt einen separaten
Labelkatalog und stoppt verbleibende Werte fail-closed. Credential-gebundene
Vorkommen werden weder als Klarwert noch als Hash in Findings oder Diagnoseobjekte übernommen;
kommt derselbe Text zusätzlich in einer eigenständigen Personen- oder Unternehmensrolle
vor, wird nur diese fachlich eigenständige Rolle regulär pseudonymisiert und protokolliert;
unbeschriftete technische Tokens werden weiterhin nicht geraten.

RC124 erweitert die IBAN-Erkennung auf einfachen und mehrfachen Leerraum, Punkt,
Schrägstrich sowie ASCII- und Unicode-Bindestriche; Leerraum um genau ein solches
Satzzeichen bleibt zulässig. Für die belegten festen Gesamtlängen von DE, AT, BE,
GB und NL endet der Bankspan vor nachfolgenden Labels, weiteren Identifiern oder
Prosa. Auch nach einer konservativ geschützten numerischen Fortsetzung bleiben
durch unabhängige Detektoren abgesicherte Folgefelder sichtbar; unbekannte
Formularfelder bleiben dagegen Teil der konservativen Schutzgrenze. Unbekannte
Länderlayouts werden nicht anhand einer fremden Länderlänge gekürzt.

Der gemeinsame Telefonkontext deckt nun auch häufige deutsche Briefphrasen wie
„Rufen Sie mich an unter“, „Melden Sie sich unter“, „Rückfragen unter“ und
„telefonisch unter“ ab. Die Grammatik erlaubt nur eng begrenzte Empfänger- und
Anredeformen, bleibt auf einer Zeile und macht das Wort `unter` allein nicht zum
Telefonlabel. Technische Abruftexte, Uhrzeiten und plausible Kalenderdaten
werden dadurch nicht redigiert. Redaktor und unabhängiges Restgate sind mit
Positiv-, Negativ-, Unicode- und adversarischen Fällen belegt.

Einfache, gleich breite Tabellen werden nicht mehr allein wegen eines Wortes wie
`Mitarbeiter`, `Kunden`, `Personal`, `Fall` oder `Abteilung` als strukturell
mehrdeutig eingestuft. Eindeutige Personenfelder werden weiterhin redigiert;
unter einer nicht katalogisierten Überschrift stoppt ein namensförmiger Wert am
unabhängigen `PERSON_CANDIDATE`-Gate. Das ist absichtlich enger als die erste
F8-Auftragsfassung: `Rechnungs`, `Fall`, `Akten` oder `Abteilung` pauschal als
Personenspalten zu behandeln hätte die F2-Sicherheitsgrenze aufgehoben und
fachliche Zweiwortwerte über-redigiert. Nur tatsächlich mehrzeilige,
breitenabweichende oder überlange sensible Tabellenstrukturen erzeugen den
strukturellen Ambiguitätsstopp. Die Rekonstruktion entscheidet dabei je Spalte:
Eine korrekt zusammengesetzte Geburtsdatumsspalte kann eine ungelöste Steuer-
oder Zugangsdaten-Nachbarspalte nicht mehr maskieren.

Stapelweit gespeicherte einwortige Personenaliase werden in Folgedokumenten
nicht mehr kontextfrei ersetzt. Die private Registry entscheidet weiterhin,
welches vorhandene v1-/v2-Pseudonym zu einem Alias gehört; ob eine konkrete
Fundstelle eine Person bezeichnet, entscheidet ausschließlich der aktuelle
Dokumentkontext. `Herr Einkauf`, `Ansprechpartner: Sommer` und entsprechend
beschriftete Tabellen verwenden das frühere Pseudonym, während `Der Einkauf`
und `Im Sommer` unverändert bleiben. Auch in einem Mischdokument erteilt ein
beschrifteter Fund keine dokumentweite Ersetzungslizenz. E0 einschließlich
serialisierter Fortsetzung ist grün; echter OS-Neustart und fachliche UAT
bleiben E1/E2.

Auch die Aufnahme eines ausdrücklich bezeichneten Personennamens ist jetzt
syntaktisch begrenzt: Das Label bleibt schreibweisenunabhängig, der unmittelbar
folgende Namenspräfix wird dagegen ohne globales Case-Insensitive-Flag erkannt.
Damit wird aus `Autor: Schmidt schrieb dies.` ausschließlich `Schmidt` zur
Identität; `schrieb dies` bleibt Inhalt und derselbe Name erhält in späteren
Dokumenten dasselbe Pseudonym. Zeilen- und Inline-Labels verwenden dieselbe
Logik, vollständig kleingeschriebene explizite Feldwerte bleiben unterstützt.

`open_result_folder` löst nun ausschließlich den sichtbaren Laufordner des
aktuellsten Cowork-Stapels auf. Ist genau dieser Lauf noch aktiv, fehlgeschlagen
oder noch nicht vollständig exportiert, öffnet DataSecure weder den allgemeinen
`DataSecure-Output`-Stamm noch ein älteres Ergebnis. Rekursive Ordnergrenzen
verwenden außerdem produktneutrale `SOURCE_FOLDER_*`-Fehlercodes; Cowork meldet
damit eine korrigierbare Auswahlsperre statt eines irreführenden Pickerfehlers.
Pfade und Dateinamen bleiben in beiden Fällen vollständig lokal.

Die Produktgrenze bleibt bewusst: Cowork anonymisiert TXT, Markdown, CSV und
streng geprüfte DOCX mit neutralen Ergebnisnamen. Die reine Markdown-
Konvertierung, breite Konverter-/OCR-Runtime, Verlaufstabelle, sichtbare
Zuordnung und wählbare Benennung bleiben Standalone-Funktionen. Dadurch bleibt
das normale Cowork-Paket klein und sein Ablauf besteht nach der einmaligen
Ergebnisordnerwahl weiterhin nur aus Quelle wählen, lokal abwarten und Ergebnis
öffnen beziehungsweise auf ausdrücklichen Wunsch in Claude auswerten.

Alle folgenden RC-Abschnitte sind chronologische Entwicklungsevidenz. Für den
aktuellen Produktumfang und bei Widersprüchen gelten ausschließlich der
RC123-Abschnitt oben, das Entscheidungsregister und die dort verlinkten
Verträge; ältere Abschnitte dürfen keine aktuelle Produktzusage erweitern oder
einschränken.

## Vorheriger Entwicklungsstand RC121

Der reale RC120-UAT mit der neutral referenzierten Evidence-Datei
`UAT-DOCX-COMPLEX-001` deckte eine
Produktinkonsistenz auf: Die reine Konvertierung konnte rund 13.000 Zeichen
Markdown extrahieren, der Standalone-Anonymisierungspfad stoppte dieselbe Datei
jedoch wegen Word-Custom-XML, Klassifizierungsmetadaten und Grafiken pauschal mit
`PARSER_COVERAGE_UNVERIFIED`. DS-090 führt DOCX in Standalone deshalb durch den
bereits isolierten Markdown-first-Pfad. Gültiger, nichtleerer Markdown-Inhalt
wird vollständig anonymisiert; die unvollständige Abdeckung des ursprünglichen
Word-Containers bleibt davon getrennt sichtbar.

Der echte Dokumentgegenlauf über den gebündelten Konvertierungsworker erkennt
18 Identifikatoren, wählt lokal das Personalprofil, besteht das Residual-Gate
und veröffentlicht ein Ergebnis mit `privacy_scope=extracted-markdown-only`.
Der reale Paket-Smoke deckte zusätzlich Markdown-escapte E-Mail-Adressen wie
`lina\.testfeld@example\.test` auf; die strukturierte Erkennung umfasst nun den
vollständigen Quellspan statt nur des Nachnamens. Die persönliche Quelldatei
wird nicht ins Repository übernommen; synthetische DOCX- und E-Mail-Fixtures
binden beide Fehler als Regression. Cowork bleibt unverändert streng und stoppt
dieselben nicht abgedeckten DOCX-Strukturen. Beschädigte, verschlüsselte, aktive
oder leere Quellen bleiben in beiden Produkten gesperrt.

## Vorheriger Entwicklungsstand RC120

Die sichtbare `DataSecure-Zuordnung.csv` ist jetzt wieder ein striktes Mapping:
Jede Zeile benennt eine Quelle und genau ein bereits atomar veröffentlichtes,
vorhandenes Ergebnis. Gestoppte Dateien werden nicht mehr als künstliches
„Kein Ergebnis“-Ziel eingetragen; ihre festen Fehlercodes bleiben im privaten
Laufzustand sowie in Abschluss und Diagnose erhalten. Ein vollständig gestoppter
Lauf erzeugt keinen leeren Ergebnisordner und keine sichtbare Zuordnung. Auch
historische All-stopped-Zeilen bieten keine Öffnen-Aktion mehr, können aber als
bereits veröffentlichte Benutzerdateien unverändert bestehen bleiben.

## Vorheriger Entwicklungsstand RC119

Der UAT-Lauf `Lauf-20260907-163522-142350c1` ist nicht freigabefähig: In den
vier DOCX-Ergebnissen blieben `Anna Berger`, `Murat Kaya`, `Sofia Lindner` und
`Jonas Richter` sichtbar. Der DOCX-Konverter lieferte die eindeutige
Tabellenzeile `| person | <Name> |`; der gemeinsame Personenankerkatalog kannte
aber nur andere Feldbezeichnungen. Weil die bisherige Restprüfung denselben
Katalog verwendete, blieb auch das Release-Gate blind.

RC119 ergänzt den fehlenden expliziten Anker und einen absichtlich unabhängigen,
engen Restprüfer für genau diese Tabellenform. Alle Vorkommen des jeweiligen
Namens werden dadurch im gesamten konvertierten Markdown demselben
Personenpseudonym zugeordnet. Der direkte Gegenlauf mit den vier ursprünglichen
DOCX-Dateien entfernt alle vier Klarwerte und liefert keine Restbefunde. Der
reproduzierbare 100-Dateien-Korpustest führt diese Anonymisierungsprüfung künftig
automatisch aus; die allgemeine PII-Regression und der komplexe 15-DOCX-Korpus
sind ebenfalls grün. Ein neuer Paketkandidat ersetzt RC118 erst nach den
vollständigen Standalone-/Paketprüfungen.

## Vorheriger Entwicklungsstand RC117

RC117 erweitert die reale Word-Interoperabilität und den ausführbaren UAT-
Korpus. Der DOCX-Preflight akzeptiert jetzt ausschließlich die bekannten,
internen und nicht ausführbaren Microsoft-Beziehungen `classificationlabels`
und `stylesWithEffects`; externe Ziele, Lookalikes und alle unbekannten
Beziehungen bleiben fail-closed. Der WordprocessingML-Parser ignoriert nur die
namespacegebundenen DrawingML-Layoutknoten `align`, `posOffset`, `pctHeight` und
`pctWidth`, die keinen Dokumenttext darstellen. Fremde Namespace-Bindungen
bleiben gesperrt.

Ein neuer deterministischer UAT-Korpus liefert 15 vollständig fiktive, visuell
geprüfte DOCX mit zwei, vier oder acht Seiten. Neun enthalten Personen,
Unternehmen, Kontakt-, Adress- und Bankdaten; sechs kontrollieren neutrale
Fachinhalte. Fünf Dokumente wiederholen dieselbe Person und dasselbe Unternehmen
und belegen damit die stapelweit konsistente Pseudonymisierung. Der reale
Admission-, Parser- und Anonymisierungstest ist für alle 15 Dateien grün; eine
Neuerzeugung ergab 15/15 bytegleiche DOCX. Die beiden Standalone-Funktionen
lassen sich anhand von `EXPECTED_RESULTS.csv` getrennt menschlich prüfen.

## Vorheriger Entwicklungsstand RC116

Der sichtbare RC115-UAT-Lauf mit 102 Ergebnissen wurde vollständig gegen seine
`DataSecure-Zuordnung.csv` geprüft: Alle 102 CSV-Zeilen hatten ein vorhandenes,
eindeutiges Ziel; es fehlte kein Ergebnis. Der Lauf legte jedoch sämtliche
Ergebnisse flach als `Dokument-NNN-anonymisiert.md` ab und reduzierte die Quellen
auf ihre Basisnamen. Damit war die Zuordnung technisch vollständig, aber für
einen ausgewählten Verzeichnisbaum fachlich nicht ausreichend.

DS-089/091 / BL-010.33 korrigieren die Ursache am Beginn der Datenkette. Die sichere
Ordneraufnahme übergibt jetzt den Wurzel-relativen Quellpfad an Queue, Journal
und Export. Neue Standalone-Läufe spiegeln die komplette Unterordnerstruktur;
bei Anonymisierung wählt der Anwender vor Start zwischen
`bereich/Dokument-001-anonymisiert.md` und
`bereich/quelle-anonymisiert.md`. Genau die tatsächlich erzeugte Beziehung
steht in der Zuordnungsdatei. Reine Konvertierung erzeugt entsprechend
`bereich/quelle.md` ohne Zuordnungsdatei. Pfadsegmente werden vor dem Anlegen
jedes Zielverzeichnisses validiert und die bestehenden Link-/Identitätsgates
bleiben aktiv. Vorhandene RC115-Läufe werden bewusst nicht umbenannt oder
umgeschrieben; Cowork behält seine neutralen flachen Ergebnisnamen.

Fokussierte Aufnahme-, Export-, Markdown- und Standalone-Vertragstests sowie
die vollständige Produktsuite (61 Basisgruppen und 114 direkte Testdateien)
sind grün. Der echte Paket-Smoke nimmt vier Formate über einen verschachtelten
Ordner auf und prüft Folder-Admission, Worker, Ergebnisbaum und jede
Mappingbeziehung. Das ungebundene RC116-Windows-Archiv hat 110.219.069 Byte
und SHA-256
`e074266284f36b5cf6057c077b6927dfa87b191eb354f0734d5e298baa414c88`.
Paketprüfung, realer Worker-/History-/Sidecar-Smoke und beide Produktmodi sind
grün. Der Kandidat ist Entwicklungsnachweis; commitgebundene PKG-04-/INT-13-
Evidence und sichtbarer Zielhost-UAT bleiben getrennt offen.

## Vorheriger Entwicklungsstand RC115

Standalone verarbeitet XLSX, PPTX, PDF/Scan-PDF sowie PNG/JPEG/BMP im
Anonymisierungsmodus jetzt über denselben bereits bewährten Konverter wie bei
der reinen Markdown-Erzeugung: Die Quelle wird genau einmal in Markdown
extrahiert und anschließend wird ausschließlich dieser erzeugte Markdown-Inhalt
anonymisiert. Ein gültiger, nichtleerer Inhalt darf auch bei unvollständiger
Quellenabdeckung verarbeitet werden; leere OCR, beschädigte oder unsichere
Quellen stoppen weiterhin fail-closed.

Das Ergebnis führt zwei voneinander unabhängige Aussagen: Der
**Extraktionsstatus** beschreibt, ob die ursprüngliche Quelle vollständig in
Markdown abgebildet werden konnte. Der **Anonymisierungsstatus** bestätigt nur
die Prüfung des extrahierten Markdown-Inhalts. Eine XLSX-, PPTX-, PDF- oder
Bildquelle wird daher niemals allein aufgrund einer erfolgreichen
Markdown-Anonymisierung als vollständig abgedeckt bezeichnet. Hinweis,
Ergebnismanifest und Compliance-Kopf tragen dieselbe Trennung.

Die Produktgrenze liegt nun zentral bei 200 Dateien und weiterhin 500 MiB.
Rekursive Ordneraufnahme, Renderer, privater IPC-Vertrag, Rust-Hülle und Worker
verwenden dieselbe Grenze. Der bislang irreführend scheiternde 102-Dateien-
Korpus wird dadurch vollständig aufgenommen; konkrete Größen- und
Formatfehler bleiben als eigene lokale Fehlercodes sichtbar. Sichtbare
Zuordnungsdateien erhalten ein UTF-8-BOM, damit Excel Umlaute und Gedankenstriche
ohne Mojibake öffnet.

Die vollständige Produktsuite und die gezielten 200-/201-Dateien-Grenztests
bestehen. Zusätzlich hat der echte portable Windows-Kandidat den Paket-,
Worker-, History- und isolierten Sidecar-Smoke einschließlich einer realen
XLSX-zu-Markdown-zu-Anonymisierung bestanden. Das ungebundene RC115-Archiv hat
110.218.340 Byte und SHA-256
`90b8587ed984c4b704789dc6ecaa9e9df9b19230faa3eccf2dd50e741598530f`.
Es ist Entwicklungsnachweis; native UAT und eine ausdrückliche INT-13-Bindung
bleiben davon getrennt.

## Vorheriger Entwicklungsstand RC112

DS-088 schließt zwei Bedienlücken vor dem Start: Eine vorbereitete Auswahl kann
dateiweise korrigiert oder vollständig geleert werden, ohne Quellen zu ändern
oder einen Stapel zu starten. Derselbe indexgebundene, begrenzte Vertrag gilt
für beide Standalone-Funktionen und durchläuft Renderer, Tauri, private IPC und
Application Service. Unter **Verarbeiten** ist der exakte Ergebnisordner zudem
direkt erreichbar, sobald ein vollständiger sichtbarer Lauf existiert.

Reine Konvertierung exportiert jetzt unter dem Quellbasisnamen mit `.md` und
deterministischen Kollisionsnummern. Da diese Namen selbsterklärend sind,
entfällt `DataSecure-Zuordnung.csv`; die zugehörige Verlaufsaktion ist gesperrt.
Legacy-v3-Exporte bleiben unverändert final. Die vollständigen Standalone-,
Rust-, Export-, Executor-, Dokument- und realen ZIP-Smokes sind aus dem
Arbeitsbaum grün. Das ungebundene RC112-Windows-Archiv hat 110.216.378 Byte und
SHA-256 `0c4679dfa2d602b9484083385d2925bd3e53022e343e1a7eea84c3a089980492`.
Es ist Entwicklungsnachweis, aber bis zu einem sauberen commitgebundenen Build
und menschlichem E2-Test kein neuer INT-13-Kandidat.

## Vorheriger Entwicklungsstand RC111

RC111 führte den neutralen breiten Standalone-Pfad ein; die aktuelle
Weiterentwicklung trennt Extraktions- und Anonymisierungsstatus. Der neutrale
Extraktionsvertrag bindet den gemeldeten
`source_type` jetzt an die tatsächliche Dateiendung; vertauschte oder unbekannte
Typen stoppen mit `FORMAT_COVERAGE_UNVERIFIED`. Ein echter Mischstapel aus
direkter TXT- und konvertierter XLSX-Quelle wurde in beiden Reihenfolgen sowie
über Prozessabbruch und Fortsetzung geprüft. Personen- und Unternehmenslabels
bleiben dabei stapelweit stabil und genau einmal veröffentlicht. Eine nutzbare
breite Extraktion teilt diese Labels mit den direkten Dokumenten.

PPTX validiert vor der Extraktion sämtliche XML- und Relationship-Teile gegen
DTD/Entity-Angriffe und Strukturgrenzen. PDF stoppt bei Annotationen, Outline
oder XMP-Metadaten; standardisierte Dokumentmetadaten werden im reinen
Markdown-Modus sichtbar und begrenzt erhalten. Die reale Konvertersuite umfasst
31 Gruppen und prüft bei XLSX, PPTX, Text-/Scan-PDF, PNG, JPEG und BMP die
Markdown-first-Übergabe sowie den fortbestehenden Stopp bei leerer OCR. Die
Originalcontainer werden nie als Originalformat anonymisiert. Standalone erzeugt
zuerst eine Markdown-Extraktion und anonymisiert jeden vertraglich gültigen,
nichtleeren Inhalt. Eine `incomplete` Quellenabdeckung bleibt separat in Hinweis
und Manifest sichtbar; der Anonymisierungsstatus bezieht sich ausschließlich auf
den extrahierten Markdown-Inhalt.

Der native Windows-Launcher protokolliert nun getrennte, inhaltsfreie Checkpoints
für WebView-Profil, Setup, Seitenaufbau, Frontend und IPC. Dadurch lässt sich
ein Zielhostfehler vor `page_loaded` von einem späteren Sidecar-/IPC-Fehler
unterscheiden. Der commitgebundene RC111-PKG-04-Nachweis ist aus dem sauberen
Quellcommit `b543589f3250a6ab57ddd5bc3a144f03a24ee026` abgeschlossen und INT-13
ist an genau diesen Kandidaten gebunden.
Die vollständige RC111-Produktsuite besteht mit 61 Basis-/114 direkten
Testdateien; Rust 16/16, 30 reale Konvertergruppen, Dokumentgates sowie frische
Cowork- und Standalone-Prüfungen sind grün.

Der erste PKG-04-Lauf aus sauberem RC111-Commit
`d45252f971e1f2f8737bf4af22d511c30ca3f430` baute Kandidat A und bestand Paket-,
Worker-, History- und Sidecar-Smokes. Nach dem Windows-Neustart wurde PKG-04 aus
dem sauberen Commit `c77ec592aa95f323bd5b1efe6301b111e7f2f225` erneut
ausgeführt. Beide Läufe erreichten `webview_build_started`, aber nicht
`webview_build_completed` (`STANDALONE_NATIVE_WEBVIEW_STARTUP_TIMEOUT`);
Kandidat B, Receipt und INT-13-Bindung wurden daher korrekt nicht erzeugt. Ein
zusätzlicher Start des bereits gebundenen RC109-Archivs scheiterte auf demselben
aktuell laufenden Host ebenfalls vor `page_loaded` und Sidecar-Start. Das grenzt
den Befund auf die jetzige Host-/WebView-Testumgebung ein und ist kein belegter
RC111-Produktregressionsfehler. RC109 bleibt als historisch erfolgreich
gebundener Kandidat bestehen; eine neue Bindung erfordert einen vollständig
grünen PKG-04-Lauf auf einem funktionsfähigen Zielhost.

Die anschließende unabhängige Startpfadanalyse hat diesen Befund präzisiert:
Der Test verwendete einen WebView-UDF im Checkout beziehungsweise Tempbaum,
ersetzte die Desktop-Umgebung vollständig und besaß zwei UDF-Autoritäten. Der
korrigierte Vertrag verwendet den normalen automatischen Tauri-Fensterstart,
genau einen zufälligen UDF unter `LocalAppData`, entfernt nur bekannte
Injektionen und isoliert erst den Sidecar vollständig. Ein neu gebauter RC111-
Arbeitsstand und das unveränderte RC109-Archiv erreichten damit Frontend, Core
und beide IPC-Startantworten. Der historische Kontrolllauf endete erst bei der
sicheren Bereinigung einer noch gesperrten Cachedatei fail-closed. Dieser
Kontrollbefund betrifft nicht den neuen Kandidaten: Beide RC111-PKG-04-Builds
waren bytegleich, bestanden ihre Paket-/Worker-/History-/Sidecar- und sichtbaren
nativen Windows-Smokes und bereinigten jeweils ihr eigenes Profil vollständig.

## Basisstand RC109

Aktueller Korrekturlauf: [archivierte Gesamtreview-Umsetzung](../../tasks/archiv/2026-09-06-rc109-review-korrekturen.md)
mit gemeinsamer Review-/Fortsetzungsentscheidung, konsistenten Verlaufszählern,
struktureller XLSX-Extraktion, BMP32-Korrektur, echter MCP-Schemavalidierung und
endgültigen Async-Testurteilen. Architektur/UML und Dokumentindex trennen beide
Produkte und DS-085/086. Der abschließende Korrekturstand besteht die volle
Produktsuite (57 Basis-/114 direkte Testdateien). Der Restschuldblock ergänzt
Unicode-/Kontaktgrenzen, den geschützten Support-Review-Worker, typisierte
Diagnose, DS-069-Skillfälle und frühe Bereinigung eindeutig verwaister Intakekopien.
Erste reine Core-Verträge und ein produktübergreifender Fingerprint-/Golden-
Nachweis für TXT/Markdown/CSV/DOCX, fünf Profile, Review und frische
Abbruchfortsetzung sind hinzugekommen. 27 echte Konvertertestgruppen
und zwei frische Produktbauten bestehen die Prüfung. Architektur-, Status-App-
Browser-, Dokument- und Rusttests sind zusätzlich separat grün; genaue
Nachweise und aktuelle Artefakthashes stehen im oben verlinkten Korrekturbericht.

Keine pauschale Fertigmeldung: Der einzelne AppKit-Mac-Sammelreview und der
Mac-Sichtbarkeitsadapter sind E0 implementiert und statisch/vertraglich geprüft;
ihre native Ausführung auf Intel- und ARM-Macs ist noch nicht belegt. Sieben
transportneutrale Core-Verträge einschließlich Start, Zweck, Fortschritt und
Ergebnisprojektion sind in beiden echten Produktprojektionen gebunden. Die
Golden-Abdeckung des unterstützten Anonymisierungsumfangs ist E0 abgeschlossen;
native Zielhost- und Fachabnahme bleibt offen.
Der DOCX-AlternateContent-Vertrag wählt bekannte Word-Textfelder über die
Namespace-URI und fällt sonst genau einmal zurück oder stoppt. Reale Office-
Interoperabilität bleibt offen. Der Windows-Paketbau erzeugt jetzt ein
zielgebundenes Rust-Lizenzinventar ohne `NOASSERTION` und bindet alle 259
erreichbaren Nicht-Dev-Crates an die SBOM.
Die Status-App bleibt nach Revalidierung absichtlich eine Start-Momentaufnahme;
eine terminale Projektion aus derselben Antwort wäre falsch. Ihr Edge-/axe-Gate
ist jetzt reproduzierbar. Adaptive Parallelisierung wird erst nach Zielmessung bewertet.
Native Zielhost-/Bedien-/Fachabnahmen sind davon getrennt im Backlog geführt.

DS-087 / BL-010.30 ergänzt im Standalone-Anonymisierungsmodus eine einmalige,
neutrale Extraktion für XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP vor dem bestehenden
Privacy-Core. Anonymisiert wird die erzeugte Markdown-Repräsentation, nie der
Originalcontainer. Der Vertrag enthält weder Zweck noch Publikationskennung; es
wird kein rohes Markdown-Zwischenartefakt veröffentlicht. Vertraglich gültiges,
nichtleeres Markdown tritt unabhängig von `complete` oder `incomplete` in PII-,
Pseudonym-, Review- und Residualprüfung ein. Ergebnis und Manifest führen
Quellenextraktionsabdeckung und Anonymisierungsstatus getrennt. Leere OCR sowie
unsichere Quellen stoppen weiterhin. Ein nicht bestätigtes Ende des isolierten
Konverters bleibt auch im breiten Journal-Schema `/6` als
`termination_unconfirmed` bis zur lokalen Statusanzeige erhalten. Cowork bleibt
auf TXT/MD/CSV/DOCX.

DS-086 / BL-010.29: Standalone startet auf einer kurzen Startseite. Verarbeiten
und Betriebsart sind nicht vorausgewählt. Der Verlauf zeigt die 20 neuesten
Verarbeitungen mit eigenen Ergebnis-, Zuordnungs- und Fortsetzungsaktionen.
Abschluss und Wiederherstellung wechseln weder den Tab noch öffnen sie einen
Ordner automatisch. Die Anzeigegrenze löscht keine älteren Ergebnisse.
Private Laufbindung bleibt über Neustart und Ergebniszielwechsel erhalten;
ein unbekannter oder nicht mehr verfügbarer Lauf fällt nie auf den neuesten zurück.
Quelltests, Edge-/axe-Prüfung und echter Windows-Paket-/Worker-/History-Smoke
stehen grün; beide nativen Windows-Starts mit normalen Hostrechten ebenfalls.
Der lokale Engineering-Kandidat ist
`dist/DataSecure-Standalone-3.2.0-rc109-windows-x64.zip` (110.211.662 Byte,
SHA-256 `807940d1a48846c5de9e898691e45027d934fb84e5b3d64ef7f8031f79d271e1`).
[Review und Nachweisgrenzen](../../tasks/archiv/2026-09-06-rc109-start-verlauf-review.md).
Der commitgebundene RC109-Kandidat und seine Nachweisgrenzen stehen im folgenden
Abschnitt.

## Aktueller geprüfter Kandidat

RC111 aus sauberem `main`-Quellcommit
`b543589f3250a6ab57ddd5bc3a144f03a24ee026` ist an INT-13 gebunden. PKG-04
bestand am 07.09.2026: zwei unabhängige saubere Builds, bytegleiche ZIPs,
Desktop- und Core-Binaries sowie beide echten Paket-/Worker-/Windows-Starttests.
Je Paket wurden beide Modi, elf Konvertierungsergebnisse plus fehlerhafte CSV,
Namenerhaltung, konkrete Laufzuordnung und die optionale Supportspur geprüft.
ZIP: **110.211.527 Byte**, SHA-256
`6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f`;
Desktop-SHA-256 `db320ef02f9682087b63fe668859c22f6b91422b2e4c9636a0413ff69cdc62fe`,
Core-SHA-256 `0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4`.
Receipt und INT-13-Bindung:
`dist/pkg-04/b543589f3250a6ab57ddd5bc3a144f03a24ee026/`.
Die vollständige Produktsuite (61 Basis-/114 direkte Testdateien), Rust 16/16,
30 echte Konvertertestgruppen und Dokumentationsgates sind grün. Das Receipt
bindet außerdem Windows 10.0.26200 x64 und die maschinenweit vorhandene
WebView2-Runtime 152.0.4191.66 inhaltsfrei an den Nachweis.
Sichtbare Anwenderabnahme und native Mac-Pakete bleiben offen;
der Windows-Pilot ist keine allgemeine Layout-/OCR-Vollständigkeitsgarantie.

## Historischer Kandidat RC109

RC109 aus `6bf7d05747e151ba8f846849229495e9fca4c041` besitzt einen eigenen
PKG-04-/INT-13-Nachweis. ZIP: 110.211.662 Byte, SHA-256
`807940d1a48846c5de9e898691e45027d934fb84e5b3d64ef7f8031f79d271e1`.
Dieser Nachweis bleibt historisch erhalten und wird nicht als RC111-Evidence
umetikettiert.

## Historischer Kandidat RC108

RC108 aus `a742333e8ef80b445729d4bede6a91a2b8f13207` besitzt einen eigenen
PKG-04-/INT-13-Nachweis. ZIP: 110.168.168 Byte, SHA-256
`d1151365ebea6fa92e9d7b546d715e962d8787593707cedabcfb3f703c63b893`.
Dieser Nachweis gilt nur für RC108 und wird nicht als RC109-Evidence verwendet.

## Historischer Kandidat RC107

RC107 aus `7b88a81ff577aaa270f1354d75365b2df4a4666e` besteht die vollständige
Produktsuite (40 Basis-/111 direkte Testdateien, einschließlich 2.000 Eingaben),
zwölf Rust-Tests und den abgeschlossenen PKG-04-Zweifachbau. Beide ZIPs,
Desktop- und Core-Binaries sind bytegleich; beide Kandidaten bestehen den echten
Vierformat-/Fehlerfolgelauf und den isolierten nativen Windows-Start.
ZIP: **36.071.549 Byte**, SHA-256
`01907871eb8664597d2df5e576cf9e2a490c88ec0e38e1af867a555fe1a0f015`.
Receipt und INT-13-Bindung liegen unter
`dist/pkg-04/7b88a81ff577aaa270f1354d75365b2df4a4666e/`.
Der Cowork-ZIP-Build desselben Quellstands ist ebenfalls grün.
Dies belegt nicht den anschließenden Funktionsausbau, macOS oder die sichtbare
Explorer-/Finder-/Cowork-Anwenderabnahme. Die unten dokumentierten früheren
gescheiterten Paketversuche sind historische Gegencheck-Evidence.

## Aktueller Funktionsumfang: aktivierte Standalone-Konvertierung

Nach dem gebundenen RC107-Kandidaten wurde **Nur in Markdown umwandeln** als
eigene Standalone-Funktion durch Frontend, Rust, private IPC, Intake-v2, eigene Worker-
Nachrichten, v5-Journal, `dm_`-Store, Recovery und v4-Export verbunden. Es gibt
keine PII-Ersetzung, keinen Pseudonymseed und keinen PII-Review. Dateien wählen
oder hineinziehen, die Auswahl einzeln korrigieren oder leeren, starten,
Ergebnisse öffnen. Namen und Inhalte bleiben erhalten; Ausgaben behalten ihren
Quellbasisnamen und liegen getrennt unter `DataSecure-Markdown/Lauf-…`. Eine
Zuordnungsdatei wird nicht erzeugt. Text-/OCR-/Coverage-Hinweise werden ohne
Zusatzdialog gespeichert; schlechte oder geschützte Dateien erhalten feste
Diagnoseereignisse, der übrige Stapel läuft weiter.
Nur bereits vorhandene Konvertierungspläne mit Export-Schema
`datasecure-result-export/3` behalten ihre frühere Recovery-Zusage: War ein
solcher Plan noch nicht vollständig abgeschlossen, beendet der Replay auch
seine laufbezogene `DataSecure-Zuordnung.csv`. Der aktuelle Modus und alle neu
angelegten Läufe bleiben ohne Zuordnung.
TXT/MD/CSV/DOCX/XLSX/PPTX, PDF/Scan-PDF und PNG/JPEG/BMP nutzen einen gebündelten
Offline-Worker mit normalem Node, PDF.js, Canvas, Tesseract und DE/EN-Modellen.
Der unabhängige Integrationsreview fand und korrigierte einen gemeinsamen
Windows-Launcher-Race bei frühem Abbruch sowie fehlende v5-Snapshot-/Recovery-
Übergänge. Der neue vollständige Produkt-/PKG-04-Nachweis gehört ausschließlich
zu `a742333`; der historische RC107-Receipt bleibt Beleg für `7b88a81`.

Die vollständige RC108-Produktsuite ist grün (48 Basis-/111 direkte Testdateien),
ebenso Rust 15/15, Frontend 18/18, Dokumentationsgates und Cowork-Build. Der echte
RC108-Paketlauf besteht beide Modi, elf Konvertierungsergebnisse plus
Fehlerposition, genaue Laufzuordnung und optionale Supportereignisse. Der finale
Zweifachbau und beide nativen Windows-Starts sind mit dem obigen Receipt belegt.
Details: [RC108-Abschlussreview](../../tasks/archiv/2026-09-06-standalone-markdown-rc108-abschluss.md).

Historische Abschlussprüfung des Zwischenstands `2f173f9` am 06.09.2026:
`test:product` vollständig grün (43 Basis- und 111 direkte Testdateien,
einschließlich 2.000 Eingaben und echter 100-Dateien-Crash-/Fortsetzungsläufe),
Rust 14/14 und `test:conversion:engineering` grün. Der letzte unabhängige
Gegencheck schließt außerdem ein verfrühtes Scan-PDF-Abbruchsignal: Nach
OCR-Start wird dessen bestätigtes Prozessende abgewartet; verweigerte oder
unbestätigte Beendigung bleibt als `OCR_TERMINATION_UNCONFIRMED` erkennbar.
Die erweiterten realen Scan-PDF-Lifecyclefälle bestehen auch mit gebündeltem
Node 22. Das ersetzt weder den vollständigen Konvertierungsworkflow noch
einen neuen Paket-/INT-13-Nachweis.

## Produkt in einem Satz

DataSecure bietet ein lokales Claude-Plugin und eine eigenständige Desktop-App
zur De-Identifizierung von Geschäftsdokumenten. Originale werden lokal gewählt
und niemals automatisch verändert oder gelöscht. Nur freigegebene,
de-identifizierte Markdown-Ergebnisse dürfen Claude erreichen. Die zweite
Standalone-Kernfunktion **Nur in Markdown umwandeln** ohne Anonymisierung ist
implementiert und aktiviert; die Zielhost-/Anwenderabnahme bleibt gesondert
offen (DS-085/BL-010.28).

Neue Standalone-Anonymisierungsstapel verwenden lesbare, neustartfeste Nummern für Personen,
Unternehmen und Projekte; bestehende v1-Stapel und Plugin-Ausgaben behalten ihr
Format. Eine gemeinsame Lookup-Korrektur lädt bekannte Unternehmensbindungen im
Folgedokument wieder in die Ersetzungsliste. Native Dragdrop-Aufnahme verwendet
denselben Admissionvertrag wie der Picker und verlangt weiterhin den expliziten
Start. Die Cowork-Abschlussansicht bindet ihren Öffnen-Knopf an den konkreten
sichtbaren Exportlauf und behauptet bei nicht verfügbarem Ziel keinen Erfolg.

RC106-Gegencheck am 05.09.2026: `test:product` vollständig grün (39 Basis-
und 111 direkt registrierte Testdateien, einschließlich 2.000 variierender
Eingaben), zusätzlich Standalone-/Rust-, Dokumentations-, Skill- und
Status-App-Gates. Der Paket-Smoke verlangt jetzt vier echte TXT/Markdown/CSV/
DOCX-Eingaben, stabile lesbare Kennungen, unveränderte Originale und die genaue
Laufzuordnung. Der RC106-Kandidat wurde aus `17a21608223dcefd96c20e4b739ff6e39d638b58`
zweimal bytegleich gebaut und an INT-13 gebunden: 36.056.971 Byte, SHA-256
`12ea72d69ff65ae6f10c3319852cd8a0b4cc5182e6607582900602bf7faecbec`.
Der Receipt unter `dist/pkg-04/17a21608223dcefd96c20e4b739ff6e39d638b58/`
belegt diesen historischen Kandidaten, nicht spätere Änderungen.
Sichtbare Dragdrop-/Finder-/Explorer-Abnahme bleibt separat.
Der erste RC106-Paketlauf bestand die vierformatige Verarbeitung; der native
WebView-Start war in der Sandbox blockiert und bestand unverändert mit normalen
Hostrechten. Der unabhängige Gegencheck begrenzt außerdem den neuen Fenster-Hook
auf optional vorhandenen Zustand bei tatsächlichem Drop, damit frühe
Fensterereignisse vor dem Tauri-Setup keinen Panic auslösen können.

### Nachprüfung und aktueller Korrekturschnitt

Nachtrag 06.09.2026: Bekannte Firmen-/Personenformen werden auch nach dem echten
Dokumentwechsel (neue Registry aus Journal) ohne erneutes Namensfeld abgeglichen.
Das schließt Klammern und weitere bereits akzeptierte Namensseparatoren ein.
Getrennte v1-Rollen-/Identitätsbindungen vermeiden falsche UNKLAR-Zuordnungen;
verschiedene Rechtsformen bleiben getrennt. Der neue optionale HMAC-Startindex
beschleunigt die exakte Mitgliedschaftsprüfung ohne persistierte Namen.
34 Registry-, 23 State-, 17 Item-, 17 Journal- und 120 PII-Fälle sind grün.
Diese gezielten Prüfungen ersetzen nicht den abschließenden neuen Zweifachbau.

Der erneute unabhängige Review fand trotz grüner RC106-Gates eine ungetrennte
native Testdatenumgebung, verlorene Polltimer, veraltete Laufanzeigen, eine
Zuordnungszusage für den falschen Vorgängerlauf und Firmenkurzformen mit falscher
PERSON-Kennung. Diese Fehler sind unter den bestehenden Storys im Backlog
mit Regressionen geschlossen. Der alte native Startnachweis belegt keine Testdatenisolation und
keine sichtbare Explorer-/Finder-Bedienung; es ist kein Datenverlust nachgewiesen.
Neue native Tests dürfen erst den explizit isolierten Profilvertrag verwenden.
Frontend-Regressionsfälle gehören jetzt zum normalen `test:product`-Profil.

Der abschließende Lifecycle-Gegencheck korrigiert außerdem einen nach Desktop-EOF
weiterlebenden Steuerprozess: EOF, defekte Frames und abgebrochene Ausgabepipes
beenden nur den Sidecar; bereits dauerhaft übergebene Stapelworker dürfen weiter
abschließen. Wartende Desktopaktionen starten nicht nach. Sieben echte
Prozess-/Worker-Szenarien und zwei Protokoll-/Startfälle prüfen das Verhalten;
Cowork besitzt bereits einen getrennten begrenzten Shutdown und benötigt keine
entsprechende Produktänderung.

Lokale RC107-E0-Evidence: `test:product` vollständig grün (40 Basis- und 111
direkte Testdateien, einschließlich 2.000 Eingaben und echter 100-Dateien-
Crash-/Fortsetzungsläufe). Nach den letzten Gegencheck-Korrekturen wurde
`test:standalone` nochmals vollständig ausgeführt: 38 Produkttests, 14
Frontendfälle, die echten Sidecar-Lifecyclefälle, 11 Desktop-, 5 Paket-, 9
MarkItDown-Vertrags- sowie 12 Rust-Tests grün. Dies ist kein Nachweis für
fehlerfreie beliebige Eingaben oder sichtbare Zielhostbedienung.

Der danach erstmals ausgeführte verschärfte Paket-Folgestapel fand einen weiteren
gemeinsamen Runtime-Fehler: Ein vollständig abgewiesener CSV-Parserlauf erhielt
keinen Fehlercode und wurde dadurch als `PROCESSING_INTERRUPTED` wiederaufnehmbar.
Der erste RC107-Build aus `ebffe87` ist deshalb ausdrücklich kein Kandidat für
INT-13. Die Korrektur klassifiziert bestätigte Parserablehnungen als `PARSE_FAILED`;
unbekannte Prozessabbrüche bleiben getrennt, Zeitüberschreitungen erhalten
`PARSER_TIMEOUT`. Erst nach dieser Korrektur und ihren Regressionen wird die
Commit-/Zweifach-Build-/Smoke-Kette erneut ausgeführt.
Der unabhängige Gegencheck bestätigt die Unterscheidung; 19 Parser-Isolations-
und 16 gemeinsame Itemprozessor-Tests sind nach der Korrektur grün, einschließlich
echter fehlerhafter CSV-Bytes. Content-Graph- und DOCX-Vertrags-/Differentialtests
bleiben grün. `PARSE_FAILED` bedeutet sichere Ablehnung, nicht zwingend einen
alleinigen Defekt der Quelldatei: Auch abgelehnte interne Parsergrenzen bleiben
gesperrt. Der Paketnachweis wird separat neu erbracht.

Auf dem Parser-Korrekturcommit `aaecf59` bestand zusätzlich die lokale
CI-Produktsuite (40 Basis- und 48 direkte Testdateien), ohne GitHub Actions.
Das neu gepackte Windows-Artefakt bestand den echten Vierformatlauf, den
vollständig abgewiesenen CSV-Folgestapel und den isolierten nativen Tauri-Start.
Die anschließende Testbereinigung stoppte jedoch vor der ersten Löschung an
einer von Windows angelegten Cache-Junction im frischen Testprofil. Dieser
Testrest bleibt unverändert; der unvollständige PKG-04-Lauf erhält keine
INT-13-Bindung. Ein korrigierter Testharness benötigt einen neuen Quellcommit
und erneut zwei vollständige Builds und Smokes.
Der Gegenlauf mit dem ersten korrigierten Harness bestätigte den nativen Start,
zeigte aber einen weiteren Testadapterfehler: Windows PowerShell lieferte für
die echte Cache-Junction keine Link-Metadaten. Auch dieser neue Testrest bleibt
erhalten. Der Harness liest nun den exakten Mount-Point-Tag und das Ziel direkt
über einen No-follow-Windows-Handle; synthetische Null-Provider- und Bufferfälle
ergänzen den Gegencheck. Kein fehlender Anzeigename erlaubt eine pauschale
Linkfreigabe. Eine erfolgreiche neue PKG-04-Kette bleibt Voraussetzung.
Der anschließend neu gestartete isolierte native Lauf bestand Start, beide
IPC-Antworten und die vollständige Bereinigung von 426 eigenen Testeinträgen.
Die zwei früheren Testprofile blieben unangetastet. Damit ist die
Harness-Korrektur E0-belegt, nicht jedoch die noch ausstehende Zweifachbindung
des abschließenden Produktcommits.

Neue Standalone-Läufe führen ausschließlich tatsächlich veröffentlichte
Ergebnisse in ihrer eigenen Zuordnung. Gestoppte Quellen bleiben im privaten
Status und in der Diagnose. Der aktuelle Laufresolver fällt niemals auf frühere
Ergebnisse zurück. Bereits veröffentlichte Altzuordnungen bleiben unverändert;
historische All-stopped-Läufe erhalten aber keine Ergebnis- oder
Zuordnungsaktion. Cowork erhält weder diese Zuordnungen noch Quelldateinamen.
Der Exportvertrag verweigert außerdem mehrdeutige Records, in denen dieselbe
Quelle doppelt oder zugleich als erfolgreich und gestoppt vorkommt. Der reale
Paket-Smoke prüft den Markdown-first-XLSX-Pfad nun auf genau eine finale
Erfolgszeile, UTF-8-BOM und das Fehlen eines vorläufigen Coverage-Stopps. Eine
Bestandsprüfung der zehn vorhandenen UAT-Läufe bestätigte: neun Zuordnungen
verweisen vollständig auf vorhandene Ergebnisse; genau der historische,
tatsächlich gestoppte Lauf enthält zwei Stopzeilen. Altdateien werden als
Benutzereigentum bewusst nicht nachträglich umgeschrieben.
Ein neuer Freigabekandidat benötigt erneut Commit-, Build- und Smoke-Evidence;
die RC106-Bindung darf nicht nachträglich umetikettiert werden.

## Belegter Produktumfang

- Cowork-Anwenderkanal heute: das zielsystemspezifische, selbsttragende Plugin-ZIP.
  Der private Marketplace ist der gleichwertige Zielkanal (DS-002/DS-067), aber
  noch nicht freigegeben: Der Build erzeugt eine streng validierbare,
  selbsttragende Git-Marketplace-Projektion mit relativer Quelle. Veröffentlichung
  in einem privaten/internen Marketplace-Repository sowie Fresh-Install- und
  Update-Nachweise bleiben BL-010.8/BL-051.2.
- MCPB: internes Engineering-Artefakt, kein Installations-, Fallback- oder
  Supportweg für Anwender.
- Anonymisierung in beiden Produkten: TXT, Markdown (`.md`, `.markdown`), CSV
  und DOCX sind freigegeben. Standalone führt DOCX sowie breite Quellen über den
  DS-087/DS-090-Verkettungspfad; Cowork verarbeitet DOCX weiterhin direkt und
  streng. Gültiger, nichtleerer extrahierter Markdown-Inhalt
  wird anonymisiert; die häufig `incomplete` Quellenabdeckung bleibt separat
  sichtbar. Im Cowork-Produkt bleiben breite Quellen bereits bei der Aufnahme
  gesperrt.
- Reine Standalone-Konvertierung: zusätzlich XLSX, PPTX, PDF/Scan-PDF sowie
  PNG/JPEG/BMP im Produktpfad aktiviert. Extraktionshinweise und Fehler bleiben
  laufbezogen sichtbar. Der Windows-Engineering-Paketnachweis ist an den oben
  genannten RC111-Commit `b543589f3250a6ab57ddd5bc3a144f03a24ee026`
  gebunden; Zielhost-/Anwenderfreigabe bleibt offen.
- Stapel: höchstens 200 Dateien und 500 MiB; nur ein aktiver Stapel.
- Bilder aus DOCX: Pixel bleiben lokal; kein auswählbarer Bildmodus und keine
  Freigabe über Claude.
- Speicherung: lokale Plain-Arbeits- und Reviewkopien ohne Schlüsselbund,
  Passwort oder zusätzliche Verschlüsselung.
- Aufbewahrung: konfigurierbar 0–14 Tage nur für temporäre DataSecure-Arbeits-
  und Reviewdaten. Quellen/Originale und fertige Exporte werden niemals
  automatisch gelöscht.
- Anonymisierungsergebnis: Markdown pro freigegebener Datei plus dauerhaft lokale private
  `DataSecure-Mapping.csv`; rekursive relative Labels und gleiche Basenames aus
  unterschiedlichen lokalen Ordnern bleiben darin kollisionsfrei unterscheidbar.
  Standalone projiziert bei Anonymisierung nach vollständigem Abschluss eine
  atomar erzeugte `DataSecure-Zuordnung.csv` in genau den sichtbaren Laufordner
  unter `DataSecure-Output`. Reine Konvertate liegen unter
  `DataSecure-Markdown`, behalten den Quellbasisnamen mit `.md` und benötigen
  keine Zuordnungsdatei; Kollisionen werden deterministisch nummeriert.
- Sichtbarer Cowork-Export: Beim ersten Lauf wird ein Ergebnisordner einmal lokal
  gewählt, die Output-Anlage geprüft und das Ziel erst danach identitätsgebunden
  gespeichert. Nur verifiziertes Markdown mit
  neutralen Namen gelangt nach `DataSecure-Output/Lauf-…`; die private globale
  Zuordnung, Originale, Review und Recovery bleiben privat. Nur ein fehlgeschlagener Export wird lokal
  vorgemerkt und beim nächsten Start oder Ordnerwechsel genau einmal nachgeholt.
  Gemäß DS-079 entsteht der sichtbare Laufordner erst, wenn der gesamte Stapel
  einschließlich eines nötigen Sammelreviews abgeschlossen ist. Klare Positionen
  bleiben bis dahin nur intern dauerhaft. Nach dem sichtbaren Abschluss ist jede
  Ergebnisdatei endgültig: vom Anwender gelöschte oder bearbeitete Ergebnisse
  werden weder überschrieben noch wiederhergestellt, und ein späterer
  Ordnerwechsel spiegelt keine früheren Läufe in den neuen Ordner. Der Outputbaum
  ist als rekursive Quelle gesperrt.
  Export-Claims werden identitätsgebunden und mit begrenztem transientem Retry
  freigegeben. Bleibt die Freigabe unsicher, melden Terminalexport und Replay
  keinen Erfolg; der gesamte betroffene Export bleibt sichtbar ausstehend.

## Claude-/Cowork-Grenze

Der lokale Plugin-MCP kann in einer lokalen Cowork-Sitzung eines bestehenden
Claude-Desktop-Deployments oder in lokalem Claude Code genutzt werden, wenn
`data-secure-local` tatsächlich verbunden ist. Lokale MCP-Server laufen laut
Hersteller nicht in Cloud-Sitzungen; Cloud-Cowork, Web, Mobil und geplante
Cloud-Aufgaben erhalten deshalb keinen Originalzugriff. Die lokale CLI 2.1.233 validiert
Quellplugin und Marketplace streng; das ist kein Fresh-Install- oder
Cowork-Laufnachweis. Bereits freigegebenes Markdown darf weiterhin in diesen
Cloud-Sitzungen verwendet werden. Die offizielle aktuelle Hostdokumentation wird vor jeder
Freigabe erneut geprüft.

## Teststand

Manifest-, Retention-, Architektur-, Format-, Picker-, Handoff-, Recovery-,
Gateway- und Dokumentenverträge sind automatisiert. Das vollständige historische
Testjournal liegt unter
[`docs/archive/2026-09/testing`](../archive/2026-09/testing/TESTING_HISTORY_THROUGH_RC84.md).
Aktuelle Testklassen und Befehle stehen in [`docs/TESTING.md`](../TESTING.md).
Automatisierte Tests ersetzen keine Windows-/macOS-Fresh-Install-, Cowork-, UX-,
Accessibility-, Security- oder Fachabnahme.

RC102 schließt den im nativen Windows-UAT sichtbaren Startfehler
`STANDALONE_IPC_FAILED`: Tauri lieferte den Ressourcenpfad korrekt in der
Windows-Verbatim-Schreibweise (`\\?\C:\…`), Node beendete sich jedoch vor dem
Sidecarstart an dem absolut übergebenen Preloadpfad. Die Desktop-Hülle prüft
weiterhin die unveränderten Paketdateien, normalisiert ausschließlich die an den
Kindprozess übergebene Pfadschreibweise und lädt den gebundenen Network-Deny-
Preloader relativ zum geprüften Arbeitsverzeichnis. Rust-Unit-, Paket- und
echter nativer EXE-Starttest verlangen bestätigte Sidecar- und IPC-Ereignisse.
Diese Tauri-spezifische Ursache existiert im Cowork-Plugin nicht; dort sichern
echte Worker-ACKs und Queue-Envelope-Validierung den vergleichbaren
Mock-/Scheinerfolgsfehler ab.

Die häufige Standalone-Statusabfrage enumeriert Recovery-Zähler und den aktiven
beziehungsweise ausdrücklich fortgesetzten Lauf gemeinsam; ohne eine solche
Laufbindung verwendet sie den jüngsten eigenen Stapel. Auch bei 1.000
aufbewahrten Journalen gibt es pro
Poll genau einen Verzeichnisscan und höchstens einen Read je Journal; die
Produktoberfläche zeigt die laufbezogene Zuordnung eines Mischstapels erst nach
einem terminalen sichtbaren Ergebnis. Die frühere RC107-Übersicht für einen
vollständig gestoppten Lauf ist durch RC120 ersetzt: Ohne Ergebnis entstehen
weder sichtbarer Laufordner noch Zuordnung; Fehlercodes bleiben in Abschluss
und Diagnose. Scheitert bei einem Mischlauf nur die Abschlussübersicht, bleibt
die Anzeige ausdrücklich `export_pending`, ohne
bereits fertige Dokumente als fehlgeschlagen zu zählen. Bei der Anonymisierung
bleibt die private globale Zuordnung zusätzlich für die lokale
Nachvollziehbarkeit erhalten.

Im Anonymisierungsmodus erkennt und entfernt der gemeinsame Kern direkte Identifikatoren einschließlich
mehrsprachiger Namensfelder, Anreden, Kontakt-URIs, Telefon-, Adress-, Steuer- und
Bankdaten. Mehrzeilige sensible Tabellenköpfe werden nur bis zur belegten
eindeutigen Struktur ausgewertet; verschobene, ungleich breite oder längere
Strukturen stoppen am unabhängigen Residual-Gate. Zusammengeführte DOCX-Zellen
stoppen, bis sie koordinatentreu unterstützt werden. Zertifizierungsanbieter und
IT-/Health-IT-Fachbegriffe bleiben kontextgebunden erhalten.

Intake, Fortsetzung und Review gelten erst nach echtem Worker-ACK als lokal
angenommen. Dieses ACK ist bewusst noch kein dauerhafter Stapelcheckpoint: Die
öffentliche Startantwort benennt bis dahin `checkpoint_pending` und behauptet
weder laufende noch bereits fortsetzbare Verarbeitung. Executor-Leases binden
ihren Eigentümer an PID und Betriebssystem-Startidentität; eine wiederverwendete
PID kann daher keine alte Lease übernehmen, während ein nicht sicher
beobachtbarer Eigentümer fail-closed blockiert.
Der lokale Hintergrundlauf geht nach der vollständigen Stapelanalyse direkt in
einen erforderlichen Sammelreview; „Später“ pausiert ohne Freigabe und ohne
zweiten Picker. Abschlussanzeige und sichtbarer Export besitzen getrennte,
dauerhafte Zustände. Detached Worker und Parser starten aus einem geprüften
versionsgebundenen Runtime-Cache; bei einer eindeutig erkannten temporären
Claude-Umleitung wird nur unter Windows das reguläre LocalAppData des bestehenden
Benutzerprofils verwendet. Der entsprechende echte Cowork-Wiederholungslauf auf
Windows und alle macOS-Zielhostnachweise bleiben offen.

Der Unterbau des eigenständigen DataSecure-Standalone-Produkts ist als
E0-Vertikalschnitt vorhanden: eine kleine technische CLI ruft die lokale Engine
direkt auf, ohne MCP-/JSON-RPC-Umweg. Vor Laden des Core wird ein eigener
`SecureDataMsg-Standalone`-Datenroot aktiviert und an Hintergrundworker
weitergereicht. Plugin und Standalone verwenden dieselbe neutrale geordnete
Start-/Recovery-Transaktion. Damit
sind Journale, Einstellungen, Review und Exporte physisch vom Claude-Plugin
getrennt. Sieben reine Core-Verträge sind von MCP-, Desktop- und
Dateisystemadaptern getrennt und durch statischen Importabschluss, isolierte
VM-Ausführung sowie echte Cross-Product-Projektionsgates abgesichert. Breitere
Format-/Profil-/Recovery-Goldenabdeckung bleibt BL-010.23. Eine reale Tauri-2-Hülle mit
nativem Datei-/Ordnerdialog, privatem längengerahmtem Sidecar-Kanal und
inhaltsfreier Rendererprojektion ist auf Windows x64 kompiliert und im
laufenden Prozess geprüft. Ein eigenes selbsttragendes Windows-x64-
Engineering-Paket wurde gebaut, verifiziert und in einem isolierten Pfad ohne
System-Node gestartet. Zielsystem-UAT und native macOS-Pakete fehlen; der
Schnitt ist deshalb noch kein freigegebenes Standalone-Produkt.
Die Standalone-Oberfläche zeigt Vorbereitung und danach passive, inhaltsfreie
Fortschrittszähler. Einen terminalen Zustand bestätigt sie dem Worker erst nach
einem tatsächlichen Renderer-Paint und nur mit der zu diesem Zustand gehörenden
inhaltsfreien Generationsnummer. Verspätete und doppelte ACKs sind inert; fehlt
das passende ACK, wird keine sichtbare Darstellung behauptet. Standalone
protokolliert den Timeout und stellt den Zustand über seine eigene UI wieder
bereit; es öffnet keinen zusätzlichen Cowork-Abschlussdialog. Der getrennte
Cowork-Abschluss nutzt unter Windows ein echtes natives `Shown`-Ereignis statt
eines bloßen Prozessstarts. Der macOS-Adapter verlangt nun ebenfalls eine
sichtbare AppKit-Fensterbestätigung (`SHOWN`). Die native Ausführung auf Intel
und Apple Silicon bleibt Zielhostevidenz.
Seit DS-086/DS-088 besitzt Standalone die drei Hauptansichten **Start**,
**Verarbeiten** und **Verlauf**. Die App startet auf **Start** ohne vorbelegte
Betriebsart. Vor dem Start können einzelne eindeutig dargestellte Dateien aus
der Auswahl entfernt oder die gesamte Auswahl geleert werden; beide Funktionen
verwenden denselben Admissionvertrag. Auswahl, Wiederherstellung und Abschluss ändern die Navigation
nicht automatisch. **Verlauf** zeigt die 20 neuesten Verarbeitungen mit
Datum, Zweck, Zählern und Status. Ergebnisordner, eine bei Anonymisierung
vorhandene Zuordnung und Fortsetzung gehören jeweils ausschließlich zur gewählten Zeile. Der Core löst dafür den
exakten sichtbaren `Lauf-*`-Ordner beziehungsweise dessen Mappingdatei auf;
ein fehlendes Ziel führt nicht zum Öffnen eines anderen Laufs.
Nur der vertrauenswürdige Rust-Host erhält dieses Ziel über den privaten
Längenframe; der Renderer erhält aus der Öffnungsaktion weiterhin keinen Pfad.
Rust validiert Existenz, absoluten Pfad, Typ und Linkfreiheit und startet danach
Explorer, Finder oder `xdg-open` ohne versteckte Fensteroption. Die Oberfläche
bestätigt den Handoff getrennt vom fachlichen Abschlussstatus. Die Diagnose
protokolliert dabei ausschließlich Aktion, Ausgang und festen Fehlercode,
niemals Pfad, Dateiname oder Inhalt. Ein Standalone-Lauf gilt erst dann als
sichtbar abgeschlossen, wenn alle Ergebnisdateien und – ausschließlich bei
Anonymisierung – seine atomar veröffentlichte `DataSecure-Zuordnung.csv`
vorhanden sind. Die Zuordnung enthält nur die lokale Quellbezeichnung und den
tatsächlich erzeugten Ergebnisnamen. Neutral ist der datensparende
Standalone-Standard; wahlweise bleibt der Quellbasisname mit `-anonymisiert`
erhalten. Die Wahl ist im v6-Stapeljournal für Wiederaufnahme und Export
unveränderlich gebunden. Reine Konvertate behalten den Quellbasisnamen; ihre
Zuordnungsaktion ist deaktiviert. Eine Ergänzung noch
unvollständiger älterer Exportprojektionen bleibt an das zugehörige private
Stapeljournal gebunden. Bereits endgültige sichtbare Exporte werden nicht
überschrieben oder wiederhergestellt. Der Cowork-Export erhält diese Datei
ausdrücklich nicht. Die
Oberfläche zeigt ihre Produktversion, damit kein älterer entpackter Kandidat
unbemerkt in eine aktuelle Abnahme gerät.
Ein geschlossener UI-Zustands-/IPC-Vertrag verhindert Rohbytes und direkten
Dateisystemzugriff im Renderer. Ausgewählte Dateinamen, Quellenordner und das
Ergebnisziel werden ausschließlich im lokalen Standalone-Fenster angezeigt und
fehlen strukturell in Diagnose, Supportspur und externen Antworten;
Pflichtzähler und Zustandsübergänge stoppen bei fehlenden, regressiven oder
widersprüchlichen Werten. Der Zielkatalog bindet vier getrennte Pakete an exakte Rust-Triples:
Windows x64, macOS Intel, macOS Apple Silicon und Linux x64 glibc. Für beide
macOS-Pakete gilt wegen der gebündelten Node-Laufzeit mindestens macOS 13.5.
Zertifikatsfreie macOS-Piloten werden ausdrücklich ad-hoc signiert
(`signingIdentity: "-"`). Ein neues GitHub-Actions-Gate bildet dafür eine
kostenkontrollierte Zielhost-Sandbox: Es ist nur über `workflow_dispatch`
startbar, verlangt eine ausdrückliche Bestätigung möglicher privater Runner-
Minuten und wählt standardmäßig nur Apple Silicon. Auf `macos-15-intel` und
`macos-14` werden die gepinnte Node-Runtime, der nativ kompilierte POSIX-
Supervisor, die vollständigen Standalone-/Konverter-/Rust-Verträge, Clippy,
der Tauri-Release-Build und die Architektur aller drei Executables geprüft.
Es verwendet keine Secrets, keinen Cache und keine Artefakt-Uploads. Der
Workflow ist noch nicht ausgeführt; App-Bundle, Gatekeeper, sichtbare Fenster,
Picker, VoiceOver, Performance und menschliche UAT auf Intel und Apple Silicon
bleiben offen.
Rust und Tauri sind ausschließlich Buildwerkzeuge; Anwender installieren weder
Rust noch Node oder Python. Der Windows-Build wurde mit Rust 1.98.1, Tauri
2.11.5 und MSVC erfolgreich gebaut; `cargo test --locked`, Clippy,
Paketprüfung und ein isolierter Start-/Stopp-Smoke sind grün. Der Paketbau
erzeugt die geschlossene Runtimeprojektion immer frisch aus dem aktuellen
Quellbaum. Die Pilotoberfläche kann Ergebnisordner und laufbezogene Zuordnungsdatei über
getrennte inhaltsfreie IPC-Aktionen öffnen. Abschluss-, Fehler-, Review- und
Ergebniszähler stammen aus dem aktiven beziehungsweise ausdrücklich
fortgesetzten Standalone-Stapel, sonst aus dem jüngsten eigenen Stapel.
Jede Verlaufszeile behält ihre eigenen Zähler und Aktionen. Ein intern
abgeschlossenes Paket ohne vollständig sichtbaren Export erscheint ehrlich als
`export_pending`; offene Exporte werden beim Start und nach einer
Ergebnisordnerwahl erneut versucht. Ein Teilexport bindet sein Ziel vor dem
ersten Item und kann deshalb nicht auf zwei Ordner verteilt werden. Standalone-
Worker delegieren terminale Meldungen an die Tauri-Oberfläche und öffnen keinen
Cowork-Abschlussdialog. Nach Sidecar-Neustart oder verlorenem Admission-Zustand
setzt der Renderer seine veraltete Startfreigabe zurück. Die laufgebundene
Öffnen-Aktion und ein exklusiver Export-Outbox-Claim sind E0 geschlossen. Offen
bleiben Windows-UAT, Accessibility-/Performance-Messung sowie native Builds und
UATs auf macOS Intel/ARM und Linux. Die maschinenlesbare Rust-Komponenten- und
SBOM-Aufbereitung ist E0 abgeschlossen; eine organisatorisch verlangte
menschliche Lizenzfreigabe bleibt davon getrennt.

RC101 schließt den im echten Windows-Piloten reproduzierten Picker-/Admission-
Defekt: Der Normalisierer liefert `{name, full, sourceBytes, sourceLabel}`; der
Standalone-Service verwendet exakt dieses Schema und liefert die lokale
Quellen-/Datei-/Ergebnisanzeige atomar mit der Aufnahmeantwort. Der zuvor
verwendete Identitäts-Mock wurde aus den betroffenen Standalone- und Cowork-
Vertragstests entfernt. Der selbsttragende Paket-Smoke nimmt nun eine echte
TXT-Datei über den extrahierten Sidecar auf und konfiguriert ein echtes lokales
Ergebnisziel. Zwei rotierende, inhaltsfreie JSONL-Spuren für Desktop und Sidecar
sind über **Diagnose öffnen** erreichbar. Dieselbe Queue wird vor Prozessstart
und im Worker vor dessen Annahmebestätigung schema-validiert; Cowork kann damit
eine strukturell unbrauchbare Warteschlange nicht mehr als übergeben melden.

Der wiederholte RC99-Gegencheck bindet alle globalen Lock-Freigaben an einen
gemeinsamen fail-closed Vertrag: eine verweigerte oder fehlgeschlagene Freigabe
kann keinen Verarbeitungserfolg mehr melden, verdeckt aber keinen bereits
laufenden Primärfehler. Der reale verzögerte Pipeline-Test erreicht wieder beide
Publikationsbarrieren und besitzt einen harten Timeout. Export-Replay zählt nach
einem Recordfehler alle weiter offenen Dateien. Standalone unterscheidet nun
Fortsetzung, offenen Export und einen vollständig sicher gestoppten Stapel auch
in UI und CLI; eine Fortsetzung gilt erst nach Startmarker und Worker-ACK.

Microsoft MarkItDown 0.1.7 ist als gepinnter, netz-/pluginfreier
DOCX-Differential-Bridge samt Vertrag und echtem synthetischem Smoke vorbereitet.
Der Engineeringpfad läuft isoliert mit `-I -S`, ohne Host-PATH/-TEMP, und wird
ehrlich als ungerahmter, nicht authentisierter Testtransport geführt;
aber `product_enabled` bleibt `false`. MarkItDown ist ein optionales
Differentialorakel; seine Python-Runtime gehört nicht zum Nutzerpaket. Der
aktive Standalone-Produktkonverter verwendet den gebündelten JS-/PDF-/OCR-Pfad
und unterstützt auch XLSX, PPTX, PDF/Scan-PDF sowie PNG/JPEG/BMP. DS-087 bindet
diese Formate im Standalone-Anonymisierungsmodus an die neutrale Extraktion und
die nachgelagerte Markdown-Anonymisierung; die Originalcontainer selbst erhalten
keine Vollständigkeitsfreigabe. Architektur,
Lieferstufen und offene User Stories stehen in
[`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md) und BL-010.9.

## Backlog-Ist je Epic

### BL-010 – Plattform und Distribution
ZIP/Marketplace sind der Produktkanal. Die selbsttragende Node-22.23.2-Runtime
ist für Windows x64 sowie macOS Intel/ARM gebaut, hash-/architekturgebunden und
paketvertraglich geprüft. Ein reales Windows-Paket startete ohne System-Node;
reale Cowork-Fresh-Install- und macOS-Nachweise bleiben offen. Linux ist kein
aktuelles Cowork-Produktziel.

Die aktuelle Plugin-MCP-Konfiguration verwendet den offiziellen
`mcpServers`-Wrapper. Eine generierte Marketplace-Projektion mit relativer,
selbsttragender Pluginquelle wird streng validiert; für die Produktfreigabe fehlen
weiterhin die Veröffentlichung in einem privaten/internen Git-Repository sowie
Fresh-Install-/Update-Evidenz auf Windows und macOS.

Der Pluginserver handelt die MCP-Protokollversion gemäß DS-081 mit dem Host aus:
Er bietet den aktuellen modernen Stand `2026-07-28` über `server/discover` an
und bewahrt den getesteten Legacy-`initialize`-Pfad für ältere Claude-Hosts.
`MCP26-01` ist keine offizielle Zielversion und kein geplanter Cutover. Eine
vollständige `2026-07-28`-Konformitätsaussage ist noch nicht freigegeben; dafür
fehlt die dokumentierte offizielle Conformance-Prüfung des ausgelieferten
Pluginservers. Das Standalone-Produkt verwendet kein MCP.

### BL-003 – Product Vision und Dokumentenkanon
Vision und Kanon sind eingerichtet. Diese Konsolidierung trennt aktuelle Quellen
von historischer Evidence.

### BL-001 – Dokumentensystem und Wiederverwendung
Ein aktives Backlog, ein Register und ein Archivindex sind vorhanden.

### BL-002 – Ist-/Zielvertrag und Drift
Aktuelle Aussagen werden durch Dokumenten- und Capabilitytests geprüft; weitere
semantische Driftgates werden in diesem Schnitt ergänzt.

### BL-011 – Sicherer fortsetzbarer Stapelkern
Intake, identitätsgebundene Checkpoints/Cleanup, Resume, Mapping, Ergebnisse,
Retention und neustartfeste stapelweite HMAC-Pseudonyme sind E0-implementiert.
Zielsystem- und echte Crash-/Dateisystemnachweise bleiben offen. Eine atomare,
prozessübergreifende Intake-Reservierung sperrt bereits den Pickerstart und bleibt
bis zum dauerhaften Stapelcheckpoint bestehen. Sie kann sicher an den Worker
delegiert werden; verwaiste Eigentümer werden fail-closed behandelt und ein echter
Zwei-Prozess-Test lässt genau eine Aufnahme zu. Reale Cowork-Messungen auf
Windows/macOS bleiben BL-011.10.

### BL-012 – Nutzerreise und lokaler Review
Ein Pickerstart und ein gebündelter lokaler Review sind implementiert. Klare
Dateien umgehen den Review vollständig; Mischstapel schließen klare Positionen
vorher ab und legen nur mehrdeutige Dokumente lokal vor. Der Review zeigt
inhaltsfreie Fortschrittszähler, rot/gelbe Fundstellen, direkte
Beibehalten-/Anonymisieren-Aktionen, Rückgängig, exakte Gruppenaktionen und auf
Windows Tastaturkürzel. Reale UX-, macOS- und Accessibility-Abnahme bleibt offen.

### BL-020 – Gemeinsame Inhaltsgrenze
Content-Graph und rekursive Sicherheitsgrenzen existieren, sind aber noch nicht
für alle Zielcontainer vollständig.

### BL-021 – Text und CSV
TXT/Markdown/CSV sind im Produktallowlist; reale Zielsystemabnahme bleibt offen.

### BL-022 – OOXML-Formate
DOCX ist im Produktallowlist und für die bisher belegten Strukturen fail-closed
gehärtet. Die Auswertung ist an die tatsächliche WordprocessingML-Namespace-URI
gebunden; unbekannte XML-Entities, fremde Relationship-Namespaces und fremde
direkte Textknoten stoppen. Kopf-/Fußzeilen werden ausschließlich über die
tatsächlichen Dokumentreferenzen in kanonischer Reihenfolge gelesen. Für
`mc:AlternateContent` gilt eine feste Policy: bekannte Word-2010-Textfeld-
Namespaces wählen die erste unterstützte Choice, unbekannte Choices genau einen
Fallback; ohne eindeutigen Pfad stoppt der Parser. Offen bleiben reale Office-
Interoperabilitätsfixtures sowie die vollständige Kommentarabdeckung. XLSX und
PPTX werden in Cowork und Standalone Markdown-first anonymisiert; die
Extraktionsabdeckung des ursprünglichen Containers bleibt dabei ausdrücklich
`incomplete`, während nur der extrahierte Markdown-Inhalt die vollständigen
Privacy-Gates durchläuft. Breiter Office-Korpus und Zielhost-/Fachabnahme
bleiben offen.

### BL-023 – PDF-Risikogate
PDF und Scan-PDF bleiben im Cowork-Plugin ohne paketierten und nativ belegten
PDF-/OCR-Pfad sicher gesperrt. Standalone verwendet den gebündelten
Offline-PDF-/OCR-Pfad sowohl für reine Konvertierung als auch für die
Anonymisierung des extrahierten Markdown-Inhalts; dessen Hinweise sind keine
Vollständigkeitszusage für den Originalcontainer. Zielhost-/Fachabnahme bleibt
offen.

### BL-024 – OCR und Rasterbilder
Engineering-Komponenten und Harnesses existieren. Der Portable-Engineering-Build
übernimmt das verifizierte Universal-OCR-Bundle vollständig; dessen geschlossenes
Manifest und Inventar, Modi, Hashes, Installationspfade mit Leerzeichen sowie
Adapter-Timeout und laufender Abbruch sind E0-geprüft. Für die reine
Standalone-Konvertierung sind Offline-OCR und PNG/JPEG/BMP integriert und im
oben gebundenen RC111-Windows-Paket Ende zu Ende geprüft. Standalone kann auch
den daraus extrahierten Markdown-Inhalt anonymisieren. Native Mac-Pakete und
Zielhost-/Fachabnahme bleiben offen. Im Cowork-Plugin bleiben eigenständige
Bilder weiterhin gesperrt; Bildpixel aus DOCX bleiben lokal.

### BL-030 – Profil und Pseudonyme
Ein neustartfester stapelweiter HMAC-Kontext ohne Keyring, Keyfile oder zusätzliche
Verschlüsselung ist E0-implementiert. Echte Cowork-/OS-Fortsetzung bleibt offen.

### BL-031 – Zertifikats- und Fundstellenkontext
Kontextregeln schützen Zertifizierungsanbieter und Fachbegriffe; Fachevidenz mit
unterschiedlichen Vorlagen bleibt offen.

### BL-032 – Mehrdeutigkeit
Unklare Organisationen stoppen zur lokalen Prüfung. Plattformgleiche Bedienabnahme
fehlt.

### BL-040 – Lokaler Export und Nachweis
Mapping und inhaltsfreie Nachweise sind implementiert; Quellen bleiben unverändert.
BL-040.5 ergänzt den einmalig gewählten lokalen Ergebnisordner. Dieser kann
optional separat mit Cowork verbunden werden; DataSecure kann die verbundenen
Cowork-Ordner weder lesen noch die Quellentrennung selbst garantieren. Der Export prüft
das Paket erneut, schreibt ausschließlich Markdown atomar unter neutralem Namen
und veröffentlicht exklusiv ohne vorhandene Benutzerdateien zu überschreiben.
Readiness und eine bereits aktive Verarbeitung werden vor einer erstmaligen
Ergebnisordnerwahl geprüft. Der lokale Abschluss bietet „Ergebnisse öffnen“; der MCP erhält weder Zielpfad
noch Mapping. Die erfolgreiche MCP-Startantwort wartet höchstens fünf Sekunden auf
die ausdrückliche, inhaltsfreie Empfangsbestätigung des Intake-Workers; Timeout,
Worker-Exit vor der Bestätigung und Abbruch räumen die Aufnahme fail-closed auf. Reale
Windows-/macOS-Cowork-Abnahme bleibt offen.

Der Ergebnisstamm ist gemäß DS-080 eine ausdrückliche geräte- und
produktlokale Benutzereinstellung. Er wird beim Start identitätsgebunden an den
Stapel übernommen und nur über „Ergebnisordner ändern“ gewechselt. Cowork stellt
keinen belastbaren Projektpfad bereit; DataSecure errät ihn nicht und fragt auch
nicht pro Projekt oder Stapel erneut. Liegt das ausdrücklich gewählte Ziel auf
einem Netzlaufwerk, geben Cowork und Standalone einmal einen Hinweis aus, ohne es
zu sperren oder eine weitere Bestätigung zu verlangen. Der Hinweis enthält keinen
Pfad; Standalone benennt zusätzlich die mögliche Übertragung der laufbezogenen
Zuordnungsdatei. Gemäß DS-079 gibt es keine sichtbare
Teilprojektion bereits klarer Positionen in Mischstapeln.

### BL-041 – Claude-Übergabe
Nur verifizierte Markdown-Ergebnisse werden begrenzt übergeben. Reale
Berechtigungs-, Skill- und Hostabnahme bleibt offen.

### BL-043 – Cowork-Fast-Path
Der Normalweg endet nach einem lokalen Start ohne Polling. Ergebnisse werden erst
auf späteren ausdrücklichen Auftrag gelesen. Ein vollständig klarer Stapel öffnet
keinen Reviewdialog; nur echte Mehrdeutigkeiten wechseln in den lokalen
Sammelreview. Nach der einmaligen Ergebnisordnerwahl benötigt jeder weitere reine
Anonymisierungslauf nur noch die Quellauswahl. Die Startantwort wird erst als
Erfolg ausgegeben, nachdem der unabhängige Worker den Empfang der privaten
Intake-Nachricht ausdrücklich bestätigt hat.
Gerät der Stapel in einen fachlichen Reviewzustand, startet derselbe lokale Worker
den vorhandenen Sammelreview unmittelbar. Nur „Später“ oder ein sicherer Fehler
lassen ihn fortsetzbar ruhen; Claude muss keinen zweiten Toolaufruf auslösen.

### BL-044 – Sichere Datei- und Ordnerquellen
Mehrfachauswahl und rekursiver Ordnervertrag sind E0 implementiert; reale Link-/Race-
Gegenproben fehlen.

### BL-047 – Performance und Ressourcensteuerung
Adaptive Vorbereitung ist technisch begrenzt, bleibt bis zu Referenzmessungen im
Produktstandard seriell. Stapel, Speicher und Cowork-Seiten sind begrenzt; große
freigegebene Markdown-Snapshots werden verifiziert und höchstens 64 MiB pro
Handoff-Sitzung gehalten. Lesen, Hashen und Erzeugen des UTF-8-Index erfolgen im
Produktpfad asynchron und größenbegrenzt; ein 6-MiB-Regressionslauf belegt das
Yielding des MCP-Ereignisloops. Referenzmessungen und die Entscheidung über eine
adaptive Parallelisierung bleiben BL-047.1.
Der Replay fehlgeschlagener sichtbarer Exporte ist aus dem MCP-Startpfad entfernt
und zeitlich begrenzt. Ergebnislisten führen keine zweite synchrone Vollhashrunde
aus; die eigentliche Inhaltsübergabe bleibt unverändert vollständig und asynchron
verifiziert.

Ein RC109-Profilinglauf fand eine gemeinsame lokale Kostenstelle vor Parser und
Erkennung: unveränderte private Stammverzeichnisse wurden bei jedem Hilfsaufruf
vollständig neu angelegt und über sämtliche Eltern erneut geprüft. Eine
prozess- und konfigurationsgebundene Verzeichnisidentität führt die vollständige
Reparse-/Cloud-/Netzprüfung nun einmal aus und prüft danach bei jedem Zugriff alle
zurückgegebenen Verzeichnis-Inodes. Ersatz oder Umleitung stoppt weiterhin
fail-closed. Auf demselben Windows-Host sank der echte 100-Dateien-TXT/CSV/DOCX-
Lauf von 149,328 s kalt/191,247 s warm auf 22,085 s/23,532 s; alle 100 Ergebnisse
blieben freigegeben. Das ist ein lokaler Vorher-/Nachhernachweis, keine allgemeine
Hardware- oder Zielhostzusage; die Durability-Fsyncs wurden nicht reduziert.

Fach-, Workflow- und Supportdiagnose schreiben unveränderliche, zufällig benannte
JSON-Einzelereignisse. Damit können Eltern-, Intake- und Reviewprozess parallel
protokollieren, ohne eine gemeinsame JSONL-Datei per Lesen-und-Ersetzen zu
verlieren. Alters- und Mengengrenzen werden auf Datenträgerebene bereinigt;
historische JSONL-Dateien bleiben nur lesbarer Upgradebestand. Ein Diagnosefehler
bleibt ohne Einfluss auf Verarbeitung oder Freigabe.

### BL-049 – Inhalts- und Formatgrenze
Signatur-/Strukturprüfung und drei Anonymisierungsergebnisgrade sind implementiert.
Cowork nimmt XLSX/PPTX nach DS-093 an und anonymisiert ausschließlich deren
lokal extrahierten Markdown-Inhalt; PDF/Scan-PDF und eigenständige Bilder
bleiben dort gesperrt. Standalone verarbeitet DOCX und alle breiten Quellen
nach DS-087/090 Markdown-first und weist Quellenextraktion und Anonymisierung
getrennt aus. Die reine Standalone-Konvertierung besitzt denselben erweiterten
Eingabeumfang mit eigener Extraktions-/Fehlerkennzeichnung. Ein textloses Bild
neben vorhandenem nativen PDF-Text erzeugt keinen `OCR_TEXT_EMPTY`-Gesamtstopp
mehr; wirklich textleere Extraktionen bleiben vor der Anonymisierung gesperrt.

### BL-042 – Diagnose und Berechtigungen
Normal- und Supportoberfläche sind getrennt. Die inhaltsfreie Status-App besitzt
einen reproduzierbaren, vom Aufruf-CWD unabhängigen Offline-Build, DE/EN und einen
Textfallback. Sie zeigt absichtlich nur die einmalige Startantwort, nicht einen
erfundenen späteren Abschluss. Ein echter lokaler Edge-/axe-Lauf prüft alle 14
Sprach-/Zustandskombinationen, die Bridge-Allowlist und 400%-Reflow. Der Pilot
bleibt dennoch standardmäßig aus; echte Cowork-/Screenreader-/Hostabnahme fehlt.

Für konkrete Supportfälle existiert zusätzlich ein separat gebautes Debug-ZIP.
Es ergänzt einen ausschließlich manuell aufrufbaren Debug-Skill, aktiviert den
vorhandenen Supportmodus und schreibt geschlossene JSON-Ereignisse je Prozess als
unveränderliche Einzeldateien. Der normale Build behält zwei Skills und erzeugt
diese zusätzliche Spur nicht. Ein echter Cowork-Supportlauf ist E1-offen.

### BL-050 – Korpus und Qualitätsmetriken
Synthetische Korpora, 2.000 Variationen und lokale Benchmarks bestehen. Reale
Referenzhardwarewerte und kontrollierter Vorher-/Nachhervergleich fehlen.

### BL-051 – Installations- und Hostabnahme
Artefaktprüfungen bestehen lokal. Fresh Install, Marketplace, Update, Rollback und
100-Dateien-/500-MiB-Lauf sind menschlich offen.

### BL-052 – Menschliche Abnahme
Das aktuelle synthetische UAT-Kit ist vorbereitet. Anwender-, IT/Health-IT-,
Datenschutz-, Accessibility- und Architekturfreigaben sind offen.

Die vollständige Vorgeschichte bleibt unter [`docs/archive`](../archive/README.md)
zugänglich und darf diesen Iststand nicht überschreiben.
