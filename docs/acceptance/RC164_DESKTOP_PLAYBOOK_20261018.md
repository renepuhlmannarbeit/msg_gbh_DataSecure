# RC164 – zielgerichteter Windows-Desktoptest

Dieser Leitfaden ist Anwendungswissen, kein festes Klickmakro und kein Nachweis
einer bereits bestandenen Abnahme. Aktuelle native Accessibility-Beobachtung
oder Screenshot bleibt vor jeder Aktion erforderlich. Keine alten Element-
Indizes/Koordinaten übernehmen und keine blinden Mehrfachklicks. Nur der
Hauptagent steuert den Windows-Desktop; Reviewer verwenden keinen Desktop.

## Vorbereitung und Paketbindung

- Exakten RC164-Archivhash, EXE-Hash, Gitcommit, Produktfingerprint und sichtbare
  Buildkennung protokollieren. Nur den Kandidaten aus diesem Archiv starten.
- Einen neuen create-only Testbereich mit
  `scripts/prepare-standalone-desktop-acceptance.mjs` erzeugen. Drei bekannte
  synthetische Goldeninputs werden vor dem Kopieren an Größe/SHA256 geprüft.
  Nichts aus alten ERGEBNISSE-/BELEGE-/ANLEITUNG-Ordnern als Eingabe auswählen.
- Starthelfer `tests/manual/standalone-native-workspace-gui.ps1 -Archive <ZIP>`
  bindet das Archiv und erzeugt ein neues isoliertes Smokeprofil. Er ändert
  keine Benutzerprofile oder globalen Einstellungen. Das neue Profil und seine
  Diagnose bleiben als Evidenz erhalten. Ein späterer Normalprofil-Smoke ist
  ein zusätzlicher Nachweis, kein stiller Ersatz für die Isolation.
- Gleichzeitige Appinstanzen ausschließen. Ein tatsächlich gesperrter Desktop,
  Sicherheits-/Berechtigungsdialog oder unbestätigte Mutation stoppt die
  betreffende GUI-Prüfung. Keine Schutzrichtlinie/ACL ändern, keine Anmeldung
  bedienen, kein unbestätigtes Starten/Exportieren wiederholen.
- `sky` über den Computer-Use-Skill verwenden, keine eigenen UIA-/DOM-/Win32-
  Steuerhelfer. Accessibility-only-Snapshot bevorzugen, wenn er ausreicht;
  Screenshot ergänzen, wenn Layout, Originalbild oder Modal geprüft werden muss.

## Ansichten und vorhandene Kennungen

IDs dienen dem Quell-/Browserreview. Native Desktopsteuerung kann sie nicht
einfach als DOM-Selektor verwenden. Maßgeblich sind die tatsächlich gelieferten
zugänglichen Namen/Rollen und jeweils frische native Elementindizes.

| Bereich | Sichtbar / zugänglich | Bestehende Quellkennung |
| --- | --- | --- |
| Navigation | Neue Verarbeitung, Verlauf, Laufdetails, Einstellungen | nav-new, nav-history, nav-details, nav-settings |
| Aufgabe | Nur umwandeln; Umwandeln und anonymisieren | mode-markdown, mode-anonymize |
| Optionen | Schnellweg; Text aus Scans … per OCR lesen | fast-anonymize, text-ocr |
| Optionaler Rohtextvergleich | E-Mail-/Telefonwerte aus OCR vergleichen | ocr-review; nur bei Markdown+OCR aktiv |
| Eingaben | Dateien auswählen; Ordner auswählen | select-files, select-folder |
| Ziel und Start | Ordner ändern; Verarbeitung starten | change-destination, configure-results, start |
| Kontakt-/Fundstellenprüfung | Werte auswählen, Behandlung wählen, anwenden | matrix-body, bulk-treatment, bulk-apply |
| Vertagen | Später entscheiden | defer; native Bestätigung abwarten |
| Dokumente | Alle auswählen, Auswahl freigeben, Auswahl exportieren | documents-all, documents-approve, documents-export |
| Freigabebestätigung | Nach eigener Prüfung freigeben | documents-approve-proceed |
| Verlauf | Buttons mit zusätzlichem Lauf-/Datumskontext | history-<batch_id>-<action> |
| Diagnose | Diagnosepaket speichern | diagnostic-save; optional, kein Fachabschlussschritt |

Bei Dateidialogen nur den vollständigen synthetischen Ordnerpfad in das
beobachtete Pfad-/Dateinamensfeld eingeben. Keine Terminalbefehle, Run-Dialoge
oder indirekten Shellaufrufe über Explorer. Absicht, aktueller Fokus und
Zielanwendung vor Texteingabe prüfen.

## Testmatrix: Schritte und Orakel

Für jeden Fall ausschließlich `<Kampagne>/<Fall>/EINGABEN` auswählen und
`<Kampagne>/<Fall>/ERGEBNISSE` als Ziel setzen, sofern kein Wiederverwendungsfall.
Jede tatsächliche Lauf-ID im Testprotokoll festhalten.

