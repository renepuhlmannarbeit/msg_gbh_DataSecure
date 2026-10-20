# RC168 – exakte Nachbearbeitung und strukturierte Zuordnung

Status: Windows x64, macOS ARM64 und Intel als gemeinsamer Test-Pre-Release
veröffentlicht. Technische Endgates bestanden; Nutzerdesktop-/Office-/Zielhost-
abnahme offen. Keine Desktopautomation, neue geplante Aufgabe oder Main-Integration.
RC167 und alle älteren Pakete, Nutzerläufe und Belege bleiben unverändert.

## Implementierter Auftrag und Fachgegenreviews

[Plan, Datenmodell, drei Aktivitäts-/Sequenzdiagrammpaare und Primärquellen](RC168_REVIEW_CORRECTION_AND_WORKBOOK_20261020.md).

Zuerst TEXT-POSITIONS-01: normalisierte Textareaoffsets bei CRLF/CR/LF und UTF-16
auf unveränderte gespeicherte Texte abbilden. Halbe CRLF-/Surrogatbereiche,
veraltete Revisionen und abweichende Texte verweigern. Maskierung, beidseitige
Hervorhebungen und freiwillige Markdown-Nachkorrektur gemeinsam gegengeprüft.
Keine rückwirkende Text-/Hashnormalisierung und keine erfundene native Reproduktion
des konkreten Nutzerlaufs.

Danach REVIEW-ACTIONS-01: rechts markieren, exakte Vorschau prüfen, einmal
**Maskierung speichern**. Linke/alte Markierungen nicht übernehmen. Konkrete
Sperrgründe, einheitliche Handler-/UI-Bedingungen und klare Trennung zur optionalen
Entitätenbehandlung mit expliziter Behandlung/Geltung. Blättern ist keine
Entscheidung; belegte gemeinsame Identitäten allein erlauben Laufgeltung.
Ein alter Seitencallback darf keinen frischen Nachfolger invalidieren; vier
kausale verzögerte Gegenfälle vor dem Freeze korrigiert und unabhängig gelesen.
Keine zweite Dokumentfreigabe, Dateiauswahl oder Exportbestätigung.

RESULT-COMPANIONS-02: neues geschlossenes /3-Inventar im Erststand und jedem
ausdrücklich gespeicherten vollständigen Korrekturstand:

- `Vertraulich/Dateizuordnung.csv`
- `Vertraulich/Pseudonym-Zuordnung.txt`
- `Vertraulich/Pseudonym-Zuordnung.xlsx`

XLSX ist echtes begrenztes OpenXML ohne Formeln/Makros/externe Beziehungen;
je Dokument Typ/Basiswert/Endwert, dazu Übersicht/Hinweise und verlustfreie
Langwerte. Semantischer gebundener Nachweis statt Menschen-TXT-Parsen.
Immutable private Workbookbytes einmal erzeugen, beim Lesen nur verifizieren;
keine Neuerzeugung, Reparatur oder Adoption. Alte /1-/2-Ergebnisse, No-op und
unterbrochene /2-Aufträge behalten ihre Namen, Rollen und Operationsidentität.
Erst ein bewusst gespeicherter neuer unterstützter Stand erhält /3.

Gezielte Positions-/UI-/Workbook-/Legacy-/Rust-/Async-/Autorisierungsreviews
erfolgten am tatsächlichen Produktionscode mit unabhängigen KI-Fachagenten.
Unter anderem184Renderer-,419Workspace-,13echte HTML-Headless- und12593
Positions-Gegenranges vor dem finalen Freeze; keine nativen Desktopbelege daraus.
Spreadsheet-Skill-Import/Rendering beeinflusste die isolierte QA, nicht den
Produktlaufzeitumfang; kein Office-/Python-/neuer nativer Laufzeitzwang.

## Exakte finale Bindung

App-/Tagcommit `0049513a9ba661bee4190a6677bb3ddffef461a9`, Build `0049513a`.
Produktfingerprint `48ba2fa729f2ac59cc4d47bc57bf6633c580b8316fe330fadeccf9a6064224e3`,336Inputs.
572Test-/Scriptinputs, Manifest
`f7cfa9208790399f2236df4241b0b6656ae3413ea5de6f5be783a0884f6a8102`.
Node22.23.2 SHA256
`0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4`.
Keine Produkt-/Test-/Driver-/HEADänderung während der neuen Endjobs.

Create-only Belege: `dist/rc168-review-workbook-source03-20261020`.
Alle tatsächlichen FINALs passed=true/inputs_unchanged=true:

- 285/285Headlessdateien plus11/11Zusatzgates, Abschluss20.10.10:07:25UTC.
- Windows Prepare/Clippy/275Rusttests(3ignoriert)/Release, Abschluss09:37:38.616UTC.
- Fünf Paketgates: Neubau, Inventar, native Ownership-Ladung, Fast-Content-
  Sourceadapter und100Dateienkorpus ohne Fehler/mit unveränderten Originalen.
  Abschluss09:42:07.755UTC; ZIP-/EXE-/voller Gitmarker getrennt gebunden.

