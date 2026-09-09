# Product Vision

Stand: 08.09.2026 · verbindliches Zielbild beider Produkte und beider Standalone-Betriebsarten

## Vision in einem Satz

GBH DataSecure ermöglicht Fachanwenderinnen und Fachanwendern, sensible
Geschäftsdokumente vollständig lokal und offline zu de-identifizieren. Dafür
gibt es zwei getrennte Endnutzerprodukte mit demselben geprüften Core: das
Claude-/Cowork-Plugin und DataSecure Standalone ohne Claude, Cowork, MCP,
Agenten oder Internet.

Standalone besitzt zwei gleichwertige Kernfunktionen: **In Markdown umwandeln
und anonymisieren** sowie **Nur in Markdown umwandeln**. Die zweite Funktion
macht Inhalte unterschiedlicher Ausgangsformate für eine spätere KI-Nutzung
zugänglich, ohne Namen, Unternehmen oder andere personenbezogene Inhalte zu
entfernen. Sie ist kein optionaler Debug- oder Supportpfad und darf bei
Refactoring nicht aus dem Produktziel verschwinden (DS-085). Sie ist im aktuellen
Standalone-Quellstand verfügbar; die Startseite verlangt eine ausdrückliche
Betriebsartwahl statt einer Vorbelegung (DS-086). Zielhost-/Anwenderfreigaben bleiben
getrennt vom technischen Implementierungsnachweis.

DOCX und breite Standalone-Quellen werden nach DS-087/090 nicht durch parallele
Anonymisierungsparser verarbeitet: Der gemeinsame lokale Konverter erzeugt eine
neutrale Markdown-Extraktion, die entweder ausdrücklich unverändert exportiert
oder ohne sichtbare Roh-Zwischenablage durch den gemeinsamen Privacy-Core geführt
wird. Dadurch bleiben beide Kernfunktionen fachlich getrennt, teilen aber genau
eine Format-Extraktionsschicht.

Im Cowork-Plugin ergänzt DS-093 denselben Grundsatz gezielt für XLSX und PPTX:
Der bereits ausgelieferte isolierte Office-Parser erzeugt lokal die neutrale
Markdown-Repräsentation; nur diese wird anonymisiert. PDF, Scan-PDF und Bilder
bleiben dort gesperrt, bis ihre kompakte lokale Runtime im Cowork-Paket und auf
den Zielhosts nachgewiesen ist. Diese Erweiterung erzeugt keinen zusätzlichen
Nutzerdialog und keine Vollständigkeitszusage für den ursprünglichen Container.

DataSecure benötigt keine zusätzliche System-VM. Auch die Abnahmeplanung
verwendet echte lokale Zielrechner statt eigens eingerichteter VMs (DS-062).
Auch ein zusätzliches Windows-Benutzerkonto wird nicht vorausgesetzt (DS-063).
Sichere Testtrennung im vorhandenen Konto ist Entwicklungsarbeit.
DS-065 vereinfacht lokale Arbeitsdaten: keine zusätzliche Verschlüsselung,
kein Schlüsselbund, keine Schlüsseldatei und kein Passwort. Standalone führt
über Auswahl → Modus/Ziel → Start → lokale Verarbeitung → Ergebnisse; im
Plugin bleibt Anonymisierung die verbindliche Grenze vor einer KI-Auswertung.
DS-067 legt zusätzlich genau einen Nutzerweg fest: Plugin-ZIP oder derselbe private
Marketplace-Build. Ein MCPB bleibt internes Engineering. Bilder besitzen keinen
auswählbaren Modus und bleiben lokal zurückgehalten. Nur temporäre Arbeits- und
Reviewdaten unterliegen 0–14 Tagen; Quellen/Originale und fertige Exporte werden
niemals automatisch gelöscht.

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

1. **Cowork-gesteuert, Originale lokal verarbeitet:** Cowork ist Einstieg, Status-
   und Ergebnisort; die Modellverarbeitung darf cloudbasiert sein, Originale und
   rohdatenhaltige Entscheidungen bleiben an der lokalen DataSecure-Grenze.
