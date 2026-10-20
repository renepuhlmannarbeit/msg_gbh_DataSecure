# RC169 – TXT-gleiche Pseudonym-Zuordnung als erstes Excelblatt

Status: implementiert und als gemeinsamer Windows-/Mac-Test-Pre-Release RC169
veröffentlicht. Neue Source02-Endgates bestanden; menschliche Desktop-/Office-
Abnahme offen. [Exakter Abschluss](RC169_SHARED_RELEASE_20261020.md).
RC168 bleibt unverändert veröffentlicht; alle alten Ergebnisstände bleiben erhalten.

## Ergänzter Nutzervertrag – fertige öffentliche Arbeitskopien

Realer RC168-Befund14c09da8 am20.10.: Main las ausschließlich den privaten
Initialbeleg und den exakt zugehörigen öffentlichen Laufordner. Alle sieben
Ergebnisdateien hatten unveränderte SHA256, der Ordner dieselbe Identität,
keine zusätzlichen Dateien. Nur die ctime-Werte der öffentlichen TXT-/XLSX-
Zuordnung wichen ab. Keine Datei verändert, repariert oder Anwendung bedient.
Damit ist der strenge Blattidentitätsvergleich als konkrete Verweigerung belegt;
die genaue auslösende Office-/Editor-/OS-Aktion wird nicht behauptet.

Nutzer verlangt ausdrücklich: fertige Dateien müssen auch manuell bearbeitbar
sein, ohne dass Produkt oder Verlauf abbrechen. Nach dauerhaft bestätigt
abgeschlossener Bereitstellung sind öffentliche Dateien Arbeitskopien. Normales
Ordneröffnen prüft weiterhin private Plan-/Abschlussbelege sowie den original
gebundenen Zielordner und seine Vorfahren, aber keine öffentlichen Blatt-Hashes,
Dateiidentitäten oder Fremddateiinventare. Externe Änderungen werden nicht in
private Prüfstände übernommen, nicht als weiterhin intern geprüfter Inhalt
bezeichnet und nicht ungefragt überschrieben. Fehlende/ersetzte/unzugängliche
Ordner: neutral nicht verfügbar, keine Neuerstellung oder Ersatzadoption.

Private Plan-/Spool-/Hash-/Guardnachweise, Pending-Publish, erstmalige Beleg-
erstellung und ACK bleiben strikt. Eine neue bewusste App-Korrektur erzeugt
ausschließlich einen neuen Ordner aus dem privaten Basisstand; der abgeschlossene
Vorgänger ist keine erneut zu hashende Eingabedatei. Strenge native Export-/
Schreibrouten bleiben getrennt vom read-only Results-Ordneröffner. Neue positive
Gegenfälle für öffentliche Metadaten-/Inhaltsänderung/Ersetzung/Extras/Locks/
Dateilöschung und negative für private Belege/Pending/Ordnerersatz erforderlich.

## Bestätigter Nutzervertrag

Das erste Blatt **Zuordnungen** beantwortet unmittelbar, welches Pseudonym
welchem Originalwert entspricht und wie oft die Zuordnung vorkommt:
Pseudonym, Typ (wie TXT), Originalwert(e), numerische Vorkommen, Datei.
Die Dateispalte erhält den Geltungsbereich: gleiche Marker in anderen Dateien
sind kein Identitätsbeweis. Eine Zeile entspricht einem validierten TXT-Eintrag.
Mehrere Originalvarianten gehören zu diesem einen Eintrag; dessen Vorkommenszahl
darf weder je Variante wiederholt addiert noch neu geschätzt werden.
Ausgeschlossene kept/masked/not_identity/ambiguous-Werte stehen als Hinweise
getrennt, nicht als erfundene Zuordnungen. Technische Übersicht und vorhandene
Dokumentdetails bleiben dahinter. Nutzerbeispiel: sechs Personen, sechs
Unternehmen, je1Vorkommen und18not_identity; diese18sind keine Identitäten.

Beide Ausgabeformate nutzen dieselbe validierte strukturierte Overview.
Kein Parsen des Menschen-TXT, keine Änderung der TXT-/Identitätserkennung oder
neue globale Aggregation. Häufigkeiten als numerische, nicht als Textzellen;
alle Identitäts-/Originalwerte bleiben literaler Text ohne Formeln/Makros/
externe Beziehungen. Vorhandene Unicode-/Xstring-/Langwert-/ZIP-/Budgetgrenzen
und native Rollen-/Hash-/Objekt-/Revisions-/Guardprüfungen bleiben aktiv.

## Kompatibilität und Auslieferung

