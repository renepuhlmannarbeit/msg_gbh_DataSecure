# Verbindlicher Refactoring- und Migrationsplan

Stand: 25.08.2026 · Zielbasis: RC44 · abgeleitet aus DS-041 bis DS-060

## Zweck

Dieser Plan übersetzt Product Vision und Zielarchitektur in eine sichere
Implementierungsreihenfolge. Er ändert keine Produktentscheidung. Bei einem
Widerspruch gelten `DECISIONS.md`, `PRODUCT_VISION.md`, `PRODUCT.md` und
`TARGET_ARCHITECTURE.md` in dieser Reihenfolge.

Das Refactoring erfolgt in kleinen, einzeln rückrollbaren Teilschnitten. Eine
Performanceverbesserung, ein neues Format oder eine neue Oberfläche darf keine
Datenschutz-, Originalschutz-, Durability- oder Coverage-Grenze abschwächen.

## Durchgängige Arbeitsregeln

1. Vor jeder Verhaltensänderung wird der bestehende Vertrag durch
   Charakterisierungs-, Negativ- und Recoverytests festgehalten.
2. Strukturänderung und Produktverhalten werden nicht im selben Commit vermischt.
3. Jeder Teilschnitt hält die öffentliche MCP-, Skill-, Paket- und Dateigrenze
   entweder bytegleich oder aktualisiert sie ausdrücklich mit Backlog und Tests.
4. Originale werden ausschließlich lesend geöffnet. DataSecure verschiebt,
   überschreibt oder löscht keine Quelle und folgt keinen Links.
5. Private Rohdaten gelangen weder in Logs noch in Testausgaben, Dateinamen,
   Kommandozeilen, Umgebungsvariablen oder Claude-Antworten.
6. Ein fehlender Schlüssel, Parser, Supervisor, Launcher oder Coverage-Nachweis
   stoppt vor dem betroffenen Rohdatenzugriff; es gibt keinen stillen Fallback.
7. Nach jedem Teilschnitt laufen mindestens betroffene Unit-/Negativtests,
   `npm run test:docs`, `git diff --check` und vor Abschluss des Pakets
   `npm run test:ci` lokal. GitHub-Actions bleiben kostenbegrenzt.
8. Erst nach grünem Nachweis werden Backlog, Current State und Traceability
   gemeinsam fortgeschrieben.

## Phasen und feste Reihenfolge

### R0 – Entscheidungen und RC44-Baseline

Status: **abgeschlossen**

- DS-041 bis DS-060, Product Vision, Zielarchitektur, Ist-/Soll-Abgleich,
  Dokumentenregister und priorisiertes Backlog bilden die unveränderte Basis.
- Der getestete Ausgangsstand ist separat committed, damit jeder spätere
  Teilschnitt sauber vergleich- und rückrollbar bleibt.

### R1 – Öffentliche Altoberfläche schließen

Status: **abgeschlossen**

- Normaler Cowork-Ablauf: acht Werkzeuge.
- Gesamte Supportoberfläche: 25 Werkzeuge.
- `open_input_folder`, `begin_document_batch` und
  `start_document_batch_processing` sind auf keiner MCP-Oberfläche aufrufbar.
- Der direkte Betriebssystempicker ist der einzige neue Dateieingang.
- Eine datenbewahrende Upgrade-Migration darf vorhandene verwaiste Alt-Claims
  wiederherstellen, aber niemals neue Quellen annehmen.

### R2 – Stapelkern verhaltensneutral zerlegen

Status: **abgeschlossen** · Story: BL-011.15

Der große Stapelkern wird hinter seiner bestehenden Exportoberfläche schrittweise
in klar verantwortete Module getrennt:

1. Intake, Snapshot-Preflight und Quellbindung,
2. Journal, Zustandsautomat, Lease und Crash-Recovery,
3. Verarbeitung und zentraler deterministischer Commit,
4. lokale Mehrdeutigkeits-/Review-Queue,
5. Veröffentlichung, Ergebnisübergabe und Mapping,
6. Retention, Migration und Wartung.

