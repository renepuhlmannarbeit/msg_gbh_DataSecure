# DataSecure Standalone auf macOS starten

Anleitung für das beiliegende macOS-Testpaket. Version, Build-ID und
Architektur stehen im App-Fuß und in `STANDALONE-MANIFEST.json`.
ZIP oder DMG mit der jeweils passenden Prüfsumme desselben Releases oder
Engineering-Artefakts verwenden. Diese Anleitung beweist keine erfolgreiche
Abnahme eines neu gebauten Pakets. Das Testpaket ist ad-hoc-signiert,
nicht mit Apple Developer ID signiert oder notarisiert. Native technische
Runner-Prüfungen ersetzen keine Finder-/Gatekeeper-/VoiceOver-/Bedienabnahme.

**Orientierung der gemeinsamen Oberfläche:** **Neue Verarbeitung** dient zur
Vorbereitung, **Verlauf** zeigt kompakte frühere Läufe. Nach dem Start oder
Öffnen eines Laufs erscheint **Laufdetails** mit seiner Kennung. Dort sind
Übersicht, Prüfung und Dokumente eindeutig diesem Lauf zugeordnet; ein
Reiterwechsel erteilt weder Freigabe noch Exportauftrag. Abschluss und
Hinweise bleiben sichtbar, ausführliche Erklärungen sind aufklappbar.
Ergebnisordner und Hinweise sind direkt erreichbar; vertrauliche Zuordnungen
sind als optionale, nicht zur Weitergabe bestimmte Angaben gruppiert. Diese gemeinsame
UI-Beschreibung ersetzt nicht den noch offenen nativen Mac-Nachweis.
Nach einem gestarteten Lauf ist dessen Dateiauswahl verbraucht. Eine noch nicht
gestartete neue Auswahl bleibt beim bloßen Reiterwechsel erhalten. Abgeschlossene
Läufe lassen sich über **Weitere Aktionen → Aus Verlauf ausblenden** aus der
normalen Liste entfernen; Dateien, Ergebnisse und Zuordnungen bleiben bestehen.
**Ausgeblendete Läufe anzeigen** macht sie wieder erreichbar. Offene Vorgänge
und einige Alteinträge ohne ausreichende Laufmetadaten sind geschützt.
Start-Recovery und Aufbewahrungsprüfung bleiben aktiv; die vollständige
Verlaufsliste wird nicht automatisch beim Start geöffnet.

**Bekannter Mac-26.2/M2-Prüfstopp:** Der Core von RC161 endete auf diesem
Zielhost bei ZIP und DMG 16-mal vor seiner Bereitschaft mit Signal 5
(`SIGTRAP`). RC162 ergänzte das benötigte JIT-Entitlement des gehärteten
Node-Core; damit ist die Ursache des M2-Traps noch nicht bewiesen. Im aktuellen
Paketentwurf bleibt die Rust-Oberfläche ohne JIT-Ausnahme; der statische
Produkt-Core erhält ausschließlich `allow-jit`. Der getrennte offizielle
Konverter-Node besitzt seine gepinnten Hersteller-Entitlements, darunter
ebenfalls `allow-jit` sowie `disable-library-validation`. Das ist keine
zusätzliche Ausnahme für den Produkt-Core und keine Dateizugriffsberechtigung.
Ein Test auf genau dem betroffenen M2 steht noch aus; RC162 ist deshalb
**nicht als dort funktionsfähig abgenommen**. Der neue Stand protokolliert
zusätzlich zwei inhaltsfreie, einmalige Startproben, falls der Core wieder
vor Ready mit `SIGTRAP` endet. Das Kopieren
der App in den eigenen Nutzerordner verlangt normalerweise
keine Administratorrechte. Eine gesperrte Terminal-App ist für die normalen
Datei-/Ordnerbuttons keine Voraussetzung. Beide Aussagen sind keine
Umgehungsempfehlung für Organisationsrichtlinien.

