# DataSecure Security-Modell

Stand: 02.09.2026 · 3.2.0-rc89

## Vertrauensgrenze

Die Datenschutzgrenze ist der lokale Plugin-MCP. Originale gelangen nur über den
lokalen Betriebssystempicker hinein. Der Modellkontext erhält weder Originalbytes,
-pfade, -dateinamen noch erkannte Rohwerte. Freigegeben wird ausschließlich erneut
verifiziertes Markdown mit kurzlebiger, laufgebundener Leseberechtigung.

## Bedrohungen und Kontrollen

| Bedrohung | Kontrolle |
|---|---|
| Chat-Upload/Cloud ohne lokale Brücke | Skill-/Hostgate stoppt und verweist auf lokalen Picker |
| manipulierte Endung/Container | Signatur-, OPC-, CRC-, Relationship- und Strukturprüfung |
| aktive/eingebettete Inhalte | vollständige Coverage oder fail-closed Stopp |
| Prompt Injection im Dokument | Dokumentinhalt ist Daten, keine Werkzeuganweisung |
| direkte Identifikatoren | kontextbezogene Erkennung plus Residual-Gate |
| Überredaktion von Fachbegriffen/Zertifikaten | positionsbezogene Erhaltungsregeln und Korpus |
| Bilder/visuelle Identifikatoren | Pixel bleiben lokal; kein auswählbarer Freigabemodus |
| Crash/Unterbrechung | Journal, atomare Veröffentlichung, Resume ohne Duplikate |
| Pfad-/Link-/Swap-Angriff | lokaler Root, no-link/no-reparse, Identitätsbindung |
| Netzwerkabfluss | netzwerkfreier Verarbeitungskern und Boundarytests |
| Ressourcenerschöpfung | Datei-/Stapel-/CPU-/RAM-/Zeit-/Entpackbudgets |
| unbefugtes Ergebnislesen | paket-/laufgebundene Capability, Paging und Re-Verifikation |

## Lokale Speicherung

Arbeits- und Reviewkopien sind normale lokale Dateien ohne zusätzliche
Verschlüsselung, Schlüsselbund, Keyfile oder Passwort. Das ist eine bewusste
Produktentscheidung; Betriebssystemrechte und lokaler Geräteschutz sind die
Grenze. Historische verschlüsselte Artefakte werden unangetastet bewahrt.

Automatische Aufbewahrung gilt ausschließlich für eindeutig DataSecure-eigene
temporäre Arbeits-/Reviewdaten und ist auf 0–14 Tage begrenzt. Quellen/Originale
und fertige Outputs, Exporte sowie Mappingdateien werden niemals automatisch
gelöscht. Ein Bereinigungsfehler darf keinen breiteren Löschversuch auslösen.

## Bilder und Formate

TXT, Markdown, CSV und DOCX sind freigegeben. XLSX, PPTX, PDF, Scan-PDF und
eigenständige Bilder bleiben gesperrt. Bildpixel aus DOCX bleiben lokal. Ein
interner Legacy-Parameter darf den festen sicheren Bildschutz nicht herabsetzen
und ist keine Nutzeroption.

Passwortgeschützte oder verschlüsselte Quellen werden weder kopiert noch
entschlüsselt; der Reststapel läuft weiter.

## Grenzen

De-Identifizierung ist keine garantierte rechtliche Anonymität. Quasi-
Identifikatoren können Re-Identifikation ermöglichen. Das Plugin ersetzt keine
Rechtsgrundlage, Zweckbindung, Datenschutz-Folgenabschätzung, IT-/Security-
Freigabe oder menschliche Fachentscheidung.

## Offene Releaseevidenz

Fresh Install und Hostgate auf Windows/macOS, reale Dateisystem-/Crashgrenzen,
Cowork-Berechtigungen, Accessibility, 100 Dateien/500 MiB sowie Fach-,
Datenschutz-, Security- und Architekturabnahme bleiben erforderlich. Siehe
[`BACKLOG_EVIDENCE_MATRIX.md`](canonical/BACKLOG_EVIDENCE_MATRIX.md).