In R2 ändern sich weder Benutzerablauf noch Fehlerschema, Dateiformate,
Parallelität, Speicherorte oder Löschregeln. Bestehende Exporte bleiben zunächst
als Kompatibilitätsfassade erhalten. Jeder Extraktionsschritt muss die gezielten
Batchtests und die vollständige lokale CI bestehen.

Erster Teilstand: `gateway/batch-results.js` kapselt signierte Ergebnis-Cursor,
begrenztes Paging und die interne Auswahl vollständig abgeschlossener lokaler
Handoff-Kandidaten. `gateway/batch-progress.js` kapselt das inhaltsfreie
Statusmodell, gemessene Restzeit und die deutschen nächsten Schritte. Die rein
speicherinterne Review-Policy für Keep/Redact/Deferral liegt in
`gateway/batch-review-policy.js` und ist durch einen eigenen Negativtest
abgesichert. `gateway/batch-journal-io.js` kapselt die bereits bewiesenen
Short-Write- und POSIX-Directory-Fsync-Primitiven. Darauf kapselt
`gateway/batch-journal-store.js` die atomare Temp-/Rename-Veröffentlichung und
zwei bewusst getrennte sichere Lesepfade: der normale Pfad darf nur den eigenen
abgelaufenen Snapshot bereinigen, der Maintenance-Pfad bleibt vollständig
read-only. Zehn direkte Tests injizieren Short-/Zero-Write, Fehler in jeder
Publikationsphase, Symlink-/Dateityp-/Inode-Austausch, ungültige Zustände und
Expiry-Cleanup. Nicht parsebare Ablaufdaten werden jetzt in beiden Pfaden
fail-closed abgelehnt.
`gateway/batch-private-store.js` trennt die dynamischen privaten Pfade und das
tokengebundene Cleanup als Leaf-Modul; `gateway/batch-snapshot.js` kapselt
Kapazität, OOXML-Preflight, TOCTOU-gebundene Kopie und nun auch die spätere
Read-side-Bindung der versiegelten Arbeitskopie. Der direkte Modultest belegt
Partial-/Zero-Write, Short-Read, `ctime`-Mutation, sichere Work-Namen,
Größenbindung ohne zweiten Inhaltsleselauf und den unveränderten
`batch._test`-Vertrag. Die
globale Prozesssperre liegt in `gateway/batch-active-lock.js`; die gemeinsame
fail-closed PID-Liveness in `gateway/process-liveness.js`.
Der fokussierte Negativtest belegt fail-closed `EPERM` sowie, dass ein zwischen
Prüfung und Löschung ausgetauschter Lock weder beim Release noch beim
Dead-Owner-Reclaim entfernt wird. Die
Executor-Berechtigung liegt separat in `gateway/batch-executor-lease.js` und
erhält Lock, Journal, Liveness und Progress ausschließlich per Injection. Acht
fokussierte Tests belegen ungültige, tote, doppelte und fremde PIDs sowie
Lock-/Journalfehler und die unveränderte öffentliche Batch-Fassade. Die
öffentlichen Exporte bleiben weiterhin in `gateway/batch.js`; die vorhandenen
Batch-, Handoff-, Gateway- und MCP-Verträge laufen unverändert dagegen. Als
nächster Leaf-Schnitt kapselt `gateway/batch-reconciliation.js` die
deterministische Paketverifikation, Mapping-Zustände und die reine
`processing`-zu-`retryable`-Transition. Acht fokussierte Tests belegen die
Adoption ausschließlich verifizierter Pakete, die Reihenfolge Adoption vor
Retry, alle Mapping-Crashgrenzen und Idempotenz. Darauf kapselt
`gateway/batch-recovery.js` nun die rein lesende Wiederaufnahme-/Cleanup-
Statusermittlung sowie die gesperrte Startup-Recovery und periodische
Ablaufbereinigung. Neun direkte Tests belegen Live-Owner- und Live-Executor-
Yield, gemischte defekte und gültige Journale, die feste Reihenfolge Adoption,
Mapping, Retry und Cleanup, genau einen finalen Journal-Commit, idempotente
Wiederholung, Workdir-vor-Journal-Löschung, Teilfehler und sichtbare
Lock-Release-Fehler. Der read-only Retention-Schutzscan liegt zusätzlich in
`gateway/batch-retention-protection.js`. Seine direkten Tests belegen dynamische
Root-Auflösung, konservativen Gesamtabbruch bei einem defekten Journal, den
Erhalt bereits gefundener Schutz-IDs und unveränderte Root-Fehlersemantik.
`gateway/batch-delivery.js` kapselt anschließend Capability-Ausgabe,
Einzel-/Seitenbestätigung, lokalen Abschluss und terminales Byte-Cleanup. Neun
direkte Tests belegen vollständige Vorvalidierung vor einer Mehrfachmutation,
Paketverifikation am Übergabepunkt, Lock-Freigabe an Fehlergrenzen,
symlink-sicheres Cleanup, Wiederholung nach Journalfehler und idempotente
Bestätigungen ohne weiteren Journal- oder Evidenzschreibvorgang.
`gateway/batch-mapping-maintenance.js` kapselt den verifizierten
Mapping-Outbox-Replay und bewahrt die Reihenfolge Mapping vor Intent-Löschung.
Sieben direkte Tests belegen Lese-, Schreib- und Cleanup-Fehler, fehlende,
unsichere und gemischte Paketzustände sowie inhaltsfreie Ergebniszähler.
`gateway/batch-intake.js` kapselt Picker-Quellbindung, Vorabprüfung,
Snapshot-Aufbau und den ersten Journal-Commit. Seine direkten Tests lehnen
Dateinamen-/Pfadabweichungen und doppelte Quellen vor jedem Metadatenzugriff ab.
Sie belegen außerdem, dass ein Fehler vor Journalveröffentlichung nur den neuen
Work-Baum entfernt, während ein Fehler nach Rename beziehungsweise eine
unsichere Journalnachprüfung Journal und versiegelte Arbeitskopien gemeinsam
für die Recovery erhält. `gateway/batch-discard.js` kapselt das ausdrücklich
bestätigte Verwerfen unvollständiger Stapel hinter derselben globalen Sperre.
Acht direkte Tests belegen den vollständigen Stopp bei einem aktiven lokalen
Executor, die feste Reihenfolge versiegelte Arbeitskopie vor exaktem Journal,
sichtbare Lock-, Scan-, Cleanup- und Unlink-Fehler, sicheren Retry sowie den
Erhalt des bestehenden partiellen Mehrstapelvertrags. Originale,
veröffentlichte Outputs, Mapping und terminale Nachweise liegen außerhalb
dieser Löschgrenze. `gateway/batch-continuation.js` kapselt die ausdrücklich
bestätigte Fortsetzung eines bekannten beziehungsweise des jüngsten offenen
Stapels. Zehn direkte Tests belegen Single-Flight, Lock-/Release-Cleanup,
Invalidierung vor Reconciliation, die feste Reihenfolge Paketadoption vor
Mapping vor Interrupted-Recovery vor Resume, idempotente Wiederholung,
Fehlerpriorität und die namenfreie Auswahl nach `created_at`.
`gateway/batch-snapshot-invalidation.js` kapselt zusätzlich den kleinsten
Processing-Fehlerleaf ohne eigene Journalmutation. Sieben direkte Tests belegen,
dass nur unveröffentlichte Positionen gestoppt werden, ein per Objektidentität
ausgenommenes aktuelles Item unverändert bleibt, Mapping- und Cleanup-Fehler
je Position unabhängig bleiben und eine Wiederholung keine Doppeloperation
auslöst. `gateway/batch-executor-runner.js` kapselt den seriellen lokalen
Executor-Lauf. Sieben direkte Tests binden Claim-Prüfung vor Release,
einmalige Vorbereitung, Delivery-vor-Mapping-vor-Processing, beide
No-progress-Abbrüche, unmittelbare lokale Finalisierung, das feste
Item-Schrittbudget und den frischen Endstatus nach genau einem Releaseversuch.
Der Runner beansprucht selbst keinen Lease und gibt einen fremden oder nicht
mehr lebenden Marker niemals frei. Ein anschließendes Security-Gegenreview hat
die Journal- und Runnergrenze zusätzlich auf höchstens 100 Positionen gebunden;
ein fehlgeschlagener Lease-Release stoppt nun fest statt Erfolg zu melden.
`gateway/batch-review-capture.js` isoliert anschließend die kleinste verbleibende
Rohentwurfsgrenze: versiegelte Entry-Bindung, exakt eine lokale Rekonstruktion
und ausschließlich speicherinterner Capture über den festen Sentinel. Sechs
direkte Tests verhindern überschreibbare Pipelineoptionen, Sentinel-Spoofing,
Fehlerverschlucken, unvollständige Ambiguitäten und jede Inputmutation.
`gateway/batch-review-state.js` kapselt zusätzlich die reine Zustandsmarkierung,
Review-Item-Auswahl und bestehende Bereitschafts-/Hinweispriorität. Fünf direkte
Tests binden Referenzbegrenzung, Idempotenz, die vollständige Wahrheitstabelle,
inhaltsfreie feste Meldungen und Mutationsfreiheit, ohne Lock-, UI-, Draft- oder
Publikationslogik in diese Grenze zu ziehen.
Ein reproduzierbarer Windows-Serienfund hat außerdem die bestehende Active-Lock-
Grenze gehärtet: eine zufällige unveränderliche `lock_id` bindet den Owner über
erneute Opens hinweg, während volatile Datei-Zeitstempel nicht mehr zu einem
falschen Own-Lock-Release-Fehler führen. Der Child-Worker-Vertrag unterscheidet
jetzt ausdrücklich vollständige und sicher pausierte Zustände; er verwendet
niemals `remaining === 0` als Terminalprädikat.
RC54 ergänzt an derselben Grenze identitätsgebundene, auf vier Versuche begrenzte
Retries für transiente Windows-Rename-/Unlink-Fehler, verpflichtend erfolgreiche
Lock-Freigabe vor Lease-Erfolg und eine durable inhaltsfreie Statusrekonstruktion
bei verlorener terminaler Worker-IPC. Dauerhafte Fehler und Replacement bleiben
fail-closed; 50 echte serielle Windows-Workerläufe sichern den Race-Fix.
Die Review-Publikationsschleife liegt nun in
`gateway/batch-review-publication.js`. Sie validiert die vollständige lokale
Antwort bijektiv über Dokumentindizes und Ambiguitäts-IDs, bevor irgendein
Itemstatus oder Paket verändert wird. Erst anschließend übernimmt sie die
bestehende je Dokument atomare Veröffentlichung samt Mapping-, Cleanup-,
Delivery- und Retry-Grenzen. Direkte Negativtests schließen unvollständige,
doppelte, außerhalb liegende und fachlich ungültige Bindungen aus und erlauben
bewusst eine gültige umsortierte Antwort. Mapping und Delivery verlangen
zusätzlich den positiv aufgerufenen Publish-Callback und die exakte
deterministische Paket-ID. Ab dem bestätigten Output-Commit
führen spätere Journal-, Mapping- oder Deliveryfehler ausschließlich in den
reconcilebaren `processing/package_published`-Zustand; STOPPED-Mapping und
Quellbereinigung sind an dieser Grenze ausgeschlossen.
Die äußere Review-UI-/Lock-Orchestrierung liegt anschließend in
`gateway/batch-review-orchestrator.js`; sie nutzt ausdrücklich dasselbe
`active`-Set wie der Normalpfad, reconciliiert vor Readiness, rekonstruiert alle
Drafts vor einem einzigen UI-Aufruf und schreibt terminale Evidenz erst nach
erfolgreicher lokaler Publication. Der direkt charakterisierte
Single-Item-Zustandsautomat liegt nun in `gateway/batch-item-processor.js`.
Dabei sind zwei P1-Grenzen geschlossen: Mapping und Delivery verlangen genau
einen Publish-Callback und die exakte deterministische Paket-ID; nach dem
Output-Commit bleibt jeder Folgefehler reconcilebar und darf weder
STOPPED-Mapping noch Catch-bedingtes Quellcleanup auslösen. Die Vorlaufwartung
liegt nun in `gateway/batch-next-maintenance.js`; sie erhält die bewusst
mehraufrufrige Adoption-zu-Mapping-Semantik und die getrennten durable Writes
für Reconciliation, Interrupted-Recovery und Cleanup. Abschließend kapselt
`gateway/batch-processing-orchestrator.js` die vollständige äußere Lock-/Lease-/
Read-/Maintenance-/Delivery-/Pending-/Snapshot-/Delegationsfolge; `batch.js`
ist reine Composition Root. `return await` hält In-Process- und Dateisystem-
Single-Flight bis zum Settlement der delegierten Delivery- oder Item-Pipeline.
Elf direkte Orchestrator- sowie verzögerte Resolve-/Reject-Integrationstests
belegen Reihenfolge, Fail-closed-Verhalten und sichere Fehlerfassade. R2 ist
damit abgeschlossen; die nächste Strukturphase ist R3.
Der priorisierte P1-Schnitt für terminale Nachweise ist abgeschlossen:
`batch-terminal-evidence.js` koordiniert durable Pending-/Exported-Marker,
`batch-evidence.js` den atomaren idempotenten v2-Store und eine inhaltsfreie
Outbox über die Journal-Retention hinaus. Append-, Marker-Commit- und
Outbox-Cleanup-Crashfenster sowie die ausnahmslos fehlerabschirmende Best-Effort-
Fassade sind direkt getestet; der lokale Nachweis nimmt ein
bereits verifiziertes Paket niemals zurück.

