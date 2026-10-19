# RC166: Nutzerbefunde, Umsetzung und Paketnachweise

Stand: 19.10.2026. RC165 bleibt unverändert veröffentlicht. RC166 ist neu
aus einem gemeinsamen Appcommit für Windows x64 und macOS ARM64/Intel veröffentlicht.
Die Desktoptests übernimmt der Nutzer; keine neue agentische GUI-Abnahme.

Abschluss: App-/Tagcommit `e04d32cff603597ce3d8c982e94154bb00f534fb`,
Fingerprint `741e69e3f76981431f96408a7b19338820b722f11533fc234151aff2f786a9a7`/333.
283/283+10/10 Headless, Windows253Rust/3ignoriert/Clippy/Release/Paket5,
beide Mac-Consumer39317346697 erfolgreich; Inputs unverändert. Quellen sowie
tatsächliche drei Plattformpakete unabhängig gegengeprüft. Alle20Releaseassets
im Draft und veröffentlicht frisch gehasht; Tag, Bestand und AssetIDs bestätigt.
Windows mit Testplan/Testdaten lokal `Software DataSecure/RC166-R2`.
[Gebundener Releasevertrag](../RELEASE.md), [offene Nutzerfälle](RC166_DIRECT_RESULTS_USER_TESTPLAN_20261019.md).
Die nachfolgenden Umsetzungs-/Zwischenstände sind historische Entwicklung;
keine Umschreibung alter Primärbelege oder erfundene Nutzer-/Mac-Zielhostabnahme.

## Neuer verbindlicher Zusatzauftrag: Ergebnisdateien statt zweitem Export

Der Nutzer hat die Vereinfachung ausdrücklich noch für RC166 beauftragt.
Der zusätzliche Dokumentauswahl-/Freigabe-/Exportdialog entfällt als normaler
Abschlussschritt. Notwendige OCR- und Fundstellenentscheidungen bleiben.
Nach dem technischen Abschluss öffnet die primäre Aktion den Ergebnisordner.
Optionale Nachbearbeitung speichert den Fachstand und stellt ihn ohne weitere
Auswahl oder Bestätigung vollständig bereit. Kein künstliches `approved=true`.

Die Quellenanalyse bestätigt: Die Erstbereitstellung existiert bereits; spätere
Korrekturen lagen bisher privat. Nur Buttons auszublenden wäre deshalb falsch.
Neue Laufpläne halten vertrauliche Zuordnungen getrennt von den fertigen MD.
Eine Korrektur erzeugt eine vollständige, neue unveränderliche Ergebnisgeneration;
der Ergebnisöffner folgt ausschließlich dem bestätigten aktuellen Stand. Alte
Ergebnisstände und Legacybelege bleiben erhalten. Kein Überschreiben fremder
Dateien, keine Wiederanlage manuell gelöschter Ergebnisse, kein Publish beim
Start-/Verlaufslesen. Fehlende oder veränderte Vorstände bleiben Konflikte.

Vertrag und Gegenorakel: [Direkte Ergebnisbereitstellung](RC166_DIRECT_RESULTS_20261019.md).
Die fertig geprüften Source02-Pakete aus `760783478214b3fa96e366bcbee0905d4c39f30f`
mit Fingerprint `97e779c4eaf0b211b54bf07467fceb97d9b5b7b0a2f416346fb0feef1011ac2c`
belegen ausschließlich den alten Ablauf. 280/280+10/10, Windows Native und fünf
Paketgates waren grün, Inputs unverändert. Lokaler Übergabeordner `RC166` bleibt
erhalten, wird aber nicht als vereinfachter Kandidat freigegeben. Neue Pakete,
Belege und lokaler Ordner werden neu benannt. Noch kein RC166-Pre-Release.

## Begrenzter Änderungsumfang

| Auftrag | Umsetzung | Erhaltene Grenze |
|---|---|---|
| UX-OCR-FOLDER-01 | OCR-Anzahl an Katalog und Ordnerzeile, inklusive Unterordnern und bei zugeklapptem Inhalt | Nur bekannte verfügbare `ocr_required`-Dateien; keine neue Analyse oder automatische OCR-Zustimmung |
| UX-HISTORY-DETAILS-01 | Markdown-Kopierstatus unter genau einer nativen Detailklappe; redundanter Statusbutton entfällt | Editor bleibt getrennt, kein Export oder Freigabebefehl beim Öffnen; nur ausgewählter Lauf |
| UX-HISTORY-COPY-STATUS-01 | Mit neuem Direktauftrag: Ergebnisstatus aktualisieren, auch nach Fehler und Wiederverbindung | Lesend; keine Nachbearbeitung oder Veröffentlichung durch Statuslesen |
| UX-ANON-CHOICE-01 | Exklusive native Radios Selbst entscheiden / Automatisch maskieren, OCR unabhängig | Bisherige Policy-DTOs; Standard bleibt Selbst entscheiden. Neuer Abschluss ohne zweiten Exportauftrag |
| UX-PROCESSING-FLICKER-01 | Unveränderte Verarbeitungsbuttons erhalten; Wartepoll ohne wiederholten DOM-Neuaufbau/disabled-Wechsel | Reale Zustands-/Fehlerwechsel, manuelle Abfrage, private Chunkladung und Befehle bleiben gesperrt; Poll-/Retryzeiten unverändert |
| TESTDATA-LARGE-01 | Separate 36-Dateien-Beilage mit exakt vorhandenen large-Verzeichnissen | Byte-/Hashgleichheit mit synthetischem 100-Dateien-Basispaket; keine Nutzerdateien oder alten Ergebnisse |
| CI-DOC-RC165-01 | Veraltete RC162-Bindung im aktiven formalen UAT-README korrigiert | Historische Belege nicht umgeschrieben; nächste main-CI getrennt nachlesen |

