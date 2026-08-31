# Aktives Entwicklungsbacklog

Stand: 31.08.2026 · Product-Owner-bereinigt · Arbeitsstand RC81

Dies ist ausschließlich die priorisierte Liste noch offener Arbeit. Erledigte
Stories stehen im [Archiv](BACKLOG_ARCHIVE_2026-08.md); Implementierungsdetails und
Teilnachweise stehen im [Ist-Abgleich](CURRENT_STATE.md) und in der
[Traceability](TRACEABILITY.md). Ein Pilot, lokaler Test oder einzelnes OS ist keine
Produktfreigabe. **P0** blockiert einen universellen Release.

Die [Evidence-Matrix](BACKLOG_EVIDENCE_MATRIX.md) markiert für jede aktive Story,
ob und welche reale Zielsystem-, Nutzungs- oder Fachevidenz erforderlich ist.

Das [Claude-Cowork-, UX-, Architektur- und Performance-Review](../REVIEW_CLAUDE_COWORK_UX_PERFORMANCE_2026-08-24.md)
und die [Revalidierung vom 31.08.2026](../REVIEW_CLAUDE_BEST_PRACTICES_2026-08-31.md)
sind verbindliche Priorisierungsgrundlage. Die folgenden beiden Arbeitslisten
trennen den noch eigenständig lieferbaren Entwicklungsanteil von echter
menschlicher Evidenz. Die thematischen Tabellen darunter bleiben das stabile
Storyregister.

Die Implementierungs- und Migrationsreihenfolge ist zusätzlich im
[verbindlichen Refactoring-Plan](REFACTORING_PLAN.md) festgelegt. Das Backlog
bestimmt **was** geliefert wird; der Refactoring-Plan bestimmt die sichere
Reihenfolge und die Gates. Abweichungen benötigen eine neue oder ersetzende
Entscheidung.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Erst danach kann eine Story in das
Archiv verschoben werden.

Entscheidungsabdeckung: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016, DS-017,
DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025, DS-026, DS-027,
DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034, DS-035, DS-036, DS-037,
DS-038, DS-039, DS-040.
DS-041, DS-042, DS-043, DS-044, DS-045, DS-046, DS-047, DS-048, DS-049,
DS-050, DS-051, DS-052, DS-053, DS-054, DS-055, DS-056, DS-057, DS-058,
DS-059, DS-060, DS-061, DS-062, DS-063, DS-064, DS-065.

## Aktuelle Scopekorrektur: lokale Arbeitskopien ohne Schlüsselverwaltung (DS-065)

### RC81: Defectpaket aus dem RC80-Gegenreview – E0 abgeschlossen

Die 17 Befunde aus [dem Gesamtgegenreview](../REVIEW_RC80_ANWENDUNG_UX_DATEN_PERFORMANCE_2026-08-31.md)
sind auf Code-/lokaler Regressionsebene korrigiert. Abschluss mit Zuordnung zu
bestehenden Stories und Tests im [Archiv](BACKLOG_ARCHIVE_2026-08.md) sowie
[RC81-Defectbericht](../RC81_DEFECT_ABSCHLUSS_2026-08-31.md). Vollständige lokale
`test:ci` inklusive Pre-/Posttests, Build, ZIP/MCPB und Claude-Strukturvalidator PASS.

**Weiter offen:** echte Cowork-/Gerätenachweise der betroffenen Stories, vollständige
selbstenthaltene Runtime und weitere Formatfreigaben. BL-010.5/BL-051.2 erfordern
außerdem den Kanalabgleich: rohe Marketplace-Quellen enthalten noch historische
Keyring-Vendordateien, die ZIP/MCPB bereits ausschließen. Keine neue
Schlüsselverwaltung, VM, zusätzlichen Konten oder Anwenderbestätigungen.

BL-011.13 wird auf Plain-Snapshots und lokale Reviewkopien ohne zusätzliche
Verschlüsselung umgestellt. Kein Schlüsselbund, Ersatzkeyfile oder Passwort;
keine VM, kein Zusatzkonto und keine weiteren Anwenderdialoge. Arbeitsdateien
sind mit passenden Dateirechten lesbar. Originalschutz, Anonymisierung,
Release-Gates und die Aufbewahrung neuer Plainkopien bleiben bestehen.

RC80-Schnitt: eindeutiger Plain-Speichervertrag, neue/fortgesetzte Plain-Stapel,
Review und Altbestandsschutz. Verschlüsselte V3-/`.dsart`-Daten samt Metadaten
bleiben unangetastet; keine Migration oder Keyringabfrage, Original neu auswählen.
Storetests: 18 PASS, Retentiontests: 24 PASS. Vollständige lokale `test:ci` mit
Pre-/Posttests sowie ZIP-/MCPB-Build und Artefaktprüfung PASS. E0 ist abgeschlossen;
eine echte Cowork-/Zielsystemabnahme bleibt davon getrennt offen.

Native Keyring-Smoke-Tests und zusätzliche Engineering-Keyring-Session-/
Kombinationsinfrastruktur sind **wegen Scopewechsel obsolet, nicht bestanden**.
Historische RC-Nachweise unten bleiben erhalten, ihre Keyring-Arbeitsaufträge
und vorgeschalteten Freigabebedingungen gelten nicht mehr. Anschließend konkrete
Stapel-/Paket-/Cowork-Fehler beheben und den normalen Ablauf zum Ergebnis bringen.

## Product Vision und Dokumentenkanon

BL-003.1 bis BL-003.7 sind mit der RC44-Baseline abgeschlossen und im
[Backlog-Archiv](BACKLOG_ARCHIVE_2026-08.md) nachgewiesen. Die vor einem Release
erforderliche Architektur-/Security-Freigabe wird getrennt als BL-052.5 geführt;
Fresh-Install- und Cowork-Textabnahmen bleiben in BL-041 und BL-051.