### R3 – Originalschutz und internes Legacy-Intake entfernen

Status: **R3b abgeschlossen; Ordnerquelle offen** · Story: BL-044.1

R3a ist mit RC53 abgeschlossen: `read-only-source-snapshot.js` bindet jede
Neuquelle über `O_RDONLY`, Link-/Identitäts-/Größen-/mtime-Prüfung und optionalen
SHA-256 an eine exklusive `0600`-Arbeitskopie. Der Orchestrator besitzt keinen
Move-/Restore-/Unlink-Pfad für Quellen mehr; alle Veröffentlichungs- und
Fehlerphasen dürfen ausschließlich die private Kopie bereinigen. Direkte und
End-to-End-Tests belegen TXT, Markdown, CSV und DOCX sowie Abbruch, Parser- und
Publishfehler. Unversiegelte Alt-/Direktquellen erhalten vor dem Kopieren eine
lokale SHA-256-Bindung; Zero-/Partial-Writes und Close-/Cleanupfehler sind
begrenzt und fail-closed. Der erste R3b-Schnitt ist mit RC54 abgeschlossen:
Historische `Processed`-Altbestände werden unabhängig von Alter und Typ weder durch
Retention noch Purge verändert; unvollständige Inspektion stoppt fail-closed vor
einer Gesamtbereinigung. RC55 schließt R3b: Der technische `Input`-Normalweg ist
entfernt und die Upgrade-Migration ist als `legacy-input-migration.js` isoliert.

