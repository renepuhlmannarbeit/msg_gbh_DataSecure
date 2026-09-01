# Claude-Plugin-Evaluation

Stand: 01.09.2026 · lokale Claude CLI 2.1.233

`cases-draft.json` ist die eigenständige, ausschließlich synthetische
Fallspezifikation für Sicherheits-, Struktur-, Format- und UX-Verträge. Sie hängt
nicht mehr von einem historischen RC37-Auftrag ab und ist noch kein ausführbares
Anthropic-Evalformat.

Aktuelle Probe:

```text
claude plugin eval --help
claude plugin eval init --bare datasecure-smoke
```

Die CLI kennt den Befehl und das dokumentierte Schema, der zweite Aufruf stoppt am
01.09.2026 jedoch mit `plugin eval is currently in early access`. Deshalb wird
kein Dateiformat erfunden und kein kostenpflichtiger Lauf gestartet.

Sobald der Organisationszugriff verfügbar ist:

1. `init --bare` in einem Wegwerfverzeichnis ausführen und Schema prüfen.
2. `cases-draft.json` mechanisch in dieses Schema übersetzen.
3. Zuerst einen kleinen `--no-publish --runs 1`-Smoke mit festem Kostenlimit.
4. Danach With/Without-Lauf gegen Quellplugin und gebautes Plugin-ZIP.
5. Ergebnisse inhaltsfrei dokumentieren; Rohtraces lokal und ignoriert halten.

Ein Plugin-Eval ist E0-Evidenz. Es ersetzt weder Fresh Install, Cowork-
Berechtigungen, lokalen Picker/Review, UX/Accessibility noch Datenschutz-/
Fachabnahme.
