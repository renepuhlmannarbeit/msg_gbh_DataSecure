---
name: gbh-datasecure-datenschutz-erklaeren
description: Nutze diesen Skill, um Schutzmaßnahmen und Grenzen von GBH DataSecure, DSGVO- und EU-AI-Act-Aspekte, Audit-Daten, Aufbewahrung oder menschliche Prüfungen verständlich zu erklären.
---

# GBH DataSecure – Datenschutz erklären

Erkläre die Architektur präzise:

- Der lokale MCP-Server bildet die technische Datenschutzgrenze.
- Skills steuern den Ablauf, sind aber selbst keine Datenschutzgrenze.
- Wenn eine Vorverarbeitung vor dem Modell erforderlich ist, gelangen Rohdaten ausschließlich über den lokalen `Input`-Ordner hinein und nicht durch einen direkten Chat-Upload. Bis zu 100 bestätigte TXT-/Markdown-/CSV-/DOCX-Dateien mit zusammen höchstens 500 MB werden an einen lokalen Batch-Snapshot gebunden und danach einzeln verarbeitet. CSV-Zellen werden dabei nie ausgeführt. PDF und alle weiteren Formate bleiben im Pilot gesperrt und dürfen nicht durch einen direkten Upload umgangen werden.
- Claude erhält nur freigegebenes Markdown, wenn die kurzlebige paketgebundene Leseberechtigung desselben Laufs vorliegt. Eine Paket-ID allein reicht nicht; historische Pakete können nicht aufgelistet werden.
- Alle Grafiken und sonstigen Bildpixel bleiben im öffentlichen Pilot lokal. Dieser Engineering-Build bietet keinen Freigabeweg über Claude; Vorschauen verfallen gemäß Aufbewahrungsfrist.
- Der Arbeitsbereich liegt standardmäßig im lokalen App-Datenbereich. Bekannte Cloud-Sync- und Netzwerkpfade werden blockiert; eine benutzerdefinierte Ablage muss die IT zusätzlich prüfen.
- Audit-Daten dürfen keine Rohwerte aus der Quelldatei enthalten.
- Daten in `Processed`, `Output` und Review-Vorschauen unterliegen der konfigurierten Aufbewahrungsfrist. Eine visuelle Freigabe über Claude ist bei jeder Einstellung deaktiviert.
- Ein rein metadatenbasierter Audit-Nachweis bleibt absichtlich außerhalb der Aufbewahrungsfrist und von `purge_local_data` bestehen. Er enthält eine zufällige Vorgangs-ID, Kategorien, Zähler, Versionen und Status, aber keine Dokument-Hashes, exakten Dateigrößen, Pfade, Dateinamen oder Rohwerte.

Verwende genaue Begriffe. Pseudonymisierung oder De-Identifizierung ist nicht automatisch eine rechtliche Anonymisierung. Durch Kontext und Quasi-Identifikatoren kann ein Restrisiko der Re-Identifizierung bleiben.

Trenne bei Beschäftigten- und Bewerberdaten die Datenschutzvorverarbeitung vom späteren KI-Zweck. Recruiting, Beschäftigtenbewertung, Beförderung oder Kündigung, Überwachung und wesentlich bedeutsame Aufgabenzuweisung können eigene Folgen nach EU AI Act, Arbeits- und Datenschutzrecht haben. Behaupte nicht, das Plugin mache solche Nutzungen automatisch rechtskonform.

Stelle das Plugin nicht als nach DSGVO oder EU AI Act zertifiziert dar und gib keine Rechtsgarantie.

Nutze für begriffliche Abgrenzungen [Begriffe](references/begriffe.md) und bei Beschäftigten- oder Bewerberdaten zusätzlich [EU-AI-Act-Governance](references/eu-ai-act-governance.md).
