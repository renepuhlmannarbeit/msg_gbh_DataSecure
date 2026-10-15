# Inhaltsgetreues Markdown und ausdrückliche Bild Texterkennung

Bezug: BL-010.53, Scheiben .2/.4/.5/.6/.7/.8; BL-050.6, DS-085/DS-110.
[Gesamtauftrag](../AUFTRAG-CODEX-RC160-WORKFLOW-INHALT.md),
[Vorlage](VORLAGE.md), [Backlog](../../docs/canonical/BACKLOG.md).

## Ziel aus Nutzersicht

Kollegen verwenden die `.md` direkt mit KI. Gewünscht ist eine nahezu 1:1
Text-/Tabellenkopie, keine Layoutkopie, Zusammenfassung oder vermeintlich
intelligente Inhaltsreduktion. Unicode, Überschriften, Listen, Werte, Tabellen,
Notizen und textliche Bildunterschriften erhalten. Keine Bilder, Data-URLs,
Bildpfade, Grafikplatzhalter oder technischen OCR-Überschriften im Nutztext.
Extraktions-/Unsicherheitsmeldungen bleiben lokal beim Dokument sichtbar.

## Gebundene Optionen für beide Zwecke

Standard-Ausgabeprofil „Nur Text und Tabellen – ohne Bilder und Bildverweise“.
Anwenderentscheidung 14.10.2026: Eine gemeinsame Checkbox „Text aus Scans,
Bildern und Grafiken per OCR lesen“, standardmäßig aus, genügt dauerhaft.
Sie setzt `scanOcr` und `imageOcr` gemeinsam und bindet beide Werte unveränderlich
an den Lauf. OCR-Kontaktprüfung und nachträgliche Markdown-Korrektur bleiben
unabhängige Schritte; kein nachträglicher Inhaltsfilter nach Freigabe.

| Quelle | Checkbox aus | Checkbox an |
|---|---|---|
| PDF mit Textschicht | vorhandener Text, keine Rasterpixel | vorhandener Text und ergänzender OCR-Text ohne belegte Dubletten |
| gescannte PDF | benannter Stopp bei fehlendem Text | lokal erkannter Text; Unsicherheiten in der App |
| gemischte PDF | vorhandener Text, Auslassung in der App | nativer Text plus begrenzte passive Seiten-OCR |
| PNG/JPEG/BMP | benannter Hinweis, kein leerer Scheinerfolg | lokale OCR mit privaten Kontaktbildausschnitten |
| Office | vorhandene Prosa/Tabellen/Beschriftungen | zusätzlich tatsächlich referenzierte PNG/JPEG/BMP-Medien; andere Typen benannter Capabilitystopp |
| Markdown | echte Bildknoten entfernen, Alt-/Titeltext erhalten | zusätzlich eingebettete Rasterdaten; externe/relative Quellen nicht automatisch laden |

Der gemeinsame Schalter verlangt keine unsichere automatische Unterscheidung
zwischen Scan und Grafik. Die zuvor geplante manuelle Bereichsklassifikation
ist für diesen Nutzerweg nicht mehr erforderlich und wird nicht als fehlende
Pflichtfunktion geführt. Der interne geschlossene Vertrag behält seine zwei
Booleans für historische/fachliche Bindungen: Nur eine eingeschaltete Kategorie
bei unklarem PDF-Umfang stoppt weiterhin vor OCR mit `PDF_OCR_SCOPE_REQUIRED`.
Die aktuelle UI erzeugt solche Einzelkombinationen nicht.

OCR-Korrektur → gegebenenfalls Anonymisierung/Entitätsprüfung → finale
Dokumentkorrektur und Freigabe/Export bleiben getrennte autoritative Phasen.
Nachtrag 14.10.2026: Der neue `content-v1`-Anonymisierungsstart ist inzwischen
lokal über App, Rust, private IPC und Worker bis zum separaten KI-Export
verbunden; r19-ZIP-Verifier und paketierter Sidecar-/Worker-Smoke bestehen.
Native Windows-Bedienung und Mac bleiben offen. Die nachstehende Startsperre
ist der historische Zwischenstand, nicht die aktuelle lokale Produktlage.
Neue Nutzeroptionen sind aktuell ausschließlich für reine Konvertierung
aktiviert. Neue Anonymisierungsoptionen bleiben bis ihrem vollständigen
Publikations-/Mappinganschluss gesperrt; Legacy-Anonymisierung bleibt bestehen.

## Technische Umsetzung

