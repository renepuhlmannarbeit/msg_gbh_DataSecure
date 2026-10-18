# RC164 – fortgesetzter Abschlussauftrag

## Neuester Checkpoint, 18.10.2026, 23:18 UTC

7b13d349ae85d37b08e13b8421d2be4de1fc5447 korrigiert die isolierte
Windows-Shortroot-Annahme eng begrenzt. Rust228/3ignoriert, Clippy, Release und
Paketgates bestanden mit unveränderten Inputs. Echter unverändert entpackter
DataSecure-Shortroot startet App/Core. Quellengegenreview und Negativfälle
bestätigen: keine Erweiterung der reservierten Profile oder falscher OS-Layouts.

Checkpoint03-Headless bleibt ROT:207/272 Dateien vor Startup-Replay-Test208,
inputs_unchanged=true. Der Test erhielt die geschlossene Fehlersummary statt
Erfolg, ohne ausreichende damalige Lifecycle-Diagnose. Ursache nicht bewiesen.
Neue Tests ersetzen Scheduling<50ms und 2s-Coldstartannahmen durch kausale
Deferral-/Shared-Memory-Wait-/Exit-Orakel; Konstruktor, Crash, Deadline und
ungültige Summarys werden getrennt geprüft. Gegenreview fand und korrigierte
auch eine verlorene Testweckung sowie /var-/private/var-Tempdrift. Unabhängiger
Watchdog/Cleanup, acht gezielte Fälle bestanden; erneuter Gesamtfreeze folgt.
Keine Produktionsdeadline gelockert, kein alter roter Nachweis überschrieben.

Echte GUI am7b13d349-Engineeringpaket bestätigt OCR-Kontaktprüfung, geführte
Dokumentfreigabe und einmaligen nativen Export von exakt zwei neutralen MD;
Hashgleichheit und Abwesenheit privater Begleitdateien geprüft. Schließen und
expliziter Rückweg zum Verlauf funktionieren; gezielter Statusabgleich bestätigt
2/2 heutige Stände in einem Abschlussbeleg, kein zweiter Export nötig.
Am vorherigen2e12c0f-Paket wurden zusätzlich308.372s Denkpause, verworfene
ungespeicherte Vormerkung und erhaltene gespeicherte OCR-Entscheidung über
zwei normale Neustarts bestätigt. Profile/Archive getrennt erhalten.
Das ist Vorabnachweis, keine Abnahme des finalen gemeinsamen Releasepakets.

GUI-Befund reine Markdown-OCR: Zwischenmeldung versprach fälschlich spätere
Anonymisierungsfreigabe. Zweckgebundene Copy nach bestätigtem Speichern
korrigiert, Vertragsprüfung vor clearDraft,52 tatsächliche Frontendfälle grün
und unabhängig gegengelesen. Keine Änderung der Entscheidung/Antwortaktionen.
Mac-Producer39167676290 weiterhin aktiv, keine Coreapproval oder Veröffentlichung.

Nutzerauftrag am 18.10.2026 abends (Europe/Berlin): gezielte Blockerbehebung,
mehrere Quellen-/Gegenreviews und echte Windows-Desktopabnahme, anschließend
Windows x64 und macOS ARM64/Intel als gemeinsamer Pre-Release. Windows-ZIP
zusätzlich lokal. Desktopfreigabe erneut ausdrücklich erteilt; allein der
Hauptagent bedient die Anwendung, mit ausschließlich synthetischen Testdaten.
Keine Nutzerdateien, bestehenden Evidenzen oder älteren Pakete überschreiben.
Der bestehende Thread-Heartbeat datasecure-lokales-backlog-fortsetzen wurde
auf ausdrücklichen Nachtauftrag erneut aktiviert (alle 30 Minuten; keine
Duplikatautomation). Keine Zertifikatssuche, Developer-ID,
Apple-Einreichung oder Storeverteilung. Kein Abschalten von Gatekeeper,
Core-Library-Validation oder Hardened Runtime, keine Umrechte bestehender Daten.

## Reihenfolge und Freigabekriterien

1. Bestätigte Quellenblocker zuerst beheben; bestehende grüne Tests widerlegen
   neue Befunde nicht. Gezielte echte Fehlergegenfälle und unabhängiges
   Produktionsgegenlesen nach jedem Fix. Höchstens drei begrenzte KI-Agenten
   gleichzeitig; keine Unteragenten oder Inter-Agent-Nachrichten.
2. Native Mac-Core-Quelle samt C/API-Verträgen vor der teuren Kompilierung
   einfrieren. Ein Producer mit falschem Guard ist kein geeigneter Nachweis.
   Tatsächliche ARM-/Intel-Compiler-, Seal- und Rollenproben anschließend lesen.
