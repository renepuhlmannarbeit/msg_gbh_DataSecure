# RC166: Nutzerbefunde, Umsetzung und Paketnachweise

Stand: 19.10.2026. RC165 bleibt unverändert veröffentlicht. RC166 wird neu
aus einem gemeinsamen Appcommit für Windows x64 und macOS ARM64/Intel gebaut.
Die Desktoptests übernimmt der Nutzer; keine neue agentische GUI-Abnahme.

## Begrenzter Änderungsumfang

| Auftrag | Umsetzung | Erhaltene Grenze |
|---|---|---|
| UX-OCR-FOLDER-01 | OCR-Anzahl an Katalog und Ordnerzeile, inklusive Unterordnern und bei zugeklapptem Inhalt | Nur bekannte verfügbare `ocr_required`-Dateien; keine neue Analyse oder automatische OCR-Zustimmung |
| UX-HISTORY-DETAILS-01 | Markdown-Kopierstatus unter genau einer nativen Detailklappe; redundanter Statusbutton entfällt | Editor bleibt getrennt, kein Export oder Freigabebefehl beim Öffnen; nur ausgewählter Lauf |
| UX-HISTORY-COPY-STATUS-01 | Markdown: Kopierstatus aktualisieren, auch nach Fehler und Wiederverbindung | Anonymisierungsstatus nicht in Kopierstatus umgedeutet |
| UX-ANON-CHOICE-01 | Exklusive native Radios Selbst entscheiden / Automatisch maskieren, OCR unabhängig | Bisherige Policy-DTOs und expliziter Exportauftrag unverändert; Standard bleibt Selbst entscheiden |
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
