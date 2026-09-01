# Kanonisches Produktziel

Stand: 01.09.2026 · Zielbild aus `PRODUCT_VISION.md` · Ist-Zustand RC84

RC78/RC79 erweitern nur die Engineering-Abnahme um einen nativen Prozessbeobachter
mit optionaler Parent-/Worker-Reihenfolgeprüfung. DS-062 schließt zusätzliche
System-VMs für DataSecure und unsere Testplanung aus. DS-063 schließt zusätzlich
ein separates Windows-Benutzerkonto aus; sichere Testtrennung ist Entwicklungsarbeit.
Kein neuer Nutzerschritt, keine Laufzeit-/Formatfreigabe und keine behauptete
Beschleunigung des Anonymisierers. Standardstart bleibt Node; selbsttragende
SEA-Pakete benötigen weiterhin die E0-/Zielsystemnachweise aus dem Backlog.

DS-065 ersetzt die frühere Verschlüsselungspflicht: neue lokale Arbeitskopien
ohne zusätzliche Verschlüsselung, Schlüsselbund, Schlüsseldatei oder Passwort.
Sie bleiben lokal, sind aber mit passenden Dateirechten lesbar. Die RC80-Umstellung
und ihre Regression werden in `CURRENT_STATE.md` getrennt von der echten
Cowork-Abnahme nachgewiesen.

## Ziel in einem Satz

GBH DataSecure ist ein selbsttragendes Claude-Cowork-Plugin, das lokale Dateien
und Ordner offline de-identifiziert und Claude ausschließlich ausdrücklich
freigegebene Markdown-Arbeitsfassungen bereitstellt.

## Verbindlicher Normalweg

```text
„Diese Dateien anonymisieren“ oder Skill auswählen
                 ↓
lokale Datei- oder Ordnerauswahl
                 ↓
vollständige Umfangs-, Speicher- und Bereitschaftsprüfung
                 ↓
kurze Startbestätigung; lokaler Hintergrundauftrag
                 ↓
klare Dateien veröffentlichen, Unsicherheiten lokal pausieren
                 ↓
höchstens: Ergebnisse verwenden · lokal prüfen · Ausgabe öffnen
```

Gemischte Stapel sind normal; ein Dokumentprofil wird automatisch pro Datei
bestimmt. Ein aktiver und mehrere pausierte Stapel sind erlaubt. Fehler, Neustart
oder vertagte Fachentscheidungen führen an der letzten sicheren Position weiter,
ohne bereits erledigte Dateien erneut zu verarbeiten. Eindeutige Ergebnisse
benötigen keine Pflichtvorschau.

`nur anonymisieren` endet lokal. Nur `anonymisieren und auswerten` übergibt
freigegebenes Markdown an Claude. Die Grenze von 100 Dateien und 500 MiB beschreibt
die lokale Aufbereitung, nicht einen Modellkontext; eine Seitenbegrenzung gibt es
nicht.

Ist-Grenze RC75: Auch ein kombinierter Erstauftrag startet zunächst ausschließlich
lokal. Die Auswertung benötigt danach einen neuen ausdrücklichen Auftrag; der
Start pollt oder liest nicht automatisch. Die weitergehende nahtlose Zielreise
bleibt BL-041.2 und wird durch diese Vertragskorrektur nicht als fertig erklärt.

## Zielformate und Ergebnisgrade

| Eingang | Zielbehandlung |
|---|---|
| TXT, Markdown, CSV | Text und Tabellenstruktur vollständig prüfen |
| DOCX | Text, Tabellen, Kopf-/Fußbereiche, Textfelder und relevante eingebettete Bereiche prüfen |
| XLSX | Blätter, Zellen, Kommentare, relevante versteckte Bereiche und Einbettungen prüfen |
| PPTX | Folien, Notizen, Tabellen, Textfelder und Einbettungen prüfen |
| PDF und Scan-PDF | Textschicht, Objekte und visuelle Seiten lokal prüfen beziehungsweise OCR-verarbeiten |
| PNG, JPEG, BMP | lokalen OCR-Text prüfen; unsichere visuelle Bedeutung lokal zurückhalten |

Ein Format wird erst nach vollständigen Sicherheits-, Coverage- und
Zielplattformgates aktiviert. Jede Quelle endet als **vollständig verarbeitet**,
**verwendbar mit benannten Auslassungen** oder **sicher nicht verarbeitet**.
Passwortgeschützte beziehungsweise verschlüsselte Quellen werden nicht
entschlüsselt oder kopiert; der restliche Stapel läuft weiter.

Für jede Quelle entsteht genau ein neutral benanntes Markdown-Ergebnis. Bildpixel
gehen nicht an Claude. Der Export ist eine de-identifizierte beziehungsweise
datenschutzreduzierte KI-Arbeitsfassung, keine Rechtsgarantie und keine
layoutidentische Kopie.

