# Vertrag: descriptor-gebundener Quellen-Preflight v1

Status: BL-049.1a, BL-049.1b1 und der OPC-/Integritätsteil von b2 E0; produktiv für den gesamten lokalen
Mehrfachpicker vor jeder privaten Quellkopie verdrahtet.

## Zweck und Grenze

Der Preflight verbindet deklarierte Endung, bekannte Signatur und bei OOXML eine
begrenzte OPC-Containerprüfung. Er liest ausschließlich über einen bereits
geöffneten, vor und nach dem Lesen an Dateityp, Gerät, Inode, Größe und
Modifikationszeit gebundenen Descriptor (die Änderungszeit des Dateisystems ist
nach DS-070 kein Merkmal). Er schreibt nichts, folgt keinen Links, lädt
keine externen Inhalte und gibt keine Dateinamen, Pfade, Rohbytes oder Parserfehler
zurück.

`candidate` bedeutet ausdrücklich nur: Der Preflight fand keinen sicheren
Ablehnungsgrund. Für TXT, Markdown und CSV folgen vollständige Parser- und
Residual-Gates; bei DOCX sind vor der Kopie bereits sämtliche ZIP-Einträge gegen
Header, Größe und CRC sowie die OPC-Steuerteile und internen Beziehungen geprüft;
Parser- und Residual-Gates folgen. `candidate` ist weder „vollständig verarbeitet“ noch eine
Freigabe nach DS-045 und aktiviert kein neues Format.

Die vollständige Textklassifikation ist in den stapelweiten Produktpfad importiert.
Der gesamte Stapel wird vor der ersten Mutation geplant. Ein Descriptor-, Lese- oder
Identitätsfehler verwirft die Aufnahme vollständig; ein inhaltlicher Formatstopp wird
dagegen pro Datei kopierfrei journalisiert und hält andere Kandidaten nicht an.

`not_released` bedeutet: Signatur und Endung eines im Zielbild vorgesehenen, aber
in diesem Build noch gesperrten Formats passen. Die Datei erhält vor dem Snapshot
einen kopierfreien terminalen Einzelstopp; der Reststapel läuft weiter. Dadurch wird
kein neues Format aktiviert.

`rejected` besitzt ausschließlich feste inhaltsfreie Codes für nicht unterstützte
Endungen, Endungs-/Signatur-/OPC-Mismatch, ungültigen Text, beschädigte
oder polyglotte ZIP-Container, offensichtliche aktive Inhalte, verschlüsselte
ZIP-Einträge und alte oder möglicherweise verschlüsselte CFB/OLE-Container. CFB
allein wird nicht als Beweis für Passwortschutz bezeichnet.

Die positive Entscheidung wird zusätzlich mit SHA-256 über den gebundenen
Quell-Descriptor versiegelt. Die Snapshot-Kopie muss denselben Digest erzeugen;
anderenfalls wird ihre Teilkopie entfernt und die Aufnahme stoppt. Der Digest wird
nicht für kopierfrei gestoppte Quellen persistiert oder über MCP ausgegeben.

## Noch nicht erfüllt

- ausschließlich die drei finalen Ergebnisgrade aus DS-045,
- neue Formatfreigaben sowie E1/E3 auf realen Zielplattformen.

## Journal- und Mappinggrenze

Ein abgewiesener Eintrag wird zunächst als `preflight_mapping_pending` mit festem,
inhaltsfreiem Fehlercode persistiert. Er enthält weder `work_name`, Quellhash noch
Paketkennung. Erst nachdem der dauerhafte lokale Mapping-Eintrag idempotent geschrieben
wurde, wechselt er auf `stopped`. Wiederanlauf und periodische Wartung reparieren den
Zwischenzustand, ohne die Quelle erneut zu lesen oder eine Arbeitskopie anzulegen.
