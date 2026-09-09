# Anleitung: Dateien mit GBH DataSecure anonymisieren

Stand: 08.09.2026 · Version 3.2.0 RC129 · Cowork-Plugin

## Vor dem ersten Lauf

Installieren Sie das für Ihr Betriebssystem bereitgestellte Plugin-ZIP. Der
private Organisations-Marketplace liefert künftig dasselbe Plugin; bis seine
selbsttragende Fassung freigegeben ist, ist das ZIP der Installationsweg.
Starten Sie Claude Desktop vollständig neu.
Laden Sie sensible Originale niemals per Büroklammer in den Chat.

## Plugin aktualisieren

Cowork führt Plugins aus seinem eigenen Speicher („My Uploads“) aus. Eine
Installation über den Bereich „Claude Code“ oder die Kommandozeile erreicht
Cowork nicht, und ein bereits hochgeladenes Plugin wird durch einen erneuten
Upload nicht zuverlässig ersetzt. Deshalb:

1. Einstellungen → Anpassen → Plugins → „GBH DataSecure“ öffnen und das Plugin
   **entfernen**.
2. Claude Desktop vollständig beenden (Taskleistensymbol → Beenden) und neu
   starten.
3. Plugins → Plugin hinzufügen → **Aus Datei hochladen** → das neue ZIP wählen.
4. Auf der Plugin-Seite prüfen: Die Version entspricht dem bereitgestellten
   Build, „Dateien“ zeigt den Plugininhalt und „Zuletzt aktualisiert“ nennt den
   heutigen Zeitpunkt. Erscheinen zunächst keine Dateien, warten oder erneut
   vollständig neu starten, aber noch keine Aufgabe beginnen.
5. Eine **neue** Cowork-Aufgabe starten. Die Startantwort nennt die laufende
   Version; nur wenn sie mit dem Build übereinstimmt, ist die Aktualisierung
   wirksam.

## Normalweg

1. Öffnen Sie in einem bestehenden Claude-Desktop-Deployment eine **lokale
   Cowork-Sitzung**. Nur dort laufen lokale Plugin-MCPs. Cloud-Cowork, Web,
   Mobil und geplante Cloud-Aufgaben sind kein Originaleingang – auch nicht bei
   geöffneter Desktop-App. Dort darf nur bereits freigegebenes Markdown genutzt
   werden.
2. Schreiben Sie **„Dateien anonymisieren“** oder wählen Sie den Skill
   `gbh-datasecure-dokument-anonymisieren`.
3. Beim ersten Lauf wählen Sie einmalig einen dedizierten lokalen Ergebnisordner.
   Für die direkte Weiterarbeit können Sie genau diesen Ergebnisordner zusätzlich
   mit Cowork verbinden. Die Originale und ihre Quellordner bleiben außerhalb
   aller mit Cowork verbundenen Ordner. DataSecure kann die Liste der in Cowork
   verbundenen Ordner nicht selbst lesen oder kontrollieren; diese Trennung ist
   daher eine Setup- und UAT-Voraussetzung. DataSecure speichert die ausdrückliche
   Wahl auf diesem Gerät, errät keinen Projektpfad und erstellt darin
   `DataSecure-Output`. Diese Auswahl wird in späteren Läufen und bei
   Projektwechseln nicht wiederholt oder heimlich geändert.
4. Im lokalen Mehrfachpicker wählen Sie bis zu 200 Dateien mit zusammen höchstens
   500 MiB und klicken einmal **„Öffnen“**.
5. Claude antwortet kurz „Die lokale Übernahme wurde gestartet …“ und nennt in
   Klammern die laufende DataSecure-Version. Fehlt die Version oder stimmt sie
   nicht mit dem bereitgestellten Build überein, verarbeitet eine ältere
   Plugin-Kopie; siehe „Plugin aktualisieren“ unten. DataSecure prüft und
   verarbeitet lokal. Ein Fehler in einer Datei hält den übrigen Stapel nicht
   automatisch an.