Für die nächste gemeinsame M2-Probe ein neu erzeugtes ARM-Testpaket aus
demselben Quellen-Freeze wie die Windows-Testversion verwenden, nicht ein
unverändertes älteres Paket. Im Fuß der Anwendung die kurze Build-ID und die
tatsächlich laufende Architektur (ARM64 oder Intel) notieren.
Nur eine Paketvariante in einem eigenen Testordner starten und zunächst
synthetische Testdateien verwenden. Wenn schon die Verbindung fehlt,
„Diagnose öffnen“ wählen und alle `desktop-interactions*.jsonl` sowie
vorhandene `sidecar-interactions*.jsonl` aus diesem Diagnoseordner
weitergeben. Fehlt die zweite Art, ausdrücklich „fehlt“ melden; nicht auf
einen fehlenden Crashbericht als Entwarnung schließen. Falls die App
„automatische Verbindungsversuche angehalten“ meldet, nach Sicherung der
Diagnose einmal „Verbindung und Laufstatus prüfen“ wählen. Die Diagnose enthält
beim frühen Trap die festen Phasen `core_probe_node` und gegebenenfalls
`core_probe_preloader`; diese prüfen nur den gebündelten Core, nicht Dateien.
Keine erneute
Verarbeitung oder Exportaktion aus einem unbestätigten Status ableiten.
Schlägt schon der Start des lokalen Core auf einem verwalteten Mac fehl,
die IT um eine zeitpunktbezogene Prüfung der Ausführungsrichtlinien bitten;
keine Gatekeeper- oder Endpoint-Schutzfunktion deaktivieren.

### Welche Zugriffe die App tatsächlich braucht

Die App läuft als normaler angemeldeter Benutzer. Für das Starten einer
Finder-Kopie im eigenen Nutzerordner und die normale Verarbeitung ist kein
Administratorbetrieb vorgesehen. Xcode, make, ein installiertes Node.js und
eine freigeschaltete Terminal-App sind keine Installationsvoraussetzungen.
Die App startet aber gebündelte Verarbeitungs-/Konverterprozesse und fragt
zur sicheren Prozesszuordnung `/bin/ps` ab. Eine IT-Richtlinie, die solche
Prozesse sperrt, kann die Verarbeitung verhindern; das ist nicht dasselbe wie
eine nur gesperrte Terminal-App. Neue feste `PROCESS_IDENTITY_*`-Fehlercodes
unterscheiden verweigerte, fehlende, verspätete und ungültige Prozessabfragen,
ohne Prozessdaten oder Systemfehlermeldungen in die Diagnose zu übernehmen.

Interne Arbeitsdaten liegen unter
`~/Library/Application Support/SecureDataMsg-Standalone`, nicht im App-Paket.
Dieser private Bereich benötigt lokalen APFS-/HFS-Speicher und sichere
Eigentümer-/Zugriffsverhältnisse. Ein freigegebenes Netzwerk-Home, fremde
Schreibrechte oder umgeleitete interne Ordner können deshalb bewusst
abgewiesen werden. Die App repariert solche Rechte nicht ungefragt.

Für ausgewählte Eingaben braucht die App Leserechte, für den Ergebnisordner
Schreibrechte. macOS kann für Dokumente, Schreibtisch oder Downloads eine
gesonderte Zustimmung verlangen. Der erste noch nicht vorhandene
Standard-Ergebnisordner wird erst beim ausdrücklichen Start angelegt;
eine verweigerte Anlage wird als `STANDALONE_RESULT_ROOT_UNAVAILABLE`
gemeldet. Bereits gespeicherte, unzugängliche Speicherorte können auch eine
frühe Sicherheitsprüfung verhindern. Eine Developer-ID-Signatur würde diese
Dateirechte oder Datenschutz-Zustimmungen nicht ersetzen. Für den normalen
Weg sind weder pauschaler Festplattenvollzugriff noch Bedienungshilfen- oder
Bildschirmaufnahme-Rechte vorgesehen. Ein lokales ad-hoc-Seal ist jedoch
keine Developer-ID/Notarisierung: Erstöffnungs- und Organisationssperren
bleiben auf dem tatsächlichen Mac gesondert zu prüfen.
Bei wechselnden ad-hoc-Testbuilds kann macOS Datenschutz-Zustimmungen erneut
verlangen, weil eine versionsübergreifend stabile Entwickleridentität fehlt.
Die Hilfsprozesse müssen für macOS außerdem der gestarteten App zuordenbar
bleiben. Deshalb gehört eine echte Finder-Probe mit Dateien-/Ordnerzustimmung
und deren Ablehnung zur Abnahme; ein Headless-Runner ersetzt diese nicht.

