# RC163-R7 – Start, Status und neues lokales Windows-Paket

Auftrag vom 18.10.2026: Startoptimierung abschließen, am Quellcode mit begrenzten
KI-Fachreviewaufträgen revalidieren, neues Windows-ZIP lokal zur manuellen
Anwenderprüfung bereitstellen. Keine Desktopbedienung, kein Push/Release/Runner.
R6-ZIP, bisherige Belege und Benutzerläufe unverändert lassen. M2 später.

## Umsetzungsplan und tatsächliche Grenze

1. Den separaten Start-Journalpass entfernen: originale Exportbindungen bleiben
   vor der Aufbewahrungsroutine gesichert. Die Zusammenfassung entsteht aus dem
   ohnehin voll validierten und unter Recoveryguard gehaltenen Zustand.
2. Vor **jeder** Journalentfernung durch Ablauf – Start-Recovery, periodische
   Wartung und direktes readState – Zusammenfassung schreiben und gegen erwartete
   Felder zurücklesen. Bei unbestätigter Sicherung bleiben Journal und Arbeitsbaum.
3. Prozesslokale negative Statushinweise für unveränderte, voll validierte
   terminale Journale: kein Mapping-/Workcopy-/Zero-Day-Rest, keine lebende
   Executor-/Intake-PID. Jede Verwendung liest frische gebundene Journalbytes
   und vergleicht SHA256 plus Datei-/Elternidentität. Maximal1024 Einträge;
   Publikation und Entfernung invalidieren vor dem Versuch, Neustart leert alles.
4. Nur unselektierte Standalone-UI-Statusläufe und die Liste fortsetzbarer
   Zustände nutzen die negative Aussage. Ausgewählte Läufe, Verarbeitung,
   Recovery, Retention, Dokumentprüfung und Export benutzen den Vollpfad.
   Ein Hinweis ist keine Berechtigung und bestätigt keine aktuellen Ergebnisbytes.
5. Windows-ZIP-Innenordner auf DataSecure verkürzen, versionierten ZIP-Namen,
   Manifest und SBOM behalten. Leser unterstützen außerdem ausschließlich den
   exakt passenden historischen Root; gemischte Roots ablehnen. macOS unverändert.
6. Produktionspfadmessung, Manipulations-/Ablaufgegenfälle, vollständige
   Headlessregression, Windows-Rustbuild und vier archivgebundene Paketgates.
   Erst danach eigener Quellenfreeze und neue lokale Übergabe unter RC163-R7.
7. Bereits vorhandene unveränderliche Prüfmetadaten frisch lesen und mit dem
   vollständigen Soll vergleichen, statt erneut temporäre Dateien zu schreiben
   und zu synchronisieren. Fehlender/fehlgeschlagener Read behält den exklusiven
   ursprünglichen Schreibpfad; Konflikte werden niemals überschrieben.
8. Pro synchronem Capture ein gebundener Lesekontext; am Ende ursprüngliche
   Manifestbytes, Dateiidentität und Verzeichnisbindungen erneut kontrollieren.
   Pro Kontrollgate die Verzeichnisbindung erst innerhalb des ersten geschützten
   lockPath-Zugriffs anlegen, danach frisch prüfen statt wiederholt rekursiv
   anzulegen. Keine Verzeichnisanlage vor nativer Admission, kein dauerhafter Cache.
9. Nur Standalone fordert den vollständigen Journal-Schutzsatz verzögert an,
   wenn tatsächlich abgelaufene private Markdown-Bereinigungskandidaten bestehen.
   Fehlende/identitätsgebunden leere/frische Ablagen brauchen keinen Scan.
   Unsichere, unlesbare oder ersetzte Ablagen bleiben Fehler/übersprungen.
   Vor jedem tatsächlichen Kandidaten bleibt vollständige Schutz-/Exportprüfung.
   Force ist keine nachgewiesene Schutzprüfung; falsche positive Diagnose korrigiert.

Die notwendige Aufbewahrungs-/Crash-Recovery beim Kaltstart bleibt vollständig.
Es wird **nicht** behauptet, dass der Start null alte Bytes liest. Die Optimierung
entfernt einen redundanten Startpass und wiederholte historische semantische/
Content-Ankerprüfungen beim Statuspolling. Journalbytes und Mitgliedschaft werden
weiter frisch geprüft. Keine persistierte Terminalitätsautorität, kein Watcher-
oder mtime-alleiniger Cache und keine Abschaltung einer Schutzgrenze.

## Unabhängige Quellenreviews

