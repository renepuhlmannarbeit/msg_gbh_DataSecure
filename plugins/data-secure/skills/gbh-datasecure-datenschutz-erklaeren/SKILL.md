---
name: gbh-datasecure-datenschutz-erklaeren
description: Nutze diesen Skill, um Schutzmaßnahmen und Grenzen von GBH DataSecure, DSGVO- und EU-AI-Act-Aspekte, Audit-Daten, Aufbewahrung oder menschliche Prüfungen verständlich zu erklären.
version: 3.2.0-rc27
---

# GBH DataSecure – Datenschutz erklären

Erkläre die Architektur präzise:

- Der lokale MCP-Server bildet die technische Datenschutzgrenze.
- Skills steuern den Ablauf, sind aber selbst keine Datenschutzgrenze.
- Wenn eine Vorverarbeitung vor dem Modell erforderlich ist, gelangen Rohdaten über den lokalen DataSecure-Dateidialog oder den lokalen `Input`-Ordner hinein und nicht durch einen direkten Chat-Upload. Bis zu 25 TXT-/DOCX-Dateien nutzen gemeinsam den Dialog; andere freigegebene Formate oder formatgemischte Stapel verwenden den Ordnerweg. PDF bleibt bis zum vollständigen Coverage-Nachweis gesperrt und darf nicht durch einen direkten Upload umgangen werden.
- Claude erhält nur freigegebenes Markdown und freigegebene PNG-Dateien aus dem Datenschutzpaket.
- Nicht automatisch verifizierbare Grafiken bleiben lokal. Dieser Engineering-Build bietet keinen Freigabeweg über Claude; Vorschauen verfallen gemäß Aufbewahrungsfrist.
- Audit-Daten dürfen keine Rohwerte aus der Quelldatei enthalten.
- Daten in `Processed`, `Output` und Review-Vorschauen unterliegen der konfigurierten Aufbewahrungsfrist. Eine visuelle Freigabe über Claude ist bei jeder Einstellung deaktiviert.
- Ein rein metadatenbasierter Audit-Nachweis bleibt absichtlich außerhalb der Aufbewahrungsfrist und von `purge_local_data` bestehen. Er enthält eine zufällige Vorgangs-ID, Kategorien, Zähler, Versionen und Status, aber keine Dokument-Hashes, exakten Dateigrößen, Pfade, Dateinamen oder Rohwerte.

Verwende genaue Begriffe. Pseudonymisierung oder De-Identifizierung ist nicht automatisch eine rechtliche Anonymisierung. Durch Kontext und Quasi-Identifikatoren kann ein Restrisiko der Re-Identifizierung bleiben.

Trenne bei Beschäftigten- und Bewerberdaten die Datenschutzvorverarbeitung vom späteren KI-Zweck. Recruiting, Beschäftigtenbewertung, Beförderung oder Kündigung, Überwachung und wesentlich bedeutsame Aufgabenzuweisung können eigene Folgen nach EU AI Act, Arbeits- und Datenschutzrecht haben. Behaupte nicht, das Plugin mache solche Nutzungen automatisch rechtskonform.

Stelle das Plugin nicht als nach DSGVO oder EU AI Act zertifiziert dar und gib keine Rechtsgarantie.

Nutze für begriffliche Abgrenzungen [Begriffe](references/begriffe.md) und bei Beschäftigten- oder Bewerberdaten zusätzlich [EU-AI-Act-Governance](references/eu-ai-act-governance.md).
