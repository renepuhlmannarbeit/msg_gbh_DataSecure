# Aktueller Iststand

Stand: 06.09.2026 · 3.2.0-rc109 · Startseite und laufgebundener Verlauf

## Aktueller Entwicklungsstand RC109

Aktueller Korrekturlauf: [Gesamtreview-Umsetzung](../../tasks/RC109-REVIEW-KORREKTUREN.md)
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

DS-086 / BL-010.29: Standalone startet auf einer kurzen Startseite. Verarbeiten
und Betriebsart sind nicht vorausgewählt. Der Verlauf zeigt die 20 neuesten
Verarbeitungen mit eigenen Ergebnis-, Zuordnungs- und Fortsetzungsaktionen.
Abschluss und Wiederherstellung wechseln weder den Tab noch öffnen sie einen
Ordner automatisch. Die Anzeigegrenze löscht keine älteren Ergebnisse.
Private Laufbindung bleibt über Neustart und Ergebniszielwechsel erhalten;
ein unbekannter oder nicht mehr verfügbarer Lauf fällt nie auf den neuesten zurück.
Quelltests, Edge-/axe-Prüfung und echter Windows-Paket-/Worker-/History-Smoke
stehen grün; nativer Windows-Start mit normalen Hostrechten ebenfalls.
Der lokale Engineering-Kandidat ist
`dist/DataSecure-Standalone-3.2.0-rc109-windows-x64.zip` (110.211.662 Byte,
SHA-256 `807940d1a48846c5de9e898691e45027d934fb84e5b3d64ef7f8031f79d271e1`).
[Review und Nachweisgrenzen](../../tasks/archiv/2026-09-06-rc109-start-verlauf-review.md).
Noch kein commitgebundener RC109-Releasekandidat. Die folgende
PKG-04-/INT-13-Bindung bleibt ausschließlich RC108; sie gilt nicht für RC109.

## Aktueller geprüfter Kandidat

RC108 aus sauberem `main`-Commit
`a742333e8ef80b445729d4bede6a91a2b8f13207` ist an INT-13 gebunden. PKG-04
bestand am 06.09.2026: zwei unabhängige saubere Builds, bytegleiche ZIPs,
Desktop- und Core-Binaries sowie beide echten Paket-/Worker-/Windows-Starttests.
Je Paket wurden beide Modi, elf Konvertierungsergebnisse plus fehlerhafte CSV,
Namenerhaltung, konkrete Laufzuordnung und die optionale Supportspur geprüft.
ZIP: **110.168.168 Byte**, SHA-256
`d1151365ebea6fa92e9d7b546d715e962d8787593707cedabcfb3f703c63b893`.
Receipt und INT-13-Bindung:
`dist/pkg-04/a742333e8ef80b445729d4bede6a91a2b8f13207/`.
Die vollständige Produktsuite (48 Basis-/111 direkte Testdateien), Rust 15/15,
Frontend 18/18, 25 echte Konvertertestgruppen, Dokumentationsgates und Cowork-
Build sind grün. Sichtbare Anwenderabnahme und native Mac-Pakete bleiben offen;
der Windows-Pilot ist keine allgemeine Layout-/OCR-Vollständigkeitsgarantie.

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
Nachrichten, v5-Journal, `dm_`-Store, Recovery und v3-Export verbunden. Es gibt
keine PII-Ersetzung, keinen Pseudonymseed und keinen PII-Review. Dateien wählen
oder hineinziehen, starten, Ergebnisse öffnen. Namen und Inhalte bleiben erhalten;
Ausgaben und Zuordnung liegen getrennt unter `DataSecure-Markdown/Lauf-…`.
Text-/OCR-/Coverage-Hinweise werden ohne Zusatzdialog gespeichert; schlechte oder
geschützte Dateien erhalten Fehlerpositionen, der übrige Stapel läuft weiter.
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

Neue Standalone-Läufe führen auch gestoppte Quellen mit festem Fehlercode in
ihrer eigenen Zuordnung. Der aktuelle Laufresolver fällt niemals auf frühere
Ergebnisse zurück. Bereits veröffentlichte Altzuordnungen bleiben unverändert;
ein leeres Altrecord ohne veröffentlichte Dateien kann seine fehlende Übersicht
nachliefern. Cowork erhält weder diese Zuordnungen noch Quelldateinamen.
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
  und DOCX sind freigegeben; XLSX, PPTX, PDF, Scan-PDF und eigenständige Bilder
  bleiben für diesen Zweck sicher gesperrt.
- Reine Standalone-Konvertierung: zusätzlich XLSX, PPTX, PDF/Scan-PDF sowie
  PNG/JPEG/BMP im Produktpfad aktiviert. Extraktionshinweise und Fehler bleiben
  laufbezogen sichtbar. Der Windows-Engineering-Paketnachweis ist an den oben
  genannten RC108-Commit gebunden; Zielhost-/Anwenderfreigabe bleibt offen.
