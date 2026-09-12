# N3/N4-Checkliste

Jede Kennung wird immer zusammen mit ihrem Klartextnamen dokumentiert.
Prüfungen, die beide Produkte betreffen, werden in der Plattform-CSV zweimal
ausgeführt und getrennt bewertet. N3-03 gilt nur für Standalone, N3-04 nur für
das Cowork-Plugin.

## N3 – technische Zielhost-Abnahme

| ID | Prüfung | PASS-Regel |
|---|---|---|
| N3-01 | Kandidat eindeutig binden | Commit, Version, Paketname, SHA-256, OS, Architektur und Kanal stimmen mit dem Kampagnenmanifest überein. |
| N3-02 | Fresh Install und erster Start | Das zielrichtige Paket lässt sich nach Produktanleitung installieren und ohne Entwicklungswerkzeuge starten. Falsche Architektur stoppt verständlich. |
| N3-03 | Standalone-Kommunikation | Oberfläche, privates IPC, Sidecar und Core sind ohne separat gestarteten Server erreichbar; Diagnose öffnet inhaltsfreie Logs. |
| N3-04 | Cowork-Kommunikation | Lokale Cowork-Sitzung erkennt Plugin und Tools nach Neustart. Cloud-/Web-/Mobilpfade erhalten keinen lokalen Originalzugriff. |
| N3-05 | Datei-, Ordner- und Ergebnisweg | Ein Picker je Auswahl, rekursive Unterordner, Auswahlkorrektur, Ergebnisordner, exakte Öffnen-Aktion und produktspezifische Mappingregel stimmen. |
| N3-06 | Format- und Sicherheitsgrenzen | Alle laut aktuellem Produktvertrag freigegebenen Formate funktionieren; beschädigte, aktive oder verschlüsselte Quellen stoppen wie dokumentiert. Bei einem DS-098-Kandidaten erhält reine DOCX-Konvertierung Kopf-/Fußzeilen, während die Anonymisierung sie nach vollständiger Strukturprüfung auslässt, den engeren Umfang nennt und Hauptteil, Kommentare, Fuß- und Endnoten erhält. |
| N3-07 | Abbruch, Neustart und Fortsetzung | Kein Doppelstart, keine Duplikate, kein alter Ergebnis-Fallback und konsistenter Stapel-/Pseudonymzustand. |
| N3-08 | Quellen- und Netzwerkgrenze | Originale bleiben bytegleich. Standalone funktioniert offline; Cowork sendet keine Originaldaten, Pfade oder Dateinamen an Claude. |
| N3-09 | Serien- und Grenzlauf | Versionsneuer 200-Dateien-Lauf und vereinbarte 500-MiB-Prüfung schließen ohne unzulässigen Teiloutput ab; Zeiten und Referenzhardware werden inhaltsfrei notiert. |
| N3-10 | Update, Rollback und Entfernen | Aktualisierung und Rückkehr zum freigegebenen Vorgänger verändern weder Quellen noch fertige Exporte; Entfernung löscht keine Nutzdaten. |

Für N3-05 bis N3-09 gelten zusätzlich die detaillierten Fälle aus den beiden
produktbezogenen UAT-Kits. Cowork-Marketplace-Lifecycle wird nur geprüft, wenn
der Marketplace im Kampagnenmanifest als freizugebender Kanal eingetragen ist.

Für Cowork-N3-07 ist ein tatsächlich unterbrochener eigener Test-Worker mit
dauerhaftem Checkpoint erforderlich, siehe [UAT-05](../UAT_TEST_KIT/STEP-BY-STEP.md#uat-05--unterbrochenen-zehnerstapel-fortsetzen).
Claude schließen kann den getrennten Worker weiterlaufen lassen und belegt
keine Wiederaufnahme. Fehlende Unterbrechung ergibt `BLOCKED`; ein bereits
abgeschlossener Lauf ist kein Ersatz-PASS für den Fortsetzungsteil.

## N4 – formale Anwender- und Freigabeabnahme

| ID | Prüfung | PASS-Regel |
|---|---|---|
| N4-01 | Einstieg und Aufgabenverständnis | Testperson erkennt beide Standalone-Funktionen beziehungsweise den Cowork-Anonymisierungsweg ohne technische Erklärung. |
| N4-02 | Einfacher Normalweg | Auswahl, Start, eventuelle Sammelprüfung und Ergebniszugriff sind eindeutig; keine Bestätigungsorgie oder unerwartete Navigation. |
| N4-03 | Ergebnisverständnis | Konvertierung versus Anonymisierung, Extraktionsgrad, gestoppte Dateien und Zuordnung werden fachlich richtig verstanden. Beim DOCX-Vertrag ist verständlich, dass Kopf-/Fußzeilen nur in der anonymisierten Ausgabe fehlen und dies keine Aussage über PDF-/PPTX-Randbereiche ist. |
| N4-04 | Stapel und Historie | Dokumentübergreifende Personen-/Unternehmenskennungen, 20 Verlaufszeilen und laufgebundene Aktionen sind nachvollziehbar. |
| N4-05 | Fehler und Wiederaufnahme | Abbruch, Fehler, Diagnose und Fortsetzung nennen eine klare nächste Aktion; technische Codes erscheinen nur als Detail. |
| N4-06 | Accessibility | Vollständig per Tastatur bedienbar; Fokus sichtbar; 200-%-Zoom ohne Funktionsverlust; Narrator beziehungsweise VoiceOver vermittelt Namen, Zustand und Aktionen. |
| N4-07 | Fach-, Datenschutz- und Sicherheitsurteil | Erhalt fachlicher Inhalte, PII-Ersetzung, lokale Grenzen, Lösch-/Retentionregel und bekannte Formatgrenzen werden bestätigt. |
| N4-08 | Gemeinsames Releaseurteil | Beide Plattformprotokolle sind vollständig, Defects bewertet und die formale Entscheidung durch beide Testerrollen nachvollziehbar bestätigt. |

## Ergebniswerte

- `PASS`: vollständig und wie erwartet beobachtet.
- `FAIL`: Produkt- oder Dokumentationsabweichung; Defect-ID eintragen.
- `BLOCKED`: wegen Umgebung oder fehlender Voraussetzung nicht ausführbar; kein
  Ersatz für PASS.
- `NOT_RUN`: noch nicht durchgeführt.