Aktueller Raw-Appanschluss 14.10.2026: Workspace, Rust-Requestbody, private IPC,
Dienst und eigener Inhalts-Intake sind verbunden. Der tatsächliche Windows-
Sidecar verarbeitet zwölf synthetische Quellen einschließlich gemeinsamer
Basisnamen und aller angebotenen Formattypen. Mit OCR zwölf Ergebnisse ohne
Dateifehler, ohne OCR acht Ergebnisse und vier konkrete Bild-/Scanstopps.
Exakte menschlich korrigierte Exportbytes mit Originalnamen, Freigabe und
frischer Prozessstart bestanden. Office-OCR liest nur tatsächliche sichtbare
Referenzen, keine orphaned Medien, Kommentare oder CDATA-Scheinreferenzen;
leere Dekoration hebt vorhandenen Text nicht als `OCR_TEXT_EMPTY` auf.
Das exakte Windows-ZIP ist inzwischen gebaut: vollständiger Verifier und
paketgebundener Sidecarflow einschließlich neuer Raw-Kontaktprüfung,
Vertagen/Neustart und exaktem korrigiertem Export bestehen. Frische gesamte
Headless-Regression mit 232 Dateien, 118 Rusttests/Clippy sowie 65 Konverter-
und 26 Office-/MD-Gruppen grün. Paket/SHA-256 siehe CURRENT_STATE. Native
GUI/Mac bleiben separate Abnahmekriterien; neue Anonymisierungsoptionen offen.

Die nachfolgenden chronologischen Teilstände behalten ihre damaligen Nachweise;
frühere Raw-Startsperren und fehlende Office-OCR sind inzwischen ersetzt.

Lokaler Teilstand 14.10.2026: Optionsvalidator, Journal `/7`, unabhängiges
Runmanifest `/3`, Dokumentbasis `/2`, Intake-Intent `/3` und OCR-Korrektur `/3`
sind implementiert; zehn reale Persistenzgruppen und unabhängige Gegenreviews
belegen Neustart, gleiche Textbytes, Downgrade, Retention und HMAC-Bindung.
Gemeinsame Zweckhelfer versorgen die genannten Schema-/Routenübergänge.
Der volle Start-/Rust-/IPC-/Workeranschluss und die tatsächliche Scan-/Bild-
Auswahl fehlen noch; keine neue Nutzeroption wird dadurch bereits aktiviert.
Der direkte isolierte Konverter unterstützt inzwischen den ganzen Vertrag
mit eigenem CLI-Argument sowie Response/Extraction `/2` und geprüftem Options-
Echo. Bild-OCR aus stoppt vor Decoder/Runtime; beide PDF-OCR-Optionen aus lesen
keine Rasterpixel, beide an lesen begrenzt auch Vektor-Grafiktext. Einzelwahl
mit unklarem Umfang liefert vor OCR `PDF_OCR_SCOPE_REQUIRED`; der beschriebene
Bereichsreview ist noch zu implementieren. Office-Bild-OCR liefert bis zu ihrem
echten Anschluss `OFFICE_IMAGE_OCR_UNAVAILABLE`, kein falsches Feature-PASS.
Private PDF-Containerinformationen sind bounded im eigenen geschlossenen
Metadatenvertrag, im Inhaltsprofil nicht mehr Nutztext. Legacy-Artefakte bleiben
auf `/1` beschränkt. Der neue Raw-Verbraucher bindet Extraction `/2`, Artefakt
`/2`, private Dokumentbasis und Export an denselben Optionsvertrag. OCR-Korrektur
erhält den Vertrag und private Metadaten; der eigene Korrekturhinweis erscheint
nur im erläuternden Profil. Containerinformationen bleiben ausschließlich in
der privaten unveränderlichen Basis, nicht in Artefaktmanifest, Liste oder Export.
Zwölf neue Consumergruppen prüfen Capture, Getter, Neustart, Lost-ACK,
Same-text-Optionswechsel, Originalnamen und exakte freigegebene Exportbytes.
Generischer Export `/5` und geprüfte Dokumentoperation `/7` binden Optionen;
Legacy-Downgrade beim Replay ist durch Runanker und eigenständigen unveränderlichen
Exportowner gesperrt, auch wenn der gesamte Dokumentlaufordner fehlt.
Optionsweitergabe in Item-, Kontakt-/Entitäts-Capture, Reviewpublikation,
Delivery, Recovery und Projektion ist verbunden. Der tatsächliche neue
Anonymisierungsablauf und dessen Publikationsbeleg bleiben noch offen; der
gewöhnliche neue anonyme Export stoppt deshalb ausdrücklich vor Planänderung,
statt einen Legacy-Beleg als neue Optionswirkung zu bestätigen.
Der tatsächliche Windows-Konverterlauf mit dem Raw-Anschluss bestand mit
63 Gruppen ohne Skip. Die neue Gruppe führt alle zehn Quelltypen durch
isolierte Konvertierung, private Basis, frisches Lesen, synthetische Freigabe
und Export mit Originalnamen. Der unabhängige Markdown-Renderer prüft sichtbaren
Text auch in literal serialisierten CSV-Zellen. Das ist kein Tauri-/Mac-Nachweis.

