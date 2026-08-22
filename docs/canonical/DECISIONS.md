# Verbindliches Entscheidungsregister

Stand: 22.08.2026 · Status aller folgenden Entscheidungen: **angenommen**

Diese Entscheidungen stammen aus dem abgeschlossenen Produkt-Grill. Sie beschreiben
das Zielprodukt, nicht den Funktionsumfang von RC30.

## DS-001 – Produktzweck und Aussagegrenze

DataSecure bereitet sensible Dateien lokal vor der KI-Verarbeitung auf. Es entfernt
erkannte Identifikatoren und liefert datenschutzreduzierte beziehungsweise
pseudonymisierte Inhalte. Es behauptet weder rechtssichere Anonymität noch eine
DSGVO-, AI-Act- oder sonstige Zertifizierung.

## DS-002 – Primäres Produkt und Verteilungswege

Das Claude-Plugin ist das Hauptprodukt. Direkter ZIP-Import und privater
Organisations-Marketplace sind gleichwertig unterstützte Verteilungswege. Das MCPB
bleibt technischer Fallback und Engineering-Artefakt.

## DS-003 – Unterstützte Claude-Oberflächen

Lokale Originalverarbeitung ist nur in Claude Desktop oder Claude Code zulässig,
wenn `privacy_status` in der konkreten Unterhaltung erfolgreich verfügbar ist.
Cowork Desktop ist damit versionsabhängig möglich. Web und Mobil dürfen nur bereits
bereinigte Ergebnisse verwenden oder den Schutz erklären.

## DS-004 – Plattformziel und Installation

Windows, macOS und Linux erhalten denselben normalen Benutzerablauf. Anwender
installieren Node, Python, OCR-Modelle oder andere Laufzeiten nicht manuell. Nach
außen existiert ein Plugin; intern dürfen betriebssystemspezifische Komponenten und
Pakete verwendet werden.

## DS-005 – Genau zwei sichtbare Skills

Sichtbar bleiben `gbh-datasecure-dokument-anonymisieren` und
`gbh-datasecure-datenschutz-erklaeren`. Dokumentarten erhalten keine eigenen Skills.

## DS-006 – Zwei gleichwertige Starts

Natürliche Sprache und direkte Skillauswahl starten denselben Ablauf. Originale
werden lokal ausgewählt und niemals als erforderlicher Chat-Upload angefordert.

## DS-007 – Verbindliche Zielformate

Das Zielprodukt unterstützt TXT, Markdown, DOCX, PDF einschließlich Scan-PDF,
XLSX, PPTX, CSV, PNG, JPEG und BMP. Ein Format gilt erst als unterstützt, wenn seine
vollständige Coverage und sein sicherer Fehlerpfad abgenommen sind.

## DS-008 – Einheitliches Ausgabeformat

Für jede Eingabedatei entsteht ein separates Markdown-Ergebnis. Tabellen, Seiten,
Folien, Notizen und andere fachlich relevante Strukturen werden darin nachvollziehbar
abgebildet. Eine originalgetreue Rekonstruktion der Quelldatei ist kein Ziel.

## DS-009 – Bilder und visueller Inhalt

Bildpixel gelangen nicht an Claude. Lokaler OCR-Text durchläuft dieselbe
De-Identifizierung und darf danach in Markdown erscheinen. Fotos, Logos und
dekorative Grafiken entfallen; nicht vollständig textuell übertragbare fachliche
Grafiken werden im gebündelten lokalen Abschlussdialog kenntlich gemacht.

## DS-010 – Stapelgrenzen

Ein Stapel umfasst höchstens 100 Dateien und 500 MB Gesamtdaten. Es gibt keine feste
Grenze für Seiten, Folien oder Tabellenblätter. Interne Ressourcen-, Entpack-,
Verschachtelungs- und Laufzeitschranken bleiben erforderlich.

## DS-011 – Automatische Dokumenttypwahl

Profile und Dokumenttypen werden pro Datei intern erkannt. Gemischte Stapel sind der
Normalfall. Eine manuelle Profilwahl ist höchstens eine Support-/Expertenfunktion.

## DS-012 – Kontextbezogener Inhaltserhalt

Nur identifizierende Vorkommen werden entfernt. Rollen, Methoden, Technologien,
Fachbegriffe, Qualifikationen und Zertifizierungen bleiben erhalten. Ein
Zertifikatsaussteller bleibt im eindeutigen Zertifizierungskontext erhalten, wird als
Arbeitgeber, Kunde oder Vertragspartner jedoch anonymisiert. Kataloge unterstützen,
entscheiden aber nie allein.

