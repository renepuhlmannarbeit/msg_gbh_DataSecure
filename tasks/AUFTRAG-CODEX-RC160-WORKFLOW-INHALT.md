# Standalone Workflow und inhaltsgetreue Markdown Ausgabe

Stand: 13.10.2026 · schreibender, vom Anwender beauftragter Entwicklungsauftrag.
Bezug: [BL-010.53](../docs/canonical/BACKLOG.md#bl-01053--standalone-prototyp-v2-umsetzen-ds-110),
DS-085 und DS-110 in [DECISIONS](../docs/canonical/DECISIONS.md).
Lieferstatus ausschließlich im kanonischen Backlog, Nachweise in
[CURRENT_STATE](../docs/canonical/CURRENT_STATE.md) und
[TRACEABILITY](../docs/canonical/TRACEABILITY.md).

Zwischenstand 15.10.2026, r25/r26: Die native r25-Windows-App öffnete den
synthetischen 133-Dateien-Anonymisierungslauf und seine 115 privaten
Dokumentprüfstände stabil; ein Original/anonymisiertes Markdown-Paar war
lesbar. Die Prüfseite gruppierte die 17 OCR-aus-Stopps und den einen
Datenschutz-Stopp dort noch falsch als 18 technische Fehler. Ursache und
r26-Quellkorrektur sind belegt; r26 ist gebaut und der ZIP-Verifier grün,
der erneute native Bedienbeleg fehlt noch. Keine Dokumentfreigabe, keine
KI-Weitergabe, keine Veröffentlichung. Der belegte Ausweg für dauerhaft
unvollständige Ergebnisexporte bleibt ein offener separater Auftrag.

Anwendertest 14./15.10.2026: Der r19-Anonymisierungslauf mit 133
synthetischen Dateien erreichte 115 Ergebnisse und 18 Stopps (erst r22 als
17 OCR-aus-Auslassungen und ein Datenschutz-Prüfstopp klassifiziert), verlor
aber vor vollständigem sichtbarem Export die lokale Verbindung. r20 arbeitet
am sicheren Wiederanlauf; bis zu paketgebundenem und nativem Nachweis keine
Abnahme oder Weitergabe dieser unvollständigen Ergebnisse. Die optionale
laufübergreifende Erkennungsliste ist als gesonderter Backlogvorschlag erfasst.

Aktualisierung 15.10.2026: r21 stellte den zuvor unterbrochenen synthetischen
133-Dateien-Lauf unter Windows wieder her: 115 Ergebnisdateien mit privatem
sichtbaren Exportbeleg, 17 erwartete OCR-aus-Auslassungen und ein
Datenschutz-Prüfstopp. Es gab dabei keine
automatische Dokumentfreigabe und keinen KI-Export. Die im anschließenden
Quellschnitt korrigierte falsche Abschluss-/Fehleranzeige braucht noch einen
neuen Paket-/Nativtest; r22 belegte den Verlauf, aber sein Dokumentprüfabruf
überschritt die 30-s-Frist. Ein gezielter Fristenschnitt ist in Arbeit.
Die eigenständige Aufgabe „Lauf ohne Export aufgeben“
bleibt offen.

Früherer Befund vom 15.10.2026: r20 scheiterte auch im nativen Wiederanlauf:
Sidecar-Initialisierung rund 27 Sekunden, erster Statusabruf innerhalb des
gemeinsamen 30-Sekunden-Fensters ohne Antwort; danach sichere Startsperre.
Der lokale Folgeschnitt trennt diese Fristen. Aufgabe 7 ergänzt eine
bedienbare, belegte Entscheidung für technisch steckengebliebene Läufe.
Der Anwender hat die eigenständige Nachtarbeit mit lokaler Windows-Bedienung
und ausschließlich synthetischen Testdaten erneut ausdrücklich beauftragt;
die bisher pausierte Fortsetzungsautomation ist dafür wieder aktiviert.

Neuer abgegrenzter Auftrag 14.10.2026: Der Anwender beauftragt danach
ausdrücklich die **vollständige Implementierung des neuen Anonymisierungswegs**
für einen lokalen Windows-Test. Der zuvor gesperrte `content-v1`-Start wurde
bis zur getrennten Dokumentfreigabe und zum KI-Export verbunden. Der
paketgebundene r19-Sidecar-/Worker-Smoke und ZIP-Verifier sind grün; der
vollständige Quell-/Rust-Testeingang des letzten Schnitts besteht mit Exit 0.
Native GUI-/Mac- und menschliche Inhaltsabnahme bleiben separate Gates.
Die ältere Startsperre im folgenden chronologischen Absatz beschreibt nicht
mehr den aktuellen lokalen Quellstand. Keine dauerhafte Automation oder
Veröffentlichung wurde dadurch neu autorisiert.

Aktualisierung 14.10.2026: Der Anwender hat die dauerhafte Zielverfolgung beendet.
Die Automation ist pausiert. Aktuell beauftragt sind der reine Markdown-Weg,
ein direktes Überspringen seiner freiwillig gestarteten OCR-Kontaktprüfung
ohne fingierte Bestätigung und die erneute paketgebundene Erprobung des
bestehenden Anonymisierungswegs in einem lokalen Windows-Testpaket. Die neuen
`content-v1`-Anonymisierungsoptionen bleiben trotz des inzwischen lokal
verbundenen privaten Publikations-/Mapping-/Exportkerns bis zum vollständigen
Rust-/IPC-/UI-Start und Ende-zu-Ende-Nachweis gesperrt. Die bisherigen Gesamtziele bleiben
Anforderungen, aber keine selbständige Nacht-/Releaseberechtigung.
OCR wird im reinen Weg über eine gemeinsame Checkbox für Scans, Bilder und
Grafiken ausdrücklich eingeschaltet, standardmäßig aus. Eine zusätzliche
manuelle Scan-/Grafikzuordnung ist dafür nicht erforderlich. Native Bedienung
des lokalen Pakets übernimmt zunächst der Anwender.

## Ziel und Berechtigungen

Standalone soll für alle angebotenen Formate und beide Hauptwege verständlich
funktionieren. Reine Konvertierung erzeugt eine möglichst inhaltsgetreue
Text-/Tabellenkopie als `.md`, keine Zusammenfassung und keine Anonymisierung.
Anonymisierung verwendet denselben Inhaltseingang, ergänzt die definierten
Entitätsentscheidungen, die finale Dokumentkorrektur, revisionsgebundene
Freigaben und einen getrennten KI-Export. Originalnamen bleiben im reinen Weg
erhalten; anonymisierte KI-Kopien sind neutral benannt.

Der Anwender hat selbständige Umsetzung, zusätzliche zielbezogene Teilaufgaben,
Subagentenreviews und lokale Desktoptests wieder autorisiert. Nur synthetische
Testdaten, Originale unverändert, fremde Programme/Daten unangetastet. Keine
API-Keys, keine OpenAI-API, keine zusätzlichen kostenpflichtigen Dienste.
Die bestehende Abo-Nutzung ist der Arbeitsweg. Ein neues Paket wird erst nach
gebundenen Tests angeboten; Prüf- und Sicherheitsgrenzen werden nicht umgangen.

## Verbindliche Inhaltsregeln

Text, Überschriften, Listen, Tabellenzellen, Werte, Formeln mit gespeicherten
Werten und vorhandene textliche Bildunterschriften/Alternativtexte erhalten.
Keine erfundenen Bildbeschreibungen, keine Zusammenfassung, keine pauschale
Zeichen- oder Fachwortlöschung. Bilder, Bild-Data-URLs, Bildpfade und technische
Konvertierungsnotizen gehören standardmäßig nicht in den Markdown-Nutztext.
Coverage-/Fehlerhinweise bleiben in der lokalen App und im privaten Nachweis.
Bei Scans ist OCR erforderlich; Text aus zusätzlichen Bildern/Grafiken wird
nur nach ausdrücklicher Anwenderwahl gewonnen. Diese Wahl ist von der
OCR-Kontaktprüfung getrennt und gilt auch bei Anonymisierung. Ein Bild ohne
gewählte Bild-Texterkennung wird mit Name und Handlungsoption gemeldet, nicht
als leere erfolgreiche Datei ausgegeben.

Echte Codebeispiele und literal gespeicherte TXT-/CSV-/Office-Zellen sind
Inhalt. Bildsyntax wird nur an tatsächlich erkannten Bildknoten entfernt;
Codeblöcke, Escapes, Linkreferenzen und Tabellen dürfen nicht beschädigt werden.
PDF-Layout ist nicht automatisch Tabellenstruktur. Nicht zuverlässig erhaltene
Tabellen/Lesereihenfolgen benötigen einen sichtbaren Hinweis, keine erfundenen
Zellzuordnungen. Nahezu 1:1 beschreibt Inhaltsnähe, nicht Pixel-/Layoutgleichheit.

## Reihenfolge und verknüpfte Aufgaben

1. [Ablaufanzeige](rc160-workflow/01-ablaufanzeige.md): belegte Phasen und Laufbindung.
2. [Zustände und Hauptaktion](rc160-workflow/02-zustaende-hauptaktion.md): keine vorgezogene Freigabe.
3. [Offene Prüfliste](rc160-workflow/03-offene-pruefliste.md): vorhandenes Nachrücken absichern, klare Speicherung.
4. [Übergänge](rc160-workflow/04-uebergaenge.md): Folgegruppen und Dokumentprüfung desselben Laufs.
5. [Fehlerführung](rc160-workflow/05-fehlerfuehrung.md): Datei, Ursache, nächste zulässige Aktion.
6. [Markdown und OCR](rc160-workflow/06-markdown-ocr.md): gebundene Ausgabe-/OCR-Optionen vor Prüfung.
7. [Technischer Lauf und sichere Auswege](rc160-workflow/07-technischer-lauf-auswege.md): Verbindung, Wiederaufnahme und ausdrückliche Aufgabe ohne Export.
8. [Anonymisierung über alle Formate abnehmen](rc160-workflow/08-anonymisierung-formatabnahme.md): synthetische Formatmatrix und native Prüf-/Freigabe-/Exportfolge ohne pauschale Freigabe.

Die ersten fünf Aufgaben dürfen unabhängig vom neuen Extraktionsvertrag
ausgeliefert werden. Aufgabe 6 wird geschlossen über Aufnahme, Rust/IPC,
Worker, unveränderliches Journal, Resume, OCR-/Dokumentprüfstand und Export
implementiert. Eine rein optische Checkbox ohne Wirkung ist keine Lieferung.
Anschließend verbleibende lieferbare technische Standalone-Storyreste einschließlich
zielgebundenem Einzeldatei-Retry bearbeiten; deren bestehender Restvertrag
in BL-010.53.7 bleibt maßgeblich. Cowork-, Marketplace- und Zukunftsausbau
werden nicht als erledigt ausgegeben oder still in Standalone gekoppelt.

## Reviewintervalle

Nach jedem abgeschlossenen Umsetzungsschritt und vor einem Paket mindestens
eine unabhängige technische Read-only-Gegenprüfung. Bei Verarbeitung und
Persistenz zusätzlich Privacy/OCR und Rust-/Lebenszyklusrolle; höchstens drei
gleichzeitige Subagenten, keine Kaskaden. Befund mit Reproduktion, Ist/Soll,
Auswirkung und bestehendem BL-/DS-Bezug. Bestätigten Gegenfall zuerst als
Regression ausführen, dann beheben und erneut prüfen. Neue Ideen nur mit
begründetem Zielbeitrag und neuem Abnahmekriterium übernehmen. Reviewrollen
und automatisierte Bedienung sind keine erfundene menschliche Fachevidenz.

## Gesamtprüfung und Abschluss

Formatmatrix: TXT, MD/Markdown, CSV, DOCX, XLSX, PPTX, PDF mit Textschicht,
Scan-PDF, gemischtes PDF, PNG, JPEG, BMP × beide Zwecke × relevante Optionen.
Für jede Zelle Quelle/Referenz und erwartete Ausgabe unabhängig bestimmen.
Erfolg, unvollständige Coverage, leere/defekte/aktive/geschützte Quelle,
Größenlimit, Pause, Vertagen, Neustart, Lost-ACK, veränderte Quelle/Revision,
Namenskollision und Teil-/Wiederholungsexport getrennt prüfen.

Gezielte Tests → vollständiger kanonischer Testeingang mit ehrlicher GUI-Grenze
→ Rust/Clippy → Docs/strenge Pluginstruktur → frischer Windowsbau und vollständiger
ZIP-Verifier → exakter Sidecar → tatsächliche Tauri-Bedienung → native Mac-
Architekturen soweit Testhosts vorhanden. Quelle, Runtime, Archiv und Ergebnisse
binden; alte grüne Nachweise sind keine neuen Paketbelege. Browser-/DOM-Tests
ersetzen weder native Picker noch OS-Fehler-/Dateimanagerbedienung.

Abschluss nur, wenn jede Anforderung durch aktuelle angemessene Evidence
belegt ist. Fehlende externe Voraussetzungen werden benannt und verhindern
keine andere lokal mögliche Umsetzung. Rohe OCR-Genauigkeit, entfernte sensible
Angaben und erhaltene Sachinhalte werden getrennt gemessen; keine universelle
OCR-, Anonymitäts- oder Rechtskonformitätszusage.

## Verbindliche Architekturgrenzen

Renderer, Anwendungsdienst, reine gemeinsame Verträge und native OS-Adapter
bleiben getrennt. Konvertierung und Anonymisierung sind unterschiedliche
validierte Varianten; Speicherformat, Produktkanal und Zweck sind nicht
austauschbar. Ein unbekannter Vertrag stoppt, statt als Boolean-default in
einen anderen Zweck zu fallen. Rust nutzt für neue fachliche Varianten Enums
und vollständige Fallbehandlung; JS-/IPC-Einstiege verwenden geschlossene Decoder.

Belegerzeugung, Prüfung/Freigabe, Export, Wiederaufnahme und Veröffentlichung
erzwingen ihre Voraussetzungen an der verantwortlichen Operation selbst.
Zentrale Regeln ersetzen nicht diese Durchsetzung. Direkte interne Einstiege
gehören in die Tests. Ergebniszustände, Pause/Neustart, Lost-ACK und Legacy-
Schwellen bilden Fehlerklassen, nicht nur einen nachträglich bekannten Fall.
Unitfixtures benötigen passende Laufidentitäten; Produktgrenzen werden nicht
zur Erhaltung grüner Mocks gelockert. Reine Verträge bleiben ohne native I/O-
Imports, kryptografische Persistenz gehört zum Adapter.

Extraktion, OCR-Korrektur, Entitätsgruppenentscheidung, menschliche Dokument-
freigabe, erstellte Exportkopie und bestätigter Export bleiben verschiedene
autoritative Zustände. Der Renderer projiziert sie, statt Abschluss zu erraten.
Ein vollständiger MVC-Neubau oder Rust-Rewrite ist daraus nicht begründet.
Neue Nutzeroptionen erst nach durchgängigem Anschluss aktivieren.

Standalone-Nutzererklärungen beschreiben lokale eigenständige Verarbeitung,
ohne Claude-/ChatGPT-Anbindung, API-Key oder automatische Uploads. Interne
Produktgrenzen der gemeinsamen Codebasis suggerieren keine Modellkopplung.
Eine spätere externe Nutzung fertiger Dateien entscheidet allein der Mensch.

Die Durchsetzung an der Operation ist eine auf unsere Zweck-/Freigabegrenzen
übertragene Anwendung des [OWASP-Musters](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Patterns_Cheat_Sheet.html),
keine Einführung von Konten oder eines externen Policy-Dienstes.
Die [Rust-Dokumentation](https://doc.rust-lang.org/book/ch06-02-match.html)
begründet vollständige Fallbehandlung, keinen pauschalen Sprachwechsel.

## Revalidierte Muster

[W3C Statusmeldungen](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html):
wichtige Zustandsänderung ankündigen, ohne Fokusentzug oder ständig vorgelesene Zähler.
[W3C On Input](https://www.w3.org/WAI/WCAG22/Understanding/on-input.html):
Auswahl ist keine überraschende Verarbeitung oder Navigation.
[Carbon Sammelaktionen](https://v10.carbondesignsystem.com/components/data-table/usage/):
zentrale Behandlung ausgewählter Zeilen.
[Carbon Fortschritt](https://v10.carbondesignsystem.com/components/progress-bar/usage/):
messbare Zähler von unbestimmter Aktivität trennen. Übernommen werden Prinzipien,
keine neue Framework-Runtime oder behauptete Accessibility-Zertifizierung.