## Lokale Daten- und Sicherheitsgrenze

- Originale werden niemals verändert, verschoben oder gelöscht.
- Chat-Anhänge sind kein sicherer Originaleingang; lokal synchronisierte Cloud-
  Ordner werden ausschließlich lesend verwendet.
- Symlinks, Junctions, Reparse Points und externe Nachladebeziehungen werden nicht
  verfolgt; Makros, Skripte und aktive Inhalte werden nie ausgeführt.
- Private Snapshots und Reviewdaten sind lokale, unverschlüsselte Arbeitsdateien
  (DS-065). Kein Schlüsselbund, Schlüsseldatei oder Passwort erforderlich.
  Erfolgreiche neue Rohkopien werden sofort, offene spätestens nach 14 Tagen
  gelöscht; neue Reviewkopien folgen ihrer konfigurierten Frist. Verschlüsselte
  Altbestände samt Metadaten bleiben unverändert und werden nicht automatisch
  migriert oder gelöscht; zur Verarbeitung das Original erneut auswählen.
- Freigegebene Exporte und das ausschließlich lokale Mapping bleiben dauerhaft.
  Relative Quellpfade erscheinen nur, wenn eine Ordnerhierarchie sonst mehrdeutig
  wäre; eine Rohentitätstabelle wird nicht geführt.
- Verarbeitung, Diagnose und UI besitzen keine eigene Netzwerkkommunikation und
  keine Telemetrie.

## Cowork-, UX- und Performancevertrag

Cowork ist Einstieg, inhaltsfreier Status und Ergebnisort. Datei-/Ordnerwahl und
rohdatenhaltige Prüfung erfolgen lokal. Eine optionale inhaltsfreie MCP-App ist nur
progressive Verbesserung; OS- und Textfallback bleiben vollständig.

RC68 enthält dafür nur eine standardmäßig deaktivierte passive Startkarte. Sie
zeigt eine Momentaufnahme, keinen Live-Fortschritt und keinen bestätigten Abschluss.
Sie führt keine Aktionen aus und erhält keine Dokumentdaten. Produktaktivierung
bleibt von echter Cowork-/A11y-Evidenz abhängig (BL-042.3).

Picker und Startannahme sollen je innerhalb von zwei Sekunden reagieren; kein
Verarbeitungs-MCP-Aufruf darf Cowork länger als zehn Sekunden blockieren. Adaptive
Parallelität bleibt unter dem kleineren Wert aus 25 Prozent RAM und zwei GiB.
Performance-Regressionen über zehn Prozent blockieren ohne begründete
Qualitätsverbesserung die Freigabe.

## Plattform, Distribution und Lifecycle

Der erste produktive Cowork-Release umfasst Windows x64 und macOS Intel/Apple
Silicon. Linux und Windows ARM64 folgen nach eigener Hostevidenz. Marketplace sowie
`GBH-DataSecure-Windows-x64.zip` und `GBH-DataSecure-macOS-universal.zip` enthalten
alle nötigen Laufzeiten; Anwender installieren weder Node.js noch Python. Ein MCPB
wird nur intern geprüft und nicht verteilt.

Update, Rückrolle und Deinstallation erhalten Originale, Exporte, Mappings und
offene Stapel. Piloten dürfen unsigniert sein; eigene native Sicherheitskomponenten
werden vor breitem Unternehmenseinsatz signiert. Deutsch, Englisch und
WCAG-orientierte Abnahmen gehören zum Releasevertrag.

## Implementierungsbasis RC66 und Scopekorrektur RC80

Aktuell freigegeben sind TXT, Markdown, CSV und DOCX im synthetisch belegten
Engineering-Pfad. Die Stapelgrenze beträgt 100 Dateien und 500 MiB; zusätzlich
gelten TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes und DOCX 64 MiB
komprimiert/128 MiB entpackt. Fortsetzbare Checkpoints, lokales Mapping,
Hintergrund-Intake und Sicherheitsgates bestehen. Rekursive Ordnerauswahl und
der lokale Snapshot-/Reviewpfad sind E0 integriert; RC80 stellt dessen Speicherweg
gemäß DS-065 ohne zusätzliche Verschlüsselung um. Die adaptive Zwei-Slot-Policy
ist synthetisch belegt, bleibt im
Produktpfad aber bis zur realen Zielhardware-Evidenz seriell geschlossen.

Noch nicht erfüllt sind insbesondere selbsttragende Windows-/macOS-Pakete, echte
Cowork-Abnahmen, reale Dateisystemevidenz, selbsttragende Zielpakete,
adaptive Produktparallelität und
die Freigabe von XLSX, PPTX, PDF/Scan-PDF sowie Rasterbildern. Der genaue IST/SOLL-
Abgleich steht in `CURRENT_STATE.md`; nur `BACKLOG.md` priorisiert die Restarbeit.
