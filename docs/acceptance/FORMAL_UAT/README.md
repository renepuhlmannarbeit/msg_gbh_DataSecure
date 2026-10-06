# Formale N3/N4-Abnahme mit Windows und macOS

Stand: 06.10.2026 · Standalone Windows/macOS RC158 · Linux RC157 · Cowork RC151

**Aktueller Windows-/Mac-Standalone-Kandidat:** [RC158](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc158)
bindet Quellcommit `f4caf948bde39dbebe8fe359235c3be84f189e5d`.
Windows-PKG-04/INT-13 bestand zwei bytegleiche saubere Bauten; beide nativen
Mac-Paketprüfungen einschließlich integrierter Prüfseite, ZIP und beide
DMGs bestehen. Linux-Standalone und Cowork behalten RC157 beziehungsweise
RC151; sie dürfen nicht als derselbe RC158-Produktcommit zusammengefasst werden.
Beide Mac-ZIPs und DMGs bleiben alternative Installationswege mit eigenen Prüfsummen.
Der frühere RC157-Windows-Anwenderlauf mit 140 Ergebnissen einschließlich lokaler Prüfung
und Stapelverarbeitung ist bestanden bestätigt. Die leeren formalen CSV-
Vorlagen widerlegen diesen Funktionsnachweis nicht. Noch fehlende einzelne
Zielhost-/Accessibility-/Update-/Rollback- oder Rollenprotokolle sind getrennt
zu benennen; der gesamte Windows-Funktionslauf ist nicht pauschal offen.
Cowork bleibt RC151 und bekommt eine eigene produktgebundene Kampagne.
Eine Standalone-RC158-Kampagne muss die exakten RC158-Pakethashes verwenden,
nicht die historischen Kandidaten oder Cowork-UAT-Hashes.

**Bisheriger gemeinsamer Quellstand, getrennte Produktpakete:** RC151 ist als technischer
Kandidat beider getrennten Produkte an Commit
`fdb8288c9bef2a64eeb10d584e1bf59a6cb864c3` gebunden und veröffentlicht.
Das [RC151-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc151)
enthält Standalone-ZIPs für Windows x64, macOS Intel/ARM und Linux x64 sowie
zusätzliche Mac-DMGs. Cowork besitzt getrennte normale ZIPs für Windows und
beide Mac-Architekturen, ein Windows-Debug-ZIP und eine leere Windows-UAT-Vorlage.
Windows-PKG-04-/INT-13-ZIPs waren bytegleich; die nativen Mac-, Linux- und
Cowork-Paketläufe sind in [RELEASE.md](../../RELEASE.md) gebunden. Für die
formale Abnahme müssen Standalone und Cowork weiterhin getrennte Kampagnen mit
exakten produktspezifischen Hashes erhalten. Sichtbare Installation, Modelltests
und N3/N4 stehen auf `NOT_RUN`; kein Runner-Lauf ersetzt diese Abnahme.

**Mac-Sperrhinweis MAC-20260923:** Standalone-RC140 ist aufgrund seines
POSIX-Helfers kein macOS-13.5-Kandidat (Intel mindestens 15.0, ARM mindestens
14.0). BL-010.20 ist für RC141 technisch neu belegt; die getrennte
Cowork-Paketlieferung erfolgte mit RC151, die sichtbare AppKit-Abnahme bleibt
offen. Die alten ZIPs enthalten die
Quellkorrekturen nicht; eine erfolgreiche Installation auf neuerem macOS
belegt keine Unterstützung der deklarierten 13.5.

