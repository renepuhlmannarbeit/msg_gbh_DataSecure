# Architekturentscheidung: lokaler PDF-Pfad

Stand: 21.08.2026 · Entscheidung für RC21

## Entscheidung

DataSecure verwendet den bisherigen `pdf-lite`-Parser nicht mehr im Release-Pfad.
PDF bleibt im privaten Picker gesperrt, bis ein eigener, gebündelter
PDFium-Worker den unten definierten Coverage-Vertrag erfüllt. Ein PDF darf vorher kein
Privacy-Paket erzeugen. Der feste Diagnosecode lautet `PDF_COVERAGE_UNVERIFIED`.

PDFium ist die Zielengine. PDF.js bleibt höchstens ein unabhängiger CI-Vergleichsparser
und wird nicht als Runtime-Abhängigkeit ausgeliefert. MuPDF und Poppler werden wegen
AGPL-/GPL-Auswirkungen ohne separate Legal-/Einkaufsentscheidung nicht integriert.
`Windows.Data.Pdf` kann später als unabhängiger Rendervergleich dienen, liefert aber
allein keinen hinreichenden Text- und Objektvertrag.

Offizielle technische Grundlagen:

- [PDFium – Getting started](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/docs/getting-started.md)
- [PDFium – öffentliche API](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/public/)
- [PDFium-Lizenz](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE)
- [PDF.js – Projekt und Apache-2.0-Lizenz](https://github.com/mozilla/pdf.js)
- [MuPDF-Lizenzhinweis](https://mupdf.com/releases)
- [Windows.Data.Pdf](https://learn.microsoft.com/windows/uwp/files/quickstart-render-pdf)

## Kleinster freigabefähiger Vertrag: Text-only-PDF

Der native Windows-x64-Worker erhält PDF-Bytes ausschließlich über ein geerbtes
Standard-Input-Handle und gibt ein streng validiertes JSON-Schema auf Standard-Output
zurück. Er bekommt keinen Dateipfad, keinen nutzergeerbten Environment-Block und keine
URL; der Worker darf keine Netzwerk-API verwenden. Eine belastbare, durch das
Betriebssystem erzwungene Netzgrenze besteht aber erst nach dem verpflichtenden
AppContainer-Test ohne Capabilities. Er läuft direkt unter dem vorhandenen
Job-Object-Launcher.

Ein Dokument ist nur dann Text-only, wenn alle Bedingungen positiv belegt sind:

1. `Catalog`, vollständiger Seitenbaum und jede Seite werden lückenlos geladen.
2. Jede Page enthält ausschließlich Textobjekte. Path, Image, Shading, Form-XObject
   und unbekannte Objekttypen stoppen den gesamten Lauf.
3. Annotationen, AcroForm/XFA, Attachments/Portfolio, JavaScript und Actions fehlen.
4. Jedes sichtbare Zeichen besitzt eine deterministische Unicode-Zuordnung. U+0000,
   U+FFFD, leere sichtbare Glyphen oder API-Fehler stoppen den Lauf.
5. Verschlüsselte beziehungsweise passwortgeschützte PDFs stoppen den Lauf.
6. Erst nach allen Seiten, Coverage-Prüfungen, PII-/Residual-Gates und lokaler Prüfung
   darf genau ein Paket atomar veröffentlicht werden. Teilresultate sind verboten.

Das versionierte Worker-Ergebnis enthält ausschließlich: Engine-/Commitkennung,
Seitenzahl, Textobjektzahl, Unicode-Zeichenzahl sowie Nullzähler für Nichttextobjekte,
Annotationen, Attachments, JavaScript-Aktionen und nicht zugeordnete Zeichen. Der
Node-Parent weist unbekannte Felder, unplausible Zähler und überschrittene Limits ab.

## Implementierungs- und Freigabegates

- PDFium-Commit, Quellarchiv-Hash, GN-Argumente und Toolchain pinnen;
  `pdf_enable_v8=false` und `pdf_enable_xfa=false`.
- Worker und alle tatsächlich gelinkten Drittkomponenten in
  `THIRD_PARTY_NOTICES.md` und SPDX-SBOM aufnehmen; interne Open-Source-/Legal-Freigabe.
- Reproduzierbarer Windows-x64-Build, PE-/SHA-Prüfung in ZIP und MCPB, CodeQL/
  Compilerhärtung, Sanitizer-/Fuzz-CI und später Authenticode.
- Harte Grenzen für Datei, Seiten, Objekte, Rekursion, Zeichen, RAM, CPU, Wallclock
  und IPC-Ausgabe; Fehler liefern nur feste Codes und niemals Text, Pfad oder Dateiname.
- Echte Verweigerung von Internet, DNS, Loopback, RFC1918, Nutzerprofil, Temp,
  Registry/Credentials, Prozessstart und unerlaubten Handles im AppContainer-Test.
- Synthetische und real erzeugte Gegenproben: Word, LibreOffice, Browser, Type0/CID,
  ToUnicode/Differences, Decoy-Stream, Object-/XRef-Stream, Inline-Image, Vektorlogo,
  verschachteltes Form-XObject, Annotation/Form/XFA, Attachment, JavaScript/Action,
  indirekte Filter/DecodeParms, Verschlüsselung, beschädigter Container und Bomben.

Erst wenn diese Gates in CI und auf einer frischen Windows-VM bestanden sind, dürfen
Capabilities, privater Dateidialog und Produkttexte PDF als unterstützt ausweisen.

## RC21: Packaging-/API-Spike

Der gepinnte Engineering-Spike ist technisch erfolgreich, seine Produktentscheidung
bleibt jedoch **No-Go**. Eine dynamische, inoffizielle Community-Distribution dient
ausschließlich zur synthetischen API- und Größenmessung; sie wird weder gebaut noch
geladen oder ausgeliefert, wenn das Plugin normal getestet, gestartet oder paketiert
wird. Lockwerte, positive Evidenz und verbleibende Blocker stehen in
[`PDFIUM_SPIKE_EVIDENCE.md`](PDFIUM_SPIKE_EVIDENCE.md).

Für die nächste Stufe wird ein eigener reproduzierbarer Build aus dem offiziellen,
gepinnten PDFium-Commit angestrebt, möglichst als statisch gebundene Einzel-EXE. Die
Probe muss direkt als einziges Kind des vorhandenen Job-Object-Launchers laufen. Eine
implizit gelinkte DLL ist kein Produktziel, weil Windows sie bereits vor `main` lädt
und Härtung im Prozess dann zu spät käme.