## Priorisierter IST/SOLL-Schnitt

| Priorität | Arbeitspaket | Begründung / Reihenfolge |
|---|---|---|
| **P0.0** | BL-011.13: Plain-Snapshots/Reviews und Fortsetzung auf realen Zielsystemen abnehmen | RC80-E0 samt lokaler Regression/Paketen abgeschlossen; keine Keyring-Abnahme vorgesehen |
| **P0.1** | BL-010.8/BL-051.1: selbsttragende Windows-/macOS-Pakete und reale Cowork-Evidenz | ohne Laufzeit kein installierbares Produkt |
| **P1.1** | BL-011.3/BL-041.9: pausierte Stapel, Review ohne menschlichen Timeout und nicht blockierender Abschluss real abnehmen | E0 abgeschlossen; echte Cowork-/UX-Evidenz fehlt |
| **P1.2** | BL-044.1: rekursive Ordnerquelle mit vollständigem Link-/Umfangsgate | gewünschter einfacher Stapelstart |
| **P1.3** | BL-049.1: Signatur-/Struktur-Sniffing und drei Ergebnisgrade real abnehmen | E0 abgeschlossen; Zielsystem-/Security-Evidenz fehlt |
| **P1.4** | BL-047.1: adaptive Parallelität und messbare Cowork-Latenzbudgets | Performance erst nach Sicherheits- und Durability-Gates aktivieren |
| **P2** | BL-042.3: progressive inhaltsfreie MCP-App, Sprach-/A11y- und Adminvertrag | Komfortverbesserung mit vollständigem Fallback |

## Das kann ich noch eigenständig erledigen

Die bisherigen E0-Anteile von BL-011.13 werden durch DS-065 ersetzt. BL-041.9
(nicht blockierender Review-/Abschlussweg), BL-044.1 (Ordnerquelle), BL-047.1
(adaptive Ressourcensteuerung) und BL-049.1 (Format-/Ergebnisgrenze) sind
abgeschlossen. Die Revalidierung hat jedoch neue Vertrags-/Dokumentationsfehler
gefunden. Diese Korrekturscheibe hat Vorrang vor neuen Komfortfunktionen; sie
ändert keine Produktentscheidung und öffnet keine gesperrten Formate oder Hosts.

### Korrekturscheibe: Claude-Vertrag vom 31.08.2026

