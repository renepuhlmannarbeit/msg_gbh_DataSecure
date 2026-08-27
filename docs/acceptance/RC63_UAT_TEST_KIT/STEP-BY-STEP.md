# Schritt-für-Schritt-UAT für den DataSecure-RC63-Vertrag

## 1. Vorbereitung

1. Verwende ein Testkonto und ausschließlich dieses synthetische Paket.
2. Erzeuge die 111 Eingänge mit den drei Befehlen aus `README.md`. Prüfe, dass
   `docs/acceptance/RC63_UAT_TEST_KIT/inputs` genau 111 Dateien enthält.
3. Baue das aktuelle Plugin mit `npm run build:plugin` und installiere den dabei
   gemeldeten ZIP aus `dist` in Claude Desktop. Aktiviere Plugin und Connector.
4. Starte Claude Desktop vollständig neu.
5. Öffne eine neue Cowork-Aufgabe. Hänge noch keine Datei an den Chat.
6. Schreibe: `Zeige mir den DataSecure-Diagnosestatus.`
7. Prüfe, dass die Version mit `package.json`, dem installierten ZIP und dem
   lokalen Connector übereinstimmt und ein lokaler
   Privacy-Ordner angezeigt werden. Erfasse keine Pfade im Evidence-Log.

Erwartung: Der Status enthält nur technische Metadaten. Ein fehlender Connector
ist `BLOCKED`; fahre dann nicht mit Originaldateien fort.

## 2. UAT-01 - einzelner Kernfall

1. Öffne eine neue Cowork-Aufgabe.
2. Schreibe genau: `Dateien anonymisieren.`
3. Wähle im lokalen Dialog ausschließlich
   `inputs/01-positive/personnel-profile.txt` und klicke einmal `Öffnen`.
4. Warte auf die lokale Abschlussmeldung. Starte in der Zwischenzeit keinen
   zweiten Lauf.
5. Bitte anschließend in derselben Aufgabe:
   `Verwende jetzt die anonymisierten Ergebnisse und fasse Rolle, Technologien und Zertifizierungen zusammen.`
6. Öffne lokal den Exportbereich und prüfe Markdown sowie
   `DataSecure-Mapping.csv`.

PASS:

- genau ein Dateidialog und ein lokaler Stapel;
- Grad `Vollständig verarbeitet`;
- Lina Testfeld, E-Mail, Telefon, IBAN, Arbeitgeber und Kunde fehlen im Ergebnis;
- Product Owner, Java, SQL, HL7 FHIR, Testautomatisierung, ISTQB und Scrum.org
  bleiben erhalten;
- im Chat erscheinen weder Originaldateiname noch Pfad oder interne Kennungen.

## 3. UAT-02 - Formatparität

1. Öffne eine neue Cowork-Aufgabe und schreibe `Dateien anonymisieren.`
2. Wähle gemeinsam alle vier Dateien aus `inputs/01-positive`.
3. Klicke einmal `Öffnen` und beantworte keine zusätzliche Profil- oder
   Einzeldateifrage.
4. Prüfe nach Abschluss die lokale Zusammenfassung und das Mapping.
5. Fordere die anonymisierten Ergebnisse einmal gesammelt in Cowork an.

PASS:

- vier lokale Zuordnungen und vier anonymisierte Markdown-Ergebnisse;
- TXT, Markdown, CSV und DOCX bewahren denselben fachlichen Inhalt;
- Ergebniszähler ergeben vier vollständig verarbeitete Dokumente;
- die Zertifizierungsanbieter werden nicht als Arbeitgeber/Kunden entfernt;
- die Originaldateien sind bytegleich und weiterhin am ursprünglichen Ort.

## 4. UAT-03 - Bild und mehrdeutiger Zertifikatsanbieter

1. Öffne eine neue Cowork-Aufgabe und starte `Dateien anonymisieren.`
2. Wähle beide Dateien aus `inputs/02-review`.
3. Verwende den Standardweg: Bilder lokal zurückhalten, nicht ausdrücklich
   entfernen.
4. Falls die lokale Fachprüfung erscheint, entscheide nur anhand des angezeigten
   synthetischen Kontexts. Überspringen/Vertagen ist zulässig.
5. Prüfe den lokalen Abschluss und fordere danach nur freigegebene Ergebnisse an.

PASS:

- Bildpixel bleiben ausschließlich lokal;
- der Bild-DOCX wird entweder `Verwendbar mit Auslassungen` mit gezählter lokal
  zurückgehaltener Grafik oder sicher gestoppt - niemals als vollständig
  verarbeitet ausgegeben;
