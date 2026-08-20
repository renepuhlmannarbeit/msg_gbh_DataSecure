# DataSecure einrichten

Anleitung für Anwenderinnen und Anwender. Version 3.2.0 RC2, Windows 10/11.

DataSecure entfernt personenbezogene Daten aus Ihren Dokumenten, **bevor** Claude
sie liest.

---

## Worum es geht

Wenn Sie ein Mitarbeiterprofil, einen Lebenslauf, einen Vertrag oder einen
Kundenvorgang von Claude auswerten lassen, sieht Claude normalerweise das
Original — mit Namen, Anschriften, Telefonnummern, Kunden- und
Projektbezeichnungen. Genau das soll bei personenbezogenen Daten nicht passieren.

DataSecure schiebt eine Prüfstelle davor. Die Datei bleibt auf Ihrem Rechner. Ein
kleines Programm liest sie dort, ersetzt die Identifikatoren durch Platzhalter und
legt eine geprüfte Fassung ab. Claude bekommt **nur** diese geprüfte Fassung zu
sehen — es gibt für Claude schlicht keine Möglichkeit, an das Original zu kommen.

Fachlich Relevantes bleibt erhalten. Aus „Erika Beispiel war Product Ownerin bei
der HanseCargo AG" wird „[PERSON_001] war Product Ownerin bei [KUNDE_001]" — die
Rolle bleibt lesbar, die Person nicht mehr erkennbar.

## Die eine Regel, auf die es ankommt

Der Schutz wirkt nur, wenn das Original nie in den Chat gelangt. Alles andere ist
Komfort.

- **Nicht:** Dokument per Büroklammer an Claude anhängen oder den Text
  hineinkopieren.
- **Sondern:** Dokument in den Ordner `Input` legen und Claude bitten, das
  nächste Dokument zu verarbeiten.

## Voraussetzungen

- Windows 10 oder 11 — DataSecure läuft nur unter Windows.
- Claude Desktop, installiert und angemeldet.
- Die Installationsdatei von Ihrer IT — es gibt zwei Varianten, und sie
  unterscheiden sich in genau einem Punkt:

| Datei | Installation | Zusätzlich nötig |
|---|---|---|
| `…​.mcpb` | Doppelklick | nichts |
| `…​.zip` | Einstellungen → Plugins → hochladen | Node.js ab Version 22 auf dem Rechner |

Der Grund: Die `.mcpb`-Variante bringt ihre Laufzeitumgebung mit. Die
`.zip`-Variante — und ebenso eine Installation über einen firmeninternen
Plugin-Marketplace — startet den lokalen Dienst über den Befehl `node` und setzt
deshalb voraus, dass Node.js auf dem Rechner installiert ist.

Wenn Sie nicht wissen, welche Variante Sie haben: nehmen Sie die `.mcpb`, falls
beide vorliegen. Administratorrechte brauchen Sie in keinem Fall, und weder
Python noch npm werden je ausgeführt.

---

## Teil 1: Installation

