# Vertrag: descriptor-gebundener Quellen-Preflight v1

Status: BL-049.1a und BL-049.1b1 E0; produktiv für den gesamten lokalen
Mehrfachpicker vor jeder privaten Quellkopie verdrahtet.

## Zweck und Grenze

Der Preflight verbindet deklarierte Endung, bekannte Signatur und bei OOXML eine
begrenzte minimale Containerheuristik. Er liest ausschließlich über einen bereits
geöffneten, vor und nach dem Lesen an Dateityp, Gerät, Inode, Größe, Änderungs- und
Metadatenzeit gebundenen Descriptor. Er schreibt nichts, folgt keinen Links, lädt
keine externen Inhalte und gibt keine Dateinamen, Pfade, Rohbytes oder Parserfehler
zurück.

`candidate` bedeutet ausdrücklich nur: Der Preflight fand keinen sicheren
Ablehnungsgrund. Für TXT, Markdown und CSV folgen vollständige Parser- und
Residual-Gates; bei DOCX folgen vollständige lokale Header-, CRC-, OPC-, Parser-
und Residual-Gates. `candidate` ist weder „vollständig verarbeitet“ noch eine
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
Endungen, Endungs-/Signatur-/Minimalstruktur-Mismatch, ungültigen Text, beschädigte
oder polyglotte ZIP-Container, offensichtliche aktive Inhalte, verschlüsselte
ZIP-Einträge und alte oder möglicherweise verschlüsselte CFB/OLE-Container. CFB
allein wird nicht als Beweis für Passwortschutz bezeichnet.

## Noch nicht erfüllt

- echte OPC-Steuerteil-, Relationship- und CRC-Prüfung vor Snapshot; feste lokale
  ZIP-Header, Name, Flags, Methode und Datenbereich sind bereits gebunden,
- ausschließlich die drei finalen Ergebnisgrade aus DS-045,
- neue Formatfreigaben sowie E1/E3 auf realen Zielplattformen.

## Journal- und Mappinggrenze

Ein abgewiesener Eintrag wird zunächst als `preflight_mapping_pending` mit festem,
inhaltsfreiem Fehlercode persistiert. Er enthält weder `work_name`, Quellhash noch
Paketkennung. Erst nachdem der dauerhafte lokale Mapping-Eintrag idempotent geschrieben
wurde, wechselt er auf `stopped`. Wiederanlauf und periodische Wartung reparieren den
Zwischenzustand, ohne die Quelle erneut zu lesen oder eine Arbeitskopie anzulegen.