- Neue Installationen erzeugen keinen technischen `Input`-Eingang; `listInput` und
  jede queuebasierte Quelle ohne Picker-Snapshot sind aus dem Produktpfad entfernt.
- Picker- und spätere Ordnerquellen werden nur gelesen und in eine private
  Arbeitskopie übernommen. Alle Fehlerpfade lassen die Quelle byteidentisch an
  ihrem Ort.
- Die Upgrade-Migration ist ein isoliertes, versioniertes, gesperrtes Einmalmodul.
  Sie erhält sichtbare Altdateien und historische Claims, nimmt keine neuen an und
  kann nach Ablauf der dokumentierten Übergangsversion vollständig entfallen.
- Dauerhafte Markdown-Exporte und Mapping werden nie automatisch durch Retention,
  Update, Rollback oder Deinstallation gelöscht.

### R4 – Benutzergebundene Verschlüsselung

Status: **R4a-E0 abgeschlossen; R4b/Produktaktivierung offen** · Stories: BL-011.13, BL-030.2

- Ein zufälliger Installationsschlüssel wird pro OS-Benutzer durch Windows DPAPI
  beziehungsweise macOS Keychain geschützt.
- Snapshots, Reviewdaten und minimaler neustartfester Pseudonymkontext werden vor
  dem ersten Rohbyte verschlüsselt; ohne sicheren Store stoppt der Auftrag.