6. Warten Sie auf die lokale Abschlussmeldung. Mit **„Ergebnisse öffnen“** gelangen
   Sie direkt in den exakten Laufordner des neuesten Cowork-Stapels mit den
   neutral benannten Markdown-Dateien. Ein aktiver, fehlgeschlagener oder noch
   nicht vollständig exportierter aktueller Lauf öffnet niemals ersatzweise
   einen älteren Lauf. Claude pollt den Lauf nicht.
7. Bitten Sie erst danach ausdrücklich: **„Verwende die fertigen anonymisierten
   DataSecure-Ergebnisse.“**

Das ist der vollständige Normalweg. Nach der einmaligen Ergebnisordnerwahl gibt es
pro Stapel nur die Quellauswahl; keine Profilfrage, keinen Bildmodus, keine
Einzeldateibestätigung und keine Bestätigung für jedes Ergebnis. Claude-eigene
Werkzeugfreigaben kann das Plugin nicht abschalten, aber der reine lokale Lauf
benötigt nur einen MCP-Startaufruf.

Wenn Sie statt einzelner Dateien einen Ordner wählen, prüft DataSecure den
gesamten regulären Unterordnerbaum. Bei mehr als 200 unterstützten Dateien, mehr
als 500 MiB oder mindestens einem unbekannten beziehungsweise gesperrten Format
wird die Auswahl vollständig und verständlich abgelehnt; es startet kein
unbemerkter Teilstapel.

Der Berechtigungsmodus **Auto** kann zusätzliche Claude-Rückfragen reduzieren,
sofern Ihre Organisation ihn erlaubt. Organisationsrichtlinien können trotzdem
eine Freigabe pro Aufgabe oder Werkzeug erzwingen. **Skip** ist für sensible
Dokumente nicht der empfohlene Standard.

## Unterstützte Dateien

| Freigegeben | Sicher gesperrt |
|---|---|
| TXT, Markdown (`.md`, `.markdown`), CSV, DOCX direkt; XLSX/PPTX als lokal extrahiertes Markdown | PDF, Scan-PDF, PNG, JPEG, BMP und unbekannte Formate |

Ein gesperrtes Format bleibt unverändert und erhält kein Teilresultat. Eine
passwortgeschützte oder verschlüsselte Datei wird nicht entschlüsselt; DataSecure
legt auch keine private Arbeitskopie davon an und meldet sie am Ende gesondert.

DOCX-Dateien mit horizontal oder vertikal verbundenen Tabellenzellen
(`w:gridSpan` oder `w:vMerge`) werden derzeit ebenfalls vollständig und ohne
Teilresultat gestoppt. Normale Tabellen bleiben unterstützt. Diese Grenze
verhindert, dass Text wegen einer nicht koordinatentreu abbildbaren Tabellenstruktur
dem falschen Feld oder Label zugeordnet wird.

Zusätzliche Einzelgrenzen: TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes,
DOCX 64 MiB komprimiert und 128 MiB entpackt. Es gibt keine feste Seitenzahl.

## Bilder und Mehrdeutigkeit

Bildpixel aus DOCX bleiben immer lokal und werden nicht an Claude freigegeben.
Es gibt keinen auswählbaren Bildmodus. DataSecure löscht Bilder niemals aus der
Originaldatei.

Unklare Organisations-/Zertifikatsstellen werden nicht geraten. Nach der
automatischen Analyse öffnet DataSecure dafür selbstständig genau einen lokalen
Sammelreview; ein zweiter Cowork-Auftrag oder Werkzeugaufruf ist nicht nötig.
Abbrechen, Schließen oder **„Später entscheiden“** ist zulässig und lässt den
Stapel sicher fortsetzbar; erst dann schreiben Sie später bei Bedarf
**„Setze den letzten DataSecure-Stapel fort.“**
Klare Dateien sind zu diesem Zeitpunkt bereits fertig und werden im Review nicht
noch einmal vorgelegt. Der lokale Dialog zeigt gelbe offene Stellen und die
direkten Aktionen **„Zertifikatsanbieter behalten“** beziehungsweise
**„Organisation anonymisieren“**. Rot markierte Stellen sind bereits anonymisiert.
Auf Windows funktionieren zusätzlich `Alt+Z`, `Alt+O`, `Alt+R`, `Strg+Enter` und
`Esc`; die Schaltflächen bleiben der normale Weg.

