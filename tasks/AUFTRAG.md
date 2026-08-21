# Abschlussbericht für Claude — Agentenschicht gegen Runtime

**Derzeit kein offener Implementierungsauftrag.** Der Auftrag wurde unter
`tasks/archiv/2026-08-21-a1-a5-agent-runtime-sync.md` archiviert.

## Ergebnis

### A1 — `purge_local_data` ist jetzt angeleitet

`INSTRUCTIONS` und `data-secure-preflight` erklären, wann sofortiges Aufräumen
angeboten wird, dass Scope und Bestätigung ausdrücklich vorliegen müssen und
dass weder Bestätigung noch ein breiterer Scope abgeleitet werden dürfen.

Der Satz aus `docs/ANLEITUNG.md` hat eine wörtliche Gegenstelle: „Lösche alle
lokalen DataSecure-Daten; ich bestätige die Löschung“ autorisiert ausschließlich
`scope=all, confirmed=true`.

### A2 — Aufbewahrung ist Teil der Laufzeitanweisung

Die Agentenschicht nennt jetzt:

- die Frist für Originale in `Processed`, Pakete in `Output` und Review-Previews,
- die Anzeige des Fensters über `privacy_status`,
- die zeitnahe menschliche Bildprüfung,
- die verständliche Einordnung einer abgelaufenen Preview samt Neuverarbeitung,
- `retention_days=0` als vollständige Deaktivierung späterer Bildfreigabe,
- den hashbasierten Audit-Nachweis als bewusst beibehaltene Ausnahme.

Die Hinweise sind im zentralen Preflight und knapp in den betroffenen
Profil-Skills verankert.

### A3 — Compliance-Skill vervollständigt

`data-secure-compliance` beschreibt nun Speicherbegrenzung für `Processed`,
`Output` und Review-Previews sowie die Sonderstellung der inhaltsfreien
Audit-Nachweise außerhalb von Retention und `purge_local_data`.

### A4 — Veraltete Zusagen entfernt

Neben den sieben Skills war auch der Text der vier MCP-Prompts veraltet: Er
behauptete, Review-Items blieben bis zur Freigabe liegen. Prompt, zentrale
Instructions und Profil-Skills sagen jetzt korrekt „bis Freigabe oder Ablauf“.

Kein Skill erfindet ein Reject-Tool. Zurückhalten plus Ablauf wird ausdrücklich
als Ablehnungsweg bezeichnet. Die korrekte Zusage, dass geprüfter OCR-Text eines
zurückgehaltenen Bildes im Markdown erscheinen kann, bleibt erhalten.

### A5 — Drift wird mechanisch verhindert

`tests/test-plugin-structure.js` extrahiert die Toolnamen direkt aus `TOOLS`.
Jedes Tool muss in `INSTRUCTIONS` oder mindestens einem Skill vorkommen; eine
Ausnahme braucht einen im Test hinterlegten, konkreten Grund. Die Tooltabelle
selbst liegt außerhalb des geprüften Textausschnitts und kann ihre eigene
Abdeckung daher nicht vortäuschen.

Ein neuer MCP-Protokollfall verankert zusätzlich Retention, bestätigten Purge,
Audit-Ausnahme, untrusted content, fehlende rechtliche Anonymitätszusage,
Employment-Governance und die Freigabe geprüften OCR-Texts.

## Verifikation

- Version: `3.2.0-rc7`
- `npm test`: **222 Fälle plus Plugin-Strukturcheck**, grün
- Golden-File: unverändert
- `npm run build`: grün
- Plugin-ZIP SHA-256:
  `397390a4e6cfa42188c401977c9a1d7d9b7e356621dada9ae2f6f31d88aaec64`
- MCPB SHA-256:
  `0a697696fec483abf2463546739dfbbb85f24cdb70cb90739beab0f26bda2274`

## Verbleibender Rückstand

- Windows-Abnahme von OCR und EMF/WMF-Rasterisierung
- `LICENSE`-Platzhalter, wartet auf juristische Prüfung