2. **Eigenständiges Standalone-Produkt:** Standalone verwendet denselben Core
   und dasselbe Sicherheitsframework, besitzt aber zweckbezogene Allowlisten,
   Coverageentscheidungen sowie eine eigene Desktop-UI,
   Distribution und getrennte Produktdaten. Es enthält keinen Claude-
   Folgeschritt und benötigt weder MCP noch Skills oder Agenten. Reine
   Markdown-Konvertierung überspringt ausschließlich die Anonymisierung und
   deren Fachreview, nicht Quellen-, Format-, Coverage- oder Exportprüfung.
   Extraktions-/OCR-Hinweise verhindern dabei nicht die Ausgabe lesbarer Texte:
   sie werden am Ende mitgeteilt, ohne weitere Bestätigungsdialoge.
3. **Ein einfacher Normalablauf:** Standalone zeigt die gewählten Dateien,
   den Modus und das Ziel vor einem expliziten Start. Im Plugin startet die
   lokale Auswahl den vereinbarten Anonymisierungsauftrag; zusätzliche fachliche
   Entscheidungen nur bei echter Unsicherheit, kein Formular je Datei.
4. **Fachinhalt vor Formularismus:** Rollen, Methoden, Technologien,
   Zertifizierungen, Tätigkeiten und Zeiträume bleiben möglichst erhalten.
5. **Fortsetzen statt neu beginnen:** Dauerhafte Checkpoints sichern bereits
   abgeschlossene Arbeit über Fehler, Abbruch und Neustart hinweg.
6. **Ehrliche Ergebnisse:** vollständig verarbeitet, sicher verwendbar mit
   transparenten Auslassungen oder sicher gestoppt.

## Experience-Prinzipien

- Im Plugin: ein Anonymisierungs-Skill und zwei natürliche Absichten:
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
- Klare Dateien benötigen keinen Review. Mehrdeutigkeiten werden nach der Analyse
  in einem einzigen lokalen Sammelreview mit direkten fachlichen Aktionen,
  sichtbarem Fortschritt und ausdrücklicher Abschlussfreigabe entschieden.
- Im Standalone-Produkt: ein Fenster mit Betriebsart, Auswahl, Verarbeitung,
  gegebenenfalls Sammelprüfung und Ergebnis. In beiden Betriebsarten derselbe
  Ablauf: **Auswählen** oder **Hineinziehen**, dann **Starten**. Keine zusätzlichen
  Freigaben pro Datei. Reine Konvertate sind sichtbar **nicht anonymisiert**;
  der Anwender entscheidet außerhalb von DataSecure über die spätere KI-Nutzung.
- Standalone startet immer auf **Start** mit einer kurzen Erklärung beider
  Funktionen. **Verarbeiten** und die Betriebsart sind anfangs nicht vorbelegt.
  Abschluss, Neustart und vorhandene Stapel wechseln die Ansicht nicht automatisch.
  **Verlauf** zeigt die letzten 20 Verarbeitungen, neueste zuerst, mit Datum,
  Betriebsart, Dateizählern und Status. Ergebnisse und Fortsetzung sind jeweils
  an genau diesen Lauf gebunden; die Zuordnung ist nur für Anonymisierungsläufe
  verfügbar. Die Anzeigegrenze löscht nichts.

## Datenschutz- und Sicherheitsversprechen

- Originale werden niemals verändert, verschoben oder gelöscht.
- Chat-Anhänge sind kein sicherer Originaleingang; Quellen werden lokal gewählt.
- Originalbytes, Namen, Pfade, Pixel, Mappings, Rohwerte und Review-Kontext werden
  nicht an Claude übergeben.