Weiterer Inhaltsanschluss am 14.10.2026: Der Privacy-Extraktionsadapter nimmt
den vollständigen Optionsvertrag für alle zehn Quelltypen an und verlangt das
genaue Extraction-`/2`-Echo. Ein neutraler Source-Extraction-Vertrag `/2` bindet
Optionen ohne Zweckfreigabe oder Lesecapability. Der private Carrier prüft
Quelltyp, Text, Coverage, exakte Kontaktpositionen und private PDF-Metadaten.
CSV verwendet die tatsächlichen ersten Feldwerte als Header, ohne Trim,
NFC-Änderung, Duplikatzusätze oder Entfernung leerer Datenrecords. Der neue
DOCX-Eingang erhält sichtbare Kopf-/Fußzeilen; alte Ausschlusspolitik bleibt
Legacy. Acht fokussierte Adaptergruppen und sechs reine Source-Vertragsgruppen
prüfen den Schnitt. Ein unabhängig belegter Office-Header-Gegenfall wurde
zuerst rot reproduziert und korrigiert: eigene literal serialisierte
Whitespacezeichen werden nur für die geschlossene Feldlabelprüfung decodiert,
während die ursprüngliche Headerzeile unverändert bleibt. Direkte reine
Recordvalidatoren normalisieren Reflexionsausnahmen ohne Zugriff auf fremde
Fehlerobjekte; der Produktadapter verweigert Proxies vor Reflexion. Keine
native Runtimeabhängigkeit im reinen Core, keine dortige Zero-Trap-Zusage.

Kontaktkorrektur leitet `complete`/`incomplete` aus den verbleibenden Gründen
ab. Nur die Kontaktwarnung entfällt; sonstige OCR-/Coveragegründe bleiben.
Der direkte Anonymisierungseinstieg verweigert neue Verträge vor Speicher-/
Quelleneffekten. Ein unabhängig reproduzierter Proxy-Prototyp-Fallback ist
regressionsgebunden geschlossen und durch acht zusätzliche Zero-Trap-/
Zero-Effect-Proben geprüft; gewöhnliche Legacy-Objektformen bleiben kompatibel.
Der vorangegangene 225-Dateien-Headlesslauf ist vollständig grün
(`dist/workflow-rc160-content-consumer-product-headless.log`, Exit 0).
Er gilt für den Stand vor diesem weiteren Adapter-/Coverage-Schnitt.
Frischer Schnitt: 71 gemeinsame Inhaltsgruppen und Docs grün; 64 tatsächliche
Windows-Konvertergruppen ohne Skip grün, einschließlich des Office-Header-
Gegenfalls über den isolierten Worker und die echte Privacy-Engine
(`dist/workflow-rc160-privacy-input-native-final.log`). 50 unabhängige
Fremdausnahmeproben lesen keine Eigenschaften fremder Fehler; drei eigene
Längenüberschreitungen behalten `TEXT_TOO_LARGE`. Windows-Rust: 115 bestanden,
drei Helper-Einstiege ignoriert, Clippy warning-free. Die vollständige neue
226-Dateien-Regression ist ebenfalls vollständig bestanden
(`dist/workflow-rc160-privacy-input-product-headless.log`, Exit 0), ohne native
GUI. Dieser Lauf belegt den Stand vor dem nachfolgenden Personenfeld-Schnitt.

