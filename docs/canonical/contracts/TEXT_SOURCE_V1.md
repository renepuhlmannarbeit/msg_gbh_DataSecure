# Text- und Markdown-Quellvertrag V1

Status: **Engineering-Vertrag, Release-Gate geschlossen** · Story: BL-021.1

TXT und Markdown werden als inerte Dokumentquelle behandelt. DataSecure rendert
kein HTML, folgt keinem Link, lädt keine Bilder und führt weder Frontmatter noch
Codeblöcke aus. Markdown-Syntax bleibt fachlicher Quelltext und durchläuft danach
dieselbe Profil-, Entitäts-, Review- und Residualprüfung wie anderer Text.

## Byte- und Zeichenvertrag

- Eingabe ist ausschließlich wohlgeformtes UTF-8; eine optionale UTF-8-BOM wird
  entfernt. Fehlerhafte Bytefolgen stoppen mit einem inhaltsfreien Parserfehler.
- CRLF und CR werden zu LF, Unicode wird zu NFC normalisiert. Weitere fachliche
  Zeichen und Markdown-Strukturen werden im Parser nicht umgeschrieben.
- C0-Steuerzeichen außer Tab, LF und CR sowie DEL stoppen. Damit können weder
  Terminalsteuerung noch NUL als unsichtbare Struktur in den Output gelangen.
- Die bestehenden Byte-, Zeichen-, Laufzeit- und Parserausgabegrenzen gelten.
- Der vollständige Nicht-Leerraum-Inhalt muss durch den Content-Graph V1
  positionsgenau abgedeckt sein.

## Sicherheits- und Release-Gate

Links, Bilder, Raw HTML, Autolinks, Tabellen, Listen, Zitate, Codeblöcke und
Frontmatter bleiben literal und inert. Der Parser erzeugt daraus keine URL- oder
Dateisystemoperation. Netzwerkfreiheit wird unabhängig durch BL-020.3 erzwungen.
Erkannte Identifikatoren innerhalb von Linktext, Ziel, HTML und Code sind nicht von
der Datenschutzprüfung ausgenommen.

Die Parsercoverage allein aktiviert Markdown noch nicht im Release-Manifest.
Freigabe setzt zusätzlich End-to-End-, Skill-, Paket-, Drei-OS- und Nutzerabnahme
voraus; bis dahin bleibt `.md` mit `FORMAT_COVERAGE_UNVERIFIED` geschlossen.

## Wiederverwendung

Die Implementierung verwendet Nodes WHATWG-kompatiblen `TextDecoder` mit
`fatal: true`. `markdown-it` bleibt Referenz-/Differentialkandidat, wird aber nicht
in den Produktpfad aufgenommen: Sein Zweck ist Parsing und Rendering, während
DataSecure den Original-Markdown quelltreu als inerte Eingabe erhalten muss. Eine
zusätzliche Parser- und Abhängigkeitskette würde dafür keinen Sicherheitsgewinn
liefern.

## Primärquellen

- [Node.js `TextDecoder`](https://nodejs.org/api/util.html#class-utiltextdecoder)
- [markdown-it](https://github.com/markdown-it/markdown-it)
- [CommonMark specification](https://spec.commonmark.org/)