- Temporäre Roh- und Review-Daten liegen lokal ohne zusätzliche Verschlüsselung;
  sie sind mit passenden Dateirechten lesbar. Neue Rohkopien werden nach Erfolg
  sofort, bei offenen Aufträgen spätestens nach 14 Tagen gelöscht; neue
  Reviewkopien folgen ihrer konfigurierten Frist. Verschlüsselte Altbestände werden
  nicht migriert oder gelöscht; bei Bedarf wird das Original neu ausgewählt.
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
- Höchstens 200 Dateien und 500 MiB je Stapel, ohne feste Seitenbegrenzung.
- Genau ein Markdown-Ergebnis pro Quelle. Cowork-Anonymisierung verwendet
  stets neutrale Ergebnisnamen. Standalone erhält die gewählte relative
  Ordnerstruktur und lässt den Anwender für Anonymisierung zwischen neutralen
  Dateinamen (Standard) und `<Quellbasisname>-anonymisiert.md` wählen; das
  laufbezogene Mapping nennt den tatsächlich erzeugten relativen Pfad. Reine Konvertierung behält
  Struktur und Quellbasisnamen und benötigt keine Zuordnungsdatei (DS-089).
- Bei reiner Konvertierung bleibt der gesamte extrahierbare fachliche Text
  einschließlich Namen, Unternehmen, Kontaktdaten und Tabellenwerten erhalten.
  **Vollständig** setzt belegte Format-Coverage voraus: fehlender Scan-/Bildtext,
  nicht extrahierbare Objekte oder Parserabbrüche werden nicht still übergangen.
  Eine Markdown-Datei kann das ursprüngliche Office-/PDF-Layout nicht identisch
  rekonstruieren. Auch reine Konvertierung führt keine Makros oder Fremdinhalte aus.
- Bei der Standalone-Markdown-first-Anonymisierung wird ausschließlich die
  vertraglich gültige, nichtleere Markdown-Repräsentation anonymisiert. Das
  Ergebnis ist keine anonymisierte DOCX-, XLSX-, PPTX-, PDF- oder Bilddatei.
  Eine bekannte unvollständige Quellenextraktion darf ein anonymisiertes
  Markdown-Ergebnis liefern, wird aber separat und unmissverständlich angezeigt.
- Konvertate liegen unter ihrem Quellbasisnamen in `DataSecure-Markdown/Lauf-…`,
  getrennt von anonymisierten Ergebnissen in `DataSecure-Output/Lauf-…`. Nur der
  Anonymisierungslauf besitzt eine eigene laufbezogene Zuordnung.
  Es gibt keinen automatischen Upload an eine KI.
- Bilder bleiben lokal; nur ausreichend sicherer und erneut geprüfter OCR-Text
  darf in Markdown erscheinen.
- Passwortgeschützte oder verschlüsselte Quellen werden nicht entschlüsselt und
  getrennt als nicht verarbeitet ausgewiesen.

## Plattform- und Distributionstrategie

- Produktive Cowork-Freigabe beginnt mit Windows x64 sowie macOS Intel/Apple
  Silicon; Claude Desktop/Cowork ist kein Linux-Produktweg. Standalone besitzt
  zusätzlich ein eigenständiges Linux-x64-glibc-Paket. Technische Paketevidenz
  und menschliche Zielgeräteevidenz bleiben auf jeder Plattform getrennt;
  Windows ARM64 ist nicht implementiert.
- Anwender installieren weder Node.js noch Python. Zielpakete enthalten die
  benötigte Laufzeit.
- Ein organisationsverwaltetes Marketplace-Produkt; manuell getrennte
  Windows-x64-, macOS-x64- und macOS-arm64-ZIPs. MCPB bleibt ausschließlich
  internes Engineering-Artefakt und ist kein Anwenderweg.
- Es gibt keine Signierungs- oder Zertifizierungspflicht. Reproduzierbare Builds,
  Hashbindung, SBOM, Paketgrenzen und echte Zielsystemabnahmen bleiben Pflicht.

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
4. Unternehmensrollout nach Plattform-, Paketintegritäts- und Lifecycle-Evidenz,
5. öffentlicher Marketplace erst nach erfolgreichem internem Rollout.
