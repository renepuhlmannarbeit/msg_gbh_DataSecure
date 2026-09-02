# Produktvertrag: GBH DataSecure

Stand: 01.09.2026 · Ist-Zustand RC85

## Ziel

Menschen wählen lokale Geschäftsdokumente aus, DataSecure de-identifiziert sie
lokal und Claude erhält ausschließlich freigegebene Markdown-Ergebnisse. Das
Produkt reduziert Daten, garantiert aber keine rechtliche Anonymität und trifft
keine Personal- oder Fachentscheidung.

## Normalreise

1. In Cowork „Dateien anonymisieren“ schreiben oder den gleichnamigen Skill wählen.
2. Im lokalen Mehrfachpicker bis zu 100 Dateien mit zusammen höchstens 500 MiB
   auswählen und einmal „Öffnen“ klicken.
3. DataSecure liest Quellen nur, prüft den gesamten Stapel und verarbeitet ihn
   lokal im Hintergrund. Klare Dateien werden ohne Reviewdialog abgeschlossen;
   ein sicherer Stopp oder eine Mehrdeutigkeit blockiert den Reststapel nicht.
4. Die lokale Abschlussmeldung zeigt nur Zähler. Markdown und
   `DataSecure-Mapping.csv` bleiben lokal.
5. Erst ein späterer ausdrücklicher Auftrag übergibt benötigte freigegebene
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

Plugin-ZIP und privater Marketplace liefern dasselbe Nutzerprodukt. Das intern
erzeugte MCPB ist kein Anwenderweg. Windows x64 sowie macOS Intel/ARM sind die
Erstreleaseziele, Linux folgt getrennt. Alle nötigen Laufzeiten müssen im Produkt
enthalten sein; Anwender installieren weder Node.js noch Python.

Lokale Originalverarbeitung ist nur in einer lokalen Claude-Desktop-/Cowork-
Sitzung oder in Claude Code zulässig, wenn der lokale Plugin-MCP tatsächlich
startet. Cloud-Sitzungen starten keinen lokalen Plugin-MCP und dürfen unabhängig
von ihrer sichtbaren Oberfläche keine Originale erreichen.

## Grenzen vor Freigabe

Fresh Install, Update/Rollback, Host-/Berechtigungsanzeigen, Windows/macOS-
Dateisystemverhalten, 100 Dateien/500 MiB, UX, Accessibility, IT/Health-IT,
Datenschutz, Security und Architektur benötigen noch menschliche Evidenz. Siehe
[`BACKLOG.md`](BACKLOG.md) und [`BACKLOG_EVIDENCE_MATRIX.md`](BACKLOG_EVIDENCE_MATRIX.md).
