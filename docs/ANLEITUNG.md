# GBH DataSecure einrichten

Anleitung für Anwenderinnen und Anwender ohne Vorkenntnisse.
Windows 10/11 x64 und macOS; Linux nur über einen lokalen Claude-Code-Host · ca. 20 Minuten.

> **Nur Engineering-Abnahme:** RC38 darf ausschließlich mit synthetischen
> Testdokumenten verwendet werden. Keine echten Mitarbeiter-, Bewerber-, Kunden-
> oder Vertragsdaten verarbeiten. Ein Nutzerpilot beginnt erst nach Freigabe des
> lokalen Companions, bestandenem Installationstest und dokumentierter
> Pilotfreigabe. Die lokale TXT-/Markdown-/CSV-/DOCX-Review-Aktion ist technisch umgesetzt; die
> vollständige visuelle Human-Presence- und Plattformabnahme fehlt noch. Eine
> Signatur oder Zertifizierung ist keine Voraussetzung.

> **Plattformstatus:** Windows x64 besitzt derzeit die vollständigere lokale
> Prüfoberfläche und Bildverarbeitung. Auf macOS ist für TXT/Markdown/CSV/DOCX zusätzlich eine
> lokale Beibehalten/Anonymisieren-Entscheidung für Zertifikatsaussteller vorbereitet;
> Linux besitzt denselben begrenzten Entscheidungsweg über Zenity oder KDialog. Bis
> zu echter Mac-/Linux-Abnahme bleiben beide Engineering-Status. Bilder bleiben lokal
> oder werden auf Wunsch entfernt. Der Plugin-ZIP
> benötigt eine nachgewiesene Node-22.13+-Auflösung; nur beim MCPB dokumentiert
> Anthropic eine eingebaute Node-Runtime. Installieren Sie keine Laufzeit selbst.

> **Host-Grenze:** Die Claude-Desktop-App wird laut aktueller Anthropic-Dokumentation
> auf Windows und macOS angeboten, nicht auf Linux. Linux ist deshalb erst nach einer
> eigenen Claude-Code-CLI-Installationsabnahme nutzbar; eine Linux-Desktop-Installation
> wird nicht behauptet. Für Originale reicht ein sichtbarer Skill, Plugin-Eintrag
> oder Connector niemals aus: Der lokale Betriebssystem-Mehrfachpicker muss in genau
> der aktuellen Sitzung erscheinen. Ohne diesen Nachweis stoppt DataSecure vor jedem
> Datei- oder Ordnerzugriff. Verwenden Sie dann weder Upload noch Computer-Use, allgemeinen
> Dateizugriff oder einen anderen Connector als Ersatz. Web, Mobil, Cloud-/Scheduled
> und Desktop mit getrenntem Local MCP sind im Pilot NO-GO für Originale. Bereits
> vorher lokal bereinigtes Markdown dürfen Sie dort normal weiterverwenden.

---

## Wozu das Ganze

Wenn Sie einen Lebenslauf, ein Mitarbeiterprofil, einen Vertrag oder einen
Kundenvorgang von Claude auswerten lassen, sieht Claude sonst das Original — mit
Namen, Anschriften, Telefonnummern, Kunden- und Projektbezeichnungen. Bei
personenbezogenen Daten soll das nicht passieren.

DataSecure schiebt im vorgesehenen lokalen Ablauf eine Prüfstelle davor. Die Datei
bleibt auf Ihrem Rechner. Ein kleines Programm liest sie dort, ersetzt unterstützte
erkannte Identifikatoren durch Platzhalter und legt eine bereinigte Fassung ab.
Über die DataSecure-Tools erhält Claude nur diese Fassung. Ein normaler Upload oder
Dateizugriff außerhalb dieses Ablaufs umgeht die Grenze.

Fachliches soll so weit wie unterstützt erhalten bleiben. Aus „Erika Beispiel war Product Ownerin bei der
HanseCargo AG" wird „[PERSON_001] war Product Ownerin bei [KUNDE_001]".

---

## Die drei Regeln

Wenn Sie sich sonst nichts merken — diese drei. Alles andere ist Bedienung.

### Regel 1 — Das Original kommt nie in den Chat