## Verarbeitung und Prüfung

Die folgenden manuellen Prüfschritte gelten für **Selbst entscheiden**, die
vorausgewählte Option unter **Umgang mit unklaren Fundstellen**. Die App
anonymisiert auch dabei automatisch und fragt bei unklaren Fundstellen nach.
Vor einem neuen Anonymisierungslauf kannst du stattdessen ausdrücklich
**Automatisch maskieren** (bisher Schnellweg: automatisch anonymisieren und freigeben) wählen. Bekannte
mehrdeutige Fundstellen und erkannte OCR-Kontaktbereiche werden dann maskiert,
nicht als richtig erkannt bestätigt. Erstellte unveränderte Basisstände
erhalten eine gekennzeichnete automatische Erstfreigabe, keine menschliche
Prüfung. Nicht lesbare oder technisch nicht sicher prüfbare Dateien werden
mit Grund ausgelassen. Spätere Änderungen und Widerrufe werden nicht beim
Laden automatisch wieder freigegeben. Im neuen normalen Ablauf werden fertige
Dateien ohne zusätzliche Exportbestätigung bereitgestellt. Automatik ist keine Anonymitätsgarantie.

**Text aus Bildern und Scans lesen (OCR)** ist eine davon unabhängige Option
für beide Abläufe. Alle vier Kombinationen bleiben möglich; die technischen
Schutzprüfungen sind unverändert. Datei- und Ordnerlabels nennen bekannten
OCR-Bedarf einschließlich Unterordnern auch bei zugeklapptem Inhalt.
Bei Markdown-Konvertierung stehen optionale Kopierbelege in
**Ausführliche Laufdetails**; **Kopierstatus aktualisieren** liest den Status,
während **Nachkorrektur öffnen (optional)** die Textbearbeitung öffnet.

Für neue anonymisierte Ergebnisdateien sind neutrale Namen empfohlen.
Alternativ **Originalname mit „-anonymisiert“** wählen, wenn die Namen keine
sensiblen Angaben enthalten. Diese Wahl gilt nur für diesen neuen Lauf;
spätere Exporte erhalten immer neutrale Namen. Unterordner und die
vertrauliche Zuordnung können Originalnamen enthalten.

1. Nach der Installation unter **Neue Verarbeitung** zuerst **Nur umwandeln**
   oder **Umwandeln und anonymisieren** wählen. Dateien/Ordner hinzufügen,
   gewünschte Dateien anhaken und das Ergebnisziel kontrollieren.
   **Verarbeitung starten** beginnt höchstens 200 Dateien / 500 MB.
   Auswahl oder Drag-and-drop allein startet nichts.
2. **Jetzt prüfen** öffnet die Fundstellen dieses Laufs. Checkboxen wählen nur
   aus. Gemeinsame Behandlungen sind zunächst vorgemerkt; erst **Gruppe
   übergeben und weiter** speichert die vollständig bearbeitete Gruppe.
   Offen-Filter, weitere Seiten und Folgegruppen beachten. Original-/Markdown-
   Vergleich und OCR-Originalbildausschnitt gehören zum angezeigten Punkt.
   Personen- und Unternehmensentscheidungen bleiben unterscheidbar.
3. Nach bestätigtem Fundstellenabschluss kehrst du zu den **Laufdetails desselben
   Laufs** zurück. Die Maskierungen sind bereits angewendet; eine zusätzliche
   Dokumentauswahl, Pflichtfreigabe oder Exportbestätigung entfällt.