- Architektur/Recovery: der erste Gegenreview fand die Lücke bei späterer
  Journalentfernung nach übersprungener Start-Recovery. Strikter Erhaltungshook
  an allen drei Ablaufpfaden ergänzt; erneutes Quellenreview ohne neuen
  blockierenden Befund im begrenzten Umfang.
- Windows-Paketierung: kurzer interner Root spart35 Zeichen ohne Änderung der
  relativen Laufzeitverträge. Berechnete alte R6-Gegenprobe278→243 am bisherigen
  Ziel; der tatsächliche neue Übergabepfad wird separat geprüft.
- Unabhängige Produktionspfadmessung: eigene synthetische Profile, nicht die
  laufende Benutzer-App. Ergebnisse werden nach Quellenfreeze hier ergänzt.
- Zweiter Capture-/Retention-Gegenreview: unveränderliche Bytevergleiche und
  exklusive Fehler-Fallbacks geprüft. Beim zusätzlichen Controlgate-Gegenreview
  wurde vorgezogene Verzeichnisanlage vor nativer Admission beanstandet. Lazy
  Erstinitialisierung innerhalb lockPath korrigiert und erneut freigegeben.
  Tatsächlicher verweigerter Native-Child erstellt keinen Reviewordner.
- Native Startkette/Windows-Paketlayout: keine neue vorgezogene Ready-Freigabe;
  gemeinsame Bootfrist120s unverändert. Service-Recovery bleibt vor ready/1.
  Kein neues Quellenhindernis im begrenzten Review. Sehr große/veränderte
  Bestände können weiterhin bis zur festen Ablehnung länger dauern.

KI-Reviewrollen sind keine zertifizierten Fachpersonen und keine native
Windows-GUI-/Mac-Abnahme. Der Quellen- und Featurestand bleibt gemeinsam;
Darwin-/M2-/Finder-/APFS-Gates erfolgen später.

## API-/OS-Quellen

