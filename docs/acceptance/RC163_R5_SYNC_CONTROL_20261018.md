# RC163 R5 – synchrone Steuerung und Abschlussanzeige

Stand: 18.10.2026. Lokale Windows-Korrekturrunde, keine Veröffentlichung und
keine macOS-Abnahme. Historische fehlgeschlagene Nachweise bleiben erhalten.

## Folgerunde 06:39 UTC – gemischter Befund, keine Gesamtabnahme

36641cba besteht Windowsbuild/Paketgates und erstmals den frischen nativen
Fast+OCR-Abschluss einschließlich 3/3 automatischer Freigaben. Vorschauabbruch
ohne Kopie, dann genau ein expliziter Export: drei bytegleiche neutrale Markdown-
Dateien und bestätigter Verlauf. Der geführte Ein-Datei-OCR-Lauf besteht
Vertagen/Neustart/Wiederaufnahme, verwirft eine ungespeicherte Korrektur und
veröffentlicht nach zwei OCR- und einer Personenentscheidung korrekt maskiertes
Ergebnis; eine manuelle Freigabe, kein KI-Export dieses Laufs.

Ein anschließender frischer C1-Lauf stoppt schon vor der ersten Datei an
OWNERSHIP_CONTROL_BUSY. Alle drei Quellen bleiben pending/sealed. Daher weder
Datenschutz-PASS noch funktionale Gesamtabnahme. Zwei zusätzlich beobachtete
P3-Anzeigelücken sind als kumulativer unangewandter Delta vorbereitet. Belege:
`dist/rc163-r5-lease-completion-20261018/{FRESH-FAST-SUCCESS,GUIDED-RESUME,C1-UNSTARTED-FAILURE}.json`.
Vier geschlossene Originalprotokolle dort erhalten, Ergebniseinstellung normal
wiederhergestellt und eigene App beendet. Neuer 254+7-Gesamtlauf nach Korrektur
des zentralen Native-Test-Einstiegs aktiv; Produktfingerprint unverändert.

## Echte Folgerunde 04:25 UTC – noch keine Abnahme

Der nächste gebundene Stand `0f47c66c…` bestand 208 Rusttests, Clippy und
Release. ZIP-SHA256 `3f58aac9f153c05479d3f58d239369a4f56dffa75f43586d147f1c176c74a3d0`.
Normaler Explorerstart und Konfiguration erfolgreich. Die ausdrückliche
Fortsetzung des eigenen Schnellwegs übernimmt die bereits veröffentlichte CSV
bytegleich und erstellt TXT. Das OCR-PNG bleibt aber nach Veröffentlichung
`processing/package_published/PROCESSING_INTERRUPTED`. Worker-Exit 0 ist
ausdrücklich kein vollständiger Laufabschluss. Eigene Sitzung und Diagnose
unter `dist/rc163-r5-sync-control-20261018/FAST-RESUME-GUI.json`.
Ursprüngliche Ergebniseinstellung per UI wiederhergestellt, App normal beendet.

Weitere bestätigte Quellenfehler und deren eng begrenzte Korrektur:

1. Die Dokumentkontrolle besaß dieselbe getrennte Release-Busy-Lücke. Store-
   Operationen verwenden jetzt den synchronen Helper. Genau drei native
   Export/Abandon/Resolve-Lebensdauern bleiben ausdrücklich asynchron.
2. Postcommit-Normalisierung verlor die ursprüngliche diagnostische Ursache;
   `BATCH_PUBLICATION_UNCONFIRMED` und `STANDALONE_PUBLICATION_INVALID` fielen
   zusätzlich aus dem Workflowkatalog. Private WeakMap erhält die Ursache nur
   zur geschlossenen Diagnose; `content_ack` markiert den Callback korrekt.
   Keine öffentlichen Fehlertexte/Stacks/Causes, keine Recoverylockerung.
3. Im Sourceadapter kann der logische Owner zwischen `EEXIST` und Beobachtung
   verschwinden. Nur nachweisliche Finalnamen-Kollision wird jetzt ausdrücklich
   `BATCH_ACTIVE_LOCK_BUSY`; begrenzter Retry liegt vor Aktion außerhalb Guard.
   Malformed/hidden/Prepared-/IO-/Closefehler bleiben nicht wiederholbar.
