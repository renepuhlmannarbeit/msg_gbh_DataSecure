# RC167 – vertrauliche Zuordnungen im Ergebnisordner

Status: beauftragter gemeinsamer Windows-x64-/macOS-ARM64-/Intel-Teststand;
noch kein Paket-/Releaseabschluss. RC166 bleibt unverändert. Nutzer bedient
den Desktop selbst; keine Desktopautomation und keine geplante Aufgabe.

## Umfang und Sollvertrag

Neue Anonymisierungsergebnisse enthalten zwingend:

- `Vertraulich/Dateizuordnung.csv`: originale Pfade und tatsächliche Ergebnisnamen.
- `Vertraulich/Personen-Pseudonym-Zuordnung.txt`: ursprüngliche Identitäten und
  ihre belegten Pseudonyme aus dem semantischen Transformationsnachweis.

Nach erforderlichen OCR-/Fundstellenprüfungen reicht Ergebnisordner öffnen.
Keine zusätzliche Dokumentfreigabe, Exportauswahl oder Bestätigung. Optionale
Nachbearbeitung erzeugt einen vollständigen neuen Stand mit beiden zu genau
diesen Revisionen und Namen passenden Zuordnungen. Alte `/1`-Ergebnisordner und
alle früheren Stände bleiben unverändert; keine Reparatur oder Adoption beim
Lesen. Reine Markdown-Konvertierung bleibt unverändert.

**Nur gewünschte Markdown-Dateien weitergeben. Vertraulich enthält Originalnamen
und Reidentifikationsdaten und ist nicht zur allgemeinen Weitergabe bestimmt.**

Technische Objekt-/Eltern-/Hash-/Revisions-/Budget-/Guardprüfungen bleiben
erhalten. Keine Developer-ID/Notarisierung, keine Abschaltung von Gatekeeper,
Hardened Runtime oder Core-Library-Validation. Bestehende geprüfte eigene
statische Mac-Cores unverändert; kein neuer Coreproducer nötig.

## Bereits gezielt nachgewiesen

[Quellfix und ehrliche Primär-/Gegenbelege](RC166_RESULT_COMPANIONS_FIX_20261019.md):
16Companion-,65Generationen-,65Async-Assertions; Windows265Rusttests bestanden,
3ignoriert/Clippy sowie echter Produktions-Node→Rust-Pfad beider Betriebsarten.
Unabhängige Erstwriter-/Store-/Rust-/Async-/Testorakel-Gegenreviews abgeschlossen.
Diese Nachweise stammen vor dem neuen Versionsfreeze; keine alte Evidenz wird
auf den neuen Appcommit oder neue Paketbytes umetikettiert.

## Neue Endgates vor Veröffentlichung

1. Gemeinsamer RC167-Appcommit und Produktfingerprint, Version-/Dokumentencheck.
2. Neue unveränderte vollständige Headless- plus Zusatzregression.
3. Neues Windows Prepare/Clippy/Rust/Release und fünf echte Paketgates samt
   unverändertem synthetischem100Dateien-Korpus und Archiv-/EXE-Bindung.
4. Beide echte Mac-Consumer auf genau demselben Appcommit: Source-/Native-/Rust-,
   Guard-/Worker-/IPC-/App-/Konverter-/ZIP-/DMG-Gates einschließlich neuer
   Companion-/Generationen- und nativer Zwei-Dateien-Transaktionen.
5. Tatsächliche Artefakte und Logs unabhängig gegengeprüft; lokales Windows-ZIP,
   aktuelle Testpläne und synthetische Testdaten. Neuer GitHub-Test-Pre-Release;
   Tagquelle, Inventar, Pre-Releaseflag und frisch heruntergeladene Hashes prüfen.

Windows-Desktopfälle führt der Nutzer aus. Physischer M2-/Finder-/TCC-/Enterprise-/
VoiceOver-/macOS26-Test bleibt getrennt; CI und Quellenmodelle ersetzen ihn nicht.
Kein 100-Prozent-Lauffähigkeits- oder Produktionsfreigabeversprechen.

Neue create-only Belege: `dist/rc167-result-companions-source01-20261020`.
Kein Kopieren früherer FINALs, GUI-Proofs oder alter ZIPs als neuen Nachweis.

