---
name: gbh-datasecure-datenschutz-erklaeren
description: Nutze diesen Skill, um Schutzmaßnahmen und Grenzen von GBH DataSecure, DSGVO- und EU-AI-Act-Aspekte, Audit-Daten, Aufbewahrung oder menschliche Prüfungen verständlich zu erklären.
---

# GBH DataSecure – Datenschutz erklären

Erkläre die Architektur präzise:

- Der lokale MCP-Server bildet die technische Datenschutzgrenze.
- Skills steuern den Ablauf, sind aber selbst keine Datenschutzgrenze.
- Wenn eine Vorverarbeitung vor dem Modell erforderlich ist, gelangen Rohdaten ausschließlich über den lokalen Betriebssystem-Mehrfachpicker hinein und nie durch einen Chat-Upload oder technischen Eingangsordner. Bis zu 100 im Picker bestätigte TXT-/Markdown-/CSV-/DOCX-Dateien mit zusammen höchstens 500 MiB werden an einen lokalen Batch-Snapshot gebunden und danach einzeln verarbeitet. Sichere Einzelgrenzen sind TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes und DOCX 64 MiB komprimiert/128 MiB entpackt; eine feste Seitenbegrenzung gibt es nicht. CSV-Zellen werden nie ausgeführt. PDF und alle weiteren Formate bleiben im Pilot gesperrt und dürfen nicht durch einen direkten Upload umgangen werden.
- Der Schutzpfad setzt eine lokale Cowork-Sitzung der Claude-Desktop-App oder Claude Code mit tatsächlich verbundenem lokalem `data-secure-local` voraus. Lokale Plugin-MCPs laufen nicht in Cloud-Cowork. Deshalb dürfen Desktop-Cloud-, Web-, Mobil- und geplante Sitzungen keine Originale annehmen; sie dürfen nur bereits lokal freigegebene Ergebnisse verwenden.
- Nach einem normalen Start endet die Cowork-Aufgabe ohne Lesen oder Polling. Erst ein neuer ausdrücklicher Auswertungsauftrag nach lokalem Abschluss startet die tokenfreie Ergebnisübergabe. Die lokale Runtime prüft und verwaltet dafür paketgebundene Leseberechtigungen; Claude erhält keine Paket-IDs, Tokens oder Cursor. Beliebige historische Pakete können nicht aufgelistet werden; zulässige abgeschlossene lokale Stapel werden ausschließlich lokal ausgewählt.
- Alle Grafiken und sonstigen Bildpixel bleiben im öffentlichen Pilot lokal. Dieser Engineering-Build bietet keinen Freigabeweg über Claude; Vorschauen verfallen gemäß Aufbewahrungsfrist.
- Der Arbeitsbereich liegt standardmäßig im lokalen App-Datenbereich. Bekannte Cloud-Sync- und Netzwerkpfade werden blockiert; eine benutzerdefinierte Ablage muss die IT zusätzlich prüfen.
- Audit-Daten dürfen keine Rohwerte aus der Quelldatei enthalten.
- Review-Vorschauen unterliegen der konfigurierten Aufbewahrungsfrist. `Output` bleibt dauerhaft und ist nur ausdrücklich bestätigt löschbar. Historische Einträge in `Processed` können Originale sein und werden weder durch Aufbewahrung noch `purge_local_data` gelöscht; ein Gesamt-Purge stoppt dort bei Bestand oder unvollständiger Inspektion vor jeder Teilmutation. Eine visuelle Freigabe über Claude ist bei jeder Einstellung deaktiviert.
- Ein rein metadatenbasierter Audit-Nachweis bleibt absichtlich außerhalb der Aufbewahrungsfrist und von `purge_local_data` bestehen. Er enthält eine zufällige Vorgangs-ID, Kategorien, Zähler, Versionen und Status, aber keine Dokument-Hashes, exakten Dateigrößen, Pfade, Dateinamen oder Rohwerte.

Verwende genaue Begriffe. Pseudonymisierung oder De-Identifizierung ist nicht automatisch eine rechtliche Anonymisierung. Durch Kontext und Quasi-Identifikatoren kann ein Restrisiko der Re-Identifizierung bleiben.

Trenne bei Beschäftigten- und Bewerberdaten die Datenschutzvorverarbeitung vom späteren KI-Zweck. Recruiting, Beschäftigtenbewertung, Beförderung oder Kündigung, Überwachung und wesentlich bedeutsame Aufgabenzuweisung können eigene Folgen nach EU AI Act, Arbeits- und Datenschutzrecht haben. Behaupte nicht, das Plugin mache solche Nutzungen automatisch rechtskonform.

Stelle das Plugin nicht als nach DSGVO oder EU AI Act zertifiziert dar und gib keine Rechtsgarantie.

Eine Desktop-App ist kein Nachweis lokaler Cowork-Ausführung: Cloud-Cowork ist auch auf Desktop möglich, startet dort aber keinen lokalen Plugin-MCP. Die DataSecure-Freigabegrenze bleibt die lokale Sitzung mit verbundenem MCP und Betriebssystempicker. Diagnose- und Löschwerkzeuge sind nur im separat aktivierten IT-Supportmodus verfügbar; ihre Abwesenheit im Normalmodus ist kein Connectorfehler.

Nutze für begriffliche Abgrenzungen [Begriffe](references/begriffe.md) und bei Beschäftigten- oder Bewerberdaten zusätzlich [EU-AI-Act-Governance](references/eu-ai-act-governance.md).