- die mehrdeutige Organisation wird nicht automatisch geraten;
- bei Vertagung bleibt der Stapel fortsetzbar und bereits abgeschlossene Arbeit
  wird nicht wiederholt.

## 5. UAT-04 - verpflichtende sichere Stopps

1. Öffne eine neue Cowork-Aufgabe und starte `Dateien anonymisieren.`
2. Wähle gemeinsam alle Dateien aus `inputs/03-blocked`.
3. Klicke einmal `Öffnen` und warte auf den terminalen Stapelstatus.
4. Prüfe lokal, dass kein anonymisiertes Teilpaket für diese Eingänge existiert.

PASS:

- XLSX, PPTX, PDF und eigenständiges PNG stoppen als noch nicht freigegebene
  Formate;
- das absichtlich beschädigte DOCX stoppt als ungültiger/unsicherer Container;
- erwartete inhaltsfreie Codes: `SOURCE_FORMAT_NOT_RELEASED` für PDF/PNG und
  `SOURCE_TYPE_MISMATCH` für die minimalistischen XLSX-/PPTX-/DOCX-Fixtures;
- Ergebnisgrad je Position: `Sicher nicht verarbeitet`;
- die fünf Originale bleiben unverändert und Claude erhält keinen Inhalt.

## 6. UAT-05 - Unterbrechung und Fortsetzung

1. Starte einen neuen Lauf mit `batch-001.txt` bis `batch-010.txt` aus
   `inputs/04-batch-100`.
2. Beende Cowork oder den lokalen Lauf kontrolliert, nachdem mindestens eine Datei
   verarbeitet wurde.
3. Starte Claude erneut und öffne eine neue Cowork-Aufgabe.
4. Schreibe: `Setze den unvollständigen DataSecure-Stapel fort.`
5. Bestätige nur die ausdrückliche Fortsetzung. Wähle keine Dateien erneut aus.
6. Prüfe Abschlusszähler und Mapping.

PASS:

- kein Ersatzpicker und keine doppelte Verarbeitung;
- bereits terminale Positionen bleiben terminal;
- am Ende existieren genau zehn eindeutige Zuordnungen;
- ein Abbruch erzeugt keinen Teiloutput für die gerade bearbeitete Datei.

## 7. UAT-06 - 100-Dateien-Serienlauf

1. Öffne eine neue Cowork-Aufgabe und starte `Dateien anonymisieren.`
2. Wähle alle 100 Dateien aus `inputs/04-batch-100` gemeinsam aus.
3. Klicke einmal `Öffnen` und lasse den Stapel ohne weitere Chataktion laufen.
4. Prüfe nach Abschluss nur die aggregierten Zähler und lokal das Mapping.
5. Fordere die anonymisierten Ergebnisse gesammelt an und folge dem Paging bis
   `more=false`.

PASS:

- 100 eindeutige terminale Positionen und 100 Mapping-Zeilen für diesen Lauf;
- keine Namen, Pfade, Paket-IDs, Capabilities oder Cursor im Chat;
- die Stapelübersicht erscheint einmal, nicht auf jeder Ergebnisseite;
- jede Seite enthält ausschließlich verifiziertes anonymisiertes Markdown;
- der lokale Abschlussdialog erscheint genau einmal.

## 8. Abschluss und Evidenz

1. Fülle pro Testfall genau eine Zeile in `EVIDENCE_LOG.csv` aus.
2. Erlaubte Evidenz: Commit, Artefakt-SHA-256, Betriebssystem, Claude-Version,
   Dauer, Zähler, `PASS/FAIL/BLOCKED` und ein fester inhaltsfreier Fehlercode.
3. Nicht erfassen: Dokumenttext, Namen, Pfade, Dateinamen, Hashes einzelner
   Dokumente, Paket-IDs, Token, Capabilities oder Screenshots mit lesbarem Inhalt.
4. Bewahre Originale für einen Bytevergleich auf. Nutze `purge_local_data` nur
   für DataSecure-eigene Testausgaben; Quell-/Basisdaten dürfen niemals gelöscht
   werden.

Go für RC63-UAT nur, wenn UAT-01 und UAT-02 `PASS` sind und kein harter
Datenschutzfehler auftritt. UAT-03 darf nur mit dem beschriebenen lokalen
Review-/Auslassungsverhalten bestehen. UAT-04 muss sicher stoppen. Ein `BLOCKED`
ersetzt keinen erforderlichen positiven Zielhostnachweis.
