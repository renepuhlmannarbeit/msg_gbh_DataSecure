# GBH DataSecure – Dokumente anonymisieren v3.2.0 RC89

DataSecure de-identifiziert lokale Geschäftsdokumente, bevor Claude deren Inhalt
verwendet. Originale werden über einen Betriebssystemdialog gewählt, nur lesend
verarbeitet und niemals automatisch verändert oder gelöscht. Claude erhält nur
freigegebene Markdown-Ergebnisse.

## Wofür DataSecure gedacht ist

DataSecure ist nicht nur ein Anweisungs-Skill oder ein einzelner PII-Detektor,
sondern ein lokales Privacy-Gateway für die gesamte Dokumentreise:

**lokal auswählen → Struktur prüfen → kontextbezogen de-identifizieren →
Restbefunde prüfen → lokal dokumentieren → Ergebnisse später kontrolliert an
Claude übergeben**

Das Plugin verbindet dabei Eigenschaften, die bei reinen Skills oder
Detektor-Bibliotheken erst zusätzlich gebaut werden müssten:

- Originalbytes, Pfade, Dateinamen und Bildpixel bleiben außerhalb von Claude.
- Unsichere Formate, Containerstrukturen oder Restbefunde stoppen fail-closed.
- Fachlich benötigte Rollen, Skills, Technologien und Zertifizierungen sollen
  erhalten bleiben, während direkte Identifikatoren ersetzt werden.
- Stapel sind fortsetzbar und verwenden innerhalb eines Stapels konsistente,
  nicht stapelübergreifend verknüpfte Pseudonyme.
- Claude liest Ergebnisse nicht automatisch, sondern erst nach einem späteren
  ausdrücklichen Auftrag als erneut verifiziertes Markdown.

Die Skills steuern diesen einfachen Ablauf und erklären seine Grenzen. Die
technische Datenschutzgrenze bildet der lokale Plugin-MCP, nicht der Skilltext.

## Aktueller Umfang

| Funktion | Stand |
|---|---|
| Eingaben | TXT, Markdown, CSV, DOCX |
| sicher gesperrt | XLSX, PPTX, PDF, Scan-PDF und eigenständige Bilder |
| Stapel | bis 100 Dateien, zusammen höchstens 500 MiB |
| Bilder in DOCX | Pixel bleiben lokal; kein auswählbarer Bildmodus |
| Ausgabe | freigegebenes Markdown im einmalig gewählten Cowork-Arbeitsordner; Mapping bleibt privat |
| Speicherung | lokale Arbeits-/Reviewkopien ohne Schlüsselbund oder Passwort |
| automatische Aufbewahrung | 0–14 Tage nur für temporäre Arbeits-/Reviewdaten |

Quellen/Originale und fertige Exporte werden niemals automatisch gelöscht.
Passwortgeschützte oder verschlüsselte Eingaben werden nicht entschlüsselt, sondern
sicher gestoppt und lokal gesondert gemeldet.

## Einfacher Cowork-Ablauf

1. Das zielsystemspezifische Plugin-ZIP installieren; Claude Desktop neu
   starten. Der private Marketplace wird dasselbe Produkt liefern; seine
   selbsttragende Projektion ist noch nicht freigegeben.
2. In einer neuen **lokalen** Cowork-Aufgabe **„Dateien anonymisieren“**
   schreiben oder den Skill `gbh-datasecure-dokument-anonymisieren` wählen.
   Cowork startet Aufgaben laut Hersteller standardmäßig in der Cloud; lokale
   Plugin-MCPs laufen nur in einer lokalen Sitzung.
3. Nur beim ersten Lauf den bereits mit Cowork verbundenen Arbeitsordner als
   Ergebnisziel wählen. DataSecure merkt ihn sich und legt dort
   `DataSecure-Output` an.
4. Dateien im lokalen Mehrfachpicker wählen und einmal **„Öffnen“** klicken.
   Bei allen späteren Läufen beginnt der Ablauf direkt mit dieser Quellauswahl.
5. Klare Dateien werden ohne weiteren Dialog abgeschlossen. Nur bei echten
   Mehrdeutigkeiten erscheint ein lokaler Sammelreview mit den direkten Aktionen
   **„Zertifikatsanbieter behalten“** und **„Organisation anonymisieren“**.
6. Die lokale Abschlussmeldung mit **„Ergebnisse öffnen“** verwenden. Im
   Cowork-Arbeitsordner liegen ausschließlich neutrale freigegebene Markdown-
   Dateien; Originale, Mapping, Review und Recovery bleiben im privaten Bereich.
7. Erst danach bei Bedarf ausdrücklich um die Auswertung der fertigen Ergebnisse
   bitten.

Keine sensiblen Originale als Chat-Anhang hochladen. Cloud-Cowork – auch in der
Desktop-App – startet keinen lokalen Plugin-MCP und darf keine Originale verarbeiten.
Erscheint kein lokaler Picker, ist meist die Sitzung eine Cloud-Sitzung oder die
Organisation hat lokale Plugin-MCPs deaktiviert; siehe IT-Betriebshandbuch.

## Dokumentation

- [Anleitung](docs/ANLEITUNG.md)
- [aktueller Produkt-/Entwicklungsstand](docs/canonical/CURRENT_STATE.md)
- [aktives Backlog](docs/canonical/BACKLOG.md)
- [Testvertrag](docs/TESTING.md)
- [IT-Betriebshandbuch](docs/IT-BETRIEBSHANDBUCH.md)
- [Security-Modell](docs/PLUGIN_SECURITY_MODEL.md)
- [UAT-Testpaket](docs/acceptance/UAT_TEST_KIT/README.md)
- [Dokumentenarchiv](docs/archive/README.md)

## Entwicklung

```text
npm ci
npm run test:docs
npm run test:ci
npm run runtime:target -- --target <Ziel> --archive <offizielles-Node-Archiv> --output dist/<Ziel>
npm run build:plugin
npm run test:plugin-zip
```

Der Produktbuild ergänzt eine geprüfte, zielsystemspezifische Node-Runtime; ein
reines Quell-ZIP ist kein Nutzerprodukt. Ein GitHub-synchronisierter privater
Marketplace verweist relativ auf einen self-contained Plugin-Ordner im selben
verbundenen Repository; ein externes HTTPS-Archiv ist dafür kein Ersatz.
Zusätzliche interne Engineering-Artefakte sind keine Nutzer- oder Releasewege. Der manuelle
Workflow `bundled-runtime-release.yml` baut die Windows-/macOS-Artefakte ohne
automatische, kostenverursachende Läufe.

DataSecure ist ein technischer Datenminimierungsbaustein, keine Rechtsberatung,
keine Garantie rechtlicher Anonymität und keine DSGVO-/EU-AI-Act-Zertifizierung.
