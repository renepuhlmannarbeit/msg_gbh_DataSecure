# DataSecure RC63 - UAT-Testpaket

> **Historischer UAT-Stand.** Nicht als aktuelle Anleitung verwenden. Der aktuelle
> Einstieg ist das [versionneutrale UAT-Kit](../UAT_TEST_KIT/README.md).

Dieses Paket enthält ausschließlich synthetische Daten. Es prüft den mit RC63
eingeführten Claude-Cowork-Vertrag gegen den jeweils aktuell gebauten DataSecure-
Stand. Echte Personal-, Kunden- oder
Vertragsdaten dürfen für diese Abnahme nicht verwendet und niemals per
Büroklammer in den Chat hochgeladen werden.

## Inhalt

- `STEP-BY-STEP.md`: vollständige Durchführung in sechs aufeinander aufbauenden Läufen.
- `EXPECTED_RESULTS.csv`: erwartetes Verhalten je Lauf und Eingangsdatei.
- `EVIDENCE_LOG.csv`: leere, inhaltsfreie Vorlage für die Abnahmeevidenz.
- `inputs/01-positive`: derselbe synthetische Mitarbeiterfall als TXT, Markdown,
  CSV und DOCX.
- `inputs/02-review`: ein DOCX mit synthetischem Bild und ein mehrdeutiger
  Zertifikatsanbieter.
- `inputs/03-blocked`: verpflichtende sichere Stopps für noch nicht freigegebene
  oder beschädigte Formate.
- `inputs/04-batch-100`: genau 100 kleine TXT-Dateien für Serienlauf und
  Unterbrechungs-/Fortsetzungstest.

Die `inputs` sind absichtlich kein Git-Artefakt. Sie werden lokal reproduzierbar
aus dem eingecheckten Generator erzeugt.

## Testdaten einmalig erzeugen

Voraussetzungen sind Node.js gemäß `package.json`, Python 3 und die exakt
gepinnten Entwicklungsabhängigkeiten. Diese Vorbereitung verarbeitet keine
Produktivdaten und ist kein Bestandteil des installierten Plugins.

Führe im Repository-Stamm genau diese Befehle in der angegebenen Reihenfolge aus:

```text
npm run fixtures
python -m pip install -r docs/acceptance/RC30_HUMAN_TEST_KIT/tools/requirements.txt
python docs/acceptance/RC30_HUMAN_TEST_KIT/tools/generate_synthetic_acceptance_data.py --out docs/acceptance/RC63_UAT_TEST_KIT/inputs
```

Der letzte Befehl erzeugt exakt 111 Dateien unter den vier oben genannten
Verzeichnissen und prüft die Ausgabe gegen
`RC30_HUMAN_TEST_KIT/tools/fixture-layout.json`. `--out` bezeichnet ein
dediziertes Generatorziel; ein vorhandenes Ziel wird vollständig neu erzeugt.
Wenn dein Python-Befehl anders heißt, ersetze ausschließlich das Wort `python`.

## Wichtigster Normalweg

1. Neue Cowork-Aufgabe öffnen.
2. `Dateien anonymisieren.` schreiben oder den DataSecure-Skill auswählen.
3. Dateien ausschließlich im lokalen Mehrfach-Dateidialog auswählen und einmal
   `Öffnen` klicken.

DataSecure selbst darf im Normalweg keinen zweiten Dateidialog, keine Profilfrage,
keine Einzeldateibestätigung und keine Ergebnislesebestätigung verlangen. Eine
Claude-seitige Werkzeugberechtigung ist Host-Verhalten und wird separat notiert.

## Harte Abbruchkriterien

Der UAT-Lauf ist sofort `FAIL`, wenn Originaltext, Originaldateiname, Quellpfad,
Paket-ID, Token oder Capability im Chat erscheint, eine Originaldatei verändert
oder gelöscht wird oder ein sicher gestopptes Dokument ein Teilresultat erhält.

Bewusst gesperrte Formate erhalten `PASS`, wenn sie sicher gestoppt werden. Sie
erhalten niemals `PASS`, wenn Claude ihren Inhalt verarbeitet.