- Kein Passwortdialog, keine selbst gebaute Schlüsselableitung und kein
  Klartextfallback.
- Schlüsselrotation und Migration werden atomar, versioniert und rückrollbar
  getestet. Rohwerte erscheinen nie in Recovery- oder Diagnosemeldungen.

R4a liefert die noch nicht produktiv verdrahtete create-once-Fassade: ein
versioniertes AES-256-GCM-Envelope, zwingend injizierten transaktionalen
Secret-Store, Zweck-/Objekt-/Generationsbindung, Replay-Sperre, private Root-/
Root-Ahnen-/Parent-/Inode-Bindung, exklusive Tempdatei und atomare
Create-if-absent-Hardlink-
Publikation mit festen Fehlercodes und Negativtests. Ein vorhandenes Artefakt wird
in diesem Teilschnitt auch bei einem Publikationsrennen nie ersetzt; eine zweite
Generation ist gesperrt. R4b muss den transaktionalen Rotations-/Migrations- und
Recoveryvertrag, die direkte
Descriptor-/Stream-Übergabe an den Parser und die native Produktverdrahtung liefern.

Die Product-Owner-Regel für Verlust beziehungsweise Widerruf des OS-Schlüssels ist
mit DS-050 festgelegt: keine Wiederherstellungs-Hintertür; unlesbare private
Arbeitskopien bleiben gesperrt und werden ausschließlich nach ausdrücklicher lokaler
Bestätigung verworfen. Ein neuer Auftrag darf nur aus einer weiterhin unveränderten
Originalquelle entstehen.

