# Formale N3/N4-Abnahme mit Windows und macOS

Stand: 23.09.2026 · Standalone macOS 3.2.0-rc141 veröffentlicht; Standalone Windows/Linux und Cowork bleiben RC140; menschliche Abnahme offen

**Mac-Sperrhinweis MAC-20260923:** Standalone-RC140 ist aufgrund seines
POSIX-Helfers kein macOS-13.5-Kandidat (Intel mindestens 15.0, ARM mindestens
14.0). BL-010.20 ist für RC141 technisch neu belegt; BL-012.9 behält die getrennte
Cowork-Paketlieferung und sichtbare AppKit-Abnahme offen. Die alten ZIPs enthalten die
Quellkorrekturen nicht; eine erfolgreiche Installation auf neuerem macOS
belegt keine Unterstützung der deklarierten 13.5.

**Neuer technischer Mac-Prüfstand:** RC141-Standalone für Intel und ARM ist
an Commit `1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542` und den bestandenen
Lauf `35875613438` gebunden. Beide ZIPs samt Hashes sind im
[RC141-Nachweis](../../REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze)
erfasst und im [dauerhaften RC141-Mac-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)
mit unveränderten ZIP-Bytes veröffentlicht. Für einen separaten Mac-Test dieses
architekturspezifische ZIP, seinen Hash und den RC141-Buildcommit verwenden.
Dieser technische Vorlauf ist noch keine gemeinsame Windows-/Mac-Kampagne:
kein neuer Windows-/Cowork-Kandidat und keine menschliche Evidence wurden
damit erzeugt. Für die formale Kampagne keine RC140-Windows- und RC141-Mac-
Pakete als denselben Produktcommit zusammenfassen. N3/N4-Vorlagen bleiben
`NOT_RUN`; tatsächliches macOS 13.5 und Finder-/Gatekeeper-Abnahme sind offen.

Dieses Verzeichnis steuert die gemeinsame Abnahme durch zwei Personen: eine auf
Windows x64 und eine auf einem Mac. Beide verwenden dasselbe Git-Repository und
für das jeweils geprüfte Produkt denselben festgeschriebenen Commit. Die
Produktkandidaten dürfen nicht vermischt werden. Die Testfälle selbst bleiben in den
[Cowork-UAT-Unterlagen](../UAT_TEST_KIT/README.md) und im
[Standalone-UAT-Kit](../STANDALONE_UAT_TEST_KIT/README.md).

RC140 ist als technischer Kandidat beider getrennten Produkte an Commit
`814bc50e3d754224cd95b6fa91f122dd45f48487` gebunden und veröffentlicht.
Die exakt erzeugten Cowork-ZIPs wurden auf Windows x64, macOS Intel und macOS
ARM64 nativ gestartet; Standalone bestand Windows-PKG-04/INT-13 und native
Paketläufe auf macOS Intel/ARM64 und Linux. Die generische Vorlage bleibt
bewusst zunächst auf **Cowork-only** gesetzt, weil die veröffentlichte
Windows-UAT-Datei nur Cowork-Normal/Debug bindet. Für eine Standalone-Kampagne
wird ein eigenes Manifest mit demselben RC140-Commit, `standalone=true` und
den exakten Standalone-Pakethashes angelegt. Eine formale Kampagne beginnt erst, wenn beide
Tester die exakten Pakethashes des jeweiligen Produkts gebunden haben. Die
12×3- und 41×3-Modellgates bleiben `NOT_RUN`; das veröffentlichte Evidence-ZIP
ist nur ihre leere Vorlage. Frühere RC-Evidence bleibt historisch und darf nicht
umetikettiert werden.

Die Korrekturen nach dem Astra-/Terra-Gegenreview sind in RC140 enthalten.
Seine Windows-Cowork-UAT-Vorlage bindet die veröffentlichten Normal-/Debug-Bytes und
denselben Quellcommit. Die RC138-UAT-Vorlage ist nicht wiederverwendbar.
Die separate Mac-Kampagne bindet das zu ihrer Architektur passende normale
RC140-Paket; die Windows-Vorlage behauptet keinen Mac-Ausführungsnachweis.

