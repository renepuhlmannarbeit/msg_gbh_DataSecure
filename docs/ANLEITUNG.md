# Anleitung: Dateien mit GBH DataSecure anonymisieren

Stand: 03.09.2026 · Version 3.2.0 RC91

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

1. Öffnen Sie eine neue **lokale** Cowork-Aufgabe. Cowork startet Aufgaben
   standardmäßig in der Cloud; DataSecure funktioniert nur in einer lokalen
   Sitzung, weil nur dort der lokale Plugin-MCP läuft.
2. Schreiben Sie **„Dateien anonymisieren“** oder wählen Sie den Skill
   `gbh-datasecure-dokument-anonymisieren`.
3. Beim ersten Lauf wählen Sie einmalig den bereits mit Cowork verbundenen
   Arbeitsordner. DataSecure speichert diese Wahl lokal und erstellt darin
   `DataSecure-Output`. Diese Auswahl wird in späteren Läufen nicht wiederholt.
4. Im lokalen Mehrfachpicker wählen Sie bis zu 100 Dateien mit zusammen höchstens
   500 MiB und klicken einmal **„Öffnen“**.
5. Claude antwortet kurz „Der Auftrag wurde lokal übergeben …“ und nennt in
   Klammern die laufende DataSecure-Version. Fehlt die Version oder stimmt sie
   nicht mit dem bereitgestellten Build überein, verarbeitet eine ältere
   Plugin-Kopie; siehe „Plugin aktualisieren“ unten. DataSecure prüft und
   verarbeitet lokal. Ein Fehler in einer Datei hält den übrigen Stapel nicht
   automatisch an.
6. Warten Sie auf die lokale Abschlussmeldung. Mit **„Ergebnisse öffnen“** gelangen
   Sie direkt zu den neutral benannten Markdown-Dateien. Claude pollt den Lauf nicht.
7. Bitten Sie erst danach ausdrücklich: **„Verwende die fertigen anonymisierten
   DataSecure-Ergebnisse.“**

Das ist der vollständige Normalweg. Nach der einmaligen Ergebnisordnerwahl gibt es
pro Stapel nur die Quellauswahl; keine Profilfrage, keinen Bildmodus, keine
Einzeldateibestätigung und keine Bestätigung für jedes Ergebnis. Claude-eigene
Werkzeugfreigaben kann das Plugin nicht abschalten, aber der reine lokale Lauf
benötigt nur einen MCP-Startaufruf.

## Unterstützte Dateien

| Freigegeben | Sicher gesperrt |
|---|---|
| TXT, Markdown (`.md`, `.markdown`), CSV, DOCX | XLSX, PPTX, PDF, Scan-PDF, PNG, JPEG, BMP und unbekannte Formate |

Ein gesperrtes Format bleibt unverändert und erhält kein Teilresultat. Eine
passwortgeschützte oder verschlüsselte Datei wird nicht entschlüsselt; DataSecure
legt auch keine private Arbeitskopie davon an und meldet sie am Ende gesondert.

Zusätzliche Einzelgrenzen: TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes,
DOCX 64 MiB komprimiert und 128 MiB entpackt. Es gibt keine feste Seitenzahl.

## Bilder und Mehrdeutigkeit

Bildpixel aus DOCX bleiben immer lokal und werden nicht an Claude freigegeben.
Es gibt keinen auswählbaren Bildmodus. DataSecure löscht Bilder niemals aus der
Originaldatei.

