# Aktiver Refactoring- und Migrationsplan

Stand: 06.09.2026 · Grundlage DS-065 bis DS-086

Der frühere Keyring-/Verschlüsselungsplan ist historisch und liegt im
[Archiv](../archive/2026-09/canonical-history/REFACTORING_PLAN_HISTORY_THROUGH_RC84.md).
Dieser Plan beschreibt die weiterhin gültige Reihenfolge und ihre Gates,
nicht den Erledigungsstand jeder Teilaufgabe. Implementierung steht in
[CURRENT_STATE.md](CURRENT_STATE.md), offene Arbeit ausschließlich im Backlog.
Die aktuelle Produkt-/Zweckmatrix steht in
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md#aktuelle-fähigkeiten-nach-produkt-und-zweck).

## R1 – Dokumenten- und Buildvertrag konsolidieren

1. Aktive Dokumente von historischen Nachweisen trennen.
2. ZIP/Marketplace als Produktbuild und MCPB als expliziten Engineering-Build
   technisch trennen.
3. UAT, README, Release-, Security- und Betriebsdokumente auf DS-067 prüfen.
4. Semantische Dokumentengates für Kanal, Retention, Bilder und Version ergänzen.

**Gate:** `npm run test:docs`, Produktartefakttests und Linkprüfung bestehen.

## R2 – Selbsttragende lokale Runtime

1. Die Plugin-ZIP enthält alle benötigten Laufzeiten; Nutzer installieren weder
   Node.js noch Python.
2. Rollenassembly, Start-, Abbruch-, Resume- und Unveränderbarkeitsnachweis
   schließen.
3. Windows x64 und macOS Intel/ARM getrennt paketieren und frisch installieren.

**Gate:** Kernfall läuft ohne System-Node; bei fehlendem/defektem Zielartefakt
stoppt das Plugin vor Originalzugriff. Linux folgt als eigenes Paket.

## R3 – Stapelkern und lokale Datengrenze

1. Plain-Arbeits-/Reviewkopien, Link-/Swap-Schutz und stapelweiten
   Pseudonymkontext abschließen.
2. Nur DataSecure-eigene temporäre Arbeits-/Reviewdaten unterliegen 0–14 Tagen.
3. Quellen/Originale und fertige Exporte sind nie Ziel automatischer Löschung.
4. Abbruch und Resume wiederholen keine terminalen Positionen und erhalten den
   gespeicherten Zweck sowie das ursprüngliche Laufziel.
5. Gemeinsame Readiness bindet beide Produkte: Bei Review plus offener
   automatischer Arbeit zuerst Batchfortsetzung, danach Sammelreview; Delivery-
   und Mappingarbeit gehören zu dieser Sperre. Abgeschlossen zählt Ergebnisse
   plus terminale Stopps.

**Gate:** Unit-, Negativ-, Crash-, Recovery-, Retention- und Mappingtests sowie
reale Windows-/macOS-Gegenproben bestehen.

### R3a – Gemeinsamer Kern, getrennte Produktadapter

1. Die reinen Verträge für nächste Stapelaktion, Konverterkommunikation und
   Ergebnisgrad liegen seit RC109 einmalig unter `server/core/`. Bestehende
   Importpfade bleiben als Reexports erhalten, solange Verbraucher sie nutzen.
2. Als nächster Schnitt werden I/O-Verifikation, Zustandsprojektion und
   MCP-/Desktopantworten in der verbleibenden Batch-Komposition getrennt.
   Bloßes Verschieben von Dateien beseitigt diese Abhängigkeiten nicht.
3. Beide realen Produktprojektionen bleiben vollständig ladbar. Der
   testseitige Policy-Fingerprint und semantische Golden-Korpus decken seit
   RC109 TXT, Markdown, CSV und DOCX, alle fünf expliziten Profile,
   Ergebnisgrade, Review sowie Abbruch und Wiederaufnahme in frischen Prozessen
   ab; gleiche Fachidentitäten dürfen nicht durch bloßen Textvergleich verloren
   gehen.
4. Der reine Konvertierungszweck bleibt separat auf Inhaltserhalt geprüft.
   Eine Laufzeit-/Journal-Fingerprintbindung braucht einen eigenen
   Kompatibilitätsvertrag und wird nicht beiläufig in bestehende Journale geschrieben.