- [Node22: Filesystem-API](https://nodejs.org/download/release/v22.23.0/docs/api/fs.html):
  Dateioperationen anderer Prozesse können zwischen Pfadprüfung und Öffnung
  eingreifen; gehaltene Deskriptoren und erneute Identitätsprüfungen bleiben hier
  erhalten. Inhalte werden nicht allein aus Zeitstempeln als unverändert bewertet.
- [Microsoft: maximale Pfadlänge](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation):
  der Gesamtentpackpfad muss geprüft werden. Der Paketlayoutfix benötigt weder
  Registryänderung noch administrative Freigabe langer Pfade.

## Nachweise / Übergabe

Zwischenstand1540e28c… unter dist/rc163-r7-startup-20261018 bleibt erhalten,
ist **nicht** der fertige Kandidat. Dessen211 Rusttests/Release waren grün,
Produktionsstart mit320 synthetischen Altläufen aber96–97s. Paket-Corpus war
rot: erwartete obsolete implizite uiContext-Ergebnisauflösung. Der Test fordert
jetzt ausdrücklich resolve_history_results mit der wirklichen gestarteten
Laufkennung an und prüft weiterhin100 Originalhashes/Ergebnisse/relativen Baum.
Rote Fixture bleibt erhalten. Begonnene Vollsuite lief während Weiterentwicklung
und ist wegen geänderter Inputs kein gebundener Abschlussnachweis.

Nach Capture- und Lazy-Retention-Änderung:36,139s erster/38,126s zweiter Start
im separaten Quell-Produktionsmodell mit320 historischen, synthetischen Läufen.
Ein unabhängiges Phasenprofil bestätigt37,975s, davon37,563s Recovery; alle320
Zusammenfassungen erhalten und ein abgelaufenes Journal kontrolliert entfernt.
18,545s steckten noch in3204 rekursiven ensurePrivateDirectory-Aufrufen. Deshalb
anschließend die oben beschriebene gebundene Lazy-Controlgate-Optimierung.
Beleg: dist/rc163-r7-startup-profile-details-20261018/profile-320.json.
Das sind vier gestoppte Quellen pro Lauf ohne echte Exporte, warme OS-Caches,
Quell-/Legacyadapter und teils instrumentierte Funktionen, keine native GUI-
oder Anwenderdatenmessung und keine allgemeine Startzeitgarantie.

Neuer create-only Gesamtlauf: dist/rc163-r7-startup-final2-20261018.
Produktfingerprint4dda62d72583d72c8750f394cde85115b059cd2e70bde2549b0db93e0d145be7
(327 Produktinputs). Testergebnisse, endgültiges Startprofil, Quellen-/
Testmanifest, Paket- und Übergabehashes werden nach den unveränderten Läufen
ergänzt. Vorherige grüne R6-Belege sind kein Nachweis für diese Änderungen.

Finales unabhängiges instrumentiertes320er-Profil am4dda62d7-Stand:
39,109s Gesamtstart, davon38,708s Recovery. Quellen vor/nach identisch, alle320
Summaries erhalten, ein abgelaufenes Journal entfernt, null Recoveryfehler.
Gegenüber dem37,975s-Phasenprofil vor dem Controlgate-Diff sind die rekursiven
ensure-Aufrufe3204→2564 und deren FS-Aufrufe442718→355038 gesunken; eine weitere
Zeitverbesserung dieses letzten Diffs ist aus diesen Einzelmessungen **nicht**
belegt. Die große Reduktion gegenüber dem96s-Zwischenstand stammt bereits aus
Capture/Lazy-Retention. Kein beliebig schneller Start versprochen: vollständige
Crash-Recovery bleibt proportional zum tatsächlichen Bestand. Relevante native
Bootfrist120s unverändert, kein höherer Timeout als vermeintlicher Performancefix.
Finaler Messbeleg: dist/rc163-r7-startup-final2-20261018/profile-320.json.

## Gebundener Abschluss am 18.10.2026, 16:39 UTC

- HEADLESS-FINAL:265/265 Testdateien plus10/10 Zusatzgates bestanden, kein Fehler,
  unveränderte327 Produkt- und536 Test-/Scriptinputs. Testmanifest:
  3becc4ea1196568e6c932e6f084e32b6d87e9e5ff62574e7b2febc74ba702ed9.
- NATIVE-FINAL: Prepare, Clippy,211 Rusttests und Release erfolgreich;3 regulär
  ignorierte Helfer bleiben separat. Derselbe Quellen-/Testmanifeststand.
- PACKAGE-FINAL: Inventar, echter nativer Windows-Ownership-Loader,
  Schnellweg-Inhaltsoracle und100-Dateien-Corpus bestanden. Originalhashes,
  relative Bäume und tatsächliche Exportbytes erhalten. Frisches Profil ohne
  Ergebnisordner startet den Paket-Core erfolgreich. Inhalts-/Exportoracle nutzt
  Quell-/Legacyadapter; native Rustpublikations-/GUI-Abnahme ist damit nicht behauptet.
- ZIP SHA256:f4326166f7955a0ddbc4fa2617a2f3bb111d85052045cf156e2ab6f2015accb5.
  EXE SHA256:73b3af31b64d8d5b040fed5ece2143f06880159cd14ca98f9cf7b46d710dbb6a.
  Archiv unter dist/engineering-rc163-r7-startup-final2-20261018.
- Die acht-Läufe-Produktionsgegenprobe innerhalb dieses finalen Laufs misst
  1031,7241ms ersten/968,9313ms zweiten Start,15,4421ms für drei Statusabfragen,
  weiterhin21 frische Journalreads dabei, null semantische Manifest-/Summaryreads.
  Nur synthetisches Quellmodell, keine Garantie für echte veröffentlichte Bestände.
- Quellenoverlay auf dem festgehaltenen Gitbaseline-Commit plus exakte ungecommitete
  Produkt-/Test-/Builddateien unter source-snapshot; SOURCE-SNAPSHOT.json ist der
  tatsächliche Archiv-Hash-/Bytevergleichsbeleg. Kein eigenständiger Checkout.
- Lokales Übergabeziel C:/Users/arkud/Documents/Software DataSecure/RC163-R7.
  LOCAL-HANDOFF.json belegt die tatsächliche create-only Kopie, ihren SHA256 und
  den geprüften maximalen Explorer-Standardentpackpfad. Keine App wird gestartet.

Offen bleiben die manuelle Windows-Abnahme und reale Startmessung am Nutzerbestand,
native Darwin-/Core-/Worker-/APFS-/Finder-/ZIP-/DMG-/M2-Nachweise. Eine spätere
Mac-Artefaktapproval kann den Quellenfingerprint ändern und erfordert neues
Paketbinding beider OS-Varianten bei unverändert nachzuhaltendem Featurestand.
Kein Push, Release, Runner, Zertifikatssuche oder Schutz-/Berechtigungswechsel.
Timer bleibt PAUSED; vorherige Pakete, rote Belege und Anwenderdaten bleiben erhalten.