Personenfeld-Nachtrag, 14.10.2026: Eine unabhängig bestätigte Lücke bei seltenen
Einzelnamen unter „First Name“ und „Vollständiger Name“ wurde zuerst rot
regressionsgebunden. Der reine Matcher `content-person-fields/1` wird nur aus
dem vollständigen neuen Inhaltsvertrag abgeleitet; die bisherige Grammatik
bleibt für Legacy unverändert. Office-Promotion, Redaktion, Restprüfung,
Reservierungen und private Dokumentfreigabe verwenden denselben Kontext.
Der Tabellen-Cache bindet Text und Regelversion. Die private Dokumentfreigabe
rekonstruiert die Version aus den unabhängig gebundenen Snapshotoptionen;
ein selbstgewählter, fehlender oder falscher Marker autorisiert nichts.
Weitere Gegenfälle mit NFD-/Zero-Width-Köpfen und inkonsistenter Tabellenbreite
sind rot reproduziert und korrigiert. Nur die Header-Erkennungsansicht wird
normalisiert; Quellheader bleiben erhalten. Mehrdeutige Feldstrukturen stoppen
vor Registryzugriff, statt eine Spaltenzuordnung zu raten. 13 Adapter- und
14 reine Coregruppen bestehen, einschließlich 42 tatsächlicher DOCX-/CSV-/MD-
Varianten, bestehender Rollenlabels, sachlicher Negativköpfe und Legacy-/Neu-
Wechsel. Neue positionsbezogene Locatoraufrufe verweigern nicht positionsgetreue
Normalisierung ausdrücklich; ein Source-Coordinate-Mapping bleibt erforderlich,
bevor ein entsprechender neuer Consumer zugelassen wird. Frische gemeinsame
Inhaltsprüfung: 77 Gruppen grün (`dist/workflow-rc160-person-fields-boundaries-latest.log`).
64 tatsächliche Windows-Konvertergruppen ohne Skip bestehen, einschließlich
isolierter NFD-/Zero-Width-Office-Gegenfälle (`person-fields-native-final.log`).
41 private Dokumentprüf-/Exportgruppen bestehen (`person-fields-documents-final.log`).
Die neue Policyprobe verwendet synthetische `/3`-Paketstubs ausschließlich für
die private Freigabeprüfung; sie ist kein `/4`-Publikationsnachweis. Unabhängig:
vier ZIP/XML-Proben, 60 Struktur-/Registryproben, acht Locatorproben und sechs
private FS- plus 20 Reservierungs-/Anonymisierungsproben. Rust 115 grün, drei
Helper-Einstiege ignoriert, Clippy warning-free; Docs und strenge lokale
Plugin-/Marketplaceprüfung grün. Neuer Gesamteingang nach diesen Änderungen
bleibt ein gesonderter Nachweis, keine Tauri-/Mac-Bedienfreigabe.
Dieser Personenfeld-Gesamteingang ist inzwischen mit 226 Headlessdateien,
Exit 0 bestanden (`person-fields-product-headless.log`), ohne native GUI.

