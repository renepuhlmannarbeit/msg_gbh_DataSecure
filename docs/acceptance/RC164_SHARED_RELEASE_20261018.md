# RC164 – gemeinsamer Windows-/macOS-Teststand

Nutzerauftrag vom 18.10.2026: neuesten implementierten Featurestand als dieselbe
Version für Windows x64, macOS Apple Silicon und Intel bereitstellen. Die
frühere ungefähre Nummer139/140 wird nicht rückwärts übernommen: Quellversion
ist 3.2.0-rc164. Beide nativen Mac-Build-/Testjobs und deren private Runner-Minuten
sind ausdrücklich freigegeben. Keine Desktopbedienung, M2-Anwendertest später.
Timer bleibt PAUSED; keine Developer-ID, Apple-Einreichung oder Storeverteilung.

## Gemeinsamer Funktionsstand

Ausgangspunkt ist exakt der R8-Produktinputhash
a08125d25e89aa224559a2e0b4adf3710ea5c53a7202b1492f58f56e374dd62c
mit328 Dateien, vor Versionsschnitt und neuer Mac-Buildverkabelung. Enthalten
sind insbesondere das echte Fünfer-Verlaufsfenster, gezieltes Detail-Laden,
frühe Filterung ausgeblendeter/fehlender Einträge, verständlichere Abschluss-
und Exportnavigation, neuer leerer Dateientwurf nach konsumiertem Lauf,
Schnellweg und die mehrfach gegengeprüften Robustheits-/Datenschutzkorrekturen.
Historische R5–R8-Pakete/Evidenzen werden nicht verändert oder umbenannt.

## Mac-Quellenreview und tatsächliche Buildlücke

Der statische Guard gehört in denselben mutierenden Core-Prozess, nicht in
einen externen Lockkeeper. App/Core bleiben gehärtet; Core hat ausschließlich
allow-jit und benötigt kein dynamisch geladenes fremdsigniertes Guardmodul.
Der getrennte offizielle Node-Konverter bleibt ein anderer, hashgepinnter
Artefaktrollentyp mit seinen unveränderten Upstream-Entitlements. Dessen
disable-library-validation darf nicht als aktivierte Core-Library-Validation
ausgegeben werden. Keine Benutzer-Schutzrichtlinie wird abgeschaltet.

Bestätigter Verpackungsblocker vor dieser Runde: leere approved_artifacts-
Liste, kein nativer FINAL-CORE und keine Producer→Consumer-Übergabe. Ein
grüner Windows-/Quellenmodelltest kann diesen Mac-Nachweis nicht ersetzen.

Neue zweistufige Kette:

1. Manueller, kostenbestätigter nativer Producer auf macOS15 ARM64 und Intel;
   exakt gebundener Gitcommit, Node22.23.2-Sourcearchiv/Originalinterpreter,
   Python3.13, Apple-Xcode-Toolchain. Neuer privater Buildordner unter /opt,
   keine Änderung vorhandener ACLs, Rechte oder Sicherheitseinstellungen.
2. Statische Quelltransformation, Configure-/Compilevertrag, Corekompilierung,
   lokale ad-hoc-Härtung und explizite Core-/Konverterproben. Vier abgeschlossene
   Consumerdateien in geschlossenem USTAR, getrennte tatsächliche Buildlogs.
   Das Erzeugen eines Kandidaten ist ausdrücklich noch keine Freigabe.
3. Unabhängige Sichtung tatsächlicher Compiler-/Linkbefehle und Provenienz;
   erst danach explizite kanonische FINAL-CORE-Hashfreigabe je Architektur im
   Quellcode. Keine Approval aus selbst gemeldeter adjacent evidence.
4. Consumer lädt nur den exakten Run/Commit/Target und importiert genau vier
   reguläre Dateien. Bestehender Verifier bindet Sourcepins, Corebytes,
   Provenienz, separates offizielles Konverterartefakt und Entitlements vor
   Cargo. Core nach diesem Schritt nicht neu signieren oder verändern.
