# Kanonisches Produktziel

Stand: 22.08.2026 · Zielstand nach RC30

## Ziel in einem Satz

GBH DataSecure ist ein einfach installierbares Claude-Plugin, das bis zu 100 lokale
Dateien mit zusammen höchstens 500 MB auf Windows, macOS und Linux offline
de-identifiziert und Claude ausschließlich geprüfte Markdown-Ergebnisse bereitstellt.

## Verbindlicher Benutzerweg

```text
Natürliche Sprache oder Skill auswählen
                 ↓
lokal bis zu 100 Dateien auswählen
                 ↓
offline extrahieren, OCR, erkennen und ersetzen
                 ↓
ein gebündelter lokaler Dialog nur bei offenen Stellen
                 ↓
Markdown + lokale Mapping-CSV + JSON-Nachweis exportieren
                 ↓
Claude arbeitet automatisch nur mit freigegebenem Markdown weiter
```

Der Anwender wählt keine Dokumentprofile. Gemischte Stapel sind normal. Nach einem
Abbruch wird an der letzten sicheren Position fortgesetzt. Eindeutige Ergebnisse
benötigen keine Pflichtvorschau.

## Zielformate und Ausgabe

| Eingang | Zielbehandlung |
|---|---|
| TXT, Markdown, CSV | Text und Tabellenstruktur prüfen und als Markdown ausgeben |
| DOCX | Fließtext, Tabellen, Kopf-/Fußbereiche, Textfelder und eingebettete Inhalte prüfen |
| XLSX | Blätter, Zellen, Kommentare und eingebettete Inhalte nachvollziehbar abbilden |
| PPTX | Folientext, Notizen, Tabellen, Textfelder und eingebettete Inhalte abbilden |
| PDF | Textschicht, Objekte und visuelle Seiten vollständig prüfen; Scan-PDF lokal OCR-verarbeiten |
| PNG, JPEG, BMP | lokalen OCR-Text prüfen; nicht textuelle Bedeutung als offene Stelle kennzeichnen |

Für jede Quelle entsteht genau ein neutrales Markdown-Ergebnis. Bildpixel werden nicht
an Claude übertragen. Die Ausgabe ist eine KI-Arbeitsfassung, keine layoutidentische
Kopie der Quelle.

## Lokale Dateien und Datenhaltung

- Originale bleiben unverändert.
- Ein aktiver Stapel, mehrere pausierte Stapel.
- Private Arbeitskopien offener Aufträge verfallen nach 14 Tagen.
- Freigegebene Exporte bleiben im gewählten Exportordner dauerhaft bestehen.
- Die Mapping-CSV enthält Originaldateinamen, aber keine Pfade, und bleibt außerhalb
  der Claude-/MCP-Lesegrenze.
- Passwörter und stapelweite Pseudonymzuordnungen existieren nur im Arbeitsspeicher.
- Der Verarbeitungskern verwendet kein Netzwerk.

## Produktoberfläche

Sichtbar sind genau zwei Skills. Der normale Dialog verwendet Alltagssprache und
höchstens einen gebündelten Abschlussdialog. Technische Details sind einklappbar.
Direkter ZIP-Import und privater Marketplace führen zum gleichen Produktverhalten.

## Aussage- und Freigabegrenzen

„Anonymisieren“ ist der Aktionsname, keine Rechtsgarantie. Das Ergebnis bleibt als
datenschutzreduziert beziehungsweise pseudonymisiert beschrieben. Eine Signatur oder
Zertifizierung ist nicht erforderlich und wird nicht behauptet.

Eine allgemeine Plattformfreigabe setzt frische End-to-End-Abnahmen auf Windows,
macOS und Linux sowie die in `DS-033` festgelegte 1.000-Dokument-Suite voraus.

## Ist-Zustand RC30

RC30 ist ausschließlich die technische Ausgangsbasis. Aktuell öffentlich freigegeben
sind nur TXT, Markdown, CSV und DOCX im synthetischen Engineering-Betrieb; bis zu 100 Dateien mit
zusammen höchstens 500 MB bilden die heutige Stapelgrenze. Der serverseitig
versiegelte Stapel, der dauerhafte lokale Mapping-Export und die ausdrückliche
Wiederaufnahme nach Unterbrechungen sind als Engineering-Basis umgesetzt; der
stapelweite Abschlussdialog und die nachweislich installationsfreie Drei-OS-Laufzeit
fehlen weiterhin. PDF und weitere Zielformate bleiben gesperrt. Maßgeblich für den
aktuellen Betriebsumfang bleiben README, Betriebshandbuch und Releasecheckliste.