## Gezielte Quellen- und Modellnachweise vor dem Freeze

- Hauptagent: tatsächliche Produktdeltas, Parameterübergabe und Resetpfade gelesen.
- Workspace406/406 und Reviewfrontend67/67 grün, Node22.23.2 gepinnt.
- Headless Edge: echte HTML/JS/CSS, synthetisches IPC. Vier Policy/OCR-Kombinationen,
  Radioexklusivität, 320–1280px-Reflow, Ordnerklappen, Fokus, Fortschrittsupdates,
  passive Polls und echte manuelle Sperren geprüft. Kein nativer Windows-/Mac-Nachweis.
- Gegenproben: ältere Reviewquelle mit neuen Tests liefert sieben erwartete Fehler;
  drei isolierte Historymutanten erkennen Warte-, Busy-Lock- und Fokusregressionen.
- Large-Beilage unabhängig nachgelesen: 36 Eingaben/12958541 Eingabebytes,
  38 reguläre ZIP-Einträge, leere Ergebnis-/Belegordner, sämtliche Originalhashes passend.
  ZIP1476723Bytes, SHA256 `9caa104815113c26eb59c98c5a0016c80c2cb5668b44cb20d6e6481e8f3190bd`.
- Vollständige aktuelle Dokumentationskette grün. Zwei unabhängige abschließende
  KI-Quellengegenreviews der tatsächlichen jeweils fremd geschriebenen Produktdeltas
  ohne bestätigten technischen Deltablocker. Ein redaktioneller Hinweis zur
  Begriffsvermischung in den neuen Modushilfen wurde übernommen. Keine Änderung
  der Backend-/OS-/Guard-/Policy-Verträge; KI-Reviews ersetzen keine Nutzerabnahme.

Die Gruppierung verwendet native `fieldset`/`legend`/Radiobuttons entsprechend
der [W3C-Formulargruppierung](https://www.w3.org/WAI/tutorials/forms/grouping/) und
der [HTML-Radiobutton-Semantik](https://html.spec.whatwg.org/multipage/input.html#radio-button-state-(type=radio)).
Die Detailklappe bleibt nativ tastaturbedienbar; die
[WAI-Disclosure-Regeln](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) dienen
als Gegenprüfung, nicht als Anlass für einen nachgebauten ARIA-Widget.

## Noch erforderliche Paketgates

Erster eingefrorener Versuch8ca7b2ce: Windows Native und fünf Paketgates grün,
Gesamt-Endlauf ROT bei Datei71 nach70 bestandenen Dateien; Eingaben unverändert.
Der letzte Volume-Propagationstest hatte eine ungeeignete /2-Fixture:
gespeicherte Number-Inode10133099162735664, tatsächliche BigInt-Inode
10133099162735665. Die JS-/Rust-Prüfungen verweigern diese bereits gerundete
Identität korrekt vor dem nativen Callback. Unabhängig an Primärfixture und
Produktionsquellen bestätigt; kein als transient erklärter FAIL. Ausschließlich
die Testvorbedingung für native Fehlerweitergabe nutzt nun die bestehende /3-
Fixture und prüft den tatsächlichen Root/admission-Callback. Die getrennte
Unsafe-Number-Negative mit Callbackzahl0 bleibt. Keine Produkt-/Schutzänderung.
Alte rote FINALs und Zwischenpakete bleiben erhalten und werden nicht freigegeben.
Korrigierter Test10/10grün; drei unabhängige In-Memory-Produktmutanten für
umbenannten/verschluckten Volumefehler und doppelten Callback jeweils gezielt rot.

Nach dem gemeinsamen Commit: neuer unveränderter Headless-Endlauf samt
Zusatzgates, Windows-Prepare/Clippy/Rust/Release und fünf Paketgates. Beide
Mac-Consumer auf exakt demselben Appcommit mit vorhandenen genehmigten
statischen Coreartefakten; deren Producercommit bleibt separat gebunden.
Jeder fehlgeschlagene Lauf bleibt als solcher erhalten. Erst geeignete neue
Pakete werden lokal bzw. als neuer Test-Pre-Release übergeben.

Keine Developer-ID, Notarisierung oder Apple-Einreichung; ad-hoc-Sealing ist
keine Apple-Zertifizierung. Gatekeeper, Hardened Runtime und eigene
Core-Library-Validation bleiben erhalten. Echte Finder-/M2-/TCC-/Enterprise-
und Screenreader-Abnahme bleibt separat beim Nutzer/Kollegen.