4. Nach bestätigter technischer Bereitstellung **Ergebnisordner öffnen** wählen.
   Neue fertige MD-Ordner enthalten keine Originale, Identitäts-/Dateizuordnung,
   privaten Prüfstände oder von DataSecure erzeugten technischen Begleitdateien.
   Finder kann zusätzliche `.DS_Store`-Anzeige-Metadaten anlegen. Diese sind
   nicht geprüft oder anonymisiert und gehören nicht zur Weitergabe: im Finder
   nur die gewünschten Markdown-Dateien auswählen, nicht ungeprüft den gesamten
   Ordner verpacken. Die MD sind auch ohne KI verwendbar. DataSecure lädt nichts hoch.
   Bei alten Laufordnern können vertrauliche Beilagen erhalten sein; diese nicht
   rückwirkend als neue bereinigte Ausgabe ansehen. Technische Prüfungen bleiben.
5. **Lauf abgeschlossen – mit Hinweisen** ist ebenfalls abgeschlossen.
   Gelbe Hinweise öffnen keinen fertigen Lauf wieder. Eine optionale
   Nachbearbeitung speichert die Revision und stellt automatisch den vollständigen
   aktuellen Ergebnisstand bereit. Erst nach Bestätigung führt der Ordneröffner
   auf den neuen Stand; ältere Stände bleiben erhalten. Bei verlorener Bestätigung
   denselben Vorgang abgleichen, nicht neu verarbeiten. Diagnose ist kein Pflichtabschluss.
6. **Später entscheiden**, Pause und Fortsetzung gehören zum konkreten Lauf.
   Der Verlauf berücksichtigt nur die letzten 5 Verarbeitungen. Über **Laufdetails** die spätere
   Dokumentprüfung öffnen.
   Neue Dateien gehören nach dem Start in eine neue Verarbeitung.
   Verbindungsverlust wiederholt Entscheidungen und Exportbestätigungen nicht blind.

Der gespeicherte Ergebnisordner wird für die Bereitstellung wiederverwendet,
wenn ursprüngliche Identität und macOS-Zugriff passen. Dafür ist keine
Developer-ID-Signierung oder Notarisierung vorgesehen. Lokales Ad-hoc-Sealing
ist davon getrennt. macOS kann trotzdem Zugriff auf Documents/Downloads/Desktop
verweigern oder eine Zustimmung verlangen; die App umgeht diese Rechte nicht.
Bei fehlendem, ersetztem oder verweigertem Ziel ist eine erneute bewusste
Ordnerwahl nötig, ohne alte Exporte zu verschieben. Keine globale Schutzfunktion
abschalten. Ein gespeicherter Pfad allein ist keine Zugriffsberechtigung.

Bei reiner Umwandlung bleiben Originalinhalte erhalten.
**Markdown nachkorrigieren** bietet die spätere Korrektur; ein solcher
Markdown-Export ist ausdrücklich **nicht anonymisiert**. Neun rohe OCR-E-Mail-
Abweichungen bleiben im synthetischen Qualitätskorpus bekannte Warnungen.
Fehlerdateien werden lokal mit Namen, Fehlercode und nächstem Schritt angezeigt;
Diagnoseprotokolle enthalten keine Namen, Pfade oder Dokumentinhalte.
Originale und vertrauliche Identitätszuordnungen werden nicht automatisch gelöscht.

## Historische technische Nachweise

RC157: Die beiden nativen Mac-Jobs aus Commit
`111737d28021b6989ffe8d563b58daa9cbae610f`
[sind bestanden](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36770900387).
Diese Evidence gehört zu RC157, nicht zum neuen RC159-Paket.

Historischer RC142-Nachweis: Die beiden nativen Mac-Jobs aus Commit
`c0ddd11ecf366d32ff9962bfeffc6519b01a8c5d` [bestanden ebenfalls](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/36562812021);
ZIP und zusätzlich DMG wurden im [RC142-Release](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc142)
bereitgestellt.

