# Schritt-für-Schritt-Abnahme

Jeden Lauf auf dem in `EVIDENCE_LOG_TEMPLATE.csv` genannten Zielsystem durchführen.
„PASS“ bedeutet: alle erwarteten Beobachtungen stimmen. „FAIL“ bedeutet unerwartete
Freigabe, Originaloffenlegung oder eine nicht erklärte Abweichung. „BLOCKED“ bedeutet:
der vorgesehene Zielweg ist nicht verfügbar und bleibt offene Evidence.

## A – Installation, Host und Start

### H-01 – Windows, frische Installation

1. Neues lokales Windows-Testkonto verwenden und das freigegebene Artefakt installieren.
2. Claude vollständig beenden, neu starten und in **einer neuen Cowork-Unterhaltung**
   „Prüfe den Status von DataSecure“ eingeben.
3. Version, lokale Verbindung und Privacy-Ordner prüfen; dann noch keine Datei wählen.
4. Den Lauf als PASS erfassen, wenn Status und lokaler Ordner verfügbar sind, keine
   zusätzliche Runtime verlangt wird und der Dateidialog erst nach einem lokalen Tool-
   Aufruf erscheint.

Deckt ab: BL-010.1, BL-010.2, BL-010.7, BL-010.8, BL-051.1.

### H-02 – macOS, frische Installation

H-01 auf einem frischen macOS-Testkonto wiederholen. Danach in Lauf B auch die vier
Positivformate ausführen. Bei fehlender Runtime, nicht nativer Entscheidung oder
abweichendem Fehlercode BLOCKED statt PASS erfassen.

Deckt ab: BL-010.1, BL-010.3, BL-010.8, BL-012.8, BL-051.1.

### H-03 – Linux-Host, frische Installation

H-01 auf dem definierten Claude-Code-Host wiederholen. Hier nicht Claude Desktop
behaupten: nur den ausdrücklich unterstützten lokalen Host prüfen. Mit dem normalen
Textstapel fortfahren und CPU-/RAM-/Timeout- bzw. Kindprozess-Stopp dokumentieren.

Deckt ab: BL-010.1, BL-010.4, BL-010.8, BL-011.9, BL-051.1.

### H-04 – Negative Hostklassen

1. Je eine neue Sitzung in Claude Web, Mobile, Cloud/Scheduled und Desktop ohne
   verbundenen Local MCP öffnen.
2. Den Satz „Anonymisiere diese lokale Datei mit DataSecure“ eingeben – **keine Datei
   hochladen**.
3. Erwartet: kein Ordner-/Dateidialog, kein Ersatz-Connector und kein Originalzugriff.
4. In Cowork mit aktivem Local MCP denselben Satz ausführen: erst `privacy_status`,
   danach darf der lokale Pfad starten.

Deckt ab: BL-010.7, BL-041.4, BL-051.6.

## B – Normaler Inhaltspfad in einem Lauf

### H-05 – Vier freigegebene Formate

1. `01-positive` vollständig in den lokalen `Input`-Ordner kopieren.
2. Claude sagen: „Anonymisiere die Dateien lokal mit DataSecure.“ Keine Profilart
   angeben und nichts anhängen.
3. Anzahl bestätigen und verarbeiten lassen.
4. Für jedes Ergebnis lokal vergleichen: `Lina Testfeld`, `Nordstern Medizin IT GmbH`,
   `lina.testfeld@privacy-example.test`, Telefon und IBAN fehlen; „Product Owner",
   „HL7 FHIR“, „ISTQB Certified Tester Foundation Level“ und „PSM II“ bleiben.
5. Prüfen, dass TXT, MD, CSV und DOCX jeweils ein Markdown-Paket ergeben und dass
   Claude weder Quelldateinamen noch Pfade anzeigt.

Deckt ab: BL-021.1, BL-021.2, BL-022.1, BL-041.1, BL-041.3.

### H-06 – Kontext und Pseudonyme

1. In den vier Ergebnissen kontrollieren, ob derselbe direkte Wert je Dokument
   konsistent ersetzt ist und ein Zertifikatsaussteller nicht als Arbeitgeber
   verschwindet.
2. Den Ergebnisinhalt zu einer fachlichen Zusammenfassung verwenden lassen.
3. Erwartet: Claude setzt die ursprüngliche Aufgabe mit freigegebenem Markdown fort;
   kein erneuter Zugriff auf `Input`, keine Rohwert-Mappingtabelle.

Deckt ab: BL-030.2, BL-031.1, BL-041.2.

### H-07 – Verständlicher Status

1. Während und nach H-05 die Statusanzeige ansehen.
2. Prüfen, ob Anzahl, Erfolg, sicherer Stopp und nächste sichere Aktion ohne
   Dateinamen/Queue-Position verständlich sind.
3. Bei Mehrdateien zusätzlich den lokalen Mapping-Export öffnen, aber nicht in den
   Chat geben.

