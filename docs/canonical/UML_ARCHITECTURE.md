# UML-Sicht auf die aktuelle DataSecure-Architektur

Stand: 04.09.2026 · Produktstand 3.2.0-rc98

Die Abschnitte 1 bis 10 bilden den tatsächlich implementierten Pluginpfad ab.
Abschnitt 11 kennzeichnet das UX-Zielbild und die Standalone-Sequenz ausdrücklich
als Zielarchitektur; eine dargestellte Kante ist dort kein Implementierungsbeleg.
Dieses Dokument ist
eine Navigations- und Prüfsicht auf `mcp-server.js`, die getrennten Worker, die
Batch-Module, den lokalen Review, die Ergebnisprojektion und die Diagnose. Der
normative Produktvertrag bleibt in `PRODUCT.md`, `DECISIONS.md` und den
Einzelverträgen unter `contracts/`.

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
außerhalb der Modellgrenze. Die normale Übergabe an Cowork bestätigt nur den
lokalen Worker-Hand-off; sie ist kein Abschlussnachweis.
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
  MCP --> Picker
  MCP --> Exec
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
  H --> I[Adaptiv begrenzte Verarbeitung]
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
  retryable --> processing: ausdrückliche Fortsetzung
  preflight_mapping_pending --> stopped: Mapping repariert
  mapping_pending --> delivery_pending: Mapping repariert
  delivery_pending --> released: Delivery bestätigt
  released --> [*]
  stopped --> [*]
```

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
eine lokale Aufnahme, Stapelverarbeitung oder Prüfung. Prozessabsturz und
PID-Wiederverwendung bleiben deshalb besonders prüfpflichtige Lease-Grenzen.

## 7. Review- und Fortsetzungssequenz

```mermaid
sequenceDiagram
  actor U as Anwender
  participant C as Cowork
  participant M as MCP
  participant W as Review-Worker
  participant UI as lokale Review-UI
  participant J as Journal

  alt erster automatischer Lauf erreicht deferred_review
    M->>W: derselbe lokale Worker setzt direkt in Sammelreview fort
  else zuvor vertagt, abgebrochen oder neu gestartet
    U->>C: letzten Stapel fortsetzen
    C->>M: continue_most_recent_document_batch
    M->>W: Batch-Token nur über private IPC
    W-->>M: local-review-accepted
    M-->>C: lokale Prüfung gestartet
  end
  W->>J: offene Positionen rekonstruieren
  W->>UI: Rohtext nur über stdin
  U->>UI: behalten, anonymisieren, vertagen
  UI-->>W: strukturierte lokale Entscheidungen
  W->>J: atomare Zustandsänderung
  W-->>U: Abschluss oder sichere Vertagung
```

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
10. **Offene Produktverbesserungen:** Stapelgebundener statt nur globaler
   Ergebnisstamm, sichtbare Teilresultate bei vertagtem Review, echte
   plattformübergreifende Sammelprüfung, bestätigte Sichtbarkeit der
   Abschlussoberfläche und passive Fortschrittsanzeige benötigen jeweils eine
   eigene Architektur- und UAT-Lieferung.

Die Punkte 4 bis 6, 8 und 9 sind als E0-Arbeitspakete umgesetzt. Punkt 2 bleibt als
beobachtbare UX-Abnahme zusätzlich offen; die technische Pfadtrennung selbst ist
bereits implementiert. Die unter Punkt 10 genannten Änderungen sind bewusst
nicht durch UML-Dokumentation vorgetäuscht, sondern im Backlog getrennt offen.

## 11. Zielarchitektur: UX und Standalone

```mermaid
flowchart LR
  Start[Dateien anonymisieren] --> Pick[genau eine Quellauswahl]
  Pick --> Work[stille lokale Verarbeitung mit passivem Fortschritt]
  Work -->|alles eindeutig| Done[ein Abschlussfenster]
  Work -->|Entscheidung nötig| Review[ein Sammelreview]
  Review --> Done
  Done --> Open[aktuellen Laufordner öffnen]
```

- **Keine automatische Workspace-Vermutung:** Die MCP-Schnittstelle liefert
  keinen belastbaren Cowork-Arbeitsordner. DataSecure behält daher einen explizit
  vom Anwender gewählten Standard, bindet dessen Identität beim Start an den
  Stapel und ändert ihn nur über die bewusste Einstellung „Ergebnisordner
  ändern“. Es entsteht keine Rückfrage pro Datei oder Lauf.
- **Ein eindeutiger Abschluss:** Erst eine lokal belegte sichtbare Oberfläche
  schließt die Präsentationsreservation. Das Fenster öffnet den konkreten
  `Lauf-*`-Ordner und bietet bei ausstehendem Export genau eine Reparaturaktion.
- **Ein Review:** Das gemeinsame Reviewmodell bleibt plattformneutral; jeder
  freigegebene Zielhost benötigt nur einen lokalen Adapter, der alle offenen
  Entscheidungen in einer Oberfläche und mit einer Schlussfreigabe darstellt.
  Einzelne Dialoge je Treffer sind lediglich ein Engineering-Fallback und kein
  freigegebener Sollweg.
- **Sichtbarer Fortschritt ohne Interaktion:** Lange Stapel zeigen nur lokale,
  inhaltsfreie Zähler. Bereits eindeutige Ergebnisse dürfen nach eigenständigem
  Architekturentscheid in denselben Laufordner projiziert werden; der Ordner
  kennzeichnet den Stapel bis zum letzten Review weiterhin als unvollständig.

Dieses Zielbild beschreibt zwei Endnutzerprodukte mit genau einem gemeinsamen
DataSecure-Core. Das Plugin übersetzt MCP-/Cowork-Aufrufe, Standalone übersetzt
lokale UI-Aktionen. Produktdaten und Handoffzustände bleiben strikt getrennt.

### Standalone- und Konvertersequenz nach DS-075

Diese Sequenz ist als Windows-Engineering-Vertikalschnitt ausführbar.
Implementiert sind Tauri-Hülle, nativer Datei-/Ordnerpicker, Node-Application-
Service, strenge UI-Projektion, privater längengerahmter Dispatcher,
Sidecar-Lebensdauer und Zielkatalog. Der Windows-Prozessstart wurde geprüft.
Offen sind das selbsttragende Endnutzerpaket und die nativen macOS-/Linux-
Nachweise.

```mermaid
sequenceDiagram
  actor U as Anwender
  participant S as Standalone-UI/CLI
  participant A as Standalone-Adapter
  participant E as neutrale DataSecure-Application-API
  participant I as Admission/Snapshot
  participant M as isolierter MarkItDown-Worker
  participant P as PII/Residual-Gate
  participant V as Sammelreview/Export
  U->>S: Dateien oder Ordner wählen
  S->>A: Dateien/Ordner automatisch verarbeiten
  A->>E: startBatch(sourceKind=files|folder)
  E->>I: prüfen und versiegelten Snapshot erzeugen
  alt direkt unterstütztes Textformat
    I->>P: Content Graph
  else freigegebener Konvertertyp
    I->>M: Snapshot-Bytes über geerbtes stdin
    M-->>P: private Markdown-Repräsentation über stdout
  end
  P->>V: anonymisierte Kandidaten / Mehrdeutigkeiten
  V-->>U: ein Review oder klarer Abschluss
```

MarkItDown darf die Engine weder umgehen noch selbst ein Format freigeben. Ein
noch personenbezogenes Konvertat ist kein Ergebnisartefakt und wird nicht im
sichtbaren Dateisystem abgelegt.
