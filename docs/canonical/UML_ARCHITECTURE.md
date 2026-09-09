# UML-Sicht auf die aktuelle DataSecure-Architektur

Stand: 10.09.2026 · 3.2.0-rc132

Die Abschnitte 1 bis 10 bilden den tatsächlich implementierten Pluginpfad ab.
Abschnitt 11 trennt den implementierten Standalone-Vertikalschnitt von weiterhin
offener Implementierung und Zielhostevidenz; eine als offen bezeichnete Kante ist kein Implementierungsbeleg.
Die aktuelle Produkt-/Zweckmatrix steht in
[`TARGET_ARCHITECTURE.md`](TARGET_ARCHITECTURE.md#aktuelle-fähigkeiten-nach-produkt-und-zweck).
Dieses Dokument ist
eine Navigations- und Prüfsicht auf `mcp-server.js`, die getrennten Worker, die
Batch-Module, den lokalen Review, die Ergebnisprojektion und die Diagnose. Der
normative Produktvertrag bleibt in `PRODUCT.md`, `DECISIONS.md` und den
Einzelverträgen unter `contracts/`.

RC109: Die produktunabhängigen Verträge für nächste Stapelaktion,
Konverterkommunikation und Ergebnisgrad liegen in `server/core/`.
MCP- und Standaloneadapter konsumieren dieselbe Implementierung; frühere
Importpfade sind nur Reexports. Die nachstehenden Batch-/Worker-Kanten sind
dadurch noch keine vollständig entkoppelte Application API: Verifikation mit
Dateizugriff und öffentliche Antwortprojektion bleiben teilweise komponiert.

## 1. Systemkontext

```mermaid
flowchart LR
  U[Anwender] -->|natürlicher Auftrag oder Skill| C[Claude Cowork in Desktop]
  C -->|JSON-RPC über stdio; keine Originalbytes| M[Lokaler DataSecure MCP]
  M -->|OS-Datei- und Ordnerdialog| U
  M --> W[Lokale DataSecure Worker]
  W --> P[(Privater DataSecure-Zustand)]
  W --> R[Lokale Sammelprüfung]
  R --> U
  W --> O[(Gewählter Ordner / DataSecure-Output)]
  C -.->|MCP: nur auf späteren ausdrücklichen Wunsch| H[Verifiziertes anonymisiertes Markdown]
  O --> H
```

Originale, private Snapshots, Reviewtext, Mappings, Pfade und Dateinamen bleiben
außerhalb der Modellgrenze. Der Originalweg setzt den nach DS-078 zugelassenen
lokalen Claude-Host mit verbundenem Plugin-MCP voraus; eine vom Hersteller
angebotene Desktop-Brücke erweitert diese Produktfreigabe nicht automatisch.
Die normale Übergabe an Cowork bestätigt nur den
lokalen Worker-Hand-off; sie ist kein Abschlussnachweis.
Die eingezeichnete Sammelprüfung besitzt einen Windows-Sammeladapter und einen
einzelnen scrollbaren AppKit-Mac-Sammeldialog. Der macOS-Abschlussadapter meldet
erst nach einem sichtbaren Fenster `SHOWN`. Native Intel-/ARM-Ausführung,
Fokus, Accessibility und Bedienverständlichkeit sind noch Zielhostnachweise
(BL-012.9/10, BL-012.2/041.10), keine weitere Dialogarchitektur. Reine
Standalone-Markdown-Konvertierung nutzt keine PII-Prüfung.
Liegt `DataSecure-Output` in einem mit Cowork verbundenen Arbeitsordner, kann
der Host die dort sichtbaren Dateien entsprechend seiner Ordnerberechtigung
lesen. DataSecure steuert nur seine MCP-Rückgaben, nicht den danach möglichen
Dateizugriff des Hosts.

## 2. Komponenten und Verantwortungen

```mermaid
flowchart TB
  Source[(Originalquellen<br/>nur lesen, niemals löschen)]
  subgraph ClaudeHost[Claude Desktop / Cowork]
    Skill[Skill-Anweisung]
    Client[MCP-Client]
  end

  subgraph Plugin[DataSecure Plugin]
    Bootstrap[Fail-closed Bootstrap]
    MCP[MCP-Protokoll und Tool-Fassade]
    Args[Kataloggebundene Eingabevalidatoren<br/>vor jeder bekannten Toolaktion]
    Picker[Datei- und Ordnerpicker]
    Guard[Startup- und Runtime-Gates]
    Cache[Durable Runtime Cache]
    Exec[Executor, Reservation und Lease]
    Batch[Batch-Fassade]
    Parser[Begrenzter Parserprozess<br/>network-deny]
    PII[PII-Engine und Residual-Gate]
    Review[Review-Orchestrator]
    ReviewUI[Separate lokale Review-UI<br/>Rohtext nur über stdin]
    Package[(Verifizierter Package Store)]
    Mapping[(Mapping und Mapping-Outbox)]
    Export[(Sichtbarer Export und Export-Outbox)]
    Diag[Inhaltsfreie Diagnose]
  end

  Skill --> Client --> Bootstrap --> Guard --> MCP
  Guard --> Cache
  MCP --> Args
  Args --> Picker
  Args --> Exec
  Exec --> Cache
  Exec --> Batch
  Source -->|O_RDONLY; identitätsgebundener Snapshot| Batch
  Batch --> Parser --> PII
  PII -->|klar| Package
  PII -->|mehrdeutig; zunächst alle Dateien analysieren| Review
  Review --> ReviewUI --> Review
  Review --> Package
  Package --> Mapping --> Export
  MCP --> Diag
  Exec --> Diag
  Batch --> Diag
```

`batch.js` ist eine Kompositionsfassade. Journal, Recovery, Review, Mapping,
Delivery, Locks und Ergebniszugriff sind in eigenständige Gateway-Module
zerlegt. Eine Debug-Variante darf diese Verarbeitung nicht duplizieren.
Ein freigegebenes internes Paket, ein abgeschlossenes Mapping und eine sichtbare
Exportkopie sind drei verschiedene Zustände.

## 3. Deployment und Dateisystem

```mermaid
flowchart TB
  subgraph Ephemeral[Kurzlebiger Claude-Pluginordner]
    Zip[Installiertes Plugin]
    Entry[MCP-Startdatei]
  end

  subgraph Stable[Stabiler lokaler Anwendungsdatenbereich]
    Runtime[Versionierter Runtime-Cache]
    Settings[Einstellungen]
    Journals[Batch-Journale und private Snapshots]
    Diagnostics[Inhaltsfreie immutable JSON-Ereignisse<br/>historisches JSONL nur lesbar]
    Mapping[Lokales Mapping]
  end

  subgraph UserChosen[Einmal gewählter Ergebnisstamm]
    Output[DataSecure-Output]
  end

  Zip --> Entry --> Runtime
  Runtime --> Journals
  Runtime --> Diagnostics
  Settings --> Output
  Journals --> Mapping
  Journals -->|nur freigegebenes Markdown| Output
```

| Plattform | Produktdatenstamm | Nicht als Windows-Produktpfad verwenden |
|---|---|---|
| Windows | `%LOCALAPPDATA%\SecureDataMsg`; bei eindeutigem Claude-Temporärwert das vorhandene reguläre `%USERPROFILE%\AppData\Local\SecureDataMsg` | `%APPDATA%\SecureDataMsg`, `%USERPROFILE%\.local\share\SecureDataMsg` |
| macOS | `~/Library/Application Support/SecureDataMsg` | Windows- und XDG-Pfade |
| Linux/POSIX | `${XDG_DATA_HOME:-~/.local/share}/SecureDataMsg` | Windows-Pfade |

Die beiden vom UAT genannten, nicht existierenden Windows-Kandidaten
`%USERPROFILE%\.local\share\SecureDataMsg` und `%APPDATA%\SecureDataMsg` sind
weder erforderlich noch Schreibziel des Windows-Produktpfads. `.local/share`
ist ausschließlich der POSIX-Fallback; `APPDATA` wird nur an Kindprozesse
weitergereicht, weil der Host ihn bereitstellen kann.

## 4. Sequenz: normaler Cowork-Start

```mermaid
sequenceDiagram
  actor U as Anwender
  participant C as Cowork
  participant M as lokaler MCP
  participant F as OS-Picker
  participant W as Intake-Worker
  participant J as Batch-Journal
  participant P as Package/Mapping
  participant O as DataSecure-Output

  U->>C: Dateien anonymisieren
  C->>M: start_document_batch_from_picker
  alt noch kein Ergebnisstamm konfiguriert
    M->>F: Ergebnisordner einmalig wählen
    U->>F: Ordner bestätigen
    F-->>M: lokale Pfadwahl
  end
  M->>F: Quellen wählen
  U->>F: Dateien oder Ordner bestätigen
  F-->>M: lokale Quellen
  M->>W: private IPC-Übergabe
  W-->>M: Empfangs-ACK local-intake-accepted
  M-->>C: Hand-off bestätigt; noch kein Checkpoint/Abschluss
  W->>J: Snapshot und Checkpoint
  W->>W: lokal analysieren und prüfen
  opt Mehrdeutigkeiten nach Analyse des gesamten Stapels
    W-->>U: eine lokale Sammelprüfung
  end
  W->>P: interne Pakete, Mapping und terminale Evidenz
  alt Stapel terminal vollständig
    P->>O: freigegebenes Markdown exklusiv und atomar projizieren
  else Export vorübergehend nicht möglich
    P->>P: Export-Outbox bleibt fortsetzbar
  end
  W-->>U: lokaler Abschluss- oder Fortsetzungshinweis
```

Zwei Dialoge sind nur beim ersten erfolgreichen Einrichten erwartbar: zuerst
der dauerhafte Ergebnisstamm, danach die Quelle. Jeder spätere normale Lauf
öffnet nur die Quellauswahl. Ein dritter Dialog oder das erneute Öffnen der
Quelle ohne neuen Nutzerauftrag ist ein Fehler.
Vor jeder erstmaligen Ergebnisordnerwahl prüft der MCP Betriebsbereitschaft und
aktive Verarbeitung; ein Lauf, der nicht starten kann, darf keinen Setupdialog
öffnen.

## 5. Aktivitätsdiagramm der Verarbeitung

```mermaid
flowchart TD
  A([Start]) --> B{Startup und Runtime gültig?}
  B -- nein --> X[Fail-closed stoppen und festen Code protokollieren]
  B -- ja --> C{Ergebnisstamm vorhanden?}
  C -- nein --> D[Einmalige lokale Ordnerwahl]
  C -- ja --> E[Lokale Quellauswahl]
  D --> E
  E --> F{Gesamter Stapel zulässig?}
  F -- nein --> X
  F -- ja --> G[Identitäts- und hashgebundene Snapshots]
  G --> H[Durabler Checkpoint]
  H --> I[Serielle Verarbeitung mit begrenzten Parser-/OCR-Prozessen]
  I --> J{Dateiergebnis}
  J -- klar --> K[Internes Paket veröffentlichen]
  J -- fachlich mehrdeutig --> L[deferred_review]
  J -- fachlich/inhaltlich sicher nicht freigebbar --> M[Diese Datei terminal sicher stoppen]
  J -- technisch fortsetzbar --> T[retryable, mapping_pending oder delivery_pending]
  K --> N{Weitere Dateien?}
  L --> N
  M --> N
  T --> N
  N -- ja --> I
  N -- nein --> O{Fortsetzbare technische Schuld?}
  O -- ja --> V[Durabel anhalten; ausdrückliche Fortsetzung]
  O -- nein --> W{Review offen?}
  W -- ja --> P[Eine lokale Sammelprüfung automatisch öffnen]
  W -- nein --> R[Terminale Evidenz und sichtbaren Export versuchen]
  P --> Q[Entschiedene Dokumente veröffentlichen]
  Q --> R
  R --> S[Abschluss bzw. konkreten nächsten Schritt anzeigen]
```

## 6. Getrennte Zustandsmodelle

### 6.1 Persistierter Zustand einer Dokumentposition

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> processing: Position beansprucht
  pending --> stopped: Preflight stoppt ohne Snapshot
  processing --> released: Paket, Mapping und Delivery bestätigt
  processing --> deferred_review: fachliche Mehrdeutigkeit
  processing --> retryable: technische Unterbrechung
  processing --> preflight_mapping_pending: Stop-Mapping offen
  processing --> mapping_pending: Paket vorhanden, Mapping offen
  processing --> delivery_pending: Paket vorhanden, Delivery offen
  processing --> stopped: terminales Sicherheitsgate
  deferred_review --> released: lokale Entscheidung und Veröffentlichung
  deferred_review --> stopped: lokale Entscheidung gegen Freigabe
  deferred_review --> deferred_review: vertagt oder abgebrochen
  retryable --> pending: ausdrückliche Fortsetzung
  preflight_mapping_pending --> stopped: Mapping repariert
  mapping_pending --> delivery_pending: Mapping repariert
  delivery_pending --> released: Delivery bestätigt
  released --> [*]
  stopped --> [*]
```

`stopped` ist erst mit dauerhaft vorhandenem erforderlichem Mapping terminal.
Ein noch gesetztes `local_mapping_exported: false` zählt zur Mappingreparatur
und nicht zu abgeschlossenen Positionen.

### 6.2 Abgeleitete öffentliche Stapelphase

```mermaid
flowchart LR
  Items[(persistierte Item-Status)] --> Projection[batch-progress Projektion]
  Lease[(Executor-Lease)] --> Projection
  Evidence[(terminale Evidenz)] --> Projection
  Projection --> Active[processing_local_batch / processing_local_document]
  Projection --> Review[awaiting_local_review]
  Projection --> Repair[awaiting_local_mapping_repair]
  Projection --> Resume[awaiting_explicit_resume]
  Projection --> Delivery[awaiting_delivery_acknowledgement]
  Projection --> Ready[ready_for_next_document]
  Projection --> Complete[complete]
  Projection --> Invalid[invalid_local_state]
```

`batch_phase` wird nicht als unabhängiger Zustand gespeichert. Sie wird bei
jeder Abfrage aus Item-Status, Executor-Lebendigkeit und terminaler Evidenz
berechnet. `reserved` ist wiederum eine kurzlebige Intake-/UI-Reservation und
gehört in kein persistiertes Item-Zustandsdiagramm. Ein Stapel ist nicht deshalb
vollständig, weil der MCP-Aufruf geantwortet hat.
`completed` zählt `released + stopped` für terminale Positionen; Ergebnis- und
Fehlerzahlen bleiben separat. `awaiting_local_review` setzt offene Reviewpositionen
und zugleich null verbleibende, verarbeitende, wiederholbare, Delivery- und
Mappingpositionen voraus. `batch-next-action.js` teilt diesen Vertrag mit beiden
Produktadaptern, Reviewplanung und automatischem Reviewübergang. Fehlende Zähler
belegen keine Bereitschaft. Außerdem müssen terminale plus Reviewpositionen
den gesamten Stapel abdecken. Unbekannte Itemzustände sind
`invalid_local_state`, niemals ein ausgelassener Rest mit Reviewfreigabe.

### 6.3 Globale Ownership-Invariante

```mermaid
flowchart LR
  Request[Start oder Fortsetzung] --> Reserve{globale Reservation frei?}
  Reserve -- nein --> Refuse[ohne Dialog fail-closed ablehnen]
  Reserve -- ja --> Lease{Executor-Lease beanspruchbar?}
  Lease -- nein --> Release[Reservation freigeben und stoppen]
  Lease -- ja --> One[genau ein Intake-, Batch- oder Review-Executor aktiv]
  One --> Durable[Checkpoint / terminaler Zustand]
  Durable --> Unlock[Lease und Reservation freigeben]
```

Mehrere pausierte Stapel dürfen existieren; gleichzeitig aktiv sein darf nur
eine lokale Aufnahme, Stapelverarbeitung oder Prüfung. Executor-Leases binden
deshalb PID und gehashte Betriebssystem-Startidentität: eine nachweislich
wiederverwendete PID ist kein lebender Eigentümer, eine nicht sicher
beobachtbare Identität blockiert dagegen fail-closed.

## 7. Review- und Fortsetzungssequenz

```mermaid
sequenceDiagram
  actor U as Anwender
  participant C as Cowork
  participant M as MCP
  participant W as lokaler Batch-/Review-Worker
  participant UI as lokale Review-UI
  participant J as Journal

  alt automatischer Lauf hat alle technische Arbeit abgeschlossen und Review ist bereit
    W->>W: gemeinsamer Readinessvertrag erlaubt Sammelreview
  else zuvor vertagt, abgebrochen oder neu gestartet
    U->>C: letzten Stapel fortsetzen
    C->>M: continue_most_recent_document_batch
    M->>J: Zustand erneut prüfen, unterbrochene Positionen fortsetzbar machen
    M->>M: batchNextAction aus vollständigem Fortschritt
    alt automatische Arbeit einschließlich Delivery oder Mapping offen
      M->>W: Batch-Worker starten; Token nur über private IPC
      W-->>M: lokales Empfangs-ACK
      M-->>C: Fortsetzung angenommen, noch kein Abschluss
      W->>J: offene automatische Arbeit abschließen
      W->>W: nur bei gemeinsamer Reviewbereitschaft automatisch weiter
    else nur Reviewentscheidungen offen
      M->>W: Review-Worker starten; Token nur über private IPC
      W-->>M: local-review-accepted
      M-->>C: lokale Übernahme bestätigt; noch kein UI-/Abschlussnachweis
    end
  end
  opt Review bereit
    W->>J: ausschließlich offene Reviewpositionen rekonstruieren
    W->>UI: Rohtext nur über stdin
    U->>UI: behalten, anonymisieren, vertagen
    UI-->>W: strukturierte lokale Entscheidungen
    W->>J: atomare Zustandsänderung
  end
  W-->>U: Abschluss oder sichere Vertagung
```

Der ausdrücklich aktivierte Supportweg `review_deferred_document_batch` nutzt
ebenfalls diesen festen, netzwerkgesperrten Worker. Die MCP-Seite liest nur den
Metadatenstatus des angegebenen Stapels; sie rekonstruiert keinen Rohtext.
`batchReviewCanPrepare` lässt zusätzlich vollständig gezählte Reparaturpositionen
zu (Veröffentlichung, Zuordnung oder unterbrochene Verarbeitung), wenn keine
Pending-/Retryposition und kein aktiver Worker vorliegt. Das ist **keine**
Reviewbereitschaft: Der Worker repariert unter seinem exklusiven Lock und prüft
danach `batchReviewReady` erneut. Ein unvollständig rekonstruierbarer Zustand
bleibt gesperrt. Er springt niemals zum jüngsten anderen Stapel.
Die Supportantwort endet nach `local-review-accepted`; ein Timeout/Hostabbruch
belegt nur fehlende Bestätigung und darf keinen automatischen zweiten Start
auslösen. Die feste Werkzeugargumentstruktur bleibt unverändert.

## 8. Datenmodell der wesentlichen Artefakte

```mermaid
classDiagram
  class BatchJournal {
    schema
    token
    profile
    items[]
    pseudonym_registry_state
  }
  class BatchItem {
    id
    source_label
    size
    sha256
    work_name
    status
    checkpoint
    package_id
    error_code
  }
  class PrivateSnapshot {
    work_name
    private_artifact_plain
    identity_bound_bytes
  }
  class ReviewDraft {
    ephemeral_reconstruction
    findings
    pending_decisions
  }
  class ReleasedPackage {
    package_id
    document_sha256
    result_grade
    manifest
  }
  class VisibleExport {
    anonymized_markdown
  }
  class MappingRecord {
    local_source_label
    exported_result
  }
  class DiagnosticEvent {
    timestamp
    gateway_version
    run_id
    fixed_event
    fixed_error_code
    counters
  }

  BatchJournal "1" *-- "1..100" BatchItem
  BatchItem "1" --> "0..1" PrivateSnapshot
  BatchItem "1" ..> "0..1" ReviewDraft : nur im Reviewprozess
  BatchItem "1" --> "0..1" ReleasedPackage
  ReleasedPackage "1" --> "0..1" VisibleExport
  ReleasedPackage "1" --> "0..1" MappingRecord
  DiagnosticEvent ..> BatchJournal : nur zufällige run_id, kein Token
```

Diagnoseereignisse dürfen keine Quelllabels, Namen, Pfade, Tokens, Hashes,
Dokumenttexte oder Reviewentscheidungen enthalten. Ein zufälliges `run_id`
korreliert ausschließlich technische Phasen und ist keine Journalbeziehung.
`ReviewDraft` wird nicht persistiert, sondern bei Bedarf aus der privaten
Arbeitskopie rekonstruiert. Preflight-Stopps besitzen keine Arbeitskopie;
bereinigte terminale Positionen können sie bereits wieder entfernt haben.

## 9. Diagnose- und Debugsicht

```mermaid
flowchart LR
  Normal[Normaler Skill] --> Engine[Eine gemeinsame Engine]
  Debug[Manuell aktivierter Debug-Skill] --> Engine
  Engine --> Trace[Inhaltsfreie strukturierte Ereignisse]
  Trace --> Local[(Lokale immutable JSON-Ereignisdateien)]
  Debug --> Status[Sichere Diagnose anzeigen]
  Status -->|feste Codes, Phasen, Zähler| U[Supportanwender]
  Local -.->|nur nach ausdrücklicher Bestätigung| Export[Lokales Diagnosepaket]
```

Der Debug-Skill ist keine zweite Anonymisierung. Er wird nicht automatisch vom
Modell geladen, aktiviert den bereits vorhandenen lokalen Supportmodus und nutzt
dieselben Tools, Gates, Worker und Zustände. Das MCP-Protokoll ist JSON-RPC über
`stdio`, nicht REST. Rohes JSON-RPC darf wegen Tokens, Pfaden und Argumenten
nicht protokolliert werden; gespeichert wird nur eine geschlossene Projektion.

## 10. Aus der UML-Prüfung abgeleitete Befunde

1. **Pfadwahrheit:** Windows besitzt genau einen Produktdatenstamm unter
   `LOCALAPPDATA` beziehungsweise den DS-073-Fallback. Die POSIX- und
   `APPDATA`-Kandidaten dürfen in Windows-Diagnosen nicht als benötigte Ordner
   erscheinen.
2. **Erster Lauf:** Die Ergebnisordnerwahl vor der Quellauswahl ist technisch
   korrekt, aber ohne eindeutigen Dialogtitel leicht mit dem Eingabeordner zu
   verwechseln. Die lokale UI muss beide Zwecke unmissverständlich benennen.
3. **Übergabe ist nicht Abschluss:** IPC-Acceptance, Checkpoint,
   Verarbeitungsstart, Review und sichtbarer Export sind getrennte Ereignisse.
   Eine frühe Cowork-Antwort darf keinen fertigen Output behaupten.
4. **Supportaktivierung:** Der Server besitzt einen geschützten
   `EU_PRIVACY_SUPPORT_MODE`; die bewusst manuell aufrufbare Debug-Skill-
   Oberfläche und das eindeutig gekennzeichnete Supportpaket sind umgesetzt.
5. **Diagnosevollständigkeit:** Fach-, Workflow- und Supportdiagnose schreiben
   unveränderliche Einzelereignisse. Historische JSONL-Dateien werden nur noch
   als Upgradequelle gelesen. MCP-Toolgrenze, Ergebnisordnerwahl und
   Runtime-Projektion sind als zusammenhängende, inhaltsfreie Spur sichtbar.
6. **Mehrprozessschreiben:** Eltern-, Intake- und Review-Prozess können gleichzeitig
   Diagnoseereignisse erzeugen. Das frühere Lesen-und-Ersetzen einer einzelnen
   JSONL-Datei besaß ein Lost-Update-Risiko; alle drei Diagnosespuren verwenden
   deshalb jetzt dieselbe unveränderliche, mehrprozesssichere Ereignisspool-
   Komponente. Alters- und Mengengrenzen löschen die Einzeldateien physisch.
7. **Keine Diagnosewirkung:** Ein Fehler beim Protokollieren darf niemals eine
   Datenschutzentscheidung, Veröffentlichung oder Fortsetzung verändern.

8. **Exklusive Ergebnisprojektion:** Sichtbare Ergebnisse werden atomar ohne
   Überschreiben publiziert. Eine zwischen Prüfung und Veröffentlichung
   entstandene Benutzerdatei bleibt unverändert; der Export bleibt fortsetzbar.
9. **Begrenzte Protokollaufnahme:** Ein JSON-RPC-Frame ist vor dem Parsen auf
   1 MiB begrenzt. Ein übergroßer Frame wird vollständig bis zum nächsten
   Zeilenende verworfen; nachfolgende gültige Anfragen bleiben verarbeitbar.
10. **Evidencegrenzen:** Ergebnisstamm und sichtbarer Mischstapel sind durch
   DS-079/080 entschieden. Standalone bestätigt Rendering und zeigt passiven
   Fortschritt E0; Windows-Cowork bestätigt das native `Shown`-Ereignis.
   Plattformübergreifender Sammelreview und macOS-Sichtbarkeit stehen E0;
   echte Zielhostbeobachtungen bleiben eigenständige UAT-Lieferungen.

Die Punkte 4 bis 6 sowie 8 bis 10 sind als E0-Arbeitspakete umgesetzt. Punkt 2 bleibt als
beobachtbare UX-Abnahme zusätzlich offen; die technische Pfadtrennung selbst ist
bereits implementiert. Die unter Punkt 10 genannten Zielhostnachweise sind
bewusst nicht durch UML-Dokumentation vorgetäuscht, sondern im Backlog getrennt offen.

## 11. Implementierter UX- und Standalone-Vertikalschnitt

```mermaid
flowchart TD
  Home[Startseite: kein Zweck vorbelegt] --> Purpose[Eine von zwei Funktionen wählen]
  Purpose --> Pick[Vorbereitung: Quelle per Picker oder Drop / Ziel anzeigen]
  Pick --> Start[Expliziter Start]
  Start --> Work[Lokale Verarbeitung mit passivem Fortschritt]
  Work -->|nur Markdown| Converted[Markdown-Ergebnisse ohne Zuordnung bereitstellen]
  Work -->|Anonymisierung ohne offene Entscheidung| Map[Ergebnisse und laufbezogene Zuordnung gemeinsam bereitstellen]
  Work -->|Anonymisierung: automatische Arbeit fertig, Entscheidung offen| Review[Sammelreview]
  Review -->|entschieden| Map
  Review -->|vertagt oder abgebrochen| Paused[Nichtmodaler fortsetzbarer Status]
  Converted --> Done[Nichtmodaler Abschluss in der aktuellen Ansicht]
  Map --> Done
  Home --> History[Verlauf: letzte 20 Läufe]
  Done -.->|nur auf Anwenderaktion| History
  History -->|konkrete Zeile wählen| Open[Ergebnisse öffnen / Zuordnung anzeigen / fortsetzen]
```

- **Keine automatische Workspace-Vermutung:** Die MCP-Schnittstelle liefert
  keinen belastbaren Cowork-Arbeitsordner. DataSecure behält daher gemäß DS-080
  einen explizit vom Anwender gewählten geräte- und produktlokalen Standard,
  bindet dessen Identität beim Start an den Stapel und ändert ihn nur über die
  bewusste Einstellung „Ergebnisordner ändern“. Der dedizierte Ergebnisordner
  darf optional mit Cowork verbunden werden; DataSecure kann die Liste
  verbundener Cowork-Ordner nicht selbst prüfen. Es entsteht keine Rückfrage pro Datei,
  Lauf oder Projektwechsel.
- **Ein eindeutiger Abschluss:** Das Plugin verwendet seinen lokalen
  Abschlussadapter. Standalone bestätigt die Statusdarstellung im Hauptfenster
  über ein lauf- und generationsgebundenes ACK; es öffnet weder einen separaten
  Abschlussdialog noch automatisch einen `Lauf-*`-Ordner. Ausstehender Export
  bleibt als solcher sichtbar (DS-083/086).
- **Ein Review:** Das gemeinsame Reviewmodell bleibt plattformneutral; jeder
  freigegebene Zielhost benötigt nur einen lokalen Adapter, der alle offenen
  Entscheidungen in einer Oberfläche und mit einer Schlussfreigabe darstellt.
  Einzelne Dialoge je Treffer sind lediglich ein Engineering-Fallback und kein
  freigegebener Sollweg.
- **Sichtbarer Fortschritt ohne Interaktion:** Lange Stapel zeigen nur lokale,
  inhaltsfreie Zähler. Bereits eindeutige Ergebnisse bleiben intern dauerhaft;
  gemäß DS-079 entsteht der sichtbare Laufordner erst nach terminalem
  Gesamtstapel und abgeschlossenem erforderlichem Review.

Diese Sicht beschreibt zwei Endnutzerprodukte mit genau einem gemeinsamen
DataSecure-Core. Das Plugin übersetzt MCP-/Cowork-Aufrufe, Standalone übersetzt
lokale UI-Aktionen. Produktdaten und Handoffzustände bleiben strikt getrennt.

### Zwei gleichwertige Standalone-Modi – Implementierung DS-075/DS-085

Beide Zwecke sind im aktuellen Quellstand ausführbar. Der Startzweck durchläuft
`processingMode` → Rust → `processing_mode` → Service → Intake und Journal;
reine Konvertierung besitzt v5-Journale, eigene Worker-Nachrichten und
`dm_`-Artefakte ohne Privacy-Capabilities. Continue übernimmt ausschließlich
den gespeicherten Zweck. Tauri-Hülle, native Auswahl/Drop, Application-Service,
private gerahmte IPC und laufgebundene Historie sind implementiert. Vorhandene
Windows-Engineering-Pakete und Prozessstarts ersetzen keinen neuen
Releasekandidaten oder menschliche Windows-/macOS-Zielhostabnahme.

```mermaid
sequenceDiagram
  actor U as Anwender
  participant S as Standalone-UI
  participant A as Standalone-Adapter
  participant E as neutrale DataSecure-Application-API
  participant I as Admission/Snapshot
  participant M as lokaler Node-/OOXML-/PDF-/OCR-Worker
  participant P as PII/Residual-Gate
  participant V as Sammelreview und Export
  U->>S: Zweck ausdrücklich auf Start wählen
  U->>S: Dateien oder Ordner wählen
  S->>A: native Auswahl/Drop aufnehmen (ohne Start)
  A->>E: admit_selected_sources
  E-->>S: lokale Auswahlprojektion
  U->>S: vorbereiteten Stapel explizit starten
  S->>A: start_admitted_batch(processingMode)
  A->>E: dauerhafte Aufnahme starten
  E-->>S: Empfangs-ACK, noch kein Checkpoint oder Abschluss
  E->>I: prüfen und versiegelten Snapshot erzeugen
  I->>M: Snapshot-Bytes, gespeicherten Zweck und Format übergeben
  alt Markdown und anonymisieren: TXT/Markdown/CSV
    M->>P: Content Graph des unterstützten Anonymisierungsformats
    P->>V: geprüfte Kandidaten / Mehrdeutigkeiten
    opt nach automatischer Arbeit tatsächlich Review bereit
      V-->>U: lokale Sammelprüfung
      U->>V: Entscheidungen
    end
    V->>V: terminale MD und Zuordnung in DataSecure-Output
  else Markdown und anonymisieren: DOCX oder breite Standalone-Quelle
    M->>M: neutrale Extraktion ohne Artefakt oder Zweck
    alt Coverage bekannt und Markdown nichtleer
      M->>P: extrahiertes Markdown + separaten Extraktionsstatus
      P->>V: geprüfte Kandidaten / Mehrdeutigkeiten
      V->>V: terminale MD, Extraktionsstatus und direkte Zuordnung in DataSecure-Output
    else Coverage unbekannt, leer oder Quelle unsicher
      M-->>V: sicherer Einzelstopp ohne Rohkonvertat
    end
  else nur Markdown
    M->>V: erhaltene Originalinhalte und Coverage-/OCR-Hinweise
    V->>V: terminale MD ohne Zuordnung in DataSecure-Markdown
  end
  V-->>S: Status des konkreten Laufs ohne Ansichtswechsel
```

MarkItDown/Python ist nur ein optionales Engineering-Differentialorakel und
gehört nicht zur produktiven Sequenz. Im
Anonymisierungsmodus ist ein noch personenbezogenes Zwischenkonvertat kein
Ergebnisartefakt und wird nicht im sichtbaren Dateisystem abgelegt. Reine
Konvertierung speichert solche Inhalte dagegen ausdrücklich im getrennten,
als nicht anonymisiert gekennzeichneten Ausgabebaum (DS-085). Text-PDF und
Scan-Seiten werden automatisch unterschieden; OCR läuft lokal. Warnungen sind
Teil der Extraktionsidentität und des sichtbaren v4-Exports.

DS-087/090 bindet den DOCX-/breiten Standalone-Zweig an den gemeinsamen
Privacy-Core. DS-093 führt XLSX/PPTX im Cowork-Plugin über dessen bereits
ausgelieferten isolierten Office-Parser in denselben neutralen
Markdown-first-Vertrag; PDF, Scan-PDF und Bilder erreichen diesen Pfad dort
nicht. Die aktuelle reale Wide-Format-Coverage bleibt oft `incomplete`; sie
wird getrennt vom Anonymisierungsstatus geführt. Der
Sequenzzweig schützt den extrahierten Markdown-Inhalt in demselben Stapel und
gibt keine Freigabezusage für ausgelassene Bestandteile der ursprünglichen XLSX-,
DOCX-, PPTX-, PDF-/Scan-PDF- oder Bilddatei.

Recovery setzt den gespeicherten Modus fort; eine UI-Defaultwahl darf ihn nicht
ändern. Inhaltsfreie Diagnose dokumentiert Phase, Modus und Fehler, keine
extrahierten Originalinhalte. Keine rohen Zwischenkonvertate gelangen in den
Plugin-Handoff; ausschließlich erneut geprüftes anonymisiertes Markdown ist
später lesbar.

### Standalone-Abschluss, Export und Neustart

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> admitted: lokale Auswahl bestätigt
  admitted --> admitted: einzelne Datei entfernen
  admitted --> idle: Auswahl vollständig leeren
  admitted --> preparing: expliziter Start / Empfangs-ACK
  preparing --> processing: dauerhafter Stapelcheckpoint und Worker aktiv
  processing --> review_required: automatische Arbeit beendet / Review bereit
  processing --> export_pending: intern fertig / sichtbarer Export offen
  review_required --> export_pending: Review abgeschlossen / Export offen
  export_pending --> completed: sichtbarer Export vollständig
  admitted --> idle: Sidecar-Neustart / IPC-Fehler / Admission verloren
  processing --> stopped: sicherer Fehler oder Abbruch
  stopped --> processing: konkrete Fortsetzung / automatische Arbeit offen
  stopped --> review_required: konkrete Fortsetzung / nur Review offen
```

Der Standalone-Status beobachtet den aktiven oder ausdrücklich ausgewählten Lauf
auch nach dessen Abschluss. Nur ohne solche Bindung ist der jüngste Stapel des
eigenen Produktkanals der Standard. Eine historische Fortsetzung darf daher
keinen neueren Lauf, dessen Zweck oder dessen Zähler übernehmen. Ein interner Paketabschluss ist kein sichtbarer
Erfolg. Offene Exporte werden beim Standalone-Start und nach einer bewussten
Ergebnisordnerwahl erneut versucht; der Zielordner ist vor dem ersten Teilexport
identitätsgebunden. Standalone-Worker öffnen keine Cowork-Dialoge. Die Tauri-UI
verwirft eine lokale Aufnahmefreigabe, sobald der Sidecar die Admission nicht
mehr kennt. Exklusiver Outbox-Claim und laufgebundenes Öffnen sind E0
geschlossen. Der plattformübergreifende Nachweis einer tatsächlich sichtbaren
Abschlussoberfläche bleibt zusammen mit der Zielhostbeobachtung im Backlog.
Unter Standalone umfasst `completed` alle Ergebnisdateien und bei
Anonymisierung zusätzlich `DataSecure-Zuordnung.csv`. Vor dem Start bindet ein
v6-Journal die gewählte Benennung (neutraler Standard oder Quellbasis mit
`-anonymisiert`) unveränderlich bis Export und Wiederaufnahme. Reine Konvertate behalten
ihren Quellbasisnamen und erzeugen keine Zuordnung; beim Plugin bleibt die
Zuordnung außerhalb des Cowork-Ergebnisordners. Beim Laden des lokalen UI-Kontexts repariert der Core
eine noch alte oder unvollständige sichtbare Projektion aus dem zugehörigen
privaten Journal. Für eine Öffnungsaktion liefert der Core das exakte Ziel nur
über den privaten Sidecar→Rust-Kanal. Rust prüft Pfad, Dateityp und Linkfreiheit,
startet Explorer/Finder/`xdg-open` ausdrücklich sichtbar und gibt an den
Renderer ausschließlich die inhaltsfreie Übergabebestätigung zurück.

```mermaid
sequenceDiagram
  participant UI as lokaler WebView-Renderer
  participant R as Tauri/Rust-Host
  participant S as privater Sidecar
  participant C as DataSecure-Core/Export
  participant OS as Explorer/Finder/xdg-open
  UI->>R: Verlauf öffnen
  R->>S: get_run_history
  S->>C: eigene Journale und lokale Laufmetadaten
  C-->>S: kanalgebundene Laufdaten
  S-->>R: letzte 20 Läufe (Datum, Zweck, Zähler, Status)
  R-->>UI: validierte lokale Verlaufsprojektion
  UI->>R: Ergebnisordner einer Zeile (batchId)
  R->>S: resolve_history_results(batch_id)
  S->>C: konkreten Lauf und ursprüngliches Exportziel auflösen
  C->>C: Identität, Existenz und Abschluss erneut prüfen
  C-->>S: exakter Laufpfad
  S-->>R: privates absolutes Ziel
  R->>R: Existenz, Typ, Linkfreiheit prüfen
  R->>OS: sichtbarer nativer Öffnungsauftrag
  R-->>UI: handoff_confirmed (ohne Zielpfad)
```

DS-086 trennt **Navigation** und **Verarbeitungszustand**. Start öffnet immer
die Startseite, die Betriebsart ist zunächst leer. Weder Abschluss noch
wiederhergestellte Auswahl wechseln automatisch die Ansicht. Der Verlauf
enthält höchstens 20 Zeilen, neueste zuerst; die Daten werden dadurch nicht
gelöscht. Historienaktionen verwenden nur die konkrete Laufkennung. Fortsetzung
prüft erneut Journal, gespeicherten Zweck und die Sperre für einen aktiven
Stapel; ein nicht mehr fortsetzbarer Eintrag startet niemals einen anderen Lauf.
