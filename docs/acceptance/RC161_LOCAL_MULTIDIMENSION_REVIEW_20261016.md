# Lokale Mehrperspektiven-Nachprüfung nach RC161

Stand: 16.10.2026. Dieser Quellstand ist **nicht** Bestandteil des veröffentlichten RC161 und noch kein neues Testpaket.

## Geprüfte Grenzen

- Bedienung: Wechsel zwischen Läufen bei unterbrochener Verbindung und ungespeichertem Dokumententwurf; Abschluss ohne Ergebnisdateien.
- Fachlogik: unveränderte OCR-/Freigabe-/Revisionsentscheidung, kanonischer Originaltext älterer Prüfstände und vertrauliche Identitätsübersicht.
- Technik: Export-Transaktion und Journalzugriffe, Ergebnisordner auf anderem Volume, Startup-Retention, explizite Ergebnis-Nachholung und inhaltsfreie Diagnose.
- Plattform: dieselbe Sidecar-/Frontend-Logik auf Windows und macOS; native Volumenprüfung in Rust. Ein Windows-Quelltest ist kein Finder-/Gatekeeper-Test auf dem verwalteten M2.

## Korrigierte Befunde

1. Ein Verbindungswechsel konnte den äußeren Workspace auf einen anderen Lauf stellen, während im Dokumentprüfstand noch ein ungespeicherter Entwurf des alten Laufs lag. Der Wechsel wird nun vor jeder Änderung der Laufbindung abgefangen und mit einer verständlichen Aufforderung zum Sichern oder Verwerfen abgelehnt. Ein Test prüft diesen Übergang ausdrücklich.
2. `completed_without_results` wurde in der Schrittanzeige wie ein unterbrochener Lauf behandelt. Die neue terminale Meldung trennt technische Beendigung, fehlende Ergebnisdateien und nicht erfolgte Freigabe/Export. Sie startet nichts neu.
3. Bei älteren Prüfständen mit vollständigem Transformationsnachweis konnte die Stückzahl des Originalvergleichs zu klein sein, weil sie aus dem kurzen Extraktionsfeld statt aus dem tatsächlich angezeigten kanonischen Text berechnet wurde. Stückzahl und ausgelieferte Abschnitte verwenden jetzt dieselbe Quelle; ein Test rekonstruiert beide Texte vollständig.
4. Die Exportvorbereitung las dieselbe validierte Entscheidungskette für Dateiplan, Identitätsübersicht und Kopie mehrfach von der Platte. Innerhalb derselben bestehenden Sperre wird sie nun einmal gelesen und an diese Prüfungen weitergereicht. Revisions-, Hash-, Identitäts- und Freigabeprüfungen bleiben erhalten. Ein Test zählt die Journal-Auflistungen.
5. Ein Ergebnisordner auf einem anderen Volume konnte zunächst angenommen und erst bei der atomaren Veröffentlichung abgelehnt werden. Die Rust-Konfiguration verweigert ihn jetzt mit festem Fehlercode vor dem privaten Exportvorgang; bestehende Unterordner-Mountpoints werden ebenfalls geprüft. Die Anwendung erklärt den nötigen Ordnerwechsel. Es gibt keine automatische unsichere Kopier-Fallback-Transaktion.
6. Der sicherheitsrelevante Startup-Abgleich vor Retention bleibt synchron. Hinzugekommen sind inhaltsfreie Zähl- und Laufzeit-Phasen für Sicherung und Produktinitialisierung sowie Dauer und Kennzeichnung einer ausdrücklich angeforderten Ergebnis-Nachholung. Diagnosefehler verändern die Produkttransaktion nicht.

## Bewusste Nicht-Änderungen und offene Gates

- Die Anzeige bleibt bei 20 jüngsten Läufen. Fünf Zeilen würden die vorgeschaltete Sicherung nicht ersetzen. Der explizite Recovery-Schritt wird nicht blind in den Hintergrund verlagert: Eine Antwort nach Ablauf des IPC-Fensters könnte sonst weiterarbeiten, während der Anwender die Operation für gescheitert hält.
- Die 300-Sekunden-Grenze für einen ausdrücklich angestoßenen langen Vorgang und die bisherige atomare Veröffentlichung bleiben bestehen. Ob die Journal-Optimierung die beobachteten 115-Dateien-Laufzeiten ausreichend senkt, verlangt eine **neue** Messung mit synthetischen Daten und den neuen Phasenlogs.
- Ein sicherer Abbruch nach bereits teilweise geschriebenem Export, ein langsames oder entferntes Zielvolume, Absturzzeitpunkte am ersten/mittleren/letzten Dokument und der verwaltete M2-Finder-Weg bleiben separate Abnahmen. Aus Quelltests folgt keine universelle OCR- oder Anonymitätsgarantie.
- Die macOS-Testpakete sind ad hoc signierte Engineering-Piloten. Für eine reguläre Verteilung mit Apple-Notarisierung sind korrekte Bundle-Platzierung ausführbaren Codes, Developer-ID-Signierung und Hardened Runtime erforderlich. Vor einem neuen Mac-Release müssen Bundle-Struktur, Signatur und Zielhost-Verhalten gesondert geprüft werden.

## Referenzen

- [Rust: `rename` kann über Mountpoints scheitern](https://doc.rust-lang.org/std/fs/fn.rename.html)
- [Apple: Inhalte korrekt im macOS-Bundle platzieren](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle)
- [Apple: macOS-Software notarisieren](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

Testbelege und verbleibende Gates werden nach Abschluss der laufenden lokalen Quellsuite ergänzt.
