# Aufgabe 8: Anonymisierung über alle angebotenen Formate abnehmen

Verknüpft mit [BL-010.53.11](../../docs/canonical/BACKLOG.md) und dem
[RC160-Arbeitsauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md).
Status: offen; bisherige Teil- und Paketbelege sind keine Gesamt-Abnahme.

Native Windows-Teilabnahme r34 **ohne OCR**: Das unveröffentlichte, verifizierte
ZIP (SHA-256
`950a2cffa5956955f4fcf0d4f6dc3c7d5eab83a6977a3b609412c1f1a50b501d`)
wurde mit elf ausschließlich synthetischen Dateien aller zehn angebotenen
Endungen in einem isolierten Profil bedient. Sieben private Prüfstände,
vier erwartete Bild-/Scan-Auslassungen und null technische Fehler erschienen.
Ein MD-Dokument wurde visuell gegen das Original geprüft, ausdrücklich
freigegeben und neutral exportiert. Die erste Exportvorschau ließ die
Ordnerwahl zu, ohne schon zu kopieren. Eine zusätzliche Maskierung erzeugte
einen neuen Stand, entzog die Freigabe und blockierte den Folgeexport bis
zur erneuten Freigabe. Danach entstand eine zweite neutrale Kopie; die
erste blieb bytegleich. Nach Neustart zeigte der direkt geladene
Verlaufs-Prüfstatus 1/7 aktuelle Freigaben, zwei abgeschlossene KI-Exporte
und 1/7 aktuelle Stände in Abschlussbelegen. Die übrigen sechs verfügbaren
und vier ausgelassenen Quellen wurden nicht freigegeben oder exportiert.
Paket-Sidecar-Smoke beider Wege und vollständige Standalone-Quellsuite
bestanden (118 Rusttests; sechs automatisierte native Formfälle `NOT_RUN`).
Offen bleiben native technische Teilkopie/Wiederaufnahme/Exportverzicht-
Fehlerfälle, Mac-Zielhost und breitere Inhaltsqualität.

Native Windows-Teilabnahme r33: In einem isolierten Profil verarbeitete das
unveröffentlichte ZIP mit SHA-256
`76ff58eed2581137d4ba0361028b0e321b6d55ef6aacf4243c7421423f36caa1`
elf kopierte synthetische Dateien aller zehn angebotenen Endungen mit OCR
und Anonymisierung. Acht OCR-Kontakte aus vier Quellen wurden bewusst
bestätigt; nach 11/11 Ergebnissen und nativer Textgegenüberstellung wurden
11/11 aktuelle Stände ausdrücklich freigegeben. Der anfänglich sicher
gestoppte Export (`AI_EXPORT_CONFIGURATION_REQUIRED`) gelang nach Auswahl
desselben isolierten Ergebnisordners und erneutem Klick: genau elf neutrale
Markdown-Dateien, keine privaten Begleitdateien. App-Neustart und
ausklappbarer Prüfstatus belegen 11/11 Freigaben und einen Export. Noch
offen: Ohne-OCR-Gesamtformatlauf, gezielte Korrektur/Freigabeentzug,
Teilkopie/Wiederaufnahme/Verzicht, Mac-Zielhost und breitere Inhaltsqualität.
Die initiale Verlaufsanzeige des r33-Pakets behauptete nach Neustart zu früh
eine offene Dokumentfreigabe. Im r34-Folgeschnitt ist der Einstieg neutral,
der Freigabe-/Exportstatus direkt erreichbar und die Ordnerwahl bereits in
der ersten Exportvorschau möglich. Gezielte Frontendtests, unabhängiges
Fachreview und native Bedienung dieser UX bestehen; siehe oben und
BACKLOG/CURRENT_STATE.

