# Produktvertrag: GBH DataSecure

Stand: 08.09.2026 · Ist-Zustand RC123

## Ziel

DataSecure umfasst zwei lokale Produkte mit gemeinsamem Verarbeitungskern:
Das Cowork-Plugin de-identifiziert Geschäftsdokumente vor einer ausdrücklich
gewünschten Claude-Auswertung. Standalone bietet unabhängig davon dieselbe
Anonymisierung sowie reine Markdown-Konvertierung **ohne** Anonymisierung.
Menschen wählen Dateien und Zweck; Originale bleiben unverändert. Der
Anonymisierungsmodus reduziert Daten, garantiert aber keine rechtliche
Anonymität. Keines der Produkte trifft Personal- oder Fachentscheidungen.

## Normalreise

Die folgende Normalreise betrifft das Claude-Produkt. Standalone startet nach
DS-086 auf **Start**, ohne vorausgewählte Betriebsart. Nach ausdrücklicher
Funktionswahl und Dateiauswahl startet der Anwender einmal die Verarbeitung.
**Verlauf** zeigt die letzten 20 eigenen Verarbeitungen mit Datum, Zweck,
Zählern und Status. Jede Zeile öffnet nur ihren eigenen Ergebnisordner bzw. bei
Anonymisierung ihre Zuordnung oder setzt genau diesen Stapel fort, sofern möglich. Ein
Abschluss oder Neustart wechselt die Ansicht nicht automatisch.

1. In Cowork „Dateien anonymisieren“ schreiben oder den gleichnamigen Skill wählen.
2. Nur beim ersten Lauf einen lokalen Ergebnisordner ausdrücklich wählen.
   Ein bereits mit Cowork verbundener dedizierter Ordner ist optional; DataSecure
   erkennt verbundene Arbeitsordner nicht selbst. Es merkt sich die Wahl und legt darunter
   `DataSecure-Output` an; spätere Läufe überspringen diesen Schritt.
3. Im lokalen Mehrfachpicker bis zu 200 Dateien mit zusammen höchstens 500 MiB
   auswählen und einmal „Öffnen“ klicken.
4. DataSecure liest Quellen nur, prüft den gesamten Stapel und verarbeitet ihn
   lokal im Hintergrund. Klare Dateien werden ohne Reviewdialog abgeschlossen;
   ein sicherer Stopp oder eine Mehrdeutigkeit blockiert den Reststapel nicht.
5. Die lokale Abschlussmeldung zeigt nur Zähler und bietet „Ergebnisse öffnen“.
   Nur verifiziertes Markdown liegt sichtbar unter `DataSecure-Output/Lauf-…`.
   Cowork verwendet neutrale Namen. Standalone spiegelt bei Ordnerauswahl die
   relative Quellstruktur und verwendet je Stapel entweder neutrale Namen
   (datensparender Standard) oder auf ausdrückliche Wahl den Quellbasisnamen mit
   `-anonymisiert.md`. Dort liegt zusätzlich die lokale
   `DataSecure-Zuordnung.csv` für genau diesen Lauf. Im Cowork-Produkt bleiben
   Originalnamen und die dauerhafte `DataSecure-Mapping.csv` privat. Private
   Arbeitskopien, Review- und Recoverydaten bleiben in beiden Produkten intern;
   Originale bleiben an ihrem gewählten Quellort.
6. Erst ein späterer ausdrücklicher Auftrag übergibt benötigte freigegebene
   Markdown-Ergebnisse begrenzt an Claude.

Kein Profil-, Bildmodus-, Einzeldatei- oder Ergebnislesedialog gehört zum
Normalstart. Ein zurückgestellter Sammelreview wird ausdrücklich und lokal
fortgesetzt. Er zeigt nur die tatsächlich mehrdeutigen Dateien, direkte
Beibehalten-/Anonymisieren-Aktionen und inhaltsfreie Fortschrittszähler.

## Eingaben und Ergebnisse der Anonymisierung

