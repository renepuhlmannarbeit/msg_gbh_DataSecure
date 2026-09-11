# Formale N3/N4-Abnahme mit Windows und macOS

Stand: 11.09.2026 · RC136-Quellstand und spätere, jeweils neu gebundene Kandidaten

Dieses Verzeichnis steuert die gemeinsame Abnahme durch zwei Personen: eine auf
Windows x64 und eine auf einem Mac. Beide verwenden dasselbe Git-Repository und
denselben festgeschriebenen Commit. Die Testfälle selbst bleiben in den
[Cowork-UAT-Unterlagen](../UAT_TEST_KIT/README.md) und im
[Standalone-UAT-Kit](../STANDALONE_UAT_TEST_KIT/README.md).

RC134 ist der letzte lokal Windows-PKG-04-/INT-13-gebundene Standalone-Kandidat;
RC136 ist als technischer Windows-x64-Cowork-Kandidat an Commit
`71ecafddde891d9d1b4e4bd9cd67833b46d03b08` gebunden und veröffentlicht. Er
enthält den DOCX-Vertrag DS-098: Kopf-/Fußzeilen bleiben bei reiner Konvertierung
erhalten und werden nur bei Anonymisierung ausgelassen. Eine formale Kampagne
beginnt dennoch erst, wenn alle benötigten Produkt-/Zielhostpakete im
Kampagnenmanifest gebunden sind. Die 12×3- und 41×3-Modellgates bleiben
`NOT_RUN`; das veröffentlichte Evidence-ZIP ist nur ihre leere Vorlage. RC133 bleibt historische
Evidence und darf nicht umetikettiert werden.

## Was N3 und N4 bedeuten

- **N3:** technische Zielhost-Abnahme des exakt gebundenen Pakets einschließlich
  Installation, Start, Schnittstellen, Formate, Recovery, Grenzen, Update und
  Rollback.
- **N4:** formale, beobachtete Anwender-/Accessibility-/Fachabnahme desselben
  Kandidaten und gemeinsame Freigabeentscheidung.

Die vollständige Definition steht im
[N3/N4-Abnahmevertrag](../../canonical/ACCEPTANCE_LEVELS.md).

## Zuständigkeiten

| Person | Zielhost | Standalone | Cowork-Plugin | Evidenzdatei |
|---|---|---|---|---|
| Windows-Tester | Windows 10/11 x64 | N3 und N4 | N3 und N4 in aktueller Claude-Desktop-/Cowork-Version | `WINDOWS-EVIDENCE.csv` |
| Mac-Tester | macOS 13.5 oder neuer; Architektur mit `uname -m` feststellen | N3 und N4 mit passendem x64- oder ARM64-Paket | N3 und N4 in aktueller Claude-Desktop-/Cowork-Version | `MACOS-EVIDENCE.csv` |

Ein einzelner Mac schließt nur seine reale Architektur. Die jeweils andere
macOS-Architektur bleibt offen, bis sie auf passender Hardware abgenommen wurde.

## Vorbereitung durch die Release-Koordination

1. `npm run test:version-truth` muss grün sein. Danach muss `main` sauber sein;
   vollständigen Produkt-Commit mit `git rev-parse HEAD` als Kandidat
   festschreiben. Ab diesem Zeitpunkt den Kandidaten nicht mehr verändern.
2. Aus genau diesem Commit die zielsystemspezifischen Standalone- und
   Cowork-Pakete bauen. Quell-ZIPs oder Pakete eines anderen Commits sind
   unzulässig.
3. Vom Kandidaten den Branch `uat/campaign-<kampagne>` anlegen, dort eine Kopie
   von `CAMPAIGN.template.json` unter einem kampagnenspezifischen Namen
   eintragen und committen. Für jedes Produkt und jeden Zielhost ist ein eigener
   Hash Pflicht. Das Feld `candidate_commit` bleibt der Produkt-Commit; der
   spätere Manifest-Commit ist bewusst ein Nachfahre davon.
4. Automatische E0-Gates, PKG-04/INT-13 soweit anwendbar und die
   Dokumentationsprüfung müssen grün sein. Das ersetzt N3/N4 nicht.
   Für das Cowork-Plugin sind zusätzlich die vollständige 41×3-Modellabnahme
   und der 12×3-Kandidatensmoke mit den im Manifest gebundenen Korpus-Hashes
   als `PASS` erforderlich. Die reproduzierbare 12-Fälle-Anleitung erzeugt
   `npm run uat:cowork-candidate`; Setup und Aufräumen gehören zu jedem Fall.
   Nach dem bytegleichen Cowork-Paketbau erzeugt
   `npm run build:cowork-uat-evidence` zusätzlich ein an Commit, Paket-Hashes
   und Korpus-Hashes gebundenes Evidence-ZIP. Seine 36 Zeilen bleiben zunächst
   `NOT_RUN`; das ZIP ist eine Vorlage und niemals selbst ein UAT-Nachweis.
