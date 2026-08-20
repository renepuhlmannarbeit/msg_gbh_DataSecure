# DataSecure einrichten

Anleitung für Anwenderinnen und Anwender ohne Vorkenntnisse.
Version 3.2.0 RC2 · Windows 10/11 · ca. 20 Minuten.

---

## Wozu das Ganze

Wenn Sie einen Lebenslauf, ein Mitarbeiterprofil, einen Vertrag oder einen
Kundenvorgang von Claude auswerten lassen, sieht Claude sonst das Original — mit
Namen, Anschriften, Telefonnummern, Kunden- und Projektbezeichnungen. Bei
personenbezogenen Daten soll das nicht passieren.

DataSecure schiebt eine Prüfstelle davor. Die Datei bleibt auf Ihrem Rechner. Ein
kleines Programm liest sie dort, ersetzt die Identifikatoren durch Platzhalter und
legt eine geprüfte Fassung ab. Claude bekommt **nur** diese geprüfte Fassung — es
gibt für Claude keinen Weg zum Original.

Fachliches bleibt erhalten. Aus „Erika Beispiel war Product Ownerin bei der
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

Grafiken werden zurückgehalten, bis ein Mensch sie freigibt; bei Bewerbungen und
Mitarbeiterprofilen **immer**. Claude kann das Bild vorher nicht sehen und Ihnen
deshalb auch nicht sagen, was darauf ist. Schauen Sie selbst hin.

### Regel 3 — Räumen Sie auf

DataSecure löscht **nichts von allein**. Ihre Originale sammeln sich in
`Processed`, extrahierte Bilder — auch Bewerbungsfotos — in
`Needs Visual Review`. Beides bleibt unverschlüsselt auf der Festplatte liegen,
bis Sie es löschen. Machen Sie das zum festen Schritt am Ende jeder Arbeit.

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
4. **Bestätigen und die drei Angaben stehen lassen.** Ändern Sie nichts:

   | Angabe | So lassen | Bedeutung |
   |---|---|---|
   | Privacy-Ordner | *leer* | Legt die Ordner unter `Dokumente\Claude Privacy` an |
   | Sprache | `de` | Nötig für deutsche Texterkennung in Bildern |
   | Grafik-Modus | `strict` | Im Zweifel wird ein Bild zurückgehalten |

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
| `Output` | Die geprüfte Fassung. Nur das sieht Claude |
| `Needs Visual Review` | Bilder, die auf Ihre Freigabe warten. Enthält echte Fotos |
| `Processed` | Ihre Originale. Enthält alle Personendaten. **Aufräumen** |

## Teil 7: So arbeiten Sie damit

1. **Dokument in `Input` kopieren.** PDF, Word, Excel, PowerPoint, TXT, Markdown,
   CSV. Kopieren, nicht verschieben — DataSecure schiebt die Datei später selbst
   nach `Processed`.
2. **Claude bitten:** *„Anonymisiere bitte das nächste Dokument und fasse
   anschließend die Qualifikationen zusammen."* Zur Sicherheit können Sie die Art
   dazusagen: „… als Bewerbung", „… als Vertrag", „… als Mitarbeiterprofil".
3. **Normal weiterarbeiten.** Claude sieht nur Platzhalter statt echter Namen.
4. **Falls Bilder zurückgehalten wurden: selbst ansehen.** Öffnen Sie
   `Needs Visual Review`. Ist nichts Personenbezogenes darauf — kein Gesicht,
   keine Unterschrift, kein Name, kein Briefkopf — dann: *„Ich habe die Grafik
   geprüft, sie enthält keine personenbezogenen Daten. Bitte freigeben."* Im
   Zweifel nicht freigeben.
5. **Aufräumen (Regel 3).** Jedes Mal am Ende:
   - `Processed` leeren — Ihre Originale mit allen Personendaten
   - `Needs Visual Review` leeren — dort liegen auch Bewerbungsfotos
   - `Output` leeren, sobald das Ergebnis nicht mehr gebraucht wird

   Mit <kbd>Umschalt</kbd> + <kbd>Entf</kbd> löschen oder danach den Papierkorb
   leeren.

**Warum Schritt 5 nicht optional ist:** DataSecure löscht nichts von allein. Ohne
Aufräumen wächst auf der Festplatte eine vollständige, unverschlüsselte Sammlung
genau der Dokumente, die geschützt werden sollten.

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
| „Grafik wurde nicht freigegeben" | Normalfall. Bild selbst ansehen und bewusst entscheiden (Regel 2) |
| Gescanntes PDF wird abgelehnt | Reine Scans ohne Textebene werden bewusst abgelehnt. Wenn möglich das Original statt des Scans nehmen |
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

DataSecure Privacy Preflight 3.2.0 RC2 · Geschäftsbereich Healthcare, msg systems ag.
Diese Anleitung ist keine Rechtsberatung und ersetzt nicht die
Datenschutzvorgaben Ihres Bereichs.