## Unterbrechung und Fortsetzung

Ein geschlossener Picker startet keinen Stapel und öffnet sich nicht automatisch
neu. Ein bereits gestarteter lokaler Hintergrundlauf kann unabhängig von der
Chatantwort weiterlaufen. Nach einer echten Unterbrechung wählen Sie die Dateien
nicht erneut, sondern fordern ausdrücklich die Fortsetzung an. Bereits fertige
Positionen werden nicht wiederholt.

## Lokale Ablage

Die sichtbaren Ergebnisse liegen unter
`<einmalig gewählter Ergebnisordner>/DataSecure-Output/Lauf-…/` und heißen
neutral `Dokument-001-anonymisiert.md`, `Dokument-002-anonymisiert.md` usw. Den
Zielordner ändern Sie auf ausdrücklichen Wunsch mit der Chat-Bitte
**„Ändere den DataSecure-Ergebnisordner“** (Werkzeug „Ergebnisordner
festlegen“); sein Pfad wird nicht an Claude gemeldet. Das ist erst möglich, wenn
kein Stapel mehr offen ist. Der Ergebnisordner kann der verbundene Cowork-
Arbeitsordner sein, wird aber nicht automatisch aus einem Projekt erraten oder
bei einem Projektwechsel geändert. Ein Ziel in OneDrive, iCloud, Dropbox oder Google
Drive kann die freigegebenen, aber nicht garantiert rechtlich anonymen
Ergebnisse mit diesem Dienst synchronisieren; Claude weist bei der Auswahl
einmal darauf hin. Ein ausdrücklich gewähltes Netzlaufwerk ist ebenfalls zulässig;
DataSecure weist einmal darauf hin, dass Ergebnisse und bei Standalone auch die
laufbezogene Zuordnungsdatei dadurch an andere Systeme übertragen werden können.
Beide Hinweise sind reine Informationen und erzeugen keine weitere Bestätigung.
Gelöschte oder bearbeitete Ergebnisdateien werden nicht
wiederhergestellt oder überschrieben.

Der private Standardbereich liegt unter `SecureDataMsg`.
Mit der Chat-Bitte **„Ändere den DataSecure-Privacy-Ordner“** (Werkzeug
„Privacy-Ordner lokal festlegen“) wählen Sie einen anderen lokalen Ordner; die
Änderung gilt nach einem Neustart. Cloud-Sync, Netzlaufwerke, Symlinks und
Junctions sind gesperrt.

- Temporäre DataSecure-Arbeits- und Reviewdaten: Aufbewahrung 0–14 Tage.
- Quellen/Originale: niemals automatisch verändern oder löschen.
- Fertige Exporte: niemals automatisch löschen. Das gilt auch für die private
  `DataSecure-Mapping.csv`. Im Cowork-Produkt werden Mapping, Originalbezüge,
  Review- und Recoverydaten nicht in `DataSecure-Output` kopiert. Standalone
  schreibt nach dem vollständigen Lauf zusätzlich eine auf genau diesen Lauf
  begrenzte `DataSecure-Zuordnung.csv` neben die anonymisierten Dateien; sie
  enthält nur Quellbezeichnung und den Namen eines tatsächlich vorhandenen
  anonymisierten Ergebnisses. Gestoppte Quellen stehen in Abschluss und
  Diagnose. Ein vollständig gestoppter Stapel erzeugt keine sichtbare Zuordnung.