5. Full-native Static-Core-Gate mit CLI/--require, fork/IPC, Worker, Guard und
   Fehlerfällen, danach App-/ZIP-/DMG-/Konvertierungs-/Startgates. Windows wird
   ebenfalls vom abschließenden gemeinsamen Quellcommit neu gebaut.

Der Producer behauptet derzeit bewusst kein bestätigtes Ende jeder Compiler-
Prozessgruppe. Diese Provenienz bleibt false; Exit+Close des direkten Kindes
ist kein vollständiger Prozessbaumbeweis. Kein Mock wird als native Abnahme
oder als grüne Finder-/Gatekeeper-/M2-Anwenderprüfung ausgegeben.

## Noch zu binden

Native Vorläufe 39154063265/39154325186 stoppten vor Kompilierung mit
BOUND_FILE_UNSAFE. Feste Phasendiagnose isolierte /usr/bin/make. Run39154532657
belegt reguläre Rootdatei0755, drei Root0755-Ancestors, nlink78. Das ist ein
System-Shim, kein beschädigter privater Input. Separater build-only Leser für
geschlossene /usr/bin-Toolrollen misst read-only die tatsächliche Datei mit
O_NOFOLLOW/O_NONBLOCK, vollständiger FD-/Namens-/Zeit-/Linkzahlbindung und
einmaligem Close; kein zurückgegebenes Rewrite-Token.35 Gegenfälle grün.
Allgemeiner Producer-/Produktleser bleibt nlink1. Hash des Shims ist keine
atomare Exec-Bindung oder vollständige ACL-Attestierung der Toolchain; bekannte
Vertrauensannahme über die unveränderliche Runner-Systemnamespace bleibt.
Fehlversuche bleiben erhalten und werden nicht als Buildnachweis gezählt.

Der nächste native Vorlauf erkannte drei UTF-8-Testfixturen des unveränderten,
hashgepinnnten Node-Sourcearchivs als angeblich unsichere Namen: BSD-tar gibt
unter LC_ALL=C Nicht-ASCII-Zeichen als literale Oktal-Backslashfolgen aus.
Nur die beiden lesenden Mitglieder-/Typauflistungen erhalten jetzt explizit
en_US.UTF-8. Keine Backslashdekodierung, keine Namespace-Ausnahme; echte
Backslashes, Traversal, absolute und fremde Archiveinträge bleiben verboten.
Run39155465781 aus a172b8a23bd7973228ad8d95f2ef5da42b5ba4cb ist der
darauf gestartete gemeinsame native Producer, zunächst noch ohne PASS.

## Rechte-/Restriktionsreview nach Nutzerfrage

Zwei unabhängig beauftragte KI-Quellenreviews (Rust/TCC/Start und Node/Worker/
Datenspeicher), anschließend direktes Gegenlesen der Produktionsaufrufe.
Das sind KI-Prüfrollen, keine zertifizierten Fachpersonen oder Zielhostabnahme.
Keine Systemrechte, ACLs, Schutzrichtlinien oder Benutzerdateien verändert.

Der make-Befund ist **keine verweigerte macOS-Berechtigung** und gehört nicht
zur installierten App. Der CI-Producer wollte ein ausführbares Systemwerkzeug
lesen/messen; unsere nlink1-Annahme war falsch. Root als Dateieigentümer
bedeutet nicht, dass nur Root sie lesen oder ausführen darf. Xcode-shims unter
/usr/bin sind von Apple dokumentiert. Signaturidentität und POSIX-/TCC-Rechte
sind verschiedene Mechanismen. Developer-ID gewährt keinen Documents-Zugriff.