Publikationskern-Nachtrag: Eigener privater `standalone-anonymized-artifacts/Output`-
Pool und geschlossener `/4`-Vertrag sind implementiert. Prozesslokaler Residual-
nachweis bindet exakte Textbytes/Profil/Quelle/Coverage/Optionen; der Reader
verlangt eine unabhängig gespeicherte Erwartung einschließlich Manifesthash.
Vor-/Nach-Rename-Prüfung, Lost-ACK und tatsächliche Prozessabbrüche erhalten die
Commitgrenze. Der öffentliche Legacy-Reader unterstützt weder den Pool noch `/4`
und lehnt reservierte neue Felder auch unter altem Schema ab. Neue Dokumentbasis
`/2` speichert den Publikationskontext gegen Runanker `/3`; eigener Receipt `/2`
verifiziert ihn auch beim Wiederöffnen. Der tatsächliche Schnitt bis menschlicher
Freigabe und exaktem Dokumentexport `/7` besteht. 16 neue Publikationsgruppen,
27 Public-, 41 Dokument-, 13 Raw-, 10 Persistenz-, 14 Core- und 10 Bereitschaftsgruppen
grün; Logs `dist/workflow-rc160-private-publication-*`. Zwei unabhängige Typ-/Proxy-
Gegenfälle zuerst rot bestätigt, dann korrigiert. Die neuen Formatbelege sind
synthetische Extraktionsreceipts, keine neue native Format-/GUI-Abnahme.
Der private Reader ist nun mit Runmitgliedschaft, Reconciliation, initialen
und späteren Publikationscallbacks, lokaler Delivery sowie Terminal-/Ergebnis-
projektion verbunden. Kein öffentliches `/3` gleicher ID oder alter Stat-Cache
bestätigt neue Ergebnisse. Fehlende Ziele verlangen eine gehaltene Elternkette
ohne Commitbeleg; Rename-Lost-ACK vor dem Reviewcallback bleibt `processing`.
Stagekapazität vor Nutzdateien, keine Plugin-Capability/ACK und keine alten
Abschlussbelege für `/7`. 30 Publikations-/Recoverygruppen grün
(`dist/workflow-rc160-private-recovery-artifact-final.log`), drei weitere rote
Consumergegenfälle korrigiert. Alter positiver Mapping-Intent bleibt gesperrt.
Raw-Recovery bindet ebenso Runmitgliedschaft und Commitbelege; Raw-Fehler und
Preflight-Abschluss schreiben keine Anonymisierungs-Mappingzeilen. Zwei weitere
rote Raw-Gegenfälle korrigiert; 115 frische Windows-Rusttests, drei ignorierte
Helper, Clippy warning-free.
143 zusätzliche Consumer-/Legacygruppen grün, einschließlich tatsächlicher
Raw-Wiederaufnahme ohne Anonymisierungs-Mappings (`private-recovery-consumers-final.log`).
Unabhängige Nachreviews bestätigen die geschlossenen begrenzten Fehlerfälle.
Docs und strenge lokale CLI grün; frischer Build bleibt am sauberen Quellcommit-
Gate gesperrt und aktuelles RC160-Cowork-ZIP fehlt, keine neue Paketfreigabe.
Tatsächlicher Orchestrator-/gebundener Outbox-/gewöhnlicher Exportanschluss und
nachfolgende Gesamtregression bleiben offen. Startbereitschaft nicht vorzeitig aktivieren.
Diese Reader-/Recoverygesamtregression ist inzwischen mit 227 Headlessdateien,
Exit 0 bestanden (`private-recovery-product-headless.log`). Im anschließenden
Operationsschnitt bleibt `/7` ohne Migration bytegleich; die falsche
Altverschlüsselungsmeldung ist rot über den produktiven gespeicherten Einstieg
belegt und korrigiert. Der tatsächliche Operationsadapter bindet Journal,
Runanker, eigenes Snapshot und FD-Sperrepoche mit einmaligen prozesslokalen
Tickets. Item, Reviewcapture und Reviewpublikation besitzen getrennte interne
Anschlüsse. Neun Operationsgruppen und 14 Lockgruppen grün; zwei unabhängig
reproduzierte Release-/Hardlinkgegenfälle korrigiert. Der interne neue
Publikationsadapter bleibt bis zum nachfolgenden Privacy-/Prepared-Replayanschluss
`NOT_READY`. Dieser Operationsgesamteingang ist mit 228 Headlessdateien, Exit 0
bestanden (`content-operation-product-headless.log`).
Der gemeinsame Textkern ist danach aus dem Legacy-Orchestrator herausgelöst
und mit dem produktiven neuen Capture verbunden. Capture liefert ausdrücklich
Kontaktinput oder Privacyentwurf und endet dort auch bei leerer Fundstellenliste.
Keine Stage, Basis, Freigabe oder Audit. Derselbe tatsächliche Privacykern
behält Personen-/Firmenentscheidungen, Reservierungen, Transformspur und
Restprüfung. Kontaktkorrektur erzeugt Extraction `/2` mit denselben Optionen
und nur den verbleibenden Coveragegründen; keine alten Kontaktkoordinaten auf
geänderten Text anwenden. 173 gezielte Gruppen grün. Zehn Quelltypen × beide
Ausgabeprofile erreichen über den echten Windows-Konverter den Entwurf,
Originale unverändert und ohne Publikation (`shared-privacy-native.log`).
Neuer Gesamteingang für diesen Schnitt bleibt erforderlich;
Prepared-Replay, neue Publikation und App-Start noch nicht aktiviert.
Unabhängig 90 Textkern-Differentialfälle bestätigt. Vorgeschalteter
Signalgetter und kopierte Node-Deskriptoren wurden als tatsächliche Saved-run-
Gegenfälle erst rot reproduziert, danach durch eigene native Signalherkunft
und Diensteprüfung vor erster Kontakt-/Abortabfrage geschlossen. 15
Operationsgruppen bestehen (`capture-signal-final.log`); Intrinsics beobachten
echten Abbruch trotz eigener false-Property, Legacy bleibt kompatibel.
Sechs unabhängige Nachproben bestätigen diesen Signal-Schnitt.

Der vollständige Textkern-/Signalgesamteingang bestand mit 229 Headlessdateien
(`shared-privacy-product-headless.log`); der tatsächliche Windows-Konverter
bestand mit 65 Gruppen ohne Skip (`shared-privacy-native-owned-final.log`).
Nachfolgend implementierte Prepared-Primitiven: geschlossener rohwertfreier
Registry-Witness aus tatsächlichem dauerhaftem Readback, unveränderliche
Altbindungen bei erlaubter Erweiterung und gesicherter Scope-Abschluss ohne
Finally-Rollback. Unabhängiger create-only Runowner zuerst, exakte vorbereitete
Manifest-/Auditdaten außerhalb des `/4`-Pools, dann unveränderliche Basis.
Abwesenheit nur ohne jeglichen Owner/Bestandteil als Erstverarbeitung behandeln;
partiale, verlorene oder falsy/defekte Ownerdaten stoppen benannt. Replay führt
denselben Trace-/Keep-/Framegate mit frischem Proof aus, keine erneute OCR oder
Entscheidung. 31 reale Operationsgruppen bestehen
(`prepared-operation-final-reviewed.log`), einschließlich frischer Node-Prozesse
und tatsächlichem Rename/Lost-ACK. Zwei unabhängige Reviews schlossen mehrere
Hash-/Snapshot-/Finally-/Ownergegenfälle. Die Primitiven sind noch nicht an
den neuen tatsächlichen Publication-Adapter angeschlossen; Mapping, Export,
Startfreigabe und Gesamt-/Zielhostabnahme bleiben offen.