- Stapel: höchstens 100 Dateien und 500 MiB; nur ein aktiver Stapel.
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
  Standalone projiziert in beiden Betriebsarten nach vollständigem Abschluss
  eine atomar erzeugte `DataSecure-Zuordnung.csv` in genau den sichtbaren
  Laufordner: anonymisiert unter `DataSecure-Output`, reine Konvertate mit
  Originalinhalten unter `DataSecure-Markdown`.
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
einem terminalen sichtbaren Ergebnis. Seit RC107 besitzt auch ein vollständig
gestoppter Standalone-Lauf eine eigene Übersicht mit Quellen und festen
Fehlercodes, aber keine anonymisierten Ergebnisdateien. Scheitert nur die
Abschlussübersicht, bleibt die Anzeige ausdrücklich `export_pending`, ohne
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
Seit DS-086 besitzt Standalone die drei Hauptansichten **Start**,
**Verarbeiten** und **Verlauf**. Die App startet auf **Start** ohne vorbelegte
Betriebsart. Auswahl, Wiederherstellung und Abschluss ändern die Navigation
nicht automatisch. **Verlauf** zeigt die 20 neuesten Verarbeitungen mit
Datum, Zweck, Zählern und Status. Ergebnisordner, Zuordnung und Fortsetzung
gehören jeweils ausschließlich zur gewählten Zeile. Der Core löst dafür den
exakten sichtbaren `Lauf-*`-Ordner beziehungsweise dessen Mappingdatei auf;
ein fehlendes Ziel führt nicht zum Öffnen eines anderen Laufs.
Nur der vertrauenswürdige Rust-Host erhält dieses Ziel über den privaten
Längenframe; der Renderer erhält aus der Öffnungsaktion weiterhin keinen Pfad.
Rust validiert Existenz, absoluten Pfad, Typ und Linkfreiheit und startet danach
Explorer, Finder oder `xdg-open` ohne versteckte Fensteroption. Die Oberfläche
bestätigt den Handoff getrennt vom fachlichen Abschlussstatus. Die Diagnose
protokolliert dabei ausschließlich Aktion, Ausgang und festen Fehlercode,
niemals Pfad, Dateiname oder Inhalt. Ein Standalone-Lauf gilt erst dann als sichtbar abgeschlossen, wenn
alle neutralen Markdown-Ergebnisse und seine atomar veröffentlichte
`DataSecure-Zuordnung.csv` vorhanden sind. Die Zuordnung enthält nur die lokale
Quellbezeichnung und den neutralen Ergebnisnamen. Eine Ergänzung noch
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
(`signingIdentity: "-"`); native Builds und Gatekeeper-UAT auf Intel und Apple
Silicon bleiben offen.
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
und unterstützt auch XLSX, PPTX, PDF/Scan-PDF sowie PNG/JPEG/BMP. Diese Formate
bleiben ausschließlich für die Anonymisierung gesperrt. Architektur,
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
Interoperabilitätsfixtures sowie die vollständige Kommentarabdeckung. XLSX und PPTX bleiben für die Anonymisierung
gesperrt; die reine Standalone-Konvertierung verarbeitet sie bereits mit
kenntlich gemachten Extraktionsgrenzen. Breiter Office-Korpus und
Zielhost-/Fachabnahme bleiben offen.

### BL-023 – PDF-Risikogate
PDF und Scan-PDF bleiben für die Anonymisierung ohne vollständige Pflichtmatrix
sicher gesperrt. Die reine Standalone-Konvertierung verwendet bereits den
gebündelten Offline-PDF-/OCR-Pfad; dessen Hinweise sind keine Erweiterung der
Anonymisierungsfreigabe. Zielhost-/Fachabnahme bleibt offen.

### BL-024 – OCR und Rasterbilder
Engineering-Komponenten und Harnesses existieren. Der Portable-Engineering-Build
übernimmt das verifizierte Universal-OCR-Bundle vollständig; dessen geschlossenes
Manifest und Inventar, Modi, Hashes, Installationspfade mit Leerzeichen sowie
Adapter-Timeout und laufender Abbruch sind E0-geprüft. Für die reine
Standalone-Konvertierung sind Offline-OCR und PNG/JPEG/BMP integriert und im
oben gebundenen RC108-Windows-Paket Ende zu Ende geprüft. Native Mac-Pakete und
Zielhost-/Fachabnahme bleiben offen. Für die Anonymisierung sind eigenständige
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
nicht pro Projekt oder Stapel erneut. Gemäß DS-079 gibt es keine sichtbare
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
Signatur-/Strukturprüfung und drei Anonymisierungsergebnisgrade sind implementiert;
XLSX/PPTX/PDF/Scan-PDF und eigenständige Bilder bleiben für die Anonymisierung
gesperrt. Die reine Standalone-Konvertierung besitzt den oben beschriebenen
erweiterten Formatumfang mit eigener Extraktions-/Fehlerkennzeichnung.

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