3. Erst vollständig geprüfte FINAL-CORE-Metadatenhashes freigeben. Core und
   offizieller Konverter bleiben verschiedene Artefaktrollen. Ad-hoc-Sealing
   benötigt kein Apple-Zertifikat, ist aber keine Notarisierung/Vertrauensgarantie.
4. Gemeinsamen endgültigen Gitcommit und Produktfingerprint für alle Targets
   einfrieren; Headless-, Rust-, Native-/Paketgates mit unveränderten Inputs.
5. Echte Windows-GUI aus dem gebundenen Releasepaket testen: Erststart,
   Ordner-/Dateidialoge, Markdown, geführte Anonymisierung, Schnellweg, OCR,
   Vertagen/Denkpause/Neustart, Freigabe, Export, Abschlussnavigation,
   Fünferverlauf/Ausblenden und neuer leerer Dateientwurf. Abweichungen beheben
   und betroffene Gates mit neuem Binding wiederholen, keine Erfolgserfindung.
6. Nur geeignete Downloadpakete veröffentlichen: Windows-ZIP, beide Mac-ZIPs
   und DMGs, Prüfsummen und unveränderte synthetische Testdaten. Remoteassets
   erneut lesen/hashprüfen, Pre-Release-Flag und Tagsource verifizieren.

## Prüfrollen (risikobasiert, keine feste Obergrenze an Runden)

| Rolle | Konkreter Quellenschwerpunkt | Erforderlicher Nachweis |
| --- | --- | --- |
| macOS-/Apple-Silicon | Finder/App/Core/Worker, JIT, Architektur, Ad-hoc-Rollen | tatsächliche native Start-/Rollenproben; M2/Finder später gesondert |
| Rust-/IPC-Systeme | Lebenszyklus, Termination, Fristen, Ready-/ACK-Übergänge | Sourcegegenreview und native Rust-/Transportgates |
| Windows-/WebView2 | Ressourcen, Prozesse, Picker, NTFS, Paketpfade | gebundener Windowsbuild und echte GUI |
| Dateirechte-/OS-API | ACL-Boolean/Bitmasken, Eigentümer, Volume, Pfadkanten | offizielle API/OS-Quelle plus native Gegenfälle |
| Architektur-/Wiederanlauf | voller Bootstrap, Recovery, gesperrte aktive/alte Ziele | kein halbfertiges Ready, keine erfundenen Schreibrechte |
| Paket-/Releaseengineering | Sourcepins, Bundlelayout, Metadaten, ZIP/DMG | tatsächliche Artefakte und gemeinsamer Quellcommit |
| Dokumente-/OCR | Extraction, Kontaktwerte, Normalisierung, Dateiformate | echte Corpusinhalte, Originale unverändert |
| Datenschutz-/Security | Schnellweg, Freigaben, Grenzen, Manipulation, Logs | Negativ-/Missbrauchsgegenfälle, kein pauschales All-clear |
| UX-/Barrierefreiheit | Namen, Fokus, Navigation, Status, optionale Aktionen | reale DOM-/Browserprüfung und native Accessibility-Beobachtung |
| Unabhängige Testarchitektur | Mocks, Orakel, Coverage, Quellen-/Paketbindung | Tests nicht mit Produktion verwechseln; offenes NOT_RUN ausweisen |

KI-Prüfrollen ersetzen keine zertifizierten Fachpersonen und sind keine
100-Prozent-Garantie. Quellenlesen, native CI-Ausführung, echte Desktopabnahme
und späterer M2-Test sind verschiedene Nachweise. Sicherheits-/Unternehmens-
Sperren dürfen nicht übergangen oder als reparierte App-Fehler bezeichnet werden.

## Aktuelle bestätigte Folgepunkte

- Retirierte verweigerte Ergebnisziele: negativer Reservationsvergleich statt
  erneutem lstat/realpath des alten Ziels; aktive Ziele weiterhin strikt.
- Rust-Mac-Exportparent: normales nichtvererbendes deny-delete darf keinen
  privaten Zugriff oder unsichere ACL legitimieren; native Gegenfälle erforderlich.
- Diagnoseprobe: kein unbeschränktes wait unter dem Produkt-Startguard;
  separater einmaliger Observer mit ehrlichem unbestätigtem Prozessende.