Deckt ab: BL-012.6, BL-012.7, BL-041.5.

## C – Bilder, Mehrdeutigkeit und lokale Entscheidungen

### H-08 – DOCX mit Bild

1. `02-review/personnel-profile-with-image.docx` allein in `Input` legen.
2. Starten, dabei Bilder **nicht** zur Freigabe an Claude geben.
3. Erwartet: Text wird nur dann freigegeben, wenn der Text-Gate besteht; die Grafik
   bleibt ausschließlich lokal in `Needs Visual Review`. Eine Chatantwort darf sie
   nicht freigeben.
4. Den lokalen Bild- und Reviewweg mit Tastatur testen (Tab, Enter, Escape) und bei
   100 % sowie 200 % Skalierung wiederholen.

Deckt ab: BL-012.2, BL-012.3, BL-012.5, BL-042.2.

### H-09 – Mehrdeutiger Zertifikats-/Firmenfall

1. `02-review/ambiguous-certificate-provider.txt` einzeln verarbeiten.
2. Erwartet: `AMBIGUITY_REVIEW_REQUIRED` oder der dokumentierte sichere Stopp; es
   entsteht kein Paket und kein geratenes Ergebnis.
3. Falls eine lokale Entscheidung angeboten wird, nur dort „als Zertifikatsanbieter
   erhalten“ wählen. Danach muss der erneute Text-Gate bestehen.

Deckt ab: BL-031.1, BL-032.1.

## D – Format-, Parser- und Storage-Grenzen

### H-10 – Gesperrte Formate

1. Jede Datei aus `03-blocked` **einzeln** in `Input` legen und starten.
2. Erwartet: XLSX/PPTX/PNG sicher mit Format-/Coverage-Fehler; PDF mit
   `PDF_COVERAGE_UNVERIFIED`. Kein Output-Paket, Original bleibt lokal.
3. Die DOCX-Datei `malformed.docx` separat nutzen: erwarteter Parser-Coverage-Stopp,
   niemals ein Teiltext.

Deckt ab: BL-022.2, BL-022.3, BL-023.1, BL-023.2, BL-023.3, BL-023.4, BL-024.3.

### H-11 – Unsicherer Speicher und Inhaltsgrenze

1. Nur mit einem IT-Testkonto einen OneDrive-/iCloud-/Dropbox- oder Netzwerkpfad als
   DataSecure-Ordner konfigurieren.
2. Startversuch mit einer Positivdatei: erwarteter Storage-Stopp ohne Verarbeitung.
3. Den normalen lokalen Speicher zurückstellen. Dann den durch die Security-Planung
   vorbereiteten Reparse-/Swap-/ressourcenbeschränkten Fall ausführen.
4. Erwartet: keine Traversierung, kein unerwarteter Netzwerkzugriff, kein Teilpaket.

Deckt ab: BL-011.6, BL-020.1, BL-020.2, BL-020.3.

### H-12 – Visual-/OCR-Backend

Auf jedem Zielsystem mit dem Bild-DOCX aus H-08 prüfen, dass ein fehlendes oder
gestopptes OCR-Backend nur zur lokalen Rückhaltung führt. Es darf nicht in einen
unsicheren Direktpfad oder in eine Claude-Freigabe zurückfallen.

Deckt ab: BL-024.2, BL-042.2.

## E – Stapel, Abbruch und Wiederaufnahme

### H-13 – 100 Dateien

1. `04-batch-100` in `Input` kopieren und die Anzahl 100 bestätigen.
2. Einmal mit Stop an ungefähr Datei 1, einmal bei ungefähr 50 und einmal kurz vor
   Ende durchführen. Vor jedem Durchlauf lokale Testdaten neu erzeugen.
3. Claude danach schließen/neu öffnen und ausdrücklich „letzten DataSecure-Stapel
   fortsetzen“ sagen.
4. Erwartet: keine doppelte Freigabe, kein neu ausgewählter Stapel, kein Verlust der
   bereits sicheren Ergebnisse. Lokales Mapping enthält genau eine Zuordnung je Erfolg.

Deckt ab: BL-011.3, BL-011.7, BL-041.5, BL-051.3.

### H-14 – Crash, Reparse und Ressourcen

Nur Security-Test: den kontrollierten Worker-Abbruch, die private Arbeitskopie-
Manipulation und die angegebene Reparse-Prüfung ausführen. Der nächste Start muss
sicher aufräumen bzw. wiederaufnehmen; keine Quelle und kein fremder Ordner darf
gelöscht werden.

Deckt ab: BL-011.8, BL-011.9, BL-041.5.

### H-15 – Schlüssel und Passwortweg

Nur Security-Test: Keyring-/Kurzzeitspeicher- und Verlustfall nach der technischen
Anleitung prüfen. Ein fehlender Schlüssel oder ein Passwortfehler muss lokal, im RAM
und ohne Ersatzschlüssel stoppen. Keine Passwörter ins Evidence-Log schreiben.