Der gesamte Schutz hängt daran. Wer die Datei anhängt oder den Text
hineinkopiert, hat alle Maßnahmen umgangen, auch wenn danach alles normal
aussieht.

- **Nicht:** Dokument per Büroklammer anhängen oder Text einfügen.
- **Sondern:** In einer lokalen Cowork-Desktop-Sitzung *„Dateien anonymisieren“*
  schreiben und die Originale ausschließlich im danach geöffneten
  Betriebssystem-Mehrfachpicker auswählen.

### Regel 2 — Bilder bleiben standardmäßig lokal

Grafiken werden bei Unsicherheit zurückgehalten; bei Bewerbungen und
Mitarbeiterprofilen **immer**. Dafür ist keine Rückfrage nötig. Nur wenn Sie Bilder
aus einer texttragenden Office-Datei ausdrücklich entfernen lassen wollen, sagen Sie
das in Ihrer Anfrage. Claude kann ein zurückgehaltenes Bild nicht sehen und Ihnen
deshalb auch nicht sagen, was darauf ist. Eine Freigabe über Claude ist in diesem
Engineering-Build bewusst deaktiviert.

Sehen Sie sich Bilder **zeitnah** an. Nach Ablauf der Aufbewahrungsfrist (Regel 3)
wird die Bilddatei gelöscht und die Grafik bleibt dauerhaft zurückgehalten;
Claude nennt Ihnen dann ausdrücklich die abgelaufene Frist als Grund. Sie können
das Dokument bei Bedarf erneut verarbeiten. Hat Ihre IT die Aufbewahrung auf
`0` Tage gesetzt, ist eine Bildfreigabe grundsätzlich nicht möglich — das ist
eine bewusste Einstellung, kein Fehler.

### Regel 3 — Räumen Sie auf

DataSecure entfernt Einträge aus `Processed`, `Output` und Bild-Previews in
`Needs Visual Review` standardmäßig nach **7 Tagen**. Das geschieht beim Start
und vor einer neuen Verarbeitung; bis dahin liegen die Daten unverschlüsselt auf
der Festplatte. Räumen Sie deshalb sofort auf, wenn Sie sie nicht mehr brauchen.
Mit *„Lösche alle lokalen DataSecure-Daten; ich bestätige die Löschung"* können
Sie die drei Bereiche bewusst leeren. Ein datensparsamer Audit-Nachweis bleibt
zur Prüfbarkeit erhalten. Er enthält eine zufällige Vorgangs-ID, Kategorien,
Zähler, Versionen und Status, aber keine Dokument- oder Wert-Hashes, exakten
Dateigrößen, Pfade, Dateinamen oder Rohinhalte.

---

## Teil 1: Bevor Sie anfangen

Drei Fragen. Wenn Sie eine nicht sicher beantworten können: IT fragen, nicht
raten.

1. **Läuft Windows 10 oder 11 auf einem x64-PC?** Dann gilt dieser Installationsleitfaden. Windows ARM64 bleibt gesperrt. Auf macOS oder Linux ist DataSecure derzeit ausschließlich ein von der IT abzunehmender Engineering-Testweg; bitte nicht nach den Windows-Schritten installieren.
2. **Ist Claude Desktop installiert und sind Sie angemeldet?** Die Anwendung auf
   dem Rechner, nicht die Webseite im Browser.
3. **Welche Datei haben Sie von der IT bekommen?** Schauen Sie auf die Endung —
   davon hängt der ganze Rest ab.

> **Windows blockiert Dateien aus E-Mails.** Rechte Maustaste auf die Datei →
> *Eigenschaften* → unten das Häkchen bei *Zulassen* setzen → *OK*. Fehlt das
> Häkchen, ist alles in Ordnung.

## Teil 2: Welcher der drei Wege ist Ihrer?

Sie müssen nur einen davon machen.

| Weg | Sie haben … | Was zu tun ist |
|---|---|---|
| **A** (empfohlener Cowork-Weg) | eine Datei auf `.zip` | Als benutzerdefiniertes Plugin hochladen → Teil 4 |
| **B** (Engineering-Fallback) | eine Datei auf `.mcpb` | Über Claude-Einstellungen installieren → Teil 3 |
| **C** (IT-verwaltet, noch nicht rollout-erprobt) | gar keine Datei | Die IT verteilt zentral; erst nach Marketplace- und Rollout-Abnahme → Teil 5 |

