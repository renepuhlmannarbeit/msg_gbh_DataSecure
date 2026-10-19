# Vertrauliche Zuordnungen im Ergebnisstand

Status: als RC167 für Windows und beide Macs technisch geprüft, gebaut und
veröffentlicht. [Gemeinsamer Abschluss und exakte Nachweisgrenzen](RC167_SHARED_RELEASE_20261020.md).
Alte RC166-Pakete und Nutzerordner unverändert; Desktoptests übernimmt der Nutzer.

## Bestätigter Nutzerbefund

RC166-Lauf `d7047e010f990a9ad0327f3ac098de036612f847010f0e3636c01f9b4267dd79`
enthält vier fertige Markdown-Dateien. Dateizuordnung und Identitätszuordnung
liegen ausschließlich intern. Read-only geprüft: CSV290Bytes,
SHA256 `8904638d0d4dbe136534d22cb3a8de8d4196888b34aa562472020ffdd1d111c9`;
TXT1776Bytes, SHA256
`41e90c40cea1a0eb58c2f72ca72032245d85123f31b9d9262977d0453dfb7326`,
ausgewiesene Abdeckung4/4, unklare Zuordnungen0. Keine Nutzerdaten kopiert,
verändert oder gelöscht; laufende Nutzer-App nicht bedient.

## Neuer Sollvertrag für Windows/macOS

- Ergebnisordner öffnen reicht; keine zusätzliche Export-/Freigabepflicht.
- Neue Anonymisierungsstände enthalten obligatorisch
  `Vertraulich/Dateizuordnung.csv` und
  `Vertraulich/Personen-Pseudonym-Zuordnung.txt`.
- CSV bildet ursprüngliche Pfade auf die tatsächlichen Ergebnisnamen des
  jeweiligen Standes ab; UTF-8-BOM, Semikolon und bestehender Formelschutz.
- TXT beruht auf der vorhandenen semantischen Identitäts-/Transformationsspur,
  bindet Dokumentrevisionen und Inhalts-Hashes; keine erfundenen Umkehrungen
  generischer Masken oder unklarer Identitäten.
- Nachbearbeitung veröffentlicht einen vollständigen neuen Stand mitsamt
  beiden passenden Zuordnungen. Frühere Ergebnisstände bleiben unverändert.
- Nur ausgewählte Markdown-Dateien weitergeben, niemals ungeprüft den gesamten
  Ergebnisordner: Vertraulich enthält Originalnamen und Reidentifikationsdaten.

## Technischer Vertrag

Initiallayout `datasecure-visible-markdown/2` und privater Initialbeleg `/2`;
vertrauliche Rollen getrennt vom Markdown-Dokumentzähler. Vor erster öffentlicher
Kopie unveränderlicher privater Begleitplan mit vollständiger Revision-/Hash-/
Dateinamensbindung. Beide Blätter müssen kontrolliert exklusiv geschrieben und
an ihre ursprünglichen Objekte sowie den ursprünglichen Unterordner gebunden
sein, bevor der Ergebnisstand fertig gemeldet wird. Reservierter Ordnername
Vertraulich wird von gleichnamigen Quellordnern deterministisch getrennt.

Native Korrekturpublikation: optionales geschlossenes `confidential` nur in
Results-Rolle und Anonymisierungsmodus, genau zwei feste Blätter. Kein
Rendererpfad oder beliebiges Nicht-Markdown-Leaf. Vorhandene200MD/500MiB-
Gesamtgrenze,64KiB-Chunks,128KiB-Journale und NativeGuard bleiben erhalten;
CSV höchstens4MiB, TXT höchstens16MiB. Vor der ersten Begleitdatei wird die
Identität des kontrollierten Unterordners dauerhaft belegt. Lesen/Inspect/
Reconcile dürfen keine fehlenden Ordner oder Dateien erzeugen oder adoptieren.