Evidence-Präzisierung vom 23.09.2026: Das native ZIP-Gate ist für
RC140 auf allen drei Cowork-Zielarchitekturen und den genannten Standalone-
Zielen bestanden. Danach folgt weiterhin
die beobachtete Installation und Bedienung in Claude; ein maschineller
MCP-Roundtrip ist keine sichtbare Anwenderabnahme.

RC139- und RC137-Pakete bleiben historische Kandidaten; die formale RC140-
Kampagne muss die neuen, commitgebundenen Pakethashes ausdrücklich wählen.
Ein Runner-Smoke ersetzt nicht den Browser-/Finder-/Gatekeeper-Fresh-Install
auf einem echten Mac.

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
| Mac-Tester | Paket-Mindestversion beachten (RC140 Standalone: Intel 15 / ARM 14); Architektur mit `uname -m` feststellen | N3 und N4 mit passendem x64- oder ARM64-Paket | N3 und N4 in aktueller Claude-Desktop-/Cowork-Version | `MACOS-EVIDENCE.csv` |

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
   Mac-Evidence muss alle eingebetteten Mach-O-Dateien einschließlich Addons
   auf Architektur, echte Mindestversion, Ladeabhängigkeiten und Signatur
   prüfen. Numerische Plist-Versionen, LaunchServices-Start und echter
   Konvertierungs-/Anonymisierungslauf ohne installierte Runtime gehören zum
   Paketgate. In der sichtbaren Abnahme zusätzlich Browser-Quarantäne, Finder,
   Gatekeeper und große AppKit-Prüfgruppen testen; technische Dialogfehler
   dürfen keine endlose „Später“-/Fortsetzen-Schleife erzeugen.
   Für das Cowork-Plugin sind zusätzlich die vollständige 41×3-Modellabnahme
   und der 12×3-Kandidatensmoke mit den im Manifest gebundenen Korpus-Hashes
   als `PASS` erforderlich. Die reproduzierbare 12-Fälle-Anleitung erzeugt
   `npm run uat:cowork-candidate`; Setup und Aufräumen gehören zu jedem Fall.
   Nach dem bytegleichen Cowork-Paketbau erzeugt `npm run build:cowork-uat-evidence --
   --candidate-commit <Commit> --normal-zip <dist/normal.zip> --debug-zip
   <dist/debug.zip>` zusätzlich ein an **diese expliziten**, zuvor nativ durch den Cowork-ZIP-Verifizierer
   geprüften Paket-Hashes und dem im eingebetteten Runtime-Evidence identischen
   Quellcommit gebundenes Evidence-ZIP. Seine 36 Zeilen bleiben zunächst
   `NOT_RUN`; das ZIP ist eine Vorlage und niemals selbst ein UAT-Nachweis.
   Das maschinenlesbare Prüf-Receipt bindet den tatsächlich geprüften ZIP-Snapshot
   an Größe und SHA-256. PKG-04 bleibt der separate Standalone-Nachweis.
   Vor jedem Modelltest die echte Vorbedingung beobachten und
   `precondition_result=OBSERVED` eintragen. Andernfalls beide Ergebnisfelder
   auf `BLOCKED` setzen. Keine erfundenen Toolantworten oder manipulierten
   Journale verwenden; Resume verlangt den in N3-07 nachgewiesenen Checkpoint.
5. Nur synthetische Testdaten bereitstellen. Niemals echte Personen-, Kunden-
   oder Unternehmensdaten in Git, Evidenz oder Defectbeschreibungen aufnehmen.
6. Beide Tester starten ihre Plattformbranches vom selben Kampagnenbranch und
   prüfen dessen identischen `candidate_commit`, aber das jeweils passende Paket
   und eine eigene Evidenzdatei. Pro Kampagne wird nur der im Manifest aktivierte
   Produktkandidat geprüft. Standalone und Cowork erhalten wegen ihrer derzeit
   unterschiedlichen Kandidatencommits getrennte Kampagnen; ein gemeinsames PASS
   ist unzulässig.

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