| Bereich | Aktueller Vertrag |
|---|---|
| Cowork freigegeben | TXT, Markdown, CSV und DOCX über den strengen direkten Parserpfad |
| Standalone Markdown-first nach DS-087/090 | DOCX, XLSX, PPTX, PDF, Scan-PDF, PNG, JPEG und BMP werden lokal extrahiert; gültiger, nichtleerer Markdown-Inhalt wird anonymisiert und die Quellenabdeckung separat ausgewiesen |
| gesperrt | unbekannte Formate; breite Formate im Cowork-Plugin; leere OCR, beschädigte, verschlüsselte oder aktive Quellen |
| verschlüsselt/passwortgeschützt | sicher stoppen, gesondert lokal melden, nicht entschlüsseln |
| Bilder in DOCX | Pixel bleiben lokal; kein auswählbarer Modus; kein Claude-Freigabeweg |
| Ergebnis | ein geprüftes Markdown je positiver Datei, dauerhaft lokales Mapping |
| Grade | vollständig verarbeitet; verwendbar mit Auslassungen; sicher nicht verarbeitet |

Eine Endung ist keine Freigabe. Signatur, Containerstruktur, aktive Inhalte,
Einbettungen und Größen werden fail-closed geprüft. Bekannte, vertraglich
klassifizierte Extraktionslücken dürfen nur im Standalone-Markdown-first-Pfad
weiterlaufen und müssen dort getrennt vom Anonymisierungsstatus sichtbar sein.

## Lokale Daten

- Quellen/Originale werden niemals verändert, verschoben oder automatisch gelöscht.
- Private Arbeits- und Reviewkopien sind normale lokale Dateien ohne Keyring,
  Passwort oder zusätzliche Verschlüsselung.
- Nur temporäre DataSecure-Arbeits-/Reviewdaten unterliegen 0–14 Tagen.
- Fertige Exporte und das Mapping werden niemals automatisch gelöscht.
- Der Privacy-Ordner muss lokal sein; Cloud-Sync, Netzwerkpfade und Links sind
  gesperrt.
- Ein sichtbarer Ergebnisordner darf ausdrücklich auf einem Netzlaufwerk liegen.
  DataSecure weist bei der Wahl einmal sichtbar darauf hin, dass Ergebnisse und
  – bei Standalone-Anonymisierung – die laufbezogene Zuordnungsdatei dadurch an
  andere Systeme übertragen werden können. Das ist kein zusätzlicher Dialog und
  keine Sperre.

## Claude- und Plattformvertrag

Plugin-ZIP und privater Marketplace liefern dasselbe Nutzerprodukt. Bis die
selbsttragende Marketplace-Projektion freigegeben ist, ist das Plugin-ZIP der
einzige freigegebene Installationsweg. Das intern erzeugte MCPB ist kein
Anwenderweg. Windows x64 sowie macOS Intel/ARM sind die
Erstreleaseziele, Linux folgt getrennt. Alle nötigen Laufzeiten müssen im Produkt
enthalten sein; Anwender installieren weder Node.js noch Python.

Lokale Originalverarbeitung ist in einer lokalen Cowork-Sitzung eines
bestehenden Claude-Desktop-Deployments oder in lokalem Claude Code zulässig,
wenn der lokale Plugin-MCP tatsächlich verbunden ist. Cloud-Cowork, Web, Mobil
und geplante Cloud-Sitzungen dürfen keine Originale erreichen; sie dürfen nur
bereits lokal freigegebenes Markdown verwenden.

## Zweites Produkt in Entwicklung: DataSecure Standalone