**Gate:** `test-core-contracts.mjs`, `test-core-policy-binding.mjs`, echte
Produktprojektionen sowie betroffene Admission-/Review-/Export-/Recoverytests.
Der erweiterte Golden-Korpus belegt die unterstützte E0-Produktparität. Die
vollständige Core-Entkopplung bleibt zusätzlich an Struktur-, Import- und
Paketgrenzen gebunden und darf nicht allein aus Golden-Ergebnissen abgeleitet
werden.

## R4 – Einfache Cowork-Nutzerreise

1. Im nach DS-078 zugelassenen lokalen Host öffnet ein Satz oder direkte
   Skillauswahl genau einen Quellenpicker; einmalig geht bei fehlendem
   Ergebnisstandard die eindeutige Ergebnisordnerwahl voraus (DS-080).
2. Bestätigung der Quellauswahl startet den lokalen Pluginlauf; kein Profil-
   oder Bildmodusdialog. Das Empfangs-ACK ist kein Checkpoint oder Abschluss.
3. Hintergrundlauf ohne Claude-Polling; genau eine lokale Abschlussmeldung.
4. Ergebnislesen erst auf ausdrücklichen Folgeauftrag und in begrenzten Seiten.
5. Mehrdeutigkeit gesammelt lokal prüfen; Abbruch bleibt fortsetzbar.
6. Standalone verwendet denselben Core mit eigener Nutzerreise (DS-082/085/086):
   Startseite ohne Defaultmodus, zwei Zwecke, lokale Quellenanzeige, native
   Picker/Drop, expliziter Start und nichtmodaler Status. Verlauf zeigt höchstens
   20 Läufe mit exakt gebundenen Öffnungs-/Zuordnungs-/Fortsetzungsaktionen.
   Ergebnisse und Zuordnung werden gemeinsam fertig; keine automatische Navigation.

**Gate:** versionneues UAT-Kit, beobachtete UX-/Accessibility-Abnahme und aktuelle
Claude-/Cowork-Hostevidenz.

## R5 – Content- und Formatfreigaben

1. TXT/Markdown/CSV/DOCX sind der aktive Anonymisierungseingang beider Produkte;
   Standalone verarbeitet DOCX gemäß DS-090 Markdown-first; Cowork verarbeitet
   DOCX weiterhin direkt und XLSX/PPTX gemäß DS-093 Markdown-first;
   aktuelle reale Erzeuger- und Zielhostabnahmen bleiben getrennte Gates.
2. Die reine Standalone-Konvertierung verarbeitet außerdem XLSX, PPTX, PDF,
   Scan-PDF und PNG/JPEG/BMP. Ihr belegter Extraktionsumfang und konkrete
   Auslassungen sind in der Formatmatrix ausgewiesen; sie behauptet weder
   vollständiges Layout noch Anonymisierung.
3. Eine spätere Anonymisierungsfreigabe dieser zusätzlichen Formate braucht
   eigene Risiko-, Struktur-, OCR-, Residual- und visuelle Coverage-Nachweise.
4. Passwortgeschützte/verschlüsselte Eingaben bleiben gestoppt und werden lokal
   gesondert gemeldet; kein Umgehungsweg.

**Gate:** jede neue Freigabe ist produkt-, zweck- und zielhostgebunden und benötigt
Parser-, Differential-, adversariale, Security-, Fach- und Zielhostevidenz.
MarkItDown/Python bleibt ein optionales Differentialorakel; produktiv arbeiten
die gebündelten Node-/OOXML-/PDF-/OCR-Komponenten. Eine Endung allein genügt nie.

## R6 – Performance erst nach Sicherheit

1. Heute verarbeitet der Batchrunner Positionen seriell; Veröffentlichung und
   deterministische Reihenfolge bleiben fest.
2. Adaptive parallele Vorbereitung bleibt ein noch nicht aktiviertes Ziel und
   darf erst nach Nachweis innerhalb der RAM-/Slot-/Bytebudgets laufen.
3. Kalt/Warm, 1/10/100, CPU, Peak-RAM, p50/p95 und Gesamtzeit messen.
4. Aktivierung erst nach Crash-/Abbruch-/Dateisystem- und Referenzhardwaretests.

**Gate:** kein Sicherheitstest wird zugunsten eines Benchmarks gelockert; ein
unvollständiger Lauf zählt nicht als Performanceergebnis.

## R7 – Release und menschliche Freigabe

Reihenfolge: E0-Gates → Fresh Install Windows/macOS → Cowork/UAT → IT/Health-IT →
Datenschutz/Security/Architektur → Pilotentscheidung. MCPB-Evidenz ist optionales
Engineering-Wissen und weder Anwenderweg noch Produktfreigabe.