5. Nur synthetische Testdaten bereitstellen. Niemals echte Personen-, Kunden-
   oder Unternehmensdaten in Git, Evidenz oder Defectbeschreibungen aufnehmen.
6. Beide Tester starten ihre Plattformbranches vom selben Kampagnenbranch und
   prüfen dessen identischen `candidate_commit`, aber das jeweils passende Paket
   und eine eigene Evidenzdatei. Jede anwendbare Prüfung wird darin für
   Standalone und Cowork getrennt bewertet; ein gemeinsames PASS ist unzulässig.

Solange Commit oder Paket-Hash fehlen, ist die Kampagne **nicht gestartet**.

## Reihenfolge je Zielhost

1. Systemdaten ohne Benutzername oder Gerätekennung erfassen: OS-Version,
   Architektur, Produkt-/Claude-Version und Installationskanal.
2. [N3/N4-Checkliste](N3-N4-CHECKLIST.md) Abschnitt N3 ausführen.
3. Nur bei vollständig grünem N3 die produktbezogenen UAT-Fälle ausführen:
   Standalone S01–S23 einschließlich S14a und Cowork UAT-01–UAT-06. S14a nur
   ausführen, wenn der gebundene Kandidat DS-098 enthält.
4. [N3/N4-Checkliste](N3-N4-CHECKLIST.md) Abschnitt N4 abschließen.
5. Eigene Evidenzdatei committen und über den im
   [Git-Ablauf](GIT-WORKFLOW.md) beschriebenen Plattformbranch bereitstellen.
6. Nach Gegenprüfung beider Plattformprotokolle
   [FREIGABEENTSCHEIDUNG.md](FREIGABEENTSCHEIDUNG.md) ausfüllen.

## Harte Regeln

- `PASS` nur für tatsächlich beobachtete Ergebnisse; `BLOCKED` ist kein PASS.
- Ein Defect wird nicht während derselben Kampagne heimlich repariert. Der Fall
  wird `FAIL`, die Korrektur erzeugt einen neuen Kandidaten und eine neue
  Kampagnenkennung. Betroffene sowie releasekritische Regressionen laufen neu.
- Keine Rohinhalte, Dateinamen, lokalen Pfade, Benutzer-/Gerätenamen, Tokens oder
  Dokumenthashes in Git. Paket-Hashes sind ausdrücklich erlaubt und notwendig.
- In den Evidence-Dateien nur die Rolle `windows-tester` beziehungsweise
  `macos-tester`, keine Klarnamen oder Signaturen eintragen.
- Standalone muss offline funktionieren. Cowork benötigt Claude Desktop und
  Internet; die Originalverarbeitung muss dennoch im lokalen Plugin-MCP laufen.
- Windows- und macOS-Ergebnisse bleiben getrennt auswertbar. Ein gemeinsames GO
  ist nur möglich, wenn alle im Kampagnenmanifest als freizugebend markierten
  Zielhost-/Produktkombinationen N3 und N4 bestanden haben.
- Ein Cowork-GO ist ausgeschlossen, solange `full_matrix_41x3` oder
  `candidate_smoke_12x3` nicht `PASS` ist. Ein verbotenes Outcome in nur einer
  Wiederholung blockiert die Freigabe.

## Benötigte Dateien

- `CAMPAIGN.template.json` – unveränderliche Kandidaten-/Paketbindung;
- `WINDOWS-EVIDENCE.csv` und `MACOS-EVIDENCE.csv` – getrennte Protokolle;
- `N3-N4-CHECKLIST.md` – verständliche Durchführung;
- `GIT-WORKFLOW.md` – konfliktfreies Arbeiten im selben Repository;
- `FREIGABEENTSCHEIDUNG.md` – gemeinsames Schlussurteil.
- `DataSecure-Cowork-UAT-Evidence-v<version>.zip` – generierte, inhaltsfreie
  12×3-Cowork-Vorlage für genau einen sauberen Kandidatencommit.

Die Vorlagen sind bewusst leer beziehungsweise mit `NOT_RUN` vorbelegt. Erst
eine ausgefüllte, gegengeprüfte Kampagne ist Evidence.