## Erster nativer Mac-Gegenlauf

Appcommit `030ffe5b1b0762a6c97590ca555d7d7e9216098d`, Fingerprint
`734b9bcb4da56bc7d50d69366b5d5328cc0d429f1e8bd295c12972605308dd36`/334.
Run39331968008: ARM118332154655 scheiterte im echten Darwin-Generationenfall
mit67PASS/1FAIL an einer alten Testannahme: Abschlussbeleg pauschal nur2Dateien,
tatsächlich korrekt2MD plus2Pflichtbegleitdateien. Nachfolgende neue Companion-
Fälle desselben Tests bestanden. Keine Produkt-/Corecrashdiagnose daraus.
Intel118332154688 wurde nach diesem belegten ungeeigneten gemeinsamen Teststand
gezielt abgebrochen, nicht als eigener PASS/FAIL ausgegeben. Beide Jobs beendet;
keine lokalen neuen Gesamt-/Build-Freezejobs liefen während der Korrektur.

Enger Testfix verlangt nun exakte MD-Namen plus genau die zwei festen Rollen,
ihre tatsächlichen Hashes und gebundenen vertraulichen Ordner; `.DS_Store` wird
weiterhin nicht kopiert, gezählt oder belegt. Dasselbe neue Orakel wird auch
im tatsächlichen Windows-Anonymisierungsfall aufgerufen. Kein Produktionsdelta
oder gelockerter Inventarvertrag. Neue Quellgegenprüfung und frische gemeinsame
Build-/Regressionsbelege unter Source02 erforderlich; Source01 bleibt historisch.
Unabhängiger Quellengegenreview korrigierte außerdem vor dem nächsten Freeze
die neue Testnamensannahme: reine Konvertierung dieser Fixture heißt
`Quelle-1.md`/`Quelle-2.md`, nicht neutral `Dokument_01.md`/`Dokument_02.md`.
Die beiden Betriebsarten rufen das exakte Receiptorakel jetzt auch außerhalb
des Darwinzweigs auf. Der erste Windows-65erLauf mit bereits korrektem
Anonymisierungsorakel war grün; die nächste Gesamtregression muss zusätzlich
die neue Markdown-Aufrufstelle und beide neuen echten Mac-Läufe nachweisen.

## Source02 – fehlende gemeinsame Projektionsabhängigkeit

Appcommit `b5c30eb9a69eca910f717b06658bd85649a467e2`, gleicher Produktfingerprint.
Headless mit unveränderten570Test-/Scriptinputs beendet:8/284+0/10, ROT in
`test-core-contracts.mjs`. ARM118335366069 in39332942087 bestätigt denselben
Fehler: `PRODUCT_MODULE_DEPENDENCY_MISSING` für den neuen statischen Import
`gateway/result-export.js -> standalone/result-companions.js`.
Die Standalone-Projektion selbst schließt relative Imports bereits automatisch;
die explizite gemeinsame Cowork-Leafliste enthielt das neue inerte Modul nicht.
Intel118335366180 nach bestätigtem gemeinsamen Blocker gezielt abgebrochen.
Windows Prepare/Clippy/265Rusttests(3ignoriert)/Release regulär beendet,
unveränderte Inputs, kein Paket gebaut. Alle Jobs beendet vor Quelländerung.

Minimaler Fix: exakt ein inertes festes Rollen-/Hash-/CSV-Modul zur geschlossenen
gemeinsamen Liste aufnehmen; keine Wildcard, Closureausnahme oder neue Cowork-
Aktion/Schreibbefugnis. Tatsächliche Quellenanalyse bestätigt keine I/O- oder
Registrierungsaktion beim Import; bestehende Mappingabhängigkeit war bereits
Teil des gemeinsamen Exporters. Explizite Laufzeitliste ergänzt; beide echten
Projektionen müssen exakte Modulbytes enthalten und bei Entfernen genau dieses
Leafs scheitern. Vorschlag unabhängig gegengelesen; Source03 benötigt nach dem
engen Fix neue gemeinsame Commit-/Regressions-/Plattformbelege. Source02 bleibt
als fehlgeschlagen dokumentiert; seine Nativebelege ersetzen Source03 nicht.

