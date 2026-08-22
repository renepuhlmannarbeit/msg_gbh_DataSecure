# GBH DataSecure einrichten

Anleitung für Anwenderinnen und Anwender ohne Vorkenntnisse.
Windows 10/11 x64 sowie macOS/Linux-Textpfad · ca. 20 Minuten.

> **Nur Engineering-Abnahme:** RC28 darf ausschließlich mit synthetischen
> Testdokumenten verwendet werden. Keine echten Mitarbeiter-, Bewerber-, Kunden-
> oder Vertragsdaten verarbeiten. Ein Nutzerpilot beginnt erst nach Freigabe des
> signierten lokalen Companions, bestandenem Installationstest und dokumentierter
> Pilotfreigabe. Die lokale TXT-/DOCX-Review-Aktion ist technisch umgesetzt; die
> visuelle Human-Presence-Freigabe und Codesignatur fehlen noch.

> **Plattformstatus:** Windows x64 besitzt derzeit die vollständigere lokale
> Prüfoberfläche und Bildverarbeitung. Auf macOS/Linux ist TXT/DOCX textbasiert
> nutzbar; Bilder bleiben lokal oder werden auf Wunsch entfernt, und Fälle mit
> notwendiger manueller Mehrdeutigkeitsentscheidung stoppen sicher. Es ist keine
> zusätzliche Python-, Node- oder npm-Installation nötig.

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
- **Sondern:** Claude um die lokale DataSecure-Verarbeitung bitten und die Dateien
  ausschließlich in den danach geöffneten `Input`-Ordner kopieren.

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

1. **Läuft Windows 10 oder 11 auf einem x64-PC?** Windows ARM64 wird noch nicht unterstützt.
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
| **A** (Engineering-Testweg) | eine Datei auf `.mcpb` | Über Claude-Einstellungen installieren → Teil 3 |
| **B** (Plugin-Zielweg, noch abzunehmen) | eine Datei auf `.zip` | Nur nach IT-Freigabe; Runtime-Auflösung und Installation müssen für die Zielumgebung belegt sein → Teil 4 |
| **C** (IT-verwaltet, noch nicht rollout-erprobt) | gar keine Datei | Die IT verteilt zentral; erst nach Marketplace- und Rollout-Abnahme → Teil 5 |

**Warum der Unterschied:** Claude Desktop stellt für `.mcpb`-Desktop-Extensions
eine eingebaute Node.js-Runtime bereit. Der aktuelle Plugin-ZIP startet ebenfalls
`node`; ob dieser Befehl in der jeweiligen Plugin-Oberfläche aus Claudes Runtime
oder aus dem Windows-Systempfad kommt, wird erst im frischen Installationstest
verbindlich belegt. Wenn Sie die Wahl haben: `.mcpb`.

## Teil 3: Weg A — über die `.mcpb`-Datei

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
   | Privacy-Ordner | *leer* | Legt die Ordner unter `Dokumente\Claude Privacy` an |
   | Sprache | `de` | Nötig für deutsche Texterkennung in Bildern |
   | Grafik-Modus | `strict` | Im Zweifel wird ein Bild zurückgehalten |
   | Aufbewahrungstage | `7` | Löscht lokale Dokumentdaten nach sieben Tagen |

5. **Claude komplett schließen und neu öffnen.** Wirklich beenden: rechte
   Maustaste auf das Claude-Symbol neben der Uhr → *Beenden*. Ohne diesen Schritt
   passiert nichts.
6. **Weiter zu Teil 5.**

## Teil 4: Weg B — über die `.zip`-Datei

> **Zuerst lesen.** Dieser Weg ist bis zum frischen Installationsbeweis ein
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
| `Input` | Hier legen Sie ausschließlich die Dateien des jetzt beabsichtigten Laufs hinein |
| `Output` | Die geprüfte Fassung. Nur das sieht Claude; standardmäßig 7 Tage aufbewahrt |
| `Needs Visual Review` | Lokal zurückgehaltene Bilder. Enthält echte Fotos; in diesem Engineering-Build keine Freigabe über Claude, Preview verschwindet nach Fristablauf |
| `Processed` | Ihre Originale. Enthält alle Personendaten; standardmäßig 7 Tage aufbewahrt |

## Teil 7: So arbeiten Sie damit

### Ein Einstieg für eine oder mehrere Dateien

1. Bitten Sie Claude: *„Anonymisiere eine oder mehrere Dateien lokal mit
   DataSecure.“* Sie müssen keine internen Profilnamen kennen und einen gemischten
   Stapel nicht Datei für Datei einordnen.
2. DataSecure nennt vor dem Öffnen nur, wie viele unterstützte Dateien bereits im
   Eingang liegen. Prüfen Sie im geöffneten `Input`-Ordner, dass dort **nur** die
   Dateien des jetzigen Laufs liegen. So werden Altbestände nicht versehentlich
   mitverarbeitet.
3. Kopieren Sie bis zu 25 gewünschte Dateien hinein, nicht in den Chat. Kehren Sie
   zu Claude zurück und bestätigen Sie kurz, dass ausschließlich diese Dateien
   bereitliegen. DataSecure vergleicht die Anzahl erneut. Bei einer Abweichung wird
   nicht einfach weitergemacht. PDF ist sicher gesperrt und darf auch nicht direkt
   hochgeladen werden.