**Warum der Unterschied:** Claude Desktop stellt für `.mcpb`-Desktop-Extensions
eine eingebaute Node.js-Runtime bereit. Der aktuelle Plugin-ZIP startet ebenfalls
`node`; ob dieser Befehl in der jeweiligen Plugin-Oberfläche aus Claudes Runtime
oder aus dem Windows-Systempfad kommt, wird erst im frischen Installationstest
verbindlich belegt. Für Claude Cowork ist dennoch der Plugin-ZIP der führende Weg;
bei einem fehlenden lokalen Tool nicht auf Upload ausweichen, sondern den Host prüfen.

## Teil 3: Weg B — über die `.mcpb`-Datei

1. **Datei an einen festen Platz legen**, z. B. `Dokumente\DataSecure\`. Nicht in
   den Downloads-Ordner.
2. **Claude Desktop öffnen.** Erst die Anwendung starten, dann installieren.
3. **Einstellungen → Erweiterungen → Erweiterte Einstellungen** öffnen. Im
   Abschnitt für Extension-Entwickler **„Erweiterung installieren …"** wählen,
   die `.mcpb`-Datei auswählen und den Dialog bestätigen.
   > Der Einstellungsweg ist der dokumentierte Testweg. Fehlt der Bereich,
   > ist die Desktop-App möglicherweise veraltet oder durch eine IT-Richtlinie
   > eingeschränkt — dann aufhören und IT rufen.
4. **Bestätigen und die vier Angaben stehen lassen.** Ändern Sie nichts:

   | Angabe | So lassen | Bedeutung |
   |---|---|---|
   | Privacy-Ordner | *leer* | Nutzt den lokalen DataSecure-App-Datenbereich; bekannte OneDrive-/iCloud-/Dropbox- und Netzwerkpfade werden blockiert |
   | Sprache | `de` | Nötig für deutsche Texterkennung in Bildern |
   | Grafik-Modus | `strict` | Im Zweifel wird ein Bild zurückgehalten |
   | Aufbewahrungstage | `7` | Löscht lokale Dokumentdaten nach sieben Tagen |

5. **Claude komplett schließen und neu öffnen.** Wirklich beenden: rechte
   Maustaste auf das Claude-Symbol neben der Uhr → *Beenden*. Ohne diesen Schritt
   passiert nichts.
6. **Weiter zu Teil 5.**

## Teil 4: Weg A — über die `.zip`-Datei

> **Zuerst lesen.** Dieser bevorzugte Cowork-Weg ist bis zum frischen Installationsbeweis ein
> Engineering-Weg. **Installieren Sie Node nicht selbst.** Die IT muss vorab
> bestätigen, dass der lokale MCP aus dem Plugin in Ihrer Claude-Version startet.

1. **Datei an einen festen Platz legen.** **Nicht entpacken** — die ZIP wird als
   Ganzes gebraucht.
2. **In Claude Desktop „Anpassen/Customize" öffnen**, dann **Plugins** auswählen.
   Benutzerdefinierte Plugins werden dort hochgeladen; eine Organisationsverteilung
   kann den Eintrag bereits bereitstellen. Finden Sie keine Upload-Möglichkeit,
   aufhören und IT rufen.
3. **ZIP-Datei als benutzerdefiniertes Plugin hochladen** und bestätigen.
4. **Claude komplett schließen und neu öffnen** (Symbol neben der Uhr →
   *Beenden*).

## Teil 5: Hat es funktioniert?

Öffnen Sie eine **neue lokale Cowork-Unterhaltung** und schreiben Sie:

> Dateien anonymisieren.

- **Alles gut:** Sofort erscheint der lokale Betriebssystem-Mehrfachpicker. Wählen
  Sie für diesen Installationstest noch keine Datei, sondern klicken Sie
  **Abbrechen**. Damit sind Skill, lokaler MCP und Picker gemeinsam nachgewiesen.
- **Nicht gut:** Es erscheint kein lokaler Picker, Claude bietet einen Upload an
  oder meldet einen Fehler. Laden Sie nichts hoch. Beenden Sie Claude vollständig,
  starten Sie es einmal neu und wiederholen Sie den Satz genau einmal. Danach
  aufhören und die Vorlage aus Teil 11 an die IT schicken.

`privacy_status` und Diagnosewerkzeuge gehören ausschließlich zum aktivierten
IT-Supportmodus und sind weder Installations- noch Vorbereitungsschritt des normalen
Cowork-Ablaufs.

## Teil 6: Die fünf Ordner

### Dateien anonymisieren – der Normalweg

Schreiben Sie in einer neuen Cowork-Unterhaltung einfach: **„Dateien anonymisieren“**.
DataSecure öffnet sofort die lokale Mehrfach-Dateiauswahl. Wählen Sie bis zu 100
TXT-, Markdown-, CSV- oder DOCX-Dateien mit zusammen höchstens 500 MiB und klicken
Sie **„Öffnen“**. Das ist die einzige Startbestätigung; der Stapel startet danach
lokal automatisch. Sie müssen keine Dateien vorher in `Input` kopieren und keinen
Diagnosestatus abfragen. Bilder bleiben standardmäßig lokal und werden nicht an
Claude übertragen.

Zusätzlich zur Stapelgrenze gelten sichere Einzeldateigrenzen: TXT/Markdown
8.000.000 Bytes, CSV 1.500.000 Bytes und DOCX 64 MiB komprimiert sowie 128 MiB
entpackt. Es gibt keine feste Seitenbegrenzung. Eine zu große Datei wird bereits
lokal vor dem Hintergrundlauf abgewiesen.

Der `Input`-Ordner bleibt ausschließlich für einen von IT oder erfahrenen
Anwendern bewusst gewünschten manuellen/fallspezifischen Ablauf bestehen.

### Optional: einen anderen lokalen Privacy-Ordner wählen

Standardmäßig legt DataSecure seine fünf Ordner unter `SecureDataMsg\workspace` im
lokalen App-Datenbereich an. Wenn Sie einen festen lokalen Arbeitsort möchten,
schreiben Sie in einer **neuen Cowork-Unterhaltung**: *„Privacy-Ordner ändern“*.
DataSecure öffnet dann einen lokalen Betriebssystemdialog. Nach der Auswahl Claude
vollständig neu starten. Der gewählte Pfad wird nur lokal gespeichert und nicht an
Claude ausgegeben. Für den Standard genügt: *„Privacy-Ordner auf Standard zurücksetzen“*.

Die MCPB-Variante bietet zusätzlich bei der Installation das optionale Feld
**Privacy-Ordner**. Die frühere Anleitung über einen unsichtbaren ZIP-Connectorwert
gilt nicht mehr.

Der Eintrag ist kein Freifahrtschein: Vor der ersten Verarbeitung prüft DataSecure
den Pfad. OneDrive, iCloud Drive, Dropbox, Google Drive, Netzlaufwerke und
Symlinks/Junctions werden blockiert; es wird weder eine Datei verarbeitet noch ein
Pfad an Claude übertragen. Dann einen anderen lokalen Ordner wählen oder IT fragen.
Den Speicherort nie während eines laufenden Stapels ändern.

Ein älterer Ordner `ClaudeEUPrivacyDocumentGatewayV32` wird beim Update nicht
automatisch verschoben oder gelöscht. Er kann lokale Originale enthalten und wird
deshalb ausschließlich nach einer bewussten lokalen IT-Prüfung bereinigt.

Der Standard liegt im lokalen DataSecure-App-Datenbereich und nicht unter
`Dokumente`. Sie müssen den technischen Pfad nicht kennen: *„Öffne den
Privacy-Ordner"* öffnet ihn im Explorer oder Finder.

| Ordner | Inhalt |
|---|---|
| `Input` | DataSecure-eigene Inbox für den technischen Alt-/Fallbackweg; niemals einen SharePoint-, Netz- oder Quellordner hierher verbinden |
| `Output` | Die geprüfte Fassung. Nur das sieht Claude; standardmäßig 7 Tage aufbewahrt |
| `Needs Visual Review` | Lokal zurückgehaltene Bilder. Enthält echte Fotos; in diesem Engineering-Build keine Freigabe über Claude, Preview verschwindet nach Fristablauf |
| `Processed` | Ausschließlich DataSecure-eigene Arbeitskopien des technischen Inbox-Fallbacks; standardmäßig 7 Tage aufbewahrt |
| `DataSecure-Export` | Dauerhafte lokale Übersicht: `DataSecure-Mapping.csv` ordnet jede Originaldatei ihrem anonymisierten Ergebnis zu; der zugehörige Batch-Nachweis enthält nur Zähler und Status |

Ihre Quelle bleibt unverändert. Der normale Cowork-Mehrfachpicker liest Dateien nur
lesend und erstellt eine private lokale Arbeitskopie. Das gilt ebenso für eine
spätere SharePoint-Quelle: DataSecure benötigt dort ausschließlich Leserechte und
darf nie löschen, verschieben oder überschreiben. `purge_local_data` löscht nur
DataSecure-eigene Arbeitskopien, Ergebnisse und Vorschauen – niemals Ihre Quelle.

## Teil 7: So arbeiten Sie damit

### Ein Einstieg für eine oder mehrere Dateien

1. Bitten Sie Claude: *„Anonymisiere eine oder mehrere Dateien lokal mit
   DataSecure.“* Sie müssen keine internen Profilnamen kennen und einen gemischten
   Stapel nicht Datei für Datei einordnen.
2. Der lokale Mehrfach-Dateidialog öffnet sich direkt. Wählen Sie bis zu 100 TXT-,
   Markdown- (`.md` oder `.markdown`), CSV- oder DOCX-Dateien mit zusammen höchstens
   500 MiB aus – nicht in den Chat. Beachten Sie zusätzlich die oben genannten
   Einzeldateigrenzen.
3. Klicken Sie **„Öffnen“**. Dies ist die einzige Bestätigung: DataSecure prüft Anzahl,
   Gesamtgröße, Formate und Bildstandard lokal und erstellt dann private, versiegelte
   Arbeitskopien. **Abbrechen** erstellt keinen Batch. Spätere Änderungen an den
   ausgewählten Originalen verändern den gestarteten Snapshot nicht. PDF und alle
   anderen Formate sind im Pilot sicher gesperrt.
4. Ein kurzer Startaufruf übergibt den versiegelten Stapel an einen getrennten lokalen
   Hintergrundprozessor. Er verarbeitet intern Datei für Datei und erstellt pro Erfolg
   ein eigenes Markdown-Paket, ohne dass Claude für jede Datei einen Werkzeugaufruf
   ausführen oder Inhalt lesen muss. Ein Fehler wird nicht automatisch wiederholt und
   blockiert die übrigen bestätigten Dateien nicht. Den Fortschritt verwaltet der
   Server; Claude sieht nur Zähler und berechnet keine Warteschlangenposition.
5. TXT-, Markdown-, CSV- und DOCX-Dokumente werden automatisch eingeordnet. Eigenständige Bilder,
   Scans und andere Formate sind im Pilot noch nicht freigegeben.
6. Der normale Ordnerablauf öffnet keinen Prüfdialog pro Datei. Mehrdeutige
   Organisations-/Zertifikatsstellen werden gesammelt, während klare Dateien
   weiterlaufen. Erst ein ausdrücklich gestarteter lokaler Sammelreview entscheidet
   diese Stellen; bis dahin bleiben die betroffenen Dateien gesperrt. Jede danach
   freigegebene Fassung besteht nochmals das automatische Residual-Gate.
7. Bei mehr als einer Datei zeigt DataSecure zusätzlich eine lokale Abschlussübersicht
   mit den Zählern ausgewählt, erfolgreich vorbereitet und sicher gestoppt. Claude
   nennt am Ende dieselben Zähler. Die
   lokal gesperrten Arbeitskopien gehören zu den gestoppten Dateien; ihre Namen wurden
   Claude nicht mitgeteilt. Claude erhält Ergebnisse nur namenfrei in Seiten von höchstens
   fünf und liest je nach Aufgabe nur benötigte Pakete. Erfolgreiches Markdown ist
   nur über die 15 Minuten gültige Leseberechtigung desselben Laufs abrufbar; ein
   Chatabbruch ändert den bereits lokal abgeschlossenen Stapel nicht. Die dauerhafte Zuordnung zwischen
   Original und Ergebnis finden Sie lokal in `DataSecure-Export/DataSecure-Mapping.csv`.
   Bitten Sie Claude bei Bedarf ausdrücklich, die lokale Ergebnisübersicht zu öffnen;
   deren Inhalt wird nicht an Claude übertragen.

### Sicher anhalten und später fortsetzen

Wenn Sie während eines laufenden DataSecure-Werkzeugschritts in Claude auf **Stopp**
klicken, wird der aktuelle Schritt sicher unterbrochen. Es wird kein unvollständiges
Paket freigegeben, die übrigen Dateien werden nicht automatisch neu ausgewählt und
die gerade unterbrochene Datei wird nicht still erneut versucht. Der lokale Stapel
bleibt als Checkpoint erhalten. Bitten Sie Claude später ausdrücklich um
*„den letzten DataSecure-Stapel fortsetzen“*. Dieser eine bestätigte Schritt startet
entweder die technische Wiederaufnahme oder – bei zurückgestellten
Zertifikats-/Organisationsstellen – genau eine lokale Stapelprüfung in einem
getrennten Prozess. Cowork wartet nicht auf den Prüfdialog, verlangt keine zweite
Bestätigung und erhält keinen Stapel-Token. Ein terminaler Sicherheitsstopp bleibt
dagegen gesperrt.

Schließen Sie einen lokalen Auswahl- oder Prüfdialog, gilt dieser Lauf als beendet.
DataSecure öffnet keinen zweiten Dialog. Starten Sie nur dann ausdrücklich neu, wenn
Sie wirklich einen neuen lokalen Auswahlvorgang wünschen.

Wenn Sie ausschließlich Markdown ohne Bilder brauchen, sagen Sie einmalig:
*„Anonymisiere die Dateien und entferne alle Bilder.“* Bekannte Bildanlagen in
texttragenden Office-Dateien werden lokal verworfen und in der `.md` als entfernt
vermerkt. Unbekannte eingebettete Objekte sowie eigenständige Bilder und Scans werden
dadurch nicht an den Sicherheitsprüfungen vorbeigeführt.

Enthält eine Datei einen mehrdeutigen Zertifikats-/Organisations-Treffer, wird nur
diese Datei sicher zurückgestellt; die übrigen Dateien werden weiterverarbeitet.
Nach Ihrem ausdrücklichen Auftrag zum Fortsetzen öffnet DataSecure einmalig die
lokale Stapelprüfung. Sie entscheidet lokal, ob die gelb markierten Namen zu einer
Zertifizierung gehören. Währenddessen ist die Cowork-Aufgabe bereits beendet.

Windows x64 besitzt die vollständigere Engineering-Grenze. macOS und Linux verwenden
für TXT/Markdown/CSV/DOCX den Node-Textpfad und stoppen bei Bildern oder manuellen Mehrdeutigkeiten
sicher. Ob die benötigte Node-Runtime vom jeweiligen Installationsartefakt und
Claude-Desktop-Build zuverlässig bereitgestellt wird, muss auf jeder Zielplattform
noch in einer frischen Installation abgenommen werden. Windows ARM64 bleibt gesperrt.

### Nach der Verarbeitung

- **Normal weiterarbeiten:** Claude verwendet ausschließlich die bereinigten
  Fassungen aus dem DataSecure-Weg. Unterstützte erkannte Identifikatoren erscheinen
  als Platzhalter; nicht erkannte Namen oder kontextuelle Hinweise können verbleiben.
- **Zurückgehaltene Bilder:** Sie können `Needs Visual Review` lokal ansehen, dürfen
  Claude aber nicht mit ihrer Freigabe beauftragen. Der aktuelle Engineering-Build
  besitzt noch keinen sicheren menschlichen Freigabekanal.
- **Aufräumen (Regel 3):** Sagen Sie nach Abschluss: *„Lösche alle lokalen
  DataSecure-Daten; ich bestätige die Löschung."* Sie können auch nur `Processed`,
  `Output` oder `Review` nennen. Prüfen Sie vorher, dass Sie das Ergebnis nicht mehr
  benötigen.

**Warum das Aufräumen weiterhin wichtig ist:** Die Frist begrenzt die Speicherung,
ersetzt aber nicht Ihre Entscheidung, wann Original und Arbeitsergebnis nicht
mehr gebraucht werden. Ein Löschfehler, etwa durch eine in Windows geöffnete
Datei, wird im Status angezeigt und beim nächsten Lauf erneut versucht.

## Teil 8: Was die Platzhalter bedeuten

Gleiche Nummer heißt: innerhalb *dieses einen* Dokuments dieselbe Person oder
Firma.

| Platzhalter | Stand im Original |
|---|---|
| `[PERSON_001]` | ein Personenname |
| `[ARBEITGEBER_001]` | der Arbeitgeber in einem Profil |
| `[KUNDE_001]` | ein Kunde oder Auftraggeber |
| `[PROJEKT_001]` | eine Projektbezeichnung |
| `[ORGANISATION_001]` | eine sonstige Firma |
| `[LOCATION_REDACTED]` | Ort, Anschrift, Standort |
| `[EMAIL_REDACTED]` | eine E-Mail-Adresse |
| `[PHONE_REDACTED]` | Telefon- oder Faxnummer |
| `[DATE_REDACTED]` | ein beschriftetes Geburtsdatum |
| `[IP_REDACTED]` | eine IPv4- oder IPv6-Adresse |
| `[ID_REDACTED]` | Mitarbeiter-, Kunden-, Rechnungsnummer, Steuer-ID |
| `[BANK_DATA_REDACTED]` | IBAN, BIC, Kartennummer |
| `[URL_REDACTED]` | eine Internetadresse |

**Häufiger Irrtum:** `[PERSON_001]` in Dokument A und `[PERSON_001]` in Dokument B
sind **verschiedene Menschen**. Es gibt keine gespeicherte Zuordnungstabelle, die
Nummern beginnen bei jedem Dokument neu.

## Teil 9: Wenn etwas nicht klappt

| Was Sie sehen | Was Sie tun |
|---|---|
| Claude kennt DataSecure nicht | Claude beenden (Symbol neben der Uhr → *Beenden*), neu starten. Genau ein Versuch, dann IT |
| „Wie möchten Sie diese Datei öffnen?" | Abbrechen. Das Original nicht in Claude ziehen; eine neue Cowork-Unterhaltung öffnen und den lokalen DataSecure-Ablauf erneut starten. |
| „Keine unterstützte Datei ausgewählt" | Eine unterstützte TXT-, Markdown-, CSV- oder DOCX-Datei im lokalen Dialog auswählen |
| „Verarbeitung wurde sicher gestoppt" | **Kein Fehler von Ihnen.** Es wurde nichts freigegeben, nichts ist durchgerutscht. Nicht automatisch erneut starten. `diagnostic_status` aufrufen und nur den festen Fehlercode an IT melden — nicht Datei, Dateiname, Pfad oder Inhalt |
| Sie haben in Claude auf **Stopp** geklickt | Der Stapel bleibt lokal fortsetzbar; kein Paket der unterbrochenen Datei wurde freigegeben. Nicht automatisch neu starten. Bitten Sie bei Bedarf ausdrücklich, den letzten DataSecure-Stapel fortzusetzen |
| `AMBIGUITY_REVIEW_REQUIRED` | Ein Organisationsname könnte Zertifikatsanbieter oder Arbeitgeber/Kunde sein. Die lokale Arbeitskopie bleibt gesperrt; nicht automatisch erneut starten. Der Normalablauf rät hier bewusst nicht |
| `PARSER_ISOLATION_FAILED` | Die lokale Windows-Sicherheitsgrenze fehlt oder ist beschädigt. Nicht erneut versuchen und nichts manuell umgehen; Plugin/Extension durch IT neu installieren lassen |
| `PARSER_RESOURCE_LIMIT` | Die Datei hat die feste lokale CPU- oder Speichergrenze erreicht. Es wurde nichts freigegeben. Nicht automatisch wiederholen; IT kann die synthetische Reproduktion prüfen |
| Claude meldet vor dem Start eine andere Anzahl | Abbrechen und die beabsichtigten Dateien im lokalen Mehrfachpicker erneut auswählen; nicht auf `Input` ausweichen |
| „Grafik wurde nicht freigegeben" | Normalfall. Das Bild bleibt im aktuellen Engineering-Build lokal zurückgehalten (Regel 2) |
| `PDF_COVERAGE_UNVERIFIED` | PDF ist unabhängig vom Inhalt sicher gesperrt. Verwenden Sie eine freigegebene TXT-, Markdown-, CSV- oder DOCX-Quelle; niemals das PDF direkt in Claude hochladen |
| `FORMAT_COVERAGE_UNVERIFIED` | Im Pilot sind nur TXT, Markdown (`.md`), CSV und DOCX zugelassen. Es wird kein Paket für die Datei freigegeben |
| `PARSER_COVERAGE_UNVERIFIED` | DOCX enthält nicht vollständig abgedeckte Bestandteile. Es wurde kein Paket veröffentlicht |
| `UNSAFE_STORAGE_LOCATION` | Der konfigurierte Ordner liegt in einem bekannten Cloud-Sync- oder Netzwerkpfad. IT muss einen lokalen Pfad konfigurieren |
| Ausgewählte Datei hat kein Ergebnis | Das Original bleibt unverändert. DataSecure stellt nur seine private Arbeitskopie beim Neustart kollisionsfrei wieder her; nicht erneut auswählen, sondern ausdrücklich fortsetzen oder IT informieren |
| Fachbegriff fälschlich geschwärzt | Kein Datenschutzproblem, aber bitte melden |
| **Echter Name in der geprüften Fassung** | **Sofort aufhören.** Nicht weiterarbeiten, Chat nicht weiterverwenden, umgehend melden |

## Teil 10: Was DataSecure nicht leistet

- **Keine garantierte Anonymität im Rechtssinn.** Es ist eine De-Identifizierung;
  ob ein Ergebnis als anonym gilt, ist eine juristische Bewertung.
- **Keine Freigabe für Personalentscheidungen.** Ein anonymisiertes
  Bewerberprofil erlaubt kein automatisiertes Ranken, Bewerten, Vorsortieren oder
  Absagen. Eigener Zweck, eigene Freigabe. Siehe
  [AI_ACT_AND_GDPR.md](AI_ACT_AND_GDPR.md).
- **Keine DSGVO- oder EU-AI-Act-Zertifizierung.** Ein technischer Baustein, kein
  Nachweis.
- **Kein Ersatz für Ihr Urteil.** Wenn schon die Beschreibung die Person
  erkennbar macht, hilft kein Platzhalter.

## Teil 11: Wenn Sie die IT brauchen

Für Installation, Organisationsverteilung, Update, Rollback und datensparsame
Diagnose gilt das [IT-Betriebshandbuch](IT-BETRIEBSHANDBUCH.md). Die technische
Freigabe wird mit der [Pilot-Abnahme](PILOT-ABNAHME.md) dokumentiert.

```
Betreff: DataSecure — Installation klappt nicht

Rechner: (Rechnername oder Personalnummer)
Erhaltene Datei: (.mcpb / .zip / keine)
Wo es hakt: (was Sie zuletzt gemacht haben und was passiert ist)

Claude-Version und Windows-Version reiche ich bei Bedarf nach.
```

**Niemals mitschicken:** das betroffene Dokument, Screenshots mit
Dokumentinhalt, oder Dateien aus `Processed`. Die Beschreibung genügt immer.

---

GBH DataSecure – Dokumente anonymisieren 3.2.0 RC38 · Geschäftsbereich Healthcare, msg systems ag.
Diese Anleitung ist keine Rechtsberatung und ersetzt nicht die
Datenschutzvorgaben Ihres Bereichs.

Installationsoberflächen abgeglichen am 21.08.2026 mit den offiziellen Claude-
Anleitungen für Desktop Extensions und Plugins. Vor einem Rollout erneut prüfen:
<https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop>
und <https://support.claude.com/en/articles/13837440-use-plugins-in-claude>.