Verbindlicher Wiederveröffentlichungsschnitt: Exakte vorbereitete Manifestdaten
und sanitisiertes Auditreceipt außerhalb des Zwei-Dateien-Artefakts dauerhaft
schreiben; danach unveränderliche Basis binden. Registry und Aliasbindungen
müssen vor diesem Basiscapture dauerhaft vorliegen. Vorhandene Basis ausschließlich
mit gespeicherter finaler Textfassung und identischem Manifesthash wiederverwenden;
keine erneute Extraktion, OCR, Profilerkennung oder Reviewentscheidung.
Den vorhandenen gemeinsamen Restprüfgate mit gespeichertem Transform-/Keep-
Kontext erneut anwenden. Fehlender Prepared-Stand oder geänderte Policy stoppen
benannt; sie erlauben keine neue Anonymisierung unter derselben ID. Abbrüche
nach Registry, Prepared, Basis, vor Rename und nach Rename vor Audit-ACK brauchen
frische Prozesse, exakte Bytes, stabile Folgepseudonyme und genau eine Auditoperation.
Elf Vertragsgruppen mit echten Parent-Fehlerinjektionen und 36 PDF-/Textfälle
bestehen. Gegenreviews schlossen Signalgetter, breite Dublettenboxen und fehlende
Vektorpaints; strengere Marked-Content-Geometrie gilt nur für neue Verträge.
62 reale Windows-Konvertergruppen nach letzter Kompatibilitätskorrektur
bestanden ohne Skip, einschließlich echter Vektorzeichen und Abbruchnachweise
(`dist/workflow-rc160-content-converter-options-compat.log`). Der App-Anschluss
und die neue Gesamt-/Zielhostabnahme werden dadurch nicht vorweggenommen.
Der vorgeschaltete Rust-Requestbodydecoder ist inzwischen implementiert:
fehlendes Feld bleibt Legacy, explizites `null`, Alias und unbekannte Felder
stoppen. Der neue gültige Vertrag erhält vorläufig `CONTENT_OPTIONS_NOT_READY`;
eine authentifiziert gespeicherte Option darf nicht mit Legacy-Extraktion
bestätigt werden. Diese Bereitschaftssperre gilt auch an direkten Picker-,
Intake-, Executor-/Worker- und Fortsetzungseinstiegen vor deren Aufnahme/ACK.
Vier unabhängig reproduzierte interne Altweg-Umgehungen sind regressionsgebunden
geschlossen. Neun Bereitschaftsgruppen, zwölf reale Worker-Ablehnungen, 71
Startupfälle, 36 unabhängige Gegenproben und 115 Rusttests bestätigen diesen
begrenzten Schnitt, nicht die gewünschte neue OCR-/Ausgabefunktion.
Direkte Belegerzeugung, Privacy-Capture und Reviewveröffentlichung benötigen
denselben validierten Anonymisierungszweck; Raw-Einstiege sind regressionsgebunden
gesperrt. Lieferstatus weiterhin ausschließlich BL-010.53.

Geschlossener versionierter Ausgabe-/OCR-Vertrag: Workspace → Rust → private
IPC → Anwendungsdienst → Worker/Intake → unveränderliches Journal → Konverter.
Sichere Lieferreihenfolge: Konvertersemantik und alle gespeicherten Verbraucher
zuerst verbinden, danach vollständigen Starttransport und zuletzt Nutzeroptionen
aktivieren. Neue Inhalts-Intakes benötigen einen eigenen Nachrichtentyp, den
ältere Worker ablehnen; ein zusätzliches Feld an einem alten Intake-Typ genügt
nicht. Bereitschaftssperren erst nach dieser vollständigen Gegenprüfung ersetzen.
Resume und Reviewrekonstruktion lesen ausschließlich die gespeicherten Optionen.
Alte Journale ohne Profil behalten alte Semantik; alte OCR-Entscheidungen,
Freigaben und Exportkopien nicht nachträglich verändern.