Quellsnapshot erst nach diesen Gates:932Dateien/8393529Bytes,
SHA256 `37042d56f8bd32dff1d4ad6a4cae107768195102761851aca1328f83b73f7f07`,
captured10:16:16.215UTC. Overlaynachweis, kein selbstständiger Checkout.

## Beide tatsächlichen Mac-Consumer und Artefakte

Run39401647855 auf exakt diesem Appcommit erfolgreich:
ARM118557575597/Intel118557575732. Je266Rusttests/3ignoriert,70Generationen-,
20Companion- und34Workbookfälle. Echte Node→Rust-Erst-/Korrekturbereitstellung
mit drei Begleitdateien, Legacy/Resume/LostReceipt/Nichtreparatur/Default,
Core-/Worker-/IPC-/Guard-/App-/Konverter-/ZIP-/DMG-Gates bestanden.
Run-/Job-/Artefaktquellen getrennt nachgelesen. Zwei-Core-/forkIPC-/Worker-/
Contention-/Root-/ACLpresence-/Initialoutput-Orakel gelten nur für ihren
tatsächlichen Umfang; Epoch/Pause/Lease/GUI NOT_RUN, adversariale ACL-Matrix PARTIAL.

ARM-Artefakt12255218058/Intel12257666530 frisch heruntergeladen. Tatsächliche
Transport-/ZIP-/DMGbytes und Logs durch Main und je unabhängigen Artefaktreview
geprüft. Je1154ZIPeinträge/1152Manifestrecords/1153Checksummen und232gemeinsame
Runtimequellen bytegebunden. Native CI montiert DMGs read-only, vergleicht die
ganze App und prüft strict/deep Codesign; Windows-Metadatenlesen ist kein eigener
nativer codesign-/Finder-/DMG-Mount-PASS. App-/LaunchServices-Gates belegen Load+
IPC, keine menschliche Bedienung. Reguläres macOS26-Profil SKIPPED, nicht PASS.

Eigene statische Cores unverändert vom bereits freigegebenen Producer39167676290/
7d0ee31dc65ce31ce54f1b4a1a0cefa348ef7071. Core hält Guard im mutierenden Prozess,
keine dynamische fremdsignierte Guardladung oder externer Lockkeeper. Eigene
App/Core lokal ad-hoc/runtime, eigener Core nur allow-jit, UI keine Entitlements.
Offizieller Converter ist separate offen hashgebundene Rolle mit abweichenden
Upstream-Entitlements; keine Behauptung, alle eingebetteten Rollen seien unsigniert.
Keine Developer-ID/Notarisierung/Apple-Einreichung oder OS-Schutzabschaltung.

| Finales Archiv | Bytes | SHA256 |
|---|---:|---|
| Windows x64 ZIP |112395420|`9bf52cd4146e78e34afd0f08674f72fdfbb19d685aa0f3ca9d12d92e231efbad`|
| ARM64 ZIP |117745716|`103f67e2cabef57f799670009da52080e6a09678ef7539bb650caabb3f7ca84c`|
| ARM64 DMG |131595119|`906bd8324e73f93b9b20291a6c2e0f89e2cb714d8a2fc27cb258e71839659529`|
| Intel ZIP |121001934|`d2c326a3d190a2d0b4cf4084e3eeb2645323219c20adce959c2fd16cd6ef33c5`|
| Intel DMG |136569616|`2e07cd25910f4fcaec64af13182b630f279ae8c79581f08936df9ede724d1269`|

WindowsEXE SHA256 `c46a4a491f5138eb903eee8f1329f571c25eba0914084214d9c465f32c1c340c`.
Unabhängige tatsächliche Artefaktreviewnotizen: `dist/rc168-source03-windows-review-20261020/REVIEW.md`,
`dist/rc168-source03-arm-review-20261020/COUNTERREVIEW.md` und
`dist/rc168-source03-intel-review-20261020/COUNTERREVIEW.md`. Pins jeweils
`c7dcbd4d2b0ccb4d453762eb506bff20abf2ccf8173d0fddefb56183ae3133ab`,
`a6451b49c4379dd70f6643ff0d3a8fcadb8b79654413bf5c3ff2d64c38ce00e9` und
`c69e9262ab8dcd932af9920d2825a96d33ab7a2da136f60c74228df779de40d2`.

## Übergabe und Remoteverifikation