Alte /1-/2-/3-Ergebnisse, gespeicherte Workbookbytes, no-op und wiederaufgenommene
Aufträge bleiben unverändert; kein Neuaufbau beim Lesen und keine Umdeutung
alter Hashbelege. Neue Läufe oder bewusst gespeicherte neue unterstützte
Korrekturstände erhalten die neue Darstellung. Weiterhin genau drei vertrauliche
Begleitdateien, keine zusätzliche Auswahl/Freigabe/Exportpflicht.

Plan: enger Workbook-/Testfix; unabhängige tatsächliche Quellen- und Datenreview;
gezielte TXT-vs-XLSX-/Varianten-/Mehrdatei-/Exclusion-/Numeric-/Longvalue-/Budget-
Gegenfälle und isolierte Workbook-Import/Anzeigeprobe; neue gemeinsame RC169-
Quellbindung, vollständige unveränderte Headless-/Windows-Native-/Paketgates
und beide Mac-Consumer, tatsächliche Artefaktreviews; lokales Windows-ZIP,
Testpläne und GitHub-Test-Pre-Release mit erneut geprüften Remotehashes.

Keine Desktopsteuerung: menschliche Windows-/Excel-/Numbers- sowie reale Mac-/
M2-/Finder-/TCC-/Gatekeeper-/Enterprise-/VoiceOver-Abnahme bleiben beim Nutzer.
Keine Developer-ID/Notarisierung/Apple-Einreichung/OS-Schutzabschaltung; bestehende
eigene statische Mac-Cores und offizielle Konverter bleiben getrennte gepinnte
Rollen. Kein neuer Coreproducer erforderlich. Vorhandene18.10./19.10./RC168-
Primärbelege und historische ungeklärte Ursachen nicht rückwirkend umschreiben.

Vertraulich enthält Originalangaben: nicht weitergeben/hochladen. Fertige öffentliche
Dateien dürfen auch in Office oder Texteditoren bearbeitet werden. Die private
Prüfbasis übernimmt diese externen Änderungen nicht; eine spätere App-Korrektur
erzeugt einen neuen Ordner aus dem internen Stand. Zuordnungen beschreiben den
von der App bereitgestellten Stand, nicht nachträgliche externe Änderungen.
Bearbeitungskopien bleiben vertraulich. Keine vermuteten Lockdateien blind löschen
oder gespeicherte private Korrekturen blind wiederholen.

## Vorabnachweise und Review – noch kein gemeinsamer Paket-Freeze

Main: 47 Workbook-, 15 unveränderte TXT-, 423 Workspace- und 38 Desktop-
Transportvertragsfälle sowie 30 aktuelle Dokumentationsfälle bestanden. Der neue
Verfügbarkeitscode ist im geschlossenen echten Desktop-Transportkatalog enthalten;
ein gleicher Code aus einer anderen Aktion wird nicht pauschal zum Hinweis.
Unabhängiger tatsächlicher Workbook-Quellenreview ohne zusätzlichen Deltablocker.

Isolierter Import-/Rendergegenfall am20.10.15:41:28UTC: erstes Blatt mit den zwölf
synthetischen Personen-/Unternehmenszeilen des Nutzerbeispiels plus einem zweiten
Dokument. 13 Zuordnungszeilen, Summe16Vorkommen, Varianten genau einmal gezählt,
gleicher Marker nicht über Dateien verbunden, tatsächliche numerische Zellen,
keine Formeln, Produktbytes durch Import unverändert. Beide ersten Blätter visuell
gelesen; dies ist keine native Excel-/Numbers-Abnahme. Beleg:
`dist/rc169-workbook-qa-20261020/IMPORT-RENDER-PROOF.json`, XLSX-SHA256
`173fe5781c882657e91c4623ad7f82e7c5dba62180a589bd15111bd68baf1415`.

Native Autorprüfung: 87 gezielte Rustfälle bestanden,3ignoriert; Clippy ohne
Warnungen. Main zusätzlich tatsächliche Node/Rust-Pipe über beide Verarbeitungs-
modi: neuer Store öffnet manuell veränderte fertige Arbeitskopien, no-op erzeugt
keine neue Kopie, neue private Korrektur erzeugt einen anderen Ordner ohne externe
Änderungen oder Office-Extras zu importieren/überschreiben. Strikte mutierende
Reconcile-/ACK-/Rollen-/Batchgrenzen separat erhalten. Erster neue Testversuch
scheiterte am alten Windows-Extra-Verweigerungsorakel; Gegenfall in read-only-
Öffnung versus strenge mutierende Route getrennt. Neuer tatsächlicher Lauf grün,
synthetischer Belegroot `datasecure-native-store-U0jf7Y` erhalten. Kein GUI-PASS.