**Historischer gemeinsamer Standalone-Prüfstand:** RC142 für Windows x64 sowie macOS Intel und
ARM ist an Commit `c0ddd11ecf366d32ff9962bfeffc6519b01a8c5d` gebunden. Das
[RC142-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc142)
enthält weiterhin beide architekturspezifischen Mac-ZIPs und zusätzlich beide
DMGs, jeweils mit SHA-256-Datei. Windows-PKG-04/INT-13 bestand zwei bytegleiche
Paketbauten und beide nativen Smokes; der native Mac-Lauf `36562812021` prüfte
ZIP, DMG, identischen App-Inhalt, Signatur und Start auf beiden Architekturen.
Für die Wiederholung einer RC142-Kampagne nur deren exakte Assets und den
RC142-Commit zusammen verwenden; für eine neue Windows-/Mac-Standalone-Kampagne gilt RC158,
für Cowork weiterhin RC151. DMGs
sind nicht notarisiert; sichtbare
Finder-/Gatekeeper-Installation auf dem Ziel-Mac und menschliche Abnahme bleiben
`NOT_RUN`. Damals behielten Linux-Standalone und Cowork RC140; eine Cowork-Kampagne darf
nicht als RC142-Stand-alone-Nachweis ausgegeben werden.

**Historischer Mac-Prüfstand:** RC141-Standalone für Intel und ARM ist
an Commit `1d5a67d37bd72a30f70ee1db5f5ef2a45ee6e542` und den bestandenen
Lauf `35875613438` gebunden. Beide ZIPs samt Hashes sind im
[RC141-Nachweis](../../REVIEW_PRODUCT_HOSTS_2026-09-23.md#rc141--nativer-neubau-und-genaue-nachweisgrenze)
erfasst und im [dauerhaften RC141-Mac-Vorabrelease](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc141)
mit unveränderten ZIP-Bytes veröffentlicht. Für einen separaten Mac-Test dieses
architekturspezifische ZIP, seinen Hash und den RC141-Buildcommit verwenden.
Dieser technische Vorlauf war keine gemeinsame Windows-/Mac-Kampagne:
RC140-Windows- und RC141-Mac-Pakete dürfen nicht als denselben Produktcommit
zusammengefasst werden. Für RC141 wie RC142 bleiben tatsächliches macOS 13.5
und Finder-/Gatekeeper-Abnahme offen.

Dieses Verzeichnis steuert die gemeinsame Abnahme durch zwei Personen: eine auf
Windows x64 und eine auf einem Mac. Beide verwenden dasselbe Git-Repository und
für das jeweils geprüfte Produkt denselben festgeschriebenen Commit. Die
Produktkandidaten dürfen nicht vermischt werden. Die Testfälle selbst bleiben in den
[Cowork-UAT-Unterlagen](../UAT_TEST_KIT/README.md) und im
[Standalone-UAT-Kit](../STANDALONE_UAT_TEST_KIT/README.md).

Historisch: RC140 ist als technischer Kandidat beider getrennten Produkte an Commit
`814bc50e3d754224cd95b6fa91f122dd45f48487` gebunden und veröffentlicht.
Die exakt erzeugten Cowork-ZIPs wurden auf Windows x64, macOS Intel und macOS
ARM64 nativ gestartet; Standalone bestand Windows-PKG-04/INT-13 und native
Paketläufe auf macOS Intel/ARM64 und Linux. Die generische Vorlage bleibt
bewusst zunächst auf **Cowork-only** gesetzt, weil die veröffentlichte
Windows-UAT-Datei nur Cowork-Normal/Debug bindet. Für eine Standalone-Kampagne
wäre ein eigenes Manifest mit demselben RC140-Commit, `standalone=true` und
den exakten Standalone-Pakethashes erforderlich gewesen. Eine formale Kampagne beginnt erst, wenn beide
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

RC139-, RC137-, RC140- und RC142-Pakete bleiben historische Kandidaten.
Eine neue RC151-Cowork-Kampagne muss die RC151-Normal-/Debug-Hashes und je
Mac-Architektur das passende Cowork-ZIP ausdrücklich binden. Eine getrennte
RC151-Standalone-Kampagne bindet die eigenen Windows-/Mac-Pakete an denselben
RC151-Commit; Linux benötigt eine getrennte Zielhost-Evidenz. Historische
Kampagnen behalten ihre damaligen exakten
Pakethashes; sie werden nicht als RC151 umetikettiert.
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