Windows create-only geliefert unter `C:\Users\arkud\Documents\Software DataSecure\RC168`.
18lokale Dateien: ZIP, aktueller Testplan/README, technische Belege, ausdrücklich
USER_PENDING statt GUI-FINAL und drei byteidentische synthetische Testdaten-ZIPs.
Kompakt164, unveränderter100Dateienbestand160 und separate36Dateien-Large166;
deren historische Pläne werden nicht als aktueller Direktablauf ausgegeben.
Beide aktuellen Testpläne enthalten Positions-/Maskier-/Workbook-/Legacy-/
Default-/Neustart-/Picker-/Large-Gegenfälle mit ausschließlich synthetischen Daten.
Unabhängiger finaler20Asset-/Plan-/Handoff-Gegenreview ohne bestätigten Blocker:
`FINAL-HANDOFF-COUNTERREVIEW.md`, SHA256
`178c4c42b3fde868ef77fd957e07ba588d09d4cf8b1e924f8f45101c0055dbe1`.

[RC168-Release418271744](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc168)
veröffentlicht20.10.2026 10:29:20UTC, Pre-Release=true/Draft=false.
Exakt20Assets (fünf Apps, drei Testdaten, acht Einzelprüfsummen, zwei Testpläne,
RELEASE-EVIDENCE und SHA256SUMS). Alle im Draft und nach Veröffentlichung frisch
heruntergeladen/gehasht, gleiche AssetIDs und exakter Tagcommit erneut bestätigt.
REMOTE-PUBLISHED-VERIFIED10:30:11.179UTC; annotierter Tag
b251e434be2bafa8adafa29d37d939687a5823db löst auf0049513a… auf. Releasebody stimmt
mit dem vorbereiteten tatsächlichen Text überein; keine älteren Belege kopiert.

## Erhaltene rote Gegenläufe und verbleibende Nutzerabnahme

Source01/c286: Native/Paket grün, Headless148/285 rot an einer veralteten exakten
Modulliste ohne Workbook. Genau ein Blattmodul ergänzt, Entfernung bleibt negativ;
kein Produktdelta. Source02/713126:285/285+8/11, Gesamt rot am alten Browserorakel
für verborgenen Maskierknopf/Zwei-Klick-Ablauf. Autor/Main und zwei unabhängige
Reviews bestätigten den Harnesswiderspruch. Enger tatsächlicher Browserersatz
prüft exakten einen Saveauftrag und Vorschau/Linksauswahl/Stale/Busy/ACK/Generation,
ohne Axe-/Fokus-/Verlaufsorakel zu verlieren. Source03 ersetzt diese Gegenläufe
durch neue Gates; sie werden nicht rückwirkend grün erklärt. Historische RC166-
Default-/Manifestursachen und genauer nativer Intel-Schedulingablauf unbewiesen.

Offen beim Nutzer/Kollegen: zehn Desktopfälle, echte Excel-/Numbers-Anzeige,
physische ARM64-/Intel-/M2-/Finder-/Gatekeeper-/TCC-/Enterprise-/VoiceOver- und
macOS13.5/26-Abnahme. Isolierte Reader-/Renderingproben zeigten Xstring-/lange
Ziffern-Darstellungsgrenzen, keinen universellen/nativeOffice-Gleichheits-PASS.
Keine standardkonformen Daten umgeschrieben, um einen Readerfehler zu kaschieren.

Office zunächst nur ansehen, nicht die gebundenen Originale speichern. Vor
erneutem Appabgleich normal schließen; nötige Bearbeitungskopien außerhalb des
gesamten Ergebnisbaums weiterhin vertraulich behandeln. Office-Speichern kann
Temporärdateien/Ersetzung verwenden; bloßes Öffnen/Numbers wurde damit nicht
nachgewiesen. Keine vermuteten Lockdateien blind löschen oder privat bereits
gespeicherte Entscheidungen nach Publikationskonflikt blind wiederholen.
Primärquellen: [Microsoft Excel-Speichern](https://support.microsoft.com/en-us/excel/description-of-the-way-that-excel-saves-files),
[Microsoft Dateispeicherprobleme](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/issue-when-save-excel-workbooks?tabs=third-party).

Technische Grüns sind keine Produktionsfreigabe, vollständige Anonymitätsgarantie
oder Zusage für jeden Zielhost. Vertraulich nicht weitergeben/hochladen. User-App
nicht bedient oder beendet. Nachfolgende reine Dokumentation ändert weder finalen
App-/Tagcommit noch Produktfingerprint, Paketbytes oder ursprüngliche FINALs.

Sieben nachgelagerte Markdown-Dokumente abschließend unabhängig ohne bestätigten
Restbefund gegengelesen (`POST-RELEASE-DOC-COUNTERREVIEW.md`). Aktuelle Dokument-
30/Link3/UAT6/Formal5/Fixture3-Verträge sowie Versiontruth und Canonicalprüfung
bestanden. Produktfingerprint nach diesen Deltas erneut unverändert bestätigt.
Die Veröffentlichungssekunde wurde von Main separat über die tatsächliche
GitHub-Releaseantwort gelesen; der Remotehashbericht selbst führt nur Prüfzeit.
