# RC175 – chartEx als gespeichertes semantisches Diagrammmodell

## Auftrag und Grenzen

24.10.2026 ausdrücklich beauftragt: chartEx für Windows x64, macOS ARM64 und
Intel ergänzen, technische Schutzprüfungen beibehalten, mit unabhängigen
Fachreviews revalidieren und frisch testen. Danach gemeinsamer neuer RC175-
Test-Pre-Release; Windows zusätzlich lokal mit Testplan. Desktoptests durch
den Nutzer (USER_PENDING), kein agentischer GUI-PASS. Keine Mainintegration.
RC174/ältere Pakete, Nutzerläufe, Originale und sämtliche Evidenzen bleiben.

Der eigene JavaScriptleser braucht keine Officeinstallation, neue Renderer,
Cloud, Developer-ID oder Notarisierung. Bereits geprüfte statische Maccores
bleiben unverändert; kein Applekonto/Schlüssel-/Zertifikatssuchen, keine
OS-/Rechte-/Schutzänderung. Adhoc-Sealing und tatsächliche native CI bleiben
getrennt von menschlicher Finder/TCC/M2/Enterprise/VoiceOver/Officeabnahme.

## Fachmodell und Quellen

Gepinnte Microsoft-Primärquelle: Open-XML-SDK Commit
`431ab05cf160248cc3885a4a766026d4f8243792`, MIT. Keine Übernahme fremden
Implementierungscodes oder unlizenzierter Beispieldateien; eigener Parser und
aus dem Schema abgeleitete, ausdrücklich synthetische OPC-Gegenfälle.

