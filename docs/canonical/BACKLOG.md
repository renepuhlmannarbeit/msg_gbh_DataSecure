# Aktives Entwicklungsbacklog

Stand: 06.10.2026 · Produktstand 3.2.0-rc158 · Windows/macOS RC158 veröffentlicht · Linux bleibt RC157 · Cowork bleibt RC151

Commit/Push und Standalone-Vorabpakete für Windows x64 sowie macOS Intel/Apple
Silicon sind aus `f4caf948bde39dbebe8fe359235c3be84f189e5d` abgeschlossen.
DS-106–109 und die Sicherheitsnachbesserung sind in RC158 veröffentlicht. Fehlende
Gerätebedien- und Qualitätsnachweise BL-010.47/50/51 bleiben davon getrennt.

**RC158-Sicherheitsnachbesserung:** Diagnose- und begrenzte, deskriptorgebundene
Lesegrenzen sind implementiert und gezielt gegen Links, Austausch,
Wachstum und I/O-Fehler geprüft. Zusätzliche Reviewbefunde zu OCR-Cache,
Segmentkollision, Teilwrites, FIFO-Opens und BigInt-Dateiidentität sind ebenfalls
korrigiert. Die frische vollständige lokale Regression (195 Testdateien),
49 Windows-Rusttests mit Clippy und 41 reale Konvertierungsgruppen bestehen.
Die erneute SARIF-Gegenprüfung bestätigte fünf zusätzliche Restlücken;
Status-Buildwriter, Markdown-/Status-/SEA-Reader und Preview-Retention sind
ebenfalls korrigiert. Gezielte tatsächliche Austausch-/ABA-Gegenproben und
zwei unabhängige Abschlussreviews bestehen. Der komplette Produktschnitt
nach diesen zusätzlichen Korrekturen besteht erneut: 76 Basis- und 119 direkte
Testdateien, 49 Windows-Rusttests, warning-free Clippy und Dokumentationsgates.
Der frische strenge Security-Gate mit einzeln gebundener False-Positive-Triage,
Pflicht-CI, sauberer Windows-Doppelbau, beide nativen Mac-ZIP-/DMG-Gates und
die Veröffentlichung bestehen. Keine ganzen Regeln werden
ausgeschaltet; alte Nachweise bleiben auf ihren Schnitt begrenzt.
[Befunde und Releasezustand](../RELEASE.md#rc158--standalone-windows-sowie-macos-zip-und-zusätzlich-dmg).

Die frühere RC157 bindet Quellcommit `111737d28021b6989ffe8d563b58daa9cbae610f`.
Windows, macOS Intel, macOS Apple Silicon und Linux sind nativ geprüft und
als Vorabpakete veröffentlicht; Mac-ZIP bleibt neben dem zusätzlichen DMG erhalten.
Der Windows-Anwenderlauf samt integrierter Prüfung ist ausdrücklich bestanden.
[Releasebindung und Plattformnachweise](../RELEASE.md#rc157--standalone-auf-allen-zielplattformen).
Die unten beschriebenen RC152–157-Zwischenschritte sind Entstehungsgeschichte,
keine weiterhin offenen Fehler; tatsächlich fehlende Spezialabnahmen stehen
separat in Abschnitt B und der Evidence-Matrix.

**In RC158 veröffentlichte Nachbesserung vom 05.10.2026:** DS-106 / BL-010.46 bearbeitet
konkrete neue RC157-Befunde: Unternehmenswahl, laufweite Wiederverwendung
vollständiger Schreibweisen, nicht ladbare Fehlerdateilisten und PDF-Grafik-/
OCR-Artefakte. Der reale Lauf `5e50a0b0` lieferte 9/10 Ergebnisse; ein separater
Restprüfungsfehler über bereits ersetzte Platzhalter ist reproduziert und lokal
korrigiert. Vorherige bestandene Läufe bleiben gültige, begrenzte Evidenz und
werden nicht zu pauschalen Abnahmen dieser neuen Änderungen umgedeutet.
Der Kolleginnen-Komplettausfall ist ohne
ihre Windows-Diagnose noch nicht ursächlich zugeordnet.

**Technischer Gegenreview DS-107 / BL-010.48:** Reale Desktop-IPC-
Unternehmensfreigabe, laufgebundene Prüf-Fehlerzustände, begrenztes IPC und
Schließen ohne RPC-Sperre, konkrete Dateifehler auch bei Zuordnungsschuld
sowie ehrliche Native-Smoke-/Skip-Auswertung sind implementiert. Der neue
Windows-Engineering-Bau lag getrennt von veröffentlichten RC157-Archiven;
die abschließende RC158-Releaseevidence ist oben verlinkt.
Neue macOS-Gerätebedienung, Organisationssignierung und der ungeklärte
Kolleginnen-Ausfall bleiben getrennte Nachweise, keine erneut offenen bereits
abgeschlossenen Funktionstests.

Dies ist die **einzige aktive Arbeitsliste**. Handlungsbedarf entsteht nur aus
den Storytabellen und ihren ausdrücklich genannten Resten. Die nachfolgenden
RC-Abschnitte sind eine kompakte, schreibgeschützte Entscheidungs- und
Evidenzchronologie, keine offenen Aufgaben. Ausführliche historische Aufträge,
erledigte Teilarbeiten und frühere Keyring-/MCPB-Pläne stehen im
[Archiv](../archive/README.md) und in den monatlichen Backlogarchiven.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Eine technisch fertige Story mit
offener Zielsystem- oder Anwenderabnahme bleibt hier als „menschliche Evidenz
offen“ sichtbar, wird aber nicht als weitere Entwicklungsarbeit dargestellt.

Statuslesart: **in Arbeit** bezeichnet ausschließlich noch lieferbare technische
Arbeit. **erledigt** bedeutet, dass die beschriebene E0-Lieferung vollständig
ist; noch fehlende E1/E2/E3-Zielhost-, Anwender- oder Fachevidenz wird getrennt
in Abschnitt B und der Evidence-Matrix geführt. Für BL-010.11–14, 16–18 und 20–33 sind die jeweils
beschriebenen E0-Kernpfade samt automatisierten Windows-/Paketgates umgesetzt.
Neben den benannten Zielhost-, Bedien-, Accessibility-, Performance-, Update-/
Rollback- und Fachevidenzen sind die lokale Auswahlgruppierung, die serverseitige
Statuswahrheit, F7/F17 und der dauerhafte Journalfingerprint E0 geschlossen.
Das unabhängige Astra-Gegenreview vom 12.09.2026 hat vier zusammenhängende
Cowork-Entwicklungsstories (`BL-041.15`–`.18`) hervorgebracht. Ihre E0-Lieferung
ist umgesetzt und durch produktnahe Vertrags- und Regressionstests belegt.
Der zweite Gegenreview öffnete BL-041.17 wegen vier Release-/UAT-Restfehlern
erneut. Der lokale Korrekturblock `ASTRA2-20260912-01`–`04` unten schließt diese
mit zusätzlichen Negativtests und einem echten Offline-Paketintegrationstest.
RC138 bleibt dennoch nicht wiederverwendbar. RC139 hat die strengere Commit-,
Archiv- und UAT-Bindung aus sauberem Quellstand erneut nachgewiesen; damit kann
die menschliche N3/N4-Kampagne vorbereitet werden, nicht als bestanden gelten.
DS-104/BL-010.44 war eine **neue**, zunächst lokal entwickelte Standalone-
Story (in RC157 erledigt und veröffentlicht): Der Nutzer soll den lokalen Review in der Anwendung sehen
und nach automatischem Lauf oder Neustart bewusst fortsetzen können. Der
bisherige externe Review bleibt in RC151 bis zur geprüften Ablösung der Istweg; der
inhaltsfreie Haupt-Renderer und Coworks eigener Adapter bleiben unverändert.
Der erste RC152-Windows-Echtlauf zeigte beim Fortsetzen ein weißes Prüffenster:
Der synchrone Tauri-Fensterbau blockierte WebView2. RC153 erzeugt das Fenster
asynchron und verlangt im isolierten nativen Pakettest sowohl die geladene
Prüfseite als auch den Start ihres Prüfsitzungs-Skripts. Die Fortsetzung des
konkreten Anwenderlaufs und die sichtbare Bedienabnahme bleiben offen.
Der RC153-Anwenderlauf vom 30.09.2026 (`9daa6c66`) erreichte 140/140
anonymisierte Dateien und eine Zuordnung; nach einer weiteren Prüfgruppe blieb
das Prüffenster jedoch mit einem Wartetext offen, obwohl der Verlauf bereits
„Abgeschlossen“ meldete. Lokal ist deshalb die laufende Prüfsitzung um ein
terminales Abschlussbit ergänzt: mehrere Gruppen bleiben im selben Fenster,
nach dem bestätigten Laufabschluss schließt es automatisch, und in der
Warteansicht gibt es einen sicheren Schließen-Button. Die erneute native
Anwenderprüfung dieses geänderten Kandidaten steht noch aus.
Die RC154-Rückmeldung zeigte einen weiteren Bruch: Nach einer entschiedenen
Prüfgruppe kann derselbe Lauf neue Fundstellen melden, die bisher nur über
**Verlauf → Prüfung fortsetzen** startbar waren. Der lokale Nachfolger bindet
die Fortsetzung an den im Prüffenster beantworteten Lauf, zeigt während der
Core-Prüfung einen Wartehinweis und bietet dort **Weitere Prüfung fortsetzen**
an. RC155 bestand die lokalen Standalone-/Dokumentations-/Rust-Tests, den
Windows-Pakettest und den nativen Start mit geladener Prüfseite. RC156 ergänzt
einen sichtbaren Arbeitsindikator, ordnet die Prüfaktion dem Lauf zu und legt
die vertrauliche Identitäts-TXT nur im markierten Lauf-Unterordner ab; es
entfernt den App-Löschweg. Lokaler Paket-/Sidecar-Test und nativer Windows-Start
bestanden. Der Anwender bestätigte den RC156-Windows-Lauf samt Prüfung und
Stapelverarbeitung als bestanden. Der letzte Lauf `ca4349c5` enthält nach
nur lesender Kontrolle 140 Markdown-Ergebnisse, 140 eindeutige
Dateizuordnungen und eine Identitäts-TXT mit Vollständigkeitshinweis 140/140.
RC157 ergänzt **Jetzt prüfen** direkt in der Verarbeiten-Karte des aktuellen
Laufs. Der private Fortsetzungsbefehl verlangt dafür einen verbundenen Lauf;
ein Verbindungsneustart darf keinen historischen Ersatzlauf fortsetzen.
Die direkten UI-/Service-/IPC-Prüfungen, der isolierte Pakettest und der native
Windows-Start mit geladener Prüfseite bestehen für den lokalen RC157-Kandidaten.
Der Anwender bestätigte RC157 anschließend als vollständig bestanden,
einschließlich lokaler Prüfung und Stapelverarbeitung. Der Ergebnislauf
`3d6b69b7` enthält nach nur lesender Kontrolle 140 Markdown-Ergebnisse,
140 Dateizuordnungen und die vertrauliche Identitäts-TXT (140/140 erfasst).
Die Windows-Funktionsabnahme einschließlich Direkteinstieg ist damit nicht
mehr offen; andere Zielhosts und benannte Spezialabnahmen bleiben getrennt.
Abschnitt B enthält ausschließlich menschliche beziehungsweise
zielhostgebundene Evidenz. Die Kompatibilitätsadapter für bestehende Journale
und Exporte bleiben absichtlich erhalten und sind keine zu löschende Altlast.

**RC151-Windows-Funktionsnachweis vom 30.09.2026:** Der vom Anwender auf dem
Windows-Zielhost ausgeführte 140-Dateien-Stapel liegt in beiden Modi vollständig
vor: 140 Markdown-Konvertate, 140 anonymisierte Markdown-Ergebnisse und eine
Zuordnung mit 140 Einträgen. Der gewählte entpackte Paketroot enthielt neben den
133 beabsichtigten Dateien unter `EINGABEN` sieben Begleitdateien. Die
schreibgeschützte Nachprüfung bestätigte Quell-/Manifest-Hashes, die 52 direkt
lesbaren Konvertate bytegleich, 54 erhaltene und 54 entfernte DOCX-Sollstellen,
2168 fachliche CSV-Beschreibungszeilen sowie ausgewählte technische Titel und
synthetische Identitätsanker. Damit sind die bisherigen Aussagen „erneuter
Gesamtlauf ausstehend“ und „auf Windows nicht gelaufen“ überholt. Diese
Beobachtung ist wiederverwendbare **Teil-Evidenz** für N3-05/N3-06 und N4-07,
kein Anlass für einen pauschalen Wiederholungslauf. Die formalen N3/N4-CSV sind
noch nicht ausgefüllte Abnahmeprotokolle: Ihre `NOT_RUN`-Felder beziehen sich
auf den jeweiligen vollständigen, rollen- und paketgebundenen Prüffall, nicht
auf den bereits erfolgten Produkt-Funktionstest. Offene Teilfälle werden in
Abschnitt B getrennt geführt; Mac-/Linux-Bedienung und Cowork werden aus dem
Windows-Lauf nicht abgeleitet.

### RC141 macOS / RC140 übrige Pakete – historische technische Release-Evidence

**Nachreview MAC-20260923:** Die unten belegten RC140-Läufe bleiben historische
Paket-Evidence. BL-010.20 und BL-012.9 wurden erneut geöffnet; der RC141-
Neubau und dauerhafte Veröffentlichung schließen jetzt BL-010.20 technisch. Die
E0-Aussagen der Präambel ersetzen keine neue Auslieferung oder sichtbare UAT.

| Bezug | Befund und aktuelle Lieferung | Rest / Status |
|---|---|---|
| BL-010.20 / MAC-01–03 | RC140-Supervisor verlangt macOS 15 auf Intel und 14 auf ARM statt deklarierter 13.5; Intel-Canvas-Addon ohne eigene Signatur; RC-Suffix in numerischen Plist-Versionsfeldern. In RC141 korrigiert und auf Intel/ARM nativ geprüft, einschließlich LaunchServices und echtem Paketsmoke. Commit `1d5a67d…e542`, Lauf `35875613438`; ZIPs lokal hashgeprüft und unverändert als `v3.2.0-rc141` veröffentlicht. | **erledigt** · E0-Neubau und dauerhafte Veröffentlichung belegt; E1/E2 unter BL-010.21 offen. Bestehende RC140-ZIPs unverändert. |
| BL-012.9 / MAC-04 | Gemeinsamer Mac-Reviewadapter ließ Gruppen über 1000 Fundstellen und technische JXA-Fehler als „vertagt“ erscheinen. Gruppierung berücksichtigt nun Zeichen- und Fundstellenlimit; technische Fehler bleiben Fehler. 100 Review-/Policy-/Companionfälle lokal bestanden, einschließlich Windows-Gegenregression; Fix im RC141-Standalone-Mac-Paket enthalten. | **in Arbeit**: neue Cowork-Paketlieferung und sichtbare AppKit-UAT/E1/E2; der Standalone-Paketsmoke belegt keine Reviewbedienung. |

Einzelbefunde, Quellen und Prüfumfang: [MAC-20260923](../REVIEW_PRODUCT_HOSTS_2026-09-23.md#mac-20260923--vollständiger-macos-paket-und-installationsnachreview).
Neue Pakete, vollständiger Commit und Hashes:
[RC141-Nachweis](../REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze).

Beide Produkte sind aus dem sauberen Commit
`814bc50e3d754224cd95b6fa91f122dd45f48487` als
[RC140-Vorabversion](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc140)
veröffentlicht. Standalone-Windows bestand PKG-04/INT-13 mit zwei bytegleichen
Bauten und beiden nativen Smokes; Mac Intel und ARM (`35864636481`) sowie Linux
(`35864697349`) bestanden die native Paket-Evidence. Cowork bestand seine drei
nativen Zielpakete (`35864685584`), den getrennten Windows-Normal-/Debug-/UAT-
Lauf (`35864624729`) und die Pflicht-CI (`35864600808`). Alle 15 Release-Assets
stimmen mit den lokalen Bytes überein. Das belegte die damalige technische E0-Lieferung,
aber keine menschliche N3/N4-/Modell-/Finder-/Gatekeeper-Abnahme und keine
macOS-13.5-Evidenz. Vor dem nächsten Mac-Schritt sind die obigen neuen Defects
zu schließen. Danach folgt ein echter Browser-Download
mit Fresh Install und sichtbarem Start auf Intel und Apple Silicon; ein
ad-hoc-signiertes Paket bleibt nur ein interner Pilot.

### RC139 – Astra-Korrekturen und exakte Release-/UAT-Bindung

**Damals noch ungebundene Reviewfortführung, seit RC140 gebunden:** [PH-20260923](../REVIEW_PRODUCT_HOSTS_2026-09-23.md)
führt die Ordnertrennung (BL-041.19), den vorbereiteten separaten
Claude-Code-Hostpilot (BL-041.20) und die vom Product Owner bestätigte
Wiederverwendung nach DS-101 (BL-041.21). BL-050.4 prüft jetzt alle 16
Härtetestdateien in beiden Zwecken bis zum verifizierten Endzustand. Gegenreviews
sichern zusätzliche Erkennungs- und Berechtigungsfehler ab. BL-021.3 bindet
lokale Reviewentscheidungen an exakte Fundstellen, nicht an freigegebene Wörter.
BL-021.4 behandelt konkurrierende Versalientitel vor der Personen-Aliasbindung;
Fachanker prüfen ihren Erhalt zusätzlich zur erfolgreichen Publikation.
VECTRA-20260923 ergänzt unter BL-050.4 genau einen CSV-Integrationsgegenfall,
keine neue Engine, Eingabeart oder Bedienaktion.
Die damaligen RC139-/RC137-Paketnachweise deckten diese Änderungen nicht ab;
maßgeblich ist nun die vorangestellte RC140-Evidence.

Quellcommit `46c6fec4722c879989f5c8e3059367241c117c3a` liefert BL-041.15–.18 und
`ASTRA2-20260912-01`–`04`. Alle 182 lokalen Produkttestdateien, Docs-/Versionsgates
und echte UAT-Fixtures sind grün. Pflichtlauf `34701892871` und Paketlauf
`34701897963` bestanden. Die drei normalen Release-ZIPs sind auf ihren nativen
Windows-/Intel-Mac-/ARM-Mac-Hosts gestartet. Windows-Normal und -Debug sind
jeweils zweimal bytegleich gebaut und beide Bauten geprüft; die UAT-Vorlage
bindet exakt diese veröffentlichten Bytes. Finale Prüfsummen, SPDX und alle
sieben Upload-Digests sind abgeglichen. Modellgates sowie menschliche N3/N4-
Abnahmen bleiben offen; Standalone-Pakete verbleiben unverändert bei RC137.

### RC138 – native Cowork-Paketparität und Interaktionshärtung

Die Befunde `CWR-20260912-01`–`11`, die geschlossene Interaktionsregistry,
Status-/ACK-/Handoff-Korrekturen, paginierte Aufnahme und Marketplace-Gates sind
an Commit `d70cb266df90bdc07b0efadbf81f0d81195b3920` gebunden. Lauf
`34691170241` baute und startete exakt die drei Release-ZIPs auf Windows x64,
macOS Intel und macOS ARM64; der Pflichtlauf `34691166336` ist ebenfalls grün.
Die damalige technische E0-Lieferung ist als historische Evidence erhalten. Die
nachträglich bestätigten Astra-Befunde `BL-041.15`–`.18` sind inzwischen
implementiert und durch RC139 aus sauberem Commit mit exakt verifizierten
Normal-/Debug-Archiven und frisch erzeugter UAT-Vorlage erneut belegt.
Danach bleiben die benannten menschlichen Cowork-Modell-, N3/N4-, Accessibility-
und Fresh-Install-Nachweise. Standalone bleibt unverändert auf RC137.

### RC136 – DS-099: kanonischer Cowork-Interaktionsvertrag

Der read-only Strukturvergleich mit `GBH-BID-Skills` ist dauerhaft unter
`ARCH-DOC-COWORK-BID-REVIEW-2026-09-11` archiviert. Übernommen werden nur
allgemeine Cowork-Governance-Muster: eine geschlossene Interaktionsregistry,
ein additiver öffentlicher Statusumschlag, maschinenlesbare Human-Gates,
progressive Skillreferenzen und produktnahe Golden Cases. BID-Fachlogik,
Subagenten-Orchestrierung und fremde Runtimebestandteile bleiben außerhalb des
Produkts. Standalone bleibt unverändert und dient nur als Gegenregression.

### RC134 – zweckgebundene DOCX-Projektion und Windows-Paketbindung

DS-098 trennt nach vollständiger struktureller DOCX-Prüfung die sichtbare
Projektion nach Zweck: reine Konvertierung behält Kopf-/Fußzeilen; die
Anonymisierung lässt sie sowie nur dort referenzierte Bilder aus, erhält aber
Haupttext, Kommentare, Fuß- und Endnoten. Die bewusste Inhaltsgrenze wird nicht
als Extraktionsfehler ausgegeben. Zusätzlich ist die aktuelle Releasewahrheit
dauerhaft abgesichert: `version:sync` aktualisiert den neuen Entwicklungs-RC,
`test:version-truth` läuft in `test:docs`, historische Evidence bleibt
unverändert und eine erfolgte Paketbindung wird nicht zurückgestuft.

Der saubere Commit `583d719` bestand die vollständigen Produkt-, Standalone-,
Dokumentations-, Engineering-, Conversion- und Auditgates. Zwei unabhängig
bereinigte Windows-Paketbauten sind als ZIP, Desktop- und Core-Binary bytegleich;
beide Paket-, Worker- und nativen Smokes bestanden. INT-13 bindet das
110.250.875 Byte große Archiv mit SHA-256 `cdc2ec38…6de0c`. Offen bleiben
N3/N4, aktuelle Cowork-Pakete sowie macOS-/Linux-Zielhostevidenz.

### RC133 – historischer versionierter Paket- und Testkandidat

Der RC132-Funktionsstand ist als RC133 aus Commit `2cd4150` geschnitten und auf
`main` veröffentlicht. Zwei unabhängig bereinigte Windows-Paketbauten sind
bytegleich; beide Paket-, Worker-, History-/Sidecar- und native Smokes sind
grün. INT-13 bindet SHA-256 `fd3dcb1b…ece66`. Damit ist die technische Windows-
E0-Evidence erledigt; N3/N4 sowie Cowork-/macOS-Zielhostevidenz bleiben offen.

### RC132 – unabhängige Defectrunde und ehrliche Policy-/Statusbindung

BL-010.12/BL-010.23/BL-021.1/BL-030.2/BL-041.1: Der mehrdimensionale
Gegencheck reproduzierte und schloss vier Ursachen. Gemeinsam als Person
bestätigte gleiche F7-Stellen bleiben nach der ersten Pseudonymbindung über alle
betroffenen Dokumente veröffentlichbar. Der kanonische Policyfingerprint umfasst
alle ausführungsbestimmenden Privacy-, Review-, Profil-, Pseudonym-, Core- und
Ressourcenmodule; Einzelmutation und unbekanntes Privacy-Modul sind negative
Gates. Der Ruleset ist wegen der materiellen F7-Änderung `de-business/3`.
Präindex-Journale zählen auch wiederholte Aliasfenster gegen ihr festes
Arbeitsbudget. Die drei nativen Reviewadapter fassen identische F7-Personenstellen
zu genau einer sichtbaren Entscheidung zusammen; die gemeinsame Validierung
bleibt fail-closed. Cowork transportiert bei Start und nachträglichem
Ergebnisordnerwechsel einen vollständigen serverseitigen `user_status`; ein ausstehender Netzwerk-/Sync-Hinweis überlebt einen
abgebrochenen Quellpicker und wird erst bei bestätigter Übergabe verbraucht.
Standalone gruppiert ausschließlich zugelassene Quellen; Ablehnungsgründe bleiben
im Admissiongate. E0 ist lokal automatisiert belegt. Neue Paket-/INT-13- und
menschliche N3/N4-Evidenz für RC132 bleibt offen.

BL-010.13/BL-011.8/BL-010.23: Ein realer Altjournal-Gegenlauf zeigte, dass ein
Anonymisierungsstapel des früheren Rulesets `de-business/2` trotz aktuellem
`de-business/3` noch als fortsetzbar erschien. Die Recovery filtert nun jede
Privacy-Fortsetzung bereits vor der UI-Projektion gegen den gespeicherten
Pseudonym-/Policykontext. Reine Konvertierung sowie reine Export-/Mappingreparatur
bleiben davon unabhängig. Ungefangene Workerfehler stabilisieren alle offenen
Positionen über den gemeinsamen Vorveröffentlichungs-Classifier und dessen
begrenztes Retrybudget; der feste Ursachencode bleibt über Worker, Executor und
Diagnose erhalten. Historische inaktive Läufe blockieren weder Funktionswahl
noch Datei-, rekursive Ordner- oder Dropaufnahme. Der Verlauf bestätigt nach
einem Klick nur den angenommenen Start und prüft anschließend den tatsächlichen
Laufstatus. Der gespeicherte Ergebnisstamm ist unter Einstellungen sichtbar.

DS-097/BL-010.9/BL-010.23: Zwei Produkte bleiben eine Repository- und Core-Linie.
Standalone und Cowork besitzen getrennte Distributionen, Datenräume, UI- und
Transportadapter; Betriebssystemunterschiede gehören in kleine Windows-/macOS-/
Linux-Adapter und Zielpaketgates. Permanente Produkt- oder OS-Branches sowie
kopierte Privacy-/Workflowimplementierungen sind ausdrücklich kein Ziel. Die
noch sichtbaren Imports gemeinsamer Verarbeitung aus `server/standalone/` werden
bei konkreter Änderung in eine schmale neutrale Processing-API beziehungsweise
plattformgebundene Adapter verschoben; kein risikoreicher Big-Bang-Umbau im
Fortsetzungsfix. Produkt- und Abhängigkeitsgrenzen bleiben maschinelle Gates.

### RC131 – deterministische Fehler sind niemals Endlosschleifen

BL-010.13/BL-011.8/BL-021.1/BL-041.1: Ein realer RC130-Standalone-Lauf mit
einem komplexen DOCX belegte zwei gekoppelte Fehler. Der unabhängige
Residual-Prüfer klassifizierte fachliche Tabellenwerte aus einem generischen
Office-Export als Personenkandidaten. Der sichere Stopp wurde anschließend
ohne maschinenlesbaren Grund in `PROCESSING_INTERRUPTED` umgedeutet und dadurch
bei jeder Verlauf-Fortsetzung identisch wiederholt.

RC131 ergänzt den bestehenden Fachwortkatalog um belegte Begriffe und behandelt
darüber hinaus bewertete Skill-/Kompetenzmatrizen kontextgebunden: allgemeine
professionelle Zweiwortphrasen bleiben Inhalt, echte Namen in derselben neutralen
Tabellenstruktur bleiben weiterhin gesperrt. Der gemeinsame
Vorveröffentlichungs-Classifier setzt außerdem produktweit durch: Nur ein
explizit katalogisierter transienter Fehler ist fortsetzbar. Uncodierte oder
unbekannte Pipelinefehler werden terminal als `INTERNAL_FAILURE`, Residual-
Fehler explizit als `RESIDUAL_PII` gespeichert. Ein echter
`PROCESSING_INTERRUPTED`-Zustand entsteht nur nach nachgewiesenem Prozessverlust
aus einem verwaisten dauerhaften `processing`-Checkpoint oder nach bereits
atomar veröffentlichter, noch nicht vollständig abgeglichener Ausgabe. Derselbe
explizit transiente Fehler bleibt höchstens zweimal fortsetzbar und stoppt beim
dritten Fehlschlag als `RETRY_LIMIT_EXCEEDED`; eine dauerhaft fehlende
Konvertierungsisolation ist sofort terminal. Ein verifiziertes veröffentlichtes
Paket wird nach Callback-/Journalfehlern adoptiert und niemals neu verarbeitet;
ein vorhandenes unsicheres Paket stoppt als `RECOVERY_FAILED`.

Standalone und Cowork verwenden denselben Privacy- und Stapelkern; beide
Erstverarbeitungs- und Sammelreviewpfade sind an diese Regel gebunden. Gezielte
Regression, der reale bereits extrahierte DOCX-Markdown-Inhalt und die
vollständigen Produktgates bildeten E0 vor dem finalen Paketlauf. Paketbau und
INT-13 sind inzwischen aus dem finalen RC131-Commit gebunden; sichtbar offen
bleibt die menschliche UAT.

Die technische Paketbindung ist inzwischen für Commit `d4d269b` erledigt:
Windows-PKG-04/INT-13, beide nativen macOS-Architekturen und alle drei Cowork-
Zielpakete sind grün und als `v3.2.0-rc131` veröffentlicht. Offen bleibt nur die
bereits geplante menschliche N3/N4-UAT. BL-051.7 ist zugleich nachgeschärft:
Der einzige automatische Ubuntu-Job unterscheidet Docs-only, Produktcode und
gemischte Änderungen fail-safe; native, Security-, OCR- und Releasegates bleiben
manuell. Der Cowork-Workflow startet standardmäßig nur Windows x64, während
`all` ausschließlich bewusst für einen neuen plattformübergreifenden Kandidaten
gewählt wird.

### RC130 – Windows-Helferpfade und POSIX-Testisolation

Datei-/Ordnerdialoge sowie `taskkill.exe` werden mit expliziter Windows-
Pfadsemantik aufgebaut und durch exakte plattformneutrale Vertragstests
gebunden. Die realen Audit-/Exporttests verwenden auf jedem Betriebssystem
einen eigenen temporären Produktdatenroot; der Abschlussanzeigentest akzeptiert
die zwei zulässigen Ergebnisse eines sauberen IPC-Schließens, fordert aber
weiterhin exakt einen Presenter. Die separate Worker-Übernahme bei echtem
Elternausfall bleibt unverändert geprüft. Die vollständige CI-Produktsuite ist
auf Windows und mit dem gepinnten Node 22.23.2 auf einem nativen Linux-
Dateisystem grün. Offen sind PKG-04/INT-13 und die commitgebundenen
Zielpaketjobs.

### RC129 – Windows-Pfadsemantik vom Testhost entkoppelt

Der RC128-Linux-Lauf bestätigte den realen Startup-Guard und fand anschließend
im Test für den stabilen Cowork-Datenroot eine Host-Pfadabhängigkeit. Der
Windows-Vertrag verwendet nun durchgängig `path.win32` für Absolutheit,
Normalisierung und Identitätsvergleich. Damit bleibt der echte Produktpfad
unter Windows unverändert und derselbe Vertrag ist unter Linux und macOS
automatisiert belegbar. Lokal sind die gezielten Pfad- und Startup-Tests grün;
offen sind der Linux-CI-Rerun, PKG-04/INT-13 und die fünf commitgebundenen
Zielpaketjobs.

### RC128 – Startup-Guard-Test auf allen Hosts real gebunden

Der RC127-CI-Lauf belegte den korrigierten LF-Guard, deckte aber zwei
Windows-spezifisch präparierte Startup-Guard-Realprozesstests auf. RC128 setzt
für die Childprozesse den absoluten `EU_PRIVACY_DATA_ROOT`, sodass Defekt,
Marker, Diagnosejournal und Erwartung unter Windows, Linux und macOS denselben
realen Speicherort verwenden. Das ändert keinen Produktpfad und ersetzt keine
Runtime durch einen Mock. E0 lokal ist grün; offen sind der Linux-CI-Rerun,
PKG-04/INT-13 und die fünf commitgebundenen Zielpaketjobs.

### RC127 – Zielpaket- und CI-Vertrag korrigiert

Der RC126-All-Targets-Lauf hat drei gültige, jeweils unter 45 MiB liegende
Cowork-Ziel-ZIPs gebaut und anschließend nur am zusätzlichen Universal-ZIP
gestoppt. RC127 entfernt diesen nicht installierbaren Sammelartefaktweg aus dem
Releaseworkflow, ohne die 50-MB-Sicherheitsgrenze anzuheben. Ein Vertragstest
fordert dauerhaft genau die drei getrennten Zielpakete. Der automatische
LF-Guard prüft Git-Indexbytes und lässt ausschließlich die byteinventorierten
Upstream-Abhängigkeiten der deaktivierten OCR-Runtime aus; eigene Quellen
bleiben vollständig erfasst. Der reale Intel-macOS-Lauf entdeckte zusätzlich,
dass die bisherige Nachlaufprüfung beliebige direkte WebView-Kindprozesse als
Sidecar klassifizieren konnte. Der Tauri-Lifecycle schließt den verwalteten
Sidecar nun vorsorglich bei beiden globalen Exit-Ereignissen; der Zielhosttest
bindet PID, Prozessname und Kommandozeile an den exakten `datasecure-core`-
Kindprozess und wartet begrenzt auf dessen Ende.

E0-Code und Regression sind erledigt. Offen sind der commitgebundene
PKG-04-/INT-13-Neulauf, die drei Cowork-Zielbuilds und die beiden nativen
macOS-Standalone-Builds aus dem finalen RC127-Commit. Die RC126-Läufe dürfen
nicht in die formale UAT-Kampagne umgebunden werden.

### RC126 – Cowork-Sammelpaket auf allen Zielsystemen reproduzierbar

Der reale RC125-All-Targets-Lauf hat eine technische Paketierungsannahme
widerlegt: Offizielle Node-Archive liefern den identischen Lizenztext auf
Windows mit CRLF und auf macOS mit LF. Der zielübergreifende Rohbytevergleich
stoppte daher korrekt, aber unnötig. RC126 normalisiert die verifizierte
UTF-8-Lizenz vor Hash und Veröffentlichung auf LF; alle anderen Abweichungen
bleiben gesperrt. Der Regressionstest deckt LF, CRLF, ungültiges UTF-8, NUL und
Größengrenzen ab. `version:sync` bindet zusätzlich die formale UAT-Vorlage.

E0-Code und Vollregression sind erledigt. Vor Kampagnenstart bleiben der neue
commitgebundene PKG-04-/INT-13-Lauf und die Zielpaketbuilds aus exakt diesem
RC126-Commit auszuführen; RC125-Evidence darf nicht übernommen werden.

### RC125 – N3/N4 und formale Zwei-Personen-UAT vorbereitet

BL-051/BL-052 / DS-095: N3 ist jetzt als technische E1-Zielhostabnahme, N4 als
anschließende formale E2-/E3-Anwender- und Freigabeabnahme definiert. Der aktive
Rahmen unter `docs/acceptance/FORMAL_UAT` bindet einen vollständigen Commit an
separate Standalone-/Cowork-Pakete und SHA-256 für Windows x64 sowie die reale
Architektur eines Test-Macs. Getrennte Plattformprotokolle, Branchablauf,
N3-/N4-Klartextfälle und eine fail-closed Freigabevorlage sind angelegt und
maschinell geprüft. Die bestehenden Cowork- und Standalone-UAT-Kits bleiben die
einzigen produktbezogenen Fallquellen.

Offen und bewusst menschlich: finalen Kandidaten festschreiben, vier
zielgebundene Paket-Hashes eintragen, Windows- und macOS-N3/N4 durchführen und
gemeinsam entscheiden. Ein Mac belegt nur seine native Architektur; die andere
macOS-Architektur bleibt separat offen. Die Vorbereitung ist E0 erledigt und
keine vorweggenommene UAT-Evidence.

### RC125 – unabhängige Revalidierung

Der aktuelle Stand wurde erneut gegen die offizielle Claude-/Cowork-
Sitzungsarchitektur und alle automatisierten Produktverträge geprüft. Die
Cloud-/Local-Grenze bleibt unverändert bindend und ist im aktiven Reviewbericht
aktualisiert: Originale nur im nachweislich lokalen Desktop-/Plugin-MCP-Weg;
Cloud-Cowork darf nur bereits freigegebene Ergebnisse erhalten.

Der brüchige Prompt-Nachtrag, der einen historischen Vier-Format-Satz erst zur
Laufzeit durch die Sechs-Format-Regel ersetzte, ist entfernt. Der SEA-
Crashvertrag verfolgt jetzt sowohl die direkte als auch die Markdown-first-
Konvertierung bis zum gemeinsam veröffentlichten Extraktionscheckpoint. Beide
Befunde sind E0 geschlossen und erzeugen keine neue Story. Weiter offen bleiben
nur die bereits vorhandenen, ausdrücklich als Zielhost-, UAT-, Performance- oder
Fachevidenz gekennzeichneten Backlogpunkte.

### RC124 – DS-093: Cowork-Officequellen über lokales Markdown

BL-010.34/BL-020.1/BL-022.2/BL-022.3: XLSX und PPTX werden im Cowork-Plugin
nach Container-/OPC-Prüfung genau einmal durch den bereits paketierten,
isolierten Office-Parser in eine neutrale Markdown-Repräsentation überführt.
Anschließend laufen sie durch den unveränderten Privacy-Core. Extraktionsgrad
und Anonymisierungsgrad bleiben getrennt; Cowork behauptet keine vollständige
Anonymisierung des ursprünglichen Containers. Picker, rekursive Auswahl,
Wiederaufnahme und Ergebnisübergabe benötigen keinen zusätzlichen Dialog.

E0-Abnahme: reale isolierte XLSX-/PPTX-Läufe, stabile Personen- und
Unternehmenspseudonyme, kein Rohinhalt an Claude, kein Zwischenartefakt,
unveränderte Standalone-Regression sowie Paket-/Marketplace-Smoke. PDF,
Scan-PDF und Bilder bleiben unter BL-023.1–4/BL-024.3 offen, bis eine kompakte
gebündelte OCR-/PDF-Runtime das Paketbudget, Offline-, Sandbox-, Lizenz- und
Zielhost-Gate erfüllt. Das ist **kein** Anwenderblocker für die sechs
freigegebenen Cowork-Formate.

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
| F7 | BL-021.1 (DS-096) | Eine enge Satzsubjekt-/Tätigkeitsgrammatik reserviert plausible unbeschriftete Prosanamen vor der normalen Redaktion und führt sie in den bestehenden lokalen Sammelreview. „Als Person anonymisieren“ verwendet das stapelweite Personenpseudonym; ein bereits exakt gebundener vollständiger Name wird in Folgedokumenten automatisch gleich anonymisiert. Derselbe noch offene normalisierte Name muss innerhalb eines Reviews einheitlich entschieden werden; „beibehalten“ gilt für die dabei geprüften Fundstellen. Fachphrasen bleiben erhalten; Rohwert, Kontext und Hash bleiben aus Journal, Diagnose und MCP heraus. | **E0 erledigt; E2/E3 Fach- und UX-Abnahme offen** |

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
| F11 | BL-022.1, BL-050.1, BL-052.1 | Der deterministische 15-DOCX-Komplexkorpus wird durch `uat:complex-docx` erzeugt; der Produkttest erzeugt zwei eigene sichere Temporärprojektionen, vergleicht sie bytegleich und gibt bei einem Generatorfehler einen festen Hinweis aus. Ein frischer Clone benötigt keine eingecheckten DOCX-Fixtures. | **E0 erledigt** |
| F12 | BL-020.3 (DS-018) | Der Netzwerkvertrag grenzt Rohinhaltsprozesse von der Metadaten-/Exportkoordination im MCP-Hauptprozess ab. Der sichtbare Export verarbeitet ausschließlich verifizierte anonymisierte Paketbytes; beide `.mcp.json`-Projektionen starten nachweislich den kleinen Einstiegspunkt, während Parser, OCR und Review den Netzwerk-Guard behalten. | **E0 erledigt; native Sandbox-Evidenz bleibt offen** |
| F13 | BL-002 (DS-080) | Netzwerkpfade bleiben als ausdrücklich gewählte Ergebnisordner zulässig. Cowork und Standalone zeigen einmalig und ohne weitere Bestätigung an, dass Ergebnisse und bei Standalone-Anonymisierung auch die laufbezogene Zuordnung an andere Systeme übertragen werden können; Pfade gelangen nicht in Cowork- oder Diagnosetexte. | **E0 erledigt; E1/E2 Zielhostanzeige offen** |
| F14 | BL-010.28 (DS-085) | Die eng begrenzte Legacy-Ausnahme ist dokumentiert und regressionsgeprüft: Ein bereits angelegter `datasecure-result-export/3`-Konvertierungsplan beendet beim Replay seine historisch zugesagte `DataSecure-Zuordnung.csv` unter `DataSecure-Markdown`; neue reine Konvertierungsläufe bleiben ohne Zuordnung. | **E0 erledigt** |
| F15 | BL-010.30 | `termination_unconfirmed` wird auch für Journal-Schema `/6` projiziert; breite Anonymisierungsstapel zeigen den definierten Abbruchgrund. | **E0 erledigt (RC123)** |
| F16 | BL-023.4 | Ein einzelnes textloses Bild setzt `OCR_TEXT_EMPTY` und stoppt ein sonst lesbares PDF hart, statt es als „verwendbar mit Auslassungen" auszuweisen. | **erledigt** – `OCR_TEXT_EMPTY` gilt nur noch für eine insgesamt textleere Extraktion; nativer PDF-Text bleibt mit getrenntem OCR-Hinweis verwendbar |
| F17 | BL-030.2 | Die Hypothese ist durch eine lokale, nicht als Release-Benchmark gebundene Beobachtung und reproduzierbare Arbeitsbudgettests bestätigt: Präindex-Zustände können ohne Begrenzung mehrsekündige Aliasfenstersuchen auslösen. Da alte HMAC-Bindungen den fehlenden Klartext-Startindex nicht rekonstruieren lassen, bleibt exakte Wiedererkennung für kleine Altstapel erhalten; ein fester 50.000-Fenster-Suchraum zählt auch wiederholte Cachetreffer, stoppt größere Altstapel begrenzt und fordert die erneute Originalauswahl. Kein Alias wird still übergangen. | **E0 erledigt; reale Altstapel-UAT offen** |

**P3 — Kanonkorrekturen.** Reine Dokumentwahrheit, kein Code.

| Befund | Story | Neuer offener Punkt | Status |
|---|---|---|---|
| F18/F19 | BL-051.1 (DS-077) | Der damals belegte Umfang und die Formatmatrix wurden auf RC111/`b543589f` samt ZIP-SHA gebunden; RC108/RC109 bleiben ausdrücklich historische Evidence. Der heutige Paketstand RC134 ist separat in BL-051 und der Evidenzmatrix gebunden. | **E0 erledigt (RC123)** |
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
| BL-010.11 | Native Desktop-Hülle: Tauri 2 ist gemäß DS-076/077/094 gesetzt. Reale Rust-Hülle, Tauri-CSP/Capability-Grenze, nativer Datei-/Ordnerpicker, korrelierter bidirektionaler Core-Dispatcher mit begrenzten Längenframes, 30-Sekunden-Antwortgrenze, Ready-Handshake, Neustart nach IPC-Fehler, Sidecar-Lifecycle und inhaltsfreie Rendererprojektion sind implementiert. Der Renderer besitzt keine direkten Dialog-, Datei-, Shell- oder Netzrechte. Windows x64 ist kompiliert und als laufender Engineering-Prozess sowie im selbsttragenden Pilot-ZIP geprüft. Kostenbestätigte GitHub-Runner-Gates prüfen auf Intel (`macos-15-intel`), Apple Silicon (`macos-14`) und Linux x64 (`ubuntu-22.04`) gepinnte Runtime, POSIX-Supervisor, Produkt-/Konverter-/Rust-Verträge, Clippy, nativen Release-Build und Architektur. Die macOS-App-Bundle-Läufe `34321954381`/`34322534571` und Distributionsläufe `34334520861`/`34335259239` bauen und prüfen die echten ad-hoc signierten App-Bundles; das Linux-Gate baut und prüft entsprechend das echte AppImage. Die Distributionsgates bauen ihr ZIP zweimal bytegleich, prüfen Manifest/SBOM/Lizenzen/Hashes/Modi, starten es nach dem Entpacken und stellen es optional für einen Tag bereit. RC134 ist auf dem Windows-Referenzhost mit 30 frischen Profilen vom Prozessstart bis zu UI-, IPC-, Sidecar- und Servicebereitschaft vermessen (p50 1,012 s, p95 1,124 s, Maximum 1,256 s); dies ist eine Fresh-Profile-, keine OS-Kaltstartmessung. Die reine Tauri-Hülle misst 3.549.184 Byte und bleibt unter 20 MiB. Zehn weitere Starts werden mit positiver TCP-/UDP-Kontrolle circa alle 100 ms vom Prozessstart bis zur Bereitschaft beobachtet; sie zeigen null TCP-Listener und null DataSecure-/Core-/Worker-UDP-Endpunkte. Root und Kinder sind an Erstellzeit, der Root zusätzlich an den exakten EXE-Pfad gebunden; WebView2-UDP wäre nur bei Microsoft-Signatur und exakt geparstem isoliertem Profil zulässig. Offen bleiben Tastatur/Screenreader, sichtbare Dateimanager-/Gatekeeper-Bedienung, Update/Rollback und menschliche Linux-/macOS-UAT. | **erledigt** |
| BL-010.12 | Ein Vorbereitungsbild mit Anzahl und Größe; danach passiver Fortschritt ohne Modal je Datei. Native Mehrfach-/Ordnerauswahl und Dragdrop verwenden denselben Core-Admissionpfad mit Pfad-, NUL-, Duplikat-, Format- und Größengates. Die Auswahl ist ausschließlich lokal sichtbar und startet erst über den zum gewählten Modus passenden Startbutton, ohne zweiten Picker. Vorher können einzelne eindeutig dargestellte Dateien entfernt oder die gesamte Auswahl geleert werden. Native Guards verhindern konkurrierende Auswahl/Start und unbemerktes Ersetzen einer vorbereiteten Auswahl. Die UI gruppiert die tatsächlich zugelassenen Quellen in direkt lesbare Textquellen und lokal in Markdown umzuwandelnde Quellen. Gesperrte, unbekannte und verschlüsselte Quellen bleiben Ergebnisse des vorgeschalteten Admissiongates und werden niemals als zugelassene Auswahl gezählt. RC115 hebt die zentrale Grenze auf 200 Dateien bei unverändert 500 MiB. E0 ist erledigt; offen bleibt ausschließlich E2 für Dragdrop, Auswahlkorrektur, Gruppendarstellung, 200 Dateien und 500 MiB. | **erledigt** |
| BL-010.13 | Bestehenden Sammelreview und Klar-Datei-Pfad wiederverwenden. **Start**, **Verarbeiten** und **Verlauf** trennen seit DS-086 Navigation und Laufzustand. Jede Verlaufszeile bindet ihre drei Aktionen an den eigenen `Lauf-*`-Ordner. Für **Ergebnisse öffnen** und **Zuordnungsdatei anzeigen** löst der Sidecar ausschließlich den vollständig sichtbaren Lauf bzw. dessen `DataSecure-Zuordnung.csv` auf; Rust validiert das private Ziel und startet Explorer/Finder/`xdg-open` sichtbar. Die Öffnungsaktion liefert dem Renderer nur eine inhaltsfreie Übergabebestätigung; ein separates `aria-live` überschreibt den Laufstatus nicht. Der UI-Kontext ergänzt ältere Exportrecords journalgebunden vor der Anzeige. Der reale Paket-Smoke verarbeitet vier Formate und prüft stabile Personen-/Firmenkennungen, unveränderte Quellen, exakten Lauf, Mapping und beide Resolver. RC115 schreibt die sichtbare Zuordnungsdatei mit UTF-8-BOM. Zähler gehören zum aktiven beziehungsweise ausdrücklich fortgesetzten Stapel, sonst zum jüngsten eigenen Stapel; ein interner Abschluss ohne sichtbaren Export bleibt `export_pending`. Der lokale Core-Reviewer ist für Standalone bewusst zuständig; Rohinhalt wird nicht in den Renderer verlagert. E0-Verträge sind geschlossen; sichtbare Zielhostbedienung bleibt E1/E2. | **erledigt** |
| BL-010.14 | Absturz-/Abbruchfortsetzung, genau ein aktiver Stapel, keine Doppelverarbeitung, Quellen unverändert und niemals automatisch gelöscht. Der öffentliche Stand zeigt vorhandene fortsetzbare Stapel als `stopped`/`resumable`; nach Sidecar-Neustart oder verlorenem Admission-Zustand setzt der Renderer die veraltete Startfreigabe zurück und verlangt eine neue lokale Auswahl. Echter Desktop-Absturz-/Neustart-UAT bleibt offen. | **erledigt** |
| BL-010.15 | MarkItDown 0.1.7 ist als gepinnter, produktiv deaktivierter DOCX-Differentialadapter implementiert: Byte-Stream, nur expliziter DOCX-Konverter, Plugins/Built-ins/Netzwerk/LLM/OCR aus, keine persistierte rohe Markdown-Datei. Engineering-Bridge mit `-I -S`, ohne Host-TEMP/PATH; ungerahmter, nicht authentisierter Testtransport. Optionales Vergleichsorakel, keine Voraussetzung und keine ausstehende Aktivierung für den RC108-Produktkonverter. | **erledigt** |
| BL-010.16 | Vereinfachter Konvertierungsbundle ist implementiert: vorhandene JS-Konverter statt CPython/MarkItDown im Nutzerpaket; gepinntes normales Node, PDF.js, Canvas, Tesseract und DE/EN-Modelle mit Hashinventar, Lizenztexten, SBOM und reproduzierbarer Projektion. Windows-Worker sowie die Läufe `34285518668` auf nativem Apple Silicon und `34318293471` auf nativem Intel prüfen die echte projizierte Runtime. Die App-Läufe `34321954381`/`34322534571` prüfen sie im gestarteten Bundle; `34334520861`/`34335259239` zusätzlich im entpackten Distributions-ZIP. RC109-PKG-04/INT-13 für Windows ist abgeschlossen. Python bleibt optionales Differentialorakel, keine Nutzerabhängigkeit. | **erledigt** |
| BL-010.17 | Eigener realer Konvertierungsworker über bestehenden Windows-/POSIX-Supervisor ist integriert: vollständige Byte-Eingabe, feste Antworten, CPU/RAM/Zeit/Ausgabegrenzen und bestätigtes Prozessende bei Abbruch. Windows bindet das Kind bereits bei Erstellung atomar an den Job; 60 frühe Abbrüche sowie Timeout und verweigerte Beendigung sind getestet. Die Läufe `34285518668` und `34318293471` belegen Supervisor, real isolierten Office-/PDF-/OCR-Worker und bestätigte Prozessgrenzen nativ auf macOS ARM64 und Intel. Keine neue Benutzerkonfiguration. Die aktuelle Windows-Paketkette ist abgeschlossen; menschliche Zielhostbedienung bleibt offen. | **erledigt** |
| BL-010.18 | Standalone markdown-only: XLSX/PPTX, Text-PDF, Scan-PDF und PNG/JPEG/BMP mit echter Offline-OCR umgesetzt. PDF-Seiten behalten nativen Text; auch gemalte Bildinhalte neben Seitenzahlen/Headern werden per OCR gelesen. Vergleichsnormalisierung verhindert identische OCR-Duplikate, zusätzliche Bildtexte werden gekennzeichnet; eine OCR-Session je PDF. Echte synthetische Inhalts-/PII-Erhalt-, Negativ- und Quellenhashprüfungen stehen. Unvollständige Extraktion bleibt als Hinweis sichtbar; gefährliche/defekte Quellen stoppen nur die Datei. Das erweitert weder den Cowork-Formatumfang noch die Vollständigkeitszusage für Originalcontainer; die Standalone-Markdown-first-Anonymisierung ist separat in BL-010.30 geregelt. Der neue Windows-Paketnachweis steht; ein breiter Zielhost-Korpus bleibt offen. | **erledigt** |
| BL-010.19 | Produktkonverter ist an die bestehende **Opt-in-Supportspur** gebunden: `converter_started`, `coverage_checked` nach erfolgreicher Vertragsprüfung sowie genau `converter_completed` nach Artefaktpublikation oder `converter_stopped` mit festem Fehlercode. Coverage-Prüfung behauptet keine vollständige Extraktion; Grad und Gründe bleiben im Artefakt/v5-Journal und der Zuordnung. Rust-Sidecar-Start und Batchworker reichen ausschließlich `EU_PRIVACY_SUPPORT_MODE=1` gezielt weiter. Normalbetrieb behält seine Interaktionslogs ohne zusätzliche Supportspur oder Nutzerformular. Echte Parser-/Spool-/Artefakt- und Negativtests prüfen Erfolg, Abbruch, unbekannte Fehler, Inhaltsfreiheit und wirkungslose Diagnosefehler; keine Rohinhalte, Namen, Pfade, Hashes, argv/env oder Vendor-Ausgaben im Log. | **erledigt** |
| BL-010.20 | Getrennte Standalone-Zielpakete für Windows x64, macOS x64/ARM64 und Linux x64 glibc mit Core, Konverter/OCR, Manifest, SBOM, Hashes und isolierten Smokes. RC140-Windows-PKG-04/INT-13 sowie die damaligen nativen Mac-/Linux-Läufe sind gebunden. **MAC-20260923-01–03 in RC141 technisch korrigiert:** Deployment-Target, Addon-Signatur und numerische Plist-Versionen; alle nativen Komponenten, LaunchServices und echte Konvertierungs-/Anonymisierungs-/Verlaufstests bestehen auf Intel/ARM (`35875613438`, Quellcommit `1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542`). Neue ZIPs lokal verifiziert und samt Prüfsummendateien unverändert im dauerhaften Mac-Vorabrelease `v3.2.0-rc141` veröffentlicht; Tag, Größen und Asset-Digests geprüft. Zweifach bytegleiche Archivierung aus je einem nativen App-Build, kein unabhängiger Compiler-Doppelbau. Veröffentlichte RC140-ZIPs bleiben unverändert. Developer-ID/Notarisierung bleiben für breite Verteilung erforderlich; Ad-hoc-Pilot mit app-spezifischem **Dennoch öffnen**, ohne globale Schutzabschaltung. Sichtbare Finder-/Gatekeeper-/13.5-/Rollback-UAT bleibt getrennt. | **erledigt** |
| BL-010.21 | E1/E2-UAT beider Betriebsarten auf Windows sowie nativ auf macOS Intel/Apple Silicon und für Standalone zusätzlich Linux x64: tatsächlicher Browser-Download beider Release-Dateien, Prüfsumme, Finder-Entpackung, Kopie nach Programme, LaunchServices/Gatekeeper beziehungsweise Desktop-Integration, erste Nutzung und synthetischer Konvertierungs-/OCR-Lauf aus genau dieser Installation, falsches Architekturpaket, 200 Dateien/500 MiB, gemischte Formate, Picker/Drop und expliziter Start, Fehler/Crash/Resume, Offline-Lauf, Ergebnis-/Zuordnungsfund, VoiceOver beziehungsweise Linux-Screenreader/Tastatur/Zoom/Fokus/Dark Mode, Kaltstart/RAM/Paketgröße und verständliche DE-Texte. Die deklarierte Mac-Mindestversion 13.5 benötigt separate Ausführung oder eine explizit höhere Mindestversion. Reine Konvertierung erhält Inhalte und zeigt Extraktionshinweise ohne PII-Review; fachlicher Sammelreview gehört zur Anonymisierung. Ein ARM-Lauf unter Rosetta ersetzt keinen Intel-Nachweis. | **offen** |
| BL-010.22 | Produktisolation: eigener Standalone-Root und gebundener Journal-Kanal; v5-Konvertate besitzen ausschließlich `dm_`-Identitäten ohne Privacy-Capability und werden an Plugin-Listing, Handoff, Read und ACK abgewiesen. RC109 startet beide tatsächlichen Produktprojektionen parallel in getrennten Prozessen und Datenwurzeln; kopierte fremde Journale werden vor jedem Quellen-/Artefaktzugriff abgewiesen. Paketverträge verhindern Plugin-/Skill-/MCP-Entrypoints und Cloudfunktionen im Standalone-Produkt. Gleichzeitige Starts beider wirklich installierter Zielhostprodukte bleiben E1-offen. | **erledigt** |
| BL-010.23 | Gemeinsamer Corevertrag für den **Anonymisierungsmodus**: gemeinsame Core-/Privacy-Bytes der tatsächlichen Produktprojektionen sind durch Fingerprint und semantischen Golden-Korpus gebunden. Neue Privacy-Journale persistieren zusätzlich den exakten SHA-256-Fingerprint der ausführungsbestimmenden gemeinsamen Policydateien; Fortsetzung mit abweichender Policy stoppt, während kompatible Altdaten ohne Feld nur bei exakt passender Regelversion lesbar bleiben. TXT, Markdown, CSV und DOCX laufen in beiden Produkten durch alle fünf Profile; Abbruch, frischer Prozess, Review und Fortsetzung prüfen stabile Personen-/Unternehmensbijektion. Reine Markdown-Konvertierung bleibt ein eigener Zweck ohne PII-Ersetzung oder Privacy-Fingerprint. E0 ist erledigt; Zielhost-/Fachabnahme bleibt E1/E3. | **erledigt** |
| BL-010.24 | Offline-/Environment-Vertrag: Kindprozesse erhalten nur allowlistete OS-/DataSecure-Werte, keine geerbten Proxy-, Token-, API-Key-, Agent- oder Cloudwerte. Echter Konverter startet mit leerem PATH, gebündelten Ressourcen, Node-Berechtigungsgrenze und `network-deny`; lokale Modelle benötigen keinen Download oder Cachewrite. RC109 prüft beide tatsächlichen Produktprojektionen mit jeweils elf nativen DNS-/TCP-/TLS-/HTTP-/UDP-/Fetch-/Proxy-Canaries und genau einem kontrollierten produktübergreifenden Kopierversuch. Paket-/Zielhost-E2E bleibt E1-offen. | **erledigt** |
| BL-010.25 | Eigenes Standalone-Manifest, SBOM und Runtime-Evidence einschließlich Konvertierungsressourcen sind implementiert; kein Netzwerk-/Auto-Updater. Das RC109-Inventar erfasst 259 erreichbare Nicht-Dev-Crates und enthält kein `NOASSERTION`; automatisierte Lizenz-/SBOM-Verträge sichern diesen Stand. Manueller Update-/Rollbackweg durch Paketaustausch und Deinstallation sowie die Wechselwirkung mit dem anderen installierten Produkt bleiben Zielhostabnahme. | **erledigt** |
| BL-010.26 | Diagnose-/Fehlerübersetzung: getrennte Produktkanäle, feste Konverterfehlercodes und rotierende, über **Diagnose öffnen** erreichbare Desktop-/Sidecar-JSONL-Spuren ohne Rohinhalte, Namen, Pfade oder Request-IDs. Zielresolver-/OS-Öffnereignisse und sichtbare Version bleiben erhalten. Der reine Produktkonverter einschließlich PDF/OCR liefert bei ausdrücklichem Support-Opt-in die vier geschlossenen Ereignisse aus BL-010.19; echte Parser-/Abbruch-/Sentineltests stehen E0. Interne `CONVERSION_OCR_STARTING/READY` dienen weiterhin nur der echten Prozessprüfung; stderr wird nicht als Log kopiert. Keine neue Einstellung oder Bestätigungsrunde. Der aktuelle Paketnachweis einschließlich Supportspur ist abgeschlossen; Windows-/macOS-/Linux-UAT der Standalone-Meldungen und Diagnosebedienung bleibt offen. | **erledigt** |
| BL-010.27 | Releasehygiene des Standalone-Piloten: Windows verwendet das vorhandene System-WebView2 ohne Laufzeitdownload; verständlicher Fehlhinweis und UAT bei fehlender Runtime. Die Builder-Toolchain ist mit `rust-toolchain.toml` exakt auf Rust 1.98.1 gebunden; erreichbare ausgelieferte Crates werden komponentenweise lizenzgeprüft und mit belastbaren Lizenzwerten in das SBOM übernommen. Native Dragdrop-Aufnahme ist E0 implementiert; echte Zielhost-Drop-/Fokusprüfung bleibt offen. Pause bleibt außerhalb der Istzusage. | **erledigt** |
| BL-010.28 | Zweite Standalone-Kernfunktion **Nur in Markdown umwandeln** (DS-085/088): verfügbare Kernfunktion ohne PII-Ersetzung/-Review; keine Vorbelegung seit DS-086. Namen und Inhalte bleiben erhalten. Sichtbare Ergebnisse übernehmen den Quellbasisnamen mit `.md`; case-/Unicode-gleiche Kollisionen erhalten deterministisch ` (2)`, ` (3)` usw. Eine Zuordnungsdatei entfällt in diesem selbsterklärenden Modus. v5-Zweckbindung, eigener Offline-Worker, `dm_`-Artefakte, Recovery und v4-Export nach `DataSecure-Markdown/Lauf-…` sind integriert; bestehende v3-Exporte bleiben final. TXT/MD/CSV/DOCX/XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP; Warnungen ohne zusätzliche Rückfragen, Fehler je Quelle. Keine KI-Übergabe. Zielhost-UAT des neuen Bedienvertrags bleibt offen. | **erledigt** |
| BL-010.29 | Startseite und laufgebundener Verlauf (DS-086/088): Start immer sichtbar, keine automatische Ergebnisnavigation, Betriebsart anfangs leer. Die 20 neuesten Standalone-Verarbeitungen als Tabelle mit Datum, Zweck, Zählern und Status; Ergebnis und Fortsetzung binden ausschließlich den gewählten Lauf. Zuordnung ist nur bei Anonymisierung aktiv und bei reiner Konvertierung begründet deaktiviert. Historie über Neustart/Journalablauf und Ergebniszielwechsel erhalten, Ein-Stapel-Guard und geschlossene private IPC. Keine Rohinhalte oder Pfade in Diagnoselogs; 20 ist nur Anzeigegrenze. Implementierung und gezielte Tests stehen; menschliche E2-Abnahme bleibt offen. | **erledigt** |
| BL-010.30 | Standalone-Markdown-first-Anonymisierung nach DS-087, DS-090 und DS-098: DOCX/XLSX/PPTX/PDF/Scan-PDF/PNG/JPEG/BMP genau einmal im isolierten Offline-Worker zu einer neutralen Markdown-Extraktion verarbeiten und gültigen, nichtleeren Inhalt ohne sichtbares `dm_`-Zwischenartefakt durch den vorhandenen Privacy-Core führen. Anonymisiert und ausgegeben wird ausschließlich die Markdown-Repräsentation, nie der Originalcontainer. Bei DOCX werden vollständig validierte Kopf-/Fußzeilen und ausschließlich dort referenzierte Bilder nur im Anonymisierungszweck nicht projiziert; reine Konvertierung erhält sie. Extraktionsabdeckung (`complete`/`incomplete` plus feste Gründe) und Anonymisierungsstatus werden unabhängig ausgewiesen; `incomplete` ist keine Behauptung unvollständiger Markdown-Anonymisierung. Leere/Whitespace-Extraktion, `OCR_TEXT_EMPTY`, unbekannte Coverage, beschädigte, verschlüsselte oder aktive Quellen stoppen die betroffene Datei. Direkte und konvertierte Quellen teilen stapelweit Personen-/Unternehmenspseudonyme, vorhandenes v4-Journal/Recovery und Mapping `Original → anonymisierte Markdown-Datei`. Pflicht: neutraler Extraktionsvertrag, Recoverybindung, Mixed-Batch-/Resume-/Residual-/Cross-Read-/Offline-/Pakettests und ehrliche UI/Dokumentation. RC121 bindet den realen DOCX-UAT-Befund, Markdown-escapte E-Mail-Adressen und den ausgelieferten Sidecar durch synthetische Paketregressionen; auch die spätere Sammelreview-Publikation übernimmt den Standalone-Kanal ausdrücklich und behält Scope sowie Coverage bei. RC123 projiziert einen nicht bestätigten Konverterabbruch auch aus dem breiten Journal-Schema `/6` als `termination_unconfirmed`, damit die lokale Oberfläche den gespeicherten Abbruchgrund nicht verliert. Der Cowork-Officeausbau ist getrennt unter BL-010.34 gebunden. | **erledigt** |
| BL-010.31 | Vorbereitete Auswahl und Ergebnisaktionen nach DS-088: einzelne Dateien vor Start über einen indexgebundenen, längengerahmten privaten IPC-Befehl entfernen; letzte Datei oder **Auswahl leeren** setzt Admission und UI vollständig zurück. Die lokale Liste nutzt eindeutige Quelllabels, ohne sie zu protokollieren. Gleicher Vertrag für beide Funktionen, unveränderlicher Stapel nach Start. **Ergebnisordner** steht auch unter Verarbeiten bereit, übernimmt beim App-Start keinen historischen Lauf und wird erst durch einen exakt neu in dieser UI-Sitzung gestarteten vollständigen Lauf aktiviert; alte Läufe bleiben ausschließlich über die Historie erreichbar. JS-, Rust-, IPC-, Frontend- und Paketregression; E2-Zielhostbedienung offen. | **erledigt** |
| BL-010.32 | Reproduzierbarer Standalone-UAT-Korpus mit genau 100 synthetischen Dateien: elf Eingabearten, jeweils kurz/mittel/groß, Fließtext-, Tabellen-, Mehrseiten-, Mehrblatt-, Präsentations- und OCR-Beispiele. Manifest und README liegen außerhalb des auswählbaren Eingabeordners, damit ausschließlich die 100 vorgesehenen Testeingaben verarbeitet werden; die Produktgrenze liegt bei 200 Dateien. Der Korpus prüft direkte beziehungsweise Markdown-first-Anonymisierung und rekursive Ordneraufnahme aller Unterordner. Generator und ZIP bleiben frei von echten Personendaten. Der exakt gebundene RC134-Windows-Sidecar hat alle 100 Dateien im Modus `markdown-only` in 50,892 s Verarbeitungszeit beziehungsweise 51,092 s gesamter Harnessdauer ohne Fehler verarbeitet, die vollständige relative Struktur erhalten, keine Zuordnung erzeugt und alle Quellhashes unverändert gelassen; die sichtbare Zielhost-UAT sowie der 100-Dateien-Anonymisierungslauf mit gegebenenfalls menschlichem Review bleiben offen. | **erledigt** |
| BL-010.33 | Strukturtreuer Standalone-Export nach DS-089 und DS-091: Die Wurzel-relative Herkunft einer Ordnerauswahl bleibt von der sicheren Rekursion über Queue und Journal bis zum sichtbaren Lauf erhalten. Vor Start wählt der Anwender für Anonymisierung **neutral** (datensparender Standard: `Dokument-NNN-anonymisiert.md`) oder **Originalname mit -anonymisiert** (`<Quellbasis>-anonymisiert.md`); die Zuordnung nennt in beiden Fällen exakt `relativer/Quellpfad` → `relativer/Ergebnispfad`. Die Wahl ist ohne Zusatzbestätigung pro Stapel in `datasecure-batch/6` unveränderlich gebunden; alte Standalone-v4-Läufe, reine Konvertierung (`<Quellbasis>.md`, keine Zuordnung) und Cowork (immer neutral/flach) bleiben unverändert. Segmente werden gegen absolute Pfade, Traversal, Links und Verzeichnistausch geprüft; Kollisionen bleiben deterministisch. E0-UI-/Rust-/IPC-/Worker-/Journal-/Export-/Recoverytests; E2-Zielhost-UAT offen. | **erledigt** |
| BL-010.34 | Cowork-Markdown-first-Office nach DS-093: XLSX/PPTX nach sicherem OPC-Preflight im ausgelieferten isolierten Parser extrahieren, Tabellen für den Privacy-Core normalisieren und ausschließlich die nichtleere Markdown-Repräsentation anonymisieren. `source_extraction_coverage` bleibt mindestens `incomplete/SOURCE_COVERAGE_UNVERIFIED`, während `document_result` die vollständige Privacy-Prüfung des extrahierten Inhalts ausweist. Genau ein Picker, kein Roh-Zwischenexport, neutrale Namen, privates Mapping und unveränderte Originale. E0 umfasst reale isolierte Officeparser-, Admission-, Batch-, Paket- und Cross-Produkt-Regression; E1/E2 Cowork-Zielhost-UAT offen. PDF/Scan-PDF/Bilder bleiben bis zum kompakten, paketierten und nativ belegten OCR-/PDF-Pfad offen. | **erledigt** |
| BL-010.35 | RC136-UAT-Härtung nach DS-100: rekursive Standalone-Aufnahme überspringt ausschließlich belegte Office-Besitzerdateien `~$*.docx/xlsx/pptx`, nachdem Link-/Dateitypprüfung, kleine Artefaktgröße, fehlende eigene OPC-Signatur und eine passende größere OPC-Quelldatei im selben Ordner bestätigt wurden. Ein echtes OPC-Dokument wird nie allein wegen seines Namens verworfen; direkte Artefaktauswahl wird fest abgewiesen und nur die Anzahl erscheint lokal. Ein App-Neustart projiziert keinen inaktiven Altstapel, kein altes Ergebnis und keine Fortsetzungsaktion in die aktuelle Prozesskarte. Historische Fortsetzung bleibt exakt laufgebunden im Verlauf; Start-Recovery bereinigt weiterhin verwaiste Sperren und unvollständige Veröffentlichungen, ein lebender Worker wahrt die Ein-Stapel-Sperre. Golden-, Admission-, Service-, Frontend-, History- und Recoverytests sind E0-grün; RC137 bindet Windows-PKG-04/INT-13 sowie native Windows-/macOS-/Linux- und Cowork-Zielpakete. Sichtbare Zielhost-UAT bleibt offen. | **erledigt** |
| BL-010.36 | DS-102: RC140-Regression der reinen Windows-Konvertierung für interaktive PDFs und PPTX mit eingebetteten OLE-Objekten behoben, ohne die strengere Anonymisierung oder Cowork zu öffnen. Passive Objekte werden nicht ausgeführt oder nachgeladen; Extraktionsstatus bleibt `incomplete`. Isolierte Worker-, Admission-, Produktgrenz- und fünf reale Paket-Dateiprüfungen bestanden. RC142-Windows-PKG-04/INT-13: zwei bytegleiche Builds, native Smokes, Commit `c0ddd11`. Mac Intel/ARM: ZIP und zusätzlich DMG aus derselben signierten `.app`, Mount, `/Applications`-Link, Signatur, Start und Hash im grünen Lauf `36562812021`. Alle zehn Release-Asset-Digests lokal abgeglichen. DMG bleibt bis Developer-ID/Notarisierung interner Pilot; sichtbare Zielhost-UAT offen. | **erledigt** |
| BL-010.37 | Standalone ergänzt vor **Starten** weitere Dateien oder rekursive Ordner über Picker/Drop, ohne Duplikate; ungültige Nachträge, Dialogabbruch und Überschreiten der kombinierten 200-Dateien-/500-MiB-Grenze lassen die bestehende Auswahl unverändert. Der laufende Stapel bleibt unveränderlich. Frontend-, Rust-, Service- und realer Sidecar-Pakettest bestanden; die Änderung ist im RC151-Standalone aus sauberem Commit veröffentlicht. Der Windows-Funktionslauf belegt die Verarbeitung einer rekursiven 140-Dateien-Auswahl, aber nicht jeden Ergänzungs-/Limit-/Abbruchfall in der sichtbaren UI. | **erledigt** |
| BL-010.38 | Standalone trennt abgeschlossenen Lauf und frische Vorbereitung; Abschluss zeigt keine alte Eingabequeue, der neue Lauf erbt weder Modus noch Quellenordner. Vollständig gestoppte Läufe und Teilerfolge werden als Warnung ausgewiesen. Frontend-/Service-Regressionsprüfung und RC151-Paketbindung sind erfolgt. Der Anwender hat auf Windows Folgeläufe in beiden Modi ausgeführt; die vollständige E2-Bedienabnahme der Zustandsübergänge bleibt getrennt offen. | **erledigt** |
| BL-010.39 | DS-103: Standalone anonymisiert nach passiver Markdown-Extraktion auch PDF/Scan-PDF und PPTX. Formulare, Skripte, Anhänge, Signaturen, Links, Lesezeichen und OLE werden nicht ausgeführt und können ausgelassen bleiben; `source_extraction_coverage` bleibt getrennt und unvollständig. Nur der extrahierte Markdown-Inhalt wird anonymisiert und residualgeprüft. Leere OCR, verschlüsselte/beschädigte Quellen, XFA, Makros, ActiveX, externe Vorlagen und unbekannte Objektklassen stoppen weiter; Coworks strengere Admission bleibt unverändert. Reale Paket-/Batch-/Quellhash-/Coverage-/Mappingtests und der RC151-Windows-Gesamtlauf mit 140 anonymisierten Ausgaben belegen E0 und den positiven Zielhostpfad; Negativgrenzen und Quellvollständigkeit sind dadurch nicht fachlich freigegeben. | **erledigt** |
| BL-010.40 | RC144-Windows-Befund: Der lokale Sammelreview war bei 11/12 unsichtbar. RC145 startete den Dialog ohne versteckten Top-Level-Start; im sichtbaren Windows-Test erschien er und der Stapel endete nach lokaler Entscheidung mit 11 Ergebnissen und einem sicheren Stopp. Die folgende Fundstellen-UX benennt den konkreten Text und hebt ihn in Quelle und Arbeitsfassung hervor; ein echter WinForms-Dialogtest prüft den Wechsel zwischen Fundstellen. Navigation und Abschlussstatus erklären aktiven Review und gesperrten Ergebnisordner. Alle Änderungen sind im RC151-Paket gebunden; eine sichtbare RC151-Prüfung jeder Reviewaktion auf Windows und macOS bleibt E2, nicht neue E0-Arbeit. | **erledigt** |
| BL-010.41 | RC147-Windows-Befund: Fünf PPTX stoppten mit `SOURCE_ACTIVE_CONTENT_UNSUPPORTED`. Standalone lässt seitdem nur bekannte passive PPTX-Metadaten-/Diagrammstilbeziehungen und intern geprüfte XLSX-Einbettungen zu; OLE bleibt ausgelassen, Coverage `incomplete`, Makros/externe Pakete und Coworks strengere Admission bleiben gesperrt. XLSX bleibt wegen Blatt- und Strukturverlust direkt Markdown-first statt CSV-Zwischenschritt. Synthetische Positiv-/Negativfälle, schreibgeschützte Extraktion der fünf Quellen und ein echter Windows-Paketbatch bestanden; die Änderung ist im RC151-Paket veröffentlicht. Ob genau die fünf alten Benutzer-PPTX im RC151-Korpus enthalten waren, ist aus dem 140-Dateien-Abgleich nicht belegt und bleibt ein gezielter E2-Nachweis statt eines erneuten Gesamtbuilds. | **erledigt** |

| BL-010.42 / BL-021.3 | RC149 ergab 138/140 Privacy-Ergebnisse; zwei DOCX stoppten wegen „Service Level“ und „Fail Closed“ als unlokalisierbaren Rest-Personenkandidaten. Exakt einfache technische Tabellenzellen gehen nun in den positionsgebundenen lokalen Review; sensible Labels, transformierte Zellen und direkte Identifier bleiben strikt. Gleichartige normalisierte Kandidaten werden pro Prüfgruppe einmal entschieden, intern aber an jeder Fundstelle geprüft. Die Abschlussansicht lädt Dateinamen mit `batchId` aus dem privaten Journal. Gezielte E0-Tests und der paketierte RC151-Windows-Gesamtlauf mit 140/140 anonymisierten Ergebnissen sind erfolgt; sichtbare Einzelbedienung auf beiden Plattformen und vollständige Quellabdeckung sind weiterhin eigene Abnahmepunkte. Keine automatische Freigabe unbekannter Personen. | **erledigt** |
| BL-010.43 / BL-021.4 | Der RC150-Inhaltsabgleich deckte verlorene Einleitungssätze, überanonymisierte technische Titel sowie nicht ersetzte synthetische Namen in Begleitdateien auf. Der Privacy-Core begrenzt Organisationsspannen, erfasst Personen in nummerierter Prosa und sensiblen Tabellenzellen, bewahrt beschreibende Titel und ersetzt bindestrichgetrennte Vollnamen vor bloßen Nachnamenaliasen. Der unabhängige Restcheck bleibt aktiv. Gezielte positive/negative Regressionen und der veröffentlichte RC151-Gesamtlauf sind erfolgt; dessen schreibgeschützte Inhaltsnachprüfung bestätigt ausgewählte Sollstellen, 2168 CSV-Beschreibungen und Identitätsanker. Eine vollständige menschliche Satz-für-Satz-/OCR-/Originalcontainerprüfung ist damit nicht behauptet; alte RC150-Ausgaben bleiben unverändert. | **erledigt** |
| BL-010.44 | **Standalone-only Review-UX nach DS-104:** Eigenes berechtigungsarmes App-Reviewfenster ohne Rohtext im inhaltsfreien Haupt-Renderer und ohne Cowork-/MCP-Abhängigkeit. Flüchtiger 40-MiB-Broker, 128-KiB-Frames, exakter Fundstellentext, Gruppenentscheidung, „Später entscheiden“, laufgebundene Fortsetzung und asynchroner Fensterbau sind umgesetzt. Mehrere Prüfphasen bleiben mit Arbeitsindikator im selben Fenster; der bestätigte Laufabschluss schließt es. RC157 bietet „Jetzt prüfen“ direkt in der aktuellen Laufkarte und lehnt historische Ersatzläufe nach Verbindungsneustart ab. JS-/IPC-/Rust-/Pakettests und nativer Windows-Start bestehen. RC156 `ca4349c5` und RC157 `3d6b69b7` einschließlich lokaler Prüfung und Stapelverarbeitung sind vom Anwender bestanden bestätigt; letzterer enthält 140/140 Ergebnisse. Die E0-Lieferung ist fertig. Andere Zielhosts, A11y und vollständige Negativ-/Recovery-Abnahmen stehen getrennt in Abschnitt B und der Evidence-Matrix. Kein RC151-Bestandteil. | **erledigt** |
| BL-010.45 | **Vertrauliche automatische Identitätszuordnung nur für Standalone:** Personen-, Unternehmens- und Projektpseudonyme werden lauf-/dateigebunden privat erfasst; `[PERSON_011]` ist nur ein Beispiel. Generische Masken und unklare Quellen gelten nicht als 1:1-Zuordnung. Die lesbare TXT wird einmalig im markierten Unterordner `VERTRAULICH-NICHT-HOCHLADEN` des gebundenen Lauf-Ergebnisordners abgelegt; private Einzelsnapshots bleiben im App-Datenbereich. **Der ganze Laufordner darf damit nicht an KI-Systeme übergeben werden**, nur einzeln geprüfte anonymisierte Markdown-Dateien. Der Verlauf öffnet die Datei laufgebunden lokal; ältere private Zuordnungen bleiben über Einstellungen erreichbar. Kein automatisches Löschen und kein App-Löschbutton; eine manuell entfernte sichtbare Kopie wird nicht neu angelegt. Cowork und Privacy-Entscheidungen bleiben unverändert. RC156-Modul-/Verlaufstests und der isolierte Paket-Sidecar-Lauf mit realen TXT/MD/CSV/DOCX-Dateien bestätigen die vertrauliche TXT im markierten Lauf-Unterordner; noch offen: sichtbare Zielhost-/Recovery-/A11y-Abnahme, Bedrohungsmodell, Datenträgerverschlüsselung/Backup-Hinweis und vollständige Originalwertabdeckung an realen Formaten. Keine Anonymitäts- oder KI-/Rechtskonformitätsgarantie. | **in Arbeit** |

#### Neue Befunde vom 05.10.2026

| Story | Umsetzung und Nachweisgrenze | Status |
|---|---|---|
| BL-010.46 | **Standalone-Review und Fehlerworkflow nach DS-106:** Unternehmensentscheidung bis ORG und vertraulicher Zuordnung; authentifizierte lauf-/Seed-/Policy-gebundene Wiederverwendung vollständiger Schreibweisen über offene Prüfphasen und Neustart. Keine rückwirkenden Änderungen fertiger Dateien oder Erweiterung von Coworks Reviewadapter. Fehlerlisten nennen Datei mit Endung, Code, Ursacheklasse und nächsten Schritt; fehlende Hauptfenster-Capability ist korrigiert. Der echte Cross-Placeholder-Restprüfungsfehler erreicht jetzt vier exakt gebundene Kandidaten. Konservative Grafik-/OCR-Bereinigung erhält echte Texte und benennt Auslassungen. Ursprünglicher E0-Schnitt: 133 Testdateien der CI-Suite, 38 paketierte Konvertierungsgruppen, zusätzliche Review-/Journal-/Capturetests und elf reale PDF-Seiten. Technische Lieferung und neue native Windows-/Mac-Paketgates sind in RC158 veröffentlicht; neue bediente Abnahmen bleiben BL-010.50. Neuer, separat zu diagnostizierender Kolleginnen-Befund unter BL-010.47. | **erledigt** |
| BL-010.47 | **Windows-Komplettausfall bei Kollegin:** Gemeldet sind Probleme aller Dokumente mit RC157, während der lokal geprüfte Lauf 9/10 Ergebnisse erzeugte. Die Diagnose kann derzeit nicht bereitgestellt werden. Die neuen sicheren Start-/Konvertercodes und Dateilisten aus BL-010.48 ermöglichen eine gezielte Gegenprobe; ohne gerätebezogene Fehlermeldung oder Reproduktion bleibt die konkrete Ursache offen. Nächster Schritt: den neuen Kandidaten auf diesem Rechner prüfen und den angezeigten festen Code samt betroffenen Dateinamen zuordnen. Geräteevidenz fehlt; kein Beweis für Antivirusblockade und keine pauschale Gleichsetzung mit dem behobenen Cross-Placeholder-Fehler. | **offen** |
| BL-010.48 | **Standalone-Integration und Fehlerverhalten nach DS-107:** echte typisierte Unternehmensentscheidung über Desktop-IPC; einheitliches Reviewbudget; lauf-/startversuchsgebundene First-Draft- und Workerfehler mit konkreten Ursachecodes und vorgemerkten Dateien; RPC-Deadline einschließlich Sperre/Spawn/Schreiben; eigener begrenzter Shutdown unabhängig von RPC; sichtbare gestoppte und ausstehende Dateilisten trotz Zuordnungsschuld; atomare Admissionfehler mit Dateinamen/Endung und nächstem Schritt; erfolgreiche native Review-IPC-Antwort statt falsch grüner Seiten-/Requestprüfung, ehrliche Plattform-Skips und versionierte UI-Fixtures. E0 technisch umgesetzt, gezielt geprüft und in RC158 veröffentlicht; Windows-/Mac-Paketbindung und Gesamtgate siehe Evidence-Matrix. Keine behauptete native Mac-Bedienabnahme oder Publisher-Signierung. | **erledigt** |
| BL-010.49 | **Mehrdimensionale technische Gegenprüfung nach DS-108:** bestätigte Marker-/Credential-Leaks, vorgelagerte Reviewbudget-Lücke, Renderer-Lade-/ACK-/Fortsetzungsrennen, native Fenster- und Spawn-/Shutdownbindung, POSIX-Cancellation, langsame Aufnahme, innere Windows-Konverterursachen und unvollständige Paket-/Plattformtests korrigiert und nochmals unabhängig technisch gegengeprüft. Ursprünglicher E0-Schnitt: 136 Produkttestdateien, 39 Rust-Tests/Clippy, reale Windows-/WSL-Gegenproben und finaler ZIP-Review-E2E mit 6.001 Fundstellen. Technisch E0 erledigt und später in RC158 veröffentlicht: Evidence-Matrix trennt Source, paketierten Worker, Rust/Supervisor und bediente GUI; die verbleibende neue Zielhost-/Bedienkampagne liegt ausschließlich in BL-010.50. | **erledigt** |
| BL-010.50 | **Exakter neuer Kandidat – bediente native Reviewkampagne:** ausführbare Kampagne auf Windows sowie macOS Intel/Apple Silicon mit zwei echten Tauri/WebView-Sitzungen, Vertagen/Neustart, Person-/Unternehmensentscheidung, automatischer Folgegruppe, laufweiter Übernahme und konkretem Fehlerdateinamen durchführen. Paket-/Source-IPC und reine Seitenladung ersetzen diesen Nachweis nicht. Vorbereitung ist ausdrücklich NOT_RUN, PASS verlangt Bedienattestation und geprüfte Ausgaben. Bereits bestätigte frühere Windows-Anwenderläufe werden dadurch nicht zurückgenommen. | **offen** |
| BL-010.51 | **Gezielte Methodenadaption aus offizieller Recherche (DS-108):** unabhängige Qualitätsmetriken je Entitätsart/Format/OCR-Weg einschließlich Fehlanonymisierung sind technisch umgesetzt und mit 72 synthetischen Formatvarianten gemessen (BL-050.5–.7). Windows- sowie Intel-/Apple-Silicon-Engineering-Pakete sind einschließlich tatsächlicher OCR-Korrektur, Review und Neustart gebunden; konkrete Nachweisgrenzen stehen in der Aktualisierung vom 06.10.2026. Roh-OCR-Qualität, menschliche Referenz-/Bedienabnahme, volle Qualitätsmessung am exakten Mac-Archiv, seeded modellbasierte Zustandsfolgen und spätere attestierte Buildherkunft bleiben getrennte Restarbeit. ACK-Receipts sind nur nach atomarem Identitäts-/Wirkungsvertrag sinnvoll. Die atomare Windows-Job-List-Zuweisung ist bereits vorhanden; eine künftige Kombination mit eingeschränkten Primärtokens wäre separat zu prüfen. Quellen und sofort adaptierte Teile stehen in DS-108; keine neue Cloudverarbeitung oder NLP-Pflichtabhängigkeit. Diese Erweiterung ist nicht blockiert und kein Wiederöffnen früherer bestandener Anwenderläufe. | **in Arbeit** |
| BL-010.52 | **Revalidierte Architektur-/Inhaltskorrekturen DS-109:** Standalone-Gesprächsnamen mit exakten Grenzen, konservative OCR-Gleichheits-/Malreihenfolgenprüfung, gestreamte Identität und ehrliche Kopierwarnung/Header, typisierte Kapazitäts-/Loader-/Schutzgrenzenfehler, eng erkannte und benannte OS-Metadaten, native Startdiagnose/Child-Reaper, stabile History-Aktionen, Backend-Dokumentkarte und geschlossener Desktop-Fehlervertrag implementiert. Letzte Gegenbeispiele zu Abteilungssuffix und Identitäts-DTO korrigiert; Wiederaufnahmevertrag unabhängig revalidiert und durch 13 Runner-Regressionen gesichert. Technisch E0 erledigt und in RC158 veröffentlicht: final 195 Produkttestdateien, 49 Windows-Rusttests/Clippy, 41 echte Konvertierungsgruppen, sauberer Windows-Doppelbau und beide native Mac-ZIP-/DMG-Paketgates bestanden; Einzelumfang und Hash in der Evidence-Matrix. Veröffentlichungsgebundener Cowork-Build bestand am sauberen Quellcommit, ohne Cowork neu zu veröffentlichen. Kein MVC-Neubau. Neue bediente Zielhostkampagne und Qualitätsmetriken bleiben ausschließlich BL-010.50/51. | **erledigt** |

DS-105 bindet BL-010.45 an die ausdrückliche Entscheidung: keine automatische
Löschung der vertraulichen lokalen Identitätszuordnung.

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
| Paket und Produkte | Standalone-Runtime/SBOM/Offline-Smoke; Cowork-Allowlist unverändert | ZIP-/Runtime-/Produktisolationsgates | **RC111 aus `b543589f` besteht nach Korrektur des Harnessfehlers die vollständige Regression und PKG-04: zwei saubere bytegleiche Builds, beide Paket-/Worker-/History-/Sidecar- und sichtbaren nativen Windows-Smokes. INT-13 ist an genau diesen Commit und ZIP-SHA-256 `6086d1eb…69f8f` gebunden. Der gesperrte Cachetestrest stammt ausschließlich aus dem historischen RC109-Kontrolllauf; der neue Kandidat bereinigt beide eigenen Profile vollständig. Native macOS-App-Bundle-/IPC-E0 sowie reproduzierbare, entpackt gestartete Engineering-ZIPs sind auf Intel und ARM belegt; Linux x64 besitzt denselben technischen AppImage-/Paket-/Lifecycle-E0. Sichtbare E1/E2 bleiben auf macOS und Linux offen.** |

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
| UX, Diagnose und Paketnachweis | BL-010.19/21/26/28/31 | Picker/Drop → korrigierbare Auswahl → Ziel → Start → Fortschritt → Ergebnis; explizite Funktionswahl gemäß DS-086, **nicht anonymisiert** sichtbar ohne Rückfrageserie. Zuordnung nur für Anonymisierung. Worker-/Native-Abbruch-Negativtests und persistente Opt-in-Konverter-/Coverage-Ereignisse stehen E0; normale Interaktionslogs bleiben standardmäßig verfügbar. Mac-Zielhost separat. | **E0 und RC134-Windows-PKG-04/INT-13 erledigt; E1/E2/E3 sowie Cowork-/macOS-Paketbindung offen** |

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
die nativen Intel-/ARM-E0-Binärbuilds sind durch die Läufe `34318293471` und
`34285518668` belegt. Die App-Bundle-/IPC-Nachweise `34321954381` und
`34322534571` sind ebenfalls grün; Distributionsarchive und Gatekeeper-UAT
bleiben unter BL-010.20/21 offen.
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
Abschlussmeldung sind E0 implementiert. Native Intel-/ARM-Binärbuilds und echte
ad-hoc signierte App-Bundles sind automatisiert belegt; Distributionsarchive
sowie Gatekeeper-, Review- und Sichtbarkeitsevidenz bleiben menschliche
Zielhostabnahme unter BL-010.20/21,
BL-012.9/10 und BL-051.

### P0 – einfacher lokaler Sammelreview nach DS-068

Der verbindliche Detailvertrag ist
[`contracts/BATCH_REVIEW_V2.md`](contracts/BATCH_REVIEW_V2.md). Die drei vom
Product Owner bestätigten Lieferungen sind für Windows E0 umgesetzt; der
gleichwertige einzelne macOS-Sammeladapter ist nun ebenfalls E0 vorhanden.
Zielsystem- und Anwenderevidenz folgt getrennt und ersetzt die Implementierung
nicht.

| Priorität / Story | Detaillierte Lieferung | E0-Abnahmekriterium | Status / Rest |
|---|---|---|---|
| 1 · BL-012.9 | Den bestehenden lokalen Sammelreview als einzigen Reviewweg behalten. Nur `deferred_review`-Dateien werden lokal rekonstruiert; Reviewtext bleibt in `stdin`/Speicher, Journal, MCP und Diagnose bleiben inhaltsfrei. Abbruch, Vertagung, Timeout und Teilpublikation bewahren vorhandene Ergebnisse. | Windows-Sammeloberfläche und einzelner scrollbarer AppKit-Mac-Dialog. MAC-20260923-04 begrenzt die Mac-Gruppe zusätzlich auf 1000 Fundstellen und erhält technische Fehler statt falscher Benutzervertagung; lokale Regression grün, im RC141-Standalone-Mac-Paket enthalten. | **in Arbeit** · Cowork-Neulieferung und sichtbare AppKit-E1/E2 weiter offen |
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
| BL-021.3 | **P2 · PH-20260923-12 · lokaler Review implementiert.** Exakt lokalisierbare heuristische Rest-Personenkandidaten werden einzeln im vorhandenen lokalen Review entschieden. Nicht serialisierbare In-Memory-Bindung an Fassung/Position, keine Gleichnamengruppe, Korpusphrase oder pauschale Negationsausnahme. Direkte Identifier, bekannte Originalwerte, Personenfelder und Strukturfehler bleiben unabhängig gesperrt. Nachgehärtet: CRLF-/gemischte Tabellenoffsets, vollständig erhaltene wiederholte Fragmente und identische kanonische Darstellung durch Vorschau/Anonymisierung. Unklare Herkunft bleibt fail-closed. Echte Publikation beider Produkte und Negativfälle sind automatisiert geprüft; Native-/Host-/Paketabnahme bleiben offen. Titel-/Kontextkorrektur separat BL-021.4. | **erledigt** |
| BL-021.4 | **P2 · PH-20260923-18 · Kontextkorrektur implementiert.** Konkurrierende rein typografische Versalienhypothesen werden vor Personen-Aliasbindung in den vorhandenen lokalen Fundstellenreview geleitet, nicht als Person oder Kunde/Projekt festgeschrieben. Keine Korpusphrase als Ausnahme. Echte Versaliennamen, explizite Personenfelder, Negationen und Folge-Dokumente bleiben geschützt. Ein maskierter Personenanker darf keine Beschäftigungsbeziehung über Absatzgrenzen zum vorherigen Hinweis erfinden. Fachanker prüfen Titel-/Inhaltserhalt unabhängig von erfolgreicher Publikation; gemeinsame Regeln für beide Produkte, reine Konvertierung unverändert. Native Fach-/Bedienabnahme bleibt offen. | **erledigt** |
| BL-022.1 | WordprocessingML wird namespacegebunden ausgewertet. Unbekannte XML-Entities, fremde Relationship-Namespaces und direkte Fremdtexte stoppen fail-closed; Kopf-/Fußzeilen, Tabellenverbindungen, `mc:AlternateContent`, historische Eigenschaften und Kommentarreferenzen besitzen feste Coverage-Regeln. DS-098 trennt Validierung und Ausgabe: Reine Konvertierung erhält Kopf-/Fußzeilen, Anonymisierung entfernt sie und ausschließlich dort referenzierte Bilder erst nach erfolgreicher Vollprüfung; Kommentare, Fuß-/Endnoten und Hauptteil bleiben enthalten. RC117 ergänzt echte Word-/`python-docx`-Pakete und 15 visuell geprüfte komplexe Dokumente. Die lokal lieferbare E0-Coverage ist geschlossen; offen bleiben ausschließlich LibreOffice-/Office-Interoperabilität, realistische Fremdkommentare und Fachabnahme E1/E3. | **erledigt** |
| BL-024.2 | Der Engineering-Portable-Build übernimmt das verifizierte Universal-OCR-Bundle vollständig. Geschlossene Manifest-/Inventar-/Modus-/Hashgates, Installationspfade mit Leerzeichen, Adapter-Timeout und laufender Abbruch sind regressionsgetestet; der SEA-Engineering-Build behält das belegte OCR-Testbundle. Der reale Windows-Standalone-Paket-Smoke sowie die nativen Läufe `34285518668` auf Apple Silicon und `34318293471` auf Intel verwenden ausschließlich die extrahierte gebündelte Runtime und verarbeiten XLSX, PPTX, Text-/Scan-PDF sowie PNG/JPEG/BMP bis zum inhaltlich geprüften Markdown-Ergebnis; damit ist Paket→Adapter→OCR E0 auf Windows x64 und beiden macOS-Architekturen belegt. Menschliche UAT bleibt offen. Eine vollständige Originalcontainer-Coverage wird dadurch nicht behauptet. | **erledigt** |
| BL-042.3 | Die inhaltsfreie Status-App bleibt nach Revalidierung absichtlich eine einmalige Start-Momentaufnahme: ein terminaler Zustand aus derselben Toolantwort wäre fachlich falsch und wird nicht ergänzt. Fester Textfallback, sieben begrenzte Zustände in DE/EN, beide Varianten für „Stapel läuft bereits“, reproduzierbarer CWD-unabhängiger Build und ein echter lokaler Edge-/axe-Lauf über alle 14 Sprach-/Zustandskombinationen plus 320-px-/400%-Reflow sind E0 belegt. `playwright-core` ist dafür exakt gepinnt und lädt keinen Browser. Der Pilot bleibt standardmäßig aus; echte Cowork-/Screenreader-/Hostabnahme ist E1/E2. | **erledigt** |
| BL-042.4 | Gemäß DS-074 UML-basierte Supportdiagnose: separate manuelle Debug-ZIP-Variante, gleicher Enginepfad, geschlossene JSON-Ereignisse an MCP-, Picker-, Worker-, Review- und Exportgrenzen. Fach-, Workflow- und Supportdiagnose verwenden dieselbe mehrprozesssichere Einzelereignis-Komponente; Alters- und Mengengrenzen werden physisch bereinigt, historisches JSONL bleibt nur lesbarer Upgradebestand. Keine Rohkommunikation und keine Wirkung auf Freigaben. E0 ist erledigt; echter Cowork-Supportlauf bleibt E1. | **erledigt** |
| BL-040.6 | Sichtbaren Export je Lauf und Zielunterordner identitätsgebunden serialisieren; ein Prozessclaim verhindert konkurrierende Record-Schreiber, ein ausgetauschter `DataSecure-Output` stoppt den Restexport, und lokale Öffnen-Aktionen wählen nur den vollständig abgeschlossenen aktuellen Lauf. Mischstapel bleiben gemäß DS-079 bis zum Gesamtabschluss unsichtbar. | **erledigt** |
| BL-003.9 | Maschinenlesbarer Dokumentindex mit Klasse, Status, Produktgeltung, Eigentümer, Versionsregel, Ablösung und Backlogbindung; Driftgate prüft Existenz, Eindeutigkeit und Kanonvollständigkeit. | **erledigt** |
| BL-041.11 | Geschlossene Cowork-Interaktionsregistry gemäß DS-099: alle 27 Werkzeuge genau einmal mit Normal-/Supportfläche, Wirkung, Idempotenz, Human-Gates, Erfolgsdisposition und Inhaltsgrenze binden. Normal-/Supportmengen und MCP-Annotationen werden daraus abgeleitet; Werkzeugtabelle und Handler bleiben bijektiv. Unbekannte Toolnamen dürfen nicht fälschlich als Supportwerkzeuge erscheinen. E1/E2-Cowork-Zielhostevidenz steht in Abschnitt B aus. | **erledigt** |
| BL-041.12 | Additiver, schema-validierter `datasecure-cowork-status/1`-Umschlag für jede bekannte Toolantwort. Claude-Interaktion, lokaler Arbeitszustand, Annahme/Abschluss/Abbruch, Retryklasse, Human-Gate-Assurance und tatsächliche Inhaltsgrenze werden getrennt; Originalinhalt bleibt immer `false`, tatsächlich enthaltenes anonymisiertes Markdown ausdrücklich untrusted. Leere Übergaben bleiben Metadaten; alle Fortsetzungsformen werden erkannt; ein Normalmodus-Guard verweigert private Kennungen. Top-Level-Kompatibilität bleibt bis zur realen Cowork-UAT erhalten; E1/E2 steht in Abschnitt B aus. | **erledigt** |
| BL-041.13 | Hauptskill auf unverhandelbaren Normal-/Trustkern und Intenttabelle reduzieren; einfacher Normalstart ohne Referenzrunde, Sonderstart, Ergebnisübergabe, Fortsetzung/Verwerfen und Konfiguration als isolierte Referenzen. Strukturkorpus auf 41 Fälle erweitern und kuratierte, exakt risikogebundene 12×3-Candidate-Matrix mit Fixture-, Setup-, Bewertungs- und Cleanup-Vertrag liefern. Beide Modellmatrizen sind formale Cowork-GO-Gates; ein verbotenes Modelloutcome ist Release-Stopper. Automatisierte Tests werden nicht als Modellabnahme ausgegeben. E1/E2-Modell-/Hostabnahme steht in Abschnitt B aus. | **erledigt** |
| BL-041.14 | Hersteller-/Folgefehlerreview auf RC137-Basis, Kennungen CWR-20260912-01–11 in `docs/REVIEW_CLAUDE_COWORK_2026-09-01.md`: DS-078 beibehalten; DS-099-Statusprojektion an echte Core-Phasen gebunden; ACK-Ungewissheit und nativen Abbruch erhalten; terminalen Ergebnisordnerwechsel, paginierte Übergabesprache, lokale datierte Stapelwahl und MCP-Hüllenprüfung korrigiert. BL-010.8/BL-041.8: Mac-ZIP-Verifier repariert und manueller nativer Start exakt gebauter ZIPs verpflichtend; Marketplace wählt exaktes Host-ZIP, weist fehlende, geänderte und zusätzliche Quelldateien vor Mutation zurück und prüft tatsächliche Ausgabebytes. Projektkontext nach Produkt/Zweck bereinigt. E0: drei unabhängige Reviews, volle lokale Produktsuite und zusätzliche Paketregressionen, Windows-Normal-/Debug-ZIP-Starts, Marketplace-Artefaktabgleich und Docs-/CLI-Gates bestanden. RC138-Gates sind abgeschlossen und historisch; RC139 bindet die korrigierten Archive samt nativen Windows-/Mac-Starts. Menschliche Cowork-Abnahme bleibt getrennte E1/E2-Evidence, keine Umdeutung der RC137-Release-Hashes. | **erledigt** |
| BL-041.15 | **P2 · Astra-20260912-Handoffintegrität.** Eine asynchron vorbereitete Ergebnis-Seite erhält eine unveränderliche Sitzungs-ID/Generation. `cancel_local_results_handoff` widerruft diese Generation; `start_completed_local_results_handoff` darf solange keine Sitzung ersetzen, wie eine Seite läuft. Nach jedem `await` werden Generation, Token und Sitzung erneut geprüft; verspätete Snapshots werden verworfen und niemals bestätigt. Die öffentliche Dokumentantwort übernimmt außerdem die vom Ergebniszugriff geprüften Felder `privacy_scope` und `source_extraction_coverage` (mit geschlossener Allowlist/Schema), damit `extracted-markdown-only` und unvollständige Quellabdeckung nicht hinter einem alleinigen Ergebnisgrad verschwinden. | Blockierter In-Memory-Snapshot: Seite A läuft, Cancel, Startversuch für B, Freigabe der alten Seite. Ergebnis: kein Inhalt von A nach Cancel, keine ACK für A unter Token B, keine neue Sitzung vor Ende der alten Seite. Listing → Handoff erhält bei XLSX/PPTX Scope und Coverage byte-/schemawahr; zusätzlich wird eine Coverage ohne Privacy-Scope geschlossen abgewiesen. `test-local-only-handoff.js` (33 Fälle), Resume- und MCP-Gates sind grün. | **erledigt** |
| BL-041.16 | **P2 · Astra-20260912-Paketintegrität.** ZIP-Verifier und Marketplace-Projektion verwenden einen gemeinsamen vollständigen Validator. `.mcp.json` wird gegen genau einen normalisierten `data-secure-local`-Server, dessen Kommando, Argumente und erlaubte Umgebung geprüft; zusätzliche Server oder Felder außerhalb des Vertrags stoppen vor jeder Ausgabeänderung. Runtime-Lizenz, Runtime-Evidence und alle für das Ziel verlangten Runtime-Dateien werden in beiden Wegen auf Existenz, Größe und Hash gebunden. | Speicherbasierte Negativarchive mit zusätzlichem MCP-Server bzw. fehlender `runtime/LICENSE.node.txt` werden durch beide Entry-Points vor jedem Schreibzugriff abgewiesen. Runtime-Evidence bindet zusätzlich einen 40-stelligen Quellcommit. `test-bundled-runtime.mjs`, `test-marketplace-projection.mjs` und der Releasepfad sind grün. | **erledigt** |
| BL-041.17 | **P2 · Astra-20260912-Kandidaten- und UAT-Evidenzbindung.** Die UAT-Vorlage entsteht ausschließlich aus dem finalen, explizit übergebenen Release-Artefaktsatz und dessen gebundenem Commit, nicht aus beliebigem lokalem `dist` oder aktuellem `HEAD`. Die 12×3-Matrix referenziert nur tatsächlich erzeugte UAT-Fixtures und beschreibt Initial-, Tool- und Follow-up-Phase widerspruchsfrei; der automatische Vertragstest löst Fixture, Vorbedingung, erwartetes Werkzeug und Cleanup gegen den Korpus auf. Die Release-Dokumentation trennt Cowork- und Standalone-Kampagnen sowie veröffentlichte Normal-, Debug- und UAT-Artefakte eindeutig. | `build:cowork-uat-evidence` verlangt Normal-ZIP, Debug-ZIP und sauberen aktuellen Kandidatencommit, verifiziert beide Archive vor der Evidenzaufnahme und bindet deren `source_commit`. Die Matrix prüft alle Fixturepfade gegen den Generator; nicht vorhandene Fälle, falsche Zuordnungen und fehlende Argumente stoppen. Workflow und Vertragstests sind grün. | **erledigt** |
| BL-041.18 | **P3 · Astra-20260912-Promptnamen.** Die Promptauflösung akzeptiert ausschließlich eigene Schlüssel von `PROMPT_DEFAULTS`; Prototyp-Eigenschaften und jeder unbekannte Name liefern dieselbe definierte Invalid-Params-Antwort wie andere unbekannte Prompts. | `constructor`, `toString`, `__proto__` und beliebige unbekannte Namen liefern keinen Workflow; alle vier erklärten Promptnamen bleiben manifest- und serverseitig identisch. `test-manifest.js` und 66 echte stdio-Protokollfälle sind grün. | **erledigt** |

| BL-041.19 | **P1 · PH-20260923-01 · E0 in RC151 veröffentlicht.** Kanonische Roottrennung vor Speichern/Reset/Bootstrap/privater Anlage; cached Roots werden erneut geprüft. Historische private/öffentliche Wurzeln im Produktdatenraum bleiben durch maximal 256 atomare Reservierungen geschützt, auch nach Reset. 43 Rootfälle, vier konkurrierende Prozesse, MCP-Start ohne private Refusalwrites und Standalone-Gegenregression bestehen. Atomarer Austausch identischer Reservierungen zwischen Pfadprüfung und Öffnen ist deterministisch reproduziert und durch einmalige Metadatenrevalidierung behoben; andere Roots und Hardlinks bleiben gesperrt, keine Retrieschleife. Der frühere Einzelfehler ohne stderr ist rückwirkend nicht eindeutig zuzuordnen. Core erhält Pflichtinjektion statt Gateway-Import. Keine Migration/Löschung; nicht erfasste Altfreigaben/fremde Namespaces bleiben Betreiberprüfung und eine unsichere Altconfig erfordert kontrollierte Offline-Korrektur. Paket-Smokes sind RC151-gebunden; sichtbare Zielhost-Gegenprüfung der Rootfälle bleibt offen. | **erledigt** |
| BL-041.20 | **PH-20260923-02/-03/-10 · E0 vorbereitet.** Lokales Claude Code ist ein zusätzlicher Hostpilot desselben Plugins, kein drittes Produkt. 14-Fälle-Vertrag und Anleitung unter `acceptance/CLAUDE_CODE_PILOT/`, kostenfreier read-only CLI-Vorcheck plus Vertragstests vorhanden. Offizielles Update auf 2.1.280 und Vorcheck PASS; CLI nicht angemeldet. Lokaler Code-Reiter in Claude Desktop als eigene Oberfläche berücksichtigt. E1/E2: exaktes natives Ziel-ZIP, Ladequelle/Hash/Toolinventar, Originalzugriffs-Negativfälle, Picker/Review/Recovery/Wiederverwendung, Sync und Doppelinstallation beobachten. Nutzerentscheidung: ausschließlich enthaltene Claude-Abonutzung, keine API-/Zusatzkosten; bei unklarem Abrechnungsweg oder Limit kein Modellaufruf. Desktop-Zugang noch nicht geprüft. Keine Freigabe für WSL/Linux/Cloud und kein Ersatz für Cowork-/Standalone-Abnahmen. | **in Arbeit** |
| BL-041.21 | **PH-20260923-04 · DS-101 bestätigt und E0 umgesetzt.** `unread` bleibt Standard; `reuse_completed` erfordert ausdrücklichen Auftrag und stets native Auswahl, auch bei einem Kandidaten. Keine neue Anonymisierung oder Originalzugriffe. Paketgeneration/TTL/Integrität werden pro Seite und nach Async-I/O erneut geprüft; bestehende ACKs/Terminal-Evidence bleiben unverändert. Reale Datei-/Journal-/Pakettests prüfen auch entfernte Originale, Generationstausch, Ablauf, Abbruch und Produktgrenzen. Neue Paket-, Modell- und native Auswahlabnahme bleiben E1/E2. | **erledigt** |
| BL-050.4 | **PH-20260923-05 · E0 umgesetzt.** Unabhängiges Ausgabeorakel ersetzt Selbst-Lookup und pauschale Ambiguitätsfreigabe. `test-adversarial-golden-batch.mjs` verarbeitet alle 16 Dateien in beiden Zwecken mit produktiv projiziertem Konverter/OCR, echten Journalen/Privacy-Gates/Publikationen/Exporten; nur die menschliche Reviewentscheidung wird synthetisch beantwortet. Nach BL-021.3/4: 16 Konvertate und 16 anonymisierte Ausgaben nach expliziten Titel-/Personenentscheidungen; davor keine Publikationshandles. Identitätsanker fehlen, definierte Fachanker einschließlich technischer Titel bleiben, unabhängige Pseudonyme sind konsistent, Quellen unverändert. Französische Straßen und falsche Firmen-/Projektbindungen aus technischen Dashlisten korrigiert; Namenslecks nach Markern, Negationen und verschachtelten Listen gegengeprüft. VECTRA-20260923 ergänzt einen realen CSV-/eingebetteten-JSON-Gegenfall im bestehenden Test, ohne neue Runtime/Importoberfläche; vorhandene typisierte Registry wiederverwendet. Neuer Releasearchivtest und menschliche OCR-/Fachqualität bleiben eigene Gates, keine allgemeine Semantik-/Vollständigkeitsgarantie. | **erledigt** |
| BL-050.5 | **Qualitätsmessung · E0 am 06.10.2026 umgesetzt (Teil von BL-010.51/DS-108).** Unabhängige synthetische Referenz mit 60 logischen Fällen/72 Format- und OCR-Varianten, vier ausgewiesenen Entitätsklassen, getrennten Extraktions-/Core-Probe-/Publikationsmetriken, konkreten Dateinamen/Fundstellen und lokalen Gegenprüfungsdateien. Auswerter gegen breite/doppelte Spannen, Voll-/Teilnamensreste außerhalb der Ausrichtung, OCR-Teil-/Split-/Symbolverlust, vorher verlorene Fachanker und eingefügte Negationen abgesichert; synthetisches Review ist dokument-/fundstellengebunden und vertagt unbekannte/widersprüchliche Erwartungen. 23 reine Regressionen in Produkt-/Standalone-Testeingängen; echte Windows-Projektion mit Konverter/OCR und Publikation ausgeführt. Verfahren/Kommandos: `docs/DETECTOR_BENCHMARK.md`. Volle Messung am exakten Release-/Mac-Archiv und menschliche Referenzabnahme bleiben BL-010.51; native Engineering-Paketsmokes sind separat belegt. Produktqualität ist damit nicht pauschal freigegeben; Befunde separat BL-050.6. | **erledigt** |
| BL-050.6 | **Fachwort-/OCR-Qualität · E0-Teilkorrektur und erneute Gegenprüfung am 06.10.2026, unveröffentlicht.** Standalone entscheidet unklare Überschriften/Zellen vor PERSON-Bindung und erhält genaue laufweite Entitätsentscheidungen. Begrenzte geometrische OCR korrigiert fünf Umlautgegenfälle; Kontakt-Crops warnen, ersetzen aber nie die Primärlesart. Die automatische Crop-Auswahl bleibt als verworfener 16-statt-neun-E-Mail-Gegenbeleg erhalten. Neu: exakte OCR-Kontakte werden im selben privaten Prüffenster vor Personenreservierung/Anonymisierung ausdrücklich bestätigt oder korrigiert; 400 Vorkommen/256 Korrekturzeichen, vollständige authentifizierte private Entscheidung, Quelle/Extraktion/Policy/Laufbindung und Neustart. Keine Kontaktfreigabe als PII-Ausnahme, kein neuer Cowork-Weg. Echte private IPC, gemischte Kontaktzeilen, Zeilenenden, Manipulation, Telefon-/Credential-Grenze und 200-Dateien-Abbruchbereinigung sind gegengeprüft. Stabile Vollmessung `dist/quality-contact-review-final-source-20261006`: 72/72 konvertiert und publiziert, 55 synthetische Kontaktbestätigungen/neun explizite Referenzkorrekturen plus 202 Entitäts-Vorkommensentscheidungen. Nach Korrektur null bekannte Kontaktänderungen/Identitätsreste/Fachwortverluste; rohe OCR enthält weiterhin neun E-Mail-Fehler. DS-012-Anredenentfernung wird unabhängig separat gemessen. 66 fokussierte Qualitätsfälle plus Zweidokumentintegration und 46 echte Windows-Konvertergruppen bestehen. Exakte Windows-/Intel-/Apple-Silicon-Engineering-Paketbindung einschließlich OCR-Korrektur/Neustart und erfolgreicher nativer Haupt-/Prüfseiten-IPC besteht; Umfang und Hashes stehen in der nachfolgenden Aktualisierung. Das unveränderte Qualitätsgate bleibt wegen Rohbefunden rot. Menschliche Referenz-/Bedienprüfung, volle Qualitätsmessung am exakten Mac-Archiv, neue Releasefreigabe und weitere OCR-Genauigkeit bleiben offen; keine pauschale Freigabe und kein Prerelease. | **in Arbeit** |
| BL-050.7 | **Unternehmensrest in neutralen Tabellenkontexten · E0 korrigiert.** Standalone prüft jetzt auch CSV-Kopfzeilen und neutrale einspaltige Tabellenzellen vor einer Personenbindung. Menschliche Firmenentscheidungen erzeugen typisierte laufweite Unternehmenspseudonyme; echte Namensfelder und Credentials bleiben strikt, sachliche Überschriften werden nicht automatisch gelöscht. Neues echtes Publikations-/Neustartgegenbeispiel ohne Holdout-Allowlist und stabile Windows-Messung mit 40 Nicht-OCR-Varianten: alle Ergebnisse freigegeben, keine bekannten Firmenreste einschließlich der früheren CSV-/XLSX-Gegenfälle. Bericht: `dist/quality-final-native-20261006/BERICHTE/QUALITAET.json`. Volle Qualitätsmessung am Mac-Archiv, neue Releasearchivbindung und menschliche Semantikabnahme bleiben BL-010.51; Firmenentscheidungen im nativen Engineering-Paketsmoke sind separat belegt. | **erledigt** |

**Aktualisierung BL-050.6 / BL-010.51 vom 06.10.2026:** Frische Vollmessung
`dist/quality-contact-native-final-20261006` bindet tatsächliche Modell-/
Konverterbytes; Roh-OCR neun Fehler, finale synthetisch geprüfte 72 Ausgaben
ohne bekannte Reste oder Sachwortverluste. Der größere Modellkandidat wurde
wegen 24 statt neun E-Mail-Fehlern verworfen. Exakte Windows-Engineering-
Paketintegration mit realer OCR, unterschiedlichen Korrekturen, beiden
Kontaktdateien vor Entitätsreview, Vertagen/Neustart und vollständigem
Ausgabeorakel besteht; native Windows-Seiten/IPC separat bestanden.
Ein strenger Netzbeobachterlauf blieb wegen nicht sicher zugeordnetem Endpunkt
ohne PASS; die unveränderte strenge Wiederholung bestätigt zehn eigene Prozesse
und keine TCP-/UDP-Endpunkte im Messfenster. Bedienkampagne für OCR ist ausführbar, aber ohne echte Bedienung
NOT_RUN. Separater Testbranch und bestehender Mac-Workflow für beide
Architekturen sind ausdrücklich autorisiert.
Zwei native Versuche stoppen an Testbefunden: nicht kanonischer TEMP-Pfad,
danach veraltete Erwartung der gemeinsam genutzten Neustart-Closure. Die
Kontakt-/Resume-Verträge bestehen im zweiten Versuch auf Intel und ARM.
Fixture und Strukturvertrag sind korrigiert; der Paketvertrag ist nun auch
im allgemeinen Produktgate statt nur im Zielgate enthalten. Eine unabhängige
Leerer-Checkout-Gegenprobe sichert seinen bisher fehlenden `dist/`-Elternordner.
Erweitertes Produktgate: 202 Dateien grün, elf aktuelle Paketverträge separat
grün. Fehlgeschlagene native Versuche bleiben dokumentiert. Der dritte Lauf
`37460941660` am Quellcommit `86b9f757caf1b7df8731d787d007c9b77dde88da`
besteht vollständig auf Intel und Apple Silicon: je 47 Rust-Tests, Clippy,
Supervisor-/Abbruchtests, 44 reale Konvertergruppen (zwei Windows-Fälle korrekt
übersprungen), Signatur/ABI, native Haupt-/Prüfseiten-IPC, bytegleicher ZIP-
Doppelbau, tatsächlicher paketierter Review-/OCR-Korrektur-/Neustartpfad,
LaunchServices und identische gemountete DMG. Beide ZIPs/DMGs sind lokal
gesichert und nach dem Download erneut geprüft; Hashes und genaue Grenzen
stehen in `CURRENT_STATE.md`. Kein menschlicher Reviewklick, keine
Notarisierung, keine volle 72-Varianten-Messung am Mac-Archiv.
Main/Releases unverändert, strenges Qualitätsgate bleibt rot. Genau diese
Restpunkte bleiben **in Arbeit**, nicht pauschal „blockiert“ oder erledigt.

**Zusätzlicher E0-Gatebefund BL-010.52:** Historische Windows-Input-Migration
verwechselte zwei verschiedene 64-Bit-Datei-IDs durch Number-Rundung.
Exakte BigInt-Identität schließt den reproduzierten Recovery-/Lock-Randfall;
16 Regressionen und unabhängige echte Dateisystem-Gegenprobe bestehen.
Das integrierte Produktgate ist mit 201 Dateien grün, Mac-Workflow führt die
Migration zusätzlich aus. Technische Korrektur erledigt, keine Änderung
vorhandener Anwenderdaten und keine pauschale Zielhost-/Releaseabnahme.

#### BL-041.17 – zweiter Astra-Gegenreview, 12.09.2026

Diese nummerierten Befunde bleiben als Fehlerursache und Regressionsvertrag
erhalten. Die vorherige Erledigt-Markierung war zu früh: grüne Strukturtests
hatten keinen vollständigen Releaseablauf und keine realen UAT-Vorbedingungen
belegt. Die folgende Korrektur betrifft ausschließlich Cowork-Entwicklungswege;
Standalone-Code und seine Paketbindung bleiben unverändert.

| Review-ID | Reproduzierter Fehler | Korrektur und wiederholbarer Nachweis | Status |
| --- | --- | --- | --- |
| ASTRA2-20260912-01 | Node-Download als unignoriertes ZIP im Checkout kollidiert mit dem neuen Clean-Git-Gate; der manuelle Windows-Releasebuild stoppt. | Download nach `RUNNER_TEMP`. `test-bundled-runtime.mjs` erstellt ein echtes isoliertes Git-Repository: Root-ZIP wird abgewiesen, externes Downloadstaging erlaubt den sauberen Build ohne Commit-Override. `test-runtime-release-path.mjs` bindet diesen Pfad an den Workflow. | E0 korrigiert |
| ASTRA2-20260912-02 | Debug-ZIP fehlt im Upload; Prüfsummen entstehen vor Debug und UAT. | Upload enthält Debug explizit. Finaler SPDX-/SHA256SUMS-Lauf nach UAT inventarisiert Normal, Debug und UAT; er prüft die UAT-Referenzen gegen die tatsächlichen Produktbytes und Commitwerte. Fehlende, doppelte oder veraltete Bindungen stoppen. `test-cowork-uat-evidence.mjs` und `tests/manual/cowork-release-offline.mjs`. | E0 korrigiert |
| ASTRA2-20260912-03 | ZIP-Prüfer und UAT-Generator lesen denselben Pfad zu verschiedenen Zeitpunkten ohne Hashvergleich. | Der native ZIP-Prüfer liefert ein maschinenlesbares Receipt über seinen geprüften Byte-Snapshot. Die UAT-Erzeugung verlangt `NATIVE_PASS` und exakt dessen Größe/SHA-256; austauschbare gleich große ZIPs, statische oder fehlende Receipts werden in `test-cowork-uat-evidence.mjs` abgewiesen. Keine falsche Standalone-PKG-04-Behauptung. | E0 korrigiert |
| ASTRA2-20260912-04 | Host-Abbruch nach ACK, ein späterer Parserfehler als Startantwort, falscher Mischstapel und erfundene Handoff-Antwort erzeugen nicht die behaupteten Live-UAT-Zustände. | Host-Stopp während offenem MCP-Picker; terminaler Fehler als lokal beobachteter Zustand mit Nutzer-Folgeauftrag; echte DOCX-Grafikfixture für Auslassungen; reale TXT-Injectionfixture. Resume setzt einen in N3-07 nachgewiesenen Checkpoint voraus. Der unabhängige Gegenreview fand zusätzlich den widersprüchlichen UAT-05-Host-Close-Pfad; Fallkatalog, Schritte, Erwartungs-CSV und N3 sind korrigiert und regressionsgeprüft. Fehlende Vorbedingungen ergeben `BLOCKED`, niemals `PASS`. Gemeinsamer Planvalidator prüft Phase, Toolfolge, Fixture, Cleanup und Beobachtung; Mutationen sind negative Tests. `tests/manual/cowork-uat-fixtures.js` belegt die tatsächlichen Fixture-Grade und Handoff-Inhalte ohne Parser-/OCR-/Journal-Mocks. | E0 korrigiert |

RC139-Lieferabsicherung: Die finale Inventur darf die beiden normalen Mac-ZIPs
zusätzlich enthalten, verlangt auch für diese exakt den Kandidatencommit und
weist doppelte/unbekannte Namen ab. Windows-UAT bleibt Windows-UAT.
`test-release-version.mjs` sichert den Schnitt aus einer veröffentlichten
einfachen „RC…“-Quellstandsaussage ab; ein neuer RC darf nicht versehentlich
als bereits veröffentlicht stehen bleiben. Dies ist Teil von BL-041.17 und
der dauerhaften Versions-/Releasewahrheit, kein neues Produktfeature.

Lokaler Nachweis: `node tests/manual/cowork-release-offline.mjs` baut in einem
isolierten sauberen Test-Checkout Normal-/Debug-Pakete mit dem vorhandenen
attestierten Windows-Node, führt beide nativen Paketprüfungen aus und erstellt
UAT/SPDX/SHA256SUMS mit vier tatsächlich hashgleichen Inventareinträgen. Keine
Netzwerkaufrufe, keine Änderungen am Hauptrepository-Commit, kein Release-GO.
RC139 hat nach Commit den separaten echten Releaseweg erneut bestanden, nun
einschließlich der zwei Mac-ZIPs und sechs finalen Prüfsummeneinträge. Modell-UAT,
Windows-/macOS-N3/N4 und Fresh-Install bleiben als E1/E2 offen.

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
| `visibleResultTreeOverlaps` ohne Cache (Realpath je Datei und Wurzel). | BL-044.1 | P3 | **geschlossen:** direkte lokale 201-Kandidaten-/20-Verzeichnisse-Mikromessung auf Windows x64: erster Lauf 79,235 ms, p50 71,627 ms, p95 77,142 ms bei 30 warmen Läufen und festem lokalen Referenzbudget 250 ms. Ein Cache ist auf diesem Host nicht indiziert; End-to-End-Admission und UNC-/Sync-Root-Gegenprobe bleiben E1 |
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
| Der Abschluss galt nach erfolgreichem Presenter-Start als übernommen, nicht erst nach einer belegten sichtbaren Darstellung. | BL-041.10, BL-012.2 | E0 erledigt | Standalone-Renderer-Paint, Windows-`Shown` und AppKit-`SHOWN` stehen E0; ausschließlich die reale sichtbare Windows-/macOS-Beobachtung bleibt E1/E2 offen. |
| Der Ergebnisstamm ist eine ausdrückliche geräte- und produktlokale Einstellung. Cowork stellt dem MCP keinen belastbaren aktuellen Workspacepfad bereit; DataSecure darf ihn nicht erraten. | BL-040.5 | entschieden | DS-080: Ziel beim Start identitätsgebunden an den Stapel binden; Änderung nur über „Ergebnisordner ändern“, keine Rückfrage und kein heimlicher Wechsel pro Projekt oder Lauf |
| `MCP26-01` ist keine offizielle Protokollversion; ein harter Wechsel würde ältere Claude-Hosts ohne Produktnutzen ausschließen. | BL-041.8 | entschieden | DS-081: moderne Version `2026-07-28` und getestete Legacy-Pfade hostgesteuert aushandeln; keine Nutzereinstellung, keine vollständige Konformitätsaussage ohne offizielle Conformance-Evidence |
| Klare Positionen eines Mischstapels sind intern dauerhaft, der sichtbare Export wartet auf den terminalen Gesamtstapel. | BL-043.1, BL-040.6 | entschieden | DS-079 behält die terminale sichtbare Semantik ausdrücklich bei; E0-Negativtest verhindert Teillauföffnung |
| Windows besaß einen Sammelreview, macOS nur einzelne modale Entscheidungen. | BL-012.9, BL-012.10 | E0 erledigt | macOS besitzt jetzt einen einzelnen scrollbaren AppKit-Sammeldialog; native Intel-/ARM-Ausführung, Fokus und Accessibility bleiben E1/E2 |
| „Ergebnisse öffnen“ öffnete den Output-Stamm statt zwingend den aktuellen Lauf. | BL-010.13, BL-040.6 | erledigt | exakter vollständiger `Lauf-*`-Ordner wird im vertrauenswürdigen Prozess auf allen unterstützten Shellpfaden geöffnet; Zielhostbeobachtung bleibt E1 |
| Ein offener Export-Outbox-Eintrag besaß keinen exklusiven prozessweiten Claim. | BL-040.6 | erledigt | Replay und Terminalexport sind über atomaren Claim serialisiert; Live-Claim, Zielaustausch und Wiederanlauf sind regressionsgetestet |
| Die Worker-Empfangsbestätigung belegt validierte Nachrichtenannahme, aber noch keinen dauerhaften ersten Stapelcheckpoint. | BL-011.8, BL-043 | erledigt | öffentlicher Zustand benennt bis zum Checkpoint ausdrücklich `checkpoint_pending` |
| Lange Standalone-Stapel besaßen keine passive lokale Fortschrittsanzeige. | BL-012.6, BL-042.3 | erledigt | inhaltsfreie Vorbereitung und monotone Zähler laufen im bestehenden Fenster ohne Polling durch Claude; E2-UX bleibt offen |
| Skill und Server spiegelten Teile der Zustandsentscheidung und konnten sprachlich oder logisch auseinanderlaufen. | BL-041.1 | E0 erledigt | Der Server liefert die vollständige inhaltsfreie `user_status`-Aussage einschließlich Version und Zielhinweisen; der Skill gibt sie unverändert wieder und leitet keinen Zustand mehr aus Einzel-Flags ab. Echte Claude-UI-Abnahme bleibt E1/E2. |
| GitHub-synchronisierte Organisations-Marketplaces unterstützen die zuvor erzeugte `archive`-Quelle nicht; die selbsttragende Projektion überschreitet mit den offiziellen macOS-Node-Binaries zudem GitHubs 100-MiB-Grenze für normale Git-Objekte. | BL-010.8 | blockiert | Ziel-ZIPs bleiben der freigegebene UAT-Weg. Für den Marketplace erst eine kleinere selbsttragende Runtime oder einen von Claude nachweislich unterstützten Binärtransport festlegen; keine LFS-Annahme und keine Universal-ZIP-Grenzerhöhung. |
| DataSecure kann verbundene Cowork-Ordner nicht auslesen und damit die Trennung von Quellen und Ergebnisziel nicht technisch attestieren. | BL-040.5, BL-041.7 | entschieden | ehrliche Setup-/UAT-Regel: nur dedizierten Ergebnisordner verbinden, Quellordner nicht verbinden; keine zusätzliche Laufbestätigung |
| Nativer Standalone-Admission-Pfad prüfte die 500-MiB-Gesamtgrenze nicht und eine verlorene Worker-Bestätigung ließ dieselbe Auswahl erneut starten. | BL-010.12, BL-011.10 | erledigt | Gesamtbudget vor Start, einmaliger Verbrauch nach delegiertem Start und Regressionstests |
| Ein neuerer aktiver Standalone-Stapel verdeckte den jüngsten vollständig sichtbaren Ergebnislauf. | BL-010.13, BL-040.6, BL-010.29 | erledigt | Seit DS-086 bleibt die Navigation zwischen Start, Verarbeiten und Verlauf unabhängig vom Laufzustand. Status und Zähler gehören zum aktiven beziehungsweise ausdrücklich fortgesetzten Stapel, sonst zum jüngsten eigenen Stapel. Jede Verlaufszeile öffnet ausschließlich ihren eigenen vollständigen Ergebnislauf bzw. ihre Zuordnung; ein fehlendes Ziel fällt niemals auf einen anderen Lauf zurück. |
| Ein policyinkompatibles Altjournal wurde als fortsetzbar angeboten; der Worker konnte vor der Einzelverarbeitung abbrechen und die Position offen zurücklassen. | BL-010.13, BL-011.8, BL-010.23 | E0 erledigt | Recovery prüft den aktuellen Pseudonym-/Policykontext vor jeder Resume-Projektion. Ungefangene Fehler nach gültigem Claim werden mit festem Code und gemeinsamem Retrybudget stabilisiert; Markdown-only bleibt mappingfrei. Inaktive Altläufe sperren keine neue Quellenwahl. |
| Tauri und Node-Sidecar hatten abweichende Pfadbudgets und die UI besaß `core:default`. | BL-010.12, BL-010.15 | erledigt | identische UTF-8-Einzel-/Gesamtbudgets, nicht-UTF-8 fail-closed und nur explizite DataSecure-Kommandorechte |
| Atomare Journalpublikation erkennt viele Austauschfälle, kann aber ohne betriebssystemweites CAS keinen feindlichen gleichzeitigen Austausch durch denselben lokalen Benutzer ausschließen. | BL-011.8, BL-011.11 | P3 | bewusst außerhalb des aktuellen lokalen Vertrauensmodells; für ein später verschärftes Modell immutable Generationen oder nativen No-Replace-/CAS-Vertrag entwerfen, ohne Anwenderdialog |

## B. Technisch vorbereitet – menschliche Evidenz offen

Der RC151-Standalone-Funktionslauf auf Windows ist **durchgeführt** und wird
für passende Prüfschritte angerechnet: rekursive Auswahl/Ergebnisweg und beide
Modi (N3-05), positiver Formatpfad und geprüfte unveränderte Quellen
(N3-06/N3-08) sowie kontrollierte Fachtext-/PII-Stichproben (N4-07). Das ist
keine pauschale formale N3/N4-Freigabe. Gezielt offen bleiben insbesondere
sichtbare Auswahlkorrektur und Grenzablehnung, ein versionsgebundener
200-Dateien-/500-MiB-Lauf, Abbruch/Wiederaufnahme, Update/Rollback,
Tastatur/Screenreader, rollengetragene Inhaltsfreigabe, Mac-Finder-/Gatekeeper-
und Linux-Desktopbedienung sowie Coworks eigene Host-/Modelltests. Bereits
geprüfte 140 Dateien werden nicht allein für einen administrativen Status
erneut verarbeitet. **Offen** bedeutet: ein konkreter Resttest ist ausführbar,
aber noch nicht belegt. **Blockiert** bedeutet nur: eine benannte technische
Voraussetzung fehlt tatsächlich; es ist nicht gleichbedeutend mit „Code kaputt“
oder „RC151-ZIP darf nicht verwendet werden“. Positive Format-/Starttests
ersetzen keine negativen Fehler-, Accessibility- oder Mac-Bedienfälle. Derselbe
beobachtete Test darf dagegen mehreren passenden Stories als Evidence dienen.

| Story | Noch erforderlicher Nachweis | Status |
|---|---|---|
| BL-010.8 | Die drei selbsttragenden Ziel-ZIPs sind gebaut und nativ gestartet; sie bleiben der aktuelle Cowork-UAT-Weg und sind durch diesen Eintrag **nicht** blockiert. Nur der zusätzliche Git-Marketplace-Kanal wartet auf eine kleinere Runtime/einen unterstützten Binärtransport: einzelne offizielle macOS-Node-Dateien überschreiten GitHubs normale 100-MiB-Objektgrenze. Danach erst Marketplace-Veröffentlichung und Zielhost-Installation/Update. | **blockiert** |
| BL-010.7 | Lokale Cowork-Sitzung eines bestehenden Desktop-Deployments mit Plugin-MCP positiv sowie Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – negativ für Originale prüfen. | **offen** |
| BL-010.1 | Portablen Pluginstart ohne vorinstallierte Runtime nachweisen: RC151-Pakete sind auf Windows x64, macOS Intel und ARM64 nativ gestartet. Offen ist der frische Start **in einer echten lokalen Cowork-Sitzung** auf den freizugebenden Hosts, nicht ein weiterer bloßer CI-Paketstart. | **offen** |
| BL-010.2 | Windows-x64 Fresh Install, Kernlauf, Update und Entfernen. | **offen** |
| BL-010.3 | macOS Intel/ARM Fresh Install, Kernlauf, Quarantäne und Entfernen. | **offen** |
| BL-010.6 | Upgrade und Rollback mit unveränderten Quellen und synthetischen Daten. | **offen** |
| BL-011.3 | Mehrere pausierte Stapel und stabilen Pseudonymkontext real prüfen; kein Keyring. | **offen** |
| BL-011.6 | Größen- und Ressourcenstopps auf Windows und macOS beobachten. | **offen** |
| BL-011.7 | Abbruch, Fortsetzung und Zähler in echter Cowork-Bedienung verstehen lassen. | **offen** |
| BL-011.9 | POSIX-Supervisor auf realen macOS-Zielen unter Last und Abbruch nachweisen. | **offen** |
| BL-011.11 | Crash-/Dateisystemverhalten auf realen Zielsystemen prüfen. | **offen** |
| BL-011.13 | Plain-Arbeitskopien, Review und Fortsetzung auf Zielsystemen abnehmen; kein Schlüsselbundtest. | **offen** |
| BL-012.2 | RC151-Windows-Abschluss beider 140-Dateien-Läufe und der sichtbare RC145-Windows-Sammelreview sind beobachtet. Noch gezielt prüfen: konkrete RC151-Reviewfundstelle, vertagte Entscheidung/Resume und Stopmeldung in Windows sowie die entsprechenden Mac-Ansichten; die bereits gesehenen Abschlussläufe nicht wiederholen. | **offen** |
| BL-012.3 | Vertagten Review nach Neustart ohne neue Dateiauswahl fortsetzen. | **offen** |
| BL-012.5 | Tastatur, Zoom, Screenreader und Fokus auf Windows/macOS prüfen. | **offen** |
| BL-012.6 | Alltagssprache und genau eine nächste Aktion mit fachfremden Personen prüfen. | **offen** |
| BL-012.7 | Kernaufgabe ohne technische Hilfe in höchstens drei bewussten Aktionen abschließen. | **offen** |
| BL-012.8 | Ausgelieferten nativen AppKit-Sammelreview auf macOS mit Fresh Install, Fokus und Bedienung prüfen; der `osascript`-Picker ist ein eigener UI-Pfad. | **offen** |
| BL-012.9/10, BL-043.1 | Vereinfachten Sammelreview und automatischen Klar-Datei-Pfad in echter lokaler Cowork-Sitzung auf Windows/macOS beobachten; prüfen, dass klare Dateien keinen Dialog öffnen und die inhaltsfreien Zähler verstanden werden. | **offen** |
| BL-021.1 | Windows ist mit RC151 teilweise belegt: 52 direkte TXT/Markdown-Konvertate sind bytegleich und die zugehörigen Anonymisierungsausgaben wurden kontrolliert. Offen sind die gleiche sichtbare Bedienung auf macOS sowie nicht durch diese Stichprobe abgedeckte Grenzfälle; kein erneuter Windows-Gesamtlauf. | **offen** |
| BL-021.2 | Windows ist mit RC151 teilweise belegt: 24 CSV-Quellen und 2168 fachliche Beschreibungszeilen wurden in der Anonymisierung nachgeprüft. Offen sind gezielte CSV-Dialekt-Grenzfälle und macOS-Bedienung/Fachurteil; nicht erneut alle 140 Quellen laufen lassen. | **offen** |
| BL-031.1 | Zertifikats-/Organisationskontext durch IT-/Health-IT-Fachvertretung prüfen. | **offen** |
| BL-032.1 | Der lokale Sammelreview wurde im RC145-Windows-Lauf sichtbar und nach einer Entscheidung abgeschlossen. Die konkrete Fundstellenkennzeichnung von RC151, Vertagen/Ändern und der AppKit-Mac-Dialog sind noch beobachtet auf Verständlichkeit und Konsistenz zu prüfen. | **offen** |
| BL-041.1 | Beide Skills in echter Claude-UI gegen denselben Jobvertrag prüfen. | **offen** |
| BL-041.2 | Ursprüngliche Aufgabe nach Abbruch begrenzt und verständlich fortsetzen. | **offen** |
| BL-041.3 | Chat-Upload eines synthetischen Originals muss sicher zum lokalen Picker umleiten. | **offen** |
| BL-041.4 | Spracheingabe und direkte Skillauswahl müssen denselben Ablauf starten. | **offen** |
| BL-041.5 | Cowork-Grenzstapel mit 200 Dateien/500 MiB sowie Neustart/Fortsetzung in einer lokalen Cowork-Sitzung abnehmen. Den versionsgebundenen Grenzlauf aus BL-051.3 dafür mitbenutzen, soweit er denselben Produkt-/Hostpfad prüft; der Windows-Standalone-140-Lauf deckt Cowork nicht ab. | **offen** |
| BL-041.6 | Reine Anonymisierung endet lokal ohne Polling oder automatisches Ergebnislesen. | **offen** |
| BL-041.7 | Werkzeugberechtigungen, Pickerabbruch und Ergebnisübergabe in aktueller Cowork-Version prüfen. | **offen** |
| BL-041.9 | Den automatischen Übergang vom Hintergrundstapel in genau einen nicht blockierenden Sammelreview sowie „Später“, Abschluss und Wiederaufnahme auf Windows/macOS beobachten. | **offen** |
| BL-041.10 | Die gelieferte einmalige Ergebnisordnerwahl, Wiederverwendung ohne neue Abfrage, Ordnerwechsel, begrenzten Hintergrund-Replay und „Ergebnisse öffnen“ in echter Cowork-Bedienung auf Windows/macOS abnehmen. Beobachtung 03.09.2026 (Windows, rc85): Cowork beendet den MCP-Elternprozess kurz nach der Tool-Antwort; die Abschlussmeldung erschien in 4 von 5 Läufen nicht. Seit der zweiphasigen Eltern-/Worker-Übernahme (E0) ist nativ zu belegen, dass bei Elternprozessende oder Presenterfehler genau ein Fenster erscheint. | **offen** |
| BL-041.11–.13 | Registry, öffentlicher Statusumschlag und progressive Skillkontexte mit den 41 vollständigen Modellfällen jeweils dreimal in frischen Cowork-Sitzungen prüfen; zusätzlich die kuratierte 12×3-Candidate-Matrix ausführen. Ein verbotenes Outcome ist kein Mehrheitsentscheid, sondern Release-Stopper. | **offen** |
| BL-044.1 | Rekursive Ordnerquelle mit Link-/Race-Gegenproben auf Zielsystemen prüfen. | **offen** |
| BL-049.1 | Format-/Strukturgates und Ergebnisgrade durch Security auf Zielsystemen abnehmen. | **offen** |
| BL-050.3 | Referenzwerte und reales Dateisystem-/Power-Loss-Verhalten erfassen. | **offen** |
| BL-051.1 | Plugin-ZIP auf Windows x64 und macOS Intel/ARM frisch installieren. | **offen** |
| BL-051.2 | Nur für den zusätzlichen Marketplace-Kanal: privaten Marketplace auf Windows/macOS installieren, aktualisieren und entfernen, sobald BL-010.8 einen veröffentlichbaren selbsttragenden Binärtransport belegt. Der aktuelle ZIP-UAT-Weg ist unabhängig davon. | **blockiert** |
| BL-051.3 | Versionneuen UAT-Serienlauf mit 200 Dateien und bis zu 500 MiB durchführen. | **offen** |
| BL-051.4 | Produktrollback auf Windows/macOS abnehmen. | **offen** |
| BL-051.5 | Zuerst den RC151-ZIP-Lebenszyklus in echter Cowork-Bedienung abnehmen; der Marketplace-Anteil kann erst nach BL-010.8/BL-051.2 geprüft werden und blockiert den ZIP-Piloten nicht. | **offen** |
| BL-051.6 | Cloud-Cowork/Web/Mobil/Scheduled – auch bei geöffneter Desktop-App – sowie lokale Desktop-Sitzung ohne MCP negativ auf Originalzugriff prüfen. | **offen** |
| BL-052.1 | RC151-Standalone ist auf Windows durch den Anwender mit 140 Quellen in beiden Modi gelaufen; die Nachprüfung wird für N3-05/N3-06/N3-08/N4-07 als Teil-Evidenz übernommen. Nur noch fehlende Einzelfälle des aktuellen UAT-Kits, Testerrollen und dokumentierte Gesamtabnahme ergänzen; keine pauschale Wiederholung des Funktionslaufs. Cowork und andere Zielhosts bleiben getrennt. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit fachfremden Nutzenden abnehmen. | **offen** |
| BL-052.5 | Architektur und lokale Sicherheitsgrenze vor breitem Rollout freigeben. | **offen** |

### Aus der aktuellen Abnahmeliste entfernt

| Story | Entscheidung und vorhandener Nachweis | Status |
|---|---|---|
| BL-011.12 | Adaptive Mehrprozessvorbereitung ist für RC151 keine Voraussetzung. Der Produktstandard bleibt nach DS-047 seriell; die vorhandene 100-Dateien-Messung und der RC151-Windows-140-Dateien-Lauf liefern einen Ausgangspunkt. Erst ein belegter Zielhost-Engpass eröffnet eine neue Optimierungsstory. Es wird **nicht** behauptet, dass die optionale Parallelisierung implementiert oder abgenommen sei. | **erledigt** |
| BL-041.8 | Die ausgelieferte Cowork-Konfiguration startet einen lokalen stdio-MCP-Server; Paket- und Protokolltests prüfen diesen Produktpfad. Der derzeitige offizielle [MCP-Conformance-Serverlauf](https://github.com/modelcontextprotocol/conformance#testing-servers) verlangt dagegen eine URL und bewertet damit nicht dieses unveränderte stdio-Plugin. Deshalb entfällt der unpassende Pflichtlauf gegen `2026-07-28` für RC151; wir behaupten **keine vollständige offizielle MCP-Konformität**. Optionale Tasks/Benachrichtigungen werden ohne eigenen Zielhostnachweis nicht aktiviert. Ein neuer Transport oder ein offizieller stdio-Prüfpfad wäre eine neue Aufgabe. | **erledigt** |

Nur BL-010.8 und BL-051.2 sind damit noch tatsächlich **blockiert**: Für den
zusätzlichen Marketplace fehlt ein veröffentlichbarer Binärtransport. Eine
fehlende menschliche Testperson, ein noch nicht ausgeführter Mac-/Cowork-Test
oder ein leerer UAT-Vordruck heißt hier **offen**, nicht blockiert. Beide
Marketplace-Einträge beschreiben dieselbe Abhängigkeit und verlangen keinen
doppelten Test.

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
Anonymisierungsgates nicht auf. Linux x64 ist als eigenes Standalone-Zielpaket
technisch integriert; seine sichtbare Zielhost-UAT bleibt offen.

| Story | Lieferung | Status |
|---|---|---|
| BL-010.4 | Linux-x64-glibc-Paket als AppImage-in-ZIP mit gebündelter Runtime, nativem POSIX-Supervisor, echter App→IPC→Core-Ausführung, Paketprüfung und bytegleichem Doppelbau liefern. E0 ist gemäß DS-094 durch Lauf `34356576842` auf Commit `84fd616c` belegt; sichtbar bleiben Dateidialog, Drag-and-drop, Dateimanager, Accessibility, Performance, Installation, Update/Rollback und menschliche UAT. | **erledigt** |
| BL-022.2 | XLSX-Extraktion und Produktintegration sind E0: keine stille Zeilen-/Spaltenkürzung, explizite Ressourcenfehler, Literalformel plus gespeicherter Wert und sichere OPC-Prüfung. Die Ausgabe bleibt ehrlich `incomplete`, bis ein realer Fachkorpus Zell-, Kommentar-, Chart-, Relationship- und Interoperabilitätsabdeckung E1/E3 belegt. | **erledigt** |
| BL-022.3 | PPTX-Extraktion und Produktintegration sind E0: Textläufe, numerische Notizen, tatsächliche Folienreihenfolge und Prüfung aller vorhandenen XML-/RELS-Teile gegen DTD/Entities und Strukturgrenzen. Die Ausgabe bleibt ehrlich `incomplete`; Master-, Chart-, Objekt-, Layout- und Fremderzeugerabdeckung benötigen E1/E3. | **erledigt** |
| BL-023.1 | Standalone verarbeitet PDF, Scan-PDF und Bilder lokal Markdown-first und trennt Extraktions- vom Anonymisierungsstatus. Das NO-GO gilt nur für eine Vollständigkeits- oder Pixelredaktionszusage des Originalcontainers sowie für Cowork-PDF/Scan-PDF/Bilder, bis deren kompakter paketierter OCR-Pfad E0 und auf Zielhosts belegt ist. | **in Arbeit** |
| BL-023.2 | Text-PDF folgt einer endlichen Allow/Stop-Matrix: nativer Text, begrenzte Standardmetadaten und gemalte Bildoperatoren werden verarbeitet; erkannte Formulare/XFA, JavaScript/Aktionen, Anhänge, Signaturen, Annotationen, Outline, XMP und Verschlüsselung stoppen. Nicht vollständig beweisbare Originalcontainer-Coverage wird weiterhin ehrlich als `incomplete` ausgewiesen und nicht als vollständig anonymisierte Quelldatei bezeichnet. Der lokale Parser-/Securityvertrag ist E0 geschlossen; Layout-/Fremderzeuger-/Fachqualität bleibt E1/E3. | **erledigt** |
| BL-023.3 | Formulare/XFA, JavaScript/Aktionen, Anhänge, Signaturen, Annotationen, Outline, XMP und Verschlüsselung stoppen im Produktpfad; standardisierte Info-Felder werden begrenzt erhalten. Standardskonforme In-Memory-Goldendateien durchlaufen dafür den echten paketierten PDF.js-Parser, einschließlich AcroForm, Signaturfeld, EmbeddedFile/Name-Tree sowie leerem und nichtleerem Benutzerpasswort. Dabei wurde die reale PDF.js-`Map`-Rückgabe für Anhänge als zuvor kaschierter Defect gefunden und generisch geschlossen. Zielhost-, Fremderzeuger- und adversariale Fachabnahme bleiben E1/E3. | **erledigt** |
| BL-023.4 | Reale Scan-PDF-Konvertierung und das Privacy-Gate für textleere Extraktion sind E0 geprüft. Ein textloses Bild neben vorhandenem nativen PDF-Text erzeugt keinen falschen `OCR_TEXT_EMPTY`-Gesamtbefund mehr; wirklich textleere Extraktion bleibt gesperrt. DS-103 lässt passiv ausgelassene Objekte nur für die Anonymisierung des extrahierten Markdown-Inhalts zu. Offen bleiben visuelle Vollständigkeit, OCR-Fachqualität und Zielhostkorpus E1/E3. | **erledigt** |
| BL-024.3 | Reale PNG-/JPEG-/BMP-Extraktion und nachgelagerte Anonymisierung ihres gültigen, nichtleeren OCR-Markdowns sind E0 geprüft. Das Produkt anonymisiert die Markdown-Repräsentation und verspricht keine Pixelredaktion des Originalbilds; Pixelredaktion ist kein aktuelles Produktziel. Offen bleiben Decoder-/Metadaten-/OCR-Fachqualität und Zielhostkorpus E1/E3. | **erledigt** |

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