| Produktionszugriff | Zeitpunkt / tatsächliche Anforderung | Grenze und Fehlerverhalten |
| --- | --- | --- |
| App-Bundle, Core und Ressourcen lesen; Core ausführen | Bereits vor Ready; normale Lese-/Such-/Ausführungsrechte, passende Architektur und gültiges lokales Seal | Kein Schreiben ins Bundle, kein sudo. Gatekeeper, Hardened Runtime und Endpoint-Richtlinien können separat verweigern; Exit/Signal und begrenzte Startproben werden protokolliert. |
| Eigener privater Datenbereich unter ~/Library/Application Support/SecureDataMsg-Standalone | Vor Ready; Benutzerrechte, lokales APFS/HFS, sichere Eigentümer-/ACL-/Namespaceverhältnisse | Das sind zusätzliche eigene Integritätsanforderungen, keine mit Developer-ID erlangbaren Rechte. Ungeeignete Netzwerk-/Shared-/ACL-Speicher werden vorsichtshalber abgewiesen, nicht automatisch umberechtigt. |
| Gespeicherte und reservierte historische Ergebniswurzeln | Teilweise vor Ready; lstat/realpath zur Trennung privater/öffentlicher Bereiche | Auch ein früher verweigerter Altpfad kann Ready verhindern. Ein fehlender neuer Standardordner allein tut das nicht. Trennprüfung bleibt erhalten; frühere pauschale Fehlerklasse wird auf UNSAFE_STORAGE_LOCATION abgebildet, ohne TCC als bewiesene Ursache auszugeben. |
| Standardziel Documents/SecureDataMsg | Pfad beim Start nur berechnet; Anlegen erst beim ausdrücklichen Verarbeitungsstart | TCC/Files-and-Folders möglich. Fehler STANDALONE_RESULT_ROOT_UNAVAILABLE; kein pauschaler Vollzugriff, Adminmodus oder Zertifikat als Reparatur. |
| Dateien/Ordner auswählen und Quellen lesen | Nach Benutzeraktion; native rfd/macOS-Panel, danach gebundene Quellenaufnahme | Normaler Standalone-Auswahlweg benötigt weder Terminal.app noch AppleScript. Auswahl allein überstimmt keine POSIX-/ACL- oder Organisationssperre; SOURCE_ACCESS_DENIED bleibt explizit. |
| Ergebnisse/Exporte schreiben | Nach Auftrag; lokales Ziel, gebundene Verzeichnisidentität, für atomare Bereitstellung gleiches Volume | AI_EXPORT_VOLUME_MISMATCH ist eine eigene Transaktionsgrenze, keine behauptete Apple-Rechteverweigerung. Originale, interne Zuordnungen und Prüfstände werden nicht pauschal weitergegeben. |
| Prozessidentität über /bin/ps | Lease-Übernahme, ggf. Recovery; eigene Prozesse abfragen, kein Shellaufruf | Prozesssperren oder Toolfehler können den Lauf verhindern. Neue feste PROCESS_IDENTITY_*-Diagnose für verweigert/fehlend/Timeout/ungültig/sonstiger Fehler; Observer bleiben null/unknown. Kein PID-only-Fallback. |
| Worker, Konverter, Supervisor und Canvas-Addon | Gebündelte separate Executables; feste Pfade, unterschiedliche Rollen | Eine nur gesperrte Terminal-App ist nicht dasselbe wie ein Verbot dieser Prozesse. Organisationsrichtlinien können Executables verweigern. Core enthält Guard statisch und nur allow-jit; offizieller Konverter behält offen dokumentierte Upstream-Entitlements. |
| Finder-Öffnen und Diagnose | /usr/bin/open nur nach Auftrag; frühe Diagnose best-effort im Benutzer-Tempbereich | Keine Desktop-/Accessibility-/Screen-Recording-Berechtigung angefordert. Diagnoseausfall darf keinen Verarbeitungserfolg erfinden und keinen fremden Inhalt protokollieren. |

