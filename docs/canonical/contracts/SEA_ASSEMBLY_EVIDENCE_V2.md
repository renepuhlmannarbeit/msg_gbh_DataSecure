# SEA-Engineering-Paketvertrag V2

Stand: 31.08.2026 · BL-010.1/BL-010.8 · RC77, öffentliche Node-Konfiguration unverändert.

## Freigabegrenze

SEA bezeichnet den experimentellen, selbsttragenden Node-Launcher. Er ist **nicht
produktiv freigegeben**. Die öffentliche Plugin-Konfiguration startet weiterhin
`node`. Ein erfolgreicher MCP-Start beweist weder isolierte Dokumentverarbeitung
noch eine echte Cowork-Installation ohne Systemruntime.

Der Bootstrap verwirft Node-Workerargumente jetzt fest, statt sie in `index.js`
fehlzuleiten. RC71 bindet eine separate Parserrolle mit eingebetteten Rechten
an den echten SEA-Parent. RC72 ergänzt feste Batch-/Review-/Companion-Rollen im
Windows-Parent. Deren IPC-/Negativproben ersetzen keinen positiven Stapellauf,
keine ganze Nebenrollen-Quellbindung oder finale Permission-/Netzwerkevidenz.

## Eingaben und Bindung

`scripts/build-sea-plugin.mjs` verlangt vier Zielprogramme aus dem gepinnten
Launcher-Vertrag. Zielarchitektur, Dateilänge, SHA-256 und vollständiger
Runtime-Probe-Vertrag müssen zur Build-Evidenz passen.

Seit RC77 ist `datasecure-sea-build-evidence/v2` verpflichtend. Der geschlossene
Datensatz enthält Releaseflag `false`, Ziel, Node-/Postject-Version, Binärlänge/-hash,
exakte Runtimeprobe, expliziten Parserrollenhash (oder `null`), `node_source` und
`parent_provenance`. `node_source.binary_sha256` muss ein Hex-String sein; das
Archivfeld ist bei separat archivgeprüfter Parserrolle der gepinnte Hash, beim
Legacy-Build ohne Archivnachweis ausdrücklich `null`.

`parent_provenance` ist ein geschlossener V1-Datensatz: Ziel, Node-Version,
vollständiger Parserdescriptor oder `null`, Plugin-Source-Evidenz, Hash des
Bootstraptemplates und der tatsächlich gerenderten Bootstrapbytes, feste
SEA-Konfiguration sowie sortierte relative Toolchain-Dateien mit Länge/Hash.
Das feste Inventar erfasst Paket-/Lockdateien, Parent-Buildrezept, Provenienz-,
Source- und Parserbundlehelfer und die vollständigen Postject-/Commander-Bäume.
Commander muss tatsächlich am erwarteten lokalen Ort aufgelöst werden; neue
Buildtool-Abhängigkeiten erfordern Vertragsprüfung, keinen stillen Fallback.

Der gemeinsame Helfer rekonstruiert alle Sollwerte aus lokalen Quellen, nicht
aus einer vom Nachweis ausgewählten Dateiliste. Der Builder nutzt genau diese
Bootstrap-/Configbytes und prüft die Quellen vor Publikation erneut. Assembly
und Parent-Verifier vergleichen vor Staging/Spawn. Die Kopie bleibt an derselben
Quellenaufnahme gebunden; ein späterer Quellen-Snapshot darf sie nicht ersetzen.
Alte V1-Buildnachweise müssen neu gebaut und real geprüft werden.

Der Vier-Ziel-Assembler paketiert derzeit keine separaten Parserprogramme.
Parentnachweise mit Parserrolle stoppen deshalb mit
`SEA_PARENT_ROLE_ASSEMBLY_PENDING`; sie werden nicht als vollständiges Paket
ausgegeben. Die spezialisierten Windows-Verifier assemblieren die geprüfte
Parserrolle weiterhin ausschließlich für ihre begrenzte Engineering-Abnahme.

Jede MCP-Evidenz benötigt `schema: datasecure-sea-mcp-evidence/v2`, denselben
Launcher-Hash, Ziel, Plugin-Befehl, installationsfreien Runtime-Modus sowie
Start ohne `PATH` und ohne Ausführung von `NODE_OPTIONS`.

Zusätzlich sind verpflichtend:

- `source_evidence`: geschlossener V1-Datensatz mit Produktversion, SHA-256 über
  sortierte relative Plugin-Dateipfade/Längen/Dateihashes, Launcher-Vertrag und
  Dispatcher. Alte Version, andere Quellen oder zusätzliche Felder stoppen.
- `parser_boundary`: geschlossener V1-Datensatz mit `txt`, `docx`, `permission`
  und `network_denied`, jeweils `true`. Diese Werte dürfen ausschließlich aus
  tatsächlich ausgeführten positiven Kern- und negativen Grenztests entstehen.