4. Die Corpus-Aufräumroutine löschte bei fehlgeschlagenem Hoststatus noch
   verwendete eigene Snapshots eines autonomen Workers und überschrieb den
   Primärfehler mit ENOENT. Fehlscope bleibt jetzt vollständig erhalten;
   Erfolgscleanup verlangt Quieszenz und beobachtetes Child-close. Der IPC-Test
   erhält ebenfalls feste öffentliche Fehlercodes und Fehldiagnosen.
5. Die Anzeige verwendete bei „Fortsetzung möglich“ ein Erfolgshäkchen.
   Nichtterminale Stop-/Prüf-/Pausenzustände tragen jetzt kein Fertig-Häkchen.

Grenzen: Der historische konkrete OS-Konkurrent ist nicht nachgewiesen.
Vollsuite dieses Stands endet bei 40/252 an verlorenem IPC-Fehlercode; kein
PASS. Der getrennte Corpus-Fehler war zuerst `STANDALONE_OPERATION_FAILED`;
seine nachfolgend durch Harness-Cleanup erzeugten 90 Snapshotfehler beweisen
keinen Produktdefekt. Ein zusätzlicher IPC-Versuch während der Korrekturrunde
lief in einen Publikations-Timeout; sein Scope `datasecure-review-ipc-WF3I9o`
bleibt erhalten. Ein späterer gezielter Erfolg ersetzt weder ihn noch den
neuen unveränderten Gesamtlauf. Die native Konkurrenzprobe bestätigt nach der
Dokumentkorrektur 17/17 (13 blockiert/4 erlaubt), einschließlich Aktion und
exakter Freigabe der echten synchronen Dokumentkontrolle.

## Anlass und direkter Quellenbefund

### Folgefreeze 6e5d, 18.10., 05:06 UTC

Eng begrenzte Quellengegenreviews haben zusätzlich Review-Release und drei
Review-Catches korrigiert. Pause-Control-Busy/Invalid werden exakt, nicht per
generischem Prefix, vor jeder Deferred-/Journalumdeutung weitergereicht.
Der Review-Parent projiziert ausschließlich geschlossene Diagnoseframes;
keine ACK-/Broker-/Terminalautorität. 40 Orchestrator- und 86 Startupfälle
plus 3 Diagnoseproben grün. Main hat die tatsächlichen neuen Aufrufer und
Kontrollgrenzen gelesen. Kein neuer bestätigter Delta-P1/P2 im Gegenreview;
dies ist keine Behauptung vollständiger Fehlerfreiheit.

Der echte native Dokument-Async-Konkurrent erzeugt beobachtetes Kernel-Busy,
nicht injiziertes Busy: 20 Proben, 14 blockiert/6 erlaubt, Aktion einmal und
identische Epoche nach dem Backoff freigegeben. Enges Produktmodul-Delta:
101 Persistenz-/Recoveryfälle plus 50 automatische Datenschutzfälle grün.

Neuer Quellfingerprint `6e5d75478ff62a3700b653a74c38240d28b13da9af52515803471fbf3111bd77`.
Unveränderter nativer Gesamtbuild grün: 208 Rusttests, Clippy und Release.
ZIP SHA256 `da0834d1c41f80d7cee0f637545f89a248040c03c3acdda2ae04b7ce3d26d8cc`;
genau 1141 Dateien, lokale EXE und ZIP/Staging bytegebunden. Belege unter
`dist/rc163-r5-review-control-20261018/`. Der ältere c76b-Lauf darf wegen
Quell-/Prüfinputänderung nicht als Gesamtnachweis verwendet werden.

Lokale create-only Quellenkopie: 835 tatsächliche Quellen-/Prüf-/Builddateien,
7.401.891 ZIP-Bytes, SHA256 `6d077894719c978634ebb58a330f73df686d83640bba7568d70fada539ae71e8`.
Alle Archivmitglieder gegen die erfassten Bytes geprüft. Keine Nutzerdaten,
kein Git-Commit/Push und kein Mac-Build. Paketgates, erneute komplette
Headless-Runde und reale GUI-Fälle noch nicht abgeschlossen.

Der echte Explorer-Test des vorherigen `dc11477b…`-Pakets scheiterte beim
Schnellweg mit OCR, ohne Pauseklick. Eine Pause-Steuerungssperre blieb beim
lebenden Sidecar zurück. Getrenntes Acquire/Aktion/Release kann zwischen Aktion
und Release den gemeinsamen Kernelguard an einen Konkurrenten verlieren.
Das beobachtete Fehlerpaar und der verwaiste Live-Owner passen zu diesem
reproduzierten Mechanismus. Welcher Konkurrent im historischen Lauf gewann,
ist damit nicht nachträglich bewiesen.