Historischer RC141-Nachweis:
Status: Die veröffentlichten RC141-ZIPs aus Commit
`1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542` bestehen den nativen Intel-/ARM-Lauf
[`35875613438`](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/actions/runs/35875613438)
einschließlich Signaturen, Mindestversionen sämtlicher nativer Komponenten,
direktem/LaunchServices-Start, Konvertierung, Anonymisierung und Verlauf.
[Exakte ZIP-Hashes und Nachweisgrenzen](../../docs/REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).
Die ZIPs samt Prüfsummen sind im
[dauerhaften RC141-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)
verfügbar und lokal gesichert. Browser-/Finder-/Gatekeeper-Installation und eine
tatsächliche Ausführung auf macOS 13.5 bleiben offen.

Historischer Vergleich: Die RC140-ZIPs aus Commit `814bc50e3d754224cd95b6fa91f122dd45f48487`
sind auf echten Intel- und Apple-Silicon-Runnern zweimal bytegleich gebaut,
einzeln auf Signatur und Architektur geprüft sowie entpackt mit echten
Konvertierungen über die private IPC-Grenze gestartet. Ein
Browser-Download mit Finder-Entpackung, Kopie nach Programme, LaunchServices
und Gatekeeper wurde damit noch nicht nachgewiesen. Die Runner verwenden
macOS 14/15. **Der erneute Byte-Review hat einen Fehler im RC140-Paketvertrag
bewiesen:** Der POSIX-Helfer verlangt Intel macOS 15.0 bzw. ARM macOS 14.0,
obwohl die App macOS 13.5 deklariert. RC140 deshalb nicht auf 13.5 einsetzen.
RC141 korrigiert das Deployment-Target, native Signaturen und numerische
App-Metadaten; die veröffentlichten RC140-ZIPs enthalten diese Korrekturen nicht.
Die sichtbare menschliche Abnahme bleibt offen.

## Diagnose ohne geladene Oberfläche

DS-109 ist im RC159-Quellstand enthalten. DataSecure kann den inhaltsfreien Diagnoseordner vor der WebView-Initialisierung mit
`--startup-diagnostics` öffnen. Im Terminal den ausführbaren App-Inhalt
`"/Applications/DataSecure Standalone.app/Contents/MacOS/datasecure-standalone" --startup-diagnostics`
starten; bei anderem Installationsort den App-Pfad entsprechend wählen.
Ein Startbericht nennt einen festen System-/Paketfehlercode ohne Dokumentinhalt.
Wird schon der Prozessstart von macOS blockiert, kann die App selbst keinen
Bericht erzeugen. Die macOS-Meldung mit der IT prüfen; Gatekeeper oder andere
Schutzfunktionen nicht pauschal deaktivieren. Diese Diagnosefunktion ist keine
neue native Mac-Bedienabnahme.

## Kostenkontrollierter technischer Vorlauf

Der GitHub-Workflow **Manual Standalone macOS sandbox evidence** kann auf echten
GitHub-macOS-Runnern getrennt für Intel und Apple Silicon ausgeführt werden. Er
ist ausschließlich manuell startbar und verlangt vor Runner-Zuteilung die
Bestätigung, dass ein privates Repository enthaltene macOS-Minuten verbrauchen
oder darüber hinaus Kosten auslösen kann. Ein einzelnes Ziel oder `both` darf
erst nach einer ausdrücklichen Budgetentscheidung gestartet werden.

Der Workflow baut und prüft die gepinnte Laufzeit, den nativen POSIX-
Supervisor, die Standalone- und echten Konverterverträge, Rust/Clippy sowie das
native Tauri-Release-Binary. Er verwendet keine Secrets oder persistenten
Abhängigkeits-Caches. Ein Paket-Upload ist standardmäßig
ausgeschaltet. Wird `upload_package` ausdrücklich aktiviert, lädt der Workflow
das verifizierte ZIP und DMG samt SHA-256-Dateien mit einem Tag Aufbewahrung hoch.
Das Archiv wird zweimal bytegleich erzeugt, geprüft, entpackt, erneut auf
Signatur und Architektur geprüft. Der überarbeitete Workflow prüft zusätzlich
die tatsächlich eingebettete Mindestversion und Systembibliotheken **aller**
Mach-O-Dateien einschließlich des Canvas-Addons. Er startet die entpackte App
direkt sowie über LaunchServices und prüft Konvertierung, Anonymisierung,
Zuordnung, Fehlerfälle und Verlauf mit der gebündelten Runtime. Diese neuen
Gates bestehen für RC141, RC142, RC151 und RC157 auf Intel und ARM aus ihren jeweils gebundenen
Commits. Das ersetzt nicht die nachfolgende sichtbare
Finder-/Gatekeeper-/Picker-/VoiceOver-/Anwenderabnahme.