| Befund | Bestehende Stories | Abgrenzung / Status |
|---|---|---|
| RV-01 Diagnose-Sackgasse | BL-012.2, BL-012.6, BL-052.1 | **E0 korrigiert RC67:** UAT-Picker-Abbruchtest, erreichbare Fehlerhilfe und befristeter IT-Supportweg; Abschluss-/UAT-Vertragstests. E1/E2 echte Dialogabnahme bleibt offen. |
| RV-02 Normal-/Support-Toolvertrag | BL-041.7, BL-042.2 | **E0 korrigiert RC67:** reales Normalmodus-Schema und Legacy-Normalisierung; 34 MCP-Protokolltests einschließlich Sperre aller 17 Supporttools. Keine zusätzlichen Normaltools. |
| RV-03 Skill-/Referenz-/Eval-Drift | BL-041.2, BL-041.4 | **E0 korrigiert RC67:** zwei Schritte, Referenzen und 33 Szenarien mit 14 Korpus-Vertragstests. Echte Modellabnahme und weitergehende nahtlose Zielreise bleiben offen. |
| RV-04 offizieller Paketvalidator | BL-010.8, BL-051.1 | **E0 ergänzt RC67:** lokaler Claude-CLI-Validator, sechs Fehler-/Aufrufvertragsfälle; offizielle Plugin-/Marketplace-Validierung PASS. E1 Installation ohne System-Node bleibt offen. |
| RV-05 Hostnachweis | BL-010.7, BL-051.6 | **E0-Dokumentation korrigiert RC67:** MD/JSON unterscheiden Erreichbarkeit und Hostevidenz; sechs Hosttests. E1/E3 Cloud-/Broker-Bewertung bleibt offen, keine neue Hostfreigabe. |
| RV-06 Timeout-Test nutzt Produkt-Keyring | BL-011.13 | **E0 korrigiert RC68:** synthetischer Gateway-Timeout erhält Testkryptografie und prüft ausdrücklich den zweiten OCR-Aufruf. Erhaltene Installationsmetadaten werden nicht mehr als Reviewrest fehlinterpretiert; strenge Resteprüfung bleibt. Kein Produktions-Cleanup oder Schlüsselmaterial verändert. |
| RC69 Graph-/Parser-Vertrag | BL-020.1, BL-020.2 | **E0-Korrektur:** exakte Bild-/Quellteilbindung, unabhängig typgeprüfter MIME, Formatbindung an den Workerauftrag, kanonische Containerketten einschließlich Unicode-Negativfällen und früheres Knotenbudget. Feinere Locators und vollständige Containerabdeckung bleiben offen. |
| RC69 DOCX-Inhaltserhalt | BL-022.1 | **E0-Korrekturscheibe:** unbemerkter Textverlust bei verschachtelten Tabellen und äußeren Textläufen neben Textfeldern; strukturierte Extraktion und unabhängige Differential-/Negativnachweise. Reale Word-Generator-/Zielsystemabnahme bleibt offen. |
| RC69 SEA-Engineering-Gates | BL-010.1, BL-010.8 | **E0-Teilschnitt:** Source-/Versionsbindung V2, sichere exklusive ZIP-Ausgabe, POSIX-Dateimodi und ausführbare Negativtests. **Technischer P0-Rest:** SEA startet MCP, erreicht aber den isolierten TXT-/DOCX-Worker nicht. Kein neuer Runtime-Release; [Paketvertrag](contracts/SEA_ASSEMBLY_EVIDENCE_V2.md). |
| RC70 Parserrolle/Startschutz | BL-010.1, BL-010.8 | **E0-Teilschnitt:** Workergrenze vor Import, DNS-Promise-Resolver geschützt, separater eingebetteter Windows-Parser mit echten Format-/Rechtenegativproben und unabhängig rekonstruierter vollständiger Bundlebindung. Noch keine MCP-Parent-/Nebenrollen-/POSIX-Integration; [Rollenvertrag](contracts/SEA_PARSER_ROLE_V1.md). |
| RC71 Parent-/Parser-Dispatch | BL-010.1, BL-010.8 | **E0-Teilschnitt:** unveränderbar gebundene Parserrolle, identitätsgeprüfter Hashcache und geschlossener nativer Dispatch. Echter Windows-Parent verarbeitet fünf Textformate wiederholt ohne Start-Seams; normale MCP-Oberfläche und Manipulationsproben bestehen. Getter-Gegenreviewfund geschlossen. POSIX nur Vertragsnachweis, weitere Rollen/Assembly/V2-Evidenz offen; kein Runtime-Release. |
| RC72 feste Nebenrollen | BL-010.1, BL-010.8 | **E0-Teilschnitt:** Batch/Review/Companion über feste Windows-SEA-Rollen in derselben Binärdatei; Node-Verhalten unverändert. IPC-/Startgrenzen und Companion-Timeout, Schlüsselbereinigung und PID-Lifecycle getestet. Reale Proben separat in `docs/TESTING.md`. Vollständiger positiver SEA-Stapel-/Resume-Lifecycle, gesamte Nebenrollenbindung, POSIX und finale Assembly weiterhin offen. |
| RC73 Worker-/Anzeigen-Lifecycle | BL-010.8, BL-041.9, BL-012.6 | **Korrekturschnitt:** asynchrone Spawn-/IPC-Fehler, Besitz bis bestätigtem Exit, veraltete Review-Rückrufe und blockierende Restzustands-/Fehleranzeigen. Zugeordnete Regression und Gegenreview in `docs/TESTING.md`. Reale Cowork-/UI-Abnahme bleibt offen. |
| RC74 native Stapelprobe | BL-010.1, BL-010.8 | **Harness implementiert, native Positivläufe nicht ausgeführt:** explizites Testkonto-Opt-in, zwei isolierte Dateiwurzeln, synthetisches TXT/CSV/DOCX, echte Worker-/Journal-/Paket-/Mappingprüfung für Positivlauf und IPC-Trennung. Serielle Initialisierung; Konto-Erklärung ist keine OS-Attestierung. Security-Fund zu teilweise stehen gebliebenen Namen geschlossen. Worker-Resume wurde in RC75 ergänzt; Parent-Crash bleibt E0-offen. Keine SEA-/Privacy-Freigabe. |
| RC75 Worker-Crash/Fortsetzung | BL-010.8, BL-011.11 | **Harness implementiert, native Ausführung offen:** letzter bildfreier DOCX-Eintrag nach Parser-`close`, zwei fertige Pakete bleiben byte-/hash-/identitätsgleich. Eigener Child-Handle, tatsächlicher anormaler Exit plus Disconnect, Fortsetzung mit gleichem Token und produktiver Lease. Predicate-/VM-/Negativverträge ohne reale Produktjobs. Kein GUI-Starter-, Parent-Crash- oder Power-Loss-Nachweis. |
| RC76 Staging-Recovery (RC75-Fund) | BL-010.8, BL-011.8, BL-011.11 | **E0-Korrektur implementiert:** eigener gleiches-Dateisystem-Stagingbereich, dauerhafte Root-/Payload-/Ownerbindung, einmalige Startrecovery ausschließlich toter Owner. Gegenreview und Unit-/Negativtests sowie echte Node-Prozessabbrüche vor Publish/nach Rename; Originale und Finalpakete bleiben erhalten. Strikte zusätzliche SEA-Staginginventur, keine Reste ausblenden. Ungebundene leere Initialisierungsreste und unbekannte Altverzeichnisse bleiben geschützt und benötigen bei Auftreten lokale IT-Prüfung. Keine neue native SEA-/Cowork-/Power-Loss-Evidenz. |

RC77 ergänzt für BL-010.1/BL-010.8 den **E0-Buildkonsistenzvertrag**: vollständiger
Pluginbaum, Bootstrap, SEA-Konfiguration und ausgeführte Postject-/Commander-
Toolchain werden unabhängig rekonstruiert und mit geschlossener V2-Build-Evidenz
geprüft. Alte oder abweichende Nachweise stoppen vor Assembly/Verifierstart.
Das ist keine Binärattestierung und keine unveränderbare Laufzeitbindung externer
Nebenrollenmodule; diese technische Restgrenze bleibt ausdrücklich offen.

Die nächsten eigenständig lieferbaren Pakete sind klar von ihrer späteren
Produktfreigabe getrennt:

