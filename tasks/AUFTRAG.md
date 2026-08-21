# Aktueller Arbeitsauftrag

Stand des Reviews: `51603a2` "fix(privacy): read the person anchor off the text
and default it safely". Alle Detektor- und Namensthemen aus P1–P5, R1–R3 sind
abgeschlossen; die Suite steht bei 203 Fällen, CI ist grün.

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # Node ist in Bash nicht im PATH
npm test        # 203 Fälle, müssen am Ende alle grün sein
npm run build   # muss durchlaufen
```

---

## R4 — Aufbewahrung und Löschung

**Priorität: hoch.** Der letzte inhaltliche Rückstandspunkt vor dem Pilot, und
der einzige, den man einem Datenschutzwerkzeug im Betrieb direkt vorhält.

### Befund

Es gibt keine zeitbasierte Aufräumlogik. Geprüft am Stand `51603a2`:

- `plugins/data-secure/server/gateway/compliance.js`, `moveProcessed()`:
  verschiebt jedes Originaldokument nach `Processed/`. Nichts entfernt es je.
- `plugins/data-secure/server/gateway/review.js`, `approveReviewAsset()`: setzt
  `approved = true`, die Preview-PNG bleibt in `Needs Visual Review/` liegen.
  Dort landen bei Bewerbungen und Personalprofilen auch Fotos und
  Unterschriften, weil diese Profile Bilder grundsätzlich zurückhalten.
- `plugins/data-secure/server/gateway/orchestrator.js`: räumt ausschließlich
  **gescheiterte** Läufe auf — Staging-Verzeichnis, Review-Verzeichnis des
  Fehlversuchs, Job-Verzeichnis. Erfolgreiche Läufe hinterlassen alles.
- `Output/` und das Audit-Verzeichnis unter `dataRoot()` wachsen unbegrenzt.

Damit legt das Werkzeug auf dem Arbeitsplatz ein unverwaltetes, unverschlüsseltes
Archiv genau der Dokumente an, die es schützen soll. Art. 5 Abs. 1 lit. e DSGVO,
Speicherbegrenzung. Aktuell nur prozedural abgefedert: `docs/ANLEITUNG.md`
Regel 3 verlangt vom Anwender, nach jeder Arbeit selbst zu löschen. Eine
Verhaltensregel ist ein schwacher Ersatz für eine technische Kontrolle.

### Zu tun

**1. Konfigurierbares Aufbewahrungsfenster.**

Neues `user_config`-Feld `retention_days`, Vorgabe `7`. `0` bedeutet: direkt nach
einem erfolgreichen Lauf löschen. Durchreichen in `manifest.json` und in
`plugins/data-secure/.mcp.json` als Umgebungsvariable, analog zu
`EU_PRIVACY_LANGUAGE` und `EU_PRIVACY_VISUAL_MODE`.

**2. Automatisches Aufräumen abgelaufener Einträge.**

Betroffen: `Processed/`, `Output/`, `Needs Visual Review/`. Ausgelöst beim
Serverstart und zusätzlich am Anfang von `anonymizeNext()`, damit ein Rechner,
der wochenlang nur läuft, nicht sammelt.

Bezugszeitpunkt ist die Änderungszeit des Eintrags. Ein Paket in `Output/` gilt
als abgelaufen anhand seines Verzeichnisses, nicht der einzelnen Dateien.

**3. Preview-PNG nach Entscheidung löschen.**

Sobald ein Review-Item freigegeben oder verworfen wurde, ist die lokale
Preview-Kopie überflüssig — das freigegebene PNG liegt dann im Paket. Die
`.review.json` mit `approved`/`approved_at` bleibt als Nachweis, die
Bilddatei geht.

**4. Neues MCP-Tool `purge_local_data`.**

Für den Anwender, der nicht auf den Ablauf warten will. Gleiches
Bestätigungsmuster wie `approve_visual_asset`:
`confirmed: { type: 'boolean', const: true }`, `required: ['confirmed']`,
`annotations: { readOnlyHint: false, openWorldHint: false }`.

Sinnvoll ein Parameter, der den Umfang wählt (`processed`, `output`, `review`,
`all`). Ohne `confirmed: true` wirft das Tool, wie die Bildfreigabe auch.

**Wichtig:** `tests/test-manifest.js` prüft die Deckungsgleichheit zwischen der
`TOOLS`-Tabelle in `plugins/data-secure/server/index.js` und dem `tools`-Array
in `manifest.json`. Beide müssen erweitert werden, sonst schlägt die Suite fehl.

**5. `privacy_status` macht das Verhalten sichtbar.**

Das eingestellte Fenster und die Anzahl der Einträge, die beim nächsten
Aufräumen fällig werden, gehören in die Statusantwort. Sonst ist Löschen Magie,
und ein Anwender, dessen Original verschwunden ist, hat keine Erklärung.

### Entwurfsentscheidungen, die ich vorgebe

Das sind die Punkte, an denen eine naheliegende Umsetzung falsch wäre.

**Der Audit-Nachweis wird nicht mit gelöscht.** Er enthält ausschließlich
Hashes — `source_sha256`, `output_sha256`, `raw_content_logged: false`, keine
Rohwerte, keine Originaldateinamen. Er ist damit das Unbedenklichste im ganzen
Bestand und gleichzeitig der einzige Beleg, was wann verarbeitet wurde. Ihn mit
den Dokumenten zusammen zu löschen wäre der Punkt, an dem eine Prüfung genau
das nicht mehr nachvollziehen kann. Also: eigenes, längeres Fenster oder gar
keins. Wenn konfigurierbar, dann getrennt und mit deutlich höherer Vorgabe.

**Ausstehende Review-Items laufen ebenfalls ab.** Ein Bewerbungsfoto darf nicht
unbegrenzt liegen, nur weil niemand es angesehen hat. Beim Ablauf wird die
Bilddatei gelöscht; das Paketmanifest führt das Asset weiterhin als
`review_required`, das Paket bleibt also gültig und das Asset dauerhaft
zurückgehalten. Das ist die richtige Richtung — im Zweifel kein Bild.
Dokumentieren, damit es nicht als Fehler wirkt.

**Nie ein Verzeichnis anfassen, in das gerade geschrieben wird.**
Staging-Verzeichnisse beginnen mit `.` — die sind tabu, ebenso das gerade
laufende Job-Verzeichnis.

**Ein Fehler beim Löschen darf die Verarbeitung nicht abbrechen.** Aufräumen ist
Nebenarbeit. Eine gesperrte Datei, weil der Explorer sie offen hat, ist der
Normalfall unter Windows. Fangen, weitermachen, im Status vermerken.

**Testbarkeit.** Die Tests dürfen nicht warten. Das Aufräumen muss einen
injizierbaren Zeitbezug haben, im Stil des bestehenden `deps`-Parameters von
`anonymizeNext(profile, deps)`. Alternativ die Änderungszeit der Testdateien
zurückdatieren. Ein Test, der `sleep` benutzt, ist keiner.

### Tests

- Ein abgelaufener Eintrag in `Processed/`, `Output/` und
  `Needs Visual Review/` wird entfernt, ein nicht abgelaufener bleibt.
- Ein Staging-Verzeichnis (Name beginnt mit `.`) wird nie angefasst.
- Der Audit-Bestand bleibt, wenn Dokumente ablaufen.
- Die Preview-PNG ist nach der Freigabe verschwunden, die `.review.json` mit
  `approved: true` ist noch da, und das freigegebene Asset im Paket ist lesbar.
- `retention_days = 0` löscht direkt nach einem erfolgreichen Lauf, das Paket
  bleibt lesbar, bis es abläuft.
- `purge_local_data` ohne `confirmed: true` wirft; mit `confirmed: true` räumt
  es den gewählten Umfang und lässt die anderen Bereiche unberührt.
- Ein nicht löschbarer Eintrag — etwa durch einen simulierten Fehler im
  Löschaufruf — bricht `anonymizeNext()` nicht ab.
- `privacy_status` nennt das Fenster und die fälligen Einträge.
- In `tests/test-mcp-protocol.js`: das neue Tool erscheint in `tools/list`, hat
  `additionalProperties: false`, `openWorldHint: false` und das
  `const: true`-Muster bei `confirmed`.

### Doku

- `docs/PLUGIN_SECURITY_MODEL.md`: den Abschnitt „Known gap: nothing is ever
  deleted" ersetzen durch die Beschreibung des tatsächlichen Verhaltens, samt
  der Sonderstellung des Audit-Nachweises und der Begründung, warum ausstehende
  Review-Items ablaufen.
- `docs/ANLEITUNG.md`: **Regel 3 umschreiben, nicht löschen.** Sie sagt heute
  „DataSecure löscht nichts von allein" — das wird falsch. Neu: was nach wie
  vielen Tagen automatisch verschwindet, wie man sofort aufräumt, und was der
  Anwender weiterhin selbst entscheiden muss. Teil 6 (die vier Ordner) und
  Teil 7 Schritt 5 entsprechend anpassen.
- `docs/RELEASE.md`: das Aufbewahrungsfenster in die Windows-Abnahme aufnehmen.
- `docs/TESTING.md` und die Fallzahl im README.
- In `tasks/AUFTRAG.md` den Rückstandspunkt „Aufbewahrung und Löschung"
  entfernen, sobald er erledigt ist.

---

## Nicht Teil dieses Auftrags

- **Windows-Abnahme.** OCR gegen ein echtes Scan-Dokument und
  EMF/WMF-Rasterisierung lassen sich in CI nicht prüfen. Checkliste in
  `docs/RELEASE.md`.
- **`LICENSE`.** Platzhalter, wartet auf die juristische Prüfung.
- Verschlüsselung der lokalen Ordner. Eigenes Thema, hier nicht anfangen.

## Abnahmekriterien

- [ ] `npm test` grün, Fallzahl ≥ 203 plus die neuen Fälle
- [ ] `tests/expected/synthetic-personnel-profile.expected.md` unverändert
- [ ] `npm run build` läuft durch, beide Artefakte entstehen
- [ ] `retention_days` in `manifest.json` und `.mcp.json` verdrahtet
- [ ] `manifest.json` führt 12 Tools, `TOOLS` in `index.js` ebenso, Parität grün
- [ ] Audit-Bestand überlebt den Ablauf der Dokumente
- [ ] Staging-Verzeichnisse werden nie gelöscht
- [ ] Ein Fehler beim Löschen bricht die Verarbeitung nicht ab
- [ ] Kein Test wartet auf Echtzeit
- [ ] `npm run version:sync -- 3.2.0-rc4` ausgeführt — neues Tool und neue
      Konfiguration sind eine Funktionsänderung
- [ ] `docs/ANLEITUNG.md` Regel 3 beschreibt das neue Verhalten
- [ ] Commit-Body benennt Finding, Ursache und Absicherung