**Neue bestätigte Fehler aus dieser Runde:** (1) Prozesszuordnungsfehler gingen
als INTERNAL_FAILURE beziehungsweise beim äußeren Resume-/Reviewstart als
generischer Startfehler verloren; geschlossene Ursache wird durchgereicht.
(2) Früher Intakefehler konnte in Standalone noch den externen osascript-
Noticeweg erreichen; abgelehntes Promise war unbehandelt und konnte Node
beenden. Standalone muss auch dort ausschließlich seinen In-App-Fehlerstatus
verwenden; der verbleibende Pluginpresenter muss sein Promise behandeln.
(3) Frühe Rootverweigerung verlor vor dem gemeinsamen Bootstrap ihre feste
Speicherklasse; Desktopmapping wird vereinheitlicht, nicht die Prüfung entfernt.
(4) Verweigerte Rust-Dateizugriffe wurden vor Core-Bindung als fehlende
Komponente beziehungsweise in der Probe als beschädigte Bytes ausgegeben.
Die tatsächliche Tauri-Ressourcenauflösung bleibt dieselbe; nur die feste
IO-Ursache bleibt jetzt vor deren UnknownPath-Abbildung erhalten. Nach
PermissionDenied kein weiterer Core-/Debug-Fallback; Bind/Probe/Spawn bewahren
die feste Klasse. (5) Ein vor dem ersten Journal gestoppter Intake war trotz
In-App-Notice ohne sichtbare Fehlerkarte. Ein prozesslokaler, exakt an Versuch
und Token gebundener Beleg bleibt nach Workerende und Notice-Timeout sichtbar;
er erfindet weder Historyabschluss noch Wiederaufnahme-/Ergebnis-/Exportrechte.
ACK erst nach zwei Renderframes der weiterhin passenden sichtbaren Karte.
(6) Unabhängiger Gegenreview fand danach das noch nicht angepasste native
Admission-Gate. Neue Auswahl ist für start_failed nur bei exaktem Fehlercode
und explizitem worker_active=false erlaubt; unbekannt/fehlend/anders typisiert
bleibt gesperrt. Der Service prüft die Aktivität bei Admission nochmals.

Quellengegenreviews durch getrennte KI-Aufträge für Rust/Bündelrechte sowie
Service→Executor→UI→native Admission; beide Korrekturwege wurden danach erneut
direkt gegengelesen. Ein weiterer Quellencheck des privaten Mac-Datenbereichs
bestätigt: Root-Ancestors werden nur gelesen, normales Home-deny-delete-ACL
ist zulässig; keine unerfüllbare Admin-/Systemschreibvoraussetzung im geprüften
gewöhnlichen lokalen Profil. Netzwerk-/umgeleitete Homes bleiben gesondert.
Die JIT-Dokumentation trennt nun Rust-UI, statischen Produkt-Core und den
offiziellen Konverter einschließlich dessen Upstream-LV-Ausnahme ausdrücklich.

Erster unveränderter gezielter Entwicklungsnachweis:21/21 Testdateien unter
dist/rc164-permission-review-20261018, Quellen4e5d2d09…; kein Mac-/GUI-PASS.
Dieser Nachweis liegt vor dem zusätzlichen Admission-/Dokumentationsgegenfix.
Der breitere parallel gestartete CI-Entwicklungslauf unter
dist/rc164-permission-regression-20261018 ist nach diesem neuen Gegenbefund
kein finaler Quellenfreeze: Änderungen werden nicht versteckt, sein Vor-/Nach-
Fingerprint muss sie kenntlich machen. Gezielter Folgelauf wird separat unter
dist/rc164-permission-review-final2-20261018 gebunden; voller gemeinsamer
Quellen-/Paketnachweis erst nach tatsächlicher Mac-Core-Approval.
Nach dem Admissiongegenfix: Windows-Rust216 bestanden,0 fehlgeschlagen,
3 ausdrücklich ignorierte Subprozess-Checkpoints; Release-Clippy all-targets
mit -D warnings bestanden. Das Darwin-Modul, Unix-Linkgegenfall sowie native
TCC-/Finder-/M2-Fälle sind dadurch nicht ausgeführt oder abgenommen.

**Offene reale Mac-Gates:** frisches Benutzerprofil ohne Ergebnisordner,
Documents-Zustimmung und Ablehnung, entzogener gespeicherter Ergebniszugriff,
normales Home-ACL, Unternehmensprofil, Finder/ZIP/DMG samt Quarantäne und
native Core-/Konverter-Ladekette. Kein Rechtefehler ist für den ursprünglichen
M2-RC161-Trap bewiesen: dort endete der Core vor Ready mit SIGTRAP, nicht mit
einem belegten EACCES/EPERM. Ein fehlender erster Ergebnisordner erklärt diesen
Befund nicht aus dem geprüften Ablauf. macOS kann die konkrete TCC-/ES-Quelle
nicht zuverlässig aus einem allgemeinen Fehlercode allein offenlegen.

