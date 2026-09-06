# GBH DataSecure – Claude-Plugin

Version 3.2.0-rc109. Das Plugin de-identifiziert TXT, Markdown, CSV und DOCX lokal
und übergibt nur freigegebenes Markdown an Claude. XLSX, PPTX, PDF, Scan-PDF und
eigenständige Bilder bleiben sicher gesperrt.

## Nutzung

1. In einer lokalen Cowork-Sitzung eines bestehenden Claude-Desktop-Deployments
   „Dateien anonymisieren“ schreiben oder den Skill wählen. Cloud-Cowork führt
   lokale Plugin-MCPs nicht aus und ist deshalb kein Originaleingang.
2. Dateien im lokalen Mehrfachpicker wählen und einmal öffnen.
3. Lokalen Abschluss abwarten; Ergebnisse erst später ausdrücklich anfordern.

Originale nie als Chat-Anhang hochladen. Quellen werden nur gelesen, niemals
automatisch verändert oder gelöscht. Bildpixel bleiben lokal; es gibt keinen
auswählbaren Bildmodus. Nur temporäre Arbeits-/Reviewdaten unterliegen 0–14 Tagen;
fertige Exporte bleiben erhalten.

Der Privacy-Ordner ist ein lokaler App-Datenordner. Cloud-Sync, Netzwerkpfade und
Links sind gesperrt. Arbeits-/Reviewkopien sind lokale Plain-Dateien ohne
Schlüsselbund oder Passwort.

Claude Desktop/Cowork benötigt Internet; die DataSecure-Runtime selbst hat keinen
eigenen Netzwerkzugriff. DOCX mit verbundenen Tabellenzellen (`w:gridSpan` oder
`w:vMerge`) stoppt derzeit vollständig und ohne Teilresultat. Der optionale
Claude-Berechtigungsmodus Auto kann Rückfragen reduzieren, sofern keine
Organisationsrichtlinie sie erzwingt; Skip ist für sensible Dateien kein Standard.

Dieses Plugin ist keine Rechtsberatung, keine Garantie rechtlicher Anonymität und
keine DSGVO-/EU-AI-Act-Zertifizierung.