4. DataSecure verarbeitet pro technischem Aufruf genau eine Datei und erstellt pro
   Erfolg ein eigenes Markdown-Paket. Dadurch bleibt auch ein Stapel fortsetzbar und
   läuft nicht als ein einziger langer Aufruf in ein Zeitlimit. Ein Fehler wird nicht
   automatisch wiederholt und blockiert die übrigen bestätigten Dateien nicht.
5. Den Typ müssen Sie nur nennen, wenn eine eigenständige Bilddatei sonst nicht
   einzuordnen ist, zum Beispiel „als Bewerbung“ oder „als Kundendokument“.
   Textdokumente und gemischte Textstapel werden automatisch eingeordnet.
6. Der normale Ordnerablauf öffnet keinen zusätzlichen Prüfdialog. Mehrdeutige
   Organisations-/Zertifikatsstellen stoppen nur die betroffene Datei sicher; sie
   werden nicht geraten. Jede freigegebene Fassung besteht danach nochmals das
   automatische Residual-Gate.
7. Claude nennt am Ende die Zahl erfolgreicher und sicher gestoppter Dateien und
   arbeitet ausschließlich mit den in diesem Lauf freigegebenen Paketen weiter.

Wenn Sie ausschließlich Markdown ohne Bilder brauchen, sagen Sie einmalig:
*„Anonymisiere die Dateien und entferne alle Bilder.“* Bekannte Bildanlagen in
texttragenden Office-Dateien werden lokal verworfen und in der `.md` als entfernt
vermerkt. Unbekannte eingebettete Objekte sowie eigenständige Bilder und Scans werden
dadurch nicht an den Sicherheitsprüfungen vorbeigeführt.

Enthält eine Datei einen mehrdeutigen Zertifikats-/Organisations-Treffer, wird nur
diese Datei sicher gestoppt, weil der normale Ordnerlauf keinen lokalen
Entscheidungsdialog besitzt. Die übrigen Dateien werden weiterverarbeitet. Ein neuer
Versuch der gestoppten Datei erfolgt erst auf Ihren ausdrücklichen Auftrag.

Windows x64 besitzt die vollständigere Engineering-Grenze. macOS und Linux verwenden
für TXT/DOCX den gebündelten Node-Textpfad ohne Zusatzinstallation und stoppen bei
Bildern oder manuellen Mehrdeutigkeiten sicher. Windows ARM64 bleibt noch gesperrt.

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
| „Wie möchten Sie diese Datei öffnen?" | Abbrechen, Datei ins offene Claude-Fenster ziehen |
| „Keine unterstützte Datei im Eingang" | Datei liegt nicht in `Input` oder hat ein anderes Format |
| „Verarbeitung wurde sicher gestoppt" | **Kein Fehler von Ihnen.** Es wurde nichts freigegeben, nichts ist durchgerutscht. Nicht automatisch erneut starten. `diagnostic_status` aufrufen und nur den festen Fehlercode an IT melden — nicht Datei, Dateiname, Pfad oder Inhalt |
| `AMBIGUITY_REVIEW_REQUIRED` | Ein Organisationsname könnte Zertifikatsanbieter oder Arbeitgeber/Kunde sein. Die Datei bleibt in `Input`; nicht automatisch erneut starten. Der normale Ordnerablauf rät hier bewusst nicht |
| `PARSER_ISOLATION_FAILED` | Die lokale Windows-Sicherheitsgrenze fehlt oder ist beschädigt. Nicht erneut versuchen und nichts manuell umgehen; Plugin/Extension durch IT neu installieren lassen |
| `PARSER_RESOURCE_LIMIT` | Die Datei hat die feste lokale CPU- oder Speichergrenze erreicht. Es wurde nichts freigegeben. Nicht automatisch wiederholen; IT kann die synthetische Reproduktion prüfen |
| Claude meldet vor dem Start eine andere Anzahl | Im geöffneten `Input`-Ordner nur die beabsichtigten Dateien belassen und die korrekte Anzahl erneut bestätigen |
| „Grafik wurde nicht freigegeben" | Normalfall. Das Bild bleibt im aktuellen Engineering-Build lokal zurückgehalten (Regel 2) |
| `PDF_COVERAGE_UNVERIFIED` | PDF ist in RC28 unabhängig vom Inhalt sicher gesperrt. Verwenden Sie nach Organisationsfreigabe die ursprüngliche DOCX-/XLSX-/PPTX-/TXT-Datei oder lassen Sie einen ausdrücklich freigegebenen PNG-/JPEG-Export erneut durch DataSecure verarbeiten; niemals das Original-PDF oder den Export direkt in Claude hochladen |
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

GBH DataSecure – Dokumente anonymisieren 3.2.0 RC28 · Geschäftsbereich Healthcare, msg systems ag.
Diese Anleitung ist keine Rechtsberatung und ersetzt nicht die
Datenschutzvorgaben Ihres Bereichs.

Installationsoberflächen abgeglichen am 21.08.2026 mit den offiziellen Claude-
Anleitungen für Desktop Extensions und Plugins. Vor einem Rollout erneut prüfen:
<https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop>
und <https://support.claude.com/en/articles/13837440-use-plugins-in-claude>.