Deckt ab: BL-030.2, BL-032.2.

## F – Ausgabe, Manipulation, Retention

### H-16 – Freigegebenes Paket und Mapping

Nach H-05/H-13 sicherstellen: Claude kann nur das aktuelle anonymisierte Markdown
lesen, in Seiten von höchstens zehn. Die dauerhafte Mapping-CSV bleibt lokal. Ein
abgebrochener Chat verändert den abgeschlossenen Batch nicht.

Deckt ab: BL-040.2, BL-041.2, BL-051.3.

### H-17 – Manipulationsgegenprobe

Nur Security-Test: nach Freigabe eine lokale Ergebnisdatei oder ein Manifest nach dem
dokumentierten Testverfahren verändern und einen Leseversuch auslösen. Erwartet:
keine Ausgabe, keine Umgehung über Paket-/Asset-ID oder alte Capability.

Deckt ab: BL-020.1, BL-020.2.

### H-18 – Retention und Löschung

1. `privacy_status` vor/nach Test prüfen.
2. `purge_local_data` mit der erforderlichen ausdrücklichen Bestätigung und einem
   eingeschränkten Scope ausführen.
3. Erwartet: nur der gewählte lokale Scope wird gelöscht, Audit-Metadaten bleiben
   inhaltsfrei; ein gesperrtes Testobjekt zeigt einen konkreten Löschfehler.

Deckt ab: BL-011.5, BL-012.6.

## G – Versionen und Zielplattformen

### H-19 – ZIP und Marketplace

H-01 bis H-05 je einmal aus ZIP und Marketplace auf Windows, macOS und Linux-
Host wiederholen. Je Weg eine frische Installation verwenden; die Quelle der
Installation und der Artefakt-Hash genügen als Evidence.

Deckt ab: BL-010.2, BL-010.3, BL-010.4, BL-051.1, BL-051.2.

### H-20 – Update und Rollback

1. Ausgangsversion installieren, H-05 ausführen, auf Zielversion aktualisieren.
2. Konfiguration und synthetische Aufbewahrungsmetadaten prüfen.
3. Auf Ausgangsversion zurückrollen, H-05 erneut ausführen, danach wieder aktualisieren.
4. Erwartet: eindeutige Version, keine widersprüchlichen Pakete und kein verlorenes
   Ergebnis.

Deckt ab: BL-010.6, BL-010.8, BL-051.4, BL-051.5.

### H-21 / H-22 – Mac- und Linux-Sonderpfade

Auf macOS (H-21) und Linux (H-22) den Bild-, Text- und Mehrdeutigkeitsfall erneut
ausführen. Zusätzliche Belege: tatsächlicher nativer Dialog bzw. POSIX-Supervisor,
keine versteckte Windows-Abhängigkeit und sichere Stoppcodes.

Deckt ab: BL-012.8, BL-024.2, BL-011.9.

## H – Menschen und Fachlichkeit

### H-23 – Beobachtete Nutzung

Eine Person ohne MCP-/Node-/OCR-Erfahrung bekommt nur Abschnitt „Einmal vorbereiten“
und H-05. Beobachten, aber nicht helfen. PASS nur, wenn sie den lokalen Startweg,
das Ergebnis und die Bildgrenze versteht und innerhalb von drei bewussten Aktionen
zum ersten Ergebnis kommt.

Deckt ab: BL-052.1, BL-052.4.

### H-24 – Health-IT-Fachprüfung

Ein Health-IT-Fachexperte prüft die lokalen Ergebnisse aus H-05 gegen die gemeinsame
Prüfliste: Rolle, Technologie, Zertifizierungen und fachlicher Leistungsinhalt sind
verwendbar; Person, Kontakt, Kunde/Arbeitgeber und Kontodaten sind nicht sichtbar.

Deckt ab: BL-052.2.

### H-25 – Datenschutzprüfung

Datenschutz prüft ausschließlich den Ablauf und die inhaltsfreien Evidence-Zeilen:
Originalgrenze, keine Raw-Logs, Aufbewahrung, Purge, Hinweis auf Restrisiko und die
Trennung von De-Identifizierung und Rechtsanonymität. Die Person gibt keine
Rechtsberatung im Testprotokoll, sondern PASS/FAIL/BLOCKED zum vereinbarten Zweck.

Deckt ab: BL-052.3.

### H-26 – Cowork-Berechtigungen

In Cowork denselben Start in den Einstellungen Manual, Auto und Skip ausführen.
Prüfen, dass sichtbare Toolberechtigung und tatsächlicher Ablauf übereinstimmen;
bei Skip darf kein unerwarteter lokaler Zugriff stattfinden.

Deckt ab: BL-041.4, BL-042.2, BL-051.5.