## DS-013 – Ein gebündelter Abschlussdialog

Der Stapel wird ohne Zwischenfragen vollständig abgearbeitet. Mehrdeutigkeiten und
fachlich nicht vollständig übertragbare Bereiche erscheinen danach in genau einem
lokalen Dialog. Entscheidungen gelten fundstellenbezogen; gleichartige Stellen im
aktuellen Stapel können bewusst gemeinsam behandelt werden.

## DS-014 – Später entscheiden

Eine Entscheidung darf mit deutlichem Hinweis vertagt werden. Die betroffene Datei
wird nicht freigegeben, bleibt aber fortsetzbar. Vertagen bedeutet nie, ungeprüfte
Inhalte an Claude zu senden.

## DS-015 – Technisch unlesbare Inhalte

Eine absolute Freigabegarantie für beschädigte oder technisch unlesbare Dateien ist
unzulässig. Der übrige Stapel wird beendet; offene Dateien bleiben lokal mit einer
konkreten Handlungsanweisung. Teilinhalte einer ungeklärten Datei werden nicht als
vollständiges Ergebnis ausgegeben.

## DS-016 – Passwortgeschützte Dateien

Passwörter werden ausschließlich in einem lokalen Dialog abgefragt, nur im
Arbeitsspeicher gehalten und weder gespeichert noch an Claude oder Diagnoseausgaben
übertragen.

## DS-017 – Eingebettete und aktive Inhalte

Unterstützte eingebettete Dokumente werden mit festen Rekursions- und
Ressourcengrenzen verarbeitet. Makros, Skripte, Programme und externe Inhalte werden
nie ausgeführt oder nachgeladen. Statischer Inhalt wird geprüft; Unklarheiten gehen
in den Abschlussdialog.

## DS-018 – Netzwerkfreier Verarbeitungskern

Parser, OCR, Erkennung, Review und Paketbildung arbeiten ohne Netzwerkzugriff.
Modelle und Kataloge werden nur als Bestandteil einer geprüften Plugin-Version
aktualisiert. Ein größeres Installationspaket wird dafür akzeptiert.

## DS-019 – Stapelweite flüchtige Pseudonyme

Identische Personen und Organisationen erhalten innerhalb eines Stapels konsistente
Platzhalter. Die Zuordnung wird nicht stapelübergreifend verwendet und nach Abschluss
aus dem Arbeitsspeicher entfernt.

## DS-020 – Originale und Arbeitskopien

Originaldateien bleiben unverändert am ursprünglichen Ort. DataSecure verarbeitet
private Arbeitskopien. Nach Erfolg werden sie sofort gelöscht; offene Arbeitskopien
eines abgebrochenen oder pausierten Auftrags dürfen für die Fortsetzung höchstens
14 Tage lokal bleiben.

## DS-021 – Fortsetzung statt Neustart

Erfolgreiche Dateien und Ergebnisse werden nach Fehler, Abbruch oder Programmneustart
nicht erneut verarbeitet. DataSecure bietet die Fortsetzung an der letzten sicheren
Position an.

## DS-022 – Nur ein aktiver Stapel

Pro Benutzer verarbeitet DataSecure höchstens einen aktiven Stapel. Mehrere pausierte
Aufträge dürfen gespeichert sein.

## DS-023 – Exportordner und dauerhafte Ergebnisse

Beim ersten Lauf wird ein lokaler Standard-Exportordner gewählt und später vor dem
Start angezeigt beziehungsweise änderbar gemacht. Exportierte Markdown-Ergebnisse,
Mapping und Nachweis bleiben dort dauerhaft, bis der Anwender sie löscht.

## DS-024 – Neutrale Namen und lokales Mapping

Ergebnisdateien erhalten neutrale Namen. Zusätzlich wird dauerhaft eine UTF-8-CSV
mit `Originaldatei;Ergebnisdatei;Status;Hinweis` exportiert. Sie enthält den
Originaldateinamen, aber keinen Quellpfad, und ist niemals für Claude oder MCP-Lesetools
zugänglich.

## DS-025 – Datensparsamer Verarbeitungsnachweis