- Manuelles Aufräumen betrifft ausschließlich eindeutig DataSecure-eigene Daten
  und braucht eine ausdrückliche Bestätigung.

## Ergebnis verstehen

HMAC-abgeleitete Platzhalter wie `[PERSON_7K4M2Q9X4P]`,
`[ORGANISATION_8Y6P4M2K7Q]` oder `[KUNDE_3R8N6W2C5D]` gelten innerhalb eines
fortsetzbaren Stapels konsistent. `[ARBEITGEBER_001]`, `[EMAIL_REDACTED]` und
`[BANK_DATA_REDACTED]` sind feste fachliche beziehungsweise vollständige
Redaktionsmarker. Zwischen zwei Stapeln sind die HMAC-Platzhalter absichtlich
nicht verknüpfbar.

Die lokale Mapping-Datei ordnet Original und anonymisiertes Ergebnis zu. Ihr Inhalt
wird nicht automatisch an Claude übertragen.

## Wenn etwas nicht klappt

| Sichtbares Verhalten | Nächste Aktion |
|---|---|
| Kein lokaler Picker | Claude Desktop öffnen beziehungsweise vollständig neu starten; Connector und Richtlinie für lokale Plugin-MCPs prüfen; nicht hochladen |
| Ergebnisordnerwahl erscheint | Beim ersten Lauf einen lokalen Ergebnisordner wählen; für direkte Cowork-Nutzung kann es der verbundene Arbeitsordner sein. Später nur auf Wunsch ändern |
| Ergebnisordner wurde abgelehnt | Grund lesen (etwa: Ordner liegt im privaten DataSecure-Bereich); beim nächsten Start einen anderen Ordner wählen |
| Sichtbarer Export vorübergehend fehlgeschlagen | Interne Ergebnisse bleiben erhalten; beim nächsten Pluginstart wird erneut exportiert |
| Antwort nennt keine oder eine ältere DataSecure-Version | Cowork verarbeitet mit einer älteren Plugin-Kopie; Plugin gemäß „Plugin aktualisieren“ neu bereitstellen und neue Aufgabe starten |
| Picker geschlossen | Nur auf ausdrücklichen Wunsch neu starten |
| Auswahl abgelehnt („enthält … nicht freigegebene oder unbekannte Formate“) | Ein Ordner wird immer vollständig verarbeitet oder gar nicht; Ordner nur mit TXT/Markdown/CSV/DOCX/XLSX/PPTX wählen oder die Dateien einzeln auswählen. Kein Fehler des Plugins |
| Datei sicher gestoppt | Nicht automatisch wiederholen; Klartextmeldung lesen, technischen Code nur an IT nennen |
| Stapel unterbrochen | „Setze den letzten DataSecure-Stapel fort“ |
| Mehrdeutigkeit | der Sammelreview öffnet automatisch; fachlich entscheiden oder „Später entscheiden“ wählen |
| Echter Name im Ergebnis | sofort aufhören und Datenschutz/IT informieren |

IT benötigt Version, Betriebssystem, Zeitpunkt, Klartextphase und festen Fehlercode,
aber niemals Dokument, Dateiname, Pfad, Inhalt, Paket-ID, Token oder Screenshot mit
lesbarem Originalinhalt.

## Aussagegrenze

DataSecure de-identifiziert und minimiert Daten. Es garantiert keine rechtliche
Anonymität, zertifiziert weder DSGVO noch EU AI Act und macht eine spätere
Personal-, Recruiting- oder Fachentscheidung nicht automatisch zulässig.

Wer das Produkt nicht nur benutzen, sondern formal abnehmen soll, folgt nicht
dieser Kurzanleitung allein. Für zwei Tester auf Windows und macOS gilt der
[N3/N4-Abnahmeplan](acceptance/FORMAL_UAT/README.md) mit festem Commit,
Paket-Prüfsummen und getrennten Plattformprotokollen.
