# Gemeinsamer Git-Ablauf für zwei Tester

Beide Personen verwenden dasselbe Repository, arbeiten aber nicht direkt auf
`main` und nicht in derselben Evidenzdatei. Produkt-Commit, Kampagnen-Commit und
Evidence-Commits haben bewusst verschiedene Aufgaben.

## 1. Produktkandidat festschreiben

Die Release-Koordination aktualisiert `main`, prüft einen leeren Arbeitsbaum und
notiert den vollständigen Produkt-Commit als `candidate_commit`:

```text
git switch main
git pull --ff-only
git status --short
git rev-parse HEAD
```

Aus genau diesem Produkt-Commit werden alle Pakete gebaut. Ab jetzt darf dieser
Commit nicht verändert oder durch ein Paket eines anderen Stands ersetzt werden.

## 2. Kampagne im selben Repository anlegen

Nach den Builds legt die Release-Koordination vom Produkt-Commit einen
Kampagnenbranch an, zum Beispiel:

```text
git switch -c uat/campaign-rc139-uat1 <candidate-commit>
```

`CAMPAIGN.template.json` wird als `CAMPAIGN-rc139-uat1.json` kopiert und mit
Kampagnenkennung, `candidate_commit`, Paketnamen und SHA-256 ausgefüllt. Nur
Manifest und gegebenenfalls unveränderte Evidence-Vorlagen werden committet und
der Kampagnenbranch wird gepusht. Der Manifest-Commit ist zwangsläufig ein
Nachfahre des darin gebundenen Produkt-Commits; er ist nicht der Produktkandidat.

## 3. Plattformbranches anlegen

Beide Personen holen denselben Kampagnenbranch. Die Windows-Person verwendet:

```text
git fetch origin
git switch -c uat/windows-rc139-uat1 origin/uat/campaign-rc139-uat1
```

Sie ändert nur `WINDOWS-EVIDENCE.csv` und bei Bedarf eine inhaltsfreie
Defectnotiz. Die Mac-Person verwendet:

```text
git fetch origin
git switch -c uat/macos-rc139-uat1 origin/uat/campaign-rc139-uat1
```

Sie ändert nur `MACOS-EVIDENCE.csv` und bei Bedarf eine inhaltsfreie
Defectnotiz. Architektur vorher mit `uname -m` feststellen und im Protokoll
eintragen. Beide prüfen vor dem ersten Test, dass der im Manifest gebundene
Produkt-Commit ein Vorfahr ihres aktuellen Branches ist:

```text
git merge-base --is-ancestor <candidate-commit> HEAD
```

Exitcode 0 ist Pflicht. Die Paket-Hashes müssen zusätzlich exakt mit dem
Manifest übereinstimmen; die Git-Abstammung allein belegt kein Paket.

## 4. Zusammenführen

Die Release-Koordination prüft beide Branches, übernimmt ausschließlich
Manifest, Evidenzdateien und inhaltsfreie Defectnotizen und füllt danach die
Freigabeentscheidung aus. Ein Product-Fix wird nie in einen UAT-Branch gemischt.
Er erzeugt auf `main` einen neuen Kandidaten; die neue Kampagne startet wieder
von dessen vollständigem Produkt-Commit.

Dieses Branchmodell folgt dem Shared-Repository-Prinzip: ein eingefrorener
Produktstand, ein gemeinsamer Kampagnenursprung, getrennte Plattformbranches und
Review vor der Übernahme schützen `main` und vermeiden Schreibkonflikte.