Unklare Organisations-/Zertifikatsstellen werden nicht geraten. Sie bleiben bis
zu einem ausdrücklichen lokalen Sammelreview gesperrt. Abbrechen oder Vertagen ist
zulässig; später schreiben Sie **„Setze den letzten DataSecure-Stapel fort.“**
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
`<einmalig gewählter Cowork-Arbeitsordner>/DataSecure-Output/Lauf-…/` und heißen
neutral `Dokument-001-anonymisiert.md`, `Dokument-002-anonymisiert.md` usw. Den
Zielordner ändern Sie auf ausdrücklichen Wunsch mit der Chat-Bitte
**„Ändere den DataSecure-Ergebnisordner“** (Werkzeug „Ergebnisordner
festlegen“); sein Pfad wird nicht an Claude gemeldet. Das ist erst möglich, wenn
kein Stapel mehr offen ist. Ein Ziel in OneDrive, iCloud, Dropbox oder Google
Drive kann die freigegebenen, aber nicht garantiert rechtlich anonymen
Ergebnisse mit diesem Dienst synchronisieren; Claude weist bei der Auswahl
einmal darauf hin. Gelöschte oder bearbeitete Ergebnisdateien werden nicht
wiederhergestellt oder überschrieben.

Der private Standardbereich liegt unter `SecureDataMsg`.
Mit der Chat-Bitte **„Ändere den DataSecure-Privacy-Ordner“** (Werkzeug
„Privacy-Ordner lokal festlegen“) wählen Sie einen anderen lokalen Ordner; die
Änderung gilt nach einem Neustart. Cloud-Sync, Netzlaufwerke, Symlinks und
Junctions sind gesperrt.

- Temporäre DataSecure-Arbeits- und Reviewdaten: Aufbewahrung 0–14 Tage.
- Quellen/Originale: niemals automatisch verändern oder löschen.
- Fertige Exporte: niemals automatisch löschen. Das gilt auch für die private
  `DataSecure-Mapping.csv`. Mapping, Originalbezüge, Review- und Recoverydaten werden
  nicht in `DataSecure-Output` kopiert.
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
| Kein lokaler Picker | Prüfen, ob die Aufgabe eine lokale Cowork-Sitzung ist; Claude einmal vollständig neu starten; danach IT melden (lokale Plugin-MCPs erlaubt?), nicht hochladen |
| Ergebnisordnerwahl erscheint | Beim ersten Lauf den verbundenen Cowork-Arbeitsordner wählen; später nur auf Wunsch ändern |
| Ergebnisordner wurde abgelehnt | Grund lesen (etwa: Ordner liegt im privaten DataSecure-Bereich); beim nächsten Start einen anderen Ordner wählen |
| Sichtbarer Export vorübergehend fehlgeschlagen | Interne Ergebnisse bleiben erhalten; beim nächsten Pluginstart wird erneut exportiert |
| Antwort nennt keine oder eine ältere DataSecure-Version | Cowork verarbeitet mit einer älteren Plugin-Kopie; Plugin gemäß „Plugin aktualisieren“ neu bereitstellen und neue Aufgabe starten |
| Picker geschlossen | Nur auf ausdrücklichen Wunsch neu starten |
| Auswahl abgelehnt („enthält … nicht freigegebene oder unbekannte Formate“) | Ein Ordner wird immer vollständig verarbeitet oder gar nicht; Ordner nur mit TXT/Markdown/CSV/DOCX wählen oder die Dateien einzeln auswählen. Kein Fehler des Plugins |
| Datei sicher gestoppt | Nicht automatisch wiederholen; Klartextmeldung lesen, technischen Code nur an IT nennen |
| Stapel unterbrochen | „Setze den letzten DataSecure-Stapel fort“ |
| Mehrdeutigkeit | lokalen Sammelreview starten oder vertagen |
| Echter Name im Ergebnis | sofort aufhören und Datenschutz/IT informieren |

IT benötigt Version, Betriebssystem, Zeitpunkt, Klartextphase und festen Fehlercode,
aber niemals Dokument, Dateiname, Pfad, Inhalt, Paket-ID, Token oder Screenshot mit
lesbarem Originalinhalt.

## Aussagegrenze

DataSecure de-identifiziert und minimiert Daten. Es garantiert keine rechtliche
Anonymität, zertifiziert weder DSGVO noch EU AI Act und macht eine spätere
Personal-, Recruiting- oder Fachentscheidung nicht automatisch zulässig.
