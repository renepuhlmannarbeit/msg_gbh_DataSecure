# Format-Coverage-Matrix

Stand: 3.2.0 RC19. Diese Matrix beschreibt belegte Extraktion, nicht nur akzeptierte
Dateiendungen. `Privater Dialog` bedeutet: Der gesamte lokale Review-/Residual-/Release-
Pfad ist freigegeben. `Input` ist der technische Fallback und kein Beleg vollständiger
Struktur- oder Formattreue.

| Format | Belegte Textbereiche | Visuelle Behandlung | Privater Dialog | Bekannte Grenzen / nächstes Gate |
|---|---|---|---|---|
| TXT | gesamter UTF-8-Text innerhalb der Größenlimits | keine | ja | Encoding außerhalb UTF-8 nicht zugesichert |
| DOCX | Dokumenttext einschließlich Tabellen und verschachtelter DrawingML-Textfelder | bekannte Medien entfernen oder zurückhalten; unbekannte inhaltsfähige Parts blockieren | ja | Kommentare, Kopf-/Fußzeilen und weitere OOXML-Parts erst nach expliziter Coverage freigeben |
| PDF | einfache Literal-/Hex-Strings aus einigen Content-Streams; kein vollständiger Seitennachweis | direkte JPEG-Objekte; übrige Visuals unvollständig | **nein** | Page-Tree/Contents, Form-XObjects, Inline-Images, Vektoren, Font-Encoding, ToUnicode, indirekte Filter und DecodeParms vollständig auswerten oder blockieren |
| XLSX | Shared-/Inline-Strings und einfache Zellwerte | bekannte Medien über Visual-Gate | nein | Kommentare, Formeln/Anzeigeformat, Charts, Zeichnungen, versteckte Bereiche und externe Beziehungen systematisch abdecken |
| PPTX | Folientext und Sprechernotizen | bekannte Medien über Visual-Gate | nein | Master/Layout, Charts, SmartArt, eingebettete Objekte und externe Beziehungen systematisch abdecken |
| MD | gesamter UTF-8-Text innerhalb der Größenlimits | referenzierte externe Inhalte werden nicht geladen | nein | eingebettete Daten/HTML und Zeichencodierung explizit klassifizieren |
| CSV | Text in abgeschirmtem Markdown-Fence | keine | nein | Dialekt, Encoding und mehrzeilige Felder explizit abnehmen |
| PNG/BMP/JPEG | OCR-Text nur über lokalen Visual-Gate | Pixelprüfung, Schwärzung und Kontroll-OCR soweit Codec unterstützt | nein | ausdrückliches Profil; JPEG/BMP/PNG-Varianten und OCR/Raster-OS-Grenze weiter härten |

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

Bis diese Kriterien erfüllt sind, verwendet das Plugin für PDF ausschließlich den
lokalen `Input`-Fallback und behauptet weder vollständige Inhaltstreue noch eine
Freigabe im privaten Dialog.