Hashes sind lokale Inhaltsbindung, **keine Signatur oder Host-Attestierung**.
Sie attestieren auch nicht, dass ein beliebiges Binärprogramm wirklich aus den
behaupteten Quellen entstand. Der Node-Eingangshash ist eine Builderangabe,
die sich nicht aus der injizierten EXE zurückrechnen lässt. Änderungen externer
Nebenrollenmodule nach Staging sind nicht durch einen unveränderbar eingebetteten
Laufzeitprüfer verhindert; diese Restarbeit bleibt offen. Die neue vollständige
Quelleninventur läuft nur bei Build/Abnahme, nicht pro Nutzerdokument.
Handgeschriebene JSON-Werte können echte Zielsystemevidenz nicht ersetzen.
Synthetische Builderfixtures prüfen ausschließlich das Assemblierungsverhalten.

## Dateisystem und Archiv

Quellen, Zielprogramme, Nachweise und ihre Eltern müssen regulär und linkfrei
sein; Dateien mit mehreren Hardlinks werden abgelehnt. Lesen ist begrenzt und
prüft Identität, Größe und Änderungsmetadaten vor/nach dem Zugriff. Das Inventar
ist auf 32 Ebenen, 20.000 Einträge, 10.000 Dateien und 1 GiB begrenzt.

Der Ausgabepfad liegt unmittelbar in `dist/*.zip`. Bestehende Archive werden
nicht ersetzt. Jeder Lauf besitzt einen neuen privaten Stage; alte Stages sind
keine Löschziele. Veröffentlichung erfolgt exklusiv auf demselben Dateisystem.
Cleanup prüft den eigenen Baum und stoppt bei Links oder unerwarteten Typen.
Dies ersetzt keine native Prüfung gegen bösartige gleichzeitige Dateisystem-Swaps.

POSIX-Dispatcher, SEA-Launcher sowie vorhandene native/OCR-Helfer behalten
`0755`. Übrige Dateien, einschließlich Windows-EXE, bleiben im ZIP `0644`.
Die zentrale ZIP-Modetabelle wird vor Veröffentlichung geprüft.
Zusätzlich muss der vollständig entpackte finale ZIP-Inhalt mit dem aus den
geprüften Quell-/Ergänzungsbytes gebildeten Sollinventar übereinstimmen. Eine
Änderung nach Source-Prüfung, beim erneuten Einlesen oder im Archiv ist ein Stopp.

## Aktueller Nachweis und nächste Umsetzung

`npm run test:sea-gates` prüft Source-Bindung, Assembly-Negativfälle,
Dateimodi, Rollenresolver und simulierten nativen Dispatch. Grüne Blockertests
bedeuten **NO-GO korrekt abgesichert**; tatsächliche SEA-Prozesse werden in den
separaten lokalen Verifierläufen geprüft, nicht durch diese Simulation ersetzt.

`verify-sea-launcher.mjs` bleibt der Legacy-NO-GO-Prüfer: Er trennt normale acht
Tools von der Supportdiagnose, startet den Parserversuch aber aus Host-Node mit
`execPath`-Test-Seam. Das ist kein Nachweis für den neuen Parent-Dispatch.
Er erzeugt **keine positive MCP-Evidenz**; auch ein späterer Kern-Erfolg ersetzt
nicht die kombinierte Permission-/Netzwerk-Negativmatrix.

RC71 ergänzt die [gebundene Parserrolle](SEA_PARSER_ROLE_V1.md) und
`verify-sea-parent-parser.mjs`: echter Windows-Parent, fünf Textformate wiederholt
ohne Execution-Seams, normale MCP-Tools sowie Manipulationsproben. POSIX-Zwang ist
verankert, dort bisher nur simuliert getestet. Nächster eigenständiger Schnitt:
nach RC77 vollständiger positiver Nebenrollen-/Resume-Lifecycle, unveränderbare
Laufzeitbindung externer Nebenrollenmodule, reale POSIX-Integration, finale Assembly einschließlich
Parserrollenbindung und kombinierte positive/negative Proben; erst danach
V2-Evidenz erzeugen. Anschließend Vier-Ziel-Paketierung, Fresh Install und
Update/Rollback auf realen Zielsystemen abnehmen.

Zusätzlicher Integrationsrest: Builder und Produkt-ZIP-Verifier sind für einen
obersten `bin/`-Ordner inkonsistent. Der Builder erlaubt ihn bereits (Manifesttest),
`verify-plugin-zip.mjs` enthält noch die alte pauschale Sperre. Daraus wird keine
aktuelle Claude-Einschränkung abgeleitet. Vor SEA-Integration diesen Widerspruch
gegen den offiziellen Paketvertrag auflösen und durch positive/negative
Pakettests ersetzen; Integritäts-, Modus- und Releasegates bleiben erforderlich.