Für E0-3 sind Positiv-, Disconnect- und Worker-Resume-Harness vorhanden.
RC76 behandelt neue Staging-Reste mit belegter Eigentümerschaft; RC77 schließt die
Build-/Assembly-Quellbindung. RC78 ergänzt einen separaten nativen Windows-
Beobachter: gehaltenes Handle, Pipe-Client-/Image-/Handshakebindung, 37 Unit- und
10 echte synthetische Prozessfälle. Architektur-/Security-Gegenreviewfunde zur
Fehlerfallpräzision und Ausgabegrenze sind korrigiert. Keine Produktintegration,
keine zusätzliche Laufzeitabhängigkeit. Als Nächstes den Beobachter mit echtem
Parent-Crash-/Ergebnisoracle verbinden und die Laufzeitbindung externer
Nebenrollenmodule absichern. DS-062/DS-063 schließen zusätzliche System-VM und
Windows-Benutzerkonto aus. Der bisherige Produkt-Keyring-Harness darf deshalb
nicht ausgeführt werden. Sichere Testtrennung im vorhandenen Konto ist ein
vorrangiger eigener E0-Schnitt für BL-010.8/BL-011.13, keine Nutzeraufgabe.
Der DS-063-Komponentenschnitt ist jetzt implementiert: Engineering-Adapter
außerhalb des Produktbaums, fester eigener Service, zufälliger Session-Account,
explizites Memory-Backend in allen ausgeführten Tests. 24 Komponenten-/Negativtests,
18 Quell-/Packaging-Gates und 10 Verifier-Verträge bestehen. Der alte Verifier
blockiert auch mit Konto-Bestätigung vor Assembly-/Produktzugriff. Ein im
Security-Gegenreview gefundener Wiederholungsfehler nach ungewisser Speicherung
ist durch terminale Digest-/Readback-Bindung behoben und nachgeprüft.
**Historischer Testplan, seit DS-065 obsolet:** nativer Backend-Smoke-Test und
private Keyring-Session-/Scope-/Buildbindung über Testprozesse werden nicht ausgebaut.
Produktcredentials bleiben unberührt.
Aus Memory-/abweichenden Testkonfigurationen darf keine unveränderte
Produkt-/OS-Abnahme abgeleitet werden. Details im Rollenvertrag.

RC79 schließt zuvor die im Architekturreview gefundene Reihenfolgelücke:
optionales gehaltenes Parenthandle, Parentende bei nachweislich noch lebendem
Worker, erst danach Workerende. 47 Vertrags- und 17 native synthetische Tests
bestanden. Keine Prozessabstammungs-/Produktfortsetzungsbehauptung. Der geplante
nächste Schnitt war die Engineering-Worker-/Controller-/Ergebnisprüfer-Anbindung;
dieser zusätzliche Testausbau ist nach DS-064 zurückgestellt.
Der Netzwerkguard darf hierfür keine generelle Pipe-Ausnahme erhalten. Konkreter
Plan: [Rollenvertrag](contracts/SEA_PARSER_ROLE_V1.md). Keine VM (DS-062), keine
Produkt-Keyringjobs; der Keyring-Testausbau ist seit DS-065 obsolet.

| Reihenfolge | Stories | Eigenständig lieferbarer nächster E0-Anteil |
|---|---|---|
| **E0-1** | BL-042.3 | **RC68-Teilschnitt implementiert:** passive Start-Momentaufnahme, standardmäßig deaktiviert, SDK offline gebündelt, Schema/Leckage/Protokoll/Sprachen geprüft. Rest-E0: weitergehender terminaler UI-Vertrag und reproduzierbare vollständige A11y-Matrix. Kein Live-Status oder UI-Aktionspfad; Aktivierung erst nach E1/E2. Details: `STATUS_APP_PILOT_V1.md`. |
| **E0-2** | BL-020.1, BL-020.2, BL-022.1 | **RC69-Korrekturschnitt:** Graph-/Quellteil-/Formatbindung und DOCX-Inhaltserhalt gehärtet. Rest-E0: feinere Locators, verbleibende Office-Parts und vollständige Story-/Einbettungsabdeckung; keine weitere Formatfreigabe. |
| **E0-3** | BL-010.1, BL-010.2, BL-010.3, BL-010.6, BL-010.8, BL-011.13 | **DS-065: Plain-Speicherpfad vollständig prüfen, danach normalen Cowork-Stapel abschließen.** Konkrete Paket-/Start-/Fortsetzungsfehler beheben. Native Keyring-Tests und deren zusätzliche Session-/Crash-Infrastruktur sind obsolet, nicht bestanden. Notwendige Produktruntime-/POSIX-/Assembly-Arbeit bleibt offen; Paketgröße/Latenz gegen gebündelten Standard-Node vergleichen. Keine neue Testinfrastruktur als Vorbedingung. Reale Installation bleibt E1. |
| **E0-4** | BL-022.2, BL-022.3 | XLSX/PPTX nur hinter vollständigen Parser-, Coverage-, Sicherheits- und Negativgates implementieren; Freigabe bleibt E1/E3. |
| **E0-5** | BL-023.2 bis BL-023.4, BL-024.2, BL-024.3 | PDF-, Scan-PDF-, OCR- und Bildpfade hinter dem bestehenden NO-GO-Gate weiterentwickeln; Produktaktivierung erst nach vollständiger Drei-OS-/Security-Evidenz. |

Zusätzliche Tests werden nicht als unbegrenzte Sammelaufgabe geführt, sondern
nur einem konkreten Storybefund und dessen Definition of Done zugeordnet.

## Das musst du als Mensch machen

Keine VM oder zusätzliches Windows-Konto bereitstellen (DS-062/DS-063).
Die bisherige Kontoanforderung ist gestrichen. Nach den lokalen Regressionen folgt
die beobachtete Produkt-/Cowork-Abnahme mit synthetischen Dokumenten im vorhandenen
Konto. Kein Schlüsselbundtest und keine Schlüsselverwaltung erforderlich (DS-065).
Originale und verschlüsselte Altbestände bleiben unangetastet.

