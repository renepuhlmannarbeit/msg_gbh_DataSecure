# Aktueller Arbeitsauftrag für Codex — Agentenschicht gegen Runtime abgleichen

Andere Art von Auftrag als die letzten. Kein Randfall-Review, sondern ein
Konsistenzabgleich: **stimmt die Anweisung noch mit dem Verhalten überein?**

## Warum

Vier Versionen lang haben wir die Runtime gehärtet — Detektoren, Parser,
Publish-Ablauf, Aufbewahrung. Die Schicht, die Claude sagt, *wie* sie das
benutzen soll, ist dabei unangetastet geblieben.

Gemessen am Stand `2f627f2`:

```
alle 7 SKILL.md seit rc2:   4 Commits, davon 0 inhaltliche Zeilen (nur version:)
MCP-instructions:           erwähnt Aufbewahrung/Ablauf mit 0 Treffern
Skills:                     erwähnen purge_local_data oder Fristen in 0 von 7
```

Die Runtime hat 12 Tools. Die Anweisung an Claude stammt inhaltlich von 11.

Das ist dasselbe Fehlermuster, das diese Runde dreimal produziert hat — eine
Zusage, die das Verhalten nicht mehr deckt — nur in der einzigen Schicht, die wir
nie angesehen haben. Und die Prüfung dort ist dünn:
`tests/test-plugin-structure.js` prüft am Skill-Inhalt genau drei Regexe
(Zeilen 43–45), `tests/test-mcp-protocol.js` prüft die `instructions` inhaltlich
gar nicht.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm test        # 221 Fälle, grün
npm run build
```

---

## A1 — `purge_local_data` ist in der Agentenschicht nicht existent

**Ort:** `plugins/data-secure/server/index.js`, `INSTRUCTIONS` (7 Sätze), und
alle sieben `plugins/data-secure/skills/*/SKILL.md`.

Das Tool steht in `tools/list`, Claude kann es also finden. Aber nichts sagt ihr,
**wann** sie es anbieten soll und dass eine ausdrückliche Bestätigung nötig ist.
Für die Bildfreigabe steht genau das drin („Do not approve a visual unless the
user explicitly confirms…"), für das Löschen nichts.

**Konkret unangenehm:** `docs/ANLEITUNG.md` Zeile 58 sagt dem Anwender wörtlich,
er solle *„Lösche alle lokalen DataSecure-Daten; ich bestätige die Löschung"*
schreiben. Diese Anweisung an den Menschen hat auf der Agentenseite keine
Gegenstelle. Das ist meine Anleitung — der Fehler liegt bei mir, aber die Lücke
ist beidseitig zu schließen: Anweisung ergänzen, und prüfen, ob der Satz aus der
Anleitung dann tatsächlich zum richtigen Tool mit `confirmed: true` führt.

Bei einem destruktiven Tool darauf zu bauen, dass das Modell die
Bestätigungspflicht aus dem Schema erschließt, ist zu dünn.

## A2 — Aufbewahrung und Ablauf fehlen in Anweisung und Skills

**Ort:** dieselben Dateien; Ablaufverhalten seit `908600c` in
`docs/PLUGIN_SECURITY_MODEL.md` beschrieben.

Folgen, jede einzeln prüfbar:

- `data-secure-preflight`, Workflow-Schritt 6, sagt nur „If visuals are held for
  review, use `list_visual_review_items`". Kein Hinweis, dass die Preview
  abläuft. Claude wird dem Anwender also nicht sagen, dass er zeitnah hinsehen
  soll — obwohl genau das jetzt nötig ist.
- `approveReviewAsset()` kann seit rc5 mit einer Aufbewahrungsmeldung
  fehlschlagen. Nichts bereitet Claude darauf vor, das einzuordnen.
  `docs/ANLEITUNG.md` Zeile 47 verspricht dem Anwender aber: „Claude nennt Ihnen
  dann ausdrücklich die abgelaufene Frist als Grund." Eine Verhaltenszusage ohne
  Anweisung dahinter.
- Nichts sagt Claude, dass das Original nach der Verarbeitung in `Processed`
  liegt und dort nach der Frist verschwindet. Sie kann einem Anwender also
  zusichern, sein Original sei „sicher in Processed" — unbefristet.
- `retention_days = 0` deaktiviert die Bildfreigabe vollständig. Steht in drei
  Dokumenten, in keiner Anweisung.

## A3 — `data-secure-compliance` kennt die neueste Schutzmaßnahme nicht

**Ort:** `plugins/data-secure/skills/data-secure-compliance/SKILL.md`, 22 Zeilen.

Das ist der Skill, der die Schutzmaßnahmen erklären soll. Die Aufbewahrungsfrist
ist eine DSGVO-relevante Maßnahme — Art. 5 Abs. 1 lit. e, Speicherbegrenzung —
und war der Grund für die ganze R4-Runde. Sie kommt dort nicht vor. Ebenso
fehlt, dass der Audit-Nachweis absichtlich außerhalb von Aufbewahrung und Purge
liegt, obwohl das eine bewusste Compliance-Entscheidung ist.

## A4 — Zusagen prüfen, die es nicht mehr gibt oder nie gab

Suche in allen sieben Skills und in `INSTRUCTIONS` nach dem umgekehrten Fall:
etwas, das zugesagt wird, aber nicht existiert. Bekannte Kandidaten aus dem
Sicherheitsmodell:

- Es gibt **kein** Tool zum ausdrücklichen Verwerfen einer Grafik.
  Zurückhalten plus Ablauf ist der Ablehnungsweg. Wird Claude irgendwo so
  angeleitet, dass sie ein solches Tool erfindet oder dem Anwender eine
  Ablehnung anbietet, die es nicht gibt?
- Der OCR-Text zurückgehaltener Grafiken **wird** freigegeben, nach Textprüfung.
  `INSTRUCTIONS` Satz 4 sagt das korrekt. Prüfe, ob ein Skill dem widerspricht.

## A5 — Die Prüfung mechanisch machen, nicht per Regex-Stichprobe

Der Grund, warum diese Schicht vier Versionen zurückfallen konnte, ist die
fehlende Absicherung. Ein Test, der drei Textstellen prüft, fängt Drift nicht.

**Verlangt:** ein Test, der die Kopplung erzwingt statt sie zu beschreiben. Für
jedes Tool in `TOOLS` muss gelten, dass es entweder in `INSTRUCTIONS` oder in
mindestens einem Skill vorkommt — oder in einer im Test hinterlegten,
begründeten Ausnahmeliste steht. Ein neues Tool ohne Anweisung soll die Suite rot
machen, nicht unbemerkt durchgehen.

Zusätzlich sinnvoll: `tests/test-mcp-protocol.js` prüft die `instructions`
bisher inhaltlich nicht. Mindestens die Kernaussagen — untrusted data, keine
rechtliche Anonymität, kein automatisches Ranking — gehören dort verankert,
damit sie niemand versehentlich herauskürzt.

---

## Fehlerrichtung

Hier gilt nicht „im Zweifel mehr schwärzen", sondern: **im Zweifel weniger
zusagen.** Eine Anweisung, die ein Verhalten behauptet, das die Runtime nicht
liefert, ist schlimmer als eine, die schweigt — der Anwender richtet sich danach.
Wo Anweisung und Verhalten auseinanderliegen, ist die Runtime die Wahrheit; die
Anweisung wird angepasst, nicht umgekehrt.

Und: die Skills sind kurz. Das ist eine Qualität, kein Mangel. Sie sollen nicht
zur Dokumentation anwachsen — was Claude zur Laufzeit nicht braucht, gehört nach
`docs/`.

## Nicht Teil dieses Auftrags

- Windows-Abnahme von OCR und EMF/WMF-Rasterisierung
- `LICENSE` — Platzhalter, wartet auf juristische Prüfung
- Verschlüsselung der lokalen Ordner — offene Entscheidung für IT und
  Datenschutz, kein Auftrag an ein Modell
- neue PII-Detektoren, Änderungen am Golden-Output
- neue Tools oder neue Runtime-Funktionen. Dieser Auftrag gleicht ab, er
  erweitert nicht. Sollte der Abgleich zeigen, dass eine Funktion fehlt, melden
  statt bauen.

## Abnahmekriterien

- [ ] `npm test` grün, Fallzahl ≥ 221 plus die neuen Fälle
- [ ] `tests/expected/synthetic-personnel-profile.expected.md` unverändert
- [ ] `npm run build` läuft durch
- [ ] `purge_local_data` ist in `INSTRUCTIONS` mit Bestätigungspflicht verankert
- [ ] Ablauf von Previews, Frist für `Processed` und die Wirkung von
      `retention_days = 0` sind in der Agentenschicht abgebildet
- [ ] `data-secure-compliance` nennt Aufbewahrung und die Sonderstellung des
      Audit-Nachweises
- [ ] Der Satz aus `docs/ANLEITUNG.md` Zeile 58 hat eine Gegenstelle; falls die
      Formulierung der Anleitung ungeeignet ist, Anleitung ändern und im
      Commit-Body begründen
- [ ] Kein Skill sagt etwas zu, was die Runtime nicht liefert
- [ ] Neuer Test erzwingt: jedes Tool ist angeleitet oder begründet ausgenommen
- [ ] `instructions`-Kernaussagen im MCP-Test verankert
- [ ] Skills bleiben kurz; kein Skill wächst über das hinaus, was zur Laufzeit
      gebraucht wird
- [ ] Commit-Body benennt jede Abweichung, ihre Ursache und die Absicherung