- **Korrigierter P1:** C-Guard erwartete filesec-ACL-present==1, Apple liefert bei
  vorhandener ACL einen positiven Bitmaskenwert (32). Beide Stellen und
  tatsächliche C-Sourcepins in 7d0ee31dc65ce31ce54f1b4a1a0cefa348ef7071 korrigiert.
  Run39165027153
  aus e6f4bb65… deshalb am 18.10.2026 gezielt abgebrochen, kein geeigneter Core.
  Neuer Producer39167676290 läuft für beide Architekturen; tatsächliche
  Kompilierung und ACL-NATIVE-PROBE.json noch abzuwarten. 129 Producerassertionen,
  1042 C-/API-Modellassertionen und Windows-Guard114 grün ersetzen ihn nicht.
- Aktuell gespeichertes verweigertes Ergebnisziel: unabhängig revalidierte
  Alias-Gegenfälle verbieten einen pauschalen Ready-/Ersatzordner-Fallback.
  Neue feste Klasse STANDALONE_RESULT_ROOT_ACCESS_DENIED nur für tatsächlichen
  EACCES/EPERM bei aktueller öffentlicher Kanonisierung, ohne Pfad-/Fehlertext.
  In diesem verweigerten Startzustand bleibt der In-App-Ordnerwechsel bewusst
  unzugänglich; aktueller Zugriff muss erst wieder verfügbar sein. Kein
  behaupteter Zertifikats-/TCC-/Core-Crash-Befund. Ein isolierter Settingsmodus
  wäre ein gesonderter Transaktions-/Epochumbau, nicht implementiert.
- **Korrigierter P2:** Ein Fortsetzungsworker konnte seine Verarbeitungslease
  vor dem sichtbaren Export beenden. configureResults sah dadurch fälschlich
  Leerlauf. Konkrete ChildProcess-Lebensdauer wird jetzt bis bestätigtem exit
  unabhängig verfolgt; keine Freigabe durch ACK, Disconnect, Fehler oder kill.
  Native Provisionierung liegt innerhalb der Service-Interaktionssperre nach
  Busyprüfung, mit erneuter Prüfung nach jedem asynchronen Übergang. Unabhängiges
  Quellengegenreview bestätigt den konkreten Same-Sidecar-Fix. Kein globaler
  Lebensdauernachweis für beliebige separate Desktopinstanzen/verwaiste Worker.
  Gezielte Executor91 und Service76 grün; kein GUI-Nachweis daraus.
- Schnellere Desktopprüfung: eindeutige, dynamisch korrekte zugängliche Namen,
  feste bestehende DOM-IDs, versionsgebundener Testleitfaden, create-only
  synthetische Ordner und getrennte Laufzeit-/Toolmessung. Keine blinden Klickfolgen.
  Create-only Kampagne: C:/Users/arkud/Documents/Software DataSecure/RC164-Desktop-Test-20261018-7b8d41ac.
  Zehn definierte Fälle, 14 hashgeprüfte Kopien; Kandidatenbinding und Desktopabnahme
  weiterhin NOT_RUN. Root85, Desktopvertrag37 und Workspace338 gezielt grün.
  Ein Folgegegenreview fand den Verlust der neuen Rootursache in der späteren
  Bootstrap-Refusalhülle: Der Adapter bewahrt jetzt nach seiner Diagnose nur bei
  tatsächlicher WeakSet-Klassifikation exakt den Originalfehler. Vier zusätzliche
  reale Root-FS-/Sourceadapter-Gegenfälle (EACCES/EPERM, zweite/spätere Prüfung)
  und erneuter unabhängiger Quellengegenreview bestätigen die Korrektur.
  Vollständiges reales Sidecar-/Worker-/OCR-/Restart-IPC-Gate ebenfalls grün;
  dessen Paketprojektion ist ausdrücklich keine native Windows-GUI-Abnahme.

## Zielhostgrenzen

Frisches tatsächliches M2-/Organisationsprofil, TCC-Zustimmung/Ablehnung,
Finderquarantäne/Erstöffnungswarnung und verwaltete Ausführungssperren müssen
später am echten Gerät geprüft werden. Kein generischer SIGTRAP beweist eine
Berechtigungsursache. Kein Quellenmodell wird als solche Abnahme ausgegeben.

## Nächtlicher Zwischencheck (18.10., 21:52 UTC)