### R5 – Dauerhafter nicht blockierender Cowork-Auftrag

Status: **E0 teilweise vorhanden** · Stories: BL-011.3, BL-012.2, BL-012.3,
BL-041.9

- MCP kehrt nach durablem Startcheckpunkt kurzfristig zurück.
- Genau ein Stapel verarbeitet, mehrere dürfen pausieren.
- Reviewentscheidungen besitzen keinen menschlichen Entscheidungs-Timeout.
- Abschluss, Fehler und Resume erzeugen genau eine inhaltsfreie Meldung mit genau
  einer nächsten sicheren Aktion.
- Ein Hostabbruch löst weder erneute Auswahl noch doppelte Veröffentlichung aus.

### R6 – Quellen- und Inhaltsgrenze vereinheitlichen

Status: **R6a, R6b1, R6b2-Integrität, Grade-Policy/Manifest, RC61a-Journal/Mapping, RC62-Evidence/Receipt und RC63-Projektion E0 abgeschlossen; E1/E3 offen** · Stories: BL-044.1, BL-049.1

- R6a liefert den descriptor-gebundenen Classifier aus BL-049.1a.
- R6b1 plant den vollständigen Stapel vor Mutation, journalisiert Formatstopps
  kopierfrei pro Datei, repariert ihr lokales Mapping idempotent und setzt den
  Reststapel fort. Der positive Grad `candidate` aktiviert kein Format und ist
  kein DS-045-Ergebnis.
- R6b2-Integrität ergänzt echte OPC-Steuerteil-/Relationship-/CRC-Prüfung aller
  Einträge sowie die SHA-256-Bindung zwischen Preflight und Snapshot.
- R6b2-Grade bindet freigegebene V3-Pakete deterministisch an den Vertrag
  `contracts/RESULT_GRADES_V1.md`. RC61a bindet alle drei Grade crashsicher in
  Journal V2 und lokalem Mapping CSV/Outbox V2. RC62 ergänzt Batch-Evidence v3,
  Audit-Receipt v4 und einen endlichen inhaltsfreien Reason-Code-Katalog.
  RC63 projiziert die erneut paketverifizierten Grade in terminalen Progress,
  bestehenden Abschlussdialog, Results und tokenfreien Cowork-Handoff;
  historische V1-/V2-Stände und offene Zustände bleiben `unavailable`.

- Datei- und rekursive Ordnerauswahl nutzen denselben Snapshotvertrag.
- Der gesamte Umfang wird vor Start gegen 100 Dateien, 500 MiB, Links,
  Dateitypen, Signatur und Containerstruktur geprüft; keine stille Teilmenge.
