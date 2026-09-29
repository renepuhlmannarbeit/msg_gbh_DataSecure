# DataSecure Security-Modell für das Claude-/Cowork-Plugin

Stand: 11.09.2026 · 3.2.0-rc142

## Vertrauensgrenze

Die Datenschutzgrenze ist der lokale Plugin-MCP. Originale gelangen nur über den
lokalen Betriebssystempicker hinein. Der Modellkontext erhält weder Originalbytes,
-pfade, -dateinamen noch erkannte Rohwerte. Freigegeben wird ausschließlich erneut
verifiziertes Markdown mit kurzlebiger, laufgebundener Leseberechtigung.

Dieses Dokument gilt ausschließlich für das Plugin. Das eigenständige Produkt
hat einen getrennten Vertrag im
[Standalone-Sicherheitsmodell](canonical/STANDALONE_SECURITY_MODEL.md).

Diese Aussage beschreibt den vorgesehenen DataSecure-Werkzeugpfad, nicht eine
technische Sperre aller anderen Claude-Werkzeuge. Der Server attestiert weder
die Hostklasse noch die tatsächliche Herkunft einer Modellbestätigung.
Original-, Privacy- und interne Datenordner dürfen dem Claude-Host nicht als
allgemeine Dateiquelle freigegeben werden. In lokalem Claude Code sind außerdem
Datei-, Shell-, IDE- und weitere Connectorzugriffe getrennt abzusichern;
ein Skilltext allein ist keine Zugriffskontrolle.

**Quellkorrektur PH-20260923-01 / BL-041.19, noch unveröffentlicht:** Eine
gemeinsame kanonische Prüfung sperrt Gleichheit und Verschachtelung zwischen
privaten Workspace-/Daten- und sichtbaren Ergebniswurzeln in beiden
Konfigurationsrichtungen, bei Reset und vor privater Dateianlage. Frühere im
selben Produktdatenraum erfasste Wurzeln bleiben durch begrenzte private
Metadaten reserviert; Reset entfernt diesen Schutz nicht. Ein Rootkonflikt
schreibt auch keine Diagnose in den unsicheren Baum.

Unbekannte Host-Freigaben aus Altversionen oder anderen Datennamespaces sind
nicht rekonstruierbar. Diese Prüfung attestiert keine tatsächlich verbundenen
Claude-Ordner und verschiebt oder löscht keine bestehenden Daten. Die alten
veröffentlichten RC139-Pakete enthalten den neuen Schutz noch nicht.

## Bedrohungen und Kontrollen

| Bedrohung | Kontrolle |
|---|---|
| Chat-Upload oder Cloud-Sitzung – unabhängig von geöffneter Desktop-App oder Brücke | Skill-/Hostgate stoppt und verweist auf eine lokale Cowork-Sitzung mit laufendem Plugin-MCP oder auf Standalone |
| manipulierte Endung/Container | Signatur-, OPC-, CRC-, Relationship- und Strukturprüfung |
| aktive/eingebettete Inhalte | vollständige Coverage oder fail-closed Stopp |
| Prompt Injection im Dokument | Dokumentinhalt ist Daten, keine Werkzeuganweisung |
| direkte Identifikatoren | kontextbezogene Erkennung plus Residual-Gate |
| Überredaktion von Fachbegriffen/Zertifikaten | positionsbezogene Erhaltungsregeln und Korpus |
| Bilder/visuelle Identifikatoren | Pixel bleiben lokal; kein auswählbarer Freigabemodus |
| Crash/Unterbrechung | Journal, atomare Veröffentlichung, Resume ohne Duplikate |
| Pfad-/Link-/Swap-Angriff | lokaler Root, no-link/no-reparse, Identitätsbindung |
| Netzwerkabfluss | netzwerkfreier Verarbeitungskern und Boundarytests |
| Ressourcenerschöpfung | Datei-/Stapel-/CPU-/RAM-/Zeit-/Entpackbudgets |
| unbefugtes Ergebnislesen | paket-/laufgebundene Capability, Paging und Re-Verifikation |

Auch der Supportweg `review_deferred_document_batch` verwendet ausschließlich
den festen, mit `network-deny` gestarteten Review-Worker. Der MCP-Hauptprozess
prüft nur Metadaten und wartet auf das inhaltsfreie Empfangs-ACK. Er rekonstruiert
keinen Review-Rohtext. Noch reparierbare Veröffentlichungs-/Zuordnungszustände
werden im Worker unter der Stapelsperre abgeglichen; erst danach wird erneut
über Reviewbereitschaft entschieden. Ein ACK belegt weder eine sichtbare
Prüfoberfläche noch den Abschluss. Timeout oder Hostabbruch bedeutet eine
unbestätigte Übernahme, nicht den Beweis, dass kein Worker gearbeitet hat.

## Lokale Speicherung

Arbeits- und Reviewkopien sind normale lokale Dateien ohne zusätzliche
Verschlüsselung, Schlüsselbund, Keyfile oder Passwort. Das ist eine bewusste
Produktentscheidung; Betriebssystemrechte und lokaler Geräteschutz sind die
Grenze. Historische verschlüsselte Artefakte werden unangetastet bewahrt.

Ein bereits kompromittierter Prozess desselben Betriebssystembenutzers liegt
außerhalb dieses Vertrauensmodells: Er kann lokale Dateien zwischen einzelnen
Systemaufrufen austauschen. DataSecure bindet Identitäten, prüft Links und stoppt
erkannte Austauschfälle, verspricht ohne nativen CAS-/No-Replace-Mechanismus aber
keine Sicherheit gegen ein absichtlich exakt in das Publikationsfenster gesetztes
Rennen desselben Benutzers.

Automatische Aufbewahrung gilt ausschließlich für eindeutig DataSecure-eigene
temporäre Arbeits-/Reviewdaten und ist auf 0–14 Tage begrenzt. Quellen/Originale
und fertige Outputs, Exporte sowie Mappingdateien werden niemals automatisch
gelöscht. Ein Bereinigungsfehler darf keinen breiteren Löschversuch auslösen.

## Bilder und Formate

TXT, Markdown, CSV und DOCX sind direkt freigegeben. XLSX und PPTX werden lokal
in Markdown extrahiert; ausschließlich dieser Text wird anonymisiert und seine
Quellenabdeckung separat ausgewiesen. PDF, Scan-PDF und eigenständige Bilder
bleiben gesperrt. Bildpixel aus DOCX/XLSX/PPTX bleiben lokal. Ein
interner Legacy-Parameter darf den festen sicheren Bildschutz nicht herabsetzen
und ist keine Nutzeroption.

Passwortgeschützte oder verschlüsselte Quellen werden weder kopiert noch
entschlüsselt; der Reststapel läuft weiter.

## Grenzen

De-Identifizierung ist keine garantierte rechtliche Anonymität. Quasi-
Identifikatoren können Re-Identifikation ermöglichen. Das Plugin ersetzt keine
Rechtsgrundlage, Zweckbindung, Datenschutz-Folgenabschätzung, IT-/Security-
Freigabe oder menschliche Fachentscheidung.

## Offene Releaseevidenz

Fresh Install und Hostgate auf Windows/macOS, reale Dateisystem-/Crashgrenzen,
Cowork-Berechtigungen, Accessibility, 200 Dateien/500 MiB sowie Fach-,
Datenschutz-, Security- und Architekturabnahme bleiben erforderlich. Siehe
[`BACKLOG_EVIDENCE_MATRIX.md`](canonical/BACKLOG_EVIDENCE_MATRIX.md).
