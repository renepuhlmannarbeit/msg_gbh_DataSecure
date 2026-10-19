# DataSecure Standalone unter Linux starten

Anleitung für **3.2.0-rc159** und die neue Oberfläche. Das
[RC159-AppImage-ZIP und seine Prüfsumme](https://github.com/renepuhlmannarbeit/msg_gbh_DataSecure/releases/tag/v3.2.0-rc159)
verwenden. Dies ist ein Test-Prerelease; sichtbare Desktop-, Installations- und
Barrierefreiheitsabnahme bleiben gesonderte Nachweise.

Dieses Engineering-Paket ist auf Ubuntu 22.04 für Linux x64 mit glibc 2.35
oder neuer gebaut. Es benötigt weder Claude noch eine zusätzliche Node.js-,
Python- oder Rust-Installation.

1. ZIP und gleichnamige `.zip.sha256`-Datei im selben Ordner ablegen und die
   SHA-256-Prüfsumme vor dem Entpacken mit `sha256sum -c *.zip.sha256` prüfen.
2. ZIP vollständig in einen neuen lokalen Ordner entpacken.
3. Falls das Ausführungsrecht beim Entpacken verloren ging:
   `chmod u+x "DataSecure Standalone.AppImage"`.
4. `DataSecure Standalone.AppImage` öffnen oder im Terminal mit
   `./DataSecure\ Standalone.AppImage` starten.

Das Paket ist ein technischer Kandidat. Die sichtbare menschliche Linux-Abnahme
bleibt vor einer Endnutzerfreigabe offen. Sie umfasst Dateiauswahl,
Drag-and-drop, Ordneröffnung, Barrierefreiheit, Performance und die Installation
auf den unterstützten Linux-Distributionen.

## Verarbeitung und Prüfung in RC159

1. Unter **Neue Verarbeitung** zuerst **Nur umwandeln** oder
   **Umwandeln und anonymisieren** wählen, Dateien/Ordner hinzufügen, gewünschte
   Dateien anhaken und das Ergebnisziel kontrollieren. Die Auswahl allein
   startet nichts. **Verarbeitung starten** beginnt höchstens 200 Dateien /
   500 MB. Die Laufkarte nennt Arbeitsstatus und konkrete Dateiprobleme.
2. **Jetzt prüfen** öffnet die laufgebundene Fundstellenprüfung.
   Checkboxen wählen nur aus; gemeinsame Behandlungen sind zunächst vorgemerkt.
   Erst **Gruppe übergeben und weiter** speichert die vollständige Gruppe.
   Offen-Filter, weitere Seiten und Folgegruppen beachten. Original-/Markdown-
   Vergleich und bei OCR der Originalbildausschnitt gehören zum jeweiligen Punkt.
3. Nach Abschluss der Fundstellen öffnet sich bei Anonymisierung direkt die
   Dokumentprüfung desselben Laufs. Quelle und geplantes Markdown vergleichen,
   gewünschte Dokumente auswählen. Die Maskierungen sind bereits angewendet;
   eine gesonderte Pflichtfreigabe ist nicht nötig.
4. **Auswahl exportieren** zeigt eine lesende Vorschau. Erst **Freigeben und exportieren**
   bestätigt genau diese Textstände und kopiert nur
   freigegebene aktuelle Markdown-Stände in einen normalen separaten Ordner.
   Originale, Identitäts-/Dateizuordnung und private Prüfstände bleiben draußen.
   Den technischen Laufordner nicht pauschal an eine KI weitergeben.
   Vorschau und Abbrechen geben nichts neu frei und kopieren nichts.
   Technische Schutzprüfungen bleiben aktiv; reine Freigabe/Widerruf sind optional.
5. **Später entscheiden**, Pause und Fortsetzen sind an den konkreten Lauf
   gebunden; weitere Eingaben gehören in eine neue Verarbeitung. Der Verlauf
   zeigt höchstens 5 Verarbeitungen. **Prüfung öffnen** öffnet
   bei Anonymisierung die spätere Dokumentprüfung. Verbindungsverlust führt
   nicht zu blinder Wiederholung von Entscheidungen oder Exportbestätigungen.

**Markdown nachkorrigieren** dient bei reiner Umwandlung der nachträglichen
Korrektur. Dieser Markdown-Export erhält Originalinhalte und ist **nicht
anonymisiert**. Technische Verarbeitung ist keine Garantie fehlerfreier
Extraktion: Neun rohe OCR-E-Mail-Abweichungen bleiben im synthetischen
Qualitätskorpus bekannte Warnungen. Namen, Fehlercodes und nächste Schritte
stehen lokal bei den betroffenen Dateien, nicht in Diagnoseprotokollen.
Originale und vertrauliche Identitätszuordnungen werden nicht automatisch gelöscht.
