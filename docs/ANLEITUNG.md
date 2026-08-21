# DataSecure einrichten

Anleitung für Anwenderinnen und Anwender ohne Vorkenntnisse.
Version 3.2.0 RC8 · Windows 10/11 · ca. 20 Minuten.

> **Nur Engineering-Abnahme:** RC8 darf ausschließlich mit synthetischen
> Testdokumenten verwendet werden. Keine echten Mitarbeiter-, Bewerber-, Kunden-
> oder Vertragsdaten verarbeiten. Ein Nutzerpilot beginnt erst nach Freigabe des
> signierten lokalen Companions mit technisch belegter menschlicher Review-Aktion.

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
- **Sondern:** Dokument in den Ordner `Input` legen und Claude bitten, es zu
  verarbeiten.

### Regel 2 — Über Bilder entscheiden nur Sie

Grafiken werden bei Unsicherheit zurückgehalten; bei Bewerbungen und
Mitarbeiterprofilen **immer**. Claude kann das Bild nicht sehen und Ihnen deshalb
auch nicht sagen, was darauf ist. Eine Freigabe über Claude ist in diesem
Engineering-Build bewusst deaktiviert, bis der lokale Companion einen echten
menschlichen Klick technisch belegen kann.

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

1. **Läuft Windows 10 oder 11?** DataSecure gibt es nur für Windows.
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
| **A** (am einfachsten) | eine Datei auf `.mcpb` | Doppelklick, sonst nichts nötig → Teil 3 |
| **B** (nur mit Vorarbeit) | eine Datei auf `.zip` | Braucht zusätzlich Node.js ≥ 22 auf dem Rechner → Teil 4 |
| **C** (nichts zu tun) | gar keine Datei | Die IT verteilt zentral; das Plugin erscheint von selbst → Teil 5 |

**Warum der Unterschied:** Die `.mcpb`-Datei bringt alles mit, was sie zum Laufen
braucht. Die `.zip` und die zentrale Verteilung nicht — die starten ein
Hilfsprogramm namens `node`, das getrennt installiert sein muss. Wenn Sie die
Wahl haben: `.mcpb`.

## Teil 3: Weg A — über die `.mcpb`-Datei

