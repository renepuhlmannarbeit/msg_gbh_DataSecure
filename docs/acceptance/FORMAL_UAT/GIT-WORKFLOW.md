# Gemeinsamer Git-Ablauf für zwei Tester

Beide Personen verwenden dasselbe Repository, arbeiten aber nicht direkt auf
`main` und nicht in derselben Evidenzdatei.

## Gemeinsamer Start

Die Release-Koordination nennt eine Kampagnenkennung, zum Beispiel
`rc125-uat1`, und einen vollständigen Kandidaten-Commit. Beide Tester prüfen:

```text
git switch main
git pull --ff-only
git rev-parse HEAD
git status --short
```

`HEAD` muss exakt dem Kampagnenmanifest entsprechen; `git status --short` muss
leer sein.

## Windows-Person

```text
git switch -c uat/windows-rc125-uat1
```

Nur `WINDOWS-EVIDENCE.csv` und bei Bedarf eine inhaltsfreie Defectnotiz ändern,
committen und den Plattformbranch pushen. Keine Produktdateien ändern.

## Mac-Person

```text
git switch -c uat/macos-rc125-uat1
```

Nur `MACOS-EVIDENCE.csv` und bei Bedarf eine inhaltsfreie Defectnotiz ändern,
committen und den Plattformbranch pushen. Architektur vorher mit `uname -m`
feststellen und im Protokoll eintragen.

## Zusammenführen

Die Release-Koordination prüft beide Branches, übernimmt ausschließlich die
Evidenzdateien und füllt danach die Freigabeentscheidung aus. Ein Product-Fix
wird nie in einen UAT-Branch gemischt. Er erzeugt auf `main` einen neuen
Kandidaten; die neue Kampagne startet wieder von dessen vollständigem Commit.

Dieses Branchmodell folgt dem Shared-Repository-Prinzip: getrennte Branches und
Review vor der Übernahme schützen `main` und vermeiden Schreibkonflikte.