- [ChartEx Part / exakte Beziehung und MIME](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/5d0d453e-adac-43be-a797-59b9916593dd)
- [Offizielle Typdefinitionen](https://github.com/dotnet/Open-XML-SDK/blob/431ab05cf160248cc3885a4a766026d4f8243792/data/schemas/schemas_microsoft_com_office_drawing_2014_chartex.json)
- [Daten-ID](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/b895f5cf-d6a5-4fc1-b566-7b594b2a4e60)
- [Serien / Layoutbezug](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/86df19ea-8e94-49fc-9160-377c1b40b985)
- [Aktueller ChartSpace einschließlich Dashboardgrenze](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/416e664f-c6f6-4ed9-914b-4eaaa20724dd)

Reale referenzierte Word-Story/Folie/Blatt/Drawing → ausgewählter GraphicFrame
mit cx:chart@r:id → exakt interne chartEx-Beziehung/MIME → chartSpace →
Serie/dataId@val → data@id → Dimension/Ebene/pt@idx. Keine Autorität allein
durch Dateinamen, lokale XMLnamen, benachbarte Titel oder ZIP-/XMLreihenfolge.
Auch SDK extendedCharts/chartN.xml wird berücksichtigt, nicht nur chartExN.xml.

Acht bekannte Layoutkennungen werden mit tatsächlichen gespeicherten Daten
ausgegeben: boxWhisker, clusteredColumn (auch Histogrammparameter), funnel,
paretoLine, regionMap, sunburst, treemap, waterfall. Keine visuelle Geometrie,
Bins, Quartile, kumulierten Summen oder Karten werden neu berechnet. Numerische
Rohwerte und gespeicherte Formate bleiben getrennt; kein geratenes Datumssystem.
Alle gespeicherten Kategorien-/Wert-/X-/Y-/Größen-/Farb-/Geokennungskanäle und
Hierarchieebenen bleiben getrennt und indexgebunden. Keine Auffüllung fehlender
Eltern, Nullwerte oder Formel-/Workbook-/Geodatenauflösung. Wörtliche xsd:string-
Texte bleiben erhalten; Excel-ST_Xstring wird nicht auf chartEx angewandt.

## Umsetzung und Endprüfplan

1. Eigener begrenzter Reader/Renderer; namespace-/owner-/MIME-/MCbindung in
   DOCX/PPTX/XLSX inklusive Chartsheets. Aktive Inhalte bleiben gesperrt,
   externe Quellen ungelesen. Exakt gebundene passive Stile dürfen vorliegen;
   interne chartEx-Arbeitsmappen werden nur im Teilmodus als opake ungelesene
   Abhängigkeit quarantänisiert, nicht automatisch als Blattquelle ausgegeben.
   Andere Einbettungs-/VBA-/OLE-/Template-/Quellfehler behalten ihren Schutzpfad.
2. Tatsächliche sensible Cachelevelnamen/Achsenrollen bleiben echte Feldkontexte
   im bestehenden Privacy-/Residual-/Keep-/Tracepfad. Kein Fake-Personenheader,
   keine generierte Null/Fehltext-Personenzuordnung, keine Engineausnahme.
3. Fehlende/unerreichte/unmodellierte Daten als Teilabdeckung, invalides Modell
   atomar auslassen, sicheren unabhängigen Text erhalten. Bestehende XML/ZIP,
   Objekt-/Prozess-/I/O-/Ressourcen-/Residualgrenzen nicht abschalten.
4. Neuer kanonischer Source-Test und tatsächlicher Macstep; zusätzliche echte
   isolierte Konverterfälle für alle drei Officefamilien/beide Markdownmodi.
5. Begrenzte fremde Primärquellen-/Produktionsquellengegenreviews. Bestätigte
   neue Befunde kausal korrigieren; ältere Grüns widerlegen diese nicht.
6. RC175-Version, gemeinsamer Appcommit/Fingerprint und sieben Driver einfrieren;
   während aller lokalen/Macjobs keine Produkt-/Test-/Script-/HEADänderung.
7. Frische Gesamt-/Rust-/Native-/Konverter-/Paketgates, SourceSnapshot; beide
   Macconsumer am selben Appcommit. Ganze Logs und reale ZIP/DMG-/Core-/
   Konverter-/Arch-/Seal-/Quell-/Hashbindungen unabhängig lesen.
8. Geeignete Belege erlauben lokale create-only Übergabe RC175 und neuen
   GitHub-Test-Pre-Release. Inventar/Hashes/Tagquelle/Prereleaseflag vor und
   nach Publikation tatsächlich prüfen. USER_PENDING bleibt explizit.

## Aktueller Stand / Journal

Entwicklung, noch keine RC175-Endabnahme oder Pakete. Keine aktiven alten
GitHubjobs/Tests beim Start; HEAD8e1f29c ist ausschließlich RC174-Abschlussdocs.
Neue Helfer unter dist/rc175-chartex-source01-20261024 sind vorbereitet, kein
alter FINAL/Commit/GUIbeleg wurde als neu übernommen. Erster neue Testharness-
Pfad-/Markdownescapefehler eng korrigiert, ohne Schutzlockerung. Frühe Quelle
74 neue chartEx-Fälle und unveränderte116 klassische Chartfälle PASS, kein
Ersatz für den späteren eingefrorenen Gesamtlauf. Separater Primärquellenreview
bestätigt zusätzlich SDKzielpfad und xsd:string-Literalität; vor Freeze korrigiert.

Weitere unabhängige tatsächliche Gegenfälle vor Freeze: eine gebundene sensible
Achse ohne Skalierungsrolle konnte Rohwerte unter neutralen Headern belassen;
ein 351-KB-Modell mit4096 langen Cacheheaderspalten konnte vor der Prüfung einen
untypisierten String-RangeError auslösen. Eng korrigiert: reale unaufgelöste
Achsenpflicht konservativ generisch schützen, escaped Fragmente vor jedem Join
budgetieren, Feldklassifikation cachen. Keine Änderungen an Engine/Residual/
Keep/Trace oder Grenzerhöhung. Exakte neue Endpunkt-/Breitengegenfälle nun Teil
der106 gezielten Quelltests; noch kein vollständiger eingefrorener Endnachweis.

Bei chartEx im konventionellen charts/chartN.xml konnten außerdem alte Classic-
PPT-Ausnahmen die neuen partial-only/exakten Stylebedingungen überlagern.
Diese Legacyausnahmen schließen jetzt explizit chartEx-gebundene Owner aus;
normale Classicowner bleiben unverändert. Eigene neue Harness-Mutationsfehler
bei Buffer/XMLumbenennung eng korrigiert, keine Produktprüfungen gelockert.
Vorläufiger eigener Windows-NativeOffice-/MDlauf52Gruppen erfolgreich; während
Entwicklung geänderte Selektoren bedeuten: kein eingefrorener Paketnachweis.
Aktuelle Dokument-/Versionsverträge30/30 und Sync geprüft, kein GUI-PASS.

Zusätzliche Main-Endpunktprobe zeigte vor Freeze einen zweiten sensiblen
Zuordnungsunterfall: derselbe Cache-Datenobjektkanal konnte in einer weiteren
Serie unter neutralem Achsentitel erneut erscheinen. Pflicht wird nun nur über
dieselbe bewiesene Datenobjekt-/Dimensionidentität erhalten, niemals global
über gleiche Textwerte oder benachbarte Daten-IDs. Gezielte reale48Privacy-/
Keepketten und unabhängiger kausaler Gegenreview gehören zur Abschlussprüfung.
Quellumfang zuletzt119Fälle, zusätzlicher NativeOffice-/MDlauf55/55 inklusive
chartEx mit je2OCR-Bildern/Positions- und Kontaktmaskierungsbelegen; ebenfalls
Vorabstand, kein Ersatz für die neuen eingefrorenen gemeinsamen Endgates.

Alle bestätigten neuen Modell-/Integrationsbefunde vor Freeze unabhängig an den
tatsächlichen Korrekturen nachgeprüft: SharedData24Original-/24umgekehrte
Endpunkte, zweiteFundstelleKeepverweigerung und unveränderte Zahlen; vorherige
Nullrollen-/Langheadergegenfälle sowie9Zusatzkontrollen weiterhin korrekt.
Modellpin5b499025cdc520d767b158c4b0e36e25278abcc38bccbc3c1cfa27ebdbe36576,
OPCpin74684cb5f326bdfe7b725ba58f6c950dbec5398b39847eb9d4cc27d419798c1d.
Keine verbleibenden bestätigten Blocker im begrenzten Source-Delta; dies ist
keine Gesamt-/Desktop-/Paketfreigabe. Helfer-/Syntax-/Negativprüfungen sind
getrennte Hilfsnachweise, keine Produktausführung. Nächster Schritt: gemeinsamer
Commit/Freeze und sämtliche neuen tatsächlichen lokalen/Mac-Endgates.

Offen bleiben derzeit vollständige neue Endgates, native Macartefakte, lokale
Übergabe und Veröffentlichung. Unbekannte Dashboards, externe Workbooks,
Statistik-/Georendering und aktive Inhalte sind keine Universalzusage.