| Priorität | Stories | Erforderliche reale Evidenz |
|---|---|---|
| **P0** | BL-010.7, BL-041.4, BL-051.6 | In der aktuellen Claude-Version lokale Cowork-Desktop-Sitzung gegenüber Cloud/Web/Mobil/Scheduled erkennen; Spracheingabe und Skillauswahl mit synthetischen Daten vergleichen; nichtlokale Hosts müssen vor Originalzugriff stoppen. |
| **P0** | BL-010.8, BL-051.1, BL-051.2, BL-051.4, BL-051.5 | ZIP-/Marketplace-Fresh-Install, Update, Rückrolle und Entfernung ohne System-Node auf Windows x64 und macOS x64/ARM64. Linux ist eine spätere, getrennte Portabilitätsstufe in BL-010.4. |
| **P0** | BL-011.8, BL-011.9, BL-012.8 | Reparse-/Swap-/Cleanup-Gegenproben und native Supervisor-/Dialog-Evidenz auf Windows und macOS; Linux folgt mit BL-010.4. |
| **P1** | BL-042.2, BL-041.7 | Reale Anzahl der Cowork-Berechtigungsdialoge in Manual/Auto/Skip bei Start sowie 1/5/20 Handoff-Seiten beobachten; Organisationsrichtlinien getrennt dokumentieren. |
| **P1** | BL-041.5, BL-050.3, BL-051.3 | Installierte Realmessung für 1/10/100 Dateien und 500 MiB auf Windows-/macOS-Zielhardware: Zeit, CPU, Peak-RAM, Fortschritt, Stopp und Resume. Dabei die bewusste R3a-Sicherheitskostenstelle getrennt messen: noch nicht extern SHA-256-versiegelte Direktquellen werden vor der Privatkopie einmal vollständig lokal vorgehasht; versiegelte Stapelquellen nicht. Wahrgenommene Wartezeit separat bewerten. |
| **P1** | BL-011.7, BL-012.2, BL-012.3, BL-012.5, BL-012.6, BL-012.7, BL-041.9, BL-052.1, BL-052.4 | Beobachtete Gebrauchstauglichkeit: Fortschritt, alle Endzustände, Fortsetzung, nicht blockierender Review/Abschluss, Tastatur, Fokus, Skalierung, Kontrast und Screenreader ohne technische Hilfestellung. |
| **P1** | BL-020.3, BL-021.1, BL-021.2, BL-022.1 | Installierte Windows-/macOS-Hosttests für Netzwerkfreiheit sowie reale TXT/Markdown/CSV/DOCX-Interoperabilität. Linux folgt als eigene Portabilitätsevidenz. |
| **P1** | BL-011.3, BL-030.2, BL-031.1, BL-032.1 | Pseudonym-, Mehrdeutigkeits- und Zertifikatskontextwege auf echten Zielsystemen fachlich und technisch abnehmen; keine Keyring-Abnahme. Verschlüsselte Quellen werden gemäß DS-046 nicht entschlüsselt. |
| **P1** | BL-052.2, BL-052.3 | IT-/Health-IT- und Datenschutzfreigabe mit ausschließlich synthetischen Daten, einschließlich Inhaltserhalt, Restrisiko, Retention und zulässigem Verwendungszweck. |
| **P2** | BL-011.12, BL-024.2, BL-024.4 | Zwei-Worker- und OCR-Ressourcen-/Timeout-/Qualitätsnachweis auf Windows, macOS x64/ARM64 und Linux x64, bevor ein schnellerer Produktpfad aktiviert wird. |
| **P2** | BL-022.2, BL-022.3, BL-023.1, BL-023.2, BL-023.3, BL-023.4, BL-024.3 | Fach-/Security-Abnahme der noch gesperrten Formate; bis dahin bleiben XLSX, PPTX, PDF und Rasterbilder NO-GO. |

## Jetzt: P0-Release- und Sicherheitsblocker

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.8 | Private Batchwurzel gegen Reparse, Swap und Cleanup-Rennen auf Windows und macOS absichern; Linux-Nachweis folgt mit BL-010.4. | **in Arbeit** |
| BL-011.9 | **E0 umgesetzt; E1 offen:** POSIX-Supervisor im allgemeinen Parser über feste Zielauflösung, Binär-/Hash-/Format-/Vertragsprüfung anbinden. Plugin-ZIP und MCPB prüfen jeden künftig vorhandenen Ziel-Supervisor vor dem Archivieren auf reguläre Datei, Zielbinärformat und SHA-256 und setzen dessen Archivmodus auf `0755`; fehlende Zielartefakte lassen den bestehenden non-release Node-Permission-Pfad unverändert, vorhandene defekte Artefakte stoppen fail-closed. Reale CPU/RAM/Flood/Child/Timeout-Evidenz auf macOS x64/ARM64 bleibt Releaseblocker; Linux x64 folgt mit BL-010.4. | **in Arbeit** |
| BL-012.8 | Darwin-Reviewvertrag mit echtem `osascript`- und Fresh-Install-Nachweis schließen. | **in Arbeit** |
| BL-010.7 | Lokale Cowork-Desktop-Sitzung versionsgebunden positiv nachweisen; Cloud/Web/Mobil/Scheduled ohne lokalen MCP müssen vor Originalzugriff stoppen. | **in Arbeit** |
| BL-010.8 | **E0 teilweise; E1 offen:** Assembly V2 gehärtet, RC70-Parsergrenze, RC71-Parentdispatch und RC72-Nebenrollen-IPC real auf Windows geprüft; RC77-Buildkonsistenz synthetisch geprüft. Noch E0: positiver SEA-Stapel-/Resume-Lifecycle, unveränderbare externe Modulbindung zur Laufzeit, POSIX-Artefakte/-Integration, finale Rollenassembly und kombinierte V2-Evidenz. Danach Windows-x64/macOS-x64/-arm64, Fresh Install, Update und Rollback real belegen; Linux folgt BL-010.4. Bis dahin kein Release. | **in Arbeit** |
| BL-041.4 | Gleichheit von Spracheingabe und Skillauswahl mit Modell-/Fresh-Install-Nachweis belegen. | **in Arbeit** |
| BL-041.5 | 500-MB-, Restart-, Windows-/macOS- und Cowork-Nachweis für getrennte lokale Stapelverarbeitung erbringen; Linux folgt später. | **in Arbeit** |
| BL-042.2 | **E0 abgeschlossen; E1 offen:** Alle 25 Tools besitzen vier explizite, getestete Risikohinweise; Berechtigungen in Cowork Manual/Auto/Skip real abnehmen. | **in Arbeit** |
| BL-051.5 | ZIP-/Marketplace-Lebenszyklus in Cowork real abnehmen. | **offen** |
| BL-051.6 | Web, Mobil, Cloud und getrennten Desktop negativ auf Originalzugriff abnehmen. | **in Arbeit** |