## Source03 – tatsächliche Archivprüfung vor Übergabe

Appcommit `a80dcf8a32c69254ca8774ee77f54756dffba7e1`, gleicher Fingerprint.
Windows Native265Rust(3ignoriert)/Clippy/Release und alle5Paketgates bestanden,
100/100Dateien, Originale und sämtliche570Inputs unverändert. ZIP112382120Bytes,
SHA256 `104e5e6bf83cff15397d1695c9cb4cb2470bb0050068b1908f1298a98a6fa2a1`;
EXE `5d69996f33d44e5724d224bbe06aee92c37264b8b87b47f432643203dcea7c25`.
Unabhängiger tatsächlicher Archivgegenreview bestätigt alle1150Einträge,231
gemeinsame Serverdateien und eingebetteten Commit/FP, findet aber einen P2-
Anleitungswiderspruch: Ein späterer Absatz sagt weiterhin, neue Ergebnisordner
enthielten keine Zuordnungen. Vollständiges Lesen beider Guides zeigt denselben
Alttext und einen veralteten zweiten Freigabe-/Export-Prüfschritt auch auf Mac.

Keine bloße nachträgliche ZIP-Textänderung: Guides gehören zum Produktfingerprint.
Der eigene Headless-Prozessbaum wurde nach59fertigenDateien während Datei60
gezielt beendet, keine erfolgreiche HEADLESS-FINAL erzeugt; synthetische
Zwischenstände erhalten. Eigener gebundener DriverPID46648 und sein Prozessbaum
beendet, Nutzer-App nicht bedient/beendet. Beide Macjobs39333563395 gezielt
abgebrochen, nicht als native App-/Paket-PASS ausgegeben. Alle Jobs vor Änderung
beendet. Source03 bleibt ungeeignet für Übergabe; seine grünen Teilgates sind
keine spätere Source04-Abnahme.

Enge Anleitungsbereinigung beschreibt beide Pflichtdateien in Erst-/Korrektur-
ständen und die vertrauliche Weitergabegrenze konsistent. Historische optionale
Zuordnungsaktionen werden ausdrücklich auf alte Läufe begrenzt. Mac-Zielhostplan
folgt dem bereits implementierten Direktablauf; historische RC161-M2-Gegenbelege
bleiben als historisch gekennzeichnet. Tatsächliche Standardrunner ARM14/Intel15
von optionalem26Profil getrennt. Neuer vollständiger Guide-Gegenfall lehnt die
alten widersprüchlichen Absätze auch bei korrekter Einleitung ab. Keine neue
Fach-/Autorisierungs-/OS-Schutzänderung, aber neuer gemeinsamer Freeze nötig.
Der vollständige Bediengegenreview fand zusätzlich drei veraltete Button-/
Schrittnamen. Beide Guides nennen nun tatsächliche OCR-Option, Phase2 und
„Auf Auswahl anwenden“ sowie den dynamisch gezählten Speichern-/OCR-Knopf.
Der Dokumentvertrag übernimmt diese Texte aus dem tatsächlichen UI-Markup
und verweigert auch die alten Beschriftungen in späteren Absätzen. Apples
offizielle Erstöffnungs- und Ordnerzugriffshinweise separat nachgelesen und
im Mac-Guide verlinkt; keine neue OS-Rechte- oder Sicherheitsanforderung.

Finaler unabhängiger Gegenreview der vier tatsächlichen Änderungen ohne
bestätigten Restbefund. Guidepins Windows `9178c3cd115eb8af060a4f66e3ab92718e2b5803cdae332d7669285c4e38b8c8`,
Mac `084a568727263fd4e237bcd839847a8921e2032f4fcaf4c61af0381bd694f04f`;
Dokumentvertrag `0fc6dac7e1f53cbb7565d49a64af8f393539fccc27c5d6552052b91ae9daeb6a`.
Aktueller Dokumentvertrag30/30 bestanden. Source04 muss neue unveränderte
Endgates nachweisen; keine Übernahme der historischen Teil-PASS aus Source03.