| Fall | Schritte | Erwartetes Ergebnis |
| --- | --- | --- |
| 01-Markdown | Nur umwandeln; OCR aus; drei Eingaben; starten | Zwei Markdown-Ergebnisse, eine erwartete OCR-Auslassung; abgeschlossen mit Hinweisen, nicht anonymisiert |
| 02-Markdown-OCR-Pruefung | Nur umwandeln; OCR und Kontaktvergleich an; ein PNG; starten; echte Werte vergleichen und Gruppe speichern | Ein Ergebnis; beobachtete Kontaktprüfung und richtige gespeicherte Entscheidung, kein automatischer Anonymisierungsanspruch |
| 03-Gefuehrte-Anonymisierung | Anonymisieren; Schnellweg/OCR aus; drei Eingaben; tatsächliche Prüfgruppen fachlich behandeln; Dokumente vergleichen und ausdrücklich freigeben | Zwei freigegebene Ergebnisse, eine erwartete Auslassung; Originalwerte nicht ungewollt im anonymisierten Text; noch kein Export |
| 04-Schnellweg | Anonymisieren; Schnellweg/OCR an; drei Eingaben; starten und abwarten | Drei Ergebnisse und gekennzeichnete automatische Erstfreigabe, keine erfundene manuelle Prüfung; kein automatischer Export |
| 05-Vertagen-Neustart | Anonymisieren; OCR an/Schnellweg aus; ein PNG; in echter Prüfung nur vormerken, fünf Minuten warten, Später entscheiden; normal schließen und dasselbe Archiv neu starten; dieselbe Lauf-ID ausdrücklich fortsetzen | Kein Timeout allein durch Denkpause; ungespeicherte Vormerkung gilt nicht als gespeichert; derselbe Lauf statt Ersatzlauf; gespeicherte Folgeentscheidungen bleiben erhalten |
| 06-Export-Status | Lauf03 öffnen; zwei freigegebene Dokumente auswählen; Vorschau; einmal Exportieren; Abschluss abwarten; Schließen | Genau zwei neutrale MD-Dateien im bestätigten Exportordner, keine privaten Begleitdaten; Übersicht desselben Laufs/Abschluss klar, kein zweiter Export nötig |
| 07-Verlauf-Fuenferfenster | Nach vorherigen wiederaufnehmbaren Fällen sechs kleine Markdownläufe nacheinander; neuester zuerst; einen abgeschlossenen Lauf nur ausblenden | Höchstens fünf registrierte Verlaufseinträge; kein sechster Nachrücker; Dateien bleiben erhalten; Ladezeit und Blockierungen separat messen |
| 08-Neuer-Leerer-Entwurf | Nach abgeschlossenem Lauf04 Details→Verlauf→Neue Verarbeitung | Kein konsumierter alter Dateibaum; kein neuer Lauf und keine neue Kopie; ein ungestarteter neuer Entwurf bleibt bei bloßem Reiterwechsel erhalten |
| 09-Auswahl-Abbrechen | Aufgabe wählen, ein TXT aufnehmen; weiteren Dateidialog öffnen und abbrechen; danach Zielpicker abbrechen | Bestehende Auswahl/Ziel unverändert, kein Start, kein technischer Fehler allein durch Abbruch |
| 10-Fehlender-Ergebnisordner | Eigenen kleinen Markdownlauf abschließen; App schließen; nur dessen neu erzeugten synthetischen Ausgabeordner nach geprüfter Zielbindung reversibel umbenennen; App neu starten | Fehlendes Ziel konkret anzeigen, nicht als Erstinstallation/Erfolg erfinden, keine automatische Neuanlage oder neuer Export; anderen gültigen Ordner wählen können |

Reihenfolge 07 erst nach 05/06, damit das Fünferfenster keinen noch zu prüfenden
Lauf aus der normalen Liste drängt. Offene Arbeit wird nicht nur für einen
Hide-Test verworfen. Kontrollwerte aus dem ursprünglichen Goldenbestand:
Anna Berger, anna.berger@beispiel-01.de, +49 30 5551000 und der ausschließlich
synthetische IBAN-Testwert. Nicht anschreiben/anrufen/überweisen. Originale
bleiben bytegleich; Ergebnisnamen allein beweisen keine Inhaltsanonymisierung.

## Evidenz und Fristen

- Pro Fall: tatsächlicher Kandidat, Lauf-ID, Einstellungen, Start/Endzeit,
  konkrete Anzeigen, erfüllte Orakel, Diagnose-/Exportbelege und Ergebnis.
- Toolaufrufdauer, Orientierungsschritte und Appoperation getrennt messen.
  Kein behaupteter Beschleunigungsfaktor ohne Vergleichsmessung.
- Langsame Arbeit mit fortschreitenden Diagnosephasen ist nicht automatisch
  ein Hänger. Bei unklarem ACK Status gezielt abgleichen, nicht mutierend retryen.
- PASS erst nach sämtlichen Pflichtorakeln; NOT_RUN bei nicht erschienener
  notwendiger Prüfung oder nicht ausführbarem Zielhostfall, FAILED bei Abweichung.
- Mac-native CI und späteres tatsächliches M2-/Finder-/TCC-Profil gesondert.
  Headless-Browser mit synthetischem IPC beweist keine native Desktopabnahme.

Beschriftungsabgleich: [W3C zugängliche Namen](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/)
und [sichtbare Beschriftung im zugänglichen Namen](https://www.w3.org/WAI/WCAG21/Techniques/general/G211.html).