## Als Nächstes: Kernworkflow und Nutzerreise

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.3 | Einen aktiven, mehrere pausierte Stapel mit produktivem Pseudonymkontext sichern. | **in Arbeit** |
| BL-011.6 | **E0 abgeschlossen; E1 offen:** Zentrale Einzelgrenzen (TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes, DOCX 64 MiB/128 MiB entpackt) und 500-MiB-Stapelgrenze werden vor dem Hintergrundlauf getestet; Grenzfälle auf Zielsystemen abnehmen. | **in Arbeit** |
| BL-011.7 | **E0 abgeschlossen; E1/E2 offen:** Inhaltsfreie lokale Phasen-/Zählermeldung, sicherer Abbruch und explizites Resume sind regressionsgetestet; plattformgleich beobachten. | **in Arbeit** |
| BL-030.2 | Neustartfeste stapelweite Pseudonyme mit minimalem lokalem Kontext ohne Keyring/zusätzliche Verschlüsselung umsetzen und prüfen (DS-065); terminale Bereinigung und stabile Aliase über Fortsetzung nachweisen. Keine automatische Aktivierung durch den Snapshot-Speicherwechsel. | **in Arbeit** |
| BL-012.2 | **E0 abgeschlossen; E1/E2 offen:** Abschluss, lokale Prüfung, explizite Fortsetzung, Mapping-Reparatur und sicherer Stopp erzeugen genau eine inhaltsfreie Meldung mit genau einer nächsten Aktion; auf Ziel-OS nachweisen. | **in Arbeit** |
| BL-012.3 | Vertagte Entscheidungen sicher und ohne neue Auswahl fortsetzen. | **in Arbeit** |
| BL-012.5 | Tastatur, Skalierung und Screenreader auf Windows und macOS abnehmen; Linux folgt später. | **in Arbeit** |
| BL-012.6 | **E0 abgeschlossen; E2 offen:** Anwenderstatus und genau eine nächste sichere Aktion sind vereinheitlicht; beschädigte Checkpoints bleiben fail-closed. | **in Arbeit** |
| BL-012.7 | **E0 abgeschlossen; E2 offen:** Kurzer Picker-/Ergebnisweg, gleichnamige Quellen über opake IDs und Fortsetzung ohne Neuauswahl sind technisch regressionsgetestet; verständlich abnehmen. | **in Arbeit** |
| BL-031.1 | **E0-Kontextkorrekturen RC43/RC81 abgeschlossen; Fachevidenz offen:** Fundstellen gruppiert und lokal im Stapel entscheiden. R80-01–05 ergänzen positionsbezogene Inhaber-/Aussteller-/Arbeitgeberrollen, unbekannte Zertifikate, Gesundheits-IT und Produktnamen mit Gateway-Regressionen. | **in Arbeit** |
| BL-032.1 | Mehrdeutigkeitsdialog plattformgleich liefern. | **in Arbeit** |
| BL-041.1 | **E0 abgeschlossen; E1 offen:** Beide Skillstarts verwenden denselben Picker-/Jobvertrag; in echter Claude-UI beobachten. | **in Arbeit** |
| BL-041.2 | Ursprüngliche Claude-Aufgabe begrenzt und fortsetzbar weiterführen. | **in Arbeit** |
| BL-041.3 | **E0 abgeschlossen; E1 offen:** Skill-/Hostvertrag lehnt hochgeladene Originale ab und erklärt nur den lokalen Pickerweg; echte UI abnehmen. | **in Arbeit** |

