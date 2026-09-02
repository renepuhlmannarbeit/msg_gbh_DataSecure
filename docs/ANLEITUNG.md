# Anleitung: Dateien mit GBH DataSecure anonymisieren

Stand: 01.09.2026 · Version 3.2.0 RC85

## Vor dem ersten Lauf

Installieren Sie das bereitgestellte Plugin-ZIP oder das gleichnamige Plugin aus
dem privaten Organisations-Marketplace. Starten Sie Claude Desktop vollständig
neu. Laden Sie sensible Originale niemals per Büroklammer in den Chat.

## Normalweg

1. Öffnen Sie eine neue lokale Cowork-Aufgabe.
2. Schreiben Sie **„Dateien anonymisieren“** oder wählen Sie den DataSecure-Skill.
3. Im lokalen Mehrfachpicker wählen Sie bis zu 100 Dateien mit zusammen höchstens
   500 MiB und klicken einmal **„Öffnen“**.
4. DataSecure prüft und verarbeitet lokal. Ein Fehler in einer Datei hält den
   übrigen Stapel nicht automatisch an.
5. Warten Sie auf die lokale Abschlussmeldung. Claude pollt den Lauf nicht.
6. Bitten Sie erst danach ausdrücklich: **„Verwende die fertigen anonymisierten
   DataSecure-Ergebnisse.“**

Das ist der vollständige Normalweg. Es gibt keine Profilfrage, keinen Bildmodus,
keine Einzeldateibestätigung und keine Bestätigung für jedes Ergebnis.

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

Der Standard liegt im lokalen DataSecure-App-Datenbereich unter `SecureDataMsg`.
Mit **„Privacy-Ordner ändern“** wählen Sie einen anderen lokalen Ordner; die Änderung
gilt nach einem Neustart. Cloud-Sync, Netzlaufwerke, Symlinks und Junctions sind
gesperrt.

- Temporäre DataSecure-Arbeits- und Reviewdaten: Aufbewahrung 0–14 Tage.
- Quellen/Originale: niemals automatisch verändern oder löschen.
- Fertige Exporte und `DataSecure-Mapping.csv`: niemals automatisch löschen.
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
| Kein lokaler Picker | Claude einmal vollständig neu starten; danach IT melden, nicht hochladen |
| Picker geschlossen | Nur auf ausdrücklichen Wunsch neu starten |
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