Alte `/1`-Ergebnisordner werden nicht stillschweigend umgeschrieben. Auch der
gemeldete bestehende Nutzerordner ist noch unverändert. Eine explizite spätere
Nachbearbeitung kann einen neuen vollständigen Stand mit Begleitdateien erzeugen.
Kein ungeprüftes manuelles Kopieren in den alten strikt gebundenen Ordner.
Markdown-Konvertierung und historische zusätzliche Exporte behalten ihren
bisherigen Vertrag. Eigene statische Mac-Cores und OS-Schutzfunktionen unverändert.

## Erforderliche Nachweise

1. Echter Initialwriter: beide Dateien, korrekte Namen/Identitäten, reservierter
   Quellordner, Wiederanlauf und fehlende/ersetzte/zusätzliche Blätter.
2. Reale Dokumentnachbearbeitung mit vollständigem Vektor; unveränderte alte
   Generationen, aktuelle Zuordnung, Lost-Receipt-/Restart-/Read-only-Gegenfälle.
3. Native Rusttests und reale Node→Rust-Pipe für beide Pflichtdateien,
   unvollständiges Prepare, geschlossene Serde-/Rollen-/Modusgrenzen,
   gleicher Inhalt bei anderem Datei-/Unterordnerobjekt.
4. Unabhängiges tatsächliches Quellgegenlesen, Frontend-/Historienregression;
   danach Gesamt-/Paketgates vor einer neuen Übergabe. Native Mac-Ausführung
   und menschliche Desktoptests nicht aus Windows-Quellmodellen ableiten.

Zum damaligen Zwischenstand blieb eine neue Veröffentlichung offen; RC166-
Pakete/Tag/Releasebelege bleiben weiterhin unverändert. Der tatsächliche spätere
RC167-Abschluss ist oben verlinkt. Desktoptests übernimmt der Nutzer.

## Ausgeführte gezielte Endprüfungen

Quellenfingerprint `a03a840d2813a8472c1b277079f31412ef02f9eafc1af2ea134ef58d01908ad4`,
334 Produktdateien; gepinntes Windows-Node22.23.2. Kein vollständiger neuer
Release-Freeze, kein Gesamt-/Paket-/Mac-Runner-PASS aus diesen Teilgates.

- Companion-Plan/CSV/TXT/Generation:16/16.
- Echter Initialwriter und Korrekturgenerationen:65/65, einschließlich alter
  `/1`-Kompatibilität, reservierter Quellordner, gelöschter/geänderter/
  gleichbyteig ersetzter Begleitdateien und Ordner, zusätzlicher Dateien.
- Async-Exporter:65Assertions,325Kernelmodell-Eintritte,44virtuelle Wartezyklen;
  beide neuen Kontrollstellen mit pre-entry Busy, logischem Busy, post-action
  Busy und Close-Ungewissheit. Keine generische Wiederholung oder Promise unter
  Kernelguard. Dies ist ein Quellen-/Kontrollmodell, kein nativer OS-Racebeleg.
- Windows Rust:265bestanden,3bewusst ignoriert; Clippy all-targets/-Dwarnings
  bestanden.12neue vertrauliche Fälle darin, zusätzlicher Unix-Symlinkfall auf
  Windows nicht ausgeführt.
- Voller echter Node→Rust-Pipe-Test bestanden. Zusätzlich zur nativen
  Zwei-Body-Publikation führt er jetzt beide Betriebsarten durch den realen
  Initialwriter, Produktions-Dokumentstore, Nachbearbeitung, nativen Writer,
  LostReceipt, neuen Store und Read-only-Opener. Anonymisierung erzeugt in der
  echten nativen Generation CSV+TXT mit Originalnamen und aktuellen Ergebnisnamen.
  Vollständige Pipe-Evidenz synthetisch erhalten unter
  `Temp/datasecure-native-store-aeNba6/NATIVE-ADMISSION-DIAGNOSTIC.json`.