- Polyglotte, beschädigte, aktive oder verschlüsselte Quellen stoppen einzeln und
  werden in der lokalen Übersicht eindeutig als nicht verarbeitet ausgewiesen.
- Ergebnisse verwenden ausschließlich die drei Grade aus DS-045.

### R7 – Selbsttragende Distribution

Status: **E0 vorbereitet** · Stories: BL-010.8, BL-051.1 bis BL-051.5

- Getrennte Windows-x64- und macOS-Universal-ZIPs sowie ein inhaltlich gleiches
  Marketplace-Produkt enthalten alle benötigten Laufzeiten.
- System-Node und Python sind weder Voraussetzung noch Vertrauensanker.
- Install, Update, Rollback und Deinstallation bewahren Konfiguration, offene
  Aufträge, Exporte und Mapping.
- Piloten dürfen unsigniert sein. Eigene native Sicherheitskomponenten werden vor
  breitem Unternehmenseinsatz signiert.

### R8 – Performance erst nach Sicherheitsgates aktivieren

Status: **Harness vorhanden, Produkt seriell** · Stories: BL-047.1, BL-050.3

- Zuerst reale Referenzwerte für 1/10/100 Dateien und die 500-MiB-Grenze erfassen.
- Kleine adaptive Parallelität bleibt hinter Lease-, Speicher-, Reihenfolge-,
  Crash- und Commitgates.
- Der Produktstandard bleibt seriell, bis Windows-/macOS-Evidenz die Aktivierung
  trägt.
- Zielbudgets: Startreaktion 2 Sekunden, kein Cowork-Aufruf über 10 Sekunden,
  höchstens 25 Prozent freier Speicher beziehungsweise zunächst 2 GiB und kein
  unbegründeter Rückschritt über 10 Prozent.

### R9 – Formate stufenweise freigeben

Status: **TXT/Markdown/CSV/DOCX Pilot; weitere Formate gesperrt**

Reihenfolge nach vollständigem Content-, Sandbox-, Ressourcen- und
Interoperabilitätsnachweis:

1. XLSX und PPTX,
2. Text-PDF einschließlich Formularen, Annotationen und Anhängen,
3. Scan-PDF und lokale OCR,
4. PNG, JPEG und BMP.

Verschlüsselte Dateien werden in keiner Stufe entschlüsselt. Ein Parser-Spike oder
synthetischer Test allein aktiviert kein Format.

### R10 – Progressive UI und Rollout

Status: **offen** · Stories: BL-042.3, BL-052.1 bis BL-052.5

- Eine inhaltsfreie MCP-App darf den Ablauf vereinfachen, aber nie Voraussetzung
  sein; Text-/OS-Fallback bleibt vollständig.
- Deutsch/Englisch, Tastatur, Fokus, Skalierung, Kontrast und Screenreader werden
  vor Release real geprüft.
- Technikpilot, interner Pilot, Datenschutz-/Security-Freigabe,
  Unternehmenseinsatz und öffentlicher Marketplace bleiben getrennte Gates.

## Commit-, Rollback- und Stopvertrag

- R0 bleibt eigener Baseline-Commit.
- Jede weitere Phase besteht aus kleinen fachlich zusammenhängenden Commits.
- Eine reine Modulverschiebung enthält keine neue Policy und keine neue
  Parallelität.
- Vor einer Persistenzmigration wird der alte Zustand gesichert; fehlgeschlagene
  Migration lässt den letzten durable Zustand lesbar.
- Ein Teilschnitt wird nicht weitergeführt, wenn Originalschutz, Exactly-once,
  Mapping, Residual-Gate, Paketprüfung, Netzwerkgrenze oder Recovery regressieren.
- Ein Release-Artefakt entsteht erst nach Paketparität und den in der
  Evidence-Matrix geforderten realen Zielsystemnachweisen.

## Noch notwendige menschliche Entscheidungen und Evidenz

Vor R2, R3 und der E0-Implementierung von R4 ist keine weitere Product-Owner-
Entscheidung nötig; der Schlüsselverlustvertrag ist in DS-050 entschieden. Alle
weiteren menschlichen Punkte sind keine Entwicklungsblocker, sondern Release- oder
Pilotgates gemäß `BACKLOG_EVIDENCE_MATRIX.md`.