Der DMG-Weg ist ein zusätzlicher, in RC142, RC151 und RC157 nativ belegter Installationsweg:
DMG öffnen und die enthaltene App auf **Programme** ziehen. Er enthält dieselbe
App wie das ZIP und wurde vor Bereitstellung separat auf Integrität, Signatur,
Start und Architektur geprüft. Ein DMG allein behebt jedoch keine
Gatekeeper-Sperre. Solange Developer-ID-Signatur und Apple-Notarisierung fehlen,
bleibt auch der DMG ein ad-hoc-signiertes internes Pilotpaket; die unten
beschriebene app-spezifische Freigabe kann weiterhin nötig sein.

Maßgebliche Herstellerhinweise:
[GitHub-gehostete Runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Actions-Abrechnung](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[Budgets und harte Ausgabenlimits](https://docs.github.com/en/billing/how-tos/set-up-budgets)
und [Tauri-Builds mit GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/).

## Passendes Paket

Apple Silicon (M1, M2 oder neuer) verwendet **macos-arm64**, Intel-Macs
**macos-x64**. Eine Intel-App unter Rosetta ersetzt weder einen ARM-Test noch
einen echten Intel-Test. Die folgenden RC162-Links sind **historische
Downloadreferenzen**, nicht das neue Entwicklungspaket oder dessen Abnahme:

- Intel-Mac: [RC162-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc162/DataSecure-Standalone-3.2.0-rc162-macos-x64.zip)
  oder [RC162-DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc162/DataSecure-Standalone-3.2.0-rc162-macos-x64.dmg),
  jeweils mit gleichnamiger `.sha256` auf der Release-Seite.
- Apple Silicon (M1 oder neuer):
  [RC162-ZIP](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc162/DataSecure-Standalone-3.2.0-rc162-macos-arm64.zip)
  oder [RC162-DMG](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/download/v3.2.0-rc162/DataSecure-Standalone-3.2.0-rc162-macos-arm64.dmg),
  jeweils mit gleichnamiger `.sha256` auf der Release-Seite.
- Historische RC140-ZIPs: Intel mindestens macOS 15, ARM mindestens macOS 14.
- Deklarierter Binärvertrag: macOS 13.5 für beide Architekturen.
  Die Paketgates laufen auf macOS 15 (Intel) und macOS 26 (ARM);
  die Zielhost-Abnahme auf M2/macOS 26.2 und macOS 13.5 bleibt offen.

Node, PDF-Parser, Canvas-Bilddecoder, Tesseract-WASM und deutsche/englische
OCR-Modelle sind enthalten. Anwender installieren weder Rust/Xcode noch Node,
Python, Homebrew, LibreOffice oder ein eigenes Tesseract. Die Laufzeitprüfung
der RC140-/RC141-/RC142-/RC151-Pakete fand nur macOS-Systembibliotheken als native Ladeabhängigkeiten.
Ein fehlendes Build-Tool ist deshalb keine Erklärung für einen Endanwenderfehler.

Das ZIP enthält einen Ordner
`DataSecure-Standalone-<Version>-macos-<Architektur>` mit der App,
`SHA256SUMS`, SBOM und Lizenznachweisen. Die Prüfsumme des **gesamten ZIPs**
steht in `<ZIP-Name>.sha256` aus demselben Release beziehungsweise Engineering-Artefakt.
Beide Dateien im selben Ordner ablegen und vor dem Entpacken im Terminal prüfen,
zum Beispiel für Apple Silicon:

```sh
cd ~/Downloads
shasum -a 256 -c DataSecure-Standalone-3.2.0-rc162-macos-arm64.zip.sha256
```

Nur bei `OK` fortfahren. Den Versions- und Architekturnamen im Befehl an die
tatsächlich heruntergeladenen Dateien anpassen. Die interne `SHA256SUMS` ist
kein Ersatz für diese Prüfung des heruntergeladenen ZIPs.

## Installation eines ad-hoc-signierten internen Pilotpakets

Beim **DMG** die passende `.dmg` und `.dmg.sha256` gemeinsam herunterladen,
analog die Prüfsumme kontrollieren, das DMG im Finder öffnen und die sichtbare
`DataSecure Standalone.app` auf **Programme** oder für die isolierte Neuprobe
in einen eigenen Benutzer-Testordner ziehen. Danach das DMG auswerfen.
Beim **ZIP** gelten die folgenden Schritte 1–2. Ab Schritt 3 ist der Weg für
beide Pakete gleich:

1. Das passende ZIP im Finder öffnen und den darin enthaltenen Ordner
   `DataSecure-Standalone-<Version>-macos-<Architektur>` öffnen.
2. **Nur** `DataSecure Standalone.app` aus diesem Ordner nach **Programme**
   oder für die isolierte M2-Neuprobe in einen eigenen Benutzer-Testordner
   ziehen; die App nicht direkt aus dem ZIP oder Downloads starten und keine
   ältere RC161-App damit überschreiben.
3. Die App einmal normal öffnen.
4. Nur wenn macOS wegen des nicht identifizierten Entwicklers oder der fehlenden
   Notarisierung blockiert und die Quelle samt Prüfsumme verifiziert wurde:
   **Systemeinstellungen → Datenschutz & Sicherheit** öffnen und bei
   DataSecure **Dennoch öffnen** wählen. Diese Option erscheint erst nach dem
   gescheiterten Öffnungsversuch und nur begrenzte Zeit (etwa eine Stunde).
5. Die erneute Rückfrage mit **Öffnen** bestätigen; gegebenenfalls das
   Mac-Anmeldepasswort eingeben.

Danach lässt sich die App vom gewählten Ort starten.
Die Ausnahme gilt nur für diese App. Gatekeeper darf weder global abgeschaltet
noch mit `xattr`- oder `spctl`-Befehlen umgangen werden. Auf verwalteten Macs
kann die Organisation das Öffnen nicht freigegebener Apps unterbinden.

Falls macOS **„beschädigt“** oder eine **Schadsoftwarewarnung** meldet, nicht
„Dennoch öffnen“ erzwingen: Prüfsumme und richtiges Architekturpaket erneut
kontrollieren und den genauen Wortlaut mit macOS-Version und `uname -m` für
die UAT notieren. Dasselbe gilt, wenn die App nach dem Öffnen sofort schließt;
ein bestandener Runner-IPC-Test ersetzt keinen sichtbaren Start auf dem Mac.

Das Pilotpaket wird beim nativen macOS-Build ohne Apple-Zertifikat ausdrücklich
ad-hoc signiert (`signingIdentity: "-"`), aber nicht notariell beglaubigt. Diese
kostenfreie technische Signatur ersetzt weder Developer-ID-Signierung noch
Notarisierung und kann die Gatekeeper-Rückfrage deshalb nicht vermeiden. Der
Weg bleibt ein interner Pilot, dessen tatsächliche Installierbarkeit pro
Zielhost erst im N3-Test belegt wird. Für eine reibungsarme breite Verteilung
ist Developer-ID-Signierung mit Notarisierung der vorgesehene Weg; eine
ad-hoc-Signatur ist dafür kein Ersatz. Ohne diese Voraussetzungen nicht als
einfach installierbare macOS-Version bewerben.

## Zielhost-Abnahme

Bei Start-/Exportproblemen unter **Einstellungen** oder in der Fehlerhilfe
**Diagnosepaket speichern** wählen. Die Funktion ist ohne Core-Verbindung
erreichbar und kein notwendiger Export- oder Abschlussschritt. Einen neuen
lokalen JSON-Dateinamen wählen. Es erfolgt kein Upload; Dokumentinhalte,
Dateinamen und Quellpfade gehören nicht ins Diagnosepaket. Fehlende, gekürzte
oder verworfene Protokolle sind gekennzeichnet. Die Diagnose ist bestmöglich,
kein lückenloses Auditprotokoll und kein Beweis eines Exportabschlusses.

Ein fehlender Ergebnisordner bei der Erstinstallation ist kein bestätigter
Core-Absturzgrund. Ein nicht verfügbares Ziel bewusst ändern. macOS kann für
geschützte Ordner wie „Dokumente“ eine Erlaubnis verlangen. Eine Ablehnung
oder die Sperre separater nativer Prozesse mit der IT klären, nicht umgehen.

Die Freigabe erfordert je einen nativen Lauf auf Intel und Apple Silicon:

- echter Browser-Download beider Release-Dateien, externe ZIP-Prüfsumme,
  Finder-Entpackung samt Paket-Unterordner, Kopie nach Programme und
  Gatekeeper-Ablauf (oder dessen genaue Blockiermeldung);
- **Neue Verarbeitung** ohne vorbelegte Aufgabe; Auswahl/Drag-and-drop
  verarbeitet nichts, erst **Verarbeitung starten** beginnt den Lauf;
- Mehrfachauswahl, rekursive Ordneraufnahme und Katalogcheckboxen; bis 200
  Dateien / 500 MB verarbeiten, Auswahl abbrechen ohne Verlust vorhandener Quellen;
- nicht unterstützte Quellen und gestoppte Dateien mit Namen, Endung,
  Fehlercode und nächstem Schritt lokal anzeigen, ohne Namen in der Diagnose;
- Fortschritt, Pause an Dateigrenzen und Fortsetzung desselben Laufs; neue
  Verarbeitung erhält eine eigene Auswahl und verändert frühere Läufe nicht;
- **Nur umwandeln** für TXT, Markdown, CSV, DOCX, XLSX, PPTX, Text-/Scan-PDF und
  PNG/JPEG/BMP; Originalinhalte erhalten, optionale OCR-Kontaktprüfung,
  Markdown-Nachkorrektur ohne Dateizuordnung oder Anonymisierungsbehauptung;
- **Umwandeln und anonymisieren**: breite Quellen Markdown-first; getrennte
  Extraktions-/Anonymisierungsstatus, neutrale Ergebnisnamen, Personen/Firmen;
- Sammelbehandlung zunächst vorgemerkt, vollständige Gruppenübergabe,
  Folgeschritte im selben Prüffenster, Vertagen/Neustart/Fortsetzen;
- nach Fundstellenabschluss direkt Dokumentprüfung desselben Laufs; Freigaben
  nur für ausdrücklich gewählte aktuelle Dokumentstände;
- getrennter bestätigter Export in einen normalen Ordner ohne Originale,
  Zuordnungen oder private Prüfstände; Änderungen widerrufen betroffene Freigaben;
- große lokale Prüfgruppen und verständliche technische Fehler; Dialogfehler
  dürfen nicht als Benutzerentscheidung „Später“ erscheinen;
- Verlauf mit höchstens 5 laufgebundenen Karten; alle Aktionen gehören zum
  gewählten Lauf, keine Bestätigung allein durch Status-Momentaufnahmen;
- falsches Architekturpaket stoppt verständlich;
- keine Rosetta-Pflicht auf Apple Silicon;
- Offline-Lauf, VoiceOver, Tastatur, Zoom, Fokus und Dark Mode;
- Kaltstart p50/p95, Arbeitsspeicher und Paketgröße erfassen;
- App ersetzen, zurückrollen und entfernen, ohne Nutzer- oder Plugin-Daten zu
  löschen oder zu verändern.

Ein ARM-Lauf unter Rosetta ersetzt den echten Intel-Nachweis nicht.

Für die Zwei-Personen-Abnahme vor der Installation `uname -m` ausführen und die
tatsächliche Architektur in der macOS-Spur des
[N3/N4-Testplans](../../docs/acceptance/FORMAL_UAT/README.md) eintragen. Der Mac-
Tester verwendet denselben Kandidaten-Commit wie der Windows-Tester, aber das
architekturpassende Paket und eine getrennte Evidence-Datei.