- Workspace419/419, separates Frontend46/46, Initialanker15/15,
  Snapshot-Negativen34/34, Exportdiagnosen24/24, vertrauliche Übersicht15/15,
  Entitäten8/8, Native-Channel9/9, Paket-Quellverträge15/15,
  Testpfadtrennung17/17 sowie Historie/Identityledger bestanden.
- Mac-Workflow-Quellvertrag samt18Cleanup-Quellenmodellen und docs:fast bestanden;
  kein neuer nativer macOS-/Finder-/M2-/TCC-/GUI-Nachweis.

Unabhängige tatsächliche Quellgegenreviews für Erstwriter, Rust und
Companion-/Storepfad abgeschlossen; enger Async-Nachfix separat gegengelesen.
Native Nullgrößen waren zuerst fälschlich zulässig und werden jetzt wie im
JS-Vertrag verweigert. Der erste neue Rust-Gesamtlauf hatte259PASS/6FAIL/3ignoriert:
Die neu verlangte Stagekontrolle scheiterte an bloß geerbter, nicht geschützter
Windows-DACL. Kausal behoben durch expliziten Descriptor nur bei exklusiver
erstmaliger Erzeugung neuer vertraulicher Stages; keine Rechteänderung an
Bestandsordnern und keine Lockerung des Verifiers. Microsoft unterscheidet
[ACE-Vererbung](https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-inheritance)
und [SE_DACL_PROTECTED](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-control).
Danach12/12enge native Fälle und zwei vollständige265erRustläufe grün.

Ein zusätzlicher reproduzierter Quellgegenfall zeigte vor dem Async-Nachfix
`exported:0,pending:1,available:false` allein durch rohe pre-entry Konkurrenz
an der neuen Vorbereitung. Dieselbe Kontrolle besteht danach mit je einer
Aktionsausführung. Alte rote Läufe werden nicht rückwirkend grün erklärt.

Testharnesskorrekturen: Historische `/1`-Fixture anfangs mit unzulässigem
`standalone_document_review:false` (64/65); nun explizites synthetisches altes
Belegschema mit unveränderten MD-Objekten. Alter Async-Layoutassert `/1` durch
`/2` plus beide tatsächlichen Dateien ersetzt. RAM-Diagnosefixture lädt das
neue reine Companionmodul statt eines leeren unbekannten Dependency-Stubs.
Nativer Spooltest zählte zuerst alle zusätzlichen älteren Testoperationen gegen
eine konstante40erGrenze; jetzt unverändert kein gemeinsamer Bodyspool und
exakt vier neue Parent-/Stage-/Journaleinträge für den neuen großen Auftrag.
Keine Produktprüfung wurde für diese Testanpassungen abgeschwächt.

Unabhängiger Testorakel-Gegenreview verschärfte zwei weitere Nachweise: Ein
gleichbyteiger Austausch hält das Original außerhalb des gesamten geprüften
Ergebnisbaums; vollständiges Inventar und alle Datei-Bytes bleiben vor der
erwarteten Ablehnung identisch. Die reale native Anonymisierung verlangt zudem
exakte, unabhängig aus bekannten synthetischen Literalen abgeleitete MD-Bytes
nach erster und zweiter Maskierung, nicht bloß korrekte Zuordnungsdateien.
Danach erneut65/65Generationenfälle und vollständiger echter Node→Rust-Test
bestanden. Kein Tauri-Desktop- oder nativer Mac-Nachweis daraus.

Damals offen vor einer neuen Paketübergabe waren gemeinsamer Versions-/Commitfreeze,
vollständige unveränderte Regression und Windows-/beideMac-Build-/Paketgates.
Diese späteren Nachweise wurden für RC167 Source04 neu ausgeführt und oben verlinkt;
die damaligen gezielten Belege werden dadurch nicht rückwirkend umetikettiert.
Die installierte RC166 enthält den Fix noch nicht. Der bestehende Nutzerlauf
und sämtliche alten veröffentlichten Pakete bleiben unverändert.