Quellencommit55752593604ede2e7f9a65adbd3ccbfa3eea0705,
Produktfingerprintbe7bd169d0a7e777acc4f0c21022626c16d3d628870c934fe216dfa84f5de879
(332 Produktinputs), unverändert geprüft unter
dist/rc164-night-checkpoint-20261018-01. Windows-Native-Prepare, Clippy,
228 Rusttests (3 explizit ignoriert) und Releasebuild bestanden; kein GUI-/Mac-PASS.
Headless stoppte nach53/271 bei Diagnose-Testdatei54: deren enge VM-Importliste
kannte den neuen root-boundary-Import nicht und warf selbst beim Import.
Produktionsstart-/Sidecargate war separat erfolgreich. Testmodell ergänzt jetzt
den tatsächlichen Leafimport, statt die Produktionsprüfung zu entfernen;
11/11 Diagnosefälle sowie15/15 Testpfadtrennung erneut grün.
Neu vorbereitete Desktopkampagnenprüfung nun auch in kanonischer Headlessliste
(272 Dateien); einzeln ebenfalls bestanden. Roter alter Bericht bleibt erhalten.
Noch kein finaler Quellen-/Releasefreeze: Mac-Core-Approval fehlt weiterhin.

## Zweiter Zwischencheck und echte Windows-GUI (22:20–22:25 UTC)

Quellen2e12c0fdc67f7174d047dd9e26b069d49eb8973a, Produktfingerprint weiterhin
be7bd169d0a7e777acc4f0c21022626c16d3d628870c934fe216dfa84f5de879:
272/272 Headlessdateien plus10/10 Zusatzgates, Windows-Native-Prepare/Clippy/
228 Rusttests (3 ignoriert)/Release sowie Paket-Inventar/Guard/Schnellweg-
Inhaltsorakel/100-Datei-Markdowncorpus bestanden. Sämtliche Driver melden
inputs_unchanged=true. Evidenzen create-only in dist/rc164-night-checkpoint-20261018-02.
Noch kein gemeinsamer Finalfreeze und kein Mac-/M2-PASS; beide Producer laufen.

Echter nativer GUI-Vorversuch am exakt hashgebundenen Engineering-ZIP:
Archiv76374acfbf2a23e84862c3fd2bfe33841c1d5e686a8578972580accfaf20e5c7,
EXE4838440a882a2ae9e7d605bab7e35a36d27c4c709aa8778b8a122166dc0f8908.
Der isolierte Smoke-Start endet bei neuem Windows-Innenordner DataSecure mit65
vor Logs. Unabhängiges Quellengegenlesen bestätigt eine alte Präfixannahme in
native_smoke.rs; kein Beweis eines normalen Nutzerprofil-Startabbruchs. Der
separate native-review-campaign-Launcher hatte dieselbe alte Windowsannahme.
Minimaler Fix: exakt DataSecure zusätzlich nur unter Windows; Reservierungs-,
Elternpfad-, EXE-, Umgebungs- und Reparsebindung bleiben. Entsprechende Rust-/
JS-Gegenfälle für beide gültigen Roots und falsche Layouts ergänzen; neuer Build
und realer Shortroot-Start sind vor Abschluss erforderlich.

Um andere GUI-Orakel während des unveränderten Checkpoints zu prüfen, wurde nur
der eigene entpackte Temp-Fixtureordner nach vollständiger Typ-/Reparse-/Hash-
Prüfung in den historischen erlaubten Namen umbenannt. ZIP/Stage unverändert,
kein bestehendes Nutzerprofil verändert. Das ist ausdrücklich KEIN bestandener
Shortroot-Smoke. Dort tatsächlicher Erststart/Core/Picker erfolgreich:

- Fall01 Markdown: zwei vollständige MD, eine erwartete OCR-Auslassung, klare
  Abschlussanzeige; Originalhashes unverändert. Lauf2462742e…
- Fall04 Schnellweg+OCR: drei Ergebnisse,3/3 sichtbar automatisch/nicht manuell
  freigegeben. Tatsächliche Inhalte geprüft: Identifikatoren ersetzt, Fließtext
  und6×7-Tabelleninhalt erhalten. Laufc50e80ec…
- Ein ausdrücklicher nativer Exportf710c230…: exakt drei neutrale MD, Hashes
  gleich den aktuellen Ergebnisbytes, keine privaten Begleitdateien. Dialog
  bestätigt Abschluss; danach prominente Abschlusskarte und leere Exportauswahl,
  kein zweiter Export nötig. Verlaufnavigation ausdrücklich betätigt.
- Neuer Dateientwurf nach Verbrauch tatsächlich leer, persistente Optionen/Ziel
  bleiben erhalten. Fall05 hat echte OCR-Prüfung; eine Entscheidung seit
  22:24:04UTC nur vorgemerkt. Fünfminütige Denkpause/Vertagen/Neustart noch offen.

Dies sind gebundene Vorabnachweise, keine Abnahme des noch fehlenden finalen
gemeinsamen Windows-/Mac-Pakets. Detailbindung: GUI-PREAPPROVAL.json.
