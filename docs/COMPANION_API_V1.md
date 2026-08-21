# DataSecure Companion API v1

Status: Vertrag, Job-Retention, privater IPC sowie TXT-/DOCX-Vertical-Slice mit
lokalem File Picker und bearbeitbarer Windows-Review-UI implementiert;
plattformübergreifende UI und signiertes Packaging noch nicht implementiert.

## Zweck

Der Companion ist die lokale Sicherheitsgrenze zwischen Originaldateien und Claude.
Claude darf den geführten lokalen Workflow starten, aber Jobs weder reviewen noch
überspringen noch freigeben. Diese Übergänge bleiben im privaten Companion und
benötigen den lokalen Dialogklick.

## Sicherheitsvertrag

- Job-IDs und lokale Action-IDs sind zufällige UUIDs.
- Das Journal enthält keine Dateinamen, Pfade, Rohwerte, Dokumenttexte oder
  Identitätsmappings.
- Jeder Zustandswechsel ist ein neues, exklusiv geschriebenes Ereignis. Bestehende
  Ereignisse werden nicht überschrieben.
- Lücken, Zusatzfelder, manipulierte Sequenzen oder unzulässige Übergänge blockieren
  den Job.
- `Reviewed`, `Skipped` und `Cancelled` benötigen eine lokale Nutzeraktion mit
  `channel=local_companion`.
- `Verified` verwendet ausschließlich den begrenzten Claim „Die unterstützten
  Prüfungen fanden keine weiteren Treffer“ und kennzeichnet, ob der Verifier
  heterogen oder noch eingeschränkt ist.
- `Released` ist nur nach `Verified` möglich und wird an den SHA-256 des Outputs
  gebunden.
- Claude erhält später nur den datensparsamen Jobstatus und veröffentlichte Outputs.
- Das Jobjournal nutzt dieselbe Aufbewahrungsfrist wie Outputs. Abgelaufene Jobs
  werden beim Serverstart entfernt; bei `retention_days=0` sind sie beim nächsten
  Cleanup-Lauf fällig.
- „Jetzt löschen“ ist als interne Companion-Funktion implementiert und verlangt eine
  exakte lokale Action-ID. Sie ist absichtlich kein MCP-Tool und damit nicht durch
  Claude auslösbar.
- Gelöscht werden ausschließlich direkte UUID-Jobordner mit regulären, nummerierten
  Journaldateien. Symlinks, Unterordner und unbekannte Einträge bleiben unangetastet
  und werden nur als datensparsame Fehlerzähler gemeldet.

## Zustandsautomat

```text
Created -> Claimed -> Extracted -> Detected -> Reviewed -> Verified -> Released
                                            \-> Skipped  -> Verified -> Released

Jeder nicht terminale Zustand -> Failed
Ausgewählte aktive Zustände    -> Cancelled (nur lokale Nutzeraktion)
```

`Released`, `Failed` und `Cancelled` sind terminal.

## Datensparsamer Status

Der Status enthält nur:

- API-Version, Job-ID, Zustand und Sequenz
- Erstellungs-/Änderungszeit
- fachliches Profil und Formatklasse
- `review_channel=local_companion_only`
- `model_can_review=false`, `model_can_release=false`
- `raw_content_available=false`

## Implementierter Review-Vertrag

- Der flüchtige Entwurf verwendet `data-secure-text-review/2`.
- Heuristisch erkannte Spannen erhalten wertfreie `text:v1:*`-Hinweise mit Typ und
  Offset im normalisierten lokal extrahierten Text. Sie sind noch keine stabilen
  Extractor-/OOXML-Source-Locatoren und werden weder persistiert noch an MCP zurückgegeben.
- Die UI akzeptiert nur zusätzliche Offset-Ersetzungen, keine freie Textbearbeitung.
  Die daraus erzeugte Fassung wird vor `Verified` erneut gegen direkte
  Identifikatoren und das flüchtige Ersetzungswörterbuch geprüft.
- `Reviewed`/`Skipped` bindet die lokale Aktion an den SHA-256 des freigegebenen
  bereinigten Textkörpers; `Released` bindet anschließend das vollständige Paket an
  seinen Output-SHA-256.
- Abbruch veröffentlicht nichts; technische/visuelle Unsicherheit bleibt unabhängig
  von Review oder Skip gesperrt.
- Nicht unterstützte inhaltsfähige DOCX-Parts werden durch eine Coverage-Prüfung
  blockiert, statt still aus der Arbeitsfassung zu verschwinden.
- Verwaiste private Arbeitskopien besitzen eine datensparsame Prozess-Ownerdatei und
  werden bei einem späteren Start/Lauf sicher bereinigt. Unsichere Einträge oder
  Bereinigungsfehler werden nicht übergangen.

## Nächster Implementierungsschritt

1. Menschliche Windows-Usability-Abnahme ergänzen und Review-Oberfläche
   plattformübergreifend bereitstellen. Der native Windows-Formularpfad ist bereits
   automatisiert mit synthetischen Daten abgenommen.
2. Replacement-Provenienz und Source-Locatoren aus dem tatsächlichen TXT-/OOXML-Extractor ergänzen.
3. PDF erst nach belegter Page-/Content-/Font-/Unicode-/Visual-Coverage in den privaten Dialog oder die Input-Veröffentlichung aufnehmen; der Regex-basierte Lite-Parser ist seit RC20 in beiden Produktpfaden gesperrt.
4. Companion-Packaging signieren und Installationsherkunft nachweisen.
