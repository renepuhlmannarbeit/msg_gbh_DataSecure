# Synthetische Testdaten erzeugen

Alle Namen, Firmen, Konten und Kontakte sind erfunden und tragen die Domain
`.test`. Die Dateien sind absichtlich klein; für den 500-MB-Grenztest gibt es einen
separaten optionalen Erzeugungsschritt.

Im Wurzelordner des Repositorys ausführen:

```powershell
C:\Users\arkud\.codex\plugins\cache\openai-primary-runtime\dependencies\python\python.exe docs\acceptance\RC30_HUMAN_TEST_KIT\tools\generate_synthetic_acceptance_data.py
```

Danach liegt alles unter `test-data/generated`:

- `01-positive`: ein fachlich gleichwertiger Testfall als TXT, Markdown, CSV und DOCX.
- `02-review`: DOCX mit einer eingebetteten, eindeutig synthetischen Grafik sowie ein
  mehrdeutiger Zertifikats-/Organisationsfall.
- `03-blocked`: syntaktisch echte PDF-, XLSX-, PPTX- und PNG-Gegenproben. Sie müssen
  im aktuellen Build sicher stoppen, nicht verarbeitet werden.
- `04-batch-100`: genau 100 kleine TXT-Dateien mit variierter PII und fachlichem Inhalt.

Für den optionalen Größen-/Vorprüftest (erzeugt ungefähr 500 MB, nicht versionieren):

```powershell
C:\Users\arkud\.codex\plugins\cache\openai-primary-runtime\dependencies\python\python.exe docs\acceptance\RC30_HUMAN_TEST_KIT\tools\generate_synthetic_acceptance_data.py --with-500mb-batch
```

Die erzeugten Daten nach der Abnahme mit `purge_local_data` oder durch Löschen des
lokalen Testordners entfernen. Nicht an Claude anhängen.
