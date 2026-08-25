# Product Vision

Stand: 25.08.2026 · verbindliches Zielbild nach dem Cowork-/UX-/Privacy-Grill

## Vision in einem Satz

GBH DataSecure ermöglicht Fachanwenderinnen und Fachanwendern, sensible
Geschäftsdokumente aus Claude Cowork heraus mit einer einzigen bewussten lokalen
Auswahl offline zu de-identifizieren, bevor Claude ausschließlich freigegebene
Markdown-Arbeitsfassungen verwendet.

## Nutzerproblem

Mitarbeitende in IT und Health-IT wollen Verträge, Profile, Ausschreibungen,
Tabellen, Präsentationen, PDFs, Scans und Bilder mit KI weiterverarbeiten. Sie
sollen dafür weder Originale in einen Chat laden noch Dokumentprofile, Parser,
OCR, Speicherorte oder technische Recovery-Schritte bedienen. Fehler dürfen nicht
den ganzen Stapel vernichten oder eine erneute Auswahl erzwingen.

## Zielgruppen

- Fachanwenderinnen und Fachanwender in IT, Entwicklung, Test, Product Ownership,
  Scrum, Business Analyse und Health-IT,
- IT-Betrieb, Informationssicherheit und Datenschutz,
- Plugin-/Marketplace- und Endgeräteadministration.

## Wertversprechen

1. **Cowork-gesteuert, lokal ausgeführt:** Cowork ist Einstieg, Status- und
   Ergebnisort; Originale und rohdatenhaltige Entscheidungen bleiben lokal.
2. **Eine bewusste Normalaktion:** Datei oder Ordner auswählen und anschließend
   nur bei einer echten fachlichen Unsicherheit entscheiden.
3. **Fachinhalt vor Formularismus:** Rollen, Methoden, Technologien,
   Zertifizierungen, Tätigkeiten und Zeiträume bleiben möglichst erhalten.
4. **Fortsetzen statt neu beginnen:** Dauerhafte Checkpoints sichern bereits
   abgeschlossene Arbeit über Fehler, Abbruch und Neustart hinweg.
5. **Ehrliche Ergebnisse:** vollständig verarbeitet, sicher verwendbar mit
   transparenten Auslassungen oder sicher gestoppt.

## Experience-Prinzipien

- Ein Plugin, ein Anonymisierungs-Skill und zwei natürliche Absichten:
  `nur anonymisieren` sowie `anonymisieren und auswerten`.
- Keine separate Companion-App im Normalweg. OS-eigene Picker und ausschließlich
  lokale Rohdatenprüfung bilden die sichtbare Sicherheitsgrenze.
- Eine eingebettete MCP-App ist eine progressive, inhaltsfreie Komfortfunktion;
  Text-/OS-Fallback bleibt vollständig funktionsfähig.
- Kurzer MCP-Start, dauerhafter lokaler Checkpoint, unabhängiger
  Hintergrundworker und nicht blockierender Abschluss.
- Höchstens eine nutzerseitige Batch-Freigabe für die beabsichtigte
  Claude-Auswertung, soweit der Host dies zulässt.
- Alltagssprache zuerst; technische Details nur bei Bedarf.

## Datenschutz- und Sicherheitsversprechen

- Originale werden niemals verändert, verschoben oder gelöscht.
- Chat-Anhänge sind kein sicherer Originaleingang; Quellen werden lokal gewählt.
- Originalbytes, Namen, Pfade, Pixel, Mappings, Rohwerte und Review-Kontext werden
  nicht an Claude übergeben.
- Temporäre Roh- und Review-Daten sind benutzergebunden verschlüsselt und werden
  nach Erfolg sofort, bei offenen Aufträgen spätestens nach 14 Tagen gelöscht.
- Der Verarbeitungskern arbeitet offline, ohne Telemetrie, Crashübermittlung oder
  eigene Netzwerkkommunikation.
- Dokumentinhalt ist nicht vertrauenswürdige Nutzlast. Makros, Skripte, Programme
  und externe Nachladebeziehungen werden niemals ausgeführt.
- DataSecure löscht ausschließlich eigene verwaltete Artefakte.

## Produktumfang

- Ziel: TXT, Markdown, CSV, DOCX, XLSX, PPTX, PDF, Scan-PDF, PNG, JPEG und BMP.
  Ein Format wird erst nach vollständigen Sicherheits- und Coverage-Gates aktiv.
- Datei- und rekursive Ordnerauswahl ohne Verfolgung von Symlinks, Junctions,
  Reparse Points oder externen Links.
- Höchstens 100 Dateien und 500 MiB je Stapel, ohne feste Seitenbegrenzung.
- Genau ein neutral benanntes Markdown-Ergebnis pro Quelle sowie ein dauerhaftes,
  ausschließlich lokales Mapping.
- Bilder bleiben lokal; nur ausreichend sicherer und erneut geprüfter OCR-Text
  darf in Markdown erscheinen.
- Passwortgeschützte oder verschlüsselte Quellen werden nicht entschlüsselt und
  getrennt als nicht verarbeitet ausgewiesen.

## Plattform- und Distributionstrategie

- Produktive Cowork-Freigabe beginnt mit Windows x64 sowie macOS Intel/Apple
  Silicon. Die Engine bleibt portabel; Linux und Windows ARM64 benötigen eigene
  Host- und Zielgeräteevidenz.
- Anwender installieren weder Node.js noch Python. Zielpakete enthalten die
  benötigte Laufzeit.
- Ein organisationsverwaltetes Marketplace-Produkt; manuell getrennte
  Windows-x64- und macOS-Universal-ZIPs. MCPB bleibt ein optionaler Fallback.
- Entwicklungspiloten dürfen unsigniert sein. Eigene native
  Sicherheitskomponenten müssen vor breitem Unternehmenseinsatz signiert sein.

## Erfolgskriterien

- Picker und Startannahme reagieren auf Referenzhardware jeweils innerhalb von
  zwei Sekunden; Verarbeitung hält keinen Cowork-Aufruf länger als zehn Sekunden
  offen.
- Automatische, ressourcenschonende Parallelität mit höchstens 25 Prozent des
  verfügbaren Speichers beziehungsweise zunächst zwei GiB, soweit ein getestetes
  OCR-Profil keine eng begrenzte Ausnahme benötigt.
- Kein unbegründeter Performance-Rückschritt von mehr als zehn Prozent gegenüber
  dem freigegebenen Vorgänger auf derselben Referenzhardware.
- Keine offenen P0-/P1-Produktbefunde vor Unternehmensrollout.
- Automatisierte synthetische Gates und echte Cowork-Abnahmen auf jeder
  freigegebenen Plattform.

## Nicht-Ziele

- keine Garantie rechtlicher Anonymität oder Produktzertifizierung,
- keine layoutidentische Rekonstruktion von DOCX, XLSX, PPTX oder PDF,
- keine Passwortentschlüsselung,
- kein Cloud-OCR und keine automatische Telemetrie,
- keine autonome Rechts-, HR-, Recruiting- oder Fachfreigabe,
- keine Rohdatenprüfung durch Claude oder eine nicht belegbar lokale Cowork-UI.

## Rollout

1. synthetischer Technikpilot,
2. interner Abnahmepilot mit synthetischen oder ausdrücklich freigegebenen Daten,
3. kontrollierter Echtdatenpilot nach Datenschutz-/Security-Freigabe,
4. Unternehmensrollout nach Plattform-, Signierungs- und Lifecycle-Evidenz,
5. öffentlicher Marketplace erst nach erfolgreichem internem Rollout.