1. **Datei an einen festen Platz legen**, z. B. `Dokumente\DataSecure\`. Nicht in
   den Downloads-Ordner.
2. **Claude Desktop öffnen.** Erst die Anwendung starten, dann installieren.
3. **Doppelklick auf die Datei.** Claude fragt, ob die Erweiterung installiert
   werden soll.
   > Erscheint stattdessen *„Wie möchten Sie diese Datei öffnen?"*, kennt Windows
   > die Endung nicht. Abbrechen und die Datei stattdessen mit gedrückter
   > Maustaste in das offene Claude-Fenster ziehen. Klappt auch das nicht: in den
   > Claude-Einstellungen nach *Erweiterungen* / *Extensions* suchen. Finden Sie
   > nichts davon — aufhören und IT rufen.
4. **Bestätigen und die vier Angaben stehen lassen.** Ändern Sie nichts:

   | Angabe | So lassen | Bedeutung |
   |---|---|---|
   | Privacy-Ordner | *leer* | Legt die Ordner unter `Dokumente\Claude Privacy` an |
   | Sprache | `de` | Nötig für deutsche Texterkennung in Bildern |
   | Grafik-Modus | `strict` | Im Zweifel wird ein Bild zurückgehalten |
   | Aufbewahrungstage | `7` | Löscht lokale Dokumentdaten nach sieben Tagen |

5. **Claude komplett schließen und neu öffnen.** Wirklich beenden: rechte
   Maustaste auf das Claude-Symbol neben der Uhr → *Beenden*. Ohne diesen Schritt
   passiert nichts.
6. **Weiter zu Teil 5.**

## Teil 4: Weg B — über die `.zip`-Datei

> **Zuerst lesen.** Dieser Weg braucht **Node.js ab Version 22**. Das zu
> installieren erfordert in der Regel Administratorrechte, die Sie vermutlich
> nicht haben. **Installieren Sie Node nicht selbst** — schicken Sie die Vorlage
> aus Teil 11 an die IT. Ist Node bereits vorhanden, geht es hier weiter.

1. **Datei an einen festen Platz legen.** **Nicht entpacken** — die ZIP wird als
   Ganzes gebraucht.
2. **In Claude Desktop die Plugin-Verwaltung öffnen.** Einstellungen → nach
   *Plugins* suchen; je nach Version auch *Erweiterungen* oder *Extensions*.
   Finden Sie nichts Vergleichbares: aufhören und IT rufen.
3. **ZIP-Datei hochladen** und bestätigen.
4. **Claude komplett schließen und neu öffnen** (Symbol neben der Uhr →
   *Beenden*).

## Teil 5: Hat es funktioniert?

Schreiben Sie Claude genau diesen Satz:

> Prüfe bitte den Status von DataSecure.

Drei mögliche Ausgänge:

- **Alles gut.** Claude nennt eine Version, sagt, dass alles bereit ist, und dass
  **0 Dokumente** im Eingang liegen. → Teil 6.
- **Teilweise.** Claude antwortet, erwähnt aber, dass die Bildprüfung nicht
  verfügbar ist (`visual_bridge: unavailable`). **Sie können arbeiten:** Texte
  laufen normal, Bilder werden alle zurückgehalten. An die IT melden, aber nicht
  darauf warten.
- **Nicht gut.** Claude kennt DataSecure nicht oder meldet einen Fehler. Machen
  Sie **genau einen** Versuch: Claude beenden, neu starten, Satz wiederholen.
  Dann aufhören und die Vorlage aus Teil 11 an die IT schicken.

## Teil 6: Die vier Ordner

Unter `Dokumente\Claude Privacy`. Wenn Sie sie nicht finden: *„Öffne den
Privacy-Ordner"*.

| Ordner | Inhalt |
|---|---|
| `Input` | Hier legen Sie das Dokument hinein. Nur diesen brauchen Sie aktiv |
| `Output` | Die geprüfte Fassung. Nur das sieht Claude; standardmäßig 7 Tage aufbewahrt |
| `Needs Visual Review` | Lokal zurückgehaltene Bilder. Enthält echte Fotos; in diesem Engineering-Build keine Freigabe über Claude, Preview verschwindet nach Fristablauf |
| `Processed` | Ihre Originale. Enthält alle Personendaten; standardmäßig 7 Tage aufbewahrt |

## Teil 7: So arbeiten Sie damit

### Empfohlener Weg für TXT und Word-Dokumente

1. Bitten Sie Claude: *„Bereite eine lokale Datei für Claude vor.“*
2. DataSecure öffnet einen Dateidialog außerhalb Claude. Wählen Sie eine TXT- oder
   DOCX-Datei. Claude sieht weder den Pfad noch das Original.
3. DataSecure ersetzt erkannte Stellen lokal. Enthält das Dokument keine
   zurückgehaltenen Bilder oder technischen Unsicherheiten, erscheint ein zweiter
   lokaler Dialog mit der Trefferzahl. Nur dort können Sie bewusst „ohne zusätzliche
   Textprüfung fortfahren“.
4. Erst nach diesem Klick kann Claude die bereinigte Fassung lesen. Das von Ihnen
   gewählte Original bleibt unverändert an seinem bisherigen Ort.

Wählen Sie im zweiten Dialog „Nein“, wird nichts veröffentlicht. Word-Dokumente mit
Bildern oder nicht vollständig prüfbaren Inhalten bleiben ebenfalls gesperrt, bis die
lokale Review-Oberfläche implementiert ist.

### Bestehender Ordnerweg für weitere Formate

1. **Dokument in `Input` kopieren.** PDF, Word, Excel, PowerPoint, TXT, Markdown,
   CSV sowie eigenständige PNG-, JPEG- oder BMP-Bilder werden unterstützt.
   Kopieren, nicht verschieben — DataSecure schiebt die Datei später selbst
   nach `Processed`. Bei einem reinen Bild oder Scan-PDF ohne Textlayer müssen
   Sie die Dokumentart ausdrücklich dazusagen, zum Beispiel „als Kundendokument“
   oder „als Bewerbung“; vor der lokalen OCR kann sie nicht sicher automatisch
   erkannt werden.
2. **Claude bitten:** *„Anonymisiere bitte das nächste Dokument und fasse
   anschließend die Qualifikationen zusammen."* Zur Sicherheit können Sie die Art
   dazusagen: „… als Bewerbung", „… als Vertrag", „… als Mitarbeiterprofil".
3. **Normal weiterarbeiten.** Claude erhält ausschließlich die bereinigte Fassung
   aus dem DataSecure-Weg. Unterstützte erkannte Identifikatoren erscheinen als
   Platzhalter; nicht erkannte Namen oder kontextuelle Hinweise können verbleiben.
4. **Falls Bilder zurückgehalten wurden:** Sie können `Needs Visual Review` lokal
   ansehen, dürfen Claude aber nicht mit ihrer Freigabe beauftragen. Der aktuelle
   Engineering-Build besitzt noch keinen sicheren menschlichen Freigabekanal; das
   Bild bleibt daher zurückgehalten.
5. **Aufräumen (Regel 3).** Warten Sie nicht auf die 7-Tage-Frist, wenn die
   Arbeit abgeschlossen ist. Sagen Sie Claude: *„Lösche alle lokalen
   DataSecure-Daten; ich bestätige die Löschung."* Sie können auch nur
   `Processed`, `Output` oder `Review` nennen. Prüfen Sie vorher, dass Sie das
   Ergebnis nicht mehr benötigen. Offene Review-Bilder werden bei Fristablauf
   sicher verworfen; ihr Paket bleibt gültig, das Bild aber dauerhaft gesperrt.

**Warum Schritt 5 weiterhin wichtig ist:** Die Frist begrenzt die Speicherung,
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
| „Wie möchten Sie diese Datei öffnen?" | Abbrechen, Datei ins offene Claude-Fenster ziehen |
| „Keine unterstützte Datei im Eingang" | Datei liegt nicht in `Input` oder hat ein anderes Format |
| „Verarbeitung wurde sicher gestoppt" | **Kein Fehler von Ihnen.** Es wurde nichts freigegeben, nichts ist durchgerutscht. Datei liegt unverändert im Eingang. An IT melden — mit der Dokumentart, nicht mit dem Dokument |
| „Grafik wurde nicht freigegeben" | Normalfall. Das Bild bleibt im aktuellen Engineering-Build lokal zurückgehalten (Regel 2) |
| Gescanntes PDF wird abgelehnt | Scans mit sicher extrahierbaren JPEG-Seitenbildern laufen über OCR. Andere PDF-Bildcodierungen werden fail-closed abgelehnt; wenn möglich das Original oder einen PNG-/JPEG-Export verwenden |
| PDF wird abgelehnt, obwohl es sich in einem PDF-Reader öffnen lässt | Das PDF neu exportieren oder die Originaldatei statt einer weitergeleiteten Kopie verwenden |
| Dokument ist aus `Input` verschwunden, aber es gibt kein Ergebnis | In `Processed` nachsehen und das Original zurück nach `Input` verschieben. Tritt das erneut auf, an IT melden |
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

DataSecure Privacy Preflight 3.2.0 RC8 · Geschäftsbereich Healthcare, msg systems ag.
Diese Anleitung ist keine Rechtsberatung und ersetzt nicht die
Datenschutzvorgaben Ihres Bereichs.