Unabhängige Reviews fanden vor Freeze zusätzlich eine zu breite Reservierung
des Pfadteils Vertraulich bei companionfreien Markdown-/Altformaten sowie zwei
Dokumentrenderer-Anschlusslücken am neuen unavailable-Zustand. Engste Fixes
umgesetzt und unabhängig am tatsächlichen finalen Code gegengelesen, ohne
bestätigten Restblocker. Main:86Generationen-,20Companion- und200Rendererfälle
bestanden. Beide Modi bleiben privat lesbar, aber ohne Mutations-/Publikations-
autorität aus einem fehlenden Ergebnisordner. Neues Quellreview auch für Rust,
Transportkatalog und den echten Node/Rust-Gegenfall abgeschlossen. Kein Paket-PASS.
15 Helfer syntaktisch geprüft;381 statische und31 geschlossene Proof-Negative
bestanden, Helfer nicht mit Produkt-/UAT-Abnahme verwechseln. Der neue
Windows-Native-Endlauf verlangt die tatsächliche Node/Rust-Integration zusätzlich
zu Prepare/Clippy/Rust/Release. Alte RC168-Belege werden nicht umgedeutet.

## Source01-Endgates und eng begrenzte CI-Budgetkorrektur

Appcommit e2b9e6653cad4819eb993fadc024862ff6f104a6, Produktfingerprint
cf4d42446bf0694c65f2090a1ce9eb31ac267978eb114675bd867f9f51b744fe/336:
285/285+11/11 Headless, Windows Prepare/Clippy/280Rust(3ignoriert)/echte
Node-Rust-Ergebnisintegration/Release und alle fünf Paketgates bestanden.
Alle Inputs unverändert; Korpus100/100. Nach den drei lokalen FINALs ein neuer
Source-Snapshot erstellt. Diese Belege bleiben an Source01 gebunden.

Macconsumer39453343747: ARM118733731084 erfolgreich mit89Generationen/
20Companion/47Workbook/15TXT/271Rust(3ignoriert), echter Node/Rust-Pipe und
Core/App/ZIP/DMG-Gates. Intel118733731198 nach45Minuten durch den GitHub-
Jobwächter abgebrochen. Primärannotation lautet exakt: „The job has exceeded
the maximum execution time of 45m0s“. Der Log zeigt bis dahin erfolgreich
fortschreitende ZIP-/App-/Konverter-/Paketprüfungen, nicht einen belegten
Produkt-/Coreabsturz. DMG/Upload/Abschluss übersprungen; kein geeigneter
gemeinsamer Release. Primärbelege unter
dist/rc169-source01-intel-cancellation-20261020 bleiben unverändert erhalten.

Engster Folgeschritt: ausschließlich den umschließenden nativen Consumer-
CI-Zeitrahmen45→75Minuten erhöhen, passenden geschlossenen Workflowvertrag
mitprüfen. Keine Produktions-/IPC-/Testdeadline, Assertion, Schutzprüfung oder
Producer330Minuten ändern. Neuer gemeinsamer Source02-Commit/Fingerprint,
neue Windows-/beideMac-Endläufe und neue Pakete; keine alten ZIPs umetikettieren.

Zwei unabhängige tatsächliche Gegenreviews bestätigen Timeoutursache und enges
CI-only-Delta;75Minuten sind begründete Reserve, keine Laufzeitgarantie.
Main: Workflowvertrag, unveränderter Coreproducervertrag und30aktuelle
Dokumentationsfälle bestanden. Neue Source02-Helfer:31Proof-Negative,
381statische Bindungschecks/76aktuelle Pflichtbelegzeilen und15Syntaxchecks
bestanden; keine alten FINALs/Checkpoints/Artefakte kopiert. Gegenreview der
neuen Helfer ohne bestätigten Blocker. Desktop weiterhin USER_PENDING.

## Abschluss Source02

App-/Tagcommit8f21b55a41fb63ab62f92d198ec8f108ab8164ad, FP77937b239fd35cbc80b7c2037d5d597be007625997815b44e35876fc1d4bd11c/336.
285/285+11/11, Windows280Rust(3ignoriert)/Node-Rust/Clippy/Release/Paket5/
Korpus100 bestanden mit unveränderten Inputs. Beide Macjobs39461104366 grün,
je271Rust/3ignoriert/89Generationen/20Companion/47Workbook/15TXT sowie native
Core/App/ZIP/DMG-Gates. Tatsächliche Windows-/ARM-/Intel-Artefakt- und20Asset-
Übergabegegenreviews ohne verbleibenden bestätigten Blocker. Redaktionelle
Modusqualifikation nur im erzeugten Beschreibungstext vor Veröffentlichung.
Release418691555 veröffentlicht; alle20Assets vor/nach Publikation frisch
heruntergeladen/gehasht, gleicheIDs/Tagquelle. Windows lokalRC169 mit Testplan,
18Dateien und drei unveränderten synthetischen Testdaten-ZIPs. Keine Desktop-
automation, neue Automation, Main-Integration oder Apple-Zertifizierung.