Pro Stapel wird ein JSON-Nachweis mit Versionen, Zeitpunkt, Zählern, Regelstand und
inhaltsfreien Status-/Fehlercodes exportiert. Er enthält keine Originalnamen, Pfade,
Rohwerte, Inhalte oder Pseudonymzuordnungen.

## DS-026 – Diagnosemodell

Ein Diagnosepaket wird nur auf Wunsch lokal erzeugt und nie automatisch versandt. Es
enthält technische Versionen, Plattform, Phasen, Zähler, Laufzeiten, feste Fehlercodes
und Prüfsummen von Programmdateien, aber keine Dokumentkennzeichen oder Inhalte.

## DS-027 – Freiwillige Vorschau und automatische Freigabe

Eindeutig geprüfte Dateien werden ohne Pflichtlektüre freigegeben. Eine lokale
Gesamtvorschau ist freiwillig und optional. Nur echte Mehrdeutigkeiten benötigen eine
Entscheidung.

## DS-028 – Einfache und barrierearme Oberfläche

Der Normalweg zeigt Dateien auswählen, Fortschritt, gegebenenfalls Entscheidungen und
Ergebnis. Technische Begriffe bleiben unter Details. Die Oberfläche ist per Tastatur,
mit Skalierung und Screenreader bedienbar.

## DS-029 – Zentral gepflegte Regeln

Normale Anwender ändern keine Erkennungsgrenzen, Profile oder Fachkataloge. Diese sind
versioniert und Bestandteil eines geprüften Releases. Einstellbar bleiben
Exportordner, optionale Vorschau und ausdrücklich gewünschte Bildentfernung.

## DS-030 – Keine Signierungs- oder Zertifizierungspflicht

Codesignatur, Notarisierung und Produktzertifizierung sind keine Freigabevoraussetzung.
Das Produkt darf entsprechende Vertrauensaussagen nicht machen. Tests, SBOM und
Prüfsummen belegen technische Konsistenz, nicht Herstelleridentität.

## DS-031 – Update und Rückrolle

Jede verteilte Version besitzt eine höhere Versionsnummer und ein archiviertes
Vorgängerartefakt. Vor Verteilung laufen Tests und Artefaktprüfungen. Bei Problemen
wird die letzte funktionierende Marketplace-Version beziehungsweise ZIP erneut
bereitgestellt.

## DS-032 – Terminologie

„Anonymisieren“ bleibt der verständliche Aktionsname. Installation, Dokumentation und
Ergebnis erklären dauerhaft, dass erkannte Identifikatoren entfernt werden, das
Ergebnis aber datenschutzreduziert beziehungsweise pseudonymisiert und nicht
garantiert rechtlich anonym ist.

## DS-033 – Qualitäts- und Freigabeschwelle

Vor einem Echtdatenpilot müssen mindestens 1.000 vollständig synthetische Dokumente
über alle Zielformate und Dokumenttypen bestehen, ohne übersehenen direkten
Identifikator in der verpflichtenden Suite und mit mindestens 99 Prozent Erhalt der
markierten fachlichen Inhalte. Jeder Defekt wird dauerhaft zum Regressionstest.

## DS-034 – Gemeinsame Plattformfreigabe

Eine Version heißt erst plattformübergreifend freigegeben, wenn ZIP und Marketplace
auf Windows, macOS und Linux frisch installiert und der vollständige Benutzerweg,
alle Formate, Fortsetzung und Exporte abgenommen wurden. Vorher sind einzelne
Plattformen höchstens Engineering-Vorschauen.

## DS-035 – Evolution statt Rewrite

RC30 bleibt getestete Ausgangsbasis. Auftragsmodell, Plattformadapter, Parser, OCR,
Review und Tests werden schrittweise ersetzt oder erweitert. Ein Total-Rewrite ist
nicht vorgesehen.

## DS-036 – Fortschritt und sicherer Abbruch

Der lokale Fortschritt zeigt Position, Phase, Zähler und nur belastbare Restzeiten.
Ein Abbruch ist sicher, hinterlässt einen fortsetzbaren Auftrag und veröffentlicht
keine ungeklärte Datei.

## DS-037 – OCR-Sprachen

Deutsch und Englisch sind die verbindlichen OCR-Sprachen des ersten vollständigen
Releases, einschließlich gemischtsprachiger Dokumente. Die Entitätserkennung bleibt
zusätzlich für relevante lateinische, griechische, kyrillische und häufige
CJK-Namensschreibweisen ausgelegt. Weitere OCR-Sprachpakete können versioniert folgen.