Der Startvertrag heißt im Renderer `contentOptions`, im privaten IPC und in
der Persistenz `content_options`. Er enthält exakt `schema` mit
`datasecure-content-options/1`, `markdownOutput` mit `content-v1` oder `notes-v1`
sowie die echten Booleans `scanOcr` und `imageOcr`. Fehlender Vertrag ist nur
Legacy; explizites `null`, Teilobjekte, Aliasfelder, zusätzliche Felder und
Typumwandlungen stoppen vor Aufnahme. Rust muss deshalb den tatsächlichen
Requestbody prüfen: `Option<Value>` allein unterscheidet `null` nicht sicher
vom fehlenden Feld. Neue Optionen sind nur am ausdrücklichen Start zulässig,
nicht an Picker, Resume oder Export und nicht im Cowork-Kanal.
Der ursprüngliche Body ist über die dokumentierte
[Tauri-Request-Schnittstelle](https://v2.tauri.app/develop/calling-rust/#accessing-raw-request)
zugänglich; reine `Option`-Argumente ersetzen diese Presenceprüfung nicht.

Neue vollständig gebundene Läufe verwenden `datasecure-batch/7` für beide
Zwecke mit ausdrücklich gespeichertem `processing_mode`. Reine Konvertierung
bleibt ohne Privacy-/Pseudonymfelder; Anonymisierung behält deren Pflichtbindung.
Ein dauerhaftes Runmanifest `/3`, Dokumentbasisstand `/2`, Intake-Intent `/3`
und OCR-Korrektur `/3` tragen denselben kanonischen Vertrag. Neue Läufe verlangen
den bestehenden Dokumentprüfpfad; Journal-Reads vergleichen die Optionen mit
dem unabhängigen unveränderlichen Runmanifest, auch nach Neustart und bei einem
Schema-Downgrade. Ein Optionswechsel ist selbst bei identischen Textbytes
verboten. Neue OCR-Korrekturen authentifizieren den vollständigen Vertrag;
alte Korrekturversionen bleiben ausschließlich im jeweiligen Legacy-Pfad.

Neue Konverteraufrufe verwenden `contentOptions` statt konkurrierendem
`markdownOutput`; auch das äußere Optionsobjekt darf nur eigene Datenfelder
enthalten. Das canonical Base64url-CLI-Argument wird streng gelesen, nicht von
alten Workern ignoriert. Response `/2` ist nur zusammen mit Extraction `/2`
und exakt erwartetem `content_options` gültig. Private PDF-Metadaten niemals
in Diagnose, Mapping, Markdown-Artefaktmanifest oder KI-Export kopieren.

Normalverarbeitung, beide Kontakt-/Entitäts-Capturewege und spätere
Reviewpublikation setzen die gespeicherten Optionen nach Caller-Abhängigkeiten.
Gemeinsame geprüfte Zweck-/Schemahelfer ersetzen die bisherigen exklusiven
`/5`-Konvertierungsabzweigungen in Delivery, Recovery, Snapshot, Export,
Evidence und Retention. Ein ungültiger Zweck darf nicht durch eine false-
Rückgabe in die Anonymisierungsroute fallen.

TXT wird im Inhaltsprofil als wörtlicher Text serialisiert. Neue CSV-Anonymisierung
verwendet den bounded CSV-Dialektparser mit `preserveRecords` und literalem
Header-Renderer; der Rohkonverter mit generischen Spalten ist kein Ersatz.
Legacy-CSV behält seine bisherige Normalisierung und Headersuffixe.
Einspaltige sensible Tabellen,
leere/mehrfache Header und komplett maskierte Tabellen mit optionalen äußeren
Pipes benötigen getrennte Privacy- und Strukturgegenproben. GFM-Tilden und
Bild-/HTML-Syntax bleiben in Literalzellen sichtbar, ohne aktive Darstellung.
Office-Supplementtexte sind ebenso literal wie reguläre Prosa und Tabellen;
Diagrammwerte, Layout-/Mastertext und Kommentare dürfen nicht verlorengehen.

Owned Hinweise an ihrer Erzeugung unterdrücken: Office-Visualhinweis,
PDF-/Bild-Notice und nach OCR-Korrektur erzeugter `convert-next`-Hinweis.
Technische Chart-/Drawinglabels durch neutrale Gliederung ersetzen, aber Daten
darunter erhalten. Container-Metadaten von sichtbarem Dokumentinhalt unterscheiden;
kein unbekannter Quelltext wird aufgrund einer ähnlichen Überschrift gelöscht.

Autorentitel, Achsenbeschriftungen, Legenden, Daten, Notizen, Alttexte und
Bildunterschriften bleiben Inhalt. Im Inhaltsprofil sind technische Container-
Metadaten (Erzeugersoftware, Änderungsdatum, Paketpfad) private Dokumentinformation,
nicht Seitenprosa. Sichtbare Autoren-/Titelangaben innerhalb der Seite bleiben
unverändert. Im erläuternden Profil bleiben die bisherigen Metadatenabschnitte.

Echte MD-Bildknoten durch Syntaxanalyse entfernen, Alttext literal erhalten,
gemeinsame Linkreferenzen und Caption-Prosa behalten. Codeblöcke, Inlinecode,
Escapes und Bildsyntax als TXT-/CSV-/Office-Literalinhalt nicht löschen.
Keine externe Bildabfrage. Kontakte/Crops an exakte sichtbare Zeichenpositionen
binden; danach Reviewhash und Dokumentrevision erzeugen. Kein Exportfilter
nach menschlicher Freigabe; exportierte Bytes entsprechen dem geprüften Stand.

Syntaxreferenzen: `![Titel](bild.png)` wird zu literalem `Titel`, `![](bild.png)`
entfällt. Bei `![Titel][bild]` entfällt eine nur vom Bild verwendete Definition;
`[Quelle][bild]` hält dieselbe Definition als normalen Link am Leben.
`[![Titel](bild.png)](https://example.invalid)` bleibt ein normaler Link mit
Titel. HTML-`img` wird durch seinen Alttext ersetzt; `picture`/`source`-Markup
ohne Text entfällt, Caption-Prosa bleibt.
Vorhandene Bildtitel/Tooltips bleiben neben Alttext erhalten. SVG-Bildeinbettungen
und Zeichnungsattribute entfallen; SVG-Text, Textspans, Titel, Beschreibung,
zugängliche Beschriftung und textlicher HTML-Inhalt bleiben erhalten. Ein nicht
geschlossenes SVG ohne sichere Inhaltsgrenze stoppt benannt statt Folgeprosa
zu löschen oder Bildattribute still weiterzugeben.

Inlinecode, Fences, eingerückter Code,
Escapes und literal gespeicherte TXT-/CSV-/Office-Zellen sind unveränderte
Gegenreferenzen. Keine externe Abfrage, keine globale Pfad-/Base64-Löschregex.

## Abnahme und Qualitätsmessung

Alle Quelltypen × Zwecke × Scan-/Bild-OCR-Wahl × Ausgabeprofil. Office mit
Bild und Diagrammdaten, native/gemischte/Scan-PDFs, eigenständige Bilder,
MD-Inline-/Referenz-/HTML-/Data-Bilder und ähnliche Literal-Codebeispiele.
Vergleich unabhängiger Wort-/Zell-/Zeichenreferenzen, Originalnamen im raw Weg,
neutrale KI-Namen, kein Artefakt und kein unbegründeter Inhaltsverlust.

Tabellenreferenzen enthalten leere Zellen, Pipes, Backslashes, Zeilenumbrüche,
Unicode, Formeln mit gespeicherten Werten, mehrere Blätter, verbundene Zellen,
Notizen und Diagrammdaten. PDF: Wort-/Zahlenerhalt und belegbare Zellzuordnung
getrennt messen; keine Tabellenstruktur erfinden. Die Inhaltsreferenz ist an
die gewählten OCR-Optionen gebunden; absichtlich nicht gelesener Grafiktext
ist eine dokumentierte Auslassung, kein zufälliger PASS für Vollständigkeit.

OCR-Korrektur, Crop, Vertagen/Neustart, Journal-Optiontampering, alte
Exportpläne, Nachkorrektur/Freigabewiderruf und Lost-ACK über echte IPC/Rust
und Paket-Sidecar prüfen. OCR-Lesefehler werden nicht durch Formatierung
„behoben“. Native Windows-/Intel-/ARM-Mac-Bedienung getrennt belegen.

RC160-r3 präzisiert den reinen Markdown-Weg: vorhandene Konvertate ohne
weitere Freigabe nutzbar; Nachkorrektur freiwillig. Read-only Vorschau darf auch
noch nicht zur Zusatzkopie bestätigte Raw-Stände zeigen. Erst **Kopie speichern**
bindet ausgewählte aktuelle Revisionen intern zur zusätzlichen Kopie; exakte
ACKs und erneuter Namens-/Hashplan nötig. Tatsächlicher Export bleibt gesperrt
ohne diese Zustimmung. Kein Teilkopieren oder automatisches Replay bei verlorenen
Antworten; frühere Einzelbestätigungen bleiben möglich. Keine Lockerung für
anonymisierte Vorschau/Export und kein Anspruch auf allgemeine Inhaltskorrektheit.