## Cowork Fast Path – schlank, lokal und messbar

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-041.6 | **E0 abgeschlossen; E1 offen:** Reine Anonymisierung endet als `local_only` ohne Ergebnislesen, Bestätigen oder Polling durch Claude und zeigt lokal genau eine terminale Zählerübersicht ohne Dokumentdaten. | **in Arbeit** |
| BL-041.7 | **E0 inklusive RC81-Defects abgeschlossen; E1 offen:** Normale Cowork-Fassade umfasst 8 von insgesamt 25 Werkzeugen; Skill/Handbuch/Manifest werden gegen Drift geprüft. Windows-Auswahl/Unicode, terminaler Handoff, asynchroner Picker und präzise Aussagen zu lokalem Abschluss, Bildern und Dateizuordnung sind korrigiert. Reale Berechtigungszahl, Host-Abbruch und Fresh-Install-Sichtbarkeit bleiben offen. | **in Arbeit** |
| BL-041.8 | **E0 abgeschlossen; E1 offen:** MCP-Tasks/-Benachrichtigungen versionsgebunden prüfen; ohne Hostnachweis kein Produktpfad und kein Polling. | **in Arbeit** |
| BL-050.3 | **E0-Metrik-/Durability-Grundlage inklusive RC81 abgeschlossen; E1 offen:** Inhaltsfreie Messung nutzt echte TXT-/CSV-/DOCX-Pfade, monotone Uhr, Kalt/Warm, 1/10/100, p50/p95, Gesamtzeit, CPU, Peak-RAM und nicht zugeordnete Laufzeit. Der plattformneutrale Fsync-Vertrag zählt Datei- und POSIX-Verzeichnis-Fsync getrennt. RC81 hält reine Phasenmarker im RAM und reduziert normale Item-Writes von 10 auf 4 (durable 5 auf 4); Commitfehler bleiben recoverbar. Zielhardware, echter Laufzeitgewinn und Power-Loss-/Dateisystemevidenz bleiben E1. | **in Arbeit** |
| BL-011.10 | **E0 abgeschlossen; E1 offen:** Intake läuft nach Auswahl lokal im Hintergrund; Cowork antwortet ohne Quellmetadaten. Ein belegter Exit-vor-IPC-Race wird durch ein kurzes lokales Drain-Fenster abgefangen, damit ein bereits erfolgreicher Stapel nicht fälschlich als gestoppt erscheint. Reale Antwortzeit und Drei-OS-Abnahme bleiben offen. | **in Arbeit** |
| BL-011.11 | **E0-Korrektur RC76 implementiert; E1 offen:** Gemischtes Resume, feste I/O-Phasen, begrenzte Handoff-Dekodierung, Indexfenster und Buffer-Wipe bleiben erhalten. Neue unveröffentlichte Pakete besitzen gebundene Recovery; normale Fehler und tote Worker werden getestet, fertige Pakete/Originale geschützt. Startinventur einmal je Lauf, nicht je Datei. Altreste/defekte Bindungen nicht automatisch löschen. Weitere I/O-Optimierung und plattformweite Crashbewertung warten auf reale Dateisystemmessung. | **in Arbeit** |
| BL-011.12 | **E0 abgeschlossen; E1 offen:** Ein nicht importierter Zwei-Worker-Harness prüft zentrale Reihenfolge/Commit, Slots, geschlossene Nachrichten, Crash, ungewissen Commit und Ressourcenstopps; Produktstandard bleibt seriell bis zur Windows-/macOS-Abnahme. Linux folgt später. | **in Arbeit** |
| BL-011.13 | **Scope ersetzt durch DS-065, RC81-E0 abgeschlossen; E1/E3 offen:** lokale Plain-Snapshots/Reviewkopien ohne Schlüsselbund, Keyfile oder Passwort. Intake-Orphans, terminaler Legacy-Erhalt, Journal-v4-Schutzscan und Zero-Day-Laufende sind korrigiert. Bei 0 Tagen keine Fortsetzung offener Kopien nach Laufende; fertige Ergebnisse bleiben erhalten. Store18/Retention24, Gateway-E2E43, MCP39, gemischte Fortsetzung, vollständige lokale `test:ci` und ZIP-/MCPB-Prüfung PASS. Native Keyring-Abnahme/Unterbau obsolet, nicht bestanden. | **in Arbeit** |
| BL-024.4 | **E0 abgeschlossen; E1/E3 offen:** Der nicht importierte OCR-Session-Harness prüft geschlossenes Framing, Requestbindung, Replay, Single-Flight, Pixel-/Byte-/Zeitbudgets und Abbruch. Der sichere Einbild-Worker bleibt aktiv, bis native Per-Frame-Grenzen und Windows-/macOS-Evidenz vorliegen. Linux folgt später. | **in Arbeit** |
| BL-041.9 | **E0 inklusive RC81 abgeschlossen; E1/E2 offen:** Der abgekoppelte Review-Worker wartet ohne menschlichen Entscheidungs-Timeout, der synchrone Supportpfad bleibt begrenzt. Große Reviews werden früh in begrenzte Gruppen aufgeteilt; Abbruch und spätere Fehler erhalten vorher fertige Ergebnisse. Abschlussdialog blockiert weder Worker noch Cowork; pausierte Stapel verhindern keine neue Auswahl. Echte Cowork-/Windows-/macOS-UX-Evidenz bleibt offen. | **in Arbeit** |

## Neue Zielpakete aus dem Produktreview

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-044.1 | **E0 mit RC66 abgeschlossen; E1 offen:** Native Ordnerpicker für Windows/macOS/Linux, deterministische rekursive Vollprüfung vor Aufnahme, keine Link-/Junction-/Reparse-Verfolgung, feste Tiefen-/Eintrags-/100-Dateien-/500-MiB-Grenzen und stabile relative lokale Mappingbezeichner. Reale Link-/Race-Gegenprobe auf Releaseplattformen bleibt offen. | **in Arbeit** |
| BL-047.1 | **E0 mit RC66 abgeschlossen; E1 offen:** Adaptive Policy begrenzt Vorbereitung auf 25 Prozent RAM, höchstens 2 GiB und maximal zwei Slots; OCR bleibt single-flight. Ein echtes Gleitfenster begrenzt vorbereitete Bytes, veröffentlicht weiterhin strikt seriell in Quellreihenfolge und bereinigt bei Abbruch/Commitfehler. Der 100-Dateien-Test verwendet wie der Cowork-Handoff atomare Zehnerseiten statt 97 redundanter Einzelbestätigungen. Produktstandard bleibt bis zur Windows-/macOS-Referenzmessung seriell. | **in Arbeit** |
| BL-049.1 | **E0 einschließlich RC65-identitätsgebundener Ergebnisprojektion und RC64-OPC-Interoperabilität abgeschlossen; E1/E3 offen:** Der descriptor- und identitätsgebundene Source-Preflight plant den vollständigen Mehrfachstapel mutationsfrei. TXT/Markdown/CSV/DOCX-Kandidaten werden erst danach kopiert; Mismatches, ungültiger Text, gesperrte Formate, beschädigte/polyglotte Container, aktive Inhalte, verschlüsselte ZIP-Einträge und CFB/OLE werden pro Datei vor jeder privaten Kopie journalisiert. Der Reststapel läuft weiter. OOXML durchläuft vorher eine begrenzte CRC-Prüfung aller Einträge sowie echte OPC-Steuerteil- und Relationship-Prüfung; ein SHA-256-Vergleich bindet die positive Prüfung an exakt die Snapshot-Bytes. RC64 erlaubt Standard-Paketmetadaten und sichere, im Paket verbleibende relative Ziele, während externe und aktive Beziehungen unverändert stoppen; XLSX/PPTX bleiben gesperrt. V3-Pakete, V2-Journal/Mapping, Evidence v3 und Audit-Receipt v4 binden die drei DS-045-Grade crashsicher. RC65 bindet terminalen Progress, Abschluss und Cowork-Handoff über exakte private BigInt-Dateisystemidentitäten erneut an die veröffentlichten Pakete, ohne deren Inhalt erneut zu hashen; Results und Lesepfad behalten ihre vollständige Verifikation. Fehlende oder geänderte Pakete bleiben `unavailable`, private Identitäten verlassen den Checkpoint nicht. Laufende Zustände und Altbestände bleiben ausdrücklich `unavailable`; Acknowledgements erzeugen keinen zweiten Dialog. Verbleiben: reale Windows-/macOS-Cowork-, Accessibility- und Security-Abnahme E1/E3. | **in Arbeit** |
| BL-042.3 | Inhaltsfreie MCP-App als progressive Verbesserung sowie vollständigen Text-/OS-Fallback, Deutsch/Englisch und A11y-Gates liefern. RC68: passive Startkarte E0, deaktiviert; terminaler UI-Vertrag, volle A11y-Matrix und E1/E2 bleiben offen. | **in Arbeit** |