**1. Datei ablegen.** Speichern Sie die Datei an einem Ort, den Sie wiederfinden,
zum Beispiel `Dokumente\DataSecure\`. Öffnen Sie sie noch nicht.

**2. Installieren.** Bei einer `.mcpb`-Datei genügt ein Doppelklick: Claude
Desktop öffnet sich und fragt, ob die Erweiterung installiert werden soll —
bestätigen mit *Installieren*. Bei einer `.zip`-Datei stattdessen Claude Desktop
öffnen, *Einstellungen → Plugins*, dort die ZIP-Datei hochladen.

**3. Einstellungen bestätigen.** Drei Angaben werden abgefragt; die Vorgaben
passen für fast alle:

| Angabe | Vorgabe | Bedeutung |
|---|---|---|
| Privacy-Ordner | *leer lassen* | Legt die Arbeitsordner unter `Dokumente\Claude Privacy` an |
| Sprache | `de` | Für deutsche Dokumente so lassen — davon hängt die Texterkennung in Bildern ab |
| Grafik-Modus | `strict` | Im Zweifel wird eine Grafik zurückgehalten statt freigegeben |

**4. Claude Desktop neu starten.** Einmal vollständig schließen und wieder
öffnen. Erst danach ist DataSecure aktiv.

**5. Prüfen, ob es läuft.** Schreiben Sie Claude: *„Prüfe bitte den Status von
DataSecure."* Claude sollte antworten, dass die Engine bereit ist und wie viele
Dokumente im Eingang liegen (null).

Steht dort `visual_bridge: unavailable`, funktioniert der Textteil trotzdem —
Grafiken werden dann grundsätzlich zurückgehalten. Melden Sie das der IT, aber
Sie können arbeiten.

## Teil 2: Die vier Ordner

DataSecure legt unter `Dokumente\Claude Privacy` vier Ordner an. Ihr Dokument
wandert hindurch:

| Ordner | Inhalt |
|---|---|
| `Input` | Hier legen Sie das Originaldokument hinein |
| `Output` | Die geprüfte Fassung. Nur das hier sieht Claude |
| `Needs Visual Review` | Grafiken, die ein Mensch erst freigeben muss |
| `Processed` | Ihr Original, nach der Verarbeitung hierher verschoben |

Im Alltag brauchen Sie nur `Input`. Wenn Sie den Ordner nicht finden: fragen Sie
Claude *„Öffne den Privacy-Ordner"*, dann geht der Explorer auf.

## Teil 3: Der tägliche Ablauf

**1. Dokument in den Eingang kopieren.** Unterstützt werden PDF, Word, Excel,
PowerPoint sowie TXT, Markdown und CSV. Kopieren, nicht verschieben.

**2. Claude bitten, es zu verarbeiten.** Zum Beispiel: *„Anonymisiere bitte das
nächste Dokument und fasse anschließend die Qualifikationen zusammen."* Die Art
des Dokuments erkennt DataSecure selbst; wenn Sie sichergehen wollen, sagen Sie
es dazu — „… als Bewerbung", „… als Vertrag", „… als Mitarbeiterprofil".

**3. Mit der geprüften Fassung weiterarbeiten.** Ab hier arbeiten Sie normal
weiter. Claude sieht dabei nur Platzhalter statt der echten Namen.

**4. Zurückgehaltene Grafiken prüfen**, falls welche anfallen. Claude sagt Ihnen
Bescheid. Schauen Sie sich die Grafik im Ordner `Needs Visual Review` an; ist
nichts Personenbezogenes darauf zu sehen, geben Sie sie frei: *„Ich habe die
Grafik geprüft, sie enthält keine personenbezogenen Daten. Bitte freigeben."*

Diese Freigabe ist Ihre Entscheidung und Ihre Verantwortung. Claude kann die
Grafik vorher nicht sehen und Ihnen deshalb auch nicht sagen, was darauf ist.

## Teil 4: Was die Platzhalter bedeuten

Gleiche Nummer heißt: innerhalb *dieses* Dokuments dieselbe Person oder Firma.

| Platzhalter | Stand im Original |
|---|---|
| `[PERSON_001]` | ein Personenname |
| `[ARBEITGEBER_001]` | der Arbeitgeber in einem Profil |
| `[KUNDE_001]` | ein Kunde oder Auftraggeber |
| `[PROJEKT_001]` | eine Projektbezeichnung |
| `[ORGANISATION_001]` | eine sonstige Firma |
| `[LOCATION_REDACTED]` | Ort, Anschrift oder Standort |
| `[EMAIL_REDACTED]` | eine E-Mail-Adresse |
| `[PHONE_REDACTED]` | eine Telefon- oder Faxnummer |
| `[ID_REDACTED]` | Mitarbeiter-, Kunden-, Rechnungsnummer, Steuer-ID |
| `[BANK_DATA_REDACTED]` | IBAN, BIC, Kartennummer |
| `[URL_REDACTED]` | eine Internetadresse |

Es gibt **keine gespeicherte Rückübersetzungstabelle**. `[PERSON_001]` in
Dokument A und `[PERSON_001]` in Dokument B sind mit hoher Wahrscheinlichkeit
verschiedene Menschen. Vergleichen Sie Platzhalter nie über Dokumentgrenzen
hinweg.

## Teil 5: Wenn etwas nicht klappt

**„Verarbeitung wurde sicher gestoppt."** DataSecure hat im Ergebnis noch etwas
gefunden, das nach einem Identifikator aussieht, und deshalb gar nichts
freigegeben. Ihre Datei liegt unverändert im Eingang. Das ist der gewollte
Notfallmodus — es ist nie etwas Ungeprüftes durchgerutscht. Melden Sie den Fall
mit der Dokumentart (nicht mit dem Dokument) an die IT.

**„Grafik wurde nicht freigegeben."** Normalfall, kein Fehler. Bei Bewerbungen
und Mitarbeiterprofilen werden Bilder *immer* zurückgehalten — ein Foto oder eine
Unterschrift macht eine Person sofort wieder erkennbar.

| Beobachtung | Das hilft |
|---|---|
| Claude kennt DataSecure nicht | Claude Desktop nach der Installation vollständig schließen und neu öffnen |
| „Keine unterstützte Datei im Eingang" | Datei liegt woanders oder hat ein anderes Format. *„Öffne den Privacy-Ordner"* und in `Input` legen |
| Gescanntes PDF wird abgelehnt | Reine Scans ohne Textebene lehnt DataSecure bewusst ab. Wenn vorhanden, die Originaldatei statt des Scans nutzen |
| Fachbegriff wurde fälschlich geschwärzt | Kein Datenschutzproblem, aber melden — der Begriff kann in die Ausnahmeliste |
| Ein Name steht noch in der geprüften Fassung | Das ist ernst. Nicht weiterarbeiten, sofort melden, den Chat nicht weiterverwenden |

## Teil 6: Was DataSecure nicht leistet

- **Keine garantierte Anonymität im Rechtssinn.** Es ist eine De-Identifizierung.
  Ob ein Ergebnis im konkreten Fall als anonym gilt, ist eine juristische
  Bewertung, keine technische.
- **Keine Freigabe für Personalentscheidungen.** Ein anonymisiertes
  Bewerberprofil bedeutet nicht, dass Sie damit automatisiert ranken, bewerten,
  vorsortieren oder absagen dürfen. Das ist ein eigener Zweck und braucht eine
  eigene Freigabe. Siehe [AI_ACT_AND_GDPR.md](AI_ACT_AND_GDPR.md).
- **Keine DSGVO- oder EU-AI-Act-Zertifizierung.** DataSecure ist ein technischer
  Baustein, kein Nachweis.
- **Kein Ersatz für Ihr Urteil.** Wenn ein Dokument so speziell ist, dass schon
  die Beschreibung die Person erkennbar macht, hilft kein Platzhalter.

---

Fragen, Fehlermeldungen und falsch geschwärzte Fachbegriffe an die IT des
Geschäftsbereichs Healthcare. Bitte nie das betroffene Dokument mitschicken — die
Beschreibung genügt.

Diese Anleitung ist keine Rechtsberatung.