Teilstand 15.10.: Das unveröffentlichte r29-Windows-Paket bestand den
Verifier und isolierten Paket-Sidecar-Smoke. Eine neue, synthetische
Vierformat-Gegenprobe (PNG/JPEG/BMP/Scan-PDF mit OCR) entdeckte in r28 eine
unbeschriftete Namenszeile im anonymisierten Ergebnis; r29 verlangt dafür
eine exakte menschliche Entscheidung und erstellt danach vier neutral
benannte Dateien ohne die synthetischen Rohidentitäten. Die Gegenprobe
prüft Sachtext, unveränderte Quellen und fehlende automatische Freigabe.
Markdown-only ohne/mit OCR blieb im selben Pakettest grün. Der nächste
Abnahmeschritt ist weiterhin **native Bedienung aller Formate**. Ein
getrennter r29-Windows-Klicklauf mit einer synthetischen TXT-Datei hat nun
Auswahl, Anonymisierung, Vergleich, persistente Freigabe und genau einen
neutral benannten KI-Export belegt. Ein anfänglicher sicherer Stopp
`AI_EXPORT_CONFIGURATION_REQUIRED` wurde nach erneuter Auswahl desselben
isolierten Ergebnisordners ohne Neulauf behoben. Vollständige Standalone-
Quellsuite Exit 0 mit 118/0 Rusttests; automatische native Windows-Formfälle
weiter `NOT_RUN`. OCR-Raster-/Office-Bedienung und technische Fehlerfälle
bleiben offen; dieser Teilbeleg ersetzt die Gesamt-Abnahme nicht.

## Nutzerziel

Aus synthetischen Originalen aller angebotenen Typen verständliche
Markdown-Ergebnisse erzeugen, die im Anonymisierungsweg nur nach einer
bewussten, standgebundenen Dokumentprüfung für KI exportiert werden können.
OCR-Auslassungen, Datenschutz-Stopps und technische Fehler müssen getrennt
erscheinen; Originale und private Zuordnung bleiben unverändert bzw. privat.

## Prüfumfang

1. TXT, MD, CSV, DOCX, XLSX, PPTX, PDF, PNG, JPEG und BMP mit kleinen und
   komplexen synthetischen Beispielen. Text, Tabellen, eingebettete Grafiken,
   Scans und Format-Sonderfälle getrennt betrachten; keine Vollständigkeit
   allein aus einem grünen Laufstatus ableiten.
2. Anonymisierung ohne OCR und mit OCR als zwei eigenständige Läufe in
   isolierten Ergebnisordnern. Bei ausgeschaltetem OCR erwartete
   Bild-/Scan-Auslassungen als Hinweise, keine leeren MD-Dateien; bei
   eingeschaltetem OCR erkannte Zeichen am Bild stichprobenartig vergleichen.
3. Für einen kleinen, vorher festgelegten synthetischen Satz die gesamte
   Benutzerfolge nativ bedienen: Auswahl → Verarbeitung → Fundstellen →
   Dokumentvergleich → gezielte Korrektur → explizite Freigabe → Export-
   Vorschau → KI-Kopie. Andere Dokumente und gestoppte Quellen bleiben ohne
   Freigabe oder Export. Nach Neustart Belege und Dateiinhalte prüfen.
4. Für jedes Format Lesbarkeit, Tabellenstruktur, fehlende/überzählige
   Bildreferenzen, Entitätserhalt bzw. Maskierung, Dateinamen und
   verständliche Handlungsaufforderung kontrollieren. Sichtbare Resultate
   sind Stichproben; keine universelle OCR-/Anonymitätsgarantie behaupten.
5. Bestehenden Markdown-only-Weg bei jeder funktionalen Änderung mit einer
   gezielten Regression schützen. Mac nur mit echtem Zielhostbeleg als nativ
   getestet bezeichnen.

## Abnahmebeleg

Paketpfad und SHA-256, genaue synthetische Quellen und isoliertes Ziel,
Format-/Optionenmatrix, Testausgänge pro Format, beobachtete UI-Zustände,
abgelehnte sowie erfolgreiche Aktionen und verbleibende Grenzen in
CURRENT_STATE und TRACEABILITY verlinken. Keine echten Personendaten,
API-Keys, bezahlte Dienste oder ungeprüfte Veröffentlichung.
