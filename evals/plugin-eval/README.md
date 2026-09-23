# Claude-Plugin-Evaluation

Stand: 23.09.2026 · lokale Claude CLI 2.1.280 · kein Modelllauf ausgeführt

`cases-draft.json` ist die eigenständige, ausschließlich synthetische
Fallspezifikation für Sicherheits-, Struktur-, Format- und UX-Verträge. Sie hängt
nicht mehr von einem historischen RC37-Auftrag ab und ist noch kein ausführbares
Anthropic-Evalformat.

Kostenfreie lokale Probe dieses Reviews:

```text
claude plugin eval --help
claude --version
```

Am 01.09.2026 stoppte `init --bare` mit `plugin eval is currently in early access`.
Das ist eine historische Beobachtung, kein heute pauschal gültiger Blocker.
Die [aktuelle Herstellerdokumentation](https://code.claude.com/docs/en/plugin-evals)
beschreibt den Fall-/Gradervertrag und nennt mindestens 2.1.269. Nach dem
offiziellen Update auf 2.1.280 besteht auch der lokale Plugin-Pilotvorcheck.
Die CLI ist nicht angemeldet; die Desktop-Anmeldung ist separat zu prüfen.
Hilfe allein beweist keine Ausführbarkeit.

**Verbindliche Kostenentscheidung:** nur das bestehende Claude-Abo mit
enthaltener Nutzung; keine API-Tokenkosten, Usage Credits oder Extra Usage.
Ein sichtbarer Pilot im lokalen Code-Reiter von Claude Desktop ist vorgesehen;
CLI und Desktop müssen ihre tatsächliche Ladequelle und Berechtigungen jeweils
belegen. Vor jedem Modelllauf den Abrechnungsweg prüfen, sonst nicht starten.

Nächster Schritt gemäß BL-041.20:

1. Geeignete CLI-Version und tatsächlich installierte Pluginquelle prüfen;
   keinen kostenpflichtigen `init`-/Eval-Aufruf allein als Erreichbarkeitsprobe nutzen.
2. `cases-draft.json` gegen den dokumentierten Vertrag übertragen und prüfen;
   Tool-/Status-Grader gegenüber bloßer freier Modellbewertung bevorzugen.
3. Erst nach Nachweis der reinen enthaltenen Abonutzung einen einzelnen
   synthetischen Fall durchführen. Automatisierte Plugin-Evals bleiben bis dahin
   NOT_RUN; `--max-cost-usd` ist nur eine geschätzte Verbrauchsschwelle und kein
   Schutz vor zusätzlicher Abrechnung. Kein API-Ausweichweg bei Abo-Limits.
   Für einen später zulässigen Eval `--no-publish --runs 1 --ablation none`
   verwenden; keine weiteren Wiederholungen oder Modellgrader ungeprüft starten.
4. Für tatsächliche MCP-Ausführung explizit `--mocks off` und eng begrenzte
   `--allow-tools` setzen. Die Voreinstellung `record` ist kein Beweis für die
   echte Runtime. Native Picker/Review nicht unbeaufsichtigt als automatisiert
   bestanden einstufen. Erlaubte GUI- und Fehlereinspritzungsgrenzen benennen.
5. Erst danach Wiederholungs-/With-Without-Läufe gegen gebundene Kandidaten;
   Ergebnisse inhaltsfrei dokumentieren, Rohtraces lokal und ignoriert halten.

Ein Plugin-Eval ist E0-Evidenz. Es ersetzt weder Fresh Install, Cowork-
Berechtigungen, lokalen Picker/Review, UX/Accessibility noch Datenschutz-/
Fachabnahme.