Zusätzliche, nicht als bewiesener Defekt ausgegebene Architekturgrenze:
batch/review werden durch background-role-launcher.js autonom/detached
gestartet. Apple weist auf mögliche TCC-Attributionsbrüche beim Daemonisieren
von Helfern hin. Daraus folgt nicht, dass unser setsid/fork-Weg tatsächlich
betroffen ist; der bisherige M2-Trap liegt davor. Der native GUI-Test muss
die Zuordnung App→Core→Worker bei Zustimmung/Ablehnung auf frischem Profil
und nach Testbuildwechsel prüfen. Nicht ungeprüft detached entfernen und
damit die bestätigten Worker-/Recovery-/IPC-Verträge brechen. Ad-hoc-Code
kann bei Versionswechseln wiederholt TCC-Prompts auslösen; fehlende Developer-ID
ist deshalb für Identitätskontinuität relevant, aber kein allgemeines Verbot
normaler Dateizugriffe. Keine automatische TCC-Manipulation oder Vollzugriff.

Primärabgleich: [Apple On File System Permissions](https://developer.apple.com/forums/thread/678819),
[Files and Folders](https://support.apple.com/guide/mac-help/control-access-to-files-and-folders-on-mac-mchld5a35146/mac),
[Gatekeeper](https://support.apple.com/en-us/102445),
[Xcode-Shims](https://developer.apple.com/library/archive/technotes/tn2339/_index.html),
[Hardened Runtime vs App Sandbox](https://developer.apple.com/documentation/Xcode/preparing-your-app-for-distribution),
[Node22 unbehandelte Promise-Rejections](https://nodejs.org/download/release/v22.23.2/docs/api/cli.html#--unhandled-rejectionsmode).
Keine allgemeine Empfehlung, Vollzugriff zu erteilen oder Schutzfunktionen
auszuschalten. Ad-hoc-Sealing bleibt lokale Codeintegrität, keine Apple-
Developer-ID-/Notarisierungsfreigabe und keine Zusage für jeden verwalteten Mac.

Vor Dispatch nochmals am Quellcode gegengeprüft und korrigiert: nativer
Gateaufruf benötigt einen absoluten kanonischen App-Pfad. Der Standard-ARM-
Runner hat7GB RAM; die alte pauschale8GiB-Abweisung war damit unerfüllbar.
Node22.23.2 empfiehlt8GB für vier parallele Compiler und nennt Reduzierung
der Jobzahl als Gegenmaßnahme. Neuer im Producer selbst erzwungener Vertrag:
unter6GiB kein Build,6–unter8GiB nur ein Compiler, darüber1–4. ARM seriell,
Intel drei Jobs; tatsächlicher Speicher-/Buildnachweis weiterhin native Pflicht.
Keine größere Runnerklasse, kein Swap-/OS-Tuning, keine Schutzlockerung.
126 Producer-Quellenmodelle,52 Importgegenfälle,24 native Gate-Quellenmodelle,
Workflow-/Fingerprint-/Dokumentationsverträge grün. Das sind keine Mac-PASS.

Producer-Run-IDs, tatsächliche Architekturergebnisse, geprüfte Approvalhashes,
finaler gemeinsamer Gitcommit/Produktfingerprint, Windows-/Mac-Pakethashes,
native Gateergebnisse und Pre-Release-URL werden nach tatsächlichem Abschluss
ergänzt. Bis dahin ist RC164 Entwicklung, kein abgenommener Download.

Primärquellen für den Review: [Node22.23.2 BUILDING](https://github.com/nodejs/node/blob/v22.23.2/BUILDING.md),
[GitHub Runnerimages](https://github.com/actions/runner-images),
[Apple Library Validation](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation).
Ad-hoc-Sealing ist keine externe Apple-Signierung; Erstöffnungswarnungen und
Unternehmensrichtlinien bleiben ohne Developer-ID mögliche Zielhostgrenzen.
