# Vertrag: descriptor-gebundener Quellen-Preflight v1

Status: BL-049.1a E0; produktiv nur für die bereits vorhandene OOXML-
Sicherheitsgrenze als Ablehnungsgate vor dem privaten Snapshot verdrahtet.

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

Die vollständige Textklassifikation ist in diesem Leaf direkt getestet, aber noch
nicht in den stapelweiten Produktpfad importiert: Ohne per-Datei-Journalisierung
würde ein Text-Reject sonst den ganzen gemischten Stapel vorzeitig abbrechen.

`not_released` bedeutet: Signatur und Endung eines im Zielbild vorgesehenen, aber
in diesem Build noch gesperrten Formats passen. Es behält vorerst den vorhandenen
einzelnen terminalen Formatstopp nach dem Snapshot und wird dadurch nicht aktiviert.
BL-049.1b muss diesen Stopp kopierfrei journalisieren, ohne den Reststapel anzuhalten.

`rejected` besitzt ausschließlich feste inhaltsfreie Codes für nicht unterstützte
Endungen, Endungs-/Signatur-/Minimalstruktur-Mismatch, ungültigen Text, beschädigte
oder polyglotte ZIP-Container, offensichtliche aktive Inhalte, verschlüsselte
ZIP-Einträge und alte oder möglicherweise verschlüsselte CFB/OLE-Container. CFB
allein wird nicht als Beweis für Passwortschutz bezeichnet.

## Noch nicht erfüllt

- echte OPC-Steuerteil-, Relationship- und CRC-Prüfung vor Snapshot; feste lokale
  ZIP-Header, Name, Flags, Methode und Datenbereich sind bereits gebunden,
- per-Datei-Journalisierung und Fortsetzung des Reststapels,
- ausschließlich die drei finalen Ergebnisgrade aus DS-045,
- neue Formatfreigaben sowie E1/E3 auf realen Zielplattformen.