## Danach: Content-Gates und gesperrte Formate

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-020.1 | Gemeinsamen Content-Graph und Locatorvertrag vollständig nachweisen. | **in Arbeit** |
| BL-020.2 | Rekursive Einbettungen und aktive Inhalte vollständig absichern. | **in Arbeit** |
| BL-020.3 | Netzwerkfreiheit als eigenes Gate auf Zielplattformen beweisen. | **in Arbeit** |
| BL-021.1 | TXT/Markdown praktisch auf Windows und macOS freigeben; Linux-Evidenz folgt mit BL-010.4. | **in Arbeit** |
| BL-021.2 | CSV praktisch auf Windows und macOS freigeben; Linux-Evidenz folgt mit BL-010.4. | **in Arbeit** |
| BL-022.1 | DOCX-Interoperabilität und vollständige Story-Coverage schließen. | **in Arbeit** |
| BL-022.2 | XLSX erst nach vollständiger Coverage freigeben. | **offen** |
| BL-022.3 | PPTX erst nach vollständiger Coverage freigeben. | **offen** |
| BL-023.1 | PDF-/OCR-Risikogate als NO-GO weiterführen, bis alle Pflichtzellen erfüllt sind. | **in Arbeit** |
| BL-023.2 | Text-PDFs nur nach vollständiger Sicherheitscoverage freigeben. | **offen** |
| BL-023.3 | PDF-Formulare, Annotationen, Anhänge und Verschlüsselung absichern. | **offen** |
| BL-023.4 | Scan-PDFs und visuelle Coverage freigeben. | **offen** |
| BL-024.2 | Gebündelte OCR-Backends zunächst für Windows und macOS liefern; Linux folgt mit BL-010.4. | **in Arbeit** |
| BL-024.3 | PNG, JPEG und BMP nach OCR-Coverage freigeben. | **offen** |

## Distribution, Qualität und externe Abnahme

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-010.1 | Betriebssystemneutralen Plugin-Startvertrag komplett beweisen. | **in Arbeit** |
| BL-010.2 | Windows-Paket liefern. | **offen** |
| BL-010.3 | macOS-Paket liefern. | **offen** |
| BL-010.4 | Nach dem Windows-/macOS-Erstrelease ein Linux-Paket mit eigener Hostevidenz liefern. | **offen** |
| BL-010.6 | Versionsarchiv und Rückrolle testen. | **offen** |
| BL-051.1 | Frische ZIP-Installation auf Windows x64 und macOS Intel/ARM abnehmen. | **offen** |
| BL-051.2 | **E0-Kanalbereinigung und E1 offen:** historische Keyring-Vendordateien aus dem rohen Marketplace-Pfad auslagern, ohne sie in ZIP/MCPB zurückzubringen; anschließend Marketplace-Installation auf Windows x64 und macOS Intel/ARM abnehmen. | **offen** |
| BL-051.3 | 100-Dateien-/500-MB-End-to-End-Abnahme durchführen; das RC63-UAT-Kit erzeugt die 100 synthetischen Eingänge reproduzierbar, die installierte E1-Messung bleibt offen. | **offen** |
| BL-051.4 | Rückrolle auf Windows x64 und macOS Intel/ARM abnehmen. | **offen** |
| BL-052.1 | Beobachtete Anwenderabnahme durchführen; ausführbares RC63-Kit mit 111 synthetischen Eingängen und leerer Evidenzvorlage ist als E0-Vorbereitung vorhanden. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen; reproduzierbare Eingänge, inhaltsfreie Sollmatrix und unverfälschte leere Evidenzfelder sind vorbereitet. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit beobachteten Nutzenden abnehmen. | **offen** |
| BL-052.5 | Zielarchitektur und lokale Sicherheitsgrenze vor dem breiten Rollout durch Architektur und Security freigeben. | **offen** |

## Epic-Index

Die folgenden stabilen Epics binden Entscheidungen, Ist-Abgleich und Open-Source-
Register. Geschlossene Epics BL-001, BL-002 und BL-040 stehen nur noch im Archiv.

### BL-010 – Plattform und Distribution
### BL-003 – Product Vision und Dokumentenkanon (archiviert)
### BL-001 – Dokumentensystem und Wiederverwendung (archiviert)
### BL-002 – Ist-/Zielvertrag und Drift (archiviert)
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
### BL-040 – Lokaler Export und Nachweis (archiviert)
### BL-041 – Claude-Übergabe
### BL-043 – Cowork-Fast-Path
### BL-044 – Sichere Datei- und Ordnerquellen
### BL-047 – Performance und Ressourcensteuerung
### BL-049 – Inhalts- und Formatgrenze
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme
