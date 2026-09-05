# Produktvertrag: GBH DataSecure

Stand: 03.09.2026 · Ist-Zustand RC102

## Ziel

Menschen wählen lokale Geschäftsdokumente aus, DataSecure de-identifiziert sie
lokal und Claude erhält ausschließlich freigegebene Markdown-Ergebnisse. Das
Produkt reduziert Daten, garantiert aber keine rechtliche Anonymität und trifft
keine Personal- oder Fachentscheidung.

## Normalreise

1. In Cowork „Dateien anonymisieren“ schreiben oder den gleichnamigen Skill wählen.
2. Nur beim ersten Lauf den bereits mit Cowork verbundenen Arbeitsordner als
   Ergebnisziel wählen. DataSecure merkt sich ihn lokal und legt darunter
   `DataSecure-Output` an; spätere Läufe überspringen diesen Schritt.
3. Im lokalen Mehrfachpicker bis zu 100 Dateien mit zusammen höchstens 500 MiB
   auswählen und einmal „Öffnen“ klicken.
4. DataSecure liest Quellen nur, prüft den gesamten Stapel und verarbeitet ihn
   lokal im Hintergrund. Klare Dateien werden ohne Reviewdialog abgeschlossen;
   ein sicherer Stopp oder eine Mehrdeutigkeit blockiert den Reststapel nicht.
5. Die lokale Abschlussmeldung zeigt nur Zähler und bietet „Ergebnisse öffnen“.
   Nur verifiziertes Markdown mit neutralen Namen liegt sichtbar unter
   `DataSecure-Output/Lauf-…`; `DataSecure-Mapping.csv`, Originale, Review- und
   Recoverydaten bleiben im privaten DataSecure-Bereich.
6. Erst ein späterer ausdrücklicher Auftrag übergibt benötigte freigegebene
   Markdown-Ergebnisse begrenzt an Claude.

Kein Profil-, Bildmodus-, Einzeldatei- oder Ergebnislesedialog gehört zum
Normalstart. Ein zurückgestellter Sammelreview wird ausdrücklich und lokal
fortgesetzt. Er zeigt nur die tatsächlich mehrdeutigen Dateien, direkte
Beibehalten-/Anonymisieren-Aktionen und inhaltsfreie Fortschrittszähler.

## Eingaben und Ergebnisse

| Bereich | Aktueller Vertrag |
|---|---|
| freigegeben | TXT, Markdown, CSV, DOCX |
| gesperrt | XLSX, PPTX, PDF, Scan-PDF, PNG, JPEG, BMP und unbekannte Formate |
| verschlüsselt/passwortgeschützt | sicher stoppen, gesondert lokal melden, nicht entschlüsseln |
| Bilder in DOCX | Pixel bleiben lokal; kein auswählbarer Modus; kein Claude-Freigabeweg |
| Ergebnis | ein geprüftes Markdown je positiver Datei, dauerhaft lokales Mapping |
| Grade | vollständig verarbeitet; verwendbar mit Auslassungen; sicher nicht verarbeitet |

Eine Endung ist keine Freigabe. Signatur, Containerstruktur, aktive Inhalte,
Einbettungen, Größen und Parserwarnungen werden fail-closed geprüft.

## Lokale Daten

- Quellen/Originale werden niemals verändert, verschoben oder automatisch gelöscht.
- Private Arbeits- und Reviewkopien sind normale lokale Dateien ohne Keyring,
  Passwort oder zusätzliche Verschlüsselung.
- Nur temporäre DataSecure-Arbeits-/Reviewdaten unterliegen 0–14 Tagen.
- Fertige Exporte und das Mapping werden niemals automatisch gelöscht.
- Der Privacy-Ordner muss lokal sein; Cloud-Sync, Netzwerkpfade und Links sind
  gesperrt.

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
DOCX-Differentialpfad vorbereitet. Bis Zielhost-UAT, breite Coverage und native
macOS-Pakete vorliegen, gelten die oben
genannten vier freigegebenen Formate unverändert; Details stehen in
[`STANDALONE_ARCHITECTURE.md`](STANDALONE_ARCHITECTURE.md).

## Grenzen vor Freigabe

Fresh Install, Update/Rollback, Host-/Berechtigungsanzeigen, Windows/macOS-
Dateisystemverhalten, 100 Dateien/500 MiB, UX, Accessibility, IT/Health-IT,
Datenschutz, Security und Architektur benötigen noch menschliche Evidenz. Siehe
[`BACKLOG.md`](BACKLOG.md) und [`BACKLOG_EVIDENCE_MATRIX.md`](BACKLOG_EVIDENCE_MATRIX.md).
