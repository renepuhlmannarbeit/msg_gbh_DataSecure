# Format-Coverage-Matrix

## Öffentliche Pilot-Allowlist

Nur TXT und DOCX dürfen ein Privacy-Paket veröffentlichen. Alle anderen sichtbaren
Dateien stoppen mit einem festen Fehlercode; es gibt keinen Upload- oder
Parser-Fallback. Jede Parserwarnung stoppt ebenfalls. Bildpixel aus DOCX bleiben
unabhängig vom erkannten Typ lokal und werden im öffentlichen Pilot nicht an Claude
freigegeben.

Diese Matrix beschreibt belegte Extraktion, nicht nur akzeptierte Dateiendungen.
Der fortsetzbare `Input`-Ablauf mit einem MCP-Aufruf pro Datei ist der Standard auf
allen Plattformen. Windows x64 besitzt zusätzlich die native Job-Object-Grenze; die
bearbeitbare lokale Textprüfung gehört zum getrennten Companion-Engineeringpfad und
wird im einfachen Standardablauf nicht geöffnet.
macOS/Linux sind für TXT/DOCX textbasiert freigegeben, halten visuelle Inhalte zurück
und stoppen bei einer notwendigen Mehrdeutigkeitsentscheidung sicher.

| Format | Belegte Textbereiche | Visuelle Behandlung | Plattformstatus | Bekannte Grenzen / nächstes Gate |
|---|---|---|---|---|
| TXT | gesamter UTF-8-Text innerhalb der Größenlimits | keine | Windows/macOS/Linux Textpfad | Encoding außerhalb UTF-8 nicht zugesichert |
| DOCX | Dokumenttext einschließlich Tabellen und verschachtelter DrawingML-Textfelder | bekannte Medien entfernen oder zurückhalten; unbekannte inhaltsfähige Parts blockieren | Windows vollständigere Prüfung; macOS/Linux Textpfad fail-closed | Kommentare, Kopf-/Fußzeilen und weitere OOXML-Parts erst nach expliziter Coverage freigeben |
| PDF | `pdf-lite` nur noch als Test-/Gegenprobenparser; kein Release-Pfad | nicht freigegeben | **nein** | jeder PDF-Lauf stoppt mit `PDF_COVERAGE_UNVERIFIED`; Zielarchitektur und Gates siehe `PDF_ENGINE_DECISION.md` |
| XLSX | Shared-/Inline-Strings und einfache Zellwerte | bekannte Medien über Visual-Gate | nein | Kommentare, Formeln/Anzeigeformat, Charts, Zeichnungen, versteckte Bereiche und externe Beziehungen systematisch abdecken |
| PPTX | Folientext und Sprechernotizen | bekannte Medien über Visual-Gate | nein | Master/Layout, Charts, SmartArt, eingebettete Objekte und externe Beziehungen systematisch abdecken |
| MD | gesamter UTF-8-Text innerhalb der Größenlimits | referenzierte externe Inhalte werden nicht geladen | nein | eingebettete Daten/HTML und Zeichencodierung explizit klassifizieren |
| CSV | Text in abgeschirmtem Markdown-Fence | keine | nein | Dialekt, Encoding und mehrzeilige Felder explizit abnehmen |
| PNG/BMP/JPEG | OCR-Text nur über lokalen Visual-Gate | Pixelprüfung, Schwärzung und Kontroll-OCR soweit Codec unterstützt; Windows-Prozess läuft im Job Object | nein | ausdrückliches Profil; Codec-Varianten, AppContainer und Dateisystemgrenze weiter härten |

## PDF-Freigabekriterien für den privaten Dialog

PDF darf erst als „textbasiert“ in der normalen Dateiauswahl erscheinen, wenn alle
folgenden Punkte automatisiert mit synthetischen und real erzeugten Testdateien belegt
sind:

1. Catalog, Pages-Baum, jede Page und sämtliche `Contents`-Referenzen werden lückenlos
   aufgelöst; unreferenzierte Decoy-Streams können keinen Erfolg vortäuschen.
2. Text wird gemäß Font-Encoding, `Differences`, Type0/CIDFont und `ToUnicode` so
   dekodiert, wie er gerendert wird. Nicht unterstützte Fonts stoppen die Freigabe.
3. Image-XObjects, Inline-Images, Form-XObjects, Annotationen, Formulare,
   eingebettete Dateien und Vektor-/Outline-Inhalt werden vollständig verarbeitet oder
   als technische Unsicherheit blockiert.
4. Direkte, indirekte und Array-Filter sowie `DecodeParms` sind entweder korrekt
   unterstützt oder fail-closed. Verschlüsselung und Objektstreams werden bewusst
   behandelt.
5. Ein PDF mit irgendeinem visuellen Bereich kann den Text-only-Vertrag nicht durch ein
   positives OCR-Ergebnis umgehen.
6. Gegenproben umfassen Word-, LibreOffice- und Browser-PDFs sowie Custom-CMap,
   Decoy-Stream, Inline-Image, Vektorlogo, Form-XObject, indirekten Filter und beschädigte
   Container.

Bis diese Kriterien erfüllt sind, stoppt das Plugin PDF auch im lokalen `Input`-Pfad
vor der Extraktion. Das Original wird wiederhergestellt, es entsteht kein Paket und
Claude erhält keine Rohbytes. Der alte Lite-Parser bleibt ausschließlich für
adversariale Tests erhalten und ist kein Produktpfad.