## Umsetzung und Erhalt der Grenzen

- `withSynchronousActiveLock(token, action)` hält Acquire, ausschließlich
  synchrone Aktion und exakte eigene Freigabe unter derselben Capability.
- Pause, Executor-Lease, Fortsetzen, Recovery/Expiry, lokale Finalisierung,
  OCR-Kontakt-Opt-out und Zero-Day-Abschluss nutzen diese Transaktion.
- Kein Await, kein Action-Replay nach Eintritt, keine Adoption anhand PID,
  kein Entfernen neuerer oder fremder Owner. Async-Verarbeitung behält ihren
  getrennten Lebensdauervertrag. Kernel-Busywartung liegt außerhalb der
  Capability; logische Publikation/Freigabe hat genau einen Versuch.
- Primärfehler bleiben erhalten. Sekundäre Cleanupfehler werden nur als
  geschlossenes, inhaltsfreies Diagnoseereignis beobachtet.
- Native Factory-Komposition verweigert fehlendes Wiring; der explizite
  Legacy-/Quelladapter ist kein nativer Fehlerfallback.
- Abschlussdaten sind an Lauf, aktuelle Generation, Verbindung und
  Dokumentrevision gebunden. Erwartete OCR-aus-Auslassungen und Datenschutz-
  Stopps bleiben sichtbare Hinweise, erhalten aber keine Freigabe.
  Gespeicherter Abschlussbeleg ist keine erneute Byteprüfung der Kopie.

## Gegenprüfung vor dem neuen Quellfreeze

Zwei begrenzte unabhängige KI-Quellenreviews (keine zertifizierten externen
Fachpersonen) prüften die Aufrufer/Fehlerübergänge und die native OS-Grenze.
Kein weiterer bestätigter P1/P2 im geprüften Delta. Das ist keine Garantie
vollständiger Fehlerfreiheit oder eines erfolgreichen Zielgerätetests.

Main hat zusätzlich die tatsächlichen Quellen und das Factory-Wiring gelesen.
Paket-Node 22.23.2: Active-Lock 30/30, Pause-Control 21/21, Delivery 23/23,
Gateway-Integration einschließlich Zero-Day 50/50; Workspace 244/244,
Workflow-Anzeige 44/44, Dokumentprüfer 89/89, Worker-Orchestrierung 6/6.
Die native C-Zweiprozessprobe besteht 14/14 Prüfungen (11 blockiert, 3 nach
Freigabe erlaubt); exakte eigene Fixtures bereinigt. Nichts davon ersetzt den
erneuten echten Windows-Schnellweg und die Bedienprüfung des neuen Pakets.

## Noch zu binden und auszuführen

Neuer unveränderter Quell-/Prüfinput-Freeze, vollständige Headless-Suite,
Cargo/Clippy/Release, create-only ZIP und Paketprüfung liegen unter
`dist/rc163-r5-sync-control-20261018/`. Bis zu ihren jeweiligen Abschluss-
dateien und dem separaten GUI-Nachweis besteht keine neue Gesamtabnahme.
Insbesondere der vorherige 172/251-Lauf mit anschließendem VM-Harnessfehler
und der getrennte 79/79-Restlauf ergeben zusammen kein vollständiges PASS.

## Explizite macOS-Grenze

Die Produktion verwendet noch das externe native Modul. Die zertifikatsfreie
Static-Core-Integration ist ein unangewandtes Delta; ihre korrigierte
Consumer-Kopie liegt unter `dist/mac-static-core-integration-delta-tdz-20261018/`.
Der frühere TDZ wurde darin reproduziert und korrigiert, nicht stillschweigend
als produktiv behoben ausgegeben. Consumer und Producer brauchen gemeinsam
echte ARM-/Intel-Builds, überprüfte Artefaktpins, finales ad-hoc-Sealing vor
Cargo, unveränderte Bytes bis ZIP/DMG und native Konkurrenz-/Startnachweise.
M2 später. Keine Lockerung von Library Validation, Gatekeeper oder anderen
OS-Schutzfunktionen; kein Developer-ID-Nachweis behauptet.