DataSecure Standalone ist eine eigenständige lokale Desktopanwendung ohne
Claude, Cowork, MCP, Skills, Agenten oder Internet. Sie teilt ausschließlich den
geprüften DataSecure-Core mit dem Plugin und besitzt einen getrennten Datenroot,
ein eigenes Paket und einen eigenen Update-/Rollbackvertrag. Der E0-Unterbau,
die Tauri-Hülle und ein selbsttragendes Windows-x64-Engineering-Paket sind
vorhanden und automatisch verifiziert, aber noch kein freigegebenes
Endnutzerpaket. Microsoft MarkItDown 0.1.7 ist ausschließlich als deaktivierter
DOCX-Differentialpfad vorbereitet. Im Cowork-Plugin bleiben die oben genannten
vier Formate der direkte Anonymisierungspfad. Nach DS-087/090 kann Standalone
DOCX, XLSX, PPTX, PDF/Scan-PDF und PNG/JPEG/BMP erst neutral in Markdown extrahieren und anschließend
denselben Privacy-Core nutzen. Dabei wird nur eine anonymisierte Markdown-
Extraktion veröffentlicht; ihre Quellenabdeckung wird separat ausgewiesen. Die reine
Standalone-Konvertierung besitzt denselben breiten Eingabeumfang, darf Hinweise
dagegen sichtbar mit ausgeben. Zielhost-UAT und native
macOS-Pakete bleiben gesondert offen; Details stehen in
[`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).

Standalone besitzt zwei verbindliche Kernfunktionen (DS-085). Die heute
implementierte Anonymisierung und die **aktivierte reine
Markdown-Konvertierung** verwenden denselben Auswahl-/Start-/Fortschritts- und
Ergebnisablauf. Reine Konvertierung entfernt keine personenbezogenen Inhalte,
hat keinen PII-Review und exportiert ausschließlich `.md`-Nutzdokumente ohne
Zuordnungsdatei nach `DataSecure-Markdown/Lauf-…`. Diese Dateien sind ausdrücklich
**nicht anonymisiert** und werden niemals automatisch an Claude übergeben.
Die Format-Zielliste bleibt für beide Modi erhalten; deren Freigabestatus darf
nicht aus einer sichtbaren Moduswahl oder vorhandenen Dateiendung abgeleitet werden.

Für Standalone-Anonymisierung ist die sichtbare Ergebnisbenennung eine
ausdrückliche Stapelwahl (DS-091): neutral ist Standard, alternativ bleibt der
Quellbasisname mit `-anonymisiert` erhalten. Die Zuordnungsdatei verweist immer
auf den tatsächlich erzeugten Namen. Cowork bleibt stets neutral; reine
Konvertierung behält den Quellbasisnamen und benötigt keine Zuordnung.

Im Standalone-Konvertierungsmodus sind zusätzlich DOCX, XLSX/PPTX/PDF/Scan-PDF
und PNG/JPEG/BMP über den einmaligen Markdown-first-Pfad angebunden.
Extrahierbarer Text und Tabellen werden übernommen;
grafische Inhalte und OCR besitzen kenntlich gemachte Grenzen. Solche Hinweise
werden ohne PII-Review mit den Ergebnissen gespeichert. Defekte, verschlüsselte
oder aktiv gefährliche Eingaben erhalten eine eigene Fehlerposition, während der
Stapel weiterläuft. Die auf TXT, Markdown, CSV und den strengen direkten
DOCX-Parser begrenzte **Cowork-Anonymisierungsfreigabe** erweitert sich dadurch
nicht.

Die Ordneraufnahme hat bewusst produktspezifische Finalität: Cowork lehnt einen
gewählten Baum atomar ab, sobald er ein unbekanntes oder gesperrtes Format
enthält. Standalone nimmt alle unterstützten Quellen rekursiv auf; eine defekte,
verschlüsselte oder unsichere unterstützte Datei stoppt nur ihre eigene Position,
während der Rest weiterläuft. Nicht unterstützte Dateien werden in Standalone
sichtbar als nicht aufgenommen ausgewiesen und niemals still als erfolgreich
verarbeitet gezählt.

## Grenzen vor Freigabe

Fresh Install, Update/Rollback, Host-/Berechtigungsanzeigen, Windows/macOS-
Dateisystemverhalten, 200 Dateien/500 MiB, UX, Accessibility, IT/Health-IT,
Datenschutz, Security und Architektur benötigen noch menschliche Evidenz. Siehe
[`BACKLOG.md`](BACKLOG.md) und [`BACKLOG_EVIDENCE_MATRIX.md`](BACKLOG_EVIDENCE_MATRIX.md).
